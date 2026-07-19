// R7.5 Maintenance & Asset Lifecycle Schema.
'use strict';

export const migration = {
  id: '705_r7_maintenance',
  dependsOn: ['704_r7_quality'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_asset (
        id                  TEXT PRIMARY KEY,
        company_id          TEXT NOT NULL REFERENCES companies(company_id),
        name                TEXT NOT NULL,
        code                TEXT NOT NULL,
        purchase_value      REAL NOT NULL CHECK(purchase_value >= 0),
        salvage_value       REAL NOT NULL DEFAULT 0 CHECK(salvage_value >= 0),
        useful_life_months  INTEGER NOT NULL CHECK(useful_life_months > 0),
        depreciation_method TEXT NOT NULL CHECK(depreciation_method IN ('straight_line', 'double_declining')),
        purchase_date       TEXT NOT NULL,
        warranty_expiry_date TEXT,
        created_at          TEXT NOT NULL,
        UNIQUE(company_id, code)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_asset_depreciation_line (
        id                      TEXT PRIMARY KEY,
        company_id              TEXT NOT NULL REFERENCES companies(company_id),
        asset_id                TEXT NOT NULL REFERENCES shop_asset(id) ON DELETE CASCADE,
        sequence                INTEGER NOT NULL,
        depreciation_date       TEXT NOT NULL,
        amount                  REAL NOT NULL CHECK(amount >= 0),
        cumulative_depreciation REAL NOT NULL CHECK(cumulative_depreciation >= 0),
        book_value              REAL NOT NULL CHECK(book_value >= 0),
        posted_entry_id         TEXT REFERENCES fiscal_doc(id) ON DELETE SET NULL,
        created_at              TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_maintenance_order (
        id             TEXT PRIMARY KEY,
        company_id     TEXT NOT NULL REFERENCES companies(company_id),
        asset_id       TEXT REFERENCES shop_asset(id) ON DELETE SET NULL,
        type           TEXT NOT NULL CHECK(type IN ('preventive', 'corrective')),
        description    TEXT NOT NULL,
        state          TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft', 'scheduled', 'inprogress', 'completed', 'cancelled')),
        scheduled_date TEXT,
        completed_at   TEXT,
        completed_by   TEXT,
        failure_reason TEXT,
        created_at     TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_shop_depr_asset ON shop_asset_depreciation_line(asset_id);
      CREATE INDEX IF NOT EXISTS idx_shop_maint_asset ON shop_maintenance_order(asset_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_maintenance_order;
      DROP TABLE IF EXISTS shop_asset_depreciation_line;
      DROP TABLE IF EXISTS shop_asset;
    `);
  }
};
