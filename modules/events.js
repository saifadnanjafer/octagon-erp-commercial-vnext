/**
 * OCTAGON ERP — Events Management (الفعاليات).
 *
 * Organize events/occasions, take registrations, issue attendance tickets,
 * check attendees in, and track capacity utilization and revenue. Useful across
 * verticals (clinic open days, restaurant private events, real-estate launches,
 * training sessions, corporate occasions).
 *
 * ADD-ONLY. Data lives in omni.events = { events, registrations, settings }.
 * No confirm()/prompt() — inline forms only (headless-safe).
 */
(function () {
  'use strict';

  let activeView = 'overview';   // overview | events | registrations
  let selectedEventId = null;
  let listStatusFilter = 'all';

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
  function num(v) { const n = Number(v); return isFinite(n) ? n : 0; }
  function fmt(v) { try { return Math.round(num(v)).toLocaleString('en-US'); } catch (_) { return String(Math.round(num(v))); } }
  function todayISO() {
    if (typeof window.todayISO === 'function') { try { return window.todayISO(); } catch (_) {} }
    return new Date().toISOString().slice(0, 10);
  }
  function addDaysISO(iso, n) { const d = new Date((iso || todayISO()) + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix || 'evt'); } catch (_) {} }
    return (prefix || 'evt') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    return { companyId: co.id || org.activeCompanyId || '', companyName: co.name || org.name || '', currencySymbol: org.currencySymbol || 'د.ع' };
  }
  function currency() { return activeProfile().currencySymbol || 'د.ع'; }
  function stamp(rec) {
    try { if (window.TenantService?.stamp) return window.TenantService.stamp(rec, { collection: 'omni.events' }); } catch (_) {}
    const p = activeProfile();
    if (p.companyId && !rec.companyId) { rec.companyId = p.companyId; rec.companyName = p.companyName || ''; }
    return rec;
  }

  /* ───────── model ───────── */
  const EVENT_STATUS = [
    { key: 'draft', label: 'مسودة', cls: 'draft' },
    { key: 'published', label: 'منشور', cls: 'published' },
    { key: 'ongoing', label: 'جارٍ', cls: 'ongoing' },
    { key: 'completed', label: 'منتهٍ', cls: 'completed' },
    { key: 'cancelled', label: 'ملغى', cls: 'cancelled' }
  ];
  function evStatusMeta(k) { return EVENT_STATUS.find(s => s.key === k) || EVENT_STATUS[0]; }
  const REG_STATUS = [
    { key: 'registered', label: 'مُسجّل', cls: 'reg' },
    { key: 'confirmed', label: 'مؤكد', cls: 'conf' },
    { key: 'checked_in', label: 'حاضر', cls: 'in' },
    { key: 'no_show', label: 'لم يحضر', cls: 'noshow' },
    { key: 'cancelled', label: 'ملغى', cls: 'cancel' }
  ];
  function regStatusMeta(k) { return REG_STATUS.find(s => s.key === k) || REG_STATUS[0]; }
  const ACTIVE_REG = ['registered', 'confirmed', 'checked_in'];

  function ensureData() {
    const o = O();
    if (!o.events || typeof o.events !== 'object') o.events = {};
    const e = o.events;
    if (!Array.isArray(e.events)) e.events = [];
    if (!Array.isArray(e.registrations)) e.registrations = [];
    if (!e.settings || typeof e.settings !== 'object') e.settings = {};

    if (!e.events.length && !e._seeded) {
      e._seeded = true;
      const ev1 = stamp({ id: uid('evt'), name: 'يوم مفتوح للعملاء', type: 'open_day', startDate: addDaysISO(todayISO(), 7), endDate: addDaysISO(todayISO(), 7), venue: 'المقر الرئيسي', capacity: 100, ticketPrice: 0, status: 'published', description: 'فعالية تعريفية بالخدمات الجديدة.', createdAt: new Date().toISOString(), createdBy: 'system' });
      const ev2 = stamp({ id: uid('evt'), name: 'ورشة تدريبية - السلامة المهنية', type: 'training', startDate: addDaysISO(todayISO(), 14), endDate: addDaysISO(todayISO(), 14), venue: 'قاعة التدريب', capacity: 30, ticketPrice: 25000, status: 'published', description: 'دورة سلامة معتمدة للموظفين والعملاء.', createdAt: new Date().toISOString(), createdBy: 'system' });
      e.events.push(ev1, ev2);
      e.registrations.push(stamp({ id: uid('reg'), eventId: ev1.id, attendeeName: 'سارة محمد', contact: '07700000000', ticketType: 'عام', status: 'confirmed', registeredAt: new Date().toISOString() }));
      e.registrations.push(stamp({ id: uid('reg'), eventId: ev1.id, attendeeName: 'أحمد العبيدي', contact: '', ticketType: 'عام', status: 'registered', registeredAt: new Date().toISOString() }));
      e.registrations.push(stamp({ id: uid('reg'), eventId: ev2.id, attendeeName: 'علي حسن', contact: '', ticketType: 'موظف', status: 'checked_in', registeredAt: new Date().toISOString() }));
    }
  }
  function EV() { ensureData(); return O().events; }
  function eventById(id) { return EV().events.find(e => e.id === id); }
  function regsFor(eventId) { return EV().registrations.filter(r => r.eventId === eventId); }
  function activeRegsFor(eventId) { return regsFor(eventId).filter(r => ACTIVE_REG.includes(r.status)); }

  /* ───────── KPIs ───────── */
  function kpis() {
    const e = EV();
    const today = todayISO();
    const upcoming = e.events.filter(ev => ['published', 'ongoing'].includes(ev.status) && ev.startDate >= today).length;
    const activeRegs = e.registrations.filter(r => ACTIVE_REG.includes(r.status)).length;
    const checkedIn = e.registrations.filter(r => r.status === 'checked_in').length;
    // capacity utilization across published/ongoing events
    const liveEvents = e.events.filter(ev => ['published', 'ongoing'].includes(ev.status));
    const cap = liveEvents.reduce((s, ev) => s + num(ev.capacity), 0);
    const booked = liveEvents.reduce((s, ev) => s + activeRegsFor(ev.id).length, 0);
    const util = cap ? Math.min(100, Math.round((booked / cap) * 100)) : 0;
    // revenue from active registrations (price × seat)
    const revenue = e.registrations.filter(r => ACTIVE_REG.includes(r.status)).reduce((s, r) => {
      const ev = eventById(r.eventId); return s + (ev ? num(ev.ticketPrice) : 0);
    }, 0);
    return { upcoming, totalEvents: e.events.length, activeRegs, checkedIn, util, revenue };
  }

  /* ───────── render ───────── */
  function kpiStrip() {
    const k = kpis();
    const card = (icon, color, value, label) =>
      '<div class="evt-kpi"><div class="evt-kpi-icon" style="background:' + color + '22;color:' + color + '"><i class="fa-solid ' + icon + '"></i></div>'
      + '<div class="evt-kpi-info"><span class="evt-kpi-value">' + esc(value) + '</span><span class="evt-kpi-label">' + esc(label) + '</span></div></div>';
    return '<div class="evt-kpi-strip">'
      + card('fa-calendar-day', '#818cf8', k.upcoming, 'فعاليات قادمة')
      + card('fa-layer-group', '#38bdf8', k.totalEvents, 'إجمالي الفعاليات')
      + card('fa-user-check', '#34d399', k.activeRegs, 'تسجيلات نشطة')
      + card('fa-person-walking-arrow-right', '#a855f7', k.checkedIn, 'تسجيل الحضور')
      + card('fa-gauge-high', '#fb923c', k.util + '%', 'نسبة الإشغال')
      + card('fa-coins', '#facc15', fmt(k.revenue) + ' ' + currency(), 'الإيراد')
      + '</div>';
  }

  function toolbar() {
    const tab = (key, icon, label) =>
      '<button class="evt-tab ' + (activeView === key ? 'active' : '') + '" onclick="evtSetView(\'' + key + '\')"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
    return '<div class="evt-tabs">'
      + tab('overview', 'fa-gauge', 'نظرة عامة')
      + tab('events', 'fa-calendar-star', 'الفعاليات')
      + (selectedEventId ? tab('registrations', 'fa-users', 'تسجيلات الفعالية') : '')
      + '</div>';
  }

  function eventCard(ev) {
    const sm = evStatusMeta(ev.status);
    const active = activeRegsFor(ev.id).length;
    const pct = num(ev.capacity) ? Math.min(100, Math.round((active / num(ev.capacity)) * 100)) : 0;
    let acts = '';
    if (ev.status === 'draft') acts += '<button class="evt-mini" onclick="evtPublish(\'' + ev.id + '\')">نشر</button>';
    if (['published', 'ongoing'].includes(ev.status)) acts += '<button class="evt-mini primary" onclick="evtOpenRegs(\'' + ev.id + '\')">التسجيلات (' + active + ')</button>';
    if (ev.status === 'published') acts += '<button class="evt-mini" onclick="evtSetStatus(\'' + ev.id + '\',\'completed\')">إنهاء</button>';
    if (['draft', 'published'].includes(ev.status)) acts += '<button class="evt-mini danger" onclick="evtSetStatus(\'' + ev.id + '\',\'cancelled\')">إلغاء</button>';
    return '<div class="evt-card">'
      + '<div class="evt-card-head"><span class="evt-badge ' + sm.cls + '">' + esc(sm.label) + '</span><span class="evt-card-date"><i class="fa-solid fa-calendar"></i> ' + esc(ev.startDate) + '</span></div>'
      + '<h3 class="evt-card-title">' + esc(ev.name) + '</h3>'
      + '<div class="evt-card-meta"><span><i class="fa-solid fa-location-dot"></i> ' + esc(ev.venue || '—') + '</span>'
      + (num(ev.ticketPrice) ? '<span><i class="fa-solid fa-ticket"></i> ' + fmt(ev.ticketPrice) + ' ' + currency() + '</span>' : '<span><i class="fa-solid fa-ticket"></i> مجاني</span>') + '</div>'
      + '<div class="evt-cap"><div class="evt-cap-bar"><span style="width:' + pct + '%"></span></div><div class="evt-cap-txt">' + active + ' / ' + fmt(ev.capacity) + ' مقعد</div></div>'
      + '<div class="evt-mini-row">' + acts + '</div>'
      + '</div>';
  }

  function overviewView() {
    const e = EV();
    const today = todayISO();
    const upcoming = e.events.filter(ev => ['published', 'ongoing'].includes(ev.status) && ev.startDate >= today)
      .sort((a, b) => a.startDate.localeCompare(b.startDate)).slice(0, 6);
    return '<div class="evt-panel"><div class="evt-panel-head"><h3><i class="fa-solid fa-calendar-day"></i> الفعاليات القادمة</h3>'
      + '<button class="evt-btn" onclick="evtSetView(\'events\')">كل الفعاليات</button></div>'
      + '<div class="evt-grid">' + (upcoming.length ? upcoming.map(eventCard).join('') : '<div class="evt-empty">لا فعاليات قادمة</div>') + '</div></div>'
      + createEventForm();
  }

  function createEventForm() {
    return '<div class="evt-panel evt-add"><h3><i class="fa-solid fa-plus"></i> فعالية جديدة</h3>'
      + '<div class="evt-form-grid">'
      + '<label>اسم الفعالية<input type="text" id="evtF_name" placeholder="عنوان الفعالية"></label>'
      + '<label>النوع<input type="text" id="evtF_type" placeholder="يوم مفتوح / تدريب / إطلاق…"></label>'
      + '<label>المكان<input type="text" id="evtF_venue" placeholder="القاعة/الموقع"></label>'
      + '<label>تاريخ البدء<input type="date" id="evtF_start" value="' + esc(addDaysISO(todayISO(), 7)) + '"></label>'
      + '<label>تاريخ الانتهاء<input type="date" id="evtF_end" value="' + esc(addDaysISO(todayISO(), 7)) + '"></label>'
      + '<label>السعة<input type="number" id="evtF_cap" value="50" min="1"></label>'
      + '<label>سعر التذكرة (' + currency() + ')<input type="number" id="evtF_price" value="0" min="0"></label>'
      + '<label class="evt-wide">الوصف<input type="text" id="evtF_desc" placeholder="وصف مختصر (اختياري)"></label>'
      + '</div>'
      + '<button class="evt-btn primary" onclick="evtCreate(false)"><i class="fa-solid fa-floppy-disk"></i> حفظ كمسودة</button> '
      + '<button class="evt-btn accent" onclick="evtCreate(true)"><i class="fa-solid fa-bullhorn"></i> حفظ ونشر</button></div>';
  }

  function eventsView() {
    const e = EV();
    const statusOpts = '<option value="all">كل الحالات</option>' + EVENT_STATUS.map(s => '<option value="' + s.key + '"' + (listStatusFilter === s.key ? ' selected' : '') + '>' + s.label + '</option>').join('');
    let rows = e.events.slice();
    if (listStatusFilter !== 'all') rows = rows.filter(ev => ev.status === listStatusFilter);
    rows.sort((a, b) => String(b.startDate).localeCompare(String(a.startDate)));
    return '<div class="evt-panel"><div class="evt-list-filters"><label>الحالة<select onchange="evtSetStatusFilter(this.value)">' + statusOpts + '</select></label>'
      + '<span class="evt-list-count">' + rows.length + ' فعالية</span></div>'
      + '<div class="evt-grid">' + (rows.length ? rows.map(eventCard).join('') : '<div class="evt-empty">لا فعاليات مطابقة</div>') + '</div></div>'
      + createEventForm();
  }

  function registrationsView() {
    const ev = eventById(selectedEventId);
    if (!ev) { activeView = 'events'; return eventsView(); }
    const regs = regsFor(ev.id).sort((a, b) => String(b.registeredAt).localeCompare(String(a.registeredAt)));
    const active = activeRegsFor(ev.id).length;
    const full = num(ev.capacity) && active >= num(ev.capacity);
    const body = regs.length ? regs.map(r => {
      const sm = regStatusMeta(r.status);
      let acts = '';
      if (r.status === 'registered') acts += '<button class="evt-mini" onclick="evtRegStatus(\'' + r.id + '\',\'confirmed\')">تأكيد</button>';
      if (['registered', 'confirmed'].includes(r.status)) acts += '<button class="evt-mini primary" onclick="evtRegStatus(\'' + r.id + '\',\'checked_in\')">حضور</button>';
      if (ACTIVE_REG.includes(r.status)) {
        acts += '<button class="evt-mini" onclick="evtRegStatus(\'' + r.id + '\',\'no_show\')">لم يحضر</button>';
        acts += '<button class="evt-mini danger" onclick="evtRegStatus(\'' + r.id + '\',\'cancelled\')">إلغاء</button>';
      }
      return '<tr><td>' + esc(r.attendeeName) + (r.contact ? '<span class="evt-sub">' + esc(r.contact) + '</span>' : '') + '</td>'
        + '<td>' + esc(r.ticketType || '—') + '</td>'
        + '<td><span class="evt-badge ' + sm.cls + '">' + esc(sm.label) + '</span></td>'
        + '<td><div class="evt-mini-row">' + acts + '</div></td></tr>';
    }).join('') : '<tr><td colspan="4" class="evt-empty-row">لا تسجيلات بعد</td></tr>';
    return '<div class="evt-sign-top"><button class="evt-btn" onclick="evtSetView(\'events\')"><i class="fa-solid fa-arrow-right"></i> رجوع للفعاليات</button>'
      + '<span class="evt-reg-head">' + esc(ev.name) + ' — ' + active + '/' + fmt(ev.capacity) + ' مقعد</span></div>'
      + '<div class="evt-panel"><table class="evt-table"><thead><tr><th>الحاضر</th><th>التذكرة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>' + body + '</tbody></table></div>'
      + '<div class="evt-panel evt-add"><h3><i class="fa-solid fa-user-plus"></i> تسجيل حاضر' + (full ? ' <span class="evt-badge cancel">السعة مكتملة</span>' : '') + '</h3>'
      + '<div class="evt-form-grid">'
      + '<label>الاسم<input type="text" id="evtR_name" placeholder="اسم الحاضر"></label>'
      + '<label>التواصل<input type="text" id="evtR_contact" placeholder="هاتف/بريد (اختياري)"></label>'
      + '<label>نوع التذكرة<input type="text" id="evtR_ticket" placeholder="عام/VIP/موظف"></label>'
      + '</div>'
      + '<button class="evt-btn primary" onclick="evtRegister()"><i class="fa-solid fa-user-plus"></i> تسجيل</button></div>';
  }

  function render() {
    ensureData();
    const body = document.getElementById('eventsBody');
    if (!body) return;
    let content;
    if (activeView === 'registrations') content = registrationsView();
    else if (activeView === 'events') content = eventsView();
    else content = overviewView();
    body.innerHTML = kpiStrip() + toolbar() + '<div class="evt-content">' + content + '</div>';
  }

  /* ───────── actions ───────── */
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  window.evtSetView = function (v) { activeView = v; render(); };
  window.evtSetStatusFilter = function (v) { listStatusFilter = v; render(); };
  window.evtOpenRegs = function (id) { selectedEventId = id; activeView = 'registrations'; render(); };

  window.evtCreate = function (publish) {
    const name = val('evtF_name');
    if (!name) { toast('أدخل اسم الفعالية', 'warning'); return; }
    const e = EV();
    const rec = stamp({
      id: uid('evt'), name,
      type: val('evtF_type') || 'general',
      venue: val('evtF_venue'),
      startDate: val('evtF_start') || addDaysISO(todayISO(), 7),
      endDate: val('evtF_end') || val('evtF_start') || addDaysISO(todayISO(), 7),
      capacity: Math.max(1, Math.round(num(val('evtF_cap')))) || 50,
      ticketPrice: Math.max(0, num(val('evtF_price'))),
      status: publish ? 'published' : 'draft',
      description: val('evtF_desc'),
      createdAt: new Date().toISOString(),
      createdBy: currentUserName()
    });
    e.events.push(rec);
    save();
    activeView = 'events';
    render();
    toast(publish ? 'تم إنشاء الفعالية ونشرها ✅' : 'تم حفظ المسودة', 'success');
  };

  window.evtPublish = function (id) {
    const ev = eventById(id); if (!ev) return;
    ev.status = 'published'; save(); render(); toast('تم نشر الفعالية 📣', 'success');
  };
  window.evtSetStatus = function (id, status) {
    const ev = eventById(id); if (!ev) return;
    ev.status = status; save(); render();
    toast('تم تحديث حالة الفعالية إلى «' + evStatusMeta(status).label + '»', status === 'cancelled' ? 'warning' : 'success');
  };

  window.evtRegister = function () {
    const ev = eventById(selectedEventId); if (!ev) return;
    const name = val('evtR_name');
    if (!name) { toast('أدخل اسم الحاضر', 'warning'); return; }
    const active = activeRegsFor(ev.id).length;
    if (num(ev.capacity) && active >= num(ev.capacity)) { toast('السعة مكتملة لهذه الفعالية', 'danger'); return; }
    EV().registrations.push(stamp({ id: uid('reg'), eventId: ev.id, attendeeName: name, contact: val('evtR_contact'), ticketType: val('evtR_ticket') || 'عام', status: 'registered', registeredAt: new Date().toISOString() }));
    save(); render();
    toast('تم التسجيل ✅', 'success');
  };
  window.evtRegStatus = function (id, status) {
    const r = EV().registrations.find(x => x.id === id); if (!r) return;
    r.status = status; r.updatedAt = new Date().toISOString(); save(); render();
    toast('تم تحديث حالة الحاضر إلى «' + regStatusMeta(status).label + '»', status === 'cancelled' ? 'warning' : 'success');
  };

  /* ───────── navigation wiring ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('events');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageEvents');
    const nav = document.getElementById('navEvents');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('events'); } catch (_) {} }
    window.currentPage = 'events';
    render();
    return !!pg;
  }
  function wireSwitch() {
    if (window.__eventsWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'events') {
        try { if (activatePage()) return; } catch (e) { console.warn('Events render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__eventsWrapped = true;
  }
  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools || JarvisBrain.tools.report_events_today) return;
      JarvisBrain.tools.report_events_today = {
        desc_en: 'Events summary: upcoming events, registrations, check-ins, capacity utilization and revenue.',
        risk: 'safe',
        params: {},
        run: function () {
          const today = todayISO();
          return {
            kpis: kpis(),
            upcoming: EV().events.filter(ev => ['published', 'ongoing'].includes(ev.status) && ev.startDate >= today)
              .map(ev => ({ name: ev.name, date: ev.startDate, venue: ev.venue, registered: activeRegsFor(ev.id).length, capacity: ev.capacity }))
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
      if (window.__eventsWrapped || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonEvents = {
    ensureData,
    render,
    kpis,
    report: function () { return JarvisBrain?.tools?.report_events_today?.run?.() || kpis(); },
    open: function () { try { window.switchPage('events'); } catch (_) {} }
  };
})();
