// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const stock = require('../../stock/stock-engine');
const infra = require('../r3-infra');
const { id, now, money, asDate, within, fail, ensureCompany, tableExists, withImmediateTransaction, idempotencyScope, rememberIdempotency, publish, recordWrite, location, product, issueNumber, approvalContract, approvedOverride } = infra;

function createProduction(db, companyId, input, userId, runtime) { const bom=db.prepare('SELECT * FROM mrp_bom WHERE id=? AND company_id=?').get(input.bom_id,companyId); if(!bom) throw fail('BOM is outside company scope',403,'COMPANY_SCOPE_DENIED'); const output=product(db,companyId,bom.product_id); const qty=Number(input.qty); if(!(qty>0)) throw fail('production quantity must be positive'); const row={id:String(input.id||id('production')),company_id:companyId,bom_id:bom.id,product_id:output.id,order_number:input.order_number||issueNumber(db,'r3_mrp','MO'),qty,state:'draft',reservation_state:'unreserved',wip_value:0,finished_qty:0,finished_value:0,rolled_cost:0,created_at:now(),created_by:userId||null}; db.prepare('INSERT INTO mrp_production_order(id,company_id,bom_id,product_id,order_number,qty,state,reservation_state,wip_value,finished_qty,finished_value,rolled_cost,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(row.id,row.company_id,row.bom_id,row.product_id,row.order_number,row.qty,row.state,row.reservation_state,row.wip_value,row.finished_qty,row.finished_value,row.rolled_cost,row.created_at,row.created_by); for(const line of db.prepare('SELECT * FROM mrp_bom_line WHERE bom_id=? AND company_id=?').all(bom.id,companyId)){db.prepare('INSERT INTO mrp_production_component(id,company_id,production_id,product_id,required_qty,reserved_qty,consumed_qty,issue_move_id) VALUES(?,?,?,?,?,?,?,?)').run(id('component'),companyId,row.id,line.component_product_id,Number(line.qty)*qty,0,0,null);} recordWrite(db,runtime,companyId,'mrp_production_order',row.id,'created',userId,null,row,'manufacturing'); return row; }

function issueProduction(db, companyId, productionId, input={}, userId, runtime) { const production=db.prepare('SELECT * FROM mrp_production_order WHERE id=? AND company_id=?').get(productionId,companyId); if(!production) throw fail('production order not found',404); const source=location(db,companyId,'internal',input.source_location_id); const wip=location(db,companyId,'production',input.wip_location_id); const out=[]; for(const line of db.prepare('SELECT * FROM mrp_production_component WHERE production_id=? AND company_id=?').all(productionId,companyId)){const qty=Number(input.components?.find(x=>x.component_id===line.id)?.qty??line.required_qty); const move=stock.createStockMove(db,companyId,{product_id:line.product_id,qty,from_location_id:source.location_id,to_location_id:wip.location_id,warehouse_id:source.warehouse_id,currency:'IQD',voucher_ref:`${production.order_number}-ISSUE`}); const posted=stock.postStockMove(db,companyId,move.id,userId||'system'); db.prepare('UPDATE mrp_production_component SET reserved_qty=?,consumed_qty=?,issue_move_id=? WHERE id=?').run(qty,qty,move.id,line.id); out.push({component_id:line.id,move_id:move.id,posted}); } db.prepare("UPDATE mrp_production_order SET state='in_progress',reservation_state='reserved',wip_value=(SELECT COALESCE(SUM(consumed_qty*(SELECT standard_cost FROM product_master p WHERE p.id=mrp_production_component.product_id)),0) FROM mrp_production_component WHERE production_id=?) WHERE id=?").run(productionId,productionId); recordWrite(db,runtime,companyId,'mrp_production_order',productionId,'issued',userId,null,out,'manufacturing'); return out; }

function completeProduction(db, companyId, productionId, input={}, userId, runtime) { const production=db.prepare('SELECT * FROM mrp_production_order WHERE id=? AND company_id=?').get(productionId,companyId); if(!production) throw fail('production order not found',404); const source=location(db,companyId,'production',input.wip_location_id); const target=location(db,companyId,'internal',input.destination_location_id); const qty=Number(input.qty||production.qty); const components=db.prepare('SELECT c.*,p.standard_cost FROM mrp_production_component c JOIN product_master p ON p.id=c.product_id WHERE c.production_id=?').all(productionId); const material=components.reduce((sum,l)=>sum+Number(l.consumed_qty)*Number(l.standard_cost||0),0); const labor=Number(input.labor_cost||0), overhead=Number(input.overhead_cost||0), total=money(material+labor+overhead); const move=stock.createStockMove(db,companyId,{product_id:production.product_id,qty,from_location_id:source.location_id,to_location_id:target.location_id,warehouse_id:target.warehouse_id,currency:'IQD',voucher_ref:`${production.order_number}-DONE`,cost_price:qty?total/qty:0}); const posted=stock.postStockMove(db,companyId,move.id,userId||'system',{rate:qty?total/qty:0}); db.prepare("UPDATE mrp_production_order SET state='done',finished_qty=?,finished_value=?,rolled_cost=?,wip_value=0 WHERE id=?").run(qty,total,total,productionId); db.prepare('INSERT INTO mrp_job_card(id,company_id,production_id,work_center_id,planned_minutes,actual_minutes,labor_cost,state,started_at,ended_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id('jobcard'),companyId,productionId,input.work_center_id||null,Number(input.planned_minutes||0),Number(input.actual_minutes||0),labor,'done',input.started_at||null,input.ended_at||now()); recordWrite(db,runtime,companyId,'mrp_production_order',productionId,'completed',userId,null,{move_id:move.id,posted,total},'manufacturing'); return {production_id:productionId,move_id:move.id,posted,total_cost:total}; }

function reverseProduction(db, companyId, productionId, input={}, userId, runtime) {
  const production=db.prepare('SELECT * FROM mrp_production_order WHERE id=? AND company_id=?').get(productionId,companyId);
  if(!production||production.state!=='done') throw fail('completed production is required',409);
  const internal=location(db,companyId,'internal',input.destination_location_id);
  const wip=location(db,companyId,'production',input.wip_location_id);
  const qty=Number(input.qty||production.finished_qty);
  if(!(qty>0)||qty>Number(production.finished_qty)) throw fail('reversal qty must be positive and within finished quantity',409);
  const unitValue=Number(production.finished_qty)>0?Number(production.finished_value)/Number(production.finished_qty):0;
  // 1. Pull finished goods back out of stock at their rolled valuation.
  const finishedMove=stock.createStockMove(db,companyId,{product_id:production.product_id,qty,from_location_id:internal.location_id,to_location_id:wip.location_id,warehouse_id:internal.warehouse_id,currency:'IQD',voucher_ref:`${production.order_number}-REV-FIN`});
  stock.postStockMove(db,companyId,finishedMove.id,userId||'system',{rate:unitValue});
  // 2. Return consumed components from WIP to internal stock at standard cost.
  const componentMoves=[];
  for(const line of db.prepare('SELECT c.*,p.standard_cost FROM mrp_production_component c JOIN product_master p ON p.id=c.product_id WHERE c.production_id=? AND c.company_id=? AND c.consumed_qty>0').all(productionId,companyId)){
    const move=stock.createStockMove(db,companyId,{product_id:line.product_id,qty:Number(line.consumed_qty),from_location_id:wip.location_id,to_location_id:internal.location_id,warehouse_id:internal.warehouse_id,currency:'IQD',voucher_ref:`${production.order_number}-REV-COMP`});
    stock.postStockMove(db,companyId,move.id,userId||'system',{rate:Number(line.standard_cost||0)});
    db.prepare('UPDATE mrp_production_component SET consumed_qty=0,reserved_qty=0 WHERE id=?').run(line.id);
    componentMoves.push(move.id);
  }
  const row={id:id('prodreverse'),company_id:companyId,production_id:productionId,reversal_ref:input.reversal_ref||issueNumber(db,'r3_mrp_reverse','REV'),qty,reason:String(input.reason||'reversal'),created_at:now(),created_by:userId||null};
  db.prepare('INSERT INTO mrp_production_reversal(id,company_id,production_id,reversal_ref,qty,reason,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)').run(...Object.values(row));
  db.prepare("UPDATE mrp_production_order SET state='reversed',finished_qty=0,finished_value=0,wip_value=0 WHERE id=?").run(productionId);
  recordWrite(db,runtime,companyId,'mrp_production_order',productionId,'reversed',userId,null,{...row,finished_move_id:finishedMove.id,component_move_ids:componentMoves},'manufacturing');
  return {...row,finished_move_id:finishedMove.id,component_move_ids:componentMoves};
}


// Multi-level BOM rolled cost with phantom explosion, scrap percentage, and
// revision effectivity. A component that itself has an effective BOM (or a
// phantom line) is exploded recursively; leaves cost at standard_cost.
function effectiveBom(db, companyId, productId, date) {
  return db.prepare(`SELECT * FROM mrp_bom WHERE company_id=? AND product_id=? AND active=1
    AND (effective_from IS NULL OR effective_from <= ?) AND (effective_to IS NULL OR effective_to >= ?)
    ORDER BY revision DESC LIMIT 1`).get(companyId, productId, date, date);
}
function computeBomRolledCost(db, companyId, bomId, qty = 1, options = {}, depth = 0, seen = new Set()) {
  ensureCompany(db, companyId);
  if (depth > 20) throw fail('BOM explosion exceeds maximum depth', 409, 'BOM_DEPTH_EXCEEDED');
  const bom = db.prepare('SELECT * FROM mrp_bom WHERE id=? AND company_id=?').get(bomId, companyId);
  if (!bom) throw fail('BOM is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  if (seen.has(bom.id)) throw fail('BOM explosion detected a cycle', 409, 'BOM_CYCLE');
  seen.add(bom.id);
  const date = asDate(options.date);
  const outputQty = Number(bom.output_qty || 1);
  const lines = db.prepare('SELECT l.*, p.standard_cost FROM mrp_bom_line l JOIN product_master p ON p.id=l.component_product_id WHERE l.bom_id=? AND l.company_id=?').all(bom.id, companyId);
  let material = 0;
  const explosion = [];
  for (const line of lines) {
    const grossQty = (Number(line.qty) * qty / outputQty) * (1 + Number(line.scrap_pct || 0) / 100);
    const childBom = effectiveBom(db, companyId, line.component_product_id, date);
    if (Number(line.phantom) === 1 || (childBom && childBom.bom_type === 'phantom')) {
      if (!childBom) throw fail('phantom component requires its own BOM', 409, 'BOM_PHANTOM_MISSING');
      const child = computeBomRolledCost(db, companyId, childBom.id, grossQty, options, depth + 1, seen);
      material += child.material_cost;
      explosion.push({ component_product_id: line.component_product_id, qty: grossQty, phantom: true, children: child.explosion, cost: child.material_cost });
    } else if (childBom && options.multi_level !== false) {
      const child = computeBomRolledCost(db, companyId, childBom.id, grossQty, options, depth + 1, seen);
      material += child.material_cost;
      explosion.push({ component_product_id: line.component_product_id, qty: grossQty, sub_bom: childBom.id, children: child.explosion, cost: child.material_cost });
    } else {
      const cost = money(grossQty * Number(line.standard_cost || 0));
      material += cost;
      explosion.push({ component_product_id: line.component_product_id, qty: grossQty, unit_cost: Number(line.standard_cost || 0), cost });
    }
  }
  seen.delete(bom.id);
  const labor = Number(options.labor_cost || 0);
  const overhead = Number(options.overhead_cost || 0);
  return { bom_id: bom.id, revision: bom.revision, qty, material_cost: money(material), labor_cost: labor, overhead_cost: overhead, total_cost: money(material + labor + overhead), explosion };
}

module.exports = {
  computeBomRolledCost, effectiveBom,
  createProduction: infra.atomicCommand(createProduction),
  issueProduction: infra.atomicCommand(issueProduction),
  completeProduction: infra.atomicCommand(completeProduction),
  reverseProduction: infra.atomicCommand(reverseProduction),
  _internal: { createProduction, issueProduction, completeProduction, reverseProduction },
};
