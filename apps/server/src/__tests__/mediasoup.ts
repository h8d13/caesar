import { config } from '../config';
import { loadMediasoup } from '../utils/mediasoup';

// The suites that need the mediasoup native worker load it through here,
// not the global setup, so only their forks bind a WebRTC port. Forks run
// in parallel and keep their module graph across files (isolate: false):
// - once per fork: a second load in the same fork would add a second
//   worker under the same index, and routers would end up on one worker
//   with the WebRtcServer of the other
// - a port per fork: two forks loading it would bind the same one
let loading: Promise<void> | undefined;

const loadTestMediasoup = () =>
  (loading ??= (async () => {
    config.webRtc.port += Number(process.env.VITEST_POOL_ID ?? 0) * 10;

    await loadMediasoup();
  })());

export { loadTestMediasoup };
