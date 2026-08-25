/**
 * read-matrix.mjs — the Read section's acceptance suite.
 *
 * Runs the built `dist/` in a REAL headless Chrome, exactly as Cloudflare Pages
 * would serve it, and drives the page's own entry points. Three phases:
 *
 *   1. the page comes up and reproduces 00003's frozen `MemoHashV1` vectors;
 *   2. the tamper matrix (`test/inpage-matrix.js`), executed in the page;
 *   3. the AIRPLANE TEST — every network request the browser makes is recorded,
 *      the log is reset once the artifacts are already in memory, and a full
 *      add-and-verify cycle must produce ZERO requests.
 *
 * Phase 3 is the one that cannot be faked by reading the source: "no network
 * during verification" is a claim about behaviour, so it is measured at the
 * protocol level rather than asserted.
 *
 *   usage:  node test/read-matrix.mjs          (expects `npm run build` first)
 *           CHROME_BIN=/path/to/chrome node test/read-matrix.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Cdp, collect, evaluate, launchChrome, navigateAndWait, newPage, shutdown } from './cdp.mjs';
import { freePort, serve } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');

const results = [];
function check(id, what, pass, detail = '') {
    results.push({ id, what, pass: !!pass, detail: String(detail).slice(0, 400) });
}

async function main() {
    if (!fs.existsSync(path.join(DIST, 'index.html'))) {
        throw new Error(`dist/ is not built. Run "npm run build" first (looked in ${DIST}).`);
    }

    const port = await freePort();
    const server = await serve(DIST, port);
    const origin = `http://127.0.0.1:${port}`;
    console.log(`serving dist/ on ${origin} (port verified free before binding)`);

    const chrome = await launchChrome();
    console.log(`browser: ${chrome.version}`);
    const cdp = await Cdp.connect(chrome.wsUrl);
    const { sessionId } = await newPage(cdp);
    const events = collect(cdp, sessionId);

    let exitCode = 1;
    try {
        // ---------------------------------------------------------- phase 1
        const up = await navigateAndWait(
            cdp,
            sessionId,
            `${origin}/index.html`,
            'Boolean(window.__WEBMEMO_SELFTEST__ && window.__WEBMEMO_READ__)',
            { timeoutMs: 120000 },
        );
        check('S0', 'the page loads and mounts the Read section in a real browser', up);
        if (!up) throw new Error('the page never mounted');

        const selftest = await evaluate(cdp, sessionId, 'JSON.stringify(window.__WEBMEMO_SELFTEST__)');
        const st = JSON.parse(selftest);
        check('S1', 'the vendored WASM reproduces both frozen MemoHashV1 vectors byte-exactly',
            st.ok && st.checks.every((c) => c.pass), JSON.stringify(st.checks));
        check('S2', 'all 14 memo bindings are present',
            st.memoPresent === 14 && st.memoExpected === 14, `${st.memoPresent}/${st.memoExpected}`);
        check('S3', 'no uncaught page errors while loading', events.errors.length === 0, events.errors.join(' | '));

        // ---------------------------------------------------------- phase 2
        const matrixSource = fs.readFileSync(path.join(HERE, 'inpage-matrix.js'), 'utf8');
        const matrix = await evaluate(cdp, sessionId, matrixSource, 600000);
        if (!matrix) throw new Error('the in-page matrix returned nothing');
        for (const c of matrix.checks) check(c.id, c.what, c.pass, c.detail);
        if (matrix.error) check('MATRIX', 'the in-page matrix ran to completion', false, matrix.error);

        // ---------------------------------------------------------- phase 3
        // Everything the verify path needs is already in the page's memory
        // (`window.__AIRPLANE__`), so any request seen from here is one the
        // verification itself made.
        const marker = events.requests.length;
        const airplane = await evaluate(cdp, sessionId, `
            (() => {
                const api = window.__WEBMEMO_READ__;
                const { refTx, refWrap } = window.__AIRPLANE__;
                api.clear();
                api.addBytes(refTx, 'reference.offer-tx.bin');
                const s = api.addBytes(refWrap, 'reference.wrapper.bin');
                const v = api.verify();
                return JSON.stringify({ state: v.items[0].state, memoHex: v.items[0].memoHex, rendered: v.renderedMemoCount });
            })()
        `);
        // Give any straggling request a moment to be reported before counting.
        await new Promise((r) => setTimeout(r, 750));
        const during = events.requests.slice(marker);
        const air = JSON.parse(airplane);
        check('N1', 'a full parse+verify+render cycle authenticates the memo',
            air.state === 'AuthenticatedWithMatchingAnchorUnconfirmed' && air.rendered === 1, JSON.stringify(air));
        check('N2', 'AIRPLANE TEST — zero network requests during verification',
            during.length === 0, during.map((r) => `${r.method} ${r.url}`).join(' | ') || 'none');

        // Everything the page ever fetched must have been same-origin: a page
        // that reaches a third party at load time is not offline-verifiable
        // however quiet it is later.
        const foreign = events.requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith('data:'));
        check('N3', 'every request the page ever made was same-origin',
            foreign.length === 0, foreign.map((r) => r.url).join(' | ') || 'none');

        // Optional: a full-page screenshot of the reference result, for evidence.
        if (process.env.SCREENSHOT_DIR) {
            await evaluate(cdp, sessionId, "window.__WEBMEMO_READ__.loadExample('reference')", 120000);
            const metrics = await cdp.send('Page.getLayoutMetrics', {}, sessionId);
            const shot = await cdp.send('Page.captureScreenshot', {
                format: 'png',
                captureBeyondViewport: true,
                clip: {
                    x: 0, y: 0,
                    width: Math.ceil(metrics.cssContentSize.width),
                    height: Math.min(Math.ceil(metrics.cssContentSize.height), 8000),
                    scale: 1,
                },
            }, sessionId);
            const outPath = path.join(process.env.SCREENSHOT_DIR, 'read-reference.png');
            fs.mkdirSync(process.env.SCREENSHOT_DIR, { recursive: true });
            fs.writeFileSync(outPath, Buffer.from(shot.data, 'base64'));
            console.log(`screenshot: ${outPath}`);
        }

        const consoleErrors = events.console.filter((c) => /error/i.test(c.type) && !/favicon/i.test(c.text));
        check('N4', 'no console errors', consoleErrors.length === 0, consoleErrors.map((c) => c.text).join(' | '));
        check('N5', 'no uncaught page errors across the whole run',
            events.errors.length === 0, events.errors.join(' | '));

        exitCode = results.every((r) => r.pass) ? 0 : 1;
    } finally {
        await shutdown(chrome, cdp);
        server.close();
    }

    // ------------------------------------------------------------- report
    const pass = results.filter((r) => r.pass).length;
    const fail = results.length - pass;
    console.log('');
    for (const r of results) {
        console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.id.padEnd(6)} ${r.what}${r.detail ? `\n              ${r.detail}` : ''}`);
    }
    console.log(`\n${pass} passed, ${fail} failed, ${results.length} total`);
    process.exit(exitCode);
}

main().catch((err) => {
    console.error(err);
    process.exit(2);
});
