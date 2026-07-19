// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.5/R1.8 Lane C completion (proprietary self, not copied)
'use strict';

export const migration = {
  id: '302_r1_lane_c_completion',
  up(db) {
    // T1.8.1 (migration-hygiene fix): x_notification_preferences was
    // previously created at runtime inside notify.js's mountNotify() via a
    // bare `CREATE TABLE IF NOT EXISTS`, which violates the project's own
    // guardrail ("all schema via migrations/NNN_*.mjs — no engine-created
    // tables", see R1_FINAL_COMPLETION_REPORT.md §2.2). Ownership moves here.
    //
    // IF NOT EXISTS is intentional and safe here (this is a proper migration
    // file, not a runtime engine call): a dev DB that already has this table
    // from the old runtime path keeps its rows untouched — no data loss
    // either way, and a fresh DB gets the table for the first time.
    db.exec(`
      CREATE TABLE IF NOT EXISTS x_notification_preferences (
        user     TEXT PRIMARY KEY,
        channels TEXT NOT NULL
      ) STRICT;
    `);

    // T1.5.1: snapshot fields. A custom field of type 'snapshot' carries a
    // declarative snapshot_of {entity, field, ref_field, at_transition_to}
    // config, validated and persisted by fields/custom-fields.js. The
    // materialize-on-transition hook itself lives in
    // fields/snapshot-fields.js (an audit-event subscriber — see that file's
    // header comment for the full trace). This column just gives the config
    // a place to live; it is nullable and only meaningful when type='snapshot'.
    const columns = db.prepare('PRAGMA table_info(x_custom_fields)').all();
    if (!columns.some((c) => c.name === 'snapshot_of')) {
      db.exec('ALTER TABLE x_custom_fields ADD COLUMN snapshot_of TEXT;');
    }
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS x_notification_preferences;');
    // snapshot_of column intentionally left in place on down() — SQLite
    // column drops are non-trivial across versions and an unused nullable
    // column is harmless to older code paths (same rationale documented in
    // migrations/501_r1_kernel_completion.mjs's down()).
  },
};
