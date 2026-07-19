// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const core = require('./r3-core');
const chatter = require('../chatter/chatter')._internal;
const approvals = require('../approvals/approvals')._internal;

const API_BASE = '/api/x/r3';
function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }
function sendJson(res, status, payload) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(payload)); }

function mountR3Routes(deps = {}) {
  const { db, requireSession, readRequestBody, resolveScope, canPermission, events } = deps;
  const runtime = { events };
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };
  function user(req, res) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert) : null;
    if (!session || !session.ok) { sendJson(res, 401, envelope(null, 'Login session required')); return null; }
    return { id: String(session.userId || session.user?.id || 'unknown'), groups: session.groups || [], role: session.user?.role || '', local: /^local-/.test(session.mode || '') };
  }
  function scope(req, res, current) {
    const resolved = typeof resolveScope === 'function' ? resolveScope(req, { userId: current.id, groups: current.groups, user: { id: current.id } }) : { companyId: req.headers['x-company-id'] };
    if (resolved?.error) { sendJson(res, resolved.error.status || 403, envelope(null, resolved.error.message, { code: resolved.error.code })); return null; }
    if (!resolved?.companyId) { sendJson(res, 400, envelope(null, 'x-company-id is required for R3 company-scoped APIs', { code: 'COMPANY_SCOPE_REQUIRED' })); return null; }
    return String(resolved.companyId);
  }
  function permission(req, res, current, perm) {
    if (current.local || current.groups.includes('system.admin') || current.groups.includes('admin')) return true;
    const allowed = typeof canPermission === 'function' && canPermission({ id: current.id, userId: current.id, role: current.role, groups: current.groups }, perm);
    if (!allowed) { sendJson(res, 403, envelope(null, `Permission required: ${perm}`, { code: 'FORBIDDEN' })); return false; }
    return true;
  }
  function body(req) { return typeof readRequestBody === 'function' ? readRequestBody(req) : new Promise((resolve, reject) => { let raw=''; req.on('data', c => { raw += c; }); req.on('end', () => resolve(raw)); req.on('error', reject); }); }
  function parse(raw) { try { return raw ? JSON.parse(raw) : {}; } catch (_) { throw core.fail('Invalid JSON'); } }
  function domainFor(resource) { if (/^(products|categories|uom|barcodes|variants|price|pricing|promotions|coupons)/.test(resource)) return 'product'; if (/^(sales|quotes|orders|deliveries|rmas|commissions)/.test(resource)) return 'sales'; if (/^(requisition|rfq|purchase|receipts|matches|supplier)/.test(resource)) return 'procurement'; if (/^(operation|route|reservation|pick|reorder|cycle|scan|putaway|transfer)/.test(resource)) return 'inventory'; if (/^(bom|work|routing|scrap|byproduct|cost|production)/.test(resource)) return 'manufacturing'; if (/^(landed|subcontract)/.test(resource)) return 'manufacturing'; return 'services'; }

  function handle(req, res, requestUrl) {
    const pathname = requestUrl && requestUrl.pathname;
    if (!pathname || (pathname !== API_BASE && !pathname.startsWith(`${API_BASE}/`))) return false;
    const parts = pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);
    const resource = parts[0] || '';
    const current = user(req, res); if (!current) return true;
    if (!permission(req, res, current, `r3:${domainFor(resource)}:view`)) return true;
    const companyId = scope(req, res, current); if (!companyId) return true;
    try {
      if (req.method === 'GET' && resource === 'snapshot') {
        const counts = { products: db.prepare('SELECT COUNT(*) AS count FROM product_master WHERE company_id=? AND active=1').get(companyId).count }; for (const [key, table] of Object.entries(core.RESOURCE_MAP)) counts[key] = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE company_id=?`).get(companyId).count;
        sendJson(res, 200, envelope({ release: 'R3', company_id: companyId, counts, frozen_zones: ['payroll','attendance','legacy_timesheets'] })); return true;
      }
      if (req.method === 'GET' && resource === 'worklist' && parts.length === 1) { sendJson(res, 200, envelope(core.worklist(db, companyId, Object.fromEntries(requestUrl.searchParams.entries())))); return true; }
      if (resource === 'legacy-workshop') {
        if (req.method !== 'GET') { sendJson(res, 405, envelope(null, 'Legacy workshop bridge is read-only', { code: 'LEGACY_READ_ONLY' })); return true; }
        const bridge = deps.legacyWorkshop || (deps.legacyWorkshop = require('../compat/legacy-workshop-live').createLegacyWorkshopLive());
        try {
          if (parts.length === 1) sendJson(res, 200, envelope(bridge.meta()));
          else if (parts.length === 2 && parts[1] === 'verify-fingerprints') sendJson(res, 200, envelope(bridge.verifyFingerprints()));
          else if (parts.length === 2) sendJson(res, 200, envelope(bridge.list(parts[1], Object.fromEntries(requestUrl.searchParams.entries()))));
          else sendJson(res, 200, envelope(bridge.get(parts[1], parts[2])));
        } catch (error) { sendJson(res, error.statusCode || 500, envelope(null, error.message, { code: error.code || 'LEGACY_ERROR' })); }
        return true;
      }
      if (parts.length === 3 && ['history', 'chatter', 'approval'].includes(parts[2])) core.assertRecordScope(db, companyId, resource, parts[1]);
      if (req.method === 'GET' && parts.length === 3 && parts[2] === 'history') { sendJson(res, 200, envelope(core.getHistory(db, resource, parts[1]))); return true; }
      if (req.method === 'GET' && parts.length === 3 && parts[2] === 'chatter') { const result = chatter.listThread(db, resource, parts[1], Object.fromEntries(requestUrl.searchParams.entries())); sendJson(res, result.status || 200, result.json || result); return true; }
      if (req.method === 'GET' && resource === 'products' && parts.length === 2 && parts[1] === 'price-explain') {
        const input = Object.fromEntries(requestUrl.searchParams.entries()); sendJson(res, 200, envelope(core.explainPrice(db, companyId, input))); return true;
      }
      if (req.method === 'GET' && parts.length === 1) {
        if (resource === 'products') sendJson(res, 200, envelope(db.prepare('SELECT * FROM product_master WHERE company_id=? AND active=1 ORDER BY code').all(companyId)));
        else if (core.RESOURCE_MAP[resource]) sendJson(res, 200, envelope(core.listResource(db, companyId, resource)));
        else sendJson(res, 404, envelope(null, 'R3 resource not found'));
        return true;
      }
      if (req.method === 'POST' && parts.length === 1) {
        if (!permission(req, res, current, `r3:${domainFor(resource)}:manage`)) return true;
        return body(req).then(raw => {
          const input = parse(raw); let result;
          if (resource === 'products') result = core.createProduct(db, companyId, input, current.id);
          else if (resource === 'categories') result = core.createCategory(db, companyId, input, current.id);
          else if (resource === 'uoms') result = core.createUom(db, companyId, input);
          else if (resource === 'barcodes') result = core.createBarcode(db, companyId, input);
          else if (resource === 'variants') result = core.createVariant(db, companyId, input, current.id);
          else if (resource === 'price-lists') result = core.createPriceList(db, companyId, input, current.id);
          else if (resource === 'price-items') result = core.createPriceItem(db, companyId, input);
          else if (resource === 'pricing-rules') result = core.createPricingRule(db, companyId, input, current.id);
          else if (resource === 'promotions') result = core.createPromotion(db, companyId, input, current.id);
          else if (resource === 'quotes') result = core.createQuote(db, companyId, input, current.id, runtime);
          else if (resource === 'orders') result = core.confirmOrder(db, companyId, input, current.id, runtime);
          else if (resource === 'supplier-quotes') result = core.createSupplierQuote(db, companyId, input, current.id, runtime);
          else if (core.RESOURCE_MAP[resource]) { result = core.atomic(db, () => { const inserted = core.insertResource(db, companyId, resource, input, current.id); if (inserted?.id) core.recordWrite(db, runtime, companyId, resource, inserted.id, 'created', current.id, null, inserted); return inserted; }); }
          else throw core.fail('R3 resource not found',404);
          sendJson(res, 201, envelope(result));
        }).catch(error => sendJson(res, error.statusCode || 400, envelope(null, error.message, { code: error.code || 'R3_ERROR' })));
      }
      if (req.method === 'POST' && resource === 'products' && parts.length === 2 && parts[1] === 'price-explain') {
        if (!permission(req, res, current, 'r3:product:view')) return true;
        return body(req).then(raw => sendJson(res, 200, envelope(core.explainPrice(db, companyId, parse(raw))))).catch(error => sendJson(res, error.statusCode || 400, envelope(null, error.message)));
      }
      if (req.method === 'POST' && parts.length === 3) {
        if (!permission(req, res, current, `r3:${domainFor(resource)}:manage`)) return true;
        const recordId = parts[1]; const action = parts[2];
        return body(req).then(raw => {
          const input = parse(raw);
          let result;
          if (resource === 'orders' && action === 'invoice') result = core.invoiceOrder(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'orders' && action === 'reserve') result = core.reserveSalesOrder(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'orders' && action === 'deliver') result = core.deliverSalesOrder(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'orders' && action === 'return') result = core.returnSales(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'purchase-orders' && action === 'match') result = core.matchPurchase(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'purchase-orders' && action === 'receive') result = core.receivePurchase(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'purchase-orders' && action === 'bill') result = core.createVendorBill(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'purchase-orders' && action === 'return') result = core.purchaseReturn(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'landed-costs' && action === 'allocate') result = core.allocateLandedCost(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'landed-costs' && action === 'reverse') result = core.reverseLandedCost(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'route-rules' && action === 'resolve') result = core.resolveRoute(db, companyId, input, current.id, runtime);
          else if (resource === 'routes' && action === 'execute') result = core.executeRoute(db, companyId, { ...input, route_id: recordId }, current.id, runtime);
          else if (resource === 'reorder-rules' && action === 'request') result = core.createReorderRequest(db, companyId, input, current.id, runtime);
          else if (resource === 'reorder-requests' && action === 'convert') result = core.convertReorderRequest(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'reservations' && action === 'release') result = core.releaseReservation(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'transfers' && action === 'post') result = core.transferStock(db, companyId, input, current.id, runtime);
          else if (resource === 'scans' && action === 'scan') result = core.scanBarcode(db, companyId, input, current.id, runtime);
          else if (resource === 'putaway' && action === 'apply') result = core.putaway(db, companyId, input, current.id, runtime);
          else if (resource === 'picks' && action === 'ship') result = core.pickPackShip(db, companyId, { ...input, pick_id: recordId }, current.id, runtime);
          else if (resource === 'cycle-counts' && action === 'approve') result = core.cycleCountApprove(db, companyId, { ...input, count_id: recordId }, current.id, runtime);
          else if (resource === 'productions' && action === 'issue') result = core.issueProduction(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'productions' && action === 'complete') result = core.completeProduction(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'productions' && action === 'reverse') result = core.reverseProduction(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'subcontract-orders' && action === 'issue') result = core.issueSubcontract(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'subcontract-orders' && action === 'receive') result = core.receiveSubcontract(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'subcontract-orders' && action === 'adjust') result = core.adjustSubcontract(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'subcontract-orders' && action === 'valuation') result = core.subcontractValuation(db, companyId, recordId);
          else if (resource === 'subcontract-receipts' && action === 'reverse') result = core.reverseSubcontractReceipt(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'projects' && action === 'bill') result = core.billProject(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'tickets' && action === 'sla-tick') result = core.slaTick(db, companyId, recordId, input, current.id, runtime);
          else if (resource === 'field-service-orders' && action === 'consume-part') result = core.consumeFieldPart(db, companyId, recordId, input, current.id, runtime);
          else if (action === 'chatter') { const item = chatter.postChatterItem(db, resource, recordId, { ...input, author: current.id }); sendJson(res, item.status || 200, item.json || item); return true; }
          else if (action === 'approval') { const item = approvals.createApproval(db, { ...input, company_id: companyId, tenant_id: companyId, entity: input.entity || resource, record_id: recordId }, current.id); sendJson(res, item.status || 200, item.json || item); return true; }
          else if (resource === 'work-orders' && action === 'complete') { result=core.atomic(db,()=>{ const transitioned=core.transitionResource(db,companyId,resource,recordId,'done',current.id); db.prepare('INSERT INTO mrp_cost_rollup(id,company_id,work_order_id,material_cost,labor_cost,overhead_cost,total_cost,computed_at) VALUES(?,?,?,?,?,?,?,?)').run(core.id('rollup'),companyId,recordId,Number(input.material_cost||0),Number(input.labor_cost||0),Number(input.overhead_cost||0),Number(input.total_cost||input.material_cost||0)+Number(input.labor_cost||0)+Number(input.overhead_cost||0),core.now()); return transitioned; }); }
          else if (resource === 'tickets' && action === 'close') result=core.transitionResource(db,companyId,resource,recordId,'closed',current.id);
          else if (core.RESOURCE_MAP[resource] && action === 'state') result=core.transitionResource(db,companyId,resource,recordId,String(input.state||''),current.id);
          else throw core.fail('R3 action not found',404);
          sendJson(res,200,envelope(result));
        }).catch(error=>sendJson(res,error.statusCode||400,envelope(null,error.message,{code:error.code||'R3_ERROR'})));
      }
      sendJson(res, 404, envelope(null, 'R3 endpoint not found'));
    } catch (error) { sendJson(res, error.statusCode || 400, envelope(null, error.message, { code: error.code || 'R3_ERROR' })); }
    return true;
  }
  return { handle };
}

module.exports = { mountR3Routes };
