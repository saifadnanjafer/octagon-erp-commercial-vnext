// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

export const migration = {
  id: '605_r2_stock_ledger',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS stock_move (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        product_id       TEXT NOT NULL,
        qty              REAL NOT NULL CHECK (qty > 0.0),
        uom              TEXT NOT NULL,
        from_location_id TEXT NOT NULL REFERENCES locations(location_id),
        to_location_id   TEXT NOT NULL REFERENCES locations(location_id),
        state            TEXT NOT NULL CHECK (state IN ('draft', 'confirmed', 'assigned', 'done', 'cancelled')) DEFAULT 'draft',
        posting_date     TEXT NOT NULL,
        voucher_ref      TEXT,
        created_at       TEXT NOT NULL,
        updated_at       TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS stock_ledger_line (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        stock_move_id    TEXT NOT NULL REFERENCES stock_move(id),
        product_id       TEXT NOT NULL,
        location_id      TEXT NOT NULL REFERENCES locations(location_id),
        qty              REAL NOT NULL, -- positive for incoming, negative for outgoing
        valuation_rate   REAL NOT NULL, -- cost per unit
        value            REAL NOT NULL, -- qty * valuation_rate
        batch_number     TEXT,
        serial_number    TEXT,
        posting_date     TEXT NOT NULL,
        created_at       TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_stock_ledger_prod_loc ON stock_ledger_line (product_id, location_id);

      CREATE TABLE IF NOT EXISTS bin (
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        location_id      TEXT NOT NULL REFERENCES locations(location_id),
        product_id       TEXT NOT NULL,
        qty              REAL NOT NULL DEFAULT 0.0,
        value            REAL NOT NULL DEFAULT 0.0,
        PRIMARY KEY (company_id, location_id, product_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS stock_fifo_layer (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        location_id      TEXT NOT NULL REFERENCES locations(location_id),
        product_id       TEXT NOT NULL,
        qty              REAL NOT NULL,
        original_qty     REAL NOT NULL,
        unit_cost        REAL NOT NULL,
        posting_date     TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        stock_ledger_line_id TEXT NOT NULL REFERENCES stock_ledger_line(id)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_stock_fifo_layer_fifo ON stock_fifo_layer (product_id, location_id, posting_date, created_at);

      CREATE TABLE IF NOT EXISTS stock_batch (
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        product_id       TEXT NOT NULL,
        batch_number     TEXT NOT NULL,
        expiry_date      TEXT, -- YYYY-MM-DD
        PRIMARY KEY (company_id, product_id, batch_number)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS stock_serial (
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        product_id       TEXT NOT NULL,
        serial_number    TEXT NOT NULL,
        location_id      TEXT REFERENCES locations(location_id),
        PRIMARY KEY (company_id, product_id, serial_number)
      ) STRICT;

    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS stock_serial;
      DROP TABLE IF EXISTS stock_batch;
      DROP TABLE IF EXISTS stock_fifo_layer;
      DROP TABLE IF EXISTS bin;
      DROP TABLE IF EXISTS stock_ledger_line;
      DROP TABLE IF EXISTS stock_move;
    `);
  }
};
