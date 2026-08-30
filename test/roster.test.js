import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM } from '../src/core/program.ts';
import { makeRng } from '../src/core/rng.ts';
import { generateDayPlan, drawPlacements, shuffleKeepingFixed } from '../src/core/roster.ts';

const flat = plan => plan.sessions.flatMap(s => s.items);

// ── Invariants that must hold with OR without the learning TODOs ──────────

test('same seed produces an identical plan', () => {
  const a = generateDayPlan(PROGRAM, 42);
  const b = generateDayPlan(PROGRAM, 42);
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

test('different seeds produce different plans', () => {
  const a = generateDayPlan(PROGRAM, 1);
  const b = generateDayPlan(PROGRAM, 2);
  assert.notEqual(JSON.stringify(a), JSON.stringify(b));
});

test('plan covers all 46 items with unique ordinals and BY-prefixed comp ids', () => {
  const items = flat(generateDayPlan(PROGRAM, 42));
  assert.equal(items.length, 46);
  const ordinals = new Set(items.map(i => i.ordinal));
  assert.equal(ordinals.size, 46);
  for (const item of items) {
    assert.match(item.compId, /^BY2099\d{2}$/);
    assert.equal(item.compId, `BY2099${String(item.ordinal).padStart(2, '0')}`);
  }
});

test('competitive items get 1-5 entrants; ceremonies exactly 1', () => {
  for (const item of flat(generateDayPlan(PROGRAM, 7))) {
    if (item.program.kind === 'ceremony') assert.equal(item.entrants.length, 1);
    else assert.ok(item.entrants.length >= 1 && item.entrants.length <= 5, item.compId);
  }
});

test('IND entrants have person names, GRU entrants have group name and members', () => {
  for (const item of flat(generateDayPlan(PROGRAM, 11))) {
    for (const e of item.entrants) {
      assert.ok(e.key && e.displayName);
      if (item.program.entrantType === 'IND') assert.ok(e.person?.name && e.person?.surname);
      else assert.ok(e.members >= 2, `${item.compId} group of ${e.members}`);
    }
  }
});

test('ranks encode session and slot uniquely', () => {
  const plan = generateDayPlan(PROGRAM, 42);
  const ranks = new Set();
  plan.sessions.forEach((s, si) => s.items.forEach((item, slot) => {
    assert.equal(item.rank, si * 100 + slot);
    ranks.add(item.rank);
  }));
  assert.equal(ranks.size, 46);
});

test('every item resolves placements: desierto or valid, non-duplicated awards', () => {
  for (const item of flat(generateDayPlan(PROGRAM, 42))) {
    if (item.placements === 'desierto') continue;
    assert.ok(Array.isArray(item.placements) && item.placements.length > 0, item.compId);
    const keys = new Set();
    for (const p of item.placements) {
      assert.ok(['1', '2', '3', 'mencion'].includes(p.placement));
      assert.ok(item.entrants.some(e => e.key === p.entrantKey), 'placement references entrant');
      assert.ok(!keys.has(p.entrantKey), 'entrant placed twice');
      keys.add(p.entrantKey);
    }
  }
});

test('entrant names are stable per item regardless of seed-order concerns', () => {
  // Same seed twice: names must match item-by-ordinal (guards the split-stream design)
  const a = flat(generateDayPlan(PROGRAM, 5));
  const b = flat(generateDayPlan(PROGRAM, 5));
  const byOrd = arr => Object.fromEntries(arr.map(i => [i.ordinal, i.entrants.map(e => e.displayName)]));
  assert.deepEqual(byOrd(a), byOrd(b));
});

// ── Learning TODO #1: drawPlacements — RED until you implement it ─────────

test('drawPlacements: always awards a 1st place (or declares desierto)', { todo: true }, () => {
  for (let seed = 0; seed < 50; seed++) {
    const r = drawPlacements(['a', 'b', 'c'], makeRng(seed));
    assert.notEqual(r, 'desierto', '3 entrants should never be desierto');
    assert.ok(r.some(p => p.placement === '1'));
  }
});

test('drawPlacements: a lone entrant is sometimes desierto, mostly 1st', { todo: true }, () => {
  let desierto = 0;
  for (let seed = 0; seed < 300; seed++) {
    const r = drawPlacements(['solo'], makeRng(seed));
    if (r === 'desierto') desierto++;
    else assert.deepEqual(r, [{ entrantKey: 'solo', placement: '1' }]);
  }
  assert.ok(desierto > 10 && desierto < 180, `desierto rate ${desierto}/300 outside (10,180)`);
});

test('drawPlacements: two entrants never get 3rd or mención', { todo: true }, () => {
  for (let seed = 0; seed < 50; seed++) {
    const r = drawPlacements(['a', 'b'], makeRng(seed));
    for (const p of r) assert.ok(['1', '2'].includes(p.placement));
  }
});

test('drawPlacements: five entrants get a full podium, mención only ever once', { todo: true }, () => {
  for (let seed = 0; seed < 50; seed++) {
    const r = drawPlacements(['a', 'b', 'c', 'd', 'e'], makeRng(seed));
    const places = r.map(p => p.placement);
    for (const want of ['1', '2', '3']) assert.ok(places.includes(want), `missing ${want}`);
    assert.ok(places.filter(p => p === 'mencion').length <= 1);
    assert.equal(new Set(r.map(p => p.entrantKey)).size, r.length);
  }
});

// ── Learning TODO #2: shuffleKeepingFixed — RED until you implement it ────

test('shuffleKeepingFixed: permutes while leaving fixed indexes untouched', { todo: true }, () => {
  const items = ['a', 'b', 'CEREMONY', 'c', 'd', 'CEREMONY2', 'e'];
  const isFixed = x => x.startsWith('CEREMONY');
  const out = shuffleKeepingFixed(items, isFixed, makeRng(9));
  assert.equal(out.length, items.length);
  assert.deepEqual([...out].sort(), [...items].sort());
  assert.equal(out[2], 'CEREMONY');
  assert.equal(out[5], 'CEREMONY2');
});

test('shuffleKeepingFixed: deterministic, and actually shuffles for some seed', { todo: true }, () => {
  const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const a = shuffleKeepingFixed(items, () => false, makeRng(3));
  const b = shuffleKeepingFixed(items, () => false, makeRng(3));
  assert.deepEqual(a, b);
  const anyMoved = [1, 2, 3, 4, 5].some(seed =>
    JSON.stringify(shuffleKeepingFixed(items, () => false, makeRng(seed))) !== JSON.stringify(items));
  assert.ok(anyMoved, 'no seed produced a non-identity order');
});

test('day plan keeps ceremonies pinned at printed slots 6 and 12 while others move', { todo: true }, () => {
  const s3 = seed => generateDayPlan(PROGRAM, seed).sessions[2].items;
  for (const seed of [1, 2, 3]) {
    assert.equal(s3(seed)[5].program.ceremony, 'delyn');
    assert.equal(s3(seed)[11].program.ceremony, 'bythfod');
  }
  const moved = [1, 2, 3, 4, 5].some(seed =>
    s3(seed).map(i => i.ordinal).join(',') !== s3(999999).map(i => i.ordinal).join(','));
  assert.ok(moved, 'session order never varies across seeds — shuffle not applied');
});
