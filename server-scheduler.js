'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_CRON_JOBS = [
  { code: 'subscription_dunning', label: 'Subscription dunning drafts', intervalHours: 24 },
  { code: 'expiry_alerts', label: 'Vehicle/document/asset expiry alerts', intervalHours: 24 },
  { code: 'preventive_maintenance_due', label: 'Preventive maintenance due alerts', intervalHours: 24 },
  { code: 'nightly_backup_verify', label: 'Nightly backup and verification', intervalHours: 24 },
  { code: 'server_self_check', label: 'Daily server self-check', intervalHours: 24 },
];

const DEFAULT_POLL_MS = 15 * 60 * 1000;
const ALERT_COLLECTION = 'scheduled_alerts';
const OPEN_ALERT_STATUSES = new Set(['open', 'unread', 'new', '']);

function isoNow() {
  return new Date().toISOString();
}

function addHours(iso, hours) {
  const base = iso ? Date.parse(iso) : 0;
  if (!Number.isFinite(base) || base <= 0) return 0;
  return base + (Number(hours || 0) * 60 * 60 * 1000);
}

function safeString(value) {
  return String(value == null ? '' : value).trim();
}

function makeFallbackId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function getPath(obj, dotted) {
  return String(dotted || '').split('.').filter(Boolean).reduce((cur, key) => (
    cur && typeof cur === 'object' ? cur[key] : undefined
  ), obj);
}

function ensureArrayAt(db, key) {
  if (!Array.isArray(db[key])) db[key] = [];
  return db[key];
}

function daysUntil(value, today = new Date()) {
  if (!value) return null;
  const parsed = Date.parse(String(value).slice(0, 10));
  if (!Number.isFinite(parsed)) return null;
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  return Math.ceil((parsed - base.getTime()) / 86400000);
}

function expiryBucket(days) {
  if (days == null) return '';
  if (days < 0) return 'expired';
  if (days <= 3) return '3';
  if (days <= 14) return '14';
  if (days <= 30) return '30';
  return '';
}

function firstDate(record, fields) {
  for (const field of fields) {
    if (record && record[field]) return { field, value: record[field] };
  }
  return null;
}

function entityName(record) {
  return safeString(record?.name || record?.title || record?.plate || record?.ref || record?.number || record?.id || 'سجل');
}

function collectArrays(db, paths) {
  return paths.flatMap(source => {
    const arr = getPath(db, source);
    return Array.isArray(arr) ? arr.map(record => ({ source, record })) : [];
  });
}

function alertRecord(ctx, jobCode, input) {
  const now = isoNow();
  return {
    id: (ctx.makeId && ctx.makeId('sched_alert')) || makeFallbackId('sched_alert'),
    code: input.code || `${jobCode}_${Date.now()}`,
    jobCode,
    source: 'server_scheduler',
    status: 'open',
    severity: input.severity || 'info',
    title: input.title || 'تنبيه مجدول',
    message: input.message || '',
    actionPage: input.actionPage || 'command_center',
    sourceType: input.sourceType || 'scheduler',
    sourceId: input.sourceId || '',
    dedupeKey: input.dedupeKey || `${jobCode}:${input.sourceId || input.title || now}`,
    payload: input.payload || {},
    createdAt: now,
    updatedAt: now,
  };
}

function appendScheduledAlerts(ctx, db, jobCode, alerts) {
  if (!alerts.length) return { created: 0, refreshed: 0 };
  const target = ensureArrayAt(db, ALERT_COLLECTION);
  let created = 0;
  let refreshed = 0;
  for (const input of alerts) {
    const next = alertRecord(ctx, jobCode, input);
    const existing = target.find(item => (
      item && item.dedupeKey === next.dedupeKey && OPEN_ALERT_STATUSES.has(String(item.status || '').toLowerCase())
    ));
    if (existing) {
      existing.lastSeenAt = next.createdAt;
      existing.updatedAt = next.createdAt;
      existing.seenCount = Number(existing.seenCount || 1) + 1;
      refreshed += 1;
    } else {
      target.unshift(next);
      created += 1;
    }
  }
  target.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  return { created, refreshed };
}

function subscriptionDunningAlerts(db) {
  const rows = collectArrays(db, [
    'subscriptions',
    'omni.subscriptions',
    'finance.subscriptions',
    'omni.subscriptionContracts',
  ]);
  const alerts = [];
  for (const { source, record } of rows) {
    const status = safeString(record.status || record.state).toLowerCase();
    if (['cancelled', 'canceled', 'closed', 'done', 'inactive'].includes(status)) continue;
    const due = firstDate(record, ['nextBillingDate', 'nextInvoiceDate', 'dueDate', 'renewalDate', 'endDate']);
    const days = daysUntil(due?.value);
    if (days == null || days > 14) continue;
    const severity = days < 0 ? 'danger' : days <= 3 ? 'warning' : 'info';
    alerts.push({
      severity,
      title: days < 0 ? 'اشتراك متأخر عن الفوترة' : 'اشتراك يقترب موعده',
      message: `${entityName(record)} - ${days < 0 ? `متأخر ${Math.abs(days)} يوم` : `خلال ${days} يوم`}`,
      actionPage: 'subscriptions',
      sourceType: 'subscription',
      sourceId: safeString(record.id),
      dedupeKey: `subscription:${record.id || entityName(record)}:${due.field}:${due.value}`,
      payload: { source, dueField: due.field, dueDate: due.value, days },
    });
  }
  return alerts;
}

function expiryAlerts(db) {
  const rows = collectArrays(db, [
    'documents',
    'omni.documents',
    'assets',
    'omni.assets',
    'vehicles',
    'omni.vehicles',
    'fleet.vehicles',
    'omni.fleet.vehicles',
  ]);
  const fields = ['expiryDate', 'expiresAt', 'licenseExpiry', 'insuranceExpiry', 'warrantyExpiry', 'registrationExpiry', 'contractEndDate'];
  const alerts = [];
  for (const { source, record } of rows) {
    for (const field of fields) {
      const value = record?.[field];
      const days = daysUntil(value);
      const bucket = expiryBucket(days);
      if (!bucket) continue;
      const expired = days < 0;
      alerts.push({
        severity: expired ? 'danger' : bucket === '3' ? 'warning' : 'info',
        title: expired ? 'مستند أو أصل منتهي' : 'تنبيه انتهاء مستند أو أصل',
        message: `${entityName(record)} - ${expired ? `منتهي منذ ${Math.abs(days)} يوم` : `ينتهي خلال ${days} يوم`}`,
        actionPage: source.includes('vehicle') || source.includes('fleet') ? 'fleet' : source.includes('asset') ? 'assets' : 'documents',
        sourceType: 'expiry',
        sourceId: safeString(record.id),
        dedupeKey: `expiry:${source}:${record.id || entityName(record)}:${field}:${value}:${bucket}`,
        payload: { source, field, date: value, days },
      });
    }
  }
  return alerts;
}

function maintenanceAlerts(db) {
  const rows = collectArrays(db, [
    'maintenance_requests',
    'omni.maintenanceRequests',
    'machines',
    'omni.machines',
    'assets',
    'omni.assets',
  ]);
  const fields = ['nextMaintenanceDate', 'nextServiceDate', 'serviceDueDate', 'maintenanceDueDate'];
  const alerts = [];
  for (const { source, record } of rows) {
    const due = firstDate(record, fields);
    const days = daysUntil(due?.value);
    if (days == null || days > 14) continue;
    const overdue = days < 0;
    alerts.push({
      severity: overdue ? 'danger' : days <= 3 ? 'warning' : 'info',
      title: overdue ? 'صيانة وقائية متأخرة' : 'صيانة وقائية قريبة',
      message: `${entityName(record)} - ${overdue ? `متأخرة ${Math.abs(days)} يوم` : `خلال ${days} يوم`}`,
      actionPage: source.includes('machine') ? 'machines' : 'asset_maintenance',
      sourceType: 'maintenance',
      sourceId: safeString(record.id),
      dedupeKey: `maintenance:${source}:${record.id || entityName(record)}:${due.field}:${due.value}`,
      payload: { source, dueField: due.field, dueDate: due.value, days },
    });
  }
  return alerts;
}

function selfCheckAlerts(ctx, db) {
  const alerts = [];
  const employees = Array.isArray(db.employees) ? db.employees.length : 0;
  const moves = Array.isArray(db.account_moves) ? db.account_moves.length : 0;
  const scheduled = Array.isArray(db[ALERT_COLLECTION]) ? db[ALERT_COLLECTION].length : 0;
  const sqliteFile = ctx.sqliteDbFile || '';
  const sqliteBytes = sqliteFile && fs.existsSync(sqliteFile) ? fs.statSync(sqliteFile).size : 0;
  if (employees <= 0) {
    alerts.push({
      severity: 'danger',
      title: 'فحص الخادم: لا توجد بيانات موظفين',
      message: 'قراءة قاعدة البيانات أعادت صفر موظفين. أوقف أي حفظ كامل وراجع قاعدة البيانات.',
      actionPage: 'route_health',
      sourceType: 'server_self_check',
      dedupeKey: 'selfcheck:employees-empty',
      payload: { employees },
    });
  }
  if (sqliteFile && sqliteBytes <= 0) {
    alerts.push({
      severity: 'danger',
      title: 'فحص الخادم: ملف SQLite غير مقروء',
      message: `تعذر قراءة حجم قاعدة SQLite: ${path.basename(sqliteFile)}`,
      actionPage: 'deploy_ready',
      sourceType: 'server_self_check',
      dedupeKey: 'selfcheck:sqlite-empty',
      payload: { sqliteFile },
    });
  }
  return {
    alerts,
    metrics: { employees, accountMoves: moves, scheduledAlerts: scheduled, sqliteBytes },
  };
}

function backupVerifyAlerts(ctx) {
  const alerts = [];
  const details = {};
  try {
    if (typeof ctx.createDatabaseBackup === 'function') {
      details.created = ctx.createDatabaseBackup('scheduler');
    }
    if (typeof ctx.backupStatusSnapshot === 'function') {
      details.status = ctx.backupStatusSnapshot();
    }
    if (!details.created && !details.status?.latest) {
      alerts.push({
        severity: 'warning',
        title: 'النسخ الاحتياطي المجدول يحتاج ربط',
        message: 'لم يستلم المجدول دوال النسخ الاحتياطي من الخادم بعد. أضفها في ربط server.js.',
        actionPage: 'deploy_ready',
        sourceType: 'backup',
        dedupeKey: 'backup:helpers-missing',
        payload: { hasCreate: typeof ctx.createDatabaseBackup === 'function', hasStatus: typeof ctx.backupStatusSnapshot === 'function' },
      });
    }
  } catch (error) {
    alerts.push({
      severity: 'danger',
      title: 'فشل النسخ الاحتياطي المجدول',
      message: error.message || 'تعذر إنشاء أو فحص النسخة الاحتياطية.',
      actionPage: 'deploy_ready',
      sourceType: 'backup',
      dedupeKey: `backup:error:${error.message || 'unknown'}`,
      payload: { error: error.message || String(error) },
    });
  }
  return { alerts, details };
}

function readBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > maxBytes) reject(new Error('Payload too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function localSendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.writeHead(status);
  res.end(JSON.stringify(payload));
}

function installOctagonScheduler(context = {}) {
  const ctx = { ...context };
  const sendJson = ctx.sendJson || localSendJson;
  const readRequestBody = ctx.readRequestBody || readBody;
  const memoryJobs = new Map(DEFAULT_CRON_JOBS.map(job => [job.code, {
    code: job.code,
    label: job.label,
    interval_hours: job.intervalHours,
    last_run: '',
    enabled: 1,
  }]));

  function sqliteReady() {
    return !!ctx.sqliteDb && typeof ctx.sqliteDb.prepare === 'function' && typeof ctx.sqliteDb.exec === 'function';
  }

  function ensureTables() {
    if (!sqliteReady()) return;
    ctx.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS cron_jobs (
        code TEXT PRIMARY KEY,
        label TEXT,
        interval_hours REAL,
        last_run TEXT,
        enabled INTEGER DEFAULT 1,
        updated_at TEXT
      );
    `);
    const insert = ctx.sqliteDb.prepare(`
      INSERT OR IGNORE INTO cron_jobs (code, label, interval_hours, last_run, enabled, updated_at)
      VALUES (?, ?, ?, '', 1, ?)
    `);
    const now = isoNow();
    DEFAULT_CRON_JOBS.forEach(job => insert.run(job.code, job.label, job.intervalHours, now));
  }

  function listJobs() {
    if (!sqliteReady()) return [...memoryJobs.values()];
    ensureTables();
    return ctx.sqliteDb.prepare('SELECT code, label, interval_hours, last_run, enabled, updated_at FROM cron_jobs ORDER BY code').all();
  }

  function updateJobRun(code, status) {
    const now = isoNow();
    if (sqliteReady()) {
      ensureTables();
      ctx.sqliteDb.prepare('UPDATE cron_jobs SET last_run = ?, updated_at = ? WHERE code = ?').run(now, now, code);
    } else if (memoryJobs.has(code)) {
      const job = memoryJobs.get(code);
      job.last_run = now;
      job.updated_at = now;
      memoryJobs.set(code, job);
    }
    return { code, lastRun: now, status };
  }

  function loadDb() {
    if (typeof ctx.loadDbForMutation !== 'function') throw new Error('Scheduler missing loadDbForMutation helper');
    return ctx.loadDbForMutation();
  }

  function saveDb(db) {
    if (typeof ctx.saveDb !== 'function') throw new Error('Scheduler missing saveDb helper');
    ctx.saveDb(db);
  }

  function buildAlertsForJob(code, db) {
    if (code === 'subscription_dunning') return { alerts: subscriptionDunningAlerts(db), details: {} };
    if (code === 'expiry_alerts') return { alerts: expiryAlerts(db), details: {} };
    if (code === 'preventive_maintenance_due') return { alerts: maintenanceAlerts(db), details: {} };
    if (code === 'nightly_backup_verify') return backupVerifyAlerts(ctx);
    if (code === 'server_self_check') {
      const result = selfCheckAlerts(ctx, db);
      return { alerts: result.alerts, details: result.metrics };
    }
    throw new Error(`Unknown cron job: ${code}`);
  }

  function runJob(code, options = {}) {
    ensureTables();
    const job = listJobs().find(item => item.code === code);
    if (!job) throw new Error(`Unknown cron job: ${code}`);
    if (!options.force && Number(job.enabled) !== 1) {
      return { ok: true, skipped: true, reason: 'disabled', job };
    }
    const db = loadDb();
    const built = buildAlertsForJob(code, db);
    const result = appendScheduledAlerts(ctx, db, code, built.alerts || []);
    if (result.created || result.refreshed) saveDb(db);
    updateJobRun(code, 'ok');
    return {
      ok: true,
      code,
      forced: !!options.force,
      generated: built.alerts.length,
      created: result.created,
      refreshed: result.refreshed,
      details: built.details || {},
    };
  }

  function runDueJobs() {
    const now = Date.now();
    const due = listJobs().filter(job => (
      Number(job.enabled) === 1 && (!job.last_run || addHours(job.last_run, Number(job.interval_hours || 24)) <= now)
    ));
    return due.map(job => {
      try {
        return runJob(job.code);
      } catch (error) {
        return { ok: false, code: job.code, error: error.message || String(error) };
      }
    });
  }

  function authorize(req, res) {
    if (typeof ctx.isLocalRequest === 'function' && ctx.isLocalRequest(req)) return true;
    if (typeof ctx.requireRoleSession === 'function') {
      const guard = ctx.requireRoleSession(req, res, ['system.admin', 'finance.manager']);
      return !!guard?.ok;
    }
    sendJson(res, 403, { ok: false, error: 'Scheduler API requires local access or system/finance role' });
    return false;
  }

  function dismissAlert(id) {
    const db = loadDb();
    const alerts = ensureArrayAt(db, ALERT_COLLECTION);
    const alert = alerts.find(item => item && item.id === id);
    if (!alert) return { ok: false, status: 404, error: 'Scheduled alert not found' };
    alert.status = 'dismissed';
    alert.dismissedAt = isoNow();
    alert.updatedAt = alert.dismissedAt;
    saveDb(db);
    return { ok: true, alert };
  }

  function handle(req, res, requestUrl) {
    if (!requestUrl || !requestUrl.pathname.startsWith('/api/cron/')) return false;
    if (!authorize(req, res)) return true;
    if (requestUrl.pathname === '/api/cron/status' && req.method === 'GET') {
      const db = loadDb();
      const alerts = Array.isArray(db[ALERT_COLLECTION]) ? db[ALERT_COLLECTION] : [];
      return sendJson(res, 200, {
        ok: true,
        jobs: listJobs(),
        alerts: {
          total: alerts.length,
          open: alerts.filter(item => OPEN_ALERT_STATUSES.has(String(item.status || '').toLowerCase())).length,
        },
      });
    }
    if (requestUrl.pathname === '/api/cron/run' && req.method === 'POST') {
      readRequestBody(req).then(body => {
        let parsed = {};
        try { parsed = body ? JSON.parse(body) : {}; } catch (_) { return sendJson(res, 400, { ok: false, error: 'Invalid JSON' }); }
        const code = safeString(parsed.code);
        if (!code) return sendJson(res, 400, { ok: false, error: 'Missing cron job code' });
        try {
          return sendJson(res, 200, runJob(code, { force: true }));
        } catch (error) {
          return sendJson(res, 400, { ok: false, error: error.message || 'Cron job failed' });
        }
      }).catch(error => sendJson(res, error.message === 'Payload too large' ? 413 : 500, { ok: false, error: error.message || 'Failed to read request body' }));
      return true;
    }
    if (requestUrl.pathname === '/api/cron/alerts/dismiss' && req.method === 'POST') {
      readRequestBody(req).then(body => {
        let parsed = {};
        try { parsed = body ? JSON.parse(body) : {}; } catch (_) { return sendJson(res, 400, { ok: false, error: 'Invalid JSON' }); }
        const result = dismissAlert(safeString(parsed.id));
        return sendJson(res, result.status || (result.ok ? 200 : 400), result);
      }).catch(error => sendJson(res, error.message === 'Payload too large' ? 413 : 500, { ok: false, error: error.message || 'Failed to read request body' }));
      return true;
    }
    sendJson(res, 404, { ok: false, error: 'Unknown scheduler endpoint' });
    return true;
  }

  ensureTables();
  const disabled = process.env.OCTAGON_SCHEDULER_DISABLED === 'true' || ctx.disabled === true;
  const pollMs = Number(ctx.pollMs || process.env.OCTAGON_SCHEDULER_POLL_MS || DEFAULT_POLL_MS);
  const timer = disabled ? null : setInterval(() => {
    try { runDueJobs(); } catch (error) { console.warn('Octagon scheduler loop failed:', error.message || error); }
  }, pollMs);
  if (timer && typeof timer.unref === 'function') timer.unref();

  return {
    handle,
    listJobs,
    runJob,
    runDueJobs,
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}

module.exports = {
  ALERT_COLLECTION,
  DEFAULT_CRON_JOBS,
  installOctagonScheduler,
};
