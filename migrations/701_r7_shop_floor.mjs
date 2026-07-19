// R7.1 Shop-Floor Execution Terminals Schema.
'use strict';

export const migration = {
  id: '701_r7_shop_floor',
  dependsOn: ['637_r6_campaign'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_operator (
        id         TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        name       TEXT NOT NULL,
        badge_pin  TEXT NOT NULL,
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        UNIQUE(company_id, badge_pin)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_operator_log (
        id            TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        work_order_id TEXT NOT NULL REFERENCES mrp_work_order(id),
        operator_id   TEXT NOT NULL REFERENCES shop_operator(id),
        action        TEXT NOT NULL CHECK(action IN ('start', 'pause', 'finish')),
        qty_produced  REAL NOT NULL DEFAULT 0,
        qty_scrapped  REAL NOT NULL DEFAULT 0,
        logged_at     TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_material_issue (
        id            TEXT PRIMARY KEY,
        company_id    TEXT NOT NULL REFERENCES companies(company_id),
        work_order_id TEXT NOT NULL REFERENCES mrp_work_order(id),
        product_id    TEXT NOT NULL REFERENCES product_master(id),
        qty           REAL NOT NULL CHECK(qty > 0),
        issued_at     TEXT NOT NULL,
        issued_by     TEXT NOT NULL
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_material_issue;
      DROP TABLE IF EXISTS shop_operator_log;
      DROP TABLE IF EXISTS shop_operator;
    `);
  }
};
