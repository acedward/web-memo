# Sharp edges in the `ledger-wasm` JavaScript surface

Everything here was **measured** against the vendored bundle
(`vendor/pkg/`, built from `acedward/midnight-ledger` @ `32fdefc3`) running in
real Chrome, not read off documentation. It exists so the Read and Create
sections do not rediscover the same traps one at a time.

The short version: **the `.d.ts` types are too weak to catch most of this.** The
memo surface *is* declared — all 14 functions, with doc comments — but nearly
every parameter and return is `string`, `object`, `any` or `Array<any>`, so
TypeScript will cheerfully accept calls that throw at runtime. The one export
that breaks the pattern is the newest, `memoSpendStatementTail`, which ships a
real signature.

> ### Re-pinned from `da1d2f04` to `32fdefc3` — §1 and §8 were REWRITTEN
>
> Two upstream commits landed on the fork branch (append-only, so `da1d2f04` is
> still reachable): one adds `memoSpendStatementTail`, the other makes
> `createMemoAnchorOutput` read the **tagged** token type. Both notes below now
> describe the *current* pin and were re-measured against it.
>
> **If you have code written against `da1d2f04`, §1 is a breaking change**: the
> `coin.type` argument that used to work is now refused. The old text is kept in
> §1 only as a migration note, clearly marked, because reading a stale
> workaround as current advice is exactly how this bites.

## The 14 memo bindings

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
memoSpendStatementTail(input: ZswapInput, segment: number): Uint8Array   // NEW at 32fdefc3
memoWrapperBuild(memo, nullifier, segment, statement_tail,
                 companion_proof, locator?): Uint8Array
memoWrapperParse(bytes: Uint8Array): object
memoWrapperVerify(wrapper: Uint8Array, offer: Uint8Array, segment: number): object
memoWrapperToBech32m(bytes: Uint8Array, hrp?: string | null): string
memoWrapperFromBech32m(text: string, hrp?: string | null): Uint8Array
memoWrapperDefaultHrp(): string
```

---

## 1. `createMemoAnchorOutput` wants the **TAGGED** token type

At the current pin the documented pair composes, and that is the only call that
works:

```js
createMemoAnchorOutput(segment, memoAnchorTokenTypeOf(coin), nullifier, h);   // OK
```

`memoAnchorTokenTypeOf(coin)` returns **130 hex characters**: the 33-byte ASCII
tag `midnight:shielded-token-type[v1]:` followed by the 32-byte type.
`createMemoAnchorOutput` deserialises exactly that, and enforces exact
consumption.

**A bare untagged token type is refused**, with a message that names what it
wanted:

```js
createMemoAnchorOutput(segment, coin.type, nullifier, h);
// Error: expected header tag 'midnight:shielded-token-type[v1]:', got …
```

That matters because `coin.type` is the field a coin object actually carries
(§4), so the wrong call is the one that looks natural — and both parameters are
typed `string`, so nothing warns you. Trailing bytes and non-hex are refused the
same way.

> **Migration note for code written against `da1d2f04`.** At the old pin the
> pairing was broken the other way round: `createMemoAnchorOutput` parsed
> *untagged*, so `memoAnchorTokenTypeOf(coin)` threw `Not all bytes read, 33
> bytes remaining` (the 33 being the tag) and `coin.type` was the workaround.
> Upstream fixed it by routing both halves through one shared encode/decode
> pair, so they cannot drift apart again. **Delete the `coin.type` workaround
> rather than keeping both** — at this pin it is not merely unnecessary, it
> fails.

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

## 8. `memoSpendStatementTail` is what makes `memoWrapperBuild` reachable

`memoWrapperBuild(memo, nullifier, segment, statement_tail, companion_proof,
locator?)` takes the spend-statement rows `1..INPUT_PIS` (32 little-endian bytes
each) **from its caller**. `memoWrapperVerify` rebuilds them internally and
never exposes them, so until `32fdefc3` a browser could build a memo-anchored
offer but not the wrapper that authenticates it. The binding added at that
commit closes it:

```js
const tail = wasm.memoSpendStatementTail(input, segment);   // 2144 bytes = 67 × 32
```

Four properties, all of which the Create flow leans on:

* **It needs no memo and no `h`.** The tail is rows `1..`, and those rows depend
  only on the input's public fields and the segment — never on row 0
  (`binding_input`). The canonical statement and the companion statement share
  an identical tail, so a caller cannot get the memo commitment wrong here
  because it is not an argument.
* **It accepts an UNPROVEN input.** `state.spend(...)` hands you one directly,
  and `offer.inputs[i]` yields the same thing; both give byte-identical tails.
  That is what lets the page derive the tail *before* it sends anything to a
  proof server. Proven and proof-erased inputs work too.
* **The segment must be the one the input is spent at.** A tail derived at a
  different segment is different bytes and is refused at verification. This is
  the easiest way to build a wrapper that fails for a reason that looks
  cryptographic and is not.
* **Contract-owned inputs are refused at derivation**, because no wrapper over
  one could ever verify. Failing here is deliberate: the alternative is a
  wrapper that only fails three steps later.

`memoWrapperBuild` itself rejects a truncated tail and one whose length is not a
multiple of 32, so a mis-sliced buffer does not become a silently invalid
wrapper.

**Do not reimplement the derivation in JavaScript.** It would be a second,
unverified copy of a byte mapping, which is precisely the failure mode the
upstream conformance vectors exist to prevent.

## 9. Error messages that mislead

| Message | Actually means |
| --- | --- |
| `failed to fill whole buffer` | `read_exact` ran out of input — usually a wrong-shaped hex string, **not** a randomness failure |
| `expected header tag 'midnight:shielded-token-type[v1]:', got …` | an **untagged** token type (e.g. `coin.type`) was handed to `createMemoAnchorOutput`, which wants the tagged form — see §1 |
| `Not all bytes read, N bytes remaining` | a tagged value reached an untagged parser, or a tagged one had trailing bytes. At the superseded `da1d2f04` pin this was §1's symptom, with `N` = 33 = the tag length |

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
attempt on a multi-megabyte input is not free. Of the 18 combinations
(2 signature x 3 proof x 3 binding), **10 are valid**, and each has a distinct
ASCII header tag that is literally the start of the bytes:

| signature | proof | binding | header tag |
| --- | --- | --- | --- |
| `signature` | `proof` | `binding` | `midnight:transaction[v12](signature[v2],proof,pedersen-schnorr[v1]):` |
| `signature` | `proof` | `pre-binding` | `midnight:transaction[v12](signature[v2],proof,embedded-fr[v1]):` |
| `signature` | `pre-proof` | `binding` | `midnight:transaction[v12](signature[v2],proof-preimage,pedersen-schnorr[v1]):` |
| `signature` | `pre-proof` | `pre-binding` | `midnight:transaction[v12](signature[v2],proof-preimage,embedded-fr[v1]):` |
| `signature` | `no-proof` | `no-binding` | `midnight:transaction[v12](signature[v2],(),pedersen[v1]):` |
| `signature-erased` | … | … | the same five with `()` in place of `signature[v2]` |

The other eight combinations are refused up front with `Unsupported transaction
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

**This is a constraint on ORDER, not a wall — Create does not hit it.** The
closed door is "prove first, assemble second". Create goes the other way round
and never needs a setter:

```
demo state → spend → ZswapInput            (unproven)
           → createMemoAnchorOutput(...)   (§1: tagged token type)
           → ZswapOffer                    (unproven)
           → Transaction.fromParts(...)    (accepts UNPROVEN offers — that is the rule above)
           → createProvingTransactionPayload(tx, provingData) → proof server
           → Transaction.deserialize(...)  (the proven offer file)
```

The wrapper's statement tail is taken from the **unproven** input before any of
this (§8), so nothing has to be read back out of the proven transaction to build
the `swapmsg` half. Read then extracts the offer from the proven transaction
with the §11 accessors. `fixtures/generator/` still exists in Rust because it
starts from offers that were *already* proven, which is the one shape JavaScript
cannot rebuild.

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
