// R8.1 Multi-Company Operations & Consolidation Schema.
'use strict';

export const migration = {
  id: '801_r8_consolidation',
  dependsOn: ['705_r7_maintenance'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_intercompany_rule (
        id                TEXT PRIMARY KEY,
        company_id        TEXT NOT NULL REFERENCES companies(company_id),
        partner_id        TEXT NOT NULL REFERENCES partner_master(id),
        target_company_id TEXT NOT NULL REFERENCES companies(company_id),
        target_partner_id TEXT NOT NULL REFERENCES partner_master(id),
        active            INTEGER NOT NULL DEFAULT 1,
        created_at        TEXT NOT NULL,
        UNIQUE(company_id, target_company_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_consolidation_rate (
        id                TEXT PRIMARY KEY,
        company_id        TEXT NOT NULL REFERENCES companies(company_id),
        source_company_id TEXT NOT NULL REFERENCES companies(company_id),
        rate              REAL NOT NULL CHECK(rate > 0),
        effective_date    TEXT NOT NULL,
        created_at        TEXT NOT NULL,
        UNIQUE(company_id, source_company_id, effective_date)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_consolidation_rate;
      DROP TABLE IF EXISTS shop_intercompany_rule;
    `);
  }
};
