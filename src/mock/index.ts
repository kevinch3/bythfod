// A runnable eistedglobal: same schema, same contract, no backend required.
//
//   npm run mock                       empty, on :3000
//   npm run mock -- --seed demo        a browsable festival
//   npm run mock -- --seed bythfod     populated BY THE SIM, over real HTTP
//
// That last mode is the point: it boots the mock and then runs the ordinary
// prepareSandbox against it through the ordinary ApiClient. The populator and
// the emulator are the same code, aimed by base URL alone.
import { createServer, type Server } from 'node:http';
import type { DatabaseSync } from 'node:sqlite';
import { openDb, schemaChecksum } from './db.ts';
import { ROUTES, mapError, type Req, type Res } from './routes.ts';
import { sign, verify } from './auth.ts';
import { seedBasic, seedDemo, type SeedName } from './seed.ts';

export interface MockOptions {
  /** 0 picks a free port — what tests want. */
  port?: number;
  seed?: SeedName;
  jwtSecret?: string;
  /** Short values make token-expiry behaviour testable. */
  jwtExpiresSeconds?: number;
  corsOrigins?: string[];
  /** ':memory:' by default; a path makes the data outlive the process. */
  file?: string;
}

export interface MockServer {
  url: string;
  port: number;
  db: DatabaseSync;
  close(): Promise<void>;
}

const PUBLIC_ROUTES = new Set(['POST /auth/login', 'GET /health']);

export async function createMockServer(opts: MockOptions = {}): Promise<MockServer> {
  const {
    port = 3000, seed = 'basic', jwtSecret = 'mock-secret',
    jwtExpiresSeconds = 8 * 3600,
    corsOrigins = ['http://localhost:4200', 'http://localhost:8123'],
    file = ':memory:',
  } = opts;

  const db = openDb(file);
  const credentials = seed === 'demo' ? seedDemo(db) : seedBasic(db);

  const server = createServer((rq, rs) => {
    const origin = rq.headers.origin;
    if (origin && corsOrigins.includes(origin)) {
      rs.setHeader('Access-Control-Allow-Origin', origin);
      rs.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    rs.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE');
    rs.setHeader('Access-Control-Allow-Headers', 'content-type,authorization,x-api-key');
    if (rq.method === 'OPTIONS') { rs.writeHead(204).end(); return; }

    let raw = '';
    rq.on('data', c => { raw += c; });
    rq.on('end', () => {
      const send = (status: number, body?: unknown) => {
        if (body === undefined) { rs.writeHead(status).end(); return; }
        const text = JSON.stringify(body);
        rs.writeHead(status, { 'Content-Type': 'application/json' }).end(text);
      };

      const url = new URL(rq.url ?? '/', 'http://localhost');
      if (!url.pathname.startsWith('/api')) return send(404, { error: 'Route not found' });
      const path = url.pathname.slice('/api'.length) || '/';
      const method = rq.method ?? 'GET';

      let body: Record<string, unknown> | null = null;
      if (raw) {
        try { body = JSON.parse(raw) as Record<string, unknown>; }
        catch { return send(400, { error: 'Unexpected token in JSON', code: 'BAD_REQUEST' }); }
      }

      // Login is special: it mints the token every other route requires.
      if (method === 'POST' && path === '/auth/login') {
        const u = body?.username as string | undefined;
        const p = body?.password as string | undefined;
        if (!u || !p) return send(400, { error: 'username and password are required' });
        if (u !== credentials.username || p !== credentials.password) {
          return send(401, { error: 'Invalid credentials' });
        }
        return send(200, {
          token: sign({ userId: 1, username: u }, jwtSecret, jwtExpiresSeconds),
          name: credentials.name, username: u,
        });
      }

      const matched = match(method, path);
      if (!matched) return send(404, { error: 'Route not found' });

      let auth: Req['auth'] = null;
      if (!PUBLIC_ROUTES.has(`${method} ${path}`)) {
        const header = rq.headers.authorization;
        if (!header?.startsWith('Bearer ')) return send(401, { error: 'Token requerido' });
        const result = verify(header.slice(7), jwtSecret);
        if (!result.ok) return send(401, { error: 'Token inválido o expirado' });
        auth = { userId: result.payload.userId, username: result.payload.username };
      }

      const req: Req = { method, path, query: url.searchParams, body, auth };
      let res: Res;
      try {
        res = matched.handler(db, req, matched.params);
      } catch (err) {
        const mapped = mapError(err);
        return send(mapped.status, mapped.body);
      }
      send(res.status, res.body);
    });
  });

  await new Promise<void>(resolve => server.listen(port, resolve));
  const actual = (server.address() as { port: number }).port;

  return {
    url: `http://localhost:${actual}/api`,
    port: actual,
    db,
    close: () => closeServer(server, db),
  };
}

function match(method: string, path: string) {
  for (const [m, pattern, handler] of ROUTES) {
    if (m !== method) continue;
    const pp = pattern.split('/');
    const ap = path.split('/');
    if (pp.length !== ap.length) continue;
    const params: string[] = [];
    let ok = true;
    for (let i = 0; i < pp.length; i++) {
      const seg = pp[i] as string;
      if (seg.startsWith(':')) params.push(ap[i] as string);
      else if (seg !== ap[i]) { ok = false; break; }
    }
    if (ok) return { handler, params };
  }
  return null;
}

function closeServer(server: Server, db: DatabaseSync): Promise<void> {
  return new Promise(resolve => {
    server.close(() => { db.close(); resolve(); });
    server.closeAllConnections?.();
  });
}

export { schemaChecksum };
