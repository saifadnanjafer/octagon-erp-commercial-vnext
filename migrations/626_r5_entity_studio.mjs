// R5.1 entity studio: provenance table tracking studio-created collections so
// they can be listed and cleanly retracted. The studio itself writes into the
// R1 registry tables (collection_registry / field_registry) — no runtime DDL;
// those tables already exist. down() drops only this provenance table.
'use strict';

export const migration = {
  id: '626_r5_entity_studio',
  dependsOn: ['625_r4_ai_tool_registry'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS studio_entity (
        collection TEXT PRIMARY KEY REFERENCES collection_registry(collection) ON DELETE CASCADE,
        spec_json TEXT NOT NULL,
        created_by TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS studio_entity;');
  },
};
