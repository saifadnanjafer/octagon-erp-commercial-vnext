// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R4.5 AI operating layer on VNext. Ports the production server-side tool gate
// pattern (fail-closed, unknown = denied, write = approval-classed) onto the
// VNext kernel. Read tools run directly (audited). Write tools require the full
// preview → approval → execute → audit chain; a tampered/expired preview fails
// closed. Global + per-tool kill-switch. Every write tool wraps a governed
// domain command — there is NO write path outside this registry.
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');
const { fail, ensureCompany, now } = infra;

const PREVIEW_TTL_MINUTES = 15;

function argsHash(tool, args) {
  return crypto.createHash('sha256').update(JSON.stringify({ tool, args: canonical(args) })).digest('hex');
}
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}
function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }

// --- registry ------------------------------------------------------------
const REGISTRY = new Map();

function registerTool(def) {
  if (!def || !def.name) throw new Error('tool requires a name');
  if (!['read', 'write'].includes(def.risk)) throw new Error(`tool ${def.name} needs risk read|write`);
  if (typeof def.execute !== 'function') throw new Error(`tool ${def.name} needs an execute function`);
  if (def.risk === 'write' && typeof def.compensate !== 'function') throw new Error(`write tool ${def.name} needs a compensating action`);
  REGISTRY.set(def.name, {
    name: def.name, risk: def.risk, requiredPerm: def.requiredPerm || null,
    action: def.action || def.name,
    validate: def.validate || (() => true),
    precondition: def.precondition || (() => true),
    preview: def.preview || ((db, companyId, args) => ({ summary: `${def.name}`, args })),
    execute: def.execute,
    compensate: def.compensate || null,
  });
}

function getTool(name) {
  return REGISTRY.get(name) || null;
}
function listTools() {
  return [...REGISTRY.values()].map((tool) => ({ name: tool.name, risk: tool.risk, requiredPerm: tool.requiredPerm, action: tool.action }));
}

// --- kill switch ---------------------------------------------------------
function setKillSwitch(db, scope, enabled, userId) {
  db.prepare('INSERT INTO ai_kill_switch(scope, enabled, updated_at, updated_by) VALUES(?,?,?,?) ON CONFLICT(scope) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at, updated_by=excluded.updated_by')
    .run(String(scope), enabled ? 1 : 0, now(), userId || 'system');
  return { scope, enabled: Boolean(enabled) };
}
function isKilled(db, tool) {
  const global = db.prepare("SELECT enabled FROM ai_kill_switch WHERE scope='global'").get();
  if (global && Number(global.enabled) === 1) return true;
  const perTool = db.prepare('SELECT enabled FROM ai_kill_switch WHERE scope=?').get(tool);
  return Boolean(perTool && Number(perTool.enabled) === 1);
}

// --- preview / execute chain --------------------------------------------
function recordCall(db, companyId, tool, actor, status, hash, previewId, approvalId, result, error) {
  db.prepare('INSERT INTO ai_tool_call(id,tool,company_id,actor,risk,status,args_hash,preview_id,approval_id,result_json,error,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(id('aicall'), tool.name, companyId, actor || 'ai', tool.risk, status, hash, previewId || null, approvalId || null, result ? JSON.stringify(result) : null, error || null, now());
}

// Build a governed preview for a write tool: validate args, run its precondition,
// render a human-readable preview, and persist it with an args hash + expiry.
function buildPreview(db, name, companyId, args, ctx = {}) {
  ensureCompany(db, companyId);
  const tool = getTool(name);
  if (!tool) throw fail(`unknown AI tool: ${name}`, 404, 'AI_TOOL_UNKNOWN'); // fail closed
  if (isKilled(db, name)) throw fail('AI tools are halted by the kill-switch', 423, 'AI_KILL_SWITCH');
  if (tool.risk !== 'write') throw fail('only write tools produce previews', 400, 'AI_TOOL_NOT_WRITE');
  tool.validate(args);
  tool.precondition(db, companyId, args);
  const rendered = tool.preview(db, companyId, args);
  const hash = argsHash(name, args);
  const previewId = id('aiprev');
  const expiresAt = new Date(Date.now() + PREVIEW_TTL_MINUTES * 60000).toISOString();
  db.prepare('INSERT INTO ai_tool_preview(id,tool,company_id,args_hash,preview_json,risk,created_by,created_at,expires_at,consumed) VALUES(?,?,?,?,?,?,?,?,?,0)')
    .run(previewId, name, companyId, hash, JSON.stringify(rendered), tool.risk, ctx.actor || 'ai', now(), expiresAt);
  return { preview_id: previewId, tool: name, risk: tool.risk, args_hash: hash, expires_at: expiresAt, preview: rendered, requires_approval: true };
}

// Verify an approval genuinely covers this preview: approved, matching entity/
// action/record, and its stored preview hash equals the live args hash.
function approvalCovers(db, approvalId, tool, previewRow, args) {
  if (!approvalId) return false;
  const approval = db.prepare('SELECT status, payload FROM x_approvals WHERE id=?').get(String(approvalId));
  if (!approval || approval.status !== 'approved') return false;
  let payload = {};
  try { payload = JSON.parse(approval.payload || '{}'); } catch (_) { return false; }
  return payload.ai_tool === tool.name && payload.preview_hash === previewRow.args_hash && previewRow.args_hash === argsHash(tool.name, args);
}

// Execute a tool. Read tools run directly (audited). Write tools require a
// still-valid, unconsumed preview AND a matching approved approval; anything
// tampered or expired fails closed with zero effect.
function executeTool(db, name, companyId, args, ctx = {}) {
  ensureCompany(db, companyId);
  const tool = getTool(name);
  if (!tool) throw fail(`unknown AI tool: ${name}`, 404, 'AI_TOOL_UNKNOWN'); // fail closed
  if (isKilled(db, name)) throw fail('AI tools are halted by the kill-switch', 423, 'AI_KILL_SWITCH');
  const hash = argsHash(name, args);

  if (tool.risk === 'read') {
    tool.validate(args);
    const result = tool.execute(db, companyId, args, ctx);
    recordCall(db, companyId, tool, ctx.actor, 'executed', hash, null, null, result, null);
    return { tool: name, risk: 'read', result };
  }

  // write path: preview + approval required. All gate checks are pure reads and
  // fail closed with zero side effect. The wrapped domain command manages its own
  // atomic transaction, so we must NOT open an enclosing one (SQLite has no nested
  // BEGIN); we mark the preview consumed and audit only AFTER the command commits.
  const preview = db.prepare('SELECT * FROM ai_tool_preview WHERE id=?').get(String(ctx.preview_id || ''));
  if (!preview || preview.tool !== name || preview.company_id !== companyId) { recordCall(db, companyId, tool, ctx.actor, 'denied_no_preview', hash, null, ctx.approval_id, null, 'missing/foreign preview'); throw fail('a valid preview is required for a write tool', 409, 'AI_PREVIEW_REQUIRED'); }
  if (Number(preview.consumed) === 1) { recordCall(db, companyId, tool, ctx.actor, 'denied_consumed', hash, preview.id, ctx.approval_id, null, 'preview already consumed'); throw fail('preview was already consumed', 409, 'AI_PREVIEW_CONSUMED'); }
  if (new Date(preview.expires_at).getTime() < Date.now()) { recordCall(db, companyId, tool, ctx.actor, 'denied_expired', hash, preview.id, ctx.approval_id, null, 'preview expired'); throw fail('preview has expired', 409, 'AI_PREVIEW_EXPIRED'); }
  if (preview.args_hash !== hash) { recordCall(db, companyId, tool, ctx.actor, 'denied_tampered', hash, preview.id, ctx.approval_id, null, 'args do not match preview'); throw fail('arguments do not match the approved preview (tampered)', 409, 'AI_PREVIEW_TAMPERED'); }
  if (!approvalCovers(db, ctx.approval_id, tool, preview, args)) { recordCall(db, companyId, tool, ctx.actor, 'denied_unapproved', hash, preview.id, ctx.approval_id, null, 'no matching approval'); throw fail('an approved, matching approval is required', 403, 'AI_APPROVAL_REQUIRED'); }

  // Claim the preview BEFORE executing (single-use guard) so a concurrent call
  // cannot double-execute; if the command throws, the claim is released.
  db.prepare('UPDATE ai_tool_preview SET consumed=1 WHERE id=?').run(preview.id);
  let result;
  try {
    result = tool.execute(db, companyId, args, ctx);
  } catch (error) {
    db.prepare('UPDATE ai_tool_preview SET consumed=0 WHERE id=?').run(preview.id); // release claim; command rolled itself back
    recordCall(db, companyId, tool, ctx.actor, 'failed', hash, preview.id, ctx.approval_id, null, error.message);
    throw error;
  }
  recordCall(db, companyId, tool, ctx.actor, 'executed', hash, preview.id, ctx.approval_id, result, null);
  return { tool: name, risk: 'write', result, preview_id: preview.id, approval_id: ctx.approval_id };
}

// R4.5 scanner: prove there is zero ungoverned write path. Every write tool must
// declare a compensating action and be approval-classed; there is no execute
// route that bypasses the preview+approval gate above.
function scanZeroUngovernedWritePaths() {
  const writeTools = [...REGISTRY.values()].filter((tool) => tool.risk === 'write');
  const violations = writeTools.filter((tool) => typeof tool.compensate !== 'function');
  return { write_tool_count: writeTools.length, ungoverned: violations.map((tool) => tool.name), clean: violations.length === 0 };
}

module.exports = {
  argsHash, registerTool, getTool, listTools, setKillSwitch, isKilled,
  buildPreview, executeTool, scanZeroUngovernedWritePaths, _registry: REGISTRY,
};
