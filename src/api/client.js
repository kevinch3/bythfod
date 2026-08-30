// Typed client for the eistedglobal REST API. Injectable fetch makes it
// testable in Node and reusable by tools/*.mjs. Behavior: JSON in/out, typed
// ApiError, one silent re-login + retry on 401, and a serialized write queue
// (enqueue) so a mid-show hiccup can't drop or reorder awards.
export class ApiError extends Error {
  constructor(status, body) {
    super(`API ${status}: ${body?.error ?? JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  constructor({ baseUrl, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.token = null;
    this._creds = null;
    this._queue = Promise.resolve();
  }

  async login(username, password) {
    const out = await this._raw('POST', '/auth/login', { username, password });
    this.token = out.token;
    this._creds = { username, password };
    return out;
  }

  async _raw(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return null;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data);
    return data;
  }

  async _req(method, path, body) {
    try {
      return await this._raw(method, path, body);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401 && this._creds) {
        await this.login(this._creds.username, this._creds.password);
        return this._raw(method, path, body);
      }
      throw err;
    }
  }

  /**
   * Serialize a write so a mid-show hiccup cannot reorder awards.
   *
   * Deliberately does NOT retry. It used to be `fn().catch(() => fn())`, which
   * retried ANY failure — including one where the write had already landed.
   * POST /works has no uniqueness constraint (contract scenario 11a: two
   * identical posts create two rows), so that blind retry could put a duplicate
   * winner on the results board. Retrying belongs where we can tell what already
   * exists; see award() in sandbox.js.
   */
  enqueue(fn) {
    const run = this._queue.then(() => fn());
    this._queue = run.catch(() => {}); // keep the chain alive after failures
    return run;
  }

  // Categories
  getCategories() { return this._req('GET', '/categories'); }
  createCategory(data) { return this._req('POST', '/categories', data); }

  // Editions
  getEdition(year) { return this._req('GET', `/editions/${year}`); }
  createEdition(data) { return this._req('POST', '/editions', data); }
  updateEdition(year, data) { return this._req('PUT', `/editions/${year}`, data); }

  // Competitions
  getCompetitions(year) { return this._req('GET', `/competitions?year=${year}`); }
  getCompetition(id) { return this._req('GET', `/competitions/${id}`); }
  createCompetition(data) { return this._req('POST', '/competitions', data); }
  updateCompetition(id, data) { return this._req('PUT', `/competitions/${id}`, data); }
  deleteCompetition(id) { return this._req('DELETE', `/competitions/${id}`); }

  // Participants
  getParticipants(q) { return this._req('GET', `/participants${q ? `?q=${encodeURIComponent(q)}` : ''}`); }
  createParticipant(data) { return this._req('POST', '/participants', data); }
  /** hard:true removes the row; the default deactivates it (active = 0). */
  deleteParticipant(id, { hard = false } = {}) {
    return this._req('DELETE', `/participants/${id}${hard ? '?hard=1' : ''}`);
  }

  // Registrations
  getRegistrations({ year, comp, dropped } = {}) {
    const q = new URLSearchParams();
    if (year) q.set('year', year);
    if (comp) q.set('comp', comp);
    // '0' (default) live only, '1' withdrawn only, 'all' both.
    if (dropped !== undefined) q.set('dropped', dropped);
    const qs = q.toString();
    return this._req('GET', `/registrations${qs ? `?${qs}` : ''}`);
  }
  createRegistration(data) { return this._req('POST', '/registrations', data); }
  dropRegistration(id) { return this._req('PATCH', `/registrations/${id}/drop`); }
  deleteRegistration(id) { return this._req('DELETE', `/registrations/${id}`); }

  // Works
  getWorks(comp) { return this._req('GET', `/works${comp ? `?comp=${encodeURIComponent(comp)}` : ''}`); }
  createWork(data) { return this._req('POST', '/works', data); }
  deleteWork(id) { return this._req('DELETE', `/works/${id}`); }

  health() { return this._req('GET', '/health'); }
}
