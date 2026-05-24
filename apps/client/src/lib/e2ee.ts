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

// argon2id params. cost is paid once per login; bearable for users, not
// trivially brute-forceable. Vitest sets MODE=test so the test suite uses
// near-zero params (correctness, not strength). Vite production builds set
// MODE=production and dead-code-eliminate the test branch.
const ARGON2 =
    import.meta.env.MODE === 'test'
        ? { t: 1, m: 256, p: 1, dkLen: 32 }
        : { t: 3, m: 64 * 1024, p: 1, dkLen: 32 };

// session-only state. cleared on logout via clearPriv().
let myPriv: Uint8Array | null = null;
let myPubB64: string | null = null;

// React-observable change notification. Bumped on every priv mutation so
// useSyncExternalStore-based consumers (see usePriv() below) re-render
// when the in-session re-derive flips priv from null to set. Without
// this, components that called hasPriv() during render kept their stale
// "no priv" enabled flags and existing "expired" message bubbles never
// re-tried decryption after the password-prompt dialog.
let privVersion = 0;
const privListeners = new Set<() => void>();

const notifyPrivChange = () => {
    privVersion++;
    privListeners.forEach((listener) => listener());
};

const subscribePriv = (listener: () => void) => {
    privListeners.add(listener);
    return () => {
        privListeners.delete(listener);
    };
};

const getPrivVersion = () => privVersion;

const setPriv = (priv: Uint8Array) => {
    myPriv = priv;
    myPubB64 = bytesToBase64(x25519.getPublicKey(priv));
    notifyPrivChange();
};

const clearPriv = () => {
    myPriv = null;
    myPubB64 = null;
    terminateWorker();
    notifyPrivChange();
};

const hasPriv = () => myPriv !== null;

// base64 of our X25519 public key, or null if no priv loaded.
// idempotent register: caller can fire this at any auth checkpoint.
const getMyPubB64 = () => myPubB64;

// deterministic keypair derivation
const derivePriv = (password: string, identity: string): Uint8Array => {
    // canonicalIdentity matches the server's /login zod transform; any
    // drift between client + server breaks deterministic derivation.
    const salt = sha256(new TextEncoder().encode(canonicalIdentity(identity)));
    return argon2id(password, salt, ARGON2);
};

const derivePub = (priv: Uint8Array): Uint8Array => x25519.getPublicKey(priv);

// Derive priv from password+identity and verify it matches the user's
// worker-backed async derivation (avoids freezing the main thread)
//
// argon2id with the params above blocks 1-5s depending on the machine.
// On the login flow that block translates to a frozen UI; if the user
// is on a slow device or the tab is throttled it can read as "hang".
// The worker computes off-thread; callers await a Promise.
//
// Sync derivePriv() above stays available for tests + any caller that
// genuinely needs synchronous behavior. UI callers should prefer
// derivePrivAsync / tryDeriveAndSetAsync.

let _worker: Worker | null = null;
let _workerSeq = 0;
const _workerPending = new Map<
    number,
    {
        resolve: (priv: Uint8Array) => void;
        reject: (err: Error) => void;
    }
>();

const terminateWorker = () => {
    if (!_worker) return;
    _worker.terminate();
    _worker = null;
    for (const p of _workerPending.values())
        p.reject(new Error('worker terminated'));
    _workerPending.clear();
};

const getWorker = (): Worker => {
    if (_worker) return _worker;

    _worker = new Worker(new URL('./e2ee.worker.ts', import.meta.url), {
        type: 'module'
    });
    _worker.onmessage = (
        e: MessageEvent<{ id: number; priv?: Uint8Array; error?: string }>
    ) => {
        const pending = _workerPending.get(e.data.id);
        if (!pending) return;
        _workerPending.delete(e.data.id);
        if (e.data.error) pending.reject(new Error(e.data.error));
        else if (e.data.priv) pending.resolve(e.data.priv);
        // Release worker once the queue drains. Respawn is cheap; the
        // bundle is small and derive runs rarely (login + re-prompt).
        if (_workerPending.size === 0) terminateWorker();
    };
    _worker.onerror = (e) => {
        for (const p of _workerPending.values()) p.reject(new Error(e.message));
        _workerPending.clear();
        _worker?.terminate();
        _worker = null;
    };

    return _worker;
};

const derivePrivAsync = (
    password: string,
    identity: string
): Promise<Uint8Array> =>
    new Promise((resolve, reject) => {
        const id = ++_workerSeq;
        _workerPending.set(id, { resolve, reject });
        getWorker().postMessage({
            id,
            password,
            identityCanonical: canonicalIdentity(identity),
            params: ARGON2
        });
    });

const tryDeriveAndSetAsync = async (
    password: string,
    identity: string,
    expectedPubB64: string | null
): Promise<boolean> => {
    const priv = await derivePrivAsync(password, identity);
    const pubB64 = bytesToBase64(x25519.getPublicKey(priv));
    if (expectedPubB64 !== null && pubB64 !== expectedPubB64) return false;
    setPriv(priv);
    return true;
};

// per-DM symmetric key (HKDF over ECDH shared secret)
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
        {
            name: 'HKDF',
            hash: 'SHA-256',
            salt: new TextEncoder().encode('caesar-dm-v1'),
            info
        },
        base,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
};

// seal / open
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

// binary variants of seal/open. same nonce(12)||ciphertext framing as
// the text helpers, just over raw bytes. used by the encrypted-attachment
// path: payload stays opaque on disk + over the wire. casts via
// BufferSource are needed because Uint8Array's generic buffer type can
// be ArrayBufferLike (incl. SharedArrayBuffer) which WebCrypto rejects.
const sealBytes = async (
    key: CryptoKey,
    plaintext: Uint8Array
): Promise<Uint8Array> => {
    const nonce = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource },
        key,
        plaintext as BufferSource
    );
    const out = new Uint8Array(nonce.length + ct.byteLength);
    out.set(nonce, 0);
    out.set(new Uint8Array(ct), nonce.length);
    return out;
};

const openBytes = async (
    key: CryptoKey,
    payload: Uint8Array
): Promise<Uint8Array> => {
    const nonce = payload.slice(0, 12);
    const ct = payload.slice(12);
    const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: nonce as BufferSource },
        key,
        ct as BufferSource
    );
    return new Uint8Array(pt);
};

export {
    clearPriv,
    derivePriv,
    derivePrivAsync,
    derivePub,
    dmKey,
    getMyPubB64,
    getPrivVersion,
    hasPriv,
    open,
    openBytes,
    seal,
    sealBytes,
    setPriv,
    subscribePriv,
    tryDeriveAndSetAsync
};
