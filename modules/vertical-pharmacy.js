/**
 * OCTAGON ERP — Pharmacy vertical (Phase 5, first industry vertical pack).
 * A complete pharmacy on top of the shared engines:
 *  - Drug catalog with Rx / controlled flags, barcode, min-stock.
 *  - Batch receiving with expiry dates; stock = sum of batches.
 *  - FEFO dispensing (first-expiry-first-out); expired batches are NEVER dispensed.
 *  - Dispense counter: barcode, patient/doctor capture, discount %, insurance split,
 *    cash/account payment. Sales are stored in the shared omni.posSales (businessType
 *    'pharmacy') so the POS Z-report stays unified; money posts through the existing
 *    addFinanceTransaction bridge (legacy -> v6 account_moves).
 *  - Controlled-substance dispensing log (append-only) + prescriptions register.
 *  - Near-expiry / expired / low-stock alert dashboard + Jarvis tool registration.
 * Add-only: new page 'pharmacy' wired by wrapping switchPage (same pattern as pos.js);
 * wraps posZReport with a pharmacy-aware report when businessType === 'pharmacy';
 * injects a small banner into the POS page pointing here when type is pharmacy.
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
  function orgName() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.name) || 'Octagon'; }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function checked(id) { const el = document.getElementById(id); return !!(el && el.checked); }
  function userName() {
    try { if (window.PentagonAuth && PentagonAuth.currentUser && PentagonAuth.currentUser.name) return PentagonAuth.currentUser.name; } catch (_) {}
    try { if (window.currentUser && window.currentUser.name) return window.currentUser.name; } catch (_) {}
    try { const o = O(); if (o && o.currentUserName) return o.currentUserName; } catch (_) {}
    return '';
  }
  function customers() {
    try {
      if (typeof window.ensureFinance === 'function') { try { window.ensureFinance(); } catch (_) {} }
      if (typeof finance !== 'undefined' && finance && Array.isArray(finance.customers)) return finance.customers;
    } catch (_) {}
    const o = O();
    return (o && Array.isArray(o.customers)) ? o.customers : [];
  }
  function history(action, summary, payload) {
    if (typeof window.recordOmniHistoryEvent === 'function') {
      try { window.recordOmniHistoryEvent({ module: 'pharmacy', source: 'pharmacy', action: action, summary: summary, payload: payload || {} }); } catch (_) {}
    }
  }
  function dayStart(d) { const x = d ? new Date(d) : new Date(); x.setHours(0, 0, 0, 0); return x; }
  function daysUntil(dateStr) {
    if (!dateStr) return Infinity;
    const d = new Date(dateStr); if (isNaN(d)) return Infinity;
    return Math.floor((dayStart(d) - dayStart()) / 86400000);
  }
  function fmtDate(s) { if (!s) return '—'; const d = new Date(s); return isNaN(d) ? esc(s) : d.toLocaleDateString('ar-IQ'); }

  /* ----------------------------- data ----------------------------- */
  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.pharmacy || typeof o.pharmacy !== 'object') o.pharmacy = {};
    const p = o.pharmacy;
    if (!Array.isArray(p.products)) p.products = [];
    if (!Array.isArray(p.movements)) p.movements = [];
    if (!Array.isArray(p.prescriptions)) p.prescriptions = [];
    if (!Array.isArray(p.controlledLog)) p.controlledLog = [];
    if (!p.settings || typeof p.settings !== 'object') p.settings = {};
    if (typeof p.settings.nearExpiryDays !== 'number') p.settings.nearExpiryDays = 90;
    if (typeof p.settings.defaultMinStock !== 'number') p.settings.defaultMinStock = 10;
    if (!Array.isArray(o.posSales)) o.posSales = [];
    return p;
  }
  function P() { return ensureData(); }
  function products() {
    const p = P();
    const list = p ? p.products : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function activeProducts() { return products().filter(d => !d.archived); }
  function nearDays() { const p = P(); return (p && p.settings.nearExpiryDays) || 90; }
  function prescriptions() {
    const p = P();
    const list = p ? p.prescriptions : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function controlledLog() {
    const p = P();
    const list = p ? p.controlledLog : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function movements() {
    const p = P();
    const list = p ? p.movements : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function pharmacySales() {
    const o = O();
    const list = (o && o.posSales) ? o.posSales : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }

  function isExpired(b) { return !!(b && b.expiry) && daysUntil(b.expiry) < 0; }
  function isNear(b) { if (!b || !b.expiry) return false; const d = daysUntil(b.expiry); return d >= 0 && d <= nearDays(); }
  function batches(d) { return Array.isArray(d.batches) ? d.batches : (d.batches = []); }
  function sellableStock(d) { return batches(d).reduce((s, b) => s + ((!isExpired(b) && b.qty > 0) ? Number(b.qty) : 0), 0); }
  function totalStock(d) { return batches(d).reduce((s, b) => s + Math.max(0, Number(b.qty) || 0), 0); }
  function expiredQty(d) { return batches(d).reduce((s, b) => s + ((isExpired(b) && b.qty > 0) ? Number(b.qty) : 0), 0); }
  function nearQty(d) { return batches(d).reduce((s, b) => s + ((isNear(b) && b.qty > 0) ? Number(b.qty) : 0), 0); }
  function minStock(d) { const p = P(); return (typeof d.minStock === 'number') ? d.minStock : ((p && p.settings.defaultMinStock) || 10); }
  function nearestExpiry(d) {
    const list = batches(d).filter(b => b.expiry && b.qty > 0).sort((a, b) => String(a.expiry).localeCompare(String(b.expiry)));
    return list.length ? list[0].expiry : '';
  }
  function stockValue(d) { return batches(d).reduce((s, b) => s + Math.max(0, Number(b.qty) || 0) * (Number(b.cost) || 0), 0); }

  /** FEFO: allocate qty across non-expired batches, earliest expiry first. */
  function fefoPlan(d, qty) {
    qty = Math.max(0, Math.floor(Number(qty) || 0));
    const usable = batches(d)
      .filter(b => !isExpired(b) && Number(b.qty) > 0)
      .sort((a, b) => {
        if (!a.expiry && !b.expiry) return 0;
        if (!a.expiry) return 1; if (!b.expiry) return -1;
        return String(a.expiry).localeCompare(String(b.expiry));
      });
    const alloc = []; let left = qty;
    for (const b of usable) {
      if (left <= 0) break;
      const take = Math.min(left, Number(b.qty));
      alloc.push({ batch: b, take: take });
      left -= take;
    }
    return { ok: left <= 0, alloc: alloc, available: qty - left, short: left };
  }

  /* ----------------------------- alerts ----------------------------- */
  function alertExpired() {
    const rows = [];
    activeProducts().forEach(d => batches(d).forEach(b => {
      if (isExpired(b) && b.qty > 0) rows.push({ drug: d, batch: b });
    }));
    return rows.sort((a, b) => String(a.batch.expiry).localeCompare(String(b.batch.expiry)));
  }
  function alertNear() {
    const rows = [];
    activeProducts().forEach(d => batches(d).forEach(b => {
      if (isNear(b) && b.qty > 0) rows.push({ drug: d, batch: b, days: daysUntil(b.expiry) });
    }));
    return rows.sort((a, b) => a.days - b.days);
  }
  function alertLow() {
    return activeProducts()
      .map(d => ({ drug: d, stock: sellableStock(d), min: minStock(d) }))
      .filter(r => r.stock <= r.min)
      .sort((a, b) => (a.stock - a.min) - (b.stock - b.min));
  }
  function alertsSummaryText() {
    const ex = alertExpired(), nr = alertNear(), lo = alertLow();
    if (!ex.length && !nr.length && !lo.length) return 'الصيدلية بخير: لا أدوية منتهية ولا قريبة الانتهاء ولا نواقص. ✅';
    const L = [];
    if (ex.length) L.push('🔴 منتهية الصلاحية (' + ex.length + '): ' + ex.slice(0, 5).map(r => r.drug.name + ' دفعة ' + (r.batch.batchNo || '—') + ' (' + r.batch.qty + ')').join('، ') + (ex.length > 5 ? ' …' : ''));
    if (nr.length) L.push('🟡 قريبة الانتهاء ≤' + nearDays() + ' يوم (' + nr.length + '): ' + nr.slice(0, 5).map(r => r.drug.name + ' بعد ' + r.days + ' يوم').join('، ') + (nr.length > 5 ? ' …' : ''));
    if (lo.length) L.push('🔵 تحت الحد الأدنى (' + lo.length + '): ' + lo.slice(0, 5).map(r => r.drug.name + ' ' + r.stock + '/' + r.min).join('، ') + (lo.length > 5 ? ' …' : ''));
    return L.join('\n');
  }

  /* ----------------------------- state ----------------------------- */
  let tab = 'dashboard';
  let cart = {};            // productId -> qty
  let dispSearch = '';
  let payMode = 'cash';     // 'cash' | 'account'
  let editingId = '';       // catalog edit
  let recvProductId = '';   // receiving preselect
  let logFilter = '';

  const TABS = [
    { id: 'dashboard', name: '📊 اللوحة' },
    { id: 'dispense', name: '💊 صرف الأدوية' },
    { id: 'catalog', name: '📚 الأدوية' },
    { id: 'receiving', name: '📦 استلام الدفعات' },
    { id: 'prescriptions', name: '📜 الوصفات' },
    { id: 'controlled', name: '🔐 سجل الرقابة' }
  ];
  const FORMS = ['أقراص', 'كبسول', 'شراب', 'حقن', 'مرهم', 'قطرة', 'تحاميل', 'بخاخ', 'أخرى'];

  /* ----------------------------- demo data ----------------------------- */
  function isoPlus(days) { const d = new Date(); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10); }
  window.phLoadDemoData = function () {
    const p = P(); if (!p) return;
    if (p.products.some(d => d.demo)) { toast('البيانات التجريبية محمّلة مسبقاً', 'info'); return; }
    const mk = (name, generic, form, barcode, price, cost, flags, min, bs) => ({
      id: uid('phdemo'), demo: true, name: name, genericName: generic, form: form, barcode: barcode,
      price: price, cost: cost, rx: !!flags.rx, controlled: !!flags.ctrl, minStock: min,
      notes: flags.note || '', archived: false, createdAt: new Date().toISOString(),
      batches: bs.map(b => ({ id: uid('phbatch'), batchNo: b[0], expiry: b[1], qty: b[2], cost: cost, supplierName: b[3] || 'مذخر الرافدين', receivedAt: new Date().toISOString() }))
    });
    p.products.push(
      mk('باراسيتامول 500 ملغ', 'Paracetamol', 'أقراص', '6291100000017', 1000, 600, {}, 30, [['PB-101', isoPlus(420), 120], ['PB-088', isoPlus(200), 60]]),
      mk('أموكسيسيلين 500 ملغ', 'Amoxicillin', 'كبسول', '6291100000024', 4000, 2500, { rx: true }, 20, [['AMX-77', isoPlus(45), 40]]),
      mk('ترامادول 50 ملغ', 'Tramadol HCl', 'أقراص', '6291100000031', 6000, 3800, { rx: true, ctrl: true, note: 'مادة خاضعة للرقابة — وصفة إلزامية' }, 10, [['TRM-12', isoPlus(300), 25]]),
      mk('فيتامين C 1000 ملغ', 'Ascorbic Acid', 'أقراص', '6291100000048', 2500, 1500, {}, 15, [['VC-55', isoPlus(500), 8]]),
      mk('أنسولين لانتوس', 'Insulin Glargine', 'حقن', '6291100000055', 25000, 18000, { rx: true, note: 'يُحفظ مبرّداً 2-8°' }, 6, [['INS-09', isoPlus(-20), 6, 'مذخر بغداد'], ['INS-14', isoPlus(160), 18, 'مذخر بغداد']]),
      mk('شراب سعال للأطفال', 'Dextromethorphan', 'شراب', '6291100000062', 3000, 1800, {}, 12, [['CS-31', isoPlus(75), 22]]),
      mk('أوميبرازول 20 ملغ', 'Omeprazole', 'كبسول', '6291100000079', 3500, 2200, {}, 15, [['OMP-42', isoPlus(380), 55]]),
      mk('سيتريزين 10 ملغ', 'Cetirizine', 'أقراص', '6291100000086', 2000, 1200, {}, 10, [['CTZ-19', isoPlus(260), 34]])
    );
    save(); render();
    history('demo_load', 'تحميل بيانات تجريبية للصيدلية (8 أدوية)');
    toast('تم تحميل 8 أدوية تجريبية — لاحظ تنبيهات الانتهاء والنواقص 💊', 'success');
  };
  window.phRemoveDemoData = function () {
    const p = P(); if (!p) return;
    const n = p.products.filter(d => d.demo).length;
    if (!n) { toast('لا توجد بيانات تجريبية', 'info'); return; }
    if (!confirm('إزالة ' + n + ' دواء تجريبي؟ (سجلات البيع والمالية تبقى)')) return;
    p.products = p.products.filter(d => !d.demo);
    save(); render();
    toast('أُزيلت البيانات التجريبية', 'success');
  };

  /* ----------------------------- dispense actions ----------------------------- */
  function cartLines() {
    return Object.keys(cart).map(id => {
      const d = products().find(x => x.id === id);
      if (!d) return null;
      const qty = cart[id];
      const unit = money(d.price);
      const plan = fefoPlan(d, qty);
      return { id: id, drug: d, qty: qty, unit: unit, total: unit * qty, plan: plan };
    }).filter(Boolean);
  }
  function subTotal() { return cartLines().reduce((s, l) => s + l.total, 0); }

  window.phAddToCart = function (id) {
    const d = products().find(x => x.id === id);
    if (!d) return;
    const want = (cart[id] || 0) + 1;
    if (sellableStock(d) < want) { toast('لا يوجد مخزون صالح كافٍ من ' + d.name + (expiredQty(d) ? ' (يوجد ' + expiredQty(d) + ' منتهي الصلاحية)' : ''), 'warning'); return; }
    cart[id] = want;
    renderCart();
  };
  window.phChangeQty = function (id, delta) {
    const d = products().find(x => x.id === id); if (!d) return;
    let q = (cart[id] || 0) + Number(delta);
    if (q <= 0) { delete cart[id]; renderCart(); return; }
    if (sellableStock(d) < q) { toast('المتاح الصالح: ' + sellableStock(d), 'warning'); q = sellableStock(d); }
    if (q <= 0) delete cart[id]; else cart[id] = q;
    renderCart();
  };
  window.phSetQty = function (id, v) {
    const d = products().find(x => x.id === id); if (!d) return;
    let q = Math.max(0, Math.floor(Number(v) || 0));
    if (q > sellableStock(d)) { toast('المتاح الصالح: ' + sellableStock(d), 'warning'); q = sellableStock(d); }
    if (q <= 0) delete cart[id]; else cart[id] = q;
    renderCart();
  };
  window.phRemoveLine = function (id) { delete cart[id]; renderCart(); };
  window.phClearCart = function () { cart = {}; renderCart(); };
  window.phDispSearch = function (v) {
    dispSearch = String(v || '').trim().toLowerCase();
    const grid = document.getElementById('phProdGrid');
    if (grid) grid.innerHTML = prodGridHtml();
  };
  window.phScan = function (code) {
    code = String(code || '').trim();
    if (!code) return;
    const lc = code.toLowerCase();
    const d = activeProducts().find(x =>
      String(x.barcode || '') === code ||
      String(x.name || '').toLowerCase() === lc ||
      String(x.genericName || '').toLowerCase() === lc);
    if (!d) { toast('لا دواء بهذا الباركود: ' + code, 'warning'); return; }
    window.phAddToCart(d.id);
  };
  window.phScanEnter = function (ev) {
    if (ev && ev.key === 'Enter') { ev.preventDefault(); const v = ev.target.value; ev.target.value = ''; window.phScan(v); }
  };
  window.phSetPayMode = function (m) {
    payMode = (m === 'account') ? 'account' : 'cash';
    const box = document.getElementById('phPayMode');
    if (box) {
      const btns = box.querySelectorAll('button');
      btns.forEach(b => b.classList.remove('active'));
      if (btns[payMode === 'account' ? 1 : 0]) btns[payMode === 'account' ? 1 : 0].classList.add('active');
    }
    renderTotals();
  };
  window.phRecalc = function () { renderTotals(); };

  function computeTotals() {
    const sub = subTotal();
    let discPct = Math.min(100, Math.max(0, numVal('phDiscount')));
    const discount = money(sub * discPct / 100);
    const net = sub - discount;
    const insurerId = val('phInsurer');
    let covPct = Math.min(100, Math.max(0, numVal('phCoverage')));
    const insurerShare = insurerId ? money(net * covPct / 100) : 0;
    const patientShare = net - insurerShare;
    return { sub: sub, discPct: discPct, discount: discount, net: net, insurerId: insurerId, covPct: covPct, insurerShare: insurerShare, patientShare: patientShare };
  }

  window.phCheckout = function () {
    const p = P(); if (!p) return;
    const o = O();
    const lines = cartLines();
    if (!lines.length) { toast('السلة فارغة', 'warning'); return; }
    const bad = lines.find(l => !l.plan.ok);
    if (bad) { toast('مخزون غير كافٍ: ' + bad.drug.name + ' (متاح صالح ' + bad.plan.available + ')', 'error'); renderCart(); return; }

    const patient = val('phPatient'), doctor = val('phDoctor');
    const rxLines = lines.filter(l => l.drug.rx || l.drug.controlled);
    const ctrlLines = lines.filter(l => l.drug.controlled);
    if (rxLines.length && !patient) { toast('يوجد دواء بوصفة — اسم المريض مطلوب 📜', 'warning'); return; }
    if (ctrlLines.length && !doctor) { toast('دواء خاضع للرقابة — اسم الطبيب مطلوب 🔐', 'warning'); return; }

    const T = computeTotals();
    const custId = val('phCustomer');
    const cust = customers().find(c => c.id === custId);
    const insurer = customers().find(c => c.id === T.insurerId);
    if (payMode === 'account' && T.patientShare > 0 && !custId) { toast('اختر عميلاً للبيع الآجل', 'warning'); return; }

    const year = new Date().getFullYear();
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const seq = pharmacySales().filter(s => s.businessType === 'pharmacy').length + 1;
    const sale = {
      id: uid('phsale'),
      reference: 'PH-' + year + '-' + String(seq).padStart(4, '0'),
      date: new Date().toISOString(),
      businessType: 'pharmacy',
      customerId: custId || '', customerName: cust ? (cust.name || '') : '',
      payMode: payMode,
      patient: patient, doctor: doctor,
      lines: lines.map(l => ({
        productId: l.id, name: l.drug.name, qty: l.qty, unitPrice: l.unit, total: l.total,
        rx: !!(l.drug.rx || l.drug.controlled), controlled: !!l.drug.controlled,
        batches: l.plan.alloc.map(a => ({ batchNo: a.batch.batchNo || '', expiry: a.batch.expiry || '', qty: a.take }))
      })),
      subtotal: T.sub, discountPct: T.discPct, discountAmount: T.discount,
      insurance: T.insurerShare > 0 ? { insurerId: T.insurerId, insurerName: insurer ? insurer.name : '', coveragePct: T.covPct, amount: T.insurerShare } : null,
      total: T.net,
      paid: (payMode === 'cash') ? T.patientShare : 0,
      byUser: userName(),
      companyId: coId
    };

    // 1) FEFO stock deduction + movement log.
    lines.forEach(l => {
      l.plan.alloc.forEach(a => { a.batch.qty = Number(a.batch.qty) - a.take; });
      p.movements.unshift({
        id: uid('phmov'), date: sale.date, type: 'out', productId: l.id, name: l.drug.name,
        qty: l.qty, batches: l.plan.alloc.map(a => (a.batch.batchNo || '—') + '×' + a.take).join('، '),
        ref: sale.reference, note: 'صرف' + (patient ? ' للمريض ' + patient : ''),
        companyId: coId
      });
    });
    p.movements = p.movements.slice(0, 1000);

    // 2) Controlled-substance log (append-only).
    ctrlLines.forEach(l => {
      p.controlledLog.unshift({
        id: uid('phctl'), date: sale.date, productId: l.id, name: l.drug.name, qty: l.qty,
        batches: l.plan.alloc.map(a => a.batch.batchNo || '—').join('، '),
        patient: patient, doctor: doctor, saleRef: sale.reference, byUser: sale.byUser,
        companyId: coId
      });
    });

    // 3) Prescription register.
    if (rxLines.length && patient) {
      const rx = {
        id: uid('phrx'), date: sale.date, patient: patient, doctor: doctor,
        items: rxLines.map(l => ({ productId: l.id, name: l.drug.name, qty: l.qty })),
        saleId: sale.id, saleRef: sale.reference,
        companyId: coId
      };
      p.prescriptions.unshift(rx);
      sale.rxId = rx.id;
    }

    o.posSales.unshift(sale);
    o.posSales = o.posSales.slice(0, 500);

    // 4) Money → existing bridge (legacy finance -> v6 account_moves).
    //    Distinct sourceIds per leg: addFinanceTransaction dedups on sourceType+sourceId+type.
    if (typeof window.addFinanceTransaction === 'function') {
      try {
        if (payMode === 'cash' && T.patientShare > 0) {
          window.addFinanceTransaction({
            type: 'income', direction: 'in', sourceType: 'pharmacy_sale', sourceId: sale.id,
            amount: T.patientShare, description: 'مبيعات صيدلية ' + sale.reference + (patient ? ' — ' + patient : ''),
            companyId: coId
          }, { skipSave: true });
        } else if (payMode === 'account' && T.patientShare > 0) {
          window.addFinanceTransaction({
            type: 'customer_charge', direction: 'neutral', sourceType: 'pharmacy_sale', sourceId: sale.id,
            amount: T.patientShare, customerId: custId, partyName: sale.customerName,
            description: 'بيع آجل صيدلية ' + sale.reference,
            companyId: coId
          }, { skipSave: true });
        }
        if (T.insurerShare > 0 && insurer) {
          window.addFinanceTransaction({
            type: 'customer_charge', direction: 'neutral', sourceType: 'pharmacy_sale', sourceId: sale.id + '_ins',
            amount: T.insurerShare, customerId: insurer.id, partyName: insurer.name || '',
            description: 'حصة تأمين ' + (insurer.name || '') + ' — ' + sale.reference + ' (' + T.covPct + '%)',
            companyId: coId
          }, { skipSave: true });
        }
      } catch (e) { console.warn('Pharmacy finance post failed', e); }
    }

    history('sale', 'صرف ' + sale.reference + ' بمبلغ ' + fmt(T.net) + (ctrlLines.length ? ' (يتضمن مواد مراقبة)' : ''), { id: sale.id, total: T.net, patient: patient });

    cart = {}; payMode = 'cash';
    save(); render();
    toast('تم الصرف ' + sale.reference + ' — ' + fmt(T.net) + ' ' + curSym() + ' ✅', 'success');
    window.phPrintSale(sale.id);
  };

  /* ----------------------------- receipt + reports ----------------------------- */
  window.phPrintSale = function (saleId) {
    const o = O(); if (!o) return;
    const s = pharmacySales().find(x => x.id === saleId);
    if (!s) return;
    const sym = curSym();
    const w = window.open('', '_blank', 'width=380,height=640');
    if (!w) { toast('فعّل النوافذ المنبثقة للطباعة', 'warning'); return; }
    const rows = (s.lines || []).map(l => '<tr><td>' + esc(l.name) + (l.controlled ? ' 🔐' : (l.rx ? ' 📜' : '')) + '</td><td>' + l.qty + '</td><td>' + fmt(l.unitPrice) + '</td><td>' + fmt(l.total) + '</td></tr>').join('');
    w.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>' + esc(s.reference) + '</title>'
      + '<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Tahoma,sans-serif}body{padding:14px;width:300px;color:#111;font-size:12px}'
      + 'h1{font-size:16px;text-align:center;margin-bottom:4px}.muted{color:#666;text-align:center;font-size:11px;margin-bottom:8px}'
      + '.who{font-size:11px;border:1px dashed #999;border-radius:6px;padding:5px 8px;margin-bottom:6px}'
      + 'table{width:100%;border-collapse:collapse;margin:8px 0}td,th{padding:3px 2px;border-bottom:1px dashed #ccc;text-align:right;font-size:11px}'
      + '.r{display:flex;justify-content:space-between;font-size:12px;padding:2px 0}'
      + '.tot{display:flex;justify-content:space-between;font-size:15px;font-weight:800;border-top:2px solid #111;padding-top:6px;margin-top:6px}'
      + '@media print{body{width:auto}}</style></head><body>'
      + '<h1>💊 ' + esc(orgName()) + ' — صيدلية</h1>'
      + '<div class="muted">' + esc(s.reference) + ' · ' + new Date(s.date).toLocaleString('ar-IQ') + '</div>'
      + (s.patient ? '<div class="who">المريض: <b>' + esc(s.patient) + '</b>' + (s.doctor ? ' · الطبيب: ' + esc(s.doctor) : '') + '</div>' : '')
      + '<table><thead><tr><th>الصنف</th><th>كمية</th><th>سعر</th><th>مجموع</th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '<div class="r"><span>المجموع</span><span>' + fmt(s.subtotal != null ? s.subtotal : s.total) + ' ' + sym + '</span></div>'
      + (s.discountAmount ? '<div class="r"><span>الخصم (' + (s.discountPct || 0) + '%)</span><span>−' + fmt(s.discountAmount) + '</span></div>' : '')
      + (s.insurance ? '<div class="r"><span>التأمين ' + esc(s.insurance.insurerName || '') + ' (' + s.insurance.coveragePct + '%)</span><span>−' + fmt(s.insurance.amount) + '</span></div>' : '')
      + '<div class="tot"><span>' + (s.payMode === 'account' ? 'على الحساب' : 'المدفوع نقداً') + '</span><span>'
      + fmt(s.payMode === 'account' ? (s.total - (s.insurance ? s.insurance.amount : 0)) : (s.paid != null ? s.paid : s.total)) + ' ' + sym + '</span></div>'
      + '<p style="text-align:center;margin-top:12px;color:#666">شفاءً عاجلاً 🌿</p>'
      + '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  };

  /** Pharmacy-aware Z-report; wraps the POS one when businessType === 'pharmacy'. */
  function phZReport() {
    const o = O(); if (!o) return;
    const sym = curSym();
    const todayStr = new Date().toDateString();
    const all = pharmacySales().filter(s => new Date(s.date).toDateString() === todayStr);
    const ph = all.filter(s => s.businessType === 'pharmacy');
    const other = all.filter(s => s.businessType !== 'pharmacy');
    const sum = (arr, f) => arr.reduce((a, s) => a + money(f(s)), 0);
    const gross = sum(ph, s => s.subtotal != null ? s.subtotal : s.total);
    const disc = sum(ph, s => s.discountAmount || 0);
    const ins = sum(ph, s => s.insurance ? s.insurance.amount : 0);
    const cash = sum(ph.filter(s => s.payMode !== 'account'), s => s.paid != null ? s.paid : s.total);
    const acct = sum(ph.filter(s => s.payMode === 'account'), s => s.total - (s.insurance ? s.insurance.amount : 0));
    const ctrlCount = ph.reduce((a, s) => a + ((s.lines || []).some(l => l.controlled) ? 1 : 0), 0);
    const w = window.open('', '_blank', 'width=420,height=700');
    if (!w) { toast('فعّل النوافذ المنبثقة للطباعة', 'warning'); return; }
    w.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>تقرير اليوم Z — صيدلية</title>'
      + '<style>*{margin:0;padding:0;box-sizing:border-box;font-family:Tahoma,sans-serif}body{padding:18px;color:#111;font-size:13px}'
      + 'h1{font-size:18px;text-align:center}.muted{color:#666;text-align:center;margin-bottom:14px}'
      + '.kpi{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px dashed #ccc;font-size:14px}'
      + '.kpi.big{font-size:18px;font-weight:800;border-bottom:2px solid #111}'
      + 'table{width:100%;border-collapse:collapse;margin-top:12px}td,th{padding:4px;border-bottom:1px solid #eee;text-align:right;font-size:12px}'
      + '@media print{body{padding:8px}}</style></head><body>'
      + '<h1>💊 ' + esc(orgName()) + ' — تقرير اليوم (Z) صيدلية</h1>'
      + '<div class="muted">' + new Date().toLocaleDateString('ar-IQ') + '</div>'
      + '<div class="kpi"><span>عدد عمليات الصرف</span><span>' + ph.length + '</span></div>'
      + '<div class="kpi"><span>الإجمالي قبل الخصم</span><span>' + fmt(gross) + ' ' + sym + '</span></div>'
      + '<div class="kpi"><span>الخصومات</span><span>−' + fmt(disc) + '</span></div>'
      + '<div class="kpi"><span>ذمم التأمين</span><span>' + fmt(ins) + '</span></div>'
      + '<div class="kpi"><span>مبيعات آجلة (ذمم عملاء)</span><span>' + fmt(acct) + '</span></div>'
      + '<div class="kpi big"><span>النقد المحصّل</span><span>' + fmt(cash) + ' ' + sym + '</span></div>'
      + '<div class="kpi"><span>عمليات بمواد مراقبة</span><span>' + ctrlCount + '</span></div>'
      + (other.length ? '<div class="kpi"><span>مبيعات POS أخرى اليوم</span><span>' + other.length + ' / ' + fmt(sum(other, s => s.total)) + '</span></div>' : '')
      + '<table><thead><tr><th>المرجع</th><th>الوقت</th><th>المريض</th><th>النوع</th><th>الصافي</th></tr></thead><tbody>'
      + ph.map(s => '<tr><td>' + esc(s.reference) + '</td><td>' + new Date(s.date).toLocaleTimeString('ar-IQ') + '</td><td>' + esc(s.patient || '—') + '</td><td>' + (s.payMode === 'account' ? 'آجل' : 'نقد') + (s.insurance ? '+تأمين' : '') + '</td><td>' + fmt(s.total) + '</td></tr>').join('')
      + '</tbody></table>'
      + '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }
  window.phZReport = phZReport;

  window.phPrintControlledLog = function () {
    const p = P(); if (!p) return;
    const rows = p.controlledLog.slice(0, 300);
    const w = window.open('', '_blank', 'width=720,height=800');
    if (!w) { toast('فعّل النوافذ المنبثقة للطباعة', 'warning'); return; }
    w.document.write('<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>سجل المواد الخاضعة للرقابة</title>'
      + '<style>*{box-sizing:border-box;font-family:Tahoma,sans-serif}body{padding:20px;color:#111;font-size:12px}h1{font-size:17px;text-align:center;margin:0 0 4px}'
      + '.muted{color:#666;text-align:center;margin-bottom:14px;font-size:11px}'
      + 'table{width:100%;border-collapse:collapse}td,th{padding:6px;border:1px solid #bbb;text-align:right;font-size:11px}th{background:#eee}'
      + '</style></head><body><h1>🔐 ' + esc(orgName()) + ' — سجل صرف المواد الخاضعة للرقابة</h1>'
      + '<div class="muted">طُبع في ' + new Date().toLocaleString('ar-IQ') + ' · ' + rows.length + ' قيد</div>'
      + '<table><thead><tr><th>التاريخ</th><th>الدواء</th><th>الكمية</th><th>الدفعة</th><th>المريض</th><th>الطبيب</th><th>المرجع</th><th>الصيدلاني</th></tr></thead><tbody>'
      + rows.map(r => '<tr><td>' + new Date(r.date).toLocaleString('ar-IQ') + '</td><td>' + esc(r.name) + '</td><td>' + r.qty + '</td><td>' + esc(r.batches || '—') + '</td><td>' + esc(r.patient || '—') + '</td><td>' + esc(r.doctor || '—') + '</td><td>' + esc(r.saleRef || '') + '</td><td>' + esc(r.byUser || '—') + '</td></tr>').join('')
      + '</tbody></table></body></html>');
    w.document.close();
  };

  /* ----------------------------- catalog actions ----------------------------- */
  window.phSaveDrug = function () {
    const p = P(); if (!p) return;
    const name = val('phDrugName');
    const price = numVal('phDrugPrice');
    if (!name) { toast('اسم الدواء مطلوب', 'warning'); return; }
    if (price <= 0) { toast('سعر البيع مطلوب', 'warning'); return; }
    const controlled = checked('phDrugCtrl');
    const data = {
      name: name, genericName: val('phDrugGeneric'), form: val('phDrugForm'), barcode: val('phDrugBarcode'),
      price: price, cost: numVal('phDrugCost'),
      minStock: Math.max(0, numVal('phDrugMin')) || P().settings.defaultMinStock,
      rx: checked('phDrugRx') || controlled, controlled: controlled,
      notes: val('phDrugNotes')
    };
    if (editingId) {
      const d = p.products.find(x => x.id === editingId);
      if (d) { Object.assign(d, data); history('drug_update', 'تعديل دواء: ' + name, { id: d.id }); toast('عُدّل ' + name, 'success'); }
      editingId = '';
    } else {
      const dup = p.products.find(x => !x.archived && (String(x.name).trim() === name || (data.barcode && x.barcode === data.barcode)));
      if (dup) { toast('يوجد دواء بنفس الاسم/الباركود: ' + dup.name, 'warning'); return; }
      const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
      const d = Object.assign({ id: uid('phdrug'), archived: false, demo: false, createdAt: new Date().toISOString(), batches: [], companyId: coId }, data);
      p.products.unshift(d);
      history('drug_create', 'إضافة دواء: ' + name, { id: d.id });
      toast('أُضيف ' + name + ' 💊', 'success');
    }
    save(); renderTab();
  };
  window.phEditDrug = function (id) {
    editingId = id;
    renderTab();
    const el = document.getElementById('phDrugName');
    if (el) el.focus();
  };
  window.phCancelEdit = function () { editingId = ''; renderTab(); };
  window.phToggleArchive = function (id) {
    const d = products().find(x => x.id === id); if (!d) return;
    d.archived = !d.archived;
    save(); renderTab();
    toast(d.archived ? ('أُرشف ' + d.name) : ('أُعيد ' + d.name), 'info');
  };
  window.phGoReceive = function (id) { recvProductId = id || ''; window.phOpenTab('receiving'); };

  /* ----------------------------- receiving actions ----------------------------- */
  window.phAddBatch = function () {
    const p = P(); if (!p) return;
    const pid = val('phRecvProduct');
    const d = p.products.find(x => x.id === pid);
    if (!d) { toast('اختر الدواء', 'warning'); return; }
    const qty = Math.floor(numVal('phRecvQty'));
    if (qty <= 0) { toast('الكمية مطلوبة', 'warning'); return; }
    const expiry = val('phRecvExpiry');
    if (!expiry) { toast('تاريخ الانتهاء مطلوب لكل دفعة دواء', 'warning'); return; }
    const cost = numVal('phRecvCost') || Number(d.cost) || 0;
    const batch = {
      id: uid('phbatch'), batchNo: val('phRecvBatchNo') || ('B-' + Date.now().toString(36).toUpperCase()),
      expiry: expiry, qty: qty, cost: cost,
      supplierName: val('phRecvSupplier'), receivedAt: new Date().toISOString()
    };
    batches(d).push(batch);
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    p.movements.unshift({
      id: uid('phmov'), date: batch.receivedAt, type: 'in', productId: d.id, name: d.name,
      qty: qty, batches: batch.batchNo, ref: 'استلام', note: batch.supplierName ? ('من ' + batch.supplierName) : '',
      companyId: coId
    });
    p.movements = p.movements.slice(0, 1000);
    if (checked('phRecvPostExpense') && typeof window.addFinanceTransaction === 'function' && qty * cost > 0) {
      try {
        window.addFinanceTransaction({
          type: 'expense', direction: 'out', sourceType: 'pharmacy_purchase', sourceId: batch.id,
          amount: qty * cost, partyName: batch.supplierName || '',
          description: 'شراء دفعة ' + d.name + ' (' + batch.batchNo + ' × ' + qty + ')',
          companyId: coId
        }, { skipSave: true });
      } catch (e) { console.warn('Pharmacy purchase post failed', e); }
    }
    if (isExpired(batch)) toast('⚠️ انتبه: هذه الدفعة منتهية الصلاحية أصلاً', 'warning');
    else if (isNear(batch)) toast('⚠️ الدفعة قريبة الانتهاء (' + daysUntil(batch.expiry) + ' يوم)', 'warning');
    history('batch_receive', 'استلام دفعة ' + d.name + ' × ' + qty, { productId: d.id, batchNo: batch.batchNo });
    save(); renderTab();
    toast('استُلمت دفعة ' + d.name + ' × ' + qty + ' 📦', 'success');
  };
  window.phAdjustBatch = function (productId, batchId) {
    const d = products().find(x => x.id === productId); if (!d) return;
    const b = batches(d).find(x => x.id === batchId); if (!b) return;
    const v = prompt('الكمية الجديدة لدفعة ' + (b.batchNo || '') + ' (' + d.name + '):', b.qty);
    if (v == null) return;
    const q = Math.max(0, Math.floor(Number(v) || 0));
    const p = P();
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    p.movements.unshift({
      id: uid('phmov'), date: new Date().toISOString(), type: 'adjust', productId: d.id, name: d.name,
      qty: q - Number(b.qty || 0), batches: b.batchNo || '—', ref: 'جرد/تسوية', note: 'من ' + b.qty + ' إلى ' + q,
      companyId: coId
    });
    b.qty = q;
    history('batch_adjust', 'تسوية دفعة ' + d.name + ' (' + (b.batchNo || '') + ') → ' + q, { productId: d.id, batchId: b.id });
    save(); renderTab();
  };
  window.phLogFilter = function (v) {
    logFilter = String(v || '').trim().toLowerCase();
    const body = document.getElementById('phCtrlRows');
    if (body) body.innerHTML = controlledRowsHtml();
  };

  /* ----------------------------- render: shared bits ----------------------------- */
  function badgesFor(d) {
    let h = '';
    if (d.controlled) h += '<span class="ph-badge ctrl">رقابة</span>';
    else if (d.rx) h += '<span class="ph-badge rx">وصفة</span>';
    if (expiredQty(d) > 0) h += '<span class="ph-badge exp">منتهي ' + expiredQty(d) + '</span>';
    else if (nearQty(d) > 0) h += '<span class="ph-badge near">قريب الانتهاء</span>';
    if (sellableStock(d) <= minStock(d)) h += '<span class="ph-badge low">ناقص</span>';
    if (d.demo) h += '<span class="ph-badge demo">تجريبي</span>';
    if (d.archived) h += '<span class="ph-badge archived">مؤرشف</span>';
    return h;
  }
  function customerOptions(sel) {
    return '<option value="">—</option>' + customers().map(c =>
      '<option value="' + esc(c.id) + '"' + (c.id === sel ? ' selected' : '') + '>' + esc(c.name || c.id) + '</option>').join('');
  }

  /* ----------------------------- render: dashboard ----------------------------- */
  function dashboardHtml() {
    const sym = curSym();
    const prods = activeProducts();
    const ex = alertExpired(), nr = alertNear(), lo = alertLow();
    const value = prods.reduce((s, d) => s + stockValue(d), 0);
    const todayStr = new Date().toDateString();
    const o = O();
    const todays = pharmacySales().filter(s => s.businessType === 'pharmacy' && new Date(s.date).toDateString() === todayStr);
    const cash = todays.filter(s => s.payMode !== 'account').reduce((a, s) => a + money(s.paid != null ? s.paid : s.total), 0);
    const insDue = todays.reduce((a, s) => a + money(s.insurance ? s.insurance.amount : 0), 0);
    const ctrl = prods.filter(d => d.controlled).length;
    const kpi = (label, value2, cls) => '<div class="ph-kpi ' + (cls || '') + '"><div class="ph-kpi-label">' + label + '</div><div class="ph-kpi-value">' + value2 + '</div></div>';
    const alertCard = (cls, title, rows, emptyMsg) =>
      '<div class="ph-alert-card ' + cls + '"><div class="ph-alert-title">' + title + '<span>' + rows.length + '</span></div>'
      + (rows.length ? rows.slice(0, 8).join('') : '<div class="ph-alert-empty">' + emptyMsg + '</div>')
      + '</div>';
    return ''
      + (!prods.length ? '<div class="ph-demo-hint">🚀 ابدأ الصيدلية: أضف الأدوية من تبويب «الأدوية»، أو <button class="ph-btn primary" onclick="phLoadDemoData()">حمّل بيانات تجريبية</button> لاستكشاف FEFO والتنبيهات فوراً.</div>' : '')
      + '<div class="ph-kpis">'
      + kpi('الأدوية الفعّالة', prods.length, 'accent')
      + kpi('قيمة المخزون (كلفة)', fmt(value) + ' ' + sym, '')
      + kpi('مبيعات اليوم', todays.length + ' / ' + fmt(todays.reduce((a, s) => a + money(s.total), 0)) + ' ' + sym, 'ok')
      + kpi('نقد محصّل اليوم', fmt(cash) + ' ' + sym, 'ok')
      + kpi('ذمم تأمين اليوم', fmt(insDue) + ' ' + sym, insDue ? 'warn' : '')
      + kpi('دفعات منتهية', ex.length, ex.length ? 'danger' : 'ok')
      + kpi('قريبة الانتهاء ≤' + nearDays() + ' يوم', nr.length, nr.length ? 'warn' : 'ok')
      + kpi('تحت الحد الأدنى', lo.length, lo.length ? 'danger' : 'ok')
      + kpi('أدوية خاضعة للرقابة', ctrl, ctrl ? 'warn' : '')
      + '</div>'
      + '<div class="ph-alerts-grid">'
      + alertCard('danger', '🔴 منتهية الصلاحية — تُحجب عن الصرف تلقائياً', ex.map(r =>
        '<div class="ph-alert-row"><span>' + esc(r.drug.name) + ' <span class="muted">دفعة ' + esc(r.batch.batchNo || '—') + '</span></span><span class="muted">' + fmtDate(r.batch.expiry) + ' · ' + r.batch.qty + ' قطعة</span></div>'), 'لا شيء منتهٍ ✅')
      + alertCard('warn', '🟡 قريبة الانتهاء — صرّفها أولاً (FEFO يتكفّل)', nr.map(r =>
        '<div class="ph-alert-row"><span>' + esc(r.drug.name) + ' <span class="muted">' + esc(r.batch.batchNo || '—') + '</span></span><span class="muted">بعد ' + r.days + ' يوم · ' + r.batch.qty + '</span></div>'), 'لا شيء قريب الانتهاء ✅')
      + alertCard('low', '🔵 تحت الحد الأدنى — اطلب من المذخر', lo.map(r =>
        '<div class="ph-alert-row"><span>' + esc(r.drug.name) + '</span><span class="muted">' + r.stock + ' / حد ' + r.min + '</span></div>'), 'لا نواقص ✅')
      + '</div>'
      + (products().some(d => d.demo) ? '<div class="ph-toolbar"><span class="spacer"></span><button class="ph-btn danger mini" onclick="phRemoveDemoData()">إزالة البيانات التجريبية</button></div>' : '');
  }

  /* ----------------------------- render: dispense ----------------------------- */
  function prodGridHtml() {
    const sym = curSym();
    let list = activeProducts();
    if (dispSearch) list = list.filter(d =>
      String(d.name || '').toLowerCase().includes(dispSearch) ||
      String(d.genericName || '').toLowerCase().includes(dispSearch) ||
      String(d.barcode || '').includes(dispSearch));
    if (!list.length) return '<div class="ph-empty">لا أدوية' + (dispSearch ? ' مطابقة للبحث' : ' — أضِف من تبويب «الأدوية»') + '</div>';
    return list.slice(0, 200).map(d => {
      const stock = sellableStock(d);
      const out = stock <= 0;
      const ne = nearestExpiry(d);
      return '<button class="ph-prod" ' + (out ? 'disabled' : '') + ' onclick="phAddToCart(\'' + esc(d.id) + '\')">'
        + '<div class="ph-prod-name">' + esc(d.name) + (d.controlled ? ' <span class="ph-badge ctrl">رقابة</span>' : (d.rx ? ' <span class="ph-badge rx">وصفة</span>' : '')) + '</div>'
        + (d.genericName ? '<div class="ph-prod-generic">' + esc(d.genericName) + (d.form ? ' · ' + esc(d.form) : '') + '</div>' : '')
        + '<div class="ph-prod-meta"><span class="ph-prod-price">' + fmt(d.price) + ' ' + sym + '</span>'
        + '<span class="ph-prod-stock' + (out || stock <= minStock(d) ? ' low' : '') + '">' + (out ? 'نفد الصالح' : 'صالح ' + fmt(stock)) + (ne ? ' · ينتهي ' + fmtDate(ne) : '') + '</span></div>'
        + '</button>';
    }).join('');
  }
  function cartHtml() {
    const sym = curSym();
    const lines = cartLines();
    if (!lines.length) return '<div class="ph-cart-empty">السلة فارغة — امسح باركوداً أو اضغط على دواء</div>';
    return lines.map(l => {
      const fefo = l.plan.alloc.map(a => (a.batch.batchNo || '—') + '×' + a.take + (a.batch.expiry ? ' (' + fmtDate(a.batch.expiry) + ')' : '')).join('، ');
      return '<div class="ph-cart-line' + (l.plan.ok ? '' : ' blocked') + '">'
        + '<div class="ph-cart-line-top"><span class="ph-cart-name">' + esc(l.drug.name) + (l.drug.controlled ? ' 🔐' : (l.drug.rx ? ' 📜' : '')) + '</span>'
        + '<button class="ph-cart-x" onclick="phRemoveLine(\'' + esc(l.id) + '\')">✕</button></div>'
        + '<div class="ph-cart-line-bot">'
        + '<div class="ph-qty"><button onclick="phChangeQty(\'' + esc(l.id) + '\',-1)">−</button>'
        + '<input type="number" value="' + l.qty + '" min="0" onchange="phSetQty(\'' + esc(l.id) + '\', this.value)">'
        + '<button onclick="phChangeQty(\'' + esc(l.id) + '\',1)">+</button></div>'
        + '<span class="ph-line-total">' + fmt(l.total) + ' ' + sym + '</span></div>'
        + '<div class="ph-fefo-note' + (l.plan.ok ? '' : ' bad') + '">' + (l.plan.ok ? ('FEFO: ' + fefo) : ('⚠️ المتاح الصالح ' + l.plan.available + ' فقط')) + '</div>'
        + '</div>';
    }).join('');
  }
  function totalsHtml() {
    const sym = curSym();
    const T = computeTotals();
    return ''
      + '<div class="ph-totals-row"><span>المجموع</span><span>' + fmt(T.sub) + ' ' + sym + '</span></div>'
      + (T.discount ? '<div class="ph-totals-row"><span>الخصم (' + T.discPct + '%)</span><span class="neg">−' + fmt(T.discount) + '</span></div>' : '')
      + (T.insurerShare ? '<div class="ph-totals-row"><span>حصة التأمين (' + T.covPct + '%)</span><span class="ins">' + fmt(T.insurerShare) + '</span></div>' : '')
      + '<div class="ph-totals-row grand"><span>' + (payMode === 'account' ? 'على حساب العميل' : 'يدفع المريض') + '</span><span>' + fmt(T.patientShare) + ' ' + sym + '</span></div>';
  }
  function renderTotals() {
    const el = document.getElementById('phTotals');
    if (el) el.innerHTML = totalsHtml();
  }
  function renderCart() {
    const box = document.getElementById('phCartLines');
    if (box) box.innerHTML = cartHtml();
    renderTotals();
  }
  function dispenseHtml() {
    const anyRx = cartLines().some(l => l.drug.rx || l.drug.controlled);
    return ''
      + '<div class="ph-dispense-layout">'
      + '<div>'
      + '  <div class="ph-input-row">'
      + '    <input class="ph-barcode" id="phBarcode" type="text" placeholder="📷 امسح الباركود ثم Enter..." onkeydown="phScanEnter(event)" autofocus>'
      + '    <input class="ph-search" type="text" value="' + esc(dispSearch) + '" placeholder="🔍 ابحث بالاسم العلمي أو التجاري..." oninput="phDispSearch(this.value)">'
      + '  </div>'
      + '  <div class="ph-prod-grid" id="phProdGrid">' + prodGridHtml() + '</div>'
      + '</div>'
      + '<div class="ph-cart-pane">'
      + '  <div class="ph-cart-head">💊 صرف الأدوية <button class="ph-btn mini" onclick="phZReport()" title="تقرير اليوم Z">Z</button></div>'
      + '  <div class="ph-cart-lines" id="phCartLines">' + cartHtml() + '</div>'
      + '  <div class="ph-rxbox">'
      + '    <div class="ph-field"><label>المريض ' + (anyRx ? '(مطلوب 📜)' : '(اختياري)') + '</label><input id="phPatient" type="text" placeholder="اسم المريض"></div>'
      + '    <div class="ph-field"><label>الطبيب</label><input id="phDoctor" type="text" placeholder="اسم الطبيب"></div>'
      + '    <div class="ph-field"><label>خصم %</label><input id="phDiscount" type="number" min="0" max="100" value="0" oninput="phRecalc()"></div>'
      + '    <div class="ph-field"><label>تغطية التأمين %</label><input id="phCoverage" type="number" min="0" max="100" value="0" oninput="phRecalc()"></div>'
      + '    <div class="ph-field full"><label>جهة التأمين (من العملاء)</label><select id="phInsurer" onchange="phRecalc()">' + customerOptions('') + '</select></div>'
      + '  </div>'
      + '  <div class="ph-payrow">'
      + '    <div class="ph-paymode" id="phPayMode">'
      + '      <button class="' + (payMode === 'cash' ? 'active' : '') + '" onclick="phSetPayMode(\'cash\')">نقد</button>'
      + '      <button class="' + (payMode === 'account' ? 'active' : '') + '" onclick="phSetPayMode(\'account\')">آجل</button>'
      + '    </div>'
      + '    <select class="ph-customer-select" id="phCustomer"><option value="">عميل عابر</option>' + customers().map(c => '<option value="' + esc(c.id) + '">' + esc(c.name || c.id) + '</option>').join('') + '</select>'
      + '  </div>'
      + '  <div class="ph-totals" id="phTotals">' + totalsHtml() + '</div>'
      + '  <div class="ph-cart-actions">'
      + '    <button class="ph-btn-clear" onclick="phClearCart()">تفريغ</button>'
      + '    <button class="ph-btn-pay" onclick="phCheckout()">💵 إتمام الصرف</button>'
      + '  </div>'
      + '</div>'
      + '</div>';
  }

  /* ----------------------------- render: catalog ----------------------------- */
  function catalogHtml() {
    const sym = curSym();
    const editing = editingId ? products().find(d => d.id === editingId) : null;
    const e = editing || {};
    const formCard = ''
      + '<div class="ph-form-card"><div class="ph-form-title">' + (editing ? ('✏️ تعديل: ' + esc(e.name)) : '➕ إضافة دواء') + '</div>'
      + '<div class="ph-form-grid">'
      + '<div class="ph-field"><label>الاسم التجاري *</label><input id="phDrugName" type="text" value="' + esc(e.name || '') + '"></div>'
      + '<div class="ph-field"><label>الاسم العلمي</label><input id="phDrugGeneric" type="text" value="' + esc(e.genericName || '') + '"></div>'
      + '<div class="ph-field"><label>الشكل الدوائي</label><select id="phDrugForm">' + FORMS.map(f => '<option' + (e.form === f ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></div>'
      + '<div class="ph-field"><label>الباركود</label><input id="phDrugBarcode" type="text" value="' + esc(e.barcode || '') + '"></div>'
      + '<div class="ph-field"><label>سعر البيع *</label><input id="phDrugPrice" type="number" min="0" value="' + (e.price || '') + '"></div>'
      + '<div class="ph-field"><label>الكلفة</label><input id="phDrugCost" type="number" min="0" value="' + (e.cost || '') + '"></div>'
      + '<div class="ph-field"><label>الحد الأدنى</label><input id="phDrugMin" type="number" min="0" value="' + (e.minStock != null ? e.minStock : P().settings.defaultMinStock) + '"></div>'
      + '<div class="ph-field"><label>ملاحظات</label><input id="phDrugNotes" type="text" value="' + esc(e.notes || '') + '"></div>'
      + '</div>'
      + '<div class="ph-checks">'
      + '<label><input type="checkbox" id="phDrugRx"' + (e.rx ? ' checked' : '') + '> 📜 يتطلب وصفة طبية</label>'
      + '<label><input type="checkbox" id="phDrugCtrl"' + (e.controlled ? ' checked' : '') + '> 🔐 خاضع للرقابة (يستلزم وصفة وطبيباً)</label>'
      + '</div>'
      + '<div class="ph-form-actions">'
      + '<button class="ph-btn primary" onclick="phSaveDrug()">' + (editing ? 'حفظ التعديل' : 'إضافة الدواء') + '</button>'
      + (editing ? '<button class="ph-btn ghost" onclick="phCancelEdit()">إلغاء</button>' : '')
      + (!products().length ? '<button class="ph-btn" onclick="phLoadDemoData()">تحميل بيانات تجريبية</button>' : '')
      + '</div></div>';
    const rows = products().map(d => {
      const stock = sellableStock(d);
      return '<tr class="' + (expiredQty(d) ? 'ph-row-expired ' : '') + (d.archived ? 'ph-row-archived' : '') + '">'
        + '<td><b>' + esc(d.name) + '</b>' + badgesFor(d) + '<div class="muted">' + esc(d.genericName || '') + (d.form ? ' · ' + esc(d.form) : '') + '</div></td>'
        + '<td class="muted">' + esc(d.barcode || '—') + '</td>'
        + '<td class="num">' + fmt(d.price) + ' ' + sym + '</td>'
        + '<td class="num">' + fmt(stock) + (totalStock(d) !== stock ? ' <span class="muted">/ ' + fmt(totalStock(d)) + ' كلي</span>' : '') + '</td>'
        + '<td class="muted">' + (nearestExpiry(d) ? fmtDate(nearestExpiry(d)) : '—') + '</td>'
        + '<td class="num muted">' + fmt(stockValue(d)) + '</td>'
        + '<td>'
        + '<button class="ph-btn mini" onclick="phEditDrug(\'' + esc(d.id) + '\')">✏️</button> '
        + '<button class="ph-btn mini" onclick="phGoReceive(\'' + esc(d.id) + '\')">📦 دفعة</button> '
        + '<button class="ph-btn mini ghost" onclick="phToggleArchive(\'' + esc(d.id) + '\')">' + (d.archived ? '↩️ استعادة' : '🗄️ أرشفة') + '</button>'
        + '</td></tr>';
    }).join('');
    return formCard
      + '<div class="ph-table-wrap"><table class="ph-table"><thead><tr>'
      + '<th>الدواء</th><th>الباركود</th><th>السعر</th><th>الصالح</th><th>أقرب انتهاء</th><th>قيمة المخزون</th><th>إجراءات</th>'
      + '</tr></thead><tbody>' + (rows || '<tr><td colspan="7" class="ph-empty">لا أدوية بعد</td></tr>') + '</tbody></table></div>';
  }

  /* ----------------------------- render: receiving ----------------------------- */
  function receivingHtml() {
    const prods = activeProducts();
    const allBatches = [];
    products().forEach(d => batches(d).forEach(b => allBatches.push({ d: d, b: b })));
    allBatches.sort((x, y) => String(x.b.expiry || '9999').localeCompare(String(y.b.expiry || '9999')));
    const rows = allBatches.map(r => {
      const st = isExpired(r.b) ? '<span class="ph-badge exp">منتهية</span>' : (isNear(r.b) ? '<span class="ph-badge near">' + daysUntil(r.b.expiry) + ' يوم</span>' : '');
      return '<tr class="' + (isExpired(r.b) && r.b.qty > 0 ? 'ph-row-expired' : '') + '">'
        + '<td><b>' + esc(r.d.name) + '</b></td>'
        + '<td>' + esc(r.b.batchNo || '—') + '</td>'
        + '<td>' + fmtDate(r.b.expiry) + ' ' + st + '</td>'
        + '<td class="num">' + fmt(r.b.qty) + '</td>'
        + '<td class="num muted">' + fmt(r.b.cost) + '</td>'
        + '<td class="muted">' + esc(r.b.supplierName || '—') + '</td>'
        + '<td class="muted">' + fmtDate(r.b.receivedAt) + '</td>'
        + '<td><button class="ph-btn mini" onclick="phAdjustBatch(\'' + esc(r.d.id) + '\',\'' + esc(r.b.id) + '\')">⚖️ جرد</button></td>'
        + '</tr>';
    }).join('');
    return ''
      + '<div class="ph-form-card"><div class="ph-form-title">📦 استلام دفعة جديدة (من المذخر / المورد)</div>'
      + '<div class="ph-form-grid">'
      + '<div class="ph-field"><label>الدواء *</label><select id="phRecvProduct">' + '<option value="">— اختر —</option>'
      + prods.map(d => '<option value="' + esc(d.id) + '"' + (d.id === recvProductId ? ' selected' : '') + '>' + esc(d.name) + '</option>').join('') + '</select></div>'
      + '<div class="ph-field"><label>رقم الدفعة</label><input id="phRecvBatchNo" type="text" placeholder="مثال: AMX-77"></div>'
      + '<div class="ph-field"><label>تاريخ الانتهاء *</label><input id="phRecvExpiry" type="date"></div>'
      + '<div class="ph-field"><label>الكمية *</label><input id="phRecvQty" type="number" min="1"></div>'
      + '<div class="ph-field"><label>كلفة الوحدة</label><input id="phRecvCost" type="number" min="0" placeholder="افتراضي: كلفة الدواء"></div>'
      + '<div class="ph-field"><label>المورد / المذخر</label><input id="phRecvSupplier" type="text"></div>'
      + '</div>'
      + '<div class="ph-checks"><label><input type="checkbox" id="phRecvPostExpense" checked> 💸 تسجيل مصروف شراء في المالية (كمية × كلفة)</label></div>'
      + '<div class="ph-form-actions"><button class="ph-btn primary" onclick="phAddBatch()">استلام الدفعة</button></div>'
      + '</div>'
      + '<div class="ph-section-title">كل الدفعات (الأقرب انتهاءً أولاً — منطق FEFO نفسه)</div>'
      + '<div class="ph-table-wrap"><table class="ph-table"><thead><tr>'
      + '<th>الدواء</th><th>الدفعة</th><th>الانتهاء</th><th>المتبقي</th><th>الكلفة</th><th>المورد</th><th>الاستلام</th><th></th>'
      + '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="ph-empty">لا دفعات بعد</td></tr>') + '</tbody></table></div>';
  }

  /* ----------------------------- render: prescriptions ----------------------------- */
  function prescriptionsHtml() {
    const p = P();
    const rows = prescriptions().slice(0, 200).map(r =>
      '<tr><td>' + new Date(r.date).toLocaleString('ar-IQ') + '</td>'
      + '<td><b>' + esc(r.patient) + '</b></td>'
      + '<td>' + esc(r.doctor || '—') + '</td>'
      + '<td>' + r.items.map(i => esc(i.name) + ' ×' + i.qty).join('، ') + '</td>'
      + '<td class="muted">' + esc(r.saleRef || '') + '</td>'
      + '<td><button class="ph-btn mini" onclick="phPrintSale(\'' + esc(r.saleId) + '\')">🖨️</button></td></tr>').join('');
    return '<div class="ph-section-title">📜 الوصفات المصروفة (تُسجَّل تلقائياً عند صرف دواء بوصفة)</div>'
      + '<div class="ph-table-wrap"><table class="ph-table"><thead><tr>'
      + '<th>التاريخ</th><th>المريض</th><th>الطبيب</th><th>الأدوية</th><th>المرجع</th><th></th>'
      + '</tr></thead><tbody>' + (rows || '<tr><td colspan="6" class="ph-empty">لا وصفات بعد</td></tr>') + '</tbody></table></div>';
  }

  /* ----------------------------- render: controlled log ----------------------------- */
  function controlledRowsHtml() {
    const p = P();
    let rows = controlledLog();
    if (logFilter) rows = rows.filter(r =>
      String(r.name || '').toLowerCase().includes(logFilter) ||
      String(r.patient || '').toLowerCase().includes(logFilter) ||
      String(r.doctor || '').toLowerCase().includes(logFilter));
    return rows.slice(0, 300).map(r =>
      '<tr><td>' + new Date(r.date).toLocaleString('ar-IQ') + '</td>'
      + '<td><b>' + esc(r.name) + '</b> <span class="ph-badge ctrl">رقابة</span></td>'
      + '<td class="num">' + r.qty + '</td>'
      + '<td class="muted">' + esc(r.batches || '—') + '</td>'
      + '<td>' + esc(r.patient || '—') + '</td>'
      + '<td>' + esc(r.doctor || '—') + '</td>'
      + '<td class="muted">' + esc(r.saleRef || '') + '</td>'
      + '<td class="muted">' + esc(r.byUser || '—') + '</td></tr>').join('')
      || '<tr><td colspan="8" class="ph-empty">السجل فارغ' + (logFilter ? ' (لا نتائج للبحث)' : '') + '</td></tr>';
  }
  function controlledHtml() {
    return '<div class="ph-toolbar">'
      + '<input class="ph-search" style="max-width:320px" type="text" placeholder="🔍 بحث بالدواء / المريض / الطبيب..." oninput="phLogFilter(this.value)">'
      + '<span class="spacer"></span>'
      + '<button class="ph-btn" onclick="phPrintControlledLog()">🖨️ طباعة السجل الرسمي</button>'
      + '</div>'
      + '<div class="ph-table-wrap"><table class="ph-table"><thead><tr>'
      + '<th>التاريخ</th><th>الدواء</th><th>كمية</th><th>الدفعات</th><th>المريض</th><th>الطبيب</th><th>المرجع</th><th>الصيدلاني</th>'
      + '</tr></thead><tbody id="phCtrlRows">' + controlledRowsHtml() + '</tbody></table></div>'
      + '<p style="color:#94a3b8;font-size:11.5px;margin-top:8px">سجل إلزامي append-only: كل صرف لمادة خاضعة للرقابة يُقيَّد تلقائياً باسم المريض والطبيب والدفعة، ولا يُحذف.</p>';
  }

  /* ----------------------------- render: page ----------------------------- */
  function tabBadge(id) {
    if (id === 'dashboard') { const n = alertExpired().length + alertLow().length; return n ? '<span class="ph-tab-badge">' + n + '</span>' : ''; }
    return '';
  }
  window.phOpenTab = function (id) {
    if (!TABS.some(t => t.id === id)) return;
    tab = id;
    render();
  };
  function renderTab() {
    const body = document.getElementById('phTabBody');
    if (!body) return;
    body.innerHTML =
      tab === 'dispense' ? dispenseHtml()
        : tab === 'catalog' ? catalogHtml()
          : tab === 'receiving' ? receivingHtml()
            : tab === 'prescriptions' ? prescriptionsHtml()
              : tab === 'controlled' ? controlledHtml()
                : dashboardHtml();
    if (tab === 'dispense') { const bc = document.getElementById('phBarcode'); if (bc) { try { bc.focus(); } catch (_) {} } }
  }
  function render() {
    const root = document.getElementById('pharmacyBody');
    if (!root) return;
    ensureData();
    root.innerHTML = ''
      + '<div class="ph-tabs">' + TABS.map(t =>
        '<button class="ph-tab' + (t.id === tab ? ' active' : '') + '" onclick="phOpenTab(\'' + t.id + '\')">' + t.name + tabBadge(t.id) + '</button>').join('')
      + '</div>'
      + '<div id="phTabBody"></div>';
    renderTab();
  }

  /* ----------------------------- page wiring ----------------------------- */
  function activatePage() {
    document.querySelectorAll('.page').forEach(pg => pg.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pagePharmacy'); if (pg) pg.classList.add('page-active');
    const nav = document.getElementById('navPharmacy'); if (nav) nav.classList.add('active');
    window.currentPage = 'pharmacy';
    ensureData(); render();
  }
  function injectPosBanner() {
    try {
      const o = O();
      if (!o || !o.platform || o.platform.businessType !== 'pharmacy') return;
      const body = document.getElementById('posBody');
      if (!body || document.getElementById('phPosBanner')) return;
      const div = document.createElement('div');
      div.id = 'phPosBanner';
      div.className = 'ph-pos-banner';
      div.innerHTML = '<span>💊 نوع النشاط الحالي <b>صيدلية</b> — للصرف بالدفعات والوصفات والرقابة استخدم شاشة الصيدلية المتخصصة.</span>'
        + '<button class="ph-btn primary mini" onclick="switchPage(\'pharmacy\')">فتح الصيدلية</button>';
      body.insertBefore(div, body.firstChild);
    } catch (_) {}
  }
  function wireSwitch() {
    if (window.__ptxPharmacyWrapped) return;
    if (typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'pharmacy') { try { activatePage(); } catch (e) { console.warn('Pharmacy render error', e); } return; }
      const r = orig.apply(this, arguments);
      if (page === 'pos') { try { setTimeout(injectPosBanner, 50); } catch (_) {} }
      return r;
    };
    window.__ptxPharmacyWrapped = true;
  }
  function wireZ() {
    if (window.__ptxPharmacyZWrapped) return;
    if (typeof window.posZReport !== 'function') return;
    const origZ = window.posZReport;
    window.posZReport = function () {
      const o = O();
      if (o && o.platform && o.platform.businessType === 'pharmacy') return phZReport();
      return origZ.apply(this, arguments);
    };
    window.__ptxPharmacyZWrapped = true;
  }
  function wireJarvis() {
    try {
      if (!window.JarvisBrain || !window.JarvisBrain.tools) return false;
      if (window.JarvisBrain.tools.report_pharmacy_alerts) return true;
      window.JarvisBrain.tools.report_pharmacy_alerts = {
        risk: 'safe',
        desc_en: 'Pharmacy: report expired, near-expiry and low-stock drugs.',
        desc_ar: 'الصيدلية: تقرير الأدوية المنتهية وقريبة الانتهاء والناقصة.',
        params: {},
        run: function () { try { return { ok: true, message: alertsSummaryText() }; } catch (e) { return { ok: false, message: 'تعذر قراءة بيانات الصيدلية.' }; } }
      };
      return true;
    } catch (_) { return false; }
  }
  function init() {
    wireSwitch(); wireZ(); wireJarvis();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      wireSwitch(); wireZ(); wireJarvis();
      if ((window.__ptxPharmacyWrapped && window.__ptxPharmacyZWrapped) || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  const api = {
    render: render,
    ensureData: ensureData,
    fefoPlan: fefoPlan,
    alerts: { expired: alertExpired, near: alertNear, low: alertLow, summary: alertsSummaryText },
    open: function () { try { window.switchPage('pharmacy'); } catch (_) {} }
  };
  window.OctagonPharmacy = api;
  window.PentagonPharmacy = api;
})();
