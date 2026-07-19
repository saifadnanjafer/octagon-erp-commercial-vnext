'use strict';
// Octagon Commercial demo seed pack (P0.12).
// Patterns re-expressed from:
//   - erp-research/erpnext-develop/erpnext/crm/doctype/lead/lead.json
//   - erp-research/erpnext-develop/erpnext/support/doctype/issue/issue.json
//   - erp-research/erpnext-develop/erpnext/stock/doctype/item/item.json
// This module deliberately writes only isolated platform tables: x_records,
// x_acl_roles, x_acl_grants, and x_seed_flags. It never reads or writes legacy
// employee, attendance, timesheet, payroll, or finance collections.

const SEED_FLAG = 'x_seed_done';
const SEED_USER = 'system:commercial-seed';

const ROLES = [
  ['manager', 'مدير'],
  ['accountant', 'محاسب'],
  ['sales', 'مبيعات'],
  ['operator', 'مشغّل'],
];

// These grants supplement P0.2's safe defaults and use the P0.1 registry keys.
const GRANTS = [
  ['manager', 'sales:*', 'all'],
  ['manager', 'support:*', 'all'],
  ['manager', 'supply:*', 'all'],
  ['accountant', 'sales:crm_lead:read', 'all'],
  ['accountant', 'support:helpdesk_ticket:read', 'all'],
  ['accountant', 'supply:product:read', 'all'],
  ['sales', 'sales:crm_lead:*', 'all'],
  ['sales', 'support:helpdesk_ticket:create', 'all'],
  ['sales', 'support:helpdesk_ticket:read', 'all'],
  ['sales', 'support:helpdesk_ticket:update', 'own'],
  ['operator', 'supply:product:read', 'all'],
];

const LEAD_NAMES = [
  'شركة الرافدين للتجارة', 'مؤسسة بغداد التقنية', 'مركز النخبة الطبي', 'مطاعم دجلة',
  'شركة البناء المتين', 'صيدلية الشفاء', 'فندق بابل الدولي', 'عيادة الحياة',
  'معرض الأفق للسيارات', 'شركة النور للمقاولات', 'مكتبة المعرفة', 'مخبز السنابل',
  'حلول المدار الرقمية', 'مجمع الربيع السكني', 'مختبرات الفرات', 'مؤسسة الواجهة',
  'شركة البصرة اللوجستية', 'مدارس الإبداع الأهلية', 'مركز التميز الرياضي', 'مجموعة الرؤية المتحدة',
];

const PRODUCT_ROWS = [
  ['زيت محرك صناعي 5W-30', 'OCT-LUB-001', 'زيوت ومواد تشحيم', 18, 25],
  ['فلتر زيت قياسي', 'OCT-FLT-002', 'فلاتر', 4, 7],
  ['فلتر هواء للمحرك', 'OCT-FLT-003', 'فلاتر', 6, 10],
  ['سائل تبريد طويل العمر', 'OCT-CLT-004', 'سوائل تشغيل', 8, 13],
  ['بطارية 70 أمبير', 'OCT-BAT-005', 'كهربائيات', 55, 72],
  ['سير محرك متعدد الاستخدام', 'OCT-BLT-006', 'قطع غيار', 12, 18],
  ['فحمات فرامل أمامية', 'OCT-BRK-007', 'فرامل', 16, 24],
  ['قرص فرامل أمامي', 'OCT-BRK-008', 'فرامل', 28, 40],
  ['بواجي إشعال بلاتينية', 'OCT-SPK-009', 'كهربائيات', 9, 15],
  ['ممسحة زجاج 22 إنش', 'OCT-WPR-010', 'اكسسوارات', 5, 9],
  ['لمبة LED أمامية', 'OCT-LMP-011', 'كهربائيات', 11, 18],
  ['منظف بخاخ الوقود', 'OCT-FUL-012', 'سوائل تشغيل', 7, 12],
  ['إطار خدمة ميدانية', 'OCT-SVC-013', 'خدمات', 20, 35],
  ['فحص تشخيص إلكتروني', 'OCT-SVC-014', 'خدمات', 15, 30],
  ['اشتراك صيانة دورية', 'OCT-SVC-015', 'خدمات', 60, 95],
];

const PRINT_TEMPLATES = [
  ['tpl_invoice_default', 'invoice', 'فاتورة مبيعات — افتراضي', 'A4', '<section dir="rtl"><h1>فاتورة مبيعات</h1><p>رقم الفاتورة: <b>{{name}}</b></p><p>العميل: {{customer_name}}</p><p>الإجمالي: {{grand_total}}</p></section>'],
  ['tpl_receipt_default', 'receipt', 'سند قبض — افتراضي', 'A5', '<section dir="rtl"><h1>سند قبض</h1><p>رقم السند: <b>{{name}}</b></p><p>استلمنا من: {{party_name}}</p><p>المبلغ: {{amount}}</p></section>'],
  ['tpl_purchase_order_default', 'purchase_order', 'أمر شراء — افتراضي', 'A4', '<section dir="rtl"><h1>أمر شراء</h1><p>رقم الأمر: <b>{{name}}</b></p><p>المورد: {{supplier_name}}</p><p>الإجمالي: {{grand_total}}</p></section>'],
  ['tpl_work_order_default', 'work_order', 'أمر عمل — افتراضي', 'A4', '<section dir="rtl"><h1>أمر عمل</h1><p>رقم الأمر: <b>{{name}}</b></p><p>العميل: {{customer_name}}</p><p>الحالة: {{status}}</p></section>'],
  ['tpl_quote_commercial', 'quotation', 'عرض سعر تجاري', 'A4', '<section dir="rtl"><h1>عرض سعر</h1><p>المرجع: <b>{{name}}</b></p><p>العميل: {{customer_name}}</p><p>صالح حتى: {{valid_till}}</p><p>الإجمالي: {{grand_total}}</p></section>'],
];

const WORKFLOWS = [
  {
    id: 'workflow_lead_welcome',
    name: 'متابعة العميل المحتمل الجديد',
    trigger: { type: 'record', entity: 'crm_lead', event: 'created' },
    nodes: [{ id: 'notify_sales', type: 'notify', label: 'إشعار المبيعات', config: { role: 'sales', title: 'عميل محتمل جديد', body: 'تمت إضافة عميل محتمل جديد إلى قائمة المبيعات.' } }],
  },
  {
    id: 'workflow_ticket_escalation',
    name: 'تصعيد تذكرة الدعم العاجلة',
    trigger: { type: 'record', entity: 'helpdesk_ticket', event: 'created', condition: { path: 'record.priority', operator: 'eq', value: 'urgent' } },
    nodes: [{ id: 'notify_manager', type: 'notify', label: 'إشعار المدير', config: { role: 'manager', title: 'تذكرة دعم عاجلة', body: 'تحتاج تذكرة دعم عاجلة إلى متابعة المدير.' } }],
  },
];

function ensureStorage(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_records (
      entity TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT, updated_at TEXT, created_by TEXT, removed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity, id)
    );
    CREATE INDEX IF NOT EXISTS idx_x_records_entity_removed ON x_records (entity, removed);
    CREATE TABLE IF NOT EXISTS x_acl_roles (role TEXT PRIMARY KEY, label_ar TEXT);
    CREATE TABLE IF NOT EXISTS x_acl_grants (
      role TEXT NOT NULL, perm TEXT NOT NULL, scope TEXT NOT NULL DEFAULT 'all',
      PRIMARY KEY (role, perm)
    );
    CREATE TABLE IF NOT EXISTS x_seed_flags (
      flag TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL
    );
  `);
}

function isoDaysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function insertRecord(db, entity, id, data, createdAt) {
  const timestamp = createdAt || new Date().toISOString();
  const result = db.prepare(
    'INSERT OR IGNORE INTO x_records (entity, id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, 0)'
  ).run(entity, id, JSON.stringify(data), timestamp, timestamp, SEED_USER);
  return Number(result.changes || 0);
}

function buildLeads() {
  const statuses = ['new', 'contacted', 'qualified', 'won', 'lost'];
  const sources = ['موقع', 'إحالة', 'اتصال بارد', 'معرض', 'أخرى'];
  return LEAD_NAMES.map((company, index) => ({
    id: `demo_lead_${String(index + 1).padStart(2, '0')}`,
    data: {
      name: `جهة اتصال ${index + 1}`,
      company,
      phone: `+964 7${String(700000000 + index * 137).slice(0, 9)}`,
      email: `lead${index + 1}@demo.octagon.local`,
      source: sources[index % sources.length],
      status: statuses[index % statuses.length],
      owner: index % 2 ? 'مبيعات' : 'مدير',
      value: 1500 + index * 725,
      notes: 'بيانات تجريبية آمنة لمنصة أوكتاغون التجارية.',
    },
    createdAt: isoDaysAgo(20 - index),
  }));
}

function buildTickets() {
  const subjects = [
    'طلب متابعة عقد صيانة', 'استفسار عن عرض السعر', 'مشكلة في فاتورة العميل', 'موعد صيانة ميدانية',
    'طلب تحديث بيانات العميل', 'تعذر تسجيل طلب جديد', 'مراجعة حالة قطع الغيار', 'مشكلة في الإشعارات',
    'طلب نسخة من سند القبض', 'تذكرة عاجلة للتصعيد',
  ];
  const priorities = ['low', 'medium', 'high', 'medium', 'low', 'high', 'medium', 'low', 'medium', 'urgent'];
  const statuses = ['open', 'in_progress', 'waiting', 'resolved', 'open', 'in_progress', 'waiting', 'closed', 'resolved', 'open'];
  return subjects.map((subject, index) => ({
    id: `demo_ticket_${String(index + 1).padStart(2, '0')}`,
    data: {
      subject,
      customer: LEAD_NAMES[index],
      priority: priorities[index],
      status: statuses[index],
      assignee: index % 2 ? 'مبيعات' : 'مشغّل',
      body: 'هذه تذكرة تجريبية لعرض تدفق الدعم وخدمة العملاء.',
    },
    createdAt: isoDaysAgo(10 - index),
  }));
}

function seedCommercial(db, options) {
  if (!db || typeof db.exec !== 'function' || typeof db.prepare !== 'function') {
    throw new Error('seedCommercial requires a SQLite handle with exec() and prepare()');
  }
  ensureStorage(db);
  const force = Boolean(options && options.force);
  const done = db.prepare('SELECT flag FROM x_seed_flags WHERE flag = ? AND value = ?').get(SEED_FLAG, 'done');
  if (done && !force) return { seeded: false, reason: 'already_seeded', inserted: {} };

  const inserted = { roles: 0, grants: 0, crm_lead: 0, helpdesk_ticket: 0, product: 0, print_template: 0, workflow: 0 };
  const addRole = db.prepare('INSERT OR IGNORE INTO x_acl_roles (role, label_ar) VALUES (?, ?)');
  const addGrant = db.prepare('INSERT OR IGNORE INTO x_acl_grants (role, perm, scope) VALUES (?, ?, ?)');

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const role of ROLES) inserted.roles += Number(addRole.run(...role).changes || 0);
    for (const grant of GRANTS) inserted.grants += Number(addGrant.run(...grant).changes || 0);
    for (const row of buildLeads()) inserted.crm_lead += insertRecord(db, 'crm_lead', row.id, row.data, row.createdAt);
    for (const row of buildTickets()) inserted.helpdesk_ticket += insertRecord(db, 'helpdesk_ticket', row.id, row.data, row.createdAt);
    PRODUCT_ROWS.forEach((row, index) => {
      const [name, sku, category, cost_price, sale_price] = row;
      inserted.product += insertRecord(db, 'product', `demo_product_${String(index + 1).padStart(2, '0')}`, {
        name, sku, category, uom: index === 12 || index === 13 || index === 14 ? 'خدمة' : 'قطعة', cost_price, sale_price, status: 'active',
      }, isoDaysAgo(15 - index));
    });
    PRINT_TEMPLATES.forEach(([id, entity, name, format, html]) => {
      inserted.print_template += insertRecord(db, 'print_template', id, { entity, name, format, html });
    });
    WORKFLOWS.forEach((workflow) => {
      inserted.workflow += insertRecord(db, 'workflow', workflow.id, {
        name: workflow.name, active: true, trigger: workflow.trigger, nodes: workflow.nodes, seed: true,
      });
    });
    db.prepare('INSERT INTO x_seed_flags (flag, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(flag) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
      .run(SEED_FLAG, 'done', new Date().toISOString());
    db.exec('COMMIT');
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* no open transaction */ }
    throw error;
  }
  return { seeded: true, inserted };
}

module.exports = { SEED_FLAG, seedCommercial, _internal: { ensureStorage, buildLeads, buildTickets } };
