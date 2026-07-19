// ═══════════════════════════════════════════════════════════════════════════
// ═══ GO 12 — Inventory Deepening ═══════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════
// T4.18 de-monolith: extracted verbatim from app.js. Loads BEFORE app.js —
// normalizeInventoryDeepening() is called from ensureOmni(). Moved here
// (rather than modules/mrp-work-orders.js, despite sitting physically next
// to the MRP cluster in the old app.js) because its body is pure Inventory
// Deepening domain (omni.lots, material.tracking/costingMethod) with zero
// MRP-specific logic — a T4.17 handoff note flagged this placement decision.

function normalizeInventoryDeepening() {
  if (!Array.isArray(omni.lots)) omni.lots = [];

  omni.lots.forEach(lot => {
    if (!lot.id) lot.id = makeId('lot');
    if (!lot.product_id) lot.product_id = '';
    if (!lot.lot_number) lot.lot_number = '';
    if (!lot.created_at) lot.created_at = new Date().toISOString();
    if (!lot.created_by) lot.created_by = 'system';
  });

  if (Array.isArray(omni.materials)) {
    omni.materials.forEach(mat => {
      if (!mat.tracking) mat.tracking = 'none'; // 'none' | 'lot' | 'serial'
      if (!mat.costingMethod) mat.costingMethod = 'avco'; // 'avco' | 'fifo' | 'lifo'
    });
  }
}

async function renderInventoryTransfersSection() {
  ensureOmni();
  let v5Db = null;
  try {
    v5Db = window.PentagonDB ? await window.PentagonDB.load({ force: true }) : null;
  } catch (error) {
    console.warn('V5 inventory load failed:', error);
  }
  const locations = Array.isArray(v5Db?.locations) ? v5Db.locations : [];
  const transfers = Array.isArray(v5Db?.transfers) ? v5Db.transfers : [];

  // Group locations by parent hierarchy for display
  const roots = locations.filter(loc => !loc.parent_id);
  const getChildren = (parentId) => locations.filter(loc => loc.parent_id === parentId);

  const renderLocRow = (loc, depth = 0) => {
    const indent = depth * 20;
    const arrow = depth > 0 ? '↳ ' : '';
    const children = getChildren(loc.id);
    let html = `
      <div class="v5-location-row" style="margin-left: ${indent}px; border-bottom: 1px solid rgba(255,255,255,0.03); padding: 8px 4px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <b style="color: var(--text-primary);">${arrow}${escapeHtml(loc.name)}</b>
          <span style="font-size: 11px; color: var(--text-muted); margin-left: 8px;">(${escapeHtml(getV5LocationTypeLabel(loc.type))})</span>
          <code style="font-size: 10px; color: #38bdf8; background: rgba(56,189,248,0.1); padding: 2px 6px; border-radius: 4px; margin-left: 8px;">${escapeHtml(loc.id)}</code>
        </div>
      </div>
    `;
    children.forEach(child => {
      html += renderLocRow(child, depth + 1);
    });
    return html;
  };

  const locationsHtml = roots.map(r => renderLocRow(r, 0)).join('') || '<div class="admin-empty">لا توجد مواقع تخزين معرفة</div>';

  const getLocName = (id) => locations.find(l => l.id === id)?.name || id || '-';

  const transfersHtml = transfers.map(t => {
    let stateBadge = '';
    if (t.state === 'draft') stateBadge = '<span class="inv-badge inv-badge-warning" style="background: rgba(245,158,11,0.15); color: #f59e0b;">مسودة</span>';
    else if (t.state === 'done') stateBadge = '<span class="inv-badge inv-badge-ok">مكتمل</span>';
    else stateBadge = '<span class="inv-badge inv-badge-danger">ملغي</span>';

    return `
      <tr onclick="viewTransferDetailsModal('${t.id}')" style="cursor: pointer;">
        <td><b>${escapeHtml(t.name)}</b></td>
        <td>${escapeHtml(t.origin || '-')}</td>
        <td>${escapeHtml(getLocName(t.location_id))}</td>
        <td>${escapeHtml(getLocName(t.location_dest_id))}</td>
        <td>${t.date ? formatOmniDateTime(t.date) : '-'}</td>
        <td>${stateBadge}</td>
        <td>
          <button class="btn btn-secondary btn-xs" onclick="event.stopPropagation(); viewTransferDetailsModal('${t.id}')">
            <i class="fa-solid fa-eye"></i> عرض
          </button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد عمليات تحويل مخزني بعد</td></tr>';

  return `
    <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 20px;">
      <!-- Locations panel -->
      <div class="glass-card" style="padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 15px;"><i class="fa-solid fa-route"></i> مواقع التخزين</h3>
          <button class="btn btn-secondary btn-xs" onclick="openNewLocationModal()"><i class="fa-solid fa-plus"></i> موقع جديد</button>
        </div>
        <div style="max-height: 450px; overflow-y: auto; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 6px;">
          ${locationsHtml}
        </div>
      </div>

      <!-- Transfers list -->
      <div class="glass-card" style="padding: 16px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <h3 style="margin: 0; font-size: 15px;"><i class="fa-solid fa-file-invoice"></i> تحويلات المخزون ومستندات الصرف</h3>
          <button class="btn btn-primary btn-sm" onclick="openNewTransferModal()"><i class="fa-solid fa-plus"></i> تحويل جديد (Picking)</button>
        </div>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th>رقم السند</th>
                <th>المرجع/البيان</th>
                <th>موقع المصدر</th>
                <th>موقع الوجهة</th>
                <th>التاريخ</th>
                <th>الحالة</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              ${transfersHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function openNewLocationModal() {
  ensureOmni();
  let v5Db = null;
  try {
    v5Db = window.PentagonDB ? await window.PentagonDB.load({ force: true }) : null;
  } catch (error) {}
  const locations = Array.isArray(v5Db?.locations) ? v5Db.locations : [];

  const parentOptions = locations.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)} (${escapeHtml(l.id)})</option>`).join('');

  const html = `
    <div class="workflow-insp-grid">
      <label>اسم الموقع<input id="locName" class="form-input" placeholder="مثال: الرف A-1"></label>
      <label>نوع الموقع
        <select id="locType" class="form-input">
          <option value="internal">داخلي (Internal Location)</option>
          <option value="transit">عبور (Transit Location)</option>
          <option value="inventory">تسوية فروقات (Inventory Loss)</option>
          <option value="production">إنتاج (Production/WIP)</option>
        </select>
      </label>
      <label>الموقع الأب
        <select id="locParent" class="form-input">
          <option value="">(بدون موقع أب - رئيسي)</option>
          ${parentOptions}
        </select>
      </label>
    </div>
  `;

  const result = await showOmniModal('إنشاء موقع تخزين جديد', html, body => {
    const name = body.querySelector('#locName')?.value.trim();
    const type = body.querySelector('#locType')?.value;
    const parentId = body.querySelector('#locParent')?.value || null;
    if (!name) return false;
    return { name, type, parentId };
  });

  if (!result) return;

  try {
    await PentagonDB.mutate(db => {
      if (!Array.isArray(db.locations)) db.locations = [];
      const id = `LOC_${result.name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_${Date.now().toString().slice(-4)}`;
      db.locations.push({
        id,
        name: result.name,
        type: result.type,
        parent_id: result.parentId,
        created_at: new Date().toISOString(),
        created_by: PentagonAuth.getCurrentUser()?.id || 'system',
        is_active: true
      });
    });
    showToast('تم إنشاء موقع التخزين بنجاح', 'success');
    renderInventoryPage();
  } catch (err) {
    showToast(err.message || 'تعذر إنشاء الموقع', 'error');
  }
}

async function openNewTransferModal() {
  ensureOmni();
  let v5Db = null;
  try {
    v5Db = window.PentagonDB ? await window.PentagonDB.load({ force: true }) : null;
  } catch (error) {}
  const locations = Array.isArray(v5Db?.locations) ? v5Db.locations : [];
  const materials = Array.isArray(omni.materials) ? omni.materials : [];

  const locationOptions = locations.map(l => `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`).join('');

  const html = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
      <label>من موقع (المصدر)
        <select id="tfrFromLoc" class="form-input">${locationOptions}</select>
      </label>
      <label>إلى موقع (الوجهة)
        <select id="tfrToLoc" class="form-input">${locationOptions}</select>
      </label>
      <label style="grid-column: 1 / -1;">البيان/المرجع
        <input id="tfrOrigin" class="form-input" placeholder="مثال: صرف لطلب العميل أحمد / تحويل للرف A">
      </label>
    </div>

    <h4 style="margin: 12px 0 6px 0; font-size: 13px;"><i class="fa-solid fa-list"></i> تفاصيل المواد المحولة</h4>
    <table class="inv-table" style="font-size: 12px; margin-bottom: 12px;">
      <thead>
        <tr>
          <th>المادة</th>
          <th style="width: 100px;">الكمية</th>
          <th>رقم الحصة/التسلسلي (اختياري)</th>
          <th style="width: 50px;">حذف</th>
        </tr>
      </thead>
      <tbody id="tfrItemsBody">
        <!-- Rows will be added dynamically -->
      </tbody>
    </table>
    <button class="btn btn-secondary btn-sm" onclick="window.addTransferItemRow()"><i class="fa-solid fa-plus"></i> إضافة مادة</button>
  `;

  window.addTransferItemRow = () => {
    const tbody = document.getElementById('tfrItemsBody');
    if (!tbody) return;
    const tr = document.createElement('tr');
    tr.className = 'tfr-item-row';
    const matOptions = materials.map(m => `<option value="${escapeHtml(m.id)}">${escapeHtml(m.name)} (${escapeHtml(m.unit)})</option>`).join('');
    tr.innerHTML = `
      <td>
        <select class="form-input tfr-product-select" style="padding: 4px;">
          ${matOptions}
        </select>
      </td>
      <td>
        <input type="number" class="form-input tfr-qty-input" min="0.01" step="0.01" value="1" style="padding: 4px;">
      </td>
      <td>
        <input type="text" class="form-input tfr-lot-input" placeholder="رقم Lot / Serial" style="padding: 4px;">
      </td>
      <td style="text-align: center;">
        <button class="icon-btn btn-danger-text" onclick="this.closest('tr').remove()" style="color: var(--danger);"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  };

  const result = await showOmniModal('إنشاء سند تحويل مخزني جديد', html, body => {
    const fromLoc = body.querySelector('#tfrFromLoc')?.value;
    const toLoc = body.querySelector('#tfrToLoc')?.value;
    const origin = body.querySelector('#tfrOrigin')?.value.trim();

    if (fromLoc === toLoc) {
      showToast('لا يمكن التحويل لنفس موقع التخزين', 'warning');
      return false;
    }

    const rows = body.querySelectorAll('.tfr-item-row');
    const lines = [];
    rows.forEach(row => {
      const productId = row.querySelector('.tfr-product-select')?.value;
      const quantity = Number(row.querySelector('.tfr-qty-input')?.value);
      const lotNumber = row.querySelector('.tfr-lot-input')?.value.trim();
      if (productId && quantity > 0) {
        lines.push({ product_id: productId, quantity, lot_number: lotNumber, lot_id: lotNumber });
      }
    });

    if (lines.length === 0) {
      showToast('يرجى تحديد مادة واحدة على الأقل بالكمية المناسبة', 'warning');
      return false;
    }

    return {
      location_id: fromLoc,
      location_dest_id: toLoc,
      origin: origin,
      lines: lines
    };
  }, body => {
    window.addTransferItemRow();
  });

  if (!result) return;

  try {
    for (const line of result.lines) {
      if (line.lot_number) {
        await StockService.createLot(line.product_id, line.lot_number);
      }
    }

    await StockService.createTransfer(result);
    showToast('تم إنشاء مستند التحويل المخزني بنجاح كمسودة', 'success');
    renderInventoryPage();
  } catch (err) {
    showToast(err.message || 'فشل إنشاء مستند التحويل', 'error');
  }
}

async function viewTransferDetailsModal(transferId) {
  ensureOmni();
  let v5Db = null;
  try {
    v5Db = window.PentagonDB ? await window.PentagonDB.load({ force: true }) : null;
  } catch (error) {}
  const transfer = (v5Db?.transfers || []).find(t => t.id === transferId);
  const locations = v5Db?.locations || [];
  if (!transfer) return;

  const getLocName = (id) => locations.find(l => l.id === id)?.name || id || '-';

  const linesHtml = transfer.lines.map(line => {
    const matName = getV5MaterialName(line.product_id);
    return `
      <tr>
        <td><b>${escapeHtml(matName)}</b></td>
        <td>${line.quantity} ${escapeHtml(line.unit)}</td>
        <td>${escapeHtml(line.lot_number || '-')}</td>
      </tr>
    `;
  }).join('');

  let actionButtons = '';
  if (transfer.state === 'draft') {
    actionButtons = `
      <div style="display: flex; gap: 10px; margin-top: 16px; justify-content: flex-end;">
        <button class="btn btn-secondary" onclick="closeOmniModal(); cancelTransferFrontend('${transfer.id}')" style="background: rgba(239,68,68,0.15); color: #ef4444; border-color: rgba(239,68,68,0.2);"><i class="fa-solid fa-ban"></i> إلغاء المستند</button>
        <button class="btn btn-primary" onclick="closeOmniModal(); validateTransferFrontend('${transfer.id}')"><i class="fa-solid fa-clipboard-check"></i> اعتماد ونقل المخزون</button>
      </div>
    `;
  }

  const html = `
    <div style="margin-bottom: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 13px;">
      <div><b>سند التحويل:</b> ${escapeHtml(transfer.name)}</div>
      <div><b>المرجع/البيان:</b> ${escapeHtml(transfer.origin || '-')}</div>
      <div><b>من موقع:</b> ${escapeHtml(getLocName(transfer.location_id))}</div>
      <div><b>إلى موقع:</b> ${escapeHtml(getLocName(transfer.location_dest_id))}</div>
      <div><b>التاريخ:</b> ${formatOmniDateTime(transfer.date)}</div>
      <div><b>منشئ المستند:</b> ${escapeHtml(transfer.created_by)}</div>
    </div>
    <h4 style="margin: 14px 0 6px 0; font-size: 13px;"><i class="fa-solid fa-list"></i> تفاصيل المواد المحولة</h4>
    <table class="inv-table" style="font-size: 12px;">
      <thead>
        <tr>
          <th>المادة</th>
          <th>الكمية</th>
          <th>رقم الحصة/التسلسلي</th>
        </tr>
      </thead>
      <tbody>
        ${linesHtml}
      </tbody>
    </table>
    ${actionButtons}
  `;

  showOmniModal(`سند تحويل مخزن: ${transfer.name}`, html);
}

async function validateTransferFrontend(transferId) {
  try {
    await StockService.validateTransfer(transferId);
    showToast('تم اعتماد ونقل المخزون بنجاح', 'success');
    renderInventoryPage();
  } catch (err) {
    showToast(err.message || 'فشل اعتماد التحويل', 'error');
  }
}

async function cancelTransferFrontend(transferId) {
  try {
    await StockService.cancelTransfer(transferId);
    showToast('تم إلغاء سند التحويل بنجاح', 'success');
    renderInventoryPage();
  } catch (err) {
    showToast(err.message || 'فشل إلغاء التحويل', 'error');
  }
}

function renderInventoryBarcodeSection() {
  ensureOmni();

  if (!window.barcodeScanLog) window.barcodeScanLog = [];
  if (!window.barcodeScanMode) window.barcodeScanMode = 'receipt';
  if (!window.barcodeScanDefaultQty) window.barcodeScanDefaultQty = 1;

  const logRows = window.barcodeScanLog.slice().reverse().map(l => `
    <div style="border-bottom: 1px solid rgba(255,255,255,0.03); padding: 6px 0; display: flex; justify-content: space-between; font-size: 11px; color: ${l.success ? '#34d399' : '#f87171'}">
      <span>${l.success ? '✓' : '✗'} [${formatOmniDateTime(l.date).slice(11)}] ${escapeHtml(l.text)}</span>
      <span style="color: var(--text-muted);">${escapeHtml(l.ref)}</span>
    </div>
  `).join('') || '<div class="muted" style="text-align: center; padding: 10px;">لا توجد عمليات مسح في هذه الجلسة</div>';

  const materials = omni.materials || [];
  const quickPresets = [];
  materials.forEach(m => {
    quickPresets.push({ label: `المادة: ${m.name} (ID: ${m.id})`, value: m.id });
  });

  const lots = omni.lots || [];
  lots.slice(-4).forEach(l => {
    const matName = materials.find(m => m.id === l.product_id)?.name || l.product_id;
    quickPresets.push({ label: `رقم تسلسلي: ${l.lot_number} (${matName})`, value: l.lot_number });
  });

  const presetOptions = quickPresets.map(p => `<option value="${escapeHtml(p.value)}">${escapeHtml(p.label)}</option>`).join('');

  return `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <!-- Simulator controls -->
      <div class="glass-card" style="padding: 16px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <h3 style="margin: 0 0 14px 0; font-size: 15px;"><i class="fa-solid fa-barcode"></i> محاكي قارئ الباركود (Barcode Scanner)</h3>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px;">
            <label style="grid-column: 1 / -1;">اختر رمز سريع للتجربة (المادة / رقم Lot)
              <select id="bcPreset" class="form-input" onchange="document.getElementById('bcInput').value = this.value">
                <option value="">-- اختر للتعبئة التلقائية --</option>
                ${presetOptions}
              </select>
            </label>
            <label style="grid-column: 1 / -1;">أدخل الرمز الشريطي (Barcode/SKU/Lot)
              <input id="bcInput" type="text" class="form-input" placeholder="اكتب أو انسخ الرمز هنا..." style="font-family: monospace; font-size: 14px;">
            </label>
            <label>الكمية الافتراضية
              <input id="bcQty" type="number" min="0.01" step="0.01" class="form-input" value="${window.barcodeScanDefaultQty}" onchange="window.barcodeScanDefaultQty = Number(this.value)">
            </label>
            <label>وضع الحركة المخزنية
              <select id="bcMode" class="form-input" onchange="window.barcodeScanMode = this.value">
                <option value="receipt" ${window.barcodeScanMode === 'receipt' ? 'selected' : ''}>استلام بضاعة (LOC_SUPPLIERS ➔ LOC_MAIN)</option>
                <option value="issue" ${window.barcodeScanMode === 'issue' ? 'selected' : ''}>صرف بضاعة (LOC_MAIN ➔ LOC_WIP)</option>
                <option value="transfer" ${window.barcodeScanMode === 'transfer' ? 'selected' : ''}>تحويل مخزني (LOC_MAIN ➔ LOC_WIP)</option>
              </select>
            </label>
          </div>

          <div class="barcode-scan-box" style="position: relative; height: 100px; background: rgba(0,0,0,0.4); border: 2px dashed rgba(255,255,255,0.1); border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
            <span style="font-family: 'Libre Barcode 39', monospace; font-size: 42px; color: var(--text-muted); opacity: 0.35; letter-spacing: 4px;">*BARCODE39*</span>
            <div class="barcode-laser-line" style="position: absolute; left: 0; width: 100%; height: 2px; background: #ef4444; box-shadow: 0 0 10px #ef4444; animation: scanLaser 2s linear infinite;"></div>
          </div>
        </div>

        <button class="btn btn-primary" style="width: 100%; height: 40px; font-weight: bold;" onclick="processBarcodeScanFrontend()"><i class="fa-solid fa-expand"></i> محاكاة مسح الباركود (BEEP!)</button>
      </div>

      <!-- Scans history log -->
      <div class="glass-card" style="padding: 16px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <h3 style="margin: 0 0 12px 0; font-size: 15px;"><i class="fa-solid fa-list"></i> سجل عمليات المسح الأخيرة</h3>
          <div style="height: 200px; overflow-y: auto; background: rgba(0,0,0,0.25); border-radius: 6px; padding: 10px; border: 1px solid rgba(255,255,255,0.03);">
            ${logRows}
          </div>
        </div>
        <button class="btn btn-secondary btn-sm" onclick="window.barcodeScanLog = []; renderInventoryPage();"><i class="fa-solid fa-trash-can"></i> مسح سجل العمليات</button>
      </div>
    </div>
  `;
}

async function processBarcodeScanFrontend() {
  ensureOmni();
  if (!window.barcodeScanLog) window.barcodeScanLog = [];

  const inputEl = document.getElementById('bcInput');
  const qtyEl = document.getElementById('bcQty');
  const modeEl = document.getElementById('bcMode');

  if (!inputEl) return;
  const barcode = String(inputEl.value).trim();
  const qty = Number(qtyEl ? qtyEl.value : 1) || 1;
  const mode = modeEl ? modeEl.value : 'receipt';

  if (!barcode) {
    showToast('الرجاء إدخال الرمز الشريطي للمسح', 'warning');
    return;
  }

  // Find product in omni.materials
  const materials = omni.materials || [];
  const material = materials.find(m =>
    String(m.id) === barcode ||
    String(m.barcode || '') === barcode ||
    String(m.sku || m.SKU || '') === barcode ||
    String(m.name || '').toLowerCase() === barcode.toLowerCase()
  );

  if (!material) {
    const logEntry = {
      success: false,
      date: new Date().toISOString(),
      text: `لم يتم العثور على رمز: ${barcode}`,
      ref: 'فشل'
    };
    window.barcodeScanLog.push(logEntry);
    showToast(`لم يتم العثور على المادة بالرمز: ${barcode}`, 'danger');
    renderInventoryPage();
    return;
  }

  try {
    let fromLoc = 'LOC_MAIN';
    let toLoc = 'LOC_WIP';
    let refLabel = '';

    if (mode === 'receipt') {
      fromLoc = 'LOC_SUPPLIERS';
      toLoc = 'LOC_MAIN';
      refLabel = `مسح باركود - استلام LOC_SUPPLIERS ➔ LOC_MAIN`;
    } else if (mode === 'issue') {
      fromLoc = 'LOC_MAIN';
      toLoc = 'LOC_WIP';
      refLabel = `مسح باركود - صرف LOC_MAIN ➔ LOC_WIP`;
    } else {
      fromLoc = 'LOC_MAIN';
      toLoc = 'LOC_WIP';
      refLabel = `مسح باركود - تحويل مخزني LOC_MAIN ➔ LOC_WIP`;
    }

    if (!window.StockService) {
      throw new Error('خدمة المخزون غير متوفرة');
    }

    // Create and validate move
    const move = await StockService.createStockMove({
      product_id: material.id,
      quantity: qty,
      from_loc: fromLoc,
      to_loc: toLoc,
      origin: 'Barcode Simulator Scan',
      unit: material.unit || ''
    });

    if (typeof window.RecordService !== 'undefined' && RecordService.update) {
      await RecordService.update('stock_moves', move.id, { qty_done: qty });
    }

    await StockService.validateMove(move.id);

    const logEntry = {
      success: true,
      date: new Date().toISOString(),
      text: `تم مسح ${material.name} (الكمية: ${qty}) - ${mode === 'receipt' ? 'استلام' : mode === 'issue' ? 'صرف' : 'تحويل'}`,
      ref: material.name
    };
    window.barcodeScanLog.push(logEntry);
    showToast(`تم مسح المادة ${material.name} وتحديث المخزون بنجاح`, 'success');

    // Clear input
    inputEl.value = '';

    // Re-render
    renderInventoryPage();
  } catch (err) {
    const logEntry = {
      success: false,
      date: new Date().toISOString(),
      text: `خطأ في المعالجة: ${err.message || err}`,
      ref: material.name
    };
    window.barcodeScanLog.push(logEntry);
    showToast(`فشل مسح الباركود: ${err.message || err}`, 'danger');
    renderInventoryPage();
  }
}
window.processBarcodeScanFrontend = processBarcodeScanFrontend;

function renderInventoryShortagesSection() {
  ensureOmni();
  const allMats = omni.materials || [];

  const shortages = allMats.map(m => {
    const avail = getMaterialAvailableQty(m);
    const reserved = getMaterialReservedQty(m);
    return { ...m, avail, reserved };
  }).filter(m => m.avail <= m.minimum || m.avail < 0);

  const shortagesHtml = shortages.map(m => `
    <tr class="inv-row-critical">
      <td><b>${escapeHtml(m.name)}</b><br><small>${escapeHtml(m.category)}</small></td>
      <td>${m.stock}</td>
      <td>${m.reserved}</td>
      <td style="font-weight: bold; color: var(--danger);">${m.avail} ${escapeHtml(m.unit)}</td>
      <td>${m.minimum}</td>
      <td>${escapeHtml(m.supplier || '-')}</td>
      <td>
        <button class="btn btn-primary btn-xs" onclick="createPurchaseRequest('${m.id}')"><i class="fa-solid fa-shopping-basket"></i> طلب شراء</button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="7" style="text-align: center; color: var(--text-ok); padding: 20px;">✓ لا توجد نواقص في المخازن حالياً</td></tr>';

  const reservations = [];
  allMats.forEach(m => {
    if (Array.isArray(m.reservations)) {
      m.reservations.forEach(r => {
        if (r.status === 'reserved') {
          reservations.push({
            productId: m.id,
            productName: m.name,
            unit: m.unit,
            ...r
          });
        }
      });
    }
  });

  const reservationsHtml = reservations.map(r => `
    <tr>
      <td><b>${escapeHtml(r.productName)}</b></td>
      <td><span style="font-family: monospace;">${escapeHtml(r.sourceType.toUpperCase())}</span></td>
      <td>${escapeHtml(r.title || r.sourceId || '-')}</td>
      <td><b>${r.qty} ${escapeHtml(r.unit)}</b></td>
      <td>${r.createdAt ? formatOmniDateTime(r.createdAt) : '-'}</td>
      <td>
        <button class="btn btn-secondary btn-xs" style="background: rgba(239,68,68,0.1); color: #ef4444; border-color: rgba(239,68,68,0.2);" onclick="releaseReservationFrontend('${r.productId}', '${r.id}')">
          <i class="fa-solid fa-lock-open"></i> فك الحجز
        </button>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 20px;">لا توجد حجوزات نشطة حالياً</td></tr>';

  return `
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
      <!-- Shortages panel -->
      <div class="glass-card" style="padding: 16px;">
        <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #f87171;"><i class="fa-solid fa-triangle-exclamation"></i> المواد المطلوبة والنواقص (Shortage)</h3>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th>المادة</th>
                <th>المستودع</th>
                <th>المحجوز</th>
                <th>المتاح</th>
                <th>الحد الأدنى</th>
                <th>المورد</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              ${shortagesHtml}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Reservations panel -->
      <div class="glass-card" style="padding: 16px;">
        <h3 style="margin: 0 0 12px 0; font-size: 15px; color: #fbbf24;"><i class="fa-solid fa-lock"></i> الحجوزات النشطة في النظام (Reservations)</h3>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th>المادة</th>
                <th>المصدر</th>
                <th>المرجع/المشروع</th>
                <th>الكمية</th>
                <th>تاريخ الحجز</th>
                <th>إجراء</th>
              </tr>
            </thead>
            <tbody>
              ${reservationsHtml}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function releaseReservationFrontend(productId, resId) {
  const ok = await showOmniConfirm('هل أنت متأكد من فك حجز هذه المواد يدوياً؟ قد يؤدي هذا إلى نقص المواد اللازمة للمشاريع المفتوحة.');
  if (!ok) return;

  try {
    const done = await StockService.releaseReservation(productId, resId);
    if (done) {
      showToast('تم فك حجز المواد وإتاحتها بنجاح', 'success');
      renderInventoryPage();
    } else {
      showToast('تعذر فك حجز المادة', 'warning');
    }
  } catch (err) {
    showToast(err.message || 'فشل تحرير الحجز', 'error');
  }
}

async function renderInventoryValuationSection() {
  ensureOmni();
  const allMats = omni.materials || [];
  const orgSymbol = omni.adminSettings?.organization?.currencySymbol || 'د.ع';

  const valuations = [];
  let totalValuation = 0;

  let fifoTotal = 0;
  let lifoTotal = 0;
  let avcoTotal = 0;

  for (const m of allMats) {
    const method = m.costingMethod || 'avco';
    const valObj = await StockService.getMaterialValuation(m.id, method);

    const fifoObj = await StockService.getMaterialValuation(m.id, 'fifo');
    const lifoObj = await StockService.getMaterialValuation(m.id, 'lifo');
    const avcoObj = await StockService.getMaterialValuation(m.id, 'avco');

    fifoTotal += fifoObj.totalValue;
    lifoTotal += lifoObj.totalValue;
    avcoTotal += avcoObj.totalValue;

    totalValuation += valObj.totalValue;
    valuations.push({
      ...m,
      currentQty: valObj.currentQty,
      unitCost: valObj.unitCost,
      totalValue: valObj.totalValue
    });
  }

  const valuationRows = valuations.map(v => {
    return `
      <tr>
        <td><b>${escapeHtml(v.name)}</b><br><small>${escapeHtml(v.category)}</small></td>
        <td>${v.currentQty} ${escapeHtml(v.unit)}</td>
        <td>
          <select class="form-input" style="padding: 4px; font-size: 12px; width: 150px;" onchange="updateMaterialCostingMethod('${v.id}', this.value)">
            <option value="avco" ${v.costingMethod === 'avco' ? 'selected' : ''}>AVCO (معدل موزون)</option>
            <option value="fifo" ${v.costingMethod === 'fifo' ? 'selected' : ''}>FIFO (الوارد أولاً)</option>
            <option value="lifo" ${v.costingMethod === 'lifo' ? 'selected' : ''}>LIFO (الوارد أخيراً)</option>
          </select>
        </td>
        <td>${Math.round(v.unitCost).toLocaleString()} ${escapeHtml(orgSymbol)}</td>
        <td style="font-weight: bold; color: var(--text-ok);">${Math.round(v.totalValue).toLocaleString()} ${escapeHtml(orgSymbol)}</td>
      </tr>
    `;
  }).join('');

  return `
    <div style="display: flex; flex-direction: column; gap: 20px;">
      <!-- Overview cards -->
      <div class="stats-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <div class="stat-card" style="background: rgba(52,211,153,0.05); border: 1px solid rgba(52,211,153,0.15); padding: 12px; border-radius: 8px;">
          <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">القيمة الإجمالية للمخزون (النشطة)</span>
          <strong style="color: #34d399; font-size: 18px; display: block; margin-top: 4px;">${Math.round(totalValuation).toLocaleString()} ${escapeHtml(orgSymbol)}</strong>
        </div>
        <div class="stat-card" style="padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.01);">
          <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">القيمة حسب المعدل الموزون (AVCO)</span>
          <strong style="font-size: 16px; display: block; margin-top: 4px;">${Math.round(avcoTotal).toLocaleString()} ${escapeHtml(orgSymbol)}</strong>
        </div>
        <div class="stat-card" style="padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.01);">
          <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">القيمة حسب الوارد أولاً (FIFO)</span>
          <strong style="font-size: 16px; display: block; margin-top: 4px;">${Math.round(fifoTotal).toLocaleString()} ${escapeHtml(orgSymbol)}</strong>
        </div>
        <div class="stat-card" style="padding: 12px; border-radius: 8px; background: rgba(255,255,255,0.01);">
          <span class="stat-label" style="font-size: 11px; color: var(--text-muted);">القيمة حسب الوارد أخيراً (LIFO)</span>
          <strong style="font-size: 16px; display: block; margin-top: 4px;">${Math.round(lifoTotal).toLocaleString()} ${escapeHtml(orgSymbol)}</strong>
        </div>
      </div>

      <!-- Valuation table -->
      <div class="glass-card" style="padding: 16px;">
        <h3 style="margin: 0 0 12px 0; font-size: 15px;"><i class="fa-solid fa-coins"></i> تقييم مخزون المواد النشط بالتكلفة</h3>
        <div class="inv-table-wrap">
          <table class="inv-table">
            <thead>
              <tr>
                <th>المادة</th>
                <th>الكمية المتوفرة</th>
                <th>طريقة تقييم التكلفة</th>
                <th>تكلفة الوحدة المحسوبة</th>
                <th>إجمالي قيمة الأصول</th>
              </tr>
            </thead>
            <tbody>
              ${valuationRows}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

async function updateMaterialCostingMethod(productId, method) {
  ensureOmni();
  const material = (omni.materials || []).find(m => m.id === productId);
  if (material) {
    material.costingMethod = method;
    saveData();
    showToast(`تم تغيير طريقة تقييم ${material.name} إلى ${method.toUpperCase()}`, 'success');
    renderInventoryPage();
  }
}
