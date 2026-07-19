// R6.1 POS v2: terminal profiles, sessions, offline replay receipts, sales,
// and Z-report reconciliation. All schema is migration-owned; offline replay
// never posts GL until the authenticated session is closed.
'use strict';

export const migration = {
  id: '631_r6_pos_v2',
  dependsOn: ['630_r5_hr_additive'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pos_terminal_profile (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        cash_account_id TEXT NOT NULL REFERENCES account(id),
        card_account_id TEXT REFERENCES account(id),
        income_account_id TEXT NOT NULL REFERENCES account(id),
        self_order_token TEXT UNIQUE,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_terminal_company_code
        ON pos_terminal_profile(company_id, code);

      CREATE TABLE IF NOT EXISTS pos_session (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        terminal_id TEXT NOT NULL REFERENCES pos_terminal_profile(id),
        cashier_id TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'closed')),
        opening_cash REAL NOT NULL DEFAULT 0,
        closed_cash REAL,
        cash_sales REAL NOT NULL DEFAULT 0,
        card_sales REAL NOT NULL DEFAULT 0,
        variance REAL,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        z_report_id TEXT,
        created_by TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_pos_session_company_state
        ON pos_session(company_id, state, terminal_id);

      CREATE TABLE IF NOT EXISTS pos_sale (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        session_id TEXT NOT NULL REFERENCES pos_session(id),
        client_sale_id TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'terminal' CHECK (source IN ('terminal', 'offline', 'self_order')),
        kind TEXT NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale', 'refund')),
        state TEXT NOT NULL DEFAULT 'posted' CHECK (state IN ('draft', 'posted', 'refunded')),
        original_sale_id TEXT REFERENCES pos_sale(id),
        payment_method TEXT NOT NULL DEFAULT 'cash' CHECK (payment_method IN ('cash', 'card', 'other', 'unpaid')),
        total REAL NOT NULL CHECK (total >= 0),
        payload_hash TEXT NOT NULL,
        sold_at TEXT NOT NULL,
        created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_sale_company_client
        ON pos_sale(company_id, client_sale_id);
      CREATE INDEX IF NOT EXISTS idx_pos_sale_session_state
        ON pos_sale(session_id, state, payment_method);

      CREATE TABLE IF NOT EXISTS pos_sale_line (
        id TEXT PRIMARY KEY,
        sale_id TEXT NOT NULL REFERENCES pos_sale(id) ON DELETE CASCADE,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        product_id TEXT NOT NULL REFERENCES product_master(id),
        qty REAL NOT NULL CHECK (qty > 0),
        unit_price REAL NOT NULL CHECK (unit_price >= 0),
        line_total REAL NOT NULL CHECK (line_total >= 0),
        meta_json TEXT NOT NULL DEFAULT '{}'
      ) STRICT;

      CREATE TABLE IF NOT EXISTS pos_sync_command (
        idempotency_key TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        tenant_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        command_type TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        sale_id TEXT REFERENCES pos_sale(id),
        response_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS pos_z_report (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        session_id TEXT NOT NULL UNIQUE REFERENCES pos_session(id),
        gross_sales REAL NOT NULL,
        refunds REAL NOT NULL,
        cash_sales REAL NOT NULL,
        card_sales REAL NOT NULL,
        other_sales REAL NOT NULL,
        expected_cash REAL NOT NULL,
        counted_cash REAL NOT NULL,
        variance REAL NOT NULL,
        fiscal_doc_id TEXT REFERENCES fiscal_doc(id),
        created_at TEXT NOT NULL,
        created_by TEXT
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS pos_z_report;
      DROP TABLE IF EXISTS pos_sync_command;
      DROP TABLE IF EXISTS pos_sale_line;
      DROP INDEX IF EXISTS idx_pos_sale_session_state;
      DROP INDEX IF EXISTS idx_pos_sale_company_client;
      DROP TABLE IF EXISTS pos_sale;
      DROP INDEX IF EXISTS idx_pos_session_company_state;
      DROP TABLE IF EXISTS pos_session;
      DROP INDEX IF EXISTS idx_pos_terminal_company_code;
      DROP TABLE IF EXISTS pos_terminal_profile;
    `);
  },
};
