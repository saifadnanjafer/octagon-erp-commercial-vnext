// clean-room; R3 blocker-closure workflow state and ledger-link records.
'use strict';

import { rebuildProductMasterForR3Rollback } from '../vnext/server/db/sqlite-rebuild.mjs';

export const migration = {
  id: '618_r3_blocker_closure',
  dependsOn: ['617_r3_services_helpdesk'],
  up(db) {
    const productColumns = new Set(db.prepare('PRAGMA table_info(product_master)').all().map((row) => row.name));
    for (const [name, definition] of [
      ['standard_cost', 'REAL NOT NULL DEFAULT 0'], ['tracking_type', "TEXT NOT NULL DEFAULT 'none'"],
      ['valuation_method', "TEXT NOT NULL DEFAULT 'avco'"], ['weight', 'REAL NOT NULL DEFAULT 0'], ['volume', 'REAL NOT NULL DEFAULT 0'],
    ]) if (!productColumns.has(name)) db.exec(`ALTER TABLE product_master ADD COLUMN ${name} ${definition}`);
    db.exec(`
      CREATE TABLE IF NOT EXISTS sales_reservation (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES sales_order(id),
        order_line_id TEXT REFERENCES sales_order_line(id), product_id TEXT NOT NULL REFERENCES product_master(id), location_id TEXT NOT NULL REFERENCES locations(location_id),
        qty REAL NOT NULL CHECK(qty > 0), reserved_qty REAL NOT NULL DEFAULT 0, released_qty REAL NOT NULL DEFAULT 0,
        state TEXT NOT NULL DEFAULT 'reserved' CHECK(state IN ('reserved','released','fulfilled','cancelled')), created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_reservation_line ON sales_reservation(company_id, order_line_id, location_id);
      CREATE TABLE IF NOT EXISTS sales_delivery_line (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), delivery_id TEXT NOT NULL REFERENCES sales_delivery(id) ON DELETE CASCADE,
        order_line_id TEXT NOT NULL REFERENCES sales_order_line(id), product_id TEXT NOT NULL REFERENCES product_master(id), qty REAL NOT NULL, stock_move_id TEXT REFERENCES stock_move(id), created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sales_backorder (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES sales_order(id), delivery_id TEXT NOT NULL REFERENCES sales_delivery(id),
        product_id TEXT NOT NULL REFERENCES product_master(id), qty REAL NOT NULL, state TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sales_return (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES sales_order(id), delivery_id TEXT REFERENCES sales_delivery(id),
        product_id TEXT NOT NULL REFERENCES product_master(id), qty REAL NOT NULL, reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'requested', stock_move_id TEXT REFERENCES stock_move(id), created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS sales_credit_note (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), return_id TEXT NOT NULL REFERENCES sales_return(id), arap_document_id TEXT REFERENCES arap_document(id), amount REAL NOT NULL, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS purchase_supplier_quote (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), rfq_id TEXT NOT NULL REFERENCES purchase_rfq(id) ON DELETE CASCADE, supplier_id TEXT NOT NULL REFERENCES partner_master(id),
        total_amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'IQD', lead_time_days INTEGER NOT NULL DEFAULT 0, selected INTEGER NOT NULL DEFAULT 0, received_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS purchase_return (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES purchase_order(id), receipt_id TEXT REFERENCES purchase_receipt(id),
        product_id TEXT NOT NULL REFERENCES product_master(id), qty REAL NOT NULL, reason TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'requested', stock_move_id TEXT REFERENCES stock_move(id), created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS purchase_bill_link (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES purchase_order(id), arap_document_id TEXT REFERENCES arap_document(id), amount REAL NOT NULL, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS stock_route_resolution (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), demand_ref TEXT NOT NULL, route_id TEXT REFERENCES stock_route(id), rule_id TEXT REFERENCES stock_route_rule(id),
        source_location_id TEXT REFERENCES locations(location_id), destination_location_id TEXT REFERENCES locations(location_id), operation_type_id TEXT REFERENCES stock_operation_type(id), state TEXT NOT NULL DEFAULT 'resolved', created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS stock_putaway_rule (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), warehouse_id TEXT NOT NULL REFERENCES warehouses(warehouse_id), source_location_id TEXT REFERENCES locations(location_id), destination_location_id TEXT NOT NULL REFERENCES locations(location_id),
        product_id TEXT REFERENCES product_master(id), priority INTEGER NOT NULL DEFAULT 10, active INTEGER NOT NULL DEFAULT 1
      ) STRICT;
      CREATE TABLE IF NOT EXISTS stock_reorder_request (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), reorder_rule_id TEXT NOT NULL REFERENCES stock_reorder_rule(id), product_id TEXT NOT NULL REFERENCES product_master(id), demand_qty REAL NOT NULL, supply_ref TEXT, state TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS stock_cycle_approval (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), count_id TEXT NOT NULL REFERENCES stock_cycle_count(id), requested_by TEXT NOT NULL, approved_by TEXT, state TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, decided_at TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS mrp_production_order (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), bom_id TEXT NOT NULL REFERENCES mrp_bom(id), product_id TEXT NOT NULL REFERENCES product_master(id), order_number TEXT NOT NULL,
        qty REAL NOT NULL, state TEXT NOT NULL DEFAULT 'draft', reservation_state TEXT NOT NULL DEFAULT 'unreserved', wip_value REAL NOT NULL DEFAULT 0, finished_qty REAL NOT NULL DEFAULT 0, finished_value REAL NOT NULL DEFAULT 0, rolled_cost REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_mrp_production_number ON mrp_production_order(company_id, order_number);
      CREATE TABLE IF NOT EXISTS mrp_production_component (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), production_id TEXT NOT NULL REFERENCES mrp_production_order(id) ON DELETE CASCADE, product_id TEXT NOT NULL REFERENCES product_master(id),
        required_qty REAL NOT NULL, reserved_qty REAL NOT NULL DEFAULT 0, consumed_qty REAL NOT NULL DEFAULT 0, issue_move_id TEXT REFERENCES stock_move(id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS mrp_job_card (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), production_id TEXT NOT NULL REFERENCES mrp_production_order(id) ON DELETE CASCADE, work_center_id TEXT REFERENCES mrp_work_center(id),
        planned_minutes REAL NOT NULL DEFAULT 0, actual_minutes REAL NOT NULL DEFAULT 0, labor_cost REAL NOT NULL DEFAULT 0, state TEXT NOT NULL DEFAULT 'draft', started_at TEXT, ended_at TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS mrp_production_reversal (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), production_id TEXT NOT NULL REFERENCES mrp_production_order(id), reversal_ref TEXT NOT NULL UNIQUE, qty REAL NOT NULL, reason TEXT NOT NULL, created_at TEXT NOT NULL, created_by TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS landed_cost_basis (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), landed_cost_id TEXT NOT NULL REFERENCES landed_cost(id) ON DELETE CASCADE, stock_move_id TEXT NOT NULL REFERENCES stock_move(id),
        quantity REAL NOT NULL DEFAULT 0, value REAL NOT NULL DEFAULT 0, weight REAL NOT NULL DEFAULT 0, manual_ratio REAL, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS subcontract_issue (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES subcontract_order(id), product_id TEXT NOT NULL REFERENCES product_master(id), qty REAL NOT NULL, stock_move_id TEXT REFERENCES stock_move(id), state TEXT NOT NULL DEFAULT 'issued', created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS project_billing_line (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), project_id TEXT NOT NULL REFERENCES project_project(id), source_type TEXT NOT NULL, source_id TEXT NOT NULL, description TEXT NOT NULL,
        amount REAL NOT NULL, state TEXT NOT NULL DEFAULT 'unbilled', invoice_id TEXT REFERENCES arap_document(id), created_at TEXT NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_project_billing_source ON project_billing_line(company_id, source_type, source_id);
      CREATE TABLE IF NOT EXISTS project_expense (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), project_id TEXT NOT NULL REFERENCES project_project(id), user_id TEXT NOT NULL, expense_date TEXT NOT NULL, amount REAL NOT NULL, description TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft', billable INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS helpdesk_sla_event (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), ticket_id TEXT NOT NULL REFERENCES helpdesk_ticket(id), sla_id TEXT REFERENCES helpdesk_sla(id), event_type TEXT NOT NULL, event_at TEXT NOT NULL, actor_id TEXT NOT NULL, payload TEXT
      ) STRICT;
      CREATE TABLE IF NOT EXISTS helpdesk_escalation (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), ticket_id TEXT NOT NULL REFERENCES helpdesk_ticket(id), sla_id TEXT REFERENCES helpdesk_sla(id), escalation_level INTEGER NOT NULL DEFAULT 1, escalated_to TEXT NOT NULL, escalated_at TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'open'
      ) STRICT;
      CREATE TABLE IF NOT EXISTS r3_worklist_item (
        id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), entity TEXT NOT NULL, record_id TEXT NOT NULL, queue TEXT NOT NULL, assignee_id TEXT, state TEXT NOT NULL DEFAULT 'open', created_at TEXT NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_r3_worklist_scope ON r3_worklist_item(company_id, queue, state, assignee_id);
    `);
  },
  down(db) {
    db.exec(`DROP TABLE IF EXISTS r3_worklist_item; DROP TABLE IF EXISTS helpdesk_escalation; DROP TABLE IF EXISTS helpdesk_sla_event; DROP TABLE IF EXISTS project_expense; DROP TABLE IF EXISTS project_billing_line; DROP TABLE IF EXISTS subcontract_issue; DROP TABLE IF EXISTS landed_cost_basis; DROP TABLE IF EXISTS mrp_production_reversal; DROP TABLE IF EXISTS mrp_job_card; DROP TABLE IF EXISTS mrp_production_component; DROP TABLE IF EXISTS mrp_production_order; DROP TABLE IF EXISTS stock_cycle_approval; DROP TABLE IF EXISTS stock_reorder_request; DROP TABLE IF EXISTS stock_putaway_rule; DROP TABLE IF EXISTS stock_route_resolution; DROP TABLE IF EXISTS purchase_bill_link; DROP TABLE IF EXISTS purchase_return; DROP TABLE IF EXISTS purchase_supplier_quote; DROP TABLE IF EXISTS sales_credit_note; DROP TABLE IF EXISTS sales_return; DROP TABLE IF EXISTS sales_backorder; DROP TABLE IF EXISTS sales_delivery_line; DROP TABLE IF EXISTS sales_reservation;`);
    rebuildProductMasterForR3Rollback(db, ['standard_cost', 'tracking_type', 'valuation_method', 'weight', 'volume', 'website_published', 'website_description', 'website_image_url', 'website_price']);
  }
};
