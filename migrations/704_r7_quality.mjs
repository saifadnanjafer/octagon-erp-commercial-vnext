// R7.4 Quality: Inspections, NCR & CAPA Schema.
'use strict';

export const migration = {
  id: '704_r7_quality',
  dependsOn: ['703_r7_mps'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_quality_template (
        id         TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        name       TEXT NOT NULL,
        product_id TEXT REFERENCES product_master(id) ON DELETE CASCADE,
        parameters TEXT NOT NULL,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_quality_inspection (
        id              TEXT PRIMARY KEY,
        company_id      TEXT NOT NULL REFERENCES companies(company_id),
        template_id     TEXT REFERENCES shop_quality_template(id) ON DELETE SET NULL,
        product_id      TEXT NOT NULL REFERENCES product_master(id),
        source_type     TEXT NOT NULL CHECK(source_type IN ('receipt', 'work_order', 'delivery')),
        source_ref      TEXT NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'passed', 'failed')),
        measured_values TEXT,
        inspected_by    TEXT,
        inspected_at    TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_ncr (
        id                 TEXT PRIMARY KEY,
        company_id         TEXT NOT NULL REFERENCES companies(company_id),
        inspection_id      TEXT REFERENCES shop_quality_inspection(id) ON DELETE SET NULL,
        description        TEXT NOT NULL,
        containment_action TEXT,
        root_cause         TEXT,
        corrective_action  TEXT,
        verification_notes TEXT,
        state              TEXT NOT NULL DEFAULT 'open' CHECK(state IN ('open', 'contained', 'verified')),
        created_at         TEXT NOT NULL,
        resolved_at        TEXT
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_shop_quality_inspection_product ON shop_quality_inspection(company_id, product_id);
      CREATE INDEX IF NOT EXISTS idx_shop_ncr_inspection ON shop_ncr(company_id, inspection_id);
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_ncr;
      DROP TABLE IF EXISTS shop_quality_inspection;
      DROP TABLE IF EXISTS shop_quality_template;
    `);
  }
};
