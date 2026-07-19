/**
 * OCTAGON ERP — Visitor Management / Reception (إدارة الزوّار والاستقبال).
 *
 * A front-desk/gate surface the system lacked: pre-register or walk-in visitors,
 * record host + purpose, issue a badge, and track check-in / check-out and who is
 * on-site right now. Useful for any facility (office, workshop gate, clinic
 * reception, hotel front desk).
 *
 * ADD-ONLY. Data lives in omni.visitors = { visits, settings }.
 * No confirm()/prompt() — inline forms only (headless-safe).
 */
(function () {
  'use strict';

  let activeView = 'overview';   // overview | log
  let logStatusFilter = 'all';
  let logDate = null;            // YYYY-MM-DD for log filter (null = all)

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
  function todayISO() {
    if (typeof window.todayISO === 'function') { try { return window.todayISO(); } catch (_) {} }
    return new Date().toISOString().slice(0, 10);
  }
  function nowHM() { const d = new Date(); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function nowISO() { return new Date().toISOString(); }
  function hmFromISO(iso) { try { return new Date(iso).toTimeString().slice(0, 5); } catch (_) { return ''; } }
  function uid(prefix) {
    if (typeof window.makeId === 'function') { try { return window.makeId(prefix || 'vis'); } catch (_) {} }
    return (prefix || 'vis') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
    try { if (window.TenantService?.stamp) return window.TenantService.stamp(rec, { collection: 'omni.visitors' }); } catch (_) {}
    const p = activeProfile();
    if (p.companyId && !rec.companyId) { rec.companyId = p.companyId; rec.companyName = p.companyName || ''; }
    return rec;
  }
  // host employee suggestions (read-only) from the existing employees collection
  function hostNames() {
    try {
      const emps = O().employees;
      if (Array.isArray(emps)) return emps.map(e => e.name || e.fullName).filter(Boolean).slice(0, 200);
    } catch (_) {}
    return [];
  }

  /* ───────── model ───────── */
  const STATUSES = [
    { key: 'expected', label: 'متوقّع', cls: 'expected' },
    { key: 'checked_in', label: 'بالداخل', cls: 'in' },
    { key: 'checked_out', label: 'غادر', cls: 'out' }
  ];
  function statusMeta(k) { return STATUSES.find(s => s.key === k) || STATUSES[0]; }

  function ensureData() {
    const o = O();
    if (!o.visitors || typeof o.visitors !== 'object') o.visitors = {};
    const v = o.visitors;
    if (!Array.isArray(v.visits)) v.visits = [];
    if (!v.settings || typeof v.settings !== 'object') v.settings = {};
    if (v.settings.nextBadge == null) v.settings.nextBadge = 101;

    if (!v.visits.length && !v._seeded) {
      v._seeded = true;
      v.visits.push(stamp({ id: uid('vis'), visitorName: 'مهندس شركة الرافدين', company: 'الرافدين للتكنولوجيا', contact: '07700000000', host: 'مدير الصيانة', purpose: 'صيانة دورية', date: todayISO(), status: 'checked_in', badgeNo: 101, checkInAt: nowISO(), createdAt: nowISO(), createdBy: 'system' }));
      v.visits.push(stamp({ id: uid('vis'), visitorName: 'مندوب توريد', company: 'مكتب بابل', contact: '', host: 'قسم المشتريات', purpose: 'تسليم عيّنات', date: todayISO(), status: 'expected', badgeNo: null, createdAt: nowISO(), createdBy: 'system' }));
      v.settings.nextBadge = 102;
    }
  }
  function V() { ensureData(); return O().visitors; }
  function visitById(id) { return V().visits.find(x => x.id === id); }
  function issueBadge() { const v = V(); const b = num(v.settings.nextBadge) || 101; v.settings.nextBadge = b + 1; return b; }

  /* ───────── KPIs ───────── */
  function kpis() {
    const v = V();
    const today = todayISO();
    const onSite = v.visits.filter(x => x.status === 'checked_in').length;
    const expectedToday = v.visits.filter(x => x.status === 'expected' && x.date === today).length;
    const inToday = v.visits.filter(x => x.checkInAt && String(x.checkInAt).slice(0, 10) === today).length;
    const outToday = v.visits.filter(x => x.status === 'checked_out' && x.checkOutAt && String(x.checkOutAt).slice(0, 10) === today).length;
    // avg duration (minutes) of completed visits today
    const durations = v.visits.filter(x => x.checkInAt && x.checkOutAt && String(x.checkOutAt).slice(0, 10) === today)
      .map(x => Math.max(0, Math.round((new Date(x.checkOutAt) - new Date(x.checkInAt)) / 60000)));
    const avgDur = durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0;
    return { onSite, expectedToday, inToday, outToday, avgDur };
  }

  /* ───────── render ───────── */
  function kpiStrip() {
    const k = kpis();
    const card = (icon, color, value, label) =>
      '<div class="vis-kpi"><div class="vis-kpi-icon" style="background:' + color + '22;color:' + color + '"><i class="fa-solid ' + icon + '"></i></div>'
      + '<div class="vis-kpi-info"><span class="vis-kpi-value">' + esc(value) + '</span><span class="vis-kpi-label">' + esc(label) + '</span></div></div>';
    return '<div class="vis-kpi-strip">'
      + card('fa-user-check', '#34d399', k.onSite, 'بالداخل الآن')
      + card('fa-user-clock', '#facc15', k.expectedToday, 'متوقّعون اليوم')
      + card('fa-right-to-bracket', '#38bdf8', k.inToday, 'دخول اليوم')
      + card('fa-right-from-bracket', '#a855f7', k.outToday, 'خروج اليوم')
      + card('fa-hourglass-half', '#fb923c', k.avgDur + ' د', 'متوسط مدة الزيارة')
      + '</div>';
  }

  function toolbar() {
    const tab = (key, icon, label) =>
      '<button class="vis-tab ' + (activeView === key ? 'active' : '') + '" onclick="visSetView(\'' + key + '\')"><i class="fa-solid ' + icon + '"></i> ' + label + '</button>';
    return '<div class="vis-tabs">'
      + tab('overview', 'fa-gauge', 'لوحة الاستقبال')
      + tab('log', 'fa-list', 'سجل الزيارات')
      + '</div>';
  }

  function visitActions(x) {
    let out = '';
    if (x.status === 'expected') {
      out += '<button class="vis-mini primary" onclick="visCheckIn(\'' + x.id + '\')">تسجيل دخول</button>';
      out += '<button class="vis-mini danger" onclick="visCancel(\'' + x.id + '\')">إلغاء</button>';
    } else if (x.status === 'checked_in') {
      out += '<button class="vis-mini accent" onclick="visCheckOut(\'' + x.id + '\')">تسجيل خروج</button>';
    }
    return '<div class="vis-mini-row">' + out + '</div>';
  }

  function visitRow(x) {
    const sm = statusMeta(x.status);
    const badge = x.badgeNo ? '<span class="vis-badge-no">#' + esc(x.badgeNo) + '</span>' : '<span class="vis-sub">—</span>';
    const times = (x.checkInAt ? 'دخول ' + esc(hmFromISO(x.checkInAt)) : '') + (x.checkOutAt ? ' · خروج ' + esc(hmFromISO(x.checkOutAt)) : '');
    return '<tr><td>' + esc(x.visitorName) + (x.company ? '<span class="vis-sub">' + esc(x.company) + '</span>' : '') + '</td>'
      + '<td>' + esc(x.host || '—') + (x.purpose ? '<span class="vis-sub">' + esc(x.purpose) + '</span>' : '') + '</td>'
      + '<td>' + badge + '</td>'
      + '<td><span class="vis-badge ' + sm.cls + '">' + esc(sm.label) + '</span>' + (times ? '<span class="vis-sub">' + times + '</span>' : '') + '</td>'
      + '<td>' + visitActions(x) + '</td></tr>';
  }

  function visitsTable(rows) {
    const body = rows.length ? rows.map(visitRow).join('') : '<tr><td colspan="5" class="vis-empty-row">لا زيارات</td></tr>';
    return '<table class="vis-table"><thead><tr><th>الزائر</th><th>المضيف / الغرض</th><th>الشارة</th><th>الحالة</th><th>إجراءات</th></tr></thead><tbody>' + body + '</tbody></table>';
  }

  function overviewView() {
    const v = V();
    const today = todayISO();
    const onSite = v.visits.filter(x => x.status === 'checked_in')
      .sort((a, b) => String(b.checkInAt).localeCompare(String(a.checkInAt)));
    const expected = v.visits.filter(x => x.status === 'expected' && x.date >= today)
      .sort((a, b) => String(a.date).localeCompare(String(b.date)));
    return '<div class="vis-two-col">'
      + '<div class="vis-panel"><div class="vis-panel-head"><h3><i class="fa-solid fa-user-check"></i> بالداخل الآن <span class="vis-count">' + onSite.length + '</span></h3></div>'
      + visitsTable(onSite) + '</div>'
      + '<div class="vis-panel"><div class="vis-panel-head"><h3><i class="fa-solid fa-user-clock"></i> متوقّعون <span class="vis-count">' + expected.length + '</span></h3></div>'
      + visitsTable(expected) + '</div></div>'
      + registerForm();
  }

  function registerForm() {
    const hosts = hostNames();
    const datalist = hosts.length ? '<datalist id="visHostList">' + hosts.map(h => '<option value="' + esc(h) + '">').join('') + '</datalist>' : '';
    return '<div class="vis-panel vis-add"><h3><i class="fa-solid fa-user-plus"></i> تسجيل زائر</h3>'
      + '<div class="vis-form-grid">'
      + '<label>اسم الزائر<input type="text" id="visF_name" placeholder="الاسم الكامل"></label>'
      + '<label>الجهة/الشركة<input type="text" id="visF_company" placeholder="اختياري"></label>'
      + '<label>التواصل<input type="text" id="visF_contact" placeholder="هاتف (اختياري)"></label>'
      + '<label>المضيف<input type="text" id="visF_host" list="visHostList" placeholder="الموظف المُضيف">' + datalist + '</label>'
      + '<label>الغرض<input type="text" id="visF_purpose" placeholder="سبب الزيارة"></label>'
      + '<label>التاريخ<input type="date" id="visF_date" value="' + esc(todayISO()) + '"></label>'
      + '</div>'
      + '<button class="vis-btn primary" onclick="visRegister(true)"><i class="fa-solid fa-right-to-bracket"></i> دخول الآن</button> '
      + '<button class="vis-btn" onclick="visRegister(false)"><i class="fa-solid fa-user-clock"></i> حجز كزائر متوقّع</button></div>';
  }

  function logView() {
    const v = V();
    const statusOpts = '<option value="all">كل الحالات</option>' + STATUSES.map(s => '<option value="' + s.key + '"' + (logStatusFilter === s.key ? ' selected' : '') + '>' + s.label + '</option>').join('');
    let rows = v.visits.slice();
    if (logStatusFilter !== 'all') rows = rows.filter(x => x.status === logStatusFilter);
    if (logDate) rows = rows.filter(x => x.date === logDate || String(x.checkInAt || '').slice(0, 10) === logDate);
    rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return '<div class="vis-panel"><div class="vis-list-filters">'
      + '<label>الحالة<select onchange="visSetStatusFilter(this.value)">' + statusOpts + '</select></label>'
      + '<label>التاريخ<input type="date" value="' + esc(logDate || '') + '" onchange="visSetLogDate(this.value)"></label>'
      + '<button class="vis-btn" onclick="visClearLogDate()">الكل</button>'
      + '<span class="vis-list-count">' + rows.length + ' زيارة</span></div>'
      + visitsTable(rows) + '</div>'
      + registerForm();
  }

  function render() {
    ensureData();
    const body = document.getElementById('visitorsBody');
    if (!body) return;
    let content;
    if (activeView === 'log') content = logView();
    else content = overviewView();
    body.innerHTML = kpiStrip() + toolbar() + '<div class="vis-content">' + content + '</div>';
  }

  /* ───────── actions ───────── */
  function val(id) { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; }

  window.visSetView = function (v) { activeView = v; render(); };
  window.visSetStatusFilter = function (v) { logStatusFilter = v; render(); };
  window.visSetLogDate = function (v) { logDate = v || null; render(); };
  window.visClearLogDate = function () { logDate = null; render(); };

  window.visRegister = function (checkInNow) {
    const name = val('visF_name');
    if (!name) { toast('أدخل اسم الزائر', 'warning'); return; }
    const v = V();
    const rec = stamp({
      id: uid('vis'),
      visitorName: name,
      company: val('visF_company'),
      contact: val('visF_contact'),
      host: val('visF_host'),
      purpose: val('visF_purpose'),
      date: val('visF_date') || todayISO(),
      status: checkInNow ? 'checked_in' : 'expected',
      badgeNo: checkInNow ? issueBadge() : null,
      checkInAt: checkInNow ? nowISO() : null,
      createdAt: nowISO(),
      createdBy: currentUserName()
    });
    v.visits.push(rec);
    save();
    render();
    toast(checkInNow ? ('تم تسجيل الدخول — الشارة #' + rec.badgeNo + ' 🪪') : 'تم حجز الزائر المتوقّع ✅', 'success');
  };

  window.visCheckIn = function (id) {
    const x = visitById(id); if (!x || x.status !== 'expected') return;
    x.status = 'checked_in';
    x.checkInAt = nowISO();
    if (!x.badgeNo) x.badgeNo = issueBadge();
    save(); render();
    toast('تم تسجيل الدخول — الشارة #' + x.badgeNo + ' 🪪', 'success');
  };

  window.visCheckOut = function (id) {
    const x = visitById(id); if (!x || x.status !== 'checked_in') return;
    x.status = 'checked_out';
    x.checkOutAt = nowISO();
    save(); render();
    toast('تم تسجيل الخروج وإعادة الشارة #' + (x.badgeNo || '') + ' 👋', 'info');
  };

  window.visCancel = function (id) {
    const x = visitById(id); if (!x || x.status !== 'expected') return;
    // soft-remove an expected (never-arrived) visitor
    const v = V();
    v.visits = v.visits.filter(y => y.id !== id);
    save(); render();
    toast('تم إلغاء الزيارة المتوقّعة', 'warning');
  };

  /* ───────── navigation wiring ───────── */
  function activatePage() {
    const allowed = !window.PermissionService || window.PermissionService.checkPage('visitors');
    if (!allowed) { toast('لا تملك صلاحية لهذا القسم', 'danger'); return true; }
    document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pg = document.getElementById('pageVisitors');
    const nav = document.getElementById('navVisitors');
    if (pg) pg.classList.add('page-active');
    if (nav) nav.classList.add('active');
    if (typeof window.ensureNavGroupForPage === 'function') { try { window.ensureNavGroupForPage('visitors'); } catch (_) {} }
    window.currentPage = 'visitors';
    render();
    return !!pg;
  }
  function wireSwitch() {
    if (window.__visitorsWrapped || typeof window.switchPage !== 'function') return;
    const orig = window.switchPage;
    window.switchPage = function (page) {
      if (page === 'visitors') {
        try { if (activatePage()) return; } catch (e) { console.warn('Visitors render error', e); }
      }
      return orig.apply(this, arguments);
    };
    window.__visitorsWrapped = true;
  }
  function registerJarvis() {
    try {
      if (!window.JarvisBrain || !JarvisBrain.tools || JarvisBrain.tools.report_visitors_today) return;
      JarvisBrain.tools.report_visitors_today = {
        desc_en: 'Visitor management summary: who is on-site now, expected today, check-ins/check-outs and average visit duration.',
        risk: 'safe',
        params: {},
        run: function () {
          return {
            kpis: kpis(),
            onSite: V().visits.filter(x => x.status === 'checked_in')
              .map(x => ({ visitor: x.visitorName, host: x.host, badge: x.badgeNo, since: hmFromISO(x.checkInAt) }))
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
      if (window.__visitorsWrapped || tries > 40) clearInterval(t);
    }, 150);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.OctagonVisitors = {
    ensureData,
    render,
    kpis,
    report: function () { return JarvisBrain?.tools?.report_visitors_today?.run?.() || kpis(); },
    open: function () { try { window.switchPage('visitors'); } catch (_) {} }
  };
})();
