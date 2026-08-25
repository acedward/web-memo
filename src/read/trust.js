/**
 * trust.js — the six 00003 trust states, and what each one is worth.
 *
 * These are not this page's invention: they are `MemoTrustState` from the 00003
 * toolkit (`src/verify.rs`), which the 00003 spec FR-017 requires to be six
 * DISTINGUISHABLE outcomes. This module keeps the names, keeps the ordering,
 * and adds two things a web page owes a stranger:
 *
 *   * plain language — "what this proves" and, more importantly, "what this
 *     does NOT prove", because every one of these states is routinely
 *     over-read;
 *   * REACHABILITY — an offer file is not chain evidence, so this page can
 *     never legitimately reach `SettledAuthenticatedWithMatchingAnchor`. It is
 *     listed anyway, marked unreachable, because hiding a state the format
 *     defines would be its own kind of overclaim (00005 spec FR-006).
 */

export const STATES = Object.freeze({
    NO_EVIDENCE: 'NoEvidence',
    MALFORMED_OR_UNTRUSTED: 'MalformedOrUntrusted',
    COMMITTED_BUT_MISSING: 'CommittedButMissing',
    COMPANION_AUTHENTICATED_UNANCHORED: 'CompanionAuthenticatedUnanchored',
    AUTHENTICATED_WITH_MATCHING_ANCHOR_UNCONFIRMED: 'AuthenticatedWithMatchingAnchorUnconfirmed',
    SETTLED_AUTHENTICATED_WITH_MATCHING_ANCHOR: 'SettledAuthenticatedWithMatchingAnchor',
});

/**
 * The six states in 00003's own order, with everything the report needs.
 *
 * `authenticated` is the single flag that gates memo display: only a state with
 * `authenticated: true` may show memo bytes as authentic. `CommittedButMissing`
 * is deliberately false — a published commitment is not the memo.
 */
export const STATE_INFO = Object.freeze({
    [STATES.NO_EVIDENCE]: {
        label: 'No memo evidence',
        tone: 'neutral',
        authenticated: false,
        reachable: true,
        proves: 'Nothing about a memo. This offer file carries no memo anchor, and no memo wrapper was supplied.',
        doesNotProve: 'It does not prove no memo ever existed. An offer file with no anchor simply never committed to one; a memo could still have been sent alongside it by other means, with nothing on-chain to check it against.',
    },
    [STATES.MALFORMED_OR_UNTRUSTED]: {
        label: 'Malformed or untrusted — NOT authenticated',
        tone: 'bad',
        authenticated: false,
        reachable: true,
        proves: 'That the wrapper you supplied did not pass. The reason is stated exactly, and it comes from the verifier itself.',
        doesNotProve: 'It says nothing about who is at fault. A failure here is equally consistent with a corrupted copy-paste, a truncated download, an unrelated pairing, and a deliberate forgery. No memo from this wrapper is shown as authenticated.',
    },
    [STATES.COMMITTED_BUT_MISSING]: {
        label: 'Committed but missing — the memo bytes are absent',
        tone: 'warn',
        authenticated: false,
        reachable: true,
        proves: 'That the transaction publishes a commitment (nullifier, memo-hash). Someone building this offer committed to a memo for that input.',
        doesNotProve: 'It does not reveal the memo, and it does not say who created the anchor, whether wrapper bytes were ever delivered, or that their absence was deliberate. The commitment is not the memo: no memo bytes exist in this state, by design.',
    },
    [STATES.COMPANION_AUTHENTICATED_UNANCHORED]: {
        label: 'Companion authenticated, but UNANCHORED',
        tone: 'warn',
        authenticated: true,
        reachable: true,
        proves: 'That whoever could spend this input authorized exactly these memo bytes. The proof is checked against the verifier key compiled into this page.',
        doesNotProve: 'It is not full success: no matching anchor is present in the offer that was checked, so nothing in the transaction itself commits to this memo. A recipient has no public evidence that the memo was ever attached.',
    },
    [STATES.AUTHENTICATED_WITH_MATCHING_ANCHOR_UNCONFIRMED]: {
        label: 'Authenticated with a matching anchor — UNCONFIRMED',
        tone: 'good',
        authenticated: true,
        reachable: true,
        proves: 'Both halves: the spending witness for this input authorized exactly these memo bytes, AND the transaction carries an anchor committing to that same (nullifier, memo-hash) pair.',
        doesNotProve: 'It is NOT settlement. This page has an offer file, not a chain. Nothing here shows the transaction was accepted by any node, and nothing here is a claim that the memo is truthful — only that one spending witness authorized it.',
    },
    [STATES.SETTLED_AUTHENTICATED_WITH_MATCHING_ANCHOR]: {
        label: 'Settled, authenticated with a matching anchor',
        tone: 'good',
        authenticated: true,
        reachable: false,
        proves: 'The complete result: authenticated, anchored, and observed in a settled transaction.',
        doesNotProve: 'THIS PAGE CANNOT REACH THIS STATE. Settlement is a fact about a chain, and this page only ever sees a file. Reaching it requires observing the transaction settled on a node — which is exactly the evidence an offer file does not carry.',
    },
});

/** The six, in 00003's order, for the "states this page can and cannot reach" table. */
export const STATE_ORDER = Object.freeze([
    STATES.NO_EVIDENCE,
    STATES.MALFORMED_OR_UNTRUSTED,
    STATES.COMMITTED_BUT_MISSING,
    STATES.COMPANION_AUTHENTICATED_UNANCHORED,
    STATES.AUTHENTICATED_WITH_MATCHING_ANCHOR_UNCONFIRMED,
    STATES.SETTLED_AUTHENTICATED_WITH_MATCHING_ANCHOR,
]);

/** Whether a state may show memo bytes as authenticated. */
export function isAuthenticated(state) {
    return Boolean(STATE_INFO[state] && STATE_INFO[state].authenticated);
}
