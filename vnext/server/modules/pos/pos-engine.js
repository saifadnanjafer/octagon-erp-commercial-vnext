// clean-room; R6.1 POS v2 domain engine.
// Offline capture is replay-safe and records the sale only. GL is posted by
// the authenticated session close/Z-report, never by an offline browser.
'use strict';

const crypto = require('node:crypto');
const finance = require('../../finance/finance-engine');
const infra = require('../r3-infra');

const { fail, ensureCompany, withImmediateTransaction, recordWrite, publish, tableExists } = infra;

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function money(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}
function payloadHash(value) { return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value || {}))).digest('hex'); }
function parseJson(value, fallback) { try { return JSON.parse(value); } catch (_) { return fallback; } }
function asDate(value) { return String(value || now()).slice(0, 10); }

function accountForCompany(db, accountId, companyId, type) {
  const row = db.prepare('SELECT id, type FROM account WHERE id=? AND company_id=? AND removed=0').get(accountId, companyId);
  if (!row || (type && row.type !== type)) throw fail('POS account is outside company scope or has the wrong type', 403, 'COMPANY_SCOPE_DENIED');
  return row.id;
}

function terminalRow(db, companyId, terminalId) {
  const row = db.prepare('SELECT * FROM pos_terminal_profile WHERE id=? AND company_id=? AND active=1').get(terminalId, companyId);
  if (!row) throw fail('POS terminal is outside company scope or inactive', 403, 'COMPANY_SCOPE_DENIED');
  return row;
}

function sessionRow(db, companyId, sessionId) {
  const row = db.prepare('SELECT * FROM pos_session WHERE id=? AND company_id=?').get(sessionId, companyId);
  if (!row) throw fail('POS session is outside company scope', 403, 'COMPANY_SCOPE_DENIED');
  return row;
}

function normalizeLines(db, companyId, lines) {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > 200) throw fail('POS sale lines are required', 400, 'POS_LINES_REQUIRED');
  return lines.map((line, index) => {
    const productId = String(line.product_id || '').trim();
    const product = db.prepare('SELECT id, name, active FROM product_master WHERE id=? AND company_id=?').get(productId, companyId);
    if (!product || !product.active) throw fail(`POS product line ${index + 1} is outside company scope`, 403, 'COMPANY_SCOPE_DENIED');
    const qty = Number(line.qty);
    const unitPrice = Number(line.unit_price);
    if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice) || unitPrice < 0) throw fail(`POS line ${index + 1} has invalid quantity or price`, 400, 'POS_LINE_INVALID');
    return {
      product_id: product.id,
      qty,
      unit_price: money(unitPrice),
      line_total: money(qty * unitPrice),
      meta_json: JSON.stringify({ combo_id: line.combo_id || null, preset_id: line.preset_id || null }),
    };
  });
}

function createTerminal(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const row = {
    id: String(input.id || id('pos_terminal')),
    company_id: companyId,
    code: String(input.code || '').trim(),
    name: String(input.name || '').trim(),
    cash_account_id: accountForCompany(db, String(input.cash_account_id || 'coa_101000'), companyId, 'liquidity'),
    card_account_id: input.card_account_id ? accountForCompany(db, String(input.card_account_id), companyId, 'liquidity') : null,
    income_account_id: accountForCompany(db, String(input.income_account_id || 'coa_401000'), companyId, 'income'),
    self_order_token: String(input.self_order_token || crypto.randomUUID()),
    active: input.active == null ? 1 : Number(Boolean(input.active)),
    created_at: now(),
    created_by: userId || null,
  };
  if (!row.code || !row.name) throw fail('POS terminal code and name are required', 400, 'POS_TERMINAL_INVALID');
  db.prepare(`INSERT INTO pos_terminal_profile
    (id,company_id,code,name,cash_account_id,card_account_id,income_account_id,self_order_token,active,created_at,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(row.id, row.company_id, row.code, row.name, row.cash_account_id, row.card_account_id, row.income_account_id, row.self_order_token, row.active, row.created_at, row.created_by);
  return row;
}

function listTerminals(db, companyId) {
  ensureCompany(db, companyId);
  return db.prepare(`SELECT id,company_id,code,name,cash_account_id,card_account_id,income_account_id,self_order_token,active,created_at
    FROM pos_terminal_profile WHERE company_id=? ORDER BY code`).all(companyId);
}

function openSession(db, companyId, terminalId, openingCash, cashierId) {
  ensureCompany(db, companyId);
  const terminal = terminalRow(db, companyId, terminalId);
  const existing = db.prepare("SELECT id FROM pos_session WHERE company_id=? AND terminal_id=? AND state='open'").get(companyId, terminal.id);
  if (existing) throw fail('POS terminal already has an open session', 409, 'POS_SESSION_ALREADY_OPEN');
  const opening = Number(openingCash);
  if (!Number.isFinite(opening) || opening < 0) throw fail('opening cash must be a non-negative number', 400, 'POS_CASH_INVALID');
  const row = { id: id('pos_session'), company_id: companyId, terminal_id: terminal.id, cashier_id: String(cashierId), state: 'open', opening_cash: money(opening), opened_at: now(), created_by: String(cashierId) };
  db.prepare(`INSERT INTO pos_session(id,company_id,terminal_id,cashier_id,state,opening_cash,opened_at,created_by)
    VALUES(?,?,?,?,?,?,?,?)`).run(row.id, row.company_id, row.terminal_id, row.cashier_id, row.state, row.opening_cash, row.opened_at, row.created_by);
  recordWrite(db, null, companyId, 'pos_session', row.id, 'open', cashierId, null, row);
  return row;
}

function insertSale(db, context, payload, options = {}) {
  const companyId = String(context.companyId || '');
  const actorId = String(context.userId || options.createdBy || 'system');
  ensureCompany(db, companyId);
  const session = sessionRow(db, companyId, String(payload.session_id || options.sessionId || ''));
  if (session.state !== 'open') throw fail('POS session is closed', 409, 'POS_SESSION_CLOSED');
  const kind = payload.kind === 'refund' ? 'refund' : 'sale';
  const source = options.source || (payload.source === 'offline' ? 'offline' : 'terminal');
  const paymentMethod = String(payload.payment_method || (source === 'self_order' ? 'unpaid' : 'cash'));
  if (!['cash', 'card', 'other', 'unpaid'].includes(paymentMethod)) throw fail('POS payment method is invalid', 400, 'POS_PAYMENT_INVALID');
  const lines = normalizeLines(db, companyId, payload.lines);
  const total = money(lines.reduce((sum, line) => sum + line.line_total, 0));
  if (total <= 0) throw fail('POS sale total must be positive', 400, 'POS_TOTAL_INVALID');
  let original = null;
  if (kind === 'refund') {
    original = db.prepare("SELECT * FROM pos_sale WHERE id=? AND company_id=? AND state='posted' AND kind='sale'").get(String(payload.original_sale_id || ''), companyId);
    if (!original) throw fail('refund must reference a posted sale in the same company', 409, 'POS_ORIGINAL_REQUIRED');
    if (original.session_id !== session.id) throw fail('refund must stay tied to the original POS session', 409, 'POS_SESSION_MISMATCH');
    const already = Number(db.prepare("SELECT COALESCE(SUM(total),0) n FROM pos_sale WHERE original_sale_id=? AND kind='refund' AND state='posted'").get(original.id).n || 0);
    if (already + total > Number(original.total) + 0.0001) throw fail('refund exceeds the original sale total', 409, 'POS_REFUND_EXCEEDS_ORIGINAL');
  }
  const sale = {
    id: String(payload.sale_id || id('pos_sale')),
    company_id: companyId,
    session_id: session.id,
    client_sale_id: String(payload.client_sale_id || saleIdForPayload(payload)),
    source,
    kind,
    state: options.state || 'posted',
    original_sale_id: original ? original.id : null,
    payment_method: paymentMethod,
    total,
    payload_hash: payloadHash(payload),
    sold_at: String(payload.sold_at || now()),
    created_by: actorId,
  };
  const duplicate = db.prepare('SELECT * FROM pos_sale WHERE company_id=? AND client_sale_id=?').get(companyId, sale.client_sale_id);
  if (duplicate) {
    if (duplicate.payload_hash !== sale.payload_hash) throw fail('client sale id was reused with a different payload', 409, 'POS_SALE_CONFLICT');
    return { sale: duplicate, lines: db.prepare('SELECT * FROM pos_sale_line WHERE sale_id=? ORDER BY id').all(duplicate.id), replayed: true };
  }
  db.prepare(`INSERT INTO pos_sale(id,company_id,session_id,client_sale_id,source,kind,state,original_sale_id,payment_method,total,payload_hash,sold_at,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(sale.id, sale.company_id, sale.session_id, sale.client_sale_id, sale.source, sale.kind, sale.state, sale.original_sale_id, sale.payment_method, sale.total, sale.payload_hash, sale.sold_at, sale.created_by);
  const insertLine = db.prepare('INSERT INTO pos_sale_line(id,sale_id,company_id,product_id,qty,unit_price,line_total,meta_json) VALUES(?,?,?,?,?,?,?,?)');
  for (const line of lines) insertLine.run(id('pos_line'), sale.id, companyId, line.product_id, line.qty, line.unit_price, line.line_total, line.meta_json);
  recordWrite(db, null, companyId, 'pos_sale', sale.id, kind === 'refund' ? 'refund' : 'create', actorId, null, sale);
  publish(options.runtime, { type: `pos.sale.${kind}`, companyId, userId: actorId, entity: 'pos_sale', recordId: sale.id, payload: { total: sale.total, sessionId: session.id } });
  return { sale, lines: db.prepare('SELECT * FROM pos_sale_line WHERE sale_id=? ORDER BY id').all(sale.id), replayed: false };
}

function saleIdForPayload(payload) { return `client_${payload.idempotency_key || crypto.randomUUID()}`; }

function syncSale(db, context, payload, options = {}) {
  const key = String(options.idempotencyKey || payload.idempotency_key || '').trim();
  if (!key || key.length > 180) throw fail('POS sale idempotency key is required', 400, 'POS_IDEMPOTENCY_REQUIRED');
  const hash = payloadHash(payload);
  return withImmediateTransaction(db, () => {
    const existing = db.prepare('SELECT * FROM pos_sync_command WHERE idempotency_key=?').get(key);
    if (existing) {
      const same = existing.company_id === String(context.companyId) && existing.tenant_id === String(context.tenantId || context.companyId) && existing.actor_id === String(context.userId) && existing.command_type === 'pos.sale' && existing.payload_hash === hash;
      if (!same) throw fail('POS idempotency key is bound to another actor, scope, or payload', 409, 'IDEMPOTENCY_CONFLICT');
      return { ...parseJson(existing.response_json, {}), replayed: true };
    }
    const result = insertSale(db, context, payload, { source: payload.source === 'offline' ? 'offline' : 'terminal', runtime: options.runtime });
    const response = { success: true, data: result, replayed: false };
    db.prepare(`INSERT INTO pos_sync_command(idempotency_key,company_id,tenant_id,actor_id,command_type,payload_hash,sale_id,response_json,created_at)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(key, String(context.companyId), String(context.tenantId || context.companyId), String(context.userId), 'pos.sale', hash, result.sale.id, JSON.stringify(response), now());
    return response;
  });
}

function postZReport(db, companyId, session, terminal, countedCash, userId) {
  const rows = db.prepare(`SELECT kind,payment_method,total FROM pos_sale WHERE company_id=? AND session_id=? AND state='posted' ORDER BY id`).all(companyId, session.id);
  const totals = { gross: 0, refunds: 0, cash: 0, card: 0, other: 0 };
  for (const row of rows) {
    const signed = row.kind === 'refund' ? -Number(row.total) : Number(row.total);
    if (row.kind === 'refund') totals.refunds += Number(row.total);
    else totals.gross += Number(row.total);
    if (row.payment_method === 'cash') totals.cash += signed;
    else if (row.payment_method === 'card') totals.card += signed;
    else if (row.payment_method !== 'unpaid') totals.other += signed;
  }
  const counted = Number(countedCash);
  if (!Number.isFinite(counted) || counted < 0) throw fail('counted cash must be a non-negative number', 400, 'POS_CASH_INVALID');
  const expectedCash = money(Number(session.opening_cash) + totals.cash);
  const variance = money(counted - expectedCash);
  const paymentAccounts = { cash: terminal.cash_account_id, card: terminal.card_account_id || terminal.cash_account_id, other: terminal.cash_account_id };
  const netByMethod = { cash: money(totals.cash), card: money(totals.card), other: money(totals.other) };
  const lines = [];
  let net = 0;
  for (const method of Object.keys(netByMethod)) {
    const amount = netByMethod[method];
    net += amount;
    if (!amount) continue;
    if (amount > 0) {
      lines.push({ account_id: paymentAccounts[method], debit: amount, credit: 0, description: `POS ${method} Z-report` });
      lines.push({ account_id: terminal.income_account_id, debit: 0, credit: amount, description: 'POS sales income' });
    } else {
      lines.push({ account_id: terminal.income_account_id, debit: -amount, credit: 0, description: 'POS refund income reversal' });
      lines.push({ account_id: paymentAccounts[method], debit: 0, credit: -amount, description: `POS ${method} refund` });
    }
  }
  let fiscalDocId = null;
  if (lines.length) {
    fiscalDocId = id('pos_z_fiscal');
    const createdAt = now();
    db.prepare(`INSERT INTO fiscal_doc(id,company_id,move_type,doc_date,state,currency,created_at,created_by)
      VALUES(?,?,?,?,?,?,?,?)`).run(fiscalDocId, companyId, net >= 0 ? 'cash_receipt' : 'cash_payment', asDate(), 'draft', 'IQD', createdAt, userId);
    const insertLine = db.prepare(`INSERT INTO fiscal_doc_line(id,fiscal_doc_id,company_id,account_id,debit,credit,currency_code,currency_debit,currency_credit,description,created_at,created_by)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    for (const line of lines) insertLine.run(id('pos_z_line'), fiscalDocId, companyId, line.account_id, line.debit, line.credit, 'IQD', line.debit, line.credit, line.description, createdAt, userId);
    finance.postFiscalDoc(db, fiscalDocId, userId);
  }
  const report = { id: id('pos_z'), company_id: companyId, session_id: session.id, gross_sales: money(totals.gross), refunds: money(totals.refunds), cash_sales: money(totals.cash), card_sales: money(totals.card), other_sales: money(totals.other), expected_cash: expectedCash, counted_cash: money(counted), variance, fiscal_doc_id: fiscalDocId, created_at: now(), created_by: userId };
  db.prepare(`INSERT INTO pos_z_report(id,company_id,session_id,gross_sales,refunds,cash_sales,card_sales,other_sales,expected_cash,counted_cash,variance,fiscal_doc_id,created_at,created_by)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(report.id, report.company_id, report.session_id, report.gross_sales, report.refunds, report.cash_sales, report.card_sales, report.other_sales, report.expected_cash, report.counted_cash, report.variance, report.fiscal_doc_id, report.created_at, report.created_by);
  db.prepare(`UPDATE pos_session SET state='closed',closed_cash=?,cash_sales=?,card_sales=?,variance=?,closed_at=?,z_report_id=? WHERE id=? AND company_id=?`).run(report.counted_cash, report.cash_sales, report.card_sales, report.variance, report.created_at, report.id, session.id, companyId);
  recordWrite(db, null, companyId, 'pos_session', session.id, 'close', userId, session, { ...session, state: 'closed', closed_cash: report.counted_cash, variance: report.variance, z_report_id: report.id });
  return { report, fiscal_doc_id: fiscalDocId, fiscal_lines: lines };
}

function closeSession(db, companyId, sessionId, countedCash, userId) {
  return withImmediateTransaction(db, () => {
    const session = sessionRow(db, companyId, sessionId);
    if (session.state !== 'open') throw fail('POS session is already closed', 409, 'POS_SESSION_CLOSED');
    const terminal = terminalRow(db, companyId, session.terminal_id);
    return postZReport(db, companyId, session, terminal, countedCash, userId);
  });
}

function getSession(db, companyId, sessionId) {
  const session = sessionRow(db, companyId, sessionId);
  return { session, sales: db.prepare('SELECT * FROM pos_sale WHERE company_id=? AND session_id=? ORDER BY sold_at,id').all(companyId, sessionId), report: db.prepare('SELECT * FROM pos_z_report WHERE session_id=?').get(sessionId) || null };
}

function selfOrderMenu(db, token) {
  const terminal = db.prepare('SELECT id,company_id,code,name FROM pos_terminal_profile WHERE self_order_token=? AND active=1').get(String(token || ''));
  if (!terminal) throw fail('self-order token is invalid', 404, 'POS_SELF_ORDER_NOT_FOUND');
  return { terminal, products: db.prepare('SELECT id,code,name,barcode FROM product_master WHERE company_id=? AND active=1 ORDER BY name').all(terminal.company_id) };
}

function createSelfOrder(db, token, payload) {
  return withImmediateTransaction(db, () => {
    const menu = selfOrderMenu(db, token);
    const open = db.prepare("SELECT id FROM pos_session WHERE company_id=? AND terminal_id=? AND state='open'").get(menu.terminal.company_id, menu.terminal.id);
    if (!open) throw fail('self-order terminal has no open session', 409, 'POS_SESSION_REQUIRED');
    const context = { companyId: menu.terminal.company_id, tenantId: menu.terminal.company_id, userId: 'public:self-order' };
    return insertSale(db, context, { ...payload, session_id: open.id, client_sale_id: String(payload.client_sale_id || `self_${crypto.randomUUID()}`), source: 'self_order', payment_method: 'unpaid' }, { source: 'self_order', state: 'draft', createdBy: 'public:self-order' });
  });
}

module.exports = {
  createTerminal: infra.atomicCommand(createTerminal),
  listTerminals,
  openSession: infra.atomicCommand(openSession),
  syncSale,
  closeSession,
  getSession,
  selfOrderMenu,
  createSelfOrder,
  _internal: { canonicalize, payloadHash, normalizeLines, insertSale, postZReport },
};
