import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM } from '../js/core/program.js';
import { generateDayPlan } from '../js/core/roster.js';
import { buildTimeline, STAGE_ACTS } from '../js/core/timeline.js';
import { MUSIC, MUSIC_BY_KIND } from '../js/render/music.js';

const plan = generateDayPlan(PROGRAM, 42);
const segments = buildTimeline(plan);
const byItem = ord => segments.filter(s => s.itemOrdinal === ord);
const items = plan.sessions.flatMap(s => s.items);

test('timeline is deterministic for the same plan', () => {
  assert.equal(JSON.stringify(buildTimeline(plan)), JSON.stringify(segments));
});

test('covers every item in running order', () => {
  const seen = [...new Set(segments.map(s => s.itemOrdinal))];
  assert.deepEqual(seen, items.map(i => i.ordinal));
});

test('a competitive item expands to intro, per-entrant perform+applause, adjudicate, award, final applause', () => {
  const item = items.find(i => i.program.kind !== 'ceremony');
  const segs = byItem(item.ordinal);
  const kinds = segs.map(s => s.kind);
  const expected = ['intro'];
  item.entrants.forEach(() => expected.push('perform', 'applause'));
  expected.push('adjudicate', 'award', 'applause'); // ovation for the winners
  assert.deepEqual(kinds, expected);
  const finale = segs[segs.length - 1];
  assert.equal(finale.stage.actType, 'empty', 'winners applause happens with the stage clear');
});

test('ceremony items expand to intro, ceremony, applause', () => {
  const cer = items.find(i => i.program.kind === 'ceremony');
  assert.deepEqual(byItem(cer.ordinal).map(s => s.kind), ['intro', 'ceremony', 'applause']);
  const seg = byItem(cer.ordinal)[1];
  assert.equal(seg.dur, 30);
  assert.equal(seg.music, 'ceremoni');
  assert.equal(seg.stage.actType, 'ceremoni');
});

test('durations follow the plan: performs 8-14s, award scales with placements', () => {
  for (const item of items) {
    for (const seg of byItem(item.ordinal)) {
      assert.ok(seg.dur > 0);
      if (seg.kind === 'perform') assert.ok(seg.dur >= 8 && seg.dur <= 14, `perform ${seg.dur}`);
      if (seg.kind === 'award') {
        const places = item.placements === 'desierto' ? 0 : item.placements.length;
        assert.equal(seg.dur, 4 + 3.5 * places);
      }
    }
  }
});

test('perform segments carry a real music piece from the kind pool and a valid stage act', () => {
  for (const item of items) {
    for (const seg of byItem(item.ordinal).filter(s => s.kind === 'perform')) {
      assert.ok(MUSIC_BY_KIND[item.program.kind].includes(seg.music), `${seg.music} not in pool for ${item.program.kind}`);
      assert.ok(typeof MUSIC[seg.music] === 'function', `piece ${seg.music} missing`);
      assert.ok(STAGE_ACTS.includes(seg.stage.actType), `bad actType ${seg.stage.actType}`);
      assert.ok(seg.entrantIdx >= 0 && seg.entrantIdx < item.entrants.length);
    }
  }
});

test('intro segments announce with the comp number banner', () => {
  const item = items.find(i => i.program.kind !== 'ceremony');
  const intro = byItem(item.ordinal)[0];
  assert.equal(intro.stage.actType, 'announcer');
  assert.match(intro.banner, new RegExp(`${item.program.comp}`));
});
