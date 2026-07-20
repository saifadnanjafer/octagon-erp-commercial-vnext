// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.3 (proprietary self, not copied)
// R9.3 Retail/POS payment governance additions: default ewallet account, reversal document linkage, and durable outbox.
'use strict';

export const migration = {
  id: '906_r9_retail_pos_payment_governance',
  dependsOn: ['905_r9_retail_pos_governance'],
  up(db) {
    db.exec(`
      ALTER TABLE shop_retail_store ADD COLUMN default_ewallet_account_id TEXT;
      ALTER TABLE arap_document ADD COLUMN reversal_of_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_arap_reversal_of ON arap_document(reversal_of_id);

      CREATE TABLE IF NOT EXISTS vnext_outbox (
        outbox_id             INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type            TEXT NOT NULL,
        occurred_at           TEXT NOT NULL,
        tenant_id             TEXT,
        company_id            TEXT,
        user_id               TEXT,
        entity                TEXT,
        record_id             TEXT,
        payload_json          TEXT NOT NULL DEFAULT '{}',
        created_by            TEXT
      ) STRICT;
    `);
  },
  down(db) {
    db.exec(`
      DROP TABLE IF EXISTS vnext_outbox;
      DROP INDEX IF EXISTS idx_arap_reversal_of;
      ALTER TABLE arap_document DROP COLUMN reversal_of_id;
      ALTER TABLE shop_retail_store DROP COLUMN default_ewallet_account_id;
    `);
  }
};
