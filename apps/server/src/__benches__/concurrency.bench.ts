import { test } from 'vite-plus/test';
import {
  connectUsers,
  GENERAL_CHANNEL_ID,
  growServer,
  type TCaller,
  withBaseline
} from './fixtures';

// N distinct users firing the same procedure at once. One libsql connection
// serializes writes, so the compare table shows where requests queue
// instead of overlapping: flat latency = parallel, N-times = serialized.

const LEVELS = [1, 10, 50];
// tinybench's default floor of 64 samples makes 50x joinServer alone ~20s;
// 20 still gives a stable mean/p99 for bursts this long
const RUN_OPTIONS = { iterations: 20, time: 500 };

const ACTIONS: Record<string, (c: TCaller) => Promise<unknown>> = {
  'messages.send': (c) =>
    c.messages.send({
      channelId: GENERAL_CHANNEL_ID,
      content: '<p>bench message</p>'
    }),
  'messages.get': (c) => c.messages.get({ channelId: GENERAL_CHANNEL_ID }),
  joinServer: async (c) => {
    const { handshakeHash } = await c.others.handshake();

    await c.others.joinServer({ handshakeHash });
  }
};

// many sequential bench runs: well past the 30s test default
test('concurrent users', { timeout: 300_000 }, async ({ bench }) => {
  const ids = await growServer();
  const callers = await connectUsers(ids.slice(0, Math.max(...LEVELS)));

  for (const [name, action] of Object.entries(ACTIONS)) {
    await bench.compare(
      ...LEVELS.flatMap((n) =>
        withBaseline(bench, `${n}x ${name}`, () =>
          Promise.all(callers.slice(0, n).map(action))
        )
      ),
      RUN_OPTIONS
    );
  }
});
