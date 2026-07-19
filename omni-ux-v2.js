/**
 * OCTAGON OMNISYSTEM — omni-ux-v2.js
 * 
 * Comprehensive UX enhancement patch:
 *   1. Numeric QR codes for equipment (format: XXXX-XXXX-XXXX-XXXX)
 *   2. Barcode-driven fast dispatch workflow with receipt printing
 *   3. Inventory compact card view (replaces table on materials tab)
 *   4. Equipment active dispatch view overhaul  
 *   5. Consumables tracking in dispatch slips
 *   6. Return-from-custody workflow with inventory reconciliation
 */

(function () {
  'use strict';

  /* ============================================================
     1. NUMERIC QR CODE GENERATION
     Format: CCCC-LLLL-SSSS-NNNN
       CC = Category code (2 digits)
       LL = Location code (2 digits)
       SS = Status code (2 digits)
       NN = Sequence index (4 digits)
     ============================================================ */
  const CATEGORY_CODES = {
    'أدوات يدوية':    '11',
    'أدوات كهربائية': '12',
    'أدوات هوائية':   '13',
    'أدوات قياس':     '14',
    'كوابس':          '15',
    'أجهزة مكتبية':   '21',
    'أجهزة كهربائية': '22',
    'طابعات ومكائن':  '23',
    'كوابس حرارية':   '24',
  };
  const LOCATION_CODES = {
    'الادارة':           '01',
    'المطبخ':            '02',
    'غرفة الطابعات':    '03',
    'غرفة لصق وتجليد':  '04',
    'المكتب':            '05',
    'المستودع':          '06',
    'ساحة الورشة':      '07',
  };

  function generateNumericQR(eq, index) {
    const catCode  = CATEGORY_CODES[eq.category]  || '99';
    const locCode  = LOCATION_CODES[eq.location]   || '00';
    const statusCode = eq.status === 'operational' ? '01'
                     : eq.status === 'dispatched'  ? '02'
                     : eq.status === 'maintenance' ? '03' : '04';
    const seq = String(index + 1).padStart(4, '0');
    return `${catCode}${locCode}-${statusCode}${seq}-${catCode}${locCode}-${statusCode}${seq}`;
  }

  function formatNumericQR(qrCode) {
    // Display as XXXX-XXXX-XXXX-XXXX in styled groups
    const parts = qrCode.split('-');
    return `<span class="eq-numeric-qr">
      ${parts.map(p => `<span class="eq-numeric-qr-group">${p}</span>`).join('<span style="color:var(--text-muted);margin:0 1px;">-</span>')}
    </span>`;
  }

  // Upgrade all equipment to have numeric QR
  function upgradeEquipmentNumericQR() {
    if (!window.omni || !Array.isArray(window.omni.equipment)) return;
    window.omni.equipment.forEach((eq, index) => {
      if (!eq.numericQR) {
        eq.numericQR = generateNumericQR(eq, index);
      }
    });
    if (typeof window.saveData === 'function') window.saveData();
  }

  /* ============================================================
     2. BARCODE DISPATCH SCANNER
     State for the in-page barcode dispatcher
     ============================================================ */
  window.dispatchScanState = {
    pendingItems: [],  // [{id, name, barcode, location, category}]
    employee: '',
    jobSite: '',
    expectedReturn: '',
    consumables: [], // [{materialId, name, qty, unit, note}]
  };

  // Called on each scan — resolves equipment by barcode (numeric or legacy)
  window.processEquipmentBarcodeScan = function () {
    const input = document.getElementById('eqScanInput');
    if (!input) return;
    const raw = input.value.trim();
    if (!raw) return;

    const eq = findEquipmentByAnyBarcode(raw);
    if (!eq) {
      showScanFeedback('error', `لم يُعثر على معدة بالباركود: ${raw}`);
      input.value = '';
      return;
    }
    if (eq.status !== 'operational') {
      showScanFeedback('error', `"${eq.name}" ليست في حالة جاهزة (${eq.status})`);
      input.value = '';
      return;
    }
    if (window.dispatchScanState.pendingItems.find(x => x.id === eq.id)) {
      showScanFeedback('error', `"${eq.name}" أضيفت بالفعل`);
      input.value = '';
      return;
    }

    window.dispatchScanState.pendingItems.push({
      id: eq.id, name: eq.name,
      barcode: eq.barcode,
      location: eq.location,
      category: eq.category,
    });
    showScanFeedback('ok', `✓ تمت إضافة: ${eq.name}`);
    input.value = '';
    renderScanPendingList();
  };

  function findEquipmentByAnyBarcode(code) {
    const eqs = (window.omni && window.omni.equipment) || [];
    return eqs.find(e =>
      e.barcode === code ||
      e.numericQR === code ||
      (e.numericQR && e.numericQR.replace(/-/g, '') === code.replace(/-/g, ''))
    );
  }

  function showScanFeedback(type, msg) {
    const zone = document.getElementById('eqScanZone');
    const feedback = document.getElementById('eqScanFeedback');
    if (zone) {
      zone.classList.toggle('active', type === 'ok');
      zone.classList.toggle('error',  type === 'error');
      setTimeout(() => { zone.classList.remove('active', 'error'); }, 600);
    }
    if (feedback) {
      feedback.textContent = msg;
      feedback.style.color = type === 'ok' ? '#34d399' : '#f87171';
    }
    if (typeof window.showToast === 'function') {
      window.showToast(msg, type === 'ok' ? 'success' : 'error');
    }
  }

  function renderScanPendingList() {
    const el = document.getElementById('eqScanPendingList');
    const count = document.getElementById('eqScanCount');
    if (!el) return;
    const items = window.dispatchScanState.pendingItems;
    if (count) count.textContent = items.length;
    el.innerHTML = items.length === 0
      ? `<p style="color:var(--text-muted);text-align:center;padding:16px;font-size:12px;">
           امسح الباركود أو اكتب رقم الأداة لإضافتها
         </p>`
      : items.map(item => `
          <div class="dispatch-item-row">
            <div style="display:flex;flex-direction:column;gap:2px;">
              <span class="eq-name">${escHtml(item.name)}</span>
              <span class="eq-barcode">${escHtml(item.barcode)}</span>
            </div>
            <span class="eq-loc"><i class="fa-solid fa-location-dot"></i> ${escHtml(item.location)}</span>
            <button class="remove-btn" onclick="window.removeScanItem('${item.id}')">
              <i class="fa-solid fa-xmark"></i>
            </button>
          </div>
        `).join('');
  }

  window.removeScanItem = function (id) {
    window.dispatchScanState.pendingItems =
      window.dispatchScanState.pendingItems.filter(x => x.id !== id);
    renderScanPendingList();
  };

  /* ── Confirm dispatch — create dispatch records & print receipt ── */
  window.confirmBarcodeDispatch = async function () {
    const state = window.dispatchScanState;
    if (!state.pendingItems.length) {
      return window.showToast('يرجى مسح الباركود أولاً', 'warning');
    }
    const empEl  = document.getElementById('eqScanEmployee');
    const siteEl = document.getElementById('eqScanSite');
    const dateEl = document.getElementById('eqScanReturnDate');

    const employee    = empEl?.value.trim()  || '';
    const jobSite     = siteEl?.value.trim() || '';
    const expReturn   = dateEl?.value        || '';
    const consumables = collectConsumables();

    if (!employee) return window.showToast('يرجى تحديد الموظف المستلم', 'warning');
    if (!jobSite)  return window.showToast('يرجى كتابة موقع العمل', 'warning');

    if (!window.omni || !Array.isArray(window.omni.equipment)) {
      return window.showToast('خطأ: البيانات غير محملة', 'error');
    }

    const checkoutDate = new Date().toISOString().slice(0, 10);
    const dispatchId   = 'disp_' + Date.now().toString(36);
    const dispatchNum  = `DIS/${new Date().getFullYear()}/${String((window.omni.equipmentDispatches || []).length + 1).padStart(4, '0')}`;

    window.omni.equipmentDispatches = window.omni.equipmentDispatches || [];

    state.pendingItems.forEach(item => {
      const eq = window.omni.equipment.find(e => e.id === item.id);
      if (eq) {
        eq.status = 'dispatched';
        eq.currentDispatchId = dispatchId;
      }
      window.omni.equipmentDispatches.push({
        id: dispatchId + '_' + item.id,
        dispatchNumber: dispatchNum,
        batchId: dispatchId,
        equipmentId:      item.id,
        equipmentName:    item.name,
        equipmentBarcode: item.barcode,
        equipmentNumericQR: item.barcode,
        employeeName:     employee,
        jobSite:          jobSite,
        checkoutDate,
        expectedReturnDate: expReturn,
        actualReturnDate: null,
        status: 'dispatched',
        conditionOnReturn: null,
        consumables: consumables,
      });
    });

    // Deduct consumables from inventory
    consumables.forEach(c => {
      const mat = (window.omni.materials || []).find(m => m.id === c.materialId);
      if (mat && c.qty > 0) {
        mat.stock = Math.max(0, Number(mat.stock || 0) - c.qty);
        if (typeof window.recordStockMovement === 'function') {
          window.recordStockMovement(mat.id, 'out', c.qty, {
            sourceType: 'dispatch', ref: dispatchNum, note: `صرف لترحيل ${employee}`
          });
        }
      }
    });

    if (typeof window.saveData === 'function') window.saveData();

    // Print receipt
    printDispatchReceipt({
      dispatchNum, employee, jobSite, checkoutDate, expReturn,
      items: [...state.pendingItems],
      consumables,
    });

    window.showToast(`تم الترحيل بنجاح — وصل رقم ${dispatchNum}`, 'success');

    // Reset state
    state.pendingItems = [];
    state.consumables  = [];
    if (empEl)  empEl.value  = '';
    if (siteEl) siteEl.value = '';

    if (typeof window.renderEquipmentPage === 'function') window.renderEquipmentPage();
  };

  function collectConsumables() {
    const rows = document.querySelectorAll('.consumable-dispatch-row');
    const result = [];
    rows.forEach(row => {
      const matId = row.dataset.matid;
      const qty   = parseFloat(row.querySelector('.cons-qty')?.value || 0);
      const mat   = (window.omni?.materials || []).find(m => m.id === matId);
      if (mat && qty > 0) {
        result.push({ materialId: matId, name: mat.name, qty, unit: mat.unit || 'قطعة' });
      }
    });
    return result;
  }

  /* ── Print dispatch receipt slip ── */
  function printDispatchReceipt(data) {
    const w = window.open('', '_blank', 'width=500,height=700');
    if (!w) return;
    const itemsHtml = data.items.map(i =>
      `<tr>
        <td style="padding:6px 8px;">${i.name}</td>
        <td style="padding:6px 8px;text-align:center;">${i.barcode}</td>
        <td style="padding:6px 8px;text-align:center;">${i.location}</td>
        <td style="padding:6px 8px;text-align:center;font-size:11px;">أدوات (Tools)</td>
      </tr>`
    ).join('');
    const consHtml = data.consumables.length
      ? `<h4 style="margin:10px 0 4px;">المواد الاستهلاكية المصروفة</h4>
         <table style="width:100%;border-collapse:collapse;font-size:12px;">
           <thead><tr style="background:#eee;">
             <th style="padding:4px 8px;">المادة</th>
             <th style="padding:4px 8px;">الكمية</th>
           </tr></thead>
           <tbody>
             ${data.consumables.map(c => `<tr><td style="padding:4px 8px;">${c.name}</td><td style="padding:4px 8px;text-align:center;">${c.qty} ${c.unit}</td></tr>`).join('')}
           </tbody>
         </table>`
      : '';

    w.document.open();
    w.document.write(`<!DOCTYPE html>
<html dir="rtl"><head>
<title>وصل ترحيل — ${data.dispatchNum}</title>
<style>
  body { font-family: Arial, 'Tajawal', sans-serif; padding:20px; color:#111; font-size:13px; }
  h2   { text-align:center; border-bottom:3px double #000; padding-bottom:8px; font-size:17px; }
  .meta{ display:grid; grid-template-columns:1fr 1fr; gap:6px 16px; margin:12px 0; }
  .meta-item { display:flex; flex-direction:column; }
  .meta-item b { font-size:10px; color:#555; }
  .meta-item span { font-size:13px; font-weight:700; }
  table { width:100%; border-collapse:collapse; margin-bottom:14px; }
  th    { background:#222; color:#fff; padding:6px 8px; text-align:right; font-size:11px; }
  td    { border-bottom:1px solid #ddd; }
  .sig  { display:grid; grid-template-columns:1fr 1fr; gap:20px; margin-top:20px; }
  .sig-box { border-top:1.5px solid #000; padding-top:6px; text-align:center; min-height:50px; font-size:11px; }
  .footer { text-align:center; margin-top:16px; font-size:10px; color:#888; border-top:1px solid #ccc; padding-top:8px; }
  @media print { button { display:none; } }
</style>
</head><body>
<h2>⚙️ وصل ترحيل معدات وأدوات — OCTAGON WORKSHOP</h2>
<div class="meta">
  <div class="meta-item"><b>رقم الوصل</b><span>${data.dispatchNum}</span></div>
  <div class="meta-item"><b>تاريخ الترحيل</b><span>${data.checkoutDate}</span></div>
  <div class="meta-item"><b>اسم الموظف المستلم</b><span>${data.employee}</span></div>
  <div class="meta-item"><b>موقع العمل</b><span>${data.jobSite}</span></div>
  <div class="meta-item"><b>تاريخ الإرجاع المتوقع</b><span>${data.expReturn || 'غير محدد'}</span></div>
  <div class="meta-item"><b>عدد الأصناف</b><span>${data.items.length} صنف</span></div>
</div>

<h4 style="margin:8px 0 4px;">الأدوات والمعدات المُسلَّمة</h4>
<table>
  <thead><tr>
    <th>اسم الأداة</th>
    <th>رقم التعريف (QR)</th>
    <th>موقع التخزين</th>
    <th>النوع</th>
  </tr></thead>
  <tbody>${itemsHtml}</tbody>
</table>

${consHtml}

<div class="sig">
  <div class="sig-box">توقيع المسلِّم (المشرف)<br><br>الاسم: _____________________</div>
  <div class="sig-box">توقيع المستلِم (${data.employee})<br><br>الاسم: _____________________</div>
</div>
<p style="font-size:11px;color:#555;margin-top:12px;">تعهد: أتعهد بالمحافظة على هذه الأدوات وإرجاعها في حالة سليمة وفي الموعد المحدد.</p>
<div class="footer">Octagon Workshop Asset Management System • ${new Date().toLocaleString('ar-IQ')}</div>
<script>window.onload = function() { window.print(); }<\/script>
</body></html>`);
    w.document.close();
  }

  /* ============================================================
     3. INVENTORY COMPACT CARD VIEW (overrides materials tab)
     ============================================================ */
  // Patch renderInventoryPage to use card view for materials tab
  const _origRenderInventoryPage = window.renderInventoryPage;
  window.renderInventoryPage = async function () {
    await _origRenderInventoryPage.call(this);
    // After rendering, if we're on the materials tab, replace table with card grid
    if (window.inventoryActiveTab === 'materials') {
      patchInventoryMaterialsToCards();
    }
  };

  function patchInventoryMaterialsToCards() {
    const tableWrap = document.querySelector('#inventoryBody .inv-table-wrap');
    if (!tableWrap) return;
    // Already patched?
    if (document.getElementById('invMatCardGrid')) return;

    const ensureO = () => window.omni || {};
    const omni = ensureO();
    let allMats = Array.isArray(omni.materials) ? omni.materials : [];
    if (typeof window.scoped === 'function') allMats = window.scoped(allMats);

    let v5Db = null;
    try {
      // Attempt to pull quants synchronously from last known state
      v5Db = window._lastV5Db || null;
    } catch (_) {}
    const locations = v5Db?.locations || [];

    const filterSearch = (window.inventoryFilters?.search || '').toLowerCase();
    const filterCat    = window.inventoryFilters?.category || 'all';
    const filterStatus = window.inventoryFilters?.status   || 'all';

    const mats = allMats.filter(m => {
      if (filterSearch && !m.name.toLowerCase().includes(filterSearch) &&
          !(m.category || '').toLowerCase().includes(filterSearch) &&
          !(m.supplier || '').toLowerCase().includes(filterSearch)) return false;
      if (filterCat !== 'all' && m.category !== filterCat) return false;
      if (filterStatus !== 'all') {
        const avail = getAvail(m);
        if (filterStatus === 'critical' && avail > m.minimum) return false;
        if (filterStatus === 'ok'       && avail <= m.minimum) return false;
      }
      return true;
    });

    const orgSymbol = omni.adminSettings?.organization?.currencySymbol || 'د.ع';

    const cardsHtml = mats.map(m => {
      const avail    = getAvail(m);
      const reserved = getReserved(m);
      const critical = avail <= (m.minimum || 0);
      const thumb    = m.photoUrl
        ? `<img src="${escHtml(m.photoUrl)}" alt="" onerror="this.style.display='none'">`
        : `<span style="font-size:22px;">📦</span>`;

      // Location quants
      const matQuants = (v5Db?.quants || []).filter(q => q.product_id === m.id && q.quantity > 0);
      const locBadges = matQuants.slice(0, 3).map(q => {
        const loc = locations.find(l => l.id === q.location_id);
        return `<span class="loc-badge">${escHtml(loc?.name || q.location_id)}: ${Number(q.quantity).toFixed(0)}</span>`;
      }).join('') || `<span class="loc-badge">المستودع الرئيسي: ${Number(m.stock || 0).toFixed(0)}</span>`;

      return `
        <div class="inv-mat-card${critical ? ' critical' : ''}" onclick="openInspector('material','${m.id}')">
          <div class="inv-mat-card-thumb">${thumb}</div>
          <div class="inv-mat-card-info">
            <div class="inv-mat-card-name">${escHtml(m.name)}</div>
            <div class="inv-mat-card-cat">${escHtml(m.category || '')} ${m.supplier ? '— ' + escHtml(m.supplier) : ''}</div>
            <div class="inv-mat-card-stats">
              <div class="inv-mat-stat">
                <span class="inv-mat-stat-val">${Number(m.stock || 0).toFixed(0)}</span>
                <span class="inv-mat-stat-lbl">المخزون</span>
              </div>
              <div class="inv-mat-stat">
                <span class="inv-mat-stat-val" style="color:${critical?'#f87171':'#67e8f9'}">${avail}</span>
                <span class="inv-mat-stat-lbl">المتاح</span>
              </div>
              <div class="inv-mat-stat">
                <span class="inv-mat-stat-val" style="color:#fbbf24">${reserved}</span>
                <span class="inv-mat-stat-lbl">المحجوز</span>
              </div>
              <div class="inv-mat-stat">
                <span class="inv-mat-stat-val" style="color:#a78bfa">${m.minimum || 0}</span>
                <span class="inv-mat-stat-lbl">الحد الأدنى</span>
              </div>
            </div>
            <div class="inv-mat-card-loc">${locBadges}</div>
          </div>
          <div class="inv-mat-card-footer">
            <span style="font-size:10px;color:var(--text-muted)">${Number(m.cost||0).toLocaleString()} ${escHtml(orgSymbol)}/وحدة</span>
            <div style="display:flex;gap:4px;">
              <button class="btn-secondary" style="padding:3px 8px;font-size:10px;" onclick="event.stopPropagation();editMaterial('${m.id}')"><i class="fa-solid fa-pen"></i></button>
              ${critical ? `<button class="btn-primary" style="padding:3px 8px;font-size:10px;" onclick="event.stopPropagation();createPurchaseRequest('${m.id}')">طلب شراء</button>` : ''}
              <button class="btn-secondary" style="padding:3px 8px;font-size:10px;background:rgba(56,189,248,0.1);color:#38bdf8;border-color:rgba(56,189,248,0.2);" onclick="event.stopPropagation();openInventoryLocationTransfer('${m.id}')" title="تحويل بين المواقع"><i class="fa-solid fa-right-left"></i></button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    const grid = document.createElement('div');
    grid.id = 'invMatCardGrid';
    grid.className = 'inv-mat-card-grid';
    grid.innerHTML = mats.length
      ? cardsHtml
      : `<p style="color:var(--text-muted);text-align:center;padding:30px;grid-column:1/-1;">لا توجد مواد مطابقة</p>`;

    tableWrap.replaceWith(grid);
  }

  function getAvail(m) {
    if (typeof window.getMaterialAvailableQty === 'function') return window.getMaterialAvailableQty(m);
    return Math.max(0, Number(m.stock || 0) - getReserved(m));
  }
  function getReserved(m) {
    if (typeof window.getMaterialReservedQty === 'function') return window.getMaterialReservedQty(m);
    return Number(m.reservedQty || m.reserved || 0);
  }

  /* Quick location transfer for individual material */
  window.openInventoryLocationTransfer = async function (materialId) {
    let v5Db = null;
    try { v5Db = window.PentagonDB ? await window.PentagonDB.load({ force: true }) : null; } catch (_) {}
    const locations = v5Db?.locations || [];
    const mat = (window.omni?.materials || []).find(m => m.id === materialId);
    if (!mat) return;

    const locOpts = locations.map(l => `<option value="${escHtml(l.id)}">${escHtml(l.name)}</option>`).join('');
    const html = `
      <div style="display:flex;flex-direction:column;gap:10px;direction:rtl;">
        <p style="font-size:13px;color:var(--text-muted)">نقل مادة: <b>${escHtml(mat.name)}</b></p>
        <label>من موقع<select id="ltFromLoc" class="form-input">${locOpts}</select></label>
        <label>إلى موقع<select id="ltToLoc" class="form-input">${locOpts}</select></label>
        <label>الكمية<input id="ltQty" type="number" class="form-input" min="0.01" step="0.01" value="1"></label>
      </div>`;

    const result = await window.showOmniModal('تحويل مادة بين المواقع', html, body => {
      const from = body.querySelector('#ltFromLoc')?.value;
      const to   = body.querySelector('#ltToLoc')?.value;
      const qty  = Number(body.querySelector('#ltQty')?.value);
      if (from === to)   { window.showToast('المصدر والوجهة متماثلان', 'warning'); return false; }
      if (!qty || qty<=0){ window.showToast('كمية غير صالحة', 'warning'); return false; }
      return { from, to, qty };
    });

    if (!result) return;
    try {
      await window.StockService.createTransfer({
        location_id: result.from,
        location_dest_id: result.to,
        origin: `تحويل سريع — ${mat.name}`,
        lines: [{ product_id: materialId, quantity: result.qty }]
      });
      const t = await window.PentagonDB.load({ force: true });
      const picking = (t.transfers || []).slice(-1)[0];
      if (picking) await window.StockService.validateTransfer(picking.id);
      window.showToast('تم التحويل بنجاح', 'success');
      window.renderInventoryPage();
    } catch (err) {
      window.showToast(err.message || 'فشل التحويل', 'error');
    }
  };

  /* ============================================================
     4. EQUIPMENT BARCODE DISPATCHER TAB
     Replaces the old active dispatches tab content
     ============================================================ */
  // Patch renderEquipmentPage to inject scanner UI in active_dispatches tab
  const _origRenderEquipmentPage = window.renderEquipmentPage;
  window.renderEquipmentPage = function () {
    _origRenderEquipmentPage.call(this);
    if (window.equipmentActiveTab === 'active_dispatches') {
      injectBarcodeDispatchPanel();
    }
  };

  function injectBarcodeDispatchPanel() {
    const body = document.getElementById('equipmentBody');
    if (!body) return;
    if (document.getElementById('barcodeDispatchPanel')) return;

    const employees = (window.employees || []);
    const empOpts   = employees.map(e => `<option value="${escHtml(e.name)}">${escHtml(e.name)}</option>`).join('');
    const materials = (window.omni?.materials || []).filter(m => Number(m.stock||0) > 0);
    const consumableRows = materials.slice(0, 8).map(m => `
      <div class="consumable-row consumable-dispatch-row" data-matid="${m.id}">
        <span class="mat-name">${escHtml(m.name)}</span>
        <span class="mat-qty">${Number(m.stock||0).toFixed(0)} ${escHtml(m.unit||'')}</span>
        <input type="number" class="cons-qty form-input" min="0" step="0.01" value="0"
          style="width:70px;padding:3px 6px;font-size:11px;" placeholder="كمية">
        <span class="mat-disc">مستهلكة</span>
      </div>
    `).join('');

    const panel = document.createElement('div');
    panel.id = 'barcodeDispatchPanel';
    panel.className = 'barcode-dispatch-panel';
    panel.innerHTML = `
      <!-- Left: Scanner zone -->
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div class="barcode-scan-zone" id="eqScanZone">
          <i class="fa-solid fa-barcode" style="font-size:28px;color:#38bdf8;opacity:0.7;"></i>
          <p style="font-size:12px;color:var(--text-muted);text-align:center;margin:0;">
            امسح باركود الأداة أو اكتب رقمها التعريفي
          </p>
          <div class="barcode-scan-input-wrap">
            <div class="barcode-laser"></div>
            <input id="eqScanInput" class="barcode-scan-input"
              type="text" placeholder="XXXX-XXXX أو EQ-XXXX"
              onkeydown="if(event.key==='Enter'){window.processEquipmentBarcodeScan();event.preventDefault();}">
          </div>
          <button class="btn-primary" style="width:100%;font-weight:700;"
            onclick="window.processEquipmentBarcodeScan()">
            <i class="fa-solid fa-expand"></i> مسح (ENTER / BEEP)
          </button>
        </div>
        <div id="eqScanFeedback" style="font-size:12px;min-height:18px;"></div>

        <!-- Employee + site -->
        <label style="font-size:12px;">الموظف المستلم
          <select id="eqScanEmployee" class="form-input" style="margin-top:4px;">
            <option value="">— اختر موظف —</option>
            ${empOpts}
          </select>
        </label>
        <label style="font-size:12px;">موقع العمل
          <input id="eqScanSite" class="form-input" placeholder="مثال: مشروع البصرة الجديدة" style="margin-top:4px;">
        </label>
        <label style="font-size:12px;">تاريخ الإرجاع المتوقع
          <input id="eqScanReturnDate" type="date" class="form-input"
            value="${new Date(Date.now()+86400000).toISOString().slice(0,10)}" style="margin-top:4px;">
        </label>
      </div>

      <!-- Right: Pending list + consumables + action -->
      <div style="display:flex;flex-direction:column;gap:12px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <h4 style="margin:0;font-size:14px;"><i class="fa-solid fa-list-check"></i> قائمة الترحيل (<span id="eqScanCount">0</span>)</h4>
          <button class="btn-secondary" style="font-size:11px;padding:4px 10px;" onclick="window.dispatchScanState.pendingItems=[];window.renderScanPendingList()"><i class="fa-solid fa-trash-can"></i> مسح</button>
        </div>
        <div class="dispatch-pending-list" id="eqScanPendingList">
          <p style="color:var(--text-muted);text-align:center;padding:16px;font-size:12px;">امسح الباركود لإضافة الأدوات</p>
        </div>

        <!-- Consumables -->
        <div>
          <div class="consumables-banner"><i class="fa-solid fa-box-open"></i> المواد الاستهلاكية المصروفة مع الترحيل (اختياري)</div>
          <div style="max-height:140px;overflow-y:auto;">${consumableRows}</div>
        </div>

        <button class="btn-primary" style="width:100%;font-size:14px;font-weight:800;padding:12px;"
          onclick="window.confirmBarcodeDispatch()">
          <i class="fa-solid fa-paper-plane"></i> تأكيد الترحيل وطباعة الوصل
        </button>
      </div>
    `;

    // Insert before existing content
    body.insertBefore(panel, body.firstChild);
    renderScanPendingList();
    window.renderScanPendingList = renderScanPendingList;
  }

  /* ============================================================
     5. RETURN FROM CUSTODY (إرجاع الترحيل)
     Enhanced return modal with partial-return support
     ============================================================ */
  window.returnEquipmentBatch = async function (batchId) {
    if (!window.omni) return;
    const dispatches = (window.omni.equipmentDispatches || []).filter(d => d.batchId === batchId && d.status === 'dispatched');
    if (!dispatches.length) {
      return window.showToast('لا توجد أدوات مرحلة لهذا الدفع', 'warning');
    }

    const itemsHtml = dispatches.map(d => `
      <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05);">
        <input type="checkbox" id="ret_${d.equipmentId}" value="${d.equipmentId}" checked style="width:16px;height:16px;cursor:pointer;">
        <span style="flex:1;font-size:13px;">${escHtml(d.equipmentName)}</span>
        <select class="form-input ret-condition" data-id="${d.equipmentId}" style="width:160px;font-size:11px;padding:3px 6px;">
          <option value="operational">صالحة للعمل</option>
          <option value="maintenance">تحتاج صيانة</option>
          <option value="broken">تالفة</option>
        </select>
      </div>
    `).join('');

    const html = `
      <div style="direction:rtl;">
        <p style="color:var(--text-muted);font-size:12.5px;margin-bottom:10px;">
          إرجاع الأدوات من عهدة: <b>${escHtml(dispatches[0]?.employeeName || '')}</b>
        </p>
        ${itemsHtml}
        <label style="display:block;margin-top:12px;font-size:12px;">ملاحظات الإرجاع
          <textarea id="returnNotesGlobal" class="form-input" rows="2"
            placeholder="ملاحظات عامة على حالة الإرجاع..." style="margin-top:4px;"></textarea>
        </label>
      </div>`;

    const confirmed = await window.showOmniModal('تسجيل إرجاع العهدة', html, body => {
      const checks = [...body.querySelectorAll('input[type=checkbox]:checked')].map(cb => cb.value);
      if (!checks.length) { window.showToast('لم تحدد أي أداة للإرجاع', 'warning'); return false; }
      const conditions = {};
      body.querySelectorAll('.ret-condition').forEach(sel => { conditions[sel.dataset.id] = sel.value; });
      const notes = body.querySelector('#returnNotesGlobal')?.value.trim() || '';
      return { checks, conditions, notes };
    });

    if (!confirmed) return;

    const today = new Date().toISOString().slice(0, 10);
    window.omni.equipmentAuditLogs = window.omni.equipmentAuditLogs || [];

    confirmed.checks.forEach(eqId => {
      const disp = dispatches.find(d => d.equipmentId === eqId);
      if (!disp) return;
      disp.actualReturnDate  = today;
      disp.status            = 'returned';
      disp.conditionOnReturn = confirmed.conditions[eqId] || 'operational';
      disp.returnNotes       = confirmed.notes;

      const eq = (window.omni.equipment || []).find(e => e.id === eqId);
      if (eq) {
        eq.status         = confirmed.conditions[eqId] || 'operational';
        eq.lastAuditDate  = today;
        eq.lastAuditStatus= confirmed.conditions[eqId];
        eq.notes          = confirmed.notes || eq.notes;
        delete eq.currentDispatchId;
      }
      window.omni.equipmentAuditLogs.push({
        date: today,
        equipmentId:   eqId,
        equipmentName: disp.equipmentName,
        inspector: window.PentagonAuth?.getCurrentUser()?.name || 'المشرف',
        status: confirmed.conditions[eqId],
        notes: `إرجاع من ترحيل دفعي (${disp.employeeName}). ${confirmed.notes || ''}`,
      });
    });

    if (typeof window.saveData === 'function') window.saveData();
    window.showToast(`تم تسجيل إرجاع ${confirmed.checks.length} أداة بنجاح`, 'success');
    if (typeof window.renderEquipmentPage === 'function') window.renderEquipmentPage();
  };

  /* ============================================================
     6. OVERRIDE ACTIVE DISPATCHES RENDER — group by batch
     ============================================================ */
  // We hook into the equipment page after render to enhance active_dispatches
  function enhanceActiveDispatches() {
    if (window.equipmentActiveTab !== 'active_dispatches') return;
    const body = document.getElementById('equipmentBody');
    if (!body) return;

    const dispatches = (window.omni?.equipmentDispatches || []).filter(d => d.status === 'dispatched');

    // Group by batchId (or dispatchId prefix)
    const batches = {};
    dispatches.forEach(d => {
      const key = d.batchId || d.id;
      if (!batches[key]) batches[key] = { key, items: [], employee: d.employeeName, site: d.jobSite, date: d.checkoutDate, expReturn: d.expectedReturnDate };
      batches[key].items.push(d);
    });

    const batchesHtml = Object.values(batches).map(batch => `
      <div class="dispatch-card" style="margin-bottom:12px;">
        <div>
          <div class="dispatch-card-title">✈️ ${escHtml(batch.employee)} — ${escHtml(batch.site)}</div>
          <div class="dispatch-card-meta">
            <span><i class="fa-solid fa-calendar"></i> ترحيل: ${escHtml(batch.date)}</span>
            <span><i class="fa-solid fa-calendar-check"></i> إرجاع متوقع: ${escHtml(batch.expReturn || 'غير محدد')}</span>
            <span><i class="fa-solid fa-toolbox"></i> ${batch.items.length} أداة</span>
          </div>
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
            ${batch.items.map(it => `<span class="badge-dispatched" title="${escHtml(it.equipmentNumericQR||it.equipmentBarcode)}">${escHtml(it.equipmentName)}</span>`).join('')}
          </div>
        </div>
        <div class="dispatch-card-actions">
          <button class="return-btn" onclick="window.returnEquipmentBatch('${batch.key}')">
            <i class="fa-solid fa-rotate-left"></i> إرجاع العهدة
          </button>
        </div>
      </div>
    `).join('') || `<p style="color:var(--text-muted);text-align:center;padding:24px;font-size:13px;">لا توجد ترحيلات نشطة حالياً</p>`;

    // Find and replace existing batch area if any
    const existing = body.querySelector('.dispatch-batches-grid');
    if (existing) existing.innerHTML = batchesHtml;
    else {
      const grid = document.createElement('div');
      grid.className = 'dispatch-batches-grid';
      grid.style.marginTop = '16px';
      grid.innerHTML = batchesHtml;
      body.appendChild(grid);
    }
  }

  /* ============================================================
     7. NUMERIC QR — upgrade existing equipment on page load
     ============================================================ */
  function initNumericQR() {
    if (!window.omni) return;
    if (!Array.isArray(window.omni.equipment)) return;
    let upgraded = false;
    window.omni.equipment.forEach((eq, i) => {
      if (!eq.numericQR || !eq.numericQR.match(/^\d{4}/)) {
        eq.numericQR = generateNumericQR(eq, i);
        upgraded = true;
      }
    });
    if (upgraded && typeof window.saveData === 'function') window.saveData();
  }

  /* ============================================================
     8. UTILITY: Print numeric QR label (enhanced)
     ============================================================ */
  const _origPrintEquipmentBarcode = window.printEquipmentBarcode;
  window.printEquipmentBarcode = function (eqId) {
    if (typeof window.printEquipmentBarcodeNow === 'function') {
      return window.printEquipmentBarcodeNow(eqId);
    }
    if (typeof _origPrintEquipmentBarcode === 'function') {
      return _origPrintEquipmentBarcode(eqId);
    }
  };

  /* ============================================================
     HELPER
     ============================================================ */
  function escHtml(str) {
    if (typeof str !== 'string') str = String(str ?? '');
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ============================================================
     BOOT — called once OMNISYSTEM is fully loaded
     ============================================================ */
  function boot() {
    // Wait for omni to be initialized
    if (!window.omni || !Array.isArray(window.omni.equipment)) {
      setTimeout(boot, 300);
      return;
    }
    initNumericQR();

    // Expose renderScanPendingList globally
    window.renderScanPendingList = renderScanPendingList;

    // After every equipment page render, check if we need to inject panel
    const _origSwitch = window.switchEquipmentTab;
    if (_origSwitch) {
      window.switchEquipmentTab = function (tab) {
        _origSwitch.call(this, tab);
        if (tab === 'active_dispatches') {
          setTimeout(injectBarcodeDispatchPanel, 100);
          setTimeout(enhanceActiveDispatches, 120);
        }
      };
    }

    console.log('[OmniUX v2] Initialized: numeric QR, barcode dispatch, compact inventory, enhanced equipment');
  }

  // Delay boot to ensure app.js is fully ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 600));
  } else {
    setTimeout(boot, 600);
  }

})();
