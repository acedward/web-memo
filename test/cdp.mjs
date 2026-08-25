/**
 * cdp.mjs — a minimal, dependency-free Chrome DevTools Protocol driver.
 *
 * Why not puppeteer/playwright: the point of this suite is that the page works
 * in a REAL browser, and that claim is not improved by a wrapper — but a 300 MB
 * dependency tree in a repo whose whole value proposition is auditable
 * provenance is a real cost. Node 22+ ships a global WHATWG `WebSocket`, which
 * is all a CDP client needs, so this is ~200 lines of message plumbing.
 *
 * Chrome is launched against a THROWAWAY user-data-dir, so the developer's own
 * profile is never opened, read, or written.
 */

import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
];

export function findChrome() {
    const explicit = process.env.CHROME_BIN;
    if (explicit) {
        if (!fs.existsSync(explicit)) throw new Error(`CHROME_BIN does not exist: ${explicit}`);
        return explicit;
    }
    for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
    throw new Error('No Chrome/Chromium found. Set CHROME_BIN to its path.');
}

function chromeVersion(binary) {
    try {
        return execFileSync(binary, ['--version'], { encoding: 'utf8' }).trim();
    } catch {
        return '(unknown)';
    }
}

export async function launchChrome(extraArgs = []) {
    const binary = findChrome();
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'web-memo-cdp-'));
    const proc = spawn(
        binary,
        [
            '--headless=new',
            '--remote-debugging-port=0',
            `--user-data-dir=${userDataDir}`,
            '--no-first-run',
            '--no-default-browser-check',
            '--disable-gpu',
            '--disable-dev-shm-usage',
            // Keep the throwaway profile inert: no sync, no reporting, no
            // background fetches. That matters for the airplane test — a
            // browser-initiated background request would be indistinguishable
            // from one the page made.
            '--disable-background-networking',
            '--disable-component-update',
            '--disable-sync',
            '--metrics-recording-only',
            '--no-pings',
            ...extraArgs,
        ],
        { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    const wsUrl = await new Promise((resolve, reject) => {
        let buf = '';
        const timer = setTimeout(() => reject(new Error(`Chrome did not report a DevTools endpoint.\n${buf}`)), 30000);
        proc.stderr.on('data', (d) => {
            buf += d.toString();
            const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
            if (m) { clearTimeout(timer); resolve(m[1]); }
        });
        proc.on('exit', (code) => { clearTimeout(timer); reject(new Error(`Chrome exited early with code ${code}\n${buf}`)); });
    });

    return { proc, wsUrl, userDataDir, binary, version: chromeVersion(binary) };
}

export class Cdp {
    constructor(ws) {
        this.ws = ws;
        this.nextId = 1;
        this.pending = new Map();
        this.listeners = [];
        ws.addEventListener('message', (ev) => {
            const msg = JSON.parse(ev.data);
            if (msg.id !== undefined) {
                const p = this.pending.get(msg.id);
                if (p) {
                    this.pending.delete(msg.id);
                    if (msg.error) p.reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data ?? null)})`));
                    else p.resolve(msg.result);
                }
            } else {
                for (const l of this.listeners) l(msg);
            }
        });
    }

    static async connect(wsUrl) {
        const ws = new WebSocket(wsUrl);
        await new Promise((resolve, reject) => {
            ws.addEventListener('open', resolve, { once: true });
            ws.addEventListener('error', () => reject(new Error(`could not connect to ${wsUrl}`)), { once: true });
        });
        return new Cdp(ws);
    }

    on(fn) { this.listeners.push(fn); }

    send(method, params = {}, sessionId) {
        const id = this.nextId++;
        const msg = { id, method, params };
        if (sessionId) msg.sessionId = sessionId;
        this.ws.send(JSON.stringify(msg));
        return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
    }

    close() { try { this.ws.close(); } catch { /* already gone */ } }
}

export async function newPage(cdp) {
    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    return { sessionId, targetId };
}

/** Collect console output, page errors and network events for one session. */
export function collect(cdp, sessionId) {
    const bucket = { console: [], errors: [], requests: [], failures: [] };
    cdp.on((msg) => {
        if (msg.sessionId !== sessionId) return;
        const p = msg.params || {};
        switch (msg.method) {
            case 'Runtime.consoleAPICalled':
                bucket.console.push({ type: p.type, text: (p.args || []).map((a) => (a.value !== undefined ? String(a.value) : a.description || a.type)).join(' ') });
                break;
            case 'Log.entryAdded':
                bucket.console.push({ type: `log:${p.entry.level}`, text: p.entry.text, url: p.entry.url });
                break;
            case 'Runtime.exceptionThrown':
                bucket.errors.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || 'exception');
                break;
            case 'Network.requestWillBeSent':
                bucket.requests.push({ url: p.request.url, method: p.request.method, at: Date.now() });
                break;
            case 'Network.loadingFailed':
                bucket.failures.push({ errorText: p.errorText, blockedReason: p.blockedReason });
                break;
            default:
                break;
        }
    });
    return bucket;
}

/** Evaluate an expression in the page, awaiting a returned promise. */
export async function evaluate(cdp, sessionId, expression, timeoutMs = 300000) {
    const r = await cdp.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise: true, timeout: timeoutMs },
        sessionId,
    );
    if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text || 'evaluate threw');
    }
    return r.result?.value;
}

/** Navigate, then poll until `predicateExpression` evaluates truthy. */
export async function navigateAndWait(cdp, sessionId, url, predicateExpression, { timeoutMs = 180000, pollMs = 150 } = {}) {
    await cdp.send('Page.navigate', { url }, sessionId);
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const r = await cdp.send('Runtime.evaluate', { expression: predicateExpression, returnByValue: true }, sessionId);
        if (r?.result?.value) return true;
        if (Date.now() > deadline) return false;
        await new Promise((res) => setTimeout(res, pollMs));
    }
}

export async function shutdown(chrome, cdp) {
    try { cdp?.close(); } catch { /* ignore */ }
    try { chrome?.proc?.kill('SIGTERM'); } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 300));
    try { chrome?.proc?.kill('SIGKILL'); } catch { /* ignore */ }
    try { if (chrome?.userDataDir) fs.rmSync(chrome.userDataDir, { recursive: true, force: true }); } catch { /* ignore */ }
}
