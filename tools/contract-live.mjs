#!/usr/bin/env node
/**
 * Runs the contract scenarios against a REAL eistedglobal API and reports which
 * of bythfod's assumptions hold.
 *
 * This writes data, so it is guarded: loopback only unless EISTED_ALLOW_REMOTE=1
 * is set explicitly, and it refuses to touch anything but the 2099 sandbox year.
 * It must never run in CI that deploys.
 *
 *   EISTED_USER=… EISTED_PASS=… node tools/contract-live.mjs
 *   [--base http://localhost:3000/api] [--only 11a,3b] [--keep]
 */
import { createValidator, createClient, loadSpec, SANDBOX } from '../test/contract/_harness.mjs';
import { scenarios } from '../test/contract/assumptions.contract.mjs';

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : dflt;
};
const has = (name) => process.argv.includes(`--${name}`);

const base = arg('base', process.env.EISTED_BASE_URL ?? 'http://localhost:3000/api');
const user = process.env.EISTED_USER;
const pass = process.env.EISTED_PASS;
const only = arg('only')?.split(',').map(s => s.trim());

// ── Safety ────────────────────────────────────────────────────────────────
const host = new URL(base).hostname;
const loopback = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host);
if (!loopback && process.env.EISTED_ALLOW_REMOTE !== '1') {
  console.error(`✘ refusing to write to a non-loopback API: ${base}`);
  console.error('  This suite CREATES and DELETES data. If you really mean it,');
  console.error('  set EISTED_ALLOW_REMOTE=1 — and never against production.');
  process.exit(2);
}
if (SANDBOX.YEAR === new Date().getFullYear()) {
  console.error('✘ the sandbox year equals the current year — refusing to run');
  process.exit(2);
}
if (!user || !pass) {
  console.error('✘ set EISTED_USER and EISTED_PASS (the eistedglobal seed credentials)');
  process.exit(2);
}

// ── Setup ─────────────────────────────────────────────────────────────────
const spec = loadSpec();
const expectValid = createValidator(spec);
const anon = createClient(base);

const health = await anon.get('/health').catch(() => null);
if (!health || health.status !== 200) {
  console.error(`✘ no API at ${base} — start it with \`npm run dev\` in eistedglobal`);
  process.exit(2);
}

const login = await anon.post('/auth/login', { username: user, password: pass });
if (login.status !== 200) {
  console.error(`✘ login failed (${login.status}): ${JSON.stringify(login.body)}`);
  process.exit(2);
}
expectValid('login', 200, login.body);

const api = anon.withToken(login.body.token);
const notes = [];
const ctx = {
  api, anon, expectValid, base,
  categoryId: null,
  track: { competitions: [], participants: [], registrations: [], categories: [] },
  note: (id, text) => notes.push({ id, text }),
};

// Seed the fixtures the scenarios share.
{
  const cats = await api.get('/categories');
  ctx.categoryId = (cats.body.find(c => c.name === 'Canto Individual') ?? cats.body[0])?.id;
  if (!ctx.categoryId) {
    const c = await api.post('/categories', { name: 'Canto Individual' });
    ctx.categoryId = c.body.id;
  }
  const ed = await api.post('/editions', { year: SANDBOX.YEAR });
  if (![201, 409].includes(ed.status)) {
    console.error(`✘ could not ensure edition ${SANDBOX.YEAR}: ${ed.status}`);
    process.exit(2);
  }
}

// ── Run ───────────────────────────────────────────────────────────────────
console.log(`contract · ${base} · sandbox year ${SANDBOX.YEAR}\n`);
let pass_ = 0, fail = 0;
const failures = [];

for (const s of scenarios) {
  if (only && !only.includes(s.id)) continue;
  try {
    await s.fn(ctx);
    console.log(`  ✔ [${s.id}] ${s.title}`);
    pass_++;
  } catch (err) {
    console.log(`  ✘ [${s.id}] ${s.title}`);
    failures.push({ id: s.id, title: s.title, err });
    fail++;
  }
}

// ── Cleanup ───────────────────────────────────────────────────────────────
if (!has('keep')) {
  for (const id of ctx.track.registrations) await api.patch(`/registrations/${id}/drop`).catch(() => {});
  for (const id of ctx.track.competitions) {
    for (const w of (await api.get(`/works?comp=${id}`)).body ?? []) await api.del(`/works/${w.id}`).catch(() => {});
    for (const r of (await api.get(`/registrations?comp=${id}`)).body ?? []) {
      await api.patch(`/registrations/${r.id}/drop`).catch(() => {});
    }
    // Best effort: a competition that ever had a registration cannot be deleted
    // (scenario 3b). Leaving it is the documented, expected residue.
    await api.del(`/competitions/${id}`).catch(() => {});
  }
  for (const id of ctx.track.participants) await api.del(`/participants/${id}`).catch(() => {});
  for (const id of ctx.track.categories) await api.del(`/categories/${id}`).catch(() => {});
}

// ── Report ────────────────────────────────────────────────────────────────
if (notes.length) {
  console.log('\nFindings:');
  for (const n of notes) console.log(`  [${n.id}] ${n.text}`);
}
if (failures.length) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`\n  [${f.id}] ${f.title}`);
    console.log(`    ${String(f.err.message).split('\n').join('\n    ')}`);
  }
}
console.log(`\n${pass_} held, ${fail} failed, of ${pass_ + fail} assumptions checked`);
process.exit(fail ? 1 : 0);
