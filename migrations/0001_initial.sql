PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'user')),
  default_currency TEXT NOT NULL DEFAULT 'USD',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  csrf_token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('built_in', 'custom')),
  color TEXT NOT NULL,
  icon TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (
    (kind = 'built_in' AND user_id IS NULL) OR
    (kind = 'custom' AND user_id IS NOT NULL)
  ),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  merchant TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  currency TEXT NOT NULL,
  subtotal INTEGER,
  tax INTEGER,
  discount INTEGER,
  total INTEGER NOT NULL,
  category_id TEXT,
  notes TEXT,
  source_type TEXT NOT NULL CHECK (source_type IN ('manual', 'receipt_image')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE receipt_items (
  id TEXT PRIMARY KEY,
  receipt_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price INTEGER NOT NULL,
  total_price INTEGER NOT NULL,
  category_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE budgets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  month TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE monthly_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  ai_advice_json TEXT NOT NULL,
  records_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE user_month_versions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  month TEXT NOT NULL,
  records_version INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX users_username_unique ON users(username);
CREATE INDEX sessions_token_hash_idx ON sessions(token_hash);
CREATE INDEX receipts_user_purchase_date_idx ON receipts(user_id, purchase_date);
CREATE INDEX receipts_user_merchant_idx ON receipts(user_id, merchant);
CREATE INDEX receipts_user_category_idx ON receipts(user_id, category_id);
CREATE INDEX receipt_items_user_receipt_idx ON receipt_items(user_id, receipt_id);
CREATE INDEX receipt_items_user_category_idx ON receipt_items(user_id, category_id);
CREATE INDEX budgets_user_month_category_idx ON budgets(user_id, month, category_id);
CREATE UNIQUE INDEX monthly_reports_user_month_unique ON monthly_reports(user_id, month);
CREATE UNIQUE INDEX user_month_versions_user_month_unique ON user_month_versions(user_id, month);

CREATE TRIGGER receipts_category_owner_insert
BEFORE INSERT ON receipts
FOR EACH ROW
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE id = NEW.category_id
    AND (user_id IS NULL OR user_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'receipt category must be built-in or owned by receipt user');
END;

CREATE TRIGGER receipts_category_owner_update
BEFORE UPDATE OF user_id, category_id ON receipts
FOR EACH ROW
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE id = NEW.category_id
    AND (user_id IS NULL OR user_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'receipt category must be built-in or owned by receipt user');
END;

CREATE TRIGGER receipt_items_category_owner_insert
BEFORE INSERT ON receipt_items
FOR EACH ROW
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE id = NEW.category_id
    AND (user_id IS NULL OR user_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'receipt item category must be built-in or owned by item user');
END;

CREATE TRIGGER receipt_items_category_owner_update
BEFORE UPDATE OF user_id, category_id ON receipt_items
FOR EACH ROW
WHEN NEW.category_id IS NOT NULL AND NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE id = NEW.category_id
    AND (user_id IS NULL OR user_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'receipt item category must be built-in or owned by item user');
END;

CREATE TRIGGER budgets_category_owner_insert
BEFORE INSERT ON budgets
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE id = NEW.category_id
    AND (user_id IS NULL OR user_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'budget category must be built-in or owned by budget user');
END;

CREATE TRIGGER budgets_category_owner_update
BEFORE UPDATE OF user_id, category_id ON budgets
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM categories
  WHERE id = NEW.category_id
    AND (user_id IS NULL OR user_id = NEW.user_id)
)
BEGIN
  SELECT RAISE(ABORT, 'budget category must be built-in or owned by budget user');
END;

INSERT INTO categories (name, user_id, kind, color, icon, created_at, id) VALUES
  ('Groceries', NULL, 'built_in', '#22c55e', 'shopping-basket', '2026-01-01T00:00:00.000Z', 'cat_builtin_groceries'),
  ('Household', NULL, 'built_in', '#06b6d4', 'home', '2026-01-01T00:00:00.000Z', 'cat_builtin_household'),
  ('Personal care', NULL, 'built_in', '#ec4899', 'sparkles', '2026-01-01T00:00:00.000Z', 'cat_builtin_personal_care'),
  ('Clothing', NULL, 'built_in', '#8b5cf6', 'shirt', '2026-01-01T00:00:00.000Z', 'cat_builtin_clothing'),
  ('Electronics', NULL, 'built_in', '#3b82f6', 'smartphone', '2026-01-01T00:00:00.000Z', 'cat_builtin_electronics'),
  ('Dining', NULL, 'built_in', '#f97316', 'utensils', '2026-01-01T00:00:00.000Z', 'cat_builtin_dining'),
  ('Transport', NULL, 'built_in', '#64748b', 'car', '2026-01-01T00:00:00.000Z', 'cat_builtin_transport'),
  ('Health', NULL, 'built_in', '#ef4444', 'heart-pulse', '2026-01-01T00:00:00.000Z', 'cat_builtin_health'),
  ('Gifts', NULL, 'built_in', '#a855f7', 'gift', '2026-01-01T00:00:00.000Z', 'cat_builtin_gifts'),
  ('Online shopping', NULL, 'built_in', '#14b8a6', 'package', '2026-01-01T00:00:00.000Z', 'cat_builtin_online_shopping'),
  ('Other', NULL, 'built_in', '#71717a', 'circle-ellipsis', '2026-01-01T00:00:00.000Z', 'cat_builtin_other');
