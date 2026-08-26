/**
 * ui.js — the Read section's DOM.
 *
 * Task 2.1 (input), 2.3 (trust-state report) and 2.4 (inert memo) meet here.
 *
 * One paste box and one file picker feed a single `add()`, which routes by the
 * artifact's own prefix or magic rather than by which control was used — so
 * "the user put the offer in the wrapper box" is not a state this page can be
 * in. Everything is rendered through `dom.el`, i.e. `textContent`.
 *
 * Post-v1 iteration 1 added a **mode selector** above the inputs:
 *
 *     [ Read Demo Transactions | Read Custom Artifact ]
 *
 * It is a routing choice about where bytes come from, and nothing else. Both
 * modes end in the same `add()` → `runRead()` → `renderReport()` path, the same
 * six trust states and the same inert renderer; a demo fixture gets no more
 * credit for being bundled than a pasted string does. The demo mode replaces the
 * v1 "Try it" button strip with a labelled LIST of the frozen fixtures the repo
 * ships.
 *
 * The module also publishes `window.__WEBMEMO_READ__`, which is how the headless
 * tamper matrix drives the page. That hook calls exactly the same functions the
 * buttons do — a test that passed against a private copy of the pipeline would
 * not be evidence about the page.
 */

import { byteCount, toHex } from '../lib/bytes.js';
import { button, el, fill, row } from '../lib/dom.js';
import { CODES, ReadError } from './errors.js';
import { HRP, MAX_ARTIFACT_BYTES, MAX_TEXT_CHARS } from './classify.js';
import { describeKind, ingestBytes, ingestFileContents, ingestText } from './parse.js';
import { locatorView, memoView, unverifiedMemoView } from './memoview.js';
import { STATE_INFO, STATE_ORDER, STATES } from './trust.js';
import { runRead } from './verify.js';

/**
 * The bundled reference corpus (task 2.5), as the demo-transaction list.
 *
 * `fixture` names the frozen family in `fixtures/` each entry is built from, so
 * a reader of the list can go and check the bytes for themselves; `title` is the
 * short human label and `blurb` says what the entry is for.
 */
export const EXAMPLES = Object.freeze([
    {
        id: 'reference',
        fixture: 'reference',
        title: 'A valid pair',
        blurb: 'One input, one memo ("hello world"), one matching anchor. The expected result is authenticated with a matching anchor — unconfirmed.',
        offer: 'reference.offer-tx.bin',
        wrappers: ['reference.wrapper.bin'],
    },
    {
        id: 'anchor-only',
        fixture: 'reference',
        title: 'The wrapper was stripped',
        blurb: 'The same offer file, with no wrapper supplied. The anchor is still there, so the page can tell a memo existed — and cannot tell you what it said.',
        offer: 'reference.offer-tx.bin',
        wrappers: [],
    },
    {
        id: 'mismatch',
        fixture: 'unrelated + reference',
        title: 'A wrapper from a different offer',
        blurb: 'A valid wrapper paired with an unrelated offer file. Nothing here is corrupt; the two simply do not belong together.',
        offer: 'unrelated.offer-tx.bin',
        wrappers: ['reference.wrapper.bin'],
    },
    {
        id: 'two-inputs',
        fixture: 'two-inputs-same-memo',
        title: 'Two inputs, the same memo',
        blurb: 'One transaction, two spends, the identical memo on both. Attribution stays per input: same memo-hash, different nullifiers.',
        offer: 'two-inputs-same-memo.offer-tx.bin',
        wrappers: ['two-inputs-same-memo-1.wrapper.bin', 'two-inputs-same-memo-2.wrapper.bin'],
    },
    {
        id: 'hostile',
        fixture: 'hostile-memo',
        title: 'A hostile memo, authenticated',
        blurb: 'A genuinely authenticated memo made of HTML, a script tag, an ANSI colour sequence, a right-to-left override, a zero-width space and a NUL byte. Authentication says a witness authorized these bytes; it says nothing about them being safe.',
        offer: 'hostile-memo.offer-tx.bin',
        wrappers: ['hostile-memo.wrapper.bin'],
    },
    {
        id: 'no-anchor',
        fixture: 'no-anchor',
        title: 'No memo at all',
        blurb: 'An ordinary offer file with no anchor and no wrapper.',
        offer: 'no-anchor.offer-tx.bin',
        wrappers: [],
    },
    {
        id: 'guaranteed',
        fixture: 'guaranteed-segment',
        title: 'A memo on the guaranteed segment',
        blurb: 'The same construction in the transaction’s guaranteed slot (segment 0) rather than a fallible one.',
        offer: 'guaranteed-segment.offer-tx.bin',
        wrappers: ['guaranteed-segment.wrapper.bin'],
    },
    {
        id: 'bare-offer',
        fixture: 'reference',
        title: 'Bare offer bytes (refused)',
        blurb: 'The Zswap offer on its own, without the transaction around it. An offer file is a full proven transaction, so this is refused with a precise reason rather than half-read.',
        offer: 'reference.offer-bare.bin',
        wrappers: [],
    },
]);

const FIXTURE_BASE = 'fixtures/';

/** The two ways bytes get into the Read pipeline. Nothing downstream sees this. */
export const MODES = Object.freeze({ DEMO: 'demo', CUSTOM: 'custom' });

export function mountRead(wasm, root) {
    /** @type {{offer: object|null, wrappers: object[]}} */
    const state = { offer: null, wrappers: [] };
    let lastReport = null;
    let lastError = null;

    // -- input controls ----------------------------------------------------
    const paste = el('textarea', {
        id: 'paste',
        className: 'paste',
        attrs: {
            rows: '4',
            spellcheck: 'false',
            autocapitalize: 'off',
            autocomplete: 'off',
            placeholder: `Paste a swapoffer1… offer file or a swapmsg1… memo wrapper, then press Add. Either one goes here — the page routes it by its own prefix.`,
        },
    });

    const addFromPaste = () => {
        try {
            add(ingestText(wasm, paste.value, 'pasted text'));
            paste.value = '';
        } catch (err) {
            fail(err);
        }
    };

    const fileInput = el('input', {
        id: 'files',
        attrs: { type: 'file', multiple: 'multiple' },
    });
    fileInput.addEventListener('change', async () => {
        const files = Array.from(fileInput.files || []);
        fileInput.value = '';
        for (const file of files) {
            try {
                if (file.size > MAX_ARTIFACT_BYTES) {
                    throw new ReadError(
                        CODES.TOO_LARGE,
                        `"${file.name}" is ${byteCount(file.size)}, over this page's ${MAX_ARTIFACT_BYTES.toLocaleString('en-US')}-byte limit. It was not read.`,
                        { bytes: file.size },
                    );
                }
                const bytes = new Uint8Array(await file.arrayBuffer());
                add(ingestFileContents(wasm, bytes, file.name));
            } catch (err) {
                fail(err);
            }
        }
    });

    const inputCard = el('div', { className: 'card' }, [
        el('h3', { text: 'Add an artifact' }),
        paste,
        el('div', { className: 'controls' }, [
            button('Add', addFromPaste, 'primary'),
            el('label', { className: 'filelabel' }, [el('span', { text: 'or choose files:' }), fileInput]),
            el('span', { className: 'spacer' }),
            button('Clear all', () => { state.offer = null; state.wrappers = []; lastReport = null; lastError = null; redraw(); }),
        ]),
        el('p', {
            className: 'muted small',
            text: `Limits are checked before anything is parsed: ${MAX_ARTIFACT_BYTES.toLocaleString('en-US')} bytes per artifact, ${MAX_TEXT_CHARS.toLocaleString('en-US')} characters per paste. Prefixes: "${HRP.OFFER}" for the offer file, "${HRP.WRAPPER}" for the memo wrapper (provisional).`,
        }),
    ]);

    // -- the demo-transaction list ----------------------------------------
    // The v1 "Try it" strip was a row of unlabelled-looking buttons whose
    // meaning lived in a `title` tooltip. This is the same corpus as a LIST:
    // every entry states what it is on the page, where a reader will see it.
    const demoItems = EXAMPLES.map((ex) => {
        const load = button('Load', () => { void startLoad(ex.id); }, 'example small-btn');
        load.dataset.example = ex.id;
        load.title = ex.blurb;
        return el('li', { dataset: { example: ex.id } }, [
            el('div', { className: 'demo-text' }, [
                el('div', { className: 'demo-title', text: ex.title }),
                el('div', { className: 'muted small', text: ex.blurb }),
                el('div', { className: 'muted small mono', text: `fixtures/ — ${ex.fixture}` }),
            ]),
            el('span', { className: 'spacer' }),
            load,
        ]);
    });

    const demoCard = el('div', { className: 'card', id: 'read-demo' }, [
        el('h3', { text: 'Bundled demo transactions' }),
        el('p', {
            className: 'muted small',
            text: 'The frozen reference artifacts this page ships. They carry real proofs and are anchored to a throwaway demo state, so they are format-valid and proof-valid but could never settle on a live chain. Each one goes through exactly the same verification as anything you paste.',
        }),
        el('ul', { className: 'demolist' }, demoItems),
        el('p', { id: 'example-blurb', className: 'muted small', text: '' }),
    ]);

    // -- mode selector -----------------------------------------------------
    let mode = MODES.DEMO;

    const demoModeBtn = button('Read Demo Transactions', () => setMode(MODES.DEMO), 'toggle on');
    demoModeBtn.id = 'read-mode-demo';
    demoModeBtn.dataset.mode = MODES.DEMO;
    const customModeBtn = button('Read Custom Artifact', () => setMode(MODES.CUSTOM), 'toggle');
    customModeBtn.id = 'read-mode-custom';
    customModeBtn.dataset.mode = MODES.CUSTOM;

    const modeBlurb = el('p', { id: 'read-mode-blurb', className: 'muted small', text: '' });

    const modeCard = el('div', { className: 'card', id: 'read-mode' }, [
        el('h3', { text: 'What would you like to check?' }),
        el('div', { className: 'controls' }, [demoModeBtn, customModeBtn]),
        modeBlurb,
    ]);

    function setMode(next) {
        mode = next === MODES.CUSTOM ? MODES.CUSTOM : MODES.DEMO;
        const isDemo = mode === MODES.DEMO;
        demoModeBtn.className = `toggle${isDemo ? ' on' : ''}`;
        customModeBtn.className = `toggle${isDemo ? '' : ' on'}`;
        demoModeBtn.setAttribute('aria-pressed', String(isDemo));
        customModeBtn.setAttribute('aria-pressed', String(!isDemo));
        demoCard.hidden = !isDemo;
        inputCard.hidden = isDemo;
        modeBlurb.textContent = isDemo
            ? 'Pick one of the transactions bundled with this page and it will be verified in front of you.'
            : 'Paste or upload your own offer file and memo wrapper. Nothing you provide leaves this browser.';
        return mode;
    }

    /** Mark which demo entry produced what is currently on screen. */
    function markSelected(id) {
        for (const li of demoItems) {
            const on = li.dataset.example === id;
            li.className = on ? 'selected' : '';
        }
    }

    // -- loaded list, report ----------------------------------------------
    const loadedCard = el('div', { className: 'card' });
    const errorCard = el('div', { className: 'card error' });
    const reportCard = el('div', { className: 'card' });
    const statesCard = el('div', { className: 'card' });

    fill(root, modeCard, demoCard, inputCard, loadedCard, errorCard, reportCard, statesCard);
    renderStatesTable(statesCard);
    setMode(MODES.DEMO);

    // -- behaviour ---------------------------------------------------------
    function fail(err) {
        lastError = err instanceof ReadError ? err : new ReadError(CODES.PARSE_FAILED, String(err && err.message ? err.message : err));
        redraw();
    }

    function add(artifact) {
        lastError = null;
        if (artifact.kind === 'offer-file') {
            state.offer = artifact;
        } else {
            const dup = state.wrappers.find((w) => w.bytes.length === artifact.bytes.length && toHex(w.bytes) === toHex(artifact.bytes));
            if (dup) {
                throw new ReadError(CODES.DUPLICATE_ARTIFACT, 'That exact memo wrapper is already loaded.');
            }
            state.wrappers.push(artifact);
        }
        verify();
    }

    function verify() {
        lastReport = runRead(wasm, { offerArtifact: state.offer, wrapperArtifacts: state.wrappers });
        redraw();
        return lastReport;
    }

    /**
     * Load one bundled demo transaction.
     *
     * A demo entry is several fetches (an offer file plus zero, one or two
     * wrappers), so two clicks in quick succession would otherwise interleave:
     * the older load's wrappers would land on top of the newer load's offer and
     * the page would report on a pair nobody assembled. `loadGeneration` is the
     * guard — every load takes a ticket, and after each await a load that is no
     * longer the current one stops touching the state instead of finishing.
     */
    let loadGeneration = 0;
    async function loadExample(id) {
        const ex = EXAMPLES.find((e) => e.id === id);
        if (!ex) throw new Error(`no example "${id}"`);
        const mine = ++loadGeneration;
        const superseded = () => mine !== loadGeneration;
        state.offer = null;
        state.wrappers = [];
        lastError = null;
        lastReport = null;
        markSelected(id);
        document.getElementById('example-blurb').textContent = ex.blurb;
        try {
            const offerBytes = await fetchFixture(ex.offer);
            if (superseded()) return lastReport;
            add(ingestBytes(offerBytes, ex.offer));
        } catch (err) {
            if (superseded()) return lastReport;
            fail(err);
            return lastReport;
        }
        for (const name of ex.wrappers) {
            try {
                const bytes = await fetchFixture(name);
                if (superseded()) return lastReport;
                add(ingestBytes(bytes, name));
            } catch (err) {
                if (superseded()) return lastReport;
                fail(err);
            }
        }
        if (superseded()) return lastReport;
        return verify();
    }

    /**
     * The last demo load started, so a caller can wait for it.
     *
     * Only the test hook uses this; the buttons are fire-and-forget, which is
     * what a click is.
     */
    let pendingLoad = Promise.resolve();
    function startLoad(id) {
        pendingLoad = loadExample(id).catch(() => { /* already surfaced by fail() */ });
        return pendingLoad;
    }

    function redraw() {
        renderLoaded(loadedCard, state, (kind, index) => {
            if (kind === 'offer') state.offer = null;
            else state.wrappers.splice(index, 1);
            lastError = null;
            verify();
        });
        renderError(errorCard, lastError);
        renderReport(reportCard, lastReport);
    }

    redraw();

    // The headless tamper matrix drives exactly these functions.
    window.__WEBMEMO_READ__ = {
        addText: (text, label) => { try { add(ingestText(wasm, text, label || 'pasted text')); return summarise(lastReport, lastError); } catch (e) { fail(e); return summarise(lastReport, lastError); } },
        addBytes: (bytes, label) => { try { add(ingestBytes(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), label || 'bytes')); return summarise(lastReport, lastError); } catch (e) { fail(e); return summarise(lastReport, lastError); } },
        loadExample: async (id) => { await startLoad(id); return summarise(lastReport, lastError); },
        // Resolves when the demo load a CLICK started has finished. The suite
        // clicks the list the way a visitor does and then waits for this.
        settled: () => pendingLoad,
        clear: () => { state.offer = null; state.wrappers = []; lastReport = null; lastError = null; markSelected(null); redraw(); },
        verify: () => { verify(); return summarise(lastReport, lastError); },
        summary: () => summarise(lastReport, lastError),
        examples: EXAMPLES.map((e) => e.id),
        // Input routing only. The suite uses these to prove both modes are
        // reachable; nothing downstream of `add()` knows a mode exists.
        setMode: (next) => setMode(next),
        mode: () => mode,
        modes: MODES,
        wasm,
    };
}

async function fetchFixture(name) {
    const res = await fetch(`${FIXTURE_BASE}${name}`);
    if (!res.ok) throw new Error(`could not load the bundled example "${name}" (HTTP ${res.status})`);
    return new Uint8Array(await res.arrayBuffer());
}

/** A JSON-safe view of the report, for the test driver and for debugging. */
function summarise(report, error) {
    return {
        error: error ? { code: error.code, message: error.message } : null,
        ok: Boolean(report && report.ok),
        reportError: report && report.error ? { code: report.error.code, message: report.error.message } : null,
        offerFile: report && report.offerFile
            ? {
                markers: report.offerFile.markers,
                byteLength: report.offerFile.byteLength,
                offers: report.offerFile.offers.map((o) => ({ slot: o.slot, segment: o.segment, bytes: o.bytes.length, inputs: o.inputs ? o.inputs.map((i) => i.nullifier) : null })),
                anchors: report.offerFile.anchors,
            }
            : null,
        items: report
            ? report.items.map((i) => ({
                kind: i.kind,
                state: i.state,
                source: i.source,
                authenticated: Boolean(STATE_INFO[i.state] && STATE_INFO[i.state].authenticated),
                segment: i.segment ?? null,
                nullifier: i.nullifier ?? null,
                h: i.h ?? (i.record ? i.record.h : null),
                memoHex: i.record ? toHex(i.record.memo) : null,
                memoLength: i.record ? i.record.memoLength : null,
                matchingAnchorsInOffer: i.record ? i.record.matchingAnchorsInOffer.length : null,
                anomalies: i.anomalies.map((a) => a.code),
                failure: i.failure ? { code: i.failure.code, message: i.failure.message } : null,
            }))
            : [],
        // What the DOM actually shows, so a test can assert that a failed
        // verification put no memo on the page.
        renderedMemoCount: document.querySelectorAll('.memo:not(.unverified) .memo-body').length,
        renderedMemoText: Array.from(document.querySelectorAll('.memo:not(.unverified) .memo-body')).map((n) => n.textContent),
        pageText: document.getElementById('read-report') ? document.getElementById('read-report').textContent : '',
    };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function renderLoaded(card, state, remove) {
    const rows = [];
    if (state.offer) {
        rows.push(el('li', {}, [
            el('span', { className: 'tag ok', text: 'offer file' }),
            el('span', { className: 'mono', text: state.offer.label }),
            el('span', { className: 'muted small', text: `${byteCount(state.offer.bytes.length)} · ${state.offer.source} · markers ${state.offer.markers.join(' / ')}` }),
            el('span', { className: 'spacer' }),
            button('remove', () => remove('offer'), 'small-btn'),
        ]));
    }
    state.wrappers.forEach((w, i) => {
        rows.push(el('li', {}, [
            el('span', { className: 'tag', text: 'memo wrapper' }),
            el('span', { className: 'mono', text: w.label }),
            el('span', { className: 'muted small', text: `${byteCount(w.bytes.length)} · ${w.source}` }),
            el('span', { className: 'spacer' }),
            button('remove', () => remove('wrapper', i), 'small-btn'),
        ]));
    });

    if (rows.length === 0) {
        fill(card, el('h3', { text: 'Loaded' }), el('p', { className: 'muted small', text: 'Nothing loaded yet.' }));
        return;
    }
    fill(card, el('h3', { text: 'Loaded' }), el('ul', { className: 'loaded' }, rows));
}

function renderError(card, error) {
    if (!error) {
        card.hidden = true;
        fill(card);
        return;
    }
    card.hidden = false;
    fill(
        card,
        el('h3', { text: 'That input was refused' }),
        el('p', {}, [el('span', { className: 'code', text: error.code }), ' ', el('span', { text: error.message })]),
        el('p', { className: 'muted small', text: 'Nothing was parsed beyond the point named above, and no memo content came from this input.' }),
    );
}

function renderReport(card, report) {
    card.id = 'read-report';
    if (!report) {
        fill(card, el('h3', { text: 'Result' }), el('p', { className: 'muted small', text: 'Add an offer file to begin.' }));
        return;
    }
    if (report.error) {
        fill(
            card,
            el('h3', { text: 'Result' }),
            el('p', {}, [el('span', { className: 'code', text: report.error.code }), ' ', el('span', { text: report.error.message })]),
        );
        return;
    }

    const parts = [el('h3', { text: 'Result' })];

    // The offer file itself.
    const of = report.offerFile;
    const offerTable = el('table', {}, [
        row('offer file', `${byteCount(of.byteLength)}, markers ${of.markers.join(' / ')}`),
        row('zswap offers', of.offers.map((o) => `segment ${o.segment} (${o.slot}), ${byteCount(o.bytes.length)}, ${o.inputs ? o.inputs.length : '?'} input(s)`).join('  ·  ')),
        row('anchors found', of.anchors.length === 0 ? 'none' : `${of.anchors.length} (lengths ${[...new Set(of.anchors.map((a) => a.length))].join(', ')} bytes)`),
    ]);
    parts.push(el('div', { className: 'sub' }, [el('h4', { text: 'The offer file' }), offerTable]));

    // Per-input attribution.
    parts.push(renderAttribution(report));

    // One card per evidence item.
    for (const item of report.items) parts.push(renderItem(item));

    parts.push(el('div', { className: 'sub' }, [
        el('h4', { text: 'What this check did and did not see' }),
        el('ul', { className: 'notes' }, report.notes.map((n) => el('li', { text: n }))),
    ]));

    fill(card, ...parts);
}

function renderAttribution(report) {
    const rows = [];
    for (const offer of report.offerFile.offers) {
        const inputs = offer.inputs || [];
        for (const input of inputs) {
            const wrapperItem = report.items.find((i) => i.kind === 'wrapper' && i.record && i.record.nullifier === input.nullifier);
            const failedItem = report.items.find((i) => i.kind === 'wrapper' && !i.record && i.nullifier === input.nullifier);
            const anchorItem = report.items.find((i) => i.kind === 'anchor' && i.nullifier === input.nullifier);
            let verdict = 'no memo evidence for this input';
            let cls = 'muted';
            if (wrapperItem) {
                verdict = `memo authenticated (${byteCount(wrapperItem.record.memoLength)}), memo-hash ${wrapperItem.record.h.slice(0, 16)}…`;
                cls = 'ok';
            } else if (anchorItem) {
                verdict = `a memo was committed to (memo-hash ${anchorItem.h.slice(0, 16)}…) but its bytes are not here`;
                cls = 'warn-text';
            } else if (failedItem) {
                verdict = 'a wrapper claimed this input and did not pass';
                cls = 'fail';
            }
            rows.push(el('tr', {}, [
                el('td', { className: 'mono break small', text: `${input.nullifier.slice(0, 24)}…` }),
                el('td', { className: 'small', text: `segment ${offer.segment}` }),
                el('td', { className: `small ${cls}`, text: verdict }),
            ]));
        }
    }
    if (rows.length === 0) return null;
    return el('div', { className: 'sub' }, [
        el('h4', { text: 'Per input' }),
        el('p', { className: 'muted small', text: 'A memo binds to ONE spend. With several inputs, each is its own question — including when two inputs carry the identical memo.' }),
        el('table', { className: 'attrib' }, [
            el('tr', {}, [el('th', { text: 'nullifier' }), el('th', { text: 'where' }), el('th', { text: 'memo evidence' })]),
            ...rows,
        ]),
    ]);
}

function renderItem(item) {
    const info = STATE_INFO[item.state];
    const parts = [
        el('div', { className: 'state-head' }, [
            el('span', { className: `pill ${info.tone}`, text: info.label }),
            el('span', { className: 'muted small', text: `from ${item.source}` }),
        ]),
        el('p', { className: 'small' }, [el('strong', { text: 'What this proves: ' }), el('span', { text: info.proves })]),
        el('p', { className: 'small' }, [el('strong', { text: 'What it does NOT prove: ' }), el('span', { text: info.doesNotProve })]),
    ];

    if (item.kind === 'wrapper' && item.record) {
        parts.push(el('table', {}, [
            row('bound to input', item.record.nullifier, 'mono break small'),
            row('segment', `${item.record.segment}${item.slot ? ` (${item.slot})` : ''}`),
            row('memo-hash', item.record.h, 'mono break small'),
            row('matching anchors', item.record.matchingAnchorsInOffer.length === 0
                ? 'none in the checked offer'
                : item.record.matchingAnchorsInOffer.map((a) => `output ${a.outputIndex}`).join(', ')),
        ]));
        parts.push(memoView(item.record.memo));
        const loc = locatorView(item.parsed && item.parsed.untrustedLocator);
        if (loc) parts.push(loc);
    }

    if (item.kind === 'wrapper' && item.failure) {
        parts.push(el('table', {}, [
            row('reason', item.failure.message, 'small'),
            row('code', item.failure.code, 'code'),
            item.parsed ? row('claimed input', item.parsed.nullifier, 'mono break small') : null,
            item.parsed ? row('claimed segment', item.parsed.segment) : null,
        ].filter(Boolean)));
        parts.push(el('p', { className: 'small fail', text: 'No memo from this wrapper is shown as authenticated.' }));
        if (item.parsed && item.parsed.unverifiedMemo) {
            const holder = el('div', {});
            const reveal = button(
                `Show the ${byteCount(item.parsed.unverifiedMemoLength)} of unverified bytes anyway`,
                () => { fill(holder, unverifiedMemoView(item.parsed.unverifiedMemo)); },
                'small-btn',
            );
            parts.push(reveal, holder);
        }
    }

    if (item.kind === 'anchor') {
        parts.push(el('table', {}, [
            row('input (nullifier)', item.nullifier, 'mono break small'),
            row('memo-hash committed', item.h, 'mono break small'),
            row('anchor', `${item.anchorLength} bytes at offset ${item.source.replace(/\D+/g, '')}`),
        ]));
        parts.push(el('p', {
            className: 'small warn-text',
            text: 'Supply the matching memo wrapper to turn this into an authenticated memo. Without it, the commitment is all there is.',
        }));
    }

    if (item.anomalies.length > 0) {
        parts.push(el('div', { className: 'sub' }, [
            el('h4', { text: 'Anomalies (these do not change the state above)' }),
            el('ul', { className: 'notes' }, item.anomalies.map((a) => el('li', { text: a.text }))),
        ]));
    }

    return el('div', { className: `state ${info.tone}`, dataset: { state: item.state } }, parts);
}

function renderStatesTable(card) {
    fill(
        card,
        el('h3', { text: 'The six states, and which of them this page can reach' }),
        el('p', {
            className: 'muted small',
            text: 'The format defines six outcomes. A page that only ever sees a file cannot reach the last one, so it is listed and marked rather than quietly dropped.',
        }),
        el('table', { className: 'states' }, [
            el('tr', {}, [el('th', { text: 'state' }), el('th', { text: 'shows a memo?' }), el('th', { text: 'reachable here?' })]),
            ...STATE_ORDER.map((s) => el('tr', {}, [
                el('td', { className: 'small', text: STATE_INFO[s].label }),
                el('td', { className: 'small', text: STATE_INFO[s].authenticated ? 'yes, as authenticated' : 'no' }),
                el('td', {
                    className: `small ${STATE_INFO[s].reachable ? 'ok' : 'fail'}`,
                    text: STATE_INFO[s].reachable ? 'yes' : 'no — needs chain evidence this page does not have',
                }),
            ])),
        ]),
    );
}

export { STATES, describeKind };
