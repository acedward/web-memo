/**
 * build.js — the Create flow, start to finish.
 *
 * Tasks 3.1, 3.3, 3.4 and 3.5 meet here. The whole run is one async function
 * with a progress callback, and it either returns a complete pair of artifacts
 * that this page has already verified, or it throws and leaves nothing behind.
 *
 * ---------------------------------------------------------------------------
 * THE ORDER, AND WHY IT IS THIS ORDER
 * ---------------------------------------------------------------------------
 *   1. validate the memo (bytes, 1..=512) — BEFORE anything is sent anywhere;
 *   2. build the demo state, the spend, the anchor output and the offer;
 *   3. read the finalized preimage AND the statement tail off the UNPROVEN
 *      input. Both are pre-proof quantities, so taking them now means the
 *      wrapper does not depend on parsing anything the server sends back;
 *   4. prove the transaction (the offer file);
 *   5. prove the memo companion over the finalized preimage;
 *   6. assemble the wrapper entirely locally;
 *   7. **verify our own output** with the Read pipeline before showing it.
 *
 * Step 7 is not a formality. It is what makes step 5's disclosure safe to make
 * and step 6's interim proof re-encoding (Q-W11) safe to ship: a proof server
 * that ignored the memo-hash override, or a re-encoding that was subtly wrong,
 * produces a wrapper that fails here — in this browser, under the compiled-in
 * verifier key — and the page shows a failure instead of an artifact. Upstream
 * says the same thing in `prove_memo_companion`'s own doc comment: "accepting
 * the override is not evidence that a backend honoured it".
 *
 * ---------------------------------------------------------------------------
 * FAILURE AND CANCELLATION
 * ---------------------------------------------------------------------------
 * Nothing is returned until every step has succeeded. There is no partial
 * result object, so the "no half-displayed artifact" requirement is structural
 * rather than a matter of the UI remembering to clear itself.
 */

import { toHex } from '../lib/bytes.js';
import { ingestBytes } from '../read/parse.js';
import { runRead } from '../read/verify.js';
import { HRP } from '../read/classify.js';
import { buildDemoOffer, buildUnprovenTransaction, makeDemoSeed } from './demo.js';
import { encodeMemo } from './memo.js';
import { companionProofFromProvingResponse } from './proofcodec.js';
import { PATH_PROVE, PATH_PROVE_TX, ProvingError, PROVING_CODES, provingPost } from './prover.js';

/** The steps, in order, so the UI can draw a checklist rather than a spinner. */
export const STEPS = Object.freeze([
    { id: 'memo', label: 'Check the memo length' },
    { id: 'construct', label: 'Build the demo coin, the spend and the memo anchor' },
    { id: 'prove-tx', label: 'Prove the transaction (proof server)' },
    { id: 'prove-companion', label: 'Prove the memo companion (proof server)' },
    { id: 'wrapper', label: 'Assemble the memo wrapper' },
    { id: 'selfcheck', label: 'Verify the result with this page’s own Read pipeline' },
]);

export class CreateCancelled extends Error {
    constructor() {
        super('Cancelled.');
        this.name = 'CreateCancelled';
        this.code = PROVING_CODES.CANCELLED;
    }
}

/**
 * Run the Create flow.
 *
 * @param {object}   opts.wasm       loaded ledger module
 * @param {string}   opts.memoText   what the user typed
 * @param {'text'|'hex'} opts.memoMode
 * @param {string}   opts.proofServerUrl
 * @param {'deterministic'|'random'} [opts.seedMode]
 * @param {(update:object)=>void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @returns {Promise<object>} the artifacts, already self-verified
 */
export async function runCreate({
    wasm,
    memoText,
    memoMode = 'text',
    proofServerUrl,
    seedMode = 'deterministic',
    onProgress = () => {},
    signal,
}) {
    const timings = {};
    const startedAt = performance.now();

    const step = (id, status, detail) => onProgress({ id, status, detail });
    const bail = () => {
        if (signal && signal.aborted) throw new CreateCancelled();
    };

    // -- 1. the memo, before anything else ---------------------------------
    step('memo', 'running');
    bail();
    const memo = encodeMemo(memoText, memoMode);       // throws MemoError, typed
    step('memo', 'done', `${memo.length} bytes`);

    // -- 2/3. construction, entirely local ----------------------------------
    step('construct', 'running');
    bail();
    const t0 = performance.now();
    const seed = makeDemoSeed(seedMode);
    const demo = buildDemoOffer(wasm, memo, seed);
    const unprovenTx = buildUnprovenTransaction(wasm, demo.offer);
    const txPayload = wasm.createProvingTransactionPayload(unprovenTx, new Map());
    const companionPayload = wasm.createMemoCompanionProvingPayload(demo.finalizedPreimage, memo, undefined);
    timings.construct = Math.round(performance.now() - t0);
    step('construct', 'done', `${demo.summary.offerBytes} byte offer, anchor committed to ${toHex(demo.h).slice(0, 16)}…`);

    // -- 4. prove the transaction ------------------------------------------
    step('prove-tx', 'running', `sending ${txPayload.length} bytes`);
    bail();
    const provenTx = await provingPost(proofServerUrl, PATH_PROVE_TX, txPayload, signal);
    timings.proveTx = provenTx.ms;
    step('prove-tx', 'done', `${provenTx.bytes.length} bytes back in ${(provenTx.ms / 1000).toFixed(1)} s`);

    // -- 5. prove the companion --------------------------------------------
    step('prove-companion', 'running', `sending ${companionPayload.length} bytes`);
    bail();
    const companion = await provingPost(proofServerUrl, PATH_PROVE, companionPayload, signal);
    timings.proveCompanion = companion.ms;
    step('prove-companion', 'done', `${companion.bytes.length} bytes back in ${(companion.ms / 1000).toFixed(1)} s`);

    // -- 6. the wrapper, assembled locally ---------------------------------
    step('wrapper', 'running');
    bail();
    // Q-W11: the proof server answers in the versioned encoding; the wrapper
    // format wants the plain one. See src/create/proofcodec.js for why this is
    // here and what makes it safe until an upstream binding replaces it.
    const companionProof = companionProofFromProvingResponse(companion.bytes);
    const wrapperBytes = wasm.memoWrapperBuild(
        memo,
        demo.nullifier,
        demo.segment,
        demo.statementTail,
        companionProof,
        undefined,
    );
    step('wrapper', 'done', `${wrapperBytes.length} bytes`);

    // -- 7. verify our own output ------------------------------------------
    step('selfcheck', 'running');
    bail();
    const selfCheck = runRead(wasm, {
        offerArtifact: ingestBytes(provenTx.bytes, 'the offer file this page just created'),
        wrapperArtifacts: [ingestBytes(wrapperBytes, 'the memo wrapper this page just created')],
    });

    const authenticatedItem = selfCheck.items.find(
        (item) => item.kind === 'wrapper' && item.record && toHex(item.record.memo) === toHex(memo),
    );
    if (!selfCheck.ok || !authenticatedItem) {
        const reason =
            (selfCheck.error && selfCheck.error.message) ||
            (selfCheck.items.find((i) => i.failure) || {}).failure?.message ||
            'the produced pair did not authenticate';
        throw new ProvingError(
            'SELF_CHECK_FAILED',
            `This page could not verify its own output, so it is not showing it: ${reason}. ` +
            `That usually means the proof server did not honour the memo-hash override — a proof it returns ` +
            `can be a perfectly valid proof of the wrong statement.`,
            { reason },
        );
    }
    step('selfcheck', 'done', 'authenticated in this browser');

    timings.total = Math.round(performance.now() - startedAt);

    // -- the artifacts ------------------------------------------------------
    const offerBech32m = wasm.memoWrapperToBech32m(provenTx.bytes, HRP.OFFER);
    const wrapperBech32m = wasm.memoWrapperToBech32m(wrapperBytes, HRP.WRAPPER);

    return {
        memo,
        memoHex: toHex(memo),
        seedHex: demo.seedHex,
        seedMode,
        segment: demo.segment,
        nullifier: demo.input.nullifier,
        h: toHex(demo.h),
        demoSummary: demo.summary,
        timings,
        artifacts: {
            offer: {
                kind: 'offer-file',
                hrp: HRP.OFFER,
                filename: 'memo-offer.swapoffer.bin',
                bytes: provenTx.bytes,
                bech32m: offerBech32m,
            },
            wrapper: {
                kind: 'memo-wrapper',
                hrp: HRP.WRAPPER,
                filename: 'memo-wrapper.swapmsg.bin',
                bytes: wrapperBytes,
                bech32m: wrapperBech32m,
            },
        },
        selfCheck,
        selfCheckState: authenticatedItem.state,
    };
}
