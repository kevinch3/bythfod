// Storage for the mock: node:sqlite over eistedglobal's VERBATIM schema.
//
// The point of vendoring contract/schema.sql rather than restating the tables
// is that the constraints are not a reimplementation — they are the same DDL,
// enforced by the same engine. When the real API rejects something for a
// foreign key or a CHECK, the mock rejects it for exactly the same reason.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const schemaPath = join(root, 'contract/schema.sql');

/** Hash of the schema actually in use, so drift from upstream is visible. */
export function schemaChecksum(): string {
  return createHash('sha256').update(readFileSync(schemaPath)).digest('hex').slice(0, 16);
}

export function openDb(file = ':memory:'): DatabaseSync {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON');
  db.exec(readFileSync(schemaPath, 'utf8'));
  return db;
}
