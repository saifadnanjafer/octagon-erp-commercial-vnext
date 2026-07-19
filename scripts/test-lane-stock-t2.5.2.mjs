import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dbPath = path.resolve(here, '../vnext-data/test-stock-t252.db');
const migrationsDir = path.resolve(here, '../migrations');
const migrationFiles = [
  '001_r0_scope_contract.mjs', '101_r1_lane_a_tables.mjs', '201_r1_lane_b_tables.mjs',
  '301_r1_lane_c_tables.mjs', '401_r1_lane_d_tables.mjs', '501_r1_kernel_completion.mjs',
  '102_r1_lane_a_completion.mjs', '202_r1_lane_b_completion.mjs', '302_r1_lane_c_completion.mjs',
  '402_r1_lane_d_completion.mjs', '601_r2_finance_baseline.mjs', '602_r2_period_locks.mjs',
  '603_r2_tax_engine.mjs', '604_r2_accounting_dimensions.mjs', '605_r2_stock_ledger.mjs',
  '606_r2_stock_gl_perpetual.mjs',
];

for (const suffix of ['', '-wal', '-shm']) {
  try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
}

const migrationDb = new DatabaseSync(dbPath);
migrationDb.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
for (const file of migrationFiles) {
  const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
  mod.migration.up(migrationDb);
}
migrationDb.close();

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
const { applyR0ScopeSeed, applyAclAdminDefaultSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(db);
applyAclAdminDefaultSeed(db);

const stockEngine = require('../vnext/server/stock/stock-engine');
const { mountStockRoutes } = require('../vnext/server/stock/stock-routes');
const failures = [];
function check(name, condition) {
  if (condition) console.log(`  PASS: ${name}`);
  else { console.error(`  FAIL: ${name}`); failures.push(name); }
}
function expectError(name, fn, text) {
  try { fn(); console.error(`  FAIL: ${name} (no error)`); failures.push(name); }
  catch (error) { check(name, String(error.message).includes(text)); }
}
function mockRes() {
  return { statusCode: 200, body: '', writableEnded: false, headers: {}, writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers || {}); }, end(body) { this.body = body; this.writableEnded = true; } };
}
function mockReq(method, body) {
  return { method, headers: { host: 'localhost' }, on(event, cb) { if (event === 'data') cb(Buffer.from(JSON.stringify(body || {}))); if (event === 'end') cb(); } };
}
const wait = () => new Promise((resolve) => setTimeout(resolve, 10));
const routes = mountStockRoutes({ db, requireSession() { return { ok: true, userId: 'manager-1', user: { role: 'admin' } }; } });

try {
  db.prepare("INSERT INTO warehouses (warehouse_id, company_id, name) VALUES ('wh_t252', 'company-r0-demo', 'T2.5.2 Warehouse')").run();
  for (const [id, type, name] of [['loc_t252', 'internal', 'T2.5.2 Stock'], ['loc_t252_supplier', 'supplier', 'Supplier'], ['loc_t252_customer', 'customer', 'Customer']]) {
    db.prepare('INSERT INTO locations (location_id, warehouse_id, company_id, name, type) VALUES (?, ?, ?, ?, ?)').run(id, 'wh_t252', 'company-r0-demo', name, type);
  }
  db.prepare("INSERT INTO fiscal_periods (period_id, company_id, name, start_date, end_date, status) VALUES ('period_t252', 'company-r0-demo', 'July 2026', '2026-07-01', '2026-07-31', 'open')").run();
  db.prepare("INSERT INTO x_records (entity, id, company_id, data) VALUES ('product', 'prod_t252', 'company-r0-demo', ?)").run(JSON.stringify({ id: 'prod_t252', company_id: 'company-r0-demo', category: 'T2.5.2', cost_price: 100, valuation_method: 'avco', tracking_type: 'none' }));
  db.prepare("INSERT INTO dimension (id, name, company_id) VALUES ('dim_t252', 'Cost Center', 'company-r0-demo')").run();
  db.prepare("INSERT INTO dimension_value (id, dimension_id, code, name) VALUES ('dv_t252', 'dim_t252', 'MAIN', 'Main')").run();
  db.prepare("INSERT INTO stock_valuation_category_policy (company_id, category, valuation_account_id, cogs_account_id, adjustment_account_id, accrual_account_id) VALUES ('company-r0-demo', 'T2.5.2', 'coa_104000', 'coa_501000', 'coa_502000', 'coa_201000')").run();

  console.log('=== SUITE 1: PERPETUAL STOCK-GL POSTING ===');
  const receipt = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_t252', qty: 10, from_location_id: 'loc_t252_supplier', to_location_id: 'loc_t252',
    warehouse_id: 'wh_t252', currency: 'IQD', dims: { dv_t252: 100 }, posting_date: '2026-07-18', voucher_ref: 'T252-REC-1',
  });
  const receiptPost = stockEngine.postStockMove(db, 'company-r0-demo', receipt.id, 'manager-1', { rate: 100 });
  check('1.1 posted stock move has one linked stock valuation document', receiptPost.fiscalDocId && db.prepare('SELECT COUNT(*) AS c FROM fiscal_doc WHERE id = ? AND move_type = ? AND state = ?').get(receiptPost.fiscalDocId, 'stock_valuation', 'posted').c === 1 && db.prepare('SELECT fiscal_doc_id FROM stock_move WHERE id = ?').get(receipt.id).fiscal_doc_id === receiptPost.fiscalDocId);
  const receiptDoc = db.prepare('SELECT id FROM fiscal_doc WHERE id = ?').get(receiptPost.fiscalDocId);
  const receiptTotals = db.prepare('SELECT SUM(debit) AS debit, SUM(credit) AS credit, COUNT(*) AS c FROM fiscal_doc_line WHERE fiscal_doc_id = ?').get(receiptDoc.id);
  check('1.2 stock valuation journal is balanced with exactly two lines', receiptTotals.c === 2 && receiptTotals.debit === 1000 && receiptTotals.credit === 1000);
  const retry = stockEngine.postStockMove(db, 'company-r0-demo', receipt.id, 'manager-1', { rate: 100 });
  check('1.3 retry is idempotent and creates no duplicate journal entry', retry.idempotent === true && db.prepare('SELECT COUNT(*) AS c FROM fiscal_doc WHERE move_type = ?').get('stock_valuation').c === 1);
  const receiptLines = db.prepare('SELECT account_id, debit, credit, dims, currency_code FROM fiscal_doc_line WHERE fiscal_doc_id = ? ORDER BY id').all(receiptPost.fiscalDocId);
  check('1.4 company currency and dimensions are preserved on both GL lines', receiptLines.every((line) => line.currency_code === 'IQD' && line.dims === '{"dv_t252":100}'));
  const issue = stockEngine.createStockMove(db, 'company-r0-demo', { product_id: 'prod_t252', qty: 4, from_location_id: 'loc_t252', to_location_id: 'loc_t252_customer', warehouse_id: 'wh_t252', posting_date: '2026-07-18', voucher_ref: 'T252-ISS-1', dims: { dv_t252: 100 } });
  stockEngine.postStockMove(db, 'company-r0-demo', issue.id, 'manager-1');
  const valuationBalance = db.prepare("SELECT COALESCE(SUM(debit - credit), 0) AS balance FROM gl_line WHERE company_id = 'company-r0-demo' AND account_id = 'coa_104000'").get().balance;
  const stockValue = db.prepare("SELECT COALESCE(SUM(value), 0) AS value FROM stock_ledger_line WHERE company_id = 'company-r0-demo' AND location_id = 'loc_t252' AND product_id = 'prod_t252'").get().value;
  check('1.5 stock valuation equals the inventory control-account balance', valuationBalance === stockValue && valuationBalance === 600);

  console.log('=== SUITE 2: REVERSAL AND ATOMICITY ===');
  const issueDocId = db.prepare('SELECT fiscal_doc_id FROM stock_move WHERE id = ?').get(issue.id).fiscal_doc_id;
  const originalIssueLines = db.prepare('SELECT account_id, debit, credit, dims FROM fiscal_doc_line WHERE fiscal_doc_id = ? ORDER BY id').all(issueDocId);
  const cancel = stockEngine.cancelStockMove(db, 'company-r0-demo', issue.id, 'manager-1');
  const reversalLines = db.prepare('SELECT account_id, debit, credit, dims FROM fiscal_doc_line WHERE fiscal_doc_id = ?').all(cancel.fiscalDocId);
  const inverseKey = (line) => JSON.stringify([line.account_id, line.debit, line.credit, line.dims]);
  const expectedInverse = originalIssueLines.map((line) => inverseKey({ account_id: line.account_id, debit: line.credit, credit: line.debit, dims: line.dims })).sort();
  check('2.1 stock reversal creates the exact inverse GL posting', reversalLines.length === originalIssueLines.length && reversalLines.map(inverseKey).sort().every((line, i) => line === expectedInverse[i]));
  check('2.2 cancelled stock move is financially cancelled only with a posted reversal', db.prepare('SELECT state FROM stock_move WHERE id = ?').get(issue.id).state === 'cancelled' && db.prepare('SELECT state, reversal_of_id FROM fiscal_doc WHERE id = ?').get(issueDocId).state === 'cancelled' && db.prepare('SELECT state, reversal_of_id FROM fiscal_doc WHERE id = ?').get(cancel.fiscalDocId).state === 'posted' && db.prepare('SELECT reversal_of_id FROM fiscal_doc WHERE id = ?').get(cancel.fiscalDocId).reversal_of_id === issueDocId);
  const cancelRetry = stockEngine.cancelStockMove(db, 'company-r0-demo', issue.id, 'manager-1');
  check('2.3 cancellation retry is idempotent', cancelRetry.idempotent === true && db.prepare('SELECT COUNT(*) AS c FROM stock_move WHERE voucher_ref = ?').get(`REVERSAL-OF-${issue.id}`).c === 1);

  console.log('=== SUITE 3: INVENTORY ADJUSTMENT CONTROLS ===');
  expectError('3.1 inventory adjustment requires a reason', () => stockEngine.postInventoryAdjustment(db, 'company-r0-demo', { location_id: 'loc_t252', product_id: 'prod_t252', counted_qty: 11, counted_rate: 100, authorized_by: 'manager-1', authorization_ref: 'AUTH-REASON-ERR', posting_date: '2026-07-18' }, 'manager-1'), 'reason is required');
  expectError('3.2 inventory adjustment requires authorization', () => stockEngine.postInventoryAdjustment(db, 'company-r0-demo', { location_id: 'loc_t252', product_id: 'prod_t252', counted_qty: 11, counted_rate: 100, reason: 'Cycle count', posting_date: '2026-07-18' }, 'manager-1'), 'authorization is required');
  const adjustment = stockEngine.postInventoryAdjustment(db, 'company-r0-demo', { location_id: 'loc_t252', product_id: 'prod_t252', counted_qty: 11, counted_rate: 105, reason: 'Cycle count variance', authorized_by: 'manager-1', authorization_ref: 'AUTH-T252-1', posting_date: '2026-07-18', dims: { dv_t252: 100 } }, 'manager-1');
  check('3.3 authorized inventory adjustment posts a stock move and GL entry', adjustment.success && adjustment.moveId && adjustment.fiscalDocId && db.prepare("SELECT reason, authorized_by, state FROM stock_inventory_adjustment WHERE authorization_ref = 'AUTH-T252-1'").get().state === 'posted');
  const adjustmentRetry = stockEngine.postInventoryAdjustment(db, 'company-r0-demo', { location_id: 'loc_t252', product_id: 'prod_t252', counted_qty: 11, counted_rate: 105, reason: 'Cycle count variance', authorized_by: 'manager-1', authorization_ref: 'AUTH-T252-1', posting_date: '2026-07-18' }, 'manager-1');
  check('3.4 adjustment retry does not duplicate stock or GL', adjustmentRetry.idempotent === true && db.prepare("SELECT COUNT(*) AS c FROM stock_inventory_adjustment WHERE authorization_ref = 'AUTH-T252-1'").get().c === 1);
  const req = mockReq('POST', { company_id: 'company-r0-demo', location_id: 'loc_t252', product_id: 'prod_t252', counted_qty: 11, counted_rate: 105, reason: 'Already applied', authorized_by: 'manager-1', authorization_ref: 'AUTH-T252-1', posting_date: '2026-07-18' });
  const res = mockRes();
  routes.handle(req, res, new URL('http://localhost/api/x/stock/adjustment'));
  await wait();
  check('3.5 inventory adjustment endpoint is exposed', res.statusCode === 200 && JSON.parse(res.body).data.idempotent === true);

  console.log('=== SUITE 4: LOCKS, CONSISTENCY, AND ROLLBACK ===');
  db.prepare("INSERT INTO company_lock_dates (company_id, stock_lock_date, gl_lock_date, updated_at, updated_by) VALUES ('company-r0-demo', '2026-07-18', NULL, '2026-07-18', 'manager-1') ON CONFLICT(company_id) DO UPDATE SET stock_lock_date = excluded.stock_lock_date, gl_lock_date = excluded.gl_lock_date").run();
  const lockedStock = stockEngine.createStockMove(db, 'company-r0-demo', { product_id: 'prod_t252', qty: 1, from_location_id: 'loc_t252_supplier', to_location_id: 'loc_t252', warehouse_id: 'wh_t252', posting_date: '2026-07-18', voucher_ref: 'T252-LOCK-STOCK' });
  expectError('4.1 stock lock blocks stock and GL effects', () => stockEngine.postStockMove(db, 'company-r0-demo', lockedStock.id, 'manager-1', { rate: 100 }), 'locked period');
  check('4.2 stock lock rollback leaves draft with no ledger or GL rows', db.prepare('SELECT state FROM stock_move WHERE id = ?').get(lockedStock.id).state === 'draft' && db.prepare('SELECT COUNT(*) AS c FROM stock_ledger_line WHERE stock_move_id = ?').get(lockedStock.id).c === 0 && db.prepare('SELECT COUNT(*) AS c FROM fiscal_doc WHERE id IN (SELECT fiscal_doc_id FROM stock_move WHERE id = ?)').get(lockedStock.id).c === 0);
  db.prepare("UPDATE company_lock_dates SET stock_lock_date = '2026-07-17', gl_lock_date = '2026-07-18' WHERE company_id = 'company-r0-demo'").run();
  const lockedGl = stockEngine.createStockMove(db, 'company-r0-demo', { product_id: 'prod_t252', qty: 1, from_location_id: 'loc_t252_supplier', to_location_id: 'loc_t252', warehouse_id: 'wh_t252', posting_date: '2026-07-18', voucher_ref: 'T252-LOCK-GL' });
  expectError('4.3 GL lock blocks the whole stock transaction', () => stockEngine.postStockMove(db, 'company-r0-demo', lockedGl.id, 'manager-1', { rate: 100 }), 'locked period');
  check('4.4 GL lock rollback leaves no stock valuation', db.prepare('SELECT state FROM stock_move WHERE id = ?').get(lockedGl.id).state === 'draft' && db.prepare('SELECT COUNT(*) AS c FROM stock_ledger_line WHERE stock_move_id = ?').get(lockedGl.id).c === 0);
  db.prepare("UPDATE company_lock_dates SET stock_lock_date = NULL, gl_lock_date = NULL WHERE company_id = 'company-r0-demo'").run();
  db.prepare("INSERT INTO account_dimension_policy (id, account_id, dimension_id, policy) VALUES ('policy_t252_rollback', 'coa_201000', 'dim_t252', 'required')").run();
  const failed = stockEngine.createStockMove(db, 'company-r0-demo', { product_id: 'prod_t252', qty: 1, from_location_id: 'loc_t252_supplier', to_location_id: 'loc_t252', warehouse_id: 'wh_t252', posting_date: '2026-07-18', voucher_ref: 'T252-ROLLBACK' });
  expectError('4.5 GL mapping failure rolls stock back', () => stockEngine.postStockMove(db, 'company-r0-demo', failed.id, 'manager-1', { rate: 100 }), 'Failed to post perpetual stock GL entry');
  check('4.6 failed combined posting leaves no partial stock, bin, or GL effect', db.prepare('SELECT state FROM stock_move WHERE id = ?').get(failed.id).state === 'draft' && db.prepare('SELECT COUNT(*) AS c FROM stock_ledger_line WHERE stock_move_id = ?').get(failed.id).c === 0 && db.prepare("SELECT COUNT(*) AS c FROM fiscal_doc WHERE doc_number IS NULL AND state = 'draft'").get().c === 0);

  console.log(`\nT2.5.2 verification completed. Total failures: ${failures.length}`);
  process.exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.error('Unhandled test execution error:', error);
  process.exitCode = 1;
} finally {
  db.close();
  for (const suffix of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(dbPath + suffix); } catch (_) {}
  }
}
