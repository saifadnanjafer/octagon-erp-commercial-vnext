// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R5.3 report designer engine. A saved query is DATA (source + filters + group +
// aggregations). Execution compiles it to PARAMETERIZED, company-scoped SQL over
// an ALLOW-LISTED set of queryable sources with per-source column whitelists —
// no user string ever reaches SQL as identifier or literal. The NL bridge (R4.5)
// produces the same query definition, never raw SQL.
'use strict';

const infra = require('../r3-infra');
const { fail } = infra;

// Allow-list: only these sources are queryable, and only their whitelisted
// columns may be selected/grouped/filtered/aggregated. company_id is always
// force-scoped and never client-controlled.
const SOURCES = {
  sales_orders: {
    table: 'sales_order',
    columns: { order_number: 'text', partner_id: 'text', state: 'text', total_amount: 'number', created_at: 'date' },
    dimensions: { month: "substr(created_at,1,7)", partner_id: 'partner_id', state: 'state' },
  },
  ar_documents: {
    table: 'arap_document',
    columns: { document_kind: 'text', partner_id: 'text', total_amount: 'number', currency: 'text', created_at: 'date' },
    dimensions: { month: "substr(created_at,1,7)", partner_id: 'partner_id', kind: 'document_kind' },
  },
  purchase_orders: {
    table: 'purchase_order',
    columns: { order_number: 'text', supplier_id: 'text', state: 'text', total_amount: 'number', created_at: 'date' },
    dimensions: { month: "substr(created_at,1,7)", supplier_id: 'supplier_id', state: 'state' },
  },
  stock_moves: {
    table: 'stock_move',
    columns: { product_id: 'text', qty: 'number', state: 'text', posting_date: 'date' },
    dimensions: { month: "substr(posting_date,1,7)", product_id: 'product_id', state: 'state' },
  },
};
const AGG_FUNCS = new Set(['sum', 'count', 'avg', 'min', 'max']);
const FILTER_OPS = { eq: '=', ne: '!=', gt: '>', lt: '<', gte: '>=', lte: '<=', like: 'LIKE' };

function id() { return `q_${Math.random().toString(36).slice(2, 10)}`; }

function source(name) { const s = SOURCES[name]; if (!s) throw fail(`unknown report source "${name}"`, 400, 'REPORT_SOURCE_UNKNOWN'); return s; }

// Compile a query definition to { sql, params } — always company-scoped, always
// parameterized. Throws on any column/dimension/agg not in the whitelist.
function compileQuery(companyId, def) {
  const s = source(def.source);
  const selectParts = [];
  const groupParts = [];
  const params = [String(companyId)];

  const dims = Array.isArray(def.group_by) ? def.group_by : [];
  for (const dim of dims) {
    const expr = s.dimensions[dim];
    if (!expr) throw fail(`dimension "${dim}" is not allowed for ${def.source}`, 400, 'REPORT_DIMENSION_DENIED');
    selectParts.push(`${expr} AS ${dim}`);
    groupParts.push(expr);
  }
  const aggs = Array.isArray(def.aggregations) ? def.aggregations : [];
  if (!aggs.length && !dims.length) throw fail('a report needs at least one dimension or aggregation', 400, 'REPORT_EMPTY');
  for (const agg of aggs) {
    const fn = String(agg.fn || '').toLowerCase();
    if (!AGG_FUNCS.has(fn)) throw fail(`aggregation "${fn}" is not allowed`, 400, 'REPORT_AGG_DENIED');
    if (fn === 'count') { selectParts.push(`COUNT(*) AS ${aliasFor(agg, 'count')}`); continue; }
    const col = String(agg.column || '');
    if (!s.columns[col] || s.columns[col] !== 'number') throw fail(`column "${col}" is not aggregatable`, 400, 'REPORT_COLUMN_DENIED');
    selectParts.push(`${fn.toUpperCase()}(${col}) AS ${aliasFor(agg, fn)}`);
  }

  const whereParts = ['company_id = ?'];
  for (const filter of (Array.isArray(def.filters) ? def.filters : [])) {
    const col = String(filter.column || '');
    if (!s.columns[col]) throw fail(`filter column "${col}" is not allowed`, 400, 'REPORT_COLUMN_DENIED');
    const op = FILTER_OPS[String(filter.op || 'eq')];
    if (!op) throw fail(`filter operator "${filter.op}" is not allowed`, 400, 'REPORT_OP_DENIED');
    whereParts.push(`${col} ${op} ?`);
    params.push(filter.value);
  }

  let sql = `SELECT ${selectParts.join(', ')} FROM ${s.table} WHERE ${whereParts.join(' AND ')}`;
  if (groupParts.length) sql += ` GROUP BY ${groupParts.join(', ')}`;
  if (def.order_by && s.dimensions[def.order_by]) sql += ` ORDER BY ${def.order_by} ${def.order_dir === 'desc' ? 'DESC' : 'ASC'}`;
  const limit = Math.min(1000, Math.max(1, Number(def.limit || 500)));
  sql += ` LIMIT ${limit}`;
  return { sql, params };
}
function aliasFor(agg, fn) {
  const raw = String(agg.alias || `${fn}_${agg.column || 'all'}`);
  if (!/^[a-z][a-z0-9_]{0,63}$/i.test(raw)) throw fail('invalid aggregation alias', 400, 'REPORT_ALIAS_INVALID');
  return raw;
}

function runQuery(db, companyId, def) {
  infra.ensureCompany(db, companyId);
  const { sql, params } = compileQuery(companyId, def);
  return { columns: (Array.isArray(def.group_by) ? def.group_by : []).concat((def.aggregations || []).map((agg) => aliasFor(agg, String(agg.fn).toLowerCase()))), rows: db.prepare(sql).all(...params), sql_shape: sql.replace(/\?/g, '?') };
}

function saveQuery(db, companyId, def, userId) {
  infra.ensureCompany(db, companyId);
  compileQuery(companyId, def); // validate before persisting
  const row = { id: id(), company_id: companyId, name: String(def.name || 'تقرير'), source: def.source, definition_json: JSON.stringify(def), created_by: userId || null, created_at: new Date().toISOString() };
  db.prepare('INSERT INTO saved_query(id,company_id,name,source,definition_json,created_by,created_at) VALUES(?,?,?,?,?,?,?)').run(row.id, row.company_id, row.name, row.source, row.definition_json, row.created_by, row.created_at);
  return { id: row.id, name: row.name, source: row.source };
}
function runSavedQuery(db, companyId, savedQueryId) {
  const row = db.prepare('SELECT definition_json, company_id FROM saved_query WHERE id=? AND company_id=?').get(savedQueryId, companyId);
  if (!row) throw fail('saved query is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  return runQuery(db, companyId, JSON.parse(row.definition_json));
}

// NL bridge: a natural-language request maps to a query DEFINITION (never SQL).
// Deterministic keyword mapping; unknowns fail closed to a safe default.
function nlToQuery(request) {
  const text = String(request || '').toLowerCase();
  const def = { source: 'sales_orders', group_by: [], aggregations: [{ fn: 'sum', column: 'total_amount', alias: 'total' }], name: request };
  if (text.includes('purchase') || text.includes('مشتريات')) def.source = 'purchase_orders';
  if (text.includes('month') || text.includes('شهر')) def.group_by.push('month');
  if ((text.includes('partner') || text.includes('customer') || text.includes('عميل')) && SOURCES[def.source].dimensions.partner_id) def.group_by.push('partner_id');
  if (text.includes('count') || text.includes('عدد')) def.aggregations = [{ fn: 'count', alias: 'count' }];
  if (!def.group_by.length) def.group_by.push('month');
  return def;
}

module.exports = { SOURCES, compileQuery, runQuery, saveQuery, runSavedQuery, nlToQuery };
