// clean-room; behavior modeled on the R3 external control-plane contract (proprietary self, not copied)
'use strict';

import { rebuildApprovalsForR3Rollback } from '../vnext/server/db/sqlite-rebuild.mjs';

export const migration = {
  id: '619_r3_control_plane_contracts',
  dependsOn: ['618_r3_blocker_closure'],
  up(db) {
    const columns = new Set(db.prepare('PRAGMA table_info(x_approvals)').all().map(row => row.name));
    for (const [name, definition] of [
      ['company_id', "TEXT NOT NULL DEFAULT ''"], ['tenant_id', "TEXT NOT NULL DEFAULT ''"],
      ['payload_hash', "TEXT NOT NULL DEFAULT ''"], ['requester_id', "TEXT NOT NULL DEFAULT ''"], ['expires_at', 'TEXT'],
    ]) if (!columns.has(name)) db.exec(`ALTER TABLE x_approvals ADD COLUMN ${name} ${definition}`);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_x_approvals_scope ON x_approvals(company_id, tenant_id, entity, record_id, action, status);
      CREATE TABLE IF NOT EXISTS r3_idempotency (
        actor_id TEXT NOT NULL, company_id TEXT NOT NULL, tenant_id TEXT NOT NULL,
        operation_type TEXT NOT NULL, idempotency_key TEXT NOT NULL, payload_hash TEXT NOT NULL,
        response_json TEXT NOT NULL, status_code INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT,
        PRIMARY KEY(actor_id, company_id, tenant_id, operation_type, idempotency_key)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_r3_idempotency_scope ON r3_idempotency(company_id, tenant_id, operation_type, created_at);
    `);
  },
  down(db) {
    db.exec('DROP INDEX IF EXISTS idx_r3_idempotency_scope; DROP TABLE IF EXISTS r3_idempotency; DROP INDEX IF EXISTS idx_x_approvals_scope;');
    rebuildApprovalsForR3Rollback(db, ['company_id', 'tenant_id', 'payload_hash', 'requester_id', 'expires_at']);
  },
};
