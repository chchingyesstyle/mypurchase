import { newId, nowIso } from './db';

export async function incrementUserMonthVersion(db: D1Database, userId: string, month: string) {
  const now = nowIso();
  await db
    .prepare(
      `INSERT INTO user_month_versions (id, user_id, month, records_version, updated_at)
       VALUES (?, ?, ?, 1, ?)
       ON CONFLICT(user_id, month) DO UPDATE SET
         records_version = records_version + 1,
         updated_at = excluded.updated_at`
    )
    .bind(newId('umv'), userId, month, now)
    .run();
}

export async function incrementUserMonthVersions(db: D1Database, userId: string, months: string[]) {
  for (const month of months) {
    await incrementUserMonthVersion(db, userId, month);
  }
}
