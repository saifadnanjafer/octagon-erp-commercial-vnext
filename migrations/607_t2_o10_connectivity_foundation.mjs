// clean-room; T2.O10.1 connectivity foundation schema
'use strict';

export const migration = {
  id: '607_t2_o10_connectivity_foundation',
  dependsOn: ['606_r2_stock_gl_perpetual'],
  up(db) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vnext_event_log (
        event_id              INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type            TEXT NOT NULL,
        occurred_at           TEXT NOT NULL,
        tenant_id             TEXT,
        company_id            TEXT,
        user_id               TEXT,
        audience_json         TEXT NOT NULL DEFAULT '{}',
        required_permission   TEXT,
        entity                TEXT,
        record_id             TEXT,
        payload_json          TEXT NOT NULL DEFAULT '{}',
        created_by            TEXT,
        expires_at            TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vnext_event_replay
        ON vnext_event_log(event_id, expires_at);
      CREATE INDEX IF NOT EXISTS idx_vnext_event_scope
        ON vnext_event_log(tenant_id, company_id, user_id, event_id);
      CREATE INDEX IF NOT EXISTS idx_vnext_event_retention
        ON vnext_event_log(expires_at);

      CREATE TABLE IF NOT EXISTS vnext_command_idempotency (
        idempotency_key TEXT PRIMARY KEY,
        actor_id        TEXT NOT NULL,
        tenant_id       TEXT,
        company_id      TEXT,
        command_type    TEXT NOT NULL,
        payload_hash    TEXT NOT NULL,
        status           TEXT NOT NULL CHECK (status IN ('completed', 'failed', 'conflict')),
        response_json   TEXT NOT NULL,
        created_at      TEXT NOT NULL,
        updated_at      TEXT NOT NULL
      ) STRICT;

      CREATE INDEX IF NOT EXISTS idx_vnext_idempotency_scope
        ON vnext_command_idempotency(actor_id, tenant_id, company_id, command_type);
      CREATE INDEX IF NOT EXISTS idx_vnext_idempotency_retention
        ON vnext_command_idempotency(updated_at);
    `);
  },
  down(db) {
    db.exec(`
      DROP INDEX IF EXISTS idx_vnext_idempotency_retention;
      DROP INDEX IF EXISTS idx_vnext_idempotency_scope;
      DROP TABLE IF EXISTS vnext_command_idempotency;
      DROP INDEX IF EXISTS idx_vnext_event_retention;
      DROP INDEX IF EXISTS idx_vnext_event_scope;
      DROP INDEX IF EXISTS idx_vnext_event_replay;
      DROP TABLE IF EXISTS vnext_event_log;
    `);
  },
};
