import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dbPath = path.resolve(here, '../vnext-data/test-stock-t251.db');
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
  '605_r2_stock_ledger.mjs',
  '606_r2_stock_gl_perpetual.mjs',
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

const stockEngine = require('../vnext/server/stock/stock-engine');
const { mountStockRoutes } = require('../vnext/server/stock/stock-routes');

let failures = 0;
function check(name, expr) {
  if (expr) {
    console.log(`  PASS: ${name}`);
  } else {
    console.error(`  FAIL: ${name}`);
    failures++;
  }
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

const stockRoutes = mountStockRoutes({
  db,
  requireSession() { return { ok: true, userId: 'test_user', user: { role: 'admin' } }; }
});

try {
  // Setup Master Data
  db.prepare(`
    INSERT INTO warehouses (warehouse_id, company_id, name)
    VALUES ('wh_main', 'company-r0-demo', 'Main Warehouse')
  `).run();

  db.prepare(`
    INSERT INTO locations (location_id, warehouse_id, company_id, name, type)
    VALUES ('loc_main', 'wh_main', 'company-r0-demo', 'Main Storage', 'internal')
  `).run();

  db.prepare(`
    INSERT INTO locations (location_id, warehouse_id, company_id, name, type)
    VALUES ('loc_supplier', 'wh_main', 'company-r0-demo', 'Supplier Location', 'supplier')
  `).run();

  db.prepare(`
    INSERT INTO locations (location_id, warehouse_id, company_id, name, type)
    VALUES ('loc_customer', 'wh_main', 'company-r0-demo', 'Customer Location', 'customer')
  `).run();

  db.prepare(`
    INSERT INTO fiscal_periods (period_id, company_id, name, start_date, end_date, status)
    VALUES ('period_2026_07', 'company-r0-demo', 'July 2026', '2026-07-01', '2026-07-31', 'open')
  `).run();

  // Seed dynamic products in x_records
  const pAvco = {
    id: 'prod_avco',
    name: 'AVCO Product',
    sku: 'AVCO-001',
    category: 'Staged',
    uom: 'قطعة',
    cost_price: 100.0,
    sale_price: 200.0,
    tracking_type: 'none',
    valuation_method: 'avco',
    status: 'active'
  };
  db.prepare(`
    INSERT INTO x_records (entity, id, company_id, data)
    VALUES ('product', 'prod_avco', 'company-r0-demo', ?)
  `).run(JSON.stringify(pAvco));

  const pFifo = {
    id: 'prod_fifo',
    name: 'FIFO Product',
    sku: 'FIFO-001',
    category: 'Staged',
    uom: 'قطعة',
    cost_price: 100.0,
    sale_price: 200.0,
    tracking_type: 'none',
    valuation_method: 'fifo',
    status: 'active'
  };
  db.prepare(`
    INSERT INTO x_records (entity, id, company_id, data)
    VALUES ('product', 'prod_fifo', 'company-r0-demo', ?)
  `).run(JSON.stringify(pFifo));

  const pBatch = {
    id: 'prod_batch',
    name: 'Batch Product',
    sku: 'BATCH-001',
    category: 'Staged',
    uom: 'قطعة',
    cost_price: 100.0,
    sale_price: 200.0,
    tracking_type: 'batch',
    valuation_method: 'avco',
    status: 'active'
  };
  db.prepare(`
    INSERT INTO x_records (entity, id, company_id, data)
    VALUES ('product', 'prod_batch', 'company-r0-demo', ?)
  `).run(JSON.stringify(pBatch));

  const pSerial = {
    id: 'prod_serial',
    name: 'Serial Product',
    sku: 'SERIAL-001',
    category: 'Staged',
    uom: 'قطعة',
    cost_price: 100.0,
    sale_price: 200.0,
    tracking_type: 'serial',
    valuation_method: 'avco',
    status: 'active'
  };
  db.prepare(`
    INSERT INTO x_records (entity, id, company_id, data)
    VALUES ('product', 'prod_serial', 'company-r0-demo', ?)
  `).run(JSON.stringify(pSerial));

  // ===========================================================================
  // SUITE 1: AVCO COSTING & VALUATION FLOWS
  // ===========================================================================
  console.log('=== SUITE 1: AVCO COSTING & VALUATION ===');

  // Receipt 1: 10 units @ 100
  const mv1 = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_avco',
    qty: 10,
    from_location_id: 'loc_supplier',
    to_location_id: 'loc_main',
    posting_date: '2026-07-18',
    voucher_ref: 'REC-001'
  });
  stockEngine.postStockMove(db, 'company-r0-demo', mv1.id, 'test_user', { rate: 100 });

  const bin1 = db.prepare("SELECT qty, value FROM bin WHERE location_id = 'loc_main' AND product_id = 'prod_avco'").get();
  check('1.1 receipt 1 increments bin quantity and value correctly', bin1.qty === 10 && bin1.value === 1000);

  // Receipt 2: 5 units @ 160
  const mv2 = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_avco',
    qty: 5,
    from_location_id: 'loc_supplier',
    to_location_id: 'loc_main',
    posting_date: '2026-07-18',
    voucher_ref: 'REC-002'
  });
  stockEngine.postStockMove(db, 'company-r0-demo', mv2.id, 'test_user', { rate: 160 });

  const bin2 = db.prepare("SELECT qty, value FROM bin WHERE location_id = 'loc_main' AND product_id = 'prod_avco'").get();
  check('1.2 receipt 2 updates moving-average cost (15 units @ average 120)', bin2.qty === 15 && bin2.value === 1800);

  // Issue: 6 units (should value at 120)
  const mv3 = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_avco',
    qty: 6,
    from_location_id: 'loc_main',
    to_location_id: 'loc_customer',
    posting_date: '2026-07-18',
    voucher_ref: 'ISS-001'
  });
  stockEngine.postStockMove(db, 'company-r0-demo', mv3.id, 'test_user');

  const bin3 = db.prepare("SELECT qty, value FROM bin WHERE location_id = 'loc_main' AND product_id = 'prod_avco'").get();
  check('1.3 issue records current average rate, leaving correct remaining bin values', bin3.qty === 9 && bin3.value === 1080);

  const issueLine = db.prepare("SELECT valuation_rate, value FROM stock_ledger_line WHERE stock_move_id = ? AND qty < 0").get(mv3.id);
  check('1.4 outgoing ledger line valuation rate is correct', issueLine.valuation_rate === 120 && issueLine.value === -720);

  // ===========================================================================
  // SUITE 2: FIFO COSTING & VALUATION FLOWS
  // ===========================================================================
  console.log('\n=== SUITE 2: FIFO COSTING & VALUATION ===');

  // Receipt 1: 10 units @ 100
  const fv1 = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_fifo',
    qty: 10,
    from_location_id: 'loc_supplier',
    to_location_id: 'loc_main',
    posting_date: '2026-07-18',
    voucher_ref: 'F-REC-001'
  });
  stockEngine.postStockMove(db, 'company-r0-demo', fv1.id, 'test_user', { rate: 100 });

  // Receipt 2: 5 units @ 160
  const fv2 = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_fifo',
    qty: 5,
    from_location_id: 'loc_supplier',
    to_location_id: 'loc_main',
    posting_date: '2026-07-18',
    voucher_ref: 'F-REC-002'
  });
  stockEngine.postStockMove(db, 'company-r0-demo', fv2.id, 'test_user', { rate: 160 });

  // Verify layers created
  const layers = db.prepare("SELECT qty, unit_cost FROM stock_fifo_layer WHERE product_id = 'prod_fifo' AND qty > 0 ORDER BY created_at ASC").all();
  check('2.1 two separate FIFO layers created successfully', layers.length === 2 && layers[0].qty === 10 && layers[1].qty === 5);

  // Issue 12 units (should consume 10 @ 100 and 2 @ 160)
  const fv3 = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_fifo',
    qty: 12,
    from_location_id: 'loc_main',
    to_location_id: 'loc_customer',
    posting_date: '2026-07-18',
    voucher_ref: 'F-ISS-001'
  });
  stockEngine.postStockMove(db, 'company-r0-demo', fv3.id, 'test_user');

  const fIssueLine = db.prepare("SELECT valuation_rate, value FROM stock_ledger_line WHERE stock_move_id = ? AND qty < 0").get(fv3.id);
  // Expected total cost = 10 * 100 + 2 * 160 = 1320. Rate = 1320 / 12 = 110. Value = -1320
  check('2.2 FIFO consumption uses correct layer sequence and rates', fIssueLine.valuation_rate === 110 && fIssueLine.value === -1320);

  const updatedLayers = db.prepare("SELECT qty, unit_cost FROM stock_fifo_layer WHERE product_id = 'prod_fifo' AND qty > 0").all();
  check('2.3 remaining FIFO layer quantity is updated correctly', updatedLayers.length === 1 && updatedLayers[0].qty === 3 && updatedLayers[0].unit_cost === 160);

  // ===========================================================================
  // SUITE 3: PERIOD LOCKS & NEGATIVE STOCK BLOCKS
  // ===========================================================================
  console.log('\n=== SUITE 3: PERIOD LOCKS & NEGATIVE STOCK BLOCKS ===');

  // Test Period Lock Dates
  db.prepare(`
    INSERT INTO company_lock_dates (company_id, gl_lock_date, stock_lock_date, updated_at, updated_by)
    VALUES ('company-r0-demo', '2026-07-01', '2026-07-15', '2026-07-18', 'test_user')
  `).run();

  const mvLock = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_avco',
    qty: 1,
    from_location_id: 'loc_supplier',
    to_location_id: 'loc_main',
    posting_date: '2026-07-10',
    voucher_ref: 'LOCK-001'
  });

  let lockErr = null;
  try {
    stockEngine.postStockMove(db, 'company-r0-demo', mvLock.id, 'test_user');
  } catch (e) {
    lockErr = e.message;
  }
  check('3.1 posting into a locked period throws lock date error', lockErr && lockErr.includes('locked period'));

  // Test Negative Stock Block
  const mvNeg = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_avco',
    qty: 100, // exceeds current 9 on hand
    from_location_id: 'loc_main',
    to_location_id: 'loc_customer',
    posting_date: '2026-07-18',
    voucher_ref: 'NEG-001'
  });

  let negErr = null;
  try {
    stockEngine.postStockMove(db, 'company-r0-demo', mvNeg.id, 'test_user', { negative_stock_policy: 'block' });
  } catch (e) {
    negErr = e.message;
  }
  check('3.2 posting that causes negative stock is blocked when policy is block', negErr && negErr.includes('Negative stock is blocked'));

  // ===========================================================================
  // SUITE 4: BATCH EXPIRY & SERIAL TRACKING
  // ===========================================================================
  console.log('\n=== SUITE 4: BATCH EXPIRY & SERIAL TRACKING ===');

  // Seed Expired Batch
  db.prepare(`
    INSERT INTO stock_batch (company_id, product_id, batch_number, expiry_date)
    VALUES ('company-r0-demo', 'prod_batch', 'EXP-999', '2026-07-10')
  `).run();

  const mvBatch = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_batch',
    qty: 2,
    from_location_id: 'loc_supplier',
    to_location_id: 'loc_main',
    posting_date: '2026-07-18', // posting after batch expiry
    voucher_ref: 'BATCH-ERR'
  });

  let batchErr = null;
  try {
    stockEngine.postStockMove(db, 'company-r0-demo', mvBatch.id, 'test_user', { batch_number: 'EXP-999' });
  } catch (e) {
    batchErr = e.message;
  }
  check('4.1 posting expired batch throws validation error', batchErr && batchErr.includes('expired batch'));

  // Test Serial tracking unique-active
  const mvSerial1 = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_serial',
    qty: 1,
    from_location_id: 'loc_supplier',
    to_location_id: 'loc_main',
    posting_date: '2026-07-18',
    voucher_ref: 'SER-001'
  });
  stockEngine.postStockMove(db, 'company-r0-demo', mvSerial1.id, 'test_user', { serial_number: 'SN-7777' });

  const activeSerial = db.prepare("SELECT location_id FROM stock_serial WHERE serial_number = 'SN-7777'").get();
  check('4.2 serial number location updated on posting receipt', activeSerial && activeSerial.location_id === 'loc_main');

  const mvSerial2 = stockEngine.createStockMove(db, 'company-r0-demo', {
    product_id: 'prod_serial',
    qty: 1,
    from_location_id: 'loc_supplier',
    to_location_id: 'loc_main',
    posting_date: '2026-07-18',
    voucher_ref: 'SER-002'
  });

  let serialErr = null;
  try {
    stockEngine.postStockMove(db, 'company-r0-demo', mvSerial2.id, 'test_user', { serial_number: 'SN-7777' });
  } catch (e) {
    serialErr = e.message;
  }
  check('4.3 duplicate serial number entry is blocked at target location', serialErr && serialErr.includes('already active'));

  // ===========================================================================
  // SUITE 5: REVERSALS, VALUATION REPORT & BIN REBUILDING
  // ===========================================================================
  console.log('\n=== SUITE 5: REVERSALS, VALUATION REPORT & BIN REBUILDING ===');

  // Cancel mv3 (AVCO Issue of 6 units @ 120)
  const cancelRes = stockEngine.cancelStockMove(db, 'company-r0-demo', mv3.id, 'test_user');
  check('5.1 stock move cancellation successfully posts a reversal move', cancelRes.success);

  const origMove = db.prepare("SELECT state FROM stock_move WHERE id = ?").get(mv3.id);
  check('5.2 original stock move marked as cancelled', origMove && origMove.state === 'cancelled');

  const newBin = db.prepare("SELECT qty, value FROM bin WHERE location_id = 'loc_main' AND product_id = 'prod_avco'").get();
  check('5.3 reversal restores bin qty and value to pre-issue state (15 units @ 1800)', newBin.qty === 15 && newBin.value === 1800);

  // Valuation report check
  const report = stockEngine.getValuationReport(db, 'company-r0-demo', 'loc_main', 'prod_avco');
  check('5.4 valuation report retrieves correct qty and valuation rate', report.length === 1 && report[0].qty === 15 && report[0].valuation_rate === 120);

  // Bin rebuild check
  const rebuild = stockEngine.rebuildBins(db, 'company-r0-demo', 'loc_main', 'prod_avco');
  check('5.5 bin rebuild from ledger history equals materialized cache values', rebuild.qty === 15 && rebuild.value === 1800);

  // ===========================================================================
  // SUITE 6: REST API ENDPOINTS
  // ===========================================================================
  console.log('\n=== SUITE 6: REST API ENDPOINTS ===');

  // Test POST /api/x/stock/move
  const req61 = mockReq('POST', {
    company_id: 'company-r0-demo', product_id: 'prod_avco', qty: 2, from_location_id: 'loc_main', to_location_id: 'loc_customer', posting_date: '2026-07-18'
  });
  const res61 = mockRes();
  stockRoutes.handle(req61, res61, new URL('http://localhost/api/x/stock/move'));
  await wait();
  check('6.1 API create draft move returns 200', res61.statusCode === 200);
  const moveRes = JSON.parse(res61.body).data;

  // Test POST /api/x/stock/move/post
  const req62 = mockReq('POST', {
    company_id: 'company-r0-demo', move_id: moveRes.id
  });
  const res62 = mockRes();
  stockRoutes.handle(req62, res62, new URL('http://localhost/api/x/stock/move/post'));
  await wait();
  check('6.2 API post move returns 200', res62.statusCode === 200);

  // Test GET /api/x/stock/valuation
  const req63 = mockReq('GET');
  const res63 = mockRes();
  stockRoutes.handle(req63, res63, new URL('http://localhost/api/x/stock/valuation?company_id=company-r0-demo&product_id=prod_avco&location_id=loc_main'));
  await wait();
  check('6.3 API get valuation returns 200', res63.statusCode === 200);
  const valBody = JSON.parse(res63.body).data;
  check('6.4 API valuation returns correct quantities post-API issue', valBody.length === 1 && valBody[0].qty === 13);

} catch (err) {
  console.error('Unhandled test execution error:', err);
  failures++;
} finally {
  db.close();

  // Clean up test DB files
  try { fs.unlinkSync(dbPath); } catch (_) {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

  console.log(`\nStock verification completed. Total failures: ${failures}`);
  process.exitCode = failures > 0 ? 1 : 0;
}
