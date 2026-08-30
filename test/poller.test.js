import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollWindow, nextPollDelay } from '../src/api/poller.ts';

test('pollWindow returns the current item plus the three before it in running order', () => {
  const order = [10, 11, 12, 13, 14, 15];
  assert.deepEqual(pollWindow(order, 14), [11, 12, 13, 14]);
});

test('pollWindow clamps at the start and handles unknown ordinals', () => {
  assert.deepEqual(pollWindow([10, 11, 12], 10), [10]);
  assert.deepEqual(pollWindow([10, 11, 12], 11), [10, 11]);
  assert.deepEqual(pollWindow([10, 11, 12], 99), []);
});

// ── Learning TODO #4 (optional): adaptive polling backoff ─────────────────

test('nextPollDelay: fast while active, slow while idle, backs off on errors', { todo: true }, () => {
  assert.equal(nextPollDelay({ active: true, errorCount: 0 }), 3000);
  assert.equal(nextPollDelay({ active: false, errorCount: 0 }), 15000);
  const e1 = nextPollDelay({ active: true, errorCount: 1 });
  const e3 = nextPollDelay({ active: true, errorCount: 3 });
  assert.ok(e1 > 3000, 'errors should slow polling down');
  assert.ok(e3 > e1, 'backoff should grow with consecutive errors');
  assert.ok(e3 <= 60000, 'backoff should be capped');
});
