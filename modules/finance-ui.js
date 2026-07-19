/**
 * OCTAGON OMNISYSTEM - V6 Finance UI Tab Module.
 * Extracted verbatim from app.js per T4.6 de-monolith task.
 */

// ── Block 1: Dashboard & Overview Renderers ──────────────────────────────────

function renderFinanceDashboard() {
  ensureFinance();
  setFinanceDefaultsInForms();
  const todayCash = getCashSummaryForDate(todayISO());
  const payrollPaid = finance.transactions.filter(tx => tx.type === 'salary_payment').reduce((sum, tx) => sum + asMoney(tx.amount), 0);
  const customerBalances = finance.customers.reduce((sum, c) => sum + Math.max(0, getCustomerBalance(c)), 0);
  const workshopExpenses = finance.transactions.filter(tx => (tx.type === 'expense' || tx.type === 'salary_payment') && (tx.departmentId === 'dept_workshop' || tx.departmentId === 'dept_payroll')).reduce((sum, tx) => sum + asMoney(tx.amount), 0);
  const symbol = getAdminCurrencySymbol();
  updateValue('financeCashBalance', `${formatNum(getCashBalance())} ${symbol}`);
  updateValue('financeIncomeTotal', `${formatNum(getIncomeTotal())} ${symbol}`);
  updateValue('financeExpenseTotal', `${formatNum(getExpenseTotal())} ${symbol}`);
  updateValue('financeTodayNet', `${formatNum(todayCash.in - todayCash.out)} ${symbol}`);
  updateValue('financePayrollPaid', `${formatNum(payrollPaid)} ${symbol}`);
  updateValue('financeCustomerBalances', `${formatNum(customerBalances)} ${symbol}`);
  updateValue('financeWorkshopExpenses', `${formatNum(workshopExpenses)} ${symbol}`);
  updateValue('financeNetBalance', `${formatNum(getIncomeTotal() - getExpenseTotal())} ${symbol}`);

  const tbody = document.getElementById('financeRecentBody');
  if (tbody) {
    const rows = getFinanceTransactions().slice(0, 8);
    tbody.innerHTML = rows.length ? rows.map(tx => `
      <tr>
        <td>${tx.date}</td>
        <td>${tx.direction === 'in' ? 'داخل' : tx.direction === 'out' ? 'خارج' : 'تسوية'}</td>
        <td>${tx.description || getCategoryName(tx.type === 'income' ? 'income' : 'expense', tx.categoryId)}</td>
        <td>${getDepartmentName(tx.departmentId)}</td>
        <td>${tx.partyName || tx.paidByName || '-'}</td>
        <td class="${tx.direction === 'in' ? 'finance-in' : 'finance-out'}">${formatNum(tx.amount)}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="empty-cell">لا توجد حركات مالية بعد</td></tr>';
  }

  const accounts = document.getElementById('chartAccountsList');
  if (accounts) {
    const db = window.PentagonDB ? window.PentagonDB.getCached() : null;
    const moves = db && Array.isArray(db.account_moves) ? db.account_moves.filter(m => m.state === 'posted') : [];
    const balances = {};
    finance.accounts.forEach(acc => { balances[acc.id] = 0; });
    moves.forEach(move => {
      (move.line_ids || []).forEach(line => {
        if (balances[line.account_id] !== undefined) {
          balances[line.account_id] += Number(line.debit || 0) - Number(line.credit || 0);
        }
      });
    });
    const symbol = getAdminCurrencySymbol();
    accounts.innerHTML = finance.accounts.map(acc => {
      const balance = balances[acc.id] || 0;
      const formattedBalance = formatNum(Math.abs(balance));
      const sideLabel = balance > 0 ? 'مدين' : balance < 0 ? 'دائن' : '';
      const balanceClass = balance > 0 ? 'finance-in' : balance < 0 ? 'finance-out' : 'text-muted';
      return `
        <div class="account-row" style="display:flex; justify-content:space-between; align-items:center; padding: 6px 0; border-bottom:1px solid rgba(255,255,255,0.05)">
          <div style="display:flex; gap:8px; align-items:center">
            <span class="account-code" style="background:rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; font-size:11px">${acc.code}</span>
            <span>${acc.name}</span>
          </div>
          <div style="text-align:left">
            <strong class="${balanceClass}" style="font-size:13px">${formattedBalance} ${symbol}</strong>
            <small style="font-size:9px; color:var(--text-muted); display:block">${sideLabel}</small>
          </div>
        </div>
      `;
    }).join('');
  }

  const peopleBalances = document.getElementById('peopleBalancesList');
  if (peopleBalances) {
    const names = [...new Set([
      ...employees.map(e => e.name).filter(Boolean),
      ...finance.parties.filter(p => p.type === 'person').map(p => p.name).filter(Boolean)
    ])];
    const rows = names.map(name => ({ name, balance: getPersonBalance(name) })).filter(row => row.balance !== 0);
    peopleBalances.innerHTML = rows.length ? rows.map(row => `
      <div class="account-row">
        <span class="account-code">ذمة</span>
        <span>${row.name}</span>
        <small class="finance-out">${formatNum(row.balance)}</small>
      </div>
    `).join('') : '<div class="empty-cell">لا توجد مبالغ مدفوعة من جيب الأشخاص</div>';
  }

  const deptSummary = document.getElementById('departmentSummaryList');
  if (deptSummary) {
    const rows = finance.departments.map(dept => {
      const totals = finance.transactions.reduce((acc, tx) => {
        if (tx.departmentId !== dept.id) return acc;
        if (tx.direction === 'in') acc.in += asMoney(tx.amount);
        if (tx.direction === 'out') acc.out += asMoney(tx.amount);
        return acc;
      }, { in: 0, out: 0 });
      return { ...dept, ...totals };
    }).filter(row => row.in || row.out);
    deptSummary.innerHTML = rows.length ? rows.map(row => `
      <div class="department-row">
        <span>${row.name}</span>
        <small class="finance-in">داخل ${formatNum(row.in)}</small>
        <small class="finance-out">خارج ${formatNum(row.out)}</small>
      </div>
    `).join('') : '<div class="empty-cell">لا توجد حركة موزعة على الأقسام بعد</div>';
  }
  renderV6FinanceOverview();
}

function renderV6FinanceOverview() {
  const dashboard = document.getElementById('financeTab-dashboard');
  if (!dashboard || !window.FinanceService || !window.PentagonDB) return;
  let overview = document.getElementById('v6FinanceOverview');
  if (!overview) {
    overview = document.createElement('div');
    overview.id = 'v6FinanceOverview';
    dashboard.prepend(overview);
  }
  overview.innerHTML = '<div class="glass-card" style="margin:16px 0;padding:16px;color:var(--text-muted)">جاري تحميل ملخص المحاسبة V6...</div>';
  Promise.all([
    FinanceService.getMoves(),
    FinanceService.getReconciliationSummary(),
    PentagonDB.load({ force: true }),
  ]).then(([moves, recon, db]) => {
    const posted = moves.filter(move => move.state === 'posted').length;
    const draft = moves.filter(move => move.state === 'draft').length;
    const cancelled = moves.filter(move => move.state === 'cancel').length;
    overview.innerHTML = `
      <div class="glass-card" style="margin:16px 0">
        <div style="display:flex;justify-content:space-between;gap:14px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <h3 class="section-title" style="margin:0">المالية V6</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">محرك القيود المحاسبية نشط · المخطط ${escapeHtml(db._schema_version || '-')} · الإصدار ${escapeHtml(db._release_tag || '-')}</div>
          </div>
        </div>
        <div class="stats-grid" style="margin-bottom:12px">
          <div class="stat-card"><span class="stat-label">القيود</span><strong>${moves.length}</strong><small>مرحّل ${posted} · مسودة ${draft} · ملغي ${cancelled}</small></div>
          <div class="stat-card"><span class="stat-label">ذمم العملاء</span><strong>${formatNum(recon.totals?.receivables || 0)}</strong><small>${(recon.openItems || []).filter(item => item.account_id === 'receivables_customers').length} بند مفتوح</small></div>
          <div class="stat-card"><span class="stat-label">ذمم الموردين/الرواتب</span><strong>${formatNum(recon.totals?.payables || 0)}</strong><small>${(recon.openItems || []).filter(item => item.account_id !== 'receivables_customers').length} بند مفتوح</small></div>
          <div class="stat-card"><span class="stat-label">الدفعات والمطابقة</span><strong>${(recon.payments || []).length} / ${(recon.partials || []).length}</strong><small>دفعات / مطابقات</small></div>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;color:var(--text-muted);font-size:12px">
          <span class="je-balance-chip">تاريخ الإقفال: ${escapeHtml(db._lock_date || 'غير محدد')}</span>
          <span class="je-balance-chip">الحركات القديمة محفوظة: ${(db.journal_entries || []).length}</span>
          <span class="je-balance-chip">القيود: ${(db.account_moves || []).length}</span>
        </div>
      </div>`;
  }).catch(error => {
    overview.innerHTML = `<div class="glass-card" style="margin:16px 0;color:var(--danger)">تعذر تحميل ملخص V6: ${escapeHtml(error.message || '')}</div>`;
  });
}

// ── Block 2: Demo Data & Refresher ───────────────────────────────────────────

function addFinanceDemoData(scope = 'all') {
  ensureFinance();
  if (!confirm('إضافة أمثلة تجريبية واضحة؟ لن يتم حذف أو استبدال أي بيانات حالية.')) return;
  const demoTag = `demo_${scope}_${Date.now()}`;
  let customer = finance.customers.find(c => c.name === 'عميل تجريبي');
  if (!customer) {
    customer = { id: makeId('cust'), name: 'عميل تجريبي', phone: '000', openingBalance: 0, notes: 'Demo record' };
    finance.customers.push(customer);
  }
  const txs = [
    { type: 'income', direction: 'in', sourceType: 'cashbox', amount: 250000, categoryId: 'cat_sales', departmentId: 'dept_sales', description: 'DEMO - قبض بيع نقدي', partyName: customer.name, customerId: customer.id },
    { type: 'expense', direction: 'out', sourceType: 'cashbox', amount: 75000, categoryId: 'cat_materials', departmentId: 'dept_workshop', description: 'DEMO - شراء مواد', partyName: 'مورد تجريبي' },
    { type: 'expense', direction: 'out', sourceType: 'cashbox', amount: 40000, categoryId: 'cat_maintenance', departmentId: 'dept_workshop', description: 'DEMO - صيانة معدات', partyName: 'فني تجريبي' },
    { type: 'customer_charge', direction: 'neutral', sourceType: 'ledger', amount: 180000, departmentId: 'dept_projects', description: 'DEMO - مطالبة مبيعات آجلة', partyName: customer.name, customerId: customer.id },
    { type: 'income', direction: 'in', sourceType: 'cashbox', amount: 90000, categoryId: 'cat_customer_payment', departmentId: 'dept_sales', description: 'DEMO - تسديد عميل', partyName: customer.name, customerId: customer.id }
  ];
  txs.forEach((tx, idx) => addFinanceTransaction({ ...tx, date: todayISO(), sourceId: `${demoTag}_${idx}`, receiptNo: `DEMO-${idx + 1}`, paymentMethod: tx.sourceType === 'cashbox' ? 'cash' : 'ledger' }, { skipSave: true }));
  saveData();
  financeRefreshAll();
  showToast('تمت إضافة البيانات التجريبية وربطها بالداشبورد والقاصة والعملاء', 'success');
}

function financeRefreshAll() {
  renderFinanceDashboard();
  renderCashbox();
  renderExpensesPage();
  renderIncomePage();
  renderCustomersPage();
  renderReceiptPage();
}

function switchFinanceTab_deprecated_dup1(tab) {
  document.querySelectorAll('.finance-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  ['dashboard', 'journal', 'trial_balance', 'pl', 'ledger'].forEach(t => {
    const el = document.getElementById(`financeTab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'journal')        renderJournalEntryTab();
  else if (tab === 'trial_balance') renderTrialBalanceTab();
  else if (tab === 'pl')        renderPLTab();
  else if (tab === 'ledger')    renderLedgerTab();

  // Ensure buttons are hidden based on permissions after tab content is prepared
  setTimeout(enforceUIPermissions, 50);
}

// ── Block 3: Deprecated V5 Move Tab / Form Handlers ──────────────────────────

function renderJournalEntryTab_deprecated_dup1() {
  const el = document.getElementById('financeTab-journal');
  if (!el) return;
  PentagonDB.load().then(db => {
    const entries = (db.journal_entries || []).slice().reverse();
    const journals = (db.journals || []);
    const journalOpts = journals.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.name)}</option>`).join('');
    const accounts = (finance?.accounts || []);
    const accountOpts = accounts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.code)} - ${escapeHtml(a.name)}</option>`).join('');

    const reversedIds = new Set((db.journal_entries || []).map(e => e.reversed_of).filter(Boolean));
    const canReverse = !window.PermissionService || window.PermissionService.check('journal_entries', 'update');
    const rows = entries.slice(0, 50).map(e => {
      const stateCls = e.state === 'posted' ? 'je-state-posted' : e.state === 'cancel' ? 'je-state-cancel' : 'je-state-draft';
      const stateLabel = e.state === 'posted' ? 'مرحّل' : e.state === 'cancel' ? 'ملغي' : 'مسودة';
      const isReversal = !!e.reversed_of;
      const isReversed = reversedIds.has(e.id);
      const showReverseBtn = e.state === 'posted' && canReverse && !isReversal && !isReversed;
      const reversedNote = isReversed ? '<span class="je-reversed-note" style="font-size:11px;color:var(--text-muted)">معكوس</span>' : '';
      const reversalNote = isReversal ? '<span class="je-reversal-note" style="font-size:11px;color:var(--text-muted)">قيد عكس</span>' : '';
      return `<tr>
        <td>${escapeHtml(e.date || '')}</td>
        <td>${escapeHtml(e.name || '')} ${reversalNote}${reversedNote}</td>
        <td>${escapeHtml((journals.find(j => j.id === e.journal_id) || {}).name || e.journal_id || '')}</td>
        <td>${formatNum(e.amount_total || 0)}</td>
        <td><span class="je-state-badge ${stateCls}">${stateLabel}</span></td>
        <td>${e.state === 'draft' ? `<button class="btn-xs btn-primary btn-post-je" onclick="postJEFromUI('${escapeHtml(e.id)}')">ترحيل</button>` : ''}
            ${showReverseBtn ? `<button class="btn-xs btn-secondary btn-reverse-je" onclick="reverseJEFromUI('${escapeHtml(e.id)}')">عكس</button>` : ''}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">لا توجد قيود بعد</td></tr>`;

    el.innerHTML = `
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 class="section-title" style="margin:0">القيود اليومية</h3>
          <button class="btn-primary btn-sm" onclick="openNewJEModal()">+ قيد جديد</button>
        </div>
        <table class="data-table je-table">
          <thead><tr><th>التاريخ</th><th>الاسم</th><th>اليومية</th><th>المبلغ</th><th>الحالة</th><th>إجراء</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div id="newJEForm" style="display:none" class="glass-card je-form-card">
        <h3 class="section-title">قيد جديد</h3>
        <div class="je-form-row">
          <label>اليومية<select id="jeJournal" class="form-input">${journalOpts}</select></label>
          <label>التاريخ<input id="jeDate" type="date" class="form-input" value="${todayISO()}"></label>
          <label>المرجع<input id="jeOrigin" type="text" class="form-input" placeholder="اختياري"></label>
        </div>
        <div id="jeLinesContainer">
          <div class="je-lines-grid je-lines-header"><span>#</span><span>الحساب</span><span>البيان</span><span>مدين</span><span>دائن</span><span></span></div>
          <div id="jeLines"></div>
        </div>
        <button class="btn-secondary btn-sm" onclick="addJELine('${accountOpts.replace(/'/g,"\\'")}')">+ سطر</button>
        <div class="je-footer-row">
          <div id="jeBalanceChip" class="je-balance-chip">—</div>
          <div>
            <button class="btn-secondary btn-sm" onclick="document.getElementById('newJEForm').style.display='none'">إلغاء</button>
            <button class="btn-primary btn-sm" onclick="saveNewJE()">حفظ مسودة</button>
          </div>
        </div>
      </div>`;
    enforceUIPermissions();
  }).catch(() => { el.innerHTML = '<p style="color:var(--danger)">خطأ في تحميل القيود</p>'; });
}

function openNewJEModal_deprecated_dup1() {
  if (window.PermissionService && !window.PermissionService.check('journal_entries', 'create')) {
    return showToast('ليس لديك صلاحية إنشاء قيد', 'warning');
  }
  const form = document.getElementById('newJEForm');
  if (!form) return;
  form.style.display = '';
  document.getElementById('jeLines').innerHTML = '';
  const accountOpts = (finance?.accounts || []).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.code)} - ${escapeHtml(a.name)}</option>`).join('');
  addJELine(accountOpts);
  addJELine(accountOpts);
  updateJEBalanceChip();
}

function addJELine(accountOpts) {
  const container = document.getElementById('jeLines');
  if (!container) return;
  const idx = container.children.length;
  const div = document.createElement('div');
  div.className = 'je-lines-grid je-line-row';
  div.innerHTML = `<span>${escapeHtml(idx + 1)}</span>
    <select class="form-input je-account" onchange="updateJEBalanceChip()">${accountOpts}</select>
    <input type="text" class="form-input je-label" placeholder="البيان">
    <input type="number" class="form-input je-debit"  min="0" value="0" oninput="if(+this.value>0)this.closest('.je-line-row').querySelector('.je-credit').value=0;updateJEBalanceChip()">
    <input type="number" class="form-input je-credit" min="0" value="0" oninput="if(+this.value>0)this.closest('.je-line-row').querySelector('.je-debit').value=0;updateJEBalanceChip()">
    <button class="btn-xs btn-danger" onclick="this.closest('.je-line-row').remove();updateJEBalanceChip()">×</button>`;
  container.appendChild(div);
}

function updateJEBalanceChip() {
  const chip = document.getElementById('jeBalanceChip');
  if (!chip) return;
  let debit = 0, credit = 0;
  document.querySelectorAll('#jeLines .je-line-row').forEach(row => {
    debit  += Number(row.querySelector('.je-debit')?.value  || 0);
    credit += Number(row.querySelector('.je-credit')?.value || 0);
  });
  const balanced = debit > 0 && Math.abs(debit - credit) < 0.01;
  chip.textContent = balanced ? `✅ متوازن — ${formatNum(debit)} د.ع` : `❌ غير متوازن: مدين ${formatNum(debit)} — دائن ${formatNum(credit)}`;
  chip.className = `je-balance-chip ${balanced ? 'balanced' : 'unbalanced'}`;
}

function saveNewJE_deprecated_dup1() {
  if (window.PermissionService && !window.PermissionService.check('journal_entries', 'create')) {
    return showToast('ليس لديك صلاحية إنشاء قيد', 'warning');
  }
  const journalId = document.getElementById('jeJournal')?.value;
  const date      = document.getElementById('jeDate')?.value || todayISO();
  const origin    = document.getElementById('jeOrigin')?.value.trim() || '';
  const lines = [];
  document.querySelectorAll('#jeLines .je-line-row').forEach(row => {
    lines.push({
      account_id: row.querySelector('.je-account')?.value || '',
      label:      row.querySelector('.je-label')?.value  || '',
      debit:      Number(row.querySelector('.je-debit')?.value  || 0),
      credit:     Number(row.querySelector('.je-credit')?.value || 0),
    });
  });
  if (!window.FinanceService) return showToast('FinanceService غير محمّل', 'error');
  if (lines.length < 2) return showToast('القيد يحتاج سطرين على الأقل', 'warning');
  if (lines.some(l => !l.account_id)) return showToast('اختر حساباً لكل سطر', 'warning');
  FinanceService.createJournalEntry({ journal_id: journalId, date, origin, lines })
    .then(() => { showToast('تم حفظ القيد كمسودة', 'success'); document.getElementById('newJEForm').style.display = 'none'; renderJournalEntryTab(); })
    .catch(e => showToast(e.message || 'خطأ في حفظ القيد', 'error'));
}

function postJEFromUI_deprecated_dup1(entryId) {
  if (!window.FinanceService) return showToast('FinanceService غير محمّل', 'error');
  if (window.PermissionService && !window.PermissionService.check('journal_entries', 'update')) {
    return showToast('ليس لديك صلاحية ترحيل القيود', 'warning');
  }
  FinanceService.postJournalEntry(entryId)
    .then(() => { showToast('تم ترحيل القيد', 'success'); renderJournalEntryTab(); })
    .catch(e => showToast(e.message || 'خطأ في الترحيل', 'error'));
}

function reverseJEFromUI_deprecated_dup1(entryId) {
  if (!window.FinanceService) return showToast('FinanceService غير محمّل', 'error');
  if (window.PermissionService && !window.PermissionService.check('journal_entries', 'update')) {
    return showToast('ليس لديك صلاحية عكس القيود', 'warning');
  }
  if (!window.confirm('سيتم إنشاء قيد عكس مرحّل لهذا القيد. هل تريد المتابعة؟')) return;
  FinanceService.reverseEntry(entryId)
    .then(() => { showToast('تم إنشاء قيد العكس وترحيله', 'success'); renderJournalEntryTab(); })
    .catch(e => showToast(e.message || 'خطأ في العكس', 'error'));
}

// ── Block 4: Reports & Ledger Tab Renderers ──────────────────────────────────

function renderTrialBalanceTab() {
  const el = document.getElementById('financeTab-trial_balance');
  if (!el) return;
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">جاري التحميل...</div>';
  const dateFrom = '';
  const dateTo   = '';
  if (!window.FinanceService) { el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>'; return; }
  FinanceService.getTrialBalance({ dateFrom, dateTo }).then(tb => {
    if (!tb.length) { el.innerHTML = '<div class="glass-card" style="padding:24px;margin-top:16px;color:var(--text-muted)">لا توجد قيود مرحّلة بعد</div>'; return; }
    const totalD = tb.reduce((s, r) => s + r.total_debit, 0);
    const totalC = tb.reduce((s, r) => s + r.total_credit, 0);
    const balanced = Math.abs(totalD - totalC) < 0.01;
    const rows = tb.map(r => `<tr style="cursor:pointer" title="انقر لعرض الأستاذ" onclick="switchFinanceTab('ledger');setTimeout(()=>{const s=document.getElementById('ledgerAccount');if(s){s.value='${escapeHtml(r.account_id)}';loadLedgerData();}},50)">
      <td>${escapeHtml(r.code)}</td>
      <td>${escapeHtml(r.name)}</td>
      <td class="num-cell">${formatNum(r.total_debit)}</td>
      <td class="num-cell">${formatNum(r.total_credit)}</td>
      <td class="num-cell ${r.balance >= 0 ? 'finance-in' : 'finance-out'}">${formatNum(Math.abs(r.balance))} ${r.balance >= 0 ? 'مدين' : 'دائن'}</td>
    </tr>`).join('');
    el.innerHTML = `<div class="glass-card" style="margin-top:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 class="section-title" style="margin:0">ميزان المراجعة</h3>
        ${!balanced ? '<span style="color:var(--danger);font-weight:600">⚠️ الميزان غير صفري</span>' : '<span style="color:var(--success)">✅ متوازن</span>'}
      </div>
      <table class="data-table tb-table">
        <thead><tr><th>الكود</th><th>الحساب</th><th class="num-cell">مدين</th><th class="num-cell">دائن</th><th class="num-cell">الرصيد</th></tr></thead>
        <tbody>${rows}</tbody>
        <tfoot><tr><td colspan="2"><strong>المجموع</strong></td><td class="num-cell"><strong>${formatNum(totalD)}</strong></td><td class="num-cell"><strong>${formatNum(totalC)}</strong></td><td></td></tr></tfoot>
      </table>
    </div>`;
  }).catch(() => { el.innerHTML = '<p style="color:var(--danger)">خطأ في تحميل الميزان</p>'; });
}

function renderPLTab() {
  const el = document.getElementById('financeTab-pl');
  if (!el) return;
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">جاري التحميل...</div>';
  if (!window.FinanceService) { el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>'; return; }
  FinanceService.getProfitAndLoss().then(pl => {
    const incRows = pl.income.map(r => `<div class="pl-row"><span>${escapeHtml(r.name)}</span><span class="num-cell finance-in">${formatNum(r.amount)}</span></div>`).join('') || '<div class="pl-row" style="color:var(--text-muted)">لا إيرادات</div>';
    const expRows = pl.expense.map(r => `<div class="pl-row"><span>${escapeHtml(r.name)}</span><span class="num-cell finance-out">${formatNum(r.amount)}</span></div>`).join('') || '<div class="pl-row" style="color:var(--text-muted)">لا مصروفات</div>';
    const netCls  = pl.net >= 0 ? 'finance-in' : 'finance-out';
    el.innerHTML = `<div class="glass-card pl-section" style="margin-top:16px">
      <h3 class="section-title">الأرباح والخسائر</h3>
      <div class="pl-section-title">الإيرادات</div>
      ${incRows}
      <div class="pl-row pl-subtotal"><span>إجمالي الإيرادات</span><span class="num-cell finance-in">${formatNum(pl.totalIncome)}</span></div>
      <div class="pl-section-title" style="margin-top:16px">المصروفات</div>
      ${expRows}
      <div class="pl-row pl-subtotal"><span>إجمالي المصروفات</span><span class="num-cell finance-out">${formatNum(pl.totalExpense)}</span></div>
      <div class="pl-row pl-net-row"><span>صافي الربح / (الخسارة)</span><span class="num-cell ${netCls}">${formatNum(Math.abs(pl.net))} ${pl.net >= 0 ? '(ربح)' : '(خسارة)'}</span></div>
    </div>`;
  }).catch(() => { el.innerHTML = '<p style="color:var(--danger)">خطأ في تحميل قائمة الأرباح</p>'; });
}

function renderLedgerTab() {
  const el = document.getElementById('financeTab-ledger');
  if (!el) return;
  const accounts = (finance?.accounts || []);
  const accountOpts = accounts.map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.code)} - ${escapeHtml(a.name)}</option>`).join('');
  el.innerHTML = `<div class="glass-card" style="margin-top:16px">
    <h3 class="section-title">دفتر الأستاذ</h3>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px;align-items:flex-end">
      <label style="flex:1;min-width:200px">الحساب<select id="ledgerAccount" class="form-input" onchange="loadLedgerData()">${accountOpts}</select></label>
      <label>من<input id="ledgerFrom" type="date" class="form-input" onchange="loadLedgerData()"></label>
      <label>إلى<input id="ledgerTo" type="date" class="form-input" onchange="loadLedgerData()"></label>
      <button class="btn-primary btn-sm" onclick="loadLedgerData()">عرض</button>
    </div>
    <div id="ledgerTableContainer"></div>
  </div>`;
  setTimeout(loadLedgerData, 50);
}

function loadLedgerData() {
  const accountId = document.getElementById('ledgerAccount')?.value;
  const dateFrom  = document.getElementById('ledgerFrom')?.value || '';
  const dateTo    = document.getElementById('ledgerTo')?.value   || '';
  const container = document.getElementById('ledgerTableContainer');
  if (!container || !accountId) return;
  container.innerHTML = '<div style="color:var(--text-muted)">جاري التحميل...</div>';
  if (!window.FinanceService) { container.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>'; return; }
  FinanceService.getLedger(accountId, { dateFrom, dateTo }).then(({ account, rows }) => {
    if (!rows.length) { container.innerHTML = '<div style="color:var(--text-muted);padding:12px">لا حركات لهذا الحساب</div>'; return; }
    
    // Calculate total debit, total credit, and final balance
    const totalDebit = rows.reduce((sum, r) => sum + Number(r.debit || 0), 0);
    const totalCredit = rows.reduce((sum, r) => sum + Number(r.credit || 0), 0);
    const endingBalance = rows.length ? rows[rows.length - 1].running_balance : 0;
    const symbol = getAdminCurrencySymbol();
    
    const summaryCards = `
      <div class="stats-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 16px;">
        <div class="stat-card" style="padding: 10px; background: rgba(255,255,255,0.01); border-radius: 6px;">
          <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">إجمالي مدين (+)</span>
          <strong style="font-size: 16px; color: #34d399;">${formatNum(totalDebit)} <small>${symbol}</small></strong>
        </div>
        <div class="stat-card" style="padding: 10px; background: rgba(255,255,255,0.01); border-radius: 6px;">
          <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">إجمالي دائن (-)</span>
          <strong style="font-size: 16px; color: #f87171;">${formatNum(totalCredit)} <small>${symbol}</small></strong>
        </div>
        <div class="stat-card" style="padding: 10px; background: rgba(255,255,255,0.01); border-radius: 6px;">
          <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">الرصيد الختامي</span>
          <strong style="font-size: 16px; color: ${endingBalance >= 0 ? '#38bdf8' : '#fb923c'};">${formatNum(endingBalance)} <small>${symbol}</small></strong>
        </div>
      </div>
    `;

    const trs = rows.map(r => `<tr>
      <td>${escapeHtml(r.entry_date || '')}</td>
      <td>${escapeHtml(r.entry_name || '')}</td>
      <td>${escapeHtml(r.label || '')}</td>
      <td class="num-cell">${r.debit  > 0 ? formatNum(r.debit)  : ''}</td>
      <td class="num-cell">${r.credit > 0 ? formatNum(r.credit) : ''}</td>
      <td class="num-cell ${r.running_balance >= 0 ? 'finance-in' : 'finance-out'}">${formatNum(r.running_balance)}</td>
    </tr>`).join('');
    
    container.innerHTML = `
      ${summaryCards}
      <table class="data-table tb-table">
        <thead><tr><th>التاريخ</th><th>القيد</th><th>البيان</th><th class="num-cell">مدين</th><th class="num-cell">دائن</th><th class="num-cell">الرصيد الجاري</th></tr></thead>
        <tbody>${trs}</tbody>
      </table>`;
  }).catch(() => { container.innerHTML = '<p style="color:var(--danger)">خطأ في تحميل الأستاذ</p>'; });
}

// ── Block 5: V6 Finance Tab Workspace & Core UI Handlers ──────────────────────

function ensureV6FinanceWorkspace() {
  const tabBar = document.querySelector('.finance-tab-bar');
  if (!tabBar) return;

  const tabs = [
    ['dashboard', 'لوحة التحكم'],
    ['partner_ledger', 'أعمار ديون العملاء والموردين'],
    ['journal', 'القيود المحاسبية'],
    ['payments', 'الدفعات'],
    ['customer_invoices', 'فواتير العملاء'],
    ['vendor_bills', 'فواتير الموردين'],
    ['statement', 'كشف حساب'],
    ['bank_reco', 'مطابقة البنك'],
    ['trial_balance', 'ميزان المراجعة'],
    ['pl', 'الأرباح والخسائر'],
    ['ledger', 'دفتر الأستاذ'],
  ];

  tabs.forEach(([id, label]) => {
    let btn = tabBar.querySelector(`.finance-tab[data-tab="${id}"]`);
    if (!btn) {
      btn = document.createElement('button');
      btn.className = 'finance-tab';
      btn.dataset.tab = id;
      btn.type = 'button';
      btn.onclick = () => switchFinanceTab(id);
      tabBar.appendChild(btn);
    }
    btn.textContent = label;
    tabBar.appendChild(btn);
  });

  const host = document.querySelector('.finance-page') || document.getElementById('financeTab-dashboard')?.parentElement;
  if (!host) return;
  tabs.forEach(([id]) => {
    if (!document.getElementById(`financeTab-${id}`)) {
      const panel = document.createElement('div');
      panel.id = `financeTab-${id}`;
      panel.style.display = 'none';
      host.appendChild(panel);
    }
  });
}

function switchFinanceTab(tab) {
  ensureV6FinanceWorkspace();
  document.querySelectorAll('.finance-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tab);
  });
  ['dashboard', 'partner_ledger', 'journal', 'payments', 'customer_invoices', 'vendor_bills', 'statement', 'bank_reco', 'trial_balance', 'pl', 'ledger'].forEach(t => {
    const el = document.getElementById(`financeTab-${t}`);
    if (el) el.style.display = t === tab ? '' : 'none';
  });
  if (tab === 'dashboard') renderFinanceDashboard();
  else if (tab === 'partner_ledger') renderPartnerLedgerTab();
  else if (tab === 'journal') renderJournalEntryTab();
  else if (tab === 'payments') renderPaymentsTab();
  else if (tab === 'customer_invoices') renderCustomerInvoicesTab();
  else if (tab === 'vendor_bills') renderVendorBillsTab();
  else if (tab === 'statement') renderPartnerStatementTab();
  else if (tab === 'bank_reco') renderBankReconciliationTab();
  else if (tab === 'trial_balance') renderTrialBalanceTab();
  else if (tab === 'pl') renderPLTab();
  else if (tab === 'ledger') renderLedgerTab();
  setTimeout(enforceUIPermissions, 50);
}

function getMoveStateLabel(state) {
  return { draft: 'مسودة', posted: 'مرحّل', cancel: 'ملغي' }[state] || state || '';
}

function getMoveStateClass(state) {
  return state === 'posted' ? 'je-state-posted' : state === 'cancel' ? 'je-state-cancel' : 'je-state-draft';
}

function isMoveLocked(move, db) {
  return !!db?._lock_date && !!move?.date && String(move.date) <= String(db._lock_date);
}

function getJournalLabel(journals, journalId) {
  const journal = (journals || []).find(j => j.id === journalId);
  return journal?.name || journal?.code || journalId || '';
}

function renderJournalEntryTab(selectedMoveId = '') {
  const el = document.getElementById('financeTab-journal');
  if (!el) return;
  if (!window.FinanceService) {
    el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>';
    return;
  }
  PentagonDB.load({ force: true }).then(async db => {
    const moves = await FinanceService.getMoves();
    const journals = db.journals || [];
    const canCreate = !window.PermissionService || window.PermissionService.check('account_moves', 'create');
    const canUpdate = !window.PermissionService || window.PermissionService.check('account_moves', 'update');
    const lockDate = db._lock_date || '';
    const selected = selectedMoveId ? moves.find(move => move.id === selectedMoveId) : null;
    const rows = moves.slice(0, 80).map(move => {
      const total = (move.line_ids || []).reduce((sum, line) => sum + Number(line.debit || 0), 0);
      const locked = isMoveLocked(move, db);
      return `<tr onclick="renderJournalEntryTab('${escapeHtml(move.id)}')" style="cursor:pointer">
        <td>${locked ? '<span title="الفترة مقفلة">🔒</span> ' : ''}${escapeHtml(move.date || '')}</td>
        <td>${escapeHtml(move.name || '/')}</td>
        <td>${escapeHtml(getJournalLabel(journals, move.journal_id))}</td>
        <td>${escapeHtml(move.partner_id || '-')}</td>
        <td class="num-cell">${formatNum(total)}</td>
        <td><span class="je-state-badge ${getMoveStateClass(move.state)}">${getMoveStateLabel(move.state)}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">لا توجد قيود محاسبية</td></tr>';

    const recon = await FinanceService.getReconciliationSummary();
    const canCreatePayment = !window.PermissionService || window.PermissionService.check('account_payments', 'create');
    el.innerHTML = `
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 class="section-title" style="margin:0">القيود المحاسبية</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">قيود موحدة · ${moves.length} حركة</div>
          </div>
          <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">
            <label style="font-size:12px;color:var(--text-muted)">تاريخ الإقفال
              <input id="financeLockDate" type="date" class="form-input" value="${escapeHtml(lockDate)}" style="min-width:150px">
            </label>
            <button class="btn-secondary btn-sm" onclick="saveFinanceLockDate()">حفظ الإقفال</button>
            <button class="btn-secondary btn-sm" onclick="closeFinanceSelectedMonth()">إقفال الفترة</button>
            <button class="btn-secondary btn-sm" onclick="reopenFinancePeriod()">فتح الفترة المغلقة</button>
            <button class="btn-secondary btn-sm" onclick="runCustomerChargeRepair()" title="إصلاح قيود العملاء المُرحّلة بيومية خاطئة (T2.2)">إصلاح قيود العملاء</button>
            ${canCreate ? '<button class="btn-primary btn-sm" onclick="openNewJEModal()">قيد يدوي</button>' : ''}
          </div>
        </div>
        <table class="data-table je-table">
          <thead><tr><th>التاريخ</th><th>الرقم</th><th>اليومية</th><th>الطرف</th><th class="num-cell">إجمالي المدين</th><th>الحالة</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${renderReconciliationPanel(recon, canCreatePayment)}
      <div id="accountMoveDetail" class="glass-card" style="margin-top:16px">${selected ? renderAccountMoveDetail(selected, journals, db, canUpdate) : '<div style="color:var(--text-muted);padding:8px">اختر قيداً لعرض التفاصيل.</div>'}</div>
      <div id="newJEForm" style="display:none" class="glass-card je-form-card"></div>
    `;
    enforceUIPermissions();
  }).catch(error => {
    el.innerHTML = `<p style="color:var(--danger)">خطأ في تحميل القيود: ${escapeHtml(error.message || '')}</p>`;
  });
}

function renderReconciliationPanel(recon, canCreatePayment = false) {
  const open = recon.openItems || [];
  const rows = open.slice(0, 12).map(item => `<tr>
    <td>${escapeHtml(item.move_date || '')}</td>
    <td>${escapeHtml(item.move_name || '')}</td>
    <td>${escapeHtml(item.account_id || '')}</td>
    <td>${escapeHtml(item.partner_id || '-')}</td>
    <td>${escapeHtml(item.side === 'debit' ? 'مدين مفتوح' : 'دائن مفتوح')}</td>
    <td class="num-cell">${formatNum(item.open_amount || 0)}</td>
    <td>${canCreatePayment ? `<button class="btn-xs btn-primary" onclick="openPaymentForOpenItem('${escapeHtml(item.move_id)}','${escapeHtml(item.line_id)}')">تسجيل دفعة</button>` : '<span style="color:var(--text-muted);font-size:11px">عرض فقط</span>'}</td>
  </tr>`).join('') || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted)">لا توجد أرصدة مفتوحة للمطابقة</td></tr>';
  return `<div class="glass-card" style="margin-top:16px">
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
      <div>
        <h3 class="section-title" style="margin:0">الدفعات والمطابقة</h3>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">دفعات ومطابقة الحركات المحاسبية</div>
      </div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <span class="je-balance-chip">ذمم العملاء: ${formatNum(recon.totals?.receivables || 0)}</span>
        <span class="je-balance-chip">ذمم الموردين: ${formatNum(recon.totals?.payables || 0)}</span>
        <span class="je-balance-chip">دفعات: ${(recon.payments || []).length}</span>
        <span class="je-balance-chip">مطابقات: ${(recon.partials || []).length}</span>
      </div>
    </div>
    <table class="data-table tb-table">
      <thead><tr><th>التاريخ</th><th>القيد</th><th>الحساب</th><th>الطرف</th><th>النوع</th><th class="num-cell">المفتوح</th><th>إجراء</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

function getFinanceOpenItemKind(item) {
  if (item.account_id === 'receivables_customers') return 'عميل';
  if (item.account_id === 'payables_people') return 'مورد/شخص';
  if (item.account_id === 'accrued_payroll') return 'رواتب';
  return 'طرف';
}

function getFinanceOpenItemDirectionLabel(item) {
  return item.side === 'debit' ? 'مطلوب تحصيله' : 'مطلوب دفعه';
}

function getFinanceOpenItemAccountLabel(item) {
  const labels = {
    receivables_customers: 'ذمم عملاء',
    payables_people: 'ذمم موردين/أشخاص',
    accrued_payroll: 'رواتب مستحقة',
  };
  return labels[item.account_id] || item.account_id || '';
}

function getFinanceMoveLineResidual(db, move, line) {
  const reconcilable = ['receivables_customers', 'payables_people', 'accrued_payroll'].includes(line.account_id);
  if (!reconcilable) return { reconcilable: false, openAmount: 0 };
  const debitBase = Math.max(0, Number(line.debit || 0) - Number(line.credit || 0));
  const creditBase = Math.max(0, Number(line.credit || 0) - Number(line.debit || 0));
  const partials = db?.account_partial_reconciles || [];
  const matchedDebit = partials
    .filter(partial => partial.debit_move_id === move.id && partial.debit_line_id === line.id && partial.is_active !== false)
    .reduce((sum, partial) => sum + Number(partial.amount || 0), 0);
  const matchedCredit = partials
    .filter(partial => partial.credit_move_id === move.id && partial.credit_line_id === line.id && partial.is_active !== false)
    .reduce((sum, partial) => sum + Number(partial.amount || 0), 0);
  return {
    reconcilable: true,
    openAmount: Math.max(0, debitBase - matchedDebit) || Math.max(0, creditBase - matchedCredit),
  };
}

function getFinanceOpenItemAgeDays(item) {
  const today = new Date(`${todayISO()}T00:00:00`);
  const date = new Date(`${item.move_date || todayISO()}T00:00:00`);
  return Math.max(0, Math.floor((today - date) / 86400000));
}

function getFinancePaymentFilterValues() {
  return {
    kind: document.getElementById('paymentOpenKind')?.value || 'all',
    direction: document.getElementById('paymentOpenDirection')?.value || 'all',
    partner: document.getElementById('paymentOpenPartner')?.value || 'all',
    aging: document.getElementById('paymentOpenAging')?.value || 'all',
    search: (document.getElementById('paymentOpenSearch')?.value || '').trim().toLowerCase(),
    minAmount: Number(document.getElementById('paymentOpenMinAmount')?.value || 0),
  };
}

function getFinancePaymentHistoryFilterValues() {
  return {
    type: document.getElementById('paymentHistoryType')?.value || 'all',
    status: document.getElementById('paymentHistoryStatus')?.value || 'all',
    partner: document.getElementById('paymentHistoryPartner')?.value || 'all',
    search: (document.getElementById('paymentHistorySearch')?.value || '').trim().toLowerCase(),
  };
}

function clearFinancePaymentHistoryFilters() {
  ['paymentHistoryType', 'paymentHistoryStatus', 'paymentHistoryPartner'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = 'all';
  });
  const search = document.getElementById('paymentHistorySearch');
  if (search) search.value = '';
  renderPaymentsTab();
}

function clearPartnerStatementFilters() {
  const account = document.getElementById('statementAccountFilter');
  const direction = document.getElementById('statementDirectionFilter');
  const search = document.getElementById('statementSearch');
  if (account) account.value = 'all';
  if (direction) direction.value = 'all';
  if (search) search.value = '';
  renderPartnerStatementTab();
}

function filterFinancePaymentOpenItems(items, filters) {
  return (items || []).filter(item => {
    const kindOk = filters.kind === 'all'
      || (filters.kind === 'receivable' && item.account_id === 'receivables_customers')
      || (filters.kind === 'payable' && item.account_id === 'payables_people')
      || (filters.kind === 'payroll' && item.account_id === 'accrued_payroll');
    if (!kindOk) return false;
    if (filters.direction !== 'all' && item.side !== filters.direction) return false;
    if (filters.partner !== 'all' && (item.partner_id || 'بدون طرف') !== filters.partner) return false;
    if (filters.minAmount > 0 && Number(item.open_amount || 0) < filters.minAmount) return false;
    const age = getFinanceOpenItemAgeDays(item);
    if (filters.aging === 'current' && age > 30) return false;
    if (filters.aging === 'mid' && (age <= 30 || age > 60)) return false;
    if (filters.aging === 'old' && age <= 60) return false;
    const haystack = `${item.move_name || ''} ${item.move_origin || ''} ${item.partner_id || ''} ${item.account_id || ''} ${item.label || ''} ${getFinanceOpenItemKind(item)} ${getFinanceOpenItemDirectionLabel(item)}`.toLowerCase();
    return !filters.search || haystack.includes(filters.search);
  });
}

function renderFinancePaymentPartnerOptions(items, selected) {
  const partners = [...new Set((items || []).map(item => item.partner_id || 'بدون طرف'))].sort();
  return `<option value="all" ${selected === 'all' ? 'selected' : ''}>الكل</option>` + partners.map(partner => `<option value="${escapeHtml(partner)}" ${partner === selected ? 'selected' : ''}>${escapeHtml(partner)}</option>`).join('');
}

function getFinanceAgingSummary(items) {
  const today = new Date(`${todayISO()}T00:00:00`);
  return (items || []).reduce((acc, item) => {
    const date = new Date(`${item.move_date || todayISO()}T00:00:00`);
    const age = Math.max(0, Math.floor((today - date) / 86400000));
    const amount = Number(item.open_amount || 0);
    if (age <= 30) acc.current += amount;
    else if (age <= 60) acc.mid += amount;
    else acc.old += amount;
    return acc;
  }, { current: 0, mid: 0, old: 0 });
}

async function renderPaymentsTab() {
  const el = document.getElementById('financeTab-payments');
  if (!el) return;
  const preservedFilters = getFinancePaymentFilterValues();
  const preservedHistoryFilters = getFinancePaymentHistoryFilterValues();
  if (!window.FinanceService) {
    el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>';
    return;
  }
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">جاري تحميل الدفعات...</div>';
  try {
    const recon = await FinanceService.getReconciliationSummary();
    const canCreatePayment = !window.PermissionService || window.PermissionService.check('account_payments', 'create');
    const partials = recon.partials || [];
    const historyFilters = preservedHistoryFilters;
    const paymentPartners = [...new Set((recon.payments || []).map(payment => payment.partner_id || 'بدون طرف'))].sort();
    const paymentPartnerOptions = `<option value="all" ${historyFilters.partner === 'all' ? 'selected' : ''}>الكل</option>` + paymentPartners.map(partner => `<option value="${escapeHtml(partner)}" ${historyFilters.partner === partner ? 'selected' : ''}>${escapeHtml(partner)}</option>`).join('');
    const filteredPayments = (recon.payments || []).filter(payment => {
      if (historyFilters.type !== 'all' && payment.payment_type !== historyFilters.type) return false;
      if (historyFilters.status === 'reconciled' && !payment.is_reconciled) return false;
      if (historyFilters.status === 'open' && payment.is_reconciled) return false;
      if (historyFilters.partner !== 'all' && (payment.partner_id || 'بدون طرف') !== historyFilters.partner) return false;
      if (historyFilters.search) {
        const haystack = `${payment.name || ''} ${payment.id || ''} ${payment.partner_id || ''} ${payment.memo || ''} ${payment.move_id || ''}`.toLowerCase();
        if (!haystack.includes(historyFilters.search)) return false;
      }
      return true;
    });
    const paymentRows = filteredPayments.slice().reverse().map(payment => {
      const linkedPartials = partials.filter(partial => partial.payment_id === payment.id);
      const matchedAmount = linkedPartials.reduce((sum, partial) => sum + Number(partial.amount || 0), 0);
      const linkedMoveNames = linkedPartials.map(partial => {
        const targetId = partial.debit_move_id === payment.move_id ? partial.credit_move_id : partial.debit_move_id;
        const target = (recon.openItems || []).find(item => item.move_id === targetId);
        return target?.move_name || targetId || '';
      }).filter(Boolean);
      return `<tr>
      <td>${escapeHtml(payment.date || '')}</td>
      <td>${escapeHtml(payment.name || payment.id || '')}</td>
      <td>${escapeHtml(payment.payment_type === 'outbound' ? 'دفع' : 'استلام')}</td>
      <td>${escapeHtml(payment.partner_type || '-')}</td>
      <td>${escapeHtml(payment.partner_id || '-')}</td>
      <td class="num-cell">${formatNum(payment.amount || 0)}</td>
      <td class="num-cell">${formatNum(matchedAmount)}</td>
      <td>${payment.is_reconciled ? 'مطابق' : 'غير مطابق'}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btn-secondary btn-xs" onclick="switchFinanceTab('journal');setTimeout(()=>renderJournalEntryTab('${escapeHtml(payment.move_id)}'),50)">قيد الدفع</button>
        ${linkedMoveNames.length ? `<span class="je-balance-chip" title="${escapeHtml(linkedMoveNames.join(', '))}">${linkedMoveNames.length} ربط</span>` : ''}
      </td>
    </tr>`;
    }).join('') || '<tr><td colspan="9" class="empty-cell">لا توجد دفعات مسجلة بعد</td></tr>';

    const filters = preservedFilters;
    const filteredOpenItems = filterFinancePaymentOpenItems(recon.openItems || [], filters);
    const filteredTotal = filteredOpenItems.reduce((sum, item) => sum + Number(item.open_amount || 0), 0);
    const openRows = filteredOpenItems.slice(0, 30).map(item => `<tr>
      <td>${escapeHtml(item.move_date || '')}</td>
      <td>${escapeHtml(item.move_name || '')}</td>
      <td>${escapeHtml(getFinanceOpenItemKind(item))}</td>
      <td>${escapeHtml(item.partner_id || '-')}</td>
      <td>${escapeHtml(getFinanceOpenItemDirectionLabel(item))}</td>
      <td class="num-cell">${formatNum(item.open_amount || 0)}</td>
      <td>${canCreatePayment ? `<button class="btn-xs btn-primary" onclick="openPaymentForOpenItem('${escapeHtml(item.move_id)}','${escapeHtml(item.line_id)}')">تسجيل دفعة</button>` : '<span style="color:var(--text-muted);font-size:11px">عرض فقط</span>'}</td>
    </tr>`).join('') || '<tr><td colspan="7" class="empty-cell">لا توجد بنود مطابقة للفلتر</td></tr>';

    el.innerHTML = `
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <h3 class="section-title" style="margin:0">الدفعات</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">استلامات العملاء ومدفوعات الموردين مرتبطة مباشرة بالقيود المفتوحة</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap">
            <span class="je-balance-chip">دفعات: ${(recon.payments || []).length}</span>
            <span class="je-balance-chip">المعروض: ${filteredPayments.length}</span>
            <span class="je-balance-chip">مطابقات: ${(recon.partials || []).length}</span>
            <span class="je-balance-chip">بنود مفتوحة: ${(recon.openItems || []).length}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">
          <label style="font-size:12px;color:var(--text-muted)">النوع
            <select id="paymentHistoryType" class="form-input" onchange="renderPaymentsTab()">
              <option value="all" ${historyFilters.type === 'all' ? 'selected' : ''}>الكل</option>
              <option value="inbound" ${historyFilters.type === 'inbound' ? 'selected' : ''}>استلام</option>
              <option value="outbound" ${historyFilters.type === 'outbound' ? 'selected' : ''}>دفع</option>
            </select>
          </label>
          <label style="font-size:12px;color:var(--text-muted)">المطابقة
            <select id="paymentHistoryStatus" class="form-input" onchange="renderPaymentsTab()">
              <option value="all" ${historyFilters.status === 'all' ? 'selected' : ''}>الكل</option>
              <option value="reconciled" ${historyFilters.status === 'reconciled' ? 'selected' : ''}>مطابق</option>
              <option value="open" ${historyFilters.status === 'open' ? 'selected' : ''}>غير مطابق</option>
            </select>
          </label>
          <label style="font-size:12px;color:var(--text-muted)">الطرف
            <select id="paymentHistoryPartner" class="form-input" onchange="renderPaymentsTab()">${paymentPartnerOptions}</select>
          </label>
          <label style="font-size:12px;color:var(--text-muted);min-width:220px">بحث
            <input id="paymentHistorySearch" class="form-input" value="${escapeHtml(historyFilters.search)}" placeholder="رقم الدفع أو الطرف أو البيان" oninput="clearTimeout(window.__paymentHistoryFilterTimer);window.__paymentHistoryFilterTimer=setTimeout(renderPaymentsTab,250)">
          </label>
          <button class="btn-secondary btn-sm" onclick="clearFinancePaymentHistoryFilters()">مسح فلتر الدفعات</button>
        </div>
        <table class="data-table tb-table">
          <thead><tr><th>التاريخ</th><th>الرقم</th><th>النوع</th><th>تصنيف الطرف</th><th>الطرف</th><th class="num-cell">المبلغ</th><th class="num-cell">المطابق</th><th>المطابقة</th><th>تفاصيل</th></tr></thead>
          <tbody>${paymentRows}</tbody>
        </table>
      </div>
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 class="section-title" style="margin:0">بنود بانتظار الدفع أو التحصيل</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">المعروض ${filteredOpenItems.length} من ${(recon.openItems || []).length} بند مفتوح</div>
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <label style="font-size:12px;color:var(--text-muted)">النوع
              <select id="paymentOpenKind" class="form-input" onchange="renderPaymentsTab()">
                <option value="all" ${filters.kind === 'all' ? 'selected' : ''}>الكل</option>
                <option value="receivable" ${filters.kind === 'receivable' ? 'selected' : ''}>عملاء</option>
                <option value="payable" ${filters.kind === 'payable' ? 'selected' : ''}>موردين/أشخاص</option>
                <option value="payroll" ${filters.kind === 'payroll' ? 'selected' : ''}>رواتب</option>
              </select>
            </label>
            <label style="font-size:12px;color:var(--text-muted)">الاتجاه
              <select id="paymentOpenDirection" class="form-input" onchange="renderPaymentsTab()">
                <option value="all" ${filters.direction === 'all' ? 'selected' : ''}>الكل</option>
                <option value="debit" ${filters.direction === 'debit' ? 'selected' : ''}>تحصيل</option>
                <option value="credit" ${filters.direction === 'credit' ? 'selected' : ''}>دفع</option>
              </select>
            </label>
            <label style="font-size:12px;color:var(--text-muted)">الطرف
              <select id="paymentOpenPartner" class="form-input" onchange="renderPaymentsTab()">${renderFinancePaymentPartnerOptions(recon.openItems || [], filters.partner)}</select>
            </label>
            <label style="font-size:12px;color:var(--text-muted)">العمر
              <select id="paymentOpenAging" class="form-input" onchange="renderPaymentsTab()">
                <option value="all" ${filters.aging === 'all' ? 'selected' : ''}>الكل</option>
                <option value="current" ${filters.aging === 'current' ? 'selected' : ''}>0-30</option>
                <option value="mid" ${filters.aging === 'mid' ? 'selected' : ''}>31-60</option>
                <option value="old" ${filters.aging === 'old' ? 'selected' : ''}>+60</option>
              </select>
            </label>
            <label style="font-size:12px;color:var(--text-muted)">حد أدنى
              <input id="paymentOpenMinAmount" type="number" min="0" class="form-input" value="${filters.minAmount || ''}" oninput="clearTimeout(window.__paymentFilterTimer);window.__paymentFilterTimer=setTimeout(renderPaymentsTab,250)" style="max-width:120px">
            </label>
            <label style="font-size:12px;color:var(--text-muted)">بحث
              <input id="paymentOpenSearch" class="form-input" value="${escapeHtml(filters.search)}" placeholder="رقم القيد أو الطرف" oninput="clearTimeout(window.__paymentFilterTimer);window.__paymentFilterTimer=setTimeout(renderPaymentsTab,250)">
            </label>
            <span class="je-balance-chip">مجموع الفلتر: ${formatNum(filteredTotal)}</span>
          </div>
        </div>
        <table class="data-table tb-table">
          <thead><tr><th>التاريخ</th><th>القيد</th><th>النوع</th><th>الطرف</th><th>الاتجاه</th><th class="num-cell">المفتوح</th><th>إجراء</th></tr></thead>
          <tbody>${openRows}</tbody>
        </table>
      </div>`;
    enforceUIPermissions();
  } catch (error) {
    el.innerHTML = `<p style="color:var(--danger)">تعذر تحميل الدفعات: ${escapeHtml(error.message || '')}</p>`;
  }
}

async function renderCustomerInvoicesTab() {
  const el = document.getElementById('financeTab-customer_invoices');
  if (!el) return;
  if (!window.FinanceService) {
    el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>';
    return;
  }
  const invoiceStateFilter = document.getElementById('customerInvoiceStateFilter')?.value || '';
  const invoicePartnerFilter = (document.getElementById('customerInvoicePartnerFilter')?.value || '').trim().toLowerCase();
  const customerInvoiceSearch = (document.getElementById('customerInvoiceSearch')?.value || '').trim().toLowerCase();
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">جاري تحميل فواتير العملاء...</div>';
  try {
    const [moves, recon] = await Promise.all([FinanceService.getMoves(), FinanceService.getReconciliationSummary()]);
    const canCreateInvoice = !window.PermissionService || window.PermissionService.check('account_moves', 'create');
    const canCreatePayment = !window.PermissionService || window.PermissionService.check('account_payments', 'create');
    const allInvoices = moves.filter(move => ['out_invoice', 'out_refund'].includes(move.move_type));
    const invoicePostedCount = allInvoices.filter(move => move.state === 'posted').length;
    const invoiceDraftCount = allInvoices.filter(move => move.state === 'draft').length;
    const invoices = allInvoices.filter(move => {
      if (invoiceStateFilter && move.state !== invoiceStateFilter) return false;
      if (invoicePartnerFilter && !(move.partner_id || '').toLowerCase().includes(invoicePartnerFilter)) return false;
      return true;
    });
    const invoicePartners = [...new Set(allInvoices.map(m => m.partner_id).filter(Boolean))];
    const invoiceRows = invoices.map(move => {
      const total = (move.line_ids || []).reduce((sum, line) => sum + Number(line.debit || 0), 0);
      return `<tr onclick="switchFinanceTab('journal');setTimeout(()=>renderJournalEntryTab('${escapeHtml(move.id)}'),50)" style="cursor:pointer">
        <td>${escapeHtml(move.date || '')}</td>
        <td>${escapeHtml(move.name || '/')}</td>
        <td>${escapeHtml(move.move_type === 'out_refund' ? 'إشعار دائن' : 'فاتورة عميل')}</td>
        <td>${escapeHtml(move.partner_id || '-')}</td>
        <td class="num-cell">${formatNum(total)}</td>
        <td><span class="je-state-badge ${getMoveStateClass(move.state)}">${getMoveStateLabel(move.state)}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-cell">لا توجد فواتير عملاء بعد. المرحلة الحالية تعرض الذمم الناتجة من القيود فقط.</td></tr>';

    const openReceivables = (recon.openItems || []).filter(item => item.account_id === 'receivables_customers');
    const filteredReceivables = openReceivables.filter(item => {
      const haystack = `${item.move_name || ''} ${item.partner_id || ''} ${item.account_id || ''}`.toLowerCase();
      return !customerInvoiceSearch || haystack.includes(customerInvoiceSearch);
    });
    const receivableAging = getFinanceAgingSummary(openReceivables);
    const receivableRows = filteredReceivables.map(item => {
      const paymentButton = canCreatePayment
        ? `<button class="btn-xs btn-primary" onclick="openPaymentForOpenItem('${escapeHtml(item.move_id)}','${escapeHtml(item.line_id)}')">تسجيل تحصيل</button>`
        : '';
      return `<tr>
      <td>${escapeHtml(item.move_date || '')}</td>
      <td>${escapeHtml(item.move_name || '')}</td>
      <td>${escapeHtml(item.partner_id || '-')}</td>
      <td class="num-cell">${formatNum(item.open_amount || 0)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        ${paymentButton}
        <button class="btn-secondary btn-xs" onclick="switchFinanceTab('journal');setTimeout(()=>renderJournalEntryTab('${escapeHtml(item.move_id)}'),50)">عرض القيد</button>
      </td>
    </tr>`;
    }).join('') || '<tr><td colspan="5" class="empty-cell">لا توجد ذمم عملاء مفتوحة</td></tr>';

    el.innerHTML = `
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <h3 class="section-title" style="margin:0">فواتير العملاء</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">المعروض ${invoices.length} من ${allInvoices.length}</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <select id="customerInvoiceStateFilter" class="form-input" style="max-width:130px" onchange="renderCustomerInvoicesTab()">
              <option value="">كل الحالات</option>
              <option value="posted" ${invoiceStateFilter==='posted'?'selected':''}>مرحّل</option>
              <option value="draft" ${invoiceStateFilter==='draft'?'selected':''}>مسودة</option>
              <option value="cancel" ${invoiceStateFilter==='cancel'?'selected':''}>ملغي</option>
            </select>
            <input id="customerInvoicePartnerFilter" class="form-input" style="max-width:160px" placeholder="فلتر العميل" value="${escapeHtml(invoicePartnerFilter)}" oninput="clearTimeout(window.__customerInvoiceFilterTimer);window.__customerInvoiceFilterTimer=setTimeout(renderCustomerInvoicesTab,250)">
            <span class="je-balance-chip">فواتير: ${allInvoices.length}</span>
            <span class="je-balance-chip">مرحّل: ${invoicePostedCount}</span>
            <span class="je-balance-chip">مسودة: ${invoiceDraftCount}</span>
            <span class="je-balance-chip">ذمم مفتوحة: ${formatNum(recon.totals?.receivables || 0)}</span>
            <span class="je-balance-chip">0-30 يوم: ${formatNum(receivableAging.current)}</span>
            <span class="je-balance-chip">31-60 يوم: ${formatNum(receivableAging.mid)}</span>
            <span class="je-balance-chip">+60 يوم: ${formatNum(receivableAging.old)}</span>
            ${canCreateInvoice ? '<button class="btn-primary btn-sm" onclick="openCustomerInvoiceModal()">فاتورة عميل جديدة</button>' : ''}
          </div>
        </div>
        <table class="data-table tb-table">
          <thead><tr><th>التاريخ</th><th>الرقم</th><th>النوع</th><th>العميل</th><th class="num-cell">الإجمالي</th><th>الحالة</th></tr></thead>
          <tbody>${invoiceRows}</tbody>
        </table>
      </div>
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 class="section-title" style="margin:0">ذمم العملاء المفتوحة</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">المعروض ${filteredReceivables.length} من ${openReceivables.length}</div>
          </div>
          <label style="font-size:12px;color:var(--text-muted)">بحث
            <input id="customerInvoiceSearch" class="form-input" value="${escapeHtml(customerInvoiceSearch)}" placeholder="رقم القيد أو العميل" oninput="clearTimeout(window.__customerInvoiceFilterTimer);window.__customerInvoiceFilterTimer=setTimeout(renderCustomerInvoicesTab,250)">
          </label>
        </div>
        <table class="data-table tb-table">
          <thead><tr><th>التاريخ</th><th>القيد</th><th>العميل</th><th class="num-cell">المتبقي</th><th>إجراء</th></tr></thead>
          <tbody>${receivableRows}</tbody>
        </table>
      </div>`;
  } catch (error) {
    el.innerHTML = `<p style="color:var(--danger)">تعذر تحميل فواتير العملاء: ${escapeHtml(error.message || '')}</p>`;
  }
}

async function renderVendorBillsTab() {
  const el = document.getElementById('financeTab-vendor_bills');
  if (!el) return;
  if (!window.FinanceService) {
    el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>';
    return;
  }
  const billStateFilter = document.getElementById('vendorBillStateFilter')?.value || '';
  const billPartnerFilter = (document.getElementById('vendorBillPartnerFilter')?.value || '').trim().toLowerCase();
  const vendorBillSearch = (document.getElementById('vendorBillSearch')?.value || '').trim().toLowerCase();
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">جاري تحميل فواتير الموردين...</div>';
  try {
    const [moves, recon] = await Promise.all([FinanceService.getMoves(), FinanceService.getReconciliationSummary()]);
    const canCreateBill = !window.PermissionService || window.PermissionService.check('account_moves', 'create');
    const canCreatePayment = !window.PermissionService || window.PermissionService.check('account_payments', 'create');
    const allBills = moves.filter(move => ['in_invoice', 'in_refund'].includes(move.move_type));
    const billPostedCount = allBills.filter(move => move.state === 'posted').length;
    const billDraftCount = allBills.filter(move => move.state === 'draft').length;
    const bills = allBills.filter(move => {
      if (billStateFilter && move.state !== billStateFilter) return false;
      if (billPartnerFilter && !(move.partner_id || '').toLowerCase().includes(billPartnerFilter)) return false;
      return true;
    });
    const billPartners = [...new Set(allBills.map(m => m.partner_id).filter(Boolean))];
    const billRows = bills.map(move => {
      const total = (move.line_ids || []).reduce((sum, line) => sum + Number(line.credit || 0), 0);
      return `<tr onclick="switchFinanceTab('journal');setTimeout(()=>renderJournalEntryTab('${escapeHtml(move.id)}'),50)" style="cursor:pointer">
        <td>${escapeHtml(move.date || '')}</td>
        <td>${escapeHtml(move.name || '/')}</td>
        <td>${escapeHtml(move.move_type === 'in_refund' ? 'إشعار مورد' : 'فاتورة مورد')}</td>
        <td>${escapeHtml(move.partner_id || '-')}</td>
        <td class="num-cell">${formatNum(total)}</td>
        <td><span class="je-state-badge ${getMoveStateClass(move.state)}">${getMoveStateLabel(move.state)}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-cell">لا توجد فواتير موردين بعد. المرحلة الحالية تعرض الذمم الناتجة من القيود والمشتريات فقط.</td></tr>';

    const openPayables = (recon.openItems || []).filter(item => item.account_id === 'payables_people' || item.account_id === 'accrued_payroll');
    const filteredPayables = openPayables.filter(item => {
      const haystack = `${item.move_name || ''} ${item.partner_id || ''} ${item.account_id || ''} ${getFinanceOpenItemKind(item)}`.toLowerCase();
      return !vendorBillSearch || haystack.includes(vendorBillSearch);
    });
    const payableAging = getFinanceAgingSummary(openPayables);
    const payableRows = filteredPayables.map(item => {
      const paymentButton = canCreatePayment
        ? `<button class="btn-xs btn-primary" onclick="openPaymentForOpenItem('${escapeHtml(item.move_id)}','${escapeHtml(item.line_id)}')">تسجيل تحصيل</button>`
        : '';
      return `<tr>
      <td>${escapeHtml(item.move_date || '')}</td>
      <td>${escapeHtml(item.move_name || '')}</td>
      <td>${escapeHtml(getFinanceOpenItemKind(item))}</td>
      <td>${escapeHtml(item.partner_id || '-')}</td>
      <td class="num-cell">${formatNum(item.open_amount || 0)}</td>
      <td style="display:flex;gap:6px;flex-wrap:wrap">
        ${paymentButton}
        <button class="btn-secondary btn-xs" onclick="switchFinanceTab('journal');setTimeout(()=>renderJournalEntryTab('${escapeHtml(item.move_id)}'),50)">عرض القيد</button>
      </td>
    </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-cell">لا توجد ذمم موردين أو رواتب مفتوحة</td></tr>';

    el.innerHTML = `
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <h3 class="section-title" style="margin:0">فواتير الموردين</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">المعروض ${bills.length} من ${allBills.length}</div>
          </div>
          <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <select id="vendorBillStateFilter" class="form-input" style="max-width:130px" onchange="renderVendorBillsTab()">
              <option value="">كل الحالات</option>
              <option value="posted" ${billStateFilter==='posted'?'selected':''}>مرحّل</option>
              <option value="draft" ${billStateFilter==='draft'?'selected':''}>مسودة</option>
              <option value="cancel" ${billStateFilter==='cancel'?'selected':''}>ملغي</option>
            </select>
            <input id="vendorBillPartnerFilter" class="form-input" style="max-width:160px" placeholder="فلتر المورد" value="${escapeHtml(billPartnerFilter)}" oninput="clearTimeout(window.__vendorBillFilterTimer);window.__vendorBillFilterTimer=setTimeout(renderVendorBillsTab,250)">
            <span class="je-balance-chip">فواتير: ${allBills.length}</span>
            <span class="je-balance-chip">مرحّل: ${billPostedCount}</span>
            <span class="je-balance-chip">مسودة: ${billDraftCount}</span>
            <span class="je-balance-chip">ذمم مفتوحة: ${formatNum(recon.totals?.payables || 0)}</span>
            <span class="je-balance-chip">0-30 يوم: ${formatNum(payableAging.current)}</span>
            <span class="je-balance-chip">31-60 يوم: ${formatNum(payableAging.mid)}</span>
            <span class="je-balance-chip">+60 يوم: ${formatNum(payableAging.old)}</span>
            ${canCreateBill ? '<button class="btn-primary btn-sm" onclick="openVendorBillModal()">فاتورة مورد جديدة</button>' : ''}
          </div>
        </div>
        <table class="data-table tb-table">
          <thead><tr><th>التاريخ</th><th>الرقم</th><th>النوع</th><th>المورد</th><th class="num-cell">الإجمالي</th><th>الحالة</th></tr></thead>
          <tbody>${billRows}</tbody>
        </table>
      </div>
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
          <div>
            <h3 class="section-title" style="margin:0">ذمم الموردين والرواتب المفتوحة</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">المعروض ${filteredPayables.length} من ${openPayables.length}</div>
          </div>
          <label style="font-size:12px;color:var(--text-muted)">بحث
            <input id="vendorBillSearch" class="form-input" value="${escapeHtml(vendorBillSearch)}" placeholder="رقم القيد أو الطرف" oninput="clearTimeout(window.__vendorBillFilterTimer);window.__vendorBillFilterTimer=setTimeout(renderVendorBillsTab,250)">
          </label>
        </div>
        <table class="data-table tb-table">
          <thead><tr><th>التاريخ</th><th>القيد</th><th>النوع</th><th>الطرف</th><th class="num-cell">المتبقي</th><th>إجراء</th></tr></thead>
          <tbody>${payableRows}</tbody>
        </table>
      </div>`;
  } catch (error) {
    el.innerHTML = `<p style="color:var(--danger)">تعذر تحميل فواتير الموردين: ${escapeHtml(error.message || '')}</p>`;
  }
}

function renderFinanceAccountOptionsByType(type, selectedId) {
  ensureFinance();
  return (finance.accounts || [])
    .filter(account => !type || account.type === type)
    .map(account => `<option value="${escapeHtml(account.id)}" ${account.id === selectedId ? 'selected' : ''}>${escapeHtml(account.code || '')} - ${escapeHtml(account.name || account.id)}</option>`)
    .join('');
}

function parseFinanceAmountInput(value) {
  return Number(String(value || '').replace(/[^\d.-]/g, '')) || 0;
}

function renderFinancePartnerDatalistOptions(kind) {
  ensureFinance();
  const names = new Set();
  if (kind === 'customer') {
    (finance.customers || []).forEach(customer => { if (customer?.name) names.add(customer.name); });
  }
  if (kind === 'vendor') {
    (omni?.suppliers || []).forEach(supplier => { if (supplier?.name) names.add(supplier.name); });
  }
  (PentagonDB.getCached()?.account_moves || []).forEach(move => {
    if (move.partner_id) names.add(move.partner_id);
  });
  return [...names].sort().map(name => `<option value="${escapeHtml(name)}"></option>`).join('');
}

async function openCustomerInvoiceModal() {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'create')) {
    return showToast('ليس لديك صلاحية إنشاء فواتير العملاء', 'warning');
  }
  const incomeOptions = renderFinanceAccountOptionsByType('income', 'income_sales');
  const partnerOptions = renderFinancePartnerDatalistOptions('customer');
  const form = await showOmniModal('فاتورة عميل جديدة', `
    <datalist id="customerInvoicePartnerOptions">${partnerOptions}</datalist>
    <div class="je-form-row">
      <label>التاريخ<input id="customerInvoiceDate" type="date" class="form-input" value="${todayISO()}"></label>
      <label>العميل<input id="customerInvoicePartner" list="customerInvoicePartnerOptions" class="form-input" placeholder="اسم العميل أو كوده"></label>
      <label>المبلغ<input id="customerInvoiceAmount" inputmode="numeric" class="form-input" placeholder="0"></label>
    </div>
    <div class="je-form-row">
      <label>حساب الإيراد<select id="customerInvoiceIncomeAccount" class="form-input">${incomeOptions}</select></label>
      <label>الحالة<select id="customerInvoicePostMode" class="form-input"><option value="post">ترحيل الآن</option><option value="draft">حفظ كمسودة</option></select></label>
      <label>البيان<input id="customerInvoiceMemo" class="form-input" value="فاتورة عميل"></label>
    </div>
    <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12px;color:var(--text-muted)">
      <input id="customerInvoiceReviewed" type="checkbox" style="margin-top:3px">
      <span>راجعت العميل والمبلغ وأفهم أن النظام سيأخذ نسخة احتياطية قبل ترحيل الفاتورة.</span>
    </label>
  `, body => {
    const amount = parseFinanceAmountInput(body.querySelector('#customerInvoiceAmount')?.value);
    const partner = body.querySelector('#customerInvoicePartner')?.value.trim() || '';
    const reviewed = !!body.querySelector('#customerInvoiceReviewed')?.checked;
    if (!partner) {
      showToast('أدخل اسم العميل قبل الحفظ', 'warning');
      return false;
    }
    if (amount <= 0) {
      showToast('مبلغ الفاتورة يجب أن يكون أكبر من صفر', 'warning');
      return false;
    }
    if (!reviewed) {
      showToast('راجع الفاتورة وفعّل التأكيد قبل الحفظ', 'warning');
      return false;
    }
    return {
      date: body.querySelector('#customerInvoiceDate')?.value || todayISO(),
      partner_id: partner,
      amount,
      income_account_id: body.querySelector('#customerInvoiceIncomeAccount')?.value || 'income_sales',
      memo: body.querySelector('#customerInvoiceMemo')?.value.trim() || 'فاتورة عميل',
      post: body.querySelector('#customerInvoicePostMode')?.value !== 'draft',
    };
  });
  if (!form) return null;
  const confirmed = await showOmniModal('مراجعة أخيرة قبل ترحيل فاتورة العميل', `
    <div style="display:grid;gap:8px;font-size:13px">
      <div><strong>العميل:</strong> ${escapeHtml(form.partner_id)}</div>
      <div><strong>التاريخ:</strong> ${escapeHtml(form.date)}</div>
      <div><strong>المبلغ:</strong> ${formatNum(form.amount)}</div>
      <div><strong>الحساب:</strong> ${escapeHtml(form.income_account_id)}</div>
      <div><strong>الحالة:</strong> ${form.post ? 'ترحيل الآن' : 'مسودة'}</div>
      <div style="color:var(--text-muted);margin-top:8px">سيتم إنشاء نسخة احتياطية مؤكدة قبل أي تعديل، ثم ${form.post ? 'ترحيل فاتورة عميل مدينة على ذمم العملاء' : 'حفظ فاتورة العميل كمسودة'}.</div>
    </div>
  `, () => true);
  if (!confirmed) return null;
  try {
    const result = await FinanceService.createCustomerInvoice({ ...form, backup_tag: 'pre_customer_invoice' });
    await PentagonDB.load({ force: true });
    showToast(`${form.post ? 'تم ترحيل' : 'تم حفظ'} فاتورة العميل ${result.move?.name || ''}`, 'success');
    renderCustomerInvoicesTab();
    renderFinanceDashboard();
    return result;
  } catch (error) {
    showToast(error.message || 'تعذر إنشاء فاتورة العميل', 'error');
    return null;
  }
}

async function openVendorBillModal() {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'create')) {
    return showToast('ليس لديك صلاحية إنشاء فواتير الموردين', 'warning');
  }
  const expenseOptions = renderFinanceAccountOptionsByType('expense', 'expense_general');
  const partnerOptions = renderFinancePartnerDatalistOptions('vendor');
  const form = await showOmniModal('فاتورة مورد جديدة', `
    <datalist id="vendorBillPartnerOptions">${partnerOptions}</datalist>
    <div class="je-form-row">
      <label>التاريخ<input id="vendorBillDate" type="date" class="form-input" value="${todayISO()}"></label>
      <label>المورد<input id="vendorBillPartner" list="vendorBillPartnerOptions" class="form-input" placeholder="اسم المورد أو كوده"></label>
      <label>المبلغ<input id="vendorBillAmount" inputmode="numeric" class="form-input" placeholder="0"></label>
    </div>
    <div class="je-form-row">
      <label>حساب المصروف<select id="vendorBillExpenseAccount" class="form-input">${expenseOptions}</select></label>
      <label>الحالة<select id="vendorBillPostMode" class="form-input"><option value="post">ترحيل الآن</option><option value="draft">حفظ كمسودة</option></select></label>
      <label>البيان<input id="vendorBillMemo" class="form-input" value="فاتورة مورد"></label>
    </div>
    <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12px;color:var(--text-muted)">
      <input id="vendorBillReviewed" type="checkbox" style="margin-top:3px">
      <span>راجعت المورد والمبلغ وأفهم أن النظام سيأخذ نسخة احتياطية قبل ترحيل الفاتورة.</span>
    </label>
  `, body => {
    const amount = parseFinanceAmountInput(body.querySelector('#vendorBillAmount')?.value);
    const partner = body.querySelector('#vendorBillPartner')?.value.trim() || '';
    const reviewed = !!body.querySelector('#vendorBillReviewed')?.checked;
    if (!partner) {
      showToast('أدخل اسم المورد قبل الحفظ', 'warning');
      return false;
    }
    if (amount <= 0) {
      showToast('مبلغ فاتورة المورد يجب أن يكون أكبر من صفر', 'warning');
      return false;
    }
    if (!reviewed) {
      showToast('راجع الفاتورة وفعّل التأكيد قبل الحفظ', 'warning');
      return false;
    }
    return {
      date: body.querySelector('#vendorBillDate')?.value || todayISO(),
      partner_id: partner,
      amount,
      expense_account_id: body.querySelector('#vendorBillExpenseAccount')?.value || 'expense_general',
      memo: body.querySelector('#vendorBillMemo')?.value.trim() || 'فاتورة مورد',
      post: body.querySelector('#vendorBillPostMode')?.value !== 'draft',
    };
  });
  if (!form) return null;
  const confirmed = await showOmniModal('مراجعة أخيرة قبل ترحيل فاتورة المورد', `
    <div style="display:grid;gap:8px;font-size:13px">
      <div><strong>المورد:</strong> ${escapeHtml(form.partner_id)}</div>
      <div><strong>التاريخ:</strong> ${escapeHtml(form.date)}</div>
      <div><strong>المبلغ:</strong> ${formatNum(form.amount)}</div>
      <div><strong>الحساب:</strong> ${escapeHtml(form.expense_account_id)}</div>
      <div><strong>الحالة:</strong> ${form.post ? 'ترحيل الآن' : 'مسودة'}</div>
      <div style="color:var(--text-muted);margin-top:8px">سيتم إنشاء نسخة احتياطية مؤكدة قبل أي تعديل، ثم ${form.post ? 'ترحيل فاتورة مورد دائنة على ذمم الموردين' : 'حفظ فاتورة المورد كمسودة'}.</div>
    </div>
  `, () => true);
  if (!confirmed) return null;
  try {
    const result = await FinanceService.createVendorBill({ ...form, backup_tag: 'pre_vendor_bill' });
    await PentagonDB.load({ force: true });
    showToast(`${form.post ? 'تم ترحيل' : 'تم حفظ'} فاتورة المورد ${result.move?.name || ''}`, 'success');
    renderVendorBillsTab();
    renderFinanceDashboard();
    return result;
  } catch (error) {
    showToast(error.message || 'تعذر إنشاء فاتورة المورد', 'error');
    return null;
  }
}

async function renderPartnerStatementTab() {
  const el = document.getElementById('financeTab-statement');
  if (!el) return;
  if (!window.FinanceService) {
    el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>';
    return;
  }
  
  const preservedPartner = document.getElementById('statementPartner')?.value;
  const preservedStartDate = document.getElementById('statementStartDate')?.value || '';
  const preservedEndDate = document.getElementById('statementEndDate')?.value || '';
  const preservedSearch = (document.getElementById('statementSearch')?.value || '').trim().toLowerCase();

  el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">جاري تحميل كشف الحساب...</div>';
  try {
    const recon = await FinanceService.getReconciliationSummary();
    const partners = [...new Set((recon.openItems || []).map(item => item.partner_id || 'بدون طرف'))];
    
    const db = await PentagonDB.load();
    const allMoves = db.account_moves || [];
    allMoves.forEach(move => {
      if (move.partner_id) partners.push(move.partner_id);
      (move.line_ids || []).forEach(line => {
        if (line.partner_id) partners.push(line.partner_id);
      });
    });
    const uniquePartners = [...new Set(partners)].filter(Boolean).sort();

    const selected = preservedPartner || uniquePartners[0] || '';
    const startDate = preservedStartDate;
    const endDate = preservedEndDate;
    const statementSearch = preservedSearch;
    
    const partnerOptions = uniquePartners.map(name => `<option value="${escapeHtml(name)}" ${name === selected ? 'selected' : ''}>${escapeHtml(name)}</option>`).join('');
    
    const stmt = await FinanceService.getPartnerStatement(selected, startDate, endDate);
    
    const filteredRows = stmt.rows.filter(row => {
      if (statementSearch) {
        const haystack = `${row.move_name || ''} ${row.account_id || ''} ${row.label || ''}`.toLowerCase();
        if (!haystack.includes(statementSearch)) return false;
      }
      return true;
    });

    const currency = omni.adminSettings?.organization?.currencySymbol || 'د.ع';

    const rowsHtml = filteredRows.map(row => {
      return `<tr>
        <td>${escapeHtml(row.date)}</td>
        <td>${escapeHtml(row.move_name)}</td>
        <td>${escapeHtml(row.label)}</td>
        <td class="num-cell">${row.debit > 0 ? formatNum(row.debit) : '-'}</td>
        <td class="num-cell">${row.credit > 0 ? formatNum(row.credit) : '-'}</td>
        <td class="num-cell" style="font-weight: 600; color: ${row.running_balance >= 0 ? '#34d399' : '#f87171'}">${formatNum(row.running_balance)}</td>
        <td>
          <button class="btn-secondary btn-xs" onclick="switchFinanceTab('journal');setTimeout(()=>renderJournalEntryTab('${escapeHtml(row.move_id)}'),50)"><i class="fa-solid fa-file-invoice"></i> عرض القيد</button>
        </td>
      </tr>`;
    }).join('') || '<tr><td colspan="7" class="empty-cell">لا توجد حركة في هذه الفترة لهذا الطرف</td></tr>';

    el.innerHTML = `
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <h3 class="section-title" style="margin:0"><i class="fa-solid fa-file-invoice-dollar"></i> كشف الحساب التفصيلي (Statement)</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">كشف حساب مالي بالرصيد الافتتاحي والجاري والختامي للشريك</div>
          </div>
          <div style="display:flex;gap:8px;">
            <button class="btn btn-secondary btn-sm" onclick="printPartnerStatement('${escapeHtml(selected)}', '${escapeHtml(startDate)}', '${escapeHtml(endDate)}')">
              <i class="fa-solid fa-print"></i> طباعة كشف الحساب
            </button>
          </div>
        </div>

        <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; margin-bottom: 16px; border: 1px solid rgba(255,255,255,0.05);">
          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(180px, 1fr));gap:12px;align-items:flex-end;">
            <label style="font-size:12px;color:var(--text-muted)">اختر الشريك (العميل/المورد)
              <select id="statementPartner" class="form-input" onchange="renderPartnerStatementTab()">${partnerOptions}</select>
            </label>
            <label style="font-size:12px;color:var(--text-muted)">من تاريخ
              <input id="statementStartDate" type="date" class="form-input" value="${escapeHtml(startDate)}" onchange="renderPartnerStatementTab()">
            </label>
            <label style="font-size:12px;color:var(--text-muted)">إلى تاريخ
              <input id="statementEndDate" type="date" class="form-input" value="${escapeHtml(endDate)}" onchange="renderPartnerStatementTab()">
            </label>
            <label style="font-size:12px;color:var(--text-muted)">بحث في الحركات
              <input id="statementSearch" class="form-input" value="${escapeHtml(statementSearch)}" placeholder="القيد أو البيان" oninput="clearTimeout(window.__statementFilterTimer);window.__statementFilterTimer=setTimeout(renderPartnerStatementTab,250)">
            </label>
          </div>
        </div>

        <div class="stats-grid" style="margin-bottom:16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
          <div class="stat-card" style="padding: 10px; background: rgba(255,255,255,0.01); border-radius: 6px;">
            <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">الرصيد الافتتاحي</span>
            <strong style="font-size: 16px; color: #e2e8f0;">${formatNum(stmt.startingBalance)} <small>${currency}</small></strong>
          </div>
          <div class="stat-card" style="padding: 10px; background: rgba(255,255,255,0.01); border-radius: 6px;">
            <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">صافي حركة الفترة</span>
            <strong style="font-size: 16px; color: #38bdf8;">${formatNum(stmt.endingBalance - stmt.startingBalance)} <small>${currency}</small></strong>
          </div>
          <div class="stat-card" style="padding: 10px; background: rgba(255,255,255,0.01); border-radius: 6px;">
            <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">الرصيد الختامي</span>
            <strong style="font-size: 16px; color: #34d399;">${formatNum(stmt.endingBalance)} <small>${currency}</small></strong>
          </div>
        </div>

        <table class="data-table tb-table">
          <thead>
            <tr>
              <th>التاريخ</th>
              <th>رقم القيد</th>
              <th>البيان</th>
              <th class="num-cell">مدين (+)</th>
              <th class="num-cell">دائن (-)</th>
              <th class="num-cell">الرصيد الجاري</th>
              <th>الخيارات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>`;
  } catch (error) {
    el.innerHTML = `<p style="color:var(--danger)">تعذر تحميل كشف الحساب: ${escapeHtml(error.message || '')}</p>`;
  }
}

async function printPartnerStatement(partnerId, startDate, endDate) {
  if (!window.FinanceService) return;
  const stmt = await FinanceService.getPartnerStatement(partnerId, startDate, endDate);
  const win = window.open('', '_blank');
  const org = omni.adminSettings?.organization || { name: 'ورشة بينتاجون', phone: '' };
  const cur = org.currencySymbol || 'د.ع';
  
  let rowsHtml = stmt.rows.map(r => `
    <tr>
      <td>${escapeHtml(r.date)}</td>
      <td>${escapeHtml(r.move_name)}</td>
      <td>${escapeHtml(r.label)}</td>
      <td class="num">${r.debit > 0 ? formatNum(r.debit) : '-'}</td>
      <td class="num">${r.credit > 0 ? formatNum(r.credit) : '-'}</td>
      <td class="num">${formatNum(r.running_balance)}</td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align:center">لا توجد حركة في هذه الفترة</td></tr>';

  win.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="utf-8">
      <title>كشف حساب - ${escapeHtml(partnerId)}</title>
      <style>
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; margin: 40px; }
        .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0; font-size: 24px; }
        .header-info { text-align: left; font-size: 14px; }
        .title { text-align: center; margin-bottom: 30px; }
        .title h2 { margin: 0; font-size: 20px; color: #1e3a8a; }
        .title p { margin: 5px 0 0 0; font-size: 13px; color: #666; }
        .summary-box { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; background: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; }
        .summary-item { text-align: center; }
        .summary-item label { display: block; font-size: 12px; color: #64748b; margin-bottom: 5px; }
        .summary-item val { font-size: 16px; font-weight: bold; color: #0f172a; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
        th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: right; font-size: 13px; }
        th { background: #f1f5f9; font-weight: 600; }
        .num { text-align: left; font-family: monospace; }
        .footer { text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 40px; }
        @media print {
          body { margin: 20px; }
          button { display: none; }
        }
      </style>
    </head>
    <body>
      <div style="text-align: left; margin-bottom: 20px;">
        <button onclick="window.print()" style="padding: 8px 16px; background: #2563eb; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 500;">طباعة كشف الحساب 🖨️</button>
      </div>
      <div class="header">
        <div>
          <h1>${escapeHtml(org.name)}</h1>
          <div>هاتف: ${escapeHtml(org.phone || '-')}</div>
        </div>
        <div class="header-info">
          <div>تاريخ الطباعة: ${new Date().toLocaleDateString('ar-IQ')}</div>
          <div>الصفحة: 1 من 1</div>
        </div>
      </div>
      
      <div class="title">
        <h2>كشف حساب مالي</h2>
        <p>للشريك: <strong>${escapeHtml(partnerId)}</strong></p>
        ${startDate || endDate ? `<p>الفترة من: ${escapeHtml(startDate || 'البداية')} إلى: ${escapeHtml(endDate || 'اليوم')}</p>` : ''}
      </div>

      <div class="summary-box">
        <div class="summary-item">
          <label>الرصيد الافتتاحي</label>
          <val>${formatNum(stmt.startingBalance)} ${escapeHtml(cur)}</val>
        </div>
        <div class="summary-item">
          <label>صافي الحركة</label>
          <val>${formatNum(stmt.endingBalance - stmt.startingBalance)} ${escapeHtml(cur)}</val>
        </div>
        <div class="summary-item">
          <label>الرصيد الختامي</label>
          <val style="color: #2563eb;">${formatNum(stmt.endingBalance)} ${escapeHtml(cur)}</val>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>التاريخ</th>
            <th>رقم القيد</th>
            <th>البيان / الوصف</th>
            <th style="text-align: left;">مدين (+)</th>
            <th style="text-align: left;">دائن (-)</th>
            <th style="text-align: left;">الرصيد الجاري</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>

      <div class="footer">
        نظام بينتاجون ERP - شريك المحاسبة الذكي
      </div>
    </body>
    </html>
  `);
  win.document.close();
}

async function renderPartnerLedgerTab() {
  const el = document.getElementById('financeTab-partner_ledger');
  if (!el) return;
  if (!window.FinanceService) {
    el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>';
    return;
  }
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">جاري تحميل أعمار الديون والشركاء...</div>';
  try {
    const summary = await FinanceService.getPartnerAgingSummary();
    
    summary.sort((a, b) => b.totalOpen - a.totalOpen);

    const rowsHtml = await Promise.all(summary.map(async row => {
      const ledger = await FinanceService.getPartnerLedger(row.partner);
      
      return `<tr>
        <td><strong>${escapeHtml(row.partner)}</strong></td>
        <td class="num-cell" style="color: #34d399;">${formatNum(ledger.totalDebit)}</td>
        <td class="num-cell" style="color: #f87171;">${formatNum(ledger.totalCredit)}</td>
        <td class="num-cell" style="font-weight:600; color: ${row.totalOpen >= 0 ? '#38bdf8' : '#fb923c'}">${formatNum(row.totalOpen)}</td>
        <td class="num-cell">${formatNum(row.aging.current)}</td>
        <td class="num-cell">${formatNum(row.aging.mid)}</td>
        <td class="num-cell">${formatNum(row.aging.late)}</td>
        <td class="num-cell" style="color: #f87171; font-weight:600;">${formatNum(row.aging.critical)}</td>
        <td>
          <button class="btn-xs btn-primary" onclick="switchFinanceTab('statement');setTimeout(()=>{document.getElementById('statementPartner').value='${jsString(row.partner)}';renderPartnerStatementTab();},80)"><i class="fa-solid fa-receipt"></i> كشف الحساب</button>
        </td>
      </tr>`;
    })).then(rows => rows.join('')) || '<tr><td colspan="9" class="empty-cell">لا توجد أرصدة للشركاء حالياً</td></tr>';

    el.innerHTML = `
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <h3 class="section-title" style="margin:0"><i class="fa-solid fa-users-viewfinder"></i> أعمار ديون العملاء والموردين (الشركاء)</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">تحليل أرصدة الشركاء المستحقة وتقسيمها حسب فترات التأخير (0-30، 31-60، 61-90، +90 يوماً)</div>
          </div>
        </div>
        <div class="glass-card" style="margin-bottom: 16px; padding: 12px; background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.15); font-size: 13px; line-height: 1.6;">
          <i class="fa-solid fa-circle-info" style="color: #38bdf8; margin-left: 6px;"></i>
          <strong>ما هي أعمار الديون؟</strong> يوضح هذا التقرير المبالغ المستحقة للعملاء (ديون لنا مطلوب تحصيلها) أو للموردين والموظفين (ديون علينا مطلوب دفعها)، مقسمة حسب عدد الأيام التي مرت على تاريخ الفاتورة الأصلية دون سداد. يساعد هذا في تحديد الديون المتأخرة جداً لاتخاذ إجراءات التحصيل أو الدفع اللازمة.
        </div>

        <table class="data-table tb-table">
          <thead>
            <tr>
              <th>اسم الشريك</th>
              <th class="num-cell">إجمالي المدين (+)</th>
              <th class="num-cell">إجمالي الدائن (-)</th>
              <th class="num-cell">الرصيد المستحق</th>
              <th class="num-cell">حالي (30-0)</th>
              <th class="num-cell">متوسط (60-31)</th>
              <th class="num-cell">متأخر (90-61)</th>
              <th class="num-cell">حرج (+90)</th>
              <th>خيارات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    el.innerHTML = `<p style="color:var(--danger)">تعذر تحميل أعمار ديون الشركاء: ${escapeHtml(error.message || '')}</p>`;
  }
}

let bankStatementLines = [
  { id: 'bl_1', date: '2026-06-04', ref: 'تحويل مالي صيانة', amount: -250000, partner_id: 'خضر عبد الخالق', reconciled: false },
  { id: 'bl_2', date: '2026-06-05', ref: 'تسديد دفعة عميل', amount: 750000, partner_id: 'حسين سالم', reconciled: false }
];

async function renderBankReconciliationTab() {
  const el = document.getElementById('financeTab-bank_reco');
  if (!el) return;
  if (!window.FinanceService) {
    el.innerHTML = '<p style="color:var(--danger)">FinanceService غير محمّل</p>';
    return;
  }
  el.innerHTML = '<div style="padding:24px;color:var(--text-muted)">جاري تحميل أداة مطابقة البنك...</div>';
  try {
    const results = await FinanceService.processBankReconciliation(bankStatementLines);
    
    const rowsHtml = results.map(res => {
      const line = res.bankLine;
      const rec = res.recommended;
      
      let statusHtml = '';
      let actionHtml = '';
      
      if (line.reconciled) {
        statusHtml = '<span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 11px;">تمت المطابقة</span>';
      } else if (rec) {
        statusHtml = `<span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 11px;">مقترح: ${escapeHtml(rec.move_name)}</span>`;
        actionHtml = `<button class="btn-xs btn-primary" onclick="confirmBankReconciliationMatch('${escapeHtml(line.id)}', '${escapeHtml(rec.move_id)}', '${escapeHtml(rec.line_id)}')"><i class="fa-solid fa-link"></i> مطابقة واعتماد</button>`;
      } else {
        statusHtml = '<span class="badge" style="background: rgba(248, 113, 113, 0.2); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.4); padding: 2px 6px; border-radius: 4px; font-size: 11px;">لم يعثر على قيد</span>';
        actionHtml = `<button class="btn-secondary btn-xs" onclick="switchFinanceTab('journal')"><i class="fa-solid fa-plus"></i> إنشاء قيد مالي جديد</button>`;
      }
      
      return `<tr>
        <td>${escapeHtml(line.date)}</td>
        <td>${escapeHtml(line.ref)}</td>
        <td>${escapeHtml(line.partner_id)}</td>
        <td class="num-cell" style="direction: ltr; text-align: left; font-weight: bold; color: ${line.amount >= 0 ? '#34d399' : '#f87171'}">${formatNum(line.amount)}</td>
        <td>${statusHtml}</td>
        <td>${actionHtml}</td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="empty-cell">لا توجد بنود كشف حساب بنكي للمطابقة</td></tr>';

    el.innerHTML = `
      <div class="glass-card" style="margin-top:16px">
        <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:14px">
          <div>
            <h3 class="section-title" style="margin:0"><i class="fa-solid fa-receipt"></i> مطابقة كشف الحساب البنكي (Bank Reconciliation)</h3>
            <div style="font-size:12px;color:var(--text-muted);margin-top:4px">مطابقة بنود كشف الحساب البنكي مع قيود الصندوق/البنك المسجلة في النظام</div>
          </div>
          <div>
            <button class="btn btn-secondary btn-sm" onclick="resetBankReconciliationDemo()"><i class="fa-solid fa-rotate-left"></i> إعادة تهيئة البيانات التجريبية</button>
          </div>
        </div>

        <div class="glass-card" style="margin-bottom: 16px; padding: 12px; background: rgba(56, 189, 248, 0.05); border: 1px solid rgba(56, 189, 248, 0.15); font-size: 13px; line-height: 1.6;">
          <i class="fa-solid fa-circle-info" style="color: #38bdf8; margin-left: 6px;"></i>
          <strong>كيف تعمل المطابقة البنكية؟</strong> يقوم محرك المطابقة تلقائياً بالبحث في كشف الحساب البنكي عن حركات تطابق القيود المحاسبية المسجلة بالخلفية بناءً على <strong>المبلغ، التاريخ، واسم الطرف</strong>. عند العثور على تطابق، يقترح النظام ربطهما؛ وإلا يتيح لك النظام إنشاء قيد مالي جديد فوراً لمطابقة الدفاتر مع البنك.
        </div>

        <table class="data-table tb-table">
          <thead>
            <tr>
              <th>تاريخ البنك</th>
              <th>مرجع المعاملة</th>
              <th>الشريك</th>
              <th class="num-cell">مبلغ المعاملة</th>
              <th>حالة المطابقة</th>
              <th>خيارات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    el.innerHTML = `<p style="color:var(--danger)">تعذر تحميل أداة مطابقة البنك: ${escapeHtml(error.message || '')}</p>`;
  }
}

async function confirmBankReconciliationMatch(bankLineId, moveId, lineId) {
  try {
    await PentagonDB.mutate(db => {
      const move = (db.account_moves || []).find(m => m.id === moveId);
      if (move) {
        const line = (move.line_ids || []).find(l => l.id === lineId);
        if (line) {
          line.reconciled = true;
          if (typeof upsertLegacyJournalEntry === 'function') {
            upsertLegacyJournalEntry(db, move);
          }
        }
      }
    });
    
    const line = bankStatementLines.find(bl => bl.id === bankLineId);
    if (line) {
      line.reconciled = true;
    }
    
    showToast('تمت مطابقة البند واعتماد قيد البنك بنجاح', 'success');
    renderBankReconciliationTab();
  } catch (error) {
    showToast('حدث خطأ أثناء مطابقة البند: ' + error.message, 'error');
  }
}

function resetBankReconciliationDemo() {
  bankStatementLines = [
    { id: 'bl_1', date: '2026-06-04', ref: 'تحويل مالي صيانة', amount: -250000, partner_id: 'خضر عبد الخالق', reconciled: false },
    { id: 'bl_2', date: '2026-06-05', ref: 'تسديد دفعة عميل', amount: 750000, partner_id: 'حسين سالم', reconciled: false }
  ];
  showToast('تمت إعادة تهيئة بنود كشف حساب البنك بنجاح', 'info');
  renderBankReconciliationTab();
}

async function openPaymentForOpenItem(moveId, lineId) {
  if (window.PermissionService && !window.PermissionService.check('account_payments', 'create')) {
    return showToast('ليس لديك صلاحية تسجيل الدفعات', 'warning');
  }
  const summary = await FinanceService.getReconciliationSummary();
  const item = (summary.openItems || []).find(row => row.move_id === moveId && row.line_id === lineId);
  if (!item) return showToast('البند المفتوح غير موجود', 'error');

  const isInbound = item.account_id === 'receivables_customers' || item.side === 'debit';
  const modalTitle = isInbound ? 'تسجيل استلام من عميل' : 'تسجيل دفع لمورد';
  const bodyHtml = `
    <div class="je-form-row">
      <label>التاريخ<input id="paymentDate" type="date" class="form-input" value="${todayISO()}"></label>
      <label>المبلغ<input id="paymentAmount" type="text" inputmode="numeric" class="form-input" value="${formatNum(item.open_amount || 0)}"></label>
      <label>الطرف<input id="paymentPartner" type="text" class="form-input" value="${escapeHtml(item.partner_id || '')}" readonly></label>
    </div>
    <label style="display:block;margin-top:10px">ملاحظة<input id="paymentMemo" type="text" class="form-input" value="${isInbound ? 'استلام دفعة' : 'دفع مورد'} - ${escapeHtml(item.move_name || '')}"></label>
    <label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-size:12px;color:var(--text-muted)">
      <input id="paymentReviewed" type="checkbox" style="margin-top:3px">
      <span>راجعت الطرف والمبلغ وأفهم أن النظام سيأخذ نسخة احتياطية قبل الترحيل.</span>
    </label>
    <div style="margin-top:12px;color:var(--text-muted);font-size:12px">
      الحد الأعلى للمطابقة: ${formatNum(item.open_amount || 0)}. المتبقي بعد هذه الدفعة سيظهر في جدول البنود المفتوحة.
    </div>
  `;

  const form = await showOmniModal(modalTitle, bodyHtml, modalBody => {
    const amount = parseFinanceAmountInput(modalBody.querySelector('#paymentAmount')?.value || 0);
    const date = modalBody.querySelector('#paymentDate')?.value || todayISO();
    const memo = modalBody.querySelector('#paymentMemo')?.value || '';
    const reviewed = !!modalBody.querySelector('#paymentReviewed')?.checked;
    if (amount <= 0 || amount > Number(item.open_amount || 0)) {
      showToast('مبلغ الدفعة يجب أن يكون أكبر من صفر ولا يتجاوز المفتوح', 'warning');
      return false;
    }
    if (!reviewed) {
      showToast('راجع الدفعة وفعّل التأكيد قبل الحفظ', 'warning');
      return false;
    }
    return { amount, date, memo };
  });
  if (!form) return null;

  const remainingAfter = Math.max(0, Number(item.open_amount || 0) - form.amount);
  const confirmHtml = `
    <div style="display:grid;gap:8px;font-size:13px">
      <div><strong>القيد:</strong> ${escapeHtml(item.move_name || '')}</div>
      <div><strong>الحساب:</strong> ${escapeHtml(getFinanceOpenItemAccountLabel(item))}</div>
      <div><strong>الطرف:</strong> ${escapeHtml(item.partner_id || '-')}</div>
      <div><strong>المبلغ:</strong> ${formatNum(form.amount)}</div>
      <div><strong>المفتوح قبل:</strong> ${formatNum(item.open_amount || 0)}</div>
      <div><strong>المتبقي بعد:</strong> ${formatNum(remainingAfter)}</div>
      <div style="color:var(--text-muted);margin-top:8px">سيتم إنشاء نسخة احتياطية مؤكدة قبل أي تعديل على قاعدة البيانات.</div>
    </div>
  `;
  const confirmed = await showOmniModal('مراجعة أخيرة قبل ترحيل الدفعة', confirmHtml, () => true);
  if (!confirmed) return null;

  try {
    const result = await FinanceService.createPayment({
      amount: form.amount,
      date: form.date,
      memo: form.memo,
      payment_type: isInbound ? 'inbound' : 'outbound',
      partner_type: isInbound ? 'customer' : 'supplier',
      partner_id: item.partner_id || '',
      destination_account_id: item.account_id,
      backup_tag: 'pre_payment',
      reconcile_with: {
        move_id: item.move_id,
        line_id: item.line_id,
        amount: form.amount,
      },
    });
    const backupFile = result?.backup?.file ? ` - ${result.backup.file}` : '';
    showToast(`تم تسجيل الدفعة ومطابقتها${backupFile}`, 'success');
    await PentagonDB.load({ force: true });
    renderPaymentsTab();
    renderJournalEntryTab(item.move_id);
    return result;
  } catch (error) {
    showToast(error.message || 'تعذر تسجيل الدفعة', 'error');
    return null;
  }
}

function renderAccountMoveDetail(move, journals, db, canUpdate) {
  const locked = isMoveLocked(move, db);
  const totalDebit = (move.line_ids || []).reduce((sum, line) => sum + Number(line.debit || 0), 0);
  const totalCredit = (move.line_ids || []).reduce((sum, line) => sum + Number(line.credit || 0), 0);
  const lockedTip = locked ? ' title="الفترة مقفلة" disabled' : '';
  const canEdit = canUpdate && move.state === 'draft' && !locked;
  const canPost = canUpdate && move.state === 'draft' && !locked;
  const canCancel = canUpdate && move.state === 'posted' && !locked;
  const canUnpost = canUpdate && move.state === 'posted' && !locked;
  const lineRows = (move.line_ids || []).map(line => {
    const residual = getFinanceMoveLineResidual(db, move, line);
    return `<tr>
    <td>${escapeHtml(line.account_id || '')}</td>
    <td>${escapeHtml(line.label || '')}</td>
    <td>${escapeHtml(line.partner_id || '')}</td>
    <td class="num-cell">${Number(line.debit || 0) ? formatNum(line.debit) : ''}</td>
    <td class="num-cell">${Number(line.credit || 0) ? formatNum(line.credit) : ''}</td>
    <td class="num-cell">${residual.reconcilable ? formatNum(residual.openAmount) : '-'}</td>
  </tr>`;
  }).join('');
  return `
    <div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:12px">
      <div>
        <h3 class="section-title" style="margin:0">${locked ? '<span title="الفترة مقفلة">🔒</span> ' : ''}${escapeHtml(move.name || '/')}</h3>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">${escapeHtml(move.date || '')} · ${escapeHtml(getJournalLabel(journals, move.journal_id))} · ${escapeHtml(move.move_type || 'entry')}</div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Origin: ${escapeHtml(move.origin || '-')}</div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn-xs btn-secondary" onclick="openEditAccountMoveDraftModal('${escapeHtml(move.id)}')" ${canEdit ? '' : lockedTip || 'disabled'}>تعديل</button>
        <button class="btn-xs btn-primary" onclick="postJEFromUI('${escapeHtml(move.id)}')" ${canPost ? '' : lockedTip || 'disabled'}>ترحيل</button>
        <button class="btn-xs btn-secondary" onclick="unpostMoveFromUI('${escapeHtml(move.id)}')" ${canUnpost ? '' : lockedTip || 'disabled'}>إرجاع</button>
        <button class="btn-xs btn-danger" onclick="cancelMoveFromUI('${escapeHtml(move.id)}')" ${canCancel ? '' : lockedTip || 'disabled'}>إلغاء</button>
        <button class="btn-xs btn-secondary" onclick="if(window.TrackChanges)TrackChanges.openDrawer('account_moves','${escapeHtml(move.id)}','${escapeHtml(move.name || move.id)}')" title="سجل التغييرات">📝 السجل</button>
      </div>
    </div>
    <table class="data-table tb-table">
      <thead><tr><th>الحساب</th><th>البيان</th><th>الطرف</th><th class="num-cell">مدين</th><th class="num-cell">دائن</th><th class="num-cell">المتبقي</th></tr></thead>
      <tbody>${lineRows}</tbody>
      <tfoot><tr><td colspan="3"><strong>المجموع</strong></td><td class="num-cell"><strong>${formatNum(totalDebit)}</strong></td><td class="num-cell"><strong>${formatNum(totalCredit)}</strong></td><td></td></tr></tfoot>
    </table>
    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;direction:ltr;text-align:left">hash: ${escapeHtml(move.hash || '-')} · previous: ${escapeHtml(move.previous_hash || '-')}</div>
  `;
}

function renderDraftMoveAccountOptions(selectedId = '') {
  ensureFinance();
  return (finance?.accounts || [])
    .map(account => `<option value="${escapeHtml(account.id)}" ${account.id === selectedId ? 'selected' : ''}>${escapeHtml(account.code || '')} - ${escapeHtml(account.name || account.id)}</option>`)
    .join('');
}

function renderDraftMoveEditLine(line = {}, index = 0) {
  return `<div class="je-lines-grid je-line-row draft-move-line-row" data-line-id="${escapeHtml(line.id || '')}">
    <span>${index + 1}</span>
    <select class="form-input draft-move-account" onchange="updateDraftMoveEditBalance()">${renderDraftMoveAccountOptions(line.account_id || '')}</select>
    <input type="text" class="form-input draft-move-label" value="${escapeHtml(line.label || '')}" placeholder="البيان">
    <input type="text" inputmode="numeric" class="form-input draft-move-debit" value="${Number(line.debit || 0) || ''}" oninput="if(parseFinanceAmountInput(this.value)>0)this.closest('.draft-move-line-row').querySelector('.draft-move-credit').value='';updateDraftMoveEditBalance()">
    <input type="text" inputmode="numeric" class="form-input draft-move-credit" value="${Number(line.credit || 0) || ''}" oninput="if(parseFinanceAmountInput(this.value)>0)this.closest('.draft-move-line-row').querySelector('.draft-move-debit').value='';updateDraftMoveEditBalance()">
    <button type="button" class="btn-xs btn-danger" onclick="this.closest('.draft-move-line-row').remove();renumberDraftMoveEditLines();updateDraftMoveEditBalance()">x</button>
  </div>`;
}

function addDraftMoveEditLine() {
  const container = document.getElementById('draftMoveEditLines');
  if (!container) return;
  container.insertAdjacentHTML('beforeend', renderDraftMoveEditLine({}, container.querySelectorAll('.draft-move-line-row').length));
  updateDraftMoveEditBalance();
}

function renumberDraftMoveEditLines() {
  document.querySelectorAll('#draftMoveEditLines .draft-move-line-row').forEach((row, index) => {
    const label = row.querySelector('span');
    if (label) label.textContent = String(index + 1);
  });
}

function getDraftMoveEditTotals() {
  return [...document.querySelectorAll('#draftMoveEditLines .draft-move-line-row')].reduce((acc, row) => {
    acc.debit += parseFinanceAmountInput(row.querySelector('.draft-move-debit')?.value);
    acc.credit += parseFinanceAmountInput(row.querySelector('.draft-move-credit')?.value);
    return acc;
  }, { debit: 0, credit: 0 });
}

function updateDraftMoveEditBalance() {
  const chip = document.getElementById('draftMoveEditBalance');
  if (!chip) return;
  const totals = getDraftMoveEditTotals();
  const balanced = totals.debit > 0 && Math.abs(totals.debit - totals.credit) < 0.01;
  chip.textContent = balanced
    ? `متوازن - ${formatNum(totals.debit)}`
    : `غير متوازن: مدين ${formatNum(totals.debit)} - دائن ${formatNum(totals.credit)}`;
  chip.className = `je-balance-chip ${balanced ? 'balanced' : 'unbalanced'}`;
}

async function openEditAccountMoveDraftModal(moveId) {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'update')) {
    return showToast('ليس لديك صلاحية تعديل القيود', 'warning');
  }
  const move = await FinanceService.getMove(moveId);
  if (!move) return showToast('القيد غير موجود', 'error');
  if (move.state !== 'draft') return showToast('يمكن تعديل المسودات فقط', 'warning');
  const journals = PentagonDB.getCached()?.journals || [];
  const journalOptions = journals.map(journal => `<option value="${escapeHtml(journal.id)}" ${journal.id === move.journal_id ? 'selected' : ''}>${escapeHtml(journal.name || journal.code || journal.id)}</option>`).join('');
  const typeOptions = FinanceService.moveTypes.map(type => `<option value="${escapeHtml(type)}" ${type === move.move_type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('');
  const rows = (move.line_ids || []).map((line, index) => renderDraftMoveEditLine(line, index)).join('');
  const form = await showOmniModal('تعديل مسودة قيد', `
    <div class="je-form-row">
      <label>اليومية<select id="draftMoveJournal" class="form-input">${journalOptions}</select></label>
      <label>التاريخ<input id="draftMoveDate" type="date" class="form-input" value="${escapeHtml(move.date || todayISO())}"></label>
      <label>النوع<select id="draftMoveType" class="form-input">${typeOptions}</select></label>
    </div>
    <div class="je-form-row">
      <label>الطرف<input id="draftMovePartner" class="form-input" value="${escapeHtml(move.partner_id || '')}"></label>
      <label>المرجع<input id="draftMoveOrigin" class="form-input" value="${escapeHtml(move.origin || '')}"></label>
    </div>
    <div id="draftMoveEditLines">
      <div class="je-lines-grid je-lines-header"><span>#</span><span>الحساب</span><span>البيان</span><span>مدين</span><span>دائن</span><span></span></div>
      ${rows}
    </div>
    <div class="je-footer-row" style="margin-top:12px">
      <button type="button" class="btn-secondary btn-sm" onclick="addDraftMoveEditLine()">+ سطر</button>
      <div id="draftMoveEditBalance" class="je-balance-chip">-</div>
    </div>
    <div style="color:var(--text-muted);font-size:12px;margin-top:10px">سيأخذ النظام نسخة احتياطية قبل حفظ أي تعديل على المسودة.</div>
  `, body => {
    const lineRows = [...body.querySelectorAll('#draftMoveEditLines .draft-move-line-row')];
    const lines = lineRows.map((row, index) => ({
      id: row.dataset.lineId || undefined,
      sequence: index,
      account_id: row.querySelector('.draft-move-account')?.value || '',
      label: row.querySelector('.draft-move-label')?.value.trim() || '',
      debit: parseFinanceAmountInput(row.querySelector('.draft-move-debit')?.value),
      credit: parseFinanceAmountInput(row.querySelector('.draft-move-credit')?.value),
    })).filter(line => line.account_id || line.debit || line.credit || line.label);
    if (lines.length < 2) {
      showToast('القيد يحتاج سطرين على الأقل', 'warning');
      return false;
    }
    if (lines.some(line => !line.account_id)) {
      showToast('اختر حساباً لكل سطر', 'warning');
      return false;
    }
    try {
      FinanceService.validateBalanced(lines);
    } catch (error) {
      showToast(error.message || 'القيد غير متوازن', 'warning');
      return false;
    }
    return {
      journal_id: body.querySelector('#draftMoveJournal')?.value || move.journal_id,
      date: body.querySelector('#draftMoveDate')?.value || todayISO(),
      move_type: body.querySelector('#draftMoveType')?.value || 'entry',
      partner_id: body.querySelector('#draftMovePartner')?.value.trim() || '',
      origin: body.querySelector('#draftMoveOrigin')?.value.trim() || '',
      line_ids: lines,
      backup_tag: 'pre_account_move_update_ui',
    };
  }, () => {
    updateDraftMoveEditBalance();
  });
  if (!form) return null;
  try {
    const updated = await FinanceService.updateMove(moveId, form);
    await PentagonDB.load({ force: true });
    showToast('تم حفظ تعديل المسودة', 'success');
    renderJournalEntryTab(updated.id);
    return updated;
  } catch (error) {
    showToast(error.message || 'تعذر تعديل المسودة', 'error');
    return null;
  }
}

function openNewJEModal() {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'create')) {
    return showToast('ليس لديك صلاحية إنشاء قيد', 'warning');
  }
  const form = document.getElementById('newJEForm');
  if (!form) return;
  const journals = PentagonDB.getCached()?.journals || [];
  const journalOpts = journals.map(j => `<option value="${escapeHtml(j.id)}">${escapeHtml(j.name || j.code)}</option>`).join('');
  const accountOpts = (finance?.accounts || []).map(a => `<option value="${escapeHtml(a.id)}">${escapeHtml(a.code)} - ${escapeHtml(a.name)}</option>`).join('');
  form.style.display = '';
  form.innerHTML = `
    <h3 class="section-title">قيد يدوي</h3>
    <div class="je-form-row">
      <label>اليومية<select id="jeJournal" class="form-input">${journalOpts}</select></label>
      <label>التاريخ<input id="jeDate" type="date" class="form-input" value="${todayISO()}"></label>
      <label>المرجع<input id="jeOrigin" type="text" class="form-input" placeholder="اختياري"></label>
    </div>
    <div id="jeLinesContainer">
      <div class="je-lines-grid je-lines-header"><span>#</span><span>الحساب</span><span>البيان</span><span>مدين</span><span>دائن</span><span></span></div>
      <div id="jeLines"></div>
    </div>
    <button class="btn-secondary btn-sm" onclick="addJELine('${accountOpts.replace(/'/g, "\\'")}')">+ سطر</button>
    <div class="je-footer-row">
      <div id="jeBalanceChip" class="je-balance-chip">-</div>
      <div>
        <button class="btn-secondary btn-sm" onclick="document.getElementById('newJEForm').style.display='none'">إلغاء</button>
        <button class="btn-primary btn-sm" onclick="saveNewJE()">حفظ مسودة</button>
      </div>
    </div>
  `;
  addJELine(accountOpts);
  addJELine(accountOpts);
  updateJEBalanceChip();
}

function saveNewJE() {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'create')) {
    return showToast('ليس لديك صلاحية إنشاء قيد', 'warning');
  }
  const journalId = document.getElementById('jeJournal')?.value;
  const date = document.getElementById('jeDate')?.value || todayISO();
  const origin = document.getElementById('jeOrigin')?.value.trim() || '';
  const lines = [];
  document.querySelectorAll('#jeLines .je-line-row').forEach(row => {
    lines.push({
      account_id: row.querySelector('.je-account')?.value || '',
      label: row.querySelector('.je-label')?.value || '',
      debit: Number(row.querySelector('.je-debit')?.value || 0),
      credit: Number(row.querySelector('.je-credit')?.value || 0),
    });
  });
  FinanceService.createMove({ journal_id: journalId, date, origin, move_type: 'entry', line_ids: lines })
    .then(move => {
      showToast('تم حفظ القيد كمسودة', 'success');
      renderJournalEntryTab(move.id);
    })
    .catch(error => showToast(error.message || 'خطأ في حفظ القيد', 'error'));
}

async function postJEFromUI(moveId) {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'update')) {
    return showToast('ليس لديك صلاحية ترحيل القيود', 'warning');
  }
  try {
    const move = await FinanceService.getMove(moveId);
    if (!move) return showToast('القيد غير موجود', 'error');
    const confirmed = await showOmniModal('مراجعة أخيرة قبل ترحيل القيد', `
      <div style="display:grid;gap:8px;font-size:13px">
        <div><strong>القيد:</strong> ${escapeHtml(move.name || '/')}</div>
        <div><strong>التاريخ:</strong> ${escapeHtml(move.date || '')}</div>
        <div><strong>النوع:</strong> ${escapeHtml(move.move_type || 'entry')}</div>
        <div><strong>الإجمالي:</strong> ${formatNum(move.amount_total || 0)}</div>
        <div style="color:var(--text-muted);margin-top:8px">سيأخذ النظام نسخة احتياطية قبل ترحيل القيد وإضافته إلى سلسلة الهاش.</div>
      </div>
    `, () => true);
    if (!confirmed) return null;
    const posted = await FinanceService.postMove(moveId, { backup_tag: 'pre_account_move_post_ui' });
    await PentagonDB.load({ force: true });
    showToast('تم ترحيل القيد', 'success');
    renderJournalEntryTab(posted.id);
    return posted;
  } catch (error) {
    showToast(error.message || 'خطأ في الترحيل', 'error');
    return null;
  }
}

async function cancelMoveFromUI(moveId) {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'update')) {
    return showToast('ليس لديك صلاحية إلغاء القيود', 'warning');
  }
  try {
    const move = await FinanceService.getMove(moveId);
    if (!move) return showToast('القيد غير موجود', 'error');
    const confirmed = await showOmniModal('مراجعة أخيرة قبل إلغاء القيد', `
      <div style="display:grid;gap:8px;font-size:13px">
        <div><strong>القيد:</strong> ${escapeHtml(move.name || '/')}</div>
        <div><strong>التاريخ:</strong> ${escapeHtml(move.date || '')}</div>
        <div><strong>الإجمالي:</strong> ${formatNum(move.amount_total || 0)}</div>
        <div style="color:var(--text-muted);margin-top:8px">سيأخذ النظام نسخة احتياطية، ثم ينشئ قيداً عكسياً ويعلّم القيد الأصلي كملغي.</div>
      </div>
    `, () => true);
    if (!confirmed) return null;
    const result = await FinanceService.cancelMove(moveId, { backup_tag: 'pre_account_move_cancel_ui' });
    await PentagonDB.load({ force: true });
    showToast('تم إلغاء القيد وإنشاء قيد عكسي', 'success');
    renderJournalEntryTab(result.cancelled.id);
    return result;
  } catch (error) {
    showToast(error.message || 'خطأ في الإلغاء', 'error');
    return null;
  }
}

async function unpostMoveFromUI(moveId) {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'update')) {
    return showToast('ليس لديك صلاحية إرجاع القيود', 'warning');
  }
  try {
    const move = await FinanceService.getMove(moveId);
    if (!move) return showToast('القيد غير موجود', 'error');
    const confirmed = await showOmniModal('مراجعة أخيرة قبل إرجاع القيد', `
      <div style="display:grid;gap:8px;font-size:13px">
        <div><strong>القيد:</strong> ${escapeHtml(move.name || '/')}</div>
        <div><strong>التاريخ:</strong> ${escapeHtml(move.date || '')}</div>
        <div><strong>الإجمالي:</strong> ${formatNum(move.amount_total || 0)}</div>
        <div style="color:var(--text-muted);margin-top:8px">سيأخذ النظام نسخة احتياطية، ثم يعيد القيد إلى مسودة ويزيل هاش الترحيل.</div>
      </div>
    `, () => true);
    if (!confirmed) return null;
    const draft = await FinanceService.unpostMove(moveId, { backup_tag: 'pre_account_move_unpost_ui' });
    await PentagonDB.load({ force: true });
    showToast('تم إرجاع القيد إلى مسودة', 'success');
    renderJournalEntryTab(draft.id);
    return draft;
  } catch (error) {
    showToast(error.message || 'خطأ في الإرجاع', 'error');
    return null;
  }
}

function saveFinanceLockDate() {
  const value = document.getElementById('financeLockDate')?.value || '';
  FinanceService.setLockDate(value)
    .then(() => { showToast('تم حفظ تاريخ الإقفال', 'success'); renderJournalEntryTab(); })
    .catch(error => showToast(error.message || 'تعذر حفظ تاريخ الإقفال', 'error'));
}

function closeFinanceSelectedMonth() {
  const base = document.getElementById('jeDate')?.value || todayISO();
  const date = new Date(`${base.slice(0, 7)}-01T00:00:00`);
  date.setMonth(date.getMonth() + 1, 0);
  const lockDate = date.toISOString().slice(0, 10);
  FinanceService.setLockDate(lockDate)
    .then(() => { showToast(`تم إقفال الفترة حتى ${lockDate}`, 'success'); renderJournalEntryTab(); })
    .catch(error => showToast(error.message || 'تعذر إقفال الفترة', 'error'));
}

function reverseJEFromUI(moveId) {
  return cancelMoveFromUI(moveId);
}

// ── Block 6: Reopen Period ───────────────────────────────────────────────────

async function reopenFinancePeriod() {
  if (window.PermissionService && !window.PermissionService.check('account_moves', 'update')) {
    return showToast('ليس لديك صلاحية فتح الفترة المغلقة', 'warning');
  }
  const confirmed = await showOmniConfirm('تأكيد فتح الفترة المغلقة', 'هل أنت متأكد من إلغاء قفل الفترة الحالية؟ سيتمكن المحاسبون من تعديل القيود التاريخية مجدداً.');
  if (!confirmed) return;
  
  FinanceService.setLockDate('')
    .then(() => { 
      showToast('تم فتح إقفال الفترة بنجاح', 'success'); 
      renderJournalEntryTab(); 
    })
    .catch(error => showToast(error.message || 'تعذر فتح إقفال الفترة', 'error'));
}

// ── Block 7: Customer Charge Repairs ─────────────────────────────────────────

async function repairCustomerChargeMoves(options = {}) {
  const dryRun = !!options.dryRun;
  if (!window.FinanceService || !window.PentagonDB) throw new Error('FinanceService غير جاهز');
  const db = await window.PentagonDB.load({ force: true });
  const moves = db.account_moves || [];
  const legacy = (typeof getFinanceTransactions === 'function') ? getFinanceTransactions() : [];
  const ccById = {};
  legacy.forEach(t => { if (t && t.type === 'customer_charge') ccById[t.id] = t; });

  const candidates = moves.filter(m => {
    if (m.state !== 'posted') return false;
    const o = String(m.origin || '');
    if (!o.startsWith('legacy_sync/')) return false;
    const tx = ccById[o.slice('legacy_sync/'.length)];
    if (!tx) return false;
    const debitsAR = (m.line_ids || []).some(l => l.account_id === 'receivables_customers' && Number(l.debit || 0) > 0);
    return !(m.journal_id === 'j_sale' && debitsAR);
  });

  const result = { scanned: moves.length, candidates: candidates.length, repaired: 0, skipped: 0, details: [] };
  if (dryRun) {
    result.details = candidates.map(m => ({ id: m.id, journal: m.journal_id, date: m.date, action: 'would-repair' }));
    return result;
  }

  let relinked = false;
  for (const m of candidates) {
    const tx = ccById[String(m.origin || '').slice('legacy_sync/'.length)];
    const amount = Number(tx.amount || 0);
    try {
      await FinanceService.cancelMove(m.id, { skip_backup: true, reason: 'T2.2 customer_charge journal repair' });
      const partnerId = tx.customerId || tx.partyName || 'شريك عام';
      const label = tx.description || 'مطالبة على عميل';
      const fixed = await FinanceService.createMove({
        journal_id: 'j_sale', move_type: 'entry', date: tx.date, partner_id: partnerId,
        origin: `legacy_sync/${tx.id}`, companyId: tx.companyId || '', skip_backup: true,
        line_ids: [
          { account_id: (tx.accountId || 'receivables_customers'), debit: amount, credit: 0, label, partner_id: partnerId },
          { account_id: 'income_sales', debit: 0, credit: amount, label, partner_id: partnerId },
        ],
      });
      const posted = await FinanceService.postMove(fixed.id, { skip_backup: true });
      tx.v6_move_id = posted.id;
      relinked = true;
      result.repaired++;
      result.details.push({ old: m.id, new: posted.id, date: tx.date });
    } catch (err) {
      result.skipped++;
      result.details.push({ id: m.id, skipped: true, reason: (err.message || String(err)).slice(0, 90) });
    }
  }
  if (relinked && typeof saveData === 'function') { try { saveData(); } catch (_) {} }
  return result;
}

async function runCustomerChargeRepair() {
  try {
    const preview = await repairCustomerChargeMoves({ dryRun: true });
    if (!preview.candidates) {
      if (typeof showToast === 'function') showToast('لا توجد قيود عملاء بحاجة إلى إصلاح', 'success');
      return;
    }
    if (!confirm(`سيتم إصلاح ${preview.candidates} قيد عميل مُرحّل بيومية خاطئة (عكس + إعادة ترحيل صحيح). متابعة؟`)) return;
    const res = await repairCustomerChargeMoves();
    if (typeof showToast === 'function') showToast(`تم إصلاح ${res.repaired} قيد، وتخطّي ${res.skipped}`, res.skipped ? 'warning' : 'success');
    if (typeof renderJournalEntryTab === 'function') renderJournalEntryTab();
  } catch (err) {
    if (typeof showToast === 'function') showToast(`تعذر الإصلاح: ${err.message || err}`, 'error');
  }
}

// ── Global Exposures ──────────────────────────────────────────────────────────

window.renderFinanceDashboard = renderFinanceDashboard;
window.renderV6FinanceOverview = renderV6FinanceOverview;
window.addFinanceDemoData = addFinanceDemoData;
window.financeRefreshAll = financeRefreshAll;
window.switchFinanceTab_deprecated_dup1 = switchFinanceTab_deprecated_dup1;
window.renderJournalEntryTab_deprecated_dup1 = renderJournalEntryTab_deprecated_dup1;
window.openNewJEModal_deprecated_dup1 = openNewJEModal_deprecated_dup1;
window.addJELine = addJELine;
window.updateJEBalanceChip = updateJEBalanceChip;
window.saveNewJE_deprecated_dup1 = saveNewJE_deprecated_dup1;
window.postJEFromUI_deprecated_dup1 = postJEFromUI_deprecated_dup1;
window.reverseJEFromUI_deprecated_dup1 = reverseJEFromUI_deprecated_dup1;
window.renderTrialBalanceTab = renderTrialBalanceTab;
window.renderPLTab = renderPLTab;
window.renderLedgerTab = renderLedgerTab;
window.loadLedgerData = loadLedgerData;
window.ensureV6FinanceWorkspace = ensureV6FinanceWorkspace;
window.switchFinanceTab = switchFinanceTab;
window.getMoveStateLabel = getMoveStateLabel;
window.getMoveStateClass = getMoveStateClass;
window.isMoveLocked = isMoveLocked;
window.getJournalLabel = getJournalLabel;
window.renderJournalEntryTab = renderJournalEntryTab;
window.renderReconciliationPanel = renderReconciliationPanel;
window.getFinanceOpenItemKind = getFinanceOpenItemKind;
window.getFinanceOpenItemDirectionLabel = getFinanceOpenItemDirectionLabel;
window.getFinanceOpenItemAccountLabel = getFinanceOpenItemAccountLabel;
window.getFinanceMoveLineResidual = getFinanceMoveLineResidual;
window.getFinanceOpenItemAgeDays = getFinanceOpenItemAgeDays;
window.getFinancePaymentFilterValues = getFinancePaymentFilterValues;
window.getFinancePaymentHistoryFilterValues = getFinancePaymentHistoryFilterValues;
window.clearFinancePaymentHistoryFilters = clearFinancePaymentHistoryFilters;
window.clearPartnerStatementFilters = clearPartnerStatementFilters;
window.filterFinancePaymentOpenItems = filterFinancePaymentOpenItems;
window.renderFinancePaymentPartnerOptions = renderFinancePaymentPartnerOptions;
window.getFinanceAgingSummary = getFinanceAgingSummary;
window.renderPaymentsTab = renderPaymentsTab;
window.renderCustomerInvoicesTab = renderCustomerInvoicesTab;
window.renderVendorBillsTab = renderVendorBillsTab;
window.renderFinanceAccountOptionsByType = renderFinanceAccountOptionsByType;
window.parseFinanceAmountInput = parseFinanceAmountInput;
window.renderFinancePartnerDatalistOptions = renderFinancePartnerDatalistOptions;
window.openCustomerInvoiceModal = openCustomerInvoiceModal;
window.openVendorBillModal = openVendorBillModal;
window.renderPartnerStatementTab = renderPartnerStatementTab;
window.printPartnerStatement = printPartnerStatement;
window.renderPartnerLedgerTab = renderPartnerLedgerTab;
window.renderBankReconciliationTab = renderBankReconciliationTab;
window.confirmBankReconciliationMatch = confirmBankReconciliationMatch;
window.resetBankReconciliationDemo = resetBankReconciliationDemo;
window.openPaymentForOpenItem = openPaymentForOpenItem;
window.renderAccountMoveDetail = renderAccountMoveDetail;
window.renderDraftMoveAccountOptions = renderDraftMoveAccountOptions;
window.renderDraftMoveEditLine = renderDraftMoveEditLine;
window.addDraftMoveEditLine = addDraftMoveEditLine;
window.renumberDraftMoveEditLines = renumberDraftMoveEditLines;
window.getDraftMoveEditTotals = getDraftMoveEditTotals;
window.updateDraftMoveEditBalance = updateDraftMoveEditBalance;
window.openEditAccountMoveDraftModal = openEditAccountMoveDraftModal;
window.openNewJEModal = openNewJEModal;
window.saveNewJE = saveNewJE;
window.postJEFromUI = postJEFromUI;
window.cancelMoveFromUI = cancelMoveFromUI;
window.unpostMoveFromUI = unpostMoveFromUI;
window.saveFinanceLockDate = saveFinanceLockDate;
window.closeFinanceSelectedMonth = closeFinanceSelectedMonth;
window.reverseJEFromUI = reverseJEFromUI;
window.reopenFinancePeriod = reopenFinancePeriod;
window.repairCustomerChargeMoves = repairCustomerChargeMoves;
window.runCustomerChargeRepair = runCustomerChargeRepair;
