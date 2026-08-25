/* tslint:disable */
/* eslint-disable */
export function partitionTranscripts(calls: any[], params: LedgerParameters): Array<any>;
export function createCoinInfo(type_: string, value: any): any;
export function dustFirstNonce(backing_night: string, dust_address: bigint): bigint;
export function createProvingPayload(serialized_preimage: Uint8Array, overwrite_binding_input: bigint | null | undefined, key_material: any): Uint8Array;
export function dustNullifier(utxo: any, sk: DustSecretKey): bigint;
export function createCheckPayload(serialized_preimage: Uint8Array, ir?: Uint8Array | null): Uint8Array;
export function addressFromKey(key: any): string;
export function coinNullifier(coin_info: any, coin_secret_key: CoinSecretKey): string;
export function shieldedToken(): any;
export function sampleEncryptionPublicKey(): string;
export function unshieldedToken(): any;
export function coinCommitment(coin: any, coin_public_key: string): string;
export function nativeToken(): any;
export function dustInitialNonce(output_no: bigint, intent_hash: string): string;
export function feeToken(): any;
export function sampleCoinPublicKey(): string;
export function createShieldedCoinInfo(type_: string, value: any): any;
export function createProvingTransactionPayload(tx: Transaction, proving_data: Map<any, any>): Uint8Array;
export function dustCommitment(utxo: any): bigint;
export function parseCheckResult(result: Uint8Array): Array<any>;
export function sampleIntentHash(): string;
export function dustNonce(initial_nonce: string, seq: bigint, sk: DustSecretKey): bigint;
export function successorDustUtxo(utxo: any, now: Date, subtract_fee: bigint, new_commitment_index: bigint, gen_info: any, sk: DustSecretKey, dust_parameters: DustParameters): any;
export function updatedValue(ctime: Date, initial_value: bigint, gen_info: any, now: Date, params: any): bigint;
export function sampleDustSecretKey(): DustSecretKey;
/**
 * The bech32m prefix these bindings default to. **Provisional.**
 */
export function memoWrapperDefaultHrp(): string;
/**
 * Every version 1 anchor inside raw transaction or offer bytes, in offset
 * order, as `{ offset, length, nullifier, h }`.
 *
 * Returns **all** sightings without deduplicating: an anchor must be selected
 * by its decoded `(nullifier, h)`, never by position, because output order is
 * assigned by the ledger's own sorting rather than by the constructor.
 */
export function memoAnchorScan(bytes: Uint8Array): Array<any>;
/**
 * Verify a companion wrapper against a **settled, proven** Zswap offer.
 *
 * `offer` is the tagged serialization of a proven `Offer`. `segment` is the
 * segment the offer settled at.
 *
 * On success the returned object carries the now-authenticated memo, the
 * input it is attributed to, and the settled anchors whose decoded
 * `(nullifier, h)` match. An **empty** `matchingAnchors` is not a failure: it
 * means the companion authenticated the memo but no matching anchor was found
 * in the offer that was checked, which is a weaker state a reader must
 * present as such. `duplicateAnchors` is an anomaly worth surfacing and is
 * **not** a reason to downgrade authentication.
 *
 * Throws — with the specific rule that failed — for a nullifier that is not
 * in the offer, a contract-owned carrier, a segment mismatch, a statement row
 * that disagrees with the verifier's own rebuild, unreadable proof bytes, or
 * a proof that does not bind the memo.
 */
export function memoWrapperVerify(wrapper: Uint8Array, offer: Uint8Array, segment: number): object;
/**
 * Decode untagged anchor bytes to `{ nullifier, h }`.
 *
 * Throws — with the specific rule that failed — for anything that is not a
 * version 1 anchor: a wrong marker, an unknown version, a non-canonical point
 * or nullifier split, a zero `h`, a non-zero reserved field, truncation, or
 * trailing bytes.
 */
export function memoAnchorDecode(bytes: Uint8Array): object;
/**
 * Build the proof-server `/prove` payload that asks for the **companion**
 * proof of `memo` over `serializedPreimage`.
 *
 * This is `createProvingPayload` with the binding input derived from the memo
 * bytes rather than supplied by the caller, so a JS consumer cannot ask for a
 * companion over the wrong `h` — the one mistake that would produce a proof
 * which verifies against nothing.
 *
 * **Accepting the override is not evidence that a backend honoured it.** A
 * backend that takes the parameter and then proves the original row-0-zero
 * preimage returns a proof that verifies at row 0 = 0 and fails at row 0 =
 * `h`. Before trusting a backend, check the returned proof against the
 * companion statement **and** confirm it does *not* verify at row 0 = 0.
 */
export function createMemoCompanionProvingPayload(serialized_preimage: Uint8Array, memo: Uint8Array, key_material: any): Uint8Array;
/**
 * The version 1 anchor ciphertext for `(nullifier, h)`, in the **untagged**
 * form that appears inside a serialized transaction.
 */
export function memoAnchorEncode(nullifier: Uint8Array, h: Uint8Array): Uint8Array;
/**
 * Build the ordinary **zero-value** output that carries an anchor.
 *
 * A typed memo-anchor constructor rather than an "arbitrary ciphertext"
 * escape hatch: the value is zero, the token type is the attributed input's,
 * the nonce is fresh, and the recipient key pair is generated and dropped
 * inside, so the anchor coin is unspendable by anyone — its creator included.
 *
 * `tokenType` is the hex-serialized `ShieldedTokenType` the rest of this API
 * already uses. Add the result to the offer **before** balancing and proving:
 * the output proof binds the ciphertext, so an anchor cannot be grafted onto
 * an already-proved transaction.
 */
export function createMemoAnchorOutput(segment: number | null | undefined, token_type: string, nullifier: Uint8Array, h: Uint8Array): ZswapOutput;
/**
 * Parse wrapper bytes into their fields.
 *
 * **Parsing is not verifying.** The returned `memo` is the memo *as parsed*;
 * it must not be shown as authenticated until [`memo_wrapper_verify`]
 * succeeds. The key is named `unverifiedMemo` so that a caller cannot reach
 * for it by accident.
 */
export function memoWrapperParse(bytes: Uint8Array): object;
/**
 * `h = MemoHashV1(memo)`, returned as 32 little-endian bytes.
 *
 * Throws if the memo is empty or longer than 512 bytes — absence is
 * represented by having no memo at all, never by a zero-length one.
 */
export function memoHashV1(memo: Uint8Array): Uint8Array;
/**
 * Assemble a wrapper from its parts and return its canonical bytes.
 *
 * `statementTail` is the concatenation of statement rows `1..INPUT_PIS`, each
 * 32 little-endian bytes; `companionProof` is the tagged detached proof.
 * `locator` is optional and is **never trusted as proof** by any verifier.
 */
export function memoWrapperBuild(memo: Uint8Array, nullifier: Uint8Array, segment: number, statement_tail: Uint8Array, companion_proof: Uint8Array, locator?: Uint8Array | null): Uint8Array;
/**
 * Read a bech32m rendering back to canonical bytes, requiring the prefix.
 *
 * Accepting any prefix would let a string minted for a different artifact
 * type be read as a wrapper, so the expected prefix is always checked.
 */
export function memoWrapperFromBech32m(text: string, hrp?: string | null): Uint8Array;
/**
 * The shielded token type of a coin, hex-serialized, for
 * [`create_memo_anchor_output`].
 *
 * A convenience so a caller does not have to reach into a coin object and
 * re-serialize a field by hand — getting that wrong would produce an anchor
 * carrier of the wrong token type, which nothing else would catch.
 */
export function memoAnchorTokenTypeOf(coin: any): string;
/**
 * Render canonical wrapper bytes as bech32m.
 *
 * Raw bytes stay canonical — this is the display and transport form. `hrp`
 * defaults to `swapmsg`, which is a **proposal** rather than a ratified
 * prefix, which is why it is a parameter.
 */
export function memoWrapperToBech32m(bytes: Uint8Array, hrp?: string | null): string;
export function communicationCommitmentRandomness(): string;
export function signatureVerifyingKey(sk: any): any;
export function leafHash(value: any): any;
/**
 * Sample a random JubJub scalar, returned as a native field element.
 */
export function jubjubSampleScalar(): any;
export function dummyContractAddress(): string;
export function ecMul(a: any, b: any): any;
export function proofDataIntoSerializedPreimage(input: any, output: any, public_transcript: any, private_transcript_outputs: any, key_location?: string | null): Uint8Array;
export function sampleSigningKey(kind?: string | null): any;
export function verifySignature(key: any, data: Uint8Array, signature: any): boolean;
export function runtimeCoinCommitment(coin: any, recipient: any): any;
export function persistentHash(align: any, val: any): any;
export function maxField(): bigint;
/**
 * Returns the largest representable JubJub scalar (i.e. the JubJub scalar field modulus minus one).
 */
export function maxJubjubScalar(): bigint;
export function bigIntToValue(x: bigint): any;
export function entryPointHash(entry_point: any): string;
export function rawTokenType(domain_sep: Uint8Array, contract: string): string;
export function ecMulGenerator(val: any): any;
/**
 * Converts a native field element (BLS12-381 scalar) to a JubJub scalar field element,
 * reducing modulo the JubJub scalar field modulus.
 */
export function jubjubScalarFromNative(native: any): any;
export function hashToCurve(align: any, val: any): any;
export function sampleUserAddress(): string;
export function maxAlignedSize(alignment: any): bigint;
export function communicationCommitment(input: any, output: any, rand: string): string;
export function signingKeyFromBip340(bytes: Uint8Array): any;
export function sampleRawTokenType(): string;
/**
 * Converts a JubJub scalar field element to a native field element (BLS12-381 scalar).
 */
export function nativeFromJubjubScalar(jubjub: any): any;
export function transientHash(align: any, val: any): any;
export function sampleContractAddress(): string;
export function valueToBigInt(x: any): bigint;
export function ecAdd(a: any, b: any): any;
export function upgradeFromTransient(transient: any): any;
export function degradeToTransient(persistent: any): any;
export function runtimeCoinNullifier(coin: any, sender_evidence: any): any;
export function transientCommit(align: any, val: any, opening: any): any;
export function bigIntModFr(x: bigint): bigint;
export function persistentCommit(align: any, val: any, opening: any): any;
export function signData(key: any, data: Uint8Array): any;
export function dummyUserAddress(): string;
export function decodeContractAddress(addr: Uint8Array): string;
export function encodeUserAddress(addr: string): Uint8Array;
export function decodeUserAddress(addr: Uint8Array): string;
export function encodeContractAddress(addr: string): Uint8Array;
export function decodeRawTokenType(tt: Uint8Array): string;
export function decodeCoinPublicKey(pk: Uint8Array): string;
export function decodeShieldedCoinInfo(coin: any): any;
export function encodeQualifiedShieldedCoinInfo(coin: any): any;
export function encodeShieldedCoinInfo(coin: any): any;
export function encodeRawTokenType(tt: string): Uint8Array;
export function decodeQualifiedShieldedCoinInfo(coin: any): any;
export function encodeCoinPublicKey(pk: string): Uint8Array;
export function runProgram(initial: VmStack, ops: any, cost_model: CostModel, gas_limit: any): VmResults;
/**
 * The `ReadableStreamType` enum.
 *
 * *This API requires the following crate features to be activated: `ReadableStreamType`*
 */
type ReadableStreamType = "bytes";
export class AuthorizedClaim {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(proof_marker: string, raw: Uint8Array): AuthorizedClaim;
  eraseProof(): AuthorizedClaim;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly coin: any;
  readonly recipient: string;
}
export class Binding {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): Binding;
  constructor(binding: string);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly instance: string;
}
export class ChargedState {
  free(): void;
  [Symbol.dispose](): void;
  constructor(state: StateValue);
  toString(compact?: boolean | null): string;
  readonly state: StateValue;
}
export class ClaimRewardsTransaction {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(signature_marker: string, raw: Uint8Array): ClaimRewardsTransaction;
  addSignature(signature: any): ClaimRewardsTransaction;
  eraseSignatures(): ClaimRewardsTransaction;
  static new(network_id: string, value: bigint, owner: any, nonce: string, kind: string): ClaimRewardsTransaction;
  constructor(signature_marker: string, network_id: string, value: bigint, owner: any, nonce: string, signature: any, kind: any);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly dataToSign: Uint8Array;
  readonly kind: string;
  readonly nonce: string;
  readonly owner: any;
  readonly value: bigint;
  readonly signature: any;
}
export class CoinSecretKey {
  free(): void;
  [Symbol.dispose](): void;
  public_key(): string;
  constructor();
  clear(): void;
  yesIKnowTheSecurityImplicationsOfThis_serialize(): Uint8Array;
}
export class ContractCall {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  toString(compact?: boolean | null): string;
  readonly entryPoint: any;
  readonly fallibleTranscript: any;
  readonly guaranteedTranscript: any;
  readonly communicationCommitment: string;
  readonly proof: any;
  readonly address: string;
}
export class ContractCallPrototype {
  free(): void;
  [Symbol.dispose](): void;
  constructor(address: string, entry_point: any, op: ContractOperation, guaranteed_public_transcript: any, fallible_public_transcript: any, private_transcript_outputs: any[], input: any, output: any, communication_commitment_rand: string, key_location: string);
  intoCall(_parent_binding: any): ContractCall;
  toString(compact?: boolean | null): string;
}
export class ContractDeploy {
  free(): void;
  [Symbol.dispose](): void;
  constructor(initial_state: ContractState);
  toString(compact?: boolean | null): string;
  readonly initialState: ContractState;
  readonly address: string;
}
export class ContractMaintenanceAuthority {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): ContractMaintenanceAuthority;
  constructor(committee: Array<any>, threshold: number, counter?: bigint | null);
  serialize(): any;
  toString(compact?: boolean | null): string;
  readonly counter: bigint;
  readonly committee: Array<any>;
  readonly threshold: number;
}
export class ContractOperation {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): ContractOperation;
  constructor();
  serialize(): any;
  toString(compact?: boolean | null): string;
  get verifierKey(): any;
  set verifierKey(value: Uint8Array);
}
export class ContractOperationVersion {
  free(): void;
  [Symbol.dispose](): void;
  constructor(version: string);
  toString(compact?: boolean | null): string;
  readonly version: string;
}
export class ContractOperationVersionedVerifierKey {
  free(): void;
  [Symbol.dispose](): void;
  constructor(version: string, raw_vk: Uint8Array);
  toString(compact?: boolean | null): string;
  readonly rawVk: Uint8Array;
  readonly version: string;
}
export class ContractState {
  free(): void;
  [Symbol.dispose](): void;
  operations(): any[];
  static deserialize(raw: Uint8Array): ContractState;
  setOperation(operation: any, value: ContractOperation): void;
  constructor();
  query(query: any, cost_model: CostModel): any;
  operation(operation: any): ContractOperation | undefined;
  serialize(): any;
  toString(compact?: boolean | null): string;
  balance: Map<any, any>;
  maintenanceAuthority: ContractMaintenanceAuthority;
  data: ChargedState;
}
export class CostModel {
  free(): void;
  [Symbol.dispose](): void;
  static initialCostModel(): CostModel;
  constructor();
  toString(compact?: boolean | null): string;
}
export class DustActions {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(signature_marker: string, proof_marker: string, raw: Uint8Array): DustActions;
  constructor(signature_marker: string, proof_marker: string, ctime: Date, spends: any, registrations: any);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  get spends(): DustSpend[];
  set spends(value: any);
  get registrations(): DustRegistration[];
  set registrations(value: any);
  ctime: Date;
}
export class DustGenerationState {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): DustGenerationState;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
}
export class DustGenerationTreeInsertionPath {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): DustGenerationTreeInsertionPath;
  constructor(state: DustGenerationState, index: bigint);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
}
export class DustLocalState {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): DustLocalState;
  removeUtxo(nullifier: bigint): DustLocalState;
  processTtls(time: Date): DustLocalState;
  replayEvents(sk: DustSecretKey, events: Event[]): DustLocalState;
  walletBalance(time: Date): bigint;
  generationInfo(qdo: any): any;
  insertCommitment(commitment_index: bigint, qdo: any, own_qdo: boolean): DustLocalState;
  removeCommitment(commitment_index: bigint): DustLocalState;
  replayRawEvents(sk: DustSecretKey, raw_events: Uint8Array): DustLocalStateWithChanges;
  commitmentTreeRoot(): any;
  generatingTreeRoot(): any;
  findUtxoByNullifier(nullifier: bigint): any;
  insertGenerationInfo(generation_index: bigint, generation: any, initial_nonce?: string | null): DustLocalState;
  removeGenerationInfo(generation_index: bigint, generation: any): DustLocalState;
  collapseCommitmentTree(commitment_index_start: bigint, commitment_index_end: bigint): DustLocalState;
  collapseGenerationTree(generation_index_start: bigint, generation_index_end: bigint): DustLocalState;
  replayEventsWithChanges(sk: DustSecretKey, events: Event[]): DustLocalStateWithChanges;
  applyCommitmentCollapsedUpdate(update: DustStateMerkleTreeCollapsedUpdate): DustLocalState;
  applyGenerationCollapsedUpdate(update: DustStateMerkleTreeCollapsedUpdate): DustLocalState;
  updateGenerationTreeFromEvidence(insertion: DustGenerationTreeInsertionPath): DustLocalState;
  constructor(params: DustParameters);
  spend(sk: DustSecretKey, utxo: any, v_fee: bigint, ctime: Date): Array<any>;
  addUtxo(nullifier: bigint, utxo: any, pending_until?: Date | null): DustLocalState;
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly nullifiers: Map<any, any>;
  syncTime: Date;
  readonly commitmentTreeFirstFree: bigint;
  readonly generatingTreeFirstFree: bigint;
  readonly utxos: any[];
  readonly params: DustParameters;
}
export class DustLocalStateWithChanges {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  readonly state: DustLocalState;
  readonly changes: DustStateChanges[];
}
export class DustParameters {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): DustParameters;
  constructor(night_dust_ratio: bigint, generation_decay_rate: bigint, dust_grace_period_seconds: bigint);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  nightDustRatio: bigint;
  readonly timeToCapSeconds: bigint;
  generationDecayRate: bigint;
  dustGracePeriodSeconds: bigint;
}
export class DustRegistration {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(signature_marker: string, raw: Uint8Array): DustRegistration;
  constructor(signature_marker: string, night_key: any, dust_address: bigint | null | undefined, allow_fee_payment: bigint, signature: any);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  get dustAddress(): bigint | undefined;
  set dustAddress(value: bigint | null | undefined);
  nightKey: any;
  signature: any;
  allowFeePayment: bigint;
}
export class DustSecretKey {
  free(): void;
  [Symbol.dispose](): void;
  static fromBigint(bigint: bigint): DustSecretKey;
  constructor();
  clear(): void;
  static fromSeed(seed: Uint8Array): DustSecretKey;
  readonly publicKey: bigint;
}
export class DustSpend {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  toString(compact?: boolean | null): string;
  readonly oldNullifier: bigint;
  readonly newCommitment: bigint;
  readonly proof: any;
  readonly vFee: bigint;
}
export class DustState {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): DustState;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly generation: DustGenerationState;
  readonly utxo: DustUtxoState;
}
export class DustStateChanges {
  free(): void;
  [Symbol.dispose](): void;
  constructor(source: string, received_utxos: any[], spent_utxos: any[]);
  toString(compact?: boolean | null): string;
  readonly spentUtxos: Array<any>;
  readonly receivedUtxos: Array<any>;
  readonly source: string;
}
export class DustStateMerkleTreeCollapsedUpdate {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): DustStateMerkleTreeCollapsedUpdate;
  static newFromCommitmentTree(state: DustUtxoState, start: bigint, end: bigint): DustStateMerkleTreeCollapsedUpdate;
  static newFromGenerationTree(state: DustGenerationState, start: bigint, end: bigint): DustStateMerkleTreeCollapsedUpdate;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
}
export class DustUtxoState {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): DustUtxoState;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
}
export class EncryptionSecretKey {
  free(): void;
  [Symbol.dispose](): void;
  public_key(): string;
  static deserialize(raw: Uint8Array): EncryptionSecretKey;
  yesIKnowTheSecurityImplicationsOfThis_taggedSerialize(): Uint8Array;
  static taggedDeserialize(raw: Uint8Array): EncryptionSecretKey;
  constructor();
  test(offer: ZswapOffer): boolean;
  clear(): void;
  yesIKnowTheSecurityImplicationsOfThis_serialize(): Uint8Array;
}
export class Event {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): Event;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly source: any;
  readonly content: any;
}
export class Intent {
  free(): void;
  [Symbol.dispose](): void;
  addDeploy(deploy: ContractDeploy): Intent;
  static deserialize(signature_marker: string, proof_marker: string, binding_marker: string, raw: Uint8Array): Intent;
  intentHash(segment_id: number): string;
  eraseProofs(): Intent;
  signatureData(segment_id: number): Uint8Array;
  eraseSignatures(): Intent;
  has_fallible_offers(): boolean;
  addMaintenanceUpdate(update: MaintenanceUpdate): Intent;
  has_contract_deployments(): boolean;
  has_fallible_transcripts(): boolean;
  static new(ttl: Date): Intent;
  bind(segment_id: number): Intent;
  addCall(call: ContractCallPrototype): Intent;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  actions: any[];
  dustActions: any;
  get fallibleUnshieldedOffer(): UnshieldedOffer | undefined;
  set fallibleUnshieldedOffer(value: any);
  get guaranteedUnshieldedOffer(): UnshieldedOffer | undefined;
  set guaranteedUnshieldedOffer(value: any);
  ttl: Date;
  readonly binding: any;
}
export class IntoUnderlyingByteSource {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  pull(controller: ReadableByteStreamController): Promise<any>;
  start(controller: ReadableByteStreamController): void;
  cancel(): void;
  readonly autoAllocateChunkSize: number;
  readonly type: ReadableStreamType;
}
export class IntoUnderlyingSink {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  abort(reason: any): Promise<any>;
  close(): Promise<any>;
  write(chunk: any): Promise<any>;
}
export class IntoUnderlyingSource {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  pull(controller: ReadableStreamDefaultController): Promise<any>;
  cancel(): void;
}
export class IrInsert {
  free(): void;
  [Symbol.dispose](): void;
  constructor(operation: any, vk: Uint8Array);
  toString(compact?: boolean | null): string;
  readonly ir: Uint8Array;
  readonly operation: any;
}
export class IrRemove {
  free(): void;
  [Symbol.dispose](): void;
  constructor(operation: any);
  toString(compact?: boolean | null): string;
  readonly operation: any;
}
export class LedgerParameters {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): LedgerParameters;
  static initialParameters(): LedgerParameters;
  normalizeFullness(fullness: any): any;
  maxPriceAdjustment(): number;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly feePrices: any;
  readonly transactionCostModel: TransactionCostModel;
  readonly dust: DustParameters;
}
export class LedgerState {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): LedgerState;
  updateIndex(address: string, state: ChargedState, balances_map: Map<any, any>): LedgerState;
  applySystemTx(tx: SystemTransaction, tblock: Date): Array<any>;
  bridgeReceiving(recipient: string): bigint;
  testingDistributeNight(user_address: string, amount: bigint, tblock: Date): LedgerState;
  treasuryBalance(token_type: any): bigint;
  postBlockUpdate(tblock: Date, detailed_fullness: any, overall_fullness: any): LedgerState;
  static testingFromGenesis(network_id: string, locked_pool: bigint, reserve_pool: bigint, treasury: bigint): LedgerState;
  unclaimedBlockRewards(recipient: string): bigint;
  testingUnlockToReserve(amount: bigint, tblock: Date): LedgerState;
  testingUnlockToTreasury(amount: bigint, tblock: Date): LedgerState;
  constructor(network_id: string, zswap: ZswapChainState);
  apply(transaction: VerifiedTransaction, context: TransactionContext): any;
  static blank(network_id: string): LedgerState;
  index(address: string): ContractState | undefined;
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  parameters: LedgerParameters;
  readonly lockedPool: bigint;
  readonly reservePool: bigint;
  readonly blockRewardPool: bigint;
  readonly dust: DustState;
  readonly utxo: UtxoState;
  readonly zswap: ZswapChainState;
}
export class MaintenanceUpdate {
  free(): void;
  [Symbol.dispose](): void;
  addSignature(idx: bigint, signature: any): MaintenanceUpdate;
  constructor(address: string, updates: any[], counter: bigint);
  toString(compact?: boolean | null): string;
  readonly signatures: any[];
  readonly dataToSign: Uint8Array;
  readonly address: string;
  readonly counter: bigint;
  readonly updates: any[];
}
export class MerkleTreeCollapsedUpdate {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): MerkleTreeCollapsedUpdate;
  constructor(state: ZswapChainState, start: bigint, end: bigint);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
}
export class NoBinding {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): NoBinding;
  constructor(binding: string);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly instance: string;
}
export class NoProof {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  toString(_compact?: boolean | null): string;
  readonly instance: string;
}
export class PreBinding {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): PreBinding;
  constructor(binding: string);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly instance: string;
}
export class PrePartitionContractCall {
  free(): void;
  [Symbol.dispose](): void;
  constructor(address: string, entry_point: any, op: ContractOperation, pre_transcript: PreTranscript, private_transcript_outputs: any[], input: any, output: any, communication_commitment_rand: string, key_location: string);
  toString(compact?: boolean | null): string;
}
export class PreProof {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): PreProof;
  constructor(data: string);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly instance: string;
}
export class PreTranscript {
  free(): void;
  [Symbol.dispose](): void;
  constructor(context: QueryContext, program: any, comm_comm: any);
  toString(compact?: boolean | null): string;
}
export class Proof {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): Proof;
  constructor(data: string);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly instance: string;
}
export class QueryContext {
  free(): void;
  [Symbol.dispose](): void;
  toVmStack(): VmStack;
  runTranscript(transcript: any, cost_model: CostModel): QueryContext;
  insertCommitment(comm: string, index: bigint): QueryContext;
  constructor(state: ChargedState, address: string);
  query(ops: any, cost_model: CostModel, gas_limit: any): QueryResults;
  qualify(coin: any): any;
  toString(compact?: boolean | null): string;
  readonly comIndices: any;
  effects: any;
  block: any;
  readonly state: ChargedState;
  readonly address: string;
}
export class QueryResults {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  toString(compact?: boolean | null): string;
  readonly events: any;
  readonly context: QueryContext;
  readonly gasCost: any;
}
export class ReplaceAuthority {
  free(): void;
  [Symbol.dispose](): void;
  constructor(authority: ContractMaintenanceAuthority);
  toString(compact?: boolean | null): string;
  readonly authority: ContractMaintenanceAuthority;
}
export class SignatureEnabled {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): SignatureEnabled;
  constructor(signature: any);
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly value: any;
  readonly instance: string;
}
export class SignatureErased {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  toString(_compact?: boolean | null): string;
  readonly instance: string;
}
export class StateBoundedMerkleTree {
  free(): void;
  [Symbol.dispose](): void;
  pathForLeaf(index: bigint, leaf: any): any;
  findPathForLeaf(leaf: any, index_start?: bigint | null, index_end?: bigint | null, already_hashed?: boolean | null): any;
  root(): any;
  constructor(height: number);
  rehash(): StateBoundedMerkleTree;
  update(index: bigint, leaf: any): StateBoundedMerkleTree;
  collapse(start: bigint, end: bigint): StateBoundedMerkleTree;
  toString(compact?: boolean | null): string;
  readonly height: number;
}
export class StateMap {
  free(): void;
  [Symbol.dispose](): void;
  get(key: any): StateValue | undefined;
  constructor();
  keys(): any[];
  insert(key: any, value: StateValue): StateMap;
  remove(key: any): StateMap;
  toString(compact?: boolean | null): string;
}
export class StateValue {
  free(): void;
  [Symbol.dispose](): void;
  arrayPush(value: StateValue): StateValue;
  asBoundedMerkleTree(): StateBoundedMerkleTree | undefined;
  static newBoundedMerkleTree(tree: StateBoundedMerkleTree): StateValue;
  constructor();
  type(): string;
  asMap(): StateMap | undefined;
  static decode(value: any): StateValue;
  encode(): any;
  asCell(): any;
  static newMap(map: StateMap): StateValue;
  asArray(): any[] | undefined;
  logSize(): number;
  static newCell(value: any): StateValue;
  static newNull(): StateValue;
  static newArray(): StateValue;
  toString(compact?: boolean | null): string;
}
export class SystemTransaction {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): SystemTransaction;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
}
export class Transaction {
  free(): void;
  [Symbol.dispose](): void;
  addIntent(segment: any, raw_intent: any): Transaction;
  static fromParts(network_id: string, guaranteed: any, fallible: any, intent: any): Transaction;
  imbalances(segment: number, fees?: bigint | null): Map<any, any>;
  mockProve(): Transaction;
  static deserialize(signature_marker: string, proof_marker: string, binding_marker: string, raw: Uint8Array): Transaction;
  identifiers(): string[];
  wellFormed(ref_state: LedgerState, strictness: WellFormedStrictness, tblock: Date): VerifiedTransaction;
  eraseProofs(): Transaction;
  static fromRewards(rewards: ClaimRewardsTransaction): Transaction;
  addZswapOffer(segment: any, raw_offer: any): Transaction;
  eraseSignatures(): Transaction;
  feesWithMargin(params: LedgerParameters, n: number): bigint;
  transactionHash(): string;
  static fromPartsRandomized(network_id: string, guaranteed: any, fallible: any, intent: any): Transaction;
  constructor();
  bind(): Transaction;
  cost(params: LedgerParameters, enforce_time_to_dismiss?: boolean | null): any;
  fees(params: LedgerParameters, enforce_time_to_dismiss?: boolean | null): bigint;
  merge(other: Transaction): Transaction;
  prove(provider: any, cost_model: CostModel): Promise<Transaction>;
  addCalls(segment: any, calls: Array<any>, params: LedgerParameters, ttl: Date, zswap_inputs?: Array<any> | null, zswap_outputs?: Array<any> | null, zswap_transient?: Array<any> | null): Transaction;
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  get intents(): Map<any, any> | undefined;
  set intents(value: Map<any, any> | null | undefined);
  get fallibleOffer(): Map<any, any> | undefined;
  set fallibleOffer(value: Map<any, any> | null | undefined);
  get guaranteedOffer(): ZswapOffer | undefined;
  set guaranteedOffer(value: any);
  readonly bindingRandomness: bigint;
  readonly rewards: ClaimRewardsTransaction | undefined;
}
export class TransactionContext {
  free(): void;
  [Symbol.dispose](): void;
  constructor(ref_state: LedgerState, block_context: any, whitelist: any);
  toString(compact?: boolean | null): string;
}
export class TransactionCostModel {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): TransactionCostModel;
  static initialTransactionCostModel(): TransactionCostModel;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly baselineCost: any;
  readonly runtimeCostModel: CostModel;
}
export class TransactionResult {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  toString(compact?: boolean | null): string;
  readonly successfulSegments: Map<any, any> | undefined;
  readonly error: string | undefined;
  readonly type: string;
  readonly events: Event[];
}
export class UnshieldedOffer {
  free(): void;
  [Symbol.dispose](): void;
  addSignatures(signatures: any[]): UnshieldedOffer;
  eraseSignatures(): UnshieldedOffer;
  static new(inputs: any[], outputs: any[], signatures: any[]): UnshieldedOffer;
  constructor();
  toString(compact?: boolean | null): string;
  readonly signatures: any[];
  readonly inputs: any[];
  readonly outputs: any[];
}
export class UtxoMeta {
  free(): void;
  [Symbol.dispose](): void;
  constructor(ctime: Date);
  ctime: Date;
}
export class UtxoState {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  lookupMeta(utxo: any): UtxoMeta | undefined;
  static new(utxo_map: Map<any, any>): UtxoState;
  delta(prior: UtxoState, filter_by?: Function | null): Array<any>;
  filter(user_address: string): Set<any>;
  readonly utxos: Set<any>;
}
export class VerifiedTransaction {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  readonly transaction: Transaction;
}
export class VerifierKeyInsert {
  free(): void;
  [Symbol.dispose](): void;
  constructor(operation: any, vk: ContractOperationVersionedVerifierKey);
  toString(compact?: boolean | null): string;
  readonly vk: ContractOperationVersionedVerifierKey;
  readonly operation: any;
}
export class VerifierKeyRemove {
  free(): void;
  [Symbol.dispose](): void;
  constructor(operation: any, version: ContractOperationVersion);
  toString(compact?: boolean | null): string;
  readonly version: ContractOperationVersion;
  readonly operation: any;
}
export class VmResults {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  toString(compact?: boolean | null): string;
  readonly stack: VmStack;
  readonly events: any;
  readonly gasCost: any;
}
export class VmStack {
  free(): void;
  [Symbol.dispose](): void;
  removeLast(): void;
  get(idx: number): StateValue | undefined;
  constructor();
  push(value: StateValue, is_strong: boolean): void;
  length(): number;
  isStrong(idx: number): boolean | undefined;
  toString(compact?: boolean | null): string;
}
export class WellFormedStrictness {
  free(): void;
  [Symbol.dispose](): void;
  constructor();
  enforceLimits: boolean;
  enforceBalancing: boolean;
  verifySignatures: boolean;
  verifyNativeProofs: boolean;
  verifyContractProofs: boolean;
}
export class ZswapChainState {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): ZswapChainState;
  postBlockUpdate(tblock: Date, retention_duration: bigint): ZswapChainState;
  static deserializeFromLedgerState(raw: Uint8Array): ZswapChainState;
  constructor();
  filter(contract_address: string): ZswapChainState;
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  tryApply(offer: ZswapOffer, whitelist: any): any;
  readonly firstFree: bigint;
}
export class ZswapInput {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(proof_marker: string, raw: Uint8Array): ZswapInput;
  static newContractOwned(coin: any, segment: number | null | undefined, contract: string, state: ZswapChainState): ZswapInput;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly contractAddress: string | undefined;
  readonly proof: any;
  readonly nullifier: string;
}
export class ZswapLocalState {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(raw: Uint8Array): ZswapLocalState;
  insertCoin(secret_keys: ZswapSecretKeys, coin: any): ZswapLocalState;
  applyFailed(offer: ZswapOffer): ZswapLocalState;
  clearPending(_time: Date): ZswapLocalState;
  replayEvents(secret_keys: ZswapSecretKeys, events: Event[]): ZswapLocalState;
  replayRawEvents(secret_keys: ZswapSecretKeys, raw_events: Uint8Array): ZswapLocalStateWithChanges;
  spendFromOutput(secret_keys: ZswapSecretKeys, coin: any, segment: number | null | undefined, output: ZswapOutput, _ttl?: Date | null): any;
  applyWithChanges(secret_keys: ZswapSecretKeys, offer: ZswapOffer): ZswapLocalStateWithChanges;
  revertTransaction(tx: Transaction): ZswapLocalState;
  applyCollapsedUpdate(update: MerkleTreeCollapsedUpdate): ZswapLocalState;
  removeCoinByNullifier(nullifier: string): ZswapLocalState;
  replayEventsWithChanges(secret_keys: ZswapSecretKeys, events: Event[]): ZswapLocalStateWithChanges;
  constructor();
  apply(secret_keys: ZswapSecretKeys, offer: ZswapOffer): ZswapLocalState;
  spend(secret_keys: ZswapSecretKeys, coin: any, segment?: number | null, _ttl?: Date | null): any;
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  watchFor(coin_public_key: string, coin: any): ZswapLocalState;
  readonly firstFree: bigint;
  readonly pendingSpends: Map<any, any>;
  readonly pendingOutputs: Map<any, any>;
  readonly merkleTreeRoot: any;
  readonly coins: Set<any>;
}
export class ZswapLocalStateWithChanges {
  private constructor();
  free(): void;
  [Symbol.dispose](): void;
  readonly state: ZswapLocalState;
  readonly changes: ZswapStateChanges[];
}
export class ZswapOffer {
  free(): void;
  [Symbol.dispose](): void;
  static fromInput(input: ZswapInput, _type?: string | null, _value?: bigint | null): ZswapOffer;
  static deserialize(proof_marker: string, raw: Uint8Array): ZswapOffer;
  static fromOutput(output: ZswapOutput, _type?: string | null, _value?: bigint | null): ZswapOffer;
  static fromTransient(transient: ZswapTransient): ZswapOffer;
  constructor();
  merge(other: ZswapOffer): ZswapOffer;
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly transients: any[];
  readonly deltas: Map<any, any>;
  readonly inputs: any[];
  readonly outputs: any[];
}
export class ZswapOutput {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(proof_marker: string, raw: Uint8Array): ZswapOutput;
  static newContractOwned(coin: any, segment: number | null | undefined, contract: string): ZswapOutput;
  static new(coin: any, segment: number | null | undefined, target_cpk: string, target_epk: string): ZswapOutput;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly commitment: string;
  readonly contractAddress: string | undefined;
  readonly proof: any;
}
export class ZswapSecretKeys {
  free(): void;
  [Symbol.dispose](): void;
  static fromSeedRng(seed: Uint8Array): ZswapSecretKeys;
  constructor();
  clear(): void;
  static fromSeed(seed: Uint8Array): ZswapSecretKeys;
  readonly coinPublicKey: string;
  readonly coinSecretKey: CoinSecretKey;
  readonly encryptionPublicKey: string;
  readonly encryptionSecretKey: EncryptionSecretKey;
}
/**
 * WASM wrapper for ZswapStateChanges (used by Zswap)
 */
export class ZswapStateChanges {
  free(): void;
  [Symbol.dispose](): void;
  constructor(source: string, received_coins: any[], spent_coins: any[]);
  toString(compact?: boolean | null): string;
  readonly spentCoins: Array<any>;
  readonly receivedCoins: Array<any>;
  readonly source: string;
}
export class ZswapTransient {
  free(): void;
  [Symbol.dispose](): void;
  static deserialize(proof_marker: string, raw: Uint8Array): ZswapTransient;
  static newFromContractOwnedOutput(coin: any, segment: number | null | undefined, output: ZswapOutput): ZswapTransient;
  constructor();
  serialize(): Uint8Array;
  toString(compact?: boolean | null): string;
  readonly commitment: string;
  readonly inputProof: any;
  readonly outputProof: any;
  readonly contractAddress: string | undefined;
  readonly nullifier: string;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly __wbg_pretranscript_free: (a: number, b: number) => void;
  readonly partitionTranscripts: (a: number, b: number, c: number) => [number, number, number];
  readonly pretranscript_new: (a: number, b: any, c: any) => [number, number, number];
  readonly pretranscript_toString: (a: number, b: number) => [number, number];
  readonly __wbg_authorizedclaim_free: (a: number, b: number) => void;
  readonly __wbg_claimrewardstransaction_free: (a: number, b: number) => void;
  readonly __wbg_coinsecretkey_free: (a: number, b: number) => void;
  readonly __wbg_encryptionsecretkey_free: (a: number, b: number) => void;
  readonly __wbg_intent_free: (a: number, b: number) => void;
  readonly __wbg_ledgerparameters_free: (a: number, b: number) => void;
  readonly __wbg_merkletreecollapsedupdate_free: (a: number, b: number) => void;
  readonly __wbg_prepartitioncontractcall_free: (a: number, b: number) => void;
  readonly __wbg_systemtransaction_free: (a: number, b: number) => void;
  readonly __wbg_transaction_free: (a: number, b: number) => void;
  readonly __wbg_transactioncontext_free: (a: number, b: number) => void;
  readonly __wbg_transactioncostmodel_free: (a: number, b: number) => void;
  readonly __wbg_transactionresult_free: (a: number, b: number) => void;
  readonly __wbg_unshieldedoffer_free: (a: number, b: number) => void;
  readonly __wbg_verifiedtransaction_free: (a: number, b: number) => void;
  readonly __wbg_wellformedstrictness_free: (a: number, b: number) => void;
  readonly __wbg_zswapchainstate_free: (a: number, b: number) => void;
  readonly __wbg_zswapinput_free: (a: number, b: number) => void;
  readonly __wbg_zswaplocalstate_free: (a: number, b: number) => void;
  readonly __wbg_zswaplocalstatewithchanges_free: (a: number, b: number) => void;
  readonly __wbg_zswapoffer_free: (a: number, b: number) => void;
  readonly __wbg_zswapoutput_free: (a: number, b: number) => void;
  readonly __wbg_zswapsecretkeys_free: (a: number, b: number) => void;
  readonly __wbg_zswaptransient_free: (a: number, b: number) => void;
  readonly addressFromKey: (a: any) => [number, number, number, number];
  readonly authorizedclaim_coin: (a: number) => [number, number, number];
  readonly authorizedclaim_deserialize: (a: number, b: number, c: any) => [number, number, number];
  readonly authorizedclaim_eraseProof: (a: number) => [number, number, number];
  readonly authorizedclaim_new: () => [number, number, number];
  readonly authorizedclaim_recipient: (a: number) => [number, number, number, number];
  readonly authorizedclaim_serialize: (a: number) => [number, number, number];
  readonly authorizedclaim_toString: (a: number, b: number) => [number, number];
  readonly claimrewardstransaction_addSignature: (a: number, b: any) => [number, number, number];
  readonly claimrewardstransaction_construct: (a: number, b: number, c: number, d: number, e: any, f: any, g: number, h: number, i: any, j: any) => [number, number, number];
  readonly claimrewardstransaction_dataToSign: (a: number) => any;
  readonly claimrewardstransaction_deserialize: (a: number, b: number, c: any) => [number, number, number];
  readonly claimrewardstransaction_eraseSignatures: (a: number) => [number, number, number];
  readonly claimrewardstransaction_kind: (a: number) => [number, number];
  readonly claimrewardstransaction_new: (a: number, b: number, c: any, d: any, e: number, f: number, g: number, h: number) => [number, number, number];
  readonly claimrewardstransaction_nonce: (a: number) => [number, number, number, number];
  readonly claimrewardstransaction_owner: (a: number) => [number, number, number];
  readonly claimrewardstransaction_serialize: (a: number) => [number, number, number];
  readonly claimrewardstransaction_signature: (a: number) => [number, number, number];
  readonly claimrewardstransaction_toString: (a: number, b: number) => [number, number];
  readonly claimrewardstransaction_value: (a: number) => any;
  readonly coinCommitment: (a: any, b: number, c: number) => [number, number, number, number];
  readonly coinNullifier: (a: any, b: number) => [number, number, number, number];
  readonly coinsecretkey_clear: (a: number) => void;
  readonly coinsecretkey_new: () => [number, number, number];
  readonly coinsecretkey_public_key: (a: number) => [number, number, number, number];
  readonly coinsecretkey_yesIKnowTheSecurityImplicationsOfThis_serialize: (a: number) => [number, number, number];
  readonly createCheckPayload: (a: any, b: number) => [number, number, number];
  readonly createCoinInfo: (a: number, b: number, c: any) => [number, number, number];
  readonly createProvingPayload: (a: any, b: number, c: any) => [number, number, number];
  readonly createProvingTransactionPayload: (a: number, b: any) => [number, number, number];
  readonly createShieldedCoinInfo: (a: number, b: number, c: any) => [number, number, number];
  readonly dustCommitment: (a: any) => [number, number, number];
  readonly dustFirstNonce: (a: number, b: number, c: any) => [number, number, number];
  readonly dustInitialNonce: (a: bigint, b: number, c: number) => [number, number, number, number];
  readonly dustNonce: (a: number, b: number, c: bigint, d: number) => [number, number, number];
  readonly dustNullifier: (a: any, b: number) => [number, number, number];
  readonly encryptionsecretkey_clear: (a: number) => void;
  readonly encryptionsecretkey_deserialize: (a: any) => [number, number, number];
  readonly encryptionsecretkey_new: () => [number, number, number];
  readonly encryptionsecretkey_public_key: (a: number) => [number, number, number, number];
  readonly encryptionsecretkey_taggedDeserialize: (a: any) => [number, number, number];
  readonly encryptionsecretkey_test: (a: number, b: number) => [number, number, number];
  readonly encryptionsecretkey_yesIKnowTheSecurityImplicationsOfThis_serialize: (a: number) => [number, number, number];
  readonly encryptionsecretkey_yesIKnowTheSecurityImplicationsOfThis_taggedSerialize: (a: number) => [number, number, number];
  readonly feeToken: () => [number, number, number];
  readonly intent_actions: (a: number) => [number, number];
  readonly intent_addCall: (a: number, b: number) => [number, number, number];
  readonly intent_addDeploy: (a: number, b: number) => [number, number, number];
  readonly intent_addMaintenanceUpdate: (a: number, b: number) => [number, number, number];
  readonly intent_bind: (a: number, b: number) => [number, number, number];
  readonly intent_binding: (a: number) => [number, number, number];
  readonly intent_construct: () => [number, number, number];
  readonly intent_deserialize: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
  readonly intent_dustActions: (a: number) => [number, number, number];
  readonly intent_eraseProofs: (a: number) => [number, number, number];
  readonly intent_eraseSignatures: (a: number) => [number, number, number];
  readonly intent_fallibleUnshieldedOffer: (a: number) => number;
  readonly intent_guaranteedUnshieldedOffer: (a: number) => number;
  readonly intent_has_contract_deployments: (a: number) => number;
  readonly intent_has_fallible_offers: (a: number) => number;
  readonly intent_has_fallible_transcripts: (a: number) => number;
  readonly intent_intentHash: (a: number, b: number) => [number, number, number, number];
  readonly intent_new: (a: any) => [number, number, number];
  readonly intent_serialize: (a: number) => [number, number, number];
  readonly intent_set_actions: (a: number, b: number, c: number) => [number, number];
  readonly intent_set_dustActions: (a: number, b: any) => [number, number];
  readonly intent_set_fallibleUnshieldedOffer: (a: number, b: any) => [number, number];
  readonly intent_set_guaranteedUnshieldedOffer: (a: number, b: any) => [number, number];
  readonly intent_set_ttl: (a: number, b: any) => void;
  readonly intent_signatureData: (a: number, b: number) => any;
  readonly intent_toString: (a: number, b: number) => [number, number];
  readonly intent_ttl: (a: number) => any;
  readonly ledgerparameters_deserialize: (a: any) => [number, number, number];
  readonly ledgerparameters_dust: (a: number) => [number, number, number];
  readonly ledgerparameters_feePrices: (a: number) => [number, number, number];
  readonly ledgerparameters_initialParameters: () => number;
  readonly ledgerparameters_maxPriceAdjustment: (a: number) => number;
  readonly ledgerparameters_new: () => [number, number, number];
  readonly ledgerparameters_normalizeFullness: (a: number, b: any) => [number, number, number];
  readonly ledgerparameters_serialize: (a: number) => [number, number, number];
  readonly ledgerparameters_toString: (a: number, b: number) => [number, number];
  readonly ledgerparameters_transactionCostModel: (a: number) => number;
  readonly merkletreecollapsedupdate_deserialize: (a: any) => [number, number, number];
  readonly merkletreecollapsedupdate_new: (a: number, b: bigint, c: bigint) => [number, number, number];
  readonly merkletreecollapsedupdate_serialize: (a: number) => [number, number, number];
  readonly merkletreecollapsedupdate_toString: (a: number, b: number) => [number, number];
  readonly nativeToken: () => [number, number, number];
  readonly parseCheckResult: (a: any) => [number, number, number];
  readonly prepartitioncontractcall_new: (a: number, b: number, c: any, d: number, e: number, f: number, g: number, h: any, i: any, j: number, k: number, l: number, m: number) => [number, number, number];
  readonly prepartitioncontractcall_toString: (a: number, b: number) => [number, number];
  readonly sampleCoinPublicKey: () => [number, number, number, number];
  readonly sampleEncryptionPublicKey: () => [number, number, number, number];
  readonly sampleIntentHash: () => [number, number, number, number];
  readonly shieldedToken: () => [number, number, number];
  readonly systemtransaction_deserialize: (a: any) => [number, number, number];
  readonly systemtransaction_new: () => [number, number, number];
  readonly systemtransaction_serialize: (a: number) => [number, number, number];
  readonly systemtransaction_toString: (a: number, b: number) => [number, number];
  readonly transaction_addCalls: (a: number, b: any, c: any, d: number, e: any, f: number, g: number, h: number) => [number, number, number];
  readonly transaction_addIntent: (a: number, b: any, c: any) => [number, number, number];
  readonly transaction_addZswapOffer: (a: number, b: any, c: any) => [number, number, number];
  readonly transaction_bind: (a: number) => [number, number, number];
  readonly transaction_bindingRandomness: (a: number) => [number, number, number];
  readonly transaction_cost: (a: number, b: number, c: number) => [number, number, number];
  readonly transaction_deserialize: (a: number, b: number, c: number, d: number, e: number, f: number, g: any) => [number, number, number];
  readonly transaction_eraseProofs: (a: number) => number;
  readonly transaction_eraseSignatures: (a: number) => [number, number, number];
  readonly transaction_fallibleOffer: (a: number) => any;
  readonly transaction_fees: (a: number, b: number, c: number) => [number, number, number];
  readonly transaction_feesWithMargin: (a: number, b: number, c: number) => [number, number, number];
  readonly transaction_fromParts: (a: number, b: number, c: any, d: any, e: any) => [number, number, number];
  readonly transaction_fromPartsRandomized: (a: number, b: number, c: any, d: any, e: any) => [number, number, number];
  readonly transaction_fromRewards: (a: number) => number;
  readonly transaction_guaranteedOffer: (a: number) => number;
  readonly transaction_identifiers: (a: number) => [number, number, number, number];
  readonly transaction_imbalances: (a: number, b: number, c: number) => [number, number, number];
  readonly transaction_intents: (a: number) => any;
  readonly transaction_merge: (a: number, b: number) => [number, number, number];
  readonly transaction_mockProve: (a: number) => [number, number, number];
  readonly transaction_new: () => [number, number, number];
  readonly transaction_prove: (a: number, b: any, c: number) => any;
  readonly transaction_rewards: (a: number) => number;
  readonly transaction_serialize: (a: number) => [number, number, number];
  readonly transaction_set_fallibleOffer: (a: number, b: number) => [number, number];
  readonly transaction_set_guaranteedOffer: (a: number, b: any) => [number, number];
  readonly transaction_set_intents: (a: number, b: number) => [number, number];
  readonly transaction_toString: (a: number, b: number) => [number, number];
  readonly transaction_transactionHash: (a: number) => [number, number, number, number];
  readonly transaction_wellFormed: (a: number, b: number, c: number, d: any) => [number, number, number];
  readonly transactioncontext_new: (a: number, b: any, c: any) => [number, number, number];
  readonly transactioncontext_toString: (a: number, b: number) => [number, number];
  readonly transactioncostmodel_baselineCost: (a: number) => [number, number, number];
  readonly transactioncostmodel_deserialize: (a: any) => [number, number, number];
  readonly transactioncostmodel_initialTransactionCostModel: () => number;
  readonly transactioncostmodel_new: () => [number, number, number];
  readonly transactioncostmodel_runtimeCostModel: (a: number) => number;
  readonly transactioncostmodel_serialize: (a: number) => [number, number, number];
  readonly transactioncostmodel_toString: (a: number, b: number) => [number, number];
  readonly transactionresult_error: (a: number) => [number, number];
  readonly transactionresult_events: (a: number) => [number, number];
  readonly transactionresult_new: () => [number, number, number];
  readonly transactionresult_successfulSegments: (a: number) => any;
  readonly transactionresult_toString: (a: number, b: number) => [number, number];
  readonly transactionresult_type_: (a: number) => [number, number];
  readonly unshieldedoffer_addSignatures: (a: number, b: number, c: number) => [number, number, number];
  readonly unshieldedoffer_construct: () => [number, number, number];
  readonly unshieldedoffer_eraseSignatures: (a: number) => [number, number, number];
  readonly unshieldedoffer_inputs: (a: number) => [number, number, number, number];
  readonly unshieldedoffer_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly unshieldedoffer_outputs: (a: number) => [number, number, number, number];
  readonly unshieldedoffer_signatures: (a: number) => [number, number];
  readonly unshieldedoffer_toString: (a: number, b: number) => [number, number];
  readonly verifiedtransaction_transaction: (a: number) => number;
  readonly wellformedstrictness_enforce_balancing: (a: number) => number;
  readonly wellformedstrictness_enforce_limits: (a: number) => number;
  readonly wellformedstrictness_new: () => number;
  readonly wellformedstrictness_set_enforce_balancing: (a: number, b: number) => void;
  readonly wellformedstrictness_set_enforce_limits: (a: number, b: number) => void;
  readonly wellformedstrictness_set_verify_contract_proofs: (a: number, b: number) => void;
  readonly wellformedstrictness_set_verify_native_proofs: (a: number, b: number) => void;
  readonly wellformedstrictness_set_verify_signatures: (a: number, b: number) => void;
  readonly wellformedstrictness_verify_contract_proofs: (a: number) => number;
  readonly wellformedstrictness_verify_native_proofs: (a: number) => number;
  readonly wellformedstrictness_verify_signatures: (a: number) => number;
  readonly zswapchainstate_deserialize: (a: any) => [number, number, number];
  readonly zswapchainstate_deserializeFromLedgerState: (a: any) => [number, number, number];
  readonly zswapchainstate_filter: (a: number, b: number, c: number) => [number, number, number];
  readonly zswapchainstate_firstFree: (a: number) => bigint;
  readonly zswapchainstate_new: () => number;
  readonly zswapchainstate_postBlockUpdate: (a: number, b: any, c: any) => [number, number, number];
  readonly zswapchainstate_serialize: (a: number) => [number, number, number];
  readonly zswapchainstate_toString: (a: number, b: number) => [number, number];
  readonly zswapchainstate_tryApply: (a: number, b: number, c: any) => [number, number, number];
  readonly zswapinput_contractAddress: (a: number) => [number, number, number, number];
  readonly zswapinput_deserialize: (a: number, b: number, c: any) => [number, number, number];
  readonly zswapinput_new: () => [number, number, number];
  readonly zswapinput_newContractOwned: (a: any, b: number, c: number, d: number, e: number) => [number, number, number];
  readonly zswapinput_nullifier: (a: number) => [number, number, number, number];
  readonly zswapinput_proof: (a: number) => [number, number, number];
  readonly zswapinput_serialize: (a: number) => [number, number, number];
  readonly zswapinput_toString: (a: number, b: number) => [number, number];
  readonly zswaplocalstate_apply: (a: number, b: number, c: number) => [number, number, number];
  readonly zswaplocalstate_applyCollapsedUpdate: (a: number, b: number) => [number, number, number];
  readonly zswaplocalstate_applyFailed: (a: number, b: number) => number;
  readonly zswaplocalstate_applyWithChanges: (a: number, b: number, c: number) => [number, number, number];
  readonly zswaplocalstate_clearPending: (a: number, b: any) => number;
  readonly zswaplocalstate_coins: (a: number) => [number, number, number];
  readonly zswaplocalstate_deserialize: (a: any) => [number, number, number];
  readonly zswaplocalstate_firstFree: (a: number) => bigint;
  readonly zswaplocalstate_insertCoin: (a: number, b: number, c: any) => [number, number, number];
  readonly zswaplocalstate_merkle_tree_root: (a: number) => any;
  readonly zswaplocalstate_new: () => number;
  readonly zswaplocalstate_pendingOutputs: (a: number) => [number, number, number];
  readonly zswaplocalstate_pendingSpends: (a: number) => [number, number, number];
  readonly zswaplocalstate_removeCoinByNullifier: (a: number, b: number, c: number) => [number, number, number];
  readonly zswaplocalstate_replayEvents: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly zswaplocalstate_replayEventsWithChanges: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly zswaplocalstate_replayRawEvents: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly zswaplocalstate_revertTransaction: (a: number, b: number) => number;
  readonly zswaplocalstate_serialize: (a: number) => [number, number, number];
  readonly zswaplocalstate_spend: (a: number, b: number, c: any, d: number, e: number) => [number, number, number];
  readonly zswaplocalstate_spendFromOutput: (a: number, b: number, c: any, d: number, e: number, f: number) => [number, number, number];
  readonly zswaplocalstate_toString: (a: number, b: number) => [number, number];
  readonly zswaplocalstate_watchFor: (a: number, b: number, c: number, d: any) => [number, number, number];
  readonly zswaplocalstatewithchanges_changes: (a: number) => [number, number];
  readonly zswaplocalstatewithchanges_state: (a: number) => number;
  readonly zswapoffer_deltas: (a: number) => [number, number, number];
  readonly zswapoffer_deserialize: (a: number, b: number, c: any) => [number, number, number];
  readonly zswapoffer_fromInput: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly zswapoffer_fromOutput: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly zswapoffer_fromTransient: (a: number) => [number, number, number];
  readonly zswapoffer_inputs: (a: number) => [number, number];
  readonly zswapoffer_merge: (a: number, b: number) => [number, number, number];
  readonly zswapoffer_new: () => [number, number, number];
  readonly zswapoffer_outputs: (a: number) => [number, number];
  readonly zswapoffer_serialize: (a: number) => [number, number, number];
  readonly zswapoffer_toString: (a: number, b: number) => [number, number];
  readonly zswapoffer_transients: (a: number) => [number, number];
  readonly zswapoutput_commitment: (a: number) => [number, number, number, number];
  readonly zswapoutput_construct: () => [number, number, number];
  readonly zswapoutput_contractAddress: (a: number) => [number, number, number, number];
  readonly zswapoutput_deserialize: (a: number, b: number, c: any) => [number, number, number];
  readonly zswapoutput_new: (a: any, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly zswapoutput_newContractOwned: (a: any, b: number, c: number, d: number) => [number, number, number];
  readonly zswapoutput_proof: (a: number) => [number, number, number];
  readonly zswapoutput_serialize: (a: number) => [number, number, number];
  readonly zswapoutput_toString: (a: number, b: number) => [number, number];
  readonly zswapsecretkeys_clear: (a: number) => void;
  readonly zswapsecretkeys_coinPublicKey: (a: number) => [number, number, number, number];
  readonly zswapsecretkeys_coinSecretKey: (a: number) => [number, number, number];
  readonly zswapsecretkeys_encryptionPublicKey: (a: number) => [number, number, number, number];
  readonly zswapsecretkeys_encryptionSecretKey: (a: number) => [number, number, number];
  readonly zswapsecretkeys_fromSeed: (a: any) => [number, number, number];
  readonly zswapsecretkeys_fromSeedRng: (a: any) => [number, number, number];
  readonly zswapsecretkeys_new: () => [number, number, number];
  readonly zswaptransient_commitment: (a: number) => [number, number, number, number];
  readonly zswaptransient_contractAddress: (a: number) => [number, number, number, number];
  readonly zswaptransient_deserialize: (a: number, b: number, c: any) => [number, number, number];
  readonly zswaptransient_inputProof: (a: number) => [number, number, number];
  readonly zswaptransient_new: () => [number, number, number];
  readonly zswaptransient_newFromContractOwnedOutput: (a: any, b: number, c: number) => [number, number, number];
  readonly zswaptransient_nullifier: (a: number) => [number, number, number, number];
  readonly zswaptransient_outputProof: (a: number) => [number, number, number];
  readonly zswaptransient_serialize: (a: number) => [number, number, number];
  readonly zswaptransient_toString: (a: number, b: number) => [number, number];
  readonly unshieldedToken: () => [number, number, number];
  readonly __wbg_contractcall_free: (a: number, b: number) => void;
  readonly __wbg_contractcallprototype_free: (a: number, b: number) => void;
  readonly __wbg_contractdeploy_free: (a: number, b: number) => void;
  readonly __wbg_contractoperationversion_free: (a: number, b: number) => void;
  readonly __wbg_contractoperationversionedverifierkey_free: (a: number, b: number) => void;
  readonly __wbg_duststatechanges_free: (a: number, b: number) => void;
  readonly __wbg_irinsert_free: (a: number, b: number) => void;
  readonly __wbg_irremove_free: (a: number, b: number) => void;
  readonly __wbg_maintenanceupdate_free: (a: number, b: number) => void;
  readonly __wbg_replaceauthority_free: (a: number, b: number) => void;
  readonly __wbg_verifierkeyinsert_free: (a: number, b: number) => void;
  readonly __wbg_verifierkeyremove_free: (a: number, b: number) => void;
  readonly __wbg_zswapstatechanges_free: (a: number, b: number) => void;
  readonly contractcall_address: (a: number) => [number, number, number, number];
  readonly contractcall_communicationCommitment: (a: number) => [number, number, number];
  readonly contractcall_entryPoint: (a: number) => [number, number, number];
  readonly contractcall_fallibleTranscript: (a: number) => [number, number, number];
  readonly contractcall_guaranteedTranscript: (a: number) => [number, number, number];
  readonly contractcall_new: () => [number, number, number];
  readonly contractcall_proof: (a: number) => [number, number, number];
  readonly contractcall_toString: (a: number, b: number) => [number, number];
  readonly contractcallprototype_intoCall: (a: number, b: any) => [number, number, number];
  readonly contractcallprototype_new: (a: number, b: number, c: any, d: number, e: any, f: any, g: number, h: number, i: any, j: any, k: number, l: number, m: number, n: number) => [number, number, number];
  readonly contractcallprototype_toString: (a: number, b: number) => [number, number];
  readonly contractdeploy_address: (a: number) => [number, number, number, number];
  readonly contractdeploy_initialState: (a: number) => number;
  readonly contractdeploy_new: (a: number) => number;
  readonly contractdeploy_toString: (a: number, b: number) => [number, number];
  readonly contractoperationversion_new: (a: number, b: number) => [number, number, number];
  readonly contractoperationversion_toString: (a: number, b: number) => [number, number];
  readonly contractoperationversion_version: (a: number) => [number, number];
  readonly contractoperationversionedverifierkey_new: (a: number, b: number, c: any) => [number, number, number];
  readonly contractoperationversionedverifierkey_raw_vk: (a: number) => [number, number, number];
  readonly contractoperationversionedverifierkey_toString: (a: number, b: number) => [number, number];
  readonly contractoperationversionedverifierkey_version: (a: number) => [number, number];
  readonly duststatechanges_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly duststatechanges_receivedUtxos: (a: number) => [number, number, number];
  readonly duststatechanges_source: (a: number) => [number, number, number, number];
  readonly duststatechanges_spentUtxos: (a: number) => [number, number, number];
  readonly duststatechanges_toString: (a: number, b: number) => [number, number];
  readonly irinsert_ir: (a: number) => any;
  readonly irinsert_new: (a: any, b: any) => [number, number, number];
  readonly irinsert_operation: (a: number) => any;
  readonly irinsert_toString: (a: number, b: number) => [number, number];
  readonly irremove_new: (a: any) => [number, number, number];
  readonly irremove_operation: (a: number) => any;
  readonly irremove_toString: (a: number, b: number) => [number, number];
  readonly maintenanceupdate_addSignature: (a: number, b: bigint, c: any) => [number, number, number];
  readonly maintenanceupdate_address: (a: number) => [number, number, number, number];
  readonly maintenanceupdate_counter: (a: number) => bigint;
  readonly maintenanceupdate_data_to_sign: (a: number) => any;
  readonly maintenanceupdate_new: (a: number, b: number, c: number, d: number, e: bigint) => [number, number, number];
  readonly maintenanceupdate_signatures: (a: number) => [number, number, number, number];
  readonly maintenanceupdate_toString: (a: number, b: number) => [number, number];
  readonly maintenanceupdate_updates: (a: number) => [number, number];
  readonly replaceauthority_authority: (a: number) => number;
  readonly replaceauthority_new: (a: number) => number;
  readonly replaceauthority_toString: (a: number, b: number) => [number, number];
  readonly verifierkeyinsert_new: (a: any, b: number) => [number, number, number];
  readonly verifierkeyinsert_operation: (a: number) => any;
  readonly verifierkeyinsert_toString: (a: number, b: number) => [number, number];
  readonly verifierkeyinsert_vk: (a: number) => number;
  readonly verifierkeyremove_new: (a: any, b: number) => [number, number, number];
  readonly verifierkeyremove_operation: (a: number) => any;
  readonly verifierkeyremove_toString: (a: number, b: number) => [number, number];
  readonly verifierkeyremove_version: (a: number) => number;
  readonly zswapstatechanges_new: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
  readonly zswapstatechanges_receivedCoins: (a: number) => [number, number, number];
  readonly zswapstatechanges_source: (a: number) => [number, number, number, number];
  readonly zswapstatechanges_spentCoins: (a: number) => [number, number, number];
  readonly zswapstatechanges_toString: (a: number, b: number) => [number, number];
  readonly __wbg_binding_free: (a: number, b: number) => void;
  readonly __wbg_dustactions_free: (a: number, b: number) => void;
  readonly __wbg_dustgenerationstate_free: (a: number, b: number) => void;
  readonly __wbg_dustgenerationtreeinsertionpath_free: (a: number, b: number) => void;
  readonly __wbg_dustlocalstate_free: (a: number, b: number) => void;
  readonly __wbg_dustlocalstatewithchanges_free: (a: number, b: number) => void;
  readonly __wbg_dustparameters_free: (a: number, b: number) => void;
  readonly __wbg_dustregistration_free: (a: number, b: number) => void;
  readonly __wbg_dustsecretkey_free: (a: number, b: number) => void;
  readonly __wbg_dustspend_free: (a: number, b: number) => void;
  readonly __wbg_duststate_free: (a: number, b: number) => void;
  readonly __wbg_duststatemerkletreecollapsedupdate_free: (a: number, b: number) => void;
  readonly __wbg_dustutxostate_free: (a: number, b: number) => void;
  readonly __wbg_nobinding_free: (a: number, b: number) => void;
  readonly __wbg_noproof_free: (a: number, b: number) => void;
  readonly __wbg_prebinding_free: (a: number, b: number) => void;
  readonly __wbg_preproof_free: (a: number, b: number) => void;
  readonly __wbg_proof_free: (a: number, b: number) => void;
  readonly __wbg_signatureenabled_free: (a: number, b: number) => void;
  readonly __wbg_signatureerased_free: (a: number, b: number) => void;
  readonly __wbg_utxometa_free: (a: number, b: number) => void;
  readonly binding_deserialize: (a: any) => [number, number, number];
  readonly binding_instance: (a: number) => [number, number];
  readonly binding_new: (a: number, b: number) => [number, number, number];
  readonly binding_serialize: (a: number) => [number, number, number];
  readonly binding_toString: (a: number, b: number) => [number, number];
  readonly dustactions_ctime: (a: number) => any;
  readonly dustactions_deserialize: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
  readonly dustactions_new: (a: number, b: number, c: number, d: number, e: any, f: any, g: any) => [number, number, number];
  readonly dustactions_registrations: (a: number) => [number, number, number, number];
  readonly dustactions_serialize: (a: number) => [number, number, number];
  readonly dustactions_set_ctime: (a: number, b: any) => [number, number];
  readonly dustactions_set_registrations: (a: number, b: any) => [number, number];
  readonly dustactions_set_spends: (a: number, b: any) => [number, number];
  readonly dustactions_spends: (a: number) => [number, number, number, number];
  readonly dustactions_toString: (a: number, b: number) => [number, number];
  readonly dustgenerationstate_deserialize: (a: any) => [number, number, number];
  readonly dustgenerationstate_new: () => [number, number, number];
  readonly dustgenerationstate_serialize: (a: number) => [number, number, number];
  readonly dustgenerationstate_toString: (a: number, b: number) => [number, number];
  readonly dustgenerationtreeinsertionpath_deserialize: (a: any) => [number, number, number];
  readonly dustgenerationtreeinsertionpath_new: (a: number, b: bigint) => [number, number, number];
  readonly dustgenerationtreeinsertionpath_serialize: (a: number) => [number, number, number];
  readonly dustgenerationtreeinsertionpath_toString: (a: number, b: number) => [number, number];
  readonly dustlocalstate_addUtxo: (a: number, b: any, c: any, d: number) => [number, number, number];
  readonly dustlocalstate_applyCommitmentCollapsedUpdate: (a: number, b: number) => [number, number, number];
  readonly dustlocalstate_applyGenerationCollapsedUpdate: (a: number, b: number) => [number, number, number];
  readonly dustlocalstate_collapseCommitmentTree: (a: number, b: any, c: any) => [number, number, number];
  readonly dustlocalstate_collapseGenerationTree: (a: number, b: any, c: any) => [number, number, number];
  readonly dustlocalstate_commitmentTreeFirstFree: (a: number) => bigint;
  readonly dustlocalstate_commitmentTreeRoot: (a: number) => [number, number, number];
  readonly dustlocalstate_deserialize: (a: any) => [number, number, number];
  readonly dustlocalstate_findUtxoByNullifier: (a: number, b: any) => [number, number, number];
  readonly dustlocalstate_generatingTreeFirstFree: (a: number) => bigint;
  readonly dustlocalstate_generatingTreeRoot: (a: number) => [number, number, number];
  readonly dustlocalstate_generationInfo: (a: number, b: any) => [number, number, number];
  readonly dustlocalstate_insertCommitment: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly dustlocalstate_insertGenerationInfo: (a: number, b: any, c: any, d: number, e: number) => [number, number, number];
  readonly dustlocalstate_new: (a: number) => number;
  readonly dustlocalstate_nullifiers: (a: number) => [number, number, number];
  readonly dustlocalstate_params: (a: number) => [number, number, number];
  readonly dustlocalstate_processTtls: (a: number, b: any) => [number, number, number];
  readonly dustlocalstate_removeCommitment: (a: number, b: any) => [number, number, number];
  readonly dustlocalstate_removeGenerationInfo: (a: number, b: any, c: any) => [number, number, number];
  readonly dustlocalstate_removeUtxo: (a: number, b: any) => [number, number, number];
  readonly dustlocalstate_replayEvents: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly dustlocalstate_replayEventsWithChanges: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly dustlocalstate_replayRawEvents: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly dustlocalstate_serialize: (a: number) => [number, number, number];
  readonly dustlocalstate_set_syncTime: (a: number, b: any) => [number, number];
  readonly dustlocalstate_spend: (a: number, b: number, c: any, d: any, e: any) => [number, number, number];
  readonly dustlocalstate_syncTime: (a: number) => any;
  readonly dustlocalstate_toString: (a: number, b: number) => [number, number];
  readonly dustlocalstate_updateGenerationTreeFromEvidence: (a: number, b: number) => [number, number, number];
  readonly dustlocalstate_utxos: (a: number) => [number, number, number, number];
  readonly dustlocalstate_walletBalance: (a: number, b: any) => any;
  readonly dustlocalstatewithchanges_changes: (a: number) => [number, number];
  readonly dustlocalstatewithchanges_state: (a: number) => number;
  readonly dustparameters_deserialize: (a: any) => [number, number, number];
  readonly dustparameters_dustGracePeriodSeconds: (a: number) => any;
  readonly dustparameters_generationDecayRate: (a: number) => any;
  readonly dustparameters_new: (a: any, b: any, c: any) => [number, number, number];
  readonly dustparameters_nightDustRatio: (a: number) => any;
  readonly dustparameters_serialize: (a: number) => [number, number, number];
  readonly dustparameters_set_dustGracePeriodSeconds: (a: number, b: any) => [number, number];
  readonly dustparameters_set_generationDecayRate: (a: number, b: any) => [number, number];
  readonly dustparameters_set_nightDustRatio: (a: number, b: any) => [number, number];
  readonly dustparameters_timeToCapSeconds: (a: number) => any;
  readonly dustparameters_toString: (a: number, b: number) => [number, number];
  readonly dustregistration_allowFeePayment: (a: number) => any;
  readonly dustregistration_deserialize: (a: number, b: number, c: any) => [number, number, number];
  readonly dustregistration_dustAddress: (a: number) => any;
  readonly dustregistration_new: (a: number, b: number, c: any, d: number, e: any, f: any) => [number, number, number];
  readonly dustregistration_nightKey: (a: number) => [number, number, number];
  readonly dustregistration_serialize: (a: number) => [number, number, number];
  readonly dustregistration_set_allowFeePayment: (a: number, b: any) => [number, number];
  readonly dustregistration_set_dustAddress: (a: number, b: number) => [number, number];
  readonly dustregistration_set_nightKey: (a: number, b: any) => [number, number];
  readonly dustregistration_set_signature: (a: number, b: any) => [number, number];
  readonly dustregistration_signature: (a: number) => [number, number, number];
  readonly dustregistration_toString: (a: number, b: number) => [number, number];
  readonly dustsecretkey_clear: (a: number) => void;
  readonly dustsecretkey_fromBigint: (a: any) => [number, number, number];
  readonly dustsecretkey_fromSeed: (a: any) => [number, number, number];
  readonly dustsecretkey_new: () => [number, number, number];
  readonly dustsecretkey_publicKey: (a: number) => [number, number, number];
  readonly dustspend_new: () => [number, number, number];
  readonly dustspend_newCommitment: (a: number) => any;
  readonly dustspend_oldNullifier: (a: number) => any;
  readonly dustspend_proof: (a: number) => [number, number, number];
  readonly dustspend_toString: (a: number, b: number) => [number, number];
  readonly dustspend_vFee: (a: number) => any;
  readonly duststate_deserialize: (a: any) => [number, number, number];
  readonly duststate_generation: (a: number) => [number, number, number];
  readonly duststate_new: () => [number, number, number];
  readonly duststate_serialize: (a: number) => [number, number, number];
  readonly duststate_toString: (a: number, b: number) => [number, number];
  readonly duststate_utxo: (a: number) => [number, number, number];
  readonly duststatemerkletreecollapsedupdate_deserialize: (a: any) => [number, number, number];
  readonly duststatemerkletreecollapsedupdate_new: () => [number, number, number];
  readonly duststatemerkletreecollapsedupdate_newFromCommitmentTree: (a: number, b: bigint, c: bigint) => [number, number, number];
  readonly duststatemerkletreecollapsedupdate_newFromGenerationTree: (a: number, b: bigint, c: bigint) => [number, number, number];
  readonly duststatemerkletreecollapsedupdate_serialize: (a: number) => [number, number, number];
  readonly duststatemerkletreecollapsedupdate_toString: (a: number, b: number) => [number, number];
  readonly dustutxostate_deserialize: (a: any) => [number, number, number];
  readonly dustutxostate_new: () => [number, number, number];
  readonly dustutxostate_serialize: (a: number) => [number, number, number];
  readonly dustutxostate_toString: (a: number, b: number) => [number, number];
  readonly nobinding_deserialize: (a: any) => [number, number, number];
  readonly nobinding_instance: (a: number) => [number, number];
  readonly nobinding_new: (a: number, b: number) => [number, number, number];
  readonly nobinding_serialize: (a: number) => [number, number, number];
  readonly nobinding_toString: (a: number, b: number) => [number, number];
  readonly noproof_instance: (a: number) => [number, number];
  readonly noproof_new: () => [number, number, number];
  readonly noproof_toString: (a: number, b: number) => [number, number];
  readonly prebinding_deserialize: (a: any) => [number, number, number];
  readonly prebinding_instance: (a: number) => [number, number];
  readonly prebinding_new: (a: number, b: number) => [number, number, number];
  readonly prebinding_serialize: (a: number) => [number, number, number];
  readonly prebinding_toString: (a: number, b: number) => [number, number];
  readonly preproof_deserialize: (a: any) => [number, number, number];
  readonly preproof_instance: (a: number) => [number, number];
  readonly preproof_new: (a: number, b: number) => [number, number, number];
  readonly preproof_serialize: (a: number) => [number, number, number];
  readonly preproof_toString: (a: number, b: number) => [number, number];
  readonly proof_deserialize: (a: any) => [number, number, number];
  readonly proof_instance: (a: number) => [number, number];
  readonly proof_new: (a: number, b: number) => [number, number, number];
  readonly proof_serialize: (a: number) => [number, number, number];
  readonly proof_toString: (a: number, b: number) => [number, number];
  readonly sampleDustSecretKey: () => number;
  readonly signatureenabled_deserialize: (a: any) => [number, number, number];
  readonly signatureenabled_instance: (a: number) => [number, number];
  readonly signatureenabled_new: (a: any) => [number, number, number];
  readonly signatureenabled_serialize: (a: number) => [number, number, number];
  readonly signatureenabled_toString: (a: number, b: number) => [number, number];
  readonly signatureenabled_value: (a: number) => [number, number, number];
  readonly signatureerased_instance: (a: number) => [number, number];
  readonly signatureerased_toString: (a: number, b: number) => [number, number];
  readonly successorDustUtxo: (a: any, b: any, c: any, d: any, e: any, f: number, g: number) => [number, number, number];
  readonly updatedValue: (a: any, b: any, c: any, d: any, e: any) => [number, number, number];
  readonly utxometa_ctime: (a: number) => any;
  readonly utxometa_new: (a: any) => number;
  readonly utxometa_set_ctime: (a: number, b: any) => [number, number];
  readonly signatureerased_new: () => [number, number, number];
  readonly createMemoAnchorOutput: (a: number, b: number, c: number, d: any, e: any) => [number, number, number];
  readonly createMemoCompanionProvingPayload: (a: any, b: any, c: any) => [number, number, number];
  readonly memoAnchorDecode: (a: any) => [number, number, number];
  readonly memoAnchorEncode: (a: any, b: any) => [number, number, number];
  readonly memoAnchorScan: (a: any) => [number, number, number];
  readonly memoAnchorTokenTypeOf: (a: any) => [number, number, number, number];
  readonly memoHashV1: (a: any) => [number, number, number];
  readonly memoWrapperBuild: (a: any, b: any, c: number, d: any, e: any, f: number) => [number, number, number];
  readonly memoWrapperDefaultHrp: () => [number, number];
  readonly memoWrapperFromBech32m: (a: number, b: number, c: number, d: number) => [number, number, number];
  readonly memoWrapperParse: (a: any) => [number, number, number];
  readonly memoWrapperToBech32m: (a: any, b: number, c: number) => [number, number, number, number];
  readonly memoWrapperVerify: (a: any, b: any, c: number) => [number, number, number];
  readonly __wbg_event_free: (a: number, b: number) => void;
  readonly __wbg_ledgerstate_free: (a: number, b: number) => void;
  readonly __wbg_utxostate_free: (a: number, b: number) => void;
  readonly event_content: (a: number) => [number, number, number];
  readonly event_deserialize: (a: any) => [number, number, number];
  readonly event_new: () => [number, number, number];
  readonly event_serialize: (a: number) => [number, number, number];
  readonly event_source: (a: number) => [number, number, number];
  readonly event_toString: (a: number, b: number) => [number, number];
  readonly ledgerstate_apply: (a: number, b: number, c: number) => any;
  readonly ledgerstate_applySystemTx: (a: number, b: number, c: any) => [number, number, number];
  readonly ledgerstate_blank: (a: number, b: number) => number;
  readonly ledgerstate_block_reward_pool: (a: number) => any;
  readonly ledgerstate_bridgeReceiving: (a: number, b: number, c: number) => [number, number, number];
  readonly ledgerstate_deserialize: (a: any) => [number, number, number];
  readonly ledgerstate_dust: (a: number) => number;
  readonly ledgerstate_index: (a: number, b: number, c: number) => [number, number, number];
  readonly ledgerstate_locked_pool: (a: number) => any;
  readonly ledgerstate_new: (a: number, b: number, c: number) => number;
  readonly ledgerstate_parameters: (a: number) => number;
  readonly ledgerstate_postBlockUpdate: (a: number, b: any, c: any, d: any) => [number, number, number];
  readonly ledgerstate_reserve_pool: (a: number) => any;
  readonly ledgerstate_serialize: (a: number) => [number, number, number];
  readonly ledgerstate_set_parameters: (a: number, b: number) => void;
  readonly ledgerstate_testingDistributeNight: (a: number, b: number, c: number, d: any, e: any) => [number, number, number];
  readonly ledgerstate_testingFromGenesis: (a: number, b: number, c: any, d: any, e: any) => [number, number, number];
  readonly ledgerstate_testingUnlockToReserve: (a: number, b: any, c: any) => [number, number, number];
  readonly ledgerstate_testingUnlockToTreasury: (a: number, b: any, c: any) => [number, number, number];
  readonly ledgerstate_toString: (a: number, b: number) => [number, number];
  readonly ledgerstate_treasuryBalance: (a: number, b: any) => [number, number, number];
  readonly ledgerstate_unclaimedBlockRewards: (a: number, b: number, c: number) => [number, number, number];
  readonly ledgerstate_updateIndex: (a: number, b: number, c: number, d: number, e: any) => [number, number, number];
  readonly ledgerstate_utxo: (a: number) => number;
  readonly ledgerstate_zswap: (a: number) => number;
  readonly utxostate_delta: (a: number, b: number, c: number) => [number, number, number];
  readonly utxostate_filter: (a: number, b: number, c: number) => [number, number, number];
  readonly utxostate_lookupMeta: (a: number, b: any) => [number, number, number];
  readonly utxostate_new: (a: any) => [number, number, number];
  readonly utxostate_utxos: (a: number) => [number, number, number];
  readonly __wbg_chargedstate_free: (a: number, b: number) => void;
  readonly __wbg_contractmaintenanceauthority_free: (a: number, b: number) => void;
  readonly __wbg_contractoperation_free: (a: number, b: number) => void;
  readonly __wbg_contractstate_free: (a: number, b: number) => void;
  readonly __wbg_stateboundedmerkletree_free: (a: number, b: number) => void;
  readonly __wbg_statemap_free: (a: number, b: number) => void;
  readonly __wbg_statevalue_free: (a: number, b: number) => void;
  readonly chargedstate_new: (a: number) => number;
  readonly chargedstate_state: (a: number) => number;
  readonly chargedstate_toString: (a: number, b: number) => [number, number];
  readonly contractmaintenanceauthority_committee: (a: number) => [number, number, number];
  readonly contractmaintenanceauthority_counter: (a: number) => any;
  readonly contractmaintenanceauthority_deserialize: (a: any) => [number, number, number];
  readonly contractmaintenanceauthority_new: (a: any, b: number, c: number) => [number, number, number];
  readonly contractmaintenanceauthority_serialize: (a: number) => [number, number, number];
  readonly contractmaintenanceauthority_threshold: (a: number) => number;
  readonly contractmaintenanceauthority_toString: (a: number, b: number) => [number, number];
  readonly contractoperation_deserialize: (a: any) => [number, number, number];
  readonly contractoperation_new: () => [number, number, number];
  readonly contractoperation_serialize: (a: number) => [number, number, number];
  readonly contractoperation_set_verifier_key: (a: number, b: any) => [number, number];
  readonly contractoperation_toString: (a: number, b: number) => [number, number];
  readonly contractoperation_verifier_key: (a: number) => [number, number, number];
  readonly contractstate_balance: (a: number) => [number, number, number];
  readonly contractstate_data: (a: number) => number;
  readonly contractstate_deserialize: (a: any) => [number, number, number];
  readonly contractstate_maintenance_authority: (a: number) => number;
  readonly contractstate_new: () => number;
  readonly contractstate_operation: (a: number, b: any) => [number, number, number];
  readonly contractstate_operations: (a: number) => [number, number];
  readonly contractstate_query: (a: number, b: any, c: number) => [number, number, number];
  readonly contractstate_serialize: (a: number) => [number, number, number];
  readonly contractstate_setOperation: (a: number, b: any, c: number) => [number, number];
  readonly contractstate_set_balance: (a: number, b: any) => [number, number];
  readonly contractstate_set_data: (a: number, b: number) => void;
  readonly contractstate_set_maintenance_authority: (a: number, b: number) => void;
  readonly contractstate_toString: (a: number, b: number) => [number, number];
  readonly stateboundedmerkletree_blank: (a: number) => number;
  readonly stateboundedmerkletree_collapse: (a: number, b: bigint, c: bigint) => number;
  readonly stateboundedmerkletree_findPathForLeaf: (a: number, b: any, c: number, d: bigint, e: number, f: bigint, g: number) => [number, number, number];
  readonly stateboundedmerkletree_height: (a: number) => number;
  readonly stateboundedmerkletree_pathForLeaf: (a: number, b: bigint, c: any) => [number, number, number];
  readonly stateboundedmerkletree_rehash: (a: number) => number;
  readonly stateboundedmerkletree_root: (a: number) => [number, number, number];
  readonly stateboundedmerkletree_toString: (a: number, b: number) => [number, number];
  readonly stateboundedmerkletree_update: (a: number, b: bigint, c: any) => [number, number, number];
  readonly statemap_get: (a: number, b: any) => [number, number, number];
  readonly statemap_insert: (a: number, b: any, c: number) => [number, number, number];
  readonly statemap_keys: (a: number) => [number, number, number, number];
  readonly statemap_new: () => number;
  readonly statemap_remove: (a: number, b: any) => [number, number, number];
  readonly statemap_toString: (a: number, b: number) => [number, number];
  readonly statevalue_arrayPush: (a: number, b: number) => [number, number, number];
  readonly statevalue_asArray: (a: number) => [number, number, number, number];
  readonly statevalue_asBoundedMerkleTree: (a: number) => [number, number, number];
  readonly statevalue_asCell: (a: number) => [number, number, number];
  readonly statevalue_asMap: (a: number) => [number, number, number];
  readonly statevalue_decode: (a: any) => [number, number, number];
  readonly statevalue_encode: (a: number) => [number, number, number];
  readonly statevalue_logSize: (a: number) => number;
  readonly statevalue_new: () => [number, number, number];
  readonly statevalue_newArray: () => number;
  readonly statevalue_newBoundedMerkleTree: (a: number) => number;
  readonly statevalue_newCell: (a: any) => [number, number, number];
  readonly statevalue_newMap: (a: number) => number;
  readonly statevalue_newNull: () => number;
  readonly statevalue_toString: (a: number, b: number) => [number, number];
  readonly statevalue_type: (a: number) => [number, number];
  readonly __wbg_vmresults_free: (a: number, b: number) => void;
  readonly __wbg_vmstack_free: (a: number, b: number) => void;
  readonly bigIntModFr: (a: any) => [number, number, number];
  readonly bigIntToValue: (a: any) => [number, number, number];
  readonly communicationCommitment: (a: any, b: any, c: number, d: number) => [number, number, number, number];
  readonly communicationCommitmentRandomness: () => [number, number, number, number];
  readonly decodeCoinPublicKey: (a: any) => [number, number, number, number];
  readonly decodeContractAddress: (a: any) => [number, number, number, number];
  readonly decodeQualifiedShieldedCoinInfo: (a: any) => [number, number, number];
  readonly decodeRawTokenType: (a: any) => [number, number, number, number];
  readonly decodeShieldedCoinInfo: (a: any) => [number, number, number];
  readonly decodeUserAddress: (a: any) => [number, number, number, number];
  readonly degradeToTransient: (a: any) => [number, number, number];
  readonly dummyContractAddress: () => [number, number, number, number];
  readonly dummyUserAddress: () => [number, number, number, number];
  readonly ecAdd: (a: any, b: any) => [number, number, number];
  readonly ecMul: (a: any, b: any) => [number, number, number];
  readonly ecMulGenerator: (a: any) => [number, number, number];
  readonly encodeCoinPublicKey: (a: number, b: number) => [number, number, number];
  readonly encodeContractAddress: (a: number, b: number) => [number, number, number];
  readonly encodeQualifiedShieldedCoinInfo: (a: any) => [number, number, number];
  readonly encodeRawTokenType: (a: number, b: number) => [number, number, number];
  readonly encodeShieldedCoinInfo: (a: any) => [number, number, number];
  readonly encodeUserAddress: (a: number, b: number) => [number, number, number];
  readonly entryPointHash: (a: any) => [number, number, number, number];
  readonly hashToCurve: (a: any, b: any) => [number, number, number];
  readonly jubjubSampleScalar: () => [number, number, number];
  readonly jubjubScalarFromNative: (a: any) => [number, number, number];
  readonly leafHash: (a: any) => [number, number, number];
  readonly maxAlignedSize: (a: any) => [bigint, number, number];
  readonly maxField: () => [number, number, number];
  readonly maxJubjubScalar: () => [number, number, number];
  readonly nativeFromJubjubScalar: (a: any) => [number, number, number];
  readonly persistentCommit: (a: any, b: any, c: any) => [number, number, number];
  readonly persistentHash: (a: any, b: any) => [number, number, number];
  readonly proofDataIntoSerializedPreimage: (a: any, b: any, c: any, d: any, e: number, f: number) => [number, number, number];
  readonly rawTokenType: (a: any, b: number, c: number) => [number, number, number, number];
  readonly runProgram: (a: number, b: any, c: number, d: any) => [number, number, number];
  readonly runtimeCoinCommitment: (a: any, b: any) => [number, number, number];
  readonly runtimeCoinNullifier: (a: any, b: any) => [number, number, number];
  readonly sampleContractAddress: () => [number, number, number, number];
  readonly sampleRawTokenType: () => [number, number, number, number];
  readonly sampleSigningKey: (a: number, b: number) => [number, number, number];
  readonly sampleUserAddress: () => [number, number, number, number];
  readonly signData: (a: any, b: any) => [number, number, number];
  readonly signatureVerifyingKey: (a: any) => [number, number, number];
  readonly signingKeyFromBip340: (a: any) => [number, number, number];
  readonly transientCommit: (a: any, b: any, c: any) => [number, number, number];
  readonly transientHash: (a: any, b: any) => [number, number, number];
  readonly upgradeFromTransient: (a: any) => [number, number, number];
  readonly valueToBigInt: (a: any) => [number, number, number];
  readonly verifySignature: (a: any, b: any, c: any) => [number, number, number];
  readonly vmresults_events: (a: number) => [number, number, number];
  readonly vmresults_gas_cost: (a: number) => [number, number, number];
  readonly vmresults_new: () => [number, number, number];
  readonly vmresults_stack: (a: number) => number;
  readonly vmresults_toString: (a: number, b: number) => [number, number];
  readonly vmstack_get: (a: number, b: number) => number;
  readonly vmstack_isStrong: (a: number, b: number) => number;
  readonly vmstack_length: (a: number) => number;
  readonly vmstack_new: () => number;
  readonly vmstack_push: (a: number, b: number, c: number) => void;
  readonly vmstack_removeLast: (a: number) => void;
  readonly vmstack_toString: (a: number, b: number) => [number, number];
  readonly __wbg_costmodel_free: (a: number, b: number) => void;
  readonly __wbg_querycontext_free: (a: number, b: number) => void;
  readonly __wbg_queryresults_free: (a: number, b: number) => void;
  readonly costmodel_initialCostModel: () => number;
  readonly costmodel_new: () => [number, number, number];
  readonly costmodel_toString: (a: number, b: number) => [number, number];
  readonly querycontext_address: (a: number) => [number, number, number, number];
  readonly querycontext_block: (a: number) => [number, number, number];
  readonly querycontext_com_indices: (a: number) => [number, number, number];
  readonly querycontext_effects: (a: number) => [number, number, number];
  readonly querycontext_insertCommitment: (a: number, b: number, c: number, d: bigint) => [number, number, number];
  readonly querycontext_new: (a: number, b: number, c: number) => [number, number, number];
  readonly querycontext_qualify: (a: number, b: any) => [number, number, number];
  readonly querycontext_query: (a: number, b: any, c: number, d: any) => [number, number, number];
  readonly querycontext_runTranscript: (a: number, b: any, c: number) => [number, number, number];
  readonly querycontext_set_block: (a: number, b: any) => [number, number];
  readonly querycontext_set_effects: (a: number, b: any) => [number, number];
  readonly querycontext_state: (a: number) => number;
  readonly querycontext_toString: (a: number, b: number) => [number, number];
  readonly querycontext_toVmStack: (a: number) => number;
  readonly queryresults_context: (a: number) => number;
  readonly queryresults_events: (a: number) => [number, number, number];
  readonly queryresults_gas_cost: (a: number) => [number, number, number];
  readonly queryresults_new: () => [number, number, number];
  readonly queryresults_toString: (a: number, b: number) => [number, number];
  readonly __wbg_intounderlyingsource_free: (a: number, b: number) => void;
  readonly intounderlyingsource_cancel: (a: number) => void;
  readonly intounderlyingsource_pull: (a: number, b: any) => any;
  readonly __wbg_intounderlyingsink_free: (a: number, b: number) => void;
  readonly intounderlyingsink_abort: (a: number, b: any) => any;
  readonly intounderlyingsink_close: (a: number) => any;
  readonly intounderlyingsink_write: (a: number, b: any) => any;
  readonly __wbg_intounderlyingbytesource_free: (a: number, b: number) => void;
  readonly intounderlyingbytesource_autoAllocateChunkSize: (a: number) => number;
  readonly intounderlyingbytesource_cancel: (a: number) => void;
  readonly intounderlyingbytesource_pull: (a: number, b: any) => any;
  readonly intounderlyingbytesource_start: (a: number, b: any) => void;
  readonly intounderlyingbytesource_type: (a: number) => number;
  readonly __wbindgen_exn_store: (a: number) => void;
  readonly __externref_table_alloc: () => number;
  readonly __wbindgen_export_2: WebAssembly.Table;
  readonly __wbindgen_malloc: (a: number, b: number) => number;
  readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
  readonly __externref_drop_slice: (a: number, b: number) => void;
  readonly __wbindgen_free: (a: number, b: number, c: number) => void;
  readonly __wbindgen_export_7: WebAssembly.Table;
  readonly __externref_table_dealloc: (a: number) => void;
  readonly closure4166_externref_shim: (a: number, b: number, c: any) => void;
  readonly closure4230_externref_shim: (a: number, b: number, c: any, d: any) => void;
  readonly closure4228_externref_shim: (a: number, b: number, c: any, d: any, e: any) => void;
  readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;
/**
* Instantiates the given `module`, which can either be bytes or
* a precompiled `WebAssembly.Module`.
*
* @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
*
* @returns {InitOutput}
*/
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
*
* @returns {Promise<InitOutput>}
*/
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
