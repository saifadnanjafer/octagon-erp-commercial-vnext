// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const infra = require('../r3-infra');
const { id, now, money, asDate, within, fail, ensureCompany, tableExists, withImmediateTransaction, idempotencyScope, rememberIdempotency, publish, recordWrite, location, product, issueNumber, approvalContract, approvedOverride } = infra;

function createPriceList(db, companyId, input, userId) { ensureCompany(db, companyId); const row = { id: String(input.id || id('plist')), company_id: companyId, name: String(input.name || '').trim(), currency: input.currency || 'IQD', valid_from: input.valid_from || null, valid_to: input.valid_to || null, priority: Number(input.priority || 10), active: 1, created_at: now(), created_by: userId || null }; if (!row.name) throw fail('price list name is required'); db.prepare('INSERT INTO price_list(id,company_id,name,currency,valid_from,valid_to,priority,active,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)').run(row.id,row.company_id,row.name,row.currency,row.valid_from,row.valid_to,row.priority,row.active,row.created_at,row.created_by); return row; }

function createPriceItem(db, companyId, input) { ensureCompany(db, companyId); const row = { id: String(input.id || id('pitem')), company_id: companyId, price_list_id: input.price_list_id, product_id: input.product_id, variant_id: input.variant_id || null, category_id: input.category_id || null, partner_id: input.partner_id || null, min_qty: Number(input.min_qty || 1), uom_id: input.uom_id || null, fixed_price: input.fixed_price == null ? null : Number(input.fixed_price), percent_discount: input.percent_discount == null ? null : Number(input.percent_discount), currency: input.currency || 'IQD', valid_from: input.valid_from || null, valid_to: input.valid_to || null, sequence: Number(input.sequence || 10), active: 1, created_at: now() }; if (!db.prepare('SELECT 1 FROM price_list WHERE id=? AND company_id=?').get(row.price_list_id,companyId)) throw fail('price list is outside company scope',403,'COMPANY_SCOPE_DENIED'); if (!db.prepare('SELECT 1 FROM product_master WHERE id=? AND company_id=?').get(row.product_id,companyId)) throw fail('product is outside company scope',403,'COMPANY_SCOPE_DENIED'); db.prepare('INSERT INTO price_list_item(id,company_id,price_list_id,product_id,variant_id,category_id,partner_id,min_qty,uom_id,fixed_price,percent_discount,currency,valid_from,valid_to,sequence,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row)); return row; }

function createPricingRule(db, companyId, input, userId) { ensureCompany(db, companyId); const row = { id: String(input.id || id('prule')), company_id: companyId, name: String(input.name || 'Pricing rule'), rule_type: input.rule_type || 'fixed', product_id: input.product_id || null, variant_id: input.variant_id || null, category_id: input.category_id || null, partner_id: input.partner_id || null, price_list_id: input.price_list_id || null, min_qty: Number(input.min_qty || 1), fixed_price: input.fixed_price == null ? null : Number(input.fixed_price), percent_discount: input.percent_discount == null ? null : Number(input.percent_discount), currency: input.currency || 'IQD', valid_from: input.valid_from || null, valid_to: input.valid_to || null, priority: Number(input.priority || 10), sequence: Number(input.sequence || 10), active: 1, created_at: now() }; db.prepare('INSERT INTO pricing_rule(id,company_id,name,rule_type,product_id,variant_id,category_id,partner_id,price_list_id,min_qty,fixed_price,percent_discount,currency,valid_from,valid_to,priority,sequence,active,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row)); return row; }

function createPromotion(db, companyId, input, userId) { ensureCompany(db, companyId); const row = { id: String(input.id || id('promo')), company_id: companyId, name: String(input.name || 'Promotion'), promotion_type: input.promotion_type || 'percent', product_id: input.product_id || null, min_qty: Number(input.min_qty || 1), reward_qty: Number(input.reward_qty || 0), reward_product_id: input.reward_product_id || null, amount: Number(input.amount || 0), coupon_code: input.coupon_code || null, valid_from: input.valid_from || null, valid_to: input.valid_to || null, priority: Number(input.priority || 10), active: 1, created_at: now(), created_by: userId || null }; db.prepare('INSERT INTO promotion(id,company_id,name,promotion_type,product_id,min_qty,reward_qty,reward_product_id,amount,coupon_code,valid_from,valid_to,priority,active,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(...Object.values(row)); return row; }

function priceCandidate(row, input, source) {
  const date = asDate(input.date); const qty = Number(input.qty || 1); const exactVariant = row.variant_id && row.variant_id === input.variant_id; const exactProduct = row.product_id && row.product_id === input.product_id; const exactCategory = row.category_id && row.category_id === input.category_id; const partner = row.partner_id && row.partner_id === input.partner_id;
  if (!row.active || (row.currency && row.currency !== (input.currency || 'IQD')) || qty < Number(row.min_qty || 1) || !within(row,date)) return null;
  if (row.product_id && !exactProduct) return null; if (row.variant_id && !exactVariant) return null; if (row.category_id && !exactCategory) return null; if (row.partner_id && !partner) return null;
  const specificity = (exactVariant ? 1000 : 0) + (exactProduct ? 700 : 0) + (exactCategory ? 400 : 0) + (partner ? 300 : 0) + (row.uom_id && row.uom_id === input.uom_id ? 80 : (row.uom_id ? -100 : 0)) + (Number(row.min_qty || 1) <= qty ? Math.min(100, Number(row.min_qty || 1)) : 0);
  return { row, source, specificity, priority: Number(row.priority || 10), sequence: Number(row.sequence || 10) };
}


// Coupon-table enforcement: a coupon-bound promotion only applies while the
// coupon is active, in-date, and under its usage limit.
function couponUsable(db, companyId, code, date) {
  if (!code) return false;
  const coupon = db.prepare('SELECT * FROM coupon WHERE company_id=? AND code=? AND active=1').get(companyId, String(code));
  if (!coupon) return null; // no coupon record: legacy inline coupon_code path
  if (coupon.valid_from && coupon.valid_from > date) return false;
  if (coupon.valid_to && coupon.valid_to < date) return false;
  if (coupon.usage_limit != null && Number(coupon.used_count) >= Number(coupon.usage_limit)) return false;
  return true;
}

// Atomic coupon redemption (called at order confirmation).
function redeemCoupon(db, companyId, code, userId) {
  ensureCompany(db, companyId);
  const date = asDate();
  const usable = couponUsable(db, companyId, code, date);
  if (usable === null) throw fail('coupon does not exist', 404, 'COUPON_NOT_FOUND');
  if (!usable) throw fail('coupon is exhausted or outside its validity window', 409, 'COUPON_UNUSABLE');
  db.prepare('UPDATE coupon SET used_count=used_count+1 WHERE company_id=? AND code=?').run(companyId, String(code));
  const coupon = db.prepare('SELECT * FROM coupon WHERE company_id=? AND code=?').get(companyId, String(code));
  recordWrite(db, null, companyId, 'coupon', coupon.id, 'redeemed', userId, null, coupon);
  return coupon;
}

function explainPrice(db, companyId, input) {
  ensureCompany(db, companyId); const product = db.prepare('SELECT * FROM product_master WHERE id=? AND company_id=? AND active=1').get(input.product_id,companyId); if (!product) throw fail('product is missing or outside company scope',403,'COMPANY_SCOPE_DENIED');
  const base = Number(input.base_price || 0); const date = asDate(input.date); const candidates = [];
  for (const row of db.prepare('SELECT i.*, l.priority AS list_priority, l.currency AS list_currency FROM price_list_item i JOIN price_list l ON l.id=i.price_list_id WHERE i.company_id=? AND i.product_id=? AND l.active=1').all(companyId, product.id)) candidates.push(priceCandidate({ ...row, priority: row.list_priority, currency: row.currency || row.list_currency }, input, 'price_list_item'));
  for (const row of db.prepare('SELECT * FROM pricing_rule WHERE company_id=?').all(companyId)) candidates.push(priceCandidate(row,input,'pricing_rule'));
  const usable = candidates.filter(Boolean).sort((a,b) => b.specificity-a.specificity || a.priority-b.priority || a.sequence-b.sequence || String(a.row.id).localeCompare(String(b.row.id)));
  const winner = usable[0] || null; let price = base; let adjustment = null;
  if (winner) { const row = winner.row; price = row.fixed_price != null ? Number(row.fixed_price) : money(base * (1 - Number(row.percent_discount || 0) / 100)); adjustment = row.percent_discount != null ? `-${row.percent_discount}%` : `fixed:${row.fixed_price}`; }
  const promotions = db.prepare('SELECT * FROM promotion WHERE company_id=? AND active=1').all(companyId).filter(row => (!row.product_id || row.product_id === product.id) && Number(input.qty || 1) >= Number(row.min_qty || 1) && within(row,date) && (!row.coupon_code || (row.coupon_code === input.coupon_code && couponUsable(db, companyId, input.coupon_code, date) !== false)));
  const promotion = promotions.sort((a,b) => Number(a.priority)-Number(b.priority) || String(a.id).localeCompare(String(b.id)))[0] || null;
  if (promotion && promotion.promotion_type === 'percent') { price = money(price * (1 - promotion.amount / 100)); adjustment = `${adjustment || 'base'}, promo -${promotion.amount}%`; }
  if (promotion && promotion.promotion_type === 'fixed') { price = money(Math.max(0, price - promotion.amount)); adjustment = `${adjustment || 'base'}, promo -${promotion.amount}`; }
  let reward = null;
  if (promotion && promotion.promotion_type === 'buy_x_get_y' && Number(promotion.reward_qty) > 0) {
    const bundles = Math.floor(Number(input.qty || 1) / Number(promotion.min_qty || 1));
    if (bundles > 0) reward = { product_id: promotion.reward_product_id || product.id, qty: bundles * Number(promotion.reward_qty), promotion_id: promotion.id };
  }
  return { reward, product_id: product.id, currency: input.currency || 'IQD', date, qty: Number(input.qty || 1), base_price: base, unit_price: money(Math.max(0, price)), winner: winner ? { id: winner.row.id, source: winner.source, specificity: winner.specificity, priority: winner.priority, sequence: winner.sequence } : null, promotion: promotion ? { id: promotion.id, type: promotion.promotion_type } : null, adjustment, trace: usable.map((item, index) => ({ rank: index + 1, id: item.row.id, source: item.source, specificity: item.specificity, priority: item.priority, sequence: item.sequence, selected: index === 0 })) };
}

module.exports = {
  createPriceList: infra.atomicCommand(createPriceList),
  createPriceItem: infra.atomicCommand(createPriceItem),
  createPricingRule: infra.atomicCommand(createPricingRule),
  createPromotion: infra.atomicCommand(createPromotion),
  explainPrice,
  redeemCoupon: infra.atomicCommand(redeemCoupon),
  couponUsable,
  priceCandidate,
  _internal: { createPriceList, createPriceItem, createPricingRule, createPromotion, priceCandidate, explainPrice },
};
