// HS256 tokens, compatible with what jsonwebtoken produces, in about forty
// lines of node:crypto — so the mock stays dependency-free.
//
// Expiry is honoured, and configurable, which is what makes assumption #11
// ("a mid-session 401 means the token expired") testable rather than assumed:
// start the mock with a five-second expiry and the client's re-login path runs
// for real instead of being described in a comment.
import { createHmac, timingSafeEqual } from 'node:crypto';

const b64url = (buf: Buffer | string): string =>
  Buffer.from(buf).toString('base64url');

export interface TokenPayload {
  userId: number;
  username: string;
  exp: number;
}

export function sign(payload: Omit<TokenPayload, 'exp'>, secret: string, expiresInSeconds: number): string {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  }));
  const data = `${header}.${body}`;
  return `${data}.${b64url(createHmac('sha256', secret).update(data).digest())}`;
}

export type VerifyResult =
  | { ok: true; payload: TokenPayload }
  /** Distinguished so the mock can return the API's two different 401 bodies. */
  | { ok: false; reason: 'malformed' | 'signature' | 'expired' };

export function verify(token: string, secret: string): VerifyResult {
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [header, body, sig] = parts as [string, string, string];

  const expected = Buffer.from(b64url(createHmac('sha256', secret).update(`${header}.${body}`).digest()));
  const actual = Buffer.from(sig);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return { ok: false, reason: 'signature' };
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()) {
    return { ok: false, reason: 'expired' };
  }
  return { ok: true, payload };
}
