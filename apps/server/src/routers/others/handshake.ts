import { randomUUIDv7 } from 'bun';
import { config } from '../../config';
import { getSettings } from '../../db/queries/server';
import { publicProcedure, rateLimitedProcedure } from '../../utils/trpc';

const handshakeRoute = rateLimitedProcedure(publicProcedure, {
  maxRequests: config.rateLimiters.handshake.maxRequests,
  windowMs: config.rateLimiters.handshake.windowMs,
  logLabel: 'handshake'
}).query(async ({ ctx }) => {
  const settings = await getSettings();
  const hasPassword = !!settings?.password;
  const handshakeHash = randomUUIDv7();

  ctx.handshakeHash = handshakeHash;

  return { handshakeHash, hasPassword };
});

export { handshakeRoute };
