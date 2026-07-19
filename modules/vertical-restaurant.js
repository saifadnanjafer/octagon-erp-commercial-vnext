/**
 * OCTAGON ERP — Restaurant Vertical (Phase 5, fourth industry vertical).
 * Complete restaurant on shared engines:
 *  - Menu catalog: categories (مقبلات/رئيسية/مشروبات/حلويات), price, prep time, availability.
 *  - Tables: status (فارغة/مشغولة/محجوزة), capacity, floor map.
 *  - Order taking: by table or takeaway/delivery; order lines with qty + notes.
 *  - Kitchen tickets: order board per status (new/preparing/ready/served).
 *  - Bill per table: split or full, cash/account/delivery-app.
 *  - Daily Z-report: revenue by category, table turns, avg ticket.
 *  - Jarvis tool: report_restaurant_today self-registered.
 */
(function () {
  'use strict';

  /* ─────────────── helpers ─────────────── */
  function O() {
    if (typeof omni !== 'undefined' && omni) return omni;
    if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} }
    return null;
  }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function money(n) { n = Number(n); return isFinite(n) ? Math.round(n) : 0; }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  function orgName() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.name) || 'Octagon'; }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function userName() {
    try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {}
    return 'كاشير';
  }
  function hist(action, summary, payload) {
    if (typeof window.recordOmniHistoryEvent === 'function')
      try { window.recordOmniHistoryEvent({ module: 'restaurant', source: 'restaurant', action, summary, payload: payload || {} }); } catch (_) {}
  }

  /* ─────────────── data layer ─────────────── */
  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.restaurant || typeof o.restaurant !== 'object') o.restaurant = {};
    const r = o.restaurant;
    if (!Array.isArray(r.menu)) r.menu = [];
    if (!Array.isArray(r.tables)) r.tables = [];
    if (!Array.isArray(r.orders)) r.orders = [];
    if (!r.settings) r.settings = { autoRefreshKitchen: true, kitchenRefreshSec: 30 };
    return r;
  }
  function R() { return ensureData(); }
  function menuList() {
    const r = R();
    const list = r ? r.menu : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function tablesList() {
    const r = R();
    const list = r ? r.tables : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function ordersList() {
    const r = R();
    const list = r ? r.orders : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function restaurantSales() {
    const o = O();
    const list = (o && o.posSales) ? o.posSales : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function menuItems() { return menuList().filter(m => !m.archived); }

  /* ─────────────── state ─────────────── */
  let activeTab = 'tables';
  let orderingTableId = null;   // which table we're taking order for
  let orderCart = [];           // [{menuItemId, name, qty, price, notes, category}]
  let orderType = 'dine_in';    // dine_in | takeaway | delivery
  let menuCatFilter = 'all';
  let editingMenuId = null;
  let kitchenTimer = null;

  const ORDER_STATUS = { new: 'جديد', preparing: 'قيد التحضير', ready: 'جاهز', served: 'قُدِّم', paid: 'مدفوع', cancelled: 'ملغي' };
  const ORDER_NEXT = { new: 'preparing', preparing: 'ready', ready: 'served' };
  const TABLE_STATUS = { empty: 'فارغة', occupied: 'مشغولة', reserved: 'محجوزة' };

  /* ─────────────── table actions ─────────────── */
  window.rstOpenTable = function (tableId) {
    orderingTableId = tableId;
    orderCart = [];
    menuCatFilter = 'all';
    activeTab = 'order';
    renderRestaurant();
  };

  window.rstOpenTakeaway = function () {
    orderingTableId = null;
    orderType = 'takeaway';
    orderCart = [];
    activeTab = 'order';
    renderRestaurant();
  };

  window.rstSetOrderType = function (t) {
    orderType = t;
    document.querySelectorAll('.rst-otype-btn').forEach(b => b.classList.toggle('active', b.dataset.type === t));
  };

  /* ─────────────── order cart ─────────────── */
  window.rstAddItem = function (menuItemId) {
    const item = menuItems().find(m => m.id === menuItemId);
    if (!item) return;
    const existing = orderCart.find(l => l.menuItemId === menuItemId);
    if (existing) { existing.qty++; }
    else { orderCart.push({ menuItemId, name: item.name, qty: 1, price: money(item.price), category: item.category || '', notes: '' }); }
    renderOrderCart();
  };

  window.rstChangeQty = function (menuItemId, delta) {
    const line = orderCart.find(l => l.menuItemId === menuItemId);
    if (!line) return;
    line.qty = Math.max(0, line.qty + delta);
    if (line.qty === 0) orderCart = orderCart.filter(l => l.menuItemId !== menuItemId);
    renderOrderCart();
  };

  window.rstSetLineNote = function (menuItemId, note) {
    const line = orderCart.find(l => l.menuItemId === menuItemId);
    if (line) line.notes = note;
  };

  window.rstClearCart = function () { orderCart = []; renderOrderCart(); };

  /* ─────────────── submit order ─────────────── */
  window.rstSubmitOrder = function () {
    if (!orderCart.length) { toast('الطلب فارغ', 'warning'); return; }
    const r = R(); const o = O(); if (!r || !o) return;

    const table = orderingTableId ? tablesList().find(t => t.id === orderingTableId) : null;
    const total = orderCart.reduce((s, l) => s + l.price * l.qty, 0);
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const ref = 'ORD-' + new Date().getFullYear() + '-' + String(ordersList().length + 1).padStart(4, '0');

    const order = {
      id: uid('rsto'), ref,
      tableId: orderingTableId, tableName: table ? table.name : (orderType === 'takeaway' ? 'تيك اواي' : 'توصيل'),
      orderType, lines: orderCart.map(l => ({ ...l })),
      total, status: 'new', operator: userName(),
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      companyId: coId
    };
    r.orders.push(order);

    if (table) { table.status = 'occupied'; table.currentOrderId = order.id; }

    hist('order_new', ref + ' — ' + (table ? table.name : orderType) + ' — ' + fmt(total) + ' ' + curSym());
    save();
    toast('تم إرسال الطلب للمطبخ: ' + ref, 'success');
    orderCart = []; orderingTableId = null; activeTab = 'kitchen';
    renderRestaurant();
  };

  /* ─────────────── kitchen actions ─────────────── */
  window.rstAdvanceOrder = function (orderId) {
    const r = R(); if (!r) return;
    const order = ordersList().find(o => o.id === orderId);
    if (!order) return;
    const next = ORDER_NEXT[order.status];
    if (!next) return;
    order.status = next; order.updatedAt = new Date().toISOString();
    if (next === 'ready') order.readyAt = order.updatedAt;
    if (next === 'served') order.servedAt = order.updatedAt;
    hist('order_advance', ORDER_STATUS[next] + ' — ' + order.ref);
    save(); renderKitchen();
    if (next === 'ready') toast('🔔 ' + order.ref + ' جاهز للتقديم!', 'success');
  };

  window.rstCancelOrder = function (orderId) {
    const r = R(); if (!r) return;
    const order = ordersList().find(o => o.id === orderId);
    if (!order || order.status === 'paid') return;
    order.status = 'cancelled'; order.updatedAt = new Date().toISOString();
    if (order.tableId) {
      const table = tablesList().find(t => t.id === order.tableId);
      if (table && table.currentOrderId === orderId) { table.status = 'empty'; table.currentOrderId = null; }
    }
    save(); renderRestaurant();
  };

  /* ─────────────── billing ─────────────── */
  window.rstBillTable = function (tableId) {
    const r = R(); if (!r) return;
    const table = tablesList().find(t => t.id === tableId);
    if (!table) return;
    const order = ordersList().find(o => o.id === table.currentOrderId && o.status !== 'paid' && o.status !== 'cancelled');
    if (!order) { toast('لا يوجد طلب مفتوح لهذه الطاولة', 'info'); return; }
    activeTab = 'bill';
    window._rstBillingOrderId = order.id;
    renderRestaurant();
  };

  window.rstPayBill = function (mode) {
    const r = R(); const o = O(); if (!r || !o) return;
    const order = ordersList().find(x => x.id === window._rstBillingOrderId);
    if (!order) return;
    order.status = 'paid'; order.payMode = mode; order.paidAt = new Date().toISOString();

    // finance
    if (typeof window.addFinanceTransaction === 'function') {
      try {
        window.addFinanceTransaction({
          id: uid('rsttxn'), type: mode === 'account' ? 'customer_charge' : 'income',
          amount: order.total, category: 'إيرادات مطعم', note: order.ref + ' — ' + order.tableName,
          sourceType: 'restaurant_order', sourceId: order.id, at: order.paidAt, by: userName(),
          companyId: order.companyId || ''
        });
      } catch (_) {}
    }

    // record in posSales for unified Z
    if (!Array.isArray(o.posSales)) o.posSales = [];
    o.posSales.push({ id: uid('rst'), ref: order.ref, businessType: 'restaurant', lines: order.lines.map(l => ({ ...l, unitPrice: l.price, finalPrice: l.price * l.qty })), total: order.total, discount: 0, payMode: mode, at: order.paidAt, companyId: order.companyId || '' });

    // free the table
    if (order.tableId) {
      const table = tablesList().find(t => t.id === order.tableId);
      if (table) { table.status = 'empty'; table.currentOrderId = null; }
    }

    hist('order_pay', order.ref + ' — ' + fmt(order.total) + ' ' + curSym() + ' — ' + mode);
    save();
    toast('✅ ' + order.ref + ' — تم الدفع', 'success');
    printBill(order);
    window._rstBillingOrderId = null; activeTab = 'tables';
    renderRestaurant();
  };

  function printBill(order) {
    const cur = curSym(); const org = orgName();
    const lines = order.lines.map(l => `<tr><td>${esc(l.name)}${l.notes ? ' <em>(' + esc(l.notes) + ')</em>' : ''}</td><td>${l.qty}</td><td>${fmt(l.price * l.qty)} ${cur}</td></tr>`).join('');
    const html = `<html dir="rtl"><head><meta charset="UTF-8"><title>فاتورة</title>
    <style>body{font-family:Tajawal,sans-serif;padding:20px;max-width:380px;margin:auto}h2{text-align:center}
    table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:4px 8px;font-size:13px}
    .total{font-size:16px;font-weight:700;margin-top:8px}.footer{text-align:center;font-size:12px;color:#666;margin-top:12px}</style></head>
    <body><h2>${esc(org)}</h2><p style="text-align:center">${esc(order.ref)} — ${esc(order.tableName)}<br>${new Date(order.createdAt).toLocaleString('ar-IQ')}</p>
    <table><thead><tr><th>الصنف</th><th>ك</th><th>المجموع</th></tr></thead><tbody>${lines}</tbody></table>
    <p class="total">الإجمالي: ${fmt(order.total)} ${cur}</p>
    <p>الدفع: ${order.payMode === 'cash' ? 'نقداً' : order.payMode === 'delivery' ? 'تطبيق توصيل' : 'آجل'}</p>
    <p class="footer">شكراً لزيارتكم — ${esc(org)}</p>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),1500)}<\/script></body></html>`;
    try { const w = window.open('', '_blank', 'width=420,height=600'); if (w) { w.document.write(html); w.document.close(); } } catch (_) {}
  }

  /* ─────────────── menu CRUD ─────────────── */
  window.rstOpenMenuForm = function (id) { editingMenuId = id || null; activeTab = 'menu'; renderRestaurant(); };
  window.rstCancelMenuForm = function () { editingMenuId = null; renderRestaurant(); };

  window.rstSaveMenuItem = function () {
    const r = R(); if (!r) return;
    const name = val('rstMenuName');
    if (!name) { toast('اسم الصنف مطلوب', 'warning'); return; }
    const base = { name, category: val('rstMenuCat'), price: numVal('rstMenuPrice'), prepTime: numVal('rstMenuPrep') || 10, description: val('rstMenuDesc'), available: !document.getElementById('rstMenuUnavail').checked };
    if (editingMenuId) {
      const item = menuList().find(m => m.id === editingMenuId);
      if (item) Object.assign(item, base);
      toast('تم تحديث: ' + name, 'success');
    } else {
      const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
      r.menu.push({ id: uid('rstm'), ...base, archived: false, createdAt: new Date().toISOString(), companyId: coId });
      toast('تم إضافة: ' + name, 'success');
    }
    editingMenuId = null; save(); renderRestaurant();
  };

  window.rstToggleMenuItem = function (id) {
    const item = menuList().find(m => m.id === id);
    if (item) { item.available = !item.available; save(); renderRestaurant(); }
  };

  window.rstArchiveMenuItem = function (id) {
    const item = menuList().find(m => m.id === id);
    if (item) { item.archived = !item.archived; save(); renderRestaurant(); }
  };

  /* ─────────────── demo data ─────────────── */
  window.rstLoadDemo = function () {
    const r = R(); if (!r) return;
    if (menuList().length) { toast('بيانات تجريبية موجودة', 'info'); return; }
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const menu = [
      { name: 'حمص بالزيت', category: 'مقبلات', price: 5000, prepTime: 5 },
      { name: 'متبل باذنجان', category: 'مقبلات', price: 5000, prepTime: 5 },
      { name: 'كباب مشوي (10 أصابع)', category: 'رئيسية', price: 20000, prepTime: 20 },
      { name: 'دجاج مشوي كامل', category: 'رئيسية', price: 18000, prepTime: 25 },
      { name: 'ماء معدني 0.5L', category: 'مشروبات', price: 1000, prepTime: 1 },
      { name: 'عصير برتقال طازج', category: 'مشروبات', price: 4000, prepTime: 3 },
      { name: 'بقلاوة (6 قطع)', category: 'حلويات', price: 6000, prepTime: 5 },
      { name: 'كنافة نابلسية', category: 'حلويات', price: 8000, prepTime: 8 },
    ];
    menu.forEach(m => r.menu.push({ id: uid('rstm'), ...m, available: true, archived: false, description: '', createdAt: new Date().toISOString(), companyId: coId }));
    // demo tables
    const floors = ['الطابق الأرضي', 'الطابق الأرضي', 'الطابق الأرضي', 'الطابق العلوي', 'الطابق العلوي'];
    for (let i = 1; i <= 8; i++) {
      r.tables.push({ id: uid('rstt'), name: 'طاولة ' + i, capacity: i <= 4 ? 4 : 6, floor: floors[i % 5] || 'الطابق الأرضي', status: 'empty', currentOrderId: null, companyId: coId });
    }
    save(); toast('8 أصناف + 8 طاولات تجريبية', 'success'); renderRestaurant();
  };

  /* ─────────────── tabs ─────────────── */
  window.rstOpenTab = function (tab) {
    activeTab = tab;
    if (tab !== 'kitchen' && kitchenTimer) { clearInterval(kitchenTimer); kitchenTimer = null; }
    document.querySelectorAll('.rst-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderTabContent();
  };

  /* ─────────────── render helpers ─────────────── */
  function menuCategories() { return [...new Set(menuList().map(m => m.category).filter(Boolean))].sort(); }

  function renderTables() {
    const el = document.getElementById('rstTablesBody'); if (!el) return;
    const r = R();
    el.innerHTML = `
      <div class="rst-tables-header">
        <button class="btn-primary" onclick="rstOpenTakeaway()">🥡 تيك اواي / توصيل</button>
        <button class="btn-ghost" onclick="rstLoadDemo()">بيانات تجريبية</button>
      </div>
      <div class="rst-tables-grid">
        ${tablesList().map(t => {
          const order = t.currentOrderId ? ordersList().find(o => o.id === t.currentOrderId) : null;
          const statusCls = { empty: 'rst-tbl-empty', occupied: 'rst-tbl-occupied', reserved: 'rst-tbl-reserved' }[t.status] || '';
          return `<div class="rst-table-card ${statusCls}">
            <div class="rst-table-name">${esc(t.name)}</div>
            <div class="rst-table-cap">👥 ${t.capacity} أشخاص</div>
            <div class="rst-table-floor">${esc(t.floor || '')}</div>
            <div class="rst-table-status">${TABLE_STATUS[t.status] || t.status}</div>
            ${order ? `<div class="rst-table-order">${esc(order.ref)} — ${fmt(order.total)} ${curSym()}<br><span class="rst-order-status-badge rst-os-${order.status}">${ORDER_STATUS[order.status]}</span></div>` : ''}
            <div class="rst-table-actions">
              ${t.status === 'empty' ? `<button class="btn-primary rst-btn-sm" onclick="rstOpenTable('${t.id}')">+ طلب جديد</button>` : ''}
              ${t.status === 'occupied' && order ? `<button class="rst-btn-sm btn-secondary" onclick="rstBillTable('${t.id}')">💵 الحساب</button>` : ''}
              ${t.status === 'occupied' && order ? `<button class="rst-btn-sm btn-ghost" onclick="rstOpenTab('kitchen')">🍳 مطبخ</button>` : ''}
            </div>
          </div>`;
        }).join('') || '<div class="rst-empty">لا طاولات — أضف بيانات تجريبية</div>'}
      </div>`;
  }

  function renderOrderTab() {
    const el = document.getElementById('rstOrderBody'); if (!el) return;
    const r = R();
    const table = orderingTableId ? tablesList().find(t => t.id === orderingTableId) : null;
    const cats = ['all', ...menuCategories()];
    const items = menuItems().filter(m => m.available && (menuCatFilter === 'all' || m.category === menuCatFilter));
    el.innerHTML = `
      <div class="rst-order-layout">
        <div class="rst-order-left">
          <div class="rst-order-header">
            <strong>${table ? '🍽️ ' + table.name : orderType === 'takeaway' ? '🥡 تيك اواي' : '🛵 توصيل'}</strong>
            <div class="rst-otype-row">
              ${!table ? `<button class="rst-otype-btn ${orderType==='takeaway'?'active':''}" data-type="takeaway" onclick="rstSetOrderType('takeaway')">🥡 تيك اواي</button>
              <button class="rst-otype-btn ${orderType==='delivery'?'active':''}" data-type="delivery" onclick="rstSetOrderType('delivery')">🛵 توصيل</button>` : ''}
            </div>
          </div>
          <div class="rst-cat-row">
            ${cats.map(c => `<button class="rst-cat-btn ${menuCatFilter===c?'active':''}" onclick="rstSetMenuCat('${esc(c)}')">${c==='all'?'الكل':esc(c)}</button>`).join('')}
          </div>
          <div class="rst-menu-grid">
            ${items.map(item => `
              <div class="rst-menu-card" onclick="rstAddItem('${item.id}')">
                <div class="rst-menu-cat">${esc(item.category || '')}</div>
                <div class="rst-menu-name">${esc(item.name)}</div>
                <div class="rst-menu-price">${fmt(item.price)} ${curSym()}</div>
                <div class="rst-menu-prep">⏱ ${item.prepTime} دقيقة</div>
              </div>`).join('') || '<div class="rst-empty">لا أصناف متاحة</div>'}
          </div>
        </div>
        <div class="rst-order-right">
          <h3>🧾 الطلب</h3>
          <div id="rstCartBody"></div>
          <div class="rst-order-total">الإجمالي: <strong id="rstCartTotal">0</strong> ${curSym()}</div>
          <div class="rst-order-actions">
            <button class="btn-primary rst-submit-btn" onclick="rstSubmitOrder()">✅ إرسال للمطبخ</button>
            <button class="btn-secondary" onclick="rstClearCart()">🗑️ تفريغ</button>
            <button class="btn-ghost" onclick="rstOpenTab('tables')">← رجوع</button>
          </div>
        </div>
      </div>`;
    renderOrderCart();
  }

  window.rstSetMenuCat = function (c) { menuCatFilter = c; renderOrderTab(); };

  function renderOrderCart() {
    const el = document.getElementById('rstCartBody'); if (!el) return;
    if (!orderCart.length) { el.innerHTML = '<div class="rst-empty-cart">الطلب فارغ</div>'; document.getElementById('rstCartTotal') && (document.getElementById('rstCartTotal').textContent = '0'); return; }
    el.innerHTML = orderCart.map(l => `
      <div class="rst-cart-line">
        <div class="rst-cart-name">${esc(l.name)}</div>
        <div class="rst-cart-qty">
          <button onclick="rstChangeQty('${l.menuItemId}',-1)">−</button>
          <span>${l.qty}</span>
          <button onclick="rstChangeQty('${l.menuItemId}',1)">+</button>
        </div>
        <div class="rst-cart-price">${fmt(l.price * l.qty)}</div>
        <input class="rst-cart-note" placeholder="ملاحظة..." value="${esc(l.notes)}" oninput="rstSetLineNote('${l.menuItemId}',this.value)">
      </div>`).join('');
    const total = orderCart.reduce((s, l) => s + l.price * l.qty, 0);
    const tot = document.getElementById('rstCartTotal'); if (tot) tot.textContent = fmt(total);
  }

  function renderKitchen() {
    const el = document.getElementById('rstKitchenBody'); if (!el) return;
    const r = R();
    const active = ordersList().filter(o => ['new','preparing','ready'].includes(o.status));
    const cols = [
      { key: 'new', label: '🔴 جديد', cls: 'rst-k-new' },
      { key: 'preparing', label: '🟡 قيد التحضير', cls: 'rst-k-prep' },
      { key: 'ready', label: '🟢 جاهز', cls: 'rst-k-ready' }
    ];
    el.innerHTML = `
      <div class="rst-kitchen-header">
        <span>🍳 شاشة المطبخ — ${active.length} طلب نشط</span>
        <button class="btn-ghost" onclick="renderKitchen()">🔄 تحديث</button>
      </div>
      <div class="rst-kitchen-cols">
        ${cols.map(col => {
          const colOrders = active.filter(o => o.status === col.key);
          return `<div class="rst-kitchen-col ${col.cls}">
            <div class="rst-k-col-header">${col.label} (${colOrders.length})</div>
            ${colOrders.map(o => {
              const elapsed = Math.round((Date.now() - new Date(o.createdAt).getTime()) / 60000);
              return `<div class="rst-k-ticket ${elapsed > 20 ? 'rst-k-overdue' : ''}">
                <div class="rst-k-ref">${esc(o.ref)} — ${esc(o.tableName)}</div>
                <div class="rst-k-elapsed">⏱ ${elapsed} دقيقة</div>
                <ul class="rst-k-lines">${o.lines.map(l => `<li>${l.qty}× ${esc(l.name)}${l.notes ? ' <em>('+esc(l.notes)+')</em>' : ''}</li>`).join('')}</ul>
                ${ORDER_NEXT[o.status] ? `<button class="btn-primary rst-btn-sm" onclick="rstAdvanceOrder('${o.id}')">${ORDER_STATUS[ORDER_NEXT[o.status]]}</button>` : ''}
                <button class="rst-btn-sm btn-danger-sm" onclick="rstCancelOrder('${o.id}')">إلغاء</button>
              </div>`;
            }).join('') || '<div class="rst-k-empty">لا طلبات</div>'}
          </div>`;
        }).join('')}
      </div>`;
  }

  function renderBill() {
    const el = document.getElementById('rstBillBody'); if (!el) return;
    const r = R();
    const order = window._rstBillingOrderId ? ordersList().find(o => o.id === window._rstBillingOrderId) : null;
    if (!order) { el.innerHTML = '<div class="rst-empty">اختر طاولة لإصدار الحساب</div>'; return; }
    el.innerHTML = `
      <div class="rst-bill-card">
        <h3>💵 الحساب — ${esc(order.ref)} — ${esc(order.tableName)}</h3>
        <table class="rst-table-list">
          <thead><tr><th>الصنف</th><th>ك</th><th>المجموع</th></tr></thead>
          <tbody>${order.lines.map(l => `<tr><td>${esc(l.name)}${l.notes ? ' <em>(' + esc(l.notes) + ')</em>' : ''}</td><td>${l.qty}</td><td>${fmt(l.price * l.qty)} ${curSym()}</td></tr>`).join('')}</tbody>
        </table>
        <div class="rst-bill-total">الإجمالي: <strong>${fmt(order.total)} ${curSym()}</strong></div>
        <div class="rst-pay-row">
          <button class="btn-primary" onclick="rstPayBill('cash')">💵 نقداً</button>
          <button class="btn-secondary" onclick="rstPayBill('account')">📋 آجل</button>
          <button class="btn-ghost" onclick="rstPayBill('delivery')">📱 تطبيق توصيل</button>
          <button class="btn-ghost" onclick="activeTab='tables'; renderRestaurant()">← رجوع</button>
        </div>
      </div>`;
  }

  function renderMenu() {
    const el = document.getElementById('rstMenuBody'); if (!el) return;
    const r = R();
    if (editingMenuId !== null) { renderMenuForm(el, r); return; }
    const cats = menuCategories();
    el.innerHTML = `
      <div class="rst-toolbar">
        <button class="btn-primary" onclick="rstOpenMenuForm(null)">+ صنف جديد</button>
        <button class="btn-ghost" onclick="rstLoadDemo()">بيانات تجريبية</button>
      </div>
      ${cats.length ? cats.map(cat => {
        const catItems = menuList().filter(m => m.category === cat);
        return `<div class="rst-menu-section">
          <div class="rst-menu-section-title">${esc(cat)}</div>
          <div class="rst-menu-list">
            ${catItems.map(item => `<div class="rst-menu-row ${!item.available ? 'rst-unavail' : ''}">
              <div class="rst-menu-row-name">${esc(item.name)}<br><span class="rst-menu-row-desc">${esc(item.description || '')}</span></div>
              <div class="rst-menu-row-prep">⏱ ${item.prepTime || 10} دق</div>
              <div class="rst-menu-row-price">${fmt(item.price)} ${curSym()}</div>
              <div class="rst-menu-row-actions">
                <button class="rst-btn-sm btn-secondary" onclick="rstOpenMenuForm('${item.id}')">✏️</button>
                <button class="rst-btn-sm btn-ghost" onclick="rstToggleMenuItem('${item.id}')">${item.available ? '⏸️' : '▶️'}</button>
                <button class="rst-btn-sm btn-ghost" onclick="rstArchiveMenuItem('${item.id}')">${item.archived ? '♻️' : '🗃️'}</button>
              </div>
            </div>`).join('')}
          </div>
        </div>`;
      }).join('') : r.menu.length ? '' : '<div class="rst-empty">لا منيو — أضف بيانات تجريبية</div>'}`;
  }

  function renderMenuForm(el, r) {
    const item = editingMenuId ? menuList().find(m => m.id === editingMenuId) : null;
    const cats = menuCategories();
    el.innerHTML = `
      <div class="rst-form-card">
        <h3>${item ? 'تعديل: ' + esc(item.name) : 'إضافة صنف جديد'}</h3>
        <div class="rst-form-grid">
          <div class="rst-field"><label>اسم الصنف *</label><input id="rstMenuName" value="${esc(item ? item.name : '')}"></div>
          <div class="rst-field"><label>التصنيف</label>
            <input id="rstMenuCat" list="rstCatList" value="${esc(item ? item.category || '' : '')}">
            <datalist id="rstCatList"><option value="مقبلات"><option value="رئيسية"><option value="مشروبات"><option value="حلويات">${cats.map(c=>'<option value="'+esc(c)+'">').join('')}</datalist>
          </div>
          <div class="rst-field"><label>السعر</label><input id="rstMenuPrice" type="number" value="${item ? item.price : ''}"></div>
          <div class="rst-field"><label>وقت التحضير (دقيقة)</label><input id="rstMenuPrep" type="number" value="${item ? item.prepTime || 10 : 10}"></div>
          <div class="rst-field rst-field-full"><label>الوصف</label><input id="rstMenuDesc" value="${esc(item ? item.description || '' : '')}"></div>
          <div class="rst-field" style="flex-direction:row;gap:8px;align-items:center">
            <input id="rstMenuUnavail" type="checkbox" ${item && !item.available ? 'checked' : ''}>
            <label for="rstMenuUnavail">غير متاح حالياً</label>
          </div>
        </div>
        <div class="rst-form-actions">
          <button class="btn-primary" onclick="rstSaveMenuItem()">💾 حفظ</button>
          <button class="btn-secondary" onclick="rstCancelMenuForm()">إلغاء</button>
        </div>
      </div>`;
  }

  function renderDashboard() {
    const el = document.getElementById('rstDashBody'); if (!el) return;
    const r = R(); const o = O();
    const today = new Date().toISOString().split('T')[0];
    const todayOrders = ordersList().filter(x => x.createdAt.startsWith(today));
    const paidToday = todayOrders.filter(x => x.status === 'paid');
    const revenue = paidToday.reduce((s, x) => s + x.total, 0);
    const active = ordersList().filter(x => ['new','preparing','ready','served'].includes(x.status)).length;
    const avgTicket = paidToday.length ? Math.round(revenue / paidToday.length) : 0;
    const cur = curSym();

    // top items today
    const topMap = {};
    paidToday.forEach(ord => ord.lines.forEach(l => { topMap[l.name] = (topMap[l.name] || 0) + l.qty; }));
    const top5 = Object.entries(topMap).sort((a,b) => b[1]-a[1]).slice(0,5);

    el.innerHTML = `
      <div class="rst-kpi-row">
        <div class="rst-kpi"><div class="rst-kpi-val">${fmt(revenue)} ${cur}</div><div class="rst-kpi-lbl">إيراد اليوم</div></div>
        <div class="rst-kpi"><div class="rst-kpi-val">${paidToday.length}</div><div class="rst-kpi-lbl">طلبات مدفوعة</div></div>
        <div class="rst-kpi ${active ? 'rst-kpi-warn' : ''}"><div class="rst-kpi-val">${active}</div><div class="rst-kpi-lbl">طلبات نشطة</div></div>
        <div class="rst-kpi"><div class="rst-kpi-val">${fmt(avgTicket)} ${cur}</div><div class="rst-kpi-lbl">متوسط الفاتورة</div></div>
        <div class="rst-kpi"><div class="rst-kpi-val">${tablesList().filter(t=>t.status==='occupied').length}/${tablesList().length}</div><div class="rst-kpi-lbl">طاولات مشغولة</div></div>
        <div class="rst-kpi"><div class="rst-kpi-val">${menuList().filter(m=>!m.archived).length}</div><div class="rst-kpi-lbl">أصناف المنيو</div></div>
      </div>
      <div class="rst-dash-row">
        <div class="rst-dash-card"><h4>🏆 أكثر الأصناف طلباً اليوم</h4>
          ${top5.length ? '<ul>'+top5.map(([n,q])=>'<li>'+esc(n)+' — '+q+'</li>').join('')+'</ul>' : '<p class="rst-empty">لا مبيعات بعد</p>'}
        </div>
        <div class="rst-dash-card"><h4>📋 حالة الطاولات</h4>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <span class="rst-tbl-badge empty">فارغة: ${tablesList().filter(t=>t.status==='empty').length}</span>
            <span class="rst-tbl-badge occupied">مشغولة: ${tablesList().filter(t=>t.status==='occupied').length}</span>
            <span class="rst-tbl-badge reserved">محجوزة: ${tablesList().filter(t=>t.status==='reserved').length}</span>
          </div>
        </div>
      </div>`;
  }

  function renderTabContent() {
    const body = document.getElementById('restaurantBody'); if (!body) return;
    const tabMap = { rstDashBody:'dashboard', rstTablesBody:'tables', rstOrderBody:'order', rstKitchenBody:'kitchen', rstBillBody:'bill', rstMenuBody:'menu' };
    Object.keys(tabMap).forEach(id => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('div'); el.id = id; body.appendChild(el); }
      el.style.display = tabMap[id] === activeTab ? '' : 'none';
    });
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'tables') renderTables();
    else if (activeTab === 'order') renderOrderTab();
    else if (activeTab === 'kitchen') { renderKitchen(); }
    else if (activeTab === 'bill') renderBill();
    else if (activeTab === 'menu') renderMenu();
  }

  function renderRestaurant() {
    const body = document.getElementById('restaurantBody'); if (!body) return;
    ensureData();
    const tabDefs = [['dashboard','📊 لوحة'],['tables','🍽️ الطاولات'],['kitchen','🍳 المطبخ'],['menu','📋 المنيو']];
    body.innerHTML = `
      <div class="rst-header">
        <div class="rst-tabs">${tabDefs.map(([k,l])=>`<button class="rst-tab-btn ${activeTab===k||((activeTab==='order'||activeTab==='bill')&&k==='tables')?'active':''}" data-tab="${k}" onclick="rstOpenTab('${k}')">${l}</button>`).join('')}</div>
      </div>
      <div id="rstDashBody"></div><div id="rstTablesBody"></div><div id="rstOrderBody"></div>
      <div id="rstKitchenBody"></div><div id="rstBillBody"></div><div id="rstMenuBody"></div>`;
    renderTabContent();
  }

  window.renderKitchen = renderKitchen;

  /* ─────────────── switchPage hook ─────────────── */
  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'restaurant') {
      // Core switchPage only activates pages in its built-in pageMap; like
      // pos/pharmacy/assets, this module activates its own section explicitly
      // so navigation actually shows it (otherwise the page stays hidden).
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageRestaurant'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navRestaurant'); if (nav) nav.classList.add('active');
        window.currentPage = 'restaurant';
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('restaurant');
      } catch (_) {}
      ensureData(); setTimeout(renderRestaurant, 0);
    }
  };

  /* ─────────────── Jarvis tool ─────────────── */
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_restaurant_today'] = function () {
          const r = R(); if (!r) return { error: 'restaurant not ready' };
          const today = new Date().toISOString().split('T')[0];
          const paidToday = ordersList().filter(o => o.status === 'paid' && o.createdAt.startsWith(today));
          return {
            revenueToday: paidToday.reduce((s, o) => s + o.total, 0),
            paidOrders: paidToday.length,
            activeOrders: ordersList().filter(o => ['new','preparing','ready','served'].includes(o.status)).length,
            occupiedTables: tablesList().filter(t => t.status === 'occupied').length,
            totalTables: tablesList().length
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['restaurant'] = '#pageRestaurant';
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis);
  else setTimeout(registerJarvis, 700);

  window.OctagonRestaurant = { render: renderRestaurant, ensureData };
})();
