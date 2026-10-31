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

export { toCloseReason };
