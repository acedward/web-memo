/**
 * ui.js — the Create section's DOM.
 *
 * Tasks 3.2 (memo input), 3.3 (proving flow), 3.4 (artifacts) and 3.5
 * (self-check) meet here. Everything is built through `dom.el`, i.e.
 * `textContent`, exactly as the Read section is — a memo the user typed is no
 * more trusted as markup than one that arrived in a file.
 *
 * The module publishes `window.__WEBMEMO_CREATE__`, which is how the headless
 * e2e drives the page. That hook calls the same functions the buttons do.
 */

import { byteCount, toHex } from '../lib/bytes.js';
import { button, el, fill, row } from '../lib/dom.js';
import { STATE_INFO } from '../read/trust.js';
import { memoView } from '../read/memoview.js';
import { artifactCard, demoDisclaimer } from './artifacts.js';
import { CreateCancelled, STEPS, runCreate } from './build.js';
import { MEMO_MAX_BYTES, measureMemo } from './memo.js';
import {
    DEFAULT_PROOF_SERVER_URL,
    PROVING_CODES,
    checkProofServer,
    loadProofServerUrl,
    saveProofServerUrl,
} from './prover.js';

export function mountCreate(wasm, root) {
    let running = false;
    let controller = null;
    let lastResult = null;
    let lastError = null;
    const progress = new Map();

    // ---------------------------------------------------------------- memo
    const memoInput = el('textarea', {
        id: 'memo-input',
        className: 'paste',
        attrs: {
            rows: '3',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocomplete: 'off',
            placeholder: 'The message to authenticate. 1 to 512 bytes.',
        },
    });
    memoInput.value = 'hello world';

    const memoCounter = el('span', { className: 'muted small', id: 'memo-counter', text: '' });

    let memoMode = 'text';
    const textModeBtn = button('Text (UTF-8)', () => setMemoMode('text'), 'toggle on');
    const hexModeBtn = button('Hex bytes', () => setMemoMode('hex'), 'toggle');
    textModeBtn.id = 'memo-mode-text';
    hexModeBtn.id = 'memo-mode-hex';

    function setMemoMode(mode) {
        memoMode = mode;
        textModeBtn.className = `toggle${mode === 'text' ? ' on' : ''}`;
        hexModeBtn.className = `toggle${mode === 'hex' ? ' on' : ''}`;
        memoInput.placeholder = mode === 'hex'
            ? 'Raw memo bytes as hex pairs, e.g. 68656c6c6f. 1 to 512 bytes.'
            : 'The message to authenticate. 1 to 512 bytes.';
        updateCounter();
    }

    function updateCounter() {
        const m = measureMemo(memoInput.value, memoMode);
        if (m.ok) {
            memoCounter.className = 'muted small';
            memoCounter.textContent =
                `${m.bytes} / ${MEMO_MAX_BYTES} bytes` +
                (m.bytes !== m.chars ? `  (${m.chars.toLocaleString('en-US')} characters — the limit is on BYTES)` : '');
        } else {
            memoCounter.className = 'fail small';
            memoCounter.textContent = m.message;
        }
        createBtn.disabled = running || !m.ok;
    }
    memoInput.addEventListener('input', updateCounter);

    // -------------------------------------------------------- proof server
    const urlInput = el('input', {
        id: 'proof-server-url',
        className: 'urlbox',
        attrs: { type: 'text', spellcheck: 'false', autocomplete: 'off', placeholder: DEFAULT_PROOF_SERVER_URL },
    });
    urlInput.value = loadProofServerUrl();

    const urlStatus = el('span', { className: 'muted small', id: 'proof-server-status', text: '' });

    urlInput.addEventListener('change', () => {
        try {
            urlInput.value = saveProofServerUrl(urlInput.value);
            urlStatus.className = 'muted small';
            urlStatus.textContent = 'Saved in this browser.';
        } catch (err) {
            urlStatus.className = 'fail small';
            urlStatus.textContent = err.message;
        }
    });

    const checkBtn = button('Check it is running', async () => {
        urlStatus.className = 'muted small';
        urlStatus.textContent = 'Checking…';
        try {
            const info = await checkProofServer(urlInput.value);
            urlStatus.className = 'ok small';
            urlStatus.textContent = `Answering at ${info.url}${info.version ? ` — version ${info.version}` : ''}.`;
        } catch (err) {
            urlStatus.className = 'fail small';
            urlStatus.textContent = err.message;
        }
    });
    checkBtn.id = 'check-proof-server';

    // ---------------------------------------------------------------- seed
    let seedMode = 'deterministic';
    const seedSelect = el('select', { id: 'seed-mode', className: 'urlbox' });
    for (const [value, label] of [
        ['deterministic', 'Fixed demo seed (reproducible artifacts)'],
        ['random', 'Random demo seed (different every run)'],
    ]) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        seedSelect.append(option);
    }
    seedSelect.addEventListener('change', () => { seedMode = seedSelect.value; });

    // -------------------------------------------------------------- action
    const createBtn = button('Create the offer and the memo', () => { void start(); }, 'primary');
    createBtn.id = 'create-run';
    const cancelBtn = button('Cancel', () => cancel());
    cancelBtn.id = 'create-cancel';
    cancelBtn.hidden = true;

    const inputCard = el('div', { className: 'card' }, [
        el('h3', { text: 'The memo' }),
        el('div', { className: 'controls' }, [textModeBtn, hexModeBtn, el('span', { className: 'spacer' }), memoCounter]),
        memoInput,

        el('h3', { text: 'Proving', className: 'spaced' }),
        el('p', { className: 'muted small' }, [
            el('strong', { className: 'warn-text', text: 'The proving payload leaves this browser. ' }),
            el('span', {
                text:
                    'Proofs are made by a proof server, so it receives the witness material for the spend — the coin\'s ' +
                    'nonce and value, and the memo bytes themselves. Your seed and secret keys are NOT in that payload ' +
                    'and never leave this page. Nothing else on this page makes any network request.',
            }),
        ]),
        el('div', { className: 'controls' }, [
            el('label', { className: 'filelabel' }, [el('span', { text: 'Proof server:' }), urlInput]),
            checkBtn,
            el('span', { className: 'spacer' }),
            urlStatus,
        ]),
        el('div', { className: 'controls' }, [
            el('label', { className: 'filelabel' }, [el('span', { text: 'Demo seed:' }), seedSelect]),
        ]),
        el('p', { className: 'muted small' }, [
            el('span', { text: 'No proof server? The repository ships one, pinned to the same ledger commit as this ' +
                'page’s WebAssembly bundle. From a clone: ' }),
            el('span', { className: 'code', text: 'cd docker && docker compose up -d --build' }),
            el('span', {
                text: ' — then leave the URL above as it is. See docker/README.md for the options, ' +
                    'the provenance assertions and how to remove it again. The default above is the proof ' +
                    'server’s own default port.',
            }),
        ]),
        el('div', { className: 'controls' }, [createBtn, cancelBtn]),
    ]);

    const progressCard = el('div', { className: 'card', id: 'create-progress' });
    const errorCard = el('div', { className: 'card error', id: 'create-error' });
    const resultCard = el('div', { id: 'create-result' });

    fill(root, inputCard, progressCard, errorCard, resultCard);
    setMemoMode('text');
    redraw();

    // ------------------------------------------------------------ behaviour
    async function start() {
        if (running) return;
        running = true;
        lastResult = null;
        lastError = null;
        progress.clear();
        controller = new AbortController();
        cancelBtn.hidden = false;
        createBtn.disabled = true;
        redraw();

        try {
            lastResult = await runCreate({
                wasm,
                memoText: memoInput.value,
                memoMode,
                proofServerUrl: urlInput.value,
                seedMode,
                signal: controller.signal,
                onProgress: (update) => {
                    progress.set(update.id, update);
                    renderProgress();
                },
            });
        } catch (err) {
            // Anything that failed leaves NO artifact: `runCreate` returns a
            // complete result or nothing, so there is nothing half-built to
            // clear away here.
            lastResult = null;
            lastError = err instanceof CreateCancelled || err.code === PROVING_CODES.CANCELLED
                ? { code: PROVING_CODES.CANCELLED, message: 'Cancelled. Nothing was produced, and nothing further was sent.' }
                : { code: err.code || 'CREATE_FAILED', message: err.message || String(err) };
        } finally {
            running = false;
            controller = null;
            cancelBtn.hidden = true;
            updateCounter();
            redraw();
        }
        return summarise();
    }

    function cancel() {
        if (controller) controller.abort();
    }

    function redraw() {
        renderProgress();
        renderError();
        renderResult();
    }

    function renderProgress() {
        if (!running && progress.size === 0) {
            progressCard.hidden = true;
            fill(progressCard);
            return;
        }
        progressCard.hidden = false;
        const items = STEPS.map((s) => {
            const state = progress.get(s.id);
            const status = state ? state.status : 'pending';
            const mark = status === 'done' ? '✓' : status === 'running' ? '…' : '·';
            const cls = status === 'done' ? 'ok' : status === 'running' ? 'warn-text' : 'muted';
            return el('li', { className: 'small', dataset: { step: s.id, status } }, [
                el('span', { className: cls, text: `${mark} ` }),
                el('span', { text: s.label }),
                state && state.detail ? el('span', { className: 'muted', text: ` — ${state.detail}` }) : null,
            ]);
        });
        fill(
            progressCard,
            el('h3', { text: running ? 'Working…' : 'What happened' }),
            el('ul', { className: 'steps' }, items),
            running
                ? el('p', {
                    className: 'muted small',
                    text: 'Two proofs are being made, a few seconds each. The page stays usable while it waits — the work is happening on the proof server, not in this tab.',
                })
                : null,
        );
    }

    function renderError() {
        if (!lastError) {
            errorCard.hidden = true;
            fill(errorCard);
            return;
        }
        errorCard.hidden = false;
        fill(
            errorCard,
            el('h3', { text: lastError.code === PROVING_CODES.CANCELLED ? 'Cancelled' : 'That did not work' }),
            el('p', {}, [el('span', { className: 'code', text: lastError.code }), ' ', el('span', { text: lastError.message })]),
            el('p', {
                className: 'muted small',
                text: 'No artifact was produced. This page only shows an offer and a memo wrapper once it has verified the pair itself, so a partial result is never displayed.',
            }),
        );
    }

    function renderResult() {
        if (!lastResult) {
            fill(resultCard);
            return;
        }
        const r = lastResult;
        const info = STATE_INFO[r.selfCheckState];

        fill(
            resultCard,
            demoDisclaimer(r),

            el('div', { className: 'card' }, [
                el('h3', { text: 'This page checked its own work' }),
                el('div', { className: 'state-head' }, [
                    el('span', { className: `pill ${info.tone}`, text: info.label }),
                    el('span', { className: 'muted small', text: 'verified offline, in this browser, under the compiled-in verifier key' }),
                ]),
                el('p', { className: 'small' }, [el('strong', { text: 'What this proves: ' }), el('span', { text: info.proves })]),
                el('p', { className: 'small' }, [el('strong', { text: 'What it does NOT prove: ' }), el('span', { text: info.doesNotProve })]),
                el('p', {
                    className: 'muted small',
                    text:
                        'The pair below was put through the same Read pipeline the section further down uses, before ' +
                        'anything was displayed. A proof server that accepted the memo-hash override and then proved ' +
                        'something else would fail here rather than produce a plausible-looking artifact.',
                }),
                memoView(r.memo, 'The memo, read back out of the wrapper'),
                el('table', {}, [
                    row('bound to input', r.nullifier, 'mono break small'),
                    row('segment', `${r.segment} (guaranteed)`),
                    row('memo-hash', r.h, 'mono break small'),
                    row('memo', `${byteCount(r.memo.length)}`),
                    row('offer file', byteCount(r.artifacts.offer.bytes.length)),
                    row('memo wrapper', byteCount(r.artifacts.wrapper.bytes.length)),
                    row('proving', `transaction ${(r.timings.proveTx / 1000).toFixed(1)} s · companion ${(r.timings.proveCompanion / 1000).toFixed(1)} s · everything else ${r.timings.construct} ms`),
                ]),
            ]),

            artifactCard(r.artifacts.offer, {
                title: 'The offer file',
                what: 'A full proven transaction, the shape MIP-0005 calls an offer file. Any tool that reads offer files can read this one — it does not need to know memos exist.',
                provisional: false,
            }),

            artifactCard(r.artifacts.wrapper, {
                title: 'The memo wrapper',
                what: 'The off-chain container carrying the memo bytes, the companion proof and the binding metadata. Whoever holds this and the offer file can prove what the memo said; whoever holds only the offer file can prove that a memo existed.',
                provisional: true,
            }),

            el('div', { className: 'card' }, [
                el('h3', { text: 'Try it in the Read section' }),
                el('p', {
                    className: 'muted small',
                    text: 'Copy both strings into the Read section below — or into a fresh browser, on another machine, with the network turned off — and the memo should come back authenticated. That round trip is the whole point.',
                }),
                button('Load this pair into Read', () => {
                    const api = window.__WEBMEMO_READ__;
                    if (!api) return;
                    api.clear();
                    api.addBytes(r.artifacts.offer.bytes, 'created here: offer file');
                    api.addBytes(r.artifacts.wrapper.bytes, 'created here: memo wrapper');
                    const target = document.getElementById('read');
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 'primary'),
            ]),
        );
    }

    function summarise() {
        return {
            running,
            error: lastError,
            ok: Boolean(lastResult),
            state: lastResult ? lastResult.selfCheckState : null,
            memoHex: lastResult ? lastResult.memoHex : null,
            h: lastResult ? lastResult.h : null,
            nullifier: lastResult ? lastResult.nullifier : null,
            segment: lastResult ? lastResult.segment : null,
            timings: lastResult ? lastResult.timings : null,
            offerBytes: lastResult ? lastResult.artifacts.offer.bytes.length : null,
            wrapperBytes: lastResult ? lastResult.artifacts.wrapper.bytes.length : null,
            offerBech32m: lastResult ? lastResult.artifacts.offer.bech32m : null,
            wrapperBech32m: lastResult ? lastResult.artifacts.wrapper.bech32m : null,
            offerHex: lastResult ? toHex(lastResult.artifacts.offer.bytes) : null,
            wrapperHex: lastResult ? toHex(lastResult.artifacts.wrapper.bytes) : null,
            seedHex: lastResult ? lastResult.seedHex : null,
            // What the DOM actually shows, so a test can assert that a failed
            // or cancelled run left nothing behind.
            artifactCards: document.querySelectorAll('#create-result .artifact').length,
            artifactTextLengths: Array.from(document.querySelectorAll('#create-result .artifact-text')).map((n) => n.value.length),
            steps: STEPS.map((s) => ({ id: s.id, status: (progress.get(s.id) || {}).status || 'pending' })),
        };
    }

    // The headless e2e drives exactly these.
    window.__WEBMEMO_CREATE__ = {
        setMemo: (text, mode) => { memoInput.value = text; if (mode) setMemoMode(mode); updateCounter(); return measureMemo(text, mode || memoMode); },
        setProofServer: (url) => { urlInput.value = url; try { return saveProofServerUrl(url); } catch (e) { return { error: e.message }; } },
        setSeedMode: (mode) => { seedMode = mode; seedSelect.value = mode; return seedMode; },
        storedProofServer: () => loadProofServerUrl(),
        check: () => checkProofServer(urlInput.value).then((i) => ({ ok: true, ...i }), (e) => ({ ok: false, code: e.code, message: e.message })),
        run: () => start(),
        cancel: () => { cancel(); },
        isRunning: () => running,
        summary: () => summarise(),
        result: () => lastResult,
    };
}
