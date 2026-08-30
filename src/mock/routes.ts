// The eistedglobal routes, reimplemented over the shared schema.
//
// Reimplementing rather than importing is the design, not a concession: two
// independent implementations over one schema and one spec, both checked by one
// contract suite, is a stronger guarantee than a single implementation with a
// fake in front of it. When they disagree, one of them is wrong and the suite
// says which assertion caught it.
//
// Quirks are reproduced faithfully — GET /registrations hides dropped rows by
// default and DELETE /participants is soft unless ?hard=1. A mock that quietly
// behaved better than the API would hide exactly the bugs worth finding.

import type { DatabaseSync } from 'node:sqlite';
import { mapError } from './errors.ts';

export interface Req {
  method: string;
  path: string;
  query: URLSearchParams;
  body: Record<string, unknown> | null;
  auth: { userId: number; username: string } | null;
}

export interface Res {
  status: number;
  body?: unknown;
}

type Handler = (db: DatabaseSync, req: Req, params: string[]) => Res;

const json = (status: number, body?: unknown): Res => ({ status, body });
const notFound = (what: string): Res => json(404, { error: `${what} not found` });
const required = (msg: string): Res => json(400, { error: msg });

/** Returns null when every named field is present. */
function missing(body: Record<string, unknown> | null, fields: string[], msg: string): Res | null {
  if (!body) return required(msg);
  return fields.every(f => body[f] !== undefined && body[f] !== null) ? null : required(msg);
}

const one = <T>(db: DatabaseSync, sql: string, ...args: unknown[]): T | undefined =>
  db.prepare(sql).get(...(args as never[])) as T | undefined;
const all = <T>(db: DatabaseSync, sql: string, ...args: unknown[]): T[] =>
  db.prepare(sql).all(...(args as never[])) as T[];

/** METHOD + path pattern -> handler. `:x` captures a segment. */
export const ROUTES: [string, string, Handler][] = [
  // ── health ───────────────────────────────────────────────────────────
  ['GET', '/health', () => json(200, { status: 'ok', timestamp: new Date().toISOString() })],

  // ── auth ─────────────────────────────────────────────────────────────
  ['GET', '/auth/me', (_db, req) => json(200, req.auth)],

  // ── categories ───────────────────────────────────────────────────────
  ['GET', '/categories', db => json(200, all(db, 'SELECT * FROM category ORDER BY name ASC'))],
  ['POST', '/categories', (db, req) => {
    const bad = missing(req.body, ['name'], 'name is required');
    if (bad) return bad;
    const b = req.body as Record<string, unknown>;
    // No UNIQUE on name: duplicates are created silently, as upstream.
    const r = db.prepare('INSERT INTO category (name, name_welsh) VALUES (?, ?)')
      .run(b.name as string, (b.name_welsh ?? null) as string | null);
    return json(201, one(db, 'SELECT * FROM category WHERE id = ?', r.lastInsertRowid));
  }],
  ['PUT', '/categories/:id', (db, req, [id]) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = db.prepare('UPDATE category SET name=?, name_welsh=? WHERE id=?')
      .run(b.name as string, (b.name_welsh ?? null) as string | null, id as string);
    if (r.changes === 0) return notFound('Category');
    return json(200, one(db, 'SELECT * FROM category WHERE id = ?', id));
  }],
  ['DELETE', '/categories/:id', (db, _req, [id]) => {
    const r = db.prepare('DELETE FROM category WHERE id = ?').run(id as string);
    return r.changes === 0 ? notFound('Category') : json(204);
  }],

  // ── editions ─────────────────────────────────────────────────────────
  ['GET', '/editions', db => json(200, all(db, 'SELECT * FROM edition ORDER BY year DESC'))],
  ['GET', '/editions/:year', (db, _req, [year]) => {
    const row = one(db, 'SELECT * FROM edition WHERE year = ?', year);
    return row ? json(200, row) : notFound('Edition');
  }],
  ['POST', '/editions', (db, req) => {
    const bad = missing(req.body, ['year'], 'year is required');
    if (bad) return bad;
    const year = (req.body as Record<string, unknown>).year as number;
    // The one endpoint upstream checks before inserting, so it gets a clean 409.
    if (one(db, 'SELECT year FROM edition WHERE year = ?', year)) {
      return json(409, { error: 'Edition already exists' });
    }
    db.prepare('INSERT INTO edition (year) VALUES (?)').run(year);
    return json(201, one(db, 'SELECT * FROM edition WHERE year = ?', year));
  }],
  ['PUT', '/editions/:year', (db, req, [year]) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    // Full replace: omitted fields become NULL, exactly as upstream (quirk C1).
    const r = db.prepare(
      'UPDATE edition SET committee=?, committee_img=?, presenters=?, presenters_img=? WHERE year=?',
    ).run(
      (b.committee ?? null) as string | null, (b.committee_img ?? null) as string | null,
      (b.presenters ?? null) as string | null, (b.presenters_img ?? null) as string | null,
      year as string,
    );
    if (r.changes === 0) return notFound('Edition');
    return json(200, one(db, 'SELECT * FROM edition WHERE year = ?', year));
  }],
  ['DELETE', '/editions/:year', (db, _req, [year]) => {
    const r = db.prepare('DELETE FROM edition WHERE year = ?').run(year as string);
    return r.changes === 0 ? notFound('Edition') : json(204);
  }],
  ['GET', '/editions/:year/uploads', (db, _req, [year]) =>
    json(200, all(db, 'SELECT * FROM upload WHERE year = ?', year))],
  ['POST', '/editions/:year/uploads', (db, req, [year]) => {
    const bad = missing(req.body, ['filename'], 'filename is required');
    if (bad) return bad;
    const b = req.body as Record<string, unknown>;
    const r = db.prepare('INSERT INTO upload (year, filename, description) VALUES (?, ?, ?)')
      .run(year as string, b.filename as string, (b.description ?? null) as string | null);
    return json(201, one(db, 'SELECT * FROM upload WHERE id = ?', r.lastInsertRowid));
  }],

  // ── competitions ─────────────────────────────────────────────────────
  ['GET', '/competitions', (db, req) => {
    const where: string[] = [];
    const args: unknown[] = [];
    const year = req.query.get('year');
    const type = req.query.get('type');
    if (year) { where.push('c.year = ?'); args.push(Number(year)); }
    if (type) { where.push('c.type = ?'); args.push(type); }
    return json(200, all(db,
      `SELECT c.*, cat.name AS category_name, cat.name_welsh AS category_name_welsh
       FROM competition c JOIN category cat ON c.category_id = cat.id
       ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY c.rank ASC, c.id ASC`, ...args));
  }],
  ['GET', '/competitions/:id', (db, _req, [id]) => {
    const row = one(db,
      `SELECT c.*, cat.name AS category_name, cat.name_welsh AS category_name_welsh
       FROM competition c JOIN category cat ON c.category_id = cat.id WHERE c.id = ?`, id);
    return row ? json(200, row) : notFound('Competition');
  }],
  ['POST', '/competitions', (db, req) => {
    const bad = missing(req.body, ['id', 'category_id', 'year', 'type'],
      'id, category_id, year, and type are required');
    if (bad) return bad;
    const b = req.body as Record<string, unknown>;
    db.prepare(`INSERT INTO competition
      (id, category_id, description, language, year, type, extra_text, rank, preliminary)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      b.id as string, b.category_id as number, (b.description ?? null) as string | null,
      (b.language ?? null) as string | null, b.year as number, b.type as string,
      (b.extra_text ?? null) as string | null, (b.rank ?? 0) as number,
      (b.preliminary ?? null) as string | null);
    // POST returns the plain row, without the category JOIN, as upstream.
    return json(201, one(db, 'SELECT * FROM competition WHERE id = ?', b.id));
  }],
  ['PUT', '/competitions/:id', (db, req, [id]) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    // id and year are deliberately absent from the SET clause (quirk C6).
    const r = db.prepare(`UPDATE competition SET
      category_id=?, description=?, language=?, type=?, extra_text=?, rank=?, preliminary=? WHERE id=?`).run(
      b.category_id as number, (b.description ?? null) as string | null,
      (b.language ?? null) as string | null, b.type as string,
      (b.extra_text ?? null) as string | null, (b.rank ?? 0) as number,
      (b.preliminary ?? null) as string | null, id as string);
    if (r.changes === 0) return notFound('Competition');
    return json(200, one(db, 'SELECT * FROM competition WHERE id = ?', id));
  }],
  ['DELETE', '/competitions/:id', (db, _req, [id]) => {
    const r = db.prepare('DELETE FROM competition WHERE id = ?').run(id as string);
    return r.changes === 0 ? notFound('Competition') : json(204);
  }],

  // ── participants ─────────────────────────────────────────────────────
  ['GET', '/participants', (db, req) => {
    const where: string[] = [];
    const args: unknown[] = [];
    const type = req.query.get('type');
    const q = req.query.get('q');
    if (type) { where.push('type = ?'); args.push(type); }
    // Substring LIKE across three columns — the semantics sandbox.ts defends against.
    if (q) { where.push('(name LIKE ? OR surname LIKE ? OR document_id LIKE ?)'); args.push(`%${q}%`, `%${q}%`, `%${q}%`); }
    // Active only unless asked otherwise, since B3.
    if (req.query.get('includeInactive') !== '1') where.push('active = 1');
    return json(200, all(db,
      `SELECT * FROM participant ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
       ORDER BY surname ASC, name ASC`, ...args));
  }],
  ['GET', '/participants/:id', (db, _req, [id]) => {
    const row = one(db, 'SELECT * FROM participant WHERE id = ?', id);
    return row ? json(200, row) : notFound('Participant');
  }],
  ['POST', '/participants', (db, req) => {
    const bad = missing(req.body, ['name', 'type'], 'name and type are required');
    if (bad) return bad;
    const b = req.body as Record<string, unknown>;
    const r = db.prepare(`INSERT INTO participant
      (name, surname, document_id, birth_date, nationality, residence, email, phone, type, active)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      b.name as string, (b.surname ?? null) as string | null, (b.document_id ?? null) as string | null,
      (b.birth_date ?? null) as string | null, (b.nationality ?? null) as string | null,
      (b.residence ?? null) as string | null, (b.email ?? null) as string | null,
      (b.phone ?? null) as string | null, b.type as string, normalizeActive(b.active, 1));
    return json(201, one(db, 'SELECT * FROM participant WHERE id = ?', r.lastInsertRowid));
  }],
  ['PUT', '/participants/:id', (db, req, [id]) => {
    const existing = one<{ active: number }>(db, 'SELECT active FROM participant WHERE id = ?', id);
    if (!existing) return notFound('Participant');
    const b = (req.body ?? {}) as Record<string, unknown>;
    db.prepare(`UPDATE participant SET
      name=?, surname=?, document_id=?, birth_date=?, nationality=?, residence=?, email=?, phone=?, type=?, active=?
      WHERE id=?`).run(
      b.name as string, (b.surname ?? null) as string | null, (b.document_id ?? null) as string | null,
      (b.birth_date ?? null) as string | null, (b.nationality ?? null) as string | null,
      (b.residence ?? null) as string | null, (b.email ?? null) as string | null,
      (b.phone ?? null) as string | null, b.type as string,
      // Omitting active preserves it here, unlike POST which defaults to 1.
      normalizeActive(b.active, existing.active), id as string);
    return json(200, one(db, 'SELECT * FROM participant WHERE id = ?', id));
  }],
  ['DELETE', '/participants/:id', (db, req, [id]) => {
    const hard = req.query.get('hard') === '1';
    const r = hard
      ? db.prepare('DELETE FROM participant WHERE id = ?').run(id as string)
      : db.prepare('UPDATE participant SET active = 0 WHERE id = ?').run(id as string);
    return r.changes === 0 ? notFound('Participant') : json(204);
  }],

  // ── registrations ────────────────────────────────────────────────────
  ['GET', '/registrations', (db, req) => {
    const dropped = req.query.get('dropped');
    const where = [dropped === 'all' ? '1=1' : dropped === '1' ? 'r.dropped = 1' : 'r.dropped = 0'];
    const args: unknown[] = [];
    for (const [param, col] of [['year', 'r.year'], ['comp', 'r.competition_id'], ['participant', 'r.participant_id']] as const) {
      const v = req.query.get(param);
      if (v) { where.push(`${col} = ?`); args.push(param === 'comp' ? v : Number(v)); }
    }
    return json(200, all(db,
      `SELECT r.*, p.name, p.surname, p.type, c.description AS comp_description, c.language
       FROM registration r
       JOIN participant p ON r.participant_id = p.id
       JOIN competition c ON r.competition_id = c.id
       WHERE ${where.join(' AND ')} ORDER BY p.surname ASC, p.name ASC`, ...args));
  }],
  ['GET', '/registrations/:id', (db, _req, [id]) => {
    // Narrower than the list form, and no dropped filter — quirks A8 and B4.
    const row = one(db,
      `SELECT r.*, p.name, p.surname FROM registration r
       JOIN participant p ON r.participant_id = p.id WHERE r.id = ?`, id);
    return row ? json(200, row) : notFound('Registration');
  }],
  ['POST', '/registrations', (db, req) => {
    const bad = missing(req.body, ['participant_id', 'competition_id', 'year'],
      'participant_id, competition_id, and year are required');
    if (bad) return bad;
    const b = req.body as Record<string, unknown>;
    const r = db.prepare('INSERT INTO registration (participant_id, competition_id, pseudonym, year) VALUES (?, ?, ?, ?)')
      .run(b.participant_id as number, b.competition_id as string,
           (b.pseudonym ?? null) as string | null, b.year as number);
    return json(201, one(db, 'SELECT * FROM registration WHERE id = ?', r.lastInsertRowid));
  }],
  ['PUT', '/registrations/:id', (db, req, [id]) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = db.prepare('UPDATE registration SET competition_id=?, pseudonym=? WHERE id=?')
      .run(b.competition_id as string, (b.pseudonym ?? null) as string | null, id as string);
    if (r.changes === 0) return notFound('Registration');
    return json(200, one(db, 'SELECT * FROM registration WHERE id = ?', id));
  }],
  ['PATCH', '/registrations/:id/drop', (db, _req, [id]) => {
    const r = db.prepare('UPDATE registration SET dropped = 1 WHERE id = ?').run(id as string);
    // 204, like every other mutation, since B6.
    return r.changes === 0 ? notFound('Registration') : json(204);
  }],
  ['DELETE', '/registrations/:id', (db, _req, [id]) => {
    const r = db.prepare('DELETE FROM registration WHERE id = ?').run(id as string);
    return r.changes === 0 ? notFound('Registration') : json(204);
  }],

  // ── works ────────────────────────────────────────────────────────────
  ['GET', '/works', (db, req) => {
    const where: string[] = ['1=1'];
    const args: unknown[] = [];
    const comp = req.query.get('comp');
    const participant = req.query.get('participant');
    if (comp) { where.push('w.competition_id = ?'); args.push(comp); }
    if (participant) { where.push('w.participant_id = ?'); args.push(Number(participant)); }
    return json(200, all(db,
      `SELECT w.*, p.name, p.surname, p.type FROM work w
       JOIN participant p ON w.participant_id = p.id
       WHERE ${where.join(' AND ')} ORDER BY w.placement ASC, w.title ASC`, ...args));
  }],
  ['GET', '/works/:id', (db, _req, [id]) => {
    const row = one(db,
      `SELECT w.*, p.name, p.surname FROM work w
       JOIN participant p ON w.participant_id = p.id WHERE w.id = ?`, id);
    return row ? json(200, row) : notFound('Work');
  }],
  ['POST', '/works', (db, req) => {
    const bad = missing(req.body, ['participant_id', 'competition_id', 'title'],
      'participant_id, competition_id, and title are required');
    if (bad) return bad;
    const b = req.body as Record<string, unknown>;
    // `date` is server-generated; a date in the body is ignored, as upstream.
    const r = db.prepare(`INSERT INTO work
      (participant_id, display_name, placement, competition_id, title, video_url, photo_url)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      b.participant_id as number, (b.display_name ?? null) as string | null,
      (b.placement ?? null) as string | null, b.competition_id as string, b.title as string,
      (b.video_url ?? null) as string | null, (b.photo_url ?? null) as string | null);
    return json(201, one(db, 'SELECT * FROM work WHERE id = ?', r.lastInsertRowid));
  }],
  ['PUT', '/works/:id', (db, req, [id]) => {
    const b = (req.body ?? {}) as Record<string, unknown>;
    const r = db.prepare('UPDATE work SET display_name=?, placement=?, title=?, video_url=?, photo_url=? WHERE id=?')
      .run((b.display_name ?? null) as string | null, (b.placement ?? null) as string | null,
           b.title as string, (b.video_url ?? null) as string | null,
           (b.photo_url ?? null) as string | null, id as string);
    if (r.changes === 0) return notFound('Work');
    return json(200, one(db, 'SELECT * FROM work WHERE id = ?', id));
  }],
  ['DELETE', '/works/:id', (db, _req, [id]) => {
    const r = db.prepare('DELETE FROM work WHERE id = ?').run(id as string);
    return r.changes === 0 ? notFound('Work') : json(204);
  }],
];

/** Coerces boolean/number/string to 0|1, as upstream's normalizeActive does. */
function normalizeActive(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback ? 1 : 0;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value === 0 ? 0 : 1;
  if (typeof value === 'string') {
    const n = value.trim().toLowerCase();
    return n === '0' || n === 'false' ? 0 : 1;
  }
  return fallback ? 1 : 0;
}

export { mapError };
