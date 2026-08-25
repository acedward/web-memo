# `fixtures/generator/` — how the reference artifacts were made

This is a **verbatim archive**, not a buildable part of this repository.
Nothing in `npm run build` or `npm test` reads it, and `cargo` is not a
dependency of this project.

It is committed because the bytes in `fixtures/` are frozen binary artifacts,
and a frozen binary artifact without its recipe is something you have to take on
trust. The SHA-256 of `src/main.rs` is recorded in `../PROVENANCE.md`, and this
copy is byte-identical to the program that ran, so that hash means something.

## It cannot be run from here

The paths in `Cargo.toml` and `generate.sh` are relative to the directory the
program was actually run from — `experiments/00005-web-memo/spike/txfixture/` in
the 00005 working area — and they point at two repositories that are **not
public yet**:

* the pinned Midnight ledger clone, detached at
  `4823b5351b17cc49e30f19760dbd30a73cf95e22` (tag `ledger-9.1.0.0-rc.3`);
* the 00003 toolkit `zswap-memo-companion` at
  `5dd870f827cd6794fcfba60076d9b3f9c914659c`.

Rewriting those paths to make the archive look runnable would make it stop being
the thing that ran, which is the only property it has.

## What `generate.sh` enforces

* both 00003 trees are at their exact pins and `git status` is **clean** before
  any work — and again **after**, so "this generator only read those trees" is a
  result rather than a promise;
* the ledger baseline commit is asserted against a hard-coded expected value,
  and the script refuses to run otherwise;
* the pins and the generator's own SHA-256 are stamped into the emitted
  `META.txt`, beside the bytes they produced;
* `CARGO_TARGET_DIR` is set outside both trees, so building leaves no `target/`
  inside them.

## What the program itself does, and does not do

It does **not** implement any part of the memo format. The construction —
`user_owned_spend` → `plan_memo_binding` → `FinalOffer::seal` → `Offer::prove` →
`prove_companion` → `MemoWrapperV1::build` — is entirely the 00003 toolkit's own
public API. The only thing added here is the MIP-0005 Transaction envelope
around the already-proven offer. See `../PROVENANCE.md` for why that step cannot
be done from JavaScript.
