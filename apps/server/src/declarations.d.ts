import 'ws';

declare module 'ws' {
  interface WebSocket {
    userId?: number;
    token: string;
  }
}

declare global {
  var disableRateLimiting: boolean | undefined;
}

declare module 'bun' {
  interface Env {
    // CAESAR_ prefixed environment variables
    CAESAR_PORT?: string;
    CAESAR_DEBUG?: string;
    CAESAR_WEBRTC_PORT?: string;
    CAESAR_WEBRTC_ANNOUNCED_ADDRESS?: string;
  }
}

declare module 'node:fs/promises' {
  export function exists(path: import('node:fs').PathLike): Promise<boolean>;
}

declare module 'fs/promises' {
  export function exists(path: import('node:fs').PathLike): Promise<boolean>;
}
