// clean-room; R3.1 product master extension and merchandising references.
'use strict';

import { rebuildProductMasterForR3Rollback } from '../vnext/server/db/sqlite-rebuild.mjs';

export const migration = {
  id: '610_r3_product_pricing_core',
  dependsOn: ['609_r2_localization_framework'],
  up(db) {
    const columns = new Set(db.prepare('PRAGMA table_info(product_master)').all().map((row) => row.name));
    const additions = [
      ['category_id', 'TEXT'], ['product_type', "TEXT NOT NULL DEFAULT 'goods'"],
      ['base_uom_id', 'TEXT'], ['stockable', 'INTEGER NOT NULL DEFAULT 1'],
      ['cost_method', "TEXT NOT NULL DEFAULT 'average'"], ['valuation_category', "TEXT NOT NULL DEFAULT 'default'"],
      ['barcode', 'TEXT'], ['variant_mode', "TEXT NOT NULL DEFAULT 'none'"],
    ];
    for (const [name, definition] of additions) if (!columns.has(name)) db.exec(`ALTER TABLE product_master ADD COLUMN ${name} ${definition}`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS product_category (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), parent_id TEXT REFERENCES product_category(id),
        code TEXT NOT NULL, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_category_code ON product_category(company_id, code);
      CREATE TABLE IF NOT EXISTS uom_category (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), name TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS uom (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), category_id TEXT NOT NULL REFERENCES uom_category(id),
        name TEXT NOT NULL, symbol TEXT NOT NULL, factor REAL NOT NULL CHECK(factor > 0), rounding REAL NOT NULL DEFAULT 0.000001, active INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_uom_symbol ON uom(company_id, category_id, symbol);
      CREATE TABLE IF NOT EXISTS product_barcode (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), product_id TEXT NOT NULL REFERENCES product_master(id),
        barcode TEXT NOT NULL, barcode_type TEXT NOT NULL DEFAULT 'internal', uom_id TEXT REFERENCES uom(id), active INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_barcode_scope ON product_barcode(company_id, barcode);
      CREATE TABLE IF NOT EXISTS product_attribute (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), name TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE TABLE IF NOT EXISTS product_attribute_value (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), attribute_id TEXT NOT NULL REFERENCES product_attribute(id) ON DELETE CASCADE,
        value TEXT NOT NULL, sequence INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_attr_value ON product_attribute_value(company_id, attribute_id, value);
      CREATE TABLE IF NOT EXISTS product_variant (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), template_id TEXT NOT NULL REFERENCES product_master(id),
        code TEXT NOT NULL, name TEXT NOT NULL, barcode TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_code ON product_variant(company_id, code);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_variant_barcode ON product_variant(company_id, barcode) WHERE barcode IS NOT NULL;
      CREATE TABLE IF NOT EXISTS product_variant_value (
        variant_id TEXT NOT NULL REFERENCES product_variant(id) ON DELETE CASCADE, value_id TEXT NOT NULL REFERENCES product_attribute_value(id),
        company_id TEXT NOT NULL REFERENCES companies(company_id), PRIMARY KEY(variant_id, value_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS product_partner_reference (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), product_id TEXT NOT NULL REFERENCES product_master(id),
        partner_id TEXT NOT NULL REFERENCES partner_master(id), partner_code TEXT NOT NULL, partner_name TEXT, lead_time_days INTEGER NOT NULL DEFAULT 0,
        min_qty REAL NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_partner_ref ON product_partner_reference(company_id, partner_id, partner_code);
      CREATE INDEX IF NOT EXISTS idx_product_master_category ON product_master(company_id, category_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_product_master_barcode ON product_master(company_id, barcode) WHERE barcode IS NOT NULL;
    `);
  },
  down(db) {
    db.exec(`DROP TABLE IF EXISTS product_partner_reference; DROP TABLE IF EXISTS product_variant_value; DROP TABLE IF EXISTS product_variant; DROP TABLE IF EXISTS product_attribute_value; DROP TABLE IF EXISTS product_attribute; DROP TABLE IF EXISTS product_barcode; DROP TABLE IF EXISTS uom; DROP TABLE IF EXISTS uom_category; DROP TABLE IF EXISTS product_category;`);
    db.exec('DROP INDEX IF EXISTS idx_product_master_category; DROP INDEX IF EXISTS idx_product_master_barcode;');
    rebuildProductMasterForR3Rollback(db, ['category_id', 'product_type', 'base_uom_id', 'stockable', 'cost_method', 'valuation_category', 'barcode', 'variant_mode']);
  }
};
