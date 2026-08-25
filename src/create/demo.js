/**
 * demo.js — the demo wallet, the demo ledger state, and the unproven offer.
 *
 * Task 3.1. This is the whole of owner decision Q-W1 = A: the coin this page
 * spends is minted, in this browser, into a ledger state that exists nowhere
 * else. That is what lets a stranger press Create on a static page with nothing
 * installed and get a real, proof-valid artifact back.
 *
 * ---------------------------------------------------------------------------
 * WHAT THE RESULT IS AND IS NOT
 * ---------------------------------------------------------------------------
 * The transaction this produces is **format-valid and proof-valid**: its spend
 * proof verifies, its companion proof verifies, its bytes are exactly what the
 * pinned unmodified ledger deserializes. It is also **anchored to a commitment
 * tree that has one coin in it and has never existed on any chain**, so it
 * could never settle. The page says so next to every artifact; this module says
 * so here because that is where the property comes from.
 *
 * ---------------------------------------------------------------------------
 * SEEDS
 * ---------------------------------------------------------------------------
 * The seed is 32 bytes and it is a demo seed. Two modes:
 *
 *   - `deterministic` (default): a fixed, published pattern. Every visitor who
 *     presses Create with the same memo gets the same nullifier and the same
 *     memo-hash. That makes the page reproducible and makes its output easy to
 *     compare against a reference — and it also means the seed is public, which
 *     is fine, because it controls a coin that does not exist.
 *   - `random`: `crypto.getRandomValues`. Different artifacts every run.
 *
 * There is deliberately **no field for a user-supplied seed**. A page that
 * accepts a seed is a page someone will paste a real one into, and the value it
 * would add here is zero: the coin is imaginary either way. The spec's "never
 * enter a real-funds seed" warning is best honoured by not providing the box.
 */

import { fromHex, toHex } from '../lib/bytes.js';

/**
 * The published demo seed. `(i * 7 + 5) & 0xff` — the same pattern the Phase 0
 * feasibility spike used, so artifacts from this page and from the project's
 * own probes are directly comparable.
 */
export const DEMO_SEED_HEX = (() => {
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 5) & 0xff;
    return toHex(seed);
})();

/** The demo coin's value. Arbitrary: nothing balances against it. */
export const DEMO_COIN_VALUE = 4242n;

/**
 * The network id stamped into the transaction. Deliberately not a real
 * network's id, so these artifacts cannot be mistaken for mainnet or testnet
 * ones. It matches the id the repository's frozen reference fixtures carry.
 */
export const NETWORK_ID = 'webmemo-demo';

/**
 * The segment the spend, the anchor output and the wrapper all live at.
 *
 * 0 = the transaction's *guaranteed* slot, which is the one
 * `Transaction.fromParts` fills when you hand it a guaranteed offer. The
 * fallible slot is reachable too (the repository's fixtures use segment 3), but
 * `fromParts` hardcodes fallible offers to segment 1, so picking the guaranteed
 * slot is the choice that leaves no gap between "the segment I asked for" and
 * "the segment the bytes actually carry".
 */
export const SEGMENT = 0;

/** A 32-byte demo seed. `mode` is `'deterministic'` or `'random'`. */
export function makeDemoSeed(mode = 'deterministic') {
    if (mode === 'random') {
        const seed = new Uint8Array(32);
        crypto.getRandomValues(seed);
        return seed;
    }
    return fromHex(DEMO_SEED_HEX);
}

/**
 * Build the unproven offer: one demo spend plus the `AnchorV1` output that
 * commits to the memo.
 *
 * The chain mirrors 00003's own Rust construction step for step, which is what
 * makes the bytes conformant rather than merely plausible:
 *
 *   | 00003 (Rust)                     | here (JS)                            |
 *   | -------------------------------- | ------------------------------------ |
 *   | `Seed::random(rng).into()`       | `ZswapSecretKeys.fromSeed(seed)`     |
 *   | `CoinInfo { .. }`                | `createShieldedCoinInfo(type, value)`|
 *   | `State::new().insert_coin(..)`   | `new ZswapLocalState().insertCoin()` |
 *   | `coin.qualify(0)`                | `{ ...coin, mt_index: 0n }`          |
 *   | `state.spend(rng, keys, &q, seg)` | `state.spend(keys, qualified, seg)`  |
 *   | `Output::new_memo_anchor(..)`    | `createMemoAnchorOutput(..)`         |
 *   | `Offer::new(vec![input], ..)`    | `fromInput(..).merge(fromOutput(..))`|
 *
 * On "finalize": there is no offer-level `seal` in this surface and none is
 * needed. The segment is baked into each preimage at construction and
 * `binding_input` is already 0, so **the preimage carried by the unproven input
 * already is the finalized preimage** — the FR-003 canonical invariant holds by
 * construction rather than by a step that could be forgotten.
 *
 * @param {object} wasm    the loaded ledger module
 * @param {Uint8Array} memo the memo bytes (already length-validated)
 * @param {Uint8Array} seed 32 demo seed bytes
 * @returns {object} everything the proving and wrapper steps need
 */
export function buildDemoOffer(wasm, memo, seed) {
    const keys = wasm.ZswapSecretKeys.fromSeed(seed);

    // `shieldedToken()` returns the STRUCTURED token type `{tag, raw}`, while
    // `createShieldedCoinInfo` parses the bare 64-hex `raw`. Handing it the
    // structured value throws `failed to fill whole buffer`, which reads like a
    // randomness failure and is not one. See docs/js-api-notes.md §2.
    const coin = wasm.createShieldedCoinInfo(wasm.shieldedToken().raw, DEMO_COIN_VALUE);

    const state = new wasm.ZswapLocalState().insertCoin(keys, coin);

    // `mt_index` is snake_case here and nowhere else in the surface; the
    // parameter is typed `any`, so nothing warns you. docs/js-api-notes.md §5.
    const [spentState, input] = state.spend(keys, { ...coin, mt_index: 0n }, SEGMENT);

    const nullifier = fromHex(input.nullifier);
    const h = wasm.memoHashV1(memo);

    // The TAGGED token type. At fork pin 32fdefc3 this is the only accepted
    // form: a bare `coin.type` is refused with a message naming the tag.
    // docs/js-api-notes.md §1.
    const tokenType = wasm.memoAnchorTokenTypeOf(coin);
    const anchorOutput = wasm.createMemoAnchorOutput(SEGMENT, tokenType, nullifier, h);

    const offer = wasm.ZswapOffer.fromInput(input).merge(wasm.ZswapOffer.fromOutput(anchorOutput));

    // The finalized preimage the companion proof must be built over, read off
    // the input the offer now holds.
    const finalizedPreimage = offer.inputs[0].proof.serialize();

    // The statement tail the wrapper carries, from the binding added upstream
    // for exactly this (fork commit 121aa16). Taken from the UNPROVEN input,
    // before anything is sent anywhere: rows 1.. depend only on the input's
    // public fields and the segment, never on row 0, so proving does not change
    // them. docs/js-api-notes.md §8.
    const statementTail = wasm.memoSpendStatementTail(offer.inputs[0], SEGMENT);

    return {
        keys,
        coin,
        state,
        spentState,
        input,
        offer,
        nullifier,
        h,
        tokenType,
        finalizedPreimage,
        statementTail,
        segment: SEGMENT,
        seedHex: toHex(seed),
        summary: {
            coinValue: DEMO_COIN_VALUE.toString(),
            nullifier: input.nullifier,
            hHex: toHex(h),
            offerBytes: offer.serialize().length,
            inputs: offer.inputs.length,
            outputs: offer.outputs.length,
            statementTailBytes: statementTail.length,
            finalizedPreimageBytes: finalizedPreimage.length,
        },
    };
}

/**
 * Wrap the unproven offer in the Transaction envelope that MIP-0005 calls an
 * offer file (owner decision Q-W8 = A).
 *
 * `fromParts` accepts only UNPROVEN offers, which is the right way round for
 * this flow: the transaction is assembled first and proven as a whole. The
 * opposite order — proving an offer and then trying to put it into a
 * transaction — is closed from JavaScript entirely (docs/js-api-notes.md §12),
 * and this flow never needs it.
 */
export function buildUnprovenTransaction(wasm, offer) {
    return wasm.Transaction.fromParts(NETWORK_ID, offer, undefined, undefined);
}
