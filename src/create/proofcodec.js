/**
 * proofcodec.js — the one place this page re-encodes bytes the ledger produced.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS FILE EXISTS, AND WHY IT SHOULD NOT
 * ---------------------------------------------------------------------------
 * A proof server answers `POST /prove` with a tagged `ProofVersioned`. A memo
 * wrapper must carry a tagged `Proof`. They are the same proof in two
 * encodings, and **no `ledger-wasm` export converts between them**:
 *
 *   - the WASM `Proof` class holds a `ProofVersioned` (upstream
 *     `ledger/src/structure.rs`: `impl ProofKind for ProofMarker { type Proof
 *     = ProofVersioned; }`), so `Proof.deserialize(x).serialize()` returns the
 *     versioned bytes again;
 *   - `ZswapInput.proof` on a *proven* input converts the inner proof INTO the
 *     versioned form on its way to JavaScript
 *     (`ledger-wasm/src/zswap_wasm.rs`), so the proven-offer route closes too.
 *
 * So the conversion has to happen somewhere, and until an upstream binding
 * does it, it happens here. This is recorded as **Q-W11** in the project's
 * questions file with the recommendation that the fork add
 * `memoCompanionProofFromProvingResponse`, at which point this whole file is
 * deleted and its single call site changes to that binding.
 *
 * ---------------------------------------------------------------------------
 * WHAT MAKES THIS ACCEPTABLE IN THE MEANTIME
 * ---------------------------------------------------------------------------
 * It is a re-tag, not a derivation. Nothing here computes anything about the
 * proof: 26 bytes come off the front, 19 different bytes go on, and the 4834-
 * byte body is copied verbatim. Compare `memoSpendStatementTail`, which had to
 * be added upstream precisely because it *derives* 67 statement rows — get that
 * wrong and you get plausible bytes that are quietly incorrect.
 *
 * And it is **fail-closed by construction**, which is the property that matters:
 *
 *   1. this function refuses anything that is not exactly the expected prefix,
 *      so an unfamiliar future encoding stops here rather than becoming
 *      plausible-looking output;
 *   2. the very next thing that touches the result is `memoWrapperVerify`,
 *      which runs `tagged_deserialize::<Proof>` and then verifies the proof
 *      under the compiled-in `SPEND_VK` at row 0 = MemoHashV1(memo). A wrong
 *      re-tag cannot survive that — a single flipped byte produces
 *      `companion proof does not bind this memo: Invalid proof`;
 *   3. the page never displays a wrapper it has not itself verified end to end
 *      (see `src/create/build.js`, the self-check step).
 *
 * Measured evidence for every claim above is in the project's Phase 3
 * evidence directory (`3.1-proof-encoding-probe.log`, 8/8 checks including the
 * three negative controls).
 */

import { asciiPrefix, byteCount } from '../lib/bytes.js';

/**
 * The tag `tagged_serialize` writes for `ProofVersioned`, followed by a
 * one-byte variant discriminant. Upstream `ledger/src/structure.rs`:
 *
 *     #[tag = "proof-versioned"]
 *     pub enum ProofVersioned { V2(Proof), V3(Proof) }
 *
 *     impl Serializable for ProofVersioned {
 *         ProofVersioned::V2(proof) => { 1u8.serialize(w)?; proof.serialize(w) }
 *         ProofVersioned::V3(proof) => { 2u8.serialize(w)?; proof.serialize(w) }
 *     }
 *
 * i.e. the body after the discriminant is the inner `Proof`'s *untagged*
 * bytes — which is exactly what the plain `Proof` tag is followed by. That is
 * why this conversion is a prefix swap and nothing more.
 */
export const VERSIONED_TAG = 'midnight:proof-versioned:';

/** The tag a memo wrapper's companion proof must carry. */
export const PLAIN_TAG = 'midnight:proof[v5]:';

/**
 * `ProofVersioned::V2`. Deliberately the ONLY accepted discriminant: `V2` is
 * what the pinned proof server emits (`proof-server/src/endpoints.rs` ends
 * `/prove` with `ProofVersioned::V2(proof)`), and a `V3` proof is a different
 * circuit generation whose bytes this page has never verified. Guessing that
 * the same prefix swap would be correct for it is exactly the kind of silent
 * assumption this file is trying not to make.
 */
export const ACCEPTED_DISCRIMINANT = 0x01;

/** Longest response we will even look at, so a hostile server cannot balloon us. */
export const MAX_PROOF_BYTES = 1 << 20;

export class ProofCodecError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ProofCodecError';
        this.code = 'PROOF_ENCODING_UNEXPECTED';
    }
}

/**
 * Convert a proof server's `/prove` response into the companion-proof bytes
 * `memoWrapperBuild` expects.
 *
 * @param {Uint8Array} response the raw body of `POST /prove`
 * @returns {Uint8Array} the same proof, tagged as a plain `Proof`
 * @throws {ProofCodecError} if the response is not the encoding we know
 */
export function companionProofFromProvingResponse(response) {
    if (!(response instanceof Uint8Array)) {
        throw new ProofCodecError('The proving response was not raw bytes.');
    }
    if (response.length === 0) {
        throw new ProofCodecError('The proof server returned an empty body.');
    }
    if (response.length > MAX_PROOF_BYTES) {
        throw new ProofCodecError(
            `The proof server returned ${byteCount(response.length)}, far more than a proof can be. It was not read.`,
        );
    }

    // Already the wrapper's encoding? Then a future upstream binding, or a
    // different server, has handed us exactly what we need — pass it through
    // untouched rather than mangling it.
    if (asciiPrefix(response, PLAIN_TAG.length) === PLAIN_TAG) {
        return response;
    }

    if (asciiPrefix(response, VERSIONED_TAG.length) !== VERSIONED_TAG) {
        throw new ProofCodecError(
            `The proof server's answer does not start with a tag this page knows. ` +
            `Expected "${VERSIONED_TAG}" (or "${PLAIN_TAG}"), got "${printable(asciiPrefix(response, 32))}". ` +
            `No proof was accepted.`,
        );
    }

    const discriminant = response[VERSIONED_TAG.length];
    if (discriminant !== ACCEPTED_DISCRIMINANT) {
        throw new ProofCodecError(
            `The proof server returned proof version ${discriminant}, and this page has only ever verified version ` +
            `${ACCEPTED_DISCRIMINANT}. Rather than guess that the encoding is unchanged, it refuses the proof.`,
        );
    }

    const body = response.subarray(VERSIONED_TAG.length + 1);
    if (body.length === 0) {
        throw new ProofCodecError('The proving response carried a tag and a version and no proof.');
    }

    const out = new Uint8Array(PLAIN_TAG.length + body.length);
    for (let i = 0; i < PLAIN_TAG.length; i++) out[i] = PLAIN_TAG.charCodeAt(i);
    out.set(body, PLAIN_TAG.length);
    return out;
}

/** Replace non-printable bytes so an error message cannot carry control characters. */
function printable(text) {
    let out = '';
    for (const ch of text) {
        const code = ch.charCodeAt(0);
        out += code >= 0x20 && code < 0x7f ? ch : '.';
    }
    return out;
}
