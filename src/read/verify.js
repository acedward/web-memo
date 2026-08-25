/**
 * verify.js — the Read pipeline. Entirely client-side, entirely offline.
 *
 * Task 2.2. Nothing in this file touches the network: the only cryptographic
 * engine is the WASM module already loaded into the page, and the verifier key
 * is compiled into it. That is what makes the airplane test (00005 SC-001) a
 * property of the design rather than a lucky measurement.
 *
 * ---------------------------------------------------------------------------
 * The order of operations, and why it is this order
 * ---------------------------------------------------------------------------
 *  1. the offer file is parsed and its zswap offers extracted PER SEGMENT.
 *     Under Q-W8 = A an offer file is a full transaction, and the verifier
 *     refuses whole-transaction bytes outright, so extraction is mandatory.
 *  2. the transaction is scanned for `AnchorV1` sightings ONCE, over the whole
 *     byte string. The scan is untagged and variable-width by construction —
 *     the reference fixtures alone contain both 122- and 123-byte anchors — so
 *     no length or offset is ever assumed.
 *  3. each wrapper is parsed, matched to the offer at ITS segment, and checked
 *     by `memoWrapperVerify` under the compiled-in SPEND_VK.
 *  4. anchors are attributed to the wrappers that authenticated them; whatever
 *     is left over is `CommittedButMissing` — evidence a memo existed and its
 *     bytes are not here.
 *
 * Step 4 is what makes stripping visible, and it is why attribution is done by
 * decoded `(nullifier, h)` and never by output position: 00003's own binding
 * documents that output order is assigned by the ledger's sorting, not by the
 * constructor.
 */

import { toHex } from '../lib/bytes.js';
import { CODES, ReadError, asReadError } from './errors.js';
import { parseOfferFile, parseWrapper } from './parse.js';
import { STATES } from './trust.js';

/**
 * Run the whole Read pipeline.
 *
 * @param {object} wasm the loaded ledger module
 * @param {object} input `{ offerArtifact, wrapperArtifacts: [] }`
 * @returns {object} a report: `{ ok, offerFile, items, notes, error }`
 *
 * Never throws for user-input problems: those become `report.error` (an
 * offer-file level failure) or an item with a `MalformedOrUntrusted` state.
 * A throw from here would mean a bug in this page, not bad input.
 */
export function runRead(wasm, { offerArtifact, wrapperArtifacts = [] }) {
    const report = {
        ok: false,
        startedAt: Date.now(),
        offerFile: null,
        items: [],
        notes: [],
        error: null,
    };

    if (!offerArtifact) {
        report.error = new ReadError(
            CODES.EMPTY_INPUT,
            'No offer file yet. Add one (a full proven transaction, raw bytes or a "swapoffer1…" string) — a wrapper on its own cannot be checked against anything.',
        );
        return report;
    }

    let offerFile;
    try {
        offerFile = parseOfferFile(wasm, offerArtifact);
    } catch (err) {
        report.error = asReadError(err, CODES.PARSE_FAILED, 'The offer file could not be read');
        return report;
    }
    report.offerFile = offerFile;

    const offerBySegment = new Map(offerFile.offers.map((o) => [o.segment, o]));

    // --- every wrapper, checked ------------------------------------------
    /** @type {{nullifier: string, h: string}[]} */
    const claimedAnchors = [];

    for (const artifact of wrapperArtifacts) {
        report.items.push(verifyOneWrapper(wasm, artifact, offerFile, offerBySegment, claimedAnchors));
    }

    // --- anchors nobody authenticated -------------------------------------
    for (const anchor of offerFile.anchors) {
        const claimed = claimedAnchors.some((c) => c.nullifier === anchor.nullifier && c.h === anchor.h);
        if (claimed) continue;
        report.items.push({
            kind: 'anchor',
            state: STATES.COMMITTED_BUT_MISSING,
            source: `anchor at byte offset ${anchor.offset}`,
            nullifier: anchor.nullifier,
            h: anchor.h,
            anchorLength: anchor.length,
            segment: segmentOfOffset(offerFile, anchor.offset),
            anomalies: [],
        });
    }

    if (report.items.length === 0) {
        report.items.push({
            kind: 'none',
            state: STATES.NO_EVIDENCE,
            source: 'the offer file',
            anomalies: [],
        });
    }

    // --- honest limits of what this page can observe ----------------------
    report.notes.push(
        'Every check above ran in this browser. No network request is made during verification, and the verifier key is compiled into the WebAssembly module this page already loaded.',
    );
    report.notes.push(
        'This page reads a FILE, never a chain. It can therefore never report settlement, no matter how good the evidence in the file is.',
    );
    report.notes.push(
        'The anchor scan reports well-formed version 1 anchors. Ciphertexts that are anchor-SHAPED but fail full decode (00003 calls these malformed anchor candidates) are not surfaced by the WebAssembly bindings, so this page cannot report them.',
    );

    report.ok = true;
    report.finishedAt = Date.now();
    return report;
}

function verifyOneWrapper(wasm, artifact, offerFile, offerBySegment, claimedAnchors) {
    const item = {
        kind: 'wrapper',
        source: artifact.label,
        state: STATES.MALFORMED_OR_UNTRUSTED,
        anomalies: [],
        parsed: null,
        record: null,
        failure: null,
    };

    let parsed;
    try {
        parsed = parseWrapper(wasm, artifact);
    } catch (err) {
        item.failure = asReadError(err, CODES.PARSE_FAILED, 'This wrapper could not be read');
        return item;
    }
    item.parsed = parsed;
    item.segment = parsed.segment;
    item.nullifier = parsed.nullifier;

    const offer = offerBySegment.get(parsed.segment);
    if (!offer) {
        const present = offerFile.offers.map((o) => `${o.segment} (${o.slot})`).join(', ');
        item.failure = new ReadError(
            CODES.SEGMENT_NOT_IN_TRANSACTION,
            `This wrapper is bound to segment ${parsed.segment}, and that offer file carries no offer at segment ${parsed.segment} — it has ${present}. The two artifacts are not a pair.`,
            { wrapperSegment: parsed.segment, offerSegments: offerFile.offers.map((o) => o.segment) },
        );
        return item;
    }
    item.slot = offer.slot;

    let record;
    try {
        record = wasm.memoWrapperVerify(artifact.bytes, offer.bytes, parsed.segment);
    } catch (err) {
        const message = String(err && err.message ? err.message : err);
        item.failure = new ReadError(CODES.VERIFY_FAILED, message, { fromLedger: message });
        return item;
    }

    // The verifier derives `h` itself; it is never taken from the wrapper.
    // Re-deriving it here is a cheap, independent restatement of that, and it
    // is the check that would catch a binding that reported someone else's
    // hash alongside our memo.
    const memo = record.memo;
    const h = toHex(record.h);
    const rederived = toHex(wasm.memoHashV1(memo));
    if (rederived !== h) {
        item.failure = new ReadError(
            CODES.VERIFY_FAILED,
            'The memo does not hash to the value the verifier authenticated. This page will not show it.',
            { h, rederived },
        );
        return item;
    }

    const nullifier = toHex(record.nullifier);
    const matchingInOffer = record.matchingAnchors.length;
    const matchingInTransaction = offerFile.anchors.filter((a) => a.nullifier === nullifier && a.h === h);
    const foreign = offerFile.anchors.filter((a) => a.nullifier !== nullifier || a.h !== h);

    item.record = {
        memo,
        memoLength: memo.length,
        nullifier,
        h,
        segment: record.segment,
        matchingAnchorsInOffer: record.matchingAnchors.map((a) => ({
            outputIndex: a.outputIndex,
            coinCommitment: String(a.coinCommitment),
        })),
        matchingAnchorsInTransaction: matchingInTransaction,
    };

    if (record.duplicateAnchors || matchingInOffer > 1) {
        item.anomalies.push({
            code: 'DuplicateMatchingAnchors',
            text: `${matchingInOffer} outputs carry the SAME matching anchor. This is an anomaly worth knowing about; it does not weaken the authentication.`,
        });
    }
    if (foreign.length > 0) {
        item.anomalies.push({
            code: 'ForeignAnchors',
            text: `${foreign.length} other valid anchor${foreign.length === 1 ? '' : 's'} for a different (nullifier, memo-hash) ${foreign.length === 1 ? 'is' : 'are'} present in this transaction. ${foreign.length === 1 ? 'It is' : 'They are'} ignored when matching this memo.`,
        });
    }
    if (matchingInTransaction.length > matchingInOffer) {
        item.anomalies.push({
            code: 'AnchorOutsideCheckedOffer',
            text: `A matching anchor also appears elsewhere in the transaction, outside the segment-${parsed.segment} offer that was checked. Only the anchors inside that offer count towards this memo's state.`,
        });
    }

    claimedAnchors.push({ nullifier, h });

    item.state = matchingInOffer > 0
        ? STATES.AUTHENTICATED_WITH_MATCHING_ANCHOR_UNCONFIRMED
        : STATES.COMPANION_AUTHENTICATED_UNANCHORED;
    return item;
}

/** Which offer an anchor sighting fell inside, for display only. */
function segmentOfOffset(offerFile, _offset) {
    return offerFile.offers.length === 1 ? offerFile.offers[0].segment : null;
}
