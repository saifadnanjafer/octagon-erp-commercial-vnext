(function () {
  'use strict';

  const root = window;
  const today = () => new Date().toISOString().slice(0, 10);
  const now = () => new Date().toISOString();
  const uid = prefix => prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const money = value => Number(value || 0);
  const fmt = value => money(value).toLocaleString('ar-IQ');

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function O() {
    if (typeof root.ensureOmni === 'function') {
      try { root.ensureOmni(); } catch (_) {}
    }
    try {
      if (omni && typeof omni === 'object') return omni;
    } catch (_) {}
    if (!root.omni || typeof root.omni !== 'object') root.omni = {};
    return root.omni;
  }

  function F() {
    if (typeof root.ensureFinance === 'function') {
      try { root.ensureFinance(); } catch (_) {}
    }
    try {
      if (finance && typeof finance === 'object') return finance;
    } catch (_) {}
    if (!root.finance || typeof root.finance !== 'object') root.finance = {};
    if (!Array.isArray(root.finance.accounts)) root.finance.accounts = [];
    if (!Array.isArray(root.finance.transactions)) root.finance.transactions = [];
    return root.finance;
  }

  function save() {
    if (typeof root.saveData === 'function') root.saveData();
  }

  function toast(message, type) {
    if (typeof root.showToast === 'function') root.showToast(message, type || 'info');
  }

  function activeCompanyId() {
    const org = O().adminSettings?.organization || {};
    return org.activeCompanyId || org.companyId || 'default';
  }

  function actor() {
    const user = root.PentagonAuth?.getCurrentUser?.() || {};
    return { id: user.id || 'system', name: user.name || 'النظام' };
  }

  function actionAllowed(actionKey, context) {
    if (!root.PermissionService || typeof root.PermissionService.checkAction !== 'function') return true;
    return root.PermissionService.checkAction(actionKey, context || {});
  }

  function explainAction(actionKey, context) {
    if (root.PermissionService && typeof root.PermissionService.explainAction === 'function') {
      return root.PermissionService.explainAction(actionKey, context || {});
    }
    return { actionKey, allowed: true, outcome: 'allowed', reason: 'permission_service_unavailable', riskLevel: context?.riskLevel || 'low' };
  }

  function auditAction(actionKey, result, context) {
    const user = actor();
    const groups = root.PermissionService?.resolveGroups?.(root.PentagonAuth?.getCurrentUser?.() || {}) || [];
    const explained = explainAction(actionKey, context || {});
    const payload = {
      timestamp: now(),
      userId: user.id,
      userName: user.name,
      userRole: groups.join(',') || 'unmapped',
      actionKey,
      page: context?.page || '',
      module: 'phase6a_core',
      targetId: context?.targetId || '',
      before: context?.before || null,
      after: context?.after || null,
      approvalRequestId: context?.approvalRequestId || '',
      riskLevel: context?.riskLevel || explained.riskLevel || '',
      reason: context?.reason || explained.reason || '',
      result
    };
    try {
      if (typeof root.recordOmniHistoryEvent === 'function') {
        root.recordOmniHistoryEvent({
          module: 'phase6a_core',
          source: context?.page || 'phase6a',
          action: actionKey,
          title: 'Phase 6B guarded action: ' + actionKey,
          actorId: user.id,
          actorName: user.name,
          role: payload.userRole,
          entityId: context?.targetId || '',
          entityType: context?.entityType || '',
          approvalRequestId: context?.approvalRequestId || '',
          status: result,
          before: context?.before || null,
          after: context?.after || null,
          payload
        });
      }
    } catch (_) {}
    try {
      if (typeof root.addOmniSystemLog === 'function') {
        root.addOmniSystemLog({
          action: actionKey,
          message: 'Phase 6C: ' + actionKey + ' -> ' + result + (payload.reason ? ' (' + payload.reason + ')' : ''),
          page: context?.page || 'phase6a',
          entityType: context?.entityType || '',
          entityId: context?.targetId || '',
          actor: user.name,
          severity: result === 'blocked' ? 'warning' : result === 'approval_requested' ? 'info' : 'success'
        });
      }
    } catch (_) {}
    try {
      if (root.AuditService?.createEvent) {
        root.AuditService.createEvent({ module: 'phase6a_core', action: actionKey, detail: result, user: user.name, payload });
      }
    } catch (_) {}
    return payload;
  }

  function requestApproval(actionKey, context, title, description, priority) {
    if (typeof root.createOmniRequest !== 'function') {
      auditAction(actionKey, 'blocked', { ...(context || {}), reason: 'approval_center_unavailable' });
      toast('هذا الإجراء يحتاج صلاحية مدير.', 'warning');
      return null;
    }
    const user = actor();
    const groups = root.PermissionService?.resolveGroups?.(root.PentagonAuth?.getCurrentUser?.() || {}) || [];
    const explained = explainAction(actionKey, context || {});
    const approvalPayload = {
      actionKey,
      sourcePage: context?.page || 'phase6a',
      sourceModule: context?.module || 'phase6a_core',
      user: { id: user.id, name: user.name, role: groups.join(',') || 'unmapped' },
      targetId: context?.targetId || actionKey,
      before: context?.before || null,
      after: context?.after || null,
      riskLevel: context?.riskLevel || explained.riskLevel || 'high',
      requestedAt: now(),
      status: 'pending',
      reason: context?.reason || explained.reason || 'approval_required',
      ...(context?.payload || {})
    };
    const req = root.createOmniRequest({
      type: context?.requestType || 'governance_review',
      title: title || 'طلب موافقة: ' + actionKey,
      description: description || 'إجراء حساس يحتاج مراجعة مدير قبل التنفيذ.',
      requesterId: user.id,
      requesterName: user.name,
      sourcePage: context?.page || 'phase6a',
      sourceType: actionKey,
      sourceId: context?.targetId || actionKey,
      priority: priority || 'high',
      payload: approvalPayload
    });
    auditAction(actionKey, 'approval_requested', { ...(context || {}), approvalRequestId: req?.id || '', riskLevel: approvalPayload.riskLevel, reason: approvalPayload.reason });
    toast('تم إرسال الطلب إلى مركز الموافقات.', 'success');
    return req;
  }

  function guardAction(actionKey, context, options) {
    const explained = explainAction(actionKey, context || {});
    const enriched = { ...(context || {}), riskLevel: context?.riskLevel || explained.riskLevel, reason: context?.reason || explained.reason };
    if (options?.forceApproval) {
      requestApproval(actionKey, enriched, options.title || 'طلب موافقة', options.description || 'إجراء حساس يحتاج مراجعة مدير.', options.priority || 'high');
      return false;
    }
    if (actionAllowed(actionKey, enriched)) {
      auditAction(actionKey, 'allowed', enriched);
      return true;
    }
    if (options?.approval) {
      requestApproval(actionKey, enriched, options.title || 'طلب موافقة', options.description || 'إجراء حساس يحتاج مراجعة مدير.', options.priority || 'high');
      return false;
    }
    auditAction(actionKey, 'blocked', enriched);
    toast(options?.message || 'هذا الإجراء يحتاج صلاحية مدير.', 'warning');
    return false;
  }

  function ensureBanking() {
    const omni = O();
    if (!omni.banking || typeof omni.banking !== 'object') omni.banking = {};
    if (!Array.isArray(omni.banking.reconciliations)) omni.banking.reconciliations = [];
    if (!Array.isArray(omni.banking.statementLines)) omni.banking.statementLines = [];
    if (!Array.isArray(omni.banking.reconciliationMatches)) omni.banking.reconciliationMatches = [];
    if (!omni.banking.settings || typeof omni.banking.settings !== 'object') omni.banking.settings = {};
    return omni.banking;
  }

  function ensureLocations() {
    const omni = O();
    if (!Array.isArray(omni.warehouses)) omni.warehouses = [];
    if (!Array.isArray(omni.storageLocations)) omni.storageLocations = [];
    if (!Array.isArray(omni.locationStock)) omni.locationStock = [];
    if (!Array.isArray(omni.locationMovements)) omni.locationMovements = [];

    const companyId = activeCompanyId();
    if (!omni.warehouses.some(row => row.id === 'MAIN_WORKSHOP')) {
      omni.warehouses.push({
        id: 'MAIN_WORKSHOP',
        code: 'MAIN_WORKSHOP',
        nameAr: 'الورشة الرئيسية',
        nameEn: 'Main Workshop',
        companyId,
        isDefault: true,
        createdAt: now()
      });
    }
    if (!omni.storageLocations.some(row => row.id === 'MAIN_STOCK')) {
      omni.storageLocations.push({
        id: 'MAIN_STOCK',
        code: 'MAIN_STOCK',
        nameAr: 'المخزن الرئيسي',
        nameEn: 'Main Stock',
        warehouseId: 'MAIN_WORKSHOP',
        type: 'stock',
        parentId: '',
        barcode: 'LOC-MAIN-STOCK',
        companyId,
        isDefault: true,
        createdAt: now()
      });
    }
    if (!omni.storageLocations.some(row => row.id === 'LOC_WIP')) {
      omni.storageLocations.push({
        id: 'LOC_WIP',
        code: 'LOC_WIP',
        nameAr: 'ورشة التنفيذ',
        nameEn: 'Execution Workshop',
        warehouseId: 'MAIN_WORKSHOP',
        type: 'internal',
        parentId: '',
        barcode: 'LOC-WIP',
        companyId,
        createdAt: now()
      });
    }
    if (!omni.storageLocations.some(row => row.id === 'LOC_MAIN')) {
      omni.storageLocations.push({
        id: 'LOC_MAIN',
        code: 'LOC_MAIN',
        nameAr: 'المخزن الرئيسي (Entity)',
        nameEn: 'Main Stock (Entity)',
        warehouseId: 'MAIN_WORKSHOP',
        type: 'stock',
        parentId: '',
        barcode: 'LOC-MAIN',
        companyId,
        createdAt: now()
      });
    }
    return omni;
  }

  function canAdminAccounting() {
    return !root.PermissionService || root.PermissionService.checkPage('admin_panel');
  }

  function financeAccounts() {
    return F().accounts || [];
  }

  function accountLabel(account) {
    return [account.code, account.nameAr || account.name || account.arabicName || account.nameEn || account.englishName].filter(Boolean).join(' - ');
  }

  function systemMovements() {
    const finance = F();
    return (finance.transactions || []).map(tx => ({
      id: tx.id,
      date: tx.date || tx.createdAt || '',
      reference: tx.reference || tx.receiptNo || tx.id,
      description: tx.description || tx.partyName || tx.type || 'حركة مالية',
      amount: money(tx.amount),
      direction: tx.direction === 'out' || tx.type === 'expense' ? 'out' : 'in',
      source: 'finance.transactions',
      party: tx.partyName || tx.customerName || tx.supplierName || ''
    })).filter(row => row.amount > 0);
  }

  function matchedMovementIds() {
    return new Set(ensureBanking().reconciliationMatches.filter(m => m.status !== 'cancelled').map(m => m.movementId));
  }

  function matchedLineIds() {
    return new Set(ensureBanking().reconciliationMatches.filter(m => m.status !== 'cancelled').map(m => m.lineId));
  }

  function getLine(id) {
    return ensureBanking().statementLines.find(line => line.id === id);
  }

  function signedAmount(row) {
    return row.direction === 'out' ? -money(row.amount) : money(row.amount);
  }

  function candidateScore(line, movement) {
    let score = 0;
    if (Math.abs(money(line.amount) - money(movement.amount)) <= 0.01) score += 55;
    if ((line.direction || 'in') === (movement.direction || 'in')) score += 15;
    const a = Date.parse(line.date || '');
    const b = Date.parse(movement.date || '');
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      const days = Math.abs(a - b) / 86400000;
      if (days === 0) score += 20;
      else if (days <= 3) score += 12;
      else if (days <= 7) score += 6;
    }
    const hay = String((movement.reference || '') + ' ' + (movement.description || '') + ' ' + (movement.party || '')).toLowerCase();
    const needle = String((line.reference || '') + ' ' + (line.notes || '')).toLowerCase().trim();
    if (needle && hay.includes(needle.slice(0, Math.min(12, needle.length)))) score += 10;
    return Math.min(score, 100);
  }

  function reconciliationSummary() {
    const bank = ensureBanking();
    const matches = bank.reconciliationMatches.filter(m => m.status !== 'cancelled');
    const movements = systemMovements();
    const movementMap = new Map(movements.map(row => [row.id, row]));
    const matchedMovements = matches.map(match => movementMap.get(match.movementId)).filter(Boolean);
    const statementTotal = bank.statementLines.reduce((sum, row) => sum + signedAmount(row), 0);
    const matchedTotal = matchedMovements.reduce((sum, row) => sum + signedAmount(row), 0);
    const difference = statementTotal - matchedTotal;
    const lineSet = matchedLineIds();
    const movementSet = matchedMovementIds();
    return {
      statementTotal,
      matchedTotal,
      difference,
      unmatchedLines: bank.statementLines.filter(line => !lineSet.has(line.id)).length,
      unmatchedMovements: movements.filter(row => !movementSet.has(row.id)).length,
      status: !bank.statementLines.length ? 'draft' : Math.abs(difference) <= 0.01 && bank.statementLines.length === matches.length ? 'reconciled' : matches.length ? 'partial' : 'draft'
    };
  }

  root.p6aAddStatementLine = function () {
    const bank = ensureBanking();
    const form = document.getElementById('p6aBankLineForm');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const amount = Math.abs(money(data.amount));
    if (!data.date || !amount) {
      toast('أدخل تاريخ ومبلغ سطر كشف الحساب.', 'warning');
      return;
    }
    if (!guardAction('banking.reconciliation.create', { page: 'banking', entityType: 'bank_statement_line', targetId: data.reference || data.date, after: { date: data.date, amount, direction: data.direction } })) return;
    const user = actor();
    bank.statementLines.unshift({
      id: uid('bst'),
      accountId: data.accountId || '',
      date: data.date,
      reference: data.reference || '',
      description: data.description || '',
      amount,
      direction: data.direction || 'in',
      debit: data.direction === 'out' ? amount : 0,
      credit: data.direction === 'in' ? amount : 0,
      notes: data.notes || '',
      companyId: activeCompanyId(),
      createdAt: now(),
      createdBy: user.id
    });
    save();
    toast('تمت إضافة سطر كشف الحساب كمعلومة مطابقة فقط.', 'success');
    renderBanking();
  };

  root.p6aMatchBankLine = function (lineId, movementId) {
    const bank = ensureBanking();
    if (!getLine(lineId) || !movementId) return;
    if (!guardAction('banking.reconciliation.match', { page: 'banking', entityType: 'bank_reconciliation_match', targetId: lineId, after: { lineId, movementId } })) return;
    bank.reconciliationMatches = bank.reconciliationMatches.filter(match => match.lineId !== lineId && match.movementId !== movementId);
    bank.reconciliationMatches.unshift({
      id: uid('bmatch'),
      lineId,
      movementId,
      status: 'matched',
      source: 'manual',
      companyId: activeCompanyId(),
      createdAt: now(),
      createdBy: actor().id
    });
    save();
    toast('تم حفظ المطابقة كـ metadata فقط دون تعديل القيود المالية.', 'success');
    renderBanking();
  };

  root.p6aUnmatchBankLine = function (lineId) {
    const bank = ensureBanking();
    if (!guardAction('banking.reconciliation.unmatch', { page: 'banking', entityType: 'bank_reconciliation_match', targetId: lineId, before: bank.reconciliationMatches.find(match => match.lineId === lineId && match.status !== 'cancelled') || null })) return;
    bank.reconciliationMatches.forEach(match => {
      if (match.lineId === lineId) {
        match.status = 'cancelled';
        match.cancelledAt = now();
        match.cancelledBy = actor().id;
      }
    });
    save();
    toast('تم فك المطابقة دون تغيير القيود.', 'info');
    renderBanking();
  };

  root.p6aCreateBankAdjustmentRequest = function () {
    const summary = reconciliationSummary();
    if (Math.abs(summary.difference) <= 0.01) {
      toast('لا توجد فروقات تحتاج طلب مراجعة.', 'info');
      return;
    }
    if (!guardAction('banking.reconciliation.adjustment_request', { page: 'banking', entityType: 'bank_reconciliation', targetId: 'current', payload: summary }, { approval: false })) return;
    requestApproval('banking.reconciliation.adjustment_request', { page: 'banking', entityType: 'bank_reconciliation', targetId: 'current', requestType: 'finance_review', before: null, after: summary, riskLevel: 'high', reason: 'bank_reconciliation_difference', payload: summary }, 'طلب مراجعة فرق مطابقة بنكية: ' + fmt(summary.difference) + ' د.ع', 'طلب مراجعة/اعتماد فرق مطابقة بنكية. لا توجد قيود مالية منشورة تلقائيا.', 'high');
    save();
    return;
    if (typeof root.createOmniRequest !== 'function') {
      toast('مركز القيادة غير متاح حالياً.', 'warning');
      return;
    }
    const req = root.createOmniRequest({
      type: 'finance_review',
      title: 'طلب مراجعة فرق مطابقة بنكية: ' + fmt(summary.difference) + ' د.ع',
      description: 'طلب مراجعة/اعتماد فرق مطابقة بنكية. لا توجد قيود مالية منشورة تلقائياً.',
      requesterId: actor().id,
      requesterName: actor().name,
      sourcePage: 'banking',
      sourceType: 'bank_reconciliation_difference',
      priority: 'high',
      payload: summary
    });
    auditAction('banking.reconciliation.adjustment_request', 'approval_requested', { page: 'banking', entityType: 'bank_reconciliation', targetId: 'current', approvalRequestId: req?.id || '', payload: summary });
    save();
    toast('تم إرسال فرق المطابقة إلى مركز القيادة للمراجعة.', 'success');
  };

  function renderBanking() {
    const body = document.getElementById('bankingBody');
    if (!body) return;
    ensureBanking();
    const bank = ensureBanking();
    const accounts = financeAccounts();
    const accountOptions = accounts.map(acc => `<option value="${esc(acc.id || acc.code)}">${esc(accountLabel(acc))}</option>`).join('');
    const movements = systemMovements();
    const movementSet = matchedMovementIds();
    const lineSet = matchedLineIds();
    const summary = reconciliationSummary();
    const lineRows = bank.statementLines.map(line => {
      const match = bank.reconciliationMatches.find(m => m.lineId === line.id && m.status !== 'cancelled');
      const matched = !!match;
      const options = movements
        .filter(mv => !movementSet.has(mv.id) || match?.movementId === mv.id)
        .map(mv => ({ mv, score: candidateScore(line, mv) }))
        .filter(item => item.score >= 55 || match?.movementId === item.mv.id)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .map(item => `<button class="p6a-btn" onclick="p6aMatchBankLine('${esc(line.id)}','${esc(item.mv.id)}')">${esc(item.mv.date)} · ${fmt(item.mv.amount)} · ${item.score}%</button>`)
        .join('');
      return `<tr>
        <td><strong>${esc(line.date)}</strong><span class="p6a-muted">${esc(line.reference || '-')}</span></td>
        <td><strong>${esc(line.description || line.notes || 'سطر كشف')}</strong><span class="p6a-muted">${line.direction === 'out' ? 'Debit / سحب' : 'Credit / إيداع'}</span></td>
        <td>${line.direction === 'out' ? '-' : '+'}${fmt(line.amount)}</td>
        <td>${matched ? '<span class="p6a-chip ok">مطابق</span>' : '<span class="p6a-chip warn">غير مطابق</span>'}</td>
        <td><div class="p6a-actions">${matched ? `<button class="p6a-btn danger" onclick="p6aUnmatchBankLine('${esc(line.id)}')">فك المطابقة</button>` : (options || '<span class="p6a-muted">لا توجد مرشحات قوية</span>')}</div></td>
      </tr>`;
    }).join('');
    const unmatchedMovements = movements.filter(mv => !movementSet.has(mv.id)).slice(0, 10).map(mv => `<tr>
      <td><strong>${esc(mv.date)}</strong><span class="p6a-muted">${esc(mv.reference || mv.id)}</span></td>
      <td>${esc(mv.description)}<br><span class="p6a-muted">${esc(mv.source)}</span></td>
      <td>${mv.direction === 'out' ? '-' : '+'}${fmt(mv.amount)}</td>
    </tr>`).join('');
    body.insertAdjacentHTML('beforeend', `<div class="p6a-shell" id="p6aBankRecon">
      <section class="p6a-panel">
        <div class="p6a-head">
          <div>
            <h3><i class="fa-solid fa-scale-balanced"></i> المطابقة البنكية</h3>
            <p>مطابقة محافظة: تحفظ سطور الكشف والروابط تحت <span class="p6a-code">omni.banking</span> ولا تغيّر معاملات finance أو تنشر قيوداً.</p>
          </div>
          <div class="p6a-chip-row">
            <span class="p6a-chip ${summary.status === 'reconciled' ? 'ok' : summary.status === 'partial' ? 'warn' : ''}">${esc({ reconciled: 'مطابَق', partial: 'مطابقة جزئية', draft: 'مسودة' }[summary.status] || summary.status)}</span>
            <span class="p6a-chip">الكشف ${fmt(summary.statementTotal)}</span>
            <span class="p6a-chip">المطابَق ${fmt(summary.matchedTotal)}</span>
            <span class="p6a-chip ${Math.abs(summary.difference) <= 0.01 ? 'ok' : 'bad'}">الفرق ${fmt(summary.difference)}</span>
          </div>
        </div>
        <form id="p6aBankLineForm" class="p6a-form-grid" onsubmit="event.preventDefault(); p6aAddStatementLine();">
          <label>الحساب البنكي<select name="accountId" class="p6a-input">${accountOptions || '<option value="">البنك الرئيسي</option>'}</select></label>
          <label>التاريخ<input name="date" class="p6a-input" type="date" value="${today()}"></label>
          <label>النوع<select name="direction" class="p6a-input"><option value="in">إيداع (دائن)</option><option value="out">سحب (مدين)</option></select></label>
          <label>المبلغ<input name="amount" class="p6a-input" type="number" step="0.01" min="0"></label>
          <label>المرجع<input name="reference" class="p6a-input" placeholder="مرجع الكشف"></label>
          <label>الوصف<input name="description" class="p6a-input" placeholder="وصف سطر البنك"></label>
          <label>ملاحظات<input name="notes" class="p6a-input" placeholder="اختياري"></label>
          <button class="p6a-btn primary" type="submit"><i class="fa-solid fa-plus"></i> إضافة سطر</button>
        </form>
      </section>
      <div class="p6a-grid">
        <section class="p6a-card wide">
          <h4>سطور كشف الحساب</h4>
          <div class="p6a-table-wrap"><table class="p6a-table"><thead><tr><th>تاريخ/مرجع</th><th>الوصف</th><th>المبلغ</th><th>الحالة</th><th>مطابقة</th></tr></thead><tbody>${lineRows || '<tr><td colspan="5"><div class="p6a-empty">لا توجد سطور كشف بعد.</div></td></tr>'}</tbody></table></div>
        </section>
        <section class="p6a-card">
          <h4>ملخص المطابقة</h4>
          <div class="p6a-warning-list">
            <div class="p6a-warning-item">غير مطابق من الكشف: ${summary.unmatchedLines}</div>
            <div class="p6a-warning-item">حركات نظام غير مطابقة: ${summary.unmatchedMovements}</div>
            <div class="p6a-warning-item">الفرق: ${fmt(summary.difference)} د.ع</div>
          </div>
          <div class="p6a-actions" style="margin-top:12px">
            <button class="p6a-btn primary" onclick="p6aCreateBankAdjustmentRequest()" ${Math.abs(summary.difference) <= 0.01 ? 'disabled' : ''}>طلب تسوية/مراجعة</button>
          </div>
        </section>
        <section class="p6a-card full">
          <h4>حركات النظام المرشحة</h4>
          <div class="p6a-table-wrap"><table class="p6a-table"><thead><tr><th>تاريخ/مرجع</th><th>الوصف</th><th>المبلغ</th></tr></thead><tbody>${unmatchedMovements || '<tr><td colspan="3"><div class="p6a-empty">لا توجد حركات مالية مرشحة حالياً.</div></td></tr>'}</tbody></table></div>
        </section>
      </div>
    </div>`);
  }

  function materials() {
    return Array.isArray(O().materials) ? O().materials : [];
  }

  function locationName(id) {
    const loc = ensureLocations().storageLocations.find(row => row.id === id);
    return loc ? (loc.nameAr || loc.nameEn || loc.code || loc.id) : (id || '-');
  }

  function materialName(id) {
    return materials().find(row => row.id === id)?.name || id || '-';
  }

  function stockRowsForDisplay() {
    const omni = ensureLocations();
    const actual = omni.locationStock || [];
    const rows = actual.slice();
    materials().forEach(mat => {
      if (!rows.some(row => row.materialId === mat.id)) {
        rows.push({
          id: 'virtual_' + mat.id,
          materialId: mat.id,
          locationId: 'MAIN_STOCK',
          qty: money(mat.stock),
          reservedQty: money(mat.reservedQty || mat.reserved),
          unit: mat.unit || '',
          virtual: true
        });
      }
    });
    return rows;
  }

  function ensureDefaultStock(materialId) {
    const omni = ensureLocations();
    const mat = materials().find(row => row.id === materialId);
    if (!mat) return null;
    let row = omni.locationStock.find(item => item.materialId === materialId && item.locationId === 'MAIN_STOCK');
    if (!row && !omni.locationStock.some(item => item.materialId === materialId)) {
      row = {
        id: uid('lstock'),
        materialId,
        locationId: 'MAIN_STOCK',
        qty: money(mat.stock),
        reservedQty: money(mat.reservedQty || mat.reserved),
        unit: mat.unit || '',
        companyId: activeCompanyId(),
        createdAt: now(),
        source: 'virtual_default_material_stock'
      };
      omni.locationStock.push(row);
    }
    return row;
  }

  function stockRow(materialId, locationId) {
    const omni = ensureLocations();
    let row = omni.locationStock.find(item => item.materialId === materialId && item.locationId === locationId);
    if (!row) {
      row = {
        id: uid('lstock'),
        materialId,
        locationId,
        qty: 0,
        reservedQty: 0,
        unit: materials().find(mat => mat.id === materialId)?.unit || '',
        companyId: activeCompanyId(),
        createdAt: now()
      };
      omni.locationStock.push(row);
    }
    return row;
  }

  function logLocationMovement(payload) {
    const omni = ensureLocations();
    omni.locationMovements.unshift({
      id: uid('lmove'),
      companyId: activeCompanyId(),
      createdAt: now(),
      createdBy: actor().id,
      ...payload
    });
  }

  root.p6aMoveLocationStock = function () {
    const form = document.getElementById('p6aLocationMoveForm');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const qty = Math.abs(money(data.qty));
    if (!data.materialId || !data.toLocationId || !qty) {
      toast('اختر المادة والموقع والكمية.', 'warning');
      return;
    }
    ensureDefaultStock(data.materialId);
    const action = data.action || 'transfer';
    const actionKey = {
      transfer: 'inventory.location.transfer',
      receive: 'inventory.location.receive',
      issue: 'inventory.location.issue',
      adjust: 'inventory.location.adjust'
    }[action] || 'inventory.location.transfer';
    const fromId = data.fromLocationId || 'MAIN_STOCK';
    const toId = data.toLocationId || 'MAIN_STOCK';
    if (action === 'transfer' && fromId === toId) {
      toast('اختر موقعين مختلفين للتحويل.', 'warning');
      return;
    }
    const from = stockRow(data.materialId, fromId);
    const to = stockRow(data.materialId, toId);
    if (['transfer', 'issue'].includes(action) && money(from.qty) < qty) {
      const blockedKey = action === 'issue' ? 'inventory.location.negative_issue' : actionKey;
      auditAction(blockedKey, 'blocked', { page: 'inventory', entityType: 'location_movement', targetId: data.materialId, before: { fromQty: money(from.qty) }, after: { requestedQty: qty }, reason: 'insufficient_source_stock', riskLevel: action === 'issue' ? 'critical' : 'medium' });
      toast('رصيد الموقع المصدر لا يكفي.', 'warning');
      return;
    }
    const guardContext = { page: 'inventory', entityType: 'location_movement', targetId: data.materialId, before: { fromQty: from.qty, toQty: to.qty }, after: { action, qty: action === 'adjust' ? money(data.qty) : qty, fromId, toId }, payload: { materialId: data.materialId, note: data.note || '' }, requestType: 'inventory_review' };
    if (!guardAction(actionKey, guardContext, action === 'adjust' ? { approval: true, title: 'طلب موافقة على تسوية مخزون موقعية: ' + materialName(data.materialId), description: 'تسوية كمية موقعية تحتاج اعتماد مدير قبل التنفيذ.', priority: 'high' } : null)) return;
    if (action === 'transfer') {
      from.qty = money(from.qty) - qty;
      to.qty = money(to.qty) + qty;
    } else if (action === 'receive') {
      to.qty = money(to.qty) + qty;
    } else if (action === 'issue') {
      from.qty = money(from.qty) - qty;
    } else if (action === 'adjust') {
      to.qty = money(to.qty) + money(data.qty);
    }
    logLocationMovement({
      type: action,
      materialId: data.materialId,
      fromLocationId: ['transfer', 'issue'].includes(action) ? fromId : '',
      toLocationId: ['transfer', 'receive', 'adjust'].includes(action) ? toId : '',
      qty: action === 'adjust' ? money(data.qty) : qty,
      note: data.note || '',
      requiresReview: action === 'adjust'
    });
    save();
    toast('تم حفظ حركة الموقع دون تعديل إجمالي المادة القديم.', 'success');
    renderInventory();
  };

  function renderInventory() {
    const body = document.getElementById('inventoryBody');
    if (!body || document.getElementById('p6aStorageLocations')) return;
    const omni = ensureLocations();
    const locationOptions = omni.storageLocations.map(loc => `<option value="${esc(loc.id)}">${esc(loc.nameAr || loc.nameEn || loc.id)}</option>`).join('');
    const materialOptions = materials().map(mat => `<option value="${esc(mat.id)}">${esc(mat.name)} (${fmt(mat.stock)} ${esc(mat.unit || '')})</option>`).join('');
    const stockRows = stockRowsForDisplay();
    const stockHtml = stockRows.map(row => {
      const mat = materials().find(item => item.id === row.materialId) || {};
      const low = money(row.qty) <= money(mat.minimum);
      return `<tr>
        <td><strong>${esc(materialName(row.materialId))}</strong><span class="p6a-muted">${row.virtual ? 'إجمالي المواد' : 'طبقة المواقع'}</span></td>
        <td>${esc(locationName(row.locationId))}<br><span class="p6a-code">${esc(row.locationId)}</span></td>
        <td>${fmt(row.qty)} ${esc(row.unit || mat.unit || '')}</td>
        <td>${fmt(row.reservedQty || 0)}</td>
        <td>${low ? '<span class="p6a-chip warn">منخفض</span>' : '<span class="p6a-chip ok">كاف</span>'}</td>
      </tr>`;
    }).join('');
    const movementRows = (omni.locationMovements || []).slice(0, 12).map(move => `<tr>
      <td><strong>${esc(move.type)}</strong><span class="p6a-muted">${esc((move.createdAt || '').slice(0, 19).replace('T', ' '))}</span></td>
      <td>${esc(materialName(move.materialId))}</td>
      <td>${esc(locationName(move.fromLocationId))} → ${esc(locationName(move.toLocationId))}</td>
      <td>${fmt(move.qty)}</td>
      <td>${move.requiresReview ? '<span class="p6a-chip warn">مراجعة</span>' : '<span class="p6a-chip ok">مسجل</span>'}</td>
    </tr>`).join('');
    const locTree = omni.storageLocations.map(loc => `<div class="p6a-tree-row">
      <div><strong>${esc(loc.nameAr || loc.nameEn || loc.id)}</strong><br><span class="p6a-code">${esc(loc.code || loc.id)}</span> <span class="p6a-muted">${esc(loc.barcode || '')}</span></div>
      <span class="p6a-chip">${esc(({stock:'مخزن',virtual:'افتراضي',input:'استلام',output:'صرف',transit:'عبور'})[loc.type] || loc.type || 'مخزن')}</span>
    </div>`).join('');
    body.insertAdjacentHTML('beforeend', `<div class="p6a-shell" id="p6aStorageLocations">
      <section class="p6a-panel">
        <div class="p6a-head">
          <div>
            <h3><i class="fa-solid fa-warehouse"></i> مواقع التخزين</h3>
            <p>طبقة موقعية غير مدمرة. إجمالي المادة القديم يبقى مصدر الحقيقة حتى المصالحة الكاملة.</p>
          </div>
          <div class="p6a-chip-row">${(omni.warehouses||[]).map(w=>`<span class="p6a-chip ok">${esc(w.nameAr||w.nameEn||w.id)}</span>`).join('')}<span class="p6a-chip">${stockRows.length} أرصدة</span></div>
        </div>
        <form id="p6aLocationMoveForm" class="p6a-form-grid" onsubmit="event.preventDefault(); p6aMoveLocationStock();">
          <label>الإجراء<select name="action" class="p6a-input"><option value="transfer">تحويل</option><option value="receive">استلام</option><option value="issue">صرف</option><option value="adjust">تسوية مراجعة</option></select></label>
          <label>المادة<select name="materialId" class="p6a-input">${materialOptions}</select></label>
          <label>من موقع<select name="fromLocationId" class="p6a-input">${locationOptions}</select></label>
          <label>إلى موقع<select name="toLocationId" class="p6a-input">${locationOptions}</select></label>
          <label>الكمية<input name="qty" class="p6a-input" type="number" step="0.01"></label>
          <label>ملاحظة<input name="note" class="p6a-input" placeholder="اختياري"></label>
          <button class="p6a-btn primary" type="submit"><i class="fa-solid fa-right-left"></i> تسجيل الحركة</button>
        </form>
      </section>
      <div class="p6a-grid">
        <section class="p6a-card"><h4>المستودعات والمواقع</h4>${locTree}</section>
        <section class="p6a-card wide"><h4>رصيد المواد حسب الموقع</h4><div class="p6a-table-wrap"><table class="p6a-table"><thead><tr><th>المادة</th><th>الموقع</th><th>الكمية</th><th>محجوز</th><th>الحالة</th></tr></thead><tbody>${stockHtml}</tbody></table></div></section>
        <section class="p6a-card full"><h4>سجل حركات المواقع</h4><div class="p6a-table-wrap"><table class="p6a-table"><thead><tr><th>النوع/الوقت</th><th>المادة</th><th>المسار</th><th>الكمية</th><th>الحالة</th></tr></thead><tbody>${movementRows || '<tr><td colspan="5"><div class="p6a-empty">لا توجد حركات موقعية بعد.</div></td></tr>'}</tbody></table></div></section>
      </div>
    </div>`);
  }

  function accountUsage(account) {
    const id = String(account.id || '');
    const code = String(account.code || '');
    let count = 0;
    const db = root.PentagonDB?.getCached?.() || {};
    const moves = []
      .concat(Array.isArray(db.account_moves) ? db.account_moves : [])
      .concat(Array.isArray(root.account_moves) ? root.account_moves : []);
    moves.forEach(move => (move.lines || move.line_ids || []).forEach(line => {
      if ([line.account_id, line.accountId, line.accountCode].map(String).includes(id) || [line.account_id, line.accountId, line.accountCode].map(String).includes(code)) count++;
    }));
    (F().transactions || []).forEach(tx => {
      if ([tx.accountId, tx.account_id, tx.accountCode].map(String).includes(id) || [tx.accountId, tx.account_id, tx.accountCode].map(String).includes(code)) count++;
    });
    return count;
  }

  function accountWarnings(accounts) {
    const warnings = [];
    const seen = new Set();
    accounts.forEach(acc => {
      const code = String(acc.code || '').trim();
      if (!code) warnings.push('حساب بدون code: ' + accountLabel(acc));
      if (code && seen.has(code)) warnings.push('كود حساب مكرر: ' + code);
      seen.add(code);
      if (!(acc.type || acc.accountType)) warnings.push('نوع حساب مفقود: ' + accountLabel(acc));
      if (acc.parentId && !accounts.some(parent => String(parent.id || parent.code) === String(acc.parentId))) warnings.push('حساب أب غير صالح: ' + accountLabel(acc));
      if (acc.is_active === false && accountUsage(acc) > 0) warnings.push('حساب غير فعال مستخدم في قيود: ' + accountLabel(acc));
    });
    return warnings;
  }

  root.p6aAddAccount = function () {
    if (!canAdminAccounting() || !guardAction('accounting.coa.create', { page: 'admin_panel', entityType: 'finance_account', targetId: 'new' })) {
      toast('هذه العملية تحتاج صلاحية Admin Panel.', 'warning');
      return;
    }
    const form = document.getElementById('p6aAccountForm');
    if (!form) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const accounts = financeAccounts();
    const code = String(data.code || '').trim();
    if (!code || !data.type || !data.nameAr) {
      toast('أدخل الكود والاسم العربي والنوع.', 'warning');
      return;
    }
    if (accounts.some(acc => String(acc.code) === code)) {
      auditAction('accounting.coa.create', 'blocked', { page: 'admin_panel', entityType: 'finance_account', targetId: code, after: { code, type: data.type } });
      toast('كود الحساب موجود مسبقاً.', 'warning');
      return;
    }
    if (data.parentId && !accounts.some(acc => String(acc.id || acc.code) === String(data.parentId))) {
      auditAction('accounting.coa.create', 'blocked', { page: 'admin_panel', entityType: 'finance_account', targetId: code, after: { parentId: data.parentId } });
      toast('الحساب الأب غير صالح.', 'warning');
      return;
    }
    accounts.push({
      id: uid('acct'),
      code,
      nameAr: data.nameAr,
      nameEn: data.nameEn || '',
      name: data.nameAr,
      type: data.type,
      parentId: data.parentId || '',
      is_active: true,
      balancePreview: 0,
      companyId: activeCompanyId(),
      createdAt: now(),
      createdBy: actor().id,
      source: 'phase6a_admin_chart'
    });
    save();
    toast('تم إنشاء حساب جديد غير مستخدم دون تعديل أي قيود منشورة.', 'success');
    renderAdminChart();
  };

  function renderAdminChart() {
    const body = document.querySelector('#adminPanelBody .admin-tab-body') || document.getElementById('adminPanelBody');
    if (!body || document.getElementById('p6aChartAccounts')) return;
    const accounts = financeAccounts().slice().sort((a, b) => String(a.code || '').localeCompare(String(b.code || ''), undefined, { numeric: true }));
    const warnings = accountWarnings(accounts);
    const parentOptions = '<option value="">بدون أب</option>' + accounts.map(acc => `<option value="${esc(acc.id || acc.code)}">${esc(accountLabel(acc))}</option>`).join('');
    const typeAr = {'asset':'أصول','liability':'التزامات','equity':'حقوق ملكية','income':'إيرادات','expense':'مصروفات'};
    const rows = accounts.map(acc => {
      const usage = accountUsage(acc);
      const locked = usage > 0;
      const rawType = acc.type || acc.accountType || '';
      const parentAcc = accounts.find(a => a.id === acc.parentId || a.code === acc.parentId);
      return `<tr>
        <td><strong>${esc(acc.code || '')}</strong></td>
        <td><strong>${esc(acc.nameAr || acc.name || '')}</strong><span class="p6a-muted">${esc(acc.nameEn || acc.englishName || '')}</span></td>
        <td>${esc(typeAr[rawType] || rawType || '-')}</td>
        <td>${parentAcc ? esc(parentAcc.nameAr || parentAcc.name || parentAcc.code || '-') : '-'}</td>
        <td>${usage}</td>
        <td>${fmt(acc.balancePreview || acc.balance || 0)}</td>
        <td>${locked ? '<span class="p6a-chip warn">مستخدم/محمي</span>' : '<span class="p6a-chip ok">آمن للإعداد</span>'}</td>
      </tr>`;
    }).join('');
    body.insertAdjacentHTML('beforeend', `<div class="p6a-shell" id="p6aChartAccounts">
      <section class="p6a-panel">
        <div class="p6a-head">
          <div>
            <h3><i class="fa-solid fa-sitemap"></i> شجرة الحسابات</h3>
            <p>واجهة إدارة آمنة داخل لوحة الإعدادات: تعرض وتحذر وتضيف حساباً جديداً فقط. لا تحذف ولا تغيّر قيوداً منشورة ولا تعدّل صفحة المالية.</p>
          </div>
          <div class="p6a-chip-row"><span class="p6a-chip">${accounts.length} حساب</span><span class="p6a-chip ${warnings.length ? 'warn' : 'ok'}">${warnings.length} تحذير</span></div>
        </div>
        <form id="p6aAccountForm" class="p6a-form-grid" onsubmit="event.preventDefault(); p6aAddAccount();">
          <label>كود الحساب<input name="code" class="p6a-input" placeholder="مثال 10105"></label>
          <label>الاسم العربي<input name="nameAr" class="p6a-input" placeholder="اسم الحساب"></label>
          <label>الاسم بالإنجليزية<input name="nameEn" class="p6a-input" placeholder="اختياري"></label>
          <label>النوع<select name="type" class="p6a-input"><option value="">اختر</option><option value="asset">أصول</option><option value="liability">التزامات</option><option value="equity">حقوق ملكية</option><option value="income">إيرادات</option><option value="expense">مصروفات</option></select></label>
          <label>الحساب الأب<select name="parentId" class="p6a-input">${parentOptions}</select></label>
          <button class="p6a-btn primary" type="submit" ${canAdminAccounting() ? '' : 'disabled'}><i class="fa-solid fa-plus"></i> إضافة حساب آمن</button>
        </form>
      </section>
      <div class="p6a-grid">
        <section class="p6a-card full"><h4>الحسابات الحالية</h4><div class="p6a-table-wrap"><table class="p6a-table"><thead><tr><th>الكود</th><th>الاسم</th><th>النوع</th><th>الأب</th><th>استخدام</th><th>رصيد قراءة</th><th>الحماية</th></tr></thead><tbody>${rows || '<tr><td colspan="7"><div class="p6a-empty">لا توجد حسابات بعد.</div></td></tr>'}</tbody></table></div></section>
        <section class="p6a-card full"><h4>تحذيرات التحقق</h4><div class="p6a-warning-list">${warnings.map(w => `<div class="p6a-warning-item">${esc(w)}</div>`).join('') || '<div class="p6a-empty">لا توجد تحذيرات حالية.</div>'}</div></section>
      </div>
    </div>`);
  }

  function enhance(page) {
    setTimeout(() => {
      if (page === 'banking' && !document.getElementById('p6aBankRecon')) renderBanking();
      if (page === 'inventory') renderInventory();
      if (page === 'admin_panel') renderAdminChart();
    }, 160);
  }

  function activePageFromDom() {
    const activeBtn = document.querySelector('.nav-btn.active[data-page], .nav-btn.current[data-page], [data-page].active');
    if (activeBtn) return activeBtn.getAttribute('data-page');
    const visible = Array.from(document.querySelectorAll('.page[id]')).find(page => {
      const style = root.getComputedStyle(page);
      return style.display !== 'none' && page.className.includes('page-active');
    });
    if (!visible) return '';
    return visible.id.replace(/^page/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
  }

  root.Phase6ACore = {
    ensureBanking,
    ensureLocations,
    reconciliationSummary,
    accountWarnings,
    enhance
  };

  // Keep the older Enterprise Suite reconciliation preview from posting finance
  // metadata directly; Phase 6A uses omni.banking metadata + Command Center review.
  root.entConfirmReconciliation = function () {
    guardAction('banking.reconciliation.finalize', { page: 'banking', entityType: 'bank_reconciliation', targetId: 'legacy_enterprise_suite', reason: 'legacy_direct_finalize_blocked' }, { forceApproval: true, title: 'طلب اعتماد تسوية بنكية', description: 'اعتماد التسوية البنكية يحتاج مدير ولا ينفذ مباشرة.', priority: 'high' });
    toast('تم إيقاف اعتماد التسوية المباشر. استخدم لوحة Phase 6A وطلب التسوية عبر مركز القيادة.', 'warning');
  };

  root.entCreateFromBankLine = function () {
    toast('تسجيل حركة مالية من كشف البنك يحتاج طلب مراجعة في مركز القيادة ولا يتم إنشاؤه مباشرة.', 'warning');
    requestApproval('banking.reconciliation.legacy_finance_movement', { page: 'banking', entityType: 'bank_statement_line', targetId: 'legacy_enterprise_suite', requestType: 'finance_review', riskLevel: 'critical', reason: 'legacy_direct_finance_post_blocked', payload: { requestedAt: now() } }, 'مراجعة سطر كشف بنكي غير مطابق', 'طلب إنشاء/تصنيف حركة مالية من كشف البنك. Phase 6C لا ينشئ قيوداً مباشرة.', 'high');
    save();
  };

  const originalSwitchPage = root.switchPage;
  if (typeof originalSwitchPage === 'function' && !originalSwitchPage.__phase6aWrapped) {
    const wrapped = function (page, ...args) {
      const result = originalSwitchPage.apply(this, [page, ...args]);
      enhance(page);
      return result;
    };
    wrapped.__phase6aWrapped = true;
    root.switchPage = wrapped;
  }

  document.addEventListener('DOMContentLoaded', () => {
    const current = root.currentPage || activePageFromDom();
    enhance(current);
  });

  document.addEventListener('click', event => {
    const nav = event.target?.closest?.('[data-page]');
    if (!nav) return;
    enhance(nav.getAttribute('data-page'));
  }, true);

  setInterval(() => {
    const page = activePageFromDom();
    if (page === 'banking' && !document.getElementById('p6aBankRecon')) enhance(page);
    if (page === 'inventory' && !document.getElementById('p6aStorageLocations')) enhance(page);
    if (page === 'admin_panel' && !document.getElementById('p6aChartAccounts')) enhance(page);
  }, 1200);
})();
