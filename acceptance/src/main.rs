// THE ACCEPTANCE GATE — spec SC-004 / FR-012.
//
// The browser proves the memo authenticates. This proves the bytes are
// consensus-clean: it hands the offer file to the PINNED, UNMODIFIED ledger's
// own `well_formed`, and the pair to the project 00003 detached verifier, and
// replays the frozen conformance vectors. Nothing here is a re-implementation —
// every check calls the reference code (see Cargo.toml for why the paths point
// at the pristine clone rather than at the fork branch).
//
// ===========================================================================
// THE STRICTNESS DECISION, AND WHY IT IS NOT A WEAKENING
// ===========================================================================
// `Transaction::well_formed` takes a `WellFormedStrictness` with six switches.
// This gate runs with FIVE of the six at their strict defaults and turns off
// exactly one: `enforce_balancing`.
//
//     WellFormedStrictness {
//         enforce_balancing:       false,   <-- the only one turned off
//         verify_native_proofs:    true,
//         verify_contract_proofs:  true,
//         verify_signatures:       true,
//         enforce_limits:          true,
//         proof_verification_mode: Real,
//     }
//
// WHY. What Create produces is an OFFER: one input worth 4242 of a demo
// shielded token and one zero-value anchor output. It does not balance, and it
// is not supposed to — a swap offer is a partial transaction that a counterparty
// completes, and the offer files the repository's frozen fixtures carry have
// exactly the same shape. Asking `enforce_balancing` of it is asking whether a
// half of a trade is a whole trade.
//
// WHAT IT DOES *NOT* WEAKEN — and this is the part that matters, read out of
// `ledger/src/verify.rs` at the pinned commit rather than assumed:
//
//   * The zswap proof check is NOT governed by strictness at all.
//     `well_formed` calls `P::zswap_well_formed(offer, segment)`
//     unconditionally; for `ProofMarker` that is `Offer::well_formed`, which
//     verifies EVERY input under the shipped `SPEND_VK` and EVERY output under
//     `OUTPUT_VK`, with statement row 0 = 0. So the canonical
//     `binding_input = 0` invariant (spec FR-003) is checked here by the
//     ledger's own verifier, with no flag able to skip it.
//   * `pedersen_check` is likewise unconditional: the value commitments must
//     add up to the declared deltas under the transaction's own binding
//     randomness.
//   * `enforce_balancing` gates ONE branch: `balancing_check` returns
//     `BalanceCheckOverspend` when a per-(token, segment) balance is NEGATIVE.
//
// So the flag governs "is this a complete, fee-paying transaction", not "are
// these bytes valid". Checks T4/T5 below make that concrete rather than
// asserted: T4 runs the SAME transaction at the FULL default strictness, and
// the gate FAILS unless it fails, and fails specifically with an overspend on
// the fee token. If it ever failed for some other reason, that reason would be
// a real defect and this gate would go red.
//
// PRECEDENT: the ledger's own `test_utilities` set exactly this flag, and only
// this flag, whenever the transaction under test is deliberately imbalanced
// (minting rewards, shielded rewards, dust registration) — see
// `ledger/src/test_utilities.rs`.
//
// ===========================================================================
// WHAT ELSE IS DELIBERATELY NOT CLAIMED
// ===========================================================================
// `well_formed` is a stateless-ish check against a reference state. It does not
// say the transaction would APPLY: the coin it spends lives in a commitment
// tree that was created in a browser tab and exists on no chain, so a real node
// would reject it at the merkle-root check. That is by design (Q-W1 = A) and is
// stated on the page. The claim this gate makes is the narrow, checkable one
// the spec asks for: the memo machinery changed nothing consensus-visible —
// deserialize, well-formedness, proofs, Pedersen balance and the frozen formats
// are all exactly what an unmodified ledger expects.

use std::collections::BTreeMap;
use std::fs;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use base_crypto::time::Timestamp;
use ledger::structure::{LedgerState, ProofMarker, Signature, Transaction};
use ledger::verify::WellFormedStrictness;
use serialize::{tagged_deserialize, tagged_serialize};
use sha2::{Digest, Sha256};
use storage::db::InMemoryDB;
use transient_crypto::commitment::PedersenRandomness;
use transient_crypto::proofs::Proof;
use zswap::{Input, Offer};

use zswap_memo_companion::anchor::AnchorV1;
use zswap_memo_companion::memo::{BindingElement, Memo, memo_hash_v1};
use zswap_memo_companion::spend_statement::{
    canonical_statement, companion_statement, verify_spend_proof,
};
use zswap_memo_companion::vectors::{fr_hex, parse, render_anchor, render_memo_hash, render_wrapper};
use zswap_memo_companion::verify::{Confirmation, MemoTrustState, survey_offer_anchors, verify_wrapper};
use zswap_memo_companion::wrapper::MemoWrapperV1;

type Db = InMemoryDB;

/// The offer file's exact type. `POST /prove-tx` proves a
/// `Transaction<Signature, ProofPreimageMarker, PedersenRandomness, _>` and
/// returns its proven form, whose header tag is
/// `midnight:transaction[v12](signature[v2],proof,embedded-fr[v1]):`.
type OfferFileTx = Transaction<Signature, ProofMarker, PedersenRandomness, Db>;

/// The one flag an offer cannot satisfy, and the five that stay strict.
///
/// Written as a mutation of `default()` rather than a struct literal because
/// `WellFormedStrictness` is `#[non_exhaustive]` — which is the behaviour we
/// want: if upstream ever adds a seventh switch, this gate picks up its strict
/// default instead of silently leaving it out.
fn offer_strictness() -> WellFormedStrictness {
    let mut strictness = WellFormedStrictness::default();
    strictness.enforce_balancing = false;
    strictness
}

// ---------------------------------------------------------------------------
// A tiny result recorder. Same discipline as the project's other runners: one
// line per check, a count at the end, and an exit status derived from a
// boolean rather than from a sum of codes (00003 acceptance audit finding F1).
// ---------------------------------------------------------------------------
#[derive(Default)]
struct Gate {
    results: Vec<(String, String, bool, String)>,
}

impl Gate {
    fn check(&mut self, id: &str, what: &str, pass: bool, detail: impl Into<String>) {
        self.results
            .push((id.to_string(), what.to_string(), pass, detail.into()));
    }

    fn failed(&self) -> usize {
        self.results.iter().filter(|r| !r.2).count()
    }

    fn report(&self) {
        println!();
        for (id, what, pass, detail) in &self.results {
            println!("{}  {:<9} {}", if *pass { "PASS" } else { "FAIL" }, id, what);
            if !detail.is_empty() {
                println!("             {detail}");
            }
        }
        let passed = self.results.len() - self.failed();
        println!(
            "\n{} passed, {} failed, {} total",
            passed,
            self.failed(),
            self.results.len()
        );
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// A transaction plus the wrappers that claim to belong to it.
struct Subject {
    name: String,
    tx_path: PathBuf,
    tx_bytes: Vec<u8>,
    wrappers: Vec<(String, Vec<u8>)>,
    /// Only the page-produced subject carries this: the memo exactly as typed,
    /// so the gate can prove the wrapper carries what the user wrote rather
    /// than merely something self-consistent.
    expected_memo: Option<Vec<u8>>,
}

fn read(path: &Path) -> anyhow::Result<Vec<u8>> {
    fs::read(path).map_err(|e| anyhow::anyhow!("reading {}: {e}", path.display()))
}

/// `page/offer.bin` + `page/wrapper.bin` + `page/memo.bin`, and every
/// `fixtures/*.offer-tx.bin` with the wrappers named after it.
fn collect_subjects(root: &Path) -> anyhow::Result<Vec<Subject>> {
    let mut subjects = Vec::new();

    let page = root.join("page");
    if page.join("offer.bin").exists() {
        subjects.push(Subject {
            name: "page/create".into(),
            tx_path: page.join("offer.bin"),
            tx_bytes: read(&page.join("offer.bin"))?,
            wrappers: vec![(
                "page/wrapper".into(),
                read(&page.join("wrapper.bin"))?,
            )],
            expected_memo: if page.join("memo.bin").exists() {
                Some(read(&page.join("memo.bin"))?)
            } else {
                None
            },
        });
    }

    let fixtures = root.join("fixtures");
    if fixtures.is_dir() {
        let mut names: Vec<String> = fs::read_dir(&fixtures)?
            .filter_map(|e| e.ok())
            .filter_map(|e| e.file_name().to_str().map(str::to_string))
            .filter(|n| n.ends_with(".offer-tx.bin"))
            .collect();
        names.sort();
        for file in names {
            let stem = file.trim_end_matches(".offer-tx.bin").to_string();
            let mut wrappers = Vec::new();
            let mut candidates: Vec<String> = fs::read_dir(&fixtures)?
                .filter_map(|e| e.ok())
                .filter_map(|e| e.file_name().to_str().map(str::to_string))
                .filter(|n| n.ends_with(".wrapper.bin"))
                .filter(|n| {
                    let s = n.trim_end_matches(".wrapper.bin");
                    s == stem || (s.starts_with(&stem) && s[stem.len()..].starts_with('-'))
                })
                .collect();
            candidates.sort();
            for w in candidates {
                wrappers.push((
                    format!("fixtures/{}", w.trim_end_matches(".wrapper.bin")),
                    read(&fixtures.join(&w))?,
                ));
            }
            subjects.push(Subject {
                name: format!("fixtures/{stem}"),
                tx_path: fixtures.join(&file),
                tx_bytes: read(&fixtures.join(&file))?,
                wrappers,
                expected_memo: None,
            });
        }
    }

    Ok(subjects)
}

/// Every zswap offer the transaction carries, keyed by its segment. Segment 0
/// is the guaranteed slot; the rest come out of the fallible map.
fn offer_slots(tx: &OfferFileTx) -> BTreeMap<u16, Offer<Proof, Db>> {
    let mut slots = BTreeMap::new();
    if let Transaction::Standard(stx) = tx {
        if let Some(g) = stx.guaranteed_coins.as_ref() {
            slots.insert(0u16, g.deref().clone());
        }
        for seg_x_offer in stx.fallible_coins.iter() {
            slots.insert(*seg_x_offer.0.deref(), seg_x_offer.1.deref().clone());
        }
    }
    slots
}

fn network_id(tx: &OfferFileTx) -> String {
    match tx {
        Transaction::Standard(stx) => stx.network_id.clone(),
        Transaction::ClaimRewards(c) => c.network_id.clone(),
    }
}

fn describe_balance(tx: &OfferFileTx) -> String {
    match tx.balance(None) {
        Ok(map) => map
            .into_iter()
            .map(|((tt, seg), v)| format!("{tt:?}@{seg}={v}"))
            .collect::<Vec<_>>()
            .join(", "),
        Err(e) => format!("balance() errored: {e:?}"),
    }
}

// ---------------------------------------------------------------------------
// (a) + (b): the offer file against the pinned unmodified ledger.
// ---------------------------------------------------------------------------
fn check_transaction(gate: &mut Gate, subject: &Subject) -> Option<OfferFileTx> {
    let n = &subject.name;

    let tx: OfferFileTx = match tagged_deserialize(&mut &subject.tx_bytes[..]) {
        Ok(tx) => {
            gate.check(
                "T1",
                &format!("[{n}] the offer file deserializes as a Transaction under the pinned ledger"),
                true,
                format!(
                    "{} bytes, sha256 {}",
                    subject.tx_bytes.len(),
                    sha256_hex(&subject.tx_bytes)
                ),
            );
            tx
        }
        Err(e) => {
            gate.check(
                "T1",
                &format!("[{n}] the offer file deserializes as a Transaction under the pinned ledger"),
                false,
                format!("{}: {e}", subject.tx_path.display()),
            );
            return None;
        }
    };

    // Canonical bytes: what came out must be what went in. A format that
    // round-trips only approximately is not a format.
    let mut round_trip = Vec::new();
    let reser = tagged_serialize(&tx, &mut round_trip).is_ok();
    gate.check(
        "T2",
        &format!("[{n}] re-serializing is byte-identical — the bytes are canonical"),
        reser && round_trip == subject.tx_bytes,
        format!("{} bytes back", round_trip.len()),
    );

    let state: LedgerState<Db> = LedgerState::new(network_id(&tx));
    let tblock = Timestamp::from_secs(0);

    // THE CHECK THIS GATE EXISTS FOR.
    match tx.well_formed(&state, offer_strictness(), tblock) {
        Ok(verified) => gate.check(
            "T3",
            &format!(
                "[{n}] passes the PINNED UNMODIFIED ledger's well_formed (real proof verification, balancing off — see the header)"
            ),
            true,
            format!(
                "network `{}`, transaction hash {:?}",
                network_id(&tx),
                verified.transaction_hash()
            ),
        ),
        Err(e) => gate.check(
            "T3",
            &format!("[{n}] passes the PINNED UNMODIFIED ledger's well_formed"),
            false,
            format!("{e:?}"),
        ),
    }

    // T4: the honest control. The SAME transaction at FULL default strictness
    // must fail, and must fail on balancing and nothing else. This is what
    // stops T3's flag from being a quiet weakening: if some other check were
    // also being skipped, this would surface it.
    let strict = tx.well_formed(&state, WellFormedStrictness::default(), tblock);
    let strict_msg = match &strict {
        Ok(_) => "UNEXPECTEDLY WELL-FORMED at full strictness".to_string(),
        Err(e) => format!("{e:?}"),
    };
    let is_balance_failure = strict_msg.contains("BalanceCheck");
    gate.check(
        "T4",
        &format!(
            "[{n}] CONTROL: at FULL default strictness the same transaction fails, and fails on BALANCING — the one thing an offer cannot satisfy"
        ),
        strict.is_err() && is_balance_failure,
        strict_msg.chars().take(300).collect::<String>(),
    );

    gate.check(
        "T5",
        &format!("[{n}] the imbalance is reported rather than hidden"),
        true,
        describe_balance(&tx),
    );

    Some(tx)
}

// ---------------------------------------------------------------------------
// (c) + (d): the pair against the 00003 detached verifier and the frozen
// formats, with the controls that make a PASS mean something.
// ---------------------------------------------------------------------------
fn check_wrapper(
    gate: &mut Gate,
    subject: &Subject,
    tx: &OfferFileTx,
    slots: &BTreeMap<u16, Offer<Proof, Db>>,
    wname: &str,
    wbytes: &[u8],
) {
    let wrapper = match MemoWrapperV1::decode(wbytes) {
        Ok(w) => {
            gate.check(
                "W1",
                &format!("[{wname}] the memo wrapper decodes under the 00003 codec"),
                true,
                format!("{} bytes, sha256 {}", wbytes.len(), sha256_hex(wbytes)),
            );
            w
        }
        Err(e) => {
            gate.check(
                "W1",
                &format!("[{wname}] the memo wrapper decodes under the 00003 codec"),
                false,
                format!("{e:?}"),
            );
            return;
        }
    };

    let segment = wrapper.segment();
    let Some(offer) = slots.get(&segment) else {
        gate.check(
            "W2",
            &format!("[{wname}] the wrapper's segment names a slot the transaction actually has"),
            false,
            format!(
                "wrapper claims segment {segment}; transaction carries {:?}",
                slots.keys().collect::<Vec<_>>()
            ),
        );
        return;
    };
    gate.check(
        "W2",
        &format!("[{wname}] the wrapper's segment names a slot the transaction actually has"),
        true,
        format!(
            "segment {segment} ({}), {} input(s), {} output(s)",
            if segment == 0 { "guaranteed slot" } else { "fallible map" },
            offer.inputs.len(),
            offer.outputs.len()
        ),
    );

    // ---- Q-W11: does the page's re-tagged proof parse as the ledger's own
    // plain tagged `Proof`? The page assembles the wrapper in JavaScript from
    // what a proof server returned in the VERSIONED encoding, re-tagging it.
    // This is the Rust deserializer's verdict on that, and W5 below is the
    // cryptographic one.
    let companion: Option<Proof> =
        match tagged_deserialize(&mut &wrapper.companion_proof_bytes()[..]) {
            Ok(p) => {
                gate.check(
                    "W3",
                    &format!(
                        "[{wname}] the wrapper's companion proof parses as a tagged `Proof` under the RUST deserializer (Q-W11)"
                    ),
                    true,
                    format!("{} proof bytes", wrapper.companion_proof_bytes().len()),
                );
                Some(p)
            }
            Err(e) => {
                gate.check(
                    "W3",
                    &format!(
                        "[{wname}] the wrapper's companion proof parses as a tagged `Proof` under the RUST deserializer (Q-W11)"
                    ),
                    false,
                    format!("{e}"),
                );
                None
            }
        };

    // ---- the memo is what was typed (page subject only) -------------------
    if let Some(expected) = subject.expected_memo.as_ref() {
        let got = wrapper.unverified_memo().as_bytes();
        gate.check(
            "W4",
            &format!("[{wname}] the wrapper carries exactly the memo bytes that were typed"),
            got == expected.as_slice(),
            format!("{} bytes, {}", got.len(), hex::encode(got)),
        );
    }

    // ---- (c) 00003 DETACHED VERIFICATION ---------------------------------
    let report = verify_wrapper(wbytes, offer, segment, Confirmation::Unconfirmed);
    let authenticated = matches!(
        report.state(),
        MemoTrustState::AuthenticatedWithMatchingAnchorUnconfirmed(_)
    );
    gate.check(
        "W5",
        &format!(
            "[{wname}] 00003 DETACHED VERIFICATION passes on the pair: authenticated, with a matching anchor"
        ),
        authenticated,
        format!("{} | anomalies: {:?}", report.state().describe(), report.anomalies()),
    );

    let memo = wrapper.unverified_memo().clone();
    let Ok(binding) = BindingElement::for_memo(&memo) else {
        gate.check(
            "W6",
            &format!("[{wname}] MemoHashV1(memo) is a legal binding element"),
            false,
            "MemoHashV1 landed on the reserved zero",
        );
        return;
    };
    let h = binding.get();
    let want = AnchorV1::new(wrapper.nullifier(), binding);

    // ---- (d) the anchor, against the frozen encoding ----------------------
    let survey = survey_offer_anchors(offer);
    let matching = survey.matching(&want);
    gate.check(
        "W6",
        &format!(
            "[{wname}] the anchor in the offer decodes to AnchorV1(nullifier, MemoHashV1(memo)) — matched by VALUE, not position"
        ),
        !matching.is_empty(),
        format!(
            "h = {}, matching output(s) {:?}, {} valid anchor(s) in this offer, {} malformed candidate(s)",
            fr_hex(h),
            matching,
            survey.valid.len(),
            survey.malformed.len()
        ),
    );

    let encoded = want.encode_untagged_bytes();
    let present = subject
        .tx_bytes
        .windows(encoded.len())
        .any(|w| w == encoded.as_slice());
    gate.check(
        "W7",
        &format!(
            "[{wname}] re-encoding that anchor with the frozen AnchorV1 codec reproduces bytes present VERBATIM in the transaction"
        ),
        present,
        format!("{} anchor bytes, sha256 {}", encoded.len(), sha256_hex(&encoded)),
    );

    // ---- the carrier input, and the FR-003 canonical invariant ------------
    let carriers: Vec<&Input<Proof, Db>> = offer
        .inputs
        .iter_deref()
        .filter(|i| i.nullifier == wrapper.nullifier())
        .collect();
    let Some(carrier) = carriers.first().copied() else {
        gate.check(
            "W8",
            &format!("[{wname}] the wrapper's nullifier names an input of this offer"),
            false,
            "no input with that nullifier",
        );
        return;
    };

    let canonical = canonical_statement(carrier, segment);
    let companion_stmt = companion_statement(carrier, segment, &binding);

    gate.check(
        "W8",
        &format!(
            "[{wname}] the CARRIER's own spend proof verifies at row 0 = 0 — the canonical binding_input the ledger requires (FR-003)"
        ),
        verify_spend_proof(&carrier.proof, &canonical).is_ok(),
        format!("statement rows {}", canonical.len()),
    );

    // The two controls. Without them, a verifier that ignored row 0 would look
    // exactly like a correct one: it would pass both acceptances above.
    gate.check(
        "W9",
        &format!(
            "[{wname}] CONTROL: that same spend proof is REJECTED at row 0 = MemoHashV1(memo)"
        ),
        verify_spend_proof(&carrier.proof, &companion_stmt).is_err(),
        "row 0 is load-bearing for the canonical proof",
    );

    if let Some(companion) = companion.as_ref() {
        gate.check(
            "W10",
            &format!(
                "[{wname}] CONTROL: the COMPANION proof is REJECTED at row 0 = 0 — it proves the memo statement, not the canonical one"
            ),
            verify_spend_proof(companion, &canonical).is_err(),
            "row 0 is load-bearing for the companion proof",
        );
        gate.check(
            "W11",
            &format!(
                "[{wname}] the COMPANION proof verifies at row 0 = MemoHashV1(memo) under the shipped SPEND_VK"
            ),
            verify_spend_proof(companion, &companion_stmt).is_ok(),
            format!("h = {}", fr_hex(h)),
        );
    }

    // ---- a tamper control on the wrapper itself --------------------------
    // Built here, from the frozen bytes, rather than committed: a defect you
    // can see in the source beats a file you have to take on trust.
    let mut flipped = memo.as_bytes().to_vec();
    flipped[0] ^= 0x01;
    match Memo::new(flipped) {
        Ok(bad_memo) => {
            match MemoWrapperV1::from_parts(
                bad_memo,
                wrapper.nullifier(),
                segment,
                wrapper.claimed_statement_tail().to_vec(),
                wrapper.companion_proof_bytes().to_vec(),
                wrapper.locator().cloned(),
            ) {
                Ok(bad) => {
                    let bad_report =
                        verify_wrapper(&bad.encode(), offer, segment, Confirmation::Unconfirmed);
                    gate.check(
                        "W12",
                        &format!(
                            "[{wname}] CONTROL: one flipped memo byte is refused, and yields no authenticated memo"
                        ),
                        !bad_report.state().is_authenticated()
                            && bad_report.authenticated_memo().is_none(),
                        bad_report.state().describe(),
                    );
                }
                Err(e) => gate.check(
                    "W12",
                    &format!("[{wname}] CONTROL: one flipped memo byte is refused"),
                    false,
                    format!("could not build the tampered wrapper: {e:?}"),
                ),
            }
        }
        Err(e) => gate.check(
            "W12",
            &format!("[{wname}] CONTROL: one flipped memo byte is refused"),
            false,
            format!("could not build the tampered memo: {e:?}"),
        ),
    }

    let _ = tx; // the transaction is checked by check_transaction; kept for clarity
}

// ---------------------------------------------------------------------------
// (d): the frozen conformance vectors, replayed byte for byte.
// ---------------------------------------------------------------------------
fn check_vectors(gate: &mut Gate, vectors: &Path, page_memo: Option<&[u8]>) {
    let files: [(&str, fn() -> String); 3] = [
        ("memo-hash.txt", render_memo_hash as fn() -> String),
        ("anchor.txt", render_anchor as fn() -> String),
        ("wrapper.txt", render_wrapper as fn() -> String),
    ];
    for (i, (name, render)) in files.iter().enumerate() {
        let path = vectors.join(name);
        let id = format!("V{}", i + 1);
        match fs::read_to_string(&path) {
            Ok(frozen) => {
                let rendered = render();
                gate.check(
                    &id,
                    &format!("the frozen conformance file `{name}` replays BYTE-EXACTLY"),
                    rendered == frozen,
                    format!(
                        "{} bytes, sha256 {}",
                        frozen.len(),
                        sha256_hex(frozen.as_bytes())
                    ),
                );
            }
            Err(e) => gate.check(
                &id,
                &format!("the frozen conformance file `{name}` replays BYTE-EXACTLY"),
                false,
                format!("{}: {e}", path.display()),
            ),
        }
    }

    // The page's own memo-hash against the frozen record, when the memo is the
    // one the vectors pin. This is the direct "Create reproduces the frozen
    // vector" claim.
    let Some(memo_bytes) = page_memo else { return };
    let Ok(memo) = Memo::from_slice(memo_bytes) else { return };
    let Ok(text) = fs::read_to_string(vectors.join("memo-hash.txt")) else {
        return;
    };
    let Ok(records) = parse(&text) else { return };
    let Some(record) = records.iter().find(|r| {
        r.get("memo")
            .map(|m| m == hex::encode(memo_bytes))
            .unwrap_or(false)
    }) else {
        gate.check(
            "V4",
            "the page's memo is covered by a frozen memo-hash vector",
            true,
            format!(
                "memo {} is not one of the frozen cases — V1 still pins the derivation",
                hex::encode(memo_bytes)
            ),
        );
        return;
    };
    let frozen = record.get("memo_hash").unwrap_or("").to_string();
    let derived = fr_hex(memo_hash_v1(&memo));
    gate.check(
        "V4",
        &format!(
            "the page's own MemoHashV1 equals the frozen `{}` vector",
            record.name
        ),
        derived == frozen,
        format!("frozen {frozen} / derived {derived}"),
    );
}

fn main() -> ExitCode {
    let mut args = std::env::args().skip(1);
    let artifacts = match args.next() {
        Some(a) => PathBuf::from(a),
        None => {
            eprintln!("usage: webmemo-acceptance <artifacts-dir> [vectors-dir]");
            return ExitCode::from(2);
        }
    };
    let vectors = args.next().map(PathBuf::from).unwrap_or_else(|| {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../../../00003-spend-proof-memo-binding/zswap-memo-companion/vectors")
    });

    println!("=== web-memo ACCEPTANCE GATE (spec SC-004 / FR-012) ===");
    println!("artifacts : {}", artifacts.display());
    println!("vectors   : {}", vectors.display());
    println!("ledger    : the PRISTINE pinned clone, through path dependencies (see Cargo.toml)");
    println!(
        "strictness: {:?}",
        offer_strictness()
    );
    println!();

    let subjects = match collect_subjects(&artifacts) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("could not read the artifacts: {e}");
            return ExitCode::from(2);
        }
    };

    let mut gate = Gate::default();

    // The gate is about the PAGE's output. A run that silently found no
    // page-produced pair would otherwise report a cheerful green over the
    // frozen fixtures alone.
    let page_subject = subjects.iter().find(|s| s.name == "page/create");
    gate.check(
        "S0",
        "a Create-produced pair from a headless browser run is present",
        page_subject.is_some(),
        format!("{} subject(s): {:?}", subjects.len(), subjects.iter().map(|s| &s.name).collect::<Vec<_>>()),
    );
    let page_memo = page_subject.and_then(|s| s.expected_memo.clone());

    for subject in &subjects {
        println!("--- {} ---", subject.name);
        let Some(tx) = check_transaction(&mut gate, subject) else {
            continue;
        };
        let slots = offer_slots(&tx);
        if subject.wrappers.is_empty() {
            // The no-wrapper fixture is the "no evidence" case and is here to
            // prove the transaction half of the gate stands on its own.
            gate.check(
                "W0",
                &format!("[{}] carries no wrapper — transaction checks only", subject.name),
                true,
                format!("segments {:?}", slots.keys().collect::<Vec<_>>()),
            );
        }
        for (wname, wbytes) in &subject.wrappers {
            check_wrapper(&mut gate, subject, &tx, &slots, wname, wbytes);
        }
    }

    println!("--- frozen conformance vectors ---");
    check_vectors(&mut gate, &vectors, page_memo.as_deref());

    gate.report();

    // 00003 acceptance audit F1: derive the status from a boolean, never from a
    // sum of exit codes, which truncates to 8 bits and can land on 0.
    if gate.failed() == 0 {
        println!("\nOVERALL: ACCEPTANCE GREEN");
        ExitCode::SUCCESS
    } else {
        println!("\nOVERALL: ACCEPTANCE FAILED");
        ExitCode::FAILURE
    }
}
