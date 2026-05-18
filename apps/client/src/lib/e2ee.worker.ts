/// <reference lib="webworker" />
//
// E2EE key derivation off the main thread. argon2id with t=3, m=64MB
// is a 1-2s block on a fast laptop and several seconds on weaker
// machines; running it here keeps the login spinner responsive and
// avoids the "is this dead?" perception during derivation.

import { argon2id } from '@noble/hashes/argon2.js';
import { sha256 } from '@noble/hashes/sha2.js';

declare const self: DedicatedWorkerGlobalScope;

type Req = {
    id: number;
    password: string;
    identityCanonical: string;
    params: { t: number; m: number; p: number; dkLen: number };
};

type Res = { id: number; priv?: Uint8Array; error?: string };

self.onmessage = (e: MessageEvent<Req>) => {
    const { id, password, identityCanonical, params } = e.data;
    try {
        const salt = sha256(new TextEncoder().encode(identityCanonical));
        const priv = argon2id(password, salt, params);
        const res: Res = { id, priv };
        self.postMessage(res, [priv.buffer]);
    } catch (err) {
        const res: Res = { id, error: String(err) };
        self.postMessage(res);
    }
};

export {};
