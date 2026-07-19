// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

export const migration = {
  id: '603_r2_tax_engine',
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS tax_group (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(company_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS tax (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        tax_group_id  TEXT REFERENCES tax_group(id),
        amount_type   TEXT NOT NULL CHECK (amount_type IN ('percent', 'fixed', 'group')),
        amount        REAL NOT NULL DEFAULT 0.0,
        price_include INTEGER NOT NULL DEFAULT 0 CHECK (price_include IN (0, 1)),
        type_tax_use  TEXT NOT NULL CHECK (type_tax_use IN ('sale', 'purchase', 'none')),
        active        INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
      ) STRICT;

      CREATE TABLE IF NOT EXISTS tax_repartition_line (
        id              TEXT PRIMARY KEY,
        tax_id          TEXT NOT NULL REFERENCES tax(id) ON DELETE CASCADE,
        repartition_type TEXT NOT NULL CHECK (repartition_type IN ('base', 'tax')),
        factor_percent  REAL NOT NULL DEFAULT 100.0,
        account_id      TEXT REFERENCES account(id),
        tag_ids         TEXT, -- JSON list of report grid tags e.g. ["VAT_15_tax"]
        sign            INTEGER NOT NULL CHECK (sign IN (-1, 1)) DEFAULT 1
      ) STRICT;

      CREATE TABLE IF NOT EXISTS fiscal_position (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        company_id TEXT NOT NULL REFERENCES companies(company_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS fiscal_position_tax_map (
        id                 TEXT PRIMARY KEY,
        fiscal_position_id TEXT NOT NULL REFERENCES fiscal_position(id) ON DELETE CASCADE,
        tax_src_id         TEXT NOT NULL REFERENCES tax(id),
        tax_dest_id        TEXT REFERENCES tax(id) -- Null means exempt
      ) STRICT;

      CREATE TABLE IF NOT EXISTS fiscal_position_account_map (
        id                 TEXT PRIMARY KEY,
        fiscal_position_id TEXT NOT NULL REFERENCES fiscal_position(id) ON DELETE CASCADE,
        account_src_id     TEXT NOT NULL REFERENCES account(id),
        account_dest_id    TEXT NOT NULL REFERENCES account(id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS withholding_category (
        id                   TEXT PRIMARY KEY,
        name                 TEXT NOT NULL,
        company_id           TEXT NOT NULL REFERENCES companies(company_id),
        rate                 REAL NOT NULL CHECK (rate >= 0.0 AND rate <= 100.0),
        threshold            REAL NOT NULL DEFAULT 0.0,
        cumulative_threshold REAL NOT NULL DEFAULT 0.0,
        cumulative_window    TEXT NOT NULL CHECK (cumulative_window IN ('monthly', 'yearly', 'none')) DEFAULT 'none'
      ) STRICT;

      CREATE TABLE IF NOT EXISTS withholding_certificate (
        id                      TEXT PRIMARY KEY,
        company_id              TEXT NOT NULL REFERENCES companies(company_id),
        partner_id              TEXT NOT NULL,
        withholding_category_id TEXT NOT NULL REFERENCES withholding_category(id),
        base_amount             REAL NOT NULL,
        tax_amount              REAL NOT NULL,
        doc_date                TEXT NOT NULL,
        reference_doc_id        TEXT
      ) STRICT;
    `);

    // Add tax_tag_ids column to gl_line safely if it does not already exist
    const pragma = db.prepare("PRAGMA table_info(gl_line)").all();
    const hasTaxTagIds = pragma.some(c => c.name === 'tax_tag_ids');
    if (!hasTaxTagIds) {
      db.exec('ALTER TABLE gl_line ADD COLUMN tax_tag_ids TEXT;');
    }
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS withholding_certificate;
      DROP TABLE IF EXISTS withholding_category;
      DROP TABLE IF EXISTS fiscal_position_account_map;
      DROP TABLE IF EXISTS fiscal_position_tax_map;
      DROP TABLE IF EXISTS fiscal_position;
      DROP TABLE IF EXISTS tax_repartition_line;
      DROP TABLE IF EXISTS tax;
      DROP TABLE IF EXISTS tax_group;
    `);
  }
};
