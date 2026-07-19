-- ============================================================================
-- Octagon Commercial — platform tables (build book §3)
-- Packet P0.1 + P0.4 (2026-07-17)
-- All statements are CREATE ... IF NOT EXISTS: safe to run on every boot.
-- Executed by platform/server/crud-engine.js -> mountCrud().
-- Storage engine: SQLite (node:sqlite DatabaseSync / better-sqlite3 compatible).
-- ============================================================================

-- --------------------------------------------------------------------------
-- Generic document store. One row per record; the record body is a JSON blob
-- in `data`. Soft delete via removed=1 (rows are never hard-deleted).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_records (
  entity     TEXT NOT NULL,
  id         TEXT NOT NULL,
  data       TEXT NOT NULL DEFAULT '{}',   -- JSON document body
  created_at TEXT,
  updated_at TEXT,
  created_by TEXT,
  removed    INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity, id)
);
CREATE INDEX IF NOT EXISTS idx_x_records_entity_removed ON x_records (entity, removed);

-- --------------------------------------------------------------------------
-- General ledger — APPEND-ONLY. Never UPDATE/DELETE rows; corrections are
-- reversal rows and cancellations set is_cancelled on a NEW reversal pair.
-- (Written by P2.1 gl.js; created here so the schema exists from day one.)
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_gl (
  id           TEXT PRIMARY KEY,
  voucher_type TEXT,
  voucher_no   TEXT,
  account      TEXT,
  debit        REAL NOT NULL DEFAULT 0,
  credit       REAL NOT NULL DEFAULT 0,
  party_type   TEXT,
  party        TEXT,
  dims         TEXT,                        -- JSON: {cost_center, project, branch, ...}
  posting_date TEXT,
  company      TEXT,
  is_cancelled INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_x_gl_account_date ON x_gl (account, posting_date);
CREATE INDEX IF NOT EXISTS idx_x_gl_voucher ON x_gl (voucher_type, voucher_no);
CREATE INDEX IF NOT EXISTS idx_x_gl_party ON x_gl (party_type, party);

-- --------------------------------------------------------------------------
-- Stock ledger — APPEND-ONLY (same discipline as x_gl).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_stock_ledger (
  id             TEXT PRIMARY KEY,
  voucher_type   TEXT,
  voucher_no     TEXT,
  item           TEXT,
  warehouse      TEXT,
  qty            REAL NOT NULL DEFAULT 0,
  valuation_rate REAL,
  batch          TEXT,
  serial         TEXT,
  posting_date   TEXT,
  created_at     TEXT,
  is_cancelled   INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_x_stock_item_wh ON x_stock_ledger (item, warehouse);
CREATE INDEX IF NOT EXISTS idx_x_stock_voucher ON x_stock_ledger (voucher_type, voucher_no);

-- --------------------------------------------------------------------------
-- Chatter: messages / internal logs / scheduled activities per record (P0.3).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_chatter (
  id            TEXT PRIMARY KEY,
  entity        TEXT NOT NULL,
  record_id     TEXT NOT NULL,
  kind          TEXT NOT NULL DEFAULT 'message', -- message | log | activity
  body          TEXT,
  author        TEXT,
  activity_type TEXT,
  due_date      TEXT,
  done          INTEGER NOT NULL DEFAULT 0,
  meta          TEXT,                            -- JSON
  created_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_x_chatter_record ON x_chatter (entity, record_id);

CREATE TABLE IF NOT EXISTS x_followers (
  entity    TEXT NOT NULL,
  record_id TEXT NOT NULL,
  user      TEXT NOT NULL,
  PRIMARY KEY (entity, record_id, user)
);

-- --------------------------------------------------------------------------
-- Document numbering (P0.4). One row per sequence key. next_number is issued
-- and incremented inside BEGIN IMMEDIATE so two concurrent creates can never
-- receive the same number. year/month enable {YYYY}/{MM} pattern resets.
-- NOTE: distinct from the legacy top-level `sequences` table (T1.4) — that
-- table is owned by server.js and is NOT touched by the platform layer.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_sequences (
  seq_key     TEXT PRIMARY KEY,
  next_number INTEGER NOT NULL DEFAULT 1,
  year        INTEGER,
  month       INTEGER,
  updated_at  TEXT
);

-- --------------------------------------------------------------------------
-- Notifications (P0.5).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_notifications (
  id         TEXT PRIMARY KEY,
  user       TEXT NOT NULL,
  title      TEXT,
  body       TEXT,
  link       TEXT,
  read       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_x_notifications_user ON x_notifications (user, read);

-- --------------------------------------------------------------------------
-- Approvals (P0.5).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_approvals (
  id            TEXT PRIMARY KEY,
  entity        TEXT,
  record_id     TEXT,
  action        TEXT,
  payload       TEXT,                       -- JSON
  requester     TEXT,
  approver_role TEXT,
  status        TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected
  decided_by    TEXT,
  decided_at    TEXT,
  cc            TEXT,                       -- JSON array of users
  created_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_x_approvals_status ON x_approvals (status, approver_role);
CREATE INDEX IF NOT EXISTS idx_x_approvals_record ON x_approvals (entity, record_id);

-- --------------------------------------------------------------------------
-- Audit / record history (P0.4). before/after are JSON snapshots.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_audit (
  id        TEXT PRIMARY KEY,
  entity    TEXT NOT NULL,
  record_id TEXT NOT NULL,
  user      TEXT,
  action    TEXT NOT NULL,                  -- create | update | delete | ...
  before    TEXT,                           -- JSON snapshot (null on create)
  after     TEXT,                           -- JSON snapshot (null on delete)
  at        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_x_audit_record ON x_audit (entity, record_id);

-- --------------------------------------------------------------------------
-- Saved views (P0.7).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_views (
  id     TEXT PRIMARY KEY,
  user   TEXT,
  entity TEXT NOT NULL,
  name   TEXT NOT NULL,
  config TEXT                               -- JSON: filters/sort/columns
);
CREATE INDEX IF NOT EXISTS idx_x_views_entity_user ON x_views (entity, user);

-- --------------------------------------------------------------------------
-- Custom fields (P0.7). Values live inside x_records.data.custom{}.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_custom_fields (
  entity   TEXT NOT NULL,
  key      TEXT NOT NULL,
  label_ar TEXT,
  type     TEXT NOT NULL DEFAULT 'text',    -- text|number|date|select|textarea
  options  TEXT,                            -- JSON (select options etc.)
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity, key)
);

-- --------------------------------------------------------------------------
-- ACL matrix (P0.2). perm = "section:entity:action", scope = all|own|dept.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS x_acl_roles (
  role     TEXT PRIMARY KEY,
  label_ar TEXT
);

CREATE TABLE IF NOT EXISTS x_acl_grants (
  role  TEXT NOT NULL,
  perm  TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'all',
  PRIMARY KEY (role, perm)
);
