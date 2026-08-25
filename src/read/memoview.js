/**
 * memoview.js — rendering an authenticated memo, inertly (00003 FR-018).
 *
 * Task 2.4. Three guarantees, each visible in the DOM this builds:
 *
 *  1. **textContent only.** Every string reaches the page through
 *     `dom.el({ text })`. No markup path exists, so `<script>` in a memo is
 *     five literal characters and `<img onerror=…>` is a sentence.
 *  2. **Escapes are neutralised before display, not just prevented from
 *     executing.** `inert.toUnicodeText` escapes C0/C1 controls, bidi overrides
 *     and isolates, zero-width characters and invalid UTF-8. That matters on
 *     the web specifically: `textContent` stops markup, but it does NOT stop
 *     the bidi algorithm from reordering what a reader sees, and it does not
 *     stop an ANSI sequence from acting when the text is pasted into a
 *     terminal.
 *  3. **The byte length is always shown, and hex is always one click away.**
 *     "It looked empty" is a rendering, not a fact about bytes.
 *
 * The container also sets `unicode-bidi: isolate` in CSS as a second, redundant
 * barrier: even if a future bidi control were added to Unicode and missed by
 * the escape table, it could not leak out of the memo box and reorder the
 * report around it.
 */

import { byteCount } from '../lib/bytes.js';
import { button, el, fill } from '../lib/dom.js';
import { inertStats, toAsciiText, toHexDump, toUnicodeText } from '../lib/inert.js';

const VIEWS = ['text', 'ascii', 'hex'];

const VIEW_LABEL = {
    text: 'Text',
    ascii: 'Strict ASCII',
    hex: 'Hex',
};

const VIEW_NOTE = {
    text: 'Readable text. Control characters, bidi overrides, zero-width characters and invalid UTF-8 bytes are shown escaped — never applied.',
    ascii: 'The strictest rendering: every character here is printable ASCII. Everything else is shown as \\xNN.',
    hex: 'The bytes, with no interpretation at all.',
};

/**
 * Build the memo panel.
 *
 * @param {Uint8Array} memo the AUTHENTICATED memo bytes
 * @param {string} caption what these bytes are, e.g. "Authenticated memo"
 */
export function memoView(memo, caption = 'Authenticated memo') {
    const stats = inertStats(memo);
    const body = el('pre', { className: 'memo-body' });
    const note = el('p', { className: 'muted small' });

    let view = 'text';
    const render = () => {
        body.textContent =
            view === 'hex' ? toHexDump(memo) : view === 'ascii' ? toAsciiText(memo) : toUnicodeText(memo);
        note.textContent = VIEW_NOTE[view];
        for (const b of toggles) b.className = b.dataset.view === view ? 'toggle on' : 'toggle';
    };

    const toggles = VIEWS.map((v) => {
        const b = button(VIEW_LABEL[v], () => { view = v; render(); }, 'toggle');
        b.dataset.view = v;
        return b;
    });

    const warnings = [];
    if (stats.escapedCodePoints > 0) {
        warnings.push(
            `${stats.escapedCodePoints} character${stats.escapedCodePoints === 1 ? '' : 's'} in this memo ${stats.escapedCodePoints === 1 ? 'is' : 'are'} invisible or active (control, bidi or zero-width) and ${stats.escapedCodePoints === 1 ? 'is' : 'are'} shown escaped.`,
        );
    }
    if (stats.invalidBytes > 0) {
        warnings.push(
            `${stats.invalidBytes} byte${stats.invalidBytes === 1 ? '' : 's'} ${stats.invalidBytes === 1 ? 'is' : 'are'} not valid UTF-8 and ${stats.invalidBytes === 1 ? 'is' : 'are'} shown as \\xNN. A memo is bytes, not text.`,
        );
    }

    const panel = el('div', { className: 'memo' }, [
        el('div', { className: 'memo-head' }, [
            el('span', { className: 'memo-caption', text: caption }),
            el('span', { className: 'muted small', text: byteCount(memo.length) }),
            el('span', { className: 'spacer' }),
            ...toggles,
        ]),
        body,
        note,
        ...warnings.map((w) => el('p', { className: 'small warn-text', text: w })),
        el('p', {
            className: 'muted small',
            text: 'Shown as text, never interpreted. This page does not render memo content as markup, does not turn anything in it into a link, and does not act on escape sequences.',
        }),
    ]);

    render();
    return panel;
}

/**
 * The same treatment for the wrapper's optional locator, which 00003 defines as
 * NEVER evidence — so it gets a rendering and a disclaimer, not a link.
 */
export function locatorView(locator) {
    if (!locator || locator.length === 0) return null;
    return el('div', { className: 'sub' }, [
        el('p', { className: 'small' }, [
            el('strong', { text: 'Untrusted locator: ' }),
            el('span', { className: 'mono break', text: toUnicodeText(locator) }),
        ]),
        el('p', {
            className: 'muted small',
            text: `${byteCount(locator.length)} of caller-supplied hint. The format defines this field as never evidence: nothing was checked about it, and this page does not follow it anywhere.`,
        }),
    ]);
}

/**
 * Memo bytes that did NOT authenticate are never rendered by this module.
 * Callers that want to show them must say so explicitly, and get a panel that
 * says so too.
 */
export function unverifiedMemoView(memo) {
    const panel = memoView(memo, 'UNVERIFIED memo bytes — not authenticated');
    panel.classList.add('unverified');
    panel.prepend(
        el('p', {
            className: 'small warn-text',
            text: 'These bytes were parsed out of a wrapper that did NOT pass verification. They are shown only so you can see what was claimed. Nothing vouches for them.',
        }),
    );
    return panel;
}

export { fill };
