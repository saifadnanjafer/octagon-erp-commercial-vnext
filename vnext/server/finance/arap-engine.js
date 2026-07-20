// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const { postFiscalDoc, reverseFiscalDoc } = require('./finance-engine');

const DOC_TYPES = new Set(['customer_invoice', 'customer_credit_note', 'supplier_bill', 'supplier_debit_note']);
const CONTROL = { customer: 'coa_103000', supplier: 'coa_201000' };

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function money(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }
function fail(message, statusCode = 400) { const e = new Error(message); e.statusCode = statusCode; return e; }
function direction(kind) { return kind.startsWith('customer') ? 'customer' : 'supplier'; }
function isCredit(kind) { return kind === 'customer_credit_note' || kind === 'supplier_debit_note'; }

function ensureCompany(db, companyId) {
  if (!db.prepare('SELECT 1 FROM companies WHERE company_id = ?').get(companyId)) throw fail('company scope is invalid', 403);
}

function createPartner(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const partnerId = String(input.id || id('partner'));
  const kind = input.partner_type || 'both';
  if (!['customer', 'supplier', 'both'].includes(kind)) throw fail('partner_type is invalid');
  db.prepare(`INSERT INTO partner_master(id,company_id,name,partner_type,receivable_account_id,payable_account_id,currency,created_at,created_by)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(partnerId, companyId, String(input.name || '').trim(), kind,
    input.receivable_account_id || CONTROL.customer, input.payable_account_id || CONTROL.supplier,
    input.currency || 'IQD', now(), userId || 'system');
  return db.prepare('SELECT * FROM partner_master WHERE id = ?').get(partnerId);
}

function createProduct(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const productId = String(input.id || id('product'));
  db.prepare(`INSERT INTO product_master(id,company_id,code,name,income_account_id,expense_account_id,created_at,created_by)
    VALUES(?,?,?,?,?,?,?,?)`).run(productId, companyId, String(input.code || productId), String(input.name || '').trim(),
    input.income_account_id || 'coa_401000', input.expense_account_id || 'coa_501000', now(), userId || 'system');
  return db.prepare('SELECT * FROM product_master WHERE id = ?').get(productId);
}

function createArapDocument(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const kind = String(input.document_kind || '').trim();
  if (!DOC_TYPES.has(kind)) throw fail('document_kind is invalid');
  const partnerId = String(input.partner_id || '');
  const partner = db.prepare('SELECT * FROM partner_master WHERE id = ? AND company_id = ? AND active = 1').get(partnerId, companyId);
  if (!partner) throw fail('partner is missing or outside company scope', 403);
  const currency = String(input.currency || partner.currency || 'IQD');
  if (currency !== partner.currency && !input.fx_rate) throw fail('currency mismatch requires an explicit fx_rate');
  const items = Array.isArray(input.lines) ? input.lines : [];
  if (!items.length) throw fail('at least one document line is required');
  const docId = String(input.id || id('fiscal'));
  const arapId = id('arap');
  const fiscalType = kind.startsWith('customer') ? (isCredit(kind) ? 'sales_refund' : 'sales_invoice') : (isCredit(kind) ? 'purchase_refund' : 'purchase_invoice');
  const date = String(input.doc_date || new Date().toISOString().slice(0, 10));
  const dueDate = String(input.due_date || date);
  let total = 0;
  const fxRate = currency === 'IQD' ? 1 : Number(input.fx_rate);
  if (!(fxRate > 0)) throw fail('foreign-currency documents require a positive fx_rate');
  const prepared = items.map((line) => {
    const qty = Number(line.quantity == null ? 1 : line.quantity);
    const price = Number(line.price_unit == null ? line.amount : line.price_unit);
    if (!(qty > 0) || !(price >= 0)) throw fail('line quantity and price must be valid');
    const amount = money(qty * price);
    total += amount;
    const product = line.product_id ? db.prepare('SELECT * FROM product_master WHERE id = ? AND company_id = ? AND active = 1').get(line.product_id, companyId) : null;
    const accountId = line.account_id || (product ? (kind.startsWith('customer') ? product.income_account_id : product.expense_account_id) : (kind.startsWith('customer') ? 'coa_401000' : 'coa_501000'));
    return { amount, localAmount: money(amount * fxRate), quantity: qty, priceUnit: price, accountId, description: line.description || (product && product.name) || 'AR/AP line', productId: line.product_id || null, dims: line.dims || null, taxRefs: line.tax_refs || null };
  });
  total = money(total);
  const localTotal = money(prepared.reduce((sum, line) => sum + line.localAmount, 0));
  const controlId = kind.startsWith('customer') ? (partner.receivable_account_id || CONTROL.customer) : (partner.payable_account_id || CONTROL.supplier);
  const stamp = now();
  const run = db.prepare;
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    run.call(db, `INSERT INTO fiscal_doc(id,company_id,move_type,partner_id,doc_date,state,currency,created_at,created_by) VALUES(?,?,?,?,?,'draft',?,?,?)`)
      .run(docId, companyId, fiscalType, partnerId, date, currency, stamp, userId || 'system');
    run.call(db, `INSERT INTO arap_document(id,fiscal_doc_id,company_id,partner_id,document_kind,due_date,total_amount,currency,reversal_of_id,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)`)
      .run(arapId, docId, companyId, partnerId, kind, dueDate, total, currency, input.reversal_of_id || null, stamp, userId || 'system');
    const insert = run.call(db, `INSERT INTO fiscal_doc_line(id,fiscal_doc_id,company_id,account_id,debit,credit,currency_code,currency_debit,currency_credit,tax_refs,dims,snapshot,description,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    const creditDoc = isCredit(kind);
    for (const line of prepared) {
      const lineIsDebit = kind.startsWith('customer') ? creditDoc : !creditDoc;
      const debit = lineIsDebit ? line.localAmount : 0;
      const credit = lineIsDebit ? 0 : line.localAmount;
      insert.run(id('line'), docId, companyId, line.accountId, debit, credit, currency, lineIsDebit ? line.amount : 0, lineIsDebit ? 0 : line.amount, line.taxRefs, line.dims ? JSON.stringify(line.dims) : null,
        JSON.stringify({ product_id: line.productId, quantity: line.quantity, price_unit: line.priceUnit, fx_rate: fxRate }), line.description, stamp, userId || 'system');
    }
    const controlDebit = kind.startsWith('customer') ? (creditDoc ? 0 : localTotal) : (creditDoc ? localTotal : 0);
    const controlCredit = kind.startsWith('customer') ? (creditDoc ? localTotal : 0) : (creditDoc ? 0 : localTotal);
    insert.run(id('line'), docId, companyId, controlId, controlDebit, controlCredit, currency, kind.startsWith('customer') && !creditDoc ? total : (kind.startsWith('customer') && creditDoc ? 0 : (!kind.startsWith('customer') && creditDoc ? total : 0)), kind.startsWith('customer') && creditDoc ? total : (!kind.startsWith('customer') && !creditDoc ? total : 0), null, null, null, 'AR/AP control', stamp, userId || 'system');
    if (owns) db.exec('COMMIT');
    return { id: arapId, fiscal_doc_id: docId, document_kind: kind, total_amount: total, state: 'draft' };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function documentOpenAmount(db, arapId) {
  const doc = db.prepare(`SELECT a.*, f.state, f.doc_number, f.doc_date FROM arap_document a JOIN fiscal_doc f ON f.id = a.fiscal_doc_id WHERE a.id = ?`).get(arapId);
  if (!doc) throw fail('AR/AP document not found', 404);

  const allocated = db.prepare(`SELECT COALESCE(SUM(pa.amount),0) amount FROM payment_allocation pa JOIN payment p ON p.id=pa.payment_id WHERE pa.arap_document_id=? AND p.status='posted'`).get(arapId).amount;
  
  const creditNotesTotal = db.prepare(`
    SELECT COALESCE(SUM(a.total_amount), 0) AS total
    FROM arap_document a
    JOIN fiscal_doc f ON f.id = a.fiscal_doc_id
    WHERE a.reversal_of_id = ? AND f.state = 'posted'
  `).get(arapId).total;

  let signed = Math.max(0, money(Number(doc.total_amount) - Number(allocated) - Number(creditNotesTotal)));
  
  if (doc.document_kind === 'customer_credit_note' && doc.reversal_of_id) {
    const parentHasPayments = db.prepare(`
      SELECT 1 FROM payment_allocation pa
      JOIN payment p ON p.id = pa.payment_id
      WHERE pa.arap_document_id = ? AND p.status = 'posted'
    `).get(doc.reversal_of_id);
    if (!parentHasPayments) {
      signed = 0;
    }
  }

  return { ...doc, allocated_amount: money(Number(allocated) + Number(creditNotesTotal)), open_amount: signed, payment_state: signed <= 0 ? (signed < 0 ? 'overpaid' : 'paid') : (Number(allocated) + Number(creditNotesTotal) > 0 ? 'partial' : 'open') };
}

function postArapDocument(db, arapId, userId) {
  const doc = db.prepare('SELECT fiscal_doc_id FROM arap_document WHERE id = ?').get(arapId);
  if (!doc) throw fail('AR/AP document not found', 404);
  return { ...postFiscalDoc(db, doc.fiscal_doc_id, userId), ...documentOpenAmount(db, arapId) };
}

function createPayment(db, companyId, input, userId) {
  ensureCompany(db, companyId);
  const partner = db.prepare('SELECT * FROM partner_master WHERE id = ? AND company_id = ? AND active = 1').get(input.partner_id, companyId);
  if (!partner) throw fail('partner is missing or outside company scope', 403);
  const amount = money(input.amount);
  if (!(amount > 0)) throw fail('payment amount must be positive');
  const key = String(input.idempotency_key || '').trim();
  if (!key) throw fail('idempotency_key is required');
  const existing = db.prepare('SELECT * FROM payment WHERE idempotency_key = ?').get(key);
  if (existing) return { ...existing, replayed: true, allocations: db.prepare('SELECT * FROM payment_allocation WHERE payment_id = ?').all(existing.id) };
  const type = input.payment_type === 'pay' ? 'pay' : 'receive';
  const currency = String(input.currency || partner.currency || 'IQD');
  if (currency !== partner.currency && !input.fx_rate) throw fail('currency mismatch requires an explicit fx_rate');
  const fxRate = currency === 'IQD' ? 1 : Number(input.fx_rate);
  if (!(fxRate > 0)) throw fail('foreign-currency payments require a positive fx_rate');
  const paymentId = String(input.id || id('payment'));
  const fiscalId = id('fiscal');
  const date = String(input.payment_date || new Date().toISOString().slice(0, 10));
  const stamp = now();
  const cashAccount = String(input.account_id || 'coa_101000');
  const control = input.control_account_id || (type === 'receive' ? (partner.receivable_account_id || CONTROL.customer) : (partner.payable_account_id || CONTROL.supplier));
  const allocations = Array.isArray(input.allocations) ? input.allocations : [];
  const targets = allocations.map((allocation) => {
    const value = money(allocation.amount);
    const target = documentOpenAmount(db, String(allocation.arap_document_id || allocation.document_id || ''));
    if (target.company_id !== companyId || target.currency !== currency) throw fail('allocation company or currency mismatch', 409);
    if (target.state !== 'posted') throw fail('only posted documents can be allocated', 409);
    if (value <= 0 || value > target.open_amount + 0.0001) throw fail('allocation exceeds open amount', 409);
    return { value, target };
  });
  if (money(targets.reduce((sum, item) => sum + item.value, 0)) > amount + 0.0001) throw fail('allocations exceed payment amount', 409);
  const paymentLocal = money(amount * fxRate);
  const allocatedForeign = money(targets.reduce((sum, item) => sum + item.value, 0));
  const allocatedLocalAtPaymentRate = money(allocatedForeign * fxRate);
  const targetBookValue = money(targets.reduce((sum, item) => {
    const control = item.target.document_kind.startsWith('customer') ? (partner.receivable_account_id || CONTROL.customer) : (partner.payable_account_id || CONTROL.supplier);
    const row = db.prepare('SELECT COALESCE(SUM(debit + credit), 0) value FROM fiscal_doc_line WHERE fiscal_doc_id=? AND account_id=?').get(item.target.fiscal_doc_id, control);
    return sum + (Number(row.value) * (item.value / Number(item.target.total_amount || 1)));
  }, 0));
  const unappliedLocal = money((amount - allocatedForeign) * fxRate);
  const fxDelta = money(allocatedLocalAtPaymentRate - targetBookValue);
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`INSERT INTO fiscal_doc(id,company_id,move_type,partner_id,doc_date,state,currency,created_at,created_by) VALUES(?,?,?,?,?,'draft',?,?,?)`).run(fiscalId, companyId, type === 'receive' ? 'cash_receipt' : 'cash_payment', partner.id, date, currency, stamp, userId || 'system');
    const payment = db.prepare(`INSERT INTO payment(id,fiscal_doc_id,company_id,partner_id,payment_type,payment_date,amount,currency,account_id,status,idempotency_key,reference,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,'draft',?,?,?,?)`);
    payment.run(paymentId, fiscalId, companyId, partner.id, type, date, amount, currency, cashAccount, key, input.reference || null, stamp, userId || 'system');
    const insert = db.prepare(`INSERT INTO fiscal_doc_line(id,fiscal_doc_id,company_id,account_id,debit,credit,currency_code,currency_debit,currency_credit,description,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
    if (type === 'receive') {
      insert.run(id('line'), fiscalId, companyId, cashAccount, paymentLocal, 0, currency, amount, 0, 'Payment received', stamp, userId || 'system');
      insert.run(id('line'), fiscalId, companyId, control, 0, money(targetBookValue + unappliedLocal), currency, allocatedForeign ? 0 : 0, money(allocatedForeign + (amount - allocatedForeign)), 'Receivable settlement / unapplied', stamp, userId || 'system');
      if (fxDelta > 0) insert.run(id('line'), fiscalId, companyId, 'coa_401000', 0, fxDelta, null, 0, 0, 'Foreign-exchange gain', stamp, userId || 'system');
      if (fxDelta < 0) insert.run(id('line'), fiscalId, companyId, 'coa_502000', money(-fxDelta), 0, null, 0, 0, 'Foreign-exchange loss', stamp, userId || 'system');
    } else {
      insert.run(id('line'), fiscalId, companyId, control, money(targetBookValue + unappliedLocal), 0, currency, money(allocatedForeign + (amount - allocatedForeign)), 0, 'Payable settlement / unapplied', stamp, userId || 'system');
      insert.run(id('line'), fiscalId, companyId, cashAccount, 0, paymentLocal, currency, 0, amount, 'Payment sent', stamp, userId || 'system');
      if (fxDelta > 0) insert.run(id('line'), fiscalId, companyId, 'coa_502000', fxDelta, 0, null, 0, 0, 'Foreign-exchange loss', stamp, userId || 'system');
      if (fxDelta < 0) insert.run(id('line'), fiscalId, companyId, 'coa_401000', 0, money(-fxDelta), null, 0, 0, 'Foreign-exchange gain', stamp, userId || 'system');
    }
    postFiscalDoc(db, fiscalId, userId || 'system');
    db.prepare('UPDATE payment SET status = ? WHERE id = ?').run('posted', paymentId);
    let allocated = 0;
    const insertAllocation = db.prepare('INSERT INTO payment_allocation(id,payment_id,arap_document_id,company_id,amount,currency,created_at,created_by) VALUES(?,?,?,?,?,?,?,?)');
    for (const { value, target } of targets) {
      allocated += value;
      insertAllocation.run(id('alloc'), paymentId, target.id, companyId, value, currency, stamp, userId || 'system');
    }
    if (owns) db.exec('COMMIT');
    return { id: paymentId, fiscal_doc_id: fiscalId, status: 'posted', amount, allocated_amount: allocated, unapplied_amount: money(amount - allocated), payment_state: allocated >= amount ? 'allocated' : 'unapplied' };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function reversePayment(db, paymentId, userId) {
  const payment = db.prepare('SELECT * FROM payment WHERE id = ?').get(paymentId);
  if (!payment) throw fail('payment not found', 404);
  if (payment.status !== 'posted') throw fail('only posted payments can be reversed', 409);
  const result = reverseFiscalDoc(db, payment.fiscal_doc_id, userId);
  db.prepare('UPDATE payment SET status = ? WHERE id = ?').run('cancelled', paymentId);
  return { payment_id: paymentId, ...result };
}

function listArap(db, companyId, kind, partnerId) {
  const rows = db.prepare(`SELECT a.id, a.fiscal_doc_id, a.company_id, a.partner_id, a.document_kind, a.due_date, a.total_amount, a.currency, f.state, f.doc_number, f.doc_date
    FROM arap_document a JOIN fiscal_doc f ON f.id=a.fiscal_doc_id WHERE a.company_id=? ${kind ? 'AND a.document_kind=?' : ''} ${partnerId ? `AND a.partner_id=?` : ''} ORDER BY a.due_date, a.id`).all(...[companyId, ...(kind ? [kind] : []), ...(partnerId ? [partnerId] : [])]);
  return rows.map(row => documentOpenAmount(db, row.id));
}

module.exports = { createPartner, createProduct, createArapDocument, postArapDocument, documentOpenAmount, createPayment, reversePayment, listArap, money, fail };
