function getCashboxSignedAmount(tx) {
  const effect = Number(tx?.cashboxEffect);
  if (Number.isFinite(effect) && effect !== 0) return Math.round(effect);
  const amount = asMoney(tx?.amount);
  if (tx?.direction === 'in') return amount;
  if (tx?.direction === 'out') return -amount;
  return 0;
}

// SOURCE OF TRUTH for the real cashbox balance: account_moves (the v6 ledger),
// never finance.transactions/finance.cashOpening. Audit fix 2026-07-04: the
// previous implementation summed only legacy `finance.transactions` (sourceType
// 'cashbox') on top of `finance.cashOpening`, so once payroll accrual/advance-
// settlement/payment/adjustment moves started posting straight to account_moves
// (they never write a finance.transactions row) the two numbers silently
// diverged — the cashbox screen kept showing the pre-payroll balance while the
// real ledger had already moved. The opening balance is itself now a posted
// account_move (dated 2026-02-14, sourceCanonicalKey
// "OPENING_CASHBOX_LEGACY_2026_02_14_997000", origin "opening-balance/cash_workshop"),
// so summing account_moves alone already includes it; do NOT also add
// finance.cashOpening here or the opening balance gets double-counted.
// See getLegacyCashboxReconciliationSnapshot() below for the separate,
// clearly-labeled legacy/import-time view — the two must never be merged
// into one number.
function getCashBalance(accountId = 'cash_workshop') {
  const db = window.PentagonDB?.getCached?.() || window.PentagonDB?.cache || {};
  const moves = Array.isArray(db.account_moves) ? db.account_moves : [];
  let balance = 0;
  moves.forEach(move => {
    if (move.state !== 'posted') return;
    (move.line_ids || []).forEach(line => {
      if (line.account_id === accountId) balance += Number(line.debit || 0) - Number(line.credit || 0);
    });
  });
  return balance;
}

// LEGACY CASHBOX RECONCILIATION (audit 2026-07-04): a separate, read-only
// diagnostic snapshot of the pre-migration numbers, for reconciliation only —
// NEVER use this as the authoritative balance and never add its "importedFinal"
// to getCashBalance()'s result (that would double count the opening balance,
// which is exactly the bug this audit fixed). It intentionally mirrors
// finance.cashOpening + the legacy finance.transactions cashbox rows exactly
// as they stood at import time, so a human can visually reconcile "what the
// Excel/legacy cashbox said" against "what the general ledger says now"
// (getCashBalance()) — the two are expected to diverge once payroll/adjustment
// moves post directly to account_moves without a mirrored finance.transactions row.
function getLegacyCashboxReconciliationSnapshot() {
  ensureFinance();
  const openingMeta = asMoney(finance.cashOpening);
  let importedCashIn = 0;
  let importedCashOut = 0;
  finance.transactions.forEach(tx => {
    if (tx.sourceType !== 'cashbox') return;
    const signed = getCashboxSignedAmount(tx);
    if (signed > 0) importedCashIn += signed;
    else importedCashOut += Math.abs(signed);
  });
  return {
    openingMeta,
    importedCashIn,
    importedCashOut,
    importedFinal: openingMeta + importedCashIn - importedCashOut,
    note: 'Legacy/import-time reconciliation only — NOT the authoritative balance. See getCashBalance() (account_moves) for the real current cashbox figure.',
  };
}

function getCashSummaryForDate(date) {
  ensureFinance();
  return finance.transactions.reduce((acc, tx) => {
    if (tx.sourceType !== 'cashbox' || tx.date !== date) return acc;
    const signed = getCashboxSignedAmount(tx);
    if (signed > 0) acc.in += signed;
    if (signed < 0) acc.out += Math.abs(signed);
    return acc;
  }, { in: 0, out: 0 });
}

function getCashboxTotals() {
  ensureFinance();
  return finance.transactions.reduce((acc, tx) => {
    if (tx.sourceType !== 'cashbox') return acc;
    const signed = getCashboxSignedAmount(tx);
    if (signed > 0) acc.in += signed;
    if (signed < 0) acc.out += Math.abs(signed);
    return acc;
  }, { in: 0, out: 0 });
}

function getExpenseTotal() {
  ensureFinance();
  const cashboxOut = getCashboxTotals().out;
  const otherExpenses = finance.transactions
    .filter(tx => tx.sourceType !== 'cashbox' && (tx.type === 'expense' || tx.type === 'salary_payment'))
    .reduce((sum, tx) => sum + asMoney(tx.amount), 0);
  return cashboxOut + otherExpenses;
}

function getIncomeTotal() {
  ensureFinance();
  const cashboxIn = getCashboxTotals().in;
  const otherIncome = finance.transactions
    .filter(tx => tx.sourceType !== 'cashbox' && (tx.type === 'income' || tx.type === 'sales_receipt'))
    .reduce((sum, tx) => sum + asMoney(tx.amount), 0);
  return cashboxIn + otherIncome;
}

function renderCashbox() {
  ensureFinance();
  setFinanceDefaultsInForms();
  const date = document.getElementById('cashboxDate')?.value || todayISO();
  const summary = getCashSummaryForDate(date);
  const symbol = getAdminCurrencySymbol();
  updateValue('cashboxBalanceTop', `${formatNum(getCashBalance())} ${symbol}`);
  updateValue('cashboxDateIn', `${formatNum(summary.in)} ${symbol}`);
  updateValue('cashboxDateOut', `${formatNum(summary.out)} ${symbol}`);
  updateValue('cashboxDateNet', `${formatNum(summary.in - summary.out)} ${symbol}`);

  const tbody = document.getElementById('cashboxBody');
  if (!tbody) return;
  const rows = getFinanceTransactions().filter(tx => tx.sourceType === 'cashbox' && tx.date === date);
  tbody.innerHTML = rows.length ? rows.map(tx => {
    // Use the same sign-authoritative helper the totals above are built from,
    // so a row with a cashboxEffect override (e.g. a cash-count adjustment)
    // shows the same direction here as it does in the daily/overall totals.
    const signed = getCashboxSignedAmount(tx);
    const isIn = signed > 0;
    return `
    <tr>
      <td>${tx.date}</td>
      <td>${isIn ? 'داخل' : 'خارج'}</td>
      <td>${tx.description || '-'}</td>
      <td>${tx.partyName || tx.paidByName || '-'}</td>
      <td class="${isIn ? 'finance-in' : 'finance-out'}">${formatNum(Math.abs(signed))}</td>
    </tr>
  `;
  }).join('') : '<tr><td colspan="5" class="empty-cell">لا توجد حركة قاصة بهذا التاريخ</td></tr>';
}

function setCashboxDateValue(dateValue) {
  const input = document.getElementById('cashboxDate');
  if (input) input.value = dateValue;
  renderCashbox();
}

function shiftCashboxDate(deltaDays) {
  const input = document.getElementById('cashboxDate');
  const current = input?.value || todayISO();
  const date = new Date(`${current}T12:00:00`);
  date.setDate(date.getDate() + deltaDays);
  setCashboxDateValue(date.toISOString().slice(0, 10));
}

function setCashboxToday() {
  setCashboxDateValue(todayISO());
}

// ─── Open Cashbox Transaction Modal ───
async function openCashboxTransactionModal() {
  ensureFinance();
  const expenseCats = finance.categories.expense.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  const incomeCats = finance.categories.income.map(c => `<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`).join('');
  const partnerOptions = renderFinancePartnerDatalistOptions('customer');

  const form = await showOmniModal('إضافة حركة نقدية للقاصة', `
    <datalist id="cashboxPartnerOptions">${partnerOptions}</datalist>
    <div class="je-form-row">
      <label>التاريخ<input id="cashboxTxDate" type="date" class="form-input" value="${todayISO()}"></label>
      <label>نوع الحركة
        <select id="cashboxTxDirection" class="form-input">
          <option value="in">إيداع (وارد للقاصة)</option>
          <option value="out">سحب (مصروف من القاصة)</option>
        </select>
      </label>
      <label>المبلغ<input id="cashboxTxAmount" inputmode="numeric" class="form-input" placeholder="0"></label>
    </div>
    <div class="je-form-row">
      <label>التصنيف<select id="cashboxTxCategory" class="form-input">${incomeCats}</select></label>
      <label>الطرف/الشريك<input id="cashboxTxPartner" list="cashboxPartnerOptions" class="form-input" placeholder="الشريك أو العميل"></label>
      <label>البيان / الوصف<input id="cashboxTxMemo" class="form-input" placeholder="وصف الحركة"></label>
    </div>
  `, body => {
    const amount = parseFinanceAmountInput(body.querySelector('#cashboxTxAmount')?.value);
    const date = body.querySelector('#cashboxTxDate')?.value || todayISO();
    const direction = body.querySelector('#cashboxTxDirection')?.value || 'in';
    const categoryId = body.querySelector('#cashboxTxCategory')?.value || '';
    const partner = body.querySelector('#cashboxTxPartner')?.value.trim() || '';
    const memo = body.querySelector('#cashboxTxMemo')?.value.trim() || '';

    if (amount <= 0) {
      showToast('المبلغ يجب أن يكون أكبر من صفر', 'warning');
      return false;
    }
    return { date, direction, amount, categoryId, partner, memo };
  }, body => {
    const dirSelect = body.querySelector('#cashboxTxDirection');
    if (dirSelect) {
      dirSelect.onchange = () => {
        const dir = dirSelect.value;
        const catSelect = body.querySelector('#cashboxTxCategory');
        if (dir === 'in') {
          catSelect.innerHTML = incomeCats;
        } else {
          catSelect.innerHTML = expenseCats;
        }
      };
    }
  });

  if (!form) return;

  const isDeposit = form.direction === 'in';
  const txType = isDeposit ? 'income' : 'expense';

  const tx = {
    type: txType,
    direction: form.direction,
    sourceType: 'cashbox',
    date: form.date,
    amount: form.amount,
    categoryId: form.categoryId,
    departmentId: isDeposit ? 'dept_sales' : 'dept_workshop',
    accountId: isDeposit
      ? (finance.categories.income.find(c => c.id === form.categoryId) || {}).accountId || 'income_sales'
      : (finance.categories.expense.find(c => c.id === form.categoryId) || {}).accountId || 'expense_general',
    description: form.memo || (isDeposit ? 'إيداع نقدي يدوياً' : 'سحب نقدي يدوياً'),
    partyName: form.partner,
    paidByName: ''
  };

  const added = addFinanceTransaction(tx);
  if (added) {
    showToast('تمت إضافة الحركة النقدية وحفظ القاصة بنجاح', 'success');
    financeRefreshAll();
  } else {
    showToast('فشل في إضافة الحركة النقدية', 'error');
  }
}

window.openCashboxTransactionModal = openCashboxTransactionModal;
