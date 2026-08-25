/**
 * memo.js — turning what the user typed into memo bytes, and refusing early.
 *
 * Task 3.2. Two rules, both from the frozen format:
 *
 *   1. the bound is **1..=512 BYTES**, not characters. "🙂" is one character
 *      and four bytes; a 200-character emoji memo is 800 bytes and is refused.
 *      The page shows the byte count, always, because the character count is
 *      the number that misleads.
 *   2. the check runs **before proving**. Proving is a multi-second round trip
 *      to a server that receives witness material; discovering the memo was too
 *      long afterwards would mean the user paid that cost, and made that
 *      disclosure, for nothing.
 *
 * The bound is also enforced inside the wrapper codec, so this is not the only
 * line of defence — it is the one that fails *fast* and in the user's own
 * terms, rather than as a ledger error three steps later.
 */

import { byteCount, fromHex, utf8 } from '../lib/bytes.js';

/** Frozen by the 00003 wrapper format. */
export const MEMO_MIN_BYTES = 1;
export const MEMO_MAX_BYTES = 512;

/**
 * A cheap upper bound on input length, applied to the raw text before it is
 * encoded. UTF-8 is at most 4 bytes per code point, but a JS string is UTF-16
 * code units, so 512 bytes can never come from more than 512 code units — one
 * unit is at least one byte. A little slack is left so the real byte-level
 * error is what the user sees rather than this guard.
 */
const MAX_TEXT_UNITS = 4096;

export class MemoError extends Error {
    constructor(code, message, detail = {}) {
        super(message);
        this.name = 'MemoError';
        this.code = code;
        this.detail = detail;
    }
}

export const MEMO_CODES = Object.freeze({
    MEMO_EMPTY: 'MEMO_EMPTY',
    MEMO_TOO_LONG: 'MEMO_TOO_LONG',
    MEMO_TEXT_TOO_LONG: 'MEMO_TEXT_TOO_LONG',
    MEMO_BAD_HEX: 'MEMO_BAD_HEX',
});

/**
 * Encode the memo input.
 *
 * @param {string} text  what the user typed
 * @param {'text'|'hex'} mode  UTF-8 text, or raw bytes as hex
 * @returns {Uint8Array}
 * @throws {MemoError} with a code the tests assert on and a sentence the page shows
 */
export function encodeMemo(text, mode = 'text') {
    if (typeof text !== 'string') {
        throw new MemoError(MEMO_CODES.MEMO_EMPTY, 'There is no memo to encode.');
    }
    if (text.length > MAX_TEXT_UNITS) {
        throw new MemoError(
            MEMO_CODES.MEMO_TEXT_TOO_LONG,
            `That is ${text.length.toLocaleString('en-US')} characters. A memo is at most ${MEMO_MAX_BYTES} bytes, ` +
            `so this was refused without encoding it.`,
            { chars: text.length },
        );
    }

    let bytes;
    if (mode === 'hex') {
        const cleaned = text.replace(/[\s:_-]/g, '');
        if (cleaned.length === 0) {
            throw new MemoError(MEMO_CODES.MEMO_EMPTY, 'A memo must be at least 1 byte. Nothing was entered.');
        }
        if (cleaned.length % 2 !== 0) {
            throw new MemoError(
                MEMO_CODES.MEMO_BAD_HEX,
                `That is ${cleaned.length} hex characters, which is an odd number — every byte needs two.`,
            );
        }
        if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
            const bad = cleaned.match(/[^0-9a-fA-F]/);
            throw new MemoError(
                MEMO_CODES.MEMO_BAD_HEX,
                `"${bad ? bad[0] : '?'}" is not a hex digit. In hex mode the memo is written as pairs of 0-9 a-f.`,
            );
        }
        bytes = fromHex(cleaned);
    } else {
        bytes = utf8(text);
    }

    return checkMemoBytes(bytes);
}

/**
 * The bound itself, applied to bytes. Separated from encoding so a caller that
 * already has bytes (a test, a future file-upload path) gets the identical rule
 * and the identical sentences.
 */
export function checkMemoBytes(bytes) {
    if (bytes.length < MEMO_MIN_BYTES) {
        throw new MemoError(
            MEMO_CODES.MEMO_EMPTY,
            `A memo must be at least ${MEMO_MIN_BYTES} byte. Nothing was entered, so there is nothing to authenticate.`,
            { bytes: bytes.length },
        );
    }
    if (bytes.length > MEMO_MAX_BYTES) {
        throw new MemoError(
            MEMO_CODES.MEMO_TOO_LONG,
            `That memo is ${byteCount(bytes.length)}. The format's limit is ${MEMO_MAX_BYTES} bytes, ` +
            `so it was refused before any proving started — nothing was sent anywhere.`,
            { bytes: bytes.length, over: bytes.length - MEMO_MAX_BYTES },
        );
    }
    return bytes;
}

/**
 * A non-throwing measurement for the live byte counter under the input box.
 * Returns `{ bytes, chars, ok, code, message }` — the UI wants to show
 * "412 / 512 bytes" while the user is still typing, and must not treat "not
 * finished typing" as an error worth shouting about.
 */
export function measureMemo(text, mode = 'text') {
    try {
        const bytes = encodeMemo(text, mode);
        return { bytes: bytes.length, chars: text.length, ok: true, code: null, message: null };
    } catch (err) {
        let bytes = null;
        if (err.code === MEMO_CODES.MEMO_TOO_LONG) bytes = err.detail.bytes;
        return {
            bytes,
            chars: typeof text === 'string' ? text.length : 0,
            ok: false,
            code: err.code,
            message: err.message,
        };
    }
}
