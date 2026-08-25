# web-memo

A single static web page that **creates and verifies Zswap offers carrying an
authenticated memo** — a short message cryptographically bound to a specific
spend, provable by anyone, without leaking any key.

> ### ⚠️ Experimental demonstration. Not an official Midnight product.
>
> This page demonstrates an **unratified** message format built on an
> **unmerged fork** of the Midnight ledger. It is not endorsed by, affiliated
> with, or supported by Midnight.
>
> **Never enter a seed or secret key that controls real funds.** The demo
> wallet is for throwaway keys only. Nothing on this page is ever submitted to
> any network.

---

## Status

**Both sections work.** Read verifies a pair entirely in your browser — no
network request, no key, no wallet. Create builds one, end to end, and then
verifies its own output with Read before showing it to you.

| Section | What it does | State |
| --- | --- | --- |
| **Read** | paste or upload an offer file + memo wrapper, verify fully offline, show the memo inertly and the trust state | **working** |
| **Create** | mint a demo coin, spend it, commit your memo to that spend, prove both, emit the two artifacts | **working** — needs a proof server (see below) |

Create is the only thing on this page that makes a network request, and it makes
exactly two: the proving payloads, to the proof-server URL you configure.

### Try it without having any artifacts

The page ships a small corpus of real reference artifacts — including a
deliberately hostile memo and a two-input transaction carrying the identical memo
on both spends — behind **Try it**. They carry genuine proofs and are anchored to
a throwaway demo state, so they are format-valid and proof-valid and could never
settle anywhere. See [`fixtures/PROVENANCE.md`](fixtures/PROVENANCE.md).

### What Read reports

Exactly one of the six states defined by the format, per piece of evidence:

| state | shows a memo? | reachable from a file? |
| --- | --- | --- |
| No memo evidence | no | yes |
| Malformed or untrusted | no | yes |
| Committed but missing — the memo bytes are absent | no | yes |
| Companion authenticated, but unanchored | yes | yes |
| Authenticated with a matching anchor — **unconfirmed** | yes | yes |
| Settled, authenticated with a matching anchor | yes | **no** |

The last row is the honest one. Settlement is a fact about a chain, and this page
only ever sees a file — so it lists the state, marks it unreachable, and never
claims it. `Committed but missing` shows no memo bytes on purpose: a published
commitment is not the memo.

### Using Create

Create needs a **proof server**, because the spend circuit is far too large to
prove in a browser tab. The page never talks to a proof server you did not
configure, and the default is your own machine.

1. Start the pinned proof server — one command, from this repository:

   ```sh
   cd docker && docker compose up -d --build
   ```

   That is [`docker/`](docker/README.md): an image that **refuses to build**
   unless its checkout is the exact ledger commit this page's WASM bundle was
   built from *and* its `proof-server/` source is byte-identical to the upstream
   pinned baseline. The first build compiles from source — a couple of minutes
   on a fast machine, longer on a laptop — and later starts are instant.
   Nothing else is needed: no CORS proxy, no sidecar.
2. Put its URL in the Create section: **`http://localhost:6300`** — the proof
   server's own default port, and the page's built-in default, so if you did not
   change the port there is nothing to type. Press **Check it is running**. The
   value is remembered in this browser (`localStorage`), never sent anywhere,
   and only `http:`/`https:` URLs are accepted.
3. Type a memo — 1 to 512 **bytes**, and the counter shows bytes, because that
   is the limit that bites (128 emoji is exactly 512 bytes; 129 is refused). A
   hex mode is there for binary memos.
4. Press Create. Two proofs get made, a few seconds each. The page stays usable
   while it waits, cancelling is clean, and if anything fails you get a typed
   error and **no** artifact.

An https page may call `http://localhost` — localhost is a
potentially-trustworthy origin and is exempt from mixed-content blocking — so
this works from the deployed site against a proof server on your own machine.

**What leaves your browser, precisely.** The two proving payloads. They contain
the spend's proof preimage and, for the companion, the memo bytes. They do
**not** contain your seed or your secret keys — the test suite asserts this by
scanning every outbound request body for both. Nothing else on this page makes
any network request at all.

**What you get back** is a pair of artifacts over a coin that does not exist. The
proofs are real and verify; the commitment tree they are anchored to was created
in your browser tab a second earlier. The offer could never settle on any chain,
and the page says so next to the artifacts.

## What this page demonstrates

Zswap offers have nowhere to put a message that a counterparty can trust. The
construction behind this page adds one by **binding the memo into the spend
proof itself**:

- The transaction that goes on chain is **exactly what an unmodified node
  already accepts** — canonical spend proofs, plus one ordinary zero-value
  output whose ciphertext carries an `AnchorV1` commitment. No consensus change,
  no new wire tag, no circuit change.
- A second *companion* proof over the same finalized preimage, with its binding
  input replaced by `MemoHashV1(memo)`, travels **off chain** in a memo wrapper.
  Verifying it proves the memo was authored by whoever authorised that exact
  spend.
- Because the anchor is on chain and the wrapper is not, **stripping the memo is
  evident**: a verifier sees `CommittedButMissing` rather than "no memo".

Verification is entirely client-side and needs no network, no keys and no
wallet — the verifier key is compiled into the WASM bundle.

### Two artifacts

| Artifact | Contents | Canonical form | Display form |
| --- | --- | --- | --- |
| **Offer file** | the proven transaction | raw bytes | bech32m, HRP `swapoffer` |
| **Memo wrapper** | memo bytes + companion proof + binding metadata | raw bytes | bech32m, HRP `swapmsg` (**provisional**) |

They are deliberately kept separate so the offer file stays readable by any
other MIP-0005 tool that knows nothing about memos.

**An offer file is a full proven transaction, not a bare Zswap offer.** The page
extracts the zswap offer from the transaction — guaranteed slot or the
per-segment fallible map — before checking anything, because the verifier refuses
whole-transaction bytes outright. Bare tagged `zswap::Offer` bytes are therefore
**refused with a precise reason** rather than half-read: they are a fragment of
an offer file, not one.

## Caveats you should read before trusting anything here

- **The formats are frozen by the project 00003 conformance vectors**, not by a
  standard. `MemoHashV1`, `AnchorV1` and memo wrapper v1 are defined by those
  vectors, and the vectors are the arbiter of conformance. They are not
  ratified by anyone.
- **The bech32m HRP `swapmsg` is PROVISIONAL.** It is a display convention with
  an open question against it upstream (00003 Q-10). The **raw bytes are
  canonical**; if the HRP changes, only the display layer of this page changes.
- **`swapoffer` follows a draft.** MIP-0005 is in revision (PR 227 below);
  "valid offer file" here means valid against the pinned ledger generation and
  the draft conventions, not against a ratified standard.
- **No npm package is published** for the WASM surface, and no package name is
  claimed. How that surface should be published is an open upstream question
  (00003 Q-9) and the repository owner's decision. The bundle in `vendor/pkg/`
  is vendored, not installed — see [`vendor/PROVENANCE.md`](vendor/PROVENANCE.md).
- **Create produces offers anchored to an in-browser demo ledger state.** They
  are format-valid and proof-valid, and they are **not settleable on a live
  chain**. This is stated on the page next to the artifacts.
- **Proving is not done in the browser.** The spend circuit is too large
  (K = 19) for in-browser proving to be practical, so Create posts a proving
  payload to a **proof server you configure and run yourself**, defaulting to
  `localhost`. Witness material goes to that server; the page says so, and the
  seed and secret keys never leave the browser — the test suite asserts the
  latter by scanning every outbound request body. [`docker/`](docker/README.md)
  runs that server for you in one command, pinned to the same ledger commit as
  the WASM bundle.
- **The page never submits anything to a network** and never moves funds.
  Producing and displaying files is its entire effect.

## References

| | |
| --- | --- |
| Ledger fork carrying the memo helpers and JS bindings | [acedward/midnight-ledger#2](https://github.com/acedward/midnight-ledger/pull/2) — branch `00003-spend-proof-memo-binding`, pinned at `32fdefc3` |
| MIP-0005 revision — offer files as full proven transactions | [midnightntwrk/midnight-improvement-proposals#227](https://github.com/midnightntwrk/midnight-improvement-proposals/pull/227) |
| MIP-0006 revision — publication and transport of swap offers | [midnightntwrk/midnight-improvement-proposals#228](https://github.com/midnightntwrk/midnight-improvement-proposals/pull/228) |
| Upstream ledger baseline | tag `ledger-9.1.0.0-rc.3` (`4823b535`), published as `@midnightntwrk/ledger-v9@1.0.0-rc.3` |

**Costs, metadata leakage and limits are documented in the project 00003
disclosure document** — what the construction does *not* hide: the public
`(nullifier, memo-hash)` pair is a correlation handle, identical memo bytes hash
identically, short memos are guessable offline, and each memo costs a second
4 832-byte proof plus one extra note-tree entry. That document is **not
published at a public URL yet**; this section will link it when it is. Until
then, treat this page as a technology demonstration and not as a private
messaging channel.

## Build and run

Requires Node.js 24+. No Rust toolchain is needed — the WASM bundle is vendored.

```sh
npm install
npm run build          # -> dist/
npm run dev            # webpack-dev-server on :8080 (PORT=nnnnn to override)
```

Verify the vendored bundle and the frozen reference artifacts against their
manifests at any time:

```sh
npm run verify          # verify:vendor + verify:fixtures
```

### Tests

The suite runs the **built `dist/`** in a real headless Chrome, served exactly as
Cloudflare Pages would serve it, and drives the page's own entry points rather
than a private copy of the pipeline.

```sh
npm test                # verify + build + BOTH browser suites
npm run test:read       # the Read suite on its own (no proof server needed)

# The Create suite. Without PROOF_SERVER it runs only the half that needs no
# proving — the memo bounds, the unreachable-server path and cancellation —
# and says so.
PROOF_SERVER=http://127.0.0.1:6300 npm run test:create

CHROME_BIN=/path/to/chrome npm run test:read     # if Chrome is not where it usually is
```

The **Read** suite covers the tamper matrix (memo bit-flip, grafted companion proof, perturbed
statement row, re-attributed nullifier, crossed pairs, spliced and truncated
wrapper sections, oversize and malformed inputs), the inert rendering of a
genuinely authenticated hostile memo, per-input attribution when two inputs carry
the identical memo, and an **airplane test**: with every artifact already in
memory, a full parse-verify-render cycle must make zero network requests. Every
tampered artifact is constructed at test time from the frozen fixtures, so its
defect is visible in the source rather than baked into a committed file.

The **Create** suite drives a real Create run against a real proof server and
checks, among other things:

- the 1..=512-**byte** bound is enforced *before* any egress — asserted by
  counting network requests, not by reading the code;
- an unreachable proof server gives a typed error naming the URL, and no
  artifact;
- cancelling mid-proving leaves no artifact and no half-rendered text;
- the page stayed responsive during the run (a `requestAnimationFrame` counter
  kept advancing);
- **SC-006**, at the CDP protocol level: every request made during Create went
  to the configured proof server, there were exactly two POSTs, and neither
  body contains the seed or the coin secret key — searched as raw bytes, not
  as strings;
- the round trip: the produced pair, pasted into Read **in a fresh browser
  context**, comes back authenticated with zero network requests — and a
  control that flips one byte of that same wrapper is refused.

### The acceptance gate

Both suites above run inside a browser, and a browser can only tell you the memo
authenticates. Whether a node would take the bytes is a different question, and
[`acceptance/`](acceptance/README.md) is where it is answered: it drives one
real Create run, then hands the offer file to the **pinned, unmodified ledger's
own `well_formed`** — with real proof verification — inside a container with no
network.

```sh
PROOF_SERVER=http://localhost:6300 npm run acceptance
```

It also runs the detached memo verification and replays the frozen conformance
vectors, with the controls that make those mean something: the spend proof must
be **rejected** at row 0 = `MemoHashV1(memo)`, and the companion proof
**rejected** at row 0 = 0.

Unlike everything else here, that directory needs the upstream project's
workspace beside this one — deliberately, because "unmodified ledger" has to be
a property of what it links against rather than a claim in a comment. Its README
explains the arrangement, and the one strictness switch it turns off and why.

### Deploy (Cloudflare Pages)

`wrangler.jsonc` is the single source of truth (project `web-memo`, build output
`dist`). The account comes from your logged-in Wrangler session, so no account
ID or token is committed.

```sh
npx wrangler login
npm run pages:deploy
```

## Repository layout

```
public/index.html            page shell + the import map that resolves `#self`
src/index.js                 bootstrap: load the engine, check it, mount both sections
src/wasm.js                  the only loader for the vendored WASM bundle
src/lib/dom.js               the ONLY way this page builds DOM (textContent only)
src/lib/inert.js             inert rendering of untrusted bytes (port of 00003 inert.rs)
src/lib/bytes.js             hex/ASCII helpers, no interpretation
src/read/classify.js         size bounds and tag-based routing, before any parse
src/read/parse.js            transaction -> per-segment offers; wrapper -> fields
src/read/verify.js           the verify pipeline (offline, client-side)
src/read/trust.js            the six trust states, and which are reachable here
src/read/memoview.js         the memo panel: text / strict-ASCII / hex
src/read/ui.js               the Read section's DOM and the test hook
src/create/demo.js           the demo wallet, demo state, spend and anchor output
src/create/memo.js           the 1..=512-byte bound, enforced before proving
src/create/prover.js         the ONLY code here that makes a network request
src/create/proofcodec.js     interim: re-tag a proof-server proof for the wrapper
src/create/build.js          the Create flow, including the self-check
src/create/artifacts.js      bech32m rendering, copy and download
src/create/ui.js             the Create section's DOM and the test hook
fixtures/                    frozen reference artifacts + SHA256SUMS + provenance
fixtures/generator/          verbatim archive of the program that made them
docker/                      the pinned proof server, in one command
docker/Dockerfile.proofserver  clones the pinned ledger and asserts three things
docker/compose.yaml          ports, parameters, healthcheck — all overridable
acceptance/                  the consensus gate: the offer file vs the PINNED ledger
acceptance/src/main.rs       every check, and the strictness reasoning in its header
acceptance/run-gate.sh       artifacts -> image -> gate -> teardown -> exit status
test/read-matrix.mjs         the browser suite (`npm test`)
test/inpage-matrix.js        the tamper matrix, executed inside the page
test/create-e2e.mjs          the Create suite (`npm run test:create`)
test/create-artifacts.mjs    one Create run, written to disk, for the gate
test/cdp.mjs, test/serve.mjs dependency-free Chrome driver + static server
vendor/pkg/                  vendored wasm-pack --target web build (19.25 MiB)
vendor/pkg/SHA256SUMS        manifest for all 32 vendored files
vendor/PROVENANCE.md         source commit, exact build command, toolchain, sums
scripts/verify-vendor.mjs    `npm run verify:vendor`
scripts/verify-fixtures.mjs  `npm run verify:fixtures`
docs/js-api-notes.md         sharp edges in the WASM JS surface — read before use
webpack.config.js            build; copies vendor/pkg -> dist/pkg byte-for-byte
wrangler.jsonc               Cloudflare Pages project config
```

### One thing worth knowing about the build

The vendored bundle is **not** part of the webpack module graph. `src/wasm.js`
imports it with `/* webpackIgnore: true */` so the browser performs the import,
and the `#self` specifiers inside the generated snippets are resolved by the
**import map** in `public/index.html`. Two consequences:

1. The vendored files are byte-identical to the `wasm-pack` output, so their
   SHA-256 sums verify against a clean rebuild.
2. The import map's target and the URL in `src/wasm.js` must stay identical. If
   you move `/pkg/`, change both.

See [`vendor/PROVENANCE.md`](vendor/PROVENANCE.md) for the full explanation and
the alternative fix a bundler or Node consumer would need instead.

## License

Apache-2.0. The vendored bundle in `vendor/pkg/` is built from Apache-2.0
Midnight ledger sources; see [`vendor/PROVENANCE.md`](vendor/PROVENANCE.md).
