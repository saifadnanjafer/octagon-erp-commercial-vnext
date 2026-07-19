// R6.1 focused acceptance: disposable DB only. Proves terminal/session
// lifecycle, offline replay exactly-once, refund bounds, company scope,
// self-order capture, and Z-report GL reconciliation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import pos from '../vnext/server/modules/pos/pos-engine.js';
import { mountConnectivityRoutes } from '../vnext/server/events/events.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r6-pos-'));
const dbPath = path.join(temp, 'r6-pos.db');
await runMigrations({ dbPath, direction: 'up' });
const db = openMigrationDatabase(dbPath);
const results = [];
let failures = 0;
function check(name, fn) { try { fn(); results.push(`PASS ${name}`); } catch (error) { failures += 1; results.push(`FAIL ${name}: ${error.message}`); } }

const company = 'company-r0-demo';
db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('company-r6-other', 'Other R6 Company');
db.prepare(`INSERT INTO product_master(id,company_id,code,name,income_account_id,expense_account_id,active,created_at,created_by)
  VALUES(?,?,?,?,?,?,?,?,?)`).run('pos-product-1', company, 'POS-1', 'Coffee', 'coa_401000', 'coa_501000', 1, new Date().toISOString(), 'fixture');
db.prepare(`INSERT INTO product_master(id,company_id,code,name,income_account_id,expense_account_id,active,created_at,created_by)
  VALUES(?,?,?,?,?,?,?,?,?)`).run('pos-product-other', 'company-r6-other', 'OTHER-1', 'Other company item', 'coa_401000', 'coa_501000', 1, new Date().toISOString(), 'fixture');

const terminal = pos.createTerminal(db, company, { id: 'pos-terminal-1', code: 'T01', name: 'Front Counter' }, 'cashier-1');
const session = pos.openSession(db, company, terminal.id, 100, 'cashier-1');
const salePayload = { session_id: session.id, client_sale_id: 'device-1-sale-1', source: 'offline', payment_method: 'cash', lines: [{ product_id: 'pos-product-1', qty: 2, unit_price: 100 }] };
const first = pos.syncSale(db, { companyId: company, tenantId: company, userId: 'cashier-1' }, salePayload, { idempotencyKey: 'device-1-command-1' });
const replay = pos.syncSale(db, { companyId: company, tenantId: company, userId: 'cashier-1' }, salePayload, { idempotencyKey: 'device-1-command-1' });

check('terminal profile and session open in company scope', () => {
  assert.equal(terminal.cash_account_id, 'coa_101000');
  assert.equal(session.state, 'open');
  assert.equal(pos.listTerminals(db, company).length, 1);
});
check('offline sale is captured with server-calculated total', () => {
  assert.equal(first.success, true);
  assert.equal(first.data.sale.total, 200);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pos_sale').get().n, 1);
});
check('same offline command replays exactly once', () => {
  assert.equal(replay.replayed, true);
  assert.equal(replay.data.sale.id, first.data.sale.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pos_sale_line').get().n, 1);
});
check('same idempotency key with changed payload conflicts', () => {
  assert.throws(() => pos.syncSale(db, { companyId: company, tenantId: company, userId: 'cashier-1' }, { ...salePayload, lines: [{ product_id: 'pos-product-1', qty: 3, unit_price: 100 }] }, { idempotencyKey: 'device-1-command-1' }), (error) => error.code === 'IDEMPOTENCY_CONFLICT');
});
check('server rejects a cross-company product in an offline payload', () => {
  assert.throws(() => pos.syncSale(db, { companyId: company, tenantId: company, userId: 'cashier-1' }, { ...salePayload, client_sale_id: 'cross-company', lines: [{ product_id: 'pos-product-other', qty: 1, unit_price: 1 }] }, { idempotencyKey: 'cross-company-command' }), (error) => error.code === 'COMPANY_SCOPE_DENIED');
});

const refund = pos.syncSale(db, { companyId: company, tenantId: company, userId: 'cashier-1' }, { session_id: session.id, client_sale_id: 'device-1-refund-1', kind: 'refund', original_sale_id: first.data.sale.id, source: 'offline', payment_method: 'cash', lines: [{ product_id: 'pos-product-1', qty: 1, unit_price: 50 }] }, { idempotencyKey: 'device-1-command-refund' });
check('refund is tied to the original session and bounded', () => {
  assert.equal(refund.data.sale.kind, 'refund');
  assert.throws(() => pos.syncSale(db, { companyId: company, tenantId: company, userId: 'cashier-1' }, { session_id: session.id, client_sale_id: 'too-large-refund', kind: 'refund', original_sale_id: first.data.sale.id, payment_method: 'cash', lines: [{ product_id: 'pos-product-1', qty: 2, unit_price: 100 }] }, { idempotencyKey: 'too-large-refund-command' }), (error) => error.code === 'POS_REFUND_EXCEEDS_ORIGINAL');
});

const selfOrder = pos.createSelfOrder(db, terminal.self_order_token, { lines: [{ product_id: 'pos-product-1', qty: 1, unit_price: 125 }] });
check('QR self-order uses the token-scoped terminal and remains a draft', () => {
  assert.equal(selfOrder.sale.source, 'self_order');
  assert.equal(selfOrder.sale.state, 'draft');
  assert.equal(pos.selfOrderMenu(db, terminal.self_order_token).products.length, 1);
});

const connectivity = mountConnectivityRoutes({
  db,
  requireSession: () => ({ ok: true, userId: 'cashier-1', groups: ['system.admin'] }),
  resolveScope: () => ({ tenantId: company, companyId: company }),
  readRequestBody: async (req) => req.body,
  sendJson: (res, status, body) => { res.statusCode = status; res.body = body; },
  posCommand: (context, command) => pos.syncSale(db, context, command.payload, { idempotencyKey: command.idempotency_key }),
});
async function command(body) {
  const req = new EventEmitter();
  req.method = 'POST'; req.headers = { 'x-company-id': company }; req.body = JSON.stringify(body);
  const res = {};
  connectivity.handle(req, res, { pathname: '/api/vnext/commands', searchParams: new URLSearchParams() });
  await new Promise((resolve) => setTimeout(resolve, 0));
  return res;
}
const commandBody = { command: { type: 'pos.sale', idempotency_key: 'connectivity-pos-1', company_id: company, payload: { session_id: session.id, client_sale_id: 'connectivity-sale-1', source: 'offline', payment_method: 'card', lines: [{ product_id: 'pos-product-1', qty: 1, unit_price: 30 }] } } };
const commandResponse = await command(commandBody);
const commandReplay = await command(commandBody);
check('connectivity command endpoint delegates POS replay exactly once', () => {
  assert.equal(commandResponse.statusCode, 200);
  assert.equal(commandResponse.body.success, true);
  assert.equal(commandReplay.body.replayed, true);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM pos_sale').get().n, 4);
});
const prohibited = await command({ command: { type: 'platform.payment', idempotency_key: 'prohibited-1', payload: {} } });
check('connectivity foundation still fails closed for prohibited offline commands', () => {
  assert.equal(prohibited.statusCode, 403);
  assert.equal(prohibited.body.code, 'OFFLINE_PROHIBITED');
});

const z = pos.closeSession(db, company, session.id, 250, 'cashier-1');
check('Z-report computes cash, card, refund, and variance totals', () => {
  assert.equal(z.report.gross_sales, 230);
  assert.equal(z.report.refunds, 50);
  assert.equal(z.report.cash_sales, 150);
  assert.equal(z.report.card_sales, 30);
  assert.equal(z.report.expected_cash, 250);
  assert.equal(z.report.counted_cash, 250);
  assert.equal(z.report.variance, 0);
});
check('Z-report posts one balanced canonical GL document', () => {
  assert.ok(z.fiscal_doc_id);
  const doc = db.prepare('SELECT state,move_type FROM fiscal_doc WHERE id=?').get(z.fiscal_doc_id);
  assert.equal(doc.state, 'posted');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM gl_line WHERE fiscal_doc_id=?').get(z.fiscal_doc_id).n, 4);
  const totals = db.prepare('SELECT COALESCE(SUM(debit),0) debit, COALESCE(SUM(credit),0) credit FROM gl_line WHERE fiscal_doc_id=?').get(z.fiscal_doc_id);
  assert.equal(totals.debit, 180);
  assert.equal(totals.credit, 180);
});
check('closed session cannot accept another sale', () => {
  assert.throws(() => pos.syncSale(db, { companyId: company, tenantId: company, userId: 'cashier-1' }, { session_id: session.id, client_sale_id: 'after-close', payment_method: 'cash', lines: [{ product_id: 'pos-product-1', qty: 1, unit_price: 1 }] }, { idempotencyKey: 'after-close-command' }), (error) => error.code === 'POS_SESSION_CLOSED');
});

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 631 down restores the POS schema boundary', () => {
  assert.ok(down.migrations.includes('631_r6_pos_v2'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='pos_sale'").get(), undefined);
});
afterDown.close();
for (const line of results) console.log(line);
console.log(`R6 POS V2 SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
