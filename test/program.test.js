import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROGRAM, KINDS } from '../src/core/program.ts';

const allItems = () => PROGRAM.sessions.flatMap(s => s.items);

test('has three sessions with the fictional day-program item counts', () => {
  assert.equal(PROGRAM.sessions.length, 3);
  assert.deepEqual(PROGRAM.sessions.map(s => s.items.length), [12, 18, 16]);
  assert.equal(allItems().length, 46);
});

test('carries a fictional festival identity (no real-festival branding)', () => {
  assert.ok(PROGRAM.festival?.length > 3);
  const branding = JSON.stringify(PROGRAM).toLowerCase();
  assert.ok(!branding.includes('mimosa'), 'real festival name leaked into program data');
});

test('sessions carry id and label', () => {
  for (const s of PROGRAM.sessions) {
    assert.ok(s.id && s.label, `session missing id/label`);
  }
});

test('exactly two ceremonies, pinned at slots 6 and 12 of session 3', () => {
  const ceremonies = allItems().filter(i => i.kind === 'ceremony');
  assert.equal(ceremonies.length, 2);
  const s3 = PROGRAM.sessions[2].items;
  assert.equal(s3[5].ceremony, 'delyn');
  assert.equal(s3[5].fixedSlot, 6);
  assert.equal(s3[11].ceremony, 'bythfod');
  assert.equal(s3[11].fixedSlot, 12);
});

test('every item has a valid kind, language and entrantType', () => {
  for (const item of allItems()) {
    assert.ok(KINDS.includes(item.kind), `bad kind: ${item.kind} (${item.label})`);
    assert.ok(['es', 'cy'].includes(item.language), `bad language on ${item.label}`);
    assert.ok(['IND', 'GRU'].includes(item.entrantType), `bad entrantType on ${item.label}`);
  }
});

test('every competitive item has a unique comp number and a label', () => {
  const seen = new Set();
  for (const item of allItems()) {
    if (item.kind === 'ceremony') continue;
    assert.ok(Number.isInteger(item.comp), `missing comp on ${item.label}`);
    assert.ok(!seen.has(item.comp), `duplicate comp ${item.comp}`);
    seen.add(item.comp);
    assert.ok(item.label.length > 3);
  }
});

test('group kinds map to GRU and solo kinds to IND', () => {
  for (const item of allItems()) {
    if (['coro', 'conjunto', 'parti', 'dawns', 'deuawd', 'cydadrodd'].includes(item.kind)) {
      assert.equal(item.entrantType, 'GRU', `${item.label} should be GRU`);
    }
    if (['solo', 'recitacion'].includes(item.kind)) {
      assert.equal(item.entrantType, 'IND', `${item.label} should be IND`);
    }
  }
});
