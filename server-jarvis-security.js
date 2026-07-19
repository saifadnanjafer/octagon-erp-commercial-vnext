/**
 * OCTAGON ERP — SERVER-SIDE JARVIS/OMNI SECURITY LAYER
 * (Security Hardening + Server-Side Mutation Sprint 2026-07-05)
 *
 * Fixes the two critical audit findings:
 *  A) Server-side enforcement for gated/dangerous Jarvis tools.
 *     Before this file, the ONLY gate was client JS (modules/ai-governance.js)
 *     and any browser console could call window.JarvisBrain.tools.<tool>.run().
 *     Now write tools must pass the server gate and execute on the server.
 *  B) AI provider proxy. API keys move to process.env (.env) and NEVER ship
 *     in client JS again. Client calls POST /api/ai/chat and /api/ai/gemini.
 *
 * Routes (wired from server.js):
 *   POST /api/jarvis/action            request authorization for a tool run
 *   POST /api/jarvis/approve           manager approves/rejects a pending action
 *   POST /api/jarvis/execute-approved  manager re-validated server execution
 *   POST /api/jarvis/consume-grant     one-time grant consumption (anti-bypass)
 *   POST /api/jarvis/result            client reports executed/failed for audit
 *   GET  /api/jarvis/approvals         list server-side approval records
 *   POST /api/ai/chat                  OpenRouter / ContactBox proxy (env keys)
 *   POST /api/ai/gemini                Gemini generateContent proxy (env key)
 *
 * IMPORTANT — trust model (honest limits):
 *  - Jarvis write tools execute through server-jarvis-tools.js against the
 *    source-of-truth DB. Browser tool runners are requesters only and never
 *    receive mutation grants for write tools.
 *  - Raw console edits to arbitrary browser globals are still a separate
 *    application risk. This layer closes the Jarvis tool path, not every legacy
 *    app.js UI writer or admin-level /api/db route.
 *  - requireSession() has the existing local-dev bypass (localhost + non-
 *    production => system.admin). In production set OCTAGON_PRODUCTION=true /
 *    NODE_ENV=production so real login sessions are required.
 *
 * Storage (server-owned; deliberately NOT under database.json `omni` because
 * client POST /api/db replaces those collections):
 *  - server-ai-approvals.json  approval records (append/update, atomic write)
 *    (override: OCTAGON_JARVIS_APPROVALS_FILE)
 *  - server-ai-audit.log       append-only JSONL audit trail (secrets scrubbed)
 *    (override: OCTAGON_JARVIS_AUDIT_LOG_FILE)
 *  - grants: in-memory Map, one-time use, 120s TTL
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Server-Side Mutation Sprint 2026-07-05: real write execution lives here.
const serverTools = require('./server-jarvis-tools');
const uiPolicy = require('./server-jarvis-ui-policy');
const serverVerification = require('./server-jarvis-verification');

const APPROVALS_FILE = process.env.OCTAGON_JARVIS_APPROVALS_FILE
  ? path.resolve(process.env.OCTAGON_JARVIS_APPROVALS_FILE)
  : path.join(__dirname, 'server-ai-approvals.json');
const AUDIT_LOG_FILE = process.env.OCTAGON_JARVIS_AUDIT_LOG_FILE
  ? path.resolve(process.env.OCTAGON_JARVIS_AUDIT_LOG_FILE)
  : path.join(__dirname, 'server-ai-audit.log');
const GRANT_TTL_MS = 120 * 1000;
const MANAGER_GROUPS = ['system.admin', 'workshop.manager'];

// ─── Server-side gate table ─────────────────────────────────────────────────
// MIRRORS modules/ai-governance.js (TOOL_RISK / APPROVAL_REQUIRED / GATE_TARGET).
// The server NEVER trusts client risk flags; unknown tools fail closed
// (denied). Keep in sync when ai-governance.js changes.
const TOOL_RISK = {
  // low — reads / navigation (normally never reach the server, but harmless)
  navigate: 'low', click_ui: 'low', lookup_employee_payroll: 'low',
  report_low_stock: 'low', report_overdue_tasks: 'low', report_maintenance: 'low',
  report_attention: 'low', set_language: 'low',
  // medium — create reviewable/simple records (granted immediately, audited)
  create_task: 'medium', create_customer: 'medium',
  propose_purchase: 'medium', propose_finance_review: 'medium',
  propose_payroll_review: 'medium', propose_whatsapp_reply: 'medium',
  // high — direct mutation of business data: approval queue only
  add_customer_debt: 'high', create_sales_receipt: 'high',
  record_customer_payment: 'high', create_purchase_expense: 'high',
  create_journal_entry: 'high', modify_material: 'high', modify_employee: 'high',
  post_finance: 'high', consume_material: 'high', change_price: 'high',
  send_whatsapp: 'high', waive_qc: 'high', close_work_order: 'high',
  archive_record: 'high', browser_search: 'high',
  // critical — code execution / computer control
  execute_js_mutation: 'critical', apply_code_patch: 'critical',
  sandbox_computer_control: 'critical', run_dev_agent: 'critical'
};
const APPROVAL_REQUIRED = [
  'add_customer_debt', 'create_sales_receipt', 'record_customer_payment',
  'create_purchase_expense', 'create_journal_entry', 'modify_material',
  'modify_employee', 'execute_js_mutation', 'post_finance', 'consume_material',
  'change_price', 'send_whatsapp', 'waive_qc', 'close_work_order',
  'archive_record', 'browser_search', 'apply_code_patch',
  'sandbox_computer_control', 'run_dev_agent'
];
const GATE_TARGET = {
  add_customer_debt: 'finance', create_sales_receipt: 'finance',
  record_customer_payment: 'finance', create_purchase_expense: 'finance',
  create_journal_entry: 'finance', post_finance: 'finance', change_price: 'finance',
  modify_employee: 'payroll', modify_material: 'inventory', consume_material: 'inventory',
  send_whatsapp: 'whatsapp', waive_qc: 'qc', close_work_order: 'work_orders',
  execute_js_mutation: 'system_code', apply_code_patch: 'system_code'
};

function serverGateTool(name) {
  const known = Object.prototype.hasOwnProperty.call(TOOL_RISK, name);
  // FAIL CLOSED: an unknown tool name is never assumed safe.
  const risk = known ? TOOL_RISK[name] : 'high';
  const approvalRequired = APPROVAL_REQUIRED.indexOf(name) !== -1
    || risk === 'high' || risk === 'critical' || !known;
  return { known, risk, approvalRequired, target: GATE_TARGET[name] || 'protected_system' };
}

function auditUiClick(session, status, args, classification, extra) {
  return auditEvent(Object.assign({
    status,
    tool: 'click_ui',
    risk: classification && classification.risk || 'sensitive',
    userId: session.userId,
    userMode: session.mode,
    args: Object.assign({}, args || {}, {
      page: classification && classification.action && classification.action.page,
      selector: classification && classification.action && classification.action.selector,
      actionId: classification && classification.action && classification.action.actionId,
      label: classification && classification.action && classification.action.label,
      uiPolicy: {
        allowed: !!(classification && classification.allowed),
        risk: classification && classification.risk,
        category: classification && classification.category,
        reason: classification && classification.reason
      }
    }),
    error: classification && classification.allowed ? '' : ((classification && classification.message) || uiPolicy.DENIED_CLICK_MESSAGE)
  }, extra || {}));
}

function handleJarvisClickUi(req, res, session, args) {
  const classification = uiPolicy.classifyUiAction(args);
  if (!classification.allowed) {
    const a = auditUiClick(session, 'denied', args, classification);
    return H.sendJson(res, 403, {
      ok: false,
      decision: 'denied',
      status: 'denied',
      risk: classification.risk,
      reason: classification.reason,
      message: classification.message,
      error: classification.message,
      uiAction: classification,
      auditId: a.id
    });
  }
  const grantId = issueGrant('click_ui', classification.action, session.userId);
  const a = auditUiClick(session, 'granted', args, classification, { grantId });
  return H.sendJson(res, 200, {
    ok: true,
    decision: 'granted',
    status: 'granted',
    grantId,
    risk: classification.risk,
    uiAction: classification,
    auditId: a.id
  });
}

// ─── injected helpers from server.js ────────────────────────────────────────
let H = null;
function init(helpers) {
  H = helpers;
  // hand the server executors the DB + id helpers so they can mutate the
  // source-of-truth DB (SQLite/JSON) directly.
  serverTools.init({
    loadDbForMutation: helpers.loadDbForMutation,
    saveDb: helpers.saveDb,
    makeId: helpers.makeId
  });
  serverVerification.init({
    loadDbForMutation: helpers.loadDbForMutation
  });
}

// ─── audit (file JSONL + existing db audit trail) ───────────────────────────
const SECRET_KEY_RE = /token|secret|apikey|api_key|password|authorization|bearer/i;
function sanitizeArgs(value, depth = 0) {
  if (depth > 3) return '[deep]';
  if (value == null) return value;
  if (typeof value === 'string') return value.length > 300 ? value.slice(0, 300) + '…' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.slice(0, 20).map(v => sanitizeArgs(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    Object.keys(value).slice(0, 30).forEach(k => {
      out[k] = SECRET_KEY_RE.test(k) ? '[redacted]' : sanitizeArgs(value[k], depth + 1);
    });
    return out;
  }
  return String(value);
}

function auditEvent(event) {
  const entry = {
    id: 'aisec_' + Date.now().toString(36) + '_' + crypto.randomBytes(3).toString('hex'),
    timestamp: new Date().toISOString(),
    status: event.status || 'logged',          // requested|granted|approval_queued|denied|approved|rejected|executed|failed|grant_consumed|grant_refused
    tool: event.tool || '',
    risk: event.risk || '',
    userId: event.userId || 'unknown',
    userMode: event.userMode || '',
    args: sanitizeArgs(event.args || {}),
    result: typeof event.result === 'string' ? event.result.slice(0, 300) : '',
    error: typeof event.error === 'string' ? event.error.slice(0, 300) : '',
    approvalId: event.approvalId || '',
    grantId: event.grantId || ''
  };
  // 1) durable append-only JSONL (immune to client /api/db overwrites)
  try { fs.appendFileSync(AUDIT_LOG_FILE, JSON.stringify(entry) + '\n'); } catch (_) {}
  // 2) mirror the important states into the existing server audit trail
  const IMPORTANT = ['granted', 'approval_queued', 'denied', 'approved', 'rejected', 'executed', 'failed'];
  if (IMPORTANT.indexOf(entry.status) !== -1) {
    try {
      const db = H.loadDbForMutation();
      H.appendServerAudit(db, {
        module: 'jarvis_security', source: 'server_gate',
        action: 'ai.server.' + entry.status,
        title: 'AI tool ' + entry.status + ': ' + entry.tool,
        status: entry.status, risk: entry.risk || 'medium',
        actorId: entry.userId, actorName: entry.userId,
        payload: { tool: entry.tool, approvalId: entry.approvalId, grantId: entry.grantId, args: entry.args, result: entry.result, error: entry.error }
      });
      H.saveDb(db);
    } catch (_) {}
  }
  return entry;
}

// ─── approvals persistence (server-owned JSON file) ─────────────────────────
function loadApprovals() {
  try { return JSON.parse(fs.readFileSync(APPROVALS_FILE, 'utf8')); } catch (_) { return []; }
}
function saveApprovals(list) {
  const tmp = APPROVALS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(list.slice(0, 2000), null, 2));
  fs.renameSync(tmp, APPROVALS_FILE);
}

// ─── one-time grants (in-memory) ────────────────────────────────────────────
const grants = new Map(); // grantId -> { tool, args, userId, issuedAt, expiresAt, consumed, reported }
function issueGrant(tool, args, userId) {
  const grantId = 'grant_' + Date.now().toString(36) + '_' + crypto.randomBytes(8).toString('hex');
  grants.set(grantId, {
    tool, args: args || {}, userId,
    issuedAt: Date.now(), expiresAt: Date.now() + GRANT_TTL_MS,
    consumed: false, reported: false
  });
  // opportunistic cleanup
  if (grants.size > 200) {
    const now = Date.now();
    for (const [k, g] of grants) { if (g.expiresAt < now) grants.delete(k); }
  }
  return grantId;
}

// ─── small utils ─────────────────────────────────────────────────────────────
function parseJsonBody(body) {
  if (!body) return {};
  try { return JSON.parse(body); } catch (_) { return null; }
}
function isManagerSession(session) {
  if (session.mode === 'local-dev') return true; // existing dev bypass (temporary; see header)
  return (session.groups || []).some(g => MANAGER_GROUPS.indexOf(g) !== -1);
}

// ════════════════════════════════════════════════════════════════════════════
// JARVIS ACTION ROUTES
// ════════════════════════════════════════════════════════════════════════════
function handleJarvisAction(req, res, session, payload) {
  const tool = String(payload.tool || '').trim();
  const args = (payload.args && typeof payload.args === 'object') ? payload.args : {};
  if (!tool || !/^[a-z0-9_.]{1,80}$/i.test(tool)) {
    const a = auditEvent({ status: 'denied', tool: tool || '(empty)', userId: session.userId, userMode: session.mode, error: 'invalid tool name' });
    return H.sendJson(res, 400, { ok: false, decision: 'denied', status: 'denied', error: 'Invalid tool name', auditId: a.id });
  }
  const gate = serverGateTool(tool); // NEVER trusts client risk flags
  auditEvent({ status: 'requested', tool, risk: gate.risk, userId: session.userId, userMode: session.mode, args });
  if (!gate.known) {
    const a = auditEvent({ status: 'denied', tool, risk: gate.risk, userId: session.userId, userMode: session.mode, args, error: 'unknown tool' });
    return H.sendJson(res, 403, { ok: false, decision: 'denied', status: 'denied', error: 'Unknown Jarvis tool', risk: gate.risk, auditId: a.id });
  }
  if (tool === 'click_ui') {
    return handleJarvisClickUi(req, res, session, args);
  }

  if (!gate.approvalRequired) {
    // safe/medium WRITE tools now EXECUTE SERVER-SIDE — no grant handed back to
    // the browser (Server-Side Mutation Sprint). The client is a requester only.
    if (serverTools.getServerJarvisTool(tool)) {
      const outcome = serverTools.executeServerJarvisTool(tool, args, { userId: session.userId, userMode: session.mode });
      
      const vResult = serverVerification.verifyExecution(tool, args, outcome, { userId: session.userId, userMode: session.mode });
      let status = outcome.status;
      if (outcome.ok) {
        status = (vResult.verified === false) ? 'executed_unverified' : 'executed';
      }

      const a = auditEvent({ 
        status: outcome.ok ? ((vResult.verified === false) ? 'executed_unverified' : 'executed') : (outcome.status === 'denied' ? 'denied' : 'failed'), 
        tool, 
        risk: gate.risk, 
        userId: session.userId, 
        userMode: session.mode, 
        args, 
        result: outcome.message, 
        error: outcome.ok ? '' : outcome.message,
        verification: vResult
      });

      return H.sendJson(res, outcome.ok ? 200 : (outcome.status === 'denied' ? 403 : 500), {
        ok: outcome.ok, 
        decision: outcome.status, 
        status: status,
        result: outcome.result || {}, 
        message: outcome.message, 
        risk: gate.risk, 
        auditId: a.id,
        verification: vResult
      });
    }
    // read-only / UI-only tools with no server executor: legacy client-side behavior is safe.
    const grantId = issueGrant(tool, args, session.userId);
    auditEvent({ status: 'granted', tool, risk: gate.risk, userId: session.userId, userMode: session.mode, grantId, args });
    return H.sendJson(res, 200, { ok: true, decision: 'granted', status: 'granted', grantId, risk: gate.risk });
  }

  // gated: create a server-side approval record; DO NOT execute
  const list = loadApprovals();
  const record = {
    id: 'sapr_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex'),
    tool, args, risk: gate.risk, target: gate.target,
    status: 'pending',
    requestedBy: session.userId, requestedMode: session.mode,
    clientActionId: String(payload.clientActionId || payload.requestId || ''),
    createdAt: new Date().toISOString(),
    approvedBy: '', approvedAt: '', executedAt: '', failureReason: ''
  };
  list.unshift(record);
  saveApprovals(list);
  auditEvent({ status: 'approval_queued', tool, risk: gate.risk, userId: session.userId, userMode: session.mode, approvalId: record.id, args });
  return H.sendJson(res, 200, { ok: true, decision: 'approval_required', status: 'approval_required', approvalId: record.id, risk: gate.risk, message: 'Action requires manager approval (server-gated)' });
}

function handleJarvisApprove(req, res, session, payload) {
  const id = String(payload.approvalId || '');
  const decision = payload.decision === 'reject' ? 'reject' : 'approve';
  const list = loadApprovals();
  const record = list.find(r => r.id === id);
  if (!record) return H.sendJson(res, 404, { ok: false, error: 'Approval record not found' });
  if (record.status !== 'pending') return H.sendJson(res, 409, { ok: false, error: 'Approval is not pending (status: ' + record.status + ')' });
  record.status = decision === 'approve' ? 'approved' : 'rejected';
  record.approvedBy = session.userId;
  record.approvedAt = new Date().toISOString();
  if (decision === 'reject') record.failureReason = String(payload.reason || 'rejected by manager').slice(0, 300);
  saveApprovals(list);
  auditEvent({ status: record.status, tool: record.tool, risk: record.risk, userId: session.userId, userMode: session.mode, approvalId: id });
  return H.sendJson(res, 200, { ok: true, status: record.status, approvalId: id });
}

function handleJarvisExecuteApproved(req, res, session, payload) {
  // PART 3 — approval alone is NOT enough: this endpoint re-validates
  // permission (manager role, fresh) and gate policy at execution time,
  // marks the record executed BEFORE returning the grant (double-execution
  // guard), and audits before/after.
  const list = loadApprovals();
  let record = payload.approvalId ? list.find(r => r.id === String(payload.approvalId)) : null;

  // legacy path: client queue items created before server registration —
  // a manager session may register+approve inline (fully audited).
  if (!record && payload.tool) {
    const tool = String(payload.tool || '').trim();
    const gate = serverGateTool(tool);
    record = {
      id: 'sapr_' + Date.now().toString(36) + '_' + crypto.randomBytes(4).toString('hex'),
      tool, args: (payload.args && typeof payload.args === 'object') ? payload.args : {},
      risk: gate.risk, target: gate.target, status: 'approved',
      requestedBy: session.userId, requestedMode: session.mode,
      clientActionId: String(payload.clientActionId || ''),
      createdAt: new Date().toISOString(),
      approvedBy: session.userId + ' (inline)', approvedAt: new Date().toISOString(),
      executedAt: '', grantId: '', failureReason: ''
    };
    list.unshift(record);
    auditEvent({ status: 'approved', tool: record.tool, risk: record.risk, userId: session.userId, userMode: session.mode, approvalId: record.id, error: 'approved_inline (legacy client queue item)' });
  }
  if (!record) return H.sendJson(res, 404, { ok: false, error: 'Approval record not found and no tool given' });

  // 1) re-load + status checks (double-execution guard)
  if (record.status === 'executed' || record.status === 'executed_unverified') {
    auditEvent({ status: 'denied', tool: record.tool, risk: record.risk, userId: session.userId, userMode: session.mode, approvalId: record.id, error: 'double execution blocked' });
    return H.sendJson(res, 409, { ok: false, error: 'Action already executed (double execution blocked)' });
  }
  if (record.status === 'rejected') return H.sendJson(res, 409, { ok: false, error: 'Action was rejected' });
  if (record.status !== 'approved' && record.status !== 'pending') {
    return H.sendJson(res, 409, { ok: false, error: 'Unexpected approval status: ' + record.status });
  }
  // pending + manager session => approve inline (audited), then execute
  if (record.status === 'pending') {
    record.status = 'approved';
    record.approvedBy = session.userId + ' (inline)';
    record.approvedAt = new Date().toISOString();
    auditEvent({ status: 'approved', tool: record.tool, risk: record.risk, userId: session.userId, userMode: session.mode, approvalId: record.id });
  }
  // 2) re-check gate policy at execution time
  const gate = serverGateTool(record.tool);
  if (!gate.known) {
    record.status = 'denied';
    record.failureReason = 'Unknown Jarvis tool';
    saveApprovals(list);
    const a = auditEvent({ status: 'denied', tool: record.tool, risk: gate.risk, userId: session.userId, userMode: session.mode, approvalId: record.id, error: record.failureReason });
    return H.sendJson(res, 403, { ok: false, status: 'denied', error: record.failureReason, approvalId: record.id, auditId: a.id });
  }
  if (record.tool === 'click_ui') {
    const classification = uiPolicy.classifyUiAction(record.args || {});
    record.status = 'denied';
    record.failureReason = uiPolicy.DENIED_CLICK_MESSAGE;
    record.executedAt = '';
    saveApprovals(list);
    const a = auditUiClick(session, 'denied', record.args || {}, classification, {
      approvalId: record.id,
      error: 'approved generic click_ui denied; use a dedicated server-side tool'
    });
    return H.sendJson(res, 403, {
      ok: false,
      status: 'denied',
      decision: 'denied',
      error: uiPolicy.DENIED_CLICK_MESSAGE,
      message: uiPolicy.DENIED_CLICK_MESSAGE,
      reason: classification.reason || 'approved_generic_click_ui_denied',
      approvalId: record.id,
      auditId: a.id
    });
  }
  if (gate.risk === 'critical' && process.env.OCTAGON_ALLOW_CRITICAL_TOOLS !== 'true') {
    record.status = 'blocked';
    record.failureReason = 'critical tools disabled on this server (OCTAGON_ALLOW_CRITICAL_TOOLS != true)';
    saveApprovals(list);
    const a = auditEvent({ status: 'denied', tool: record.tool, risk: gate.risk, userId: session.userId, userMode: session.mode, approvalId: record.id, error: record.failureReason });
    return H.sendJson(res, 403, { ok: false, status: 'denied', error: record.failureReason, approvalId: record.id, auditId: a.id });
  }
  // 3) EXECUTE SERVER-SIDE using the APPROVED args (client args ignored when a
  //    record exists — prevents args-swapping after approval). No grant is ever
  //    returned to the browser for a write tool (Server-Side Mutation Sprint).
  //    Mark executed BEFORE running so a concurrent retry hits the double-exec
  //    guard; roll back to 'approved' only if the executor itself fails.
  record.status = 'executed';
  record.executedAt = new Date().toISOString();
  saveApprovals(list);
  const outcome = serverTools.getServerJarvisTool(record.tool)
    ? serverTools.executeServerJarvisTool(record.tool, record.args, { userId: session.userId, userMode: session.mode })
    : { ok: false, status: 'failed', message: 'No server executor for tool: ' + record.tool, result: {} };
  if (!outcome.ok) {
    record.status = (outcome.status === 'denied') ? 'denied' : 'approved'; // allow retry unless refused
    record.failureReason = outcome.message || 'execution failed';
    record.executedAt = '';
    saveApprovals(list);
    const a = auditEvent({ status: outcome.status === 'denied' ? 'denied' : 'failed', tool: record.tool, risk: record.risk, userId: session.userId, userMode: session.mode, approvalId: record.id, error: outcome.message });
    return H.sendJson(res, outcome.status === 'denied' ? 403 : 500, { ok: false, status: outcome.status, error: outcome.message, approvalId: record.id, auditId: a.id });
  }

  const vResult = serverVerification.verifyExecution(record.tool, record.args, outcome, { 
    userId: session.userId, 
    userMode: session.mode, 
    approvalId: record.id 
  });

  const finalStatus = (vResult.verified === false) ? 'executed_unverified' : 'executed';
  record.status = finalStatus;
  record.result = outcome.result || {};
  record.verification = vResult;
  saveApprovals(list);

  const a = auditEvent({ 
    status: finalStatus, 
    tool: record.tool, 
    risk: record.risk, 
    userId: session.userId, 
    userMode: session.mode, 
    approvalId: record.id, 
    args: record.args, 
    result: outcome.message,
    verification: vResult
  });

  return H.sendJson(res, 200, { 
    ok: true, 
    status: finalStatus, 
    tool: record.tool, 
    result: outcome.result || {}, 
    message: outcome.message, 
    approvalId: record.id, 
    auditId: a.id,
    verification: vResult
  });
}

function handleJarvisConsumeGrant(req, res, session, payload) {
  const grantId = String(payload.grantId || '');
  const tool = String(payload.tool || '');
  const g = grants.get(grantId);
  if (!g || g.tool !== tool || g.consumed || Date.now() > g.expiresAt) {
    auditEvent({ status: 'grant_refused', tool, userId: session.userId, userMode: session.mode, grantId, error: !g ? 'unknown grant' : (g.consumed ? 'already consumed' : (g.tool !== tool ? 'tool mismatch' : 'expired')) });
    return H.sendJson(res, 403, { ok: false, error: 'Grant invalid, expired, or already consumed' });
  }
  g.consumed = true;
  auditEvent({ status: 'grant_consumed', tool, risk: (serverGateTool(tool) || {}).risk, userId: session.userId, userMode: session.mode, grantId });
  return H.sendJson(res, 200, { ok: true, args: g.args });
}

function handleJarvisResult(req, res, session, payload) {
  const grantId = String(payload.grantId || '');
  const g = grants.get(grantId);
  const ok = payload.ok !== false;
  auditEvent({
    status: ok ? 'executed' : 'failed',
    tool: g ? g.tool : String(payload.tool || ''),
    risk: g ? (serverGateTool(g.tool) || {}).risk : '',
    userId: session.userId, userMode: session.mode, grantId,
    result: String(payload.message || '').slice(0, 300),
    error: ok ? '' : String(payload.message || 'execution failed').slice(0, 300)
  });
  if (g) g.reported = true;
  return H.sendJson(res, 200, { ok: true });
}

// ════════════════════════════════════════════════════════════════════════════
// AI PROVIDER PROXY (keys live in process.env ONLY)
// ════════════════════════════════════════════════════════════════════════════
const OPENROUTER_MODEL_PREFIXES = ['deepseek/', 'qwen/', 'anthropic/', 'openai/', 'google/', 'meta-llama/', 'mistralai/'];

async function handleAiChat(req, res, session, payload) {
  const provider = String(payload.provider || '').toLowerCase();
  const messages = Array.isArray(payload.messages) ? payload.messages : null;
  const options = (payload.options && typeof payload.options === 'object') ? payload.options : {};
  if (!messages || !messages.length || messages.length > 50) {
    return H.sendJson(res, 400, { error: { message: 'messages must be a non-empty array (max 50)' } });
  }
  const totalChars = messages.reduce((n, m) => n + String((m && m.content) || '').length, 0);
  if (totalChars > 300000) return H.sendJson(res, 413, { error: { message: 'messages too large' } });

  let endpoint, key, model, keyName;
  if (provider === 'openrouter') {
    key = process.env.OPENROUTER_API_KEY || ''; keyName = 'OPENROUTER_API_KEY';
    endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    model = String(payload.model || 'deepseek/deepseek-chat');
    if (!OPENROUTER_MODEL_PREFIXES.some(p => model.startsWith(p))) {
      return H.sendJson(res, 400, { error: { message: 'Model not in server allowlist: ' + model } });
    }
  } else if (provider === 'contactbox') {
    key = process.env.CONTACTBOX_API_KEY || ''; keyName = 'CONTACTBOX_API_KEY';
    endpoint = process.env.CONTACTBOX_ENDPOINT || 'https://api.contactboxtools.me/v1/chat/completions';
    model = String(payload.model || 'claude-sonnet-4-6');
    if (!/^claude-[a-z0-9.-]+$/.test(model)) {
      return H.sendJson(res, 400, { error: { message: 'Model not in server allowlist: ' + model } });
    }
  } else {
    return H.sendJson(res, 400, { error: { message: 'Unknown provider: ' + provider + ' (allowed: openrouter, contactbox)' } });
  }
  if (!key) {
    // graceful missing-key answer; the client shows this and falls back
    return H.sendJson(res, 503, { error: { message: keyName + ' is not configured on the server (.env). AI proxy unavailable.' } });
  }

  const body = {
    model, messages,
    temperature: typeof options.temperature === 'number' ? Math.max(0, Math.min(2, options.temperature)) : 0.3,
    max_tokens: Math.min(Number(options.maxTokens) || 1400, 4000)
  };
  if (options.reasoning && provider === 'openrouter') body.reasoning = options.reasoning;

  const headers = { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' };
  if (provider === 'openrouter') { headers['HTTP-Referer'] = 'http://localhost'; headers['X-Title'] = 'Octagon ERP Omni'; }
  if (provider === 'contactbox') headers['User-Agent'] = 'Mozilla/5.0';

  try {
    const upstream = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify(body) });
    let data;
    try { data = await upstream.json(); } catch (_) {
      return H.sendJson(res, 502, { error: { message: provider + ' returned a non-JSON response (HTTP ' + upstream.status + ')' } });
    }
    auditEvent({ status: 'logged', tool: 'ai_proxy:' + provider, userId: session.userId, userMode: session.mode, result: 'model=' + model + ' http=' + upstream.status });
    // return the provider JSON verbatim — never the key
    return H.sendJson(res, upstream.ok ? 200 : upstream.status, data);
  } catch (e) {
    return H.sendJson(res, 502, { error: { message: 'AI proxy fetch failed: ' + (e && e.message || e) } });
  }
}

async function handleAiGemini(req, res, session, payload) {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  if (!key) {
    return H.sendJson(res, 503, { error: { message: 'GEMINI_API_KEY is not configured on the server (.env). AI proxy unavailable.' } });
  }
  const model = String(payload.model || 'gemini-flash-latest');
  if (!/^gemini-[a-z0-9.-]+$/.test(model)) {
    return H.sendJson(res, 400, { error: { message: 'Model not in server allowlist: ' + model } });
  }
  if (!Array.isArray(payload.contents) || !payload.contents.length) {
    return H.sendJson(res, 400, { error: { message: 'contents must be a non-empty array' } });
  }
  const body = { contents: payload.contents };
  if (payload.generationConfig && typeof payload.generationConfig === 'object') body.generationConfig = payload.generationConfig;
  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    let data;
    try { data = await upstream.json(); } catch (_) {
      return H.sendJson(res, 502, { error: { message: 'Gemini returned a non-JSON response (HTTP ' + upstream.status + ')' } });
    }
    auditEvent({ status: 'logged', tool: 'ai_proxy:gemini', userId: session.userId, userMode: session.mode, result: 'model=' + model + ' http=' + upstream.status });
    return H.sendJson(res, upstream.ok ? 200 : upstream.status, data);
  } catch (e) {
    return H.sendJson(res, 502, { error: { message: 'Gemini proxy fetch failed: ' + (e && e.message || e) } });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// ROUTER (called from server.js request handler; returns true when handled)
// ════════════════════════════════════════════════════════════════════════════
function handle(req, res, requestUrl) {
  const p = requestUrl.pathname;
  if (!H) return false; // init() not called — let server.js fall through (404)
  if (!p.startsWith('/api/jarvis/') && !p.startsWith('/api/ai/')) return false;

  // GET /api/jarvis/approvals
  if (p === '/api/jarvis/ui-policy' && req.method === 'GET') {
    const session = H.requireSession(req, res);
    if (!session.ok) return true;
    H.sendJson(res, 200, { ok: true, policy: uiPolicy.listAllowedUiActions() });
    return true;
  }
  if (p === '/api/jarvis/approvals' && req.method === 'GET') {
    const session = H.requireSession(req, res);
    if (!session.ok) return true;
    H.sendJson(res, 200, { ok: true, approvals: loadApprovals().slice(0, 200).map(r => ({ ...r, args: sanitizeArgs(r.args) })) });
    return true;
  }
  if (p === '/api/jarvis/snapshot' && req.method === 'GET') {
    const session = H.requireSession(req, res);
    if (!session.ok) return true;
    const scope = requestUrl.searchParams.get('scope') || 'brief';
    const db = typeof H.loadDbForMutation === 'function' ? H.loadDbForMutation() : {};
    try {
      const snapshotBuilder = require('./server-jarvis-snapshot');
      const snap = snapshotBuilder.buildJarvisSnapshot({ scope }, { db, session });
      H.sendJson(res, 200, { ok: true, snapshot: snap });
    } catch (e) {
      H.sendJson(res, 500, { ok: false, error: e.message || 'Snapshot builder failed' });
    }
    return true;
  }
  if (p === '/api/jarvis/kb/search' && req.method === 'GET') {
    const session = H.requireSession(req, res);
    if (!session.ok) return true;
    const q = requestUrl.searchParams.get('q') || '';
    const limit = parseInt(requestUrl.searchParams.get('limit')) || 5;
    const db = typeof H.loadDbForMutation === 'function' ? H.loadDbForMutation() : {};
    try {
      const kbRag = require('./server-jarvis-kb-rag');
      const corpus = kbRag.buildKnowledgeCorpus(db);
      const rawResults = kbRag.searchKnowledgeBase(corpus, q, limit);
      const results = rawResults.map(kbRag.redactKbResult);
      H.sendJson(res, 200, { ok: true, results });
    } catch (e) {
      H.sendJson(res, 500, { ok: false, error: e.message });
    }
    return true;
  }
  if (req.method !== 'POST') { H.sendJson(res, 405, { ok: false, error: 'Method not allowed' }); return true; }

  const bodyLimit = p === '/api/ai/gemini' ? 16 * 1024 * 1024 : (p === '/api/ai/chat' ? 2 * 1024 * 1024 : 256 * 1024);
  H.readRequestBody(req, bodyLimit).then(async body => {
    const payload = parseJsonBody(body);
    if (payload === null) return H.sendJson(res, 400, { ok: false, error: 'Invalid JSON' });

    // session first (existing auth foundation; local-dev bypass documented above)
    const managerOnly = (p === '/api/jarvis/approve' || p === '/api/jarvis/execute-approved');
    const session = managerOnly
      ? H.requireRoleSession(req, res, MANAGER_GROUPS)
      : H.requireSession(req, res);
    if (!session.ok) return; // requireSession already sent 401/403

    if (p === '/api/jarvis/action') return handleJarvisAction(req, res, session, payload);
    if (p === '/api/jarvis/approve') return handleJarvisApprove(req, res, session, payload);
    if (p === '/api/jarvis/execute-approved') return handleJarvisExecuteApproved(req, res, session, payload);
    if (p === '/api/jarvis/consume-grant') return handleJarvisConsumeGrant(req, res, session, payload);
    if (p === '/api/jarvis/result') return handleJarvisResult(req, res, session, payload);
    if (p === '/api/jarvis/kb/search') return handleJarvisKbSearch(req, res, session, payload);
    if (p === '/api/jarvis/kb/context') return handleJarvisKbContext(req, res, session, payload);
    if (p === '/api/ai/chat') return handleAiChat(req, res, session, payload);
    if (p === '/api/ai/gemini') return handleAiGemini(req, res, session, payload);
    return H.sendJson(res, 404, { ok: false, error: 'Unknown jarvis/ai endpoint' });
  }).catch(error => {
    H.sendJson(res, error && error.message === 'Payload too large' ? 413 : 500, { ok: false, error: (error && error.message) || 'Failed to read request body' });
  });
  return true;
}

function handleJarvisKbSearch(req, res, session, payload) {
  const db = typeof H.loadDbForMutation === 'function' ? H.loadDbForMutation() : {};
  try {
    const kbRag = require('./server-jarvis-kb-rag');
    const corpus = kbRag.buildKnowledgeCorpus(db);
    const limit = parseInt(payload.limit) || 5;
    const rawResults = kbRag.searchKnowledgeBase(corpus, payload.query || payload.q || '', limit);
    const results = rawResults.map(kbRag.redactKbResult);
    H.sendJson(res, 200, { ok: true, results });
  } catch (e) {
    H.sendJson(res, 500, { ok: false, error: e.message });
  }
}

function handleJarvisKbContext(req, res, session, payload) {
  const db = typeof H.loadDbForMutation === 'function' ? H.loadDbForMutation() : {};
  try {
    const kbRag = require('./server-jarvis-kb-rag');
    const context = kbRag.buildKbGroundingContext(db, payload.query || payload.q || '');
    H.sendJson(res, 200, { ok: true, context });
  } catch (e) {
    H.sendJson(res, 500, { ok: false, error: e.message });
  }
}

module.exports = { init, handle, serverGateTool };
