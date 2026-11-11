import { randomBytes } from 'crypto';

// Time-ordered UUID (v7, RFC 9562): 48-bit unix ms timestamp, then 74
// random bits around the version (7) and variant (10) fields.
const randomUUIDv7 = (): string => {
  const bytes = randomBytes(16);

  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  const hex = bytes.toString('hex');

  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

export { randomUUIDv7 };
