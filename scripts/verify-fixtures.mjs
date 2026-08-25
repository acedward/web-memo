#!/usr/bin/env node
/**
 * verify-fixtures.mjs — check the frozen reference artifacts against their manifest.
 *
 *   npm run verify:fixtures
 *
 * Same shape as `verify-vendor.mjs`, same honesty: this proves the files in
 * `fixtures/` are the ones recorded in `fixtures/SHA256SUMS`. It does NOT prove
 * they are what the generator emits, and it cannot — halo2 proving is
 * randomised, so re-running the generator reproduces every nullifier and every
 * memo-hash but not the proof bytes. `fixtures/PROVENANCE.md` says so at
 * length.
 *
 * The manifest covers the frozen `.bin` artifacts only. `generator/`,
 * `META.txt` and the documentation beside them are text under version control,
 * where git already does this job.
 */

import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(repoRoot, 'fixtures');

const sha256 = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

const manifest = new Map();
for (const line of (await readFile(path.join(dir, 'SHA256SUMS'), 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    const [sum, ...rest] = line.split(/\s+/);
    manifest.set(rest.join(' '), sum);
}

const onDisk = (await readdir(dir)).filter((f) => f.endsWith('.bin')).sort();

let failures = 0;
for (const rel of onDisk) {
    const expected = manifest.get(rel);
    if (!expected) {
        console.error(`EXTRA    ${rel}  (present on disk, absent from SHA256SUMS)`);
        failures++;
        continue;
    }
    const actual = await sha256(path.join(dir, rel));
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
    console.error(`\nfixtures FAILED: ${failures} problem(s) across ${manifest.size} manifest entries.`);
    process.exit(1);
}
console.log(`fixtures OK: ${manifest.size} artifacts match SHA256SUMS.`);
