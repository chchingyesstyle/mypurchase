import { describe, expect, it } from 'vitest';
import migrationSql from '../../migrations/0001_initial.sql?raw';

const required = [
  'CREATE TABLE users',
  'CREATE TABLE sessions',
  'CREATE TABLE categories',
  'CREATE TABLE receipts',
  'CREATE TABLE receipt_items',
  'CREATE TABLE budgets',
  'CREATE TABLE monthly_reports',
  'CREATE TABLE user_month_versions',
  'CREATE TABLE audit_log',
  'CREATE UNIQUE INDEX users_username_unique',
  'CREATE INDEX receipts_user_purchase_date_idx',
  'CREATE UNIQUE INDEX monthly_reports_user_month_unique'
];

describe('initial D1 migration', () => {
  it('defines the required tables and indexes', () => {
    for (const token of required) {
      expect(migrationSql).toContain(token);
    }
  });

  it('seeds built-in categories in the migration', () => {
    expect(migrationSql).toContain("('Groceries'");
    expect(migrationSql).toContain("('Household'");
    expect(migrationSql).toContain("('Online shopping'");
  });
});
