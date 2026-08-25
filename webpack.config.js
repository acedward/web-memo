import path from 'path';
import { fileURLToPath } from 'url';
import HtmlWebpackPlugin from 'html-webpack-plugin';
import CopyWebpackPlugin from 'copy-webpack-plugin';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// The vendored `ledger-wasm` bundle is deliberately kept OUT of the webpack
// module graph.
//
// `wasm-pack --target web` emits 26 `snippets/**/inlineN.js` files, each of
// which does `import * as wasm from '#self'`. `#self` is a Node subpath-import
// specifier. Browsers do not implement it and do not read package.json at all,
// so SOMETHING has to resolve it:
//
//   * If the glue goes through a bundler, the bundler resolves `#self` via the
//     package's own package.json "imports" field (webpack's
//     `resolve.importsFields` defaults to ["imports"]), which requires patching
//     the vendored package.json.
//   * If the glue is loaded by the browser directly, the browser resolves
//     `#self` as a BARE specifier — which an import map can and must remap.
//
// This app takes the second route, the same one the reference app
// (effectstream/zkir-wasm-experiment/webapp) takes: `src/wasm.js` imports the
// glue with `/* webpackIgnore: true */`, so webpack emits the import verbatim
// and the browser performs it at runtime against the import map declared in
// `public/index.html`. That is the fix that was proven in a real browser; the
// vendored pkg is therefore byte-identical to the wasm-pack output and its
// SHA-256 sums verify against a clean rebuild.
//
// CopyWebpackPlugin below is what puts the bundle at the URL the import map
// and the dynamic import both name: /pkg/.
// ---------------------------------------------------------------------------

export default {
    entry: {
        main: './src/index.js',
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].bundle.js',
        clean: true,
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['main'],
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    // The vendored wasm-pack `--target web` bundle, served as
                    // plain static files at /pkg/. Nothing here is parsed or
                    // rewritten by webpack.
                    from: 'vendor/pkg',
                    to: 'pkg',
                    globOptions: {
                        // Type declarations and the crate README are provenance
                        // material, not runtime assets — no need to ship them.
                        ignore: ['**/*.d.ts', '**/README.md'],
                    },
                    // `minimized: true` tells webpack this asset is final and
                    // must NOT be run through Terser in production mode.
                    //
                    // This is not cosmetic. Without it webpack minifies the
                    // copied glue (351 KiB -> 183 KiB) and all 26 snippets, and
                    // the deployed bytes then no longer match
                    // vendor/pkg/SHA256SUMS — the provenance chain in
                    // vendor/PROVENANCE.md would be broken by the build itself,
                    // and generated wasm-bindgen glue would be rewritten by a
                    // minifier for no benefit.
                    info: { minimized: true },
                },
            ],
        }),
    ],
    devServer: {
        static: { directory: path.resolve(__dirname, 'dist') },
        port: Number(process.env.PORT) || 8080,
        host: process.env.HOST || 'localhost',
    },
    performance: {
        // The vendored .wasm is ~19 MiB and is copied, not bundled. Webpack's
        // asset-size warnings would be pure noise.
        hints: false,
    },
};
