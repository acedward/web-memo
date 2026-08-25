/**
 * create-artifacts.mjs — run the page's Create flow once and write the pair to
 * disk, so something outside the browser can check the bytes.
 *
 * This is the feed for `acceptance/` — the gate that puts the offer file in
 * front of the PINNED UNMODIFIED ledger. It deliberately produces its artifacts
 * the same way a visitor does: the built `dist/`, served statically, driven
 * through `window.__WEBMEMO_CREATE__` — the same entry point the buttons call —
 * in a real headless Chrome against a real proof server. A gate fed by a
 * hand-assembled transaction would prove nothing about the page.
 *
 *   usage:  PROOF_SERVER=http://127.0.0.1:PORT node test/create-artifacts.mjs <out-dir>
 *           (expects `npm run build` first)
 *
 *   MEMO=…      the memo to commit (default: "hello world", whose memo-hash is
 *               a frozen conformance vector, which is why it is the default)
 *   SEED_MODE=  deterministic (default) | random
 *
 * Writes, into <out-dir>:
 *
 *   offer.bin     the offer file — raw canonical bytes of the proven transaction
 *   wrapper.bin   the memo wrapper — raw canonical bytes
 *   memo.bin      the memo bytes exactly as typed
 *   meta.txt      what the page reported about the run, key: value
 *
 * The page verifies its own output before it displays it, so reaching the point
 * where these files are written already means the pair authenticated in the
 * browser. The gate's job is the other half: whether an unmodified node would
 * take the transaction.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, collect, evaluate, launchChrome, navigateAndWait, newPage, shutdown } from './cdp.mjs';
import { freePort, serve } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');

const PROOF_SERVER = process.env.PROOF_SERVER || '';
const MEMO = process.env.MEMO ?? 'hello world';
const SEED_MODE = process.env.SEED_MODE || 'deterministic';
const OUT = process.argv[2];

function fromHex(hex) {
    const out = Buffer.alloc(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
}

async function main() {
    if (!OUT) throw new Error('usage: PROOF_SERVER=http://host:port node test/create-artifacts.mjs <out-dir>');
    if (!PROOF_SERVER) throw new Error('PROOF_SERVER is required — this script makes REAL proofs');
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        throw new Error(`dist/ is not built. Run "npm run build" first (looked in ${DIST}).`);
    }

    const port = await freePort();
    const server = await serve(DIST, port);
    const origin = `http://127.0.0.1:${port}`;
    console.log(`serving dist/ on ${origin} (port verified free before binding)`);
    console.log(`proof server: ${PROOF_SERVER}`);
    console.log(`memo: ${JSON.stringify(MEMO)} (${Buffer.from(MEMO, 'utf8').length} bytes), seed: ${SEED_MODE}`);

    const chrome = await launchChrome();
    const cdp = await Cdp.connect(chrome.wsUrl);
    const { sessionId } = await newPage(cdp);
    const events = collect(cdp, sessionId);

    let exitCode = 1;
    try {
        const up = await navigateAndWait(
            cdp, sessionId, `${origin}/index.html`,
            'Boolean(window.__WEBMEMO_CREATE__ && window.__WEBMEMO_READ__)',
            { timeoutMs: 120000 },
        );
        if (!up) throw new Error('the page never mounted');
        console.log(`browser: ${chrome.version}`);

        const summary = JSON.parse(await evaluate(cdp, sessionId, `
            (async () => {
                const api = window.__WEBMEMO_CREATE__;
                api.setProofServer(${JSON.stringify(PROOF_SERVER)});
                api.setSeedMode(${JSON.stringify(SEED_MODE)});
                api.setMemo(${JSON.stringify(MEMO)}, 'text');
                return JSON.stringify(await api.run());
            })()
        `, 600000));

        if (!summary.ok) {
            throw new Error(`Create failed: ${JSON.stringify(summary.error)}`);
        }

        fs.mkdirSync(OUT, { recursive: true });
        const offer = fromHex(summary.offerHex);
        const wrapper = fromHex(summary.wrapperHex);
        const memo = Buffer.from(MEMO, 'utf8');
        fs.writeFileSync(path.join(OUT, 'offer.bin'), offer);
        fs.writeFileSync(path.join(OUT, 'wrapper.bin'), wrapper);
        fs.writeFileSync(path.join(OUT, 'memo.bin'), memo);

        const meta = [
            '# Produced by test/create-artifacts.mjs — the page\'s own Create flow,',
            '# driven through window.__WEBMEMO_CREATE__ in a real headless browser.',
            `browser: ${chrome.version}`,
            `proof-server: ${PROOF_SERVER}`,
            `page-origin: ${origin}`,
            `seed-mode: ${SEED_MODE}`,
            `seed-hex: ${summary.seedHex}`,
            `memo-utf8-bytes: ${memo.length}`,
            `memo-hex: ${summary.memoHex}`,
            `memo-hash-h: ${summary.h}`,
            `nullifier: ${summary.nullifier}`,
            `segment: ${summary.segment}`,
            `offer-bytes: ${offer.length}`,
            `wrapper-bytes: ${wrapper.length}`,
            `in-page-self-check-state: ${summary.state}`,
            `prove-tx-ms: ${summary.timings.proveTx}`,
            `prove-companion-ms: ${summary.timings.proveCompanion}`,
            `local-work-ms: ${summary.timings.construct}`,
            `total-ms: ${summary.timings.total}`,
            '',
        ].join('\n');
        fs.writeFileSync(path.join(OUT, 'meta.txt'), meta);

        console.log(meta);
        console.log(`wrote offer.bin (${offer.length} B), wrapper.bin (${wrapper.length} B), memo.bin (${memo.length} B) to ${OUT}`);
        if (events.errors.length) {
            throw new Error(`uncaught page errors: ${events.errors.join(' | ')}`);
        }
        exitCode = 0;
    } finally {
        await shutdown(chrome, cdp);
        server.close();
    }
    process.exit(exitCode);
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
