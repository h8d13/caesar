// E2EE protocol tests. These run against the production module
// (lib/e2ee.ts + lib/base64.ts), not duplicated helpers so they catch
// regressions in the real code path.
//
// myPriv is module-scoped in e2ee.ts, so tests that need both sides of an
// exchange swap it with setPriv() between calls. clearPriv() in beforeEach
// keeps tests independent.

import { beforeEach, describe, expect, test } from 'vitest';
import {
    clearPriv,
    derivePriv,
    derivePub,
    dmKey,
    open,
    seal,
    setPriv
} from '../e2ee';

const A = { id: 1, identity: 'alice', password: 'aliceSecret_001' };
const B = { id: 2, identity: 'bob', password: 'bobSecret_002' };
const C = { id: 3, identity: 'carol', password: 'carolSecret_003' };

// mock of the user_keys table: user_id -> public_key bytes.
type MockDB = Map<number, Uint8Array>;
let db: MockDB;

beforeEach(() => {
    db = new Map();
    clearPriv();
});

describe('e2ee determinism', () => {
    test('same password + identity => same keypair across calls', () => {
        const k1 = derivePriv(A.password, A.identity);
        const k2 = derivePriv(A.password, A.identity);
        expect(k1).toEqual(k2);
        expect(derivePub(k1)).toEqual(derivePub(k2));
    });

    test('different identity, same password => different keypair', () => {
        const k1 = derivePriv(A.password, A.identity);
        const k2 = derivePriv(A.password, B.identity);
        expect(k1).not.toEqual(k2);
    });

    test('different password, same identity => different keypair', () => {
        const k1 = derivePriv(A.password, A.identity);
        const k2 = derivePriv('changed_password_xyz', A.identity);
        expect(k1).not.toEqual(k2);
    });
});

describe('e2ee round-trip', () => {
    test('A encrypts to B, B decrypts to plaintext', async () => {
        const aPriv = derivePriv(A.password, A.identity);
        const bPriv = derivePriv(B.password, B.identity);
        db.set(A.id, derivePub(aPriv));
        db.set(B.id, derivePub(bPriv));

        setPriv(aPriv);
        const aKey = await dmKey(db.get(B.id)!, A.id, B.id);
        const sealed = await seal(aKey, 'hello bob');

        setPriv(bPriv);
        const bKey = await dmKey(db.get(A.id)!, A.id, B.id);
        expect(await open(bKey, sealed)).toBe('hello bob');
    });

    test('reply B -> A also round-trips', async () => {
        const aPriv = derivePriv(A.password, A.identity);
        const bPriv = derivePriv(B.password, B.identity);
        db.set(A.id, derivePub(aPriv));
        db.set(B.id, derivePub(bPriv));

        setPriv(bPriv);
        const bKey = await dmKey(db.get(A.id)!, A.id, B.id);
        const sealed = await seal(bKey, 'hi alice');

        setPriv(aPriv);
        const aKey = await dmKey(db.get(B.id)!, A.id, B.id);
        expect(await open(aKey, sealed)).toBe('hi alice');
    });
});

describe('e2ee confidentiality', () => {
    test('third party C cannot decrypt A->B message', async () => {
        const aPriv = derivePriv(A.password, A.identity);
        const bPriv = derivePriv(B.password, B.identity);
        const cPriv = derivePriv(C.password, C.identity);
        db.set(A.id, derivePub(aPriv));
        db.set(B.id, derivePub(bPriv));
        db.set(C.id, derivePub(cPriv));

        setPriv(aPriv);
        const aKey = await dmKey(db.get(B.id)!, A.id, B.id);
        const sealed = await seal(aKey, 'private to bob');

        // C tries every possible peer in their view; none yields A→B's key
        setPriv(cPriv);
        const cKeyVsA = await dmKey(db.get(A.id)!, A.id, C.id);
        const cKeyVsB = await dmKey(db.get(B.id)!, B.id, C.id);
        await expect(open(cKeyVsA, sealed)).rejects.toThrow();
        await expect(open(cKeyVsB, sealed)).rejects.toThrow();
    });
});

describe('e2ee integrity & freshness', () => {
    test('flipping a byte of ciphertext fails AES-GCM auth', async () => {
        const aPriv = derivePriv(A.password, A.identity);
        const bPriv = derivePriv(B.password, B.identity);

        setPriv(aPriv);
        const aKey = await dmKey(derivePub(bPriv), A.id, B.id);
        const sealed = await seal(aKey, 'integrity check');

        // ciphertext output is base64 nonce||ct; flip the last base64 char
        // to alphabetic-equivalent so decode-then-decrypt yields wrong bytes.
        const last = sealed[sealed.length - 1]!;
        const tampered = sealed.slice(0, -1) + (last === 'A' ? 'B' : 'A');

        setPriv(bPriv);
        const bKey = await dmKey(derivePub(aPriv), A.id, B.id);
        await expect(open(bKey, tampered)).rejects.toThrow();
    });

    test('same plaintext twice => different ciphertext (random nonce)', async () => {
        const aPriv = derivePriv(A.password, A.identity);
        const bPriv = derivePriv(B.password, B.identity);

        setPriv(aPriv);
        const aKey = await dmKey(derivePub(bPriv), A.id, B.id);

        const s1 = await seal(aKey, 'same message');
        const s2 = await seal(aKey, 'same message');
        expect(s1).not.toEqual(s2);
    });
});

describe('e2ee password rotation', () => {
    test('after rotation, new pub overwrites old, future sends still work', async () => {
        let aPriv = derivePriv(A.password, A.identity);
        const bPriv = derivePriv(B.password, B.identity);
        db.set(A.id, derivePub(aPriv));
        db.set(B.id, derivePub(bPriv));

        aPriv = derivePriv('new_password_for_alice', A.identity);
        db.set(A.id, derivePub(aPriv));

        setPriv(aPriv);
        const aKey = await dmKey(db.get(B.id)!, A.id, B.id);
        const sealed = await seal(aKey, 'after rotation');

        setPriv(bPriv);
        const bKey = await dmKey(db.get(A.id)!, A.id, B.id);
        expect(await open(bKey, sealed)).toBe('after rotation');
    });

    test('A cannot decrypt their own pre-rotation messages', async () => {
        const aPrivOld = derivePriv(A.password, A.identity);
        const bPriv = derivePriv(B.password, B.identity);

        setPriv(aPrivOld);
        const oldKey = await dmKey(derivePub(bPriv), A.id, B.id);
        const sealed = await seal(oldKey, 'pre-rotation memo');

        const aPrivNew = derivePriv('new_password_for_alice', A.identity);
        setPriv(aPrivNew);
        const newKey = await dmKey(derivePub(bPriv), A.id, B.id);
        await expect(open(newKey, sealed)).rejects.toThrow();
    });
});

describe('e2ee schema invariants', () => {
    test('mock db only stores { user_id -> 32-byte public_key }', () => {
        const aPriv = derivePriv(A.password, A.identity);
        db.set(A.id, derivePub(aPriv));

        const stored = db.get(A.id);
        expect(stored).toBeInstanceOf(Uint8Array);
        expect(stored!.length).toBe(32); // x25519 public key
        expect(db.size).toBe(1);
    });
});
