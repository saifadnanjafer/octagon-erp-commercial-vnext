/**
 * OCTAGON ERP — Workshop Ledger → Legacy Timesheet bridge.
 *
 * One-way sync: قاعدة_موحدة.xlsx (imported into omni.wsLedger.attendanceDays,
 * see modules/workshop-ledger.js) is the authoritative attendance source.
 * This fills the legacy "التايم شيت الذكي" (employees[].records[]) so its
 * checkin/checkout stay current past whatever date it last had real
 * punches, and carries the workshop-ledger notes (including merged ERP case
 * notes) into the notes column. Called automatically at the end of
 * wsRunImport() — no separate import button, per the existing "استيراد
 * البيانات" flow already being the single import entry point.
 *
 * Safety rules (never violate):
 *  - Never overwrite an EXISTING day's checkIn/checkOut if either already
 *    has a value — protects real punches and manager corrections.
 *  - Never touch status/advance/penalty/bonus/damage on an EXISTING record.
 *  - Notes: only overwrite if the current text was itself written by this
 *    same bridge before (tracked via rec._wsBridgeSynced) or is empty — a
 *    human-typed note is never touched.
 *  - New day records are created ONLY for dates missing from emp.records
 *    entirely, with a conservative status (only 'normal'/'friday'/
 *    'friday_work' when the source is unambiguous and both times are
 *    present; otherwise 'absent' + the source note) — never invents
 *    advance/penalty/bonus/damage.
 */
(function () {
  'use strict';

  const NAME_ALIAS_LEGACY_TO_WS = {
    'حيدر محمد': 'حيدر محمد الحداد',
    'خضر عبد الخالق': 'خضر عبدالخالق'
  };
  function squash(s) { return String(s == null ? '' : s).replace(/\s+/g, ''); }

  function matchWsEmployeeName(legacyName, wsNames) {
    if (wsNames.indexOf(legacyName) >= 0) return legacyName;
    if (NAME_ALIAS_LEGACY_TO_WS[legacyName]) return NAME_ALIAS_LEGACY_TO_WS[legacyName];
    const sq = squash(legacyName);
    const hit = wsNames.find(n => squash(n) === sq);
    return hit || null;
  }

  function isoToParts(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    if (!m) return null;
    return { year: parseInt(m[1], 10), month: parseInt(m[2], 10), day: parseInt(m[3], 10) };
  }

  function computeHours(checkInMin, checkOutMin) {
    if (checkInMin == null || checkOutMin == null) return 0;
    const h = checkOutMin > checkInMin ? (checkOutMin - checkInMin) / 60 : ((24 * 60 - checkInMin) + checkOutMin) / 60;
    return Math.round(h * 100) / 100;
  }

  window.wsBridgeSyncLegacyTimesheet = function () {
    if (typeof employees === 'undefined' || !Array.isArray(employees) || !employees.length) return { filled: 0, created: 0, notesSynced: 0 };
    const o = (typeof omni !== 'undefined' ? omni : window.omni);
    const d = o && o.wsLedger;
    if (!d || !Array.isArray(d.attendanceDays) || !d.attendanceDays.length) return { filled: 0, created: 0, notesSynced: 0 };
    const parseTimeFn = (typeof parseTime === 'function') ? parseTime : (typeof window.parseTime === 'function' ? window.parseTime : null);

    const wsNames = (d.employeesRef || []).map(e => e.name);
    let filled = 0, created = 0, notesSynced = 0;

    employees.forEach(emp => {
      const wsName = matchWsEmployeeName(emp.name, wsNames);
      if (!wsName) return;
      const days = d.attendanceDays.filter(a => a.employee_name === wsName);
      if (!days.length) return;
      if (!Array.isArray(emp.records)) emp.records = [];

      days.forEach(a => {
        const p = isoToParts(a.date);
        if (!p) return;
        const hasCheckin = !!(a.checkin && String(a.checkin).trim());
        const hasCheckout = !!(a.checkout && String(a.checkout).trim());
        let rec = emp.records.find(r => r.day === p.day && r.month === p.month && r.year === p.year);

        if (!rec) {
          let status = 'absent';
          if (a.status === 'friday') status = 'friday';
          else if (a.status === 'friday_work' && hasCheckin && hasCheckout) status = 'friday_work';
          else if (a.status === 'normal' && hasCheckin && hasCheckout) status = 'normal';
          const checkInMin = parseTimeFn ? parseTimeFn(a.checkin) : null;
          const checkOutMin = parseTimeFn ? parseTimeFn(a.checkout) : null;
          rec = {
            day: p.day, month: p.month, year: p.year,
            date: String(p.day).padStart(2, '0') + '/' + String(p.month).padStart(2, '0') + '/' + p.year,
            checkIn: a.checkin || '', checkOut: a.checkout || '',
            checkInMin, checkOutMin, hours: computeHours(checkInMin, checkOutMin),
            status, advance: 0, penalty: 0, bonus: 0, damage: 0, notes: '',
            _wsBridgeCreated: true
          };
          emp.records.push(rec);
          created++;
        } else if (!rec.checkIn && !rec.checkOut && (hasCheckin || hasCheckout)) {
          rec.checkIn = a.checkin || ''; rec.checkOut = a.checkout || '';
          rec.checkInMin = parseTimeFn ? parseTimeFn(rec.checkIn) : null;
          rec.checkOutMin = parseTimeFn ? parseTimeFn(rec.checkOut) : null;
          rec.hours = computeHours(rec.checkInMin, rec.checkOutMin);
          rec._wsBridgeFilled = true;
          filled++;
        }

        if (a.note && (!rec.notes || rec._wsBridgeSynced)) {
          const tagged = '🔗 ' + a.note;
          if (rec.notes !== tagged) { rec.notes = tagged; rec._wsBridgeSynced = true; notesSynced++; }
        }
      });
    });

    if (filled || created || notesSynced) {
      if (typeof saveData === 'function') saveData();
      if (typeof renderTimesheet === 'function') { try { renderTimesheet(); } catch (_) {} }
    }
    return { filled, created, notesSynced };
  };
})();
