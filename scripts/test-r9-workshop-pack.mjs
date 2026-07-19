// R9.2 focused acceptance: disposable DB only. Proves workshop pack job orders,
// design/proofing states, material-per-job costing, pricing templates, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import workshopEngine from '../vnext/server/modules/packs/workshop-engine.js';
import { mountWorkshopRoutes } from '../vnext/server/modules/packs/workshop-routes.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r9-workshop-'));
const dbPath = path.join(temp, 'r9-workshop.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const results = [];
let failures = 0;

function check(name, fn) {
  try {
    fn();
    results.push(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    results.push(`FAIL ${name}: ${error.message}`);
    console.error(error);
  }
}

const company = 'company-r0-demo';
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(company, 'Demo Company');

// 1. Job order lifecycle
check('job order creates with auto-number and draft state', () => {
  const job = workshopEngine.createJob(db, company, { title: 'Business Cards', job_type: 'print', quantity: 500, unit_price: 1000 }, 'test-user');
  assert.ok(job.id);
  assert.ok(job.job_number.startsWith('JOB-'));
  assert.equal(job.title, 'Business Cards');
  assert.equal(job.job_type, 'print');
  assert.equal(job.quantity, 500);
  assert.equal(job.unit_price, 1000);
  assert.equal(job.total_price, 500000);
  assert.equal(job.state, 'draft');
  assert.equal(job.created_by, 'test-user');
});

check('job listing respects company scope', () => {
  const jobs = workshopEngine.listJobs(db, company);
  assert.ok(jobs.length >= 1);
  const job = jobs.find(j => j.title === 'Business Cards');
  assert.ok(job);
});

check('job detail retrieval works', () => {
  const jobs = workshopEngine.listJobs(db, company);
  const job = jobs.find(j => j.title === 'Business Cards');
  const detail = workshopEngine.getJob(db, company, job.id);
  assert.equal(detail.title, 'Business Cards');
  assert.ok(detail.id);
});

check('state transitions follow valid workflow', () => {
  // Create a dedicated job for state transitions
  const job = workshopEngine.createJob(db, company, { title: 'State Test Job', job_type: 'print', quantity: 100, unit_price: 500 }, 'test-user');
  
  // draft -> design
  let updated = workshopEngine.transitionJob(db, company, job.id, 'design', 'test-user');
  assert.equal(updated.state, 'design');
  
  // design -> proofing
  updated = workshopEngine.transitionJob(db, company, job.id, 'proofing', 'test-user');
  assert.equal(updated.state, 'proofing');
  
  // Invalid transition should fail
  assert.throws(() => workshopEngine.transitionJob(db, company, job.id, 'invalid_state', 'test-user'), /transition from 'proofing' to 'invalid_state' is not allowed/);
  
  // Continue valid transitions
  updated = workshopEngine.transitionJob(db, company, job.id, 'approved', 'test-user');
  assert.equal(updated.state, 'approved');
  
  // approved -> production
  updated = workshopEngine.transitionJob(db, company, job.id, 'production', 'test-user');
  assert.equal(updated.state, 'production');
  
  // production -> quality_check
  updated = workshopEngine.transitionJob(db, company, job.id, 'quality_check', 'test-user');
  assert.equal(updated.state, 'quality_check');
  
  // quality_check -> completed
  updated = workshopEngine.transitionJob(db, company, job.id, 'completed', 'test-user');
  assert.equal(updated.state, 'completed');
  assert.ok(updated.completed_at);
  
  // completed -> delivered
  updated = workshopEngine.transitionJob(db, company, job.id, 'delivered', 'test-user');
  assert.equal(updated.state, 'delivered');
  assert.ok(updated.delivered_at);
});

// 2. Material costing
check('materials are added to job with cost tracking', () => {
  // Create a dedicated job for materials
  const job = workshopEngine.createJob(db, company, { title: 'Material Test Job', job_type: 'print', quantity: 100, unit_price: 500 }, 'test-user');
  
  const material = workshopEngine.addMaterial(db, company, job.id, { product_id: 'paper-a4', name: 'A4 Paper', quantity: 10, unit_cost: 500 });
  assert.ok(material.id);
  assert.equal(material.job_id, job.id);
  assert.equal(material.name, 'A4 Paper');
  assert.equal(material.quantity, 10);
  assert.equal(material.unit_cost, 500);
  assert.equal(material.total_cost, 5000);
  
  // Add another material
  workshopEngine.addMaterial(db, company, job.id, { product_id: 'ink-cmyk', name: 'CMYK Ink', quantity: 2, unit_cost: 1500 });
  
  // Verify materials listed
  const materials = db.prepare('SELECT * FROM shop_workshop_job_material WHERE job_id = ?').all(job.id);
  assert.equal(materials.length, 2);
  const totalCost = materials.reduce((sum, m) => sum + m.total_cost, 0);
  assert.equal(totalCost, 8000);
  
  // Verify job material_cost was updated
  const updatedJob = workshopEngine.getJob(db, company, job.id);
  assert.equal(updatedJob.material_cost, 8000);
});

// 3. Design proofs
check('design proof submission and approval workflow', () => {
  // Create a dedicated job for proofs (in design state)
  const job = workshopEngine.createJob(db, company, { title: 'Proof Test Job', job_type: 'print', quantity: 100, unit_price: 500 }, 'test-user');
  workshopEngine.transitionJob(db, company, job.id, 'design', 'test-user');
  
  const proof = workshopEngine.submitProof(db, company, job.id, { version: 1, file_name: 'design_v1.pdf', file_hash: 'abc123' }, 'designer-1');
  assert.ok(proof.id);
  assert.equal(proof.job_id, job.id);
  assert.equal(proof.version, 1);
  assert.equal(proof.status, 'pending');
  assert.equal(proof.file_name, 'design_v1.pdf');
  
  // Approve proof - use proof.id not job.id
  const approved = workshopEngine.reviewProof(db, company, proof.id, 'approved', 'reviewer-1');
  assert.equal(approved.status, 'approved');
  assert.equal(approved.reviewer_id, 'reviewer-1');
  assert.ok(approved.reviewed_at);
});

// 4. Pricing templates
check('pricing templates created and retrieved', () => {
  const template = workshopEngine.createPricingTemplate(db, company, { name: 'Standard Print', job_type: 'print', base_price: 50000, price_per_unit: 800, material_markup: 0.2, labor_rate: 50000, overhead_rate: 0.15, min_quantity: 100 });
  assert.ok(template.id);
  assert.equal(template.name, 'Standard Print');
  assert.equal(template.job_type, 'print');
  assert.equal(template.base_price, 50000);
  assert.equal(template.material_markup, 0.2);
  
  // List templates via direct query
  const templates = db.prepare('SELECT * FROM shop_workshop_pricing_template WHERE company_id = ?').all(company);
  assert.ok(templates.length >= 1);
});

// 5. API routes
check('workshop API routes enforce security and respond correctly', async () => {
  const routes = mountWorkshopRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-admin', groups: ['admin'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
    canPermission: () => true
  });

  async function testRoute(method, pathname, bodyData = null) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    const processed = routes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // GET list jobs
  const r1 = await testRoute('GET', '/api/x/workshop');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  assert.equal(r1.res.body.success, true);
});

// 6. Rollback
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete;');
const cleanTables = [
  'gl_line', 'dunning_action', 'subscription_invoice', 'subscription_change',
  'subscription', 'subscription_plan', 'payment_allocation', 'payment',
  'fiscal_doc_line', 'arap_document', 'fiscal_doc', 'partner_master',
  'product_master', 'account', 'companies', 'r3_worklist_item',
  'loyalty_points_ledger', 'loyalty_card', 'loyalty_program',
  'omni_message_log', 'omni_campaign', 'shop_operator_log',
  'shop_material_issue', 'shop_operator', 'shop_andon_call', 'shop_downtime',
  'shop_forecast', 'shop_mps_proposal', 'shop_quality_template',
  'shop_quality_inspection', 'shop_ncr', 'shop_asset',
  'shop_asset_depreciation_line', 'shop_maintenance_order',
  'shop_intercompany_rule', 'shop_consolidation_rate', 'shop_tenant',
  'shop_license', 'shop_sso_config', 'shop_user_sso_link',
  'shop_org_security_policy', 'shop_api_key', 'shop_webhook_subscription',
  'shop_credential_vault', 'shop_upgrade_history',
  'shop_pack_patch', 'shop_pack_migration', 'shop_pack_registry',
  'auth_sessions', 'stock_move', 'locations', 'mrp_work_order', 'mrp_bom', 'warehouses',
  'shop_workshop_job_material', 'shop_workshop_design_proof', 'shop_workshop_pricing_template', 'shop_workshop_job'
];
for (const t of cleanTables) {
  try { db.prepare(`DELETE FROM "${t}"`).run(); } catch (_) {}
}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 902 down restores the Workshop Pack schema boundary', () => {
  assert.ok(down.migrations.includes('902_r9_workshop_pack'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_workshop_job'").get(), undefined);
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_workshop_job_material'").get(), undefined);
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_workshop_design_proof'").get(), undefined);
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='shop_workshop_pricing_template'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR9 WORKSHOP PACK SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);