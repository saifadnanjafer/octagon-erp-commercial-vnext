/**
 * OCTAGON ERP — Appointments & Booking Center (المواعيد والحجوزات).
 *
 * A unified scheduling surface that every vertical was missing: clinic patient
 * appointments, hotel room reservations, restaurant table bookings, real-estate
 * viewings, field-service job visits, and workshop drop-off slots — all on one
 * resource-based calendar with a clean status workflow.
 *
 * ADD-ONLY. Data lives in omni.appointments = { resources, bookings, settings }.
 * Each booking carries company context when an active company is available.
 * No confirm()/prompt() — all actions use inline forms so the page stays
 * testable headless and never wedges.
 */
(function () {
  'use strict';

  /* ───────── state ───────── */
  let activeView = 'schedule';        // schedule | list | resources
  let selectedDate = null;            // YYYY-MM-DD
  let listStatusFilter = 'all';
  let listResourceFilter = 'all';

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
  function nowHM() {
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function addDaysISO(iso, n) {
    const d = new Date((iso || todayISO()) + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function weekdayAr(iso) {
    const names = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    try { return names[new Date(iso + 'T00:00:00').getDay()]; } catch (_) { return ''; }
  }
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix || 'appt'); } catch (_) {} }
    return (prefix || 'appt') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function save() {
    if (typeof window.saveData === 'function') { try { window.saveData(); } catch (_) {} }
  }
  function toast(m, k) {
    if (typeof window.showToast === 'function') { try { window.showToast(m, k || 'info'); } catch (_) {} }
  }
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
    try { if (window.TenantService?.stamp) return window.TenantService.stamp(rec, { collection: 'omni.appointments' }); } catch (_) {}
    const p = activeProfile();
    if (p.companyId && !rec.companyId) { rec.companyId = p.companyId; rec.companyName = p.companyName || ''; }
    return rec;
  }
  function addMinutes(hm, mins) {
    const [h, m] = String(hm || '00:00').split(':').map(Number);
    let total = (h * 60 + m) + (Number(mins) || 0);
    total = ((total % 1440) + 1440) % 1440;
    return String(Math.floor(total / 60)).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }
  function hmToMin(hm) { const [h, m] = String(hm || '00:00').split(':').map(Number); return (h || 0) * 60 + (m || 0); }

  /* ───────── data ───────── */
  const RESOURCE_TYPES = [
    { key: 'clinic', label: 'طبيب / عيادة', icon: 'fa-user-doctor' },
    { key: 'room', label: 'غرفة فندق', icon: 'fa-bed' },
    { key: 'table', label: 'طاولة مطعم', icon: 'fa-utensils' },
    { key: 'property', label: 'عقار / معاينة', icon: 'fa-building' },
    { key: 'technician', label: 'فني خدمة ميدانية', icon: 'fa-helmet-safety' },
    { key: 'bay', label: 'مصطبة ورشة', icon: 'fa-screwdriver-wrench' },
    { key: 'generic', label: 'مورد عام', icon: 'fa-calendar-day' }
  ];
  function resTypeMeta(key) { return RESOURCE_TYPES.find(t => t.key === key) || RESOURCE_TYPES[RESOURCE_TYPES.length - 1]; }

  const STATUSES = [
    { key: 'requested', label: 'مطلوب', cls: 'req' },
    { key: 'confirmed', label: 'مؤكد', cls: 'conf' },
    { key: 'checked_in', label: 'حضر / قيد التنفيذ', cls: 'in' },
    { key: 'completed', label: 'مكتمل', cls: 'done' },
    { key: 'no_show', label: 'لم يحضر', cls: 'noshow' },
    { key: 'cancelled', label: 'ملغى', cls: 'cancel' }
  ];
  function statusMeta(key) { return STATUSES.find(s => s.key === key) || STATUSES[0]; }
  const OPEN_STATUSES = ['requested', 'confirmed', 'checked_in'];

  function ensureData() {
    const o = O();
    if (!o.appointments || typeof o.appointments !== 'object') o.appointments = {};
    const a = o.appointments;
    if (!Array.isArray(a.resources)) a.resources = [];
    if (!Array.isArray(a.bookings)) a.bookings = [];
    if (!a.settings || typeof a.settings !== 'object') a.settings = {};
    if (a.settings.openHour == null) a.settings.openHour = 8;
    if (a.settings.closeHour == null) a.settings.closeHour = 20;
    if (a.settings.slotMinutes == null) a.settings.slotMinutes = 30;

    // First-run seed so the page is never an empty shell.
    if (!a.resources.length && !a._seeded) {
      a._seeded = true;
      const seed = [
        { name: 'د. أحمد - عيادة عامة', type: 'clinic', color: '#34d399' },
        { name: 'الجناح الملكي 101', type: 'room', color: '#818cf8' },
        { name: 'طاولة 12 (شرفة)', type: 'table', color: '#fb923c' },
        { name: 'فني الخدمة الميدانية A', type: 'technician', color: '#38bdf8' }
      ];
      seed.forEach(s => a.resources.push(stamp({ id: uid('res'), name: s.name, type: s.type, color: s.color, capacity: 1, active: true, createdAt: new Date().toISOString() })));
      const r0 = a.resources[0].id, r2 = a.resources[2].id;
      a.bookings.push(stamp({ id: uid('bk'), resourceId: r0, customerName: 'سارة محمد', customerPhone: '07700000000', title: 'كشف دوري', date: todayISO(), time: '10:00', durationMin: 30, status: 'confirmed', note: '', source: 'seed', createdBy: 'system', createdAt: new Date().toISOString() }));
      a.bookings.push(stamp({ id: uid('bk'), resourceId: r2, customerName: 'عائلة العبيدي (4)', customerPhone: '', title: 'حجز عشاء', date: todayISO(), time: '20:00', durationMin: 90, status: 'requested', note: 'بالقرب من النافذة', source: 'seed', createdBy: 'system', createdAt: new Date().toISOString() }));
    }
  }
  function A() { ensureData(); return O().appointments; }
  function activeResources() { return A().resources.filter(r => r.active !== false); }
  function bookingsOn(iso) { return A().bookings.filter(b => b.date === iso && b.status !== 'cancelled'); }
  function resourceById(id) { return A().resources.find(r => r.id === id); }

  /* ───────── KPIs ───────── */
  function kpis() {
    const a = A();
    const today = todayISO();
    const todays = a.bookings.filter(b => b.date === today && b.status !== 'cancelled');
    const upcoming = a.bookings.filter(b => b.date > today && OPEN_STATUSES.includes(b.status));
    // no-show rate over the trailing 30 days (closed bookings only)
    const from = addDaysISO(today, -30);
    const closed = a.bookings.filter(b => b.date >= from && b.date <= today && ['completed', 'no_show'].includes(b.status));
    const noShows = closed.filter(b => b.status === 'no_show').length;
    const noShowRate = closed.length ? Math.round((noShows / closed.length) * 100) : 0;
    // today utilization: booked minutes / available minutes across active resources
    const open = a.settings.openHour, close = a.settings.closeHour;
    const availPerRes = Math.max(0, (close - open) * 60);
    const resCount = activeResources().length || 1;
    const bookedMin = todays.filter(b => OPEN_STATUSES.includes(b.status) || b.status === 'completed')
      .reduce((s, b) => s + (Number(b.durationMin) || 0), 0);
    const util = availPerRes ? Math.min(100, Math.round((bookedMin / (availPerRes * resCount)) * 100)) : 0;
    return {
      todayCount: todays.length,
      confirmed: todays.filter(b => b.status === 'confirmed').length,
      inProgress: todays.filter(b => b.status === 'checked_in').length,
      completed: todays.filter(b => b.status === 'completed').length,
      upcoming: upcoming.length,
      noShowRate,
      util,
      resources: activeResources().length
    };
  }

  /* ───────── render ───────── */
  function kpiStrip() {
    const k = kpis();
    const card = (icon, color, value, label) =>
      '<div class="appt-kpi"><div class="appt-kpi-icon" style="background:' + color + '22;color:' + color + '"><i class="fa-solid ' + icon + '"></i></div>'
      + '<div class="appt-kpi-info"><span class="appt-kpi-value">' + esc(value) + '</span><span class="appt-kpi-label">' + esc(label) + '</span></div></div>';
    return '<div class="appt-kpi-strip">'
      + card('fa-calendar-day', '#818cf8', k.todayCount, 'مواعيد اليوم')
      + card('fa-circle-check', '#34d399', k.confirmed, 'مؤكدة اليوم')
      + card('fa-person-walking-arrow-right', '#38bdf8', k.inProgress, 'حضور / قيد التنفيذ')
      + card('fa-flag-checkered', '#a855f7', k.completed, 'مكتملة اليوم')
      + card('fa-clock', '#facc15', k.upcoming, 'قادمة (لاحقاً)')
      + card('fa-user-clock', '#f87171', k.noShowRate + '%', 'نسبة عدم الحضور (30ي)')
      + card('fa-gauge-high', '#fb923c', k.util + '%', 'إشغال اليوم')
      + '</div>';
  }

  function toolbar() {
    const tab = (key, icon, label) =>
      '<button class="appt-tab ' + (activeView === key ? 'active' : '') + '" onclick="apptSetView(\'' + key + '\')"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
    return '<div class="appt-tabs">'
      + tab('schedule', 'fa-table-columns', 'جدول اليوم')
      + tab('list', 'fa-list-check', 'كل الحجوزات')
      + tab('resources', 'fa-layer-group', 'الموارد')
      + '</div>';
  }

  function dateNav() {
    return '<div class="appt-datenav">'
      + '<button class="appt-btn" onclick="apptShiftDate(-1)"><i class="fa-solid fa-chevron-right"></i> السابق</button>'
      + '<button class="appt-btn ghost" onclick="apptGoToday()">اليوم</button>'
      + '<input type="date" class="appt-date-input" value="' + esc(selectedDate) + '" onchange="apptPickDate(this.value)">'
      + '<span class="appt-date-label">' + esc(weekdayAr(selectedDate)) + '</span>'
      + '<button class="appt-btn" onclick="apptShiftDate(1)">التالي <i class="fa-solid fa-chevron-left"></i></button>'
      + '</div>';
  }

  function bookingChip(b) {
    const sm = statusMeta(b.status);
    const end = addMinutes(b.time, b.durationMin);
    const acts = statusActionButtons(b);
    return '<div class="appt-chip ' + sm.cls + '">'
      + '<div class="appt-chip-time">' + esc(b.time) + ' – ' + esc(end) + '</div>'
      + '<div class="appt-chip-main"><span class="appt-chip-title">' + esc(b.title || 'حجز') + '</span>'
      + '<span class="appt-chip-cust">' + esc(b.customerName || '—') + (b.customerPhone ? ' · ' + esc(b.customerPhone) : '') + '</span>'
      + (b.note ? '<span class="appt-chip-note">' + esc(b.note) + '</span>' : '') + '</div>'
      + '<div class="appt-chip-foot"><span class="appt-badge ' + sm.cls + '">' + esc(sm.label) + '</span>' + acts + '</div>'
      + '</div>';
  }

  function statusActionButtons(b) {
    const btn = (status, label) => '<button class="appt-mini" onclick="apptSetStatus(\'' + b.id + '\',\'' + status + '\')">' + label + '</button>';
    let out = '';
    if (b.status === 'requested') out += btn('confirmed', 'تأكيد');
    if (b.status === 'confirmed') out += btn('checked_in', 'حضور');
    if (b.status === 'checked_in') out += btn('completed', 'إنهاء');
    if (OPEN_STATUSES.includes(b.status)) {
      out += btn('no_show', 'لم يحضر');
      out += '<button class="appt-mini danger" onclick="apptSetStatus(\'' + b.id + '\',\'cancelled\')">إلغاء</button>';
    }
    return '<div class="appt-mini-row">' + out + '</div>';
  }

  function scheduleView() {
    const resources = activeResources();
    if (!resources.length) {
      return '<div class="appt-empty">لا توجد موارد بعد. أضف موارد من تبويب «الموارد» لتبدأ الجدولة.</div>' + quickAddForm();
    }
    const dayBookings = bookingsOn(selectedDate);
    const cols = resources.map(r => {
      const meta = resTypeMeta(r.type);
      const list = dayBookings.filter(b => b.resourceId === r.id).sort((x, y) => hmToMin(x.time) - hmToMin(y.time));
      return '<div class="appt-res-col">'
        + '<div class="appt-res-head" style="border-color:' + esc(r.color || '#818cf8') + '"><span class="appt-res-dot" style="background:' + esc(r.color || '#818cf8') + '"></span>'
        + '<i class="fa-solid ' + meta.icon + '"></i> ' + esc(r.name) + '<span class="appt-res-count">' + list.length + '</span></div>'
        + '<div class="appt-res-body">' + (list.length ? list.map(bookingChip).join('') : '<div class="appt-col-empty">لا حجوزات</div>') + '</div>'
        + '</div>';
    }).join('');
    return '<div class="appt-board">' + cols + '</div>' + quickAddForm();
  }

  function quickAddForm() {
    const resOpts = activeResources().map(r => '<option value="' + esc(r.id) + '">' + esc(r.name) + '</option>').join('');
    return '<div class="appt-panel appt-add">'
      + '<h3><i class="fa-solid fa-plus"></i> حجز جديد</h3>'
      + '<div class="appt-form-grid">'
      + '<label>المورد<select id="apptF_res">' + resOpts + '</select></label>'
      + '<label>العميل<input type="text" id="apptF_cust" placeholder="اسم العميل"></label>'
      + '<label>الهاتف<input type="text" id="apptF_phone" placeholder="اختياري"></label>'
      + '<label>العنوان<input type="text" id="apptF_title" placeholder="نوع الموعد / الخدمة"></label>'
      + '<label>التاريخ<input type="date" id="apptF_date" value="' + esc(selectedDate) + '"></label>'
      + '<label>الوقت<input type="time" id="apptF_time" value="' + esc(nowHM()) + '"></label>'
      + '<label>المدة (دقيقة)<input type="number" id="apptF_dur" value="30" min="5" step="5"></label>'
      + '<label>الحالة<select id="apptF_status"><option value="requested">مطلوب</option><option value="confirmed" selected>مؤكد</option></select></label>'
      + '<label class="appt-wide">ملاحظة<input type="text" id="apptF_note" placeholder="اختياري"></label>'
      + '</div>'
      + '<button class="appt-btn primary" onclick="apptCreateBooking()"><i class="fa-solid fa-calendar-plus"></i> إضافة الحجز</button>'
      + '</div>';
  }

  function listView() {
    const a = A();
    const statusOpts = '<option value="all">كل الحالات</option>' + STATUSES.map(s => '<option value="' + s.key + '"' + (listStatusFilter === s.key ? ' selected' : '') + '>' + s.label + '</option>').join('');
    const resOpts = '<option value="all">كل الموارد</option>' + a.resources.map(r => '<option value="' + esc(r.id) + '"' + (listResourceFilter === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('');
    let rows = a.bookings.slice();
    if (listStatusFilter !== 'all') rows = rows.filter(b => b.status === listStatusFilter);
    if (listResourceFilter !== 'all') rows = rows.filter(b => b.resourceId === listResourceFilter);
    rows.sort((x, y) => (y.date + y.time).localeCompare(x.date + x.time));
    const body = rows.length ? rows.map(b => {
      const r = resourceById(b.resourceId);
      const sm = statusMeta(b.status);
      return '<tr><td>' + esc(b.date) + '<span class="appt-sub">' + esc(b.time) + ' · ' + (Number(b.durationMin) || 0) + 'د</span></td>'
        + '<td>' + esc(r ? r.name : '—') + '</td>'
        + '<td>' + esc(b.customerName || '—') + (b.customerPhone ? '<span class="appt-sub">' + esc(b.customerPhone) + '</span>' : '') + '</td>'
        + '<td>' + esc(b.title || '—') + (b.note ? '<span class="appt-sub">' + esc(b.note) + '</span>' : '') + '</td>'
        + '<td><span class="appt-badge ' + sm.cls + '">' + esc(sm.label) + '</span></td>'
        + '<td>' + statusActionButtons(b) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="appt-col-empty">لا توجد حجوزات مطابقة</td></tr>';
    return '<div class="appt-panel">'
      + '<div class="appt-list-filters">'
      + '<label>الحالة<select onchange="apptSetListStatus(this.value)">' + statusOpts + '</select></label>'
      + '<label>المورد<select onchange="apptSetListResource(this.value)">' + resOpts + '</select></label>'
      + '<span class="appt-list-count">' + rows.length + ' حجز</span>'
      + '</div>'
      + '<table class="appt-table"><thead><tr><th>التاريخ/الوقت</th><th>المورد</th><th>العميل</th><th>التفاصيل</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>' + body + '</tbody></table>'
      + '</div>';
  }

  function resourcesView() {
    const a = A();
    const rows = a.resources.map(r => {
      const meta = resTypeMeta(r.type);
      const open = a.bookings.filter(b => b.resourceId === r.id && OPEN_STATUSES.includes(b.status)).length;
      return '<tr class="' + (r.active === false ? 'appt-res-off' : '') + '">'
        + '<td><span class="appt-res-dot" style="background:' + esc(r.color || '#818cf8') + '"></span> ' + esc(r.name) + '</td>'
        + '<td><i class="fa-solid ' + meta.icon + '"></i> ' + esc(meta.label) + '</td>'
        + '<td>' + open + '</td>'
        + '<td>' + (r.active === false ? '<span class="appt-badge cancel">معطل</span>' : '<span class="appt-badge done">فعّال</span>') + '</td>'
        + '<td><button class="appt-mini" onclick="apptToggleResource(\'' + r.id + '\')">' + (r.active === false ? 'تفعيل' : 'تعطيل') + '</button></td></tr>';
    }).join('') || '<tr><td colspan="5" class="appt-col-empty">لا توجد موارد</td></tr>';
    const typeOpts = RESOURCE_TYPES.map(t => '<option value="' + t.key + '">' + t.label + '</option>').join('');
    return '<div class="appt-panel">'
      + '<table class="appt-table"><thead><tr><th>المورد</th><th>النوع</th><th>حجوزات مفتوحة</th><th>الحالة</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>'
      + '</div>'
      + '<div class="appt-panel appt-add"><h3><i class="fa-solid fa-plus"></i> مورد جديد</h3>'
      + '<div class="appt-form-grid">'
      + '<label>الاسم<input type="text" id="apptR_name" placeholder="اسم المورد / الطبيب / الغرفة"></label>'
      + '<label>النوع<select id="apptR_type">' + typeOpts + '</select></label>'
      + '<label>اللون<input type="color" id="apptR_color" value="#818cf8"></label>'
      + '</div>'
      + '<button class="appt-btn primary" onclick="apptCreateResource()"><i class="fa-solid fa-layer-group"></i> إضافة المورد</button></div>';
  }

  function render() {
    ensureData();
    if (!selectedDate) selectedDate = todayISO();
    const body = document.getElementById('appointmentsBody');
    if (!body) return;
    let content = '';
    if (activeView === 'list') content = listView();
    else if (activeView === 'resources') content = resourcesView();
    else content = dateNav() + scheduleView();
    body.innerHTML = kpiStrip() + toolbar() + '<div class="appt-content">' + content + '</div>';
  }

  /* ───────── actions (exposed) ───────── */
  window.apptSetView = function (v) { activeView = v; render(); };
  window.apptShiftDate = function (n) { selectedDate = addDaysISO(selectedDate, n); render(); };
  window.apptGoToday = function () { selectedDate = todayISO(); render(); };
  window.apptPickDate = function (v) { if (v) selectedDate = v; render(); };
  window.apptSetListStatus = function (v) { listStatusFilter = v; render(); };
  window.apptSetListResource = function (v) { listResourceFilter = v; render(); };

  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  window.apptCreateBooking = function () {
    const resId = val('apptF_res');
    if (!resId) { toast('اختر مورداً أولاً', 'warning'); return; }
    const cust = val('apptF_cust');
    if (!cust) { toast('أدخل اسم العميل', 'warning'); return; }
    const a = A();
    const rec = stamp({
      id: uid('bk'),
      resourceId: resId,
      customerName: cust,
      customerPhone: val('apptF_phone'),
      title: val('apptF_title') || 'حجز',
      date: val('apptF_date') || selectedDate,
      time: val('apptF_time') || nowHM(),
      durationMin: Number(val('apptF_dur')) || 30,
      status: val('apptF_status') || 'confirmed',
      note: val('apptF_note'),
      source: 'manual',
      createdBy: currentUserName(),
      createdAt: new Date().toISOString()
    });
    // overlap warning (non-blocking) — same resource, same day, overlapping window
    const newStart = hmToMin(rec.time), newEnd = newStart + rec.durationMin;
    const clash = a.bookings.some(b => b.resourceId === resId && b.date === rec.date && OPEN_STATUSES.includes(b.status)
      && newStart < (hmToMin(b.time) + (Number(b.durationMin) || 0)) && hmToMin(b.time) < newEnd);
    a.bookings.push(rec);
    save();
    selectedDate = rec.date;
    render();
    toast(clash ? 'تم الحجز ⚠️ يتقاطع وقتياً مع حجز آخر لنفس المورد' : 'تم إنشاء الحجز ✅', clash ? 'warning' : 'success');
  };

  window.apptSetStatus = function (id, status) {
    const a = A();
    const b = a.bookings.find(x => x.id === id);
    if (!b) return;
    b.status = status;
    b.updatedAt = new Date().toISOString();
    b.updatedBy = currentUserName();
    save();
    render();
    toast('تم تحديث الحالة إلى «' + statusMeta(status).label + '»', status === 'cancelled' ? 'warning' : 'success');
  };

  window.apptCreateResource = function () {
    const name = val('apptR_name');
    if (!name) { toast('أدخل اسم المورد', 'warning'); return; }
    const a = A();
    a.resources.push(stamp({ id: uid('res'), name, type: val('apptR_type') || 'generic', color: val('apptR_color') || '#818cf8', capacity: 1, active: true, createdAt: new Date().toISOString() }));
    save();
    render();
    toast('تمت إضافة المورد ✅', 'success');
  };

  window.apptToggleResource = function (id) {
    const r = resourceById(id);
    if (!r) return;
    r.active = r.active === false;
    save();
    render();
  };

  /* ───────── navigation wiring ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('appointments');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageAppointments');
    const nav = document.getElementById('navAppointments');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('appointments'); } catch (_) {} }
    window.currentPage = 'appointments';
    render();
    return !!pg;
  }

  function wireSwitch() {
    if (window.__appointmentsWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'appointments') {
        try { if (activatePage()) return; } catch (e) { console.warn('Appointments render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__appointmentsWrapped = true;
  }

  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools || JarvisBrain.tools.report_appointments_today) return;
      JarvisBrain.tools.report_appointments_today = {
        desc_en: 'Appointments & booking summary: today\'s schedule, status counts, utilization and no-show rate.',
        risk: 'safe',
        params: {},
        run: function () {
          const k = kpis();
          const today = todayISO();
          return {
            date: today,
            kpis: k,
            todays: bookingsOn(today).map(b => {
              const r = resourceById(b.resourceId);
              return { time: b.time, resource: r ? r.name : '', customer: b.customerName, status: b.status, title: b.title };
            })
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
      if (window.__appointmentsWrapped || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonAppointments = {
    ensureData,
    render,
    kpis,
    report: function () { return JarvisBrain?.tools?.report_appointments_today?.run?.() || kpis(); },
    open: function () { try { window.switchPage('appointments'); } catch (_) {} }
  };
})();
