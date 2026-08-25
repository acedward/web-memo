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

**Phase 1 — scaffolding.** What exists today is the repository, the build, the
deployment configuration, and the vendored cryptographic engine, with a stub
page that proves the WASM module loads in a real browser and reproduces a
known-answer `MemoHashV1` value from the frozen conformance vectors.

The two user-facing halves are not built yet:

| Section | What it will do | State |
| --- | --- | --- |
| **Read** | paste an offer file + memo wrapper, verify fully offline, show the memo and one of six trust states | not built |
| **Create** | build a demo-state offer with your memo, prove it, emit both artifacts | not built |

## What the finished page will demonstrate

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
  seed and secret keys never leave the browser. Docker instructions ship with
  this repo when the Create section lands.
- **The page never submits anything to a network** and never moves funds.
  Producing and displaying files is its entire effect.

## References

| | |
| --- | --- |
| Ledger fork carrying the memo helpers and JS bindings | [acedward/midnight-ledger#2](https://github.com/acedward/midnight-ledger/pull/2) — branch `00003-spend-proof-memo-binding`, pinned at `da1d2f04` |
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

Then open the served page; the stub reports the module init time and its
known-answer check.

Verify the vendored bundle against its manifest at any time:

```sh
npm run verify:vendor
```

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
public/index.html          page shell + the import map that resolves `#self`
src/wasm.js                the only loader for the vendored WASM bundle
src/index.js               Phase 1 stub: load + known-answer self-check
vendor/pkg/                vendored wasm-pack --target web build (19.25 MiB)
vendor/pkg/SHA256SUMS      manifest for all 32 vendored files
vendor/PROVENANCE.md       source commit, exact build command, toolchain, sums
scripts/verify-vendor.mjs  `npm run verify:vendor`
docs/js-api-notes.md       sharp edges in the WASM JS surface — read before use
webpack.config.js          build; copies vendor/pkg -> dist/pkg byte-for-byte
wrangler.jsonc             Cloudflare Pages project config
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
