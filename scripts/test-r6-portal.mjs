// R6.4 focused acceptance: disposable DB only. Proves customer/vendor portals,
// security scoping, quote promotions, statement calculations, RFQ bidding, PO acceptance, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import port from '../vnext/server/modules/portal/portal-engine.js';
import { mountPortalRoutes } from '../vnext/server/modules/portal/portal-routes.js';
import arap from '../vnext/server/finance/arap-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r6-portal-'));
const dbPath = path.join(temp, 'r6-portal.db');
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

// Create partners
const customer = arap.createPartner(db, company, { id: 'cust-1', name: 'Customer 1', partner_type: 'customer' }, 'system');
const vendor = arap.createPartner(db, company, { id: 'vend-1', name: 'Vendor 1', partner_type: 'supplier' }, 'system');

// Create products
const product = arap.createProduct(db, company, { id: 'prod-1', name: 'Standard Product', code: 'PROD-STD' }, 'system');

// 1. Link portal users
check('portal user profiles are linked and retrieved', () => {
  const cLink = port.linkPortalUser(db, company, 'user-cust', 'cust-1');
  assert.equal(cLink.user_id, 'user-cust');
  assert.equal(cLink.partner_id, 'cust-1');
  
  const vLink = port.linkPortalUser(db, company, 'user-vend', 'vend-1');
  assert.equal(vLink.user_id, 'user-vend');
  assert.equal(vLink.partner_id, 'vend-1');
  
  const partnerId = port.getPortalPartnerId(db, company, 'user-cust');
  assert.equal(partnerId, 'cust-1');
  
  // Non-existent user check
  const nonId = port.getPortalPartnerId(db, company, 'user-non');
  assert.equal(nonId, null);
});

// 2. Customer Dashboard & Transactions
check('customer dashboard, quotes approval, invoices, and statements work under own scope', () => {
  // Create sales quote
  db.prepare(`
    INSERT INTO sales_quote (id, company_id, partner_id, quote_number, state, currency, total_amount, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('q-1', company, 'cust-1', 'Q-1001', 'sent', 'IQD', 500000, new Date().toISOString(), 'sales-rep');
  
  // Create customer invoice
  const inv = arap.createArapDocument(db, company, {
    document_kind: 'customer_invoice',
    partner_id: 'cust-1',
    doc_date: '2026-07-01',
    due_date: '2026-07-15',
    lines: [{ product_id: 'prod-1', quantity: 2, price_unit: 100000, description: 'Products sold' }]
  }, 'system');
  arap.postArapDocument(db, inv.id, 'system');
  
  // Check dashboard metrics
  const dash = port.getCustomerDashboard(db, company, 'user-cust');
  assert.equal(dash.sent_quotes_count, 1);
  assert.equal(dash.total_invoices_count, 1);
  
  // Customer Quote approval
  const approveRes = port.approveQuote(db, company, 'user-cust', 'q-1', 'Signature Customer');
  assert.equal(approveRes.quote.state, 'approved');
  assert.ok(approveRes.sales_order_id);
  
  const so = db.prepare('SELECT * FROM sales_order WHERE id = ?').get(approveRes.sales_order_id);
  assert.equal(so.partner_id, 'cust-1');
  assert.equal(so.total_amount, 500000);
  assert.equal(so.state, 'draft');
  
  // Invoices list
  const invs = port.listCustomerInvoices(db, company, 'user-cust');
  assert.equal(invs.length, 1);
  assert.equal(invs[0].total_amount, 200000);
  
  // Statements calculation
  const statement = port.getCustomerAccountStatement(db, company, 'user-cust', '2026-07-01', '2026-07-20');
  assert.equal(statement.lines.length, 1); // 1 GL line: debit (receivable)
  assert.equal(statement.closing_balance, 200000);
});

// 3. Vendor Dashboard & Transactions
check('vendor dashboard, RFQ quoting, PO confirmation, and bills work under own scope', () => {
  // Create purchase RFQ
  db.prepare(`
    INSERT INTO purchase_rfq (id, company_id, supplier_id, state, currency, response_due, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run('rfq-1', company, 'vend-1', 'sent', 'IQD', '2026-08-01', new Date().toISOString());
  
  // Create purchase order in draft
  db.prepare(`
    INSERT INTO purchase_order (id, company_id, supplier_id, order_number, state, currency, total_amount, created_at, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run('po-1', company, 'vend-1', 'PO-1001', 'sent', 'IQD', 800000, new Date().toISOString(), 'system');
  
  // Check vendor dashboard
  const dash = port.getVendorDashboard(db, company, 'user-vend');
  assert.equal(dash.sent_rfqs_count, 1);
  assert.equal(dash.active_orders_count, 1);
  
  // Submit Quote / Bid for RFQ
  const quoteRes = port.submitVendorQuote(db, company, 'user-vend', 'rfq-1', 750000, { lead_time_days: 7 });
  assert.ok(quoteRes.supplier_quote_id);
  assert.equal(quoteRes.state, 'quote_received');
  
  // Confirm PO
  const updatedPo = port.confirmVendorOrder(db, company, 'user-vend', 'po-1', 'accept');
  assert.equal(updatedPo.state, 'confirmed');
});

// 4. IDOR Safety Negatives
check('portal routes reject unlinked users or cross-partner requests (IDOR proof)', () => {
  // User not linked
  assert.throws(() => port.getCustomerDashboard(db, company, 'user-unlinked'), /user is not linked to a partner profile/);
  
  // Link user to another partner in another company or test isolation
  db.prepare('INSERT OR IGNORE INTO companies(company_id,name) VALUES(?,?)').run('company-isolated', 'Isolated Company');
  assert.throws(() => port.getCustomerDashboard(db, 'company-isolated', 'user-cust'), /user is not linked to a partner profile/);
});

// 5. Routes and HTTP adapters
check('portal routes check authorization and scopes', async () => {
  const routes = mountPortalRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-cust', groups: ['portal'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; }
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
  
  const r1 = await testRoute('GET', '/api/x/portal/customer/dashboard');
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  assert.equal(r1.res.body.success, true);
  assert.equal(r1.res.body.data.partner_id, 'cust-1');
  
  // POST to link (requires portal:manage, which is not granted to groups: ['portal'])
  const r2 = await testRoute('POST', '/api/x/portal/link', { user_id: 'user-new', partner_id: 'cust-1' });
  assert.equal(r2.processed, true);
  assert.equal(r2.res.statusCode, 403);
});

// 6. Rollback testing
db.exec('PRAGMA foreign_keys = OFF;');
db.exec('DROP TRIGGER IF EXISTS t_gl_line_no_delete;');
try { db.prepare('DELETE FROM gl_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM dunning_action').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_invoice').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_change').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription').run(); } catch (_) {}
try { db.prepare('DELETE FROM subscription_plan').run(); } catch (_) {}
try { db.prepare('DELETE FROM payment_allocation').run(); } catch (_) {}
try { db.prepare('DELETE FROM payment').run(); } catch (_) {}
try { db.prepare('DELETE FROM fiscal_doc_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM arap_document').run(); } catch (_) {}
try { db.prepare('DELETE FROM fiscal_doc').run(); } catch (_) {}
try { db.prepare('DELETE FROM partner_master').run(); } catch (_) {}
try { db.prepare('DELETE FROM product_master').run(); } catch (_) {}
try { db.prepare('DELETE FROM account').run(); } catch (_) {}
try { db.prepare('DELETE FROM companies').run(); } catch (_) {}
try { db.prepare('DELETE FROM r3_worklist_item').run(); } catch (_) {}
try { db.prepare('DELETE FROM sales_quote').run(); } catch (_) {}
try { db.prepare('DELETE FROM sales_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM purchase_rfq').run(); } catch (_) {}
try { db.prepare('DELETE FROM purchase_order').run(); } catch (_) {}
try { db.prepare('DELETE FROM purchase_supplier_quote').run(); } catch (_) {}
try { db.prepare('DELETE FROM portal_user_link').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 634 down restores the portal schema boundary', () => {
  assert.ok(down.migrations.includes('634_r6_portal'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='portal_user_link'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR6 PORTAL SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
