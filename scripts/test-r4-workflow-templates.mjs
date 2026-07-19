// R4.2 acceptance: standard automation library + worklist activation on a
// disposable database. Each shipped template passes its scenario test (fires on
// its trigger, produces the expected notification/approval); worklist badges are
// company-scoped and accurate; templates retract cleanly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import { mountWorkflow } from '../vnext/server/workflow/workflow-engine.js';
import templates from '../vnext/server/modules/governance/workflow-templates.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r4-wf-'));
const dbPath = path.join(temp, 'r4wf.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const engine = mountWorkflow({ db });
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function notifCount() { return db.prepare('SELECT COUNT(*) n FROM x_notifications').get().n; }
function approvalCount(action) { return db.prepare('SELECT COUNT(*) n FROM x_approvals WHERE action=?').get(action).n; }

// --- 0. migration installed every template ---
check('all shipped templates are installed as workflow data', () => {
  const installed = templates.listInstalled(db);
  assert.equal(installed.length, templates.TEMPLATES.length);
  for (const template of templates.TEMPLATES) assert.ok(installed.some((row) => row.template_key === template.key), `missing ${template.key}`);
});

// --- 1. lead-routing fires on sales_lead created ---
const before1 = notifCount();
engine.fireRecordEvent('sales_lead', 'create', { id: 'lead-1', company_id: 'company-r0-demo', title: 'New lead' });
await sleep(150);
check('lead-routing template notifies on new lead', () => assert.ok(notifCount() > before1));

// --- 2. reorder-alert fires on stock_reorder_request created ---
const before2 = notifCount();
engine.fireRecordEvent('stock_reorder_request', 'create', { id: 'ror-1', company_id: 'company-r0-demo', product_id: 'p1' });
await sleep(150);
check('reorder-alert template notifies on new replenishment suggestion', () => assert.ok(notifCount() > before2));

// --- 3. sla-warning fires only when the condition matches ---
const before3 = notifCount();
engine.fireRecordEvent('helpdesk_ticket_sla', 'update', { id: 'sla-1', company_id: 'company-r0-demo', ticket_id: 't1', sla_state: 'paused' });
await sleep(120);
check('sla-warning template does NOT fire when condition is unmet (paused)', () => assert.equal(notifCount(), before3));
engine.fireRecordEvent('helpdesk_ticket_sla', 'update', { id: 'sla-1', company_id: 'company-r0-demo', ticket_id: 't1', sla_state: 'running' });
await sleep(150);
check('sla-warning template fires when running (condition met)', () => assert.ok(notifCount() > before3));

// --- 4. wo-delay-escalation raises an approval when delayed ---
const beforeApr = approvalCount('delay_escalation');
engine.fireRecordEvent('mrp_work_order', 'update', { id: 'wo-1', company_id: 'company-r0-demo', state: 'delayed' });
await sleep(150);
check('wo-delay-escalation template requests an approval when delayed', () => assert.ok(approvalCount('delay_escalation') > beforeApr));

// --- 5. overdue-invoice-reminder fires on schedule ---
const before5 = notifCount();
await engine.runDueSchedules(Date.now());
await sleep(150);
check('overdue-invoice-reminder template fires on its schedule', () => assert.ok(notifCount() > before5));

// --- 6. worklist badges are company-scoped and accurate ---
const now = new Date().toISOString();
const ins = db.prepare("INSERT INTO r3_worklist_item(id,company_id,entity,record_id,queue,assignee_id,state,created_at) VALUES(?,?,?,?,?,?,?,?)");
db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('company-wl-b', 'WL B');
ins.run('wl1', 'company-r0-demo', 'sales_order', 'so1', 'sales', null, 'open', now);
ins.run('wl2', 'company-r0-demo', 'sales_order', 'so2', 'sales', null, 'open', now);
ins.run('wl3', 'company-r0-demo', 'purchase_order', 'po1', 'procurement', null, 'open', now);
ins.run('wl4', 'company-r0-demo', 'stock_pick', 'pk1', 'warehouse', null, 'done', now); // not open
ins.run('wl5', 'company-wl-b', 'sales_order', 'sob1', 'sales', null, 'open', now);
check('worklist badges count only open items in the scoped company', () => {
  const badgesA = templates.worklistBadges(db, 'company-r0-demo');
  assert.equal(badgesA.sales, 2);
  assert.equal(badgesA.procurement, 1);
  assert.equal(badgesA.warehouse, 0); // the one warehouse item is done, not open
  assert.equal(badgesA.total, 3);
  const badgesB = templates.worklistBadges(db, 'company-wl-b');
  assert.equal(badgesB.sales, 1);
  assert.equal(badgesB.total, 1);
});

// --- 7. templates retract cleanly ---
templates.retractTemplates(db);
check('retract disables all shipped templates', () => assert.equal(templates.listInstalled(db).length, 0));
const afterRetract = notifCount();
engine.fireRecordEvent('sales_lead', 'create', { id: 'lead-2', company_id: 'company-r0-demo', title: 'Post-retract lead' });
await sleep(150);
check('retracted templates no longer fire', () => assert.equal(notifCount(), afterRetract));

engine.stop();
for (const line of results) console.log(line);
console.log(`R4 WORKFLOW TEMPLATES SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
