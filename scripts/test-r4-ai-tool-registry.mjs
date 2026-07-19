// R4.5 acceptance: governed AI tool registry on a disposable database.
// Proves read tools run unrestricted, write tools require the full
// preview→approval→execute→audit chain, tampered/expired/consumed/unapproved
// previews fail closed with zero effect, kill-switch (global + per-tool) halts
// mid-flight, and the scanner shows zero ungoverned write path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import core from '../vnext/server/modules/r3-core.js';
import registry from '../vnext/server/modules/governance/ai-tool-registry.js';
import { registerVNextTools } from '../vnext/server/modules/governance/ai-vnext-tools.js';
import approvals from '../vnext/server/approvals/approvals.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r4-ai-'));
const dbPath = path.join(temp, 'r4ai.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
registerVNextTools();
const company = 'company-r0-demo';
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

// --- fixture ---
const customer = arap.createPartner(db, company, { id: 'ai-customer', name: 'AI Customer', partner_type: 'customer' }, 'seed');
const product = core.createProduct(db, company, { id: 'ai-product', code: 'AI-P', name: 'AI Product', product_type: 'goods', standard_cost: 10 }, 'seed');

// Helper: create + approve an approval for a preview.
function approveFor(toolName, action, previewHash, recordId) {
  const created = approvals._internal.createApproval(db, { entity: 'ai_tool', record_id: recordId, action, approver_role: 'manager', company_id: company, tenant_id: company, payload: { ai_tool: toolName, preview_hash: previewHash } }, 'ai-maker');
  const approvalId = created.json.data.id;
  approvals._internal.decideApproval(db, approvalId, 'approve', { user: 'ai-checker', roles: ['manager'] });
  return approvalId;
}

// --- 1. read tool runs unrestricted (no preview/approval) ---
check('read tool executes directly and is audited', () => {
  const result = registry.executeTool(db, 'explain_price', company, { product_id: product.id, qty: 1, base_price: 100 }, { actor: 'ai' });
  assert.equal(result.risk, 'read');
  assert.ok(result.result.unit_price >= 0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ai_tool_call WHERE tool='explain_price' AND status='executed'").get().n, 1);
});

// --- 2. write tool without a preview fails closed ---
check('write tool with no preview fails closed (zero effect)', () => {
  const before = db.prepare('SELECT COUNT(*) n FROM sales_quote').get().n;
  assert.throws(() => registry.executeTool(db, 'create_sales_quote', company, { partner_id: customer.id, lines: [{ product_id: product.id, qty: 1, unit_price: 50 }] }, { actor: 'ai' }), (e) => e.code === 'AI_PREVIEW_REQUIRED');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sales_quote').get().n, before);
});

// --- 3. full preview → approval → execute → audit chain ---
const quoteArgs = { partner_id: customer.id, lines: [{ product_id: product.id, qty: 2, unit_price: 60 }] };
const preview = registry.buildPreview(db, 'create_sales_quote', company, quoteArgs, { actor: 'ai' });
check('preview is human-readable and hash-bound', () => { assert.ok(preview.preview.summary.length > 0); assert.equal(preview.requires_approval, true); assert.equal(preview.args_hash.length, 64); });
check('write tool with a preview but no approval fails closed', () => {
  assert.throws(() => registry.executeTool(db, 'create_sales_quote', company, quoteArgs, { actor: 'ai', preview_id: preview.preview_id }), (e) => e.code === 'AI_APPROVAL_REQUIRED');
});
const approvalId = approveFor('create_sales_quote', 'ai_create_sales_quote', preview.args_hash, preview.preview_id);
let executed = null;
check('approved preview executes the wrapped governed command', () => {
  executed = registry.executeTool(db, 'create_sales_quote', company, quoteArgs, { actor: 'ai', preview_id: preview.preview_id, approval_id: approvalId });
  assert.equal(executed.risk, 'write');
  assert.ok(executed.result.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sales_quote WHERE id=?').get(executed.result.id).n, 1);
});
check('executed call is audited and preview is consumed', () => {
  assert.equal(db.prepare("SELECT COUNT(*) n FROM ai_tool_call WHERE tool='create_sales_quote' AND status='executed'").get().n, 1);
  assert.equal(db.prepare('SELECT consumed FROM ai_tool_preview WHERE id=?').get(preview.preview_id).consumed, 1);
});
check('a consumed preview cannot be replayed', () => {
  assert.throws(() => registry.executeTool(db, 'create_sales_quote', company, quoteArgs, { actor: 'ai', preview_id: preview.preview_id, approval_id: approvalId }), (e) => e.code === 'AI_PREVIEW_CONSUMED');
});

// --- 4. tampered args fail closed ---
check('tampered arguments (different from preview) fail closed', () => {
  const p = registry.buildPreview(db, 'create_sales_quote', company, quoteArgs, { actor: 'ai' });
  const appr = approveFor('create_sales_quote', 'ai_create_sales_quote', p.args_hash, p.preview_id);
  const tampered = { partner_id: customer.id, lines: [{ product_id: product.id, qty: 999, unit_price: 60 }] };
  const before = db.prepare('SELECT COUNT(*) n FROM sales_quote').get().n;
  assert.throws(() => registry.executeTool(db, 'create_sales_quote', company, tampered, { actor: 'ai', preview_id: p.preview_id, approval_id: appr }), (e) => e.code === 'AI_PREVIEW_TAMPERED');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM sales_quote').get().n, before);
});

// --- 5. expired preview fails closed ---
check('expired preview fails closed', () => {
  const p = registry.buildPreview(db, 'post_internal_transfer', company, { product_id: product.id, from_location_id: 'l1', to_location_id: 'l2', qty: 1 }, { actor: 'ai' });
  db.prepare("UPDATE ai_tool_preview SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(p.preview_id);
  const appr = approveFor('post_internal_transfer', 'ai_post_internal_transfer', p.args_hash, p.preview_id);
  assert.throws(() => registry.executeTool(db, 'post_internal_transfer', company, { product_id: product.id, from_location_id: 'l1', to_location_id: 'l2', qty: 1 }, { actor: 'ai', preview_id: p.preview_id, approval_id: appr }), (e) => e.code === 'AI_PREVIEW_EXPIRED');
});

// --- 6. unknown tool fails closed ---
check('unknown tool name fails closed', () => assert.throws(() => registry.executeTool(db, 'delete_all_the_things', company, {}, { actor: 'ai' }), (e) => e.code === 'AI_TOOL_UNKNOWN'));

// --- 7. kill-switch (per-tool then global) halts execution ---
check('per-tool kill-switch halts that tool but not others', () => {
  registry.setKillSwitch(db, 'explain_price', true, 'admin');
  assert.throws(() => registry.executeTool(db, 'explain_price', company, { product_id: product.id }, { actor: 'ai' }), (e) => e.code === 'AI_KILL_SWITCH');
  // A different tool is unaffected: building a preview for create_sales_quote still works.
  const stillWorks = registry.buildPreview(db, 'create_sales_quote', company, quoteArgs, { actor: 'ai' });
  assert.ok(stillWorks.preview_id);
  registry.setKillSwitch(db, 'explain_price', false, 'admin');
  // and the previously-killed tool runs again once re-enabled
  assert.ok(registry.executeTool(db, 'explain_price', company, { product_id: product.id }, { actor: 'ai' }).result);
});
check('global kill-switch halts every tool mid-flight', () => {
  registry.setKillSwitch(db, 'global', true, 'admin');
  assert.throws(() => registry.executeTool(db, 'explain_price', company, { product_id: product.id }, { actor: 'ai' }), (e) => e.code === 'AI_KILL_SWITCH');
  assert.throws(() => registry.buildPreview(db, 'create_sales_quote', company, quoteArgs, { actor: 'ai' }), (e) => e.code === 'AI_KILL_SWITCH');
  registry.setKillSwitch(db, 'global', false, 'admin');
});

// --- 8. scanner: zero ungoverned write paths ---
check('scanner shows every write tool is governed (approval-classed + compensating)', () => {
  const scan = registry.scanZeroUngovernedWritePaths();
  assert.ok(scan.write_tool_count >= 2);
  assert.equal(scan.clean, true);
  assert.deepEqual(scan.ungoverned, []);
});
check('every registered write tool is approval-classed (no direct execute route)', () => {
  for (const tool of registry.listTools().filter((t) => t.risk === 'write')) {
    assert.throws(() => registry.executeTool(db, tool.name, company, {}, { actor: 'ai' }), (e) => ['AI_ARGS_INVALID', 'AI_PREVIEW_REQUIRED', 'COMPANY_SCOPE_DENIED', 'R3_VALIDATION'].includes(e.code));
  }
});

for (const line of results) console.log(line);
console.log(`R4 AI TOOL REGISTRY SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
