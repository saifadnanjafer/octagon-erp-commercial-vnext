// R9.2 Workshop & advertising-production schema.
'use strict';

export const migration = {
  id: '902_r9_workshop_pack',
  dependsOn: ['901_r9_pack_sdk'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_workshop_job (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        job_number       TEXT NOT NULL,
        customer_id      TEXT,
        title            TEXT NOT NULL,
        description      TEXT,
        state            TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft', 'design', 'proofing', 'approved', 'production', 'quality_check', 'completed', 'delivered', 'cancelled')),
        job_type         TEXT NOT NULL DEFAULT 'print' CHECK(job_type IN ('print', 'signage', 'packaging', 'digital', 'custom')),
        quantity         REAL NOT NULL DEFAULT 1 CHECK(quantity > 0),
        unit_price       REAL NOT NULL DEFAULT 0 CHECK(unit_price >= 0),
        total_price      REAL NOT NULL DEFAULT 0 CHECK(total_price >= 0),
        material_cost    REAL NOT NULL DEFAULT 0 CHECK(material_cost >= 0),
        labor_cost       REAL NOT NULL DEFAULT 0 CHECK(labor_cost >= 0),
        overhead_cost    REAL NOT NULL DEFAULT 0 CHECK(overhead_cost >= 0),
        profit_margin    REAL NOT NULL DEFAULT 0,
        assigned_to      TEXT,
        priority         TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
        due_date         TEXT,
        completed_at     TEXT,
        delivered_at     TEXT,
        sales_order_id   TEXT,
        idempotency_key  TEXT,
        created_at       TEXT NOT NULL,
        created_by       TEXT NOT NULL,
        UNIQUE(company_id, job_number)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_workshop_job_material (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        job_id           TEXT NOT NULL REFERENCES shop_workshop_job(id),
        product_id       TEXT,
        name             TEXT NOT NULL,
        quantity         REAL NOT NULL DEFAULT 1 CHECK(quantity > 0),
        unit_cost        REAL NOT NULL DEFAULT 0 CHECK(unit_cost >= 0),
        total_cost       REAL NOT NULL DEFAULT 0 CHECK(total_cost >= 0),
        issued           INTEGER NOT NULL DEFAULT 0,
        issued_at        TEXT,
        created_at       TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_workshop_design_proof (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        job_id           TEXT NOT NULL REFERENCES shop_workshop_job(id),
        version          INTEGER NOT NULL DEFAULT 1,
        file_name        TEXT,
        file_hash        TEXT,
        status           TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'revision_requested')),
        reviewer_id      TEXT,
        reviewed_at      TEXT,
        notes            TEXT,
        created_at       TEXT NOT NULL,
        created_by       TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_workshop_pricing_template (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        name             TEXT NOT NULL,
        job_type         TEXT NOT NULL,
        base_price       REAL NOT NULL DEFAULT 0 CHECK(base_price >= 0),
        price_per_unit   REAL NOT NULL DEFAULT 0 CHECK(price_per_unit >= 0),
        material_markup  REAL NOT NULL DEFAULT 0,
        labor_rate       REAL NOT NULL DEFAULT 0 CHECK(labor_rate >= 0),
        overhead_rate    REAL NOT NULL DEFAULT 0 CHECK(overhead_rate >= 0),
        min_quantity     REAL NOT NULL DEFAULT 1 CHECK(min_quantity > 0),
        active           INTEGER NOT NULL DEFAULT 1,
        created_at       TEXT NOT NULL,
        UNIQUE(company_id, name)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_workshop_pricing_template;
      DROP TABLE IF EXISTS shop_workshop_design_proof;
      DROP TABLE IF EXISTS shop_workshop_job_material;
      DROP TABLE IF EXISTS shop_workshop_job;
    `);
  }
};
