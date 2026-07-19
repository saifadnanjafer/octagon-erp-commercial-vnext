// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const stock = require('../../stock/stock-engine');
const arap = require('../../finance/arap-engine');
const { postFiscalDoc, reverseFiscalDoc } = require('../../finance/finance-engine');
const infra = require('../r3-infra');

const {
  id, now, money, fail, ensureCompany, tableExists,
  idempotencyScope, rememberIdempotency, recordWrite, location, product,
  approvalContract,
} = infra;

function getOrder(db, companyId, orderId) {
  const order = db.prepare('SELECT * FROM subcontract_order WHERE id=? AND company_id=?').get(orderId, companyId);
  if (!order) throw fail('subcontract order is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  return order;
}

function ledgerValueForMove(db, moveId, locationId) {
  const line = db.prepare('SELECT valuation_rate, value FROM stock_ledger_line WHERE stock_move_id=? AND location_id=?').get(moveId, locationId);
  if (!line) throw fail('stock ledger line is missing for a posted subcontract move', 500, 'SUBCONTRACT_LEDGER_MISSING');
  return { rate: Math.abs(Number(line.valuation_rate || 0)), value: Math.abs(Number(line.value || 0)) };
}

// Issue supplied components internal -> supplier at immutable ledger cost.
function issueSubcontract(db, companyId, orderId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const order = getOrder(db, companyId, orderId);
  if (order.state === 'received' || order.state === 'reversed') throw fail('subcontract order can no longer be issued', 409, 'SUBCONTRACT_STATE_INVALID');
  const lines = Array.isArray(input.lines) ? input.lines : [];
  if (!lines.length) throw fail('at least one component line is required');
  const source = location(db, companyId, 'internal', input.from_location_id);
  const supplier = location(db, companyId, 'supplier', input.to_location_id);
  const out = [];
  for (const item of lines) {
    product(db, companyId, item.product_id);
    const qty = Number(item.qty);
    if (!(qty > 0)) throw fail('component qty must be positive');
    const move = stock.createStockMove(db, companyId, {
      product_id: item.product_id, qty,
      from_location_id: source.location_id, to_location_id: supplier.location_id,
      warehouse_id: source.warehouse_id, currency: 'IQD',
      voucher_ref: `${order.order_number}-ISSUE`,
      batch_number: item.batch_number || null, serial_number: item.serial_number || null,
    });
    stock.postStockMove(db, companyId, move.id, userId || 'system');
    const cost = ledgerValueForMove(db, move.id, source.location_id);
    const row = {
      id: id('subissue'), company_id: companyId, order_id: orderId, product_id: item.product_id,
      qty, stock_move_id: move.id, state: 'issued', created_at: now(),
      unit_cost: cost.rate, value: cost.value,
    };
    db.prepare('INSERT INTO subcontract_issue(id,company_id,order_id,product_id,qty,stock_move_id,state,created_at,unit_cost,value) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(row.id, row.company_id, row.order_id, row.product_id, row.qty, row.stock_move_id, row.state, row.created_at, row.unit_cost, row.value);
    const component = db.prepare('SELECT id FROM subcontract_component WHERE order_id=? AND product_id=?').get(orderId, item.product_id);
    if (component) db.prepare('UPDATE subcontract_component SET supplied_qty=supplied_qty+? WHERE id=?').run(qty, component.id);
    out.push(row);
  }
  db.prepare("UPDATE subcontract_order SET state='issued' WHERE id=?").run(orderId);
  recordWrite(db, runtime, companyId, 'subcontract_order', orderId, 'issued', userId, null, out, 'manufacturing');
  return out;
}

// Unused components returned supplier -> internal at their original issue cost;
// shortages and scrap are recorded adjustments that stay inside consumed value.
function adjustSubcontract(db, companyId, orderId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const order = getOrder(db, companyId, orderId);
  const kind = String(input.kind || '');
  if (!['return_unused', 'shortage', 'scrap'].includes(kind)) throw fail('adjustment kind must be return_unused, shortage, or scrap');
  const qty = Number(input.qty);
  if (!(qty > 0)) throw fail('adjustment qty must be positive');
  product(db, companyId, input.product_id);
  const issued = db.prepare('SELECT COALESCE(SUM(qty),0) qty, COALESCE(SUM(value),0) value FROM subcontract_issue WHERE order_id=? AND product_id=?').get(orderId, input.product_id);
  const adjusted = db.prepare('SELECT COALESCE(SUM(qty),0) qty FROM subcontract_adjustment WHERE order_id=? AND product_id=?').get(orderId, input.product_id);
  if (qty > Number(issued.qty) - Number(adjusted.qty)) throw fail('adjustment exceeds remaining issued quantity', 409, 'SUBCONTRACT_QTY_EXCEEDED');
  const unitCost = Number(issued.qty) > 0 ? money(Number(issued.value) / Number(issued.qty)) : 0;
  let stockMoveId = null;
  if (kind === 'return_unused') {
    const supplier = location(db, companyId, 'supplier', input.from_location_id);
    const internal = location(db, companyId, 'internal', input.to_location_id);
    const move = stock.createStockMove(db, companyId, {
      product_id: input.product_id, qty,
      from_location_id: supplier.location_id, to_location_id: internal.location_id,
      warehouse_id: internal.warehouse_id, currency: 'IQD',
      voucher_ref: `${order.order_number}-RETURN`,
    });
    stock.postStockMove(db, companyId, move.id, userId || 'system', { rate: unitCost });
    stockMoveId = move.id;
    const component = db.prepare('SELECT id FROM subcontract_component WHERE order_id=? AND product_id=?').get(orderId, input.product_id);
    if (component) db.prepare('UPDATE subcontract_component SET returned_qty=returned_qty+? WHERE id=?').run(qty, component.id);
  }
  // 'shortage' and 'scrap' are record-only: the components already left internal
  // valuation at issue time, so their value stays inside the consumed basis.
  const row = {
    id: id('subadj'), company_id: companyId, order_id: orderId, product_id: input.product_id,
    kind, qty, unit_cost: unitCost, value: money(unitCost * qty),
    stock_move_id: stockMoveId, note: input.note || null, created_at: now(), created_by: userId || null,
  };
  db.prepare('INSERT INTO subcontract_adjustment(id,company_id,order_id,product_id,kind,qty,unit_cost,value,stock_move_id,note,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.company_id, row.order_id, row.product_id, row.kind, row.qty, row.unit_cost, row.value, row.stock_move_id, row.note, row.created_at, row.created_by);
  recordWrite(db, runtime, companyId, 'subcontract_order', orderId, `component_${kind}`, userId, null, row, 'manufacturing');
  return row;
}

// Net consumed value = issued value - unused returns. Shortage and scrap remain
// consumed (they were supplied and not returned) and therefore stay in the
// finished valuation basis per the canonical formula.
function consumedComponentValue(db, orderId) {
  const issued = db.prepare('SELECT COALESCE(SUM(value),0) value FROM subcontract_issue WHERE order_id=?').get(orderId).value;
  const returned = db.prepare("SELECT COALESCE(SUM(value),0) value FROM subcontract_adjustment WHERE order_id=? AND kind='return_unused'").get(orderId).value;
  return money(Number(issued) - Number(returned));
}

function applicableLandedCost(db, companyId, landedCostIds) {
  const ids = Array.isArray(landedCostIds) ? landedCostIds : [];
  let total = 0;
  for (const landedId of ids) {
    const row = db.prepare('SELECT * FROM landed_cost WHERE id=? AND company_id=?').get(String(landedId), companyId);
    if (!row) throw fail('landed cost is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
    total += Number(row.total_amount || 0);
  }
  return money(total);
}

function productCategoryName(db, productRow) {
  if (!productRow.category_id) return 'Staged';
  const row = db.prepare('SELECT name FROM product_category WHERE id=?').get(productRow.category_id);
  return (row && row.name) || 'Staged';
}

function varianceAccount(db, companyId, requested) {
  const accountId = requested || 'coa_501000';
  const row = db.prepare('SELECT id FROM account WHERE id=? AND company_id=?').get(accountId, companyId);
  if (!row) throw fail('variance account is missing or outside company scope', 409, 'SUBCONTRACT_VARIANCE_ACCOUNT');
  return accountId;
}

function accrualAccount(db, companyId, category) {
  if (tableExists(db, 'stock_valuation_category_policy')) {
    const policy = db.prepare('SELECT accrual_account_id FROM stock_valuation_category_policy WHERE company_id=? AND category=?').get(companyId, category || 'Staged');
    if (policy && policy.accrual_account_id) return policy.accrual_account_id;
  }
  return 'coa_501000';
}

function postVarianceDoc(db, companyId, order, variance, accountId, category, userId) {
  const docId = id('fiscal');
  const stamp = now();
  const absVariance = money(Math.abs(variance));
  const offset = accrualAccount(db, companyId, category);
  db.prepare("INSERT INTO fiscal_doc(id,company_id,move_type,doc_date,state,currency,created_at,created_by) VALUES(?,?, 'stock_valuation', ?, 'draft', 'IQD', ?, ?)")
    .run(docId, companyId, stamp.slice(0, 10), stamp, userId || 'system');
  const insert = db.prepare('INSERT INTO fiscal_doc_line(id,fiscal_doc_id,company_id,account_id,debit,credit,description,created_at) VALUES(?,?,?,?,?,?,?,?)');
  // Positive variance: extra cost recognized (DR variance, CR accrual). Negative: favorable (DR accrual, CR variance).
  const drAccount = variance >= 0 ? accountId : offset;
  const crAccount = variance >= 0 ? offset : accountId;
  insert.run(id('line'), docId, companyId, drAccount, absVariance, 0, `Subcontract variance ${order.order_number}`, stamp);
  insert.run(id('line'), docId, companyId, crAccount, 0, absVariance, `Subcontract variance ${order.order_number}`, stamp);
  postFiscalDoc(db, docId, userId || 'system');
  return docId;
}

// Receive finished goods at the full canonical valuation, post the service AP
// bill, and post the authorized variance to GL — all in one transaction.
function receiveSubcontract(db, companyId, orderId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const order = getOrder(db, companyId, orderId);
  const scope = idempotencyScope(db, userId, companyId, 'subcontract_receive', input.idempotency_key, { orderId, ...input });
  if (scope && scope.replay) return scope.replay;
  if (order.state === 'received' || order.state === 'reversed') throw fail('subcontract order was already received', 409, 'SUBCONTRACT_STATE_INVALID');
  const qty = Number(input.qty);
  if (!(qty > 0)) throw fail('received qty must be positive');
  const finished = product(db, companyId, input.product_id);

  const variance = Number(input.variance || 0);
  if (variance !== 0) {
    const approved = tableExists(db, 'x_approvals') && approvalContract.approvalMatches(db, {
      id: input.approval_ref, companyId, tenantId: companyId,
      entity: 'subcontract_order', recordId: orderId, action: 'subcontract_variance_override',
    });
    if (!approved) throw fail('subcontract variance requires an approved variance override', 409, 'SUBCONTRACT_VARIANCE_APPROVAL_REQUIRED');
  }

  const consumedValue = consumedComponentValue(db, orderId);
  const serviceCost = money(Number(input.service_cost == null ? order.service_cost : input.service_cost));
  if (serviceCost < 0) throw fail('service cost cannot be negative');
  const landedValue = applicableLandedCost(db, companyId, input.landed_cost_ids);
  const totalValue = money(consumedValue + serviceCost + variance + landedValue);
  if (totalValue < 0) throw fail('finished subcontract value cannot be negative', 409, 'SUBCONTRACT_VALUE_NEGATIVE');
  const unitValue = money(totalValue / qty);

  const supplier = location(db, companyId, 'supplier', input.from_location_id);
  const internal = location(db, companyId, 'internal', input.to_location_id);
  const move = stock.createStockMove(db, companyId, {
    product_id: finished.id, qty,
    from_location_id: supplier.location_id, to_location_id: internal.location_id,
    warehouse_id: internal.warehouse_id, currency: 'IQD',
    voucher_ref: `${order.order_number}-REC`, cost_price: unitValue,
    batch_number: input.batch_number || null, serial_number: input.serial_number || null,
  });
  stock.postStockMove(db, companyId, move.id, userId || 'system', { rate: unitValue });

  // Service AP linkage: a real posted supplier bill against the subcontract supplier.
  let serviceBillId = null;
  if (serviceCost > 0) {
    const bill = arap.createArapDocument(db, companyId, {
      document_kind: 'supplier_bill', partner_id: order.supplier_id, currency: 'IQD',
      lines: [{ quantity: 1, price_unit: serviceCost, description: `Subcontract service ${order.order_number}`, account_id: input.service_account_id || undefined }],
    }, userId);
    arap.postArapDocument(db, bill.id, userId || 'system');
    serviceBillId = bill.id;
  }

  let varianceDocId = null;
  if (variance !== 0) {
    varianceDocId = postVarianceDoc(db, companyId, order, variance, varianceAccount(db, companyId, input.variance_account_id), productCategoryName(db, finished), userId);
  }

  const row = {
    id: id('subreceipt'), company_id: companyId, order_id: orderId, product_id: finished.id,
    qty, service_cost: serviceCost, variance, stock_move_id: move.id, created_at: now(),
    consumed_value: consumedValue, landed_value: landedValue, total_value: totalValue, unit_value: unitValue,
    service_bill_id: serviceBillId, variance_doc_id: varianceDocId, state: 'received',
  };
  db.prepare('INSERT INTO subcontract_receipt(id,company_id,order_id,product_id,qty,service_cost,variance,stock_move_id,created_at,consumed_value,landed_value,total_value,unit_value,service_bill_id,variance_doc_id,state) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(row.id, row.company_id, row.order_id, row.product_id, row.qty, row.service_cost, row.variance, row.stock_move_id, row.created_at, row.consumed_value, row.landed_value, row.total_value, row.unit_value, row.service_bill_id, row.variance_doc_id, row.state);
  db.prepare("UPDATE subcontract_order SET state='received', variance=? WHERE id=?").run(variance, orderId);
  recordWrite(db, runtime, companyId, 'subcontract_order', orderId, 'received', userId, null, row, 'manufacturing');
  rememberIdempotency(db, scope, row);
  return row;
}

// Exact reversal: outgoing finished-goods move at the receipt's valuation,
// GL variance reversal, AP debit note for the service bill — atomic.
function reverseSubcontractReceipt(db, companyId, receiptId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const receipt = db.prepare('SELECT * FROM subcontract_receipt WHERE id=? AND company_id=?').get(receiptId, companyId);
  if (!receipt) throw fail('subcontract receipt is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  if (receipt.state === 'reversed') throw fail('subcontract receipt was already reversed', 409, 'SUBCONTRACT_STATE_INVALID');
  const order = getOrder(db, companyId, receipt.order_id);

  const internal = location(db, companyId, 'internal', input.from_location_id);
  const supplier = location(db, companyId, 'supplier', input.to_location_id);
  const move = stock.createStockMove(db, companyId, {
    product_id: receipt.product_id, qty: Number(receipt.qty),
    from_location_id: internal.location_id, to_location_id: supplier.location_id,
    warehouse_id: internal.warehouse_id, currency: 'IQD',
    voucher_ref: `${order.order_number}-REC-REV`,
  });
  stock.postStockMove(db, companyId, move.id, userId || 'system', { rate: Number(receipt.unit_value) });

  if (receipt.variance_doc_id) reverseFiscalDoc(db, receipt.variance_doc_id, userId || 'system');

  let debitNoteId = null;
  if (receipt.service_bill_id && Number(receipt.service_cost) > 0) {
    const note = arap.createArapDocument(db, companyId, {
      document_kind: 'supplier_debit_note', partner_id: order.supplier_id, currency: 'IQD',
      lines: [{ quantity: 1, price_unit: Number(receipt.service_cost), description: `Subcontract service reversal ${order.order_number}` }],
    }, userId);
    arap.postArapDocument(db, note.id, userId || 'system');
    debitNoteId = note.id;
  }

  db.prepare("UPDATE subcontract_receipt SET state='reversed', reversed_at=?, reversal_move_id=? WHERE id=?").run(now(), move.id, receiptId);
  db.prepare("UPDATE subcontract_order SET state='issued' WHERE id=?").run(receipt.order_id);
  const evidence = { receipt_id: receiptId, reversal_move_id: move.id, debit_note_id: debitNoteId };
  recordWrite(db, runtime, companyId, 'subcontract_order', receipt.order_id, 'receipt_reversed', userId, receipt, evidence, 'manufacturing');
  return evidence;
}

function valuationSummary(db, companyId, orderId) {
  ensureCompany(db, companyId);
  getOrder(db, companyId, orderId);
  const issues = db.prepare('SELECT * FROM subcontract_issue WHERE order_id=? AND company_id=?').all(orderId, companyId);
  const adjustments = db.prepare('SELECT * FROM subcontract_adjustment WHERE order_id=? AND company_id=?').all(orderId, companyId);
  const receipts = db.prepare('SELECT * FROM subcontract_receipt WHERE order_id=? AND company_id=?').all(orderId, companyId);
  return { consumed_value: consumedComponentValue(db, orderId), issues, adjustments, receipts };
}

module.exports = {
  issueSubcontract: infra.atomicCommand(issueSubcontract),
  adjustSubcontract: infra.atomicCommand(adjustSubcontract),
  receiveSubcontract: infra.atomicCommand(receiveSubcontract),
  reverseSubcontractReceipt: infra.atomicCommand(reverseSubcontractReceipt),
  valuationSummary,
  _internal: { consumedComponentValue, applicableLandedCost, issueSubcontract, receiveSubcontract, adjustSubcontract, reverseSubcontractReceipt },
};
