// Contract-test harness. One scenario suite, two targets: the real API (via
// tools/contract-live.mjs) and, from stage 5, the in-process mock.
//
// Every assertion also validates the response body against contract/openapi.yaml,
// so behaviour and shape are checked together — a route that starts returning an
// extra field, or dropping one, fails here even if no test names that field.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { load } from 'js-yaml';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

export function loadSpec() {
  return load(readFileSync(join(root, 'contract/openapi.yaml'), 'utf8'));
}

/**
 * Ajv over the spec's components, with $ref resolution against the whole
 * document. OpenAPI 3.1 schemas are JSON Schema 2020-12, which ajv handles once
 * the document is registered under the same base the $refs use.
 */
function makeAjv(spec) {
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: true });
  addFormats(ajv);
  return ajv;
}

/** Response schema for an operationId + status, or null when none is documented. */
function responseSchema(spec, operationId, status) {
  for (const [path, item] of Object.entries(spec.paths ?? {})) {
    for (const [method, op] of Object.entries(item)) {
      if (!op || typeof op !== 'object' || op.operationId !== operationId) continue;
      let res = op.responses?.[String(status)];
      if (!res) return { found: false, path, method };
      // Follow a $ref to components.responses
      if (res.$ref) {
        const key = res.$ref.split('/').pop();
        res = spec.components?.responses?.[key];
      }
      const schema = res?.content?.['application/json']?.schema;
      return { found: true, schema: schema ?? null, path, method };
    }
  }
  return { found: false };
}

export function createValidator(spec) {
  const ajv = makeAjv(spec);
  const cache = new Map();

  /**
   * Assert a response body conforms to what the spec documents for this
   * operation and status. Throws with the ajv errors when it does not.
   */
  return function expectValid(operationId, status, body) {
    const key = `${operationId}:${status}`;
    if (!cache.has(key)) {
      const found = responseSchema(spec, operationId, status);
      if (!found.found) {
        throw new Error(`spec documents no ${status} response for operation "${operationId}"`);
      }
      // Compile against a root that carries `components`, so the schema's own
      // `#/components/...` refs resolve. (In 2020-12 `$ref` allows siblings.)
      cache.set(key, found.schema
        ? ajv.compile({ ...found.schema, components: spec.components })
        : null);
    }
    const validate = cache.get(key);
    if (!validate) return body; // documented, but no JSON body (e.g. 204)
    if (!validate(body)) {
      const errs = (validate.errors ?? [])
        .map(e => `      ${e.instancePath || '/'} ${e.message}`)
        .join('\n');
      throw new Error(`response does not match the spec for ${operationId} ${status}:\n${errs}\n` +
        `    body: ${JSON.stringify(body).slice(0, 400)}`);
    }
    return body;
  };
}

/** Minimal HTTP client that returns status AND body, never throwing on 4xx/5xx. */
export function createClient(baseUrl, token = null) {
  const call = async (method, path, body, opts = {}) => {
    const headers = { ...(opts.headers ?? {}) };
    if (body !== undefined && !('content-type' in headers)) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed = null;
    if (text) { try { parsed = JSON.parse(text); } catch { parsed = text; } }
    return { status: res.status, body: parsed, raw: text, headers: res.headers };
  };
  return {
    get: (p, o) => call('GET', p, undefined, o),
    post: (p, b, o) => call('POST', p, b, o),
    put: (p, b, o) => call('PUT', p, b, o),
    patch: (p, b, o) => call('PATCH', p, b, o),
    del: (p, o) => call('DELETE', p, undefined, o),
    withToken: (t) => createClient(baseUrl, t),
  };
}

/**
 * Sandbox naming. Everything a scenario creates must be recognisable as ours so
 * a live run can never be mistaken for, or collide with, real festival data.
 */
export const SANDBOX = {
  YEAR: 2099,
  COMP_PREFIX: 'BY2099',
  DOC_PREFIX: 'CONTRACT-',
  compId: (n) => `BY2099CT${String(n).padStart(2, '0')}`,
};
