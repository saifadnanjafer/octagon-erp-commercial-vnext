// R4.4 collaboration & activity wiring: additive, reversible indexes that make
// per-record chatter/activity/follower reads efficient at document-header scale.
// No data change; down drops exactly what up created (schema-restoring).
'use strict';

export const migration = {
  id: '624_r4_collaboration_indexes',
  dependsOn: ['623_r4_workflow_templates'],
  up(db) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_x_chatter_kind ON x_chatter (entity, record_id, kind, done);
      CREATE INDEX IF NOT EXISTS idx_x_followers_user ON x_followers (user);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_x_followers_user;
      DROP INDEX IF EXISTS idx_x_chatter_kind;
    `);
  },
};
