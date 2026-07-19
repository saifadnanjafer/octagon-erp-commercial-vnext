/**
 * OCTAGON ERP — People Operations: Recruitment (ATS) + Leave / Time-off (الموارد البشرية — التوظيف والإجازات).
 *
 * Two core HR pillars Octagon had ZERO of (`recruitment`/`applicant`/`expense_claim` = 0 occurrences;
 * leave was barely present). Universal across every business. Self-contained in `omni.peopleOps` —
 * **never touches the locked payroll/timesheet**: "hire" marks a candidate hired + writes an audit
 * event (the manager still adds them on the existing Employees page, so no salary/payroll side-effect);
 * leave requests are an HR tracker only, they do NOT mutate payroll or attendance.
 *
 *  - Recruitment: job openings + a candidate pipeline (applied → screening → interview → offer →
 *    hired / rejected), rating, stage moves, hire/reject.
 *  - Leave / Time-off: requests (annual / sick / unpaid / emergency) with approve/reject and a
 *    per-employee annual-balance view (entitlement − approved annual days).
 *  - Dashboard: open positions, pipeline count, interviews-this-week, pending leave, on-leave-today.
 *  - Jarvis tool: report_hr_today. Every mutation writes an audit event. Archive, never hard-delete.
 *
 * Data namespace: omni.peopleOps = { openings:[], candidates:[], leaveRequests:[] }
 * Page: #pagePeopleOps (nav data-page="people_ops"). Add-only; nothing existing touched.
 */
(function () {
  'use strict';

  /* ───────────────────────── shared helpers ───────────────────────── */
  function O() {
    if (typeof omni !== 'undefined' && omni) return omni;
    if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} }
    return null;
  }
  function save() { if (typeof window.saveData === 'function') window.saveData(); }
  function toast(m, t) { if (typeof window.showToast === 'function') window.showToast(m, t || 'info'); }
  function uid(p) { return (typeof window.makeId === 'function') ? window.makeId(p) : (p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function coId() { try { return (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || ''; } catch (_) { return ''; } }
  function userName() { try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {} return 'مستخدم'; }
  function audit(action, detail) {
    try { if (typeof window.recordOmniHistoryEvent === 'function') window.recordOmniHistoryEvent('people_ops', action, detail); } catch (_) {}
    try { if (window.AuditService && typeof AuditService.createEvent === 'function') AuditService.createEvent({ module: 'people_ops', action, detail, user: userName() }); } catch (_) {}
  }
  function todayISO() { return new Date().toISOString().slice(0, 10); }
  function daysInclusive(a, b) {
    const d1 = new Date(a), d2 = new Date(b);
    if (isNaN(d1) || isNaN(d2)) return 0;
    return Math.max(0, Math.round((d2 - d1) / 86400000) + 1);
  }
  function daysFromToday(iso) { return Math.round((new Date(iso) - new Date(todayISO())) / 86400000); }
  function getEmployees() {
    let list = Array.isArray(window.employees) ? window.employees : ((O() && Array.isArray(O().employees)) ? O().employees : []);
    return list;
  }

  const ANNUAL_ENTITLEMENT = 21; // default annual-leave days; advisory only (does not touch payroll)
  const STAGES = [['applied', 'تقدّم'], ['screening', 'فرز'], ['interview', 'مقابلة'], ['offer', 'عرض'], ['hired', 'تم التعيين'], ['rejected', 'مرفوض']];
  const STAGE_LABEL = Object.fromEntries(STAGES);
  const STAGE_CLASS = { applied: 'po-st-applied', screening: 'po-st-screening', interview: 'po-st-interview', offer: 'po-st-offer', hired: 'po-st-hired', rejected: 'po-st-rejected' };
  const LEAVE_TYPES = [['annual', 'سنوية'], ['sick', 'مرضية'], ['unpaid', 'بدون راتب'], ['emergency', 'طارئة']];
  const LEAVE_TYPE_LABEL = Object.fromEntries(LEAVE_TYPES);
  const LEAVE_STATUS_LABEL = { pending: 'قيد الموافقة', approved: 'موافق عليها', rejected: 'مرفوضة' };
  const LEAVE_STATUS_CLASS = { pending: 'po-st-screening', approved: 'po-st-hired', rejected: 'po-st-rejected' };

  /* ───────────────────────── data ───────────────────────── */
  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.peopleOps || typeof o.peopleOps !== 'object') o.peopleOps = {};
    const h = o.peopleOps;
    if (!Array.isArray(h.openings)) h.openings = [];
    if (!Array.isArray(h.candidates)) h.candidates = [];
    if (!Array.isArray(h.leaveRequests)) h.leaveRequests = [];
    if (!Array.isArray(h.expenseClaims)) h.expenseClaims = [];
    if (!Array.isArray(h.appraisals)) h.appraisals = [];
    if (!h.hrms || typeof h.hrms !== 'object' || Array.isArray(h.hrms)) h.hrms = {};
    const m = h.hrms;
    if (!Array.isArray(m.contracts)) m.contracts = [];
    if (!Array.isArray(m.onboardingCases)) m.onboardingCases = [];
    if (!Array.isArray(m.offboardingCases)) m.offboardingCases = [];
    if (!Array.isArray(m.custodyRecords)) m.custodyRecords = [];
    if (!Array.isArray(m.disciplinaryActions)) m.disciplinaryActions = [];
    if (!Array.isArray(m.performanceReviews)) m.performanceReviews = [];
    if (!Array.isArray(m.workforcePlan)) m.workforcePlan = [];
    if (!Array.isArray(m.skillsMatrix)) m.skillsMatrix = [];
    if (!Array.isArray(m.finalSettlements)) m.finalSettlements = [];
    m.policyVersion = m.policyVersion || 'phase7g-hrms-foundation-v1';
    m.payrollMutationMode = 'preview_only';
    m.updated_at = m.updated_at || new Date().toISOString();
    return h;
  }
  function H() { return ensureData(); }
  function getOpenings(all) { return (H()?.openings || []).filter(o => all || o.is_active !== false); }
  function getCandidates(all) { return (H()?.candidates || []).filter(c => all || c.is_active !== false); }
  function getLeave() { return (H()?.leaveRequests || []); }
  function HRMS() { const h = H(); return h ? h.hrms : null; }

  function leaveBalance(employeeName) {
    const year = todayISO().slice(0, 4);
    const taken = getLeave().filter(l => l.employeeName === employeeName && l.type === 'annual' && l.status === 'approved' && (l.startDate || '').slice(0, 4) === year)
      .reduce((s, l) => s + Number(l.days || 0), 0);
    return { entitlement: ANNUAL_ENTITLEMENT, taken, remaining: ANNUAL_ENTITLEMENT - taken };
  }

  function portfolio() {
    const cands = getCandidates();
    const inPipeline = cands.filter(c => !['hired', 'rejected'].includes(c.stage));
    const weekAhead = new Date(); weekAhead.setDate(weekAhead.getDate() + 7);
    const interviewsThisWeek = cands.filter(c => c.stage === 'interview' && c.interviewDate && new Date(c.interviewDate) >= new Date(todayISO()) && new Date(c.interviewDate) <= weekAhead).length;
    const leave = getLeave();
    const pendingLeave = leave.filter(l => l.status === 'pending');
    const onLeaveToday = leave.filter(l => l.status === 'approved' && l.startDate <= todayISO() && l.endDate >= todayISO());
    return {
      openPositions: getOpenings().filter(o => o.status !== 'closed').length,
      pipeline: inPipeline.length,
      interviewsThisWeek,
      hired: cands.filter(c => c.stage === 'hired').length,
      pendingLeave: pendingLeave.length,
      onLeaveToday: onLeaveToday.length,
      onLeaveList: onLeaveToday,
      pendingLeaveList: pendingLeave,
      pendingExpenseList: getExpenseClaims().filter(c => c.status === 'pending')
    };
  }

  /* ───────────────────────── expense-claims + appraisal (added) ───────────────────────── */
  function money(n) { n = Number(n); return isFinite(n) ? Math.round(n) : 0; }
  function fmt(n) { return money(n).toLocaleString(); }
  function curSym() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.currencySymbol) || 'د.ع'; }
  const EXPENSE_CATEGORIES = ['مواصلات', 'ضيافة', 'قرطاسية', 'أدوات', 'اتصالات', 'صيانة', 'أخرى'];
  const EXPENSE_STATUS_LABEL = { pending: 'قيد الموافقة', approved: 'موافق عليها (مستحقة)', rejected: 'مرفوضة' };
  const EXPENSE_STATUS_CLASS = { pending: 'po-st-screening', approved: 'po-st-hired', rejected: 'po-st-rejected' };
  const APPRAISAL_CRITERIA = [['quality', 'الجودة'], ['speed', 'السرعة'], ['teamwork', 'العمل الجماعي'], ['discipline', 'الانضباط']];
  function getExpenseClaims() { return (H()?.expenseClaims || []); }
  function getAppraisals() { return (H()?.appraisals || []); }
  function getHrmsSignals() {
    const m = HRMS() || {};
    const emps = getEmployees();
    const openOnboarding = (m.onboardingCases || []).filter(x => !['done', 'cancelled'].includes(x.status)).length;
    const openOffboarding = (m.offboardingCases || []).filter(x => !['done', 'cancelled'].includes(x.status)).length;
    const custodyOpen = (m.custodyRecords || []).filter(x => x.status !== 'returned').length;
    const openDiscipline = (m.disciplinaryActions || []).filter(x => !['closed', 'void'].includes(x.status)).length;
    const pendingSettlements = (m.finalSettlements || []).filter(x => !['paid', 'closed', 'cancelled'].includes(x.status)).length;
    const leaveImpact = getLeave().filter(l => ['pending', 'approved'].includes(l.status)).reduce((acc, l) => {
      acc.days += Number(l.days || 0);
      if (l.type === 'unpaid') acc.unpaidDays += Number(l.days || 0);
      if (l.status === 'pending') acc.pending += 1;
      return acc;
    }, { days: 0, unpaidDays: 0, pending: 0 });
    const missingManagers = emps.filter(e => !e.manager && !e.managerName && !e.supervisor).length;
    const contractMissing = Math.max(0, emps.length - (m.contracts || []).filter(c => c.status !== 'cancelled').length);
    const expiringContracts = (m.contracts || []).filter(c => c.endDate && daysFromToday(c.endDate) >= 0 && daysFromToday(c.endDate) <= 60).length;
    const skillRows = (m.skillsMatrix || []);
    const skillGaps = skillRows.filter(s => Number(s.requiredLevel || 0) > Number(s.currentLevel || 0)).length;
    return {
      employees: emps.length,
      openOnboarding,
      openOffboarding,
      custodyOpen,
      openDiscipline,
      pendingSettlements,
      leaveImpact,
      missingManagers,
      contractMissing,
      expiringContracts,
      workforceGaps: (m.workforcePlan || []).filter(x => Number(x.required || 0) > Number(x.current || 0)).length,
      skillGaps,
      appraisals: getAppraisals().length + (m.performanceReviews || []).length
    };
  }
  function hrmsStatusPill(ok, readyText, gapText) {
    return `<span class="po-badge ${ok ? 'po-st-hired' : 'po-st-screening'}">${ok ? readyText : gapText}</span>`;
  }
  function hrmsMiniList(items, empty) {
    return (items || []).map(x => `<li>${esc(x)}</li>`).join('') || `<li class="po-muted">${esc(empty || 'No records yet')}</li>`;
  }

  /* ───────────────────────── state ───────────────────────── */
  let activeTab = 'dashboard';
  let editingOpening = null;
  let editingCandidate = null;
  let showLeaveForm = false;
  let showExpenseForm = false;
  let showAppraisalForm = false;
  let candSearch = '';

  window.poOpenTab = function (tab) { activeTab = tab; editingOpening = null; editingCandidate = null; showLeaveForm = false; showExpenseForm = false; showAppraisalForm = false; renderPeople(); };
  window.poCandSearch = function (v) { candSearch = v; renderRecruitment(); };

  /* ───────────────────────── openings ───────────────────────── */
  window.poOpenOpeningForm = function (id) { editingOpening = id || 'new'; activeTab = 'recruitment'; renderPeople(); };
  window.poCancelOpeningForm = function () { editingOpening = null; renderPeople(); };
  window.poSaveOpening = function () {
    const h = H(); if (!h) return;
    const title = val('poOpTitle');
    if (!title) { toast('المسمى الوظيفي مطلوب', 'error'); return; }
    const base = { title, department: val('poOpDept'), count: Math.max(1, numVal('poOpCount') || 1), description: val('poOpDesc'), status: val('poOpStatus') || 'open' };
    const ex = editingOpening && editingOpening !== 'new' ? h.openings.find(o => o.id === editingOpening) : null;
    if (ex) { Object.assign(ex, base); audit('opening_update', `تعديل شاغر: ${title}`); toast('تم تحديث الشاغر', 'success'); }
    else { h.openings.push({ id: uid('open'), ...base, postedDate: todayISO(), is_active: true, companyId: coId(), createdAt: new Date().toISOString() }); audit('opening_create', `شاغر جديد: ${title}`); toast('تمت إضافة الشاغر', 'success'); }
    save(); editingOpening = null; renderPeople();
  };
  window.poCloseOpening = function (id) {
    const o = (H()?.openings || []).find(x => x.id === id); if (!o) return;
    o.status = o.status === 'closed' ? 'open' : 'closed';
    audit('opening_status', `${o.title} → ${o.status === 'closed' ? 'مغلق' : 'مفتوح'}`); save(); renderPeople();
  };

  /* ───────────────────────── candidates ───────────────────────── */
  window.poOpenCandidateForm = function (id) { editingCandidate = id || 'new'; activeTab = 'recruitment'; renderPeople(); };
  window.poCancelCandidateForm = function () { editingCandidate = null; renderPeople(); };
  window.poSaveCandidate = function () {
    const h = H(); if (!h) return;
    const name = val('poCandName');
    if (!name) { toast('اسم المتقدّم مطلوب', 'error'); return; }
    const openingId = val('poCandOpening');
    const opening = h.openings.find(o => o.id === openingId);
    const base = {
      name, phone: val('poCandPhone'), openingId, openingTitle: opening ? opening.title : '',
      source: val('poCandSource'), rating: numVal('poCandRating'), interviewDate: val('poCandInterview'),
      notes: val('poCandNotes')
    };
    const ex = editingCandidate && editingCandidate !== 'new' ? h.candidates.find(c => c.id === editingCandidate) : null;
    if (ex) { Object.assign(ex, base); audit('candidate_update', `تعديل متقدّم: ${name}`); toast('تم التحديث', 'success'); }
    else { h.candidates.push({ id: uid('cand'), ...base, stage: 'applied', appliedDate: todayISO(), is_active: true, companyId: coId(), createdAt: new Date().toISOString() }); audit('candidate_create', `متقدّم جديد: ${name}`); toast('تمت إضافة المتقدّم', 'success'); }
    save(); editingCandidate = null; renderPeople();
  };
  window.poMoveStage = function (id, stage) {
    const c = (H()?.candidates || []).find(x => x.id === id); if (!c) return;
    c.stage = stage;
    audit('candidate_stage', `${c.name} → ${STAGE_LABEL[stage]}`);
    save(); toast(`${c.name}: ${STAGE_LABEL[stage]}`, 'info'); renderPeople();
  };
  // Hire = mark hired + audit. Deliberately does NOT auto-create a payroll employee (safety: no salary
  // side-effects). The manager adds the hire on the Employees page; this just records the decision.
  window.poHireCandidate = function (id) {
    const c = (H()?.candidates || []).find(x => x.id === id); if (!c) return;
    if (!confirm(`تعيين "${c.name}"؟ (يُسجَّل كمعيَّن — أضِفه لكشف الرواتب من صفحة الموظفين)`)) return;
    c.stage = 'hired'; c.hiredAt = new Date().toISOString();
    audit('candidate_hired', `تعيين: ${c.name}${c.openingTitle ? ' (' + c.openingTitle + ')' : ''}`);
    save(); toast(`تم تعيين ${c.name} — أضِفه لكشف الرواتب من صفحة الموظفين`, 'success'); renderPeople();
  };
  window.poArchiveCandidate = function (id) {
    const c = (H()?.candidates || []).find(x => x.id === id); if (!c) return;
    if (!confirm(`أرشفة المتقدّم "${c.name}"؟`)) return;
    c.is_active = false; audit('candidate_archive', `أرشفة متقدّم: ${c.name}`); save(); renderPeople();
  };

  /* ───────────────────────── leave ───────────────────────── */
  window.poOpenLeaveForm = function () { showLeaveForm = true; activeTab = 'leave'; renderPeople(); };
  window.poCancelLeaveForm = function () { showLeaveForm = false; renderPeople(); };
  window.poSaveLeave = function () {
    const h = H(); if (!h) return;
    const employeeId = val('poLeaveEmp');
    const emp = getEmployees().find(e => String(e.id) === employeeId || e.name === employeeId);
    if (!emp) { toast('اختر الموظف', 'error'); return; }
    const startDate = val('poLeaveStart'), endDate = val('poLeaveEnd') || startDate;
    if (!startDate) { toast('تاريخ البداية مطلوب', 'error'); return; }
    if (new Date(endDate) < new Date(startDate)) { toast('تاريخ النهاية قبل البداية', 'error'); return; }
    const days = daysInclusive(startDate, endDate);
    h.leaveRequests.unshift({
      id: uid('leave'), employeeId: emp.id || emp.name, employeeName: emp.name,
      type: val('poLeaveType') || 'annual', startDate, endDate, days,
      reason: val('poLeaveReason'), status: 'pending', requestedBy: userName(), requestedAt: new Date().toISOString(),
      companyId: coId()
    });
    audit('leave_request', `طلب إجازة ${LEAVE_TYPE_LABEL[val('poLeaveType') || 'annual']} (${days} يوم) — ${emp.name}`);
    save(); showLeaveForm = false; toast('تم تقديم طلب الإجازة', 'success'); renderPeople();
  };
  window.poDecideLeave = function (id, decision) {
    const l = getLeave().find(x => x.id === id); if (!l) return;
    if (l.status !== 'pending') { toast('تم البت بهذا الطلب مسبقاً', 'info'); return; }
    l.status = decision; l.decidedBy = userName(); l.decidedAt = new Date().toISOString();
    audit('leave_decision', `${decision === 'approved' ? 'موافقة على' : 'رفض'} إجازة ${l.employeeName} (${l.days} يوم)`);
    save(); toast(`الطلب ${LEAVE_STATUS_LABEL[decision]}`, decision === 'approved' ? 'success' : 'info'); renderPeople();
  };

  window.poLoadDemo = function () {
    const h = H(); if (!h) return;
    if (h.openings.length || h.candidates.length) { toast('توجد بيانات مسبقاً', 'info'); return; }
    const o1 = { id: uid('open'), title: 'فني ليزر', department: 'الإنتاج', count: 2, description: 'خبرة بتشغيل مكائن الليزر', status: 'open', postedDate: todayISO(), is_active: true, companyId: coId(), createdAt: new Date().toISOString() };
    const o2 = { id: uid('open'), title: 'مصمم جرافيك', department: 'التصميم', count: 1, description: '', status: 'open', postedDate: todayISO(), is_active: true, companyId: coId(), createdAt: new Date().toISOString() };
    h.openings.push(o1, o2);
    const fwd = n => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
    h.candidates.push(
      { id: uid('cand'), name: 'حسن كريم', phone: '07700000000', openingId: o1.id, openingTitle: o1.title, source: 'إحالة', rating: 4, stage: 'interview', interviewDate: fwd(2), notes: '', appliedDate: todayISO(), is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('cand'), name: 'زينب علي', phone: '07710000000', openingId: o2.id, openingTitle: o2.title, source: 'موقع التواصل', rating: 5, stage: 'offer', interviewDate: '', notes: 'ممتازة', appliedDate: todayISO(), is_active: true, companyId: coId(), createdAt: new Date().toISOString() },
      { id: uid('cand'), name: 'عمر صلاح', phone: '07720000000', openingId: o1.id, openingTitle: o1.title, source: 'إعلان', rating: 3, stage: 'screening', interviewDate: '', notes: '', appliedDate: todayISO(), is_active: true, companyId: coId(), createdAt: new Date().toISOString() }
    );
    const emp = getEmployees()[0];
    if (emp) h.leaveRequests.unshift({ id: uid('leave'), employeeId: emp.id || emp.name, employeeName: emp.name, type: 'annual', startDate: fwd(5), endDate: fwd(8), days: 4, reason: 'سفر عائلي', status: 'pending', requestedBy: userName(), requestedAt: new Date().toISOString(), companyId: coId() });
    audit('hr_demo', 'تحميل بيانات HR تجريبية');
    save(); toast('تم تحميل بيانات تجريبية', 'success'); renderPeople();
  };

  /* ───────────────────────── expense claims (mutations) ───────────────────────── */
  window.poOpenExpenseForm = function () { showExpenseForm = true; activeTab = 'expenses'; renderPeople(); };
  window.poCancelExpenseForm = function () { showExpenseForm = false; renderPeople(); };
  window.poSaveExpense = function () {
    const h = H(); if (!h) return;
    const employeeId = val('poExpEmp');
    const emp = getEmployees().find(e => String(e.id) === employeeId || e.name === employeeId);
    if (!emp) { toast('اختر الموظف', 'error'); return; }
    const amount = money(numVal('poExpAmount'));
    if (amount <= 0) { toast('المبلغ مطلوب', 'error'); return; }
    h.expenseClaims.unshift({
      id: uid('exp'), employeeId: emp.id || emp.name, employeeName: emp.name,
      date: val('poExpDate') || todayISO(), category: val('poExpCategory') || 'أخرى', amount,
      description: val('poExpDesc'), status: 'pending', financeTxnId: '',
      requestedBy: userName(), requestedAt: new Date().toISOString(), companyId: coId()
    });
    audit('expense_claim', `مطالبة مصروف ${fmt(amount)} ${curSym()} — ${emp.name}`);
    save(); showExpenseForm = false; toast('تم تقديم المطالبة', 'success'); renderPeople();
  };
  // Approve = post the reimbursement as an expense owed to the employee (debit expense / credit
  // payables_people via the proven bridge sourceType 'person_pocket'). Explicit, confirmed, manual.
  window.poDecideExpense = function (id, decision) {
    const c = getExpenseClaims().find(x => x.id === id); if (!c) return;
    if (c.status !== 'pending') { toast('تم البت بهذه المطالبة', 'info'); return; }
    if (decision === 'approved') {
      if (!confirm(`اعتماد مطالبة ${c.employeeName} بمبلغ ${fmt(c.amount)} ${curSym()}؟ سيُسجَّل كمصروف مستحق للموظف.`)) return;
      if (money(c.amount) > 0 && typeof window.addFinanceTransaction === 'function') {
        try {
          const txn = window.addFinanceTransaction({
            type: 'expense', direction: 'out', sourceType: 'person_pocket', sourceId: c.id,
            date: c.date, amount: money(c.amount), categoryId: 'cat_general',
            description: `مطالبة مصروف ${c.category} — ${c.employeeName}`, paidByName: c.employeeName, partyName: c.employeeName
          });
          if (txn && txn.id) c.financeTxnId = txn.id;
        } catch (e) { console.warn('expense claim post failed', e); }
      }
    }
    c.status = decision; c.decidedBy = userName(); c.decidedAt = new Date().toISOString();
    audit('expense_decision', `${decision === 'approved' ? 'اعتماد' : 'رفض'} مطالبة ${c.employeeName} (${fmt(c.amount)} ${curSym()})`);
    save(); toast(`المطالبة ${EXPENSE_STATUS_LABEL[decision]}`, decision === 'approved' ? 'success' : 'info'); renderPeople();
  };

  /* ───────────────────────── appraisal (mutations) ───────────────────────── */
  window.poOpenAppraisalForm = function () { showAppraisalForm = true; activeTab = 'appraisal'; renderPeople(); };
  window.poCancelAppraisalForm = function () { showAppraisalForm = false; renderPeople(); };
  window.poSaveAppraisal = function () {
    const h = H(); if (!h) return;
    const employeeId = val('poAprEmp');
    const emp = getEmployees().find(e => String(e.id) === employeeId || e.name === employeeId);
    if (!emp) { toast('اختر الموظف', 'error'); return; }
    const scores = {};
    let sum = 0;
    APPRAISAL_CRITERIA.forEach(([k]) => { const s = Math.max(0, Math.min(5, numVal('poApr_' + k))); scores[k] = s; sum += s; });
    const overall = Math.round((sum / (APPRAISAL_CRITERIA.length * 5)) * 100);
    h.appraisals.unshift({
      id: uid('apr'), employeeId: emp.id || emp.name, employeeName: emp.name,
      period: val('poAprPeriod') || todayISO().slice(0, 7), scores, overall,
      notes: val('poAprNotes'), reviewer: userName(), date: todayISO(), createdAt: new Date().toISOString(), companyId: coId()
    });
    audit('appraisal', `تقييم ${emp.name}: ${overall}%`);
    save(); showAppraisalForm = false; toast('تم حفظ التقييم', 'success'); renderPeople();
  };

  /* ───────────────────────── render ───────────────────────── */
  function kpiCard(label, value, sub, cls) {
    return `<div class="po-kpi ${cls || ''}"><div class="po-kpi-val">${value}</div><div class="po-kpi-label">${label}</div>${sub ? `<div class="po-kpi-sub">${sub}</div>` : ''}</div>`;
  }

  function renderDashboard() {
    const el = document.getElementById('poDashBody'); if (!el) return;
    const p = portfolio();
    const pend = p.pendingLeaveList.map(l => `<tr class="po-row-warn"><td>🌴 إجازة</td><td>${esc(l.employeeName)}</td><td>${LEAVE_TYPE_LABEL[l.type]} · ${l.days} يوم</td><td><button class="po-mini-btn" onclick="poDecideLeave('${l.id}','approved')">موافقة</button> <button class="po-mini-btn po-danger" onclick="poDecideLeave('${l.id}','rejected')">رفض</button></td></tr>`).join('');
    const pendExp = (p.pendingExpenseList || []).map(c => `<tr class="po-row-warn"><td>🧾 مصروف</td><td>${esc(c.employeeName)}</td><td>${esc(c.category)} · ${fmt(c.amount)} ${curSym()}</td><td><button class="po-mini-btn po-hire" onclick="poDecideExpense('${c.id}','approved')">اعتماد</button> <button class="po-mini-btn po-danger" onclick="poDecideExpense('${c.id}','rejected')">رفض</button></td></tr>`).join('');
    const onleave = p.onLeaveList.map(l => `<tr><td>🏖️ بإجازة</td><td>${esc(l.employeeName)}</td><td>${LEAVE_TYPE_LABEL[l.type]} حتى ${esc(l.endDate)}</td><td><span class="po-muted">${l.days} يوم</span></td></tr>`).join('');
    el.innerHTML = `
      <div class="po-kpi-grid">
        ${kpiCard('شواغر مفتوحة', p.openPositions, 'وظائف قيد التوظيف', '')}
        ${kpiCard('في مسار التوظيف', p.pipeline, `${p.hired} تم تعيينهم`, 'po-kpi-accent')}
        ${kpiCard('مقابلات هذا الأسبوع', p.interviewsThisWeek, 'خلال 7 أيام', p.interviewsThisWeek ? 'po-kpi-warn' : '')}
        ${kpiCard('طلبات إجازة معلّقة', p.pendingLeave, 'تحتاج قراراً', p.pendingLeave ? 'po-kpi-warn' : '')}
        ${kpiCard('بإجازة اليوم', p.onLeaveToday, 'موظفون غائبون', '')}
      </div>
      <div class="po-panel">
        <div class="po-panel-head"><h3>🔔 يحتاج إجراءً</h3><button class="po-mini-btn" onclick="poOpenTab('leave')">إدارة الإجازات</button></div>
        <table class="po-table"><thead><tr><th>النوع</th><th>الموظف</th><th>التفاصيل</th><th>إجراء</th></tr></thead>
        <tbody>${pend + pendExp + onleave || '<tr><td colspan="4" class="po-empty">لا يوجد ما يحتاج إجراءً ✅</td></tr>'}</tbody></table>
      </div>`;
  }

  function renderRecruitment() {
    const el = document.getElementById('poRecBody'); if (!el) return;
    if (editingOpening) { el.innerHTML = renderOpeningForm(); return; }
    if (editingCandidate) { el.innerHTML = renderCandidateForm(); return; }
    let cands = getCandidates();
    if (candSearch) { const q = candSearch.toLowerCase(); cands = cands.filter(c => `${c.name} ${c.openingTitle} ${c.phone}`.toLowerCase().includes(q)); }
    const openings = getOpenings();
    const stars = n => '★'.repeat(Math.max(0, Math.min(5, Math.round(n || 0)))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Math.round(n || 0))));
    const nextStageBtn = (c) => {
      const order = ['applied', 'screening', 'interview', 'offer'];
      const i = order.indexOf(c.stage);
      if (i >= 0 && i < order.length - 1) return `<button class="po-mini-btn" onclick="poMoveStage('${c.id}','${order[i + 1]}')">→ ${STAGE_LABEL[order[i + 1]]}</button>`;
      if (c.stage === 'offer') return `<button class="po-mini-btn po-hire" onclick="poHireCandidate('${c.id}')">تعيين</button>`;
      return '';
    };
    el.innerHTML = `
      <div class="po-toolbar">
        <button class="btn-primary" onclick="poOpenOpeningForm('new')">➕ شاغر</button>
        <button class="btn-primary" onclick="poOpenCandidateForm('new')">➕ متقدّم</button>
        <button class="po-mini-btn" onclick="poLoadDemo()">بيانات تجريبية</button>
        <input class="po-input" placeholder="بحث بالمتقدّمين..." value="${esc(candSearch)}" oninput="poCandSearch(this.value)" style="max-width:220px">
      </div>
      <div class="po-panel">
        <div class="po-panel-head"><h3>📋 الشواغر (${openings.filter(o => o.status !== 'closed').length} مفتوح)</h3></div>
        <table class="po-table"><thead><tr><th>المسمى</th><th>القسم</th><th>العدد</th><th>متقدّمون</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${openings.map(o => {
          const n = getCandidates().filter(c => c.openingId === o.id && !['hired', 'rejected'].includes(c.stage)).length;
          return `<tr><td><strong>${esc(o.title)}</strong></td><td>${esc(o.department || '—')}</td><td>${o.count}</td><td>${n}</td>
            <td><span class="po-badge ${o.status === 'closed' ? 'po-st-rejected' : 'po-st-hired'}">${o.status === 'closed' ? 'مغلق' : 'مفتوح'}</span></td>
            <td class="po-actions"><button class="po-mini-btn" onclick="poOpenOpeningForm('${o.id}')">تعديل</button><button class="po-mini-btn" onclick="poCloseOpening('${o.id}')">${o.status === 'closed' ? 'إعادة فتح' : 'إغلاق'}</button></td></tr>`;
        }).join('') || '<tr><td colspan="6" class="po-empty">لا توجد شواغر</td></tr>'}</tbody></table>
      </div>
      <div class="po-panel">
        <div class="po-panel-head"><h3>👤 مسار المتقدّمين</h3></div>
        <table class="po-table"><thead><tr><th>المتقدّم</th><th>الشاغر</th><th>التقييم</th><th>المرحلة</th><th>المقابلة</th><th>إجراءات</th></tr></thead>
        <tbody>${cands.map(c => `<tr>
          <td><strong>${esc(c.name)}</strong>${c.phone ? `<br><span class="po-muted">${esc(c.phone)}</span>` : ''}</td>
          <td>${esc(c.openingTitle || '—')}</td>
          <td><span class="po-stars">${stars(c.rating)}</span></td>
          <td><span class="po-badge ${STAGE_CLASS[c.stage] || ''}">${STAGE_LABEL[c.stage] || c.stage}</span></td>
          <td class="po-muted">${esc(c.interviewDate || '—')}</td>
          <td class="po-actions">${nextStageBtn(c)}<button class="po-mini-btn" onclick="poOpenCandidateForm('${c.id}')">تعديل</button>${!['hired', 'rejected'].includes(c.stage) ? `<button class="po-mini-btn po-danger" onclick="poMoveStage('${c.id}','rejected')">رفض</button>` : ''}</td>
        </tr>`).join('') || '<tr><td colspan="6" class="po-empty">لا يوجد متقدّمون</td></tr>'}</tbody></table>
      </div>`;
  }
  function renderOpeningForm() {
    const o = editingOpening !== 'new' ? (H()?.openings || []).find(x => x.id === editingOpening) : null;
    const v = o || {};
    const st = (c) => [['open', 'مفتوح'], ['closed', 'مغلق']].map(([k, l]) => `<option value="${k}" ${c === k ? 'selected' : ''}>${l}</option>`).join('');
    return `<div class="po-panel"><div class="po-panel-head"><h3>${o ? 'تعديل شاغر' : 'شاغر جديد'}</h3></div>
      <div class="po-form-grid">
        <div><label>المسمى الوظيفي *</label><input id="poOpTitle" class="po-input" value="${esc(v.title || '')}"></div>
        <div><label>القسم</label><input id="poOpDept" class="po-input" value="${esc(v.department || '')}"></div>
        <div><label>العدد المطلوب</label><input id="poOpCount" type="number" class="po-input" value="${v.count || 1}"></div>
        <div><label>الحالة</label><select id="poOpStatus" class="po-input">${st(v.status || 'open')}</select></div>
        <div class="po-form-full"><label>الوصف</label><input id="poOpDesc" class="po-input" value="${esc(v.description || '')}"></div>
      </div>
      <div class="po-form-actions"><button class="btn-primary" onclick="poSaveOpening()">حفظ</button><button class="po-mini-btn" onclick="poCancelOpeningForm()">إلغاء</button></div></div>`;
  }
  function renderCandidateForm() {
    const c = editingCandidate !== 'new' ? (H()?.candidates || []).find(x => x.id === editingCandidate) : null;
    const v = c || {};
    const opOpts = ['<option value="">— بدون شاغر —</option>'].concat(getOpenings().map(o => `<option value="${o.id}" ${v.openingId === o.id ? 'selected' : ''}>${esc(o.title)}</option>`)).join('');
    return `<div class="po-panel"><div class="po-panel-head"><h3>${c ? 'تعديل متقدّم' : 'متقدّم جديد'}</h3></div>
      <div class="po-form-grid">
        <div><label>الاسم *</label><input id="poCandName" class="po-input" value="${esc(v.name || '')}"></div>
        <div><label>الهاتف</label><input id="poCandPhone" class="po-input" value="${esc(v.phone || '')}"></div>
        <div><label>الشاغر</label><select id="poCandOpening" class="po-input">${opOpts}</select></div>
        <div><label>المصدر</label><input id="poCandSource" class="po-input" value="${esc(v.source || '')}" placeholder="إحالة / إعلان / موقع"></div>
        <div><label>التقييم (0-5)</label><input id="poCandRating" type="number" min="0" max="5" class="po-input" value="${v.rating || ''}"></div>
        <div><label>موعد المقابلة</label><input id="poCandInterview" type="date" class="po-input" value="${esc(v.interviewDate || '')}"></div>
        <div class="po-form-full"><label>ملاحظات</label><input id="poCandNotes" class="po-input" value="${esc(v.notes || '')}"></div>
      </div>
      <div class="po-form-actions"><button class="btn-primary" onclick="poSaveCandidate()">حفظ</button><button class="po-mini-btn" onclick="poCancelCandidateForm()">إلغاء</button></div></div>`;
  }

  function renderLeave() {
    const el = document.getElementById('poLeaveBody'); if (!el) return;
    if (showLeaveForm) { el.innerHTML = renderLeaveForm(); return; }
    const leave = getLeave().slice(0, 40);
    const emps = getEmployees();
    el.innerHTML = `
      <div class="po-toolbar"><button class="btn-primary" onclick="poOpenLeaveForm()">➕ طلب إجازة</button></div>
      <div class="po-panel">
        <div class="po-panel-head"><h3>📅 طلبات الإجازات</h3></div>
        <table class="po-table"><thead><tr><th>الموظف</th><th>النوع</th><th>من</th><th>إلى</th><th>الأيام</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${leave.map(l => `<tr class="${l.status === 'pending' ? 'po-row-warn' : ''}">
          <td><strong>${esc(l.employeeName)}</strong></td><td>${LEAVE_TYPE_LABEL[l.type] || l.type}</td>
          <td class="po-muted">${esc(l.startDate)}</td><td class="po-muted">${esc(l.endDate)}</td><td>${l.days}</td>
          <td><span class="po-badge ${LEAVE_STATUS_CLASS[l.status] || ''}">${LEAVE_STATUS_LABEL[l.status] || l.status}</span></td>
          <td class="po-actions">${l.status === 'pending' ? `<button class="po-mini-btn po-hire" onclick="poDecideLeave('${l.id}','approved')">موافقة</button><button class="po-mini-btn po-danger" onclick="poDecideLeave('${l.id}','rejected')">رفض</button>` : `<span class="po-muted">${esc(l.decidedBy || '')}</span>`}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="po-empty">لا توجد طلبات إجازة</td></tr>'}</tbody></table>
      </div>
      <div class="po-panel">
        <div class="po-panel-head"><h3>🗂️ أرصدة الإجازة السنوية (${ANNUAL_ENTITLEMENT} يوم/سنة)</h3></div>
        <table class="po-table"><thead><tr><th>الموظف</th><th>الاستحقاق</th><th>المستخدم</th><th>المتبقي</th></tr></thead>
        <tbody>${emps.slice(0, 50).map(e => { const b = leaveBalance(e.name); return `<tr><td>${esc(e.name)}</td><td>${b.entitlement}</td><td>${b.taken}</td><td><strong>${b.remaining}</strong></td></tr>`; }).join('') || '<tr><td colspan="4" class="po-empty">لا يوجد موظفون مسجّلون</td></tr>'}</tbody></table>
      </div>`;
  }
  function renderLeaveForm() {
    const emps = getEmployees();
    const empOpts = ['<option value="">— اختر الموظف —</option>'].concat(emps.map(e => `<option value="${esc(String(e.id || e.name))}">${esc(e.name)}</option>`)).join('');
    const tOpts = LEAVE_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
    return `<div class="po-panel"><div class="po-panel-head"><h3>طلب إجازة جديد</h3></div>
      <div class="po-form-grid">
        <div><label>الموظف *</label><select id="poLeaveEmp" class="po-input">${empOpts}</select></div>
        <div><label>نوع الإجازة</label><select id="poLeaveType" class="po-input">${tOpts}</select></div>
        <div><label>من *</label><input id="poLeaveStart" type="date" class="po-input" value="${todayISO()}"></div>
        <div><label>إلى</label><input id="poLeaveEnd" type="date" class="po-input" value="${todayISO()}"></div>
        <div class="po-form-full"><label>السبب</label><input id="poLeaveReason" class="po-input"></div>
      </div>
      <div class="po-form-actions"><button class="btn-primary" onclick="poSaveLeave()">تقديم الطلب</button><button class="po-mini-btn" onclick="poCancelLeaveForm()">إلغاء</button></div></div>`;
  }

  function renderExpenses() {
    const el = document.getElementById('poExpBody'); if (!el) return;
    if (showExpenseForm) { el.innerHTML = renderExpenseForm(); return; }
    const claims = getExpenseClaims().slice(0, 40);
    const pendingTotal = getExpenseClaims().filter(c => c.status === 'pending').reduce((s, c) => s + money(c.amount), 0);
    const approvedTotal = getExpenseClaims().filter(c => c.status === 'approved').reduce((s, c) => s + money(c.amount), 0);
    el.innerHTML = `
      <div class="po-toolbar"><button class="btn-primary" onclick="poOpenExpenseForm()">➕ مطالبة مصروف</button>
        <span class="po-muted">معلّقة: ${fmt(pendingTotal)} ${curSym()} · معتمدة مستحقة: ${fmt(approvedTotal)} ${curSym()}</span></div>
      <div class="po-panel"><div class="po-panel-head"><h3>🧾 مطالبات مصاريف الموظفين</h3></div>
        <table class="po-table"><thead><tr><th>الموظف</th><th>التاريخ</th><th>الفئة</th><th>المبلغ</th><th>الوصف</th><th>الحالة</th><th>إجراءات</th></tr></thead>
        <tbody>${claims.map(c => `<tr class="${c.status === 'pending' ? 'po-row-warn' : ''}">
          <td><strong>${esc(c.employeeName)}</strong></td><td class="po-muted">${esc(c.date)}</td><td>${esc(c.category)}</td>
          <td>${fmt(c.amount)} ${curSym()}</td><td class="po-muted">${esc(c.description || '')}</td>
          <td><span class="po-badge ${EXPENSE_STATUS_CLASS[c.status] || ''}">${EXPENSE_STATUS_LABEL[c.status] || c.status}</span></td>
          <td class="po-actions">${c.status === 'pending' ? `<button class="po-mini-btn po-hire" onclick="poDecideExpense('${c.id}','approved')">اعتماد</button><button class="po-mini-btn po-danger" onclick="poDecideExpense('${c.id}','rejected')">رفض</button>` : `<span class="po-muted">${esc(c.decidedBy || '')}</span>`}</td>
        </tr>`).join('') || '<tr><td colspan="7" class="po-empty">لا توجد مطالبات</td></tr>'}</tbody></table>
      </div>`;
  }
  function renderExpenseForm() {
    const emps = getEmployees();
    const empOpts = ['<option value="">— اختر الموظف —</option>'].concat(emps.map(e => `<option value="${esc(String(e.id || e.name))}">${esc(e.name)}</option>`)).join('');
    const cOpts = EXPENSE_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    return `<div class="po-panel"><div class="po-panel-head"><h3>مطالبة مصروف جديدة</h3></div>
      <div class="po-form-grid">
        <div><label>الموظف *</label><select id="poExpEmp" class="po-input">${empOpts}</select></div>
        <div><label>التاريخ</label><input id="poExpDate" type="date" class="po-input" value="${todayISO()}"></div>
        <div><label>الفئة</label><select id="poExpCategory" class="po-input">${cOpts}</select></div>
        <div><label>المبلغ (${curSym()}) *</label><input id="poExpAmount" type="number" class="po-input"></div>
        <div class="po-form-full"><label>الوصف</label><input id="poExpDesc" class="po-input" placeholder="تفاصيل المصروف"></div>
      </div>
      <div class="po-form-actions"><button class="btn-primary" onclick="poSaveExpense()">تقديم</button><button class="po-mini-btn" onclick="poCancelExpenseForm()">إلغاء</button></div></div>`;
  }

  function renderAppraisal() {
    const el = document.getElementById('poAprBody'); if (!el) return;
    if (showAppraisalForm) { el.innerHTML = renderAppraisalForm(); return; }
    const apr = getAppraisals().slice(0, 40);
    const scoreBadge = o => `<span class="po-badge ${o >= 75 ? 'po-st-hired' : o >= 50 ? 'po-st-screening' : 'po-st-rejected'}">${o}%</span>`;
    el.innerHTML = `
      <div class="po-toolbar"><button class="btn-primary" onclick="poOpenAppraisalForm()">➕ تقييم أداء</button></div>
      <div class="po-panel"><div class="po-panel-head"><h3>⭐ تقييمات الأداء</h3></div>
        <table class="po-table"><thead><tr><th>الموظف</th><th>الفترة</th>${APPRAISAL_CRITERIA.map(([, l]) => `<th>${l}</th>`).join('')}<th>الإجمالي</th><th>المقيّم</th></tr></thead>
        <tbody>${apr.map(a => `<tr><td><strong>${esc(a.employeeName)}</strong></td><td class="po-muted">${esc(a.period)}</td>${APPRAISAL_CRITERIA.map(([k]) => `<td>${a.scores && a.scores[k] != null ? a.scores[k] + '/5' : '—'}</td>`).join('')}<td>${scoreBadge(a.overall)}</td><td class="po-muted">${esc(a.reviewer || '')}</td></tr>`).join('') || `<tr><td colspan="${APPRAISAL_CRITERIA.length + 4}" class="po-empty">لا توجد تقييمات</td></tr>`}</tbody></table>
      </div>`;
  }
  function renderAppraisalForm() {
    const emps = getEmployees();
    const empOpts = ['<option value="">— اختر الموظف —</option>'].concat(emps.map(e => `<option value="${esc(String(e.id || e.name))}">${esc(e.name)}</option>`)).join('');
    return `<div class="po-panel"><div class="po-panel-head"><h3>تقييم أداء جديد</h3></div>
      <div class="po-form-grid">
        <div><label>الموظف *</label><select id="poAprEmp" class="po-input">${empOpts}</select></div>
        <div><label>الفترة</label><input id="poAprPeriod" class="po-input" value="${todayISO().slice(0, 7)}" placeholder="YYYY-MM"></div>
        ${APPRAISAL_CRITERIA.map(([k, l]) => `<div><label>${l} (0-5)</label><input id="poApr_${k}" type="number" min="0" max="5" class="po-input" value="3"></div>`).join('')}
        <div class="po-form-full"><label>ملاحظات</label><textarea id="poAprNotes" class="po-input" rows="2"></textarea></div>
      </div>
      <div class="po-form-actions"><button class="btn-primary" onclick="poSaveAppraisal()">حفظ التقييم</button><button class="po-mini-btn" onclick="poCancelAppraisalForm()">إلغاء</button></div></div>`;
  }

  function renderHrms() {
    const el = document.getElementById('poHrmsBody'); if (!el) return;
    const m = HRMS() || {};
    const s = getHrmsSignals();
    const employees = getEmployees();
    const contractRows = (m.contracts || []).slice(0, 8).map(c => `<tr><td>${esc(c.employeeName || c.employeeId || '—')}</td><td>${esc(c.contractType || 'employment')}</td><td>${esc(c.status || 'draft')}</td><td>${esc(c.startDate || '—')}</td><td>${esc(c.endDate || '—')}</td><td>${esc(c.documentId || '—')}</td></tr>`).join('');
    const orgRows = employees.slice(0, 12).map(e => `<tr><td><strong>${esc(e.name || '—')}</strong></td><td>${esc(e.department || e.dept || '—')}</td><td>${esc(e.jobTitle || e.position || e.role || '—')}</td><td>${esc(e.managerName || e.manager || e.supervisor || '—')}</td></tr>`).join('');
    const lifecycleRows = [
      ['Contracts lifecycle', hrmsStatusPill(s.contractMissing === 0 && s.expiringContracts === 0, 'ready', `${s.contractMissing} missing / ${s.expiringContracts} expiring`), '`omni.peopleOps.hrms.contracts` links employee contracts to documents and renewal dates.'],
      ['Org chart', hrmsStatusPill(s.missingManagers === 0 && s.employees > 0, 'mapped', `${s.missingManagers} missing managers`), 'Uses employee department, title, manager/supervisor fields to expose reporting gaps.'],
      ['Onboarding', hrmsStatusPill(s.openOnboarding === 0, 'clear', `${s.openOnboarding} open`), 'Checklist root: required documents, trainer, custody, access, payroll setup, probation review.'],
      ['Offboarding', hrmsStatusPill(s.openOffboarding === 0, 'clear', `${s.openOffboarding} open`), 'Exit path: approvals, custody return, access removal, final settlement, archive, exit interview.'],
      ['Leave impact', hrmsStatusPill(s.leaveImpact.pending === 0, 'reviewed', `${s.leaveImpact.pending} pending`), `${s.leaveImpact.days} tracked days, ${s.leaveImpact.unpaidDays} unpaid days. Preview only; no payroll or attendance mutation.`],
      ['Custody/assets', hrmsStatusPill(s.custodyOpen === 0, 'clear', `${s.custodyOpen} open`), 'Tracks employee custody and blocks offboarding readiness until return evidence exists.'],
      ['Disciplinary actions', hrmsStatusPill(s.openDiscipline === 0, 'clear', `${s.openDiscipline} open`), 'Incident, action, evidence, approval, payroll-impact warning; no automatic deductions.'],
      ['Performance reviews', hrmsStatusPill(s.appraisals > 0, `${s.appraisals} records`, 'no reviews'), 'Combines existing appraisal records with HRMS review root for lifecycle history.'],
      ['Workforce planning', hrmsStatusPill(s.workforceGaps === 0, 'balanced', `${s.workforceGaps} gaps`), 'Planned vs current headcount by role, department, branch, and skill demand.'],
      ['Skills matrix', hrmsStatusPill(s.skillGaps === 0, 'covered', `${s.skillGaps} gaps`), 'Required/current skill level, certification, expiry, and training action tracking.'],
      ['Final settlement', hrmsStatusPill(s.pendingSettlements === 0, 'clear', `${s.pendingSettlements} pending`), 'Dues, deductions, custody, leave balance, approval, and payment status.']
    ];
    el.innerHTML = `
      <div class="po-kpi-grid">
        ${kpiCard('Employees', s.employees, 'HRMS scope baseline', '')}
        ${kpiCard('Contract gaps', s.contractMissing, `${s.expiringContracts} expiring in 60 days`, s.contractMissing || s.expiringContracts ? 'po-kpi-warn' : '')}
        ${kpiCard('Lifecycle cases', s.openOnboarding + s.openOffboarding, 'onboarding + offboarding open', s.openOnboarding || s.openOffboarding ? 'po-kpi-warn' : '')}
        ${kpiCard('Custody open', s.custodyOpen, 'assets/tools not returned', s.custodyOpen ? 'po-kpi-warn' : '')}
        ${kpiCard('Leave impact', s.leaveImpact.days, `${s.leaveImpact.pending} pending requests`, s.leaveImpact.pending ? 'po-kpi-warn' : '')}
      </div>
      <div class="po-panel">
        <div class="po-panel-head"><h3>HRMS Lifecycle Foundation</h3><span class="po-muted">Policy: preview-only payroll impact, approval-gated HR changes</span></div>
        <div class="po-table-wrap"><table class="po-table"><thead><tr><th>Area</th><th>Status</th><th>What is wired</th></tr></thead>
        <tbody>${lifecycleRows.map(r => `<tr><td><strong>${r[0]}</strong></td><td>${r[1]}</td><td class="po-muted">${r[2]}</td></tr>`).join('')}</tbody></table></div>
      </div>
      <div class="po-grid-2">
        <div class="po-panel">
          <div class="po-panel-head"><h3>Org Chart Snapshot</h3></div>
          <div class="po-table-wrap"><table class="po-table"><thead><tr><th>Employee</th><th>Department</th><th>Title</th><th>Manager</th></tr></thead><tbody>${orgRows || '<tr><td colspan="4" class="po-empty">No employees loaded</td></tr>'}</tbody></table></div>
        </div>
        <div class="po-panel">
          <div class="po-panel-head"><h3>Data Roots</h3></div>
          <ul class="po-compact-list">
            ${hrmsMiniList(['contracts', 'onboardingCases', 'offboardingCases', 'custodyRecords', 'disciplinaryActions', 'performanceReviews', 'workforcePlan', 'skillsMatrix', 'finalSettlements'].map(k => 'omni.peopleOps.hrms.' + k))}
          </ul>
        </div>
      </div>
      <div class="po-panel">
        <div class="po-panel-head"><h3>Contract Lifecycle Records</h3><span class="po-muted">Linked document IDs are placeholders until document/contracts workflow creates them.</span></div>
        <div class="po-table-wrap"><table class="po-table"><thead><tr><th>Employee</th><th>Type</th><th>Status</th><th>Start</th><th>End</th><th>Document</th></tr></thead>
        <tbody>${contractRows || '<tr><td colspan="6" class="po-empty">No contract lifecycle records yet</td></tr>'}</tbody></table></div>
      </div>`;
  }

  function renderTabContent() {
    const map = { poDashBody: 'dashboard', poRecBody: 'recruitment', poLeaveBody: 'leave', poExpBody: 'expenses', poAprBody: 'appraisal', poHrmsBody: 'hrms' };
    Object.keys(map).forEach(id => { const e = document.getElementById(id); if (e) e.style.display = map[id] === activeTab ? '' : 'none'; });
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'recruitment') renderRecruitment();
    else if (activeTab === 'leave') renderLeave();
    else if (activeTab === 'expenses') renderExpenses();
    else if (activeTab === 'appraisal') renderAppraisal();
    else if (activeTab === 'hrms') renderHrms();
  }

  function renderPeople() {
    const body = document.getElementById('peopleOpsBody'); if (!body) return;
    ensureData();
    const tabs = [['dashboard', '📊 اللوحة'], ['recruitment', '🧑‍💼 التوظيف'], ['leave', '🌴 الإجازات'], ['expenses', '🧾 المصاريف'], ['appraisal', '⭐ التقييم'], ['hrms', 'HRMS Lifecycle']];
    body.innerHTML = `<div class="po-tabs">${tabs.map(([k, l]) => `<button class="po-tab-btn ${activeTab === k ? 'active' : ''}" onclick="poOpenTab('${k}')">${l}</button>`).join('')}</div>
      <div id="poDashBody"></div><div id="poRecBody"></div><div id="poLeaveBody"></div><div id="poExpBody"></div><div id="poAprBody"></div><div id="poHrmsBody"></div>`;
    renderTabContent();
  }
  window.renderPeopleOps = renderPeople;

  /* ───────────────────────── switchPage hook ───────────────────────── */
  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'people_ops') {
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pagePeopleOps'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navPeopleOps'); if (nav) nav.classList.add('active');
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('people_ops');
      } catch (_) {}
      ensureData();
      setTimeout(renderPeople, 0);
    }
  };

  /* ───────────────────────── Jarvis tool ───────────────────────── */
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_hr_today'] = function () {
          const p = portfolio();
          const h = getHrmsSignals();
          return {
            openPositions: p.openPositions, candidatesInPipeline: p.pipeline, hired: p.hired,
            interviewsThisWeek: p.interviewsThisWeek, pendingLeaveRequests: p.pendingLeave,
            onLeaveToday: p.onLeaveList.map(l => ({ employee: l.employeeName, type: l.type, until: l.endDate })),
            pendingExpenseClaims: getExpenseClaims().filter(c => c.status === 'pending').length,
            pendingExpenseAmount: getExpenseClaims().filter(c => c.status === 'pending').reduce((s, c) => s + money(c.amount), 0),
            appraisalsRecorded: getAppraisals().length,
            hrms: {
              employees: h.employees,
              contractMissing: h.contractMissing,
              expiringContracts: h.expiringContracts,
              openOnboarding: h.openOnboarding,
              openOffboarding: h.openOffboarding,
              custodyOpen: h.custodyOpen,
              pendingSettlements: h.pendingSettlements,
              payrollMutationMode: 'preview_only'
            }
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['people_ops'] = '#pagePeopleOps';
      }
    } catch (_) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis);
  else setTimeout(registerJarvis, 600);

  window.OctagonPeopleOps = { render: renderPeople, ensureData, portfolio, leaveBalance, HRMS, getHrmsSignals, renderHrms };
})();
