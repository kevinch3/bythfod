import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../js/api/client.js';
import { prepareSandbox, CATEGORY_BY_KIND } from '../js/api/sandbox.js';

const CONFIG = { API_BASE: 'http://x/api', SIM_YEAR: 2099, COMP_PREFIX: 'BY' };

const PLAN = {
  seed: 1,
  sessions: [{
    id: 's1', label: 'S1',
    items: [
      {
        ordinal: 1, compId: 'BY209901', rank: 0,
        program: { comp: 42, kind: 'solo', label: 'Solo 12-16', piece: 'Cân', language: 'es', entrantType: 'IND' },
        entrants: [
          { key: 'e1-1', displayName: 'A Jones', person: { name: 'A', surname: 'Jones' } },
          { key: 'e1-2', displayName: 'B Evans', person: { name: 'B', surname: 'Evans' } },
        ],
        placements: [{ entrantKey: 'e1-1', placement: '1' }, { entrantKey: 'e1-2', placement: '2' }],
      },
      {
        ordinal: 2, compId: 'BY209902', rank: 1,
        program: { ceremony: 'telyn', kind: 'ceremony', label: 'Gwobr Telyn', piece: 'Cerdd', language: 'cy', entrantType: 'IND' },
        entrants: [{ key: 'e2-1', displayName: 'C Roberts', person: { name: 'C', surname: 'Roberts' } }],
        placements: [{ entrantKey: 'e2-1', placement: '1' }],
      },
      {
        ordinal: 3, compId: 'BY209903', rank: 2,
        program: { comp: 50, kind: 'coro', label: 'Coro escolar', language: 'es', entrantType: 'GRU' },
        entrants: [{ key: 'e3-1', displayName: 'Côr X', members: 8 }],
        placements: 'desierto',
      },
    ],
  }],
};

function fakeClient({ categories = [], competitions = [], works = {}, registrations = {}, participants = [] } = {}) {
  const calls = [];
  let nextId = 100;
  const rec = (name, impl) => (...args) => {
    calls.push([name, ...args]);
    return Promise.resolve(impl ? impl(...args) : {});
  };
  const client = {
    calls,
    login: rec('login', () => ({ token: 't' })),
    getCategories: rec('getCategories', () => categories),
    createCategory: rec('createCategory', d => ({ id: nextId++, ...d })),
    createEdition: rec('createEdition', () => ({ year: 2099 })),
    updateEdition: rec('updateEdition', () => ({})),
    getCompetitions: rec('getCompetitions', () => competitions),
    createCompetition: rec('createCompetition', d => d),
    updateCompetition: rec('updateCompetition', (id, d) => d),
    getWorks: rec('getWorks', comp => works[comp] ?? []),
    deleteWork: rec('deleteWork', () => null),
    getRegistrations: rec('getRegistrations', ({ comp }) => registrations[comp] ?? []),
    dropRegistration: rec('dropRegistration', () => ({})),
    getParticipants: rec('getParticipants', () => participants),
    createParticipant: rec('createParticipant', d => ({ id: nextId++, ...d })),
    deleteParticipant: rec('deleteParticipant', () => null),
    createRegistration: rec('createRegistration', d => ({ id: nextId++, ...d })),
    createWork: rec('createWork', d => ({ id: nextId++, ...d })),
    enqueue: fn => fn(),
  };
  return client;
}

const prep = client => prepareSandbox({ plan: PLAN, config: CONFIG, username: 'u', password: 'p', client });

test('creates only the categories that are missing', async () => {
  const client = fakeClient({
    categories: [{ id: 1, name: 'Canto Individual' }, { id: 2, name: 'Recitado' }],
  });
  await prep(client);
  const created = client.calls.filter(c => c[0] === 'createCategory').map(c => c[1].name);
  const needed = [...new Set(PLAN.sessions[0].items.map(i => CATEGORY_BY_KIND[i.program.kind]))];
  for (const name of needed) {
    if (name === 'Canto Individual') assert.ok(!created.includes(name), 'existing category recreated');
    else assert.ok(created.includes(name), `missing category ${name} not created`);
  }
});

test('tolerates an existing edition (409) and sets its flavor', async () => {
  const client = fakeClient();
  client.createEdition = (...args) => { client.calls.push(['createEdition', ...args]); return Promise.reject(new ApiError(409, { error: 'Edition already exists' })); };
  await prep(client);
  const upd = client.calls.find(c => c[0] === 'updateEdition');
  assert.ok(upd, 'updateEdition not called');
  assert.equal(upd[1], 2099);
  assert.ok(upd[2].committee.length > 3);
});

test('reset deletes works before dropping registrations, then soft-deletes SIM participants', async () => {
  const client = fakeClient({
    competitions: [{ id: 'BY209901' }, { id: 'CH209801' }],
    works: { BY209901: [{ id: 7 }] },
    registrations: { BY209901: [{ id: 8 }] },
    participants: [{ id: 9, document_id: 'SIM-1-1' }],
  });
  await prep(client);
  const names = client.calls.map(c => c[0]);
  const iDelWork = names.indexOf('deleteWork');
  const iDrop = names.indexOf('dropRegistration');
  const iDelPart = names.indexOf('deleteParticipant');
  assert.ok(iDelWork >= 0 && iDrop >= 0 && iDelPart >= 0, 'reset steps missing');
  assert.ok(iDelWork < iDrop, 'works must be deleted before registrations are dropped');
  assert.ok(!client.calls.some(c => c[0] === 'getWorks' && c[1] === 'CH209801'), 'touched a non-sandbox competition');
});

test('publishPlan upserts: PUT for existing comps, POST for new, with language mapped', async () => {
  const client = fakeClient({ competitions: [{ id: 'BY209901' }] });
  await prep(client);
  const put = client.calls.find(c => c[0] === 'updateCompetition' && c[1] === 'BY209901');
  assert.ok(put, 'existing competition not updated');
  assert.equal(put[2].rank, 0);
  assert.equal(put[2].language, 'Castellano');
  const posts = client.calls.filter(c => c[0] === 'createCompetition').map(c => c[1]);
  assert.deepEqual(posts.map(p => p.id).sort(), ['BY209902', 'BY209903']);
  assert.equal(posts.find(p => p.id === 'BY209902').language, 'Cymraeg');
  assert.equal(posts.find(p => p.id === 'BY209903').type, 'GRU');
});

test('registrations are created per entrant; ceremonies carry a pseudonym', async () => {
  const client = fakeClient();
  await prep(client);
  const regs = client.calls.filter(c => c[0] === 'createRegistration').map(c => c[1]);
  assert.equal(regs.length, 4); // 2 + 1 + 1 entrants
  for (const r of regs) assert.equal(r.year, 2099);
  const ceremonyReg = regs.find(r => r.competition_id === 'BY209902');
  assert.ok(ceremonyReg.pseudonym?.length > 2, 'ceremony registration lacks pseudonym');
  assert.ok(!regs.find(r => r.competition_id === 'BY209901').pseudonym);
});

test('stale sandbox competitions not in the plan get parked as vacante with a high rank', async () => {
  const client = fakeClient({
    competitions: [{ id: 'BY209977', category_id: 3, type: 'IND', language: 'Castellano', description: 'Comp.99 — old real data' }],
  });
  await prep(client);
  const parked = client.calls.find(c => c[0] === 'updateCompetition' && c[1] === 'BY209977');
  assert.ok(parked, 'stale competition was not parked');
  assert.ok(parked[2].rank >= 900, `stale rank ${parked[2].rank} should sort last`);
  assert.match(parked[2].description, /vacante/i);
  assert.equal(parked[2].category_id, 3, 'must preserve the row own category');
});

test('award posts one work per placement; desierto posts nothing', async () => {
  const client = fakeClient();
  const sandbox = await prep(client);
  const before = client.calls.length;
  await sandbox.award(PLAN.sessions[0].items[0]);
  const works = client.calls.slice(before).filter(c => c[0] === 'createWork').map(c => c[1]);
  assert.equal(works.length, 2);
  assert.deepEqual(works.map(w => w.placement).sort(), ['1', '2']);
  assert.equal(works[0].competition_id, 'BY209901');
  assert.ok(Number.isInteger(works[0].participant_id), 'participant_id must come from the created participants');
  assert.equal(works.find(w => w.placement === '1').display_name, 'A Jones');

  const b2 = client.calls.length;
  await sandbox.award(PLAN.sessions[0].items[2]); // desierto
  assert.equal(client.calls.slice(b2).filter(c => c[0] === 'createWork').length, 0);
});

test('redraw deletes the existing works then re-awards', async () => {
  const client = fakeClient({ works: { BY209901: [{ id: 41 }, { id: 42 }] } });
  const sandbox = await prep(client);
  const before = client.calls.length;
  await sandbox.redraw(PLAN.sessions[0].items[0]);
  const tail = client.calls.slice(before).map(c => c[0]);
  const dels = tail.filter(n => n === 'deleteWork').length;
  assert.equal(dels, 2);
  assert.ok(tail.lastIndexOf('deleteWork') < tail.indexOf('createWork'), 'must delete before re-posting');
});

test('reset deletes only participants carrying our SIM- document_id', async () => {
  // The API's ?q= is a LIKE '%…%' over name/surname/document_id, so a real
  // person named "Simón" or holding doc "SIM-2020/7" comes back in the search.
  // Only rows whose document_id starts with SIM- are ours to delete.
  const client = fakeClient({
    participants: [
      { id: 1, name: 'A', document_id: 'SIM-1-1-1' },   // ours
      { id: 2, name: 'B', document_id: 'SIM-1-2-1' },   // ours
      { id: 3, name: 'Simón Vera', document_id: '30111222' }, // matched on name
      { id: 4, name: 'C', document_id: 'DNI-SIM-9' },   // contains, not prefix
      { id: 5, name: 'D', document_id: null },          // no document at all
    ],
  });
  await prep(client);
  const deleted = client.calls.filter(c => c[0] === 'deleteParticipant').map(c => c[1]);
  assert.deepEqual(deleted, [1, 2], 'deleted a participant that was not ours');
});

test('award is idempotent — awarding twice does not duplicate winners', async () => {
  // A stateful fake: works actually persist, so a second award can see them.
  // The real API has no uniqueness constraint on works (contract scenario 11a),
  // so nothing but this check prevents a duplicate winner on the board.
  const stored = [];
  const client = fakeClient();
  client.getWorks = (comp) => Promise.resolve(stored.filter(w => w.competition_id === comp));
  client.createWork = (d) => { const w = { id: stored.length + 1, ...d }; stored.push(w); return Promise.resolve(w); };

  const sandbox = await prep(client);
  const item = PLAN.sessions[0].items[0]; // two entrants, placements 1 and 2

  await sandbox.award(item);
  assert.equal(stored.length, 2, 'first award did not record both placements');

  await sandbox.award(item);
  assert.equal(stored.length, 2, 'the second award duplicated the winners');

  const keys = stored.map(w => `${w.participant_id}:${w.placement}`);
  assert.equal(new Set(keys).size, 2, 'a placement was recorded twice');
});

test('award retries after a failure without duplicating the write that landed', async () => {
  // The dangerous case: the POST succeeds server-side but the response fails.
  // Re-deriving the gap on retry is what makes this safe.
  const stored = [];
  const client = fakeClient();
  client.getWorks = (comp) => Promise.resolve(stored.filter(w => w.competition_id === comp));
  let failNext = true;
  client.createWork = (d) => {
    const w = { id: stored.length + 1, ...d };
    stored.push(w);                      // the write LANDS...
    if (failNext) { failNext = false; return Promise.reject(new Error('connection reset')); } // ...then the response fails
    return Promise.resolve(w);
  };

  const sandbox = await prep(client);
  const item = PLAN.sessions[0].items[0];
  await sandbox.award(item);

  assert.equal(stored.length, 2, `expected 2 works, got ${stored.length} — the retry duplicated a landed write`);
});
