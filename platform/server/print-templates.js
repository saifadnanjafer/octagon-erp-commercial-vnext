// ============================================================================
// Octagon Commercial — template print service (P0.9).
// Pattern re-expressed from:
//   - erp-research/nocobase-main/docs/docs/en/template-print/index.md
//   - erp-research/nocobase-main/docs/docs/en/template-print/configuration.md
//   - erp-research/idurar-erp-crm-master/backend/src/controllers/pdfController/index.js
//
// Templates live in the generic x_records store as entity=print_template.
// Rendering deliberately stays in the browser: it produces safe HTML for an
// isolated print iframe instead of adding a server-side PDF dependency.
// ============================================================================
'use strict';

const API_BASE = '/api/x/print';
const TEMPLATE_ENTITY = 'print_template';
const MAX_TEMPLATE_HTML = 120000;

const DEFAULT_TEMPLATES = [
  {
    id: 'tpl_invoice_default',
    entity: 'invoice',
    name: 'فاتورة مبيعات — افتراضي',
    format: 'A4',
    html: '<section class="ox-print-doc"><header><h1>فاتورة مبيعات</h1><p>رقم الفاتورة: <b>{{name}}</b></p></header><div class="ox-print-grid"><p><strong>العميل:</strong> {{customer_name}}</p><p><strong>التاريخ:</strong> {{posting_date}}</p><p><strong>الحالة:</strong> {{status}}</p><p><strong>الإجمالي:</strong> {{grand_total}}</p></div><footer>شكراً لتعاملكم مع أوكتاغون</footer></section>'
  },
  {
    id: 'tpl_receipt_default',
    entity: 'receipt',
    name: 'سند قبض — افتراضي',
    format: 'A5',
    html: '<section class="ox-print-doc"><header><h1>سند قبض</h1><p>رقم السند: <b>{{name}}</b></p></header><div class="ox-print-grid"><p><strong>استلمنا من:</strong> {{party_name}}</p><p><strong>التاريخ:</strong> {{posting_date}}</p><p><strong>المبلغ:</strong> {{amount}}</p><p><strong>طريقة الدفع:</strong> {{payment_method}}</p></div><footer>توقيع المستلم: __________________</footer></section>'
  },
  {
    id: 'tpl_purchase_order_default',
    entity: 'purchase_order',
    name: 'أمر شراء — افتراضي',
    format: 'A4',
    html: '<section class="ox-print-doc"><header><h1>أمر شراء</h1><p>رقم الأمر: <b>{{name}}</b></p></header><div class="ox-print-grid"><p><strong>المورد:</strong> {{supplier_name}}</p><p><strong>تاريخ الطلب:</strong> {{transaction_date}}</p><p><strong>حالة الأمر:</strong> {{status}}</p><p><strong>الإجمالي:</strong> {{grand_total}}</p></div><footer>يرجى تأكيد الاستلام والتنفيذ.</footer></section>'
  },
  {
    id: 'tpl_work_order_default',
    entity: 'work_order',
    name: 'أمر عمل — افتراضي',
    format: 'A4',
    html: '<section class="ox-print-doc"><header><h1>أمر عمل</h1><p>رقم الأمر: <b>{{name}}</b></p></header><div class="ox-print-grid"><p><strong>العميل:</strong> {{customer_name}}</p><p><strong>المركبة / الأصل:</strong> {{asset_name}}</p><p><strong>الحالة:</strong> {{status}}</p><p><strong>تاريخ التسليم:</strong> {{delivery_date}}</p></div><section><h2>وصف العمل</h2><p>{{description}}</p></section><footer>اعتماد المشرف: __________________</footer></section>'
  }
];

function envelope(data, error, meta) {
  return { success: !error, data: error ? null : data, error: error || null, meta: meta || null };
}

function clean(value, max) {
  return String(value == null ? '' : value).trim().slice(0, max || 5000);
}

function safeJson(value, fallback) {
  if (!value || typeof value !== 'string') return value && typeof value === 'object' ? value : fallback;
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function ensureRecordStore(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_records (
      entity TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT, updated_at TEXT, created_by TEXT, removed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity, id)
    );
    CREATE INDEX IF NOT EXISTS idx_x_records_entity_removed ON x_records (entity, removed);
  `);
}

function rowToTemplate(row) {
  const data = safeJson(row.data, {});
  return {
    id: row.id,
    entity: clean(data.entity, 120),
    name: clean(data.name, 180),
    html: String(data.html || ''),
    format: String(data.format || 'A4').toUpperCase() === 'A5' ? 'A5' : 'A4',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
  };
}

function seedDefaultTemplates(db) {
  ensureRecordStore(db);
  const now = new Date().toISOString();
  const find = db.prepare('SELECT id FROM x_records WHERE entity = ? AND id = ?');
  const insert = db.prepare('INSERT INTO x_records (entity, id, data, created_at, updated_at, created_by, removed) VALUES (?, ?, ?, ?, ?, ?, 0)');
  let inserted = 0;
  for (const template of DEFAULT_TEMPLATES) {
    if (find.get(TEMPLATE_ENTITY, template.id)) continue;
    insert.run(TEMPLATE_ENTITY, template.id, JSON.stringify({ entity: template.entity, name: template.name, html: template.html, format: template.format }), now, now, 'system:print-templates');
    inserted += 1;
  }
  return inserted;
}

function listTemplates(db, entity) {
  const requested = clean(entity, 120);
  const rows = db.prepare('SELECT id, data, created_at, updated_at FROM x_records WHERE entity = ? AND removed = 0 ORDER BY updated_at DESC, id ASC')
    .all(TEMPLATE_ENTITY)
    .map(rowToTemplate)
    .filter((template) => !requested || template.entity === requested || template.entity === '*');
  return rows;
}

function getTemplate(db, id) {
  const row = db.prepare('SELECT id, data, created_at, updated_at FROM x_records WHERE entity = ? AND id = ? AND removed = 0')
    .get(TEMPLATE_ENTITY, clean(id, 160));
  return row ? rowToTemplate(row) : null;
}

function createPrintTemplateHandler(deps) {
  const db = deps && deps.db;
  if (!db || typeof db.prepare !== 'function' || typeof db.exec !== 'function') throw new Error('mountPrintTemplates requires sqlite db');
  seedDefaultTemplates(db);

  function respond(res, status, data, error, meta) {
    const text = JSON.stringify(envelope(data, error, meta));
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
  }

  function dispatch(req, res, url) {
    const rest = url.pathname.slice(API_BASE.length).replace(/^\/+|\/+$/g, '').split('/').filter(Boolean).map(decodeURIComponent);
    if (req.method === 'GET' && rest.length === 1 && rest[0] === 'templates') {
      const templates = listTemplates(db, url.searchParams.get('entity'));
      respond(res, 200, templates, null, { total: templates.length });
      return true;
    }
    if (req.method === 'GET' && rest.length === 2 && rest[0] === 'templates') {
      const template = getTemplate(db, rest[1]);
      if (!template) respond(res, 404, null, 'قالب الطباعة غير موجود');
      else respond(res, 200, template);
      return true;
    }
    respond(res, 404, null, 'مسار الطباعة غير موجود');
    return true;
  }

  return {
    handle(req, res, requestUrl) {
      const url = requestUrl || new URL(req.url, `http://${(req.headers || {}).host || 'localhost'}`);
      if (!url.pathname.startsWith(`${API_BASE}/`)) return false;
      try { return dispatch(req, res, url); } catch (error) {
        const text = JSON.stringify(envelope(null, error.message || 'تعذر تحميل قوالب الطباعة'));
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
        return true;
      }
    },
    list: (entity) => listTemplates(db, entity),
    get: (id) => getTemplate(db, id),
  };
}

function mountPrintTemplates(appOrDeps, maybeDb) {
  if (appOrDeps && typeof appOrDeps.use === 'function' && maybeDb) {
    const handler = createPrintTemplateHandler({ db: maybeDb });
    appOrDeps.use((req, res, next) => {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      if (!handler.handle(req, res, url)) next();
    });
    return handler;
  }
  return createPrintTemplateHandler(appOrDeps || {});
}

module.exports = {
  DEFAULT_TEMPLATES,
  ensureRecordStore,
  seedDefaultTemplates,
  mountPrintTemplates,
  _internal: { rowToTemplate, listTemplates, getTemplate, MAX_TEMPLATE_HTML },
};
