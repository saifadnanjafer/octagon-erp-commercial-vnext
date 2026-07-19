// R7.3 Production Planning & Capacity (MPS-Lite) Schema.
'use strict';

export const migration = {
  id: '703_r7_mps',
  dependsOn: ['702_r7_oee_andon'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_forecast (
        id           TEXT PRIMARY KEY,
        company_id   TEXT NOT NULL REFERENCES companies(company_id),
        product_id   TEXT NOT NULL REFERENCES product_master(id),
        qty          REAL NOT NULL CHECK(qty > 0),
        demand_date  TEXT NOT NULL,
        created_at   TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_mps_proposal (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        product_id         TEXT NOT NULL REFERENCES product_master(id),
        source_type        TEXT NOT NULL CHECK(source_type IN ('sales_order', 'forecast', 'combined')),
        source_ref         TEXT,
        qty                REAL NOT NULL CHECK(qty > 0),
        target_date        TEXT NOT NULL,
        lead_time_days     INTEGER NOT NULL DEFAULT 0,
        planned_start_date TEXT NOT NULL,
        planned_end_date   TEXT NOT NULL,
        proposal_type      TEXT NOT NULL CHECK(proposal_type IN ('work_order', 'purchase_order')),
        state              TEXT NOT NULL DEFAULT 'proposed' CHECK(state IN ('proposed', 'converted', 'cancelled')),
        converted_ref      TEXT,
        created_at         TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_shop_forecast_product ON shop_forecast(company_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_shop_mps_proposal_state ON shop_mps_proposal(company_id, state);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_mps_proposal;
      DROP TABLE IF EXISTS shop_forecast;
    `);
  }
};
