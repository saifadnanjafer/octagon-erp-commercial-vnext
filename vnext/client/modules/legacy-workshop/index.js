// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';
// Live read-only legacy workshop bridge surface over the sanitized fixture.
// Custom-rendered because it is NOT a VNext entity: it reads the frozen legacy
// collections, shows the read-only badge, source id, timestamp, and fingerprint,
// and exposes no create/edit/state controls.
window.OctagonR3.register({
  key: 'legacy-workshop',
  label: { ar: 'الورشة القديمة (قراءة فقط)', en: 'Legacy workshop (read-only)' },
  resources: [],
  customRender(host, ctx) {
    const { api, esc } = ctx;
    const lang = ctx.lang;
    const T = (ar, en) => (lang === 'ar' ? ar : en);
    host.innerHTML = `<div class="legacy-head">
        <span class="badge-readonly">${T('للقراءة فقط — نظام قديم', 'READ-ONLY — legacy source')}</span>
        <span id="legacyMeta" class="legacy-meta"></span>
      </div>
      <div class="toolbar">
        <select id="legacyCollection"></select>
        <input id="legacySearch" type="search" placeholder="${T('بحث…', 'Search…')}">
        <button id="legacyReload">${T('تحديث', 'Refresh')}</button>
        <button id="legacyVerify">${T('تحقق البصمة', 'Verify fingerprint')}</button>
        <span id="legacyCount" class="count"></span>
      </div>
      <div id="legacyList" class="list"><p class="loading">${T('جاري التحميل…', 'Loading…')}</p></div>`;
    const select = host.querySelector('#legacyCollection');
    const list = host.querySelector('#legacyList');
    const meta = host.querySelector('#legacyMeta');
    let collections = [];

    async function loadMeta() {
      try {
        const info = await api('/api/x/r3/legacy-workshop');
        collections = info.collections;
        select.innerHTML = collections.map((entry) => `<option value="${esc(entry.collection)}">${esc(entry.collection)} (${entry.count})</option>`).join('');
        meta.textContent = `${info.source_file} · ${info.loaded_at}`;
        await loadList();
      } catch (error) { list.innerHTML = `<p class="error">${esc(error.message)}</p>`; }
    }
    async function loadList() {
      const collection = select.value || (collections[0] && collections[0].collection);
      if (!collection) return;
      const term = host.querySelector('#legacySearch').value.trim();
      list.innerHTML = `<p class="loading">…</p>`;
      try {
        const data = await api(`/api/x/r3/legacy-workshop/${encodeURIComponent(collection)}?search=${encodeURIComponent(term)}&limit=50`);
        host.querySelector('#legacyCount').textContent = `${data.total} · ${data.source_fingerprint.slice(0, 12)}`;
        if (!data.rows.length) { list.innerHTML = `<p class="empty">${T('لا توجد سجلات', 'No records')}</p>`; return; }
        const keys = [...new Set(data.rows.flatMap((row) => Object.keys(row.attributes)))].slice(0, 5);
        list.innerHTML = `<table><thead><tr><th>legacy_id</th>${keys.map((key) => `<th>${esc(key)}</th>`).join('')}<th>source</th></tr></thead>
          <tbody>${data.rows.map((row) => `<tr><td>${esc(row.legacy_id)}</td>${keys.map((key) => `<td>${esc(row.attributes[key])}</td>`).join('')}<td><span class="chip">${esc(row.source)}</span></td></tr>`).join('')}</tbody></table>`;
      } catch (error) { list.innerHTML = `<p class="error">${esc(error.message)}</p>`; }
    }
    host.querySelector('#legacyReload').addEventListener('click', loadMeta);
    host.querySelector('#legacyVerify').addEventListener('click', async () => {
      try { const rows = await api('/api/x/r3/legacy-workshop/verify-fingerprints'); meta.textContent = rows.map((row) => `${row.collection}:${row.fingerprint.slice(0, 8)}`).join('  '); }
      catch (error) { meta.textContent = error.message; }
    });
    select.addEventListener('change', loadList);
    host.querySelector('#legacySearch').addEventListener('change', loadList);
    loadMeta();
  },
});
