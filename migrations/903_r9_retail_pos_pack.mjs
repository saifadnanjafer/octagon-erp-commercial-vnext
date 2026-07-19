// R9.3 Retail/POS vertical pack schema.
'use strict';

export const migration = {
  id: '903_r9_retail_pos_pack',
  dependsOn: ['902_r9_workshop_pack'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_retail_store (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        store_code         TEXT NOT NULL,
        name               TEXT NOT NULL,
        timezone           TEXT NOT NULL DEFAULT 'Asia/Baghdad',
        currency           TEXT NOT NULL DEFAULT 'IQD',
        active             INTEGER NOT NULL DEFAULT 1,
        created_at         TEXT NOT NULL,
        created_by         TEXT NOT NULL,
        UNIQUE(company_id, store_code)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_retail_shift (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        store_id           TEXT NOT NULL REFERENCES shop_retail_store(id),
        shift_number       TEXT NOT NULL,
        state              TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'closed')),
        opened_by          TEXT NOT NULL,
        opened_at          TEXT NOT NULL,
        opening_float      REAL NOT NULL DEFAULT 0 CHECK(opening_float >= 0),
        closed_by          TEXT,
        closed_at          TEXT,
        closing_total      REAL CHECK(closing_total >= 0),
        UNIQUE(company_id, store_id, shift_number)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_retail_barcode (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        product_id         TEXT NOT NULL,
        barcode            TEXT NOT NULL,
        barcode_type       TEXT NOT NULL DEFAULT 'ean13' CHECK(barcode_type IN ('ean8', 'ean13', 'upc', 'qr', 'internal')),
        active             INTEGER NOT NULL DEFAULT 1,
        created_at         TEXT NOT NULL,
        created_by         TEXT NOT NULL,
        UNIQUE(company_id, barcode)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_retail_scan_event (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        store_id           TEXT NOT NULL REFERENCES shop_retail_store(id),
        shift_id           TEXT NOT NULL REFERENCES shop_retail_shift(id),
        barcode_id         TEXT NOT NULL REFERENCES shop_retail_barcode(id),
        action             TEXT NOT NULL CHECK(action IN ('sale', 'return', 'count')),
        quantity           REAL NOT NULL CHECK(quantity > 0),
        idempotency_key    TEXT NOT NULL,
        scanned_by         TEXT NOT NULL,
        created_at         TEXT NOT NULL,
        UNIQUE(company_id, idempotency_key)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_retail_shift_open ON shop_retail_shift(company_id, store_id, state);
      CREATE INDEX IF NOT EXISTS idx_retail_barcode_lookup ON shop_retail_barcode(company_id, barcode, active);
      CREATE INDEX IF NOT EXISTS idx_retail_scan_shift ON shop_retail_scan_event(company_id, shift_id, created_at);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_retail_scan_shift;
      DROP INDEX IF EXISTS idx_retail_barcode_lookup;
      DROP INDEX IF EXISTS idx_retail_shift_open;
      DROP TABLE IF EXISTS shop_retail_scan_event;
      DROP TABLE IF EXISTS shop_retail_barcode;
      DROP TABLE IF EXISTS shop_retail_shift;
      DROP TABLE IF EXISTS shop_retail_store;
    `);
  }
};
