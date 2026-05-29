import type { Role, User } from '../../shared/types';
import { newId, nowIso, rowToCamel } from './db';

export type UserWithPassword = User & {
  passwordHash: string;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
  role: Role;
  default_currency: string;
  created_at: string;
  updated_at: string;
};

function rowToUser(row: UserRow): UserWithPassword {
  return rowToCamel(row) as UserWithPassword;
}

export async function findUserByUsername(db: D1Database, username: string) {
  const row = await db.prepare('SELECT * FROM users WHERE username = ?').bind(username).first<UserRow>();
  return row ? rowToUser(row) : null;
}

export async function findUserById(db: D1Database, id: string) {
  const row = await db.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
  return row ? rowToUser(row) : null;
}

export async function countAdmins(db: D1Database) {
  const row = await db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'admin'").first<{ count: number }>();
  return row?.count ?? 0;
}

export async function createUser(
  db: D1Database,
  input: {
    username: string;
    passwordHash: string;
    role: Role;
    defaultCurrency?: string;
  }
) {
  const id = newId('user');
  const now = nowIso();
  const defaultCurrency = input.defaultCurrency ?? 'USD';
  await db
    .prepare(
      `INSERT INTO users (id, username, password_hash, role, default_currency, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(id, input.username, input.passwordHash, input.role, defaultCurrency, now, now)
    .run();
  return findUserById(db, id);
}

export async function listUsersForAdmin(db: D1Database) {
  const result = await db
    .prepare('SELECT * FROM users ORDER BY created_at DESC, username ASC')
    .all<UserRow>();
  return result.results.map(rowToUser);
}

export async function updateUserPassword(db: D1Database, userId: string, passwordHash: string) {
  await db
    .prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?')
    .bind(passwordHash, nowIso(), userId)
    .run();
}

export async function deleteUser(db: D1Database, userId: string) {
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
}
