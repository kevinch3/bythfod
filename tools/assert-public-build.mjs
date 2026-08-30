#!/usr/bin/env node
// Tripwire for the public build. Run AFTER build-static.mjs, in CI and locally.
//
// dist/ is published to GitHub Pages. It must never carry API client code or
// credentials: the eistedglobal API allows exactly one CORS origin, the sim is a
// write client, and index.html once shipped admin defaults (fixed in b9bfbf8).
// build-static.mjs achieves that by omitting files — this asserts the result,
// so the guarantee survives refactors that change how the build is produced.
//
// Exits 0 when dist/ is clean, 1 with a report when it is not.
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

// Directories that must never appear in the published build.
const FORBIDDEN_DIRS = ['api', 'mock', 'contract'];

// Secrets and API machinery. Matched against the text of every shipped file.
// `API_BASE` and `prepareSandbox` are the load-bearing ones: they only exist in
// the API layer, so a hit means js/api (or its successor) leaked into dist.
const FORBIDDEN_TEXT = [
  [/auth\/login/, 'login endpoint'],
  [/Bearer /, 'bearer token header'],
  [/prepareSandbox/, 'sandbox populator'],
  [/API_BASE/, 'API base URL'],
  [/EISTED_(USER|PASS)/, 'credential env var'],
  [/admin1234/, 'seed password'],
];

// Setup-form elements that only exist in the dev build's credential panel.
const FORBIDDEN_IDS = ['inUser', 'inPass', 'bConnect'];

const failures = [];

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

if (!existsSync(dist)) {
  console.error('✘ dist/ does not exist — run `node tools/build-static.mjs` first');
  process.exit(1);
}

const files = await walk(dist);

// 1. No forbidden directories.
for (const f of files) {
  const rel = relative(dist, f);
  const parts = rel.split(sep);
  for (const bad of FORBIDDEN_DIRS) {
    if (parts.includes(bad)) failures.push(`forbidden directory "${bad}/" — ${rel}`);
  }
}

// 2. No secrets or API machinery in any shipped text file.
for (const f of files) {
  const rel = relative(dist, f);
  if (!/\.(js|mjs|html|css|json|map)$/.test(rel)) continue;
  const src = await readFile(f, 'utf8');
  for (const [re, what] of FORBIDDEN_TEXT) {
    if (re.test(src)) failures.push(`${what} (${re}) in ${rel}`);
  }
}

// 3. No credential panel in the entry page.
const indexPath = join(dist, 'index.html');
if (!existsSync(indexPath)) {
  failures.push('index.html missing from dist/');
} else {
  const html = await readFile(indexPath, 'utf8');
  for (const id of FORBIDDEN_IDS) {
    if (html.includes(`id="${id}"`)) failures.push(`credential-panel element #${id} in index.html`);
  }
  // Sanity: the offline start button must survive, or the build is broken in the
  // other direction — shipping a page nobody can start.
  if (!html.includes('id="bStartOffline"')) {
    failures.push('index.html has no #bStartOffline — the build has no way to start');
  }
}

const sizeMb = (await Promise.all(files.map(f => stat(f).then(s => s.size))))
  .reduce((a, b) => a + b, 0) / 1048576;

if (failures.length) {
  console.error(`✘ public build assertion FAILED (${failures.length} problem(s)):\n`);
  for (const f of failures) console.error(`   • ${f}`);
  console.error('\n  dist/ must not ship API code or credentials. See tools/build-static.mjs.');
  process.exit(1);
}

console.log(`✔ public build clean — ${files.length} files, ${sizeMb.toFixed(2)} MB`);
console.log(`  no ${FORBIDDEN_DIRS.map(d => `${d}/`).join(', ')} · no credentials · no API machinery`);
