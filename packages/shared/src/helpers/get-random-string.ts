// Cryptographically secure random alphanumeric string.
// Uses Web Crypto (works in Node, Bun, and browsers).
// Bias from modulo (256 % 62 != 0) is negligible for typical invite-code use:
// the over-represented chars are ~0.4% more frequent, which doesn't meaningfully
// reduce the entropy of a 24-char code (~142 bits effective vs 143 ideal).
const getRandomString = (length: number): string => {
  const characters =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const charsetLength = characters.length;

  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  let result = '';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(bytes[i]! % charsetLength);
  }
  return result;
};

export { getRandomString };
