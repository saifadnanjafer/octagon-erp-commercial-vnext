// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const { createPayment, fail, money } = require('./arap-engine');
const { postFiscalDoc } = require('./finance-engine');

function id(prefix) { return `${prefix}_${crypto.randomUUID()}`; }
function now() { return new Date().toISOString(); }
function hashLine(companyId, line) { return crypto.createHash('sha256').update(JSON.stringify([companyId, line.external_id || '', line.transaction_date, money(line.amount), line.currency || 'IQD', line.description || ''])).digest('hex'); }

function createBankAccount(db, companyId, input, userId) {
  const account = db.prepare('SELECT 1 FROM account WHERE id = ? AND company_id = ?').get(input.account_id, companyId);
  if (!account) throw fail('bank GL account is outside company scope', 403);
  const bankId = String(input.id || id('bank'));
  db.prepare('INSERT INTO bank_account(id,company_id,name,account_id,currency,created_at,created_by) VALUES(?,?,?,?,?,?,?)').run(bankId, companyId, String(input.name || 'Bank account'), input.account_id, input.currency || 'IQD', now(), userId || 'system');
  return db.prepare('SELECT * FROM bank_account WHERE id = ?').get(bankId);
}

function createMatchRule(db, companyId, input, userId) {
  const ruleId = String(input.id || id('bankrule'));
  if (!String(input.name || '').trim()) throw fail('match rule name is required');
  if (input.target_account_id && !db.prepare('SELECT 1 FROM account WHERE id=? AND company_id=?').get(input.target_account_id, companyId)) throw fail('match rule target account is outside company scope', 403);
  db.prepare(`INSERT INTO bank_match_rule(id,company_id,name,description_pattern,amount_tolerance,target_account_id,created_at,created_by)
    VALUES(?,?,?,?,?,?,?,?)`).run(ruleId, companyId, String(input.name).trim(), input.description_pattern || null, Number(input.amount_tolerance || 0), input.target_account_id || null, now(), userId || 'system');
  return db.prepare('SELECT * FROM bank_match_rule WHERE id=?').get(ruleId);
}

function listMatchRules(db, companyId) { return db.prepare('SELECT * FROM bank_match_rule WHERE company_id=? AND active=1 ORDER BY id').all(companyId); }

function importStatement(db, companyId, input, userId) {
  const bank = db.prepare('SELECT * FROM bank_account WHERE id = ? AND company_id = ? AND active = 1').get(input.bank_account_id, companyId);
  if (!bank) throw fail('bank account is missing or outside company scope', 403);
  const key = String(input.import_key || '').trim();
  if (!key) throw fail('import_key is required');
  const existing = db.prepare('SELECT * FROM bank_statement WHERE import_key = ?').get(key);
  if (existing) return { ...existing, duplicate: true, lines: db.prepare('SELECT * FROM bank_statement_line WHERE statement_id = ? ORDER BY line_number').all(existing.id) };
  const lines = Array.isArray(input.lines) ? input.lines : [];
  const statementId = String(input.id || id('statement'));
  const stamp = now();
  const owns = !db.isTransaction;
  if (owns) db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO bank_statement(id,company_id,bank_account_id,statement_date,opening_balance,closing_balance,import_key,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(statementId, companyId, bank.id, input.statement_date || new Date().toISOString().slice(0, 10), Number(input.opening_balance || 0), input.closing_balance == null ? null : Number(input.closing_balance), key, stamp, userId || 'system');
    const insert = db.prepare('INSERT INTO bank_statement_line(id,statement_id,company_id,line_number,transaction_date,amount,currency,description,external_id,line_hash,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)');
    let number = 0;
    for (const line of lines) {
      number += 1;
      const lineHash = hashLine(companyId, line);
      if (db.prepare('SELECT 1 FROM bank_statement_line WHERE company_id=? AND line_hash=?').get(companyId, lineHash)) throw fail('duplicate statement line import', 409);
      insert.run(String(line.id || id('bankline')), statementId, companyId, number, line.transaction_date || input.statement_date, Number(line.amount), line.currency || bank.currency, line.description || '', line.external_id || null, lineHash, stamp);
    }
    if (owns) db.exec('COMMIT');
    return { id: statementId, imported: lines.length, duplicate: false };
  } catch (error) {
    if (owns) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }
}

function activeReconciled(db, lineId) {
  return db.prepare("SELECT * FROM bank_reconciliation WHERE statement_line_id = ? AND status = 'reconciled'").all(lineId);
}

function matchBankLine(db, companyId, lineId, input = {}, userId) {
  const line = db.prepare('SELECT * FROM bank_statement_line WHERE id = ? AND company_id = ?').get(lineId, companyId);
  if (!line) throw fail('statement line is missing or outside company scope', 403);
  if (activeReconciled(db, lineId).length) throw fail('statement line is already reconciled', 409);
  const rule = input.rule_id ? db.prepare('SELECT * FROM bank_match_rule WHERE id=? AND company_id=? AND active=1').get(input.rule_id, companyId) : null;
  if (input.rule_id && !rule) throw fail('match rule is missing or outside company scope', 403);
  const tolerance = Number(input.tolerance == null ? (rule?.amount_tolerance || 0) : input.tolerance);
  const description = String(line.description || '').toLowerCase();
  if (rule?.description_pattern && !description.includes(String(rule.description_pattern).toLowerCase())) return { matched: false, rule_id: rule.id, candidates: 0 };
  const candidates = db.prepare(`SELECT p.*, COALESCE(SUM(pa.amount),0) allocated FROM payment p LEFT JOIN payment_allocation pa ON pa.payment_id=p.id
    WHERE p.company_id=? AND p.status='posted' AND p.currency=? GROUP BY p.id ORDER BY p.payment_date, p.id`).all(companyId, line.currency);
  const target = candidates.find(p => Math.abs(Number(p.amount) - Math.abs(Number(line.amount))) <= tolerance && (!input.payment_id || p.id === input.payment_id));
  if (!target) return { matched: false, candidates: candidates.length };
  const reconciledAmount = money(Math.min(Math.abs(Number(line.amount)), Number(target.amount)));
  const recId = id('bankrec');
  db.prepare('INSERT INTO bank_reconciliation(id,statement_line_id,company_id,target_type,target_id,amount,method,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(recId, lineId, companyId, 'payment', target.id, reconciledAmount, tolerance ? 'tolerance' : 'exact', now(), userId || 'system');
  db.prepare("UPDATE bank_statement_line SET status='reconciled' WHERE id=?").run(lineId);
  return { matched: true, reconciliation_id: recId, target_id: target.id, amount: reconciledAmount };
}

function manualReconcile(db, companyId, lineId, input, userId) {
  const line = db.prepare('SELECT * FROM bank_statement_line WHERE id=? AND company_id=?').get(lineId, companyId);
  if (!line) throw fail('statement line is missing or outside company scope', 403);
  if (!['payment', 'fiscal_doc', 'difference'].includes(input.target_type) || !input.target_id) throw fail('manual reconciliation target is invalid');
  if (activeReconciled(db, lineId).length) throw fail('statement line is already reconciled', 409);
  const amount = money(input.amount || Math.abs(line.amount));
  if (!(amount > 0) || amount > Math.abs(line.amount) + 0.0001) throw fail('reconciliation amount exceeds statement line', 409);
  const recId = id('bankrec');
  db.prepare('INSERT INTO bank_reconciliation(id,statement_line_id,company_id,target_type,target_id,amount,method,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(recId, lineId, companyId, input.target_type, input.target_id, amount, 'manual', now(), userId || 'system');
  db.prepare("UPDATE bank_statement_line SET status='reconciled' WHERE id=?").run(lineId);
  return { matched: true, reconciliation_id: recId, target_id: input.target_id, amount };
}

function recordBankDifference(db, companyId, lineId, input, userId) {
  const line = db.prepare('SELECT * FROM bank_statement_line WHERE id=? AND company_id=?').get(lineId, companyId);
  const bank = db.prepare('SELECT b.* FROM bank_statement_line l JOIN bank_statement s ON s.id=l.statement_id JOIN bank_account b ON b.id=s.bank_account_id WHERE l.id=? AND l.company_id=?').get(lineId, companyId);
  if (!line || !bank) throw fail('statement line is missing or outside company scope', 403);
  if (!input.account_id) throw fail('difference account is required');
  const amount = money(Math.abs(line.amount));
  const docId = id('fiscal');
  const stamp = now();
  db.prepare(`INSERT INTO fiscal_doc(id,company_id,move_type,doc_date,state,currency,created_at,created_by) VALUES(?,?, 'manual_entry',?,'draft',?,?,?)`).run(docId, companyId, line.transaction_date, line.currency, stamp, userId || 'system');
  const insert = db.prepare('INSERT INTO fiscal_doc_line(id,fiscal_doc_id,company_id,account_id,debit,credit,currency_code,currency_debit,currency_credit,description,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
  const bankDebit = Number(line.amount) >= 0 ? amount : 0;
  const bankCredit = Number(line.amount) < 0 ? amount : 0;
  insert.run(id('line'), docId, companyId, bank.account_id, bankDebit, bankCredit, line.currency, bankDebit, bankCredit, 'Bank statement difference', stamp, userId || 'system');
  insert.run(id('line'), docId, companyId, input.account_id, bankCredit, bankDebit, line.currency, bankCredit, bankDebit, input.reason || 'Bank difference', stamp, userId || 'system');
  postFiscalDoc(db, docId, userId || 'system');
  const rec = manualReconcile(db, companyId, lineId, { target_type: 'difference', target_id: docId, amount }, userId);
  return { fiscal_doc_id: docId, ...rec };
}

function unreconcile(db, companyId, reconciliationId, userId) {
  const rec = db.prepare("SELECT * FROM bank_reconciliation WHERE id=? AND company_id=? AND status='reconciled'").get(reconciliationId, companyId);
  if (!rec) throw fail('active reconciliation not found', 404);
  db.prepare("UPDATE bank_reconciliation SET status='reversed' WHERE id=?").run(reconciliationId);
  db.prepare("UPDATE bank_statement_line SET status='unmatched' WHERE id=? AND NOT EXISTS (SELECT 1 FROM bank_reconciliation WHERE statement_line_id=? AND status='reconciled')").run(rec.statement_line_id, rec.statement_line_id);
  return { ...rec, status: 'reversed', reversed_by: userId || 'system' };
}

module.exports = { createBankAccount, createMatchRule, listMatchRules, importStatement, matchBankLine, manualReconcile, recordBankDifference, unreconcile };
