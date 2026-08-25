# Provenance of `vendor/pkg/`

`vendor/pkg/` is a **vendored build artifact**: the `wasm-pack --target web`
output of the `ledger-wasm` crate from a pinned commit of a **fork** of the
Midnight ledger. It is checked into this repository so that a clone builds and
deploys without a Rust toolchain and without access to any other workspace.

Nothing in `vendor/pkg/` is hand-edited. Every file is byte-identical to what
the command below emits — see [Deviations](#deviations-from-the-raw-build-output)
for the one file that is *omitted* (and why), which is the only difference.

## Source

| | |
| --- | --- |
| Source repository | <https://github.com/acedward/midnight-ledger> — public fork of <https://github.com/midnightntwrk/midnight-ledger> |
| Branch | `00003-spend-proof-memo-binding` |
| **Commit** | **`da1d2f04a900c833b45c8f74b1afcf51811e02f5`** |
| Tracking PR | [acedward/midnight-ledger#2](https://github.com/acedward/midnight-ledger/pull/2) (fork-internal, OPEN) |
| Upstream baseline of that branch | `4823b5351b17cc49e30f19760dbd30a73cf95e22` — tag `ledger-9.1.0.0-rc.3`, published as `@midnightntwrk/ledger-v9@1.0.0-rc.3` |
| Crate | `ledger-wasm` (package `midnight-ledger-wasm-v9` `1.0.0-rc.3`) |

The branch is exactly five commits on top of the upstream baseline:

```
da1d2f0  ledger-wasm: JavaScript bindings for spend-proof memo binding
5788a17  zswap: frozen cross-implementation conformance vectors for the memo helpers
a1f480e  zswap: additive spend-proof memo binding helpers
bd899b5  zkir-wasm: honour overwrite_binding_input on the legacy verifier-key[v6] arm
181ad3f  build-input only: refresh the stale workspace Cargo.lock
```

The three memo commits are **additive only** — 21 files, +6487 and −0 lines — so
every circuit, key, trusted setup, wire tag and validity surface is byte-identical
to the upstream baseline *by construction*. The two remaining commits are a stale
`Cargo.lock` refresh and a `zkir-wasm` fix on the legacy verifier-key[v6] arm.

## Build command

Run from a clean checkout of the fork at the commit above. `CARGO_TARGET_DIR` is
pointed **outside** the source tree so the checkout stays pristine.

```sh
git clone https://github.com/acedward/midnight-ledger.git
cd midnight-ledger
git checkout da1d2f04a900c833b45c8f74b1afcf51811e02f5

RUSTUP_TOOLCHAIN=1.95.0 \
CARGO_TARGET_DIR=/some/path/outside/the/tree \
RUSTFLAGS='--cfg getrandom_backend="wasm_js"' \
  wasm-pack build --target web --out-dir /some/path/pkg ledger-wasm
```

Then copy the result to `vendor/pkg/`, delete the `.gitignore` wasm-pack writes
into it (see below), and regenerate the manifest:

```sh
cd vendor/pkg && find . -type f ! -name SHA256SUMS | LC_ALL=C sort \
  | xargs shasum -a 256 | sed 's|  \./|  |' > SHA256SUMS
```

### `wasm-opt` runs — do not add `--no-opt`

`--no-opt` is *not* passed. `ledger-wasm/Cargo.toml` declares

```toml
[package.metadata.wasm-pack.profile.release]
wasm-opt = ['-O', '--enable-reference-types']
```

so `wasm-pack` runs `wasm-opt -O --enable-reference-types` on the binary. This is
load-bearing for deployment, not a nicety:

| | `.wasm` size | vs Cloudflare Pages' 25 MiB per-file limit |
| --- | --- | --- |
| `--no-opt` (the upstream 00003 recipe) | 25 553 837 B = **24.37 MiB** | 1.6 % of headroom |
| optimised (what is vendored) | 20 188 188 B = **19.25 MiB** | **23 % of headroom** |

`wasm-opt` also renumbers one generated adapter in the JS glue
(`__wbg_adapter_16` → `__wbg_adapter_8`, a 2-byte difference in the file); the
`.d.ts` files are byte-identical between the two builds.

### No `#self` patch is applied

`wasm-pack --target web` emits 26 `snippets/**/inlineN.js` files that each do
`import * as wasm from '#self'`. `#self` is a **Node subpath import**. Two
different mechanisms can resolve it, and this repo uses the second:

1. **Bundler / Node**: resolve it through the package's own `package.json`
   `"imports"` field. That requires patching the vendored `package.json` (the
   00003 build recipe does this with `js/patch_wasm_pkg_self_import.js`).
   Browsers never read `package.json`, so this patch is **inert in a browser**.
2. **Browser**: `#self` starts with neither `/`, `./` nor `../` and is not an
   absolute URL, so the HTML module resolver treats it as a *bare specifier* —
   which an **import map** remaps. That map lives in
   [`public/index.html`](../public/index.html), and `src/wasm.js` loads the glue
   with `/* webpackIgnore: true */` so the browser (not webpack) performs the
   import.

Because route 2 needs no file edits, `vendor/pkg/package.json` is the unmodified
build output and its SHA-256 below verifies directly against a clean rebuild.
A consumer who instead loads this bundle through Node or through a bundler's
module graph must apply the `"imports"` patch themselves.

Without either fix the page dies at load with:

```
TypeError: Failed to resolve module specifier "#self".
           Relative references must start with either "/", "./", or "../".
```

## Toolchain used for the vendored build

| Tool | Version |
| --- | --- |
| `rustc` | 1.95.0 (`59807616e` 2026-04-14), pinned via `RUSTUP_TOOLCHAIN` |
| `wasm-pack` | 0.14.0 |
| `wasm-opt` | the binaryen `wasm-pack` provisions for 0.14.0 |
| `node` | v24.9.0 |
| Host | macOS 15.7.3 (24G419), Darwin 24.6.0, arm64 |
| Built | 2026-08-25 |

## Deviations from the raw build output

Exactly one, and it is an omission rather than an edit:

- **`.gitignore` is not vendored.** `wasm-pack` writes a one-byte `.gitignore`
  containing `*` into its output directory. Committing it would make git ignore
  the entire vendored bundle. Its SHA-256, for completeness, is
  `684888c0ebb17f374298b65ee2807526c066094c701bcc7ebbe1c1095f494fc1`.

`README.md` inside `vendor/pkg/` is the `ledger-wasm` crate's own README, kept as
part of the build output. It and the `.d.ts` files are excluded from the deployed
site by `webpack.config.js`; they remain in the repository as provenance material.

## Integrity

`vendor/pkg/SHA256SUMS` lists all **32** vendored files. Verify with either:

```sh
npm run verify:vendor            # cross-platform, no external tools
cd vendor/pkg && shasum -a 256 -c SHA256SUMS
```

The two files that matter most:

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `midnight_ledger_wasm_v9_bg.wasm` | 20 188 188 | `7fc4bb1020c96fb774cfaad2c91c817873f17f9a1abd9ab3a42d406df8ea8cb0` |
| `midnight_ledger_wasm_v9.js` | 351 248 | `a4ee8f7bc9ce221af7d82e2ee329b05f31c6acc410952beb518957b9f4a2cd09` |

Also recorded, so the mapping to the source is checkable at a glance:

| File | Bytes | SHA-256 |
| --- | --- | --- |
| `midnight_ledger_wasm_v9.d.ts` | 102 767 | `f1546abb5585a50895c62491c97be0fafa3cda965184adf57a9bed334ff5d98d` |
| `midnight_ledger_wasm_v9_bg.wasm.d.ts` | 60 590 | `cd1b4d11bfa10c72c13ec1705d7a129bb158b3b0ed76dcf7b99e2e7c29d7631c` |
| `package.json` | 365 | `67f5d457519161de1546e23b6d49c0188796c9acbc872420b59eeaf8a0b86598` |
| `README.md` | 4 116 | `c1686acb03464c705ef3824a4178c5cbe6114e5f60eb74679e13321b218e6744` |
| `snippets/midnight-ledger-wasm-v9-e238ef26b2371309/inline0.js` … `inline25.js` | 26 files | see `SHA256SUMS` |

**What this does and does not prove.** `SHA256SUMS` proves the vendored files are
the ones this document describes. It does **not** prove they are what commit
`da1d2f04` produces — only a rebuild does that, and rebuilds of the same source
are expected to be reproducible here because the binary is fully determined by
the pinned toolchain. There is deliberately no automated rebuild-and-diff job:
this is a demonstration of a format, and tamper-evidence was explicitly out of
scope for it.

## Not published

This bundle is **not** published to npm and claims no package name. How the
JavaScript surface should eventually be published is an open question on the
upstream project (00003 Q-9) and is the repository owner's call.
