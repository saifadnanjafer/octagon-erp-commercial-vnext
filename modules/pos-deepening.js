(function () {
  'use strict';

  function O() { try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {} if (!window.omni) window.omni = {}; return window.omni; }
  function save() { if (window.saveData) window.saveData(); }
  function toast(m, k) { if (window.showToast) window.showToast(m, k || 'info'); }
  function uid(p) { return (p || 'posd') + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6); }
  function money(n) { return Math.round(Number(n) || 0); }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(v) { return String(v).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function nowISO() { return new Date().toISOString(); }

  var activeTab = 'shifts';
  var _wired = false;

  function getFinance() { var o = O(); if (!o.finance) o.finance = {}; return o.finance; }
  function getPOS() { var o = O(); if (!o.pos) o.pos = {}; return o.pos; }

  function ensureData() {
    var p = getPOS();
    if (!Array.isArray(p.shifts)) p.shifts = [];
    if (!Array.isArray(p.cashDrawer)) p.cashDrawer = [];
    if (!Array.isArray(p.returns)) p.returns = [];
    if (!Array.isArray(p.offlineQueue)) p.offlineQueue = [];
    return p;
  }

  function PD() { return ensureData(); }

  function kpis() {
    var pd = PD();
    var openShift = pd.shifts.find(function (s) { return s.status === 'open'; });
    var todayReturns = pd.returns.filter(function (r) { return (r.createdAt || '').slice(0, 10) === todayISO(); });
    var totalReturns = 0;
    todayReturns.forEach(function (r) { totalReturns += money(r.amount); });
    var posSales = getPOS().posSales || O().posSales || [];
    var todaySales = posSales.filter(function (s) { return (s.date || '').slice(0, 10) === todayISO(); });
    var totalSales = 0;
    todaySales.forEach(function (s) { totalSales += money(s.total); });
    return {
      hasOpenShift: !!openShift,
      openShiftId: openShift ? openShift.id : null,
      todaySales: money(totalSales),
      todayReturns: money(totalReturns),
      returnCount: todayReturns.length,
      shiftCount: pd.shifts.length
    };
  }

  function kpiStrip() {
    var k = kpis();
    return '<div class="posd-kpi-strip">' +
      '<div class="posd-kpi-card"><div class="posd-kpi-value">' + (k.hasOpenShift ? '🟢' : '🔴') + '</div><div class="posd-kpi-label">الجلسة</div></div>' +
      '<div class="posd-kpi-card"><div class="posd-kpi-value">' + fmt(k.todaySales) + '</div><div class="posd-kpi-label">مبيعات اليوم</div></div>' +
      '<div class="posd-kpi-card"><div class="posd-kpi-value">' + fmt(k.todayReturns) + '</div><div class="posd-kpi-label">مرتجعات اليوم</div></div>' +
      '<div class="posd-kpi-card"><div class="posd-kpi-value">' + k.returnCount + '</div><div class="posd-kpi-label">عدد المرتجعات</div></div>' +
      '<div class="posd-kpi-card"><div class="posd-kpi-value">' + k.shiftCount + '</div><div class="posd-kpi-label">إجمالي المناوبات</div></div>' +
      '</div>';
  }

  function toolbar() {
    var tabs = [
      { id: 'shifts', label: 'المناوبات' },
      { id: 'returns', label: 'المرتجعات' },
      { id: 'drawer', label: 'الدرج النقدي' },
      { id: 'offline', label: 'المعلقة (أوفلاين)' }
    ];
    return '<div class="posd-toolbar">' +
      tabs.map(function (t) { return '<button class="' + (activeTab === t.id ? 'active' : '') + '" onclick="posdSetView(\'' + t.id + '\')">' + t.label + '</button>'; }).join('') +
      '</div>';
  }

  function shiftsView() {
    var pd = PD();
    var openShift = pd.shifts.find(function (s) { return s.status === 'open'; });
    var html = '';
    if (!openShift) {
      html += '<div style="margin-bottom:1rem;padding:1rem;background:#0f172a;border-radius:8px;border:1px solid #334155">';
      html += '<strong style="color:#facc15">⚠️ لا توجد جلسة مفتوحة</strong><br>';
      html += '<button class="posd-btn posd-btn-success" style="margin-top:0.5rem" onclick="posdOpenShift()">🔓 فتح جلسة جديدة</button>';
      html += '</div>';
    } else {
      html += '<div style="margin-bottom:1rem;padding:1rem;background:#0f172a;border-radius:8px;border:1px solid #2563eb">';
      html += '<strong style="color:#38bdf8">🟢 الجلسة مفتوحة</strong><br>';
      html += '<span style="font-size:0.85rem;color:#94a3b8">افتتحت: ' + (openShift.openedAt || '') + ' بواسطة ' + esc(openShift.cashier || '') + '</span><br>';
      html += '<span style="font-size:0.85rem;color:#94a3b8">الرصيد الافتتاحي: ' + fmt(openShift.openingBalance) + '</span><br>';
      html += '<button class="posd-btn posd-btn-danger" style="margin-top:0.5rem" onclick="posdCloseShift()">🔒 إغلاق الجلسة</button>';
      html += '</div>';
    }

    if (pd.shifts.length === 0) return html + '<div class="posd-empty">لا توجد مناوبات سابقة.</div>';
    html += '<table class="posd-table"><thead><tr><th>الكاشير</th><th>الافتتاح</th><th>الإغلاق</th><th>الرصيد الافتتاحي</th><th>إجمالي المبيعات</th><th>الحالة</th></tr></thead><tbody>';
    pd.shifts.forEach(function (s) {
      html += '<tr><td>' + esc(s.cashier || '') + '</td>' +
        '<td>' + (s.openedAt || '').slice(0, 16) + '</td>' +
        '<td>' + (s.closedAt || '').slice(0, 16) + '</td>' +
        '<td>' + fmt(s.openingBalance) + '</td>' +
        '<td>' + fmt(s.totalSales || 0) + '</td>' +
        '<td><span class="posd-badge ' + (s.status === 'open' ? 'posd-badge-open' : 'posd-badge-closed') + '">' + (s.status === 'open' ? 'مفتوحة' : 'مغلقة') + '</span></td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function returnsView() {
    var pd = PD();
    var html = '<div class="posd-form-row" style="margin-bottom:1rem">';
    html += '<div class="posd-form-group"><label>رقم الفاتورة/المرجع</label><input id="posdRetRef" placeholder="POS-2025-..."></div>';
    html += '<div class="posd-form-group"><label>المنتج/الوصف</label><input id="posdRetProduct" placeholder="اسم المنتج"></div>';
    html += '<div class="posd-form-group"><label>المبلغ</label><input id="posdRetAmount" type="number" placeholder="0"></div>';
    html += '<div class="posd-form-group"><label>السبب</label><select id="posdRetReason"><option value="defective">عيب صناعة</option><option value="customer_request">طلب العميل</option><option value="wrong_item">خطأ في الصنف</option><option value="exchange">استبدال</option></select></div>';
    html += '<div class="posd-form-group" style="display:flex;align-items:flex-end"><button class="posd-btn posd-btn-primary" onclick="posdAddReturn()">➕ تسجيل مرتجع</button></div>';
    html += '</div>';

    if (pd.returns.length === 0) return html + '<div class="posd-empty">لا توجد مرتجعات مسجلة.</div>';
    html += '<table class="posd-table"><thead><tr><th>التاريخ</th><th>المرجع</th><th>المنتج</th><th>المبلغ</th><th>السبب</th><th>الحالة</th></tr></thead><tbody>';
    pd.returns.forEach(function (r) {
      html += '<tr><td>' + (r.createdAt || '').slice(0, 10) + '</td>' +
        '<td>' + esc(r.reference || '') + '</td>' +
        '<td>' + esc(r.product || '') + '</td>' +
        '<td>' + fmt(r.amount) + '</td>' +
        '<td>' + esc(r.reason || '') + '</td>' +
        '<td><span class="posd-badge posd-badge-return">مرتجع</span></td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function drawerView() {
    var pd = PD();
    var html = '<div class="posd-form-row" style="margin-bottom:1rem">';
    html += '<div class="posd-form-group"><label>النوع</label><select id="posdDrawType"><option value="in">إيداع</option><option value="out">سحب</option></select></div>';
    html += '<div class="posd-form-group"><label>المبلغ</label><input id="posdDrawAmount" type="number" placeholder="0"></div>';
    html += '<div class="posd-form-group"><label>السبب</label><input id="posdDrawNote" placeholder="سبب الحركة"></div>';
    html += '<div class="posd-form-group" style="display:flex;align-items:flex-end"><button class="posd-btn posd-btn-primary" onclick="posdDrawerMove()">➕ تسجيل</button></div>';
    html += '</div>';

    if (pd.cashDrawer.length === 0) return html + '<div class="posd-empty">لا توجد حركات درج نقدي.</div>';
    var balance = 0;
    pd.cashDrawer.forEach(function (d) { balance += d.type === 'in' ? money(d.amount) : -money(d.amount); });
    html += '<div style="margin-bottom:0.75rem;font-size:0.9rem"><strong>الرصيد الحالي: ' + fmt(balance) + '</strong></div>';
    html += '<table class="posd-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>السبب</th></tr></thead><tbody>';
    pd.cashDrawer.forEach(function (d) {
      html += '<tr><td>' + (d.createdAt || '').slice(0, 16) + '</td>' +
        '<td>' + (d.type === 'in' ? '💰 إيداع' : '🏧 سحب') + '</td>' +
        '<td style="color:' + (d.type === 'in' ? '#16a34a' : '#ef4444') + '">' + (d.type === 'in' ? '+' : '-') + fmt(d.amount) + '</td>' +
        '<td>' + esc(d.note || '') + '</td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function offlineView() {
    var pd = PD();
    var html = '<div style="margin-bottom:1rem">';
    html += '<button class="posd-btn posd-btn-success" onclick="posdProcessOffline()">🔄 معالجة المعلقة</button>';
    html += '<span style="color:#94a3b8;font-size:0.85rem;margin-right:1rem">' + pd.offlineQueue.length + ' معاملة معلقة</span>';
    html += '</div>';
    if (pd.offlineQueue.length === 0) return html + '<div class="posd-empty">لا توجد معاملات أوفلاين معلقة.</div>';
    html += '<table class="posd-table"><thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>الحالة</th></tr></thead><tbody>';
    pd.offlineQueue.forEach(function (q) {
      html += '<tr><td>' + (q.createdAt || '').slice(0, 16) + '</td>' +
        '<td>' + esc(q.type || 'sale') + '</td>' +
        '<td>' + fmt(q.amount) + '</td>' +
        '<td><span class="posd-badge ' + (q.processed ? 'posd-badge-closed' : 'posd-badge-open') + '">' + (q.processed ? 'تمت' : 'معلقة') + '</span></td></tr>';
    });
    html += '</tbody></table>';
    return html;
  }

  function render() {
    ensureData();
    var container = document.getElementById('posDeepeningBody');
    if (!container) return;
    var content = '';
    if (activeTab === 'shifts') content = shiftsView();
    else if (activeTab === 'returns') content = returnsView();
    else if (activeTab === 'drawer') content = drawerView();
    else if (activeTab === 'offline') content = offlineView();
    container.innerHTML = kpiStrip() + toolbar() + '<div class="posd-content">' + content + '</div>';
  }

  window.posdSetView = function (tab) { activeTab = tab; render(); };

  window.posdOpenShift = function () {
    var name = prompt('اسم الكاشير:');
    if (!name) return;
    var balance = Number(prompt('الرصيد الافتتاحي:', '0')) || 0;
    var pd = PD();
    pd.shifts.push({
      id: uid('shift'),
      cashier: name.trim(),
      openingBalance: money(balance),
      status: 'open',
      openedAt: nowISO(),
      totalSales: 0
    });
    save();
    toast('تم فتح الجلسة');
    render();
  };

  window.posdCloseShift = function () {
    if (!confirm('إغلاق الجلسة الحالية؟')) return;
    var pd = PD();
    var shift = pd.shifts.find(function (s) { return s.status === 'open'; });
    if (!shift) { toast('لا توجد جلسة مفتوحة', 'error'); return; }
    var posSales = getPOS().posSales || O().posSales || [];
    var todaySales = posSales.filter(function (s) { return (s.date || '').slice(0, 10) === todayISO(); });
    var total = 0;
    todaySales.forEach(function (s) { total += money(s.total); });
    shift.status = 'closed';
    shift.closedAt = nowISO();
    shift.totalSales = money(total);
    save();
    toast('تم إغلاق الجلسة');
    render();
  };

  window.posdAddReturn = function () {
    var refEl = document.getElementById('posdRetRef');
    var prodEl = document.getElementById('posdRetProduct');
    var amtEl = document.getElementById('posdRetAmount');
    var reasonEl = document.getElementById('posdRetReason');
    var amount = Number(amtEl ? amtEl.value : 0);
    if (amount <= 0) { toast('أدخل المبلغ', 'error'); return; }
    var pd = PD();
    pd.returns.push({
      id: uid('ret'),
      reference: refEl ? refEl.value : '',
      product: prodEl ? prodEl.value : '',
      amount: money(amount),
      reason: reasonEl ? reasonEl.value : '',
      status: 'returned',
      createdAt: nowISO()
    });
    if (refEl) refEl.value = '';
    if (prodEl) prodEl.value = '';
    if (amtEl) amtEl.value = '';
    save();
    toast('تم تسجيل المرتجع');
    render();
  };

  window.posdDrawerMove = function () {
    var typeEl = document.getElementById('posdDrawType');
    var amtEl = document.getElementById('posdDrawAmount');
    var noteEl = document.getElementById('posdDrawNote');
    var amount = Number(amtEl ? amtEl.value : 0);
    if (amount <= 0) { toast('أدخل المبلغ', 'error'); return; }
    var pd = PD();
    pd.cashDrawer.push({
      id: uid('draw'),
      type: typeEl ? typeEl.value : 'in',
      amount: money(amount),
      note: noteEl ? noteEl.value : '',
      createdAt: nowISO()
    });
    if (amtEl) amtEl.value = '';
    if (noteEl) noteEl.value = '';
    save();
    toast('تم تسجيل حركة الدرج');
    render();
  };

  window.posdProcessOffline = function () {
    var pd = PD();
    pd.offlineQueue.forEach(function (q) { q.processed = true; });
    save();
    toast('تمت معالجة ' + pd.offlineQueue.length + ' معاملة');
    render();
  };

  function activatePage() {
    document.querySelectorAll('.page').forEach(function (p) { p.classList.remove('page-active'); });
    document.querySelectorAll('.nav-btn').forEach(function (n) { n.classList.remove('active'); });
    var page = document.getElementById('pagePOSDeepening');
    if (page) page.classList.add('page-active');
    var nav = document.getElementById('navPOSDeepening');
    if (nav) nav.classList.add('active');
    window.currentPage = 'pos_deepening';
    render();
  }

  function wireSwitch() {
    if (_wired) return;
    if (typeof window.switchPage !== 'function') return;
    var orig = window.switchPage;
    if (orig.__posdWired) return;
    window.switchPage = function (page) {
      if (page === 'pos_deepening') { activatePage(); return; }
      return orig.apply(this, arguments);
    };
    window.switchPage.__posdWired = true;
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

  window.OctagonPOSDeepening = { ensureData: ensureData, render: render, open: function () { window.switchPage('pos_deepening'); } };
})();
