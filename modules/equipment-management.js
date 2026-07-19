/*
 * OCTAGON OMNISYSTEM - modules/equipment-management.js
 * T4.4 Phase 4 extraction: Equipment Management cluster moved verbatim from app.js.
 * Loaded before app.js because ensureOmni() calls normalizeEquipment() during startup.
 */

let equipmentActiveTab = 'list';
let equipmentSearchQuery = '';
let equipmentLocationFilter = '';
let equipmentCategoryFilter = '';
let equipmentStatusFilter = '';
let equipmentDispatchCart = [];
let equipmentDispatchScanTimer = null;
let equipmentDispatchDraft = { employeeName: '', jobSite: '', expectedReturnDate: '' };

// defaultEquipment() moved to modules/data-providers.js (GO 16 de-monolith Phase 2)

function equipmentStatusMeta(status) {
  const map = {
    operational: { label: 'صالحة للعمل', icon: 'fa-circle-check', color: '#34d399', bg: 'rgba(16,185,129,0.14)', border: 'rgba(16,185,129,0.28)' },
    dispatched: { label: 'خارج الورشة', icon: 'fa-route', color: '#a5b4fc', bg: 'rgba(99,102,241,0.14)', border: 'rgba(99,102,241,0.28)' },
    maintenance: { label: 'تحت الصيانة', icon: 'fa-screwdriver-wrench', color: '#fde047', bg: 'rgba(245,158,11,0.14)', border: 'rgba(245,158,11,0.28)' },
    broken: { label: 'عاطلة / تالفة', icon: 'fa-triangle-exclamation', color: '#f87171', bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.28)' }
  };
  return map[status] || map.operational;
}

function makeUniqueEquipmentBarcode(base, usedSet = null) {
  const used = usedSet || new Set((omni.equipment || []).map(eq => eq.barcode).filter(Boolean));
  const seed = String(base || 'EQ-GEN').trim() || 'EQ-GEN';
  let barcode = seed;
  let counter = 2;
  while (used.has(barcode)) {
    barcode = `${seed}-${String(counter).padStart(2, '0')}`;
    counter += 1;
  }
  used.add(barcode);
  return barcode;
}

function generateEquipmentBarcode(location = 'GEN') {
  const locCode = String(location || 'GEN')
    .normalize('NFKD')
    .replace(/[^\w\u0600-\u06FF]+/g, '')
    .slice(0, 4)
    .toUpperCase() || 'GEN';
  const base = `EQ-${locCode}`;
  const next = (omni.equipment || []).filter(eq => String(eq.barcode || '').startsWith(base)).length + 1;
  return makeUniqueEquipmentBarcode(`${base}-${String(next).padStart(2, '0')}`);
}

const EQUIPMENT_CATEGORY_CODES = {
  'أدوات يدوية': '11',
  'أدوات كهربائية': '12',
  'أدوات هوائية': '13',
  'أدوات قياس': '14',
  'كوابس': '15',
  'أجهزة مكتبية': '21',
  'أجهزة كهربائية': '22',
  'طابعات ومكائن': '23',
  'كوابس حرارية': '24'
};

const EQUIPMENT_LOCATION_CODES = {
  'الادارة': '01',
  'المطبخ': '02',
  'غرفة الطابعات': '03',
  'غرفة لصق وتجليد': '04',
  'المكتب': '05',
  'المستودع': '06',
  'ساحة الورشة': '07'
};

function getEquipmentStatusCode(status) {
  return ({ operational: '01', dispatched: '02', maintenance: '03', broken: '04' })[status] || '04';
}

function buildEquipmentNumericQR(eq, index) {
  const catC = EQUIPMENT_CATEGORY_CODES[eq.category] || '99';
  const locC = EQUIPMENT_LOCATION_CODES[eq.location] || '00';
  const statC = getEquipmentStatusCode(eq.status);
  const seq = String(index + 1).padStart(4, '0');
  return `${catC}${locC}-${statC}${seq}-${catC}${locC}-${statC}${seq}`;
}

function syncEquipmentNumericQR(eq) {
  const index = (omni.equipment || []).findIndex(item => item.id === eq.id);
  if (index < 0) return false;
  const nextQR = buildEquipmentNumericQR(eq, index);
  if (eq.numericQR === nextQR) return false;
  eq.numericQR = nextQR;
  return true;
}

function splitEquipmentQuantitiesIntoAssets() {
  if (!Array.isArray(omni.migrationsApplied)) omni.migrationsApplied = [];
  if (omni.migrationsApplied.includes('equipment_physical_assets_v1')) {
    let normalized = false;
    (omni.equipment || []).forEach(eq => {
      if ((parseInt(eq.quantity || 1, 10) || 1) !== 1) {
        eq.quantity = 1;
        normalized = true;
      }
    });
    return normalized;
  }

  const used = new Set((omni.equipment || []).map(eq => eq.barcode).filter(Boolean));
  const expanded = [];
  let changed = false;

  (omni.equipment || []).forEach(eq => {
    const quantity = Math.max(1, parseInt(eq.quantity || 1, 10) || 1);
    eq.quantity = 1;
    expanded.push(eq);

    for (let index = 2; index <= quantity; index += 1) {
      const copy = {
        ...eq,
        id: makeId('eq'),
        barcode: makeUniqueEquipmentBarcode(`${eq.barcode || generateEquipmentBarcode(eq.location)}-${String(index).padStart(2, '0')}`, used),
        numericQR: '',
        quantity: 1
      };
      expanded.push(copy);
      changed = true;
    }
  });

  omni.equipment = expanded;
  omni.migrationsApplied.push('equipment_physical_assets_v1');
  return true;
}

function normalizeEquipment() {
  if (!omni) omni = {};
  if (!Array.isArray(omni.equipment) || !omni.equipment.length) {
    omni.equipment = defaultEquipment();
  }
  if (!Array.isArray(omni.equipmentDispatches)) {
    omni.equipmentDispatches = [];
  }
  if (!Array.isArray(omni.equipmentAuditLogs)) {
    omni.equipmentAuditLogs = [];
  }
  let equipmentChanged = splitEquipmentQuantitiesIntoAssets();
  omni.equipment.forEach((eq, index) => {
    // Legacy alphanumeric barcode — keep for scanner compatibility
    if (!eq.barcode) {
      const locCode = String(eq.location || 'GEN').slice(0, 4).toUpperCase();
      eq.barcode = `EQ-${locCode}-${(index + 1).toString().padStart(2, '0')}`;
      equipmentChanged = true;
    }
    if (!eq.status) {
      eq.status = 'operational';
      equipmentChanged = true;
    }
    if (syncEquipmentNumericQR(eq)) {
      equipmentChanged = true;
    }
    if ((parseInt(eq.quantity || 1, 10) || 1) !== 1) {
      eq.quantity = 1;
      equipmentChanged = true;
    }
  });
  if (equipmentChanged && typeof saveData === 'function' && !isEnsuringOmni) {
    saveData();
  }
}


// Real, scannable Code 39 barcode ("Code 3 of 9"). Encodes the ACTUAL code into
// proper bars so a physical scanner reads it. Supports A-Z, 0-9 and - . space
// $ / + % — equipment codes like "EQ-LOC-01" are fully covered. (The previous
// version drew a fixed decorative pattern that no scanner could read.)
const CODE39_MAP = {
  '0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw',
  '5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
  'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn',
  'F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
  'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn',
  'P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
  'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn',
  'Z':'nwwnwnnnn','-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn',
  '/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
};
function generateSvgBarcode(code) {
  const NARROW = 2, WIDE = 5, H = 46, GAP = NARROW, QUIET = 12, TOP = 8;
  let raw = String(code == null ? '' : code).toUpperCase();
  // keep only Code39-encodable characters; map anything else to '-'
  raw = raw.split('').map(ch => (CODE39_MAP[ch] && ch !== '*') ? ch : '-').join('') || '0';
  const data = '*' + raw + '*';                 // Code39 frames data with '*'
  let x = QUIET, rects = '';
  for (let c = 0; c < data.length; c++) {
    const pattern = CODE39_MAP[data[c]] || CODE39_MAP['-'];
    for (let i = 0; i < pattern.length; i++) {
      const w = pattern[i] === 'w' ? WIDE : NARROW;
      if (i % 2 === 0) rects += `<rect x="${x}" y="${TOP}" width="${w}" height="${H}" fill="#000"/>`; // even = bar
      x += w;
    }
    x += GAP;                                    // inter-character narrow space
  }
  const totalW = x + QUIET, svgH = H + TOP + 18;
  return `<svg width="${totalW}" height="${svgH}" viewBox="0 0 ${totalW} ${svgH}" xmlns="http://www.w3.org/2000/svg" style="background:#fff; border-radius:4px;">`
    + rects
    + `<text x="${totalW / 2}" y="${svgH - 4}" font-family="monospace" font-size="13" fill="#000" text-anchor="middle" letter-spacing="2">${escapeHtml(raw)}</text>`
    + `</svg>`;
}

function renderEquipmentStatusControl(eq) {
  const meta = equipmentStatusMeta(eq.status);
  return `
    <div class="eq-status-control" style="display:grid; gap:7px; min-width:150px;">
      <span class="analytics-risk-badge" style="display:inline-flex; align-items:center; justify-content:center; gap:6px; background:${meta.bg}; color:${meta.color}; border:1px solid ${meta.border};">
        <i class="fa-solid ${meta.icon}"></i> ${meta.label}
      </span>
      <select class="eq-status-select" onchange="window.updateEquipmentStatusInline('${eq.id}', this.value)" style="width:100%; background:rgba(2,6,23,0.72); border:1px solid ${meta.border}; color:${meta.color}; padding:6px 8px; border-radius:7px; font-size:11.5px; font-weight:800; outline:none;">
        <option value="operational" ${eq.status === 'operational' ? 'selected' : ''}>صالحة للعمل</option>
        <option value="maintenance" ${eq.status === 'maintenance' ? 'selected' : ''}>تحت الصيانة</option>
        <option value="broken" ${eq.status === 'broken' ? 'selected' : ''}>عاطلة / تالفة</option>
        <option value="dispatched" ${eq.status === 'dispatched' ? 'selected' : ''}>خارج الورشة</option>
      </select>
    </div>
  `;
}

function updateEquipmentStatusInline(eqId, status) {
  ensureOmni();
  normalizeEquipment();
  const eq = (omni.equipment || []).find(item => item.id === eqId);
  if (!eq) return;
  const nextStatus = String(status || '').trim();
  const validStatuses = ['operational', 'maintenance', 'broken', 'dispatched'];
  if (!validStatuses.includes(nextStatus)) {
    showToast('حالة المعدة غير معروفة. اختر حالة من القائمة.', 'warning');
    renderEquipmentPage();
    return;
  }
  if (nextStatus === eq.status) return;
  if (nextStatus === 'dispatched') {
    if (eq.status !== 'operational') {
      showToast(`[${eq.name}] ليست جاهزة للإخراج. الحالة الحالية: ${equipmentStatusMeta(eq.status).label}`, 'warning');
      renderEquipmentPage();
      return;
    }
    showDispatchModal(eqId);
    return;
  }
  if (eq.status === 'dispatched') {
    showToast('هذه القطعة خارج الورشة حالياً. أرجعها من سجل العهد النشطة حتى ينغلق سجلها بشكل صحيح.', 'warning');
    renderEquipmentPage();
    return;
  }
  quickAuditItem(eqId, nextStatus);
}

function normalizeEquipmentScanCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

function getEquipmentByScanCode(code) {
  const scanned = normalizeEquipmentScanCode(code);
  if (!scanned) return null;
  return (omni.equipment || []).find(eq => {
    const barcode = normalizeEquipmentScanCode(eq.barcode);
    const numeric = normalizeEquipmentScanCode(eq.numericQR);
    return barcode === scanned || numeric === scanned;
  }) || null;
}

function focusEquipmentDispatchScanner() {
  const input = document.getElementById('eqDispatchScanInput');
  if (input) {
    input.focus();
    input.select();
  }
}

function captureEquipmentDispatchDraft() {
  const employeeField = document.getElementById('eqDispatchEmployeeName');
  const jobSiteField = document.getElementById('eqDispatchJobSite');
  const returnDateField = document.getElementById('eqDispatchExpectedReturnDate');
  equipmentDispatchDraft = {
    employeeName: employeeField ? employeeField.value : equipmentDispatchDraft.employeeName || '',
    jobSite: jobSiteField ? jobSiteField.value : equipmentDispatchDraft.jobSite || '',
    expectedReturnDate: returnDateField ? returnDateField.value : equipmentDispatchDraft.expectedReturnDate || ''
  };
}

function addEquipmentDispatchScan(code = null) {
  ensureOmni();
  normalizeEquipment();
  captureEquipmentDispatchDraft();
  const input = document.getElementById('eqDispatchScanInput');
  const scanned = normalizeEquipmentScanCode(code ?? input?.value);
  if (!scanned) {
    focusEquipmentDispatchScanner();
    return;
  }
  const eq = getEquipmentByScanCode(scanned);
  if (!eq) {
    showToast(`لم يتم العثور على قطعة بالباركود: ${scanned}`, 'warning');
    if (input) input.value = '';
    focusEquipmentDispatchScanner();
    return;
  }
  if (eq.status !== 'operational') {
    showToast(`[${eq.name}] ليست جاهزة للإخراج. الحالة الحالية: ${equipmentStatusMeta(eq.status).label}`, 'warning');
    if (input) input.value = '';
    focusEquipmentDispatchScanner();
    return;
  }
  if (equipmentDispatchCart.includes(eq.id)) {
    showToast(`[${eq.name}] موجودة مسبقاً في القائمة`, 'info');
    if (input) input.value = '';
    focusEquipmentDispatchScanner();
    return;
  }
  equipmentDispatchCart.push(eq.id);
  showToast(`تمت إضافة [${eq.name}] إلى قائمة العهد`, 'success');
  renderEquipmentPage();
}

function handleEquipmentDispatchScanKey(event) {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  addEquipmentDispatchScan(event.target.value);
}

function handleEquipmentDispatchScanInput(value) {
  clearTimeout(equipmentDispatchScanTimer);
  equipmentDispatchScanTimer = setTimeout(() => {
    const eq = getEquipmentByScanCode(value);
    if (eq) addEquipmentDispatchScan(value);
  }, 180);
}

function removeEquipmentDispatchCartItem(eqId) {
  captureEquipmentDispatchDraft();
  equipmentDispatchCart = equipmentDispatchCart.filter(id => id !== eqId);
  renderEquipmentPage();
}

function clearEquipmentDispatchCart() {
  captureEquipmentDispatchDraft();
  equipmentDispatchCart = [];
  renderEquipmentPage();
}

function commitEquipmentDispatchCart() {
  ensureOmni();
  normalizeEquipment();
  captureEquipmentDispatchDraft();
  const employee = document.getElementById('eqDispatchEmployeeName')?.value || 'غير محدد';
  const jobSite = document.getElementById('eqDispatchJobSite')?.value.trim();
  const expectedReturnDate = document.getElementById('eqDispatchExpectedReturnDate')?.value || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  if (!equipmentDispatchCart.length) {
    showToast('امسح باركود قطعة واحدة على الأقل قبل الحفظ.', 'warning');
    focusEquipmentDispatchScanner();
    return;
  }
  if (!jobSite) {
    showToast('اكتب موقع العمل أو الجهة المستلمة قبل الحفظ.', 'warning');
    document.getElementById('eqDispatchJobSite')?.focus();
    return;
  }

  const selectedIds = [...new Set(equipmentDispatchCart)];
  const tools = selectedIds
    .map(id => (omni.equipment || []).find(eq => eq.id === id))
    .filter(eq => eq && eq.status === 'operational');
  if (!tools.length) {
    showToast('لا توجد قطع جاهزة للحفظ في القائمة الحالية.', 'warning');
    equipmentDispatchCart = [];
    renderEquipmentPage();
    return;
  }

  omni.equipmentDispatches = omni.equipmentDispatches || [];
  tools.forEach(eq => {
    eq.status = 'dispatched';
    syncEquipmentNumericQR(eq);
    omni.equipmentDispatches.push({
      id: makeId('disp'),
      equipmentId: eq.id,
      equipmentName: eq.name,
      equipmentBarcode: eq.barcode,
      employeeName: employee,
      jobSite,
      checkoutDate: new Date().toISOString().slice(0, 10),
      expectedReturnDate,
      actualReturnDate: null,
      status: 'dispatched',
      conditionOnReturn: null
    });
  });

  equipmentDispatchCart = [];
  saveData();
  showToast(`تم تسليم ${tools.length} قطعة كعهد خارجية إلى ${employee}`, 'success');
  renderEquipmentPage();
}

function renderEquipmentDispatchScannerPanel() {
  const employeesList = window.employees || [];
  const defaultReturnDate = equipmentDispatchDraft.expectedReturnDate || new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const empOptions = employeesList.map(emp => `<option value="${escapeHtml(emp.name)}" ${equipmentDispatchDraft.employeeName === emp.name ? 'selected' : ''}>${escapeHtml(emp.name)}</option>`).join('');
  const cartItems = equipmentDispatchCart
    .map(id => (omni.equipment || []).find(eq => eq.id === id))
    .filter(Boolean);

  return `
    <div class="eq-dispatch-scanner" style="display:grid; gap:14px; margin-bottom:16px; padding:16px; border:1px solid rgba(99,102,241,0.22); border-radius:12px; background:linear-gradient(135deg, rgba(15,23,42,0.88), rgba(30,41,59,0.58));">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; flex-wrap:wrap;">
        <div>
          <h3 style="margin:0 0 5px; color:#e0f2fe; font-size:17px;"><i class="fa-solid fa-barcode"></i> تسليم عهد خارجية بالباركود</h3>
          <p style="margin:0; color:var(--text-muted); font-size:12.5px;">ضع المؤشر في حقل الباركود، امسح القطع واحدة بعد الأخرى، ثم احفظ القائمة دفعة واحدة.</p>
        </div>
        <span style="display:inline-flex; align-items:center; gap:7px; padding:6px 10px; border-radius:999px; background:rgba(99,102,241,0.16); color:#c4b5fd; font-size:12px; font-weight:800;">
          <i class="fa-solid fa-list-check"></i> ${cartItems.length} قطعة جاهزة
        </span>
      </div>
      <div style="display:grid; grid-template-columns:minmax(170px, 0.7fr) minmax(180px, 1fr) 170px minmax(220px, 1.1fr); gap:10px; align-items:end;">
        <label class="field" style="display:grid; gap:5px;">
          <span>الموظف المستلم</span>
          <select id="eqDispatchEmployeeName" class="form-input" style="width:100%; background:rgba(2,6,23,0.62); border:1px solid rgba(148,163,184,0.18); color:var(--text); padding:9px; border-radius:8px;">
            ${empOptions || '<option value="غير محدد">غير محدد</option>'}
          </select>
        </label>
        <label class="field" style="display:grid; gap:5px;">
          <span>موقع العمل / الجهة</span>
          <input type="text" id="eqDispatchJobSite" class="form-input" value="${escapeHtml(equipmentDispatchDraft.jobSite || '')}" placeholder="مثال: موقع الزبون / فعالية / تركيب خارجي" style="width:100%; background:rgba(2,6,23,0.62); border:1px solid rgba(148,163,184,0.18); color:var(--text); padding:9px; border-radius:8px;">
        </label>
        <label class="field" style="display:grid; gap:5px;">
          <span>موعد الإرجاع</span>
          <input type="date" id="eqDispatchExpectedReturnDate" class="form-input" value="${defaultReturnDate}" style="width:100%; background:rgba(2,6,23,0.62); border:1px solid rgba(148,163,184,0.18); color:var(--text); padding:9px; border-radius:8px;">
        </label>
        <label class="field" style="display:grid; gap:5px;">
          <span>قارئ الباركود</span>
          <input type="text" id="eqDispatchScanInput" class="form-input" autocomplete="off" placeholder="Scan / Enter" onkeydown="window.handleEquipmentDispatchScanKey(event)" oninput="window.handleEquipmentDispatchScanInput(this.value)" style="width:100%; background:rgba(2,6,23,0.72); border:1px solid rgba(56,189,248,0.42); color:#e0f2fe; padding:10px 12px; border-radius:9px; font-family:monospace; font-size:13px; outline:none;">
        </label>
      </div>
      <div style="display:grid; gap:8px;">
        ${cartItems.length ? cartItems.map(eq => `
          <div style="display:grid; grid-template-columns:1fr auto auto; gap:10px; align-items:center; padding:9px 10px; border-radius:9px; background:rgba(2,6,23,0.42); border:1px solid rgba(148,163,184,0.12);">
            <div>
              <b style="color:#f8fafc;">${escapeHtml(eq.name)}</b>
              <small style="display:block; color:#7dd3fc; font-family:monospace;">${escapeHtml(eq.barcode)}</small>
            </div>
            <span style="color:var(--text-muted); font-size:11px;">${escapeHtml(eq.location || '-')}</span>
            <button class="btn-secondary" style="padding:5px 8px;" onclick="window.removeEquipmentDispatchCartItem('${eq.id}')" title="إزالة"><i class="fa-solid fa-xmark"></i></button>
          </div>
        `).join('') : `
          <div style="padding:14px; border:1px dashed rgba(148,163,184,0.22); border-radius:10px; color:var(--text-muted); text-align:center;">
            لا توجد قطع في القائمة. امسح الباركود وسيتم إدخال القطعة تلقائياً.
          </div>
        `}
      </div>
      <div style="display:flex; gap:10px; justify-content:flex-start; flex-wrap:wrap;">
        <button class="btn-primary" onclick="window.commitEquipmentDispatchCart()"><i class="fa-solid fa-check"></i> حفظ تسليم العهد</button>
        <button class="btn-secondary" onclick="window.addEquipmentDispatchScan()"><i class="fa-solid fa-plus"></i> إضافة الكود الحالي</button>
        <button class="btn-secondary" onclick="window.clearEquipmentDispatchCart()"><i class="fa-solid fa-eraser"></i> مسح القائمة</button>
      </div>
    </div>
  `;
}

function renderEquipmentPage() {
  ensureOmni();
  normalizeEquipment();
  
  const totalCount = omni.equipment.length;
  const operationalCount = omni.equipment.filter(e => e.status === 'operational').length;
  const dispatchedCount = omni.equipment.filter(e => e.status === 'dispatched').length;
  const brokenCount = omni.equipment.filter(e => e.status === 'maintenance' || e.status === 'broken').length;
  
  const today = new Date();
  const auditedCount = omni.equipment.filter(e => {
    if (!e.lastAuditDate) return false;
    const d = new Date(e.lastAuditDate);
    return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  }).length;
  
  const activeDispatchesCount = (omni.equipmentDispatches || []).filter(d => d.status === 'dispatched').length;
  
  const body = document.getElementById('equipmentBody');
  if (!body) return;
  
  let html = `
    <div class="hr-ai-kpis" style="margin-bottom:20px; display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:15px;">
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:15px; border-radius:12px; border-right:4px solid var(--accent-cyan); display:flex; flex-direction:column; gap:4px;">
        <span style="font-size:11px; color:var(--text-muted); font-weight:bold;">إجمالي المعدات والأدوات</span>
        <b style="font-size:24px; color:var(--accent-cyan);">${totalCount}</b>
      </div>
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:15px; border-radius:12px; border-right:4px solid var(--success); display:flex; flex-direction:column; gap:4px;">
        <span style="font-size:11px; color:var(--text-muted); font-weight:bold;">صالحة للعمل (جاهزة)</span>
        <b style="font-size:24px; color:var(--success);">${operationalCount}</b>
      </div>
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:15px; border-radius:12px; border-right:4px solid var(--accent-blue); display:flex; flex-direction:column; gap:4px;">
        <span style="font-size:11px; color:var(--text-muted); font-weight:bold;">خارج الورشة (مرحلة)</span>
        <b style="font-size:24px; color:var(--accent-blue);">${dispatchedCount}</b>
      </div>
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:15px; border-radius:12px; border-right:4px solid var(--danger); display:flex; flex-direction:column; gap:4px;">
        <span style="font-size:11px; color:var(--text-muted); font-weight:bold;">أعطال وقيد الصيانة</span>
        <b style="font-size:24px; color:var(--danger);">${brokenCount}</b>
      </div>
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); padding:15px; border-radius:12px; border-right:4px solid #a855f7; display:flex; flex-direction:column; gap:4px;">
        <span style="font-size:11px; color:var(--text-muted); font-weight:bold;">مفحوصة هذا الشهر</span>
        <b style="font-size:24px; color:#c084fc;">${auditedCount} / ${totalCount}</b>
      </div>
    </div>
    
    <div style="background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); padding:15px; border-radius:12px; display:flex; flex-wrap:wrap; gap:12px; align-items:center; margin-bottom:20px; direction:rtl;">
      <div style="flex:1; min-width:200px; position:relative;">
        <i class="fa-solid fa-magnifying-glass" style="position:absolute; right:12px; top:50%; transform:translateY(-50%); color:var(--text-muted); font-size:12px;"></i>
        <input type="text" id="eqSearchInput" placeholder="البحث باسم المعدة أو الباركود..." style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px 32px 8px 12px; border-radius:6px; font-size:12.5px; outline:none;" value="${escapeHtml(equipmentSearchQuery)}" oninput="window.updateEquipmentSearch(this.value)">
      </div>
      
      <div>
        <select id="eqLocFilter" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px 12px; border-radius:6px; font-size:12.5px; outline:none;" onchange="window.updateEquipmentLocFilter(this.value)">
          <option value="">كل المواقع</option>
          <option value="الادارة" ${equipmentLocationFilter === 'الادارة' ? 'selected' : ''}>الادارة</option>
          <option value="المطبخ" ${equipmentLocationFilter === 'المطبخ' ? 'selected' : ''}>المطبخ</option>
          <option value="غرفة الطابعات" ${equipmentLocationFilter === 'غرفة الطابعات' ? 'selected' : ''}>غرفة الطابعات</option>
          <option value="غرفة لصق وتجليد" ${equipmentLocationFilter === 'غرفة لصق وتجليد' ? 'selected' : ''}>غرفة لصق وتجليد</option>
          <option value="المكتب" ${equipmentLocationFilter === 'المكتب' ? 'selected' : ''}>المكتب</option>
          <option value="المستودع" ${equipmentLocationFilter === 'المستودع' ? 'selected' : ''}>المستودع</option>
          <option value="ساحة الورشة" ${equipmentLocationFilter === 'ساحة الورشة' ? 'selected' : ''}>ساحة الورشة</option>
        </select>
      </div>
      
      <div>
        <select id="eqCatFilter" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px 12px; border-radius:6px; font-size:12.5px; outline:none;" onchange="window.updateEquipmentCatFilter(this.value)">
          <option value="">كل التصنيفات</option>
          <option value="أدوات يدوية" ${equipmentCategoryFilter === 'أدوات يدوية' ? 'selected' : ''}>أدوات يدوية</option>
          <option value="أدوات كهربائية" ${equipmentCategoryFilter === 'أدوات كهربائية' ? 'selected' : ''}>أدوات كهربائية</option>
          <option value="أدوات هوائية" ${equipmentCategoryFilter === 'أدوات هوائية' ? 'selected' : ''}>أدوات هوائية</option>
          <option value="أدوات قياس" ${equipmentCategoryFilter === 'أدوات قياس' ? 'selected' : ''}>أدوات قياس</option>
          <option value="كوابس" ${equipmentCategoryFilter === 'كوابس' ? 'selected' : ''}>كوابس</option>
          <option value="أجهزة مكتبية" ${equipmentCategoryFilter === 'أجهزة مكتبية' ? 'selected' : ''}>أجهزة مكتبية</option>
          <option value="أجهزة كهربائية" ${equipmentCategoryFilter === 'أجهزة كهربائية' ? 'selected' : ''}>أجهزة كهربائية</option>
          <option value="طابعات ومكائن" ${equipmentCategoryFilter === 'طابعات ومكائن' ? 'selected' : ''}>طابعات ومكائن</option>
          <option value="كوابس حرارية" ${equipmentCategoryFilter === 'كوابس حرارية' ? 'selected' : ''}>كوابس حرارية</option>
        </select>
      </div>
      
      <div>
        <select id="eqStatusFilter" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px 12px; border-radius:6px; font-size:12.5px; outline:none;" onchange="window.updateEquipmentStatusFilter(this.value)">
          <option value="">كل الحالات</option>
          <option value="operational" ${equipmentStatusFilter === 'operational' ? 'selected' : ''}>صالحة للعمل</option>
          <option value="dispatched" ${equipmentStatusFilter === 'dispatched' ? 'selected' : ''}>مرحلة خارجياً</option>
          <option value="maintenance" ${equipmentStatusFilter === 'maintenance' ? 'selected' : ''}>تحت الصيانة</option>
          <option value="broken" ${equipmentStatusFilter === 'broken' ? 'selected' : ''}>تالفة / عاطلة</option>
        </select>
      </div>
      
      <button class="btn-secondary" style="font-size:12px; padding:6px 12px; border:1px solid rgba(255,255,255,0.1); background:transparent;" onclick="window.clearEquipmentFilters()"><i class="fa-solid fa-trash-can"></i> إعادة تعيين</button>
    </div>
    
    <div style="display:flex; gap:6px; margin:16px 0; border-bottom:1px solid rgba(255,255,255,0.08); direction:rtl; padding-bottom:1px;">
      <button class="tab-btn" onclick="window.switchEquipmentTab('list')" style="padding:8px 18px; border:none; background:${equipmentActiveTab==='list'?'rgba(6,182,212,0.12)':'transparent'}; color:${equipmentActiveTab==='list'?'var(--accent-cyan)':'var(--text-muted)'}; border-bottom:2px solid ${equipmentActiveTab==='list'?'var(--accent-cyan)':'transparent'}; cursor:pointer; font-size:13px; font-weight:bold; border-radius:6px 6px 0 0; transition:all 0.2s;">
        🔨 قائمة الأدوات والعهد
      </button>
      <button class="tab-btn" onclick="window.switchEquipmentTab('active_dispatches')" style="padding:8px 18px; border:none; background:${equipmentActiveTab==='active_dispatches'?'rgba(129,140,248,0.12)':'transparent'}; color:${equipmentActiveTab==='active_dispatches'?'var(--accent-blue)':'var(--text-muted)'}; border-bottom:2px solid ${equipmentActiveTab==='active_dispatches'?'var(--accent-blue)':'transparent'}; cursor:pointer; font-size:13px; font-weight:bold; border-radius:6px 6px 0 0; transition:all 0.2s;">
        📦 العهد الخارجية النشطة <span style="background:rgba(99,102,241,0.2); color:#a5b4fc; border-radius:10px; font-size:10px; padding:1px 6px; margin-inline-start:4px;">${activeDispatchesCount}</span>
      </button>
      <button class="tab-btn" onclick="window.switchEquipmentTab('dispatch_history')" style="padding:8px 18px; border:none; background:${equipmentActiveTab==='dispatch_history'?'rgba(52,211,153,0.12)':'transparent'}; color:${equipmentActiveTab==='dispatch_history'?'var(--success)':'var(--text-muted)'}; border-bottom:2px solid ${equipmentActiveTab==='dispatch_history'?'var(--success)':'transparent'}; cursor:pointer; font-size:13px; font-weight:bold; border-radius:6px 6px 0 0; transition:all 0.2s;">
        📜 سجل العهد الخارجية
      </button>
      <button class="tab-btn" onclick="window.switchEquipmentTab('audit_history')" style="padding:8px 18px; border:none; background:${equipmentActiveTab==='audit_history'?'rgba(168,85,247,0.12)':'transparent'}; color:${equipmentActiveTab==='audit_history'?'#c084fc':'var(--text-muted)'}; border-bottom:2px solid ${equipmentActiveTab==='audit_history'?'#a855f7':'transparent'}; cursor:pointer; font-size:13px; font-weight:bold; border-radius:6px 6px 0 0; transition:all 0.2s;">
        📋 سجل التدقيق الشهري
      </button>
    </div>
    
    <div style="direction:rtl;">
  `;
  
  if (equipmentActiveTab === 'list') {
    let filtered = omni.equipment;
    if (equipmentSearchQuery) {
      const q = equipmentSearchQuery.toLowerCase();
      filtered = filtered.filter(e => e.name.toLowerCase().includes(q) || e.barcode.toLowerCase().includes(q));
    }
    if (equipmentLocationFilter) {
      filtered = filtered.filter(e => e.location === equipmentLocationFilter);
    }
    if (equipmentCategoryFilter) {
      filtered = filtered.filter(e => e.category === equipmentCategoryFilter);
    }
    if (equipmentStatusFilter) {
      filtered = filtered.filter(e => e.status === equipmentStatusFilter);
    }
    
    html += `
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table">
          <thead>
            <tr style="background:rgba(255,255,255,0.02);">
              <th style="padding:12px; text-align:right;">الباركود</th>
              <th style="padding:12px; text-align:right;">اسم المعدة / الأداة</th>
              <th style="padding:12px; text-align:right;">التصنيف</th>
              <th style="padding:12px; text-align:right;">موقع التواجد</th>
              <th style="padding:12px; text-align:center;">الحالة للعمل اليومي</th>
              <th style="padding:12px; text-align:center;">التسجيل</th>
              <th style="padding:12px; text-align:center;">آخر فحص</th>
              <th style="padding:12px; text-align:right;">ملاحظات</th>
              <th style="padding:12px; text-align:center; width:200px;">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${filtered.length ? filtered.map(eq => {
              const statusBadges = {
                operational: `<span class="analytics-risk-badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.25);">صالحة للعمل</span>`,
                dispatched: `<span class="analytics-risk-badge" style="background:rgba(99,102,241,0.15); color:#a5b4fc; border:1px solid rgba(99,102,241,0.25);">مرحلة خارجياً</span>`,
                maintenance: `<span class="analytics-risk-badge" style="background:rgba(245,158,11,0.15); color:#fde047; border:1px solid rgba(245,158,11,0.25);">تحت الصيانة</span>`,
                broken: `<span class="analytics-risk-badge" style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.25);">عاطلة / تالفة</span>`
              };
              
              let auditStyle = '';
              if (!eq.lastAuditDate) {
                auditStyle = 'color:#f87171; font-weight:bold;';
              } else {
                const aud = new Date(eq.lastAuditDate);
                if (aud.getMonth() !== today.getMonth() || aud.getFullYear() !== today.getFullYear()) {
                  auditStyle = 'color:#fbbf24; font-weight:bold;';
                }
              }
              
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05); transition:background 0.2s;" class="eq-table-row">
                  <td style="padding:10px 12px;">
                    <div style="display:flex; align-items:center; gap:6px;">
                      <div class="eq-numeric-qr" title="${escapeHtml(eq.barcode)}">
                        ${(eq.barcode || '').split('-').map(g => `<span class="eq-numeric-qr-group">${g}</span>`).join('<span style="color:rgba(255,255,255,0.2);font-size:9px;">–</span>')}
                      </div>
                      <button type="button" class="eq-copy-barcode-btn" onclick="event.stopPropagation(); window.copyEquipmentBarcode('${eq.id}')" title="نسخ الباركود" aria-label="نسخ الباركود">
                        <i class="fa-solid fa-copy"></i>
                      </button>
                    </div>
                  </td>
                  <td style="padding:10px 12px; font-weight:bold; color:var(--text-primary);">${escapeHtml(eq.name)}</td>
                  <td style="padding:10px 12px; color:var(--text-secondary);">${escapeHtml(eq.category)}</td>
                  <td style="padding:10px 12px; color:var(--text-secondary);"><span style="background:rgba(255,255,255,0.03); padding:3px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">${escapeHtml(eq.location)}</span></td>
                  <td style="padding:10px 12px; text-align:center;">
                    ${renderEquipmentStatusControl(eq)}
                  </td>
                  <td style="padding:12px; text-align:center; color:#7dd3fc; font-size:12px; font-weight:800;">قطعة واحدة</td>
                  <td style="padding:12px; text-align:center; font-size:12px; ${auditStyle}">${eq.lastAuditDate || 'لم تدقق'}</td>
                  <td style="padding:12px; max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(eq.notes || '')}">${escapeHtml(eq.notes || '-')}</td>
                  <td style="padding:12px; text-align:center;">
                    <div style="display:flex; gap:6px; justify-content:center;">
                      <button class="btn-secondary" style="padding:4px; font-size:12px;" onclick="window.printEquipmentBarcode('${eq.id}')" title="طباعة ملصق الباركود"><i class="fa-solid fa-print"></i> باركود</button>
                      <button class="btn-secondary" style="padding:4px; font-size:12px;" onclick="window.showEquipmentAuditModal('${eq.id}')" title="تدقيق وملاحظات"><i class="fa-solid fa-clipboard-check"></i> فحص</button>
                      <button class="btn-secondary" style="padding:4px; font-size:12px;" onclick="window.showEditEquipmentModal('${eq.id}')" title="تعديل"><i class="fa-solid fa-edit"></i></button>
                      <button class="btn-danger" style="padding:4px; font-size:12px;" onclick="window.deleteEquipment('${eq.id}')" title="حذف"><i class="fa-solid fa-trash"></i></button>
                    </div>
                  </td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="9" style="text-align:center; padding:30px; color:var(--text-muted);">
                  لا توجد أي نتائج مطابقة لفلاتر البحث المحددة.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  } else if (equipmentActiveTab === 'active_dispatches') {
    const activeDispatches = (omni.equipmentDispatches || []).filter(d => d.status === 'dispatched');
    html += `
      ${renderEquipmentDispatchScannerPanel()}
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table">
          <thead>
            <tr style="background:rgba(255,255,255,0.02);">
              <th style="padding:12px; text-align:right;">المعدة / الأداة</th>
              <th style="padding:12px; text-align:right;">الموظف المستلم للعهدة</th>
              <th style="padding:12px; text-align:right;">جهة العمل الخارجي / الموقع</th>
              <th style="padding:12px; text-align:center;">تاريخ الإخراج</th>
              <th style="padding:12px; text-align:center;">تاريخ الإرجاع المتوقع</th>
              <th style="padding:12px; text-align:center;">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${activeDispatches.length ? activeDispatches.map(d => `
              <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                <td style="padding:12px;"><b>${escapeHtml(d.equipmentName)}</b><br><small style="font-family:monospace; color:var(--accent-cyan);">${escapeHtml(d.equipmentBarcode)}</small></td>
                <td style="padding:12px; font-weight:bold; color:var(--accent-blue);">${escapeHtml(d.employeeName)}</td>
                <td style="padding:12px;"><span style="background:rgba(255,255,255,0.03); padding:4px 8px; border-radius:4px; border:1px solid rgba(255,255,255,0.05);">${escapeHtml(d.jobSite)}</span></td>
                <td style="padding:12px; text-align:center; font-family:monospace;">${escapeHtml(d.checkoutDate)}</td>
                <td style="padding:12px; text-align:center; font-family:monospace; color:var(--warning);">${escapeHtml(d.expectedReturnDate)}</td>
                <td style="padding:12px; text-align:center;">
                  <button class="btn-primary" style="padding:6px 12px; font-size:12px;" onclick="window.returnEquipment('${d.id}')">↩ إرجاع للورشة (استلام)</button>
                </td>
              </tr>
            `).join('') : `
              <tr>
                <td colspan="6" style="text-align:center; padding:30px; color:var(--text-muted);">
                  لا توجد أي عهد خارجية نشطة حالياً.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  } else if (equipmentActiveTab === 'dispatch_history') {
    const history = omni.equipmentDispatches || [];
    html += `
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table">
          <thead>
            <tr style="background:rgba(255,255,255,0.02);">
              <th style="padding:12px; text-align:right;">المعدة / الأداة</th>
              <th style="padding:12px; text-align:right;">الموظف المستلم للعهدة</th>
              <th style="padding:12px; text-align:right;">جهة العمل الخارجي / الموقع</th>
              <th style="padding:12px; text-align:center;">تاريخ الإخراج</th>
              <th style="padding:12px; text-align:center;">تاريخ الإرجاع الفعلي</th>
              <th style="padding:12px; text-align:center;">الحالة عند الإرجاع</th>
              <th style="padding:12px; text-align:right;">ملاحظات الإرجاع</th>
            </tr>
          </thead>
          <tbody>
            ${history.length ? history.map(d => {
              const statusColors = {
                operational: '#34d399',
                maintenance: '#fde047',
                broken: '#f87171'
              };
              const condLabel = d.conditionOnReturn ? (d.conditionOnReturn === 'operational' ? 'صالحة للعمل' : d.conditionOnReturn === 'maintenance' ? 'صيانة خفيفة' : 'تالفة / عاطلة') : '';
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:12px;"><b>${escapeHtml(d.equipmentName)}</b><br><small style="font-family:monospace; color:var(--accent-cyan);">${escapeHtml(d.equipmentBarcode)}</small></td>
                  <td style="padding:12px;">${escapeHtml(d.employeeName)}</td>
                  <td style="padding:12px;">${escapeHtml(d.jobSite)}</td>
                  <td style="padding:12px; text-align:center; font-family:monospace;">${escapeHtml(d.checkoutDate)}</td>
                  <td style="padding:12px; text-align:center; font-family:monospace; color:${d.actualReturnDate?'var(--success)':'var(--warning)'};">${d.actualReturnDate ? escapeHtml(d.actualReturnDate) : 'لم ترجع بعد'}</td>
                  <td style="padding:12px; text-align:center;">
                    ${condLabel ? `<span class="analytics-risk-badge" style="background:rgba(255,255,255,0.02); color:${statusColors[d.conditionOnReturn]}; border:1px solid ${statusColors[d.conditionOnReturn]}22;">${condLabel}</span>` : '-'}
                  </td>
                  <td style="padding:12px; color:var(--text-secondary); max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(d.returnNotes || '-')}</td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="7" style="text-align:center; padding:30px; color:var(--text-muted);">
                  سجل العهد الخارجية فارغ تماماً.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  } else if (equipmentActiveTab === 'audit_history') {
    const logs = omni.equipmentAuditLogs || [];
    html += `
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table">
          <thead>
            <tr style="background:rgba(255,255,255,0.02);">
              <th style="padding:12px; text-align:center;">التاريخ</th>
              <th style="padding:12px; text-align:right;">المعدة / الأداة</th>
              <th style="padding:12px; text-align:right;">المسؤول الفاحص</th>
              <th style="padding:12px; text-align:center;">الحالة المسجلة</th>
              <th style="padding:12px; text-align:right;">ملاحظات الفحص والتدقيق</th>
            </tr>
          </thead>
          <tbody>
            ${logs.length ? logs.map(l => {
              const statusBadges = {
                operational: `<span class="analytics-risk-badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.25);">صالحة للعمل</span>`,
                maintenance: `<span class="analytics-risk-badge" style="background:rgba(245,158,11,0.15); color:#fde047; border:1px solid rgba(245,158,11,0.25);">تحت الصيانة</span>`,
                broken: `<span class="analytics-risk-badge" style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.25);">تالفة / عاطلة</span>`
              };
              return `
                <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                  <td style="padding:12px; text-align:center; font-family:monospace;">${escapeHtml(l.date)}</td>
                  <td style="padding:12px;"><b>${escapeHtml(l.equipmentName)}</b></td>
                  <td style="padding:12px; font-weight:bold;">${escapeHtml(l.inspector)}</td>
                  <td style="padding:12px; text-align:center;">${statusBadges[l.status] || l.status}</td>
                  <td style="padding:12px; color:var(--text-secondary);">${escapeHtml(l.notes)}</td>
                </tr>
              `;
            }).join('') : `
              <tr>
                <td colspan="5" style="text-align:center; padding:30px; color:var(--text-muted);">
                  لا توجد أي فحوصات دورية مسجلة بعد.
                </td>
              </tr>
            `}
          </tbody>
        </table>
      </div>
    `;
  }
  
  html += `</div>`;
  body.innerHTML = html;
  if (equipmentActiveTab === 'active_dispatches') {
    setTimeout(focusEquipmentDispatchScanner, 0);
  }
}

function switchEquipmentTab(tab) {
  equipmentActiveTab = tab;
  renderEquipmentPage();
}

function updateEquipmentSearch(val) {
  equipmentSearchQuery = val;
  renderEquipmentPage();
}

function updateEquipmentLocFilter(val) {
  equipmentLocationFilter = val;
  renderEquipmentPage();
}

function updateEquipmentCatFilter(val) {
  equipmentCategoryFilter = val;
  renderEquipmentPage();
}

function updateEquipmentStatusFilter(val) {
  equipmentStatusFilter = val;
  renderEquipmentPage();
}

function clearEquipmentFilters() {
  equipmentSearchQuery = '';
  equipmentLocationFilter = '';
  equipmentCategoryFilter = '';
  equipmentStatusFilter = '';
  const searchInput = document.getElementById('eqSearchInput');
  if (searchInput) searchInput.value = '';
  const locFilter = document.getElementById('eqLocFilter');
  if (locFilter) locFilter.value = '';
  const catFilter = document.getElementById('eqCatFilter');
  if (catFilter) catFilter.value = '';
  const statusFilter = document.getElementById('eqStatusFilter');
  if (statusFilter) statusFilter.value = '';
  renderEquipmentPage();
}

// Print HTML via a hidden iframe — not blocked by popup blockers (unlike
// window.open), so the print button works reliably. Falls back to window.open.
function printHtmlDocument(html) {
  try {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0; visibility:hidden;';
    document.body.appendChild(iframe);
    const cleanup = () => setTimeout(() => { try { document.body.removeChild(iframe); } catch (_) {} }, 1500);
    let didPrint = false;
    const triggerPrint = () => {
      if (didPrint) return;
      didPrint = true;
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch (e) {
        const w = window.open('', '_blank', 'width=430,height=460');
        if (w) { w.document.open(); w.document.write(html); w.document.close(); }
      }
      cleanup();
    };
    iframe.onload = triggerPrint;
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
    setTimeout(triggerPrint, 120);
  } catch (e) {
    const w = window.open('', '_blank', 'width=430,height=460');
    if (w) { w.document.open(); w.document.write(html); w.document.close(); }
    else showToast('تعذّر فتح نافذة الطباعة. اسمح بالنوافذ المنبثقة.', 'warning');
  }
}

function printEquipmentBarcodeNow(eqId) {
  ensureOmni();
  normalizeEquipment();
  const eq = (omni.equipment || []).find(e => e.id === eqId);
  if (!eq) return showToast('فشل: لم يتم العثور على المعدة', 'error');
  const barcodeSvg = generateSvgBarcode(eq.barcode);
  const html = `
    <html dir="rtl">
    <head>
      <title>ملصق: ${escapeHtml(eq.name)}</title>
      <style>
        body { font-family:Arial, sans-serif; padding:20px; background:#fff; color:#000; text-align:center; }
        .barcode-label { display:inline-block; border:2px dashed #000; padding:20px; border-radius:8px; width:300px; }
        .title { font-size:12px; font-weight:bold; border-bottom:2px solid #000; padding-bottom:5px; margin-bottom:10px; }
        .field { text-align:right; font-size:13px; margin:5px 0; }
        @media print { @page { margin:8mm; } }
      </style>
    </head>
    <body>
      <div class="barcode-label">
        <div class="title">OCTAGON WORKSHOP ASSET</div>
        <div class="field"><b>الأداة:</b> ${escapeHtml(eq.name)}</div>
        <div class="field"><b>الموقع:</b> ${escapeHtml(eq.location || '')}</div>
        <div class="field"><b>التصنيف:</b> ${escapeHtml(eq.category || '')}</div>
        <div style="margin:15px 0;">${barcodeSvg}</div>
        <div style="font-size:9px; color:#444;">PROPERTY OF OCTAGON - BASRAH</div>
      </div>
    </body>
    </html>`;
  printHtmlDocument(html);
  showToast(`تم تجهيز طباعة باركود [${eq.name}]`, 'success');
}

function printEquipmentBarcode(eqId) {
  ensureOmni();
  normalizeEquipment();
  const eq = (omni.equipment || []).find(e => e.id === eqId);
  if (!eq) return showToast('فشل: لم يتم العثور على المعدة', 'error');
  printEquipmentBarcodeNow(eqId);
}

function previewEquipmentBarcode(eqId) {
  ensureOmni();
  normalizeEquipment();
  const eq = (omni.equipment || []).find(e => e.id === eqId);
  if (!eq) return showToast('فشل: لم يتم العثور على المعدة', 'error');
  
  const barcodeSvg = generateSvgBarcode(eq.barcode);
  
  showOmniModal('طباعة ملصق الباركود', `
    <div style="background:white; color:#111; padding:25px; border-radius:12px; text-align:center; direction:rtl;" id="equipmentBarcodeModalContent">
      <div style="display:inline-block; border:2px dashed #999; padding:15px; border-radius:8px; background:#fff; width:270px; font-family:'Courier New', monospace; box-shadow:0 4px 6px rgba(0,0,0,0.05);">
        <div style="font-size:11px; font-weight:bold; border-bottom:2px solid #000; padding-bottom:5px; margin-bottom:10px; text-transform:uppercase;">
          ⚙️ OCTAGON WORKSHOP
        </div>
        <div style="text-align:right; font-size:12px; margin-bottom:5px;">
          <b>الأداة:</b> <span style="font-family:Arial; font-size:13px;">${escapeHtml(eq.name)}</span>
        </div>
        <div style="text-align:right; font-size:12px; margin-bottom:5px;">
          <b>الموقع:</b> <span style="font-family:Arial;">${escapeHtml(eq.location)}</span>
        </div>
        <div style="text-align:right; font-size:12px; margin-bottom:10px;">
          <b>التصنيف:</b> <span style="font-family:Arial;">${escapeHtml(eq.category)}</span>
        </div>
        <div style="margin:10px 0;">
          ${barcodeSvg}
        </div>
        <div style="font-size:9px; color:#555; margin-top:5px;">
          OCTAGON ASSET MANAGEMENT SYSTEM
        </div>
      </div>
      <div style="display:flex; gap:10px; justify-content:center; margin-top:14px; direction:rtl;">
        <button class="btn-primary" onclick="window.printEquipmentBarcodeNow('${eq.id}')"><i class="fa-solid fa-print"></i> طباعة الآن</button>
        <button class="btn-secondary" onclick="navigator.clipboard?.writeText('${jsString(eq.barcode)}'); showToast('تم نسخ الباركود', 'success')"><i class="fa-solid fa-copy"></i> نسخ الكود</button>
      </div>
    </div>
  `, () => {
    printEquipmentBarcodeNow(eqId);
  });
  
  const confirmBtn = document.getElementById('omniModalConfirm');
  if (confirmBtn) {
    confirmBtn.innerHTML = '<i class="fa-solid fa-print"></i> طباعة الملصق';
  }
}

function copyEquipmentBarcode(eqId) {
  ensureOmni();
  normalizeEquipment();
  const eq = (omni.equipment || []).find(e => e.id === eqId);
  if (!eq) return showToast('فشل: لم يتم العثور على المعدة', 'error');
  const value = eq.barcode || '';
  if (!value) return showToast('لا يوجد باركود للنسخ', 'warning');

  const done = () => showToast(`تم نسخ الباركود: ${value}`, 'success');
  const fallbackCopy = () => {
    const input = document.createElement('input');
    input.value = value;
    input.setAttribute('readonly', 'readonly');
    input.style.cssText = 'position:fixed; left:-9999px; top:0;';
    document.body.appendChild(input);
    input.select();
    try {
      document.execCommand('copy');
      done();
    } catch (e) {
      showToast(value, 'info');
    } finally {
      try { document.body.removeChild(input); } catch (_) {}
    }
  };

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(value).then(done).catch(fallbackCopy);
  } else {
    fallbackCopy();
  }
}

function showDispatchModal(eqId = null) {
  ensureOmni();
  if (eqId && !equipmentDispatchCart.includes(eqId)) {
    const eq = (omni.equipment || []).find(item => item.id === eqId);
    if (eq && eq.status === 'operational') {
      equipmentDispatchCart.push(eqId);
    } else if (eq) {
      showToast(`[${eq.name}] ليست جاهزة للإخراج. الحالة الحالية: ${equipmentStatusMeta(eq.status).label}`, 'warning');
    }
  }
  equipmentActiveTab = 'active_dispatches';
  renderEquipmentPage();
  showToast('تم نقل العملية إلى تبويب العهد الخارجية حتى يتم المسح والحفظ من مكان واحد.', 'info');
  setTimeout(focusEquipmentDispatchScanner, 0);
  return;
  
  const operationalTools = omni.equipment.filter(e => e.status === 'operational');
  if (operationalTools.length === 0 && !eqId) {
    return showToast('تنبيه: لا توجد أي معدات صالحة وجاهزة للترحيل حالياً', 'warning');
  }
  
  const selectedTool = eqId ? omni.equipment.find(e => e.id === eqId) : null;
  if (selectedTool && selectedTool.status !== 'operational' && selectedTool.status !== 'dispatched') {
    return showToast('تنبيه: لا يمكن ترحيل المعدة المحددة لأنها خارج الخدمة أو قيد الصيانة', 'warning');
  }
  
  const employeesList = window.employees || [];
  const empOptions = employeesList.map(emp => `<option value="${escapeHtml(emp.name)}">${escapeHtml(emp.name)}</option>`).join('');
  
  const toolOptions = operationalTools.map(t => `<option value="${t.id}" ${eqId === t.id ? 'selected' : ''}>${escapeHtml(t.name)} (${escapeHtml(t.barcode)})</option>`).join('');
  
  showOmniModal('ترحيل معدة للعمل الخارجي', `
    <div style="display:flex; flex-direction:column; gap:12px; direction:rtl; text-align:right;">
      <p style="font-size:12.5px; color:var(--text-muted);">سجل ترحيل أداة أو عهدة لموظف للعمل في موقع خارجي:</p>
      
      <label class="field">
        <span>المعدة / الأداة المطلوبة</span>
        ${selectedTool ? `
          <div style="background:rgba(255,255,255,0.05); padding:8px; border-radius:6px; border:1px solid rgba(255,255,255,0.08); font-weight:bold;">
            ${escapeHtml(selectedTool.name)} (${escapeHtml(selectedTool.barcode)})
            <input type="hidden" id="dispatchToolId" value="${selectedTool.id}">
          </div>
        ` : `
          <select id="dispatchToolId" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
            ${toolOptions}
          </select>
        `}
      </label>
      
      <label class="field">
        <span>الموظف المستلم للعهدة</span>
        <select id="dispatchEmployeeName" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
          ${empOptions || '<option value="غير محدد">لا يوجد موظفين مسجلين</option>'}
        </select>
      </label>
      
      <label class="field">
        <span>جهة العمل الخارجي / الموقع</span>
        <input type="text" id="dispatchJobSite" placeholder="مثال: موقع البصرة الرياضي، جامعة البصرة..." class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
      </label>
      
      <label class="field">
        <span>تاريخ الإرجاع المتوقع</span>
        <input type="date" id="dispatchExpectedReturnDate" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;" value="${new Date(Date.now() + 86400000).toISOString().slice(0, 10)}">
      </label>
    </div>
  `, () => {
    const toolId = document.getElementById('dispatchToolId')?.value;
    const employee = document.getElementById('dispatchEmployeeName')?.value;
    const jobSite = document.getElementById('dispatchJobSite')?.value.trim();
    const expReturn = document.getElementById('dispatchExpectedReturnDate')?.value;
    
    if (!toolId || !employee || !jobSite) {
      showToast('خطأ: يرجى استكمال تعبئة جميع الحقول قبل الحفظ', 'error');
      return;
    }
    
    const eq = omni.equipment.find(e => e.id === toolId);
    if (!eq) return;
    
    eq.status = 'dispatched';
    syncEquipmentNumericQR(eq);
    
    omni.equipmentDispatches = omni.equipmentDispatches || [];
    omni.equipmentDispatches.push({
      id: makeId('disp'),
      equipmentId: eq.id,
      equipmentName: eq.name,
      equipmentBarcode: eq.barcode,
      employeeName: employee,
      jobSite: jobSite,
      checkoutDate: new Date().toISOString().slice(0, 10),
      expectedReturnDate: expReturn,
      actualReturnDate: null,
      status: 'dispatched',
      conditionOnReturn: null
    });
    
    saveData();
    showToast(`تم ترحيل [${eq.name}] بنجاح إلى الموظف [${employee}]`, 'success');
    renderEquipmentPage();
  });
}

function returnEquipment(dispatchId) {
  ensureOmni();
  
  const disp = omni.equipmentDispatches.find(d => d.id === dispatchId);
  if (!disp) return;
  
  const eq = omni.equipment.find(e => e.id === disp.equipmentId);
  
  showOmniModal('تسجيل إرجاع معدة للورشة', `
    <div style="display:flex; flex-direction:column; gap:12px; direction:rtl; text-align:right;">
      <p style="font-size:12.5px; color:var(--text-muted);">
        إرجاع الأداة <strong>${escapeHtml(disp.equipmentName)}</strong> المستلمة بواسطة <strong>${escapeHtml(disp.employeeName)}</strong>:
      </p>
      
      <label class="field">
        <span>حالة الأداة عند الإرجاع</span>
        <select id="returnStateSelect" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
          <option value="operational">صالحة للعمل ومستقرة</option>
          <option value="maintenance">بحاجة لصيانة خفيفة</option>
          <option value="broken">تالفة وبحاجة إصلاح فوري</option>
        </select>
      </label>
      
      <label class="field">
        <span>ملاحظات الإرجاع</span>
        <textarea id="returnNotesText" rows="3" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px; resize:none;" placeholder="مثال: عادت بحالة ممتازة..."></textarea>
      </label>
    </div>
  `, () => {
    const condition = document.getElementById('returnStateSelect')?.value;
    const notes = document.getElementById('returnNotesText')?.value.trim();
    
    disp.actualReturnDate = new Date().toISOString().slice(0, 10);
    disp.status = 'returned';
    disp.conditionOnReturn = condition;
    if (notes) disp.returnNotes = notes;
    
    if (eq) {
      eq.status = condition;
      eq.notes = notes || eq.notes;
      eq.lastAuditDate = new Date().toISOString().slice(0, 10);
      eq.lastAuditStatus = condition;
      syncEquipmentNumericQR(eq);
    }
    
    omni.equipmentAuditLogs = omni.equipmentAuditLogs || [];
    omni.equipmentAuditLogs.push({
      date: new Date().toISOString().slice(0, 10),
      equipmentId: disp.equipmentId,
      equipmentName: disp.equipmentName,
      inspector: window.PentagonAuth?.getCurrentUser?.()?.name || 'المشرف',
      status: condition,
      notes: `إرجاع من ترحيل خارجي (${disp.employeeName}). ملاحظات: ${notes || 'لا يوجد'}`
    });
    
    saveData();
    showToast(`تم إرجاع [${disp.equipmentName}] وتسجيل حالتها بالورشة بنجاح`, 'success');
    renderEquipmentPage();
  });
}

function showEquipmentAuditModal(eqId) {
  const eq = omni.equipment.find(e => e.id === eqId);
  if (!eq) return;
  
  showOmniModal('تسجيل فحص دوري للمعدة', `
    <div style="display:flex; flex-direction:column; gap:12px; direction:rtl; text-align:right;">
      <p style="font-size:12.5px; color:var(--text-muted);">الأداة: <strong>${escapeHtml(eq.name)}</strong> (${escapeHtml(eq.barcode)})</p>
      
      <label class="field">
        <span>حالة الفحص الحالية</span>
        <select id="auditStateSelect" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
          <option value="operational" ${eq.status === 'operational' ? 'selected' : ''}>صالحة للعمل (Operational)</option>
          <option value="maintenance" ${eq.status === 'maintenance' ? 'selected' : ''}>تحت الصيانة (Maintenance)</option>
          <option value="broken" ${eq.status === 'broken' ? 'selected' : ''}>تالفة / عاطلة (Broken)</option>
        </select>
      </label>
      
      <label class="field">
        <span>ملاحظات الفحص والتدقيق</span>
        <textarea id="auditNotesText" rows="3" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px; resize:none;" placeholder="مثال: تم شحذ الشفرة وتأمين الكابل الكهربائي..."></textarea>
      </label>
    </div>
  `, () => {
    const status = document.getElementById('auditStateSelect')?.value;
    const notes = document.getElementById('auditNotesText')?.value.trim() || 'لا توجد ملاحظات إضافية';
    
    eq.status = status;
    eq.lastAuditDate = new Date().toISOString().slice(0, 10);
    eq.lastAuditStatus = status;
    if (notes) eq.notes = notes;
    syncEquipmentNumericQR(eq);
    
    omni.equipmentAuditLogs = omni.equipmentAuditLogs || [];
    omni.equipmentAuditLogs.push({
      date: new Date().toISOString().slice(0, 10),
      equipmentId: eq.id,
      equipmentName: eq.name,
      inspector: window.PentagonAuth?.getCurrentUser?.()?.name || 'المشرف',
      status: status,
      notes: notes
    });
    
    saveData();
    showToast(`تم تسجيل الفحص بنجاح للأداة: ${eq.name}`, 'success');
    renderEquipmentPage();
  });
}

function quickAuditItem(eqId, status) {
  ensureOmni();
  const eq = omni.equipment.find(e => e.id === eqId);
  if (!eq) return;
  
  eq.status = status;
  eq.lastAuditDate = new Date().toISOString().slice(0, 10);
  eq.lastAuditStatus = status;
  syncEquipmentNumericQR(eq);
  
  omni.equipmentAuditLogs = omni.equipmentAuditLogs || [];
  omni.equipmentAuditLogs.push({
    date: new Date().toISOString().slice(0, 10),
    equipmentId: eq.id,
    equipmentName: eq.name,
    inspector: window.PentagonAuth?.getCurrentUser?.()?.name || 'المشرف',
    status: status,
    notes: `تدقيق سريع فوري: ${equipmentStatusMeta(status).label}`
  });
  
  saveData();
  try { autoGenerateMaintenanceTasks(); } catch (_) {}
  showToast(`تم تحديث حالة [${eq.name}] إلى [${equipmentStatusMeta(status).label}] بنجاح`, 'success');
  renderEquipmentPage();
}

function runMonthlyEquipmentAudit() {
  ensureOmni();
  
  function renderAuditModalContent() {
    const today = new Date();
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    
    const pendingTools = omni.equipment.filter(e => {
      if (!e.lastAuditDate) return true;
      const d = new Date(e.lastAuditDate);
      return d.getMonth() !== thisMonth || d.getFullYear() !== thisYear;
    });
    
    let html = `
      <div style="direction:rtl; font-family:inherit;">
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:15px;">
          الرجاء فحص وتدقيق حالة المعدات والأدوات المدرجة أدناه لتأكيد سلامتها للعمل هذا الشهر. 
          المعدات المتبقية التي تحتاج تدقيق: <strong>${pendingTools.length}</strong> من أصل <strong>${omni.equipment.length}</strong>.
        </p>
        
        ${pendingTools.length > 0 ? `
          <div style="display:flex; justify-content:flex-end; margin-bottom:12px;">
            <button class="btn-primary" style="background:rgba(16,185,129,0.2); color:#10b981; border:1px solid rgba(16,185,129,0.3); font-size:12px;" onclick="window.auditAllEquipmentAsOperational()">
              ✓ تدقيق الكل كـ "صالحة" دفعة واحدة
            </button>
          </div>
          <div style="max-height:400px; overflow-y:auto; border:1px solid rgba(255,255,255,0.08); border-radius:8px; background:rgba(0,0,0,0.15);">
            <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
              <thead>
                <tr style="background:rgba(255,255,255,0.03); border-bottom:1px solid rgba(255,255,255,0.08);">
                  <th style="padding:10px; text-align:right;">المعدة / الأداة</th>
                  <th style="padding:10px; text-align:right;">الموقع</th>
                  <th style="padding:10px; text-align:right;">آخر فحص</th>
                  <th style="padding:10px; text-align:center; width:180px;">القرار</th>
                </tr>
              </thead>
              <tbody>
                ${pendingTools.map(t => `
                  <tr style="border-bottom:1px solid rgba(255,255,255,0.05);">
                    <td style="padding:10px;"><b>${escapeHtml(t.name)}</b><br><small style="color:var(--text-muted);">${escapeHtml(t.barcode)}</small></td>
                    <td style="padding:10px;">${escapeHtml(t.location)}</td>
                    <td style="padding:10px; color:var(--text-muted);">${t.lastAuditDate || 'لم تفحص سابقاً'}</td>
                    <td style="padding:10px; text-align:center; display:flex; gap:5px; justify-content:center; align-items:center;">
                      <button class="btn-primary" style="padding:4px 8px; font-size:11px; background:#10b981; color:#fff;" onclick="window.auditEquipmentInline('${t.id}', 'operational')">صالحة ✓</button>
                      <button class="btn-secondary" style="padding:4px 8px; font-size:11px; background:#f59e0b; color:#fff; border:none;" onclick="window.auditEquipmentInline('${t.id}', 'maintenance')">صيانة 🔧</button>
                      <button class="btn-danger" style="padding:4px 8px; font-size:11px; background:#ef4444; color:#fff;" onclick="window.auditEquipmentInline('${t.id}', 'broken')">تالفة ⚠</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        ` : `
          <div style="text-align:center; padding:30px; background:rgba(16,185,129,0.05); border:1px dashed rgba(16,185,129,0.2); border-radius:8px;">
            <i class="fa-solid fa-circle-check" style="font-size:40px; color:#10b981; margin-bottom:10px;"></i>
            <h4 style="color:#10b981; margin:0 0 5px 0;">تهانينا! جميع المعدات مدققة بالكامل</h4>
            <p style="font-size:12px; color:var(--text-muted); margin:0;">لقد قمت بإجراء التدقيق الدوري لجميع معدات الورشة لهذا الشهر بنجاح.</p>
          </div>
        `}
      </div>
    `;
    return html;
  }
  
  showOmniModal('لوحة التدقيق السريع لمعدات الورشة', renderAuditModalContent(), null, false);
  
  window.auditEquipmentInline = function(eqId, status) {
    const eq = omni.equipment.find(e => e.id === eqId);
    if (!eq) return;
    
    eq.status = status;
    eq.lastAuditDate = new Date().toISOString().slice(0, 10);
    eq.lastAuditStatus = status;
    syncEquipmentNumericQR(eq);
    
    omni.equipmentAuditLogs = omni.equipmentAuditLogs || [];
    omni.equipmentAuditLogs.push({
      date: new Date().toISOString().slice(0, 10),
      equipmentId: eq.id,
      equipmentName: eq.name,
      inspector: window.PentagonAuth?.getCurrentUser?.()?.name || 'المشرف',
      status: status,
      notes: status === 'operational' ? 'فحص دوري شهري: صالحة' : `فحص دوري شهري: تم تحديث الحالة إلى ${status}`
    });
    
    saveData();
    showToast(`تم تسجيل فحص المعدة [${eq.name}] بنجاح`, 'success');
    
    const modalBody = document.getElementById('omniModalBody');
    if (modalBody) {
      modalBody.innerHTML = renderAuditModalContent();
    }
    renderEquipmentPage();
  };
  
  window.auditAllEquipmentAsOperational = function() {
    const today = new Date();
    const thisMonth = today.getMonth();
    const thisYear = today.getFullYear();
    const pendingTools = omni.equipment.filter(e => {
      if (!e.lastAuditDate) return true;
      const d = new Date(e.lastAuditDate);
      return d.getMonth() !== thisMonth || d.getFullYear() !== thisYear;
    });
    
    pendingTools.forEach(eq => {
      eq.status = 'operational';
      eq.lastAuditDate = today.toISOString().slice(0, 10);
      eq.lastAuditStatus = 'operational';
      syncEquipmentNumericQR(eq);
      
      omni.equipmentAuditLogs.push({
        date: today.toISOString().slice(0, 10),
        equipmentId: eq.id,
        equipmentName: eq.name,
        inspector: window.PentagonAuth?.getCurrentUser?.()?.name || 'المشرف',
        status: 'operational',
        notes: 'تدقيق سريع جماعي: صالحة للعمل'
      });
    });
    
    saveData();
    showToast(`تم اعتماد وتدقيق ${pendingTools.length} معدة كصالحة للعمل بنجاح`, 'success');
    
    const modalBody = document.getElementById('omniModalBody');
    if (modalBody) {
      modalBody.innerHTML = renderAuditModalContent();
    }
    renderEquipmentPage();
  };
  
  const confirmBtn = document.getElementById('omniModalConfirm');
  const cancelBtn = document.getElementById('omniModalCancel');
  if (confirmBtn) confirmBtn.style.display = 'none';
  if (cancelBtn) cancelBtn.innerHTML = 'إغلاق نافذة التدقيق';
}

function showAddEquipmentModal() {
  ensureOmni();
  
  showOmniModal('إضافة معدة جديدة للورشة', `
    <div style="display:flex; flex-direction:column; gap:12px; direction:rtl; text-align:right;">
      <label class="field">
        <span>اسم المعدة / الأداة *</span>
        <input type="text" id="addEqName" placeholder="مثال: منشار خشب يدوي Bosch" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
      </label>
      
      <label class="field">
        <span>موقع التواجد (الغرفة / القسم) *</span>
        <select id="addEqLocation" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
          <option value="ساحة الورشة">ساحة الورشة</option>
          <option value="الادارة">الادارة</option>
          <option value="المطبخ">المطبخ</option>
          <option value="غرفة الطابعات">غرفة الطابعات</option>
          <option value="غرفة لصق وتجليد">غرفة لصق وتجليد</option>
          <option value="المكتب">المكتب</option>
          <option value="المستودع">المستودع</option>
        </select>
      </label>
      
      <label class="field">
        <span>التصنيف *</span>
        <select id="addEqCategory" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
          <option value="أدوات يدوية">أدوات يدوية</option>
          <option value="أدوات كهربائية">أدوات كهربائية</option>
          <option value="أدوات هوائية">أدوات هوائية</option>
          <option value="أدوات قياس">أدوات قياس</option>
          <option value="كوابس">كوابس</option>
          <option value="أجهزة مكتبية">أجهزة مكتبية</option>
          <option value="أجهزة كهربائية">أجهزة كهربائية</option>
          <option value="طابعات ومكائن">طابعات ومكائن</option>
          <option value="كوابس حرارية">كوابس حرارية</option>
          <option value="أخرى">أخرى</option>
        </select>
      </label>
      
      <label class="field">
        <span>عدد القطع المنفصلة</span>
        <input type="number" id="addEqQuantity" value="1" min="1" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
        <small style="color:var(--text-muted);">سيتم إنشاء سجل وباركود مستقل لكل قطعة.</small>
      </label>
      
      <label class="field">
        <span>ملاحظات</span>
        <textarea id="addEqNotes" rows="2" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px; resize:none;" placeholder="أي تفاصيل أو نواقص..."></textarea>
      </label>
    </div>
  `, () => {
    const name = document.getElementById('addEqName')?.value.trim();
    const location = document.getElementById('addEqLocation')?.value;
    const category = document.getElementById('addEqCategory')?.value;
    const quantity = Math.max(1, parseInt(document.getElementById('addEqQuantity')?.value || 1, 10) || 1);
    const notes = document.getElementById('addEqNotes')?.value.trim();
    
    if (!name) {
      showToast('خطأ: يرجى تعبئة اسم المعدة', 'error');
      return;
    }
    
    const createdBarcodes = [];
    for (let index = 0; index < quantity; index += 1) {
      const barcode = generateEquipmentBarcode(location);
      createdBarcodes.push(barcode);
      omni.equipment.push({
        id: makeId('eq'),
        name,
        barcode,
        category,
        location,
        status: 'operational',
        quantity: 1,
        lastAuditDate: new Date().toISOString().slice(0, 10),
        lastAuditStatus: 'operational',
        notes: notes || 'سليم'
      });
    }
    
    saveData();
    showToast(`تمت إضافة ${quantity} قطعة منفصلة من [${name}] بباركود مستقل لكل قطعة`, 'success');
    renderEquipmentPage();
  });
}

function showEditEquipmentModal(eqId) {
  ensureOmni();
  
  const eq = omni.equipment.find(e => e.id === eqId);
  if (!eq) return;
  
  showOmniModal('تعديل بيانات المعدة', `
    <div style="display:flex; flex-direction:column; gap:12px; direction:rtl; text-align:right;">
      <label class="field">
        <span>اسم المعدة / الأداة *</span>
        <input type="text" id="editEqName" value="${escapeHtml(eq.name)}" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
      </label>
      
      <label class="field">
        <span>الباركود المعرّف</span>
        <input type="text" id="editEqBarcode" value="${escapeHtml(eq.barcode)}" class="form-input" style="width:100%; background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1); color:var(--text-muted); padding:8px; border-radius:6px;" readonly>
      </label>
      
      <label class="field">
        <span>موقع التواجد (الغرفة / القسم) *</span>
        <select id="editEqLocation" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
          <option value="ساحة الورشة" ${eq.location === 'ساحة الورشة' ? 'selected' : ''}>ساحة الورشة</option>
          <option value="الادارة" ${eq.location === 'الادارة' ? 'selected' : ''}>الادارة</option>
          <option value="المطبخ" ${eq.location === 'المطبخ' ? 'selected' : ''}>المطبخ</option>
          <option value="غرفة الطابعات" ${eq.location === 'غرفة الطابعات' ? 'selected' : ''}>غرفة الطابعات</option>
          <option value="غرفة لصق وتجليد" ${eq.location === 'غرفة لصق وتجليد' ? 'selected' : ''}>غرفة لصق وتجليد</option>
          <option value="المكتب" ${eq.location === 'المكتب' ? 'selected' : ''}>المكتب</option>
          <option value="المستودع" ${eq.location === 'المستودع' ? 'selected' : ''}>المستودع</option>
        </select>
      </label>
      
      <label class="field">
        <span>التصنيف *</span>
        <select id="editEqCategory" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
          <option value="أدوات يدوية" ${eq.category === 'أدوات يدوية' ? 'selected' : ''}>أدوات يدوية</option>
          <option value="أدوات كهربائية" ${eq.category === 'أدوات كهربائية' ? 'selected' : ''}>أدوات كهربائية</option>
          <option value="أدوات هوائية" ${eq.category === 'أدوات هوائية' ? 'selected' : ''}>أدوات هوائية</option>
          <option value="أدوات قياس" ${eq.category === 'أدوات قياس' ? 'selected' : ''}>أدوات قياس</option>
          <option value="كوابس" ${eq.category === 'كوابس' ? 'selected' : ''}>كوابس</option>
          <option value="أجهزة مكتبية" ${eq.category === 'أجهزة مكتبية' ? 'selected' : ''}>أجهزة مكتبية</option>
          <option value="أجهزة كهربائية" ${eq.category === 'أجهزة كهربائية' ? 'selected' : ''}>أجهزة كهربائية</option>
          <option value="طابعات ومكائن" ${eq.category === 'طابعات ومكائن' ? 'selected' : ''}>طابعات ومكائن</option>
          <option value="كوابس حرارية" ${eq.category === 'كوابس حرارية' ? 'selected' : ''}>كوابس حرارية</option>
        </select>
      </label>
      
      <label class="field">
        <span>الحالة</span>
        <select id="editEqStatus" class="form-input" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px;">
          <option value="operational" ${eq.status === 'operational' ? 'selected' : ''}>صالحة للعمل</option>
          <option value="maintenance" ${eq.status === 'maintenance' ? 'selected' : ''}>تحت الصيانة</option>
          <option value="broken" ${eq.status === 'broken' ? 'selected' : ''}>عاطلة / تالفة</option>
          <option value="dispatched" ${eq.status === 'dispatched' ? 'selected' : ''} disabled>مرحلة خارجياً</option>
        </select>
      </label>
      
      <div style="padding:10px 12px; border-radius:8px; background:rgba(6,182,212,0.08); border:1px solid rgba(6,182,212,0.18); color:#bae6fd; font-size:12px;">
        هذه القطعة مسجلة كسجل منفصل بباركود مستقل. لإضافة قطعة مشابهة استخدم زر إضافة معدة وحدد عدد القطع.
      </div>
      
      <label class="field">
        <span>ملاحظات</span>
        <textarea id="editEqNotes" rows="2" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:8px; border-radius:6px; resize:none;">${escapeHtml(eq.notes || '')}</textarea>
      </label>
    </div>
  `, () => {
    const name = document.getElementById('editEqName')?.value.trim();
    const location = document.getElementById('editEqLocation')?.value;
    const category = document.getElementById('editEqCategory')?.value;
    const status = document.getElementById('editEqStatus')?.value;
    const notes = document.getElementById('editEqNotes')?.value.trim();
    
    if (!name) {
      showToast('خطأ: يرجى تعبئة اسم المعدة', 'error');
      return;
    }
    
    eq.name = name;
    eq.location = location;
    eq.category = category;
    eq.status = status;
    eq.quantity = 1;
    eq.notes = notes;
    syncEquipmentNumericQR(eq);
    
    saveData();
    showToast(`تم تحديث بيانات المعدة [${name}] بنجاح`, 'success');
    renderEquipmentPage();
  });
}

function deleteEquipment(eqId) {
  ensureOmni();
  const eq = omni.equipment.find(e => e.id === eqId);
  if (!eq) return;
  
  if (eq.status === 'dispatched') {
    return showToast('تنبيه: لا يمكن حذف هذه الأداة لأنها مرحلة حالياً لمهمة خارجية. يرجى إرجاعها أولاً.', 'warning');
  }
  
  showConfirmModal('حذف معدة نهائياً', `هل أنت متأكد من رغبتك في حذف المعدة <strong>${escapeHtml(eq.name)}</strong> (${escapeHtml(eq.barcode)}) بالكامل من السجلات؟ لا يمكن التراجع عن هذا الإجراء.`, () => {
    omni.equipment = omni.equipment.filter(e => e.id !== eqId);
    saveData();
    showToast(`تم حذف المعدة بنجاح`, 'success');
    renderEquipmentPage();
  });
}

window.switchEquipmentTab = switchEquipmentTab;
window.updateEquipmentSearch = updateEquipmentSearch;
window.updateEquipmentLocFilter = updateEquipmentLocFilter;
window.updateEquipmentCatFilter = updateEquipmentCatFilter;
window.updateEquipmentStatusFilter = updateEquipmentStatusFilter;
window.clearEquipmentFilters = clearEquipmentFilters;
window.updateEquipmentStatusInline = updateEquipmentStatusInline;
window.printEquipmentBarcode = printEquipmentBarcode;
window.previewEquipmentBarcode = previewEquipmentBarcode;
window.printEquipmentBarcodeNow = printEquipmentBarcodeNow;
window.copyEquipmentBarcode = copyEquipmentBarcode;
window.showDispatchModal = showDispatchModal;
window.handleEquipmentDispatchScanKey = handleEquipmentDispatchScanKey;
window.handleEquipmentDispatchScanInput = handleEquipmentDispatchScanInput;
window.addEquipmentDispatchScan = addEquipmentDispatchScan;
window.removeEquipmentDispatchCartItem = removeEquipmentDispatchCartItem;
window.clearEquipmentDispatchCart = clearEquipmentDispatchCart;
window.commitEquipmentDispatchCart = commitEquipmentDispatchCart;
window.returnEquipment = returnEquipment;
window.showEquipmentAuditModal = showEquipmentAuditModal;
window.quickAuditItem = quickAuditItem;
window.runMonthlyEquipmentAudit = runMonthlyEquipmentAudit;
window.showAddEquipmentModal = showAddEquipmentModal;
window.showEditEquipmentModal = showEditEquipmentModal;
window.deleteEquipment = deleteEquipment;
window.defaultEquipment = defaultEquipment;
window.normalizeEquipment = normalizeEquipment;
window.renderEquipmentPage = renderEquipmentPage;
