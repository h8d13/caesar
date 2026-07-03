import {
  ActivityLogType,
  canonicalIdentity,
  DELETED_USER_IDENTITY_AND_NAME,
  IDENTITY_REGEX,
  type TJoinedUser
} from '@caesar/shared';
import {
  channelReadStates,
  invites,
  messages,
  userRoles,
  users
} from '@caesar/shared/db/schema';
import { count, eq, isNull, max, sql } from 'drizzle-orm';
import http from 'http';
import jwt from 'jsonwebtoken';
import z from 'zod';
import { config } from '../config';
import { db } from '../db';
import { publishUser } from '../db/publishers';
import { isInviteValid } from '../db/queries/invites';
import { getDefaultRole } from '../db/queries/roles';
import { getUserByIdentity } from '../db/queries/users';
import { getWsInfo } from '../helpers/get-ws-info';
import { isAtUserCap } from '../helpers/user-cap';
import { logger } from '../logger';
import { enqueueActivityLog } from '../queues/activity-log';
import { invariant } from '../utils/invariant';
import { getJwtSecret } from '../utils/jwt-secret';
import { hashPassword, verifyPassword } from '../utils/password';
import { createLoginLockout } from '../utils/rate-limiters/login-lockout';
import {
  createRateLimiter,
  getClientRateLimitKey,
  getRateLimitRetrySeconds
} from '../utils/rate-limiters/rate-limiter';
import {
  generateLoginOptions,
  hasWebauthnCredentials
} from '../utils/webauthn';
import { getJsonBody } from './helpers';
import { issueSession } from './session';
import { HttpValidationError } from './utils';

const zBody = z.object({
  identity: z
    .string()
    .transform(canonicalIdentity)
    .pipe(z.string().min(1, 'Identity must be at least 1 character long')),
  password: z
    .string()
    .min(4, 'Password must be at least 4 characters long')
    .max(128),
  invite: z.string().optional()
});

const loginRateLimiter = createRateLimiter({
  maxRequests: config.rateLimiters.joinServer.maxRequests,
  windowMs: config.rateLimiters.joinServer.windowMs
});

// Sustained-brute-force lockout (#371), layered behind the burst limiter
// above. Counts only failed credential attempts and escalates the lock per
// failure. IP-keyed; see login-lockout.ts for the design rationale.
const loginLockout = createLoginLockout({
  maxFailures: config.loginLockout.maxFailures,
  windowMs: config.loginLockout.windowMs,
  baseLockMs: config.loginLockout.baseLockMs,
  maxLockMs: config.loginLockout.maxLockMs
});

// Single opaque response for every auth-style failure (unknown identity,
// wrong invite, wrong password, reserved sentinel). Distinguishable
// responses let an attacker enumerate which usernames exist by probing
// the public /login endpoint. The specific reason is logged server-side
// for legitimate operator debugging.
const GENERIC_AUTH_ERROR =
  'Invalid credentials. Check your username/password or invite code.';

// The known-identity path always runs argon2 verify (~100-500ms). An
// unknown identity that bails before any hashing returns much faster, so
// response latency alone leaks which identities exist. Burn an equivalent
// argon2 verify against a throwaway hash on those early-exit branches to
// flatten the timing. Lazy singleton: hashed once on first miss; a rejected
// hash resets the cache so a transient failure can't become a new timing
// signal (fast 500 vs slow 400).
let dummyHashPromise: Promise<string> | null = null;
const burnTimingBudget = async (): Promise<void> => {
  if (!dummyHashPromise) {
    dummyHashPromise = hashPassword('caesar-dummy-password-for-timing').catch(
      (error) => {
        dummyHashPromise = null;
        throw error;
      }
    );
  }

  await verifyPassword('dummy', await dummyHashPromise);
};

const registerUser = async (
  identity: string,
  password: string,
  inviteCode?: string,
  inviteRoleId?: number | null,
  ip?: string
): Promise<TJoinedUser> => {
  if (!IDENTITY_REGEX.test(identity)) {
    throw new HttpValidationError(
      'identity',
      'Identity must start with a letter or number and contain only letters, numbers, _ or -.'
    );
  }

  const hashedPassword = await hashPassword(password);

  const defaultRole = await getDefaultRole();

  invariant(defaultRole, {
    code: 'NOT_FOUND',
    message: 'Default role not found'
  });

  const user = await db
    .insert(users)
    .values({
      name: identity,
      identity,
      createdAt: Date.now(),
      password: hashedPassword
    })
    .returning()
    .get();

  await db.insert(userRoles).values({
    roleId: defaultRole.id,
    userId: user.id,
    createdAt: Date.now()
  });

  // If the invite has a specific role and it's different from the default, assign it too
  if (inviteRoleId && inviteRoleId !== defaultRole.id) {
    await db.insert(userRoles).values({
      roleId: inviteRoleId,
      userId: user.id,
      createdAt: Date.now()
    });
  }

  publishUser(user.id, 'create');

  const registeredUser = await getUserByIdentity(identity);

  if (!registeredUser) {
    throw new Error('User registration failed');
  }

  if (inviteCode) {
    enqueueActivityLog({
      type: ActivityLogType.USED_INVITE,
      userId: registeredUser.id,
      details: { code: inviteCode },
      ip
    });
  }

  return registeredUser;
};

const loginRouteHandler = async (
  req: http.IncomingMessage,
  res: http.ServerResponse
) => {
  const data = zBody.parse(
    await getJsonBody(req, config.server.maxRequestBodyBytes)
  );

  if (data.identity === DELETED_USER_IDENTITY_AND_NAME) {
    logger.info(`[Auth] Login attempt with reserved identity sentinel`);
    throw new HttpValidationError('identity', GENERIC_AUTH_ERROR);
  }

  let existingUser = await getUserByIdentity(data.identity);
  const connectionInfo = getWsInfo(undefined, req);

  // Stable key for both the burst limiter and the failed-login lockout.
  // Lifted to handler scope so the lockout can be updated after the
  // credential check below.
  const lockoutKey = connectionInfo?.ip
    ? getClientRateLimitKey(connectionInfo.ip)
    : undefined;

  const recordLoginFailure = () => {
    if (lockoutKey) loginLockout.recordFailure(lockoutKey);
  };

  const recordLoginSuccess = () => {
    if (lockoutKey) loginLockout.recordSuccess(lockoutKey);
  };

  if (lockoutKey) {
    // Burst limiter first (short window, all requests). Kept ahead of the
    // lockout so the well-known "too many attempts" response is unchanged.
    const rateLimit = loginRateLimiter.consume(lockoutKey);

    if (!rateLimit.allowed) {
      logger.debug(
        `[Rate Limiter HTTP] /login rate limited for key "${lockoutKey}"`
      );

      res.setHeader(
        'Retry-After',
        getRateLimitRetrySeconds(rateLimit.retryAfterMs)
      );
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Too many login attempts. Please try again shortly.'
        })
      );

      return;
    }

    // Failed-login lockout (#371): sustained brute force from this IP.
    const lockout = loginLockout.check(lockoutKey);

    if (lockout.locked) {
      logger.info(`[Auth] /login locked out for key "${lockoutKey}"`);

      res.setHeader(
        'Retry-After',
        getRateLimitRetrySeconds(lockout.retryAfterMs)
      );
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          error: 'Too many failed login attempts. Please try again later.'
        })
      );

      return;
    }
  } else {
    logger.warn(
      '[Rate Limiter HTTP] Missing IP address in request info, skipping rate limiting for /login route.'
    );
  }

  if (!existingUser) {
    let inviteRoleId: number | null = null;

    // Bootstrap: first user when DB is empty signs up without invite (becomes admin via seeded role assignment).
    // Otherwise: signup requires a valid invite.
    const userCount =
      (await db.select({ c: count() }).from(users).get())?.c ?? 0;
    const isBootstrap = userCount === 0;

    if (!isBootstrap) {
      // Enforce cap before invite consumption so a valid invite isn't
      // "spent" on a rejected signup. Bootstrap path above already
      // bypasses, so cap=1 still lets the first admin in.
      if (await isAtUserCap()) {
        logger.info(
          `[Auth] Signup blocked for "${data.identity}": user cap reached (IP: ${connectionInfo?.ip || 'unknown'})`
        );
        throw new HttpValidationError(
          'invite',
          'This instance has reached its user limit.'
        );
      }

      const result = await isInviteValid(data.invite);

      if (result.error) {
        await burnTimingBudget();

        recordLoginFailure();

        logger.info(
          `[Auth] Signup failed for "${data.identity}": ${result.error} (IP: ${connectionInfo?.ip || 'unknown'})`
        );
        throw new HttpValidationError('identity', GENERIC_AUTH_ERROR);
      }

      if (result.invite) {
        inviteRoleId = result.invite.roleId ?? null;

        await db
          .update(invites)
          .set({
            uses: sql`${invites.uses} + 1`
          })
          .where(eq(invites.code, data.invite!))
          .execute();
      }
    }

    existingUser = await registerUser(
      data.identity,
      data.password,
      data.invite,
      inviteRoleId,
      connectionInfo?.ip
    );

    // mark all existing messages as read so the new user doesn't see
    // a flood of unread messages on first join
    const latestMessagePerChannel = await db
      .select({
        channelId: messages.channelId,
        latestMessageId: max(messages.id)
      })
      .from(messages)
      .where(isNull(messages.parentMessageId))
      .groupBy(messages.channelId);

    const readStateValues = latestMessagePerChannel
      .filter((row) => row.latestMessageId !== null)
      .map((row) => ({
        channelId: row.channelId,
        userId: existingUser!.id,
        lastReadMessageId: row.latestMessageId!,
        lastReadAt: Date.now()
      }));

    if (readStateValues.length > 0) {
      await db.insert(channelReadStates).values(readStateValues);
    }
  }

  const passwordMatches = await verifyPassword(
    data.password,
    existingUser.password
  );

  if (!passwordMatches) {
    recordLoginFailure();

    logger.info(
      `[Auth] Failed login for "${existingUser.identity}" (IP: ${connectionInfo?.ip || 'unknown'})`
    );

    throw new HttpValidationError('identity', GENERIC_AUTH_ERROR);
  }

  // Correct credentials: clear any accumulated failures for this IP so a
  // legitimate user who mistyped earlier is not penalised. Runs even for a
  // banned user (they proved knowledge of the password, not brute force).
  recordLoginSuccess();

  // Banned state is checked AFTER password verification so an attacker
  // can't enumerate "which accounts are banned" without already knowing
  // the password. The legit user (who knows their own password) still
  // gets a useful message.
  if (existingUser.banned) {
    logger.info(
      `[Auth] Banned user login attempt: "${existingUser.identity}" reason="${existingUser.banReason || 'none'}" (IP: ${connectionInfo?.ip || 'unknown'})`
    );

    throw new HttpValidationError(
      'identity',
      `Identity banned: ${existingUser.banReason || 'No reason provided'}`
    );
  }

  // Defer session issuance to /login/2fa. sessionEpoch is intentionally
  // not bumped here: a failed 2FA must not kick existing sessions.
  if (await hasWebauthnCredentials(existingUser.id)) {
    const options = await generateLoginOptions(existingUser.id);

    invariant(options, {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'Failed to build authentication options.'
    });

    const preAuthToken = jwt.sign(
      { userId: existingUser.id, type: 'pre-2fa' },
      await getJwtSecret(),
      { expiresIn: '300s' /* 5 minutes */ }
    );

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ needs2fa: true, preAuthToken, options }));

    return res;
  }

  return issueSession(existingUser, res);
};

export { loginRouteHandler };
