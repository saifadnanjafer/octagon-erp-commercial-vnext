// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.3 (proprietary self, not copied)
// R9.3 Retail/POS governed transaction documents (ticket, line, tax, payment).
// Depends on the 903 store/shift/barcode/scan schema and the R2 finance/stock baseline.
'use strict';

export const migration = {
  id: '904_r9_retail_pos_transactions',
  dependsOn: ['903_r9_retail_pos_pack'],
  up(db) {
    db.exec(`
      -- Optional default-account overrides on the store record.
      ALTER TABLE shop_retail_store ADD COLUMN default_cash_account_id TEXT;
      ALTER TABLE shop_retail_store ADD COLUMN default_card_account_id TEXT;
      ALTER TABLE shop_retail_store ADD COLUMN default_bank_account_id TEXT;
      ALTER TABLE shop_retail_store ADD COLUMN default_income_account_id TEXT;
      ALTER TABLE shop_retail_store ADD COLUMN default_cogs_account_id TEXT;
      ALTER TABLE shop_retail_store ADD COLUMN default_stock_account_id TEXT;
      ALTER TABLE shop_retail_store ADD COLUMN default_tax_account_id TEXT;
      ALTER TABLE shop_retail_store ADD COLUMN default_ar_account_id TEXT;

      CREATE TABLE IF NOT EXISTS shop_retail_ticket (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        store_id           TEXT NOT NULL REFERENCES shop_retail_store(id),
        shift_id           TEXT NOT NULL REFERENCES shop_retail_shift(id),
        ticket_number      TEXT NOT NULL,
        kind               TEXT NOT NULL DEFAULT 'sale' CHECK(kind IN ('sale', 'return', 'refund')),
        state              TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft', 'posted', 'reversed', 'cancelled')),
        partner_id         TEXT,
        currency           TEXT NOT NULL DEFAULT 'IQD',
        subtotal           REAL NOT NULL DEFAULT 0 CHECK(subtotal >= 0),
        discount_total     REAL NOT NULL DEFAULT 0 CHECK(discount_total >= 0),
        tax_total          REAL NOT NULL DEFAULT 0 CHECK(tax_total >= 0),
        total              REAL NOT NULL DEFAULT 0 CHECK(total >= 0),
        payment_method     TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'bank', 'reference', 'ewallet')),
        payment_reference  TEXT,
        fiscal_doc_id      TEXT,
        stock_move_id      TEXT,
        reversal_of_id     TEXT REFERENCES shop_retail_ticket(id),
        reversal_ticket_id TEXT REFERENCES shop_retail_ticket(id),
        idempotency_key    TEXT NOT NULL,
        created_at         TEXT NOT NULL,
        created_by         TEXT NOT NULL,
        UNIQUE(company_id, ticket_number)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_retail_ticket_line (
        id                 TEXT PRIMARY KEY,
        ticket_id          TEXT NOT NULL REFERENCES shop_retail_ticket(id),
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        product_id         TEXT NOT NULL,
        barcode_id         TEXT REFERENCES shop_retail_barcode(id),
        quantity           REAL NOT NULL CHECK(quantity > 0),
        unit_price         REAL NOT NULL CHECK(unit_price >= 0),
        discount_amount    REAL NOT NULL DEFAULT 0 CHECK(discount_amount >= 0),
        discount_percent   REAL NOT NULL DEFAULT 0 CHECK(discount_percent >= 0),
        tax_id             TEXT,
        tax_amount         REAL NOT NULL DEFAULT 0,
        line_total         REAL NOT NULL DEFAULT 0,
        base_amount        REAL NOT NULL DEFAULT 0,
        income_account_id  TEXT NOT NULL,
        cogs_account_id    TEXT NOT NULL,
        stock_move_id      TEXT,
        created_at         TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_retail_ticket_tax (
        id                 TEXT PRIMARY KEY,
        ticket_id          TEXT NOT NULL REFERENCES shop_retail_ticket(id),
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        tax_id             TEXT NOT NULL,
        base_amount        REAL NOT NULL DEFAULT 0,
        tax_amount         REAL NOT NULL DEFAULT 0,
        created_at         TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_retail_ticket_payment (
        id                 TEXT PRIMARY KEY,
        ticket_id          TEXT NOT NULL REFERENCES shop_retail_ticket(id),
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        payment_method     TEXT NOT NULL CHECK(payment_method IN ('cash', 'card', 'bank', 'reference', 'ewallet')),
        amount             REAL NOT NULL CHECK(amount >= 0),
        reference          TEXT,
        payment_id         TEXT,
        created_at         TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_retail_ticket_lookup ON shop_retail_ticket(company_id, ticket_number);
      CREATE INDEX IF NOT EXISTS idx_retail_ticket_shift ON shop_retail_ticket(company_id, store_id, shift_id, state);
      CREATE INDEX IF NOT EXISTS idx_retail_ticket_reversal ON shop_retail_ticket(reversal_of_id, reversal_ticket_id);
      CREATE INDEX IF NOT EXISTS idx_retail_ticket_idempotency ON shop_retail_ticket(company_id, idempotency_key);
      CREATE INDEX IF NOT EXISTS idx_retail_ticket_line_ticket ON shop_retail_ticket_line(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_retail_ticket_tax_ticket ON shop_retail_ticket_tax(ticket_id);
      CREATE INDEX IF NOT EXISTS idx_retail_ticket_payment_ticket ON shop_retail_ticket_payment(ticket_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_retail_ticket_payment_ticket;
      DROP INDEX IF EXISTS idx_retail_ticket_tax_ticket;
      DROP INDEX IF EXISTS idx_retail_ticket_line_ticket;
      DROP INDEX IF EXISTS idx_retail_ticket_idempotency;
      DROP INDEX IF EXISTS idx_retail_ticket_reversal;
      DROP INDEX IF EXISTS idx_retail_ticket_shift;
      DROP INDEX IF EXISTS idx_retail_ticket_lookup;

      DROP TABLE IF EXISTS shop_retail_ticket_payment;
      DROP TABLE IF EXISTS shop_retail_ticket_tax;
      DROP TABLE IF EXISTS shop_retail_ticket_line;
      DROP TABLE IF EXISTS shop_retail_ticket;

      ALTER TABLE shop_retail_store DROP COLUMN default_cash_account_id;
      ALTER TABLE shop_retail_store DROP COLUMN default_card_account_id;
      ALTER TABLE shop_retail_store DROP COLUMN default_bank_account_id;
      ALTER TABLE shop_retail_store DROP COLUMN default_income_account_id;
      ALTER TABLE shop_retail_store DROP COLUMN default_cogs_account_id;
      ALTER TABLE shop_retail_store DROP COLUMN default_stock_account_id;
      ALTER TABLE shop_retail_store DROP COLUMN default_tax_account_id;
      ALTER TABLE shop_retail_store DROP COLUMN default_ar_account_id;
    `);
  }
};
