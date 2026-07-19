import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const dbPath = path.resolve(here, '../vnext-data/test-finance-t231.db');
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
const taxEngine = require('../vnext/server/finance/tax-engine');
const { mountTaxRoutes } = require('../vnext/server/finance/tax-routes');

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
function seedTaxSetup() {
  db.prepare(`
    INSERT INTO tax_group (id, name, company_id) VALUES ('tg_vat', 'VAT / ضريبة القيمة المضافة', 'company-r0-demo')
  `).run();

  db.prepare(`
    INSERT INTO tax (id, name, company_id, tax_group_id, amount_type, amount, price_include, type_tax_use)
    VALUES ('vat_15', 'VAT 15%', 'company-r0-demo', 'tg_vat', 'percent', 15.0, 0, 'sale')
  `).run();

  db.prepare(`
    INSERT INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
    VALUES ('rep_base', 'vat_15', 'base', 100.0, 'coa_401000', '["VAT_sale_base"]', 1)
  `).run();

  db.prepare(`
    INSERT INTO tax_repartition_line (id, tax_id, repartition_type, factor_percent, account_id, tag_ids, sign)
    VALUES ('rep_tax', 'vat_15', 'tax', 100.0, 'coa_202000', '["VAT_sale_tax"]', 1)
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

const taxRoutes = mountTaxRoutes({
  db,
  requireSession() { return { ok: true, userId: 'test_user', user: { role: 'admin' } }; }
});

try {
  // Seed the standard taxes
  seedTaxSetup();

  // ===========================================================================
  // SUITE 1: TAX COMPUTATION & REPARTITION LEGS (T2.3.1)
  // ===========================================================================
  console.log('=== SUITE 1: TAX COMPUTATION & REPARTITION LEGS ===');

  const comp1 = taxEngine.computeTaxes(db, 'company-r0-demo', {
    lines: [{ account_id: 'coa_401000', tax_id: 'vat_15', price_unit: 1000, quantity: 2, description: 'كتابة تقرير' }]
  });

  check('1.1 total base amount is correct (price * quantity)', comp1.total_base === 2000);
  check('1.2 total tax amount is correct (15% of 2000)', comp1.total_tax === 300);
  check('1.3 total gross amount is correct (base + tax)', comp1.total_amount === 2300);

  const baseLeg = comp1.lines.find(l => l.repartition_type === 'base');
  const taxLeg = comp1.lines.find(l => l.repartition_type === 'tax');

  check('1.4 base leg has correct account', baseLeg && baseLeg.account_id === 'coa_401000');
  check('1.5 base leg has correct base amount', baseLeg && baseLeg.base_amount === 2000);
  check('1.6 base leg has correct grid tag', baseLeg && baseLeg.tag_ids[0] === 'VAT_sale_base');

  check('1.7 tax leg has correct account', taxLeg && taxLeg.account_id === 'coa_202000');
  check('1.8 tax leg has correct tax amount', taxLeg && taxLeg.tax_amount === 300);
  check('1.9 tax leg has correct grid tag', taxLeg && taxLeg.tag_ids[0] === 'VAT_sale_tax');

  // ===========================================================================
  // SUITE 2: FISCAL POSITIONS (T2.3.1)
  // ===========================================================================
  console.log('\n=== SUITE 2: FISCAL POSITIONS ===');

  // Create exempt fiscal position
  db.prepare("INSERT INTO fiscal_position (id, name, company_id) VALUES ('exempt_pos', 'Exempt / معفي من الضريبة', 'company-r0-demo')").run();
  db.prepare("INSERT INTO fiscal_position_tax_map (id, fiscal_position_id, tax_src_id, tax_dest_id) VALUES ('map_1', 'exempt_pos', 'vat_15', NULL)").run();

  const compExempt = taxEngine.computeTaxes(db, 'company-r0-demo', {
    fiscalPositionId: 'exempt_pos',
    lines: [{ account_id: 'coa_401000', tax_id: 'vat_15', price_unit: 1000, quantity: 2 }]
  });

  check('2.1 exempt fiscal position maps tax to exempt (tax amount = 0)', compExempt.total_tax === 0);
  check('2.2 exempt fiscal position keeps full base amount', compExempt.total_base === 2000);

  // Create account swapping mapping
  db.prepare("INSERT INTO fiscal_position_account_map (id, fiscal_position_id, account_src_id, account_dest_id) VALUES ('map_acct_1', 'exempt_pos', 'coa_401000', 'coa_101000')").run();
  const compSwap = taxEngine.computeTaxes(db, 'company-r0-demo', {
    fiscalPositionId: 'exempt_pos',
    lines: [{ account_id: 'coa_401000', tax_id: 'vat_15', price_unit: 1000, quantity: 2 }]
  });
  check('2.3 fiscal position maps source account to destination account', compSwap.lines[0].account_id === 'coa_101000');

  // ===========================================================================
  // SUITE 3: WITHHOLDING CUMULATIVE THRESHOLDS (T2.3.1)
  // ===========================================================================
  console.log('\n=== SUITE 3: WITHHOLDING CUMULATIVE THRESHOLDS ===');

  // 1. Single transaction threshold
  db.prepare(`
    INSERT INTO withholding_category (id, name, company_id, rate, threshold, cumulative_threshold, cumulative_window)
    VALUES ('wht_5', 'WHT 5%', 'company-r0-demo', 5.0, 10000.0, 0.0, 'none')
  `).run();

  const wht1 = taxEngine.checkAndApplyWithholding(db, 'company-r0-demo', {
    partnerId: 'partner_abc', amount: 8000, docDate: '2026-07-05', docId: 'doc_1', userId: 'test_user'
  });
  check('3.1 purchase below single threshold does not trigger withholding', wht1 === null);

  const wht2 = taxEngine.checkAndApplyWithholding(db, 'company-r0-demo', {
    partnerId: 'partner_abc', amount: 12000, docDate: '2026-07-06', docId: 'doc_2', userId: 'test_user'
  });
  check('3.2 purchase above single threshold triggers 5% withholding', wht2 && wht2.withhold_amount === 600);
  check('3.3 certificate record is created in DB', !!db.prepare("SELECT * FROM withholding_certificate WHERE partner_id='partner_abc'").get());

  // Clean up wht_5 so it doesn't interfere with cumulative checks
  db.prepare("DELETE FROM withholding_certificate WHERE withholding_category_id = 'wht_5'").run();
  db.prepare("DELETE FROM withholding_category WHERE id = 'wht_5'").run();

  // 2. Cumulative monthly threshold
  db.prepare(`
    INSERT INTO withholding_category (id, name, company_id, rate, threshold, cumulative_threshold, cumulative_window)
    VALUES ('wht_cum_10', 'WHT Cumulative 10%', 'company-r0-demo', 10.0, 0.0, 20000.0, 'monthly')
  `).run();

  const whtCum1 = taxEngine.checkAndApplyWithholding(db, 'company-r0-demo', {
    partnerId: 'partner_xyz', amount: 12000, docDate: '2026-07-05', docId: 'doc_3', userId: 'test_user'
  });
  check('3.4 first purchase is below cumulative threshold (no withholding)', whtCum1 === null);

  // Second purchase in the same month triggers cumulative threshold (12000 + 9000 = 21000 >= 20000)
  const whtCum2 = taxEngine.checkAndApplyWithholding(db, 'company-r0-demo', {
    partnerId: 'partner_xyz', amount: 9000, docDate: '2026-07-10', docId: 'doc_4', userId: 'test_user'
  });
  check('3.5 second purchase in same month breaches cumulative threshold and triggers withholding', whtCum2 && whtCum2.withhold_amount === 900);

  // A purchase in a new month should NOT trigger because monthly cumulative resets
  const whtCumNewMonth = taxEngine.checkAndApplyWithholding(db, 'company-r0-demo', {
    partnerId: 'partner_xyz', amount: 8000, docDate: '2026-08-01', docId: 'doc_5', userId: 'test_user'
  });
  check('3.6 purchase in new month does not trigger (cumulative reset)', whtCumNewMonth === null);

  // ===========================================================================
  // SUITE 4: TAX REPORT & RECONCILIATION (T2.3.1)
  // ===========================================================================
  console.log('\n=== SUITE 4: TAX REPORT & RECONCILIATION ===');

  // Let's post a journal entry with tag_ids (representing tax legs)
  const docId = 'doc_tax_post';
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, state, currency, created_at, created_by)
    VALUES (?, 'company-r0-demo', 'INV-202607-00001', 'sales_invoice', '2026-07-15', 'posted', 'IQD', ?, 'test_user')
  `).run(docId, nowIso);

  // Insert parents into fiscal_doc_line first
  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
    VALUES ('l1', ?, 'company-r0-demo', 'coa_103000', 2300, 0, ?)
  `).run(docId, nowIso);

  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
    VALUES ('l2', ?, 'company-r0-demo', 'coa_401000', 0, 2000, ?)
  `).run(docId, nowIso);

  db.prepare(`
    INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, created_at)
    VALUES ('l3', ?, 'company-r0-demo', 'coa_202000', 0, 300, ?)
  `).run(docId, nowIso);

  // Debit receivable
  db.prepare(`
    INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, created_at, created_by, tax_tag_ids)
    VALUES ('gl_1', 'company-r0-demo', ?, 'l1', 'coa_103000', '2026-07-15', 2300, 0, ?, 'test_user', NULL)
  `).run(docId, nowIso);

  // Credit sales (base)
  db.prepare(`
    INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, created_at, created_by, tax_tag_ids)
    VALUES ('gl_2', 'company-r0-demo', ?, 'l2', 'coa_401000', '2026-07-15', 0, 2000, ?, 'test_user', '["VAT_sale_base"]')
  `).run(docId, nowIso);

  // Credit tax payable
  db.prepare(`
    INSERT INTO gl_line (id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, posting_date, debit, credit, created_at, created_by, tax_tag_ids)
    VALUES ('gl_3', 'company-r0-demo', ?, 'l3', 'coa_202000', '2026-07-15', 0, 300, ?, 'test_user', '["VAT_sale_tax"]')
  `).run(docId, nowIso);

  // Fetch report
  const report = taxEngine.getTaxReport(db, 'company-r0-demo', '2026-07-01', '2026-07-31');
  const baseTag = report.find(r => r.tag_id === 'VAT_sale_base');
  const taxTag = report.find(r => r.tag_id === 'VAT_sale_tax');

  check('4.1 tax report contains base tag', !!baseTag);
  check('4.2 base tag balance matches credit posted (-2000)', baseTag && baseTag.balance === -2000);
  check('4.3 tax report contains tax tag', !!taxTag);
  check('4.4 tax tag balance matches credit posted (-300)', taxTag && taxTag.balance === -300);

  // ===========================================================================
  // SUITE 5: HTTP ROUTING ENDPOINTS FOR TAX ENGINE (T2.3.1)
  // ===========================================================================
  console.log('\n=== SUITE 5: HTTP ENDPOINTS ===');

  // Test POST /api/x/finance/tax/compute
  const req51 = mockReq('POST', {
    company_id: 'company-r0-demo',
    lines: [{ account_id: 'coa_401000', tax_id: 'vat_15', price_unit: 1000, quantity: 2 }]
  });
  const res51 = mockRes();
  taxRoutes.handle(req51, res51, new URL('http://localhost/api/x/finance/tax/compute'));
  await wait();
  check('5.1 API tax compute returns 200', res51.statusCode === 200);
  const body51 = JSON.parse(res51.body);
  check('5.2 API compute returns correct total base', body51.data && body51.data.total_base === 2000);

  // Test POST /api/x/finance/tax/withholding
  // Reinsert wht_5 for API test
  db.prepare(`
    INSERT INTO withholding_category (id, name, company_id, rate, threshold, cumulative_threshold, cumulative_window)
    VALUES ('wht_5', 'WHT 5%', 'company-r0-demo', 5.0, 10000.0, 0.0, 'none')
  `).run();

  const req52 = mockReq('POST', {
    company_id: 'company-r0-demo', partner_id: 'partner_abc', amount: 15000, doc_date: '2026-07-15'
  });
  const res52 = mockRes();
  taxRoutes.handle(req52, res52, new URL('http://localhost/api/x/finance/tax/withholding'));
  await wait();
  check('5.3 API tax withholding returns 200', res52.statusCode === 200);
  const body52 = JSON.parse(res52.body);
  check('5.4 API withholding returns withhold amount', body52.data && body52.data.withhold_amount === 750);

  // Test GET /api/x/finance/tax/report
  const req53 = mockReq('GET');
  const res53 = mockRes();
  taxRoutes.handle(req53, res53, new URL('http://localhost/api/x/finance/tax/report?company_id=company-r0-demo&start_date=2026-07-01&end_date=2026-07-31'));
  await wait();
  check('5.5 API tax report returns 200', res53.statusCode === 200);
  const body53 = JSON.parse(res53.body);
  check('5.6 API report contains tag rows', body53.data && body53.data.length >= 2);

} catch (err) {
  console.error('Unhandled test execution error:', err);
  failures++;
} finally {
  db.close();

  // Clean up test DB files
  try { fs.unlinkSync(dbPath); } catch (_) {}
  try { fs.unlinkSync(dbPath + '-wal'); } catch (_) {}
  try { fs.unlinkSync(dbPath + '-shm'); } catch (_) {}

  console.log(`\nTax verification completed. Total failures: ${failures}`);
  process.exitCode = failures > 0 ? 1 : 0;
}
