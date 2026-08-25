/**
 * index.js — Phase 1 stub.
 *
 * Its only job is to prove, in a real browser, that the vendored `ledger-wasm`
 * bundle loads through the import map and answers a known-answer MemoHashV1
 * call. The Create and Read sections replace this in later phases.
 */

import { loadLedgerWasm, initMs, MEMO_EXPORTS } from './wasm.js';

// ---------------------------------------------------------------------------
// Known answers, copied from the 00003 frozen conformance vectors
// (`vectors/memo-hash.txt`, records `memo-hash/ascii-hello-world` and
// `memo-hash/one-zero-byte`). These are the arbiter of the format: if the
// vendored WASM ever stops reproducing them, the bundle is not the one this
// project was specified against. The full vector set arrives with the Read
// section.
// ---------------------------------------------------------------------------
const MEMO_HASH_VECTORS = [
    {
        name: 'memo-hash/ascii-hello-world',
        memoHex: '68656c6c6f20776f726c64',
        expected: '65d3c33a0fb14d48a042620c375bb19fba0f9d8fbfc6bbe3f21959f73c2a5455',
    },
    {
        name: 'memo-hash/one-zero-byte',
        memoHex: '00',
        expected: '731dab59a22ef473b632068c8cd8dfc198f2d9327bfde81cf34b767bd1eee72f',
    },
];

const hexToBytes = (hex) =>
    Uint8Array.from(hex.match(/../g) ?? [], (b) => parseInt(b, 16));

const bytesToHex = (bytes) =>
    Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

/** Escape-free rendering: every value reaches the DOM as textContent. */
function cell(text, className) {
    const td = document.createElement('td');
    td.textContent = text;
    if (className) td.className = className;
    return td;
}

function renderResults(report) {
    const el = document.getElementById('results');
    el.hidden = false;
    el.replaceChildren();

    const table = document.createElement('table');
    const addRow = (label, value, className) => {
        const tr = document.createElement('tr');
        const th = document.createElement('th');
        th.textContent = label;
        tr.append(th, cell(value, className));
        table.append(tr);
    };

    addRow('module init', `${report.initMs} ms`);
    addRow('exports', String(report.exportCount));
    addRow(
        'memo bindings',
        `${report.memoPresent}/${MEMO_EXPORTS.length} present`,
        report.memoPresent === MEMO_EXPORTS.length ? 'ok' : 'fail',
    );
    for (const check of report.checks) {
        addRow(
            check.name,
            check.pass ? `${check.got}  ✓` : `${check.got}  ✗ expected ${check.expected}`,
            check.pass ? 'ok mono break' : 'fail mono break',
        );
    }
    el.append(table);
}

function setStatus(text, className) {
    const el = document.getElementById('status');
    el.replaceChildren();
    const span = document.createElement('span');
    span.textContent = text;
    if (className) span.className = className;
    el.append(span);
}

async function main() {
    const report = {
        ok: false,
        initMs: null,
        exportCount: 0,
        memoPresent: 0,
        checks: [],
        error: null,
    };

    try {
        const wasm = await loadLedgerWasm();

        report.initMs = initMs;
        report.exportCount = Object.keys(wasm).length;
        report.memoPresent = MEMO_EXPORTS.filter(
            (name) => typeof wasm[name] === 'function',
        ).length;

        for (const vector of MEMO_HASH_VECTORS) {
            const got = bytesToHex(wasm.memoHashV1(hexToBytes(vector.memoHex)));
            report.checks.push({
                name: vector.name,
                got,
                expected: vector.expected,
                pass: got === vector.expected,
            });
        }

        report.ok =
            report.memoPresent === MEMO_EXPORTS.length &&
            report.checks.length === MEMO_HASH_VECTORS.length &&
            report.checks.every((c) => c.pass);

        setStatus(
            report.ok
                ? 'WASM loaded and every known-answer check passed.'
                : 'WASM loaded but a check FAILED — see below.',
            report.ok ? 'ok' : 'fail',
        );
        renderResults(report);
    } catch (err) {
        report.error = String(err && err.message ? err.message : err);
        setStatus(`Failed to load the WASM module: ${report.error}`, 'fail');
    } finally {
        // The headless test driver reads this.
        window.__WEBMEMO_SELFTEST__ = report;
        window.dispatchEvent(new CustomEvent('webmemo:selftest', { detail: report }));
    }
}

main();
