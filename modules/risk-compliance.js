/**
 * OCTAGON ERP - Risk & Compliance.
 * Add-only register under omni.riskCompliance. Reads live signals; never writes
 * finance, payroll, stock, tenant records, or external messages.
 */
(function () {
  'use strict';

  let activeTab = 'risks';
  let riskFilter = 'all';

  function O() { try { if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni; } catch (_) {} if (!window.omni) window.omni = {}; return window.omni; }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function todayISO() { if (typeof window.todayISO === 'function') { try { return window.todayISO(); } catch (_) {} } return new Date().toISOString().slice(0, 10); }
  function plusDays(days) { const d = new Date(todayISO() + 'T00:00:00'); d.setDate(d.getDate() + Number(days || 0)); return d.toISOString().slice(0, 10); }
  function uid(prefix) { if (typeof window.makeId === 'function') { try { return window.makeId(prefix || 'risk'); } catch (_) {} } return (prefix || 'risk') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function save() { if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} } }
  function toast(m, k) { if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); } catch (_) {} } }
  function currentUserName() { try { return window.PentagonAuth?.getCurrentUser?.()?.name || window.PentagonAuth?.currentUser?.name || 'system'; } catch (_) { return 'system'; } }
  function activeProfile() {
    try { if (typeof window.getActiveOrgProfile === 'function') return window.getActiveOrgProfile() || {}; } catch (_) {}
    try { if (window.TenantService?.activeProfile) return window.TenantService.activeProfile() || {}; } catch (_) {}
    const org = O().adminSettings?.organization || {};
    const companies = Array.isArray(org.companies) ? org.companies : [];
    const co = companies.find(c => c.id === org.activeCompanyId) || companies.find(c => c.isPrimary) || companies[0] || {};
    return { companyId: co.id || org.activeCompanyId || '', companyName: co.name || org.name || '' };
  }
  function stamp(rec) {
    try { if (window.TenantService?.stamp) return window.TenantService.stamp(rec, { collection: 'omni.riskCompliance' }); } catch (_) {}
    const p = activeProfile();
    if (p.companyId && !rec.companyId) { rec.companyId = p.companyId; rec.companyName = p.companyName || ''; rec.tenantStampedAt = rec.tenantStampedAt || new Date().toISOString(); }
    return rec;
  }
  function audit(action, detail, payload) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent({ module: 'risk_compliance', source: 'risk_compliance', action, summary: detail, payload: payload || {} }); } catch (_) {}
    try { if (window.AuditService?.createEvent) window.AuditService.createEvent({ module: 'risk_compliance', action: 'risk_compliance.' + action, detail, user: currentUserName(), payload: payload || {} }); } catch (_) {}
  }
  function auditGuard(action, result, payload) {
    const explained = window.PermissionService?.explainAction?.('risk_compliance.write', payload || {}) || {};
    const user = window.PentagonAuth?.getCurrentUser?.() || {};
    const groups = window.PermissionService?.resolveGroups?.(user) || user.groups || [];
    const body = { actionKey: 'risk_compliance.write', result, user: currentUserName(), role: groups.join(',') || 'unmapped', page: 'risk_compliance', riskLevel: explained.riskLevel || 'high', reason: explained.reason || '', timestamp: new Date().toISOString(), ...(payload || {}) };
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent({ module: 'risk_compliance', source: 'risk_compliance', action: 'risk_compliance.write', title: 'Risk Compliance guarded write', status: result, entityId: payload?.targetId || '', entityType: payload?.targetType || '', payload: body, before: payload?.before || null, after: payload?.after || null }); } catch (_) {}
    try { if (typeof window.addOmniSystemLog === 'function') window.addOmniSystemLog({ action: 'risk_compliance.write', message: 'Phase 6C: risk_compliance.write -> ' + result + (body.reason ? ' (' + body.reason + ')' : ''), page: 'risk_compliance', entityType: payload?.targetType || '', entityId: payload?.targetId || '', actor: currentUserName(), severity: result === 'blocked' ? 'warning' : 'success' }); } catch (_) {}
  }
  function canWriteRisk(payload) {
    const ok = !window.PermissionService || typeof window.PermissionService.checkAction !== 'function' || window.PermissionService.checkAction('risk_compliance.write', payload || {});
    auditGuard('risk_compliance.write', ok ? 'allowed' : 'blocked', payload || {});
    if (!ok) toast('هذا الإجراء يحتاج صلاحية مدير.', 'warning');
    return ok;
  }

  const SEV = { low: ['منخفض', 'low', 1], medium: ['متوسط', 'medium', 2], high: ['عال', 'high', 3], critical: ['حرج', 'critical', 4] };
  const STATUS = { open: ['مفتوح', 'open'], review: ['قيد المراجعة', 'review'], mitigated: ['مخفف', 'ok'], closed: ['مغلق', 'closed'] };
  const CAT = { operations: 'تشغيل', finance: 'مالي', security: 'أمن', legal: 'قانوني', hr: 'موارد بشرية' };
  function catLabel(c) { return CAT[c] || c || ''; }
  const CTL = { ok: ['مطابق', 'ok'], review: ['مراجعة', 'review'], overdue: ['متأخر', 'overdue'] };

  function ensureData() {
    const o = O();
    if (!o.riskCompliance || typeof o.riskCompliance !== 'object') o.riskCompliance = {};
    const r = o.riskCompliance;
    if (!Array.isArray(r.risks)) r.risks = [];
    if (!Array.isArray(r.controls)) r.controls = [];
    if (!Array.isArray(r.events)) r.events = [];
    if (!r._seeded && !r.risks.length && !r.controls.length) {
      r._seeded = true;
      r.risks.push(stamp({ id: uid('risk'), title: 'غياب مراجعة دورية لصلاحيات الصفحات الحساسة', category: 'security', owner: 'الإدارة', severity: 'high', likelihood: 3, status: 'open', reviewDate: plusDays(7), mitigation: 'مراجعة المستخدمين والصلاحيات وربط أي صفحة مالية أو رواتب بصلاحية واضحة.', evidence: 'خدمة الصلاحيات + سجل الدخول', createdAt: new Date().toISOString(), createdBy: 'system' }));
      r.risks.push(stamp({ id: uid('risk'), title: 'تأخر إغلاق إجراءات الجودة أو التسليم', category: 'operations', owner: 'مدير التشغيل', severity: 'medium', likelihood: 2, status: 'review', reviewDate: plusDays(14), mitigation: 'متابعة أوامر العمل المتأخرة وتحويل الانحرافات إلى مهام.', evidence: 'فحص صحة النظام + أوامر العمل + الجودة', createdAt: new Date().toISOString(), createdBy: 'system' }));
      r.controls.push(stamp({ id: uid('ctl'), name: 'اعتماد العمليات الحساسة', domain: 'AI / Finance / Payroll', owner: 'المدير', frequency: 'مستمر', status: 'ok', nextReview: plusDays(30), evidence: 'AI queue approval gate', note: 'الأدوات الحساسة تبقى approval-gated.' }));
      r.controls.push(stamp({ id: uid('ctl'), name: 'فحص صحة المسارات', domain: 'سلامة النظام', owner: 'تقنية المعلومات', frequency: 'بعد كل دفعة', status: 'review', nextReview: todayISO(), evidence: 'فحص صحة النظام', note: 'تشغيل الفحص بعد أي إضافة صفحة.' }));
    }
  }
  function R() { ensureData(); return O().riskCompliance; }
  function daysUntil(iso) { return iso ? Math.round((new Date(iso + 'T00:00:00') - new Date(todayISO() + 'T00:00:00')) / 86400000) : null; }
  function liveSignals() {
    const o = O();
    const openAi = Array.isArray(o.aiControl?.actionQueue) ? o.aiControl.actionQueue.filter(x => x.status === 'pending').length : 0;
    const openApprovals = Array.isArray(o.approvals?.requests) ? o.approvals.requests.filter(x => ['pending', 'open', 'review'].includes(x.status)).length : 0;
    const qcFails = Array.isArray(o.qcRecords) ? o.qcRecords.filter(x => ['fail', 'failed', 'rework'].includes(x.status || x.result)).length : 0;
    const overdueTasks = typeof window.getAllTaskManagerTasks === 'function' ? (() => { try { return window.getAllTaskManagerTasks(true).map(x => x.task).filter(t => t.dueDate && t.dueDate < todayISO() && t.status !== 'done').length; } catch (_) { return 0; } })() : 0;
    return { openAi, openApprovals, qcFails, overdueTasks };
  }
  function kpis() {
    const r = R();
    const open = r.risks.filter(x => x.status !== 'closed').length;
    const high = r.risks.filter(x => x.status !== 'closed' && ['high', 'critical'].includes(x.severity)).length;
    const overdue = r.risks.filter(x => x.status !== 'closed' && x.reviewDate && x.reviewDate < todayISO()).length + r.controls.filter(x => x.nextReview && x.nextReview < todayISO()).length;
    const controlsOk = r.controls.length ? Math.round((r.controls.filter(x => x.status === 'ok').length / r.controls.length) * 100) : 100;
    const s = liveSignals();
    return { open, high, overdue, controlsOk, signals: s.openAi + s.openApprovals + s.qcFails + s.overdueTasks };
  }
  function chip(label, cls) { return '<span class="risk-chip ' + esc(cls) + '">' + esc(label) + '</span>'; }
  function kpiStrip() {
    const k = kpis();
    const card = (icon, value, label) => '<div class="risk-kpi"><i class="fa-solid ' + icon + '"></i><div><b>' + esc(value) + '</b><span>' + esc(label) + '</span></div></div>';
    return '<div class="risk-kpis">' + card('fa-triangle-exclamation', k.open, 'مخاطر مفتوحة') + card('fa-fire-flame-curved', k.high, 'عال/حرج') + card('fa-clock', k.overdue, 'مراجعات متأخرة') + card('fa-list-check', k.controlsOk + '%', 'مطابقة الضوابط') + card('fa-wave-square', k.signals, 'إشارات حية') + '</div>';
  }
  function tabs() {
    const t = (key, icon, label) => '<button class="risk-tab ' + (activeTab === key ? 'active' : '') + '" onclick="riskSetTab(\'' + key + '\')"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
    return '<div class="risk-tabs">' + t('risks', 'fa-shield-halved', 'سجل المخاطر') + t('controls', 'fa-clipboard-check', 'ضوابط الامتثال') + t('signals', 'fa-satellite-dish', 'إشارات النظام') + '</div>';
  }
  function selectOptions(map, selected) { return Object.keys(map).map(k => '<option value="' + k + '"' + (selected === k ? ' selected' : '') + '>' + esc(map[k][0]) + '</option>').join(''); }
  function riskRows() {
    let rows = R().risks.slice();
    if (riskFilter !== 'all') rows = rows.filter(x => x.severity === riskFilter || x.status === riskFilter || x.category === riskFilter);
    rows.sort((a, b) => (SEV[b.severity]?.[2] || 0) - (SEV[a.severity]?.[2] || 0) || String(a.reviewDate).localeCompare(String(b.reviewDate)));
    const body = rows.map(x => {
      const sev = SEV[x.severity] || SEV.medium, st = STATUS[x.status] || STATUS.open, due = daysUntil(x.reviewDate);
      return '<tr><td><span class="risk-title">' + esc(x.title) + '</span><span class="risk-sub">' + esc(x.mitigation || '') + '</span></td><td>' + esc(x.owner || '-') + '<span class="risk-sub">' + esc(catLabel(x.category)) + '</span></td><td>' + chip(sev[0], sev[1]) + '<span class="risk-sub">احتمال ' + esc(x.likelihood || 1) + '/5</span></td><td>' + chip(st[0], st[1]) + '<span class="risk-sub">' + esc(x.reviewDate || '-') + (due != null ? ' · ' + esc(due) + ' يوم' : '') + '</span></td><td><span class="risk-sub">' + esc(x.evidence || '-') + '</span></td><td><div class="risk-actions">' + (x.status !== 'mitigated' ? '<button class="risk-mini ok" onclick="riskSetStatus(\'' + x.id + '\',\'mitigated\')">تخفيف</button>' : '') + (x.status !== 'review' ? '<button class="risk-mini warn" onclick="riskSetStatus(\'' + x.id + '\',\'review\')">مراجعة</button>' : '') + (x.status !== 'closed' ? '<button class="risk-mini" onclick="riskSetStatus(\'' + x.id + '\',\'closed\')">إغلاق</button>' : '') + '</div></td></tr>';
    }).join('') || '<tr><td colspan="6" class="risk-sub">لا توجد مخاطر بهذا الفلتر.</td></tr>';
    return '<div class="risk-panel"><div class="risk-panel-head"><h3><i class="fa-solid fa-list"></i> سجل المخاطر</h3><select onchange="riskSetFilter(this.value)" class="form-input"><option value="all">كل السجل</option><option value="critical">حرج</option><option value="high">عال</option><option value="review">قيد المراجعة</option><option value="security">أمن</option><option value="finance">مالي</option><option value="operations">تشغيل</option></select></div><div class="risk-table-wrap"><table class="risk-table"><thead><tr><th>الخطر</th><th>المالك</th><th>الشدة</th><th>الحالة/المراجعة</th><th>الدليل</th><th>إجراء</th></tr></thead><tbody>' + body + '</tbody></table></div></div>';
  }
  function riskForm() {
    return '<aside class="risk-panel"><div class="risk-panel-head"><h3><i class="fa-solid fa-plus"></i> إضافة خطر</h3></div><div class="risk-form"><label>العنوان<input id="riskF_title" type="text" placeholder="مثال: عقد بلا تاريخ تجديد"></label><div class="risk-two"><label>التصنيف<select id="riskF_category"><option value="operations">تشغيل</option><option value="finance">مالي</option><option value="security">أمن</option><option value="legal">قانوني</option><option value="hr">موارد بشرية</option></select></label><label>المالك<input id="riskF_owner" type="text" placeholder="المسؤول"></label></div><div class="risk-two"><label>الشدة<select id="riskF_severity">' + selectOptions(SEV, 'medium') + '</select></label><label>الاحتمال<select id="riskF_likelihood"><option>1</option><option>2</option><option selected>3</option><option>4</option><option>5</option></select></label></div><label>موعد المراجعة<input id="riskF_review" type="date" value="' + esc(plusDays(14)) + '"></label><label>الإجراء التصحيحي<textarea id="riskF_mitigation"></textarea></label><label>الدليل<input id="riskF_evidence" type="text"></label><button class="risk-btn primary" onclick="riskAddRisk()"><i class="fa-solid fa-shield-plus"></i> حفظ الخطر</button></div></aside>';
  }
  function risksView() { return '<div class="risk-grid"><main>' + riskRows() + '</main>' + riskForm() + '</div>'; }
  function controlsView() {
    const cards = R().controls.slice().sort((a, b) => String(a.nextReview).localeCompare(String(b.nextReview))).map(x => {
      const st = CTL[x.status] || CTL.review, due = daysUntil(x.nextReview);
      return '<div class="risk-control"><h4>' + esc(x.name) + '</h4><p>' + esc(x.note || '') + '</p><div class="risk-control-foot">' + chip(st[0], st[1]) + '<span class="risk-sub">' + esc(x.domain || '-') + ' · ' + esc(x.owner || '-') + '</span></div><div class="risk-control-foot"><span class="risk-sub">المراجعة: ' + esc(x.nextReview || '-') + (due != null ? ' · ' + esc(due) + ' يوم' : '') + '</span><div class="risk-actions"><button class="risk-mini ok" onclick="riskSetControlStatus(\'' + x.id + '\',\'ok\')">مطابق</button><button class="risk-mini warn" onclick="riskSetControlStatus(\'' + x.id + '\',\'review\')">مراجعة</button></div></div></div>';
    }).join('') || '<span class="risk-sub">لا توجد ضوابط.</span>';
    return '<div class="risk-grid"><main class="risk-panel"><div class="risk-panel-head"><h3><i class="fa-solid fa-clipboard-check"></i> ضوابط الامتثال</h3></div><div class="risk-control-list">' + cards + '</div></main><aside class="risk-panel"><div class="risk-panel-head"><h3><i class="fa-solid fa-plus"></i> ضبط جديد</h3></div><div class="risk-form"><label>اسم الضبط<input id="ctlF_name" type="text"></label><label>النطاق<input id="ctlF_domain" type="text"></label><div class="risk-two"><label>المالك<input id="ctlF_owner" type="text"></label><label>التكرار<input id="ctlF_frequency" type="text" value="شهري"></label></div><label>المراجعة التالية<input id="ctlF_next" type="date" value="' + esc(plusDays(30)) + '"></label><label>الدليل<input id="ctlF_evidence" type="text"></label><label>ملاحظة<textarea id="ctlF_note"></textarea></label><button class="risk-btn primary" onclick="riskAddControl()"><i class="fa-solid fa-plus"></i> حفظ الضبط</button></div></aside></div>';
  }
  function signalsView() {
    const s = liveSignals();
    const rows = [['طلبات AI بانتظار موافقة', s.openAi, 'ai_queue'], ['موافقات تشغيلية مفتوحة', s.openApprovals, 'approvals'], ['فحوص جودة تحتاج متابعة', s.qcFails, 'qc_center'], ['مهام متأخرة', s.overdueTasks, 'task_manager']];
    return '<div class="risk-panel"><div class="risk-panel-head"><h3><i class="fa-solid fa-satellite-dish"></i> إشارات النظام المقروءة فقط</h3><button class="risk-btn" onclick="riskRender()">تحديث</button></div><div class="risk-table-wrap"><table class="risk-table"><thead><tr><th>الإشارة</th><th>العدد</th><th>المصدر</th><th>إجراء</th></tr></thead><tbody>' + rows.map(r => '<tr><td class="risk-title">' + esc(r[0]) + '</td><td>' + chip(r[1], r[1] ? 'review' : 'ok') + '</td><td><span class="risk-sub">' + esc(r[2]) + '</span></td><td><button class="risk-mini primary" onclick="switchPage(\'' + esc(r[2]) + '\')">فتح</button></td></tr>').join('') + '</tbody></table></div></div>';
  }
  function render() {
    ensureData();
    const body = document.getElementById('riskComplianceBody');
    if (!body) return;
    const content = activeTab === 'controls' ? controlsView() : activeTab === 'signals' ? signalsView() : risksView();
    body.innerHTML = '<div class="risk-shell"><section class="risk-hero"><div><h2><i class="fa-solid fa-shield-halved"></i> مركز المخاطر والامتثال</h2><p>صفحة تنفيذية لتسجيل المخاطر، متابعة الضوابط، وربط إشارات النظام الحية بإجراءات مراجعة واضحة. لا تنفذ عمليات حساسة مباشرة.</p></div><div class="risk-hero-actions"><button class="risk-btn" onclick="switchPage(\'route_health\')"><i class="fa-solid fa-stethoscope"></i> Route Health</button><button class="risk-btn" onclick="switchPage(\'ai_queue\')"><i class="fa-solid fa-user-shield"></i> طابور الموافقات</button></div></section>' + kpiStrip() + tabs() + content + '</div>';
  }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  window.riskSetTab = tab => { activeTab = tab; render(); };
  window.riskSetFilter = filter => { riskFilter = filter || 'all'; render(); };
  window.riskRender = render;
  window.riskAddRisk = function () {
    const title = val('riskF_title');
    if (!title) { toast('أدخل عنوان الخطر', 'warning'); return; }
    if (!canWriteRisk({ targetType: 'risk', targetId: 'new', after: { title, severity: val('riskF_severity') || 'medium' } })) return;
    const rec = stamp({ id: uid('risk'), title, category: val('riskF_category') || 'operations', owner: val('riskF_owner') || currentUserName(), severity: val('riskF_severity') || 'medium', likelihood: num(val('riskF_likelihood')) || 3, status: 'open', reviewDate: val('riskF_review') || plusDays(14), mitigation: val('riskF_mitigation'), evidence: val('riskF_evidence'), createdAt: new Date().toISOString(), createdBy: currentUserName() });
    R().risks.unshift(rec); audit('risk_created', 'تمت إضافة خطر: ' + title, { id: rec.id, severity: rec.severity }); save(); render(); toast('تم حفظ الخطر في سجل الامتثال', 'success');
  };
  window.riskSetStatus = function (id, status) {
    const x = R().risks.find(r => r.id === id); if (!x || !STATUS[status]) return;
    if (!canWriteRisk({ targetType: 'risk', targetId: id, before: { status: x.status }, after: { status } })) return;
    x.status = status; x.updatedAt = new Date().toISOString(); x.updatedBy = currentUserName();
    R().events.unshift({ id: uid('risk_evt'), riskId: id, action: 'status:' + status, at: x.updatedAt, by: x.updatedBy });
    audit('risk_status_changed', 'تغيير حالة الخطر: ' + x.title + ' -> ' + STATUS[status][0], { id, status }); save(); render(); toast('تم تحديث حالة الخطر', 'success');
  };
  window.riskAddControl = function () {
    const name = val('ctlF_name'); if (!name) { toast('أدخل اسم الضبط', 'warning'); return; }
    if (!canWriteRisk({ targetType: 'control', targetId: 'new', after: { name, domain: val('ctlF_domain') } })) return;
    const rec = stamp({ id: uid('ctl'), name, domain: val('ctlF_domain'), owner: val('ctlF_owner') || currentUserName(), frequency: val('ctlF_frequency') || 'شهري', status: 'review', nextReview: val('ctlF_next') || plusDays(30), evidence: val('ctlF_evidence'), note: val('ctlF_note'), createdAt: new Date().toISOString(), createdBy: currentUserName() });
    R().controls.unshift(rec); audit('control_created', 'تمت إضافة ضبط امتثال: ' + name, { id: rec.id }); save(); render(); toast('تم حفظ ضبط الامتثال', 'success');
  };
  window.riskSetControlStatus = function (id, status) {
    const x = R().controls.find(c => c.id === id); if (!x || !CTL[status]) return;
    if (!canWriteRisk({ targetType: 'control', targetId: id, before: { status: x.status }, after: { status } })) return;
    x.status = status; x.lastReviewedAt = new Date().toISOString(); x.lastReviewedBy = currentUserName(); if (status === 'ok') x.nextReview = plusDays(30);
    audit('control_status_changed', 'تغيير حالة الضبط: ' + x.name + ' -> ' + CTL[status][0], { id, status }); save(); render(); toast('تم تحديث الضبط', 'success');
  };
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('risk_compliance');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageRiskCompliance'), nav = document.getElementById('navRiskCompliance');
    if (pg) pg.classList.add('page-active'); if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('risk_compliance'); } catch (_) {} }
    window.currentPage = 'risk_compliance'; render(); return !!pg;
  }
  function wireSwitch() {
    if (window.__riskComplianceWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) { if (page === 'risk_compliance') { try { if (activatePage()) return; } catch (e) { console.warn('Risk Compliance render error', e); } } return orig.apply(this, arguments); };
    window.__riskComplianceWrapped = true;
  }
  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !window.JarvisBrain.tools || window.JarvisBrain.tools.report_risk_compliance_today) return;
      window.JarvisBrain.tools.report_risk_compliance_today = { desc_en: 'Risk and compliance summary: open risks, high/critical risks, overdue reviews, controls compliance and live system signals.', risk: 'safe', params: {}, run: () => ({ kpis: kpis(), signals: liveSignals(), topRisks: R().risks.filter(x => x.status !== 'closed').slice(0, 5) }) };
    } catch (_) {}
  }
  function init() {
    ensureData(); wireSwitch(); registerJarvis();
    let tries = 0;
    const t = setInterval(() => { tries++; wireSwitch(); registerJarvis(); if (window.__riskComplianceWrapped || tries > 40) clearInterval(t); }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.OctagonRiskCompliance = { ensureData, render, kpis, signals: liveSignals, open: () => { try { window.switchPage('risk_compliance'); } catch (_) {} } };
})();
