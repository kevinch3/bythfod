import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../src/core/rng.js';

test('same seed produces the same sequence', () => {
  const a = makeRng(42), b = makeRng(42);
  for (let i = 0; i < 10; i++) assert.equal(a.next(), b.next());
});

test('different seeds produce different sequences', () => {
  const a = makeRng(1), b = makeRng(2);
  const seqA = [a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next()];
  assert.notDeepEqual(seqA, seqB);
});

test('next() stays within [0, 1)', () => {
  const r = makeRng(7);
  for (let i = 0; i < 1000; i++) {
    const v = r.next();
    assert.ok(v >= 0 && v < 1);
  }
});

test('int(min, max) is inclusive on both ends and covers the range', () => {
  const r = makeRng(3);
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const v = r.int(1, 5);
    assert.ok(Number.isInteger(v) && v >= 1 && v <= 5);
    seen.add(v);
  }
  assert.equal(seen.size, 5);
});

test('pick returns an element of the array', () => {
  const r = makeRng(9);
  const arr = ['a', 'b', 'c'];
  for (let i = 0; i < 50; i++) assert.ok(arr.includes(r.pick(arr)));
});

test('chance respects extremes', () => {
  const r = makeRng(11);
  for (let i = 0; i < 20; i++) {
    assert.equal(r.chance(0), false);
    assert.equal(r.chance(1), true);
  }
});

test('shuffle returns a new array with the same members, deterministically', () => {
  const arr = [1, 2, 3, 4, 5, 6, 7, 8];
  const a = makeRng(5).shuffle(arr);
  const b = makeRng(5).shuffle(arr);
  assert.notEqual(a, arr);
  assert.deepEqual([...a].sort(), [...arr].sort());
  assert.deepEqual(a, b);
  assert.deepEqual(arr, [1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
});

test('split(label) derives deterministic, independent streams', () => {
  const r1 = makeRng(42), r2 = makeRng(42);
  const a1 = r1.split('order'), a2 = r2.split('order');
  const b1 = r1.split('names');
  assert.equal(a1.next(), a2.next());          // same label → same stream
  assert.notEqual(a1.next(), b1.next());        // different label → different stream
});

test('consuming one split stream does not shift a sibling stream', () => {
  const r1 = makeRng(42), r2 = makeRng(42);
  const namesA = r1.split('names');
  const orderB = r2.split('order');
  for (let i = 0; i < 5; i++) orderB.next();    // consume sibling on one side only
  const namesB = r2.split('names');
  assert.equal(namesA.next(), namesB.next());
});
