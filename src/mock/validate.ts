// Boundary validation, mirroring api/src/schemas + middleware/validate.ts.
//
// The vocabularies come from the vendored spec rather than being restated here,
// so when eistedglobal changes an enum a `contract:sync` picks it up instead of
// this file quietly disagreeing.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const specPath = join(dirname(fileURLToPath(import.meta.url)), '../../contract/openapi.yaml');

/** Reads `enum: [...]` off a named schema in the spec. Good enough for flat lists. */
function enumOf(schema: string): string[] {
  const spec = readFileSync(specPath, 'utf8');
  const at = spec.indexOf(`    ${schema}:`);
  if (at === -1) return [];
  const line = spec.slice(at).match(/enum: \[([^\]]*)\]/);
  if (!line) return [];
  return line[1]!.split(',').map(v => v.trim().replace(/^'|'$/g, '')).filter(v => v && v !== 'null');
}

const VOCAB: Record<string, string[]> = {
  placement: enumOf('Placement'),
  language: enumOf('Language'),
  type: enumOf('EntrantType'),
};

export interface FieldIssue { field: string; message: string }

/**
 * Returns the offending fields, or null when the body passes. Only checks the
 * enum vocabularies — required fields are already checked per-route, and the
 * schema catches everything else on the way in.
 */
export function validateVocab(body: Record<string, unknown> | null): FieldIssue[] | null {
  if (!body) return null;
  const issues: FieldIssue[] = [];
  for (const [field, allowed] of Object.entries(VOCAB)) {
    const value = body[field];
    if (value === undefined || value === null || allowed.length === 0) continue;
    if (!allowed.includes(String(value))) {
      issues.push({ field, message: `Invalid option: expected one of ${allowed.map(a => `"${a}"`).join('|')}` });
    }
  }
  return issues.length ? issues : null;
}
