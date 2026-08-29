import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiClient, ApiError } from '../js/api/client.js';

// Scriptable fetch stub: pops responses in order, records every request.
function stubFetch(script) {
  const calls = [];
  const fetchImpl = async (url, opts = {}) => {
    calls.push({ url: String(url), method: opts.method ?? 'GET', headers: opts.headers ?? {}, body: opts.body ? JSON.parse(opts.body) : undefined });
    const next = script.shift() ?? { status: 200, body: {} };
    return {
      ok: next.status < 400,
      status: next.status,
      json: async () => next.body,
      text: async () => JSON.stringify(next.body ?? ''),
    };
  };
  return { calls, fetchImpl };
}

const login = { status: 200, body: { token: 'tok-1', name: 'Admin', username: 'admin' } };

test('login posts credentials and later requests carry the bearer token', async () => {
  const { calls, fetchImpl } = stubFetch([login, { status: 200, body: [] }]);
  const c = new ApiClient({ baseUrl: 'http://x/api', fetchImpl });
  await c.login('admin', 'test-pw');
  await c.getCategories();
  assert.equal(calls[0].url, 'http://x/api/auth/login');
  assert.equal(calls[0].method, 'POST');
  assert.deepEqual(calls[0].body, { username: 'admin', password: 'test-pw' });
  assert.equal(calls[1].headers.Authorization, 'Bearer tok-1');
});

test('getCompetitions filters by year in the query string', async () => {
  const { calls, fetchImpl } = stubFetch([login, { status: 200, body: [] }]);
  const c = new ApiClient({ baseUrl: 'http://x/api', fetchImpl });
  await c.login('a', 'b');
  await c.getCompetitions(2099);
  assert.equal(calls[1].url, 'http://x/api/competitions?year=2099');
});

test('non-2xx responses throw ApiError with the status', async () => {
  const { fetchImpl } = stubFetch([login, { status: 404, body: { error: 'Competition not found' } }]);
  const c = new ApiClient({ baseUrl: 'http://x/api', fetchImpl });
  await c.login('a', 'b');
  await assert.rejects(() => c.getCompetition('NOPE'), err => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.status, 404);
    assert.match(err.message, /Competition not found/);
    return true;
  });
});

test('a 401 mid-session triggers one silent re-login and retry', async () => {
  const { calls, fetchImpl } = stubFetch([
    login,
    { status: 401, body: { error: 'Invalid token' } },
    { status: 200, body: { token: 'tok-2', name: 'Admin', username: 'admin' } },
    { status: 200, body: [{ id: 1 }] },
  ]);
  const c = new ApiClient({ baseUrl: 'http://x/api', fetchImpl });
  await c.login('admin', 'test-pw');
  const out = await c.getCategories();
  assert.deepEqual(out, [{ id: 1 }]);
  assert.equal(calls.length, 4);
  assert.equal(calls[2].url, 'http://x/api/auth/login');
  assert.equal(calls[3].headers.Authorization, 'Bearer tok-2');
});

test('dropRegistration PATCHes the drop endpoint; deleteWork handles 204', async () => {
  const { calls, fetchImpl } = stubFetch([login, { status: 200, body: { message: 'ok' } }, { status: 204, body: undefined }]);
  const c = new ApiClient({ baseUrl: 'http://x/api', fetchImpl });
  await c.login('a', 'b');
  await c.dropRegistration(5);
  await c.deleteWork(9);
  assert.equal(calls[1].method, 'PATCH');
  assert.equal(calls[1].url, 'http://x/api/registrations/5/drop');
  assert.equal(calls[2].method, 'DELETE');
  assert.equal(calls[2].url, 'http://x/api/works/9');
});

test('createWork posts the full body as JSON', async () => {
  const { calls, fetchImpl } = stubFetch([login, { status: 201, body: { id: 3 } }]);
  const c = new ApiClient({ baseUrl: 'http://x/api', fetchImpl });
  await c.login('a', 'b');
  const w = { participant_id: 1, competition_id: 'BY209901', title: 'Cân', placement: '1', display_name: 'X' };
  const out = await c.createWork(w);
  assert.equal(out.id, 3);
  assert.deepEqual(calls[1].body, w);
  assert.equal(calls[1].headers['Content-Type'], 'application/json');
});

test('enqueue serializes writes and retries a failure once', async () => {
  const order = [];
  const c = new ApiClient({ baseUrl: 'http://x', fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({}) }) });
  let firstTry = true;
  const slow = () => new Promise(res => setTimeout(() => { order.push('slow'); res(); }, 30));
  const flaky = async () => {
    if (firstTry) { firstTry = false; throw new Error('transient'); }
    order.push('flaky-ok');
  };
  await Promise.all([c.enqueue(slow), c.enqueue(flaky)]);
  assert.deepEqual(order, ['slow', 'flaky-ok']);
});
