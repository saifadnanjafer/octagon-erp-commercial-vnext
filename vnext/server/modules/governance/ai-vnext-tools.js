// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R4.5 concrete VNext tool definitions registered into the governed tool
// registry. Read tools wrap read-only domain queries; write tools wrap governed
// domain commands (which already enforce scope/atomicity/audit). Registering
// here is the ONLY way these become AI-callable — there is no other write path.
'use strict';

const registry = require('./ai-tool-registry');
const pricingEngine = require('../pricing/pricing-engine');
const salesEngine = require('../sales/sales-engine');
const inventoryOps = require('../inventory/inventory-ops-engine');
const infra = require('../r3-infra');
const { fail } = infra;

let registered = false;

function registerVNextTools() {
  if (registered) return;
  registered = true;

  // --- READ tools (unrestricted by role, audited) ---
  registry.registerTool({
    name: 'report_low_stock',
    risk: 'read',
    requiredPerm: 'inventory:view',
    execute(db, companyId) {
      return db.prepare(`SELECT b.product_id, b.location_id, b.qty, r.min_qty
        FROM bin b JOIN stock_reorder_rule r ON r.product_id=b.product_id AND r.location_id=b.location_id AND r.company_id=b.company_id
        WHERE b.company_id=? AND b.qty < r.min_qty`).all(companyId);
    },
  });

  registry.registerTool({
    name: 'explain_price',
    risk: 'read',
    requiredPerm: 'pricing:view',
    validate(args) { if (!args || !args.product_id) throw fail('product_id is required', 400, 'AI_ARGS_INVALID'); },
    execute(db, companyId, args) {
      return pricingEngine.explainPrice(db, companyId, { product_id: args.product_id, qty: args.qty || 1, base_price: args.base_price || 0, partner_id: args.partner_id, currency: args.currency });
    },
  });

  // --- WRITE tools (approval-classed; wrap governed domain commands) ---
  registry.registerTool({
    name: 'create_sales_quote',
    risk: 'write',
    requiredPerm: 'sales:manage',
    action: 'ai_create_sales_quote',
    validate(args) {
      if (!args || !args.partner_id) throw fail('partner_id is required', 400, 'AI_ARGS_INVALID');
      if (!Array.isArray(args.lines) || !args.lines.length) throw fail('at least one line is required', 400, 'AI_ARGS_INVALID');
    },
    precondition(db, companyId, args) {
      if (!db.prepare('SELECT 1 FROM partner_master WHERE id=? AND company_id=?').get(args.partner_id, companyId)) throw fail('customer is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
      return true;
    },
    preview(db, companyId, args) {
      const lineCount = args.lines.length;
      const total = args.lines.reduce((sum, line) => sum + Number(line.qty || 1) * Number(line.unit_price || line.base_price || 0), 0);
      return { summary: `إنشاء عرض سعر للعميل ${args.partner_id} بعدد ${lineCount} بند وإجمالي تقديري ${total}`, partner_id: args.partner_id, line_count: lineCount, estimated_total: total };
    },
    execute(db, companyId, args, ctx) {
      // salesEngine.createQuote is itself an atomic, scoped, audited command.
      return salesEngine.createQuote(db, companyId, args, ctx.actor || 'ai', null);
    },
    compensate(db, companyId, result) {
      // A draft quote carries no ledger effect; compensation cancels it.
      if (result && result.id) db.prepare("UPDATE sales_quote SET state='cancelled' WHERE id=? AND company_id=?").run(result.id, companyId);
      return { cancelled: result?.id || null };
    },
  });

  registry.registerTool({
    name: 'post_internal_transfer',
    risk: 'write',
    requiredPerm: 'inventory:manage',
    action: 'ai_post_internal_transfer',
    validate(args) {
      if (!args || !args.product_id || !args.from_location_id || !args.to_location_id) throw fail('product and both locations are required', 400, 'AI_ARGS_INVALID');
      if (!(Number(args.qty) > 0)) throw fail('positive qty required', 400, 'AI_ARGS_INVALID');
    },
    preview(db, companyId, args) {
      return { summary: `تحويل داخلي للمنتج ${args.product_id} بكمية ${args.qty} من ${args.from_location_id} إلى ${args.to_location_id}`, ...args };
    },
    execute(db, companyId, args, ctx) {
      return inventoryOps.transferStock(db, companyId, args, ctx.actor || 'ai', null);
    },
    compensate(db, companyId, result) {
      // Reverse the physical move by posting the opposite transfer is a domain
      // operation; here we record the intent for the audit trail.
      return { reversal_intent: result?.move_id || null };
    },
  });
}

module.exports = { registerVNextTools };
