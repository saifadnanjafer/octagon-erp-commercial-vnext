// R9.3 focused acceptance: disposable DB only. Retail/POS pack backend proof.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import retail from '../vnext/server/modules/packs/retail-pos-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r9-retail-'));
const dbPath = path.join(temp, 'r9-retail.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
db.prepare('INSERT OR IGNORE INTO companies (company_id, name) VALUES (?, ?)').run(company, 'Demo Company');
const results = [];
async function check(name, fn) { try { await fn(); results.push(`PASS ${name}`); } catch (e) { results.push(`FAIL ${name}: ${e.message}`); console.error(e); } }

let store;
await check('store creation is company-scoped and configurable', () => {
  store = retail.createStore(db, company, { store_code: 'BAG-01', name: 'Baghdad Store', timezone: 'Asia/Baghdad', currency: 'IQD' }, 'user-1');
  assert.equal(store.store_code, 'BAG-01');
  assert.equal(retail.listStores(db, company).length, 1);
  assert.throws(() => retail.createStore(db, company, { store_code: 'BAG-01', name: 'Duplicate' }, 'user-1'), /store code already exists/);
});

let shift;
await check('one open shift per store with safe close', () => {
  shift = retail.openShift(db, company, store.id, { shift_number: '20260719-AM', opening_float: 50000 }, 'cashier-1');
  assert.equal(shift.state, 'open');
  assert.throws(() => retail.openShift(db, company, store.id, { shift_number: '20260719-PM' }, 'cashier-2'), /already has an open shift/);
  const closed = retail.closeShift(db, company, shift.id, { closing_total: 125000 }, 'manager-1');
  assert.equal(closed.state, 'closed');
});

// Reopen a new shift for scan flow.
shift = retail.openShift(db, company, store.id, { shift_number: '20260719-PM', opening_float: 0 }, 'cashier-2');
let barcode;
await check('barcode registration and lookup are unique and active-only', () => {
  barcode = retail.registerBarcode(db, company, { product_id: 'product-001', barcode: '6291234567890', barcode_type: 'ean13' }, 'user-1');
  assert.equal(retail.lookupBarcode(db, company, barcode.barcode).product_id, 'product-001');
  assert.throws(() => retail.registerBarcode(db, company, { product_id: 'product-002', barcode: barcode.barcode }, 'user-1'), /barcode already exists/);
  assert.throws(() => retail.lookupBarcode(db, 'other-company', barcode.barcode), /company scope is invalid/);
});

await check('barcode scan is idempotent and rejects closed or unknown shifts', () => {
  const input = { barcode: barcode.barcode, action: 'sale', quantity: 2, idempotency_key: 'sale-001' };
  const first = retail.recordScan(db, company, store.id, shift.id, input, 'cashier-2');
  const second = retail.recordScan(db, company, store.id, shift.id, input, 'cashier-2');
  assert.equal(second.id, first.id);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM shop_retail_scan_event WHERE company_id = ?').get(company).n, 1);
  assert.throws(() => retail.recordScan(db, company, store.id, shift.id, { ...input, idempotency_key: 'sale-002', barcode: 'missing' }, 'cashier-2'), /active barcode not found/);
});

await check('903 down removes only the Retail/POS schema', async () => {
  db.close();
  const down = await runMigrations({ dbPath, direction: 'down' });
  const after = openMigrationDatabase(dbPath);
  assert.ok(down.migrations.includes('903_r9_retail_pos_pack'));
  for (const table of ['shop_retail_store', 'shop_retail_shift', 'shop_retail_barcode', 'shop_retail_scan_event']) {
    assert.equal(after.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table), undefined);
  }
  after.close();
});

for (const line of results) console.log(line);
const failures = results.filter(line => line.startsWith('FAIL')).length;
console.log(`\nR9 RETAIL/POS PACK SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
