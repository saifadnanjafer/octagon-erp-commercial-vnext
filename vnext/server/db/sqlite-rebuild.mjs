// clean-room; behavior modeled on the Octagon SQLite migration contract (proprietary self, not copied)
'use strict';

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function rebuildWithoutColumns(db, { table, removedColumns, columnDefinitions }) {
  const tableInfo = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  if (!tableInfo.length) return { table, removed: [], preserved: [] };
  const removed = new Set(removedColumns.map(String));
  const preserved = tableInfo.map((row) => String(row.name)).filter((name) => !removed.has(name));
  const sourceIndexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY name").all(table);
  const indexes = sourceIndexes.filter((row) => ![...removed].some((column) => new RegExp(`\\b${column.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(String(row.sql))));
  const temp = `${table}__rollback_new`;
  db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(temp)};`);
  const createSql = preserved.map((column) => columnDefinitions[column]).join(',\n');
  if (preserved.some((column) => !columnDefinitions[column])) throw new Error(`Rollback schema definition missing for ${table}`);
  db.exec(`CREATE TABLE ${quoteIdentifier(temp)} (${createSql}) STRICT;`);
  const selectSql = preserved.map(quoteIdentifier).join(', ');
  const insertSql = preserved.map(quoteIdentifier).join(', ');
  const placeholders = preserved.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO ${quoteIdentifier(temp)} (${insertSql}) VALUES (${placeholders})`);
  for (const row of db.prepare(`SELECT ${selectSql} FROM ${quoteIdentifier(table)}`).all()) {
    insert.run(...preserved.map((column) => row[column]));
  }
  db.exec(`DROP TABLE ${quoteIdentifier(table)}; ALTER TABLE ${quoteIdentifier(temp)} RENAME TO ${quoteIdentifier(table)};`);
  for (const index of indexes) db.exec(String(index.sql));
  return { table, removed: [...removed].filter((column) => tableInfo.some((row) => row.name === column)), preserved };
}

export function rebuildProductMasterForR3Rollback(db, removedColumns) {
  return rebuildWithoutColumns(db, {
    table: 'product_master',
    removedColumns,
    columnDefinitions: {
      id: 'id TEXT PRIMARY KEY', company_id: 'company_id TEXT NOT NULL REFERENCES companies(company_id)',
      code: 'code TEXT NOT NULL', name: 'name TEXT NOT NULL', income_account_id: 'income_account_id TEXT REFERENCES account(id)',
      expense_account_id: 'expense_account_id TEXT REFERENCES account(id)', active: 'active INTEGER NOT NULL DEFAULT 1',
      created_at: 'created_at TEXT NOT NULL', created_by: 'created_by TEXT',
      category_id: 'category_id TEXT', product_type: "product_type TEXT NOT NULL DEFAULT 'goods'",
      base_uom_id: 'base_uom_id TEXT', stockable: 'stockable INTEGER NOT NULL DEFAULT 1',
      cost_method: "cost_method TEXT NOT NULL DEFAULT 'average'", valuation_category: "valuation_category TEXT NOT NULL DEFAULT 'default'",
      barcode: 'barcode TEXT', variant_mode: "variant_mode TEXT NOT NULL DEFAULT 'none'",
      standard_cost: 'standard_cost REAL NOT NULL DEFAULT 0', tracking_type: "tracking_type TEXT NOT NULL DEFAULT 'none'",
      valuation_method: "valuation_method TEXT NOT NULL DEFAULT 'avco'", weight: 'weight REAL NOT NULL DEFAULT 0', volume: 'volume REAL NOT NULL DEFAULT 0',
      website_published: 'website_published INTEGER NOT NULL DEFAULT 0', website_description: 'website_description TEXT',
      website_image_url: 'website_image_url TEXT', website_price: 'website_price REAL NOT NULL DEFAULT 0.0',
    },
  });
}

export function rebuildPartnerMasterForR3Rollback(db, removedColumns) {
  return rebuildWithoutColumns(db, {
    table: 'partner_master',
    removedColumns,
    columnDefinitions: {
      id: 'id TEXT PRIMARY KEY', company_id: 'company_id TEXT NOT NULL REFERENCES companies(company_id)',
      name: 'name TEXT NOT NULL', partner_type: "partner_type TEXT NOT NULL CHECK(partner_type IN ('customer','supplier','both'))",
      receivable_account_id: 'receivable_account_id TEXT REFERENCES account(id)', payable_account_id: 'payable_account_id TEXT REFERENCES account(id)',
      currency: "currency TEXT NOT NULL DEFAULT 'IQD'", active: 'active INTEGER NOT NULL DEFAULT 1',
      created_at: 'created_at TEXT NOT NULL', created_by: 'created_by TEXT',
      credit_limit: 'credit_limit REAL NOT NULL DEFAULT 0', credit_hold: 'credit_hold INTEGER NOT NULL DEFAULT 0',
    },
  });
}

export function rebuildApprovalsForR3Rollback(db, removedColumns) {
  return rebuildWithoutColumns(db, {
    table: 'x_approvals',
    removedColumns,
    columnDefinitions: {
      id: 'id TEXT PRIMARY KEY', entity: 'entity TEXT', record_id: 'record_id TEXT', action: 'action TEXT',
      payload: 'payload TEXT', requester: 'requester TEXT', approver_role: 'approver_role TEXT',
      status: "status TEXT NOT NULL DEFAULT 'pending'", decided_by: 'decided_by TEXT', decided_at: 'decided_at TEXT',
      cc: 'cc TEXT', created_at: 'created_at TEXT', step_entered_at: 'step_entered_at TEXT',
      escalated: 'escalated INTEGER NOT NULL DEFAULT 0', escalated_at: 'escalated_at TEXT', escalated_from_role: 'escalated_from_role TEXT',
      company_id: "company_id TEXT NOT NULL DEFAULT ''", tenant_id: "tenant_id TEXT NOT NULL DEFAULT ''",
      payload_hash: "payload_hash TEXT NOT NULL DEFAULT ''", requester_id: "requester_id TEXT NOT NULL DEFAULT ''", expires_at: 'expires_at TEXT',
    },
  });
}

export function rebuildHelpdeskTicketSlaForR3Rollback(db, removedColumns) {
  const table = 'helpdesk_ticket_sla';
  const tableInfo = db.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all();
  if (!tableInfo.length) return { table, removed: [], preserved: [] };
  const removed = new Set(removedColumns.map(String));
  const preserved = tableInfo.map((row) => String(row.name)).filter((name) => !removed.has(name));
  const sourceIndexes = db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index' AND tbl_name = ? AND sql IS NOT NULL ORDER BY name").all(table);
  const indexes = sourceIndexes.filter((row) => ![...removed].some((column) => new RegExp(`\\b${column.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\b`, 'i').test(String(row.sql))));
  const definitions = {
    ticket_id: 'ticket_id TEXT NOT NULL REFERENCES helpdesk_ticket(id) ON DELETE CASCADE',
    sla_id: 'sla_id TEXT NOT NULL REFERENCES helpdesk_sla(id)',
    company_id: 'company_id TEXT NOT NULL REFERENCES companies(company_id)',
    response_due: 'response_due TEXT', resolution_due: 'resolution_due TEXT',
    response_at: 'response_at TEXT', resolution_at: 'resolution_at TEXT',
    breached: 'breached INTEGER NOT NULL DEFAULT 0',
    sla_state: "sla_state TEXT NOT NULL DEFAULT 'running'", paused_at: 'paused_at TEXT',
    paused_business_seconds: 'paused_business_seconds REAL NOT NULL DEFAULT 0', last_tick_at: 'last_tick_at TEXT',
  };
  if (!preserved.includes('ticket_id') || !preserved.includes('sla_id')) throw new Error('SLA rollback requires composite key columns');
  if (preserved.some((column) => !definitions[column])) throw new Error(`Rollback schema definition missing for ${table}`);
  const temp = `${table}__rollback_new`;
  db.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(temp)};`);
  const createSql = `${preserved.map((column) => definitions[column]).join(',\n')}, PRIMARY KEY(ticket_id, sla_id)`;
  db.exec(`CREATE TABLE ${quoteIdentifier(temp)} (${createSql}) STRICT;`);
  const quotedColumns = preserved.map(quoteIdentifier).join(', ');
  const placeholders = preserved.map(() => '?').join(', ');
  const insert = db.prepare(`INSERT INTO ${quoteIdentifier(temp)} (${quotedColumns}) VALUES (${placeholders})`);
  for (const row of db.prepare(`SELECT ${quotedColumns} FROM ${quoteIdentifier(table)}`).all()) insert.run(...preserved.map((column) => row[column]));
  db.exec(`DROP TABLE ${quoteIdentifier(table)}; ALTER TABLE ${quoteIdentifier(temp)} RENAME TO ${quoteIdentifier(table)};`);
  for (const index of indexes) db.exec(String(index.sql));
  return { table, removed: [...removed].filter((column) => tableInfo.some((row) => row.name === column)), preserved };
}
