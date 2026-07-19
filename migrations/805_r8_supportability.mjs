// R8.5 Supportability & Upgrades Schema.
'use strict';

export const migration = {
  id: '805_r8_supportability',
  dependsOn: ['804_r8_integration'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS shop_upgrade_history (
        id         TEXT PRIMARY KEY,
        version    TEXT NOT NULL,
        status     TEXT NOT NULL CHECK(status IN ('pending', 'success', 'failed')),
        applied_at TEXT NOT NULL,
        applied_by TEXT,
        log_output TEXT
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS shop_upgrade_history;
    `);
  }
};
