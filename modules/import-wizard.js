/*
 * OCTAGON OMNISYSTEM - modules/import-wizard.js
 *
 * T3.2: schema-aware CSV import center. Add-only module; index.html wiring is
 * requested through coordination/integration-queue.md.
 */
(function () {
  'use strict';

  const PAGE_KEY = 'import_center';
  const PAGE_ID = 'pageImportCenter';
  const NAV_ID = 'navImportCenter';
  const AUTO = '__auto__';
  const SKIP = '__skip__';
  const state = {
    collectionKey: '',
    csvText: '',
    rows: [],
    headers: [],
    mapping: {},
    preview: [],
    validOnly: true,
    presetName: '',
  };

  function O() {
    if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni;
    if (typeof window.ensureOmni === 'function') {
      try { return window.ensureOmni(); } catch (_) {}
    }
    return null;
  }

  function esc(value) {
    if (typeof escapeHtml === 'function') return escapeHtml(value);
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function toast(message, type) {
    if (typeof showToast === 'function') showToast(message, type || 'info');
  }

  function uid(prefix) {
    if (typeof makeId === 'function') return makeId(prefix || 'imp');
    return `${prefix || 'imp'}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function schemaRegistry() {
    return window.OctagonSchema || { collections: {}, validate: () => ({ ok: true, errors: [] }) };
  }

  function schemaFor(key) {
    return schemaRegistry().collections[key] || {};
  }

  function isBlockedCollection(key, schema) {
    return !!schema.protect || /(^|\.)(employees|attendance|timesheet|payroll)(\.|$)/i.test(key);
  }

  function collectionOptions() {
    const reg = schemaRegistry();
    return Object.keys(reg.collections || {})
      .filter(key => !isBlockedCollection(key, reg.collections[key]))
      .filter(key => !reg.collections[key].nested)
      .sort();
  }

  function labelForCollection(key) {
    const labels = {
      'omni.jobOrders': 'أوامر العمل',
      'omni.machines': 'المكائن',
      'omni.materials': 'المواد والمخزون',
      'omni.opPacks': 'باقات العمليات',
      'omni.suppliers': 'الموردون',
      'finance.customers': 'العملاء',
      'omni.pharmacy.products': 'منتجات الصيدلية',
      'omni.fleet.vehicles': 'المركبات',
      'omni.assetRegister.assets': 'الأصول',
      'omni.subscriptionHub.subscriptions': 'الاشتراكات',
      'omni.helpdesk.tickets': 'تذاكر الدعم',
      'omni.documents.docs': 'الوثائق',
    };
    return labels[key] || key;
  }

  function ensureData() {
    const o = O();
    if (!o) return;
    if (!Array.isArray(o.importPresets)) o.importPresets = [];
  }

  function parseCsv(text) {
    const src = String(text || '').replace(/^\uFEFF/, '');
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < src.length; i += 1) {
      const ch = src[i];
      const next = src[i + 1];
      if (quoted) {
        if (ch === '"' && next === '"') {
          cell += '"';
          i += 1;
        } else if (ch === '"') {
          quoted = false;
        } else {
          cell += ch;
        }
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n') {
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else if (ch !== '\r') {
        cell += ch;
      }
    }
    row.push(cell);
    rows.push(row);
    return rows.filter(r => r.some(c => String(c || '').trim() !== ''));
  }

  function normalizeHeader(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  }

  function autoMap() {
    const schema = schemaFor(state.collectionKey);
    const fields = fieldList(schema);
    const used = new Set();
    const mapping = {};
    fields.forEach(field => {
      const hit = state.headers.find(h => !used.has(h) && normalizeHeader(h) === normalizeHeader(field));
      if (hit) {
        mapping[field] = hit;
        used.add(hit);
      } else if (field === schema.idField || field === 'id') {
        mapping[field] = AUTO;
      } else {
        mapping[field] = '';
      }
    });
    state.mapping = mapping;
  }

  function fieldList(schema) {
    const fields = new Set([schema.idField || 'id']);
    (schema.required || []).forEach(field => fields.add(field));
    Object.keys(schema.types || {}).forEach(field => fields.add(field));
    return [...fields].filter(Boolean);
  }

  function coerce(value, type) {
    const raw = String(value == null ? '' : value).trim();
    if (type === 'number') {
      const n = Number(raw.replace(/,/g, ''));
      return Number.isFinite(n) ? n : raw;
    }
    if (type === 'boolean') return /^(true|1|yes|y|نعم)$/i.test(raw);
    return raw;
  }

  function recordFromRow(row, index) {
    const schema = schemaFor(state.collectionKey);
    const record = {};
    const fields = fieldList(schema);
    fields.forEach(field => {
      const source = state.mapping[field];
      if (!source || source === SKIP) return;
      if (source === AUTO) {
        record[field] = uid(String(field || 'id'));
        return;
      }
      const colIndex = state.headers.indexOf(source);
      if (colIndex >= 0) record[field] = coerce(row[colIndex], schema.types?.[field]);
    });
    if (!record[schema.idField || 'id']) record[schema.idField || 'id'] = uid('imp');
    record.importedAt = new Date().toISOString();
    record.importSource = 'import_center';
    record.importRow = index + 2;
    return record;
  }

  function buildPreview() {
    if (!state.collectionKey || !state.rows.length) {
      state.preview = [];
      return;
    }
    const bodyRows = state.rows.slice(1);
    const reg = schemaRegistry();
    state.preview = bodyRows.map((row, index) => {
      const record = recordFromRow(row, index);
      const validation = reg.validate ? reg.validate(state.collectionKey, record) : { ok: true, errors: [] };
      return { rowNumber: index + 2, record, validation };
    });
  }

  function parseCurrentCsv() {
    state.rows = parseCsv(state.csvText);
    state.headers = state.rows[0] || [];
    autoMap();
    buildPreview();
  }

  function getPath(root, dotted) {
    return String(dotted || '').split('.').filter(Boolean).reduce((cur, key) => (
      cur && typeof cur === 'object' ? cur[key] : undefined
    ), root);
  }

  function setPath(root, dotted, value) {
    const parts = String(dotted || '').split('.').filter(Boolean);
    let cur = root;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = parts[i];
      if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function appendToArray(root, dotted, records) {
    let arr = getPath(root, dotted);
    if (!Array.isArray(arr)) arr = [];
    setPath(root, dotted, arr.concat(records));
  }

  async function writeRecords(records) {
    const schema = schemaFor(state.collectionKey);
    const key = state.collectionKey;
    if (!records.length) return { imported: 0 };
    if (schema.layer === 'pentagondb' && window.PentagonDB && typeof window.PentagonDB.mutate === 'function') {
      await window.PentagonDB.mutate(db => appendToArray(db, key, records));
      return { imported: records.length, layer: 'pentagondb' };
    }
    if (schema.layer === 'legacy-finance') {
      const finance = typeof window.ensureFinance === 'function' ? window.ensureFinance() : null;
      if (!finance) throw new Error('تعذر فتح طبقة المالية القديمة');
      appendToArray(finance, key.replace(/^finance\./, ''), records);
      if (typeof saveData === 'function') saveData();
      return { imported: records.length, layer: 'legacy-finance' };
    }
    const o = O();
    if (!o) throw new Error('تعذر فتح قاعدة بيانات الواجهة');
    appendToArray(o, key.replace(/^omni\./, ''), records);
    if (typeof saveData === 'function') saveData();
    return { imported: records.length, layer: schema.layer || 'omni' };
  }

  function savePreset() {
    ensureData();
    const o = O();
    if (!o) return;
    const name = state.presetName.trim() || `${labelForCollection(state.collectionKey)} - ${new Date().toLocaleDateString('ar-IQ')}`;
    const existing = o.importPresets.find(p => p.name === name && p.collectionKey === state.collectionKey);
    const preset = { id: existing?.id || uid('preset'), name, collectionKey: state.collectionKey, mapping: { ...state.mapping }, updatedAt: new Date().toISOString() };
    if (existing) Object.assign(existing, preset);
    else o.importPresets.unshift(preset);
    if (typeof saveData === 'function') saveData();
    state.presetName = name;
    toast('تم حفظ إعدادات الربط', 'success');
    render();
  }

  function applyPreset(id) {
    ensureData();
    const preset = (O()?.importPresets || []).find(p => p.id === id);
    if (!preset) return;
    state.collectionKey = preset.collectionKey;
    state.mapping = { ...(preset.mapping || {}) };
    state.presetName = preset.name || '';
    buildPreview();
    render();
  }

  async function confirmImport(validOnly) {
    buildPreview();
    const selected = state.preview.filter(item => !validOnly || item.validation.ok);
    const invalid = state.preview.length - state.preview.filter(item => item.validation.ok).length;
    if (!state.collectionKey || !selected.length) {
      toast('لا توجد صفوف صالحة للاستيراد', 'warning');
      return;
    }
    if (!validOnly && invalid && !window.confirm('توجد صفوف غير صالحة. هل تريد استيراد كل الصفوف؟')) return;
    try {
      const result = await writeRecords(selected.map(item => item.record));
      toast(`تم استيراد ${result.imported} سجل`, 'success');
      state.csvText = '';
      state.rows = [];
      state.headers = [];
      state.preview = [];
      render();
    } catch (error) {
      console.error('Import failed:', error);
      toast(error.message || 'فشل الاستيراد', 'error');
    }
  }

  function renderCollections() {
    return collectionOptions().map(key => `<option value="${esc(key)}" ${state.collectionKey === key ? 'selected' : ''}>${esc(labelForCollection(key))} (${esc(key)})</option>`).join('');
  }

  function renderMapping() {
    if (!state.collectionKey || !state.headers.length) return '<div class="iw-empty">ألصق CSV أولاً لعرض ربط الأعمدة.</div>';
    const schema = schemaFor(state.collectionKey);
    const fields = fieldList(schema);
    const options = field => [
      `<option value="">بدون ربط</option>`,
      `<option value="${AUTO}" ${state.mapping[field] === AUTO ? 'selected' : ''}>توليد تلقائي</option>`,
      ...state.headers.map(h => `<option value="${esc(h)}" ${state.mapping[field] === h ? 'selected' : ''}>${esc(h)}</option>`),
    ].join('');
    return `<div class="iw-map-grid">${fields.map(field => `<label class="iw-map-row">
      <span>${esc(field)} ${(schema.required || []).includes(field) ? '<b>*</b>' : ''}</span>
      <select onchange="ImportWizard.setMapping('${esc(field)}', this.value)">${options(field)}</select>
    </label>`).join('')}</div>`;
  }

  function renderPreview() {
    if (!state.preview.length) return '<div class="iw-empty">لا توجد معاينة بعد.</div>';
    const shown = state.preview.slice(0, 20);
    return `<div class="iw-preview-table-wrap"><table class="iw-preview-table">
      <thead><tr><th>السطر</th><th>الحالة</th><th>البيانات</th><th>الأخطاء</th></tr></thead>
      <tbody>${shown.map(item => `<tr class="${item.validation.ok ? 'is-ok' : 'is-bad'}">
        <td>${item.rowNumber}</td>
        <td>${item.validation.ok ? 'صالح' : 'مرفوض'}</td>
        <td><code>${esc(JSON.stringify(item.record).slice(0, 180))}</code></td>
        <td>${esc((item.validation.errors || []).join('، ') || (item.validation.recordErrors || []).join('، '))}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function renderPresets() {
    ensureData();
    const presets = (O()?.importPresets || []).filter(p => p.collectionKey === state.collectionKey);
    if (!presets.length) return '';
    return `<div class="iw-preset-list">${presets.slice(0, 5).map(p => `<button onclick="ImportWizard.applyPreset('${esc(p.id)}')">${esc(p.name)}</button>`).join('')}</div>`;
  }

  function pageHtml() {
    const total = Math.max(0, state.rows.length - 1);
    const valid = state.preview.filter(item => item.validation.ok).length;
    const invalid = state.preview.length - valid;
    return `<div class="iw-shell" dir="rtl">
      <div class="iw-hero">
        <div>
          <span class="iw-eyebrow">استيراد البيانات</span>
          <h2>مركز الاستيراد العام</h2>
          <p>CSV مع ربط أعمدة ومعاينة تحقق قبل الحفظ.</p>
        </div>
        <div class="iw-stats">
          <div><b>${total}</b><span>صف</span></div>
          <div><b>${valid}</b><span>صالح</span></div>
          <div><b>${invalid}</b><span>مرفوض</span></div>
        </div>
      </div>

      <div class="iw-layout">
        <section class="iw-panel">
          <h3>١. المجموعة</h3>
          <select class="iw-select" onchange="ImportWizard.setCollection(this.value)">
            <option value="">اختر مجموعة...</option>
            ${renderCollections()}
          </select>
          ${state.collectionKey ? `<div class="iw-note">المجموعة المحددة: <code>${esc(state.collectionKey)}</code></div>${renderPresets()}` : '<div class="iw-note">الموظفون والحضور والرواتب مخفية لأنها منطقة مجمدة.</div>'}
        </section>

        <section class="iw-panel">
          <h3>٢. CSV</h3>
          <input type="file" accept=".csv,text/csv" onchange="ImportWizard.loadFile(this.files && this.files[0])">
          <textarea class="iw-csv" placeholder="الصق CSV هنا..." oninput="ImportWizard.setCsv(this.value)">${esc(state.csvText)}</textarea>
          <button class="iw-btn" onclick="ImportWizard.parse()">تحليل CSV</button>
        </section>

        <section class="iw-panel iw-panel-wide">
          <h3>٣. ربط الأعمدة</h3>
          ${renderMapping()}
          <div class="iw-preset-save">
            <input value="${esc(state.presetName)}" placeholder="اسم إعداد الربط" oninput="ImportWizard.setPresetName(this.value)">
            <button class="iw-btn secondary" onclick="ImportWizard.savePreset()">حفظ الربط</button>
          </div>
        </section>

        <section class="iw-panel iw-panel-wide">
          <h3>٤. المعاينة</h3>
          ${renderPreview()}
          <div class="iw-actions">
            <button class="iw-btn primary" onclick="ImportWizard.confirm(true)">استيراد الصالح فقط</button>
            <button class="iw-btn danger" onclick="ImportWizard.confirm(false)">استيراد كل الصفوف</button>
          </div>
        </section>
      </div>
    </div>`;
  }

  function ensureShell() {
    let page = document.getElementById(PAGE_ID);
    if (!page) {
      page = document.createElement('div');
      page.id = PAGE_ID;
      page.className = 'page';
      const host = document.querySelector('.main-content') || document.querySelector('main') || document.querySelector('.content') || document.body;
      host.appendChild(page);
    }
    if (!document.getElementById(NAV_ID)) {
      const navHost = document.querySelector('#navGroup-admin_org .nav-group-body') || document.querySelector('.sidebar') || document.querySelector('nav');
      if (navHost) {
        const btn = document.createElement('button');
        btn.id = NAV_ID;
        btn.className = 'nav-btn';
        btn.setAttribute('data-page', PAGE_KEY);
        btn.innerHTML = '<i class="fa-solid fa-file-import"></i><span>استيراد البيانات</span>';
        btn.addEventListener('click', () => window.switchPage(PAGE_KEY));
        navHost.appendChild(btn);
      }
    }
    return page;
  }

  function render() {
    const page = ensureShell();
    page.innerHTML = pageHtml();
  }

  function activatePage() {
    ensureData();
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const page = ensureShell();
    page.classList.add('page-active');
    const nav = document.getElementById(NAV_ID);
    if (nav) nav.classList.add('active');
    window.currentPage = PAGE_KEY;
    render();
  }

  function wireSwitch() {
    if (window.__importWizardWrapped || typeof window.switchPage !== 'function') return;
    const original = window.switchPage;
    window.switchPage = function (page) {
      if (page === PAGE_KEY) {
        try { activatePage(); } catch (error) { console.warn('Import wizard render error:', error); }
        return;
      }
      return original.apply(this, arguments);
    };
    window.__importWizardWrapped = true;
  }

  function init() {
    ensureData();
    ensureShell();
    wireSwitch();
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      wireSwitch();
      if (window.__importWizardWrapped || tries > 80) clearInterval(timer);
    }, 150);
  }

  window.ImportWizard = {
    open: () => window.switchPage(PAGE_KEY),
    render,
    setCollection(value) { state.collectionKey = value || ''; autoMap(); buildPreview(); render(); },
    setCsv(value) { state.csvText = value || ''; },
    parse() { parseCurrentCsv(); render(); },
    setMapping(field, value) { state.mapping[field] = value; buildPreview(); render(); },
    setPresetName(value) { state.presetName = value || ''; },
    savePreset,
    applyPreset,
    confirm: confirmImport,
    loadFile(file) {
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { state.csvText = String(reader.result || ''); parseCurrentCsv(); render(); };
      reader.readAsText(file, 'utf-8');
    },
    _parseCsv: parseCsv,
    _state: state,
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
