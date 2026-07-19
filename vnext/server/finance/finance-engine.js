// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

const crypto = require('crypto');
const { writeAudit } = require('../audit/audit');

const PATTERNS = {
  manual_entry: 'JV-{YYYY}{MM}-{#####}',
  sales_invoice: 'INV-{YYYY}{MM}-{#####}',
  sales_refund: 'CN-{YYYY}{MM}-{#####}',
  purchase_invoice: 'BILL-{YYYY}{MM}-{#####}',
  purchase_refund: 'DN-{YYYY}{MM}-{#####}',
  cash_receipt: 'RCIPT-{YYYY}{MM}-{#####}',
  cash_payment: 'PAY-{YYYY}{MM}-{#####}',
  stock_valuation: 'STK-{YYYY}{MM}-{#####}',
  tax_adjustment: 'TAX-{YYYY}{MM}-{#####}',
  period_close: 'CLOSE-{YYYY}{MM}-{#####}',
};

const listeners = [];

/**
 * Subscribe to the 'gl.posted' event.
 * @param {function} callback 
 */
function subscribe(callback) {
  if (typeof callback === 'function') {
    listeners.push(callback);
  }
}

/**
 * Emit a posting event to all subscribers.
 * @param {string} event 
 * @param {object} data 
 */
function emit(event, data) {
  for (const fn of listeners) {
    try {
      fn(event, data);
    } catch (e) {
      console.error(`[finance-engine] Error in event listener for ${event}:`, e);
    }
  }
}

/**
 * Format sequence numbers.
 */
function formatSeq(pattern, n, year, month) {
  const COUNTER_TOKEN = /\{(#+)\}/;
  let pat = String(pattern || '').trim() || '{#####}';
  if (!COUNTER_TOKEN.test(pat)) pat = pat + '-{#####}';

  return pat
    .replace('{YYYY}', String(year))
    .replace('{MM}', String(month).padStart(2, '0'))
    .replace(COUNTER_TOKEN, (_, hashes) => String(n).padStart(hashes.length, '0'));
}

/**
 * Validate that a fiscal document is balanced.
 * Σdebit = Σcredit in local currency.
 * Σcurrency_debit = Σcurrency_credit for every foreign currency code.
 * @param {object} db sqlite handle
 * @param {string} docId 
 * @returns {{ ok: boolean, error?: string }}
 */
function validateBalanced(db, docId) {
  const lines = db.prepare(`
    SELECT debit, credit, currency_code, currency_debit, currency_credit 
    FROM fiscal_doc_line 
    WHERE fiscal_doc_id = ?
  `).all(docId);

  if (!lines.length) {
    return { ok: false, error: 'المستند المالي فارغ ولا يحتوي على أسطر قيود' };
  }

  // 1. Local currency balance validation
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += Number(l.debit) || 0;
    totalCredit += Number(l.credit) || 0;
  }

  if (Math.abs(totalDebit - totalCredit) > 0.0001) {
    return { 
      ok: false, 
      error: `القيد غير متوازن محلياً: إجمالي المدين (${totalDebit}) يجب أن يساوي إجمالي الدائن (${totalCredit})` 
    };
  }

  // 2. Foreign currency balance validation
  const foreignGroups = {};
  for (const l of lines) {
    const code = String(l.currency_code || '').trim();
    if (code && code !== 'IQD') {
      if (!foreignGroups[code]) {
        foreignGroups[code] = { debit: 0, credit: 0 };
      }
      foreignGroups[code].debit += Number(l.currency_debit) || 0;
      foreignGroups[code].credit += Number(l.currency_credit) || 0;
    }
  }

  for (const [code, totals] of Object.entries(foreignGroups)) {
    if (Math.abs(totals.debit - totals.credit) > 0.0001) {
      return { 
        ok: false, 
        error: `القيد غير متوازن بالعملة الأجنبية (${code}): المدين (${totals.debit}) والدائن (${totals.credit})` 
      };
    }
  }

  return { ok: true };
}

/**
 * Inner posting logic (must be run within an active transaction).
 * @private
 */
function _postFiscalDoc(db, docId, userId) {
  const doc = db.prepare(`
    SELECT id, company_id, move_type, doc_date, state, currency 
    FROM fiscal_doc 
    WHERE id = ? AND removed = 0
  `).get(docId);

  if (!doc) {
    throw new Error('المستند المالي غير موجود');
  }

  if (doc.state !== 'draft') {
    throw new Error('لا يمكن اعتماد مستند تم ترحيله أو إلغاؤه مسبقاً');
  }

  // Check lock dates first
  checkLockDate(db, doc.company_id, 'gl', doc.doc_date);

  // 1. Verify period is open
  const period = db.prepare(`
    SELECT period_id, status 
    FROM fiscal_periods 
    WHERE company_id = ? AND ? >= start_date AND ? <= end_date
  `).get(doc.company_id, doc.doc_date, doc.doc_date);

  if (!period || period.status !== 'open') {
    throw new Error('cannot post into a closed or locked period');
  }

  // 2. Validate balanced entries
  const val = validateBalanced(db, docId);
  if (!val.ok) {
    throw new Error(val.error);
  }

  // 3. Generate sequence number
  const dateObj = new Date(doc.doc_date);
  const year = dateObj.getFullYear();
  const month = dateObj.getMonth() + 1;
  const seqKey = doc.move_type;
  const pattern = PATTERNS[seqKey] || 'JV-{YYYY}{MM}-{#####}';

  const row = db.prepare('SELECT next_number, year, month FROM x_sequences WHERE seq_key = ?').get(seqKey);
  let nextNum = 1;
  if (!row) {
    db.prepare(
      'INSERT INTO x_sequences (seq_key, next_number, year, month, updated_at) VALUES (?, 2, ?, ?, ?)'
    ).run(seqKey, year, month, new Date().toISOString());
  } else {
    const yearRolled = Number(row.year) !== year;
    const monthRolled = Number(row.month) !== month;
    nextNum = yearRolled || monthRolled ? 1 : Number(row.next_number);
    db.prepare(
      'UPDATE x_sequences SET next_number = ?, year = ?, month = ?, updated_at = ? WHERE seq_key = ?'
    ).run(nextNum + 1, year, month, new Date().toISOString(), seqKey);
  }

  const docNumber = formatSeq(pattern, nextNum, year, month);

  // 4. Calculate hash chain
  const lastRow = db.prepare(`
    SELECT hash 
    FROM fiscal_doc 
    WHERE company_id = ? AND hash IS NOT NULL 
    ORDER BY doc_number DESC LIMIT 1
  `).get(doc.company_id);
  const prevHash = lastRow ? lastRow.hash : '0'.repeat(64);

  const hasTaxTagIds = db.prepare("PRAGMA table_info(gl_line)").all().some(c => c.name === 'tax_tag_ids');

  const lines = db.prepare(`
    SELECT id, account_id, debit, credit, currency_code, currency_debit, currency_credit, dims${hasTaxTagIds ? ', tax_refs' : ''} 
    FROM fiscal_doc_line 
    WHERE fiscal_doc_id = ? 
    ORDER BY id
  `).all(docId);

  const linesStr = JSON.stringify(lines.map(l => ({
    account_id: l.account_id,
    debit: Number(l.debit) || 0,
    credit: Number(l.credit) || 0,
  })));

  const hashInput = `fiscal_doc|${docId}|${doc.company_id}|${doc.move_type}|${doc.doc_date}|${prevHash}|${docNumber}|${linesStr}`;
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  // 5. Update fiscal_doc status to posted
  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE fiscal_doc 
    SET state = 'posted', doc_number = ?, post_date = ?, hash = ?, prev_hash = ?, updated_at = ?
    WHERE id = ?
  `).run(docNumber, nowIso, hash, prevHash, nowIso, docId);

  // 6. Write append-only gl_line rows
  const insertGlLine = db.prepare(`
    INSERT INTO gl_line (
      id, company_id, fiscal_doc_id, fiscal_doc_line_id, account_id, 
      posting_date, debit, credit, currency_code, currency_debit, currency_credit, dims, created_at, created_by${hasTaxTagIds ? ', tax_tag_ids' : ''}
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?${hasTaxTagIds ? ', ?' : ''})
  `);

  for (const l of lines) {
    // Validate dimension rules
    validateDimensionDistribution(db, doc.company_id, l.account_id, l.dims);

    const glLineId = 'gl_' + crypto.randomUUID();
    const params = [
      glLineId,
      doc.company_id,
      docId,
      l.id,
      l.account_id,
      doc.doc_date,
      l.debit,
      l.credit,
      l.currency_code || null,
      l.currency_debit || 0.0,
      l.currency_credit || 0.0,
      l.dims || null,
      nowIso,
      userId
    ];
    if (hasTaxTagIds) {
      params.push(l.tax_refs || null);
    }
    insertGlLine.run(...params);
  }

  // 7. Write audit log entry
  writeAudit(db, {
    entity: 'fiscal_doc',
    recordId: docId,
    user: userId,
    action: 'post_fiscal_doc',
    before: { state: 'draft' },
    after: { state: 'posted', doc_number: docNumber, hash },
    at: nowIso,
  });

  // 8. Emit posted event
  emit('gl.posted', {
    docId,
    companyId: doc.company_id,
    docNumber,
    docDate: doc.doc_date,
    moveType: doc.move_type,
    lines,
  });

  return { success: true, docNumber, hash };
}

/**
 * Post a draft fiscal document to the general ledger.
 * @param {object} db sqlite handle
 * @param {string} docId 
 * @param {string} userId 
 * @returns {{ success: boolean, docNumber: string, hash: string }}
 */
function postFiscalDoc(db, docId, userId) {
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    const res = _postFiscalDoc(db, docId, userId);
    if (ownsTransaction) db.exec('COMMIT');
    return res;
  } catch (error) {
    if (ownsTransaction) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {}
    }
    throw error;
  }
}

/**
 * Reverse (cancel) an already posted fiscal document.
 * @param {object} db sqlite handle
 * @param {string} docId 
 * @param {string} userId 
 * @returns {{ success: boolean, docNumber: string, hash: string }} Reversal document info
 */
function reverseFiscalDoc(db, docId, userId) {
  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
  try {
    const doc = db.prepare(`
      SELECT id, company_id, move_type, doc_date, state, currency 
      FROM fiscal_doc 
      WHERE id = ? AND removed = 0
    `).get(docId);

    if (!doc) {
      throw new Error('المستند المالي غير موجود');
    }

    if (doc.state !== 'posted') {
      throw new Error('Only posted documents can be reversed');
    }

    // 1. Create a draft reversal document
    const revDocId = 'rev_' + crypto.randomUUID();
    const nowIso = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, state, currency, reversal_of_id, created_at, created_by)
      VALUES (?, ?, null, ?, ?, 'draft', ?, ?, ?, ?)
    `).run(revDocId, doc.company_id, doc.move_type, doc.doc_date, doc.currency, docId, nowIso, userId);

    // 2. Fetch original lines and insert reversed lines (debit/credit swapped)
    const lines = db.prepare(`
      SELECT id, account_id, debit, credit, currency_code, currency_debit, currency_credit, tax_refs, dims, snapshot, description
      FROM fiscal_doc_line 
      WHERE fiscal_doc_id = ?
    `).all(docId);

    const insertLine = db.prepare(`
      INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, currency_code, currency_debit, currency_credit, tax_refs, dims, snapshot, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const l of lines) {
      const newLineId = 'line_' + crypto.randomUUID();
      insertLine.run(
        newLineId,
        revDocId,
        doc.company_id,
        l.account_id,
        l.credit, // original credit becomes debit
        l.debit,  // original debit becomes credit
        l.currency_code || null,
        l.currency_credit || 0.0, // swap foreign currency too
        l.currency_debit || 0.0,
        l.tax_refs || null,
        l.dims || null,
        l.snapshot || null,
        l.description ? `إلغاء: ${l.description}` : 'إلغاء قيد مالي',
        nowIso
      );
    }

    // 3. Mark original document as cancelled
    db.prepare(`
      UPDATE fiscal_doc 
      SET state = 'cancelled', updated_at = ?
      WHERE id = ?
    `).run(nowIso, docId);

    // 4. Post the reversal document (calls inner _postFiscalDoc inside the same transaction)
    const postRes = _postFiscalDoc(db, revDocId, userId);

    // 5. Write audit entry for cancellation
    writeAudit(db, {
      entity: 'fiscal_doc',
      recordId: docId,
      user: userId,
      action: 'cancel_fiscal_doc',
      before: { state: 'posted' },
      after: { state: 'cancelled', reversal_id: revDocId },
      at: nowIso,
    });

    if (ownsTransaction) db.exec('COMMIT');
    return postRes;
  } catch (error) {
    if (ownsTransaction) {
      try {
        db.exec('ROLLBACK');
      } catch (_) {}
    }
    throw error;
  }
}

/**
 * Query trial balance for a company.
 */
function getTrialBalance(db, companyId, options = {}) {
  let sql = `
    SELECT 
      g.account_id,
      a.code as account_code,
      a.name as account_name,
      SUM(g.debit) as total_debit,
      SUM(g.credit) as total_credit
    FROM gl_line g
    JOIN account a ON g.account_id = a.id
    WHERE g.company_id = ?
  `;
  const params = [companyId];

  if (options.startDate) {
    sql += ' AND g.posting_date >= ?';
    params.push(options.startDate);
  }
  if (options.endDate) {
    sql += ' AND g.posting_date <= ?';
    params.push(options.endDate);
  }
  if (options.dimensions && typeof options.dimensions === 'object') {
    for (const [key, val] of Object.entries(options.dimensions)) {
      sql += ` AND json_extract(g.dims, '$.' || ?) = ?`;
      params.push(key, String(val));
    }
  }

  sql += `
    GROUP BY g.account_id, a.code, a.name
    ORDER BY a.code
  `;

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    account_id: r.account_id,
    account_code: r.account_code,
    account_name: r.account_name,
    total_debit: Number(r.total_debit) || 0,
    total_credit: Number(r.total_credit) || 0,
    balance: (Number(r.total_debit) || 0) - (Number(r.total_credit) || 0),
  }));
}

/**
 * Query general ledger for a company and account.
 */
function getGeneralLedger(db, companyId, accountId, options = {}) {
  let sql = `
    SELECT 
      g.id,
      g.posting_date,
      g.debit,
      g.credit,
      g.currency_code,
      g.currency_debit,
      g.currency_credit,
      g.dims,
      d.doc_number,
      d.move_type,
      d.reversal_of_id
    FROM gl_line g
    JOIN fiscal_doc d ON g.fiscal_doc_id = d.id
    WHERE g.company_id = ? AND g.account_id = ?
  `;
  const params = [companyId, accountId];

  if (options.startDate) {
    sql += ' AND g.posting_date >= ?';
    params.push(options.startDate);
  }
  if (options.endDate) {
    sql += ' AND g.posting_date <= ?';
    params.push(options.endDate);
  }

  sql += ' ORDER BY g.posting_date, g.rowid';

  return db.prepare(sql).all(...params);
}

/**
 * Verification job that ensures the hash chain is fully intact.
 */
function verifyHashChain(db, companyId) {
  const docs = db.prepare(`
    SELECT id, doc_number, hash, prev_hash, move_type, doc_date 
    FROM fiscal_doc 
    WHERE company_id = ? AND hash IS NOT NULL 
    ORDER BY doc_number ASC
  `).all(companyId);

  let expectedPrevHash = '0'.repeat(64);

  for (const doc of docs) {
    if (doc.prev_hash !== expectedPrevHash) {
      return { 
        ok: false, 
        error: `Chain broken at document ${doc.doc_number || doc.id}: expected prev_hash ${expectedPrevHash}, found ${doc.prev_hash}`,
        docId: doc.id 
      };
    }

    const lines = db.prepare(`
      SELECT account_id, debit, credit 
      FROM fiscal_doc_line 
      WHERE fiscal_doc_id = ? 
      ORDER BY id
    `).all(doc.id);

    const linesStr = JSON.stringify(lines.map(l => ({
      account_id: l.account_id,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    })));

    const hashInput = `fiscal_doc|${doc.id}|${companyId}|${doc.move_type}|${doc.doc_date}|${doc.prev_hash}|${doc.doc_number}|${linesStr}`;
    const computedHash = crypto.createHash('sha256').update(hashInput).digest('hex');

    if (doc.hash !== computedHash) {
      return { 
        ok: false, 
        error: `Hash mismatch at document ${doc.doc_number || doc.id}: stored hash ${doc.hash}, computed ${computedHash}`,
        docId: doc.id 
      };
    }

    expectedPrevHash = doc.hash;
  }

  return { ok: true };
}

/**
 * Set module-specific lock dates for a company.
 */
function setLockDates(db, companyId, { glLockDate, stockLockDate }, userId) {
  const nowIso = new Date().toISOString();
  db.prepare(`
    INSERT INTO company_lock_dates (company_id, gl_lock_date, stock_lock_date, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(company_id) DO UPDATE SET
      gl_lock_date = excluded.gl_lock_date,
      stock_lock_date = excluded.stock_lock_date,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
  `).run(companyId, glLockDate || null, stockLockDate || null, nowIso, userId);

  writeAudit(db, {
    entity: 'company_lock_dates',
    recordId: companyId,
    user: userId,
    action: 'set_lock_dates',
    before: null,
    after: { glLockDate, stockLockDate },
    at: nowIso,
  });

  return { success: true };
}

/**
 * Check if a posting date is locked for a specific module.
 */
function checkLockDate(db, companyId, module, date) {
  const tableExists = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'company_lock_dates'
  `).get();
  if (!tableExists) return;

  const row = db.prepare(`
    SELECT gl_lock_date, stock_lock_date FROM company_lock_dates WHERE company_id = ?
  `).get(companyId);

  if (row) {
    const lockDate = module === 'stock' ? row.stock_lock_date : row.gl_lock_date;
    if (lockDate && date <= lockDate) {
      throw new Error(`cannot post into a locked period (lock date for ${module} is ${lockDate})`);
    }
  }
}

/**
 * Close a fiscal period after checking the unposted drafts checklist.
 */
function closeFiscalPeriod(db, companyId, periodId, userId) {
  const period = db.prepare(`
    SELECT start_date, end_date, status FROM fiscal_periods WHERE company_id = ? AND period_id = ?
  `).get(companyId, periodId);

  if (!period) {
    throw new Error('الفترة المالية غير موجودة');
  }

  if (period.status !== 'open') {
    throw new Error('الفترة المالية مغلقة أو مقفلة بالفعل');
  }

  // Checklist: check for unposted drafts
  const drafts = db.prepare(`
    SELECT count(*) as c FROM fiscal_doc 
    WHERE company_id = ? AND state = 'draft' AND doc_date >= ? AND doc_date <= ? AND removed = 0
  `).get(companyId, period.start_date, period.end_date);

  if (drafts.c > 0) {
    throw new Error('Cannot close period: unposted draft documents exist');
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE fiscal_periods SET status = 'closed' WHERE company_id = ? AND period_id = ?
  `).run(companyId, periodId);

  writeAudit(db, {
    entity: 'fiscal_periods',
    recordId: periodId,
    user: userId,
    action: 'close_period',
    before: { status: 'open' },
    after: { status: 'closed' },
    at: nowIso,
  });

  return { success: true };
}

/**
 * Reopen a closed or locked fiscal period.
 */
function reopenFiscalPeriod(db, companyId, periodId, userId) {
  const period = db.prepare(`
    SELECT status FROM fiscal_periods WHERE company_id = ? AND period_id = ?
  `).get(companyId, periodId);

  if (!period) {
    throw new Error('الفترة المالية غير موجودة');
  }

  const nowIso = new Date().toISOString();
  db.prepare(`
    UPDATE fiscal_periods SET status = 'open' WHERE company_id = ? AND period_id = ?
  `).run(companyId, periodId);

  writeAudit(db, {
    entity: 'fiscal_periods',
    recordId: periodId,
    user: userId,
    action: 'reopen_period',
    before: { status: period.status },
    after: { status: 'open' },
    at: nowIso,
  });

  return { success: true };
}

/**
 * Generate year-end closing entries:
 * Nets all P&L accounts (income & expense) to Retained Earnings (coa_301000) for the year.
 * Then locks all monthly periods of that year.
 */
function generateClosingEntries(db, companyId, year, userId) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // 1. Calculate net balances of all Income and Expense accounts for the year
    const rows = db.prepare(`
      SELECT 
        g.account_id,
        SUM(g.debit) as total_debit,
        SUM(g.credit) as total_credit,
        a.type
      FROM gl_line g
      JOIN account a ON g.account_id = a.id
      WHERE g.company_id = ? 
        AND g.posting_date >= ? AND g.posting_date <= ?
        AND a.type IN ('income', 'expense')
      GROUP BY g.account_id, a.type
    `).all(companyId, startDate, endDate);

    if (!rows.length) {
      throw new Error(`لا توجد قيود مبيعات أو مصاريف لعام ${year}`);
    }

    // 2. Prepare closing entries lines
    const closeLines = [];
    let totalCloseDebit = 0;
    let totalCloseCredit = 0;

    for (const r of rows) {
      const debitVal = Number(r.total_debit) || 0;
      const creditVal = Number(r.total_credit) || 0;
      const netVal = debitVal - creditVal; // net debit balance

      if (Math.abs(netVal) < 0.0001) continue;

      if (netVal > 0) {
        // Expense (debit balance): we close it with a credit
        closeLines.push({
          account_id: r.account_id,
          debit: 0.0,
          credit: netVal,
          description: `إقفال حساب المصروف للسنة المالية ${year}`,
        });
        totalCloseCredit += netVal;
      } else {
        // Income (credit balance): we close it with a debit
        closeLines.push({
          account_id: r.account_id,
          debit: -netVal,
          credit: 0.0,
          description: `إقفال حساب الإيراد للسنة المالية ${year}`,
        });
        totalCloseDebit += -netVal;
      }
    }

    // Calculate offset for Retained Earnings (coa_301000)
    const diff = totalCloseCredit - totalCloseDebit;
    if (Math.abs(diff) > 0.0001) {
      if (diff > 0) {
        // Net profit: we debit Retained Earnings
        closeLines.push({
          account_id: 'coa_301000',
          debit: diff,
          credit: 0.0,
          description: `صافي أرباح السنة المالية ${year}`,
        });
      } else {
        // Net loss: we credit Retained Earnings
        closeLines.push({
          account_id: 'coa_301000',
          debit: 0.0,
          credit: -diff,
          description: `صافي خسائر السنة المالية ${year}`,
        });
      }
    }

    if (!closeLines.length) {
      throw new Error(`أرصدة حسابات الإيرادات والمصاريف لعام ${year} متوازنة بالفعل عند الصفر`);
    }

    // 3. Create draft period_close document in fiscal_doc
    const docId = 'close_' + crypto.randomUUID();
    const nowIso = new Date().toISOString();
    
    db.prepare(`
      INSERT INTO fiscal_doc (id, company_id, doc_number, move_type, doc_date, state, currency, created_at, created_by)
      VALUES (?, ?, null, 'period_close', ?, 'draft', 'IQD', ?, ?)
    `).run(docId, companyId, endDate, nowIso, userId);

    // 4. Insert lines
    const insertLine = db.prepare(`
      INSERT INTO fiscal_doc_line (id, fiscal_doc_id, company_id, account_id, debit, credit, description, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const line of closeLines) {
      const lineId = 'line_' + crypto.randomUUID();
      insertLine.run(lineId, docId, companyId, line.account_id, line.debit, line.credit, line.description, nowIso);
    }

    // 5. Post the closing document (calls _postFiscalDoc)
    const postRes = _postFiscalDoc(db, docId, userId);

    // 6. Lock all monthly periods of that year
    db.prepare(`
      UPDATE fiscal_periods SET status = 'locked'
      WHERE company_id = ? AND start_date >= ? AND end_date <= ?
    `).run(companyId, startDate, endDate);

    db.exec('COMMIT');
    return postRes;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch (_) {}
    throw error;
  }
}

/**
 * Validate that line dimensions meet policies (required/blocked) and sum to 100%.
 */
function validateDimensionDistribution(db, companyId, accountId, dimsJson) {
  // If dimension table does not exist yet (e.g. running older migration tests), skip validation
  const tableExists = db.prepare(`
    SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'dimension'
  `).get();
  if (!tableExists) return;

  const parsed = dimsJson ? (typeof dimsJson === 'string' ? JSON.parse(dimsJson) : dimsJson) : {};

  // Group specified values by their dimension_id and calculate sum
  const dimSums = {};
  for (const [valId, percent] of Object.entries(parsed)) {
    const val = db.prepare(`
      SELECT dimension_id FROM dimension_value WHERE id = ?
    `).get(valId);
    if (!val) {
      throw new Error(`قيمة البعد غير موجودة: ${valId}`);
    }
    if (!dimSums[val.dimension_id]) {
      dimSums[val.dimension_id] = 0.0;
    }
    dimSums[val.dimension_id] += Number(percent) || 0.0;
  }

  // Validate that percentages for each involved dimension sum to exactly 100%
  for (const [dimId, sum] of Object.entries(dimSums)) {
    if (Math.abs(sum - 100.0) > 0.01) {
      throw new Error(`Dimension values for dimension ${dimId} must sum to 100%`);
    }
  }

  // Validate account policies (required / blocked)
  const policies = db.prepare(`
    SELECT dimension_id, policy FROM account_dimension_policy WHERE account_id = ?
  `).all(accountId);

  for (const pol of policies) {
    const hasValue = dimSums[pol.dimension_id] !== undefined;
    if (pol.policy === 'required' && !hasValue) {
      throw new Error(`Dimension ${pol.dimension_id} is required for account ${accountId}`);
    }
    if (pol.policy === 'blocked' && hasValue) {
      throw new Error(`Dimension ${pol.dimension_id} is blocked for account ${accountId}`);
    }
  }
}

/**
 * Compute P&L account balances split by the values of a specific dimension.
 */
function getDimensionPnLReport(db, companyId, dimensionId, options = {}) {
  // Get all dimension values for this dimension
  const dimVals = db.prepare(`
    SELECT id, code, name FROM dimension_value WHERE dimension_id = ? ORDER BY code
  `).all(dimensionId);

  // Fetch all gl_lines for income/expense accounts in the date range
  let sql = `
    SELECT g.account_id, a.code as account_code, a.name as account_name, a.type as account_type, g.debit, g.credit, g.dims
    FROM gl_line g
    JOIN account a ON g.account_id = a.id
    WHERE g.company_id = ? AND a.type IN ('income', 'expense')
  `;
  const params = [companyId];

  if (options.startDate) {
    sql += ' AND g.posting_date >= ?';
    params.push(options.startDate);
  }
  if (options.endDate) {
    sql += ' AND g.posting_date <= ?';
    params.push(options.endDate);
  }

  const rows = db.prepare(sql).all(...params);

  // Initialize report rows map: account_id -> { account_code, account_name, total, [dimVal.id]: value }
  const reportRowsMap = {};

  for (const r of rows) {
    const acctId = r.account_id;
    if (!reportRowsMap[acctId]) {
      reportRowsMap[acctId] = {
        account_id: acctId,
        account_code: r.account_code,
        account_name: r.account_name,
        account_type: r.account_type,
        total: 0.0,
      };
      for (const val of dimVals) {
        reportRowsMap[acctId][val.id] = 0.0;
      }
    }

    const lineTotal = Number(r.debit) - Number(r.credit);
    reportRowsMap[acctId].total += lineTotal;

    // Parse dims JSON
    if (r.dims) {
      let parsed = {};
      try {
        parsed = typeof r.dims === 'string' ? JSON.parse(r.dims) : r.dims;
      } catch (_) {}

      for (const [valId, percent] of Object.entries(parsed)) {
        if (reportRowsMap[acctId][valId] !== undefined) {
          reportRowsMap[acctId][valId] += lineTotal * (Number(percent) / 100.0);
        }
      }
    }
  }

  return {
    columns: dimVals.map(v => ({ id: v.id, code: v.code, name: v.name })),
    rows: Object.values(reportRowsMap).sort((a, b) => a.account_code.localeCompare(b.account_code)),
  };
}

module.exports = {
  validateBalanced,
  postFiscalDoc,
  reverseFiscalDoc,
  getTrialBalance,
  getGeneralLedger,
  verifyHashChain,
  subscribe,
  emit,
  setLockDates,
  checkLockDate,
  closeFiscalPeriod,
  reopenFiscalPeriod,
  generateClosingEntries,
  validateDimensionDistribution,
  getDimensionPnLReport,
};
