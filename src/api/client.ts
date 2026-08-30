// Typed client for the eistedglobal REST API. Injectable fetch makes it
// testable in Node and reusable by tools/*.mjs. Behavior: JSON in/out, typed
// ApiError, one silent re-login + retry on 401, and a serialized write queue
// (enqueue) so a mid-show hiccup can't drop or reorder awards.
import type { components } from '../contract/api.generated.ts';

type S = components['schemas'];
export type Category = S['Category'];
export type Edition = S['Edition'];
export type Competition = S['Competition'];
export type CompetitionRow = S['CompetitionRow'];
export type Participant = S['Participant'];
export type Registration = S['RegistrationListItem'];
export type Work = S['WorkListItem'];
export type LoginResponse = S['LoginResponse'];
export type ApiErrorBody = S['Error'];

export class ApiError extends Error {
  readonly status: number;
  readonly body: ApiErrorBody | null;

  constructor(status: number, body: ApiErrorBody | null) {
    super(`API ${status}: ${body?.error ?? JSON.stringify(body)}`);
    this.status = status;
    this.body = body;
  }
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;
  private token: string | null;
  /** Kept so a 401 can be retried once with a fresh login. */
  private _creds: { username: string; password: string } | null;
  /** Serializes writes; see enqueue(). */
  private _queue: Promise<unknown>;

  constructor({ baseUrl, fetchImpl = globalThis.fetch?.bind(globalThis) }: {
    baseUrl: string;
    fetchImpl?: typeof fetch;
  }) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.token = null;
    this._creds = null;
    this._queue = Promise.resolve();
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    const out = await this._raw<LoginResponse>('POST', '/auth/login', { username, password });
    this.token = out.token;
    this._creds = { username, password };
    return out;
  }

  async _raw<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    const res = await this.fetch(`${this.baseUrl}${path}`, {
      method, headers, body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.status === 204) return null as T;
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data);
    return data as T;
  }

  async _req<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await this._raw<T>(method, path, body);
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
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this._queue.then(() => fn());
    this._queue = run.catch(() => {}); // keep the chain alive after failures
    return run;
  }

  // Categories
  getCategories() { return this._req<Category[]>('GET', '/categories'); }
  createCategory(data: S['CategoryInput']) { return this._req<Category>('POST', '/categories', data); }

  // Editions
  getEdition(year: number) { return this._req<Edition>('GET', `/editions/${year}`); }
  createEdition(data: { year: number }) { return this._req<Edition>('POST', '/editions', data); }
  updateEdition(year: number, data: S['EditionInput']) { return this._req<Edition>('PUT', `/editions/${year}`, data); }

  // Competitions
  getCompetitions(year: number) { return this._req<Competition[]>('GET', `/competitions?year=${year}`); }
  getCompetition(id: string) { return this._req<Competition>('GET', `/competitions/${id}`); }
  createCompetition(data: S['CompetitionInput']) { return this._req<CompetitionRow>('POST', '/competitions', data); }
  updateCompetition(id: string, data: S['CompetitionUpdate']) { return this._req<CompetitionRow>('PUT', `/competitions/${id}`, data); }
  deleteCompetition(id: string) { return this._req<null>('DELETE', `/competitions/${id}`); }

  // Participants
  getParticipants(q?: string) { return this._req<Participant[]>('GET', `/participants${q ? `?q=${encodeURIComponent(q)}` : ''}`); }
  createParticipant(data: S['ParticipantInput']) { return this._req<Participant>('POST', '/participants', data); }
  /** hard:true removes the row; the default deactivates it (active = 0). */
  deleteParticipant(id: number, { hard = false }: { hard?: boolean } = {}) {
    return this._req<null>('DELETE', `/participants/${id}${hard ? '?hard=1' : ''}`);
  }

  // Registrations
  getRegistrations({ year, comp, dropped }: {
    year?: number;
    comp?: string;
    /** '0' (default) live only, '1' withdrawn only, 'all' both. */
    dropped?: '0' | '1' | 'all';
  } = {}) {
    const q = new URLSearchParams();
    if (year) q.set('year', String(year));
    if (comp) q.set('comp', comp);
    // '0' (default) live only, '1' withdrawn only, 'all' both.
    if (dropped !== undefined) q.set('dropped', dropped);
    const qs = q.toString();
    return this._req<Registration[]>('GET', `/registrations${qs ? `?${qs}` : ''}`);
  }
  createRegistration(data: S['RegistrationInput']) { return this._req<Registration>('POST', '/registrations', data); }
  dropRegistration(id: number) { return this._req<{ message: string }>('PATCH', `/registrations/${id}/drop`); }
  deleteRegistration(id: number) { return this._req<null>('DELETE', `/registrations/${id}`); }

  // Works
  getWorks(comp?: string) { return this._req<Work[]>('GET', `/works${comp ? `?comp=${encodeURIComponent(comp)}` : ''}`); }
  createWork(data: S['WorkInput']) { return this._req<Work>('POST', '/works', data); }
  deleteWork(id: number) { return this._req<null>('DELETE', `/works/${id}`); }

  health() { return this._req<{ status: string; timestamp: string }>('GET', '/health'); }
}
