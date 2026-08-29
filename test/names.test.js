import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/core/rng.js';
import { makeNameGen, GROUP_KINDS } from '../js/core/names.js';

test('person() returns non-empty name and surname', () => {
  const g = makeNameGen(makeRng(1));
  for (let i = 0; i < 30; i++) {
    const p = g.person();
    assert.ok(p.name.length > 0);
    assert.ok(p.surname.length > 0);
  }
});

test('person() is deterministic for a seed', () => {
  const a = makeNameGen(makeRng(42)), b = makeNameGen(makeRng(42));
  for (let i = 0; i < 10; i++) assert.deepEqual(a.person(), b.person());
});

test('group(kind) returns a non-empty string for every group kind', () => {
  const g = makeNameGen(makeRng(7));
  for (const kind of GROUP_KINDS) {
    const name = g.group(kind);
    assert.equal(typeof name, 'string');
    assert.ok(name.length > 3, `group name for ${kind} too short: "${name}"`);
  }
});

test('group names vary across draws', () => {
  const g = makeNameGen(makeRng(3));
  const names = new Set();
  for (let i = 0; i < 12; i++) names.add(g.group('coro'));
  assert.ok(names.size >= 6, `expected variety, got ${[...names].join(', ')}`);
});
