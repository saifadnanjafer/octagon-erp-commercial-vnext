// R6.6 focused acceptance: disposable DB only. Proves eCommerce catalog publishing,
// open catalogs, guest and registered carts, auto-promotions to SO, and rollback.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { runMigrations, openMigrationDatabase } from '../vnext/server/db/migration-runner.mjs';
import eco from '../vnext/server/modules/ecommerce/ecommerce-engine.js';
import { mountEcommerceRoutes } from '../vnext/server/modules/ecommerce/ecommerce-routes.js';
import arap from '../vnext/server/finance/arap-engine.js';
import port from '../vnext/server/modules/portal/portal-engine.js';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r6-ecommerce-'));
const dbPath = path.join(temp, 'r6-ecommerce.db');
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

// Create products
const p1 = arap.createProduct(db, company, { id: 'p-1', name: 'Product One', code: 'PROD-1' }, 'system');
const p2 = arap.createProduct(db, company, { id: 'p-2', name: 'Product Two', code: 'PROD-2' }, 'system');

// 1. Catalog publishing
check('product publishing and online catalog listing work', () => {
  eco.publishProduct(db, company, 'p-1', {
    website_description: 'Best product ever',
    website_image_url: 'http://example.com/p1.png',
    website_price: 25000
  });
  
  const catalog = eco.listOnlineCatalog(db, company);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].id, 'p-1');
  assert.equal(catalog[0].website_price, 25000);
  assert.equal(catalog[0].website_description, 'Best product ever');
  
  // Unpublish
  eco.unpublishProduct(db, company, 'p-1');
  const emptyCatalog = eco.listOnlineCatalog(db, company);
  assert.equal(emptyCatalog.length, 0);
});

// 2. Shopping cart management
check('shopping carts support item additions, quantity updates, and removals', () => {
  // Re-publish p-1
  eco.publishProduct(db, company, 'p-1', { website_price: 15000 });
  
  // Create cart
  const token = 'guest-sess-abc-123';
  let cart = eco.getOrCreateCart(db, company, token);
  assert.equal(cart.state, 'active');
  assert.equal(cart.partner_id, null);
  
  // Add item
  cart = eco.addToCart(db, company, cart.id, 'p-1', 2);
  assert.equal(cart.lines.length, 1);
  assert.equal(cart.lines[0].qty, 2);
  assert.equal(cart.lines[0].unit_price, 15000);
  
  // Add another quantity of same item
  cart = eco.addToCart(db, company, cart.id, 'p-1', 3);
  assert.equal(cart.lines[0].qty, 5);
  
  // Remove item
  cart = eco.removeFromCart(db, company, cart.id, 'p-1');
  assert.equal(cart.lines.length, 0);
});

// 3. Guest and Registered Checkout
check('checkout promotes carts to draft sales orders', () => {
  eco.publishProduct(db, company, 'p-1', { website_price: 10000 });
  eco.publishProduct(db, company, 'p-2', { website_price: 20000 });
  
  // A. Guest Checkout
  let cartGuest = eco.getOrCreateCart(db, company, 'guest-token');
  eco.addToCart(db, company, cartGuest.id, 'p-1', 3);
  eco.addToCart(db, company, cartGuest.id, 'p-2', 1);
  
  const checkoutResGuest = eco.checkoutCart(db, company, cartGuest.id, {
    guest_name: 'John Doe Guest'
  });
  
  assert.equal(checkoutResGuest.cart.state, 'completed');
  assert.ok(checkoutResGuest.sales_order_id);
  
  const soGuest = db.prepare('SELECT * FROM sales_order WHERE id = ?').get(checkoutResGuest.sales_order_id);
  assert.equal(soGuest.total_amount, 50000); // 3 * 10k + 1 * 20k
  assert.equal(soGuest.state, 'draft');
  assert.equal(soGuest.created_by, 'ecommerce-checkout');
  
  const guestPartner = db.prepare('SELECT * FROM partner_master WHERE id = ?').get(soGuest.partner_id);
  assert.equal(guestPartner.name, 'John Doe Guest');
  
  // B. Registered Checkout
  const customer = arap.createPartner(db, company, { id: 'cust-reg', name: 'Registered Customer', partner_type: 'customer' }, 'system');
  let cartReg = eco.getOrCreateCart(db, company, 'reg-token', 'cust-reg');
  eco.addToCart(db, company, cartReg.id, 'p-1', 1);
  
  const checkoutResReg = eco.checkoutCart(db, company, cartReg.id);
  const soReg = db.prepare('SELECT * FROM sales_order WHERE id = ?').get(checkoutResReg.sales_order_id);
  assert.equal(soReg.partner_id, 'cust-reg');
  assert.equal(soReg.total_amount, 10000);
});

// 4. Routes permissions and scoping
check('ecommerce routes allow public catalog but enforce publishing permissions', async () => {
  const routes = mountEcommerceRoutes({
    db,
    requireSession: () => ({ ok: true, userId: 'user-admin', groups: ['system.admin'] }),
    resolveScope: () => ({ tenantId: company, companyId: company }),
    readRequestBody: async (req) => req.body,
    sendJson: (res, status, body) => { res.statusCode = status; res.body = body; }
  });
  
  async function testRoute(method, pathname, bodyData = null, sessionOverride = undefined) {
    const req = new EventEmitter();
    req.method = method;
    req.url = pathname;
    req.headers = { 'x-company-id': company };
    if (bodyData) req.body = JSON.stringify(bodyData);
    const res = { writeHead() {}, end() {} };
    const urlObj = new URL(pathname, 'http://localhost');
    
    // We override requireSession if specified
    const currentRoutes = mountEcommerceRoutes({
      db,
      requireSession: sessionOverride !== undefined ? sessionOverride : () => ({ ok: true, userId: 'user-admin', groups: ['system.admin'] }),
      resolveScope: () => ({ tenantId: company, companyId: company }),
      readRequestBody: async (req) => req.body,
      sendJson: (res, status, body) => { res.statusCode = status; res.body = body; }
    });
    
    const processed = currentRoutes.handle(req, res, urlObj);
    return { processed, res };
  }
  
  // Public GET catalog (requires no session, allowed)
  const r1 = await testRoute('GET', '/api/x/ecommerce/catalog', null, () => null);
  assert.equal(r1.processed, true);
  assert.equal(r1.res.statusCode, 200);
  
  // Publish product (requires admin session, denied if guest)
  const r2 = await testRoute('POST', '/api/x/ecommerce/catalog/p-1/publish', { website_price: 12000 }, () => null);
  assert.equal(r2.processed, true);
  assert.equal(r2.res.statusCode, 401);
});

// 5. Rollback testing
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
try { db.prepare('DELETE FROM sales_order_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM ecommerce_cart_line').run(); } catch (_) {}
try { db.prepare('DELETE FROM ecommerce_cart').run(); } catch (_) {}
db.exec('PRAGMA foreign_keys = ON;');

db.close();
const down = await runMigrations({ dbPath, direction: 'down' });
const afterDown = openMigrationDatabase(dbPath);
check('migration 636 down restores the ecommerce schema boundary', () => {
  assert.ok(down.migrations.includes('636_r6_ecommerce'));
  assert.equal(afterDown.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ecommerce_cart'").get(), undefined);
});
afterDown.close();

for (const line of results) console.log(line);
console.log(`\nR6 ECOMMERCE SUITE: ${results.length - failures} PASS, ${failures} FAIL, 0 SKIP`);
if (failures) process.exit(1);
else process.exit(0);
