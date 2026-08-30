// Maps database errors to HTTP, mirroring eistedglobal's errorHandler exactly.
//
// The mock's job is to be wrong in the same ways the real API is wrong. When
// eistedglobal changes this mapping, this file changes with it and the shared
// contract suite is the referee — if only one of them moves, the suite says so.

export interface MappedError {
  status: number;
  body: { error: string; code: string };
}

interface SqliteLikeError extends Error {
  code?: string;
}

/** Same codes, same statuses, same messages as api/src/middleware/errorHandler.ts. */
export function mapError(err: unknown): MappedError {
  const code = (err as SqliteLikeError)?.code;
  switch (code) {
    case 'ERR_SQLITE_ERROR':
      return mapSqliteMessage((err as Error).message);
    case 'SQLITE_CONSTRAINT_PRIMARYKEY':
    case 'SQLITE_CONSTRAINT_UNIQUE':
      return conflictDuplicate();
    case 'SQLITE_CONSTRAINT_FOREIGNKEY':
      return conflictReference();
    case 'SQLITE_CONSTRAINT_NOTNULL':
      return { status: 400, body: { error: 'Falta un campo obligatorio', code: 'VALIDATION_REQUIRED' } };
    case 'SQLITE_CONSTRAINT_CHECK':
      return { status: 400, body: { error: 'Un campo tiene un valor no permitido', code: 'VALIDATION_VALUE' } };
    default:
      return { status: 500, body: { error: 'Error interno del servidor', code: 'INTERNAL' } };
  }
}

/**
 * node:sqlite reports every constraint failure as ERR_SQLITE_ERROR and puts the
 * specific kind in the message, where better-sqlite3 exposes it as a code. The
 * two engines agree on the message text, so that is what we read.
 */
function mapSqliteMessage(message: string): MappedError {
  if (/UNIQUE constraint failed/i.test(message)) return conflictDuplicate();
  if (/FOREIGN KEY constraint failed/i.test(message)) return conflictReference();
  if (/NOT NULL constraint failed/i.test(message)) {
    return { status: 400, body: { error: 'Falta un campo obligatorio', code: 'VALIDATION_REQUIRED' } };
  }
  if (/CHECK constraint failed/i.test(message)) {
    return { status: 400, body: { error: 'Un campo tiene un valor no permitido', code: 'VALIDATION_VALUE' } };
  }
  return { status: 500, body: { error: 'Error interno del servidor', code: 'INTERNAL' } };
}

const conflictDuplicate = (): MappedError =>
  ({ status: 409, body: { error: 'Ya existe un registro con ese identificador', code: 'CONFLICT_DUPLICATE' } });

const conflictReference = (): MappedError =>
  ({ status: 409, body: { error: 'La operación entra en conflicto con registros relacionados', code: 'CONFLICT_REFERENCE' } });
