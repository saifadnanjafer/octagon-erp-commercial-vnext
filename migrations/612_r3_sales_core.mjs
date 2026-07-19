// clean-room; R3.2 sales pipeline and fulfillment references.
'use strict';

import { rebuildPartnerMasterForR3Rollback } from '../vnext/server/db/sqlite-rebuild.mjs';

export const migration = {
  id: '612_r3_sales_core', dependsOn: ['611_r3_pricing_rules'],
  up(db) { db.exec(`
    CREATE TABLE IF NOT EXISTS sales_lead (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), partner_id TEXT REFERENCES partner_master(id), title TEXT NOT NULL, stage TEXT NOT NULL DEFAULT 'lead', expected_value REAL NOT NULL DEFAULT 0, probability REAL NOT NULL DEFAULT 0, owner_id TEXT, created_at TEXT NOT NULL, created_by TEXT) STRICT;
    CREATE TABLE IF NOT EXISTS sales_quote (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), partner_id TEXT NOT NULL REFERENCES partner_master(id), quote_number TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft', valid_until TEXT, currency TEXT NOT NULL DEFAULT 'IQD', total_amount REAL NOT NULL DEFAULT 0, source_lead_id TEXT REFERENCES sales_lead(id), idempotency_key TEXT UNIQUE, created_at TEXT NOT NULL, created_by TEXT) STRICT;
    CREATE TABLE IF NOT EXISTS sales_quote_line (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), quote_id TEXT NOT NULL REFERENCES sales_quote(id) ON DELETE CASCADE, product_id TEXT NOT NULL REFERENCES product_master(id), variant_id TEXT REFERENCES product_variant(id), description TEXT, qty REAL NOT NULL CHECK(qty > 0), uom_id TEXT REFERENCES uom(id), unit_price REAL NOT NULL CHECK(unit_price >= 0), discount REAL NOT NULL DEFAULT 0, tax_amount REAL NOT NULL DEFAULT 0, subtotal REAL NOT NULL DEFAULT 0) STRICT;
    CREATE TABLE IF NOT EXISTS sales_order (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), partner_id TEXT NOT NULL REFERENCES partner_master(id), order_number TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'draft', quote_id TEXT REFERENCES sales_quote(id), currency TEXT NOT NULL DEFAULT 'IQD', total_amount REAL NOT NULL DEFAULT 0, delivered_amount REAL NOT NULL DEFAULT 0, invoiced_amount REAL NOT NULL DEFAULT 0, idempotency_key TEXT UNIQUE, created_at TEXT NOT NULL, created_by TEXT) STRICT;
    CREATE TABLE IF NOT EXISTS sales_order_line (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES sales_order(id) ON DELETE CASCADE, product_id TEXT NOT NULL REFERENCES product_master(id), variant_id TEXT REFERENCES product_variant(id), qty REAL NOT NULL, delivered_qty REAL NOT NULL DEFAULT 0, invoiced_qty REAL NOT NULL DEFAULT 0, unit_price REAL NOT NULL, subtotal REAL NOT NULL) STRICT;
    CREATE TABLE IF NOT EXISTS sales_delivery (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES sales_order(id), stock_move_id TEXT REFERENCES stock_move(id), state TEXT NOT NULL DEFAULT 'draft', qty REAL NOT NULL DEFAULT 0, packed_at TEXT, shipped_at TEXT, backorder_of TEXT REFERENCES sales_delivery(id), return_of TEXT REFERENCES sales_delivery(id), created_at TEXT NOT NULL, created_by TEXT) STRICT;
    CREATE TABLE IF NOT EXISTS sales_rma (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES sales_order(id), delivery_id TEXT REFERENCES sales_delivery(id), reason TEXT NOT NULL, qty REAL NOT NULL, state TEXT NOT NULL DEFAULT 'requested', replacement_delivery_id TEXT, created_at TEXT NOT NULL, created_by TEXT) STRICT;
    CREATE TABLE IF NOT EXISTS sales_commission (id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES companies(company_id), order_id TEXT NOT NULL REFERENCES sales_order(id), salesperson_id TEXT NOT NULL, basis_amount REAL NOT NULL, rate REAL NOT NULL, amount REAL NOT NULL, state TEXT NOT NULL DEFAULT 'accrued') STRICT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_quote_number ON sales_quote(company_id, quote_number); CREATE UNIQUE INDEX IF NOT EXISTS idx_sales_order_number ON sales_order(company_id, order_number);
  `);
    const partnerColumns = new Set(db.prepare('PRAGMA table_info(partner_master)').all().map((row) => row.name));
    if (!partnerColumns.has('credit_limit')) db.exec('ALTER TABLE partner_master ADD COLUMN credit_limit REAL NOT NULL DEFAULT 0');
    if (!partnerColumns.has('credit_hold')) db.exec('ALTER TABLE partner_master ADD COLUMN credit_hold INTEGER NOT NULL DEFAULT 0');
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS sales_commission; DROP TABLE IF EXISTS sales_rma; DROP TABLE IF EXISTS sales_delivery; DROP TABLE IF EXISTS sales_order_line; DROP TABLE IF EXISTS sales_order; DROP TABLE IF EXISTS sales_quote_line; DROP TABLE IF EXISTS sales_quote; DROP TABLE IF EXISTS sales_lead;');
    rebuildPartnerMasterForR3Rollback(db, ['credit_limit', 'credit_hold']);
  }
};
