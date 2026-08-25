/**
 * inert.js — inert rendering of untrusted bytes (00003 spec FR-018).
 *
 * A JavaScript port of the 00003 toolkit's `src/inert.rs`, character class for
 * character class. This is deliberately a PORT rather than a fresh design: the
 * question "which code points are unsafe to show as themselves" was answered
 * once, in the implementation an independent review looked at, and a second
 * opinion here would just be a second thing to keep in sync.
 *
 * ---------------------------------------------------------------------------
 * What "inert" means on a web page specifically
 * ---------------------------------------------------------------------------
 * Authentication says a spending witness authorized these bytes. It says
 * NOTHING about whether they are truthful, safe, or even text. So:
 *
 *   * every value reaches the DOM through `textContent`, never `innerHTML`,
 *     never `insertAdjacentHTML`, never an attribute that can execute. That is
 *     enforced by the renderer in `ui.js`; this module only produces strings.
 *   * escape sequences are not interpreted, because they are escaped here
 *     before display: `ESC` (0x1B) is a C0 control, so CSI colour sequences and
 *     OSC 8 terminal hyperlinks cannot survive a copy-paste out of this page
 *     into a terminal either.
 *   * bidi controls (RLO/LRO/RLI/LRI/PDF/PDI, LRM/RLM) are escaped, so the
 *     visual order of a rendering equals its logical order. This matters more
 *     in a browser than in a terminal: `textContent` stops markup, but it does
 *     NOT stop the bidi algorithm from reordering what is displayed.
 *   * nothing is ever autolinked. A memo containing `https://…` or
 *     `javascript:…` renders as those literal characters, which is data.
 *   * the byte length is always shown, and the hex view is always one click
 *     away, because "it looked empty" is a rendering, not a fact about bytes.
 */

const HEX = '0123456789abcdef';

/**
 * Whether `cp` (a code point) must be escaped even in the permissive Unicode
 * rendering. Exactly `is_inert_unsafe_char` from 00003 `src/inert.rs`.
 */
export function isInertUnsafeCodePoint(cp) {
    return (
        // C0 controls (includes ESC 0x1B, CR, LF, TAB) and DEL.
        (cp >= 0x0000 && cp <= 0x001f) || cp === 0x007f
        // C1 controls — 0x9B is a single-byte CSI on some terminals.
        || (cp >= 0x0080 && cp <= 0x009f)
        // Soft hyphen; Arabic letter mark.
        || cp === 0x00ad || cp === 0x061c
        // Zero-width space/non-joiner/joiner, LRM, RLM.
        || (cp >= 0x200b && cp <= 0x200f)
        // Line and paragraph separators.
        || cp === 0x2028 || cp === 0x2029
        // Bidi embeddings, overrides, and pop.
        || (cp >= 0x202a && cp <= 0x202e)
        // Word joiner and the invisible math operators.
        || (cp >= 0x2060 && cp <= 0x2064)
        // Bidi isolates (LRI/RLI/FSI/PDI) and the deprecated format block.
        || (cp >= 0x2066 && cp <= 0x206f)
        // Zero-width no-break space / BOM.
        || cp === 0xfeff
        // Interlinear annotation anchors.
        || (cp >= 0xfff9 && cp <= 0xfffb)
        // Musical notation format controls.
        || (cp >= 0x1d173 && cp <= 0x1d17a)
        // Language tag characters.
        || (cp >= 0xe0000 && cp <= 0xe007f)
    );
}

/**
 * The STRICTEST rendering: every output character is printable ASCII.
 *
 * `0x20..=0x7E` survive as themselves except `\`, which is doubled so the
 * escaping is unambiguous. Everything else becomes `\xNN`.
 */
export function toAsciiText(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i];
        if (b === 0x5c) out += '\\\\';
        else if (b >= 0x20 && b <= 0x7e) out += String.fromCharCode(b);
        else out += `\\x${HEX[b >> 4]}${HEX[b & 15]}`;
    }
    return out;
}

/**
 * Readable text where the bytes are valid UTF-8, with every unsafe code point
 * escaped as `\u{XXXX}` and every invalid byte rendered as `\xNN`.
 *
 * The UTF-8 decoder is hand-rolled rather than `TextDecoder`, because
 * `TextDecoder` replaces invalid sequences with U+FFFD — a LOSSY step that
 * would silently change content. `\xNN` loses nothing.
 */
export function toUnicodeText(bytes) {
    let out = '';
    let i = 0;
    const raw = (n) => {
        for (let k = 0; k < n; k++) {
            const b = bytes[i + k];
            out += `\\x${HEX[b >> 4]}${HEX[b & 15]}`;
        }
        i += n;
    };

    while (i < bytes.length) {
        const b0 = bytes[i];

        let need = 0;
        let cp = 0;
        let lo = 0;
        if (b0 < 0x80) { need = 0; cp = b0; lo = 0x00; }
        else if (b0 >= 0xc2 && b0 <= 0xdf) { need = 1; cp = b0 & 0x1f; lo = 0x80; }
        else if (b0 >= 0xe0 && b0 <= 0xef) { need = 2; cp = b0 & 0x0f; lo = 0x800; }
        else if (b0 >= 0xf0 && b0 <= 0xf4) { need = 3; cp = b0 & 0x07; lo = 0x10000; }
        else { raw(1); continue; }

        if (i + need >= bytes.length) {
            // Truncated multi-byte sequence at the end of the input.
            raw(1);
            continue;
        }

        let ok = true;
        for (let k = 1; k <= need; k++) {
            const bk = bytes[i + k];
            if ((bk & 0xc0) !== 0x80) { ok = false; break; }
            cp = (cp << 6) | (bk & 0x3f);
        }
        // Overlong, surrogate and out-of-range sequences are invalid UTF-8.
        if (ok && (cp < lo || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff))) ok = false;
        if (!ok) { raw(1); continue; }

        if (cp === 0x5c) out += '\\\\';
        else if (isInertUnsafeCodePoint(cp)) out += `\\u{${cp.toString(16).padStart(4, '0')}}`;
        else out += String.fromCodePoint(cp);
        i += need + 1;
    }
    return out;
}

/** The bytes as lowercase hex — the rendering with no interpretation at all. */
export function toHexText(bytes) {
    let out = '';
    for (let i = 0; i < bytes.length; i++) out += HEX[bytes[i] >> 4] + HEX[bytes[i] & 15];
    return out;
}

/**
 * A classic offset/hex/ASCII dump, 16 bytes per line. The ASCII gutter uses
 * `.` for every non-printable byte, so it can contain nothing active.
 */
export function toHexDump(bytes) {
    const lines = [];
    for (let off = 0; off < bytes.length; off += 16) {
        const row = bytes.subarray(off, off + 16);
        let hex = '';
        let ascii = '';
        for (let i = 0; i < 16; i++) {
            hex += i < row.length ? `${HEX[row[i] >> 4]}${HEX[row[i] & 15]} ` : '   ';
            if (i === 7) hex += ' ';
            if (i < row.length) ascii += row[i] >= 0x20 && row[i] <= 0x7e ? String.fromCharCode(row[i]) : '.';
        }
        lines.push(`${off.toString(16).padStart(8, '0')}  ${hex} |${ascii}|`);
    }
    return lines.length ? lines.join('\n') : '(no bytes)';
}

/**
 * How many code points in `bytes` had to be escaped, and how many raw bytes
 * were not valid UTF-8. Shown next to the text view so an apparently innocuous
 * memo cannot hide the fact that it contains active characters.
 */
export function inertStats(bytes) {
    const text = toUnicodeText(bytes);
    const escapedCodePoints = (text.match(/\\u\{[0-9a-f]+\}/g) || []).length;
    const invalidBytes = (text.match(/\\x[0-9a-f]{2}/g) || []).length;
    return { escapedCodePoints, invalidBytes };
}
