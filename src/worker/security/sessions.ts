import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../env';
import { findUserById, type UserWithPassword } from '../repositories/users';
import { newId, nowIso } from '../repositories/db';

export const SESSION_COOKIE_NAME = 'mp_session';
export const CSRF_HEADER_NAME = 'x-csrf-token';

const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

type AppContext = Context<{ Bindings: AppEnv }>;

export type CurrentSession = {
  id: string;
  user: UserWithPassword;
  csrfTokenHash: string;
};

function bytesToBase64Url(bytes: ArrayBuffer | Uint8Array) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return btoa(String.fromCharCode(...view))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return bytesToBase64Url(bytes);
}

async function hashToken(token: string) {
  return bytesToBase64Url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)));
}

function constantTimeEqual(left: string, right: string) {
  const leftBytes = new TextEncoder().encode(left);
  const rightBytes = new TextEncoder().encode(right);
  if (leftBytes.length !== rightBytes.length) return false;
  let diff = 0;
  for (let i = 0; i < leftBytes.length; i += 1) diff |= leftBytes[i] ^ rightBytes[i];
  return diff === 0;
}

function cookieExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toUTCString();
}

function dbExpiresAt() {
  return new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString();
}

export function sessionCookie(token: string) {
  return [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`,
    `Expires=${cookieExpiresAt()}`
  ].join('; ');
}

export function clearSessionCookie() {
  return [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT'
  ].join('; ');
}

function readCookie(c: AppContext, name: string) {
  const cookie = c.req.header('cookie');
  if (!cookie) return null;
  const pair = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!pair) return null;
  try {
    return decodeURIComponent(pair.slice(name.length + 1));
  } catch {
    return null;
  }
}

export async function createSession(db: D1Database, userId: string) {
  const id = newId('session');
  const token = randomToken();
  const csrfToken = randomToken();
  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, csrf_token_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(id, userId, await hashToken(token), await hashToken(csrfToken), dbExpiresAt(), nowIso())
    .run();
  return { id, token, csrfToken, cookie: sessionCookie(token) };
}

export async function getCurrentUser(c: AppContext): Promise<CurrentSession | null> {
  const token = readCookie(c, SESSION_COOKIE_NAME);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const session = await c.env.DB.prepare(
    `SELECT id, user_id, csrf_token_hash
     FROM sessions
     WHERE token_hash = ? AND expires_at > ?
     LIMIT 1`
  )
    .bind(tokenHash, nowIso())
    .first<{ id: string; user_id: string; csrf_token_hash: string }>();
  if (!session) return null;
  const user = await findUserById(c.env.DB, session.user_id);
  if (!user) return null;
  return { id: session.id, user, csrfTokenHash: session.csrf_token_hash };
}

export async function rotateCsrfToken(db: D1Database, sessionId: string) {
  const csrfToken = randomToken();
  await db
    .prepare('UPDATE sessions SET csrf_token_hash = ? WHERE id = ?')
    .bind(await hashToken(csrfToken), sessionId)
    .run();
  return csrfToken;
}

export async function deleteSession(db: D1Database, sessionId: string) {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
}

export async function requireUser(c: AppContext) {
  const session = await getCurrentUser(c);
  if (!session) throw new HTTPException(401, { message: 'Authentication required' });
  return session;
}

export async function requireAdmin(c: AppContext) {
  const session = await requireUser(c);
  if (session.user.role !== 'admin') throw new HTTPException(403, { message: 'Admin required' });
  return session;
}

export async function requireCsrf(c: AppContext, session?: CurrentSession) {
  const currentSession = session ?? (await requireUser(c));
  const csrfToken = c.req.header(CSRF_HEADER_NAME);
  if (!csrfToken || !constantTimeEqual(await hashToken(csrfToken), currentSession.csrfTokenHash)) {
    throw new HTTPException(403, { message: 'Invalid CSRF token' });
  }
  return currentSession;
}
