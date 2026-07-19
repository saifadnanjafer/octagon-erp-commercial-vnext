// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R4.4 collaboration & activity wiring. Builds on the R1.4 chatter engine
// (x_chatter threads, x_followers) — does not reimplement it. Adds per-entity
// tracked-field auto-logging (posts a 'log' chatter item on tracked changes),
// record-header status/next-activity helpers, and coverage across every
// R2/R3 document type.
'use strict';

// Tracked-field sets per entity. A change to any listed field auto-logs a chatter
// entry. '*state*' means any field named state/status is tracked.
const TRACKED_FIELDS = {
  sales_quote: ['state', 'total_amount', 'partner_id'],
  sales_order: ['state', 'total_amount', 'partner_id'],
  purchase_order: ['state', 'total_amount', 'supplier_id'],
  purchase_match: ['state'],
  fiscal_doc: ['state', 'total_amount'],
  arap_document: ['state', 'total_amount'],
  stock_pick: ['state'],
  stock_reorder_request: ['state', 'supply_ref'],
  mrp_production_order: ['state', 'finished_qty', 'rolled_cost'],
  mrp_work_order: ['state'],
  subcontract_order: ['state', 'variance'],
  subcontract_receipt: ['state'],
  landed_cost: ['state'],
  project_project: ['state'],
  project_task: ['state'],
  project_milestone: ['state'],
  helpdesk_ticket: ['state'],
  helpdesk_ticket_sla: ['state', 'sla_state'],
  field_service_order: ['state'],
};

// Every entity the collaboration layer must cover with thread + followers +
// activities (the R2/R3 document types).
const COLLABORATION_ENTITIES = Object.keys(TRACKED_FIELDS);

function trackedFieldsFor(entity) {
  return TRACKED_FIELDS[entity] || ['state'];
}

function changedTrackedFields(entity, before, after) {
  if (!before || !after) return [];
  const fields = trackedFieldsFor(entity);
  const changes = [];
  for (const field of fields) {
    const from = before[field];
    const to = after[field];
    if (from !== to && !(from == null && to == null)) changes.push({ field, from: from ?? null, to: to ?? null });
  }
  return changes;
}

// Post a 'log' chatter item summarizing tracked-field changes. Called from the
// universal recordWrite chokepoint; a failure here aborts the enclosing
// transaction (never silently swallowed).
function autoLogTrackedChanges(db, entity, recordId, before, after, actor) {
  const changes = changedTrackedFields(entity, before, after);
  if (!changes.length) return null;
  const body = changes.map((change) => `${change.field}: ${change.from} → ${change.to}`).join(' · ');
  const id = `chg_${entity}_${recordId}_${db.prepare('SELECT COUNT(*) n FROM x_chatter').get().n}`;
  db.prepare('INSERT INTO x_chatter(id,entity,record_id,kind,body,author,activity_type,due_date,done,meta,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, entity, String(recordId), 'log', body, actor || 'system', '', '', 0, JSON.stringify({ tracked: changes }), new Date().toISOString());
  return { id, changes };
}

// Record-header data: current thread counts, followers, and the next open activity.
function recordHeader(db, entity, recordId) {
  const counts = { message: 0, log: 0, activity: 0, open_activities: 0 };
  for (const row of db.prepare('SELECT kind, COUNT(*) n, SUM(CASE WHEN done=0 THEN 1 ELSE 0 END) open FROM x_chatter WHERE entity=? AND record_id=? GROUP BY kind').all(entity, String(recordId))) {
    counts[row.kind] = row.n;
    if (row.kind === 'activity') counts.open_activities = row.open;
  }
  const followers = db.prepare('SELECT user FROM x_followers WHERE entity=? AND record_id=? ORDER BY user').all(entity, String(recordId)).map((row) => row.user);
  const nextActivity = db.prepare("SELECT id, activity_type, body, due_date FROM x_chatter WHERE entity=? AND record_id=? AND kind='activity' AND done=0 ORDER BY due_date ASC LIMIT 1").get(entity, String(recordId)) || null;
  return { entity, record_id: String(recordId), counts, followers, next_activity: nextActivity };
}

module.exports = { TRACKED_FIELDS, COLLABORATION_ENTITIES, trackedFieldsFor, changedTrackedFields, autoLogTrackedChanges, recordHeader };
