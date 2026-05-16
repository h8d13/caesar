import crypto from 'crypto';
import { getServerTokenSync } from '../db/queries/server';

// Stable per-server HMAC of an IP address. Same IP → same 16-char hash on this
// server. Different servers → unlinkable hashes. Used for stored audit/login
// records so we can detect "same client did action X then Y" without keeping
// raw IPs (or geolocating them) on disk.
//
// Truncated to 16 hex chars (64 bits): collisions are statistically impossible
// at human scale, and shorter rows are nicer to render.
const hashIp = (ip: string | null | undefined): string | null => {
  if (!ip) return null;

  return crypto
    .createHmac('sha256', getServerTokenSync())
    .update(ip)
    .digest('hex')
    .slice(0, 16);
};

export { hashIp };
