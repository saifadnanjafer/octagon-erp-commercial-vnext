// R8.4 Integration Hub Schema.
'use strict';

export const migration = {
  id: '804_r8_integration',
  dependsOn: ['803_r8_sso'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_api_key (
        id          TEXT PRIMARY KEY,
        company_id  TEXT NOT NULL REFERENCES companies(company_id),
        key_name    TEXT NOT NULL,
        secret_hash TEXT NOT NULL,
        scopes      TEXT NOT NULL,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL,
        expires_at  TEXT
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_webhook_subscription (
        id           TEXT PRIMARY KEY,
        company_id   TEXT NOT NULL REFERENCES companies(company_id),
        event_type   TEXT NOT NULL,
        target_url   TEXT NOT NULL,
        secret_token TEXT,
        active       INTEGER NOT NULL DEFAULT 1,
        created_at   TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_credential_vault (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        key_name         TEXT NOT NULL,
        encrypted_secret TEXT NOT NULL,
        iv               TEXT NOT NULL,
        created_at       TEXT NOT NULL,
        UNIQUE(company_id, key_name)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_credential_vault;
      DROP TABLE IF EXISTS shop_webhook_subscription;
      DROP TABLE IF EXISTS shop_api_key;
    `);
  }
};
