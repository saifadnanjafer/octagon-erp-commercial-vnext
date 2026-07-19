// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const { getTrialBalance, getGeneralLedger, getDimensionPnLReport } = require('./finance-engine');
const { documentOpenAmount, listArap } = require('./arap-engine');
const { getTaxReport } = require('./tax-engine');

function range(options = {}) { return { startDate: options.start_date || options.startDate || null, endDate: options.end_date || options.endDate || null }; }
function whereDates(alias, options, params) { let sql = ''; if (options.startDate) { sql += ` AND ${alias}.posting_date >= ?`; params.push(options.startDate); } if (options.endDate) { sql += ` AND ${alias}.posting_date <= ?`; params.push(options.endDate); } return sql; }

function trialBalance(db, companyId, options) { return getTrialBalance(db, companyId, range(options)); }

function generalLedger(db, companyId, options) {
  const accountId = options.account_id;
  if (!accountId) throw new Error('account_id is required');
  return getGeneralLedger(db, companyId, accountId, range(options));
}

function profitLoss(db, companyId, options = {}) {
  const params = [companyId]; const dates = whereDates('g', range(options), params);
  const rows = db.prepare(`SELECT g.account_id, a.code account_code, a.name account_name, a.type, SUM(g.debit) debit, SUM(g.credit) credit
    FROM gl_line g JOIN account a ON a.id=g.account_id WHERE g.company_id=? AND a.type IN ('income','expense')${dates} GROUP BY g.account_id ORDER BY a.code`).all(...params);
  return { rows, totals: { income: rows.filter(r => r.type === 'income').reduce((s, r) => s + Number(r.credit) - Number(r.debit), 0), expense: rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.debit) - Number(r.credit), 0) } };
}

function balanceSheet(db, companyId, options = {}) {
  const params = [companyId]; const dates = whereDates('g', range(options), params);
  const rows = db.prepare(`SELECT g.account_id, a.code account_code, a.name account_name, a.type, SUM(g.debit-g.credit) balance
    FROM gl_line g JOIN account a ON a.id=g.account_id WHERE g.company_id=? AND a.type IN ('asset','liability','equity','receivable','payable','liquidity','income','expense')${dates} GROUP BY g.account_id ORDER BY a.code`).all(...params);
  const assets = rows.filter(r => ['asset','receivable','liquidity'].includes(r.type)).reduce((s, r) => s + Number(r.balance), 0);
  const liabilities = rows.filter(r => ['liability','payable'].includes(r.type)).reduce((s, r) => s - Number(r.balance), 0);
  const equity = rows.filter(r => r.type === 'equity').reduce((s, r) => s - Number(r.balance), 0);
  const current_result = rows.filter(r => r.type === 'income').reduce((s, r) => s - Number(r.balance), 0) - rows.filter(r => r.type === 'expense').reduce((s, r) => s + Number(r.balance), 0);
  return { rows, totals: { assets, liabilities, equity, current_result, liabilities_plus_equity: liabilities + equity + current_result, balanced: Math.abs(assets - liabilities - equity - current_result) < 0.0001 } };
}

function cashFlow(db, companyId, options = {}) {
  const params = [companyId]; const dates = whereDates('g', range(options), params);
  const rows = db.prepare(`SELECT g.account_id, a.code account_code, a.name account_name, SUM(g.debit-g.credit) net_change
    FROM gl_line g JOIN account a ON a.id=g.account_id WHERE g.company_id=? AND a.type='liquidity'${dates} GROUP BY g.account_id ORDER BY a.code`).all(...params);
  return { rows, net_change: rows.reduce((s, r) => s + Number(r.net_change), 0), method: 'indirect-ledger-derived' };
}

function partnerLedger(db, companyId, options = {}) {
  const params = [companyId]; const dates = whereDates('g', range(options), params);
  const partner = options.partner_id ? ' AND f.partner_id = ?' : '';
  if (options.partner_id) params.push(options.partner_id);
  return db.prepare(`SELECT f.partner_id, f.id fiscal_doc_id, f.doc_number, f.doc_date, f.move_type, l.account_id, l.debit, l.credit, l.debit-l.credit net
    FROM gl_line l JOIN fiscal_doc f ON f.id=l.fiscal_doc_id WHERE l.company_id=? AND f.partner_id IS NOT NULL${dates}${partner} ORDER BY f.doc_date, f.doc_number, l.id`).all(...params);
}

function aging(db, companyId, kind, options = {}) {
  const asOf = options.as_of || options.end_date || new Date().toISOString().slice(0, 10);
  const docs = listArap(db, companyId, kind, options.partner_id).filter(d => d.state === 'posted' && d.open_amount > 0);
  const buckets = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0 };
  const rows = docs.map(d => {
    const days = Math.floor((new Date(asOf) - new Date(d.due_date)) / 86400000);
    const bucket = days <= 0 ? 'current' : days <= 30 ? 'days_1_30' : days <= 60 ? 'days_31_60' : days <= 90 ? 'days_61_90' : 'over_90';
    buckets[bucket] += Number(d.open_amount);
    return { ...d, days_overdue: Math.max(0, days), bucket };
  });
  return { as_of: asOf, kind, buckets, total_open: Object.values(buckets).reduce((s, n) => s + n, 0), rows };
}

function tax(db, companyId, options = {}) { return getTaxReport(db, companyId, options.start_date || '0000-01-01', options.end_date || '9999-12-31'); }

function dimensionPnl(db, companyId, options = {}) {
  const dimensionId = options.dimension_id;
  if (!dimensionId) throw new Error('dimension_id is required');
  const result = getDimensionPnLReport(db, companyId, dimensionId, range(options));
  const valueIds = new Set(result.columns.map(column => column.id));
  const rows = result.rows.filter(row => [...valueIds].some(valueId => Math.abs(Number(row[valueId] || 0)) > 0.0001));
  return { dimension_id: dimensionId, columns: result.columns, rows, total: rows.reduce((sum, row) => sum + Number(row.total || 0), 0) };
}

function report(db, companyId, type, options = {}) {
  switch (type) {
    case 'trial_balance': return trialBalance(db, companyId, options);
    case 'general_ledger': return generalLedger(db, companyId, options);
    case 'profit_loss': return profitLoss(db, companyId, options);
    case 'balance_sheet': return balanceSheet(db, companyId, options);
    case 'cash_flow': return cashFlow(db, companyId, options);
    case 'partner_ledger': return partnerLedger(db, companyId, options);
    case 'ar_aging': return aging(db, companyId, 'customer_invoice', options);
    case 'ap_aging': return aging(db, companyId, 'supplier_bill', options);
    case 'tax': return tax(db, companyId, options);
    case 'dimension_pnl': return dimensionPnl(db, companyId, options);
    default: throw new Error('unsupported report type');
  }
}

function csv(value) {
  const rows = Array.isArray(value) ? value : (value && Array.isArray(value.rows) ? value.rows : [value]);
  if (!rows.length) return '';
  const columns = [...new Set(rows.flatMap(r => Object.keys(r || {})))];
  const quote = v => `"${String(v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : v).replace(/"/g, '""')}"`;
  return [columns.join(','), ...rows.map(r => columns.map(c => quote(r[c])).join(','))].join('\n');
}

module.exports = { report, csv, trialBalance, generalLedger, profitLoss, balanceSheet, cashFlow, partnerLedger, aging, tax, dimensionPnl };
