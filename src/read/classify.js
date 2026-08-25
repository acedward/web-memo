/**
 * classify.js — decide what the user just handed us, and refuse cheaply.
 *
 * Task 2.1. One paste box and one file picker feed everything through here.
 * Two rules shape the whole module:
 *
 *   1. **Size bounds run BEFORE parsing.** An offer file is a full proven
 *      transaction and can be tens of kilobytes; a hostile paste can be
 *      hundreds of megabytes. Every bound below is checked against a length,
 *      never against a parse result, so a 500 MB paste costs one comparison.
 *
 *   2. **Routing is by the artifact's own tag, never by which box it was
 *      dropped in.** The ledger's tagged serialization puts an ASCII header at
 *      the front of every artifact, and the wrapper has a 27-byte magic, so
 *      "the user swapped the two boxes" is a detectable state with a precise
 *      message rather than a confusing parse failure. The full marker-triple
 *      table (plan finding F-2.2) means a transaction's proof/signature/binding
 *      markers are READ off the bytes rather than brute-forced.
 */

import { asciiPrefix, startsWithAscii } from '../lib/bytes.js';
import { CODES, ReadError } from './errors.js';

// ---------------------------------------------------------------------------
// Size bounds (task 2.1: "size bounds BEFORE parse")
// ---------------------------------------------------------------------------

/**
 * Largest raw artifact accepted, in bytes.
 *
 * Calibrated, not guessed: the reference fixtures are 5–20 KB, a single spend
 * proof is ~4.9 KB, and a transaction merging many segments is still far under
 * this. 8 MiB leaves three orders of magnitude of headroom while keeping a
 * pathological paste from ever reaching the WASM heap.
 */
export const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024;

/**
 * Largest pasted string accepted, in UTF-16 code units.
 *
 * bech32m carries 5 bits per character, so N bytes render as ~1.6 N characters
 * plus the prefix and checksum. This is `MAX_ARTIFACT_BYTES * 1.6` rounded up,
 * so a string that could not possibly decode to an in-bounds artifact is
 * refused without running the decoder.
 */
export const MAX_TEXT_CHARS = Math.ceil(MAX_ARTIFACT_BYTES * 1.6) + 128;

/** The wrapper header alone is 31 bytes (00003 `wrapper.rs`). */
export const MIN_ARTIFACT_BYTES = 31;

// ---------------------------------------------------------------------------
// Tags
// ---------------------------------------------------------------------------

/** 00003 `WRAPPER_MAGIC`. */
export const WRAPPER_MAGIC = 'midnight:zswap-memo-wrapper';

/** A tagged, proven `zswap::Offer` — NOT an offer file under Q-W8 = A. */
export const BARE_OFFER_TAG_PREFIX = 'midnight:zswap-offer[';

/** Every transaction shape this ledger build can represent (plan F-2.2). */
export const TRANSACTION_TAGS = Object.freeze([
    { tag: 'midnight:transaction[v12](signature[v2],proof,pedersen-schnorr[v1]):', markers: ['signature', 'proof', 'binding'] },
    { tag: 'midnight:transaction[v12](signature[v2],proof,embedded-fr[v1]):', markers: ['signature', 'proof', 'pre-binding'] },
    { tag: 'midnight:transaction[v12](signature[v2],proof-preimage,pedersen-schnorr[v1]):', markers: ['signature', 'pre-proof', 'binding'] },
    { tag: 'midnight:transaction[v12](signature[v2],proof-preimage,embedded-fr[v1]):', markers: ['signature', 'pre-proof', 'pre-binding'] },
    { tag: 'midnight:transaction[v12](signature[v2],(),pedersen[v1]):', markers: ['signature', 'no-proof', 'no-binding'] },
    { tag: 'midnight:transaction[v12]((),proof,pedersen-schnorr[v1]):', markers: ['signature-erased', 'proof', 'binding'] },
    { tag: 'midnight:transaction[v12]((),proof,embedded-fr[v1]):', markers: ['signature-erased', 'proof', 'pre-binding'] },
    { tag: 'midnight:transaction[v12]((),proof-preimage,pedersen-schnorr[v1]):', markers: ['signature-erased', 'pre-proof', 'binding'] },
    { tag: 'midnight:transaction[v12]((),proof-preimage,embedded-fr[v1]):', markers: ['signature-erased', 'pre-proof', 'pre-binding'] },
    { tag: 'midnight:transaction[v12]((),(),pedersen[v1]):', markers: ['signature-erased', 'no-proof', 'no-binding'] },
]);

const ANY_TRANSACTION_PREFIX = 'midnight:transaction[';

/** bech32m prefixes this page routes on (Q-W3 = A). `swapmsg` is PROVISIONAL. */
export const HRP = Object.freeze({ OFFER: 'swapoffer', WRAPPER: 'swapmsg' });

// ---------------------------------------------------------------------------
// Text input
// ---------------------------------------------------------------------------

/**
 * Read the bech32m human-readable prefix out of `text`, or explain why it is
 * not a bech32m string at all. Purely lexical — no checksum work, no decode.
 *
 * BIP-173 allows the separator `1` to appear inside the data part, so the HRP
 * is everything before the LAST `1`.
 */
export function bech32mPrefixOf(text) {
    const trimmed = text.trim();
    if (!trimmed) throw new ReadError(CODES.EMPTY_INPUT, 'Nothing to read — paste an artifact first.');
    if (trimmed.length > MAX_TEXT_CHARS) {
        throw new ReadError(
            CODES.TOO_LARGE,
            `That paste is ${trimmed.length.toLocaleString('en-US')} characters, over this page's ${MAX_TEXT_CHARS.toLocaleString('en-US')}-character limit. Nothing was parsed.`,
            { chars: trimmed.length, limit: MAX_TEXT_CHARS },
        );
    }
    const sep = trimmed.lastIndexOf('1');
    if (sep < 1) {
        throw new ReadError(
            CODES.NOT_BECH32M,
            'That does not look like a bech32m string: there is no "1" separating a prefix from the data.',
        );
    }
    const hrp = trimmed.slice(0, sep).toLowerCase();
    if (!/^[\x21-\x7e]+$/.test(trimmed.slice(0, sep))) {
        throw new ReadError(CODES.NOT_BECH32M, 'That does not look like a bech32m string: the prefix contains characters bech32m does not allow.');
    }
    if (!/^[qpzry9x8gf2tvdw0s3jn54khce6mua7lQPZRY9X8GF2TVDW0S3JN54KHCE6MUA7L]+$/.test(trimmed.slice(sep + 1))) {
        throw new ReadError(CODES.NOT_BECH32M, 'That does not look like a bech32m string: the data part contains characters outside the bech32m alphabet.');
    }
    return { hrp, text: trimmed };
}

/**
 * Classify a pasted string. Returns `{ source: 'bech32m', hrp, kind, text }`,
 * where `kind` is `'offer-file' | 'wrapper'`.
 */
export function classifyText(text) {
    const { hrp, text: trimmed } = bech32mPrefixOf(text);
    if (hrp === HRP.OFFER) return { source: 'bech32m', hrp, kind: 'offer-file', text: trimmed };
    if (hrp === HRP.WRAPPER) return { source: 'bech32m', hrp, kind: 'wrapper', text: trimmed };
    throw new ReadError(
        CODES.WRONG_HRP,
        `That bech32m string has the prefix "${hrp}". This page reads "${HRP.OFFER}" (offer files) and "${HRP.WRAPPER}" (memo wrappers).`,
        { hrp },
    );
}

// ---------------------------------------------------------------------------
// Raw bytes
// ---------------------------------------------------------------------------

/**
 * Classify raw bytes by their own leading tag.
 *
 * Returns one of:
 *   `{ kind: 'offer-file', markers, tag }`
 *   `{ kind: 'wrapper' }`
 * and throws a precise `ReadError` for everything else — in particular for a
 * bare tagged `zswap::Offer`, which is a real artifact but is NOT an offer file
 * (owner decision Q-W8 = A).
 */
export function classifyBytes(bytes) {
    if (bytes.length === 0) throw new ReadError(CODES.EMPTY_INPUT, 'That file is empty.');
    if (bytes.length > MAX_ARTIFACT_BYTES) {
        throw new ReadError(
            CODES.TOO_LARGE,
            `That artifact is ${bytes.length.toLocaleString('en-US')} bytes, over this page's ${MAX_ARTIFACT_BYTES.toLocaleString('en-US')}-byte limit. Nothing was parsed.`,
            { bytes: bytes.length, limit: MAX_ARTIFACT_BYTES },
        );
    }
    if (bytes.length < MIN_ARTIFACT_BYTES) {
        throw new ReadError(
            CODES.TOO_SMALL,
            `That artifact is only ${bytes.length} bytes. The smallest thing this page can read is a ${MIN_ARTIFACT_BYTES}-byte wrapper header.`,
            { bytes: bytes.length },
        );
    }

    if (startsWithAscii(bytes, WRAPPER_MAGIC)) return { kind: 'wrapper' };

    if (startsWithAscii(bytes, ANY_TRANSACTION_PREFIX)) {
        for (const entry of TRANSACTION_TAGS) {
            if (startsWithAscii(bytes, entry.tag)) {
                return { kind: 'offer-file', markers: entry.markers, tag: entry.tag };
            }
        }
        throw new ReadError(
            CODES.UNSUPPORTED_TX_MARKERS,
            `Those bytes are a Midnight transaction, but of a shape this build cannot read: ${JSON.stringify(asciiPrefix(bytes, 96))}.`,
            { seenTag: asciiPrefix(bytes, 96) },
        );
    }

    if (startsWithAscii(bytes, BARE_OFFER_TAG_PREFIX)) {
        throw new ReadError(
            CODES.BARE_OFFER_NOT_AN_OFFER_FILE,
            'Those are bare Zswap offer bytes, not an offer file. An offer file is a full proven transaction (MIP-0005); the offer alone is a fragment of one, and this page will not treat it as the whole artifact.',
            { seenTag: asciiPrefix(bytes, 48) },
        );
    }

    throw new ReadError(
        CODES.UNKNOWN_MAGIC,
        'Those bytes carry no tag this page recognises — they are not an offer file and not a memo wrapper.',
        { head: asciiPrefix(bytes, 32) },
    );
}
