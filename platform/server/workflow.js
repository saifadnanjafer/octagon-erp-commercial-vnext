// ============================================================================
// Octagon Commercial — Workflow v2 (P0.10)
// Pattern from erp-research/nocobase-main/docs/docs/en/workflow/ (collection
// and schedule triggers, sequential nodes and execution history) and
// octagon-erp/modules/automation-engine.js (safe, observable automation).
// Re-expressed for the local plain-Node + SQLite platform; no source code copied.
// ============================================================================
'use strict';

const crypto = require('crypto');

const API_BASE = '/api/x/workflows';
const FROZEN_ENTITY_PARTS = /(^|_)(employee|employees|timesheet|attendance|payroll)(_|$)/i;
const WRITE_NODE_TYPES = new Set(['update-record', 'create-record']);
const NODE_TYPES = new Set(['condition', 'update-record', 'create-record', 'request-approval', 'notify', 'webhook']);

function now() { return new Date().toISOString(); }
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function envelope(data, error, meta) { return { success: !error, data: error ? null : data, error: error || null, meta: meta || null }; }
function parse(value, fallback) { try { return value ? JSON.parse(value) : fallback; } catch (_) { return fallback; } }
function clean(value, limit = 4000) { return String(value == null ? '' : value).trim().slice(0, limit); }
function isFrozen(entity) { return FROZEN_ENTITY_PARTS.test(String(entity || '')); }
function safeJson(value) { return JSON.stringify(value == null ? {} : value); }

function ensureWorkflowTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS x_records (
      entity TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT, updated_at TEXT, created_by TEXT, removed INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (entity, id)
    );
    CREATE INDEX IF NOT EXISTS idx_x_records_entity_removed ON x_records(entity, removed);
    CREATE TABLE IF NOT EXISTS x_notifications (
      id TEXT PRIMARY KEY, user TEXT NOT NULL, title TEXT NOT NULL, body TEXT DEFAULT '',
      link TEXT DEFAULT '', read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS x_approvals (
      id TEXT PRIMARY KEY, entity TEXT NOT NULL, record_id TEXT NOT NULL, action TEXT NOT NULL,
      payload TEXT DEFAULT '{}', requester TEXT NOT NULL, approver_role TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', decided_by TEXT DEFAULT '', decided_at TEXT DEFAULT '',
      cc TEXT DEFAULT '[]', created_at TEXT NOT NULL
    );
  `);
}

function readBody(req, max = 256 * 1024) {
  return new Promise((resolve, reject) => {
    let text = '';
    req.on('data', part => { text += part; if (Buffer.byteLength(text) > max) reject(new Error('Payload too large')); });
    req.on('end', () => { try { resolve(text ? JSON.parse(text) : {}); } catch (_) { reject(new Error('Invalid JSON')); } });
    req.on('error', reject);
  });
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function userFrom(req, deps) {
  try {
    const session = deps.authSessionFromRequest && deps.authSessionFromRequest(req);
    if (session && (session.username || session.user || session.id)) return String(session.username || session.user || session.id);
  } catch (_) { /* fallback below */ }
  return String(req?.headers?.['x-user'] || 'local');
}

function getPath(source, dotted) {
  return String(dotted || '').split('.').filter(Boolean).reduce((value, key) => (
    value && typeof value === 'object' ? value[key] : undefined
  ), source);
}

function interpolate(input, context) {
  if (typeof input !== 'string') return input;
  return input.replace(/{{\s*([^}]+?)\s*}}/g, (_, path) => {
    const value = getPath(context, path);
    return value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
  });
}

function interpolateDeep(input, context) {
  if (typeof input === 'string') return interpolate(input, context);
  if (Array.isArray(input)) return input.map(value => interpolateDeep(value, context));
  if (input && typeof input === 'object') return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, interpolateDeep(value, context)]));
  return input;
}

function compare(actual, operator, expected) {
  if (operator === 'exists') return actual !== undefined && actual !== null && actual !== '';
  if (operator === 'not_exists') return actual === undefined || actual === null || actual === '';
  if (operator === 'in') return String(expected).split(',').map(x => x.trim()).includes(String(actual));
  if (operator === 'contains') return String(actual || '').includes(String(expected || ''));
  if (operator === 'gt') return Number(actual) > Number(expected);
  if (operator === 'gte') return Number(actual) >= Number(expected);
  if (operator === 'lt') return Number(actual) < Number(expected);
  if (operator === 'lte') return Number(actual) <= Number(expected);
  if (operator === 'neq') return String(actual) !== String(expected);
  return String(actual) === String(expected);
}

/**
 * Mount workflow HTTP endpoints and attach record-event triggers to P0.1.
 * deps: { db, crudEngine?, authSessionFromRequest?, schedulePollMs?, fetch? }
 */
function mountWorkflow(deps = {}) {
  if (!deps.db || typeof deps.db.prepare !== 'function') throw new Error('mountWorkflow requires a SQLite db handle');
  const db = deps.db;
  const fetchImpl = deps.fetch || globalThis.fetch;
  const read = deps.readRequestBody ? async req => {
    const raw = await deps.readRequestBody(req);
    return raw ? JSON.parse(raw) : {};
  } : readBody;
  ensureWorkflowTables(db);

  function getRecord(entity, recordId) {
    const row = db.prepare('SELECT id, data, created_at, updated_at, created_by FROM x_records WHERE entity = ? AND id = ? AND removed = 0').get(entity, recordId);
    return row ? { id: row.id, ...parse(row.data, {}), _meta: { created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by } } : null;
  }

  function putRecord(entity, recordId, data, actor = 'workflow') {
    const stamp = now();
    const existing = getRecord(entity, recordId);
    if (existing) {
      db.prepare('UPDATE x_records SET data = ?, updated_at = ? WHERE entity = ? AND id = ?').run(safeJson(data), stamp, entity, recordId);
    } else {
      db.prepare('INSERT INTO x_records(entity,id,data,created_at,updated_at,created_by,removed) VALUES(?,?,?,?,?,?,0)').run(entity, recordId, safeJson(data), stamp, stamp, actor);
    }
    return getRecord(entity, recordId);
  }

  function workflowRows() {
    return db.prepare('SELECT id, data, created_at, updated_at, created_by FROM x_records WHERE entity = ? AND removed = 0 ORDER BY updated_at DESC').all('workflow')
      .map(row => ({ id: row.id, ...parse(row.data, {}), _meta: { created_at: row.created_at, updated_at: row.updated_at, created_by: row.created_by } }));
  }

  function normalizeWorkflow(input, existing = {}) {
    const trigger = input.trigger && typeof input.trigger === 'object' ? input.trigger : (existing.trigger || {});
    const type = ['record', 'schedule', 'manual'].includes(trigger.type) ? trigger.type : 'manual';
    const nodes = Array.isArray(input.nodes) ? input.nodes.filter(node => node && NODE_TYPES.has(node.type)).slice(0, 40) : (existing.nodes || []);
    return {
      name: clean(input.name ?? existing.name ?? 'سير عمل جديد', 180),
      active: input.active === undefined ? (existing.active !== false) : input.active !== false,
      trigger: {
        type,
        entity: clean(trigger.entity, 100),
        event: ['created', 'updated', 'created_or_updated'].includes(trigger.event) ? trigger.event : 'created',
        condition: trigger.condition && typeof trigger.condition === 'object' ? trigger.condition : null,
        every_minutes: Math.max(1, Math.min(10080, Number(trigger.every_minutes || 60))),
        start_at: clean(trigger.start_at, 40),
      },
      nodes: nodes.map((node, index) => ({ id: clean(node.id || `step_${index + 1}`, 80), type: node.type, label: clean(node.label || '', 180), config: node.config && typeof node.config === 'object' ? node.config : {} })),
      last_scheduled_at: existing.last_scheduled_at || '',
      created_from: 'p0.10',
    };
  }

  function makeRun(workflow, trigger, context) {
    const run = { id: id('wfr'), workflow_id: workflow.id, workflow_name: workflow.name, status: 'running', trigger, context, logs: [], started_at: now(), finished_at: '' };
    putRecord('workflow_run', run.id, run);
    return run;
  }

  function saveRun(run) { run.updated_at = now(); putRecord('workflow_run', run.id, run); }
  function log(run, node, status, detail) {
    run.logs.push({ at: now(), node_id: node?.id || '', node_type: node?.type || '', status, detail: detail || '' });
    saveRun(run);
  }

  function conditionMatches(condition, context) {
    if (!condition || !condition.path) return true;
    return compare(getPath(context, condition.path), condition.operator || 'eq', interpolate(String(condition.value ?? ''), context));
  }

  function assertWritable(entity) {
    if (!entity) throw new Error('الكيان المستهدف مطلوب');
    if (isFrozen(entity)) throw new Error('الهدف محمي: لا تسمح الأتمتة بتعديل بيانات الموظفين أو الدوام أو الرواتب');
  }

  async function executeNode(node, context, run) {
    const config = interpolateDeep(node.config || {}, context);
    if (node.type === 'condition') {
      const match = conditionMatches(config, context);
      if (!match && config.stop_on_false !== false) throw new Error('لم يتحقق شرط خطوة سير العمل');
      return { match };
    }
    if (node.type === 'update-record') {
      assertWritable(config.entity);
      const recordId = clean(config.record_id || getPath(context, 'record.id'), 180);
      if (!recordId) throw new Error('معرف السجل المطلوب للتحديث مفقود');
      const current = getRecord(config.entity, recordId);
      if (!current) throw new Error('السجل المراد تحديثه غير موجود');
      const merged = { ...current, ...(config.values || {}) };
      delete merged._meta;
      // Keep node writes inside this executor. Calling the CRUD engine after a
      // direct write would produce a duplicate update and can recurse through
      // the record-trigger subscription indefinitely.
      const saved = putRecord(config.entity, recordId, merged, 'workflow');
      return { record: saved };
    }
    if (node.type === 'create-record') {
      assertWritable(config.entity);
      const recordId = clean(config.id || id(config.entity.replace(/[^a-z0-9]/gi, '_').toLowerCase()), 180);
      const saved = putRecord(config.entity, recordId, config.values || {}, 'workflow');
      return { record: saved };
    }
    if (node.type === 'notify') {
      const recipient = clean(config.user || (config.role ? `role:${config.role}` : ''), 180);
      if (!recipient) throw new Error('مستلم الإشعار مطلوب');
      const notification = { id: id('ntf'), user: recipient, title: clean(config.title || 'إشعار سير عمل', 300), body: clean(config.body || '', 4000), link: clean(config.link || '', 500), read: 0, created_at: now() };
      db.prepare('INSERT INTO x_notifications(id,user,title,body,link,read,created_at) VALUES(?,?,?,?,?,?,?)').run(notification.id, notification.user, notification.title, notification.body, notification.link, 0, notification.created_at);
      return { notification };
    }
    if (node.type === 'request-approval') {
      const entity = clean(config.entity || getPath(context, 'record.entity'), 100);
      const recordId = clean(config.record_id || getPath(context, 'record.id'), 180);
      if (!entity || !recordId) throw new Error('كيان وسجل طلب الموافقة مطلوبان');
      const approval = { id: id('apr'), entity, record_id: recordId, action: clean(config.action || 'workflow_action', 100), payload: config.payload || {}, requester: clean(config.requester || 'workflow', 120), approver_role: clean(config.approver_role || 'manager', 120), status: 'pending', cc: Array.isArray(config.cc) ? config.cc : [], created_at: now() };
      db.prepare('INSERT INTO x_approvals(id,entity,record_id,action,payload,requester,approver_role,status,decided_by,decided_at,cc,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(approval.id, approval.entity, approval.record_id, approval.action, safeJson(approval.payload), approval.requester, approval.approver_role, approval.status, '', '', safeJson(approval.cc), approval.created_at);
      return { approval };
    }
    if (node.type === 'webhook') {
      if (typeof fetchImpl !== 'function') throw new Error('ميزة webhook غير متاحة في هذا الإصدار من Node');
      const url = clean(config.url, 2000);
      if (!/^https?:\/\//i.test(url)) throw new Error('عنوان webhook يجب أن يبدأ بـ http:// أو https://');
      if (!config.allow_private && /^https?:\/\/(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(url)) throw new Error('عناوين webhook المحلية محظورة افتراضياً');
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(30000, Number(config.timeout_ms || 8000))));
      try {
        const response = await fetchImpl(url, { method: String(config.method || 'POST').toUpperCase(), headers: { 'Content-Type': 'application/json', ...(config.headers || {}) }, body: ['GET', 'HEAD'].includes(String(config.method || 'POST').toUpperCase()) ? undefined : safeJson(config.body || context), signal: controller.signal });
        const text = (await response.text()).slice(0, 4000);
        if (!response.ok && !config.ignore_failure) throw new Error(`Webhook returned ${response.status}`);
        return { status: response.status, body: text };
      } finally { clearTimeout(timer); }
    }
    throw new Error(`نوع خطوة غير مدعوم: ${node.type}`);
  }

  async function runWorkflow(workflow, trigger, context) {
    if (!workflow || workflow.active === false) return null;
    const run = makeRun(workflow, trigger, context || {});
    try {
      for (const node of workflow.nodes || []) {
        const result = await executeNode(node, context || {}, run);
        log(run, node, 'done', result);
      }
      run.status = 'completed'; run.finished_at = now(); saveRun(run);
    } catch (error) {
      run.status = 'failed'; run.error = error.message || String(error); run.finished_at = now();
      log(run, null, 'failed', run.error);
      saveRun(run);
    }
    return run;
  }

  function fireRecordEvent(entity, action, record) {
    if (entity === 'workflow' || entity === 'workflow_run') return;
    const event = action === 'create' ? 'created' : action === 'update' ? 'updated' : '';
    if (!event) return;
    for (const workflow of workflowRows()) {
      const trigger = workflow.trigger || {};
      if (workflow.active === false || trigger.type !== 'record' || trigger.entity !== entity) continue;
      if (trigger.event !== event && trigger.event !== 'created_or_updated') continue;
      const context = { record: { ...record, entity }, event: { entity, action: event, at: now() } };
      if (!conditionMatches(trigger.condition, context)) continue;
      void runWorkflow(workflow, 'record', context);
    }
  }

  function runDueSchedules(clock = Date.now()) {
    const due = [];
    for (const workflow of workflowRows()) {
      const trigger = workflow.trigger || {};
      if (workflow.active === false || trigger.type !== 'schedule') continue;
      const last = Date.parse(workflow.last_scheduled_at || trigger.start_at || 0);
      const minutes = Math.max(1, Number(trigger.every_minutes || 60));
      if (Number.isFinite(last) && last > 0 && clock - last < minutes * 60000) continue;
      workflow.last_scheduled_at = new Date(clock).toISOString();
      putRecord('workflow', workflow.id, withoutMeta(workflow), 'workflow-scheduler');
      due.push(runWorkflow(workflow, 'schedule', { schedule: { at: new Date(clock).toISOString() } }));
    }
    return Promise.all(due);
  }

  function withoutMeta(record) { const copy = { ...record }; delete copy.id; delete copy._meta; return copy; }
  if (deps.crudEngine?.subscribe) deps.crudEngine.subscribe(fireRecordEvent);
  const poll = setInterval(() => { void runDueSchedules(); }, Math.max(60000, Number(deps.schedulePollMs || 60000)));
  if (typeof poll.unref === 'function') poll.unref();

  async function dispatch(req, res, requestUrl) {
    const pathname = requestUrl.pathname;
    const parts = pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    try {
      if (req.method === 'GET' && parts[0] === 'list') {
        const page = Math.max(1, Number(requestUrl.searchParams.get('page') || 1)); const limit = Math.max(1, Math.min(100, Number(requestUrl.searchParams.get('limit') || 50)));
        const all = workflowRows(); send(res, 200, envelope(all.slice((page - 1) * limit, page * limit), null, { total: all.length, page, limit })); return true;
      }
      if (req.method === 'POST' && parts[0] === 'create') {
        const body = await read(req); const workflow = { id: id('wf'), ...normalizeWorkflow(body) }; putRecord('workflow', workflow.id, withoutMeta(workflow), userFrom(req, deps)); send(res, 201, envelope(workflow)); return true;
      }
      if (req.method === 'GET' && parts[0] === 'read' && parts[1]) { const workflow = getRecord('workflow', parts[1]); send(res, workflow ? 200 : 404, workflow ? envelope(workflow) : envelope(null, 'Workflow not found')); return true; }
      if (req.method === 'PATCH' && parts[0] === 'update' && parts[1]) {
        const current = getRecord('workflow', parts[1]); if (!current) { send(res, 404, envelope(null, 'Workflow not found')); return true; }
        const body = await read(req); const next = { id: current.id, ...normalizeWorkflow(body, current) }; putRecord('workflow', current.id, withoutMeta(next), userFrom(req, deps)); send(res, 200, envelope(next)); return true;
      }
      if (req.method === 'DELETE' && parts[0] === 'delete' && parts[1]) { db.prepare('UPDATE x_records SET removed = 1, updated_at = ? WHERE entity = ? AND id = ?').run(now(), 'workflow', parts[1]); send(res, 200, envelope({ id: parts[1], removed: true })); return true; }
      if (req.method === 'POST' && parts[0] === 'run' && parts[1]) { const workflow = getRecord('workflow', parts[1]); if (!workflow) { send(res, 404, envelope(null, 'Workflow not found')); return true; } const body = await read(req); const run = await runWorkflow(workflow, 'manual', { manual: body, record: body.record || {} }); send(res, 200, envelope(run)); return true; }
      if (req.method === 'GET' && parts[0] === 'runs' && parts[1]) { const rows = db.prepare('SELECT id,data FROM x_records WHERE entity = ? AND removed = 0 ORDER BY created_at DESC').all('workflow_run').map(row => ({ id: row.id, ...parse(row.data, {}) })).filter(run => run.workflow_id === parts[1]); send(res, 200, envelope(rows)); return true; }
      send(res, 404, envelope(null, 'Workflow endpoint not found')); return true;
    } catch (error) { send(res, 400, envelope(null, error.message || 'Workflow request failed')); return true; }
  }

  // server.js dispatchers require a synchronous boolean. The asynchronous body
  // is deliberately detached only after this module has claimed its own route;
  // returning a Promise here would incorrectly claim every server request.
  function handle(req, res, requestUrl) {
    const pathname = requestUrl?.pathname || '';
    if (!pathname.startsWith(API_BASE)) return false;
    void dispatch(req, res, requestUrl);
    return true;
  }

  return { handle, runWorkflow, runDueSchedules, fireRecordEvent, ensureWorkflowTables, stop() { clearInterval(poll); } };
}

module.exports = { mountWorkflow, ensureWorkflowTables, isFrozen, interpolate, compare };
