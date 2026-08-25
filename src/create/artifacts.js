/**
 * artifacts.js — showing, copying and downloading the two produced artifacts.
 *
 * Task 3.4. The rule that shapes this file: **raw bytes are canonical, the
 * bech32m string is a rendering.** So the download hands over the bytes, the
 * copy button hands over the string, and the page says which is which — because
 * a reader who assumes the pretty string is the artifact will eventually
 * round-trip it through something that mangles case or whitespace.
 *
 * The `swapmsg` prefix is PROVISIONAL (00003 Q-10 is open). It is labelled that
 * way at the point of use, not only in the README, since this is where someone
 * copies it into an email.
 */

import { byteCount } from '../lib/bytes.js';
import { button, el } from '../lib/dom.js';

/** Offer a `Uint8Array` to the user as a file download. */
export function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    // `dom.el` refuses to set `href` — deliberately, because that is the
    // attribute that turns text into navigation. This anchor is built by hand,
    // right here, with a URL this function created from bytes this page
    // produced: no user-controlled value reaches it.
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    // Revoke on the next turn: revoking synchronously can race the download in
    // some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Copy text to the clipboard, falling back for browsers or contexts where the
 * async Clipboard API is unavailable (it needs a secure context, and this page
 * is explicitly expected to be served over plain http during local testing).
 */
export async function copyText(text) {
    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch { /* fall through to the legacy path */ }
    try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', 'readonly');
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.append(area);
        area.select();
        const ok = document.execCommand('copy');
        area.remove();
        return ok;
    } catch {
        return false;
    }
}

/**
 * Render one artifact card.
 *
 * @param {object} artifact `{ hrp, filename, bytes, bech32m }`
 * @param {object} meta `{ title, what, provisional }`
 */
export function artifactCard(artifact, meta) {
    const text = el('textarea', {
        className: 'paste artifact-text',
        attrs: { rows: '4', spellcheck: 'false', readonly: 'readonly', 'data-artifact': artifact.kind },
    });
    text.value = artifact.bech32m;

    const status = el('span', { className: 'muted small', text: '' });

    const copyBtn = button('Copy the bech32m string', async () => {
        const ok = await copyText(artifact.bech32m);
        status.textContent = ok
            ? `Copied ${artifact.bech32m.length.toLocaleString('en-US')} characters.`
            : 'The browser refused clipboard access — select the text above and copy it manually.';
    }, 'primary');
    copyBtn.dataset.copy = artifact.kind;

    const downloadBtn = button(`Download the raw bytes (${byteCount(artifact.bytes.length)})`, () => {
        downloadBytes(artifact.bytes, artifact.filename);
        status.textContent = `Saved as ${artifact.filename}.`;
    });
    downloadBtn.dataset.download = artifact.kind;

    return el('div', { className: 'card artifact', dataset: { artifact: artifact.kind } }, [
        el('h3', { text: meta.title }),
        el('p', { className: 'muted small', text: meta.what }),
        text,
        el('div', { className: 'controls' }, [copyBtn, downloadBtn, el('span', { className: 'spacer' }), status]),
        el('p', { className: 'muted small' }, [
            el('span', { text: `Prefix "${artifact.hrp}"` }),
            meta.provisional
                ? el('strong', { className: 'warn-text', text: ' — PROVISIONAL. ' })
                : el('span', { text: ' — ' }),
            el('span', {
                text: meta.provisional
                    ? 'This prefix is a proposal, not a ratified convention, and may change. The raw bytes are what is canonical; the string above is a rendering of them.'
                    : 'The raw bytes are what is canonical; the string above is a rendering of them.',
            }),
        ]),
    ]);
}

/** The disclaimer that sits with the artifacts, per FR-010. */
export function demoDisclaimer(result) {
    return el('div', { className: 'banner' }, [
        el('strong', { text: 'These artifacts are real proofs over an imaginary coin.' }),
        el('br'),
        el('span', {
            text:
                `The spend and the memo companion both verify — this page just verified them itself, offline — and the ` +
                `bytes are exactly what the pinned ledger deserializes. But the coin was minted moments ago into a ` +
                `commitment tree that exists only in this browser tab, so this transaction could never settle on any ` +
                `chain. It is a demonstration of a format, not an offer anyone can take.`,
        }),
        el('br'),
        el('span', {
            className: 'small',
            text:
                `Demo seed (${result.seedMode}): ${result.seedHex}. It is printed here precisely because it is worthless — ` +
                `it controls one coin, in a state nobody else has. Never put a seed that controls real funds into any page.`,
        }),
    ]);
}
