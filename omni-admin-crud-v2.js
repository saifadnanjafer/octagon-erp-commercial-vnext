/**
 * Octagon Admin CRUD patch:
 * - storage location edit/delete/restore
 * - workshop directory CRUD
 * - property field schema CRUD
 */
(function () {
  'use strict';

  const LOCATION_TYPES = [
    ['internal', 'داخلي'],
    ['transit', 'عبور'],
    ['inventory', 'تسوية فروقات'],
    ['production', 'إنتاج / WIP'],
    ['supplier', 'مورد'],
    ['customer', 'عميل'],
  ];

  const FIELD_TYPES = [
    ['text', 'نص'],
    ['number', 'رقم'],
    ['date', 'تاريخ'],
    ['select', 'قائمة'],
    ['checkbox', 'نعم / لا'],
    ['textarea', 'ملاحظات'],
  ];

  const WORKSHOP_TYPES = [
    ['production', 'إنتاج'],
    ['print', 'طباعة'],
    ['finishing', 'تشطيب'],
    ['warehouse', 'مخزن'],
    ['office', 'إدارة'],
  ];

  function esc(value) {
    if (window.escapeHtml) return window.escapeHtml(value);
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function q(value) {
    if (window.jsString) return window.jsString(value);
    return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  function toast(message, type = 'info') {
    if (window.showToast) window.showToast(message, type);
  }

  function makeId(prefix, text) {
    const raw = String(text || prefix).trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    return `${prefix}_${raw || Date.now()}_${Date.now().toString(36).slice(-5)}`;
  }

  async function loadDb(force = true) {
    if (!window.PentagonDB) throw new Error('OctagonDB غير جاهز');
    return window.PentagonDB.load({ force });
  }

  function getAdminSettings(db) {
    if (!db.omni) db.omni = {};
    if (!db.omni.adminSettings) db.omni.adminSettings = {};
    if (!Array.isArray(db.omni.adminSettings.workshops)) db.omni.adminSettings.workshops = [];
    if (!Array.isArray(db.omni.adminSettings.propertyFields)) db.omni.adminSettings.propertyFields = [];
    return db.omni.adminSettings;
  }

  function locationUsage(db, locationId) {
    const quantCount = (db.quants || []).filter(qt => qt.location_id === locationId && Number(qt.quantity || 0) !== 0).length;
    const transferCount = (db.transfers || []).filter(t => t.location_id === locationId || t.location_dest_id === locationId).length;
    const moveCount = (db.stock_moves || []).filter(m => m.location_id === locationId || m.location_dest_id === locationId).length;
    const childCount = (db.locations || []).filter(l => l.parent_id === locationId && l.is_active !== false).length;
    return { quantCount, transferCount, moveCount, childCount, total: quantCount + transferCount + moveCount + childCount };
  }

  function typeOptions(selected, options) {
    return options.map(([value, label]) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(label)}</option>`).join('');
  }

  function locationOptions(locations, selected, excludeId = '') {
    return [
      '<option value="">بدون موقع أب</option>',
      ...locations
        .filter(loc => loc.id !== excludeId && loc.is_active !== false)
        .map(loc => `<option value="${esc(loc.id)}" ${selected === loc.id ? 'selected' : ''}>${esc(loc.name || loc.id)}</option>`),
    ].join('');
  }

  async function renderLocationCrudHtml() {
    const db = await loadDb(true);
    const locations = Array.isArray(db.locations) ? db.locations : [];
    const active = locations.filter(loc => loc.is_active !== false);
    const inactive = locations.filter(loc => loc.is_active === false);
    const cards = locations.map(loc => {
      const usage = locationUsage(db, loc.id);
      const parent = locations.find(item => item.id === loc.parent_id);
      return `
        <div class="admin-crud-card ${loc.is_active === false ? 'is-inactive' : ''}">
          <div class="admin-crud-card-top">
            <div class="admin-crud-title">
              <b>${esc(loc.name || loc.id)}</b>
              <small>${esc(loc.id)}${parent ? ` · داخل ${esc(parent.name || parent.id)}` : ''}</small>
            </div>
            <span class="admin-crud-chip">${esc((LOCATION_TYPES.find(t => t[0] === loc.type) || [loc.type, loc.type || '-'])[1])}</span>
          </div>
          <div class="admin-crud-chip-row">
            <span class="admin-crud-chip">${usage.quantCount} رصيد</span>
            <span class="admin-crud-chip">${usage.transferCount} تحويل</span>
            <span class="admin-crud-chip">${usage.childCount} فرعي</span>
            ${loc.is_active === false ? '<span class="admin-crud-chip admin-crud-danger">معطل</span>' : ''}
          </div>
          <div class="admin-crud-actions">
            ${loc.is_active === false
              ? `<button class="btn-secondary btn-xs" onclick="adminCrudRestoreLocation('${q(loc.id)}')"><i class="fa-solid fa-rotate-left"></i> استعادة</button>`
              : `<button class="btn-secondary btn-xs" onclick="adminCrudOpenLocationModal('${q(loc.id)}')"><i class="fa-solid fa-pen"></i> تعديل</button>
                 <button class="btn-secondary btn-xs admin-crud-danger" onclick="adminCrudDeleteLocation('${q(loc.id)}')"><i class="fa-solid fa-trash"></i> حذف</button>`}
          </div>
        </div>
      `;
    }).join('');

    return `
      <section class="admin-card admin-card-wide admin-crud-shell">
        <div class="admin-crud-head">
          <div>
            <h3><i class="fa-solid fa-location-dot"></i> إدارة مواقع التخزين</h3>
            <p class="admin-crud-meta">${active.length} نشط · ${inactive.length} معطل · حذف آمن عند وجود أرصدة أو تحويلات مرتبطة.</p>
          </div>
          <button class="btn-primary" onclick="adminCrudOpenLocationModal('')"><i class="fa-solid fa-plus"></i> موقع جديد</button>
        </div>
        <div class="admin-crud-grid">${cards || '<div class="admin-empty">لا توجد مواقع تخزين بعد.</div>'}</div>
      </section>
    `;
  }

  window.adminCrudOpenLocationModal = async function (locationId = '') {
    const db = await loadDb(true);
    const locations = Array.isArray(db.locations) ? db.locations : [];
    const loc = locations.find(item => item.id === locationId) || {};
    const isEdit = Boolean(loc.id);
    const html = `
      <div class="admin-crud-form-grid">
        <label>اسم الموقع<input id="adminLocName" class="form-input" value="${esc(loc.name || '')}" placeholder="مثال: الرف A-1"></label>
        <label>نوع الموقع<select id="adminLocType" class="form-input">${typeOptions(loc.type || 'internal', LOCATION_TYPES)}</select></label>
        <label class="full">الموقع الأب<select id="adminLocParent" class="form-input">${locationOptions(locations, loc.parent_id || '', loc.id || '')}</select></label>
        <label class="full">ملاحظات<textarea id="adminLocNotes" class="form-input" rows="2">${esc(loc.notes || '')}</textarea></label>
      </div>`;
    const result = await window.showOmniModal(isEdit ? 'تعديل موقع التخزين' : 'إضافة موقع تخزين', html, body => {
      const name = body.querySelector('#adminLocName')?.value.trim();
      if (!name) { toast('اكتب اسم الموقع', 'warning'); return false; }
      return {
        name,
        type: body.querySelector('#adminLocType')?.value || 'internal',
        parent_id: body.querySelector('#adminLocParent')?.value || null,
        notes: body.querySelector('#adminLocNotes')?.value.trim() || '',
      };
    });
    if (!result) return;

    await window.PentagonDB.mutate(mdb => {
      if (!Array.isArray(mdb.locations)) mdb.locations = [];
      if (isEdit) {
        const target = mdb.locations.find(item => item.id === locationId);
        Object.assign(target, result, { updated_at: new Date().toISOString(), updated_by: window.PentagonAuth?.getCurrentUser()?.id || 'system' });
      } else {
        mdb.locations.push({
          id: makeId('LOC', result.name),
          ...result,
          is_active: true,
          created_at: new Date().toISOString(),
          created_by: window.PentagonAuth?.getCurrentUser()?.id || 'system',
        });
      }
    });
    toast(isEdit ? 'تم تحديث موقع التخزين' : 'تم إنشاء موقع التخزين', 'success');
    refreshCrudScreens();
  };

  window.adminCrudDeleteLocation = async function (locationId) {
    const db = await loadDb(true);
    const loc = (db.locations || []).find(item => item.id === locationId);
    if (!loc) return;
    const usage = locationUsage(db, locationId);
    const result = await window.showOmniModal('حذف موقع التخزين', `
      <p>هل تريد حذف <b>${esc(loc.name || loc.id)}</b>؟</p>
      <p class="muted">الاستخدام الحالي: ${usage.quantCount} رصيد، ${usage.transferCount} تحويل، ${usage.moveCount} حركة، ${usage.childCount} موقع فرعي.</p>
      <p class="muted">${usage.total ? 'سيتم تعطيل الموقع بدل حذفه للحفاظ على السجلات.' : 'هذا الموقع غير مستخدم ويمكن حذفه نهائيا.'}</p>
    `, () => true);
    if (!result) return;
    await window.PentagonDB.mutate(mdb => {
      const locations = Array.isArray(mdb.locations) ? mdb.locations : [];
      const targetUsage = locationUsage(mdb, locationId);
      if (targetUsage.total) {
        const target = locations.find(item => item.id === locationId);
        if (target) {
          target.is_active = false;
          target.archived_at = new Date().toISOString();
          target.updated_by = window.PentagonAuth?.getCurrentUser()?.id || 'system';
        }
      } else {
        mdb.locations = locations.filter(item => item.id !== locationId);
      }
    });
    toast(usage.total ? 'تم تعطيل الموقع مع حفظ السجلات المرتبطة' : 'تم حذف الموقع', 'success');
    refreshCrudScreens();
  };

  window.adminCrudRestoreLocation = async function (locationId) {
    await window.PentagonDB.mutate(db => {
      const loc = (db.locations || []).find(item => item.id === locationId);
      if (loc) {
        loc.is_active = true;
        loc.updated_at = new Date().toISOString();
        delete loc.archived_at;
      }
    });
    toast('تمت استعادة الموقع', 'success');
    refreshCrudScreens();
  };

  function renderWorkshopCrudHtml(settings) {
    const workshops = settings.workshops || [];
    return `
      <section class="admin-card admin-card-wide admin-crud-shell">
        <div class="admin-crud-head">
          <div>
            <h3><i class="fa-solid fa-industry"></i> الورش ومراكز العمل</h3>
            <p class="admin-crud-meta">دليل إداري للورش، المسؤولين، المواقع، والطاقة اليومية.</p>
          </div>
          <button class="btn-primary" onclick="adminCrudOpenWorkshopModal('')"><i class="fa-solid fa-plus"></i> ورشة جديدة</button>
        </div>
        <div class="admin-crud-grid">
          ${workshops.map(ws => `
            <div class="admin-crud-card ${ws.is_active === false ? 'is-inactive' : ''}">
              <div class="admin-crud-card-top">
                <div class="admin-crud-title">
                  <b>${esc(ws.name || ws.id)}</b>
                  <small>${esc(ws.code || ws.id)} · ${esc(ws.manager || 'بدون مسؤول')}</small>
                </div>
                <span class="admin-crud-chip">${esc((WORKSHOP_TYPES.find(t => t[0] === ws.type) || [ws.type, ws.type || '-'])[1])}</span>
              </div>
              <div class="admin-crud-chip-row">
                <span class="admin-crud-chip">${esc(ws.location || 'بدون موقع')}</span>
                <span class="admin-crud-chip">${Number(ws.capacity || 0)} ساعة/يوم</span>
                <span class="admin-crud-chip">${ws.is_active === false ? 'معطلة' : 'نشطة'}</span>
              </div>
              <div class="admin-crud-actions">
                <button class="btn-secondary btn-xs" onclick="adminCrudOpenWorkshopModal('${q(ws.id)}')"><i class="fa-solid fa-pen"></i> تعديل</button>
                <button class="btn-secondary btn-xs admin-crud-danger" onclick="adminCrudDeleteWorkshop('${q(ws.id)}')"><i class="fa-solid fa-trash"></i> حذف</button>
              </div>
            </div>
          `).join('') || '<div class="admin-empty">لا توجد ورش معرفة بعد.</div>'}
        </div>
      </section>
    `;
  }

  window.adminCrudOpenWorkshopModal = async function (workshopId = '') {
    const db = await loadDb(true);
    const settings = getAdminSettings(db);
    const ws = settings.workshops.find(item => item.id === workshopId) || {};
    const isEdit = Boolean(ws.id);
    const html = `
      <div class="admin-crud-form-grid">
        <label>اسم الورشة<input id="adminWsName" class="form-input" value="${esc(ws.name || '')}"></label>
        <label>الكود<input id="adminWsCode" class="form-input" value="${esc(ws.code || '')}" placeholder="WRK-01"></label>
        <label>النوع<select id="adminWsType" class="form-input">${typeOptions(ws.type || 'production', WORKSHOP_TYPES)}</select></label>
        <label>المسؤول<input id="adminWsManager" class="form-input" value="${esc(ws.manager || '')}"></label>
        <label>الموقع<input id="adminWsLocation" class="form-input" value="${esc(ws.location || '')}"></label>
        <label>الطاقة اليومية<input id="adminWsCapacity" class="form-input" type="number" min="0" step="0.5" value="${esc(ws.capacity ?? 8)}"></label>
        <label class="full">ملاحظات<textarea id="adminWsNotes" class="form-input" rows="2">${esc(ws.notes || '')}</textarea></label>
      </div>`;
    const result = await window.showOmniModal(isEdit ? 'تعديل ورشة' : 'إضافة ورشة', html, body => {
      const name = body.querySelector('#adminWsName')?.value.trim();
      if (!name) { toast('اكتب اسم الورشة', 'warning'); return false; }
      return {
        name,
        code: body.querySelector('#adminWsCode')?.value.trim() || '',
        type: body.querySelector('#adminWsType')?.value || 'production',
        manager: body.querySelector('#adminWsManager')?.value.trim() || '',
        location: body.querySelector('#adminWsLocation')?.value.trim() || '',
        capacity: Number(body.querySelector('#adminWsCapacity')?.value || 0),
        notes: body.querySelector('#adminWsNotes')?.value.trim() || '',
        is_active: true,
      };
    });
    if (!result) return;
    await window.PentagonDB.mutate(mdb => {
      const admin = getAdminSettings(mdb);
      if (isEdit) Object.assign(admin.workshops.find(item => item.id === workshopId), result, { updated_at: new Date().toISOString() });
      else admin.workshops.push({ id: makeId('WRK', result.name), ...result, created_at: new Date().toISOString() });
    });
    toast(isEdit ? 'تم تحديث الورشة' : 'تم إنشاء الورشة', 'success');
    refreshCrudScreens();
  };

  window.adminCrudDeleteWorkshop = async function (workshopId) {
    const ok = await window.showOmniModal('حذف ورشة', '<p>هل تريد حذف هذه الورشة من دليل الإدارة؟</p>', () => true);
    if (!ok) return;
    await window.PentagonDB.mutate(db => {
      const admin = getAdminSettings(db);
      admin.workshops = admin.workshops.filter(item => item.id !== workshopId);
    });
    toast('تم حذف الورشة', 'success');
    refreshCrudScreens();
  };

  function renderPropertyFieldCrudHtml(settings) {
    const fields = settings.propertyFields || [];
    return `
      <section class="admin-card admin-card-wide admin-crud-shell">
        <div class="admin-crud-head">
          <div>
            <h3><i class="fa-solid fa-list-check"></i> حقول الممتلكات والعهد</h3>
            <p class="admin-crud-meta">تعريف الحقول التي تظهر في سجلات المعدات والعهدة والتدقيق.</p>
          </div>
          <button class="btn-primary" onclick="adminCrudOpenFieldModal('')"><i class="fa-solid fa-plus"></i> حقل جديد</button>
        </div>
        <table class="admin-crud-table">
          <thead><tr><th>الحقل</th><th>المفتاح</th><th>النوع</th><th>النطاق</th><th>إلزامي</th><th>إجراءات</th></tr></thead>
          <tbody>
            ${fields.map(field => `
              <tr>
                <td><b>${esc(field.label || field.key)}</b></td>
                <td><code>${esc(field.key || field.id)}</code></td>
                <td>${esc((FIELD_TYPES.find(t => t[0] === field.type) || [field.type, field.type || '-'])[1])}</td>
                <td>${esc(field.appliesTo || 'equipment')}</td>
                <td>${field.required ? 'نعم' : 'لا'}</td>
                <td>
                  <button class="btn-secondary btn-xs" onclick="adminCrudOpenFieldModal('${q(field.id)}')"><i class="fa-solid fa-pen"></i></button>
                  <button class="btn-secondary btn-xs admin-crud-danger" onclick="adminCrudDeleteField('${q(field.id)}')"><i class="fa-solid fa-trash"></i></button>
                </td>
              </tr>
            `).join('') || '<tr><td colspan="6" class="admin-empty">لا توجد حقول مخصصة بعد.</td></tr>'}
          </tbody>
        </table>
      </section>
    `;
  }

  window.adminCrudOpenFieldModal = async function (fieldId = '') {
    const db = await loadDb(true);
    const settings = getAdminSettings(db);
    const field = settings.propertyFields.find(item => item.id === fieldId) || {};
    const isEdit = Boolean(field.id);
    const html = `
      <div class="admin-crud-form-grid">
        <label>اسم الحقل<input id="adminFieldLabel" class="form-input" value="${esc(field.label || '')}" placeholder="مثال: رقم الضمان"></label>
        <label>المفتاح التقني<input id="adminFieldKey" class="form-input" value="${esc(field.key || '')}" placeholder="warranty_number"></label>
        <label>النوع<select id="adminFieldType" class="form-input">${typeOptions(field.type || 'text', FIELD_TYPES)}</select></label>
        <label>النطاق<select id="adminFieldScope" class="form-input">
          <option value="equipment" ${field.appliesTo === 'equipment' ? 'selected' : ''}>معدات</option>
          <option value="custody" ${field.appliesTo === 'custody' ? 'selected' : ''}>عهدة</option>
          <option value="inventory" ${field.appliesTo === 'inventory' ? 'selected' : ''}>مخزون</option>
          <option value="all" ${field.appliesTo === 'all' ? 'selected' : ''}>الكل</option>
        </select></label>
        <label class="full">خيارات القائمة، مفصولة بفواصل<input id="adminFieldOptions" class="form-input" value="${esc((field.options || []).join(', '))}"></label>
        <label class="full"><input id="adminFieldRequired" type="checkbox" ${field.required ? 'checked' : ''}> حقل إلزامي</label>
      </div>`;
    const result = await window.showOmniModal(isEdit ? 'تعديل حقل' : 'إضافة حقل', html, body => {
      const label = body.querySelector('#adminFieldLabel')?.value.trim();
      const key = body.querySelector('#adminFieldKey')?.value.trim().replace(/[^A-Za-z0-9_]/g, '_').toLowerCase();
      if (!label || !key) { toast('اكتب اسم الحقل والمفتاح التقني', 'warning'); return false; }
      return {
        label,
        key,
        type: body.querySelector('#adminFieldType')?.value || 'text',
        appliesTo: body.querySelector('#adminFieldScope')?.value || 'equipment',
        options: (body.querySelector('#adminFieldOptions')?.value || '').split(',').map(item => item.trim()).filter(Boolean),
        required: Boolean(body.querySelector('#adminFieldRequired')?.checked),
      };
    });
    if (!result) return;
    await window.PentagonDB.mutate(mdb => {
      const admin = getAdminSettings(mdb);
      const duplicate = admin.propertyFields.find(item => item.key === result.key && item.id !== fieldId);
      if (duplicate) throw new Error('يوجد حقل بنفس المفتاح التقني');
      if (isEdit) Object.assign(admin.propertyFields.find(item => item.id === fieldId), result, { updated_at: new Date().toISOString() });
      else admin.propertyFields.push({ id: makeId('FLD', result.key), ...result, created_at: new Date().toISOString() });
    });
    toast(isEdit ? 'تم تحديث الحقل' : 'تم إنشاء الحقل', 'success');
    refreshCrudScreens();
  };

  window.adminCrudDeleteField = async function (fieldId) {
    const ok = await window.showOmniModal('حذف حقل', '<p>هل تريد حذف هذا الحقل المخصص؟ لن يتم حذف القيم القديمة من السجلات.</p>', () => true);
    if (!ok) return;
    await window.PentagonDB.mutate(db => {
      const admin = getAdminSettings(db);
      admin.propertyFields = admin.propertyFields.filter(item => item.id !== fieldId);
    });
    toast('تم حذف الحقل', 'success');
    refreshCrudScreens();
  };

  async function renderAdminCrudSettingsBlock() {
    const db = await loadDb(true);
    const settings = getAdminSettings(db);
    return `
      <div id="adminCrudBlock" class="admin-crud-shell" style="margin-top:16px;">
        ${renderWorkshopCrudHtml(settings)}
        ${renderPropertyFieldCrudHtml(settings)}
        ${await renderLocationCrudHtml()}
      </div>
    `;
  }

  function patchAdminSettings() {
    const original = window.renderAdminTabSettings;
    if (typeof original !== 'function' || original.__adminCrudPatched) return;
    window.renderAdminTabSettings = function () {
      const base = original.apply(this, arguments);
      setTimeout(async () => {
        const body = document.querySelector('.admin-tab-body');
        if (!body || document.getElementById('adminCrudBlock')) return;
        try {
          body.insertAdjacentHTML('beforeend', await renderAdminCrudSettingsBlock());
        } catch (error) {
          console.warn('[Admin CRUD] settings render failed:', error);
        }
      }, 0);
      return base;
    };
    window.renderAdminTabSettings.__adminCrudPatched = true;
  }

  function patchInventoryTransfers() {
    const original = window.renderInventoryTransfersSection;
    if (typeof original !== 'function' || original.__adminCrudPatched) return;
    window.renderInventoryTransfersSection = async function () {
      const base = await original.apply(this, arguments);
      try {
        const crud = await renderLocationCrudHtml();
        return `${base}<div style="margin-top:20px;">${crud}</div>`;
      } catch (error) {
        console.warn('[Admin CRUD] location render failed:', error);
        return base;
      }
    };
    window.renderInventoryTransfersSection.__adminCrudPatched = true;
  }

  function refreshCrudScreens() {
    if (typeof window.saveData === 'function') window.saveData(true);
    if (typeof window.renderAdminPanel === 'function' && document.getElementById('pageAdminPanel')?.classList.contains('active')) {
      window.renderAdminPanel();
    }
    if (typeof window.renderInventoryPage === 'function' && window.inventoryActiveTab === 'transfers') {
      window.renderInventoryPage();
    }
  }

  function boot() {
    patchAdminSettings();
    patchInventoryTransfers();
    setTimeout(() => {
      patchAdminSettings();
      patchInventoryTransfers();
    }, 800);
    console.log('[Admin CRUD v2] loaded');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
