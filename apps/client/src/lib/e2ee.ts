// E2EE for ephemeral DMs (expiresAt != null).
//
// priv = argon2id(password, identity). deterministic, heap-only,
// never persisted/sent. wiped on refresh; rederived on manual login
// (auto-login replays JWT only => no password => no priv => "expired").
//
// "ephemeral" = server TTL, not forward secrecy: password holder can
// always rederive and read still-live msgs.

import { canonicalIdentity } from '@caesar/shared';
import { x25519 } from '@noble/curves/ed25519.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64ToBytes, bytesToBase64 } from './base64';

// argon2id params. matches `.e2ee.ts` spec. cost is paid once per login
// in a worker-free path; keep it bearable but not trivially brute-forceable.
const ARGON2 = { t: 3, m: 64 * 1024, p: 1, dkLen: 32 };

// session-only state. cleared on logout via clearPriv().
let myPriv: Uint8Array | null = null;
let myPubB64: string | null = null;

const setPriv = (priv: Uint8Array) => {
    myPriv = priv;
    myPubB64 = bytesToBase64(x25519.getPublicKey(priv));
};

const clearPriv = () => {
    myPriv = null;
    myPubB64 = null;
};

const hasPriv = () => myPriv !== null;

// base64 of our X25519 public key, or null if no priv loaded.
// idempotent register: caller can fire this at any auth checkpoint.
const getMyPubB64 = () => myPubB64;

// === deterministic keypair derivation ========================================

const derivePriv = (password: string, identity: string): Uint8Array => {
    // canonicalIdentity matches the server's /login zod transform; any
    // drift between client + server breaks deterministic derivation.
    const salt = sha256(new TextEncoder().encode(canonicalIdentity(identity)));
    return argon2id(password, salt, ARGON2);
};

const derivePub = (priv: Uint8Array): Uint8Array => x25519.getPublicKey(priv);

// Derive priv from password+identity and verify it matches the user's
// registered pub. Sets priv on match. expectedPubB64=null skips the check
// (use only when the user has no pub registered yet).
const tryDeriveAndSet = (
    password: string,
    identity: string,
    expectedPubB64: string | null
): boolean => {
    const priv = derivePriv(password, identity);
    const pubB64 = bytesToBase64(x25519.getPublicKey(priv));
    if (expectedPubB64 !== null && pubB64 !== expectedPubB64) return false;
    setPriv(priv);
    return true;
};

// === per-DM symmetric key (HKDF over ECDH shared secret) =====================

const dmKey = async (
    peerPub: Uint8Array,
    uidA: number,
    uidB: number
): Promise<CryptoKey> => {
    if (!myPriv) throw new Error('e2ee: no private key in session');

    const shared = x25519.getSharedSecret(myPriv, peerPub);
    const info = new TextEncoder().encode(
        `dm:${Math.min(uidA, uidB)}:${Math.max(uidA, uidB)}`
    );

    const base = await crypto.subtle.importKey('raw', shared, 'HKDF', false, [
        'deriveKey'
    ]);

    return crypto.subtle.deriveKey(
        { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(), info },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

// === seal / open =============================================================

// output format: nonce(12) || ciphertext, base64. fits messages.content TEXT.
const seal = async (key: CryptoKey, plaintext: string): Promise<string> => {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce },
        key,
        new TextEncoder().encode(plaintext)
    );
    const out = new Uint8Array(nonce.length + ct.byteLength);
    out.set(nonce, 0);
    out.set(new Uint8Array(ct), nonce.length);
    return bytesToBase64(out);
};

const open = async (key: CryptoKey, payloadB64: string): Promise<string> => {
    const payload = base64ToBytes(payloadB64);
    const nonce = payload.slice(0, 12);
    const ct = payload.slice(12);
    const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce },
        key,
        ct
    );
    return new TextDecoder().decode(pt);
};

export {
    clearPriv,
    derivePriv,
    derivePub,
    dmKey,
    getMyPubB64,
    hasPriv,
    open,
    seal,
    setPriv,
    tryDeriveAndSet
};
