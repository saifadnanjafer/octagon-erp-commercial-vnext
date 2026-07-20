// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

function createOutboxService(options = {}) {
  const db = options.db;
  if (!db || typeof db.prepare !== 'function') throw new Error('createOutboxService requires a database handle');

  function write(input = {}) {
    const type = String(input.type || input.eventType || '').trim();
    if (!type) throw new Error('event type is required');
    const timestamp = new Date().toISOString();
    const payload = input.payload || {};
    const result = db.prepare(`
      INSERT INTO vnext_outbox (event_type, occurred_at, tenant_id, company_id, user_id, entity, record_id, payload_json, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(type, timestamp, input.tenantId || null, input.companyId || null, input.userId || null,
           input.entity || null, input.recordId || null, JSON.stringify(payload), input.createdBy || null);
    
    return {
      id: String(result.lastInsertRowid),
      type,
      timestamp,
      tenantId: input.tenantId || null,
      companyId: input.companyId || null,
      userId: input.userId || null,
      entity: input.entity || null,
      recordId: input.recordId || null,
      payload
    };
  }

  return { write };
}

module.exports = { createOutboxService };
