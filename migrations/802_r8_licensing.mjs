// R8.2 Tenancy, Editions, Licensing & Entitlements Schema.
'use strict';

export const migration = {
  id: '802_r8_licensing',
  dependsOn: ['801_r8_consolidation'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_tenant (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        edition    TEXT NOT NULL CHECK(edition IN ('standard', 'enterprise', 'saas')),
        active     INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_license (
        id          TEXT PRIMARY KEY,
        company_id  TEXT NOT NULL REFERENCES companies(company_id),
        license_key TEXT NOT NULL,
        edition     TEXT NOT NULL,
        modules     TEXT NOT NULL,
        seats       INTEGER NOT NULL CHECK(seats > 0),
        expiry_date TEXT NOT NULL,
        signature   TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        UNIQUE(company_id)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_license;
      DROP TABLE IF EXISTS shop_tenant;
    `);
  }
};
