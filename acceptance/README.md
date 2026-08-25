# The acceptance gate

The browser proves the memo authenticates. This proves the bytes are
**consensus-clean**: it hands the offer file the page just made to the pinned,
**unmodified** ledger's own `well_formed`, and the pair to the detached memo
verifier, and replays the frozen conformance vectors.

```sh
# with the pinned proof server already running (see ../docker/)
PROOF_SERVER=http://localhost:6300 npm run acceptance
```

That builds the page, drives **one real Create run** in a real headless Chrome,
adds the six frozen reference fixtures as further subjects, builds a container
and runs every check inside it with `--network none`. Output and logs land in
the directory you point it at (`acceptance/run-gate.sh <out-dir>`; the npm
script uses `.acceptance-out/`).

## What it checks

| | |
| --- | --- |
| **(a)** | the offer file **deserializes** as a `Transaction` under the pinned ledger, and re-serializes byte-identically |
| **(b)** | it passes the pinned ledger's **`well_formed`** with real proof verification |
| **(c)** | the pair passes **detached companion verification** — the memo is authenticated, with a matching anchor |
| **(d)** | the frozen **conformance vectors** replay byte-exactly, and the anchor in the transaction is the frozen `AnchorV1` encoding of `(nullifier, MemoHashV1(memo))` |

Plus the controls that make those mean something: the carrier's spend proof is
**rejected** at row 0 = `MemoHashV1(memo)`, the companion proof is **rejected**
at row 0 = 0, and one flipped memo byte yields no authenticated memo. A verifier
that ignored row 0 would pass every acceptance above and fail every rejection.

Tampered artifacts are built at run time from the frozen bytes. Nothing broken
is committed: a defect you can see in the source beats a file you have to take
on trust.

## The strictness decision

`Transaction::well_formed` takes a `WellFormedStrictness` with six switches.
This gate leaves **five at their strict defaults** and turns off exactly one:

```
enforce_balancing:       false      <-- the only one turned off
verify_native_proofs:    true
verify_contract_proofs:  true
verify_signatures:       true
enforce_limits:          true
proof_verification_mode: Real
```

**Why.** What Create produces is an *offer*: one input worth 4242 of a demo
shielded token and one zero-value anchor output. It does not balance and is not
meant to — a swap offer is a partial transaction that a counterparty completes.
Asking `enforce_balancing` of it is asking whether half a trade is a whole
trade. The ledger's own test utilities set this same single flag whenever the
transaction under test is deliberately imbalanced.

**Why that is not a weakening**, read out of the pinned source rather than
assumed:

- the **zswap proof check is not governed by strictness at all**. `well_formed`
  calls `zswap_well_formed` unconditionally, which verifies every input under
  the shipped `SPEND_VK` and every output under `OUTPUT_VK`, **with statement
  row 0 = 0**. The canonical `binding_input = 0` invariant is therefore checked
  here by the ledger's own verifier, and no flag can skip it;
- `pedersen_check` is likewise unconditional;
- `enforce_balancing` gates exactly one branch: a **negative** per-(token,
  segment) balance.

And the gate does not ask you to take that on faith. Check **T4** re-runs the
same transaction at the **full default strictness** and the gate goes red unless
it fails *and* fails on balancing. Measured, the negative balance is the **fee**
(`token_type: Dust`) — the traded token comes out at `+4242`, over-provided,
which is not an overspend at all. Check **T5** prints the whole balance map on
every subject, so the imbalance is a number in the log rather than an
assumption.

## What this gate does *not* claim

That the transaction would **apply**. The coin it spends lives in a commitment
tree that was created in a browser tab and exists on no chain, so a real node
would reject it at the merkle-root check. That is by design, and the page says
so next to every artifact. The claim here is the narrow, checkable one: *the
memo machinery changed nothing consensus-visible.*

## Why this directory needs more than a clone of this repository

Everything else here builds from a clone alone. This does not.

"Unmodified ledger" has to be structural rather than asserted, so
`Cargo.toml`'s path dependencies resolve to a **pristine** clone of the upstream
baseline `4823b5351b17cc49e30f19760dbd30a73cf95e22` — *not* to the fork branch
the page's WASM bundle is built from. If they pointed at the fork, "the memo
machinery changed nothing consensus-visible" would be a tautology. The memo half
comes from the project 00003 toolkit, which is itself written against that same
pristine clone and is not published anywhere yet.

So this gate expects the 00003 workspace beside the repository, in the layout
`../../../00003-spend-proof-memo-binding/` names — the same arrangement
`fixtures/generator/` uses, for the same reason. Set `WEBMEMO_00003` to point
elsewhere. The page, the build, and both browser test suites depend on none of
it.

Both trees are treated as **read-only**: the container copies them in, the cargo
target directory lives outside them, and `run-gate.sh` asserts their commits and
clean state **before and after** every run — so "read-only" is a result rather
than a promise.

## House rules the runner keeps

- the only port anything binds is the static server inside the browser harness,
  which picks a random port above 10000 and verifies it is free by binding it
  first; the gate container publishes nothing;
- the image is tagged with a per-run stamp and removed as soon as the gate
  finishes, so teardown can only ever delete what the run created;
- no volumes, no custom networks, `--rm`, `--network none`;
- the shared Docker build cache is never pruned;
- the exit status comes from a boolean, not from a sum of exit codes — a sum
  truncates to 8 bits and can land on 0 while the summary says FAILED.

## Files

```
Cargo.toml        the path dependencies, and why they point where they do
src/main.rs       every check, with the strictness reasoning in the header
Dockerfile        the sealed build; asserts the 00003 pins and fails otherwise
run-gate.sh       artifacts -> image -> gate -> teardown -> exit status
```
