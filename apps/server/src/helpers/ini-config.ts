import { parse } from 'ini';
import z from 'zod';
import { deepMerge } from './deep-merge';

// Rate-limiter policy from config.ini. The file is operator input only: the
// server reads it, never writes it, so it can be a read-only mount. Missing
// keys fall back to the defaults below; unknown keys (typos, removed
// limiters) are an error rather than silently ignored.

const zRateLimiter = z.strictObject({
  maxRequests: z.coerce.number().int().positive(),
  windowMs: z.coerce.number().int().positive()
});

type TRateLimiter = z.infer<typeof zRateLimiter>;

// One entry per limiter. The ini schema is derived from these keys, so a
// new limiter is a single entry here (plus its commented line in config.ini).
const rateLimiterDefaults = {
  sendAndEditMessage: { maxRequests: 15, windowMs: 60_000 },
  joinVoiceChannel: { maxRequests: 20, windowMs: 60_000 },
  login: { maxRequests: 5, windowMs: 60_000 },
  joinServer: { maxRequests: 5, windowMs: 60_000 },
  signalTyping: { maxRequests: 40, windowMs: 5_000 },
  getMessages: { maxRequests: 60, windowMs: 10_000 },
  markAsRead: { maxRequests: 60, windowMs: 10_000 },
  toggleMessageReaction: { maxRequests: 60, windowMs: 10_000 },
  addEmoji: { maxRequests: 10, windowMs: 60_000 },
  openDirectMessage: { maxRequests: 10, windowMs: 60_000 },
  handshake: { maxRequests: 10, windowMs: 60_000 },
  publicFile: { maxRequests: 120, windowMs: 60_000 },
  updatePassword: { maxRequests: 5, windowMs: 60_000 },
  resetPassword: { maxRequests: 5, windowMs: 60_000 },
  uploadFile: { maxRequests: 20, windowMs: 60_000 },
  searchMessages: { maxRequests: 20, windowMs: 60_000 },
  deleteMessage: { maxRequests: 30, windowMs: 60_000 },
  toggleMessagePin: { maxRequests: 30, windowMs: 60_000 },
  toggleMessageScVote: { maxRequests: 30, windowMs: 60_000 },
  voteSocialCredit: { maxRequests: 20, windowMs: 60_000 },
  renameIdentity: { maxRequests: 5, windowMs: 60_000 },
  addInvite: { maxRequests: 10, windowMs: 60_000 },
  changeAvatar: { maxRequests: 10, windowMs: 60_000 },
  changeBanner: { maxRequests: 10, windowMs: 60_000 },
  playSoundboard: { maxRequests: 30, windowMs: 60_000 }
} satisfies Record<string, TRateLimiter>;

type TRateLimiterName = keyof typeof rateLimiterDefaults;

const zIniConfig = z.strictObject({
  rateLimiters: z.strictObject(
    Object.fromEntries(
      Object.keys(rateLimiterDefaults).map((name) => [name, zRateLimiter])
    ) as Record<TRateLimiterName, typeof zRateLimiter>
  ),
  // Failed-login lockout: escalating, IP-keyed, sits behind the login
  // burst limiter. After maxFailures failures inside windowMs the IP is locked
  // for baseLockMs, doubling per extra failure up to maxLockMs.
  loginLockout: z.strictObject({
    maxFailures: z.coerce.number().int().positive(),
    windowMs: z.coerce.number().int().positive(),
    baseLockMs: z.coerce.number().int().positive(),
    maxLockMs: z.coerce.number().int().positive()
  })
});

type TIniConfig = z.infer<typeof zIniConfig>;

const iniDefaults: TIniConfig = {
  rateLimiters: rateLimiterDefaults,
  loginLockout: {
    maxFailures: 10,
    windowMs: 15 * 60_000, // 15 minutes
    baseLockMs: 5 * 60_000, // 5 minutes
    maxLockMs: 60 * 60_000 // 1 hour
  }
};

// Throws with every offending key listed, so a bad file fails the boot
// instead of running on half-applied settings.
const parseIniConfig = (text: string): TIniConfig => {
  const fromFile = parse(text) as Partial<TIniConfig>;
  const result = zIniConfig.safeParse(deepMerge(iniDefaults, fromFile));

  if (!result.success) {
    throw new Error(`invalid config.ini:\n${z.prettifyError(result.error)}`);
  }

  return result.data;
};

export { iniDefaults, parseIniConfig };
