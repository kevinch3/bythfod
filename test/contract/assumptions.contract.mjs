// The eleven behaviours js/api/sandbox.js and js/api/client.js take on faith,
// plus two nobody wrote down, as executable assertions.
//
// Each scenario returns nothing and throws on failure. They run against a real
// API (tools/contract-live.mjs) and, from stage 5, against the in-process mock.
// Ordered by how likely the assumption is to be WRONG, not by resource.
import assert from 'node:assert/strict';
import { SANDBOX } from './_harness.mjs';

/** Scenarios are `[id, title, fn]`; fn receives the shared context. */
export const scenarios = [];
const scenario = (id, title, fn) => scenarios.push({ id, title, fn });

// ── Setup helpers ──────────────────────────────────────────────────────────
async function ensureCategory(ctx) {
  const { body } = await ctx.api.get('/categories');
  const existing = body.find(c => c.name === 'Canto Individual') ?? body[0];
  if (existing) return existing.id;
  const created = await ctx.api.post('/categories', { name: 'Canto Individual' });
  return created.body.id;
}

async function ensureEdition(ctx) {
  const res = await ctx.api.post('/editions', { year: SANDBOX.YEAR });
  // 409 means it already exists, which is assumption #2 and fine here.
  assert.ok([201, 409].includes(res.status), `unexpected edition status ${res.status}`);
}

/**
 * Upsert, not create — because of the very behaviour scenario 3 documents: a
 * competition that ever had a registration can never be deleted, so a re-run
 * would otherwise collide with its own residue. sandbox.js reuses ids for the
 * same reason.
 */
async function makeCompetition(ctx, suffix, extra = {}) {
  const id = SANDBOX.compId(suffix);
  const body = {
    category_id: ctx.categoryId, year: SANDBOX.YEAR, type: 'IND',
    description: 'contract test', rank: 990, ...extra,
  };
  const created = await ctx.api.post('/competitions', { id, ...body });
  if (created.status !== 201) {
    const updated = await ctx.api.put(`/competitions/${id}`, body);
    assert.equal(updated.status, 200,
      `could neither create nor reuse ${id}: ${JSON.stringify(created.body)} / ${JSON.stringify(updated.body)}`);
  }
  ctx.track.competitions.push(id);
  return id;
}

async function makeParticipant(ctx, n) {
  const res = await ctx.api.post('/participants', {
    name: `Contract${n}`, surname: 'Test', type: 'IND',
    document_id: `${SANDBOX.DOC_PREFIX}${Date.now()}-${n}`,
  });
  assert.equal(res.status, 201, `could not create participant: ${JSON.stringify(res.body)}`);
  ctx.track.participants.push(res.body.id);
  return res.body;
}

// ── #11 — the retry hazard (most likely to bite) ───────────────────────────
scenario('11a', 'POSTing an identical work twice creates TWO rows (retry duplicates a winner)', async (ctx) => {
  const comp = await makeCompetition(ctx, 11);
  const p = await makeParticipant(ctx, 11);
  const body = { participant_id: p.id, competition_id: comp, title: 'Duplicate probe', placement: '1' };

  const a = await ctx.api.post('/works', body);
  const b = await ctx.api.post('/works', body);
  ctx.expectValid('createWork', 201, a.body);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201, 'second identical POST was rejected — assumption changed');
  assert.notEqual(a.body.id, b.body.id, 'the API deduplicated identical works');

  const list = await ctx.api.get(`/works?comp=${comp}`);
  assert.equal(list.body.length, 2,
    'identical works did not both persist — client.js enqueue retry would be safe');
  ctx.note('11a', 'CONFIRMED HAZARD: identical POST /works creates two rows. ' +
    'client.js:55 `fn().catch(() => fn())` retries ANY failure, so a partial-failure ' +
    '500 duplicates a winner on the results board.');
});

scenario('11b', 'a 401 is distinguishable from other failures (re-login is only valid for 401)', async (ctx) => {
  const bad = ctx.anon.withToken('not-a-real-token');
  const res = await bad.get('/categories');
  assert.equal(res.status, 401, 'an invalid token no longer yields 401');
  ctx.expectValid('listCategories', 401, res.body);

  const missing = await ctx.anon.get('/categories');
  assert.equal(missing.status, 401);
  assert.notDeepEqual(res.body, missing.body,
    'missing-token and invalid-token 401s are indistinguishable');
  ctx.note('11b', `401 bodies differ: missing=${JSON.stringify(missing.body)} ` +
    `invalid=${JSON.stringify(res.body)} — both Spanish (A4).`);
});

// ── #3 — "competitions are undeletable once registered" (never verified) ───
scenario('3a', 'a competition with a LIVE registration cannot be deleted', async (ctx) => {
  const comp = await makeCompetition(ctx, 31);
  const p = await makeParticipant(ctx, 31);
  const reg = await ctx.api.post('/registrations', {
    participant_id: p.id, competition_id: comp, year: SANDBOX.YEAR,
  });
  assert.equal(reg.status, 201);
  ctx.track.registrations.push(reg.body.id);

  const del = await ctx.api.del(`/competitions/${comp}`);
  assert.notEqual(del.status, 204, 'a competition WITH a registration was deleted');
  ctx.note('3a', `FK violation status = ${del.status} ${JSON.stringify(del.body)} ` +
    `(sandbox.js assumes this is why it never deletes; semantically it is 409)`);
  ctx.expectValid('deleteCompetition', del.status, del.body);
});

scenario('3b', 'a competition whose registrations are all DROPPED still cannot be deleted', async (ctx) => {
  const comp = await makeCompetition(ctx, 32);
  const p = await makeParticipant(ctx, 32);
  const reg = await ctx.api.post('/registrations', {
    participant_id: p.id, competition_id: comp, year: SANDBOX.YEAR,
  });
  ctx.track.registrations.push(reg.body.id);
  const dropped = await ctx.api.patch(`/registrations/${reg.body.id}/drop`);
  assert.equal(dropped.status, 200);

  const del = await ctx.api.del(`/competitions/${comp}`);
  assert.notEqual(del.status, 204,
    'dropping a registration made the competition deletable — the reset strategy could be simpler');
  ctx.note('3b', 'CONFIRMED: a soft-dropped registration still blocks deletion — ' +
    'the row persists, so sandbox reset can never truly clean up (B9).');
});

scenario('3c', 'a competition with only WORKS becomes deletable once the works are deleted', async (ctx) => {
  const comp = await makeCompetition(ctx, 33);
  const p = await makeParticipant(ctx, 33);
  const work = await ctx.api.post('/works', {
    participant_id: p.id, competition_id: comp, title: 'Deletable probe',
  });
  assert.equal(work.status, 201);

  const blocked = await ctx.api.del(`/competitions/${comp}`);
  assert.notEqual(blocked.status, 204, 'a competition with a work was deleted outright');

  const rmWork = await ctx.api.del(`/works/${work.body.id}`);
  assert.equal(rmWork.status, 204);
  const now = await ctx.api.del(`/competitions/${comp}`);
  assert.equal(now.status, 204,
    'works were removed but the competition is still undeletable');
  ctx.track.competitions = ctx.track.competitions.filter(c => c !== comp);
  ctx.note('3c', 'Works hard-delete, so a competition with works but no registrations ' +
    'IS recoverable. Only registrations make it permanent.');
});

// ── #4 — participant search semantics and the residue it creates ───────────
scenario('4a', '?q= is a substring LIKE across name, surname AND document_id', async (ctx) => {
  const marker = `ZZQ${Date.now()}`;
  const byName = await ctx.api.post('/participants', {
    name: `${marker}nombre`, type: 'IND', document_id: 'PLAIN-DOC',
  });
  const byDoc = await ctx.api.post('/participants', {
    name: 'Plain Name', type: 'IND', document_id: `${marker}-doc`,
  });
  ctx.track.participants.push(byName.body.id, byDoc.body.id);

  const found = await ctx.api.get(`/participants?q=${marker}`);
  const ids = found.body.map(p => p.id);
  assert.ok(ids.includes(byName.body.id), 'q did not match on name');
  assert.ok(ids.includes(byDoc.body.id), 'q did not match on document_id');
  ctx.note('4a', 'CONFIRMED: ?q= matches name OR document_id, so a document-prefix ' +
    'search also returns people whose NAME happens to contain it. sandbox.js re-checks ' +
    'document_id, which is what makes its delete safe.');
});

scenario('4b', 'soft-deleted participants are STILL returned by list and search (B3)', async (ctx) => {
  const marker = `ZZI${Date.now()}`;
  const p = await ctx.api.post('/participants', {
    name: `${marker}inactive`, type: 'IND', document_id: `${marker}-doc`,
  });
  ctx.track.participants.push(p.body.id);
  assert.equal((await ctx.api.del(`/participants/${p.body.id}`)).status, 204);

  const after = await ctx.api.get(`/participants?q=${marker}`);
  const row = after.body.find(x => x.id === p.body.id);
  assert.ok(row, 'a soft-deleted participant vanished from search — B3 is already fixed');
  assert.equal(row.active, 0);
  ctx.expectValid('listParticipants', 200, after.body);

  // The second delete still reports success, which is why the reset loop never
  // notices it is re-deleting corpses.
  const again = await ctx.api.del(`/participants/${p.body.id}`);
  assert.equal(again.status, 204,
    'deleting an already-inactive participant now reports 404 — the reset loop could detect completion');
  ctx.note('4b', 'CONFIRMED: inactive participants stay searchable AND re-deleting one ' +
    'still returns 204. That is the mechanism behind the accumulated residue.');
});

// ── #1, #2, #6 — cheap regression locks ────────────────────────────────────
scenario('1', 'POST /categories has no uniqueness — duplicates are created silently', async (ctx) => {
  const name = `ZZCat${Date.now()}`;
  const a = await ctx.api.post('/categories', { name });
  const b = await ctx.api.post('/categories', { name });
  ctx.track.categories.push(a.body.id, b.body.id);
  assert.equal(a.status, 201);
  assert.equal(b.status, 201, 'duplicate category name was rejected — client-side dedupe is obsolete');
  assert.notEqual(a.body.id, b.body.id);
  ctx.expectValid('createCategory', 201, a.body);
});

scenario('2', 'POST /editions returns a clean 409 for an existing year', async (ctx) => {
  const res = await ctx.api.post('/editions', { year: SANDBOX.YEAR });
  assert.equal(res.status, 409, `expected 409, got ${res.status}`);
  ctx.expectValid('createEdition', 409, res.body);
});

scenario('6', 'competition id is caller-supplied; a duplicate is NOT a clean 409', async (ctx) => {
  const id = SANDBOX.compId(60);
  await ctx.api.del(`/competitions/${id}`);
  const first = await ctx.api.post('/competitions', {
    id, category_id: ctx.categoryId, year: SANDBOX.YEAR, type: 'IND', rank: 990,
  });
  assert.equal(first.status, 201);
  assert.equal(first.body.id, id, 'the API did not honour the caller-supplied id');
  ctx.track.competitions.push(id);

  const dup = await ctx.api.post('/competitions', {
    id, category_id: ctx.categoryId, year: SANDBOX.YEAR, type: 'IND', rank: 990,
  });
  assert.notEqual(dup.status, 201, 'a duplicate competition id was accepted');
  ctx.note('6', `duplicate competition id → ${dup.status} ${JSON.stringify(dup.body)} ` +
    `(editions give 409 for the same situation — B1)`);
  ctx.expectValid('createCompetition', dup.status, dup.body);
});

// ── #5 — the PATCH-with-no-body question ───────────────────────────────────
scenario('5', 'PATCH /drop works with NO body and a JSON content-type', async (ctx) => {
  const comp = await makeCompetition(ctx, 50);
  const p = await makeParticipant(ctx, 50);
  const reg = await ctx.api.post('/registrations', {
    participant_id: p.id, competition_id: comp, year: SANDBOX.YEAR,
  });
  ctx.track.registrations.push(reg.body.id);

  // Exactly what js/api/client.js sends: no body, Content-Type: application/json.
  const res = await ctx.api.patch(`/registrations/${reg.body.id}/drop`, undefined, {
    headers: { 'Content-Type': 'application/json' },
  });
  assert.equal(res.status, 200, `bodyless PATCH with JSON content-type failed: ${res.status}`);
  ctx.expectValid('dropRegistration', 200, res.body);
  ctx.note('5', 'CONFIRMED: express.json() tolerates a zero-length body with ' +
    'Content-Type: application/json — client.js is safe as written.');
});

// ── #7, #8 — vocabulary locks ──────────────────────────────────────────────
// ASSUMPTION #7 IS FALSE. The CHECK constraint is inert:
//   CHECK(placement IN ('1','2','3','mencion',NULL))
// For any non-matching value the IN expression evaluates to NULL, and a CHECK
// only rejects on FALSE — so it never rejects anything. The NULL in the list,
// presumably added to permit nulls (already permitted, the column is nullable),
// silently disabled the whole constraint. This test pins the CURRENT behaviour;
// it will fail when B10 lands, which is the signal to update the spec with it.
scenario('7', 'placement is NOT enforced — any string is accepted (B10)', async (ctx) => {
  const comp = await makeCompetition(ctx, 70);
  const p = await makeParticipant(ctx, 70);
  for (const placement of ['1', '2', '3', 'mencion']) {
    const res = await ctx.api.post('/works', {
      participant_id: p.id, competition_id: comp, title: `P${placement}`, placement,
    });
    assert.equal(res.status, 201, `placement "${placement}" was rejected`);
  }
  const bad = await ctx.api.post('/works', {
    participant_id: p.id, competition_id: comp, title: 'bad', placement: 'primero',
  });
  assert.equal(bad.status, 201,
    'an invalid placement was rejected — B10 is fixed, update this test and the spec');
  assert.equal(bad.body.placement, 'primero', 'the value was silently altered');
  ctx.note('7', 'ASSUMPTION FALSE: placement accepts ANY string. The CHECK lists ' +
    "NULL among its values, so `x IN (...,NULL)` yields NULL for a non-match and " +
    'the constraint never rejects. Nothing validates placement anywhere (B10).');
});

scenario('8', "type enum IND/GRU is shared by competitions and participants", async (ctx) => {
  const okComp = await makeCompetition(ctx, 80, { type: 'GRU' });
  assert.ok(okComp);
  const badComp = await ctx.api.post('/competitions', {
    id: SANDBOX.compId(81), category_id: ctx.categoryId, year: SANDBOX.YEAR, type: 'SOLO', rank: 990,
  });
  assert.notEqual(badComp.status, 201, 'an invalid competition type was accepted');
  const badPart = await ctx.api.post('/participants', { name: 'BadType', type: 'SOLO' });
  assert.notEqual(badPart.status, 201, 'an invalid participant type was accepted');
  ctx.note('8', `invalid type → competition ${badComp.status}, participant ${badPart.status}`);
});

// ── #9, #10 — omitted fields and delete semantics ──────────────────────────
scenario('9', 'omitting pseudonym is accepted and stores null', async (ctx) => {
  const comp = await makeCompetition(ctx, 90);
  const p = await makeParticipant(ctx, 90);
  const res = await ctx.api.post('/registrations', {
    participant_id: p.id, competition_id: comp, year: SANDBOX.YEAR,
  });
  assert.equal(res.status, 201);
  ctx.track.registrations.push(res.body.id);
  assert.equal(res.body.pseudonym, null, 'an omitted pseudonym did not become null');
  ctx.expectValid('createRegistration', 201, res.body);
});

scenario('10', 'DELETE returns 204 with an empty body', async (ctx) => {
  const comp = await makeCompetition(ctx, 100);
  const p = await makeParticipant(ctx, 100);
  const work = await ctx.api.post('/works', {
    participant_id: p.id, competition_id: comp, title: 'Delete probe',
  });
  const res = await ctx.api.del(`/works/${work.body.id}`);
  assert.equal(res.status, 204);
  assert.equal(res.raw, '', '204 carried a body');
});

// ── #12 — the undocumented one: list vs single-item shapes ─────────────────
scenario('12', 'GET by id returns FEWER fields than the list form (A8)', async (ctx) => {
  const comp = await makeCompetition(ctx, 120);
  const p = await makeParticipant(ctx, 120);
  const reg = await ctx.api.post('/registrations', {
    participant_id: p.id, competition_id: comp, year: SANDBOX.YEAR,
  });
  ctx.track.registrations.push(reg.body.id);

  const list = await ctx.api.get(`/registrations?comp=${comp}`);
  const one = await ctx.api.get(`/registrations/${reg.body.id}`);
  ctx.expectValid('listRegistrations', 200, list.body);
  ctx.expectValid('getRegistration', 200, one.body);

  const listRow = list.body.find(r => r.id === reg.body.id);
  const listKeys = new Set(Object.keys(listRow));
  const oneKeys = new Set(Object.keys(one.body));
  const missing = [...listKeys].filter(k => !oneKeys.has(k));
  assert.ok(missing.length > 0,
    'list and single-item shapes now agree — A8 is already fixed');
  ctx.note('12', `CONFIRMED: GET /registrations/{id} omits ${JSON.stringify(missing)} ` +
    `that the list form returns.`);
});

scenario('12b', 'a DROPPED registration is hidden from the list but still fetchable by id', async (ctx) => {
  const comp = await makeCompetition(ctx, 121);
  const p = await makeParticipant(ctx, 121);
  const reg = await ctx.api.post('/registrations', {
    participant_id: p.id, competition_id: comp, year: SANDBOX.YEAR,
  });
  ctx.track.registrations.push(reg.body.id);
  await ctx.api.patch(`/registrations/${reg.body.id}/drop`);

  const list = await ctx.api.get(`/registrations?comp=${comp}`);
  assert.ok(!list.body.some(r => r.id === reg.body.id), 'a dropped registration appeared in the list');
  const one = await ctx.api.get(`/registrations/${reg.body.id}`);
  assert.equal(one.status, 200, 'a dropped registration is not fetchable by id');
  assert.equal(one.body.dropped, 1);
  ctx.note('12b', 'CONFIRMED inconsistency: the list hides dropped rows, GET by id does not (B4).');
});
