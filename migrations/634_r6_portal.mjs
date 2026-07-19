// R6.4 Customer and Vendor Portal Identity Mapping.
'use strict';

export const migration = {
  id: '634_r6_portal',
  dependsOn: ['633_r6_loyalty'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS portal_user_link (
        id          TEXT PRIMARY KEY,
        company_id  TEXT NOT NULL REFERENCES companies(company_id),
        user_id     TEXT NOT NULL,
        partner_id  TEXT NOT NULL REFERENCES partner_master(id),
        created_at  TEXT NOT NULL,
        UNIQUE(company_id, user_id)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS portal_user_link;
    `);
  }
};
