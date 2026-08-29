import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEngine, step, start, pause, play, setSpeed, skipItem, jumpTo,
  setJuryLines, stageState, juryState, positionState,
} from '../js/core/engine.js';

const stg = (actType, n = 1, spotMode = 'center') => ({ actType, n, spotMode });
const SEGS = [
  { itemOrdinal: 1, sessionId: 's', kind: 'intro', dur: 1, banner: 'COMP.42', stage: stg('announcer', 2, 'announcer') },
  { itemOrdinal: 1, sessionId: 's', kind: 'perform', entrantIdx: 0, dur: 2, music: 'solo', stage: stg('solo') },
  { itemOrdinal: 1, sessionId: 's', kind: 'applause', entrantIdx: 0, dur: 1, stage: stg('solo') },
  { itemOrdinal: 1, sessionId: 's', kind: 'adjudicate', dur: 2, stage: stg('empty', 0) },
  { itemOrdinal: 1, sessionId: 's', kind: 'award', dur: 2, banner: 'COMP.42', stage: stg('award', 1) },
  { itemOrdinal: 2, sessionId: 's', kind: 'intro', dur: 1, banner: 'COMP.73', stage: stg('announcer', 2, 'announcer') },
  { itemOrdinal: 2, sessionId: 's', kind: 'perform', entrantIdx: 0, dur: 2, music: 'duo', stage: stg('duo', 2, 'duo') },
  { itemOrdinal: 2, sessionId: 's', kind: 'applause', entrantIdx: 0, dur: 1, stage: stg('duo', 2, 'duo') },
  { itemOrdinal: 2, sessionId: 's', kind: 'adjudicate', dur: 1, stage: stg('empty', 0) },
  { itemOrdinal: 2, sessionId: 's', kind: 'award', dur: 2, stage: stg('award', 0) },
];
const ITEMS = {
  1: { ordinal: 1, entrants: [{ key: 'a', displayName: 'Test A' }], placements: [{ entrantKey: 'a', placement: '1' }] },
  2: { ordinal: 2, entrants: [{ key: 'b', displayName: 'Test B' }], placements: 'desierto' },
};

const mk = () => createEngine(SEGS, { itemsByOrdinal: ITEMS });
// Advance in small ticks, collecting effects.
const run = (st, seconds, dt = 0.05) => {
  const fx = [];
  for (let t = 0; t < seconds - 1e-9; t += dt) fx.push(...step(st, dt));
  return fx;
};

test('start fades in, then enters the first intro', () => {
  const st = mk();
  const fx = [...start(st), ...run(st, 0.5)];
  assert.ok(fx.some(e => e.type === 'fanfare'), 'fanfare on item fade-in');
  assert.ok(stageState(st).overlay > 0 && stageState(st).overlay < 1, 'mid-fade');
  run(st, 1.0);
  assert.equal(st.phase, 'segment');
  assert.equal(SEGS[st.cursor].kind, 'intro');
  assert.equal(stageState(st).banner, null); // announcer phase shows no banner yet
  assert.equal(stageState(st).actType, 'announcer');
});

test('perform entry emits its music piece; applause emits noise', () => {
  const st = mk();
  start(st); run(st, 1.5); // through fade-in and most of intro
  const fx = run(st, 1.0); // crosses into perform
  assert.ok(fx.some(e => e.type === 'music' && e.piece === 'solo'));
  const fx2 = run(st, 2.0); // crosses into applause
  assert.ok(fx2.some(e => e.type === 'noise'));
  assert.equal(stageState(st).phase, 'applause');
});

test('award entry emits exactly one award effect for the item', () => {
  const st = mk();
  start(st);
  const fx = run(st, 10); // fade 1.4 + 1+2+1+2 = through adjudicate into award
  const awards = fx.filter(e => e.type === 'award');
  assert.equal(awards.length, 1);
  assert.equal(awards[0].itemOrdinal, 1);
});

test('items are separated by fade-out/fade-in and the show ends in done', () => {
  const st = mk();
  start(st);
  const fx = run(st, 12); // item 1 total 8s + fades
  assert.ok(fx.some(e => e.type === 'fanfare'), 'second fanfare for item 2');
  assert.equal(SEGS[st.cursor].itemOrdinal, 2);
  run(st, 30);
  assert.equal(st.phase, 'done');
  assert.equal(stageState(st).overlay, 1);
});

test('pause freezes time and play resumes; silence is emitted on pause', () => {
  const st = mk();
  start(st); run(st, 2);
  const cursorBefore = st.cursor, timerBefore = st.timer;
  const fx = pause(st);
  assert.ok(fx.some(e => e.type === 'silence'));
  run(st, 5);
  assert.equal(st.cursor, cursorBefore);
  assert.equal(st.timer, timerBefore);
  play(st);
  run(st, 0.2); // small enough to stay inside the same segment
  assert.ok(st.timer > timerBefore);
});

test('speed multiplies elapsed time', () => {
  const a = mk(), b = mk();
  start(a); start(b); setSpeed(b, 2);
  run(a, 4); run(b, 2);
  assert.equal(a.cursor, b.cursor);
});

test('skipItem lands on the next item after the fades', () => {
  const st = mk();
  start(st); run(st, 2); // inside item 1
  skipItem(st);
  run(st, 3); // fade-out + fade-in
  assert.equal(st.phase, 'segment');
  assert.equal(SEGS[st.cursor].itemOrdinal, 2);
  assert.equal(SEGS[st.cursor].kind, 'intro');
});

test('jumpTo enters the requested item at its intro', () => {
  const st = mk();
  start(st); run(st, 0.2);
  jumpTo(st, 2);
  run(st, 2);
  assert.equal(SEGS[st.cursor].itemOrdinal, 2);
  assert.equal(SEGS[st.cursor].kind, 'intro');
});

test('jury modes track the segment: listening → speaking → announcing', () => {
  const st = mk();
  start(st); run(st, 2.0); // in intro — jury present, waiting
  assert.equal(juryState(st).mode, 'listening');
  run(st, 3.6); // t≈5.6: past perform (2.4-4.4) and applause (4.4-5.4), into adjudicate
  assert.equal(juryState(st).mode, 'speaking');
  setJuryLines(st, ['Da iawn wir.', 'La afinación fue notable.']);
  run(st, 0.5);
  assert.equal(juryState(st).line, 'Da iawn wir.');
  assert.ok(juryState(st).lineT > 0);
  run(st, 1.5); // into award
  assert.equal(juryState(st).mode, 'announcing');
  assert.match(juryState(st).line, /Test A/);
});

test('adjudication clears the performers and dims the stage', () => {
  const st = mk();
  start(st); run(st, 6.6); // t≈6.6: inside adjudicate (5.4-7.4), 1s+ in
  assert.equal(juryState(st).mode, 'speaking');
  const s = stageState(st);
  assert.equal(s.actType, 'empty');
  assert.ok(s.overlay >= 0.5 && s.overlay < 1, `stage should be dimmed, overlay=${s.overlay}`);
});

test('desierto award announces the withheld prize', () => {
  const st = mk();
  start(st);
  run(st, 12); // into item 2
  run(st, 30);
  // walk a fresh engine straight to item 2's award to read the line
  const st2 = mk();
  start(st2); jumpTo(st2, 2);
  run(st2, 1.5 + 1 + 2 + 1 + 1 + 0.5); // fade + intro + perform + applause + adjudicate + into award
  assert.equal(juryState(st2).mode, 'announcing');
  assert.match(juryState(st2).line, /desierto/i);
});

test('the announcement keeps the stage dark and empty, exposing the announce order for captions', () => {
  const st = mk();
  start(st); run(st, 8.0); // t≈8.0: inside award (7.4-9.4)
  const s = stageState(st);
  assert.equal(s.actType, 'empty', 'no action on stage while results are read');
  assert.ok(s.overlay >= 0.5 && s.overlay < 1, `stage stays dimmed, overlay=${s.overlay}`);
  assert.deepEqual(s.awardOrder, ['1']); // item 1 has a single 1st place
  assert.equal(s.awardLineIdx, 0);
  // desierto item exposes an empty order
  const st2 = mk();
  start(st2); jumpTo(st2, 2); run(st2, 7.0); // fade 1.4 + 1+2+1+1 → award
  assert.deepEqual(stageState(st2).awardOrder, []);
});

test('positionState exposes current and next item', () => {
  const st = mk();
  start(st); run(st, 2);
  const pos = positionState(st);
  assert.equal(pos.itemOrdinal, 1);
  assert.equal(pos.nextItemOrdinal, 2);
});
