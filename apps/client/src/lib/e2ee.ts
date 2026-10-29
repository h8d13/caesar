// E2EE for ephemeral DMs (expiresAt != null).
//
// priv = argon2id(password, identity). deterministic, heap-only,
// never sent. derived at manual login before the session starts, so it is
// fixed for the session's lifetime. auto-login resumes the session cookie
// only => no password, so priv comes back via the session key below (sealed blob here,
// wrap key on the server); without both, ephemeral DMs stay locked until the
// user logs out and back in.
//
// "ephemeral" = server TTL, not forward secrecy: password holder can
// always rederive and read still-live msgs.
//
// the server authenticates with authKey = HKDF(priv), so it never sees the
// password and can't derive priv from what it receives.

import { getUrlFromServer } from '@/helpers/get-file-url';
import {
    getLocalStorageItem,
    LocalStorageKey,
    removeLocalStorageItem,
    setLocalStorageItem
} from '@/helpers/storage';
import {
    AUTH_KEY_INFO,
    canonicalIdentity,
    PASSWORD_KDF,
    PASSWORD_KDF_TEST
} from '@caesar/shared';
import { x25519 } from '@noble/curves/ed25519.js';
import { argon2id } from '@noble/hashes/argon2.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { base64ToBytes, bytesToBase64 } from './base64';

// argon2id params. cost is paid once per login; bearable for users, not
// trivially brute-forceable. Vitest sets MODE=test so the test suite uses
// near-zero params (correctness, not strength). Vite production builds set
// MODE=production and dead-code-eliminate the test branch.
const ARGON2 =
    import.meta.env.MODE === 'test' ? PASSWORD_KDF_TEST : PASSWORD_KDF;

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
    terminateWorker();
};

const hasPriv = () => myPriv !== null;

// shown wherever ephemeral DMs need the key this session doesn't have
const E2EE_LOCKED_MESSAGE =
    'Ephemeral messages are locked. Log out and log back in with your password to read and send them.';

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

// what /login and updatePassword get instead of the password
const deriveAuthKey = (priv: Uint8Array): string =>
    bytesToBase64(
        hkdf(
            sha256,
            priv,
            undefined,
            new TextEncoder().encode(AUTH_KEY_INFO),
            32
        )
    );

// Derive priv from password+identity and verify it matches the user's
// worker-backed async derivation (avoids freezing the main thread)
//
// argon2id with the params above blocks 1-5s depending on the machine.
// On the login flow that block translates to a frozen UI; if the user
// is on a slow device or the tab is throttled it can read as "hang".
// The worker computes off-thread; callers await a Promise.
//
// Sync derivePriv() above stays available for tests; UI callers use
// derivePrivAsync.

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

// priv for E2EE plus the authKey /login and updatePassword take for it
const deriveCredentials = async (password: string, identity: string) => {
    const priv = await derivePrivAsync(password, identity);

    return { priv, authKey: deriveAuthKey(priv) };
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

// session key: lets auto-login unlock priv without the password (the
// Proton approach). priv is sealed under a random wrap key; the sealed blob
// stays in this browser, the wrap key goes to the server bound to this
// session's token. Neither half alone yields priv, and revoking the session
// (logout, password change, sign-out-others) makes the server half
// unfetchable.
const importWrapKey = (raw: Uint8Array) =>
    crypto.subtle.importKey('raw', raw as BufferSource, 'AES-GCM', false, [
        'encrypt',
        'decrypt'
    ]);

const forgetSessionKey = () =>
    removeLocalStorageItem(LocalStorageKey.E2EE_SESSION_KEY);

// both requests authenticate with the HttpOnly session cookie
const persistSessionKey = async () => {
    if (!myPriv) return;

    const wrapKey = crypto.getRandomValues(new Uint8Array(32));
    const blob = await seal(
        await importWrapKey(wrapKey),
        bytesToBase64(myPriv)
    );

    const res = await fetch(`${getUrlFromServer()}/e2ee/session-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wrapKey: bytesToBase64(wrapKey) })
    });

    if (!res.ok)
        throw new Error(`e2ee: session key store failed (${res.status})`);

    // only after the server holds the matching wrap key
    setLocalStorageItem(LocalStorageKey.E2EE_SESSION_KEY, blob);
};

const restoreSessionKey = async () => {
    const blob = getLocalStorageItem(LocalStorageKey.E2EE_SESSION_KEY);
    if (!blob) return;

    const res = await fetch(`${getUrlFromServer()}/e2ee/session-key`);

    // revoked session or no wrap key for this token: the blob is dead
    if (res.status === 401 || res.status === 404) {
        forgetSessionKey();
        return;
    }

    // transient (429, 5xx): keep the blob, the next auto-login retries
    if (!res.ok) return;

    const { wrapKey } = (await res.json()) as { wrapKey: string };

    try {
        const priv = base64ToBytes(
            await open(await importWrapKey(base64ToBytes(wrapKey)), blob)
        );
        if (priv.length !== 32) throw new Error('e2ee: bad priv length');
        setPriv(priv);
    } catch {
        // sealed under another wrap key (overwritten by a later login)
        forgetSessionKey();
    }
};

// chunked variants for files. AES-GCM has a 256 MB single-call hard
// limit (NIST SP 800-38D) plus the obvious memory-pressure problem of
// holding multi-GB plaintext + ciphertext + Blob in heap; chunking
// fixes both. layout:
//   header  : "CESE"(4) || ver(1) || chunkSize(4 LE) || plainSize(8 LE)
//   chunks  : [ nonce(12) || ct(plainBytes + 16-byte tag) ] *
// each chunk carries its index as AAD so reordering fails auth.
const CHUNK_SIZE = 1 << 20; // 1 MB
const HEADER_MAGIC = new Uint8Array([0x43, 0x45, 0x53, 0x45]); // "CESE"
const HEADER_VERSION = 1;
const HEADER_SIZE = 4 + 1 + 4 + 8;
const NONCE_SIZE = 12;
const TAG_SIZE = 16;

const chunkAad = (index: number): Uint8Array => {
    const aad = new Uint8Array(4);
    new DataView(aad.buffer).setUint32(0, index, true);
    return aad;
};

const sealStreamed = async (key: CryptoKey, source: Blob): Promise<Blob> => {
    const total = source.size;
    const header = new Uint8Array(HEADER_SIZE);
    const view = new DataView(header.buffer);
    header.set(HEADER_MAGIC, 0);
    view.setUint8(4, HEADER_VERSION);
    view.setUint32(5, CHUNK_SIZE, true);
    view.setBigUint64(9, BigInt(total), true);

    const parts: BlobPart[] = [header as BlobPart];
    let offset = 0;
    let chunkIndex = 0;
    while (offset < total) {
        const end = Math.min(offset + CHUNK_SIZE, total);
        const slice = source.slice(offset, end);
        const buf = new Uint8Array(await slice.arrayBuffer());
        const nonce = crypto.getRandomValues(new Uint8Array(NONCE_SIZE));
        const aad = chunkAad(chunkIndex);
        const ct = await crypto.subtle.encrypt(
            {
                name: 'AES-GCM',
                iv: nonce as BufferSource,
                additionalData: aad as BufferSource
            },
            key,
            buf as BufferSource
        );
        parts.push(nonce as BlobPart, new Uint8Array(ct) as BlobPart);
        offset = end;
        chunkIndex++;
    }
    return new Blob(parts);
};

const openStreamed = async (key: CryptoKey, source: Blob): Promise<Blob> => {
    if (source.size < HEADER_SIZE) {
        throw new Error('e2ee: ciphertext too short');
    }
    const headerBytes = new Uint8Array(
        await source.slice(0, HEADER_SIZE).arrayBuffer()
    );
    for (let i = 0; i < HEADER_MAGIC.length; i++) {
        if (headerBytes[i] !== HEADER_MAGIC[i]) {
            throw new Error('e2ee: bad magic');
        }
    }
    const view = new DataView(headerBytes.buffer);
    if (view.getUint8(4) !== HEADER_VERSION) {
        throw new Error('e2ee: unsupported version');
    }
    const chunkSize = view.getUint32(5, true);
    const plainSize = Number(view.getBigUint64(9, true));

    const parts: BlobPart[] = [];
    let offset = HEADER_SIZE;
    let chunkIndex = 0;
    let plainProduced = 0;
    while (offset < source.size && plainProduced < plainSize) {
        const nonceEnd = offset + NONCE_SIZE;
        if (nonceEnd > source.size) {
            throw new Error('e2ee: truncated nonce');
        }
        const nonce = new Uint8Array(
            await source.slice(offset, nonceEnd).arrayBuffer()
        );
        const expectedPlain = Math.min(chunkSize, plainSize - plainProduced);
        const ctEnd = nonceEnd + expectedPlain + TAG_SIZE;
        if (ctEnd > source.size) {
            throw new Error('e2ee: truncated chunk');
        }
        const ct = new Uint8Array(
            await source.slice(nonceEnd, ctEnd).arrayBuffer()
        );
        const aad = chunkAad(chunkIndex);
        const pt = await crypto.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: nonce as BufferSource,
                additionalData: aad as BufferSource
            },
            key,
            ct as BufferSource
        );
        parts.push(new Uint8Array(pt) as BlobPart);
        plainProduced += pt.byteLength;
        offset = ctEnd;
        chunkIndex++;
    }
    if (plainProduced !== plainSize) {
        throw new Error('e2ee: size mismatch');
    }
    return new Blob(parts);
};

export {
    clearPriv,
    deriveAuthKey,
    deriveCredentials,
    derivePriv,
    derivePrivAsync,
    derivePub,
    dmKey,
    E2EE_LOCKED_MESSAGE,
    forgetSessionKey,
    getMyPubB64,
    hasPriv,
    open,
    openStreamed,
    persistSessionKey,
    restoreSessionKey,
    seal,
    sealStreamed,
    setPriv
};
