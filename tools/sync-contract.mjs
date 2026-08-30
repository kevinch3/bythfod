#!/usr/bin/env node
/**
 * Vendors eistedglobal's OpenAPI spec (and SQL schema) into contract/.
 *
 * bythfod is a separate repository and must build without eistedglobal checked
 * out, so the contract is copied in rather than imported. contract/SOURCE.json
 * records where each file came from and its hash, so staleness is visible.
 *
 * Deliberately manual — syncing is a decision, not a side effect of a build.
 *
 *   node tools/sync-contract.mjs [--from <path-to-eistedglobal-revamp>] [--check]
 */
import { copyFileSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'contract');

const argv = process.argv.slice(2);
const check = argv.includes('--check');
const fromFlag = argv.indexOf('--from');
const source = resolve(
  fromFlag > -1 ? argv[fromFlag + 1]
    : process.env.EISTEDGLOBAL_PATH ?? join(root, '../web/revamps/eistedglobal-revamp'),
);

const FILES = [
  { from: 'api/openapi.yaml', to: 'openapi.yaml' },
  { from: 'api/src/config/schema.sql', to: 'schema.sql' },
];

const sha = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

if (!existsSync(source)) {
  console.error(`✘ source repo not found: ${source}`);
  console.error('  pass --from <path> or set EISTEDGLOBAL_PATH');
  process.exit(1);
}

let drift = false;
const manifest = { repo: 'eistedglobal-revamp', source, syncedAt: new Date().toISOString(), files: {} };

try {
  manifest.commit = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
} catch {
  manifest.commit = null;
}

mkdirSync(dest, { recursive: true });

for (const f of FILES) {
  const src = join(source, f.from);
  const dst = join(dest, f.to);
  if (!existsSync(src)) { console.error(`✘ missing in source: ${f.from}`); process.exit(1); }
  const upstream = sha(src);

  if (check) {
    if (!existsSync(dst)) { console.error(`✘ ${f.to}: not vendored yet`); drift = true; continue; }
    if (sha(dst) !== upstream) {
      console.error(`✘ ${f.to}: differs from ${f.from} — run \`node tools/sync-contract.mjs\``);
      drift = true;
    } else {
      console.log(`✔ ${f.to}: in sync`);
    }
  } else {
    copyFileSync(src, dst);
    console.log(`✔ ${f.to} ← ${f.from}  (sha256 ${upstream.slice(0, 16)})`);
  }
  manifest.files[f.to] = { from: f.from, sha256: upstream };
}

if (check) process.exit(drift ? 1 : 0);

writeFileSync(join(dest, 'SOURCE.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`  provenance written to contract/SOURCE.json (commit ${manifest.commit?.slice(0, 7) ?? 'unknown'})`);
