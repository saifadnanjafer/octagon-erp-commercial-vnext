(function () {
  'use strict';

  const root = window;
  const services = root.PentagonServices || {};
  root.PentagonServices = services;

  const MOVE_TYPES = ['entry', 'out_invoice', 'out_refund', 'in_invoice', 'in_refund'];
  const STATE_LABELS = { draft: 'مسودة', posted: 'مرحّل', cancel: 'ملغي' };

  function now() {
    return services.utils?.now ? services.utils.now() : new Date().toISOString();
  }

  function makeId(prefix) {
    return services.utils?.makeId ? services.utils.makeId(prefix) : `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function tenant() {
    return root.TenantService || services.tenant || null;
  }

  function tenantScope(collection, records, options = {}) {
    if (tenant()?.scope) return tenant().scope(collection, records, options);
    if (typeof root.scoped === 'function') return root.scoped(records, options);
    return records;
  }

  function tenantStamp(collection, record, options = {}) {
    return tenant()?.stamp ? tenant().stamp(record, { ...options, collection }) : record;
  }

  function tenantPrepareUpdate(collection, record, changes = {}, options = {}) {
    if (tenant()?.prepareUpdate) tenant().prepareUpdate(collection, record, changes, options);
    return record;
  }

  function tenantCanRead(collection, record, options = {}) {
    return tenant()?.canRead ? tenant().canRead(collection, record, options) : true;
  }

  function tenantCompanyId(record) {
    return tenant()?.recordCompanyId ? tenant().recordCompanyId(record) : (record?.companyId || record?.company_id || '');
  }

  function getFinanceAccounts() {
    return root.PentagonDB.getCached()?.finance?.accounts || [];
  }

  function resolveAccount(accountId) {
    const accounts = getFinanceAccounts();
    if (accounts.find(a => a.id === accountId)) return accountId;
    console.warn('FinanceService: account not found, falling back to suspense:', accountId);
    return 'suspense';
  }

  function money(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  function financeTransactionKey(tx = {}) {
    return tx.sourceCanonicalKey || [
      tx.sourceType || 'finance.transactions',
      tx.sourceId || tx.id || '',
      tx.type || '',
      money(tx.amount),
    ].join('|');
  }

  function cashboxEffect(tx = {}) {
    const effect = Number(tx.cashboxEffect);
    if (Number.isFinite(effect) && effect !== 0) return Math.round(effect);
    const amount = money(tx.amount);
    if (tx.direction === 'in') return amount;
    if (tx.direction === 'out') return -amount;
    return 0;
  }

  function resolveCounterAccount(tx = {}) {
    if (tx.type === 'salary_payment') return resolveAccount('accrued_payroll');
    return resolveAccount(tx.accountId || tx.chartAccountId || 'suspense');
  }

  function buildMoveLinesFromTransaction(tx = {}) {
    const effect = cashboxEffect(tx);
    const amount = Math.abs(effect || money(tx.amount));
    if (amount <= 0) throw new Error('لا يمكن ترحيل حركة مالية بمبلغ صفر');
    const label = tx.description || tx.cashboxCategory || tx.type || 'حركة مالية';
    const partnerId = tx.customerId || tx.partyName || tx.paidByName || '';
    const counterAccount = resolveCounterAccount(tx);
    const cashAccount = resolveAccount(tx.cashAccountId || 'cash_workshop');

    if (tx.sourceType === 'cashbox' || effect !== 0 || tx.paymentMethod === 'cash') {
      if (effect > 0 || tx.direction === 'in') {
        return [
          { account_id: cashAccount, debit: amount, credit: 0, label, partner_id: partnerId, department_id: tx.departmentId || '' },
          { account_id: counterAccount, debit: 0, credit: amount, label, partner_id: partnerId, department_id: tx.departmentId || '' },
        ];
      }
      return [
        { account_id: counterAccount, debit: amount, credit: 0, label, partner_id: partnerId, department_id: tx.departmentId || '' },
        { account_id: cashAccount, debit: 0, credit: amount, label, partner_id: partnerId, department_id: tx.departmentId || '' },
      ];
    }

    if (tx.sourceType === 'person_pocket') {
      return [
        { account_id: counterAccount, debit: amount, credit: 0, label, partner_id: partnerId, department_id: tx.departmentId || '' },
        { account_id: resolveAccount('payables_people'), debit: 0, credit: amount, label, partner_id: partnerId, department_id: tx.departmentId || '' },
      ];
    }

    return [
      { account_id: counterAccount, debit: amount, credit: 0, label, partner_id: partnerId, department_id: tx.departmentId || '' },
      { account_id: resolveAccount('suspense'), debit: 0, credit: amount, label, partner_id: partnerId, department_id: tx.departmentId || '' },
    ];
  }

  function lineTotals(lines = []) {
    return lines.reduce((acc, line) => {
      acc.debit += Number(line.debit || 0);
      acc.credit += Number(line.credit || 0);
      return acc;
    }, { debit: 0, credit: 0 });
  }

  function normalizeLine(line = {}, index = 0, movePartnerId = '') {
    const debit = Number(line.debit || 0);
    const credit = Number(line.credit || 0);
    if (debit > 0 && credit > 0) throw new Error('السطر لا يمكن أن يكون مديناً ودائناً في نفس الوقت');
    if (!line.account_id) throw new Error('كل سطر يحتاج حساباً');
    return {
      id: line.id || makeId('AML'),
      sequence: Number.isFinite(Number(line.sequence)) ? Number(line.sequence) : index,
      account_id: line.account_id,
      label: line.label || line.name || '',
      debit,
      credit,
      amount_residual: line.amount_residual !== undefined ? Number(line.amount_residual || 0) : Math.max(debit, credit),
      partner_id: line.partner_id || movePartnerId || '',
      department_id: line.department_id || '',
      reconciled: !!line.reconciled,
      reconcile_id: line.reconcile_id || null,
    };
  }

  function journalPrefix(journal, moveType = 'entry') {
    if (moveType === 'out_invoice') return 'INV';
    if (moveType === 'out_refund') return 'RINV';
    if (moveType === 'in_invoice') return 'BILL';
    if (moveType === 'in_refund') return 'RBILL';
    if (journal?.type === 'sale') return 'INV';
    if (journal?.type === 'purchase') return 'BILL';
    return journal?.sequence_prefix || journal?.code || 'MISC';
  }

  function sequencePrefixForMove(db, move) {
    const journal = (db.journals || []).find(j => j.id === move.journal_id);
    return journalPrefix(journal, move.move_type);
  }

  function nextSequenceName(db, move) {
    const year = String(move.date || todayISO()).slice(0, 4);
    const prefix = sequencePrefixForMove(db, move);
    const prefixYear = `${prefix}/${year}/`;
    const max = (db.account_moves || []).reduce((highest, existing) => {
      const name = String(existing.name || '');
      if (!name.startsWith(prefixYear)) return highest;
      const n = Number(name.slice(prefixYear.length));
      return Number.isFinite(n) ? Math.max(highest, n) : highest;
    }, 0);
    return `${prefixYear}${String(max + 1).padStart(5, '0')}`;
  }

  function validateMoveType(moveType) {
    if (!MOVE_TYPES.includes(moveType)) throw new Error(`move_type غير مدعوم: ${moveType}`);
  }

  function isLocked(db, date) {
    return !!db._lock_date && !!date && String(date) <= String(db._lock_date);
  }

  function assertNotLocked(db, date, action = 'تعديل') {
    if (isLocked(db, date)) throw new Error(`الفترة مقفلة: لا يمكن ${action} حركة بتاريخ ${date}`);
  }

  function computeHash(move, previousHash = 'genesis') {
    const payload = JSON.stringify({
      id: move.id,
      name: move.name,
      date: move.date,
      journal_id: move.journal_id,
      move_type: move.move_type,
      previous_hash: previousHash,
      line_ids: (move.line_ids || []).map(line => ({
        account_id: line.account_id,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        partner_id: line.partner_id || '',
      })),
    });
    let h = 0x811c9dc5;
    for (let i = 0; i < payload.length; i += 1) {
      h = Math.imul(h ^ payload.charCodeAt(i), 0x01000193) >>> 0;
    }
    const suffix = btoa(unescape(encodeURIComponent(payload.slice(0, 24))))
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 16);
    return `${h.toString(16).padStart(8, '0')}-${suffix}`;
  }

  function migrateLegacyEntry(entry = {}, db) {
    const move = {
      id: entry.id || makeId('MOVE'),
      name: entry.name || '/',
      journal_id: entry.journal_id || 'j_gen',
      date: entry.date || todayISO(),
      move_type: 'entry',
      state: entry.state || 'posted',
      partner_id: entry.partner_id || '',
      origin: entry.origin || '',
      line_ids: (entry.lines || []).map((line, index) => normalizeLine(line, index, entry.partner_id || '')),
      hash: entry.hash || null,
      previous_hash: entry.previous_hash || entry.prev_hash || null,
      created_at: entry.created_at || now(),
      posted_at: entry.posted_at || (entry.state === 'posted' ? (entry.updated_at || entry.created_at || now()) : null),
      cancelled_at: entry.cancelled_at || null,
      reversed_of: entry.reversed_of || null,
      reversal_id: entry.reversal_id || null,
      legacy_journal_entry_id: entry.id || '',
      created_by: entry.created_by || 'system',
      updated_at: entry.updated_at || entry.created_at || now(),
      updated_by: entry.updated_by || 'system',
      is_active: entry.is_active !== false,
    };
    move.amount_total = lineTotals(move.line_ids).debit;
    if (move.state === 'posted' && !move.hash) {
      const prev = lastPostedHash(db, move) || 'genesis';
      move.previous_hash = prev;
      move.hash = computeHash(move, prev);
    }
    return move;
  }

  function ensureMoveCollections(db) {
    if (!Array.isArray(db.account_moves)) db.account_moves = [];
    if (!Array.isArray(db.journal_entries)) db.journal_entries = [];
    return db.account_moves;
  }

  function getMoves(db) {
    if (Array.isArray(db.account_moves) && db.account_moves.length) return db.account_moves;
    return (db.journal_entries || []).map(entry => migrateLegacyEntry(entry, db));
  }

  function findMove(db, moveId) {
    return getMoves(db).find(move => move.id === moveId || move.legacy_journal_entry_id === moveId) || null;
  }

  function lastPostedHash(db, excludeMove = null) {
    const moves = getMoves(db)
      .filter(move => move.state === 'posted' && move.hash && move.id !== excludeMove?.id)
      .sort((a, b) => {
        const dateCmp = String(a.date || '').localeCompare(String(b.date || ''));
        if (dateCmp) return dateCmp;
        const nameCmp = String(a.name || '').localeCompare(String(b.name || ''));
        if (nameCmp) return nameCmp;
        return String(a.id || '').localeCompare(String(b.id || ''));
      });
    return moves.length ? moves[moves.length - 1].hash : null;
  }

  function recomputePostedHashChain(db) {
    const posted = getMoves(db)
      .filter(move => move.state === 'posted')
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id || '').localeCompare(String(b.id || '')));
    let previousHash = 'genesis';
    posted.forEach(move => {
      move.previous_hash = previousHash;
      move.hash = computeHash(move, previousHash);
      previousHash = move.hash;
      upsertLegacyJournalEntry(db, move);
    });
  }

  function mirrorJournalEntry(move) {
    return {
      id: move.legacy_journal_entry_id || move.id,
      name: move.name,
      date: move.date,
      journal_id: move.journal_id,
      partner_id: move.partner_id || '',
      state: move.state,
      lines: clone(move.line_ids || []),
      amount_total: Number(move.amount_total || lineTotals(move.line_ids).debit),
      origin: move.origin || '',
      hash: move.hash || null,
      prev_hash: move.previous_hash || null,
      previous_hash: move.previous_hash || null,
      reversed_of: move.reversed_of || null,
      reversal_id: move.reversal_id || null,
      account_move_id: move.id,
      created_at: move.created_at,
      created_by: move.created_by || 'system',
      updated_at: move.updated_at || now(),
      updated_by: move.updated_by || 'system',
      is_active: move.is_active !== false,
      companyId: move.companyId || '',
    };
  }

  // RULE (audit 2026-07-04): account_moves is the source of truth for the
  // general ledger; journal_entries is legacy/mirror only — a read-only,
  // one-row-per-move reflection kept for the old "القيود اليومية" screen and
  // backward compatibility. Every balance calculation, trial balance, P&L,
  // and reconciliation (getTrialBalance, getLedger, getProfitAndLoss, and
  // app.js's getCashBalance) MUST read from account_moves only. Never sum
  // account_moves and journal_entries together in the same report — they
  // describe the same postings, so doing so would double count.
  function upsertLegacyJournalEntry(db, move) {
    if (!Array.isArray(db.journal_entries)) db.journal_entries = [];
    const legacy = mirrorJournalEntry(move);
    const idx = db.journal_entries.findIndex(entry => entry.id === legacy.id || entry.account_move_id === move.id);
    if (idx === -1) db.journal_entries.push(legacy);
    else db.journal_entries[idx] = { ...db.journal_entries[idx], ...legacy };
  }

  function createDraftMoveObject(db, payload = {}) {
    const moveType = payload.move_type || 'entry';
    validateMoveType(moveType);
    const date = payload.date || todayISO();
    const partnerId = payload.partner_id || '';
    const lineIds = (payload.line_ids || payload.lines || []).map((line, index) => normalizeLine(line, index, partnerId));
    const total = FinanceService.validateBalanced(lineIds);
    const user = root.PentagonAuth?.getCurrentUser?.();
    const move = {
      id: payload.id || makeId('MOVE'),
      name: payload.name || '/',
      journal_id: payload.journal_id || 'j_gen',
      date,
      move_type: moveType,
      state: payload.state || 'draft',
      partner_id: partnerId,
      origin: payload.origin || '',
      sourceType: payload.sourceType || '',
      sourceId: payload.sourceId || '',
      sourceCanonicalKey: payload.sourceCanonicalKey || '',
      financeTransactionId: payload.financeTransactionId || '',
      postingEngine: payload.postingEngine || '',
      reviewStatus: payload.reviewStatus || '',
      line_ids: lineIds,
      amount_total: total.debit,
      hash: payload.hash || null,
      previous_hash: payload.previous_hash || payload.prev_hash || null,
      created_at: payload.created_at || now(),
      posted_at: payload.posted_at || null,
      cancelled_at: payload.cancelled_at || null,
      reversed_of: payload.reversed_of || null,
      reversal_id: payload.reversal_id || null,
      created_by: payload.created_by || user?.id || 'system',
      updated_at: payload.updated_at || now(),
      updated_by: payload.updated_by || user?.id || 'system',
      is_active: payload.is_active !== false,
      companyId: payload.companyId || (typeof root.getActiveOrgProfile === 'function' ? root.getActiveOrgProfile()?.companyId : '') || '',
    };
    return tenantStamp('account_moves', move, { db });
  }

  function ensurePaymentCollections(db) {
    if (!Array.isArray(db.account_payments)) db.account_payments = [];
    if (!Array.isArray(db.account_partial_reconciles)) db.account_partial_reconciles = [];
  }

  async function backupBeforeLiveFinanceMutation(reason = 'finance') {
    if (reason === false || root.__skipPaymentBackupForTests) return null;
    if (typeof fetch !== 'function') throw new Error('لا يمكن إنشاء نسخة احتياطية في هذه البيئة');
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: reason || 'pre_payment' }),
    });
    let payload = {};
    try { payload = await res.json(); } catch (_) { payload = {}; }
    if (!res.ok || payload.success === false) {
      throw new Error(payload.error || 'فشل إنشاء النسخة الاحتياطية، تم إلغاء الدفعة قبل أي تعديل');
    }
    return payload;
  }

  function isReconcilableAccount(accountId) {
    return ['receivables_customers', 'payables_people', 'accrued_payroll'].includes(accountId);
  }

  function findLineRef(db, moveId, lineId) {
    const move = findMove(db, moveId);
    if (!move) throw new Error('القيد غير موجود');
    const line = (move.line_ids || []).find(item => item.id === lineId);
    if (!line) throw new Error('سطر القيد غير موجود');
    return { move, line };
  }

  function lineOpenAmount(db, move, line) {
    ensurePaymentCollections(db);
    const debitBase = Math.max(0, Number(line.debit || 0) - Number(line.credit || 0));
    const creditBase = Math.max(0, Number(line.credit || 0) - Number(line.debit || 0));
    const matchedDebit = db.account_partial_reconciles
      .filter(partial => partial.debit_move_id === move.id && partial.debit_line_id === line.id && partial.is_active !== false)
      .reduce((sum, partial) => sum + Number(partial.amount || 0), 0);
    const matchedCredit = db.account_partial_reconciles
      .filter(partial => partial.credit_move_id === move.id && partial.credit_line_id === line.id && partial.is_active !== false)
      .reduce((sum, partial) => sum + Number(partial.amount || 0), 0);
    const openDebit = Math.max(0, debitBase - matchedDebit);
    const openCredit = Math.max(0, creditBase - matchedCredit);
    return {
      openDebit,
      openCredit,
      openAmount: openDebit || openCredit,
      side: openDebit > 0 ? 'debit' : openCredit > 0 ? 'credit' : debitBase > 0 ? 'debit' : 'credit',
      reconciled: (openDebit + openCredit) <= 0.01,
    };
  }

  function refreshMoveLineReconcileFlags(db, move) {
    (move.line_ids || []).forEach(line => {
      if (!isReconcilableAccount(line.account_id)) return;
      const residual = lineOpenAmount(db, move, line);
      line.amount_residual = residual.openAmount;
      line.reconciled = residual.reconciled;
    });
    upsertLegacyJournalEntry(db, move);
  }

  const FinanceService = {
    moveTypes: MOVE_TYPES,
    stateLabels: STATE_LABELS,

    validateBalanced(lines = []) {
      if (!Array.isArray(lines) || lines.length < 2) throw new Error('القيد يحتاج سطرين على الأقل');
      const totals = lineTotals(lines);
      if (Math.abs(totals.debit - totals.credit) > 0.01) {
        throw new Error('القيد غير متوازن: المدين يجب أن يساوي الدائن');
      }
      if (totals.debit <= 0) throw new Error('القيد يحتاج مبلغاً أكبر من صفر');
      return totals;
    },

    getAccounts(filters = {}) {
      let list = getFinanceAccounts();
      if (filters.type) list = list.filter(a => a.type === filters.type);
      if (filters.is_active !== undefined) list = list.filter(a => a.is_active !== false);
      return list;
    },

    resolveCounterAccount,
    buildMoveLinesFromTransaction,

    isAlreadyPosted(sourceCanonicalKey, db = root.PentagonDB.getCached() || {}) {
      if (!sourceCanonicalKey) return false;
      return getMoves(db).some(move => move.sourceCanonicalKey === sourceCanonicalKey || move.origin === `finance.transactions/${sourceCanonicalKey}`);
    },

    async postFinanceTransaction(transactionId, options = {}) {
      root.PermissionService.require('account_moves', 'create');
      const db = await root.PentagonDB.load();
      const tx = (db.finance?.transactions || []).find(item => item.id === transactionId || item.sourceCanonicalKey === transactionId);
      if (!tx) throw new Error('الحركة المالية غير موجودة');
      const sourceCanonicalKey = financeTransactionKey(tx);
      const existing = getMoves(db).find(move => move.sourceCanonicalKey === sourceCanonicalKey || move.origin === `finance.transactions/${sourceCanonicalKey}`);
      if (existing) return clone(existing);
      if (options.dryRun) {
        const lines = buildMoveLinesFromTransaction(tx);
        this.validateBalanced(lines);
        return {
          dryRun: true,
          transactionId: tx.id,
          sourceCanonicalKey,
          line_ids: lines,
        };
      }
      // Server-backed lock (Production Hardening Final Lock Sprint,
      // 2026-07-04): withOperationLock (defined in app.js) acquires a real
      // DB-row lock keyed by this transaction's own sourceCanonicalKey before
      // creating anything, closing the cross-tab/cross-device race for the
      // "any future posting that uses sourceCanonicalKey" case explicitly
      // called out in the audit. Falls back to running unlocked only if
      // app.js somehow hasn't loaded yet (should not happen in the live app).
      const withLock = typeof root.withOperationLock === 'function' ? root.withOperationLock : (key, type, fn) => fn();
      const posted = await withLock(sourceCanonicalKey, 'finance_transaction', async () => {
        // Re-check after acquiring the lock — closes the window where a
        // concurrent attempt for this exact key completed between our first
        // `existing` check above and now.
        const freshDb = await root.PentagonDB.load();
        const raceWinner = getMoves(freshDb).find(move => move.sourceCanonicalKey === sourceCanonicalKey || move.origin === `finance.transactions/${sourceCanonicalKey}`);
        if (raceWinner) return clone(raceWinner);
        const draft = await this.createMove({
          journal_id: (tx.sourceType === 'cashbox' || tx.paymentMethod === 'cash') ? 'j_bank' : 'j_gen',
          move_type: 'entry',
          date: tx.date || todayISO(),
          partner_id: tx.customerId || tx.partyName || tx.paidByName || '',
          origin: `finance.transactions/${sourceCanonicalKey}`,
          sourceType: tx.sourceType || 'finance.transactions',
          sourceId: tx.sourceId || tx.id || '',
          sourceCanonicalKey,
          financeTransactionId: tx.id || '',
          postingEngine: 'finance_transactions_v1',
          reviewStatus: tx.accountId === 'suspense' ? 'needs_review' : '',
          line_ids: buildMoveLinesFromTransaction(tx),
          companyId: tx.companyId || '',
          skip_backup: options.skip_backup !== false,
        });
        return this.postMove(draft.id, { skip_backup: true });
      });
      await root.PentagonDB.mutate(mdb => {
        const saved = (mdb.finance?.transactions || []).find(item => item.id === tx.id);
        if (saved) {
          saved.accountMoveId = posted.id;
          saved.v6_move_id = posted.id;
          saved.postingStatus = 'posted';
          saved.postedAt = posted.posted_at || now();
          saved.sourceCanonicalKey = sourceCanonicalKey;
        }
      });
      return posted;
    },

    async postAllUnpostedFinanceTransactions(options = {}) {
      root.PermissionService.require('account_moves', 'create');
      const db = await root.PentagonDB.load();
      const transactions = (db.finance?.transactions || []).filter(tx => {
        const amount = Math.abs(cashboxEffect(tx) || money(tx.amount));
        if (amount <= 0) return false;
        if (tx.postingStatus === 'posted' && tx.accountMoveId) return false;
        return !this.isAlreadyPosted(financeTransactionKey(tx), db);
      });
      if (options.dryRun) {
        return {
          dryRun: true,
          candidates: transactions.map(tx => ({
            id: tx.id,
            sourceCanonicalKey: financeTransactionKey(tx),
            line_ids: buildMoveLinesFromTransaction(tx),
          })),
        };
      }
      const backup = await backupBeforeLiveFinanceMutation(options.skip_backup ? false : (options.backup_tag || 'pre_finance_transaction_posting'));
      const posted = [];
      for (const tx of transactions) {
        posted.push(await this.postFinanceTransaction(tx.id, { skip_backup: true }));
      }
      return { posted, backup };
    },

    async getMoves(options = {}) {
      root.PermissionService.require('account_moves', 'read');
      const db = await root.PentagonDB.load();
      let moves = getMoves(db).filter(move => move.is_active !== false);
      moves = tenantScope('account_moves', moves, { db, includeGlobal: options.includeGlobal !== false });
      if (options.state) moves = moves.filter(move => move.state === options.state);
      if (options.move_type) moves = moves.filter(move => move.move_type === options.move_type);
      if (options.dateFrom) moves = moves.filter(move => move.date >= options.dateFrom);
      if (options.dateTo) moves = moves.filter(move => move.date <= options.dateTo);
      if (options.journal_id) moves = moves.filter(move => move.journal_id === options.journal_id);
      return clone(moves).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.name || '').localeCompare(String(a.name || '')));
    },

    async getMove(moveId) {
      root.PermissionService.require('account_moves', 'read');
      const db = await root.PentagonDB.load();
      const move = findMove(db, moveId);
      if (move && !tenantCanRead('account_moves', move, { db })) return null;
      return move ? clone(move) : null;
    },

    async createMove(payload = {}) {
      root.PermissionService.require('account_moves', 'create');
      await backupBeforeLiveFinanceMutation(payload.skip_backup ? false : (payload.backup_tag || 'pre_account_move'));
      let created;
      await root.PentagonDB.mutate(db => {
        const moves = ensureMoveCollections(db);
        const move = createDraftMoveObject(db, payload);
        assertNotLocked(db, move.date, 'إنشاء/تعديل');
        moves.push(move);
        upsertLegacyJournalEntry(db, move);
        created = clone(move);
        // T2.3: chatter-lite history, persisted in this same mutate txn.
        if (root.TrackChanges) root.TrackChanges.recordInto(db, 'account_moves', move.id, { _event: 'created', name: move.name || '/', journal: move.journal_id, date: move.date, amount: move.amount_total });
      });
      await root.AuditService.createEvent('account_moves.created', created.id, { total: created.amount_total, move_type: created.move_type });
      return created;
    },

    async updateMove(moveId, changes = {}) {
      root.PermissionService.require('account_moves', 'update');
      await backupBeforeLiveFinanceMutation(changes.skip_backup ? false : (changes.backup_tag || 'pre_account_move_update'));
      let updated;
      await root.PentagonDB.mutate(db => {
        const moves = ensureMoveCollections(db);
        const move = moves.find(item => item.id === moveId);
        tenantPrepareUpdate('account_moves', move, changes, { db });
        if (!move) throw new Error('القيد غير موجود');
        if (move.state !== 'draft') throw new Error('يمكن تعديل المسودة فقط');
        assertNotLocked(db, move.date, 'تعديل');
        const beforeSnapshot = clone(move); // T2.3: pre-image for the field diff
        const date = changes.date || move.date;
        assertNotLocked(db, date, 'تعديل');
        const nextLines = changes.line_ids || changes.lines;
        if (nextLines) {
          move.line_ids = nextLines.map((line, index) => normalizeLine(line, index, changes.partner_id || move.partner_id || ''));
          move.amount_total = this.validateBalanced(move.line_ids).debit;
        }
        ['journal_id', 'date', 'move_type', 'partner_id', 'origin'].forEach(field => {
          if (changes[field] !== undefined) move[field] = changes[field];
        });
        validateMoveType(move.move_type);
        move.updated_at = now();
        move.updated_by = root.PentagonAuth?.getCurrentUser?.()?.id || 'system';
        upsertLegacyJournalEntry(db, move);
        updated = clone(move);
        // T2.3: record the field-level diff, persisted in this same mutate txn.
        if (root.TrackChanges) root.TrackChanges.recordDiff('account_moves', move.id, beforeSnapshot, move, undefined, db);
      });
      await root.AuditService.createEvent('account_moves.updated', updated.id, { total: updated.amount_total });
      return updated;
    },

    async postMove(moveId, options = {}) {
      root.PermissionService.require('account_moves', 'update');
      await backupBeforeLiveFinanceMutation(options.skip_backup ? false : (options.backup_tag || 'pre_account_move_post'));
      let posted;
      await root.PentagonDB.mutate(db => {
        const moves = ensureMoveCollections(db);
        const move = moves.find(item => item.id === moveId || item.legacy_journal_entry_id === moveId);
        tenantPrepareUpdate('account_moves', move, {}, { db });
        if (!move) throw new Error('القيد غير موجود');
        if (move.state !== 'draft') throw new Error('يمكن ترحيل المسودات فقط');
        assertNotLocked(db, move.date, 'ترحيل');
        this.validateBalanced(move.line_ids || []);
        if (!move.name || move.name === '/') move.name = nextSequenceName(db, move);
        move.state = 'posted';
        move.posted_at = now();
        move.updated_at = move.posted_at;
        move.updated_by = root.PentagonAuth?.getCurrentUser?.()?.id || 'system';
        recomputePostedHashChain(db);
        posted = clone(move);
        // T2.3: record the post event in this same mutate txn.
        if (root.TrackChanges) root.TrackChanges.recordInto(db, 'account_moves', move.id, { _event: 'posted', name: move.name });
      });
      await root.AuditService.createEvent('account_moves.posted', posted.id, { name: posted.name, hash: posted.hash });
      return posted;
    },

    async cancelMove(moveId, options = {}) {
      root.PermissionService.require('account_moves', 'update');
      await backupBeforeLiveFinanceMutation(options.skip_backup ? false : (options.backup_tag || 'pre_account_move_cancel'));
      const original = await this.getMove(moveId);
      if (!original) throw new Error('القيد غير موجود');
      if (original.state !== 'posted') throw new Error('يمكن إلغاء القيود المرحلة فقط');
      const db = await root.PentagonDB.load();
      assertNotLocked(db, original.date, 'إلغاء');
      if ((db.account_moves || []).some(move => move.reversed_of === original.id)) {
        throw new Error('يوجد قيد عكسي لهذا القيد مسبقاً');
      }
      const reversal = await this.createMove({
        journal_id: original.journal_id,
        date: options.date || todayISO(),
        move_type: original.move_type,
        partner_id: original.partner_id,
        origin: `reversal-of/${original.id}`,
        reversed_of: original.id,
        companyId: original.companyId || '',
        line_ids: (original.line_ids || []).map(line => ({
          account_id: line.account_id,
          label: `عكس: ${line.label || original.name || ''}`,
          debit: Number(line.credit || 0),
          credit: Number(line.debit || 0),
          partner_id: line.partner_id || '',
          department_id: line.department_id || '',
        })),
        skip_backup: true,
      });
      const postedReversal = await this.postMove(reversal.id, { skip_backup: true });
      let cancelled;
      await root.PentagonDB.mutate(mutateDb => {
        const move = (mutateDb.account_moves || []).find(item => item.id === original.id);
        tenantPrepareUpdate('account_moves', move, {}, { db: mutateDb });
        if (!move) throw new Error('القيد غير موجود');
        move.state = 'cancel';
        move.cancelled_at = now();
        move.reversal_id = postedReversal.id;
        move.updated_at = move.cancelled_at;
        move.updated_by = root.PentagonAuth?.getCurrentUser?.()?.id || 'system';
        upsertLegacyJournalEntry(mutateDb, move);
        cancelled = clone(move);
        // T2.3: record the cancel event in this same mutate txn.
        if (root.TrackChanges) root.TrackChanges.recordInto(mutateDb, 'account_moves', original.id, { _event: 'cancelled', reversal_id: postedReversal.id });
      });
      await root.AuditService.createEvent('account_moves.cancelled', original.id, { reversal_id: postedReversal.id });
      return { cancelled, reversal: postedReversal };
    },

    async unpostMove(moveId, options = {}) {
      root.PermissionService.require('account_moves', 'update');
      await backupBeforeLiveFinanceMutation(options.skip_backup ? false : (options.backup_tag || 'pre_account_move_unpost'));
      let draft;
      await root.PentagonDB.mutate(db => {
        const move = ensureMoveCollections(db).find(item => item.id === moveId || item.legacy_journal_entry_id === moveId);
        tenantPrepareUpdate('account_moves', move, {}, { db });
        if (!move) throw new Error('القيد غير موجود');
        if (move.state !== 'posted') throw new Error('يمكن إرجاع القيود المرحلة فقط');
        assertNotLocked(db, move.date, 'إرجاع');
        move.state = 'draft';
        move.hash = null;
        move.previous_hash = null;
        move.posted_at = null;
        move.updated_at = now();
        move.updated_by = root.PentagonAuth?.getCurrentUser?.()?.id || 'system';
        upsertLegacyJournalEntry(db, move);
        draft = clone(move);
      });
      await root.AuditService.createEvent('account_moves.unposted', draft.id, { name: draft.name });
      return draft;
    },

    async setLockDate(lockDate) {
      root.PermissionService.require('account_moves', 'update');
      await root.PentagonDB.mutate(db => { db._lock_date = lockDate || ''; });
      await root.AuditService.createEvent('account_moves.lock_date', 'database', { lock_date: lockDate || '' });
      return lockDate || '';
    },

    async getOpenPartnerItems(options = {}) {
      root.PermissionService.require('account_moves', 'read');
      const db = await root.PentagonDB.load();
      ensurePaymentCollections(db);
      const search = String(options.search || '').trim().toLowerCase();
      const rows = [];
      let moves = getMoves(db).filter(move => move.state === 'posted');
      moves = tenantScope('account_moves', moves, { db, includeGlobal: options.includeGlobal !== false });
      moves.forEach(move => {
        if (options.dateFrom && String(move.date || '') < String(options.dateFrom)) return;
        if (options.dateTo && String(move.date || '') > String(options.dateTo)) return;
        if (options.exclude_payments && String(move.origin || '').startsWith('payment/')) return;
        (move.line_ids || []).forEach(line => {
          if (!isReconcilableAccount(line.account_id)) return;
          if (options.partner_id && (line.partner_id || move.partner_id || '') !== options.partner_id) return;
          if (options.account_id && line.account_id !== options.account_id) return;
          const residual = lineOpenAmount(db, move, line);
          if (residual.openAmount <= 0.01) return;
          if (options.side && residual.side !== options.side) return;
          if (Number(options.minAmount || 0) > 0 && residual.openAmount < Number(options.minAmount || 0)) return;
          if (Number(options.maxAmount || 0) > 0 && residual.openAmount > Number(options.maxAmount || 0)) return;
          if (search) {
            const haystack = `${move.name || ''} ${move.origin || ''} ${line.partner_id || move.partner_id || ''} ${line.account_id || ''} ${line.label || ''}`.toLowerCase();
            if (!haystack.includes(search)) return;
          }
          rows.push({
            move_id: move.id,
            move_name: move.name,
            move_date: move.date,
            move_origin: move.origin || '',
            line_id: line.id,
            account_id: line.account_id,
            partner_id: line.partner_id || move.partner_id || '',
            label: line.label || '',
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            open_amount: residual.openAmount,
            side: residual.side,
          });
        });
      });
      return rows.sort((a, b) => String(a.move_date || '').localeCompare(String(b.move_date || '')) || String(a.move_name || '').localeCompare(String(b.move_name || '')));
    },

    async getReconciliationSummary(options = {}) {
      root.PermissionService.require('account_moves', 'read');
      const db = await root.PentagonDB.load();
      const openItems = await this.getOpenPartnerItems(options);
      const totals = openItems.reduce((acc, item) => {
        const bucket = (item.account_id === 'payables_people' || item.account_id === 'accrued_payroll') ? 'payables' : item.account_id === 'receivables_customers' ? 'receivables' : 'other';
        acc[bucket] += Number(item.open_amount || 0);
        acc.count += 1;
        return acc;
      }, { receivables: 0, payables: 0, other: 0, count: 0 });
      return {
        openItems,
        totals,
        partials: clone(tenantScope('account_partial_reconciles', db.account_partial_reconciles || [], { db, includeGlobal: options.includeGlobal !== false })),
        payments: clone(tenantScope('account_payments', db.account_payments || [], { db, includeGlobal: options.includeGlobal !== false })),
      };
    },

    async reconcileLines(payload = {}) {
      root.PermissionService.require('account_moves', 'update');
      await backupBeforeLiveFinanceMutation(payload.skip_backup ? false : (payload.backup_tag || 'pre_account_reconcile'));
      let partial;
      await root.PentagonDB.mutate(db => {
        ensurePaymentCollections(db);
        const debitRef = findLineRef(db, payload.debit_move_id, payload.debit_line_id);
        const creditRef = findLineRef(db, payload.credit_move_id, payload.credit_line_id);
        tenantPrepareUpdate('account_moves', debitRef.move, {}, { db });
        tenantPrepareUpdate('account_moves', creditRef.move, {}, { db });
        const debitCompany = tenantCompanyId(debitRef.move);
        const creditCompany = tenantCompanyId(creditRef.move);
        if (debitCompany && creditCompany && debitCompany !== creditCompany) throw new Error('Tenant isolation blocked cross-company reconciliation');
        if (debitRef.move.state !== 'posted' || creditRef.move.state !== 'posted') throw new Error('المطابقة مسموحة للقيود المرحلة فقط');
        if (debitRef.line.account_id !== creditRef.line.account_id) throw new Error('يجب أن يكون الحساب نفسه في طرفي المطابقة');
        if (!isReconcilableAccount(debitRef.line.account_id)) throw new Error('هذا الحساب غير قابل للمطابقة في هذه المرحلة');
        const debitOpen = lineOpenAmount(db, debitRef.move, debitRef.line).openDebit;
        const creditOpen = lineOpenAmount(db, creditRef.move, creditRef.line).openCredit;
        const amount = Math.min(Number(payload.amount || 0) || debitOpen, debitOpen, creditOpen);
        if (amount <= 0.01) throw new Error('لا يوجد مبلغ مفتوح للمطابقة');
        partial = tenantStamp('account_partial_reconciles', {
          id: payload.id || makeId('APR'),
          debit_move_id: debitRef.move.id,
          debit_line_id: debitRef.line.id,
          credit_move_id: creditRef.move.id,
          credit_line_id: creditRef.line.id,
          account_id: debitRef.line.account_id,
          partner_id: payload.partner_id || debitRef.line.partner_id || creditRef.line.partner_id || '',
          amount,
          date: payload.date || todayISO(),
          payment_id: payload.payment_id || '',
          created_at: now(),
          created_by: root.PentagonAuth?.getCurrentUser?.()?.id || 'system',
          is_active: true,
        }, { db });
        db.account_partial_reconciles.push(partial);
        refreshMoveLineReconcileFlags(db, debitRef.move);
        refreshMoveLineReconcileFlags(db, creditRef.move);
      });
      await root.AuditService.createEvent('account_partial_reconciles.created', partial.id, partial);
      return clone(partial);
    },

    async createPayment(payload = {}) {
      root.PermissionService.require('account_payments', 'create');
      const amount = Number(payload.amount || 0);
      if (amount <= 0) throw new Error('مبلغ الدفعة يجب أن يكون أكبر من صفر');
      const paymentType = payload.payment_type || 'inbound';
      if (!['inbound', 'outbound'].includes(paymentType)) throw new Error('نوع الدفعة غير مدعوم');
      const partnerType = payload.partner_type || (paymentType === 'inbound' ? 'customer' : 'supplier');
      const partnerId = payload.partner_id || '';
      const date = payload.date || todayISO();
      const cashAccount = resolveAccount(payload.cash_account_id || 'cash_workshop');
      const destinationAccount = resolveAccount(payload.destination_account_id || (paymentType === 'inbound' ? 'receivables_customers' : 'payables_people'));
      const backup = await backupBeforeLiveFinanceMutation(payload.skip_backup ? false : (payload.backup_tag || 'pre_payment'));
      const lines = paymentType === 'inbound'
        ? [
            { account_id: cashAccount, debit: amount, credit: 0, label: payload.memo || 'استلام دفعة', partner_id: partnerId },
            { account_id: destinationAccount, debit: 0, credit: amount, label: payload.memo || 'استلام دفعة', partner_id: partnerId },
          ]
        : [
            { account_id: destinationAccount, debit: amount, credit: 0, label: payload.memo || 'دفع مورد', partner_id: partnerId },
            { account_id: cashAccount, debit: 0, credit: amount, label: payload.memo || 'دفع مورد', partner_id: partnerId },
          ];
      const currentCoId = payload.companyId || tenant()?.activeCompanyId?.({ db: root.PentagonDB.getCached?.() }) || (typeof root.getActiveOrgProfile === 'function' ? root.getActiveOrgProfile()?.companyId : '') || '';
      const move = await this.createMove({
        journal_id: payload.journal_id || 'j_bank',
        date,
        move_type: 'entry',
        partner_id: partnerId,
        origin: payload.origin || `payment/${Date.now()}`,
        line_ids: lines,
        companyId: currentCoId,
        skip_backup: true,
      });
      const posted = await this.postMove(move.id, { skip_backup: true });
      let payment;
      await root.PentagonDB.mutate(db => {
        ensurePaymentCollections(db);
        payment = tenantStamp('account_payments', {
          id: payload.id || makeId('PAYMENT'),
          name: posted.name,
          date,
          amount,
          payment_type: paymentType,
          partner_type: partnerType,
          partner_id: partnerId,
          journal_id: payload.journal_id || 'j_bank',
          move_id: posted.id,
          destination_account_id: destinationAccount,
          cash_account_id: cashAccount,
          memo: payload.memo || '',
          state: 'posted',
          is_reconciled: false,
          created_at: now(),
          created_by: root.PentagonAuth?.getCurrentUser?.()?.id || 'system',
          is_active: true,
          companyId: currentCoId,
        }, { db });
        db.account_payments.push(payment);
      });
      if (payload.reconcile_with?.move_id && payload.reconcile_with?.line_id) {
        const paymentMove = await this.getMove(posted.id);
        const paymentLine = (paymentMove.line_ids || []).find(line => line.account_id === destinationAccount);
        const target = payload.reconcile_with;
        const isInbound = paymentType === 'inbound';
        await this.reconcileLines({
          debit_move_id: isInbound ? target.move_id : posted.id,
          debit_line_id: isInbound ? target.line_id : paymentLine.id,
          credit_move_id: isInbound ? posted.id : target.move_id,
          credit_line_id: isInbound ? paymentLine.id : target.line_id,
          amount: Math.min(amount, Number(target.amount || amount)),
          payment_id: payment.id,
          partner_id: partnerId,
          date,
          skip_backup: true,
        });
        await root.PentagonDB.mutate(db => {
          const saved = (db.account_payments || []).find(item => item.id === payment.id);
          if (saved) saved.is_reconciled = true;
        });
        payment.is_reconciled = true;
      }
      await root.AuditService.createEvent('account_payments.created', payment.id, { amount, move_id: posted.id });
      return { payment: clone(payment), move: posted, backup };
    },

    async createCustomerInvoice(payload = {}) {
      root.PermissionService.require('account_moves', 'create');
      const amount = Number(payload.amount || 0);
      if (amount <= 0) throw new Error('مبلغ الفاتورة يجب أن يكون أكبر من صفر');
      const date = payload.date || todayISO();
      const partnerId = payload.partner_id || '';
      const memo = payload.memo || 'فاتورة عميل';
      const incomeAccount = resolveAccount(payload.income_account_id || 'income_sales');
      const backup = await backupBeforeLiveFinanceMutation(payload.skip_backup ? false : (payload.backup_tag || 'pre_customer_invoice'));
      const draft = await this.createMove({
        journal_id: payload.journal_id || 'j_sale',
        move_type: 'out_invoice',
        date,
        partner_id: partnerId,
        origin: payload.origin || `customer_invoice/${Date.now()}`,
        line_ids: [
          { account_id: resolveAccount('receivables_customers'), debit: amount, credit: 0, label: memo, partner_id: partnerId },
          { account_id: incomeAccount, debit: 0, credit: amount, label: memo, partner_id: partnerId },
        ],
        companyId: payload.companyId,
        skip_backup: true,
      });
      if (payload.post === false) return { move: draft, backup };
      const posted = await this.postMove(draft.id, { skip_backup: true });
      return { move: posted, backup };
    },

    async createVendorBill(payload = {}) {
      root.PermissionService.require('account_moves', 'create');
      const amount = Number(payload.amount || 0);
      if (amount <= 0) throw new Error('مبلغ فاتورة المورد يجب أن يكون أكبر من صفر');
      const date = payload.date || todayISO();
      const partnerId = payload.partner_id || '';
      const memo = payload.memo || 'فاتورة مورد';
      const expenseAccount = resolveAccount(payload.expense_account_id || 'expense_general');
      const backup = await backupBeforeLiveFinanceMutation(payload.skip_backup ? false : (payload.backup_tag || 'pre_vendor_bill'));
      const draft = await this.createMove({
        journal_id: payload.journal_id || 'j_purc',
        move_type: 'in_invoice',
        date,
        partner_id: partnerId,
        origin: payload.origin || `vendor_bill/${Date.now()}`,
        line_ids: [
          { account_id: expenseAccount, debit: amount, credit: 0, label: memo, partner_id: partnerId },
          { account_id: resolveAccount('payables_people'), debit: 0, credit: amount, label: memo, partner_id: partnerId },
        ],
        companyId: payload.companyId,
        skip_backup: true,
      });
      if (payload.post === false) return { move: draft, backup };
      const posted = await this.postMove(draft.id, { skip_backup: true });
      return { move: posted, backup };
    },

    async createJournalEntry(payload = {}) {
      return this.createMove({ ...payload, move_type: payload.move_type || 'entry' });
    },

    async postJournalEntry(entryId) {
      return this.postMove(entryId);
    },

    async reverseEntry(entryId, options = {}) {
      const result = await this.cancelMove(entryId, options);
      return result.reversal;
    },

    async generatePayrollEntry(payload = {}) {
      if (!(payload.totalAmount > 0)) return null;
      if (!payload.origin) throw new Error('origin is required for idempotency');
      const db = await root.PentagonDB.load();
      const scopedMoves = tenantScope('account_moves', getMoves(db), { db });
      const scopedEntries = tenantScope('journal_entries', db.journal_entries || [], { db });
      const existing = scopedMoves.find(move => move.origin === payload.origin)
        || scopedEntries.find(entry => entry.origin === payload.origin);
      if (existing) return existing;
      await backupBeforeLiveFinanceMutation(payload.skip_backup ? false : (payload.backup_tag || 'pre_payroll_entry'));
      const draft = await this.createMove({
        journal_id: 'j_payroll',
        move_type: 'entry',
        date: payload.date || todayISO(),
        origin: payload.origin,
        line_ids: [
          { account_id: resolveAccount('expense_payroll'), debit: payload.totalAmount, credit: 0, label: `رواتب شهر ${payload.month || ''}/${payload.year || ''}` },
          { account_id: resolveAccount('accrued_payroll'), debit: 0, credit: payload.totalAmount, label: 'رواتب مستحقة' },
        ],
        skip_backup: true,
      });
      return this.postMove(draft.id, { skip_backup: true });
    },

    async generatePurchaseEntry(payload = {}) {
      if (!(payload.amount > 0)) return null;
      if (!payload.origin) throw new Error('origin is required for idempotency');
      const db = await root.PentagonDB.load();
      const scopedMoves = tenantScope('account_moves', getMoves(db), { db });
      const scopedEntries = tenantScope('journal_entries', db.journal_entries || [], { db });
      const existing = scopedMoves.find(move => move.origin === payload.origin)
        || scopedEntries.find(entry => entry.origin === payload.origin);
      if (existing) return existing;
      await backupBeforeLiveFinanceMutation(payload.skip_backup ? false : (payload.backup_tag || 'pre_purchase_entry'));
      const draft = await this.createMove({
        journal_id: 'j_purc',
        move_type: 'entry',
        date: payload.date || todayISO(),
        origin: payload.origin,
        partner_id: payload.supplierId || '',
        line_ids: [
          { account_id: resolveAccount('inventory_stock'), debit: payload.amount, credit: 0, label: `شراء: ${payload.materialName || ''}`, partner_id: payload.supplierId || '' },
          { account_id: resolveAccount('payables_people'), debit: 0, credit: payload.amount, label: `مورد: ${payload.supplierId || 'مورد عام'}`, partner_id: payload.supplierId || '' },
        ],
        skip_backup: true,
      });
      return this.postMove(draft.id, { skip_backup: true });
    },

    async generateSalesEntry(payload = {}) {
      if (!(payload.amount > 0)) return null;
      if (!payload.origin) throw new Error('origin is required for idempotency');
      const db = await root.PentagonDB.load();
      const scopedMoves = tenantScope('account_moves', getMoves(db), { db });
      const scopedEntries = tenantScope('journal_entries', db.journal_entries || [], { db });
      const existing = scopedMoves.find(move => move.origin === payload.origin)
        || scopedEntries.find(entry => entry.origin === payload.origin);
      if (existing) return existing;
      await backupBeforeLiveFinanceMutation(payload.skip_backup ? false : (payload.backup_tag || 'pre_sales_entry'));
      const draft = await this.createMove({
        journal_id: 'j_sale',
        move_type: 'entry',
        date: payload.date || todayISO(),
        origin: payload.origin,
        partner_id: payload.customerId || '',
        line_ids: [
          { account_id: resolveAccount('receivables_customers'), debit: payload.amount, credit: 0, label: `وصل مبيعات: ${payload.receiptId || ''}`, partner_id: payload.customerId || '' },
          { account_id: resolveAccount('income_sales'), debit: 0, credit: payload.amount, label: `مبيعات: ${payload.customerName || ''}`, partner_id: payload.customerId || '' },
        ],
        skip_backup: true,
      });
      return this.postMove(draft.id, { skip_backup: true });
    },

    async getTrialBalance(options = {}) {
      const db = await root.PentagonDB.load();
      const accounts = getFinanceAccounts();
      let moves = getMoves(db).filter(move => move.state === 'posted');
      moves = tenantScope('account_moves', moves, { db, includeGlobal: options.includeGlobal !== false });
      if (options.dateFrom) moves = moves.filter(move => move.date >= options.dateFrom);
      if (options.dateTo) moves = moves.filter(move => move.date <= options.dateTo);
      if (options.journal_id) moves = moves.filter(move => move.journal_id === options.journal_id);

      const map = {};
      moves.forEach(move => {
        (move.line_ids || move.lines || []).forEach(line => {
          const id = line.account_id;
          if (!map[id]) map[id] = { total_debit: 0, total_credit: 0 };
          map[id].total_debit += Number(line.debit || 0);
          map[id].total_credit += Number(line.credit || 0);
        });
      });

      return Object.entries(map).map(([account_id, sums]) => {
        const acct = accounts.find(a => a.id === account_id)
          || { id: account_id, code: '?', name: account_id, type: 'asset', normal_side: 'debit' };
        const balance = sums.total_debit - sums.total_credit;
        return {
          account_id,
          code: acct.code || '?',
          name: acct.name || account_id,
          type: acct.type || 'asset',
          normal_side: acct.normal_side || 'debit',
          total_debit: sums.total_debit,
          total_credit: sums.total_credit,
          balance,
        };
      }).sort((a, b) => String(a.code).localeCompare(String(b.code)));
    },

    async getLedger(accountId, options = {}) {
      const db = await root.PentagonDB.load();
      const accounts = getFinanceAccounts();
      const acct = accounts.find(a => a.id === accountId);
      let moves = getMoves(db).filter(move => move.state === 'posted');
      moves = tenantScope('account_moves', moves, { db, includeGlobal: options.includeGlobal !== false });
      if (options.dateFrom) moves = moves.filter(move => move.date >= options.dateFrom);
      if (options.dateTo) moves = moves.filter(move => move.date <= options.dateTo);
      moves.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.name).localeCompare(String(b.name)));

      let running = 0;
      const rows = [];
      moves.forEach(move => {
        (move.line_ids || []).filter(line => line.account_id === accountId).forEach(line => {
          running += Number(line.debit || 0) - Number(line.credit || 0);
          rows.push({
            entry_id: move.id,
            entry_name: move.name,
            entry_date: move.date,
            journal_id: move.journal_id,
            label: line.label || '',
            debit: Number(line.debit || 0),
            credit: Number(line.credit || 0),
            running_balance: running,
          });
        });
      });
      return { account: acct || { id: accountId }, rows };
    },

    async getProfitAndLoss(options = {}) {
      const tb = await this.getTrialBalance(options);
      const income = tb.filter(r => r.type === 'income').map(r => ({ ...r, amount: r.total_credit - r.total_debit }));
      const expense = tb.filter(r => r.type === 'expense').map(r => ({ ...r, amount: r.total_debit - r.total_credit }));
      const totalIncome = income.reduce((s, r) => s + r.amount, 0);
      const totalExpense = expense.reduce((s, r) => s + r.amount, 0);
      return { income, expense, totalIncome, totalExpense, net: totalIncome - totalExpense };
    },

    computeAgingForItems(items = []) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const aging = { current: 0, mid: 0, late: 0, critical: 0 };
      items.forEach(item => {
        const itemDate = new Date(item.move_date || todayISO());
        itemDate.setHours(0, 0, 0, 0);
        const diffTime = Math.max(0, today - itemDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        const amount = Number(item.open_amount || 0);
        if (diffDays <= 30) {
          aging.current += amount;
        } else if (diffDays <= 60) {
          aging.mid += amount;
        } else if (diffDays <= 90) {
          aging.late += amount;
        } else {
          aging.critical += amount;
        }
      });
      return aging;
    },

    async getPartnerLedger(partnerId, options = {}) {
      const db = await root.PentagonDB.load();
      const openItems = await this.getOpenPartnerItems({ partner_id: partnerId });
      
      let totalDebit = 0;
      let totalCredit = 0;
      
      const moves = tenantScope('account_moves', getMoves(db).filter(move => move.state === 'posted'), { db, includeGlobal: options.includeGlobal !== false });
      moves.forEach(move => {
        (move.line_ids || []).forEach(line => {
          const linePartner = line.partner_id || move.partner_id || '';
          if (linePartner === partnerId) {
            totalDebit += Number(line.debit || 0);
            totalCredit += Number(line.credit || 0);
          }
        });
      });
      
      const balance = totalDebit - totalCredit;
      const aging = this.computeAgingForItems(openItems);
      
      return {
        partnerId,
        totalDebit,
        totalCredit,
        balance,
        aging,
        openItemsCount: openItems.length
      };
    },

    async getPartnerStatement(partnerId, startDate = '', endDate = '') {
      const db = await root.PentagonDB.load();
      const moves = tenantScope('account_moves', getMoves(db)
        .filter(move => move.state === 'posted'), { db })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.name).localeCompare(String(b.name)));
        
      let startingBalance = 0;
      const txs = [];
      
      moves.forEach(move => {
        const moveDate = move.date || todayISO();
        
        (move.line_ids || []).forEach(line => {
          const linePartner = line.partner_id || move.partner_id || '';
          if (linePartner === partnerId) {
            const debit = Number(line.debit || 0);
            const credit = Number(line.credit || 0);
            const net = debit - credit;
            
            if (startDate && moveDate < startDate) {
              startingBalance += net;
            } else if ((!startDate || moveDate >= startDate) && (!endDate || moveDate <= endDate)) {
              txs.push({
                move_id: move.id,
                move_name: move.name,
                date: moveDate,
                label: line.label || move.origin || 'قيد محاسبي',
                account_id: line.account_id,
                debit,
                credit,
                net
              });
            }
          }
        });
      });
      
      let running = startingBalance;
      const rows = txs.map(tx => {
        running += tx.net;
        return {
          ...tx,
          running_balance: running
        };
      });
      
      return {
        partnerId,
        startDate,
        endDate,
        startingBalance,
        endingBalance: running,
        rows
      };
    },

    async getPartnerAgingSummary() {
      const db = await root.PentagonDB.load();
      ensurePaymentCollections(db);
      const openItems = await this.getOpenPartnerItems();
      const partnersMap = {};
      
      openItems.forEach(item => {
        const partner = item.partner_id || 'بدون طرف';
        if (!partnersMap[partner]) {
          partnersMap[partner] = [];
        }
        partnersMap[partner].push(item);
      });
      
      const summary = [];
      Object.entries(partnersMap).forEach(([partner, items]) => {
        const aging = this.computeAgingForItems(items);
        const totalOpen = items.reduce((s, item) => s + Number(item.open_amount || 0), 0);
        summary.push({
          partner,
          totalOpen,
          aging
        });
      });
      
      return summary;
    },

    async processBankReconciliation(bankStatementLines = []) {
      const db = await root.PentagonDB.load();
      const cashMoves = tenantScope('account_moves', getMoves(db)
        .filter(move => move.state === 'posted' && move.journal_id === 'j_bank'), { db });
        
      const cashLines = [];
      cashMoves.forEach(move => {
        (move.line_ids || []).forEach(line => {
          if (line.account_id === 'cash_workshop') {
            cashLines.push({
              move_id: move.id,
              move_name: move.name,
              date: move.date,
              label: line.label,
              amount: line.debit || line.credit || 0,
              side: line.debit > 0 ? 'debit' : 'credit',
              line_id: line.id,
              reconciled: !!line.reconciled
            });
          }
        });
      });
      
      return bankStatementLines.map(line => {
        const matches = cashLines.filter(cl => {
          if (cl.reconciled) return false;
          const amtMatch = Math.abs(cl.amount - Math.abs(line.amount)) < 0.01;
          const dateDiff = Math.abs(new Date(cl.date) - new Date(line.date)) / (1000 * 60 * 60 * 24);
          const dateMatch = dateDiff <= 3;
          return amtMatch && dateMatch;
        });
        
        return {
          bankLine: line,
          matchedLines: matches,
          recommended: matches[0] || null
        };
      });
    },

    computeHash,
    isLocked(date, db = root.PentagonDB.getCached() || {}) {
      return isLocked(db, date);
    },
  };

  root.FinanceService = FinanceService;
  services.finance = FinanceService;
})();
