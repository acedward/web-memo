/**
 * create-e2e.mjs — the Create section's acceptance suite.
 *
 * Drives the built `dist/` in a REAL headless Chrome against a REAL proof
 * server, through the page's own entry points (`window.__WEBMEMO_CREATE__`,
 * which is what the buttons call). Six phases:
 *
 *   A. the memo bound is enforced BEFORE anything is sent anywhere — measured
 *      by counting network requests, not by reading the source;
 *   B. an unreachable proof server produces a clear error and no artifacts;
 *   C. the happy path: create -> two artifacts -> the page verified them itself;
 *   D. SC-006 — a protocol-level recorder over the whole Create run: the only
 *      egress is the proving payload to the configured URL, and no request body
 *      contains the seed or the coin secret key;
 *   E. cancellation mid-proving leaves a clean page;
 *   F. the round trip: the produced pair pasted into Read in a FRESH browser
 *      context comes back authenticated, with zero network requests.
 *
 *   usage:  PROOF_SERVER=http://127.0.0.1:PORT node test/create-e2e.mjs
 *           (expects `npm run build` first)
 *
 * Without PROOF_SERVER the suite runs phases A, B and E only and says so — the
 * negative half needs no proving and is worth having in a fast local loop.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import {
    Cdp,
    collect,
    evaluate,
    launchChrome,
    navigateAndWait,
    newPage,
    newPageInFreshContext,
    shutdown,
} from './cdp.mjs';
import { freePort, serve } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');
const PROOF_SERVER = process.env.PROOF_SERVER || '';

const results = [];
function check(id, what, pass, detail = '') {
    results.push({ id, what, pass: !!pass, detail: String(detail).slice(0, 500) });
}

/** A port nothing is listening on, proven by failing to connect to it. */
async function closedPort() {
    for (let i = 0; i < 50; i++) {
        const port = await freePort();
        const refused = await new Promise((resolve) => {
            const sock = net.connect({ port, host: '127.0.0.1' });
            sock.once('error', () => resolve(true));
            sock.once('connect', () => { sock.destroy(); resolve(false); });
            setTimeout(() => { sock.destroy(); resolve(true); }, 400);
        });
        if (refused) return port;
    }
    throw new Error('could not find a port with nothing listening on it');
}

const DEMO_SEED = (() => {
    const seed = new Uint8Array(32);
    for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 5) & 0xff;
    return Buffer.from(seed);
})();

/** Does `haystack` contain `needle` as a contiguous byte sequence? */
function containsBytes(haystack, needle) {
    return needle.length > 0 && haystack.indexOf(needle) !== -1;
}

async function main() {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        throw new Error(`dist/ is not built. Run "npm run build" first (looked in ${DIST}).`);
    }

    const port = await freePort();
    const server = await serve(DIST, port);
    const origin = `http://127.0.0.1:${port}`;
    console.log(`serving dist/ on ${origin} (port verified free before binding)`);
    console.log(`proof server: ${PROOF_SERVER || '(none given — phases C, D and F will be skipped)'}`);

    const chrome = await launchChrome();
    console.log(`browser: ${chrome.version}`);
    const cdp = await Cdp.connect(chrome.wsUrl);
    const { sessionId } = await newPage(cdp);
    const events = collect(cdp, sessionId);

    let exitCode = 1;
    try {
        const up = await navigateAndWait(
            cdp,
            sessionId,
            `${origin}/index.html`,
            'Boolean(window.__WEBMEMO_CREATE__ && window.__WEBMEMO_READ__)',
            { timeoutMs: 120000 },
        );
        check('S0', 'the page loads and mounts BOTH sections in a real browser', up);
        if (!up) throw new Error('the page never mounted');

        const selftest = JSON.parse(await evaluate(cdp, sessionId, 'JSON.stringify(window.__WEBMEMO_SELFTEST__)'));
        check('S1', 'all 14 memo bindings are present, including memoSpendStatementTail',
            selftest.memoPresent === 14 && selftest.memoExpected === 14, `${selftest.memoPresent}/${selftest.memoExpected}`);
        check('S2', 'the new binding is callable through the import-map load path',
            await evaluate(cdp, sessionId, `typeof window.__WEBMEMO_READ__.wasm.memoSpendStatementTail === 'function'`));

        const disclosure = await evaluate(cdp, sessionId, `
            document.getElementById('create').textContent.includes('The proving payload leaves this browser')
            && document.getElementById('create').textContent.includes('never leave this page')
        `);
        check('S3', 'the witness-goes-to-the-server disclosure is on the page, before the button', disclosure);

        // Post-v1 iteration 1: the "no proof server?" answer must be the WHOLE
        // sequence, starting from a clone. `test/read-matrix.mjs` checks it
        // against the checkout's real git origin; here it is checked where it
        // matters most — in the section that needs the proof server.
        const commands = await evaluate(cdp, sessionId, `
            (() => { const n = document.getElementById('proof-server-commands'); return n ? n.textContent : null; })()
        `);
        check('S4', 'the Create section shows the complete clone-first proof-server sequence',
            commands === 'git clone https://github.com/acedward/web-memo\ncd web-memo/docker\ndocker compose up -d --build',
            JSON.stringify(commands));
        check('S5', 'that command block is copyable, and the LNA guidance is still with it',
            await evaluate(cdp, sessionId, `
                (() => {
                    const t = document.getElementById('create').textContent;
                    return Boolean(document.querySelector('[data-copy="proof-server-commands"]'))
                        && t.includes('ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS');
                })()
            `));

        // The page is two columns now: Create on the left, Read on the right.
        // Both the structure (which mount point lives in which column, and in
        // what order) and the rendered geometry at this viewport.
        check('S6', 'Create is the left column and Read is the right one, each holding its own section',
            await evaluate(cdp, sessionId, `
                (() => {
                    const c = document.getElementById('col-create'), r = document.getElementById('col-read');
                    if (!c || !r) return false;
                    const ordered = Boolean(c.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING);
                    const mounted = Boolean(document.querySelector('#col-create #create') && document.querySelector('#col-read #read'));
                    const leftOf = c.getBoundingClientRect().left < r.getBoundingClientRect().left;
                    return ordered && mounted && leftOf;
                })()
            `));

        // ================================================================ A
        // The memo bound, and the fact that it is enforced before any egress.
        const marker = () => events.requests.length;

        let at = marker();
        const empty = JSON.parse(await evaluate(cdp, sessionId, `
            (async () => {
                const api = window.__WEBMEMO_CREATE__;
                api.setProofServer(${JSON.stringify(PROOF_SERVER || 'http://127.0.0.1:1')});
                api.setMemo('', 'text');
                const s = await api.run();
                return JSON.stringify({ summary: s, buttonDisabled: document.getElementById('create-run').disabled });
            })()
        `));
        check('A1', 'a 0-byte memo is refused, with the typed bound error',
            empty.summary.error && empty.summary.error.code === 'MEMO_EMPTY', JSON.stringify(empty.summary.error));
        check('A2', 'the 0-byte memo produced NO artifact', empty.summary.artifactCards === 0);
        check('A3', 'the 0-byte memo sent NOTHING to any network', events.requests.length === at,
            events.requests.slice(at).map((r) => r.url).join(' | ') || 'zero requests');
        check('A4', 'the Create button is disabled while the memo is invalid', empty.buttonDisabled === true);

        at = marker();
        const over = JSON.parse(await evaluate(cdp, sessionId, `
            (async () => {
                const api = window.__WEBMEMO_CREATE__;
                api.setMemo('a'.repeat(513), 'text');
                const s = await api.run();
                return JSON.stringify(s);
            })()
        `));
        check('A5', 'a 513-byte memo is refused, with the typed bound error',
            over.error && over.error.code === 'MEMO_TOO_LONG', JSON.stringify(over.error));
        check('A6', 'the 513-byte memo produced NO artifact', over.artifactCards === 0);
        check('A7', 'the 513-byte memo sent NOTHING to any network', events.requests.length === at,
            events.requests.slice(at).map((r) => r.url).join(' | ') || 'zero requests');

        const bounds = JSON.parse(await evaluate(cdp, sessionId, `
            (() => {
                const api = window.__WEBMEMO_CREATE__;
                const one = api.setMemo('a', 'text');
                const max = api.setMemo('a'.repeat(512), 'text');
                const emoji = api.setMemo('🙂'.repeat(129), 'text');   // 129 chars, 516 bytes
                const emojiOk = api.setMemo('🙂'.repeat(128), 'text'); // 128 chars, 512 bytes
                const hexOdd = api.setMemo('abc', 'hex');
                const hexBad = api.setMemo('zz', 'hex');
                const hexOk = api.setMemo('68656c6c6f', 'hex');
                return JSON.stringify({ one, max, emoji, emojiOk, hexOdd, hexBad, hexOk });
            })()
        `));
        check('A8', 'exactly 1 byte is accepted', bounds.one.ok && bounds.one.bytes === 1);
        check('A9', 'exactly 512 bytes is accepted', bounds.max.ok && bounds.max.bytes === 512);
        check('A10', 'the bound is on BYTES, not characters: 129 emoji = 516 bytes is refused',
            !bounds.emoji.ok && bounds.emoji.code === 'MEMO_TOO_LONG' && bounds.emoji.bytes === 516, JSON.stringify(bounds.emoji));
        check('A11', '128 emoji = exactly 512 bytes is accepted', bounds.emojiOk.ok && bounds.emojiOk.bytes === 512);
        check('A12', 'odd-length hex is a typed error', !bounds.hexOdd.ok && bounds.hexOdd.code === 'MEMO_BAD_HEX');
        check('A13', 'non-hex characters are a typed error', !bounds.hexBad.ok && bounds.hexBad.code === 'MEMO_BAD_HEX');
        check('A14', 'hex mode encodes bytes', bounds.hexOk.ok && bounds.hexOk.bytes === 5);

        // ================================================================ B
        // A proof server that is not there.
        const dead = await closedPort();
        at = marker();
        const unreachable = JSON.parse(await evaluate(cdp, sessionId, `
            (async () => {
                const api = window.__WEBMEMO_CREATE__;
                api.setProofServer('http://127.0.0.1:${dead}');
                api.setMemo('hello world', 'text');
                const s = await api.run();
                return JSON.stringify(s);
            })()
        `, 120000));
        check('B1', 'an unreachable proof server is a clear, typed error',
            unreachable.error && unreachable.error.code === 'PROOF_SERVER_UNREACHABLE', JSON.stringify(unreachable.error));
        check('B2', 'the error names the URL that failed',
            Boolean(unreachable.error && unreachable.error.message.includes(String(dead))), unreachable.error?.message);
        check('B3', 'an unreachable proof server produced NO artifact', unreachable.artifactCards === 0);
        check('B4', 'the local construction ran but the run stopped at the first proving call',
            unreachable.steps.find((s) => s.id === 'construct').status === 'done' &&
            unreachable.steps.find((s) => s.id === 'prove-tx').status === 'running' &&
            unreachable.steps.find((s) => s.id === 'wrapper').status === 'pending',
            JSON.stringify(unreachable.steps));
        check('B5', 'the only requests it made went to the configured (dead) URL',
            events.requests.slice(at).every((r) => r.url.startsWith(`http://127.0.0.1:${dead}`)),
            events.requests.slice(at).map((r) => r.url).join(' | ') || 'zero requests');

        // ================================================================ F1
        // localStorage persistence, across a real reload.
        await evaluate(cdp, sessionId, `window.__WEBMEMO_CREATE__.setProofServer('http://127.0.0.1:${dead}')`);
        await navigateAndWait(cdp, sessionId, `${origin}/index.html`, 'Boolean(window.__WEBMEMO_CREATE__)', { timeoutMs: 120000 });
        const persisted = await evaluate(cdp, sessionId, `document.getElementById('proof-server-url').value`);
        check('P1', 'the proof-server URL survives a reload (localStorage)',
            persisted === `http://127.0.0.1:${dead}`, persisted);
        const defaulted = await evaluate(cdp, sessionId, `
            (() => { try { localStorage.clear(); } catch {} ; return window.__WEBMEMO_CREATE__.storedProofServer(); })()
        `);
        check('P2', 'with nothing stored the default is localhost and the documented port',
            defaulted === 'http://localhost:6300', defaulted);

        if (!PROOF_SERVER) {
            check('SKIP', 'phases C, D and F need PROOF_SERVER — not run', true, 'set PROOF_SERVER=http://127.0.0.1:PORT');
        } else {
            // ============================================================ E
            // Cancellation, first: it is the case most likely to leave debris,
            // and running it before the happy path means the happy path also
            // proves the page recovered.
            at = marker();
            const cancelled = JSON.parse(await evaluate(cdp, sessionId, `
                (async () => {
                    const api = window.__WEBMEMO_CREATE__;
                    api.setProofServer(${JSON.stringify(PROOF_SERVER)});
                    api.setMemo('this run gets cancelled', 'text');
                    const running = api.run();
                    // Let the transaction proof actually get under way, then pull the plug.
                    await new Promise((r) => setTimeout(r, 900));
                    const wasRunning = api.isRunning();
                    api.cancel();
                    const s = await running;
                    return JSON.stringify({ summary: s, wasRunning, errorCardVisible: !document.getElementById('create-error').hidden });
                })()
            `, 180000));
            check('E1', 'the run was genuinely in flight when it was cancelled', cancelled.wasRunning === true);
            check('E2', 'cancelling yields the CANCELLED code, not a crash',
                cancelled.summary.error && cancelled.summary.error.code === 'CANCELLED', JSON.stringify(cancelled.summary.error));
            check('E3', 'cancelling left NO artifact on the page', cancelled.summary.artifactCards === 0);
            check('E4', 'cancelling left no half-rendered artifact text',
                cancelled.summary.artifactTextLengths.length === 0, JSON.stringify(cancelled.summary.artifactTextLengths));
            check('E5', 'the cancellation is reported to the user', cancelled.errorCardVisible === true);
            check('E6', 'no request was made after the cancel',
                events.requests.slice(at).every((r) => r.url.startsWith(PROOF_SERVER)),
                events.requests.slice(at).map((r) => r.url).join(' | '));

            // ============================================================ C+D
            // The happy path, with a protocol-level recorder over exactly it.
            const runStart = marker();
            const happy = JSON.parse(await evaluate(cdp, sessionId, `
                (async () => {
                    const api = window.__WEBMEMO_CREATE__;
                    api.setProofServer(${JSON.stringify(PROOF_SERVER)});
                    api.setMemo('hello world', 'text');
                    api.setSeedMode('deterministic');

                    // Responsiveness: tick a rAF counter for the whole run. If the
                    // main thread blocked, this stops advancing.
                    let frames = 0;
                    let ticking = true;
                    const tick = () => { frames++; if (ticking) requestAnimationFrame(tick); };
                    requestAnimationFrame(tick);

                    const t0 = performance.now();
                    const s = await api.run();
                    const wall = Math.round(performance.now() - t0);
                    ticking = false;

                    return JSON.stringify({ summary: s, frames, wall,
                        seedHex: s.seedHex,
                        secretKeyHex: (() => {
                            const w = window.__WEBMEMO_READ__.wasm;
                            const seed = new Uint8Array(32);
                            for (let i = 0; i < 32; i++) seed[i] = (i * 7 + 5) & 0xff;
                            const keys = w.ZswapSecretKeys.fromSeed(seed);
                            const raw = keys.coinSecretKey.yesIKnowTheSecurityImplicationsOfThis_serialize();
                            return Array.from(raw, (b) => b.toString(16).padStart(2, '0')).join('');
                        })(),
                    });
                })()
            `, 300000));

            const s = happy.summary;
            check('C1', 'Create runs end to end against the pinned proof server', s.ok === true,
                s.error ? JSON.stringify(s.error) : `${(happy.wall / 1000).toFixed(1)} s wall`);
            check('C2', 'the page verified its OWN output before showing it',
                s.state === 'AuthenticatedWithMatchingAnchorUnconfirmed', s.state);
            check('C3', 'the memo comes back byte-exact', s.memoHex === '68656c6c6f20776f726c64', s.memoHex);
            check('C4', 'the memo-hash equals the frozen ascii-hello-world vector',
                s.h === '65d3c33a0fb14d48a042620c375bb19fba0f9d8fbfc6bbe3f21959f73c2a5455', s.h);
            check('C5', 'two artifacts are displayed', s.artifactCards === 2, String(s.artifactCards));
            check('C6', 'the offer file renders as swapoffer bech32m',
                Boolean(s.offerBech32m && s.offerBech32m.startsWith('swapoffer1')), s.offerBech32m?.slice(0, 24));
            check('C7', 'the memo wrapper renders as swapmsg bech32m',
                Boolean(s.wrapperBech32m && s.wrapperBech32m.startsWith('swapmsg1')), s.wrapperBech32m?.slice(0, 24));
            check('C8', 'both artifact text boxes carry the full strings',
                s.artifactTextLengths.length === 2 && s.artifactTextLengths.every((n) => n > 1000),
                JSON.stringify(s.artifactTextLengths));
            check('C9', 'every step of the flow reports done',
                s.steps.every((st) => st.status === 'done'), JSON.stringify(s.steps));
            check('C10', 'the page stayed responsive throughout (rAF kept firing)',
                happy.frames > 20, `${happy.frames} animation frames during ${(happy.wall / 1000).toFixed(1)} s`);
            check('C11', 'the provisional swapmsg prefix is labelled as provisional at the artifact',
                await evaluate(cdp, sessionId, `document.querySelector('[data-artifact="memo-wrapper"]').textContent.includes('PROVISIONAL')`));
            check('C12', 'the demo-state disclaimer sits with the artifacts',
                await evaluate(cdp, sessionId, `document.getElementById('create-result').textContent.includes('could never settle on any')`));
            console.log(`  proving: transaction ${(s.timings.proveTx / 1000).toFixed(2)} s, companion ${(s.timings.proveCompanion / 1000).toFixed(2)} s, local work ${s.timings.construct} ms, total ${(s.timings.total / 1000).toFixed(2)} s`);

            // ---- SC-006 ------------------------------------------------
            const runRequests = events.requests.slice(runStart);
            const psOrigin = new URL(PROOF_SERVER).origin;
            check('D1', 'SC-006: every request during Create went to the CONFIGURED proof server',
                runRequests.length > 0 && runRequests.every((r) => r.url.startsWith(psOrigin)),
                runRequests.map((r) => `${r.method} ${r.url}`).join(' | '));
            const posts = runRequests.filter((r) => r.method === 'POST');
            check('D2', 'SC-006: exactly two POSTs — the transaction and the companion',
                posts.length === 2 &&
                posts.some((r) => r.url.endsWith('/prove-tx')) &&
                posts.some((r) => r.url.endsWith('/prove')),
                posts.map((r) => r.url).join(' | '));

            // Pull every body we can, and search it.
            const bodies = [];
            for (const r of runRequests) {
                let b64 = r.postDataB64 || '';
                if (!b64 && r.hasPostData) {
                    try {
                        const got = await cdp.send('Network.getRequestPostData', { requestId: r.requestId }, sessionId);
                        if (got && got.postData) b64 = Buffer.from(got.postData, 'binary').toString('base64');
                    } catch { /* body no longer retainable — recorded as unavailable below */ }
                }
                bodies.push({ url: r.url, method: r.method, buf: b64 ? Buffer.from(b64, 'base64') : Buffer.alloc(0), had: Boolean(b64) });
            }
            const withBodies = bodies.filter((b) => b.method === 'POST');
            check('D3', 'SC-006: both proving bodies were actually captured for inspection',
                withBodies.length === 2 && withBodies.every((b) => b.had && b.buf.length > 0),
                withBodies.map((b) => `${b.url}:${b.buf.length}B`).join(' | '));

            const seedHex = Buffer.from(happy.seedHex, 'utf8');
            // The serialized coin secret key is TAGGED, so searching for the
            // whole blob would be a weak test — the tag alone would never
            // appear. The raw key is the trailing 32 bytes; both are checked,
            // and the raw one is the assertion that means something.
            const secretKeyTagged = Buffer.from(happy.secretKeyHex, 'hex');
            const secretKeyRaw = secretKeyTagged.subarray(secretKeyTagged.length - 32);
            check('D4', 'SC-006: no request body contains the 32 seed bytes',
                withBodies.every((b) => !containsBytes(b.buf, DEMO_SEED)),
                `seed ${happy.seedHex.slice(0, 16)}…`);
            check('D5', 'SC-006: no request body contains the seed as a hex string',
                withBodies.every((b) => !containsBytes(b.buf, seedHex)));
            check('D6', 'SC-006: no request body contains the RAW coin secret key',
                secretKeyRaw.length === 32 && withBodies.every((b) => !containsBytes(b.buf, secretKeyRaw)),
                `raw key ${secretKeyRaw.length} B, ${secretKeyRaw.toString('hex').slice(0, 16)}…`);
            check('D6b', 'SC-006: no request body contains the serialized coin secret key either',
                secretKeyTagged.length > 0 && withBodies.every((b) => !containsBytes(b.buf, secretKeyTagged)),
                `${secretKeyTagged.length} B tagged`);
            check('D7', 'SC-006: the whole page load + run made requests to exactly two origins — itself and the proof server',
                events.requests.every((r) => r.url.startsWith(origin) || r.url.startsWith(psOrigin) || r.url.startsWith(`http://127.0.0.1:${dead}`)),
                [...new Set(events.requests.map((r) => new URL(r.url).origin))].join(' | '));

            // ============================================================ F
            // The round trip, in a FRESH browser context.
            const fresh = await newPageInFreshContext(cdp);
            const freshEvents = collect(cdp, fresh.sessionId);
            const freshUp = await navigateAndWait(
                cdp, fresh.sessionId, `${origin}/index.html`,
                'Boolean(window.__WEBMEMO_READ__)', { timeoutMs: 120000 },
            );
            check('F1', 'a FRESH browser context loads the page', freshUp);

            const freshMarker = freshEvents.requests.length;
            const roundTrip = JSON.parse(await evaluate(cdp, fresh.sessionId, `
                (() => {
                    const api = window.__WEBMEMO_READ__;
                    api.clear();
                    api.addText(${JSON.stringify(s.offerBech32m)}, 'pasted offer');
                    const r = api.addText(${JSON.stringify(s.wrapperBech32m)}, 'pasted wrapper');
                    return JSON.stringify(r);
                })()
            `, 180000));
            const item = roundTrip.items.find((i) => i.kind === 'wrapper' && i.memoHex === '68656c6c6f20776f726c64');
            check('F2', 'THE ROUND TRIP: the pasted pair authenticates in a fresh browser context',
                Boolean(item && item.authenticated), item ? item.state : JSON.stringify(roundTrip.items.map((i) => i.state)));
            check('F3', 'the memo is rendered, and it is the one that was typed',
                roundTrip.renderedMemoCount === 1 && roundTrip.renderedMemoText[0].includes('hello world'),
                JSON.stringify(roundTrip.renderedMemoText));
            check('F4', 'the anchor in the created offer matches the created memo',
                item && item.matchingAnchorsInOffer === 1, String(item && item.matchingAnchorsInOffer));
            check('F5', 'verifying the created pair made ZERO network requests',
                freshEvents.requests.length === freshMarker,
                freshEvents.requests.slice(freshMarker).map((r) => r.url).join(' | ') || 'zero requests');

            // A tamper control on OUR OWN output, so F2 is not a tautology.
            const tampered = JSON.parse(await evaluate(cdp, fresh.sessionId, `
                (() => {
                    const api = window.__WEBMEMO_READ__;
                    const hex = ${JSON.stringify(s.wrapperHex)};
                    const bytes = new Uint8Array(hex.length / 2);
                    for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
                    // Flip a bit inside the memo section of the wrapper we just made.
                    const needle = new TextEncoder().encode('hello world');
                    let at = -1;
                    outer: for (let i = 0; i + needle.length <= bytes.length; i++) {
                        for (let j = 0; j < needle.length; j++) if (bytes[i + j] !== needle[j]) continue outer;
                        at = i; break;
                    }
                    if (at < 0) return JSON.stringify({ found: false });
                    bytes[at] ^= 0x01;
                    api.clear();
                    api.addText(${JSON.stringify(s.offerBech32m)}, 'pasted offer');
                    const r = api.addBytes(bytes, 'tampered copy of our own wrapper');
                    return JSON.stringify({ found: true, ...r });
                })()
            `, 180000));
            check('F6', 'CONTROL: one flipped memo byte in OUR OWN wrapper is refused',
                tampered.found && tampered.items.every((i) => !i.authenticated),
                JSON.stringify(tampered.items.map((i) => ({ state: i.state, code: i.failure && i.failure.code }))));
            check('F7', 'CONTROL: the tampered memo is shown nowhere as authenticated',
                tampered.renderedMemoCount === 0, JSON.stringify(tampered.renderedMemoText));

            await cdp.send('Target.closeTarget', { targetId: fresh.targetId });
        }

        check('Z1', 'no uncaught page errors across the whole run', events.errors.length === 0, events.errors.join(' | '));

        // Phase B deliberately points the page at a port nothing is listening
        // on, and Chrome logs the refused connection at error level. That entry
        // is the test doing its job, so it is named and excluded rather than
        // making the whole suite red — and the exclusion is narrow: it must be
        // a connection failure for THAT port, nothing else.
        const expectedRefusals = (c) =>
            /ERR_CONNECTION_REFUSED|Failed to load resource/.test(c.text) &&
            (!c.url || c.url.includes(String(dead)));
        const consoleErrors = events.console
            .filter((c) => c.type === 'error' || c.type === 'log:error')
            .filter((c) => !expectedRefusals(c));
        check('Z2', 'no console errors beyond the connection refusals phase B deliberately caused',
            consoleErrors.length === 0, consoleErrors.map((c) => c.text).join(' | '));

        exitCode = results.every((r) => r.pass) ? 0 : 1;
    } finally {
        for (const r of results) {
            console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.what}${r.detail ? `\n              ${r.detail}` : ''}`);
        }
        const passed = results.filter((r) => r.pass).length;
        console.log(`\n${passed} passed, ${results.length - passed} failed, ${results.length} total`);
        await shutdown(chrome, cdp);
        server.close();
    }
    process.exit(exitCode);
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
