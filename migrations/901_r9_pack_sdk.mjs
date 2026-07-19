// R9.1 Pack SDK schema.
'use strict';

export const migration = {
  id: '901_r9_pack_sdk',
  dependsOn: ['805_r8_supportability'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_pack_registry (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        pack_id          TEXT NOT NULL,
        name             TEXT NOT NULL,
        version          TEXT NOT NULL,
        description      TEXT,
        author           TEXT,
        edition_required TEXT NOT NULL DEFAULT 'standard',
        installed        INTEGER NOT NULL DEFAULT 0,
        installed_at     TEXT,
        installed_by     TEXT,
        manifest_hash    TEXT,
        created_at       TEXT NOT NULL,
        UNIQUE(company_id, pack_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_pack_migration (
        id               TEXT PRIMARY KEY,
        pack_id          TEXT NOT NULL,
        migration_id     TEXT NOT NULL,
        direction        TEXT NOT NULL CHECK(direction IN ('up', 'down')),
        applied_at       TEXT NOT NULL,
        UNIQUE(pack_id, migration_id)
      ) STRICT;

      CREATE TABLE IF NOT EXISTS shop_pack_patch (
        id               TEXT PRIMARY KEY,
        company_id       TEXT NOT NULL REFERENCES companies(company_id),
        pack_id          TEXT NOT NULL,
        target_type      TEXT NOT NULL CHECK(target_type IN ('collection', 'field', 'state', 'workflow', 'permission', 'seed', 'print_template', 'dashboard', 'terminology')),
        target_key       TEXT NOT NULL,
        patch_action     TEXT NOT NULL CHECK(patch_action IN ('add', 'modify', 'remove')),
        patch_data       TEXT NOT NULL,
        applied          INTEGER NOT NULL DEFAULT 0,
        applied_at       TEXT,
        reverted         INTEGER NOT NULL DEFAULT 0,
        reverted_at      TEXT,
        UNIQUE(company_id, pack_id, target_type, target_key)
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_pack_patch;
      DROP TABLE IF EXISTS shop_pack_migration;
      DROP TABLE IF EXISTS shop_pack_registry;
    `);
  }
};
