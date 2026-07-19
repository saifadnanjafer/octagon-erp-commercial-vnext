// R8.3 SSO & Advanced Identity Schema.
'use strict';

export const migration = {
  id: '803_r8_sso',
  dependsOn: ['802_r8_licensing'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_sso_config (
        id                     TEXT PRIMARY KEY,
        company_id             TEXT NOT NULL REFERENCES companies(company_id),
        provider_type          TEXT NOT NULL CHECK(provider_type IN ('oidc', 'saml')),
        client_id              TEXT,
        client_secret          TEXT,
        authorization_endpoint TEXT,
        token_endpoint         TEXT,
        userinfo_endpoint      TEXT,
        active                 INTEGER NOT NULL DEFAULT 1,
        created_at             TEXT NOT NULL,
        UNIQUE(company_id, provider_type)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_user_sso_link (
        id            TEXT PRIMARY KEY,
        user_id       TEXT NOT NULL,
        provider_type TEXT NOT NULL CHECK(provider_type IN ('oidc', 'saml')),
        sso_uid       TEXT NOT NULL,
        created_at    TEXT NOT NULL,
        UNIQUE(provider_type, sso_uid)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_org_security_policy (
        id                  TEXT PRIMARY KEY,
        company_id          TEXT NOT NULL REFERENCES companies(company_id),
        mfa_enforced        INTEGER NOT NULL DEFAULT 0 CHECK(mfa_enforced IN (0, 1)),
        password_min_length INTEGER NOT NULL DEFAULT 8 CHECK(password_min_length >= 6),
        created_at          TEXT NOT NULL,
        UNIQUE(company_id)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_org_security_policy;
      DROP TABLE IF EXISTS shop_user_sso_link;
      DROP TABLE IF EXISTS shop_sso_config;
    `);
  }
};
