/**
 * index.js — page bootstrap.
 *
 * Two jobs, in this order:
 *
 *   1. load the vendored `ledger-wasm` bundle and prove it is the one this
 *      project was specified against, by reproducing two of 00003's frozen
 *      `MemoHashV1` conformance vectors. If the bundle ever stops reproducing
 *      them, every verdict the page could give would be worthless — so the
 *      check runs first and is visible, not hidden in a test file.
 *   2. mount the Read section.
 *
 * The Create section (User Story 2) is a later phase and is deliberately absent
 * rather than stubbed: a disabled button that looks like a feature is worse
 * than an honest sentence.
 */

import { el, fill } from './lib/dom.js';
import { toHex, fromHex } from './lib/bytes.js';
import { MEMO_EXPORTS, initMs, loadLedgerWasm } from './wasm.js';
import { mountRead } from './read/ui.js';

// ---------------------------------------------------------------------------
// Known answers, copied from the 00003 frozen conformance vectors
// (`vectors/memo-hash.txt`, records `memo-hash/ascii-hello-world` and
// `memo-hash/one-zero-byte`). These are the arbiter of the format.
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

function renderSelfTest(report) {
    const status = document.getElementById('status');
    if (!report.ok) {
        fill(
            status,
            el('p', { className: 'fail', text: report.error || 'The cryptographic engine did not come up.' }),
            el('p', {
                className: 'muted small',
                text: 'Nothing on this page can be trusted while this line is red: every verdict below depends on this module.',
            }),
        );
        return;
    }
    fill(
        status,
        el('p', {}, [
            el('span', { className: 'ok', text: '✓ ' }),
            el('span', {
                text: `Verifier ready — ${report.memoPresent}/${MEMO_EXPORTS.length} memo bindings, both frozen MemoHashV1 vectors reproduced byte-exactly, ${report.initMs} ms to load.`,
            }),
        ]),
        el('p', {
            className: 'muted small',
            text: 'The verifier key is compiled into that module. From here on, checking a memo needs no network, no keys and no wallet.',
        }),
    );
}

async function main() {
    const report = { ok: false, initMs: null, exportCount: 0, memoPresent: 0, checks: [], error: null };

    try {
        const wasm = await loadLedgerWasm();

        report.initMs = initMs;
        report.exportCount = Object.keys(wasm).length;
        report.memoPresent = MEMO_EXPORTS.filter((name) => typeof wasm[name] === 'function').length;

        for (const vector of MEMO_HASH_VECTORS) {
            const got = toHex(wasm.memoHashV1(fromHex(vector.memoHex)));
            report.checks.push({ name: vector.name, got, expected: vector.expected, pass: got === vector.expected });
        }

        report.ok =
            report.memoPresent === MEMO_EXPORTS.length &&
            report.checks.length === MEMO_HASH_VECTORS.length &&
            report.checks.every((c) => c.pass);

        renderSelfTest(report);

        if (report.ok) {
            mountRead(wasm, document.getElementById('read'));
        } else {
            fill(
                document.getElementById('read'),
                el('p', {
                    className: 'fail',
                    text: 'The Read section is not available: the WebAssembly module did not reproduce the frozen conformance vectors, so it is not the build this page was specified against.',
                }),
            );
        }
    } catch (err) {
        report.error = String(err && err.message ? err.message : err);
        renderSelfTest(report);
        fill(
            document.getElementById('read'),
            el('p', { className: 'fail', text: `The cryptographic engine could not be loaded: ${report.error}` }),
            el('p', {
                className: 'muted small',
                text: 'This page needs WebAssembly. If your browser has it disabled, nothing here can run.',
            }),
        );
    } finally {
        window.__WEBMEMO_SELFTEST__ = report;
        window.dispatchEvent(new CustomEvent('webmemo:selftest', { detail: report }));
    }
}

main();
