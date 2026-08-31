/**
 * story/ui.js — the landing walkthrough.
 *
 * Four steps that tell the memo-v3 story on one screen:
 *
 *   1. an ordinary transaction — one input, one output, no message anywhere;
 *   2. the typed message is hashed, and a second statement (transaction′)
 *      takes that hash as a binding input;
 *   3. both statements commit to the hash as an extra output, and each gets
 *      its own proof — Proof-1 by the unmodified Midnight circuit, Proof-2 by
 *      the custom binding circuit;
 *   4. what actually travels: the ordinary transaction with Proof-1, plus a
 *      wrapper carrying Proof-2 and the message.
 *
 * One computation in this walkthrough is real: the hash shown IS `MemoHashV1`
 * of the typed message, produced by the same vendored WASM module the
 * examples verify with. The proofs in the diagrams are illustrative — the
 * Create example makes real ones and the Read example verifies them.
 */

import { el, fill, button } from '../lib/dom.js';
import { toHex } from '../lib/bytes.js';
import { runCreate, STEPS as CREATE_STEPS } from '../create/build.js';
import { loadProofServerUrl, saveProofServerUrl } from '../create/prover.js';
import { artifactCard, demoDisclaimer } from '../create/artifacts.js';
import { STATE_INFO } from '../read/trust.js';

const MEMO_MAX_BYTES = 512;
const STEPS = 4;

/** Shorten a 64-char hex hash for a chip; the full value rides in `title`. */
function shortHex(hex) {
    return `${hex.slice(0, 8)}…${hex.slice(-8)}`;
}

/** Shorten the message for a chip without ever interpreting it as markup. */
function shortText(text) {
    return text.length > 40 ? `${text.slice(0, 37)}…` : text;
}

export function mountStory(wasm, root, { onSeeExamples } = {}) {
    // 0 = type a message; 1 = hash + binding input; 2 = two proofs; 3 = network.
    let stage = 0;
    let messageText = '';
    let messageBytes = new Uint8Array(0);
    let hashHex = '';
    let inputError = null;

    // The REAL run, when the reader asks for it on the proofs step: the whole
    // Create pipeline (demo coin, spend, anchor, two proof-server round trips,
    // wrapper, Read self-check) over exactly the message typed above.
    // `null` until asked; invalidated the moment the message changes.
    let run = null; // { status: 'running'|'done'|'error', stepState, result, error }
    let abort = null;

    const encoder = new TextEncoder();

    function invalidateRun() {
        if (abort) abort.abort();
        abort = null;
        run = null;
    }

    function setMessage(text) {
        const bytes = encoder.encode(text);
        if (bytes.length === 0) {
            inputError = 'Type at least one byte — an empty memo is refused, here and in the format.';
            return { ok: false, error: 'MEMO_EMPTY' };
        }
        if (bytes.length > MEMO_MAX_BYTES) {
            inputError = `That is ${bytes.length} bytes as UTF-8 — the format caps a memo at ${MEMO_MAX_BYTES}.`;
            return { ok: false, error: 'MEMO_TOO_LONG' };
        }
        inputError = null;
        if (text !== messageText) invalidateRun();
        messageText = text;
        messageBytes = bytes;
        hashHex = toHex(wasm.memoHashV1(bytes));
        stage = 1;
        render();
        return { ok: true, hashHex, stage };
    }

    function goto(next) {
        stage = Math.max(0, Math.min(STEPS - 1, next));
        render();
    }

    function reset() {
        invalidateRun();
        stage = 0;
        messageText = '';
        messageBytes = new Uint8Array(0);
        hashHex = '';
        inputError = null;
        render();
    }

    /**
     * The real thing: run the full Create pipeline over the typed message.
     * Resolves when the run has finished either way; the outcome lives in
     * `run` and the current step is re-rendered.
     */
    async function proveForReal(urlRaw) {
        let url;
        try {
            url = saveProofServerUrl(urlRaw);
        } catch (err) {
            run = { status: 'error', stepState: {}, result: null, error: err };
            render();
            return summariseRun();
        }
        abort = new AbortController();
        run = { status: 'running', stepState: {}, result: null, error: null };
        render();
        try {
            const result = await runCreate({
                wasm,
                memoText: messageText,
                memoMode: 'text',
                proofServerUrl: url,
                seedMode: 'deterministic',
                signal: abort.signal,
                onProgress: (u) => {
                    if (!run || run.status !== 'running') return;
                    run.stepState[u.id] = u;
                    repaintChecklist();
                },
            });
            run = { status: 'done', stepState: run.stepState, result, error: null };
        } catch (err) {
            // A run invalidated mid-flight (message changed, reset) stays gone.
            if (run) run = { status: 'error', stepState: run.stepState, result: null, error: err };
        }
        abort = null;
        render();
        return summariseRun();
    }

    function summariseRun() {
        if (!run) return { status: 'none' };
        return {
            status: run.status,
            state: run.result ? run.result.selfCheckState : null,
            error: run.error ? { code: run.error.code || 'ERROR', message: run.error.message } : null,
        };
    }

    // ------------------------------------------------------------- diagrams

    function chip(text, kind, title) {
        const opts = { className: `chip ${kind}`, text };
        if (title) opts.title = title;
        return el('span', opts);
    }

    const inputChip = () => chip('input', 'c-input');
    const output1Chip = () => chip('output-1', 'c-output');
    const memoOutputChip = () => chip('output-2 · Hash(message)', 'c-memo', hashHex);
    const bindingChip = () => chip('binding input · Hash(message)', 'c-binding', hashHex);
    const isReal = () => Boolean(run && run.status === 'done');
    const proof1Chip = () => chip(
        isReal() ? 'Proof-1 · midnight compatible · ✓ real' : 'Proof-1 · midnight compatible',
        isReal() ? 'c-proof1 c-real' : 'c-proof1',
    );
    const proof2Chip = () => chip(
        isReal() ? 'Proof-2 · custom proof · ✓ real' : 'Proof-2 · custom proof',
        isReal() ? 'c-proof2 c-real' : 'c-proof2',
    );
    const messageChip = () => chip(`message · “${shortText(messageText)}”`, 'c-message', messageText);

    /** transaction′'s input slot: the same `input`, carrying the binding inside it. */
    const inputWithBinding = () => el('span', { className: 'input-group' }, [
        el('span', { className: 'input-group-label', text: 'input' }),
        bindingChip(),
    ]);

    const txName = (name) => el('span', { className: 'tx-name', text: `[${name}]` });
    const arrow = () => el('span', { className: 'tx-arrow', text: '⟶' });
    const proofArrow = () => el('span', { className: 'tx-arrow strong', text: '⟹' });

    /**
     * Two transactions in ONE grid, so equal parts sit in equal columns and
     * the eye can diff the rows. `columns` names the cell slots in order; a
     * row missing a slot gets an empty cell, which keeps everything after it
     * aligned. Each row's `note` becomes a full-width caption under it.
     */
    function txGrid(columns, rows) {
        const grid = el('div', { className: `txgrid cols-${columns.length}` });
        for (const row of rows) {
            for (const key of columns) {
                grid.append(row.cells[key] || el('span', { className: 'cell-empty' }));
            }
            if (row.note) grid.append(el('p', { className: 'muted small tx-note', text: row.note }));
        }
        return el('div', { className: 'txgrid-wrap' }, [grid]);
    }

    /** The typed message, kept in view on every step after it exists. */
    function messageStrip() {
        return el('div', { className: 'msg-strip' }, [
            chip(`message · “${messageText}”`, 'c-message', `${messageBytes.length} bytes as UTF-8`),
            chip(`Hash(message) ${shortHex(hashHex)}`, 'c-memo', hashHex),
        ]);
    }

    /**
     * A single free-flowing transaction row (`[name] ⟶ parts (⟹ proof side)`)
     * for the steps that show only one transaction. The steps that show two
     * use `txGrid` below, so equal parts align between the rows.
     */
    function txRow({ name, parts, proof }) {
        const kids = [txName(name), arrow(), ...parts];
        if (proof && proof.length) {
            kids.push(proofArrow());
            kids.push(...proof);
        }
        return el('div', { className: 'txrow' }, kids);
    }

    // ------------------------------------------------------- the real run UI

    let checklistNode = null;

    function checklist() {
        const list = el('ul', { className: 'steps' }, CREATE_STEPS.map((s) => {
            const st = run && run.stepState[s.id];
            const mark = !st ? '○' : st.status === 'running' ? '⋯' : st.status === 'done' ? '✓' : '✗';
            const cls = !st ? 'muted' : st.status === 'done' ? 'ok' : st.status === 'running' ? '' : 'fail';
            return el('li', {}, [
                el('span', { className: cls, text: `${mark} ${s.label}` }),
                st && st.detail ? el('span', { className: 'muted small', text: ` — ${st.detail}` }) : null,
            ]);
        }));
        checklistNode = list;
        return list;
    }

    function repaintChecklist() {
        if (!checklistNode || !checklistNode.isConnected) return;
        const fresh = checklist();
        checklistNode.replaceWith(fresh);
        checklistNode = fresh;
    }

    /** The panel on the proofs step that turns the diagrams into a real run. */
    function provePanel() {
        if (run && run.status === 'running') {
            return el('div', { className: 'card' }, [
                el('h3', { text: 'Proving — for real' }),
                checklist(),
                el('div', { className: 'controls' }, [
                    button('Cancel', () => { if (abort) abort.abort(); }),
                ]),
            ]);
        }
        if (run && run.status === 'done') {
            const r = run.result;
            return el('div', { className: 'card' }, [
                el('h3', { text: '✓ Both proofs are real' }),
                checklist(),
                el('p', {
                    className: 'muted small',
                    text:
                        `Proof-1 came back in ${(r.timings.proveTx / 1000).toFixed(1)} s and Proof-2 in ` +
                        `${(r.timings.proveCompanion / 1000).toFixed(1)} s, and this page has already re-verified the pair ` +
                        `with its own Read pipeline. Press Next to see the artifacts and the verdict.`,
                }),
            ]);
        }
        const url = el('input', { className: 'urlbox', attrs: { type: 'text', spellcheck: 'false', 'aria-label': 'Proof server URL' } });
        url.value = loadProofServerUrl();
        return el('div', { className: 'card' }, [
            el('h3', { text: 'Make them real' }),
            el('p', {
                className: 'muted small',
                text:
                    'So far the two proofs are only pictures. This button runs the real pipeline over YOUR message: ' +
                    'mint a demo coin in this tab, spend it, commit the hash to that spend, and have both proofs made by a ' +
                    'proof server. The proving payload is the only thing that leaves this browser — it carries the demo ' +
                    'coin\'s witness and the memo bytes, never a seed or key. The coin is imaginary; the proofs are real.',
            }),
            el('div', { className: 'controls' }, [
                el('span', { className: 'filelabel', text: 'Proof server:' }),
                url,
                button('Prove both — for real', () => { proveForReal(url.value); }, 'primary'),
            ]),
            run && run.status === 'error'
                ? el('p', { className: 'fail small', text: `${run.error.message}` })
                : null,
            el('p', { className: 'muted small' }, [
                el('span', { text: 'No proof server? The examples show the three commands that start the pinned one — ' }),
                (() => {
                    const b = button('open the examples', () => { if (onSeeExamples) onSeeExamples(); }, 'small-btn');
                    return b;
                })(),
            ]),
        ]);
    }

    /** The dashed "memo wrapper" group around Proof-2 + message. */
    function wrapperGroup() {
        return el('span', { className: 'wrap-group' }, [
            el('span', { className: 'wrap-label', text: 'memo wrapper' }),
            proof2Chip(),
            el('span', { className: 'tx-plus', text: '+' }),
            messageChip(),
        ]);
    }

    // --------------------------------------------------------------- stages

    function head(step, title, sub) {
        return [
            el('p', { className: 'story-step', text: `Step ${step} of ${STEPS}` }),
            el('h2', { className: 'story-title', text: title }),
            el('p', { className: 'story-sub muted small', text: sub }),
        ];
    }

    function controls(...buttons) {
        return el('div', { className: 'story-controls' }, buttons);
    }

    function hashCard() {
        return el('div', { className: 'card hash-card' }, [
            el('h3', { text: 'The message, and its hash' }),
            el('p', { className: 'story-msgline', text: `“${messageText}”` }),
            el('p', { className: 'mono break hash-hex', text: hashHex }),
            el('p', {
                className: 'muted small',
                text: `MemoHashV1 of your ${messageBytes.length}-byte message, computed in this page by the vendored WebAssembly module — this value is real, not a mock.`,
            }),
        ]);
    }

    function renderStage0() {
        const input = el('input', {
            className: 'story-msg',
            attrs: {
                type: 'text',
                placeholder: 'Enter a message…',
                autocomplete: 'off',
                spellcheck: 'false',
                'aria-label': 'The message to bind to the transaction',
            },
        });
        input.value = messageText;
        const counter = el('p', { className: 'muted small', text: `0 / ${MEMO_MAX_BYTES} bytes` });
        input.addEventListener('input', () => {
            counter.textContent = `${encoder.encode(input.value).length} / ${MEMO_MAX_BYTES} bytes`;
        });
        const form = el('form', { className: 'story-form' }, [
            input,
            button('Bind it ↵', () => {}, 'primary'),
        ]);
        form.querySelector('button').type = 'submit';
        form.addEventListener('submit', (ev) => {
            ev.preventDefault();
            setMessage(input.value);
        });

        fill(
            root,
            ...head(1, 'An ordinary transaction',
                'A Zswap transaction spends an input and makes an output. Nothing in it says anything — there is no field for a message, and adding one would change what the network has to accept. Type a message, and the next three steps bind it to this spend anyway.'),
            txRow({ name: 'transaction', parts: [inputChip(), output1Chip()] }),
            form,
            counter,
            inputError ? el('p', { className: 'fail small', text: inputError }) : null,
        );
        input.focus();
    }

    function renderStage1() {
        fill(
            root,
            ...head(2, 'The message becomes a hash, and a second statement takes it as an input',
                'The message itself never goes into a transaction. Instead it is hashed, and the same spend is restated as transaction′ — identical input, identical output, but the statement also takes Hash(message) as a binding input. The original transaction is untouched.'),
            hashCard(),
            txGrid(['name', 'arrow', 'input', 'out1'], [
                {
                    cells: { name: txName('transaction'), arrow: arrow(), input: inputChip(), out1: output1Chip() },
                    note: 'unchanged — exactly what any Zswap transaction looks like',
                },
                {
                    cells: { name: txName('transaction′'), arrow: arrow(), input: inputWithBinding(), out1: output1Chip() },
                    note: 'the same spend, restated with the hash bound inside the input',
                },
            ]),
            controls(
                button('Next', () => goto(2), 'primary'),
                button('Start over', reset),
            ),
        );
    }

    function renderStage2() {
        fill(
            root,
            ...head(3, 'Both statements commit to the hash, and each one gets a proof',
                'The hash is now also committed as an extra output of both statements. The unmodified Midnight circuit proves the plain transaction — Proof-1, which consensus accepts as-is. The custom circuit proves transaction′ — Proof-2, and that proof is what binds Hash(message) to this particular spend.'),
            messageStrip(),
            txGrid(['name', 'arrow', 'input', 'out1', 'out2', 'parrow', 'proof'], [
                {
                    cells: {
                        name: txName('transaction'), arrow: arrow(),
                        input: inputChip(), out1: output1Chip(), out2: memoOutputChip(),
                        parrow: proofArrow(), proof: proof1Chip(),
                    },
                },
                {
                    cells: {
                        name: txName('transaction′'), arrow: arrow(),
                        input: inputWithBinding(), out1: output1Chip(), out2: memoOutputChip(),
                        parrow: proofArrow(), proof: proof2Chip(),
                    },
                },
            ]),
            provePanel(),
            controls(
                button('Next', () => goto(3), 'primary'),
                button('Back', () => goto(1)),
                button('Start over', reset),
            ),
        );
    }

    function renderStage3() {
        fill(
            root,
            ...head(4, 'What is sent to the network',
                'The network receives a perfectly ordinary transaction and verifies Proof-1 exactly as it always did — consensus never learns a memo exists. Proof-2 and the message travel alongside, as a wrapper, for whoever should read it. Anyone holding all the parts can check that the memo really belongs to this spend.'),
            messageStrip(),
            txRow({
                name: 'transaction',
                parts: [inputChip(), output1Chip(), memoOutputChip()],
                proof: [proof1Chip(), el('span', { className: 'tx-plus', text: '+' }), wrapperGroup()],
            }),
            isReal() ? realVerdict() : illustrativeVerdict(),
            controls(
                button('Start over', reset),
                button('Back', () => goto(2)),
            ),
        );
    }

    /** The final card when the proofs are still pictures. */
    function illustrativeVerdict() {
        return el('div', { className: 'state good' }, [
            el('div', { className: 'state-head' }, [
                el('span', { className: 'pill good', text: '✓ verified' }),
                el('span', { className: 'muted small', text: 'all the parts are present, and they agree' }),
            ]),
            el('ul', { className: 'notes' }, [
                el('li', { text: `the message re-hashes to the committed value — ${shortHex(hashHex)}, recomputed on this page;` }),
                el('li', { text: 'Proof-1 verifies: the transaction is exactly what the unmodified ledger accepts;' }),
                el('li', { text: 'Proof-2 verifies: the witness that authorized the spend authorized this hash — so the message is bound to it.' }),
            ]),
            el('p', {
                className: 'muted small sub',
                text: 'The hash above is real. The proofs on this run are illustrative — go Back and press "Prove both — for real" to make them, or open the examples for the full Create section.',
            }),
        ]);
    }

    /** The final card when the pipeline really ran: the verdict is measured. */
    function realVerdict() {
        const r = run.result;
        const info = STATE_INFO[r.selfCheckState] || {};
        return el('div', {}, [
            el('div', { className: 'state good' }, [
                el('div', { className: 'state-head' }, [
                    el('span', { className: 'pill good', text: `✓ ${info.label || 'verified'}` }),
                    el('span', { className: 'muted small', text: 'verified by this page, offline, before it was shown' }),
                ]),
                el('ul', { className: 'notes' }, [
                    el('li', { text: `your ${r.memo.length}-byte message re-hashes to the committed value ${shortHex(r.h)};` }),
                    el('li', { text: `Proof-1: the proof server proved the transaction — the ${r.artifacts.offer.bytes.length}-byte offer file below deserializes and verifies under the pinned ledger;` }),
                    el('li', { text: `Proof-2: the memo companion authenticates against the verifier key compiled into this page, bound to nullifier ${shortHex(r.nullifier)};` }),
                    el('li', { text: `the anchor in the transaction matches that (nullifier, memo-hash) pair — the state above is the same verdict the Read section gives.` }),
                ]),
            ]),
            demoDisclaimer(r),
            artifactCard(r.artifacts.offer, {
                title: 'The offer file (the transaction + Proof-1)',
                what: 'A full proven transaction, carrying the memo anchor as output-2. This is the part a network would see.',
                provisional: false,
            }),
            artifactCard(r.artifacts.wrapper, {
                title: 'The memo wrapper (Proof-2 + your message)',
                what: 'The companion artifact: your memo bytes, the binding proof, and enough context to check them against the offer file.',
                provisional: true,
            }),
            el('div', { className: 'card' }, [
                el('h3', { text: 'Check it independently' }),
                el('p', {
                    className: 'muted small',
                    text: 'Load the pair into the Read section and watch it come back authenticated — the same check works in a fresh browser with the network off. That round trip is the whole point.',
                }),
                button('Load this pair into Read', () => {
                    const api = window.__WEBMEMO_READ__;
                    if (!api) return;
                    if (onSeeExamples) onSeeExamples();
                    if (api.setMode && api.modes) api.setMode(api.modes.CUSTOM);
                    api.clear();
                    api.addBytes(r.artifacts.offer.bytes, 'created in the walkthrough: offer file');
                    api.addBytes(r.artifacts.wrapper.bytes, 'created in the walkthrough: memo wrapper');
                    const target = document.getElementById('read');
                    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 'primary'),
            ]),
        ]);
    }

    function render() {
        if (stage === 0) renderStage0();
        else if (stage === 1) renderStage1();
        else if (stage === 2) renderStage2();
        else renderStage3();
    }

    render();

    // The same style of test hook the Read and Create sections expose: the
    // acceptance suites drive the page through its own entry points.
    const api = {
        setMessage,
        next: () => { goto(stage + 1); return stage; },
        back: () => { goto(stage - 1); return stage; },
        reset,
        prove: (url) => proveForReal(url === undefined ? loadProofServerUrl() : url),
        state: () => ({ stage, hashHex, messageBytes: messageBytes.length, run: summariseRun() }),
    };
    window.__WEBMEMO_STORY__ = api;
    return api;
}
