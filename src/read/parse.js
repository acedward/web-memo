/**
 * parse.js — turn user input into artifacts, and artifacts into structure.
 *
 * Parsing is never verifying. Nothing in this file decides that a memo is
 * authentic; `memoWrapperParse` deliberately names its memo field
 * `unverifiedMemo` and this module keeps that name all the way to the renderer,
 * so a display path cannot reach for parsed memo bytes by accident.
 */

import { asciiPrefix, byteCount, toHex } from '../lib/bytes.js';
import {
    HRP,
    MAX_ARTIFACT_BYTES,
    classifyBytes,
    classifyText,
} from './classify.js';
import { CODES, ReadError, asReadError } from './errors.js';

/**
 * Take one pasted string and return a normalised artifact.
 *
 * The bech32m string's prefix says what it claims to be; the decoded bytes say
 * what it IS. Both are checked, so a `swapoffer1…` string carrying wrapper
 * bytes is a precise mismatch rather than a confusing parse failure.
 */
export function ingestText(wasm, text, label = 'pasted text') {
    const claimed = classifyText(text);

    let bytes;
    try {
        bytes = wasm.memoWrapperFromBech32m(claimed.text, claimed.hrp);
    } catch (err) {
        const message = String(err && err.message ? err.message : err);
        if (/checksum/i.test(message)) {
            throw new ReadError(
                CODES.BAD_CHECKSUM,
                'That bech32m string does not check out — at least one character is wrong, or it was truncated in copying.',
                { fromLedger: message },
            );
        }
        if (/prefix/i.test(message)) {
            throw new ReadError(CODES.WRONG_HRP, message, { fromLedger: message });
        }
        throw asReadError(err, CODES.NOT_BECH32M, 'That bech32m string could not be decoded');
    }

    const actual = classifyBytes(bytes);
    if (actual.kind !== claimed.kind) {
        throw new ReadError(
            CODES.SWAPPED_ARTIFACTS,
            `That string is labelled "${claimed.hrp}" but its bytes are a ${describeKind(actual.kind)}. The label and the contents disagree, so nothing was accepted.`,
            { claimed: claimed.kind, actual: actual.kind },
        );
    }

    return { ...actual, bytes, source: 'bech32m', hrp: claimed.hrp, label };
}

/** Take raw bytes (a dropped/selected file) and return a normalised artifact. */
export function ingestBytes(bytes, label = 'file') {
    const actual = classifyBytes(bytes);
    return { ...actual, bytes, source: 'raw-bytes', label };
}

/**
 * Take whatever a file contained: raw artifact bytes, or a text file holding a
 * bech32m string (which is how most people will save one).
 */
export function ingestFileContents(wasm, bytes, label) {
    if (looksLikeBech32mText(bytes)) {
        return ingestText(wasm, new TextDecoder('utf-8', { fatal: false }).decode(bytes), label);
    }
    return ingestBytes(bytes, label);
}

function looksLikeBech32mText(bytes) {
    if (bytes.length === 0 || bytes.length > MAX_ARTIFACT_BYTES) return false;
    const head = asciiPrefix(bytes, 16).trimStart().toLowerCase();
    return head.startsWith(`${HRP.OFFER}1`) || head.startsWith(`${HRP.WRAPPER}1`);
}

export function describeKind(kind) {
    return kind === 'offer-file' ? 'offer file (a full proven transaction)' : 'memo wrapper';
}

/**
 * Parse an offer file: the transaction, and every zswap offer inside it.
 *
 * Owner decision Q-W8 = A. The extraction is not a convenience — the verifier
 * refuses whole-transaction bytes outright (plan finding F-2.1), so this is the
 * only route from an offer file to a memo check.
 *
 * Returns `{ markers, tag, offers: [{ slot, segment, bytes }], anchors }`.
 * `anchors` is the scan over the WHOLE transaction, which is what catches an
 * anchor sitting in a segment the wrapper does not name.
 */
export function parseOfferFile(wasm, artifact) {
    const { bytes, markers, tag } = artifact;
    let tx;
    try {
        tx = wasm.Transaction.deserialize(markers[0], markers[1], markers[2], bytes);
    } catch (err) {
        const message = String(err && err.message ? err.message : err);
        const code = /fill whole buffer|truncat|needed/i.test(message) ? CODES.TRUNCATED : CODES.PARSE_FAILED;
        throw new ReadError(
            code,
            code === CODES.TRUNCATED
                ? `That offer file ends part-way through: the ledger stopped with "${message}".`
                : `The ledger refused that offer file: ${message}`,
            { fromLedger: message },
        );
    }

    const offers = [];
    try {
        const guaranteed = tx.guaranteedOffer;
        if (guaranteed) offers.push({ slot: 'guaranteed', segment: 0, bytes: guaranteed.serialize() });
    } catch (err) {
        throw asReadError(err, CODES.PARSE_FAILED, 'Reading the guaranteed offer failed');
    }
    try {
        const fallible = tx.fallibleOffer;
        if (fallible) {
            for (const key of fallible.keys()) {
                const offer = fallible.get(key);
                if (offer) offers.push({ slot: 'fallible', segment: Number(key), bytes: offer.serialize() });
            }
        }
    } catch (err) {
        throw asReadError(err, CODES.PARSE_FAILED, 'Reading the fallible offers failed');
    }

    if (offers.length === 0) {
        throw new ReadError(
            CODES.NO_OFFER_IN_TRANSACTION,
            'That transaction parsed, but it carries no Zswap offer at all — there is nothing here a memo could be bound to.',
        );
    }

    offers.sort((a, b) => a.segment - b.segment);

    let anchors = [];
    try {
        anchors = wasm.memoAnchorScan(bytes).map((a) => ({
            offset: a.offset,
            length: a.length,
            nullifier: toHex(a.nullifier),
            h: toHex(a.h),
        }));
    } catch (err) {
        throw asReadError(err, CODES.PARSE_FAILED, 'Scanning the transaction for anchors failed');
    }

    return {
        markers,
        tag,
        byteLength: bytes.length,
        offers: offers.map((o) => ({ ...o, inputs: readInputs(wasm, o.bytes) })),
        anchors,
    };
}

/**
 * The nullifiers of a proven offer's inputs, so the report can show per-input
 * attribution — including inputs that carry no memo at all.
 *
 * A failure here is not fatal: the offer bytes have already satisfied the
 * ledger's own deserializer inside the transaction, and per-input display is a
 * nicety, not a verification step.
 */
function readInputs(wasm, offerBytes) {
    try {
        const offer = wasm.ZswapOffer.deserialize('proof', offerBytes);
        return offer.inputs.map((input) => ({ nullifier: String(input.nullifier) }));
    } catch {
        return null;
    }
}

/**
 * Parse a memo wrapper into its fields.
 *
 * The 00003 codec enforces the section rules here, not us: a mandatory section
 * tag (<= 0x0fff) the decoder does not know is a refusal, an optional one
 * (> 0x0fff) is ignored. Those rules live in one implementation, and this page
 * calls it rather than reimplementing them.
 */
export function parseWrapper(wasm, artifact) {
    let parsed;
    try {
        parsed = wasm.memoWrapperParse(artifact.bytes);
    } catch (err) {
        const message = String(err && err.message ? err.message : err);
        let code = CODES.PARSE_FAILED;
        if (/truncat|needed/i.test(message)) code = CODES.TRUNCATED;
        else if (/bad magic/i.test(message)) code = CODES.UNKNOWN_MAGIC;
        throw new ReadError(code, `That memo wrapper could not be read: ${message}`, { fromLedger: message });
    }
    return {
        segment: parsed.segment,
        nullifier: toHex(parsed.nullifier),
        unverifiedMemo: parsed.unverifiedMemo,
        unverifiedMemoLength: parsed.unverifiedMemo.length,
        companionProofBytes: parsed.companionProof.length,
        statementTailBytes: parsed.claimedStatementTail.length,
        untrustedLocator: parsed.untrustedLocator,
        byteLength: artifact.bytes.length,
        summary: `${byteCount(artifact.bytes.length)}, memo ${byteCount(parsed.unverifiedMemo.length)} (UNVERIFIED), companion proof ${byteCount(parsed.companionProof.length)}`,
    };
}
