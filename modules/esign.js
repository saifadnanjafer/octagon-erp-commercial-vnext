/**
 * OCTAGON ERP — e-Signature Center (التوقيع الإلكتروني).
 *
 * A unified electronic-signature surface the system lacked: create a signature
 * request for any document (contract, quote, work order, HR doc), send it, then
 * sign it digitally — drawn on a signature pad OR typed — with consent and a full
 * audit trail. Status workflow: draft → sent → viewed → signed | declined | voided
 * (auto-expires past due date).
 *
 * ADD-ONLY. Data lives in omni.esign = { requests, templates, settings }.
 * Each record carries company context when an active company is available.
 * No confirm()/prompt() — inline forms + signature pad only (headless-safe;
 * the typed-signature path is fully testable without canvas input).
 */
(function () {
  'use strict';

  let activeView = 'overview';        // overview | requests | sign | templates
  let listStatusFilter = 'all';
  let signingId = null;               // request currently open in the sign view
  let signMode = 'draw';              // draw | type
  let padState = { drawing: false, dirty: false, last: null };

  /* ───────── helpers ───────── */
  function O() {
    try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {}
    if (!window.omni || typeof window.omni !== 'object') window.omni = {};
    return window.omni;
  }
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function todayISO() {
    if (typeof window.todayISO === 'function') { try { return window.todayISO(); } catch (_) {} }
    return new Date().toISOString().slice(0, 10);
  }
  function addDaysISO(iso, n) { const d = new Date((iso || todayISO()) + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix || 'esn'); } catch (_) {} }
    return (prefix || 'esn') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function save() { if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} } }
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); } catch (_) {} } }
  function currentUserName() {
    try { return window.PentagonAuth?.getCurrentUser?.()?.name || window.PentagonAuth?.currentUser?.name || 'system'; } catch (_) { return 'system'; }
  }
  function activeProfile() {
    try { if (typeof window.getActiveOrgProfile === 'function') return window.getActiveOrgProfile() || {}; } catch (_) {}
    const org = O().adminSettings?.organization || {};
    const companies = Array.isArray(org.companies) ? org.companies : [];
    const co = companies.find(c => c.id === org.activeCompanyId) || companies.find(c => c.isPrimary) || companies[0] || {};
    return { companyId: co.id || org.activeCompanyId || '', companyName: co.name || org.name || '' };
  }
  function stamp(rec) {
    try { if (window.TenantService?.stamp) return window.TenantService.stamp(rec, { collection: 'omni.esign' }); } catch (_) {}
    const p = activeProfile();
    if (p.companyId && !rec.companyId) { rec.companyId = p.companyId; rec.companyName = p.companyName || ''; }
    return rec;
  }

  /* ───────── model ───────── */
  const DOC_TYPES = [
    { key: 'contract', label: 'عقد', icon: 'fa-file-contract' },
    { key: 'quote', label: 'عرض سعر', icon: 'fa-file-invoice-dollar' },
    { key: 'work_order', label: 'أمر عمل', icon: 'fa-screwdriver-wrench' },
    { key: 'hr', label: 'مستند موارد بشرية', icon: 'fa-id-badge' },
    { key: 'delivery', label: 'إثبات استلام', icon: 'fa-truck-ramp-box' },
    { key: 'other', label: 'مستند آخر', icon: 'fa-file-lines' }
  ];
  function docTypeMeta(k) { return DOC_TYPES.find(t => t.key === k) || DOC_TYPES[DOC_TYPES.length - 1]; }

  const STATUSES = [
    { key: 'draft', label: 'مسودة', cls: 'draft' },
    { key: 'sent', label: 'مُرسل', cls: 'sent' },
    { key: 'viewed', label: 'تمت المشاهدة', cls: 'viewed' },
    { key: 'signed', label: 'موقّع', cls: 'signed' },
    { key: 'declined', label: 'مرفوض', cls: 'declined' },
    { key: 'voided', label: 'ملغى', cls: 'voided' },
    { key: 'expired', label: 'منتهي', cls: 'expired' }
  ];
  function statusMeta(k) { return STATUSES.find(s => s.key === k) || STATUSES[0]; }
  const OPEN_STATUSES = ['sent', 'viewed'];

  function ensureData() {
    const o = O();
    if (!o.esign || typeof o.esign !== 'object') o.esign = {};
    const e = o.esign;
    if (!Array.isArray(e.requests)) e.requests = [];
    if (!Array.isArray(e.templates)) e.templates = [];
    if (!e.settings || typeof e.settings !== 'object') e.settings = {};
    if (e.settings.expiryDays == null) e.settings.expiryDays = 14;

    if (!e.templates.length) {
      [
        { title: 'اتفاقية صيانة سنوية', docType: 'contract' },
        { title: 'عرض سعر معتمد', docType: 'quote' },
        { title: 'إقرار استلام عُهدة', docType: 'hr' }
      ].forEach(t => e.templates.push(stamp({ id: uid('tpl'), title: t.title, docType: t.docType, body: '', createdAt: new Date().toISOString() })));
    }
    if (!e.requests.length && !e._seeded) {
      e._seeded = true;
      const r1 = stamp({ id: uid('esn'), title: 'اتفاقية صيانة - شركة الرافدين', docType: 'contract', docRef: '', signerName: 'مدير شركة الرافدين', signerContact: '07700000000', status: 'sent', dueDate: addDaysISO(todayISO(), 14), fields: '', createdAt: new Date().toISOString(), sentAt: new Date().toISOString(), createdBy: 'system', auditTrail: [{ event: 'created', at: new Date().toISOString(), by: 'system' }, { event: 'sent', at: new Date().toISOString(), by: 'system' }] });
      const r2 = stamp({ id: uid('esn'), title: 'إقرار استلام عُهدة - موظف جديد', docType: 'hr', docRef: '', signerName: 'علي حسن', signerContact: '', status: 'draft', dueDate: addDaysISO(todayISO(), 7), fields: '', createdAt: new Date().toISOString(), createdBy: 'system', auditTrail: [{ event: 'created', at: new Date().toISOString(), by: 'system' }] });
      e.requests.push(r1, r2);
    }
    expireOverdue();
  }
  function E() { ensureData(); return O().esign; }
  function reqById(id) { return E().requests.find(r => r.id === id); }
  function expireOverdue() {
    const e = O().esign;
    if (!e) return;
    const today = todayISO();
    e.requests.forEach(r => {
      if (OPEN_STATUSES.includes(r.status) && r.dueDate && r.dueDate < today) {
        r.status = 'expired';
        (r.auditTrail = r.auditTrail || []).push({ event: 'expired', at: new Date().toISOString(), by: 'system' });
      }
    });
  }
  function audit(r, event, extra) {
    (r.auditTrail = r.auditTrail || []).push(Object.assign({ event, at: new Date().toISOString(), by: currentUserName() }, extra || {}));
  }

  /* ───────── KPIs ───────── */
  function kpis() {
    const e = E();
    const month = todayISO().slice(0, 7);
    const pending = e.requests.filter(r => OPEN_STATUSES.includes(r.status)).length;
    const drafts = e.requests.filter(r => r.status === 'draft').length;
    const signedMonth = e.requests.filter(r => r.status === 'signed' && String(r.signedAt || '').slice(0, 7) === month).length;
    const declined = e.requests.filter(r => r.status === 'declined').length;
    const closed = e.requests.filter(r => ['signed', 'declined'].includes(r.status));
    const completion = closed.length ? Math.round((closed.filter(r => r.status === 'signed').length / closed.length) * 100) : 0;
    const turnarounds = e.requests.filter(r => r.status === 'signed' && r.sentAt && r.signedAt)
      .map(r => Math.max(0, daysBetween(String(r.sentAt).slice(0, 10), String(r.signedAt).slice(0, 10))));
    const avgTurn = turnarounds.length ? Math.round((turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) * 10) / 10 : 0;
    return { pending, drafts, signedMonth, declined, completion, avgTurn, total: e.requests.length };
  }

  /* ───────── render ───────── */
  function kpiStrip() {
    const k = kpis();
    const card = (icon, color, value, label) =>
      '<div class="esn-kpi"><div class="esn-kpi-icon" style="background:' + color + '22;color:' + color + '"><i class="fa-solid ' + icon + '"></i></div>'
      + '<div class="esn-kpi-info"><span class="esn-kpi-value">' + esc(value) + '</span><span class="esn-kpi-label">' + esc(label) + '</span></div></div>';
    return '<div class="esn-kpi-strip">'
      + card('fa-hourglass-half', '#facc15', k.pending, 'بانتظار التوقيع')
      + card('fa-pen-ruler', '#94a3b8', k.drafts, 'مسودات')
      + card('fa-circle-check', '#34d399', k.signedMonth, 'موقّعة هذا الشهر')
      + card('fa-circle-xmark', '#f87171', k.declined, 'مرفوضة')
      + card('fa-percent', '#38bdf8', k.completion + '%', 'نسبة الإكمال')
      + card('fa-clock-rotate-left', '#a855f7', k.avgTurn + ' ي', 'متوسط زمن التوقيع')
      + '</div>';
  }

  function toolbar() {
    const tab = (key, icon, label) =>
      '<button class="esn-tab ' + (activeView === key ? 'active' : '') + '" onclick="esnSetView(\'' + key + '\')"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
    return '<div class="esn-tabs">'
      + tab('overview', 'fa-gauge', 'نظرة عامة')
      + tab('requests', 'fa-file-signature', 'طلبات التوقيع')
      + tab('templates', 'fa-layer-group', 'القوالب')
      + '</div>';
  }

  function statusActions(r) {
    const b = (fn, label, danger) => '<button class="esn-mini' + (danger ? ' danger' : '') + '" onclick="' + fn + '(\'' + r.id + '\')">' + label + '</button>';
    let out = '';
    if (r.status === 'draft') out += b('esnSend', 'إرسال');
    if (OPEN_STATUSES.includes(r.status)) {
      out += '<button class="esn-mini primary" onclick="esnOpenSign(\'' + r.id + '\')">توقيع</button>';
      out += b('esnRemind', 'تذكير');
      out += b('esnDecline', 'رفض', true);
    }
    if (['draft', 'sent', 'viewed'].includes(r.status)) out += b('esnVoid', 'إلغاء', true);
    if (r.status === 'signed') out += '<button class="esn-mini" onclick="esnOpenSign(\'' + r.id + '\')">عرض</button>';
    return '<div class="esn-mini-row">' + out + '</div>';
  }

  function requestRow(r) {
    const dt = docTypeMeta(r.docType);
    const sm = statusMeta(r.status);
    const due = r.dueDate ? '<span class="esn-sub">استحقاق: ' + esc(r.dueDate) + '</span>' : '';
    return '<tr><td>' + esc(r.title) + (r.docRef ? '<span class="esn-sub">مرجع: ' + esc(r.docRef) + '</span>' : '') + '</td>'
      + '<td><i class="fa-solid ' + dt.icon + '"></i> ' + esc(dt.label) + '</td>'
      + '<td>' + esc(r.signerName || '—') + (r.signerContact ? '<span class="esn-sub">' + esc(r.signerContact) + '</span>' : '') + '</td>'
      + '<td><span class="esn-badge ' + sm.cls + '">' + esc(sm.label) + '</span>' + due + '</td>'
      + '<td>' + statusActions(r) + '</td></tr>';
  }

  function requestsTable(rows) {
    const body = rows.length ? rows.map(requestRow).join('') : '<tr><td colspan="5" class="esn-empty-row">لا توجد طلبات مطابقة</td></tr>';
    return '<table class="esn-table"><thead><tr><th>المستند</th><th>النوع</th><th>الموقِّع</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function overviewView() {
    const e = E();
    const pending = e.requests.filter(r => OPEN_STATUSES.includes(r.status))
      .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
    return '<div class="esn-panel"><div class="esn-panel-head"><h3><i class="fa-solid fa-hourglass-half"></i> بانتظار التوقيع</h3>'
      + '<button class="esn-btn" onclick="esnSetView(\'requests\')">كل الطلبات</button></div>'
      + requestsTable(pending.slice(0, 8)) + '</div>'
      + createForm();
  }

  function createForm() {
    const e = E();
    const docOpts = DOC_TYPES.map(t => '<option value="' + t.key + '">' + t.label + '</option>').join('');
    const tplOpts = '<option value="">— بدون قالب —</option>' + e.templates.map(t => '<option value="' + esc(t.id) + '">' + esc(t.title) + '</option>').join('');
    return '<div class="esn-panel esn-add"><h3><i class="fa-solid fa-plus"></i> طلب توقيع جديد</h3>'
      + '<div class="esn-form-grid">'
      + '<label>القالب (اختياري)<select id="esnF_tpl" onchange="esnApplyTemplate(this.value)">' + tplOpts + '</select></label>'
      + '<label>عنوان المستند<input type="text" id="esnF_title" placeholder="مثال: اتفاقية صيانة"></label>'
      + '<label>نوع المستند<select id="esnF_doctype">' + docOpts + '</select></label>'
      + '<label>مرجع المستند<input type="text" id="esnF_ref" placeholder="رقم العقد/الفاتورة (اختياري)"></label>'
      + '<label>اسم الموقِّع<input type="text" id="esnF_signer" placeholder="اسم الشخص"></label>'
      + '<label>وسيلة التواصل<input type="text" id="esnF_contact" placeholder="هاتف/بريد (اختياري)"></label>'
      + '<label>تاريخ الاستحقاق<input type="date" id="esnF_due" value="' + esc(addDaysISO(todayISO(), e.settings.expiryDays)) + '"></label>'
      + '<label class="esn-wide">ملاحظة/بنود<input type="text" id="esnF_fields" placeholder="نص قصير يظهر للموقِّع (اختياري)"></label>'
      + '</div>'
      + '<button class="esn-btn primary" onclick="esnCreate(false)"><i class="fa-solid fa-floppy-disk"></i> حفظ كمسودة</button> '
      + '<button class="esn-btn accent" onclick="esnCreate(true)"><i class="fa-solid fa-paper-plane"></i> حفظ وإرسال</button></div>';
  }

  function requestsView() {
    const e = E();
    const statusOpts = '<option value="all">كل الحالات</option>' + STATUSES.map(s => '<option value="' + s.key + '"' + (listStatusFilter === s.key ? ' selected' : '') + '>' + s.label + '</option>').join('');
    let rows = e.requests.slice();
    if (listStatusFilter !== 'all') rows = rows.filter(r => r.status === listStatusFilter);
    rows.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
    return '<div class="esn-panel"><div class="esn-list-filters"><label>الحالة<select onchange="esnSetStatusFilter(this.value)">' + statusOpts + '</select></label>'
      + '<span class="esn-list-count">' + rows.length + ' طلب</span></div>'
      + requestsTable(rows) + '</div>'
      + createForm();
  }

  function templatesView() {
    const e = E();
    const rows = e.templates.map(t => {
      const dt = docTypeMeta(t.docType);
      return '<tr><td>' + esc(t.title) + '</td><td><i class="fa-solid ' + dt.icon + '"></i> ' + esc(dt.label) + '</td>'
        + '<td><button class="esn-mini primary" onclick="esnUseTemplate(\'' + t.id + '\')">إنشاء طلب</button>'
        + '<button class="esn-mini danger" onclick="esnDeleteTemplate(\'' + t.id + '\')">حذف</button></td></tr>';
    }).join('') || '<tr><td colspan="3" class="esn-empty-row">لا توجد قوالب</td></tr>';
    const docOpts = DOC_TYPES.map(t => '<option value="' + t.key + '">' + t.label + '</option>').join('');
    return '<div class="esn-panel"><table class="esn-table"><thead><tr><th>القالب</th><th>النوع</th><th>إجراءات</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      + '<div class="esn-panel esn-add"><h3><i class="fa-solid fa-plus"></i> قالب جديد</h3>'
      + '<div class="esn-form-grid">'
      + '<label>العنوان<input type="text" id="esnT_title" placeholder="اسم القالب"></label>'
      + '<label>النوع<select id="esnT_doctype">' + docOpts + '</select></label>'
      + '</div>'
      + '<button class="esn-btn primary" onclick="esnCreateTemplate()"><i class="fa-solid fa-plus"></i> إضافة القالب</button></div>';
  }

  function signView() {
    const r = reqById(signingId);
    if (!r) { activeView = 'requests'; return requestsView(); }
    const dt = docTypeMeta(r.docType);
    const sm = statusMeta(r.status);
    const done = r.status === 'signed';
    const auditRows = (r.auditTrail || []).slice().reverse().map(a =>
      '<li><span class="esn-audit-ev">' + esc(eventLabel(a.event)) + '</span><span class="esn-audit-meta">' + esc(String(a.at).replace('T', ' ').slice(0, 16)) + ' · ' + esc(a.by || '') + '</span></li>').join('');

    let signArea = '';
    if (done) {
      signArea = '<div class="esn-signed-box"><div class="esn-signed-head"><i class="fa-solid fa-circle-check"></i> تم التوقيع</div>'
        + (r.signatureType === 'drawn' && r.signatureData ? '<img class="esn-sign-img" src="' + esc(r.signatureData) + '" alt="signature">'
          : '<div class="esn-sign-typed">' + esc(r.signatureData || r.signerName) + '</div>')
        + '<div class="esn-signed-meta">الموقِّع: ' + esc(r.signedBy || r.signerName) + ' · ' + esc(String(r.signedAt || '').replace('T', ' ').slice(0, 16)) + '</div></div>';
    } else if (OPEN_STATUSES.includes(r.status)) {
      const modeBtn = (m, label) => '<button class="esn-seg ' + (signMode === m ? 'active' : '') + '" onclick="esnSignMode(\'' + m + '\')">' + label + '</button>';
      const pad = signMode === 'draw'
        ? '<div class="esn-pad-wrap"><canvas id="esnPad" class="esn-pad" width="520" height="170"></canvas>'
          + '<button class="esn-mini" onclick="esnClearPad()">🧹 مسح</button></div>'
        : '<div class="esn-form-grid"><label class="esn-wide">اكتب اسمك كتوقيع<input type="text" id="esnTypedName" placeholder="' + esc(r.signerName || 'الاسم الكامل') + '" value="' + esc(r.signerName || '') + '"></label></div>';
      signArea = '<div class="esn-sign-zone">'
        + '<div class="esn-seg-row">' + modeBtn('draw', '✍️ رسم') + modeBtn('type', '⌨️ كتابة') + '</div>'
        + pad
        + '<label class="esn-consent"><input type="checkbox" id="esnConsent"> أوافق على توقيع هذا المستند إلكترونياً وأقرّ بصحة البيانات.</label>'
        + '<div class="esn-sign-actions"><button class="esn-btn accent" onclick="esnSubmitSign()"><i class="fa-solid fa-signature"></i> اعتماد التوقيع</button>'
        + '<button class="esn-btn danger-ghost" onclick="esnDecline(\'' + r.id + '\')">رفض التوقيع</button></div></div>';
    } else {
      signArea = '<div class="esn-empty">هذا الطلب بحالة «' + esc(sm.label) + '» ولا يقبل التوقيع.</div>';
    }

    return '<div class="esn-sign-top"><button class="esn-btn" onclick="esnBackToList()"><i class="fa-solid fa-arrow-right"></i> رجوع</button>'
      + '<span class="esn-badge ' + sm.cls + '">' + esc(sm.label) + '</span></div>'
      + '<div class="esn-sign-grid">'
      + '<div class="esn-doc-card"><div class="esn-doc-head"><i class="fa-solid ' + dt.icon + '"></i> ' + esc(dt.label) + '</div>'
      + '<h2 class="esn-doc-title">' + esc(r.title) + '</h2>'
      + (r.docRef ? '<div class="esn-doc-row"><b>المرجع:</b> ' + esc(r.docRef) + '</div>' : '')
      + '<div class="esn-doc-row"><b>الموقِّع:</b> ' + esc(r.signerName || '—') + '</div>'
      + (r.signerContact ? '<div class="esn-doc-row"><b>التواصل:</b> ' + esc(r.signerContact) + '</div>' : '')
      + (r.dueDate ? '<div class="esn-doc-row"><b>الاستحقاق:</b> ' + esc(r.dueDate) + '</div>' : '')
      + (r.fields ? '<div class="esn-doc-body">' + esc(r.fields) + '</div>' : '')
      + signArea + '</div>'
      + '<aside class="esn-panel esn-audit"><h3><i class="fa-solid fa-clock-rotate-left"></i> مسار التدقيق</h3><ul class="esn-audit-list">' + (auditRows || '<li class="esn-empty-row">لا أحداث</li>') + '</ul></aside>'
      + '</div>';
  }
  function eventLabel(ev) {
    return ({ created: 'تم الإنشاء', sent: 'تم الإرسال', viewed: 'تمت المشاهدة', signed: 'تم التوقيع', declined: 'تم الرفض', voided: 'تم الإلغاء', expired: 'انتهت الصلاحية', reminded: 'تم التذكير' })[ev] || ev;
  }

  function render() {
    ensureData();
    const body = document.getElementById('esignBody');
    if (!body) return;
    let content;
    if (activeView === 'sign') content = signView();
    else if (activeView === 'requests') content = requestsView();
    else if (activeView === 'templates') content = templatesView();
    else content = overviewView();
    const showTabs = activeView !== 'sign';
    body.innerHTML = kpiStrip() + (showTabs ? toolbar() : '') + '<div class="esn-content">' + content + '</div>';
    if (activeView === 'sign' && signMode === 'draw') setTimeout(initPad, 30);
  }

  /* ───────── signature pad ───────── */
  function initPad() {
    const c = document.getElementById('esnPad');
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.strokeStyle = '#f8fafc';
    padState = { drawing: false, dirty: false, last: null, ctx, canvas: c };
    function pos(ev) {
      const rect = c.getBoundingClientRect();
      const t = ev.touches ? ev.touches[0] : ev;
      return { x: (t.clientX - rect.left) * (c.width / rect.width), y: (t.clientY - rect.top) * (c.height / rect.height) };
    }
    function down(ev) { ev.preventDefault(); padState.drawing = true; padState.last = pos(ev); }
    function move(ev) {
      if (!padState.drawing) return;
      ev.preventDefault();
      const p = pos(ev);
      ctx.beginPath(); ctx.moveTo(padState.last.x, padState.last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      padState.last = p; padState.dirty = true;
    }
    function up() { padState.drawing = false; }
    c.onmousedown = down; c.onmousemove = move; c.onmouseup = up; c.onmouseleave = up;
    c.ontouchstart = down; c.ontouchmove = move; c.ontouchend = up;
  }
  window.esnClearPad = function () {
    const c = document.getElementById('esnPad');
    if (c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); padState.dirty = false; }
  };
  window.esnSignMode = function (m) { signMode = m; render(); };

  /* ───────── actions ───────── */
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  window.esnSetView = function (v) { activeView = v; if (v !== 'sign') signingId = null; render(); };
  window.esnSetStatusFilter = function (v) { listStatusFilter = v; render(); };
  window.esnBackToList = function () { signingId = null; activeView = 'requests'; render(); };

  window.esnApplyTemplate = function (id) {
    if (!id) return;
    const t = E().templates.find(x => x.id === id);
    if (!t) return;
    const titleEl = document.getElementById('esnF_title'); if (titleEl && !titleEl.value) titleEl.value = t.title;
    const dtEl = document.getElementById('esnF_doctype'); if (dtEl) dtEl.value = t.docType;
  };

  window.esnCreate = function (sendNow) {
    const title = val('esnF_title');
    if (!title) { toast('أدخل عنوان المستند', 'warning'); return; }
    const e = E();
    const rec = stamp({
      id: uid('esn'), title,
      docType: val('esnF_doctype') || 'other',
      docRef: val('esnF_ref'),
      signerName: val('esnF_signer'),
      signerContact: val('esnF_contact'),
      dueDate: val('esnF_due') || addDaysISO(todayISO(), e.settings.expiryDays),
      fields: val('esnF_fields'),
      status: 'draft',
      createdAt: new Date().toISOString(),
      createdBy: currentUserName(),
      auditTrail: []
    });
    audit(rec, 'created');
    if (sendNow) { rec.status = 'sent'; rec.sentAt = new Date().toISOString(); audit(rec, 'sent'); }
    e.requests.push(rec);
    save();
    activeView = 'requests';
    render();
    toast(sendNow ? 'تم إنشاء الطلب وإرساله ✅' : 'تم حفظ المسودة', 'success');
  };

  window.esnSend = function (id) {
    const r = reqById(id); if (!r || r.status !== 'draft') return;
    r.status = 'sent'; r.sentAt = new Date().toISOString(); audit(r, 'sent');
    save(); render(); toast('تم إرسال الطلب للتوقيع 📤', 'success');
  };
  window.esnRemind = function (id) {
    const r = reqById(id); if (!r) return;
    audit(r, 'reminded'); r.remindedAt = new Date().toISOString();
    save(); toast('تم تسجيل تذكير للموقِّع 🔔', 'info');
  };
  window.esnVoid = function (id) {
    const r = reqById(id); if (!r) return;
    r.status = 'voided'; audit(r, 'voided');
    save(); render(); toast('تم إلغاء الطلب', 'warning');
  };
  window.esnDecline = function (id) {
    const r = reqById(id); if (!r) return;
    r.status = 'declined'; r.declinedAt = new Date().toISOString(); audit(r, 'declined');
    save();
    if (signingId === id) { signingId = null; activeView = 'requests'; }
    render(); toast('تم تسجيل رفض التوقيع', 'warning');
  };

  window.esnOpenSign = function (id) {
    const r = reqById(id); if (!r) return;
    // viewing an open request marks it viewed (audit), like opening a sign link
    if (r.status === 'sent') { r.status = 'viewed'; r.viewedAt = new Date().toISOString(); audit(r, 'viewed'); save(); }
    signingId = id; activeView = 'sign'; signMode = 'draw';
    render();
  };

  window.esnSubmitSign = function () {
    const r = reqById(signingId);
    if (!r) return;
    if (!OPEN_STATUSES.includes(r.status)) { toast('لا يمكن توقيع هذا الطلب', 'danger'); return; }
    const consent = document.getElementById('esnConsent');
    if (!consent || !consent.checked) { toast('يرجى الموافقة على الإقرار أولاً', 'warning'); return; }
    let sigType, sigData, signedBy;
    if (signMode === 'draw') {
      if (!padState.dirty || !padState.canvas) { toast('يرجى رسم التوقيع أولاً', 'warning'); return; }
      sigType = 'drawn'; sigData = padState.canvas.toDataURL('image/png'); signedBy = r.signerName || currentUserName();
    } else {
      const typed = val('esnTypedName');
      if (!typed) { toast('اكتب اسمك كتوقيع', 'warning'); return; }
      sigType = 'typed'; sigData = typed; signedBy = typed;
    }
    r.status = 'signed';
    r.signatureType = sigType;
    r.signatureData = sigData;
    r.signedBy = signedBy;
    r.signedAt = new Date().toISOString();
    audit(r, 'signed', { method: sigType });
    save();
    render();
    toast('تم اعتماد التوقيع بنجاح ✅', 'success');
  };

  window.esnCreateTemplate = function () {
    const title = val('esnT_title');
    if (!title) { toast('أدخل عنوان القالب', 'warning'); return; }
    E().templates.push(stamp({ id: uid('tpl'), title, docType: val('esnT_doctype') || 'other', body: '', createdAt: new Date().toISOString() }));
    save(); render(); toast('تمت إضافة القالب ✅', 'success');
  };
  window.esnDeleteTemplate = function (id) {
    const e = E();
    e.templates = e.templates.filter(t => t.id !== id);
    save(); render(); toast('تم حذف القالب', 'warning');
  };
  window.esnUseTemplate = function (id) {
    const t = E().templates.find(x => x.id === id);
    if (!t) return;
    activeView = 'requests';
    render();
    setTimeout(() => {
      const tt = document.getElementById('esnF_title'); if (tt) { tt.value = t.title; tt.focus(); }
      const dd = document.getElementById('esnF_doctype'); if (dd) dd.value = t.docType;
    }, 40);
    toast('تم تعبئة النموذج من القالب — أكمل البيانات ثم أرسل', 'info');
  };

  /* ───────── navigation wiring ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('esign');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageEsign');
    const nav = document.getElementById('navEsign');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('esign'); } catch (_) {} }
    window.currentPage = 'esign';
    render();
    return !!pg;
  }
  function wireSwitch() {
    if (window.__esignWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'esign') {
        try { if (activatePage()) return; } catch (e) { console.warn('e-Sign render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__esignWrapped = true;
  }
  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools || JarvisBrain.tools.report_esign_today) return;
      JarvisBrain.tools.report_esign_today = {
        desc_en: 'e-Signature summary: pending/signed/declined counts, completion rate, average turnaround, and the pending queue.',
        risk: 'safe',
        params: {},
        run: function () {
          return {
            kpis: kpis(),
            pending: E().requests.filter(r => OPEN_STATUSES.includes(r.status))
              .map(r => ({ title: r.title, signer: r.signerName, status: r.status, due: r.dueDate }))
          };
        }
      };
    } catch (_) {}
  }
  function init() {
    ensureData();
    wireSwitch();
    registerJarvis();
    let tries = 0;
    const t = setInterval(() => {
      tries++;
      wireSwitch();
      registerJarvis();
      if (window.__esignWrapped || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonEsign = {
    ensureData,
    render,
    kpis,
    report: function () { return JarvisBrain?.tools?.report_esign_today?.run?.() || kpis(); },
    open: function () { try { window.switchPage('esign'); } catch (_) {} }
  };
})();
