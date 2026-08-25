/**
 * bytes.js — small byte helpers shared by the Read pipeline.
 *
 * Nothing here interprets anything: no decoding that could change content, no
 * lossy conversions on a path that later claims authenticity. The one decoder
 * that is allowed to be lossy lives in `inert.js`, which is explicitly a
 * *display* module.
 */

/** Lowercase hex of `bytes`. */
export function toHex(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
    return out;
}

/** Parse an even-length lowercase/uppercase hex string. Throws on anything else. */
export function fromHex(hex) {
    if (hex.length % 2 !== 0) throw new Error('hex string has an odd length');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        const byte = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
        if (Number.isNaN(byte)) throw new Error(`not hex at offset ${i * 2}`);
        out[i] = byte;
    }
    return out;
}

/** Constant-shape byte equality (length first, then content). */
export function bytesEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

/**
 * The leading `n` bytes as a latin1 string, for magic/tag sniffing.
 *
 * latin1 rather than UTF-8 on purpose: a tag comparison must never depend on
 * whether the bytes after the tag happen to form valid UTF-8.
 */
export function asciiPrefix(bytes, n) {
    const take = Math.min(n, bytes.length);
    let out = '';
    for (let i = 0; i < take; i++) out += String.fromCharCode(bytes[i]);
    return out;
}

/** `true` if `bytes` starts with the ASCII string `prefix`. */
export function startsWithAscii(bytes, prefix) {
    if (bytes.length < prefix.length) return false;
    for (let i = 0; i < prefix.length; i++) if (bytes[i] !== prefix.charCodeAt(i)) return false;
    return true;
}

/** UTF-8 encode. */
export function utf8(text) {
    return new TextEncoder().encode(text);
}

/** A human byte count: "1 byte" / "10,075 bytes". */
export function byteCount(n) {
    return `${n.toLocaleString('en-US')} byte${n === 1 ? '' : 's'}`;
}
