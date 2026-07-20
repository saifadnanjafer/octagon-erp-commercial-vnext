// Load environment variables from .env file.
// Security hardening 2026-07-05: load from __dirname (not process.cwd()) so
// provider keys resolve no matter which directory the server is launched from.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');

// Reliability hardening (2026-07-12): this process has no supervisor
// (no PM2/systemd auto-restart) — before this handler, ANY unhandled
// exception in ANY request path (a double res.writeHead from a slow
// static-file read racing a client abort, a bug in a future module, etc.)
// killed the entire Node process, taking the whole app down for every
// user until someone noticed and manually restarted it. Observed live
// during this session: an ERR_HTTP_HEADERS_SENT in the static-file
// fs.readFile callback crashed the server outright. Log and keep serving
// — a single malformed HTTP response is recoverable; a dead process
// serving nobody is strictly worse for a live single-tenant workshop app.
const CRASH_LOG_FILE = process.env.OCTAGON_CRASH_LOG ? path.resolve(process.env.OCTAGON_CRASH_LOG) : path.join(__dirname, 'server-crash.log');
function logUnhandledError(kind, error) {
  const detail = error instanceof Error ? (error.stack || error.message) : String(error);
  console.error(`[${kind}] `, detail);
  try {
    fs.appendFileSync(CRASH_LOG_FILE, JSON.stringify({ at: new Date().toISOString(), kind, detail }) + '\n');
  } catch (_) { /* logging must never itself throw */ }
}
process.on('uncaughtException', error => logUnhandledError('uncaughtException', error));
process.on('unhandledRejection', reason => logUnhandledError('unhandledRejection', reason));
// Security hardening 2026-07-05: server-side Jarvis tool gate + AI key proxy.
const jarvisSecurity = require('./server-jarvis-security');
// T3.1: server-side scheduler (ir.cron equivalent) — read-only notification
// generators only, never posts finance/payroll directly (AI-governance
// philosophy: deterministic-first, approval-gated writes).
const { installOctagonScheduler } = require('./server-scheduler');

let DatabaseSync;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch (e) {
  console.warn('node:sqlite not supported in this Node.js version, SQLite mode disabled.');
}

const DEFAULT_PORT = Number(process.env.OCTAGON_DEFAULT_PORT || 8080);
const REQUESTED_PORT = Number(process.env.PORT || DEFAULT_PORT);
const FALLBACK_PORTS = String(process.env.OCTAGON_FALLBACK_PORTS || '8091,8092,8093,8094,8095')
  .split(',')
  .map(value => Number(value.trim()))
  .filter(value => Number.isInteger(value) && value > 0 && value !== REQUESTED_PORT);
let ACTIVE_PORT = REQUESTED_PORT;
let PORT = REQUESTED_PORT;
let FALLBACK_PORT_USED = false;
let PORT_WARNING = '';
let DEFAULT_PORT_PROBE = { checkedAt: '', occupied: null, error: '' };
const DB_FILE = process.env.OCTAGON_DB_FILE ? path.resolve(process.env.OCTAGON_DB_FILE) : path.join(__dirname, 'database.json');
const DB_PREV_FILE = DB_FILE + '.prev';
const SQLITE_DB_FILE = process.env.OCTAGON_SQLITE_DB_FILE ? path.resolve(process.env.OCTAGON_SQLITE_DB_FILE) : path.join(__dirname, 'database.db');
const VNEXT_PRODUCTION_ROOT = path.resolve(process.env.OCTAGON_PRODUCTION_ROOT || path.join(__dirname, '..', 'octagon-erp'));
const VNEXT_PRODUCTION_JSON_DB = path.resolve(process.env.OCTAGON_PRODUCTION_DB_FILE || path.join(VNEXT_PRODUCTION_ROOT, 'database.json'));
const VNEXT_PRODUCTION_SQLITE_DB = path.resolve(process.env.OCTAGON_PRODUCTION_SQLITE_DB_FILE || path.join(VNEXT_PRODUCTION_ROOT, 'database.db'));
const VNEXT_FORBIDDEN_DATABASE_PATHS = new Set([VNEXT_PRODUCTION_JSON_DB, VNEXT_PRODUCTION_SQLITE_DB]);
if (VNEXT_FORBIDDEN_DATABASE_PATHS.has(DB_FILE) || VNEXT_FORBIDDEN_DATABASE_PATHS.has(SQLITE_DB_FILE)) {
  process.exitCode = 1;
  throw new Error(`VNext startup guard refused a production database path. JSON=${DB_FILE}; SQLite=${SQLITE_DB_FILE}`);
}
const SQLITE_DISABLED = process.env.USE_SQLITE === 'false';
const USE_SQLITE = !SQLITE_DISABLED && (process.env.USE_SQLITE === 'true' || fs.existsSync(SQLITE_DB_FILE)) && !!DatabaseSync;

let dbSync = null;
const BACKUP_KEEP = 30;
const AUTO_BACKUP_INTERVAL_MS = 60 * 60 * 1000; // at most one auto-snapshot per hour of activity
let lastAutoBackupMs = 0;
const BACKUP_TAG_RE = /[^a-z0-9_]/gi;
// T1.5: nightly backup cycle keeps the last 14 SCHEDULER-tagged snapshots and
// logs each run to server-backup.log. Kept tag-scoped so it never trims the
// hourly auto-backup set (keep 30) or manual snapshots.
const NIGHTLY_BACKUP_KEEP = 14;
const BACKUP_LOG_FILE = process.env.OCTAGON_BACKUP_LOG ? path.resolve(process.env.OCTAGON_BACKUP_LOG) : path.join(__dirname, 'server-backup.log');
const BACKUP_DIR = process.env.OCTAGON_BACKUP_DIR ? path.resolve(process.env.OCTAGON_BACKUP_DIR) : __dirname;
const REVIEW_REPORT_DIR = process.env.OCTAGON_REVIEW_REPORT_DIR ? path.resolve(process.env.OCTAGON_REVIEW_REPORT_DIR) : path.join(__dirname, 'review-reports');
const UPLOADS_DIR = process.env.OCTAGON_UPLOAD_DIR ? path.resolve(process.env.OCTAGON_UPLOAD_DIR) : path.join(__dirname, 'uploads');
const AUTH_SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const authSessions = new Map();
const authFailures = new Map();

// Session persistence (2026-07-05): authSessions used to live ONLY in this
// in-memory Map, so every server restart silently invalidated all cookies —
// the client still looked logged-in (localStorage user) but every protected
// API call failed with 401 "Login session required" (bit Saif mid-payroll).
// Sessions are now write-through mirrored to the SQLite `auth_sessions`
// table and restored on boot. Best-effort: if SQLite is down we degrade to
// the old in-memory behavior rather than blocking logins.
function persistAuthSession(token, session) {
  try {
    if (dbSync) dbSync.prepare('INSERT OR REPLACE INTO auth_sessions (token, userId, createdAt, expiresAt) VALUES (?, ?, ?, ?)')
      .run(token, session.userId || '', session.createdAt || Date.now(), session.expiresAt || 0);
  } catch (_) {}
}
function deletePersistedAuthSession(token) {
  try { if (dbSync) dbSync.prepare('DELETE FROM auth_sessions WHERE token = ?').run(token); } catch (_) {}
}
function restoreAuthSessionsFromDb() {
  if (!dbSync) return;
  try {
    dbSync.prepare('DELETE FROM auth_sessions WHERE expiresAt <= ?').run(Date.now());
    const rows = dbSync.prepare('SELECT token, userId, createdAt, expiresAt FROM auth_sessions').all();
    rows.forEach(row => authSessions.set(row.token, {
      userId: row.userId,
      createdAt: Number(row.createdAt) || Date.now(),
      expiresAt: Number(row.expiresAt) || 0,
    }));
    if (rows.length) console.log(`Auth: restored ${rows.length} login session(s) from SQLite (survive restarts)`);
  } catch (e) {
    console.warn('Auth: session restore failed:', e.message);
  }
}
const V5_PRESERVED_TOP_LEVEL_KEYS = [
  '_schema_version',
  '_migrated_at',
  '_release_tag',
  '_release_tagged_at',
  '_lock_date',
  'contacts',
  'departments',
  'users',
  'locations',
  'quants',
  'stock_moves',
  'transfers',
  'journals',
  'journal_entries',
  'account_moves',
  'account_payments',
  'account_partial_reconciles',
  'employee_advances',
  'payroll_periods',
  'employee_payroll_closings',
  'payroll_payments',
  'payroll_adjustments',
  'payments',
  'maintenance_requests',
  'production_orders',
  'work_orders',
  'audit_log',
];

// T1.3 (AGENT_EXECUTION_PLAN.md Phase 1): the SERVER_TENANT_COLLECTIONS
// protection below only runs when getOrgSettings().multiTenant is true
// (tenantEnabledForWrite) — for a single-tenant deployment like this
// workshop, that entire layer is a no-op, so finance/account_moves/
// jobOrders currently have ZERO protection against a partial POST wiping
// them (only employees has a dedicated unconditional check, below). This
// list is intentionally tenant-INDEPENDENT: it always applies, regardless
// of multiTenant mode. `path` is dot-notation resolved via getNestedPath/
// setNestedPath (already defined above).
const HARD_PROTECTED_COLLECTIONS = [
  { path: 'employees', label: 'employees' },
  { path: 'account_moves', label: 'account_moves' },
  { path: 'finance.customers', label: 'finance.customers' },
  { path: 'finance.transactions', label: 'finance.transactions' },
  { path: 'finance.accounts', label: 'finance.accounts' },
  { path: 'omni.jobOrders', label: 'omni.jobOrders' },
];

const WRITE_GUARD_LOG_FILE = path.join(__dirname, 'server-write-guard.log');
function logWriteGuardRejection(reason, detail, req) {
  try {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      reason,
      detail,
      remoteAddress: req?.socket?.remoteAddress || '',
      userAgent: req?.headers?.['user-agent'] || '',
    }) + '\n';
    fs.appendFileSync(WRITE_GUARD_LOG_FILE, line);
  } catch (e) {
    console.warn('[write-guard] failed to write server-write-guard.log:', e.message);
  }
}

// T3.3 (server half): coarse role x collection write enforcement using
// acl.json (client mirror: modules/acl-client.js). Loaded once at startup;
// acl.json is small and hand-edited, not worth hot-reloading.
let ACL_MATRIX = { groups: {}, roles: {}, roleAliases: {}, defaultRole: 'viewer' };
try {
  ACL_MATRIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'acl.json'), 'utf8'));
} catch (e) {
  console.warn('[acl] failed to load acl.json, ACL enforcement disabled (fail-open to avoid blocking all writes on a config typo):', e.message);
}
const ACL_ENABLED = !!(ACL_MATRIX.groups && Object.keys(ACL_MATRIX.groups).length);

// Explicit override for this app's known seed users (phase6d_seed, see
// omni.users/omni.roles): their real `groups` (from enrichAuthUser) don't
// all resolve cleanly onto acl.json's role keys — operator_user's group is
// "workshop.user" (not an ACL role), and employee_user/viewer_user have
// EMPTY groups arrays. Falling through to acl.json's generic alias system
// for these specific users would silently downgrade finance_manager/
// workshop_manager (whose groups list happens not to match glancing at
// role name casing in some code paths) to defaultRole "viewer" — verified
// live against the actual seeded data before writing this. userId is the
// most reliable signal for the known accounts; acl.json's own
// roles/roleAliases still apply for any other/future user.
const ACL_SEED_USER_ROLE_OVERRIDES = {
  system_admin: 'system.admin',
  finance_manager: 'finance.manager',
  workshop_manager: 'workshop.manager',
  operator_user: 'employee',
  employee_user: 'employee',
  viewer_user: 'viewer',
};

function resolveAclRole(session) {
  if (!ACL_ENABLED) return null;
  if (session.userId && ACL_SEED_USER_ROLE_OVERRIDES[session.userId]) {
    return ACL_SEED_USER_ROLE_OVERRIDES[session.userId];
  }
  const groups = Array.isArray(session.groups) ? session.groups : [];
  const direct = groups.find(g => ACL_MATRIX.roles && ACL_MATRIX.roles[g]);
  if (direct) return direct;
  for (const g of groups) {
    const alias = ACL_MATRIX.roleAliases && ACL_MATRIX.roleAliases[g];
    if (alias && ACL_MATRIX.roles && ACL_MATRIX.roles[alias]) return alias;
  }
  return ACL_MATRIX.defaultRole || 'viewer';
}

function aclGroupForCollection(collectionPath) {
  const key = String(collectionPath || '');
  let best = null;
  Object.keys(ACL_MATRIX.groups || {}).forEach(group => {
    (ACL_MATRIX.groups[group].collections || []).forEach(prefix => {
      if (key === prefix || key.startsWith(`${prefix}.`)) {
        if (!best || String(prefix).length > String(best.prefix).length) best = { group, prefix };
      }
    });
  });
  return best ? best.group : '';
}

const ACL_ACCESS_RANK = { none: 0, read: 1, write: 2 };
function aclCan(role, group, action) {
  if (!ACL_ENABLED || !group) return true; // no matrix loaded, or collection isn't ACL-mapped -> not this gate's concern
  const policy = (ACL_MATRIX.roles && ACL_MATRIX.roles[role]) || (ACL_MATRIX.roles && ACL_MATRIX.roles[ACL_MATRIX.defaultRole]) || {};
  const have = ACL_ACCESS_RANK[policy[group]] ?? 0;
  const need = ACL_ACCESS_RANK[action] ?? 2;
  return have >= need;
}

const ACL_LOG_FILE = path.join(__dirname, 'server-acl.log');
function logAclRejection(detail) {
  try {
    fs.appendFileSync(ACL_LOG_FILE, JSON.stringify({ at: new Date().toISOString(), ...detail }) + '\n');
  } catch (e) {
    console.warn('[acl] failed to write server-acl.log:', e.message);
  }
}

const SERVER_TENANT_COLLECTIONS = new Set([
  'employees',
  'contacts',
  'users',
  'stock_moves',
  'quants',
  'transfers',
  'account_moves',
  'journal_entries',
  'account_payments',
  'account_partial_reconciles',
  'employee_advances',
  'payroll_periods',
  'employee_payroll_closings',
  'payroll_payments',
  'payroll_adjustments',
  'finance.customers',
  'finance.transactions',
  'finance.receipts',
  'omni.finance.customers',
  'omni.finance.transactions',
  'omni.finance.receipts',
  'omni.materials',
  'omni.suppliers',
  'omni.purchaseOrders',
  'omni.lots',
  'omni.jobOrders',
  'omni.workOrderIssues',
  'omni.approvalHub.requests',
  'omni.helpdesk.tickets',
  'omni.fieldService.visits',
  'omni.projectHub.projects',
  'omni.projectHub.tasks',
  'omni.assetRegister.assets',
  'omni.assetRegister.maintenanceLogs',
  'omni.subscriptionHub.plans',
  'omni.subscriptionHub.subscriptions',
  'omni.subscriptionHub.invoices',
  'omni.rentalHub.items',
  'omni.rentalHub.agreements',
  'omni.fleet.vehicles',
  'omni.fleet.fuelLogs',
  'omni.fleet.trips',
  'omni.documents.docs',
  'omni.marketing.campaigns',
  'omni.budgeting.lines',
  'omni.warrantyHub.warranties',
  'omni.warrantyHub.claims',
  'omni.enterpriseSuite.banking.records',
  'omni.enterpriseSuite.ar_ap.records',
  'omni.enterpriseSuite.contracts.records',
  'omni.enterpriseSuite.logistics.records',
  'omni.enterpriseSuite.supplier_portal.records',
  'omni.enterpriseSuite.integration_hub.records',
  'omni.enterpriseSuite.security_center.records',
  'omni.enterpriseSuite.data_quality.records',
  'omni.enterpriseSuite.training_lms.records',
  'omni.enterpriseSuite.scenario_planner.records',
  'omni.enterpriseSuite.device_center.records',
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.mp4': 'video/mp4',
  '.webp': 'image/webp',
};

// Explicit static-asset allowlist gate (2026-07-18 R1 integration —
// "Blocker: static file allowlist"). The handler below this point used to
// serve ANY path under __dirname with zero restriction: .env, *.db files,
// database.json, migration backups, this server's own source, everything.
// isStaticPathSafe() is the single choke point every static GET must pass:
// traversal/null-byte/dotfile paths are rejected outright, then a small,
// explicit set of known-sensitive top-level directories/files/extensions is
// denied. Everything else (the existing app shell, modules/, views/, shell/,
// platform/, vnext/client/, etc.) continues to be served exactly as before —
// enumerating every one of the legacy app's ~150 legitimate static files
// would be infeasible without risking silently breaking the live app; this
// denies the specific, well-understood sensitive surface instead.
const STATIC_DENY_TOP_LEVEL = new Set([
  'node_modules', 'scripts', 'migrations', 'vnext-data', 'vnext-backups',
  'vnext-migration-backups', 'vnext-fixtures', 'vnext-runtime', 'vnext-uploads',
  'vnext-attachments', 'vnext-review-reports', 'octagon-erp-commercial-vnext',
  'COMPANY', 'docs', '.git', '.github', '.vscode', '.claude', '.codex-runtime',
  '.backups', '.verify-scratch',
]);
const STATIC_DENY_EXACT_FILES = new Set([
  '.env', '.env.example', 'database.json', 'database.db', 'database.db-wal', 'database.db-shm',
  'server.js', 'server-crash.log', 'server-write-guard.log', 'server-ai-approvals.json',
  'server-jarvis-kb-rag.js', 'server-jarvis-security.js', 'server-jarvis-snapshot.js',
  'server-jarvis-tools.js', 'server-jarvis-ui-policy.js', 'server-jarvis-verification.js',
  'server-scheduler.js', 'claude-status.json', 'claude-review-pointer.json',
  'package.json', 'package-lock.json', 'test-api.js', 'acl.json',
]);
const STATIC_DENY_EXTENSIONS = new Set(['.db', '.log', '.py', '.ps1', '.bat']);

function isStaticPathSafe(pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (_) { return false; }
  if (decoded.includes('\0')) return false;
  const relative = decoded.replace(/^\/+/, '');
  if (!relative) return false;
  const segments = relative.split('/').filter(Boolean);
  if (segments.some((seg) => seg === '..' || seg.startsWith('.'))) return false; // traversal + dotfiles/dotdirs
  const resolved = path.resolve(__dirname, ...segments);
  if (resolved !== __dirname && !resolved.startsWith(__dirname + path.sep)) return false; // containment
  if (STATIC_DENY_TOP_LEVEL.has(segments[0])) return false;
  // vnext/client/** and platform/client/** are the intended servable demo
  // surface (per vnext/client/INTEGRATION.md and platform/client/INTEGRATION.md);
  // vnext/server/** and platform/server/** are Node backend modules (db
  // handles, SQL, require()'d only) — not meant to be fetched as static text.
  if ((segments[0] === 'vnext' || segments[0] === 'platform') && segments[1] === 'server') return false;
  if (segments.length === 1 && STATIC_DENY_EXACT_FILES.has(segments[0])) return false;
  if (STATIC_DENY_EXTENSIONS.has(path.extname(resolved).toLowerCase())) return false;
  return true;
}

const WHATSAPP_BODY_LIMIT = 1024 * 1024 * 5;
const whatsappRateWindowMs = 60 * 1000;
const whatsappRateLimit = 120;
const whatsappRateHits = new Map();

function backupTimestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makeId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sendJson(res, status, payload) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.writeHead(status);
  res.end(JSON.stringify(payload));
}

// T1.4 — unified document numbering (Odoo `ir.sequence`).
// Known codes and their default prefix/padding. Unknown codes are still
// honoured: prefix falls back to code.toUpperCase(), padding to 4. Callers may
// override prefix/padding on first use via the request body; once a row exists
// its stored prefix/padding win (so numbering stays stable).
const SEQUENCE_DEFAULTS = {
  inv:     { prefix: 'INV', padding: 5 },
  bill:    { prefix: 'BILL', padding: 5 },
  job:     { prefix: 'JOB', padding: 4 },
  tkt:     { prefix: 'TKT', padding: 4 },
  sr:      { prefix: 'SR', padding: 4 },
  po:      { prefix: 'PO', padding: 4 },
  so:      { prefix: 'SO', padding: 4 },
  badge:   { prefix: 'BADGE', padding: 4 },
  quote:   { prefix: 'QT', padding: 4 },
  sub:     { prefix: 'SUB', padding: 4 },
};

function normalizeSequenceCode(code) {
  return String(code || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
}

// Issues the next number for `code` atomically. Returns { code, number, prefix,
// padding, sequence, year }. Throws if SQLite is unavailable (caller decides the
// HTTP status / lets the client fall back to its OFFLINE- counter).
function issueNextSequence(code, opts = {}) {
  if (!dbSync) {
    const err = new Error('Sequence store unavailable (SQLite inactive)');
    err.statusCode = 503;
    throw err;
  }
  const normCode = normalizeSequenceCode(code);
  if (!normCode) {
    const err = new Error('Sequence code is required');
    err.statusCode = 400;
    throw err;
  }
  const year = new Date().getFullYear();
  dbSync.exec('BEGIN IMMEDIATE TRANSACTION');
  try {
    const existing = dbSync.prepare('SELECT code, prefix, padding, next_number, year FROM sequences WHERE code = ?').get(normCode);
    const fallback = SEQUENCE_DEFAULTS[normCode] || { prefix: normCode.toUpperCase(), padding: 4 };
    let prefix = existing ? existing.prefix : (opts.prefix != null ? String(opts.prefix) : fallback.prefix);
    let padding = existing ? existing.padding : (Number.isFinite(+opts.padding) && +opts.padding > 0 ? Math.min(12, Math.floor(+opts.padding)) : fallback.padding);
    if (!prefix) prefix = fallback.prefix;
    if (!(padding > 0)) padding = fallback.padding;

    let current;
    if (!existing) {
      current = 1;
      dbSync.prepare('INSERT INTO sequences (code, prefix, padding, next_number, year) VALUES (?, ?, ?, ?, ?)')
        .run(normCode, prefix, padding, current + 1, year);
    } else if (existing.year !== year) {
      // Yearly reset — new year starts back at 1.
      current = 1;
      dbSync.prepare('UPDATE sequences SET next_number = ?, year = ? WHERE code = ?')
        .run(current + 1, year, normCode);
    } else {
      current = existing.next_number;
      dbSync.prepare('UPDATE sequences SET next_number = ? WHERE code = ?')
        .run(current + 1, normCode);
    }
    dbSync.exec('COMMIT');
    const sequence = `${prefix}-${year}-${String(current).padStart(padding, '0')}`;
    return { code: normCode, number: current, prefix, padding, year, sequence };
  } catch (error) {
    try { dbSync.exec('ROLLBACK'); } catch (_) {}
    throw error;
  }
}

function geminiTtsApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || process.env.GOOGLE_TTS_API_KEY || '';
}

async function synthesizeServerTTS(text, lang = 'ar-SA') {
  const key = geminiTtsApiKey();
  if (!key) {
    const error = new Error('Server TTS is not configured');
    error.statusCode = 501;
    throw error;
  }
  if (typeof fetch !== 'function') {
    const error = new Error('Server runtime does not support fetch');
    error.statusCode = 501;
    throw error;
  }
  const cleanText = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 900);
  if (!cleanText) {
    const error = new Error('Missing text');
    error.statusCode = 400;
    throw error;
  }
  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=' + encodeURIComponent(key);
  const body = {
    contents: [{ parts: [{ text: cleanText }] }],
    generationConfig: {
      responseModalities: ['AUDIO'],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } }
    }
  };
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    const error = new Error('TTS provider failed');
    error.statusCode = response.status;
    error.providerError = errText.slice(0, 300);
    throw error;
  }
  const data = await response.json();
  const part = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0];
  const inline = part && part.inlineData;
  const audioBase64 = inline && inline.data;
  if (!audioBase64) {
    const error = new Error('TTS provider returned no audio');
    error.statusCode = 502;
    throw error;
  }
  const match = /rate=(\d+)/.exec(inline.mimeType || '') || [];
  return {
    audioBase64,
    sampleRate: Number(match[1]) || 24000,
    mimeType: inline.mimeType || 'audio/pcm',
    lang
  };
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const idx = part.indexOf('=');
    if (idx === -1) return;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(val);
  });
  return out;
}

function setAuthCookie(res, token, maxAgeSeconds) {
  const cookie = `octagon_session=${encodeURIComponent(token || '')}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}`;
  res.setHeader('Set-Cookie', cookie);
}

function sanitizeAuthUser(user) {
  if (!user || typeof user !== 'object') return null;
  const copy = { ...user };
  delete copy.passwordHash;
  delete copy.passwordSalt;
  delete copy.passwordAlgo;
  delete copy.passwordSetAt;
  return copy;
}

function readRequestBody(req, limit = WHATSAPP_BODY_LIMIT) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (Buffer.byteLength(body) > limit) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function verifyWhatsAppSignature(rawBody, signatureHeader) {
  const appSecret = process.env.WHATSAPP_APP_SECRET || '';
  if (!appSecret) return { verified: false, enforced: false, reason: 'WHATSAPP_APP_SECRET not configured' };
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return { verified: false, enforced: true, reason: 'Missing X-Hub-Signature-256' };
  }
  const expected = `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
  const provided = Buffer.from(signatureHeader);
  const expectedBuffer = Buffer.from(expected);
  const verified = provided.length === expectedBuffer.length && crypto.timingSafeEqual(provided, expectedBuffer);
  return { verified, enforced: true, reason: verified ? 'ok' : 'Signature mismatch' };
}

function checkWhatsAppRateLimit(req) {
  const key = req.socket?.remoteAddress || 'unknown';
  const now = Date.now();
  const hit = whatsappRateHits.get(key) || { start: now, count: 0 };
  if (now - hit.start > whatsappRateWindowMs) {
    hit.start = now;
    hit.count = 0;
  }
  hit.count += 1;
  whatsappRateHits.set(key, hit);
  return hit.count <= whatsappRateLimit;
}

function ensureDbShape(db) {
  if (!db || typeof db !== 'object') db = {};
  if (!db.omni || typeof db.omni !== 'object') db.omni = {};
  if (!Array.isArray(db.omni.whatsappSuggestions)) db.omni.whatsappSuggestions = [];
  if (!Array.isArray(db.omni.whatsappIngestHistory)) db.omni.whatsappIngestHistory = [];
  if (!Array.isArray(db.omni.historyLedger)) db.omni.historyLedger = [];
  if (!Array.isArray(db.omni.migrationsApplied)) db.omni.migrationsApplied = [];
  if (!db.omni.migrationsApplied.includes('server_whatsapp_webhook_v1')) db.omni.migrationsApplied.push('server_whatsapp_webhook_v1');
  return db;
}

// --- Safe local persistence engine -----------------------------------------
// Crash-safe atomic write: write to a temp file, fsync, then rename over the
// target. rename() is atomic on the same volume, so a crash/power-loss mid-write
// can never leave a half-written database.json.
function atomicWriteFileSync(targetPath, data) {
  const tmp = targetPath + '.tmp';
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeSync(fd, data);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, targetPath);
}

function repairKnownArabicMojibake(value) {
  if (typeof value !== 'string' || !/[\uFFFD\u00D8\u00D9\u00F0\u0178\u00E2\u00C3]/.test(value)) return value;
  return value
    .replace(/\uFFFD\uFFFDمت/g, 'تمت')
    .replace(/الخط\uFFFD\uFFFDة/g, 'الخطوة')
    .replace(/ليوم \uFFFD\uFFFDد/g, 'ليوم غد');
}

function sanitizePersistedArabicText(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      value[idx] = typeof item === 'string' ? repairKnownArabicMojibake(item) : sanitizePersistedArabicText(item, seen);
    });
    return value;
  }
  Object.keys(value).forEach(key => {
    value[key] = typeof value[key] === 'string' ? repairKnownArabicMojibake(value[key]) : sanitizePersistedArabicText(value[key], seen);
  });
  return value;
}

// --- SQLite helper functions ---
function getNestedPath(obj, pathStr) {
  const parts = pathStr.split('.');
  let current = obj;
  for (const p of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = current[p];
  }
  return current;
}

function setNestedPath(obj, pathStr, value) {
  const parts = pathStr.split('.');
  let current = obj;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (i === parts.length - 1) {
      current[p] = value;
    } else {
      if (current[p] == null || typeof current[p] !== 'object') {
        current[p] = {};
      }
      current = current[p];
    }
  }
}

function getOrgSettings(db) {
  return db?.omni?.adminSettings?.organization || db?.adminSettings?.organization || {};
}

function getActiveTenantProfile(primaryDb, fallbackDb = null) {
  const org = getOrgSettings(primaryDb);
  const fallbackOrg = getOrgSettings(fallbackDb);
  const companies = Array.isArray(org.companies) ? org.companies : (Array.isArray(fallbackOrg.companies) ? fallbackOrg.companies : []);
  const activeId = org.activeCompanyId || fallbackOrg.activeCompanyId || '';
  const company = companies.find(co => co.id === activeId) || companies.find(co => co.isPrimary) || companies[0] || {};
  return {
    companyId: company.id || activeId || '',
    companyName: company.name || org.name || fallbackOrg.name || '',
    currency: org.currency || fallbackOrg.currency || 'IQD',
    currencySymbol: org.currencySymbol || fallbackOrg.currencySymbol || '',
  };
}

function tenantEnabledForWrite(existingDb, incomingDb = null) {
  return !!(getOrgSettings(existingDb).multiTenant || getOrgSettings(incomingDb).multiTenant);
}

function recordTenantCompanyId(record) {
  if (!record || typeof record !== 'object') return '';
  return record.companyId || record.company_id || record.tenantCompanyId || '';
}

function isServerTenantCollection(collection) {
  return SERVER_TENANT_COLLECTIONS.has(String(collection || ''));
}

function hasTenantMarkers(records) {
  return Array.isArray(records) && records.some(record => recordTenantCompanyId(record));
}

function shouldProtectTenantCollection(existingDb, contextDb, collection, incomingRecords, existingRecords) {
  if (!tenantEnabledForWrite(existingDb, contextDb)) return false;
  return isServerTenantCollection(collection) || hasTenantMarkers(incomingRecords) || hasTenantMarkers(existingRecords);
}

function stampServerTenantRecord(contextDb, record) {
  if (!record || typeof record !== 'object') return record;
  const profile = getActiveTenantProfile(contextDb);
  if (!profile.companyId || recordTenantCompanyId(record)) return record;
  record.companyId = profile.companyId;
  record.companyName = profile.companyName || record.companyName || '';
  if (profile.currency && !record.currency) record.currency = profile.currency;
  if (profile.currencySymbol && !record.currencySymbol) record.currencySymbol = profile.currencySymbol;
  if (!record.tenantStampedAt) record.tenantStampedAt = new Date().toISOString();
  return record;
}

function ensureServerRecordId(collection, record, fallbackId = '') {
  if (!record || typeof record !== 'object') return record;
  if (!record.id) record.id = fallbackId || `${String(collection || 'rec').slice(0, 3)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  return record;
}

function prepareTenantRecordWrite(existingDb, contextDb, collection, id, data, existingRecord) {
  const existingRecords = existingRecord ? [existingRecord] : [];
  if (!shouldProtectTenantCollection(existingDb, contextDb, collection, [data], existingRecords)) {
    return ensureServerRecordId(collection, data, id);
  }
  const activeCompanyId = getActiveTenantProfile(contextDb, existingDb).companyId;
  const record = ensureServerRecordId(collection, { ...data }, id);
  const existingCompanyId = recordTenantCompanyId(existingRecord);
  const incomingCompanyId = recordTenantCompanyId(record);

  if (!activeCompanyId) return record;
  if (existingCompanyId && existingCompanyId !== activeCompanyId) {
    throw new Error(`Tenant isolation blocked ${collection} record ${record.id}: existing record belongs to another company`);
  }
  if (incomingCompanyId && incomingCompanyId !== activeCompanyId) {
    throw new Error(`Tenant isolation blocked ${collection} record ${record.id}: incoming companyId does not match active company`);
  }
  return stampServerTenantRecord(contextDb, record);
}

function mergeTenantCollectionForWrite(existingDb, contextDb, collection, incomingRecords) {
  const existingRecords = getNestedPath(existingDb || {}, collection);
  const existingList = Array.isArray(existingRecords) ? existingRecords : [];
  const incomingList = Array.isArray(incomingRecords) ? incomingRecords : [];

  if (!shouldProtectTenantCollection(existingDb, contextDb, collection, incomingList, existingList)) {
    return { data: incomingList, stamped: 0, preservedForeign: 0 };
  }

  const activeCompanyId = getActiveTenantProfile(contextDb, existingDb).companyId;
  if (!activeCompanyId) return { data: incomingList, stamped: 0, preservedForeign: 0 };

  const existingById = new Map();
  existingList.forEach(record => {
    if (record && typeof record === 'object' && record.id !== undefined) existingById.set(String(record.id), record);
  });

  const incomingIds = new Set();
  const merged = [];
  let stamped = 0;
  let preservedForeign = 0;

  incomingList.forEach(item => {
    if (!item || typeof item !== 'object') {
      merged.push(item);
      return;
    }
    const record = ensureServerRecordId(collection, { ...item });
    incomingIds.add(String(record.id));
    const existingRecord = existingById.get(String(record.id));
    const existingCompanyId = recordTenantCompanyId(existingRecord);
    const incomingCompanyId = recordTenantCompanyId(record);

    if (existingCompanyId && existingCompanyId !== activeCompanyId) {
      merged.push(existingRecord);
      preservedForeign += 1;
      return;
    }
    if (incomingCompanyId && incomingCompanyId !== activeCompanyId) {
      throw new Error(`Tenant isolation blocked ${collection} record ${record.id}: incoming companyId does not match active company`);
    }
    if (!incomingCompanyId) {
      stampServerTenantRecord(contextDb, record);
      stamped += recordTenantCompanyId(record) ? 1 : 0;
    }
    merged.push(record);
  });

  existingList.forEach(existingRecord => {
    if (!existingRecord || typeof existingRecord !== 'object' || existingRecord.id === undefined) return;
    if (incomingIds.has(String(existingRecord.id))) return;
    const existingCompanyId = recordTenantCompanyId(existingRecord);
    if (existingCompanyId && existingCompanyId !== activeCompanyId) {
      merged.push(existingRecord);
      preservedForeign += 1;
    }
  });

  return { data: merged, stamped, preservedForeign };
}

function applyServerTenantProtectionToDatabase(existingDb, parsedDb) {
  if (!existingDb || !tenantEnabledForWrite(existingDb, parsedDb)) {
    return { db: parsedDb, stamped: 0, preservedForeign: 0, preservedMissingCollections: 0 };
  }
  let stamped = 0;
  let preservedForeign = 0;
  let preservedMissingCollections = 0;

  SERVER_TENANT_COLLECTIONS.forEach(collection => {
    const existingRecords = getNestedPath(existingDb, collection);
    const incomingRecords = getNestedPath(parsedDb, collection);
    if (!Array.isArray(existingRecords) && !Array.isArray(incomingRecords)) return;

    if (!Array.isArray(incomingRecords) && Array.isArray(existingRecords)) {
      setNestedPath(parsedDb, collection, existingRecords);
      preservedMissingCollections += 1;
      return;
    }

    const result = mergeTenantCollectionForWrite(existingDb, parsedDb, collection, incomingRecords);
    setNestedPath(parsedDb, collection, result.data);
    stamped += result.stamped;
    preservedForeign += result.preservedForeign;
  });

  return { db: parsedDb, stamped, preservedForeign, preservedMissingCollections };
}

function extractDbCollections(obj, path = '', collections = {}, metadata = {}) {
  if (obj == null) return;
  
  const isKnownCollection = [
    'employees', 'contacts', 'departments', 'users', 'locations', 'quants', 'stock_moves', 
    'transfers', 'journals', 'journal_entries', 'account_moves', 'account_payments', 'account_partial_reconciles',
    'employee_advances', 'payroll_periods', 'employee_payroll_closings', 'payroll_payments', 'payroll_adjustments',
    'payments', 'maintenance_requests', 'production_orders', 'work_orders', 'audit_log'
  ].includes(path) || (path.startsWith('omni.') && Array.isArray(obj));
  
  if (Array.isArray(obj)) {
    const hasIds = obj.length > 0 && obj.every(x => x && typeof x === 'object' && x.id !== undefined);
    if (isKnownCollection || hasIds) {
      collections[path] = obj;
      return;
    }
  }
  
  if (typeof obj === 'object') {
    if (path === '' || path === 'omni' || path === 'finance') {
      for (const k in obj) {
        const nextPath = path ? `${path}.${k}` : k;
        extractDbCollections(obj[k], nextPath, collections, metadata);
      }
      return;
    }
  }
  
  metadata[path] = obj;
}

function saveDbToSqlite(sqliteDb, db) {
  const collections = {};
  const metadata = {};
  extractDbCollections(db, '', collections, metadata);
  
  sqliteDb.exec("BEGIN TRANSACTION");
  try {
    // 1. Delta save metadata
    const existingMetaRows = sqliteDb.prepare("SELECT key, value FROM metadata").all();
    const existingMetaMap = new Map();
    existingMetaRows.forEach(row => {
      existingMetaMap.set(row.key, row.value);
    });

    const insertMeta = sqliteDb.prepare("INSERT INTO metadata (key, value) VALUES (?, ?)");
    const updateMeta = sqliteDb.prepare("UPDATE metadata SET value = ? WHERE key = ?");
    const deleteMeta = sqliteDb.prepare("DELETE FROM metadata WHERE key = ?");

    for (const key in metadata) {
      const valStr = JSON.stringify(metadata[key]);
      if (existingMetaMap.has(key)) {
        if (existingMetaMap.get(key) !== valStr) {
          updateMeta.run(valStr, key);
        }
      } else {
        insertMeta.run(key, valStr);
      }
    }
    for (const key of existingMetaMap.keys()) {
      if (!(key in metadata)) {
        deleteMeta.run(key);
      }
    }

    // 2. Delta save collections
    const existingColRows = sqliteDb.prepare("SELECT collection, id, data FROM collections").all();
    const existingColMap = new Map();
    existingColRows.forEach(row => {
      existingColMap.set(`${row.collection}::${row.id}`, row.data);
    });

    const insertCol = sqliteDb.prepare("INSERT INTO collections (collection, id, data) VALUES (?, ?, ?)");
    const updateCol = sqliteDb.prepare("UPDATE collections SET data = ? WHERE collection = ? AND id = ?");
    const deleteCol = sqliteDb.prepare("DELETE FROM collections WHERE collection = ? AND id = ?");

    const seen = new Set();
    const incomingKeys = new Set();

    for (const colName in collections) {
      const arr = collections[colName];
      for (const rec of arr) {
        let id = rec.id || `${colName.slice(0, 3)}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        let key = `${colName}::${id}`;
        let counter = 1;
        const originalId = id;
        while (seen.has(key)) {
          id = `${originalId}_dup${counter}`;
          key = `${colName}::${id}`;
          counter++;
        }
        seen.add(key);
        if (rec.id !== id) {
          rec.id = id;
        }

        const dataStr = JSON.stringify(rec);
        incomingKeys.add(key);

        if (existingColMap.has(key)) {
          if (existingColMap.get(key) !== dataStr) {
            updateCol.run(dataStr, colName, id);
          }
        } else {
          insertCol.run(colName, id, dataStr);
        }
      }
    }

    for (const key of existingColMap.keys()) {
      if (!incomingKeys.has(key)) {
        const parts = key.split('::');
        const colName = parts[0];
        const id = parts.slice(1).join('::');
        deleteCol.run(colName, id);
      }
    }

    sqliteDb.exec("COMMIT");
  } catch (e) {
    sqliteDb.exec("ROLLBACK");
    throw e;
  }
}

function loadDbFromSqlite(sqliteDb) {
  const db = {};
  
  const metaRows = sqliteDb.prepare("SELECT key, value FROM metadata").all();
  for (const row of metaRows) {
    let parsedVal;
    try {
      parsedVal = JSON.parse(row.value);
    } catch(e) {
      parsedVal = row.value;
    }
    setNestedPath(db, row.key, parsedVal);
  }
  
  const colRows = sqliteDb.prepare("SELECT collection, id, data FROM collections").all();
  for (const row of colRows) {
    const record = JSON.parse(row.data);
    let arr = getNestedPath(db, row.collection);
    if (!Array.isArray(arr)) {
      arr = [];
      setNestedPath(db, row.collection, arr);
    }
    arr.push(record);
  }
  
  return db;
}

// Single safe entry point for every DB write. Validates, keeps a last-good
// snapshot, writes atomically, and throttled-auto-backups.
//
// database.json policy (Production Stabilization Sprint, 2026-07-04):
// SQLite (database.db) is the sole live read/write store whenever dbSync is
// active — database.json is NEVER read by the running app in that mode
// (confirmed: GET/POST /api/db both branch on `dbSync` first). Before this
// fix database.json was a frozen snapshot from whenever SQLite last took
// over, silently missing everything posted since (it was found ~1 payroll
// cycle stale during this audit). It is kept only as (a) a human-readable
// mirror for git/manual inspection and (b) the automatic fallback store IF
// SQLite is ever unavailable — so it must never be allowed to go stale
// again. Every SQLite save now also mirrors the full DB to database.json
// (best-effort: failures here are logged but never abort the real save).
function safeSaveDb(db) {
  if (!db || typeof db !== 'object') throw new Error('Refusing to save invalid DB (not an object)');
  sanitizePersistedArabicText(db);

  if (dbSync) {
    saveDbToSqlite(dbSync, db);
    mirrorDbToJsonBestEffort(db);
    return;
  }

  const json = JSON.stringify(db, null, 2);
  if (json.length < 2) throw new Error('Refusing to save empty DB payload');
  try {
    if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, DB_PREV_FILE);
  } catch (e) {
    console.warn('Could not write .prev snapshot:', e.message);
  }
  atomicWriteFileSync(DB_FILE, json);
  maybeAutoBackup();
}

function mirrorDbToJsonBestEffort(db) {
  try {
    const json = JSON.stringify(db, null, 2);
    if (json.length < 2) return;
    atomicWriteFileSync(DB_FILE, json);
  } catch (e) {
    console.warn('database.json mirror write failed (SQLite save already succeeded, this is non-fatal):', e.message);
  }
}

function maybeAutoBackup() {
  const now = Date.now();
  if (now - lastAutoBackupMs < AUTO_BACKUP_INTERVAL_MS) return;
  lastAutoBackupMs = now;
  try {
    createDatabaseBackup('auto');
    pruneOldBackups(BACKUP_KEEP);
  } catch (e) {
    console.warn('Auto-backup skipped:', e.message);
  }
}

function pruneOldBackups(keep = BACKUP_KEEP) {
  try {
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => /^database\.backup\..+\.json$/.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    files.slice(keep).forEach(item => {
      try { fs.unlinkSync(path.join(BACKUP_DIR, item.f)); } catch (_) {}
    });
  } catch (e) {
    console.warn('Prune skipped:', e.message);
  }
}

// On boot: if database.json is missing or corrupt, recover from the newest valid
// snapshot (.prev first, then the latest good database.backup.*.json).
function recoverDbIfCorrupt() {
  try {
    if (fs.existsSync(DB_FILE)) {
      JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      return; // healthy
    }
  } catch (e) {
    console.error('⚠ database.json is corrupt:', e.message);
  }
  const candidates = [];
  if (fs.existsSync(DB_PREV_FILE)) candidates.push(DB_PREV_FILE);
  try {
    fs.readdirSync(BACKUP_DIR)
      .filter(f => /^database\.backup\..+\.json$/.test(f))
      .map(f => ({ p: path.join(BACKUP_DIR, f), t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .forEach(item => candidates.push(item.p));
  } catch (_) {}
  for (const c of candidates) {
    try {
      JSON.parse(fs.readFileSync(c, 'utf8'));
      fs.copyFileSync(c, DB_FILE);
      console.log('✅ Recovered database.json from', path.basename(c));
      return;
    } catch (_) {}
  }
  if (!fs.existsSync(DB_FILE)) console.error('❌ No valid snapshot found to recover database.json');
}

function saveDb(db) {
  safeSaveDb(db);
}

function loadDbForMutation() {
  if (dbSync) {
    try {
      const db = loadDbFromSqlite(dbSync);
      return ensureDbShape(db);
    } catch (e) {
      console.error('Failed to load DB for mutation from SQLite:', e.message);
    }
  }
  const db = fs.existsSync(DB_FILE) ? readJsonFile(DB_FILE) : { employees: [], config: {}, omni: {} };
  return ensureDbShape(db);
}

function sanitizeLedgerPayload(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 40).map(item => sanitizeLedgerPayload(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).slice(0, 80).forEach(key => {
      const lower = key.toLowerCase();
      if (lower.includes('token') || lower.includes('secret') || lower.includes('apikey') || lower.includes('api_key') || lower.includes('password') || lower.includes('authorization')) {
        result[key] = '[redacted]';
      } else if (key === 'base64' || key === 'dataUrl' || key === 'binary' || key === 'fileData') {
        result[key] = '[media omitted]';
      } else {
        result[key] = sanitizeLedgerPayload(value[key], depth + 1);
      }
    });
    return result;
  }
  if (typeof value === 'string' && value.length > 1200) return `${value.slice(0, 1200)}...`;
  return value;
}

function appendHistoryEvent(db, entry) {
  ensureDbShape(db);
  const event = {
    id: entry.id || makeId('hist'),
    eventId: entry.eventId || entry.id || makeId('hist'),
    timestamp: entry.timestamp || new Date().toISOString(),
    module: entry.module || 'whatsapp',
    source: entry.source || 'whatsapp_business_api',
    action: entry.action || 'webhook_message_received',
    title: entry.title || 'WhatsApp webhook event',
    description: entry.description || '',
    actorId: entry.actorId || 'whatsapp_business_api',
    actorName: entry.actorName || 'WhatsApp Business API',
    actorRole: entry.actorRole || 'integration',
    correlationId: entry.correlationId || entry.sourceMessageId || entry.createdRecordId || '',
    sourceMessageId: entry.sourceMessageId || '',
    whatsappSenderId: entry.whatsappSenderId || '',
    mediaId: entry.mediaId || '',
    aiRunId: entry.aiRunId || '',
    approvalRequestId: entry.approvalRequestId || '',
    createdRecordId: entry.createdRecordId || '',
    recordId: entry.recordId || '',
    recordType: entry.recordType || '',
    status: entry.status || 'pending_review',
    risk: entry.risk || '',
    payload: sanitizeLedgerPayload(entry.payload || {}),
    before: null,
    after: null,
  };
  db.omni.historyLedger.unshift(event);
  db.omni.historyLedger = db.omni.historyLedger.slice(0, 2000);
  return event;
}

function classifyWebhookText(text, messageType = 'text') {
  const t = String(text || '').toLowerCase();
  const hasAmount = /[\d,]+/.test(t);
  if (messageType === 'audio' || /voice|audio|صوت|فويس|رسالة صوتية/.test(t)) return { type: 'voice_note', label: 'رسالة صوتية - مراجعة', confidence: 65 };
  if (/خر|عطل|صيانة|machine|cnc|laser|ليزر|ماكينة|router|printer/.test(t)) return { type: 'machine_fault', label: 'عطل / صيانة ماكينة', confidence: 86 };
  if (/فاتورة|وصل|invoice|receipt|pdf|مشتريات/.test(t) && hasAmount) return { type: 'purchase_invoice', label: 'فاتورة / مصروف', confidence: 86 };
  if (/اجازة|إجازة|غياب|حضور|دوام|بصمة|leave|attendance/.test(t)) return { type: 'attendance_event', label: 'دوام / حضور / غياب', confidence: 82 };
  if (/شراء|مواد|مخزون|ناقص|خشب|اكريلك|حبر|material|stock/.test(t)) return { type: 'material_request', label: 'طلب مواد / مخزون', confidence: 78 };
  if (/مهمة|تصميم|طباعة|قص|تركيب|task|tomorrow|tomorow|غدا|غداً|باچر|باجر/.test(t)) return { type: 'task', label: 'مهمة تشغيلية', confidence: 76 };
  if (/مال|فلوس|دفع|قبض|راتب|سلفة|finance|payment/.test(t)) return { type: 'finance_request', label: 'طلب مالي / دفعة', confidence: 74 };
  return { type: 'unknown', label: 'غير مصنف - مراجعة يدوية', confidence: 40 };
}

function routeForWebhookType(type) {
  if (type === 'task') return { outputType: 'task_manager', requestType: 'task', label: 'Task Manager' };
  if (type === 'material_request') return { outputType: 'command_center_request', requestType: 'purchase', label: 'Command Center purchase review' };
  if (type === 'attendance_event') return { outputType: 'command_center_request', requestType: 'employee_request', label: 'Command Center employee review' };
  if (type === 'finance_request' || type === 'purchase_invoice') return { outputType: 'command_center_request', requestType: 'finance_review', label: 'Finance review' };
  if (type === 'machine_fault') return { outputType: 'command_center_request', requestType: 'machine_maintenance', label: 'Maintenance review' };
  return { outputType: 'command_center_request', requestType: 'whatsapp_review', label: 'Manual review' };
}

function attachmentFromMessage(message) {
  const media = message.audio || message.image || message.document || message.video || message.sticker;
  if (!media) return [];
  const type = message.type || 'media';
  return [{
    id: media.id || '',
    type: type === 'document' ? 'invoice' : type,
    label: type === 'audio' ? 'رسالة صوتية من WhatsApp' : type === 'image' ? 'صورة من WhatsApp' : type === 'document' ? 'مستند من WhatsApp' : `مرفق ${type}`,
    fileName: media.filename || `${type}_${media.id || Date.now()}`,
    mimeType: media.mime_type || '',
    sha256: media.sha256 || '',
    status: process.env.WHATSAPP_ACCESS_TOKEN ? 'pending_download' : 'metadata_only',
    sourceMediaId: media.id || '',
  }];
}

function textFromWhatsAppMessage(message) {
  if (message.text?.body) return message.text.body;
  if (message.button?.text) return message.button.text;
  if (message.interactive?.button_reply?.title) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply?.title) return message.interactive.list_reply.title;
  if (message.image?.caption) return message.image.caption;
  if (message.document?.caption) return message.document.caption;
  if (message.video?.caption) return message.video.caption;
  if (message.type === 'audio') return 'رسالة صوتية من WhatsApp بانتظار التفريغ';
  return `WhatsApp ${message.type || 'message'} received`;
}

function extractWhatsAppMessages(payload) {
  const extracted = [];
  (payload.entry || []).forEach(entry => {
    (entry.changes || []).forEach(change => {
      const value = change.value || {};
      const metadata = value.metadata || {};
      const contactsByWaId = {};
      (value.contacts || []).forEach(contact => {
        contactsByWaId[contact.wa_id] = contact.profile?.name || contact.wa_id;
      });
      (value.messages || []).forEach(message => {
        extracted.push({
          entryId: entry.id || '',
          phoneNumberId: metadata.phone_number_id || '',
          displayPhoneNumber: metadata.display_phone_number || '',
          contactName: contactsByWaId[message.from] || message.from || 'WhatsApp',
          message,
        });
      });
    });
  });
  return extracted;
}

function appendWhatsAppWebhookPayload(payload, signatureInfo = {}) {
  const db = loadDbForMutation();
  const messages = extractWhatsAppMessages(payload);
  const created = [];
  messages.forEach(({ message, contactName, phoneNumberId, displayPhoneNumber, entryId }) => {
    const text = textFromWhatsAppMessage(message);
    const cls = classifyWebhookText(text, message.type);
    const route = routeForWebhookType(cls.type);
    const attachments = attachmentFromMessage(message);
    const suggestion = {
      id: makeId('wa'),
      source: 'whatsapp_business_api',
      sourceMessageId: message.id || '',
      senderName: contactName,
      senderPhone: message.from || '',
      phoneNumberId,
      displayPhoneNumber,
      entryId,
      timestamp: message.timestamp ? new Date(Number(message.timestamp) * 1000).toISOString() : new Date().toISOString(),
      type: cls.type,
      label: cls.label,
      requestType: route.requestType,
      text,
      confidence: cls.confidence,
      status: 'pending',
      entityMatches: [],
      attachmentPlaceholders: attachments,
      webhookRawType: message.type || '',
      outputType: '',
      outputId: '',
      reviewedAt: '',
      createdAt: new Date().toISOString(),
    };
    db.omni.whatsappSuggestions.unshift(suggestion);
    appendHistoryEvent(db, {
      module: 'whatsapp',
      source: 'whatsapp_business_api',
      action: 'webhook_message_received',
      title: `WhatsApp webhook: ${contactName}`,
      description: text,
      status: 'pending_review',
      correlationId: suggestion.id,
      sourceMessageId: message.id || suggestion.id,
      whatsappSenderId: message.from || '',
      mediaId: attachments[0]?.sourceMediaId || '',
      payload: { suggestion, signature: signatureInfo, rawType: message.type },
    });
    created.push(suggestion);
  });
  if (created.length) {
    db.omni.whatsappIngestHistory.unshift({
      id: makeId('wa_batch'),
      createdAt: new Date().toISOString(),
      count: created.length,
      source: 'whatsapp_business_api',
      matched: 0,
      attachments: created.reduce((sum, item) => sum + (item.attachmentPlaceholders || []).length, 0),
      signatureVerified: !!signatureInfo.verified,
      signatureEnforced: !!signatureInfo.enforced,
    });
  }
  saveDb(db);
  return created;
}

function topLevelCollections(db) {
  return Object.keys(db || {}).filter(key => Array.isArray(db[key])).sort();
}

function verifyBackupAgainstLive(backupPath) {
  const live = dbSync ? loadDbFromSqlite(dbSync) : readJsonFile(DB_FILE);
  const backup = readJsonFile(backupPath);
  const errors = [];
  const appendOnlyCollections = new Set(['audit_log']);
  if (backup._schema_version !== live._schema_version) {
    errors.push(`schema mismatch: backup=${backup._schema_version} live=${live._schema_version}`);
  }
  const liveCollections = topLevelCollections(live);
  const backupCollections = topLevelCollections(backup);
  liveCollections.forEach(collection => {
    if (!backupCollections.includes(collection)) {
      errors.push(`backup missing collection: ${collection}`);
    } else {
      const backupCount = (backup[collection] || []).length;
      const liveCount = (live[collection] || []).length;
      if (appendOnlyCollections.has(collection) && liveCount >= backupCount) return;
      if (backupCount !== liveCount) {
        errors.push(`count mismatch on ${collection}: backup=${backupCount} live=${liveCount}`);
      }
    }
  });
  return errors;
}

function createDatabaseBackup(tag = 'manual') {
  const safeTag = String(tag || 'manual').replace(BACKUP_TAG_RE, '_');
  const backupName = `database.backup.${safeTag}.${backupTimestamp()}.json`;
  const backupPath = path.join(BACKUP_DIR, backupName);
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  
  if (dbSync) {
    const db = loadDbFromSqlite(dbSync);
    fs.writeFileSync(backupPath, JSON.stringify(db, null, 2), 'utf8');
  } else {
    if (!fs.existsSync(DB_FILE)) throw new Error('database.json does not exist');
    fs.copyFileSync(DB_FILE, backupPath);
  }
  
  const errors = verifyBackupAgainstLive(backupPath);
  if (errors.length) {
    fs.unlinkSync(backupPath);
    throw new Error(errors.join('; '));
  }
  return {
    success: true,
    file: backupName,
    bytes: fs.statSync(backupPath).size,
  };
}

// T1.5 — append a single audit line to server-backup.log. Best-effort; never
// throws (a logging failure must not fail a good backup).
function appendBackupLog(line) {
  try {
    fs.appendFileSync(BACKUP_LOG_FILE, `[${new Date().toISOString()}] ${line}\n`, 'utf8');
  } catch (_) {}
}

// T1.5 — prune only backups carrying `tag`, keeping the newest `keep`. Scoped by
// tag on purpose so the nightly cycle can enforce its own retention without
// touching the hourly auto-backup set (pruneOldBackups(BACKUP_KEEP)) or manual
// snapshots. Returns the number of files removed.
function pruneBackupsByTag(tag, keep) {
  try {
    const safeTag = String(tag || '').replace(BACKUP_TAG_RE, '_');
    const re = new RegExp(`^database\\.backup\\.${safeTag}\\..+\\.json$`);
    const files = fs.readdirSync(BACKUP_DIR)
      .filter(f => re.test(f))
      .map(f => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t);
    const removed = files.slice(keep);
    removed.forEach(item => { try { fs.unlinkSync(path.join(BACKUP_DIR, item.f)); } catch (_) {} });
    return removed.length;
  } catch (e) {
    return 0;
  }
}

// T1.5 — nightly create -> verify -> prune(keep 14) -> log cycle.
// createDatabaseBackup() already CREATES and VERIFIES (verifyBackupAgainstLive
// throws + deletes the file on any live-vs-backup mismatch), so this wrapper
// only adds tag-scoped pruning and the server-backup.log audit line. Passed into
// the Phase-3 scheduler's ctx as `createDatabaseBackup`, so the existing
// nightly_backup_verify job runs the full cycle with no scheduler-side change.
// Returns the createDatabaseBackup result augmented with { verified, pruned, kept }.
function runNightlyBackupCycle(tag = 'scheduler') {
  const safeTag = String(tag || 'scheduler').replace(BACKUP_TAG_RE, '_') || 'scheduler';
  try {
    const result = createDatabaseBackup(safeTag);
    const pruned = pruneBackupsByTag(safeTag, NIGHTLY_BACKUP_KEEP);
    appendBackupLog(`OK tag=${safeTag} file=${result.file} bytes=${result.bytes} verified=true pruned=${pruned} keep=${NIGHTLY_BACKUP_KEEP}`);
    return { ...result, verified: true, pruned, kept: NIGHTLY_BACKUP_KEEP };
  } catch (error) {
    appendBackupLog(`FAIL tag=${safeTag} error=${error.message || error}`);
    throw error;
  }
}

function userListFromDb(db) {
  const topUsers = Array.isArray(db.users) ? db.users : [];
  const omniUsers = db.omni && Array.isArray(db.omni.users) ? db.omni.users : [];
  const seen = new Set();
  return [...topUsers, ...omniUsers].filter(user => {
    if (!user || !user.id || seen.has(user.id)) return false;
    seen.add(user.id);
    return user.is_active !== false && user.status !== 'inactive';
  });
}

function roleListFromDb(db) {
  return db.omni && Array.isArray(db.omni.roles) ? db.omni.roles : [];
}

function enrichAuthUser(db, user) {
  if (!user) return null;
  const roles = roleListFromDb(db);
  const role = roles.find(item => item && (item.id === user.roleId || item.id === user.role));
  const groups = Array.from(new Set([...(role?.groups || []), ...(user.groups || [])]));
  return sanitizeAuthUser({
    ...user,
    groups,
    roleId: user.roleId || role?.id || user.role || '',
    role: user.role || role?.id || user.roleId || '',
    name: user.displayName || user.name || user.id,
  });
}

function appendServerAudit(db, event = {}) {
  ensureDbShape(db);
  if (!Array.isArray(db.audit_log)) db.audit_log = [];
  if (!Array.isArray(db.omni.historyLedger)) db.omni.historyLedger = [];
  const now = new Date().toISOString();
  const base = {
    id: makeId('audit'),
    timestamp: now,
    date: now,
    module: event.module || 'auth',
    source: event.source || 'server',
    action: event.action || 'server_event',
    title: event.title || event.action || 'Server event',
    status: event.status || 'logged',
    result: event.result || event.status || 'logged',
    risk: event.risk || 'medium',
    actorId: event.actorId || event.userId || 'unknown',
    actorName: event.actorName || event.userName || event.actorId || 'unknown',
    user_id: event.actorId || event.userId || 'unknown',
    user_name: event.actorName || event.userName || event.actorId || 'unknown',
    payload: sanitizeLedgerPayload(event.payload || {}),
  };
  db.audit_log.unshift({ ...base, event_type: base.action, record_id: base.payload?.userId || '' });
  db.omni.historyLedger.unshift({ ...base, entityType: 'auth_session', entityId: base.payload?.userId || '' });
  if (db.audit_log.length > 5000) db.audit_log.length = 5000;
  if (db.omni.historyLedger.length > 5000) db.omni.historyLedger.length = 5000;
}

function authSessionFromRequest(req) {
  const token = parseCookies(req).octagon_session;
  if (!token) return null;
  const session = authSessions.get(token);
  if (!session) return null;
  if (Date.now() > session.expiresAt) {
    authSessions.delete(token);
    deletePersistedAuthSession(token);
    try {
      const db = loadDbForMutation();
      appendServerAudit(db, { action: 'session_expired', status: 'expired', actorId: session.userId || 'unknown', actorName: session.userId || 'unknown', payload: { userId: session.userId || '', expiredAt: new Date().toISOString() } });
      saveDb(db);
    } catch (_) {}
    return null;
  }
  return { token, session };
}

function hashClientPassword(password, salt) {
  return crypto.createHash('sha256').update(String(password || '') + String(salt || '')).digest('hex');
}

function isLocalRequest(req) {
  const addr = String(req.socket?.remoteAddress || '');
  const host = String(req.headers.host || '').split(':')[0].toLowerCase();
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1', 'localhost'].includes(addr) ||
    ['127.0.0.1', 'localhost', '[::1]', '::1'].includes(host);
}

function isDevMode() {
  return process.env.NODE_ENV !== 'production' && process.env.OCTAGON_PRODUCTION !== 'true';
}

// Strict loopback check for WRITE-trust: only the actual TCP socket address is
// consulted — NOT the Host header, which the client fully controls. (A remote
// attacker could send `Host: localhost` and pass the looser isLocalRequest();
// that's harmless for the read-only endpoints that use it, but must never
// grant writes.) A real remote client's remoteAddress is its LAN/public IP,
// never loopback, so it can never be trusted here.
function isLoopbackSocket(req) {
  const addr = String(req.socket?.remoteAddress || '');
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(addr);
}

// The physical console (localhost) is the trusted operator machine, so it may
// write even under NODE_ENV=production (2026-07-06). The pilot's production
// hardening exists to protect NETWORK access — a browser on a *different* PC
// pointed at this server is NOT loopback and still needs a real login session.
// Before this, production mode required a live session for EVERY write, so a
// dead session (server restart / 8h TTL expiry) silently rejected every save
// with 401 — the operator kept editing advances/payroll/timesheet and nothing
// persisted. Set OCTAGON_TRUST_LOCALHOST=false to require a session even on
// the console.
function isLocalWriteTrusted(req) {
  const trustLocalhost = process.env.OCTAGON_TRUST_LOCALHOST !== 'false';
  return (isDevMode() || trustLocalhost) && isLoopbackSocket(req);
}

function safeSessionInfo(req) {
  const active = authSessionFromRequest(req);
  if (!active) return null;
  return {
    userId: active.session.userId,
    createdAt: new Date(active.session.createdAt).toISOString(),
    expiresAt: new Date(active.session.expiresAt).toISOString(),
  };
}

function sessionGroupsForUser(db, userId) {
  const user = userListFromDb(db).find(item => item.id === userId);
  const enriched = enrichAuthUser(db, user);
  return Array.isArray(enriched?.groups) ? enriched.groups : [];
}

function requireSession(req, res, options = {}) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && dbSync) {
    const authHardening = require('./vnext/server/auth/auth-hardening');
    const apiUser = authHardening.validateApiKey(dbSync, apiKey);
    if (apiUser) {
      return { ok: true, mode: 'api-key', userId: apiUser.userId, groups: apiUser.groups, user: { id: apiUser.userId, groups: apiUser.groups } };
    }
  }

  const allowLocalDev = options.allowLocalDev !== false;
  // Test bypass is an explicit disposable-test capability only.  A loopback
  // socket is not sufficient authorization: real local-console traffic and
  // every review/browser proof must use a real session cookie.  Keeping this
  // gate opt-in prevents a copied test header from becoming an auth bypass in
  // development, staging, or production.
  const testBypassEnabled = process.env.NODE_ENV === 'test' && process.env.OCTAGON_ENABLE_TEST_BYPASS === 'true';
  if (allowLocalDev && testBypassEnabled && isLocalWriteTrusted(req) && req.headers['x-test-bypass'] === 'true') {
    return { ok: true, mode: isDevMode() ? 'local-dev' : 'local-trusted', userId: 'local-console', groups: ['system.admin', 'finance.manager'], user: null };
  }
  const active = authSessionFromRequest(req);
  if (!active) {
    sendJson(res, 401, { success: false, error: 'Login session required' });
    return { ok: false };
  }
  try {
    const db = loadDbForMutation();
    const authHardening = require('./vnext/server/auth/auth-hardening');
    if (dbSync && authHardening.isUserDisabled(dbSync, active.session.userId)) {
      authSessions.delete(active.token);
      deletePersistedAuthSession(active.token);
      sendJson(res, 401, { success: false, error: 'تم إيقاف حساب هذا المستخدم' });
      return { ok: false };
    }
    if (dbSync && authHardening.isSessionRevoked(dbSync, active.session.userId, active.session.createdAt)) {
      authSessions.delete(active.token);
      deletePersistedAuthSession(active.token);
      sendJson(res, 401, { success: false, error: 'تم تحديث صلاحيات هذا الحساب، الرجاء تسجيل الدخول من جديد' });
      return { ok: false };
    }
    const user = userListFromDb(db).find(item => item.id === active.session.userId);
    if (!user) {
      authSessions.delete(active.token);
      deletePersistedAuthSession(active.token);
      sendJson(res, 401, { success: false, error: 'Session user no longer exists' });
      return { ok: false };
    }
    const enriched = enrichAuthUser(db, user);
    return { ok: true, mode: 'server', userId: user.id, groups: enriched.groups || [], user: enriched };
  } catch (error) {
    sendJson(res, 500, { success: false, error: error.message || 'Session check failed' });
    return { ok: false };
  }
}

function requireRoleSession(req, res, groups, options = {}) {
  const session = requireSession(req, res, options);
  if (!session.ok) return session;
  const required = Array.isArray(groups) ? groups : [groups];
  if (session.mode === 'local-dev' || session.mode === 'local-trusted') return session;
  if (!required.some(group => session.groups.includes(group))) {
    sendJson(res, 403, { success: false, error: 'Insufficient role for this API endpoint', required });
    return { ok: false };
  }
  return session;
}

function requireAdminSession(req, res, options = {}) {
  return requireRoleSession(req, res, ['system.admin'], options);
}

// T2.O10.1: resolve event/command scope from the authenticated session and
// server-side company access. Request bodies and loopback reachability never
// choose the actor or tenant/company scope.
function resolveVNextScope(req, session) {
  if (!dbSync) return { tenantId: '', companyId: '' };
  try {
    const org = require('./vnext/server/org/org-structures');
    const userId = String(session.userId || session.user?.id || '');
    const groups = Array.isArray(session.groups) ? session.groups : [];
    const isAdmin = groups.includes('system.admin') || groups.includes('admin');
    const requested = String(req.headers['x-company-id'] || '').trim();
    if (requested && !isAdmin && !org.userHasCompanyAccess(dbSync, userId, requested, false)) {
      return { error: { status: 403, code: 'COMPANY_SCOPE_DENIED', message: 'authenticated user is not assigned to this company' } };
    }
    const active = requested ? org.getCompany(dbSync, requested) : org.getActiveCompany(dbSync, userId);
    if (!active) return { tenantId: '', companyId: '' };
    const companyId = String(active.company_id || '');
    return { tenantId: String(active.tenant_id || active.tenantId || companyId), companyId };
  } catch (_) {
    return { tenantId: '', companyId: '' };
  }
}

function safeReviewReportSegment(value, fallback = 'report') {
  const cleaned = String(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function saveReviewReport(report) {
  if (!report || typeof report !== 'object') throw new Error('Invalid review report');
  const page = safeReviewReportSegment(report.page || 'page');
  const id = safeReviewReportSegment(report.id || makeId('pilot_review'));
  const file = `${page}-${id}.json`;
  const target = path.join(REVIEW_REPORT_DIR, file);
  const resolvedDir = path.resolve(REVIEW_REPORT_DIR);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(resolvedDir + path.sep)) throw new Error('Invalid review report path');
  fs.mkdirSync(resolvedDir, { recursive: true });
  atomicWriteFileSync(resolvedTarget, JSON.stringify({
    ...report,
    savedAt: new Date().toISOString(),
    storage: { folder: 'review-reports', file }
  }, null, 2));
  return file;
}

function probeDefaultPort() {
  const socket = net.createConnection({ host: '127.0.0.1', port: DEFAULT_PORT });
  let done = false;
  const finish = (occupied, error = '') => {
    if (done) return;
    done = true;
    DEFAULT_PORT_PROBE = { checkedAt: new Date().toISOString(), occupied, error };
    socket.destroy();
  };
  socket.setTimeout(300);
  socket.once('connect', () => finish(true));
  socket.once('timeout', () => finish(false, 'timeout'));
  socket.once('error', error => finish(false, error.code || error.message || 'connection failed'));
}

function gitSnapshot() {
  const cp = require('child_process');
  const run = args => {
    try { return cp.execFileSync('git', args, { cwd: __dirname, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch (_) { return ''; }
  };
  return {
    branch: run(['branch', '--show-current']),
    head: run(['rev-parse', '--short', 'HEAD']),
    latest: run(['log', '--oneline', '--decorate', '--max-count=1']),
    statusShort: run(['status', '--short']),
    remote: run(['remote', '-v']),
  };
}

const INTERNAL_ROUTELESS_VIEWS = ['manager_approvals', 'mobile_inventory_count'];

function routeStaticSnapshot() {
  const htmlPath = path.join(__dirname, 'index.html');
  const viewsDir = path.join(__dirname, 'views');
  const html = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8') : '';
  const nav = [...html.matchAll(/data-page="([^"]+)"/g)].map(match => match[1]);
  const markers = [...html.matchAll(/<!--\s*view:([^\s]+)\s*-->/g)].map(match => match[1]);
  const viewFiles = fs.existsSync(viewsDir) ? fs.readdirSync(viewsDir).filter(file => file.endsWith('.html')).map(file => file.replace(/\.html$/, '')) : [];
  const viewFilesCounted = viewFiles.filter(name => !INTERNAL_ROUTELESS_VIEWS.includes(name)).length;
  const duplicateDataPages = [...new Set(nav.filter((item, idx) => nav.indexOf(item) !== idx))];
  const missingViewFiles = [...new Set(nav)].filter(page => !viewFiles.includes(page));
  const missingMarkers = [...new Set(nav)].filter(page => !markers.includes(page));
  return {
    navCount: new Set(nav).size,
    navTotal: nav.length,
    viewMarkerCount: new Set(markers).size,
    viewMarkerTotal: markers.length,
    viewFiles: viewFilesCounted,
    viewFilesTotal: viewFiles.length,
    viewFilesCounted: viewFilesCounted,
    internalViewFiles: INTERNAL_ROUTELESS_VIEWS,
    duplicateDataPages,
    missingViewFiles,
    missingMarkers,
  };
}


function backupStatusSnapshot() {
  const backups = [];
  try {
    fs.readdirSync(BACKUP_DIR).forEach(file => {
      if (!/^database\.backup\..+\.json$/.test(file)) return;
      const full = path.join(BACKUP_DIR, file);
      const stat = fs.statSync(full);
      backups.push({ file, bytes: stat.size, mtimeMs: stat.mtimeMs, mtime: stat.mtime.toISOString() });
    });
  } catch (_) {}
  backups.sort((a, b) => b.mtimeMs - a.mtimeMs);
  let databaseParse = { ok: false, error: 'database.json not found' };
  try {
    JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    databaseParse = { ok: true };
  } catch (error) {
    databaseParse = { ok: false, error: error.message };
  }
  return {
    backupDir: BACKUP_DIR,
    count: backups.length,
    latest: backups[0] || null,
    databaseParse,
  };
}

function serverStatusSnapshot() {
  return {
    currentPort: ACTIVE_PORT,
    requestedPort: REQUESTED_PORT,
    defaultPort: DEFAULT_PORT,
    fallbackPortUsed: FALLBACK_PORT_USED,
    warning: PORT_WARNING,
    defaultPortProbe: DEFAULT_PORT_PROBE,
    appRoot: __dirname,
    databasePath: DB_FILE,
    sqlitePath: SQLITE_DB_FILE,
    sqliteActive: !!dbSync,
    backupDir: BACKUP_DIR,
    uptimeSeconds: Math.round(process.uptime()),
    nodeVersion: process.version,
    environmentMode: process.env.NODE_ENV || (isDevMode() ? 'local-dev' : 'production'),
  };
}

function safeBackupFileName(file) {
  const name = String(file || '');
  if (!name || name.includes('..') || name.includes('/') || name.includes('\\') || path.basename(name) !== name) return '';
  return /^database\.backup\..+\.json$/.test(name) ? name : '';
}

function collectionCounts(db) {
  const counts = {};
  Object.keys(db || {}).sort().forEach(key => {
    if (Array.isArray(db[key])) counts[key] = db[key].length;
  });
  return counts;
}

function restoreDryRunSnapshot(file) {
  const safeFile = safeBackupFileName(file);
  if (!safeFile) {
    const latest = backupStatusSnapshot().latest?.file || '';
    if (!latest) throw new Error('No backup file available for dry-run');
    return restoreDryRunSnapshot(latest);
  }
  const backupPath = path.join(BACKUP_DIR, safeFile);
  if (!fs.existsSync(backupPath)) throw new Error('Backup file not found');
  const backup = readJsonFile(backupPath);
  const live = dbSync ? loadDbFromSqlite(dbSync) : readJsonFile(DB_FILE);
  const liveKeys = Object.keys(live || {}).sort();
  const backupKeys = Object.keys(backup || {}).sort();
  const liveCounts = collectionCounts(live);
  const backupCounts = collectionCounts(backup);
  const keysOnlyInLive = liveKeys.filter(key => !backupKeys.includes(key));
  const keysOnlyInBackup = backupKeys.filter(key => !liveKeys.includes(key));
  const countDiffs = [...new Set([...Object.keys(liveCounts), ...Object.keys(backupCounts)])]
    .sort()
    .map(key => ({ key, live: liveCounts[key] || 0, backup: backupCounts[key] || 0 }))
    .filter(row => row.live !== row.backup);
  return {
    success: true,
    dryRunOnly: true,
    file: safeFile,
    comparedAt: new Date().toISOString(),
    schema: { live: live._schema_version || null, backup: backup._schema_version || null },
    topLevelKeys: { live: liveKeys.length, backup: backupKeys.length, onlyInLive: keysOnlyInLive, onlyInBackup: keysOnlyInBackup },
    recordCounts: { live: liveCounts, backup: backupCounts, differences: countDiffs },
    warnings: [
      ...(keysOnlyInLive.length ? ['Backup is missing top-level keys present in live database'] : []),
      ...(keysOnlyInBackup.length ? ['Backup has top-level keys not present in live database'] : []),
      ...(countDiffs.length ? ['Some top-level collection counts differ'] : []),
    ],
  };
}

function apiProtectionMatrix() {
  return [
    { endpoint: 'GET /api/auth/session', classification: 'public-safe-session-info', protection: 'public sanitized current session only' },
    { endpoint: 'POST /api/auth/login', classification: 'public-auth-entry', protection: 'public with password hash validation and failure lock' },
    { endpoint: 'POST /api/auth/logout', classification: 'session-clear', protection: 'safe clear, works with or without active session' },
    { endpoint: 'GET /api/server/status', classification: 'read-only diagnostic', protection: 'public sanitized status, no secrets' },
    { endpoint: 'GET /api/release/status', classification: 'read-only diagnostic', protection: 'public sanitized status, no secrets' },
    { endpoint: 'POST /api/tts', classification: 'server-side speech synthesis', protection: 'localhost or login session only; API key stays server-side' },
    { endpoint: 'POST /api/review-report', classification: 'local QA report write', protection: 'localhost or login session only; writes only to review-reports' },
    { endpoint: 'GET /api/db', classification: 'public/dev-safe read', protection: 'local/dev readable; not production-safe' },
    { endpoint: 'POST /api/db', classification: 'dangerous write', protection: 'admin session or local-dev only; T3.3 ACL strips (not rejects) collection groups the role lacks write on, logged to server-acl.log' },
    { endpoint: 'POST /api/collection', classification: 'data write', protection: 'login session or local-dev only; T3.3 ACL rejects (403) if role lacks write on the collection\'s group, logged to server-acl.log' },
    { endpoint: 'POST /api/record', classification: 'data write', protection: 'login session or local-dev only; T3.3 ACL rejects (403) if role lacks write on the collection\'s group, logged to server-acl.log' },
    { endpoint: 'POST /api/upload', classification: 'file write', protection: 'login session or local-dev only' },
    { endpoint: 'POST /api/backup', classification: 'admin backup write', protection: 'system admin/finance manager or local-dev only' },
    { endpoint: 'GET /api/backups', classification: 'admin backup read', protection: 'system admin/finance manager or local-dev only' },
    { endpoint: 'GET /api/backup/verify', classification: 'backup dry verification', protection: 'system admin/finance manager or local-dev only' },
    { endpoint: 'GET|POST /api/restore/dry-run', classification: 'restore dry-run', protection: 'system admin/finance manager or local-dev only' },
    { endpoint: 'POST /api/restore', classification: 'dangerous destructive restore', protection: 'system admin plus typed confirmation and pre-restore backup' },
    { endpoint: 'GET|POST /api/whatsapp/webhook', classification: 'webhook-special', protection: 'verify token/signature/rate limit preserved' },
    { endpoint: 'GET /api/cron/status', classification: 'read-only scheduler diagnostic', protection: 'localhost or system admin/finance manager only' },
    { endpoint: 'POST /api/cron/run', classification: 'scheduler force-run (notification-generator only, no direct finance/payroll writes)', protection: 'localhost or system admin/finance manager only' },
    { endpoint: 'POST /api/cron/alerts/dismiss', classification: 'scheduled alert dismissal', protection: 'localhost or system admin/finance manager only' },
    { endpoint: 'POST /api/sequence/next', classification: 'document numbering (T1.4)', protection: 'open utility; issues next number from dedicated sequences table only (no business data touched), race-safe transaction' },
    { endpoint: 'GET /api/sequence/peek', classification: 'document numbering read (T1.4)', protection: 'open read-only; returns next number without consuming it' },
  ];
}

// Security hardening 2026-07-05: hand the shared helpers to the Jarvis
// security layer (server-side tool gate, approvals, one-time grants, AI proxy).
jarvisSecurity.init({
  sendJson,
  readRequestBody,
  requireSession,
  requireRoleSession,
  appendServerAudit,
  loadDbForMutation,
  saveDb,
  makeId,
});

let octagonScheduler = null;
let octagonCrudEngine = null;
let octagonCommercialInbox = null;
let octagonViewsFields = null;
let octagonPrintTemplates = null;
let octagonWorkflowEngine = null;
let octagonChatter = null;
let octagonAclHttp = null;
// Was previously assigned (line ~2856 below) with no declaration anywhere in
// this file — relying on a non-strict-mode implicit global that only exists
// once boot-time init runs. Declared explicitly here, matching every other
// engine above, so a falsy `dbSync` (engine never mounted) leaves this `null`
// instead of throwing ReferenceError on every request.
let octagonDocState = null;
let octagonModuleRoutes = null;
let octagonOrgRoutes = null;
let octagonAuthRoutes = null;
let octagonFinanceRoutes = null;
let octagonTaxRoutes = null;
let octagonStockRoutes = null;
let octagonConnectivityRoutes = null;
let octagonR2FinanceRoutes = null;
let octagonR3Routes = null;
let octagonPosRoutes = null;
let octagonSubscriptionRoutes = null;
let octagonLoyaltyRoutes = null;
let octagonPortalRoutes = null;
let octagonBookingRoutes = null;
let octagonEcommerceRoutes = null;
let octagonCampaignRoutes = null;
let octagonShopfloorRoutes = null;
let octagonOeeAndonRoutes = null;
let octagonMpsRoutes = null;
let octagonQualityRoutes = null;
let octagonMaintenanceRoutes = null;
let octagonConsolidationRoutes = null;
let octagonLicensingRoutes = null;
let octagonSsoRoutes = null;
let octagonIntegrationRoutes = null;
let octagonSupportRoutes = null;
let octagonPackRoutes = null;
let octagonRetailRoutes = null;
let octagonMarketplaceRoutes = null;

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      success: true,
      generation: 'vnext',
      port: ACTIVE_PORT,
      databasePath: SQLITE_DB_FILE,
      backupDir: BACKUP_DIR,
    });
  }

  // Security hardening 2026-07-05: /api/jarvis/* (server-side tool gate,
  // approvals, grants) and /api/ai/* (provider proxy — keys stay in .env).
  if (jarvisSecurity.handle(req, res, requestUrl)) return;

  if (octagonConnectivityRoutes && octagonConnectivityRoutes.handle(req, res, requestUrl)) return; // T2.O10.1 SSE + idempotent platform commands
  if (requestUrl.pathname.startsWith('/api/vnext/')) {
    return sendJson(res, 503, { success: false, error: 'VNext connectivity foundation is still booting' });
  }
  if (octagonR2FinanceRoutes && octagonR2FinanceRoutes.handle(req, res, requestUrl)) return; // T2.6.1-T2.8.1 AR/AP, bank, reports, localization
  if (octagonR3Routes && octagonR3Routes.handle(req, res, requestUrl)) return; // R3.1-R3.7 commercial vertical slices
  if (octagonPosRoutes && octagonPosRoutes.handle(req, res, requestUrl)) return; // R6.1 POS v2
  if (octagonSubscriptionRoutes && octagonSubscriptionRoutes.handle(req, res, requestUrl)) return; // R6.2 Subscriptions
  if (octagonLoyaltyRoutes && octagonLoyaltyRoutes.handle(req, res, requestUrl)) return; // R6.3 Loyalty
  if (octagonPortalRoutes && octagonPortalRoutes.handle(req, res, requestUrl)) return; // R6.4 Portal
  if (octagonBookingRoutes && octagonBookingRoutes.handle(req, res, requestUrl)) return; // R6.5 Booking
  if (octagonEcommerceRoutes && octagonEcommerceRoutes.handle(req, res, requestUrl)) return; // R6.6 eCommerce
  if (octagonCampaignRoutes && octagonCampaignRoutes.handle(req, res, requestUrl)) return; // R6.7 Campaigns
  if (octagonShopfloorRoutes && octagonShopfloorRoutes.handle(req, res, requestUrl)) return; // R7.1 Shopfloor
  if (octagonOeeAndonRoutes && octagonOeeAndonRoutes.handle(req, res, requestUrl)) return; // R7.2 OEE Andon
  if (octagonMpsRoutes && octagonMpsRoutes.handle(req, res, requestUrl)) return; // R7.3 MPS
  if (octagonQualityRoutes && octagonQualityRoutes.handle(req, res, requestUrl)) return; // R7.4 Quality
  if (octagonMaintenanceRoutes && octagonMaintenanceRoutes.handle(req, res, requestUrl)) return; // R7.5 Maintenance
  if (octagonConsolidationRoutes && octagonConsolidationRoutes.handle(req, res, requestUrl)) return; // R8.1 Consolidation
  if (octagonLicensingRoutes && octagonLicensingRoutes.handle(req, res, requestUrl)) return; // R8.2 Licensing
  if (octagonSsoRoutes && octagonSsoRoutes.handle(req, res, requestUrl)) return; // R8.3 SSO
  if (octagonIntegrationRoutes && octagonIntegrationRoutes.handle(req, res, requestUrl)) return; // R8.4 Integration Hub
  if (octagonSupportRoutes && octagonSupportRoutes.handle(req, res, requestUrl)) return; // R8.5 Supportability
  if (octagonPackRoutes && octagonPackRoutes.handle(req, res, requestUrl)) return; // R9.1 Pack SDK
  if (octagonRetailRoutes && octagonRetailRoutes.handle(req, res, requestUrl)) return; // R9.3 Retail/POS pack
  if (octagonMarketplaceRoutes && octagonMarketplaceRoutes.handle(req, res, requestUrl)) return; // R9.4 Marketplace & pack distribution

  // T3.1: /api/cron/* — server-side scheduler status/force-run/dismiss.
  if (octagonScheduler && octagonScheduler.handle(req, res, requestUrl)) return;
  if (octagonDocState && octagonDocState.handle(req, res, requestUrl)) return; // P1 Generic Document State Machine
  if (octagonCommercialInbox && octagonCommercialInbox.handle(req, res, requestUrl)) return; // P0.5 /api/x/notify + /api/x/approvals
  if (octagonViewsFields && octagonViewsFields.handle(req, res, requestUrl)) return; // P0.7 saved views + custom fields
  if (octagonPrintTemplates && octagonPrintTemplates.handle(req, res, requestUrl)) return; // P0.9 /api/x/print/*
  if (octagonWorkflowEngine && octagonWorkflowEngine.handle(req, res, requestUrl)) return; // P0.10 /api/x/workflows
  if (octagonChatter && octagonChatter.handle(req, res, requestUrl)) return; // P0.3 /api/x/chatter/*

  // T1.13.1: stamp the caller's active-company selection (if any) onto the
  // request before the ACL/CRUD dispatch below, so row-scope company
  // filtering (crud-engine.js's resolveCompanyId()) honors the company
  // switcher when the caller didn't explicitly pass x-company-id.
  if (dbSync) {
    const activeSession = authSessionFromRequest(req);
    if (activeSession && !req.headers['x-company-id']) {
      const orgStructures = require('./vnext/server/org/org-structures');
      const active = orgStructures.getActiveCompany(dbSync, activeSession.session.userId);
      if (active) req.companyId = active.company_id;
    }
  }

  if (octagonModuleRoutes && octagonModuleRoutes.handle(req, res, requestUrl)) return; // T1.12.1 /api/x/modules
  if (octagonOrgRoutes && octagonOrgRoutes.handle(req, res, requestUrl)) return; // T1.13.1 /api/x/org/*
  if (octagonAuthRoutes && octagonAuthRoutes.handle(req, res, requestUrl)) return; // T1.14.1 /api/x/auth/*
  if (octagonFinanceRoutes && octagonFinanceRoutes.handle(req, res, requestUrl)) return; // R2.1 /api/x/finance/*
  if (octagonTaxRoutes && octagonTaxRoutes.handle(req, res, requestUrl)) return; // R2.3 /api/x/finance/tax/*
  if (octagonStockRoutes && octagonStockRoutes.handle(req, res, requestUrl)) return; // R2.5 /api/x/stock/*
  if (octagonAclHttp && octagonAclHttp.handle(req, res, requestUrl)) return; // P0.2 ACL gate + Arabic matrix API; must precede CRUD
  if (octagonCrudEngine && octagonCrudEngine.handle(req, res, requestUrl)) return; // P0.1 /api/x/* platform CRUD

  // T1.4: unified document numbering. POST /api/sequence/next {code, prefix?, padding?}
  // -> { ok, data:{ sequence, number, ... } }. Race-safe (transaction). The
  // client (OctagonSeq) falls back to a local OFFLINE- counter on any non-200.
  if (requestUrl.pathname === '/api/sequence/next' && req.method === 'POST') {
    readRequestBody(req).then(body => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch (_) { return sendJson(res, 400, { ok: false, data: null, error: 'Invalid JSON' }); }
      try {
        const result = issueNextSequence(parsed.code, { prefix: parsed.prefix, padding: parsed.padding });
        return sendJson(res, 200, { ok: true, data: result, error: null });
      } catch (error) {
        return sendJson(res, error.statusCode || 500, { ok: false, data: null, error: error.message || 'Sequence issue failed' });
      }
    }).catch(error => sendJson(res, 500, { ok: false, data: null, error: error.message || 'Sequence request failed' }));
    return;
  }

  // T1.4: GET /api/sequence/peek?code=inv — read the NEXT number without
  // consuming it (diagnostics / settings display; never used for issuing).
  if (requestUrl.pathname === '/api/sequence/peek' && req.method === 'GET') {
    try {
      const code = normalizeSequenceCode(requestUrl.searchParams.get('code'));
      if (!code) return sendJson(res, 400, { ok: false, data: null, error: 'code is required' });
      if (!dbSync) return sendJson(res, 503, { ok: false, data: null, error: 'Sequence store unavailable' });
      const row = dbSync.prepare('SELECT code, prefix, padding, next_number, year FROM sequences WHERE code = ?').get(code);
      return sendJson(res, 200, { ok: true, data: row || null, error: null });
    } catch (error) {
      return sendJson(res, 500, { ok: false, data: null, error: error.message || 'Sequence peek failed' });
    }
  }

  if (requestUrl.pathname === '/api/auth/session' && req.method === 'GET') {
    const active = authSessionFromRequest(req);
    // `enforced` tells the client whether protected APIs would actually reject
    // it without a session — false when this request comes from the trusted
    // localhost console, so the client only nags for re-login on network
    // access where a session is genuinely required.
    const enforced = !isLocalWriteTrusted(req);
    if (!active) return sendJson(res, 200, { authenticated: false, user: null, enforced });
    try {
      // Consulted the same disabled/revoked checks requireSession() applies
      // (found via a live end-to-end test, 2026-07-18: this endpoint used to
      // report `authenticated: true` for a session requireSession() would
      // reject with 401 — a session revoked by a role change looked "still
      // logged in" here while every real protected API call already failed).
      if (dbSync) {
        const authHardening = require('./vnext/server/auth/auth-hardening');
        if (authHardening.isUserDisabled(dbSync, active.session.userId) || authHardening.isSessionRevoked(dbSync, active.session.userId, active.session.createdAt)) {
          authSessions.delete(active.token);
          deletePersistedAuthSession(active.token);
          return sendJson(res, 200, { authenticated: false, user: null, enforced });
        }
      }
      const db = loadDbForMutation();
      const user = userListFromDb(db).find(item => item.id === active.session.userId);
      return sendJson(res, 200, {
        authenticated: !!user,
        user: enrichAuthUser(db, user),
        expiresAt: new Date(active.session.expiresAt).toISOString(),
      });
    } catch (error) {
      return sendJson(res, 500, { authenticated: false, error: error.message || 'Session check failed' });
    }
  }

  if (requestUrl.pathname === '/api/auth/login' && req.method === 'POST') {
    readRequestBody(req).then(body => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch (error) { return sendJson(res, 400, { success: false, error: 'Invalid JSON' }); }
      const userId = String(parsed.userId || '').trim();
      const password = String(parsed.password || '');
      const db = loadDbForMutation();
      const user = userListFromDb(db).find(item => item.id === userId);
      const failure = authFailures.get(userId) || { count: 0, lockedUntil: 0 };
      if (failure.lockedUntil && Date.now() < failure.lockedUntil) {
        appendServerAudit(db, { action: 'login_locked', status: 'blocked', actorId: userId || 'unknown', actorName: user?.displayName || user?.name || userId || 'unknown', payload: { userId, lockedUntil: new Date(failure.lockedUntil).toISOString() } });
        saveDb(db);
        return sendJson(res, 423, { success: false, locked: true, error: 'Account temporarily locked after failed logins' });
      }
      if (!user) {
        appendServerAudit(db, { action: 'login_failed', status: 'failed', actorId: userId || 'unknown', actorName: userId || 'unknown', payload: { userId, reason: 'user_not_found' } });
        saveDb(db);
        return sendJson(res, 401, { success: false, error: 'Invalid credentials' });
      }
      if (!user.passwordHash || !user.passwordSalt) {
        appendServerAudit(db, { action: 'login_setup_required', status: 'blocked', actorId: user.id, actorName: user.displayName || user.name || user.id, payload: { userId: user.id } });
        saveDb(db);
        return sendJson(res, 409, { success: false, setupRequired: true, error: 'Password setup required in local client flow' });
      }
      const authHardening = require('./vnext/server/auth/auth-hardening');
      const confirmedTotpSecret = dbSync ? authHardening.getConfirmedTotpSecret(dbSync, user.id) : null;
      if (confirmedTotpSecret || user.totpSecret) {
        const totpToken = String(parsed.totp || '').trim();
        if (!totpToken || !authHardening.verifyTotp(confirmedTotpSecret || user.totpSecret, totpToken)) {
          appendServerAudit(db, { action: 'login_failed_2fa', status: 'failed', actorId: user.id, actorName: user.displayName || user.name || user.id, payload: { userId: user.id, reason: 'invalid_totp' } });
          saveDb(db);
          return sendJson(res, 401, { success: false, error: 'رمز التحقق الثنائي (2FA OTP) غير صحيح أو منتهي الصلاحية' });
        }
      }
      const expected = String(user.passwordHash || '');
      const actual = hashClientPassword(password, user.passwordSalt);
      if (actual !== expected) {
        failure.count += 1;
        if (failure.count >= 5) failure.lockedUntil = Date.now() + (15 * 60 * 1000);
        authFailures.set(user.id, failure);
        appendServerAudit(db, { action: 'login_failed', status: 'failed', actorId: user.id, actorName: user.displayName || user.name || user.id, payload: { userId: user.id, failedCount: failure.count } });
        saveDb(db);
        return sendJson(res, 401, { success: false, error: 'Invalid credentials', failedCount: failure.count, locked: !!failure.lockedUntil });
      }
      authFailures.delete(user.id);
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = Date.now() + AUTH_SESSION_TTL_MS;
      const sessionRecord = { userId: user.id, createdAt: Date.now(), expiresAt };
      authSessions.set(token, sessionRecord);
      persistAuthSession(token, sessionRecord);
      user.lastServerLoginAt = new Date().toISOString();
      appendServerAudit(db, { action: 'login_success', status: 'success', actorId: user.id, actorName: user.displayName || user.name || user.id, payload: { userId: user.id, expiresAt: new Date(expiresAt).toISOString() } });
      saveDb(db);
      setAuthCookie(res, token, Math.floor(AUTH_SESSION_TTL_MS / 1000));
      return sendJson(res, 200, { success: true, authenticated: true, user: enrichAuthUser(db, user), expiresAt: new Date(expiresAt).toISOString() });
    }).catch(error => sendJson(res, 500, { success: false, error: error.message || 'Login failed' }));
    return;
  }

  if (requestUrl.pathname === '/api/auth/logout' && req.method === 'POST') {
    const active = authSessionFromRequest(req);
    if (active) {
      authSessions.delete(active.token);
      deletePersistedAuthSession(active.token);
    }
    try {
      const db = loadDbForMutation();
      appendServerAudit(db, { action: 'logout_success', status: 'success', actorId: active?.session?.userId || 'unknown', actorName: active?.session?.userId || 'unknown', payload: { userId: active?.session?.userId || '' } });
      saveDb(db);
    } catch (_) {}
    setAuthCookie(res, '', 0);
    return sendJson(res, 200, { success: true });
  }

  if (requestUrl.pathname === '/api/server/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      success: true,
      generatedAt: new Date().toISOString(),
      server: serverStatusSnapshot(),
      apiProtection: apiProtectionMatrix(),
    });
  }

  if (requestUrl.pathname === '/api/release/status' && req.method === 'GET') {
    return sendJson(res, 200, {
      app: 'Octagon ERP',
      phase: 'Phase 7B',
      generatedAt: new Date().toISOString(),
      git: gitSnapshot(),
      route: routeStaticSnapshot(),
      backup: backupStatusSnapshot(),
      server: serverStatusSnapshot(),
      auth: { serverSessionFoundation: true, sessionTtlHours: AUTH_SESSION_TTL_MS / 3600000, activeSessions: authSessions.size, apiProtectionFoundation: true },
      apiProtection: apiProtectionMatrix(),
    });
  }

  if (requestUrl.pathname === '/api/tts' && req.method === 'POST') {
    const session = isLocalRequest(req)
      ? { ok: true, mode: 'local-tts', userId: 'local-tts' }
      : requireSession(req, res, { allowLocalDev: false });
    if (!session.ok) return;
    readRequestBody(req, 32 * 1024).then(async body => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch (error) { return sendJson(res, 400, { success: false, error: 'Invalid JSON' }); }
      try {
        const result = await synthesizeServerTTS(parsed.text, parsed.lang || 'ar-SA');
        return sendJson(res, 200, { success: true, ...result });
      } catch (error) {
        return sendJson(res, error.statusCode || 500, {
          success: false,
          error: error.message || 'TTS failed',
          providerError: error.providerError || undefined
        });
      }
    }).catch(error => sendJson(res, error.message === 'Payload too large' ? 413 : 500, { success: false, error: error.message || 'Failed to read TTS body' }));
    return;
  }

  if (requestUrl.pathname === '/api/review-report' && req.method === 'POST') {
    const session = isLocalRequest(req)
      ? { ok: true, mode: 'local-review', userId: 'local-review' }
      : requireSession(req, res, { allowLocalDev: false });
    if (!session.ok) return;
    readRequestBody(req, 5 * 1024 * 1024).then(body => {
      let parsed = {};
      try { parsed = body ? JSON.parse(body) : {}; } catch (error) { return sendJson(res, 400, { success: false, error: 'Invalid JSON' }); }
      try {
        const report = parsed.report || parsed;
        if (!report || typeof report !== 'object' || !report.page) return sendJson(res, 400, { success: false, error: 'Invalid review report' });
        report.savedBy = report.savedBy || session.userId || 'unknown';
        const file = saveReviewReport(report);
        return sendJson(res, 200, { success: true, file, folder: 'review-reports' });
      } catch (error) {
        return sendJson(res, 400, { success: false, error: error.message || 'Failed to save review report' });
      }
    }).catch(error => sendJson(res, error.message === 'Payload too large' ? 413 : 500, { success: false, error: error.message || 'Failed to read review report body' }));
    return;
  }

  if (requestUrl.pathname === '/api/backup/verify' && req.method === 'GET') {
    const guard = requireRoleSession(req, res, ['system.admin', 'finance.manager']);
    if (!guard.ok) return;
    try {
      const requested = requestUrl.searchParams.get('file') || '';
      const status = backupStatusSnapshot();
      const file = requested || status.latest?.file || '';
      if (!file) return sendJson(res, 404, { success: false, error: 'No backup file available to verify' });
      if (file.includes('..') || file.includes('/') || file.includes('\\') || path.basename(file) !== file) {
        return sendJson(res, 403, { success: false, error: 'Invalid backup filename' });
      }
      const target = path.join(BACKUP_DIR, file);
      if (!fs.existsSync(target)) return sendJson(res, 404, { success: false, error: 'Backup file not found' });
      const errors = verifyBackupAgainstLive(target);
      return sendJson(res, 200, { success: errors.length === 0, file, errors });
    } catch (error) {
      return sendJson(res, 500, { success: false, error: error.message || 'Backup verification failed' });
    }
  }

  if (requestUrl.pathname === '/api/restore/dry-run' && (req.method === 'GET' || req.method === 'POST')) {
    const guard = requireRoleSession(req, res, ['system.admin', 'finance.manager']);
    if (!guard.ok) return;
    const run = body => {
      try {
        let parsed = {};
        if (body) parsed = JSON.parse(body);
        const file = parsed.file || requestUrl.searchParams.get('file') || '';
        return sendJson(res, 200, restoreDryRunSnapshot(file));
      } catch (error) {
        return sendJson(res, 400, { success: false, dryRunOnly: true, error: error.message || 'Restore dry-run failed' });
      }
    };
    if (req.method === 'POST') readRequestBody(req).then(run).catch(error => sendJson(res, 500, { success: false, error: error.message || 'Failed to read request body' }));
    else run('');
    return;
  }

  if (requestUrl.pathname === '/api/whatsapp/webhook' && req.method === 'GET') {
    const mode = requestUrl.searchParams.get('hub.mode');
    const token = requestUrl.searchParams.get('hub.verify_token');
    const challenge = requestUrl.searchParams.get('hub.challenge');
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || 'octagon-local-dev';
    if (mode === 'subscribe' && token === verifyToken && challenge) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.writeHead(200);
      return res.end(challenge);
    }
    return sendJson(res, 403, { success: false, error: 'Webhook verification failed' });
  }

  if (requestUrl.pathname === '/api/whatsapp/webhook' && req.method === 'POST') {
    if (!checkWhatsAppRateLimit(req)) {
      return sendJson(res, 429, { success: false, error: 'Rate limit exceeded' });
    }
    readRequestBody(req).then(rawBody => {
      const signature = verifyWhatsAppSignature(rawBody, req.headers['x-hub-signature-256']);
      if (signature.enforced && !signature.verified) {
        return sendJson(res, 403, { success: false, error: signature.reason });
      }
      let payload;
      try {
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch (error) {
        return sendJson(res, 400, { success: false, error: 'Invalid JSON' });
      }
      try {
        const created = appendWhatsAppWebhookPayload(payload, signature);
        return sendJson(res, 200, {
          success: true,
          received: created.length,
          signatureVerified: signature.verified,
          signatureEnforced: signature.enforced,
          ids: created.map(item => item.id),
        });
      } catch (error) {
        console.error('WhatsApp webhook failed:', error);
        return sendJson(res, 500, { success: false, error: error.message || 'Webhook processing failed' });
      }
    }).catch(error => {
      sendJson(res, error.message === 'Payload too large' ? 413 : 500, { success: false, error: error.message || 'Webhook body read failed' });
    });
    return;
  }

  // API Routes
  if (requestUrl.pathname === '/api/db' && req.method === 'GET') {
    if (dbSync) {
      try {
        const db = loadDbFromSqlite(dbSync);
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(200);
        return res.end(JSON.stringify(db));
      } catch (e) {
        console.error('Failed to load DB from SQLite:', e.message);
      }
    }
    if (!fs.existsSync(DB_FILE)) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(200);
      return res.end(JSON.stringify({ employees: [], config: {} }));
    }
    const data = fs.readFileSync(DB_FILE);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.writeHead(200);
    return res.end(data);
  }

  if (requestUrl.pathname === '/api/db' && req.method === 'POST') {
    const guard = requireAdminSession(req, res);
    if (!guard.ok) return;
    // T1.3: a full-DB-replacement POST must explicitly declare intent. This
    // alone bounces naive/scripted probes (e.g. a bare `curl -X POST
    // /api/db -d '{"omni":{}}'`) before we even look at the payload — the
    // real app's saveData()/PentagonDB.save() send this header.
    if (req.headers['x-octagon-full-sync'] !== 'yes') {
      logWriteGuardRejection('missing_full_sync_header', { path: '/api/db' }, req);
      return sendJson(res, 409, { ok: false, error: 'يتطلب هذا المسار ترويسة X-Octagon-Full-Sync: yes للحفظ الكامل', collection: null });
    }
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        let existing = null;
        if (dbSync) {
          try {
            existing = loadDbFromSqlite(dbSync);
          } catch(e) {}
        } else if (fs.existsSync(DB_FILE)) {
          try {
            existing = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
          } catch (mergeError) {}
        }

        if (existing) {
          V5_PRESERVED_TOP_LEVEL_KEYS.forEach(key => {
            if (parsed[key] === undefined && existing[key] !== undefined) {
              parsed[key] = existing[key];
            }
          });
          // Defensive: never let an empty employees[] in the payload destroy a non-empty existing list.
          // The client's DOMContentLoaded fires saveData(true) BEFORE loadData fully finishes in some
          // races, which used to wipe the entire workforce. If you truly want to delete all employees,
          // do it through the UI (which uses /api/collection or per-record deletes).
          if (Array.isArray(parsed.employees) && parsed.employees.length === 0 &&
              Array.isArray(existing.employees) && existing.employees.length > 0) {
            console.warn('[/api/db POST] refusing to wipe', existing.employees.length, 'employees with empty payload; preserving existing.');
            parsed.employees = existing.employees;
          }
          const tenantResult = applyServerTenantProtectionToDatabase(existing, parsed);
          if (tenantResult.stamped || tenantResult.preservedForeign || tenantResult.preservedMissingCollections) {
            console.warn('[/api/db POST] tenant protection applied', {
              stamped: tenantResult.stamped,
              preservedForeign: tenantResult.preservedForeign,
              preservedMissingCollections: tenantResult.preservedMissingCollections,
            });
          }

          // T3.3: coarse role x collection ACL for the full-DB-replacement
          // path. requireAdminSession above already restricts this endpoint
          // to system.admin-equivalent sessions (who have write-all in
          // acl.json), so in practice this rarely fires today — kept for
          // defense-in-depth / if that restriction is ever loosened. Strips
          // (reverts to existing) rather than rejecting the whole request:
          // saveData() always sends the FULL db state regardless of which
          // collections the current role actually needs to touch, so a hard
          // reject on any incidental difference would be far more
          // disruptive than silently keeping the existing values for groups
          // this session isn't allowed to write.
          if (existing && guard.mode !== 'local-dev' && guard.mode !== 'local-trusted') {
            const aclRole = resolveAclRole(guard);
            const strippedGroups = [];
            Object.keys(ACL_MATRIX.groups || {}).forEach(group => {
              if (aclCan(aclRole, group, 'write')) return;
              (ACL_MATRIX.groups[group].collections || []).forEach(colPath => {
                const existingArr = getNestedPath(existing, colPath);
                const incomingArr = getNestedPath(parsed, colPath);
                if (JSON.stringify(existingArr) === JSON.stringify(incomingArr)) return;
                setNestedPath(parsed, colPath, existingArr);
                strippedGroups.push({ group, collection: colPath });
              });
            });
            if (strippedGroups.length) {
              logAclRejection({ endpoint: '/api/db', actor: guard.userId, role: aclRole, stripped: strippedGroups });
              console.warn('[/api/db POST] ACL stripped unauthorized collection changes:', strippedGroups);
            }
          }

          // T1.3: SERVER_TENANT_COLLECTIONS protection above only runs when
          // multiTenant is on (tenantEnabledForWrite) — for this
          // single-tenant deployment that's a no-op, so account_moves/
          // finance.*/omni.jobOrders currently have NO protection against a
          // partial POST wiping them (only employees does, via the specific
          // check above, and even that misses the "key entirely absent"
          // case since Array.isArray(undefined) is false). This check is
          // tenant-independent and runs unconditionally: reject (409, never
          // silently repair) any payload that would replace a currently
          // non-empty protected collection with an empty or missing one.
          for (const { path: colPath, label } of HARD_PROTECTED_COLLECTIONS) {
            const existingArr = getNestedPath(existing, colPath);
            if (!Array.isArray(existingArr) || existingArr.length === 0) continue; // nothing to protect
            const incomingArr = getNestedPath(parsed, colPath);
            if (Array.isArray(incomingArr) && incomingArr.length > 0) continue; // fine
            logWriteGuardRejection('protected_collection_emptied', { collection: label, existingCount: existingArr.length }, req);
            console.warn(`[/api/db POST] REJECTED — payload would replace ${existingArr.length} existing "${label}" records with empty/missing.`);
            return sendJson(res, 409, { ok: false, error: `تم رفض الحفظ: سيؤدي إلى فقدان بيانات "${label}"`, collection: label });
          }
        }

        // T1.14.1: session rotation on privilege change. This full-sync path
        // is the only place role/group edits currently land (no dedicated
        // PATCH /api/admin/users/:id endpoint exists yet) — diff each user's
        // role/roleId/groups between the prior and incoming state and revoke
        // any of that user's sessions issued before this moment.
        //
        // Corrected 2026-07-18: originally diffed `parsed.employees`, but the
        // real login path (userListFromDb(), server.js:1429) resolves users
        // from `db.users` + `db.omni.users` — NOT `employees`, a completely
        // different collection. That mismatch meant this code never actually
        // fired for any real login-capable user; found by a live end-to-end
        // HTTP test that logged in for real, changed the user's groups
        // through this exact path, and observed the old session was still
        // accepted. Fixed to diff the same two collections userListFromDb()
        // reads, matching its own dedupe-by-id behavior.
        if (dbSync && existing) {
          const authHardening = require('./vnext/server/auth/auth-hardening');
          function collectUsers(state) {
            const top = Array.isArray(state?.users) ? state.users : [];
            const omniUsers = state?.omni && Array.isArray(state.omni.users) ? state.omni.users : [];
            const byId = new Map();
            for (const user of [...top, ...omniUsers]) {
              if (user && user.id && !byId.has(user.id)) byId.set(user.id, user);
            }
            return byId;
          }
          const priorById = collectUsers(existing);
          const nextById = collectUsers(parsed);
          for (const [userId, nextUser] of nextById) {
            const priorUser = priorById.get(userId);
            if (!priorUser) continue;
            const roleChanged = String(priorUser.role || '') !== String(nextUser.role || '') ||
              String(priorUser.roleId || '') !== String(nextUser.roleId || '');
            const groupsChanged = JSON.stringify(priorUser.groups || []) !== JSON.stringify(nextUser.groups || []);
            if (roleChanged || groupsChanged) {
              authHardening.rotateSessionsForUser(dbSync, userId);
            }
          }
        }

        if (dbSync) {
          saveDbToSqlite(dbSync, parsed);
        } else {
          safeSaveDb(parsed);
        }

        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
      } catch (e) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(400);
        res.end(JSON.stringify({ error: e.message || 'Invalid JSON' }));
      }
    });
    return;
  }

  if (requestUrl.pathname === '/api/collection' && req.method === 'POST') {
    const guard = requireSession(req, res);
    if (!guard.ok) return;
    readRequestBody(req).then(body => {
      try {
        const { collection, data } = JSON.parse(body);
        if (!collection || !Array.isArray(data)) {
          return sendJson(res, 400, { error: 'Invalid collection or data' });
        }
        // T3.3: coarse role x collection ACL. Local-dev/loopback trust
        // already grants system.admin (full write), so this only bites
        // real network sessions with a lesser role.
        if (guard.mode !== 'local-dev' && guard.mode !== 'local-trusted') {
          const aclGroup = aclGroupForCollection(collection);
          const aclRole = resolveAclRole(guard);
          if (!aclCan(aclRole, aclGroup, 'write')) {
            logAclRejection({ endpoint: '/api/collection', actor: guard.userId, collection, group: aclGroup, role: aclRole });
            return sendJson(res, 403, { success: false, error: `صلاحياتك لا تسمح بالكتابة على "${collection}"`, collection, group: aclGroup });
          }
        }

        const db = loadDbForMutation();
        const result = mergeTenantCollectionForWrite(db, db, collection, data);
        setNestedPath(db, collection, result.data);
        safeSaveDb(db);
        sendJson(res, 200, { success: true, stamped: result.stamped, preservedForeign: result.preservedForeign });
      } catch (e) {
        sendJson(res, 400, { error: e.message || 'Invalid JSON' });
      }
    }).catch(error => {
      sendJson(res, 500, { error: error.message || 'Failed to read request body' });
    });
    return;
  }

  if (requestUrl.pathname === '/api/record' && req.method === 'POST') {
    const guard = requireSession(req, res);
    if (!guard.ok) return;
    readRequestBody(req).then(body => {
      try {
        const { collection, id, data } = JSON.parse(body);
        if (!collection || !id || !data) {
          return sendJson(res, 400, { error: 'Invalid collection, id, or data' });
        }
        // T3.3: coarse role x collection ACL (see /api/collection above).
        if (guard.mode !== 'local-dev' && guard.mode !== 'local-trusted') {
          const aclGroup = aclGroupForCollection(collection);
          const aclRole = resolveAclRole(guard);
          if (!aclCan(aclRole, aclGroup, 'write')) {
            logAclRejection({ endpoint: '/api/record', actor: guard.userId, collection, group: aclGroup, role: aclRole });
            return sendJson(res, 403, { success: false, error: `صلاحياتك لا تسمح بالكتابة على "${collection}"`, collection, group: aclGroup });
          }
        }

        const db = loadDbForMutation();
        let arr = getNestedPath(db, collection);
        if (!Array.isArray(arr)) {
          arr = [];
          setNestedPath(db, collection, arr);
        }
        const idx = arr.findIndex(item => item && item.id === id);
        const prepared = prepareTenantRecordWrite(db, db, collection, id, data, idx !== -1 ? arr[idx] : null);
        if (idx !== -1) {
          arr[idx] = prepared;
        } else {
          arr.push(prepared);
        }
        safeSaveDb(db);
        sendJson(res, 200, { success: true, stamped: !recordTenantCompanyId(data) && !!recordTenantCompanyId(prepared) });
      } catch (e) {
        sendJson(res, 400, { error: e.message || 'Invalid JSON' });
      }
    }).catch(error => {
      sendJson(res, 500, { error: error.message || 'Failed to read request body' });
    });
    return;
  }

  // Production Hardening Final Lock Sprint (2026-07-04): server-backed
  // idempotency for sensitive postings. See the operation_locks table
  // comment in initializeDatabase() for why this closes the cross-tab race
  // that a client-side in-memory lock cannot.
  if (requestUrl.pathname === '/api/operation-lock/acquire' && req.method === 'POST') {
    const guard = requireSession(req, res);
    if (!guard.ok) return;
    if (!dbSync) { sendJson(res, 503, { error: 'SQLite غير نشطة — لا يمكن ضمان القفل الذري في هذا الوضع' }); return; }
    readRequestBody(req).then(body => {
      try {
        const { lockKey, operationType, sourceCanonicalKey, createdBy } = JSON.parse(body);
        if (!lockKey) return sendJson(res, 400, { error: 'lockKey مطلوب' });
        const STALE_MS = 5 * 60 * 1000;
        const now = new Date().toISOString();
        try {
          dbSync.prepare(`
            INSERT INTO operation_locks (lockKey, id, operationType, sourceCanonicalKey, status, createdAt, completedAt, failedAt, createdBy, relatedMoveId, errorMessage)
            VALUES (?, ?, ?, ?, 'active', ?, NULL, NULL, ?, '', '')
          `).run(lockKey, makeId('lock'), operationType || '', sourceCanonicalKey || '', now, createdBy || 'system');
          return sendJson(res, 200, { acquired: true, reason: 'lock_created', lockKey });
        } catch (insertErr) {
          // PRIMARY KEY collision on lockKey — a lock already exists. This is
          // the atomic uniqueness guarantee: exactly one of any number of
          // concurrent acquire attempts for the same lockKey reaches here.
          const existing = dbSync.prepare('SELECT * FROM operation_locks WHERE lockKey = ?').get(lockKey);
          if (!existing) {
            // Extremely unlikely (row vanished between insert and select) — fail closed.
            return sendJson(res, 500, { error: insertErr.message || 'تعذر الحصول على القفل' });
          }
          if (existing.status === 'completed') {
            return sendJson(res, 200, { acquired: false, reason: 'reused_existing', lockKey, relatedMoveId: existing.relatedMoveId || '' });
          }
          if (existing.status === 'failed') {
            // A failed attempt never completed — safe to reclaim and retry.
            dbSync.prepare(`UPDATE operation_locks SET status='active', createdAt=?, failedAt=NULL, errorMessage='' WHERE lockKey=?`).run(now, lockKey);
            return sendJson(res, 200, { acquired: true, reason: 'reclaimed_after_failed', lockKey });
          }
          // status === 'active'
          const ageMs = Date.now() - new Date(existing.createdAt).getTime();
          if (ageMs <= STALE_MS) {
            return sendJson(res, 200, { acquired: false, reason: 'blocked_in_progress', lockKey, ageMs });
          }
          // Stale active lock. If it never recorded a relatedMoveId, the
          // previous attempt almost certainly died before creating anything —
          // safe to reclaim. If it DID record a relatedMoveId but never
          // completed, we cannot be sure whether the move was fully committed
          // and the "complete" call just failed to arrive, or something else
          // — refuse to guess and surface it for manual review instead.
          if (!existing.relatedMoveId) {
            dbSync.prepare(`UPDATE operation_locks SET status='active', createdAt=?, failedAt=NULL, errorMessage='' WHERE lockKey=?`).run(now, lockKey);
            return sendJson(res, 200, { acquired: true, reason: 'stale_lock_recovered', lockKey });
          }
          return sendJson(res, 200, { acquired: false, reason: 'stale_lock_needs_manual_check', lockKey, relatedMoveId: existing.relatedMoveId, ageMs });
        }
      } catch (e) {
        sendJson(res, 400, { error: e.message || 'Invalid JSON' });
      }
    }).catch(error => sendJson(res, 500, { error: error.message || 'Failed to read request body' }));
    return;
  }

  if (requestUrl.pathname === '/api/operation-lock/complete' && req.method === 'POST') {
    const guard = requireSession(req, res);
    if (!guard.ok) return;
    if (!dbSync) { sendJson(res, 503, { error: 'SQLite غير نشطة' }); return; }
    readRequestBody(req).then(body => {
      try {
        const { lockKey, relatedMoveId } = JSON.parse(body);
        if (!lockKey) return sendJson(res, 400, { error: 'lockKey مطلوب' });
        dbSync.prepare(`UPDATE operation_locks SET status='completed', completedAt=?, relatedMoveId=? WHERE lockKey=?`)
          .run(new Date().toISOString(), relatedMoveId || '', lockKey);
        sendJson(res, 200, { success: true });
      } catch (e) {
        sendJson(res, 400, { error: e.message || 'Invalid JSON' });
      }
    }).catch(error => sendJson(res, 500, { error: error.message || 'Failed to read request body' }));
    return;
  }

  // Used when the operation the lock represents gets reversed (e.g.
  // reopenPayrollPeriod cancels the accrual/advance-settlement moves) — a
  // 'completed' lock pointing at a now-cancelled move must not make the next
  // genuine posting attempt believe it can "reuse" a move that no longer
  // applies. Deleting the row lets the next acquire start fresh.
  if (requestUrl.pathname === '/api/operation-lock/reset' && req.method === 'POST') {
    const guard = requireSession(req, res);
    if (!guard.ok) return;
    if (!dbSync) { sendJson(res, 503, { error: 'SQLite غير نشطة' }); return; }
    readRequestBody(req).then(body => {
      try {
        const { lockKey } = JSON.parse(body);
        if (!lockKey) return sendJson(res, 400, { error: 'lockKey مطلوب' });
        dbSync.prepare('DELETE FROM operation_locks WHERE lockKey=?').run(lockKey);
        sendJson(res, 200, { success: true });
      } catch (e) {
        sendJson(res, 400, { error: e.message || 'Invalid JSON' });
      }
    }).catch(error => sendJson(res, 500, { error: error.message || 'Failed to read request body' }));
    return;
  }

  if (requestUrl.pathname === '/api/operation-lock/fail' && req.method === 'POST') {
    const guard = requireSession(req, res);
    if (!guard.ok) return;
    if (!dbSync) { sendJson(res, 503, { error: 'SQLite غير نشطة' }); return; }
    readRequestBody(req).then(body => {
      try {
        const { lockKey, errorMessage } = JSON.parse(body);
        if (!lockKey) return sendJson(res, 400, { error: 'lockKey مطلوب' });
        dbSync.prepare(`UPDATE operation_locks SET status='failed', failedAt=?, errorMessage=? WHERE lockKey=?`)
          .run(new Date().toISOString(), String(errorMessage || '').slice(0, 500), lockKey);
        sendJson(res, 200, { success: true });
      } catch (e) {
        sendJson(res, 400, { error: e.message || 'Invalid JSON' });
      }
    }).catch(error => sendJson(res, 500, { error: error.message || 'Failed to read request body' }));
    return;
  }

  if (requestUrl.pathname === '/api/upload' && req.method === 'POST') {
    const guard = requireSession(req, res);
    if (!guard.ok) return;
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body);
        const filename = parsed.filename;
        let content = parsed.content;
        if (!filename || !content) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Filename and content are required' }));
        }
        
        if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(403);
          return res.end(JSON.stringify({ error: 'Security constraint: invalid filename' }));
        }

        const uploadsDir = UPLOADS_DIR;
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir);
        }

        const base64Data = content.replace(/^data:[^;]+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');

        const ext = path.extname(filename);
        const base = path.basename(filename, ext);
        let finalFilename = filename;
        let counter = 1;
        while (fs.existsSync(path.join(uploadsDir, finalFilename))) {
          finalFilename = `${base}_${counter}${ext}`;
          counter++;
        }

        fs.writeFileSync(path.join(uploadsDir, finalFilename), buffer);
        
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(200);
        res.end(JSON.stringify({ success: true, url: `/uploads/${finalFilename}` }));
      } catch (e) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message || 'Upload failed' }));
      }
    });
    return;
  }

  if (requestUrl.pathname === '/api/backup' && req.method === 'POST') {
    const guard = requireRoleSession(req, res, ['system.admin', 'finance.manager']);
    if (!guard.ok) return;
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const result = createDatabaseBackup(parsed.tag || 'manual');
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(200);
        res.end(JSON.stringify(result));
      } catch (e) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(500);
        res.end(JSON.stringify({ success: false, error: e.message || 'Backup failed' }));
      }
    });
    return;
  }

  if (requestUrl.pathname === '/api/backups' && req.method === 'GET') {
    const guard = requireRoleSession(req, res, ['system.admin', 'finance.manager']);
    if (!guard.ok) return;
    try {
      const files = fs.readdirSync(BACKUP_DIR);
      const backupRegex = /^database\.backup\.(.+)\.json$/;
      const backups = [];
      
      files.forEach(file => {
        const match = file.match(backupRegex);
        if (match) {
          const parts = match[1].split('.');
          const timestamp = parts.pop();
          if (!/^\d{8}_\d{4,6}$/.test(timestamp || '')) return;
          const filePath = path.join(BACKUP_DIR, file);
          const stat = fs.statSync(filePath);
          backups.push({
            file: file,
            tag: parts.join('.') || 'manual',
            timestamp,
            bytes: stat.size,
            created: stat.mtimeMs
          });
        }
      });
      
      backups.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(200);
      res.end(JSON.stringify(backups));
    } catch (e) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.writeHead(500);
      res.end(JSON.stringify({ error: e.message || 'Failed to list backups' }));
    }
    return;
  }

  if (requestUrl.pathname === '/api/restore' && req.method === 'POST') {
    const guard = requireAdminSession(req, res);
    if (!guard.ok) return;
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      try {
        const parsed = body ? JSON.parse(body) : {};
        const file = parsed.file;
        const expectedConfirmation = file ? `RESTORE ${file}` : '';
        if (!parsed.confirmation || parsed.confirmation !== expectedConfirmation) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(423);
          return res.end(JSON.stringify({
            success: false,
            blocked: true,
            dryRunAvailable: '/api/restore/dry-run',
            error: `Restore is blocked without typed confirmation: ${expectedConfirmation}`
          }));
        }
        
        if (!file) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Filename is required' }));
        }
        
        if (file.includes('..') || file.includes('/') || file.includes('\\') || path.basename(file) !== file) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(403);
          return res.end(JSON.stringify({ error: 'Security constraint: invalid filename' }));
        }
        
        const backupRegex = /^database\.backup\..*\.json$/;
        if (!backupRegex.test(file)) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(400);
          return res.end(JSON.stringify({ error: 'Invalid backup filename format' }));
        }
        
        const backupPath = path.join(BACKUP_DIR, file);
        if (!fs.existsSync(backupPath)) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(404);
          return res.end(JSON.stringify({ error: 'Backup file not found' }));
        }
        
        let safetyBackupName = '';
        try {
          const safetyResult = createDatabaseBackup('pre_restore');
          safetyBackupName = safetyResult.file;
        } catch (safetyErr) {
          console.error('Failed to create safety backup:', safetyErr);
          res.setHeader("Content-Type", "application/json; charset=utf-8");
          res.writeHead(500);
          return res.end(JSON.stringify({ error: 'Failed to create pre-restore safety backup: ' + safetyErr.message }));
        }
        
        fs.copyFileSync(backupPath, DB_FILE);
        
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(200);
        res.end(JSON.stringify({
          success: true,
          restoredFrom: file,
          backupCreated: safetyBackupName
        }));
      } catch (e) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message || 'Restore failed' }));
      }
    });
    return;
  }

  // Static Files
  let filePath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
  if (!isStaticPathSafe(filePath)) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.writeHead(403);
    res.end('<h1>403 - غير مسموح بالوصول إلى هذا المسار</h1>');
    return;
  }
  filePath = path.join(__dirname, decodeURIComponent(filePath));

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    // Defense in depth alongside the global uncaughtException handler above:
    // if the client already disconnected/aborted (or anything upstream
    // already responded on this `res`) by the time this async read
    // completes, writing headers again throws ERR_HTTP_HEADERS_SENT.
    if (res.headersSent || res.writableEnded) return;
    if (err) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.writeHead(404);
      res.end('<h1>404 - الملف غير موجود</h1>');
      return;
    }

    // Inject custom API configuration into HTML — non-secret fields only.
    // The API key is intentionally NOT sent to the browser: this route has no
    // session/auth check, so anyone reaching the server could otherwise read
    // the key straight out of page source. callCustomApi() fails closed
    // ("Custom API key not configured") until a real server-side proxy exists.
    let content = data;
    if (filePath.endsWith('index.html')) {
      const apiConfig = {
        endpoint: process.env.CUSTOM_API_ENDPOINT || '',
        provider: process.env.CUSTOM_API_PROVIDER || 'contactbox',
        model: process.env.CUSTOM_API_MODEL || 'gpt-4'
      };
      const injectionScript = `<script>window.__customApiConfig = ${JSON.stringify(apiConfig)};</script>`;
      content = content.toString().replace('</head>', injectionScript + '\n</head>');
    }

    res.setHeader("Content-Type", contentType);
    if (['.html', '.js', '.css'].includes(ext)) {
      res.setHeader('Cache-Control', 'no-store, max-age=0');
    }
    res.writeHead(200);
    res.end(content);
  });
});

function initializeDatabase() {
  recoverDbIfCorrupt();
  
  if (USE_SQLITE) {
    console.log('Database Engine: SQLite Active');
    try {
      dbSync = new DatabaseSync(SQLITE_DB_FILE);
      // WAL + busy_timeout (2026-07-05): with the default journal_mode=delete,
      // ANY second process touching database.db (a verify server on another
      // port, a script, a backup tool) makes concurrent writes throw
      // SQLITE_BUSY immediately — which surfaced to users as failed saves and
      // a misleading "operation in progress (undefined)" toast during payroll
      // posting. WAL lets one writer + many readers coexist, and busy_timeout
      // makes a contended write WAIT up to 5s instead of failing instantly.
      dbSync.exec('PRAGMA journal_mode = WAL;');
      dbSync.exec('PRAGMA busy_timeout = 5000;');
      dbSync.exec('PRAGMA synchronous = NORMAL;');
      dbSync.exec(`
        CREATE TABLE IF NOT EXISTS metadata (
          key TEXT PRIMARY KEY,
          value TEXT
        );
      `);
      dbSync.exec(`
        CREATE TABLE IF NOT EXISTS collections (
          collection TEXT,
          id TEXT,
          data TEXT,
          PRIMARY KEY (collection, id)
        );
      `);
      // Production Hardening Final Lock Sprint (2026-07-04): server/DB-backed
      // idempotency for sensitive postings (payroll accrual, payroll payment,
      // opening balance, finance-transaction posting, and any future
      // sourceCanonicalKey-based posting). `lockKey` is the PRIMARY KEY, so
      // acquiring a lock is a single atomic SQLite INSERT — see
      // acquireOperationLock() below. This is what actually closes the
      // cross-tab/cross-device race that the previous sprint's in-memory
      // Set-based lock could not: the in-memory lock only protected a single
      // browser tab; this table is shared server-side state, and the INSERT's
      // UNIQUE/PRIMARY KEY violation is detected atomically by SQLite even
      // under concurrent requests (Node's single-threaded event loop runs the
      // synchronous DatabaseSync calls in each request handler to completion
      // without interleaving, so two "simultaneous" acquire requests can never
      // both see the row missing and both insert).
      dbSync.exec(`
        CREATE TABLE IF NOT EXISTS operation_locks (
          lockKey TEXT PRIMARY KEY,
          id TEXT,
          operationType TEXT,
          sourceCanonicalKey TEXT,
          status TEXT,
          createdAt TEXT,
          completedAt TEXT,
          failedAt TEXT,
          createdBy TEXT,
          relatedMoveId TEXT,
          errorMessage TEXT
        );
      `);
      // Login sessions survive restarts (2026-07-05) — see persistAuthSession().
      dbSync.exec(`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          token TEXT PRIMARY KEY,
          userId TEXT,
          createdAt INTEGER,
          expiresAt INTEGER
        );
      `);
      // T1.4: unified document numbering (Odoo ir.sequence equivalent). One row
      // per code; next_number is issued and incremented inside a transaction so
      // two concurrent acquire requests can never receive the same number. year
      // enables a yearly reset (INV-2026-00042 -> INV-2027-00001).
      dbSync.exec(`
        CREATE TABLE IF NOT EXISTS sequences (
          code TEXT PRIMARY KEY,
          prefix TEXT,
          padding INTEGER,
          next_number INTEGER,
          year INTEGER
        );
      `);
      restoreAuthSessionsFromDb();

      const rowCount = dbSync.prepare("SELECT COUNT(*) as count FROM metadata").get().count +
                       dbSync.prepare("SELECT COUNT(*) as count FROM collections").get().count;
                       
      if (rowCount === 0 && fs.existsSync(DB_FILE)) {
        console.log('SQLite: Database is empty. Migrating database.json to SQLite database.db...');
        try {
          const jsonDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
          saveDbToSqlite(dbSync, jsonDb);
          console.log('SQLite: Migration completed successfully.');
        } catch (migrationError) {
          console.error('SQLite Migration failed:', migrationError.message);
        }
      }
    } catch (sqliteInitError) {
      console.error('Failed to initialize SQLite DatabaseSync:', sqliteInitError.message);
      dbSync = null;
    }
  }

  if (!dbSync && fs.existsSync(DB_FILE)) {
    // Loud, impossible-to-miss warning (Production Stabilization Sprint,
    // 2026-07-04): SQLite is the sole live store in normal operation, so
    // landing here means the server is about to run the whole app off
    // database.json instead — which could be an old mirror snapshot rather
    // than the true current state. This must never happen silently.
    console.error('════════════════════════════════════════════════════════');
    console.error('⚠️  DEGRADED MODE: SQLite unavailable — running on database.json.');
    console.error('    database.json is a MIRROR, not guaranteed to be current if');
    console.error('    SQLite has ever been active on this machine. Do not treat this');
    console.error('    session as production-safe until database.db is restored.');
    console.error('════════════════════════════════════════════════════════');
  }
}

initializeDatabase();

// T3.1: install after initializeDatabase() so dbSync (if SQLite is active)
// is already set. Read-only notification generators only — see
// server-scheduler.js's own header comment.
octagonScheduler = installOctagonScheduler({
  sqliteDb: dbSync,
  loadDbForMutation,
  saveDb,
  makeId,
  sendJson,
  readRequestBody,
  requireRoleSession,
  isLocalRequest,
  // T1.5: the scheduler's nightly_backup_verify job calls ctx.createDatabaseBackup('scheduler');
  // hand it the full create -> verify -> prune(14) -> log cycle instead of the raw
  // create, so the nightly job satisfies T1.5 without any scheduler-side change.
  createDatabaseBackup: runNightlyBackupCycle,
  backupStatusSnapshot,
  serverStatusSnapshot,
  routeStaticSnapshot,
  dbFile: DB_FILE,
  sqliteDbFile: SQLITE_DB_FILE,
  backupDir: BACKUP_DIR,
});

if (dbSync) {
  // Load and apply VNext migrations and scope seed programmatically on startup.
  //
  // Pre-existing defect found during R1 integration (2026-07-18, not caused by
  // any of the four R1 lanes — none of their own test suites exercise this
  // real server.js boot sequence, they each mount engines directly against a
  // single never-reopened db handle): every octagon* engine below used to be
  // mounted SYNCHRONOUSLY, immediately after kicking off this promise chain —
  // i.e. against the pre-migration `dbSync`. Once the chain resolved, it
  // closed that handle and reassigned `dbSync` to a brand-new instance to
  // clear the prepared-statement/schema cache. Every engine's closure still
  // held the OLD (now-closed) handle, so every /api/x/* request after boot
  // failed with "database is not open". Fixed by moving every mount call
  // into this same async chain, AFTER the reopen, against the final stable
  // handle — mounted exactly once, in the right order, with no duplicate
  // subscriptions (e.g. workflow-engine.js subscribing twice to crud writes).
  import('./vnext/server/db/migration-runner.mjs').then(({ runMigrations }) => {
    return runMigrations({ dbPath: SQLITE_DB_FILE, direction: 'up' });
  }).then((res) => {
    console.log('SQLite: VNext migrations applied:', res.migrations);

    // Close and re-open the main SQLite handle to clear the prepared statement/schema cache
    if (dbSync) {
      dbSync.close();
      const DatabaseSync = require('node:sqlite').DatabaseSync;
      dbSync = new DatabaseSync(SQLITE_DB_FILE);
      dbSync.exec('PRAGMA journal_mode = WAL;');
      dbSync.exec('PRAGMA busy_timeout = 5000;');
      dbSync.exec('PRAGMA synchronous = NORMAL;');
    }

    return import('./vnext/server/db/seed-runner.mjs');
  }).then(({ applyR0ScopeSeed, applyAclAdminDefaultSeed }) => {
    const seed = applyR0ScopeSeed(dbSync);
    if (seed.applied) console.log('SQLite: VNext R0 scope seed applied');
    const aclSeed = applyAclAdminDefaultSeed(dbSync);
    if (aclSeed.applied) console.log('SQLite: VNext ACL admin default grant seeded');

    const aclEngine = require('./vnext/server/acl/acl-engine');
    const posEngine = require('./vnext/server/modules/pos/pos-engine');
    octagonConnectivityRoutes = require('./vnext/server/events/events').mountConnectivityRoutes({
      db: dbSync,
      requireSession,
      readRequestBody,
      sendJson,
      resolveScope: resolveVNextScope,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.userId, role: user.role, roleId: user.roleId, groups: user.roles || user.groups || [] }, permission),
      posCommand: (context, command) => posEngine.syncSale(dbSync, context, command.payload, {
        idempotencyKey: command.idempotency_key,
        runtime: { events: octagonConnectivityRoutes && octagonConnectivityRoutes.events },
      }),
    });
    octagonCrudEngine = require('./vnext/server/crud/crud-engine').mountCrud({ db: dbSync, sendJson, readRequestBody, authSessionFromRequest, requireSession });
    octagonAclHttp = aclEngine.mountAclHttp({ db: dbSync, requireSession, sendJson, readRequestBody });
    octagonChatter = require('./vnext/server/chatter/chatter').mountChatterWithCrud({ db: dbSync, crudEngine: octagonCrudEngine, authSessionFromRequest });
    octagonCommercialInbox = require('./vnext/server/notify/notify').mountNotify({ db: dbSync, authSessionFromRequest, events: octagonConnectivityRoutes.events, resolveScope: resolveVNextScope });
    octagonViewsFields = require('./vnext/server/fields/custom-fields').createViewsFieldsHandler({ db: dbSync, sendJson, requireSession });
    octagonPrintTemplates = require('./vnext/server/print/print-templates').mountPrintTemplates({ db: dbSync });
    octagonWorkflowEngine = require('./vnext/server/workflow/workflow-engine').mountWorkflow({ db: dbSync, crudEngine: octagonCrudEngine, authSessionFromRequest, readRequestBody, events: octagonConnectivityRoutes.events });
    octagonDocState = require('./vnext/server/state/doc-state').mountDocState({ db: dbSync, authSessionFromRequest, readRequestBody, sendJson, workflowEngine: octagonWorkflowEngine, crudEngine: octagonCrudEngine });
    // T1.5.1: snapshot fields — no .handle() route of its own; registers an
    // audit/CRUD-write subscriber only (see vnext/server/fields/INTEGRATION.md).
    require('./vnext/server/fields/snapshot-fields').createSnapshotFieldsModule({ db: dbSync, crudEngine: octagonCrudEngine });
    octagonModuleRoutes = require('./vnext/server/modules/module-routes').mountModuleRoutes({ db: dbSync, sendJson, readRequestBody, requireSession });
    octagonOrgRoutes = require('./vnext/server/org/org-routes').mountOrgRoutes({ db: dbSync, sendJson, readRequestBody, requireSession });
    octagonAuthRoutes = require('./vnext/server/auth/auth-routes').mountAuthRoutes({ db: dbSync, sendJson, readRequestBody, requireSession });
    octagonFinanceRoutes = require('./vnext/server/finance/finance-routes').mountFinanceRoutes({ db: dbSync, sendJson, readRequestBody, requireSession });
    octagonTaxRoutes = require('./vnext/server/finance/tax-routes').mountTaxRoutes({ db: dbSync, sendJson, readRequestBody, requireSession, authSessionFromRequest });
    octagonStockRoutes = require('./vnext/server/stock/stock-routes').mountStockRoutes({ db: dbSync, sendJson, readRequestBody, requireSession, authSessionFromRequest });
    octagonR2FinanceRoutes = require('./vnext/server/finance/r2-finance-routes').mountR2FinanceRoutes({ db: dbSync, sendJson, readRequestBody, requireSession, resolveScope: resolveVNextScope, canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission) });
  octagonR3Routes = require('./vnext/server/modules/r3-routes').mountR3Routes({ db: dbSync, sendJson, readRequestBody, requireSession, resolveScope: resolveVNextScope, events: octagonConnectivityRoutes && octagonConnectivityRoutes.events, canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission) });
    octagonPosRoutes = require('./vnext/server/modules/pos/pos-routes').mountPosRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonSubscriptionRoutes = require('./vnext/server/modules/subscriptions/subscription-routes').mountSubscriptionRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonLoyaltyRoutes = require('./vnext/server/modules/loyalty/loyalty-routes').mountLoyaltyRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonPortalRoutes = require('./vnext/server/modules/portal/portal-routes').mountPortalRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonBookingRoutes = require('./vnext/server/modules/booking/booking-routes').mountBookingRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonEcommerceRoutes = require('./vnext/server/modules/ecommerce/ecommerce-routes').mountEcommerceRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonCampaignRoutes = require('./vnext/server/modules/campaign/campaign-routes').mountCampaignRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonShopfloorRoutes = require('./vnext/server/modules/shopfloor/shopfloor-routes').mountShopfloorRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonOeeAndonRoutes = require('./vnext/server/modules/shopfloor/oee-andon-routes').mountOeeAndonRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonMpsRoutes = require('./vnext/server/modules/shopfloor/mps-routes').mountMpsRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonQualityRoutes = require('./vnext/server/modules/shopfloor/quality-routes').mountQualityRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonMaintenanceRoutes = require('./vnext/server/modules/shopfloor/maintenance-routes').mountMaintenanceRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonConsolidationRoutes = require('./vnext/server/modules/governance/consolidation-routes').mountConsolidationRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonLicensingRoutes = require('./vnext/server/modules/governance/licensing-routes').mountLicensingRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonSsoRoutes = require('./vnext/server/modules/governance/sso-routes').mountSsoRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonIntegrationRoutes = require('./vnext/server/modules/governance/integration-routes').mountIntegrationRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonSupportRoutes = require('./vnext/server/modules/governance/support-routes').mountSupportRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonPackRoutes = require('./vnext/server/modules/packs/pack-sdk-routes').mountPackRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      events: octagonConnectivityRoutes && octagonConnectivityRoutes.events,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonRetailRoutes = require('./vnext/server/modules/packs/retail-pos-routes').mountRetailRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    octagonMarketplaceRoutes = require('./vnext/server/modules/packs/marketplace-routes').mountMarketplaceRoutes({
      db: dbSync,
      sendJson,
      readRequestBody,
      requireSession,
      resolveScope: resolveVNextScope,
      canPermission: (user, permission) => aclEngine.can(dbSync, { userId: user.id || user.userId, role: user.role, groups: user.groups || [] }, permission),
    });
    console.log('SQLite: VNext engines mounted against the post-migration db handle.');
  }).catch((err) => {
    console.error('SQLite: VNext migration/seed error:', err.message);
  });
}

probeDefaultPort();

let fallbackListenIndex = 0;
server.on('error', error => {
  if (error.code === 'EADDRINUSE' && fallbackListenIndex < FALLBACK_PORTS.length) {
    const blockedPort = PORT;
    const nextPort = FALLBACK_PORTS[fallbackListenIndex++];
    FALLBACK_PORT_USED = true;
    ACTIVE_PORT = nextPort;
    PORT = nextPort;
    PORT_WARNING = `Port ${blockedPort} is already in use. No process was killed; trying fallback port ${nextPort}.`;
    console.warn(PORT_WARNING);
    server.listen(nextPort);
    return;
  }
  console.error(`Server failed to start on port ${PORT}:`, error.message || error);
  process.exitCode = 1;
});

server.listen(REQUESTED_PORT, () => {
  console.log(`\n  ⬡ OCTAGON ERP`);
  console.log(`  ──────────────────────────`);
  console.log(`  ✅ Server running: http://localhost:${PORT}`);
  console.log(`  💾 Database file:  ${DB_FILE}`);
  console.log(`  🛡  Safe persistence: atomic writes + .prev snapshot + auto-recovery\n`);
});
