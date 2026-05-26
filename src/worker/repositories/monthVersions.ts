import { newId, nowIso } from './db';

const incrementMonthSql =
  'INSERT INTO user_month_versions (id, user_id, month, records_version, updated_at) ' +
  'VALUES (?, ?, ?, 1, ?) ' +
  'ON CONFLICT(user_id, month) DO UPDATE SET ' +
  'records_version = records_version + 1, updated_at = excluded.updated_at';

export function incrementUserMonthVersionStatement(db: D1Database, userId: string, month: string, now = nowIso()) {
  return db.prepare(incrementMonthSql).bind(newId('umv'), userId, month, now);
}

export function incrementUserMonthVersionStatements(db: D1Database, userId: string, months: string[], now = nowIso()) {
  return [...new Set(months)].map((month) => incrementUserMonthVersionStatement(db, userId, month, now));
}

export async function incrementUserMonthVersion(db: D1Database, userId: string, month: string) {
  await incrementUserMonthVersionStatement(db, userId, month).run();
}

export async function incrementUserMonthVersions(db: D1Database, userId: string, months: string[]) {
  for (const statement of incrementUserMonthVersionStatements(db, userId, months)) {
    await statement.run();
  }
}
