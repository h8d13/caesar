// Modulo bias (256 % 62 = 8): 8 chars come up at 5/256 instead of 4/256.
// Negligible for invite codes: a 24-char code keeps ~142.8 of 142.9 bits.
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
