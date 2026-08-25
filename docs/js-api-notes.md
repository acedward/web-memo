# Sharp edges in the `ledger-wasm` JavaScript surface

Everything here was **measured** against the vendored bundle
(`vendor/pkg/`, built from `acedward/midnight-ledger` @ `da1d2f04`) running in
real Chrome, not read off documentation. It exists so the Read and Create
sections do not rediscover the same traps one at a time.

The short version: **the `.d.ts` types are too weak to catch any of this.** The
memo surface *is* declared — all 13 functions, with doc comments — but nearly
every parameter and return is `string`, `object`, `any` or `Array<any>`, so
TypeScript will cheerfully accept calls that throw at runtime. Two of the traps
below are compositions the type checker positively endorses.

> ### These notes are pinned to `da1d2f04`, and two of them are scheduled to change
>
> Upstream has accepted fixes for **§1** (`memoAnchorTokenTypeOf` will compose,
> by making `createMemoAnchorOutput` read the *tagged* form) and **§8** (an
> additive binding will expose the spend statement tail, unblocking wrapper
> construction from the browser). When this repository re-pins and re-vendors
> `vendor/pkg/`, **re-verify §1 and §8 before trusting them** — §1's workaround
> becomes wrong, not merely unnecessary, once `createMemoAnchorOutput` expects
> tagged input. Everything else here is independent of those two changes.

## The 13 memo bindings

```ts
memoHashV1(memo: Uint8Array): Uint8Array
memoAnchorEncode(nullifier: Uint8Array, h: Uint8Array): Uint8Array
memoAnchorDecode(bytes: Uint8Array): object
memoAnchorScan(bytes: Uint8Array): Array<any>
memoAnchorTokenTypeOf(coin: any): string
createMemoAnchorOutput(segment: number | null | undefined, token_type: string,
                       nullifier: Uint8Array, h: Uint8Array): ZswapOutput
createMemoCompanionProvingPayload(serialized_preimage: Uint8Array,
                                  memo: Uint8Array, key_material: any): Uint8Array
memoWrapperBuild(memo, nullifier, segment, statement_tail,
                 companion_proof, locator?): Uint8Array
memoWrapperParse(bytes: Uint8Array): object
memoWrapperVerify(wrapper: Uint8Array, offer: Uint8Array, segment: number): object
memoWrapperToBech32m(bytes: Uint8Array, hrp?: string | null): string
memoWrapperFromBech32m(text: string, hrp?: string | null): Uint8Array
memoWrapperDefaultHrp(): string
```

---

## 1. `memoAnchorTokenTypeOf` does not compose with `createMemoAnchorOutput`

Both are typed `string`, and the doc comments say they are a pair. They are not.

```js
createMemoAnchorOutput(seg, memoAnchorTokenTypeOf(coin), nullifier, h);
// Error: Not all bytes read, 33 bytes remaining
```

`memoAnchorTokenTypeOf` serialises **tagged** — 130 hex characters: the 33-byte
ASCII tag `midnight:shielded-token-type[v1]:` followed by the 32-byte type.
`createMemoAnchorOutput` parses **untagged**. The 33 leftover bytes in the error
are exactly the tag.

**Workaround — use the coin's own `type` field, which is already bare hex:**

```js
createMemoAnchorOutput(seg, coin.type, nullifier, h);   // OK
```

`memoAnchorTokenTypeOf` has no other caller, so nothing else is affected. This
is an upstream defect on the pinned fork branch, not something to fix here.

**Scheduled to change.** Upstream is fixing this by making
`createMemoAnchorOutput` parse the **tagged** form, so the documented pair will
compose — and the `coin.type` workaround above will then be the *wrong* call.
After the next re-pin, pass `memoAnchorTokenTypeOf(coin)`, and delete the
workaround rather than leaving both in place.

## 2. `shieldedToken()` does not produce what `createShieldedCoinInfo` wants

```js
createShieldedCoinInfo(m.shieldedToken(), 4242n);
// Error: failed to fill whole buffer
```

`shieldedToken()` returns the **structured** TokenType object
`{ tag: "shielded", raw: "00…00" }`. `createShieldedCoinInfo(type_, value)`
parses `type_` with the untagged reader and wants a **bare 64-hex-character**
string.

Note also that the error message is `read_exact`'s, not a randomness failure —
it reads like a `getrandom` problem and is not one.

```js
createShieldedCoinInfo(m.shieldedToken().raw, 4242n);   // OK
```

## 3. These are getters in Rust but **functions** in JS

`shieldedToken` and friends carry `#[wasm_bindgen(getter, …)]` yet are exported
to JavaScript as functions. It is `m.shieldedToken()`, **not**
`m.shieldedToken`. Reading the property gives you a function object, which then
fails somewhere less obvious.

## 4. Coin fields are hex strings and a bigint — not `Uint8Array`

A coin object comes back as:

```js
{ type: "…64 hex chars…", nonce: "…hex…", value: 4242n }
```

Do not `Array.from()` these expecting bytes. Convert explicitly where bytes are
required.

## 5. The qualified form needs `mt_index` in **snake_case**

```js
const qualified = { ...coin, mt_index: 0n };   // NOT mtIndex
```

`conversions.rs` does not rename this field, unlike its dust equivalent. The
parameter is typed `any`, so nothing warns you.

## 6. There is no offer-level `seal` / `finalize` — and none is needed

`ledger-wasm` exports no offer-level `seal`, `finalize` or `wellFormed`. That is
correct, not a gap: the segment is baked into each input/output preimage at
construction and `binding_input` is already `0`, so **the preimage carried by
the unproven input already is the finalized preimage**. Reading it out of a
merged offer and reading it straight off the input give byte-identical results
(verified).

Practically: `offer.inputs[0].proof.serialize()` is the finalized preimage the
companion proof must be built over.

## 7. `ZswapInput.proof` is a getter only — there is no proof setter

There is no `setProof` / `withProof` / `attachProof` on `ZswapInput` or
`ZswapOffer` (confirmed by enumerating own and prototype properties of both).
A proven offer therefore cannot be reassembled offer-side from JavaScript.

The only routes to proven bytes are:

- `ZswapOffer.deserialize('proof', raw)` for an already-proven offer, and
- `createProvingTransactionPayload(tx, provingData)`, which proves a whole
  **Transaction**.

So a proving flow built on this surface is Transaction-shaped, not Offer-shaped.
Note the resulting seam: `memoWrapperVerify(wrapper, offer, segment)` expects a
**tagged `zswap::Offer`**, while a MIP-0005 offer file is a full Transaction.

**MEASURED, and the seam closes — see §11.** A Transaction→offer accessor is
reachable, the bytes it yields are exactly what the verifier eats, and
whole-transaction bytes are refused outright, so the extraction is mandatory
rather than optional.

## 8. `memoWrapperBuild` needs a `statement_tail` that nothing produces

`memoWrapperBuild(memo, nullifier, segment, statement_tail, companion_proof,
locator?)` takes the statement rows `1..INPUT_PIS` (32 little-endian bytes each)
**from its caller**. `memoWrapperVerify` rebuilds them internally and never
exposes them, and the Rust producer (`zswap::verify::spend_statement`) is not
bound to WASM — zero exports match `/statement|tail/i`.

**Consequence:** at this pin the verification half is fully served, but the
browser cannot assemble a memo wrapper around a companion proof it receives back
from a proof server. Reimplementing the derivation in JavaScript would create a
second, unverified copy of a byte mapping and is the wrong answer.

**Scheduled to change.** An additive upstream binding exposing the spend
statement will land on the fork branch. Until this repository re-pins and
re-vendors, wrapper *construction* is out of reach from the browser; wrapper
*parsing and verification* are not affected and work today.

## 9. Error messages that mislead

| Message | Actually means |
| --- | --- |
| `failed to fill whole buffer` | `read_exact` ran out of input — usually a wrong-shaped hex string, **not** a randomness failure |
| `Not all bytes read, 33 bytes remaining` | a **tagged** value was handed to an **untagged** parser; 33 is the tag length |

## 10. Loading: `#self` and the import map

The generated snippets `import * as wasm from '#self'`, a Node subpath import
that browsers do not implement. This repo resolves it with an import map in
`public/index.html` and loads the glue outside the bundler
(`/* webpackIgnore: true */`). Do not "fix" a `#self` resolution error by
patching `vendor/pkg/package.json` — that only helps Node and bundler
resolution, and it breaks the byte-fidelity the provenance manifest depends on.
Full explanation in [`../vendor/PROVENANCE.md`](../vendor/PROVENANCE.md).

## 11. Reading an offer file: the Transaction→offer seam, measured

Both accessors exist on `Transaction.prototype` with real getters **and**
setters:

```js
const tx = wasm.Transaction.deserialize('signature', 'proof', 'pre-binding', raw);

tx.guaranteedOffer        // ZswapOffer | undefined          (segment 0)
tx.fallibleOffer          // Map<segment:number, ZswapOffer> | undefined
tx.fallibleOffer.get(3).serialize()   // the bytes memoWrapperVerify wants
```

Three things worth knowing, all measured against the vendored bundle in a real
browser:

* `ZswapOffer.serialize()` returns the **tagged** form, byte-identical to a
  `tagged_serialize(&offer)` written by Rust. That is exactly the second
  argument `memoWrapperVerify` takes.
* Handing `memoWrapperVerify` the WHOLE transaction fails with
  `offer is not a readable proven Offer: expected header tag
  'midnight:zswap-offer[v5](proof[v5]):', got 'midnight:transaction[v12](signature['`.
  Extraction is not a nicety.
* `memoAnchorScan` works over transaction bytes as well as offer bytes (its own
  doc says so), and the anchors it finds are **variable width** — 122 and 123
  bytes both occur in this repo's own reference fixtures. Never assume a length
  or a position; select an anchor by its decoded `(nullifier, h)`.

### The marker triple is READABLE off the bytes

`Transaction.deserialize(signatureMarker, proofMarker, bindingMarker, raw)`
expects the caller to know three markers. Do not brute-force them — a failed
attempt on a multi-megabyte input is not free. Each valid combination has a
distinct ASCII header tag that is literally the start of the bytes:

| signature | proof | binding | header tag |
| --- | --- | --- | --- |
| `signature` | `proof` | `binding` | `midnight:transaction[v12](signature[v2],proof,pedersen-schnorr[v1]):` |
| `signature` | `proof` | `pre-binding` | `midnight:transaction[v12](signature[v2],proof,embedded-fr[v1]):` |
| `signature` | `pre-proof` | `binding` | `midnight:transaction[v12](signature[v2],proof-preimage,pedersen-schnorr[v1]):` |
| `signature` | `pre-proof` | `pre-binding` | `midnight:transaction[v12](signature[v2],proof-preimage,embedded-fr[v1]):` |
| `signature` | `no-proof` | `no-binding` | `midnight:transaction[v12](signature[v2],(),pedersen[v1]):` |
| `signature-erased` | … | … | the same five with `()` in place of `signature[v2]` |

The other five combinations are refused up front with `Unsupported transaction
type provided.` Note that **binding is part of the serialization, not a view**:
you cannot re-read bound bytes as `pre-binding`.

`src/read/classify.js` holds this table.

## 12. A PROVEN offer cannot be put into a Transaction from JavaScript

All three routes are closed, so do not go looking:

| attempt | result |
| --- | --- |
| `Transaction.fromParts(net, provenOffer, …)` | `Guaranteed offer must be unproven.` — by design |
| `emptyTx.mockProve()` then `addZswapOffer(seg, provenOffer)` | `mockProve()` returns a **bound** transaction (`pedersen-schnorr[v1]`), and every offer setter refuses one: `Transaction is already bound.` |
| re-read the mock-proven bytes as `pre-binding` first | fails on the header tag — see §11 |

The only JS route to a proven transaction is the proof server
(`createProvingTransactionPayload`). Anything that needs to *assemble* a
transaction around an already-proven offer has to do it in Rust; this repo's
`fixtures/generator/` is that, and `fixtures/PROVENANCE.md` explains why.

Also note `addZswapOffer` takes a `SegmentSpecifier`, not a number:
`{ tag: 'specific', value: 3 }` (or `{ tag: 'first' }`, `{ tag: 'guaranteedOnly' }`,
`{ tag: 'random' }`). A bare `0` fails with `invalid type: floating point 0.0,
expected adjacently tagged enum SegmentSpecifier`.

## 13. The bech32m codec is HRP-agnostic — use it for both artifacts

`memoWrapperToBech32m(bytes, hrp)` does **not** validate that `bytes` are a
wrapper. It rendered a 10,076-byte proven offer as a 16,136-character
`swapoffer1…` string, and `memoWrapperFromBech32m(s, 'swapoffer')` round-tripped
it byte-exactly. So there is no reason to write a second bech32m implementation
for the offer side, and every reason not to.

What it does enforce, all confirmed:

| behaviour | message |
| --- | --- |
| the prefix must be the one you asked for | `bech32m prefix is "swapmsg", not the expected "swapoffer"` |
| the checksum is real | `bech32m checksum does not verify` |
| BIP-173's case rule holds | an all-uppercase string decodes fine |

There is no 90-character limit — that is a Bitcoin address convention, not a
property of bech32m.

## 14. Result shapes the Read path depends on

None of these are visible in the `.d.ts`, which types them `object` / `any`.

```js
memoWrapperParse(bytes)
// { unverifiedMemo: Uint8Array, nullifier: Uint8Array, segment: number,
//   claimedStatementTail: Uint8Array, companionProof: Uint8Array,
//   untrustedLocator: Uint8Array }

memoWrapperVerify(wrapper, offerBytes, segment)
// { memo: Uint8Array, nullifier: Uint8Array, segment: number, h: Uint8Array,
//   matchingAnchors: [{ outputIndex: number, coinCommitment: string }],
//   duplicateAnchors: boolean }

memoAnchorScan(bytes)
// [{ offset: number, length: number, nullifier: Uint8Array, h: Uint8Array }]
```

`unverifiedMemo` is named that way so it cannot be reached for by accident:
parsing is not verifying, and only `memoWrapperVerify`'s `memo` may be shown as
authenticated. An **empty** `matchingAnchors` is not a failure — it is the
weaker "authenticated but unanchored" state, and a reader must present it as
such. `duplicateAnchors` is an anomaly to surface, never a reason to downgrade
authentication.

One thing the bindings do **not** expose: 00003's "malformed anchor candidate"
anomaly. `memoAnchorScan` returns well-formed version 1 anchors only, so a
ciphertext that is anchor-shaped but fails full decode is invisible from
JavaScript. Say so rather than implying a clean scan means no such ciphertext
exists.
