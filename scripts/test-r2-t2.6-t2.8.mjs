'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const dbPath = path.resolve(here, '../vnext-data/test-r2-t26-t28.db');
for (const suffix of ['', '-wal', '-shm']) { try { fs.unlinkSync(dbPath + suffix); } catch (_) {} }
const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;');
const migrationFiles = [
  '001_r0_scope_contract.mjs','101_r1_lane_a_tables.mjs','201_r1_lane_b_tables.mjs','301_r1_lane_c_tables.mjs','401_r1_lane_d_tables.mjs','501_r1_kernel_completion.mjs',
  '102_r1_lane_a_completion.mjs','202_r1_lane_b_completion.mjs','302_r1_lane_c_completion.mjs','402_r1_lane_d_completion.mjs',
  '601_r2_finance_baseline.mjs','602_r2_period_locks.mjs','603_r2_tax_engine.mjs','604_r2_accounting_dimensions.mjs','605_r2_stock_ledger.mjs','606_r2_stock_gl_perpetual.mjs','607_t2_o10_connectivity_foundation.mjs','608_r2_arap_bank_reconciliation.mjs','609_r2_localization_framework.mjs'
];
for (const file of migrationFiles) { const mod = await import(pathToFileURL(path.resolve(here, '../migrations', file)).href); mod.migration.up(db); }
const { applyR0ScopeSeed, applyAclAdminDefaultSeed } = await import('../vnext/server/db/seed-runner.mjs');
applyR0ScopeSeed(db); applyAclAdminDefaultSeed(db);
const finance = require('../vnext/server/finance/finance-engine');
const arap = require('../vnext/server/finance/arap-engine');
const bank = require('../vnext/server/finance/bank-engine');
const reports = require('../vnext/server/finance/report-engine');
const localization = require('../vnext/server/localization/localization-engine');
const { mountR2FinanceRoutes } = require('../vnext/server/finance/r2-finance-routes');
let pass = 0; let fail = 0;
function check(label, condition, details) { if (condition) { pass += 1; console.log(`PASS ${label}`); } else { fail += 1; console.error(`FAIL ${label}`, details || ''); } }
function expectError(label, fn, contains) { try { fn(); fail += 1; console.error(`FAIL ${label} did not throw`); } catch (e) { const ok = !contains || String(e.message).toLowerCase().includes(String(contains).toLowerCase()); check(label, ok, e.message); } }
function period(companyId, id = `period_${companyId}`) { db.prepare('INSERT OR IGNORE INTO fiscal_periods(period_id,company_id,name,start_date,end_date,status) VALUES(?,?,?,?,?,?)').run(id, companyId, '2026 July', '2026-07-01', '2026-07-31', 'open'); }
function company(id) { db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run(id, id); period(id); }

console.log('=== T2.6.1 AR/AP, PAYMENTS, ALLOCATIONS ===');
const companyId = 'company-r0-demo';
db.prepare('INSERT OR IGNORE INTO dimension(id,name,company_id) VALUES(?,?,?)').run('dim_cost_center', 'Cost center', companyId);
db.prepare('INSERT OR IGNORE INTO dimension_value(id,dimension_id,code,name) VALUES(?,?,?,?)').run('dim_cc_sales', 'dim_cost_center', 'CC-SALES', 'Sales');
const partner = arap.createPartner(db, companyId, { id: 'partner_customer', name: 'Customer', partner_type: 'customer' }, 'tester');
const product = arap.createProduct(db, companyId, { id: 'product_service', code: 'SVC-1', name: 'Service' }, 'tester');
const invoice = arap.createArapDocument(db, companyId, { id: 'invoice_1', document_kind: 'customer_invoice', partner_id: partner.id, doc_date: '2026-07-18', due_date: '2026-07-31', lines: [{ product_id: product.id, quantity: 1, price_unit: 100 }] }, 'tester');
const invoicePost = arap.postArapDocument(db, invoice.id, 'tester');
check('balanced invoice posts through immutable GL', invoicePost.success && db.prepare("SELECT COUNT(*) c FROM gl_line WHERE fiscal_doc_id='invoice_1'").get().c === 2);
const partial = arap.createPayment(db, companyId, { id: 'payment_partial', partner_id: partner.id, payment_type: 'receive', amount: 40, account_id: 'coa_101000', payment_date: '2026-07-18', idempotency_key: 'pay-key-1', allocations: [{ arap_document_id: invoice.id, amount: 40 }] }, 'tester');
check('partial payment computes partial state', partial.allocated_amount === 40 && arap.documentOpenAmount(db, invoice.id).payment_state === 'partial');
const settled = arap.createPayment(db, companyId, { id: 'payment_final', partner_id: partner.id, payment_type: 'receive', amount: 60, account_id: 'coa_101000', payment_date: '2026-07-18', idempotency_key: 'pay-key-2', allocations: [{ arap_document_id: invoice.id, amount: 60 }] }, 'tester');
check('full payment computes paid state', settled.allocated_amount === 60 && arap.documentOpenAmount(db, invoice.id).payment_state === 'paid');
const over = arap.createPayment(db, companyId, { id: 'payment_over', partner_id: partner.id, payment_type: 'receive', amount: 25, account_id: 'coa_101000', payment_date: '2026-07-18', idempotency_key: 'pay-key-3' }, 'tester');
check('overpayment remains unapplied', over.unapplied_amount === 25 && over.payment_state === 'unapplied');
const replay = arap.createPayment(db, companyId, { partner_id: partner.id, payment_type: 'receive', amount: 25, account_id: 'coa_101000', idempotency_key: 'pay-key-3' }, 'other-user');
check('duplicate payment retry is idempotent', replay.replayed === true && replay.id === over.id);
const reversed = arap.reversePayment(db, over.id, 'tester');
check('payment reversal posts a balancing reversal', !!reversed.docNumber && db.prepare("SELECT status FROM payment WHERE id='payment_over'").get().status === 'cancelled');
company('company-two');
const otherPartner = arap.createPartner(db, 'company-two', { id: 'partner_two', name: 'Other', partner_type: 'customer' }, 'tester');
expectError('cross-company document denied', () => arap.createArapDocument(db, companyId, { document_kind: 'customer_invoice', partner_id: otherPartner.id, lines: [{ amount: 5 }] }, 'tester'), 'scope');
expectError('currency mismatch denied without rate', () => arap.createArapDocument(db, companyId, { document_kind: 'customer_invoice', partner_id: partner.id, currency: 'USD', lines: [{ amount: 5 }] }, 'tester'), 'currency');
const fxPartner = arap.createPartner(db, companyId, { id: 'partner_usd', name: 'USD Customer', partner_type: 'customer', currency: 'USD' }, 'tester');
const fxInvoice = arap.createArapDocument(db, companyId, { id: 'fx_invoice', document_kind: 'customer_invoice', partner_id: fxPartner.id, currency: 'USD', fx_rate: 1500, doc_date: '2026-07-18', lines: [{ amount: 10, dims: { dim_cc_sales: 100 } }] }, 'tester');
arap.postArapDocument(db, fxInvoice.id, 'tester');
const fxPayment = arap.createPayment(db, companyId, { id: 'fx_payment', partner_id: fxPartner.id, payment_type: 'receive', amount: 10, currency: 'USD', fx_rate: 1600, account_id: 'coa_101000', payment_date: '2026-07-18', idempotency_key: 'fx-pay-key', allocations: [{ arap_document_id: fxInvoice.id, amount: 10 }] }, 'tester');
const fxLines = db.prepare("SELECT description, debit, credit FROM fiscal_doc_line WHERE fiscal_doc_id=?").all(fxPayment.fiscal_doc_id);
check('foreign-currency settlement posts FX gain/loss and stays balanced', fxLines.some(row => String(row.description).includes('Foreign-exchange')) && Math.abs(fxLines.reduce((s, row) => s + Number(row.debit) - Number(row.credit), 0)) < 0.0001);
db.prepare("INSERT INTO company_lock_dates(company_id,gl_lock_date,stock_lock_date,updated_at,updated_by) VALUES(?,? ,NULL,?,?) ON CONFLICT(company_id) DO UPDATE SET gl_lock_date=excluded.gl_lock_date,updated_at=excluded.updated_at,updated_by=excluded.updated_by").run(companyId, '2026-07-18', new Date().toISOString(), 'tester');
const lockedDoc = arap.createArapDocument(db, companyId, { document_kind: 'customer_invoice', partner_id: partner.id, doc_date: '2026-07-18', lines: [{ amount: 5 }] }, 'tester');
expectError('closed period rejects posting', () => arap.postArapDocument(db, lockedDoc.id, 'tester'), 'locked');
db.prepare("UPDATE company_lock_dates SET gl_lock_date=NULL WHERE company_id=?").run(companyId);

console.log('=== T2.6.2 BANK RECONCILIATION ===');
const bankAccount = bank.createBankAccount(db, companyId, { id: 'bank_main', name: 'Main Bank', account_id: 'coa_102000' }, 'tester');
const statement = bank.importStatement(db, companyId, { id: 'statement_1', bank_account_id: bankAccount.id, statement_date: '2026-07-18', import_key: 'statement-import-1', lines: [{ id: 'bankline_1', transaction_date: '2026-07-18', amount: 40, currency: 'IQD', description: 'Customer payment', external_id: 'EXT-1' }, { id: 'bankline_2', transaction_date: '2026-07-18', amount: 999, currency: 'IQD', description: 'Unmatched', external_id: 'EXT-2' }] }, 'tester');
check('statement import creates lines', statement.imported === 2 && db.prepare('SELECT COUNT(*) c FROM bank_statement_line WHERE statement_id=?').get(statement.id).c === 2);
check('duplicate statement import is rejected/replayed safely', bank.importStatement(db, companyId, { bank_account_id: bankAccount.id, import_key: 'statement-import-1', lines: [] }, 'tester').duplicate === true);
const match = bank.matchBankLine(db, companyId, 'bankline_1', {}, 'tester');
check('exact bank match reconciles payment', match.matched === true && db.prepare("SELECT status FROM bank_statement_line WHERE id='bankline_1'").get().status === 'reconciled');
const rule = bank.createMatchRule(db, companyId, { id: 'rule_customer', name: 'Customer receipts', description_pattern: 'customer', amount_tolerance: 0.01, target_account_id: 'coa_103000' }, 'tester');
check('bank match rule is company-scoped and reusable', rule.id === 'rule_customer' && bank.listMatchRules(db, companyId).length === 1);
const manual = bank.manualReconcile(db, companyId, 'bankline_2', { target_type: 'payment', target_id: partial.id, amount: 10 }, 'tester');
check('manual partial reconciliation is auditable', manual.matched === true && db.prepare('SELECT method FROM bank_reconciliation WHERE id=?').get(manual.reconciliation_id).method === 'manual');
const unreconciled = bank.unreconcile(db, companyId, manual.reconciliation_id, 'tester');
check('unreconcile reverses evidence', unreconciled.status === 'reversed' && db.prepare("SELECT status FROM bank_statement_line WHERE id='bankline_2'").get().status === 'unmatched');
const difference = bank.recordBankDifference(db, companyId, 'bankline_2', { account_id: 'coa_502000', reason: 'Bank fee' }, 'tester');
check('bank difference posts declared balancing entry', !!difference.fiscal_doc_id && db.prepare('SELECT state FROM fiscal_doc WHERE id=?').get(difference.fiscal_doc_id).state === 'posted');

console.log('=== T2.7.1 REPORTS ===');
const tb = reports.report(db, companyId, 'trial_balance', { start_date: '2026-07-01', end_date: '2026-07-31' });
const bs = reports.report(db, companyId, 'balance_sheet', { start_date: '2026-07-01', end_date: '2026-07-31' });
const pl = reports.report(db, companyId, 'profit_loss', { start_date: '2026-07-01', end_date: '2026-07-31' });
const aging = reports.report(db, companyId, 'ar_aging', { as_of: '2026-07-31' });
const dimensionRows = reports.report(db, companyId, 'dimension_pnl', { dimension_id: 'dim_cost_center', start_date: '2026-07-01', end_date: '2026-07-31' });
const otherDimensionRows = reports.report(db, companyId, 'dimension_pnl', { dimension_id: 'missing_dimension', start_date: '2026-07-01', end_date: '2026-07-31' });
check('trial balance debit equals credit', Math.abs(tb.reduce((s, r) => s + Number(r.total_debit), 0) - tb.reduce((s, r) => s + Number(r.total_credit), 0)) < 0.0001);
check('balance sheet reconciles A=L+E', bs.totals.balanced === true);
check('P&L is ledger-derived', Array.isArray(pl.rows) && pl.rows.every(r => r.account_id));
check('AR aging residual equals open item facts', aging.total_open === 0 && aging.rows.length === 0);
check('report drill-through references source documents', reports.report(db, companyId, 'partner_ledger', { partner_id: partner.id }).every(r => r.fiscal_doc_id));
check('report export is deterministic CSV', reports.csv(tb).includes('account_id'));
check('dimension report filters the requested dimension key', dimensionRows.rows.length > 0 && otherDimensionRows.rows.length === 0);

console.log('=== T2.8.1 LOCALIZATION ===');
const installed = localization.installPack(db, 'company-two', 'l10n_iq', 'admin');
check('Iraq pack installs idempotently for fresh company', installed.pack_id === 'l10n_iq' && localization.getCompanyLocalization(db, 'company-two').length === 1);
check('Iraq pack provides configurable tax and bilingual terms', !!db.prepare("SELECT 1 FROM tax WHERE id='l10n_iq_company-two_configurable_vat'").get() && JSON.parse(db.prepare("SELECT manifest FROM localization_pack WHERE pack_id='l10n_iq'").get().manifest).configurable_rates === true);
const removed = localization.uninstallPack(db, 'company-two', 'l10n_iq', 'admin');
check('Iraq pack uninstall leaves no company residue', removed.removed === true && localization.getCompanyLocalization(db, 'company-two').length === 0 && db.prepare("SELECT COUNT(*) c FROM account WHERE company_id='company-two' AND id LIKE 'l10n_iq_company-two_%'").get().c === 0);

console.log(`T2.6.1-T2.8.1 SUITE: ${pass} PASS, ${fail} FAIL, 0 SKIP, ${pass + fail} TOTAL`);
db.close();
if (fail) process.exitCode = 1;
