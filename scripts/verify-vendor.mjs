#!/usr/bin/env node
/**
 * verify-vendor.mjs — check the vendored WASM bundle against its manifest.
 *
 *   npm run verify:vendor
 *
 * This is an INTEGRITY check, not a tamper-evidence guarantee: it proves the
 * files in vendor/pkg/ are the ones recorded in vendor/pkg/SHA256SUMS and
 * described in vendor/PROVENANCE.md. Proving that those bytes are what the
 * pinned ledger commit actually produces means rebuilding from source — the
 * command is in PROVENANCE.md.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgDir = path.join(repoRoot, 'vendor', 'pkg');
const manifestPath = path.join(pkgDir, 'SHA256SUMS');

const sha256 = async (file) =>
    createHash('sha256').update(await readFile(file)).digest('hex');

async function listFiles(dir, prefix = '') {
    const out = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) out.push(...(await listFiles(path.join(dir, entry.name), rel)));
        else out.push(rel);
    }
    return out;
}

const manifest = new Map();
for (const line of (await readFile(manifestPath, 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    const [sum, ...rest] = line.split(/\s+/);
    manifest.set(rest.join(' '), sum);
}

const onDisk = (await listFiles(pkgDir)).filter((f) => f !== 'SHA256SUMS').sort();

let failures = 0;
for (const rel of onDisk) {
    const expected = manifest.get(rel);
    if (!expected) {
        console.error(`EXTRA    ${rel}  (present on disk, absent from SHA256SUMS)`);
        failures++;
        continue;
    }
    const actual = await sha256(path.join(pkgDir, rel));
    if (actual !== expected) {
        console.error(`MISMATCH ${rel}\n         expected ${expected}\n         actual   ${actual}`);
        failures++;
    }
}
for (const rel of manifest.keys()) {
    if (!onDisk.includes(rel)) {
        console.error(`MISSING  ${rel}  (listed in SHA256SUMS, absent on disk)`);
        failures++;
    }
}

if (failures) {
    console.error(`\nvendor/pkg FAILED: ${failures} problem(s) across ${manifest.size} manifest entries.`);
    process.exit(1);
}
console.log(`vendor/pkg OK: ${manifest.size} files match SHA256SUMS.`);
