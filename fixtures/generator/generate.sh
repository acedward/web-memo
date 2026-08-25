#!/usr/bin/env bash
# 00005 PHASE 2 task 2.5 — regenerate the Transaction-shaped reference fixtures.
#
# This is the committed generation script referenced by
# `web-memo/fixtures/PROVENANCE.md`. It stamps the exact pins into META.txt so a
# reader can tell, from the fixtures alone, which trees produced them.
#
# It asserts the two 00003 trees are at their pins and CLEAN before running, and
# again afterwards, because this crate path-depends on both and must leave them
# untouched (00005 standing rule 2).
#
#   usage:  ./generate.sh <output-dir>
#
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$HERE/out}"

E="$HERE/../../../00003-spend-proof-memo-binding"
PRISTINE="$E/midnight-ledger-fork"
TOOLKIT="$E/zswap-memo-companion"

# --- pins, asserted before any work ----------------------------------------
LEDGER_PIN="$(git -C "$PRISTINE" rev-parse HEAD)"
TOOLKIT_PIN="$(git -C "$TOOLKIT" rev-parse HEAD)"

expect_ledger="4823b5351b17cc49e30f19760dbd30a73cf95e22"
if [ "$LEDGER_PIN" != "$expect_ledger" ]; then
  echo "REFUSING: pristine ledger clone is at $LEDGER_PIN, expected $expect_ledger" >&2
  exit 1
fi
for d in "$PRISTINE" "$TOOLKIT"; do
  if [ -n "$(git -C "$d" status --porcelain)" ]; then
    echo "REFUSING: $d is not clean" >&2
    exit 1
  fi
done

GENERATOR_SHA256="$(shasum -a 256 "$HERE/src/main.rs" | cut -d' ' -f1)"

export LEDGER_PIN TOOLKIT_PIN GENERATOR_SHA256
export RUSTUP_TOOLCHAIN=1.95.0
export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$HERE/../target-txfixture}"

echo "ledger baseline : $LEDGER_PIN"
echo "00003 toolkit   : $TOOLKIT_PIN"
echo "generator sha256: $GENERATOR_SHA256"
echo "output          : $OUT"
echo

rm -rf "$OUT"
cargo run --quiet --manifest-path "$HERE/Cargo.toml" -- "$OUT"

# --- pins re-asserted AFTER, so "read-only" is a result, not a promise ------
for d in "$PRISTINE" "$TOOLKIT"; do
  if [ -n "$(git -C "$d" status --porcelain)" ]; then
    echo "FAILED: $d was modified by this run" >&2
    exit 1
  fi
done
echo
echo "00003 trees re-asserted clean at $LEDGER_PIN / $TOOLKIT_PIN"
