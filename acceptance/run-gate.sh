#!/usr/bin/env bash
#
# THE ACCEPTANCE GATE, END TO END — spec SC-004 / FR-012.
#
#   acceptance/run-gate.sh <out-dir> [--artifacts <dir>] [--keep-image]
#
# With PROOF_SERVER set, it does the whole thing:
#
#   1. builds the page (`npm run build`);
#   2. drives ONE real Create run in a real headless browser against that proof
#      server and writes the pair to disk;
#   3. adds the six frozen reference fixtures as further subjects;
#   4. builds the gate image and runs it with `--network none`, against the
#      PINNED, UNMODIFIED ledger;
#   5. removes the image it built and reports what it left behind.
#
# With `--artifacts <dir>` it skips 1-3 and gates an existing set — the same
# path CI would take if the artifacts came from an earlier job.
#
#   PROOF_SERVER=http://127.0.0.1:PORT acceptance/run-gate.sh /tmp/gate-out
#
# HOUSE RULES THIS SCRIPT KEEPS (AGENTS.md):
#   * the only port anything binds is the static server inside the browser
#     harness, which picks a RANDOM port above 10000 and verifies it is free by
#     binding it first; the gate container publishes nothing at all;
#   * the image is tagged with a per-run stamp and removed as soon as the gate
#     finishes, so teardown can only delete what this run created;
#   * no volumes and no custom networks are created; the container is `--rm`;
#   * the shared BuildKit cache is NEVER pruned;
#   * nothing is written inside the 00003 trees, and their pins are asserted
#     before AND after.
#
# EXIT STATUS is derived from a boolean, never from a sum of exit codes: a sum
# truncates to 8 bits and can land on 0 while the summary says FAILED (00003
# acceptance audit finding F1).

set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/.." && pwd)"
WORKSPACE_00003="${WEBMEMO_00003:-$(cd "$REPO/../.." 2>/dev/null && pwd)/00003-spend-proof-memo-binding}"

OUT="${1:?usage: run-gate.sh <out-dir> [--artifacts <dir>] [--keep-image]}"
shift || true

ARTIFACTS=""
KEEP_IMAGE=0
while [ $# -gt 0 ]; do
    case "$1" in
        --artifacts) ARTIFACTS="${2:?--artifacts needs a directory}"; shift 2 ;;
        --keep-image) KEEP_IMAGE=1; shift ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

mkdir -p "$OUT"
SUMMARY="$OUT/run-metadata.txt"
: > "$SUMMARY"
say() { echo "$@" | tee -a "$SUMMARY"; }

# Docker repository names must be lowercase.
STAMP="${ACCEPTANCE_STAMP:-$(date -u +%Y%m%d-%H%M%S)-$$}"
IMAGE="webmemo-acceptance-${STAMP}:gate"

say "=== web-memo ACCEPTANCE GATE ==="
say "stamp        : $STAMP"
say "started-utc  : $(date -u +%Y-%m-%dT%H:%M:%SZ)"
say "repo         : $REPO"
say "00003 dir    : $WORKSPACE_00003"
say "out          : $OUT"
say ""

# --- the pins, on the host, BEFORE anything --------------------------------
#
# What "clean" has to mean here, precisely.
#
# The upstream workspace beside this repository is a LIVE working tree that
# other work uses too. Demanding it be pristine down to the last untracked
# scratch file would make this gate fail for reasons that cannot possibly change
# its verdict — and a gate that cries wolf gets ignored.
#
# So the two trees are treated differently, for a reason:
#
#   * the PRISTINE LEDGER CLONE is the tree whose bytes define "unmodified".
#     It must be detached at the baseline with NOTHING in it that is not in the
#     commit — tracked or untracked. Anything else and the gate is not testing
#     what it says it is testing.
#   * the TOOLKIT is checked the way the proof-server image checks
#     `proof-server/`: not "is it at commit X" but **"is the part this gate
#     depends on byte-identical to the pin"**. That is
#     `git diff PIN HEAD -- src/ vectors/ Cargo.toml Cargo.lock`, and it must be
#     EMPTY. Its HEAD is allowed to move — another project owns that tree and
#     may add tests or docs on top — but the reference implementation and the
#     frozen vectors this gate's verdict is about may not change underneath it.
#     Modified tracked files fail outright; untracked files are listed by name
#     and do not, because `cargo build` of this crate compiles the toolkit's
#     library and never its `tests/`, and an untracked module cannot be reached
#     without editing a tracked file to declare it.
#
# This last check exists because the hole it closes was found the hard way: a
# neighbouring project committed to that tree mid-run. Nothing this gate reads
# changed, but nothing would have told us if it had.
LEDGER_BASELINE=4823b5351b17cc49e30f19760dbd30a73cf95e22
TOOLKIT_PIN="${WEBMEMO_TOOLKIT_PIN:-5dd870f827cd6794fcfba60076d9b3f9c914659c}"
TOOLKIT_LOAD_BEARING=(src vectors Cargo.toml Cargo.lock)

assert_pins() { # $1 = "BEFORE" | "AFTER"
    local when="$1" bad=0
    if [ ! -d "$WORKSPACE_00003/midnight-ledger-fork" ]; then
        say "$when: MISSING $WORKSPACE_00003/midnight-ledger-fork"
        return 1
    fi
    local head modified untracked drift
    head="$(git -C "$WORKSPACE_00003/midnight-ledger-fork" rev-parse HEAD)"
    modified="$(git -C "$WORKSPACE_00003/midnight-ledger-fork" status --porcelain | wc -l | tr -d ' ')"
    say "$when: pristine ledger clone $head, anything-not-in-the-commit=$modified"
    [ "$head" = "$LEDGER_BASELINE" ] || { say "$when: NOT the pinned baseline $LEDGER_BASELINE"; bad=1; }
    [ "$modified" = "0" ] || bad=1

    head="$(git -C "$WORKSPACE_00003/zswap-memo-companion" rev-parse HEAD)"
    modified="$(git -C "$WORKSPACE_00003/zswap-memo-companion" status --porcelain --untracked-files=no | wc -l | tr -d ' ')"
    untracked="$(git -C "$WORKSPACE_00003/zswap-memo-companion" ls-files --others --exclude-standard | tr '\n' ' ')"
    say "$when: 00003 toolkit        $head, modified_tracked_files=$modified"
    [ "$modified" = "0" ] || bad=1

    # The one that matters: the reference implementation and the frozen vectors
    # must be byte-identical to the pin, whatever the HEAD says.
    drift="$(git -C "$WORKSPACE_00003/zswap-memo-companion" diff --name-only \
                 "$TOOLKIT_PIN" HEAD -- "${TOOLKIT_LOAD_BEARING[@]}" 2>&1 | tr '\n' ' ')"
    if [ -z "$drift" ]; then
        say "$when: 00003 toolkit        src/ vectors/ Cargo.{toml,lock} BYTE-IDENTICAL to the pin $TOOLKIT_PIN"
    else
        say "$when: 00003 toolkit        DRIFTED from the pin $TOOLKIT_PIN in: $drift"
        bad=1
    fi
    if [ -n "$untracked" ]; then
        say "$when: 00003 toolkit        untracked files present (reported, not fatal): $untracked"
    fi
    return "$bad"
}

rc_pins_before=0; assert_pins "BEFORE" || rc_pins_before=1
if [ "$rc_pins_before" -ne 0 ]; then
    say ""
    say "REFUSING TO RUN: the 00003 trees are not at their pins or are not clean."
    say "OVERALL: ACCEPTANCE FAILED"
    exit 1
fi
say ""

# 255 is the "did not run" sentinel; a stage that never ran is never green.
rc_artifacts=255; rc_build=255; rc_gate=255

# --- 1-3: the artifacts ----------------------------------------------------
if [ -n "$ARTIFACTS" ]; then
    say "--- artifacts: supplied, not produced ($ARTIFACTS) ---"
    rc_artifacts=0
else
    ARTIFACTS="$OUT/artifacts"
    say "--- 1/3  build the page ---"
    if [ -z "${PROOF_SERVER:-}" ]; then
        say "PROOF_SERVER is not set, and no --artifacts was given."
        say "The gate is about the PAGE's output, so it will not run without one."
        say "Start one with:  cd docker && docker compose up -d --build"
        say "OVERALL: ACCEPTANCE FAILED"
        exit 1
    fi
    rm -rf "$ARTIFACTS"
    mkdir -p "$ARTIFACTS/fixtures"
    ( cd "$REPO" && npm run build ) > "$OUT/page-build.log" 2>&1
    rc_page_build=$?
    say "npm run build exit: $rc_page_build"

    say "--- 2/3  one real Create run in a real browser against $PROOF_SERVER ---"
    rc_artifacts=0
    ( cd "$REPO" && PROOF_SERVER="$PROOF_SERVER" node test/create-artifacts.mjs "$ARTIFACTS/page" ) \
        > "$OUT/create-artifacts.log" 2>&1 || rc_artifacts=$?
    say "create-artifacts exit: $rc_artifacts"

    say "--- 3/3  add the frozen reference fixtures as further subjects ---"
    cp "$REPO"/fixtures/*.bin "$ARTIFACTS/fixtures/" 2>/dev/null
    say "fixtures copied: $(ls "$ARTIFACTS/fixtures" | wc -l | tr -d ' ') files"
fi
say ""

if [ "$rc_artifacts" -ne 0 ]; then
    say "the artifacts could not be produced — see $OUT/create-artifacts.log"
    say "OVERALL: ACCEPTANCE FAILED"
    exit 1
fi

# --- 4: the gate, in Docker ------------------------------------------------
say "--- 4/4  build and run the gate image ---"
rc_build=0
DOCKER_BUILDKIT=1 docker build \
    -f "$HERE/Dockerfile" \
    --build-context "gate=$HERE" \
    --build-arg "LEDGER_BASELINE=$LEDGER_BASELINE" \
    -t "$IMAGE" \
    "$WORKSPACE_00003" \
    > "$OUT/image-build.log" 2>&1 || rc_build=$?
say "image build exit: $rc_build ($IMAGE)"

if [ "$rc_build" -eq 0 ]; then
    rc_gate=0
    # --network none: verification needs no proving parameters (SPEND_VK,
    # OUTPUT_VK and PARAMS_VERIFIER are include_bytes!), so the gate can be
    # sealed off entirely. The artifacts go in read-only.
    docker run --rm \
        --network none \
        -v "$(cd "$ARTIFACTS" && pwd):/artifacts:ro" \
        "$IMAGE" /artifacts \
        > "$OUT/gate.log" 2>&1 || rc_gate=$?
    say "gate exit: $rc_gate"
    tail -3 "$OUT/gate.log" | sed 's/^/    /' | tee -a "$SUMMARY"
fi
say ""

# --- teardown: only what this run created ----------------------------------
say "--- teardown ---"
if [ "$KEEP_IMAGE" -eq 1 ]; then
    say "image KEPT on request: $IMAGE"
elif docker image inspect "$IMAGE" > /dev/null 2>&1; then
    docker image rm -f "$IMAGE" > /dev/null 2>&1 \
        && say "removed image $IMAGE" \
        || say "FAILED to remove $IMAGE"
else
    say "image already gone (build failed, or never tagged): $IMAGE"
fi
say "left-over containers for this run : $(docker ps -a --format '{{.Image}}' | grep -c "webmemo-acceptance-${STAMP}" || true)"
say "left-over images for this run     : $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -c "webmemo-acceptance-${STAMP}" || true)"
say "volumes created by this run       : none (the container is --rm with one read-only bind mount)"
say "networks created by this run      : none (--network none)"
say "NOTE: the shared BuildKit cache is deliberately NOT pruned."
say ""

# --- the pins, AFTER: read-only is a result, not a promise -----------------
rc_pins_after=0; assert_pins "AFTER" || rc_pins_after=1
say ""

say "--- results ---"
verdict() { case "$1" in 0) echo GREEN ;; 255) echo "NOT RUN" ;; *) echo "FAILED ($1)" ;; esac; }
say "artifacts (page Create run + fixtures) : $(verdict "$rc_artifacts")"
say "gate image build                       : $(verdict "$rc_build")"
say "acceptance gate                        : $(verdict "$rc_gate")"
say "00003 pins clean after the run         : $([ "$rc_pins_after" -eq 0 ] && echo GREEN || echo FAILED)"
say "finished-utc : $(date -u +%Y-%m-%dT%H:%M:%SZ)"

TOTAL=$(( rc_artifacts + rc_build + rc_gate + rc_pins_after ))
say "OVERALL: $([ "$TOTAL" -eq 0 ] && echo "ACCEPTANCE GREEN" || echo "ACCEPTANCE FAILED")"

( cd "$OUT" && find . -type f \( -name '*.log' -o -name 'run-metadata.txt' \) | LC_ALL=C sort \
    | xargs shasum -a 256 > SHA256SUMS.txt && echo "wrote $OUT/SHA256SUMS.txt" )

# 00003 acceptance audit F1: a raw sum can be a multiple of 256 and truncate to 0.
exit $(( TOTAL == 0 ? 0 : 1 ))
