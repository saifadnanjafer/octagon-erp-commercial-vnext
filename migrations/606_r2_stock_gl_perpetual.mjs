// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

export const migration = {
  id: '606_r2_stock_gl_perpetual',
  dependsOn: ['605_r2_stock_ledger'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_valuation_category_policy (
        company_id            TEXT NOT NULL REFERENCES companies(company_id),
        category              TEXT NOT NULL,
        valuation_account_id  TEXT NOT NULL REFERENCES account(id),
        cogs_account_id       TEXT NOT NULL REFERENCES account(id),
        adjustment_account_id TEXT NOT NULL REFERENCES account(id),
        accrual_account_id    TEXT NOT NULL REFERENCES account(id),
        PRIMARY KEY (company_id, category)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS stock_inventory_adjustment (
        id                TEXT PRIMARY KEY,
        company_id        TEXT NOT NULL REFERENCES companies(company_id),
        warehouse_id      TEXT NOT NULL REFERENCES warehouses(warehouse_id),
        location_id       TEXT NOT NULL REFERENCES locations(location_id),
        product_id        TEXT NOT NULL,
        counted_qty       REAL NOT NULL CHECK (counted_qty >= 0.0),
        counted_rate      REAL NOT NULL CHECK (counted_rate >= 0.0),
        reason            TEXT NOT NULL,
        authorized_by     TEXT NOT NULL,
        authorization_ref TEXT NOT NULL,
        posting_date      TEXT NOT NULL,
        state             TEXT NOT NULL CHECK (state IN ('draft', 'posted', 'cancelled')) DEFAULT 'draft',
        stock_move_id     TEXT UNIQUE REFERENCES stock_move(id),
        created_at        TEXT NOT NULL,
        updated_at        TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_stock_inventory_adjustment_scope
        ON stock_inventory_adjustment(company_id, warehouse_id, location_id, product_id, posting_date);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_inventory_adjustment_auth
        ON stock_inventory_adjustment(company_id, authorization_ref);
    `);

    const columns = new Set(db.prepare('PRAGMA table_info(stock_move)').all().map((row) => row.name));
    const additions = [
      ['fiscal_doc_id', 'TEXT REFERENCES fiscal_doc(id)'],
      ['warehouse_id', 'TEXT REFERENCES warehouses(warehouse_id)'],
      ['currency', "TEXT NOT NULL DEFAULT 'IQD'"],
      ['dims', 'TEXT'],
      ['batch_number', 'TEXT'],
      ['serial_number', 'TEXT'],
    ];
    for (const [name, definition] of additions) {
      if (!columns.has(name)) db.exec(`ALTER TABLE stock_move ADD COLUMN ${name} ${definition}`);
    }
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_move_fiscal_doc
        ON stock_move(fiscal_doc_id) WHERE fiscal_doc_id IS NOT NULL;
    `);
  },
  down(db) {
    // SQLite doesn't support dropping columns easily, but we can drop the table.
    db.exec(`
      DROP INDEX IF EXISTS idx_stock_move_fiscal_doc;
      DROP INDEX IF EXISTS idx_stock_inventory_adjustment_scope;
      DROP INDEX IF EXISTS idx_stock_inventory_adjustment_auth;
      DROP TABLE IF EXISTS stock_inventory_adjustment;
      DROP TABLE IF EXISTS stock_valuation_category_policy;
    `);
  }
};
