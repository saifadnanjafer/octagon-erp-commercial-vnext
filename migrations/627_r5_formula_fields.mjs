// R5.2 custom-field UX + formula fields: registry for computed/formula fields.
// A formula field declares an expression over other fields of the same entity;
// the sandboxed evaluator (formula-engine) recomputes it on dependency change.
// Additive schema; down drops exactly this table.
'use strict';

export const migration = {
  id: '627_r5_formula_fields',
  dependsOn: ['626_r5_entity_studio'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS formula_field (
        id TEXT PRIMARY KEY,
        entity TEXT NOT NULL,
        key TEXT NOT NULL,
        label_ar TEXT,
        expression TEXT NOT NULL,
        depends_on TEXT NOT NULL DEFAULT '[]',
        visible_when TEXT,
        result_type TEXT NOT NULL DEFAULT 'number',
        created_by TEXT,
        created_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_formula_field_key ON formula_field (entity, key);
    `);
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_formula_field_key; DROP TABLE IF EXISTS formula_field;');
  },
};
