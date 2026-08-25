/**
 * errors.js — the typed error surface the Read section reports.
 *
 * Every refusal a user can trigger has a CODE and a sentence. The code is what
 * the tamper matrix asserts on; the sentence is what the page shows. Keeping
 * them together means a test cannot pass by matching prose that later drifts,
 * and a user is never shown a bare stack trace.
 *
 * The rule this file exists to enforce: a failure to parse or verify NEVER
 * yields memo bytes presented as authenticated. `ReadError` carries no memo.
 */

export class ReadError extends Error {
    /**
     * @param {string} code   stable identifier, asserted by tests
     * @param {string} message  one sentence, shown to the user
     * @param {object} [detail] extra fields for the report (never memo bytes)
     */
    constructor(code, message, detail = {}) {
        super(message);
        this.name = 'ReadError';
        this.code = code;
        this.detail = detail;
    }
}

export const CODES = Object.freeze({
    /** Nothing was pasted or the file was empty. */
    EMPTY_INPUT: 'EMPTY_INPUT',
    /** Over the pre-parse size bound. Raised BEFORE any allocation-heavy work. */
    TOO_LARGE: 'TOO_LARGE',
    /** Below the smallest possible artifact, so it cannot be one. */
    TOO_SMALL: 'TOO_SMALL',
    /** Text that is not a bech32m string at all. */
    NOT_BECH32M: 'NOT_BECH32M',
    /** A bech32m string whose prefix is not one this page accepts. */
    WRONG_HRP: 'WRONG_HRP',
    /** A bech32m string whose checksum does not verify. */
    BAD_CHECKSUM: 'BAD_CHECKSUM',
    /** Raw bytes whose leading tag matches nothing this page knows. */
    UNKNOWN_MAGIC: 'UNKNOWN_MAGIC',
    /**
     * Tagged `zswap::Offer` bytes supplied as an offer file. Per owner decision
     * Q-W8 = A an offer file is a FULL transaction, so this is a refusal with a
     * precise reason, never a silent fallback.
     */
    BARE_OFFER_NOT_AN_OFFER_FILE: 'BARE_OFFER_NOT_AN_OFFER_FILE',
    /** A transaction whose marker triple this ledger build cannot represent. */
    UNSUPPORTED_TX_MARKERS: 'UNSUPPORTED_TX_MARKERS',
    /** The bytes end mid-structure. */
    TRUNCATED: 'TRUNCATED',
    /** Well-formed bytes of the wrong kind for the slot they were given to. */
    SWAPPED_ARTIFACTS: 'SWAPPED_ARTIFACTS',
    /** The transaction parsed but carries no zswap offer at all. */
    NO_OFFER_IN_TRANSACTION: 'NO_OFFER_IN_TRANSACTION',
    /** The transaction carries offers, but none at the wrapper's segment. */
    SEGMENT_NOT_IN_TRANSACTION: 'SEGMENT_NOT_IN_TRANSACTION',
    /** The ledger refused the bytes for a reason it stated itself. */
    PARSE_FAILED: 'PARSE_FAILED',
    /** `memoWrapperVerify` refused. The ledger's own sentence is carried through. */
    VERIFY_FAILED: 'VERIFY_FAILED',
    /** Two offer files, or a second copy of the same wrapper. */
    DUPLICATE_ARTIFACT: 'DUPLICATE_ARTIFACT',
    /** The WASM module could not be loaded. */
    WASM_UNAVAILABLE: 'WASM_UNAVAILABLE',
});

/** Wrap a thrown value as a `ReadError`, preserving the ledger's own message. */
export function asReadError(err, code, prefix) {
    if (err instanceof ReadError) return err;
    const message = String(err && err.message ? err.message : err);
    return new ReadError(code, prefix ? `${prefix}: ${message}` : message, { fromLedger: message });
}
