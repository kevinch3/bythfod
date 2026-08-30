// The contract suite, run against the in-process mock.
//
// These are the SAME scenario functions tools/contract-live.mjs runs against a
// real eistedglobal. One suite, two targets: if the mock and the real API ever
// disagree, one of them is wrong and this tells you which assertion caught it.
//
// Running here means the contract is checked in CI, with no server to start and
// no credentials — which is the whole reason the mock exists.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createValidator, createClient, loadSpec, SANDBOX } from './contract/_harness.mjs';
import { scenarios } from './contract/assumptions.contract.mjs';
import { createMockServer } from '../src/mock/index.ts';
import { CREDENTIALS } from '../src/mock/seed.ts';

let mock;
let ctx;

before(async () => {
  mock = await createMockServer({ port: 0, seed: 'basic' });

  const anon = createClient(mock.url);
  const login = await anon.post('/auth/login', {
    username: CREDENTIALS.username, password: CREDENTIALS.password,
  });
  assert.equal(login.status, 200, 'mock login failed');
  const api = anon.withToken(login.body.token);

  // The fixtures the scenarios share, exactly as the live runner sets them up.
  const cats = await api.get('/categories');
  const categoryId = (cats.body.find(c => c.name === 'Canto Individual') ?? cats.body[0])?.id;
  const ed = await api.post('/editions', { year: SANDBOX.YEAR });
  assert.ok([201, 409].includes(ed.status), `could not ensure edition: ${ed.status}`);

  ctx = {
    api, anon, base: mock.url, categoryId,
    expectValid: createValidator(loadSpec()),
    track: { competitions: [], participants: [], registrations: [], categories: [] },
    notes: [],
    note(id, text) { this.notes.push(`[${id}] ${text}`); },
  };
});

after(async () => { await mock?.close(); });

for (const s of scenarios) {
  test(`contract [${s.id}] ${s.title}`, async () => {
    await s.fn(ctx);
  });
}
