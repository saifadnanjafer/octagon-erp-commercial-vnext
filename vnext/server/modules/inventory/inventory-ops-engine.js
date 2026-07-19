// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const stock = require('../../stock/stock-engine');
const infra = require('../r3-infra');

const { id, now, money, fail, ensureCompany, recordWrite, location, product, issueNumber } = infra;

function reservationAvailable(db, companyId, productId, locationId) {
  const bin = db.prepare('SELECT COALESCE(qty,0) qty FROM bin WHERE company_id=? AND product_id=? AND location_id=?').get(companyId, productId, locationId);
  const reserved = db.prepare("SELECT COALESCE(SUM(qty-released_qty),0) qty FROM sales_reservation WHERE company_id=? AND product_id=? AND location_id=? AND state='reserved'").get(companyId, productId, locationId);
  return Number(bin?.qty || 0) - Number(reserved?.qty || 0);
}

// Release part or all of a sales reservation back to free stock.
function releaseReservation(db, companyId, reservationId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const reservation = db.prepare('SELECT * FROM sales_reservation WHERE id=? AND company_id=?').get(reservationId, companyId);
  if (!reservation) throw fail('reservation is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  if (reservation.state !== 'reserved') throw fail('only an active reservation can be released', 409, 'RESERVATION_STATE_INVALID');
  const remaining = Number(reservation.qty) - Number(reservation.released_qty);
  const qty = Number(input.qty == null ? remaining : input.qty);
  if (!(qty > 0) || qty > remaining) throw fail('release qty must be positive and within the remaining reservation', 409);
  const released = Number(reservation.released_qty) + qty;
  const state = released >= Number(reservation.qty) ? 'released' : 'reserved';
  db.prepare('UPDATE sales_reservation SET released_qty=?, state=? WHERE id=?').run(released, state, reservationId);
  const after = db.prepare('SELECT * FROM sales_reservation WHERE id=?').get(reservationId);
  recordWrite(db, runtime, companyId, 'sales_reservation', reservationId, 'released', userId, reservation, after, 'warehouse');
  return after;
}

// Internal transfer, including cross-warehouse: both legs must be internal locations.
function transferStock(db, companyId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const source = location(db, companyId, 'internal', input.from_location_id);
  const dest = location(db, companyId, 'internal', input.to_location_id);
  if (source.location_id === dest.location_id) throw fail('transfer requires two distinct internal locations');
  product(db, companyId, input.product_id);
  const qty = Number(input.qty);
  if (!(qty > 0)) throw fail('transfer qty must be positive');
  const move = stock.createStockMove(db, companyId, {
    product_id: input.product_id, qty,
    from_location_id: source.location_id, to_location_id: dest.location_id,
    warehouse_id: source.warehouse_id === dest.warehouse_id ? dest.warehouse_id : null, currency: 'IQD',
    voucher_ref: input.voucher_ref || issueNumber(db, 'r3_transfer', 'TRF'),
    batch_number: input.batch_number || null, serial_number: input.serial_number || null,
  });
  stock.postStockMove(db, companyId, move.id, userId || 'system');
  const crossWarehouse = source.warehouse_id !== dest.warehouse_id;
  const evidence = { move_id: move.id, cross_warehouse: crossWarehouse, from: source.location_id, to: dest.location_id, qty };
  recordWrite(db, runtime, companyId, 'stock_move', move.id, crossWarehouse ? 'cross_warehouse_transfer' : 'internal_transfer', userId, null, evidence, 'warehouse');
  return evidence;
}

// Execute every active rule of a route in sequence as a chained transfer
// (one-step, two-step, or three-step). Pull routes run the chain from the final
// demand backwards but post in physical order; push routes run source-forward.
// Both end up posting the same physical chain here — trigger_type is recorded
// on each resolution for audit.
function executeRoute(db, companyId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const route = db.prepare('SELECT * FROM stock_route WHERE id=? AND company_id=? AND active=1').get(String(input.route_id || ''), companyId);
  if (!route) throw fail('route is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  const rules = db.prepare('SELECT * FROM stock_route_rule WHERE route_id=? AND company_id=? AND active=1 ORDER BY sequence').all(route.id, companyId);
  if (!rules.length) throw fail('route has no active rules', 409, 'ROUTE_EMPTY');
  product(db, companyId, input.product_id);
  const qty = Number(input.qty);
  if (!(qty > 0)) throw fail('route qty must be positive');
  const demandRef = String(input.demand_ref || id('demand'));
  const steps = [];
  for (const rule of rules) {
    if (!rule.source_location_id || !rule.dest_location_id) throw fail('route rule is missing explicit source and destination locations', 409, 'ROUTE_RULE_INCOMPLETE');
    const source = db.prepare('SELECT * FROM locations WHERE location_id=? AND company_id=?').get(rule.source_location_id, companyId);
    const dest = db.prepare('SELECT * FROM locations WHERE location_id=? AND company_id=?').get(rule.dest_location_id, companyId);
    if (!source || !dest) throw fail('route rule locations are outside company scope', 403, 'COMPANY_SCOPE_DENIED');
    const move = stock.createStockMove(db, companyId, {
      product_id: input.product_id, qty,
      from_location_id: source.location_id, to_location_id: dest.location_id,
      warehouse_id: source.warehouse_id === dest.warehouse_id ? dest.warehouse_id : null, currency: 'IQD',
      voucher_ref: `${demandRef}-STEP${rule.sequence}`,
    });
    stock.postStockMove(db, companyId, move.id, userId || 'system');
    const resolution = {
      id: id('route'), company_id: companyId, demand_ref: demandRef, route_id: route.id, rule_id: rule.id,
      source_location_id: source.location_id, destination_location_id: dest.location_id,
      operation_type_id: rule.operation_type_id || null, state: 'executed', created_at: now(),
    };
    db.prepare('INSERT INTO stock_route_resolution(id,company_id,demand_ref,route_id,rule_id,source_location_id,destination_location_id,operation_type_id,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(...Object.values(resolution));
    steps.push({ ...resolution, move_id: move.id, trigger_type: rule.trigger_type });
  }
  recordWrite(db, runtime, companyId, 'stock_route', route.id, 'executed', userId, null, { demand_ref: demandRef, steps: steps.length, step_count: rules.length }, 'warehouse');
  return { route_id: route.id, demand_ref: demandRef, steps };
}

// Convert a draft replenishment suggestion into its supply document:
// draft purchase order (vendor rule), draft manufacturing order (BOM exists),
// or a draft internal-transfer suggestion. Never posts stock and never posts GL.
function convertReorderRequest(db, companyId, requestId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const request = db.prepare('SELECT * FROM stock_reorder_request WHERE id=? AND company_id=?').get(requestId, companyId);
  if (!request) throw fail('reorder request is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  if (request.state !== 'draft') throw fail('only a draft reorder request can be converted', 409, 'REORDER_STATE_INVALID');
  const rule = db.prepare('SELECT * FROM stock_reorder_rule WHERE id=? AND company_id=?').get(request.reorder_rule_id, companyId);
  const kind = String(input.kind || (rule?.vendor_id ? 'purchase' : 'manufacture'));
  const qty = Number(request.demand_qty);
  let supply = null;
  if (kind === 'purchase') {
    const vendorId = input.vendor_id || rule?.vendor_id;
    if (!vendorId || !db.prepare('SELECT 1 FROM partner_master WHERE id=? AND company_id=?').get(vendorId, companyId)) throw fail('a company-scoped vendor is required for a draft purchase order', 409, 'REORDER_VENDOR_REQUIRED');
    const poId = id('po');
    const orderNumber = issueNumber(db, 'r3_po', 'PO');
    db.prepare("INSERT INTO purchase_order(id,company_id,supplier_id,order_number,state,currency,total_amount,created_at,created_by) VALUES(?,?,?,?,'draft','IQD',?,?,?)")
      .run(poId, companyId, vendorId, orderNumber, money(qty * Number(input.unit_price || 0)), now(), userId || null);
    db.prepare('INSERT INTO purchase_order_line(id,company_id,order_id,product_id,qty,received_qty,billed_qty,unit_price,subtotal) VALUES(?,?,?,?,?,0,0,?,?)')
      .run(id('pol'), companyId, poId, request.product_id, qty, Number(input.unit_price || 0), money(qty * Number(input.unit_price || 0)));
    supply = { kind: 'purchase_order', id: poId, order_number: orderNumber, state: 'draft' };
  } else if (kind === 'manufacture') {
    const bom = db.prepare('SELECT * FROM mrp_bom WHERE product_id=? AND company_id=? ORDER BY rowid DESC LIMIT 1').get(request.product_id, companyId);
    if (!bom) throw fail('a BOM is required to draft a manufacturing order', 409, 'REORDER_BOM_REQUIRED');
    const moId = id('production');
    const orderNumber = issueNumber(db, 'r3_mrp', 'MO');
    db.prepare("INSERT INTO mrp_production_order(id,company_id,bom_id,product_id,order_number,qty,state,reservation_state,wip_value,finished_qty,finished_value,rolled_cost,created_at,created_by) VALUES(?,?,?,?,?,?,'draft','unreserved',0,0,0,0,?,?)")
      .run(moId, companyId, bom.id, request.product_id, orderNumber, qty, now(), userId || null);
    supply = { kind: 'manufacturing_order', id: moId, order_number: orderNumber, state: 'draft' };
  } else if (kind === 'transfer') {
    const source = location(db, companyId, 'internal', input.from_location_id);
    const resolution = {
      id: id('route'), company_id: companyId, demand_ref: `REORDER-${request.id}`, route_id: null, rule_id: null,
      source_location_id: source.location_id, destination_location_id: rule?.location_id || null,
      operation_type_id: null, state: 'draft_transfer', created_at: now(),
    };
    db.prepare('INSERT INTO stock_route_resolution(id,company_id,demand_ref,route_id,rule_id,source_location_id,destination_location_id,operation_type_id,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
      .run(...Object.values(resolution));
    supply = { kind: 'internal_transfer', id: resolution.id, state: 'draft_transfer' };
  } else {
    throw fail('conversion kind must be purchase, manufacture, or transfer');
  }
  db.prepare("UPDATE stock_reorder_request SET state='converted', supply_ref=? WHERE id=?").run(supply.id, requestId);
  const after = db.prepare('SELECT * FROM stock_reorder_request WHERE id=?').get(requestId);
  recordWrite(db, runtime, companyId, 'stock_reorder_request', requestId, 'converted', userId, request, { ...after, supply }, 'warehouse');
  return { request: after, supply };
}

// Resolve a barcode to its product (alternate barcodes included) and record the scan.
function scanBarcode(db, companyId, input = {}, userId, runtime) {
  ensureCompany(db, companyId);
  const barcode = String(input.barcode || '').trim();
  if (!barcode) throw fail('barcode is required');
  const direct = db.prepare('SELECT id, base_uom_id FROM product_master WHERE barcode=? AND company_id=? AND active=1').get(barcode, companyId);
  const alternate = direct ? null : db.prepare('SELECT product_id, uom_id FROM product_barcode WHERE barcode=? AND company_id=? AND active=1').get(barcode, companyId);
  const productId = direct?.id || alternate?.product_id || null;
  const row = {
    id: id('scan'), company_id: companyId, barcode, product_id: productId,
    operation_id: input.operation_id || null, scan_type: String(input.scan_type || 'lookup'),
    qty: Number(input.qty || 1), scanned_at: now(), scanned_by: userId || null,
  };
  db.prepare('INSERT INTO stock_barcode_scan(id,company_id,barcode,product_id,operation_id,scan_type,qty,scanned_at,scanned_by) VALUES(?,?,?,?,?,?,?,?,?)')
    .run(...Object.values(row));
  recordWrite(db, runtime, companyId, 'stock_barcode_scan', row.id, 'scanned', userId, null, row, null);
  if (!productId) return { ...row, resolved: false };
  return { ...row, resolved: true, uom_id: direct?.base_uom_id || alternate?.uom_id || null };
}

module.exports = {
  releaseReservation: infra.atomicCommand(releaseReservation),
  transferStock: infra.atomicCommand(transferStock),
  executeRoute: infra.atomicCommand(executeRoute),
  convertReorderRequest: infra.atomicCommand(convertReorderRequest),
  scanBarcode: infra.atomicCommand(scanBarcode),
  reservationAvailable,
  _internal: { releaseReservation, transferStock, executeRoute, convertReorderRequest, scanBarcode },
};
