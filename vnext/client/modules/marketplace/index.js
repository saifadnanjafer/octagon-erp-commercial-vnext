// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R9.4 (proprietary self, not copied)
// R9.4 Pack Manager UI: local marketplace catalog, trusted signer registry,
// and signed-package import. Custom-rendered because packs are not a plain
// R3 CRUD resource — every verification, compatibility, entitlement, and
// lifecycle decision is computed and enforced entirely server-side; this
// module only renders what the API returns and never decides authorization,
// entitlement, or trust itself.
window.OctagonR3.register({
  key: 'marketplace',
  label: { ar: 'المتجر وتوزيع الحزم', en: 'Marketplace & Packs' },
  resources: [],
  customRender(host, ctx) {
    const { api, esc } = ctx;
    const lang = ctx.lang;
    const T = (ar, en) => (lang === 'ar' ? ar : en);
    let tab = 'catalog';
    let catalog = [];
    let signers = [];
    let selectedId = null;
    let importText = '';
    let importResult = null;

    function statusNode(message, kind) {
      return `<p class="${kind}">${esc(message)}</p>`;
    }

    function chip(value, extraClass) {
      return `<span class="chip chip-${esc(extraClass || value)}">${esc(value)}</span>`;
    }

    function render() {
      host.innerHTML = `
        <div class="tabs">
          <button class="tab ${tab === 'catalog' ? 'active' : ''}" data-tab="catalog">${T('الكتالوج', 'Catalog')}</button>
          <button class="tab ${tab === 'signers' ? 'active' : ''}" data-tab="signers">${T('الموقّعون الموثوقون', 'Trusted Signers')}</button>
          <button class="tab ${tab === 'import' ? 'active' : ''}" data-tab="import">${T('استيراد حزمة', 'Import Package')}</button>
        </div>
        <div id="mktHost"></div>`;
      host.querySelectorAll('.tab[data-tab]').forEach((button) => button.addEventListener('click', () => { tab = button.dataset.tab; selectedId = null; importResult = null; render(); }));
      if (tab === 'catalog') renderCatalog();
      else if (tab === 'signers') renderSigners();
      else renderImport();
    }

    // ---------- Catalog ----------

    async function renderCatalog() {
      const mount = host.querySelector('#mktHost');
      mount.innerHTML = `<div class="toolbar"><button id="mktRefresh">${T('تحديث', 'Refresh')}</button><span id="mktCount" class="count"></span></div><div id="mktList" class="list"><p class="loading">${T('جاري التحميل…', 'Loading…')}</p></div><div id="mktDrawer" class="drawer" hidden></div>`;
      mount.querySelector('#mktRefresh').addEventListener('click', () => loadCatalog(true));
      await loadCatalog(true);
    }

    async function loadCatalog(reload) {
      const list = host.querySelector('#mktList');
      if (!list) return;
      try {
        if (reload) catalog = await api('/api/x/marketplace/catalog');
        host.querySelector('#mktCount').textContent = `${catalog.length} ${T('حزمة', 'packs')}`;
        if (!catalog.length) { list.innerHTML = `<p class="empty">${T('لا توجد حزم بعد — استخدم تبويب الاستيراد', 'No packs yet — use the Import tab')}</p>`; return; }
        list.innerHTML = `<table><thead><tr>
            <th>${T('المعرّف', 'Pack ID')}</th><th>${T('الإصدار', 'Version')}</th><th>${T('الحالة', 'State')}</th>
            <th>${T('الموقّع', 'Signer')}</th><th>${T('الترخيص', 'Entitlement')}</th></tr></thead>
          <tbody>${catalog.map((row, i) => `<tr data-index="${i}">
              <td>${esc(row.pack_id)}</td><td>${esc(row.version)}</td><td>${chip(row.lifecycle_state)}</td>
              <td>${esc(row.signer_id || '—')}</td><td>${chip(row.entitlement_state)}</td>
            </tr>`).join('')}</tbody></table>`;
        list.querySelectorAll('tr[data-index]').forEach((tr) => tr.addEventListener('click', () => { selectedId = catalog[Number(tr.dataset.index)].id; openDetail(); }));
      } catch (error) {
        list.innerHTML = statusNode(error.message, error.kind === 'unauthorized' ? 'unauthorized' : error.kind === 'forbidden' ? 'forbidden' : 'error');
      }
    }

    function actionButtons(row) {
      const buttons = [];
      if (row.state === 'verified') {
        buttons.push(`<button class="action" data-action="preview">${T('معاينة التثبيت', 'Preview install')}</button>`);
        if (row.lifecycle_state === 'installable') {
          const installedSibling = catalog.find((r) => r.pack_id === row.pack_id && r.state === 'installed');
          buttons.push(`<button class="action primary" data-action="${installedSibling ? 'upgrade' : 'install'}">${installedSibling ? T('ترقية', 'Upgrade') : T('تثبيت', 'Install')}</button>`);
        }
      } else if (row.state === 'installed') {
        buttons.push(`<button class="action" data-action="disable">${T('تعطيل', 'Disable')}</button>`);
        buttons.push(`<button class="action" data-action="uninstall">${T('إلغاء التثبيت', 'Uninstall')}</button>`);
      } else if (row.state === 'disabled') {
        buttons.push(`<button class="action primary" data-action="enable">${T('تفعيل', 'Enable')}</button>`);
        buttons.push(`<button class="action" data-action="uninstall">${T('إلغاء التثبيت', 'Uninstall')}</button>`);
      }
      return buttons.join('');
    }

    function openDetail() {
      const row = catalog.find((r) => r.id === selectedId);
      const drawer = host.querySelector('#mktDrawer');
      if (!row) { drawer.hidden = true; return; }
      drawer.hidden = false;
      const deps = (row.dependencies || []).map((d) => `${esc(d.pack_id)} ${esc(d.min_version || '')}${d.max_version ? '–' + esc(d.max_version) : ''}`).join(', ') || T('لا توجد', 'none');
      const conflicts = (row.conflicts || []).join(', ') || T('لا توجد', 'none');
      const compatBlock = row.compatibility && !row.compatibility.compatible
        ? `<div class="panel"><h4>${T('أسباب عدم التوافق', 'Incompatibility reasons')}</h4>${row.compatibility.reasons.map((r) => `<div class="history-item">${chip(r.code, 'rejected')} ${esc(r.message)}</div>`).join('')}</div>` : '';
      const rejectionBlock = row.state === 'rejected'
        ? `<div class="panel"><h4>${T('سبب الرفض', 'Rejection reason')}</h4><p class="error">${chip(row.rejection_code, 'rejected')} ${esc(row.rejection_reason)}</p></div>` : '';
      const supersededBlock = row.state === 'superseded'
        ? `<p class="empty">${T('تم استبدال هذا الإصدار بإصدار أحدث مثبَّت', 'This version was superseded by a newer installed version')}</p>` : '';
      drawer.innerHTML = `<div class="drawer-head"><strong>${esc(row.manifest?.name || row.pack_id)} — ${esc(row.version)}</strong>${chip(row.lifecycle_state)}<button id="mktDrawerClose">${T('إغلاق', 'Close')}</button></div>
        <dl class="fields">
          <dt>${T('الوصف', 'Description')}</dt><dd>${esc(row.manifest?.description || '—')}</dd>
          <dt>${T('الإصدار المطلوب', 'Edition required')}</dt><dd>${esc(row.edition_required)}</dd>
          <dt>${T('بصمة التوقيع', 'Signer fingerprint')}</dt><dd>${esc((row.signer_fingerprint || '').slice(0, 16))}…</dd>
          <dt>${T('التبعيات', 'Dependencies')}</dt><dd>${esc(deps)}</dd>
          <dt>${T('التعارضات', 'Conflicts')}</dt><dd>${esc(conflicts)}</dd>
        </dl>
        ${compatBlock}${rejectionBlock}${supersededBlock}
        <div class="actions"><span>${T('إجراءات', 'Actions')}:</span>${actionButtons(row)}</div>
        <p id="mktDrawerError" class="error" hidden></p>`;
      drawer.querySelector('#mktDrawerClose').addEventListener('click', () => { drawer.hidden = true; selectedId = null; });
      drawer.querySelectorAll('.action').forEach((button) => button.addEventListener('click', () => runAction(row, button.dataset.action)));
    }

    async function runAction(row, action) {
      const errorNode = host.querySelector('#mktDrawerError');
      try {
        if (action === 'preview') {
          const preview = await api(`/api/x/marketplace/catalog/${encodeURIComponent(row.id)}/preview`, { method: 'POST', body: JSON.stringify({}) });
          errorNode.hidden = false; errorNode.className = preview.compatible ? 'empty' : 'error';
          errorNode.textContent = preview.compatible ? T('متوافق — جاهز للتثبيت', 'Compatible — ready to install') : preview.reasons.map((r) => r.message).join(' | ');
          return;
        }
        await api(`/api/x/marketplace/catalog/${encodeURIComponent(row.id)}/${action}`, { method: 'POST', body: JSON.stringify({}) });
        selectedId = null;
        await loadCatalog(true);
      } catch (error) {
        errorNode.hidden = false; errorNode.className = 'error'; errorNode.textContent = error.message;
      }
    }

    // ---------- Trusted signers ----------

    async function renderSigners() {
      const mount = host.querySelector('#mktHost');
      mount.innerHTML = `<div class="toolbar"><button id="mktSignerRefresh">${T('تحديث', 'Refresh')}</button></div>
        <div id="mktSignerList" class="list"><p class="loading">${T('جاري التحميل…', 'Loading…')}</p></div>
        <div class="drawer">
          <h4>${T('تسجيل موقّع جديد', 'Register a new signer')}</h4>
          <form id="mktSignerForm" class="form">
            <label>${T('معرّف الموقّع', 'Signer ID')}<input name="signer_id" required></label>
            <label>${T('المفتاح العام (Ed25519 hex)', 'Public key (Ed25519 hex)')}<input name="public_key" required></label>
            <label>${T('اسم الناشر', 'Publisher name')}<input name="publisher_name"></label>
            <label>${T('صالح حتى (اختياري)', 'Valid until (optional)')}<input name="valid_to" type="date"></label>
            <div class="form-buttons"><button type="submit" class="primary">${T('تسجيل', 'Register')}</button></div>
            <p id="mktSignerError" class="error" hidden></p>
          </form>
        </div>`;
      mount.querySelector('#mktSignerRefresh').addEventListener('click', loadSigners);
      mount.querySelector('#mktSignerForm').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(event.target);
        const errorNode = mount.querySelector('#mktSignerError');
        try {
          await api('/api/x/marketplace/signers', {
            method: 'POST',
            body: JSON.stringify({ signer_id: form.get('signer_id'), public_key: form.get('public_key'), publisher_name: form.get('publisher_name') || undefined, valid_to: form.get('valid_to') ? new Date(form.get('valid_to')).toISOString() : undefined }),
          });
          event.target.reset();
          errorNode.hidden = true;
          await loadSigners();
        } catch (error) { errorNode.hidden = false; errorNode.textContent = error.message; }
      });
      await loadSigners();
    }

    async function loadSigners() {
      const list = host.querySelector('#mktSignerList');
      if (!list) return;
      try {
        signers = await api('/api/x/marketplace/signers');
        if (!signers.length) { list.innerHTML = `<p class="empty">${T('لا يوجد موقّعون بعد', 'No signers yet')}</p>`; return; }
        list.innerHTML = `<table><thead><tr><th>${T('المعرّف', 'Signer ID')}</th><th>${T('الناشر', 'Publisher')}</th><th>${T('البصمة', 'Fingerprint')}</th><th>${T('الحالة', 'Status')}</th><th>${T('صالح حتى', 'Valid to')}</th><th></th></tr></thead>
          <tbody>${signers.map((s) => `<tr>
              <td>${esc(s.signer_id)}</td><td>${esc(s.publisher_name || '—')}</td><td>${esc((s.key_fingerprint || '').slice(0, 12))}…</td>
              <td>${chip(s.status)}</td><td>${esc(s.valid_to || '—')}</td>
              <td>${s.status === 'active' ? `<button class="action" data-revoke="${esc(s.signer_id)}">${T('إلغاء', 'Revoke')}</button>` : ''}</td>
            </tr>`).join('')}</tbody></table>`;
        list.querySelectorAll('[data-revoke]').forEach((button) => button.addEventListener('click', async () => {
          try { await api(`/api/x/marketplace/signers/${encodeURIComponent(button.dataset.revoke)}/revoke`, { method: 'POST', body: JSON.stringify({ reason: 'revoked from Pack Manager UI' }) }); await loadSigners(); }
          catch (error) { list.insertAdjacentHTML('afterbegin', statusNode(error.message, 'error')); }
        }));
      } catch (error) {
        list.innerHTML = statusNode(error.message, error.kind === 'unauthorized' ? 'unauthorized' : error.kind === 'forbidden' ? 'forbidden' : 'error');
      }
    }

    // ---------- Import ----------

    function renderImport() {
      const mount = host.querySelector('#mktHost');
      mount.innerHTML = `<div class="drawer">
          <h4>${T('استيراد حزمة موقّعة (.octapack)', 'Import a signed package (.octapack)')}</h4>
          <label>${T('اختر ملف الحزمة', 'Choose package file')}<input id="mktFile" type="file" accept=".octapack,.json"></label>
          <label>${T('أو الصق محتوى JSON', 'or paste JSON content')}<textarea id="mktPaste" rows="6" placeholder="{...}"></textarea></label>
          <div class="form-buttons"><button id="mktImportBtn" class="primary">${T('تحقق وأضف إلى الكتالوج', 'Verify & add to catalog')}</button></div>
          <div id="mktImportResult"></div>
        </div>`;
      const fileInput = mount.querySelector('#mktFile');
      const pasteArea = mount.querySelector('#mktPaste');
      pasteArea.value = importText;
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { pasteArea.value = String(reader.result || ''); importText = pasteArea.value; };
        reader.readAsText(file);
      });
      pasteArea.addEventListener('input', () => { importText = pasteArea.value; });
      mount.querySelector('#mktImportBtn').addEventListener('click', async () => {
        const resultNode = mount.querySelector('#mktImportResult');
        let parsed;
        try { parsed = JSON.parse(pasteArea.value || '{}'); }
        catch (_) { resultNode.innerHTML = statusNode(T('محتوى JSON غير صالح', 'Invalid JSON content'), 'error'); return; }
        try {
          importResult = await api('/api/x/marketplace/import', { method: 'POST', body: JSON.stringify(parsed) });
          resultNode.innerHTML = importResult.state === 'rejected'
            ? statusNode(`${T('مرفوضة', 'Rejected')}: ${importResult.rejection_code} — ${importResult.rejection_reason}`, 'error')
            : statusNode(`${T('تم التحقق', 'Verified')}: ${importResult.pack_id} v${importResult.version} (${importResult.lifecycle_state})`, 'empty');
        } catch (error) {
          resultNode.innerHTML = statusNode(error.message, error.kind === 'unauthorized' ? 'unauthorized' : error.kind === 'forbidden' ? 'forbidden' : 'error');
        }
      });
      if (importResult) {
        const resultNode = mount.querySelector('#mktImportResult');
        resultNode.innerHTML = importResult.state === 'rejected'
          ? statusNode(`${T('مرفوضة', 'Rejected')}: ${importResult.rejection_code} — ${importResult.rejection_reason}`, 'error')
          : statusNode(`${T('تم التحقق', 'Verified')}: ${importResult.pack_id} v${importResult.version} (${importResult.lifecycle_state})`, 'empty');
      }
    }

    render();
  },
});
