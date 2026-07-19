(function () {
  'use strict';

  function O() { try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {} if (!window.omni) window.omni = {}; return window.omni; }
  function save() { if (window.saveData) window.saveData(); }
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); }
  function uid(p) { return (p || 'sc') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
  function money(n) { return Math.round(Number(n) || 0); }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function nowISO() { return new Date().toISOString(); }

  var activeTab = 'rules';
  var _wired = false;

  function ensureData() {
    var o = O();
    if (!o.salesCommission) o.salesCommission = {};
    var sc = o.salesCommission;
    if (!Array.isArray(sc.rules)) sc.rules = [];
    if (!Array.isArray(sc.accruals)) sc.accruals = [];
    if (!Array.isArray(sc.payouts)) sc.payouts = [];
    if (!Array.isArray(sc.targets)) sc.targets = [];
    if (!sc.settings) sc.settings = { defaultRate: 5, autoCalculate: false };
    sc.rules.forEach(function (r) {
      if (!r.id) r.id = uid('rule');
      if (!r.createdAt) r.createdAt = nowISO();
    });
    sc.accruals.forEach(function (a) {
      if (!a.id) a.id = uid('accr');
      if (!a.createdAt) a.createdAt = nowISO();
    });
    sc.payouts.forEach(function (p) {
      if (!p.id) p.id = uid('pout');
      if (!p.createdAt) p.createdAt = nowISO();
    });
    return sc;
  }

  function SC() { return ensureData(); }

  function getSalesCrm() { return O().salesCrm || {}; }

  function getCustomers() {
    var f = O().finance;
    return f && f.customers ? f.customers : [];
  }

  function getEmployees() {
    var o = O();
    return o.employees || o.people || [];
  }

  function ruleMatches(r, order) {
    var total = Number(order.total) || 0;
    if (r.minAmount && total < r.minAmount) return false;
    if (r.maxAmount && total > r.maxAmount) return false;
    return true;
  }

  function calculateCommissionForOrder(order, rules) {
    var total = Number(order.total) || 0;
    var results = [];
    rules.forEach(function (r) {
      if (!r.active) return;
      if (!ruleMatches(r, order)) return;
      var rate = Number(r.rate) || 0;
      var amount = 0;
      if (r.type === 'percent') {
        if (r.isMargin && order.totalCost && order.total) {
          var margin = order.total - order.totalCost;
          amount = margin * (rate / 100);
        } else {
          amount = total * (rate / 100);
        }
      } else if (r.type === 'fixed') {
        amount = rate;
      }
      if (amount <= 0) return;
      var salespersonId = order.salespersonId || r.salespersonId || '';
      results.push({
        ruleId: r.id,
        ruleName: r.name,
        orderId: order.id,
        orderRef: order.reference || '',
        customerName: order.customerName || '',
        salespersonId: salespersonId,
        total: total,
        rate: rate,
        type: r.type,
        commissionAmount: money(amount),
        status: 'pending',
        createdAt: nowISO()
      });
    });
    return results;
  }

  function getPendingAccruals() {
    return SC().accruals.filter(function (a) { return a.status === 'pending'; });
  }

  function getApprovedAccruals() {
    return SC().accruals.filter(function (a) { return a.status === 'approved'; });
  }

  function getPaidAccruals() {
    return SC().accruals.filter(function (a) { return a.status === 'paid'; });
  }

  function kpis() {
    var sc = SC();
    var totalPending = 0;
    var totalApproved = 0;
    var totalPaid = 0;
    var pendingCount = 0;
    sc.accruals.forEach(function (a) {
      if (a.status === 'pending') { totalPending += a.commissionAmount; pendingCount++; }
      if (a.status === 'approved') { totalApproved += a.commissionAmount; }
      if (a.status === 'paid') { totalPaid += a.commissionAmount; }
    });
    var targetCount = sc.targets.length;
    var targetAchieved = 0;
    sc.targets.forEach(function (t) {
      if (t.targetAmount > 0 && (t.achievedAmount || 0) >= t.targetAmount) targetAchieved++;
    });
    return { totalPending: money(totalPending), totalApproved: money(totalApproved), totalPaid: money(totalPaid), pendingCount: pendingCount, rulesCount: sc.rules.length, targetCount: targetCount, targetAchieved: targetAchieved };
  }

  function kpiStrip() {
    var k = kpis();
    return '<div class="sc-kpi-strip">' +
      '<div class="sc-kpi-card"><div class="sc-kpi-value">' + fmt(k.totalPending) + '</div><div class="sc-kpi-label">مستحق معلق</div></div>' +
      '<div class="sc-kpi-card"><div class="sc-kpi-value">' + fmt(k.totalApproved) + '</div><div class="sc-kpi-label">معتمد</div></div>' +
      '<div class="sc-kpi-card"><div class="sc-kpi-value">' + fmt(k.totalPaid) + '</div><div class="sc-kpi-label">مدفوع</div></div>' +
      '<div class="sc-kpi-card"><div class="sc-kpi-value">' + k.pendingCount + '</div><div class="sc-kpi-label">استحقاق معلق</div></div>' +
      '<div class="sc-kpi-card"><div class="sc-kpi-value">' + k.targetAchieved + '/' + k.targetCount + '</div><div class="sc-kpi-label">أهداف محققة</div></div>' +
      '</div>';
  }

  function toolbar() {
    var tabs = [
      { id: 'rules', label: 'قواعد العمولات' },
      { id: 'accruals', label: 'الاستحقاقات' },
      { id: 'targets', label: 'الأهداف' },
      { id: 'payouts', label: 'الصرف' },
      { id: 'settings', label: 'الإعدادات' }
    ];
    return '<div class="sc-toolbar">' +
      tabs.map(function (t) { return '<button class="' + (activeTab === t.id ? 'active' : '') + '" onclick="scSetView(\'' + t.id + '\')">' + t.label + '</button>'; }).join('') +
      '</div>';
  }

  function rulesView() {
    var sc = SC();
    var html = '<div class="sc-inline-form" style="margin-bottom:1rem">';
    html += '<div class="sc-form-group"><label>اسم القاعدة</label><input id="scRuleName" placeholder="مثال: عمولة المبيعات"></div>';
    html += '<div class="sc-form-group"><label>النوع</label><select id="scRuleType"><option value="percent">نسبة مئوية</option><option value="fixed">مبلغ ثابت</option></select></div>';
    html += '<div class="sc-form-group"><label>النسبة/المبلغ</label><input id="scRuleRate" type="number" step="0.01" value="5"></div>';
    html += '<div class="sc-form-group"><label>الحد الأدنى</label><input id="scRuleMin" type="number" placeholder="0"></div>';
    html += '<div class="sc-form-group"><label>الحد الأعلى</label><input id="scRuleMax" type="number" placeholder="0"></div>';
    html += '<div class="sc-form-group" style="display:flex;align-items:flex-end;gap:0.5rem">';
    html += '<label><input type="checkbox" id="scRuleMargin"> على هامش الربح</label>';
    html += '</div>';
    html += '<button class="sc-btn sc-btn-primary" onclick="scAddRule()">➕ إضافة</button>';
    html += '</div>';

    if (sc.rules.length === 0) {
      html += '<div class="sc-empty">لا توجد قواعد عمولات. أضف قاعدة جديدة.</div>';
      return html;
    }
    html += '<table class="sc-table"><thead><tr><th>القاعدة</th><th>النوع</th><th>النسبة/المبلغ</th><th>الحدود</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>';
    sc.rules.forEach(function (r) {
      var detail = r.type === 'percent' ? fmt(r.rate) + '%' + (r.isMargin ? ' (هامش ربح)' : '') : fmt(r.rate) + ' د.ع';
      var limits = (r.minAmount ? 'من ' + fmt(r.minAmount) : '') + (r.maxAmount ? ' حتى ' + fmt(r.maxAmount) : '') || 'بدون حدود';
      html += '<tr>' +
        '<td><strong>' + esc(r.name) + '</strong></td>' +
        '<td>' + (r.type === 'percent' ? 'نسبة مئوية' : 'مبلغ ثابت') + '</td>' +
        '<td>' + detail + '</td>' +
        '<td>' + limits + '</td>' +
        '<td><span class="sc-badge ' + (r.active ? 'sc-badge-active' : 'sc-badge-inactive') + '">' + (r.active ? 'نشطة' : 'موقفة') + '</span></td>' +
        '<td><button class="sc-btn sc-btn-sm ' + (r.active ? 'sc-btn-danger' : 'sc-btn-success') + '" onclick="scToggleRule(\'' + r.id + '\')">' + (r.active ? 'إيقاف' : 'تفعيل') + '</button> ' +
        '<button class="sc-btn sc-btn-sm sc-btn-danger" onclick="scDeleteRule(\'' + r.id + '\')">حذف</button></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function accrualsView() {
    var sc = SC();
    var html = '<div style="margin-bottom:1rem;display:flex;gap:0.5rem;flex-wrap:wrap">';
    html += '<button class="sc-btn sc-btn-primary" onclick="scCalcPending()">🔢 احسب الاستحقاقات المعلقة</button>';
    html += '<button class="sc-btn sc-btn-success" onclick="scApproveSelected()">✅ اعتماد المحدد</button>';
    html += '<span style="color:#94a3b8;font-size:0.8rem;margin-right:1rem">حدد الاستحقاقات للموافقة الجماعية</span>';
    html += '</div>';

    if (sc.accruals.length === 0) {
      html += '<div class="sc-empty">لا توجد استحقاقات عمولات. اضغط "احسب الاستحقاقات المعلقة".</div>';
      return html;
    }

    html += '<table class="sc-table"><thead><tr>' +
      '<th style="width:30px"><input type="checkbox" id="scSelectAll" onchange="scToggleAll(this)"></th>' +
      '<th>المرجع</th><th>العميل</th><th>المندوب</th><th>إجمالي الطلب</th><th>القاعدة</th><th>العمولة</th><th>الحالة</th><th>التاريخ</th></tr></thead><tbody>';

    sc.accruals.forEach(function (a) {
      var statusClass = a.status === 'pending' ? 'sc-badge-pending' : a.status === 'approved' ? 'sc-badge-approved' : 'sc-badge-paid';
      var statusLabel = a.status === 'pending' ? 'معلق' : a.status === 'approved' ? 'معتمد' : 'مدفوع';
      html += '<tr>' +
        '<td>' + (a.status === 'pending' ? '<input type="checkbox" class="scAccrualCheck" value="' + a.id + '">' : '') + '</td>' +
        '<td>' + esc(a.orderRef) + '</td>' +
        '<td>' + esc(a.customerName) + '</td>' +
        '<td>' + esc(a.salespersonId) + '</td>' +
        '<td>' + fmt(a.total) + '</td>' +
        '<td>' + esc(a.ruleName) + '</td>' +
        '<td><strong>' + fmt(a.commissionAmount) + '</strong></td>' +
        '<td><span class="sc-badge ' + statusClass + '">' + statusLabel + '</span></td>' +
        '<td>' + (a.createdAt || '').slice(0, 10) + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function targetsView() {
    var sc = SC();
    var html = '<div class="sc-inline-form" style="margin-bottom:1rem">';
    html += '<div class="sc-form-group"><label>المندوب/القسم</label><input id="scTgtAssignee" placeholder="اسم المندوب أو القسم"></div>';
    html += '<div class="sc-form-group"><label>الفترة</label><select id="scTgtPeriod"><option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option><option value="yearly">سنوي</option></select></div>';
    html += '<div class="sc-form-group"><label>المبلغ المستهدف</label><input id="scTgtAmount" type="number" placeholder="0"></div>';
    html += '<div class="sc-form-group"><label>الشهر/السنة</label><input id="scTgtPeriodKey" placeholder="2026-06"></div>';
    html += '<button class="sc-btn sc-btn-primary" onclick="scAddTarget()">🎯 إضافة هدف</button>';
    html += '</div>';
    html += '<button class="sc-btn sc-btn-success" style="margin-bottom:1rem" onclick="scCalcAchievement()">📊 احسب الإنجاز</button>';

    if (sc.targets.length === 0) {
      html += '<div class="sc-empty">لا توجد أهداف مبيعات. أضف هدفاً جديداً.</div>';
      return html;
    }
    html += '<table class="sc-table"><thead><tr>' +
      '<th>المندوب</th><th>الفترة</th><th>المبلغ المستهدف</th><th>المحقق</th><th>النسبة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>';
    sc.targets.forEach(function (t) {
      var achieved = Number(t.achievedAmount) || 0;
      var pct = t.targetAmount > 0 ? Math.min(100, Math.round((achieved / t.targetAmount) * 100)) : 0;
      var status = achieved >= t.targetAmount ? '✅ محقق' : '🔄 قيد التنفيذ';
      var barColor = pct >= 100 ? '#16a34a' : pct >= 50 ? '#facc15' : '#ef4444';
      html += '<tr>' +
        '<td>' + esc(t.assignee || '') + '</td>' +
        '<td>' + esc(t.periodLabel || '') + '</td>' +
        '<td>' + fmt(t.targetAmount) + '</td>' +
        '<td>' + fmt(achieved) + '</td>' +
        '<td><div style="display:flex;align-items:center;gap:0.5rem"><div style="flex:1;height:8px;background:#1e293b;border-radius:4px;overflow:hidden"><div style="width:' + pct + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width 0.3s"></div></div><span style="font-size:0.75rem;color:#94a3b8;min-width:30px">' + pct + '%</span></div></td>' +
        '<td>' + status + '</td>' +
        '<td><button class="sc-btn sc-btn-sm sc-btn-danger" onclick="scDeleteTarget(\'' + t.id + '\')">حذف</button></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function payoutsView() {
    var sc = SC();
    var html = '<div class="sc-payout-form">';
    html += '<h3 style="margin:0 0 0.75rem;font-size:0.95rem">صرف عمولات جديدة</h3>';
    html += '<div class="sc-form-row">';
    html += '<div class="sc-form-group"><label>المندوب</label><select id="scPayoutSalesperson"><option value="">-- اختر --</option>';
    var employees = getEmployees();
    employees.forEach(function (e) {
      html += '<option value="' + esc(e.id || e.name) + '">' + esc(e.name || '') + '</option>';
    });
    html += '</select></div>';
    html += '<div class="sc-form-group"><label>المبلغ</label><input id="scPayoutAmount" type="number" placeholder="المبلغ الإجمالي"></div>';
    html += '</div>';
    html += '<div class="sc-form-group"><label>ملاحظات</label><textarea id="scPayoutNote" placeholder="ملاحظات الصرف"></textarea></div>';
    html += '<div class="sc-form-group"><label>اختر الاستحقاقات المعتمدة (اختياري)</label><select id="scPayoutAccruals" multiple>';
    getApprovedAccruals().forEach(function (a) {
      html += '<option value="' + a.id + '">' + esc(a.orderRef) + ' - ' + fmt(a.commissionAmount) + ' (' + esc(a.salespersonId) + ')</option>';
    });
    html += '</select></div>';
    html += '<button class="sc-btn sc-btn-success" onclick="scCreatePayout()">💰 صرف العمولات</button>';
    html += '</div>';

    if (sc.payouts.length === 0) {
      html += '<div class="sc-empty">لا توجد مدفوعات عمولات سابقة.</div>';
      return html;
    }
    html += '<table class="sc-table"><thead><tr><th>التاريخ</th><th>المندوب</th><th>المبلغ</th><th>الحالة</th><th>ملاحظات</th></tr></thead><tbody>';
    sc.payouts.forEach(function (p) {
      var statusClass = p.status === 'paid' ? 'sc-badge-paid' : 'sc-badge-pending';
      html += '<tr>' +
        '<td>' + (p.date || p.createdAt || '').slice(0, 10) + '</td>' +
        '<td>' + esc(p.salespersonId) + '</td>' +
        '<td><strong>' + fmt(p.totalAmount) + '</strong></td>' +
        '<td><span class="sc-badge ' + statusClass + '">' + (p.status === 'paid' ? 'مدفوع' : 'معلق') + '</span></td>' +
        '<td>' + esc(p.note || '') + '</td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function settingsView() {
    var s = SC().settings;
    var html = '<div style="max-width:500px">';
    html += '<div class="sc-form-group"><label>نسبة العمولة الافتراضية (%)</label><input id="scDefaultRate" type="number" step="0.1" value="' + (s.defaultRate || 5) + '"></div>';
    html += '<div class="sc-form-group"><label><input type="checkbox" id="scAutoCalc" ' + (s.autoCalculate ? 'checked' : '') + '> حساب العمولات تلقائياً عند فوترة الطلب</label></div>';
    html += '<button class="sc-btn sc-btn-primary" onclick="scSaveSettings()">💾 حفظ الإعدادات</button>';
    html += '</div>';
    return html;
  }

  function render() {
    ensureData();
    var container = document.getElementById('salesCommissionBody');
    if (!container) return;
    container.innerHTML = kpiStrip() + toolbar() + '<div class="sc-content" id="scTabContent">' + renderTabContent() + '</div>';
  }

  function renderTabContent() {
    switch (activeTab) {
      case 'rules': return rulesView();
      case 'accruals': return accrualsView();
      case 'targets': return targetsView();
      case 'payouts': return payoutsView();
      case 'settings': return settingsView();
      default: return rulesView();
    }
  }

  window.scSetView = function (tab) {
    activeTab = tab;
    render();
  };

  window.scAddRule = function () {
    var name = document.getElementById('scRuleName');
    var type = document.getElementById('scRuleType');
    var rate = document.getElementById('scRuleRate');
    var minAmt = document.getElementById('scRuleMin');
    var maxAmt = document.getElementById('scRuleMax');
    var margin = document.getElementById('scRuleMargin');
    if (!name || !name.value.trim()) { toast('الرجاء إدخال اسم القاعدة', 'error'); return; }
    var sc = SC();
    sc.rules.push({
      id: uid('rule'),
      name: name.value.trim(),
      type: type.value,
      rate: Number(rate.value) || 0,
      minAmount: Number(minAmt.value) || 0,
      maxAmount: Number(maxAmt.value) || 0,
      isMargin: margin ? margin.checked : false,
      active: true,
      createdAt: nowISO()
    });
    name.value = '';
    rate.value = '5';
    minAmt.value = '';
    maxAmt.value = '';
    save();
    toast('تمت إضافة القاعدة');
    render();
  };

  window.scToggleRule = function (id) {
    var sc = SC();
    var rule = sc.rules.find(function (r) { return r.id === id; });
    if (rule) { rule.active = !rule.active; save(); render(); }
  };

  window.scDeleteRule = function (id) {
    if (!confirm('حذف قاعدة العمولة؟')) return;
    SC().rules = SC().rules.filter(function (r) { return r.id !== id; });
    save();
    render();
  };

  window.scCalcPending = function () {
    var sc = SC();
    var crm = getSalesCrm();
    var orders = crm.salesOrders || [];
    var rules = sc.rules.filter(function (r) { return r.active; });
    if (rules.length === 0) { toast('لا توجد قواعد نشطة للعمولات', 'error'); return; }

    var invoicedOrders = orders.filter(function (o) {
      return o.status === 'invoiced' || o.status === 'delivered';
    });

    if (invoicedOrders.length === 0) { toast('لا توجد طلبات مفوترة أو مسلمة', 'info'); return; }

    var existingKeys = {};
    sc.accruals.forEach(function (a) { existingKeys[a.orderId + '_' + a.ruleId] = true; });

    var added = 0;
    invoicedOrders.forEach(function (order) {
      rules.forEach(function (rule) {
        if (existingKeys[order.id + '_' + rule.id]) return;
        if (!ruleMatches(rule, order)) return;
        var total = Number(order.total) || 0;
        var rate = Number(rule.rate) || 0;
        var amount = 0;
        if (rule.type === 'percent') {
          if (rule.isMargin && order.totalCost && order.total) {
            amount = (order.total - order.totalCost) * (rate / 100);
          } else {
            amount = total * (rate / 100);
          }
        } else {
          amount = rate;
        }
        if (amount <= 0) return;
        sc.accruals.push({
          id: uid('accr'),
          ruleId: rule.id,
          ruleName: rule.name,
          orderId: order.id,
          orderRef: order.reference || '',
          customerName: order.customerName || '',
          salespersonId: order.salespersonId || rule.salespersonId || '',
          total: total,
          rate: rate,
          type: rule.type,
          commissionAmount: money(amount),
          status: 'pending',
          createdAt: nowISO()
        });
        added++;
      });
    });

    save();
    toast('تم إضافة ' + added + ' استحقاق عمولة');
    render();
  };

  window.scToggleAll = function (el) {
    var checks = document.querySelectorAll('.scAccrualCheck');
    checks.forEach(function (c) { c.checked = el.checked; });
  };

  window.scApproveSelected = function () {
    var checks = document.querySelectorAll('.scAccrualCheck:checked');
    if (checks.length === 0) { toast('اختر استحقاقات للموافقة', 'error'); return; }
    var sc = SC();
    checks.forEach(function (c) {
      var accrual = sc.accruals.find(function (a) { return a.id === c.value; });
      if (accrual && accrual.status === 'pending') { accrual.status = 'approved'; }
    });
    save();
    toast('تم اعتماد ' + checks.length + ' استحقاق');
    render();
  };

  window.scCreatePayout = function () {
    var salespersonEl = document.getElementById('scPayoutSalesperson');
    var amountEl = document.getElementById('scPayoutAmount');
    var noteEl = document.getElementById('scPayoutNote');
    var accrualsEl = document.getElementById('scPayoutAccruals');

    var salesperson = salespersonEl ? salespersonEl.value : '';
    var amount = Number(amountEl ? amountEl.value : 0);
    if (!salesperson) { toast('اختر المندوب', 'error'); return; }
    if (amount <= 0) { toast('أدخل المبلغ', 'error'); return; }

    var sc = SC();
    var selectedAccrualIds = [];
    if (accrualsEl) {
      for (var i = 0; i < accrualsEl.options.length; i++) {
        if (accrualsEl.options[i].selected) selectedAccrualIds.push(accrualsEl.options[i].value);
      }
    }

    sc.payouts.push({
      id: uid('pout'),
      date: todayISO(),
      salespersonId: salesperson,
      totalAmount: money(amount),
      status: 'paid',
      note: noteEl ? noteEl.value : '',
      accrualIds: selectedAccrualIds,
      createdAt: nowISO()
    });

    selectedAccrualIds.forEach(function (aid) {
      var a = sc.accruals.find(function (x) { return x.id === aid; });
      if (a) a.status = 'paid';
    });

    save();
    toast('تم صرف العمولة');
    render();
  };

  window.scAddTarget = function () {
    var assigneeEl = document.getElementById('scTgtAssignee');
    var periodEl = document.getElementById('scTgtPeriod');
    var amountEl = document.getElementById('scTgtAmount');
    var periodKeyEl = document.getElementById('scTgtPeriodKey');
    if (!assigneeEl || !assigneeEl.value.trim()) { toast('أدخل اسم المندوب أو القسم', 'error'); return; }
    var amount = Number(amountEl ? amountEl.value : 0);
    if (amount <= 0) { toast('أدخل المبلغ المستهدف', 'error'); return; }
    var sc = SC();
    sc.targets.push({
      id: uid('tgt'),
      assignee: assigneeEl.value.trim(),
      period: periodEl.value,
      periodLabel: periodEl.options[periodEl.selectedIndex].text + ' ' + (periodKeyEl ? periodKeyEl.value : ''),
      periodKey: periodKeyEl ? periodKeyEl.value : todayISO().slice(0, 7),
      targetAmount: money(amount),
      achievedAmount: 0,
      createdAt: nowISO()
    });
    assigneeEl.value = '';
    amountEl.value = '';
    save();
    toast('تمت إضافة الهدف');
    render();
  };

  window.scDeleteTarget = function (id) {
    if (!confirm('حذف الهدف؟')) return;
    SC().targets = SC().targets.filter(function (t) { return t.id !== id; });
    save();
    render();
  };

  window.scCalcAchievement = function () {
    var sc = SC();
    var crm = getSalesCrm();
    var orders = crm.salesOrders || [];
    var achievedTotal = 0;
    orders.forEach(function (o) {
      var t = Number(o.total) || 0;
      if (o.status === 'invoiced' || o.status === 'delivered' || o.status === 'confirmed') {
        achievedTotal += t;
      }
    });
    sc.targets.forEach(function (t) {
      t.achievedAmount = Math.min(t.targetAmount, money(achievedTotal));
    });
    save();
    toast('تم حساب الإنجاز');
    render();
  };

  window.scSaveSettings = function () {
    var rateEl = document.getElementById('scDefaultRate');
    var autoEl = document.getElementById('scAutoCalc');
    var sc = SC();
    sc.settings.defaultRate = Number(rateEl ? rateEl.value : 5);
    sc.settings.autoCalculate = autoEl ? autoEl.checked : false;
    save();
    toast('تم حفظ الإعدادات');
  };

  function activatePage() {
    var pages = document.querySelectorAll('.page');
    pages.forEach(function (p) { p.classList.remove('page-active'); });
    var navs = document.querySelectorAll('.nav-btn');
    navs.forEach(function (n) { n.classList.remove('active'); });

    var page = document.getElementById('pageSalesCommission');
    if (page) page.classList.add('page-active');

    var nav = document.getElementById('navSalesCommission');
    if (nav) nav.classList.add('active');

    window.currentPage = 'sales_commission';
    render();
  }

  function wireSwitch() {
    if (_wired) return;
    if (typeof window.switchPage !== 'function') return;
    var orig = window.switchPage;
    if (orig.__scWired) return;
    window.switchPage = function (page) {
      if (page === 'sales_commission') {
        activatePage();
        return;
      }
      return orig.apply(this, arguments);
    };
    window.switchPage.__scWired = true;
    _wired = true;
  }

  function registerJarvis() {
    if (!window.JarvisBrain || !JarvisBrain.tools) return;
    JarvisBrain.tools['report_commission_summary'] = {
      risk: 'safe',
      desc_en: 'Report commission summary (pending, approved, paid).',
      desc_ar: 'تقرير ملخص العمولات (المعلقة والمعتمدة والمدفوعة).',
      params: {},
      run: function () {
        var k = kpis();
        return { ok: true, message: 'العمولات: ' + k.pendingCount + ' معلق بمبلغ ' + fmt(k.totalPending) + '، معتمد ' + fmt(k.totalApproved) + '، مدفوع ' + fmt(k.totalPaid) };
      }
    };
  }

  function init() {
    ensureData();
    wireSwitch();
    registerJarvis();
    var tries = 0;
    function retry() {
      if (tries > 40) return;
      tries++;
      wireSwitch();
      registerJarvis();
      if (!_wired) setTimeout(retry, 150);
    }
    setTimeout(retry, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.OctagonSalesCommission = {
    ensureData: ensureData,
    render: render,
    kpis: kpis,
    open: function () { window.switchPage('sales_commission'); }
  };
})();
