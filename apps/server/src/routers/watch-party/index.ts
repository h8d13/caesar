import { ServerEvents } from '@caesar/shared';
import { protectedProcedure, t } from '@server/utils/trpc';
import z from 'zod';

// Single shared watch-party state for this server instance. In memory: a watch
// party is ephemeral, so it resets on restart by design (no persistence).
type TWatchPartyState = {
  videoId: string | null;
  setByUserId: number | null;
  updatedAt: number;
};

let state: TWatchPartyState = {
  videoId: null,
  setByUserId: null,
  updatedAt: 0
};

// Pull the 11-char video id out of the common YouTube URL shapes (watch?v=,
// youtu.be/, /live/, /embed/, /shorts/) or accept a bare id. null = no match.
const parseYoutubeId = (input: string): string | null => {
  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /\/live\/([a-zA-Z0-9_-]{11})/,
    /\/embed\/([a-zA-Z0-9_-]{11})/,
    /\/shorts\/([a-zA-Z0-9_-]{11})/
  ];

  for (const re of patterns) {
    const match = input.match(re);
    if (match) return match[1] ?? null;
  }

  const trimmed = input.trim();
  return /^[a-zA-Z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
};

const getStateRoute = protectedProcedure.query(() => state);

const setUrlRoute = protectedProcedure
  .input(z.object({ url: z.string().trim().min(1).max(500) }))
  .mutation(({ ctx, input }) => {
    const videoId = parseYoutubeId(input.url);

    if (!videoId) {
      ctx.throwValidationError('url', 'Not a recognizable YouTube link');
    }

    state = { videoId, setByUserId: ctx.userId, updatedAt: Date.now() };
    ctx.pubsub.publish(ServerEvents.WATCH_PARTY_UPDATE, state);

    return state;
  });

const clearRoute = protectedProcedure.mutation(({ ctx }) => {
  state = { videoId: null, setByUserId: null, updatedAt: Date.now() };
  ctx.pubsub.publish(ServerEvents.WATCH_PARTY_UPDATE, state);

  return state;
});

// Global publish/subscribe pair: the watch party is server-wide, so every
// connected client listens regardless of channel/user.
const onUpdateRoute = protectedProcedure.subscription(({ ctx }) => {
  return ctx.pubsub.subscribe(ServerEvents.WATCH_PARTY_UPDATE);
});

export const watchPartyRouter = t.router({
  getState: getStateRoute,
  setUrl: setUrlRoute,
  clear: clearRoute,
  onUpdate: onUpdateRoute
});
