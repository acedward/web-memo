# The acceptance gate, in a sealed container.
#
# Build it with `acceptance/run-gate.sh`, which supplies both contexts and the
# pins. By hand it is:
#
#   docker build -f acceptance/Dockerfile \
#       --build-context gate=<repo>/acceptance \
#       -t webmemo-acceptance:<stamp> \
#       <path to the 00003 workspace>
#
# The DEFAULT context is the 00003 workspace, whose own `.dockerignore` keeps
# target directories and evidence out; `gate` is this directory.
#
# THE LAYOUT IS LOAD-BEARING. `acceptance/Cargo.toml` resolves the ledger and
# the 00003 toolkit through `../../../00003-spend-proof-memo-binding/…`, so the
# two trees are placed at exactly that relative offset here. The alternative —
# rewriting the manifest for the container — would mean the gate that runs in CI
# is not the gate a developer runs locally.
#
# The build ASSERTS the pins rather than trusting them, and fails otherwise:
# the pristine ledger clone must be detached at the baseline and clean, and the
# toolkit must be clean. Both trees are READ-ONLY here — nothing is written back
# into either, and the cargo target directory lives outside both.
#
# One stage on purpose: the frozen vectors and the pin record stay in the image,
# so a reader can `docker run --entrypoint cat <image> /PINS.txt` and see what it
# was built against. `run-gate.sh` removes the image as soon as the gate
# finishes, so the size is transient.
FROM rust:1.95-bookworm

ARG LEDGER_BASELINE=4823b5351b17cc49e30f19760dbd30a73cf95e22
ARG TOOLKIT_PIN=5dd870f827cd6794fcfba60076d9b3f9c914659c

RUN apt-get update && apt-get install -y --no-install-recommends \
        clang cmake pkg-config libssl-dev git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /usr/local/cargo && printf '[net]\ngit-fetch-with-cli = true\n' > /usr/local/cargo/config.toml

WORKDIR /src

COPY . /src/experiments/00003-spend-proof-memo-binding
COPY --from=gate . /src/experiments/00005-web-memo/web-memo/acceptance

# The pins, asserted. If the pristine clone is not the pinned baseline, this
# gate is not testing "the unmodified ledger" and must not run.
#
# The two trees are held to different standards on purpose — see the long note
# in run-gate.sh. The pristine ledger clone must contain nothing that is not in
# the commit. The toolkit's HEAD is allowed to move, because another project
# owns that tree, but the part this gate depends on — `src/`, `vectors/` and the
# manifests — must be BYTE-IDENTICAL to the pin, which is the same shape of
# assertion the proof-server image makes about `proof-server/`. Modified tracked
# files fail the build; untracked files are recorded in /PINS.txt instead,
# because `cargo build` of this crate compiles the toolkit's library and never
# its `tests/`, and an untracked module cannot be reached without editing a
# tracked file to declare it.
RUN git config --global --add safe.directory '*' \
 && cd /src/experiments/00003-spend-proof-memo-binding \
 && test "$(git -C midnight-ledger-fork rev-parse HEAD)" = "$LEDGER_BASELINE" \
 && test -z "$(git -C midnight-ledger-fork status --porcelain)" \
 && test -z "$(git -C midnight-ledger-fork symbolic-ref -q HEAD || true)" \
 && test -z "$(git -C zswap-memo-companion status --porcelain --untracked-files=no)" \
 && test -z "$(git -C zswap-memo-companion diff --name-only "$TOOLKIT_PIN" HEAD -- src vectors Cargo.toml Cargo.lock)" \
 && { echo "ledger-baseline: $(git -C midnight-ledger-fork rev-parse HEAD) (detached, nothing outside the commit)"; \
      echo "00003-toolkit-head: $(git -C zswap-memo-companion rev-parse HEAD) (no modified tracked files)"; \
      echo "00003-toolkit-pin:  $TOOLKIT_PIN — src/ vectors/ Cargo.{toml,lock} asserted BYTE-IDENTICAL to it"; \
      echo "00003-toolkit untracked files present at build time: $(git -C zswap-memo-companion ls-files --others --exclude-standard | tr '\n' ' ')"; \
      echo "rustc:           $(rustc --version)"; \
    } | tee /PINS.txt

ENV CARGO_TERM_COLOR=never CARGO_NET_RETRY=5 RUST_BACKTRACE=1

RUN cd /src/experiments/00005-web-memo/web-memo/acceptance \
 && CARGO_TARGET_DIR=/target cargo build --locked \
 && cp /target/debug/webmemo-acceptance /usr/local/bin/webmemo-acceptance \
 && rm -rf /target \
 && echo "OK: acceptance gate built"

# The frozen conformance vectors travel with the image so the gate can run with
# no network and no mounts other than the artifacts under test.
ENV WEBMEMO_VECTORS=/src/experiments/00003-spend-proof-memo-binding/zswap-memo-companion/vectors

ENTRYPOINT ["/bin/sh", "-c", "exec webmemo-acceptance \"$@\" \"$WEBMEMO_VECTORS\"", "--"]
