// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// clean-room; R3 aggregation facade. Real domain workflows live in their domain
// engines (products/, sales/, procurement/, stock/, manufacturing/, projects/).
// This file owns ONLY the generic resource registry and re-exports the domain
// command surface so routes stay thin and existing callers keep one entry point.
'use strict';

const infra = require('./r3-infra');
const { id, now, money, asDate, fail, ensureCompany, atomicCommand, withImmediateTransaction, recordWrite, getHistory } = infra;
const productEngine = require('./products/product-engine');
const pricingEngine = require('./pricing/pricing-engine');
const salesEngine = require('./sales/sales-engine');
const procurementEngine = require('./procurement/procurement-engine');
const warehouseEngine = require('./inventory/warehouse-engine');
const inventoryOps = require('./inventory/inventory-ops-engine');
const mrpEngine = require('./manufacturing/mrp-engine');
const landedEngine = require('./manufacturing/landed-cost-engine');
const subcontractEngine = require('./subcontracting/subcontracting-engine');
const projectEngine = require('./projects/project-engine');
const helpdeskEngine = require('./helpdesk/helpdesk-engine');

const RESOURCE_MAP = {
  'categories':'product_category','uom-categories':'uom_category','uoms':'uom','barcodes':'product_barcode','attributes':'product_attribute','attribute-values':'product_attribute_value','variants':'product_variant','variant-values':'product_variant_value','price-lists':'price_list','price-items':'price_list_item','pricing-rules':'pricing_rule','promotions':'promotion','coupons':'coupon',
  'sales-leads':'sales_lead','quotes':'sales_quote','orders':'sales_order','deliveries':'sales_delivery','rmas':'sales_rma','commissions':'sales_commission','requisitions':'purchase_requisition','requisition-lines':'purchase_requisition_line','rfqs':'purchase_rfq','rfq-lines':'purchase_rfq_line','purchase-orders':'purchase_order','purchase-order-lines':'purchase_order_line','receipts':'purchase_receipt','receipt-lines':'purchase_receipt_line','matches':'purchase_match','supplier-scorecards':'supplier_scorecard','partner-references':'product_partner_reference',
  'operation-types':'stock_operation_type','routes':'stock_route','route-rules':'stock_route_rule','reservations':'stock_reservation','picks':'stock_pick','pick-lines':'stock_pick_line','reorder-rules':'stock_reorder_rule','reorder-requests':'stock_reorder_request','cycle-counts':'stock_cycle_count','cycle-count-lines':'stock_cycle_count_line','scans':'stock_barcode_scan',
  'boms':'mrp_bom','bom-lines':'mrp_bom_line','work-centers':'mrp_work_center','routing-operations':'mrp_routing_operation','work-orders':'mrp_work_order','work-order-components':'mrp_work_order_component','scraps':'mrp_scrap','byproducts':'mrp_byproduct','cost-rollups':'mrp_cost_rollup',
  'landed-costs':'landed_cost','landed-cost-lines':'landed_cost_line','landed-allocations':'landed_cost_allocation','subcontract-orders':'subcontract_order','subcontract-components':'subcontract_component','subcontract-receipts':'subcontract_receipt',
  'projects':'project_project','phases':'project_phase','tasks':'project_task','task-dependencies':'project_task_dependency','milestones':'project_milestone','project-timesheets':'project_timesheet','contract-lines':'project_contract_line','tickets':'helpdesk_ticket','slas':'helpdesk_sla','ticket-slas':'helpdesk_ticket_sla','field-service-orders':'field_service_order','field-service-parts':'field_service_part'
};

const HIDDEN = new Set(['company_id','created_at','created_by','updated_at','updated_by']);

function listResource(db, companyId, resource) { const table = RESOURCE_MAP[resource]; if (!table) throw fail('unknown R3 resource',404); return db.prepare(`SELECT * FROM ${table} WHERE company_id=? ORDER BY rowid DESC`).all(companyId); }

function assertRecordScope(db, companyId, resource, recordId) {
  const table = resource === 'products' ? 'product_master' : RESOURCE_MAP[resource];
  if (!table) throw fail('unknown R3 resource', 404, 'R3_RESOURCE_NOT_FOUND');
  const row = db.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).get(String(recordId), String(companyId));
  if (row) return row;
  const exists = db.prepare(`SELECT 1 FROM ${table} WHERE id=?`).get(String(recordId));
  if (exists) throw fail('record is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  throw fail('R3 record not found', 404, 'R3_RECORD_NOT_FOUND');
}

function insertResource(db, companyId, resource, input, userId) {
  const table = RESOURCE_MAP[resource]; if (!table) throw fail('unknown R3 resource',404); const info = db.prepare(`PRAGMA table_info(${table})`).all(); const names = new Set(info.map((col) => col.name)); const row = {}; if (names.has('id')) row.id = String(input.id || id(resource.replace(/-/g,''))); if (names.has('company_id')) row.company_id = companyId; if (names.has('created_at')) row.created_at = now(); if (names.has('created_by')) row.created_by = userId || null;
  for (const col of info) { const name = col.name; if (HIDDEN.has(name) || name === 'id') continue; if (Object.prototype.hasOwnProperty.call(input,name)) row[name] = input[name]; else if (col.dflt_value != null || !col.notnull) continue; else if (name === 'active') row[name] = 1; else if (name === 'state') row[name] = 'draft'; else if (name === 'status') row[name] = 'open'; else if (name.includes('date') || name.endsWith('_at')) row[name] = asDate(); else if (name.includes('qty') || name.includes('amount') || name.includes('score') || name.includes('hours') || name.includes('rate') || name.includes('cost') || name.includes('sequence') || name.includes('priority') || name.includes('total') || name.includes('subtotal') || name.includes('value') || name.includes('price') || name.includes('minutes') || name.includes('factor') || name.includes('percent')) row[name] = 0; else row[name] = name;
  }
  const cols = Object.keys(row); const placeholders = cols.map(() => '?').join(','); db.prepare(`INSERT INTO ${table}(${cols.join(',')}) VALUES(${placeholders})`).run(...cols.map((key) => row[key])); if (names.has('id')) return db.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).get(row.id,companyId); return db.prepare(`SELECT * FROM ${table} WHERE company_id=? ORDER BY rowid DESC LIMIT 1`).get(companyId);
}

function transitionResource(db, companyId, resource, recordId, next, userId) { const table = RESOURCE_MAP[resource]; if (!table) throw fail('unknown R3 resource',404); const current = db.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).get(recordId,companyId); if (!current) throw fail('R3 record not found',404); const allowed = { draft:['confirmed','cancelled','requested','open'], requested:['approved','rejected','cancelled'], confirmed:['assigned','done','cancelled','received','billed'], assigned:['done','cancelled'], open:['in_progress','closed','resolved'], in_progress:['done','closed','resolved'], todo:['in_progress','done'], active:['closed','cancelled'] }; if (current.state && Array.isArray(allowed[current.state]) && !allowed[current.state].includes(next) && current.state !== next) throw fail(`illegal state transition ${current.state} -> ${next}`,409,'ILLEGAL_STATE'); db.prepare(`UPDATE ${table} SET state=? WHERE id=? AND company_id=?`).run(next,recordId,companyId); return db.prepare(`SELECT * FROM ${table} WHERE id=? AND company_id=?`).get(recordId,companyId); }

function worklist(db, companyId, input={}) { return db.prepare('SELECT * FROM r3_worklist_item WHERE company_id=? AND (? IS NULL OR queue=?) AND (? IS NULL OR state=?) ORDER BY rowid DESC').all(companyId,input.queue||null,input.queue||null,input.state||null,input.state||null); }

const atomic = (db, work) => withImmediateTransaction(db, work);
module.exports = {
  id, now, money, fail, ensureCompany,
  // products + pricing
  createProduct: productEngine.createProduct, createCategory: productEngine.createCategory, createUom: productEngine.createUom,
  createBarcode: productEngine.createBarcode, createVariant: productEngine.createVariant,
  createPriceList: pricingEngine.createPriceList, createPriceItem: pricingEngine.createPriceItem,
  createPricingRule: pricingEngine.createPricingRule, createPromotion: pricingEngine.createPromotion, explainPrice: pricingEngine.explainPrice,
  redeemCoupon: pricingEngine.redeemCoupon,
  // generic registry
  listResource, assertRecordScope, insertResource: atomicCommand(insertResource), transitionResource: atomicCommand(transitionResource),
  // sales
  createQuote: salesEngine.createQuote, confirmOrder: salesEngine.confirmOrder,
  reserveSalesOrder: salesEngine.reserveSalesOrder, deliverSalesOrder: salesEngine.deliverSalesOrder,
  invoiceOrder: salesEngine.invoiceOrder, returnSales: salesEngine.returnSales, createDownPayment: salesEngine.createDownPayment,
  // procurement
  createSupplierQuote: procurementEngine.createSupplierQuote, receivePurchase: procurementEngine.receivePurchase,
  createVendorBill: procurementEngine.createVendorBill, purchaseReturn: procurementEngine.purchaseReturn, matchPurchase: procurementEngine.matchPurchase,
  compareSupplierQuotes: procurementEngine.compareSupplierQuotes, selectSupplierQuote: procurementEngine.selectSupplierQuote,
  // inventory
  releaseReservation: inventoryOps.releaseReservation, transferStock: inventoryOps.transferStock, executeRoute: inventoryOps.executeRoute,
  convertReorderRequest: inventoryOps.convertReorderRequest, scanBarcode: inventoryOps.scanBarcode,
  resolveRoute: warehouseEngine.resolveRoute, createReorderRequest: warehouseEngine.createReorderRequest,
  putaway: warehouseEngine.putaway, pickPackShip: warehouseEngine.pickPackShip, cycleCountApprove: warehouseEngine.cycleCountApprove,
  // manufacturing
  createProduction: mrpEngine.createProduction, issueProduction: mrpEngine.issueProduction,
  completeProduction: mrpEngine.completeProduction, reverseProduction: mrpEngine.reverseProduction, computeBomRolledCost: mrpEngine.computeBomRolledCost,
  allocateLandedCost: landedEngine.allocateLandedCostWithValuation, reverseLandedCost: landedEngine.reverseLandedCostWithValuation,
  issueSubcontract: subcontractEngine.issueSubcontract, receiveSubcontract: subcontractEngine.receiveSubcontract,
  adjustSubcontract: subcontractEngine.adjustSubcontract, reverseSubcontractReceipt: subcontractEngine.reverseSubcontractReceipt, subcontractValuation: subcontractEngine.valuationSummary,
  // projects, helpdesk, field service
  billProject: projectEngine.billProject, slaTick: helpdeskEngine.slaTickBusinessClock, consumeFieldPart: projectEngine.consumeFieldPart,
  atomic, withImmediateTransaction, worklist, getHistory, recordWrite, RESOURCE_MAP,
};
