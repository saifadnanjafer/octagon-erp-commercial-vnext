// clean-room; R3.6 landed-cost and subcontracting records.
'use strict';

export const migration = {
  id: '616_r3_landed_subcontracting', dependsOn: ['615_r3_manufacturing_core'],
  up(db) { db.exec(`
    CREATE TABLE IF NOT EXISTS landed_cost (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), name TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft', currency TEXT NOT NULL DEFAULT 'IQD', total_amount REAL NOT NULL DEFAULT 0, allocation_basis TEXT NOT NULL DEFAULT 'value', valuation_doc_id TEXT, created_at TEXT NOT NULL, created_by TEXT) STRICT;
    CREATE TABLE IF NOT EXISTS landed_cost_line (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), landed_cost_id TEXT NOT NULL REFERENCES landed_cost(id) ON DELETE CASCADE, description TEXT NOT NULL, amount REAL NOT NULL, account_id TEXT REFERENCES account(id)) STRICT;
    CREATE TABLE IF NOT EXISTS landed_cost_allocation (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), landed_cost_id TEXT NOT NULL REFERENCES landed_cost(id), stock_move_id TEXT NOT NULL REFERENCES stock_move(id), basis_value REAL NOT NULL, allocated_amount REAL NOT NULL, valuation_line_id TEXT, reversal_of TEXT) STRICT;
    CREATE TABLE IF NOT EXISTS subcontract_order (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), supplier_id TEXT NOT NULL REFERENCES partner_master(id), bom_id TEXT REFERENCES mrp_bom(id), order_number TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft', qty REAL NOT NULL, service_cost REAL NOT NULL DEFAULT 0, variance REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL, created_by TEXT) STRICT;
    CREATE TABLE IF NOT EXISTS subcontract_component (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES subcontract_order(id) ON DELETE CASCADE, product_id TEXT NOT NULL REFERENCES product_master(id), qty REAL NOT NULL, supplied_qty REAL NOT NULL DEFAULT 0, returned_qty REAL NOT NULL DEFAULT 0, stock_move_id TEXT REFERENCES stock_move(id)) STRICT;
    CREATE TABLE IF NOT EXISTS subcontract_receipt (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES subcontract_order(id), product_id TEXT NOT NULL REFERENCES product_master(id), qty REAL NOT NULL, service_cost REAL NOT NULL DEFAULT 0, variance REAL NOT NULL DEFAULT 0, stock_move_id TEXT REFERENCES stock_move(id), created_at TEXT NOT NULL) STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subcontract_order_number ON subcontract_order(company_id, order_number);
  `); },
  down(db) { db.exec('DROP TABLE IF EXISTS subcontract_receipt; DROP TABLE IF EXISTS subcontract_component; DROP TABLE IF EXISTS subcontract_order; DROP TABLE IF EXISTS landed_cost_allocation; DROP TABLE IF EXISTS landed_cost_line; DROP TABLE IF EXISTS landed_cost;'); }
};
