/**
 * prover.js — the only code in this repository that makes a network request.
 *
 * Task 3.3, owner decision Q-W2 = B. Every byte that ever leaves this page
 * leaves through `provingPost` below, which is what makes the SC-006 claim
 * ("the only egress is the proving payload, to the configured URL") checkable
 * rather than merely asserted: a network recorder can be pointed at this one
 * function's call sites.
 *
 * ---------------------------------------------------------------------------
 * WHAT GOES TO THE SERVER, STATED PRECISELY
 * ---------------------------------------------------------------------------
 * A proof server proves a statement about a witness, so it receives the
 * witness. Concretely, the payloads built by `createProvingTransactionPayload`
 * and `createMemoCompanionProvingPayload` contain the spend's proof preimage —
 * which includes the coin's nonce and value and the memo hash — and the memo
 * bytes themselves for the companion.
 *
 * What they do NOT contain, and what therefore never leaves the browser: the
 * seed, and the secret keys derived from it. That is a property of the payload
 * format, not of our carefulness, and the test suite asserts it by scanning
 * every outbound request body for the seed bytes.
 *
 * The page states all of this next to the button, before it is pressed.
 *
 * ---------------------------------------------------------------------------
 * WHY NO WORKER
 * ---------------------------------------------------------------------------
 * The plan allows "a worker/async so the page stays responsive". Measured, the
 * expensive steps are the two HTTP round trips (~3-8 s each); the WASM
 * construction either side of them is milliseconds. `await fetch` yields the
 * main thread for the whole of that, so the page is already responsive, and a
 * worker would add a copy of a 19 MiB module for no gain. The test suite proves
 * responsiveness rather than assuming it: it ticks a `requestAnimationFrame`
 * counter for the duration of a real Create run and asserts it kept advancing.
 */

/** The port the pinned `midnight-proof-server` listens on by default. */
export const DEFAULT_PROOF_SERVER_PORT = 6300;

/** The default URL. localhost, never a third party — FR-009 forbids the latter. */
export const DEFAULT_PROOF_SERVER_URL = `http://localhost:${DEFAULT_PROOF_SERVER_PORT}`;

const STORAGE_KEY = 'webmemo.proofServerUrl';

/** Endpoint that proves a whole transaction (the offer file). */
export const PATH_PROVE_TX = '/prove-tx';
/** Endpoint that proves a single preimage (the memo companion). */
export const PATH_PROVE = '/prove';

export class ProvingError extends Error {
    constructor(code, message, detail = {}) {
        super(message);
        this.name = 'ProvingError';
        this.code = code;
        this.detail = detail;
    }
}

export const PROVING_CODES = Object.freeze({
    BAD_URL: 'PROOF_SERVER_URL_INVALID',
    UNREACHABLE: 'PROOF_SERVER_UNREACHABLE',
    HTTP_ERROR: 'PROOF_SERVER_HTTP_ERROR',
    CANCELLED: 'CANCELLED',
});

/**
 * Read the configured URL.
 *
 * localStorage can throw outright (Safari private mode, a blocked third-party
 * context), so every access is guarded: a browser that refuses storage gets the
 * default and a working page, not an exception on load.
 */
export function loadProofServerUrl() {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (stored && normaliseUrl(stored).ok) return normaliseUrl(stored).url;
    } catch { /* storage unavailable — fall through to the default */ }
    return DEFAULT_PROOF_SERVER_URL;
}

/** Persist the URL. Returns the normalised value actually stored. */
export function saveProofServerUrl(raw) {
    const result = normaliseUrl(raw);
    if (!result.ok) throw new ProvingError(PROVING_CODES.BAD_URL, result.message);
    try {
        window.localStorage.setItem(STORAGE_KEY, result.url);
    } catch { /* not persisting is a degraded experience, not a failure */ }
    return result.url;
}

/**
 * Validate and canonicalise a proof-server base URL.
 *
 * Only `http:` and `https:` are accepted, and any path, query or fragment is
 * dropped — this is a base, and the two endpoint paths are appended to it. A
 * user who pastes `http://localhost:6300/prove` gets `http://localhost:6300`
 * rather than a request to `/prove/prove`.
 */
export function normaliseUrl(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (text === '') {
        return { ok: false, message: 'The proof-server URL is empty.' };
    }
    let parsed;
    try {
        parsed = new URL(text);
    } catch {
        return {
            ok: false,
            message: `"${text}" is not a URL. It should look like ${DEFAULT_PROOF_SERVER_URL}.`,
        };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
            ok: false,
            message: `"${parsed.protocol}" is not a scheme this page will call. Use http: or https:.`,
        };
    }
    return { ok: true, url: `${parsed.protocol}//${parsed.host}` };
}

/**
 * POST a proving payload.
 *
 * @param {string} baseUrl        the configured base
 * @param {string} path           PATH_PROVE or PATH_PROVE_TX
 * @param {Uint8Array} payload    the bytes built by the WASM module
 * @param {AbortSignal} [signal]  cancellation
 * @returns {Promise<{bytes: Uint8Array, ms: number}>}
 */
export async function provingPost(baseUrl, path, payload, signal) {
    const { ok, url, message } = normaliseUrl(baseUrl);
    if (!ok) throw new ProvingError(PROVING_CODES.BAD_URL, message);

    const started = performance.now();
    let response;
    try {
        response = await fetch(`${url}${path}`, {
            method: 'POST',
            headers: { 'content-type': 'application/octet-stream' },
            body: payload,
            signal,
            // No credentials, ever: this is a compute service, and sending
            // cookies to whatever host the user typed would be a gift to a
            // hostile one.
            credentials: 'omit',
            cache: 'no-store',
            referrerPolicy: 'no-referrer',
        });
    } catch (err) {
        if (signal && signal.aborted) {
            throw new ProvingError(PROVING_CODES.CANCELLED, 'Cancelled.');
        }
        throw new ProvingError(
            PROVING_CODES.UNREACHABLE,
            `Could not reach the proof server at ${url}${path}. ` +
            `Is it running, and is that the right URL? (${String(err && err.message ? err.message : err)})`,
            { url, path },
        );
    }

    if (!response.ok) {
        let body = '';
        try { body = (await response.text()).slice(0, 400); } catch { /* body already consumed or binary */ }
        throw new ProvingError(
            PROVING_CODES.HTTP_ERROR,
            `The proof server answered ${response.status} ${response.statusText} for ${path}.` +
            (body ? ` It said: ${body}` : ''),
            { status: response.status, path },
        );
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    return { bytes, ms: Math.round(performance.now() - started) };
}

/**
 * A liveness check, used by the "Check" button so a user can find out the
 * server is not running *before* spending a minute wondering.
 *
 * Deliberately reports the server's own version string: mismatched proof-server
 * versions are a real failure mode, and "it answered, and it is 9.0.0-rc.3" is a
 * more useful answer than a green tick.
 */
export async function checkProofServer(baseUrl, signal) {
    const { ok, url, message } = normaliseUrl(baseUrl);
    if (!ok) throw new ProvingError(PROVING_CODES.BAD_URL, message);
    let health;
    try {
        health = await fetch(`${url}/health`, { signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    } catch (err) {
        if (signal && signal.aborted) throw new ProvingError(PROVING_CODES.CANCELLED, 'Cancelled.');
        throw new ProvingError(
            PROVING_CODES.UNREACHABLE,
            `No answer from ${url}. (${String(err && err.message ? err.message : err)})`,
            { url },
        );
    }
    if (!health.ok) {
        throw new ProvingError(
            PROVING_CODES.HTTP_ERROR,
            `${url}/health answered ${health.status} ${health.statusText}.`,
            { status: health.status },
        );
    }
    let version = null;
    try {
        const res = await fetch(`${url}/version`, { signal, credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
        if (res.ok) version = (await res.text()).trim();
    } catch { /* /version is a nicety; /health answering is the real check */ }
    return { url, version };
}
