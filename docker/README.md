# The pinned proof server

The **Create** section of this page needs a proof server. The spend circuit is
K = 19; proving it in a browser tab is not practical, so the page posts a
proving payload to a server *you* run. This directory is that server, pinned to
the ledger baseline the page's WASM bundle was built against.

## One command

```sh
cd docker
docker compose up -d --build
```

Then open the page and paste this into **Proof server URL** in the Create
section:

```
http://localhost:6300
```

That is also the page's built-in default, so if you did not change the port
there is nothing to type — press **Check it is running** and you should see the
server's version.

The first `--build` compiles the proof server from source. It clones the pinned
ledger, verifies it (see below) and builds it in debug with optimised
dependencies; budget tens of minutes and a few GB of Docker disk. Every later
`docker compose up -d` starts the existing image in a second.

On first start the server downloads the proving parameters — a few hundred MB —
into a Docker named volume, so the second start is fast too.

## Stopping it, and removing every trace

```sh
docker compose down                 # stop and remove the container
docker compose down -v --rmi local  # …and the parameter volume and the image
```

`down -v --rmi local` removes exactly what this compose file created and
nothing else. It does not touch your Docker build cache and it does not touch
any other container on the machine.

## Options

All of these are environment variables read by `docker compose`:

| variable | default | what it does |
| --- | --- | --- |
| `PROOF_SERVER_PORT` | `6300` | host port. Published on `127.0.0.1` only — never on your LAN. If you change it, change the URL in the page to match. |
| `MIDNIGHT_PARAMS_DIR` | a named volume | absolute path to a parameter cache you already have, e.g. `$HOME/.cache/midnight/zk-params`. Reusing one skips the download entirely. |
| `PARAMS_MOUNT_MODE` | `rw` | set to `ro` to mount your cache read-only. Only sensible together with the next one. |
| `PROOF_SERVER_NO_FETCH_PARAMS` | `false` | `true` makes the server refuse to fetch anything: it uses the mounted cache or fails loudly. |

Reusing an existing cache, read-only, offline:

```sh
MIDNIGHT_PARAMS_DIR="$HOME/.cache/midnight/zk-params" \
PARAMS_MOUNT_MODE=ro \
PROOF_SERVER_NO_FETCH_PARAMS=true \
  docker compose up -d
```

## What the page sends it, and what it does not

Two `POST`s per Create run:

| endpoint | body |
| --- | --- |
| `POST /prove-tx` | the unproven transaction — the spend's proof preimage and the anchor output |
| `POST /prove` | the memo companion preimage, with the memo bytes, so the server can prove the statement whose binding input is `MemoHashV1(memo)` |

It never sends the seed or any secret key. The repository's test suite asserts
that by scanning both request bodies for the raw seed bytes and the raw coin
secret key at the protocol level, not by reading the code.

The page also calls `GET /health` and `GET /version` behind the **Check it is
running** button.

## Why this image is "the pinned proof server" and not just "a proof server"

The build **fails** unless all three of these hold:

1. the checkout is exactly `32fdefc3cb310a823b9bd04fc13ab4c66a92cae3` on branch
   `00003-spend-proof-memo-binding` of `github.com/acedward/midnight-ledger` —
   the same commit `vendor/PROVENANCE.md` records for the WASM bundle;
2. the working tree is clean;
3. `git diff 4823b5351b17cc49e30f19760dbd30a73cf95e22 HEAD -- proof-server/`
   is **empty**.

The third is the one that matters. The fork branch adds memo helpers under
`zswap/`, `zkir-wasm/` and `ledger-wasm/`; it touches nothing under
`proof-server/`. Asserting that at build time turns "this is the upstream proof
server at tag `ledger-9.1.0.0-rc.3`" from a claim into a property of the image.
If the branch ever grows a commit that edits the proof server, this image stops
building rather than quietly becoming something else.

Read the record out of a running container:

```sh
docker compose exec proof-server cat /PROVENANCE.txt
```

## No CORS sidecar, and why

The page is served from one origin and the proof server listens on another, so
every `POST /prove` is a genuine cross-origin request with a preflight —
`Content-Type: application/octet-stream` is not CORS-safelisted, so the
`OPTIONS` round trip really happens.

It works without any proxy in front. The pinned server wraps its app in
`Cors::permissive()` (`proof-server/src/lib.rs`), and a real browser at this
commit was measured receiving:

```
access-control-allow-origin: <the page's exact origin>   # reflected, not *
access-control-allow-methods: …, POST, …
access-control-allow-headers: content-type
access-control-allow-credentials: true
access-control-max-age: 3600
vary: Origin, Access-Control-Request-Method, Access-Control-Request-Headers
```

An **https** page may also call `http://localhost` — `localhost` is a
potentially-trustworthy origin and is exempt from mixed-content blocking — so
this works from a deployed site against a proof server on your own machine.
That was measured too, in four browser configurations.

A CORS-forwarding sidecar was prototyped and is deliberately **not** shipped:
it would be a second thing to run, for a problem that does not exist here.

## Building the image without compose

If you would rather not use compose:

```sh
docker build -f docker/Dockerfile.proofserver -t web-memo-proofserver:32fdefc3 docker/

docker run --rm -d --name web-memo-proof-server \
  -p 127.0.0.1:6300:6300 \
  -v "$HOME/.cache/midnight/zk-params:/params" \
  -e MIDNIGHT_PP=/params \
  web-memo-proofserver:32fdefc3

docker rm -f web-memo-proof-server     # when you are done
```

The build context is this directory only; the Dockerfile clones the pinned
ledger itself, so nothing outside the repository is needed.

## Troubleshooting

| symptom | cause |
| --- | --- |
| `Check it is running` fails from an https page | the URL must be `http://localhost:PORT` or `http://127.0.0.1:PORT`. Some browsers treat the two differently for local-network permission prompts; try `localhost` first. |
| the container restarts in a loop on first start | it is almost certainly still downloading parameters. `docker compose logs -f proof-server`. |
| `PROOF_SERVER_NO_FETCH_PARAMS=true` and proving fails | the mounted cache does not have every file this circuit needs. Run once without it so the server can fetch. |
| the build fails at one of the three assertions | that is the image working as intended — the pins in `compose.yaml` no longer describe the tree they point at. |
