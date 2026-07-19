/**
 * OCTAGON ERP — Real Estate Vertical (Phase 5).
 * Complete real estate module on shared engines:
 *  - Property Registry: type (apartment, villa, land, office), purpose (rent/sale), status (available/rented/sold/maintenance), rent/sale price, size, location.
 *  - Owners & Clients registries.
 *  - Contracts (Leases & Sales): property, client, start/end dates, amount, cycle, deposit.
 *  - Maintenance Tracker: property, issue description, cost, status.
 *  - Billing / Payments: generate contract invoices, process payments via shared ledger.
 *  - Jarvis tool: report_realestate_today.
 */
(function () {
  'use strict';

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
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function userName() {
    try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {}
    return 'مدير العقارات';
  }

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.realEstate || typeof o.realEstate !== 'object') o.realEstate = {};
    const re = o.realEstate;
    if (!Array.isArray(re.properties)) re.properties = [];
    if (!Array.isArray(re.contracts)) re.contracts = [];
    if (!Array.isArray(re.maintenance)) re.maintenance = [];
    if (!Array.isArray(re.invoices)) re.invoices = [];
    return re;
  }
  function RE() { return ensureData(); }

  function getProperties() {
    const list = RE()?.properties || [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function getContracts() {
    const list = RE()?.contracts || [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function getMaintenance() {
    const list = RE()?.maintenance || [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function getInvoices() {
    const list = RE()?.invoices || [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }

  const STATUS_LABEL = { available: 'متاح', rented: 'مؤجر', sold: 'مباع', maintenance: 'صيانة' };
  const STATUS_CLASS = { available: 're-status-avail', rented: 're-status-rented', sold: 're-status-sold', maintenance: 're-status-maint' };

  let activeTab = 'dashboard';
  let editingPropertyId = null;
  let editingContractId = null;
  let propSearch = '';

  window.reOpenTab = function (tab) {
    activeTab = tab;
    document.querySelectorAll('.re-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderTabContent();
  };

  /* ─────────────── Property Actions ─────────────── */
  window.reOpenPropertyForm = function (id) { editingPropertyId = id || null; activeTab = 'properties'; renderRealEstate(); };
  window.reSaveProperty = function () {
    const re = RE(); if (!re) return;
    const name = val('rePropName');
    if (!name) { toast('اسم العقار مطلوب', 'warning'); return; }
    const base = {
      name, type: val('rePropType'), purpose: val('rePropPurpose'),
      status: val('rePropStatus') || 'available', price: numVal('rePropPrice'),
      location: val('rePropLocation'), specs: val('rePropSpecs'), notes: val('rePropNotes')
    };
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    if (editingPropertyId) {
      const p = re.properties.find(x => x.id === editingPropertyId);
      if (p) Object.assign(p, base);
      toast('تم تحديث العقار', 'success');
    } else {
      re.properties.push({ id: uid('rep'), ...base, companyId: coId, createdAt: new Date().toISOString() });
      toast('تم تسجيل العقار: ' + name, 'success');
    }
    editingPropertyId = null; save(); renderRealEstate();
  };
  window.reCancelPropertyForm = function () { editingPropertyId = null; renderRealEstate(); };

  /* ─────────────── Contract Actions ─────────────── */
  window.reOpenContractForm = function (id) { editingContractId = id || null; activeTab = 'contracts'; renderRealEstate(); };
  window.reSaveContract = function () {
    const re = RE(); if (!re) return;
    const propertyId = val('reContProperty');
    const client = val('reContClient');
    const amount = numVal('reContAmount');
    if (!propertyId || !client || !amount) { toast('يرجى ملء الحقول المطلوبة', 'warning'); return; }
    const prop = re.properties.find(p => p.id === propertyId);
    if (!prop) return;

    const base = {
      propertyId, propertyName: prop.name, client, amount,
      type: prop.purpose, startDate: val('reContStart'), endDate: val('reContEnd'),
      deposit: numVal('reContDeposit'), status: 'active'
    };

    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    if (editingContractId) {
      const c = re.contracts.find(x => x.id === editingContractId);
      if (c) Object.assign(c, base);
      toast('تم تحديث العقد', 'success');
    } else {
      const contId = uid('rec');
      const ref = 'CNT-' + Date.now().toString().slice(-6).toUpperCase();
      re.contracts.push({ id: contId, ref, ...base, companyId: coId, createdAt: new Date().toISOString() });
      
      // Update property status
      prop.status = prop.purpose === 'sale' ? 'sold' : 'rented';

      // Auto-create initial invoice
      const invId = uid('rei');
      re.invoices.push({
        id: invId, contractId: contId, ref: 'INV-' + ref,
        client, propertyName: prop.name, amount: amount + base.deposit,
        status: 'unpaid', companyId: coId, createdAt: new Date().toISOString()
      });
      toast('تم إنشاء العقد وفاتورة الدفعة الأولى', 'success');
    }
    editingContractId = null; save(); renderRealEstate();
  };
  window.reCancelContractForm = function () { editingContractId = null; renderRealEstate(); };
  window.reTerminateContract = function (id) {
    const re = RE(); if (!re) return;
    const c = re.contracts.find(x => x.id === id);
    if (!c) return;
    c.status = 'terminated';
    const prop = re.properties.find(p => p.id === c.propertyId);
    if (prop) prop.status = 'available';
    toast('تم إنهاء العقد وإتاحة العقار', 'info');
    save(); renderRealEstate();
  };

  /* ─────────────── Maintenance Actions ─────────────── */
  window.reSaveMaintenance = function () {
    const re = RE(); if (!re) return;
    const propertyId = val('reMaintProperty');
    const desc = val('reMaintDesc');
    const cost = numVal('reMaintCost');
    if (!propertyId || !desc) { toast('العقار والوصف مطلوبان', 'warning'); return; }
    const prop = re.properties.find(p => p.id === propertyId);
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    re.maintenance.push({
      id: uid('rem'), propertyId, propertyName: prop ? prop.name : 'عقار غير معروف',
      desc, cost, status: val('reMaintStatus') || 'pending', companyId: coId, at: new Date().toISOString()
    });
    // If resolved, deduct maintenance cost from ledger
    if (val('reMaintStatus') === 'resolved' && cost > 0) {
      if (typeof window.addFinanceTransaction === 'function') {
        try {
          window.addFinanceTransaction({
            id: uid('retxn'), type: 'expense', amount: cost,
            category: 'صيانة عقارات', note: 'صيانة ' + (prop ? prop.name : '') + ': ' + desc,
            sourceType: 'property_maintenance', companyId: coId, at: new Date().toISOString(), by: userName()
          });
        } catch (_) {}
      }
    }
    toast('تم تسجيل طلب الصيانة', 'success');
    save(); renderRealEstate();
  };

  /* ─────────────── Invoice / Billing ─────────────── */
  window.rePayInvoice = function (invId) {
    const re = RE(); if (!re) return;
    const inv = re.invoices.find(i => i.id === invId);
    if (!inv || inv.status === 'paid') return;
    inv.status = 'paid'; inv.paidAt = new Date().toISOString();
    if (typeof window.addFinanceTransaction === 'function') {
      try {
        window.addFinanceTransaction({
          id: uid('retxn'), type: 'income', amount: inv.amount,
          category: 'إيرادات عقارية', note: inv.ref + ' — ' + inv.propertyName + ' / ' + inv.client,
          sourceType: 'realestate_invoice', sourceId: invId, companyId: inv.companyId || '', at: inv.paidAt, by: userName()
        });
      } catch (_) {}
    }
    toast('تم تسديد الفاتورة بنجاح', 'success');
    save(); renderRealEstate();
  };

  /* ─────────────── Demo Data ─────────────── */
  window.reLoadDemo = function () {
    const re = RE(); if (!re) return;
    if (re.properties.length) { toast('البيانات التجريبية موجودة بالفعل', 'info'); return; }
    re.properties.push(
      { id: uid('rep'), name: 'شقة فاخرة الجادرية', type: 'apartment', purpose: 'rent', status: 'available', price: 1200000, location: 'بغداد - الجادرية', specs: '3 غرف نوم، صالة، مطبخ مجهز', notes: 'إطلالة على النهر', createdAt: new Date().toISOString() },
      { id: uid('rep'), name: 'فيلا المنصور', type: 'villa', purpose: 'sale', status: 'available', price: 450000000, location: 'بغداد - المنصور', specs: 'مساحة 400م، طابقين، مسبح', notes: 'بناء حديث', createdAt: new Date().toISOString() },
      { id: uid('rep'), name: 'أرض زراعية الكوت', type: 'land', purpose: 'sale', status: 'available', price: 90000000, location: 'واسط - الكوت', specs: '5 دونم، على الشارع العام', notes: 'سند طابو صرف', createdAt: new Date().toISOString() },
      { id: uid('rep'), name: 'مكتب تجاري الكرادة', type: 'office', purpose: 'rent', status: 'available', price: 800000, location: 'بغداد - الكرادة', specs: 'مساحة 80م، طابق ثاني، تكييف مركز', notes: 'جاهز للاستخدام', createdAt: new Date().toISOString() }
    );
    toast('تم تحميل 4 عقارات تجريبية', 'success');
    save(); renderRealEstate();
  };

  /* ─────────────── Render Functions ─────────────── */
  function renderDashboard() {
    const el = document.getElementById('reDashBody'); if (!el) return;
    const props = getProperties();
    const activeContracts = getContracts().filter(c => c.status === 'active');
    const totalRev = getInvoices().filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
    const maintCost = getMaintenance().reduce((s, m) => s + m.cost, 0);
    const occupancyRate = props.length ? Math.round((props.filter(p => p.status === 'rented' || p.status === 'sold').length / props.length) * 100) : 0;

    el.innerHTML = `
      <div class="re-kpi-row">
        <div class="re-kpi"><div class="re-kpi-val">${props.length}</div><div class="re-kpi-lbl">إجمالي العقارات</div></div>
        <div class="re-kpi"><div class="re-kpi-val">${activeContracts.length}</div><div class="re-kpi-lbl">العقود النشطة</div></div>
        <div class="re-kpi"><div class="re-kpi-val">${occupancyRate}%</div><div class="re-kpi-lbl">نسبة الإشغال</div></div>
        <div class="re-kpi"><div class="re-kpi-val">${fmt(totalRev)} ${curSym()}</div><div class="re-kpi-lbl">إجمالي الإيرادات</div></div>
        <div class="re-kpi re-kpi-warn"><div class="re-kpi-val">${fmt(maintCost)} ${curSym()}</div><div class="re-kpi-lbl">تكلفة الصيانة</div></div>
      </div>
      <div class="re-toolbar">
        <button class="btn-primary" onclick="reLoadDemo()">تحميل بيانات تجريبية</button>
      </div>`;
  }

  function renderProperties() {
    const el = document.getElementById('rePropBody'); if (!el) return;
    const re = RE();
    if (editingPropertyId !== null) { renderPropertyForm(el, re); return; }
    const list = getProperties().filter(p => !propSearch || p.name.toLowerCase().includes(propSearch.toLowerCase()) || p.location.toLowerCase().includes(propSearch.toLowerCase()));
    el.innerHTML = `
      <div class="re-toolbar">
        <input class="re-search" placeholder="بحث بالاسم أو الموقع..." oninput="rePropSearch(this.value)" value="${esc(propSearch)}">
        <button class="btn-primary" onclick="reOpenPropertyForm(null)">+ عقار جديد</button>
      </div>
      <div class="re-prop-grid">
        ${list.map(p => `
          <div class="re-prop-card">
            <span class="re-status-badge ${STATUS_CLASS[p.status]}" style="position:absolute; left:14px; top:14px;">${STATUS_LABEL[p.status] || p.status}</span>
            <div class="re-prop-name">${esc(p.name)}</div>
            <div class="re-prop-details">📍 ${esc(p.location)} &nbsp;|&nbsp; 🏷️ ${p.purpose === 'rent' ? 'إيجار' : 'بيع'}</div>
            <div class="re-prop-specs">${esc(p.specs)}</div>
            <div style="font-weight:700; color:#6366f1; margin-bottom:12px;">${fmt(p.price)} ${curSym()}${p.purpose === 'rent' ? ' / شهرياً' : ''}</div>
            <div class="re-prop-actions">
              <button class="re-btn-sm btn-secondary" onclick="reOpenPropertyForm('${p.id}')">✏️ تعديل</button>
              ${p.status === 'available' ? `<button class="re-btn-sm btn-primary" onclick="reOpenContractForm(null)">✍️ إنشاء عقد</button>` : ''}
            </div>
          </div>
        `).join('') || '<div class="re-empty">لا يوجد عقارات مسجلة</div>'}
      </div>`;
  }

  function renderPropertyForm(el, re) {
    const p = editingPropertyId ? re.properties.find(x => x.id === editingPropertyId) : null;
    el.innerHTML = `
      <div class="re-form-card">
        <h3>${p ? 'تعديل عقار' : 'إضافة عقار جديد'}</h3>
        <div class="re-form-grid">
          <div class="re-field"><label>اسم العقار *</label><input id="rePropName" value="${esc(p ? p.name : '')}"></div>
          <div class="re-field"><label>النوع</label>
            <select id="rePropType">
              <option value="apartment" ${p && p.type === 'apartment' ? 'selected' : ''}>شقة</option>
              <option value="villa" ${p && p.type === 'villa' ? 'selected' : ''}>فيلا</option>
              <option value="office" ${p && p.type === 'office' ? 'selected' : ''}>مكتب</option>
              <option value="land" ${p && p.type === 'land' ? 'selected' : ''}>أرض</option>
            </select>
          </div>
          <div class="re-field"><label>الغرض</label>
            <select id="rePropPurpose">
              <option value="rent" ${p && p.purpose === 'rent' ? 'selected' : ''}>إيجار</option>
              <option value="sale" ${p && p.purpose === 'sale' ? 'selected' : ''}>بيع</option>
            </select>
          </div>
          <div class="re-field"><label>الحالة</label>
            <select id="rePropStatus">
              <option value="available" ${p && p.status === 'available' ? 'selected' : ''}>متاح</option>
              <option value="rented" ${p && p.status === 'rented' ? 'selected' : ''}>مؤجر</option>
              <option value="sold" ${p && p.status === 'sold' ? 'selected' : ''}>مباع</option>
              <option value="maintenance" ${p && p.status === 'maintenance' ? 'selected' : ''}>صيانة</option>
            </select>
          </div>
          <div class="re-field"><label>السعر *</label><input id="rePropPrice" type="number" value="${p ? p.price : ''}"></div>
          <div class="re-field"><label>الموقع *</label><input id="rePropLocation" value="${esc(p ? p.location : '')}"></div>
          <div class="re-field re-field-full"><label>المواصفات</label><input id="rePropSpecs" value="${esc(p ? p.specs : '')}" placeholder="غرف النوم، المساحة، إلخ"></div>
          <div class="re-field re-field-full"><label>ملاحظات</label><textarea id="rePropNotes" rows="2">${esc(p ? p.notes : '')}</textarea></div>
        </div>
        <div class="re-form-actions">
          <button class="btn-primary" onclick="reSaveProperty()">💾 حفظ</button>
          <button class="btn-secondary" onclick="reCancelPropertyForm()">إلغاء</button>
        </div>
      </div>`;
  }

  window.rePropSearch = function (v) { propSearch = v; renderProperties(); };

  function renderContracts() {
    const el = document.getElementById('reContBody'); if (!el) return;
    if (editingContractId !== null) { renderContractForm(el, RE()); return; }
    el.innerHTML = `
      <div class="re-toolbar">
        <button class="btn-primary" onclick="reOpenContractForm(null)">+ عقد جديد</button>
      </div>
      <table class="re-table">
        <thead><tr><th>رقم العقد</th><th>العقار</th><th>العميل</th><th>مبلغ العقد</th><th>النوع</th><th>تاريخ البدء</th><th>تاريخ الانتهاء</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>
          ${getContracts().map(c => `
            <tr>
              <td>${esc(c.ref)}</td><td>${esc(c.propertyName)}</td><td>${esc(c.client)}</td>
              <td>${fmt(c.amount)} ${curSym()}</td>
              <td>${c.type === 'rent' ? 'إيجار' : 'بيع'}</td>
              <td>${esc(c.startDate)}</td><td>${esc(c.endDate)}</td>
              <td><span class="re-status-badge ${c.status === 'active' ? 're-status-avail' : 're-status-sold'}">${c.status === 'active' ? 'نشط' : 'منتهي'}</span></td>
              <td>
                ${c.status === 'active' ? `<button class="re-btn-sm btn-ghost" onclick="reTerminateContract('${c.id}')">🛑 إنهاء</button>` : '—'}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="9" class="re-empty">لا يوجد عقود نشطة</td></tr>'}
        </tbody>
      </table>`;
  }

  function renderContractForm(el, re) {
    el.innerHTML = `
      <div class="re-form-card">
        <h3>إنشاء عقد جديد</h3>
        <div class="re-form-grid">
          <div class="re-field"><label>العقار المتاح *</label>
            <select id="reContProperty">
              <option value="">— اختر العقار —</option>
              ${getProperties().filter(p => p.status === 'available').map(p => `<option value="${p.id}">${esc(p.name)} [${p.purpose === 'rent' ? 'إيجار' : 'بيع'} - ${fmt(p.price)}]</option>`).join('')}
            </select>
          </div>
          <div class="re-field"><label>العميل *</label><input id="reContClient"></div>
          <div class="re-field"><label>مبلغ العقد *</label><input id="reContAmount" type="number"></div>
          <div class="re-field"><label>مبلغ التأمين (للإيجار)</label><input id="reContDeposit" type="number" value="0"></div>
          <div class="re-field"><label>تاريخ البدء</label><input id="reContStart" type="date" value="${new Date().toISOString().split('T')[0]}"></div>
          <div class="re-field"><label>تاريخ الانتهاء</label><input id="reContEnd" type="date"></div>
        </div>
        <div class="re-form-actions">
          <button class="btn-primary" onclick="reSaveContract()">💾 حفظ العقد</button>
          <button class="btn-secondary" onclick="reCancelContractForm()">إلغاء</button>
        </div>
      </div>`;
  }

  function renderMaintenance() {
    const el = document.getElementById('reMaintBody'); if (!el) return;
    el.innerHTML = `
      <div class="re-form-card" style="margin-bottom:20px;">
        <h3>طلب صيانة جديد</h3>
        <div class="re-form-grid">
          <div class="re-field"><label>العقار *</label>
            <select id="reMaintProperty">
              <option value="">— اختر العقار —</option>
              ${getProperties().map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}
            </select>
          </div>
          <div class="re-field"><label>وصف المشكلة *</label><input id="reMaintDesc" placeholder="مثال: عطل في التكييف"></div>
          <div class="re-field"><label>تكلفة الصيانة المقدرة</label><input id="reMaintCost" type="number" value="0"></div>
          <div class="re-field"><label>حالة الطلب</label>
            <select id="reMaintStatus">
              <option value="pending">قيد الانتظار</option>
              <option value="resolved">تم الإصلاح</option>
            </select>
          </div>
        </div>
        <div class="re-form-actions"><button class="btn-primary" onclick="reSaveMaintenance()">💾 تسجيل الطلب</button></div>
      </div>
      <table class="re-table">
        <thead><tr><th>العقار</th><th>المشكلة</th><th>التكلفة</th><th>تاريخ الطلب</th><th>الحالة</th></tr></thead>
        <tbody>
          ${getMaintenance().map(m => `
            <tr>
              <td>${esc(m.propertyName)}</td><td>${esc(m.desc)}</td>
              <td>${fmt(m.cost)} ${curSym()}</td>
              <td>${new Date(m.at).toLocaleDateString('ar-IQ')}</td>
              <td><span class="re-status-badge ${m.status === 'resolved' ? 're-status-avail' : 're-status-maint'}">${m.status === 'resolved' ? 'تم الحل' : 'قيد الصيانة'}</span></td>
            </tr>
          `).join('') || '<tr><td colspan="5" class="re-empty">لا يوجد طلبات صيانة</td></tr>'}
        </tbody>
      </table>`;
  }

  function renderInvoices() {
    const el = document.getElementById('reInvBody'); if (!el) return;
    const invs = [...getInvoices()].reverse();
    el.innerHTML = `
      <table class="re-table">
        <thead><tr><th>رقم الفاتورة</th><th>العميل</th><th>العقار</th><th>المبلغ المطلوب</th><th>تاريخ الإنشاء</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>
          ${invs.map(i => `
            <tr>
              <td>${esc(i.ref)}</td><td>${esc(i.client)}</td><td>${esc(i.propertyName)}</td>
              <td>${fmt(i.amount)} ${curSym()}</td>
              <td>${new Date(i.createdAt).toLocaleDateString('ar-IQ')}</td>
              <td><span class="re-status-badge ${i.status === 'paid' ? 're-status-avail' : 're-status-sold'}">${i.status === 'paid' ? 'مسددة' : 'غير مسددة'}</span></td>
              <td>
                ${i.status !== 'paid' ? `<button class="re-btn-sm btn-primary" onclick="rePayInvoice('${i.id}')">💵 تسديد</button>` : '✅ مسددة'}
              </td>
            </tr>
          `).join('') || '<tr><td colspan="7" class="re-empty">لا يوجد فواتير صادرة</td></tr>'}
        </tbody>
      </table>`;
  }

  function renderTabContent() {
    const body = document.getElementById('realEstateBody'); if (!body) return;
    const tabs = { reDashBody:'dashboard', rePropBody:'properties', reContBody:'contracts', reMaintBody:'maintenance', reInvBody:'invoices' };
    Object.keys(tabs).forEach(id => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('div'); el.id = id; body.appendChild(el); }
      el.style.display = tabs[id] === activeTab ? '' : 'none';
    });
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'properties') renderProperties();
    else if (activeTab === 'contracts') renderContracts();
    else if (activeTab === 'maintenance') renderMaintenance();
    else if (activeTab === 'invoices') renderInvoices();
  }

  function renderRealEstate() {
    const body = document.getElementById('realEstateBody'); if (!body) return;
    ensureData();
    const tabDefs = [['dashboard','📊 لوحة التحكم'],['properties','🏢 العقارات'],['contracts','✍️ العقود'],['maintenance','🛠️ الصيانة'],['invoices','💰 الفواتير']];
    body.innerHTML = `
      <div class="re-header">
        <div class="re-tabs">${tabDefs.map(([k,l]) => `<button class="re-tab-btn ${activeTab === k ? 'active' : ''}" data-tab="${k}" onclick="reOpenTab('${k}')">${l}</button>`).join('')}</div>
      </div>
      <div id="reDashBody"></div><div id="rePropBody"></div><div id="reContBody"></div><div id="reMaintBody"></div><div id="reInvBody"></div>`;
    renderTabContent();
  }

  window.renderRealEstate = renderRealEstate;

  /* ─────────────── switchPage hook ─────────────── */
  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'real-estate') {
      // Core switchPage only activates pages in its built-in pageMap; like
      // pos/pharmacy/assets, this module activates its own section explicitly
      // so navigation actually shows it (otherwise the page stays hidden).
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageRealEstate'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navRealEstate'); if (nav) nav.classList.add('active');
        window.currentPage = 'real-estate';
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('real-estate');
      } catch (_) {}
      ensureData(); setTimeout(renderRealEstate, 0);
    }
  };

  /* ─────────────── Jarvis tool ─────────────── */
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_realestate_today'] = function () {
          const re = RE(); if (!re) return { error: 'realestate not ready' };
          return {
            totalProperties: re.properties.length,
            rented: re.properties.filter(p => p.status === 'rented').length,
            sold: re.properties.filter(p => p.status === 'sold').length,
            available: re.properties.filter(p => p.status === 'available').length,
            maintenance: re.properties.filter(p => p.status === 'maintenance').length,
            unpaidInvoices: re.invoices.filter(i => i.status !== 'paid').length
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['real-estate'] = '#pageRealEstate';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis);
  else setTimeout(registerJarvis, 600);

  window.OctagonRealEstate = { render: renderRealEstate, ensureData };
})();
