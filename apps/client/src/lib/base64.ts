// Small binary-safe base64 helpers shared by E2EE and any caller that
// needs to decode tRPC-shipped key/blob fields. atob/btoa alone trip on
// non-Latin-1 chars; these go through char-code arrays.

const bytesToBase64 = (bytes: Uint8Array): string => {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]!);
    return btoa(s);
};

const base64ToBytes = (b64: string): Uint8Array => {
    const s = atob(b64);
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
    return out;
};

// like base64ToBytes but returns null on malformed input instead of throwing.
// useful when decoding values that might be plaintext (older messages) or
// ciphertext (post-E2EE messages) without an explicit marker.
const base64ToBytesSafe = (b64: string): Uint8Array | null => {
    try {
        return base64ToBytes(b64);
    } catch {
        return null;
    }
};

export { base64ToBytes, base64ToBytesSafe, bytesToBase64 };
