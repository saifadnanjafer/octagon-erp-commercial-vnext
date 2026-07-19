// R4.1 acceptance: per-module approval policy packs on a disposable database.
// Proves seeded coverage of every sensitive R3 transition, finance maker≠checker,
// authority-limit escalation, kernel maker≠checker enforcement end-to-end, and
// rollback that preserves operator-created policies.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import approvals from '../vnext/server/approvals/approvals.js';
import policyEngine from '../vnext/server/modules/governance/policy-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r4-policy-'));
const dbPath = path.join(temp, 'r4.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

// --- 1. every sensitive R3 transition is covered by a seeded policy ---
const report = policyEngine.coverageReport(db);
check('policy packs seeded for all modules', () => assert.ok(report.modules.includes('finance') && report.modules.includes('procurement') && report.modules.includes('sales') && report.modules.includes('inventory') && report.modules.includes('manufacturing')));
check('every sensitive R3 transition has a seeded policy row', () => {
  assert.equal(report.all_sensitive_covered, true);
  for (const transition of report.sensitive_transitions) assert.ok(transition.covered, `uncovered: ${transition.entity}`);
});
check('finance policies all enforce maker≠checker', () => assert.equal(report.finance_maker_checker_complete, true));
check('assertCovered throws for an ungoverned sensitive transition', () => assert.throws(() => policyEngine.assertCovered(db, 'fiscal_doc:secret_backdoor'), (error) => error.code === 'POLICY_COVERAGE_MISSING'));

// --- 2. authority-limit escalation ---
check('payment under authority limit does not escalate', () => assert.equal(policyEngine.requiresEscalation(db, 'fiscal_doc:payment', 1000000).requiresEscalation, false));
check('payment over authority limit escalates', () => assert.equal(policyEngine.requiresEscalation(db, 'fiscal_doc:payment', 9000000).requiresEscalation, true));
check('zero-limit reversal policy always requires approval (no self-clear)', () => {
  const evaluated = policyEngine.requiresEscalation(db, 'fiscal_doc:reversal', 999999999);
  assert.equal(evaluated.policy.authority_limit, 0);
  assert.equal(evaluated.requiresEscalation, false); // 0 limit = base chain always applies, never bypassed
  assert.deepEqual(evaluated.policy.policy_chain, ['manager', 'admin']);
});

// --- 3. kernel maker≠checker enforcement end-to-end using a seeded policy ---
const creation = approvals._internal.createApproval(db, { entity: 'sales_order', record_id: 'so-1', action: 'credit_override', company_id: 'company-r0-demo', tenant_id: 'company-r0-demo', payload: { amount: 500 } }, 'maker-user');
const approvalId = creation.json.data.id;
check('maker cannot approve own request (kernel separation of duties)', () => {
  const decision = approvals._internal.decideApproval(db, approvalId, 'approve', { user: 'maker-user', roles: ['manager'] });
  assert.equal(decision.status, 403);
});
check('a different checker with the manager role can approve', () => {
  const decision = approvals._internal.decideApproval(db, approvalId, 'approve', { user: 'checker-user', roles: ['manager'] });
  assert.notEqual(decision.status, 403);
});

// --- 4. authority-limit escalation appends admin step to the live chain ---
const bigPayment = approvals._internal.createApproval(db, { entity: 'fiscal_doc:payment', record_id: 'pay-big', action: 'post', company_id: 'company-r0-demo', tenant_id: 'company-r0-demo', payload: { amount: 9000000 } }, 'maker-user');
check('over-limit approval chain includes an escalated admin step', () => {
  const row = db.prepare('SELECT payload FROM x_approvals WHERE id=?').get(bigPayment.json.data.id);
  const chain = JSON.parse(row.payload)._policy.chain;
  assert.ok(chain.includes('admin'), `chain=${JSON.stringify(chain)}`);
});

// --- 5. rollback of 622 alone removes only seeded rows, preserves operator policies ---
db.prepare("INSERT INTO x_approval_policies(entity, policy_chain, authority_limit, escalation_timeout_minutes, module, maker_checker, seeded_by) VALUES('operator_custom:action','[\"manager\"]',0,0,'custom',1,NULL)").run();
const mod = await import(pathToFileURL(path.join(path.resolve('.'), 'migrations', '622_r4_approval_policy_packs.mjs')).href);
const seededEntities = mod.POLICY_PACKS.map((pack) => pack.entity);
mod.migration.down(db);
check('rollback removes every seeded policy row', () => {
  for (const entity of seededEntities) assert.equal(db.prepare('SELECT COUNT(*) n FROM x_approval_policies WHERE entity=?').get(entity).n, 0, entity);
});
check('rollback preserves operator-created policies', () => assert.equal(db.prepare("SELECT COUNT(*) n FROM x_approval_policies WHERE entity='operator_custom:action'").get().n, 1));
check('rollback restores baseline schema (governance columns dropped)', () => {
  const columns = new Set(db.prepare('PRAGMA table_info(x_approval_policies)').all().map((row) => row.name));
  assert.ok(!columns.has('module') && !columns.has('maker_checker') && !columns.has('seeded_by'));
});
check('re-applying up after down restores full coverage (idempotent)', () => { mod.migration.up(db); assert.equal(policyEngine.coverageReport(db).all_sensitive_covered, true); });
db.close();

for (const line of results) console.log(line);
console.log(`R4 APPROVAL POLICY SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
