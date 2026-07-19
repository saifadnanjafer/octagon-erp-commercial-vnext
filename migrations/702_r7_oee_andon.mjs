// R7.2 OEE, Downtime & Andon Call Schema.
'use strict';

export const migration = {
  id: '702_r7_oee_andon',
  dependsOn: ['701_r7_shop_floor'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_andon_call (
        id                  TEXT PRIMARY KEY,
        company_id          TEXT NOT NULL REFERENCES companies(company_id),
        work_order_id       TEXT REFERENCES mrp_work_order(id) ON DELETE SET NULL,
        operator_id         TEXT REFERENCES shop_operator(id) ON DELETE SET NULL,
        reason              TEXT NOT NULL,
        description         TEXT,
        state               TEXT NOT NULL DEFAULT 'raised' CHECK(state IN ('raised', 'acknowledged', 'resolved')),
        raised_at           TEXT NOT NULL,
        acknowledged_at     TEXT,
        resolved_at         TEXT,
        resolved_by         TEXT,
        response_time_sec   INTEGER,
        resolution_time_sec INTEGER
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_downtime (
        id           TEXT PRIMARY KEY,
        company_id   TEXT NOT NULL REFERENCES companies(company_id),
        work_center_id TEXT NOT NULL,
        reason       TEXT NOT NULL,
        type         TEXT NOT NULL CHECK(type IN ('planned', 'unplanned')),
        start_at     TEXT NOT NULL,
        end_at       TEXT,
        duration_sec INTEGER
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_shop_andon_work_order ON shop_andon_call(work_order_id);
      CREATE INDEX IF NOT EXISTS idx_shop_downtime_wc ON shop_downtime(work_center_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_downtime;
      DROP TABLE IF EXISTS shop_andon_call;
    `);
  }
};
