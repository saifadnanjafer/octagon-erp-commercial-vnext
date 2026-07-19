// R3.7 SLA business-hours, pause, resume, response, and resolution clock contract.
'use strict';

import { rebuildHelpdeskTicketSlaForR3Rollback } from '../vnext/server/db/sqlite-rebuild.mjs';

export const migration = {
  id: '620_r3_sla_business_clock',
  dependsOn: ['619_r3_control_plane_contracts'],
  up(db) {
    const columns = new Set(db.prepare('PRAGMA table_info(helpdesk_ticket_sla)').all().map((row) => row.name));
    for (const [name, definition] of [
      ['sla_state', "TEXT NOT NULL DEFAULT 'running'"],
      ['paused_at', 'TEXT'],
      ['paused_business_seconds', 'REAL NOT NULL DEFAULT 0'],
      ['last_tick_at', 'TEXT'],
    ]) if (!columns.has(name)) db.exec(`ALTER TABLE helpdesk_ticket_sla ADD COLUMN ${name} ${definition}`);
  },
  down(db) {
    rebuildHelpdeskTicketSlaForR3Rollback(db, ['sla_state', 'paused_at', 'paused_business_seconds', 'last_tick_at']);
  },
};
