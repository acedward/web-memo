/**
 * wasm.js — the single entry point to the vendored `ledger-wasm` bundle.
 *
 * Everything the page does cryptographically goes through the module this
 * returns. Later phases (Read / Create) import from here rather than reaching
 * into /pkg/ themselves, so the loading contract lives in exactly one file.
 *
 * ---------------------------------------------------------------------------
 * Why `webpackIgnore`
 * ---------------------------------------------------------------------------
 * The import below is marked `/* webpackIgnore: true *\/`, so webpack emits it
 * verbatim and the BROWSER performs the import at runtime. That is deliberate,
 * not a workaround for a bundling failure:
 *
 *   - The wasm-pack glue pulls in 26 snippets that each `import * as wasm from
 *     '#self'`. A bundler would resolve `#self` through the package's
 *     package.json "imports" map (requiring the vendored package.json to be
 *     patched); a browser resolves it through an import map. This app uses the
 *     import map declared in public/index.html, which keeps the vendored pkg
 *     byte-identical to the wasm-pack output — so its SHA-256 sums verify
 *     against a clean rebuild (see vendor/PROVENANCE.md).
 *   - It is also what the reference app this scaffold follows does
 *     (effectstream/zkir-wasm-experiment/webapp/src/keygen.js).
 *
 * The URL below and the import map's `#self` target MUST stay identical, or
 * the browser will instantiate the glue twice and the snippets will bind to a
 * module whose `wasm` export is still undefined.
 */

/** Absolute URL of the vendored glue. Must match the import map in index.html. */
export const GLUE_URL = '/pkg/midnight_ledger_wasm_v9.js';

/** Absolute URL of the vendored WebAssembly binary. */
export const WASM_URL = '/pkg/midnight_ledger_wasm_v9_bg.wasm';

let modulePromise = null;

/** Milliseconds the last (first) initialisation took. `null` until loaded. */
export let initMs = null;

/**
 * Load and initialise the ledger WASM module.
 *
 * Memoised: concurrent and repeat callers share one instantiation.
 *
 * @returns {Promise<object>} the module namespace (all exports, incl. the 13
 *   memo bindings — see docs/js-api-notes.md for their sharp edges).
 */
export function loadLedgerWasm() {
    if (modulePromise) return modulePromise;

    modulePromise = (async () => {
        if (typeof WebAssembly !== 'object') {
            throw new Error(
                'This browser does not support WebAssembly, which this page requires.',
            );
        }

        const t0 = performance.now();
        const wasm = await import(/* webpackIgnore: true */ GLUE_URL);
        await wasm.default({ module_or_path: new URL(WASM_URL, window.location.origin) });
        initMs = Math.round(performance.now() - t0);
        return wasm;
    })().catch((err) => {
        // Do not cache a failure: a retry (e.g. after a transient network
        // error fetching the 19 MiB binary) should be able to succeed.
        modulePromise = null;
        throw err;
    });

    return modulePromise;
}

/** The 13 memo bindings this project consumes, per 00003. */
export const MEMO_EXPORTS = Object.freeze([
    'memoHashV1',
    'memoAnchorEncode',
    'memoAnchorDecode',
    'memoAnchorScan',
    'memoAnchorTokenTypeOf',
    'createMemoAnchorOutput',
    'createMemoCompanionProvingPayload',
    'memoWrapperBuild',
    'memoWrapperParse',
    'memoWrapperVerify',
    'memoWrapperToBech32m',
    'memoWrapperFromBech32m',
    'memoWrapperDefaultHrp',
]);
