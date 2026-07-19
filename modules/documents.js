/**
 * OCTAGON ERP — Document Management / DMS (إدارة الوثائق والمستندات).
 *
 * A standard ERP module Octagon had ZERO of (`document_management`/`dms` = 0). A central registry
 * for the business's important documents — licenses, contracts, certificates, permits, policies —
 * with issue/expiry dates and the high-value bit: **expiry alerts** so a trade license or a contract
 * never lapses unnoticed. Metadata-only (no binary upload yet — a file note/link field is provided).
 * Add-only; self-contained in `omni.documents`.
 *
 *  - Documents: title, category, ref number, owner/entity, issuer, issue date, expiry date, status,
 *    tags, file note/link, reminder lead-days.
 *  - Dashboard: total / expiring-soon / expired / by-category + an expiry alert table.
 *  - Jarvis tool: report_documents_today. Every mutation writes an audit event. Archive, never delete.
 *
 * Data namespace: omni.documents = { docs:[] }
 * Page: #pageDocuments (nav data-page="documents"). Add-only.
 */
(function () {
  'use strict';

  function O() { if (typeof omni !== 'undefined' && omni) return omni; if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} } return null; }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function coId() { try { return (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || ''; } catch (_) { return ''; } }
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('documents', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'documents', action, detail, user: userName() }); } catch (_) {}
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function daysFromToday(iso) { return iso ? Math.round((new Date(iso) - new Date(todayISO())) / 86400000) : null; }
  function companyName() {
    try {
      return (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyName : '')
        || O()?.adminSettings?.organization?.companyName
        || 'ورشة أوكتاجون';
    } catch (_) { return 'ورشة أوكتاجون'; }
  }
  function employeeList() {
    try { return Array.isArray(window.employees) ? window.employees : []; } catch (_) { return []; }
  }
  function selectedEmployee() {
    const id = val('docLegalEmployee');
    return employeeList().find(e => String(e.id || e.name) === String(id)) || null;
  }
  function printHtml(title, bodyHtml) {
    const w = window.open('', '_blank');
    if (!w) { toast('تعذر فتح نافذة الطباعة', 'error'); return; }
    w.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>${esc(title)}</title>
      <style>
        @page{size:A4;margin:14mm}
        *{box-sizing:border-box}
        body{font-family:Tajawal,Cairo,Arial,sans-serif;direction:rtl;color:#111827;background:#fff;margin:0;line-height:1.8}
        .sheet{min-height:269mm;padding:8mm}
        .head{text-align:center;border-bottom:2px solid #111827;padding-bottom:10px;margin-bottom:18px}
        .head h1{font-size:22px;margin:0 0 4px}.head p{margin:0;color:#4b5563;font-size:12px}
        .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid #d1d5db;background:#f9fafb;padding:10px;margin-bottom:16px}
        .meta div{font-size:13px}.section{margin:14px 0}.section h2{font-size:15px;margin:0 0 6px;border-bottom:1px solid #d1d5db;padding-bottom:4px}
        ol{padding-right:20px;margin:8px 0} li{margin:5px 0}
        .signatures{display:grid;grid-template-columns:1fr 1fr;gap:36px;margin-top:42px;font-weight:700}
        .sig{border-top:1px solid #111827;padding-top:8px;text-align:center;min-height:42px}
        .note{font-size:11px;color:#6b7280;margin-top:18px;border-top:1px dashed #d1d5db;padding-top:8px}
        .no-print{position:fixed;top:10px;left:10px}.no-print button{padding:8px 14px}
        @media print{.no-print{display:none}.sheet{padding:0}}
      </style></head><body><div class="no-print"><button onclick="window.print()">طباعة</button></div><main class="sheet">${bodyHtml}</main><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
    w.document.close();
  }

  const CATEGORIES = [['license', '📜 إجازة/رخصة'], ['contract', '📝 عقد'], ['certificate', '🏅 شهادة'], ['permit', '✅ تصريح'], ['policy', '🛡️ بوليصة/سياسة'], ['id', '🪪 هوية/وثيقة'], ['other', '📄 أخرى']];
  const CAT_LABEL = Object.fromEntries(CATEGORIES);

  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.documents || typeof o.documents !== 'object') o.documents = {};
    if (!Array.isArray(o.documents.docs)) o.documents.docs = [];
    return o.documents;
  }
  function D() { return ensureData(); }
  function getDocs(all) { let l = (D()?.docs || []).filter(d => all || d.is_active !== false); if (typeof window.scoped === 'function') { try { l = window.scoped(l); } catch (_) {} } return l; }
  function expiryView(d) {
    if (!d.expiryDate) return { has: false };
    const days = daysFromToday(d.expiryDate);
    const lead = Number(d.reminderDays) || 30;
    return { has: true, days, expired: days < 0, soon: days >= 0 && days <= lead, lead };
  }

  function portfolio() {
    const docs = getDocs();
    const alerts = [];
    docs.forEach(d => { const e = expiryView(d); if (e.has && (e.soon || e.expired)) alerts.push({ d, e }); });
    alerts.sort((a, b) => a.e.days - b.e.days);
    return {
      total: docs.length,
      expiringSoon: alerts.filter(a => !a.e.expired).length,
      expired: alerts.filter(a => a.e.expired).length,
      byCategory: CATEGORIES.map(([k, l]) => ({ key: k, label: l, count: docs.filter(d => d.category === k).length })).filter(c => c.count),
      alerts
    };
  }

  let activeTab = 'dashboard', editing = null, search = '', catFilter = '';
  window.docOpenTab = function (t) { activeTab = t; editing = null; render(); };
  window.docSearch = function (v) { search = v; renderRegistry(); };
  window.docCatFilter = function (v) { catFilter = v; renderRegistry(); };
  window.docOpenForm = function (id) { editing = id || 'new'; activeTab = 'registry'; render(); };
  window.docCancelForm = function () { editing = null; render(); };

  window.docSave = function () {
    const dd = D(); if (!dd) return;
    const title = val('docTitle');
    if (!title) { toast('عنوان الوثيقة مطلوب', 'error'); return; }
    const base = {
      title, category: val('docCategory') || 'license', refNumber: val('docRef'),
      owner: val('docOwner'), issuer: val('docIssuer'), issueDate: val('docIssue'),
      expiryDate: val('docExpiry'), reminderDays: Math.max(0, Math.round(numVal('docReminder')) || 30),
      tags: val('docTags'), fileNote: val('docFile'), notes: val('docNotes')
    };
    const ex = editing && editing !== 'new' ? dd.docs.find(d => d.id === editing) : null;
    if (ex) { Object.assign(ex, base); audit('doc_update', `تعديل وثيقة: ${title}`); toast('تم التحديث', 'success'); }
    else { dd.docs.push({ id: uid('doc'), ...base, is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: userName() }); audit('doc_create', `وثيقة جديدة: ${title}`); toast('تمت إضافة الوثيقة', 'success'); }
    save(); editing = null; render();
  };
  window.docArchive = function (id) {
    const d = (D()?.docs || []).find(x => x.id === id); if (!d) return;
    if (!confirm(`أرشفة الوثيقة "${d.title}"؟`)) return;
    d.is_active = false; audit('doc_archive', `أرشفة: ${d.title}`); save(); render();
  };
  window.docLoadDemo = function () {
    const dd = D(); if (!dd) return;
    if (dd.docs.length) { toast('توجد وثائق مسبقاً', 'info'); return; }
    const fwd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    dd.docs.push(
      { id: uid('doc'), title: 'إجازة ممارسة المهنة', category: 'license', refNumber: 'LIC-2024-117', owner: 'الورشة', issuer: 'غرفة التجارة', issueDate: fwd(-330), expiryDate: fwd(20), reminderDays: 30, tags: 'رسمي', fileNote: '', notes: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: 'تجريبي' },
      { id: uid('doc'), title: 'عقد إيجار المحل', category: 'contract', refNumber: 'C-88', owner: 'الإدارة', issuer: 'المالك', issueDate: fwd(-300), expiryDate: fwd(-10), reminderDays: 45, tags: 'إيجار', fileNote: '', notes: 'يحتاج تجديد', is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: 'تجريبي' },
      { id: uid('doc'), title: 'شهادة سلامة المعدات', category: 'certificate', refNumber: 'SAF-22', owner: 'الإنتاج', issuer: 'الدفاع المدني', issueDate: fwd(-60), expiryDate: fwd(200), reminderDays: 30, tags: 'سلامة', fileNote: '', notes: '', is_active: true, companyId: coId(), createdAt: new Date().toISOString(), createdBy: 'تجريبي' }
    );
    audit('doc_demo', 'تحميل وثائق تجريبية');
    save(); toast('تم تحميل بيانات تجريبية', 'success'); render();
  };

  window.docPrintDocument = function (id) {
    const d = (D()?.docs || []).find(x => x.id === id);
    if (!d) return;
    const title = d.title || 'وثيقة';
    printHtml(title, `
      <div class="head"><h1>${esc(title)}</h1><p>${esc(companyName())} - نسخة جاهزة للطباعة</p></div>
      <div class="meta">
        <div><strong>الفئة:</strong> ${esc(CAT_LABEL[d.category] || d.category || '-')}</div>
        <div><strong>الرقم المرجعي:</strong> ${esc(d.refNumber || '-')}</div>
        <div><strong>الجهة المالكة:</strong> ${esc(d.owner || '-')}</div>
        <div><strong>جهة الإصدار:</strong> ${esc(d.issuer || '-')}</div>
        <div><strong>تاريخ الإصدار:</strong> ${esc(d.issueDate || '-')}</div>
        <div><strong>تاريخ الانتهاء:</strong> ${esc(d.expiryDate || '-')}</div>
      </div>
      <div class="section"><h2>الملاحظات والمرفقات</h2><p>${esc(d.notes || 'لا توجد ملاحظات.')}</p><p><strong>ملف/رابط:</strong> ${esc(d.fileNote || '-')}</p></div>
      <div class="signatures"><div class="sig">توقيع الإدارة</div><div class="sig">توقيع الاستلام/المراجعة</div></div>
    `);
  };

  window.docPrintEmployeeContract = function () {
    const emp = selectedEmployee();
    const name = emp?.name || val('docLegalEmployeeName') || '................................';
    const job = val('docLegalJob') || emp?.role || emp?.position || 'عامل/موظف ورشة';
    const salary = val('docLegalSalary') || emp?.salary || emp?.nominalSalary || '................';
    const start = val('docLegalStart') || todayISO();
    printHtml('عقد عمل موظف', `
      <div class="head"><h1>عقد عمل موظف</h1><p>${esc(companyName())}</p></div>
      <div class="meta">
        <div><strong>اسم الموظف:</strong> ${esc(name)}</div>
        <div><strong>المسمى الوظيفي:</strong> ${esc(job)}</div>
        <div><strong>تاريخ المباشرة:</strong> ${esc(start)}</div>
        <div><strong>الأجر الشهري:</strong> ${esc(salary)} د.ع</div>
      </div>
      <div class="section"><h2>بنود العمل</h2><ol>
        <li>يلتزم الموظف بأوقات الدوام والحضور والانصراف المعتمدة في نظام الورشة.</li>
        <li>يلتزم الموظف بتعليمات السلامة، استخدام معدات الوقاية، والمحافظة على أدوات وممتلكات الورشة.</li>
        <li>تحتسب الأجور والإضافي والاستقطاعات حسب سجلات الحضور والسياسة الداخلية المعتمدة.</li>
        <li>أي سلفة أو عهدة أو تلفيات تسجل في النظام وتراجع من الإدارة قبل اعتمادها.</li>
        <li>لا يجوز إفشاء معلومات العملاء أو الأسعار أو ملفات العمل خارج الورشة.</li>
      </ol></div>
      <div class="section"><h2>ملاحظات خاصة</h2><p>${esc(val('docLegalNotes') || 'لا توجد ملاحظات إضافية.')}</p></div>
      <div class="signatures"><div class="sig">توقيع الموظف</div><div class="sig">توقيع الإدارة</div></div>
      <p class="note">هذه مسودة تشغيلية جاهزة للطباعة والمراجعة القانونية المحلية قبل الاعتماد النهائي.</p>
    `);
  };

  window.docPrintCompanyRules = function () {
    printHtml('النظام الداخلي وقواعد الشركة', `
      <div class="head"><h1>النظام الداخلي وقواعد الشركة</h1><p>${esc(companyName())}</p></div>
      <div class="section"><h2>الحضور والانضباط</h2><ol>
        <li>يلتزم جميع العاملين بمواعيد الدوام المسجلة في النظام.</li>
        <li>أي تأخير، غياب، إجازة، أو خروج مبكر يجب أن يسجل ويعتمد من المسؤول المباشر.</li>
        <li>تستخدم سجلات البصمة/الحضور كأساس للحساب والمراجعة.</li>
      </ol></div>
      <div class="section"><h2>السلامة والمعدات</h2><ol>
        <li>ارتداء معدات الوقاية إلزامي في مناطق الإنتاج والقص واللحام والطباعة.</li>
        <li>لا تستخدم أي ماكينة أو أداة قبل التأكد من صلاحيتها وحالتها في النظام.</li>
        <li>أي عطل، تلف، أو خطر سلامة يسجل فوراً كمهمة أو طلب صيانة.</li>
      </ol></div>
      <div class="section"><h2>العهد والمواد</h2><ol>
        <li>استلام الأدوات والمعدات عهدة شخصية حتى إرجاعها وفحصها.</li>
        <li>لا تصرف مواد أو أدوات خارج الورشة إلا بسند أو ترحيل مسجل.</li>
        <li>أي فقدان أو تلف يراجع من الإدارة قبل تسجيل أي استقطاع.</li>
      </ol></div>
      <div class="section"><h2>العملاء والسرية</h2><ol>
        <li>تمنع مشاركة أسعار العملاء، التصاميم، الملفات، أو بيانات المشاريع خارج قنوات الإدارة.</li>
        <li>التواصل الرسمي مع العملاء يتم عبر القنوات المعتمدة أو بتكليف واضح.</li>
      </ol></div>
      <div class="signatures"><div class="sig">توقيع الموظف بالاطلاع</div><div class="sig">توقيع الإدارة</div></div>
    `);
  };

  function kpi(label, value, sub, cls) { return `<div class="dc-kpi ${cls || ''}"><div class="dc-kpi-val">${value}</div><div class="dc-kpi-label">${label}</div>${sub ? `<div class="dc-kpi-sub">${sub}</div>` : ''}</div>`; }

  function renderDashboard() {
    const el = document.getElementById('dcDashBody'); if (!el) return;
    const p = portfolio();
    el.innerHTML = `
      <div class="dc-kpi-grid">
        ${kpi('إجمالي الوثائق', p.total, '', 'dc-kpi-accent')}
        ${kpi('تنتهي قريباً', p.expiringSoon, 'ضمن مهلة التذكير', p.expiringSoon ? 'dc-kpi-warn' : '')}
        ${kpi('منتهية', p.expired, 'تحتاج تجديداً', p.expired ? 'dc-kpi-danger' : '')}
        ${kpi('الفئات', p.byCategory.length, 'أنواع الوثائق', '')}
      </div>
      <div class="dc-panel"><div class="dc-panel-head"><h3>🚨 وثائق تحتاج تجديداً</h3><button class="dc-mini-btn" onclick="docOpenTab('registry')">السجل الكامل</button></div>
        <table class="dc-table"><thead><tr><th>الوثيقة</th><th>الفئة</th><th>الجهة</th><th>الانتهاء</th><th>الحالة</th></tr></thead>
        <tbody>${p.alerts.map(a => `<tr class="${a.e.expired ? 'dc-row-danger' : 'dc-row-warn'}"><td><strong>${esc(a.d.title)}</strong>${a.d.refNumber ? `<br><span class="dc-muted">${esc(a.d.refNumber)}</span>` : ''}</td><td>${CAT_LABEL[a.d.category] || a.d.category}</td><td>${esc(a.d.owner || '—')}</td><td class="dc-muted">${esc(a.d.expiryDate)}</td><td>${a.e.expired ? `<span class="dc-badge dc-bad">منتهية منذ ${Math.abs(a.e.days)} يوم</span>` : `<span class="dc-badge dc-warn">خلال ${a.e.days} يوم</span>`}</td></tr>`).join('') || '<tr><td colspan="5" class="dc-empty">كل الوثائق سارية ✅</td></tr>'}</tbody></table>
      </div>
      ${p.byCategory.length ? `<div class="dc-panel"><div class="dc-panel-head"><h3>حسب الفئة</h3></div><div class="dc-cats">${p.byCategory.map(c => `<div class="dc-cat-chip">${c.label} <strong>${c.count}</strong></div>`).join('')}</div></div>` : ''}`;
  }

  function renderLegalKit() {
    const el = document.getElementById('dcLegalBody'); if (!el) return;
    const opts = employeeList().map(e => `<option value="${esc(e.id || e.name)}">${esc(e.name || e.id)}</option>`).join('');
    el.innerHTML = `
      <div class="dc-panel">
        <div class="dc-panel-head"><h3>حزمة قانونية جاهزة للطباعة</h3></div>
        <div class="dc-form-grid">
          <div><label>الموظف</label><select id="docLegalEmployee" class="dc-input"><option value="">موظف جديد / فارغ</option>${opts}</select></div>
          <div><label>اسم يدوي عند الحاجة</label><input id="docLegalEmployeeName" class="dc-input" placeholder="اسم الموظف"></div>
          <div><label>المسمى الوظيفي</label><input id="docLegalJob" class="dc-input" placeholder="عامل إنتاج / مشغل / إداري"></div>
          <div><label>تاريخ المباشرة</label><input id="docLegalStart" type="date" class="dc-input" value="${todayISO()}"></div>
          <div><label>الأجر الشهري</label><input id="docLegalSalary" type="number" class="dc-input" placeholder="0"></div>
          <div class="dc-form-full"><label>ملاحظات خاصة بالعقد</label><input id="docLegalNotes" class="dc-input" placeholder="فترة تجربة، دوام، عهدة، أو شرط خاص"></div>
        </div>
        <div class="dc-form-actions">
          <button class="btn-primary" onclick="docPrintEmployeeContract()">طباعة عقد موظف</button>
          <button class="dc-mini-btn" onclick="docPrintCompanyRules()">طباعة النظام الداخلي</button>
        </div>
      </div>`;
  }

  function renderRegistry() {
    const el = document.getElementById('dcRegBody'); if (!el) return;
    if (editing) { el.innerHTML = renderForm(); return; }
    let list = getDocs();
    if (catFilter) list = list.filter(d => d.category === catFilter);
    if (search) { const q = search.toLowerCase(); list = list.filter(d => `${d.title} ${d.refNumber} ${d.owner} ${d.tags}`.toLowerCase().includes(q)); }
    const catOpts = ['<option value="">كل الفئات</option>'].concat(CATEGORIES.map(([k, l]) => `<option value="${k}" ${catFilter === k ? 'selected' : ''}>${l}</option>`)).join('');
    el.innerHTML = `
      <div class="dc-toolbar">
        <button class="btn-primary" onclick="docOpenForm('new')">➕ وثيقة</button>
        <button class="dc-mini-btn" onclick="docLoadDemo()">بيانات تجريبية</button>
        <input class="dc-input" placeholder="بحث..." value="${esc(search)}" oninput="docSearch(this.value)" style="max-width:200px">
        <select class="dc-input" onchange="docCatFilter(this.value)" style="max-width:170px">${catOpts}</select>
      </div>
      <table class="dc-table"><thead><tr><th>الوثيقة</th><th>الفئة</th><th>الرقم</th><th>الجهة</th><th>الإصدار</th><th>الانتهاء</th><th>إجراءات</th></tr></thead>
      <tbody>${list.map(d => { const e = expiryView(d); const exp = !e.has ? '<span class="dc-muted">—</span>' : `<span class="${e.expired ? 'dc-exp-bad' : e.soon ? 'dc-exp-warn' : 'dc-exp-ok'}">${esc(d.expiryDate)}</span>`;
        return `<tr><td><strong>${esc(d.title)}</strong>${d.tags ? `<br><span class="dc-muted">${esc(d.tags)}</span>` : ''}</td><td>${CAT_LABEL[d.category] || d.category}</td><td class="dc-muted">${esc(d.refNumber || '—')}</td><td>${esc(d.owner || '—')}</td><td class="dc-muted">${esc(d.issueDate || '—')}</td><td>${exp}</td>
        <td class="dc-actions"><button class="dc-mini-btn" onclick="docPrintDocument('${d.id}')">طباعة</button><button class="dc-mini-btn" onclick="docOpenForm('${d.id}')">تعديل</button><button class="dc-mini-btn dc-danger" onclick="docArchive('${d.id}')">أرشفة</button></td></tr>`;
      }).join('') || '<tr><td colspan="7" class="dc-empty">لا توجد وثائق</td></tr>'}</tbody></table>`;
  }
  function renderForm() {
    const d = editing !== 'new' ? (D()?.docs || []).find(x => x.id === editing) : null; const v = d || {};
    const cOpt = CATEGORIES.map(([k, l]) => `<option value="${k}" ${v.category === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="dc-panel"><div class="dc-panel-head"><h3>${d ? 'تعديل وثيقة' : 'وثيقة جديدة'}</h3></div>
      <div class="dc-form-grid">
        <div class="dc-form-full"><label>العنوان *</label><input id="docTitle" class="dc-input" value="${esc(v.title || '')}"></div>
        <div><label>الفئة</label><select id="docCategory" class="dc-input">${cOpt}</select></div>
        <div><label>رقم الوثيقة</label><input id="docRef" class="dc-input" value="${esc(v.refNumber || '')}"></div>
        <div><label>الجهة المالكة</label><input id="docOwner" class="dc-input" value="${esc(v.owner || '')}"></div>
        <div><label>جهة الإصدار</label><input id="docIssuer" class="dc-input" value="${esc(v.issuer || '')}"></div>
        <div><label>تاريخ الإصدار</label><input id="docIssue" type="date" class="dc-input" value="${esc(v.issueDate || '')}"></div>
        <div><label>تاريخ الانتهاء</label><input id="docExpiry" type="date" class="dc-input" value="${esc(v.expiryDate || '')}"></div>
        <div><label>التذكير قبل (يوم)</label><input id="docReminder" type="number" class="dc-input" value="${v.reminderDays != null ? v.reminderDays : 30}"></div>
        <div><label>الوسوم</label><input id="docTags" class="dc-input" value="${esc(v.tags || '')}"></div>
        <div class="dc-form-full"><label>ملف/رابط (ملاحظة)</label><input id="docFile" class="dc-input" value="${esc(v.fileNote || '')}" placeholder="مسار أو رابط الملف"></div>
        <div class="dc-form-full"><label>ملاحظات</label><input id="docNotes" class="dc-input" value="${esc(v.notes || '')}"></div>
      </div>
      <div class="dc-form-actions"><button class="btn-primary" onclick="docSave()">حفظ</button><button class="dc-mini-btn" onclick="docCancelForm()">إلغاء</button></div></div>`;
  }

  function renderTabContent() {
    const map = { dcDashBody: 'dashboard', dcRegBody: 'registry', dcLegalBody: 'legal' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'legal') renderLegalKit();
    else renderRegistry();
  }
  function render() {
    const body = document.getElementById('documentsBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['registry', '🗂️ السجل'], ['legal', 'العقود والقواعد']];
    body.innerHTML = `<div class="dc-tabs">${tabs.map(([k, l]) => `<button class="dc-tab-btn ${activeTab === k ? 'active' : ''}" onclick="docOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="dcDashBody"></div><div id="dcRegBody"></div><div id="dcLegalBody"></div>`;
    renderTabContent();
  }
  window.renderDocuments = render;

  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'documents') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageDocuments'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navDocuments'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('documents');
      } catch (_) {}
      ensureData(); setTimeout(render, 0);
    }
  };
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_documents_today'] = function () {
          const p = portfolio();
          return { total: p.total, expiringSoon: p.expiringSoon, expired: p.expired, alerts: p.alerts.map(a => ({ title: a.d.title, category: a.d.category, expiry: a.d.expiryDate, expired: a.e.expired, daysLeft: a.e.days })) };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['documents'] = '#pageDocuments';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis); else setTimeout(registerJarvis, 600);
  window.OctagonDocuments = { render, ensureData, portfolio };
})();
