// 00005 PHASE 2 task 2.5 — the TRANSACTION-shaped reference fixtures.
//
// Owner decision Q-W8 = A: "the offer file" is a full MIP-0005 Transaction, not
// a bare `zswap::Offer`. 00003's frozen fixture bins are Offer-shaped, so this
// project has to produce the Transaction-shaped pair itself.
//
// WHY THIS IS RUST (plan finding F-2.3). Two JS doors are shut:
//
//   * a PROVEN offer cannot be put into a Transaction from `ledger-wasm`
//     (`fromParts` refuses proven offers; `mockProve` returns a BOUND
//     transaction and every offer setter refuses a bound one; re-reading
//     mock-proven bytes as `pre-binding` fails on the header tag, because
//     binding is part of the serialization, not a view);
//   * building a NEW wrapper from JS is blocked by Q-W7 — `memoWrapperBuild`
//     needs a statement tail that nothing exports.
//
// So the memo construction is done by the 00003 toolkit — the implementation
// 00003 froze, certified and independently reviewed — and this binary only adds
// the Transaction envelope, exactly as `ledger::construct` would have:
//
//     StandardTransaction { network_id, intents: {},
//                           guaranteed_coins / fallible_coins = the PROVEN offer,
//                           binding_randomness = the UNPROVEN offer's randomness }
//
// `binding_randomness` is taken from the unproven offer before proving, which is
// precisely what `Transaction::new(..).prove(..)` produces: `Transaction::new`
// calls `recompute_binding_randomness()` on the preimage-typed transaction, and
// proving carries that scalar through unchanged.
//
// Nothing here is a memo-format decision. Every memo byte, anchor byte, wrapper
// byte and proof comes from the toolkit.
//
// READ-ONLY over 00003: path dependencies only, `CARGO_TARGET_DIR` outside both
// trees, nothing written anywhere near them.

use std::collections::BTreeMap;
use std::path::PathBuf;

use anyhow::{Context, anyhow};
use base_crypto::rng::SplittableRng;
use ledger::structure::{ProofMarker, Signature, StandardTransaction, Transaction};
use rand::SeedableRng;
use rand::rngs::StdRng;
use serialize::tagged_serialize;
use sha2::{Digest, Sha256};
use storage::db::InMemoryDB;
use transient_crypto::commitment::PedersenRandomness;
use transient_crypto::proofs::{Proof, ProvingProvider};
use zkir_v2::LocalProvingProvider;
use zswap::Offer;
use zswap::prove::ZswapResolver;

use zswap_memo_companion::companion::{DetachedCompanionProof, prove_companion};
use zswap_memo_companion::construct::{FinalOffer, MemoBindingPlan, plan_memo_binding};
use zswap_memo_companion::fixture::user_owned_spend;
use zswap_memo_companion::keys::shipped_resolver;
use zswap_memo_companion::wrapper::{MemoWrapperV1, UntrustedLocator};

/// The demo network id. Deliberately not a real network: these artifacts are
/// format-valid and proof-valid, and anchored to an in-browser demo state that
/// no chain has ever seen (spec FR-010).
const NETWORK_ID: &str = "webmemo-demo";

/// One master seed, so the whole corpus is reproducible from this file alone.
/// Distinct from 00003's `0x0000_03C0_0006` so nothing here can be mistaken for
/// a re-emission of 00003's own frozen fixture.
const SEED: u64 = 0x0000_05C0_0002;

const COIN_VALUE: u128 = 4_242;

/// Memo bytes designed to be hostile to a renderer that is not inert: raw HTML,
/// an event-handler attribute, an ANSI SGR sequence, a bidi override, a
/// zero-width space, an already-escaped entity, a NUL, a BEL and a newline.
/// Every one of these is a legal memo — 00003 FR-018 says the reader renders
/// them, never interprets them.
fn hostile_memo() -> Vec<u8> {
    let mut v = Vec::new();
    v.extend_from_slice(b"<script>alert('xss')</script>");
    v.extend_from_slice(b"<img src=x onerror=alert(1)>");
    v.extend_from_slice(b"\x1b[31mANSI-RED\x1b[0m");
    v.extend_from_slice("\u{202E}txet desrever\u{202C}".as_bytes());
    v.extend_from_slice("zero\u{200B}width".as_bytes());
    v.extend_from_slice(b"&lt;already-escaped&gt;");
    v.extend_from_slice(b"\x00NUL\x07BEL\nnewline\ttab");
    v
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// A provenance pin, stamped by the generation script rather than guessed here.
fn pin(name: &str) -> String {
    std::env::var(name).unwrap_or_else(|_| "(not stamped)".to_string())
}

/// Where in a transaction the offer sits.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Slot {
    Guaranteed,
    Fallible,
}

impl Slot {
    fn as_str(&self) -> &'static str {
        match self {
            Slot::Guaranteed => "guaranteed",
            Slot::Fallible => "fallible",
        }
    }
}

/// Wrap an already-proven offer in the Transaction envelope MIP-0005 calls an
/// offer file. `binding_randomness` is the unproven offer's, which is what a
/// wallet's `Transaction::new(..).prove(..)` would have carried through.
fn envelope(
    slot: Slot,
    segment: u16,
    proven: Offer<Proof, InMemoryDB>,
    binding_randomness: PedersenRandomness,
) -> Transaction<Signature, ProofMarker, PedersenRandomness, InMemoryDB> {
    let mut fallible_coins = storage::storage::HashMap::new();
    let mut guaranteed_coins = None;
    match slot {
        Slot::Guaranteed => guaranteed_coins = Some(storage::arena::Sp::new(proven)),
        Slot::Fallible => fallible_coins = fallible_coins.insert(segment, proven),
    }
    Transaction::Standard(StandardTransaction {
        network_id: NETWORK_ID.to_string(),
        intents: storage::storage::HashMap::new(),
        guaranteed_coins,
        fallible_coins,
        binding_randomness,
    })
}

struct EmittedWrapper {
    suffix: String,
    bytes: Vec<u8>,
    memo: Vec<u8>,
    nullifier: String,
    h: String,
    has_locator: bool,
}

struct Emitted {
    name: String,
    what: String,
    slot: Slot,
    segment: u16,
    tx_bytes: Vec<u8>,
    /// The tagged `zswap::Offer` inside the envelope — the bytes the page must
    /// extract before `memoWrapperVerify`, kept so tests can assert equality.
    offer_bytes: Vec<u8>,
    wrappers: Vec<EmittedWrapper>,
    inputs: usize,
    outputs: usize,
    anchors: usize,
}

/// Build one fixture: `memos.len()` user-owned spends at `segment`, one anchor
/// output per memo, all in ONE offer, proven once, with one companion (and one
/// wrapper) per memo.
///
/// `memos` empty means "no memo at all": an anchor-less offer, which is the
/// no-evidence case.
async fn build(
    rng: &mut StdRng,
    resolver: &ZswapResolver,
    name: &str,
    what: &str,
    slot: Slot,
    segment: u16,
    memos: &[&[u8]],
    locator: Option<&[u8]>,
) -> anyhow::Result<Emitted> {
    let mut spends = Vec::new();
    let mut plans: Vec<MemoBindingPlan<InMemoryDB>> = Vec::new();

    let n = memos.len().max(1);
    for _ in 0..n {
        spends.push(user_owned_spend(rng, COIN_VALUE, segment)?);
    }
    for (i, memo) in memos.iter().enumerate() {
        plans.push(
            plan_memo_binding(rng, &spends[i].input, segment, memo)
                .map_err(|e| anyhow!("planning the memo binding for {name}: {e}"))?,
        );
    }

    // An anchor-less fixture still needs an output, or the offer is a bare
    // spend. A plain zero-value output is not available without reaching into
    // the anchor builder, so the no-memo case ships as inputs only — which is a
    // perfectly ordinary offer shape and is exactly the "no evidence" input the
    // Read section must classify.
    let unproved = Offer::new(
        spends.iter().map(|s| s.input.clone()).collect(),
        plans.iter().map(|p| p.anchor.output.clone()).collect(),
        Vec::new(),
    )
    .ok_or_else(|| anyhow!("the offer should not be empty"))?;

    let binding_randomness = unproved.binding_randomness();
    let sealed = FinalOffer::<InMemoryDB>::seal(unproved, segment)
        .map_err(|e| anyhow!("sealing {name}: {e}"))?;

    let mut provider = LocalProvingProvider {
        rng: rng.split(),
        params: resolver,
        resolver,
    };

    let (_, proven) = sealed
        .offer()
        .prove(provider.split(), segment)
        .await
        .map_err(|e| anyhow!("proving {name}: {e}"))?;

    let mut companions: Vec<DetachedCompanionProof> = Vec::new();
    for plan in &plans {
        let carrier = sealed
            .carrier(plan.nullifier)
            .map_err(|e| anyhow!("resolving the carrier for {name}: {e}"))?;
        companions.push(
            prove_companion(&mut provider, carrier, segment, plan.binding)
                .await
                .map_err(|e| anyhow!("proving the companion for {name}: {e}"))?,
        );
    }

    let mut wrappers = Vec::new();
    for (i, plan) in plans.iter().enumerate() {
        let input = proven
            .inputs
            .iter_deref()
            .find(|inp| inp.nullifier == plan.nullifier)
            .ok_or_else(|| anyhow!("the proven offer lost its input"))?
            .clone();
        let loc = match locator {
            Some(l) => Some(UntrustedLocator::from_slice(l)?),
            None => None,
        };
        let wrapper = MemoWrapperV1::build(plan.memo.clone(), &companions[i], &input, loc)
            .map_err(|e| anyhow!("building the wrapper for {name}: {e}"))?;
        wrappers.push(EmittedWrapper {
            suffix: if plans.len() == 1 {
                String::new()
            } else {
                format!("-{}", i + 1)
            },
            bytes: wrapper.encode(),
            memo: memos[i].to_vec(),
            nullifier: hex::encode(plan.nullifier.0.0),
            h: hex::encode(plan.binding.get().as_le_bytes()),
            has_locator: locator.is_some(),
        });
    }

    let mut offer_bytes = Vec::new();
    tagged_serialize(&proven, &mut offer_bytes)?;

    let inputs = proven.inputs.len() as usize;
    let outputs = proven.outputs.len() as usize;
    let tx = envelope(slot, segment, proven, binding_randomness);
    let mut tx_bytes = Vec::new();
    tagged_serialize(&tx, &mut tx_bytes)?;

    Ok(Emitted {
        name: name.to_string(),
        what: what.to_string(),
        slot,
        segment,
        tx_bytes,
        offer_bytes,
        wrappers,
        inputs,
        outputs,
        anchors: plans.len(),
    })
}

#[tokio::main(flavor = "current_thread")]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(tracing::Level::WARN)
        .init();

    let dir = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .ok_or_else(|| anyhow!("usage: webmemo-txfixture <output-dir>"))?;
    std::fs::create_dir_all(&dir)?;

    println!("=== 00005 PHASE 2 task 2.5 — Transaction-shaped reference fixtures ===");
    println!("network id : {NETWORK_ID}");
    println!("master seed: 0x{SEED:016x}");

    let resolver = shipped_resolver().context("resolving the shipped Zswap key material")?;
    let mut rng = StdRng::seed_from_u64(SEED);

    let hostile = hostile_memo();
    let shared: &[u8] = b"one memo, two inputs";

    let mut emitted = Vec::new();

    emitted.push(
        build(
            &mut rng,
            &resolver,
            "reference",
            "the known-good pair: one input, one memo, one anchor, fallible segment 3",
            Slot::Fallible,
            3,
            &[b"hello world"],
            Some(b"tx:this-is-never-evidence"),
        )
        .await?,
    );

    emitted.push(
        build(
            &mut rng,
            &resolver,
            "unrelated",
            "an independent offer + wrapper, for the wrong-pairing and readable-but-wrong-proof cases",
            Slot::Fallible,
            3,
            &[b"a completely different memo"],
            None,
        )
        .await?,
    );

    emitted.push(
        build(
            &mut rng,
            &resolver,
            "hostile-memo",
            "an AUTHENTICATED memo made of hostile bytes (HTML, script, ANSI, RTL, zero-width, NUL)",
            Slot::Fallible,
            3,
            &[hostile.as_slice()],
            None,
        )
        .await?,
    );

    emitted.push(
        build(
            &mut rng,
            &resolver,
            "two-inputs-same-memo",
            "two user-owned inputs carrying the IDENTICAL memo — attribution must stay per-input",
            Slot::Fallible,
            3,
            &[shared, shared],
            None,
        )
        .await?,
    );

    emitted.push(
        build(
            &mut rng,
            &resolver,
            "no-anchor",
            "an ordinary offer with no anchor and no wrapper — the no-evidence case",
            Slot::Fallible,
            3,
            &[],
            None,
        )
        .await?,
    );

    match build(
        &mut rng,
        &resolver,
        "guaranteed-segment",
        "the same construction in the GUARANTEED slot (segment 0), to exercise tx.guaranteedOffer",
        Slot::Guaranteed,
        0,
        &[b"memo on the guaranteed segment"],
        None,
    )
    .await
    {
        Ok(e) => emitted.push(e),
        Err(e) => println!("\n!! guaranteed-segment fixture SKIPPED: {e}\n"),
    }

    // ---- write everything out --------------------------------------------
    let mut meta = String::new();
    let mut sums: BTreeMap<String, String> = BTreeMap::new();

    meta.push_str("# 00005 web-memo — Transaction-shaped reference fixtures\n");
    meta.push_str(&format!("network_id={NETWORK_ID}\n"));
    meta.push_str(&format!("master_seed=0x{SEED:016x}\n"));
    meta.push_str(&format!("ledger_baseline_pin={}\n", pin("LEDGER_PIN")));
    meta.push_str(&format!("toolkit_pin={}\n", pin("TOOLKIT_PIN")));
    meta.push_str(&format!("generator_sha256={}\n", pin("GENERATOR_SHA256")));
    meta.push_str(&format!(
        "transaction_type=Transaction<Signature, ProofMarker, PedersenRandomness, InMemoryDB> \
         (markers: signature / proof / pre-binding)\n"
    ));
    meta.push('\n');

    for e in &emitted {
        let tx_name = format!("{}.offer-tx.bin", e.name);
        let offer_name = format!("{}.offer-bare.bin", e.name);
        std::fs::write(dir.join(&tx_name), &e.tx_bytes)?;
        std::fs::write(dir.join(&offer_name), &e.offer_bytes)?;
        sums.insert(tx_name.clone(), sha256_hex(&e.tx_bytes));
        sums.insert(offer_name.clone(), sha256_hex(&e.offer_bytes));

        meta.push_str(&format!("[{}]\n", e.name));
        meta.push_str(&format!("what={}\n", e.what));
        meta.push_str(&format!("slot={}\n", e.slot.as_str()));
        meta.push_str(&format!("segment={}\n", e.segment));
        meta.push_str(&format!("inputs={}\n", e.inputs));
        meta.push_str(&format!("outputs={}\n", e.outputs));
        meta.push_str(&format!("anchors={}\n", e.anchors));
        meta.push_str(&format!(
            "offer_tx_len={}\noffer_tx_sha256={}\n",
            e.tx_bytes.len(),
            sha256_hex(&e.tx_bytes)
        ));
        meta.push_str(&format!(
            "offer_bare_len={}\noffer_bare_sha256={}\n",
            e.offer_bytes.len(),
            sha256_hex(&e.offer_bytes)
        ));

        for w in &e.wrappers {
            let wname = format!("{}{}.wrapper.bin", e.name, w.suffix);
            std::fs::write(dir.join(&wname), &w.bytes)?;
            sums.insert(wname.clone(), sha256_hex(&w.bytes));
            meta.push_str(&format!("wrapper{}_file={}\n", w.suffix, wname));
            meta.push_str(&format!("wrapper{}_len={}\n", w.suffix, w.bytes.len()));
            meta.push_str(&format!(
                "wrapper{}_sha256={}\n",
                w.suffix,
                sha256_hex(&w.bytes)
            ));
            meta.push_str(&format!("wrapper{}_memo_hex={}\n", w.suffix, hex::encode(&w.memo)));
            meta.push_str(&format!("wrapper{}_memo_len={}\n", w.suffix, w.memo.len()));
            meta.push_str(&format!("wrapper{}_nullifier={}\n", w.suffix, w.nullifier));
            meta.push_str(&format!("wrapper{}_h={}\n", w.suffix, w.h));
            meta.push_str(&format!("wrapper{}_locator={}\n", w.suffix, w.has_locator));
        }
        meta.push('\n');

        println!(
            "{:<22} {:>7} B tx, {:>7} B offer, {} input(s), {} output(s), {} anchor(s), {} wrapper(s)",
            e.name,
            e.tx_bytes.len(),
            e.offer_bytes.len(),
            e.inputs,
            e.outputs,
            e.anchors,
            e.wrappers.len()
        );
    }

    std::fs::write(dir.join("META.txt"), &meta)?;
    let mut sumfile = String::new();
    for (k, v) in &sums {
        sumfile.push_str(&format!("{v}  {k}\n"));
    }
    std::fs::write(dir.join("SHA256SUMS"), &sumfile)?;

    println!("\nwritten to {}", dir.display());
    println!("{}", sumfile);
    Ok(())
}
