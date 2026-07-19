import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dbPath = path.resolve(here, '../vnext-data/test-finance-t241.db');
const migrationsDir = path.resolve(here, '../migrations');

// Ensure clean starting state
try { fs.unlinkSync(dbPath); } catch (_) {}
try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

const DEPENDENCY_SAFE_ORDER = [
  '001_r0_scope_contract.mjs',
  '101_r1_lane_a_tables.mjs',
  '201_r1_lane_b_tables.mjs',
  '301_r1_lane_c_tables.mjs',
  '401_r1_lane_d_tables.mjs',
  '501_r1_kernel_completion.mjs',
  '102_r1_lane_a_completion.mjs',
  '202_r1_lane_b_completion.mjs',
  '302_r1_lane_c_completion.mjs',
  '402_r1_lane_d_completion.mjs',
  '601_r2_finance_baseline.mjs',
  '602_r2_period_locks.mjs',
  '603_r2_tax_engine.mjs',
  '604_r2_accounting_dimensions.mjs',
];

console.log('--- APPLYING MIGRATIONS ---');
const migrationDb = new DatabaseSync(dbPath);
migrationDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
for (const file of DEPENDENCY_SAFE_ORDER) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  mod.migration.up(migrationDb);
  console.log('  applied:', mod.migration.id);
}
migrationDb.close();
console.log('Migrations applied.');

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');

// Seeds
const { applyR0ScopeSeed, applyAclAdminDefaultSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(db);
applyAclAdminDefaultSeed(db);

const financeEngine = require('../vnext/server/finance/finance-engine');
const { mountFinanceRoutes } = require('../vnext/server/finance/finance-routes');

let failures = 0;
function check(name, expr) {
  if (expr) {
    console.log(`  PASS: ${name}`);
  } else {
    console.error(`  FAIL: ${name}`);
    failures++;
  }
}

// Helpers
function seedDimensionSetup() {
  db.prepare(`
    INSERT INTO dimension (id, name, company_id) VALUES ('cost_center', 'Cost Center', 'company-r0-demo')
  `).run();

  db.prepare(`
    INSERT INTO dimension_value (id, dimension_id, code, name) VALUES ('dept_sales', 'cost_center', 'SALES', 'Sales Dept')
  `).run();

  db.prepare(`
    INSERT INTO dimension_value (id, dimension_id, code, name) VALUES ('dept_marketing', 'cost_center', 'MKTG', 'Marketing Dept')
  `).run();

  db.prepare(`
    INSERT INTO dimension_value (id, dimension_id, code, name) VALUES ('dept_hr', 'cost_center', 'HR', 'HR Dept')
  `).run();
}

function mockRes() {
  return {
    headers: {}, statusCode: 200, body: '', writableEnded: false,
    setHeader(k, v) { this.headers[k] = v; },
    writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); },
    end(text) { this.body = text; this.writableEnded = true; },
  };
}
function mockReq(method, body, headers) {
  const payload = body === undefined ? {} : body;
  return {
    method,
    headers: Object.assign({ host: 'localhost' }, headers || {}),
    on(event, cb) {
      if (event === 'data') cb(Buffer.from(JSON.stringify(payload)));
      if (event === 'end') cb();
    },
  };
}
const wait = () => new Promise((r) => setTimeout(r, 10));

const financeRoutes = mountFinanceRoutes({
  db,
  requireSession() { return { ok: true, userId: 'test_user', user: { role: 'admin' } }; }
});

try {
  // Seed dimensions
  seedDimensionSetup();

  // ===========================================================================
  // SUITE 1: PERCENTAGE SUM & INVALID VALUE CHECKS
  // ===========================================================================
  console.log('=== SUITE 1: PERCENTAGE SUM & INVALID VALUE CHECKS ===');

  let errSum = null;
  try {
    financeEngine.validateDimensionDistribution(db, 'company-r0-demo', 'coa_401000', '{"dept_sales": 60, "dept_marketing": 50}');
  } catch (e) {
    errSum = e.message;
  }
  check('1.1 distribution percentage sum not 100% throws error', errSum && errSum.includes('must sum to 100%'));

  let errVal = null;
  try {
    financeEngine.validateDimensionDistribution(db, 'company-r0-demo', 'coa_401000', '{"dept_fake": 100}');
  } catch (e) {
    errVal = e.message;
  }
  check('1.2 invalid dimension value id throws error', errVal && errVal.includes('غير موجودة'));

  // ===========================================================================
  // SUITE 2: ACCOUNT POLICIES (REQUIRED & BLOCKED)
  // ===========================================================================
  console.log('\n=== SUITE 2: ACCOUNT POLICIES ===');

  // Set required policy on Sales account coa_401000
  db.prepare(`
    INSERT INTO account_dimension_policy (id, account_id, dimension_id, policy)
    VALUES ('pol_req_1', 'coa_401000', 'cost_center', 'required')
  `).run();

  let errReq = null;
  try {
    financeEngine.validateDimensionDistribution(db, 'company-r0-demo', 'coa_401000', null);
  } catch (e) {
    errReq = e.message;
  }
  check('2.1 missing required dimension throws validation error', errReq && errReq.includes('is required for account'));

  // Set blocked policy on Cash account coa_101000
  db.prepare(`
    INSERT INTO account_dimension_policy (id, account_id, dimension_id, policy)
    VALUES ('pol_blk_1', 'coa_101000', 'cost_center', 'blocked')
  `).run();

  let errBlk = null;
  try {
    financeEngine.validateDimensionDistribution(db, 'company-r0-demo', 'coa_101000', '{"dept_sales": 100}');
  } catch (e) {
    errBlk = e.message;
  }
  check('2.2 presenting blocked dimension throws validation error', errBlk && errBlk.includes('is blocked for account'));

  // Valid policy check
  let errValid = null;
  try {
    financeEngine.validateDimensionDistribution(db, 'company-r0-demo', 'coa_401000', '{"dept_sales": 60, "dept_marketing": 40}');
  } catch (e) {
    errValid = e.message;
  }
  check('2.3 valid distribution satisfying required policy does not throw', errValid === null);

  // ===========================================================================
  // SUITE 3: 60/40 SPLIT POSTING & VERIFICATION
  // ===========================================================================
  console.log('\n=== SUITE 3: 60/40 SPLIT POSTING ===');

  // Let's create and post a draft invoice
  const docId = 'doc_analytic_1';
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, state, currency, created_at, created_by)
    VALUES (?, 'company-r0-demo', 'INV-202607-00002', 'sales_invoice', '2026-07-20', 'draft', 'IQD', ?, 'test_user')
  `).run(docId, nowIso);

  // Cash debit (blocked CC, so dims must be NULL/empty)
  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, description, created_at, dims)
    VALUES ('l1', ?, 'company-r0-demo', 'coa_101000', 1000.0, 0.0, 'Cash receive', ?, NULL)
  `).run(docId, nowIso);

  // Sales credit (required CC, split 60% Sales, 40% Marketing)
  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, description, created_at, dims)
    VALUES ('l2', ?, 'company-r0-demo', 'coa_401000', 0.0, 1000.0, 'Sales distribution', ?, '{"dept_sales": 60, "dept_marketing": 40}')
  `).run(docId, nowIso);

  // Post document
  const postRes = financeEngine.postFiscalDoc(db, docId, 'test_user');
  check('3.1 document with valid dimension distribution posted successfully', postRes.success);

  const postedSalesLine = db.prepare("SELECT dims FROM gl_line WHERE fiscal_doc_id = ? AND account_id = 'coa_401000'").get(docId);
  check('3.2 posted GL line stores dims JSON', postedSalesLine && postedSalesLine.dims === '{"dept_sales": 60, "dept_marketing": 40}');

  // ===========================================================================
  // SUITE 4: DIMENSION-BASED P&L ANALYTIC REPORT
  // ===========================================================================
  console.log('\n=== SUITE 4: DIMENSION-BASED P&L ANALYTIC REPORT ===');

  const report = financeEngine.getDimensionPnLReport(db, 'company-r0-demo', 'cost_center');
  const salesRow = report.rows.find(r => r.account_id === 'coa_401000');

  check('4.1 report rows contain sales account details', !!salesRow);
  check('4.2 sales total balance matches full ledger (-1000 since credit is negative debit)', salesRow && salesRow.total === -1000);
  check('4.3 Sales Dept received exactly 60% split (-600)', salesRow && salesRow.dept_sales === -600);
  check('4.4 Marketing Dept received exactly 40% split (-400)', salesRow && salesRow.dept_marketing === -400);
  check('4.5 HR Dept received exactly 0% split (0)', salesRow && salesRow.dept_hr === 0);

  // Reconcile dimension sum
  const dimSum = salesRow.dept_sales + salesRow.dept_marketing + salesRow.dept_hr;
  check('4.6 dimension-split sum matches account total (reconciles)', dimSum === salesRow.total);

  // ===========================================================================
  // SUITE 5: HTTP ROUTING ENDPOINTS FOR ACCOUNTING DIMENSIONS
  // ===========================================================================
  console.log('\n=== SUITE 5: HTTP ROUTING ENDPOINTS ===');

  // Test POST /api/x/finance/dimension/policy
  const req51 = mockReq('POST', {
    account_id: 'coa_401000', dimension_id: 'cost_center', policy: 'blocked'
  });
  const res51 = mockRes();
  financeRoutes.handle(req51, res51, new URL('http://localhost/api/x/finance/dimension/policy'));
  await wait();
  check('5.1 API set policy returns 200', res51.statusCode === 200);

  // Confirm policy updated in DB
  const updatedPolicy = db.prepare("SELECT policy FROM account_dimension_policy WHERE account_id='coa_401000'").get();
  check('5.2 policy updated to blocked in DB', updatedPolicy && updatedPolicy.policy === 'blocked');

  // Test GET /api/x/finance/dimension/pnl
  const req52 = mockReq('GET');
  const res52 = mockRes();
  financeRoutes.handle(req52, res52, new URL('http://localhost/api/x/finance/dimension/pnl?company_id=company-r0-demo&dimension_id=cost_center'));
  await wait();
  check('5.3 API get dimension P&L report returns 200', res52.statusCode === 200);
  const body52 = JSON.parse(res52.body);
  check('5.4 API report contains correct sales account row', body52.data && body52.data.rows.some(r => r.account_id === 'coa_401000'));

} catch (err) {
  console.error('Unhandled test execution error:', err);
  failures++;
} finally {
  db.close();

  // Clean up test DB files
  try { fs.unlinkSync(dbPath); } catch (_) {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

  console.log(`\nDimension verification completed. Total failures: ${failures}`);
  process.exitCode = failures > 0 ? 1 : 0;
}
