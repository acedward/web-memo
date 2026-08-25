# Provenance of `fixtures/`

These are the reference artifacts the page offers under **Try it**, and the
corpus its test suite runs against. They are **frozen bytes**: committed once,
never regenerated in CI, and covered by `SHA256SUMS` in this directory.

Every one of them is **format-valid and proof-valid, and anchored to a
throwaway demo state that no chain has ever seen**. They could not settle
anywhere. That is deliberate — the Read section is meant to be exercisable by
anyone, with no node, no funds and no proving.

## What each file is

An **offer file** is a full proven transaction (MIP-0005; owner decision Q-W8).
`*.offer-tx.bin` is that transaction. `*.offer-bare.bin` is the tagged
`zswap::Offer` sitting inside it, kept for two reasons: the test suite asserts
that what the page extracts from the transaction is byte-identical to it, and
the page uses one of them as a **negative** example (bare offer bytes are
refused as "not an offer file").

| fixture | shape | what it demonstrates |
| --- | --- | --- |
| `reference` | fallible segment 3; 1 input, 1 output, 1 anchor; memo `hello world` | the known-good pair. Its memo-hash is 00003's frozen `memo-hash/ascii-hello-world` vector `65d3c33a…5455`, so a page that reproduces it is running the format 00003 froze |
| `unrelated` | fallible segment 3; an independent construction | the wrong-pairing case, and a source of a *readable but wrong* companion proof for the graft test |
| `hostile-memo` | fallible segment 3; a 148-byte memo | an **authenticated** memo made of `<script>`, `<img onerror=…>`, an ANSI SGR sequence, U+202E, U+200B, `&lt;`, NUL, BEL, tab and newline. Authentication says a spending witness authorized these bytes — nothing more |
| `two-inputs-same-memo` | fallible segment 3; **2 inputs, 2 outputs, 2 anchors**, the SAME memo on both | per-input attribution: one memo-hash, two nullifiers, two wrappers |
| `no-anchor` | fallible segment 3; 1 input, no outputs | the no-evidence case |
| `guaranteed-segment` | the **guaranteed** slot (segment 0) | the other half of the extraction seam: `Transaction.guaranteedOffer` rather than the fallible map |

## Pins

| | |
| --- | --- |
| Ledger baseline (pristine clone the toolkit builds against) | `4823b5351b17cc49e30f19760dbd30a73cf95e22` — tag `ledger-9.1.0.0-rc.3`, published as `@midnightntwrk/ledger-v9@1.0.0-rc.3` |
| 00003 toolkit (`zswap-memo-companion`) | `5dd870f827cd6794fcfba60076d9b3f9c914659c` |
| Rust toolchain | 1.95.0 |
| Network id in the transactions | `webmemo-demo` |
| Master RNG seed | `0x0000000005c00002` |
| Transaction type | `Transaction<Signature, ProofMarker, PedersenRandomness, InMemoryDB>` — markers `signature` / `proof` / `pre-binding` |
| Generator `src/main.rs` sha256 | `667cedf9070a429224b7b840f19db3ba1f943db94f2e0b50e3a41c4e30932ca5` |

The same pins are restated inside `META.txt`, which the generator writes itself,
so the metadata beside the bytes cannot drift from this file without the two
disagreeing visibly.

## How they were made

`generator/` is a **verbatim copy** of the program that produced them. Its
relative paths are written for the directory it was run from
(`experiments/00005-web-memo/spike/txfixture/` in the 00005 working area), and
the copy here is byte-identical to what ran, so its SHA-256 above is meaningful.

The memo construction is **not** done here. Every memo byte, every anchor, every
wrapper and both proofs come from the 00003 toolkit's own public API —
`user_owned_spend` → `plan_memo_binding` → `FinalOffer::seal` → `Offer::prove` →
`prove_companion` → `MemoWrapperV1::build` — which is the implementation 00003
froze, certified and had independently reviewed. Proofs are real, produced by
the local Rust prover over the **shipped** Zswap key material, exactly as
00003's own Phase 6 fixture was.

What this generator adds is only the envelope:

```rust
StandardTransaction {
    network_id,
    intents: {},                       // none
    guaranteed_coins / fallible_coins, // the PROVEN offer
    binding_randomness,                // the UNPROVEN offer's randomness
}
```

which is precisely what `Transaction::new(..).prove(..)` would have carried
through: `Transaction::new` computes the binding randomness on the
preimage-typed transaction, and proving does not rewrite it.

**Why a separate program rather than the page's own JavaScript?** Two doors are
shut in `ledger-wasm`. A proven offer cannot be put into a Transaction from JS —
`Transaction.fromParts` refuses proven offers, `mockProve()` returns a *bound*
transaction and every offer setter refuses a bound one, and re-reading
mock-proven bytes as `pre-binding` fails on the header tag because binding is
part of the serialization rather than a view. And a *new* wrapper cannot be
built from JS at all, because `memoWrapperBuild` needs a statement tail that no
binding exports. See `docs/js-api-notes.md`.

## Reproducibility, stated exactly

The construction is **deterministic**: a re-run reproduces every nullifier,
every memo-hash and every memo byte identically. The **proofs are not** — halo2
proving is randomised, so a re-run produces different proof bytes and therefore
different file hashes. 00003 recorded the same property for its own fixture.

So `SHA256SUMS` here pins *these* bytes, not "whatever the generator emits". If
you re-run the generator, expect the metadata in `META.txt` to match and the
sums not to.

Re-running also needs two repositories that are **not public yet**: the pinned
Midnight ledger clone and the 00003 toolkit. Until they are, this directory is
the artifact and `generator/` is the record of how it was made.

## Tampered variants

There are none, on purpose. Every tampered artifact the test suite uses is built
**at test time**, in the browser, from these files (`test/inpage-matrix.js`): a
memo with one bit flipped, a grafted companion proof, a perturbed statement row,
a re-attributed nullifier, a spliced wrapper section, a truncated transaction.

A committed "bad wrapper" is a file whose defect you have to take on trust. A
wrapper the test flips one bit in is a file whose defect is visible in the
source diff.
