(function () {
  'use strict';

  function O() { try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {} if (!window.omni) window.omni = {}; return window.omni; }
  function save() { if (window.saveData) window.saveData(); }
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); }
  function uid(p) { return (p || 'fi') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
  function money(n) { return Math.round(Number(n) || 0); }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function nowISO() { return new Date().toISOString(); }

  var activeTab = 'plans';
  var _wired = false;

  function getFinance() {
    var o = O();
    if (!o.finance) o.finance = {};
    return o.finance;
  }

  function ensureData() {
    var f = getFinance();
    if (!Array.isArray(f.installmentPlans)) f.installmentPlans = [];
    f.installmentPlans.forEach(function (p) {
      if (!p.id) p.id = uid('plan');
      if (!Array.isArray(p.lines)) p.lines = [];
      if (!p.createdAt) p.createdAt = nowISO();
      if (!p.status) p.status = 'active';
      p.lines.forEach(function (l) {
        if (!l.id) l.id = uid('inst');
      });
    });
    return f.installmentPlans;
  }

  function PL() { return ensureData(); }

  function getCustomers() {
    var f = O().finance;
    return f && f.customers ? f.customers : [];
  }

  function kpis() {
    var plans = PL();
    var totalActive = 0;
    var totalDue = 0;
    var totalPaid = 0;
    var lateCount = 0;
    var today = todayISO();
    plans.forEach(function (p) {
      if (p.status === 'active') {
        totalActive += money(p.totalAmount);
      }
      p.lines.forEach(function (l) {
        totalPaid += money(l.paidAmount) || 0;
        if (l.status === 'pending' && l.dueDate < today) {
          lateCount++;
          totalDue += money(l.amount) - (money(l.paidAmount) || 0);
        }
      });
    });
    return { activePlans: plans.filter(function (p) { return p.status === 'active'; }).length, totalActive: money(totalActive), totalPaid: money(totalPaid), lateCount: lateCount, lateAmount: money(totalDue) };
  }

  function kpiStrip() {
    var k = kpis();
    return '<div class="fi-kpi-strip">' +
      '<div class="fi-kpi-card"><div class="fi-kpi-value">' + k.activePlans + '</div><div class="fi-kpi-label">خطط نشطة</div></div>' +
      '<div class="fi-kpi-card"><div class="fi-kpi-value">' + fmt(k.totalActive) + '</div><div class="fi-kpi-label">إجمالي مستحق</div></div>' +
      '<div class="fi-kpi-card"><div class="fi-kpi-value">' + fmt(k.totalPaid) + '</div><div class="fi-kpi-label">إجمالي مدفوع</div></div>' +
      '<div class="fi-kpi-card"><div class="fi-kpi-value" style="color:' + (k.lateCount > 0 ? '#ef4444' : '#16a34a') + '">' + k.lateCount + '</div><div class="fi-kpi-label">أقساط متأخرة</div></div>' +
      '<div class="fi-kpi-card"><div class="fi-kpi-value" style="color:#ef4444">' + fmt(k.lateAmount) + '</div><div class="fi-kpi-label">متأخرات</div></div>' +
      '</div>';
  }

  function toolbar() {
    var tabs = [
      { id: 'plans', label: 'الخطط' },
      { id: 'create', label: 'إنشاء خطة' },
      { id: 'late', label: 'المتأخرات' }
    ];
    return '<div class="fi-toolbar">' +
      tabs.map(function (t) { return '<button class="' + (activeTab === t.id ? 'active' : '') + '" onclick="fiSetView(\'' + t.id + '\')">' + t.label + '</button>'; }).join('') +
      '</div>';
  }

  function addDays(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function generateInstallmentLines(total, downPayment, count, frequency, startDate) {
    var lines = [];
    var remaining = total - downPayment;
    if (remaining <= 0 || count <= 0) return lines;
    var perInstallment = money(remaining / count);
    var remainder = remaining - (perInstallment * count);
    var dueDate = startDate ? new Date(startDate) : new Date();
    for (var i = 0; i < count; i++) {
      var amount = perInstallment + (i === count - 1 ? remainder : 0);
      if (frequency === 'monthly') dueDate.setMonth(dueDate.getMonth() + 1);
      else if (frequency === 'quarterly') dueDate.setMonth(dueDate.getMonth() + 3);
      else dueDate.setDate(dueDate.getDate() + 30);
      lines.push({ id: uid('inst'), dueDate: dueDate.toISOString().slice(0, 10), amount: money(amount), paidAmount: 0, status: 'pending', createdAt: nowISO() });
    }
    return lines;
  }

  function plansView() {
    var plans = PL();
    if (plans.length === 0) {
      return '<div class="fi-empty">لا توجد خطط تقسيط. أنشئ خطة جديدة.</div>';
    }
    var html = '';
    plans.forEach(function (p) {
      var totalPaid = 0;
      var totalPending = 0;
      p.lines.forEach(function (l) {
        totalPaid += money(l.paidAmount) || 0;
        if (l.status === 'pending') totalPending += money(l.amount) - (money(l.paidAmount) || 0);
      });
      var pct = p.totalAmount > 0 ? Math.round((totalPaid / p.totalAmount) * 100) : 0;
      var statusBadge = p.status === 'active' ? 'fi-badge-active' : p.status === 'completed' ? 'fi-badge-completed' : 'fi-badge-defaulted';
      var statusLabel = p.status === 'active' ? 'نشط' : p.status === 'completed' ? 'مكتمل' : 'متوقف';

      html += '<div class="fi-plan-card">';
      html += '<div class="fi-plan-header"><div><div class="fi-plan-ref">' + esc(p.reference || p.id) + '</div><div class="fi-plan-customer">' + esc(p.customerName || '') + '</div></div>';
      html += '<div><span class="fi-badge ' + statusBadge + '">' + statusLabel + '</span></div></div>';

      html += '<div class="fi-plan-summary">' +
        '<span>💵 الإجمالي: ' + fmt(p.totalAmount) + '</span>' +
        '<span>💳 دفعة أولى: ' + fmt(p.downPayment || 0) + '</span>' +
        '<span>📊 الأقساط: ' + (p.lines ? p.lines.length : 0) + '</span>' +
        '<span>✅ مدفوع: ' + fmt(totalPaid) + '</span>' +
        '</div>';

      html += '<div class="fi-progress"><div class="fi-progress-bar" style="width:' + pct + '%"></div></div>';

      html += '<table class="fi-table"><thead><tr><th>الاستحقاق</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>تاريخ الاستحقاق</th><th>إجراءات</th></tr></thead><tbody>';
      if (p.lines) {
        p.lines.forEach(function (l) {
          var remaining = money(l.amount) - (money(l.paidAmount) || 0);
          var today = todayISO();
          var isLate = l.status === 'pending' && l.dueDate < today;
          var lineStatusClass = l.status === 'paid' ? 'fi-badge-paid' : isLate ? 'fi-badge-late' : 'fi-badge-pending';
          var lineStatusLabel = l.status === 'paid' ? 'مدفوع' : isLate ? 'متأخر' : 'قيد الانتظار';
          html += '<tr>' +
            '<td>' + (l.dueDate || '') + '</td>' +
            '<td>' + fmt(l.amount) + '</td>' +
            '<td>' + fmt(l.paidAmount || 0) + '</td>' +
            '<td>' + fmt(remaining) + '</td>' +
            '<td><span class="fi-badge ' + lineStatusClass + '">' + lineStatusLabel + '</span></td>' +
            '<td>' + (l.dueDate || '') + '</td>' +
            '<td>' + (remaining > 0 && p.status === 'active' ? '<button class="fi-btn fi-btn-sm fi-btn-success" onclick="fiPayInstallment(\'' + p.id + '\',\'' + l.id + '\')">💰 تسديد</button>' : '') + '</td>' +
            '</tr>';
        });
      }
      html += '</tbody></table>';
      html += '<div style="margin-top:0.5rem;display:flex;gap:0.5rem">' +
        (p.status === 'active' ? '<button class="fi-btn fi-btn-sm fi-btn-success" onclick="fiCompletePlan(\'' + p.id + '\')">إكمال الخطة</button>' : '') +
        '<button class="fi-btn fi-btn-sm fi-btn-danger" onclick="fiDeletePlan(\'' + p.id + '\')">حذف</button>' +
        '</div>';
      html += '</div>';
    });
    return html;
  }

  function createView() {
    var c = getCustomers();
    var html = '<div style="max-width:600px">';
    html += '<div class="fi-form-group"><label>العميل</label><select id="fiPlanCustomer"><option value="">-- اختر عميل --</option>';
    c.forEach(function (cu) { html += '<option value="' + esc(cu.id) + '">' + esc(cu.name || cu.companyName || '') + '</option>'; });
    html += '</select></div>';
    html += '<div class="fi-form-row">';
    html += '<div class="fi-form-group"><label>المبلغ الإجمالي</label><input id="fiPlanTotal" type="number" placeholder="0"></div>';
    html += '<div class="fi-form-group"><label>الدفعة الأولى</label><input id="fiPlanDown" type="number" placeholder="0" value="0"></div>';
    html += '<div class="fi-form-group"><label>عدد الأقساط</label><input id="fiPlanCount" type="number" placeholder="6" value="6"></div>';
    html += '</div>';
    html += '<div class="fi-form-row">';
    html += '<div class="fi-form-group"><label>الدورية</label><select id="fiPlanFreq"><option value="monthly">شهري</option><option value="quarterly">ربع سنوي</option></select></div>';
    html += '<div class="fi-form-group"><label>تاريخ البداية</label><input id="fiPlanStart" type="date" value="' + todayISO() + '"></div>';
    html += '<div class="fi-form-group"><label>مرجع (اختياري)</label><input id="fiPlanRef" placeholder="فاتورة رقم..."></div>';
    html += '</div>';
    html += '<button class="fi-btn fi-btn-primary" onclick="fiCreatePlan()">💾 إنشاء خطة التقسيط</button>';
    html += '</div>';
    return html;
  }

  function lateView() {
    var plans = PL();
    var today = todayISO();
    var lateLines = [];
    plans.forEach(function (p) {
      if (p.status !== 'active') return;
      p.lines.forEach(function (l) {
        if (l.status === 'pending' && l.dueDate < today) {
          lateLines.push({ plan: p, line: l });
        }
      });
    });
    if (lateLines.length === 0) {
      return '<div class="fi-empty">🎉 لا توجد أقساط متأخرة. كل شيء على ما يرام.</div>';
    }
    var html = '<div style="margin-bottom:1rem"><strong>🔴 أقساط متأخرة: ' + lateLines.length + '</strong></div>';
    html += '<table class="fi-table"><thead><tr><th>العميل</th><th>المرجع</th><th>تاريخ الاستحقاق</th><th>المبلغ</th><th>المدفوع</th><th>المتبقي</th><th>تأخير (يوم)</th><th>إجراءات</th></tr></thead><tbody>';
    lateLines.forEach(function (item) {
      var daysLate = Math.floor((new Date() - new Date(item.line.dueDate)) / (1000 * 60 * 60 * 24));
      var remaining = money(item.line.amount) - (money(item.line.paidAmount) || 0);
      html += '<tr>' +
        '<td>' + esc(item.plan.customerName || '') + '</td>' +
        '<td>' + esc(item.plan.reference || '') + '</td>' +
        '<td>' + item.line.dueDate + '</td>' +
        '<td>' + fmt(item.line.amount) + '</td>' +
        '<td>' + fmt(item.line.paidAmount || 0) + '</td>' +
        '<td>' + fmt(remaining) + '</td>' +
        '<td style="color:#ef4444">' + daysLate + ' يوم</td>' +
        '<td><button class="fi-btn fi-btn-sm fi-btn-success" onclick="fiPayInstallment(\'' + item.plan.id + '\',\'' + item.line.id + '\')">💰 تسديد</button></td>' +
        '</tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function render() {
    ensureData();
    var container = document.getElementById('financeInstallmentsBody');
    if (!container) return;
    var content = '';
    if (activeTab === 'plans') content = plansView();
    else if (activeTab === 'create') content = createView();
    else if (activeTab === 'late') content = lateView();
    container.innerHTML = kpiStrip() + toolbar() + '<div class="fi-content">' + content + '</div>';
  }

  window.fiSetView = function (tab) {
    activeTab = tab;
    render();
  };

  window.fiCreatePlan = function () {
    var custEl = document.getElementById('fiPlanCustomer');
    var totalEl = document.getElementById('fiPlanTotal');
    var downEl = document.getElementById('fiPlanDown');
    var countEl = document.getElementById('fiPlanCount');
    var freqEl = document.getElementById('fiPlanFreq');
    var startEl = document.getElementById('fiPlanStart');
    var refEl = document.getElementById('fiPlanRef');

    var c = getCustomers();
    var customer = custEl ? c.find(function (cu) { return cu.id === custEl.value; }) : null;
    if (!customer) { toast('اختر العميل', 'error'); return; }
    var total = Number(totalEl ? totalEl.value : 0);
    if (total <= 0) { toast('أدخل المبلغ الإجمالي', 'error'); return; }
    var down = Number(downEl ? downEl.value : 0);
    var count = Number(countEl ? countEl.value : 1);
    if (count <= 0) { toast('عدد الأقساط يجب أن يكون 1 على الأقل', 'error'); return; }
    if (down >= total) { toast('الدفعة الأولى يجب أن تكون أقل من الإجمالي', 'error'); return; }

    var lines = generateInstallmentLines(total, down, count, freqEl.value, startEl ? startEl.value : null);
    var plan = {
      id: uid('plan'),
      customerId: customer.id,
      customerName: customer.name || customer.companyName || '',
      reference: refEl ? refEl.value.trim() : ('INST-' + Date.now().toString().slice(-6)),
      totalAmount: money(total),
      downPayment: money(down),
      installmentCount: count,
      frequency: freqEl ? freqEl.value : 'monthly',
      startDate: startEl ? startEl.value : todayISO(),
      status: 'active',
      lines: lines,
      createdAt: nowISO()
    };
    PL().push(plan);
    save();
    toast('تم إنشاء خطة التقسيط');
    activeTab = 'plans';
    render();
  };

  window.fiPayInstallment = function (planId, lineId) {
    var amount = prompt('المبلغ المسدد:');
    if (!amount) return;
    var paid = money(Number(amount));
    if (paid <= 0) { toast('أدخل مبلغ صحيحاً', 'error'); return; }
    var plans = PL();
    var plan = plans.find(function (p) { return p.id === planId; });
    if (!plan) return;
    var line = plan.lines.find(function (l) { return l.id === lineId; });
    if (!line) return;
    var remaining = money(line.amount) - (money(line.paidAmount) || 0);
    var toPay = Math.min(paid, remaining);
    line.paidAmount = (money(line.paidAmount) || 0) + toPay;
    if (line.paidAmount >= line.amount) line.status = 'paid';
    var allPaid = plan.lines.every(function (l) { return l.status === 'paid'; });
    if (allPaid) plan.status = 'completed';
    save();
    toast('تم تسجيل الدفعة');
    render();
  };

  window.fiCompletePlan = function (planId) {
    if (!confirm('تأكيد إكمال الخطة؟')) return;
    var plans = PL();
    var plan = plans.find(function (p) { return p.id === planId; });
    if (plan) { plan.status = 'completed'; save(); render(); }
  };

  window.fiDeletePlan = function (planId) {
    if (!confirm('حذف خطة التقسيط؟')) return;
    var plans = PL();
    var idx = plans.findIndex(function (p) { return p.id === planId; });
    if (idx !== -1) { plans.splice(idx, 1); save(); render(); }
  };

  function activatePage() {
    var pages = document.querySelectorAll('.page');
    pages.forEach(function (p) { p.classList.remove('page-active'); });
    var navs = document.querySelectorAll('.nav-btn');
    navs.forEach(function (n) { n.classList.remove('active'); });
    var page = document.getElementById('pageFinanceInstallments');
    if (page) page.classList.add('page-active');
    var nav = document.getElementById('navFinanceInstallments');
    if (nav) nav.classList.add('active');
    window.currentPage = 'finance_installments';
    render();
  }

  function wireSwitch() {
    if (_wired) return;
    if (typeof window.switchPage !== 'function') return;
    var orig = window.switchPage;
    if (orig.__fiWired) return;
    window.switchPage = function (page) {
      if (page === 'finance_installments') {
        activatePage();
        return;
      }
      return orig.apply(this, arguments);
    };
    window.switchPage.__fiWired = true;
    _wired = true;
  }

  function init() {
    ensureData();
    wireSwitch();
    var tries = 0;
    function retry() {
      if (tries > 40) return;
      tries++;
      wireSwitch();
      if (!_wired) setTimeout(retry, 150);
    }
    setTimeout(retry, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.OctagonFinanceInstallments = {
    ensureData: ensureData,
    render: render,
    open: function () { window.switchPage('finance_installments'); }
  };
})();
