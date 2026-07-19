// R3.6 subcontract supplied-component valuation contract:
// Finished Value = Consumed Supplied Components + Service Cost + Authorized Variance + Applicable Landed Cost.
'use strict';

const ISSUE_COLUMNS = [
  ['unit_cost', 'REAL NOT NULL DEFAULT 0'],
  ['value', 'REAL NOT NULL DEFAULT 0'],
];
const RECEIPT_COLUMNS = [
  ['consumed_value', 'REAL NOT NULL DEFAULT 0'],
  ['landed_value', 'REAL NOT NULL DEFAULT 0'],
  ['total_value', 'REAL NOT NULL DEFAULT 0'],
  ['unit_value', 'REAL NOT NULL DEFAULT 0'],
  ['service_bill_id', 'TEXT'],
  ['variance_doc_id', 'TEXT'],
  ['state', "TEXT NOT NULL DEFAULT 'received'"],
  ['reversed_at', 'TEXT'],
  ['reversal_move_id', 'TEXT'],
];

function addColumns(db, table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  for (const [name, definition] of columns) {
    if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
  }
}
function dropColumns(db, table, columns) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((row) => row.name));
  for (const [name] of columns) {
    if (existing.has(name)) db.exec(`ALTER TABLE ${table} DROP COLUMN ${name}`);
  }
}

export const migration = {
  id: '621_r3_subcontract_valuation',
  dependsOn: ['620_r3_sla_business_clock'],
  up(db) {
    addColumns(db, 'subcontract_issue', ISSUE_COLUMNS);
    addColumns(db, 'subcontract_receipt', RECEIPT_COLUMNS);
    db.exec(`
      CREATE TABLE IF NOT EXISTS subcontract_adjustment (
        id TEXT PRIMARY KEY,
        company_id TEXT NOT NULL REFERENCES companies(company_id),
        order_id TEXT NOT NULL REFERENCES subcontract_order(id),
        product_id TEXT NOT NULL REFERENCES product_master(id),
        kind TEXT NOT NULL CHECK (kind IN ('return_unused','shortage','scrap')),
        qty REAL NOT NULL,
        unit_cost REAL NOT NULL DEFAULT 0,
        value REAL NOT NULL DEFAULT 0,
        stock_move_id TEXT REFERENCES stock_move(id),
        note TEXT,
        created_at TEXT NOT NULL,
        created_by TEXT
      ) STRICT;
      CREATE INDEX IF NOT EXISTS idx_subcontract_adjustment_order ON subcontract_adjustment(company_id, order_id);
    `);
  },
  down(db) {
    db.exec('DROP TABLE IF EXISTS subcontract_adjustment;');
    dropColumns(db, 'subcontract_receipt', RECEIPT_COLUMNS);
    dropColumns(db, 'subcontract_issue', ISSUE_COLUMNS);
  },
};
