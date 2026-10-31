import { test } from 'vite-plus/test';
import {
  connectUsers,
  GENERAL_CHANNEL_ID,
  growServer,
  withBaseline
} from './fixtures';

// Single-user latency of the hot procedures, in-process through the tRPC
// caller (router + middleware + zod + SQLite; no network or WS framing).
// Run: `pnpm bench` in apps/server.

// many sequential bench runs: well past the 30s test default
test('actions', { timeout: 300_000 }, async ({ bench }) => {
  const ids = await growServer();
  const [owner, member] = await connectUsers([1, ids[0]!]);

  // different work per procedure: each gets its own table (live vs
  // baseline) instead of one ranked compare across unrelated actions
  const actions: Record<string, () => Promise<unknown>> = {
    'joinServer (initial payload)': async () => {
      const { handshakeHash } = await member!.others.handshake();

      await member!.others.joinServer({ handshakeHash });
    },
    'messages.get (latest page)': () =>
      member!.messages.get({ channelId: GENERAL_CHANNEL_ID }),
    'messages.search': () => member!.messages.search({ query: 'deploy' }),
    'messages.send': () =>
      member!.messages.send({
        channelId: GENERAL_CHANNEL_ID,
        content: '<p>bench message</p>'
      }),
    'users.getAll (owner)': () => owner!.users.getAll()
  };

  for (const [name, fn] of Object.entries(actions)) {
    const [first, ...rest] = withBaseline(bench, name, fn);

    // compare needs two entries; without a stored baseline just run it
    await (rest.length > 0 ? bench.compare(first!, ...rest) : first!.run());
  }
});
