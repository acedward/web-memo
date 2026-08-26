/**
 * read-matrix.mjs — the Read section's acceptance suite.
 *
 * Runs the built `dist/` in a REAL headless Chrome, exactly as Cloudflare Pages
 * would serve it, and drives the page's own entry points. Six phases:
 *
 *   1. the page comes up and reproduces 00003's frozen `MemoHashV1` vectors;
 *   2. the tamper matrix (`test/inpage-matrix.js`), executed in the page —
 *      which since post-v1 iteration 1 also covers the two Read modes and the
 *      bundled demo-transaction list;
 *   3. the AIRPLANE TEST — every network request the browser makes is recorded,
 *      the log is reset once the artifacts are already in memory, and a full
 *      add-and-verify cycle must produce ZERO requests;
 *   4. the proof-server instructions: the command block the page shows must
 *      start at `git clone` and name the repository's REAL origin;
 *   5. the two-column layout, measured at a desktop and at a phone width;
 *   6. the DOM-building discipline, asserted against the source AND the bundle.
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
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Cdp, collect, evaluate, launchChrome, navigateAndWait, newPage, shutdown } from './cdp.mjs';
import { freePort, serve } from './serve.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const DIST = path.join(ROOT, 'dist');

/** The checkout's own origin, with the clone suffix normalised away. */
function originUrl() {
    try {
        return execFileSync('git', ['-C', ROOT, 'remote', 'get-url', 'origin'], { encoding: 'utf8' })
            .trim().replace(/\.git$/, '').replace(/\/$/, '');
    } catch {
        return null;
    }
}

/** Resize the viewport for a layout measurement, and read both columns back. */
async function measureColumns(cdp, sessionId, width, height) {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
        width, height, deviceScaleFactor: 1, mobile: false,
    }, sessionId);
    // Let the layout settle before measuring it.
    await new Promise((r) => setTimeout(r, 250));
    return JSON.parse(await evaluate(cdp, sessionId, `
        (() => {
            const box = (id) => {
                const n = document.getElementById(id);
                if (!n) return null;
                const r = n.getBoundingClientRect();
                return { left: Math.round(r.left), top: Math.round(r.top + window.scrollY), width: Math.round(r.width), height: Math.round(r.height) };
            };
            return JSON.stringify({
                create: box('col-create'),
                read: box('col-read'),
                columns: Boolean(document.querySelector('.columns')),
                createInside: Boolean(document.querySelector('#col-create #create')),
                readInside: Boolean(document.querySelector('#col-read #read')),
                innerWidth: window.innerWidth,
                scrollWidth: document.documentElement.scrollWidth,
            });
        })()
    `));
}

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

        // ---------------------------------------------------------- phase 4
        // The proof-server instructions have to be complete — a reader with
        // nothing must be able to copy them in order — and they have to name
        // THIS repository. The expected text is built from the checkout's own
        // git origin, so renaming the repo breaks the suite, not the reader.
        const origin_url = originUrl();
        const expectedCommands = [
            `git clone ${origin_url}`,
            'cd web-memo/docker',
            'docker compose up -d --build',
        ].join('\n');
        const shown = await evaluate(cdp, sessionId, `
            (() => { const n = document.getElementById('proof-server-commands'); return n ? n.textContent : null; })()
        `);
        check('R0', 'the checkout has an origin, and it is the acedward repository (never midnightntwrk)',
            Boolean(origin_url) && /^https:\/\/github\.com\/acedward\/web-memo$/.test(origin_url) && !/midnightntwrk/i.test(origin_url),
            String(origin_url));
        check('R1', 'the page shows the COMPLETE command sequence, starting at git clone, matching the real origin verbatim',
            shown === expectedCommands, JSON.stringify(shown));
        check('R2', 'the command block has a copy button next to it',
            await evaluate(cdp, sessionId, `Boolean(document.querySelector('[data-copy="proof-server-commands"]'))`));
        check('R3', 'the surrounding guidance survived: leave the URL as it is, docker/README.md, the default port',
            await evaluate(cdp, sessionId, `
                (() => {
                    const t = document.getElementById('create').textContent;
                    return t.includes('leave the URL above as it is')
                        && t.includes('docker/README.md')
                        && t.includes('proof server’s own default port');
                })()
            `));
        const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
        check('R4', 'the README\'s "Using Create" step 1 carries the same clone-first sequence',
            expectedCommands.split('\n').every((line) => readme.includes(line)),
            expectedCommands.split('\n').filter((line) => !readme.includes(line)).join(' | ') || 'all three lines present');

        // ---------------------------------------------------------- phase 5
        // The two columns. Measured, not asserted from the stylesheet: a media
        // query that never fires reads perfectly well in a diff.
        const desktop = await measureColumns(cdp, sessionId, 1440, 900);
        check('L0', 'both sections live in the two-column grid, each with its own mount point',
            desktop.columns && desktop.createInside && desktop.readInside,
            JSON.stringify({ columns: desktop.columns, createInside: desktop.createInside, readInside: desktop.readInside }));
        check('L1', 'at 1440px Create is the LEFT column and Read is the RIGHT one, side by side',
            desktop.create && desktop.read &&
            desktop.create.left < desktop.read.left &&
            Math.abs(desktop.create.top - desktop.read.top) <= 2 &&
            desktop.create.width > 300 && desktop.read.width > 300,
            JSON.stringify({ create: desktop.create, read: desktop.read }));
        check('L2', 'at 1440px nothing forces the page to scroll sideways',
            desktop.scrollWidth <= desktop.innerWidth + 1,
            `scrollWidth ${desktop.scrollWidth} vs innerWidth ${desktop.innerWidth}`);

        const narrow = await measureColumns(cdp, sessionId, 480, 900);
        check('L3', 'at 480px the two columns STACK — same left edge, one entirely above the other',
            narrow.create && narrow.read &&
            narrow.create.left === narrow.read.left &&
            (narrow.read.top + narrow.read.height <= narrow.create.top ||
             narrow.create.top + narrow.create.height <= narrow.read.top),
            JSON.stringify({ create: narrow.create, read: narrow.read }));
        check('L4', 'at 480px the page still does not scroll sideways, despite 16 000-character artifacts',
            narrow.scrollWidth <= narrow.innerWidth + 1,
            `scrollWidth ${narrow.scrollWidth} vs innerWidth ${narrow.innerWidth}`);
        check('L5', 'stacked, Read comes first — the column that works without a proof server',
            narrow.read.top < narrow.create.top,
            `read top ${narrow.read.top}, create top ${narrow.create.top}`);
        await cdp.send('Emulation.clearDeviceMetricsOverride', {}, sessionId);

        // ---------------------------------------------------------- phase 6
        // The inert-rendering discipline is a property of the code, not only of
        // one rendered memo: `lib/dom.js` must stay the only DOM builder and it
        // must keep refusing the attributes that turn text into navigation or
        // execution. Asserted in the SOURCE and in the shipped BUNDLE.
        const srcFiles = [];
        (function walk(dir) {
            for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
                const p = path.join(dir, entry.name);
                if (entry.isDirectory()) walk(p);
                else if (entry.name.endsWith('.js')) srcFiles.push(p);
            }
        })(path.join(ROOT, 'src'));
        const UNSAFE = /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML\s*\(|document\.write\s*\(|createContextualFragment\s*\(/;
        const offenders = srcFiles.filter((f) => UNSAFE.test(fs.readFileSync(f, 'utf8')));
        check('X1', 'no file under src/ writes markup: no innerHTML, outerHTML, insertAdjacentHTML or document.write',
            offenders.length === 0, offenders.map((f) => path.relative(ROOT, f)).join(' | ') || `${srcFiles.length} files scanned`);
        const domSrc = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'dom.js'), 'utf8');
        check('X2', 'lib/dom.js still refuses href/src/on*/style/action/xlink attributes',
            /FORBIDDEN_ATTR\s*=\s*\/\^\(on\|href\$\|src\$\|xlink:\|formaction\$\|action\$\|style\$\)\/i/.test(domSrc) &&
            /throw new Error\(`dom\.el refuses to set the attribute/.test(domSrc),
            'guard present in source');
        const bundle = fs.readFileSync(path.join(DIST, 'main.bundle.js'), 'utf8');
        check('X3', 'that refusal is compiled into the SHIPPED bundle, not just present in source',
            bundle.includes('dom.el refuses to set the attribute'), `${(bundle.length / 1024).toFixed(0)} KiB bundle scanned`);

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
