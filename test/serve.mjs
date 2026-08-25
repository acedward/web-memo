/**
 * serve.mjs — a dependency-free static server for the test suite.
 *
 * It serves `dist/` exactly as Cloudflare Pages would: static files, correct
 * types, no rewriting. Two content types are load-bearing:
 *
 *   * `application/wasm` — Chrome's `WebAssembly.instantiateStreaming` refuses
 *     anything else, and the wasm-bindgen web target uses it.
 *   * `text/javascript` for `.js` — otherwise `<script type="module">` graphs
 *     never load.
 *
 * The port is always chosen by the caller from the free-port helper below, and
 * is always above 10000, per this workspace's shared-host rules.
 */

import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.wasm': 'application/wasm',
    '.txt': 'text/plain; charset=utf-8',
    '.bin': 'application/octet-stream',
    '.map': 'application/json; charset=utf-8',
};

/** A random port above 10000, verified free by binding it first. */
export async function freePort() {
    for (let attempt = 0; attempt < 200; attempt++) {
        const candidate = 10000 + Math.floor(Math.random() * 45000);
        const ok = await new Promise((resolve) => {
            const s = net.createServer();
            s.once('error', () => resolve(false));
            s.listen(candidate, '127.0.0.1', () => s.close(() => resolve(true)));
        });
        if (ok) return candidate;
    }
    throw new Error('could not find a free port above 10000');
}

export function serve(root, port) {
    const base = path.resolve(root);
    const server = http.createServer((req, res) => {
        let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
        if (p.endsWith('/')) p += 'index.html';
        const file = path.join(base, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
        if (!file.startsWith(base)) { res.writeHead(403).end('forbidden'); return; }
        fs.readFile(file, (err, data) => {
            if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }).end(`not found: ${p}`); return; }
            res.writeHead(200, {
                'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
                'Content-Length': data.length,
                'Cache-Control': 'no-store',
            });
            res.end(data);
        });
    });
    return new Promise((resolve, reject) => {
        server.on('error', reject);
        server.listen(port, '127.0.0.1', () => resolve(server));
    });
}
