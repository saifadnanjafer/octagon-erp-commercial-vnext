// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('node:crypto');
const infra = require('../r3-infra');

const { fail, ensureCompany, recordWrite } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function money(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

function publishProduct(db, companyId, productId, input) {
  ensureCompany(db, companyId);
  const product = db.prepare('SELECT * FROM product_master WHERE id = ? AND company_id = ?').get(productId, companyId);
  if (!product) throw fail('product not found', 404, 'PRODUCT_NOT_FOUND');
  
  const before = { ...product };
  const desc = input.website_description || '';
  const img = input.website_image_url || '';
  const price = money(input.website_price || 0);
  
  db.prepare(`
    UPDATE product_master 
    SET website_published = 1, website_description = ?, website_image_url = ?, website_price = ?
    WHERE id = ? AND company_id = ?
  `).run(desc, img, price, productId, companyId);
  
  const after = db.prepare('SELECT * FROM product_master WHERE id = ?').get(productId);
  recordWrite(db, null, companyId, 'product_master', productId, 'publish', null, before, after);
  return after;
}

function unpublishProduct(db, companyId, productId) {
  ensureCompany(db, companyId);
  const product = db.prepare('SELECT * FROM product_master WHERE id = ? AND company_id = ?').get(productId, companyId);
  if (!product) throw fail('product not found', 404, 'PRODUCT_NOT_FOUND');
  
  const before = { ...product };
  db.prepare(`
    UPDATE product_master 
    SET website_published = 0
    WHERE id = ? AND company_id = ?
  `).run(productId, companyId);
  
  const after = db.prepare('SELECT * FROM product_master WHERE id = ?').get(productId);
  recordWrite(db, null, companyId, 'product_master', productId, 'unpublish', null, before, after);
  return after;
}

function listOnlineCatalog(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare(`
    SELECT id, code, name, website_description, website_image_url, website_price 
    FROM product_master 
    WHERE company_id = ? AND website_published = 1 AND active = 1
  `).all(companyId);
}

function getOrCreateCart(db, companyId, sessionToken, partnerId = null) {
  ensureCompany(db, companyId);
  const tok = String(sessionToken || '').trim();
  if (!tok) throw fail('session token is required', 400, 'SESSION_TOKEN_REQUIRED');
  
  const active = db.prepare(`
    SELECT * FROM ecommerce_cart 
    WHERE company_id = ? AND session_token = ? AND state = 'active'
  `).get(companyId, tok);
  
  if (active) {
    if (partnerId && active.partner_id !== partnerId) {
      db.prepare('UPDATE ecommerce_cart SET partner_id = ?, updated_at = ? WHERE id = ?').run(partnerId, now(), active.id);
      active.partner_id = partnerId;
    }
    return active;
  }
  
  const row = {
    id: id('cart'),
    company_id: companyId,
    partner_id: partnerId || null,
    session_token: tok,
    state: 'active',
    created_at: now(),
    updated_at: now()
  };
  
  db.prepare(`
    INSERT INTO ecommerce_cart (id, company_id, partner_id, session_token, state, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(row.id, row.company_id, row.partner_id, row.session_token, row.state, row.created_at, row.updated_at);
  
  return row;
}

function getCart(db, companyId, cartId) {
  ensureCompany(db, companyId);
  const cart = db.prepare('SELECT * FROM ecommerce_cart WHERE id = ? AND company_id = ?').get(cartId, companyId);
  if (!cart) throw fail('cart not found', 404, 'CART_NOT_FOUND');
  
  const lines = db.prepare(`
    SELECT cl.*, p.name as product_name, p.code as product_code
    FROM ecommerce_cart_line cl
    JOIN product_master p ON p.id = cl.product_id
    WHERE cl.cart_id = ? AND cl.company_id = ?
  `).all(cartId, companyId);
  
  return { ...cart, lines };
}

function addToCart(db, companyId, cartId, productId, qty) {
  ensureCompany(db, companyId);
  const q = Number(qty || 1);
  if (q <= 0) throw fail('quantity must be positive', 400, 'QTY_INVALID');
  
  const cart = db.prepare('SELECT 1 FROM ecommerce_cart WHERE id = ? AND company_id = ? AND state = \'active\'').get(cartId, companyId);
  if (!cart) throw fail('active cart not found', 404, 'CART_NOT_FOUND');
  
  const product = db.prepare('SELECT * FROM product_master WHERE id = ? AND company_id = ? AND active = 1').get(productId, companyId);
  if (!product) throw fail('active product not found', 404, 'PRODUCT_NOT_FOUND');
  
  const price = money(product.website_price || 0.0);
  const existing = db.prepare('SELECT id, qty FROM ecommerce_cart_line WHERE cart_id = ? AND product_id = ?').get(cartId, productId);
  
  if (existing) {
    const nextQty = existing.qty + q;
    db.prepare('UPDATE ecommerce_cart_line SET qty = ?, unit_price = ? WHERE id = ?').run(nextQty, price, existing.id);
  } else {
    const lineId = id('cart_line');
    db.prepare(`
      INSERT INTO ecommerce_cart_line (id, company_id, cart_id, product_id, qty, unit_price)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(lineId, companyId, cartId, productId, q, price);
  }
  
  db.prepare('UPDATE ecommerce_cart SET updated_at = ? WHERE id = ?').run(now(), cartId);
  return getCart(db, companyId, cartId);
}

function removeFromCart(db, companyId, cartId, productId) {
  ensureCompany(db, companyId);
  db.prepare('DELETE FROM ecommerce_cart_line WHERE cart_id = ? AND product_id = ? AND company_id = ?').run(cartId, productId, companyId);
  db.prepare('UPDATE ecommerce_cart SET updated_at = ? WHERE id = ?').run(now(), cartId);
  return getCart(db, companyId, cartId);
}

function checkoutCart(db, companyId, cartId, checkoutInfo = {}) {
  ensureCompany(db, companyId);
  
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    const cart = db.prepare('SELECT * FROM ecommerce_cart WHERE id = ? AND company_id = ?').get(cartId, companyId);
    if (!cart) throw fail('cart not found', 404, 'CART_NOT_FOUND');
    if (cart.state !== 'active') throw fail('cart is not active for checkout', 409, 'CART_NOT_ACTIVE');
    
    const lines = db.prepare('SELECT * FROM ecommerce_cart_line WHERE cart_id = ?').all(cartId);
    if (!lines.length) throw fail('cannot checkout an empty cart', 400, 'CART_EMPTY');
    
    // Resolve partner: if cart has no partner, we check checkoutInfo
    let partnerId = cart.partner_id || checkoutInfo.partner_id;
    
    if (!partnerId) {
      // Guest checkout: create a guest partner profile
      const guestName = String(checkoutInfo.guest_name || 'Guest Customer').trim();
      partnerId = id('guest_partner');
      db.prepare(`
        INSERT INTO partner_master (id, company_id, name, partner_type, currency, active, created_at, created_by)
        VALUES (?, ?, ?, 'customer', 'IQD', 1, ?, 'ecommerce-checkout')
      `).run(partnerId, companyId, guestName, now());
    }
    
    // Calculate total amount
    let total = 0;
    for (const l of lines) total += (l.qty * l.unit_price);
    total = money(total);
    
    // Create sales order
    const orderId = id('so');
    const orderNumber = `SO-WEB-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    db.prepare(`
      INSERT INTO sales_order (id, company_id, partner_id, order_number, state, quote_id, currency, total_amount, created_at, created_by)
      VALUES (?, ?, ?, ?, 'draft', null, 'IQD', ?, ?, 'ecommerce-checkout')
    `).run(orderId, companyId, partnerId, orderNumber, total, now());
    
    // Create sales order lines
    for (const l of lines) {
      const lineId = id('so_line');
      db.prepare(`
        INSERT INTO sales_order_line (id, company_id, order_id, product_id, variant_id, qty, delivered_qty, invoiced_qty, unit_price, subtotal)
        VALUES (?, ?, ?, ?, null, ?, 0, 0, ?, ?)
      `).run(lineId, companyId, orderId, l.product_id, l.qty, l.unit_price, money(l.qty * l.unit_price));
    }
    
    // Complete cart
    db.prepare("UPDATE ecommerce_cart SET state = 'completed', updated_at = ? WHERE id = ?").run(now(), cartId);
    
    const after = db.prepare('SELECT * FROM ecommerce_cart WHERE id = ?').get(cartId);
    recordWrite(db, null, companyId, 'ecommerce_cart', cartId, 'checkout', null, cart, after);
    
    if (owns) db.exec('COMMIT');
    return { cart: after, sales_order_id: orderId, sales_order_number: orderNumber };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

module.exports = {
  publishProduct,
  unpublishProduct,
  listOnlineCatalog,
  getOrCreateCart: infra.atomicCommand(getOrCreateCart),
  getCart,
  addToCart,
  removeFromCart,
  checkoutCart
};
