/**
 * OCTAGON ERP — Clinic Vertical (Phase 5, third industry vertical).
 * Complete clinic on shared engines:
 *  - Patient registry: DOB, gender, blood type, allergies, chronic conditions.
 *  - Appointment booking: doctor, service, status workflow (scheduled→arrived→in_progress→done→cancelled).
 *  - Medical records per visit: complaints, vitals, diagnosis, treatment, prescriptions.
 *  - Services catalog with pricing.
 *  - Invoice per visit: auto-created on appointment completion, cash/insurance/account.
 *  - Today's schedule board + waiting queue.
 *  - Jarvis tool: report_clinic_today self-registered.
 * Add-only: wraps switchPage (same pattern as other verticals).
 */
(function () {
  'use strict';

  /* ─────────────── helpers ─────────────── */
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
  function orgName() { const o = O(); return (o && o.adminSettings && o.adminSettings.organization && o.adminSettings.organization.name) || 'Octagon'; }
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }
  function numVal(id) { const v = Number(val(id)); return isFinite(v) ? v : 0; }
  function userName() {
    try { if (window.PentagonAuth && PentagonAuth.currentUser) return PentagonAuth.currentUser.name; } catch (_) {}
    return 'طبيب';
  }
  function hist(action, summary, payload) {
    if (typeof window.recordOmniHistoryEvent === 'function')
      try { window.recordOmniHistoryEvent({ module: 'clinic', source: 'clinic', action, summary, payload: payload || {} }); } catch (_) {}
  }

  /* ─────────────── data layer ─────────────── */
  function ensureData() {
    const o = O(); if (!o) return null;
    if (!o.clinic || typeof o.clinic !== 'object') o.clinic = {};
    const c = o.clinic;
    if (!Array.isArray(c.patients)) c.patients = [];
    if (!Array.isArray(c.appointments)) c.appointments = [];
    if (!Array.isArray(c.services)) c.services = [];
    if (!Array.isArray(c.records)) c.records = [];
    if (!Array.isArray(c.invoices)) c.invoices = [];
    if (!c.settings) c.settings = { defaultDoctor: 'الطبيب', nearApptMinutes: 30 };
    return c;
  }
  function C() { return ensureData(); }
  function patients() {
    const c = C();
    const list = c ? c.patients : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function appointments() {
    const c = C();
    const list = c ? c.appointments : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function services() {
    const c = C();
    const list = c ? c.services : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function records() {
    const c = C();
    const list = c ? c.records : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }
  function invoices() {
    const c = C();
    const list = c ? c.invoices : [];
    return typeof window.scoped === 'function' ? window.scoped(list) : list;
  }

  const STATUS_LABEL = { scheduled: 'محدد موعد', arrived: 'وصل', in_progress: 'قيد الفحص', done: 'مكتمل', cancelled: 'ملغي' };
  const STATUS_NEXT = { scheduled: 'arrived', arrived: 'in_progress', in_progress: 'done' };
  const STATUS_CLASS = { scheduled: 'cl-status-sched', arrived: 'cl-status-arrived', in_progress: 'cl-status-prog', done: 'cl-status-done', cancelled: 'cl-status-cancel' };

  /* ─────────────── state ─────────────── */
  let activeTab = 'schedule';
  let editingPatientId = null;
  let editingServiceId = null;
  let viewingApptId = null;
  let patSearch = '';

  /* ─────────────── appointment actions ─────────────── */
  window.clAdvanceAppt = function (id) {
    const c = C(); if (!c) return;
    const appt = appointments().find(a => a.id === id);
    if (!appt) return;
    const next = STATUS_NEXT[appt.status];
    if (!next) { toast('الموعد مكتمل بالفعل', 'info'); return; }
    appt.status = next;
    appt.updatedAt = new Date().toISOString();
    if (next === 'in_progress') appt.startedAt = appt.updatedAt;
    if (next === 'done') { appt.completedAt = appt.updatedAt; clCreateInvoice(appt); }
    hist('appt_advance', (STATUS_LABEL[next] || next) + ' — ' + appt.ref);
    save(); renderClinic();
  };

  window.clCancelAppt = function (id) {
    const c = C(); if (!c) return;
    const appt = appointments().find(a => a.id === id);
    if (!appt || appt.status === 'done') return;
    appt.status = 'cancelled'; appt.updatedAt = new Date().toISOString();
    hist('appt_cancel', 'إلغاء موعد ' + appt.ref);
    save(); renderClinic();
  };

  window.clOpenRecord = function (apptId) {
    viewingApptId = apptId;
    activeTab = 'record';
    renderClinic();
  };

  window.clSaveRecord = function () {
    const c = C(); if (!c) return;
    const appt = appointments().find(a => a.id === viewingApptId);
    if (!appt) return;
    const coId = appt.companyId || (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const record = {
      id: uid('clr'), apptId: viewingApptId, patientId: appt.patientId,
      complaints: val('clRecComplaints'), vitals: {
        bp: val('clVitBP'), temp: val('clVitTemp'), pulse: val('clVitPulse'), weight: val('clVitWeight')
      },
      diagnosis: val('clRecDiagnosis'), treatment: val('clRecTreatment'),
      prescription: val('clRecPrescription'), notes: val('clRecNotes'),
      doctor: val('clRecDoctor') || userName(), at: new Date().toISOString(),
      companyId: coId
    };
    // replace existing record for this appt if any
    const idx = c.records.findIndex(r => r.apptId === viewingApptId);
    if (idx >= 0) c.records[idx] = record; else c.records.push(record);
    appt.hasRecord = true;
    hist('record_save', 'سجل طبي — ' + appt.ref, { patientId: appt.patientId });
    save();
    toast('تم حفظ السجل الطبي', 'success');
    viewingApptId = null; activeTab = 'schedule';
    renderClinic();
  };

  window.clCancelRecord = function () { viewingApptId = null; activeTab = 'schedule'; renderClinic(); };

  /* ─────────────── booking ─────────────── */
  window.clBookAppt = function () {
    const c = C(); if (!c) return;
    const patientId = val('clApptPatient');
    const serviceId = val('clApptService');
    const date = val('clApptDate');
    const time = val('clApptTime');
    if (!patientId || !serviceId || !date || !time) { toast('كل الحقول مطلوبة', 'warning'); return; }
    const patient = patients().find(p => p.id === patientId);
    const service = services().find(s => s.id === serviceId);
    if (!patient || !service) return;
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const apptCount = appointments().length + 1;
    const ref = 'CL-' + new Date().getFullYear() + '-' + String(apptCount).padStart(4, '0');
    const appt = {
      id: uid('cla'), ref, patientId, patientName: patient.name, patientPhone: patient.phone,
      serviceId, serviceName: service.name, servicePrice: service.price,
      doctor: val('clApptDoctor') || c.settings.defaultDoctor || userName(),
      date, time, status: 'scheduled', notes: val('clApptNotes'),
      hasRecord: false, hasInvoice: false,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      companyId: coId
    };
    c.appointments.push(appt);
    hist('appt_book', ref + ' — ' + patient.name + ' / ' + service.name);
    save(); toast('تم حجز الموعد: ' + ref, 'success');
    activeTab = 'schedule'; renderClinic();
  };

  /* ─────────────── invoicing ─────────────── */
  function clCreateInvoice(appt) {
    const c = C(); if (!c) return;
    if (appt.hasInvoice) return;
    const invId = uid('cli');
    const coId = appt.companyId || (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    const inv = {
      id: invId, apptId: appt.id, ref: appt.ref.replace('CL-', 'INV-CL-'),
      patientId: appt.patientId, patientName: appt.patientName,
      serviceName: appt.serviceName, amount: appt.servicePrice,
      status: 'unpaid', paidAmount: 0, at: new Date().toISOString(),
      companyId: coId
    };
    c.invoices.push(inv);
    appt.hasInvoice = true; appt.invoiceId = invId;
  }

  window.clPayInvoice = function (invId, mode) {
    const c = C(); if (!c) return;
    const inv = invoices().find(i => i.id === invId);
    if (!inv || inv.status === 'paid') return;
    inv.status = 'paid'; inv.paidAmount = inv.amount; inv.payMode = mode || 'cash'; inv.paidAt = new Date().toISOString();
    if (typeof window.addFinanceTransaction === 'function') {
      try {
        window.addFinanceTransaction({
          id: uid('cltxn'), type: mode === 'account' ? 'customer_charge' : 'income',
          amount: inv.amount, category: 'إيرادات عيادة', note: inv.ref + ' — ' + inv.patientName,
          sourceType: 'clinic_invoice', sourceId: invId, at: inv.paidAt, by: userName(),
          companyId: inv.companyId || ''
        });
      } catch (_) {}
    }
    hist('invoice_pay', inv.ref + ' — ' + fmt(inv.amount) + ' ' + curSym());
    save(); toast('تم تسجيل الدفع: ' + inv.ref, 'success');
    renderClinic();
  };

  /* ─────────────── patient CRUD ─────────────── */
  window.clOpenPatientForm = function (id) { editingPatientId = id || null; activeTab = 'patients'; renderClinic(); };

  window.clSavePatient = function () {
    const c = C(); if (!c) return;
    const name = val('clPatName');
    if (!name) { toast('اسم المريض مطلوب', 'warning'); return; }
    const base = {
      name, phone: val('clPatPhone'), dob: val('clPatDOB'), gender: val('clPatGender'),
      bloodType: val('clPatBlood'), allergies: val('clPatAllergies'),
      chronic: val('clPatChronic'), address: val('clPatAddress'), notes: val('clPatNotes')
    };
    if (editingPatientId) {
      const p = patients().find(x => x.id === editingPatientId);
      if (p) Object.assign(p, base);
      toast('تم تحديث بيانات المريض', 'success');
    } else {
      const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
      c.patients.push({ id: uid('clp'), ...base, createdAt: new Date().toISOString(), companyId: coId });
      toast('تم تسجيل المريض: ' + name, 'success');
    }
    editingPatientId = null; hist('patient_save', name); save(); renderClinic();
  };

  window.clCancelPatientForm = function () { editingPatientId = null; renderClinic(); };

  /* ─────────────── service CRUD ─────────────── */
  window.clSaveService = function () {
    const c = C(); if (!c) return;
    const name = val('clSvcName');
    const price = numVal('clSvcPrice');
    if (!name) { toast('اسم الخدمة مطلوب', 'warning'); return; }
    const base = { name, price, duration: numVal('clSvcDuration') || 30, category: val('clSvcCategory'), notes: val('clSvcNotes') };
    if (editingServiceId) {
      const s = services().find(x => x.id === editingServiceId);
      if (s) Object.assign(s, base);
      toast('تم تحديث الخدمة', 'success');
    } else {
      const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
      c.services.push({ id: uid('cls'), ...base, active: true, createdAt: new Date().toISOString(), companyId: coId });
      toast('تم إضافة الخدمة: ' + name, 'success');
    }
    editingServiceId = null; save(); renderClinic();
  };

  window.clOpenServiceForm = function (id) { editingServiceId = id || null; activeTab = 'services'; renderClinic(); };
  window.clToggleService = function (id) {
    const s = services().find(x => x.id === id);
    if (s) { s.active = !s.active; save(); renderClinic(); }
  };

  /* ─────────────── demo data ─────────────── */
  window.clLoadDemo = function () {
    const c = C(); if (!c) return;
    if (patients().length) { toast('البيانات التجريبية موجودة', 'info'); return; }
    const coId = (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || '';
    c.services.push(
      { id: uid('cls'), name: 'كشف عام', price: 10000, duration: 20, category: 'عام', active: true, createdAt: new Date().toISOString(), companyId: coId },
      { id: uid('cls'), name: 'متابعة مريض', price: 7000, duration: 15, category: 'عام', active: true, createdAt: new Date().toISOString(), companyId: coId },
      { id: uid('cls'), name: 'تنظيف أسنان', price: 25000, duration: 45, category: 'أسنان', active: true, createdAt: new Date().toISOString(), companyId: coId },
      { id: uid('cls'), name: 'تخطيط قلب ECG', price: 15000, duration: 30, category: 'قلب', active: true, createdAt: new Date().toISOString(), companyId: coId }
    );
    c.patients.push(
      { id: uid('clp'), name: 'أحمد محمد علي', phone: '07701234567', dob: '1985-04-12', gender: 'ذكر', bloodType: 'A+', allergies: 'بنسلين', chronic: 'سكري', address: 'بغداد', notes: '', createdAt: new Date().toISOString(), companyId: coId },
      { id: uid('clp'), name: 'فاطمة حسين', phone: '07709876543', dob: '1992-09-03', gender: 'أنثى', bloodType: 'O+', allergies: '', chronic: 'ضغط دم', address: 'البصرة', notes: '', createdAt: new Date().toISOString(), companyId: coId }
    );
    const today = new Date().toISOString().split('T')[0];
    c.appointments.push({
      id: uid('cla'), ref: 'CL-' + new Date().getFullYear() + '-0001',
      patientId: c.patients.filter(p => p.companyId === coId)[0].id, patientName: c.patients.filter(p => p.companyId === coId)[0].name, patientPhone: c.patients.filter(p => p.companyId === coId)[0].phone,
      serviceId: c.services.filter(s => s.companyId === coId)[0].id, serviceName: c.services.filter(s => s.companyId === coId)[0].name, servicePrice: c.services.filter(s => s.companyId === coId)[0].price,
      doctor: 'د. كريم', date: today, time: '09:00', status: 'scheduled', notes: 'مراجعة دورية',
      hasRecord: false, hasInvoice: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), companyId: coId
    });
    save(); toast('4 خدمات + 2 مرضى + موعد تجريبي', 'success'); renderClinic();
  };

  /* ─────────────── tabs ─────────────── */
  window.clOpenTab = function (tab) {
    activeTab = tab;
    document.querySelectorAll('.cl-tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    renderTabContent();
  };

  /* ─────────────── render ─────────────── */
  function todayAppts() {
    const today = new Date().toISOString().split('T')[0];
    return appointments().filter(a => a.date === today).sort((a, b) => a.time.localeCompare(b.time));
  }

  function renderSchedule() {
    const el = document.getElementById('clSchedBody'); if (!el) return;
    const appts = todayAppts();
    const waiting = appts.filter(a => a.status === 'arrived').length;
    const inProg = appts.filter(a => a.status === 'in_progress').length;
    el.innerHTML = `
      <div class="cl-sched-header">
        <div class="cl-sched-meta">
          📅 ${new Date().toLocaleDateString('ar-IQ', {weekday:'long',year:'numeric',month:'long',day:'numeric'})}
          &nbsp;|&nbsp; <strong>${appts.length}</strong> موعد اليوم
          &nbsp;|&nbsp; انتظار: <strong>${waiting}</strong> &nbsp;|&nbsp; قيد الفحص: <strong>${inProg}</strong>
        </div>
        <button class="btn-primary" onclick="clOpenTab('book')">+ حجز موعد</button>
      </div>
      ${appts.length ? `<div class="cl-appt-list">
        ${appts.map(a => {
          const nextAction = STATUS_NEXT[a.status];
          const nextLabel = { arrived: 'بدأ الفحص', in_progress: 'أنهى الفحص', scheduled: 'استُقبل' };
          return `<div class="cl-appt-card ${STATUS_CLASS[a.status] || ''}">
            <div class="cl-appt-time">${esc(a.time)}</div>
            <div class="cl-appt-info">
              <div class="cl-appt-patient">${esc(a.patientName)} <span class="cl-appt-phone">${esc(a.patientPhone || '')}</span></div>
              <div class="cl-appt-service">${esc(a.serviceName)} — ${esc(a.doctor)}</div>
              <div class="cl-appt-ref">${esc(a.ref)}</div>
            </div>
            <div class="cl-appt-status"><span class="cl-status-badge ${STATUS_CLASS[a.status]}">${STATUS_LABEL[a.status] || a.status}</span></div>
            <div class="cl-appt-actions">
              ${nextAction ? `<button class="btn-primary cl-btn-sm" onclick="clAdvanceAppt('${a.id}')">${nextLabel[nextAction] || STATUS_LABEL[nextAction]}</button>` : ''}
              ${a.status === 'in_progress' || a.status === 'arrived' ? `<button class="cl-btn-sm btn-secondary" onclick="clOpenRecord('${a.id}')">📋 سجل طبي</button>` : ''}
              ${a.status === 'done' && a.hasRecord ? `<button class="cl-btn-sm btn-ghost" onclick="clOpenRecord('${a.id}')">📋 عرض السجل</button>` : ''}
              ${a.status !== 'done' && a.status !== 'cancelled' ? `<button class="cl-btn-sm btn-danger-sm" onclick="clCancelAppt('${a.id}')">إلغاء</button>` : ''}
            </div>
          </div>`;
        }).join('')}
      </div>` : '<div class="cl-empty">لا مواعيد اليوم — <button class="btn-primary" onclick="clOpenTab(\'book\')">احجز الأول</button></div>'}`;
  }

  function renderRecord() {
    const el = document.getElementById('clRecordBody'); if (!el) return;
    const c = C();
    const appt = viewingApptId ? appointments().find(a => a.id === viewingApptId) : null;
    if (!appt) { el.innerHTML = '<div class="cl-empty">اختر موعداً من الجدول</div>'; return; }
    const existing = records().find(r => r.apptId === viewingApptId);
    const pat = patients().find(p => p.id === appt.patientId);
    el.innerHTML = `
      <div class="cl-record-form">
        <div class="cl-record-header">
          <div><strong>${esc(appt.patientName)}</strong> — ${esc(appt.serviceName)} — ${esc(appt.ref)}</div>
          ${pat ? `<div class="cl-pat-summary">🩸 ${esc(pat.bloodType || '—')} | حساسية: ${esc(pat.allergies || 'لا') } | مزمن: ${esc(pat.chronic || 'لا')}</div>` : ''}
        </div>
        <div class="cl-form-grid">
          <div class="cl-field cl-field-full"><label>الشكوى الرئيسية</label><textarea id="clRecComplaints" rows="2">${esc(existing ? existing.complaints : '')}</textarea></div>
          <div class="cl-field"><label>ضغط الدم</label><input id="clVitBP" value="${esc(existing ? existing.vitals.bp : '')}" placeholder="120/80"></div>
          <div class="cl-field"><label>الحرارة °C</label><input id="clVitTemp" value="${esc(existing ? existing.vitals.temp : '')}" placeholder="36.5"></div>
          <div class="cl-field"><label>النبض bpm</label><input id="clVitPulse" value="${esc(existing ? existing.vitals.pulse : '')}" placeholder="72"></div>
          <div class="cl-field"><label>الوزن kg</label><input id="clVitWeight" value="${esc(existing ? existing.vitals.weight : '')}" placeholder="70"></div>
          <div class="cl-field cl-field-full"><label>التشخيص</label><textarea id="clRecDiagnosis" rows="2">${esc(existing ? existing.diagnosis : '')}</textarea></div>
          <div class="cl-field cl-field-full"><label>خطة العلاج</label><textarea id="clRecTreatment" rows="2">${esc(existing ? existing.treatment : '')}</textarea></div>
          <div class="cl-field cl-field-full"><label>الوصفة الطبية</label><textarea id="clRecPrescription" rows="3">${esc(existing ? existing.prescription : '')}</textarea></div>
          <div class="cl-field"><label>الطبيب</label><input id="clRecDoctor" value="${esc(existing ? existing.doctor : (appt.doctor || userName()))}"></div>
          <div class="cl-field cl-field-full"><label>ملاحظات</label><textarea id="clRecNotes" rows="2">${esc(existing ? existing.notes : '')}</textarea></div>
        </div>
        <div class="cl-form-actions">
          <button class="btn-primary" onclick="clSaveRecord()">💾 حفظ السجل</button>
          <button class="btn-secondary" onclick="clCancelRecord()">رجوع</button>
        </div>
      </div>`;
  }

  function renderBook() {
    const el = document.getElementById('clBookBody'); if (!el) return;
    const c = C();
    const today = new Date().toISOString().split('T')[0];
    el.innerHTML = `
      <div class="cl-form-card">
        <h3>حجز موعد جديد</h3>
        <div class="cl-form-grid">
          <div class="cl-field"><label>المريض *</label>
            <select id="clApptPatient">
              <option value="">— اختر مريضاً —</option>
              ${patients().map(p => `<option value="${esc(p.id)}">${esc(p.name)} — ${esc(p.phone || '')}</option>`).join('')}
            </select>
            <button class="cl-btn-sm btn-ghost" onclick="clOpenPatientForm(null)" style="margin-top:4px">+ مريض جديد</button>
          </div>
          <div class="cl-field"><label>الخدمة *</label>
            <select id="clApptService">
              <option value="">— اختر الخدمة —</option>
              ${services().filter(s => s.active).map(s => `<option value="${esc(s.id)}">${esc(s.name)} — ${fmt(s.price)} ${curSym()}</option>`).join('')}
            </select>
          </div>
          <div class="cl-field"><label>التاريخ *</label><input id="clApptDate" type="date" value="${today}"></div>
          <div class="cl-field"><label>الوقت *</label><input id="clApptTime" type="time" value="09:00"></div>
          <div class="cl-field"><label>الطبيب</label><input id="clApptDoctor" value="${esc(c.settings.defaultDoctor || '')}"></div>
          <div class="cl-field cl-field-full"><label>ملاحظات</label><textarea id="clApptNotes" rows="2"></textarea></div>
        </div>
        <div class="cl-form-actions">
          <button class="btn-primary" onclick="clBookAppt()">✅ تأكيد الحجز</button>
          <button class="btn-secondary" onclick="clOpenTab('schedule')">إلغاء</button>
        </div>
      </div>`;
  }

  function renderPatients() {
    const el = document.getElementById('clPatientsBody'); if (!el) return;
    const c = C();
    if (editingPatientId !== null) { renderPatientForm(el, c); return; }
    const list = patients().filter(p => !patSearch || p.name.toLowerCase().includes(patSearch.toLowerCase()) || (p.phone || '').includes(patSearch));
    el.innerHTML = `
      <div class="cl-toolbar">
        <input class="cl-search" placeholder="بحث بالاسم أو الهاتف..." oninput="clPatSearch(this.value)" value="${esc(patSearch)}">
        <button class="btn-primary" onclick="clOpenPatientForm(null)">+ مريض جديد</button>
        <button class="btn-ghost" onclick="clLoadDemo()">بيانات تجريبية</button>
      </div>
      <div class="cl-patient-grid">
        ${list.map(p => {
          const apptCount = appointments().filter(a => a.patientId === p.id).length;
          return `<div class="cl-patient-card">
            <div class="cl-pat-name">${esc(p.name)}</div>
            <div class="cl-pat-details">📞 ${esc(p.phone || '—')} &nbsp;|&nbsp; 🩸 ${esc(p.bloodType || '—')}</div>
            ${p.allergies ? `<div class="cl-pat-alert">⚠️ حساسية: ${esc(p.allergies)}</div>` : ''}
            ${p.chronic ? `<div class="cl-pat-chronic">🔴 مزمن: ${esc(p.chronic)}</div>` : ''}
            <div class="cl-pat-stats">${apptCount} زيارة</div>
            <div class="cl-pat-actions">
              <button class="cl-btn-sm btn-secondary" onclick="clOpenPatientForm('${p.id}')">✏️ تعديل</button>
              <button class="cl-btn-sm btn-primary" onclick="clOpenTab('book')">+ موعد</button>
            </div>
          </div>`;
        }).join('') || '<div class="cl-empty">لا مرضى مسجلون</div>'}
      </div>`;
  }

  function renderPatientForm(el, c) {
    const p = editingPatientId ? patients().find(x => x.id === editingPatientId) : null;
    el.innerHTML = `
      <div class="cl-form-card">
        <h3>${p ? 'تعديل بيانات: ' + esc(p.name) : 'تسجيل مريض جديد'}</h3>
        <div class="cl-form-grid">
          <div class="cl-field"><label>الاسم الكامل *</label><input id="clPatName" value="${esc(p ? p.name : '')}"></div>
          <div class="cl-field"><label>رقم الهاتف</label><input id="clPatPhone" value="${esc(p ? p.phone || '' : '')}"></div>
          <div class="cl-field"><label>تاريخ الميلاد</label><input id="clPatDOB" type="date" value="${esc(p ? p.dob || '' : '')}"></div>
          <div class="cl-field"><label>الجنس</label>
            <select id="clPatGender">
              <option value="ذكر" ${!p || p.gender === 'ذكر' ? 'selected' : ''}>ذكر</option>
              <option value="أنثى" ${p && p.gender === 'أنثى' ? 'selected' : ''}>أنثى</option>
            </select>
          </div>
          <div class="cl-field"><label>فصيلة الدم</label>
            <select id="clPatBlood">
              ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(t => `<option ${p && p.bloodType === t ? 'selected' : ''}>${t}</option>`).join('')}
              <option value="" ${!p || !p.bloodType ? 'selected' : ''}>غير محدد</option>
            </select>
          </div>
          <div class="cl-field"><label>الحساسية (أدوية/غذاء)</label><input id="clPatAllergies" value="${esc(p ? p.allergies || '' : '')}"></div>
          <div class="cl-field"><label>أمراض مزمنة</label><input id="clPatChronic" value="${esc(p ? p.chronic || '' : '')}"></div>
          <div class="cl-field"><label>العنوان</label><input id="clPatAddress" value="${esc(p ? p.address || '' : '')}"></div>
          <div class="cl-field cl-field-full"><label>ملاحظات</label><textarea id="clPatNotes" rows="2">${esc(p ? p.notes || '' : '')}</textarea></div>
        </div>
        <div class="cl-form-actions">
          <button class="btn-primary" onclick="clSavePatient()">💾 حفظ</button>
          <button class="btn-secondary" onclick="clCancelPatientForm()">إلغاء</button>
        </div>
      </div>`;
  }

  window.clPatSearch = function (v) { patSearch = v; renderPatients(); };

  function renderServices() {
    const el = document.getElementById('clServicesBody'); if (!el) return;
    const c = C();
    if (editingServiceId !== null) { renderServiceForm(el, c); return; }
    el.innerHTML = `
      <div class="cl-toolbar"><button class="btn-primary" onclick="clOpenServiceForm(null)">+ خدمة جديدة</button></div>
      <table class="cl-table">
        <thead><tr><th>الخدمة</th><th>التصنيف</th><th>المدة (دقيقة)</th><th>السعر</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>${services().map(s => `<tr class="${s.active ? '' : 'cl-row-inactive'}">
          <td>${esc(s.name)}</td><td>${esc(s.category || '—')}</td><td>${s.duration || 30}</td>
          <td>${fmt(s.price)} ${curSym()}</td>
          <td><span class="cl-status-badge ${s.active ? 'cl-status-done' : 'cl-status-cancel'}">${s.active ? 'فعّال' : 'متوقف'}</span></td>
          <td>
            <button class="cl-btn-sm btn-secondary" onclick="clOpenServiceForm('${s.id}')">✏️</button>
            <button class="cl-btn-sm btn-ghost" onclick="clToggleService('${s.id}')">${s.active ? '⏸️' : '▶️'}</button>
          </td>
        </tr>`).join('') || '<tr><td colspan="6" class="cl-empty">لا خدمات</td></tr>'}
        </tbody>
      </table>`;
  }

  function renderServiceForm(el, c) {
    const s = editingServiceId ? services().find(x => x.id === editingServiceId) : null;
    el.innerHTML = `
      <div class="cl-form-card">
        <h3>${s ? 'تعديل خدمة' : 'إضافة خدمة جديدة'}</h3>
        <div class="cl-form-grid">
          <div class="cl-field"><label>اسم الخدمة *</label><input id="clSvcName" value="${esc(s ? s.name : '')}"></div>
          <div class="cl-field"><label>التصنيف</label><input id="clSvcCategory" value="${esc(s ? s.category || '' : '')}"></div>
          <div class="cl-field"><label>السعر</label><input id="clSvcPrice" type="number" value="${s ? s.price : ''}"></div>
          <div class="cl-field"><label>المدة (دقيقة)</label><input id="clSvcDuration" type="number" value="${s ? s.duration || 30 : 30}"></div>
          <div class="cl-field cl-field-full"><label>ملاحظات</label><textarea id="clSvcNotes" rows="2">${esc(s ? s.notes || '' : '')}</textarea></div>
        </div>
        <div class="cl-form-actions">
          <button class="btn-primary" onclick="clSaveService()">💾 حفظ</button>
          <button class="btn-secondary" onclick="clOpenServiceForm(null); editingServiceId=null; renderClinic();">إلغاء</button>
        </div>
      </div>`;
  }

  function renderInvoices() {
    const el = document.getElementById('clInvoicesBody'); if (!el) return;
    const c = C();
    const invs = [...invoices()].reverse();
    el.innerHTML = `
      <table class="cl-table">
        <thead><tr><th>الرقم</th><th>المريض</th><th>الخدمة</th><th>المبلغ</th><th>الحالة</th><th>إجراء</th></tr></thead>
        <tbody>${invs.length ? invs.map(i => `<tr>
          <td>${esc(i.ref)}</td><td>${esc(i.patientName)}</td><td>${esc(i.serviceName)}</td>
          <td>${fmt(i.amount)} ${curSym()}</td>
          <td><span class="cl-status-badge ${i.status === 'paid' ? 'cl-status-done' : 'cl-status-sched'}">${i.status === 'paid' ? 'مدفوع' : 'غير مدفوع'}</span></td>
          <td>${i.status !== 'paid' ? `
            <button class="cl-btn-sm btn-primary" onclick="clPayInvoice('${i.id}','cash')">💵 نقداً</button>
            <button class="cl-btn-sm btn-secondary" onclick="clPayInvoice('${i.id}','account')">📋 آجل</button>
          ` : '✅ ' + (i.paidAt ? new Date(i.paidAt).toLocaleDateString('ar-IQ') : '')}</td>
        </tr>`).join('') : '<tr><td colspan="6" class="cl-empty">لا فواتير</td></tr>'}
        </tbody>
      </table>`;
  }

  function renderDashboard() {
    const el = document.getElementById('clDashBody'); if (!el) return;
    const c = C();
    const today = new Date().toISOString().split('T')[0];
    const todayA = appointments().filter(a => a.date === today);
    const done = todayA.filter(a => a.status === 'done').length;
    const waiting = todayA.filter(a => a.status === 'arrived').length;
    const unpaidInv = invoices().filter(i => i.status !== 'paid');
    const todayRevenue = invoices().filter(i => i.status === 'paid' && i.paidAt && i.paidAt.startsWith(today)).reduce((s, i) => s + i.amount, 0);
    el.innerHTML = `
      <div class="cl-kpi-row">
        <div class="cl-kpi"><div class="cl-kpi-val">${todayA.length}</div><div class="cl-kpi-lbl">مواعيد اليوم</div></div>
        <div class="cl-kpi"><div class="cl-kpi-val">${done}</div><div class="cl-kpi-lbl">مكتملة</div></div>
        <div class="cl-kpi ${waiting ? 'cl-kpi-warn' : ''}"><div class="cl-kpi-val">${waiting}</div><div class="cl-kpi-lbl">في الانتظار</div></div>
        <div class="cl-kpi"><div class="cl-kpi-val">${fmt(todayRevenue)} ${curSym()}</div><div class="cl-kpi-lbl">إيراد اليوم</div></div>
        <div class="cl-kpi ${unpaidInv.length ? 'cl-kpi-warn' : ''}"><div class="cl-kpi-val">${unpaidInv.length}</div><div class="cl-kpi-lbl">فواتير غير مدفوعة</div></div>
        <div class="cl-kpi"><div class="cl-kpi-val">${patients().length}</div><div class="cl-kpi-lbl">إجمالي المرضى</div></div>
      </div>`;
  }

  function renderTabContent() {
    const body = document.getElementById('clinicBody'); if (!body) return;
    const tabs = { clDashBody:'dashboard', clSchedBody:'schedule', clRecordBody:'record', clBookBody:'book', clPatientsBody:'patients', clServicesBody:'services', clInvoicesBody:'invoices' };
    Object.keys(tabs).forEach(id => {
      let el = document.getElementById(id);
      if (!el) { el = document.createElement('div'); el.id = id; body.appendChild(el); }
      el.style.display = tabs[id] === activeTab ? '' : 'none';
    });
    if (activeTab === 'dashboard') renderDashboard();
    else if (activeTab === 'schedule') renderSchedule();
    else if (activeTab === 'record') renderRecord();
    else if (activeTab === 'book') renderBook();
    else if (activeTab === 'patients') renderPatients();
    else if (activeTab === 'services') renderServices();
    else if (activeTab === 'invoices') renderInvoices();
  }

  function renderClinic() {
    const body = document.getElementById('clinicBody'); if (!body) return;
    ensureData();
    const tabDefs = [['dashboard','📊 لوحة'],['schedule','📅 جدول اليوم'],['book','➕ حجز'],['patients','🧑‍⚕️ المرضى'],['services','🩺 الخدمات'],['invoices','💰 الفواتير']];
    body.innerHTML = `
      <div class="cl-header">
        <div class="cl-tabs">${tabDefs.map(([k,l]) => `<button class="cl-tab-btn ${activeTab === k || (activeTab === 'record' && k === 'schedule') ? 'active' : ''}" data-tab="${k}" onclick="clOpenTab('${k}')">${l}</button>`).join('')}</div>
      </div>
      <div id="clDashBody"></div><div id="clSchedBody"></div><div id="clRecordBody"></div>
      <div id="clBookBody"></div><div id="clPatientsBody"></div><div id="clServicesBody"></div><div id="clInvoicesBody"></div>`;
    renderTabContent();
  }

  window.renderClinic = renderClinic;

  /* ─────────────── switchPage hook ─────────────── */
  const _origSwitch = window.switchPage;
  window.switchPage = function (page) {
    if (_origSwitch) _origSwitch(page);
    if (page === 'clinic') {
      // Core switchPage only activates pages in its built-in pageMap; like
      // pos/pharmacy/assets, this module activates its own section explicitly
      // so navigation actually shows it (otherwise the page stays hidden).
      try {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const pg = document.getElementById('pageClinic'); if (pg) pg.classList.add('page-active');
        const nav = document.getElementById('navClinic'); if (nav) nav.classList.add('active');
        window.currentPage = 'clinic';
        if (typeof window.ensureNavGroupForPage === 'function') window.ensureNavGroupForPage('clinic');
      } catch (_) {}
      ensureData(); setTimeout(renderClinic, 0);
    }
  };

  /* ─────────────── Jarvis tool ─────────────── */
  function registerJarvis() {
    try {
      if (window.JarvisBrain && JarvisBrain.tools) {
        JarvisBrain.tools['report_clinic_today'] = function () {
          const c = C(); if (!c) return { error: 'clinic not ready' };
          const today = new Date().toISOString().split('T')[0];
          const todayA = appointments().filter(a => a.date === today);
          return {
            totalToday: todayA.length,
            waiting: todayA.filter(a => a.status === 'arrived').length,
            inProgress: todayA.filter(a => a.status === 'in_progress').length,
            done: todayA.filter(a => a.status === 'done').length,
            unpaidInvoices: invoices().filter(i => i.status !== 'paid').length,
            totalPatients: patients().length
          };
        };
        if (JarvisBrain.PAGES) JarvisBrain.PAGES['clinic'] = '#pageClinic';
      }
    } catch (_) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', registerJarvis);
  else setTimeout(registerJarvis, 600);

  window.OctagonClinic = { render: renderClinic, ensureData };
})();
