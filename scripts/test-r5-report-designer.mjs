// R5.3 acceptance: report designer on a disposable database. A non-developer
// builds "sales by month" from a query definition; execution is company-scoped
// and injection-safe (no user string reaches SQL as identifier); the NL bridge
// produces an editable query definition, never raw SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import arap from '../vnext/server/finance/arap-engine.js';
import core from '../vnext/server/modules/r3-core.js';
import report from '../vnext/server/modules/reporting/report-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r5-report-'));
const dbPath = path.join(temp, 'r5report.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const company = 'company-r0-demo';
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

// --- fixture: two sales orders in two months, one in a foreign company ---
const customer = arap.createPartner(db, company, { id: 'rpt-cust', name: 'Report Cust', partner_type: 'customer' }, 'seed');
const product = core.createProduct(db, company, { id: 'rpt-prod', code: 'RPT', name: 'Report Product', product_type: 'goods' }, 'seed');
db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('company-rpt-other', 'Other');
db.prepare("INSERT INTO sales_order(id,company_id,partner_id,order_number,state,currency,total_amount,created_at,created_by) VALUES('so1',?,?,'SO-1','confirmed','IQD',100,'2026-06-15T00:00:00Z','s')").run(company, customer.id);
db.prepare("INSERT INTO sales_order(id,company_id,partner_id,order_number,state,currency,total_amount,created_at,created_by) VALUES('so2',?,?,'SO-2','confirmed','IQD',250,'2026-07-10T00:00:00Z','s')").run(company, customer.id);
db.prepare("INSERT INTO sales_order(id,company_id,partner_id,order_number,state,currency,total_amount,created_at,created_by) VALUES('so3',?,?,'SO-3','confirmed','IQD',999,'2026-07-11T00:00:00Z','s')").run('company-rpt-other', customer.id);

// --- 1. "sales by month" ---
const def = { source: 'sales_orders', name: 'sales by month', group_by: ['month'], aggregations: [{ fn: 'sum', column: 'total_amount', alias: 'total' }], order_by: 'month' };
check('non-developer builds "sales by month" and gets per-month totals', () => {
  const result = report.runQuery(db, company, def);
  const byMonth = Object.fromEntries(result.rows.map((row) => [row.month, row.total]));
  assert.equal(byMonth['2026-06'], 100);
  assert.equal(byMonth['2026-07'], 250);
});
check('report is company-scoped (foreign-company order excluded)', () => {
  const total = report.runQuery(db, company, { source: 'sales_orders', aggregations: [{ fn: 'sum', column: 'total_amount', alias: 't' }] }).rows[0].t;
  assert.equal(total, 350); // 100 + 250, NOT 999 from the other company
});

// --- 2. count + group by state ---
check('count aggregation with group-by dimension', () => {
  const result = report.runQuery(db, company, { source: 'sales_orders', group_by: ['state'], aggregations: [{ fn: 'count', alias: 'n' }] });
  assert.equal(result.rows[0].n, 2);
});

// --- 3. injection safety: disallowed column/dimension/agg rejected ---
check('non-whitelisted column is rejected', () => assert.throws(() => report.runQuery(db, company, { source: 'sales_orders', aggregations: [{ fn: 'sum', column: 'password', alias: 'x' }] }), (e) => e.code === 'REPORT_COLUMN_DENIED'));
check('non-whitelisted dimension is rejected', () => assert.throws(() => report.runQuery(db, company, { source: 'sales_orders', group_by: ['secret'] }), (e) => e.code === 'REPORT_DIMENSION_DENIED'));
check('SQL-injection attempt in alias is rejected', () => assert.throws(() => report.runQuery(db, company, { source: 'sales_orders', aggregations: [{ fn: 'sum', column: 'total_amount', alias: 'x); DROP TABLE sales_order;--' }] }), (e) => e.code === 'REPORT_ALIAS_INVALID'));
check('SQL-injection attempt in filter value is parameterized (no effect)', () => {
  const result = report.runQuery(db, company, { source: 'sales_orders', group_by: ['month'], aggregations: [{ fn: 'count', alias: 'n' }], filters: [{ column: 'state', op: 'eq', value: "confirmed'; DROP TABLE sales_order;--" }] });
  assert.equal(result.rows.length, 0); // no such state; table intact
  assert.ok(db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE name='sales_order'").get().n === 1);
});
check('unknown source is rejected', () => assert.throws(() => report.runQuery(db, company, { source: 'users' }), (e) => e.code === 'REPORT_SOURCE_UNKNOWN'));

// --- 4. save + run a saved query, company-scoped ---
const saved = report.saveQuery(db, company, def, 'analyst');
check('saved query runs and is company-scoped', () => {
  const result = report.runSavedQuery(db, company, saved.id);
  assert.ok(result.rows.length >= 2);
  assert.throws(() => report.runSavedQuery(db, 'company-rpt-other', saved.id), (e) => e.code === 'COMPANY_SCOPE_DENIED');
});

// --- 5. NL bridge produces an editable query definition (never SQL) ---
check('NL request maps to an editable query definition', () => {
  const nlDef = report.nlToQuery('sales by month');
  assert.equal(nlDef.source, 'sales_orders');
  assert.ok(nlDef.group_by.includes('month'));
  assert.ok(Array.isArray(nlDef.aggregations));
  // the definition is runnable via the same safe compiler
  const result = report.runQuery(db, company, nlDef);
  assert.ok(result.rows.length >= 1);
});
check('NL "purchases count by month" maps to the purchase source', () => {
  const nlDef = report.nlToQuery('purchases count by month');
  assert.equal(nlDef.source, 'purchase_orders');
  assert.equal(nlDef.aggregations[0].fn, 'count');
});

for (const line of results) console.log(line);
console.log(`R5 REPORT DESIGNER SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
db.close();
if (failures) process.exit(1);
