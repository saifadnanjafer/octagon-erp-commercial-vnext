// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R4.2 standard automation library shipped as installable DATA plus worklist
// activation. Templates are workflow definitions the R1.11 workflow-engine reads
// from x_records(entity='workflow'); this module does not reimplement the engine.
'use strict';

// The shipped standard automation library. Each template is a plain workflow
// definition (name, active, trigger, nodes) the engine consumes verbatim.
const TEMPLATES = [
  {
    key: 'lead-routing',
    name: 'توجيه العملاء المحتملين',
    trigger: { type: 'record', entity: 'sales_lead', event: 'created' },
    nodes: [{ id: 'notify_sales', type: 'notify', config: { role: 'sales-manager', title: 'عميل محتمل جديد', body: 'تم إنشاء فرصة بيع جديدة تتطلب التوجيه', link: '#sales-leads/{{record.id}}' } }],
  },
  {
    key: 'overdue-invoice-reminder',
    name: 'تذكير الفواتير المتأخرة',
    trigger: { type: 'schedule', event: 'created', every_minutes: 1440, start_at: '2000-01-01T00:00:00.000Z' },
    nodes: [{ id: 'notify_ar', type: 'notify', config: { role: 'accountant', title: 'مراجعة الفواتير المتأخرة', body: 'حان وقت مراجعة الفواتير المتأخرة للتحصيل' } }],
  },
  {
    key: 'reorder-alert',
    name: 'تنبيه إعادة الطلب',
    trigger: { type: 'record', entity: 'stock_reorder_request', event: 'created' },
    nodes: [{ id: 'notify_wh', type: 'notify', config: { role: 'warehouse-manager', title: 'اقتراح تزويد جديد', body: 'يوجد اقتراح تزويد بانتظار التحويل إلى مستند توريد', link: '#reorder-requests/{{record.id}}' } }],
  },
  {
    key: 'sla-warning',
    name: 'تحذير اتفاقية مستوى الخدمة',
    trigger: { type: 'record', entity: 'helpdesk_ticket_sla', event: 'updated', condition: { path: 'record.sla_state', operator: 'eq', value: 'running' } },
    nodes: [{ id: 'notify_support', type: 'notify', config: { role: 'support-lead', title: 'اقتراب خرق SLA', body: 'تذكرة تقترب من موعد الاستجابة/الحل', link: '#tickets/{{record.ticket_id}}' } }],
  },
  {
    key: 'wo-delay-escalation',
    name: 'تصعيد تأخر أمر العمل',
    trigger: { type: 'record', entity: 'mrp_work_order', event: 'updated', condition: { path: 'record.state', operator: 'eq', value: 'delayed' } },
    nodes: [{ id: 'escalate', type: 'request-approval', config: { entity: 'mrp_work_order', record_id: '{{record.id}}', action: 'delay_escalation', approver_role: 'manager', requester: 'workflow' } }],
  },
];

// Worklist queues activated by this release (R1.7 seed set). Each queue maps to a
// domain; badge counts are company-scoped reads over r3_worklist_item.
const WORKLIST_QUEUES = ['sales', 'procurement', 'warehouse', 'manufacturing', 'services'];

function templateRecordId(key) { return `wf_tmpl_${key}`; }

// Install templates into the engine's record store (x_records entity='workflow').
// Idempotent; marks rows with created_by='r4_template' for clean retract.
function installTemplates(db) {
  const now = new Date().toISOString();
  const insert = db.prepare('INSERT INTO x_records(entity,id,data,created_at,updated_at,created_by,removed) VALUES(?,?,?,?,?,?,0)');
  const update = db.prepare('UPDATE x_records SET data=?, updated_at=?, removed=0 WHERE entity=? AND id=?');
  let installed = 0;
  for (const template of TEMPLATES) {
    const recordId = templateRecordId(template.key);
    const data = JSON.stringify({ name: template.name, active: true, version: 1, trigger: template.trigger, nodes: template.nodes, created_from: 'r4_template', template_key: template.key });
    const existing = db.prepare("SELECT id FROM x_records WHERE entity='workflow' AND id=?").get(recordId);
    if (existing) update.run(data, now, 'workflow', recordId);
    else insert.run('workflow', recordId, data, now, now, 'r4_template');
    installed += 1;
  }
  return { installed };
}

function retractTemplates(db) {
  let removed = 0;
  for (const template of TEMPLATES) { const r = db.prepare("UPDATE x_records SET removed=1 WHERE entity='workflow' AND id=? AND created_by='r4_template'").run(templateRecordId(template.key)); removed += r.changes; }
  return { removed };
}

function listInstalled(db) {
  return db.prepare("SELECT id, data FROM x_records WHERE entity='workflow' AND created_by='r4_template' AND removed=0").all()
    .map((row) => ({ id: row.id, ...JSON.parse(row.data) }));
}

// Company-scoped worklist badge counts over the open items in r3_worklist_item.
function worklistBadges(db, companyId) {
  const badges = {};
  for (const queue of WORKLIST_QUEUES) {
    badges[queue] = db.prepare("SELECT COUNT(*) n FROM r3_worklist_item WHERE company_id=? AND queue=? AND state='open'").get(companyId, queue).n;
  }
  badges.total = Object.values(badges).reduce((sum, value) => sum + value, 0);
  return badges;
}

module.exports = { TEMPLATES, WORKLIST_QUEUES, templateRecordId, installTemplates, retractTemplates, listInstalled, worklistBadges };
