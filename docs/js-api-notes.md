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
Whichever bytes the Read section treats as "the offer file", it must bridge
these two, and it must first confirm a Transaction→offer accessor is actually
reachable from JavaScript rather than assuming it.

## 8. `memoWrapperBuild` needs a `statement_tail` that nothing produces

`memoWrapperBuild(memo, nullifier, segment, statement_tail, companion_proof,
locator?)` takes the statement rows `1..INPUT_PIS` (32 little-endian bytes each)
**from its caller**. `memoWrapperVerify` rebuilds them internally and never
exposes them, and the Rust producer (`zswap::verify::spend_statement`) is not
bound to WASM — zero exports match `/statement|tail/i`.

**Consequence:** the verification half is fully served, but the browser cannot
assemble a memo wrapper around a companion proof it receives back from a proof
server. That needs an additive upstream binding; reimplementing the derivation
in JavaScript would create a second, unverified copy of a byte mapping and is
the wrong answer.

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
