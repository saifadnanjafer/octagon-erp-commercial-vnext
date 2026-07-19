// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
// R3 operational UI kernel: registry-driven list/search/filter/detail/create/
// edit/state-transition/action surfaces with loading/empty/error/unauthorized
// states, history + chatter visibility, realtime refresh, Arabic RTL / English
// LTR, and responsive layout. Domain modules register descriptors; no domain
// hardcoding lives here.
'use strict';
(function () {
  const R3 = window.OctagonR3 = window.OctagonR3 || {};
  const modules = [];
  let lang = 'ar';
  let activeModule = null;
  let activeResource = null;
  let listState = { search: '', filters: {}, rows: [], error: null };
  let pollTimer = null;

  const STR = {
    search: { ar: 'بحث…', en: 'Search…' },
    create: { ar: 'إنشاء', en: 'Create' },
    refresh: { ar: 'تحديث', en: 'Refresh' },
    empty: { ar: 'لا توجد سجلات بعد', en: 'No records yet' },
    loading: { ar: 'جاري التحميل…', en: 'Loading…' },
    unauthorized: { ar: 'الدخول غير مصرّح — سجّل الدخول أولاً', en: 'Unauthorized — please sign in' },
    forbidden: { ar: 'لا تملك صلاحية على هذا المورد', en: 'You lack permission for this resource' },
    detail: { ar: 'التفاصيل', en: 'Details' },
    history: { ar: 'السجل التاريخي', en: 'History' },
    chatter: { ar: 'المحادثة والمرفقات', en: 'Chatter' },
    post: { ar: 'إرسال', en: 'Post' },
    save: { ar: 'حفظ', en: 'Save' },
    cancel: { ar: 'إلغاء', en: 'Cancel' },
    edit: { ar: 'تعديل', en: 'Edit' },
    close: { ar: 'إغلاق', en: 'Close' },
    state: { ar: 'الحالة', en: 'State' },
    actions: { ar: 'إجراءات', en: 'Actions' },
    readOnly: { ar: 'للقراءة فقط — نظام قديم', en: 'READ-ONLY — legacy source' },
    required: { ar: 'حقل مطلوب', en: 'Required field' },
    count: { ar: 'سجل', en: 'records' },
  };
  const T = (key) => (STR[key] ? STR[key][lang] : key);
  const L = (label) => (typeof label === 'object' ? (label[lang] || label.ar || label.en) : String(label || ''));
  const esc = (value) => String(value ?? '—').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function companyId() { return (document.getElementById('r3Company')?.value || 'company-r0-demo').trim(); }
  async function api(path, options = {}) {
    const response = await fetch(path, { ...options, headers: { 'X-Company-Id': companyId(), Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) } });
    let body = {};
    try { body = await response.json(); } catch (_) { /* non-JSON error body */ }
    if (response.status === 401) { const error = new Error(T('unauthorized')); error.kind = 'unauthorized'; throw error; }
    if (response.status === 403) { const error = new Error(body.error || T('forbidden')); error.kind = 'forbidden'; throw error; }
    if (!response.ok || body.success === false) { const error = new Error(body.error || `HTTP ${response.status}`); error.kind = 'error'; throw error; }
    return body.data;
  }

  // ---------- registry ----------
  R3.register = function register(moduleDef) { modules.push(moduleDef); };
  R3.modules = modules;
  R3.api = api;

  // ---------- rendering ----------
  function host() { return document.getElementById('r3App'); }
  function setConnectivity(state, text) { const node = document.getElementById('r3Connectivity'); if (node) { node.dataset.state = state; node.textContent = text; } }

  function renderNav() {
    const nav = document.getElementById('r3Nav');
    nav.innerHTML = modules.map((mod) => `<button class="nav-item ${activeModule === mod ? 'active' : ''}" data-module="${esc(mod.key)}">${esc(L(mod.label))}</button>`).join('');
    nav.querySelectorAll('[data-module]').forEach((button) => button.addEventListener('click', () => {
      activeModule = modules.find((mod) => mod.key === button.dataset.module);
      activeResource = activeModule.resources[0];
      listState = { search: '', filters: {}, rows: [], error: null };
      renderNav(); renderModule();
    }));
  }

  function renderModule() {
    const app = host();
    if (!activeModule) { app.innerHTML = `<p class="empty">${T('empty')}</p>`; return; }
    if (activeModule.customRender) { activeModule.customRender(app, { api, lang, T, L, esc }); return; }
    const tabs = activeModule.resources.map((resource) => `<button class="tab ${resource === activeResource ? 'active' : ''}" data-resource="${esc(resource.key)}">${esc(L(resource.label))}</button>`).join('');
    app.innerHTML = `<div class="tabs">${tabs}</div><div id="r3ResourceHost"></div>`;
    app.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => {
      activeResource = activeModule.resources.find((resource) => resource.key === button.dataset.resource);
      listState = { search: '', filters: {}, rows: [], error: null };
      renderModule();
    }));
    renderList();
  }

  function toolbarHtml(resource) {
    const filters = (resource.filters || []).map((filter) =>
      `<select class="filter" data-filter="${esc(filter.key)}"><option value="">${esc(L(filter.label))}</option>${filter.options.map((option) => `<option value="${esc(option)}" ${listState.filters[filter.key] === option ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select>`).join('');
    return `<div class="toolbar">
      <input id="r3Search" type="search" placeholder="${T('search')}" value="${esc(listState.search)}" ${resource.search === false ? 'hidden' : ''}>
      ${filters}
      ${resource.form ? `<button id="r3Create" class="primary">${T('create')}</button>` : ''}
      <button id="r3RefreshList">${T('refresh')}</button>
      <span id="r3Count" class="count"></span>
    </div>`;
  }

  async function renderList() {
    const container = document.getElementById('r3ResourceHost');
    const resource = activeResource;
    container.innerHTML = toolbarHtml(resource) + `<div id="r3List" class="list"><p class="loading">${T('loading')}</p></div><div id="r3Drawer" class="drawer" hidden></div>`;
    container.querySelector('#r3Search')?.addEventListener('change', (event) => { listState.search = event.target.value; renderRows(); });
    container.querySelectorAll('.filter').forEach((select) => select.addEventListener('change', () => { listState.filters[select.dataset.filter] = select.value; renderRows(); }));
    container.querySelector('#r3RefreshList')?.addEventListener('click', () => renderRows(true));
    container.querySelector('#r3Create')?.addEventListener('click', () => openForm(resource, null));
    await renderRows(true);
  }

  function applyClientQuery(rows, resource) {
    let out = rows;
    const term = listState.search.trim().toLowerCase();
    if (term) out = out.filter((row) => JSON.stringify(row).toLowerCase().includes(term));
    for (const [key, value] of Object.entries(listState.filters)) if (value) out = out.filter((row) => String(row[key] ?? '') === value);
    return out;
  }

  async function renderRows(reload = false) {
    const list = document.getElementById('r3List');
    const resource = activeResource;
    try {
      if (reload) { list.innerHTML = `<p class="loading">${T('loading')}</p>`; listState.rows = await api(`/api/x/r3/${resource.resource}`); listState.error = null; }
      const rows = applyClientQuery(listState.rows, resource);
      document.getElementById('r3Count').textContent = `${rows.length} ${T('count')}`;
      if (!rows.length) { list.innerHTML = `<p class="empty">${T('empty')}</p>`; return; }
      const columns = resource.columns;
      list.innerHTML = `<table><thead><tr>${columns.map((col) => `<th>${esc(L(col.label))}</th>`).join('')}</tr></thead><tbody>${rows.slice(0, 100).map((row, index) => `<tr data-index="${index}">${columns.map((col) => `<td>${col.state ? `<span class="chip chip-${esc(row[col.key])}">${esc(row[col.key])}</span>` : esc(row[col.key])}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      list.querySelectorAll('tr[data-index]').forEach((tr) => tr.addEventListener('click', () => openDetail(resource, rows[Number(tr.dataset.index)])));
    } catch (error) {
      listState.error = error;
      list.innerHTML = `<p class="${error.kind === 'unauthorized' ? 'unauthorized' : error.kind === 'forbidden' ? 'forbidden' : 'error'}">${esc(error.message)}</p>`;
    }
  }

  async function openDetail(resource, row) {
    const drawer = document.getElementById('r3Drawer');
    drawer.hidden = false;
    const fields = resource.detail || resource.columns;
    const transitions = (resource.states || []).filter((state) => state !== row.state);
    drawer.innerHTML = `<div class="drawer-head"><strong>${esc(L(resource.label))} — ${esc(row.id)}</strong>
        ${row.state ? `<span class="chip chip-${esc(row.state)}">${esc(row.state)}</span>` : ''}
        <button id="r3DrawerClose">${T('close')}</button></div>
      <dl class="fields">${fields.map((col) => `<dt>${esc(L(col.label))}</dt><dd>${esc(row[col.key])}</dd>`).join('')}</dl>
      ${resource.form ? `<button id="r3Edit">${T('edit')}</button>` : ''}
      ${resource.states ? `<div class="transitions"><span>${T('state')}:</span>${transitions.map((state) => `<button class="transition" data-state="${esc(state)}">${esc(state)}</button>`).join('')}</div>` : ''}
      ${(resource.actions || []).length ? `<div class="actions"><span>${T('actions')}:</span>${resource.actions.map((action) => `<button class="action" data-action="${esc(action.key)}">${esc(L(action.label))}</button>`).join('')}</div>` : ''}
      <div class="panel"><h4>${T('history')}</h4><div id="r3History" class="history"><p class="loading">${T('loading')}</p></div></div>
      <div class="panel"><h4>${T('chatter')}</h4><div id="r3Chatter"><p class="loading">${T('loading')}</p></div>
        <div class="chatter-post"><input id="r3ChatterBody" placeholder="…"><button id="r3ChatterSend">${T('post')}</button></div></div>
      <p id="r3DrawerError" class="error" hidden></p>`;
    drawer.querySelector('#r3DrawerClose').addEventListener('click', () => { drawer.hidden = true; });
    drawer.querySelector('#r3Edit')?.addEventListener('click', () => openForm(resource, row));
    drawer.querySelectorAll('.transition').forEach((button) => button.addEventListener('click', async () => {
      try { await api(`/api/x/r3/${resource.resource}/${encodeURIComponent(row.id)}/state`, { method: 'POST', body: JSON.stringify({ state: button.dataset.state }) }); drawer.hidden = true; renderRows(true); }
      catch (error) { showDrawerError(error); }
    }));
    drawer.querySelectorAll('.action').forEach((button) => button.addEventListener('click', async () => {
      const action = resource.actions.find((item) => item.key === button.dataset.action);
      try {
        let input = {};
        if (action.fields) { input = promptFields(action.fields); if (input === null) return; }
        await api(`/api/x/r3/${action.resource || resource.resource}/${encodeURIComponent(row.id)}/${action.key}`, { method: 'POST', body: JSON.stringify(input) });
        drawer.hidden = true; renderRows(true);
      } catch (error) { showDrawerError(error); }
    }));
    drawer.querySelector('#r3ChatterSend').addEventListener('click', async () => {
      const body = drawer.querySelector('#r3ChatterBody').value.trim();
      if (!body) return;
      try { await api(`/api/x/r3/${resource.resource}/${encodeURIComponent(row.id)}/chatter`, { method: 'POST', body: JSON.stringify({ body }) }); loadChatter(resource, row); drawer.querySelector('#r3ChatterBody').value = ''; }
      catch (error) { showDrawerError(error); }
    });
    loadHistory(resource, row);
    loadChatter(resource, row);
  }
  function showDrawerError(error) { const node = document.getElementById('r3DrawerError'); node.hidden = false; node.textContent = error.message; }
  async function loadHistory(resource, row) {
    const node = document.getElementById('r3History');
    try { const entries = await api(`/api/x/r3/${resource.resource}/${encodeURIComponent(row.id)}/history`); node.innerHTML = entries.length ? entries.slice(0, 12).map((entry) => `<div class="history-item"><span class="chip">${esc(entry.action)}</span> ${esc(entry.user)} <time>${esc(entry.at)}</time></div>`).join('') : `<p class="empty">${T('empty')}</p>`; }
    catch (error) { node.innerHTML = `<p class="error">${esc(error.message)}</p>`; }
  }
  async function loadChatter(resource, row) {
    const node = document.getElementById('r3Chatter');
    try { const thread = await api(`/api/x/r3/${resource.resource}/${encodeURIComponent(row.id)}/chatter`); const items = thread.items || thread || []; node.innerHTML = items.length ? items.slice(0, 12).map((item) => `<div class="chatter-item"><strong>${esc(item.author)}</strong> ${esc(item.body)}</div>`).join('') : `<p class="empty">${T('empty')}</p>`; }
    catch (error) { node.innerHTML = `<p class="error">${esc(error.message)}</p>`; }
  }

  function promptFields(fields) {
    const input = {};
    for (const field of fields) {
      const value = window.prompt(L(field.label), field.default != null ? String(field.default) : '');
      if (value === null) return null;
      input[field.key] = field.type === 'number' ? Number(value) : value;
    }
    return input;
  }

  function openForm(resource, existing) {
    const drawer = document.getElementById('r3Drawer');
    drawer.hidden = false;
    drawer.innerHTML = `<div class="drawer-head"><strong>${existing ? T('edit') : T('create')} — ${esc(L(resource.label))}</strong><button id="r3FormClose">${T('close')}</button></div>
      <form id="r3Form" class="form">${resource.form.map((field) => {
        const value = existing ? existing[field.key] ?? '' : field.default ?? '';
        if (field.type === 'select') return `<label>${esc(L(field.label))}<select name="${esc(field.key)}" ${field.required ? 'required' : ''}>${(field.options || []).map((option) => `<option value="${esc(option)}" ${String(value) === String(option) ? 'selected' : ''}>${esc(option)}</option>`).join('')}</select></label>`;
        return `<label>${esc(L(field.label))}<input name="${esc(field.key)}" type="${field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : 'text'}" value="${esc(value)}" ${field.required ? 'required' : ''} ${field.step ? `step="${field.step}"` : ''}></label>`;
      }).join('')}
      <div class="form-buttons"><button type="submit" class="primary">${T('save')}</button><button type="button" id="r3FormCancel">${T('cancel')}</button></div>
      <p id="r3FormError" class="error" hidden></p></form>`;
    drawer.querySelector('#r3FormClose').addEventListener('click', () => { drawer.hidden = true; });
    drawer.querySelector('#r3FormCancel').addEventListener('click', () => { drawer.hidden = true; });
    drawer.querySelector('#r3Form').addEventListener('submit', async (event) => {
      event.preventDefault();
      const data = {};
      let invalid = null;
      for (const field of resource.form) {
        const raw = event.target.elements[field.key]?.value ?? '';
        if (field.required && !String(raw).trim()) { invalid = field; break; }
        data[field.key] = field.type === 'number' ? Number(raw || 0) : raw;
      }
      const errorNode = drawer.querySelector('#r3FormError');
      if (invalid) { errorNode.hidden = false; errorNode.textContent = `${T('required')}: ${L(invalid.label)}`; return; }
      try {
        if (existing && resource.update) await api(`/api/x/r3/${resource.resource}/${encodeURIComponent(existing.id)}/${resource.update}`, { method: 'POST', body: JSON.stringify(data) });
        else await api(`/api/x/r3/${resource.createResource || resource.resource}`, { method: 'POST', body: JSON.stringify(resource.buildCreate ? resource.buildCreate(data) : data) });
        drawer.hidden = true;
        renderRows(true);
      } catch (error) { errorNode.hidden = false; errorNode.textContent = error.message; }
    });
  }

  // ---------- realtime ----------
  function startRealtime() {
    try {
      const source = new EventSource('/api/vnext/events');
      source.onopen = () => setConnectivity('connected', lang === 'ar' ? 'متصل' : 'Online');
      source.onerror = () => { setConnectivity('offline', lang === 'ar' ? 'غير متصل' : 'Offline'); };
      source.onmessage = (event) => {
        try { const parsed = JSON.parse(event.data); if (parsed.type && String(parsed.type).startsWith('r3.') && activeResource) renderRows(true); } catch (_) { /* heartbeat */ }
      };
      R3._events = source;
    } catch (_) { /* EventSource unavailable */ }
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => { if (activeResource && !document.getElementById('r3Drawer')?.matches(':not([hidden])')) renderRows(true); }, 30000);
  }

  // ---------- language / boot ----------
  R3.setLang = function setLang(next) {
    lang = next;
    document.documentElement.lang = next;
    document.documentElement.dir = next === 'ar' ? 'rtl' : 'ltr';
    const toggle = document.getElementById('r3LangToggle');
    if (toggle) toggle.textContent = next === 'ar' ? 'EN' : 'ع';
    renderNav(); renderModule();
  };
  R3.boot = function boot() {
    activeModule = modules[0];
    activeResource = activeModule && activeModule.resources ? activeModule.resources[0] : null;
    renderNav();
    renderModule();
    startRealtime();
    document.getElementById('r3LangToggle')?.addEventListener('click', () => R3.setLang(lang === 'ar' ? 'en' : 'ar'));
    document.getElementById('r3Company')?.addEventListener('change', () => renderModule());
  };
}());
