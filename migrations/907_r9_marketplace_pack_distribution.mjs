// R9.4 Marketplace & pack distribution schema: trusted signer registry and
// pack catalog/lifecycle tracking. Actual patch application continues to live
// in the R9.1 Pack SDK tables (shop_pack_registry / shop_pack_patch); this
// migration adds only the marketplace-specific catalog and signer tables.
'use strict';

export const migration = {
  id: '907_r9_marketplace_pack_distribution',
  dependsOn: ['906_r9_retail_pos_payment_governance'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_marketplace_signer (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        signer_id        TEXT NOT NULL,
        public_key       TEXT NOT NULL,
        key_fingerprint  TEXT NOT NULL,
        publisher_name   TEXT,
        status           TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'revoked')),
        valid_from       TEXT NOT NULL,
        valid_to         TEXT,
        created_at       TEXT NOT NULL,
        created_by       TEXT NOT NULL,
        revoked_at       TEXT,
        revoked_by       TEXT,
        revoke_reason    TEXT,
        UNIQUE(company_id, signer_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_marketplace_pack (
        id                   TEXT PRIMARY KEY,
        company_id           TEXT NOT NULL REFERENCES companies(company_id),
        pack_id              TEXT NOT NULL,
        version              TEXT NOT NULL,
        state                TEXT NOT NULL CHECK(state IN ('verified', 'rejected', 'installed', 'disabled', 'superseded')),
        signer_id            TEXT,
        signer_fingerprint   TEXT,
        package_checksum     TEXT NOT NULL,
        manifest_json        TEXT NOT NULL,
        compat_json          TEXT NOT NULL,
        dependencies_json    TEXT NOT NULL DEFAULT '[]',
        conflicts_json       TEXT NOT NULL DEFAULT '[]',
        edition_required     TEXT NOT NULL DEFAULT 'standard',
        pricing_tier         TEXT NOT NULL DEFAULT 'free' CHECK(pricing_tier IN ('free', 'included', 'paid', 'trial')),
        entitlement_state    TEXT NOT NULL DEFAULT 'free' CHECK(entitlement_state IN ('free', 'included', 'licensed', 'trial', 'expired', 'missing')),
        rejection_reason     TEXT,
        rejection_code       TEXT,
        uploaded_at          TEXT NOT NULL,
        uploaded_by          TEXT NOT NULL,
        verified_at          TEXT,
        installed_at         TEXT,
        installed_by         TEXT,
        disabled_at          TEXT,
        disabled_by          TEXT,
        uninstalled_at       TEXT,
        uninstalled_by       TEXT,
        superseded_by        TEXT,
        created_at           TEXT NOT NULL,
        UNIQUE(company_id, pack_id, version)
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_marketplace_pack_lookup ON shop_marketplace_pack(company_id, pack_id, state);
      CREATE INDEX IF NOT EXISTS idx_marketplace_signer_lookup ON shop_marketplace_signer(company_id, status);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_marketplace_signer_lookup;
      DROP INDEX IF EXISTS idx_marketplace_pack_lookup;
      DROP TABLE IF EXISTS shop_marketplace_pack;
      DROP TABLE IF EXISTS shop_marketplace_signer;
    `);
  }
};
