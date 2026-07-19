// clean-room; R3.1 deterministic pricing and promotion rules.
'use strict';

export const migration = {
  id: '611_r3_pricing_rules',
  dependsOn: ['610_r3_product_pricing_core'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS price_list (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), name TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'IQD',
        valid_from TEXT, valid_to TEXT, priority INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS price_list_item (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), price_list_id TEXT NOT NULL REFERENCES price_list(id) ON DELETE CASCADE,
        product_id TEXT NOT NULL REFERENCES product_master(id), variant_id TEXT REFERENCES product_variant(id), category_id TEXT REFERENCES product_category(id),
        partner_id TEXT REFERENCES partner_master(id), min_qty REAL NOT NULL DEFAULT 1, uom_id TEXT REFERENCES uom(id),
        fixed_price REAL, percent_discount REAL, currency TEXT NOT NULL DEFAULT 'IQD', valid_from TEXT, valid_to TEXT,
        sequence INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS pricing_rule (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), name TEXT NOT NULL, rule_type TEXT NOT NULL,
        product_id TEXT REFERENCES product_master(id), variant_id TEXT REFERENCES product_variant(id), category_id TEXT REFERENCES product_category(id),
        partner_id TEXT REFERENCES partner_master(id), price_list_id TEXT REFERENCES price_list(id), min_qty REAL NOT NULL DEFAULT 1,
        fixed_price REAL, percent_discount REAL, currency TEXT NOT NULL DEFAULT 'IQD', valid_from TEXT, valid_to TEXT,
        priority INTEGER NOT NULL DEFAULT 10, sequence INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS promotion (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), name TEXT NOT NULL,
        promotion_type TEXT NOT NULL CHECK(promotion_type IN ('percent','fixed','buy_x_get_y','coupon')), product_id TEXT REFERENCES product_master(id),
        min_qty REAL NOT NULL DEFAULT 1, reward_qty REAL NOT NULL DEFAULT 0, reward_product_id TEXT REFERENCES product_master(id),
        amount REAL NOT NULL DEFAULT 0, coupon_code TEXT, valid_from TEXT, valid_to TEXT, priority INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_promotion_coupon ON promotion(company_id, coupon_code) WHERE coupon_code IS NOT NULL;
      CREATE TABLE IF NOT EXISTS coupon (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), code TEXT NOT NULL, promotion_id TEXT NOT NULL REFERENCES promotion(id),
        usage_limit INTEGER, used_count INTEGER NOT NULL DEFAULT 0, valid_from TEXT, valid_to TEXT, active INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_code ON coupon(company_id, code);
    `);
  },
  down(db) { db.exec('DROP TABLE IF EXISTS coupon; DROP TABLE IF EXISTS promotion; DROP TABLE IF EXISTS pricing_rule; DROP TABLE IF EXISTS price_list_item; DROP TABLE IF EXISTS price_list;'); }
};
