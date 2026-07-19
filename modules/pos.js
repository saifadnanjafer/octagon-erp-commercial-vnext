/**
 * OCTAGON ERP — Point of Sale (POS) engine + Business-Type foundation (Phase 5).
 * Shared counter-sale screen reused by the pharmacy / retail / restaurant verticals.
 * Sells from the existing inventory (omni.materials), reduces stock via the existing
 * recordStockMovement, and posts cash income to finance via the existing
 * addFinanceTransaction (which syncs to the v6 account_moves). Add-only: wraps switchPage
 * for the 'pos' page and exposes pos* globals; touches no existing module.
 */
(function () {
  'use strict';

  /* ----------------------------- helpers ----------------------------- */
  function O() {
    if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni;
    if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} }
    return null;
  }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function money(n) { n = Number(n); return isFinite(n) ? Math.round(n) : 0; }
  function fmt(n) { return money(n).toLocaleString(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }

  const BUSINESS_TYPES = [
    { id: 'workshop', name: 'ورشة / تصنيع', icon: '🛠️' },
    { id: 'pharmacy', name: 'صيدلية', icon: '💊' },
    { id: 'retail', name: 'متجر / تجزئة', icon: '🛒' },
    { id: 'clinic', name: 'عيادة', icon: '🩺' },
    { id: 'restaurant', name: 'مطعم', icon: '🍽️' }
  ];

  // In-memory cart: materialId -> qty
  let cart = {};
  let searchTerm = '';
  let selectedCustomerId = '';
  let payMode = 'cash'; // 'cash' (income now) | 'account' (customer owes)

  /* ----------------------------- data ----------------------------- */
  function ensureData() {
    const o = O(); if (!o) return;
    if (!o.platform || typeof o.platform !== 'object') o.platform = {};
    if (!o.platform.businessType) o.platform.businessType = 'workshop';
    if (typeof o.platform.defaultMarkup !== 'number') o.platform.defaultMarkup = 1.3;
    if (!Array.isArray(o.posSales)) o.posSales = [];
  }
  function businessType() { ensureData(); return O().platform.businessType; }
  function products() {
    const o = O(); if (!o || !Array.isArray(o.materials)) return [];
    return o.materials;
  }
  function customers() {
    // Customers live in the bare `finance` global (like `omni`); read defensively.
    try {
      if (typeof window.ensureFinance === 'function') { try { window.ensureFinance(); } catch (_) {} }
      if (typeof finance !== 'undefined' && finance && Array.isArray(finance.customers)) return finance.customers;
    } catch (_) {}
    const o = O();
    return (o && Array.isArray(o.customers)) ? o.customers : [];
  }
  function priceOf(m) {
    const o = O();
    const markup = (o && o.platform && o.platform.defaultMarkup) || 1.3;
    const p = (m.salePrice != null) ? m.salePrice
      : (m.sellPrice != null) ? m.sellPrice
        : (m.price != null) ? m.price
          : Number(m.unitCost || 0) * markup;
    return money(p);
  }
  function cartLines() {
    const ps = products();
    return Object.keys(cart).map(id => {
      const m = ps.find(x => x.id === id);
      if (!m) return null;
      const qty = cart[id];
      const unit = priceOf(m);
      return { id, name: m.name || id, qty, unit, total: unit * qty, stock: Number(m.stock || 0), material: m };
    }).filter(Boolean);
  }
  function cartTotal() { return cartLines().reduce((s, l) => s + l.total, 0); }

  /* ----------------------------- actions ----------------------------- */
  window.posSetBusinessType = function (type) {
    ensureData();
    if (!BUSINESS_TYPES.some(b => b.id === type)) return;
    O().platform.businessType = type;
    save(); render();
    toast('تم ضبط نوع النشاط: ' + (BUSINESS_TYPES.find(b => b.id === type) || {}).name, 'success');
  };
  window.posSearch = function (v) {
    searchTerm = String(v || '').trim().toLowerCase();
    const grid = document.getElementById('posProductGrid');
    if (grid) grid.innerHTML = productGridHtml();
  };
  window.posAddToCart = function (id) {
    cart[id] = (cart[id] || 0) + 1;
    renderCart();
  };
  window.posChangeQty = function (id, delta) {
    cart[id] = (cart[id] || 0) + Number(delta);
    if (cart[id] <= 0) delete cart[id];
    renderCart();
  };
  window.posSetQty = function (id, val) {
    const q = Math.max(0, Math.floor(Number(val) || 0));
    if (q <= 0) delete cart[id]; else cart[id] = q;
    renderCart();
  };
  window.posRemoveLine = function (id) { delete cart[id]; renderCart(); };
  window.posClearCart = function () { cart = {}; renderCart(); };

  window.posScan = function (code) {
    code = String(code || '').trim();
    if (!code) return;
    const lc = code.toLowerCase();
    const m = products().find(x =>
      String(x.barcode || '') === code ||
      String(x.sku || x.SKU || '') === code ||
      String(x.name || '').toLowerCase() === lc);
    if (!m) { toast('لم يُعثر على منتج بالباركود: ' + code, 'warning'); return; }
    cart[m.id] = (cart[m.id] || 0) + 1;
    renderCart();
  };
  window.posScanEnter = function (ev) {
    if (ev && ev.key === 'Enter') { ev.preventDefault(); const v = ev.target.value; ev.target.value = ''; window.posScan(v); }
  };
  window.posSetCustomer = function (id) { selectedCustomerId = id || ''; };
  window.posSetPayMode = function (m) {
    payMode = (m === 'account') ? 'account' : 'cash';
    const box = document.querySelector('.pos-paymode');
    if (box) {
      const btns = box.querySelectorAll('button');
      btns.forEach(b => b.classList.remove('active'));
      const idx = (payMode === 'account') ? 1 : 0;
      if (btns[idx]) btns[idx].classList.add('active');
    }
  };

  window.posZReport = function () {
    const o = O(); if (!o) return;
    const sym = curSym();
    const todayStr = new Date().toDateString();
    const todays = (o.posSales || []).filter(s => new Date(s.date).toDateString() === todayStr);
    const total = todays.reduce((a, s) => a + money(s.total), 0);
    const cash = todays.filter(s => s.payMode !== 'account').reduce((a, s) => a + money(s.total), 0);
    const acct = total - cash;
    const org = (o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.name) || 'Octagon';
    const w = window.open('', '_blank', 'width=420,height=640');
    if (!w) { toast('فعّل النوافذ المنبثقة للطباعة', 'warning'); return; }
    w.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير اليوم Z</title>'
      + '<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Tahoma,sans-serif}body{padding:18px;color:#111;font-size:13px}'
      + 'h1{font-size:18px;text-align:center}.muted{color:#666;text-align:center;margin-bottom:14px}'
      + '.kpi{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #ccc;font-size:14px}'
      + '.kpi.big{font-size:18px;font-weight:800;border-bottom:2px solid #111}'
      + 'table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:4px;border-bottom:1px solid #eee;text-align:right;font-size:12px}'
      + '@media print{body{padding:8px}}</style></head><body>'
      + '<h1>⬡ ' + esc(org) + ' — تقرير اليوم (Z)</h1>'
      + '<div class="muted">' + new Date().toLocaleDateString('ar-IQ') + '</div>'
      + '<div class="kpi"><span>عدد المبيعات</span><span>' + todays.length + '</span></div>'
      + '<div class="kpi"><span>مبيعات نقدية</span><span>' + fmt(cash) + ' ' + sym + '</span></div>'
      + '<div class="kpi"><span>مبيعات آجلة</span><span>' + fmt(acct) + ' ' + sym + '</span></div>'
      + '<div class="kpi big"><span>الإجمالي</span><span>' + fmt(total) + ' ' + sym + '</span></div>'
      + '<table><thead><tr><th>المرجع</th><th>الوقت</th><th>النوع</th><th>المبلغ</th></tr></thead><tbody>'
      + todays.map(s => '<tr><td>' + esc(s.reference) + '</td><td>' + new Date(s.date).toLocaleTimeString('ar-IQ') + '</td><td>' + (s.payMode === 'account' ? 'آجل' : 'نقد') + '</td><td>' + fmt(s.total) + '</td></tr>').join('')
      + '</tbody></table>'
      + '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  };

  window.posCheckout = function () {
    ensureData();
    const lines = cartLines();
    if (!lines.length) { toast('السلة فارغة', 'warning'); return; }
    const onAccount = (payMode === 'account');
    if (onAccount && !selectedCustomerId) { toast('اختر عميلاً للبيع الآجل', 'warning'); return; }
    const o = O();
    const cust = customers().find(c => c.id === selectedCustomerId);
    const sale = {
      id: uid('possale'),
      reference: 'POS-' + new Date().getFullYear() + '-' + String((o.posSales.length + 1)).padStart(4, '0'),
      date: new Date().toISOString(),
      businessType: businessType(),
      customerId: selectedCustomerId || '',
      customerName: cust ? (cust.name || '') : '',
      payMode: onAccount ? 'account' : 'cash',
      lines: lines.map(l => ({ materialId: l.id, name: l.name, qty: l.qty, unitPrice: l.unit, total: l.total })),
      total: cartTotal(),
      paid: onAccount ? 0 : cartTotal()
    };
    // Reduce stock + record movement for each line (mirror receivePurchaseOrder's pattern).
    lines.forEach(l => {
      const m = l.material;
      m.stock = (Number(m.stock) || 0) - l.qty;
      m.lastMovementAt = sale.date;
      if (typeof window.recordStockMovement === 'function') {
        try {
          window.recordStockMovement(l.id, 'out', l.qty, {
            sourceType: 'pos', sourceId: sale.id,
            ref: 'بيع نقطة بيع ' + sale.reference,
            note: 'بيع ' + l.qty + ' بسعر ' + l.unit
          });
        } catch (e) { console.warn('POS stock movement failed', e); }
      }
    });
    o.posSales.unshift(sale);
    o.posSales = o.posSales.slice(0, 500);
    // Post to finance: cash = income now (not tied to a ledger); account = customer owes.
    if (typeof window.addFinanceTransaction === 'function' && sale.total > 0) {
      try {
        if (onAccount) {
          window.addFinanceTransaction({
            type: 'customer_charge', direction: 'neutral', sourceType: 'pos_sale', sourceId: sale.id,
            amount: sale.total, customerId: sale.customerId, partyName: sale.customerName,
            description: 'بيع آجل نقطة بيع ' + sale.reference
          }, { skipSave: true });
        } else {
          window.addFinanceTransaction({
            type: 'income', direction: 'in', sourceType: 'pos_sale', sourceId: sale.id,
            amount: sale.total, description: 'مبيعات نقطة بيع ' + sale.reference
          }, { skipSave: true });
        }
      } catch (e) { console.warn('POS finance post failed', e); }
    }
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'pos', source: 'pos', action: 'sale', summary: 'بيع ' + sale.reference + ' بمبلغ ' + fmt(sale.total), payload: { id: sale.id, total: sale.total } }); } catch (_) {}
    }
    cart = {};
    selectedCustomerId = '';
    payMode = 'cash';
    save(); render();
    toast('تم البيع ' + sale.reference + ' — ' + fmt(sale.total) + ' ' + curSym() + (onAccount ? ' (آجل)' : '') + ' 🧾', 'success');
    posPrintReceipt(sale.id);
  };

  window.posPrintReceipt = function (saleId) {
    const o = O(); if (!o) return;
    const sale = (o.posSales || []).find(s => s.id === saleId);
    if (!sale) return;
    const sym = curSym();
    const org = (o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.name) || 'Octagon';
    const w = window.open('', '_blank', 'width=380,height=600');
    if (!w) return;
    w.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>' + esc(sale.reference) + '</title>'
      + '<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Tahoma,sans-serif}body{padding:14px;width:300px;color:#111;font-size:12px}'
      + 'h1{font-size:16px;text-align:center;margin-bottom:4px}.muted{color:#666;text-align:center;font-size:11px;margin-bottom:10px}'
      + 'table{width:100%;border-collapse:collapse;margin:8px 0}td,th{padding:3px 2px;border-bottom:1px dashed #ccc;text-align:right;font-size:11px}'
      + '.tot{display:flex;justify-content:space-between;font-size:15px;font-weight:800;border-top:2px solid #111;padding-top:6px;margin-top:6px}'
      + '@media print{body{width:auto}}</style></head><body>'
      + '<h1>⬡ ' + esc(org) + '</h1><div class="muted">' + esc(sale.reference) + ' · ' + new Date(sale.date).toLocaleString('ar-IQ') + '</div>'
      + '<table><thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>مجموع</th></tr></thead><tbody>'
      + sale.lines.map(l => '<tr><td>' + esc(l.name) + '</td><td>' + l.qty + '</td><td>' + fmt(l.unitPrice) + '</td><td>' + fmt(l.total) + '</td></tr>').join('')
      + '</tbody></table><div class="tot"><span>الإجمالي</span><span>' + fmt(sale.total) + ' ' + sym + '</span></div>'
      + '<p style="text-align:center;margin-top:12px;color:#666">شكراً لتعاملكم معنا</p>'
      + '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  };

  /* ----------------------------- render ----------------------------- */
  function productGridHtml() {
    const sym = curSym();
    let list = products();
    if (searchTerm) list = list.filter(m => String(m.name || '').toLowerCase().includes(searchTerm) || String(m.sku || m.SKU || '').toLowerCase().includes(searchTerm));
    if (!list.length) return '<div class="pos-empty">لا توجد منتجات. أضِف مواد من صفحة المخزون.</div>';
    return list.slice(0, 200).map(m => {
      const price = priceOf(m);
      const stock = Number(m.stock || 0);
      const low = stock <= 0;
      return '<button class="pos-product" onclick="posAddToCart(\'' + m.id + '\')">'
        + '<div class="pos-product-name">' + esc(m.name || m.id) + '</div>'
        + '<div class="pos-product-meta"><span class="pos-product-price">' + fmt(price) + ' ' + sym + '</span>'
        + '<span class="pos-product-stock' + (low ? ' low' : '') + '">' + (low ? 'نفد' : ('مخزون ' + fmt(stock))) + '</span></div>'
        + '</button>';
    }).join('');
  }

  function cartHtml() {
    const sym = curSym();
    const lines = cartLines();
    if (!lines.length) return '<div class="pos-cart-empty">السلة فارغة — اضغط على منتج لإضافته</div>';
    return lines.map(l => '<div class="pos-cart-line' + (l.qty > l.stock ? ' over' : '') + '">'
      + '<div class="pos-cart-line-top"><span class="pos-cart-name">' + esc(l.name) + '</span>'
      + '<button class="pos-cart-x" onclick="posRemoveLine(\'' + l.id + '\')">✕</button></div>'
      + '<div class="pos-cart-line-bot">'
      + '<div class="pos-qty"><button onclick="posChangeQty(\'' + l.id + '\',-1)">−</button>'
      + '<input type="number" value="' + l.qty + '" min="0" onchange="posSetQty(\'' + l.id + '\', this.value)">'
      + '<button onclick="posChangeQty(\'' + l.id + '\',1)">+</button></div>'
      + '<span class="pos-line-total">' + fmt(l.total) + ' ' + sym + '</span>'
      + '</div></div>').join('');
  }

  function renderCart() {
    const box = document.getElementById('posCartLines');
    if (box) box.innerHTML = cartHtml();
    const tot = document.getElementById('posCartTotal');
    if (tot) tot.textContent = fmt(cartTotal()) + ' ' + curSym();
  }

  function render() {
    const body = document.getElementById('posBody');
    if (!body) return;
    ensureData();
    const sym = curSym();
    const bt = businessType();
    const btName = (BUSINESS_TYPES.find(b => b.id === bt) || {}).name || bt;
    const recent = (O().posSales || []).slice(0, 8);
    body.innerHTML = ''
      + '<div class="pos-bizbar">'
      + '<span class="pos-bizbar-label">نوع النشاط:</span>'
      + BUSINESS_TYPES.map(b => '<button class="pos-biz-chip' + (b.id === bt ? ' active' : '') + '" onclick="posSetBusinessType(\'' + b.id + '\')">' + b.icon + ' ' + b.name + '</button>').join('')
      + '</div>'
      + '<div class="pos-layout">'
      + '  <div class="pos-products-pane">'
      + '    <div class="pos-input-row">'
      + '      <input class="pos-barcode" type="text" placeholder="📷 امسح الباركود ثم Enter..." onkeydown="posScanEnter(event)" autofocus>'
      + '      <input class="pos-search" type="text" placeholder="🔍 ابحث عن منتج..." oninput="posSearch(this.value)">'
      + '    </div>'
      + '    <div class="pos-product-grid" id="posProductGrid">' + productGridHtml() + '</div>'
      + '  </div>'
      + '  <div class="pos-cart-pane">'
      + '    <div class="pos-cart-head">🧾 نقطة البيع — ' + esc(btName) + '<button class="pos-z-btn" onclick="posZReport()" title="تقرير اليوم Z">Z</button></div>'
      + '    <div class="pos-cart-lines" id="posCartLines">' + cartHtml() + '</div>'
      + '    <div class="pos-cart-foot">'
      + '      <div class="pos-sale-options">'
      + '        <select class="pos-customer-select" onchange="posSetCustomer(this.value)">'
      + '          <option value="">عميل عابر (نقد)</option>'
      + customers().map(c => '<option value="' + c.id + '"' + (c.id === selectedCustomerId ? ' selected' : '') + '>' + esc(c.name || c.id) + '</option>').join('')
      + '        </select>'
      + '        <div class="pos-paymode">'
      + '          <button class="' + (payMode === 'cash' ? 'active' : '') + '" onclick="posSetPayMode(\'cash\')">نقد</button>'
      + '          <button class="' + (payMode === 'account' ? 'active' : '') + '" onclick="posSetPayMode(\'account\')">آجل</button>'
      + '        </div>'
      + '      </div>'
      + '      <div class="pos-cart-total-row"><span>الإجمالي</span><span id="posCartTotal">' + fmt(cartTotal()) + ' ' + sym + '</span></div>'
      + '      <div class="pos-cart-actions">'
      + '        <button class="pos-btn-clear" onclick="posClearCart()">تفريغ</button>'
      + '        <button class="pos-btn-pay" onclick="posCheckout()">💵 إتمام البيع</button>'
      + '      </div>'
      + '    </div>'
      + '    ' + (recent.length ? ('<div class="pos-recent"><div class="pos-recent-title">آخر المبيعات</div>'
      + recent.map(s => '<div class="pos-recent-row"><span>' + esc(s.reference) + '</span><span>' + fmt(s.total) + ' ' + sym + '</span><button onclick="posPrintReceipt(\'' + s.id + '\')" title="طباعة">🖨️</button></div>').join('')
      + '</div>') : '')
      + '  </div>'
      + '</div>';
  }

  /* ----------------------------- page wiring ----------------------------- */
  function activatePage() {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pagePOS'); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('navPOS'); if (nav) nav.classList.add('active');
    window.currentPage = 'pos';
    ensureData(); render();
  }
  function wireSwitch() {
    if (window.__ptxPosWrapped) return;
    if (typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'pos') { try { activatePage(); } catch (e) { console.warn('POS render error', e); } return; }
      return orig.apply(this, arguments);
    };
    window.__ptxPosWrapped = true;
  }
  function init() {
    wireSwitch();
    let dataReady = false;
    try { ensureData(); dataReady = !!O(); } catch (_) {}
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      wireSwitch();
      try { ensureData(); dataReady = !!O() || dataReady; } catch (_) {}
      if ((dataReady && window.__ptxPosWrapped) || tries > 80) { clearInterval(t); return; }
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  const api = { render, ensureData, businessType, open: function () { try { window.switchPage('pos'); } catch (_) {} } };
  window.OctagonPOS = api;
  window.PentagonPOS = api;
})();
