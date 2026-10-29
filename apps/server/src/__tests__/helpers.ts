import { Permission, UploadHeaders } from '@caesar/shared';
import { roles, users } from '@caesar/shared/db/schema';
import { db } from '@server/db';
import { getJwtSecret } from '@server/utils/jwt-secret';
import { deriveAuthKey } from '@server/utils/password';
import { eq } from 'drizzle-orm';
import jwt from 'jsonwebtoken';
import { appRouter } from '../routers';
import { createMockContext } from './context';
import { testsBaseUrl } from './setup';

const getMockedToken = async (userId: number) => {
  // mirror the current sessionEpoch so tests that interleave manual
  // tokens with real /login calls (which bump the epoch) don't get
  // rejected by getUserByToken's epoch check.
  const row = await db
    .select({ sessionEpoch: users.sessionEpoch })
    .from(users)
    .where(eq(users.id, userId))
    .get();

  const token = jwt.sign(
    { userId, sessionEpoch: row?.sessionEpoch ?? 0 },
    await getJwtSecret(),
    { expiresIn: '86400s' }
  );

  return token;
};

const getCaller = async (userId: number) => {
  const mockedToken = await getMockedToken(userId);

  const caller = appRouter.createCaller(
    await createMockContext({
      customToken: mockedToken
    })
  );

  return { caller, mockedToken };
};

// this will basically simulate a specific user connecting to the server
const initTest = async (userId: number = 1) => {
  const { caller, mockedToken } = await getCaller(userId);
  const { handshakeHash } = await caller.others.handshake();

  const initialData = await caller.others.joinServer({
    handshakeHash: handshakeHash
  });

  return { caller, mockedToken, initialData };
};

// derives the authKey like the client does; the password never goes out
const login = async (identity: string, password: string, invite?: string) =>
  fetch(`${testsBaseUrl}/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      identity,
      authKey: await deriveAuthKey(password, identity),
      invite
    })
  });

// the session token only ever comes back as the HttpOnly cookie
const getSessionCookie = (res: Response) =>
  res.headers
    .getSetCookie()
    .find((c) => c.startsWith('caesar-session='))
    ?.split(';')[0]!
    .slice('caesar-session='.length);

const loginToken = async (identity: string, password: string) => {
  const token = getSessionCookie(await login(identity, password));

  if (!token) throw new Error(`login failed for ${identity}`);

  return token;
};

const uploadFile = async (file: File, token: string) =>
  fetch(`${testsBaseUrl}/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      [UploadHeaders.TYPE]: file.type,
      [UploadHeaders.CONTENT_LENGTH]: file.size.toString(),
      [UploadHeaders.ORIGINAL_NAME]: file.name,
      [UploadHeaders.TOKEN]: token
    },
    body: file
  });

// Stand up a non-owner moderator: user 2 gets a fresh role carrying only the
// listed permissions, then acts via their own caller. `initTest(2)` must run
// AFTER the role is assigned so the permission middleware sees it live.
const makeModerator = async (
  ownerCaller: Awaited<ReturnType<typeof initTest>>['caller'],
  permissions: Permission[] = [Permission.MANAGE_USERS]
) => {
  const roleId = await ownerCaller.roles.add();

  await ownerCaller.roles.update({
    roleId,
    name: 'Moderator',
    color: '#123456',
    permissions,
    storageQuotaOverrideEnabled: false,
    storageSpaceQuota: 0
  });

  await ownerCaller.users.addRole({ userId: 2, roleId });

  return initTest(2);
};

const getRoleIdByName = async (name: string) => {
  const role = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, name))
    .get();

  return role!.id;
};

export {
  getCaller,
  getMockedToken,
  getRoleIdByName,
  getSessionCookie,
  initTest,
  login,
  loginToken,
  makeModerator,
  uploadFile
};
