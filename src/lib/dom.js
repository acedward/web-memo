/**
 * dom.js — the only way this page builds DOM.
 *
 * There is exactly one rule here and the whole FR-018 story rests on it:
 * **text always goes in through `textContent`.** No `innerHTML`, no
 * `insertAdjacentHTML`, no template strings interpolated into markup, anywhere
 * in this codebase. `el()` takes a `text` option and nothing that could carry
 * markup, so the unsafe call is not merely discouraged — it is not reachable
 * through the helper.
 *
 * Attribute setting is likewise restricted: `href`, `src` and `on*` are refused,
 * because those are the attributes that turn attacker-controlled text into
 * navigation or execution. Static links in the page are written in the HTML
 * template, where no untrusted value can reach them.
 */

const FORBIDDEN_ATTR = /^(on|href$|src$|xlink:|formaction$|action$|style$)/i;

/**
 * Create an element.
 *
 * @param {string} tag
 * @param {object} [opts] `{ text, className, id, attrs, dataset, title }`
 * @param {Array<Node|string|null|undefined>} [children]
 */
export function el(tag, opts = {}, children = []) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.id) node.id = opts.id;
    if (opts.text !== undefined && opts.text !== null) node.textContent = String(opts.text);
    if (opts.title) node.title = String(opts.title);
    if (opts.attrs) {
        for (const [k, v] of Object.entries(opts.attrs)) {
            if (FORBIDDEN_ATTR.test(k)) {
                throw new Error(`dom.el refuses to set the attribute "${k}"`);
            }
            node.setAttribute(k, String(v));
        }
    }
    if (opts.dataset) {
        for (const [k, v] of Object.entries(opts.dataset)) node.dataset[k] = String(v);
    }
    for (const child of children) {
        if (child === null || child === undefined) continue;
        node.append(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
}

/** Replace an element's children. */
export function fill(node, ...children) {
    node.replaceChildren(...children.flat().filter((c) => c !== null && c !== undefined));
    return node;
}

/** A two-column definition row for the report tables. */
export function row(label, value, className) {
    return el('tr', {}, [
        el('th', { text: label }),
        el('td', { text: value === undefined || value === null ? '—' : String(value), className }),
    ]);
}

/** A `<button>` with a click handler. */
export function button(text, onClick, className = '') {
    const b = el('button', { text, className, attrs: { type: 'button' } });
    b.addEventListener('click', onClick);
    return b;
}
