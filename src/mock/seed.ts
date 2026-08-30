// Seed data for the mock.
//
// Deterministic by construction — fixed lists, no faker, no randomness. A mock
// whose contents change between runs cannot be asserted against, and the whole
// point is that the contract suite can run against it in CI.
import type { DatabaseSync } from 'node:sqlite';

export type SeedName = 'basic' | 'demo';

export interface Credentials {
  username: string;
  password: string;
  name: string;
}

/** The seven categories both of eistedglobal's seed scripts converge on. */
const CATEGORIES: [string, string][] = [
  ['Canto Individual', 'Canu Unigol'],
  ['Canto Grupal', 'Canu Grŵp'],
  ['Recitado', 'Adrodd'],
  ['Danza', 'Dawns'],
  ['Instrumental', 'Offerynnol'],
  ['Composición', 'Cyfansoddi'],
  ['Artesanías', 'Crefft'],
];

/**
 * The credentials are the mock's own, not eistedglobal's — this server has no
 * connection to any real instance, and hardcoding a real seed password here
 * would put it back in the repo we removed it from.
 */
const CREDENTIALS: Credentials = { username: 'mock', password: 'mock', name: 'Mock Admin' };

/** Equivalent of eistedglobal's seed.ts: an admin and the category vocabulary. */
export function seedBasic(db: DatabaseSync): Credentials {
  for (const [name, welsh] of CATEGORIES) {
    db.prepare('INSERT INTO category (name, name_welsh) VALUES (?, ?)').run(name, welsh);
  }
  db.prepare('INSERT INTO edition (year) VALUES (?)').run(new Date().getFullYear());
  return CREDENTIALS;
}

/** A browsable festival: enough to click around the Angular admin. */
export function seedDemo(db: DatabaseSync): Credentials {
  seedBasic(db);
  const year = new Date().getFullYear();

  const comps: [string, number, string, string, string][] = [
    ['D01', 1, 'Unawd hyd 25 oed', 'Cymraeg', 'IND'],
    ['D02', 1, 'Solo 13 a 17 años', 'Castellano', 'IND'],
    ['D03', 2, 'Coro Juvenil hasta 25 años', 'Castellano', 'GRU'],
    ['D04', 3, 'Adrodd 13 tan 18 oed', 'Cymraeg', 'IND'],
    ['D05', 4, 'Dawns werin i brofiadwyr', 'Cymraeg', 'GRU'],
    ['D06', 5, 'Dúo instrumental', 'Castellano', 'GRU'],
  ];
  for (const [i, [id, cat, desc, lang, type]] of comps.entries()) {
    db.prepare(`INSERT INTO competition (id, category_id, description, language, year, type, rank)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(`${year}-${id}`, cat, desc, lang, year, type, i + 1);
  }

  const people: [string, string, string][] = [
    ['Alwena', 'Sain', 'IND'], ['Mabon', 'Bethel', 'IND'], ['Tegwen', 'Enfys', 'IND'],
    ['Osian', 'Zorzal', 'IND'], ['Lila', 'Ñanco', 'IND'], ['Bruno', 'Calafate', 'IND'],
    ['Côr y Dyffryn', '', 'GRU'], ['Parti Awel', '', 'GRU'],
  ];
  for (const [i, [name, surname, type]] of people.entries()) {
    db.prepare(`INSERT INTO participant (name, surname, document_id, nationality, residence, type, active)
                VALUES (?, ?, ?, 'Argentina', 'Chubut', ?, 1)`)
      .run(name, surname || null, `DEMO-${String(i + 1).padStart(3, '0')}`, type);
  }

  // Register each participant into a competition of a matching type, and record
  // a placement for the first few so the results board has something to show.
  const parts = db.prepare('SELECT id, type FROM participant ORDER BY id').all() as { id: number; type: string }[];
  const byType = (t: string) => comps.map(c => c[0]).filter((_, i) => comps[i]![4] === t);
  for (const p of parts) {
    const pool = byType(p.type);
    const compId = `${year}-${pool[p.id % pool.length]}`;
    db.prepare('INSERT INTO registration (participant_id, competition_id, year) VALUES (?, ?, ?)')
      .run(p.id, compId, year);
    if (p.id <= 3) {
      db.prepare(`INSERT INTO work (participant_id, display_name, placement, competition_id, title)
                  VALUES (?, ?, ?, ?, ?)`)
        .run(p.id, `${p.id}`, String(p.id), compId, 'Obra de demostración');
    }
  }
  return CREDENTIALS;
}

export { CREDENTIALS };
