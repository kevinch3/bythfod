import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.ts';
import {
  FeedbackGenerator, TemplateFeedbackGenerator, pickFragment, generateWithTimeout,
} from '../src/core/feedback.ts';

const item = (kind, language, placements) => ({
  ordinal: 1,
  program: { kind, language, label: 'Test', comp: 42 },
  entrants: [
    { key: 'a', displayName: 'Eirlys Jones' },
    { key: 'b', displayName: 'Côr Porth Awel' },
    { key: 'c', displayName: 'Gwyn Roberts' },
  ],
  placements,
});

test('base class is abstract', async () => {
  await assert.rejects(() => new FeedbackGenerator().generate({}));
});

test('returns an opening plus one line per placed entrant', async () => {
  const gen = new TemplateFeedbackGenerator();
  const placed = [{ entrantKey: 'a', placement: '1' }, { entrantKey: 'c', placement: '2' }];
  const lines = await gen.generate({ item: item('solo', 'es', placed), rng: makeRng(1) });
  assert.ok(lines.length >= 3, `got ${lines.length} lines`);
  for (const l of lines) assert.ok(typeof l === 'string' && l.length > 5);
  const joined = lines.join(' ');
  assert.match(joined, /Eirlys Jones/);
  assert.match(joined, /Gwyn Roberts/);
});

test('is deterministic for the same rng seed', async () => {
  const placed = [{ entrantKey: 'b', placement: '1' }];
  const a = await new TemplateFeedbackGenerator().generate({ item: item('coro', 'cy', placed), rng: makeRng(9) });
  const b = await new TemplateFeedbackGenerator().generate({ item: item('coro', 'cy', placed), rng: makeRng(9) });
  assert.deepEqual(a, b);
});

test('desierto still yields jury commentary', async () => {
  const lines = await new TemplateFeedbackGenerator().generate({ item: item('dawns', 'cy', 'desierto'), rng: makeRng(3) });
  assert.ok(lines.length >= 1);
});

test('every kind has technical vocabulary', async () => {
  for (const kind of ['solo', 'recitacion', 'cydadrodd', 'coro', 'conjunto', 'parti', 'deuawd', 'dawns', 'instrumental']) {
    const placed = [{ entrantKey: 'a', placement: '1' }];
    const lines = await new TemplateFeedbackGenerator().generate({ item: item(kind, 'es', placed), rng: makeRng(5) });
    assert.ok(lines.length >= 2, `no lines for ${kind}`);
  }
});

test('generateWithTimeout falls back when the generator stalls', async () => {
  class Stalled extends FeedbackGenerator {
    generate() { return new Promise(() => {}); } // never resolves
  }
  const lines = await generateWithTimeout(new Stalled(), {}, 20, 'Diolch — da iawn pawb.');
  assert.deepEqual(lines, ['Diolch — da iawn pawb.']);
});

test('generateWithTimeout passes through a fast generator', async () => {
  class Fast extends FeedbackGenerator {
    async generate() { return ['una línea']; }
  }
  const lines = await generateWithTimeout(new Fast(), {}, 1000, 'fallback');
  assert.deepEqual(lines, ['una línea']);
});

// ── Learning TODO #3: pickFragment — RED until you implement it ───────────

test('pickFragment avoids recently used fragments when it can', { todo: true }, () => {
  const bank = ['a', 'b', 'c', 'd'];
  for (let seed = 0; seed < 30; seed++) {
    const chosen = pickFragment(bank, ['a', 'b'], makeRng(seed));
    assert.ok(['c', 'd'].includes(chosen), `picked recent "${chosen}"`);
  }
});

test('pickFragment still returns something when everything is recent', { todo: true }, () => {
  const bank = ['x', 'y'];
  const chosen = pickFragment(bank, ['x', 'y', 'x', 'y'], makeRng(1));
  assert.ok(bank.includes(chosen));
});
