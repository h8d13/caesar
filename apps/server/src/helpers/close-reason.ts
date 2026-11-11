import { WebSocket } from 'ws';

// RFC 6455 caps a close frame reason at 123 bytes and ws throws RangeError
// past it. Cut on a code point so multi-byte text never splits mid-char.
const MAX_CLOSE_REASON_BYTES = 123;

const toCloseReason = (reason = ''): string => {
  let bytes = 0;
  let out = '';

  for (const char of reason) {
    bytes += Buffer.byteLength(char);

    if (bytes > MAX_CLOSE_REASON_BYTES) break;

    out += char;
  }

  return out;
};

// ws waits closeTimeout (30s) for the peer to answer a close frame. A
// client that never answers would keep its socket, its subscriptions and
// its voice transports for that long after a kick, ban or revocation:
// give it a moment to close cleanly, then drop the connection.
const CLOSE_GRACE_MS = 2_000;

const closeSocket = (ws: WebSocket, code: number, reason = ''): void => {
  ws.close(code, toCloseReason(reason));

  setTimeout(() => {
    if (ws.readyState !== WebSocket.CLOSED) ws.terminate();
  }, CLOSE_GRACE_MS).unref();
};

export { closeSocket, toCloseReason };
