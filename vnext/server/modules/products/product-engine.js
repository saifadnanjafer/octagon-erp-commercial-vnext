// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const arap = require('../../finance/arap-engine');
const infra = require('../r3-infra');
const { id, now, money, asDate, within, fail, ensureCompany, tableExists, withImmediateTransaction, idempotencyScope, rememberIdempotency, publish, recordWrite, location, product, issueNumber, approvalContract, approvedOverride } = infra;

function createProduct(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const productType = String(input.product_type || 'goods');
  if (!['goods', 'service', 'consumable'].includes(productType)) throw fail('product_type is invalid');
  const product = arap.createProduct(db, companyId, { id: input.id, code: input.code, name: input.name, income_account_id: input.income_account_id, expense_account_id: input.expense_account_id }, userId);
  try {
    db.prepare(`UPDATE product_master SET category_id=?, product_type=?, base_uom_id=?, stockable=?, cost_method=?, valuation_category=?, barcode=?, variant_mode=?, standard_cost=?, tracking_type=?, valuation_method=?, weight=?, volume=? WHERE id=? AND company_id=?`).run(
      input.category_id || null, productType, input.base_uom_id || null, productType === 'service' ? 0 : (input.stockable == null ? 1 : Number(Boolean(input.stockable))),
      input.cost_method || 'average', input.valuation_category || 'default', input.barcode || null, input.variant_mode || 'none', Number(input.standard_cost || input.cost_price || 0), input.tracking_type || input.tracking || 'none', input.valuation_method || 'avco', Number(input.weight || 0), Number(input.volume || 0), product.id, companyId);
  } catch (error) { throw error; }
  return db.prepare('SELECT * FROM product_master WHERE id=? AND company_id=?').get(product.id, companyId);
}

function createCategory(db, companyId, input, userId) {
  ensureCompany(db, companyId); const row = { id: String(input.id || id('pcat')), company_id: companyId, parent_id: input.parent_id || null, code: String(input.code || id('cat')), name: String(input.name || '').trim(), active: input.active == null ? 1 : Number(Boolean(input.active)), created_at: now(), created_by: userId || null };
  if (!row.name) throw fail('category name is required'); db.prepare('INSERT INTO product_category(id,company_id,parent_id,code,name,active,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)').run(row.id,row.company_id,row.parent_id,row.code,row.name,row.active,row.created_at,row.created_by); return row;
}

function createUom(db, companyId, input) {
  ensureCompany(db, companyId); const categoryId = String(input.category_id || ''); if (!db.prepare('SELECT 1 FROM uom_category WHERE id=? AND company_id=?').get(categoryId, companyId)) throw fail('uom category is missing or outside company scope',403,'COMPANY_SCOPE_DENIED');
  const row = { id: String(input.id || id('uom')), company_id: companyId, category_id: categoryId, name: String(input.name || '').trim(), symbol: String(input.symbol || '').trim(), factor: Number(input.factor || 1), rounding: Number(input.rounding || 0.000001), active: 1 };
  if (!row.name || !row.symbol || !(row.factor > 0)) throw fail('uom name, symbol, and positive factor are required'); db.prepare('INSERT INTO uom(id,company_id,category_id,name,symbol,factor,rounding,active) VALUES(?,?,?,?,?,?,?,?)').run(row.id,row.company_id,row.category_id,row.name,row.symbol,row.factor,row.rounding,row.active); return row;
}

function createBarcode(db, companyId, input) { ensureCompany(db, companyId); const p = db.prepare('SELECT id FROM product_master WHERE id=? AND company_id=?').get(input.product_id, companyId); if (!p) throw fail('product is missing or outside company scope',403,'COMPANY_SCOPE_DENIED'); const row = { id: String(input.id || id('barcode')), company_id: companyId, product_id: input.product_id, barcode: String(input.barcode || '').trim(), barcode_type: input.barcode_type || 'internal', uom_id: input.uom_id || null, active: 1 }; if (!row.barcode) throw fail('barcode is required'); db.prepare('INSERT INTO product_barcode(id,company_id,product_id,barcode,barcode_type,uom_id,active) VALUES(?,?,?,?,?,?,?)').run(row.id,row.company_id,row.product_id,row.barcode,row.barcode_type,row.uom_id,row.active); return row; }

function createVariant(db, companyId, input, userId) { ensureCompany(db, companyId); const p = db.prepare('SELECT name FROM product_master WHERE id=? AND company_id=?').get(input.template_id, companyId); if (!p) throw fail('template is missing or outside company scope',403,'COMPANY_SCOPE_DENIED'); const row = { id: String(input.id || id('variant')), company_id: companyId, template_id: input.template_id, code: String(input.code || id('sku')), name: String(input.name || p.name), barcode: input.barcode || null, active: 1, created_at: now(), created_by: userId || null }; db.prepare('INSERT INTO product_variant(id,company_id,template_id,code,name,barcode,active,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(row.id,row.company_id,row.template_id,row.code,row.name,row.barcode,row.active,row.created_at,row.created_by); for (const valueId of (Array.isArray(input.value_ids) ? input.value_ids : [])) db.prepare('INSERT INTO product_variant_value(variant_id,value_id,company_id) VALUES(?,?,?)').run(row.id,valueId,companyId); return row; }

module.exports = {
  createProduct: infra.atomicCommand(createProduct),
  createCategory: infra.atomicCommand(createCategory),
  createUom: infra.atomicCommand(createUom),
  createBarcode: infra.atomicCommand(createBarcode),
  createVariant: infra.atomicCommand(createVariant),
  _internal: { createProduct, createCategory, createUom, createBarcode, createVariant },
};
