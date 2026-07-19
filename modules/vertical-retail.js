/**
 * OCTAGON ERP — Retail Shop Vertical (Phase 5, second industry vertical pack).
 * Complete retail operation on shared engines:
 *  - Product catalog: categories, shelf locations, barcode, reorder points.
 *  - Promotions engine: percent-off, fixed-amount, buy-X-get-Y — auto-applied at checkout.
 *  - Fast POS counter: barcode scan, cart, loyalty points (simple), cash/account payment.
 *  - Returns: reverse stock + finance with reason log.
 *  - Daily Z-report: wraps posZReport with retail-aware totals.
 *  - Low-stock / no-stock alert dashboard.
 *  - Sales stored in shared omni.posSales (businessType:'retail').
 *  - Money via addFinanceTransaction bridge (legacy → v6 account_moves).
 *  - Jarvis tool: report_retail_alerts self-registered.
 * Add-only: wraps switchPage (same pattern as vertical-pharmacy.js).
 */
(function () {
  'use strict';

  /* ─────────────────────────── helpers ─────────────────────────── */
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
  function orgName() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.name) || 'Octagon'; }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function checked(id) { const el = document.getElementById(id); return !!(el && el.checked); }
  function userName() {
    try { if (window.PentagonAuth && PentagonAuth.currentUser && PentagonAuth.currentUser.name) return PentagonAuth.currentUser.name; } catch (_) {}
    try { if (window.currentUser && window.currentUser.name) return window.currentUser.name; } catch (_) {}
    return 'مستخدم';
  }
  function customers() {
    try {
      if (typeof window.ensureFinance === 'function') { try { window.ensureFinance(); } catch (_) {} }
      if (typeof finance !== 'undefined' && finance && Array.isArray(finance.customers)) return finance.customers;
    } catch (_) {}
    const o = O(); return (o && Array.isArray(o.customers)) ? o.customers : [];
  }
  function hist(action, summary, payload) {
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'retail', source: 'retail', action, summary, payload: payload || {} }); } catch (_) {}
    }
  }

  /* ─────────────────────────── data layer ─────────────────────────── */
  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.retail || typeof o.retail !== 'object') o.retail = {};
    const r = o.retail;
    if (!Array.isArray(r.products)) r.products = [];
    if (!Array.isArray(r.promotions)) r.promotions = [];
    if (!Array.isArray(r.returns)) r.returns = [];
    if (!Array.isArray(r.loyaltyLedger)) r.loyaltyLedger = [];
    if (!r.settings || typeof r.settings !== 'object') r.settings = {};
    if (!r.settings.loyaltyRate) r.settings.loyaltyRate = 1;     // 1 point per 1000 IQD
    if (!r.settings.loyaltyRedeem) r.settings.loyaltyRedeem = 500; // 1 point = 500 IQD
    if (!r.settings.lowStockThreshold) r.settings.lowStockThreshold = 5;
    if (!Array.isArray(o.posSales)) o.posSales = [];
    return r;
  }
  function R() { return ensureData(); }
  function prods() {
    const r = R();
    const list = r ? r.products.filter(p => !p.archived) : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function allProds() {
    const r = R();
    const list = r ? r.products : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function promos() {
    const r = R();
    const list = r ? r.promotions : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function activePromos() { return promos().filter(p => p.active); }
  function getReturns() {
    const r = R();
    const list = r ? r.returns : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function getSales() {
    const o = O();
    const list = (o && o.posSales) ? o.posSales : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }

  /* ─────────────────────────── state ─────────────────────────── */
  let activeTab = 'dashboard';
  let cart = [];           // [{productId, name, qty, unitPrice, finalPrice, promoId, promoLabel}]
  let cartCustomerId = '';
  let cartPayMode = 'cash';
  let prodSearch = '';
  let prodCatFilter = 'all';
  let editingProdId = null;
  let editingPromoId = null;
  let returnSaleRef = '';

  /* ─────────────────────────── promotions engine ─────────────────────────── */
  function applyPromotions(cartLines) {
    const actives = activePromos();
    const now = Date.now();
    const result = cartLines.map(l => ({ ...l, promoId: null, promoLabel: '', finalPrice: l.unitPrice * l.qty }));

    actives.forEach(promo => {
      // date range check
      if (promo.startDate && new Date(promo.startDate).getTime() > now) return;
      if (promo.endDate && new Date(promo.endDate).getTime() < now) return;

      if (promo.type === 'percent_product') {
        result.forEach(l => {
          if (promo.productIds && promo.productIds.includes(l.productId)) {
            const disc = Math.round(l.unitPrice * l.qty * (promo.value / 100));
            l.finalPrice = l.unitPrice * l.qty - disc;
            l.promoId = promo.id;
            l.promoLabel = promo.name + ' (-' + promo.value + '%)';
          }
        });
      } else if (promo.type === 'percent_category') {
        result.forEach(l => {
          const prod = allProds().find(p => p.id === l.productId);
          if (prod && prod.category === promo.category) {
            const disc = Math.round(l.unitPrice * l.qty * (promo.value / 100));
            l.finalPrice = l.unitPrice * l.qty - disc;
            l.promoId = promo.id;
            l.promoLabel = promo.name + ' (-' + promo.value + '%)';
          }
        });
      } else if (promo.type === 'fixed_product') {
        result.forEach(l => {
          if (promo.productIds && promo.productIds.includes(l.productId)) {
            l.finalPrice = Math.max(0, l.unitPrice * l.qty - money(promo.value));
            l.promoId = promo.id;
            l.promoLabel = promo.name + ' (-' + fmt(promo.value) + ')';
          }
        });
      } else if (promo.type === 'buy_x_get_y') {
        // buy promo.buyQty of promo.productIds[0], get promo.getQty free
        if (!promo.productIds || !promo.productIds.length) return;
        const line = result.find(l => promo.productIds.includes(l.productId));
        if (!line) return;
        const freeUnits = Math.floor(line.qty / (promo.buyQty || 1)) * (promo.getQty || 1);
        if (!freeUnits) return; // not enough qty to trigger — don't override other promos
        const paidUnits = Math.max(0, line.qty - freeUnits);
        line.finalPrice = paidUnits * line.unitPrice;
        line.promoId = promo.id;
        line.promoLabel = promo.name + ' (اشترِ ' + promo.buyQty + ' واحصل على ' + promo.getQty + ' مجاناً)';
      } else if (promo.type === 'cart_total') {
        // discount on total when cart >= minTotal
        const total = result.reduce((s, l) => s + l.finalPrice, 0);
        if (total >= money(promo.minTotal || 0)) {
          const disc = promo.discountType === 'percent'
            ? Math.round(total * (promo.value / 100))
            : money(promo.value);
          // spread proportionally
          const ratio = disc / total;
          result.forEach(l => { l.finalPrice = Math.round(l.finalPrice * (1 - ratio)); });
          result[0].promoLabel = (result[0].promoLabel || '') + ' + ' + promo.name;
        }
      }
    });
    return result;
  }

  /* ─────────────────────────── cart helpers ─────────────────────────── */
  function cartTotal() { return cart.reduce((s, l) => s + l.finalPrice, 0); }
  function cartDiscount() {
    return cart.reduce((s, l) => s + (l.unitPrice * l.qty - l.finalPrice), 0);
  }
  function recalcCart() {
    const raw = cart.map(l => ({ ...l, finalPrice: l.unitPrice * l.qty, promoId: null, promoLabel: '' }));
    const applied = applyPromotions(raw);
    cart = applied;
  }

  /* ─────────────────────────── cart actions ─────────────────────────── */
  window.rtAddToCart = function (productId) {
    const p = allProds().find(x => x.id === productId);
    if (!p) return;
    const existing = cart.find(l => l.productId === productId);
    if (existing) { existing.qty++; }
    else { cart.push({ productId, name: p.name, qty: 1, unitPrice: money(p.salePrice), finalPrice: money(p.salePrice), unit: p.unit || 'قطعة', promoId: null, promoLabel: '' }); }
    recalcCart();
    renderCart();
  };

  window.rtChangeQty = function (productId, delta) {
    const line = cart.find(l => l.productId === productId);
    if (!line) return;
    line.qty = Math.max(0, line.qty + delta);
    if (line.qty === 0) cart = cart.filter(l => l.productId !== productId);
    recalcCart(); renderCart();
  };

  window.rtSetQty = function (productId, val) {
    const qty = Math.max(0, parseInt(val) || 0);
    if (qty === 0) { cart = cart.filter(l => l.productId !== productId); }
    else { const line = cart.find(l => l.productId === productId); if (line) line.qty = qty; }
    recalcCart(); renderCart();
  };

  window.rtRemoveLine = function (productId) {
    cart = cart.filter(l => l.productId !== productId);
    recalcCart(); renderCart();
  };

  window.rtClearCart = function () {
    cart = []; cartCustomerId = ''; cartPayMode = 'cash';
    recalcCart(); renderCart();
  };

  window.rtScan = function () {
    const bc = val('rtScanInput');
    if (!bc) return;
    const p = allProds().find(x => x.barcode === bc);
    if (!p) { toast('لم يُعثر على صنف بهذا الباركود: ' + bc, 'warning'); return; }
    window.rtAddToCart(p.id);
    const el = document.getElementById('rtScanInput'); if (el) el.value = '';
    toast('تم إضافة: ' + p.name, 'success');
  };

  window.rtScanEnter = function (e) { if (e && e.key === 'Enter') window.rtScan(); };

  window.rtSetPayMode = function (mode) {
    cartPayMode = mode;
    ['cash', 'account'].forEach(m => {
      const btn = document.getElementById('rtPayBtn_' + m);
      if (btn) btn.classList.toggle('active', m === mode);
    });
  };

  window.rtSetCustomer = function (val) { cartCustomerId = val; };

  /* ─────────────────────────── checkout ─────────────────────────── */
  window.rtCheckout = function () {
    if (!cart.length) { toast('السلة فارغة', 'warning'); return; }
    const r = R(); const o = O(); if (!r || !o) return;

    if (cartPayMode === 'account' && !cartCustomerId) {
      toast('حدد العميل للبيع الآجل', 'warning'); return;
    }

    const total = cartTotal();
    const discount = cartDiscount();
    const saleId = uid('RT');
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const ref = 'RT-' + new Date().getFullYear() + '-' + String((getSales().filter(s => s.businessType === 'retail').length + 1)).padStart(4, '0');
    const at = new Date().toISOString();
    const operator = userName();

    // stock reduction
    cart.forEach(line => {
      const prod = allProds().find(p => p.id === line.productId);
      if (prod) {
        prod.stock = Math.max(0, (prod.stock || 0) - line.qty);
        prod.soldQty = (prod.soldQty || 0) + line.qty;
      }
      if (typeof window.recordStockMovement === 'function') {
        try { window.recordStockMovement('out', line.productId, line.qty, 'retail_sale', saleId); } catch (_) {}
      }
    });

    // finance posting
    const txnBase = { id: uid('rtxn'), amount: total, at, sourceType: 'retail_sale', sourceId: saleId, note: ref + ' — مبيعات المتجر', by: operator, companyId: coId };
    if (typeof window.addFinanceTransaction === 'function') {
      try {
        if (cartPayMode === 'cash') {
          window.addFinanceTransaction({ ...txnBase, type: 'income', category: 'مبيعات المتجر' });
        } else {
          const cust = customers().find(c => c.id === cartCustomerId);
          window.addFinanceTransaction({ ...txnBase, type: 'customer_charge', category: 'مبيعات المتجر', personId: cartCustomerId, personName: cust ? cust.name : cartCustomerId });
        }
      } catch (_) {}
    }

    // loyalty points
    const custId = cartCustomerId || null;
    if (custId && r.settings.loyaltyRate) {
      const pts = Math.floor(total / 1000 * r.settings.loyaltyRate);
      if (pts > 0) {
        r.loyaltyLedger.push({ id: uid('lyl'), customerId: custId, pts, type: 'earn', ref, at, companyId: coId });
        const cust = customers().find(c => c.id === custId);
        if (cust) cust.loyaltyPoints = (cust.loyaltyPoints || 0) + pts;
      }
    }

    // sale record
    const sale = { id: saleId, ref, businessType: 'retail', lines: cart.map(l => ({ ...l })), total, discount, payMode: cartPayMode, customerId: custId, operator, at, promoIds: [...new Set(cart.map(l => l.promoId).filter(Boolean))], companyId: coId };
    o.posSales.push(sale);

    hist('checkout', ref + ' — ' + fmt(total) + ' ' + curSym(), { saleId, total, lines: cart.length });
    save();
    toast(ref + ' ✓ — ' + fmt(total) + ' ' + curSym(), 'success');

    // receipt
    printRetailReceipt(sale);

    window.rtClearCart();
    renderSalesList();
  };

  /* ─────────────────────────── receipt ─────────────────────────── */
  function printRetailReceipt(sale) {
    const org = orgName(); const cur = curSym();
    const lines = sale.lines.map(l =>
      `<tr><td>${esc(l.name)}</td><td>${l.qty} ${esc(l.unit || '')}</td><td>${fmt(l.unitPrice)}</td><td>${fmt(l.finalPrice)}</td>${l.promoLabel ? '<td class="promo-label">🏷️ ' + esc(l.promoLabel) + '</td>' : '<td></td>'}</tr>`
    ).join('');
    const html = `<html dir="rtl"><head><meta charset="UTF-8"><title>إيصال</title>
    <style>body{font-family:Tajawal,sans-serif;padding:20px;max-width:400px;margin:auto}
    h2{text-align:center}table{width:100%;border-collapse:collapse}
    th,td{border:1px solid #ccc;padding:4px 8px;font-size:13px}
    .promo-label{color:#16a34a;font-size:11px}.total{font-size:16px;font-weight:700}
    .disc{color:#dc2626}.footer{margin-top:16px;text-align:center;font-size:12px;color:#666}</style></head>
    <body><h2>${esc(org)}</h2><p style="text-align:center">${sale.ref} — ${new Date(sale.at).toLocaleString('ar-IQ')}</p>
    <table><thead><tr><th>الصنف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th><th>العرض</th></tr></thead>
    <tbody>${lines}</tbody></table>
    ${sale.discount > 0 ? '<p class="disc">الخصم: -' + fmt(sale.discount) + ' ' + cur + '</p>' : ''}
    <p class="total">الإجمالي: ${fmt(sale.total)} ${cur}</p>
    <p>طريقة الدفع: ${sale.payMode === 'cash' ? 'نقداً' : 'آجل'}</p>
    <p class="footer">شكراً لزيارتكم — ${esc(org)}</p>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),1500)}<\/script>
    </body></html>`;
    try { const w = window.open('', '_blank', 'width=450,height=650'); if (w) { w.document.write(html); w.document.close(); } } catch (_) {}
  }

  /* ─────────────────────────── returns ─────────────────────────── */
  window.rtFindSale = function () {
    returnSaleRef = val('rtReturnRef');
    renderReturnForm();
  };

  window.rtProcessReturn = function (saleId, lineProductId, qty, reason) {
    const o = O(); const r = R(); if (!o || !r) return;
    const sale = getSales().find(s => s.id === saleId);
    if (!sale) { toast('بيع غير موجود', 'error'); return; }
    const line = sale.lines.find(l => l.productId === lineProductId);
    if (!line) { toast('صنف غير موجود في هذا البيع', 'error'); return; }
    const returnQty = Math.min(qty, line.qty);
    const refundAmount = Math.round(line.finalPrice * (returnQty / line.qty));

    // restock
    const prod = allProds().find(p => p.id === lineProductId);
    if (prod) { prod.stock = (prod.stock || 0) + returnQty; prod.soldQty = Math.max(0, (prod.soldQty || 0) - returnQty); }

    // reverse finance
    const rtId = uid('rret');
    const coId = sale.companyId || (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    if (typeof window.addFinanceTransaction === 'function') {
      try { window.addFinanceTransaction({ id: rtId, type: 'expense', amount: refundAmount, category: 'مرتجعات المتجر', note: 'مرتجع من ' + sale.ref + ' — ' + esc(reason), sourceType: 'retail_return', sourceId: rtId, at: new Date().toISOString(), by: userName(), companyId: coId }); } catch (_) {}
    }

    r.returns.push({ id: rtId, saleId, ref: sale.ref, productId: lineProductId, productName: line.name, qty: returnQty, refundAmount, reason: reason || '', at: new Date().toISOString(), by: userName(), companyId: coId });
    hist('return', 'مرتجع ' + line.name + ' × ' + returnQty + ' من ' + sale.ref, { saleId, productId: lineProductId, returnQty, refundAmount });
    save();
    toast('تم استقبال المرتجع — استرداد ' + fmt(refundAmount) + ' ' + curSym(), 'success');
    returnSaleRef = '';
    renderReturn();
  };

  /* ─────────────────────────── product CRUD ─────────────────────────── */
  window.rtOpenProdForm = function (id) {
    editingProdId = id || null;
    renderProdForm();
  };

  window.rtSaveProd = function () {
    const r = R(); if (!r) return;
    const name = val('rtProdName');
    if (!name) { toast('اسم الصنف مطلوب', 'warning'); return; }
    const salePrice = numVal('rtProdSalePrice');
    if (!salePrice) { toast('سعر البيع مطلوب', 'warning'); return; }

    if (editingProdId) {
      const p = allProds().find(x => x.id === editingProdId);
      if (p) {
        p.name = name; p.barcode = val('rtProdBarcode'); p.category = val('rtProdCategory');
        p.shelf = val('rtProdShelf'); p.salePrice = salePrice; p.cost = numVal('rtProdCost');
        p.unit = val('rtProdUnit') || 'قطعة'; p.minStock = numVal('rtProdMinStock');
        p.stock = numVal('rtProdStock'); p.tags = val('rtProdTags');
        toast('تم تحديث ' + name, 'success');
      }
    } else {
      const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
      r.products.push({
        id: uid('rtp'), name, barcode: val('rtProdBarcode'), category: val('rtProdCategory'),
        shelf: val('rtProdShelf'), salePrice, cost: numVal('rtProdCost'),
        unit: val('rtProdUnit') || 'قطعة', minStock: numVal('rtProdMinStock'),
        stock: numVal('rtProdStock'), soldQty: 0, tags: val('rtProdTags'), archived: false,
        createdAt: new Date().toISOString(), companyId: coId
      });
      toast('تم إضافة ' + name, 'success');
    }
    editingProdId = null;
    hist('product_save', name);
    save(); renderProducts();
  };

  window.rtCancelProdForm = function () { editingProdId = null; renderProducts(); };

  window.rtToggleArchiveProd = function (id) {
    const p = allProds().find(x => x.id === id);
    if (!p) return;
    p.archived = !p.archived;
    toast((p.archived ? 'تم أرشفة ' : 'تم إعادة تفعيل ') + p.name, 'info');
    save(); renderProducts();
  };

  /* ─────────────────────────── promo CRUD ─────────────────────────── */
  window.rtOpenPromoForm = function (id) { editingPromoId = id || null; renderPromoForm(); };

  window.rtSavePromo = function () {
    const r = R(); if (!r) return;
    const name = val('rtPromoName');
    const type = val('rtPromoType');
    if (!name || !type) { toast('اسم ونوع العرض مطلوبان', 'warning'); return; }

    const base = {
      name, type, value: numVal('rtPromoValue'), active: checked('rtPromoActive'),
      startDate: val('rtPromoStart'), endDate: val('rtPromoEnd'),
      minTotal: numVal('rtPromoMinTotal'), buyQty: numVal('rtPromoBuyQty') || 1,
      getQty: numVal('rtPromoGetQty') || 1, discountType: val('rtPromoDiscType') || 'percent',
      category: val('rtPromoCategory'),
      productIds: val('rtPromoProducts').split(',').map(s => s.trim()).filter(Boolean)
    };

    if (editingPromoId) {
      const idx = r.promotions.findIndex(p => p.id === editingPromoId);
      if (idx >= 0) r.promotions[idx] = { ...r.promotions[idx], ...base };
      toast('تم تحديث العرض: ' + name, 'success');
    } else {
      const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
      r.promotions.push({ id: uid('rpr'), ...base, createdAt: new Date().toISOString(), companyId: coId });
      toast('تم إضافة العرض: ' + name, 'success');
    }
    editingPromoId = null;
    save(); renderPromos();
  };

  window.rtCancelPromoForm = function () { editingPromoId = null; renderPromos(); };

  window.rtTogglePromo = function (id) {
    const p = promos().find(x => x.id === id);
    if (!p) return;
    p.active = !p.active;
    toast((p.active ? 'تم تفعيل' : 'تم إيقاف') + ' العرض: ' + p.name, 'info');
    save(); renderPromos();
  };

  window.rtDeletePromo = function (id) {
    const r = R(); if (!r) return;
    r.promotions = r.promotions.filter(p => p.id !== id);
    save(); renderPromos();
  };

  /* ─────────────────────────── Z-report ─────────────────────────── */
  window.rtZReport = function () {
    const o = O(); if (!o) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todaySales = (o.posSales || []).filter(s => s.businessType === 'retail' && new Date(s.at) >= today);
    const total = todaySales.reduce((s, x) => s + x.total, 0);
    const discount = todaySales.reduce((s, x) => s + (x.discount || 0), 0);
    const cashSales = todaySales.filter(s => s.payMode === 'cash').reduce((s, x) => s + x.total, 0);
    const accountSales = todaySales.filter(s => s.payMode === 'account').reduce((s, x) => s + x.total, 0);

    // product breakdown
    const breakdown = {};
    todaySales.forEach(s => s.lines.forEach(l => {
      if (!breakdown[l.name]) breakdown[l.name] = { qty: 0, total: 0 };
      breakdown[l.name].qty += l.qty; breakdown[l.name].total += l.finalPrice;
    }));
    const rows = Object.entries(breakdown).sort((a, b) => b[1].total - a[1].total)
      .map(([name, d]) => `<tr><td>${esc(name)}</td><td>${d.qty}</td><td>${fmt(d.total)} ${curSym()}</td></tr>`).join('');

    const cur = curSym(); const org = orgName();
    const html = `<html dir="rtl"><head><meta charset="UTF-8"><title>Z-Report المتجر</title>
    <style>body{font-family:Tajawal,sans-serif;padding:20px;max-width:500px;margin:auto}
    h2,h3{text-align:center}table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{border:1px solid #ccc;padding:4px 8px;font-size:13px}.total-row{font-weight:700;background:#f3f4f6}</style></head>
    <body><h2>${esc(org)} — Z-Report المتجر</h2>
    <p style="text-align:center">${today.toLocaleDateString('ar-IQ')}</p>
    <table><tr class="total-row"><td>إجمالي المبيعات</td><td>${fmt(total)} ${cur}</td></tr>
    <tr><td>نقداً</td><td>${fmt(cashSales)} ${cur}</td></tr>
    <tr><td>آجل</td><td>${fmt(accountSales)} ${cur}</td></tr>
    <tr><td>إجمالي الخصومات</td><td>-${fmt(discount)} ${cur}</td></tr>
    <tr><td>عدد الفواتير</td><td>${todaySales.length}</td></tr></table>
    <h3>أكثر الأصناف مبيعاً</h3>
    <table><thead><tr><th>الصنف</th><th>الكمية</th><th>الإيراد</th></tr></thead><tbody>${rows}</tbody></table>
    <script>window.onload=()=>{window.print();setTimeout(()=>window.close(),1500)}<\/script>
    </body></html>`;
    try { const w = window.open('', '_blank', 'width=550,height=750'); if (w) { w.document.write(html); w.document.close(); } } catch (_) {}
    hist('z_report', 'Z-Report — ' + fmt(total) + ' ' + cur);
  };

  /* ─────────────────────────── demo data ─────────────────────────── */
  window.rtLoadDemo = function () {
    const r = R(); if (!r) return;
    if (allProds().length) { toast('البيانات التجريبية موجودة مسبقاً', 'info'); return; }
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const demo = [
      { name: 'قميص قطن رجالي', barcode: '60001', category: 'ملابس', shelf: 'A1', salePrice: 15000, cost: 8000, unit: 'قطعة', stock: 30, minStock: 5 },
      { name: 'بنطلون جينز', barcode: '60002', category: 'ملابس', shelf: 'A2', salePrice: 25000, cost: 14000, unit: 'قطعة', stock: 20, minStock: 3 },
      { name: 'حذاء رياضي', barcode: '60003', category: 'أحذية', shelf: 'B1', salePrice: 45000, cost: 25000, unit: 'زوج', stock: 15, minStock: 3 },
      { name: 'حقيبة يد نسائية', barcode: '60004', category: 'إكسسوارات', shelf: 'C1', salePrice: 35000, cost: 18000, unit: 'قطعة', stock: 12, minStock: 2 },
      { name: 'ساعة يد', barcode: '60005', category: 'إكسسوارات', shelf: 'C2', salePrice: 75000, cost: 40000, unit: 'قطعة', stock: 8, minStock: 2 },
      { name: 'عطر رجالي 100مل', barcode: '60006', category: 'عناية', shelf: 'D1', salePrice: 30000, cost: 15000, unit: 'علبة', stock: 25, minStock: 5 },
    ];
    demo.forEach(d => r.products.push({ id: uid('rtp'), ...d, soldQty: 0, tags: '', archived: false, createdAt: new Date().toISOString(), companyId: coId }));

    // demo promotions
    r.promotions.push({
      id: uid('rpr'), name: 'خصم 10% على الملابس', type: 'percent_category', value: 10,
      category: 'ملابس', active: true, startDate: '', endDate: '', createdAt: new Date().toISOString(), companyId: coId
    });
    r.promotions.push({
      id: uid('rpr'), name: 'اشترِ 2 واحصل على 1 مجاناً', type: 'buy_x_get_y',
      productIds: [r.products[0].id], buyQty: 2, getQty: 1, value: 0, active: true,
      startDate: '', endDate: '', createdAt: new Date().toISOString(), companyId: coId
    });

    save(); toast('تم تحميل بيانات تجريبية: 6 أصناف + 2 عروض', 'success');
    rtRender();
  };

  window.rtRemoveDemo = function () {
    const r = R(); if (!r) return;
    r.products = r.products.filter(p => !p.barcode || !p.barcode.startsWith('600'));
    r.promotions = [];
    save(); toast('تم حذف البيانات التجريبية', 'info');
    rtRender();
  };

  /* ─────────────────────────── tabs ─────────────────────────── */
  window.rtOpenTab = function (tab) {
    activeTab = tab;
    document.querySelectorAll('.rt-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderTabContent();
  };

  /* ─────────────────────────── render helpers ─────────────────────────── */
  function categories() {
    const cats = new Set(allProds().map(p => p.category).filter(Boolean));
    return [...cats].sort();
  }

  function renderCart() {
    const el = document.getElementById('rtCartBody'); if (!el) return;
    if (!cart.length) {
      el.innerHTML = '<div class="rt-empty-cart">🛒 السلة فارغة</div>';
      const tot = document.getElementById('rtCartTotal'); if (tot) tot.textContent = '0';
      const disc = document.getElementById('rtCartDiscount'); if (disc) disc.parentElement && (disc.parentElement.style.display = 'none');
      return;
    }
    el.innerHTML = cart.map(l => `
      <div class="rt-cart-line">
        <div class="rt-cart-line-name">${esc(l.name)}<br>${l.promoLabel ? '<span class="rt-promo-tag">🏷️ ' + esc(l.promoLabel) + '</span>' : ''}</div>
        <div class="rt-cart-qty">
          <button onclick="rtChangeQty('${l.productId}',-1)">−</button>
          <input type="number" value="${l.qty}" min="1" onchange="rtSetQty('${l.productId}',this.value)" style="width:48px;text-align:center">
          <button onclick="rtChangeQty('${l.productId}',1)">+</button>
        </div>
        <div class="rt-cart-price">${fmt(l.finalPrice)} ${curSym()}</div>
        <button class="rt-cart-remove" onclick="rtRemoveLine('${l.productId}')">✕</button>
      </div>`).join('');
    const tot = document.getElementById('rtCartTotal'); if (tot) tot.textContent = fmt(cartTotal());
    const disc = cartDiscount();
    const discEl = document.getElementById('rtCartDiscount');
    if (discEl) { discEl.textContent = fmt(disc); discEl.parentElement && (discEl.parentElement.style.display = disc > 0 ? '' : 'none'); }
  }

  function renderSalesList() {
    const el = document.getElementById('rtRecentSales'); if (!el) return;
    const o = O(); if (!o) return;
    const retailSales = getSales().filter(s => s.businessType === 'retail').slice(-15).reverse();
    if (!retailSales.length) { el.innerHTML = '<div class="rt-empty">لا توجد مبيعات اليوم</div>'; return; }
    el.innerHTML = retailSales.map(s => `
      <div class="rt-sale-row">
        <span class="rt-sale-ref">${esc(s.ref)}</span>
        <span class="rt-sale-lines">${s.lines.length} صنف</span>
        <span class="rt-sale-total">${fmt(s.total)} ${curSym()}</span>
        <span class="rt-sale-mode">${s.payMode === 'cash' ? '💵' : '📋'}</span>
      </div>`).join('');
  }

  function renderProdForm() {
    const el = document.getElementById('rtProductsBody'); if (!el) return;
    const p = editingProdId ? allProds().find(x => x.id === editingProdId) : null;
    const cats = categories();
    el.innerHTML = `
      <div class="rt-form-card">
        <h3>${p ? 'تعديل: ' + esc(p.name) : 'إضافة صنف جديد'}</h3>
        <div class="rt-form-grid">
          <div class="rt-field"><label>اسم الصنف *</label><input id="rtProdName" value="${esc(p ? p.name : '')}"></div>
          <div class="rt-field"><label>الباركود</label><input id="rtProdBarcode" value="${esc(p ? p.barcode || '' : '')}"></div>
          <div class="rt-field"><label>التصنيف</label>
            <input id="rtProdCategory" list="rtCatList" value="${esc(p ? p.category || '' : '')}">
            <datalist id="rtCatList">${cats.map(c => '<option value="' + esc(c) + '">').join('')}</datalist>
          </div>
          <div class="rt-field"><label>الرف / الموقع</label><input id="rtProdShelf" value="${esc(p ? p.shelf || '' : '')}"></div>
          <div class="rt-field"><label>سعر البيع *</label><input id="rtProdSalePrice" type="number" value="${p ? p.salePrice : ''}"></div>
          <div class="rt-field"><label>التكلفة</label><input id="rtProdCost" type="number" value="${p ? p.cost || '' : ''}"></div>
          <div class="rt-field"><label>الوحدة</label><input id="rtProdUnit" value="${esc(p ? p.unit || 'قطعة' : 'قطعة')}"></div>
          <div class="rt-field"><label>الكمية الحالية</label><input id="rtProdStock" type="number" value="${p ? p.stock || 0 : 0}"></div>
          <div class="rt-field"><label>حد إعادة الطلب</label><input id="rtProdMinStock" type="number" value="${p ? p.minStock || 5 : 5}"></div>
          <div class="rt-field"><label>وسوم (مفصولة بفاصلة)</label><input id="rtProdTags" value="${esc(p ? p.tags || '' : '')}"></div>
        </div>
        <div class="rt-form-actions">
          <button class="btn-primary" onclick="rtSaveProd()">💾 حفظ</button>
          <button class="btn-secondary" onclick="rtCancelProdForm()">إلغاء</button>
        </div>
      </div>`;
  }

  function renderProducts() {
    const el = document.getElementById('rtProductsBody'); if (!el) return;
    if (editingProdId !== null && editingProdId !== undefined) { renderProdForm(); return; }

    const search = prodSearch.toLowerCase();
    const list = allProds().filter(p => {
      if (prodCatFilter !== 'all' && p.category !== prodCatFilter) return false;
      if (search && !p.name.toLowerCase().includes(search) && !(p.barcode || '').includes(search)) return false;
      return true;
    });
    const cats = categories();

    el.innerHTML = `
      <div class="rt-toolbar">
        <input class="rt-search" placeholder="بحث بالاسم أو الباركود..." value="${esc(prodSearch)}" oninput="rtProdSearch(this.value)">
        <select onchange="rtProdCatFilter(this.value)">
          <option value="all" ${prodCatFilter === 'all' ? 'selected' : ''}>كل التصنيفات</option>
          ${cats.map(c => `<option value="${esc(c)}" ${prodCatFilter === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <button class="btn-primary" onclick="rtOpenProdForm(null)">+ إضافة صنف</button>
        <button class="btn-ghost" onclick="rtLoadDemo()">بيانات تجريبية</button>
        <button class="btn-ghost btn-danger" onclick="rtRemoveDemo()">حذف التجريبية</button>
      </div>
      <div class="rt-prod-grid">
        ${list.length ? list.map(p => {
          const lowStock = (p.stock || 0) <= (p.minStock || 5);
          return `<div class="rt-prod-card ${p.archived ? 'archived' : ''} ${lowStock ? 'low-stock' : ''}">
            <div class="rt-prod-top">
              <span class="rt-prod-cat">${esc(p.category || '—')}</span>
              ${p.shelf ? '<span class="rt-prod-shelf">📦 ' + esc(p.shelf) + '</span>' : ''}
              ${lowStock ? '<span class="rt-stock-badge">⚠️ مخزون منخفض</span>' : ''}
            </div>
            <div class="rt-prod-name">${esc(p.name)}</div>
            ${p.barcode ? '<div class="rt-prod-barcode">🔖 ' + esc(p.barcode) + '</div>' : ''}
            <div class="rt-prod-price">${fmt(p.salePrice)} ${curSym()}</div>
            <div class="rt-prod-stock">متوفر: <strong>${p.stock || 0}</strong> ${esc(p.unit || '')}</div>
            <div class="rt-prod-actions">
              <button onclick="rtOpenProdForm('${p.id}')">✏️ تعديل</button>
              <button onclick="rtAddToCart('${p.id}')" ${p.archived ? 'disabled' : ''}>🛒 أضف</button>
              <button onclick="rtToggleArchiveProd('${p.id}')" class="btn-ghost">${p.archived ? '♻️' : '🗃️'}</button>
            </div>
          </div>`;
        }).join('') : '<div class="rt-empty">لا توجد أصناف</div>'}
      </div>`;
  }

  window.rtProdSearch = function (v) { prodSearch = v; renderProducts(); };
  window.rtProdCatFilter = function (v) { prodCatFilter = v; renderProducts(); };

  function renderPromoForm() {
    const el = document.getElementById('rtPromosBody'); if (!el) return;
    const pr = editingPromoId ? promos().find(x => x.id === editingPromoId) : null;
    const cats = categories();
    el.innerHTML = `
      <div class="rt-form-card">
        <h3>${pr ? 'تعديل عرض' : 'إضافة عرض جديد'}</h3>
        <div class="rt-form-grid">
          <div class="rt-field"><label>اسم العرض *</label><input id="rtPromoName" value="${esc(pr ? pr.name : '')}"></div>
          <div class="rt-field"><label>نوع العرض *</label>
            <select id="rtPromoType">
              <option value="percent_product" ${(!pr || pr.type === 'percent_product') ? 'selected' : ''}>خصم % على منتج</option>
              <option value="percent_category" ${pr && pr.type === 'percent_category' ? 'selected' : ''}>خصم % على تصنيف</option>
              <option value="fixed_product" ${pr && pr.type === 'fixed_product' ? 'selected' : ''}>خصم مبلغ ثابت</option>
              <option value="buy_x_get_y" ${pr && pr.type === 'buy_x_get_y' ? 'selected' : ''}>اشترِ X واحصل على Y</option>
              <option value="cart_total" ${pr && pr.type === 'cart_total' ? 'selected' : ''}>خصم على الفاتورة الكلية</option>
            </select>
          </div>
          <div class="rt-field"><label>القيمة (% أو مبلغ)</label><input id="rtPromoValue" type="number" value="${pr ? pr.value || '' : ''}"></div>
          <div class="rt-field"><label>التصنيف (لخصم التصنيف)</label>
            <input id="rtPromoCategory" list="rtPromoCatList" value="${esc(pr ? pr.category || '' : '')}">
            <datalist id="rtPromoCatList">${cats.map(c => '<option value="' + esc(c) + '">').join('')}</datalist>
          </div>
          <div class="rt-field"><label>معرّفات المنتجات (مفصولة بفاصلة)</label><input id="rtPromoProducts" value="${esc(pr && pr.productIds ? pr.productIds.join(',') : '')}"></div>
          <div class="rt-field"><label>اشترِ (كمية)</label><input id="rtPromoBuyQty" type="number" value="${pr ? pr.buyQty || 1 : 1}"></div>
          <div class="rt-field"><label>احصل على (كمية مجانية)</label><input id="rtPromoGetQty" type="number" value="${pr ? pr.getQty || 1 : 1}"></div>
          <div class="rt-field"><label>حد الفاتورة الكلية (للعرض الكلي)</label><input id="rtPromoMinTotal" type="number" value="${pr ? pr.minTotal || '' : ''}"></div>
          <div class="rt-field"><label>نوع الخصم الكلي</label>
            <select id="rtPromoDiscType">
              <option value="percent" ${(!pr || pr.discountType === 'percent') ? 'selected' : ''}>نسبة %</option>
              <option value="fixed" ${pr && pr.discountType === 'fixed' ? 'selected' : ''}>مبلغ ثابت</option>
            </select>
          </div>
          <div class="rt-field"><label>تاريخ البداية</label><input id="rtPromoStart" type="date" value="${pr ? pr.startDate || '' : ''}"></div>
          <div class="rt-field"><label>تاريخ الانتهاء</label><input id="rtPromoEnd" type="date" value="${pr ? pr.endDate || '' : ''}"></div>
          <div class="rt-field" style="align-items:center;flex-direction:row;gap:8px">
            <input id="rtPromoActive" type="checkbox" ${(!pr || pr.active) ? 'checked' : ''}>
            <label for="rtPromoActive">فعّال الآن</label>
          </div>
        </div>
        <div class="rt-form-actions">
          <button class="btn-primary" onclick="rtSavePromo()">💾 حفظ</button>
          <button class="btn-secondary" onclick="rtCancelPromoForm()">إلغاء</button>
        </div>
      </div>`;
  }

  function renderPromos() {
    const el = document.getElementById('rtPromosBody'); if (!el) return;
    if (editingPromoId !== null && editingPromoId !== undefined) { renderPromoForm(); return; }
    const list = promos();
    const typeLabel = { percent_product: 'خصم % منتج', percent_category: 'خصم % تصنيف', fixed_product: 'مبلغ ثابت', buy_x_get_y: 'اشترِ X احصل Y', cart_total: 'خصم فاتورة' };
    el.innerHTML = `
      <div class="rt-toolbar"><button class="btn-primary" onclick="rtOpenPromoForm(null)">+ عرض جديد</button></div>
      ${list.length ? `<table class="rt-table">
        <thead><tr><th>اسم العرض</th><th>النوع</th><th>القيمة</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>${list.map(p => `<tr class="${p.active ? '' : 'rt-row-inactive'}">
          <td>${esc(p.name)}</td>
          <td>${typeLabel[p.type] || p.type}</td>
          <td>${p.value || '—'}</td>
          <td><span class="rt-status-badge ${p.active ? 'active' : 'inactive'}">${p.active ? 'فعّال' : 'متوقف'}</span></td>
          <td>
            <button onclick="rtOpenPromoForm('${p.id}')">✏️</button>
            <button onclick="rtTogglePromo('${p.id}')">${p.active ? '⏸️' : '▶️'}</button>
            <button onclick="rtDeletePromo('${p.id}')" class="btn-danger-sm">🗑️</button>
          </td>
        </tr>`).join('')}</tbody>
      </table>` : '<div class="rt-empty">لا توجد عروض</div>'}`;
  }

  function renderReturnForm() {
    const el = document.getElementById('rtReturnBody'); if (!el) return;
    const o = O(); if (!o) return;
    const sale = returnSaleRef ? getSales().find(s => s.ref === returnSaleRef && s.businessType === 'retail') : null;

    el.innerHTML = `
      <div class="rt-form-card">
        <h3>استقبال مرتجع</h3>
        <div class="rt-field" style="flex-direction:row;gap:8px;align-items:center">
          <input id="rtReturnRef" placeholder="رقم الفاتورة (RT-2026-0001)" value="${esc(returnSaleRef)}" style="flex:1">
          <button class="btn-primary" onclick="rtFindSale()">🔍 بحث</button>
        </div>
        ${sale ? `
          <p>الفاتورة: <strong>${esc(sale.ref)}</strong> — ${new Date(sale.at).toLocaleDateString('ar-IQ')} — ${fmt(sale.total)} ${curSym()}</p>
          <table class="rt-table">
            <thead><tr><th>الصنف</th><th>الكمية المباعة</th><th>كمية الإرجاع</th><th>السبب</th><th></th></tr></thead>
            <tbody>${sale.lines.map((l, i) => `<tr>
              <td>${esc(l.name)}</td><td>${l.qty}</td>
              <td><input id="rtRetQty_${i}" type="number" value="1" min="1" max="${l.qty}" style="width:60px"></td>
              <td><input id="rtRetReason_${i}" placeholder="سبب الإرجاع" style="width:140px"></td>
              <td><button class="btn-primary" onclick="rtProcessReturn('${sale.id}','${l.productId}',parseInt(document.getElementById('rtRetQty_${i}').value)||1,document.getElementById('rtRetReason_${i}').value)">إرجاع</button></td>
            </tr>`).join('')}</tbody>
          </table>` : (returnSaleRef ? '<p class="rt-warning">⚠️ لم يُعثر على الفاتورة</p>' : '')}
      </div>
      <div class="rt-form-card" style="margin-top:16px">
        <h3>سجل المرتجعات</h3>
        ${(getReturns().length) ? `<table class="rt-table">
          <thead><tr><th>الفاتورة</th><th>الصنف</th><th>الكمية</th><th>المبلغ</th><th>السبب</th><th>التاريخ</th></tr></thead>
          <tbody>${getReturns().slice(-20).reverse().map(r => `<tr>
            <td>${esc(r.ref)}</td><td>${esc(r.productName)}</td><td>${r.qty}</td>
            <td>${fmt(r.refundAmount)} ${curSym()}</td><td>${esc(r.reason || '—')}</td>
            <td>${new Date(r.at).toLocaleDateString('ar-IQ')}</td>
          </tr>`).join('')}</tbody>
        </table>` : '<div class="rt-empty">لا توجد مرتجعات</div>'}
      </div>`;
  }

  function renderReturn() { renderReturnForm(); }

  function renderDashboard() {
    const el = document.getElementById('rtDashBody'); if (!el) return;
    const o = O(); const r = R(); if (!o || !r) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todaySales = getSales().filter(s => s.businessType === 'retail' && new Date(s.at) >= today);
    const total = todaySales.reduce((s, x) => s + x.total, 0);
    const disc = todaySales.reduce((s, x) => s + (x.discount || 0), 0);
    const cur = curSym();

    // top 5 products today
    const topMap = {};
    todaySales.forEach(s => s.lines.forEach(l => { topMap[l.name] = (topMap[l.name] || 0) + l.qty; }));
    const top5 = Object.entries(topMap).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // low stock alerts
    const lowStock = allProds().filter(p => !p.archived && (p.stock || 0) <= (p.minStock || r.settings.lowStockThreshold));
    const noStock = lowStock.filter(p => (p.stock || 0) === 0);

    // active promos
    const actPromos = activePromos();

    el.innerHTML = `
      <div class="rt-kpi-row">
        <div class="rt-kpi"><div class="rt-kpi-val">${fmt(total)} ${cur}</div><div class="rt-kpi-lbl">مبيعات اليوم</div></div>
        <div class="rt-kpi"><div class="rt-kpi-val">${todaySales.length}</div><div class="rt-kpi-lbl">عدد الفواتير</div></div>
        <div class="rt-kpi"><div class="rt-kpi-val">${fmt(disc)} ${cur}</div><div class="rt-kpi-lbl">إجمالي الخصومات</div></div>
        <div class="rt-kpi ${lowStock.length ? 'rt-kpi-warn' : ''}"><div class="rt-kpi-val">${lowStock.length}</div><div class="rt-kpi-lbl">أصناف نفذت / قاربت</div></div>
        <div class="rt-kpi"><div class="rt-kpi-val">${actPromos.length}</div><div class="rt-kpi-lbl">عروض فعّالة</div></div>
        <div class="rt-kpi"><div class="rt-kpi-val">${allProds().length}</div><div class="rt-kpi-lbl">إجمالي الأصناف</div></div>
      </div>
      <div class="rt-dash-row">
        <div class="rt-dash-card">
          <h4>🏆 أكثر الأصناف مبيعاً اليوم</h4>
          ${top5.length ? '<ul>' + top5.map(([n, q]) => '<li>' + esc(n) + ' — ' + q + '</li>').join('') + '</ul>' : '<p class="rt-empty">لا مبيعات اليوم</p>'}
        </div>
        <div class="rt-dash-card ${lowStock.length ? 'rt-card-warn' : ''}">
          <h4>⚠️ تنبيهات المخزون</h4>
          ${noStock.length ? '<p class="rt-danger-txt">نفد المخزون تماماً (' + noStock.length + '):</p><ul>' + noStock.map(p => '<li>' + esc(p.name) + '</li>').join('') + '</ul>' : ''}
          ${lowStock.filter(p => p.stock > 0).length ? '<p>مخزون منخفض:</p><ul>' + lowStock.filter(p => p.stock > 0).map(p => '<li>' + esc(p.name) + ' — ' + p.stock + ' ' + esc(p.unit || '') + '</li>').join('') + '</ul>' : ''}
          ${!lowStock.length ? '<p class="rt-ok-txt">✅ كل الأصناف ضمن الحد الطبيعي</p>' : ''}
        </div>
        <div class="rt-dash-card">
          <h4>🏷️ العروض الفعّالة</h4>
          ${actPromos.length ? '<ul>' + actPromos.map(p => '<li>' + esc(p.name) + '</li>').join('') + '</ul>' : '<p class="rt-empty">لا توجد عروض فعّالة</p>'}
        </div>
      </div>`;
  }

  function renderTabContent() {
    const body = document.getElementById('retailBody'); if (!body) return;
    // ensure sub-containers
    ['rtDashBody', 'rtPosBody', 'rtProductsBody', 'rtPromosBody', 'rtReturnBody', 'rtZBody'].forEach(id => {
      let el = document.getElementById(id); if (!el) { el = document.createElement('div'); el.id = id; body.appendChild(el); }
      el.style.display = 'none';
    });

    if (activeTab === 'dashboard') { document.getElementById('rtDashBody').style.display = ''; renderDashboard(); }
    else if (activeTab === 'pos') { document.getElementById('rtPosBody').style.display = ''; renderPOS(); }
    else if (activeTab === 'products') { document.getElementById('rtProductsBody').style.display = ''; renderProducts(); }
    else if (activeTab === 'promos') { document.getElementById('rtPromosBody').style.display = ''; renderPromos(); }
    else if (activeTab === 'returns') { document.getElementById('rtReturnBody').style.display = ''; renderReturn(); }
    else if (activeTab === 'z') { document.getElementById('rtZBody').style.display = ''; renderZTab(); }
  }

  function renderZTab() {
    const el = document.getElementById('rtZBody'); if (!el) return;
    const o = O(); if (!o) return;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todaySales = getSales().filter(s => s.businessType === 'retail' && new Date(s.at) >= today);
    const total = todaySales.reduce((s, x) => s + x.total, 0);
    const discount = todaySales.reduce((s, x) => s + (x.discount || 0), 0);
    const cur = curSym();
    el.innerHTML = `
      <div class="rt-form-card">
        <h3>📊 ملخص اليوم — ${today.toLocaleDateString('ar-IQ')}</h3>
        <div class="rt-kpi-row">
          <div class="rt-kpi"><div class="rt-kpi-val">${fmt(total)} ${cur}</div><div class="rt-kpi-lbl">إجمالي المبيعات</div></div>
          <div class="rt-kpi"><div class="rt-kpi-val">${todaySales.length}</div><div class="rt-kpi-lbl">عدد الفواتير</div></div>
          <div class="rt-kpi"><div class="rt-kpi-val">${fmt(discount)} ${cur}</div><div class="rt-kpi-lbl">إجمالي الخصومات</div></div>
        </div>
        <button class="btn-primary" onclick="rtZReport()" style="margin-top:16px">🖨️ طباعة Z-Report</button>
      </div>`;
  }

  function renderPOS() {
    const el = document.getElementById('rtPosBody'); if (!el) return;
    const cats = ['all', ...categories()];
    const list = prods().filter(p => {
      if (prodCatFilter !== 'all' && p.category !== prodCatFilter) return false;
      if (prodSearch && !p.name.toLowerCase().includes(prodSearch.toLowerCase()) && !(p.barcode || '').includes(prodSearch)) return false;
      return true;
    });
    const custs = customers();
    el.innerHTML = `
      <div class="rt-pos-layout">
        <div class="rt-pos-left">
          <div class="rt-pos-search-bar">
            <input id="rtScanInput" placeholder="🔖 امسح باركود أو اكتب للبحث..." onkeydown="rtScanEnter(event)" oninput="rtPosSearch(this.value)">
            <button class="btn-primary" onclick="rtScan()">مسح</button>
          </div>
          <div class="rt-cat-filter">
            ${cats.map(c => `<button class="rt-cat-btn ${prodCatFilter === c ? 'active' : ''}" onclick="rtPosSetCat('${esc(c)}')">${c === 'all' ? 'الكل' : esc(c)}</button>`).join('')}
          </div>
          <div class="rt-pos-grid">
            ${list.map(p => `
              <div class="rt-pos-card ${(p.stock || 0) === 0 ? 'out-of-stock' : ''}" onclick="${(p.stock || 0) > 0 ? "rtAddToCart('" + p.id + "')" : ''}">
                <div class="rt-pos-card-cat">${esc(p.category || '')}</div>
                <div class="rt-pos-card-name">${esc(p.name)}</div>
                <div class="rt-pos-card-price">${fmt(p.salePrice)} ${curSym()}</div>
                <div class="rt-pos-card-stock ${(p.stock || 0) === 0 ? 'no-stock' : (p.stock || 0) <= (p.minStock || 5) ? 'low' : ''}">${(p.stock || 0) === 0 ? 'نفد' : p.stock + ' ' + esc(p.unit || '')}</div>
              </div>`).join('') || '<div class="rt-empty">لا توجد أصناف</div>'}
          </div>
        </div>
        <div class="rt-pos-right">
          <h3>🛒 السلة</h3>
          <div id="rtCartBody"></div>
          <div class="rt-cart-footer" id="rtCartDiscount" style="display:none;color:#dc2626">
            خصم: -<span id="rtCartDiscount"></span> ${curSym()}
          </div>
          <div class="rt-cart-total">الإجمالي: <strong><span id="rtCartTotal">0</span> ${curSym()}</strong></div>
          <div class="rt-pay-mode">
            <button id="rtPayBtn_cash" class="rt-pay-btn active" onclick="rtSetPayMode('cash')">💵 نقداً</button>
            <button id="rtPayBtn_account" class="rt-pay-btn" onclick="rtSetPayMode('account')">📋 آجل</button>
          </div>
          <div class="rt-field" id="rtCustomerField">
            <label>العميل</label>
            <select onchange="rtSetCustomer(this.value)">
              <option value="">— اختر العميل —</option>
              ${custs.map(c => `<option value="${esc(c.id)}" ${cartCustomerId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="rt-cart-actions">
            <button class="btn-primary rt-checkout-btn" onclick="rtCheckout()">✅ إتمام البيع</button>
            <button class="btn-secondary" onclick="rtClearCart()">🗑️ تفريغ</button>
          </div>
          <h4 style="margin-top:16px">آخر المبيعات</h4>
          <div id="rtRecentSales"></div>
        </div>
      </div>`;
    renderCart();
    renderSalesList();
  }

  window.rtPosSearch = function (v) { prodSearch = v; renderPOS(); };
  window.rtPosSetCat = function (c) { prodCatFilter = c; renderPOS(); };

  /* ─────────────────────────── main render ─────────────────────────── */
  function rtRender() {
    const body = document.getElementById('retailBody'); if (!body) return;
    ensureData();
    body.innerHTML = `
      <div class="rt-header">
        <h2>🏪 المتجر — Retail</h2>
        <div class="rt-tabs">
          ${[['dashboard','📊 لوحة التحكم'],['pos','🛒 نقطة البيع'],['products','📦 الأصناف'],['promos','🏷️ العروض'],['returns','↩️ المرتجعات'],['z','📋 تقرير اليوم']].map(([k,l]) =>
            `<button class="rt-tab-btn ${activeTab === k ? 'active' : ''}" data-tab="${k}" onclick="rtOpenTab('${k}')">${l}</button>`
          ).join('')}
        </div>
      </div>
      <div id="rtDashBody"></div>
      <div id="rtPosBody"></div>
      <div id="rtProductsBody"></div>
      <div id="rtPromosBody"></div>
      <div id="rtReturnBody"></div>
      <div id="rtZBody"></div>`;
    renderTabContent();
  }

  /* ─────────────────────────── switchPage hook ─────────────────────────── */
  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'retail') {
      // Core switchPage only activates pages in its built-in pageMap; like
      // pos/pharmacy/assets, this module activates its own section explicitly
      // so navigation actually shows it (otherwise the page stays hidden).
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageRetail'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navRetail'); if (nav) nav.classList.add('active');
        window.currentPage = 'retail';
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('retail');
      } catch (_) {}
      ensureData(); setTimeout(rtRender, 0);
    }
  };

  /* ─────────────────────────── Jarvis tool registration ─────────────────────────── */
  function registerJarvisTool() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools && typeof JarvisBrain.tools === 'object') {
        JarvisBrain.tools['report_retail_alerts'] = function () {
          const r = R(); const o = O(); if (!r || !o) return { error: 'retail data not ready' };
          const lowStock = allProds().filter(p => !p.archived && (p.stock || 0) <= (p.minStock || r.settings.lowStockThreshold));
          const today = new Date(); today.setHours(0, 0, 0, 0);
          const todaySales = getSales().filter(s => s.businessType === 'retail' && new Date(s.at) >= today);
          return {
            todaySalesTotal: todaySales.reduce((s, x) => s + x.total, 0),
            todaySalesCount: todaySales.length,
            lowStockProducts: lowStock.map(p => ({ name: p.name, stock: p.stock, minStock: p.minStock })),
            activePromotions: activePromos().map(p => p.name),
            totalProducts: allProds().length
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['retail'] = '#pageRetail';
      }
    } catch (_) {}
  }

  /* ─────────────────────────── boot ─────────────────────────── */
  if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', registerJarvisTool); }
  else { setTimeout(registerJarvisTool, 500); }

  window.OctagonRetail = { render: rtRender, ensureData };

})();
