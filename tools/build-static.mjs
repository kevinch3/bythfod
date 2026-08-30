#!/usr/bin/env node
// Builds dist/ — the offline-only static site (GitHub Pages, Netlify, …).
//
// The deployed build must not carry API code or credentials: the eistedglobal
// API only allows one CORS origin, the sim is a WRITE client (it creates and
// deletes competitions, participants and registrations), and index.html ships
// admin defaults. So the API panel is stripped and the API layer is left out.
// Offline mode is fully self-contained: connect.js and its imports are reached
// only through dynamic import() from the connect handler, which is gone here.
import { cp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

// Copy compiled output, not sources: index.html loads out/main.js in dev and in
// dist alike, so nothing here rewrites script paths. The API layer is excluded
// wholesale; tools/assert-public-build.mjs verifies the result rather than
// trusting this filter.
await cp(join(root, 'css'), join(dist, 'css'), { recursive: true });
await cp(join(root, 'out'), join(dist, 'out'), {
  recursive: true,
  filter: p => !/[/\\](api|mock|contract)[/\\]?$|[/\\](api|mock|contract)[/\\]/.test(p),
});

let html = await readFile(join(root, 'index.html'), 'utf8');

// Replace the setup overlay's inner box: seed + start only.
const OPEN = '<div id="setup-box">';
const start = html.indexOf(OPEN);
const end = html.indexOf('</div>', html.lastIndexOf('<pre id="setupLog">'));
if (start === -1 || end === -1) throw new Error('setup-box markers not found in index.html');

const box = `<div id="setup-box">
    <h1>EISTEDDFOD BYTHFOD</h1>
    <p class="setup-tag">Porth Awel · simulación de un programa ficticio</p>
    <label>Seed <input id="inSeed" type="number" value="42"></label>
    <div id="setup-btns">
      <button id="bStartOffline">▶ COMENZAR</button>
    </div>
  `;
html = html.slice(0, start) + box + html.slice(end);

await writeFile(join(dist, 'index.html'), html);
await writeFile(join(dist, '.nojekyll'), ''); // GitHub Pages: serve _-prefixed paths as-is

console.log('dist/ built — offline-only static site');
