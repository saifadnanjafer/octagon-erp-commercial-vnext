(function () {
  'use strict';

  function O() { try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {} if (!window.omni) window.omni = {}; return window.omni; }
  function save() { if (window.saveData) window.saveData(); }
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); }
  function uid(p) { return (p || 'sct') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
  function money(n) { return Math.round(Number(n) || 0); }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function nowISO() { return new Date().toISOString(); }

  var activeTab = 'contracts';
  var _wired = false;

  function ensureData() {
    var o = O();
    if (!o.salesContracts) o.salesContracts = {};
    var sc = o.salesContracts;
    if (!Array.isArray(sc.contracts)) sc.contracts = [];
    if (!Array.isArray(sc.approvals)) sc.approvals = [];
    if (!Array.isArray(sc.downPayments)) sc.downPayments = [];
    return sc;
  }

  function SC() { return ensureData(); }

  function getQuotations() { var c = O().salesCrm; return c ? c.quotations || [] : []; }
  function getOrders() { var c = O().salesCrm; return c ? c.salesOrders || [] : []; }
  function getCustomers() { var f = O().finance; return f && f.customers ? f.customers : []; }

  function kpis() {
    var sc = SC();
    var activeContracts = sc.contracts.filter(function (c) { return c.status === 'active'; });
    var pendingApprovals = sc.approvals.filter(function (a) { return a.status === 'pending'; });
    var totalDownPayments = 0;
    sc.downPayments.forEach(function (d) { totalDownPayments += money(d.amount); });
    return {
      contractCount: sc.contracts.length,
      activeCount: activeContracts.length,
      pendingApprovals: pendingApprovals.length,
      totalDownPayments: money(totalDownPayments)
    };
  }

  function kpiStrip() {
    var k = kpis();
    return '<div class="sct-kpi-strip">' +
      '<div class="sct-kpi-card"><div class="sct-kpi-value">' + k.contractCount + '</div><div class="sct-kpi-label">إجمالي العقود</div></div>' +
      '<div class="sct-kpi-card"><div class="sct-kpi-value">' + k.activeCount + '</div><div class="sct-kpi-label">عقود نشطة</div></div>' +
      '<div class="sct-kpi-card"><div class="sct-kpi-value">' + k.pendingApprovals + '</div><div class="sct-kpi-label">موافقات معلقة</div></div>' +
      '<div class="sct-kpi-card"><div class="sct-kpi-value">' + fmt(k.totalDownPayments) + '</div><div class="sct-kpi-label">دفعات مقدمة</div></div>' +
      '</div>';
  }

  function toolbar() {
    return '<div class="sct-toolbar">' +
      '<button class="' + (activeTab === 'contracts' ? 'active' : '') + '" onclick="sctSetView(\'contracts\')">📋 العقود</button>' +
      '<button class="' + (activeTab === 'approvals' ? 'active' : '') + '" onclick="sctSetView(\'approvals\')">✅ الموافقات</button>' +
      '<button class="' + (activeTab === 'create' ? 'active' : '') + '" onclick="sctSetView(\'create\')">➕ عقد جديد</button>' +
      '</div>';
  }

  function contractsView() {
    var sc = SC();
    if (sc.contracts.length === 0) return '<div class="sct-empty">لا توجد عقود. أنشئ عقداً جديداً من عرض سعر.</div>';
    var html = '<table class="sct-table"><thead><tr><th>المرجع</th><th>العميل</th><th>عرض السعر</th><th>المبلغ</th><th>الدفعة المقدمة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>';
    sc.contracts.forEach(function (c) {
      var statusMap = { draft: 'sct-badge-draft', active: 'sct-badge-active', completed: 'sct-badge-completed', cancelled: 'sct-badge-cancelled' };
      var statusLabels = { draft: 'مسودة', active: 'نشط', completed: 'مكتمل', cancelled: 'ملغي' };
      html += '<tr><td><strong>' + esc(c.reference || c.id) + '</strong></td>' +
        '<td>' + esc(c.customerName || '') + '</td>' +
        '<td>' + esc(c.quotationRef || '') + '</td>' +
        '<td>' + fmt(c.total) + '</td>' +
        '<td>' + fmt(c.downPayment || 0) + '</td>' +
        '<td><span class="sct-badge ' + (statusMap[c.status] || 'sct-badge-draft') + '">' + (statusLabels[c.status] || c.status) + '</span></td>' +
        '<td>' +
        (c.status === 'draft' ? '<button class="sct-btn sct-btn-sm sct-btn-success" onclick="sctActivateContract(\'' + c.id + '\')">تفعيل</button> ' : '') +
        (c.status === 'active' ? '<button class="sct-btn sct-btn-sm sct-btn-success" onclick="sctCompleteContract(\'' + c.id + '\')">إكمال</button> ' : '') +
        '<button class="sct-btn sct-btn-sm sct-btn-danger" onclick="sctCancelContract(\'' + c.id + '\')">إلغاء</button>' +
        '</td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function approvalsView() {
    var sc = SC();
    var html = '<div style="margin-bottom:1rem"><button class="sct-btn sct-btn-primary" onclick="sctRequestApproval()">➕ طلب موافقة جديدة</button></div>';
    if (sc.approvals.length === 0) return html + '<div class="sct-empty">لا توجد طلبات موافقة.</div>';
    html += '<table class="sct-table"><thead><tr><th>العنوان</th><th>النوع</th><th>المبلغ</th><th>الطالب</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>';
    sc.approvals.forEach(function (a) {
      html += '<tr><td>' + esc(a.title || '') + '</td>' +
        '<td>' + esc(a.type || '') + '</td>' +
        '<td>' + fmt(a.amount) + '</td>' +
        '<td>' + esc(a.requestedBy || '') + '</td>' +
        '<td><span class="sct-badge ' + (a.status === 'approved' ? 'sct-badge-approved' : 'sct-badge-pending') + '">' + (a.status === 'approved' ? 'معتمد' : 'معلق') + '</span></td>' +
        '<td>' + (a.status === 'pending' ? '<button class="sct-btn sct-btn-sm sct-btn-success" onclick="sctApprove(\'' + a.id + '\')">اعتماد</button> <button class="sct-btn sct-btn-sm sct-btn-danger" onclick="sctReject(\'' + a.id + '\')">رفض</button>' : '') + '</td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function createView() {
    var q = getQuotations().filter(function (q) { return q.status === 'approved' || q.status === 'sent'; });
    var c = getCustomers();
    var html = '<div style="max-width:600px">';
    html += '<div class="sct-form-group"><label>عرض السعر</label><select id="sctQuote"><option value="">-- اختر --</option>';
    q.forEach(function (qt) { html += '<option value="' + esc(qt.id) + '">' + esc(qt.reference || qt.id) + ' - ' + esc(qt.customerName || '') + ' (' + fmt(qt.total) + ')</option>'; });
    html += '</select></div>';
    html += '<div class="sct-form-row">';
    html += '<div class="sct-form-group"><label>العميل</label><select id="sctCustomer"><option value="">-- اختر --</option>';
    c.forEach(function (cu) { html += '<option value="' + esc(cu.id) + '">' + esc(cu.name || cu.companyName || '') + '</option>'; });
    html += '</select></div>';
    html += '<div class="sct-form-group"><label>الدفعة المقدمة</label><input id="sctDownPayment" type="number" placeholder="0" value="0"></div>';
    html += '</div>';
    html += '<div class="sct-form-group"><label>ملاحظات العقد</label><textarea id="sctNotes" placeholder="شروط وأحكام العقد..."></textarea></div>';
    html += '<button class="sct-btn sct-btn-primary" onclick="sctCreateContract()">📝 إنشاء العقد</button>';
    html += '</div>';
    return html;
  }

  function render() {
    ensureData();
    var container = document.getElementById('salesContractsBody');
    if (!container) return;
    var content = '';
    if (activeTab === 'contracts') content = contractsView();
    else if (activeTab === 'approvals') content = approvalsView();
    else if (activeTab === 'create') content = createView();
    container.innerHTML = kpiStrip() + toolbar() + '<div class="sct-content">' + content + '</div>';
  }

  window.sctSetView = function (tab) { activeTab = tab; render(); };

  window.sctCreateContract = function () {
    var qEl = document.getElementById('sctQuote');
    var cEl = document.getElementById('sctCustomer');
    var dpEl = document.getElementById('sctDownPayment');
    var notesEl = document.getElementById('sctNotes');
    var q = getQuotations().find(function (qt) { return qt.id === (qEl ? qEl.value : ''); });
    if (!q) { toast('اختر عرض السعر', 'error'); return; }
    var sc = SC();
    var contract = {
      id: uid('ctr'),
      reference: 'CTR-' + Date.now().toString().slice(-6),
      quotationId: q.id,
      quotationRef: q.reference || '',
      customerId: q.customerId || (cEl ? cEl.value : ''),
      customerName: q.customerName || '',
      total: money(q.total),
      downPayment: money(Number(dpEl ? dpEl.value : 0)),
      notes: notesEl ? notesEl.value : '',
      status: 'draft',
      createdAt: nowISO()
    };
    sc.contracts.push(contract);
    if (contract.downPayment > 0) {
      sc.downPayments.push({
        id: uid('dp'),
        contractId: contract.id,
        amount: contract.downPayment,
        status: 'pending',
        createdAt: nowISO()
      });
    }
    save();
    toast('تم إنشاء العقد');
    activeTab = 'contracts';
    render();
  };

  window.sctActivateContract = function (id) {
    var sc = SC();
    var c = sc.contracts.find(function (x) { return x.id === id; });
    if (c) { c.status = 'active'; save(); toast('تم تفعيل العقد'); render(); }
  };

  window.sctCompleteContract = function (id) {
    if (!confirm('تأكيد إكمال العقد؟')) return;
    var sc = SC();
    var c = sc.contracts.find(function (x) { return x.id === id; });
    if (c) { c.status = 'completed'; save(); toast('تم إكمال العقد'); render(); }
    var orders = getOrders();
    var existingOrder = orders.find(function (o) { return o.quotationId === c.quotationId; });
    if (!existingOrder && window.convertQuotationToOrder) {
      window.convertQuotationToOrder(c.quotationId);
    }
  };

  window.sctCancelContract = function (id) {
    if (!confirm('إلغاء العقد؟')) return;
    var sc = SC();
    var c = sc.contracts.find(function (x) { return x.id === id; });
    if (c) { c.status = 'cancelled'; save(); render(); }
  };

  window.sctRequestApproval = function () {
    var title = prompt('عنوان طلب الموافقة:');
    if (!title) return;
    var amount = Number(prompt('المبلغ:', '0')) || 0;
    var type = prompt('النوع (عقد/سعر/خصم):', 'عقد') || 'عقد';
    var sc = SC();
    sc.approvals.push({
      id: uid('appr'),
      title: title.trim(),
      type: type,
      amount: money(amount),
      requestedBy: window.PentagonAuth ? PentagonAuth.userName || PentagonAuth.email || 'مستخدم' : 'مستخدم',
      status: 'pending',
      createdAt: nowISO()
    });
    save();
    toast('تم تقديم طلب الموافقة');
    render();
  };

  window.sctApprove = function (id) {
    var sc = SC();
    var a = sc.approvals.find(function (x) { return x.id === id; });
    if (a) { a.status = 'approved'; a.approvedAt = nowISO(); save(); toast('تم الاعتماد'); render(); }
  };

  window.sctReject = function (id) {
    var sc = SC();
    var a = sc.approvals.find(function (x) { return x.id === id; });
    if (a) { a.status = 'rejected'; a.rejectedAt = nowISO(); save(); toast('تم الرفض'); render(); }
  };

  function activatePage() {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('page-active'); });
    document.querySelectorAll('.nav-btn').forEach(function (n) { n.classList.remove('active'); });
    var page = document.getElementById('pageSalesContracts');
    if (page) page.classList.add('page-active');
    var nav = document.getElementById('navSalesContracts');
    if (nav) nav.classList.add('active');
    window.currentPage = 'sales_contracts';
    render();
  }

  function wireSwitch() {
    if (_wired) return;
    if (typeof window.switchPage !== 'function') return;
    var orig = window.switchPage;
    if (orig.__sctWired) return;
    window.switchPage = function (page) {
      if (page === 'sales_contracts') { activatePage(); return; }
      return orig.apply(this, arguments);
    };
    window.switchPage.__sctWired = true;
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

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonSalesContracts = { ensureData: ensureData, render: render, open: function () { window.switchPage('sales_contracts'); } };
})();
