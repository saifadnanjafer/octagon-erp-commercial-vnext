/* ═══════════════════════════════════════════════════
   OCTAGON ERP SYSTEM - JavaScript
   Salary Calculation Engine + UI Logic
   ═══════════════════════════════════════════════════ */

// ─── State ───
let employees = [];
let finance = null;
let omni = null;
let selectedEmpIdx = 0;
let reportEmpIdx = 0;
let currentPage = 'home';
let selectedCalendarDay = null;
window.lastCalcResult = null;
let saveTimeout = null;
let hasAutoLoadedExcel = false;
let omniNotificationDropdownOpen = false;
let omniAudioContext = null;
let omniAudioUnlocked = false;
let omniSystemLogFilter = 'all';
let omniSystemLogSearch = '';
let activeRequestSection = 'pending';
let routedSupervisorFilter = '';
let activeRequestCategory = 'all';

document.addEventListener('pointerdown', () => {
  omniAudioUnlocked = true;
  if (omniAudioContext && omniAudioContext.state === 'suspended') {
    omniAudioContext.resume().catch(() => {});
  }
}, { once: true });

function debounceSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveData();
    console.log('Auto-saved');
  }, 500);
}

// ─── Global Clock & Header Sync ───
function updateHeaderClock() {
  const now = new Date();
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

  const clockEl = document.getElementById('globalClock');
  const dateEl = document.getElementById('globalDate');

  if(clockEl) clockEl.textContent = now.toLocaleTimeString('en-GB');
  if(dateEl) dateEl.textContent = now.toLocaleDateString('ar-IQ', options);

  if (typeof runManualAuditScanSilent === 'function') {
    try {
      window.stuckCardsCheckTimer = (window.stuckCardsCheckTimer || 0) + 1;
      if (window.stuckCardsCheckTimer >= 30) {
        window.stuckCardsCheckTimer = 0;
        runManualAuditScanSilent();
      }
    } catch(e) { console.error(e); }
  }
}

setInterval(updateHeaderClock, 1000);

const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

// ─── OMNI MODAL ENGINE ───
function showOmniModal(title, contentHtml, onConfirm, onOpen) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('omniModalOverlay');
    const titleEl = document.getElementById('omniModalTitle');
    const bodyEl = document.getElementById('omniModalBody');
    const cancelBtn = document.getElementById('omniModalCancel');
    const confirmBtn = document.getElementById('omniModalConfirm');

    titleEl.textContent = title;
    bodyEl.innerHTML = contentHtml;
    overlay.style.display = 'flex';
    bodyEl.scrollTop = 0;
    document.body.classList.add('omni-modal-open');
    if (typeof onOpen === 'function') onOpen(bodyEl);

    const closeModal = () => {
      overlay.style.display = 'none';
      document.body.classList.remove('omni-modal-open');
      cancelBtn.onclick = null;
      confirmBtn.onclick = null;
    };

    cancelBtn.onclick = () => {
      closeModal();
      resolve(null);
    };

    confirmBtn.onclick = () => {
      if (onConfirm) {
        const result = onConfirm(bodyEl);
        if (result !== false) {
          closeModal();
          resolve(result);
        }
      } else {
        closeModal();
        resolve(true);
      }
    };
  });
}

// Global close helper for custom buttons rendered INSIDE an omni modal body
// (e.g. the stock-transfer document actions). Without this, onclick handlers
// like `closeOmniModal(); validateTransferFrontend(...)` throw a ReferenceError
// and the action after the `;` never runs.
function closeOmniModal() {
  const overlay = document.getElementById('omniModalOverlay');
  if (!overlay) return;
  overlay.style.display = 'none';
  document.body.classList.remove('omni-modal-open');
  const cancelBtn = document.getElementById('omniModalCancel');
  const confirmBtn = document.getElementById('omniModalConfirm');
  if (cancelBtn) cancelBtn.onclick = null;
  if (confirmBtn) confirmBtn.onclick = null;
}
window.closeOmniModal = closeOmniModal;

function isOmniModalOpen() {
  const overlay = document.getElementById('omniModalOverlay');
  return !!overlay && overlay.style.display === 'flex';
}

// Small standalone overlay (independent of the reusable omni modal singleton)
// used to ask "save / discard / stay" when Escape is pressed. Kept separate
// so it can render as the true topmost layer above an already-open popup
// without clobbering that popup's own title/body/button bindings.
function showOmniEscCloseConfirm() {
  return new Promise((resolve) => {
    let host = document.getElementById('omniEscConfirm');
    if (!host) {
      host = document.createElement('div');
      host.id = 'omniEscConfirm';
      host.className = 'omni-esc-confirm-overlay';
      host.innerHTML = `
        <div class="omni-esc-confirm-box">
          <p>هل تريد حفظ التغييرات قبل الإغلاق؟</p>
          <div class="omni-esc-confirm-actions">
            <button type="button" class="btn-secondary" data-action="stay">البقاء في النافذة</button>
            <button type="button" class="btn-secondary" data-action="discard">تجاهل والإغلاق</button>
            <button type="button" class="btn-primary" data-action="save">حفظ والإغلاق</button>
          </div>
        </div>`;
      document.body.appendChild(host);
    }
    host.style.display = 'flex';
    host.querySelectorAll('button[data-action]').forEach(btn => {
      btn.onclick = () => {
        host.style.display = 'none';
        resolve(btn.dataset.action);
      };
    });
  });
}

// Global Escape handling for every omni modal: instead of doing nothing (old
// behavior) or silently discarding, ask the user whether to save, discard,
// or stay. Runs in the capture phase so it takes priority over page-specific
// Escape shortcuts (e.g. the workflow studio) while a modal sits on top.
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const escHost = document.getElementById('omniEscConfirm');
  if (escHost && escHost.style.display === 'flex') {
    event.preventDefault();
    event.stopPropagation();
    escHost.style.display = 'none';
    return;
  }
  if (!isOmniModalOpen()) return;
  event.preventDefault();
  event.stopPropagation();
  showOmniEscCloseConfirm().then((action) => {
    if (!action || action === 'stay') return;
    const confirmBtn = document.getElementById('omniModalConfirm');
    const cancelBtn = document.getElementById('omniModalCancel');
    if (action === 'save' && confirmBtn) confirmBtn.click();
    else if (action === 'discard' && cancelBtn) cancelBtn.click();
  });
}, true);

function applySidebarCompactState(collapsed) {
  document.body.classList.toggle('sidebar-collapsed', !!collapsed);
  localStorage.setItem('octagon-sidebar-collapsed', collapsed ? '1' : '0');
  const btn = document.getElementById('sidebarToggleBtn');
  if (btn) {
    btn.setAttribute('aria-pressed', collapsed ? 'true' : 'false');
    btn.title = collapsed ? 'إظهار الشريط الجانبي' : 'إخفاء الشريط الجانبي';
    const icon = btn.querySelector('i');
    if (icon) icon.className = collapsed ? 'fa-solid fa-bars-staggered' : 'fa-solid fa-bars';
  }
}

function toggleSidebarCompact() {
  applySidebarCompactState(!document.body.classList.contains('sidebar-collapsed'));
}
window.toggleSidebarCompact = toggleSidebarCompact;

function initSidebarCompactToggle() {
  applySidebarCompactState(localStorage.getItem('octagon-sidebar-collapsed') === '1');
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSidebarCompactToggle);
} else {
  initSidebarCompactToggle();
}

function loadOctagonAIAssistantFromApp() {
  if (window.octagonAIAssistant && typeof window.octagonAIAssistant.open === 'function') {
    return Promise.resolve(window.octagonAIAssistant);
  }
  if (window.__octagonAIAssistantPromise) return window.__octagonAIAssistantPromise;
  window.__octagonAIAssistantPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'omni-ai-assistant.js?v=20260707-restore-cluster-v2';
    script.async = true;
    script.onload = () => resolve(window.octagonAIAssistant || null);
    script.onerror = () => reject(new Error('AI assistant failed to load'));
    document.body.appendChild(script);
  });
  return window.__octagonAIAssistantPromise;
}

function toggleAIChatFromApp() {
  if (window.octagonAIAssistant && typeof window.octagonAIAssistant.open === 'function') {
    window.octagonAIAssistant.open();
    return;
  }
  loadOctagonAIAssistantFromApp().then((assistant) => {
    if (assistant && typeof assistant.open === 'function') assistant.open();
  }).catch((err) => {
    console.error(err);
    if (typeof showToast === 'function') {
      showToast('تعذر تحميل مساعد الذكاء حالياً. الواجهة الأساسية تعمل بشكل طبيعي.', 'warning');
    }
  });
}

function ensureAIChatLauncherFromApp() {
  if (document.getElementById('ptxAIButton') || window.octagonAIAssistant) return;
  loadOctagonAIAssistantFromApp().catch((err) => {
    console.warn('AI assistant launcher preload failed:', err);
  });
}

window.loadOctagonAIAssistant = window.loadOctagonAIAssistant || loadOctagonAIAssistantFromApp;
window.toggleAIChat = window.toggleAIChat || toggleAIChatFromApp;
window.ensureAIChatLauncher = window.ensureAIChatLauncher || ensureAIChatLauncherFromApp;

function showOmniPrompt(message, defaultVal = '') {
  const html = `
    <label style="font-size:14px; color:var(--text-muted);">${message}</label>
    <input type="text" id="omniPromptInput" class="form-input" value="${defaultVal}" style="width:100%;">
  `;
  return showOmniModal(message, html, (bodyEl) => {
    return bodyEl.querySelector('#omniPromptInput').value.trim();
  });
}

function showOmniConfirm(title, message, confirmText = 'تأكيد', cancelText = 'إلغاء') {
  return new Promise((resolve) => {
    showOmniModal(title, `<p>${escapeHtml(message)}</p>`, () => true).then(result => {
      const confirmBtn = document.getElementById('omniModalConfirm');
      const cancelBtn = document.getElementById('omniModalCancel');
      if (confirmBtn) confirmBtn.textContent = 'تأكيد';
      if (cancelBtn) cancelBtn.textContent = 'إلغاء';
      resolve(!!result);
    });
    setTimeout(() => {
      const confirmBtn = document.getElementById('omniModalConfirm');
      const cancelBtn = document.getElementById('omniModalCancel');
      if (confirmBtn) confirmBtn.textContent = confirmText;
      if (cancelBtn) cancelBtn.textContent = cancelText;
    }, 0);
  });
}

// ─── Helpers (Missing Functions) ───
function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function isFriday(year, month, day) {
  return new Date(year, month - 1, day).getDay() === 5;
}

function getDayOfWeek(year, month, day) {
  return new Date(year, month - 1, day).getDay();
}


const STATUSES = [
  { value: 'normal', label: 'دوام عادي', color: '#34d399', bg: 'rgba(52,211,153,0.15)' },
  { value: 'leave', label: 'إجازة', color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  { value: 'absent', label: 'غياب', color: '#f87171', bg: 'rgba(248,113,113,0.15)' },
  { value: 'friday', label: 'عطلة مدفوعة', color: '#a78bfa', bg: 'rgba(167,139,250,0.15)' },
  { value: 'friday_work', label: 'حافز عمل جمعة', color: '#f472b6', bg: 'rgba(244,114,182,0.15)' },
  { value: 'late_excused', label: 'متأخر معذور', color: '#fb923c', bg: 'rgba(251,146,60,0.15)' },
  { value: 'night_shift', label: 'شفت ليلي', color: '#22d3ee', bg: 'rgba(34,211,238,0.15)' },
  { value: 'early_excused', label: 'مغادر مبكر معذور', color: '#ec4899', bg: 'rgba(236,72,153,0.15)' },
  { value: 'hourly_excused', label: 'معفى بالساعات', color: '#a3e635', bg: 'rgba(163,230,53,0.15)' },
  { value: 'external_mission', label: 'مهمة خارجية', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)' },
];

// ─── System Payroll Settings (user-controllable) ───
// All payroll "magic numbers" live here so they can be tuned from the System Settings page.
// Per-employee shift is `emp.shift` ('morning'|'evening' or any custom key defined below).
const DEFAULT_PAYROLL_SETTINGS = {
  standardDayHours: 9,        // fallback full-day length (dailyRate divisor when no shift)
  graceMinutesPerMonth: 100,  // monthly lateness grace (fully forgiven)
  otMultiplier: 1.5,          // regular overtime (after shift end)
  fridayOtMultiplier: 2,      // friday-work hours
  penaltyMultiplier: 1,       // late / early-leave penalty (accumulative ×1)
  fridayLossEveryDays: 6,     // every N absent/leave days → lose one Friday
  maxEarlyArrivalMin: 0,      // cap on credited early-arrival minutes (0 = no cap)
  shifts: {
    morning: { label: 'صباحي', startMin: 9 * 60,  endMin: 18 * 60 }, // 09:00–18:00 (9h)
    evening: { label: 'مسائي', startMin: 15 * 60, endMin: 23 * 60 }  // 15:00–23:00 (8h)
  }
};

function getPayrollSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem('octagon_payroll_settings') || '{}');
    const s = Object.assign({}, DEFAULT_PAYROLL_SETTINGS, raw);
    s.shifts = Object.assign({}, DEFAULT_PAYROLL_SETTINGS.shifts, raw.shifts || {});
    return s;
  } catch (e) { return JSON.parse(JSON.stringify(DEFAULT_PAYROLL_SETTINGS)); }
}

function savePayrollSettings(s) {
  try { localStorage.setItem('octagon_payroll_settings', JSON.stringify(s)); } catch (e) {}
}

// Resolve an employee's shift window (per-employee override → settings shift → morning default).
// Returns { key, label, startMin, endMin, durationMin, hours }. Handles cross-midnight shifts.
function getEmployeeShift(emp) {
  const PS = getPayrollSettings();
  const key = (emp && emp.shift && PS.shifts[emp.shift]) ? emp.shift : 'morning';
  const def = PS.shifts[key] || PS.shifts.morning || DEFAULT_PAYROLL_SETTINGS.shifts.morning;
  const startMin = (emp && emp.shiftStartMin != null) ? emp.shiftStartMin : def.startMin;
  const endMin = (emp && emp.shiftEndMin != null) ? emp.shiftEndMin : def.endMin;
  let durationMin = endMin - startMin;
  if (durationMin <= 0) durationMin += 24 * 60; // cross-midnight (e.g., 18:00 → 03:00)
  return { key, label: def.label, startMin, endMin, durationMin, hours: durationMin / 60 };
}

function normalizeStatus(raw) {
  const s = String(raw || '').toLowerCase().trim();
  if (s === 'حضور' || s === 'present') return 'normal';
  if (s === 'permission' || s === 'سماح' || s === 'سماحية' || s === 'holiday') return 'late_excused';
  if (s === 'اجازة' || s === 'إجازة') return 'leave';
  if (s === 'غياب') return 'absent';
  if (s === 'متأخر معاذر' || s === 'متأخر معذور') return 'late_excused';
  if (s === 'مغادر مبكر معذور' || s === 'early_excused' || s === 'early excused') return 'early_excused';
  if (s === 'تعويض' || s === 'makeup' || s === 'compensation') return 'early_excused';
  if (s === 'معفى بالساعات' || s === 'محتسب بالساعات' || s === 'hourly_excused' || s === 'hourly excused') return 'hourly_excused';
  if (s === 'مهمة خارجية' || s === 'مهمه خارجية' || s === 'external_mission' || s === 'external mission' || s === 'mission') return 'external_mission';
  return s;
}

/** Statuses that count as a paid work day for base/allowance tallies */
function isWorkStatus(st) {
  const s = normalizeStatus(st);
  return ['normal', 'night_shift', 'friday_work', 'late_excused', 'early_excused', 'external_mission'].includes(s);
}

function recordBelongsToMonth(r, year, month) {
  if (r.year != null && r.month != null) {
    return r.year === year && r.month === month;
  }
  if (r.date && typeof r.date === 'string') {
    const p = r.date.trim().split('/');
    if (p.length === 3) {
      const m = parseInt(p[1], 10);
      const y = parseInt(p[2], 10);
      if (!isNaN(y) && !isNaN(m)) return y === year && m === month;
    }
  }
  return false;
}

function recordsForMonth(emp, year, month) {
  if (!emp || !emp.records) return [];
  return emp.records.filter(r => recordBelongsToMonth(r, year, month));
}

function getRecordPeriod(rec, fallback = getConfig()) {
  if (rec?.year != null && rec?.month != null) {
    return { year: Number(rec.year), month: Number(rec.month), day: Number(rec.day) || 0 };
  }
  if (rec?.date && typeof rec.date === 'string') {
    const parts = rec.date.trim().split('/');
    if (parts.length === 3) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      if (Number.isFinite(year) && Number.isFinite(month)) {
        return { year, month, day: Number.isFinite(day) ? day : Number(rec.day) || 0 };
      }
    }
  }
  return { year: Number(fallback.year), month: Number(fallback.month), day: Number(rec?.day) || 0 };
}

function getTimesheetMonthStorageKey(year = getConfig().year) {
  return `octagon-timesheet-months-${Number(year) || new Date().getFullYear()}`;
}

function getTimesheetSelectedMonths(year = getConfig().year) {
  let months = [];
  try {
    months = JSON.parse(localStorage.getItem(getTimesheetMonthStorageKey(year)) || '[]');
  } catch (_) {
    months = [];
  }
  months = (Array.isArray(months) ? months : [])
    .map(Number)
    .filter(m => Number.isInteger(m) && m >= 1 && m <= 12);
  if (!months.length) months = [Number(getConfig().month) || new Date().getMonth() + 1];
  return Array.from(new Set(months)).sort((a, b) => a - b);
}

function setTimesheetSelectedMonths(months, primaryMonth = null) {
  const cfg = getConfig();
  const clean = Array.from(new Set((months || [])
    .map(Number)
    .filter(m => Number.isInteger(m) && m >= 1 && m <= 12))).sort((a, b) => a - b);
  const nextMonths = clean.length ? clean : [Number(cfg.month) || new Date().getMonth() + 1];
  localStorage.setItem(getTimesheetMonthStorageKey(cfg.year), JSON.stringify(nextMonths));
  if (primaryMonth && nextMonths.includes(Number(primaryMonth))) setConfigValue('cfgMonth', Number(primaryMonth));
  else if (!nextMonths.includes(Number(cfg.month))) setConfigValue('cfgMonth', nextMonths[0]);
  saveConfigToStorage();
}

function toggleTimesheetMonth(month) {
  const cfg = getConfig();
  const selected = getTimesheetSelectedMonths(cfg.year);
  const m = Number(month);
  const next = selected.includes(m)
    ? selected.filter(item => item !== m)
    : selected.concat(m);
  setTimesheetSelectedMonths(next.length ? next : [m], m);
  ensureSelectedEmployeeForTimesheetRange(getConfig());
  renderTimesheet();
}
window.toggleTimesheetMonth = toggleTimesheetMonth;

function getTimesheetPeriodLabel(cfg = getConfig()) {
  const months = getTimesheetSelectedMonths(cfg.year);
  return months.map(m => `${MONTHS_AR[m - 1] || m} ${cfg.year}`).join(' + ');
}

function recordBelongsToTimesheetRange(rec, cfg = getConfig()) {
  const p = getRecordPeriod(rec, cfg);
  return p.year === Number(cfg.year) && getTimesheetSelectedMonths(cfg.year).includes(p.month);
}

function recordsForTimesheetRange(emp, cfg = getConfig()) {
  if (!emp || !Array.isArray(emp.records)) return [];
  return emp.records
    .filter(rec => recordBelongsToTimesheetRange(rec, cfg))
    .slice()
    .sort((a, b) => {
      const ap = getRecordPeriod(a, cfg);
      const bp = getRecordPeriod(b, cfg);
      return (ap.year - bp.year) || (ap.month - bp.month) || (ap.day - bp.day);
    });
}

function employeeHasRecordsForMonth(emp, year, month) {
  return recordsForMonth(emp, year, month).length > 0;
}

function employeeIndexesForMonth(year, month) {
  return employees
    .map((emp, idx) => ({ emp, idx }))
    .filter(item => employeeHasRecordsForMonth(item.emp, year, month))
    .map(item => item.idx);
}

function employeeIndexesForTimesheetRange(cfg = getConfig()) {
  return employees
    .map((emp, idx) => ({ emp, idx }))
    .filter(item => recordsForTimesheetRange(item.emp, cfg).length > 0)
    .map(item => item.idx);
}

function ensureSelectedEmployeeForMonth(year, month) {
  const visibleIndexes = employeeIndexesForMonth(year, month);
  if (visibleIndexes.length === 0) return false;
  if (!visibleIndexes.includes(selectedEmpIdx)) selectedEmpIdx = visibleIndexes[0];
  return true;
}

function ensureSelectedEmployeeForTimesheetRange(cfg = getConfig()) {
  const visibleIndexes = employeeIndexesForTimesheetRange(cfg);
  if (visibleIndexes.length === 0) return false;
  if (!visibleIndexes.includes(selectedEmpIdx)) selectedEmpIdx = visibleIndexes[0];
  return true;
}

function markAiFields(rec, fields) {
  if (!rec || !Array.isArray(fields) || fields.length === 0) return;
  rec.aiModified = true;
  rec.aiModifiedFields = rec.aiModifiedFields || {};
  fields.forEach(field => {
    rec.aiModifiedFields[field] = true;
  });
}

function isAiModifiedField(rec, field) {
  return !!(rec && (rec.aiModifiedFields?.[field] || (rec.aiModified && field === 'status')));
}

function aiFieldIcon(rec, field) {
  if (!isAiModifiedField(rec, field)) return '';
  return `<span class="ai-field-marker" title="تم تعديل هذا الحقل بالذكاء الاصطناعي"><i class="fa-solid fa-wand-magic-sparkles"></i></span>`;
}

function aiInputClass(rec, field) {
  return isAiModifiedField(rec, field) ? ' ai-modified-field' : '';
}

function setRecordFieldFromAI(rec, field, value) {
  if (!rec || value === undefined) return false;
  const oldValue = rec[field];
  let nextValue = value;
  if (['bonus', 'damage', 'penalty', 'advance'].includes(field)) nextValue = Number(value) || 0;
  if (field === 'status') {
    nextValue = normalizeStatus(nextValue);
    const validStatuses = ['normal','absent','leave','friday','friday_work','late_excused','night_shift','early_excused','hourly_excused','external_mission'];
    if (!validStatuses.includes(nextValue)) nextValue = oldValue || 'normal';
  }
  if (oldValue === nextValue) return false;
  rec[field] = nextValue;
  return true;
}

function applySystemPayrollRules(emp, year, month, markAsAi = false) {
  if (!emp || !Array.isArray(emp.records)) return { changed: 0, notes: [] };
  const monthRecords = recordsForMonth(emp, year, month).sort((a, b) => a.day - b.day);
  let changed = 0;
  const notes = [];

  monthRecords.forEach(rec => {
    rec.fridayAsRegularWork = false;
  });

  monthRecords.forEach(rec => {
    if (normalizeStatus(rec.status) !== 'night_shift') return;
    const next = monthRecords.find(r => r.day === rec.day + 1);
    if (!next || isFriday(year, month, next.day)) return;
    const nextStatus = normalizeStatus(next.status);
    if (next.checkInMin != null && nextStatus !== 'hourly_excused') {
      next.status = 'hourly_excused';
      if (markAsAi) markAiFields(next, ['status']);
      changed++;
      notes.push(`تم تحويل ${next.date || next.day} إلى "معفى بالساعات" (يُحسب على الساعات بلا إضافي ولا غرامات) بسبب الدوام الليلي في اليوم السابق.`);
    }
  });

  monthRecords.forEach(rec => {
    if (!isFriday(year, month, rec.day)) return;
    const statusType = normalizeStatus(rec.status);
    if (!['friday_work', 'normal'].includes(statusType)) return;
    const weekStart = Math.max(1, rec.day - 6);
    const hasMissedDay = monthRecords.some(r => {
      if (r.day < weekStart || r.day >= rec.day) return false;
      const s = normalizeStatus(r.status);
      return s === 'absent' || s === 'leave';
    });
    if (!hasMissedDay) return;
    if (rec.status !== 'normal') {
      rec.status = 'normal';
      if (markAsAi) markAiFields(rec, ['status']);
      changed++;
    }
    rec.fridayAsRegularWork = true;
    notes.push(`تم احتساب جمعة ${rec.date || rec.day} كدوام اعتيادي بسبب وجود غياب/إجازة في نفس الأسبوع.`);
  });

  return { changed, notes };
}

function getFridaysInMonth(y, m) {
  const totalDays = getDaysInMonth(y, m);
  const fridays = [];
  for (let d = 1; d <= totalDays; d++) {
    if (isFriday(y, m, d)) fridays.push(d);
  }
  return fridays;
}

function formatNum(n) {
  if (n == null || isNaN(n)) return '0';
  return Math.round(n).toLocaleString('en-US');
}

function asMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Date-input ISO hint (YYYY-MM-DD) ───
// Native <input type="date"> always STORES a "YYYY-MM-DD" value (HTML spec
// guarantee — every normalizeXDateInput()/getRecordPeriod() style parser in
// this file relies on that), but the widget DISPLAYS it per the browser/OS
// locale — on this box that renders day-before-month, which reads like the
// year-day-month mixups reported in the field. There is no cross-browser way
// to force the native picker's own text to a fixed order (Chrome ignores the
// page's lang="ar" for this), so instead every date input gets a small
// always-visible "YYYY-MM-DD" hint underneath that mirrors its real value —
// unambiguous regardless of how the picker itself renders.
// Mutation-observer scan is scoped to only the nodes that were actually
// added (never a full-DOM re-scan on every tick) — see [[reference_language_fix_perf]]
// for why a naive whole-DOM observer previously made the app "super slow".
function ensureDateIsoHint(input) {
  if (!input || input.tagName !== 'INPUT' || input.type !== 'date' || input.dataset.isoHintAttached) return;
  input.dataset.isoHintAttached = '1';
  const hint = document.createElement('small');
  hint.className = 'date-iso-hint';
  hint.textContent = input.value || 'YYYY-MM-DD';
  input.insertAdjacentElement('afterend', hint);
  const update = () => { hint.textContent = input.value || 'YYYY-MM-DD'; };
  input.addEventListener('input', update);
  input.addEventListener('change', update);
}

function scanForDateIsoHints(root) {
  if (!root) return;
  if (root.nodeType !== 1) return;
  if (root.matches && root.matches('input[type="date"]')) ensureDateIsoHint(root);
  if (root.querySelectorAll) root.querySelectorAll('input[type="date"]').forEach(ensureDateIsoHint);
}

(function initDateIsoHintObserver() {
  if (typeof document === 'undefined') return;
  scanForDateIsoHints(document.body);
  document.addEventListener('DOMContentLoaded', () => scanForDateIsoHints(document.body));
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => m.addedNodes.forEach(node => scanForDateIsoHints(node)));
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();

function makeId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function translatePriority(p) {
  return ({Urgent:'عاجل',High:'عالي',Normal:'عادي',Low:'منخفض'})[p] || p;
}
function translateQcType(t) {
  return ({dimensional:'أبعاد',visual:'بصري',functional:'وظيفي',finish:'تشطيب',paint:'دهان',assembly:'تجميع',welding:'لحام',electrical:'كهربائي',packaging:'تغليف',material:'مواد',weight:'وزن',surface:'سطح'})[String(t||'').toLowerCase()] || t;
}
function translateQcResult(r) {
  return ({pass:'ناجح',fail:'فاشل',rework:'إعادة عمل',pending:'قيد الانتظار',na:'لا ينطبق'})[String(r||'').toLowerCase()] || r;
}
function translateMachineStatus(s) {
  return ({operational:'تعمل',idle:'خامل',maintenance:'صيانة',offline:'غير متصل'})[String(s||'').toLowerCase()] || s;
}
function translateHrCardType(t) {
  return ({payroll_anomaly:'شذوذ رواتب',timesheet_consistency:'اتساق الدوام',employee_request:'طلب موظف',overtime:'وقت إضافي',advance:'سلفة'})[String(t||'').toLowerCase()] || t;
}
// T0.4 dedup (2026-07-12): dead copy, shadowed by the later definition at
// line ~14808 (equivalent behavior — same 5-char HTML-entity escaping,
// verified identical output). Kept per add-only rule, never called.
function escapeHtml_deprecated_dup1(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsString(value) {
  return String(value ?? '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');
}

function defaultFinanceState() {
  return {
    cashOpening: 0,
    accounts: [
      { id: 'cash_workshop',         code: '1001', name: 'قاصة الورشة',               type: 'asset',     normal_side: 'debit'  },
      { id: 'bank_account',          code: '1002', name: 'حساب بنكي / تحويلات',       type: 'asset',     normal_side: 'debit'  },
      { id: 'employee_cash_custody', code: '1003', name: 'عهد نقدية عند موظفين',      type: 'asset',     normal_side: 'debit'  },
      { id: 'receivables_customers', code: '1101', name: 'ذمم العملاء',               type: 'asset',     normal_side: 'debit'  },
      { id: 'employee_advances',     code: '1102', name: 'سلف الموظفين',              type: 'asset',     normal_side: 'debit'  },
      { id: 'employee_meal_clearing', code: '1109', name: 'وسيط توزيع طعام الموظفين', type: 'asset',     normal_side: 'debit'  },
      { id: 'inventory_stock',       code: '1200', name: 'مخزون مواد',                type: 'asset',     normal_side: 'debit'  },
      { id: 'fixed_assets_tools_machines', code: '1300', name: 'عدد ومعدات ومكائن',   type: 'asset',     normal_side: 'debit'  },
      { id: 'accumulated_depreciation', code: '1390', name: 'مجمع إهلاك',             type: 'asset',     normal_side: 'credit' },
      { id: 'payables_suppliers',    code: '2001', name: 'ذمم الموردين',              type: 'liability', normal_side: 'credit' },
      { id: 'customer_deposits',     code: '2002', name: 'دفعات مقدمة من العملاء',    type: 'liability', normal_side: 'credit' },
      { id: 'accrued_payroll',       code: '2100', name: 'رواتب مستحقة',              type: 'liability', normal_side: 'credit' },
      { id: 'payables_people',       code: '2101', name: 'ذمم الأشخاص/الموظفين',     type: 'liability', normal_side: 'credit' },
      { id: 'owner_loans_funding',   code: '2300', name: 'تمويل/قروض من المالك',      type: 'liability', normal_side: 'credit' },
      { id: 'owner_capital',         code: '3000', name: 'رأس مال المالك',             type: 'equity',    normal_side: 'credit' },
      { id: 'owner_drawings',        code: '3100', name: 'مسحوبات المالك',             type: 'equity',    normal_side: 'debit'  },
      { id: 'retained_earnings',     code: '3200', name: 'أرباح/خسائر مرحلة',         type: 'equity',    normal_side: 'credit' },
      { id: 'opening_balances',      code: '3900', name: 'أرصدة افتتاحية',             type: 'equity',    normal_side: 'credit' },
      { id: 'income_sales',          code: '4001', name: 'واردات مبيعات/خدمات',      type: 'income',    normal_side: 'credit' },
      { id: 'income_projects',       code: '4002', name: 'إيرادات مشاريع',             type: 'income',    normal_side: 'credit' },
      { id: 'other_income',          code: '4900', name: 'إيرادات أخرى',               type: 'income',    normal_side: 'credit' },
      { id: 'cogs_materials',        code: '5000', name: 'تكلفة المواد المباعة',      type: 'expense',   normal_side: 'debit'  },
      { id: 'expense_payroll',       code: '5101', name: 'رواتب وأجور',               type: 'expense',   normal_side: 'debit'  },
      { id: 'expense_employee_benefits', code: '5102', name: 'منافع وطعام الموظفين',  type: 'expense',   normal_side: 'debit'  },
      { id: 'expense_materials',     code: '5201', name: 'مواد تشغيل',               type: 'expense',   normal_side: 'debit'  },
      { id: 'expense_tools',         code: '5202', name: 'عدد وصيانة',               type: 'expense',   normal_side: 'debit'  },
      { id: 'rent_expense',          code: '5301', name: 'إيجار',                     type: 'expense',   normal_side: 'debit'  },
      { id: 'utilities_expense',     code: '5302', name: 'كهرباء وماء',               type: 'expense',   normal_side: 'debit'  },
      { id: 'transport_fuel_expense', code: '5303', name: 'نقل ووقود',                type: 'expense',   normal_side: 'debit'  },
      { id: 'marketing_ads_expense', code: '5401', name: 'تسويق وإعلانات',            type: 'expense',   normal_side: 'debit'  },
      { id: 'expense_general',       code: '5299', name: 'مصروفات عامة',             type: 'expense',   normal_side: 'debit'  },
      { id: 'adjustments_differences', code: '5900', name: 'فروقات وتسويات',          type: 'expense',   normal_side: 'debit'  },
      { id: 'vat_payable',           code: '2200', name: 'ضريبة القيمة المضافة المستحقة (VAT)', type: 'liability', normal_side: 'credit' },
      { id: 'suspense',              code: '9999', name: 'حساب الاستيداع',           type: 'asset',     normal_side: 'debit'  },
    ],
    categories: {
      expense: [
        { id: 'cat_payroll', name: 'رواتب', accountId: 'expense_payroll' },
        { id: 'cat_employee_advance', name: 'سلف موظفين', accountId: 'employee_advances' },
        { id: 'cat_employee_benefits', name: 'طعام ومنافع', accountId: 'expense_employee_benefits' },
        { id: 'cat_materials', name: 'مواد', accountId: 'expense_materials' },
        { id: 'cat_tools', name: 'صيانة وعدد', accountId: 'expense_tools' },
        { id: 'cat_transport', name: 'نقل وتجهيز', accountId: 'expense_general' },
        { id: 'cat_rent', name: 'إيجار', accountId: 'rent_expense' },
        { id: 'cat_utilities', name: 'خدمات (كهرباء/ماء/إنترنت)', accountId: 'utilities_expense' },
        { id: 'cat_fuel', name: 'وقود ومحروقات', accountId: 'transport_fuel_expense' },
        { id: 'cat_general', name: 'مصروف عام', accountId: 'expense_general' }
      ],
      income: [
        { id: 'cat_sales', name: 'وارد مبيعات', accountId: 'income_sales' },
        { id: 'cat_service', name: 'خدمة/تصنيع', accountId: 'income_sales' },
        { id: 'cat_customer_payment', name: 'تسديد عميل', accountId: 'receivables_customers' }
      ]
    },
    departments: [
      { id: 'dept_workshop', name: 'الورشة' },
      { id: 'dept_projects', name: 'المشاريع' },
      { id: 'dept_sales', name: 'المبيعات' },
      { id: 'dept_admin', name: 'الإدارة' },
      { id: 'dept_payroll', name: 'الرواتب' }
    ],
    parties: [],
    customers: [],
    transactions: [],
    receipts: []
  };
}

function ensureFinance() {
  const defaults = defaultFinanceState();
  if (!finance || typeof finance !== 'object') finance = {};
  finance.cashOpening = asMoney(finance.cashOpening ?? defaults.cashOpening);
  if (!Array.isArray(finance.accounts) || !finance.accounts.length) {
    finance.accounts = defaults.accounts;
  } else {
    defaults.accounts.forEach(def => {
      const existing = finance.accounts.find(a => a.id === def.id || (def.code && a.code === def.code));
      if (!existing) {
        finance.accounts.push(def);
      } else if (!existing.normal_side) {
        existing.normal_side = def.normal_side;
      }
    });
  }
  finance.accounts.forEach(account => {
    if (!account.key) account.key = account.id;
    if (!account.nameAr) account.nameAr = account.name;
    if (!account.normalSide) account.normalSide = account.normal_side || 'debit';
    if (account.active === undefined) account.active = true;
  });
  finance.categories = finance.categories || {};
  finance.categories.expense = Array.isArray(finance.categories.expense) ? finance.categories.expense : [];
  finance.categories.income = Array.isArray(finance.categories.income) ? finance.categories.income : [];
  ['expense', 'income'].forEach(type => {
    defaults.categories[type].forEach(def => {
      const existing = finance.categories[type].find(c => c.id === def.id);
      if (!existing) finance.categories[type].push(def);
      else if (!existing.accountId) existing.accountId = def.accountId;
    });
  });
  finance.departments = Array.isArray(finance.departments) && finance.departments.length ? finance.departments : defaults.departments;
  finance.parties = Array.isArray(finance.parties) ? finance.parties : [];
  finance.customers = Array.isArray(finance.customers) ? finance.customers : [];
  finance.transactions = Array.isArray(finance.transactions) ? finance.transactions : [];
  finance.receipts = Array.isArray(finance.receipts) ? finance.receipts : [];
  normalizeFinanceCustomerFields();
  // V5: seed top-level journals once (async, fire-and-forget)
  if (window.PentagonDB) {
    PentagonDB.load().then(db => {
      if (!Array.isArray(db.journals) || db.journals.length === 0) {
        const now = new Date().toISOString();
        const base = { created_at: now, created_by: 'system', updated_at: now, updated_by: 'system', is_active: true };
        return PentagonDB.mutate(mdb => {
          mdb.journals = [
            { id: 'j_gen',     code: 'GEN',  name: 'يومية عامة',       type: 'general',  default_account_id: '',                     sequence_prefix: 'JE',  ...base },
            { id: 'j_sale',    code: 'SALE', name: 'يومية المبيعات',   type: 'sale',     default_account_id: 'receivables_customers', sequence_prefix: 'SJ',  ...base },
            { id: 'j_purc',    code: 'PURC', name: 'يومية المشتريات',  type: 'purchase', default_account_id: 'payables_people',        sequence_prefix: 'PJ',  ...base },
            { id: 'j_bank',    code: 'BANK', name: 'صندوق / بنك',      type: 'cash',     default_account_id: 'cash_workshop',          sequence_prefix: 'BJ',  ...base },
            { id: 'j_payroll', code: 'PAY',  name: 'يومية الرواتب',    type: 'general',  default_account_id: 'accrued_payroll',        sequence_prefix: 'PAY', ...base },
          ];
        });
      }
    }).catch(e => console.warn('Journal seeding failed:', e));
  }
  return finance;
}

function normalizeFinanceCustomerFields() {
  if (!finance || !Array.isArray(finance.customers)) return;
  finance.customers.forEach(customer => {
    if (!customer.id) customer.id = makeId('cust');
    if (customer.companyName === undefined) customer.companyName = '';
    if (customer.shopName === undefined) customer.shopName = '';
    if (customer.notes === undefined) customer.notes = '';
    if (customer.balanceDirection === undefined) customer.balanceDirection = '';
  });
}

function getFinanceTransactions() {
  ensureFinance();
  return finance.transactions.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}


function getPersonBalance(name) {
  ensureFinance();
  if (!name) return 0;
  return finance.transactions.reduce((sum, tx) => {
    if (tx.paidByName === name && tx.sourceType === 'person_pocket') return sum + asMoney(tx.amount);
    if (tx.partyName === name && tx.type === 'person_reimbursement') return sum - asMoney(tx.amount);
    return sum;
  }, 0);
}

function getCustomerBalance(customer) {
  ensureFinance();
  if (!customer) return 0;
  return finance.transactions.reduce((sum, tx) => {
    if (tx.customerId !== customer.id) return sum;
    if (tx.type === 'customer_charge') return sum + asMoney(tx.amount);
    if (tx.type === 'income') return sum - asMoney(tx.amount);
    return sum;
  }, asMoney(customer.openingBalance));
}

function getCustomerBalanceDirection(customer) {
  const balance = getCustomerBalance(customer);
  if (balance > 0) return { key: 'owes_us', label: 'عليه', className: 'customer-balance-owes' };
  if (balance < 0) return { key: 'credit', label: 'له', className: 'customer-balance-credit' };
  return { key: 'balanced', label: 'متوازن', className: 'customer-balance-balanced' };
}

function getCategoryName(kind, categoryId) {
  ensureFinance();
  const list = finance.categories[kind] || [];
  return list.find(c => c.id === categoryId)?.name || categoryId || '-';
}

function getDepartmentName(departmentId) {
  ensureFinance();
  return finance.departments.find(d => d.id === departmentId)?.name || departmentId || '-';
}

function addFinanceTransaction(tx, options = {}) {
  ensureFinance();
  if (tx.sourceId && finance.transactions.some(existing => existing.sourceType === (tx.sourceType || 'cashbox') && existing.sourceId === tx.sourceId && existing.type === (tx.type || 'expense'))) {
    return null;
  }
  const entry = {
    id: tx.id || makeId('tx'),
    date: tx.date || todayISO(),
    createdAt: tx.createdAt || new Date().toISOString(),
    type: tx.type || 'expense',
    direction: tx.direction || (tx.type === 'income' ? 'in' : tx.type === 'customer_charge' ? 'neutral' : 'out'),
    sourceType: tx.sourceType || 'cashbox',
    amount: asMoney(tx.amount),
    categoryId: tx.categoryId || '',
    departmentId: tx.departmentId || 'dept_workshop',
    accountId: tx.accountId || '',
    description: tx.description || '',
    partyName: tx.partyName || '',
    paidByName: tx.paidByName || '',
    customerId: tx.customerId || '',
    receiptNo: tx.receiptNo || '',
    sourceId: tx.sourceId || '',
    paymentMethod: tx.paymentMethod || (tx.sourceType === 'cashbox' ? 'cash' : ''),
    companyId: tx.companyId || (typeof window.getActiveOrgProfile === 'function' ? window.getActiveOrgProfile()?.companyId : '') || ''
  };
  if (entry.amount <= 0) return null;
  finance.transactions.push(entry);
  if (!options.skipSave) saveData();
  if (typeof syncLegacyTransactionToV6 === 'function') {
    syncLegacyTransactionToV6(entry).then(() => {
      saveData(true);
    });
  }
  return entry;
}

function getStatusInfo(v) {
  const n = normalizeStatus(v);
  return STATUSES.find(s => s.value === n) || STATUSES[0];
}

function parseTime(str) {
  if (!str || str === '---' || str === 'NaN') return null;
  const s = String(str).trim().toLowerCase();
  const m24 = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m24) {
    let h = parseInt(m24[1], 10);
    const min = parseInt(m24[2], 10);
    if (h >= 24 || min > 59) return null;
    return h * 60 + min;
  }
  const m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)$/);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const period = m[3];
  if (period === 'am' && h === 12) h = 0;
  if (period === 'pm' && h !== 12) h += 12;
  return h * 60 + min;
}

// ─── UNIFIED SALARY CALCULATION ENGINE (SINGLE SOURCE OF TRUTH) ───
function calculateSalaryDetailed(config, inputs) {
  const { nominalSalary, cfgTransport = 50000, cfgFood = 50000, year, month } = config;
  const totalDays = getDaysInMonth(year, month);
  const fridays = getFridaysInMonth(year, month);
  const fridayCount = fridays.length;
  const workingDays = totalDays - fridayCount;

  const PS = getPayrollSettings();
  const dailyRate = nominalSalary / totalDays;
  // Shift-aware (config.shiftHours when a shift is known; otherwise the standard day length).
  const hourlyRate = dailyRate / (config.shiftHours || PS.standardDayHours || 9);

  // Split allowances Calculation
  const transportRate = workingDays > 0 ? cfgTransport / workingDays : 0;
  const foodRate = workingDays > 0 ? cfgFood / workingDays : 0;
  const totalAllowanceRate = transportRate + foodRate;

  const {
    attendanceDays = 0,
    leaveDays = 0,
    absentDays = 0,
    overtimeHours = 0,
    fridayOTHours = 0,
    fridayWorkedDays = 0,
    latenessHours = 0,
    earlyHours = 0,
    eligibleFridays = 0,
    currentAdvance = 0,
    previousAdvance = 0,
    penalty = 0,
    bonus = 0,
    damage = 0,
    status = 'active'
  } = inputs;

  const totalAdvance = (currentAdvance || 0) + (previousAdvance || 0);

  // Base salary and allowances are based on attendance!
  const baseSalary = attendanceDays * dailyRate;
  const transportTotal = attendanceDays * transportRate;
  const foodTotal = attendanceDays * foodRate;
  const allowances = transportTotal + foodTotal;

  // Overtime (multipliers from settings)
  const overtimeValue = overtimeHours * hourlyRate * PS.otMultiplier;
  const fridayOTValue = fridayOTHours * hourlyRate * PS.fridayOtMultiplier;
  const totalOvertimeValue = overtimeValue + fridayOTValue;

  // Manual path uses a FULL-day base, so a late/early hour costs (1 unearned + penaltyMultiplier).
  // With the default penaltyMultiplier=1 this is the classic ×2, and it reconciles to the
  // accumulative timesheet engine's net.
  const fullDayPenaltyMult = 1 + PS.penaltyMultiplier;
  const latenessDeduction = latenessHours * hourlyRate * fullDayPenaltyMult;
  const earlyDeduction = earlyHours * hourlyRate * fullDayPenaltyMult;

  // Leave: no monetary deduction (only loss of Friday bonus, applied via eligibleFridays).
  // Absent: deduct 1× dailyRate.
  const leaveDeduction = 0;
  const absencePenalty = absentDays * dailyRate;

  // Friday-off paid days (yomiya only, no allowance) and Friday work days (yomiya + 2×hours).
  const fridayCompensation = (eligibleFridays + fridayWorkedDays) * dailyRate;

  // Auto Friday Penalty no longer applied separately — already reflected in eligibleFridays.
  const autoFridayPenalty = 0;

  const automaticPenalties = latenessDeduction + earlyDeduction + absencePenalty;

  // Total Deductions includes previous debt and current advances
  const totalDeductions = latenessDeduction + earlyDeduction + absencePenalty + currentAdvance + previousAdvance + penalty + damage;
  const totalEarnings = baseSalary + allowances + totalOvertimeValue + fridayCompensation + bonus;
  const finalSalary = totalEarnings - totalDeductions;

  // Salary Due (without previous debt)
  const salaryDueDeductions = latenessDeduction + earlyDeduction + absencePenalty + penalty + damage;
  const salaryDue = totalEarnings - salaryDueDeductions;

  return {
    totalDays, fridayCount, workingDays,
    dailyRate, hourlyRate, allowanceRate: totalAllowanceRate,
    transportRate, foodRate,
    attendanceDays, leaveDays, absentDays,
    baseSalary, allowances, transportTotal, foodTotal,
    overtimeValue, fridayOTValue, totalOvertimeValue,
    latenessDeduction, leaveDeduction, absenceDeduction: absencePenalty,
    fridayCompensation,
    totalDeductions, totalEarnings, finalSalary,
    currentAdvance, previousAdvance, totalAdvance, penalty, bonus, damage,
    salaryDue, salaryDueDeductions, automaticPenalties,
    eligibleFridays,
    autoFridayPenalty,
    missedFridayCount: Math.floor((absentDays + leaveDays) / (PS.fridayLossEveryDays || 6)),
    totalOvertime: overtimeHours + fridayOTHours,
    regularOvertimeHours: overtimeHours,
    fridayWorkOT: fridayOTHours,
    totalLatenessHours: latenessHours,
    totalLatenessDeduction: latenessDeduction,
    totalBonus: bonus,
    totalPenalty: penalty,
    totalDamage: damage,
    nominalSalary
  };
}

function calculateSalary(config, inputs) {
  return calculateSalaryDetailed(config, inputs);
}

// ─── Calculator: Employee Records Engine ───
function getEmployeeNominalSalary(employee, fallback = 0) {
  if (!employee) return Number(fallback) || 0;
  return Number(employee.salary ?? employee.nominalSalary ?? employee.baseSalary ?? fallback) || 0;
}

function parseEmployeeLifecycleDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) return new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
  }
  return null;
}

function formatLifecycleDateInput(value) {
  const date = parseEmployeeLifecycleDate(value);
  if (!date) return '';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const EMPLOYEE_AUTO_RESIGN_AFTER_DAYS = 15;

function addDaysToDate(date, days) {
  if (!date) return null;
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + Number(days || 0));
  return next;
}

function dayDiff(start, end) {
  if (!start || !end) return 0;
  return Math.floor((end - start) / 86400000);
}

function normalizeEmploymentPeriod(raw = {}, source = 'manual') {
  const start = parseEmployeeLifecycleDate(raw.start || raw.startDate || raw.hireDate || raw.from || raw.date);
  const end = parseEmployeeLifecycleDate(raw.end || raw.endDate || raw.terminationDate || raw.to || raw.releaseDate);
  if (!start && !end) return null;
  return {
    start,
    end,
    source: raw.source || source,
    note: raw.note || raw.reason || '',
    id: raw.id || makeId('PER')
  };
}

function getStoredEmploymentPeriods(employee) {
  const stored = Array.isArray(employee?.employmentPeriods)
    ? employee.employmentPeriods.map(item => normalizeEmploymentPeriod(item, item.source || 'manual')).filter(Boolean)
    : [];
  const legacy = normalizeEmploymentPeriod({
    start: employee?.lastHireDate || employee?.lastStartDate || employee?.hireDate || employee?.startDate || employee?.joiningDate || employee?.joinedAt,
    end: employee?.lastTerminationDate || employee?.lastEndDate || employee?.terminationDate || employee?.endDate || employee?.separationDate || employee?.releasedAt,
    note: 'Legacy employee lifecycle fields'
  }, 'legacy');
  if (legacy) stored.push(legacy);
  return stored.sort((a, b) => (a.start || a.end || 0) - (b.start || b.end || 0));
}

function getEmployeeTimesheetLifecycle(employee) {
  const dates = (employee?.records || [])
    .filter(rec => isCalendarAttendanceRecord(rec))
    .map(rec => getRecordDateObject(rec))
    .filter(Boolean)
    .sort((a, b) => a - b);
  const firstAttendance = dates[0] || null;
  const lastAttendance = dates[dates.length - 1] || null;
  const periods = [];
  let current = null;
  dates.forEach(date => {
    if (!current) {
      current = { start: date, lastAttendance: date, source: 'timesheet' };
      return;
    }
    if (dayDiff(current.lastAttendance, date) > EMPLOYEE_AUTO_RESIGN_AFTER_DAYS) {
      const autoEnd = addDaysToDate(current.lastAttendance, EMPLOYEE_AUTO_RESIGN_AFTER_DAYS);
      periods.push({
        start: current.start,
        end: autoEnd,
        lastAttendance: current.lastAttendance,
        autoEnd,
        source: 'timesheet',
        note: `Auto break after ${EMPLOYEE_AUTO_RESIGN_AFTER_DAYS} days`
      });
      current = { start: date, lastAttendance: date, source: 'timesheet' };
      return;
    }
    current.lastAttendance = date;
  });
  if (current) {
    const autoEnd = addDaysToDate(current.lastAttendance, EMPLOYEE_AUTO_RESIGN_AFTER_DAYS);
    periods.push({
      start: current.start,
      end: null,
      lastAttendance: current.lastAttendance,
      autoEnd,
      source: 'timesheet',
      note: 'Timesheet inferred period'
    });
  }
  return {
    firstAttendance,
    lastAttendance,
    autoResignationDate: lastAttendance ? addDaysToDate(lastAttendance, EMPLOYEE_AUTO_RESIGN_AFTER_DAYS) : null,
    periods
  };
}

function getEmployeeLifecycle(employee) {
  const timesheetLifecycle = getEmployeeTimesheetLifecycle(employee);
  const periods = [
    ...getStoredEmploymentPeriods(employee),
    ...timesheetLifecycle.periods
  ].filter(item => item.start || item.end)
    .sort((a, b) => (a.start || a.end || 0) - (b.start || b.end || 0));
  const start = periods[0]?.start || timesheetLifecycle.firstAttendance || null;
  const openPeriod = [...periods].reverse().find(period => period.start && !period.end);
  const end = openPeriod ? null : ([...periods].reverse().find(period => period.end)?.end || null);
  return { start, end, periods, timesheetLifecycle };
}

// Human-readable "X سنة Y شهر Z يوم" span between two dates (end defaults to today).
function formatEmployeeDurationLabel(start, end) {
  if (!start) return '-';
  const endDate = end || new Date();
  let totalDays = Math.max(0, dayDiff(start, endDate));
  const years = Math.floor(totalDays / 365);
  totalDays -= years * 365;
  const months = Math.floor(totalDays / 30);
  totalDays -= months * 30;
  const days = totalDays;
  const parts = [];
  if (years) parts.push(`${years} سنة`);
  if (months) parts.push(`${months} شهر`);
  if (days || !parts.length) parts.push(`${days} يوم`);
  return parts.join(' و');
}

function isEmployeeFlagActive(employee) {
  if (!employee || !employee.name) return false;
  const status = String(employee.status || employee.employmentStatus || '').toLowerCase();
  if (employee.is_active === false || employee.active === false || status === 'inactive' || status === 'terminated' || status === 'resigned') return false;
  return true;
}

function getLastAttendanceDateOnOrBefore(employee, referenceDate, minDate = null) {
  if (!employee?.records?.length || !referenceDate) return null;
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const min = minDate ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate()) : null;
  const dates = employee.records
    .filter(rec => isCalendarAttendanceRecord(rec))
    .map(rec => getRecordDateObject(rec))
    .filter(date => date && date <= ref && (!min || date >= min))
    .sort((a, b) => b - a);
  return dates[0] || null;
}

function getEmployeePeriodForDate(employee, referenceDate) {
  if (!referenceDate) return null;
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const { periods } = getEmployeeLifecycle(employee);
  return [...periods]
    .filter(period => {
      const start = period.start || new Date(0);
      const end = period.end || new Date(8640000000000000);
      return start <= ref && ref <= end;
    })
    .sort((a, b) => (b.start || 0) - (a.start || 0))[0] || null;
}

function getEmployeeAutoResignationInfo(employee, referenceDate) {
  const ref = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const lifecycle = getEmployeeLifecycle(employee);
  const period = getEmployeePeriodForDate(employee, ref);
  const start = period?.start || lifecycle.start;
  if (start && ref < start) {
    return { resigned: false, lastAttendance: null, daysSinceAttendance: 0, reason: 'لم يصل تاريخ المباشرة بعد' };
  }
  if (lifecycle.periods.length && !period) {
    return { resigned: true, lastAttendance: null, daysSinceAttendance: Infinity, reason: 'خارج فترات العمل' };
  }
  const lastAttendance = getLastAttendanceDateOnOrBefore(employee, ref, period?.start || null);
  const baseDate = lastAttendance || start || null;
  if (!baseDate) {
    return { resigned: true, lastAttendance: null, daysSinceAttendance: Infinity, reason: 'لا يوجد حضور سابق' };
  }
  const daysSinceAttendance = Math.floor((ref - baseDate) / 86400000);
  if (daysSinceAttendance > EMPLOYEE_AUTO_RESIGN_AFTER_DAYS) {
    return {
      resigned: true,
      lastAttendance,
      daysSinceAttendance,
      reason: `لا يوجد حضور منذ ${daysSinceAttendance} يوم`
    };
  }
  return { resigned: false, lastAttendance, daysSinceAttendance, reason: 'يعمل' };
}

function isEmployeeActiveOnDate(employee, year, month, day) {
  if (!isEmployeeFlagActive(employee)) return false;
  const target = new Date(Number(year), Number(month) - 1, Number(day));
  const { start, end, periods } = getEmployeeLifecycle(employee);
  if (start && target < start) return false;
  if (end && target > end) return false;
  if (periods.length && !getEmployeePeriodForDate(employee, target)) return false;
  const today = new Date();
  const todayClean = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const autoReference = target > todayClean ? todayClean : target;
  if (getEmployeeAutoResignationInfo(employee, autoReference).resigned) return false;
  return true;
}

function employeeHasActiveDayInMonth(employee, year, month) {
  const days = getDaysInMonth(year, month);
  for (let day = 1; day <= days; day++) {
    if (isEmployeeActiveOnDate(employee, year, month, day)) return true;
  }
  return false;
}

function getEmployeeLifecycleStatus(employee, year, month) {
  const days = getDaysInMonth(year, month);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month - 1, days);
  const { start, end } = getEmployeeLifecycle(employee);
  const flagActive = isEmployeeFlagActive(employee);
  if (!flagActive) return { status: 'inactive', reason: 'مستقيل يدويا', start, end };
  if (start && start > monthEnd) return { status: 'active', reason: 'يعمل - لم يصل تاريخ المباشرة بعد', start, end };
  if (end && end < monthStart) return { status: 'inactive', reason: 'مستقيل قبل هذا الشهر', start, end };
  const today = new Date();
  const todayClean = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const referenceDate = monthEnd < todayClean ? monthEnd : todayClean;
  const autoInfo = getEmployeeAutoResignationInfo(employee, referenceDate);
  if (autoInfo.resigned) return { status: 'inactive', reason: autoInfo.reason, start, end, lastAttendance: autoInfo.lastAttendance };
  return { status: 'active', reason: 'يعمل', start, end, lastAttendance: autoInfo.lastAttendance };
}

function getTimesheetMonthBonusKey(year, month) {
  return payrollPeriodKey(year, month);
}

function getTimesheetMonthEndBonus(employee, year, month) {
  if (!employee) return 0;
  const bonuses = employee.timesheetMonthEndBonuses || employee.monthEndBonuses || {};
  return asMoney(bonuses[getTimesheetMonthBonusKey(year, month)]);
}

function setTimesheetMonthEndBonus(employee, year, month, value) {
  if (!employee) return;
  employee.timesheetMonthEndBonuses = employee.timesheetMonthEndBonuses || {};
  const key = getTimesheetMonthBonusKey(year, month);
  const amount = asMoney(value);
  if (amount > 0) employee.timesheetMonthEndBonuses[key] = amount;
  else delete employee.timesheetMonthEndBonuses[key];
}

function calculateSalaryForEmployee(employee, config) {
  const { year, month } = config;
  const nominalSalary = getEmployeeNominalSalary(employee, config.nominalSalary);
  // skipSystemRules: read-only callers (timesheet month docs / print preview) must never
  // rewrite record statuses as a side effect of merely rendering. Explicit actions
  // (تطبيق القوانين، الحاسبة، التقارير) keep the legacy behavior.
  if (!config.skipSystemRules) applySystemPayrollRules(employee, year, month, false);

  const PS = getPayrollSettings();
  const shift = getEmployeeShift(employee);
  const totalDays = getDaysInMonth(year, month);
  const fridayCount = getFridaysInMonth(year, month).length;
  const workingDays = totalDays - fridayCount;
  const dailyRate = nominalSalary / totalDays;
  // Shift-aware hourly rate (full shift earns exactly one dailyRate), matching getDailyCalc.
  const hourlyRate = dailyRate / (shift.hours || PS.standardDayHours || 9);
  const transportRate = workingDays > 0 ? (config.cfgTransport || 50000) / workingDays : 0;
  const foodRate = workingDays > 0 ? (config.cfgFood || 50000) / workingDays : 0;

  const records = recordsForMonth(employee, year, month).slice().sort((a, b) => a.day - b.day);

  // ── SINGLE SOURCE OF TRUTH ──
  // The salary is the SUM of each day's getDailyCalc (the same engine the timesheet shows),
  // plus only the genuinely-monthly rules below. No status rule is re-implemented here.
  let baseSalary = 0, allowances = 0;
  let overtimeHours = 0, overtimeValue = 0;     // regular OT (×1.5)
  let fridayOTHours = 0, fridayOTValue = 0;      // Friday work OT (×2)
  let rawLatenessDeduction = 0, totalLatenessMinutes = 0;
  let earlyDeduction = 0, absenceDeduction = 0;
  let manualPenalty = 0, damageTotal = 0, bonusTotal = 0, currentAdvance = 0, officialAdvance = 0;
  let attendanceDays = 0, leaveDays = 0, absentDays = 0, fridayWorkedDays = 0;
  let hourlyExcusedHours = 0, hourlyExcusedPay = 0;
  const lateDays = []; // chronological lateness for monthly grace allocation + markers

  records.forEach(r => {
    const statusType = normalizeStatus(r.status);
    const isFridayDate = isFriday(year, month, r.day);
    const d = getDailyCalc(r, employee, { ...config, nominalSalary });

    currentAdvance += r.advance || 0;
    officialAdvance += d.officialAdvanceApplied || 0;
    manualPenalty += r.penalty || 0;
    bonusTotal += r.bonus || 0;
    damageTotal += r.damage || 0;

    if (statusType === 'leave') { if (!isFridayDate) leaveDays++; }
    else if (statusType === 'absent') { if (!isFridayDate) { absentDays++; absenceDeduction += d.deduction; } }
    else if (statusType === 'friday_work') { fridayWorkedDays++; }
    else if (d.isAttendanceDay) { attendanceDays++; }

    if (statusType === 'hourly_excused') {
      hourlyExcusedHours += hourlyRate > 0 ? d.dayPay / hourlyRate : 0;
      hourlyExcusedPay += d.dayPay;
    }

    // Paid day off (friday / عطلة مدفوعة):
    //   • on a Friday date  → pay decided by monthly eligibility (added below, skip here)
    //   • on a non-Friday   → treat as an official holiday, pay the day directly
    if (d.isPaidOff) {
      if (!isFridayDate) baseSalary += d.dayPay;
      return;
    }

    baseSalary += d.dayPay;
    allowances += d.allowance;
    if (d.isFridayWorked) { fridayOTHours += d.otHours; fridayOTValue += d.otValue; }
    else { overtimeHours += d.otHours; overtimeValue += d.otValue; }
    rawLatenessDeduction += d.late;
    earlyDeduction += d.earlyDeduction;
    if (d.lateMinutes > 0) { totalLatenessMinutes += d.lateMinutes; lateDays.push({ day: r.day, minutes: d.lateMinutes }); }
  });

  // ── Monthly grace: 100 minutes of lateness per month are fully forgiven ──
  // Full forgiveness restores BOTH the unearned hour (added back to base) and the ×1 penalty.
  const GRACE_MIN = PS.graceMinutesPerMonth;
  const gracedMin = Math.min(GRACE_MIN, totalLatenessMinutes);
  const graceMoney = (gracedMin / 60) * hourlyRate;
  baseSalary += graceMoney;
  const latenessDeduction = Math.max(0, rawLatenessDeduction - graceMoney);
  // Allocate the graced minutes to the earliest late days (for the timesheet marker).
  const graceByDay = {};
  let graceRemaining = gracedMin;
  for (const ld of lateDays) {
    if (graceRemaining <= 0) break;
    const used = Math.min(graceRemaining, ld.minutes);
    graceByDay[ld.day] = used;
    graceRemaining -= used;
  }

  // ── Friday eligibility: every 6 absent/leave days costs one Friday ──
  const lostFridays = Math.min(fridayCount, Math.ceil((absentDays + leaveDays) / (PS.fridayLossEveryDays || 6)));
  const eligibleFridays = Math.max(0, fridayCount - lostFridays - fridayWorkedDays);
  const fridayCompensation = eligibleFridays * dailyRate; // worked Fridays already in baseSalary

  const totalOvertimeValue = overtimeValue + fridayOTValue;
  // Stored emp.prevAdvance uses the "ledger" sign convention: positive = company owes
  // the employee (carried-over balance in their favor), negative = employee owes the
  // company. The advance/deduction math below expects the opposite (positive = amount
  // the employee owes back, matching currentAdvance/officialAdvance), so negate once here.
  const previousAdvance = -(employee.prevAdvance || 0);
  const officialAdvanceSummary = getEmployeeOfficialAdvancesSummary(employee, year, month);
  const recordedAdvanceDays = new Set(records.map(r => Number(getRecordPeriod(r, config).day)).filter(Boolean));
  officialAdvance += officialAdvanceSummary.rows
    .filter(item => !recordedAdvanceDays.has(Number(String(item.date || '').slice(8, 10))))
    .reduce((sum, item) => sum + asMoney(item.amount), 0);
  const totalAdvance = currentAdvance + previousAdvance + officialAdvance;
  const monthEndBonus = getTimesheetMonthEndBonus(employee, year, month);
  const totalBonusWithMonthEnd = bonusTotal + monthEndBonus;

  const automaticPenalties = latenessDeduction + earlyDeduction + absenceDeduction;
  const totalEarnings = baseSalary + allowances + totalOvertimeValue + fridayCompensation + totalBonusWithMonthEnd;
  const totalDeductions = latenessDeduction + earlyDeduction + absenceDeduction + currentAdvance + previousAdvance + officialAdvance + manualPenalty + damageTotal;
  const salaryDueDeductions = latenessDeduction + earlyDeduction + absenceDeduction + manualPenalty + damageTotal;

  return {
    totalDays, fridayCount, workingDays,
    dailyRate, hourlyRate, allowanceRate: transportRate + foodRate,
    transportRate, foodRate,
    attendanceDays, leaveDays, absentDays,
    baseSalary, allowances, transportTotal: 0, foodTotal: 0,
    overtimeHours, overtimeValue, regularOvertimeHours: overtimeHours,
    fridayOTHours, fridayOTValue, fridayWorkOT: fridayOTHours,
    totalOvertime: overtimeHours + fridayOTHours, totalOvertimeValue,
    latenessDeduction, totalLatenessDeduction: latenessDeduction,
    totalLatenessHours: latenessDeduction / (hourlyRate || 1),
    earlyDeduction, leaveDeduction: 0, absenceDeduction,
    fridayCompensation, fridayWorkedDays, eligibleFridays, autoFridayPenalty: 0,
    missedFridayCount: Math.floor((absentDays + leaveDays) / (PS.fridayLossEveryDays || 6)), compensationDays: 0,
    currentAdvance, officialAdvance, officialAdvanceCount: officialAdvanceSummary.rows.length,
    officialAdvanceCash: officialAdvanceSummary.cashTotal,
    officialAdvanceFood: officialAdvanceSummary.foodTotal,
    previousAdvance, totalAdvance,
    penalty: manualPenalty, totalPenalty: manualPenalty,
    damage: damageTotal, totalDamage: damageTotal,
    bonus: totalBonusWithMonthEnd, dailyBonus: bonusTotal, monthEndBonus, totalBonus: totalBonusWithMonthEnd,
    hourlyExcusedHours, hourlyExcusedPay,
    automaticPenalties,
    totalEarnings, totalDeductions, finalSalary: totalEarnings - totalDeductions,
    salaryDueDeductions, salaryDue: totalEarnings - salaryDueDeductions,
    graceMinutesUsed: gracedMin, graceByDay,
    nominalSalary
  };
}

// A worked Friday (friday_work) forfeits its ×2 Friday bonus and is downgraded to a NORMAL
// working day (+ the Friday's own dailyRate) when the employee had an ABSENT or unpaid LEAVE
// day earlier in the SAME work-week — the 6 days (Sat→Thu) leading up to that Friday. Early
// departure (early_excused) and every other excused state do NOT trigger the downgrade; only
// full-day absence and leave do. Week can cross a month boundary, so we match by real dates.
function hasDisqualifyingAbsenceInFridayWeek(emp, year, month, day) {
  if (!emp || !Array.isArray(emp.records)) return false;
  const friday = new Date(year, month - 1, day);
  for (let i = 1; i <= 6; i++) {
    const d = new Date(friday);
    d.setDate(friday.getDate() - i);
    const yy = d.getFullYear(), mm = d.getMonth() + 1, dd = d.getDate();
    const rec = emp.records.find(r => {
      const p = getRecordPeriod(r);
      return p.year === yy && p.month === mm && p.day === dd;
    });
    if (rec) {
      const s = normalizeStatus(rec.status);
      if (s === 'absent' || s === 'leave') return true;
    }
  }
  return false;
}

// ─── Daily Calculation for Table Display ───
// Returns: { dayPay, allowance, otHours, otValue, late, earlyDeduction, deduction, total }
function getDailyCalc(rec, emp, configOverride = null) {
  const recordPeriod = getRecordPeriod(rec, configOverride || getConfig());
  const cfg = { ...getConfig(), ...(configOverride || {}), year: recordPeriod.year, month: recordPeriod.month };
  cfg.nominalSalary = emp.salary || cfg.nominalSalary;
  const totalDays = getDaysInMonth(cfg.year, cfg.month);
  let fridayCount = 0;
  for (let d = 1; d <= totalDays; d++) if (isFriday(cfg.year, cfg.month, d)) fridayCount++;
  const workingDays = totalDays - fridayCount;
  const PS = getPayrollSettings();
  const shift = getEmployeeShift(emp);
  const dailyRate = cfg.nominalSalary / totalDays;
  // Hourly rate is relative to the employee's shift length, so a FULL shift earns exactly one dailyRate
  // (morning 9h → dailyRate/9, evening 8h → dailyRate/8).
  const hourlyRate = dailyRate / (shift.hours || PS.standardDayHours || 9);
  const transportRate = workingDays > 0 ? (cfg.cfgTransport || 50000) / workingDays : 0;
  const foodRate = workingDays > 0 ? (cfg.cfgFood || 50000) / workingDays : 0;
  const allowanceRate = transportRate + foodRate;

  let statusType = normalizeStatus(rec.status);
  // Worked-Friday downgrade: a friday_work day whose week had an absent/leave day loses the ×2
  // bonus and is computed as a NORMAL working day (hours ×1 + allowance), with the Friday's own
  // dailyRate re-added below. We do that by calculating the day as 'normal' here, then adding
  // dailyRate and keeping the allowance further down. The record's real status stays friday_work,
  // so the monthly engine still excludes it from eligibleFridays (no double dailyRate).
  const fridayWorkDowngraded = (statusType === 'friday_work') &&
    hasDisqualifyingAbsenceInFridayWeek(emp, recordPeriod.year, recordPeriod.month, recordPeriod.day);
  if (fridayWorkDowngraded) statusType = 'normal';
  const SHIFT_START = shift.startMin, SHIFT_END = shift.endMin;
  const STD_MIN = shift.durationMin;          // full shift length in minutes
  const OT_MULT = PS.otMultiplier;            // regular overtime multiplier
  const FRI_OT_MULT = PS.fridayOtMultiplier;  // friday-work multiplier
  const PEN_MULT = PS.penaltyMultiplier;      // late/early penalty multiplier (×1)

  // ── ACCUMULATIVE MODEL ──
  // The day's pay is EARNED from the hours actually present within the standard window.
  // A missed hour (late arrival / early leave) is simply NOT earned (dayPay drops),
  // and an EQUAL hour is deducted as a penalty (×1). So one late hour costs 2 hours
  // total (1 unearned + 1 penalty) — but the penalty itself is ×1, never ×2.
  let dayPay = 0, allowance = 0, otHours = 0, otValue = 0;
  let late = 0, earlyDeduction = 0, deduction = 0;
  let lateMinutes = 0, earlyMinutes = 0;
  let isAttendanceDay = false; // counts toward worked-day tallies
  let isFridayWorked = false;  // friday_work: OT routes to the ×2 bucket
  let isPaidOff = false;       // friday / عطلة مدفوعة: pay decided monthly by eligibility

  function actualWorkedHours() {
    if (rec.checkInMin == null || rec.checkOutMin == null) return 0;
    return rec.checkOutMin > rec.checkInMin
      ? (rec.checkOutMin - rec.checkInMin) / 60
      : ((24 * 60 - rec.checkInMin) + rec.checkOutMin) / 60;
  }

  if (statusType === 'normal' || statusType === 'early_excused') {
    isAttendanceDay = true;
    allowance = allowanceRate;
    if (rec.checkInMin != null && rec.checkOutMin != null) {
      // Normalize times into the shift frame so cross-midnight checkouts (e.g. evening shift,
      // or overtime running past 00:00) are handled correctly.
      const ci = rec.checkInMin;
      let co = rec.checkOutMin;
      if (co < ci) co += 24 * 60;                       // checkout crossed midnight
      const SHIFT_END_EFF = (SHIFT_END <= SHIFT_START) ? SHIFT_END + 24 * 60 : SHIFT_END;
      // Missed minutes at the start (late) and end (early leave)
      if (ci > SHIFT_START) lateMinutes = ci - SHIFT_START;
      if (co < SHIFT_END_EFF) earlyMinutes = SHIFT_END_EFF - co;
      // Early arrival BEFORE the shift start is real worked time — paid at the regular rate
      // (NOT overtime). The employee never loses his right for coming early. Optional cap in settings.
      let earlyArrivalMin = (ci < SHIFT_START) ? (SHIFT_START - ci) : 0;
      if (PS.maxEarlyArrivalMin > 0) earlyArrivalMin = Math.min(earlyArrivalMin, PS.maxEarlyArrivalMin);
      // Overtime ONLY after the shift end.
      if (co > SHIFT_END_EFF) {
        otHours = (co - SHIFT_END_EFF) / 60;
        otValue = otHours * hourlyRate * OT_MULT;
      }
      // مغادر معذور: the early departure is forgiven — counted as worked, no penalty.
      if (statusType === 'early_excused') earlyMinutes = 0;

      // Accumulative base: the standard hours actually present + any early-arrival hours (× regular).
      const unearnedMin = lateMinutes + earlyMinutes;
      dayPay = ((STD_MIN - unearnedMin + earlyArrivalMin) / 60) * hourlyRate;
      // Penalty: one equal hour deducted for the missed time (× penaltyMultiplier, default 1).
      late = (lateMinutes / 60) * hourlyRate * PEN_MULT;
      earlyDeduction = (earlyMinutes / 60) * hourlyRate * PEN_MULT;
    } else {
      // Incomplete record (one or both punches missing): pay the full standard day, no penalty.
      dayPay = dailyRate;
    }
  } else if (statusType === 'late_excused') {
    // Excused: full day, NO late/early penalty; OT after a full shift's worth of actual hours.
    isAttendanceDay = true;
    dayPay = dailyRate;
    allowance = allowanceRate;
    const hrs = actualWorkedHours();
    if (hrs > shift.hours) { otHours = hrs - shift.hours; otValue = otHours * hourlyRate * OT_MULT; }
  } else if (statusType === 'night_shift') {
    // Full day, no late/early; OT after a full shift's actual hours. Carries next day → hourly_excused.
    isAttendanceDay = true;
    dayPay = dailyRate;
    allowance = allowanceRate;
    const hrs = actualWorkedHours();
    if (hrs > shift.hours) { otHours = hrs - shift.hours; otValue = otHours * hourlyRate * OT_MULT; }
  } else if (statusType === 'external_mission') {
    // مهمة خارجية: off-site work counts as a full present day + allowance, no late/early penalty.
    isAttendanceDay = true;
    dayPay = dailyRate;
    allowance = allowanceRate;
  } else if (statusType === 'hourly_excused') {
    // الأجر بالساعة: actual hours × hourlyRate ONLY. Outside the normal system —
    // no overtime, no lateness/early penalty. Allowance still granted for the day.
    dayPay = actualWorkedHours() * hourlyRate;
    allowance = allowanceRate;
  } else if (statusType === 'friday_work') {
    // Gets the Friday day (dailyRate) by default + DOUBLE the worked hours (× 2). No allowance.
    isFridayWorked = true;
    dayPay = dailyRate;
    allowance = 0;
    const hrs = actualWorkedHours();
    otHours = hrs;
    otValue = hrs * hourlyRate * FRI_OT_MULT;
  } else if (statusType === 'friday') {
    // Paid day off (Friday or official holiday): yomiya only, no allowance.
    // Friday-date eligibility is decided monthly; a non-Friday date is paid as a holiday.
    isPaidOff = true;
    dayPay = dailyRate;
    allowance = 0;
  } else if (statusType === 'leave') {
    // إجازة بدون راتب: day not paid, no penalty. Loses that week's Friday (handled monthly).
    dayPay = 0; allowance = 0;
  } else if (statusType === 'absent') {
    // غياب: day not earned (dayPay 0) + one EXTRA day deducted. Friday loss handled monthly.
    dayPay = 0; allowance = 0;
    deduction = dailyRate;
  }

  // A Friday NEVER earns transport/food allowance — those budgets are spread across the
  // month's non-Friday working days only (allowanceRate = budget / workingDays, and
  // workingDays excludes Fridays). This holds however the Friday is treated: worked as a
  // normal day (dayPay from hours), worked as friday_work, or taken as a paid day off.
  // The Friday itself is still paid (dailyRate via monthly fridayCompensation / friday_work
  // baseline) — only the allowance is dropped. Placed before overrides so an explicit
  // manager allowanceOverride can still win when deliberately set.
  if (isFriday(recordPeriod.year, recordPeriod.month, recordPeriod.day) && !fridayWorkDowngraded) allowance = 0;

  // Downgraded worked-Friday: on top of the normal-day pay + allowance computed above, the
  // employee still receives the Friday's own basic salary (dailyRate). Its ×1 OT (if any) was
  // already routed to the normal overtime bucket because isFridayWorked stayed false.
  if (fridayWorkDowngraded) dayPay += dailyRate;

  // Apply overrides if present:
  if (rec.allowanceOverride != null) allowance = Number(rec.allowanceOverride) || 0;
  if (rec.otHoursOverride != null) {
    otHours = Math.max(0, Number(rec.otHoursOverride) || 0);
    const multiplier = (statusType === 'friday_work') ? FRI_OT_MULT : OT_MULT;
    otValue = otHours * hourlyRate * multiplier;
  }
  if (rec.lateOverride != null) {
    late = Number(rec.lateOverride) || 0;
    lateMinutes = (hourlyRate > 0 && PEN_MULT > 0) ? (late / (hourlyRate * PEN_MULT)) * 60 : 0;
  }
  if (rec.earlyDeductionOverride != null) {
    earlyDeduction = Number(rec.earlyDeductionOverride) || 0;
    earlyMinutes = (hourlyRate > 0 && PEN_MULT > 0) ? (earlyDeduction / (hourlyRate * PEN_MULT)) * 60 : 0;
  }

  // Total penalties for this day (surfaced in the "إجمالي الغرامات" column).
  const manualAdvance = Number(rec.advance) || 0;
  const officialAdvanceApplied = getOfficialAdvanceAppliedForRecord(emp, rec, cfg);
  const advanceTotal = manualAdvance + officialAdvanceApplied;
  const penaltyTotal = late + earlyDeduction + deduction + (rec.penalty || 0) + (rec.damage || 0);

  const total = dayPay + allowance + otValue + (rec.bonus || 0)
              - late - earlyDeduction - deduction
              - (rec.penalty || 0) - advanceTotal - (rec.damage || 0);
  return {
    dayPay, allowance, otHours, otValue, late, earlyDeduction, deduction,
    lateMinutes, earlyMinutes, penaltyTotal,
    isAttendanceDay, isFridayWorked, isPaidOff,
    hourlyRate, dailyRate, allowanceRate,
    manualAdvance, officialAdvanceApplied, advanceTotal, total
  };
}

function getEmployeeMonthlyPayrollSummary(emp, cfg) {
  if (!emp) return null;
  const empCfg = { ...cfg, nominalSalary: getEmployeeNominalSalary(emp, cfg.nominalSalary) };
  const records = recordsForMonth(emp, cfg.year, cfg.month);
  const attendanceHours = records.reduce((sum, rec) => sum + (isCalendarAttendanceRecord(rec) ? getRecordHours(rec) : 0), 0);
  const result = calculateSalaryForEmployee(emp, empCfg);
  const balanceAfterNoPayment = calculateBalanceAfterPayment(result, 0);
  return {
    employee: emp,
    records,
    result,
    attendanceHours,
    overtimeHours: result.totalOvertime || 0,
    fridayWorkedDays: result.fridayWorkedDays || 0,
    eligibleFridays: result.eligibleFridays || 0,
    lateHours: result.totalLatenessHours || 0,
    penalties: (result.totalPenalty || 0) + (result.totalDamage || 0) + (result.automaticPenalties || 0),
    advances: result.totalAdvance || 0,
    officialAdvances: result.officialAdvance || 0,
    manualAdvances: result.currentAdvance || 0,
    previousAdvance: result.previousAdvance || 0,
    bonuses: result.totalBonus || result.bonus || 0,
    nominalSalary: result.nominalSalary || empCfg.nominalSalary,
    finalNet: result.finalSalary || 0,
    payable: result.salaryDue || result.finalSalary || 0,
    reservedBalance: balanceAfterNoPayment
  };
}

function calculateTimesheetRangeResult(emp, records, cfg = getConfig()) {
  const nominalSalary = getEmployeeNominalSalary(emp, cfg.nominalSalary);
  const result = {
    totalDays: records.length,
    fridayCount: 0,
    workingDays: 0,
    dailyRate: 0,
    hourlyRate: 0,
    allowanceRate: 0,
    attendanceDays: 0,
    leaveDays: 0,
    absentDays: 0,
    baseSalary: 0,
    allowances: 0,
    overtimeHours: 0,
    overtimeValue: 0,
    regularOvertimeHours: 0,
    fridayOTHours: 0,
    fridayOTValue: 0,
    fridayWorkOT: 0,
    totalOvertime: 0,
    totalOvertimeValue: 0,
    latenessDeduction: 0,
    totalLatenessDeduction: 0,
    totalLatenessHours: 0,
    earlyDeduction: 0,
    absenceDeduction: 0,
    fridayCompensation: 0,
    fridayWorkedDays: 0,
    eligibleFridays: 0,
    currentAdvance: 0,
    officialAdvance: 0,
    previousAdvance: -asMoney(emp?.prevAdvance),
    penalty: 0,
    totalPenalty: 0,
    damage: 0,
    totalDamage: 0,
    bonus: 0,
    totalBonus: 0,
    automaticPenalties: 0,
    totalEarnings: 0,
    totalDeductions: 0,
    salaryDueDeductions: 0,
    salaryDue: 0,
    nominalSalary,
    rangeNetBeforeBalance: 0,
    graceMinutesUsed: 0,
    graceByKey: {},
    graceByDay: {},
  };

  records.forEach(rec => {
    const p = getRecordPeriod(rec, cfg);
    const rowCfg = { ...cfg, year: p.year, month: p.month, nominalSalary };
    const d = getDailyCalc(rec, emp, rowCfg);
    const statusType = normalizeStatus(rec.status);
    const key = `${p.year}-${p.month}-${p.day}`;

    if (statusType === 'leave') result.leaveDays += 1;
    else if (statusType === 'absent') result.absentDays += 1;
    else if (statusType === 'friday_work') result.fridayWorkedDays += 1;
    else if (d.isAttendanceDay) result.attendanceDays += 1;

    if (isFriday(p.year, p.month, p.day)) result.fridayCount += 1;
    else result.workingDays += 1;

    result.dailyRate = d.dailyRate || result.dailyRate;
    result.hourlyRate = d.hourlyRate || result.hourlyRate;
    result.allowanceRate = d.allowanceRate || result.allowanceRate;
    result.baseSalary += d.dayPay || 0;
    result.allowances += d.allowance || 0;
    result.overtimeHours += d.isFridayWorked ? 0 : (d.otHours || 0);
    result.overtimeValue += d.isFridayWorked ? 0 : (d.otValue || 0);
    result.fridayOTHours += d.isFridayWorked ? (d.otHours || 0) : 0;
    result.fridayOTValue += d.isFridayWorked ? (d.otValue || 0) : 0;
    result.latenessDeduction += d.late || 0;
    result.earlyDeduction += d.earlyDeduction || 0;
    result.absenceDeduction += d.deduction || 0;
    result.currentAdvance += d.manualAdvance || 0;
    result.officialAdvance += d.officialAdvanceApplied || 0;
    result.penalty += Number(rec.penalty) || 0;
    result.damage += Number(rec.damage) || 0;
    result.bonus += Number(rec.bonus) || 0;
    result.rangeNetBeforeBalance += d.total || 0;
    if (d.lateMinutes > 0) result.graceByKey[key] = 0;
  });

  result.regularOvertimeHours = result.overtimeHours;
  result.fridayWorkOT = result.fridayOTHours;
  result.totalOvertime = result.overtimeHours + result.fridayOTHours;
  result.totalOvertimeValue = result.overtimeValue + result.fridayOTValue;
  result.totalLatenessDeduction = result.latenessDeduction;
  result.totalLatenessHours = result.hourlyRate > 0 ? result.latenessDeduction / result.hourlyRate : 0;
  result.totalPenalty = result.penalty;
  result.totalDamage = result.damage;
  result.totalBonus = result.bonus;
  result.automaticPenalties = result.latenessDeduction + result.earlyDeduction + result.absenceDeduction;
  result.salaryDueDeductions = result.automaticPenalties + result.penalty + result.damage;
  result.totalEarnings = result.baseSalary + result.allowances + result.totalOvertimeValue + result.fridayCompensation + result.bonus;
  result.totalDeductions = result.salaryDueDeductions + result.currentAdvance + result.officialAdvance + result.previousAdvance;
  result.salaryDue = result.rangeNetBeforeBalance;
  result.finalSalary = result.rangeNetBeforeBalance - result.previousAdvance;
  result.totalAdvance = result.currentAdvance + result.officialAdvance + result.previousAdvance;
  return result;
}

function getEmployeeTimesheetRangeSummary(emp, cfg = getConfig()) {
  if (!emp) return null;
  const records = recordsForTimesheetRange(emp, cfg);
  const result = calculateTimesheetRangeResult(emp, records, cfg);
  const attendanceHours = records.reduce((sum, rec) => sum + (isCalendarAttendanceRecord(rec) ? getRecordHours(rec) : 0), 0);
  return {
    employee: emp,
    records,
    result,
    attendanceHours,
    overtimeHours: result.totalOvertime || 0,
    fridayWorkedDays: result.fridayWorkedDays || 0,
    eligibleFridays: result.eligibleFridays || 0,
    lateHours: result.totalLatenessHours || 0,
    penalties: (result.totalPenalty || 0) + (result.totalDamage || 0) + (result.automaticPenalties || 0),
    advances: result.totalAdvance || 0,
    officialAdvances: result.officialAdvance || 0,
    manualAdvances: result.currentAdvance || 0,
    previousAdvance: result.previousAdvance || 0,
    bonuses: result.totalBonus || result.bonus || 0,
    nominalSalary: result.nominalSalary || getEmployeeNominalSalary(emp, cfg.nominalSalary),
    finalNet: result.finalSalary || 0,
    payable: result.salaryDue || result.finalSalary || 0,
    reservedBalance: calculateBalanceAfterPayment(result, 0),
  };
}

function payrollPeriodKey(year, month) {
  return `${Number(year)}-${String(Number(month)).padStart(2, '0')}`;
}

function ensurePayrollCollections(db) {
  if (!db || typeof db !== 'object') return db;
  if (!Array.isArray(db.payroll_periods)) db.payroll_periods = [];
  if (!Array.isArray(db.employee_payroll_closings)) db.employee_payroll_closings = [];
  if (!Array.isArray(db.payroll_payments)) db.payroll_payments = [];
  if (!Array.isArray(db.payroll_adjustments)) db.payroll_adjustments = [];
  if (!Array.isArray(db.audit_log)) db.audit_log = [];
  return db;
}

// ─── Operation locks (Production Hardening Final Lock Sprint, 2026-07-04) ───
// Server/DB-backed idempotency. Supersedes the previous sprint's in-memory
// Set-based lock, which only protected a single browser tab — this calls the
// server's /api/operation-lock/* endpoints, backed by a real SQLite table
// (`operation_locks`) whose lockKey is the PRIMARY KEY. Acquiring a lock is a
// single atomic server-side INSERT (see server.js), which is what actually
// closes the cross-tab/cross-device race: two "simultaneous" browser tabs (or
// two devices) both calling acquire for the same lockKey cannot both succeed,
// because Node processes each request's synchronous SQLite calls to
// completion without interleaving, and the second INSERT hits a real PRIMARY
// KEY violation.
//
// lockKey MUST be a fixed, deterministic string derived from the operation's
// own identity (period id, closing id + amount + date, sourceCanonicalKey,
// etc.) — never a random id — so that retries and re-invocations for the
// SAME logical operation always collide with the SAME row.
async function withOperationLock(lockKey, operationType, fn) {
  const createdBy = window.PentagonAuth?.getCurrentUser?.()?.id || 'system';
  const acquireRes = await fetch('/api/operation-lock/acquire', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lockKey, operationType, sourceCanonicalKey: lockKey, createdBy }),
  }).then(r => r.json());

  async function logLockAudit(result) {
    try {
      await PentagonDB.mutate(db => {
        if (!Array.isArray(db.audit_log)) db.audit_log = [];
        db.audit_log.push({
          id: makeId('audit_lock'),
          action: 'operation_lock_attempt',
          entityType: 'operation_lock',
          entityId: lockKey,
          createdAt: new Date().toISOString(),
          userId: createdBy,
          reason: `operationType=${operationType} result=${result}`,
          afterSnapshot: { lockKey, operationType, result, acquireRes },
        });
      });
    } catch (_) { /* audit best-effort */ }
  }

  if (!acquireRes.acquired) {
    if (acquireRes.reason === 'reused_existing') {
      // A previous attempt for this exact lockKey already completed
      // successfully elsewhere (another tab/device/retry). Re-run fn(): every
      // protected operation has its OWN idempotency check (existing move by
      // origin/sourceCanonicalKey), so this returns the already-created
      // result instead of creating a duplicate.
      await logLockAudit('reused_existing');
      return fn();
    }
    // 'blocked_in_progress' or 'stale_lock_needs_manual_check' — refuse to
    // proceed rather than guess.
    await logLockAudit('duplicate_attempt_rejected');
    const err = new Error(`عملية أخرى قيد التنفيذ بالفعل أو تحتاج مراجعة يدوية (${acquireRes.reason}) لنفس المفتاح: ${lockKey}`);
    err.lockResult = acquireRes;
    throw err;
  }

  try {
    const result = await fn();
    const relatedMoveId = result?.move?.id || result?.accrualMove?.id || result?.moveId || result?.id || '';
    await fetch('/api/operation-lock/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lockKey, relatedMoveId }),
    }).catch(() => {});
    return result;
  } catch (e) {
    await fetch('/api/operation-lock/fail', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lockKey, errorMessage: e.message || String(e) }),
    }).catch(() => {});
    throw e;
  }
}

function getPayrollDataCache() {
  return window.PentagonDB?.getCached?.() || window.PentagonDB?.cache || {};
}

function getEmployeeAdvanceRowsForPeriod(db, emp, year, month, options = {}) {
  ensurePayrollCollections(db);
  const period = payrollPeriodKey(year, month);
  const empId = emp?.id || '';
  const empName = emp?.name || '';
  return (db.employee_advances || []).filter(item => {
    if (!options.includeNeedsReview && item.status === 'needs_review') return false;
    if (String(item.period || '').slice(0, 7) !== period) return false;
    if (empId && item.employeeId === empId) return true;
    return empName && item.employeeNameSnapshot === empName;
  });
}

function getOfficialAdvancesForEmployeePeriod(db, emp, year, month) {
  return getEmployeeAdvanceRowsForPeriod(db, emp, year, month, { includeNeedsReview: false });
}

function getEmployeeOfficialAdvancesSummary(emp, year, month, db = getPayrollDataCache()) {
  const rows = getOfficialAdvancesForEmployeePeriod(db, emp, year, month);
  return {
    rows,
    total: rows.reduce((sum, item) => sum + asMoney(item.amount), 0),
    cashTotal: rows.filter(item => item.type === 'cash').reduce((sum, item) => sum + asMoney(item.amount), 0),
    foodTotal: rows.filter(item => item.type === 'food').reduce((sum, item) => sum + asMoney(item.amount), 0),
  };
}

function getTimesheetOfficialAdvanceDayMap(emp, year, month) {
  const rows = getOfficialAdvancesForEmployeePeriod(getPayrollDataCache(), emp, year, month);
  return rows.reduce((map, item) => {
    const day = Number(String(item.date || '').slice(8, 10));
    if (!day) return map;
    if (!map.has(day)) map.set(day, []);
    map.get(day).push(item);
    return map;
  }, new Map());
}

function getOfficialAdvanceRowsForRecord(emp, rec, cfg = getConfig()) {
  const period = getRecordPeriod(rec, cfg);
  if (!period.day) return [];
  return getOfficialAdvancesForEmployeePeriod(getPayrollDataCache(), emp, period.year, period.month)
    .filter(item => Number(String(item.date || '').slice(8, 10)) === period.day);
}

function getOfficialAdvanceTotalForRecord(emp, rec, cfg = getConfig()) {
  return getOfficialAdvanceRowsForRecord(emp, rec, cfg)
    .reduce((sum, item) => sum + asMoney(item.amount), 0);
}

function getOfficialAdvanceAppliedForRecord(emp, rec, cfg = getConfig()) {
  return getOfficialAdvanceTotalForRecord(emp, rec, cfg);
}

function buildTimesheetAdvanceCanonicalKey(advanceId) {
  return `employee_advance/${advanceId}`;
}

function normalizeTimesheetAdvanceDateInput(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  if (dt.getUTCFullYear() !== year || dt.getUTCMonth() !== month - 1 || dt.getUTCDate() !== day) return '';
  return raw;
}

function formatTimesheetAdvanceDateDisplay(dateIso) {
  const date = normalizeTimesheetAdvanceDateInput(dateIso);
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}

function buildTimesheetAdvanceSettlementNote(fromDate, toDate) {
  if (!fromDate || !toDate || fromDate === toDate) return '';
  return `تم تغيير تاريخ السلفة من ${formatTimesheetAdvanceDateDisplay(fromDate) || fromDate} إلى ${formatTimesheetAdvanceDateDisplay(toDate) || toDate} لتصفية الراتب.`;
}

function findTimesheetAdvanceLinkedMoveIds(db, advanceRow) {
  const ids = new Set([advanceRow?.moveId, advanceRow?.accountMoveId].filter(Boolean));
  const canonicalKey = buildTimesheetAdvanceCanonicalKey(advanceRow?.id || '');
  const legacyKey = advanceRow?.sourceCanonicalKey || '';
  const financeTx = (db?.finance?.transactions || []).find(tx => tx.id === advanceRow?.financeTransactionId);
  [financeTx?.v6_move_id, financeTx?.accountMoveId, financeTx?.moveId].filter(Boolean).forEach(id => ids.add(id));
  (db?.account_moves || []).forEach(move => {
    if (move.state === 'cancel') return;
    if (move.id && ids.has(move.id)) return;
    if (canonicalKey && (move.sourceCanonicalKey === canonicalKey || move.origin === canonicalKey)) ids.add(move.id);
    if (legacyKey && move.sourceCanonicalKey === legacyKey) ids.add(move.id);
    if (advanceRow?.id && move.sourceType === 'employee_advance' && move.sourceId === advanceRow.id) ids.add(move.id);
    if (financeTx?.sourceId && move.sourceType === 'cashbox' && move.sourceId === financeTx.sourceId) ids.add(move.id);
  });
  return Array.from(ids).filter(Boolean);
}

async function cancelTimesheetOfficialAdvanceMoves(advanceRow, reason) {
  if (!window.FinanceService || !window.PentagonDB) return [];
  const db = await PentagonDB.load();
  const reversed = new Set((db.account_moves || []).map(move => move.reversed_of).filter(Boolean));
  const moveIds = findTimesheetAdvanceLinkedMoveIds(db, advanceRow);
  const cancelled = [];
  for (const moveId of moveIds) {
    const move = (db.account_moves || []).find(item => item.id === moveId);
    if (!move || move.state !== 'posted' || reversed.has(move.id)) continue;
    await FinanceService.cancelMove(move.id, { skip_backup: true, date: move.date || advanceRow?.date || todayISO(), reason });
    cancelled.push(move.id);
  }
  return cancelled;
}

function syncTimesheetAdvanceSourceRows(db, saved, nextRow, settlementNote) {
  const note = settlementNote || '';
  const dateParts = normalizeTimesheetAdvanceDateInput(nextRow.date).split('-').map(Number);
  const [year, month] = dateParts;
  if (saved.source === 'omni.workshopAdvances' && saved.sourceId && db.omni?.workshopAdvances) {
    const source = db.omni.workshopAdvances.find(item => item.id === saved.sourceId);
    if (source) {
      source.date = nextRow.date;
      source.dateDisplay = formatTimesheetAdvanceDateDisplay(nextRow.date) || source.dateDisplay || '';
      source.month = month || source.month;
      source.year = year || source.year;
      source.amount = nextRow.amount;
      source.description = nextRow.description;
      if (saved.advanceTypeRaw) source.advanceType = saved.advanceTypeRaw;
      if (note) source.review = [source.review, note].filter(Boolean).join(' | ');
    }
  }
  if (saved.financeTransactionId && db.finance?.transactions) {
    const tx = db.finance.transactions.find(item => item.id === saved.financeTransactionId);
    if (tx) {
      tx.date = nextRow.date;
      tx.amount = nextRow.amount;
      tx.cashboxEffect = -Math.abs(nextRow.amount);
      tx.description = nextRow.description;
      if (note) tx.review = [tx.review, note].filter(Boolean).join(' | ');
    }
  }
}

async function postTimesheetOfficialAdvanceMove(advanceRow) {
  if (!window.FinanceService || !window.PentagonDB) {
    throw new Error('FinanceService/PentagonDB غير متاح');
  }
  const amount = asMoney(advanceRow.amount);
  if (amount <= 0) throw new Error('مبلغ السلفة يجب أن يكون أكبر من صفر');
  const sourceCanonicalKey = buildTimesheetAdvanceCanonicalKey(advanceRow.id);
  const freshDb = await PentagonDB.load();
  const existing = (freshDb.account_moves || []).find(move =>
    move.sourceCanonicalKey === sourceCanonicalKey && move.state !== 'cancel'
  );
  if (existing) return existing;
  const move = await FinanceService.createMove({
    journal_id: 'j_bank',
    move_type: 'entry',
    date: advanceRow.date || todayISO(),
    partner_id: advanceRow.employeeId || advanceRow.employeeNameSnapshot || '',
    origin: sourceCanonicalKey,
    sourceType: 'employee_advance',
    sourceId: advanceRow.id,
    sourceCanonicalKey,
    line_ids: [
      { account_id: 'employee_advances', debit: amount, credit: 0, label: advanceRow.description || `سلفة ${advanceRow.employeeNameSnapshot || ''}`, partner_id: advanceRow.employeeId || '' },
      { account_id: 'cash_workshop', debit: 0, credit: amount, label: advanceRow.description || `سلفة ${advanceRow.employeeNameSnapshot || ''}`, partner_id: advanceRow.employeeId || '' },
    ],
    skip_backup: true,
  });
  return FinanceService.postMove(move.id, { skip_backup: true });
}

function getTimesheetAdvanceRecordContext(empIdx, dayIdx) {
  const emp = employees[empIdx];
  const rec = emp?.records?.[dayIdx];
  if (!emp || !rec) return null;
  const period = getRecordPeriod(rec, getConfig());
  const date = `${period.year}-${String(period.month).padStart(2, '0')}-${String(period.day).padStart(2, '0')}`;
  return { emp, rec, period, date };
}

window.openTimesheetInlineAmountEdit = async function(empIdx, dayIdx, field) {
  const ctx = getTimesheetAdvanceRecordContext(empIdx, dayIdx);
  if (!ctx || !['penalty', 'bonus'].includes(field)) return;
  if (isPayrollPeriodClosedForRecord(ctx.rec)) {
    showToast('شهر الرواتب مغلق. لا يمكن تعديل مبالغ التايم شيت مباشرة.', 'warning');
    return;
  }
  const currentValue = field === 'penalty'
    ? asMoney(ctx.rec.penalty) + asMoney(ctx.rec.damage)
    : asMoney(ctx.rec.bonus);
  const label = field === 'penalty' ? 'الغرامة اليدوية' : 'المكافأة';
  const value = await showOmniPrompt(`${label} ليوم ${ctx.period.day}/${ctx.period.month}:`, currentValue ? String(Math.round(currentValue)) : '');
  if (value === null || value === undefined) return;
  const amount = asMoney(String(value).replace(/,/g, ''));
  if (amount < 0) {
    showToast('أدخل مبلغاً موجباً أو صفراً.', 'warning');
    return;
  }
  if (field === 'penalty') {
    ctx.rec.penalty = amount;
    ctx.rec.damage = 0;
  } else {
    ctx.rec.bonus = amount;
  }
  if (ctx.rec.timesheetDocumented) ctx.rec.timesheetEditedAfterDocumentAt = new Date().toISOString();
  saveData();
  renderTimesheet();
};

function getTimesheetAdvanceSettlementNote(row) {
  if (row?.salarySettlementNote) return row.salarySettlementNote;
  const flag = (row?.reviewFlags || []).slice().reverse().find(item => item?.type === 'salary_settlement_date_change' && item.note);
  return flag?.note || '';
}

function renderTimesheetAdvanceListHtml(rows) {
  if (!rows.length) return '<div class="timesheet-advance-list-empty">لا توجد سلف رسمية لهذا اليوم.</div>';
  const total = rows.reduce((sum, item) => sum + asMoney(item.amount), 0);
  return `
    <div class="timesheet-advance-list-total"><span>إجمالي السلف الرسمية</span><b>${formatMoneyReadable(total)}</b></div>
    ${rows.map(row => {
      const settlementNote = getTimesheetAdvanceSettlementNote(row);
      return `
      <div class="timesheet-advance-list-row">
        <div>
          <b>${formatMoneyReadable(row.amount)}</b>
          <small>${escapeHtml(row.date || '')} · ${escapeHtml(row.description || row.advanceTypeRaw || 'سلفة رسمية')}</small>
          ${settlementNote ? `<small>${escapeHtml(settlementNote)}</small>` : ''}
        </div>
        <button type="button" class="timesheet-advance-list-edit" onclick="editTimesheetOfficialAdvance('${jsString(row.id)}')">
          <i class="fa-solid fa-pen-to-square"></i>
          <span>تعديل</span>
        </button>
      </div>
    `}).join('')}
  `;
}

window.openTimesheetAdvanceDayList = function(empIdx, dayIdx) {
  const ctx = getTimesheetAdvanceRecordContext(empIdx, dayIdx);
  if (!ctx) return;
  const rows = getOfficialAdvanceRowsForRecord(ctx.emp, ctx.rec, { ...getConfig(), year: ctx.period.year, month: ctx.period.month });
  showOmniModal(
    `سلف ${ctx.emp.name} - ${ctx.period.day}/${ctx.period.month}`,
    `<div class="timesheet-advance-list">${renderTimesheetAdvanceListHtml(rows)}</div>`,
    () => true
  );
};

window.openTimesheetAdvanceCreate = async function(empIdx, dayIdx) {
  const ctx = getTimesheetAdvanceRecordContext(empIdx, dayIdx);
  if (!ctx) return;
  if (isPayrollPeriodClosedForRecord(ctx.rec)) {
    showToast('شهر الرواتب مغلق. لا يمكن إضافة سلفة رسمية لهذا اليوم.', 'warning');
    return;
  }
  const amountRaw = await showOmniPrompt(`مبلغ السلفة الرسمية ليوم ${ctx.period.day}/${ctx.period.month}:`, '');
  if (amountRaw === null || amountRaw === undefined || amountRaw === '') return;
  const amount = asMoney(String(amountRaw).replace(/,/g, ''));
  if (amount <= 0) {
    showToast('مبلغ السلفة يجب أن يكون أكبر من صفر.', 'warning');
    return;
  }
  const description = await showOmniPrompt('بيان السلفة:', `سلفة ${ctx.emp.name}`);
  const advanceRow = {
    id: makeId('adv'),
    employeeId: ctx.emp.id || '',
    employeeNameSnapshot: ctx.emp.name || '',
    date: ctx.date,
    period: ctx.date.slice(0, 7),
    amount,
    type: 'cash',
    status: 'approved',
    source: 'timesheet',
    description: description || `سلفة ${ctx.emp.name}`,
    createdAt: new Date().toISOString(),
    createdBy: window.PentagonAuth?.getCurrentUser?.()?.id || 'system',
    moveId: '',
  };
  try {
    const move = await postTimesheetOfficialAdvanceMove(advanceRow);
    advanceRow.moveId = move?.id || '';
    await PentagonDB.mutate(db => {
      ensurePayrollCollections(db);
      db.employee_advances.push(advanceRow);
      db.audit_log.push({
        id: makeId('audit_employee_advance'),
        action: 'employee_advance_created_from_timesheet',
        entityType: 'employee_advance',
        entityId: advanceRow.id,
        createdAt: new Date().toISOString(),
        userId: advanceRow.createdBy,
        afterSnapshot: advanceRow,
      });
    });
    await PentagonDB.load({ force: true });
    renderTimesheet();
    showToast('تمت إضافة السلفة الرسمية وربطها بقيد مالي.', 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'تعذرت إضافة السلفة الرسمية.', 'error');
  }
};

function openTimesheetOfficialAdvanceEditForm(row) {
  const settlementNote = getTimesheetAdvanceSettlementNote(row);
  const html = `
    <div class="timesheet-advance-form timesheet-advance-edit-form">
      <label>
        <span>مبلغ السلفة الرسمية</span>
        <input type="number" id="tsAdvanceEditAmount" class="form-input" min="1" step="1" value="${escapeHtml(String(Math.round(asMoney(row.amount))))}">
      </label>
      <label>
        <span>تاريخ السلفة</span>
        <input type="date" id="tsAdvanceEditDate" class="form-input" value="${escapeHtml(normalizeTimesheetAdvanceDateInput(row.date) || todayISO())}">
      </label>
      <label>
        <span>بيان السلفة</span>
        <input type="text" id="tsAdvanceEditDescription" class="form-input" value="${escapeHtml(row.description || row.advanceTypeRaw || 'سلفة رسمية')}">
      </label>
      <div class="timesheet-advance-form-note">
        عند تغيير التاريخ سيتم نقل السلفة إلى شهر التاريخ الجديد، وإعادة ربط القيد المالي بهذا التاريخ.
      </div>
      ${settlementNote ? `<div class="timesheet-advance-form-note">${escapeHtml(settlementNote)}</div>` : ''}
    </div>
  `;
  return showOmniModal('تعديل السلفة الرسمية', html, (bodyEl) => {
    const amountRaw = bodyEl.querySelector('#tsAdvanceEditAmount')?.value || '';
    const dateRaw = bodyEl.querySelector('#tsAdvanceEditDate')?.value || '';
    const description = bodyEl.querySelector('#tsAdvanceEditDescription')?.value?.trim() || '';
    const amount = asMoney(String(amountRaw).replace(/,/g, ''));
    if (amount <= 0) {
      showToast('مبلغ السلفة يجب أن يكون أكبر من صفر.', 'warning');
      return false;
    }
    const nextDate = normalizeTimesheetAdvanceDateInput(dateRaw);
    if (!nextDate) {
      showToast('أدخل تاريخ السلفة بصيغة صحيحة.', 'warning');
      return false;
    }
    return { amount, nextDate, description };
  }, (bodyEl) => {
    bodyEl.querySelector('#tsAdvanceEditAmount')?.focus();
    bodyEl.querySelector('#tsAdvanceEditAmount')?.select?.();
  });
}

window.editTimesheetOfficialAdvance = async function(advanceId) {
  const db = window.PentagonDB ? await PentagonDB.load() : null;
  const row = db?.employee_advances?.find(item => item.id === advanceId);
  if (!row) {
    showToast('السلفة غير موجودة.', 'warning');
    return;
  }
  const payload = await openTimesheetOfficialAdvanceEditForm(row);
  if (!payload) return;
  const { amount, nextDate, description } = payload;
  const previousDate = normalizeTimesheetAdvanceDateInput(row.date) || row.date || '';
  const settlementNote = buildTimesheetAdvanceSettlementNote(previousDate, nextDate);
  try {
    await cancelTimesheetOfficialAdvanceMoves(row, settlementNote || 'تعديل سلفة رسمية من التايم شيت');
    const nextRow = {
      ...row,
      date: nextDate,
      period: nextDate.slice(0, 7),
      amount,
      description: description || row.description || 'سلفة رسمية',
      moveId: '',
      accountMoveId: '',
    };
    const move = await postTimesheetOfficialAdvanceMove(nextRow);
    await PentagonDB.mutate(mdb => {
      ensurePayrollCollections(mdb);
      const saved = mdb.employee_advances.find(item => item.id === advanceId);
      if (saved) {
        saved.date = nextDate;
        saved.period = nextDate.slice(0, 7);
        saved.amount = amount;
        saved.description = nextRow.description;
        saved.moveId = move?.id || '';
        saved.accountMoveId = move?.id || '';
        saved.salarySettlementNote = settlementNote || saved.salarySettlementNote || '';
        if (settlementNote) {
          saved.reviewFlags = Array.isArray(saved.reviewFlags) ? saved.reviewFlags : [];
          saved.reviewFlags.push({
            type: 'salary_settlement_date_change',
            note: settlementNote,
            fromDate: previousDate,
            toDate: nextDate,
            createdAt: new Date().toISOString(),
          });
        }
        saved.updatedAt = new Date().toISOString();
        saved.updatedBy = window.PentagonAuth?.getCurrentUser?.()?.id || 'system';
        syncTimesheetAdvanceSourceRows(mdb, saved, { ...nextRow, moveId: move?.id || '', accountMoveId: move?.id || '' }, settlementNote);
      }
      mdb.audit_log.push({
        id: makeId('audit_employee_advance'),
        action: 'employee_advance_updated_from_timesheet',
        entityType: 'employee_advance',
        entityId: advanceId,
        createdAt: new Date().toISOString(),
        userId: window.PentagonAuth?.getCurrentUser?.()?.id || 'system',
        reason: settlementNote || 'تعديل سلفة رسمية من التايم شيت',
        beforeSnapshot: row,
        afterSnapshot: saved || nextRow,
      });
    });
    closeOmniModal();
    await PentagonDB.load({ force: true });
    renderTimesheet();
    showToast('تم تعديل السلفة الرسمية وتحديث القيد المالي.', 'success');
  } catch (err) {
    console.error(err);
    showToast(err.message || 'تعذر تعديل السلفة الرسمية.', 'error');
  }
};

function buildEmployeePayrollClosingSnapshot(db, emp, year, month, payrollPeriodId) {
  const cfg = { ...getConfig(), year: Number(year), month: Number(month), nominalSalary: getEmployeeNominalSalary(emp, getConfig().nominalSalary) };
  const summary = getEmployeeMonthlyPayrollSummary(emp, cfg);
  const result = summary?.result || {};
  const officialAdvances = getOfficialAdvancesForEmployeePeriod(db, emp, year, month);
  const advanceSettlementAmount = officialAdvances.reduce((sum, item) => sum + asMoney(item.amount), 0);
  const netAccruedSalary = Math.round(result.salaryDue || result.finalSalary || 0);
  // emp.prevAdvance: positive = company owes employee, negative = employee owes company.
  const previousEmployeeDebt = Math.max(0, -asMoney(emp.prevAdvance));
  const previousCompanyPayable = Math.max(0, asMoney(emp.prevAdvance));
  const netPayableAfterAdvanceSettlement = netAccruedSalary - advanceSettlementAmount - previousEmployeeDebt + previousCompanyPayable;
  return {
    id: makeId('payclose'),
    payrollPeriodId,
    employeeId: emp.id || '',
    employeeNameSnapshot: emp.name || '',
    baseSalarySnapshot: getEmployeeNominalSalary(emp, cfg.nominalSalary),
    attendanceDays: result.attendanceDays || 0,
    absenceDays: result.absentDays || 0,
    fridayWorkDays: result.fridayWorkedDays || 0,
    overtimeHours: result.totalOvertime || 0,
    lateMinutes: Math.round((result.totalLatenessHours || 0) * 60),
    grossSalary: Math.round(result.totalEarnings || 0),
    salaryDeductions: Math.round(result.salaryDueDeductions || 0),
    bonuses: Math.round(result.totalBonus || result.bonus || 0),
    penalties: Math.round((result.totalPenalty || result.penalty || 0) + (result.automaticPenalties || 0)),
    damageDeductions: Math.round(result.totalDamage || result.damage || 0),
    currentPeriodAdvances: advanceSettlementAmount,
    legacyTimesheetAdvancesSnapshot: Math.round(result.currentAdvance || 0),
    previousEmployeeDebt,
    previousCompanyPayable,
    netAccruedSalary,
    advanceSettlementAmount,
    netPayableAfterAdvanceSettlement,
    paidAmount: 0,
    remainingAmount: netPayableAfterAdvanceSettlement,
    balanceDirection: netPayableAfterAdvanceSettlement > 0 ? 'company_owes_employee' : netPayableAfterAdvanceSettlement < 0 ? 'employee_owes_company' : 'settled',
    status: 'calculated',
    lockedSnapshotJson: JSON.stringify({ employee: emp, cfg, summary, officialAdvances }, null, 2),
    accrualMoveId: '',
    advanceSettlementMoveId: '',
    settlementMoveIds: [],
    createdAt: new Date().toISOString(),
    approvedAt: '',
    postedAt: '',
  };
}

async function calculatePayrollPeriod(year, month) {
  const db = window.PentagonDB ? await PentagonDB.load() : { employee_advances: [] };
  ensurePayrollCollections(db);
  const period = payrollPeriodKey(year, month);
  const closings = employees
    .filter(emp => recordsForMonth(emp, Number(year), Number(month)).length)
    .map(emp => buildEmployeePayrollClosingSnapshot(db, emp, Number(year), Number(month), `period_${period}`));
  return {
    period,
    employeeCount: closings.length,
    totalAccrued: closings.reduce((sum, row) => sum + asMoney(row.netAccruedSalary), 0),
    totalAdvances: closings.reduce((sum, row) => sum + asMoney(row.advanceSettlementAmount), 0),
    totalPayableAfterAdvances: closings.reduce((sum, row) => sum + asMoney(row.netPayableAfterAdvanceSettlement), 0),
    closings,
  };
}

async function closePayrollPeriod(year, month, options = {}) {
  if (!window.PentagonDB) throw new Error('PentagonDB غير متاح');
  const periodKey = payrollPeriodKey(year, month);
  const preview = await calculatePayrollPeriod(year, month);
  if (options.dryRun) return preview;
  let savedPeriod;
  await PentagonDB.mutate(db => {
    ensurePayrollCollections(db);
    let period = db.payroll_periods.find(item => Number(item.year) === Number(year) && Number(item.month) === Number(month));
    if (period && ['closed', 'posted', 'locked'].includes(period.status)) throw new Error(`فترة الرواتب ${periodKey} مغلقة مسبقاً`);
    if (!period) {
      period = {
        id: makeId('payperiod'),
        year: Number(year),
        month: Number(month),
        startDate: `${periodKey}-01`,
        endDate: new Date(Number(year), Number(month), 0).toISOString().slice(0, 10),
        status: 'closed',
        source: 'payroll_engine',
        closedAt: new Date().toISOString(),
        closedBy: window.PentagonAuth?.getCurrentUser?.()?.id || 'system',
        postedMoveId: '',
        advanceSettlementMoveId: '',
        notes: options.notes || '',
      };
      db.payroll_periods.push(period);
    } else {
      period.status = 'closed';
      period.closedAt = new Date().toISOString();
      period.closedBy = window.PentagonAuth?.getCurrentUser?.()?.id || 'system';
    }
    db.employee_payroll_closings = db.employee_payroll_closings.filter(row => row.payrollPeriodId !== period.id);
    preview.closings.forEach(row => {
      row.payrollPeriodId = period.id;
      row.status = 'approved';
      row.approvedAt = new Date().toISOString();
      db.employee_payroll_closings.push(row);
    });
    db.audit_log.push({
      id: makeId('audit_payroll_close'),
      action: 'payroll_period_closed',
      entityType: 'payroll_period',
      entityId: period.id,
      createdAt: new Date().toISOString(),
      userId: period.closedBy,
      reason: options.reason || 'Payroll period closing',
      afterSnapshot: { period: periodKey, employeeCount: preview.employeeCount, totalAccrued: preview.totalAccrued, totalAdvances: preview.totalAdvances },
    });
    savedPeriod = period;
  });
  return { ...preview, payrollPeriod: savedPeriod };
}

async function postPayrollAccrual(payrollPeriodId) {
  return postPayrollAccrualInner(payrollPeriodId);
}

async function postPayrollAccrualInner(payrollPeriodId) {
  if (!window.PentagonDB || !window.FinanceService) throw new Error('FinanceService/PentagonDB غير متاح');
  const db = await PentagonDB.load();
  ensurePayrollCollections(db);
  const period = db.payroll_periods.find(item => item.id === payrollPeriodId);
  if (!period) throw new Error('فترة الرواتب غير موجودة');
  if (period.status === 'posted' && period.postedMoveId) return { alreadyPosted: true, period };
  const closings = db.employee_payroll_closings.filter(row => row.payrollPeriodId === payrollPeriodId);
  const totalAccrued = closings.reduce((sum, row) => sum + asMoney(row.netAccruedSalary), 0);
  const totalAdvances = closings.reduce((sum, row) => sum + asMoney(row.advanceSettlementAmount), 0);
  // Idempotency: two layers now protect this posting.
  // (1) Server-backed lock (Production Hardening Final Lock Sprint,
  //     2026-07-04): withOperationLock acquires a real DB-row lock keyed by
  //     `payroll/accrual/{periodId}` / `payroll/advance-settlement/{periodId}`
  //     BEFORE either move is created — this is what actually closes the
  //     cross-tab/cross-device race (see withOperationLock's own comment).
  // (2) The existing-move-by-origin lookup below (origin regardless of
  //     state — draft OR posted) is the fallback idempotency check used when
  //     the lock reports 'reused_existing' (a prior attempt already
  //     completed): it finds the already-posted move instead of creating a
  //     duplicate.
  const origin = `payroll/accrual/${period.year}-${String(period.month).padStart(2, '0')}`;
  let accrualMove = null;
  if (totalAccrued > 0) {
    accrualMove = await withOperationLock(`payroll/accrual/${payrollPeriodId}`, 'payroll_accrual', async () => {
      const existingAccrual = (await PentagonDB.load()).account_moves?.find(m => m.origin === origin && m.state !== 'cancel');
      if (existingAccrual && existingAccrual.state === 'posted') {
        return existingAccrual;
      } else if (existingAccrual && existingAccrual.state === 'draft') {
        return FinanceService.postMove(existingAccrual.id, { skip_backup: true });
      }
      return FinanceService.createMove({
        journal_id: 'j_payroll',
        move_type: 'entry',
        date: period.endDate,
        origin,
        sourceType: 'payroll_accrual',
        sourceCanonicalKey: `payroll/accrual/${payrollPeriodId}`,
        line_ids: [
          { account_id: 'expense_payroll', debit: totalAccrued, credit: 0, label: `استحقاق رواتب ${period.month}/${period.year}` },
          { account_id: 'accrued_payroll', debit: 0, credit: totalAccrued, label: `رواتب مستحقة ${period.month}/${period.year}` },
        ],
        skip_backup: true,
      }).then(move => FinanceService.postMove(move.id, { skip_backup: true }));
    });
  }
  const advanceOrigin = `payroll/advance-settlement/${period.year}-${String(period.month).padStart(2, '0')}`;
  let advanceMove = null;
  if (totalAdvances > 0) {
    advanceMove = await withOperationLock(`payroll/advance-settlement/${payrollPeriodId}`, 'payroll_advance_settlement', async () => {
      const existingAdvance = (await PentagonDB.load()).account_moves?.find(m => m.origin === advanceOrigin && m.state !== 'cancel');
      if (existingAdvance && existingAdvance.state === 'posted') {
        return existingAdvance;
      } else if (existingAdvance && existingAdvance.state === 'draft') {
        return FinanceService.postMove(existingAdvance.id, { skip_backup: true });
      }
      return FinanceService.createMove({
        journal_id: 'j_payroll',
        move_type: 'entry',
        date: period.endDate,
        origin: advanceOrigin,
        sourceType: 'payroll_advance_settlement',
        sourceCanonicalKey: `payroll/advance-settlement/${payrollPeriodId}`,
        line_ids: [
          { account_id: 'accrued_payroll', debit: totalAdvances, credit: 0, label: `تسوية سلف الرواتب ${period.month}/${period.year}` },
          { account_id: 'employee_advances', debit: 0, credit: totalAdvances, label: `إقفال سلف الموظفين ${period.month}/${period.year}` },
        ],
        skip_backup: true,
      }).then(move => FinanceService.postMove(move.id, { skip_backup: true }));
    });
  }
  await PentagonDB.mutate(mdb => {
    ensurePayrollCollections(mdb);
    const savedPeriod = mdb.payroll_periods.find(item => item.id === payrollPeriodId);
    if (savedPeriod) {
      savedPeriod.status = 'posted';
      savedPeriod.postedMoveId = accrualMove?.id || '';
      savedPeriod.advanceSettlementMoveId = advanceMove?.id || '';
      savedPeriod.postedAt = new Date().toISOString();
    }
    mdb.employee_payroll_closings.filter(row => row.payrollPeriodId === payrollPeriodId).forEach(row => {
      row.status = 'posted';
      row.accrualMoveId = accrualMove?.id || '';
      row.advanceSettlementMoveId = advanceMove?.id || '';
      row.postedAt = new Date().toISOString();
    });
  });
  return { periodId: payrollPeriodId, accrualMove, advanceMove, totalAccrued, totalAdvances };
}

function findPayrollClosingForEmployee(db, employeeId, year, month) {
  ensurePayrollCollections(db);
  const period = db.payroll_periods.find(item => Number(item.year) === Number(year) && Number(item.month) === Number(month) && ['closed', 'posted', 'locked'].includes(item.status));
  if (!period) return null;
  return db.employee_payroll_closings.find(row => row.payrollPeriodId === period.id && row.employeeId === employeeId) || null;
}

function isPayrollPeriodClosedForRecord(rec) {
  const db = window.PentagonDB?.getCached?.() || window.PentagonDB?.cache || {};
  ensurePayrollCollections(db);
  return (db.payroll_periods || []).some(period => (
    Number(period.year) === Number(rec.year)
    && Number(period.month) === Number(rec.month)
    && ['closed', 'posted', 'locked'].includes(period.status)
  ));
}

async function settlePayrollPayment(closingId, amount, cashAccountId = 'cash_workshop') {
  return settlePayrollPaymentInner(closingId, amount, cashAccountId);
}

async function settlePayrollPaymentInner(closingId, amount, cashAccountId = 'cash_workshop') {
  if (!window.PentagonDB || !window.FinanceService) throw new Error('FinanceService/PentagonDB غير متاح');
  amount = asMoney(amount);
  if (amount <= 0) throw new Error('مبلغ الدفع يجب أن يكون أكبر من صفر');
  const db = await PentagonDB.load();
  ensurePayrollCollections(db);
  const closing = db.employee_payroll_closings.find(row => row.id === closingId);
  if (!closing) throw new Error('إقفال راتب الموظف غير موجود');
  const period = db.payroll_periods.find(row => row.id === closing.payrollPeriodId);
  if (!period || period.status !== 'posted') throw new Error('يجب ترحيل استحقاق الرواتب قبل الدفع');
  const remaining = asMoney(closing.remainingAmount);

  // Fixed, deterministic canonical key — NEVER a random id — so retries,
  // duplicate clicks, and cross-tab/device attempts for the exact same
  // payment (same employee closing, same amount, same date) always resolve
  // to the same key (Production Hardening Final Lock Sprint, 2026-07-04).
  const paymentDate = todayISO();
  const canonicalKey = `payroll/payment/${closingId}/${paymentDate}/${amount}`;

  // Idempotency check #1 (in addition to the server-backed lock below): if a
  // payment already exists for this exact closing+amount+date, return it
  // instead of creating a second one — covers the "same key after a page
  // refresh" case (test 4), where there is no in-flight lock to reuse.
  const existingPayment = (db.payroll_payments || []).find(p => (
    p.employeePayrollClosingId === closingId && asMoney(p.amount) === amount && p.paymentDate === paymentDate && p.status !== 'voided'
  ));
  if (existingPayment) {
    const existingMove = (db.account_moves || []).find(m => m.id === existingPayment.moveId);
    return { payment: existingPayment, move: existingMove || null, reused: true };
  }

  if (amount > Math.max(0, remaining)) throw new Error('مبلغ الدفع أكبر من الرصيد المتبقي للموظف');

  return withOperationLock(canonicalKey, 'payroll_payment', async () => {
    // Re-check after acquiring the lock (and on the 'reused_existing' retry
    // path) — another tab/device may have completed this exact payment while
    // we were computing the above.
    const freshDb = await PentagonDB.load();
    const raceWinner = (freshDb.payroll_payments || []).find(p => (
      p.employeePayrollClosingId === closingId && asMoney(p.amount) === amount && p.paymentDate === paymentDate && p.status !== 'voided'
    ));
    if (raceWinner) {
      const raceMove = (freshDb.account_moves || []).find(m => m.id === raceWinner.moveId);
      return { payment: raceWinner, move: raceMove || null, reused: true };
    }

    // Covers the "crashed after the move posted but before the payment
    // record was linked" case (a move with this exact sourceCanonicalKey
    // already exists in account_moves, the source of truth, even though no
    // payroll_payments row references it yet): reuse that move, create the
    // missing payment record retroactively instead of posting a second move.
    const existingMoveForKey = (freshDb.account_moves || []).find(m => m.sourceCanonicalKey === canonicalKey && m.state !== 'cancel');

    const payment = {
      id: makeId('payrollpay'),
      payrollPeriodId: period.id,
      employeePayrollClosingId: closing.id,
      employeeId: closing.employeeId,
      paymentDate,
      amount,
      cashAccountId,
      method: cashAccountId === 'cash_workshop' ? 'cash' : 'bank',
      financeTransactionId: '',
      moveId: '',
      sourceCanonicalKey: canonicalKey,
      createdBy: window.PentagonAuth?.getCurrentUser?.()?.id || 'system',
      notes: existingMoveForKey ? 'linked to a move created by a prior interrupted attempt (recovered, not duplicated)' : '',
    };
    const move = existingMoveForKey || await FinanceService.createMove({
      journal_id: 'j_bank',
      move_type: 'entry',
      date: payment.paymentDate,
      partner_id: closing.employeeId,
      origin: canonicalKey,
      sourceType: 'payroll_payment',
      sourceCanonicalKey: canonicalKey,
      line_ids: [
        { account_id: 'accrued_payroll', debit: amount, credit: 0, label: `دفع راتب ${closing.employeeNameSnapshot}`, partner_id: closing.employeeId },
        { account_id: cashAccountId, debit: 0, credit: amount, label: `دفع راتب ${closing.employeeNameSnapshot}`, partner_id: closing.employeeId },
      ],
      skip_backup: true,
    }).then(draft => FinanceService.postMove(draft.id, { skip_backup: true }));
    payment.moveId = move.id;
    await PentagonDB.mutate(mdb => {
      ensurePayrollCollections(mdb);
      const saved = mdb.employee_payroll_closings.find(row => row.id === closing.id);
      if (saved) {
        saved.paidAmount = asMoney(saved.paidAmount) + amount;
        saved.remainingAmount = asMoney(saved.netPayableAfterAdvanceSettlement) - asMoney(saved.paidAmount);
        saved.status = saved.remainingAmount <= 0 ? 'paid' : 'partially_paid';
        saved.balanceDirection = saved.remainingAmount > 0 ? 'company_owes_employee' : saved.remainingAmount < 0 ? 'employee_owes_company' : 'settled';
        if (!Array.isArray(saved.settlementMoveIds)) saved.settlementMoveIds = [];
        saved.settlementMoveIds.push(move.id);
      }
      mdb.payroll_payments.push(payment);
      mdb.audit_log.push({
        id: makeId('audit_payroll_payment'),
        action: 'payroll_payment_settled',
        entityType: 'employee_payroll_closing',
        entityId: closing.id,
        createdAt: new Date().toISOString(),
        userId: payment.createdBy,
        reason: 'Payroll payment settlement',
        afterSnapshot: payment,
      });
    });
    return { payment, move };
  });
}

async function createPayrollAdjustment(closingId, adjustmentType, amount, reason) {
  if (!window.PentagonDB || !window.FinanceService) throw new Error('FinanceService/PentagonDB غير متاح');
  if (amount <= 0) throw new Error('المبلغ يجب أن يكون أكبر من صفر');
  if (!['deduction', 'bonus'].includes(adjustmentType)) throw new Error('نوع التسوية غير صالح');

  let move = null;
  await PentagonDB.mutate(async db => {
    ensurePayrollCollections(db);
    const closing = db.employee_payroll_closings.find(row => row.id === closingId);
    if (!closing) throw new Error('سجل الرواتب غير موجود');
    const period = db.payroll_periods.find(p => p.id === closing.payrollPeriodId);
    if (!period || period.status !== 'posted') throw new Error('لا يمكن إجراء تسوية إلا بعد ترحيل الفترة');

    const adjId = makeId('payadj');
    const moveOrigin = `payroll/adjustment/${adjId}`;
    const date = new Date().toISOString().slice(0, 10);

    // Create accounting move
    move = await FinanceService.createMove({
      journal_id: 'j_payroll',
      move_type: 'entry',
      date,
      origin: moveOrigin,
      line_ids: adjustmentType === 'deduction' ? [
        { account_id: 'accrued_payroll', debit: amount, credit: 0, label: `تسوية استقطاع: ${reason}` },
        { account_id: 'expense_payroll', debit: 0, credit: amount, label: `تخفيض مصروف رواتب: ${reason}` }
      ] : [
        { account_id: 'expense_payroll', debit: amount, credit: 0, label: `تسوية مكافأة: ${reason}` },
        { account_id: 'accrued_payroll', debit: 0, credit: amount, label: `زيادة التزام رواتب: ${reason}` }
      ],
      skip_backup: true,
    }).then(m => FinanceService.postMove(m.id, { skip_backup: true }));

    const adj = {
      id: adjId,
      closingId,
      payrollPeriodId: closing.payrollPeriodId,
      employeeId: closing.employeeId,
      type: adjustmentType,
      amount,
      reason,
      moveId: move.id,
      // status lifecycle: 'posted' here since this function creates AND posts
      // the move atomically (no separate draft/approval staging exists yet);
      // flips to 'cancelled' if the underlying move is later reversed by
      // reopenPayrollPeriod. ('draft'/'approved' are reserved for a future
      // staged-approval workflow, not reachable today.)
      status: 'posted',
      createdAt: new Date().toISOString(),
      createdBy: window.PentagonAuth?.getCurrentUser?.()?.id || 'system',
    };
    db.payroll_adjustments.push(adj);

    // Update closing balance
    if (adjustmentType === 'deduction') {
      closing.netPayableAfterAdvanceSettlement -= amount;
      closing.remainingAmount -= amount;
    } else {
      closing.netPayableAfterAdvanceSettlement += amount;
      closing.remainingAmount += amount;
    }

    db.audit_log.push({
      id: makeId('audit_payroll_adj'),
      action: 'payroll_adjustment_created',
      entityType: 'payroll_closing',
      entityId: closingId,
      createdAt: new Date().toISOString(),
      reason,
      afterSnapshot: { adjustmentId: adjId, amount, type: adjustmentType }
    });
  });
  return move;
}

async function reopenPayrollPeriod(payrollPeriodId, reason) {
  if (!window.PentagonDB || !window.FinanceService) throw new Error('PentagonDB/FinanceService غير متاح');
  if (!reason || !reason.trim()) throw new Error('يجب تحديد سبب إعادة فتح الفترة');
  // Admin-only + mandatory reason (audit fix 2026-07-04): reopening a posted
  // payroll period reverses live financial postings, so it is gated the same
  // way as other critical/approval-required HR-payroll actions (see
  // services/permissionService.js ACTION_METADATA['hr.payroll.reopen_period']).
  if (window.PermissionService) {
    window.PermissionService.requireAction('hr.payroll.reopen_period', { page: 'employees', periodId: payrollPeriodId });
  }

  const db = await PentagonDB.load();
  ensurePayrollCollections(db);
  const period = db.payroll_periods.find(item => item.id === payrollPeriodId);
  if (!period) throw new Error('فترة الرواتب غير موجودة');

  if (!['closed', 'posted', 'locked'].includes(period.status)) {
    throw new Error(`لا يمكن إعادة فتح فترة بحالة ${period.status}`);
  }

  const beforeStatus = period.status;
  // Full before-snapshot for the audit trail — reopening resets closing
  // status/move-links/paid amounts in place, so without this snapshot the
  // specific move ids and paid amounts that were live before the reopen would
  // be unrecoverable from the closings/payments rows themselves afterward
  // (the moves stay in account_moves as cancelled/reversed, but the link is lost).
  const closingsBeforeSnapshot = JSON.parse(JSON.stringify(
    db.employee_payroll_closings.filter(row => row.payrollPeriodId === payrollPeriodId)
  ));
  const paymentsBeforeSnapshot = JSON.parse(JSON.stringify(
    (db.payroll_payments || []).filter(p => p.payrollPeriodId === payrollPeriodId)
  ));
  const adjustmentsBeforeSnapshot = JSON.parse(JSON.stringify(
    (db.payroll_adjustments || []).filter(a => a.payrollPeriodId === payrollPeriodId)
  ));

  const movesToCancel = [];
  if (period.postedMoveId) movesToCancel.push(period.postedMoveId);
  if (period.advanceSettlementMoveId) movesToCancel.push(period.advanceSettlementMoveId);

  const closings = db.employee_payroll_closings.filter(row => row.payrollPeriodId === payrollPeriodId);
  closings.forEach(row => {
    if (row.accrualMoveId && !movesToCancel.includes(row.accrualMoveId)) movesToCancel.push(row.accrualMoveId);
    if (row.advanceSettlementMoveId && !movesToCancel.includes(row.advanceSettlementMoveId)) movesToCancel.push(row.advanceSettlementMoveId);
    if (Array.isArray(row.settlementMoveIds)) {
      row.settlementMoveIds.forEach(mId => {
        if (mId && !movesToCancel.includes(mId)) movesToCancel.push(mId);
      });
    }
  });
  // payroll_adjustments posted for this period must also be reversed —
  // otherwise their moves stay live in account_moves after the period is
  // reopened, and their status never reflects that they no longer apply.
  (db.payroll_adjustments || []).filter(a => a.payrollPeriodId === payrollPeriodId && a.moveId).forEach(a => {
    if (!movesToCancel.includes(a.moveId)) movesToCancel.push(a.moveId);
  });

  // moveId -> reversalMoveId, for a complete "original move / reversal move"
  // audit trail (who reopened, when, why, which move, which reversal).
  const reversalByMoveId = {};
  for (const moveId of movesToCancel) {
    try {
      const result = await FinanceService.cancelMove(moveId, { skip_backup: true, reason: `إعادة فتح فترة الرواتب: ${reason}` });
      reversalByMoveId[moveId] = result?.reversal?.id || '';
    } catch (e) {
      console.warn(`تعذر إلغاء القيد ${moveId} أثناء إعادة فتح الفترة:`, e);
      reversalByMoveId[moveId] = null; // cancellation failed (e.g. already cancelled) — recorded, not silently dropped
    }
  }

  // Reset the server-backed operation locks for this period's accrual/advance
  // moves (Production Hardening Final Lock Sprint, 2026-07-04). Without this,
  // a 'completed' lock still pointing at the now-cancelled move would make
  // the NEXT genuine postPayrollAccrual() call believe it can just "reuse"
  // that move — but it no longer applies (state is 'cancel'). Deleting the
  // lock rows lets the next posting attempt acquire fresh ones.
  const lockKeysToReset = [
    `payroll/accrual/${payrollPeriodId}`,
    `payroll/advance-settlement/${payrollPeriodId}`,
  ];
  for (const lockKey of lockKeysToReset) {
    try {
      await fetch('/api/operation-lock/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lockKey }),
      });
    } catch (e) {
      console.warn(`تعذر تصفير قفل العملية ${lockKey}:`, e);
    }
  }

  await PentagonDB.mutate(mdb => {
    ensurePayrollCollections(mdb);
    const savedPeriod = mdb.payroll_periods.find(item => item.id === payrollPeriodId);
    if (savedPeriod) {
      savedPeriod.status = 'draft';
      savedPeriod.postedMoveId = '';
      savedPeriod.advanceSettlementMoveId = '';
    }

    mdb.employee_payroll_closings.filter(row => row.payrollPeriodId === payrollPeriodId).forEach(row => {
      row.status = 'calculated';
      row.accrualMoveId = '';
      row.advanceSettlementMoveId = '';
      row.settlementMoveIds = [];
      row.paidAmount = 0;
      row.remainingAmount = asMoney(row.netPayableAfterAdvanceSettlement);
      row.balanceDirection = row.remainingAmount > 0 ? 'company_owes_employee' : row.remainingAmount < 0 ? 'employee_owes_company' : 'settled';
    });

    // Never hard-delete payroll_payments: the underlying account_move was
    // already reversed above via FinanceService.cancelMove (a dated reversal
    // entry, not a deletion) — the payment record itself must survive as
    // voided so the "who got paid what and when, and why was it undone" trail
    // stays intact (audit fix 2026-07-04; this used to filter the rows out
    // entirely).
    mdb.payroll_payments.filter(p => p.payrollPeriodId === payrollPeriodId).forEach(p => {
      p.status = 'voided';
      p.voidedAt = new Date().toISOString();
      p.voidedReason = reason.trim();
    });

    // Same non-destructive treatment for adjustments: never delete, flip to
    // 'cancelled' now that their move has been reversed above.
    mdb.payroll_adjustments.filter(a => a.payrollPeriodId === payrollPeriodId).forEach(a => {
      a.status = 'cancelled';
      a.cancelledAt = new Date().toISOString();
      a.cancelledReason = reason.trim();
    });

    const currentUser = window.PentagonAuth?.getCurrentUser?.() || {};
    mdb.audit_log.push({
      id: makeId('audit_payroll_reopen'),
      action: 'payroll_period_reopened',
      entityType: 'payroll_period',
      entityId: payrollPeriodId,
      createdAt: new Date().toISOString(),
      userId: currentUser.id || 'system',
      userName: currentUser.name || currentUser.displayName || 'النظام',
      reason: reason.trim(),
      beforeSnapshot: { closings: closingsBeforeSnapshot, payments: paymentsBeforeSnapshot, adjustments: adjustmentsBeforeSnapshot, cancelledMoveIds: movesToCancel },
      afterSnapshot: { period: `${period.year}-${String(period.month).padStart(2, '0')}`, beforeStatus, reversals: reversalByMoveId },
    });
  });

  return { success: true };
}

function getEmployeeDailyFinancialSummary(emp, rec, cfg) {
  const calc = getDailyCalc(rec, emp);
  const penalties = (calc.late || 0) + (calc.earlyDeduction || 0) + (calc.deduction || 0) + (rec.penalty || 0) + (rec.damage || 0);
  const advances = rec.advance || 0;
  const payable = (calc.dayPay || 0) + (calc.allowance || 0) + (calc.otValue || 0) + (rec.bonus || 0);
  const netDue = payable - penalties;
  return {
    calc,
    payable,
    penalties,
    advances,
    netDue,
    netAfterAdvance: calc.total || 0,
    net: netDue
  };
}

// ─── Page Navigation ───
const navDomains = [
  { key: 'core', label: 'النظام الأساسي', icon: 'fa-gauge-high', groups: ['core_daily', 'core_records'] },
  { key: 'ops', label: 'التشغيل والورشة', icon: 'fa-industry', groups: ['ops_control', 'ops_production', 'ops_frontline'] },
  { key: 'finance', label: 'المالية', icon: 'fa-building-columns', groups: ['finance_accounts'] },
  { key: 'commercial', label: 'العملاء والقطاعات', icon: 'fa-handshake', groups: ['commercial_sales', 'commercial_verticals'] },
  { key: 'resources', label: 'الموارد والإمداد', icon: 'fa-people-carry-box', groups: ['resources_org', 'resources_supply'] },
  { key: 'intelligence', label: 'الذكاء والتحكم', icon: 'fa-brain', groups: ['intelligence_core', 'intelligence_ai'] },
  { key: 'admin', label: 'الإدارة والنظام', icon: 'fa-screwdriver-wrench', groups: ['admin_org'] }
];

const navGroupMeta = {
  core_daily: { label: 'اليومي والموظفون', domain: 'core', icon: 'fa-calendar-check' },
  core_records: { label: 'المدخلات والمخرجات', domain: 'core', icon: 'fa-folder-open' },
  ops_control: { label: 'القيادة وسير العمل', domain: 'ops', icon: 'fa-diagram-project' },
  ops_production: { label: 'الإنتاج والمواد والجودة', domain: 'ops', icon: 'fa-gears' },
  ops_frontline: { label: 'واجهات التشغيل', domain: 'ops', icon: 'fa-display' },
  finance_accounts: { label: 'الحسابات والخزينة', domain: 'finance', icon: 'fa-file-invoice-dollar' },
  commercial_sales: { label: 'المبيعات وخدمة العملاء', domain: 'commercial', icon: 'fa-cart-shopping' },
  commercial_verticals: { label: 'قطاعات الأعمال', domain: 'commercial', icon: 'fa-store' },
  resources_org: { label: 'الموارد والوثائق', domain: 'resources', icon: 'fa-users-gear' },
  resources_supply: { label: 'الإمداد والمشاريع', domain: 'resources', icon: 'fa-truck-fast' },
  intelligence_core: { label: 'التحليلات والأتمتة', domain: 'intelligence', icon: 'fa-chart-line' },
  intelligence_ai: { label: 'مصنع الذكاء', domain: 'intelligence', icon: 'fa-robot' },
  admin_org: { label: 'الحوكمة والإعدادات', domain: 'admin', icon: 'fa-shield-halved' }
};

const navGroupPages = {
  core_daily: ['calculator', 'timesheet', 'calendar', 'employees', 'wfl_home', 'employee_mobile'],
  core_records: ['import', 'receipt', 'report', 'help_manual'],
  ops_control: ['command_center', 'kanban', 'task_manager', 'workflow', 'sop'],
  ops_production: ['op_packs', 'mrp', 'work_orders', 'machines', 'inventory', 'equipment', 'qc_center'],
  ops_frontline: ['workshop_tv', 'kiosk'],
  finance_accounts: ['finance', 'cashbox', 'workshop_ledger', 'expenses', 'income', 'customers', 'banking', 'ar_ap', 'budgeting', 'tax_compliance'],
  commercial_sales: ['sales', 'pos', 'customer_portal', 'subscriptions', 'appointments', 'loyalty', 'events', 'marketing', 'helpdesk', 'warranty'],
  commercial_verticals: ['retail', 'pharmacy', 'clinic', 'restaurant', 'real-estate', 'hotel', 'rental', 'field_service'],
  resources_org: ['people_ops', 'fleet', 'assets', 'documents', 'esign', 'knowledge', 'surveys', 'visitors'],
  resources_supply: ['procurement', 'projects', 'approvals', 'contracts', 'logistics', 'supplier_portal'],
  intelligence_core: ['analytics', 'nl_reports', 'intelligence', 'automation', 'whatsapp', 'route_health'],
  intelligence_ai: ['scenario_planner', 'ai_queue', 'ai_factory', 'ai_tools', 'ai_status'],
  admin_org: ['multi_entity', 'employee_ui', 'vnext_platform', 'admin_panel', 'integration_hub', 'security_center', 'risk_compliance', 'data_quality', 'training_lms', 'device_center', 'deploy_ready']
};

function getNavGroupForPage(page) {
  return Object.keys(navGroupPages).find(key => navGroupPages[key].includes(page));
}

function getNavDomainForGroup(group) {
  return navGroupMeta[group]?.domain || navDomains.find(domain => domain.groups.includes(group))?.key || 'core';
}

function getNavDomainForPage(page) {
  const group = getNavGroupForPage(page);
  return group ? getNavDomainForGroup(group) : null;
}

function getStoredNavDomain() {
  let stored = null;
  try { stored = localStorage.getItem('omniNavDomain'); } catch (err) {}
  return navDomains.some(domain => domain.key === stored) ? stored : 'core';
}

function renderNavDomainTabs() {
  const host = document.getElementById('moduleDomainTabs');
  if (!host) return;
  host.innerHTML = navDomains.map(domain => {
    const count = domain.groups.reduce((sum, group) => sum + (navGroupPages[group]?.length || 0), 0);
    return `<button class="module-domain-tab" type="button" data-nav-domain="${domain.key}" onclick="setNavDomain('${domain.key}')">
      <i class="fa-solid ${domain.icon}"></i>
      <span>${domain.label}</span>
      <em>${count}</em>
    </button>`;
  }).join('');
}

function syncNavDomainVisibility() {
  const activeDomain = document.body.dataset.navDomain || getStoredNavDomain();
  document.querySelectorAll('.module-domain-tab[data-nav-domain]').forEach(btn => {
    const isActive = btn.dataset.navDomain === activeDomain;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
  document.querySelectorAll('.sidebar-nav .nav-group[data-nav-group]').forEach(group => {
    group.hidden = getNavDomainForGroup(group.dataset.navGroup) !== activeDomain;
  });
}

function setNavDomain(domainKey, persist = true) {
  const domain = navDomains.find(item => item.key === domainKey) || navDomains[0];
  document.body.dataset.navDomain = domain.key;
  if (persist) {
    try { localStorage.setItem('omniNavDomain', domain.key); } catch (err) {}
  }
  syncNavDomainVisibility();
}

function rebuildSidebarNavigation() {
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || nav.dataset.registryBuilt === '1') return;

  const buttons = {};
  nav.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    buttons[btn.dataset.page] = btn;
  });

  const pagesInRegistry = new Set(Object.values(navGroupPages).flat());
  const missingPages = Object.keys(buttons).filter(page => !pagesInRegistry.has(page));
  if (missingPages.length) {
    navGroupPages.admin_org.push(...missingPages);
  }

  nav.innerHTML = '';
  navDomains.forEach(domain => {
    domain.groups.forEach(groupKey => {
      const meta = navGroupMeta[groupKey] || { label: groupKey, icon: 'fa-layer-group' };
      const group = document.createElement('div');
      group.className = 'nav-group';
      group.dataset.navGroup = groupKey;
      group.dataset.navDomain = domain.key;
      group.innerHTML = `<button class="nav-group-toggle" type="button" onclick="toggleNavGroup('${groupKey}')">
        <span><i class="fa-solid ${meta.icon}"></i> ${meta.label}</span>
        <i class="fa-solid fa-chevron-down"></i>
      </button><div class="nav-group-body" id="navGroup-${groupKey}"></div>`;
      const body = group.querySelector('.nav-group-body');
      (navGroupPages[groupKey] || []).forEach(page => {
        if (buttons[page]) body.appendChild(buttons[page]);
      });
      if (body.children.length) nav.appendChild(group);
    });
  });

  nav.dataset.registryBuilt = '1';
  renderNavDomainTabs();
  bindSidebarNavigation();
  applyNavGroupState();
  setNavDomain(getNavDomainForPage(currentPage) || getStoredNavDomain(), false);
}

function getNavGroupState() {
  try {
    const state = JSON.parse(localStorage.getItem('omniNavGroupState') || '{}') || {};
    if (Object.prototype.hasOwnProperty.call(state, 'pentagon') && !Object.prototype.hasOwnProperty.call(state, 'octagon')) {
      state.octagon = state.pentagon;
    }
    return state;
  } catch (err) {
    return {};
  }
}

function applyNavGroupState() {
  const state = getNavGroupState();
  Object.keys(navGroupPages).forEach(group => {
    const el = document.querySelector(`[data-nav-group="${group}"]`);
    if (!el) return;
    const isOpen = state[group] !== false;
    el.classList.toggle('collapsed', !isOpen);
  });
  syncNavDomainVisibility();
}

function setNavGroupOpen(group, isOpen) {
  const state = getNavGroupState();
  state[group] = !!isOpen;
  try { localStorage.setItem('omniNavGroupState', JSON.stringify(state)); } catch (err) {}
  applyNavGroupState();
}

function toggleNavGroup(group) {
  const el = document.querySelector(`[data-nav-group="${group}"]`);
  setNavGroupOpen(group, el ? el.classList.contains('collapsed') : true);
}

function ensureNavGroupForPage(page) {
  const group = getNavGroupForPage(page);
  if (!group) return;
  setNavDomain(getNavDomainForGroup(group), true);
  setNavGroupOpen(group, true);
}

// Phase 6H password crypto utilities
async function hashPassword(password, salt) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + salt);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt() {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showPasswordPrompt(displayName) {
  const html = `
    <label style="font-size:14px; color:var(--text); display:block; margin-bottom:8px;">يرجى إدخال كلمة المرور للمستخدم: <strong>${escapeHtml(displayName)}</strong></label>
    <input type="password" id="omniPromptPassword" class="form-input" style="width:100%;" autofocus placeholder="كلمة المرور">
  `;
  return showOmniModal("تسجيل الدخول", html, (bodyEl) => {
    return bodyEl.querySelector('#omniPromptPassword').value;
  });
}

function showFirstTimePasswordSetup(displayName) {
  const html = `
    <p style="font-size:13px; color:var(--text-muted); margin: 0 0 12px 0; line-height:1.5;">هذه هي المرة الأولى التي تقوم فيها بتسجيل الدخول كـ <strong>${escapeHtml(displayName)}</strong>. يرجى إعداد كلمة مرور جديدة لتأمين الحساب.</p>
    <label style="font-size:13px; color:var(--text-muted); display:block; margin-bottom:4px;">كلمة المرور الجديدة</label>
    <input type="password" id="omniNewPassword" class="form-input" style="width:100%; margin-bottom: 12px;" placeholder="كلمة المرور الجديدة">
    <label style="font-size:13px; color:var(--text-muted); display:block; margin-bottom:4px;">تأكيد كلمة المرور</label>
    <input type="password" id="omniConfirmPassword" class="form-input" style="width:100%;" placeholder="تأكيد كلمة المرور">
  `;
  return showOmniModal("إعداد كلمة المرور لأول مرة", html, (bodyEl) => {
    const pass = bodyEl.querySelector('#omniNewPassword').value;
    const conf = bodyEl.querySelector('#omniConfirmPassword').value;
    if (!pass) {
      showToast("كلمة المرور لا يمكن أن تكون فارغة.", "warning");
      return false;
    }
    if (pass !== conf) {
      showToast("كلمات المرور غير متطابقة.", "warning");
      return false;
    }
    return pass;
  });
}

async function switchAuthUser(userId, force) {
  if (!window.PentagonAuth) return;
  const currentId = window.PentagonAuth._currentUserId;
  if (userId === currentId) return;

  // Dev Mode flag
  const devMode = window.devModeAuthSwitcher || (omni && omni.adminSettings && omni.adminSettings.devModeAuthSwitcher) || false;

  // Current user admin check
  const currentUser = window.PentagonAuth.getCurrentUser();
  const isAdmin = currentUser && Array.isArray(currentUser.groups) && currentUser.groups.includes('system.admin');

  if (!force && !devMode && !isAdmin) {
    showToast("تبديل المستخدمين متاح للمدير فقط.", "danger");
    const sel = document.getElementById('authUserSwitcher');
    if (sel) sel.value = currentId;
    return;
  }

  window.PentagonAuth.setCurrentUser(userId);
  if (typeof recordOmniHistoryEvent === 'function') {
    recordOmniHistoryEvent({
      module: 'auth',
      source: 'admin_switcher',
      action: 'admin_switcher_user_changed',
      title: 'Admin/dev user switcher used',
      actorId: currentUser?.id || 'unknown',
      actorName: currentUser?.displayName || currentUser?.name || currentUser?.id || 'unknown',
      status: 'success',
      risk: 'high',
      payload: { fromUserId: currentId, toUserId: userId, devMode: !!devMode }
    });
  }
  showToast(`تم التبديل إلى: ${window.PentagonAuth.getCurrentUser()?.name || userId}`, 'success');

  checkLoginStatus();
  enforceUIPermissions();
  updateAuthSessionModeBadge();

  const devBtn = document.getElementById('btnDevClearCache');
  if (devBtn) devBtn.style.display = userId === 'system' ? 'block' : 'none';

  // Refresh current page to apply permissions
  if (typeof currentPage !== 'undefined') {
    switchPage(currentPage);
  }
}

function refreshAuthUserSwitcher() {
  const sel = document.getElementById('authUserSwitcher');
  if (!sel) return;
  try { if (typeof ensureOmni === 'function') ensureOmni(); } catch (_) {}
  const fallbackUsers = [
    { id: 'system_admin', name: 'مدير النظام', displayName: 'مدير النظام', role: 'system_admin', roleId: 'system_admin', groups: ['system.admin'], status: 'active', is_active: true, source: 'phase6d_fallback' },
    { id: 'finance_manager', name: 'مدير المالية', displayName: 'مدير المالية', role: 'finance_manager', roleId: 'finance_manager', groups: ['finance.manager'], status: 'active', is_active: true, source: 'phase6d_fallback' },
    { id: 'workshop_manager', name: 'مدير الورشة', displayName: 'مدير الورشة', role: 'workshop_manager', roleId: 'workshop_manager', groups: ['workshop.manager'], status: 'active', is_active: true, source: 'phase6d_fallback' },
    { id: 'operator_user', name: 'مشغل الورشة', displayName: 'مشغل الورشة', role: 'operator_user', roleId: 'operator_user', groups: ['workshop.user'], status: 'active', is_active: true, source: 'phase6d_fallback' },
    { id: 'employee_user', name: 'موظف', displayName: 'موظف', role: 'employee_user', roleId: 'employee_user', groups: [], status: 'active', is_active: true, source: 'phase6d_fallback' },
    { id: 'viewer_user', name: 'مراقب قراءة', displayName: 'مراقب قراءة', role: 'viewer_user', roleId: 'viewer_user', groups: [], status: 'active', is_active: true, source: 'phase6d_fallback' }
  ];
  const currentId = window.PentagonAuth?._currentUserId || sel.value || 'system';
  const sourceUsers = (omni && Array.isArray(omni.users) && omni.users.length) ? omni.users : fallbackUsers;
  const activeUsers = sourceUsers.filter(u => u && u.is_active !== false && u.status !== 'inactive');
  const rank = id => ({ system: 0, system_admin: 1, finance_manager: 2, workshop_manager: 3, operator_user: 4, employee_user: 5, viewer_user: 6, mgr_finance: 7, user_finance: 8, mgr_workshop: 9 }[id] ?? 50);
  const sorted = [...activeUsers].sort((a, b) => {
    const ra = rank(a.id);
    const rb = rank(b.id);
    if (ra !== rb) return ra - rb;
    return String(a.id).localeCompare(String(b.id), 'en');
  });

  // 1. Sidebar Switcher
  sel.innerHTML = sorted
    .map(u => {
      const label = u.displayName || u.name || u.id;
      return `<option value="${escapeHtml(u.id)}">${escapeHtml(label)}</option>`;
    })
    .join('');
  const fallback = sorted.find(u => u.id === 'system_admin')?.id || sorted.find(u => u.id === 'system')?.id || sorted[0]?.id || 'system';
  const nextId = sorted.some(u => u.id === currentId) ? currentId : fallback;
  sel.value = nextId;

  // Disable switcher if current user is not admin and not devMode
  const currentUser = window.PentagonAuth?.getCurrentUser();
  const isAdmin = currentUser && Array.isArray(currentUser.groups) && currentUser.groups.includes('system.admin');
  const devMode = window.devModeAuthSwitcher || (omni && omni.adminSettings && omni.adminSettings.devModeAuthSwitcher) || false;
  sel.disabled = !isAdmin && !devMode;

  if (window.PentagonAuth && nextId && nextId !== window.PentagonAuth._currentUserId) {
    const stored = localStorage.getItem('octagon_user_id') || localStorage.getItem('pentagon_user_id');
    const devMode = window.devModeAuthSwitcher || (omni && omni.adminSettings && omni.adminSettings.devModeAuthSwitcher) || false;
    if (stored || devMode) {
      window.PentagonAuth.setCurrentUser(nextId);
    }
  }
  updateAuthSessionModeBadge();

  // 2. Login Overlay List
  const loginList = document.getElementById('loginUserList');
  if (loginList) {
    loginList.innerHTML = sorted.map(u => `
      <button class="btn-secondary" style="display:flex; align-items:center; gap:12px; padding:12px 20px; text-align:right; border:1px solid rgba(255,255,255,0.05); transition:all 0.2s;" onclick="performLogin('${escapeHtml(u.id)}')">
        <div style="background:var(--primary); width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white;">
          <i class="fa-solid fa-user"></i>
        </div>
        <div style="flex:1;">
          <div style="font-weight:600; font-size:14px; color:var(--text);">${escapeHtml(u.displayName || u.name || u.id)}</div>
          <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(({'system':'صلاحية كاملة','system_admin':'صلاحية كاملة','finance_manager':'إدارة المالية والحسابات','workshop_manager':'إدارة الورشة والإنتاج','operator_user':'تشغيل الورشة','employee_user':'وصول الموظف','viewer_user':'قراءة فقط','mgr_finance':'إدارة المالية','user_finance':'محاسب','mgr_workshop':'إدارة الورشة'})[u.id] || escapeHtml(u.displayName || u.name || ''))}</div>
        </div>
        <i class="fa-solid fa-chevron-left" style="font-size:10px; color:var(--text-muted);"></i>
      </button>
    `).join('');
  }
}

function getOctagonAutoLoginUserId() {
  try {
    // Opt-in only: auto-login must be explicitly enabled by a developer on their own
    // machine. Never on by default — a silent default-on admin session is a security hole.
    const optedIn = window.OCTAGON_AUTO_LOGIN === true || localStorage.getItem('octagon_auto_login_enabled') === '1';
    if (!optedIn) return '';
    const host = window.location?.hostname || '';
    const localHost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    if (!localHost) return '';
    return localStorage.getItem('octagon_auto_login_user_id') || '';
  } catch (_) {
    return '';
  }
}

function applyOctagonAutoLogin() {
  const stored = localStorage.getItem('octagon_user_id') || localStorage.getItem('pentagon_user_id');
  if (stored) return stored;
  const autoUserId = getOctagonAutoLoginUserId();
  if (!autoUserId) return '';
  try {
    if (typeof ensureOmni === 'function') ensureOmni();
    if (!omni || !Array.isArray(omni.users)) normalizeOmniUsersRolesPermissions();
    const users = Array.isArray(omni?.users) ? omni.users : [];
    // Only the explicitly configured user — no silent fallback to system_admin or
    // "first active user". If that user doesn't exist/isn't active, auto-login fails closed.
    const user = users.find(u => u && u.id === autoUserId && u.is_active !== false && u.status !== 'inactive');
    if (!user?.id) return '';
    const userId = user.id;
    localStorage.setItem('octagon_user_id', userId);
    localStorage.setItem('pentagon_user_id', userId);
    localStorage.setItem('omni_current_user_id', userId);
    if (window.PentagonAuth?.setCurrentUser) window.PentagonAuth.setCurrentUser(userId);
    window.__octagonServerSession = window.__octagonServerSession || { authenticated: false, mode: 'local-dev-auto-login' };
    return userId;
  } catch (err) {
    console.warn('Octagon auto-login skipped:', err.message || err);
    return '';
  }
}

function checkLoginStatus() {
  const overlay = document.getElementById('loginOverlay');
  const intro = document.getElementById('introScreen');
  if (!overlay) return;
  const stored = localStorage.getItem('octagon_user_id') || localStorage.getItem('pentagon_user_id') || applyOctagonAutoLogin();
  if (!stored) {
    if (intro) {
      intro.style.display = 'flex';
      overlay.style.display = 'none';
    } else {
      overlay.style.display = 'flex';
    }
    document.body.classList.add('login-required');
    try {
      if (typeof omni !== 'undefined' && omni && omni.adminSettings && omni.adminSettings.organization) {
        const org = omni.adminSettings.organization;
        const activeCo = (org.companies || []).find(c => c.id === org.activeCompanyId);
        const branchEl = document.getElementById('introBranch');
        if (branchEl && activeCo) {
          branchEl.textContent = activeCo.name || 'الرئيسي';
        }
      }
    } catch (_) {}
  } else {
    overlay.style.display = 'none';
    if (intro) intro.style.display = 'none';
    document.body.classList.remove('login-required');
  }
}

function updateAuthSessionModeBadge() {
  const group = document.querySelector('.meta-auth-group');
  if (!group) return;
  let badge = document.getElementById('authSessionModeBadge');
  if (!badge) {
    badge = document.createElement('span');
    badge.id = 'authSessionModeBadge';
    badge.title = 'Auth session mode';
    badge.style.cssText = 'font-size:11px;color:var(--text-muted);border-inline-start:1px solid rgba(255,255,255,0.12);padding-inline-start:8px;white-space:nowrap;';
    const logoutButton = group.querySelector('button[onclick*="performLogout"]');
    group.insertBefore(badge, logoutButton || null);
  }
  const session = window.__octagonServerSession || {};
  const current = window.PentagonAuth?.getCurrentUser?.() || {};
  const role = current.roleId || current.role || (Array.isArray(current.groups) ? current.groups[0] : '') || 'role';
  const mode = session.authenticated ? 'server' : 'local-dev';
  badge.textContent = `${role} | ${mode}`;
}

async function syncServerAuthSession(userId, password) {
  if (!userId || !password) return null;
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, password })
    });
    const payload = await res.json().catch(() => ({}));
    window.__octagonServerSession = payload;
    updateAuthSessionModeBadge();
    if (!res.ok && !payload.setupRequired) {
      console.warn('Server auth session bridge failed:', payload.error || res.status);
    }
    return payload;
  } catch (err) {
    console.warn('Server auth session bridge unavailable:', err.message || err);
    window.__octagonServerSession = { authenticated: false, mode: 'local-dev-fallback', error: err.message || String(err) };
    updateAuthSessionModeBadge();
    return null;
  }
}

function hideLoadingOverlay(reason = 'ready') {
  if (typeof window.hideOctagonLoadingOverlay === 'function') {
    window.hideOctagonLoadingOverlay(reason);
    return;
  }
  const overlay = document.getElementById('loadingOverlay');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.style.opacity = '0';
  overlay.style.visibility = 'hidden';
  overlay.style.pointerEvents = 'none';
  setTimeout(() => {
    if (overlay && overlay.parentNode) overlay.style.display = 'none';
  }, 550);
  window.__octagonLoadingHiddenReason = reason;
}

async function ensureOctagonLibrary(key, globalName, errorMessage) {
  if (globalName && window[globalName]) return window[globalName];
  if (typeof window.loadOctagonBootLib !== 'function') {
    throw new Error(errorMessage || `Library loader unavailable: ${key}`);
  }
  const lib = await window.loadOctagonBootLib(key, globalName);
  if (globalName && !window[globalName]) {
    throw new Error(errorMessage || `Library unavailable: ${globalName}`);
  }
  return lib;
}

async function performLogin(userId) {
  try {
    if (!omni || !Array.isArray(omni.users)) {
      normalizeOmniUsersRolesPermissions();
    }
    let userObj = omni.users.find(u => u.id === userId);
    if (!userObj) {
      userObj = { id: userId, displayName: userId, name: userId, role: userId };
      omni.users.push(userObj);
      saveData();
    }

    if (!userObj.passwordHash) {
      const password = await showFirstTimePasswordSetup(userObj.displayName || userObj.name || userId);
      if (password === null) return; // User cancelled
      const salt = generateSalt();
      userObj.passwordSalt = salt;
      userObj.passwordHash = await hashPassword(password, salt);
      userObj.passwordAlgo = 'SHA-256';
      userObj.passwordSetAt = new Date().toISOString();
      userObj.mustChangePassword = false;
      saveData();
      await syncServerAuthSession(userId, password);

      if (typeof recordOmniHistoryEvent === 'function') {
        recordOmniHistoryEvent({
          module: 'auth',
          source: 'login',
          action: 'password_setup',
          title: 'إعداد كلمة المرور لأول مرة',
          actorId: userObj.id,
          actorName: userObj.displayName || userObj.name,
          status: 'success',
          payload: { userId: userObj.id }
        });
      }
      showToast("تم إعداد كلمة المرور بنجاح وتسجيل الدخول", "success");
    } else {
      const password = await showPasswordPrompt(userObj.displayName || userObj.name || userId);
      if (password === null) return; // User cancelled
      const hashed = await hashPassword(password, userObj.passwordSalt);
      if (hashed !== userObj.passwordHash) {
        showToast("كلمة المرور غير صحيحة.", "danger");
        if (typeof recordOmniHistoryEvent === 'function') {
          recordOmniHistoryEvent({
            module: 'auth',
            source: 'login',
            action: 'login_failed',
            title: 'فشل تسجيل الدخول - كلمة مرور خاطئة',
            actorId: userObj.id,
            actorName: userObj.displayName || userObj.name,
            status: 'failed',
            payload: { userId: userObj.id }
          });
        }
        return;
      }
      await syncServerAuthSession(userId, password);

      if (typeof recordOmniHistoryEvent === 'function') {
        recordOmniHistoryEvent({
          module: 'auth',
          source: 'login',
          action: 'login_success',
          title: 'تسجيل الدخول بنجاح',
          actorId: userObj.id,
          actorName: userObj.displayName || userObj.name,
          status: 'success',
          payload: { userId: userObj.id }
        });
      }
    }

    showToast("تم تسجيل الدخول بنجاح.", "success");
    userObj.sessionStartedAt = new Date().toISOString();

    switchAuthUser(userId, true);
    const overlay = document.getElementById('loginOverlay');
    if (overlay) overlay.style.display = 'none';
    const intro = document.getElementById('introScreen');
    if (intro) intro.style.display = 'none';
  } catch (err) {
    console.error("Login flow error:", err);
    showToast("حدث خطأ أثناء تسجيل الدخول", "danger");
  }
}

function performLogout() {
  try {
    fetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
  } catch (_) {}
  window.__octagonServerSession = { authenticated: false, mode: 'logged-out' };
  if (window.PentagonAuth) {
    if (typeof recordOmniHistoryEvent === 'function') {
      const user = window.PentagonAuth.getCurrentUser();
      if (user && user.id !== 'guest') {
        recordOmniHistoryEvent({
          module: 'auth',
          source: 'logout',
          action: 'logout_success',
          title: 'تسجيل الخروج',
          actorId: user.id,
          actorName: user.displayName || user.name,
          status: 'success',
          payload: { userId: user.id }
        });
      }
    }
    window.PentagonAuth._currentUserId = '';
    localStorage.removeItem('octagon_user_id');
    localStorage.removeItem('pentagon_user_id');
    localStorage.removeItem('omni_current_user_id');
  }
  const overlay = document.getElementById('loginOverlay');
  if (overlay) overlay.style.display = 'none';
  const intro = document.getElementById('introScreen');
  if (intro) intro.style.display = 'flex';
  document.body.classList.add('login-required');
  updateAuthSessionModeBadge();
  showToast('تم تسجيل الخروج.', 'info');
}

window.showLoginFromIntro = function () {
  const intro = document.getElementById('introScreen');
  const overlay = document.getElementById('loginOverlay');
  refreshAuthUserSwitcher();
  if (intro) intro.style.display = 'none';
  if (overlay) overlay.style.display = 'flex';
};

window.showIntroFromLogin = function () {
  const intro = document.getElementById('introScreen');
  const overlay = document.getElementById('loginOverlay');
  if (intro) intro.style.display = 'flex';
  if (overlay) overlay.style.display = 'none';
};

function bindSidebarNavigation() {
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    if (btn.dataset.boundNav === '1') return;
    btn.dataset.boundNav = '1';
    btn.addEventListener('click', event => {
      const page = btn.dataset.page;
      if (!page) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      switchPage(page);
    }, true);
  });
}

function enforceUIPermissions() {
  if (!window.PermissionService) return;
  const user = window.PentagonAuth.getCurrentUser();

  // 1. Sidebar Nav
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const page = btn.getAttribute('onclick')?.match(/switchPage\('([^']+)'\)/)?.[1];
    if (page && !window.PermissionService.checkPage(page)) {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
    }
  });

  // 2. Finance Specifics
  if (currentPage === 'finance') {
    const canPost = window.PermissionService.check('account_moves', 'update');
    document.querySelectorAll('.btn-post-je').forEach(btn => {
      btn.style.display = canPost ? '' : 'none';
    });

    const canCreate = window.PermissionService.check('account_moves', 'create');
    const newBtn = document.querySelector('[onclick="openNewJEModal()"]');
    if (newBtn) newBtn.style.display = canCreate ? '' : 'none';
  }

  // 3. Inventory Specifics
  if (currentPage === 'inventory') {
    const canManage = window.PermissionService.check('stock_moves', 'create');
    document.querySelectorAll('.v5-toolbar .btn-primary').forEach(btn => {
      btn.style.display = canManage ? '' : 'none';
    });
  }
}

/* ═══════════════════ HOME / LANDING ═══════════════════
   The app boots onto a proper welcome page (pageHome) and "resumes where you
   left off": every page visit is remembered and restored on the next launch.
   Before this, the boot default was 'calculator' (the old standalone salary
   calculator, now merged into the timesheet) which flashed on startup. */

const HOME_LAST_PAGE_KEY = 'octagon_last_page';
// Pages we never auto-resume into: transient, context-bound, kiosk/mobile shells,
// or the retired standalone calculator. Landing on these out of context is wrong.
const HOME_NON_RESUMABLE = new Set([
  'home', 'calculator', 'customer_portal', 'receipt',
  'kiosk', 'employee_mobile', 'workshop_tv', 'mobile_inventory_count',
  // Heavy diagnostic pages that hydrate ALL page templates at once — landing here on
  // boot wedges startup on "جاري تحميل قوالب الصفحات". Reachable via nav, never auto-resumed.
  'route_health', 'deploy_ready'
]);

function persistLastVisitedPage(page) {
  if (!page || HOME_NON_RESUMABLE.has(page)) return;
  try { localStorage.setItem(HOME_LAST_PAGE_KEY, page); } catch (_) {}
}

// Resolve the page to open on boot: the last visited page when it's still valid
// and permitted, otherwise the home landing.
function getBootLandingPage() {
  // Always boot onto the main menu (home) on every reload, per operator preference.
  // The last visited page is still tracked and is one click away via the
  // "الذهاب إلى: (آخر صفحة)" button rendered on the home screen.
  return 'home';
}

// Wrapper-order-independent persistence: whichever code path activates a page,
// it always marks a nav button `.active`. Observe that and remember the page.
function startLastPageTracking() {
  if (window.__homeLastPageObserver) return;
  const nav = document.querySelector('.sidebar-nav');
  if (!nav || !window.MutationObserver) return;
  const obs = new MutationObserver(() => {
    const active = document.querySelector('.sidebar-nav .nav-btn.active');
    const page = active && active.getAttribute('data-page');
    if (page) persistLastVisitedPage(page);
  });
  obs.observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.__homeLastPageObserver = obs;
}

function homePageLabel(key) {
  const el = document.querySelector(`.nav-btn[data-page="${key}"] .nav-label`);
  return (el && el.textContent.trim()) || key;
}

// Curated quick-access tiles for the most-used destinations. Only tiles the
// current user is permitted to open are shown.
const HOME_QUICK_ACTIONS = [
  { page: 'timesheet',       icon: '📅', color: 'var(--accent-blue)',   desc: 'الدوام والرواتب وحاسبة الراتب' },
  { page: 'finance',         icon: '💰', color: 'var(--accent-green)',  desc: 'المحاسبة المزدوجة والقيود' },
  { page: 'workshop_ledger', icon: '🏭', color: 'var(--accent-orange)', desc: 'محاسبة ودوام الورشة' },
  { page: 'inventory',       icon: '📦', color: 'var(--accent-purple)', desc: 'المخزون وحركات المواد' },
  { page: 'sales',           icon: '🤝', color: 'var(--accent-blue)',   desc: 'المبيعات والعملاء المحتملون' },
  { page: 'customers',       icon: '👥', color: 'var(--accent-green)',  desc: 'ملفات العملاء والأرصدة' },
  { page: 'report',          icon: '📊', color: 'var(--accent-yellow)', desc: 'تقارير الرواتب والدوام' },
  { page: 'admin_panel',     icon: '⚙️', color: 'var(--text-muted)',    desc: 'الإعدادات وإدارة النظام' }
];

function renderHome() {
  const body = document.getElementById('homeBody');
  if (!body) return;

  const now = new Date();
  const hour = now.getHours();
  const greetWord = hour < 12 ? 'صباح الخير' : (hour < 18 ? 'مساء الخير' : 'مساء الخير');
  const wave = hour < 12 ? '🌅' : (hour < 18 ? '☀️' : '🌙');

  let userName = 'بك';
  try {
    const u = window.PentagonAuth && window.PentagonAuth.getCurrentUser && window.PentagonAuth.getCurrentUser();
    if (u && (u.displayName || u.name) && u.id !== 'guest') userName = u.displayName || u.name;
  } catch (_) {}

  let branch = 'الرئيسي';
  try {
    const org = omni && omni.adminSettings && omni.adminSettings.organization;
    const co = org && (org.companies || []).find(c => c.id === org.activeCompanyId);
    if (co && co.name) branch = co.name;
  } catch (_) {}

  const empCount = Array.isArray(employees) ? employees.length : 0;
  let custCount = 0;
  try { custCount = (finance && Array.isArray(finance.customers)) ? finance.customers.length : 0; } catch (_) {}

  const dateStr = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

  // "Resume" banner — only when the last real page differs from home.
  let savedPage = '';
  try { savedPage = localStorage.getItem(HOME_LAST_PAGE_KEY) || ''; } catch (_) {}
  const canResume = savedPage && !HOME_NON_RESUMABLE.has(savedPage) &&
    (!window.PermissionService || window.PermissionService.checkPage(savedPage));
  const resumeHtml = canResume ? `
    <div class="home-resume">
      <span style="font-size:20px;">↩️</span>
      <button class="home-btn" onclick="switchPage('${savedPage}')"><i class="fa-solid fa-arrow-right-to-bracket"></i> الذهاب إلى: ${homePageLabel(savedPage)}</button>
    </div>` : '';

  const stats = [
    { ico: '👷', color: 'rgba(56,189,248,0.15)',  val: empCount,  lbl: 'الموظفون' },
    { ico: '👥', color: 'rgba(52,211,153,0.15)',  val: custCount, lbl: 'العملاء' },
    { ico: '🌐', color: 'rgba(129,140,248,0.15)', val: branch,    lbl: 'الفرع النشط' }
  ].map(s => `
    <div class="home-stat">
      <div class="home-stat-ico" style="background:${s.color}">${s.ico}</div>
      <div>
        <div class="home-stat-val">${s.val}</div>
        <div class="home-stat-lbl">${s.lbl}</div>
      </div>
    </div>`).join('');

  const tiles = HOME_QUICK_ACTIONS
    .filter(a => !window.PermissionService || window.PermissionService.checkPage(a.page))
    .map(a => `
      <button class="home-tile" onclick="switchPage('${a.page}')">
        <div class="home-tile-ico" style="background:${a.color}22;">${a.icon}</div>
        <div class="home-tile-name">${homePageLabel(a.page)}</div>
        <div class="home-tile-desc">${a.desc}</div>
      </button>`).join('');

  body.innerHTML = `
    <div class="home-hero">
      <div class="home-hero-row">
        <div>
          <h1 class="home-greeting"><span class="home-wave">${wave}</span> ${greetWord}، ${userName}</h1>
          <p class="home-sub">أهلاً بك في نظام أوكتاغون لإدارة الأعمال — كل ما تحتاجه للورشة والمخازن والمبيعات والمحاسبة والرواتب في مكان واحد.</p>
          ${resumeHtml}
        </div>
        <div class="home-clock">
          <div class="home-clock-time" id="homeClockTime">${timeStr}</div>
          <div class="home-clock-date" id="homeClockDate">${dateStr}</div>
        </div>
      </div>
    </div>

    <div class="home-stats">${stats}</div>

    <div class="home-section-title">🚀 اختصارات سريعة <small>افتح أكثر الأقسام استخداماً بضغطة واحدة</small></div>
    <div class="home-grid">${tiles}</div>
  `;

  startHomeClock();
}

// Lightweight shared ticker: updates the home clock while the home page is visible.
function startHomeClock() {
  if (window.__homeClockTimer) return;
  window.__homeClockTimer = setInterval(() => {
    const t = document.getElementById('homeClockTime');
    if (!t || !document.getElementById('pageHome') || !document.getElementById('pageHome').classList.contains('page-active')) return;
    const now = new Date();
    t.textContent = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    const d = document.getElementById('homeClockDate');
    if (d) d.textContent = now.toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }, 1000);
}

function switchPage(page) {
  // TEMP: الحاسبة الذكية is hidden from the sidebar — the full calculator is docked inside
  // the timesheet page. Direct opens (boot landing, palette, old links) go to the timesheet
  // WHEN PERMITTED; users without timesheet permission still get the standalone calculator,
  // which also keeps the permission-fallback below loop-free.
  if (page === 'calculator' && (!window.PermissionService || window.PermissionService.checkPage('timesheet'))) {
    return window.switchPage('timesheet'); // window.switchPage = template-guard wrapper (hydrates the view first)
  }
  const stored = localStorage.getItem('octagon_user_id') || localStorage.getItem('pentagon_user_id');
  if (!stored) {
    const isDevMode = window.devModeAuthSwitcher || (omni && omni.adminSettings && omni.adminSettings.devModeAuthSwitcher) || false;
    if (!isDevMode) {
      const allowedGroups = window.PermissionService?.pagePermissions[page] || [];
      const mapped = window.PermissionService ? Object.prototype.hasOwnProperty.call(window.PermissionService.pagePermissions, page) : false;
      if (mapped && allowedGroups.length > 0) {
        showToast("يجب تسجيل الدخول أولاً.", "warning");
        const overlay = document.getElementById('loginOverlay');
        const intro = document.getElementById('introScreen');
        if (intro) intro.style.display = 'none';
        if (overlay) overlay.style.display = 'flex';
        document.body.classList.add('login-required');
        return;
      }
    }
  }

  const allowed = !window.PermissionService || window.PermissionService.checkPage(page);
  console.debug(`switchPage: "${page}" allowed=${allowed}`);
  if (!allowed) {
    showToast('عذراً، ليس لديك صلاحية للوصول إلى هذا القسم', 'danger');
    if (page !== 'calculator' && (!window.PermissionService || window.PermissionService.checkPage('calculator'))) {
      return switchPage('calculator');
    }
    return;
  }
  currentPage = page;
  enforceUIPermissions();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('page-active'));
  document.querySelectorAll('.nav-btn').forEach(b => { b.classList.remove('active'); b.removeAttribute('aria-current'); });
  const mainContent = document.getElementById('mainContent');
  if (mainContent) {
    mainContent.scrollTop = 0;
    mainContent.scrollLeft = 0;
  }

  const pageMap = {
    home: 'pageHome',
    calculator: 'pageCalculator',
    import: 'pageImport',
    timesheet: 'pageTimesheet',
    report: 'pageReport',
    employees: 'pageEmployees',
    finance: 'pageFinance',
    cashbox: 'pageCashbox',
    expenses: 'pageExpenses',
    income: 'pageIncome',
    customers: 'pageCustomers',
    receipt: 'pageReceipt',
    calendar: 'pageCalendar',
    employee_ui: 'pageEmployee_ui',
    workflow: 'pageWorkflow',
    kanban: 'pageKanban',
    task_manager: 'pageTaskManager',
    sop: 'pageSop',
    command_center: 'pageCommandCenter',
    op_packs: 'pageOpPacks',
    machines: 'pageMachines',
    inventory: 'pageInventory',
    qc_center: 'pageQcCenter',
    analytics: 'pageAnalytics',
    intelligence: 'pageIntelligence',
    admin_panel: 'pageAdminPanel',
    vnext_platform: 'pageVnextPlatform',
    automation: 'pageAutomation',
    whatsapp: 'pageWhatsapp',
    telegram: 'pageTelegram',
    sales: 'pageSales',
    help_manual: 'pageHelpManual',
    customer_portal: 'pageCustomerPortal',
    equipment: 'pageEquipment'
  };
  const navMap = {
    home: 'navHome',
    calculator: 'navCalculator',
    import: 'navImport',
    timesheet: 'navTimesheet',
    report: 'navReport',
    employees: 'navEmployees',
    finance: 'navFinance',
    cashbox: 'navCashbox',
    expenses: 'navExpenses',
    income: 'navIncome',
    customers: 'navCustomers',
    receipt: 'navReceipt',
    calendar: 'navCalendar',
    employee_ui: 'navEmployeeUI',
    workflow: 'navWorkflow',
    kanban: 'navKanban',
    task_manager: 'navTaskManager',
    sop: 'navSop',
    command_center: 'navCommandCenter',
    op_packs: 'navOpPacks',
    machines: 'navMachines',
    inventory: 'navInventory',
    qc_center: 'navQcCenter',
    analytics: 'navAnalytics',
    intelligence: 'navIntelligence',
    admin_panel: 'navAdminPanel',
    automation: 'navAutomation',
    whatsapp: 'navWhatsapp',
    telegram: 'navTelegram',
    sales: 'navSales',
    help_manual: 'navHelpManual',
    customer_portal: 'navCustomerPortal',
    equipment: 'navEquipment'
  };

  const pageEl = document.getElementById(pageMap[page]);
  const navEl = document.getElementById(navMap[page]) || document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (pageEl) pageEl.classList.add('page-active');
  if (navEl) { navEl.classList.add('active'); navEl.setAttribute('aria-current', 'page'); }
  ensureNavGroupForPage(page);

  if (page === 'home') renderHome();
  // Isolate every page's render: a thrown error in one page must NOT break the whole
  // program. On failure we show a clean error panel in that page's container and keep the
  // app alive. (This cannot interrupt an infinite loop — those are fixed per-page — but it
  // stops the far more common "one bad render wedges everything" class of failure.)
  try {
  if (page === 'calculator') { undockCalculatorToOwnPage(); refreshCalcEmpDropdown(); }
  if (page === 'timesheet') renderTimesheet();
  if (page === 'report') renderReport();
  if (page === 'employees') renderEmployeesTable();
  if (page === 'finance') { renderFinanceDashboard(); switchFinanceTab('dashboard'); }
  if (page === 'cashbox') renderCashbox();
  if (page === 'expenses') renderExpensesPage();
  if (page === 'income') renderIncomePage();
  if (page === 'customers') renderCustomersPage();
  if (page === 'receipt') renderReceiptPage();
  if (page === 'calendar') {
    // Always land on the real current month when navigating INTO the calendar tab,
    // instead of whatever month the shared calculator/timesheet selector was last left on.
    const today = new Date();
    setConfigValue('cfgMonth', today.getMonth() + 1);
    setConfigValue('cfgYear', today.getFullYear());
    selectedCalendarDay = null;
    renderAttendanceCalendar();
  }
  if (page === 'kanban') renderKanbanBoard();
  if (page === 'workflow') renderWorkflowStudio();
  if (page === 'task_manager') renderTaskManager();
  if (page === 'sop') renderSopHub();
  if (page === 'command_center') renderCommandCenter();
  if (page === 'op_packs') renderOpPacks();
  if (page === 'machines') renderMachinesPage();
  if (page === 'inventory') renderInventoryPage();
  if (page === 'qc_center') renderQcCenter();
  if (page === 'analytics') renderAnalytics();
  if (page === 'intelligence') renderAiControlDashboard();
  if (page === 'employee_ui') renderEmployeePortal();
  if (page === 'admin_panel') renderAdminPanel();
  if (page === 'automation') renderAutomationEngine();
  if (page === 'whatsapp') renderWhatsAppIntegrationPage();
  if (page === 'telegram') renderTelegramIntegrationPage();
  if (page === 'help_manual') renderHelpManualPage();
  if (page === 'sales') renderSalesCrmPage();
  if (page === 'customer_portal') renderCustomerPortal();
  if (page === 'equipment') renderEquipmentPage();
  } catch (err) {
    console.error(`[switchPage] render failed for "${page}":`, err);
    if (typeof showToast === 'function') showToast('تعذّر فتح هذه الصفحة بسبب خطأ — تم احتواؤه حتى لا يتوقف البرنامج بالكامل. جرّب صفحة أخرى أو أعد التحميل.', 'error');
    const _pmap = pageMap[page];
    const _el = _pmap && document.getElementById(_pmap);
    if (_el) _el.innerHTML = `<div style="padding:40px;text-align:center;color:#f87171;max-width:620px;margin:40px auto;background:rgba(248,113,113,0.08);border:1px solid rgba(248,113,113,0.3);border-radius:14px;">
        <div style="font-size:42px;margin-bottom:12px;">⚠️</div>
        <h3 style="margin:0 0 8px;color:#fca5a5;">تعذّر عرض هذه الصفحة</h3>
        <p style="color:#cbd5e1;font-size:14px;line-height:1.8;">حدث خطأ أثناء تحميل محتوى هذه الصفحة، لكن البرنامج ما زال يعمل. يمكنك فتح صفحة أخرى أو العودة للرئيسية. (تفاصيل الخطأ في وحدة التحكم Console.)</p>
        <p style="color:#94a3b8;font-size:12px;direction:ltr;background:rgba(0,0,0,0.25);padding:8px 12px;border-radius:8px;display:inline-block;margin-top:4px;word-break:break-word;">${escapeHtml((err && err.message ? String(err.message) : String(err)).slice(0,300))}</p>
        <div style="margin-top:18px;"><button class="btn-primary" onclick="switchPage('home')" style="padding:9px 20px;">العودة للرئيسية</button></div>
      </div>`;
  }
  renderOmniNotificationBell();
}

// Global safety net: any uncaught error in a click/change handler or async task is logged
// and surfaced as a toast instead of silently leaving the UI wedged. (Does not interrupt
// infinite loops — those are page-specific bugs — but stops silent, app-breaking failures.)
if (!window.__octagonGlobalErrorGuard) {
  window.__octagonGlobalErrorGuard = true;
  window.addEventListener('error', (e) => {
    console.error('[global error]', e.error || e.message);
    try { if (typeof showToast === 'function') showToast('حدث خطأ غير متوقع — تم تسجيله. إذا تجمّدت الصفحة أعد تحميلها.', 'error'); } catch (_) {}
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[unhandled promise rejection]', e.reason);
  });
}

document.addEventListener('click', (event) => {
  if (!omniNotificationDropdownOpen) return;
  if (event.target.closest?.('.omni-notification-host')) return;
  omniNotificationDropdownOpen = false;
  renderOmniNotificationBell();
});

// ─── Employee Filter for Timesheet ───
function refreshEmpFilterDropdown() {
  const select = document.getElementById('empFilterSelect');
  if (!select) return;

  const currentVal = select.value;
  const cfg = getConfig();
  // Keep the first option
  select.innerHTML = '<option value="-1">— جميع الموظفين —</option>';
  employees.forEach((emp, idx) => {
    if (!recordsForTimesheetRange(emp, cfg).length) return;
    const opt = document.createElement('option');
    opt.value = idx;
    opt.text = emp.name;
    select.appendChild(opt);
  });

  // Restore previous selection
  if (currentVal >= -1 && currentVal < employees.length) {
    select.value = currentVal;
  }
}

function onEmpFilterChange() {
  const select = document.getElementById('empFilterSelect');
  const idx = parseInt(select.value);

  if (idx === -1) {
    // Show all employees - keep current selection but update view
    renderTimesheet();
  } else if (idx >= 0 && employees[idx]) {
    // Select specific employee
    selectEmployee(idx);
  }
}

// ─── Employee Selector for Calculator ───
function refreshCalcEmpDropdown() {
  const select = document.getElementById('calcEmpSelect');
  if (!select) return;
  const currentVal = select.value;
  // Keep the first option
  select.innerHTML = '<option value="-1">— حساب مباشر (بدون موظف) —</option>';
  employees.forEach((emp, idx) => {
    const opt = document.createElement('option');
    opt.value = idx;
    opt.textContent = emp.name;
    select.appendChild(opt);
  });
  // Restore selection if still valid
  if (currentVal >= 0 && currentVal < employees.length) {
    select.value = currentVal;
  }
}

function getCalculatorTimesheetSource() {
  const select = document.getElementById('calcEmpSelect');
  const badge = document.getElementById('calcEmpBadge');
  const idx = select ? parseInt(select.value, 10) : -1;
  if (idx < 0 || !employees[idx] || badge?.dataset.timesheetSourced !== '1') return null;
  return { idx, emp: employees[idx], cfg: getConfig() };
}

function getTimesheetRangeDayDistribution(emp, cfg = getConfig()) {
  const rows = recordsForTimesheetRange(emp, cfg);
  return rows.reduce((acc, rec) => {
    const period = getRecordPeriod(rec, cfg);
    const statusType = normalizeStatus(rec.status);
    const fridayDate = isFriday(period.year, period.month, period.day);
    acc.totalDays += 1;
    if (statusType === 'leave') acc.leaveDays += 1;
    else if (statusType === 'absent') acc.absentDays += 1;
    else if (fridayDate || statusType === 'friday' || statusType === 'friday_work') acc.fridayDays += 1;
    else acc.attendanceDays += 1;
    return acc;
  }, { totalDays: 0, attendanceDays: 0, fridayDays: 0, leaveDays: 0, absentDays: 0 });
}

function onCalcEmpChange() {
  window.paymentAmountManuallyEdited = false;
  const select = document.getElementById('calcEmpSelect');
  const idx = parseInt(select.value, 10);
  const badge = document.getElementById('calcEmpBadge');

  if (idx >= 0 && employees[idx]) {
    const emp = employees[idx];
    const cfg = getConfig();
    cfg.nominalSalary = getEmployeeNominalSalary(emp, cfg.nominalSalary);

    setConfigValue('cfgSalary', cfg.nominalSalary);

    if (!emp.records) emp.records = [];

    const monthRecs = recordsForTimesheetRange(emp, cfg);

    if (monthRecs.length === 0) {
      badge.dataset.timesheetSourced = '0';
      document.getElementById('inpAttendance').value = 0;
      document.getElementById('inpLeaves').value = 0;
      document.getElementById('inpAbsent').value = 0;
      document.getElementById('inpOvertime').value = 0;
      document.getElementById('inpFridayOT').value = 0;
      document.getElementById('inpLateness').value = 0;
      document.getElementById('inpFridays').value = 0;
      document.getElementById('inpCurrentAdvance').value = 0;
      // Negated to match the "has records" branch below, which populates this same field
      // from result.previousAdvance (already in the internal positive=employee-owes convention).
      document.getElementById('inpPreviousAdvance').value = -(emp.prevAdvance || 0);
      document.getElementById('inpPenalty').value = 0;
      document.getElementById('inpBonus').value = 0;
      document.getElementById('inpDamage').value = 0;
      badge.style.display = 'flex';
      document.getElementById('calcEmpBadgeText').textContent = `لا توجد سجلات للموظف في ${getTimesheetPeriodLabel(cfg)}`;
    } else {
      // Official per-month engine aggregate — same numbers as the payroll close and print.
      const result = getTimesheetOfficialRangeResult(emp, cfg);
      const dayDist = getTimesheetRangeDayDistribution(emp, cfg);
      document.getElementById('inpAttendance').value = dayDist.attendanceDays;
      document.getElementById('inpLeaves').value = dayDist.leaveDays;
      document.getElementById('inpAbsent').value = dayDist.absentDays;

      // Keep regular overtime and Friday overtime DISJOINT. `totalOvertime` already includes Friday
      // hours, and the calculator adds `inpFridayOT` again at 2× — so feeding totalOvertime here
      // double-counted Friday work. Use the regular-only and Friday-only post-override figures.
      document.getElementById('inpOvertime').value = result.overtimeHours > 0 ? result.overtimeHours.toFixed(1) : 0;
      document.getElementById('inpFridayOT').value = result.fridayOTHours > 0 ? result.fridayOTHours.toFixed(1) : 0;
      document.getElementById('inpLateness').value = result.totalLatenessHours > 0 ? result.totalLatenessHours.toFixed(1) : 0;
      document.getElementById('inpFridayDays').value = dayDist.fridayDays;

      // Calculate eligible Fridays directly from calculated leave and absent days
      document.getElementById('inpFridays').value = result.eligibleFridays;

      // Calculate automatic penalties (غرامات الالتزام)
      // = lateness deduction + absence deduction + deduction for lost Fridays
      const automaticPenalties = result.automaticPenalties;

      document.getElementById('inpCurrentAdvance').value = result.currentAdvance || 0;
      document.getElementById('inpPreviousAdvance').value = result.previousAdvance || 0;
      document.getElementById('inpPenalty').value = Math.round(result.totalPenalty || 0);
      document.getElementById('inpBonus').value = result.totalBonus || 0;
      document.getElementById('inpDamage').value = result.totalDamage || 0;

      badge.style.display = 'flex';
      badge.dataset.timesheetSourced = '1';
      document.getElementById('calcEmpBadgeText').textContent = `بيانات ${emp.name} مسحوبة من التايم شيت (${getTimesheetPeriodLabel(cfg)})`;

      validateDays();
      recalculate();
      return;
    }
  } else {
    badge.style.display = 'none';
    badge.dataset.timesheetSourced = '0';
  }

  validateDays();
  autoCalcEligibleFridays();
}

function onMonthYearChange() {
  const cfg = getConfig();
  const totalDays = getDaysInMonth(cfg.year, cfg.month);
  let fridayCount = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (isFriday(cfg.year, cfg.month, d)) fridayCount++;
  }
  document.getElementById('inpFridayDays').value = 0;
  document.getElementById('daysMonthDisplay').textContent = totalDays;

  // Docked in the timesheet: the calculator's month/year selectors ARE the page filter.
  // Point the timesheet's displayed range at the chosen month and re-render — the render
  // re-docks and re-syncs the calculator, so rows, month docs and calc always agree.
  const dockedCalc = document.getElementById('pageCalculator');
  if (currentPage === 'timesheet' && dockedCalc?.classList.contains('ts-docked-calc')) {
    saveConfigToStorage();
    setTimesheetSelectedMonths([cfg.month], cfg.month);
    renderTimesheet();
    return;
  }

  const select = document.getElementById('calcEmpSelect');
  const idx = parseInt(select.value, 10);
  if (idx >= 0 && employees[idx]) {
    onCalcEmpChange();
    return;
  }

  validateDays();
  autoCalcEligibleFridays();
  saveConfigToStorage();
  if (currentPage === 'timesheet') renderTimesheet();
  if (currentPage === 'report') renderReport();
  if (currentPage === 'employees') renderEmployeesTable();
  if (currentPage === 'calendar') renderAttendanceCalendar();
}

// ─── Auto-Calculate Eligible Fridays ───
function autoCalcEligibleFridays() {
  const tsSource = getCalculatorTimesheetSource();
  if (tsSource) {
    const result = getTimesheetOfficialRangeResult(tsSource.emp, {
      ...tsSource.cfg,
      nominalSalary: getEmployeeNominalSalary(tsSource.emp, tsSource.cfg.nominalSalary)
    });
    const inpFridaysEl = document.getElementById('inpFridays');
    if (inpFridaysEl) inpFridaysEl.value = result.eligibleFridays || 0;
    recalculate();
    return;
  }

  const cfg = getConfig();
  const fridays = getFridaysInMonth(cfg.year, cfg.month);
  const fridayCount = fridays.length;

  const eligible = fridayCount;
  const inpFridaysEl = document.getElementById('inpFridays');
  if (inpFridaysEl) {
    inpFridaysEl.value = eligible;
    inpFridaysEl.setAttribute('value', eligible);
  }
  recalculate();
}

// ─── Days Validation ───
function validateDays() {
  // The timesheet inputs are mounted lazily with their page section. On boot the
  // default page (calculator) runs this before the timesheet exists — guard so we
  // don't throw on null .value (was: "Octagon startup interrupted"). No logic change.
  const attendEl = document.getElementById('inpAttendance');
  const leavesEl = document.getElementById('inpLeaves');
  const absentEl = document.getElementById('inpAbsent');
  if (!attendEl || !leavesEl || !absentEl) return;
  const cfg = getConfig();
  const totalDays = getDaysInMonth(cfg.year, cfg.month);

  // Count Fridays in month
  let fridayCount = 0;
  for (let d = 1; d <= totalDays; d++) {
    if (isFriday(cfg.year, cfg.month, d)) fridayCount++;
  }
  const workingDays = totalDays - fridayCount;

  const attend = parseFloat(document.getElementById('inpAttendance').value) || 0;
  const leaves = parseFloat(document.getElementById('inpLeaves').value) || 0;
  const absents = parseFloat(document.getElementById('inpAbsent').value) || 0;

  // Sum of non-Friday days (attendance + leaves + absent should equal working days)
  const sum = attend + leaves + absents;
  const diff = sum - workingDays;

  // Timesheet-sourced mode: the figures mirror the actual record (a Friday worked as regular
  // duty counts as attendance while workingDays excludes Fridays), so the manual-entry
  // "exceeds working days" warning is a FALSE alarm here. Show a calm source note instead.
  const tsSource = getCalculatorTimesheetSource();
  if (tsSource) {
    const dayDist = getTimesheetRangeDayDistribution(tsSource.emp, tsSource.cfg);
    document.getElementById('daysSumDisplay').textContent = dayDist.totalDays;
    document.getElementById('daysMonthDisplay').textContent = dayDist.totalDays;
    const remainingSrcEl = document.getElementById('daysRemaining');
    if (remainingSrcEl) {
      remainingSrcEl.textContent = '✓ مطابق لسجل التايم شيت';
      remainingSrcEl.className = 'days-remaining ok';
    }
    const warnEl = document.getElementById('daysWarning');
    if (warnEl) warnEl.style.display = 'none';
    const pctSrc = (v) => dayDist.totalDays > 0 ? Math.min(100, (v / dayDist.totalDays) * 100) : 0;
    document.getElementById('daysBarAttend').style.width = pctSrc(dayDist.attendanceDays) + '%';
    document.getElementById('daysBarFriday').style.width = pctSrc(dayDist.fridayDays) + '%';
    document.getElementById('daysBarLeave').style.width = pctSrc(dayDist.leaveDays) + '%';
    document.getElementById('daysBarAbsent').style.width = pctSrc(dayDist.absentDays) + '%';
    return;
  }

  // Update summary display
  document.getElementById('daysSumDisplay').textContent = sum;
  document.getElementById('daysMonthDisplay').textContent = workingDays;

  // Update remaining text
  const remainingEl = document.getElementById('daysRemaining');
  if (diff > 0) {
    remainingEl.textContent = `زيادة ${diff} يوم!`;
    remainingEl.className = 'days-remaining over';
  } else if (diff < 0) {
    remainingEl.textContent = `متبقي ${Math.abs(diff)} يوم`;
    remainingEl.className = 'days-remaining ok';
  } else {
    remainingEl.textContent = '✓ مكتمل';
    remainingEl.className = 'days-remaining ok';
  }

  // Warning
  const warningEl = document.getElementById('daysWarning');
  const warningText = document.getElementById('daysWarningText');
  if (diff > 0) {
    warningEl.style.display = 'flex';
    warningText.textContent = `⚠ مجموع الأيام (${sum}) يتجاوز أيام الدوام (${workingDays}) بـ ${diff} يوم! (الجمع لا تُحسب في المجموع)`;
  } else {
    warningEl.style.display = 'none';
  }

  // Update visual bar
  const pct = (v) => workingDays > 0 ? Math.min(100, (v / workingDays) * 100) : 0;
  document.getElementById('daysBarAttend').style.width = pct(attend) + '%';
  document.getElementById('daysBarLeave').style.width = pct(leaves) + '%';
  document.getElementById('daysBarAbsent').style.width = pct(absents) + '%';
}

// ─── Calculator Page ───
function recalculate() {
  const cfg = getConfig();

  const tsSource = getCalculatorTimesheetSource();

  // Always keep fields editable and synchronized
  const inpFridaysEl = document.getElementById('inpFridays');
  const inpFridaysHintEl = document.getElementById('inpFridaysHint');
  if (inpFridaysEl) {
    inpFridaysEl.disabled = false;
    inpFridaysEl.title = '';
    if (inpFridaysHintEl) inpFridaysHintEl.textContent = 'عدد الجمع المستحقة ÷ 4 (كل 6 أيام غياب/إجازة = جمعة أقل)';
  }

  const inputs = {
    attendanceDays: parseFloat(document.getElementById('inpAttendance').value) || 0,
    leaveDays: parseFloat(document.getElementById('inpLeaves').value) || 0,
    absentDays: parseFloat(document.getElementById('inpAbsent').value) || 0,
    overtimeHours: parseFloat(document.getElementById('inpOvertime').value) || 0,
    fridayOTHours: parseFloat(document.getElementById('inpFridayOT').value) || 0,
    latenessHours: parseFloat(document.getElementById('inpLateness').value) || 0,
    eligibleFridays: parseFloat(document.getElementById('inpFridays').value) || 0,
    fridayWorkedDays: parseFloat(document.getElementById('inpFridayDays').value) || 0,
    currentAdvance: parseFloat(document.getElementById('inpCurrentAdvance').value) || 0,
    previousAdvance: parseFloat(document.getElementById('inpPreviousAdvance').value) || 0,
    penalty: parseFloat(document.getElementById('inpPenalty').value) || 0,
    bonus: parseFloat(document.getElementById('inpBonus').value) || 0,
    damage: parseFloat(document.getElementById('inpDamage').value) || 0,
  };

  // For a timesheet-sourced employee, show the AUTHORITATIVE engine result directly (same function
  // the timesheet uses) so the two pages always agree — including shift, early-arrival, hourly,
  // early-leave, etc. Pure manual entry (no employee) still uses the settings-aware formula.
  let result;
  if (tsSource) {
    // AUTHORITATIVE per-month engine aggregated over the displayed months — identical to the
    // payroll close, month docs, print and slip, so every figure on the page agrees.
    result = getTimesheetOfficialRangeResult(tsSource.emp, { ...cfg, nominalSalary: getEmployeeNominalSalary(tsSource.emp, cfg.nominalSalary) });
  } else {
    result = calculateSalary(cfg, inputs);
  }
  window.lastCalcResult = result;

  // Month Info
  updateValue('resTotalDays', result.totalDays);
  updateValue('resFridayCount', result.fridayCount);
  updateValue('resWorkDays', result.workingDays);
  updateValue('resDailyRate', formatNum(result.dailyRate));
  updateValue('resHourlyRate', formatNum(result.hourlyRate));
  updateValue('resAllowanceRate', formatNum(result.allowanceRate));

  // Earnings
  updateValue('resBaseSalary', formatNum(result.baseSalary));
  updateValue('resAllowances', formatNum(result.allowances));
  updateValue('resOvertime', formatNum(result.totalOvertimeValue));
  updateValue('resFridayComp', formatNum(result.fridayCompensation));
  updateValue('resBonusTotal', formatNum(result.bonus));

  // Deductions
  updateValue('resLatenessDeduct', formatNum(result.latenessDeduction));
  updateValue('resLeaveDeduct', formatNum(result.leaveDeduction));
  updateValue('resAbsenceDeduct', formatNum(result.absenceDeduction));
  updateValue('resOtherDeduct', formatNum((result.totalAdvance || 0) + (result.penalty || 0) + (result.damage || 0) + (result.autoFridayPenalty || 0)));

  // Final
  const finalEl = document.querySelector('.final-amount');
  finalEl.textContent = formatNum(result.finalSalary);
  finalEl.classList.add('animate-value');
  setTimeout(() => finalEl.classList.remove('animate-value'), 300);

  // Bar
  const percent = Math.min(100, Math.max(0, (result.finalSalary / cfg.nominalSalary) * 100));
  document.getElementById('salaryBarFill').style.width = percent + '%';
  document.getElementById('resSalaryPercent').textContent = Math.round(percent);

  // Salary Due Section
  updateValue('resSalaryDue', formatNum(result.salaryDue));
  updateValue('resSalaryDueBase', formatNum(result.baseSalary));
  updateValue('resSalaryDueAllowance', formatNum(result.allowances));
  updateValue('resSalaryDueOvertime', formatNum(result.totalOvertimeValue + result.fridayCompensation));
  updateValue('resSalaryDueDeductions', formatNum(result.salaryDueDeductions));

  // Current Balance Section
  updateValue('resCurrentBalance', formatNum(result.finalSalary));
  updateValue('resCurrentBalanceBase', formatNum(result.salaryDue));
  updateValue('resCurrentBalanceCurrentAdv', formatNum(result.currentAdvance));
  updateValue('resCurrentBalancePrevAdv', formatNum(result.previousAdvance));
  updateValue('resCurrentBalancePenaltyDamage', formatNum(result.penalty + result.damage));

  // Set default payment input value if not manually edited
  const inpPayAmountEl = document.getElementById('inpPaymentAmount');
  if (inpPayAmountEl && !window.paymentAmountManuallyEdited) {
    inpPayAmountEl.value = Math.max(0, Math.round(result.finalSalary || 0));
  }

  // Update the change carry-over labels
  if (typeof updatePaymentChangeDisplay === 'function') {
    updatePaymentChangeDisplay();
  }

  // Save config
  saveData();

  // Hide AI Response if it was shown previously for an older calculation
  const aiContainer = document.getElementById('calcAIResponseContainer');
  if (aiContainer) aiContainer.style.display = 'none';
}

async function verifyCalculatorWithAI() {
  const result = window.lastCalcResult;
  if (!result) return;
  const cfg = getConfig();

  const btn = document.getElementById('btnVerifyCalcAI');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري المراجعة...';
  btn.disabled = true;

  try {
    // Security hardening 2026-07-05: Gemini key moved to server .env — calls go through /api/ai/gemini.
    const promptText = `
أنت مدقق ومراجع حسابات ذكي للرواتب.
تم إجراء عملية حساب لراتب موظف. تفاصيل الحساب:
الراتب الاسمي الكلي: ${cfg.nominalSalary}
مخصصات النقل: ${cfg.transportAllowance}
مخصصات الطعام: ${cfg.foodAllowance}

تفاصيل النتائج الدقيقة المحسوبة للموظف (JSON):
${JSON.stringify(result, null, 2)}

المطلوب:
مراجعة هذه الأرقام، وكتابة تقرير مراجعة قصير ولطيف جداً باللغة العربية (لا يزيد عن 3 إلى 5 أسطر) يؤكد ما إذا كانت الحسابات منطقية، ويشرح للمستخدم باختصار ماذا تم خصمه أو إضافته بشكل بارز (مثلا التركيز على وجود سلف سابقة أو خصم كبير بسبب الغياب أو مكافآت).
تحدث بصيغة المساعد الودود الخبير الذي يطمئن المستخدم على صحة العمل.
لا ترجع كود JSON، بل أرجع النص المنسق والمباشر فقط.
`;

    const response = await fetch("/api/ai/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-flash-latest",
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.2 }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "لا يوجد رد من الذكاء الاصطناعي.";

    const container = document.getElementById('calcAIResponseContainer');
    const responseText = document.getElementById('calcAIResponseText');
    if (container && responseText) {
      container.style.display = 'flex';
      // Format text with line breaks
      responseText.innerHTML = text.replace(/\\n/g, '<br>');

      container.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    showToast('✨ اكتملت مراجعة الذكاء الاصطناعي', 'success');
  } catch(err) {
    console.error('AI Error:', err);
    showToast('❌ فشل في مراجعة الحاسبة: ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

function updateValue(id, val) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = val;
    el.classList.add('animate-value');
    setTimeout(() => el.classList.remove('animate-value'), 300);
  }
}

function calculateBalanceAfterPayment(result, paidAmount) {
  const salaryBeforeAdvances = result.salaryDue || 0;
  const advancesAndOldBalance = (result.previousAdvance || 0) + (result.currentAdvance || 0) + (result.officialAdvance || 0);
  return advancesAndOldBalance + (paidAmount || 0) - salaryBeforeAdvances;
}

function formatSignedBalance(balance) {
  const symbol = getAdminCurrencySymbol();
  if (balance > 0) return `${formatNum(balance)} ${symbol} (بذمته)`;
  if (balance < 0) return `${formatNum(Math.abs(balance))} ${symbol} (يطلب)`;
  return `0 ${symbol} (مسدد)`;
}

function formatMoneyReadable(value) {
  const symbol = getAdminCurrencySymbol();
  const label = symbol === 'د.ع' ? 'دينار' : symbol;
  return `${formatNum(value || 0)} ${label}`;
}

function formatHoursAsMinutesLabel(hours, options = {}) {
  const mins = Math.round((Number(hours) || 0) * 60);
  const hourText = (Number(hours) || 0).toFixed(1);
  const unit = mins === 1 ? 'دقيقة' : 'دقائق';
  return options.withHours === false ? `${mins} ${unit}` : `${mins} ${unit} (${hourText} س)`;
}

function formatTimesheetMoneyWithMinutes(hours, value) {
  return `${formatHoursAsMinutesLabel(hours)} (${formatMoneyReadable(value)})`;
}

// UNUSED as of the Production Stabilization Sprint (2026-07-04): markAsPaid()
// no longer calls this — it now routes every payment through
// settlePayrollPayment() instead of mutating emp.prevAdvance directly. Left
// in place (no callers left in the codebase) rather than deleted, per the
// add-only convention; safe to remove in a future cleanup pass.
function applyPaymentToEmployeeBalance(emp, result, paidAmount) {
  const newBalance = calculateBalanceAfterPayment(result, paidAmount);
  emp.prevAdvance = Math.round(newBalance);
  return emp.prevAdvance;
}

// ─── Payment Registration ───
function registerPayment() {
  const paymentAmount = parseFloat(document.getElementById('inpPaymentAmount').value) || 0;
  const result = window.lastCalcResult;

  if (!result || paymentAmount <= 0) {
    showToast('أدخل مبلغ صحيح للدفع', 'error');
    return;
  }

  // Store payment record
  const cfg = getConfig();
  const empSelect = document.getElementById('calcEmpSelect');
  const employeeName = empSelect.value !== '-1' ? empSelect.options[empSelect.selectedIndex].text : 'حساب مباشر';
  const empIdx = parseInt(empSelect.value, 10);
  if (empIdx < 0 || !employees[empIdx]) {
    showToast('دفع الرواتب يجب أن يكون مرتبطاً بموظف وفترة Payroll مغلقة', 'error');
    return;
  }
  PentagonDB.load().then(db => {
    const closing = findPayrollClosingForEmployee(db, employees[empIdx].id, cfg.year, cfg.month);
    if (!closing) {
      showToast(`يجب إقفال وترحيل راتب ${employeeName} لشهر ${cfg.month}/${cfg.year} قبل الدفع`, 'warning');
      return null;
    }
    return settlePayrollPayment(closing.id, paymentAmount);
  }).then(result => {
    if (!result) return;
    financeRefreshAll();
    showToast('✅ تم تسجيل دفع الراتب كتسوية استحقاق', 'success');
    document.getElementById('inpPaymentAmount').value = '';
    window.paymentAmountManuallyEdited = false;
    if (typeof updatePaymentChangeDisplay === 'function') updatePaymentChangeDisplay();
    const statusDiv = document.getElementById('paymentStatus');
    if (statusDiv) {
      statusDiv.innerHTML = `✅ تم تسجيل دفعة بمبلغ <b>${formatNum(paymentAmount)}</b> د.ع<br>قيد الدفع: <b>${escapeHtml(result.move.name || result.move.id)}</b>`;
      statusDiv.style.display = 'block';
    }
  }).catch(err => {
    showToast(err.message || 'تعذر تسجيل دفع الراتب', 'error');
  });
}

function adjustPaymentAmount(delta) {
  const input = document.getElementById('inpPaymentAmount');
  if (!input) return;
  const current = parseFloat(input.value) || 0;
  input.value = Math.max(0, current + delta);
  window.paymentAmountManuallyEdited = true;
  updatePaymentChangeDisplay();
}

function roundPaymentAmountTo1000() {
  const input = document.getElementById('inpPaymentAmount');
  if (!input) return;
  const result = window.lastCalcResult;
  if (!result) return;
  const net = result.finalSalary || 0;
  input.value = Math.max(0, Math.ceil(net / 1000) * 1000);
  window.paymentAmountManuallyEdited = true;
  updatePaymentChangeDisplay();
}

function updatePaymentChangeDisplay() {
  const result = window.lastCalcResult;
  const input = document.getElementById('inpPaymentAmount');
  const lblNet = document.getElementById('lblNetRequired');
  const lblChange = document.getElementById('lblChangeCarryOver');

  if (!result || !input) return;

  const required = Math.round(result.finalSalary || 0);
  const paid = parseFloat(input.value) || 0;
  const change = Math.round(paid - required);

  if (lblNet) lblNet.textContent = formatNum(required) + ' د.ع';

  if (lblChange) {
    if (change > 0) {
      lblChange.textContent = `+${formatNum(change)} د.ع (ستُرحل كخصم/سلفة للشهر القادم)`;
      lblChange.style.color = 'var(--accent-yellow)';
    } else if (change < 0) {
      lblChange.textContent = `${formatNum(change)} د.ع (ستُرحل كمستحق للموظف)`;
      lblChange.style.color = 'var(--accent-red)';
    } else {
      lblChange.textContent = '0 د.ع (مسدد بالكامل)';
      lblChange.style.color = 'var(--accent-green)';
    }
  }
}

window.adjustPaymentAmount = adjustPaymentAmount;
window.roundPaymentAmountTo1000 = roundPaymentAmountTo1000;
window.updatePaymentChangeDisplay = updatePaymentChangeDisplay;

// ─── Employees & Balances Page ───
function getLastAttendanceDate(employee) {
  if (!employee.records || employee.records.length === 0) return null;
  const attendanceStatuses = ['normal', 'permission', 'night_shift', 'holiday', 'friday_work'];

  let allAttends = employee.records.filter(r => attendanceStatuses.includes(normalizeStatus(r.status)));
  if (allAttends.length === 0) return null;

  // Sort descending
  allAttends.sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    return b.day - a.day;
  });

  const latest = allAttends[0];
  return new Date(latest.year, latest.month - 1, latest.day);
}

function isEmployeeActive(employee, year, month) {
  return employeeHasActiveDayInMonth(employee, year, month);
}

const employeeTableState = { sortKey: 'name', sortDir: 'asc', activeOnly: false };

function getEmployeeActivityInfo(employee, cfg) {
  const lastActivity = getLastAttendanceDate(employee);
  const lifecycle = getEmployeeLifecycleStatus(employee, cfg.year, cfg.month);
  // Fallback only (used if the calc below throws): negate to match calculateBalanceAfterPayment's
  // internal convention (positive = employee owes), since raw prevAdvance is positive = company owes.
  let liveBalance = -Number(employee.prevAdvance || 0);
  try {
    const res = calculateSalaryForEmployee(employee, { ...cfg, nominalSalary: getEmployeeNominalSalary(employee, cfg.nominalSalary) });
    liveBalance = calculateBalanceAfterPayment(res, 0);
  } catch (e) {}
  const status = lifecycle.status;
  return { lastActivity, liveBalance, status, lifecycle };
}

// T0.4 dedup (2026-07-12): dead copy, shadowed by the later definition below.
// FLAG for owner: this dead version has a 3-way contract (active/pending/else)
// matching what both call sites actually pass (info.status from
// getEmployeeTimesheetLifecycle, which can be 'pending') — the live version
// below only handles 2 ways, so a 'pending' employee currently renders as
// "مستقيل" (resigned) instead of a pending-balance state. Not corrected here
// (T0.4 preserves current live behavior; this is a business-logic call for
// the owner, not a mechanical de-dup). Kept per add-only rule, never called.
function getEmployeeStatusLabel_deprecated_dup1(status) {
  if (status === 'active') return '✅ فعال';
  if (status === 'pending') return '⚠️ رصيد معلق';
  return '❌ غير فعال';
}

function getEmployeeStatusLabel(status) {
  return status === 'active' ? 'يعمل' : 'مستقيل';
}

function sortEmployeesTable(key) {
  if (employeeTableState.sortKey === key) {
    employeeTableState.sortDir = employeeTableState.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    employeeTableState.sortKey = key;
    employeeTableState.sortDir = key === 'name' || key === 'status' ? 'asc' : 'desc';
  }
  renderEmployeesTable();
}

function toggleActiveEmployeesOnly(checked) {
  employeeTableState.activeOnly = !!checked;
  renderEmployeesTable();
}

function updateEmployeeSortArrows() {
  const map = { name: 'sortArrowName', salary: 'sortArrowSalary', lastActivity: 'sortArrowLastActivity', status: 'sortArrowStatus', balance: 'sortArrowBalance' };
  Object.values(map).forEach(id => { const el = document.getElementById(id); if (el) el.textContent = ''; });
  const active = document.getElementById(map[employeeTableState.sortKey]);
  if (active) active.textContent = employeeTableState.sortDir === 'asc' ? '↑' : '↓';
  const check = document.querySelector('.employee-active-only-check');
  if (check) check.checked = !!employeeTableState.activeOnly;
}

function renderEmployeesTableLegacyDisabled() {
  const tbody = document.getElementById('employeesTableBody');
  const emptyState = document.getElementById('employeesEmpty');
  const tableContainer = document.getElementById('employeesTableContainer');
  if (!tbody) return;
  updateEmployeeSortArrows();

  const cfg = getConfig();
  const rows = employees.map((emp, idx) => ({ emp, idx, info: getEmployeeActivityInfo(emp, cfg) }))
    .filter(row => !employeeTableState.activeOnly || row.info.status === 'active')
    .sort((a, b) => {
      const dir = employeeTableState.sortDir === 'asc' ? 1 : -1;
      if (employeeTableState.sortKey === 'name') return String(a.emp.name || '').localeCompare(String(b.emp.name || '')) * dir;
      if (employeeTableState.sortKey === 'salary') return (getEmployeeNominalSalary(a.emp) - getEmployeeNominalSalary(b.emp)) * dir;
      if (employeeTableState.sortKey === 'lastActivity') return (((a.info.lastActivity || 0) - (b.info.lastActivity || 0)) * dir);
      if (employeeTableState.sortKey === 'balance') return (a.info.liveBalance - b.info.liveBalance) * dir;
      if (employeeTableState.sortKey === 'status') {
        const order = { active: 1, inactive: 2 };
        return ((order[a.info.status] || 9) - (order[b.info.status] || 9)) * dir;
      }
      return 0;
    });

  if (!employees.length || !rows.length) {
    if (tableContainer) tableContainer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    tbody.innerHTML = '';
    return;
  }

  if (tableContainer) tableContainer.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';
  tbody.innerHTML = '';

  rows.forEach(({ emp, idx, info }) => {
    const lastAttendStr = info.lastActivity
      ? `${info.lastActivity.getFullYear()}-${String(info.lastActivity.getMonth() + 1).padStart(2, '0')}-${String(info.lastActivity.getDate()).padStart(2, '0')}`
      : 'لا توجد بيانات';
    let liveNet = 0;
    try {
      const res = calculateSalaryForEmployee(emp, { ...cfg, nominalSalary: getEmployeeNominalSalary(emp, cfg.nominalSalary) });
      liveNet = res.finalSalary || 0;
    } catch (e) { console.warn('Live calc error for', emp.name, e); }
    const row = document.createElement('tr');
    const statusClass = info.status === 'active' ? 'active' : 'inactive';
    const canSeeSalary = !window.PermissionService || window.PermissionService.checkField('employees', 'salary');
    const canSeeBalance = !window.PermissionService || window.PermissionService.checkField('employees', 'prevAdvance');
    const canUpdateEmployees = !window.PermissionService || window.PermissionService.check('employees', 'update');
    const salaryHtml = canSeeSalary
      ? `<td><div class="input-with-unit" style="max-width: 150px; margin: 0 auto;"><input type="number" class="salary-input form-input" id="salary_${idx}" value="${getEmployeeNominalSalary(emp)}" ${canUpdateEmployees ? '' : 'disabled'}></div></td>`
      : `<td><div style="color:var(--text-muted); font-size:11px; text-align:center;">🔒 مخفي</div></td>`;

    row.innerHTML = `
      <td>${escapeHtml(emp.name)}</td>
      ${salaryHtml}
      <td style="direction: ltr; text-align: right;">${lastAttendStr}</td>
      <td>
        <span class="status-badge ${statusClass}">${getEmployeeStatusLabel(info.status)}</span>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">صافي الشهر: <strong style="color:var(--accent-blue)">${canSeeSalary ? formatNum(liveNet) : '🔒'}</strong></div>
      </td>
      <td>
        <div style="font-size:11px; color:var(--text-secondary); margin-bottom:4px;">${formatSignedBalance(info.liveBalance)}</div>
        <div class="input-with-unit" style="max-width: 120px; margin: 0 auto;"><input type="number" class="balance-input form-input" id="balance_${idx}" value="${emp.prevAdvance || 0}" title="الذمة السابقة (يدوية)"></div>
      </td>
      <td><button class="btn-small btn-success employee-save-btn" onclick="saveEmployeeData(${idx})">💾 حفظ البيانات</button></td>
    `;
    if (!canSeeBalance && row.children[4]) {
      row.children[4].innerHTML = '<div style="color:var(--text-muted); font-size:11px; text-align:center;">🔒 مخفي</div>';
    }
    if (!canUpdateEmployees && row.children[5]) {
      row.children[5].innerHTML = '<button class="btn-small btn-secondary employee-save-btn" disabled title="لا تمتلك صلاحية تعديل بيانات الموظف">🔒</button>';
    }
    tbody.appendChild(row);
  });
}

function saveEmployeeDataLegacyDisabled(empIdx) {
  if (window.PermissionService && !window.PermissionService.check('employees', 'update')) {
    showToast('ليس لديك صلاحية تعديل بيانات الموظف', 'danger');
    return;
  }
  const balanceInput = document.getElementById(`balance_${empIdx}`);
  const salaryInput = document.getElementById(`salary_${empIdx}`);
  if (!balanceInput || !salaryInput) return;

  const newBalance = parseFloat(balanceInput.value) || 0;
  const newSalary = parseFloat(salaryInput.value) || 0;

  employees[empIdx].prevAdvance = newBalance;
  employees[empIdx].salary = newSalary;

  saveData();
  renderEmployeesTable();
  showToast(`تم حفظ بيانات ${employees[empIdx].name} بنجاح`, 'success');
}

// ─── Timesheet Page ───
// --- Finance Pages ---
function setFinanceDefaultsInForms() {
  const today = todayISO();
  ['expenseDate', 'incomeDate', 'receiptDate', 'cashboxDate', 'customerChargeDate'].forEach(id => {
    const el = document.getElementById(id);
    if (el && !el.value) el.value = today;
  });
}

function fillCategorySelect(selectId, kind) {
  ensureFinance();
  const select = document.getElementById(selectId);
  if (!select) return;
  const current = select.value;
  select.innerHTML = (finance.categories[kind] || []).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (current) select.value = current;
}

function fillCustomerSelect(selectId, includeEmpty = true) {
  ensureFinance();
  const select = document.getElementById(selectId);
  if (!select) return;
  const current = select.value;
  const empty = includeEmpty ? '<option value="">بدون عميل محدد</option>' : '';
  select.innerHTML = empty + finance.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (current) select.value = current;
}

function fillDepartmentSelect(selectId) {
  ensureFinance();
  const select = document.getElementById(selectId);
  if (!select) return;
  const current = select.value;
  select.innerHTML = finance.departments.map(d => `<option value="${d.id}">${d.name}</option>`).join('');
  if (current) select.value = current;
}

function fillPeopleSelect(selectId) {
  ensureFinance();
  const select = document.getElementById(selectId);
  if (!select) return;
  const current = select.value;
  const names = [
    ...employees.map(e => e.name).filter(Boolean),
    ...finance.parties.filter(p => p.type === 'person').map(p => p.name).filter(Boolean)
  ];
  const unique = [...new Set(names)];
  select.innerHTML = unique.length ? unique.map(name => `<option value="${name}">${name}</option>`).join('') : '<option value="">أضف شخص أولاً</option>';
  if (current) select.value = current;
}

function onExpenseSourceChange() {
  const source = document.getElementById('expenseSource')?.value || 'cashbox';
  const wrap = document.getElementById('expensePersonWrap');
  if (wrap) wrap.style.display = source === 'person_pocket' ? 'block' : 'none';
}

// T4.6 de-monolith: renderFinanceDashboard and renderV6FinanceOverview moved to modules/finance-ui.js


function renderExpensesPage() {
  ensureFinance();
  setFinanceDefaultsInForms();
  resetFinanceEditButtons();
  fillCategorySelect('expenseCategory', 'expense');
  fillDepartmentSelect('expenseDepartment');
  fillPeopleSelect('expensePerson');
  onExpenseSourceChange();
  const tbody = document.getElementById('expensesBody');
  if (!tbody) return;
  const rows = getFinanceTransactions().filter(tx => tx.type === 'expense' || tx.type === 'salary_payment').slice(0, 80);
  tbody.innerHTML = rows.length ? rows.map(tx => `
    <tr class="finance-editable-row" onclick="openExpenseEditor('${tx.id}')">
      <td>${tx.edited ? '<span class="finance-edited-dot" title="تم تعديل السجل"></span>' : ''}${tx.date}</td>
      <td>${getCategoryName('expense', tx.categoryId)}</td>
      <td>${getDepartmentName(tx.departmentId)}</td>
      <td>${tx.description || '-'}</td>
      <td>${tx.sourceType === 'person_pocket' ? `من جيب ${tx.paidByName || '-'}` : 'قاصة الورشة'}</td>
      <td class="finance-out">${formatNum(tx.amount)}</td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-cell">لا توجد مصروفات بعد</td></tr>';
}

function renderIncomePage() {
  ensureFinance();
  setFinanceDefaultsInForms();
  resetFinanceEditButtons();
  fillCategorySelect('incomeCategory', 'income');
  fillDepartmentSelect('incomeDepartment');
  fillCustomerSelect('incomeCustomer');
  const tbody = document.getElementById('incomeBody');
  if (!tbody) return;
  const rows = getFinanceTransactions().filter(tx => tx.type === 'income' || tx.type === 'sales_receipt').slice(0, 80);
  tbody.innerHTML = rows.length ? rows.map(tx => `
    <tr class="finance-editable-row" onclick="openIncomeEditor('${tx.id}')">
      <td>${tx.edited ? '<span class="finance-edited-dot" title="تم تعديل السجل"></span>' : ''}${tx.date}</td>
      <td>${getCategoryName('income', tx.categoryId)}</td>
      <td>${getDepartmentName(tx.departmentId)}</td>
      <td>${tx.description || '-'}</td>
      <td>${tx.partyName || '-'}</td>
      <td class="finance-in">${formatNum(tx.amount)}</td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="empty-cell">لا توجد واردات بعد</td></tr>';
}

function markFinanceRecordEdited(tx, changesText) {
  if (!tx) return;
  if (!Array.isArray(tx.editHistory)) tx.editHistory = [];
  tx.edited = true;
  tx.updatedAt = new Date().toISOString();
  tx.editHistory.push({ date: tx.updatedAt, text: changesText || 'تم تعديل السجل' });
}

function resetFinanceEditButtons() {
  const expenseBtn = document.getElementById('expenseSubmitBtn');
  if (expenseBtn) {
    expenseBtn.textContent = 'تسجيل المصروف';
    expenseBtn.onclick = addExpenseFromForm;
  }
  const incomeBtn = document.getElementById('incomeSubmitBtn');
  if (incomeBtn) {
    incomeBtn.textContent = 'تسجيل الوارد';
    incomeBtn.onclick = addIncomeFromForm;
  }
}

function openExpenseEditor(txId) {
  ensureFinance();
  const tx = finance.transactions.find(t => t.id === txId);
  if (!tx) return;
  document.getElementById('expenseDate').value = tx.date || todayISO();
  document.getElementById('expenseAmount').value = tx.amount || 0;
  document.getElementById('expenseCategory').value = tx.categoryId || '';
  document.getElementById('expenseDepartment').value = tx.departmentId || '';
  document.getElementById('expenseSource').value = tx.sourceType || 'cashbox';
  onExpenseSourceChange();
  if (document.getElementById('expensePerson')) document.getElementById('expensePerson').value = tx.paidByName || '';
  document.getElementById('expenseDescription').value = tx.description || '';
  const btn = document.getElementById('expenseSubmitBtn');
  if (btn) {
    btn.textContent = 'حفظ تعديل المصروف';
    btn.onclick = () => saveExpenseEdit(txId);
  }
}

function saveExpenseEdit(txId) {
  ensureFinance();
  const tx = finance.transactions.find(t => t.id === txId);
  if (!tx) return;
  tx.date = document.getElementById('expenseDate')?.value || tx.date || todayISO();
  tx.amount = asMoney(document.getElementById('expenseAmount')?.value);
  tx.categoryId = document.getElementById('expenseCategory')?.value || tx.categoryId;
  tx.departmentId = document.getElementById('expenseDepartment')?.value || tx.departmentId;
  tx.sourceType = document.getElementById('expenseSource')?.value || tx.sourceType || 'cashbox';
  tx.paymentMethod = tx.sourceType === 'cashbox' ? 'cash' : tx.paymentMethod || '';
  tx.paidByName = tx.sourceType === 'person_pocket' ? (document.getElementById('expensePerson')?.value || '') : '';
  tx.description = document.getElementById('expenseDescription')?.value?.trim() || tx.description;
  markFinanceRecordEdited(tx, 'تم تعديل المصروف');
  saveData();
  if (tx.v6_move_id && window.FinanceService) {
    (async () => {
      try {
        await FinanceService.unpostMove(tx.v6_move_id, { skip_backup: true });
        const lines = [
          { account_id: tx.accountId, debit: tx.amount, credit: 0, label: tx.description, partner_id: tx.paidByName || 'شريك عام' },
          { account_id: tx.sourceType === 'person_pocket' ? 'payables_people' : 'cash_workshop', debit: 0, credit: tx.amount, label: tx.description, partner_id: tx.paidByName || 'شريك عام' }
        ];
        await FinanceService.updateMove(tx.v6_move_id, {
          date: tx.date,
          amount: tx.amount,
          line_ids: lines,
          partner_id: tx.paidByName || 'شريك عام',
          skip_backup: true
        });
        await FinanceService.postMove(tx.v6_move_id, { skip_backup: true });
        console.log(`Updated V6 move ${tx.v6_move_id}`);
      } catch (err) {
        console.error('Failed to sync V6 edit:', err);
      }
    })();
  }
  financeRefreshAll();
  showToast('تم حفظ تعديل المصروف بدون إنشاء نسخة جديدة', 'success');
}

function openIncomeEditor(txId) {
  ensureFinance();
  const tx = finance.transactions.find(t => t.id === txId);
  if (!tx) return;
  document.getElementById('incomeDate').value = tx.date || todayISO();
  document.getElementById('incomeAmount').value = tx.amount || 0;
  document.getElementById('incomeCategory').value = tx.categoryId || '';
  document.getElementById('incomeDepartment').value = tx.departmentId || '';
  document.getElementById('incomeCustomer').value = tx.customerId || '';
  document.getElementById('incomeDescription').value = tx.description || '';
  const btn = document.getElementById('incomeSubmitBtn');
  if (btn) {
    btn.textContent = 'حفظ تعديل الوارد';
    btn.onclick = () => saveIncomeEdit(txId);
  }
}

function saveIncomeEdit(txId) {
  ensureFinance();
  const tx = finance.transactions.find(t => t.id === txId);
  if (!tx) return;
  const customerId = document.getElementById('incomeCustomer')?.value || '';
  const customer = finance.customers.find(c => c.id === customerId);
  tx.date = document.getElementById('incomeDate')?.value || tx.date || todayISO();
  tx.amount = asMoney(document.getElementById('incomeAmount')?.value);
  tx.categoryId = document.getElementById('incomeCategory')?.value || tx.categoryId;
  tx.departmentId = document.getElementById('incomeDepartment')?.value || tx.departmentId;
  tx.customerId = customerId;
  tx.partyName = customer?.name || tx.partyName || '';
  tx.description = document.getElementById('incomeDescription')?.value?.trim() || tx.description;
  tx.sourceType = tx.sourceType || 'cashbox';
  tx.paymentMethod = tx.paymentMethod || 'cash';
  markFinanceRecordEdited(tx, 'تم تعديل الوارد');
  saveData();
  if (tx.v6_move_id && window.FinanceService) {
    (async () => {
      try {
        await FinanceService.unpostMove(tx.v6_move_id, { skip_backup: true });
        const lines = [
          { account_id: 'cash_workshop', debit: tx.amount, credit: 0, label: tx.description, partner_id: tx.partyName || 'شريك عام' },
          { account_id: tx.accountId, debit: 0, credit: tx.amount, label: tx.description, partner_id: tx.partyName || 'شريك عام' }
        ];
        await FinanceService.updateMove(tx.v6_move_id, {
          date: tx.date,
          amount: tx.amount,
          line_ids: lines,
          partner_id: tx.partyName || 'شريك عام',
          skip_backup: true
        });
        await FinanceService.postMove(tx.v6_move_id, { skip_backup: true });
        console.log(`Updated V6 move ${tx.v6_move_id}`);
      } catch (err) {
        console.error('Failed to sync V6 edit:', err);
      }
    })();
  }
  financeRefreshAll();
  showToast('تم حفظ تعديل الوارد بدون إنشاء نسخة جديدة', 'success');
}





function renderReceiptPage() {
  ensureFinance();
  syncActiveOrgContextStrip('pageReceipt', 'receiptOrgContextStrip');
  setFinanceDefaultsInForms();
  const rawKind = document.getElementById('receiptKind')?.value || 'income';
  fillCategorySelect('receiptCategory', rawKind === 'expense' ? 'expense' : 'income');
  fillDepartmentSelect('receiptDepartment');
  fillCustomerSelect('receiptCustomer');
  const no = document.getElementById('receiptNo');
  if (no && !no.value) no.value = `REC-${String(finance.receipts.length + 1).padStart(4, '0')}`;
  updateReceiptPreview();
  renderSavedReceiptsList();
}


function renderSavedReceiptsList() {
  const body = document.getElementById('savedReceiptsBody');
  if (!body) return;
  body.innerHTML = finance.receipts.length ? finance.receipts.slice().reverse().map(r => `
    <tr>
      <td>${escapeHtml(r.receiptNo || r.id)}</td>
      <td>${escapeHtml(r.date || '-')}</td>
      <td>${r.kind === 'sales' ? 'وصل مبيعات' : r.kind === 'expense' ? 'وصل صرف' : 'وصل قبض'}</td>
      <td>${escapeHtml(r.partyName || '-')}</td>
      <td>${escapeHtml(r.description || '-')}</td>
      <td>${formatNum(r.amount || 0)}</td>
      <td>${formatNum(r.paidAmount ?? r.amount ?? 0)}</td>
      <td>${formatNum(r.remainingAmount || 0)}</td>
      <td>${r.paymentMethod === 'cash' ? 'نقداً' : escapeHtml(r.paymentMethod || '-')}</td>
      <td>${r.status === 'partial' ? 'جزئي' : 'مدفوع'}</td>
    </tr>
  `).join('') : '<tr><td colspan="10" class="empty-cell">لا توجد وصلات محفوظة بعد</td></tr>';
}

function renderCustomersPage() {
  ensureFinance();
  setFinanceDefaultsInForms();
  fillCustomerSelect('customerChargeSelect', false);
  fillDepartmentSelect('customerChargeDepartment');
  const tbody = document.getElementById('customersBody');
  if (!tbody) return;
  tbody.innerHTML = finance.customers.length ? finance.customers.map(c => {
    const customerTxs = finance.transactions.filter(tx => tx.customerId === c.id);
    const totalSales = customerTxs.filter(tx => tx.type === 'customer_charge' || tx.type === 'sales_receipt').reduce((sum, tx) => sum + asMoney(tx.amount), asMoney(c.openingBalance));
    const paidAmount = customerTxs.filter(tx => tx.type === 'income' || tx.type === 'sales_receipt').reduce((sum, tx) => sum + asMoney(tx.amount), 0);
    const remaining = getCustomerBalance(c);
    const direction = getCustomerBalanceDirection(c);
    const lastTx = customerTxs.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    return `
      <tr>
        <td>${escapeHtml(c.name)}</td>
        <td>${escapeHtml(c.companyName || '-')}</td>
        <td>${escapeHtml(c.shopName || '-')}</td>
        <td>${escapeHtml(c.phone || '-')}</td>
        <td>${formatNum(c.openingBalance || 0)}</td>
        <td class="${remaining > 0 ? 'finance-out' : remaining < 0 ? 'finance-in' : ''}">${formatNum(Math.abs(remaining))}</td>
        <td><span class="customer-balance-badge ${direction.className}">${direction.label}</span></td>
        <td>${escapeHtml(c.notes || '-')}<small class="customer-last-move">آخر حركة: ${escapeHtml(lastTx?.date || '-')} · مبيعات ${formatNum(totalSales)} · مدفوع ${formatNum(paidAmount)}</small></td>
      </tr>
    `;
  }).join('') : '<tr><td colspan="8" class="empty-cell">لا توجد أرصدة عملاء بعد</td></tr>';
}

// T4.6 de-monolith: Demo Data, Refresher, Deprecated V5 Move Tab / Form Handlers, and Reports moved to modules/finance-ui.js

function defaultOmniState() {
  return {
    kanban: {
      columns: [
        { id: 'kb_backlog', title: 'Backlog', color: '#94a3b8', wip: 99 },
        { id: 'kb_ready', title: 'جاهز للتنفيذ', color: '#38bdf8', wip: 8 },
        { id: 'kb_doing', title: 'قيد التنفيذ', color: '#a78bfa', wip: 5 },
        { id: 'kb_review', title: 'مراجعة وتسليم', color: '#f59e0b', wip: 4 },
        { id: 'kb_done', title: 'مكتمل', color: '#10b981', wip: 99 }
      ],
      cards: [
        { id: 'card_1', columnId: 'kb_ready', title: 'تجهيز قياسات مشروع الواجهة', owner: 'فريق الورشة', priority: 'High', dueDate: todayISO(), tags: ['قياسات', 'تصميم'], description: 'تدقيق القياسات وتحويلها للتنفيذ.', checklist: [{ text: 'استلام القياسات', done: true }, { text: 'مراجعة التصميم', done: false }] },
        { id: 'card_2', columnId: 'kb_doing', title: 'قص ليزر للطلبية الجديدة', owner: 'قسم الليزر', priority: 'Urgent', dueDate: todayISO(), tags: ['ليزر'], description: 'قص وتجهيز القطع حسب الملف المعتمد.', checklist: [{ text: 'رفع ملف DXF', done: true }, { text: 'فحص أول قطعة', done: false }] },
        { id: 'card_3', columnId: 'kb_review', title: 'فحص جودة نهائي', owner: 'الجودة', priority: 'Normal', dueDate: todayISO(), tags: ['QC'], description: 'مطابقة الأبعاد والتغليف.', checklist: [{ text: 'فحص الحواف', done: false }] }
      ]
    },
    workflow: {
      nodes: [
        { id: 'wf_start', type: 'trigger', title: 'استلام طلب', x: 80, y: 80, sop: 'استلام الطلب', description: 'نقطة بداية أي مشروع' },
        { id: 'wf_design', type: 'action', title: 'تصميم ومراجعة', x: 330, y: 80, sop: 'اعتماد التصميم', description: 'تحضير الملفات واعتمادها' },
        { id: 'wf_prod', type: 'operation', title: 'تنفيذ ورشة', x: 580, y: 190, sop: 'تشغيل الإنتاج', description: 'تحويل المهمة للكانبان' },
        { id: 'wf_qc', type: 'approval', title: 'فحص وتسليم', x: 830, y: 80, sop: 'فحص الجودة', description: 'مراجعة نهائية وتسليم' }
      ],
      edges: [
        { from: 'wf_start', to: 'wf_design', label: 'مكتمل' },
        { from: 'wf_design', to: 'wf_prod', label: 'معتمد' },
        { from: 'wf_prod', to: 'wf_qc', label: 'جاهز للفحص' }
      ],
      selectedFrom: null
    },
    taskManager: {
      selectedSpaceId: 'space_ops',
      spaces: [
        {
          id: 'space_ops',
          name: 'فضاء العمليات',
          departments: [
            {
              id: 'dep_workshop_ops',
              name: 'القسم: الورشة',
              sections: [
                {
                  id: 'sec_production',
                  name: 'المجموعة: الإنتاج',
                  taskTypes: [
                    {
                      id: 'type_job',
                      name: 'نوع المهمة: أمر تشغيل',
                      tasks: [
                        { id: 'task_sample', title: 'تنفيذ واجهة محل', status: 'In Progress', priority: 'High', owner: 'فريق الورشة', dueDate: todayISO(), subtasks: [{ id: 'sub_1', title: 'قص المواد', done: true }, { id: 'sub_2', title: 'تجميع وتركيب', done: false }] }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    },
    sops: [
      { id: 'sop_safety', title: 'سلامة ماكينة الليزر', type: 'إلزامي', owner: 'الورشة', text: 'قواعد السلامة الأساسية قبل التشغيل.' },
      { id: 'sop_qc', title: 'خطوات فحص الجودة', type: 'جودة', owner: 'الجودة', text: 'فحص الأبعاد والحواف والتغليف قبل التسليم.' }
    ]
  };
}

let isEnsuringOmni = false;
function ensureOmni() {
  if (isEnsuringOmni) {
    if (!omni || typeof omni !== 'object') omni = {};
    return omni;
  }
  isEnsuringOmni = true;
  try {
  const defaults = defaultOmniState();
  if (!omni || typeof omni !== 'object') omni = {};
  omni.kanban = omni.kanban || defaults.kanban;
  omni.kanban.columns = Array.isArray(omni.kanban.columns) && omni.kanban.columns.length ? omni.kanban.columns : defaults.kanban.columns;
  omni.kanban.cards = Array.isArray(omni.kanban.cards) ? omni.kanban.cards : defaults.kanban.cards;
  omni.workflow = omni.workflow || defaults.workflow;
  omni.workflow.nodes = Array.isArray(omni.workflow.nodes) && omni.workflow.nodes.length ? omni.workflow.nodes : defaults.workflow.nodes;
  omni.workflow.edges = Array.isArray(omni.workflow.edges) ? omni.workflow.edges : defaults.workflow.edges;
  omni.taskManager = omni.taskManager || defaults.taskManager;
  omni.taskManager.spaces = Array.isArray(omni.taskManager.spaces) && omni.taskManager.spaces.length ? omni.taskManager.spaces : defaults.taskManager.spaces;
  omni.taskManager.selectedSpaceId = omni.taskManager.selectedSpaceId || omni.taskManager.spaces[0]?.id;
  omni.sops = Array.isArray(omni.sops) && omni.sops.length ? omni.sops : defaults.sops;

  // V4 persistence — only add defaults when key is missing
  if (!Array.isArray(omni.machines) || !omni.machines.length) omni.machines = defaultMachines();
  if (!Array.isArray(omni.materials) || !omni.materials.length) omni.materials = defaultMaterials();
  if (!Array.isArray(omni.opPacks) || !omni.opPacks.length) omni.opPacks = defaultOpPacks();
  if (!Array.isArray(omni.qcRecords)) omni.qcRecords = defaultQcRecords();
  if (!Array.isArray(omni.orders)) omni.orders = [];
  normalizeEquipment();
  if (!omni.version) omni.version = 4;
  if (!Array.isArray(omni.migrationsApplied)) omni.migrationsApplied = [];
  normalizeAdminSettings();
  normalizeOmniUsersRolesPermissions();
  normalizeOmniNotifications();
  normalizeOmniRequests();
  normalizeOmniSystemLog();
  normalizeOmniHistoryLedger();
  normalizeOmniPurchaseOrders();
  normalizeOmniSuppliers();
  normalizeOmniDepartments();

  // Operational Linking Layer — normalize all cards and tasks
  normalizeOmniLinks();
  normalizeTaskManagerV2();
  normalizeKanbanCardUx();
  // SOP Library upgrade — normalize all SOPs to V2 schema
  normalizeSops();
  // Workflow node extensions — add new fields to existing nodes
  normalizeWorkflowNodes();
  normalizeOperationPackSteps();
  normalizeMachineQueues();
  normalizeMaterialReservations();
  normalizeQcRecords();
  normalizeQcTemplates();
  normalizeOperationPackQcFields();
  seedMissingDefaultOpPacks();
  // T5.6: seeds db.locations with the 4 canonical location IDs (LOC_MAIN, LOC_WIP,
  // LOC_SUPPLIERS, LOC_SCRAP) services/stockService.js hardcodes but nothing ever
  // created — without this, every stock move creation fails. Fire-and-forget:
  // ensureOmni() itself is synchronous. Defined in modules/stock-locations-seed.js.
  if (typeof seedMissingStockLocations === 'function') seedMissingStockLocations();
  if (typeof recalculateAllOpPackTotals === 'function') recalculateAllOpPackTotals();
  seedCompanyStructure();
  normalizeAutomation();
  normalizeSalesCrm();
  normalizeOmniWorkOrders();
  normalizeInventoryDeepening();
  ensureOmniSurfaceExamples();
  // One-time i18n migration: rename English seed data to Arabic
  if (!omni.__i18nMigrated) {
    const machMap = { 'Laser 120×90':'ليزر 120×90','Laser 100×80':'ليزر 100×80','Laser 125×250':'ليزر 125×250','CNC Router 125×250':'راوتر CNC 125×250','Fiber Galvo Marker':'ماركر ألياف ضوئية','3D Printer':'طابعة ثلاثية الأبعاد','Large Format Printer':'طابعة عريضة' };
    (omni.machines || []).forEach(m => { if (machMap[m.name]) m.name = machMap[m.name]; });
    const deptFix = s => s === 'Department: الورشة' ? 'القسم: الورشة' : s === 'Section: الإنتاج' ? 'المجموعة: الإنتاج' : s;
    (omni.taskManager?.spaces || []).forEach(sp => (sp.departments || []).forEach(dep => {
      dep.name = deptFix(dep.name);
      (dep.sections || []).forEach(sec => {
        sec.name = deptFix(sec.name);
        (sec.taskTypes || []).forEach(tt => (tt.tasks || []).forEach(t => { if (t.department) t.department = deptFix(t.department); if (t.section) t.section = deptFix(t.section); }));
      });
    }));
    (omni.kanban?.cards || []).forEach(c => { if (c.department) c.department = deptFix(c.department); });
    omni.__i18nMigrated = true;
  }
  // v2 migration: rename task manager spaces (separate flag so it runs even if v1 was already saved)
  if (!omni.__i18nMigrated2) {
    const spaceNameMap = { 'Operations Space':'فضاء العمليات','إعادة التدوير (Recycling)':'إعادة التدوير','الإعلانات (Advertising)':'الإعلانات','الذكاء الصناعي (AI)':'الذكاء الاصطناعي','الطابعة (Printing)':'الطابعة','المجتمع (Community)':'المجتمع','المنتجات (Products)':'المنتجات','الهندسي (Engineering)':'الهندسة','إدارة الورشة (Workshop Management)':'إدارة الورشة','الأشخاص (People & HR)':'الأشخاص والموارد البشرية','مشاريع العملاء (Client Projects)':'مشاريع العملاء' };
    (omni.taskManager?.spaces || []).forEach(sp => { if (spaceNameMap[sp.name]) sp.name = spaceNameMap[sp.name]; });
    // Translate Backlog column
    (omni.kanban?.columns || []).forEach(col => { if (col.title === 'Backlog') col.title = 'قيد الانتظار'; });
    omni.__i18nMigrated2 = true;
  }
  // v3 migration: translate op-pack names/steps stored in localStorage
  if (!omni.__i18nMigrated3) {
    const packNameMap = { 'Acrylic LED Sign Production':'إنتاج لافتة أكريليك مضيئة','MDF Router Decoration':'ديكور راوتر على MDF','3D Print Job':'طباعة ثلاثية الأبعاد','Fiber Marking Job':'نقش ليزر ألياف ضوئية','Large Format Printing':'طباعة عريضة','Maintenance Pack':'باقة الصيانة الدورية','باقة تشغيل CNC Router لقطع وتشكيل MDF':'باقة تشغيل راوتر CNC لقطع وتشكيل MDF' };
    const stepTitleMap = { 'تحضير Toolpath':'تحضير مسار الأداة','حجز CNC Router':'حجز راوتر CNC','تحضير Slice':'تحضير التقطيع','حجز Fiber Galvo':'حجز ماركر الألياف' };
    (omni.opPacks || []).forEach(p => {
      if (packNameMap[p.name]) p.name = packNameMap[p.name];
      if (packNameMap[p.description]) p.description = packNameMap[p.description];
      (p.steps || []).forEach(s => { if (stepTitleMap[s.title]) s.title = stepTitleMap[s.title]; });
    });
    omni.__i18nMigrated3 = true;
  }
  // v4 migration: translate MRP BOM product names
  if (!omni.__i18nMigrated4) {
    const bomNameMap = { 'Acrylic LED Sign Production':'إنتاج لافتة أكريليك مضيئة','MDF Router Decoration':'ديكور راوتر على MDF','3D Print Job':'طباعة ثلاثية الأبعاد','Fiber Marking Job':'نقش ليزر ألياف ضوئية','Large Format Printing':'طباعة عريضة','Maintenance Pack':'باقة الصيانة الدورية' };
    (omni.boms || []).forEach(b => { if (bomNameMap[b.productName]) b.productName = bomNameMap[b.productName]; });
    omni.__i18nMigrated4 = true;
  }
  // v5 migration: strip remaining "Department:", "Section:", "Task Type:" English prefixes and fix SOP titles
  if (!omni.__i18nMigrated5) {
    const fixPrefixed = s => {
      if (!s) return s;
      return s.replace(/^Department:\s*/i, 'القسم: ').replace(/^Section:\s*/i, 'المجموعة: ').replace(/^Task Type:\s*/i, 'نوع المهمة: ');
    };
    (omni.taskManager?.spaces || []).forEach(sp => {
      (sp.departments || []).forEach(dep => {
        dep.name = fixPrefixed(dep.name);
        (dep.sections || []).forEach(sec => {
          sec.name = fixPrefixed(sec.name);
          (sec.taskTypes || []).forEach(tt => {
            tt.name = fixPrefixed(tt.name);
            (tt.tasks || []).forEach(t => { if (t.department) t.department = fixPrefixed(t.department); if (t.section) t.section = fixPrefixed(t.section); });
          });
        });
      });
    });
    (omni.kanban?.cards || []).forEach(c => { if (c.department) c.department = fixPrefixed(c.department); if (c.section) c.section = fixPrefixed(c.section); });
    (omni.jobOrders || []).forEach(j => { if (j.department) j.department = fixPrefixed(j.department); });
    (omni.sops || []).forEach(s => { if (s.title) s.title = s.title.replace(/\s*-?\s*Brand Guidelines/gi, ''); });
    omni.__i18nMigrated5 = true;
  }
  if (!omni.__i18nMigrated6) {
    const fixPhone = p => typeof p === 'string' ? p.replace(/x{4,}/gi, '0000000') : p;
    (omni.appointments?.bookings || []).forEach(b => { if (b.customerPhone) b.customerPhone = fixPhone(b.customerPhone); });
    (omni.events?.registrations || []).forEach(r => { if (r.contact) r.contact = fixPhone(r.contact); });
    (omni.loyalty?.members || []).forEach(m => { if (m.phone) m.phone = fixPhone(m.phone); });
    (omni.visitors?.visits || []).forEach(v => { if (v.contact) v.contact = fixPhone(v.contact); });
    (omni.peopleOps?.candidates || []).forEach(c => { if (c.phone) c.phone = fixPhone(c.phone); });
    (omni.esign?.requests || []).forEach(r => { if (r.signerContact) r.signerContact = fixPhone(r.signerContact); });
    (omni.qcRecords || []).forEach(q => {
      if (q.machineId === 'm_laser_1') q.machineId = 'mach_laser_120';
      if (q.machineId === 'm_oven_1') q.machineId = '';
    });
    omni.__i18nMigrated6 = true;
    saveData();
  }
  return omni;
  } finally {
    isEnsuringOmni = false;
  }
}

function countTaskManagerTasksInSpace(space) {
  let total = 0;
  (space?.departments || []).forEach(dep => {
    (dep.sections || []).forEach(sec => {
      (sec.taskTypes || []).forEach(type => {
        total += (type.tasks || []).filter(task => !task.deleted && !task.archived).length;
      });
    });
  });
  return total;
}

function chooseTaskManagerSurfaceSpace() {
  const spaces = omni?.taskManager?.spaces || [];
  if (!spaces.length) return '';
  const current = spaces.find(space => space.id === omni.taskManager.selectedSpaceId);
  if (current && countTaskManagerTasksInSpace(current) > 0) return current.id;
  return spaces.find(space => countTaskManagerTasksInSpace(space) > 0)?.id || current?.id || spaces[0].id;
}

function ensureOmniSurfaceExamples() {
  if (!omni || typeof omni !== 'object') omni = {};
  const spaces = omni.taskManager?.spaces || [];
  // T5.9 (2026-07-16): only auto-pick a surface space when the current
  // selection is missing/invalid. This used to run UNCONDITIONALLY on every
  // ensureOmni(), and chooseTaskManagerSurfaceSpace() bounces off any space
  // with zero tasks — so clicking any of the user's 10 empty spaces (إعادة
  // التدوير، الإعلانات، الهندسة…) snapped straight back to فضاء العمليات,
  // making 10 of 11 spaces permanently unreachable from the UI. An explicit,
  // valid user choice must stick; the auto-pick is only a first-boot default.
  if (spaces.length && !spaces.some(space => space.id === omni.taskManager.selectedSpaceId)) {
    omni.taskManager.selectedSpaceId = chooseTaskManagerSurfaceSpace();
  }
  if (!Array.isArray(omni.requests)) omni.requests = [];
  if (!(omni.requests || []).some(req => req.id === 'demo_req_surface_purchase')) {
    omni.requests.unshift({
      id: 'demo_req_surface_purchase',
      type: 'purchase',
      title: 'طلب شراء تجريبي: أكريلك ومستلزمات تشغيل',
      description: 'مثال ظاهر للمراجعة في مركز القيادة حتى لا تكون صفحة الموافقات فارغة أثناء الفحص.',
      requesterName: 'النظام التجريبي',
      requesterId: 'system',
      sourcePage: 'inventory',
      sourceType: 'demo_seed',
      sourceId: 'demo_inventory_request',
      priority: 'high',
      status: 'pending',
      payload: { demo: true, material: 'Acrylic', qty: 12, unit: 'لوح' },
      createdAt: new Date().toISOString(),
      decidedAt: '',
      decidedBy: '',
      decisionNote: '',
      activityLog: [{ date: new Date().toISOString(), text: 'Demo request seeded for surface review.' }]
    });
  }
  if (!Array.isArray(omni.workOrders)) omni.workOrders = [];
  if (!omni.workOrders.length && (omni.opPacks || []).length && (omni.kanban?.cards || []).length) {
    const cards = (omni.kanban.cards || []).slice(0, 4);
    const pack = (omni.opPacks || []).find(p => (p.steps || []).length) || omni.opPacks[0];
    const machine = (omni.machines || [])[0] || {};
    cards.forEach((card, index) => {
      const step = (pack.steps || [])[index % Math.max(1, (pack.steps || []).length)] || {};
      const wo = {
        id: `demo_wo_surface_${index + 1}`,
        cardId: card.id,
        opPackId: pack.id,
        opPackStepId: step.id || '',
        title: `مثال تشغيل: ${card.title || step.title || 'أمر عمل'}`,
        machineId: (card.machineIds || [])[0] || step.machineId || machine.id || '',
        operatorId: '',
        operatorName: card.owner || machine.operator || 'فريق الورشة',
        status: index === 0 ? 'progress' : index === 1 ? 'ready' : 'draft',
        plannedMinutes: Number(card.estimatedMinutes || step.estimatedMinutes || step.minutes || 90),
        actualMinutes: index === 0 ? 25 : 0,
        costPerHour: Number(machine.costPerHour || 5000),
        materialRequirements: Array.isArray(card.materialRequirements) ? card.materialRequirements : [],
        scrapMaterials: [],
        qcRecordId: '',
        timeLogs: index === 0 ? [{ startTime: new Date(Date.now() - 25 * 60000).toISOString(), endTime: '', pauseReason: '', operatorId: '' }] : [],
        createdAt: new Date().toISOString(),
        startedAt: index === 0 ? new Date(Date.now() - 25 * 60000).toISOString() : '',
        completedAt: ''
      };
      omni.workOrders.push(wo);
      card.workOrderId = card.workOrderId || wo.id;
    });
  }
}

function resetSurfaceViewStateForExamples() {
  if (typeof kanbanFilters !== 'undefined') {
    kanbanFilters = { search: "", owner: "all", assigneeId: "all", priority: "all", department: "all", machineId: "all", risk: "all", due: "all", qc: "all", sop: "all", status: "all" };
    omniKanbanFilters = kanbanFilters;
    kanbanGroupBy = 'none';
  }
  if (typeof taskManagerFilters !== 'undefined') {
    taskManagerFilters = { search: '', department: 'all', assigneeId: 'all', status: 'all', priority: 'all', due: 'all', linked: 'all', source: 'all', opPackId: 'all' };
  }
  if (typeof sopFilterDept !== 'undefined') sopFilterDept = '';
  if (typeof sopFilterMachine !== 'undefined') sopFilterMachine = '';
  if (typeof sopFilterStatus !== 'undefined') sopFilterStatus = '';
  if (typeof sopFilterType !== 'undefined') sopFilterType = '';
  if (typeof inventoryFilters !== 'undefined') inventoryFilters = { search: '', category: 'all', status: 'all' };
  window.mrpActiveTab = 'packs';
  window.inventoryActiveTab = 'materials';
  try {
    localStorage.removeItem('task_manager_view_v2');
    localStorage.removeItem('workflow_viewport_v1');
  } catch (error) {}
}

function seedCompanyStructure() {
  if (omni.companySeededV1) return;

  // 1. Task Manager Spaces
  const newSpaces = [
    { id: makeId('space'), name: 'إعادة التدوير', departments: [{ id: makeId('dep'), name: 'عمليات', sections: []}, { id: makeId('dep'), name: 'جودة', sections: []}] },
    { id: makeId('space'), name: 'الإعلانات', departments: [{ id: makeId('dep'), name: 'حملات', sections: []}, { id: makeId('dep'), name: 'تصميم', sections: []}] },
    { id: makeId('space'), name: 'الذكاء الاصطناعي', departments: [{ id: makeId('dep'), name: 'تطوير', sections: []}] },
    { id: makeId('space'), name: 'الطابعة', departments: [{ id: makeId('dep'), name: 'تحضير', sections: []}, { id: makeId('dep'), name: 'طباعة', sections: []}, { id: makeId('dep'), name: 'تغليف', sections: []}] },
    { id: makeId('space'), name: 'المجتمع', departments: [{ id: makeId('dep'), name: 'مبادرات', sections: []}] },
    { id: makeId('space'), name: 'المنتجات', departments: [{ id: makeId('dep'), name: 'أبحاث', sections: []}, { id: makeId('dep'), name: 'تصنيع', sections: []}] },
    { id: makeId('space'), name: 'الهندسة', departments: [{ id: makeId('dep'), name: 'تصميم هندسي', sections: []}, { id: makeId('dep'), name: 'تصنيع رقمي', sections: []}] },
    { id: makeId('space'), name: 'إدارة الورشة', departments: [{ id: makeId('dep'), name: 'استراتيجية', sections: []}, { id: makeId('dep'), name: 'أرشيف', sections: []}] },
    { id: makeId('space'), name: 'الأشخاص والموارد البشرية', departments: [{ id: makeId('dep'), name: 'موظفين', sections: []}, { id: makeId('dep'), name: 'شركاء', sections: []}] },
    { id: makeId('space'), name: 'مشاريع العملاء', departments: [{ id: makeId('dep'), name: 'نشط', sections: []}, { id: makeId('dep'), name: 'مقترح', sections: []}, { id: makeId('dep'), name: 'مكتمل', sections: []}] }
  ];

  if (!omni.taskManager) omni.taskManager = { spaces: [] };
  // Prepend to spaces if they don't already exist to avoid duplication
  const existingSpaceNames = omni.taskManager.spaces.map(s => s.name);
  const spacesToAdd = newSpaces.filter(s => !existingSpaceNames.includes(s.name));
  omni.taskManager.spaces = [...spacesToAdd, ...(omni.taskManager.spaces || [])];

  // 2. SOP Hub stubs
  const newSops = [
    { id: makeId('sop'), title: 'دليل هوية الورشة', type: 'Strategy', owner: 'إدارة الورشة', text: 'شعار الورشة، الألوان، الرؤية والرسالة.' },
    { id: makeId('sop'), title: 'دليل التشغيل للطباعة', type: 'Operations', owner: 'الطابعة', text: 'خطوات ما قبل الطباعة (Pre-press)، إعداد الماكينة، والمراقبة.' },
    { id: makeId('sop'), title: 'دليل جودة التصنيع الهندسي', type: 'Operations', owner: 'الهندسي', text: 'فحص الحواف، الأبعاد، والتجميع النهائي.' }
  ];
  if (!omni.sops) omni.sops = [];
  omni.sops.push(...newSops);

  // 3. Workflow Templates for specific lines
  if (!omni.workflow) omni.workflow = { nodes: [], edges: [], version: 1 };
  if (omni.workflow.nodes.length === 0) {
    omni.workflow.nodes = [
      { id: 'node_1', type: 'trigger', title: 'بداية خط الطباعة', x: 50, y: 150, assignedRole: 'إدارة الورشة' },
      { id: 'node_2', type: 'human_task', title: 'تجهيز ملف الطباعة (Pre-press)', x: 250, y: 150, assignedRole: 'الطابعة' },
      { id: 'node_3', type: 'machine', title: 'عملية الطباعة', x: 450, y: 150, assignedRole: 'الطابعة' },
      { id: 'node_4', type: 'qc', title: 'فحص الألوان والجودة', x: 650, y: 150, assignedRole: 'إدارة الورشة' },
      { id: 'node_5', type: 'inventory', title: 'تغليف وتجهيز للتسليم', x: 850, y: 150, assignedRole: 'المنتجات' }
    ];
    omni.workflow.edges = [
      { id: 'e1', source: 'node_1', target: 'node_2', type: 'success' },
      { id: 'e2', source: 'node_2', target: 'node_3', type: 'success' },
      { id: 'e3', source: 'node_3', target: 'node_4', type: 'success' },
      { id: 'e4', source: 'node_4', target: 'node_5', type: 'success' },
      { id: 'e5', source: 'node_4', target: 'node_3', type: 'fail' }
    ];
  }

  omni.companySeededV1 = true;
}

function normalizeOmniDepartments() {
  if (!Array.isArray(omni.departments)) omni.departments = [];
  DEFAULT_OMNI_DEPARTMENTS.forEach(name => {
    if (!omni.departments.some(dep => String(dep.name || dep).trim() === name)) {
      omni.departments.push({ id: makeId('dept'), name });
    }
  });
  if (!omni.migrationsApplied.includes('omni_departments_v1')) omni.migrationsApplied.push('omni_departments_v1');
}

function normalizeKanbanCardUx() {
  (omni.kanban.cards || []).forEach(card => {
    if (!card.id) card.id = "card_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    if (!KANBAN_CARD_COLORS.includes(card.color)) card.color = KANBAN_CARD_COLORS.includes(card.accentColor) ? card.accentColor : 'default';
    if (card.accentColor === undefined) card.accentColor = card.color;
    if (card.assigneeId === undefined) card.assigneeId = '';
    if (card.department === undefined) card.department = card.branch || card.section || '';
    if (!Array.isArray(card.comments)) card.comments = [];
    if (!Array.isArray(card.activityLog)) card.activityLog = [];
    if (!Array.isArray(card.sopIds)) card.sopIds = [];
    if (!Array.isArray(card.machineIds)) card.machineIds = [];
    if (!Array.isArray(card.materialRequirements)) card.materialRequirements = [];
    if (!Array.isArray(card.qcRecordIds)) card.qcRecordIds = [];
    if (!Array.isArray(card.costEntries)) card.costEntries = [];
    if (!Array.isArray(card.dependencies)) card.dependencies = [];
    if (!Array.isArray(card.attachments)) card.attachments = [];
    if (card.status === undefined) card.status = '';
    if (!card.createdAt) card.createdAt = new Date().toISOString();
  });
  if (!omni.migrationsApplied.includes('kanban_card_ux_v1')) omni.migrationsApplied.push('kanban_card_ux_v1');
  if (!omni.migrationsApplied.includes('kanban_executive_board_v2')) omni.migrationsApplied.push('kanban_executive_board_v2');
}

function normalizeOmniNotifications() {
  if (!Array.isArray(omni.notifications)) omni.notifications = [];
  omni.notifications.forEach(n => {
    if (!n.id) n.id = makeId('ntf');
    if (!n.type) n.type = 'system';
    if (!n.title) n.title = 'إشعار';
    if (n.message === undefined) n.message = '';
    if (n.sourcePage === undefined) n.sourcePage = '';
    if (n.sourceType === undefined) n.sourceType = '';
    if (n.sourceId === undefined) n.sourceId = '';
    if (!n.severity) n.severity = 'info';
    if (!n.status) n.status = 'unread';
    if (!n.createdAt) n.createdAt = new Date().toISOString();
    if (n.readAt === undefined) n.readAt = '';
    if (n.actionLabel === undefined) n.actionLabel = '';
    if (n.actionPage === undefined) n.actionPage = '';
    if (n.actionPayload === undefined) n.actionPayload = {};
    if (n.targetUserId === undefined) n.targetUserId = '';
    if (n.targetRole === undefined) n.targetRole = '';
    if (n.targetName === undefined) n.targetName = '';
  });
  if (!omni.migrationsApplied.includes('omni_notifications_v1')) omni.migrationsApplied.push('omni_notifications_v1');
}

function normalizeOmniUsersRolesPermissions() {
  if (!Array.isArray(omni.users)) omni.users = [];
  if (!Array.isArray(omni.roles)) omni.roles = [];
  if (!Array.isArray(omni.userRoles)) omni.userRoles = [];
  if (!omni.permissions || typeof omni.permissions !== 'object' || Array.isArray(omni.permissions)) omni.permissions = {};
  const now = new Date().toISOString();
  const activeProfile = (() => {
    try {
      if (typeof getActiveOrgProfile === 'function') return getActiveOrgProfile() || {};
    } catch (_) {}
    const org = omni.adminSettings?.organization || {};
    const companies = Array.isArray(org.companies) ? org.companies : [];
    const company = companies.find(c => c.id === org.activeCompanyId) || companies.find(c => c.isPrimary) || companies[0] || {};
    return { companyId: company.id || org.activeCompanyId || '', companyName: company.name || org.name || '' };
  })();
  const defaults = [
    { id: 'manager', name: 'مدير', permissions: ['all'] },
    { id: 'employee', name: 'موظف', permissions: ['employee_ui', 'create_request', 'view_own_requests'] },
    { id: 'operator', name: 'مشغل', permissions: ['kanban_view', 'task_update', 'qc_view'] },
    { id: 'system_admin', name: 'مدير النظام', groups: ['system.admin'], permissions: ['all'], source: 'phase6d_seed' },
    { id: 'finance_manager', name: 'مدير المالية', groups: ['finance.manager'], permissions: ['finance_manage', 'approval_route', 'coa_manage_safe'], source: 'phase6d_seed' },
    { id: 'workshop_manager', name: 'مدير الورشة', groups: ['workshop.manager'], permissions: ['workshop_manage', 'inventory_manage', 'approval_route'], source: 'phase6d_seed' },
    { id: 'operator_user', name: 'مشغل', groups: ['workshop.user'], permissions: ['kanban_view', 'task_update', 'inventory_transfer'], source: 'phase6d_seed' },
    { id: 'employee_user', name: 'موظف', groups: [], permissions: ['employee_ui', 'create_request', 'view_own_requests'], source: 'phase6d_seed' },
    { id: 'viewer_user', name: 'مراقب قراءة', groups: [], permissions: ['read_only'], source: 'phase6d_seed' }
  ];
  defaults.forEach(role => {
    const existing = omni.roles.find(r => r.id === role.id);
    if (existing) {
      existing.name = existing.name || role.name;
      if (!Array.isArray(existing.permissions)) existing.permissions = role.permissions.slice();
      if (!Array.isArray(existing.groups) && Array.isArray(role.groups)) existing.groups = role.groups.slice();
      existing.source = existing.source || role.source || 'legacy';
    } else {
      omni.roles.push({ ...role, permissions: role.permissions.slice(), groups: Array.isArray(role.groups) ? role.groups.slice() : [] });
    }
    if (!Array.isArray(omni.permissions[role.id])) omni.permissions[role.id] = role.permissions.slice();
  });
  const phase6dUsers = [
    { id: 'system_admin', displayName: 'مدير النظام', role: 'system_admin', roleId: 'system_admin', groups: ['system.admin'] },
    { id: 'finance_manager', displayName: 'مدير المالية', role: 'finance_manager', roleId: 'finance_manager', groups: ['finance.manager'] },
    { id: 'workshop_manager', displayName: 'مدير الورشة', role: 'workshop_manager', roleId: 'workshop_manager', groups: ['workshop.manager'] },
    { id: 'operator_user', displayName: 'مشغل الورشة', role: 'operator_user', roleId: 'operator_user', groups: ['workshop.user'] },
    { id: 'employee_user', displayName: 'موظف', role: 'employee_user', roleId: 'employee_user', groups: [] },
    { id: 'viewer_user', displayName: 'مراقب قراءة', role: 'viewer_user', roleId: 'viewer_user', groups: [] }
  ];
  phase6dUsers.forEach(seed => {
    const existing = omni.users.find(u => u.id === seed.id);
    if (existing) {
      existing.displayName = existing.displayName || existing.name || seed.displayName;
      existing.name = existing.name || existing.displayName || seed.displayName;
      existing.role = existing.role || seed.role;
      existing.roleId = existing.roleId || seed.roleId;
      if (!Array.isArray(existing.groups)) existing.groups = seed.groups.slice();
      existing.status = existing.status || 'active';
      if (existing.is_active === undefined) existing.is_active = existing.status !== 'inactive';
      existing.companyId = existing.companyId || activeProfile.companyId || '';
      existing.tenantId = existing.tenantId || activeProfile.companyId || '';
      existing.companyName = existing.companyName || activeProfile.companyName || '';
      existing.source = existing.source || 'phase6d_seed';
      existing.createdAt = existing.createdAt || now;
    } else {
      omni.users.push({
        ...seed,
        name: seed.displayName,
        status: 'active',
        is_active: true,
        companyId: activeProfile.companyId || '',
        tenantId: activeProfile.companyId || '',
        companyName: activeProfile.companyName || '',
        createdAt: now,
        source: 'phase6d_seed',
        permissions: []
      });
    }
    if (!omni.userRoles.some(link => link.userId === seed.id && link.roleId === seed.roleId)) {
      omni.userRoles.push({ userId: seed.id, roleId: seed.roleId, source: 'phase6d_seed', createdAt: now });
    }
  });
  omni.users.forEach(user => {
    if (!user.id) user.id = makeId('user');
    if (!user.displayName && user.name) user.displayName = user.name;
    if (!user.name) user.name = user.displayName || 'مستخدم';
    if (!user.roleId) user.roleId = 'employee';
    if (!user.role) user.role = user.roleId;
    if (!Array.isArray(user.permissions)) user.permissions = [];
    if (!Array.isArray(user.groups)) {
      const role = omni.roles.find(r => r.id === user.roleId || r.id === user.role);
      user.groups = Array.isArray(role?.groups) ? role.groups.slice() : [];
    }
    if (!user.status) user.status = 'active';
    if (user.is_active === undefined) user.is_active = user.status !== 'inactive';
    if (!user.createdAt) user.createdAt = now;
    if (!user.source) user.source = 'legacy';
  });
  if (!omni.migrationsApplied.includes('omni_permissions_foundation_v1')) omni.migrationsApplied.push('omni_permissions_foundation_v1');
  if (!omni.migrationsApplied.includes('phase6d_real_users_foundation_v1')) omni.migrationsApplied.push('phase6d_real_users_foundation_v1');
}

function normalizeOmniSystemLog() {
  if (!Array.isArray(omni.systemLog)) omni.systemLog = [];
  omni.systemLog.forEach(log => {
    if (!log.id) log.id = makeId('log');
    if (!log.date) log.date = new Date().toISOString();
    if (!log.actor) log.actor = 'النظام';
    if (!log.action) log.action = 'system';
    if (!log.message) log.message = log.text || '';
    if (log.page === undefined) log.page = log.source || '';
    if (log.entityType === undefined) log.entityType = '';
    if (log.entityId === undefined) log.entityId = '';
    if (!log.severity) log.severity = 'info';
  });
  if (!omni.migrationsApplied.includes('omni_system_log_v1')) omni.migrationsApplied.push('omni_system_log_v1');
}

function getOmniHistoryActor() {
  const authUser = window.PentagonAuth?.getCurrentUser?.();
  if (authUser?.id || authUser?.name) {
    return { id: authUser.id || 'system', name: authUser.name || 'النظام', role: (authUser.groups || []).join(',') };
  }
  return { id: 'system', name: 'النظام', role: 'system' };
}

function sanitizeOmniHistoryPayload(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 4) return '[truncated]';
  if (Array.isArray(value)) return value.slice(0, 40).map(item => sanitizeOmniHistoryPayload(item, depth + 1));
  if (typeof value === 'object') {
    const result = {};
    Object.keys(value).slice(0, 80).forEach(key => {
      const lower = key.toLowerCase();
      if (lower.includes('token') || lower.includes('secret') || lower.includes('apikey') || lower.includes('api_key') || lower.includes('password') || lower.includes('authorization')) {
        result[key] = '[redacted]';
      } else if (key === 'base64' || key === 'dataUrl' || key === 'binary' || key === 'fileData') {
        result[key] = '[media omitted]';
      } else {
        result[key] = sanitizeOmniHistoryPayload(value[key], depth + 1);
      }
    });
    return result;
  }
  if (typeof value === 'string' && value.length > 1200) return `${value.slice(0, 1200)}...`;
  return value;
}

function normalizeOmniHistoryEvent(event = {}) {
  if (!event.id) event.id = makeId('hist');
  if (!event.eventId) event.eventId = event.id;
  if (!event.timestamp) event.timestamp = event.createdAt || event.date || new Date().toISOString();
  if (!event.module) event.module = event.sourceModule || event.page || 'system';
  if (!event.source) event.source = event.sourceType || event.module || 'dashboard';
  if (!event.action) event.action = event.eventType || event.type || 'event';
  if (!event.title) event.title = event.message || event.text || event.action || 'History event';
  if (event.description === undefined) event.description = '';
  if (!event.actorId || !event.actorName) {
    const actor = getOmniHistoryActor();
    event.actorId = event.actorId || actor.id;
    event.actorName = event.actorName || event.actor || actor.name;
    event.actorRole = event.actorRole || actor.role;
  }
  if (event.correlationId === undefined) event.correlationId = event.sourceMessageId || event.aiRunId || event.approvalRequestId || event.createdRecordId || event.recordId || event.id;
  if (event.recordId === undefined) event.recordId = event.entityId || event.createdRecordId || '';
  if (event.recordType === undefined) event.recordType = event.entityType || '';
  if (!event.status) event.status = 'logged';
  if (event.risk === undefined) event.risk = '';
  if (event.payload === undefined) event.payload = {};
  event.payload = sanitizeOmniHistoryPayload(event.payload);
  if (event.before === undefined) event.before = null;
  if (event.after === undefined) event.after = null;
  event.before = sanitizeOmniHistoryPayload(event.before);
  event.after = sanitizeOmniHistoryPayload(event.after);
  return event;
}

function normalizeOmniHistoryLedger() {
  if (!Array.isArray(omni.historyLedger)) omni.historyLedger = [];
  omni.historyLedger.forEach(normalizeOmniHistoryEvent);
  omni.historyLedger.sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
  if (omni.historyLedger.length > 2000) omni.historyLedger = omni.historyLedger.slice(0, 2000);
  if (!omni.migrationsApplied.includes('omni_history_ledger_v1')) omni.migrationsApplied.push('omni_history_ledger_v1');
}

function recordOmniHistoryEvent(entry = {}) {
  ensureOmni();
  const event = normalizeOmniHistoryEvent({
    id: entry.id,
    eventId: entry.eventId,
    timestamp: entry.timestamp || entry.createdAt,
    module: entry.module || entry.page,
    source: entry.source || entry.sourceType,
    action: entry.action || entry.eventType || entry.type,
    title: entry.title || entry.message,
    description: entry.description || entry.detail || '',
    actorId: entry.actorId,
    actorName: entry.actorName || entry.actor,
    actorRole: entry.actorRole,
    correlationId: entry.correlationId,
    sourceMessageId: entry.sourceMessageId,
    whatsappSenderId: entry.whatsappSenderId,
    mediaId: entry.mediaId,
    aiRunId: entry.aiRunId,
    approvalRequestId: entry.approvalRequestId,
    createdRecordId: entry.createdRecordId,
    recordId: entry.recordId || entry.entityId,
    recordType: entry.recordType || entry.entityType,
    status: entry.status,
    risk: entry.risk,
    payload: entry.payload || entry.data || {},
    before: entry.before,
    after: entry.after
  });
  omni.historyLedger.unshift(event);
  if (omni.historyLedger.length > 2000) omni.historyLedger = omni.historyLedger.slice(0, 2000);
  return event;
}

function formatHistoryPayload(value) {
  if (value === null || value === undefined || value === '') return '';
  try {
    return escapeHtml(JSON.stringify(value, null, 2));
  } catch (error) {
    return escapeHtml(String(value));
  }
}

function normalizeOmniRequests() {
  if (!Array.isArray(omni.requests)) omni.requests = [];
  omni.requests.forEach(req => {
    if (!req.id) req.id = makeId('oreq');
    if (!req.type) req.type = 'general';
    if (!req.title) req.title = 'طلب';
    if (req.description === undefined) req.description = '';
    if (req.requesterId === undefined) req.requesterId = '';
    if (req.requesterName === undefined) req.requesterName = '';
    if (req.sourcePage === undefined) req.sourcePage = '';
    if (req.sourceType === undefined) req.sourceType = '';
    if (req.sourceId === undefined) req.sourceId = '';
    if (!req.status) req.status = 'pending';
    if (!req.priority) req.priority = 'normal';
    if (req.payload === undefined) req.payload = {};
    if (!req.createdAt) req.createdAt = new Date().toISOString();
    if (req.decidedAt === undefined) req.decidedAt = '';
    if (req.decidedBy === undefined) req.decidedBy = '';
    if (req.decisionNote === undefined) req.decisionNote = '';
    if (!Array.isArray(req.activityLog)) req.activityLog = [];
  });
  if (!omni.migrationsApplied.includes('omni_requests_v1')) omni.migrationsApplied.push('omni_requests_v1');
}

function normalizeOmniPurchaseOrders() {
  if (!Array.isArray(omni.purchaseOrders)) omni.purchaseOrders = [];
  omni.purchaseOrders.forEach(po => {
    if (!po.id) po.id = makeId('po');
    if (po.requestId === undefined) po.requestId = '';

    // Support multi-line items. If missing, initialize from single-line properties
    if (!Array.isArray(po.items)) {
      po.items = [{
        materialId: po.materialId || '',
        materialName: po.materialName || 'مادة',
        qty: Number(po.approvedQty ?? po.requestedQty ?? 0) || 0,
        receivedQty: Number(po.receivedQty ?? 0) || 0,
        unit: po.unit || '',
        unitCost: Number(po.unitCost ?? 0) || 0
      }];
    }

    // Normalize items
    po.items.forEach(item => {
      if (item.materialId === undefined) item.materialId = '';
      if (item.materialName === undefined) item.materialName = '';
      if (item.qty === undefined) item.qty = 0;
      if (item.receivedQty === undefined) item.receivedQty = 0;
      if (item.unit === undefined) item.unit = '';
      if (item.unitCost === undefined) item.unitCost = 0;
    });

    // Populate overall fields for legacy support
    if (po.items.length > 0) {
      if (po.materialId === undefined) po.materialId = po.items[0].materialId;
      if (po.materialName === undefined) po.materialName = po.items[0].materialName;
      if (po.approvedQty === undefined) po.approvedQty = po.items.reduce((sum, i) => sum + (i.qty || 0), 0);
      if (po.requestedQty === undefined) po.requestedQty = po.approvedQty;
      if (po.receivedQty === undefined) po.receivedQty = po.items.reduce((sum, i) => sum + (i.receivedQty || 0), 0);
      if (po.unit === undefined) po.unit = po.items[0].unit;
      if (po.unitCost === undefined) po.unitCost = po.items[0].unitCost;
    }

    if (!po.status) po.status = 'approved';
    if (!po.sourcePage) po.sourcePage = 'command_center';
    if (!po.createdAt) po.createdAt = new Date().toISOString();
    if (po.approvedAt === undefined) po.approvedAt = '';
    if (po.approvedBy === undefined) po.approvedBy = '';
    if (po.receivedAt === undefined) po.receivedAt = '';
    if (po.notes === undefined) po.notes = '';
    if (po.cardId === undefined) po.cardId = '';
    if (!Array.isArray(po.activityLog)) po.activityLog = [];
    if (!Array.isArray(po.receipts)) po.receipts = [];
    if (po.supplierName === undefined) po.supplierName = po.supplier || '';
    if (po.supplierId === undefined) po.supplierId = '';
  });
  if (!omni.migrationsApplied.includes('omni_purchase_orders_v2')) omni.migrationsApplied.push('omni_purchase_orders_v2');
}

function normalizeOmniSuppliers() {
  if (!Array.isArray(omni.suppliers)) omni.suppliers = [];
  const byName = new Map();
  omni.suppliers.forEach(s => {
    if (!s.id) s.id = makeId('sup');
    if (!s.name) s.name = '';
    if (s.phone === undefined) s.phone = '';
    if (s.contact === undefined) s.contact = '';
    if (s.notes === undefined) s.notes = '';
    if (!Array.isArray(s.materials)) s.materials = [];
    if (!Array.isArray(s.catalog)) s.catalog = [];
    if (!Array.isArray(s.priceHistory)) s.priceHistory = [];
    if (s.lastReceiptAt === undefined) s.lastReceiptAt = '';
    if (s.totalReceipts === undefined) s.totalReceipts = 0;
    if (s.totalAmount === undefined) s.totalAmount = 0;
    if (s.createdAt === undefined) s.createdAt = new Date().toISOString();
    byName.set(String(s.name).trim(), s);
  });
  // Seed from material.supplier strings
  (omni.materials || []).forEach(m => {
    const name = String(m.supplier || '').trim();
    if (!name || name === '-' || byName.has(name)) return;
    const sup = {
      id: makeId('sup'),
      name,
      phone: '',
      contact: '',
      notes: '',
      materials: [m.id],
      catalog: [],
      priceHistory: [],
      lastReceiptAt: '',
      totalReceipts: 0,
      totalAmount: 0,
      createdAt: new Date().toISOString()
    };
    omni.suppliers.push(sup);
    byName.set(name, sup);
  });
  // Refresh materials list per supplier and back-fill supplierId on materials
  byName.forEach(s => {
    const linked = (omni.materials || []).filter(m => String(m.supplier || '').trim() === s.name);
    linked.forEach(m => { if (!m.supplierId) m.supplierId = s.id; });
    s.materials = Array.from(new Set([...(s.materials || []), ...linked.map(m => m.id)]));

    // Build and sync catalog
    s.catalog = s.catalog || [];
    s.materials.forEach(matId => {
      const exists = s.catalog.some(c => c.materialId === matId);
      if (!exists) {
        const mat = (omni.materials || []).find(m => m.id === matId);
        s.catalog.push({
          materialId: matId,
          SKU: 'SKU-' + matId.replace('mat_', '').slice(0, 4).toUpperCase(),
          negotiatedPrice: mat ? (Number(mat.cost) || 0) : 0,
          leadTime: 3
        });
      }
    });
  });
  if (!omni.migrationsApplied.includes('omni_suppliers_v2')) omni.migrationsApplied.push('omni_suppliers_v2');
}

function upsertSupplierByName(name) {
  if (!name) return null;
  ensureOmni();
  const trimmed = String(name).trim();
  if (!trimmed || trimmed === '-') return null;
  let sup = (omni.suppliers || []).find(s => String(s.name).trim() === trimmed);
  if (!sup) {
    sup = { id: makeId('sup'), name: trimmed, phone: '', contact: '', notes: '', materials: [], lastReceiptAt: '', totalReceipts: 0, totalAmount: 0, createdAt: new Date().toISOString() };
    omni.suppliers = omni.suppliers || [];
    omni.suppliers.push(sup);
  }
  return sup;
}

function getPurchaseReceivingHistory(limit = 50) {
  ensureOmni();
  const out = [];
  (omni.purchaseOrders || []).forEach(po => {
    (po.receipts || []).forEach(r => {
      const matId = r.materialId || po.materialId || '';
      const matName = r.materialName || po.materialName || 'مادة';
      const unit = r.unit || po.unit || '';
      out.push({
        poId: po.id,
        materialId: matId,
        materialName: matName,
        unit: unit,
        supplierName: po.supplierName || '',
        qty: r.qty,
        unitCost: r.unitCost || 0,
        amount: (r.qty || 0) * (r.unitCost || 0),
        receivedAt: r.date,
        note: r.note || ''
      });
    });
  });
  out.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return out.slice(0, limit);
}

function getOmniNotificationTypeLabel(type) {
  return ({
    request: 'طلب',
    approval: 'اعتماد',
    inventory: 'مخزون',
    purchase: 'شراء',
    qc: 'جودة',
    attendance: 'دوام',
    leave: 'إجازة',
    system: 'نظام',
    warning: 'تحذير'
  })[type] || type || 'نظام';
}

function getOmniRequestTypeLabel(type) {
  return ({
    purchase: 'شراء',
    leave: 'إجازات',
    attendance_correction: 'تصحيح بصمة',
    advance: 'سلفة',
    qc_rework: 'جودة / إعادة عمل',
    sop_approval: 'SOP',
    salary_statement: 'كشف حساب',
    general: 'أخرى'
  })[type] || type || 'أخرى';
}

function getOmniPriorityLabel(priority) {
  return ({ low: 'منخفض', normal: 'عادي', high: 'مهم', urgent: 'عاجل' })[priority] || priority || 'عادي';
}

function getOmniRequestStatusLabel(status) {
  return ({ pending: 'ينتظر القرار', approved: 'موافق عليه', rejected: 'مرفوض', done: 'منجز', cancelled: 'ملغي' })[status] || status || '-';
}

function formatOmniDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 19);
  return date.toLocaleString('ar-IQ', { dateStyle: 'short', timeStyle: 'short' });
}

function addOmniSystemLog(entry = {}, options = {}) {
  ensureOmni();
  const log = {
    id: entry.id || makeId('log'),
    date: entry.date || new Date().toISOString(),
    actor: entry.actor || 'النظام',
    action: entry.action || 'system',
    message: entry.message || '',
    page: entry.page || '',
    entityType: entry.entityType || '',
    entityId: entry.entityId || '',
    severity: entry.severity || 'info'
  };
  omni.systemLog.unshift(log);
  if (omni.systemLog.length > 500) omni.systemLog = omni.systemLog.slice(0, 500);
  if (options.save) saveData();
  return log;
}

function playOmniNotificationSound() {
  try {
    ensureOmni();
    if (omni.adminSettings?.notifications?.soundEnabled === false) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    if (!omniAudioContext) omniAudioContext = new AudioCtx();
    if (omniAudioContext.state === 'suspended') {
      if (!omniAudioUnlocked) return;
      omniAudioContext.resume().catch(() => {});
    }
    const now = omniAudioContext.currentTime;
    const gain = omniAudioContext.createGain();
    const osc = omniAudioContext.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(780, now);
    osc.frequency.exponentialRampToValueAtTime(980, now + 0.08);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    osc.connect(gain);
    gain.connect(omniAudioContext.destination);
    osc.start(now);
    osc.stop(now + 0.18);
  } catch (_) {}
}

function createOmniNotification(payload = {}) {
  ensureOmni();
  const now = new Date().toISOString();
  const type = payload.type || 'system';
  const sourceType = payload.sourceType || '';
  const sourceId = payload.sourceId || '';
  const duplicate = (omni.notifications || []).find(n =>
    n.status === 'unread' &&
    n.type === type &&
    n.sourceType === sourceType &&
    n.sourceId === sourceId &&
    sourceType &&
    sourceId
  );
  const target = duplicate || {
    id: payload.id || makeId('ntf'),
    createdAt: now,
    status: 'unread',
    readAt: ''
  };
  Object.assign(target, {
    type,
    title: payload.title || target.title || 'إشعار جديد',
    message: payload.message || target.message || '',
    sourcePage: payload.sourcePage || target.sourcePage || '',
    sourceType,
    sourceId,
    severity: payload.severity || target.severity || 'info',
    status: 'unread',
    createdAt: duplicate ? now : target.createdAt,
    actionLabel: payload.actionLabel || target.actionLabel || '',
    actionPage: payload.actionPage || target.actionPage || '',
    actionPayload: payload.actionPayload || target.actionPayload || {},
    targetUserId: payload.targetUserId || target.targetUserId || '',
    targetRole: payload.targetRole || target.targetRole || '',
    targetName: payload.targetName || target.targetName || ''
  });
  if (!duplicate) omni.notifications.unshift(target);
  addOmniSystemLog({
    action: 'notification_created',
    message: `تم إنشاء إشعار: ${target.title}`,
    page: target.sourcePage || target.actionPage || '',
    entityType: target.sourceType || 'notification',
    entityId: target.sourceId || target.id,
    severity: target.severity
  });
  saveData();
  renderOmniNotificationBell();
  renderOmniNotificationDropdown();
  if (!payload.silent) playOmniNotificationSound();
  return target;
}

function toggleOmniNotificationSound() {
  ensureOmni();
  omni.adminSettings.notifications.soundEnabled = omni.adminSettings.notifications.soundEnabled === false;
  addOmniSystemLog({
    action: 'notification_sound_setting',
    message: omni.adminSettings.notifications.soundEnabled ? 'تم تشغيل صوت الإشعارات' : 'تم إيقاف صوت الإشعارات',
    page: 'admin_panel',
    severity: 'info'
  });
  saveData();
  renderOmniNotificationBell();
  showToast(omni.adminSettings.notifications.soundEnabled ? 'تم تشغيل صوت الإشعارات' : 'تم إيقاف صوت الإشعارات', 'info');
}

function getUnreadNotifications() {
  ensureOmni();
  return (omni.notifications || []).filter(n => n.status === 'unread');
}
window.getUnreadNotifications = getUnreadNotifications;
window.getOctagonUnreadNotificationCount = function getOctagonUnreadNotificationCount() {
  return getUnreadNotifications().length;
};

function markOmniNotificationRead(notificationId) {
  ensureOmni();
  const n = (omni.notifications || []).find(item => item.id === notificationId);
  if (!n) return;
  n.status = 'read';
  n.readAt = new Date().toISOString();
  addOmniSystemLog({
    action: 'notification_read',
    message: `تم تعليم إشعار كمقروء: ${n.title}`,
    page: n.sourcePage || n.actionPage || '',
    entityType: n.sourceType || 'notification',
    entityId: n.sourceId || n.id,
    severity: 'info'
  });
  saveData();
  renderOmniNotificationBell();
  renderOmniNotificationDropdown();
}

function markAllOmniNotificationsRead() {
  ensureOmni();
  const now = new Date().toISOString();
  let changed = 0;
  (omni.notifications || []).forEach(n => {
    if (n.status === 'unread') {
      n.status = 'read';
      n.readAt = now;
      changed++;
    }
  });
  if (changed) {
    addOmniSystemLog({ action: 'notifications_read_all', message: `تم تعليم ${changed} إشعار كمقروء`, page: 'global', severity: 'info' });
    saveData();
  }
  renderOmniNotificationBell();
  renderOmniNotificationDropdown();
}

function openOmniNotificationSource(notificationId) {
  ensureOmni();
  const n = (omni.notifications || []).find(item => item.id === notificationId);
  if (!n) return;
  if (n.status === 'unread') {
    n.status = 'read';
    n.readAt = new Date().toISOString();
    saveData();
  }
  const page = n.actionPage || n.sourcePage;
  if (page) switchPage(page);
  if (n.sourceType === 'request' && n.sourceId && page === 'command_center') {
    setTimeout(() => document.getElementById(`omniRequest_${n.sourceId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  }
  omniNotificationDropdownOpen = false;
  renderOmniNotificationBell();
}

function renderOmniNotificationBell() {
  const host = document.getElementById('omniNotificationHost');
  if (!host) return;
  ensureOmni();
  const unread = getUnreadNotifications().length;
  window.__octagonUnreadNotificationCount = unread;
  host.innerHTML = `
    <button class="omni-notification-bell ${unread ? 'has-unread' : ''}" onclick="toggleOmniNotificationDropdown(event)" title="الإشعارات">
      <i class="fa-solid fa-bell"></i>
      ${unread ? `<span class="omni-notification-count">${unread}</span>` : ''}
    </button>
    <div id="omniNotificationDropdown" class="omni-notification-dropdown ${omniNotificationDropdownOpen ? 'open' : ''}"></div>
  `;
  renderOmniNotificationDropdown();
  window.ptxAIAssistant?.refreshBadge?.();
  window.dispatchEvent(new CustomEvent('octagon:notifications-updated', { detail: { unread } }));
}

function toggleOmniNotificationDropdown(event) {
  if (event) event.stopPropagation();
  omniNotificationDropdownOpen = !omniNotificationDropdownOpen;
  renderOmniNotificationBell();
}

function renderOmniNotificationDropdown() {
  const el = document.getElementById('omniNotificationDropdown');
  if (!el) return;
  ensureOmni();
  const items = (omni.notifications || []).slice().sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))).slice(0, 12);
  el.innerHTML = `
    <div class="omni-notification-head">
      <b>الإشعارات</b>
      <div class="omni-notification-head-actions">
        <button class="btn-secondary" onclick="toggleOmniNotificationSound()">${omni.adminSettings?.notifications?.soundEnabled === false ? 'تشغيل صوت الإشعارات' : 'إيقاف صوت الإشعارات'}</button>
        <button class="btn-secondary" onclick="markAllOmniNotificationsRead()">تعليم الكل كمقروء</button>
      </div>
    </div>
    <div class="omni-notification-list">
      ${items.map(n => `
        <div class="omni-notification-item omni-severity-${n.severity || 'info'} ${n.status === 'unread' ? 'is-unread' : ''}">
          <div class="omni-notification-item-title">
            <b>${escapeHtml(n.title)}</b>
            <span>${escapeHtml(getOmniNotificationTypeLabel(n.type))}</span>
          </div>
          <p>${escapeHtml(n.message || '')}</p>
          <small>${escapeHtml(n.sourcePage || n.sourceType || 'النظام')} · ${formatOmniDateTime(n.createdAt)} · ${n.targetRole ? `الدور: ${escapeHtml(n.targetRole)} · ` : ''}${n.status === 'unread' ? 'غير مقروء' : 'مقروء'}</small>
          <div class="omni-notification-actions">
            ${n.status === 'unread' ? `<button class="btn-secondary" onclick="markOmniNotificationRead('${n.id}')">تعليم كمقروء</button>` : ''}
            ${(n.actionPage || n.sourcePage) ? `<button class="btn-primary" onclick="openOmniNotificationSource('${n.id}')">${escapeHtml(n.actionLabel || 'فتح المصدر')}</button>` : ''}
          </div>
        </div>
      `).join('') || '<div class="omni-notification-empty">لا توجد إشعارات بعد.</div>'}
    </div>
    <button class="omni-updates-link" onclick="openOmniNotificationCenter()">عرض كل التحديثات</button>
  `;
}

function openOmniNotificationCenter() {
  ensureOmni();
  omniNotificationDropdownOpen = false;
  renderOmniNotificationBell();
  showOmniModal('سجل تحديثات النظام', `
    <div class="omni-system-log-modal">
      <div class="omni-system-log-toolbar">
        ${[
          ['all', 'الكل'],
          ['requests', 'الطلبات'],
          ['approvals', 'الموافقات'],
          ['employees', 'الموظفين'],
          ['inventory', 'المخزون'],
          ['purchase', 'الشراء'],
          ['finance', 'المالية'],
          ['qc', 'الجودة'],
          ['timesheet', 'التايم شيت'],
          ['system', 'النظام']
        ].map(([key, label]) => `<button class="omni-log-filter ${omniSystemLogFilter === key ? 'active' : ''}" onclick="setOmniSystemLogFilter('${key}')">${label}</button>`).join('')}
        <input id="omniSystemLogSearch" class="form-input" placeholder="بحث" value="${escapeHtml(omniSystemLogSearch)}" oninput="setOmniSystemLogSearch(this.value)">
      </div>
      <div id="omniSystemLogResults">${renderOmniSystemLogRows()}</div>
    </div>
  `, () => true);
}

function setOmniSystemLogFilter(filter) {
  omniSystemLogFilter = filter || 'all';
  const target = document.getElementById('omniSystemLogResults');
  if (target) target.innerHTML = renderOmniSystemLogRows();
  document.querySelectorAll('.omni-log-filter').forEach(btn => {
    btn.classList.toggle('active', String(btn.getAttribute('onclick') || '').includes(`'${omniSystemLogFilter}'`));
  });
}

function setOmniSystemLogSearch(value) {
  omniSystemLogSearch = value || '';
  const target = document.getElementById('omniSystemLogResults');
  if (target) target.innerHTML = renderOmniSystemLogRows();
}

function renderOmniSystemLogRows() {
  ensureOmni();
  const search = omniSystemLogSearch.trim().toLowerCase();
  const filterMap = {
    requests: ['request_created', 'purchase_request_created', 'leave_request_created', 'attendance_correction_requested', 'advance_request_created'],
    approvals: ['request_approved', 'request_rejected', 'request_applied'],
    inventory: ['purchase_request_created'],
    employees: ['leave_request_created', 'attendance_correction_requested', 'advance_request_created', 'employee'],
    purchase: ['purchase_request_created', 'purchase_order_created', 'purchase_order_ordered', 'material_received'],
    finance: ['finance', 'cashbox', 'expense', 'income', 'receipt'],
    qc: ['qc', 'quality', 'rework'],
    timesheet: ['request_applied_leave', 'request_applied_attendance_correction', 'timesheet'],
    system: ['system', 'notification_created', 'notification_read', 'notifications_read_all']
  };
  const rows = (omni.systemLog || []).filter(log => {
    const hay = `${log.action || ''} ${log.message || ''} ${log.page || ''} ${log.entityType || ''}`.toLowerCase();
    const matchesSearch = !search || hay.includes(search);
    const allowed = filterMap[omniSystemLogFilter];
    const matchesFilter = !allowed || allowed.some(key => String(log.action || '').includes(key) || String(log.page || '').includes(key) || String(log.entityType || '').includes(key));
    return matchesSearch && matchesFilter;
  }).slice(0, 120);
  return `
    <div class="omni-system-log-list">
      ${rows.map(log => `
        <div class="omni-system-log-row omni-severity-${log.severity || 'info'}">
          <div><b>${escapeHtml(log.message || log.action || '-')}</b><small>${escapeHtml(log.actor || 'النظام')} · ${escapeHtml(log.action || '-')} · ${escapeHtml(log.page || 'global')} · ${escapeHtml(log.severity || 'info')}</small></div>
          <time>${formatOmniDateTime(log.date)}</time>
        </div>
      `).join('') || '<div class="omni-notification-empty">لا توجد تحديثات مطابقة.</div>'}
    </div>
  `;
}

function getSupervisorForEmployee(empIdentifier) {
  ensureOmni();
  if (empIdentifier === undefined || empIdentifier === null || String(empIdentifier).trim() === '') return null;
  const routing = omni.adminSettings?.supervisorRouting || {};

  const empIdx = (employees || []).findIndex((e, idx) => {
    return String(idx) === String(empIdentifier) ||
           (e && String(e.id || '') === String(empIdentifier)) ||
           (e && String(e.name || '').trim() === String(empIdentifier).trim());
  });

  const emp = (employees || [])[empIdx];
  if (!emp) return null;

  const supervisorId = routing[emp.id] || routing[emp.name] || routing[empIdx];
  if (!supervisorId) return null;

  const supervisors = getOrgSupervisors();
  const supervisor = supervisors.find(s => s && (String(s.id) === String(supervisorId) || String(s.name) === String(supervisorId)));
  return supervisor || null;
}

function createOmniRequest(payload = {}) {
  ensureOmni();
  const now = new Date().toISOString();
  const duplicate = (omni.requests || []).find(req =>
    req.status === 'pending' &&
    req.type === (payload.type || 'general') &&
    req.sourceType === (payload.sourceType || '') &&
    req.sourceId === (payload.sourceId || '') &&
    req.sourceType &&
    req.sourceId
  );
  if (duplicate) {
    duplicate.title = payload.title || duplicate.title;
    duplicate.description = payload.description || duplicate.description;
    duplicate.priority = payload.priority || duplicate.priority;
    duplicate.payload = { ...(duplicate.payload || {}), ...(payload.payload || {}) };
    duplicate.activityLog.unshift({ date: now, text: 'تم تحديث الطلب الموجود بدل إنشاء تكرار' });
    saveData();
    return duplicate;
  }
  const req = {
    id: payload.id || makeId('oreq'),
    type: payload.type || 'general',
    title: payload.title || 'طلب جديد',
    description: payload.description || '',
    requesterId: payload.requesterId || '',
    requesterName: payload.requesterName || '',
    sourcePage: payload.sourcePage || '',
    sourceType: payload.sourceType || '',
    sourceId: payload.sourceId || '',
    status: 'pending',
    priority: payload.priority || 'normal',
    payload: payload.payload || {},
    createdAt: now,
    decidedAt: '',
    decidedBy: '',
    decisionNote: '',
    activityLog: [{ date: now, text: 'تم إنشاء الطلب وإرساله إلى مركز القيادة' }]
  };

  const reqEmpIdent = req.requesterId || req.requesterName || req.payload?.employeeId || req.payload?.employeeName;
  const routedSupervisor = getSupervisorForEmployee(reqEmpIdent);
  if (routedSupervisor) {
    req.routedSupervisorId = routedSupervisor.id || '';
    req.routedSupervisorName = routedSupervisor.name || '';
    req.activityLog.push({ date: now, text: `تم توجيه الطلب تلقائياً للمشرف: ${routedSupervisor.name}` });
  } else {
    req.routedSupervisorId = '';
    req.routedSupervisorName = '';
  }

  omni.requests.unshift(req);
  const action = req.type === 'purchase' ? 'purchase_request_created' : req.type === 'leave' ? 'leave_request_created' : req.type === 'attendance_correction' ? 'attendance_correction_requested' : req.type === 'advance' ? 'advance_request_created' : 'request_created';
  addOmniSystemLog({
    action,
    message: `تم إنشاء طلب جديد في ${req.sourcePage || 'النظام'}: ${req.title}`,
    page: req.sourcePage || 'command_center',
    entityType: 'request',
    entityId: req.id,
    severity: req.priority === 'urgent' ? 'danger' : req.priority === 'high' ? 'warning' : 'info'
  });
  createOmniNotification({
    type: req.type === 'purchase' ? 'purchase' : 'request',
    title: req.type === 'purchase' ? 'طلب شراء جديد' : 'طلب جديد ينتظر موافقة المدير',
    message: req.title,
    sourcePage: req.sourcePage,
    sourceType: 'request',
    sourceId: req.id,
    severity: req.priority === 'urgent' ? 'danger' : req.priority === 'high' ? 'warning' : 'info',
    actionLabel: 'فتح مركز القيادة',
    actionPage: 'command_center',
    targetRole: 'manager',
    targetName: 'المدير'
  });
  saveData();
  return req;
}

async function approveOmniRequest(requestId, note) {
  if (note === undefined) note = await showOmniPrompt('ملاحظة الموافقة:', '');
  return decideOmniRequest(requestId, 'approved', note || '');
}

async function rejectOmniRequest(requestId, note) {
  if (note === undefined) note = await showOmniPrompt('سبب الرفض:', '');
  return decideOmniRequest(requestId, 'rejected', note || '');
}

function decideOmniRequest(requestId, status, note = '') {
  ensureOmni();
  const req = (omni.requests || []).find(r => r.id === requestId);
  if (!req || req.status !== 'pending') return null;
  const now = new Date().toISOString();
  req.status = status;
  req.decidedAt = now;
  req.decidedBy = 'المدير';
  req.decisionNote = note;
  req.activityLog.unshift({ date: now, text: status === 'approved' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب' });
  syncLegacyEmployeeRequestDecision(req, status, note);
  let appliedResult = null;
  if (status === 'approved') {
    appliedResult = applyApprovedOmniRequest(requestId, { skipSave: true, skipRender: true });
    if (req.sourceType === 'employee_request' || req.type === 'leave' || req.type === 'salary_advance' || req.type === 'loan') {
      triggerOmniEvent('EMPLOYEE_REQUEST_APPROVED', { request: req, appliedResult });
    }
  }
  addOmniSystemLog({
    action: status === 'approved' ? 'request_approved' : 'request_rejected',
    message: `${status === 'approved' ? 'تمت الموافقة على' : 'تم رفض'} الطلب: ${req.title}`,
    page: 'command_center',
    entityType: 'request',
    entityId: req.id,
    severity: status === 'approved' ? 'success' : 'warning'
  });
  createOmniNotification({
    type: 'approval',
    title: 'تم تحديث طلبك',
    message: `${req.title}: ${status === 'approved' ? 'تمت الموافقة عليه' : 'تم رفضه'}`,
    sourcePage: 'command_center',
    sourceType: 'request',
    sourceId: req.id,
    severity: status === 'approved' ? 'success' : 'warning',
    actionLabel: 'فتح المصدر',
    actionPage: req.sourcePage || 'command_center',
    targetUserId: req.requesterId || '',
    targetName: req.requesterName || ''
  });
  saveData();
  showToast(status === 'approved' ? 'تمت الموافقة على الطلب' : 'تم رفض الطلب', status === 'approved' ? 'success' : 'info');
  if (currentPage === 'command_center') renderCommandCenter();
  if (currentPage === 'employee_ui') renderEmployeePortal();
  return appliedResult || req;
}

function syncLegacyEmployeeRequestDecision(req, status, note) {
  if (req.sourceType !== 'employee_request' || !Array.isArray(omni.employeeRequests)) return;
  const legacy = omni.employeeRequests.find(r => r.id === req.sourceId);
  if (!legacy) return;
  legacy.status = status;
  legacy.reviewedBy = 'المدير';
  legacy.reviewedAt = new Date().toISOString();
  legacy.managerNote = note || '';
}

function getPendingOmniRequests(type) {
  ensureOmni();
  return (omni.requests || []).filter(req => req.status === 'pending' && (!type || req.type === type));
}

function requestMatchesCategory(req, category) {
  if (category === 'all') return true;
  if (category === 'purchase') return req.type === 'purchase';
  if (category === 'leave_advance') return req.type === 'leave' || req.type === 'advance';
  if (category === 'attendance_correction') return req.type === 'attendance_correction';
  if (category === 'qc_rework') return ['qc_rework', 'quality', 'qc', 'rework'].includes(req.type);
  if (category === 'sop_approval') return req.type === 'sop_approval' || req.type === 'sop';
  if (category === 'ai_proposal') return req.type === 'ai_proposal' || req.type === 'ai_analysis';
  if (category === 'finance') return ['finance', 'finance_request', 'expense', 'income', 'receipt', 'whatsapp_finance'].includes(req.type);
  if (category === 'general') {
    return !['purchase', 'leave', 'advance', 'attendance_correction', 'qc_rework', 'quality', 'qc', 'rework', 'sop_approval', 'sop', 'ai_proposal', 'ai_analysis', 'finance', 'finance_request', 'expense', 'income', 'receipt'].includes(req.type);
  }
  return false;
}

function getRequestBadgeAndIcon(req) {
  if (req.sourceType === 'whatsapp' || req.type === 'whatsapp') {
    return {
      label: 'رسالة WhatsApp',
      icon: 'fa-whatsapp',
      color: '#10b981',
      bg: 'rgba(16, 185, 129, 0.15)'
    };
  }
  if (req.type === 'ai_proposal' || req.type === 'ai_analysis' || req.sourceType === 'ai_control') {
    return {
      label: 'مقترح ذكي AI',
      icon: 'fa-robot',
      color: '#38bdf8',
      bg: 'rgba(56, 189, 248, 0.15)'
    };
  }
  if (req.type === 'purchase') {
    return {
      label: 'طلب شراء',
      icon: 'fa-cart-shopping',
      color: '#fbbf24',
      bg: 'rgba(251, 191, 36, 0.15)'
    };
  }
  if (req.type === 'leave') {
    return {
      label: 'طلب إجازة',
      icon: 'fa-calendar-minus',
      color: '#a855f7',
      bg: 'rgba(168, 85, 247, 0.15)'
    };
  }
  if (req.type === 'advance') {
    return {
      label: 'طلب سلفة',
      icon: 'fa-hand-holding-dollar',
      color: '#22d3ee',
      bg: 'rgba(34, 211, 238, 0.15)'
    };
  }
  if (req.type === 'attendance_correction') {
    return {
      label: 'تصحيح بصمة',
      icon: 'fa-fingerprint',
      color: '#f43f5e',
      bg: 'rgba(244, 63, 94, 0.15)'
    };
  }
  return {
    label: getOmniRequestTypeLabel(req.type),
    icon: 'fa-clipboard-question',
    color: '#94a3b8',
    bg: 'rgba(148, 163, 184, 0.15)'
  };
}

function setRequestCategoryFilter(cat) {
  activeRequestCategory = cat;
  renderCommandCenter();
}

function setRequestSectionFilter(section) {
  activeRequestSection = section;
  renderCommandCenter();
}

function setRequestSupervisorFilter(supId) {
  routedSupervisorFilter = supId;
  renderCommandCenter();
}

function renderCommandCenterRequests(activeType = 'all') {
  ensureOmni();

  if (activeType !== 'all' && activeRequestCategory === 'all') {
    activeRequestCategory = activeType;
  }

  const allReqs = omni.requests || [];

  // Counts
  const pendingCount = allReqs.filter(req => req.status === 'pending').length;
  const historyCount = allReqs.filter(req => req.status === 'approved' || req.status === 'rejected').length;

  // Section filter
  let sectionFiltered = [];
  if (activeRequestSection === 'pending') {
    sectionFiltered = allReqs.filter(req => req.status === 'pending');
  } else {
    sectionFiltered = allReqs.filter(req => req.status === 'approved' || req.status === 'rejected');
  }

  // Supervisor filter (only for pending)
  if (activeRequestSection === 'pending' && routedSupervisorFilter) {
    sectionFiltered = sectionFiltered.filter(req => String(req.routedSupervisorId) === String(routedSupervisorFilter));
  }

  // Category filter
  const categoryFiltered = sectionFiltered.filter(req => requestMatchesCategory(req, activeRequestCategory));

  const getTabCount = (cat) => {
    let items = activeRequestSection === 'pending'
      ? allReqs.filter(req => req.status === 'pending')
      : allReqs.filter(req => req.status === 'approved' || req.status === 'rejected');

    if (activeRequestSection === 'pending' && routedSupervisorFilter) {
      items = items.filter(req => String(req.routedSupervisorId) === String(routedSupervisorFilter));
    }
    return items.filter(req => requestMatchesCategory(req, cat)).length;
  };

  const tabs = [
    ['all', 'الكل'],
    ['purchase', 'شراء'],
    ['leave_advance', 'إجازات وسلف'],
    ['attendance_correction', 'تصحيح بصمة'],
    ['qc_rework', 'جودة / إعادة عمل'],
    ['sop_approval', 'SOP'],
    ['ai_proposal', 'مقترحات AI'],
    ['finance', 'طلبات مالية'],
    ['general', 'أخرى']
  ];

  const supervisors = getOrgSupervisors();

  let supervisorFilterHtml = '';
  if (activeRequestSection === 'pending') {
    supervisorFilterHtml = `
      <div class="cc-supervisor-filter" style="margin-bottom: 12px; display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <label style="font-size: 12px; color: var(--text-muted); display: flex; align-items: center; gap: 4px;"><i class="fa-solid fa-filter"></i> تصفية حسب المشرف الموجه له:</label>
        <select class="form-input" style="max-width: 250px; background-color: var(--bg-card); color: var(--text-main); font-size: 12px; padding: 4px 8px; height: auto;" onchange="setRequestSupervisorFilter(this.value)">
          <option value="">-- كل المشرفين --</option>
          ${supervisors.map(sup => `
            <option value="${escapeHtml(sup.id)}" ${String(sup.id) === String(routedSupervisorFilter) ? 'selected' : ''}>
              ${escapeHtml(sup.name)} (${escapeHtml(sup.role || 'مشرف')})
            </option>
          `).join('')}
        </select>
      </div>
    `;
  }

  const renderCardDetails = (req) => {
    // WhatsApp details
    if (req.sourceType === 'whatsapp' || req.type === 'whatsapp') {
      const confidence = req.payload?.confidence !== undefined ? Math.round((req.payload.confidence || 0) * 100) : null;
      const entityChips = (req.payload?.entityMatches || []).map(ent => {
        const typeLabel = ent.type === 'employee' ? 'موظف' : ent.type === 'customer' ? 'عميل' : ent.type === 'material' ? 'مادة' : ent.type === 'machine' ? 'ماكينة' : ent.type;
        return `<span class="cc-entity-chip cc-ent-${ent.type || 'unknown'}" style="background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); color: #10b981; padding: 2px 8px; border-radius: 12px; font-size: 11px; margin-left: 4px; display: inline-flex; align-items: center; gap: 3px;">
          <i class="fa-solid fa-tag" style="font-size: 9px;"></i> ${escapeHtml(typeLabel)}: ${escapeHtml(ent.value || ent.name || ent)}
        </span>`;
      }).join('');

      const attachments = (req.payload?.attachmentPlaceholders || []).map(att => {
        if (att.type === 'voice' || att.type === 'audio') {
          return `<div class="cc-voice-attachment" style="margin-top: 8px;">
            <span style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;"><i class="fa-solid fa-microphone"></i> رسالة صوتية مرفقة:</span>
            <audio controls src="${escapeHtml(att.url || '')}" style="width: 100%; height: 32px; border-radius: 4px;"></audio>
          </div>`;
        } else if (att.type === 'invoice' || att.type === 'image') {
          return `<div class="cc-image-attachment" style="margin-top: 8px; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; border: 1px dashed rgba(255,255,255,0.1);">
            <span style="font-size: 11px; color: var(--text-muted); display: block; margin-bottom: 4px;"><i class="fa-solid fa-receipt"></i> مستند/فاتورة OCR:</span>
            <div style="font-weight: 500; font-size: 12px;">${escapeHtml(att.fileName || 'فاتورة')}</div>
            ${att.totalAmount ? `<div style="font-size: 11px; color: #34d399; font-weight: 600;">القيمة المستخرجة: ${Number(att.totalAmount).toLocaleString()} IQD</div>` : ''}
          </div>`;
        }
        return '';
      }).join('');

      return `
        <div class="cc-whatsapp-rich-details" style="margin-top: 8px;">
          ${confidence !== null ? `<div style="font-size: 11px; color: #10b981; font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-circle-check"></i> دقة التعرف: ${confidence}%</div>` : ''}
          ${entityChips ? `<div style="margin: 6px 0; display: flex; flex-wrap: wrap; gap: 4px;">${entityChips}</div>` : ''}
          ${attachments}
        </div>
      `;
    }

    // AI Proposal details
    if (req.type === 'ai_proposal' || req.type === 'ai_analysis' || req.sourceType === 'ai_control') {
      const risk = req.payload?.risk || 'normal';
      const riskLabel = risk === 'critical' ? 'حرج جداً' : risk === 'high' ? 'عالي الخطورة' : risk === 'medium' ? 'متوسط الخطورة' : 'منخفض الخطورة';
      const riskColor = risk === 'critical' || risk === 'high' ? '#f87171' : risk === 'medium' ? '#fbbf24' : '#34d399';
      const riskBg = risk === 'critical' || risk === 'high' ? 'rgba(248, 113, 113, 0.15)' : risk === 'medium' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(52, 211, 153, 0.15)';

      const proposedActionHtml = req.payload?.actionId ? `
        <div class="cc-ai-actions" style="margin-top: 8px; background: rgba(56, 189, 248, 0.05); padding: 8px; border-radius: 6px; border: 1px solid rgba(56, 189, 248, 0.2);">
          <span style="font-size: 11px; color: #38bdf8; font-weight: 600;"><i class="fa-solid fa-code"></i> الإجراء المقترح:</span>
          <div style="font-size: 12px; font-family: monospace; color: #e2e8f0; margin-top: 2px;">ID: ${escapeHtml(req.payload.actionId)}</div>
          ${req.payload.target ? `<div style="font-size: 11px; color: var(--text-muted);">المستهدف: ${escapeHtml(req.payload.target)}</div>` : ''}
        </div>
      ` : '';

      return `
        <div class="cc-ai-rich-details" style="margin-top: 8px;">
          <span class="badge" style="background: ${riskBg}; color: ${riskColor}; border: 1px solid ${riskColor}44; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">
            <i class="fa-solid fa-triangle-exclamation"></i> ${riskLabel}
          </span>
          ${proposedActionHtml}
        </div>
      `;
    }

    // Employee request details
    if (req.type === 'leave' || req.type === 'advance' || req.type === 'attendance_correction' || req.sourceType === 'employee_request') {
      const amount = req.payload?.amount || req.payload?.advanceAmount || 0;
      const currencyHtml = (req.type === 'advance' || amount) ? `
        <div style="font-size: 13px; font-weight: 600; color: #34d399; margin: 6px 0;">
          <i class="fa-solid fa-money-bill-wave"></i> المبلغ المطلوب: ${Number(amount).toLocaleString()} IQD
        </div>
      ` : '';

      const leaveDatesHtml = req.type === 'leave' ? `
        <div style="font-size: 12px; color: var(--text-muted); margin: 4px 0;">
          <i class="fa-solid fa-calendar-days"></i> فترة الإجازة: من <strong>${escapeHtml(req.payload?.startDate || req.payload?.from || '-')}</strong> إلى <strong>${escapeHtml(req.payload?.endDate || req.payload?.to || '-')}</strong>
        </div>
      ` : '';

      const timesheetLinkHtml = `
        <div style="margin-top: 8px;">
          <button class="btn btn-secondary btn-sm" onclick="switchPage('timesheet')" style="font-size: 11px; padding: 4px 8px;">
            <i class="fa-solid fa-clock-rotate-left"></i> فتح سجل الدوام للمراجعة
          </button>
        </div>
      `;

      return `
        <div class="cc-employee-rich-details">
          ${currencyHtml}
          ${leaveDatesHtml}
          ${timesheetLinkHtml}
        </div>
      `;
    }

    // Purchase request details
    if (req.type === 'purchase') {
      const matName = req.payload?.materialName || 'مادة';
      const qty = req.payload?.requestedQty || 0;
      const unit = req.payload?.unit || '';
      const currentStock = req.payload?.currentStock || 0;
      const minStock = req.payload?.minStock || 0;
      const unitCost = req.payload?.unitCost || 0;
      const totalEstimate = qty * unitCost;

      return `
        <div class="cc-purchase-details-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-top: 8px; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05); font-size: 12px;">
          <div><span style="color: var(--text-muted)">المادة:</span> <strong>${escapeHtml(matName)}</strong></div>
          <div><span style="color: var(--text-muted)">الكمية المطلوبة:</span> <strong>${qty} ${escapeHtml(unit)}</strong></div>
          <div><span style="color: var(--text-muted)">المخزون المتوفر:</span> <strong style="color: ${currentStock <= minStock ? '#f87171' : '#34d399'}">${currentStock} ${escapeHtml(unit)}</strong> (الحد الأدنى: ${minStock})</div>
          <div><span style="color: var(--text-muted)">كلفة الوحدة:</span> <strong>${Number(unitCost).toLocaleString()} IQD</strong></div>
          <div style="grid-column: span 2; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 6px; font-weight: 600; color: #fbbf24; display: flex; justify-content: space-between;">
            <span>التكلفة الإجمالية المقدرة:</span>
            <strong>${Number(totalEstimate).toLocaleString()} IQD</strong>
          </div>
        </div>
      `;
    }

    // Finance request details
    if (req.type === 'finance' || req.type === 'expense' || req.type === 'income' || req.type === 'receipt') {
      const finAmount = req.payload?.amount || 0;
      const finType = req.payload?.type || req.type || 'general';
      const finDir = req.payload?.direction || (finType === 'expense' ? 'out' : 'in');
      const finDirLabel = finDir === 'out' ? 'صرف (خارج)' : 'قبض (داخل)';
      const finDirColor = finDir === 'out' ? '#f87171' : '#34d399';
      const finAccount = req.payload?.account || req.payload?.category || '-';

      return `
        <div class="cc-finance-rich-details" style="margin-top: 8px; font-size: 12px; background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span>الاتجاه: <strong style="color: ${finDirColor}">${finDirLabel}</strong></span>
            <span>المبلغ: <strong style="color: #34d399">${Number(finAmount).toLocaleString()} IQD</strong></span>
          </div>
          <div>الحساب/التصنيف المقترح: <strong>${escapeHtml(finAccount)}</strong></div>
        </div>
      `;
    }

    return '';
  };

  const tabsHtml = tabs.map(([key, label]) => {
    const count = getTabCount(key);
    return `
      <button class="${activeRequestCategory === key ? 'active' : ''}" onclick="setRequestCategoryFilter('${key}')" style="position: relative; display: inline-flex; align-items: center; gap: 6px;">
        ${label}
        ${count > 0 ? `<span style="background: var(--accent-blue); color: white; border-radius: 8px; padding: 1px 5px; font-size: 10px; font-weight: bold;">${count}</span>` : ''}
      </button>
    `;
  }).join('');

  const cardsHtml = categoryFiltered.map(req => {
    const badgeInfo = getRequestBadgeAndIcon(req);
    const routedSupHtml = req.routedSupervisorName ? `
      <span class="cc-routed-sup" style="font-size: 11px; background: rgba(56, 189, 248, 0.1); border: 1px solid rgba(56, 189, 248, 0.2); color: #38bdf8; padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 3px;">
        <i class="fa-solid fa-route"></i> موجه للمشرف: ${escapeHtml(req.routedSupervisorName)}
      </span>
    ` : '';

    const outcomeBadge = req.status === 'approved' ? `
      <span class="badge" style="background: rgba(16, 185, 129, 0.2); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.4); padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;"><i class="fa-solid fa-circle-check"></i> موافقة</span>
    ` : req.status === 'rejected' ? `
      <span class="badge" style="background: rgba(244, 63, 94, 0.2); color: #f43f5e; border: 1px solid rgba(244, 63, 94, 0.4); padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px;"><i class="fa-solid fa-circle-xmark"></i> رفض</span>
    ` : '';

    const decisionNotesHtml = (req.status !== 'pending' && req.decisionNote) ? `
      <div class="cc-decision-note" style="margin-top: 8px; background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255,255,255,0.06); padding: 8px; border-radius: 6px; font-size: 12px;">
        <span style="color: var(--text-muted)">ملاحظات القرار:</span>
        <div style="font-style: italic; color: #cbd5e1; margin-top: 2px;">"${escapeHtml(req.decisionNote)}"</div>
      </div>
    ` : '';

    const decidedMetaHtml = req.status !== 'pending' ? `
      <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px;">
        <i class="fa-regular fa-clock"></i> تم القرار في: ${formatOmniDateTime(req.decidedAt)} · بواسطة: ${escapeHtml(req.decidedBy || 'المدير')}
      </div>
    ` : '';

    const actionButtons = req.status === 'pending' ? `
      <div class="cc-request-actions" style="margin-top: 12px; display: flex; gap: 8px;">
        <button class="btn-primary" onclick="approveOmniRequest('${req.id}')" style="padding: 6px 12px; font-size: 12px;"><i class="fa-solid fa-check"></i> موافقة</button>
        <button class="btn-danger" onclick="rejectOmniRequest('${req.id}')" style="padding: 6px 12px; font-size: 12px;"><i class="fa-solid fa-xmark"></i> رفض</button>
        ${req.sourcePage ? `<button class="btn-secondary" onclick="switchPage('${req.sourcePage}')" style="padding: 6px 12px; font-size: 12px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح المصدر</button>` : ''}
      </div>
    ` : `
      <div class="cc-request-actions" style="margin-top: 12px; display: flex; gap: 8px;">
        ${req.sourcePage ? `<button class="btn-secondary btn-sm" onclick="switchPage('${req.sourcePage}')" style="padding: 4px 8px; font-size: 11px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> فتح المصدر</button>` : ''}
      </div>
    `;

    return `
      <div id="omniRequest_${req.id}" class="cc-request-card cc-priority-${req.priority || 'normal'}" style="position: relative; border-right: 4px solid ${req.priority === 'urgent' ? '#f87171' : req.priority === 'high' ? '#fb923c' : '#475569'}; background-color: var(--bg-card); border-radius: 8px; padding: 16px; box-shadow: var(--shadow-sm); margin-bottom: 12px; transition: var(--transition);">
        <div class="cc-request-main">
          <div style="display: flex; justify-content: space-between; align-items: start; gap: 8px; margin-bottom: 8px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 6px;">
              <span class="cc-source-label" style="background: ${badgeInfo.bg}; color: ${badgeInfo.color}; border: 1px solid ${badgeInfo.color}33; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid ${badgeInfo.icon}"></i> ${escapeHtml(badgeInfo.label)}
              </span>
              ${routedSupHtml}
            </div>
            ${outcomeBadge}
          </div>
          <h4 style="margin: 0 0 6px 0; font-size: 15px; font-weight: 600; color: var(--text-main);">${escapeHtml(req.title)}</h4>
          <p style="margin: 0; font-size: 13px; color: var(--text-body); line-height: 1.5;">${escapeHtml(req.description || '')}</p>

          ${renderCardDetails(req)}
          ${decisionNotesHtml}

          <div class="cc-request-meta" style="margin-top: 10px; display: flex; flex-wrap: wrap; gap: 12px; font-size: 11px; color: var(--text-muted); border-top: 1px solid rgba(255,255,255,0.03); padding-top: 8px;">
            <span>الطالب: <strong>${escapeHtml(req.requesterName || 'النظام')}</strong></span>
            <span>المصدر: ${escapeHtml(_pageKeyAr[req.sourcePage] || req.sourcePage || '-')}</span>
            <span>تاريخ الطلب: ${formatOmniDateTime(req.createdAt)}</span>
            <span>الأولوية: ${escapeHtml(getOmniPriorityLabel(req.priority))}</span>
          </div>
          ${decidedMetaHtml}
        </div>
        ${actionButtons}
      </div>
    `;
  }).join('') || `<div class="cc-empty" style="text-align: center; padding: 32px; color: var(--text-muted); background: var(--bg-card); border-radius: 8px; border: 1px dashed rgba(255,255,255,0.06);">${activeRequestSection === 'pending' ? 'لا توجد طلبات معلقة ضمن هذا الفلتر.' : 'سجل القرارات فارغ.'}</div>`;

  return `
    <style>
      .cc-request-tabs button {
        background: transparent;
        border: 1px solid rgba(255,255,255,0.06);
        color: var(--text-muted);
        padding: 6px 14px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 12px;
        transition: var(--transition);
      }
      .cc-request-tabs button.active {
        background: var(--accent-blue);
        color: white;
        border-color: var(--accent-blue);
      }
      .cc-request-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 15px;
      }
    </style>
    <div class="cc-section cc-requests-center">
      <div class="cc-section-title-row" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
        <h3 style="margin: 0; display: flex; align-items: center; gap: 8px;"><i class="fa-solid fa-clipboard-check"></i> مركز التحكم والموافقة الموحد</h3>
        <div class="cc-section-toggle" style="display: flex; gap: 8px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); padding: 3px; border-radius: 6px;">
          <button class="btn btn-sm" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: none; background: ${activeRequestSection === 'pending' ? 'var(--accent-blue)' : 'transparent'}; color: ${activeRequestSection === 'pending' ? '#fff' : 'var(--text-muted)'};" onclick="setRequestSectionFilter('pending')">
            الطلبات المعلقة <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10px; margin-right: 4px;">${pendingCount}</span>
          </button>
          <button class="btn btn-sm" style="padding: 4px 10px; font-size: 12px; border-radius: 4px; border: none; background: ${activeRequestSection === 'history' ? 'var(--accent-blue)' : 'transparent'}; color: ${activeRequestSection === 'history' ? '#fff' : 'var(--text-muted)'};" onclick="setRequestSectionFilter('history')">
            سجل القرارات <span style="background: rgba(255,255,255,0.15); padding: 1px 6px; border-radius: 10px; font-size: 10px; margin-right: 4px;">${historyCount}</span>
          </button>
        </div>
      </div>

      ${supervisorFilterHtml}

      <div class="cc-request-tabs">
        ${tabsHtml}
      </div>
      <div id="commandCenterRequestsList" class="cc-request-list">
        ${cardsHtml}
      </div>
    </div>
  `;
}

function renderCommandCenterRequestFilter(type) {
  activeRequestCategory = type || 'all';
  renderCommandCenter();
}

function isoToTimesheetParts(isoDate) {
  const date = new Date(`${isoDate}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return { day: date.getDate(), month: date.getMonth() + 1, year: date.getFullYear(), dateText: `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}` };
}

function addDaysIso(isoDate, offset) {
  const date = new Date(`${isoDate}T12:00:00`);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function getEmployeeIndexFromRequest(req) {
  const payload = req?.payload || {};
  const byPayload = payload.employeeIdx ?? payload.employeeId;
  if (byPayload !== undefined && employees[Number(byPayload)]) return Number(byPayload);
  if (req?.requesterId !== undefined && employees[Number(req.requesterId)]) return Number(req.requesterId);
  const name = payload.employeeName || req?.requesterName || '';
  if (name) {
    const idx = employees.findIndex(emp => emp.name === name);
    if (idx >= 0) return idx;
  }
  return -1;
}

function findOrCreateTimesheetRecord(empIdx, isoDate) {
  const emp = employees[empIdx];
  const parts = isoToTimesheetParts(isoDate);
  if (!emp || !parts) return null;
  if (!Array.isArray(emp.records)) emp.records = [];
  let rec = emp.records.find(r => r.day === parts.day && r.month === parts.month && r.year === parts.year);
  if (!rec) {
    rec = {
      day: parts.day,
      month: parts.month,
      year: parts.year,
      date: parts.dateText,
      checkIn: '',
      checkOut: '',
      checkInMin: null,
      checkOutMin: null,
      hours: 0,
      status: isFriday(parts.year, parts.month, parts.day) ? 'friday' : 'absent',
      advance: 0,
      penalty: 0,
      bonus: 0,
      damage: 0,
      notes: ''
    };
    emp.records.push(rec);
  }
  return rec;
}

function addTimesheetManagerApproval(rec, req, kind) {
  rec.managerApproved = true;
  rec.managerApprovalKind = kind;
  rec.managerApprovalRequestId = req.id;
  rec.managerApprovalNote = req.decisionNote || '';
  rec.managerApprovedAt = req.decidedAt || new Date().toISOString();
  rec.managerApprovedBy = req.decidedBy || 'المدير';
  rec.approvalSource = 'command_center';
}

function applyLeaveRequestToTimesheet(req) {
  const payload = req.payload || {};
  const empIdx = getEmployeeIndexFromRequest(req);
  if (empIdx < 0) return { ok: false, message: 'لم يتم العثور على الموظف' };
  const from = payload.dateFrom || payload.from || payload.startDate;
  const to = payload.dateTo || payload.to || payload.endDate || from;
  if (!from || !to) return { ok: false, message: 'تواريخ الإجازة غير مكتملة' };
  let cursor = from;
  let touched = 0;
  let preserved = 0;
  while (cursor <= to) {
    const rec = findOrCreateTimesheetRecord(empIdx, cursor);
    if (rec) {
      const hadWork = !!(rec.checkIn || rec.checkOut || rec.checkInMin != null || rec.checkOutMin != null);
      if (hadWork && rec.status !== 'leave') preserved++;
      if (!hadWork || rec.status === 'absent' || rec.status === 'leave') {
        rec.status = 'leave';
        rec.leaveType = payload.leaveType || payload.type || 'إجازة';
        rec.checkIn = rec.checkIn || '';
        rec.checkOut = rec.checkOut || '';
        rec.checkInMin = rec.checkIn ? parseTime(rec.checkIn) : null;
        rec.checkOutMin = rec.checkOut ? parseTime(rec.checkOut) : null;
        rec.hours = rec.checkInMin != null && rec.checkOutMin != null ? getRecordHours(rec) : 0;
      }
      rec.leaveReason = payload.reason || '';
      rec.leaveNotes = payload.notes || '';
      addTimesheetManagerApproval(rec, req, 'leave');
      touched++;
    }
    cursor = addDaysIso(cursor, 1);
  }
  return { ok: true, type: 'leave', employeeName: employees[empIdx]?.name, days: touched, preservedWorkedDays: preserved };
}

function applyAttendanceCorrectionToTimesheet(req) {
  const payload = req.payload || {};
  const empIdx = getEmployeeIndexFromRequest(req);
  if (empIdx < 0) return { ok: false, message: 'لم يتم العثور على الموظف' };
  const date = payload.date || payload.correctionDate || todayISO();
  const rec = findOrCreateTimesheetRecord(empIdx, date);
  if (!rec) return { ok: false, message: 'تعذر إنشاء سجل التايم شيت' };
  if (rec.originalInTime === undefined) rec.originalInTime = rec.checkIn || '';
  if (rec.originalOutTime === undefined) rec.originalOutTime = rec.checkOut || '';
  const correctedIn = payload.correctedInTime || payload.checkIn || payload.inTime || '';
  const correctedOut = payload.correctedOutTime || payload.checkOut || payload.outTime || '';
  if (correctedIn) rec.checkIn = correctedIn;
  if (correctedOut) rec.checkOut = correctedOut;
  rec.inTime = rec.checkIn || '';
  rec.outTime = rec.checkOut || '';
  rec.checkInMin = parseTime(rec.checkIn);
  rec.checkOutMin = parseTime(rec.checkOut);
  rec.hours = getRecordHours(rec);
  if (rec.checkInMin != null && rec.checkOutMin != null && normalizeStatus(rec.status) !== 'friday') {
    rec.status = 'normal';
  }
  rec.attendanceCorrected = true;
  rec.correctionReason = payload.reason || '';
  rec.correctionNotes = payload.notes || '';
  addTimesheetManagerApproval(rec, req, 'attendance_correction');
  return { ok: true, type: 'attendance_correction', employeeName: employees[empIdx]?.name, date, originalInTime: rec.originalInTime, originalOutTime: rec.originalOutTime, correctedInTime: rec.checkIn, correctedOutTime: rec.checkOut };
}

function getPurchaseKanbanColumnId() {
  ensureOmni();
  let col = (omni.kanban.columns || []).find(c => /purchase|procurement|شراء|مشتريات/i.test(`${c.title || ''} ${c.name || ''}`));
  if (!col) {
    col = { id: makeId('kb_purchase'), title: 'مشتريات', cards: [] };
    omni.kanban.columns.push(col);
  }
  return col.id;
}

function createPurchaseOrderFromRequest(req) {
  ensureOmni();
  const payload = req.payload || {};
  const existing = (omni.purchaseOrders || []).find(po => po.requestId === req.id);
  if (existing) return { ok: true, type: 'purchase', purchaseOrderId: existing.id, cardId: existing.cardId || '', duplicate: true };
  const mat = getMaterialById(payload.materialId);
  const qty = Number(payload.requestedQty ?? payload.qty ?? payload.approvedQty ?? 0) || 0;
  const unitCost = Number(payload.unitCost || mat?.cost || 0);
  const po = {
    id: makeId('po'),
    requestId: req.id,
    materialId: payload.materialId || '',
    materialName: payload.materialName || mat?.name || 'مادة',
    requestedQty: qty,
    approvedQty: qty,
    receivedQty: 0,
    unit: payload.unit || mat?.unit || '',
    status: 'approved',
    sourcePage: 'command_center',
    createdAt: new Date().toISOString(),
    approvedAt: req.decidedAt || new Date().toISOString(),
    approvedBy: req.decidedBy || 'المدير',
    notes: req.decisionNote || payload.reason || '',
    unitCost: unitCost,
    supplierName: String(payload.supplier || mat?.supplier || '').trim(),
    supplierId: String(payload.supplierId || mat?.supplierId || ''),
    items: [{
      materialId: payload.materialId || '',
      materialName: payload.materialName || mat?.name || 'مادة',
      qty: qty,
      receivedQty: 0,
      unit: payload.unit || mat?.unit || '',
      unitCost: unitCost
    }],
    receipts: [],
    activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء أمر شراء بعد موافقة المدير' }]
  };
  const sup = upsertSupplierByName(po.supplierName);
  if (sup) po.supplierId = sup.id;
  omni.purchaseOrders.unshift(po);
  const card = {
    id: makeId('card'),
    columnId: getPurchaseKanbanColumnId(),
    title: `شراء مادة: ${po.materialName}`,
    description: `أمر شراء من مركز القيادة\nالكمية: ${po.approvedQty} ${po.unit}\nالسبب: ${payload.reason || '-'}`,
    owner: 'المشتريات',
    priority: req.priority === 'urgent' ? 'Urgent' : req.priority === 'high' ? 'High' : 'Normal',
    dueDate: todayISO(),
    tags: ['purchase_order', 'مشتريات'],
    sourceType: 'purchase_order',
    sourceId: po.id,
    materialRequirements: po.materialId ? [{ materialId: po.materialId, qty: po.approvedQty, quantity: po.approvedQty, unit: po.unit }] : [],
    activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء بطاقة شراء من الطلب ${req.id}` }]
  };
  omni.kanban.cards.push(card);
  po.cardId = card.id;
  addOmniSystemLog({ action: 'purchase_order_created', message: `تم إنشاء أمر شراء: ${po.materialName} × ${po.approvedQty}`, page: 'command_center', entityType: 'purchase_order', entityId: po.id, severity: 'success' });
  createOmniNotification({ type: 'purchase', title: 'تم اعتماد طلب الشراء', message: `تم إنشاء أمر شراء لـ ${po.materialName}`, sourcePage: 'command_center', sourceType: 'purchase_order', sourceId: po.id, severity: 'success', actionPage: 'command_center' });
  return { ok: true, type: 'purchase', purchaseOrderId: po.id, cardId: po.cardId };
}

function applyApprovedOmniRequest(requestId, options = {}) {
  ensureOmni();
  const req = (omni.requests || []).find(r => r.id === requestId);
  if (!req) return null;
  if (req.status !== 'approved') return req;
  if (req.applied) return req.appliedResult || req;
  let result;
  if (req.type === 'leave') result = applyLeaveRequestToTimesheet(req);
  else if (req.type === 'attendance_correction') result = applyAttendanceCorrectionToTimesheet(req);
  else if (req.type === 'purchase') result = createPurchaseOrderFromRequest(req);
  else if (req.type === 'ai_analysis') {
    const ruleId = req.payload?.ruleId;
    const rule = (omni.automationRules || []).find(r => r.id === ruleId);
    const eventType = req.payload?.eventType;
    const eventData = req.payload?.eventData;
    const proposalSummary = `تحليل ذكي تلقائي ناتج عن حدث [${eventType}] بواسطة القاعدة [${rule?.name || ruleId}]. البيانات: ${JSON.stringify(eventData || {})}`;
    const ai = getAiControl();
    const aiCtx = getAiCurrentUserContext();
    const proposal = {
      id: makeId('aiprop'),
      actionId: 'trigger_ai_analysis',
      title: `تحليل تلقائي: ${rule?.name || 'قاعدة الأتمتة'}`,
      target: 'task_manager',
      mode: 'approval_required',
      risk: 'medium',
      status: 'pending',
      summary: proposalSummary,
      affectedRecords: 1,
      createdAt: new Date().toISOString(),
      requestedBy: aiCtx.name,
      requestedById: aiCtx.id,
      requestedByRole: aiCtx.role,
      source: 'automation_ai_analysis',
      payload: { userId: aiCtx.id, userName: aiCtx.name, userRole: aiCtx.role, source: 'automation_ai_analysis', ruleId, eventType, eventData }
    };
    ai.actionQueue.unshift(proposal);
    addAiRunHistory({ actionId: 'trigger_ai_analysis', title: proposal.title, status: 'queued', note: 'AI Analysis triggered and proposal added to AI action queue.' });
    result = { ok: true, type: 'ai_analysis', message: 'تم إطلاق تحليل AI بنجاح وإضافة المقترح لطابور موافقة AI' };
  }
  else result = { ok: true, type: req.type, message: 'تم اعتماد الطلب بدون أثر تشغيلي في هذه المرحلة' };
  req.applied = !!result?.ok;
  req.appliedAt = new Date().toISOString();
  req.appliedResult = result || {};
  req.activityLog = req.activityLog || [];
  req.activityLog.unshift({ date: req.appliedAt, text: result?.ok ? 'تم تطبيق أثر الموافقة' : `تعذر التطبيق: ${result?.message || 'غير محدد'}` });
  addOmniSystemLog({
    action: result?.ok ? `request_applied_${req.type}` : `request_apply_failed_${req.type}`,
    message: result?.ok ? `تم تطبيق الطلب: ${req.title}` : `تعذر تطبيق الطلب: ${req.title}`,
    page: req.type === 'purchase' ? 'inventory' : 'timesheet',
    entityType: 'request',
    entityId: req.id,
    severity: result?.ok ? 'success' : 'warning'
  });
  createOmniNotification({
    type: 'approval',
    title: result?.ok ? 'تم تنفيذ الموافقة' : 'الموافقة تحتاج متابعة',
    message: result?.ok ? `${req.title} تم تطبيقه على النظام` : `${req.title}: ${result?.message || 'راجع مركز القيادة'}`,
    sourcePage: req.type === 'purchase' ? 'inventory' : 'timesheet',
    sourceType: 'request',
    sourceId: req.id,
    severity: result?.ok ? 'success' : 'warning',
    actionPage: req.type === 'purchase' ? 'command_center' : 'timesheet',
    targetUserId: req.requesterId || '',
    targetName: req.requesterName || ''
  });
  if (!options.skipSave) saveData();
  if (!options.skipRender) {
    if (currentPage === 'command_center') renderCommandCenter();
    if (currentPage === 'timesheet') renderTimesheet();
    if (currentPage === 'calendar') renderAttendanceCalendar();
    if (currentPage === 'inventory') renderInventoryPage();
    if (currentPage === 'kanban') renderKanbanBoard();
  }
  return req.appliedResult;
}

async function receivePurchaseOrder(poId) {
  ensureOmni();
  const po = (omni.purchaseOrders || []).find(p => p.id === poId);
  if (!po || !['approved', 'ordered', 'partial'].includes(po.status)) return;

  // Render a multi-line intake form
  let linesHtml = '';
  po.items.forEach((item, index) => {
    const remaining = Math.max(0, Number(item.qty || 0) - Number(item.receivedQty || 0));
    linesHtml += `
      <tr data-index="${index}">
        <td style="padding: 6px;"><b>${escapeHtml(item.materialName)}</b></td>
        <td style="padding: 6px; text-align: center;">${item.qty} ${escapeHtml(item.unit || '')}</td>
        <td style="padding: 6px; text-align: center;">${item.receivedQty}</td>
        <td style="padding: 6px;">
          <input type="number" class="form-input qty-intake" style="width: 80px; text-align: center; margin: 0; padding: 4px;" value="${remaining}" min="0">
        </td>
        <td style="padding: 6px;">
          <input type="number" step="0.01" class="form-input cost-intake" style="width: 100px; text-align: center; margin: 0; padding: 4px;" value="${item.unitCost || 0}">
        </td>
      </tr>
    `;
  });

  const defaultSupplier = po.supplierName || '';
  const modalHtml = `
    <div style="font-size: 13px;">
      <p>أمر شراء: <b>${po.id}</b></p>
      <div style="margin-bottom: 12px;">
        <label>المورد</label>
        <input id="poReceiveSupplier" class="form-input" value="${escapeHtml(defaultSupplier)}">
      </div>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px;" class="inv-table">
        <thead>
          <tr>
            <th style="padding: 6px; text-align: right;">المادة</th>
            <th style="padding: 6px; text-align: center;">المطلوب</th>
            <th style="padding: 6px; text-align: center;">المستلم سابقاً</th>
            <th style="padding: 6px; text-align: center;">المستلم الآن</th>
            <th style="padding: 6px; text-align: center;">كلفة الوحدة</th>
          </tr>
        </thead>
        <tbody>
          ${linesHtml}
        </tbody>
      </table>
      <div>
        <label>ملاحظة الاستلام</label>
        <input id="poReceiveNote" class="form-input" placeholder="ملاحظات اختيارية...">
      </div>
    </div>
  `;

  const result = await showOmniModal('استلام شحنة مواد', modalHtml, body => {
    const rows = body.querySelectorAll('tbody tr');
    const intakes = [];
    rows.forEach(row => {
      const idx = Number(row.dataset.index);
      const qtyInput = row.querySelector('.qty-intake');
      const costInput = row.querySelector('.cost-intake');
      intakes.push({
        index: idx,
        qty: Number(qtyInput?.value) || 0,
        unitCost: Number(costInput?.value) || 0
      });
    });
    return {
      supplier: body.querySelector('#poReceiveSupplier')?.value.trim() || '',
      note: body.querySelector('#poReceiveNote')?.value.trim() || '',
      intakes: intakes
    };
  });

  if (!result || result.intakes.every(item => item.qty <= 0)) {
    return showToast('لم يتم إدخال كميات مستلمة', 'warning');
  }

  // Update supplier name if changed
  if (result.supplier) {
    po.supplierName = result.supplier;
    const sup = upsertSupplierByName(result.supplier);
    if (sup) po.supplierId = sup.id;
  }

  po.receipts = po.receipts || [];
  const receiptNumber = po.receipts.length + 1;
  const receiptDate = new Date().toISOString();

  let totalReceiptValue = 0;
  let allLinesReceived = true;

  // Process each item received
  result.intakes.forEach(intake => {
    const item = po.items[intake.index];
    if (!item || intake.qty <= 0) {
      if (item && item.receivedQty < item.qty) allLinesReceived = false;
      return;
    }

    const mat = getMaterialById(item.materialId);
    if (!mat) {
      console.warn(`Material not found in inventory: ${item.materialId}`);
      return;
    }

    // Update physical stock
    mat.stock = (Number(mat.stock) || 0) + intake.qty;
    mat.lastMovementAt = receiptDate;
    mat.activityLog = Array.isArray(mat.activityLog) ? mat.activityLog : [];
    mat.activityLog.unshift({
      date: receiptDate,
      text: `استلام شراء: +${intake.qty} ${item.unit || mat.unit || ''} من أمر ${po.id}`
    });

    // Record Stock Movement
    recordStockMovement(item.materialId, 'in', intake.qty, {
      sourceType: 'po',
      sourceId: po.id,
      ref: `أمر شراء ${po.id}${po.supplierName ? ' · ' + po.supplierName : ''}`,
      note: `استلام: ${intake.qty} ${item.unit || mat.unit || ''} بكلفة ${intake.unitCost || 0}/وحدة`
    });

    // Log this item in the PO receipts log
    po.receipts.push({
      number: receiptNumber,
      date: receiptDate,
      materialId: item.materialId,
      materialName: item.materialName,
      qty: intake.qty,
      unitCost: intake.unitCost,
      note: result.note || ''
    });

    // Update PO item counts
    item.receivedQty = (Number(item.receivedQty) || 0) + intake.qty;
    item.unitCost = intake.unitCost; // Update unitCost with actual cost

    // Also update Supplier Price History & catalog negotiatedPrice if not set
    if (po.supplierId) {
      const sup = (omni.suppliers || []).find(s => s.id === po.supplierId);
      if (sup) {
        // Add to price history
        sup.priceHistory = sup.priceHistory || [];
        sup.priceHistory.unshift({
          date: receiptDate,
          materialId: item.materialId,
          qty: intake.qty,
          unitCost: intake.unitCost,
          poId: po.id
        });
        // Update catalog price if matching
        const catEntry = (sup.catalog || []).find(c => c.materialId === item.materialId);
        if (catEntry) {
          catEntry.lastPurchasePrice = intake.unitCost;
        } else {
          // If not in catalog, add it
          sup.catalog = sup.catalog || [];
          sup.catalog.push({
            materialId: item.materialId,
            SKU: 'SKU-' + item.materialId.replace('mat_', '').slice(0, 4).toUpperCase(),
            negotiatedPrice: intake.unitCost,
            lastPurchasePrice: intake.unitCost,
            leadTime: 3
          });
        }
      }
    }

    // Keep track of value for accounting entry
    const itemValue = intake.qty * intake.unitCost;
    totalReceiptValue += itemValue;

    // Sprint E: double-entry purchase JE per received item
    if (window.FinanceService?.generatePurchaseEntry && itemValue > 0) {
      FinanceService.generatePurchaseEntry({
        poId: po.id,
        materialName: item.materialName,
        amount: itemValue,
        supplierId: po.supplierId || '',
        origin: `po/${po.id}/r/${receiptNumber}/m/${item.materialId}`,
      }).catch(e => console.warn('Purchase JE failed:', e));
    }

    if (item.receivedQty < item.qty) {
      allLinesReceived = false;
    }
  });

  // Check overall received status
  po.items.forEach(item => {
    if (item.receivedQty < item.qty) {
      allLinesReceived = false;
    }
  });

  po.receivedQty = po.items.reduce((sum, item) => sum + (item.receivedQty || 0), 0);
  po.approvedQty = po.items.reduce((sum, item) => sum + (item.qty || 0), 0);
  po.status = allLinesReceived ? 'received' : 'partial';
  po.receivedAt = receiptDate;

  // Maintain root fields for backward compatibility
  if (po.items.length > 0) {
    po.materialId = po.items[0].materialId;
    po.materialName = po.items[0].materialName;
    po.receivedQty = po.items.reduce((sum, i) => sum + (i.receivedQty || 0), 0);
    po.approvedQty = po.items.reduce((sum, i) => sum + (i.qty || 0), 0);
    po.unitCost = po.items[0].unitCost;
  }

  // Update supplier aggregate stats
  if (po.supplierId) {
    const sup = (omni.suppliers || []).find(s => s.id === po.supplierId);
    if (sup) {
      sup.lastReceiptAt = receiptDate;
      sup.totalReceipts = (sup.totalReceipts || 0) + 1;
      sup.totalAmount = (sup.totalAmount || 0) + totalReceiptValue;
      po.items.forEach(item => {
        if (!sup.materials.includes(item.materialId)) sup.materials.push(item.materialId);
      });
    }
  }

  addOmniSystemLog({
    action: 'material_received',
    message: `تم استلام شحنة من أمر الشراء ${po.id} بقيمة إجمالية ${totalReceiptValue.toLocaleString()}`,
    page: 'inventory',
    entityType: 'purchase_order',
    entityId: po.id,
    severity: 'success'
  });

  createOmniNotification({
    type: 'inventory',
    title: 'تم استلام شحنة شراء',
    message: `أمر الشراء ${po.id}: تم توريد مواد للمستودع.`,
    sourcePage: 'inventory',
    sourceType: 'purchase_order',
    sourceId: po.id,
    severity: 'success',
    actionPage: 'inventory'
  });

  saveData();
  showToast('تم استلام الشحنة وتحديث المخزون بنجاح', 'success');

  if (currentPage === 'command_center') renderCommandCenter();
  if (currentPage === 'inventory') renderInventoryPage();
}

function markPurchaseOrderOrdered(poId) {
  ensureOmni();
  const po = (omni.purchaseOrders || []).find(p => p.id === poId);
  if (!po || !['approved', 'sent'].includes(po.status)) return;
  po.status = 'ordered';
  po.orderedAt = new Date().toISOString();
  po.activityLog = po.activityLog || [];
  po.activityLog.unshift({ date: po.orderedAt, text: 'تم إرسال أمر الشراء وتأكيده مع المورد' });
  addOmniSystemLog({ action: 'purchase_order_ordered', message: `تم طلب الشراء من المورد: ${po.materialName || 'متعدد'}`, page: 'command_center', entityType: 'purchase_order', entityId: po.id, severity: 'info' });
  createOmniNotification({ type: 'purchase', title: 'تم طلب الشراء من المورد', message: po.materialName || 'أمر شراء متعدد المواد', sourcePage: 'command_center', sourceType: 'purchase_order', sourceId: po.id, severity: 'info', actionPage: 'command_center' });
  saveData();
  if (currentPage === 'command_center') renderCommandCenter();
  if (currentPage === 'inventory') renderInventoryPage();
}

function sendRfqToSupplier(poId) {
  ensureOmni();
  const po = (omni.purchaseOrders || []).find(p => p.id === poId);
  if (!po || po.status !== 'draft') return;
  po.status = 'sent';
  po.sentAt = new Date().toISOString();
  po.activityLog = po.activityLog || [];
  po.activityLog.unshift({ date: po.sentAt, text: 'تم إرسال طلب عرض السعر (RFQ) للمورد للمطابقة' });
  addOmniSystemLog({ action: 'rfq_sent', message: `تم إرسال طلب عرض سعر ${po.id} إلى ${po.supplierName}`, page: 'inventory', entityType: 'purchase_order', entityId: po.id, severity: 'info' });
  saveData();
  showToast('تم إرسال طلب عرض السعر (RFQ) بنجاح', 'success');
  if (currentPage === 'inventory') renderInventoryPage();
}

function confirmPurchaseOrder(poId) {
  ensureOmni();
  const po = (omni.purchaseOrders || []).find(p => p.id === poId);
  if (!po || !['draft', 'sent'].includes(po.status)) return;

  // If user is Admin or supervisor routing bypassed, approve immediately. Otherwise, it could require approval.
  // In our simplified workshop workflow, we confirm and approve directly but log it.
  po.status = 'approved';
  po.approvedAt = new Date().toISOString();
  po.approvedBy = 'المدير';
  po.activityLog = po.activityLog || [];
  po.activityLog.unshift({ date: po.approvedAt, text: 'تم اعتماد طلب الشراء وتحويله لأمر شراء رسمي (PO)' });

  // Create Kanban Card
  const card = {
    id: makeId('card'),
    columnId: getPurchaseKanbanColumnId(),
    title: `شراء مواد: ${po.materialName || 'مواد متعددة'}`,
    description: `أمر شراء رقم ${po.id}\nالمورد: ${po.supplierName}\nعدد المواد: ${po.items.length}\nملاحظات: ${po.notes || '-'}`,
    owner: 'المشتريات',
    priority: 'Normal',
    dueDate: todayISO(),
    tags: ['purchase_order', 'مشتريات'],
    sourceType: 'purchase_order',
    sourceId: po.id,
    materialRequirements: po.items.map(i => ({ materialId: i.materialId, qty: i.qty, quantity: i.qty, unit: i.unit })),
    activityLog: [{ date: new Date().toISOString(), text: `تم إنشاء بطاقة شراء من الأمر المعتمد ${po.id}` }]
  };
  omni.kanban.cards.push(card);
  po.cardId = card.id;

  addOmniSystemLog({ action: 'purchase_order_approved', message: `تم اعتماد أمر الشراء ${po.id} لـ ${po.supplierName}`, page: 'inventory', entityType: 'purchase_order', entityId: po.id, severity: 'success' });
  createOmniNotification({ type: 'purchase', title: 'تم اعتماد أمر الشراء', message: `أمر الشراء ${po.id} جاهز للتوريد`, sourcePage: 'inventory', sourceType: 'purchase_order', sourceId: po.id, severity: 'success', actionPage: 'inventory' });

  saveData();
  showToast('تم اعتماد أمر الشراء (PO) وتوليد بطاقة كانبان', 'success');
  if (currentPage === 'inventory') renderInventoryPage();
  if (currentPage === 'kanban') renderKanbanBoard();
}

function cancelPurchaseOrder(poId) {
  ensureOmni();
  const po = (omni.purchaseOrders || []).find(p => p.id === poId);
  if (!po || ['received', 'cancelled'].includes(po.status)) return;
  po.status = 'cancelled';
  po.cancelledAt = new Date().toISOString();
  po.activityLog = po.activityLog || [];
  po.activityLog.unshift({ date: po.cancelledAt, text: 'تم إلغاء أمر الشراء' });

  // Archive kanban card if exists
  if (po.cardId) {
    const card = (omni.kanban.cards || []).find(c => c.id === po.cardId);
    if (card) {
      card.archived = true;
      card.activityLog.push({ date: new Date().toISOString(), text: 'تمت أرشفة البطاقة بسبب إلغاء أمر الشراء' });
    }
  }

  addOmniSystemLog({ action: 'purchase_order_cancelled', message: `تم إلغاء أمر الشراء ${po.id}`, page: 'inventory', entityType: 'purchase_order', entityId: po.id, severity: 'warning' });
  saveData();
  showToast('تم إلغاء أمر الشراء', 'info');
  if (currentPage === 'inventory') renderInventoryPage();
}

function getAutoProcurementProposals() {
  ensureOmni();
  const proposals = [];
  (omni.materials || []).forEach(m => {
    const stockQty = Number(m.stock) || 0;
    const reservedQty = getMaterialReservedQty(m);
    const availableQty = stockQty - reservedQty;
    const minStock = Number(m.minimum) || 0;
    if (availableQty < minStock) {
      const shortfall = minStock - availableQty;
      proposals.push({
        materialId: m.id,
        materialName: m.name,
        currentStock: stockQty,
        reservedQty: reservedQty,
        availableQty: availableQty,
        minimum: minStock,
        shortfall: shortfall,
        supplierName: m.supplier || '',
        supplierId: m.supplierId || '',
        unit: m.unit || '',
        cost: Number(m.cost) || 0,
        reason: availableQty < 0 ? 'طلب الإنتاج وحد الأمان' : 'حد الأمان'
      });
    }
  });
  return proposals;
}

function createMultiLineRFQ(supplierId, supplierName, items, notes = '') {
  ensureOmni();
  const po = {
    id: makeId('po'),
    requestId: '',
    supplierId: supplierId || '',
    supplierName: supplierName || 'مورد عام',
    status: 'draft',
    sourcePage: 'inventory',
    createdAt: new Date().toISOString(),
    notes: notes,
    items: items.map(item => ({
      materialId: item.materialId,
      materialName: item.materialName,
      qty: Number(item.qty) || 0,
      receivedQty: 0,
      unit: item.unit || '',
      unitCost: Number(item.unitCost) || 0
    })),
    receipts: [],
    activityLog: [{ date: new Date().toISOString(), text: 'تم إنشاء طلب عرض سعر (RFQ) كمسودة تلقائية' }]
  };

  if (po.items.length > 0) {
    po.materialId = po.items[0].materialId;
    po.materialName = po.items[0].materialName;
    po.approvedQty = po.items.reduce((sum, i) => sum + (i.qty || 0), 0);
    po.requestedQty = po.approvedQty;
    po.receivedQty = 0;
    po.unit = po.items[0].unit;
    po.unitCost = po.items[0].unitCost;
  }

  const sup = (omni.suppliers || []).find(s => s.id === supplierId);
  if (sup) {
    po.supplierName = sup.name;
  }

  omni.purchaseOrders.unshift(po);
  saveData();
  return po;
}

function updateSupplierNegotiatedPrice(supplierId, materialId, newPrice) {
  ensureOmni();
  const sup = (omni.suppliers || []).find(s => s.id === supplierId);
  if (!sup) return false;
  sup.catalog = sup.catalog || [];
  const entry = sup.catalog.find(c => c.materialId === materialId);
  if (entry) {
    entry.negotiatedPrice = Number(newPrice) || 0;
    saveData();
    return true;
  }
  return false;
}

function addMaterialToSupplierCatalog(supplierId, materialId, negotiatedPrice, SKU = '', leadTime = 3) {
  ensureOmni();
  const sup = (omni.suppliers || []).find(s => s.id === supplierId);
  if (!sup) return false;
  sup.catalog = sup.catalog || [];
  const exists = sup.catalog.some(c => c.materialId === materialId);
  if (exists) return false;

  const mat = getMaterialById(materialId);
  sup.catalog.push({
    materialId,
    SKU: SKU || 'SKU-' + materialId.replace('mat_', '').slice(0, 4).toUpperCase(),
    negotiatedPrice: Number(negotiatedPrice) || (mat ? Number(mat.cost) : 0),
    leadTime: Number(leadTime) || 3
  });
  if (!sup.materials.includes(materialId)) sup.materials.push(materialId);

  saveData();
  return true;
}

function renderCommandCenterPurchaseAnalytics() {
  ensureOmni();
  const pos = omni.purchaseOrders || [];
  const open = pos.filter(po => !['received', 'cancelled'].includes(po.status));
  const partial = pos.filter(po => po.status === 'partial');
  const received = pos.filter(po => po.status === 'received');
  // Outstanding committed value: open POs × unitCost × remaining qty
  const outstandingValue = open.reduce((sum, po) => {
    const remaining = Math.max(0, Number(po.approvedQty || 0) - Number(po.receivedQty || 0));
    return sum + remaining * Number(po.unitCost || 0);
  }, 0);
  // Top 5 suppliers by totalAmount
  const topSuppliers = (omni.suppliers || [])
    .slice()
    .sort((a, b) => Number(b.totalAmount || 0) - Number(a.totalAmount || 0))
    .slice(0, 5);
  const recentReceipts = getPurchaseReceivingHistory(5);
  return `
    <div class="cc-section cc-purchase-analytics">
      <div class="cc-section-title-row">
        <h3><i class="fa-solid fa-chart-pie"></i> تحليلات الشراء</h3>
        <span>${(omni.suppliers || []).length} مورد</span>
      </div>
      <div class="cc-kpi-grid">
        <div class="cc-kpi"><div class="cc-kpi-val">${open.length}</div><div class="cc-kpi-label">أوامر شراء مفتوحة</div></div>
        <div class="cc-kpi cc-kpi-yellow"><div class="cc-kpi-val">${partial.length}</div><div class="cc-kpi-label">استلام جزئي</div></div>
        <div class="cc-kpi"><div class="cc-kpi-val">${received.length}</div><div class="cc-kpi-label">مكتملة</div></div>
        <div class="cc-kpi"><div class="cc-kpi-val">${Number(outstandingValue).toLocaleString()}</div><div class="cc-kpi-label">قيمة مرتبطة (متبقي)</div></div>
        <div class="cc-kpi"><div class="cc-kpi-val">${recentReceipts.length}</div><div class="cc-kpi-label">آخر الاستلامات</div></div>
      </div>
      ${topSuppliers.length ? `
        <h4 style="margin-top:12px"><i class="fa-solid fa-trophy"></i> أعلى الموردين بالقيمة</h4>
        <ol class="cc-supplier-rank" style="padding-inline-start:22px;margin:0">
          ${topSuppliers.map(s => `<li>
            <b>${escapeHtml(s.name)}</b>
            <span class="muted"> · ${Number(s.totalReceipts || 0)} استلام · ${Number(s.totalAmount || 0).toLocaleString()}</span>
          </li>`).join('')}
        </ol>
      ` : '<p class="muted">لا توجد بيانات موردين بعد.</p>'}
    </div>
  `;
}



function renderCommandCenterPurchaseTracking(filter = 'active') {
  ensureOmni();
  const requests = ['active', 'pending'].includes(filter)
    ? (omni.requests || []).filter(r => r.type === 'purchase' && r.status === 'pending')
    : [];
  const orders = (omni.purchaseOrders || []).filter(po => filter === 'active' ? po.status !== 'received' && po.status !== 'cancelled' : filter === 'pending' ? false : po.status === filter);
  const filterBtns = [['active','النشطة'], ['pending','بانتظار الموافقة'], ['approved','معتمدة'], ['ordered','مطلوبة'], ['partial','جزئية'], ['received','مستلمة']];
  return `
    <div class="cc-section cc-purchase-tracking">
      <div class="cc-section-title-row">
        <h3><i class="fa-solid fa-cart-shopping"></i> طلبات الشراء والمتابعة</h3>
        <span>${requests.length + orders.length} عنصر</span>
      </div>
      <div class="cc-request-tabs">${filterBtns.map(([key,label]) => `<button class="${filter === key ? 'active' : ''}" onclick="renderCommandCenterPurchaseFilter('${key}')">${label}</button>`).join('')}</div>
      <div id="commandCenterPurchaseList" class="purchase-order-list">
        ${requests.map(req => `<div class="purchase-order-card is-pending">
          <b>${escapeHtml(req.title)}</b>
          <p>${escapeHtml(req.description || req.payload?.reason || '')}</p>
          <small>طلب ينتظر الموافقة · ${formatOmniDateTime(req.createdAt)}</small>
        </div>`).join('')}
        ${orders.map(po => {
          const mat = getMaterialById(po.materialId);
          return `<div class="purchase-order-card purchase-status-${po.status}">
            <div>
              <b>${escapeHtml(po.materialName)}</b>
              <p>${Number(po.receivedQty || 0)} / ${Number(po.approvedQty || 0)} ${escapeHtml(po.unit || '')} · المخزون الحالي: ${Number(mat?.stock || 0)}</p>
              <small>الحالة: ${escapeHtml(po.status)} · ${formatOmniDateTime(po.createdAt)}</small>
            </div>
            <div class="cc-request-actions">
              ${po.status === 'approved' ? `<button class="btn-secondary" onclick="markPurchaseOrderOrdered('${po.id}')">تم الطلب من المورد</button>` : ''}
              ${['approved','ordered','partial'].includes(po.status) ? `<button class="btn-primary" onclick="receivePurchaseOrder('${po.id}')">استلام المواد</button>` : ''}
              <button class="btn-secondary" onclick="switchPage('inventory')">فتح المخزون</button>
              ${po.cardId ? `<button class="btn-secondary" onclick="switchPage('kanban'); setTimeout(()=>openKanbanCardInspector('${po.cardId}'),50)">فتح البطاقة</button>` : ''}
            </div>
          </div>`;
        }).join('')}
        ${!requests.length && !orders.length ? '<div class="cc-empty">لا توجد طلبات شراء ضمن هذا الفلتر.</div>' : ''}
      </div>
    </div>
  `;
}

function renderCommandCenterPurchaseFilter(filter) {
  const wrapper = document.querySelector('.cc-purchase-tracking');
  if (!wrapper) return;
  wrapper.outerHTML = renderCommandCenterPurchaseTracking(filter || 'active');
}

// ═══════════════════════════════════════════════════
// OPERATIONAL LINKING LAYER
// Ensures every card/task has reference fields for the full chain:
// Order → Workflow → OpPack → SOP → Task → Machine → Material → QC → Cost
// ═══════════════════════════════════════════════════

function normalizeOmniLinks() {
  const linkFields = {
    orderId: '',
    workflowId: '',
    operationPackId: '',
    operationPackStepId: '',
    sopIds: [],
    machineIds: [],
    materialRequirements: [],
    qcRecordIds: [],
    costEntries: [],
    dependencies: [],
    attachments: [],
    activityLog: [],
    comments: [],
    status: '',
    clientName: '',
    linkedOrderNum: ''
  };

  // Normalize Kanban cards
  (omni.kanban.cards || []).forEach(card => {
    Object.keys(linkFields).forEach(key => {
      if (card[key] === undefined) {
        card[key] = Array.isArray(linkFields[key]) ? [] : linkFields[key];
      }
    });
  });

  // Normalize Task Manager tasks
  (omni.taskManager.spaces || []).forEach(space => {
    (space.departments || []).forEach(dep => {
      (dep.sections || []).forEach(sec => {
        (sec.taskTypes || []).forEach(tt => {
          (tt.tasks || []).forEach(task => {
            Object.keys(linkFields).forEach(key => {
              if (task[key] === undefined) {
                task[key] = Array.isArray(linkFields[key]) ? [] : linkFields[key];
              }
            });
          });
        });
      });
    });
  });

  // Apply migration marker
  if (!omni.migrationsApplied.includes('linking_layer_v1')) {
    omni.migrationsApplied.push('linking_layer_v1');
    console.log('[OMNI] Migration applied: linking_layer_v1 — all cards/tasks now have operational link fields');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// SOP LIBRARY V2 — NORMALIZATION & MIGRATION
// Upgrades every SOP record to the full structured schema
// ════════════════════════════════════════════════════════════════════════════

function normalizeSops() {
  const sopDefaults = {
    code: '', department: '', section: '', type: 'تشغيلي', owner: '',
    purpose: '', description: '', machineIds: [], materialIds: [], taskTypes: [],
    requiredTools: [], requiredMaterials: [], safetyNotes: [], steps: [],
    checklist: [], qcCriteria: [], commonMistakes: [], estimatedMinutes: 0,
    requiredSkill: '', relatedWorkflowIds: [], relatedOperationPackIds: [],
    relatedTaskTemplateIds: [], version: 1, approvalStatus: 'draft',
    approvedBy: '', lastReviewDate: '', attachments: [], activityLog: [],
    createdAt: '', updatedAt: ''
  };

  (omni.sops || []).forEach(sop => {
    Object.keys(sopDefaults).forEach(key => {
      if (sop[key] === undefined) {
        sop[key] = Array.isArray(sopDefaults[key]) ? [] : sopDefaults[key];
      }
    });
    if (!sop.code) sop.code = 'SOP-' + (sop.id || '').replace('sop_', '').slice(0, 6).toUpperCase();
    if (!sop.createdAt) sop.createdAt = todayISO();
    if (!sop.description && sop.text) sop.description = sop.text;
  });

  if (!omni.migrationsApplied.includes('sop_library_v2')) {
    omni.migrationsApplied.push('sop_library_v2');
    console.log('[OMNI] Migration applied: sop_library_v2 — all SOPs upgraded to structured schema');
  }
}

// ═══════════════════════════════════════════════════
// WORKFLOW NODE EXTENSIONS — SAFE NORMALIZATION
// Adds extended type definitions and linking fields to workflow nodes
// ═══════════════════════════════════════════════════

const WORKFLOW_NODE_TYPES = [
  'trigger', 'human_task', 'sop', 'machine', 'inventory', 'qc',
  'finance', 'approval', 'condition', 'delay', 'notification',
  'rework', 'archive', 'action', 'operation'
];

function normalizeWorkflowNodes() {
  const nodeDefaults = {
    linkedSopId: '', linkedMachineId: '', linkedOperationPackId: '', materialRequirements: [],
    assignedRole: '', estimatedMinutes: 0, costImpact: 0,
    successPath: '', failurePath: '', activityLog: [],
    linkedCardId: '', linkedTaskId: '', linkedQcRecordId: '', orderId: '', department: '', branch: '',
    linkedQcTemplateId: '', qcRequired: false, qcPassPath: '', qcFailPath: '', qcReworkPath: ''
  };

  if (!omni.workflow) omni.workflow = { nodes: [], edges: [] };
  if (!Array.isArray(omni.workflow.nodes)) omni.workflow.nodes = [];
  if (!Array.isArray(omni.workflow.edges)) omni.workflow.edges = [];

  (omni.workflow.nodes || []).forEach(node => {
    if (!node.id) node.id = "node_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    if (!node.title) node.title = 'خطوة جديدة';
    if (!node.type) node.type = 'action';
    Object.keys(nodeDefaults).forEach(key => {
      if (node[key] === undefined) {
        node[key] = Array.isArray(nodeDefaults[key]) ? [] : nodeDefaults[key];
      }
    });
    node.estimatedMinutes = Number(node.estimatedMinutes) || 0;
    node.costImpact = Number(node.costImpact) || 0;
    if (!Array.isArray(node.materialRequirements)) node.materialRequirements = [];
    if (!Array.isArray(node.activityLog)) node.activityLog = [];
    if (node.type === 'qc') node.qcRequired = true;
  });

  (omni.workflow.edges || []).forEach(edge => {
    if (!edge.id) edge.id = "edge_" + Date.now() + "_" + Math.random().toString(36).slice(2);
    edge.from = edge.from || edge.source || edge.sourceNodeId || '';
    edge.to = edge.to || edge.target || edge.targetNodeId || '';
    edge.source = edge.source || edge.from;
    edge.target = edge.target || edge.to;
    edge.sourceNodeId = edge.sourceNodeId || edge.from;
    edge.targetNodeId = edge.targetNodeId || edge.to;
    if (!edge.sourcePort) edge.sourcePort = edge.type === 'success' ? 'success' : edge.type === 'failure' || edge.type === 'fail' ? 'failure' : edge.type === 'rework' ? 'rework' : 'output';
    if (!edge.targetPort) edge.targetPort = 'input';
    edge.sourcePort = normalizeWorkflowPortName(edge.sourcePort);
    edge.targetPort = normalizeWorkflowPortName(edge.targetPort);
    if (!edge.type) edge.type = edge.sourcePort === 'success' ? 'success' : edge.sourcePort === 'failure' ? 'failure' : edge.sourcePort === 'rework' ? 'rework' : 'normal';
    if (edge.type === 'fail') edge.type = 'failure';
    if (!edge.createdAt) edge.createdAt = new Date().toISOString();
  });

  if (!omni.migrationsApplied.includes('workflow_nodes_v2')) {
    omni.migrationsApplied.push('workflow_nodes_v2');
    console.log('[OMNI] Migration applied: workflow_nodes_v2 — workflow nodes have extended linking fields');
  }
  if (!omni.migrationsApplied.includes('workflow_designer_v2')) {
    omni.migrationsApplied.push('workflow_designer_v2');
  }
}

function normalizeWorkflowRelations() {
  normalizeWorkflowNodes();
}

function normalizeOperationPackSteps() {
  (omni.opPacks || []).forEach(pack => {
    if (!Array.isArray(pack.steps)) pack.steps = [];
    if (!Array.isArray(pack.activityLog)) pack.activityLog = [];
    // Unit-aware pricing (non-destructive — defaults preserve previous fixed-only behavior)
    if (!pack.unitType) pack.unitType = 'fixed';
    pack.unitLabel = opPackUnitTypeLabel(pack.unitType);
    if (pack.defaultSize === undefined || pack.defaultSize === null) pack.defaultSize = 1;
    // Customer-facing pricing layer (overhead + logistics + profit). All defaults = 0 so
    // legacy packs continue to display internal cost as customer price (no markup applied).
    if (!pack.pricing || typeof pack.pricing !== 'object') pack.pricing = {};
    if (pack.pricing.overheadPct === undefined) pack.pricing.overheadPct = 0;
    if (pack.pricing.logisticsFixed === undefined) pack.pricing.logisticsFixed = 0;
    if (pack.pricing.logisticsPerUnit === undefined) pack.pricing.logisticsPerUnit = 0;
    if (pack.pricing.profitMarginPct === undefined) pack.pricing.profitMarginPct = 0;
    pack.steps.forEach((step, idx) => {
      if (!step.id) step.id = makeId('opstep');
      if (step.sopId === undefined) step.sopId = '';
      if (step.machineId === undefined) step.machineId = step.machineRef || '';
      if (!Array.isArray(step.materialRequirements)) step.materialRequirements = [];
      // Each material requirement carries a mode: 'fixed' (qty as-is) or 'per_unit' (qty × pack size)
      step.materialRequirements.forEach(req => {
        if (req.mode !== 'fixed' && req.mode !== 'per_unit') req.mode = 'fixed';
      });
      if (step.estimatedMinutes === undefined) step.estimatedMinutes = 0;
      if (step.minutesPerUnit === undefined) step.minutesPerUnit = 0;
      if (step.extraCostPerUnit === undefined) step.extraCostPerUnit = 0;
      if (step.costImpact === undefined) step.costImpact = 0;
      if (step.requiresQc === undefined) step.requiresQc = step.type === 'qc';
      if (step.qcTemplateId === undefined) step.qcTemplateId = '';
      if (!Array.isArray(step.qcCriteria)) step.qcCriteria = [];
      if (!step.title) step.title = `Step ${idx + 1}`;
    });
  });

  if (!omni.migrationsApplied.includes('operation_pack_steps_v1')) {
    omni.migrationsApplied.push('operation_pack_steps_v1');
    console.log('[OMNI] Migration applied: operation_pack_steps_v1');
  }
  if (!omni.migrationsApplied.includes('operation_pack_activity_log_v1')) {
    omni.migrationsApplied.push('operation_pack_activity_log_v1');
    console.log('[OMNI] Migration applied: operation_pack_activity_log_v1');
  }
  if (!omni.migrationsApplied.includes('operation_pack_step_editor_v1')) {
    omni.migrationsApplied.push('operation_pack_step_editor_v1');
    console.log('[OMNI] Migration applied: operation_pack_step_editor_v1');
  }
}

// T4.5 de-monolith: Machine queue normalization moved to modules/machine-management.js.

function normalizeMaterialReservations() {
  (omni.materials || []).forEach(material => {
    const oldReserved = Number(material.reserved || 0);
    if (material.reservedQty === undefined) material.reservedQty = oldReserved;
    if (!Array.isArray(material.reservations)) material.reservations = [];
    material.reserved = material.reservedQty;
    // ── Inventory V100 (2026-05-24) ── add movement history + photo support, non-destructive
    if (!Array.isArray(material.movements)) material.movements = [];
    if (material.photoUrl === undefined) material.photoUrl = '';
  });

  if (!omni.migrationsApplied.includes('material_reservations_v1')) {
    omni.migrationsApplied.push('material_reservations_v1');
    console.log('[OMNI] Migration applied: material_reservations_v1');
  }
  if (!omni.migrationsApplied.includes('material_movements_v1')) {
    omni.migrationsApplied.push('material_movements_v1');
    console.log('[OMNI] Migration applied: material_movements_v1');
  }
}

// ─── Stock Movement Helpers (V100) ───
// Every change in a material's quantity (intake from a PO receipt, consumption by an op pack
// run, manual adjustment, reservation, release) should be recorded here so the user has a
// proper audit trail. Type semantics:
//   'in'         = stock arriving (PO receipt, manual addition)
//   'out'        = stock consumed/leaving (op pack run, manual reduction)
//   'reserved'   = qty locked but not yet consumed (op pack execute reserves materials)
//   'released'   = previously-reserved qty freed back to available
//   'adjustment' = manual correction (over/under-count fix)
function recordStockMovement(materialId, type, qty, opts = {}) {
  const material = getMaterialById(materialId);
  if (!material) return null;
  if (!Array.isArray(material.movements)) material.movements = [];
  const amount = Number(qty) || 0;
  if (amount === 0 && type !== 'adjustment') return null;
  const movement = {
    id: makeId('mov'),
    type,                                       // 'in' | 'out' | 'reserved' | 'released' | 'adjustment'
    qty: Math.abs(amount),
    sourceType: opts.sourceType || 'manual',    // 'op_pack' | 'po' | 'manual' | 'workflow' | 'system'
    sourceId: opts.sourceId || '',
    ref: opts.ref || '',                        // human-readable reference (e.g. order #, client name)
    note: opts.note || '',
    actor: opts.actor || 'system',
    date: new Date().toISOString(),
    // Snapshot stock state at the moment of the movement so historical reads are accurate
    stockAfter: Number(material.stock) || 0,
    reservedAfter: Number(material.reservedQty) || 0
  };
  material.movements.push(movement);
  // Keep movement history bounded — last 500 entries per material to prevent unbounded growth.
  if (material.movements.length > 500) {
    material.movements = material.movements.slice(-500);
  }
  const netStock = (Number(material.stock) || 0) - (Number(material.reservedQty) || 0);
  if (netStock < (Number(material.minimum || material.minQty) || 0)) {
    triggerOmniEvent('MATERIAL_LOW_STOCK', { material, stock: netStock });
  }
  return movement;
}

// ─── Entity Lookup Helpers ───
function getOrderById(id) { return (omni.orders || []).find(o => o.id === id) || null; }
function getSopById(id) { return (omni.sops || []).find(s => s.id === id) || null; }
// T4.5 de-monolith: Machine entity lookup moved to modules/machine-management.js.

function getMaterialById(id) { return (omni.materials || []).find(m => m.id === id) || null; }
function getWorkflowNodeById(id) { return (omni.workflow.nodes || []).find(n => n.id === id) || null; }

function isWorkflowReadOnly() {
  ensureOmni();
  return omni.workflow && omni.workflow.status === 'published';
}
function getOperationPackById(id) { return (omni.opPacks || []).find(p => p.id === id) || null; }
function getQcRecordById(id) { return (omni.qcRecords || []).find(q => q.id === id) || null; }
function getWorkflowNodes() { ensureOmni(); return omni.workflow.nodes || []; }
function getWorkflowEdges() { ensureOmni(); return omni.workflow.edges || []; }

// T4.5 de-monolith: Machine operation helpers moved to modules/machine-management.js.

function getMaterialReservedQty(material) {
  if (!material) return 0;
  return Number(material.reservedQty ?? material.reserved ?? 0) || 0;
}

function getMaterialAvailableQty(material) {
  if (!material) return 0;
  return (Number(material.stock) || 0) - getMaterialReservedQty(material);
}

function getMaterialStockLevel(material) {
  const stockQty = Number(material?.stock) || 0;
  const reservedQty = getMaterialReservedQty(material);
  const availableQty = getMaterialAvailableQty(material);
  const targetQty = Number(material?.targetQty ?? material?.maxQty ?? 0) || 0;
  const minQty = Number(material?.minQty ?? material?.criticalQty ?? material?.minimum ?? 0) || 0;
  let baseline = targetQty;
  let unknown = false;
  if (!baseline && minQty > 0) baseline = Math.max(minQty * 2, availableQty, stockQty, 1);
  if (!baseline) {
    baseline = Math.max(availableQty, stockQty, 1);
    unknown = true;
  }
  const percent = unknown ? null : Math.max(0, Math.min(100, Math.round((availableQty / baseline) * 100)));
  const effectivePercent = percent === null ? null : percent;
  let status = 'unknown';
  let label = 'غير محدد';
  if (effectivePercent !== null) {
    if (effectivePercent >= 70) { status = 'good'; label = 'جيد'; }
    else if (effectivePercent >= 40) { status = 'medium'; label = 'متوسط'; }
    else if (effectivePercent >= 20) { status = 'low'; label = 'منخفض'; }
    else { status = 'critical'; label = 'حرج'; }
  }
  return { percent: effectivePercent, status, label, availableQty, reservedQty, stockQty, baseline };
}

function renderMaterialBattery(material, options = {}) {
  const level = getMaterialStockLevel(material);
  const text = options.compact ? (level.percent === null ? '؟' : `${level.percent}%`) : `${level.percent === null ? '؟' : `${level.percent}%`} · ${level.label}`;
  const title = `المخزون: ${level.stockQty} | المحجوز: ${level.reservedQty} | المتاح: ${level.availableQty}`;
  const activeSegments = level.percent === null ? 1 : Math.max(0, Math.ceil(level.percent / 25));
  return `
    <span class="inventory-stock-meter inventory-stock-meter--${level.status}" title="${escapeHtml(title)}">
      <span class="inventory-stock-meter-segments">
        ${[1,2,3,4].map(i => `<span class="inventory-stock-meter-segment ${i <= activeSegments ? 'is-active' : ''}"></span>`).join('')}
      </span>
      <span class="inventory-stock-meter-percent">${escapeHtml(text)}</span>
    </span>
  `;
}

function renderMaterialQtyWithBattery(material) {
  const availableQty = getMaterialAvailableQty(material);
  const unit = material?.unit || '';
  const showBattery = omni?.adminSettings?.inventory?.showBatteryIndicator !== false;
  return `<span class="inventory-qty-with-battery"><b>${availableQty}</b> ${escapeHtml(unit)}${showBattery ? renderMaterialBattery(material, { compact: true }) : ''}</span>`;
}

function getMaterialRequirementQty(req) {
  return Number(req?.qty ?? req?.quantity ?? 1) || 1;
}

function materialAvailabilityStatus(req) {
  const material = getMaterialById(req.materialId);
  if (!material) return 'missing';
  return getMaterialAvailableQty(material) >= getMaterialRequirementQty(req) ? 'available' : 'short';
}

function addWorkflowNodeActivity(nodeId, text) {
  const node = getWorkflowNodeById(nodeId);
  if (!node) return;
  if (!Array.isArray(node.activityLog)) node.activityLog = [];
  node.activityLog.unshift({ date: new Date().toISOString(), text });
}

function updateWorkflowNode(nodeId, patch) {
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return null;
  }
  const node = getWorkflowNodeById(nodeId);
  if (!node) return null;
  Object.assign(node, patch);
  if (patch.estimatedMinutes !== undefined) node.estimatedMinutes = Number(node.estimatedMinutes) || 0;
  if (patch.costImpact !== undefined) node.costImpact = Number(node.costImpact) || 0;
  saveData();
  renderWorkflowStudio();
  return node;
}

async function deleteWorkflowNode(nodeId) {
  ensureOmni();
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const node = getWorkflowNodeById(nodeId);
  if (!node) return;
  const ok = await showOmniModal('حذف خطوة', `<p>سيتم حذف خطوة "${escapeHtml(node.title)}" وكل الروابط المرتبطة بها. هل تريد المتابعة؟</p>`, () => true);
  if (!ok) return;
  pushWorkflowUndoSnapshot('node_delete');
  omni.workflow.nodes = (omni.workflow.nodes || []).filter(n => n.id !== nodeId);
  omni.workflow.edges = (omni.workflow.edges || []).filter(e => (e.from || e.source || e.sourceNodeId) !== nodeId && (e.to || e.target || e.targetNodeId) !== nodeId);
  (omni.workflow.nodes || []).forEach(n => {
    if (n.successPath === nodeId) n.successPath = '';
    if (n.failurePath === nodeId) n.failurePath = '';
  });
  if (omni.workflow.selectedFrom === nodeId) omni.workflow.selectedFrom = null;
  if (omni.workflow.selectedNodeId === nodeId) omni.workflow.selectedNodeId = null;
  closeWorkflowNodeQuickMenu();
  closeWorkflowEdgeToolbar();
  saveData();
  closeInspector();
  renderWorkflowStudio();
}

async function deleteWorkflowEdge(edgeId, options = {}) {
  ensureOmni();
  if (isWorkflowReadOnly()) {
    showToast('العملية منشورة وحالياً للقراءة فقط. يرجى إلغاء النشر للتعديل عليها.', 'warning');
    return;
  }
  const edge = (omni.workflow.edges || []).find(e => e.id === edgeId);
  if (!edge) return;
  if (!options.skipConfirm) {
    const ok = await showOmniModal('حذف رابط', '<p>سيتم حذف هذا الرابط فقط وستبقى الخطوات كما هي. هل تريد المتابعة؟</p>', () => true);
    if (!ok) return;
  }
  pushWorkflowUndoSnapshot('edge_delete');
  omni.workflow.edges = (omni.workflow.edges || []).filter(e => e.id !== edgeId);
  if (omni.workflow.selectedEdgeId === edgeId) omni.workflow.selectedEdgeId = null;
  closeWorkflowEdgeToolbar();
  saveData();
  renderWorkflowStudio();
  if (omni.workflow.selectedNodeId) openWorkflowNodeInspector(omni.workflow.selectedNodeId, 3);
}

function reserveMaterial(materialId, qty, sourceType, sourceId, title = '') {
  const material = getMaterialById(materialId);
  if (!material) return false;
  const amount = Number(qty) || 0;
  if (amount <= 0) return false;
  if (!Array.isArray(material.reservations)) material.reservations = [];
  material.reservations.push({
    id: makeId('res'),
    sourceType,
    sourceId,
    title,
    qty: amount,
    unit: material.unit || '',
    createdAt: new Date().toISOString(),
    status: 'reserved'
  });
  material.reservedQty = getMaterialReservedQty(material) + amount;
  material.reserved = material.reservedQty;
  // Log to movement history (V100)
  recordStockMovement(materialId, 'reserved', amount, { sourceType, sourceId, ref: title, note: `حجز من ${sourceType}` });
  return true;
}

// T4.5 de-monolith: Machine queue entry helper moved to modules/machine-management.js.

function workflowNodeNeedsSop(node) {
  return ['sop', 'operation', 'machine', 'qc', 'approval', 'rework'].includes(node.type);
}

function workflowNodeNeedsMachine(node) {
  return ['machine', 'operation'].includes(node.type);
}

// getDefaultAdminSettings() moved to modules/data-providers.js (GO 16 de-monolith Phase 2)

// Migration: if the flat fields have content but companies[] is empty, promote the flat
// data into a primary company. Runs once per load; idempotent.
function migrateOrgFlatToCompanies() {
  if (!omni || typeof omni !== 'object') omni = {};
  if (!omni.adminSettings || typeof omni.adminSettings !== 'object') omni.adminSettings = {};
  if (!omni.adminSettings.organization || typeof omni.adminSettings.organization !== 'object') {
    omni.adminSettings.organization = {};
  }
  const org = omni.adminSettings.organization;
  if (!org) return;
  if (!Array.isArray(org.companies)) org.companies = [];
  if (!Array.isArray(org.supervisors)) org.supervisors = [];

  // Only migrate if no companies exist yet AND there's some legacy flat data worth preserving.
  if (org.companies.length === 0 && (org.name || org.phone || org.address)) {
    const primaryCompany = {
      id: makeId('co'),
      name: org.name || 'الفرع الرئيسي',
      phone: org.phone || '',
      address: org.address || '',
      logoEmoji: org.logoEmoji || '🏭',
      founded: org.founded || '',
      isPrimary: true,
      departments: []
    };
    // If we have a legacy owner with phone, promote to supervisors pool too.
    if (org.owner) {
      org.supervisors.push({
        id: makeId('sup'),
        name: org.owner,
        phone: org.phone || '',
        role: 'صاحب الورشة',
        email: ''
      });
    }
    org.companies.push(primaryCompany);
    console.log('[OMNI] Migrated legacy flat organization fields into companies[0]');
  }

  // Ensure at least one company exists so the UI has something to render. If still empty
  // (fresh install with no legacy data), create an empty primary company.
  if (org.companies.length === 0) {
    org.companies.push({
      id: makeId('co'),
      name: '',
      phone: '',
      address: '',
      logoEmoji: '🏭',
      founded: '',
      isPrimary: true,
      departments: []
    });
  }

  // Normalize structure inside each company so missing keys don't break the UI.
  org.companies.forEach(co => {
    if (!co.id) co.id = makeId('co');
    if (!Array.isArray(co.departments)) co.departments = [];
    co.departments.forEach(dept => {
      if (!dept.id) dept.id = makeId('dept');
      if (!Array.isArray(dept.shifts)) dept.shifts = [];
      dept.shifts.forEach(shift => {
        if (!shift.id) shift.id = makeId('shift');
        if (!Array.isArray(shift.days)) shift.days = [];
      });
    });
  });
  const primary = org.companies.find(co => co.isPrimary) || org.companies[0] || null;
  if (!org.activeCompanyId || !org.companies.some(co => co.id === org.activeCompanyId)) {
    org.activeCompanyId = primary?.id || '';
  }
  org.supervisors.forEach(s => { if (!s.id) s.id = makeId('sup'); });
}

// Currencies a workshop might use. Each one carries its display symbol so the rest of the
// app can read `organization.currencySymbol` directly.
const ORG_CURRENCY_OPTIONS = [
  { code: 'IQD', symbol: 'د.ع',  label: 'دينار عراقي (IQD)' },
  { code: 'USD', symbol: '$',    label: 'دولار أمريكي (USD)' },
  { code: 'EUR', symbol: '€',    label: 'يورو (EUR)' },
  { code: 'SAR', symbol: 'ر.س',  label: 'ريال سعودي (SAR)' },
  { code: 'AED', symbol: 'د.إ',  label: 'درهم إماراتي (AED)' },
  { code: 'TRY', symbol: '₺',    label: 'ليرة تركية (TRY)' }
];
function getOrgCurrencySymbol(code) {
  return (ORG_CURRENCY_OPTIONS.find(c => c.code === code) || ORG_CURRENCY_OPTIONS[0]).symbol;
}

function getAdminCurrencySymbol() {
  try { return omni.adminSettings?.organization?.currencySymbol || 'د.ع'; } catch (_) { return 'د.ع'; }
}

function updateGlobalCurrencyUI() {
  const symbol = getAdminCurrencySymbol();
  document.querySelectorAll('.input-unit, .final-currency').forEach(el => {
    el.textContent = symbol;
  });
}


function formatAdminMoney(value) {
  return `${formatNum(value)} ${getAdminCurrencySymbol()}`;
}

function mergeMissingSettings(target, defaults) {
  Object.keys(defaults).forEach(key => {
    const next = defaults[key];
    if (next && typeof next === 'object' && !Array.isArray(next)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      mergeMissingSettings(target[key], next);
    } else if (target[key] === undefined) {
      target[key] = next;
    }
  });
  return target;
}

function normalizeAdminSettings() {
  if (!omni || typeof omni !== 'object') omni = {};
  if (!omni.adminSettings || typeof omni.adminSettings !== 'object') omni.adminSettings = {};
  mergeMissingSettings(omni.adminSettings, getDefaultAdminSettings());
  if (Array.isArray(omni.migrationsApplied) && !omni.migrationsApplied.includes('admin_settings_v1')) {
    omni.migrationsApplied.push('admin_settings_v1');
  }
  // Multi-company migration (non-destructive)
  migrateOrgFlatToCompanies();
  if (!omni.adminSettings.supervisorRouting || typeof omni.adminSettings.supervisorRouting !== 'object') {
    omni.adminSettings.supervisorRouting = {};
  }
  if (Array.isArray(omni.migrationsApplied) && !omni.migrationsApplied.includes('admin_org_multi_company_v1')) {
    omni.migrationsApplied.push('admin_org_multi_company_v1');
  }
  return omni.adminSettings;
}

function getAdminSetting(path, fallback) {
  ensureOmni();
  const parts = String(path || '').split('.').filter(Boolean);
  let cursor = omni.adminSettings;
  for (const part of parts) {
    if (!cursor || cursor[part] === undefined) return fallback;
    cursor = cursor[part];
  }
  return cursor;
}

function setAdminSetting(path, value, options = {}) {
  ensureOmni();
  const parts = String(path || '').split('.').filter(Boolean);
  if (!parts.length) return;
  let cursor = omni.adminSettings;
  parts.slice(0, -1).forEach(part => {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
  saveData();
  if (!options.silent) showToast('تم حفظ إعدادات الأدمن', 'success');
  if (currentPage === 'admin_panel') renderAdminPanel();
  if (currentPage === 'workflow' && path.startsWith('workflow.')) renderWorkflowStudio();
  if (currentPage === 'inventory' && path.startsWith('inventory.')) renderInventoryPage();
  if (path === 'ui.orbStyle') applyOrbStyle(value);
}

// T4.15 de-monolith: Workflow Studio canvas/validation moved to modules/workflow-studio.js.

// ═══════════ OMNI RELATIONSHIP LAYER ═══════════
function getOmniEntity(type, id) {
  if (!id) return null;
  ensureOmni();
  switch (type) {
    case 'order': return null;
    case 'workflow': return omni.workflow;
    case 'workflow_node': return (omni.workflow?.nodes || []).find(n => n.id === id);
    case 'operation_pack': return (omni.opPacks || []).find(p => p.id === id);
    case 'operation_pack_step':
      for (const pack of omni.opPacks || []) {
        const step = pack.steps?.find(s => s.id === id);
        if (step) return step;
      }
      return null;
    case 'kanban_card': return (omni.kanban?.cards || []).find(c => c.id === id);
    case 'task': return (omni.kanban?.cards || []).find(c => c.id === id);
    case 'sop': return getSopById(id);
    case 'machine': return getMachineById(id);
    case 'material': return getMaterialById(id);
    case 'qc_record': return getQcRecordById(id);
    case 'department': return (finance.departments || []).find(d => d.id === id);
    case 'employee': return (finance.parties || []).find(p => p.id === id && p.type === 'employee');
  }
  return null;
}

function getOmniEntityTitle(type, id) {
  const entity = getOmniEntity(type, id);
  if (!entity) return 'Unknown';
  switch (type) {
    case 'workflow_node': return entity.title || 'Unknown Node';
    case 'operation_pack': return entity.name || 'Unknown Pack';
    case 'operation_pack_step': return entity.title || 'Unknown Step';
    case 'kanban_card': case 'task': return entity.title || 'Unknown Card';
    case 'sop': return entity.title || entity.code || 'Unknown SOP';
    case 'machine': return entity.name || 'Unknown Machine';
    case 'material': return entity.name || 'Unknown Material';
    case 'qc_record': return `QC: ${entity.type} - ${entity.result}`;
    case 'department': case 'employee': return entity.name || 'Unknown';
  }
  return 'Unknown';
}

function getOmniBacklinks(type, id) {
  ensureOmni();
  const links = [];
  if (!id) return links;

  if (type === 'sop') {
    (omni.kanban?.cards || []).forEach(c => {
      if ((c.sopIds || []).includes(id)) links.push({ type: 'kanban_card', id: c.id, title: c.title, relation: 'used in card' });
    });
    (omni.opPacks || []).forEach(p => {
      (p.steps || []).forEach(s => {
        if (s.sopId === id || s.sopRef === id) links.push({ type: 'operation_pack', id: p.id, title: p.name, relation: `used in step: ${s.title}` });
      });
    });
    (omni.workflow?.nodes || []).forEach(n => {
      if (n.linkedSopId === id) links.push({ type: 'workflow_node', id: n.id, title: n.title, relation: 'used in workflow node' });
    });
  } else if (type === 'machine') {
    (omni.kanban?.cards || []).forEach(c => {
      if ((c.machineIds || []).includes(id)) links.push({ type: 'kanban_card', id: c.id, title: c.title, relation: 'used in card' });
    });
    (omni.opPacks || []).forEach(p => {
      (p.steps || []).forEach(s => {
        if (s.machineId === id || s.machineRef === id) links.push({ type: 'operation_pack', id: p.id, title: p.name, relation: `used in step: ${s.title}` });
      });
    });
    (omni.workflow?.nodes || []).forEach(n => {
      if (n.linkedMachineId === id) links.push({ type: 'workflow_node', id: n.id, title: n.title, relation: 'used in workflow node' });
    });
  } else if (type === 'material') {
    (omni.kanban?.cards || []).forEach(c => {
      if ((c.materialRequirements || []).some(r => r.materialId === id)) links.push({ type: 'kanban_card', id: c.id, title: c.title, relation: 'required by card' });
    });
    (omni.opPacks || []).forEach(p => {
      (p.steps || []).forEach(s => {
        if ((s.materialRequirements || []).some(r => r.materialId === id)) links.push({ type: 'operation_pack', id: p.id, title: p.name, relation: `required in step: ${s.title}` });
      });
    });
    (omni.workflow?.nodes || []).forEach(n => {
      if ((n.materialRequirements || []).some(r => r.materialId === id)) links.push({ type: 'workflow_node', id: n.id, title: n.title, relation: 'required in workflow node' });
    });
  } else if (type === 'operation_pack') {
    (omni.kanban?.cards || []).forEach(c => {
      if (c.operationPackId === id) links.push({ type: 'kanban_card', id: c.id, title: c.title, relation: 'generated card' });
    });
  } else if (type === 'qc_record') {
    (omni.kanban?.cards || []).forEach(c => {
      if ((c.qcRecordIds || []).includes(id)) links.push({ type: 'kanban_card', id: c.id, title: c.title, relation: 'checked card' });
      if (c.id === getOmniEntity('qc_record', id)?.reworkCardId) links.push({ type: 'kanban_card', id: c.id, title: c.title, relation: 'rework card' });
    });
  }
  return links;
}

function renderEntityRelationsPanel(type, id) {
  const links = getOmniBacklinks(type, id);
  if (!links.length) return '<p class="muted">لا توجد روابط عكسية مع كيانات أخرى.</p>';
  return `
    <div style="display:flex;flex-direction:column;gap:8px;">
      ${links.map(l => `
        <div style="display:flex;justify-content:space-between;align-items:center;background:var(--bg-light, #fafafa);padding:8px;border:1px solid #ddd;border-radius:4px;">
          <div>
            <b>${escapeHtml(l.title)}</b><br>
            <small style="color:#666;">نوع: ${l.type} · علاقة: ${l.relation}</small>
          </div>
          <button class="btn-secondary" style="font-size:11px;" onclick="openOmniEntity('${l.type}', '${l.id}')">فتح</button>
        </div>
      `).join('')}
    </div>
  `;
}

function openOmniEntity(type, id) {
  if (['machine', 'material', 'oppack'].includes(type)) {
    openInspector(type, id);
  } else if (type === 'kanban_card' || type === 'task') {
    switchPage('kanban');
    setTimeout(() => openKanbanInspector(id), 50);
  } else if (type === 'workflow_node') {
    switchPage('workflow');
    setTimeout(() => openWorkflowInspector(id), 50);
  } else if (type === 'sop') {
    switchPage('sop');
    setTimeout(() => openSopInspector(id), 50);
  } else if (type === 'operation_pack') {
    switchPage('op_packs');
    setTimeout(() => openInspector('oppack', id), 50);
  } else if (type === 'qc_record') {
    switchPage('qc_center');
  }
}

function validateOmniIntegrity() {
  ensureOmni();
  const report = {
    brokenLinks: [], duplicateLinks: [], missingSops: [], missingMachines: [], missingMaterials: [],
    materialShortages: [], overReservedMaterials: [], machineQueueIssues: [], qcIssues: [], workflowIssues: [],
    operationPackIssues: [], warnings: []
  };

  (omni.kanban?.cards || []).forEach(c => {
    (c.sopIds || []).forEach(sid => { if (!getSopById(sid)) report.missingSops.push({ type: 'kanban_card', id: c.id, text: `Card '${c.title}' references missing SOP: ${sid}` }); });
    (c.machineIds || []).forEach(mid => { if (!getMachineById(mid)) report.missingMachines.push({ type: 'kanban_card', id: c.id, text: `Card '${c.title}' references missing Machine: ${mid}` }); });
    (c.materialRequirements || []).forEach(r => { if (!getMaterialById(r.materialId)) report.missingMaterials.push({ type: 'kanban_card', id: c.id, text: `Card '${c.title}' references missing Material: ${r.materialId}` }); });
  });

  (omni.opPacks || []).forEach(p => {
    (p.steps || []).forEach(s => {
      if (s.sopId && !getSopById(s.sopId)) report.missingSops.push({ type: 'operation_pack', id: p.id, text: `Pack '${p.name}' step '${s.title}' references missing SOP: ${s.sopId}` });
      if (s.machineId && !getMachineById(s.machineId)) report.missingMachines.push({ type: 'operation_pack', id: p.id, text: `Pack '${p.name}' step '${s.title}' references missing Machine: ${s.machineId}` });
      (s.materialRequirements || []).forEach(r => { if (!getMaterialById(r.materialId)) report.missingMaterials.push({ type: 'operation_pack', id: p.id, text: `Pack '${p.name}' step '${s.title}' references missing Material: ${r.materialId}` }); });
    });
  });

  (omni.workflow?.nodes || []).forEach(n => {
    if (n.linkedSopId && !getSopById(n.linkedSopId)) report.missingSops.push({ type: 'workflow_node', id: n.id, text: `Workflow Node '${n.title}' references missing SOP: ${n.linkedSopId}` });
    if (n.linkedMachineId && !getMachineById(n.linkedMachineId)) report.missingMachines.push({ type: 'workflow_node', id: n.id, text: `Workflow Node '${n.title}' references missing Machine: ${n.linkedMachineId}` });
    (n.materialRequirements || []).forEach(r => { if (!getMaterialById(r.materialId)) report.missingMaterials.push({ type: 'workflow_node', id: n.id, text: `Workflow Node '${n.title}' references missing Material: ${r.materialId}` }); });
  });

  (omni.materials || []).forEach(m => {
    const avail = getMaterialAvailableQty(m);
    if (avail < 0) report.overReservedMaterials.push({ type: 'material', id: m.id, text: `Material '${m.name}' is over-reserved (Available: ${avail})` });
    if (avail <= m.minimum) report.materialShortages.push({ type: 'material', id: m.id, text: `Material '${m.name}' is below minimum stock (${avail} <= ${m.minimum})` });
  });

  return report;
}

function getOmniHealthReport() {
  const report = validateOmniIntegrity();
  const totalEntities = (omni.kanban?.cards?.length || 0) + (omni.opPacks?.length || 0) + (omni.sops?.length || 0) + (omni.machines?.length || 0) + (omni.materials?.length || 0);
  return { ...report, totalEntities };
}

// ─── Card Readiness Calculator ───
function calculateCardReadiness(card) {
  let score = 0, total = 0;
  // SOP linked?
  total++; if ((card.sopIds || []).length > 0) score++;
  // Machine assigned?
  total++; if ((card.machineIds || []).length > 0) score++;
  // Material available?
  total++;
  const matAvail = calculateMaterialAvailability(card);
  if (matAvail === 'ready') score++;
  // Design/approval done?
  total++;
  if (card.status === 'approved' || (card.tags || []).some(t => t.includes('approved') || t.includes('معتمد'))) score++;
  return { score, total, percent: total > 0 ? Math.round((score / total) * 100) : 0 };
}

// ─── Material Availability Check ───
function calculateMaterialAvailability(card) {
  const reqs = card.materialRequirements || [];
  if (!reqs.length) return 'none';
  const allAvail = reqs.every(req => {
    const mat = getMaterialById(req.materialId);
    if (!mat) return false;
    return getMaterialAvailableQty(mat) >= getMaterialRequirementQty(req);
  });
  return allAvail ? 'ready' : 'missing';
}

// ─── Due Risk Calculator ───
function calculateDueRisk(card) {
  if (!card.dueDate) return 'none';
  const today = todayISO();
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);
  if (card.dueDate < today) return 'overdue';
  if (card.dueDate === today) return 'due_today';
  if (card.dueDate === tomorrowISO) return 'due_tomorrow';
  return 'safe';
}

// ─── Card Status Indicators ───
function getCardIndicators(card) {
  const indicators = [];
  if ((card.sopIds || []).length > 0) indicators.push({ icon: 'fa-book', label: 'SOP', color: '#818cf8' });
  if ((card.machineIds || []).length > 0) indicators.push({ icon: 'fa-gear', label: 'Machine', color: '#22d3ee' });
  if ((card.materialRequirements || []).length > 0) {
    const matStatus = calculateMaterialAvailability(card);
    if (matStatus === 'missing') indicators.push({ icon: 'fa-cube', label: 'Material Missing', color: '#f87171' });
    else if (matStatus === 'ready') indicators.push({ icon: 'fa-cube', label: 'Material', color: '#34d399' });
  }
  if ((card.qcRecordIds || []).length > 0) indicators.push({ icon: 'fa-microscope', label: 'QC', color: '#fbbf24' });
  if ((card.costEntries || []).length > 0) indicators.push({ icon: 'fa-coins', label: 'Cost', color: '#fb923c' });
  // Blocked detection
  if ((card.tags || []).some(t => t.toLowerCase().includes('blocked') || t.includes('متوقف'))) {
    indicators.push({ icon: 'fa-ban', label: 'Blocked', color: '#f87171' });
  }
  // Due risk
  const dueRisk = calculateDueRisk(card);
  if (dueRisk === 'overdue') indicators.push({ icon: 'fa-triangle-exclamation', label: 'Overdue', color: '#f87171' });
  else if (dueRisk === 'due_today') indicators.push({ icon: 'fa-clock', label: 'Today', color: '#fbbf24' });
  return indicators;
}

function omniRefreshAll() {
  renderKanbanBoard();
  renderWorkflowStudio();
  renderTaskManager();
  renderSopHub();
}

function addFinanceCategory(kind) {
  ensureFinance();
  const inputId = kind === 'income' ? 'newIncomeCategory' : 'newExpenseCategory';
  const name = document.getElementById(inputId)?.value.trim();
  if (!name) return showToast('اكتب اسم البند أولاً', 'warning');
  finance.categories[kind].push({
    id: makeId(kind === 'income' ? 'inc_cat' : 'exp_cat'),
    name,
    accountId: kind === 'income' ? 'income_sales' : 'expense_general'
  });
  document.getElementById(inputId).value = '';
  saveData();
  financeRefreshAll();
  showToast('تمت إضافة البند وربطه بالتقارير', 'success');
}

function addFinancePerson() {
  ensureFinance();
  const name = document.getElementById('newFinancePerson')?.value.trim();
  if (!name) return showToast('اكتب اسم الشخص أولاً', 'warning');
  if (!finance.parties.some(p => p.type === 'person' && p.name === name)) {
    finance.parties.push({ id: makeId('person'), type: 'person', name });
  }
  document.getElementById('newFinancePerson').value = '';
  saveData();
  financeRefreshAll();
  showToast('تمت إضافة الشخص لقائمة الدافعين', 'success');
}

function addFinanceDepartment() {
  ensureFinance();
  const name = document.getElementById('newFinanceDepartment')?.value.trim();
  if (!name) return showToast('اكتب اسم القسم أولاً', 'warning');
  if (!finance.departments.some(d => d.name === name)) {
    finance.departments.push({ id: makeId('dept'), name });
  }
  document.getElementById('newFinanceDepartment').value = '';
  saveData();
  financeRefreshAll();
  showToast('تمت إضافة القسم وربطه بالنماذج', 'success');
}

function addExpenseFromForm() {
  ensureFinance();
  const amount = asMoney(document.getElementById('expenseAmount')?.value);
  if (amount <= 0) return showToast('أدخل مبلغ مصروف صحيح', 'error');
  const sourceType = document.getElementById('expenseSource')?.value || 'cashbox';
  const paidByName = sourceType === 'person_pocket' ? (document.getElementById('expensePerson')?.value || '') : '';
  if (sourceType === 'person_pocket' && !paidByName) return showToast('اختر الشخص الذي دفع من جيبه', 'warning');
  const categoryId = document.getElementById('expenseCategory')?.value || 'cat_general';
  addFinanceTransaction({
    type: 'expense',
    direction: 'out',
    sourceType,
    date: document.getElementById('expenseDate')?.value || todayISO(),
    amount,
    categoryId,
    departmentId: document.getElementById('expenseDepartment')?.value || 'dept_workshop',
    accountId: (finance.categories.expense.find(c => c.id === categoryId) || {}).accountId || 'expense_general',
    description: document.getElementById('expenseDescription')?.value.trim() || getCategoryName('expense', categoryId),
    paidByName
  });
  ['expenseAmount', 'expenseDescription'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  financeRefreshAll();
  showToast('تم تسجيل المصروف وربطه بالداشبورد والقاصة', 'success');
}

function addIncomeFromForm() {
  ensureFinance();
  const amount = asMoney(document.getElementById('incomeAmount')?.value);
  if (amount <= 0) return showToast('أدخل مبلغ وارد صحيح', 'error');
  const customerId = document.getElementById('incomeCustomer')?.value || '';
  const customer = finance.customers.find(c => c.id === customerId);
  const categoryId = document.getElementById('incomeCategory')?.value || 'cat_sales';
  addFinanceTransaction({
    type: 'income',
    direction: 'in',
    sourceType: 'cashbox',
    date: document.getElementById('incomeDate')?.value || todayISO(),
    amount,
    categoryId,
    departmentId: document.getElementById('incomeDepartment')?.value || 'dept_sales',
    accountId: (finance.categories.income.find(c => c.id === categoryId) || {}).accountId || 'income_sales',
    description: document.getElementById('incomeDescription')?.value.trim() || getCategoryName('income', categoryId),
    customerId,
    partyName: customer ? customer.name : ''
  });
  ['incomeAmount', 'incomeDescription'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  financeRefreshAll();
  showToast('تم تسجيل الوارد وإضافته للقاصة', 'success');
}

function addCustomerFromForm() {
  ensureFinance();
  const name = document.getElementById('customerName')?.value.trim();
  if (!name) return showToast('اكتب اسم العميل', 'warning');
  finance.customers.push({
    id: makeId('cust'),
    name,
    companyName: document.getElementById('customerCompany')?.value.trim() || '',
    shopName: document.getElementById('customerShop')?.value.trim() || '',
    phone: document.getElementById('customerPhone')?.value.trim() || '',
    openingBalance: asMoney(document.getElementById('customerOpening')?.value),
    balanceDirection: '',
    notes: document.getElementById('customerNotes')?.value.trim() || ''
  });
  ['customerName', 'customerCompany', 'customerShop', 'customerPhone', 'customerOpening', 'customerNotes'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  saveData();
  financeRefreshAll();
  showToast('تمت إضافة العميل ورصيده', 'success');
}

function addCustomerCharge() {
  ensureFinance();
  const customerId = document.getElementById('customerChargeSelect')?.value;
  const customer = finance.customers.find(c => c.id === customerId);
  const amount = asMoney(document.getElementById('customerChargeAmount')?.value);
  if (!customer || amount <= 0) return showToast('اختر العميل وأدخل مبلغ صحيح', 'warning');
  addFinanceTransaction({
    type: 'customer_charge',
    direction: 'neutral',
    sourceType: 'ledger',
    date: document.getElementById('customerChargeDate')?.value || todayISO(),
    amount,
    customerId,
    departmentId: document.getElementById('customerChargeDepartment')?.value || 'dept_projects',
    partyName: customer.name,
    accountId: 'receivables_customers',
    description: document.getElementById('customerChargeDescription')?.value.trim() || 'مطالبة على عميل'
  });
  ['customerChargeAmount', 'customerChargeDescription'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  financeRefreshAll();
  showToast('تمت إضافة مطالبة على رصيد العميل', 'success');
}


let receiptLineItems = [];

function getReceiptLineItemsTotal() {
  return receiptLineItems.reduce((sum, item) => sum + asMoney(item.total), 0);
}

function renderReceiptLineItems() {
  const wrap = document.getElementById('receiptItemsTable');
  if (!wrap) return;
  wrap.innerHTML = receiptLineItems.length ? `
    <table class="data-table finance-table">
      <thead><tr><th>البند / السلعة</th><th>الوصف</th><th>العدد</th><th>الوحدة</th><th>سعر الوحدة</th><th>اللون / التفاصيل</th><th>الإجمالي</th><th>حذف</th></tr></thead>
      <tbody>${receiptLineItems.map(item => `<tr><td>${escapeHtml(item.itemName)}</td><td>${escapeHtml(item.description || '-')}</td><td>${item.qty}</td><td>${escapeHtml(item.unit || '-')}</td><td>${formatNum(item.unitPrice)}</td><td>${escapeHtml(item.details || item.color || '-')}</td><td>${formatNum(item.total)}</td><td><button class="btn-xs btn-danger" onclick="removeReceiptLineItem('${item.id}')">حذف</button></td></tr>`).join('')}</tbody>
    </table>
  ` : '<div class="empty-cell">لا توجد بنود مضافة بعد</div>';
}

function addReceiptLineItem() {
  const itemName = document.getElementById('receiptItemName')?.value?.trim();
  if (!itemName) return showToast('اكتب اسم البند أولاً', 'warning');
  const qty = parseFloat(document.getElementById('receiptItemQty')?.value) || 1;
  const unitPrice = asMoney(document.getElementById('receiptItemPrice')?.value);
  const item = {
    id: makeId('ritem'),
    itemName,
    description: document.getElementById('receiptItemDesc')?.value?.trim() || '',
    qty,
    unit: document.getElementById('receiptItemUnit')?.value?.trim() || '',
    unitPrice,
    color: '',
    details: document.getElementById('receiptItemDetails')?.value?.trim() || '',
    total: qty * unitPrice
  };
  receiptLineItems.push(item);
  ['receiptItemName','receiptItemDesc','receiptItemQty','receiptItemUnit','receiptItemPrice','receiptItemDetails'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  renderReceiptLineItems();
  updateReceiptPreview();
}

function removeReceiptLineItem(itemId) {
  receiptLineItems = receiptLineItems.filter(item => item.id !== itemId);
  renderReceiptLineItems();
  updateReceiptPreview();
}

function updateReceiptPreview() {
  const preview = document.getElementById('receiptPreview');
  if (!preview) return;
  const kind = document.getElementById('receiptKind')?.value || 'income';
  const no = document.getElementById('receiptNo')?.value || '';
  const date = document.getElementById('receiptDate')?.value || todayISO();
  const itemsTotal = getReceiptLineItemsTotal();
  const amount = itemsTotal > 0 ? itemsTotal : asMoney(document.getElementById('receiptAmount')?.value);

  const paidInput = document.getElementById('receiptPaidAmount');
  if (paidInput) {
    const parentFormGroup = paidInput.closest('.form-group');
    if (parentFormGroup) {
      parentFormGroup.style.display = kind === 'sales' ? 'block' : 'none';
    }
  }

  const paidAmount = kind === 'sales' ? asMoney(document.getElementById('receiptPaidAmount')?.value || amount) : amount;
  const remainingAmount = kind === 'sales' ? Math.max(0, amount - paidAmount) : 0;
  const customerId = document.getElementById('receiptCustomer')?.value || '';
  const customer = finance.customers?.find(c => c.id === customerId);
  const party = document.getElementById('receiptParty')?.value || customer?.name || '';
  const department = getDepartmentName(document.getElementById('receiptDepartment')?.value || '');
  const desc = document.getElementById('receiptDescription')?.value || '';
  const profile = getActiveOrgProfile();
  const currency = profile.currencySymbol || profile.currency || getAdminCurrencySymbol();
  if (itemsTotal > 0) {
    const amountInput = document.getElementById('receiptAmount');
    if (amountInput) amountInput.value = Math.round(itemsTotal);
  }
  renderReceiptLineItems();

  const paidRow = kind === 'sales' ? `<div class="receipt-line"><b>المدفوع:</b> ${formatNum(paidAmount)} ${escapeHtml(currency)}</div>` : '';
  const remainingRow = kind === 'sales' ? `<div class="receipt-line"><b>المتبقي:</b> ${formatNum(remainingAmount)} ${escapeHtml(currency)}</div>` : '';

  preview.innerHTML = `
    <div class="receipt-paper-head"><h2>${kind === 'sales' ? 'وصل مبيعات' : kind === 'expense' ? 'وصل صرف' : 'وصل قبض'}</h2><span>${escapeHtml(no)}</span></div>
    <div class="receipt-line"><b>${escapeHtml(profile.logoEmoji)} الشركة:</b> ${escapeHtml(profile.companyName)}${profile.phone ? ` · ${escapeHtml(profile.phone)}` : ''}</div>
    ${profile.address ? `<div class="receipt-line"><b>العنوان:</b> ${escapeHtml(profile.address)}</div>` : ''}
    <div class="receipt-line"><b>التاريخ:</b> ${escapeHtml(date)}</div>
    <div class="receipt-line"><b>الطرف / المستلم / الدافع:</b> ${escapeHtml(party || '...')}</div>
    <div class="receipt-line"><b>القسم:</b> ${escapeHtml(department)}</div>
    <div class="receipt-line"><b>المبلغ الإجمالي:</b> ${formatNum(amount)} ${escapeHtml(currency)}</div>
    ${paidRow}
    ${remainingRow}
    ${receiptLineItems.length ? `<table class="receipt-items-print"><thead><tr><th>البند</th><th>الوصف</th><th>العدد</th><th>الوحدة</th><th>السعر</th><th>التفاصيل</th><th>الإجمالي</th></tr></thead><tbody>${receiptLineItems.map(item => `<tr><td>${escapeHtml(item.itemName)}</td><td>${escapeHtml(item.description || '-')}</td><td>${item.qty}</td><td>${escapeHtml(item.unit || '-')}</td><td>${formatNum(item.unitPrice)} ${escapeHtml(currency)}</td><td>${escapeHtml(item.details || '-')}</td><td>${formatNum(item.total)} ${escapeHtml(currency)}</td></tr>`).join('')}</tbody></table>` : ''}
    <div class="receipt-line"><b>التفاصيل:</b> ${escapeHtml(desc || '...')}</div>
    <div class="receipt-signatures"><span>توقيع المحاسب</span><span>توقيع المستلم</span></div>
  `;
}

function saveReceiptFromForm() {
  ensureFinance();
  const profile = getActiveOrgProfile();
  const itemsTotal = getReceiptLineItemsTotal();
  const amount = itemsTotal > 0 ? itemsTotal : asMoney(document.getElementById('receiptAmount')?.value);
  if (amount <= 0) return showToast('أدخل مبلغ الوصل', 'warning');
  const kind = document.getElementById('receiptKind')?.value || 'income';
  const paidAmount = kind === 'sales' ? asMoney(document.getElementById('receiptPaidAmount')?.value || amount) : amount;
  const remainingAmount = kind === 'sales' ? Math.max(0, amount - paidAmount) : 0;
  const paymentMethod = document.getElementById('receiptPaymentMethod')?.value || 'cash';
  const receiptNo = document.getElementById('receiptNo')?.value || `REC-${Date.now()}`;
  const receiptId = `receipt_${receiptNo}`;
  if (finance.receipts.some(r => r.id === receiptId || r.receiptNo === receiptNo)) {
    showToast('هذا الوصل محفوظ مسبقاً، لم يتم تكرار الترحيل المالي', 'warning');
    return;
  }
  const customerId = document.getElementById('receiptCustomer')?.value || '';
  const customer = finance.customers.find(c => c.id === customerId);
  const categoryId = document.getElementById('receiptCategory')?.value || (kind === 'expense' ? 'cat_general' : 'cat_sales');
  const departmentId = document.getElementById('receiptDepartment')?.value || (kind === 'expense' ? 'dept_workshop' : 'dept_sales');
  const description = document.getElementById('receiptDescription')?.value.trim() || (kind === 'sales' ? 'وصل مبيعات' : kind === 'expense' ? 'وصل صرف' : 'وصل قبض');
  const partyName = document.getElementById('receiptParty')?.value.trim() || customer?.name || '';
  const date = document.getElementById('receiptDate')?.value || todayISO();
  const sourceType = paymentMethod === 'cash' ? 'cashbox' : 'ledger';
  addFinanceTransaction({ type: kind === 'sales' ? 'sales_receipt' : kind, direction: kind === 'expense' ? 'out' : 'in', sourceType, sourceId: receiptId, date, amount: kind === 'sales' ? paidAmount : amount, categoryId, departmentId, description, partyName, customerId, receiptNo, paymentMethod }, { skipSave: true });
  if (kind === 'sales' && remainingAmount > 0) {
    addFinanceTransaction({ type: 'customer_charge', direction: 'neutral', sourceType: 'ledger', sourceId: `${receiptId}_remaining`, date, amount: remainingAmount, customerId, departmentId, partyName, description: `متبقي وصل مبيعات ${receiptNo}`, receiptNo, paymentMethod }, { skipSave: true });
  }
  finance.receipts.push({ id: receiptId, receiptNo, kind, date, amount, paidAmount, remainingAmount, paymentMethod, customerId, partyName, description, items: receiptLineItems.map(item => ({ ...item })), department: departmentId, branch: profile.companyName, companyId: profile.companyId, companyName: profile.companyName, currency: profile.currency, currencySymbol: profile.currencySymbol, logoId: profile.logoEmoji, status: remainingAmount > 0 ? 'partial' : 'paid', html: document.getElementById('receiptPreview')?.innerHTML || '', createdAt: new Date().toISOString() });
  receiptLineItems = [];
  renderReceiptLineItems();
  saveData();
  // Sprint E: double-entry sales JE
  if (window.FinanceService?.generateSalesEntry && (kind === 'sales' || kind === 'income')) {
    FinanceService.generateSalesEntry({
      receiptId:    receiptId,
      customerName: partyName || '',
      amount:       kind === 'sales' ? paidAmount : amount,
      origin:       `receipt/${receiptId}`,
    }).catch(e => console.warn('Sales JE failed:', e));
  }
  financeRefreshAll();
  showToast('تم حفظ الوصل وترحيله بدون تكرار', 'success');
}

function printFinanceReceipt() {
  const html = document.getElementById('receiptPreview')?.innerHTML;
  if (!html) return;
  const w = window.open('', '_blank', 'width=850,height=800');
  w.document.open();
  w.document.write(`
    <html dir="rtl"><head><meta charset="utf-8"><title>وصل</title>
    <style>
      body{font-family:Tahoma,Arial,sans-serif;padding:40px;color:#111}
      .receipt-print{max-width:720px;margin:auto;border:1px solid #ddd;padding:32px;border-radius:12px}
      .receipt-paper-head{display:flex;justify-content:space-between;border-bottom:2px solid #111;margin-bottom:24px;padding-bottom:12px}
      .receipt-line{font-size:18px;margin:14px 0}
      .receipt-signatures{display:flex;justify-content:space-between;margin-top:70px}
    </style></head><body><div class="receipt-print">${html}</div><script>window.print()<\/script></body></html>
  `);
  w.document.close();
}

async function addEmployee() {
  const name = await showOmniPrompt('أدخل اسم الموظف:', '');
  if (!name || !name.trim()) return;

  const cfg = getConfig();
  const totalDays = getDaysInMonth(cfg.year, cfg.month);
  const records = [];

  for (let d = 1; d <= totalDays; d++) {
    records.push({
      day: d,
      month: cfg.month,
      year: cfg.year,
      date: `${String(d).padStart(2, '0')}/${String(cfg.month).padStart(2, '0')}/${cfg.year}`,
      checkIn: '', checkOut: '',
      checkInMin: null, checkOutMin: null,
      hours: 0,
      status: isFriday(cfg.year, cfg.month, d) ? 'friday' : 'leave',
      advance: 0, penalty: 0, bonus: 0, damage: 0, notes: ''
    });
  }

  const data = { name: name.trim(), salary: cfg.nominalSalary, records, is_active: true };

  try {
    if (window.RecordService) {
      const newEmp = await RecordService.create('employees', data);
      employees.push(newEmp);
    } else {
      employees.push({ ...data, id: makeId('EMP') });
      saveData();
    }

    selectedEmpIdx = employees.length - 1;
    renderTimesheet();
    renderReportTabs();
    refreshCalcEmpDropdown();
    showToast(`تم إضافة الموظف: ${name.trim()}`, 'success');
  } catch (e) {
    console.error(e);
    showToast(e.message || 'فشل إضافة الموظف', 'error');
  }
}

async function deleteEmployee(idx) {
  const emp = employees[idx];
  if (!emp) return;
  if (!confirm(`هل تريد حذف الموظف: ${emp.name}؟`)) return;

  try {
    if (window.RecordService && emp.id) {
      await RecordService.archive('employees', emp.id);
    }

    employees.splice(idx, 1);
    if (selectedEmpIdx >= employees.length) selectedEmpIdx = Math.max(0, employees.length - 1);
    if (reportEmpIdx >= employees.length) reportEmpIdx = Math.max(0, employees.length - 1);

    renderTimesheet();
    renderReportTabs();
    refreshCalcEmpDropdown();
    saveData();
    showToast('تم حذف الموظف', 'info');
  } catch (e) {
    console.error(e);
    showToast(e.message || 'فشل حذف الموظف', 'error');
  }
}

function selectEmployee(idx) {
  selectedEmpIdx = idx;
  renderTimesheet();
}

function selectReportEmployee(idx) {
  reportEmpIdx = idx;
  renderReport();
}

function updateEmpPrevAdvance() {
  const val = parseFloat(document.getElementById('empPrevAdvanceInput').value) || 0;
  employees[selectedEmpIdx].prevAdvance = val;
  saveData();
  renderTimesheet();
}

const STATUS_OPTIONS = [
  { val: 'normal', label: 'دوام عادي', color: '#10b981' },
  { val: 'leave', label: 'إجازة', color: '#f59e0b' },
  { val: 'absent', label: 'غياب', color: '#ef4444' },
  { val: 'friday', label: 'عطلة مدفوعة', color: '#6366f1' },
  { val: 'friday_work', label: 'حافز عمل جمعة', color: '#06b6d4' },
  { val: 'late_excused', label: 'متأخر معذور', color: '#fb923c' },
  { val: 'night_shift', label: 'شفت ليلي', color: '#22d3ee' },
  { val: 'early_excused', label: 'مغادر مبكر معذور', color: '#ec4899' },
  { val: 'hourly_excused', label: 'معفى بالساعات', color: '#a3e635' },
  { val: 'external_mission', label: 'مهمة خارجية', color: '#38bdf8' }
];

function renderMonthButtons(currentMonth) {
  const container = document.getElementById('monthFilterButtons');
  if (!container) return;
  container.innerHTML = '';
  const cfg = getConfig();
  const selectedMonths = getTimesheetSelectedMonths(cfg.year);

  const activeMonths = new Set();
  employees.forEach(emp => {
    if (!emp || !emp.records) return;
    emp.records.forEach(r => {
      const p = getRecordPeriod(r, cfg);
      if (p.year === cfg.year) activeMonths.add(p.month);
    });
  });

  for (let m = 1; m <= 12; m++) {
    const btn = document.createElement('button');
    btn.textContent = MONTHS_AR[m - 1];

    btn.style.padding = '8px 16px';
    btn.style.borderRadius = '8px';
    btn.style.border = 'none';
    btn.style.fontWeight = 'bold';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'all 0.3s ease';

    if (selectedMonths.includes(m)) {
      btn.style.background = 'var(--accent-blue)';
      btn.style.color = '#fff';
      btn.style.boxShadow = '0 0 10px rgba(59, 130, 246, 0.4)';
    } else if (activeMonths.has(m)) {
      btn.style.background = 'rgba(59, 130, 246, 0.2)';
      btn.style.color = 'var(--accent-blue)';
      btn.style.border = '1px solid rgba(59, 130, 246, 0.3)';
    } else {
      btn.style.background = 'rgba(255, 255, 255, 0.05)';
      btn.style.color = 'var(--text-muted)';
      btn.style.border = '1px solid var(--border-glass)';
    }

    btn.title = selectedMonths.includes(m) ? 'اضغط لإزالة هذا الشهر من العرض' : 'اضغط لإضافة هذا الشهر للعرض';
    btn.onclick = () => toggleTimesheetMonth(m);
    container.appendChild(btn);
  }
}

function renderTimesheetManagerMarker(rec) {
  if (!rec?.managerApproved) return '';
  const label = rec.managerApprovalKind === 'attendance_correction' || rec.attendanceCorrected ? 'تصحيح مدير' : 'مدير ✓';
  const title = [rec.managerApprovedBy, rec.managerApprovalNote, rec.managerApprovedAt ? formatOmniDateTime(rec.managerApprovedAt) : ''].filter(Boolean).join(' · ');
  return `<span class="timesheet-manager-marker" title="${escapeHtml(title)}">${escapeHtml(label)}</span>`;
}

function renderTimesheetDocumentedMarker(rec) {
  if (!rec?.timesheetDocumented) return '';
  const title = [
    'موثق من التايم شيت',
    rec.timesheetDocumentedAt ? formatOmniDateTime(rec.timesheetDocumentedAt) : '',
    rec.timesheetDocumentedBy || '',
  ].filter(Boolean).join(' · ');
  return `<span class="timesheet-documented-marker" title="${escapeHtml(title)}"><i class="fa-solid fa-circle-check"></i></span>`;
}

// Debounce handle for the heavy month-wide payroll recompute triggered while typing in the timesheet.
let timesheetAggregateTimer = null;

// Update only the top stat cards from an already-computed monthly result (no DOM rebuild).
function applyTimesheetStatCards(result) {
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('empStatAttendance', result.attendanceDays);
  setText('empStatAbsent', result.absentDays);

  const graceUsed = result.graceMinutesUsed || 0;
  // Grace allowance is PER MONTH — scale the displayed ceiling by the number of displayed months.
  const graceMonths = getTimesheetSelectedMonths().length || 1;
  setText('latenessGraceTotal', `${Math.round(graceUsed)} دقيقة من ${getPayrollSettings().graceMinutesPerMonth * graceMonths} دقيقة`);

  setText('empStatSalary', formatMoneyReadable(result.finalSalary));
  setText('empStatAllowances', formatMoneyReadable(result.allowances));

  const empStatOvertimeEl = document.getElementById('empStatOvertime');
  if (empStatOvertimeEl) {
    empStatOvertimeEl.textContent = formatTimesheetMoneyWithMinutes(result.totalOvertime, result.totalOvertimeValue);
  }
  const empStatPenaltiesEl = document.getElementById('empStatPenalties');
  if (empStatPenaltiesEl) {
    const totalPenaltiesVal = (result.automaticPenalties || 0) + (result.penalty || 0) + (result.damage || 0);
    empStatPenaltiesEl.textContent = formatMoneyReadable(totalPenaltiesVal);
  }
  setText('empStatFridays', formatMoneyReadable(result.fridayCompensation));
}

// ─── Timesheet monthly salary documentation (selected employee ONLY) ───
// One doc per displayed month, computed with the SAME per-month engine the calculator/print
// use (calculateSalaryForEmployee) — with explicit { month, year } and skipSystemRules so a
// pure render never mutates records. NO all-employee loops here (performance requirement).
function getTimesheetMonthlyDocs(emp, cfg = getConfig()) {
  if (!emp) return [];
  const year = Number(cfg.year);
  const nominalSalary = getEmployeeNominalSalary(emp, cfg.nominalSalary);
  return getTimesheetSelectedMonths(year)
    .filter(month => recordsForMonth(emp, year, month).length > 0)
    .map(month => {
      const result = calculateSalaryForEmployee(emp, { ...cfg, year, month, nominalSalary, skipSystemRules: true });
      const penalties = (result.automaticPenalties || 0) + (result.totalPenalty || 0) + (result.totalDamage || 0);
      const monthAdvances = (result.currentAdvance || 0) + (result.officialAdvance || 0);
      const grossDue = result.totalEarnings || 0;
      // صافي الشهر = المستحق الإجمالي − الغرامات − سلف هذا الشهر (الرصيد السابق يُحسب مرة واحدة في خلاصة الفترة)
      const netDue = (result.salaryDue || 0) - monthAdvances;
      return { month, year, label: `${MONTHS_AR[month - 1] || month} ${year}`, result, grossDue, penalties, monthAdvances, netDue, monthEndBonus: result.monthEndBonus || 0 };
    });
}

// Aggregate the per-month OFFICIAL results (same engine payroll closing uses) over the displayed
// months into one result-shaped object. This is the single source of truth for the timesheet
// page: stat cards, docked calculator, posting suggestion and print/slip all read it, so the
// page never shows two different "net" figures again. previousAdvance is applied ONCE.
function getTimesheetOfficialRangeResult(emp, cfg = getConfig(), docsOpt = null) {
  const docs = docsOpt || getTimesheetMonthlyDocs(emp, cfg);
  const agg = {
    totalDays: 0, fridayCount: 0, workingDays: 0,
    attendanceDays: 0, leaveDays: 0, absentDays: 0,
    baseSalary: 0, allowances: 0,
    overtimeHours: 0, overtimeValue: 0, fridayOTHours: 0, fridayOTValue: 0,
    totalOvertime: 0, totalOvertimeValue: 0,
    latenessDeduction: 0, totalLatenessDeduction: 0, totalLatenessHours: 0,
    earlyDeduction: 0, leaveDeduction: 0, absenceDeduction: 0,
    fridayCompensation: 0, fridayWorkedDays: 0, eligibleFridays: 0, autoFridayPenalty: 0,
    currentAdvance: 0, officialAdvance: 0,
    penalty: 0, totalPenalty: 0, damage: 0, totalDamage: 0, bonus: 0, dailyBonus: 0, monthEndBonus: 0, totalBonus: 0,
    automaticPenalties: 0, totalEarnings: 0, salaryDueDeductions: 0, salaryDue: 0,
    graceMinutesUsed: 0, graceByKey: {},
    dailyRate: 0, hourlyRate: 0, allowanceRate: 0,
    // Negate the raw ledger value once here (positive=company owes → internal positive=employee owes),
    // matching calculateSalaryForEmployee's convention so rangeNetBeforeBalance/finalSalary below stay correct.
    previousAdvance: -asMoney(emp?.prevAdvance),
    nominalSalary: getEmployeeNominalSalary(emp, cfg.nominalSalary),
  };
  docs.forEach(doc => {
    const r = doc.result;
    agg.totalDays += r.totalDays || 0;
    agg.fridayCount += r.fridayCount || 0;
    agg.workingDays += r.workingDays || 0;
    agg.attendanceDays += r.attendanceDays || 0;
    agg.leaveDays += r.leaveDays || 0;
    agg.absentDays += r.absentDays || 0;
    agg.baseSalary += r.baseSalary || 0;
    agg.allowances += r.allowances || 0;
    agg.overtimeHours += r.overtimeHours || 0;
    agg.overtimeValue += r.overtimeValue || 0;
    agg.fridayOTHours += r.fridayOTHours || 0;
    agg.fridayOTValue += r.fridayOTValue || 0;
    agg.latenessDeduction += r.latenessDeduction || 0;
    agg.totalLatenessHours += r.totalLatenessHours || 0;
    agg.earlyDeduction += r.earlyDeduction || 0;
    agg.absenceDeduction += r.absenceDeduction || 0;
    agg.fridayCompensation += r.fridayCompensation || 0;
    agg.fridayWorkedDays += r.fridayWorkedDays || 0;
    agg.eligibleFridays += r.eligibleFridays || 0;
    agg.currentAdvance += r.currentAdvance || 0;
    agg.officialAdvance += r.officialAdvance || 0;
    agg.penalty += r.totalPenalty || 0;
    agg.damage += r.totalDamage || 0;
    agg.bonus += r.totalBonus || 0;
    agg.dailyBonus += r.dailyBonus || 0;
    agg.monthEndBonus += r.monthEndBonus || 0;
    agg.automaticPenalties += r.automaticPenalties || 0;
    agg.totalEarnings += r.totalEarnings || 0;
    agg.salaryDueDeductions += r.salaryDueDeductions || 0;
    agg.salaryDue += r.salaryDue || 0;
    agg.graceMinutesUsed += r.graceMinutesUsed || 0;
    agg.dailyRate = r.dailyRate || agg.dailyRate;
    agg.hourlyRate = r.hourlyRate || agg.hourlyRate;
    agg.allowanceRate = (r.transportRate || 0) + (r.foodRate || 0) || agg.allowanceRate;
    // Monthly grace allocation → row markers (`⏱`), keyed year-month-day like the table rows.
    Object.entries(r.graceByDay || {}).forEach(([day, minutes]) => {
      agg.graceByKey[`${doc.year}-${doc.month}-${day}`] = minutes;
    });
  });
  agg.totalOvertime = agg.overtimeHours + agg.fridayOTHours;
  agg.totalOvertimeValue = agg.overtimeValue + agg.fridayOTValue;
  agg.totalLatenessDeduction = agg.latenessDeduction;
  agg.totalPenalty = agg.penalty;
  agg.totalDamage = agg.damage;
  agg.totalBonus = agg.bonus;
  agg.totalAdvance = agg.currentAdvance + agg.officialAdvance + agg.previousAdvance;
  agg.rangeNetBeforeBalance = agg.salaryDue - agg.currentAdvance - agg.officialAdvance;
  agg.finalSalary = agg.rangeNetBeforeBalance - agg.previousAdvance;
  return agg;
}

// Payroll close-state of a displayed month, read from the cached DB (no async in render).
// state: 'open' | 'closed' (awaiting posting) | 'posted' (accrual booked, ready to pay).
function getTimesheetMonthCloseState(year, month) {
  const db = window.PentagonDB?.getCached?.() || window.PentagonDB?.cache || {};
  const period = (db.payroll_periods || []).find(p => Number(p.year) === Number(year) && Number(p.month) === Number(month));
  if (!period || !['closed', 'posted', 'locked'].includes(period.status)) return { state: 'open', period: period || null };
  if (period.status === 'posted' || period.status === 'locked' || period.postedMoveId) return { state: 'posted', period };
  return { state: 'closed', period };
}

function timesheetMonthStateChipHtml(year, month) {
  const { state } = getTimesheetMonthCloseState(year, month);
  if (state === 'posted') return '<span class="ts-close-chip posted"><i class="fa-solid fa-lock"></i> مقفل ومرحّل — جاهز للدفع</span>';
  if (state === 'closed') return '<span class="ts-close-chip closed"><i class="fa-solid fa-lock"></i> مقفل — بانتظار الترحيل</span>';
  return '<span class="ts-close-chip open"><i class="fa-solid fa-lock-open"></i> شهر مفتوح</span>';
}

// Close + post one month's payroll straight from the timesheet page (scroll → close → next).
// Wraps the EXISTING engine (closePayrollPeriod → postPayrollAccrual): snapshot per employee,
// accrual entry (expense_payroll ↦ accrued_payroll) + advance settlement, all idempotent and
// server-locked. Shows a dry-run preview in the confirm so nothing is booked blind.
window.timesheetCloseAndPostMonth = async function (year, month) {
  const label = `${MONTHS_AR[month - 1] || month} ${year}`;
  try {
    const { state, period } = getTimesheetMonthCloseState(year, month);
    if (state === 'posted') { showToast(`شهر ${label} مقفل ومرحّل مسبقاً`, 'info'); return; }
    let periodId = period?.id;
    if (state === 'open') {
      const preview = await calculatePayrollPeriod(year, month);
      if (!preview.employeeCount) { showToast(`لا يوجد موظفون بسجلات في ${label}`, 'warning'); return; }
      const ok = confirm(
        `قفل وترحيل رواتب شهر ${label}؟\n\n` +
        `• عدد الموظفين: ${preview.employeeCount}\n` +
        `• إجمالي الاستحقاق: ${formatNum(Math.round(preview.totalAccrued))} د.ع\n` +
        `• تسوية السلف: ${formatNum(Math.round(preview.totalAdvances))} د.ع\n` +
        `• صافي الدفع بعد السلف: ${formatNum(Math.round(preview.totalPayableAfterAdvances))} د.ع\n\n` +
        `بعد القفل يصبح تايم شيت ${label} قراءة فقط، ويُرحّل قيد الاستحقاق إلى المحاسبة (دفتر الرواتب).`
      );
      if (!ok) return;
      const closeRes = await closePayrollPeriod(year, month, { notes: 'إقفال من صفحة التايم شيت' });
      periodId = closeRes?.payrollPeriod?.id;
    } else if (!confirm(`شهر ${label} مقفل لكن غير مرحّل. ترحيل قيد الاستحقاق الآن؟`)) {
      return;
    }
    if (!periodId) throw new Error('تعذر تحديد فترة الرواتب بعد القفل');
    await postPayrollAccrual(periodId);
    showToast(`✅ تم قفل وترحيل رواتب ${label} — جاهز للدفع من الحاسبة`, 'success');
    renderTimesheet();
  } catch (err) {
    console.error('timesheetCloseAndPostMonth failed:', err);
    showToast(err.message || `تعذر قفل شهر ${label}`, 'error');
  }
};

// Compact inline metrics for a month separator row inside the timesheet table.
function buildTimesheetMonthSummaryInnerHtml(doc) {
  const r = doc.result;
  return `
    <div class="ts-month-summary-inner">
      <strong class="ts-month-summary-title"><i class="fa-solid fa-file-invoice-dollar"></i> مستحقات شهر ${escapeHtml(doc.label)}</strong>
      <span>المستحق الإجمالي: <b class="pos">${formatMoneyReadable(doc.grossDue)}</b></span>
      <span>الغرامات: <b class="neg">${formatMoneyReadable(doc.penalties)}</b></span>
      <span>السلف المسحوبة في هذا الشهر: <b class="neg">${formatMoneyReadable(doc.monthAdvances)}</b></span>
      <span>صافي المستحق: <b class="net">${formatMoneyReadable(doc.netDue)}</b></span>
      <span>الحضور: <b>${r.attendanceDays} يوم</b> · الغياب: <b>${r.absentDays}</b></span>
      <span>التأخير: <b>${formatHoursAsMinutesLabel(r.totalLatenessHours || 0)}</b> · الإضافي: <b>${formatHoursAsMinutesLabel(r.totalOvertime || 0)}</b></span>
      <span>حافز نهاية الشهر: <b>${formatMoneyReadable(r.monthEndBonus || 0)}</b></span>
      ${timesheetMonthStateChipHtml(doc.year, doc.month)}
    </div>
  `;
}

// Build the bottom salary-calculator panel (selected employee, month-by-month documentation).
// Keeps the stable id `timesheetSummaryPanel` so refreshTimesheetAggregates can replace it in place.
function buildTimesheetSummaryPanelHtml(cfg, docsOpt = null) {
  const emp = employees[selectedEmpIdx];
  if (!emp) {
    return `
      <div class="payroll-summary-panel" id="timesheetSummaryPanel">
        <div class="ts-calc-empty-state">
          <i class="fa-solid fa-user-magnifying-glass"></i>
          <strong>اختر موظفاً لعرض حاسبة الراتب</strong>
          <span>اضغط على اسم الموظف من التبويبات أعلاه لعرض توثيق المستحقات شهراً بشهر.</span>
        </div>
      </div>
    `;
  }
  const docs = docsOpt || getTimesheetMonthlyDocs(emp, cfg);
  const totals = docs.reduce((acc, doc) => {
    acc.gross += doc.grossDue;
    acc.penalties += doc.penalties;
    acc.advances += doc.monthAdvances;
    acc.monthEndBonus += doc.monthEndBonus || 0;
    acc.net += doc.netDue;
    return acc;
  }, { gross: 0, penalties: 0, advances: 0, monthEndBonus: 0, net: 0 });
  // Negated: raw emp.prevAdvance is positive=company-owes, but this display/subtraction
  // below uses the internal positive=employee-owes convention (read-only panel, no edit input).
  const previousBalance = -asMoney(emp.prevAdvance);
  const finalAfterBalance = totals.net - previousBalance;
  const cardsHtml = docs.length ? `
    <div class="payroll-summary-grid">
      ${docs.map(doc => {
        const r = doc.result;
        const closeState = getTimesheetMonthCloseState(doc.year, doc.month).state;
        const closeActionHtml = closeState === 'posted'
          ? `<button class="btn-secondary ts-close-btn" disabled title="الشهر مقفل ومرحّل — سجّل الدفع من الحاسبة بالأسفل"><i class="fa-solid fa-circle-check"></i> مرحّل</button>`
          : `<button class="btn-primary ts-close-btn" onclick="timesheetCloseAndPostMonth(${doc.year}, ${doc.month})" title="يقفل شهر ${escapeHtml(doc.label)} لكل الموظفين ويرحّل قيد الاستحقاق للمحاسبة">
               <i class="fa-solid fa-lock"></i> ${closeState === 'closed' ? 'ترحيل القيود' : 'قفل وترحيل الشهر'}
             </button>`;
        return `
        <div class="payroll-summary-card ts-month-doc-card">
          <div class="payroll-summary-head">
            <strong>مستحقات شهر ${escapeHtml(doc.label)}</strong>
            <span>${formatMoneyReadable(doc.netDue)}</span>
          </div>
          <div class="payroll-summary-lines">
            <span>المستحق الإجمالي: <b>${formatMoneyReadable(doc.grossDue)}</b></span>
            <span>الأساس: <b>${formatNum(r.baseSalary)}</b> · البدلات: <b>${formatNum(r.allowances)}</b></span>
            <span>الإضافي: <b>${formatHoursAsMinutesLabel(r.totalOvertime || 0)} (${formatNum(r.totalOvertimeValue)})</b></span>
            <span>حافز الجمعة: <b>${formatNum(r.fridayCompensation)}</b> · مكافآت الأيام: <b>${formatNum(r.dailyBonus || 0)}</b></span>
            <span>حافز نهاية الشهر: <b>${formatMoneyReadable(r.monthEndBonus || 0)}</b></span>
            <span>الغرامات (تأخير/غياب/يدوي/أضرار): <b>${formatNum(doc.penalties)}</b></span>
            <span>السلف المسحوبة في هذا الشهر: <b>${formatNum(doc.monthAdvances)}</b> (رسمي ${formatNum(r.officialAdvance)} + جدول ${formatNum(r.currentAdvance)})</span>
            <span>الحضور: <b>${r.attendanceDays}</b> · الغياب: <b>${r.absentDays}</b> · الإجازة: <b>${r.leaveDays}</b></span>
            <span>التأخير: <b>${formatHoursAsMinutesLabel(r.totalLatenessHours || 0)}</b> · سماحية مستعملة: <b>${Math.round(r.graceMinutesUsed || 0)} دقيقة</b></span>
            <span>صافي المستحق لهذا الشهر: <b>${formatMoneyReadable(doc.netDue)}</b></span>
          </div>
          <div class="ts-month-doc-foot">
            ${timesheetMonthStateChipHtml(doc.year, doc.month)}
            ${closeActionHtml}
          </div>
        </div>
      `;}).join('')}
    </div>
  ` : '<div class="empty-cell">لا توجد أيام معروضة لهذا الموظف ضمن الأشهر المختارة.</div>';
  const totalsHtml = docs.length ? `
    <div class="ts-calc-totals">
      <span>إجمالي الفترة: <b class="pos">${formatMoneyReadable(totals.gross)}</b></span>
      <span>إجمالي الغرامات: <b class="neg">${formatMoneyReadable(totals.penalties)}</b></span>
      <span>إجمالي السلف المسحوبة: <b class="neg">${formatMoneyReadable(totals.advances)}</b></span>
      <span>إجمالي حوافز نهاية الشهر: <b class="pos">${formatMoneyReadable(totals.monthEndBonus)}</b></span>
      <span>صافي الفترة: <b class="net">${formatMoneyReadable(totals.net)}</b></span>
      <span>الرصيد السابق: <b>${formatSignedBalance(previousBalance)}</b></span>
      <span class="ts-calc-final">الصافي النهائي بعد الرصيد: <b>${formatMoneyReadable(finalAfterBalance)}</b></span>
    </div>
  ` : '';
  return `
    <div class="payroll-summary-panel" id="timesheetSummaryPanel">
      <div class="payroll-summary-title">
        <h3><i class="fa-solid fa-calculator"></i> حاسبة الراتب — ${escapeHtml(emp.name || '-')}</h3>
        <p>${escapeHtml(getTimesheetPeriodLabel(cfg))} · توثيق المستحقات شهراً بشهر بنفس محرك حساب الرواتب (عرض فقط، لا يعدّل أي بيانات).</p>
      </div>
      ${cardsHtml}
      ${totalsHtml}
    </div>
  `;
}

function getPayrollPeriodForMonth(db, year, month) {
  ensurePayrollCollections(db);
  return (db.payroll_periods || []).find(item => Number(item.year) === Number(year) && Number(item.month) === Number(month)) || null;
}

function getTimesheetPayrollState(emp, cfg) {
  const db = getPayrollDataCache();
  ensurePayrollCollections(db);
  const period = getPayrollPeriodForMonth(db, cfg.year, cfg.month);
  const closing = period && emp?.id
    ? (db.employee_payroll_closings || []).find(row => row.payrollPeriodId === period.id && row.employeeId === emp.id)
    : null;
  const summary = emp ? getEmployeeMonthlyPayrollSummary(emp, cfg) : null;
  return { db, period, closing, summary };
}

function buildTimesheetPayrollControlsHtml(emp, cfg) {
  const records = recordsForTimesheetRange(emp, cfg);
  const documentedCount = records.filter(rec => rec.timesheetDocumented).length;
  const rangeLabel = getTimesheetPeriodLabel(cfg);
  const previousBalance = asMoney(emp?.prevAdvance);
  // Official per-month engine (same as payroll closing/print) — the ONE net for the page.
  const official = getTimesheetOfficialRangeResult(emp, cfg);
  const suggestedPosting = Math.round(official.finalSalary || 0);
  const monthBonusInputs = getTimesheetSelectedMonths(cfg.year)
    .filter(month => recordsForMonth(emp, cfg.year, month).length > 0)
    .map(month => {
      const value = getTimesheetMonthEndBonus(emp, cfg.year, month);
      return `
        <label>
          <span>حافز نهاية ${escapeHtml(MONTHS_AR[month - 1] || month)}</span>
          <input type="number" class="form-input" value="${value || ''}" placeholder="0" oninput="updateTimesheetMonthEndBonus(${cfg.year}, ${month}, this.value)">
        </label>
      `;
    }).join('');
  return `
    <div class="timesheet-payroll-control-panel">
      <div class="timesheet-payroll-copy">
        <strong><i class="fa-solid fa-stamp"></i> مراجعة وتوثيق الأيام المعروضة</strong>
        <span>${escapeHtml(rangeLabel)} · ${escapeHtml(emp?.name || '-')} · موثق ${documentedCount} من ${records.length} يوم</span>
      </div>
      <div class="timesheet-payroll-metrics">
        <span>صافي الأشهر المعروضة: <b>${formatMoneyReadable(official.rangeNetBeforeBalance || 0)}</b></span>
        <span>بعد الرصيد السابق: <b>${formatMoneyReadable(official.finalSalary || 0)}</b></span>
        <span>رصيد الموظف الحالي: <b>${formatSignedBalance(-previousBalance)}</b></span>
      </div>
      <div class="timesheet-payroll-inputs">
        <label>
          <span>الرصيد السابق</span>
          <input type="number" id="timesheetPrevBalanceInput" class="form-input" value="${previousBalance}" oninput="updateTimesheetEmployeePrevBalance(this.value)">
        </label>
        <label>
          <span>مبلغ تثبيت الراتب</span>
          <input type="number" id="timesheetPostingAmountInput" class="form-input" value="${suggestedPosting}" oninput="this.dataset.manualEdit='1'">
        </label>
        ${monthBonusInputs}
      </div>
      <div class="timesheet-payroll-actions">
        <button class="btn-primary" onclick="timesheetDocumentVisibleDays()" title="يوثق فقط الأيام الظاهرة حالياً في فلتر الأشهر والموظف">
          <i class="fa-solid fa-circle-check"></i> توثيق الأيام المعروضة
        </button>
        <button class="btn-primary" onclick="timesheetPostSelectedEmployeeSalary()" title="يحفظ مبلغ التثبيت كرصيد للموظف في ملف الموظفين بدون إنشاء قيد محاسبي">
          <i class="fa-solid fa-file-invoice-dollar"></i> تثبيت الراتب للرصيد
        </button>
        <button class="btn-secondary" onclick="openWorkshopLedgerPayroll()">
          <i class="fa-solid fa-table-list"></i> لوحة الرواتب
        </button>
      </div>
    </div>
  `;
}

function buildTimesheetAdvanceLedgerPanelHtml(emp, cfg) {
  const db = getPayrollDataCache();
  const selectedMonths = getTimesheetSelectedMonths(cfg.year);
  const rows = selectedMonths.flatMap(month => getEmployeeAdvanceRowsForPeriod(db, emp, cfg.year, month, { includeNeedsReview: true }))
    .slice()
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const acceptedRows = rows.filter(row => row.status !== 'needs_review');
  const total = acceptedRows.reduce((sum, item) => sum + asMoney(item.amount), 0);
  const cashTotal = acceptedRows.filter(item => item.type === 'cash').reduce((sum, item) => sum + asMoney(item.amount), 0);
  const foodTotal = acceptedRows.filter(item => item.type === 'food').reduce((sum, item) => sum + asMoney(item.amount), 0);
  const reviewCount = rows.length - acceptedRows.length;
  const rowHtml = rows.length ? rows.map(item => {
    const settlementNote = getTimesheetAdvanceSettlementNote(item);
    return `
    <tr role="button" tabindex="0" title="تعديل السلفة" onclick="editTimesheetOfficialAdvance('${jsString(item.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();editTimesheetOfficialAdvance('${jsString(item.id)}');}">
      <td>${escapeHtml(item.date || '-')}</td>
      <td>${escapeHtml(item.type === 'food' ? 'طعام' : item.type === 'cash' ? 'نقدية' : (item.type || '-'))}</td>
      <td class="num">${formatNum(item.amount)} ${getAdminCurrencySymbol()}</td>
      <td>${escapeHtml(item.description || item.advanceTypeRaw || '-')}${settlementNote ? `<br><small>${escapeHtml(settlementNote)}</small>` : ''}</td>
      <td><span class="ts-status-pill ${item.status === 'needs_review' ? 'warn' : 'done'}">${escapeHtml(item.status === 'needs_review' ? 'تحتاج مراجعة' : 'معتمدة')}</span></td>
      <td>
        <button type="button" class="timesheet-advance-list-edit" onclick="event.stopPropagation(); editTimesheetOfficialAdvance('${jsString(item.id)}')">
          <i class="fa-solid fa-pen-to-square"></i>
          <span>تعديل</span>
        </button>
      </td>
    </tr>
  `}).join('') : '<tr><td colspan="6" class="empty-cell">لا توجد سلف مسجلة لهذا الموظف في الأيام المعروضة.</td></tr>';

  return `
    <div class="timesheet-advance-ledger-panel">
      <div class="timesheet-advance-ledger-head">
        <div>
          <strong><i class="fa-solid fa-hand-holding-dollar"></i> سجل السلف الرسمي لهذا الموظف</strong>
          <span>${escapeHtml(emp?.name || '-')} · ${escapeHtml(getTimesheetPeriodLabel(cfg))}</span>
        </div>
        <button class="btn-secondary" onclick="openWorkshopLedgerAdvances()"><i class="fa-solid fa-up-right-from-square"></i> فتح كل السلف</button>
      </div>
      <div class="timesheet-advance-kpis">
        <span>الإجمالي المعتمد: <b>${formatMoneyReadable(total)}</b></span>
        <span>نقدي: <b>${formatMoneyReadable(cashTotal)}</b></span>
        <span>طعام: <b>${formatMoneyReadable(foodTotal)}</b></span>
        <span>تحتاج مراجعة: <b>${reviewCount}</b></span>
      </div>
      <div class="timesheet-advance-table-wrap">
        <table class="timesheet-advance-table">
          <thead><tr><th>التاريخ</th><th>النوع</th><th>المبلغ</th><th>الوصف</th><th>الحالة</th><th>تعديل</th></tr></thead>
          <tbody>${rowHtml}</tbody>
        </table>
      </div>
    </div>
  `;
}

window.openWorkshopLedgerAdvances = function () {
  switchPage('workshop_ledger');
  setTimeout(() => { if (window.wsSetView) window.wsSetView('advances'); }, 300);
};

window.openWorkshopLedgerPayroll = function () {
  switchPage('workshop_ledger');
  setTimeout(() => { if (window.wsSetView) window.wsSetView('payroll'); }, 300);
};

window.updateTimesheetEmployeePrevBalance = function (value) {
  const emp = employees[selectedEmpIdx];
  if (!emp) return;
  emp.prevAdvance = parseFloat(value) || 0;
  const official = getTimesheetOfficialRangeResult(emp, getConfig());
  const postingInput = document.getElementById('timesheetPostingAmountInput');
  if (postingInput && !postingInput.dataset.manualEdit) {
    postingInput.value = Math.round(official.finalSalary || 0);
  }
  applyTimesheetStatCards(official);
  debounceSave();
};

window.updateTimesheetMonthEndBonus = function (year, month, value) {
  const emp = employees[selectedEmpIdx];
  if (!emp) return;
  setTimesheetMonthEndBonus(emp, Number(year), Number(month), value);
  const official = getTimesheetOfficialRangeResult(emp, getConfig());
  const postingInput = document.getElementById('timesheetPostingAmountInput');
  if (postingInput && !postingInput.dataset.manualEdit) {
    postingInput.value = Math.round(official.finalSalary || 0);
  }
  applyTimesheetStatCards(official);
  if (timesheetAggregateTimer) clearTimeout(timesheetAggregateTimer);
  timesheetAggregateTimer = setTimeout(refreshTimesheetAggregates, 250);
  debounceSave();
};

window.timesheetDocumentVisibleDays = function () {
  const cfg = getConfig();
  const emp = employees[selectedEmpIdx];
  if (!emp) return;
  const records = recordsForTimesheetRange(emp, cfg);
  if (!records.length) {
    showToast('لا توجد أيام معروضة للتوثيق.', 'warning');
    return;
  }
  if (!confirm(`توثيق ${records.length} يوم معروض للموظف ${emp.name} ضمن ${getTimesheetPeriodLabel(cfg)}؟`)) return;
  const batchId = makeId('tsdoc');
  const at = new Date().toISOString();
  const by = window.PentagonAuth?.getCurrentUser?.()?.id || 'system';
  records.forEach(rec => {
    rec.timesheetDocumented = true;
    rec.timesheetDocumentedAt = at;
    rec.timesheetDocumentedBy = by;
    rec.timesheetDocumentBatchId = batchId;
  });
  saveData();
  renderTimesheet();
  showToast(`تم توثيق ${records.length} يوم ظاهر بعلامة صح خضراء.`, 'success');
};

window.timesheetCloseCurrentPayrollMonth = window.timesheetDocumentVisibleDays;

window.timesheetPostSelectedEmployeeSalary = async function () {
  const cfg = getConfig();
  const emp = employees[selectedEmpIdx];
  if (!emp) return;
  const amount = parseFloat(document.getElementById('timesheetPostingAmountInput')?.value || '0') || 0;
  if (!confirm(`تثبيت مبلغ ${formatMoneyReadable(amount)} كرصيد للموظف ${emp.name}؟ سيُحفظ في رصيد الموظف اليدوي بدون قيد محاسبي.`)) return;
  // amount is what the company owes the employee this period, so store it as-is
  // (positive = company owes, matching the ledger convention of emp.prevAdvance).
  emp.prevAdvance = Math.round(amount);
  emp.lastTimesheetSalaryFix = {
    amount: Math.round(amount),
    periodLabel: getTimesheetPeriodLabel(cfg),
    fixedAt: new Date().toISOString(),
    fixedBy: window.PentagonAuth?.getCurrentUser?.()?.id || 'system',
  };
  saveData();
  renderTimesheet();
  showToast(`تم تثبيت راتب ${emp.name} في الرصيد: ${formatSignedBalance(-emp.prevAdvance)}.`, 'success');
};

// Live, in-place refresh of a single timesheet row's derived cells — does NOT touch any <input>,
// so the field the user is typing in keeps focus and caret position.
// Monthly lateness grace (100 min/month) is a MONTHLY pool, allocated to specific days by the
// payroll engine (officialResult.graceByKey → minutes graced on each day). getDailyCalc is per-day
// and knows nothing about it, so on its own every late day shows its full raw deduction. This helper
// folds the day's graced minutes back into the daily figures so the row matches the monthly total:
// a graced minute costs nothing — its ×1 penalty is removed AND its unearned pay is restored
// (exactly what calculateSalaryForEmployee does at the month level). Cached so the instant per-row
// refresh (keystroke) and the debounced aggregate pass both apply the same allocation.
let timesheetGraceByKey = {};
function graceAdjustedDaily(calc, gracedMinForDay) {
  const graceCredit = ((Number(gracedMinForDay) || 0) / 60) * (calc.hourlyRate || 0);
  // graceCredit can never exceed the day's own late penalty (grace minutes ≤ that day's late minutes).
  const capped = Math.min(graceCredit, calc.late || 0);
  return {
    graceCredit: capped,
    late: Math.max(0, (calc.late || 0) - capped),               // penalty after grace
    dayPay: (calc.dayPay || 0) + capped,                         // unearned pay restored
    penaltyTotal: Math.max(0, (calc.penaltyTotal || 0) - capped),// day's total deductions after grace
    total: (calc.total || 0) + 2 * capped,                       // net after grace (restore + un-penalize)
  };
}
function timesheetGracedMinutesFor(period) {
  return timesheetGraceByKey[`${period.year}-${period.month}-${period.day}`] || 0;
}

function refreshTimesheetRow(empIdx, dayIdx) {
  if (currentPage !== 'timesheet' || empIdx !== selectedEmpIdx) return;
  const emp = employees[empIdx];
  if (!emp || !emp.records || !emp.records[dayIdx]) return;
  const row = document.querySelector(`#timesheetBody tr[data-ri="${dayIdx}"]`);
  if (!row) return;
  const rec = emp.records[dayIdx];
  const period = getRecordPeriod(rec, getConfig());
  const calc = getDailyCalc(rec, emp, { ...getConfig(), year: period.year, month: period.month });
  const adj = graceAdjustedDaily(calc, timesheetGracedMinutesFor(period));
  const netEl = row.querySelector('[data-ts-net]');
  if (netEl) netEl.textContent = formatMoneyReadable(adj.total);
  const grossEl = row.querySelector('[data-ts-gross]');
  if (grossEl) grossEl.textContent = formatMoneyReadable(adj.dayPay + calc.allowance + calc.otValue + (Number(rec.bonus) || 0));
  const deductionsEl = row.querySelector('[data-ts-deductions]');
  if (deductionsEl) deductionsEl.textContent = formatMoneyReadable(adj.penaltyTotal + calc.advanceTotal);
  const otInfo = row.querySelector('[data-ts-otinfo]');
  if (otInfo) otInfo.textContent = `${formatHoursAsMinutesLabel(calc.otHours, { withHours: false })} (${formatMoneyReadable(calc.otValue)})`;
  const lateInfo = row.querySelector('[data-ts-lateinfo]');
  if (lateInfo) lateInfo.textContent = `${Math.round(calc.lateMinutes || 0)} دقائق (${formatMoneyReadable(adj.late)})`;
  const earlyInfo = row.querySelector('[data-ts-earlyinfo]');
  if (earlyInfo) earlyInfo.textContent = `${Math.round(calc.earlyMinutes || 0)} دقائق (${formatMoneyReadable(calc.earlyDeduction)})`;
  // Grace marker depends on the month-wide allocation → updated in the debounced refreshTimesheetAggregates.
}

// Heavy refresh (whole-month recompute for every employee) — runs debounced after typing stops,
// updating the stat cards and the summary panel without rebuilding the editable table.
function refreshTimesheetAggregates() {
  if (currentPage !== 'timesheet') return;
  const cfg = getConfig();
  const emp = employees[selectedEmpIdx];
  if (!emp) return;
  // Selected employee only: recompute the official month docs once and reuse everywhere —
  // stat cards, bottom calculator panel AND the in-table month separators (no <input> is touched).
  const monthlyDocs = getTimesheetMonthlyDocs(emp, cfg);
  const officialResult = getTimesheetOfficialRangeResult(emp, cfg, monthlyDocs);
  applyTimesheetStatCards(officialResult);
  const docsByMonth = {};
  monthlyDocs.forEach(doc => { docsByMonth[`${doc.year}-${doc.month}`] = doc; });
  document.querySelectorAll('#timesheetBody tr[data-ts-month-summary]').forEach(row => {
    const doc = docsByMonth[row.dataset.tsMonthSummary];
    if (doc) row.firstElementChild.innerHTML = buildTimesheetMonthSummaryInnerHtml(doc) + buildTimesheetForecastLineHtml(emp, doc);
  });
  const panel = document.getElementById('timesheetSummaryPanel');
  if (panel) panel.outerHTML = buildTimesheetSummaryPanelHtml(cfg, monthlyDocs);
  const controls = document.querySelector('.timesheet-payroll-control-panel');
  if (controls) controls.outerHTML = buildTimesheetPayrollControlsHtml(emp, cfg);
  // Refresh the monthly-grace markers AND the money cells across all rows. Editing one day can
  // reallocate the 100-min pool to different days, so every row's late/deduction/net may shift —
  // recompute them here from the fresh allocation (cheap DOM updates, one month recompute).
  const graceByKey = officialResult.graceByKey || {};
  timesheetGraceByKey = graceByKey; // keep the keystroke-path cache in sync with the fresh allocation
  document.querySelectorAll('#timesheetBody tr[data-ri]').forEach(row => {
    const rec = emp.records[Number(row.dataset.ri)];
    const graceEl = row.querySelector('[data-ts-gracemark]');
    if (!rec) return;
    const p = getRecordPeriod(rec, cfg);
    const g = graceByKey[`${p.year}-${p.month}-${p.day}`] || 0;
    if (graceEl) {
      graceEl.style.display = g > 0 ? '' : 'none';
      graceEl.textContent = `⏱ سماحية ${Math.round(g)}د`;
    }
    const calc = getDailyCalc(rec, emp, { ...cfg, year: p.year, month: p.month });
    const adj = graceAdjustedDaily(calc, g);
    const netEl = row.querySelector('[data-ts-net]');
    if (netEl) netEl.textContent = formatMoneyReadable(adj.total);
    const grossEl = row.querySelector('[data-ts-gross]');
    if (grossEl) grossEl.textContent = formatMoneyReadable(adj.dayPay + calc.allowance + calc.otValue + (Number(rec.bonus) || 0));
    const dedEl = row.querySelector('[data-ts-deductions]');
    if (dedEl) dedEl.textContent = formatMoneyReadable(adj.penaltyTotal + calc.advanceTotal);
    const lateInfo = row.querySelector('[data-ts-lateinfo]');
    if (lateInfo) lateInfo.textContent = `${Math.round(calc.lateMinutes || 0)}د (${formatMoneyReadable(adj.late)})`;
  });
  // Keep the docked calculator in step with table edits (it shows the same official numbers).
  if (document.getElementById('pageCalculator')?.classList.contains('ts-docked-calc')) {
    syncDockedCalculatorToTimesheet();
  }
}

function renderWarningIcon(rec, ri) {
  const isNormal = rec.status === 'normal' || !rec.status;
  const isMissing = (isNormal && (!rec.checkIn || !rec.checkOut)) || rec.isInvestigation;
  if (!isMissing) return '';

  const clicks = rec.warningClicks || 0;
  if (clicks >= 3) {
    return `<span class="verify-badge verified" title="تم التحقق والتوثيق" style="color: #22c55e; margin-left: 6px; font-size: 14px;"><i class="fa-solid fa-circle-check"></i></span>`;
  }

  const remaining = 3 - clicks;
  return `
    <span class="verify-badge pending"
          title="بيانات ناقصة! انقر ${remaining} مرات متتالية للتوثيق"
          style="color: #f59e0b; margin-left: 6px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; font-size: 14px; position: relative;"
          onclick="handleWarningClick(event, ${selectedEmpIdx}, ${ri})">
      <i class="fa-solid fa-circle-exclamation"></i>
    </span>
  `;
}

window.handleWarningClick = function(event, empIdx, ri) {
  event.stopPropagation();
  const emp = employees[empIdx];
  if (!emp) return;
  const rec = emp.records[ri];
  if (!rec) return;

  rec.warningClicks = (rec.warningClicks || 0) + 1;
  const remaining = 3 - rec.warningClicks;

  if (remaining > 0) {
    showToast(`انقر ${remaining} مرات إضافية لتوثيق السجل`, 'info');
  } else {
    showToast(`✓ تم توثيق السجل بنجاح`, 'success');
  }

  renderTimesheet();
  debounceSave();
};

function populateYearFilterDropdown() {
  const select = document.getElementById('yearFilterSelect');
  if (!select) return;

  const years = new Set();
  years.add(new Date().getFullYear());
  employees.forEach(emp => {
    if (emp && emp.records) {
      emp.records.forEach(r => {
        if (r.year) years.add(Number(r.year));
      });
    }
  });

  const sortedYears = Array.from(years).sort((a, b) => b - a);
  select.innerHTML = '';
  sortedYears.forEach(y => {
    const opt = document.createElement('option');
    opt.value = y;
    opt.textContent = y;
    if (y === getConfig().year) opt.selected = true;
    select.appendChild(opt);
  });
}

window.changeYearFilter = function(year) {
  const cfg = getConfig();
  cfg.year = Number(year);
  saveConfigToStorage();
  renderTimesheet();
};

// ─── Payroll forecast (month still in progress) ───
// Projects what a single "normal" day (fully present, no lateness, no OT)
// would earn this employee — used only to forecast days that haven't
// happened/been entered yet. Deliberately excludes advances and bonuses: a
// forecast is a projection of base pay, not a reconstruction of every manual
// adjustment.
function getEmployeeNormalDayPay(emp, year, month, day, cfg) {
  const mockRec = { year, month, day, status: 'normal', checkInMin: null, checkOutMin: null };
  const calc = getDailyCalc(mockRec, emp, cfg);
  return (calc.dayPay || 0) + (calc.allowance || 0);
}

function getEmployeeForecastDailySummary(emp, year, month, day, cfg = getConfig()) {
  const forecastCfg = { ...cfg, year, month, nominalSalary: getEmployeeNominalSalary(emp, cfg.nominalSalary) };
  const mockRec = { year, month, day, status: 'normal', checkInMin: null, checkOutMin: null };
  const calc = getDailyCalc(mockRec, emp, forecastCfg);
  const shift = getEmployeeShift(emp);
  return {
    calc,
    payable: (calc.dayPay || 0) + (calc.allowance || 0),
    netDue: (calc.dayPay || 0) + (calc.allowance || 0),
    hours: shift.hours || getPayrollSettings().standardDayHours || 9,
    allowance: calc.allowance || 0
  };
}

// Forecasts an employee's payroll position for a month: actual wages due
// for days already recorded + a projection for every remaining working day
// (excluding Friday) that has no record yet AND falls after the attendance
// cutoff anchor (see isCalendarDayForecastEligible — NOT simply "today
// onward"), at their normal per-day rate. This means a lagging import (last
// complete update behind today, or even behind the viewed month) still
// forecasts the in-between gap instead of silently dropping those days.
// A closed month never forecasts. There's no separate "hire date" field, so
// a new employee with no records yet simply has nothing to forecast until
// their attendance starts getting logged — no special-casing needed. Uses
// netDue (never advances) throughout, matching
// getEmployeeDailyFinancialSummary's existing exclusion.
function getEmployeePayrollForecast(emp, year, month) {
  const cfg = { ...getConfig(), year, month };
  const daysInMonth = getDaysInMonth(year, month);
  const monthClosed = isPayrollMonthClosed(year, month);

  let actualSoFar = 0;
  const recordedDays = new Set();
  (emp.records || []).forEach(rec => {
    if (!recordBelongsToMonth(rec, year, month)) return;
    if (!isCalendarAttendanceRecord(rec) && !rec.managerApproved) return;
    const period = getRecordPeriod(rec, cfg);
    recordedDays.add(period.day);
    actualSoFar += getEmployeeDailyFinancialSummary(emp, rec, cfg).netDue;
  });

  let forecastedRemaining = 0;
  let forecastedDaysCount = 0;
  if (!monthClosed) {
    for (let d = 1; d <= daysInMonth; d++) {
      if (isFriday(year, month, d)) continue;
      if (recordedDays.has(d)) continue;
      if (!isCalendarDayForecastEligible(year, month, d)) continue;
      if (!isEmployeeActiveOnDate(emp, year, month, d)) continue;
      forecastedRemaining += getEmployeeForecastDailySummary(emp, year, month, d, cfg).netDue;
      forecastedDaysCount++;
    }
  }

  return {
    actualSoFar,
    forecastedRemaining,
    forecastedDaysCount,
    projectedTotal: actualSoFar + forecastedRemaining,
    isForecastActive: forecastedDaysCount > 0
  };
}

// Company-wide payroll + operating-cost forecast — the single "how much do
// I still need to pay/spend this month" figure. Active whenever the month
// has at least one forecast-eligible day left (per the cutoff anchor, not
// wall-clock "today") and isn't closed — a month can still have real gaps to
// forecast even if it's chronologically in the past, when the last import
// never fully covered it.
function getPayrollForecastSummary(year, month) {
  const monthClosed = isPayrollMonthClosed(year, month);
  const activeEmployees = employees.filter(emp => emp && emp.name && employeeHasActiveDayInMonth(emp, year, month));
  const perEmployee = activeEmployees.map(emp => ({ emp, forecast: getEmployeePayrollForecast(emp, year, month) }));
  const actualLaborSoFar = perEmployee.reduce((sum, p) => sum + p.forecast.actualSoFar, 0);
  const forecastedLaborRemaining = perEmployee.reduce((sum, p) => sum + p.forecast.forecastedRemaining, 0);
  const operating = getWorkshopOperatingCostBreakdown(year, month);

  return {
    perEmployee,
    actualLaborSoFar,
    forecastedLaborRemaining,
    projectedLaborTotal: actualLaborSoFar + forecastedLaborRemaining,
    operatingMonthlyTotal: operating.monthlyTotal,
    projectedGrandTotal: actualLaborSoFar + forecastedLaborRemaining + operating.monthlyTotal,
    monthClosed,
    isForecastActive: !monthClosed && perEmployee.some(p => p.forecast.isForecastActive)
  };
}

function buildPayrollForecastCardHtml(year, month) {
  const summary = getPayrollForecastSummary(year, month);
  if (!summary.isForecastActive) {
    const message = summary.monthClosed
      ? `${MONTHS_AR[month - 1]} ${year} شهر مغلق — لا يوجد توقع، الأرقام كلها فعلية ومجمّدة.`
      : `${MONTHS_AR[month - 1]} ${year} — لا توجد أيام متبقية للتوقع، الأرقام كلها فعلية.`;
    return `
      <div class="ts-forecast-card ts-forecast-closed" id="payrollForecastCard">
        <div class="ts-forecast-header"><i class="fa-solid fa-circle-check"></i> ${message}</div>
      </div>
    `;
  }
  return `
    <div class="ts-forecast-card" id="payrollForecastCard">
      <div class="ts-forecast-header"><i class="fa-solid fa-wand-magic-sparkles"></i> توقع الإنفاق الإجمالي حتى نهاية ${MONTHS_AR[month - 1]}</div>
      <div class="ts-forecast-grid">
        <div class="ts-forecast-stat"><span>الأجور المستحقة حتى الآن (كل الموظفين)</span><strong>${formatMoneyReadable(summary.actualLaborSoFar)}</strong></div>
        <div class="ts-forecast-stat ts-forecast-projected"><span>🔮 الأجور المتوقعة للأيام المتبقية</span><strong>${formatMoneyReadable(summary.forecastedLaborRemaining)}</strong></div>
        <div class="ts-forecast-stat"><span>تشغيل/إيجار الشهر (تقديري)</span><strong>${formatMoneyReadable(summary.operatingMonthlyTotal)}</strong></div>
        <div class="ts-forecast-stat ts-forecast-total"><span>🔮 الإجمالي المتوقع لنهاية الشهر</span><strong>${formatMoneyReadable(summary.projectedGrandTotal)}</strong></div>
      </div>
      <small class="ts-forecast-note">التوقع مبني على يوم عمل عادي بدون إضافي لكل موظف حسب دوامه المعتاد، ولا يشمل السلف إطلاقاً — السلف دفعة مقدّمة من مستحقات موجودة أصلاً وليست كلفة حقيقية إضافية.</small>
    </div>
  `;
}

// Per-selected-employee forecast line, appended alongside the existing
// month summary row — only rendered for the month actually in progress.
function buildTimesheetForecastLineHtml(emp, doc) {
  if (!emp) return '';
  const forecast = getEmployeePayrollForecast(emp, doc.year, doc.month);
  if (!forecast.isForecastActive) return '';
  return `
    <div class="ts-forecast-inline">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      🔮 متوقع حتى نهاية الشهر (${forecast.forecastedDaysCount} يوم عمل متبقٍ بمعدّل يوم عادي):
      <b>${formatMoneyReadable(forecast.projectedTotal)}</b>
      <small>(الحالي ${formatMoneyReadable(forecast.actualSoFar)} + المتوقع ${formatMoneyReadable(forecast.forecastedRemaining)}) — بدون سلف</small>
    </div>
  `;
}

function renderTimesheet() {
  populateYearFilterDropdown();
  renderAttendanceFreshnessBanner('pageTimesheet', '.month-filter-bar');
  const tabsContainer = document.getElementById('empTabs');
  tabsContainer.innerHTML = '';
  const cfg = getConfig();
  ensureSelectedEmployeeForTimesheetRange(cfg);
  employees.forEach((emp, idx) => {
    // Filter: show employees with records in any selected month.
    const hasMonthRecords = recordsForTimesheetRange(emp, cfg).length > 0;
    if (!hasMonthRecords) return;

    const btn = document.createElement('button');
    btn.className = 'emp-tab' + (idx === selectedEmpIdx ? ' active' : '');
    btn.innerHTML = `${emp.name}<span class="delete-emp" onclick="event.stopPropagation();deleteEmployee(${idx})">✕</span>`;
    btn.onclick = () => selectEmployee(idx);
    tabsContainer.appendChild(btn);
  });

  renderMonthButtons(cfg.month);

  if (employees.length === 0) {
    const tableContainer = document.getElementById('timesheetTableContainer');
    if (tableContainer) tableContainer.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;">يرجى إضافة موظف أو استيراد بيانات أولاً</div>';
    document.getElementById('empConfig').style.display = 'none';
    if(document.getElementById('timesheetAIAssistant')) document.getElementById('timesheetAIAssistant').style.display = 'none';
    return;
  }

  document.getElementById('empConfig').style.display = 'flex';
  if(document.getElementById('timesheetAIAssistant')) document.getElementById('timesheetAIAssistant').style.display = 'flex';
  const tableContainer = document.getElementById('timesheetTableContainer') || document.createElement('div');
  if (!document.getElementById('timesheetTableContainer')) {
    tableContainer.id = 'timesheetTableContainer';
    tableContainer.className = 'table-container glass-card';
    tableContainer.style.marginTop = '20px';
    document.getElementById('pageTimesheet').appendChild(tableContainer);
  }
  tableContainer.classList.add('timesheet-table-container');

  const emp = employees[selectedEmpIdx];
  if (!emp) return;

  // Ensure every day of each displayed month exists as an official row BEFORE building the
  // table, so days no longer appear only after manually clicking "تعبئة الأيام المفقودة".
  // Frozen (closed) months are left untouched; forecast/future days stay unmaterialized.
  // Wrapped defensively: a failure here must never wedge or blank the timesheet render.
  try {
    let tsMaterialized = 0;
    getTimesheetSelectedMonths(cfg.year).forEach(m => {
      if (isPayrollMonthClosed(cfg.year, m)) return;
      tsMaterialized += materializeTimesheetDays(emp, cfg.year, m);
    });
    if (tsMaterialized > 0) debounceSave();
  } catch (e) {
    console.warn('[timesheet] day materialization skipped:', e);
  }

  const monthRecs = recordsForTimesheetRange(emp, cfg);

  // Month-by-month OFFICIAL salary docs (payroll-closing engine) — computed ONCE per render
  // and reused everywhere: stat cards, grace markers, month separators and the bottom panel.
  const monthlyDocs = getTimesheetMonthlyDocs(emp, cfg);
  const officialResult = getTimesheetOfficialRangeResult(emp, cfg, monthlyDocs);

  // Top stat cards read the official aggregate (same numbers the close/print/slip use).
  applyTimesheetStatCards(officialResult);

  tableContainer.innerHTML = `
    ${buildPayrollForecastCardHtml(cfg.year, cfg.month)}
    ${buildTimesheetPayrollControlsHtml(emp, cfg)}
    ${buildTimesheetAdvanceLedgerPanelHtml(emp, cfg)}
    <table class="data-table">
      <thead>
        <tr>
          <th class="ts-col-day">اليوم</th>
          <th class="ts-col-date">التاريخ</th>
          <th class="ts-col-time">دخول</th>
          <th class="ts-col-time">خروج</th>
          <th class="ts-col-status">الحالة</th>
          <th class="ts-col-notes">ملاحظات</th>
          <th class="ts-col-allowance">البدلات</th>
          <th class="ts-col-ot">الإضافي</th>
          <th class="ts-col-late">تأخير</th>
          <th class="ts-col-early">مغادرة مبكرة</th>
          <th class="ts-col-advance">سلفة</th>
          <th class="ts-col-penalty">غرامة</th>
          <th class="ts-col-bonus">مكافأة</th>
          <th class="ts-col-gross">إجمالي الاستحقاق</th>
          <th class="ts-col-deductions">إجمالي الاستقطاعات</th>
          <th class="ts-col-net">الصافي</th>
        </tr>
      </thead>
      <tbody id="timesheetBody"></tbody>
    </table>
  `;

  const tbody = document.getElementById('timesheetBody');
  const sortedRecs = monthRecs;
  // Monthly grace allocation (which days consumed the 100-min lateness grace) for the ⏱ marker —
  // taken from the official per-month engine's graceByDay allocation.
  const graceByKey = officialResult.graceByKey || {};
  timesheetGraceByKey = graceByKey; // cache for refreshTimesheetRow (keystroke) so it applies the same grace

  const docsByMonth = {};
  monthlyDocs.forEach(doc => { docsByMonth[`${doc.year}-${doc.month}`] = doc; });
  let tsCurrentMonthKey = null;
  const appendMonthSummaryRow = (key) => {
    const doc = docsByMonth[key];
    if (!doc) return;
    const sumTr = document.createElement('tr');
    sumTr.className = 'ts-month-summary-row';
    sumTr.dataset.tsMonthSummary = key;
    sumTr.innerHTML = `<td colspan="16">${buildTimesheetMonthSummaryInnerHtml(doc)}${buildTimesheetForecastLineHtml(emp, doc)}</td>`;
    tbody.appendChild(sumTr);
  };

  sortedRecs.forEach((rec) => {
    // Find absolute index in emp.records
    const ri = emp.records.findIndex(r => r.day === rec.day && r.month === rec.month && r.year === rec.year);
    const recPeriod = getRecordPeriod(rec, cfg);
    // Clear month separator: entitlement summary of the finished month + header of the new one.
    const tsMonthKey = `${recPeriod.year}-${recPeriod.month}`;
    if (tsMonthKey !== tsCurrentMonthKey) {
      if (tsCurrentMonthKey !== null) appendMonthSummaryRow(tsCurrentMonthKey);
      const headTr = document.createElement('tr');
      headTr.className = 'ts-month-header-row';
      headTr.innerHTML = `<td colspan="16"><span class="ts-month-header-label"><i class="fa-regular fa-calendar-days"></i> شهر ${escapeHtml(MONTHS_AR[recPeriod.month - 1] || recPeriod.month)} ${recPeriod.year}</span></td>`;
      tbody.appendChild(headTr);
      tsCurrentMonthKey = tsMonthKey;
    }
    const recCfg = { ...cfg, year: recPeriod.year, month: recPeriod.month, nominalSalary: getEmployeeNominalSalary(emp, cfg.nominalSalary) };
    const dayOfWeek = getDayOfWeek(recPeriod.year, recPeriod.month, recPeriod.day);
    const dayName = DAY_NAMES[dayOfWeek];
    const isFri = dayOfWeek === 5;
    const calc = getDailyCalc(rec, emp, recCfg);
    const defaultCalc = getDailyCalc({
      ...rec,
      allowanceOverride: null,
      otHoursOverride: null,
      lateOverride: null,
      earlyDeductionOverride: null
    }, emp, recCfg);

    const tr = document.createElement('tr');
    tr.dataset.ri = ri; // anchor for in-place row refresh while typing (see refreshTimesheetRow)
    if (isFri) tr.style.background = 'rgba(167, 139, 250, 0.05)';

    const statusObj = STATUS_OPTIONS.find(s => s.val === rec.status) || STATUS_OPTIONS.find(s => s.val === 'normal');

    let optionsHtml = '';
    STATUS_OPTIONS.forEach(opt => {
      optionsHtml += `<option value="${opt.val}" style="background: #1e293b; color: white;" ${rec.status === opt.val ? 'selected' : ''}>${opt.label}</option>`;
    });

    const statusDropdown = `
      <select class="status-select-pro"
              style="background: ${statusObj.color}20; color: ${statusObj.color}; border: 1px solid ${statusObj.color}80; padding: 6px; border-radius: 6px; font-weight: bold; cursor: pointer; outline: none; appearance: none; -webkit-appearance: none; text-align: center; min-width: 90px;"
              onchange="updateRecord(${selectedEmpIdx}, ${ri}, 'status', this.value); renderTimesheet();">
        ${optionsHtml}
      </select>
    `;
    const noteText = rec.notes || rec.correctionNotes || rec.correctionReason || rec.managerApprovalNote || '';
    const officialAdvancesForDay = getOfficialAdvanceRowsForRecord(emp, rec, recCfg);
    const officialAdvanceTotalForDay = officialAdvancesForDay.reduce((sum, item) => sum + asMoney(item.amount), 0);
    const officialAdvanceApplied = getOfficialAdvanceAppliedForRecord(emp, rec, recCfg);
    const manualAdvanceForDay = asMoney(rec.advance);
    const officialAdvanceTitle = officialAdvancesForDay
      .map(item => `${item.date || ''} · ${formatMoneyReadable(item.amount)} · ${item.description || item.advanceTypeRaw || ''}`)
      .join(' | ');
    const advanceBadgeTitle = [
      officialAdvanceTitle,
      manualAdvanceForDay > 0 ? `سلفة تايم شيت محفوظة: ${formatMoneyReadable(manualAdvanceForDay)}` : '',
    ].filter(Boolean).join(' | ');
    const officialAdvanceBadge = calc.advanceTotal > 0
      ? `<div class="timesheet-official-advance-edit" title="${escapeHtml(advanceBadgeTitle || 'سلفة لهذا اليوم')}">
          <span>${officialAdvanceTotalForDay > 0 ? 'رسمي' : 'سلفة'}</span>
          <b>${formatNum(calc.advanceTotal)}</b>
          ${officialAdvancesForDay.length > 1 ? `<em>+${officialAdvancesForDay.length - 1}</em>` : ''}
        </div>`
      : '';
    const advanceCellOpenAttrs = officialAdvancesForDay.length
      ? `role="button" tabindex="0" title="${escapeHtml(officialAdvanceTitle || 'فتح السلف الرسمية لهذا اليوم')}" onclick="openTimesheetAdvanceDayList(${selectedEmpIdx}, ${ri})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openTimesheetAdvanceDayList(${selectedEmpIdx}, ${ri});}"`
      : '';
    const addOfficialAdvanceButton = `<button type="button" class="timesheet-advance-action" title="إضافة سلفة رسمية لهذا اليوم" onclick="event.stopPropagation(); openTimesheetAdvanceCreate(${selectedEmpIdx}, ${ri})" aria-label="إضافة سلفة رسمية">+</button>`;
    const manualPenaltyForDay = asMoney(rec.penalty) + asMoney(rec.damage);
    const manualBonusForDay = asMoney(rec.bonus);
    const penaltyInlineControl = `
      <div class="timesheet-inline-amount-cell">
        <button type="button" class="timesheet-inline-plus penalty" title="إضافة أو تعديل غرامة داخل التايم شيت" onclick="event.stopPropagation(); openTimesheetInlineAmountEdit(${selectedEmpIdx}, ${ri}, 'penalty')" aria-label="إضافة غرامة">+</button>
        ${manualPenaltyForDay > 0 ? `<button type="button" class="timesheet-inline-amount-value penalty" title="تعديل الغرامة" onclick="event.stopPropagation(); openTimesheetInlineAmountEdit(${selectedEmpIdx}, ${ri}, 'penalty')">-${formatNum(manualPenaltyForDay)}</button>` : ''}
        ${aiFieldIcon(rec, 'penalty')}
      </div>`;
    const bonusInlineControl = `
      <div class="timesheet-inline-amount-cell">
        <button type="button" class="timesheet-inline-plus bonus" title="إضافة أو تعديل مكافأة داخل التايم شيت" onclick="event.stopPropagation(); openTimesheetInlineAmountEdit(${selectedEmpIdx}, ${ri}, 'bonus')" aria-label="إضافة مكافأة">+</button>
        ${manualBonusForDay > 0 ? `<button type="button" class="timesheet-inline-amount-value bonus" title="تعديل المكافأة" onclick="event.stopPropagation(); openTimesheetInlineAmountEdit(${selectedEmpIdx}, ${ri}, 'bonus')">+${formatNum(manualBonusForDay)}</button>` : ''}
        ${aiFieldIcon(rec, 'bonus')}
      </div>`;
    const graceKey = `${recPeriod.year}-${recPeriod.month}-${recPeriod.day}`;
    const adj = graceAdjustedDaily(calc, graceByKey[graceKey]);
    const dayGrossTotal = adj.dayPay + calc.allowance + calc.otValue + manualBonusForDay;
    const dayDeductionTotal = adj.penaltyTotal + calc.advanceTotal;

    tr.innerHTML = `
      <td style="font-weight:700">${dayName}</td>
      <td style="opacity:0.7; display: inline-flex; align-items: center; gap: 4px; justify-content: center; min-height: 34px;">${recPeriod.day}/${recPeriod.month} ${renderTimesheetDocumentedMarker(rec)} ${renderWarningIcon(rec, ri)}</td>
      <td class="timesheet-cell-marked"><input class="cell-input${aiInputClass(rec, 'checkIn')}" value="${rec.checkIn || ''}" placeholder="--:--" oninput="updateRecord(${selectedEmpIdx}, ${ri}, 'checkIn', this.value)">${aiFieldIcon(rec, 'checkIn')}${renderTimesheetManagerMarker(rec)}</td>
      <td class="timesheet-cell-marked"><input class="cell-input${aiInputClass(rec, 'checkOut')}" value="${rec.checkOut || ''}" placeholder="--:--" oninput="updateRecord(${selectedEmpIdx}, ${ri}, 'checkOut', this.value)">${aiFieldIcon(rec, 'checkOut')}</td>
      <td style="display:flex; align-items:center; justify-content:center; gap:5px;">
        ${statusDropdown}
        ${aiFieldIcon(rec, 'status')}
        ${rec.managerApprovalKind === 'leave' ? renderTimesheetManagerMarker(rec) : ''}
      </td>
      <td class="timesheet-cell-marked">
        <div class="timesheet-note-wrap">
          <input class="cell-input notes-input" value="${escapeHtml(noteText)}" title="${escapeHtml(noteText)}" placeholder="ملاحظة..." oninput="updateRecord(${selectedEmpIdx}, ${ri}, 'notes', this.value); const tip=this.parentElement.querySelector('.timesheet-note-tip'); if(tip) tip.textContent=this.value || 'لا توجد ملاحظة'; this.title=this.value || '';">
          <span class="timesheet-note-tip">${escapeHtml(noteText || 'لا توجد ملاحظة')}</span>
        </div>
      </td>
      <td class="timesheet-cell-marked"><input type="number" class="cell-input narrow" value="${rec.allowanceOverride ?? ''}" placeholder="${Math.round(defaultCalc.allowance)}" oninput="updateRecord(${selectedEmpIdx}, ${ri}, 'allowanceOverride', this.value)"></td>
      <td class="timesheet-cell-marked">
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px; justify-content:center;">
          <input type="number" step="0.1" class="cell-input narrow" style="width:45px; text-align:center; height:22px; padding:2px; margin:0;" value="${rec.otHoursOverride ?? ''}" placeholder="${Math.round(defaultCalc.otHours * 60)}د" oninput="updateRecord(${selectedEmpIdx}, ${ri}, 'otHoursOverride', this.value)">
          <span data-ts-otinfo style="font-size:9.5px; opacity:0.75; white-space:nowrap;">${formatHoursAsMinutesLabel(calc.otHours, { withHours: false })} (${formatMoneyReadable(calc.otValue)})</span>
        </div>
      </td>
      <td class="timesheet-cell-marked">
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px; justify-content:center;">
          <input type="number" class="cell-input narrow" style="width:45px; text-align:center; height:22px; padding:2px; margin:0;" value="${rec.lateOverride ?? ''}" placeholder="${formatMoneyReadable(defaultCalc.late)}" oninput="updateRecord(${selectedEmpIdx}, ${ri}, 'lateOverride', this.value)">
          <span data-ts-lateinfo style="font-size:9.5px; opacity:0.75; white-space:nowrap;">${Math.round(calc.lateMinutes || 0)}د (${formatMoneyReadable(adj.late)})</span>
          <span data-ts-gracemark title="تم استعمال سماحية التأخير الشهرية هنا" style="font-size:9px; color:#a3e635; margin-top:-1px; ${graceByKey[graceKey] > 0 ? '' : 'display:none;'}">⏱ ${Math.round(graceByKey[graceKey] || 0)}د</span>
        </div>
      </td>
      <td class="timesheet-cell-marked">
        <div style="display:flex; flex-direction:column; align-items:center; gap:2px; justify-content:center;">
          <input type="number" class="cell-input narrow" style="width:45px; text-align:center; height:22px; padding:2px; margin:0;" value="${rec.earlyDeductionOverride ?? ''}" placeholder="${formatMoneyReadable(defaultCalc.earlyDeduction)}" oninput="updateRecord(${selectedEmpIdx}, ${ri}, 'earlyDeductionOverride', this.value)">
          <span data-ts-earlyinfo style="font-size:9.5px; opacity:0.75; white-space:nowrap;">${Math.round(calc.earlyMinutes || 0)}د (${formatMoneyReadable(calc.earlyDeduction)})</span>
        </div>
      </td>
      <td class="timesheet-cell-marked">
        <div class="timesheet-advance-cell ${officialAdvancesForDay.length ? 'has-advances' : ''}" ${advanceCellOpenAttrs}>
          ${officialAdvanceBadge}
          ${addOfficialAdvanceButton}
          ${aiFieldIcon(rec, 'advance')}
        </div>
      </td>
      <td class="timesheet-cell-marked">${penaltyInlineControl}</td>
      <td class="timesheet-cell-marked">${bonusInlineControl}</td>
      <td data-ts-gross style="font-weight:700; color:#34d399;" title="الأجر اليومي + البدلات + الإضافي + المكافأة">${formatMoneyReadable(dayGrossTotal)}</td>
      <td data-ts-deductions style="font-weight:700; color:#f87171;" title="تأخير + مغادرة مبكرة + غياب + غرامة يدوية + السلف">${formatMoneyReadable(dayDeductionTotal)}</td>
      <td data-ts-net style="font-weight:800; color:var(--accent-blue)">${formatMoneyReadable(adj.total)}</td>
    `;
    tbody.appendChild(tr);
  });
  if (tsCurrentMonthKey !== null) appendMonthSummaryRow(tsCurrentMonthKey);

  tableContainer.insertAdjacentHTML('beforeend', buildTimesheetSummaryPanelHtml(cfg, monthlyDocs));

  // Everything in one page: the FULL salary calculator lives at the very bottom of the timesheet.
  dockCalculatorAtTimesheetBottom();
}

// ─── Salary-calculator docking ───
// The whole calculator (#pageCalculator) is ONE live DOM node. On the timesheet it is MOVED
// (never cloned — ids like cfgMonth/inpAttendance must stay unique) into a dock at the bottom
// of the page; opening the calculator's own nav item moves it back. Nothing inside it changes,
// so payment registration, receipt printing and the AI review keep working from both homes.
function dockCalculatorAtTimesheetBottom() {
  const tsPage = document.getElementById('pageTimesheet');
  if (!tsPage) return;
  const calcSection = document.getElementById('pageCalculator');
  if (!calcSection) {
    // Calculator template not hydrated yet — load it, then dock if we're still on the timesheet.
    if (typeof window.ensurePageTemplateLoaded === 'function') {
      window.ensurePageTemplateLoaded('calculator').then(() => {
        if (currentPage === 'timesheet' && document.getElementById('pageCalculator')) {
          dockCalculatorAtTimesheetBottom();
        }
      });
    }
    return;
  }
  let dock = document.getElementById('timesheetCalculatorDock');
  if (!dock) {
    dock = document.createElement('div');
    dock.id = 'timesheetCalculatorDock';
  }
  tsPage.appendChild(dock); // re-append → the dock is always the LAST block of the page
  if (calcSection.parentElement !== dock) dock.appendChild(calcSection);
  calcSection.classList.add('ts-docked-calc');
  syncDockedCalculatorToTimesheet();
}

function undockCalculatorToOwnPage() {
  const calcSection = document.getElementById('pageCalculator');
  if (!calcSection) return;
  calcSection.classList.remove('ts-docked-calc');
  const mainContent = document.getElementById('mainContent');
  if (mainContent && calcSection.parentElement !== mainContent) mainContent.appendChild(calcSection);
}

// While docked, the calculator follows the timesheet's selected employee + displayed month range
// (onCalcEmpChange already reads recordsForTimesheetRange, so both views always agree).
function syncDockedCalculatorToTimesheet() {
  const select = document.getElementById('calcEmpSelect');
  if (!select) return;
  refreshCalcEmpDropdown();
  if (selectedEmpIdx >= 0 && employees[selectedEmpIdx]) {
    select.value = String(selectedEmpIdx);
  }
  onCalcEmpChange();
}

function autoFillMissingDaysForEmployee(emp, year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  let added = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const exists = emp.records.some(r => r.day === d && r.month === month && r.year === year);
    if (!exists) {
      emp.records.push({
        day: d, month: month, year: year,
        date: `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
        checkIn: '', checkOut: '',
        status: isFriday(year, month, d) ? 'friday' : 'absent',
        advance: 0, penalty: 0, bonus: 0, damage: 0
      });
      added++;
    }
  }
  return added;
}

// The last day of a month that may be materialized as an OFFICIAL row. We never
// fabricate rows past the attendance-data cutoff — those days are forecast, not
// confirmed zeros (see isCalendarDayForecastEligible). A month entirely before the
// cutoff → whole month; the month containing the cutoff → up to the cutoff day; a
// month entirely after the cutoff → nothing.
function lastMaterializableDayForMonth(year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  const cutoff = getAttendanceUpdateCutoffDate();
  if (!cutoff) return 0;                       // no real attendance data yet → all forecast
  const monthStart = new Date(year, month - 1, 1);
  if (cutoff < monthStart) return 0;           // month is entirely after the cutoff
  const monthEnd = new Date(year, month - 1, daysInMonth);
  if (cutoff >= monthEnd) return daysInMonth;  // month is entirely on/before the cutoff
  return cutoff.getDate();                      // cutoff lands inside this month
}

// Guarantee the timesheet OFFICIALLY contains every day of the given month (rows never
// appear/disappear based on whether a value happens to exist). Empty pre-cutoff days
// become plain 'absent' (or 'friday') rows so the fields can be filled in afterwards.
// Bounded by both the data cutoff and the employee's employment period so we don't
// invent absences for days that haven't been imported yet or before/after they worked.
function materializeTimesheetDays(emp, year, month) {
  if (!emp) return 0;
  if (!Array.isArray(emp.records)) emp.records = [];
  const maxDay = lastMaterializableDayForMonth(year, month);
  let added = 0;
  for (let d = 1; d <= maxDay; d++) {
    if (typeof isEmployeeActiveOnDate === 'function' && !isEmployeeActiveOnDate(emp, year, month, d)) continue;
    const exists = emp.records.some(r => r.day === d && r.month === month && r.year === year);
    if (exists) continue;
    emp.records.push({
      day: d, month: month, year: year,
      date: `${String(d).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`,
      checkIn: '', checkOut: '',
      status: isFriday(year, month, d) ? 'friday' : 'absent',
      advance: 0, penalty: 0, bonus: 0, damage: 0
    });
    added++;
  }
  return added;
}

function autoFillMissingDays() {
  if (selectedEmpIdx < 0 || !employees[selectedEmpIdx]) return;
  const cfg = getConfig();
  const added = getTimesheetSelectedMonths(cfg.year)
    .reduce((sum, month) => sum + autoFillMissingDaysForEmployee(employees[selectedEmpIdx], cfg.year, month), 0);
  if (added > 0) {
    showToast(`✅ تم تعبئة ${added} يوم مفقود كغياب`, 'info');
    renderTimesheet();
    saveData();
  } else {
    showToast('كل الأيام موجودة بالفعل', 'info');
  }
}

function updateRecord(empIdx, dayIdx, field, value) {
  const rec = employees[empIdx].records[dayIdx];
  if (isPayrollPeriodClosedForRecord(rec)) {
    showToast('شهر الرواتب مغلق. استخدم reopen أو payroll adjustment بدل تعديل التايم شيت مباشرة.', 'warning');
    return;
  }

  if (field === 'checkIn' || field === 'checkOut') {
    rec[field] = value;
    rec[field + 'Min'] = parseTime(value);
    if (rec.checkInMin != null && rec.checkOutMin != null) {
      let h = rec.checkOutMin > rec.checkInMin
        ? (rec.checkOutMin - rec.checkInMin) / 60
        : ((24 * 60 - rec.checkInMin) + rec.checkOutMin) / 60;
      rec.hours = Math.round(h * 100) / 100;
    }
  } else if (field === 'penalty') {
    rec.penalty = parseFloat(value) || 0;
    rec.damage = 0;
  } else if (['advance', 'bonus', 'damage'].includes(field)) {
    rec[field] = parseFloat(value) || 0;
  } else if (['allowanceOverride', 'otHoursOverride', 'lateOverride', 'earlyDeductionOverride'].includes(field)) {
    rec[field] = (value === '' || value == null) ? null : parseFloat(value);
  } else {
    rec[field] = value;
  }
  if (rec.timesheetDocumented) {
    rec.timesheetEditedAfterDocumentAt = new Date().toISOString();
  }

  // Do NOT rebuild the whole table here. This handler fires on every keystroke (oninput); a full
  // renderTimesheet() destroyed and recreated the <input> being edited, which stole focus, dropped
  // characters ("can only type 2-3 digits") and lagged. Instead refresh the row's derived cells in
  // place now, and recompute the heavier month-wide stats/summary shortly after typing pauses.
  // (Status changes still call renderTimesheet() explicitly from their onchange, since they restyle
  //  the row.)
  refreshTimesheetRow(empIdx, dayIdx);
  if (timesheetAggregateTimer) clearTimeout(timesheetAggregateTimer);
  timesheetAggregateTimer = setTimeout(refreshTimesheetAggregates, 250);
  debounceSave();
}

function updateEmpSalary() {
  const val = parseFloat(document.getElementById('empSalaryInput').value) || 0;
  employees[selectedEmpIdx].salary = val;
  renderTimesheet();
  saveData();
}

// ─── Report Page ───
function renderReportTabs() {
  const tabsContainer = document.getElementById('reportEmpTabs');
  tabsContainer.innerHTML = '';
  const cfg = getConfig();
  const visibleIndexes = employeeIndexesForMonth(cfg.year, cfg.month);
  if (visibleIndexes.length && !visibleIndexes.includes(reportEmpIdx)) reportEmpIdx = visibleIndexes[0];
  employees.forEach((emp, idx) => {
    if (visibleIndexes.length && !visibleIndexes.includes(idx)) return;
    const btn = document.createElement('button');
    btn.className = 'emp-tab' + (idx === reportEmpIdx ? ' active' : '');
    btn.textContent = emp.name;
    btn.onclick = () => selectReportEmployee(idx);
    tabsContainer.appendChild(btn);
  });
}

function updateReportPeriodLabel(cfg = getConfig()) {
  const mode = document.getElementById('reportPeriodMode')?.value || 'current_month';
  const label = document.getElementById('reportPeriodLabel');
  const text = mode === 'last_30'
    ? 'الفترة المعروضة: آخر 30 يوم (الجدول الحالي يبقى حسب بيانات الشهر المحدد عند توفرها)'
    : mode === 'all'
      ? 'الفترة المعروضة: كل البيانات المتاحة، مع احتساب التقرير الحالي حسب إعدادات الشهر'
      : `الفترة المعروضة: ${cfg.month} / ${cfg.year}`;
  if (label) label.textContent = text;
}

function renderReport() {
  renderReportTabs();
  syncActiveOrgContextStrip('pageReport', 'reportOrgContextStrip');

  const reportContent = document.getElementById('reportContent');
  const reportEmpty = document.getElementById('reportEmpty');

  if (employees.length === 0) {
    reportEmpty.style.display = '';
    reportContent.style.display = 'none';
    return;
  }

  if (employeeIndexesForMonth(getConfig().year, getConfig().month).length === 0) {
    reportEmpty.style.display = '';
    reportContent.style.display = 'none';
    return;
  }

  reportEmpty.style.display = 'none';
  reportContent.style.display = '';

  const emp = employees[reportEmpIdx];
  if (!emp) return;

  const cfg = getConfig();
  cfg.nominalSalary = emp.salary || cfg.nominalSalary;
  const profile = getActiveOrgProfile();
  const currency = profile.currencySymbol || getAdminCurrencySymbol();
  updateReportPeriodLabel(cfg);
  const result = calculateSalaryForEmployee(emp, cfg);

  const tbody = document.getElementById('reportTableBody');
  tbody.innerHTML = '';

  const sections = [
    {
      cat: '📋 البيانات الأساسية', items: [
        ['الراتب الاسمي', formatNum(result.nominalSalary) + ' ' + currency],
        ['إجمالي أيام الشهر', result.totalDays],
        ['أيام الجمعة', result.fridayCount],
        ['أيام الدوام الفعلية', result.workingDays],
        ['سعر اليوم', formatNum(result.dailyRate) + ' ' + currency],
        ['سعر الساعة', formatNum(result.hourlyRate) + ' ' + currency],
        ['مخصصات النقل/يوم', formatNum(result.transportRate) + ' ' + currency],
        ['مخصصات الطعام/يوم', formatNum(result.foodRate) + ' ' + currency],
      ]
    },
    {
      cat: '👥 الحضور والغياب', items: [
        ['أيام الحضور الفعلي', result.attendanceDays],
        ['أيام الإجازة', result.leaveDays],
        ['أيام الغياب', result.absentDays],
        ['الجمعات التي عملها الموظف', result.fridayWorkedDays || 0],
        ['الجمعات المحولة إلى دوام اعتيادي', result.regularizedFridayCount || 0],
      ]
    },
    {
      cat: '💰 الاستحقاقات', items: [
        ['الراتب الأساسي', formatNum(result.baseSalary) + ' ' + currency, 'val-earn'],
        ['مخصصات النقل', formatNum(result.transportTotal) + ' ' + currency, 'val-earn'],
        ['مخصصات الطعام', formatNum(result.foodTotal) + ' ' + currency, 'val-earn'],
        ['ساعات الإضافي', result.totalOvertime.toFixed(1) + ' ساعة'],
        ['قيمة الإضافيات', formatNum(result.totalOvertimeValue) + ' ' + currency, 'val-earn'],
        ['جمعات مستحقة', result.eligibleFridays],
        ['تعويض الجمعة', formatNum(result.fridayCompensation) + ' ' + currency, 'val-earn'],
        ['المكافآت', formatNum(result.totalBonus) + ' ' + currency, 'val-earn'],
      ]
    },
    {
      cat: '📉 الخصومات', items: [
        ['ساعات التأخير', (result.totalLatenessHours > 0 ? result.totalLatenessHours.toFixed(1) : 0) + ' ساعة'],
        ['خصم التأخيرات (×2)', formatNum(result.totalLatenessDeduction) + ' ' + currency, 'val-deduct'],
        ['خصم الإجازات', formatNum(result.leaveDeduction) + ' ' + currency, 'val-deduct'],
        ['خصم الغيابات', formatNum(result.absenceDeduction) + ' ' + currency, 'val-deduct'],
        ['غرامة الجمعة التلقائية', formatNum(result.autoFridayPenalty) + ' ' + currency, 'val-deduct'],
        ['سلف التايم شيت اليدوية', formatNum(result.currentAdvance) + ' ' + currency, 'val-deduct'],
        ['السلف الرسمية من سجل القاصة', formatNum(result.officialAdvance || 0) + ' ' + currency, 'val-deduct'],
        ['إجمالي السلف والرصيد السابق', formatNum(result.totalAdvance) + ' ' + currency, 'val-deduct'],
        ['العقوبات', formatNum(result.totalPenalty) + ' ' + currency, 'val-deduct'],
        ['الأضرار', formatNum(result.totalDamage) + ' ' + currency, 'val-deduct'],
      ]
    },
    {
      cat: '🧾 الخلاصة المالية', items: [
        ['إجمالي الاستحقاقات', formatNum(result.totalEarnings) + ' ' + currency, 'val-earn'],
        ['إجمالي الاستقطاعات', formatNum(result.totalDeductions) + ' ' + currency, 'val-deduct'],
        ['الراتب المستحق قبل السلف', formatNum(result.salaryDue) + ' ' + currency, 'val-earn'],
        ['الرصيد السابق من قاعدة الموظفين والأرصدة', formatNum(result.previousAdvance) + ' ' + currency, 'val-deduct'],
      ]
    },
  ];

  sections.forEach(section => {
    const headerRow = document.createElement('tr');
    headerRow.className = 'report-section-header';
    headerRow.innerHTML = `<td colspan="2">${section.cat}</td>`;
    tbody.appendChild(headerRow);

    section.items.forEach(([label, value, cls]) => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td class="report-label">${label}</td>
        <td class="report-value ${cls || ''}">${value}</td>
      `;
      tbody.appendChild(row);
    });
  });

  // Final row
  const finalRow = document.createElement('tr');
  finalRow.className = 'report-final-row';
  finalRow.innerHTML = `
    <td class="report-label">🏦 الراتب النهائي المستحق</td>
    <td class="report-value">${formatNum(result.finalSalary)} ${escapeHtml(currency)}</td>
  `;
  tbody.appendChild(finalRow);

  const prevBalanceRow = document.createElement('tr');
  prevBalanceRow.className = 'report-final-row';
  prevBalanceRow.style.background = '#fde68a';
  prevBalanceRow.style.color = '#92400e';
  prevBalanceRow.innerHTML = `
    <td>الرصيد السابق (في ذمة الموظف)</td>
    <td class="report-value">${formatNum(result.previousAdvance)} ${escapeHtml(currency)}</td>
  `;
  tbody.appendChild(prevBalanceRow);

  const endingBalanceRow = document.createElement('tr');
  endingBalanceRow.className = 'report-final-row';
  endingBalanceRow.style.background = '#1e293b';
  endingBalanceRow.innerHTML = `
    <td style="font-size: 14px;">الرصيد الكلي بعد الدفع <span id="lblDynamicPaid"></span></td>
    <td class="report-value" id="valDynamicBalance" style="font-size: 16px;">-- ${escapeHtml(currency)}</td>
  `;
  tbody.appendChild(endingBalanceRow);

  // Clear existing print header/button to avoid duplication
  const oldHeader = reportContent.querySelector('.report-print-only');
  if (oldHeader) oldHeader.remove();
  const oldBtn = document.getElementById('reportPrintBtn');
  if (oldBtn) oldBtn.remove();
  const oldPaymentPanel = document.getElementById('reportPaymentPanel');
  if (oldPaymentPanel) oldPaymentPanel.remove();

  const reportPrintHeader = `
    <div class="report-print-only" style="display:none; text-align:center; margin-bottom: 20px;">
        <h2 style="color:#000; margin:0;">${escapeHtml(profile.companyName)} - تقرير كشف راتب</h2>
        <p style="color:#000; font-weight:bold;">${escapeHtml(profile.phone || '')} ${profile.address ? '| ' + escapeHtml(profile.address) : ''}</p>
        <p style="color:#000; font-weight:bold;">الموظف: ${emp.name} | شهر: ${cfg.month} / ${cfg.year} | العملة: ${escapeHtml(currency)}</p>
        <hr style="border:1px solid #000; margin:15px 0;">
    </div>
  `;

  const printBtnHtml = `
    <div id="reportPrintBtn" class="report-actions-row" style="text-align: left; margin-bottom: 15px;">
        <button class="btn-icon" onclick="window.print()" style="background:var(--accent-purple); color:white; padding:10px 20px; border-radius:10px; width:auto; box-shadow: 0 4px 15px rgba(168, 85, 247, 0.4);">
            <i class="fa-solid fa-print"></i> طباعة التقرير النهائي
        </button>
        <button class="btn-icon" onclick="exportPayrollImage()" style="background:var(--accent-blue); color:white; padding:10px 20px; border-radius:10px; width:auto;">
            <i class="fa-solid fa-image"></i> تصدير صورة
        </button>
    </div>
  `;

  const paymentPanelHtml = `
    <div id="reportPaymentPanel" class="payment-confirmation-box glass-card">
      <div>
        <strong>تأكيد الدفع وتحديث الرصيد</strong>
        <small>أي مبلغ تدفعه هنا يحدث رصيد الموظف في صفحة الموظفين والأرصدة.</small>
      </div>
      <div class="payment-controls">
        <input type="number" id="inpPaidAmount" class="form-input" value="${Math.max(0, Math.round(result.finalSalary))}" oninput="updatePaymentBalance()">
        <button id="btnMarkPaid" class="btn-small btn-success" onclick="markAsPaid()">تأكيد الدفع</button>
      </div>
    </div>
  `;

  reportContent.insertAdjacentHTML('afterbegin', reportPrintHeader);
  reportContent.insertAdjacentHTML('afterbegin', printBtnHtml);
  reportContent.insertAdjacentHTML('afterbegin', paymentPanelHtml);


  // Check if paid
  const paymentKey = `paid_${cfg.year}_${cfg.month}`;
  emp.payments = emp.payments || {};
  const paymentRecord = emp.payments[paymentKey];
  const btnMarkPaid = document.getElementById('btnMarkPaid');
  const inpPaidAmount = document.getElementById('inpPaidAmount');

  if (paymentRecord && paymentRecord.paid) {
    btnMarkPaid.style.display = 'inline-block';
    btnMarkPaid.innerHTML = '<span>✔️</span> تم الدفع';
    btnMarkPaid.style.background = '#059669';
    btnMarkPaid.disabled = false;
    inpPaidAmount.value = paymentRecord.amount || 0;
  } else {
    btnMarkPaid.style.display = 'inline-block';
    btnMarkPaid.innerHTML = '<span>✅</span> تأكيد الدفع';
    btnMarkPaid.style.background = '#10b981';
    btnMarkPaid.disabled = false;
    inpPaidAmount.value = Math.max(0, Math.round(result.finalSalary));
  }

  updatePaymentBalance();
}

function updatePaymentBalance() {
  const emp = employees[reportEmpIdx];
  if (!emp) return;
  const cfg = getConfig();

  cfg.nominalSalary = emp.salary || cfg.nominalSalary;
  const res = calculateSalaryForEmployee(emp, cfg);
  const paidAmount = parseFloat(document.getElementById('inpPaidAmount').value) || 0;
  const newBalance = calculateBalanceAfterPayment(res, paidAmount);

  const valEl = document.getElementById('valDynamicBalance');
  const lblEl = document.getElementById('lblDynamicPaid');
  if (valEl) {
    if (newBalance > 0) {
      valEl.textContent = formatSignedBalance(newBalance);
      valEl.style.color = '#ef4444';
    } else if (newBalance < 0) {
      valEl.textContent = formatSignedBalance(newBalance);
      valEl.style.color = '#10b981';
    } else {
      valEl.textContent = formatSignedBalance(newBalance);
      valEl.style.color = '#fff';
    }
  }
  if (lblEl) {
    lblEl.textContent = `(دفع ${formatAdminMoney(paidAmount)})`;
  }
}

// ─── Payment actions ───
// Audit fix (2026-07-04): logs the legacy off-ledger "تأكيد الدفع" toggle into
// the same audit_log the rest of the payroll system writes to. This does NOT
// markAsPaid() (Production Stabilization Sprint, 2026-07-04): fully converted
// to ledger-backed. It no longer touches employee.prevAdvance or emp.payments
// as a source of truth under any circumstance — every payment made from this
// legacy report-page button now goes through settlePayrollPayment() exactly
// like the new payroll screen, producing a real posted account_move
// (Dr 2100 accrued_payroll / Cr 1001 cash_workshop). If no official payroll
// closing exists yet for this employee/period, the action is BLOCKED (not
// silently recorded off-ledger, and not auto-created either — closing a
// period affects every eligible employee that month at once, so it must go
// through the real closing screen, not be a side effect of one employee's
// "mark paid" click). emp.payments[...] is kept only as local UI-display
// cache (which button state to render) referencing the real moveId, never as
// the source of the balance itself.
async function markAsPaid() {
  const cfg = getConfig();
  const emp = employees[reportEmpIdx];
  if (!emp) return;

  const cachedDb = window.PentagonDB?.getCached?.() || window.PentagonDB?.cache || {};
  const existingClosing = (typeof findPayrollClosingForEmployee === 'function' && emp.id)
    ? findPayrollClosingForEmployee(cachedDb, emp.id, cfg.year, cfg.month)
    : null;

  if (!existingClosing) {
    showToast('لا يوجد إقفال راتب رسمي مرحّل لهذا الموظف ولهذا الشهر. أغلق ورحّل الشهر من شاشة إقفال الرواتب الجديدة أولاً، ثم سجّل الدفع من هناك أو من هنا بعد الترحيل.', 'error');
    return;
  }

  const paymentKey = `paid_${cfg.year}_${cfg.month}`;
  emp.payments = emp.payments || {};
  const paymentRecord = emp.payments[paymentKey];

  if (paymentRecord && paymentRecord.paid) {
    // This payment is a real posted account_move now — it cannot be silently
    // "unmarked" client-side. Undoing it means reversing the posting.
    showToast('هذه الدفعة مرحّلة كقيد رسمي في الأستاذ العام. لإلغائها استخدم "إعادة فتح فترة الرواتب" من شاشة إقفال الرواتب (يتطلب صلاحية مدير وسبباً، وينشئ قيد عكس).', 'warning');
    return;
  }

  const paidAmount = parseFloat(document.getElementById('inpPaidAmount').value) || 0;
  if (paidAmount <= 0) {
    showToast('أدخل مبلغاً صحيحاً للدفع', 'error');
    return;
  }

  try {
    const { move } = await settlePayrollPayment(existingClosing.id, paidAmount);
    emp.payments[paymentKey] = {
      paid: true,
      amount: paidAmount,
      moveId: move.id,
      date: new Date().toISOString(),
    };
    showToast(`تم تسجيل دفع مبلغ ${formatAdminMoney(paidAmount)} كقيد رسمي مرحّل (${move.name || move.id})`, 'success');
  } catch (e) {
    showToast(e.message || 'تعذر تسجيل الدفع', 'error');
    return;
  }

  saveData();
  renderReport();
}

// ─── PDF export (report page) ───
function prepareSmartReportSummary() {
  const emp = employees[reportEmpIdx];
  if (!emp) return showToast('اختر موظفاً أولاً', 'warning');
  const cfg = getConfig();
  cfg.nominalSalary = emp.salary || cfg.nominalSalary;
  const result = calculateSalaryForEmployee(emp, cfg);
  const paidInput = parseFloat(document.getElementById('inpPaidAmount')?.value) || 0;
  const balanceAfter = calculateBalanceAfterPayment(result, paidInput);
  const box = document.getElementById('reportSmartSummary');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = `
    <h3>إعداد ملخص ذكي للتقرير</h3>
    <p>هذا ملخص حسب بيانات النظام المتاحة، وليس نتيجة AI خارجي.</p>
    <ul>
      <li>الحضور: ${result.attendanceDays || 0} يوم حضور، ${result.absentDays || 0} غياب، ${result.leaveDays || 0} إجازة.</li>
      <li>الراتب المستحق للفترة: ${formatAdminMoney(result.finalSalary || 0)} بعد الإضافات والخصومات.</li>
      <li>الخصومات والسلف: خصومات ${formatAdminMoney(result.totalDeductions || 0)}، سلف شهرية ${formatAdminMoney(result.totalAdvance || 0)}.</li>
      <li>الرصيد السابق: ${formatAdminMoney(result.previousAdvance || 0)}.</li>
      <li>المبلغ المدخل للدفع: ${formatAdminMoney(paidInput)}.</li>
      <li>النتيجة بعد الدفع: ${formatSignedBalance(balanceAfter)}.</li>
    </ul>
  `;
}

// Print EXACTLY the currently displayed state: selected employee + ALL selected months
// (same month separators and monthly entitlement docs as the screen), not one default month.
function printTimesheetForSelectedMonth() {
  const cfg = getConfig();
  const selectedEmp = employees[selectedEmpIdx];
  if (!selectedEmp) { showToast('لا توجد بيانات للطباعة', 'error'); return; }
  const monthlyDocs = getTimesheetMonthlyDocs(selectedEmp, cfg);
  if (!monthlyDocs.length) { showToast('لا توجد أيام معروضة للطباعة ضمن الأشهر المختارة', 'error'); return; }
  const w = window.open('', '_blank', 'width=1280,height=900');
  if (!w) return;

  const shift = getEmployeeShift(selectedEmp);
  const nominalSalary = getEmployeeNominalSalary(selectedEmp, cfg.nominalSalary);
  const fmtMin = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const statusLabel = s => { const o = STATUS_OPTIONS.find(x => x.val === normalizeStatus(s)); return o ? o.label : (s || '-'); };
  const money = v => Math.round(v || 0).toLocaleString('en-US');
  const periodLabel = getTimesheetPeriodLabel(cfg);

  // One section per displayed month: attendance table + entitlement summary.
  const monthSections = monthlyDocs.map((doc, idx) => {
    const monthCfg = { ...cfg, year: doc.year, month: doc.month, nominalSalary, skipSystemRules: true };
    const recs = recordsForMonth(selectedEmp, doc.year, doc.month).slice().sort((a, b) => a.day - b.day);
    // Per-day values from the SAME engine the timesheet shows (getDailyCalc) with the
    // record's explicit month/year — never the implicit current month.
    const rows = recs.map(rec => {
      const c = getDailyCalc(rec, selectedEmp, monthCfg);
      const dayName = DAY_NAMES[getDayOfWeek(doc.year, doc.month, rec.day)] || '';
      const noteText = rec.notes || rec.correctionNotes || rec.correctionReason || rec.managerApprovalNote || '';
      const docMark = rec.timesheetDocumented ? ' <span class="doc-check" title="موثق">✓</span>' : '';
      return `<tr><td>${dayName}</td><td>${rec.day}/${doc.month}${docMark}</td><td>${statusLabel(rec.status)}</td><td>${rec.checkIn || '-'}</td><td>${rec.checkOut || '-'}</td><td>${money(c.dayPay)}</td><td>${money(c.allowance)}</td><td>${money(c.otValue)}</td><td>${money(c.penaltyTotal)}</td><td>${money(c.advanceTotal)}</td><td>${money(c.total)}</td><td class="note">${escapeHtml(noteText)}</td></tr>`;
    }).join('');
    const documentedCount = recs.filter(rec => rec.timesheetDocumented).length;
    const r = doc.result;
    return `
      <section class="month-section${idx > 0 ? ' page-break' : ''}">
        <h3 class="month-sep">مستحقات شهر ${escapeHtml(doc.label)}</h3>
        <table>
          <thead><tr><th>اليوم</th><th>التاريخ</th><th>الحالة</th><th>دخول</th><th>خروج</th><th>أجر اليوم</th><th>البدل</th><th>الإضافي</th><th>الغرامات</th><th>السلف</th><th>الصافي</th><th>ملاحظات</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="12">لا توجد بيانات</td></tr>'}</tbody>
        </table>
        <div class="month-summary">
          <div class="month-summary-grid">
            <span>المستحق الإجمالي: <b>${money(doc.grossDue)}</b></span>
            <span>الغرامات: <b class="neg">${money(doc.penalties)}</b></span>
            <span>السلف المسحوبة في هذا الشهر: <b class="neg">${money(doc.monthAdvances)}</b></span>
            <span>صافي المستحق لهذا الشهر: <b class="net">${money(doc.netDue)}</b></span>
            <span>الحضور: <b>${r.attendanceDays} يوم</b> · الغياب: <b>${r.absentDays}</b> · الإجازة: <b>${r.leaveDays}</b></span>
            <span>التأخير: <b>${formatHoursAsMinutesLabel(r.totalLatenessHours || 0)}</b> · الإضافي: <b>${formatHoursAsMinutesLabel(r.totalOvertime || 0)} (${money(r.totalOvertimeValue)})</b></span>
            <span>حافز الجمعة: <b>${money(r.fridayCompensation)}</b> (${r.eligibleFridays} مستحقة)</span>
            <span>مكافآت الأيام: <b>${money(r.dailyBonus || 0)}</b></span>
            <span>حافز نهاية الشهر: <b>${money(r.monthEndBonus || 0)}</b></span>
            <span>التوثيق: <b>${documentedCount} من ${recs.length} يوم موثق ✓</b></span>
          </div>
        </div>
      </section>
    `;
  }).join('');

  const totals = monthlyDocs.reduce((acc, doc) => {
    acc.gross += doc.grossDue; acc.penalties += doc.penalties;
    acc.advances += doc.monthAdvances; acc.net += doc.netDue;
    acc.monthEndBonus += doc.monthEndBonus || 0;
    acc.attendance += doc.result.attendanceDays || 0;
    acc.absent += doc.result.absentDays || 0;
    acc.leave += doc.result.leaveDays || 0;
    acc.otHours += doc.result.totalOvertime || 0;
    acc.lateHours += doc.result.totalLatenessHours || 0;
    return acc;
  }, { gross: 0, penalties: 0, advances: 0, monthEndBonus: 0, net: 0, attendance: 0, absent: 0, leave: 0, otHours: 0, lateHours: 0 });
  // Negated so the printed "الرصيد السابق"/"الصافي النهائي" figures stay arithmetically
  // consistent (raw prevAdvance is positive=company-owes; this subtraction below expects
  // the internal positive=employee-owes convention).
  const previousBalance = -asMoney(selectedEmp.prevAdvance);
  const finalAfterBalance = totals.net - previousBalance;

  // ── قصاصة الراتب: ONE separate signed slip page PER displayed month (not one combined
  // table listing every month) — each carries only that month's own numbers and its own
  // signature block. The multi-month total + previous balance stays in the final-summary
  // box above (applied once, never per-slip) so it is never duplicated or ambiguous.
  const slipSections = monthlyDocs.map(doc => {
    const r = doc.result;
    const monthRecs = recordsForMonth(selectedEmp, doc.year, doc.month);
    const monthDocumented = monthRecs.filter(rec => rec.timesheetDocumented).length;
    const slipSerial = `SLP-${selectedEmp.id || selectedEmpIdx}-${doc.year}${String(doc.month).padStart(2, '0')}`;
    return `
    <section class="salary-slip page-break">
      <div class="slip-frame">
        <div class="slip-header">
          <div class="slip-brand">OCTAGON</div>
          <div class="slip-brand-sub">نظام إدارة الورشة والرواتب</div>
          <div class="slip-title">قصاصة راتب</div>
          <div class="slip-period">${escapeHtml(doc.label)}</div>
        </div>
        <table class="slip-info">
          <tr>
            <td><b>الموظف:</b> ${escapeHtml(selectedEmp.name || '-')}</td>
            <td><b>الراتب الاسمي:</b> ${money(nominalSalary)} د.ع</td>
            <td><b>الشفت:</b> ${escapeHtml(shift.label || '-')}</td>
          </tr>
          <tr>
            <td><b>الحضور:</b> ${r.attendanceDays} يوم · <b>الغياب:</b> ${r.absentDays} · <b>الإجازة:</b> ${r.leaveDays}</td>
            <td><b>الإضافي:</b> ${formatHoursAsMinutesLabel(r.totalOvertime || 0)} · <b>التأخير:</b> ${formatHoursAsMinutesLabel(r.totalLatenessHours || 0)}</td>
            <td><b>التوثيق:</b> ${monthDocumented} من ${monthRecs.length} يوم ✓</td>
          </tr>
        </table>
        <table class="slip-table">
          <thead><tr><th>البند</th><th>المبلغ (د.ع)</th></tr></thead>
          <tbody>
            <tr><td class="slip-month">المستحق الإجمالي</td><td>${money(doc.grossDue)}</td></tr>
            ${doc.monthEndBonus ? `<tr><td class="slip-month">حافز نهاية الشهر</td><td class="val-earn">${money(doc.monthEndBonus)}</td></tr>` : ''}
            <tr><td class="slip-month">الغرامات</td><td class="neg">-${money(doc.penalties)}</td></tr>
            <tr><td class="slip-month">السلف المسحوبة هذا الشهر</td><td class="neg">-${money(doc.monthAdvances)}</td></tr>
          </tbody>
          <tfoot>
            <tr class="slip-final"><td>صافي راتب الشهر</td><td>${money(doc.netDue)} د.ع</td></tr>
          </tfoot>
        </table>
        <div class="slip-payment">
          <span>المبلغ المدفوع: ______________________ د.ع</span>
          <span>طريقة الدفع: ☐ نقدي &nbsp; ☐ تحويل</span>
          <span>التاريخ: ____ / ____ / ________</span>
        </div>
        <div class="slip-signatures">
          <div><div class="sig-line"></div>توقيع الموظف</div>
          <div><div class="sig-line"></div>توقيع المحاسب</div>
          <div><div class="sig-line"></div>توقيع المدير</div>
        </div>
        <div class="slip-footer">رقم القصاصة: ${slipSerial} · أُصدرت من صفحة التايم شيت بتاريخ ${new Date().toLocaleDateString('en-GB')} ${new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</div>
      </div>
    </section>
  `;
  }).join('');

  w.document.open();
  w.document.write(`
    <html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>تقرير التايم شيت والرواتب — ${escapeHtml(selectedEmp.name || '-')}</title>
    <style>
      @page{size:A4 landscape;margin:8mm}
      *{box-sizing:border-box}
      html,body{width:297mm;min-height:210mm;margin:0 auto;background:#fff}
      body{font-family:Tahoma,Arial,sans-serif;padding:8mm;color:#111;direction:rtl}
      table{width:100%;border-collapse:collapse;font-size:9.4px;table-layout:fixed}
      th,td{border:1px solid #999;padding:3px 4px;text-align:center;vertical-align:middle;word-break:keep-all;overflow-wrap:anywhere}
      td.note{text-align:right;font-size:8.8px;width:17%}
      thead{background:#eee}
      .report-header{text-align:center;border-bottom:3px double #333;padding-bottom:8px;margin-bottom:10px}
      .report-header h2{margin:0 0 6px}
      .report-header p{margin:2px 0;font-size:11px;color:#333}
      .month-section{margin-bottom:14px}
      .month-sep{background:#1a1a2e;color:#fff;padding:6px 10px;border-radius:4px 4px 0 0;margin:0;font-size:12px}
      .month-summary{border:1px solid #999;border-top:none;background:#f6f6f6;padding:7px 10px}
      .month-summary-grid{display:flex;flex-wrap:wrap;gap:5px 14px;font-size:10.5px}
      .neg{color:#b91c1c}.net{color:#065f46}.val-earn{color:#059669;font-weight:700}
      .doc-check{color:#059669;font-weight:900}
      .final-summary{margin-top:12px;border:2px solid #1a1a2e;border-radius:6px;padding:9px 12px;page-break-inside:avoid}
      .final-summary h3{margin:0 0 6px;font-size:12px}
      .final-summary-grid{display:flex;flex-wrap:wrap;gap:6px 18px;font-size:11px}
      .final-line{width:100%;border-top:1px dashed #999;margin-top:6px;padding-top:6px;font-size:12px;font-weight:800}
      .print-footer{text-align:center;margin-top:22px;font-size:10px;color:#777;border-top:1px dashed #bbb;padding-top:8px}
      /* قصاصة الراتب */
      .salary-slip{page-break-inside:avoid}
      .slip-frame{max-width:240mm;margin:0 auto;border:2px solid #1a1a2e;border-radius:10px;padding:18px 24px;background:#fff}
      .slip-header{text-align:center;border-bottom:3px double #333;padding-bottom:14px;margin-bottom:16px}
      .slip-brand{font-size:26px;font-weight:900;letter-spacing:3px;color:#1a1a2e}
      .slip-brand-sub{font-size:12px;color:#555;margin-top:2px}
      .slip-title{font-size:19px;font-weight:800;margin-top:8px}
      .slip-period{font-size:13px;color:#777;margin-top:4px}
      .slip-info{margin-bottom:14px}
      .slip-info td{border:none;text-align:right;padding:4px 6px;font-size:12.5px}
      .slip-table th{background:#1a1a2e;color:#fff;padding:8px}
      .slip-table td{padding:7px}
      .slip-month{text-align:right;font-weight:700}
      .slip-final td{background:#1a1a2e;color:#fff;font-weight:900;font-size:15px;padding:11px}
      .slip-payment{display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px;margin-top:18px;font-size:12.5px;color:#333}
      .slip-signatures{display:flex;justify-content:space-between;margin-top:44px;text-align:center;font-size:12px;color:#555}
      .slip-signatures>div{width:150px}
      .sig-line{border-top:1px solid #888;margin-bottom:6px}
      .slip-footer{text-align:center;margin-top:20px;font-size:10px;color:#999;border-top:1px dashed #ccc;padding-top:8px}
      @media print{
        @page{size:A4 landscape;margin:8mm}
        html,body{width:auto;min-height:auto;margin:0}
        body{padding:0}
        .page-break{page-break-before:always}
        .month-summary,.final-summary,.salary-slip{page-break-inside:avoid}
      }
    </style></head>
    <body>
      <div class="report-header">
        <h2>تقرير التايم شيت والرواتب</h2>
        <p><b>${escapeHtml(selectedEmp.name || '-')}</b> · الراتب الاسمي: ${money(nominalSalary)} د.ع · الشفت: ${escapeHtml(shift.label || '-')} (${fmtMin(shift.startMin)}–${fmtMin(shift.endMin)} · ${shift.hours} ساعات)</p>
        <p>فترة التقرير: ${escapeHtml(periodLabel)} · تاريخ الطباعة: ${new Date().toLocaleDateString('en-GB')}</p>
      </div>
      ${monthSections}
      <div class="final-summary">
        <h3>الخلاصة النهائية للفترة (${escapeHtml(periodLabel)})</h3>
        <div class="final-summary-grid">
          <span>إجمالي المستحق: <b>${money(totals.gross)}</b></span>
          <span>إجمالي حوافز نهاية الشهر: <b>${money(totals.monthEndBonus)}</b></span>
          <span>إجمالي الغرامات: <b class="neg">${money(totals.penalties)}</b></span>
          <span>إجمالي السلف المسحوبة: <b class="neg">${money(totals.advances)}</b></span>
          <span>صافي الفترة: <b class="net">${money(totals.net)}</b></span>
          <span>الرصيد السابق: <b>${money(previousBalance)}</b></span>
          <span class="final-line">الصافي النهائي بعد الرصيد السابق: ${money(finalAfterBalance)} د.ع</span>
        </div>
      </div>
      ${slipSections}
      <div class="print-footer">أُنشئ هذا التقرير من صفحة التايم شيت — نظام OCTAGON لإدارة الرواتب</div>
      <script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script>
    </body></html>
  `);
  w.document.close();
}

async function exportPayrollPdf() {
  if (employees.length === 0 || !employees[reportEmpIdx]) {
    showToast('لا توجد بيانات للطباعة', 'error');
    return;
  }
  try {
    await ensureOctagonLibrary('html2pdf', 'html2pdf', 'PDF export library unavailable');
  } catch (err) {
    console.error('PDF library load failed:', err);
    showToast('تعذر تحميل مكتبة تصدير PDF. تأكد من الاتصال ثم جرب مرة أخرى.', 'error');
    return;
  }

  const emp = employees[reportEmpIdx];

  const cfg = getConfig();
  cfg.nominalSalary = emp.salary || cfg.nominalSalary;
  const result = calculateSalaryForEmployee(emp, cfg);
  const monthName = MONTHS_AR[cfg.month - 1];

  const paymentKey = `paid_${cfg.year}_${cfg.month}`;
  emp.payments = emp.payments || {};
  const paymentRecord = emp.payments[paymentKey];
  const paidAmount = paymentRecord && paymentRecord.paid
    ? paymentRecord.amount
    : (parseFloat(document.getElementById('inpPaidAmount').value) || Math.max(0, result.finalSalary));
  const newBalance = calculateBalanceAfterPayment(result, paidAmount);

  const fileName = `وصل_راتب_${emp.name}_${monthName}_${cfg.year}.pdf`;

  const receiptEl = document.getElementById('printReceiptContainer');

  receiptEl.innerHTML = `
    <div id="receipt-content" style="
      font-family: 'Tajawal', Arial, sans-serif;
      direction: rtl;
      padding: 30px;
      background: #fff;
      color: #111;
      max-width: 700px;
      margin: 0 auto;
    ">
      <!-- Header -->
      <div style="text-align:center; border-bottom: 3px double #333; padding-bottom:16px; margin-bottom:20px;">
        <div style="font-size:28px; font-weight:900; letter-spacing:2px; color:#1a1a2e;">OCTAGON</div>
        <div style="font-size:13px; color:#555; margin-top:4px;">نظام إدارة الرواتب</div>
        <div style="font-size:18px; font-weight:700; margin-top:8px;">وصل راتب شهري</div>
        <div style="font-size:13px; color:#777; margin-top:4px;">${monthName} ${cfg.year}</div>
      </div>

      <!-- Employee Info -->
      <table style="width:100%; margin-bottom:16px; font-size:13px; border-collapse:collapse;">
        <tr>
          <td style="padding:5px 8px;"><b>اسم الموظف:</b></td>
          <td style="padding:5px 8px;">${emp.name}</td>
          <td style="padding:5px 8px;"><b>الراتب الاسمي:</b></td>
          <td style="padding:5px 8px;">${formatNum(result.nominalSalary)} د.ع</td>
        </tr>
        <tr>
          <td style="padding:5px 8px;"><b>أيام الحضور:</b></td>
          <td style="padding:5px 8px;">${result.attendanceDays} يوم</td>
          <td style="padding:5px 8px;"><b>أيام الإجازة:</b></td>
          <td style="padding:5px 8px;">${result.leaveDays} يوم</td>
        </tr>
        <tr>
          <td style="padding:5px 8px;"><b>أيام الغياب:</b></td>
          <td style="padding:5px 8px;">${result.absentDays} يوم</td>
          <td style="padding:5px 8px;"><b>ساعات الإضافي:</b></td>
          <td style="padding:5px 8px;">${result.totalOvertime.toFixed(1)} ساعة</td>
        </tr>
      </table>

      <!-- Detail Table -->
      <table style="width:100%; border-collapse:collapse; font-size:13px; margin-bottom:20px;">
        <thead>
          <tr style="background:#1a1a2e; color:#fff;">
            <th style="padding:10px 12px; text-align:right; font-weight:700;">البند</th>
            <th style="padding:10px 12px; text-align:left; font-weight:700;">المبلغ (د.ع)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td style="padding:7px 12px; border-bottom:1px solid #eee;">الراتب الأساسي</td>                                <td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left;">${formatNum(result.baseSalary)}</td></tr>
          <tr><td style="padding:7px 12px; border-bottom:1px solid #eee;">مخصصات النقل</td>                                <td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left;">${formatNum(result.transportTotal)}</td></tr>
          <tr><td style="padding:7px 12px; border-bottom:1px solid #eee;">مخصصات الطعام</td>                                <td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left;">${formatNum(result.foodTotal)}</td></tr>
          <tr><td style="padding:7px 12px; border-bottom:1px solid #eee;">قيمة الإضافيات</td>                              <td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left;">${formatNum(result.totalOvertimeValue)}</td></tr>
          <tr><td style="padding:7px 12px; border-bottom:1px solid #eee;">تعويض الجمعة (${result.eligibleFridays} جمعة)</td><td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left;">${formatNum(result.fridayCompensation)}</td></tr>
          <tr><td style="padding:7px 12px; border-bottom:1px solid #eee;">المكافآت</td>                                    <td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left;">${formatNum(result.totalBonus)}</td></tr>
          <tr style="background:#fff5f5;"><td style="padding:7px 12px; border-bottom:1px solid #eee;">خصم التأخيرات (×2) [${result.totalLatenessHours.toFixed(1)} ساعة]</td><td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left; color:red;">-${formatNum(result.totalLatenessDeduction)}</td></tr>
          <tr style="background:#fff5f5;"><td style="padding:7px 12px; border-bottom:1px solid #eee;">خصم الغيابات</td>   <td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left; color:red;">-${formatNum(result.absenceDeduction)}</td></tr>
          <tr style="background:#fff5f5;"><td style="padding:7px 12px; border-bottom:1px solid #eee;">سلف التايم شيت اليدوية</td><td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left; color:red;">-${formatNum(result.currentAdvance)}</td></tr>
          <tr style="background:#fff5f5;"><td style="padding:7px 12px; border-bottom:1px solid #eee;">السلف الرسمية من سجل القاصة</td><td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left; color:red;">-${formatNum(result.officialAdvance || 0)}</td></tr>
          <tr style="background:#fff5f5;"><td style="padding:7px 12px; border-bottom:1px solid #eee;">العقوبات</td>       <td style="padding:7px 12px; border-bottom:1px solid #eee; text-align:left; color:red;">-${formatNum(result.totalPenalty)}</td></tr>
          <tr style="background:#fff5f5;"><td style="padding:7px 12px; border-bottom:2px solid #333;">الأضرار</td>         <td style="padding:7px 12px; border-bottom:2px solid #333; text-align:left; color:red;">-${formatNum(result.totalDamage)}</td></tr>
        </tbody>
        <tfoot>
          <tr style="background:#1a1a2e; color:#fff;">
            <td style="padding:12px; font-weight:800; font-size:15px;">الراتب النهائي المستحق لهذا الشهر</td>
            <td style="padding:12px; font-weight:800; font-size:18px; text-align:left;">${formatNum(result.finalSalary)} د.ع</td>
          </tr>
          <tr style="background:#fef3c7; color:#92400e;">
            <td style="padding:10px 12px; font-size:13px;">الرصيد السابق (في ذمة الموظف)</td>
            <td style="padding:10px 12px; font-size:13px; text-align:left;">${formatNum(result.previousAdvance)} د.ع</td>
          </tr>
          <tr style="background:#f0fdf4; color:#065f46; border-top: 2px dashed #aaa;">
            <td style="padding:10px 12px; font-size:12px;">
              الرصيد الكلي بعد الدفع<br>
              <span style="color:#555; font-size:11px;">(المبلغ المدفوع للموظف: ${formatNum(paidAmount)} د.ع)</span>
            </td>
            <td style="padding:10px 12px; font-size:14px; text-align:left; font-weight:700;">
              ${newBalance > 0
      ? `<span style="color:#ef4444;">${formatNum(newBalance)} د.ع (بذمته)</span>`
      : newBalance < 0
        ? `<span style="color:#10b981;">${formatNum(Math.abs(newBalance))} د.ع (يطلبه)</span>`
        : `<span style="color:#059669;">مسدد ✓</span>`
    }
            </td>
          </tr>
        </tfoot>
      </table>

      <!-- Signatures -->
      <div style="display:flex; justify-content:space-between; margin-top:50px; font-size:12px; color:#666;">
        <div style="text-align:center; width:150px;">
          <div style="border-top:1px solid #999; padding-top:8px;">توقيع الموظف</div>
        </div>
        <div style="text-align:center; width:150px;">
          <div style="border-top:1px solid #999; padding-top:8px;">توقيع المدير</div>
        </div>
      </div>

      <!-- Footer -->
      <div style="text-align:center; margin-top:30px; font-size:10px; color:#999; border-top:1px dashed #ccc; padding-top:10px;">
        تم إنشاء هذا الوصل بواسطة نظام OCTAGON لإدارة الرواتب
      </div>
    </div>
  `;

  receiptEl.style.display = 'block';

  const element = document.getElementById('receipt-content');
  const opt = {
    margin: [10, 10, 10, 10],
    filename: fileName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  showToast('جاري تصدير الـ PDF...', 'info');

  html2pdf().set(opt).from(element).save().then(() => {
    receiptEl.style.display = 'none';
    receiptEl.innerHTML = '';
    showToast(`تم تصدير: ${fileName}`, 'success');
  }).catch(err => {
    receiptEl.style.display = 'none';
    receiptEl.innerHTML = '';
    showToast('حدث خطأ أثناء التصدير', 'error');
    console.error(err);
  });
}

async function exportPayrollImage() {
  if (employees.length === 0 || !employees[reportEmpIdx]) {
    showToast('لا توجد بيانات للتصدير', 'error');
    return;
  }
  if (typeof html2canvas !== 'function') {
    showToast('مكتبة تصدير الصور غير جاهزة، جرّب تصدير PDF.', 'error');
    return;
  }

  const emp = employees[reportEmpIdx];
  const cfg = getConfig();
  const monthName = MONTHS_AR[cfg.month - 1];
  const reportContent = document.getElementById('reportContent');
  const fileName = `تقرير_${emp.name}_${monthName}_${cfg.year}.png`;

  showToast('جاري تصدير التقرير كصورة...', 'info');
  try {
    const canvas = await html2canvas(reportContent, {
      scale: 2,
      backgroundColor: '#0f172a',
      useCORS: true,
      ignoreElements: el => el.id === 'reportPrintBtn'
    });
    const link = document.createElement('a');
    link.download = fileName;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
    showToast(`تم تصدير الصورة: ${fileName}`, 'success');
  } catch (err) {
    console.error(err);
    showToast('تعذر تصدير التقرير كصورة', 'error');
  }
}


// ─── Data Persistence (localStorage) ───
function saveConfigToStorage() {
  try {
    const c = getConfig();
    localStorage.setItem('site-config', JSON.stringify({
      year: c.year,
      month: c.month,
      nominalSalary: c.nominalSalary,
      cfgTransport: c.cfgTransport,
      cfgFood: c.cfgFood,
    }));
    // Also persist config through the main file save path
    debounceSave();
  } catch (e) { console.warn('saveConfigToStorage:', e); }
}

let isAutomationRunning = false;
function runOmniAutomationTick() {
  if (isAutomationRunning) return;
  isAutomationRunning = true;
  let didChange = false;
  ensureOmni();

  // Rule 1: Auto-escalate stuck Kanban cards
  const now = new Date();
  const inProgressColId = (omni.kanban.columns.find(c => c.title.toLowerCase().includes('progress') || c.title.includes('عمل') || c.title.includes('قيد')) || {}).id;
  if (inProgressColId) {
    omni.kanban.cards.forEach(card => {
      if (card.columnId === inProgressColId && card.priority !== 'Urgent') {
        const lastLog = [...(card.activityLog||[])].reverse().find(l => l.text.includes('نقل') || l.text.includes('moved'));
        const dateToCheck = lastLog ? new Date(lastLog.date) : new Date(card.dueDate || Date.now());
        const diffHours = (now - dateToCheck) / (1000 * 60 * 60);
        if (diffHours > 24) {
          card.priority = 'Urgent';
          if (!card.tags) card.tags = [];
          if (!card.tags.includes('Escalated')) card.tags.push('Escalated');
          card.activityLog.push({ date: now.toISOString(), text: 'System Auto-Escalation: Stuck > 24h' });
          didChange = true;
          showToast(`تم تصعيد المهمة "${card.title}" تلقائياً بسبب التأخير`, 'warning');
        }
      }
    });
  }

  if (didChange) {
    saveData(true);
    if (document.getElementById('omniKanbanBoard')) renderKanbanBoard();
  }
  isAutomationRunning = false;
}

// Track if we already warned the user about server being down (avoid toast spam)
let _serverDownWarned = false;
let _lastFileSaveOk = true;

function saveData(skipAutomation = false) {
  // Guard: never persist before the initial loadData() has completed at least once.
  // A race where any save fires DURING the loadData() await posts the default/empty
  // finance+omni over the server, wiping real data (customers/modules) on every reload.
  // employees were already protected server-side; this protects finance+omni client-side.
  if (!window.__dataLoadComplete) {
    console.warn('[saveData] skipped — initial data load not complete yet (prevents reload data-wipe).');
    console.trace('[saveData] stack trace:');
    return;
  }
  try {
    if (!skipAutomation && window.omni) runOmniAutomationTick();
    // Record last save timestamp so the Admin Panel's System Health card can display it.
    if (window.omni) omni._lastSavedAt = new Date().toISOString();
    const data = {
      employees,
      finance: ensureFinance(),
      omni: ensureOmni(),
      config: getConfig(),
      selectedEmpIdx,
      reportEmpIdx
    };
    // T1.2 (schema enforcement, choke-point 2): employees is the ONE
    // protect:true collection in OctagonSchema — an empty-array write is
    // ALWAYS rejected here, regardless of ENFORCE, formalizing the existing
    // 3-layer employee-reload protection as schema law (this is a 4th,
    // client-side, pre-POST layer, not a replacement for the other three).
    // O(1) check (array length), never a full-DB scan.
    if (window.OctagonSchema) {
      const empCheck = window.OctagonSchema.validateCollection('employees', data.employees);
      if (!empCheck.ok) {
        window.OctagonSchema.logViolation('employees', empCheck);
        console.error('[saveData] BLOCKED — refusing to persist an empty employees array (protect:true).');
        return;
      }
    }
    const cachedDb = window.PentagonDB?.getCached?.() || window.PentagonDB?.cache || {};
    [
      'journals',
      'journal_entries',
      'account_moves',
      'account_payments',
      'account_partial_reconciles',
      'employee_advances',
      'payroll_periods',
      'employee_payroll_closings',
      'payroll_payments',
      'payroll_adjustments',
      'audit_log',
    ].forEach(collection => {
      if (Array.isArray(cachedDb[collection])) data[collection] = cachedDb[collection];
    });
    ['_schema_version', '_migrated_at', '_release_tag', '_release_tagged_at', '_lock_date'].forEach(key => {
      if (cachedDb[key] !== undefined) data[key] = cachedDb[key];
    });
    sanitizePersistedArabicText(data);
    const jsonPayload = JSON.stringify(data);

    // PRIMARY: Save to local file database.json — THIS is the source of truth
    fetch('/api/db', {
      method: 'POST',
      // T1.3: server now requires this header on every full-DB POST /api/db
      // (bounces naive/scripted probes that omit it) — this IS the real
      // full-sync write, so declare it.
      headers: { 'Content-Type': 'application/json', 'X-Octagon-Full-Sync': 'yes' },
      body: jsonPayload
    }).then(res => {
      if (res.ok) {
        _lastFileSaveOk = true;
        if (_serverDownWarned) {
          _serverDownWarned = false;
          showToast('✅ تم استعادة الاتصال بالسيرفر — البيانات محفوظة محلياً', 'success');
        }
      } else {
        _lastFileSaveOk = false;
        if (!_serverDownWarned) {
          _serverDownWarned = true;
          showToast('⚠️ فشل حفظ البيانات للملف المحلي! تأكد أن السيرفر يعمل (start.ps1)', 'error');
        }
      }
    }).catch(e => {
      _lastFileSaveOk = false;
      if (!_serverDownWarned) {
        _serverDownWarned = true;
        showToast('⚠️ السيرفر المحلي غير متصل! البيانات لن تُحفظ في الملف. شغّل start.ps1', 'error');
      }
      console.warn('Local DB save failed:', e);
    });

    // SECONDARY: localStorage as a backup cache only (not the source of truth)
    try {
      localStorage.setItem('octagon_payroll', jsonPayload);
      localStorage.setItem('site-employees', JSON.stringify(employees));
    } catch (e) { console.warn('localStorage backup save failed:', e); }
  } catch (e) { console.warn('Save error:', e); }
}

function getConfigInput(id) {
  return document.getElementById(id) || document.getElementById(`${id}Legacy`);
}

function getConfigNumber(id, fallback) {
  const el = getConfigInput(id);
  const n = parseFloat(el ? el.value : fallback);
  return Number.isFinite(n) ? n : fallback;
}

function setConfigValue(id, value) {
  const el = getConfigInput(id);
  if (el) el.value = value;
}

// One-time migration (2026-07-08): emp.prevAdvance's sign convention flipped from
// "positive = employee owes company" to "positive = company owes employee" (matching
// how users actually read the balance: موجب = تطلبنا، سالب = نطلبه). Negate every
// employee's stored value once so already-displayed balances stay factually the same
// after the flip; only the calculation formulas' sign handling changes going forward.
// Idempotent via omni.migrationsApplied, same pattern as the other ensureOmni() migrations.
// Returns true only the first time it actually flips data, so the caller knows
// whether a saveData() is needed to persist the migration.
function migrateEmployeePrevAdvanceSignConvention() {
  if (!omni || !Array.isArray(omni.migrationsApplied)) return false;
  if (omni.migrationsApplied.includes('prev_advance_sign_flip_v1')) return false;
  (employees || []).forEach(emp => {
    if (!emp) return;
    emp.prevAdvance = -(Number(emp.prevAdvance) || 0);
  });
  omni.migrationsApplied.push('prev_advance_sign_flip_v1');
  console.log('[OMNI] Migration applied: prev_advance_sign_flip_v1 — employee balance sign flipped (positive = company owes employee)');
  return true;
}

async function loadData() {
  let loadedFromFile = false;

  try {
    // PRIMARY: Load from local file database.json — the source of truth.
    // RETRY LOOP (boot-race fix): the desktop launcher (Octagon ERP.bat) opens the browser
    // only ~2s after starting the server; on cold starts Node+SQLite can need longer, so the
    // FIRST fetch used to land on a dead port → scary "loaded from browser memory" failure
    // toast on every fresh open. Retry briefly (up to ~7s total) before falling back.
    let res = null;
    for (let attempt = 0; attempt < 6; attempt++) {
      try { res = await fetch('/api/db'); } catch (e) { res = null; }
      if (res && res.ok) break;
      console.warn(`loadData: /api/db attempt ${attempt + 1} failed — retrying (server may still be starting)...`);
      await new Promise(r => setTimeout(r, 400 + attempt * 500));
    }
    if (res && res.ok) {
      const data = await res.json();
      console.debug('📡 Data received from server:', data);
      if (data && Array.isArray(data.employees)) {
        employees = data.employees;
        finance = data.finance || defaultFinanceState();
        omni = data.omni || defaultOmniState();
        ensureFinance();
        ensureOmni();
        data.omni = omni;
        if (window.PentagonDB) window.PentagonDB.cache = data;
        if (data.config) {
          setConfigValue('cfgMonth', data.config.month || 3);
          setConfigValue('cfgYear', data.config.year || 2026);
          setConfigValue('cfgSalary', data.config.nominalSalary || 500000);
          setConfigValue('cfgTransport', data.config.cfgTransport || 50000);
          setConfigValue('cfgFood', data.config.cfgFood || 50000);
        }
        if (data.selectedEmpIdx != null) selectedEmpIdx = data.selectedEmpIdx;
        if (data.reportEmpIdx != null) reportEmpIdx = data.reportEmpIdx;
        console.log('✅ Loaded from Local JSON Database (database.json). Count:', employees.length);
        loadedFromFile = true;
        _serverDownWarned = false;
        refreshAuthUserSwitcher();

        // Sync to localStorage as a backup cache
        try { localStorage.setItem('octagon_payroll', JSON.stringify(data)); } catch(e) {}
        return;
      } else {
        console.warn('⚠️ Server returned empty employees list');
      }
    } else {
      console.error('❌ Server error:', res ? res.status : 'no response after retries');
    }
  } catch (e) {
    console.warn('Failed to load from Local JSON Database, trying localStorage fallback...');
  }

  // FALLBACK: localStorage — only if server is unreachable
  if (!loadedFromFile) {
    console.warn('⚠️ Using localStorage fallback — data may not be up to date!');
    // Show a persistent warning after a short delay so the UI is ready
    setTimeout(() => {
      showToast('⚠️ تحذير: تم تحميل البيانات من ذاكرة المتصفح المؤقتة! شغّل start.ps1 لضمان حفظ البيانات في الملف المحلي', 'error');
    }, 1500);
  }

  try {
    const __oct = localStorage.getItem('octagon_payroll');
    const __pent = localStorage.getItem('pentagon_payroll');
    let raw = null;
    const __empCount = (s) => { try { return (JSON.parse(s).employees || []).length; } catch (e) { return 0; } };
    if (__oct && __empCount(__oct) > 0) raw = __oct;
    else if (__pent && __empCount(__pent) > 0) raw = __pent;
    else raw = __oct || __pent;
    if (!raw) {
      const alt = localStorage.getItem('site-employees');
      if (alt) {
        const parsed = JSON.parse(alt);
        if (Array.isArray(parsed)) employees = parsed;
      }
      const cfgRaw = localStorage.getItem('site-config');
      if (cfgRaw) {
        const sc = JSON.parse(cfgRaw);
        if (sc.month) setConfigValue('cfgMonth', sc.month);
        if (sc.year) setConfigValue('cfgYear', sc.year);
        if (sc.nominalSalary != null) setConfigValue('cfgSalary', sc.nominalSalary);
        if (sc.cfgTransport != null) setConfigValue('cfgTransport', sc.cfgTransport);
        if (sc.cfgFood != null) setConfigValue('cfgFood', sc.cfgFood);
      }
      ensureFinance();
      return;
    }
    const data = JSON.parse(raw);
    sanitizePersistedArabicText(data);
    if (data.employees && data.employees.length) {
      employees = data.employees;
    }
    finance = data.finance || defaultFinanceState();
    omni = data.omni || defaultOmniState();
    ensureFinance();
    ensureOmni();
    data.omni = omni;
    if (window.PentagonDB) window.PentagonDB.cache = data;
    if (data.config) {
      setConfigValue('cfgMonth', data.config.month || 3);
      setConfigValue('cfgYear', data.config.year || 2026);
      setConfigValue('cfgSalary', data.config.nominalSalary || 500000);
      setConfigValue('cfgTransport', data.config.cfgTransport || 50000);
      setConfigValue('cfgFood', data.config.cfgFood || 50000);
    }
    if (data.selectedEmpIdx != null) selectedEmpIdx = data.selectedEmpIdx;
    if (data.reportEmpIdx != null) reportEmpIdx = data.reportEmpIdx;
    refreshAuthUserSwitcher();
  } catch (e) { console.warn('Load error:', e); }
}

function resetAllData() {
  if (!confirm('هل أنت متأكد من مسح جميع البيانات؟')) return;
  employees = [];
  finance = defaultFinanceState();
  omni = defaultOmniState();
  selectedEmpIdx = 0;
  reportEmpIdx = 0;
  localStorage.removeItem('octagon_payroll');
  localStorage.removeItem('pentagon_payroll');
  localStorage.removeItem('site-employees');
  localStorage.removeItem('site-config');
  renderTimesheet();
  renderReport();
  refreshCalcEmpDropdown();
  setConfigValue('cfgSalary', 500000);
  setConfigValue('cfgTransport', 50000);
  setConfigValue('cfgFood', 50000);
  recalculate();
  validateDays();
  showToast('تم مسح جميع البيانات', 'info');
}

function clearAllDataOnStartup() {
  console.log('🧹 Clearing data for fresh auto-load...');
  localStorage.removeItem('octagon_payroll');
  localStorage.removeItem('pentagon_payroll');
  localStorage.removeItem('site-employees');
  localStorage.removeItem('site-config');
  employees = [];
  selectedEmpIdx = 0;
  reportEmpIdx = 0;
  // State is now clean
}

function clearCache() {
  if (!confirm('سيتم مسح الذاكرة المؤقتة بالكامل وإعادة التشغيل. هل أنت متأكد؟')) return;
  localStorage.clear();
  sessionStorage.clear();
  showToast('جاري تنظيف الذاكرة...', 'warning');
  setTimeout(() => window.location.reload(), 1000);
}

// ─── Toast Notifications ───
function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span> ${msg}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── Print Receipt ───
function printReceipt() {
  if (!window.lastCalcResult) {
    showToast('لا توجد بيانات للطباعة', 'error');
    return;
  }

  // Determine which employee to show (either from calc dropdown or report tabs depending on active page).
  // The calculator counts as "active" both on its own page AND when docked inside the active timesheet.
  const calcSectionEl = document.getElementById('pageCalculator');
  const isCalcPage = !!calcSectionEl && (
    calcSectionEl.classList.contains('page-active') ||
    (currentPage === 'timesheet' && calcSectionEl.classList.contains('ts-docked-calc'))
  );

  let empName = "حساب مباشر (بدون موظف)";
  let res = window.lastCalcResult;
  let cfg = getConfig();
  let periodLabel = `${MONTHS_AR[cfg.month - 1] || cfg.month} ${cfg.year}`;

  if (isCalcPage) {
    const selIdx = parseInt(document.getElementById('calcEmpSelect').value);
    if (selIdx >= 0 && employees[selIdx]) {
      const emp = employees[selIdx];
      empName = emp.name;
      cfg.nominalSalary = getEmployeeNominalSalary(emp, cfg.nominalSalary);
      const monthlyDocs = getTimesheetMonthlyDocs(emp, cfg);
      if (monthlyDocs.length) {
        res = getTimesheetOfficialRangeResult(emp, cfg, monthlyDocs);
        periodLabel = getTimesheetPeriodLabel(cfg);
      }
    }
  } else {
    // We are on report page
    if (employees[reportEmpIdx]) {
      const emp = employees[reportEmpIdx];
      empName = emp.name;
      cfg.nominalSalary = getEmployeeNominalSalary(emp, cfg.nominalSalary);
      const monthlyDocs = getTimesheetMonthlyDocs(emp, cfg);
      if (monthlyDocs.length) {
        res = getTimesheetOfficialRangeResult(emp, cfg, monthlyDocs);
        periodLabel = getTimesheetPeriodLabel(cfg);
      } else {
        res = calculateSalaryForEmployee(emp, cfg);
      }
    }
  }

  const html = `
  <html dir="rtl">
  <head>
    <meta charset="utf-8">
    <title>وصل الراتب - ${empName}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800&display=swap');
      * { margin:0; padding:0; box-sizing:border-box; font-family:'Tajawal',sans-serif; }
      body { padding:40px; direction:rtl; color: #1a1a2e; }
      .receipt-container { max-width: 800px; margin: 0 auto; border: 1px solid #e2e8f0; padding: 40px; border-radius: 12px; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 3px double #cbd5e1; padding-bottom: 20px; }
      .header h1 { font-size: 26px; font-weight: 800; margin-bottom: 8px; color: #0f172a; }
      .header p { color: #64748b; font-size: 15px; }
      .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 30px; }
      .info-item { display: flex; font-size: 14px; }
      .info-label { font-weight: 700; color: #475569; width: 120px; }
      .info-value { font-weight: 800; color: #0f172a; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
      th { background: #f8fafc; padding: 12px; text-align: right; border-bottom: 2px solid #cbd5e1; color: #475569; }
      td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
      .val-earn { color: #10b981; font-weight: 700; }
      .val-deduct { color: #ef4444; font-weight: 700; }
      .footer-row td { background: #0f172a; color: #fff; font-weight: 800; font-size: 18px; padding: 16px 12px; }
      .footer-row .val-final { color: #38bdf8; font-size: 24px; text-align: left; }
      .signatures { display: flex; justify-content: space-between; margin-top: 60px; }
      .sig-box { text-align: center; width: 200px; }
      .sig-line { border-top: 1px solid #94a3b8; margin-bottom: 8px; }
      .sig-text { font-size: 14px; color: #64748b; }
      .system-note { text-align: center; margin-top: 40px; font-size: 12px; color: #94a3b8; border-top: 1px dashed #cbd5e1; padding-top: 16px; }
      @media print {
        body { padding: 0; }
        .receipt-container { border: none; padding: 0; }
      }
    </style>
  </head>
  <body>
    <div class="receipt-container">
      <div class="header">
        <h1>وصل استلام راتب</h1>
        <p>${escapeHtml(periodLabel)}</p>
      </div>

      <div class="info-grid">
        <div class="info-item"><span class="info-label">اسم الموظف:</span> <span class="info-value">${empName}</span></div>
        <div class="info-item"><span class="info-label">الراتب الاسمي:</span> <span class="info-value">${formatNum(cfg.nominalSalary)} د.ع</span></div>
        <div class="info-item"><span class="info-label">أيام الحضور:</span> <span class="info-value">${res.attendanceDays || (isCalcPage ? document.getElementById('inpAttendance').value : 0)} يوم</span></div>
        <div class="info-item"><span class="info-label">أيام الغياب:</span> <span class="info-value">${res.absentDays || (isCalcPage ? document.getElementById('inpAbsent').value : 0)} يوم</span></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>التفاصيل</th>
            <th style="text-align: left;">المبلغ (د.ع)</th>
          </tr>
        </thead>
        <tbody>
          <tr><td>الراتب الأساسي (عن أيام الحضور)</td><td class="val-earn" style="text-align: left;">${formatNum(res.baseSalary)}</td></tr>
          <tr><td>المخصصات (نقل + إطعام)</td><td class="val-earn" style="text-align: left;">${formatNum(res.allowances)}</td></tr>
          <tr><td>تعويض الجمعة (${res.eligibleFridays || (isCalcPage ? document.getElementById('inpFridays').value : 0)} أيام)</td><td class="val-earn" style="text-align: left;">${formatNum(res.fridayCompensation)}</td></tr>
          <tr><td>العمل الإضافي (${formatNum(res.totalOvertime || (isCalcPage ? document.getElementById('inpOvertime').value : 0))} ساعة)</td><td class="val-earn" style="text-align: left;">${formatNum(res.totalOvertimeValue)}</td></tr>
          <tr><td>المكافآت</td><td class="val-earn" style="text-align: left;">${formatNum(res.bonus || (isCalcPage ? document.getElementById('inpBonus').value : 0))}</td></tr>

          <tr style="background:#fef2f2;"><td>خصم التأخيرات (${formatNum(res.totalLatenessHours || (isCalcPage ? document.getElementById('inpLateness').value : 0))} ساعة)</td><td class="val-deduct" style="text-align: left;">-${formatNum(res.latenessDeduction)}</td></tr>
          <tr style="background:#fef2f2;"><td>خصم الإجازات</td><td class="val-deduct" style="text-align: left;">-${formatNum(res.leaveDeduction)}</td></tr>
          <tr style="background:#fef2f2;"><td>خصم الغيابات</td><td class="val-deduct" style="text-align: left;">-${formatNum(res.absenceDeduction)}</td></tr>
          <tr style="background:#fef2f2;"><td>السلف (حالي + سابق)</td><td class="val-deduct" style="text-align: left;">-${formatNum(res.totalAdvance != null ? res.totalAdvance : ((parseFloat(document.getElementById('inpCurrentAdvance').value) || 0) + (parseFloat(document.getElementById('inpPreviousAdvance').value) || 0)))}</td></tr>
          <tr style="background:#fef2f2;"><td>العقوبات</td><td class="val-deduct" style="text-align: left;">-${formatNum(res.penalty || (isCalcPage ? document.getElementById('inpPenalty').value : 0))}</td></tr>
          <tr style="background:#fef2f2;"><td>الأضرار</td><td class="val-deduct" style="text-align: left;">-${formatNum(res.damage || (isCalcPage ? document.getElementById('inpDamage').value : 0))}</td></tr>
        </tbody>
        <tfoot>
          <tr class="footer-row">
            <td>الصافي المستحق للراتب</td>
            <td class="val-final">${formatNum(res.finalSalary)} <span style="font-size:16px;">د.ع</span></td>
          </tr>
        </tfoot>
      </table>

      <div class="signatures">
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-text">توقيع الموظف المشتلم</div>
        </div>
        <div class="sig-box">
          <div class="sig-line"></div>
          <div class="sig-text">توقيع المسؤول / المحاسب</div>
        </div>
      </div>

      <div class="system-note">
        طُبع هذا الوصل بواسطة نظام OCTAGON لإدارة الرواتب
      </div>
    </div>
    <script>
      setTimeout(() => { window.print(); }, 500);
    </script>
  </body>
  </html>
  `;

  // Open window and write html
  const w = window.open('', '_blank', 'width=850,height=800');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ─── Excel & CSV Upload / AI Smart Mapping ───
window.uploadedWorkbook = null;

async function uploadTimesheet() {
  const fileInput = document.getElementById('timesheetFile');
  const file = fileInput?.files?.[0];
  if (!file) { showToast('⚠️ اختر ملف أولاً', 'warning'); return; }

  try {
    await ensureOctagonLibrary('xlsx', 'XLSX', 'Excel import library unavailable');
  } catch (err) {
    console.error('XLSX library load failed:', err);
    showToast('تعذر تحميل مكتبة Excel. تأكد من الاتصال ثم جرب مرة أخرى.', 'error');
    return;
  }

  const nameArea = document.getElementById('selectedFileName');
  if (nameArea) {
    nameArea.textContent = `الملف المختار: ${file.name}`;
    document.getElementById('fileInfoArea').style.display = 'block';
  }

  const reader = new FileReader();
  if (file.name.endsWith('.csv')) {
    reader.onload = async (e) => {
      try {
        const text = e.target.result;
        const workbook = XLSX.read(text, { type: 'string' });
        window.uploadedWorkbook = workbook;
        await processExcelWorkbook(workbook);
      } catch (err) {
        console.error('CSV Parse Error:', err);
        showToast('❌ فشل قراءة ملف CSV', 'error');
      }
    };
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        window.uploadedWorkbook = workbook;
        await processExcelWorkbook(workbook);
      } catch (err) {
        console.error('Excel Parse Error:', err);
        showToast('❌ فشل قراءة ملف Excel', 'error');
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

async function processExcelWorkbook(workbook) {
  if (isMasterWorkbook(workbook)) return processMasterWorkbook(workbook);
  try {
    const dataRows = [];
    let totalAdvance = 0, totalPenalty = 0;

    workbook.SheetNames.forEach((sheetName) => {
      try {
        const worksheet = workbook.Sheets[sheetName];
        const sheetData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (sheetData.length < 2) return;
        const headers = (sheetData[0] || []).map(h => (h || '').toString().trim().toLowerCase());
        const findCol = (terms) => headers.findIndex(h => terms.some(t => h.includes(t)));
        const dateColIdx = findCol(['تاريخ', 'date']);
        const entryColIdx = findCol(['دخول', 'entry', 'in', 'حضور']);
        const exitColIdx = findCol(['خروج', 'exit', 'out', 'انصراف']);
        const advColIdx = findCol(['سلفة', 'سلفه', 'advance', 'سلف']);
        const penColIdx = findCol(['غرامة', 'غرامه', 'غرامات', 'penalty', 'استقطاع', 'خصم', 'خصومات']);
        const bonusColIdx = findCol(['مكافأة', 'مكافاه', 'مكافآت', 'مكافئات', 'bonus', 'حوافز', 'حافز']);
        const dmgColIdx = findCol(['ضرر', 'اضرار', 'damage', 'تلفيات']);

        function excelDateToJSDate(v) {
          if (v instanceof Date) return v;
          if (typeof v !== 'number') {
            const s = String(v).trim();
            let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
            if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
            m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
            if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
            return new Date(s);
          }
          return new Date(new Date(1899, 11, 30).getTime() + v * 86400000);
        }
        function formatDate(dObj) { try { const d = dObj instanceof Date ? dObj : excelDateToJSDate(dObj); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; } catch { return '-'; } }
        function formatTime(v) {
          if (!v && v !== 0) return '-';
          try {
            if (typeof v === 'number') {
              if (v > 1) return '-';
              const m = Math.round(v * 24 * 60);
              return `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
            }
            const match = String(v).match(/(\d{1,2}):(\d{2})/);
            return match ? `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}` : '-';
          } catch {
            return '-';
          }
        }

        for (let i = 1; i < sheetData.length; i++) {
          const r = sheetData[i];
          const dr = dateColIdx >= 0 ? r[dateColIdx] : null;
          if (dr) {
            const dobj = excelDateToJSDate(dr);
            const adv = advColIdx >= 0 ? r[advColIdx] : 0;
            const pen = penColIdx >= 0 ? r[penColIdx] : 0;
            const bon = bonusColIdx >= 0 ? r[bonusColIdx] : 0;
            const dmg = dmgColIdx >= 0 ? r[dmgColIdx] : 0;
            dataRows.push({
              name: sheetName.trim(),
              date: formatDate(dobj),
              entry: formatTime(entryColIdx >= 0 ? r[entryColIdx] : ''),
              exit: formatTime(exitColIdx >= 0 ? r[exitColIdx] : ''),
              advance: (parseFloat(adv) || 0),
              penalty: (parseFloat(pen) || 0),
              bonus: (parseFloat(bon) || 0),
              damage: (parseFloat(dmg) || 0),
              salary: 0
            });
            totalAdvance += (parseFloat(adv) || 0);
            totalPenalty += (parseFloat(pen) || 0);
          }
        }
      } catch (e) { console.warn('Sheet Error:', e); }
    });

    if (dataRows.length > 0) {
      const firstRow = dataRows.find(r => r.date.split('/').length === 3);
      if (firstRow) {
        const p = firstRow.date.split('/');
        document.getElementById('monthFilter').value = String(p[1]).padStart(2, '0');
      }

      window.tempImportedData = dataRows;
      document.getElementById('importedDataContainer').style.display = 'block';
      renderImportedTable(dataRows);
      showToast(`✅ تم قراءة ${dataRows.length} سجل محلياً. اضغط على زر "سحب الحقول بالذكاء الاصطناعي" لتفعيل الترتيب والمطابقة الذكية.`, 'info');
    }
  } catch (err) { console.error('Excel Process Error:', err); }
}

// ─── Master Reference Database Importer (قاعدة_موحدة.xlsx) ──────────────────

function isMasterWorkbook(workbook) {
  return workbook.SheetNames.some(n => n.includes('الموظفين') || n.includes('الحضور'));
}

async function processMasterWorkbook(workbook) {
  const cfg = getConfig();
  ensureFinance();

  function getSheet(keyword) {
    const name = workbook.SheetNames.find(n => n.includes(keyword));
    if (!name) return null;
    return XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
  }

  function excelDate(v) {
    if (!v && v !== 0) return null;
    if (v instanceof Date) return v;
    if (typeof v === 'number') return new Date(new Date(1899, 11, 30).getTime() + v * 86400000);
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
    if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
    return null;
  }

  function fmtDate(v) {
    const d = excelDate(v);
    if (!d || isNaN(d)) return '';
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  function isoDate(v) {
    const d = excelDate(v);
    if (!d || isNaN(d)) return '';
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  function fmtTime(v) {
    if (!v && v !== 0) return '';
    if (typeof v === 'number' && v <= 1) {
      const m = Math.round(v * 1440);
      return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    }
    const match = String(v).match(/(\d{1,2}):(\d{2})/);
    return match ? `${match[1].padStart(2,'0')}:${match[2]}` : '';
  }

  function sheetRows(data) {
    if (!data || data.length < 2) return [];
    const headers = data[0].map(h => String(h).trim());
    return data.slice(1)
      .filter(r => r.some(c => c !== ''))
      .map(r => {
        const obj = {};
        headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
        return obj;
      });
  }

  function findEmp(name) {
    const n = String(name || '').trim();
    if (!n) return null;
    const exact = employees.find(e => e.name === n);
    if (exact) return exact;
    return employees.find(e =>
      e.aliases && e.aliases.split(/[،,|\/]/).map(a => a.trim()).includes(n)
    );
  }

  const stats = { employees: 0, attendance: 0, advances: 0, fines: 0, transactions: 0, debts: 0 };

  // 1. Employees
  const empData = getSheet('الموظفين');
  if (empData) {
    sheetRows(empData).forEach(r => {
      const name = String(r['الاسم المعتمد'] || '').trim();
      if (!name) return;
      let emp = employees.find(e => e.name === name);
      if (!emp) { emp = { id: makeId('emp'), name, salary: 0, prevAdvance: 0, records: [] }; employees.push(emp); }
      if (!emp.id) emp.id = makeId('emp');
      const sal = asMoney(r['الراتب الاسمي (بدون أكل/نقل)'] || r['الراتب الاسمي'] || 0);
      if (sal > 0) emp.salary = sal;
      const prev = parseFloat(r['الرصيد/الدين السابق'] || r['الرصيد'] || 0) || 0;
      if (prev) emp.prevAdvance = prev;
      if (r['رقم الموظف']) emp.empNumber = String(r['رقم الموظف']).trim();
      if (r['الأسماء البديلة']) emp.aliases = String(r['الأسماء البديلة']).trim();
      if (r['ملاحظة التغيير']) emp.changeNote = String(r['ملاحظة التغيير']).trim();
      stats.employees++;
    });
  }

  // 2. Attendance
  const attData = getSheet('الحضور');
  if (attData) {
    sheetRows(attData).forEach(r => {
      const empName = String(r['الموظف'] || '').trim();
      if (!empName) return; // no name to match or create against — skip rather than persist a blank-name employee
      let emp = findEmp(empName);
      if (!emp) { emp = { id: makeId('emp'), name: empName, salary: cfg.nominalSalary || 0, prevAdvance: 0, records: [] }; employees.push(emp); }
      const d = excelDate(r['التاريخ']);
      if (!d || isNaN(d)) return;
      const day = d.getDate(), month = d.getMonth() + 1, year = d.getFullYear();
      let rec = emp.records.find(x => x.day === day && x.month === month && x.year === year);
      if (!rec) { rec = { day, month, year, date: fmtDate(r['التاريخ']), bonus: 0, damage: 0, advance: 0, penalty: 0 }; emp.records.push(rec); }
      const ci = fmtTime(r['دخول']), co = fmtTime(r['خروج']);
      if (ci) { rec.checkIn = ci; rec.checkInMin = parseTime(ci); }
      if (co) { rec.checkOut = co; rec.checkOutMin = parseTime(co); }
      if (r['غرامة يدوية']) rec.penalty = asMoney(r['غرامة يدوية']);
      if (r['سلفة يدوية']) rec.advance = asMoney(r['سلفة يدوية']);
      const st = String(r['الحالة'] || '').trim();
      if (st) rec.status = st;
      else if (!rec.status) rec.status = isFriday(year, month, day) ? (rec.checkInMin ? 'friday_work' : 'friday') : (rec.checkInMin ? 'normal' : 'absent');
      stats.attendance++;
    });
  }

  // 3. Advances
  const advData = getSheet('السلف');
  if (advData) {
    const advRows = sheetRows(advData);
    const monthsToReset = new Set();
    advRows.forEach(r => {
      const amount = asMoney(r['المبلغ']);
      if (!amount) return;
      const dateStr = isoDate(r['التاريخ']);
      const empName = String(r['الموظف'] || '').trim();
      const emp = findEmp(empName);
      if (emp && dateStr) {
        const parts = dateStr.split('-');
        if (parts.length === 3) {
          monthsToReset.add(`${emp.name}_${parts[0]}_${parseInt(parts[1])}`);
        }
      }
    });

    monthsToReset.forEach(key => {
      const parts = key.split('_');
      const empName = parts[0], yearStr = parts[1], monthStr = parts[2];
      const emp = findEmp(empName);
      if (emp) {
        const y = parseInt(yearStr), m = parseInt(monthStr);
        emp.records.forEach(rec => {
          if (rec.year === y && rec.month === m) {
            rec.advance = 0;
          }
        });
      }
    });

    advRows.forEach(r => {
      const amount = asMoney(r['المبلغ']);
      if (!amount) return;
      const dateStr = isoDate(r['التاريخ']);
      const empName = String(r['الموظف'] || '').trim();
      addFinanceTransaction({
        type: 'advance', direction: 'out', date: dateStr, amount,
        partyName: empName,
        description: String(r['البيان'] || 'سلفة موظف').trim(),
        sourceType: 'master_import',
        sourceId: `master_adv_${dateStr}_${empName}_${amount}`,
        departmentId: 'dept_payroll'
      }, { skipSave: true });
      stats.advances++;

      // Also write to employee daily records for timesheet/salary calculation
      const emp = findEmp(empName);
      if (emp) {
        const dateParts = dateStr.split('-');
        if (dateParts.length === 3) {
          const year = parseInt(dateParts[0]), month = parseInt(dateParts[1]), day = parseInt(dateParts[2]);
          let rec = emp.records.find(x => x.day === day && x.month === month && x.year === year);
          if (!rec) {
            rec = {
              day, month, year,
              date: fmtDate(r['التاريخ']) || `${String(day).padStart(2,'0')}/${String(month).padStart(2,'0')}/${year}`,
              bonus: 0, damage: 0, advance: 0, penalty: 0,
              status: isFriday(year, month, day) ? 'friday' : 'absent'
            };
            emp.records.push(rec);
          }
          rec.advance = (rec.advance || 0) + amount;
        }
      }
    });
  }

  // 4. Fines
  const fineData = getSheet('الغرامات');
  if (fineData) {
    sheetRows(fineData).forEach(r => {
      const empName = String(r['الموظف'] || '').trim();
      const dateStr = isoDate(r['التاريخ']);
      const note = String(r['الملاحظة'] || r['نوع الملاحظة'] || 'غرامة').trim();
      const sid = `master_fine_${dateStr}_${empName}_${note}`;
      if (!finance.transactions.some(tx => tx.sourceId === sid)) {
        finance.transactions.push({
          id: makeId('tx'), date: dateStr, createdAt: new Date().toISOString(),
          type: 'penalty', direction: 'out', sourceType: 'master_import', sourceId: sid,
          amount: 0, partyName: empName,
          description: `${note}${r['الخطورة'] ? ' — ' + String(r['الخطورة']).trim() : ''}`,
          departmentId: 'dept_payroll',
          categoryId: '', accountId: '', customerId: '', receiptNo: '', paidByName: '', paymentMethod: '', companyId: ''
        });
        stats.fines++;
      }
    });
  }

  // 5. Incoming/Outgoing transactions
  const txData = getSheet('الوارد والصادر');
  if (txData) {
    sheetRows(txData).forEach(r => {
      const amount = asMoney(r['مبلغ القاصة'] || r['مبلغ'] || 0);
      if (!amount) return;
      const dateStr = isoDate(r['التاريخ']);
      const dirRaw = String(r['الاتجاه'] || '');
      const dir = dirRaw.includes('وارد') || dirRaw.toLowerCase().includes('in') ? 'in' : 'out';
      const sid = String(r['ID'] || `master_tx_${dateStr}_${amount}_${dir}_${String(r['الجهة']||'')}`).trim();
      addFinanceTransaction({
        type: dir === 'in' ? 'income' : 'expense', direction: dir,
        date: dateStr, amount,
        partyName: String(r['الجهة'] || '').trim(),
        description: String(r['البيان الموحد'] || r['البيان'] || '').trim(),
        // 'مبلغ القاصة' = physical cashbox amount: must be sourceType 'cashbox'
        // so it's counted in getCashBalance()/getCashboxTotals() — otherwise it
        // moves the P&L totals but never shows up on the القاصة page, and the
        // till count silently stops matching the dashboard after every import.
        sourceType: 'cashbox', sourceId: sid,
        departmentId: 'dept_workshop'
      }, { skipSave: true });
      stats.transactions++;
    });
  }

  // 6. Debts → finance.parties
  const debtData = getSheet('الديون');
  if (debtData) {
    sheetRows(debtData).forEach(r => {
      const name = String(r['الاسم'] || '').trim();
      if (!name) return;
      const amount = asMoney(r['المبلغ'] || 0);
      const paid = asMoney(r['المسدد'] || 0);
      let party = finance.parties.find(p => p.name === name);
      if (!party) { party = { id: makeId('party'), type: 'person', name }; finance.parties.push(party); }
      party.debtType = String(r['نوع الدين'] || '').trim();
      party.debtAmount = amount;
      party.debtPaid = paid;
      party.debtRemaining = asMoney(r['المتبقي'] || (amount - paid));
      party.debtDirection = String(r['الاتجاه'] || '').trim();
      stats.debts++;
    });
  }

  // 7. Food → finance.transactions
  const foodData = getSheet('الطعام');
  if (foodData) {
    sheetRows(foodData).forEach(r => {
      const amount = asMoney(r['المبلغ'] || r['قيمة الطعام'] || r['الكلفة'] || 0);
      if (!amount) return;
      const dateStr = isoDate(r['التاريخ']);
      const empName = String(r['الموظف'] || r['الاسم'] || '').trim();
      addFinanceTransaction({
        type: 'expense', direction: 'out', date: dateStr, amount,
        partyName: empName,
        description: String(r['البيان'] || 'وجبة موظف').trim(),
        sourceType: 'master_import',
        sourceId: `master_food_${dateStr}_${empName}_${amount}`,
        categoryId: 'food', departmentId: 'dept_payroll'
      }, { skipSave: true });
    });
  }

  saveData();

  const parts = [
    stats.employees    && `${stats.employees} موظف`,
    stats.attendance   && `${stats.attendance} سجل حضور`,
    stats.advances     && `${stats.advances} سلفة`,
    stats.fines        && `${stats.fines} غرامة`,
    stats.transactions && `${stats.transactions} حركة مالية`,
    stats.debts        && `${stats.debts} دين`,
  ].filter(Boolean);
  showToast(`✅ القاعدة الموحدة: ${parts.join(' — ')}`, 'success');
}

// ─────────────────────────────────────────────────────────────────────────────

async function smartMapImportFields() {
  const workbook = window.uploadedWorkbook;
  if (!workbook) return showToast('الرجاء رفع ملف أولاً قبل سحب الحقول', 'warning');

  const btn = document.getElementById('btnSmartFieldMap') || document.querySelector('.smart-mapping-actions button');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري سحب الحقول بالذكاء الاصطناعي...';
    btn.disabled = true;
  }

  try {
    // Security hardening 2026-07-05: Gemini key moved to server .env — calls go through /api/ai/gemini.
    // رسالة المستخدم للذكاء الاصطناعي للتحكم بالبيانات المستوردة (اختيارية)
    const aiInstructions = (document.getElementById('importAiInstructions')?.value || '').trim();

    const sheetsSample = {};
    workbook.SheetNames.forEach(sheetName => {
      const sheet = workbook.Sheets[sheetName];
      const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (sheetData.length > 0) {
        sheetsSample[sheetName] = sheetData.slice(0, 4);
      }
    });

    const promptText = `
أنت خبير في هيكلة وتحليل بيانات حضور الموظفين بالذكاء الاصطناعي.
تلقينا ملف حضور يحتوي على الجداول التالية (أول سطر هو العناوين، تليها عينات من السطور الأولى):
${JSON.stringify(sheetsSample, null, 2)}
${aiInstructions ? `\nتعليمات خاصة من المستخدم يجب احترامها عند تحديد الأعمدة وتفسير البيانات:\n"${aiInstructions}"\n` : ''}
المطلوب:
1. قم بتحليل العناوين وعينة البيانات لكل جدول بدقة.
2. حدد مؤشرات الأعمدة (0-indexed) لكل من الحقول التالية:
   - name: اسم الموظف (إذا لم يكن هناك عمود للاسم، استخدم القيمة -1 وسنستخدم اسم الجدول/الورقة كاسم للموظف).
   - date: التاريخ.
   - entry: وقت الحضور/الدخول.
   - exit: وقت الانصراف/الخروج.
   - salary: الراتب الاسمي (إن وجد، وإلا -1).
   - advance: السلف (إن وجد، وإلا -1).
   - penalty: الخصومات/الغرامات (إن وجد، وإلا -1).
   - bonus: المكافآت (إن وجد، وإلا -1).
   - damage: الأضرار والجزاءات (إن وجد، وإلا -1).

3. رعاية أوقات الدخول والخروج بذكاء:
   - قد تكون أوقات الدخول والخروج في عمودين منفصلين (مثلاً عمود دخول وعمود خروج). في هذه الحالة ضع "timeFormatType": "separate".
   - قد تكون في عمود واحد مدمم (مثلاً: "09:00 - 18:00" أو "08:30 / 17:30"). في هذه الحالة، عين كلا الحقلين entryColumnIndex و exitColumnIndex على نفس مؤشر هذا العمود، وضع "timeFormatType": "combined".
   - قد تكون بصمات متعددة مدمجة في خلية واحدة مفصولة بفاصلة أو مسافة (مثلاً: "09:02, 13:00, 14:02, 18:01" أو "09:02 18:01"). في هذه الحالة، عين كلا الحقلين على مؤشر هذا العمود، وضع "timeFormatType": "multiple_logs".

أرجع كود JSON صالح فقط بدون أي code-fence أو شرح إضافي بالصيغة التالية تماماً:
{
  "sheets": {
    "اسم_الجدول": {
      "nameColumnIndex": -1,
      "dateColumnIndex": 0,
      "entryColumnIndex": 1,
      "exitColumnIndex": 2,
      "salaryColumnIndex": -1,
      "advanceColumnIndex": -1,
      "penaltyColumnIndex": -1,
      "bonusColumnIndex": -1,
      "damageColumnIndex": -1,
      "timeFormatType": "separate"
    }
  }
}
`;

    const response = await fetch("/api/ai/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-flash-latest",
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    text = text.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();

    const parsed = JSON.parse(text);
    if (!parsed || !parsed.sheets) throw new Error("صيغة الاستجابة من الذكاء الاصطناعي غير صحيحة");

    const dataRows = [];
    const mappingPreviews = [];

    workbook.SheetNames.forEach(sheetName => {
      const mapping = parsed.sheets[sheetName];
      if (!mapping) return;

      const sheet = workbook.Sheets[sheetName];
      const sheetData = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      if (sheetData.length < 2) return;

      mappingPreviews.push({ sheetName, mapping });

      function excelDateToJSDate(v) {
        if (v instanceof Date) return v;
        if (typeof v !== 'number') {
          const s = String(v).trim();
          let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
          if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
          m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
          if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
          return new Date(s);
        }
        return new Date(new Date(1899, 11, 30).getTime() + v * 86400000);
      }
      function formatDate(dObj) {
        try {
          const d = dObj instanceof Date ? dObj : excelDateToJSDate(dObj);
          return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
        } catch {
          return '-';
        }
      }

      function cleanAndExtractTimes(row, map) {
        let entryTime = '';
        let exitTime = '';

        const type = map.timeFormatType;
        const entryIdx = map.entryColumnIndex;
        const exitIdx = map.exitColumnIndex;

        function formatTimeValue(v) {
          if (!v && v !== 0) return '';
          if (typeof v === 'number' && v <= 1) {
            const mins = Math.round(v * 24 * 60);
            return `${String(Math.floor(mins / 60) % 24).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
          }
          const match = String(v).match(/(\d{1,2}):(\d{2})/);
          return match ? `${match[1].padStart(2, '0')}:${match[2].padStart(2, '0')}` : '';
        }

        if (type === 'separate') {
          entryTime = formatTimeValue(entryIdx >= 0 ? row[entryIdx] : '');
          exitTime = formatTimeValue(exitIdx >= 0 ? row[exitIdx] : '');
        } else if (type === 'combined') {
          const val = String(entryIdx >= 0 ? row[entryIdx] : '').trim();
          const parts = val.split(/[-/]/);
          if (parts.length >= 2) {
            entryTime = formatTimeValue(parts[0].trim());
            exitTime = formatTimeValue(parts[1].trim());
          } else {
            entryTime = formatTimeValue(val);
          }
        } else if (type === 'multiple_logs') {
          const val = String(entryIdx >= 0 ? row[entryIdx] : '').trim();
          const logs = val.split(/[\,\s;]+/).map(l => l.trim()).filter(l => l.match(/\d{1,2}:\d{2}/));
          if (logs.length > 0) {
            entryTime = formatTimeValue(logs[0]);
            exitTime = formatTimeValue(logs[logs.length - 1]);
          }
        }
        return { entryTime, exitTime };
      }

      for (let i = 1; i < sheetData.length; i++) {
        const row = sheetData[i];
        const rawDate = mapping.dateColumnIndex >= 0 ? row[mapping.dateColumnIndex] : '';
        if (!rawDate) continue;

        const dateObj = excelDateToJSDate(rawDate);
        const date = Number.isNaN(dateObj.getTime()) ? String(rawDate) : formatDate(dateObj);

        const times = cleanAndExtractTimes(row, mapping);
        const name = mapping.nameColumnIndex >= 0 ? String(row[mapping.nameColumnIndex] || sheetName).trim() : sheetName.trim();

        dataRows.push({
          name,
          date,
          entry: times.entryTime,
          exit: times.exitTime,
          advance: asMoney(mapping.advanceColumnIndex >= 0 ? row[mapping.advanceColumnIndex] : 0),
          penalty: asMoney(mapping.penaltyColumnIndex >= 0 ? row[mapping.penaltyColumnIndex] : 0),
          bonus: asMoney(mapping.bonusColumnIndex >= 0 ? row[mapping.bonusColumnIndex] : 0),
          damage: asMoney(mapping.damageColumnIndex >= 0 ? row[mapping.damageColumnIndex] : 0),
          salary: asMoney(mapping.salaryColumnIndex >= 0 ? row[mapping.salaryColumnIndex] : 0)
        });
      }
    });

    // إذا كتب المستخدم رسالة، طبّقها على السجلات المستخرجة للتحكم بالبيانات
    let finalRows = dataRows;
    let refineMessage = '';
    if (aiInstructions && dataRows.length > 0) {
      const refined = await refineImportedRowsWithAI(dataRows, aiInstructions, '');
      finalRows = (refined && Array.isArray(refined.rows) && refined.rows.length) ? refined.rows : dataRows;
      refineMessage = (refined && refined.message) ? refined.message : '';
    }

    const preview = document.getElementById('smartMappingPreview');
    if (preview) {
      preview.style.display = 'block';
      preview.innerHTML = `<h3>معاينة المطابقة الذكية بالذكاء الاصطناعي (Gemini)</h3>
        ${mappingPreviews.map(p => `<div><b>${escapeHtml(p.sheetName)}</b>:
          التاريخ → عمود ${p.mapping.dateColumnIndex} |
          الحساب → نمط ${escapeHtml(p.mapping.timeFormatType)} |
          السلفة → ${p.mapping.advanceColumnIndex >= 0 ? 'عمود ' + p.mapping.advanceColumnIndex : 'غير موجود'} |
          الخصم → ${p.mapping.penaltyColumnIndex >= 0 ? 'عمود ' + p.mapping.penaltyColumnIndex : 'غير موجود'}
        </div>`).join('')}
        <p>تم استخراج ${finalRows.length} سجل حضور وسلف بنجاح. راجع الجدول أدناه ثم اضغط حفظ.</p>
        ${refineMessage ? `<div style="margin-top:10px; padding:10px 14px; background:rgba(168,85,247,0.08); border:1px solid rgba(168,85,247,0.25); border-radius:10px; color:var(--text-light);"><i class="fa-solid fa-robot" style="color:#a855f7;"></i> ${escapeHtml(refineMessage)}</div>` : ''}`;
    }

    if (finalRows.length > 0) {
      window.tempImportedData = finalRows;
      document.getElementById('importedDataContainer').style.display = 'block';
      renderImportedTable(finalRows);
      showToast(aiInstructions
        ? '✅ تمت المطابقة وتطبيق رسالتك على البيانات المستوردة بنجاح!'
        : '✅ تمت المطابقة وترتيب أوقات الدخول والخروج بالذكاء الاصطناعي بنجاح!', 'success');
    } else {
      showToast('⚠️ لم يتم العثور على سجلات صالحة في الملف المرفوع', 'warning');
    }
  } catch (err) {
    console.error('AI Smart Mapping Error:', err);
    showToast('❌ فشل استرداد البيانات بالذكاء الاصطناعي: ' + err.message, 'error');
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml;
      btn.disabled = false;
    }
  }
}

// تطبيق رسالة المستخدم على السجلات المستوردة عبر الذكاء الاصطناعي للتحكم بالبيانات المسترّدة
async function refineImportedRowsWithAI(dataRows, instructions, apiKey) {
  // Security hardening 2026-07-05: the apiKey parameter is IGNORED — the call
  // goes through the server proxy (/api/ai/gemini) which holds the key in .env.
  try {
    const promptText = `
أنت مساعد ذكي لتنظيف وضبط بيانات الحضور والسلف المستوردة من ملف المستخدم.
فيما يلي السجلات التي تم استخراجها (مصفوفة JSON):
${JSON.stringify(dataRows)}

تعليمات المستخدم التي يجب تطبيقها بدقة على هذه السجلات:
"${instructions}"

المطلوب:
1. طبّق التعليمات على السجلات: يمكنك تعديل القيم، أو تصفية/حذف سجلات، أو ضبط الحالة — دون اختراع بيانات أو تواريخ غير موجودة.
2. حافظ تماماً على نفس أسماء الحقول والصيغ لكل سجل:
   - name: نص اسم الموظف.
   - date: التاريخ بصيغة DD/MM/YYYY.
   - entry و exit: الوقت بصيغة "HH:MM" (24 ساعة) أو نص فارغ "".
   - advance و penalty و bonus و damage و salary: أرقام فقط (وليست نصوصاً).
3. status (اختياري) يجب أن يكون واحداً فقط من: normal, absent, leave, friday, friday_work, late_excused, night_shift, early_excused, hourly_excused, external_mission.
4. أرجع كائن JSON صالحاً فقط بالشكل التالي تماماً، بدون أي شرح أو علامات code-fence خارج الكائن:
{
  "message": "نص قصير بالعربية يشرح ماذا فعلت بالبيانات",
  "rows": [ { "name": "...", "date": "DD/MM/YYYY", "entry": "HH:MM", "exit": "HH:MM", "advance": 0, "penalty": 0, "bonus": 0, "damage": 0, "salary": 0 } ]
}
`;

    const response = await fetch("/api/ai/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-flash-latest",
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);
    if (!parsed || !Array.isArray(parsed.rows)) throw new Error('صيغة الاستجابة غير صحيحة');

    const allowedStatus = ['normal','absent','leave','friday','friday_work','late_excused','night_shift','early_excused','hourly_excused','external_mission'];
    const cleanRows = parsed.rows.map(r => {
      const row = {
        name: String(r.name ?? '').trim(),
        date: String(r.date ?? '').trim(),
        entry: String(r.entry ?? '').trim(),
        exit: String(r.exit ?? '').trim(),
        advance: asMoney(r.advance),
        penalty: asMoney(r.penalty),
        bonus: asMoney(r.bonus),
        damage: asMoney(r.damage),
        salary: asMoney(r.salary)
      };
      if (r.status && allowedStatus.includes(String(r.status).trim())) row.status = String(r.status).trim();
      return row;
    }).filter(r => r.date);

    return { rows: cleanRows.length ? cleanRows : dataRows, message: parsed.message || '' };
  } catch (err) {
    console.error('AI Import Refine Error:', err);
    showToast('⚠️ تعذّر تطبيق الرسالة على البيانات بالذكاء الاصطناعي، تم الإبقاء على البيانات كما هي: ' + err.message, 'warning');
    return { rows: dataRows, message: '' };
  }
}

function saveImportedData() {
  if (!window.tempImportedData || window.tempImportedData.length === 0) {
    showToast('لا توجد بيانات للحفظ', 'warning');
    return;
  }
  const dataRows = window.tempImportedData;
  const cfg = getConfig();

  dataRows.forEach(row => {
    let emp = employees.find(e => e.name === row.name);
    if (!emp) { emp = { name: row.name, salary: row.salary || cfg.nominalSalary, prevAdvance: 0, records: [] }; employees.push(emp); }
    if (row.salary && !emp.salary) emp.salary = row.salary;
    const parts = row.date.split('/');
    if (parts.length === 3) {
      const d = parseInt(parts[0]), m = parseInt(parts[1]), y = parseInt(parts[2]);
      let rec = emp.records.find(r => r.day === d && r.month === m && r.year === y);
      if (!rec) { rec = { day: d, month: m, year: y, date: row.date, bonus: 0, damage: 0 }; emp.records.push(rec); }
      rec.checkIn = row.entry; rec.checkOut = row.exit;
      rec.checkInMin = parseTime(row.entry); rec.checkOutMin = parseTime(row.exit);
      rec.advance = row.advance; rec.penalty = row.penalty; rec.bonus = row.bonus || rec.bonus || 0; rec.damage = row.damage || rec.damage || 0;
      // Use AI provided status if it exists, otherwise calculate
      rec.status = row.status
        ? row.status
        : (isFriday(y, m, d)
            ? (rec.checkInMin ? 'friday_work' : 'friday')
            : (rec.checkInMin ? 'normal' : 'absent'));
    }
  });

  // Auto-fill absences for all imported employees
  employees.forEach(emp => autoFillMissingDaysForEmployee(emp, cfg.year, cfg.month));

  refreshCalcEmpDropdown();
  saveData();

  showToast(`✅ تم الحفظ والتحويل للتايم شيت الذكي بنجاح`, 'success');
  window.tempImportedData = [];
  document.getElementById('importedDataContainer').style.display = 'none';
  switchPage('timesheet');
}

async function processTimesheetWithAI() {
  const emp = employees[selectedEmpIdx];
  if (!emp || !emp.records || emp.records.length === 0) return;

  const customPrompt = document.getElementById('aiCustomPrompt').value.trim();
  if (!customPrompt) {
    showToast('الرجاء كتابة الأمر أولاً', 'warning');
    return;
  }

  const btn = document.getElementById('btnProcessTimesheetAI');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري التنفيذ...';
  btn.disabled = true;

  try {
    // Security hardening 2026-07-05: Gemini key moved to server .env — calls go through /api/ai/gemini.
    // 2026-07-08 fix: scope the AI to the months actually DISPLAYED in the filter, not the whole
    // record history. Otherwise the model edits whichever month has data (e.g. March) even when the
    // user is viewing April/May/June. The assistant must operate on what's on screen.
    const cfg = getConfig();
    const selectedMonths = getTimesheetSelectedMonths(cfg.year);
    const scopedRecords = emp.records.filter(r =>
      Number(r.year) === Number(cfg.year) && selectedMonths.includes(Number(r.month))
    );

    if (scopedRecords.length === 0) {
      const monthLabels = selectedMonths.map(m => MONTHS_AR[m - 1]).join('، ');
      showToast(`لا توجد سجلات في الأشهر المعروضة (${monthLabels} ${cfg.year}) لتطبيق الأمر عليها`, 'warning');
      return;
    }

    const monthLabels = selectedMonths.map(m => MONTHS_AR[m - 1]).join('، ');
    const simplifiedRecords = scopedRecords.map(r => ({
      date: r.date,
      checkIn: r.checkIn || '',
      checkOut: r.checkOut || '',
      status: r.status,
      bonus: r.bonus || 0,
      damage: r.damage || 0,
      penalty: r.penalty || 0,
      advance: r.advance || 0
    }));

    const promptText = `
أنت مساعد ذكي لنظام الرواتب.
هذا سجل حضور الموظف: ${emp.name}
النطاق المعروض حالياً والمطلوب العمل عليه حصراً: الأشهر (${monthLabels}) من سنة ${cfg.year}.
الأمر المطلوب منك تنفيذه بدقة على هذه السجلات فقط:
"${customPrompt}"

مهم جداً: اعمل حصراً على السجلات المعطاة أدناه (وهي تخص الأشهر المعروضة فقط). لا تشر إلى أي شهر آخر ولا تعدّل أي تاريخ خارج هذه القائمة.

البيانات الحالية للموظف (الأشهر المعروضة فقط):
${JSON.stringify(simplifiedRecords)}

المطلوب:
1. قم بتطبيق الأمر المعطى على البيانات بدقة.
2. أرجع كائن JSON (Object) يحتوي على مفتاحين فقط:
   - "message": نص قصير ولطيف باللغة العربية يشرح ماذا فعلت بالضبط وما هي التعديلات التي قمت بها (للرد على المستخدم كأنك مساعد شخصي).
   - "records": نفس مصفوفة السجلات بعد تطبيق التعديلات عليها.
3. يجب أن يحتوي حقل status على إحدى القيم التالية فقط (10 حالات لا غير):
   - 'normal' (دوام عادي)
   - 'absent' (غياب)
   - 'leave' (إجازة بدون راتب)
   - 'friday' (عطلة مدفوعة بدون دوام — جمعة أو عطلة رسمية)
   - 'friday_work' (دوام يوم الجمعة بأجر مضاعف)
   - 'late_excused' (متأخر معذور)
   - 'night_shift' (شفت ليلي — يمنح اليوم التالي hourly_excused تلقائياً)
   - 'early_excused' (مغادر مبكر معذور — لا يخصم منه المغادرة المبكرة)
   - 'hourly_excused' (معفى بالساعات — يُحسب أجره على ساعات الحضور الفعلية فقط، بلا إضافي وبلا غرامات)
   - 'external_mission' (مهمة خارجية — يوم حضور كامل + بدل، بلا غرامة تأخير/مغادرة)
   ممنوع إرجاع أي قيمة أخرى مثل permission أو holiday.
4. حافظ على نفس صيغة الوقت "HH:MM" (24 ساعة) في checkIn و checkOut. لا تغيرها إلى صيغ أخرى.
5. لا تخترع تواريخ جديدة أو تحذف سجلات. عدّل فقط الموجود.

الرد يجب أن يكون كائن JSON صالح فقط (يبدأ بـ { وينتهي بـ }) بدون أي شرح أو علامات code-fence خارج الكائن.
`;

    const response = await fetch("/api/ai/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-flash-latest",
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);

    if (parsed && parsed.records && Array.isArray(parsed.records)) {
      // Only accept edits to dates inside the displayed scope, so a stray date from the
      // model can't leak back into a month the user isn't looking at.
      const scopedDates = new Set(scopedRecords.map(r => r.date));
      parsed.records.forEach(p => {
        if (!scopedDates.has(p.date)) return;
        const rec = emp.records.find(r => r.date === p.date);
        if (rec) {
          const changedFields = [];
          ['checkIn', 'checkOut', 'status', 'bonus', 'damage', 'penalty', 'advance'].forEach(field => {
            if (setRecordFieldFromAI(rec, field, p[field])) changedFields.push(field);
          });

          rec.checkInMin = parseTime(rec.checkIn);
          rec.checkOutMin = parseTime(rec.checkOut);
          markAiFields(rec, changedFields);
        }
      });
      // Re-apply deterministic payroll rules for every displayed month, not just the primary one.
      selectedMonths.forEach(m => applySystemPayrollRules(emp, cfg.year, m, true));

      saveData();
      renderTimesheet();

      // Show AI Chat Response
      const responseBox = document.getElementById('aiResponseBox');
      const responseText = document.getElementById('aiResponseText');
      if (responseBox && responseText) {
        responseBox.style.display = 'block';
        responseText.textContent = parsed.message || 'تم تنفيذ التعديل بنجاح.';
      }

      document.getElementById('aiCustomPrompt').value = '';
    } else {
      throw new Error('الرد لم يكن بصيغة صحيحة من الذكاء الاصطناعي');
    }
  } catch(err) {
    console.error('AI Error:', err);
    showToast('❌ فشل في تنفيذ الأمر: ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

// Local rule engine — no AI. Auto-classifies days based on check-in/out
// and applies night-shift carry-over + Friday eligibility deterministically.
function applyRulesNoAI() {
  if (selectedEmpIdx < 0 || selectedEmpIdx >= employees.length) {
    showToast('الرجاء اختيار موظف أولاً', 'error');
    return;
  }
  const emp = employees[selectedEmpIdx];
  const cfg = getConfig();
  const monthRecs = recordsForMonth(emp, cfg.year, cfg.month);

  let touched = 0;
  monthRecs.forEach(rec => {
    const isFri = isFriday(cfg.year, cfg.month, rec.day);
    const hasCheckIn = rec.checkInMin != null;
    const current = normalizeStatus(rec.status);
    // Don't overwrite manager-set states
    const protectedStates = ['leave', 'absent', 'late_excused', 'night_shift', 'early_excused', 'hourly_excused', 'external_mission'];
    if (protectedStates.includes(current)) return;

    let target;
    if (isFri) target = hasCheckIn ? 'friday_work' : 'friday';
    else target = hasCheckIn ? 'normal' : 'absent';

    if (current !== target) { rec.status = target; touched++; }
  });

  // Carry-over rules (night shift → next day late_excused) + Friday week-violation
  const sysRes = applySystemPayrollRules(emp, cfg.year, cfg.month, false);
  touched += sysRes.changed || 0;

  saveData();
  renderTimesheet();
  showToast(`⚙️ تم تطبيق القوانين على ${touched} سجل${sysRes.notes?.length ? ' — ' + sysRes.notes.join(' / ') : ''}`, 'success');
}

async function applyComplexRulesWithAI() {
  if (selectedEmpIdx < 0 || selectedEmpIdx >= employees.length) {
    showToast('الرجاء اختيار موظف أولاً', 'error');
    return;
  }
  const emp = employees[selectedEmpIdx];
  const cfg = getConfig();

  const simplifiedRecords = emp.records.filter(r => r.month === cfg.month && r.year === cfg.year).map(r => ({
    date: r.date,
    day: r.day,
    checkIn: r.checkIn,
    checkOut: r.checkOut,
    status: r.status,
    bonus: r.bonus || 0,
    damage: r.damage || 0,
    penalty: r.penalty || 0,
    advance: r.advance || 0
  }));

  const btn = document.getElementById('btnApplyRulesAI');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> جاري تطبيق القوانين...';
  btn.disabled = true;

  try {
    // Security hardening 2026-07-05: Gemini key moved to server .env — calls go through /api/ai/gemini.
    const promptText = `
أنت المساعد الذكي الخاص بنظام OCTAGON ERP للرواتب. مهمتك مراجعة هذا السجل الشهري بدقة وتطبيق قوانين الرواتب المعقدة التالية:

### القوانين التي يجب فحصها وتطبيقها:
1. **الدوام الليلي (Night Shift):** إذا كان الموظف لديه شفت ليلي 'night_shift' في يوم معين، فإن اليوم الذي يليه مباشرة يُمنح له "سماحية تأخير". كما أن يوم الدوام الليلي يُحسب ابتداءً من وقت الحضور، وبعد أن يغطي 9 ساعات كاملة، يُحسب الباقي كـ Overtime.
2. **العمل يوم الجمعة (Friday Work):** إذا كان الموظف لديه يوم عمل 'friday_work' في يوم الجمعة، يتم تحويل حالته إلى 'normal' (دوام عادي) وإلغاء حافز الجمعة **فقط إذا** كان الموظف لديه أي غياب ('absent') أو إجازة ('leave') خلال أيام الأسبوع التي تسبق تلك الجمعة. وإلا يبقى دوام جمعة بإضافيات جمعة.
3. **مغادر مبكر معذور (Early Excused):** إذا كانت حالة اليوم 'early_excused'، يتم احتساب اليوم كحضور كامل ولا يتم خصم أي مبالغ للمغادرة المبكرة، مع إبقاء التأخير أو الإضافي إن وُجد.
4. **غرامة الجمع التلقائية:** كل 6 أيام غياب أو إجازة في هذا الشهر تُسقط جمعة واحدة من المستحقات. (قم بإضافة ملاحظة بذلك أو تعديل الغرامات).

هذا سجل الموظف "${emp.name}":
${JSON.stringify(simplifiedRecords)}

المطلوب:
1. قم بتحليل وتطبيق القوانين المذكورة أعلاه بدقة على السجلات وتعديل الحالات (status) أو الغرامات (penalty) بناءً عليها.
2. أرجع كائن JSON يحتوي على مفتاحين:
   - "message": نص باللغة العربية يشرح بالتفصيل الممل ما هي القوانين التي تم تفعيلها، أسابيع الجمعة التي تغيرت، أي غرامات طُبقت، وما تأثير الشفت الليلي (مع ذكر التواريخ). إذا لم تطبق أي قواعد، اذكر أن الأمور مطابقة ومثالية.
   - "records": نفس مصفوفة السجلات بعد تطبيق التعديلات عليها لتحديث واجهة المستخدم بها.
3. الرد يجب أن يكون كود JSON صالح فقط (يبدأ بـ { وينتهي بـ }) بدون أي كلمات إضافية.
`;

    const response = await fetch("/api/ai/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gemini-flash-latest",
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.1 }
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    let text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);

    if (parsed && parsed.records && Array.isArray(parsed.records)) {
      parsed.records.forEach(p => {
        const rec = emp.records.find(r => r.date === p.date);
        if (rec) {
          const changedFields = [];
          ['status', 'bonus', 'damage', 'penalty', 'advance'].forEach(field => {
            if (setRecordFieldFromAI(rec, field, p[field])) changedFields.push(field);
          });
          markAiFields(rec, changedFields);
        }
      });
      applySystemPayrollRules(emp, cfg.year, cfg.month, true);

      saveData();
      renderTimesheet();

      const responseBox = document.getElementById('aiResponseBox');
      const responseText = document.getElementById('aiResponseText');
      if (responseBox && responseText) {
        responseBox.style.display = 'block';
        responseText.innerHTML = (parsed.message || 'تم فحص القوانين وتطبيقها.').replace(/\\n/g, '<br>');
      }

      showToast('✨ تم تطبيق القوانين الشاملة بنجاح', 'success');
    } else {
      throw new Error('الرد لم يكن بصيغة صحيحة');
    }
  } catch(err) {
    console.error('AI Error:', err);
    showToast('❌ فشل في تنفيذ القوانين: ' + err.message, 'error');
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}


// ─── Sync imported HTML table → employee.records (Excel → table → array chain) ───

function renderImportedTable(rows) {
  const tbody = document.getElementById('importedDataBody');
  tbody.innerHTML = '';
  rows.forEach(r => {
    const tr = document.createElement('tr');

    // Determine status text
    let statusText = r.entry ? 'دوام' : 'غياب';
    if (r.status) {
      const s = STATUSES.find(st => st.value === r.status);
      statusText = s ? s.label : r.status;
    }

    tr.innerHTML = `
      <td>${r.name}</td>
      <td>${r.date}</td>
      <td>${r.entry}</td>
      <td>${r.exit}</td>
      <td>${formatNum(r.advance)}</td>
      <td>${formatNum(r.penalty)}</td>
      <td><span class="status-badge ${r.entry || r.status ? 'active' : 'inactive'}">${statusText}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// ─── Attendance Calendar Logic ───
const CALENDAR_DAY_NAMES = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, ch => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[ch]));
}

function getRecordHours(rec) {
  if (!rec) return 0;
  if (Number(rec.hours) > 0) return Number(rec.hours);
  if (rec.checkInMin != null && rec.checkOutMin != null) {
    const minutes = rec.checkOutMin > rec.checkInMin
      ? rec.checkOutMin - rec.checkInMin
      : (24 * 60 - rec.checkInMin) + rec.checkOutMin;
    return Math.round((minutes / 60) * 100) / 100;
  }
  return 0;
}

function isCalendarAttendanceRecord(rec) {
  if (!rec) return false;
  const status = normalizeStatus(rec.status);
  if (status === 'leave' || status === 'absent') return false;
  return !!rec.checkIn || isWorkStatus(status);
}

function getRecordDateObject(rec) {
  const y = Number(rec?.year);
  const m = Number(rec?.month);
  const d = Number(rec?.day);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function isActualAttendanceDataRecord(rec) {
  if (!rec) return false;
  return !!(rec.checkIn || rec.checkOut || rec.checkInMin != null || rec.checkOutMin != null || rec.managerApproved || rec.attendanceCorrected);
}

// Single source of truth for "what's the newest day we actually have real
// attendance data for". Never looks past today (a record dated in the future
// isn't a real update yet). Shared by the freshness banner AND the calendar's
// actual/forecast cutoff below — both must agree on the same anchor date.
function findLatestActualAttendanceRecord() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let latest = null;
  employees.forEach(emp => {
    (emp.records || []).forEach(rec => {
      if (!isActualAttendanceDataRecord(rec)) return;
      const dt = getRecordDateObject(rec);
      if (!dt || Number.isNaN(dt.getTime()) || dt > today) return;
      if (!latest || dt > latest.date) latest = { date: dt, rec, emp };
    });
  });
  return latest;
}

// The forecast cutoff anchor (requirement: lastCompleteAttendanceUpdateDate /
// lastCompleteDatabaseUpdateDate). An admin can pin this manually via
// omni.adminSettings.lastCompleteAttendanceUpdateDate (ISO date string) when
// the last full import doesn't line up with the newest single record (e.g. a
// bulk import that was verified complete through a specific date). Absent an
// override, it's derived from the newest actual attendance record. Returns
// null only when there has never been any real attendance data at all — in
// that case every day, in every month, is forecast-eligible.
function getAttendanceUpdateCutoffDate() {
  const manual = omni?.adminSettings?.lastCompleteAttendanceUpdateDate || omni?.adminSettings?.lastCompleteDatabaseUpdateDate;
  if (manual) {
    const parsed = parseEmployeeLifecycleDate(manual);
    if (parsed) return parsed;
  }
  const latest = findLatestActualAttendanceRecord();
  return latest ? latest.date : null;
}

// A day is forecast-eligible when it falls strictly after the cutoff anchor
// (or when there's no anchor at all yet, e.g. a brand-new install with zero
// imported attendance). Days on/before the cutoff are never auto-forecast —
// if they're empty, that's either a confirmed zero or a genuine data gap,
// never a "day hasn't happened yet" situation. This deliberately does NOT
// compare against today's wall-clock date — the cutoff can be weeks behind
// today if the last import lagged, and every one of those in-between days
// must still forecast rather than render as a confirmed zero.
function isCalendarDayForecastEligible(year, month, day) {
  const cutoff = getAttendanceUpdateCutoffDate();
  if (!cutoff) return true;
  const target = new Date(year, month - 1, day);
  return target > cutoff;
}

function getAttendanceDataFreshness() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const latest = findLatestActualAttendanceRecord();
  if (!latest) {
    return {
      status: 'missing',
      title: 'لا توجد بيانات حضور فعلية',
      detail: 'يمكن فتح الصفحة، لكن يجب استيراد أو تحديث التايم شيت قبل الاعتماد على الحسابات.',
      dateLabel: '-',
      ageLabel: 'غير محدد'
    };
  }
  const daysOld = Math.floor((today - latest.date) / (24 * 60 * 60 * 1000));
  const dateLabel = `${latest.date.getFullYear()}-${String(latest.date.getMonth() + 1).padStart(2, '0')}-${String(latest.date.getDate()).padStart(2, '0')}`;
  const ageLabel = daysOld === 0 ? 'اليوم' : daysOld === 1 ? 'منذ يوم واحد' : `منذ ${daysOld} أيام`;
  const status = daysOld > 7 ? 'stale' : 'fresh';
  return {
    status,
    title: status === 'fresh' ? 'بيانات الحضور محدثة' : 'بيانات الحضور قديمة',
    detail: status === 'fresh'
      ? `آخر تحديث فعلي للبيانات في ${dateLabel} (${ageLabel}).`
      : `آخر تحديث فعلي للبيانات في ${dateLabel} (${ageLabel}). الأيام التي بعده تُعرض كتنبؤ وليست صفراً فعلياً، إلى أن يتم استيراد بياناتها.`,
    dateLabel,
    ageLabel,
    daysOld
  };
}

// ─── Payroll month close/reopen (requirement: "closed" day-calc mode) ───
// A closed month is frozen: actual records already recorded still display
// normally, but forecast projection stops entirely (no speculative rows, no
// auto-recompute) until explicitly reopened. Stored as a flat list of
// "YYYY-MM" keys — deliberately NOT nested under workshopOperatingCosts or
// any other settings blob, so it can't be silently wiped by an unrelated
// partial write to those.
function monthKeyOf(year, month) {
  return `${year}-${String(month).padStart(2, '0')}`;
}

function getClosedPayrollMonthsSet() {
  const raw = omni?.adminSettings?.closedPayrollMonths;
  return new Set(Array.isArray(raw) ? raw : []);
}

function isPayrollMonthClosed(year, month) {
  return getClosedPayrollMonthsSet().has(monthKeyOf(year, month));
}

window.setPayrollMonthClosed = function(year, month, closed) {
  if (window.PermissionService && !window.PermissionService.check('employees', 'update')) {
    if (typeof showToast === 'function') showToast('لا تملك صلاحية إغلاق أو إعادة فتح الشهر', 'error');
    return;
  }
  if (!omni) return;
  if (!omni.adminSettings) omni.adminSettings = {};
  const set = getClosedPayrollMonthsSet();
  const key = monthKeyOf(year, month);
  if (closed) set.add(key); else set.delete(key);
  omni.adminSettings.closedPayrollMonths = Array.from(set);
  saveData();
  if (typeof showToast === 'function') {
    showToast(closed ? `تم إغلاق شهر ${MONTHS_AR[month - 1]} ${year} — لا مزيد من التوقعات حتى إعادة الفتح` : `تمت إعادة فتح شهر ${MONTHS_AR[month - 1]} ${year}`, 'success');
  }
  if (typeof renderAttendanceCalendar === 'function') renderAttendanceCalendar();
};

// Single classification for a calendar day, per the requirement's four
// modes. Priority order matters: an actually-recorded day always wins (even
// a Friday with approved overtime), Friday/weekly-off is checked before the
// forecast cutoff (a Friday never gets a normal payroll forecast — see
// getCalendarDayData), and only then does the cutoff decide forecast vs a
// pre-cutoff gap.
function getCalendarDayMode(year, month, day, { hasActualRows, isFridayDay, monthClosed }) {
  if (monthClosed) return 'closed';
  if (hasActualRows) return 'actual';
  if (isFridayDay) return 'weekly_off';
  if (isCalendarDayForecastEligible(year, month, day)) return 'forecast';
  const hasExpectedStaff = employees.some(emp => isEmployeeActiveOnDate(emp, year, month, day));
  return hasExpectedStaff ? 'missing' : 'actual';
}

const CALENDAR_DAY_MODE_LABELS = {
  actual: 'فعلي',
  forecast: 'تنبؤي',
  closed: 'مغلق',
  weekly_off: 'يوم عطلة',
  missing: 'بيانات ناقصة'
};

const CALENDAR_DAY_MODE_ICONS = {
  actual: 'fa-circle-check',
  forecast: 'fa-wand-magic-sparkles',
  closed: 'fa-lock',
  weekly_off: 'fa-mug-hot',
  missing: 'fa-triangle-exclamation'
};

function renderAttendanceFreshnessBanner(pageId, anchorSelector) {
  const page = document.getElementById(pageId);
  if (!page) return;
  let banner = page.querySelector('.attendance-freshness-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'attendance-freshness-banner';
    const anchor = page.querySelector(anchorSelector);
    if (anchor) anchor.insertAdjacentElement('beforebegin', banner);
    else page.prepend(banner);
  }
  const info = getAttendanceDataFreshness();
  banner.className = `attendance-freshness-banner freshness-${info.status}`;
  const icon = info.status === 'fresh' ? 'fa-circle-check' : info.status === 'stale' ? 'fa-triangle-exclamation' : 'fa-circle-info';
  banner.innerHTML = `
    <div class="freshness-icon"><i class="fa-solid ${icon}"></i></div>
    <div>
      <strong>${escapeHtml(info.title)}</strong>
      <span>${escapeHtml(info.detail)}</span>
    </div>
  `;
}

// getDefaultWorkshopOperatingCostItems() moved to modules/data-providers.js (GO 16 de-monolith Phase 2)

function getWorkshopOperatingCostSettings() {
  const defaults = getDefaultWorkshopOperatingCostItems();
  if (!omni || typeof omni !== 'object') return { monthlyItems: defaults };
  if (!omni.adminSettings || typeof omni.adminSettings !== 'object') omni.adminSettings = {};
  const settings = omni.adminSettings.workshopOperatingCosts || {};
  const savedItems = Array.isArray(settings.monthlyItems) ? settings.monthlyItems : [];
  const savedById = Object.fromEntries(savedItems.map(item => [item.id, item]));
  const monthlyItems = defaults.map(item => ({
    ...item,
    ...(savedById[item.id] || {}),
    amount: Number(savedById[item.id]?.amount ?? item.amount) || 0,
    active: savedById[item.id]?.active !== false
  }));
  savedItems
    .filter(item => item && item.id && !monthlyItems.some(defaultItem => defaultItem.id === item.id))
    .forEach(item => monthlyItems.push({ ...item, amount: Number(item.amount) || 0, active: item.active !== false }));
  return { ...settings, monthlyItems };
}

// How many days in the month actually have staffing — either real recorded
// attendance, or (past the forecast cutoff) at least one employee expected
// to be active. Used only by the 'attendance_days' allocation basis. Falls
// back to 1 so a division by it never produces Infinity on a month with no
// staffing signal at all.
function getMonthStaffedDayCount(year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    if (isFriday(year, month, d)) continue;
    const hasActual = employees.some(emp => (emp.records || []).some(rec =>
      recordBelongsToMonth(rec, year, month) && Number(rec.day) === d && (isCalendarAttendanceRecord(rec) || rec.managerApproved)
    ));
    if (hasActual) { count++; continue; }
    if (isCalendarDayForecastEligible(year, month, d) && employees.some(emp => isEmployeeActiveOnDate(emp, year, month, d))) count++;
  }
  return Math.max(count, 1);
}

// Fixed operating costs (rent, internet, electricity...) each carry their own
// allocation basis — how their monthly amount gets spread across days. This
// replaces the old single global "divide by working days" rule: fixed
// overhead must keep showing up even on days with zero attendance, which
// only 'calendar_days' (the new default) guarantees.
//   calendar_days   — every day of the month, Friday included.
//   working_days     — every non-Friday day only (old default behaviour);
//                       Friday's share is rolled into the weekly figure.
//   attendance_days   — only on days with real/forecast staffing.
//   manual            — counted in the monthly total, but never auto-spread
//                       into a daily figure (the admin accounts for it
//                       elsewhere).
function getWorkshopOperatingCostBreakdown(year, month) {
  const daysInMonth = getDaysInMonth(year, month);
  const fridayCount = getFridaysInMonth(year, month).length;
  const workingDaysInMonth = Math.max(daysInMonth - fridayCount, 1);
  const staffedDaysInMonth = getMonthStaffedDayCount(year, month);
  const settings = getWorkshopOperatingCostSettings();
  const monthKey = `${year}-${String(month).padStart(2, '0')}`;

  const items = settings.monthlyItems.map(item => {
    const actualRecord = item.actuals ? item.actuals[monthKey] : null;
    const isVerified = actualRecord ? actualRecord.verified === true : false;
    const defaultVal = Number(item.amount) || 0;
    const actualVal = actualRecord ? (Number(actualRecord.amount) || 0) : defaultVal;

    // Amount to use in calculations: actual if verified, default estimate if not verified
    const amountToUse = isVerified ? actualVal : defaultVal;
    const allocationBasis = item.allocationBasis || 'calendar_days';

    return {
      ...item,
      defaultAmount: defaultVal,
      actualAmount: actualVal,
      isVerified: isVerified,
      amountToUse: amountToUse,
      allocationBasis,
      perCalendarDay: amountToUse / daysInMonth,
      perWorkingDay: amountToUse / workingDaysInMonth,
      perAttendanceDay: amountToUse / staffedDaysInMonth,
      paymentDate: actualRecord?.paymentDate || '',
      paymentSource: actualRecord?.paymentSource || '',
      paidBy: actualRecord?.paidBy || ''
    };
  });

  const activeItems = items.filter(item => item.active !== false);
  const monthlyTotal = activeItems.reduce((sum, item) => sum + item.amountToUse, 0);

  // Legacy aggregate figures — still meaningful as a single "all items,
  // spread over working days" summary number for callers that don't need
  // the per-day/per-basis breakdown (e.g. the payroll forecast card).
  const dailyShare = monthlyTotal / workingDaysInMonth;

  return {
    items: activeItems,
    monthlyTotal,
    daysInMonth,
    fridayCount,
    workingDaysInMonth,
    staffedDaysInMonth,
    dailyShare,
    // Friday itself carries no daily share (it's not a working day for this
    // purpose) — instead the whole week's worth (6 working days) is rolled
    // up and shown once, on Friday, as a distinct "weekly" figure.
    weeklyShare: dailyShare * 6,
    configured: monthlyTotal > 0
  };
}

// Per-day operating cost share, respecting each item's own allocation basis.
// isStaffedDay must reflect actual-or-forecast staffing for THIS specific
// day (not the month-wide count above), so 'attendance_days' items track the
// real presence pattern day by day rather than a flat average.
function getOperatingCostShareForDay(operatingCost, isFridayDay, isStaffedDay) {
  return operatingCost.items.reduce((sum, item) => {
    switch (item.allocationBasis) {
      case 'working_days':
        return sum + (isFridayDay ? 0 : item.perWorkingDay);
      case 'attendance_days':
        return sum + (isStaffedDay ? item.perAttendanceDay : 0);
      case 'manual':
        return sum; // entered/accounted for directly elsewhere, never auto-spread
      case 'calendar_days':
      default:
        return sum + item.perCalendarDay;
    }
  }, 0);
}

// The "look back at this past week" convenience figure shown only on
// Friday's card. Only 'working_days' items belong here — 'calendar_days'
// items already collected their own share on Friday itself via
// getOperatingCostShareForDay, so including them again here would double
// them. 'attendance_days'/'manual' items aren't rolled up weekly at all.
function getOperatingCostWeeklyShare(operatingCost) {
  return operatingCost.items.reduce((sum, item) => sum + (item.allocationBasis === 'working_days' ? item.perWorkingDay * 6 : 0), 0);
}

// Sums each employee's netDue (wages due, advances already excluded — see
// getEmployeeDailyFinancialSummary) for the 6 working days preceding a
// Friday, so the Friday "weekly" rollup can include labor cost, not just
// rent/operating cost. Skips any day that falls before day 1 (partial week
// at the start of a month) rather than reaching into the previous month.
function getWeeklyLaborCost(year, month, fridayDay) {
  const cfg = { ...getConfig(), year, month };
  let total = 0;
  for (let d = fridayDay - 6; d <= fridayDay - 1; d++) {
    if (d < 1) continue;
    employees.forEach(emp => {
      const rec = (emp.records || []).find(r => recordBelongsToMonth(r, year, month) && r.day === d);
      if (!rec || (!isCalendarAttendanceRecord(rec) && !rec?.managerApproved)) return;
      total += getEmployeeDailyFinancialSummary(emp, rec, cfg).netDue;
    });
  }
  return total;
}

function isFutureCalendarDay(year, month, day) {
  const today = new Date();
  const target = new Date(year, month - 1, day);
  const current = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return target > current;
}

function getCalendarDayData(year, month, day) {
  const cfg = { ...getConfig(), year, month };
  const date = new Date(year, month - 1, day);
  const operatingCost = getWorkshopOperatingCostBreakdown(year, month);
  const rows = employees.map((emp, idx) => {
    const rec = (emp.records || []).find(r => recordBelongsToMonth(r, year, month) && r.day === day);
    if (!isCalendarAttendanceRecord(rec) && !rec?.managerApproved) return null;
    const hours = getRecordHours(rec);
    const statusInfo = getStatusInfo(rec.status);
    const money = getEmployeeDailyFinancialSummary(emp, rec, cfg);
    return {
      empIdx: idx,
      employee: emp,
      name: emp.name,
      rec,
      hours,
      money,
      statusLabel: statusInfo.label,
      statusColor: statusInfo.color
    };
  }).filter(Boolean);
  const actualEmployeeKeys = new Set(rows.map(item => String(item.employee?.id || item.name || item.empIdx)));
  const isFridayDay = isFriday(year, month, day);
  const monthClosed = isPayrollMonthClosed(year, month);
  const mode = getCalendarDayMode(year, month, day, { hasActualRows: rows.length > 0, isFridayDay, monthClosed });
  // A closed month never forecasts (frozen), a Friday never gets a normal
  // payroll forecast (see requirement: weekly-off payroll forecast is zero
  // unless there's actual/approved overtime, which would already be in
  // `rows` and short-circuit mode to 'actual'), and any other day only
  // forecasts once it's past the cutoff anchor — never based on wall-clock
  // "today", so a lagging import doesn't silently render as a confirmed zero.
  const forecastRows = mode === 'forecast'
    ? employees.map((emp, idx) => {
        if (!isEmployeeActiveOnDate(emp, year, month, day)) return null;
        const key = String(emp.id || emp.name || idx);
        if (actualEmployeeKeys.has(key)) return null;
        const money = getEmployeeForecastDailySummary(emp, year, month, day, cfg);
        return {
          empIdx: idx,
          name: emp.name,
          money,
          hours: money.hours,
          statusLabel: 'متوقع',
          statusColor: '#a78bfa',
          isForecast: true
        };
      }).filter(Boolean)
    : [];

  const totalHours = rows.reduce((sum, item) => sum + item.hours, 0);
  const forecastHours = forecastRows.reduce((sum, item) => sum + item.hours, 0);
  const totalPayable = rows.reduce((sum, item) => sum + item.money.payable, 0);
  const totalPenalties = rows.reduce((sum, item) => sum + item.money.penalties, 0);
  const totalAdvances = rows.reduce((sum, item) => sum + item.money.advances, 0);
  const laborDueCost = rows.reduce((sum, item) => sum + item.money.netDue, 0);
  const forecastLaborCost = forecastRows.reduce((sum, item) => sum + item.money.netDue, 0);
  // Fixed operating costs are allocated per their own basis (see
  // getOperatingCostShareForDay) — a 'calendar_days' item (the default) now
  // gets its share on every day including Friday, so rent/internet/etc.
  // never silently disappear just because attendance is zero that day.
  const isStaffedDay = rows.length > 0 || forecastRows.length > 0;
  const operatingShareForDay = getOperatingCostShareForDay(operatingCost, isFridayDay, isStaffedDay);
  // The Friday "look back at the week" rollup only needs 'working_days'
  // items — 'calendar_days' items already got their own share above.
  const weeklyOperatingShare = isFridayDay ? getOperatingCostWeeklyShare(operatingCost) : 0;
  const weeklyLaborShare = isFridayDay ? getWeeklyLaborCost(year, month, day) : 0;
  const weeklyTotalShare = weeklyOperatingShare + weeklyLaborShare;
  const netDailyCost = laborDueCost + forecastLaborCost + operatingShareForDay;
  const lateCount = rows.filter(item => item.rec.checkInMin != null && item.rec.checkInMin > 9 * 60).length;
  const overtimeCount = rows.filter(item => item.hours > 9).length;

  return {
    year,
    month,
    day,
    isFriday: isFridayDay,
    dayName: CALENDAR_DAY_NAMES[date.getDay()],
    mode,
    modeLabel: CALENDAR_DAY_MODE_LABELS[mode],
    modeIcon: CALENDAR_DAY_MODE_ICONS[mode],
    monthClosed,
    rows,
    forecastRows,
    hasForecast: forecastRows.length > 0,
    totalHours,
    forecastHours,
    totalPayable,
    totalPenalties,
    totalAdvances,
    laborDueCost,
    forecastLaborCost,
    operatingCost,
    operatingShareForDay,
    weeklyOperatingShare,
    weeklyLaborShare,
    weeklyTotalShare,
    netDailyCost,
    lateCount,
    overtimeCount
  };
}

function formatCutoffDateLabel(date) {
  if (!date) return 'غير محدد';
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildCalendarForecastBasisNote() {
  const cutoff = getAttendanceUpdateCutoffDate();
  return `
    <div class="cal-forecast-basis-note">
      <i class="fa-solid fa-wand-magic-sparkles"></i>
      توقع مبني على آخر تحديث فعلي للبيانات بتاريخ <b>${formatCutoffDateLabel(cutoff)}</b> — ليس صفراً مؤكداً، بل عرض مسبق للموظفين والساعات والكلفة المتوقعة حتى يتم استيراد أو تأكيد الحضور الفعلي لهذا اليوم.
    </div>
  `;
}

// Never render a bare "0 employees / 0 cost" for a day that isn't a
// confirmed actual — each mode gets its own honest explanation instead.
function buildCalendarEmptyDayMessage(dayData) {
  switch (dayData.mode) {
    case 'forecast':
      return `<div class="cal-empty-detail">لا يوجد موظفون نشطون متوقعون لهذا اليوم (تنبؤي) — راجع حالة الموظفين وتواريخ المباشرة/الانفكاك.</div>`;
    case 'missing':
      return `<div class="cal-empty-detail cal-empty-missing"><i class="fa-solid fa-triangle-exclamation"></i> بيانات ناقصة: لم يتم استيراد حضور هذا اليوم بعد، ولا يمكن اعتباره صفر حضور فعلي مؤكد.</div>`;
    case 'weekly_off':
      return `<div class="cal-empty-detail">يوم عطلة (جمعة) — لا يوجد حضور عادي متوقع، إلا إذا وُجد إضافي معتمد من المدير.</div>`;
    case 'closed':
      return `<div class="cal-empty-detail">الشهر مغلق ولا يوجد حضور مسجل لهذا اليوم في السجل الفعلي.</div>`;
    case 'actual':
    default:
      return `<div class="cal-empty-detail">لا يوجد حضور مسجل لهذا اليوم (صفر فعلي مؤكد).</div>`;
  }
}

function renderCalendarDayDetails(dayData) {
  const panel = document.getElementById('calDayDetails');
  if (!panel || !dayData) return;
  const workersHtml = dayData.rows.length
    ? dayData.rows.map(item => `
      <div class="cal-worker-row">
        <div class="cal-worker-main">
          <span class="cal-worker-avatar">${escapeHtml(item.name.slice(0, 2))}</span>
          <div>
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.statusLabel)} · ${escapeHtml(item.rec.checkIn || '--:--')} - ${escapeHtml(item.rec.checkOut || '--:--')} ${item.rec.managerApproved ? '<span class="manager-approval-badge">مدير ✓</span>' : ''}</span>
            ${item.rec.managerApproved ? `<small class="calendar-manager-line">اعتماد: ${escapeHtml(item.rec.managerApprovedBy || 'المدير')} · ${escapeHtml(item.rec.managerApprovalNote || '')}${item.rec.attendanceCorrected ? ` · الأصل ${escapeHtml(item.rec.originalInTime || '--:--')} - ${escapeHtml(item.rec.originalOutTime || '--:--')}` : ''}</small>` : ''}
            <small class="calendar-finance-line">إضافي ${formatHoursAsMinutesLabel(item.money.calc.otHours)} · تأخير ${Math.round(item.money.calc.lateMinutes || 0)} دقائق (${formatMoneyReadable(item.money.calc.late)}) · خصومات ${formatMoneyReadable(item.money.penalties)} · سلف ${formatMoneyReadable(item.money.advances)} · مستحق اليوم ${formatMoneyReadable(item.money.netDue)}</small>
          </div>
        </div>
        <div class="cal-worker-hours">${formatHoursAsMinutesLabel(item.hours)}<br><small>${formatMoneyReadable(item.money.payable)}</small></div>
      </div>
    `).join('')
    : buildCalendarEmptyDayMessage(dayData);

  const forecastWorkersHtml = dayData.forecastRows?.length
    ? `
      <div class="cal-forecast-workers-title"><i class="fa-solid fa-wand-magic-sparkles"></i> حضور متوقع غير مسجل بعد</div>
      ${dayData.forecastRows.map(item => `
        <div class="cal-worker-row cal-worker-forecast">
          <div class="cal-worker-main">
            <span class="cal-worker-avatar">${escapeHtml(item.name.slice(0, 2))}</span>
            <div>
              <strong>${escapeHtml(item.name)}</strong>
              <span>متوقع حسب حالة الموظف وتاريخ المباشرة/الانفكاك والشفت</span>
              <small class="calendar-forecast-line">بدلات اليوم داخلة بالحساب: ${formatMoneyReadable(item.money.allowance)} · مستحق متوقع ${formatMoneyReadable(item.money.netDue)}</small>
            </div>
          </div>
          <div class="cal-worker-hours">${formatHoursAsMinutesLabel(item.hours)}<br><small>${formatMoneyReadable(item.money.netDue)}</small></div>
        </div>
      `).join('')}
    `
    : '';

  const operatingItemsHtml = dayData.operatingCost.items.length
    ? dayData.operatingCost.items.map(item => {
        const badgeStyle = item.isVerified
          ? 'background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); padding: 1px 4px; border-radius: 4px; font-size: 10px; margin-right: 4px;'
          : 'background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3); padding: 1px 4px; border-radius: 4px; font-size: 10px; margin-right: 4px;';
        const badgeText = item.isVerified ? 'موثق' : 'مقدّر';
        const tooltip = item.isVerified
          ? `دُفع ${item.paymentDate ? 'بتاريخ ' + item.paymentDate : ''} ${item.paymentSource === 'person_pocket' ? `من جيب ${item.paidBy || 'المالك'}` : 'من قاصة الورشة'}`.trim()
          : 'قيمة تقديرية غير موثقة بعد';
        return `<span style="display: inline-flex; align-items: center; margin-left: 8px;" title="${escapeHtml(tooltip)}">${escapeHtml(item.name)}: <b style="margin: 0 4px;">${formatMoneyReadable(item.amountToUse)}</b> <small style="${badgeStyle}">${badgeText}</small></span>`;
      }).join(' · ')
    : '<span>لم تضبط مبالغ الإيجار والتشغيل الشهرية بعد.</span>';

  panel.innerHTML = `
    <div class="cal-detail-header">
      <div>
        <span class="cal-detail-kicker">${dayData.isFriday ? 'جمعة' : 'يوم دوام'}</span>
        <h3>${dayData.dayName} ${dayData.day} ${MONTHS_AR[dayData.month - 1]} ${dayData.year}</h3>
      </div>
      <div class="cal-detail-badges">
        <span class="cal-mode-badge cal-mode-badge-${dayData.mode}"><i class="fa-solid ${dayData.modeIcon}"></i> ${dayData.modeLabel}</span>
        <div class="cal-detail-total">${dayData.rows.length} موظف</div>
      </div>
    </div>
    ${dayData.mode === 'forecast' ? buildCalendarForecastBasisNote() : ''}
    ${dayData.mode === 'missing' ? `<div class="cal-missing-note"><i class="fa-solid fa-triangle-exclamation"></i> لا توجد بيانات حضور مستوردة لهذا اليوم رغم وجود موظفين نشطين — هذه فجوة بيانات محتملة وليست صفراً فعلياً مؤكداً.</div>` : ''}
    ${dayData.mode === 'closed' ? `<div class="cal-closed-note"><i class="fa-solid fa-lock"></i> هذا الشهر مغلق — لا يتم احتساب توقعات جديدة. استخدم زر "إعادة فتح الشهر" لإعادة تفعيل التوقع.</div>` : ''}
    <div class="cal-detail-stats calendar-finance-stats">
      ${dayData.hasForecast ? `
        <div class="cal-forecast-stat"><span>الموظفون المتوقعون</span><strong>${dayData.forecastRows.length}</strong></div>
        <div class="cal-forecast-stat"><span>ساعات متوقعة</span><strong>${dayData.forecastHours.toFixed(1)}</strong></div>
        <div class="cal-forecast-stat"><span>أجور وبدلات متوقعة</span><strong>${formatMoneyReadable(dayData.forecastLaborCost)}</strong></div>
      ` : ''}
      <div><span>إجمالي الساعات</span><strong>${dayData.totalHours.toFixed(1)}</strong></div>
      <div><span>الموظفون المتواجدون</span><strong>${dayData.rows.length}</strong></div>
      <div><span>الأجور المستحقة قبل الخصم</span><strong>${formatMoneyReadable(dayData.totalPayable)}</strong></div>
      <div><span>الغرامات/الخصومات</span><strong>${formatMoneyReadable(dayData.totalPenalties)}</strong></div>
      <div><span>الأجور المستحقة بعد الخصم</span><strong>${formatMoneyReadable(dayData.laborDueCost)}</strong></div>
      <div><span>السلف المدفوعة منفصلة</span><strong>${formatMoneyReadable(dayData.totalAdvances)}</strong></div>
      <div><span>${dayData.isFriday ? 'تشغيل/إيجار اليوم (جمعة)' : 'تشغيل/إيجار اليوم'}</span><strong>${formatMoneyReadable(dayData.operatingShareForDay)}</strong></div>
      ${dayData.isFriday ? `
        <div class="cal-weekly-opcost-stat"><span>📅 الكلفة الأسبوعية الكاملة (تشغيل + أجور، بدون سلف)</span><strong>${formatMoneyReadable(dayData.weeklyTotalShare)}</strong></div>
      ` : ''}
      <div><span>كلفة اليوم المستحقة</span><strong>${formatMoneyReadable(dayData.netDailyCost)}</strong></div>
    </div>
    <div class="calendar-cost-note">
      <strong>كلفة اليوم = أجور مستحقة بعد الغرامات + حصة تشغيل/إيجار اليوم (كل بند حسب أساس تخصيصه: يومي تقويمي، أيام عمل، أيام حضور، أو يدوي).</strong>
      <span>${dayData.isFriday
        ? 'الجمعة يوم عطلة فلا تُحسب لها حصة تشغيل يومية خاصة بها؛ بدلاً من ذلك تظهر أعلاه الكلفة الأسبوعية الكاملة (أجور ٦ أيام العمل + تشغيل/إيجار الأسبوع) كخانة منفصلة مميّزة. السلف لا تدخل في هذا الرقم إطلاقاً — تبقى معروضة كمدفوعات منفصلة أسفل الصفحة لأنها ليست كلفة حقيقية بل دفعة مقدّمة من مستحقات الموظف.'
        : 'السلف والمشتريات وحركات القاصة لا تدخل في هذه الكلفة، وتبقى معروضة كمدفوعات منفصلة.'}</span>
      <div class="calendar-operating-items" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">${operatingItemsHtml}</div>
    </div>
    <div class="cal-workers-list">${dayData.rows.length ? workersHtml : ''}${forecastWorkersHtml || (!dayData.rows.length ? workersHtml : '')}</div>
  `;
}

function opcItemIcon(id) {
  const icons = {
    rent: 'fa-house', internet: 'fa-wifi', electricity: 'fa-bolt',
    water: 'fa-droplet', diesel: 'fa-gas-pump', chatgpt: 'fa-robot'
  };
  return icons[id] || 'fa-receipt';
}

// Scans the expenses ledger for this month for transactions matching an
// operating-cost item's keywords, so the modal can suggest the actual paid
// amount instead of leaving it to manual re-entry. Excludes transactions this
// same module already posted (sourceId prefix 'opcost_') to avoid a suggestion
// that just echoes back what was already recorded.
function findMatchingExpenseSuggestion(item, monthKey) {
  if (!finance || !Array.isArray(finance.transactions)) return 0;
  const rawTerms = (Array.isArray(item.keywords) && item.keywords.length) ? item.keywords : [item.name];
  const terms = rawTerms.map(t => String(t).toLowerCase()).filter(Boolean);
  if (!terms.length) return 0;
  return finance.transactions
    .filter(tx => tx.type === 'expense' && String(tx.date || '').startsWith(monthKey))
    .filter(tx => !String(tx.sourceId || '').startsWith('opcost_'))
    .filter(tx => {
      const hay = `${tx.description || ''} ${getCategoryName('expense', tx.categoryId) || ''}`.toLowerCase();
      return terms.some(term => hay.includes(term));
    })
    .reduce((sum, tx) => sum + asMoney(tx.amount), 0);
}

window.openMonthlyOperatingCostsModal = async function() {
  ensureOmni();
  ensureFinance();
  const cfg = getConfig();
  const monthKey = `${cfg.year}-${String(cfg.month).padStart(2, '0')}`;
  const settings = getWorkshopOperatingCostSettings();
  // Session-only mirror of in-progress (not yet confirmed) edits, keyed by
  // item id. Populated by syncDraftFromDom() right before any action that
  // re-renders the list (add/delete/undo), so those edits survive the
  // rebuild. Deliberately kept OUT of item.actuals — writing draft values
  // there made an item's saved actuals record exist prematurely, which
  // broke the "no record yet -> show the default estimate" fallback (a
  // real regression: editing another item's default then re-rendering
  // froze an unrelated item's actual-paid field at a stale value instead
  // of tracking further default edits).
  const draftState = {};

  function buildModalHtml() {
    const activeItems = settings.monthlyItems.filter(item => item.active !== false);
    const totalDefault = activeItems.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);
    const verifiedCount = activeItems.filter(item => item.actuals?.[monthKey]?.verified).length;

    return `
    <div class="opc-modal-scope">
      <style>
        #omniModalBox.opc-modal-wide { width: 680px !important; max-width: 94vw !important; padding: 28px !important; }
        .opc-modal-scope { direction: rtl; text-align: right; }
        .opc-intro { font-size: 13px; color: var(--text-secondary); margin-bottom: 16px; line-height: 1.8; }
        .opc-summary-bar { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
        .opc-summary-chip { flex: 1; min-width: 150px; background: var(--gradient-card); border: 1px solid var(--border-glass); border-radius: var(--radius-md); padding: 12px 16px; backdrop-filter: blur(12px); }
        .opc-summary-chip span { display: block; font-size: 11px; color: var(--text-secondary); margin-bottom: 5px; }
        .opc-summary-chip strong { font-size: 16px; color: var(--text-primary); }
        .opc-items-list { display: flex; flex-direction: column; gap: 18px; max-height: 52vh; overflow-y: auto; padding: 4px 6px 4px 2px; margin-bottom: 20px; }
        .opc-item-card { background: var(--gradient-card); border: 1px solid var(--border-glass); border-radius: var(--radius-lg); padding: 18px; backdrop-filter: blur(16px); transition: var(--transition); }
        .opc-item-card.opc-is-verified { border-color: rgba(52,211,153,0.35); box-shadow: 0 0 0 1px rgba(52,211,153,0.08), var(--shadow-md); }
        .opc-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
        .opc-item-name { display: flex; align-items: center; gap: 9px; font-size: 15px; color: var(--text-heading); }
        .opc-item-name i { color: var(--accent-blue); width: 18px; text-align: center; font-size: 15px; }
        .opc-locked-badge { font-size: 10.5px; background: rgba(52,211,153,0.15); color: var(--accent-green); border: 1px solid rgba(52,211,153,0.3); padding: 3px 9px; border-radius: 999px; margin-right: 10px; display: inline-flex; align-items: center; gap: 4px; }
        .opc-delete-btn { background: transparent; border: none; color: var(--accent-red); cursor: pointer; padding: 5px 7px; border-radius: 7px; transition: var(--transition); }
        .opc-delete-btn:hover { background: rgba(248,113,113,0.12); }
        .opc-amounts-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; align-items: start; }
        .opc-field label { display: block; font-size: 11.5px; color: var(--text-secondary); margin-bottom: 5px; }
        .opc-field input.form-input { width: 100%; height: 38px; font-size: 13px; }
        .opc-basis-field { margin-bottom: 14px; }
        .opc-basis-field select.form-input { width: 100%; height: 38px; font-size: 13px; }
        .opc-suggestion-chip { margin-top: 7px; width: 100%; font-size: 11px; background: rgba(56,189,248,0.12); color: var(--accent-blue); border: 1px solid rgba(56,189,248,0.3); border-radius: 999px; padding: 5px 10px; cursor: pointer; display: flex; align-items: center; gap: 6px; justify-content: center; transition: var(--transition); }
        .opc-suggestion-chip:hover { background: rgba(56,189,248,0.22); }
        .opc-toggle-row { display: flex; align-items: center; gap: 12px; margin-top: 14px; padding: 11px 14px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-glass); border-radius: var(--radius-md); cursor: pointer; transition: var(--transition); }
        .opc-toggle-row:hover { background: rgba(255,255,255,0.045); }
        .opc-toggle-switch { position: relative; width: 42px; height: 24px; flex-shrink: 0; }
        .opc-toggle-switch input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; z-index: 1; }
        .opc-toggle-switch input:disabled { cursor: not-allowed; }
        .opc-toggle-track { position: absolute; inset: 0; background: rgba(255,255,255,0.14); border-radius: 999px; transition: var(--transition); }
        .opc-toggle-knob { position: absolute; top: 2px; right: 2px; width: 20px; height: 20px; background: #fff; border-radius: 50%; transition: var(--transition); box-shadow: var(--shadow-sm); }
        .opc-toggle-switch input:checked + .opc-toggle-track { background: var(--accent-green); }
        .opc-toggle-switch input:checked + .opc-toggle-track .opc-toggle-knob { transform: translateX(-18px); }
        .opc-toggle-switch input:disabled + .opc-toggle-track { opacity: 0.6; }
        .opc-toggle-text { font-size: 13px; color: var(--text-primary); font-weight: 500; }
        .opc-verify-panel { display: none; grid-template-columns: 1fr 1fr; gap: 16px; border-top: 1px dashed var(--border-glass); }
        .opc-verify-panel.opc-panel-open { display: grid; margin-top: 16px; padding-top: 16px; animation: opcSlideDown .22s ease; }
        @keyframes opcSlideDown { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: translateY(0); } }
        .opc-radio-row { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--text-secondary); }
        .opc-radio-row label { display: flex; align-items: center; gap: 7px; cursor: pointer; }
        .opc-radio-row input[type=radio] { accent-color: var(--accent-blue); cursor: pointer; width: 15px; height: 15px; }
        .opc-hidden { display: none !important; }
        .opc-locked-note { grid-column: 1 / -1; font-size: 12.5px; color: var(--text-secondary); background: rgba(52,211,153,0.06); border: 1px solid rgba(52,211,153,0.2); border-radius: var(--radius-sm); padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
        .opc-locked-note i { color: var(--accent-green); margin-left: 6px; }
        .opc-undo-btn { align-self: flex-start; margin-top: 4px; font-size: 11.5px; background: rgba(248,113,113,0.1); color: var(--accent-red); border: 1px solid rgba(248,113,113,0.3); border-radius: 999px; padding: 6px 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: var(--transition); }
        .opc-undo-btn:hover { background: rgba(248,113,113,0.2); }
        .opc-empty { text-align: center; color: var(--text-muted); font-size: 13px; padding: 22px; }
        .opc-add-section { border-top: 1px solid var(--border-glass); padding-top: 16px; }
        .opc-add-section h4 { margin: 0 0 12px; font-size: 13.5px; color: var(--text-secondary); }
        .opc-add-row { display: flex; gap: 10px; }
        .opc-add-row input.form-input { height: 38px; font-size: 13px; }
      </style>

      <p class="opc-intro">
        لشهر <strong>${MONTHS_AR[cfg.month - 1]} ${cfg.year}</strong>. البند الموثّق يستخدم القيمة الفعلية المعتمدة، بينما البند غير الموثّق يستخدم القيمة الافتراضية التقديرية في حساب حصة اليوم بالتقويم.
      </p>

      <div class="opc-summary-bar">
        <div class="opc-summary-chip"><span>عدد البنود</span><strong>${activeItems.length}</strong></div>
        <div class="opc-summary-chip"><span>الموثّق هذا الشهر</span><strong style="direction: ltr; unicode-bidi: embed; display: inline-block;">${verifiedCount} / ${activeItems.length}</strong></div>
        <div class="opc-summary-chip"><span>إجمالي الافتراضي الشهري</span><strong>${formatMoneyReadable(totalDefault)}</strong></div>
      </div>

      <div class="opc-items-list" id="modalCostItemsContainer"><!-- Rows injected here --></div>

      <div class="opc-add-section">
        <h4><i class="fa-solid fa-circle-plus"></i> إضافة بند مصروف تشغيلي جديد</h4>
        <div class="opc-add-row">
          <input type="text" id="newCostItemName" class="form-input" placeholder="اسم المصروف (مثال: صيانة دورية)" style="flex: 2;">
          <input type="number" id="newCostItemDefault" class="form-input" placeholder="الافتراضي شهرياً" style="flex: 1;">
          <button type="button" class="btn btn-secondary" onclick="addCostItemFromModal()" style="padding: 0 15px;">إضافة</button>
        </div>
      </div>
    </div>
  `;
  }

  function renderModalCostRows() {
    const container = document.getElementById('modalCostItemsContainer');
    if (!container) return;

    const activeItems = settings.monthlyItems.filter(item => item.active !== false);

    if (activeItems.length === 0) {
      container.innerHTML = `<div class="opc-empty">لا توجد بنود مصاريف مضافة.</div>`;
      return;
    }

    container.innerHTML = activeItems.map(item => {
      const actualRecord = item.actuals ? item.actuals[monthKey] : null;
      const draft = draftState[item.id];
      const isLocked = !!(actualRecord && actualRecord.postedTxId);
      const defaultVal = Number(item.amount) || 0;
      const isVerified = draft ? draft.verified : (actualRecord ? actualRecord.verified === true : false);
      const actualVal = draft ? draft.actualVal : (actualRecord ? (Number(actualRecord.amount) || 0) : defaultVal);
      const paymentDate = draft ? draft.paymentDate : (actualRecord?.paymentDate || todayISO());
      const paymentSource = draft ? draft.paymentSource : (actualRecord?.paymentSource || 'cashbox');
      const paidBy = draft ? draft.paidBy : (actualRecord?.paidBy || 'سيف');
      const adoptDefaultDraft = draft ? draft.adoptDefault : false;
      const suggestion = isLocked ? 0 : findMatchingExpenseSuggestion(item, monthKey);

      return `
        <div class="opc-item-card ${isVerified ? 'opc-is-verified' : ''}">
          <div class="opc-item-header">
            <div class="opc-item-name">
              <i class="fa-solid ${opcItemIcon(item.id)}"></i>
              <strong>${escapeHtml(item.name)}</strong>
              ${isLocked ? '<span class="opc-locked-badge"><i class="fa-solid fa-lock"></i> مرحّل</span>' : ''}
            </div>
            ${isLocked ? '' : `<button type="button" class="opc-delete-btn" onclick="deleteCostItemFromModal('${item.id}')" title="حذف"><i class="fa-solid fa-trash-can"></i></button>`}
          </div>

          <div class="opc-amounts-row">
            <div class="opc-field">
              <label>الافتراضي التقديري (شهرياً)</label>
              <input type="number" class="form-input opc-default-amt" data-id="${item.id}" value="${defaultVal}" ${isLocked ? 'disabled' : ''}>
            </div>
            <div class="opc-field">
              <label>الفعلي المشتري (لهذا الشهر)</label>
              <input type="number" class="form-input opc-actual-amt" data-id="${item.id}" value="${actualVal}" ${isLocked ? 'disabled' : ''}>
              ${suggestion > 0 ? `<button type="button" class="opc-suggestion-chip" onclick="applyOpcSuggestion('${item.id}', ${suggestion})"><i class="fa-solid fa-wand-magic-sparkles"></i> اقتراح من سجل المصاريف: ${formatMoneyReadable(suggestion)}</button>` : ''}
            </div>
          </div>

          <div class="opc-field opc-basis-field">
            <label>أساس توزيع الكلفة على الأيام</label>
            <select class="form-input opc-allocation-basis" data-id="${item.id}" onchange="setOpcAllocationBasis('${item.id}', this.value)" ${isLocked ? 'disabled' : ''}>
              <option value="calendar_days" ${item.allocationBasis === 'calendar_days' || !item.allocationBasis ? 'selected' : ''}>كل أيام الشهر (تقويمي)</option>
              <option value="working_days" ${item.allocationBasis === 'working_days' ? 'selected' : ''}>أيام العمل فقط (بدون الجمعة)</option>
              <option value="attendance_days" ${item.allocationBasis === 'attendance_days' ? 'selected' : ''}>أيام الحضور الفعلي فقط</option>
              <option value="manual" ${item.allocationBasis === 'manual' ? 'selected' : ''}>يدوي (بدون توزيع يومي تلقائي)</option>
            </select>
          </div>

          <label class="opc-toggle-row">
            <span class="opc-toggle-switch">
              <input type="checkbox" class="opc-verified-check" data-id="${item.id}" ${isVerified ? 'checked' : ''} ${isLocked ? 'disabled' : ''} onchange="toggleOpcVerifyPanel('${item.id}')">
              <span class="opc-toggle-track"><span class="opc-toggle-knob"></span></span>
            </span>
            <span class="opc-toggle-text">توثيق واعتماد هذا الشهر</span>
          </label>

          <div class="opc-verify-panel ${isVerified ? 'opc-panel-open' : ''}" id="opcVerifyPanel_${item.id}">
            ${isLocked ? `
              <div class="opc-locked-note">
                <div><i class="fa-solid fa-circle-check"></i>تم اعتماد هذا المصروف وترحيله ${paymentSource === 'person_pocket' ? `من جيب <b>${escapeHtml(paidBy || 'المالك')}</b>` : '<b>وخصمه من قاصة الورشة</b>'} بتاريخ <b>${escapeHtml(paymentDate)}</b>.</div>
                <small>لتصحيح مبلغ أو تاريخ خاطئ، استخدم "تراجع" لعكس القيد المحاسبي وإعادة فتح البند.</small>
                <button type="button" class="opc-undo-btn" onclick="undoOpcPostedItem('${item.id}')"><i class="fa-solid fa-rotate-left"></i> تراجع عن الترحيل</button>
              </div>
            ` : `
              <div class="opc-field">
                <label>تاريخ الدفع الفعلي</label>
                <input type="date" class="form-input opc-payment-date" data-id="${item.id}" value="${paymentDate}">
              </div>
              <div class="opc-field">
                <label>التأثير على القاصة</label>
                <div class="opc-radio-row">
                  <label><input type="radio" name="opcSource_${item.id}" class="opc-payment-source" data-id="${item.id}" value="cashbox" ${paymentSource !== 'person_pocket' ? 'checked' : ''} onchange="toggleOpcPocketField('${item.id}')"> نعم، يخصم من قاصة الورشة</label>
                  <label><input type="radio" name="opcSource_${item.id}" class="opc-payment-source" data-id="${item.id}" value="person_pocket" ${paymentSource === 'person_pocket' ? 'checked' : ''} onchange="toggleOpcPocketField('${item.id}')"> لا، دفع مباشر من جيب المالك</label>
                </div>
              </div>
              <div class="opc-field opc-pocket-field ${paymentSource === 'person_pocket' ? '' : 'opc-hidden'}" id="opcPocketField_${item.id}" style="grid-column: 1 / -1;">
                <label>اسم الدافع</label>
                <input type="text" class="form-input opc-paid-by" data-id="${item.id}" value="${escapeHtml(paidBy)}" placeholder="اسم المالك">
              </div>
              <label class="opc-toggle-row" style="grid-column: 1 / -1; margin-top: 0;">
                <span class="opc-toggle-switch">
                  <input type="checkbox" class="opc-adopt-default" data-id="${item.id}" ${adoptDefaultDraft ? 'checked' : ''}>
                  <span class="opc-toggle-track"><span class="opc-toggle-knob"></span></span>
                </span>
                <span class="opc-toggle-text">اعتماد هذه القيمة كافتراضي مستقبلي للأشهر القادمة</span>
              </label>
            `}
          </div>
        </div>
      `;
    }).join('');
  }

  // renderModalCostRows() rebuilds the ENTIRE items container from
  // `settings`/`draftState`, so anything the user typed but hasn't reached
  // final Confirm yet (default/actual amounts, verify toggle, payment date/
  // source/payer, adopt-default) only lives in the live DOM. Any action that
  // re-renders (add item, delete item, undo) must first pull those
  // in-progress values out of the DOM here, or the re-render silently wipes
  // every other card's unsaved edits — this was reported live: adding a
  // custom item after editing every other item erased all the edits above
  // it. Default-estimate edits (`item.amount`) are safe to apply immediately;
  // actual/verify/payment fields go into `draftState`, NOT `item.actuals` —
  // writing them there would create a premature "saved" record that breaks
  // the "no record yet -> fall back to the default estimate" display logic
  // for every later default edit on that same item.
  function syncDraftFromDom() {
    const container = document.getElementById('modalCostItemsContainer');
    if (!container) return;

    settings.monthlyItems.forEach(item => {
      if (item.active === false) return;
      const existingRecord = item.actuals ? item.actuals[monthKey] : null;
      if (existingRecord && existingRecord.postedTxId) return; // never touch a posted month/item

      const defaultInput = container.querySelector(`.opc-default-amt[data-id="${item.id}"]`);
      if (defaultInput) item.amount = Number(defaultInput.value) || 0;

      const actualInput = container.querySelector(`.opc-actual-amt[data-id="${item.id}"]`);
      if (!actualInput) return; // row not rendered (e.g. brand new item pushed this same tick)

      const verifiedCheck = container.querySelector(`.opc-verified-check[data-id="${item.id}"]`);
      const paymentDateInput = container.querySelector(`.opc-payment-date[data-id="${item.id}"]`);
      const sourceRadio = container.querySelector(`.opc-payment-source[data-id="${item.id}"]:checked`);
      const paidByInput = container.querySelector(`.opc-paid-by[data-id="${item.id}"]`);
      const adoptCheck = container.querySelector(`.opc-adopt-default[data-id="${item.id}"]`);

      draftState[item.id] = {
        actualVal: Number(actualInput.value) || 0,
        verified: !!verifiedCheck?.checked,
        paymentDate: paymentDateInput?.value || todayISO(),
        paymentSource: sourceRadio?.value === 'person_pocket' ? 'person_pocket' : 'cashbox',
        paidBy: paidByInput?.value.trim() || '',
        adoptDefault: !!adoptCheck?.checked
      };
    });
  }

  window.toggleOpcVerifyPanel = function(id) {
    const panel = document.getElementById(`opcVerifyPanel_${id}`);
    const checkbox = document.querySelector(`.opc-verified-check[data-id="${id}"]`);
    if (!panel || !checkbox) return;
    panel.classList.toggle('opc-panel-open', checkbox.checked);
  };

  // Applied immediately to the item (like the default-estimate amount) —
  // it's a display/calculation setting, not a financial verification field,
  // so it doesn't need to go through draftState + the confirm review prompt.
  window.setOpcAllocationBasis = function(id, basis) {
    const item = settings.monthlyItems.find(x => x.id === id);
    if (item) item.allocationBasis = basis;
  };

  window.toggleOpcPocketField = function(id) {
    const field = document.getElementById(`opcPocketField_${id}`);
    const selected = document.querySelector(`.opc-payment-source[data-id="${id}"]:checked`);
    if (field) field.classList.toggle('opc-hidden', !selected || selected.value !== 'person_pocket');
  };

  window.applyOpcSuggestion = function(id, amount) {
    const input = document.querySelector(`.opc-actual-amt[data-id="${id}"]`);
    if (input) input.value = amount;
    if (typeof showToast === 'function') showToast('تم تعبئة القيمة المقترحة من سجل المصاريف', 'success');
  };

  // Reverses a posted operating-cost item: cancels the v6 move via the
  // existing audited FinanceService.cancelMove (creates a reversing entry,
  // marks the original cancelled — same pattern as cancelMoveFromUI), drops
  // the synthetic legacy mirror row this module created, and reopens the
  // item for re-entry. Never deletes the real ledger history.
  window.undoOpcPostedItem = async function(id) {
    const item = settings.monthlyItems.find(x => x.id === id);
    const record = item?.actuals?.[monthKey];
    if (!item || !record || !record.postedTxId) return;

    if (!confirm(`سيتم عكس مصروف "${item.name}" المُرحّل بقيد عكسي في السجل المحاسبي وإعادة فتح البند للتعديل. هل تريد المتابعة؟`)) return;

    const legacyTx = finance.transactions.find(tx => tx.id === record.postedTxId);
    try {
      if (legacyTx?.v6_move_id && window.FinanceService) {
        await FinanceService.cancelMove(legacyTx.v6_move_id, { backup_tag: 'pre_opcost_undo' });
        if (window.PentagonDB) await PentagonDB.load({ force: true });
      }
    } catch (err) {
      if (typeof showToast === 'function') showToast(err.message || 'تعذّر عكس القيد المحاسبي', 'error');
      return;
    }

    if (legacyTx) {
      finance.transactions = finance.transactions.filter(tx => tx.id !== record.postedTxId);
    }

    delete item.actuals[monthKey];
    omni.adminSettings.workshopOperatingCosts = settings;
    saveData();

    if (typeof showToast === 'function') showToast('تم التراجع عن الترحيل وإعادة فتح البند', 'success');
    syncDraftFromDom();
    renderModalCostRows();
  };

  window.addCostItemFromModal = function() {
    const nameInput = document.getElementById('newCostItemName');
    const defaultInput = document.getElementById('newCostItemDefault');
    const name = nameInput.value.trim();
    const defaultVal = Number(defaultInput.value) || 0;

    if (!name) {
      if (typeof showToast === 'function') showToast('يرجى إدخال اسم المصروف', 'error');
      return;
    }

    syncDraftFromDom();

    settings.monthlyItems.push({
      id: 'cost_' + Date.now(),
      name,
      amount: defaultVal,
      active: true,
      allocationBasis: 'calendar_days',
      accountId: 'expense_general',
      categoryId: 'cat_general',
      keywords: [name],
      actuals: {}
    });

    nameInput.value = '';
    defaultInput.value = '';

    renderModalCostRows();
  };

  window.deleteCostItemFromModal = function(id) {
    const item = settings.monthlyItems.find(x => x.id === id);
    if (item) {
      syncDraftFromDom();
      item.active = false;
      renderModalCostRows();
    }
  };

  // This item list needs more room than the generic 400px omni modal box —
  // widen it just for this feature's lifetime via a scoped class, restored on close.
  const opcModalBoxEl = document.getElementById('omniModalBox');
  if (opcModalBoxEl) opcModalBoxEl.classList.add('opc-modal-wide');

  const confirmed = await showOmniModal(
    `ضبط مصاريف التشغيل - ${MONTHS_AR[cfg.month - 1]} ${cfg.year}`,
    buildModalHtml(),
    (bodyEl) => {
      const activeItems = settings.monthlyItems.filter(item => item.active !== false);

      // Pass 1 — read the form and validate, WITHOUT mutating anything yet.
      // This lets us show the user exactly what's about to hit the ledger
      // before committing, and abort cleanly (nothing touched) if validation
      // fails or the user declines the review prompt below.
      const plan = [];
      for (const item of activeItems) {
        const actualRecord = item.actuals ? item.actuals[monthKey] : null;
        const isLocked = !!(actualRecord && actualRecord.postedTxId);
        const defaultVal = Number(bodyEl.querySelector(`.opc-default-amt[data-id="${item.id}"]`)?.value ?? item.amount) || 0;

        if (isLocked) { plan.push({ item, isLocked: true }); continue; }

        const actualInput = bodyEl.querySelector(`.opc-actual-amt[data-id="${item.id}"]`);
        const verifiedCheck = bodyEl.querySelector(`.opc-verified-check[data-id="${item.id}"]`);
        const actualVal = Number(actualInput?.value) || 0;
        const verified = !!verifiedCheck?.checked;

        if (!verified) { plan.push({ item, isLocked: false, defaultVal, verified: false, actualVal }); continue; }

        const paymentDate = bodyEl.querySelector(`.opc-payment-date[data-id="${item.id}"]`)?.value || todayISO();
        const sourceRadio = bodyEl.querySelector(`.opc-payment-source[data-id="${item.id}"]:checked`);
        const paymentSource = sourceRadio?.value === 'person_pocket' ? 'person_pocket' : 'cashbox';
        const paidBy = paymentSource === 'person_pocket'
          ? (bodyEl.querySelector(`.opc-paid-by[data-id="${item.id}"]`)?.value.trim() || '')
          : '';
        const adoptDefault = !!bodyEl.querySelector(`.opc-adopt-default[data-id="${item.id}"]`)?.checked;

        if (paymentSource === 'person_pocket' && !paidBy) {
          if (typeof showToast === 'function') showToast(`يرجى إدخال اسم الدافع لبند "${item.name}"`, 'error');
          return false;
        }
        if (actualVal <= 0) {
          if (typeof showToast === 'function') showToast(`أدخل مبلغاً صحيحاً لبند "${item.name}"`, 'error');
          return false;
        }

        plan.push({ item, isLocked: false, defaultVal, verified: true, actualVal, paymentDate, paymentSource, paidBy, adoptDefault });
      }

      // Pass 2 — anything about to post a real ledger entry gets shown to the
      // user first and requires an explicit yes. Items that only update the
      // estimate/unverified actual (no ledger impact) skip this prompt.
      const toPost = plan.filter(p => p.verified && !p.isLocked);
      if (toPost.length > 0) {
        const lines = toPost.map(p => {
          const src = p.paymentSource === 'person_pocket' ? `من جيب ${p.paidBy}` : 'من قاصة الورشة';
          return `• ${p.item.name}: ${formatMoneyReadable(p.actualVal)} (${src}) بتاريخ ${p.paymentDate}`;
        }).join('\n');
        const ok = confirm(`سيتم تسجيل القيود التالية في السجل المالي:\n\n${lines}\n\nهل تريد إضافتها للسجل المالي؟`);
        if (!ok) return false;
      }

      // Pass 3 — apply. Only now do we mutate settings/post to the ledger.
      for (const p of plan) {
        const { item } = p;
        if (p.isLocked) continue; // never touch an already-posted month/item
        item.amount = p.defaultVal;

        if (!item.actuals) item.actuals = {};

        if (!p.verified) {
          item.actuals[monthKey] = { amount: p.actualVal, verified: false };
          continue;
        }

        const posted = addFinanceTransaction({
          type: 'expense',
          direction: 'out',
          sourceType: p.paymentSource,
          sourceId: `opcost_${item.id}_${monthKey}`,
          date: p.paymentDate,
          amount: p.actualVal,
          categoryId: item.categoryId || 'cat_general',
          departmentId: 'dept_workshop',
          accountId: item.accountId || 'expense_general',
          description: `مصاريف تشغيل - ${item.name} - ${MONTHS_AR[cfg.month - 1]} ${cfg.year}`,
          paidByName: p.paidBy
        }, { skipSave: true });

        item.actuals[monthKey] = {
          amount: p.actualVal,
          verified: true,
          paymentDate: p.paymentDate,
          paymentSource: p.paymentSource,
          paidBy: p.paidBy,
          postedTxId: posted?.id || ''
        };

        if (p.adoptDefault) item.amount = p.actualVal;
      }

      if (!omni.adminSettings) omni.adminSettings = {};
      omni.adminSettings.workshopOperatingCosts = settings;
      saveData();

      if (typeof showToast === 'function') showToast('✅ تم حفظ مصاريف التشغيل وتحديث التقويم', 'success');
      return true;
    },
    () => {
      renderModalCostRows();
    }
  );

  delete window.addCostItemFromModal;
  delete window.deleteCostItemFromModal;
  delete window.toggleOpcVerifyPanel;
  delete window.setOpcAllocationBasis;
  delete window.toggleOpcPocketField;
  delete window.applyOpcSuggestion;
  delete window.undoOpcPostedItem;
  if (opcModalBoxEl) opcModalBoxEl.classList.remove('opc-modal-wide');

  if (confirmed) {
    renderAttendanceCalendar();
  }
}

function selectCalendarDay(day) {
  selectedCalendarDay = day;
  renderAttendanceCalendar();
}

function calendarJumpToday() {
  const now = new Date();
  setConfigValue('cfgMonth', now.getMonth() + 1);
  setConfigValue('cfgYear', now.getFullYear());
  selectedCalendarDay = now.getDate();
  renderAttendanceCalendar();
}

// Official, persistent documentation log for verified monthly operating-cost
// items — a standing table on the calendar page (not the transient config
// modal), listing every documented item across every month so it stays
// reviewable after the modal closes. Sorted most recent payment first.
function renderOpcDocumentationLog() {
  const tbody = document.getElementById('opcDocLogBody');
  const statsEl = document.getElementById('opcDocLogStats');
  if (!tbody || !statsEl) return; // section not present on this page build

  ensureOmni();
  const items = (omni.adminSettings?.workshopOperatingCosts?.monthlyItems) || [];
  const rows = [];
  items.forEach(item => {
    Object.entries(item.actuals || {}).forEach(([monthKey, record]) => {
      if (!record || record.verified !== true) return;
      rows.push({
        monthKey,
        itemName: item.name,
        amount: Number(record.amount) || 0,
        paymentDate: record.paymentDate || '',
        paymentSource: record.paymentSource || 'cashbox',
        paidBy: record.paidBy || '',
        posted: !!record.postedTxId
      });
    });
  });

  rows.sort((a, b) => (b.paymentDate || b.monthKey).localeCompare(a.paymentDate || a.monthKey) || b.monthKey.localeCompare(a.monthKey));

  const totalAmount = rows.reduce((sum, r) => sum + r.amount, 0);
  statsEl.innerHTML = `
    <span><strong>${rows.length}</strong> قيد موثّق</span>
    <span><strong>${formatMoneyReadable(totalAmount)}</strong> إجمالي موثّق</span>
  `;

  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="opc-doclog-empty">لا توجد بنود موثّقة بعد. وثّق مصروفاً من نافذة "مصاريف التشغيل" ليظهر هنا.</td></tr>`;
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const [y, m] = r.monthKey.split('-');
    const monthLabel = `${MONTHS_AR[Number(m) - 1] || m} ${y}`;
    const sourceLabel = r.paymentSource === 'person_pocket' ? `جيب ${escapeHtml(r.paidBy || 'المالك')}` : 'قاصة الورشة';
    const statusBadge = r.posted
      ? `<span class="opc-doclog-badge opc-doclog-posted"><i class="fa-solid fa-lock"></i> مرحّل</span>`
      : `<span class="opc-doclog-badge opc-doclog-pending"><i class="fa-solid fa-triangle-exclamation"></i> غير مرحّل</span>`;
    return `
      <tr>
        <td>${escapeHtml(monthLabel)}</td>
        <td>${escapeHtml(r.itemName)}</td>
        <td class="opc-doclog-amount">${formatMoneyReadable(r.amount)}</td>
        <td>${escapeHtml(r.paymentDate || '-')}</td>
        <td>${sourceLabel}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');
}

// Splits the month into actual-vs-forecast on both the payroll AND the
// operating-cost side (requirement: never mix a forecast total into a
// finalized/actual figure). A day only ever contributes to one side —
// getCalendarDayData already resolved its `mode`, so there's no double
// counting between actualLabor/forecastLabor or actualOperating/
// forecastOperating.
function getCalendarMonthForecastSummary(year, month, allDayData) {
  const monthClosed = isPayrollMonthClosed(year, month);
  const activeEmployees = employees.filter(emp => emp && emp.name && employeeHasActiveDayInMonth(emp, year, month));

  let actualLabor = 0, forecastLabor = 0, actualOperating = 0, forecastOperating = 0;
  let actualDays = 0, forecastDays = 0, missingDays = 0, weeklyOffDays = 0;
  allDayData.forEach(day => {
    if (day.mode === 'forecast') {
      forecastLabor += day.forecastLaborCost;
      forecastOperating += day.operatingShareForDay;
      forecastDays++;
    } else {
      actualLabor += day.laborDueCost;
      actualOperating += day.operatingShareForDay;
      if (day.mode === 'actual') actualDays++;
      else if (day.mode === 'missing') missingDays++;
      else if (day.mode === 'weekly_off') weeklyOffDays++;
    }
  });

  const operating = getWorkshopOperatingCostBreakdown(year, month);
  return {
    mode: monthClosed ? 'closed' : (forecastDays > 0 ? (actualDays > 0 ? 'mixed' : 'forecast') : 'actual'),
    monthClosed,
    activeEmployees: activeEmployees.length,
    actualLabor,
    forecastLabor,
    actualOperating,
    forecastOperating,
    operatingMonthlyTotal: operating.monthlyTotal,
    totalActual: actualLabor + actualOperating,
    totalForecast: forecastLabor + forecastOperating,
    // The authoritative grand total still uses the month's full fixed-cost
    // total (not actualOperating+forecastOperating), because 'manual'-basis
    // items aren't auto-spread across days and would otherwise be silently
    // dropped from this figure.
    projectedGrandTotal: actualLabor + forecastLabor + operating.monthlyTotal,
    actualDays,
    forecastDays,
    missingDays,
    weeklyOffDays
  };
}

function buildCalendarMonthForecastBox(summary, year, month) {
  const modeLabel = summary.mode === 'closed' ? 'شهر مغلق' : summary.mode === 'actual' ? 'خلاصة فعلية' : summary.mode === 'forecast' ? 'توقع شهري كامل' : 'فعلي + تنبؤي';
  const forecastLine = summary.mode === 'actual' || summary.mode === 'closed'
    ? `<span>أيام فعلية</span><strong>${summary.actualDays}</strong>`
    : `<span>أيام مستقبلية متوقعة</span><strong>${summary.forecastDays}</strong>`;
  const missingLine = summary.missingDays > 0
    ? `<div class="cal-month-forecast-missing"><span>أيام بيانات ناقصة</span><strong>${summary.missingDays}</strong></div>`
    : '';
  return `
    <div class="cal-month-forecast-box ${summary.mode === 'closed' ? 'cal-month-forecast-box-closed' : ''}" role="note" aria-label="توقعات شهر ${MONTHS_AR[month - 1]} ${year}">
      <div class="cal-month-forecast-head">
        <i class="fa-solid ${summary.mode === 'closed' ? 'fa-lock' : 'fa-chart-line'}"></i>
        <div>
          <strong>${modeLabel}</strong>
          <small>${MONTHS_AR[month - 1]} ${year}</small>
        </div>
      </div>
      <div class="cal-month-forecast-grid">
        <div><span>موظفون داخل الحساب</span><strong>${summary.activeEmployees}</strong></div>
        <div>${forecastLine}</div>
        <div><span>أجور فعلية</span><strong>${formatMoneyReadable(summary.actualLabor)}</strong></div>
        <div class="cal-forecast-stat"><span>أجور متوقعة</span><strong>${formatMoneyReadable(summary.forecastLabor)}</strong></div>
        <div><span>تشغيل فعلي</span><strong>${formatMoneyReadable(summary.actualOperating)}</strong></div>
        <div class="cal-forecast-stat"><span>تشغيل متوقع</span><strong>${formatMoneyReadable(summary.forecastOperating)}</strong></div>
        ${missingLine}
        <div class="cal-month-forecast-total"><span>إجمالي الشهر المتوقع</span><strong>${formatMoneyReadable(summary.projectedGrandTotal)}</strong></div>
      </div>
    </div>
  `;
}

function renderAttendanceCalendar() {
  renderAttendanceFreshnessBanner('pageCalendar', '.calendar-container-pro');
  const container = document.getElementById('attendanceCalendarGrid');
  const cfg = getConfig();
  const daysInMonth = getDaysInMonth(cfg.year, cfg.month);
  const firstDay = new Date(cfg.year, cfg.month - 1, 1).getDay();

  document.getElementById('calHeaderMonthYear').textContent = `${MONTHS_AR[cfg.month - 1]} ${cfg.year}`;
  container.innerHTML = '';

  const allDayData = Array.from({ length: daysInMonth }, (_, idx) => getCalendarDayData(cfg.year, cfg.month, idx + 1));
  const today = new Date();
  if (
    selectedCalendarDay == null &&
    today.getFullYear() === cfg.year &&
    today.getMonth() + 1 === cfg.month
  ) {
    selectedCalendarDay = today.getDate();
  }
  if (selectedCalendarDay == null || selectedCalendarDay > daysInMonth) {
    const firstAttendanceDay = allDayData.find(day => day.rows.length > 0);
    selectedCalendarDay = firstAttendanceDay ? firstAttendanceDay.day : 1;
  }

  CALENDAR_DAY_NAMES.forEach((name, idx) => {
    const head = document.createElement('div');
    head.className = 'cal-weekday' + (idx === 5 ? ' cal-weekday-friday' : '');
    head.textContent = name;
    container.appendChild(head);
  });

  // Padding for first day
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day-box cal-day-off';
    container.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const box = document.createElement('div');
    const dayData = allDayData[d - 1];
    box.className = [
      'cal-day-box',
      dayData.isFriday ? 'cal-day-friday' : '',
      dayData.rows.length ? 'cal-day-has-attendance' : 'cal-day-empty',
      selectedCalendarDay === d ? 'cal-day-selected' : ''
    ].filter(Boolean).join(' ');
    box.setAttribute('role', 'button');
    box.setAttribute('tabindex', '0');
    box.onclick = () => selectCalendarDay(d);
    box.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') selectCalendarDay(d);
    };

    const dateNum = document.createElement('div');
    dateNum.className = 'cal-date-num';
    dateNum.innerHTML = `<span>${d}</span><small>${dayData.dayName}</small>`;
    box.appendChild(dateNum);

    const summary = document.createElement('div');
    summary.className = 'cal-day-summary';
    summary.innerHTML = `
      <strong>${dayData.rows.length}</strong>
      <span>حضور</span>
      <em>${dayData.totalHours.toFixed(1)} س</em>
    `;
    box.appendChild(summary);
    if (dayData.rows.length) {
      const moneyMini = document.createElement('div');
      moneyMini.className = 'calendar-finance-mini';
      moneyMini.innerHTML = `<b>كلفة اليوم</b> ${formatMoneyReadable(dayData.netDailyCost)}<small>سلف ${formatMoneyReadable(dayData.totalAdvances)}</small>`;
      box.appendChild(moneyMini);
    }
    // Friday shows the week's rolled-up operating + labor cost as its own
    // distinct badge — even with no attendance rows of its own, since it
    // summarizes the preceding 6 working days, not Friday itself.
    if (dayData.isFriday && dayData.weeklyTotalShare > 0) {
      const weeklyMini = document.createElement('div');
      weeklyMini.className = 'cal-weekly-mini-badge';
      weeklyMini.innerHTML = `<b>📅 أسبوعي</b> ${formatMoneyReadable(dayData.weeklyTotalShare)}`;
      box.appendChild(weeklyMini);
    }

    const dots = document.createElement('div');
    dots.className = 'cal-emp-dots';

    dayData.rows.slice(0, 8).forEach(item => {
      const badge = document.createElement('div');
      badge.className = 'cal-emp-badge';
      badge.textContent = item.name.substring(0, 2);
      badge.title = `${item.name} (${item.rec.checkIn || '--:--'} - ${item.rec.checkOut || '--:--'})`;
      badge.style.borderColor = item.statusColor;
      dots.appendChild(badge);
    });

    if (dayData.rows.length > 8) {
      const more = document.createElement('div');
      more.className = 'cal-emp-more';
      more.textContent = `+${dayData.rows.length - 8}`;
      dots.appendChild(more);
    }

    box.appendChild(dots);
    container.appendChild(box);
  }

  const selectedData = allDayData.find(day => day.day === selectedCalendarDay) || allDayData[0];
  document.getElementById('calDailyTotalHours').textContent = selectedData ? selectedData.totalHours.toFixed(1) : '0';
  document.getElementById('calDailyActiveEmps').textContent = selectedData ? selectedData.rows.length : '0';
  renderCalendarDayDetails(selectedData);
  renderOpcDocumentationLog();
}

function renderAttendanceCalendar() {
  renderAttendanceFreshnessBanner('pageCalendar', '.calendar-container-pro');
  const container = document.getElementById('attendanceCalendarGrid');
  if (!container) return;
  const cfg = getConfig();
  const daysInMonth = getDaysInMonth(cfg.year, cfg.month);
  const firstDay = new Date(cfg.year, cfg.month - 1, 1).getDay();
  const header = document.getElementById('calHeaderMonthYear');
  if (header) header.textContent = `${MONTHS_AR[cfg.month - 1]} ${cfg.year}`;
  container.innerHTML = '';

  const allDayData = Array.from({ length: daysInMonth }, (_, idx) => getCalendarDayData(cfg.year, cfg.month, idx + 1));
  const today = new Date();
  if (selectedCalendarDay == null && today.getFullYear() === cfg.year && today.getMonth() + 1 === cfg.month) {
    selectedCalendarDay = today.getDate();
  }
  if (selectedCalendarDay == null || selectedCalendarDay > daysInMonth) {
    const firstVisibleDay = allDayData.find(day => day.rows.length > 0 || day.hasForecast);
    selectedCalendarDay = firstVisibleDay ? firstVisibleDay.day : 1;
  }

  CALENDAR_DAY_NAMES.forEach((name, idx) => {
    const head = document.createElement('div');
    head.className = 'cal-weekday' + (idx === 5 ? ' cal-weekday-friday' : '');
    head.textContent = name;
    container.appendChild(head);
  });

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-day-box cal-day-off';
    container.appendChild(empty);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dayData = allDayData[d - 1];
    const badgeRows = dayData.hasForecast ? dayData.forecastRows : dayData.rows;
    const box = document.createElement('div');
    box.className = [
      'cal-day-box',
      `cal-day-mode-${dayData.mode}`,
      dayData.isFriday ? 'cal-day-friday' : '',
      dayData.hasForecast ? 'cal-day-forecast' : '',
      dayData.rows.length ? 'cal-day-has-attendance' : 'cal-day-empty',
      selectedCalendarDay === d ? 'cal-day-selected' : ''
    ].filter(Boolean).join(' ');
    box.setAttribute('role', 'button');
    box.setAttribute('tabindex', '0');
    box.onclick = () => selectCalendarDay(d);
    box.onkeydown = (event) => {
      if (event.key === 'Enter' || event.key === ' ') selectCalendarDay(d);
    };

    const dateNum = document.createElement('div');
    dateNum.className = 'cal-date-num';
    dateNum.innerHTML = `<span>${d}</span><small>${dayData.dayName}</small>`;
    box.appendChild(dateNum);

    const modeBadge = document.createElement('div');
    modeBadge.className = `cal-day-mode-badge cal-day-mode-badge-${dayData.mode}`;
    modeBadge.innerHTML = `<i class="fa-solid ${dayData.modeIcon}"></i> ${dayData.modeLabel}`;
    box.appendChild(modeBadge);

    const visibleCount = dayData.hasForecast ? dayData.forecastRows.length : dayData.rows.length;
    const visibleHours = dayData.hasForecast ? dayData.forecastHours : dayData.totalHours;
    const visibleLabel = dayData.hasForecast ? 'متوقع' : 'حضور';
    const summary = document.createElement('div');
    summary.className = 'cal-day-summary';
    summary.innerHTML = `<strong>${visibleCount}</strong><span>${visibleLabel}</span><em>${visibleHours.toFixed(1)} س</em>`;
    box.appendChild(summary);

    if (dayData.rows.length || dayData.hasForecast) {
      const moneyMini = document.createElement('div');
      moneyMini.className = 'calendar-finance-mini' + (dayData.hasForecast ? ' calendar-finance-mini-forecast' : '');
      moneyMini.innerHTML = dayData.hasForecast
        ? `<b>متوقع</b> ${formatMoneyReadable(dayData.netDailyCost)}<small>بدون سلف</small>`
        : `<b>كلفة اليوم</b> ${formatMoneyReadable(dayData.netDailyCost)}<small>سلف ${formatMoneyReadable(dayData.totalAdvances)}</small>`;
      box.appendChild(moneyMini);
    }

    if (dayData.isFriday && dayData.weeklyTotalShare > 0) {
      const weeklyMini = document.createElement('div');
      weeklyMini.className = 'cal-weekly-mini-badge';
      weeklyMini.innerHTML = `<b>أسبوعي</b> ${formatMoneyReadable(dayData.weeklyTotalShare)}`;
      box.appendChild(weeklyMini);
    }

    const dots = document.createElement('div');
    dots.className = 'cal-emp-dots';
    badgeRows.slice(0, 8).forEach(item => {
      const badge = document.createElement('div');
      badge.className = 'cal-emp-badge' + (item.isForecast ? ' cal-emp-badge-forecast' : '');
      badge.textContent = item.name.substring(0, 2);
      badge.title = item.isForecast ? `${item.name} (متوقع)` : `${item.name} (${item.rec.checkIn || '--:--'} - ${item.rec.checkOut || '--:--'})`;
      badge.style.borderColor = item.statusColor;
      dots.appendChild(badge);
    });
    if (badgeRows.length > 8) {
      const more = document.createElement('div');
      more.className = 'cal-emp-more';
      more.textContent = `+${badgeRows.length - 8}`;
      dots.appendChild(more);
    }

    box.appendChild(dots);
    container.appendChild(box);
  }

  const monthSummary = getCalendarMonthForecastSummary(cfg.year, cfg.month, allDayData);
  container.insertAdjacentHTML('beforeend', buildCalendarMonthForecastBox(monthSummary, cfg.year, cfg.month));

  const closeBtn = document.getElementById('calendarCloseMonthBtn');
  if (closeBtn) {
    const closed = monthSummary.monthClosed;
    closeBtn.innerHTML = closed
      ? '<i class="fa-solid fa-lock-open"></i><span>إعادة فتح الشهر</span>'
      : '<i class="fa-solid fa-lock"></i><span>إغلاق الشهر</span>';
    closeBtn.title = closed ? 'إعادة فتح الشهر لاستئناف التوقع' : 'إغلاق الشهر وتجميد التوقعات';
    closeBtn.classList.toggle('calendar-month-closed-active', closed);
  }

  const selectedData = allDayData.find(day => day.day === selectedCalendarDay) || allDayData[0];
  const selectedHours = selectedData ? (selectedData.hasForecast ? selectedData.forecastHours : selectedData.totalHours) : 0;
  const selectedEmployees = selectedData ? (selectedData.hasForecast ? selectedData.forecastRows.length : selectedData.rows.length) : 0;
  const hoursEl = document.getElementById('calDailyTotalHours');
  const empsEl = document.getElementById('calDailyActiveEmps');
  if (hoursEl) hoursEl.textContent = selectedHours.toFixed(1);
  if (empsEl) empsEl.textContent = selectedEmployees;
  renderCalendarDayDetails(selectedData);
  renderOpcDocumentationLog();
}

window.toggleCalendarMonthClosed = function() {
  const cfg = getConfig();
  setPayrollMonthClosed(cfg.year, cfg.month, !isPayrollMonthClosed(cfg.year, cfg.month));
};

// ─── Attendance forecast regression tests ───
// Manual diagnostic (run from the console: runAttendanceForecastRegressionTests()).
// Swaps the live `employees` array and the operating-cost/closed-month admin
// settings for a synthetic fixture, runs the scenarios, and restores the
// originals in `finally` — never touches real data, never persists anything
// (no saveData() call anywhere in here). Uses the REAL current year/month so
// isEmployeeActiveOnDate's auto-resignation guard (anchored to the real
// wall-clock date) doesn't false-positive against synthetic dates.
function runAttendanceForecastRegressionTests() {
  const results = [];
  const assert = (name, cond, detail = '') => results.push({ name, pass: !!cond, detail });

  const originalEmployees = employees;
  if (!omni) omni = {};
  if (!omni.adminSettings) omni.adminSettings = {};
  const originalWorkshopCosts = omni.adminSettings.workshopOperatingCosts;
  const originalClosedMonths = omni.adminSettings.closedPayrollMonths;
  const originalManualCutoff = omni.adminSettings.lastCompleteAttendanceUpdateDate;
  const originalManualCutoffAlt = omni.adminSettings.lastCompleteDatabaseUpdateDate;
  const originalSelectedDay = selectedCalendarDay;

  try {
    omni.adminSettings.workshopOperatingCosts = {
      monthlyItems: [
        { id: 'rent', name: 'إيجار الورشة', amount: 300000, active: true, allocationBasis: 'calendar_days' },
        { id: 'internet', name: 'اشتراك الإنترنت', amount: 60000, active: true, allocationBasis: 'calendar_days' },
        { id: 'electricity', name: 'اشتراك الكهرباء', amount: 90000, active: true, allocationBasis: 'calendar_days' }
      ]
    };
    omni.adminSettings.closedPayrollMonths = [];
    omni.adminSettings.lastCompleteAttendanceUpdateDate = null;
    omni.adminSettings.lastCompleteDatabaseUpdateDate = null;

    const now = new Date();
    const YEAR = now.getFullYear();
    const MONTH = now.getMonth() + 1;
    const prevMonth = MONTH === 1 ? 12 : MONTH - 1;
    const prevYear = MONTH === 1 ? YEAR - 1 : YEAR;
    const prevMonthLastDay = getDaysInMonth(prevYear, prevMonth);
    const nextNonFriday = (startDay) => {
      let d = startDay;
      while (isFriday(YEAR, MONTH, d)) d++;
      return d;
    };

    const empA = {
      id: 'test_emp_forecast_a',
      name: 'موظف اختبار توقع',
      active: true,
      salary: 300000,
      records: [
        { year: prevYear, month: prevMonth, day: prevMonthLastDay, checkIn: '08:00', checkOut: '17:00', status: 'normal', hours: 8 }
      ]
    };
    employees = [empA];

    // 1) A month with the last update on the previous month's end shows the
    //    current month as forecast, never as a confirmed zero.
    const dayOne = nextNonFriday(1);
    const day1Data = getCalendarDayData(YEAR, MONTH, dayOne);
    assert(
      'شهر بلا استيراد جديد يظهر تنبؤي وليس صفراً فعلياً',
      day1Data.mode === 'forecast' && day1Data.rows.length === 0,
      `day=${dayOne} mode=${day1Data.mode} rows=${day1Data.rows.length}`
    );

    // 2) A day after the cutoff with no attendance records forecasts the
    //    active employee.
    assert(
      'يوم بعد آخر تحديث يتوقع الموظفين النشطين',
      day1Data.forecastRows.length === 1 && day1Data.forecastRows[0].name === empA.name,
      `forecastRows=${day1Data.forecastRows.length}`
    );

    // 3) Friday shows no normal payroll forecast, but fixed (calendar_days)
    //    operating expenses are still allocated to it.
    const firstFriday = getFridaysInMonth(YEAR, MONTH)[0];
    if (firstFriday) {
      const fridayData = getCalendarDayData(YEAR, MONTH, firstFriday);
      assert(
        'الجمعة بلا أجور تنبؤية عادية لكن مصاريف التشغيل الثابتة تُحسب',
        fridayData.mode === 'weekly_off' && fridayData.forecastLaborCost === 0 && fridayData.operatingShareForDay > 0,
        `mode=${fridayData.mode} forecastLaborCost=${fridayData.forecastLaborCost} opShare=${fridayData.operatingShareForDay}`
      );
    } else {
      assert('الجمعة بلا أجور تنبؤية عادية لكن مصاريف التشغيل الثابتة تُحسب', false, 'لا توجد جمعة في الشهر (غير متوقع)');
    }

    // 4) Importing actual attendance for a forecast day converts ONLY that
    //    day to actual — the next day stays forecast.
    const dayTwo = nextNonFriday(dayOne + 1);
    const dayThree = nextNonFriday(dayTwo + 1);
    empA.records.push({ year: YEAR, month: MONTH, day: dayTwo, checkIn: '08:00', checkOut: '17:00', status: 'normal', hours: 8 });
    const day2Data = getCalendarDayData(YEAR, MONTH, dayTwo);
    const day3Data = getCalendarDayData(YEAR, MONTH, dayThree);
    assert(
      'استيراد حضور فعلي ليوم واحد يحوّله لفعلي دون التأثير على بقية الأيام',
      day2Data.mode === 'actual' && day3Data.mode === 'forecast',
      `day${dayTwo}=${day2Data.mode} day${dayThree}=${day3Data.mode}`
    );

    // 5) Fixed rent/internet/electricity still appear on a day with zero
    //    employees.
    employees = [];
    const emptyDayData = getCalendarDayData(YEAR, MONTH, nextNonFriday(5));
    assert(
      'مصاريف الإيجار/الإنترنت/الكهرباء تظهر رغم صفر موظفين',
      emptyDayData.rows.length === 0 && emptyDayData.operatingShareForDay > 0,
      `rows=${emptyDayData.rows.length} opShare=${emptyDayData.operatingShareForDay}`
    );

    // 6) Forecast totals never create accounting journal entries or payable
    //    balances — purely computed for display, nothing posted.
    const txCountBefore = (finance?.transactions || []).length;
    const allDays = Array.from({ length: getDaysInMonth(YEAR, MONTH) }, (_, i) => getCalendarDayData(YEAR, MONTH, i + 1));
    getCalendarMonthForecastSummary(YEAR, MONTH, allDays);
    getPayrollForecastSummary(YEAR, MONTH);
    const txCountAfter = (finance?.transactions || []).length;
    assert(
      'التوقعات لا تُنشئ قيود محاسبية أو مستحقات فعلية',
      txCountAfter === txCountBefore,
      `before=${txCountBefore} after=${txCountAfter}`
    );
  } finally {
    employees = originalEmployees;
    omni.adminSettings.workshopOperatingCosts = originalWorkshopCosts;
    omni.adminSettings.closedPayrollMonths = originalClosedMonths;
    omni.adminSettings.lastCompleteAttendanceUpdateDate = originalManualCutoff;
    omni.adminSettings.lastCompleteDatabaseUpdateDate = originalManualCutoffAlt;
    selectedCalendarDay = originalSelectedDay;
  }

  const passCount = results.filter(r => r.pass).length;
  const allPassed = passCount === results.length;
  if (typeof console !== 'undefined') {
    console.log(`%cattendance forecast regression: ${passCount}/${results.length} passed`, allPassed ? 'color:#34d399;font-weight:bold' : 'color:#f87171;font-weight:bold');
    if (typeof console.table === 'function') {
      console.table(results.map(r => ({ الفحص: r.name, النتيجة: r.pass ? 'PASS' : 'FAIL', التفاصيل: r.detail })));
    }
  }
  return { passCount, total: results.length, allPassed, results };
}
window.runAttendanceForecastRegressionTests = runAttendanceForecastRegressionTests;

function prevMonthCal() {
  let m = parseInt(getConfigNumber('cfgMonth', 3), 10);
  let y = parseInt(getConfigNumber('cfgYear', 2026), 10);
  if (m === 1) { m = 12; y--; } else { m--; }
  setConfigValue('cfgMonth', m);
  setConfigValue('cfgYear', y);
  selectedCalendarDay = null;
  renderAttendanceCalendar();
}

function nextMonthCal() {
  let m = parseInt(getConfigNumber('cfgMonth', 3), 10);
  let y = parseInt(getConfigNumber('cfgYear', 2026), 10);
  if (m === 12) { m = 1; y++; } else { m++; }
  setConfigValue('cfgMonth', m);
  setConfigValue('cfgYear', y);
  selectedCalendarDay = null;
  renderAttendanceCalendar();
}

// ─── Filter Table by Month ───
function filterTableByMonth() {
  const filterValue = document.getElementById('monthFilter').value;
  const rows = document.querySelectorAll('#importedDataTable tbody tr');

  rows.forEach(row => {
    const dateCell = row.cells[1].textContent; // Date column
    if (!filterValue) {
      row.style.display = '';
    } else {
      row.style.display = dateCell.includes(`/${filterValue}/`) ? '' : 'none';
    }
  });
}

// ─── Export/Import Data ───
function exportData() {
  const data = {
    employees,
    finance: ensureFinance(),
    config: getConfig(),
    dateGenerated: new Date().toISOString(),
    version: '2.1'
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `octagon_payroll_backup_${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('✅ تم تصدير النسخة الاحتياطية بنجاح', 'success');
}

function importDataClick() {
  document.getElementById('importFile').click();
}

function importData(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      if (data.employees) {
        if (confirm('هل تريد استبدال البيانات الحالية بالنسخة المستوردة؟')) {
          employees = data.employees;
          finance = data.finance || defaultFinanceState();
          omni = data.omni || defaultOmniState();
          ensureFinance();
          ensureOmni();
          // Restoring an older backup taken before the balance sign-flip migration:
          // bring its employees up to the current convention too.
          migrateEmployeePrevAdvanceSignConvention();
          if (data.config) {
            setConfigValue('cfgMonth', data.config.month);
            setConfigValue('cfgYear', data.config.year);
            setConfigValue('cfgSalary', data.config.nominalSalary);
            if (data.config.cfgTransport != null) setConfigValue('cfgTransport', data.config.cfgTransport);
            if (data.config.cfgFood != null) setConfigValue('cfgFood', data.config.cfgFood);
          }
          saveData();
        }
      } else {
        showToast('❌ ملف غير صالح', 'error');
      }
    } catch (err) {
      showToast('❌ فشل في قراءة الملف', 'error');
    }
  };
  reader.readAsText(file);
}

function getConfig() {
  let y = parseInt(getConfigNumber('cfgYear', 2026), 10) || 2026;
  return {
    year: y,
    month: parseInt(getConfigNumber('cfgMonth', 3), 10) || 3,
    nominalSalary: getConfigNumber('cfgSalary', 500000) || 500000,
    cfgTransport: getConfigNumber('cfgTransport', 50000) || 50000,
    cfgFood: getConfigNumber('cfgFood', 50000) || 50000,
  };
}

function repairKnownArabicMojibake(value) {
  if (typeof value !== 'string' || !/[\uFFFD\u00D8\u00D9\u00F0\u0178\u00E2\u00C3]/.test(value)) return value;
  return value
    .replace(/\uFFFD\uFFFDمت/g, 'تمت')
    .replace(/الخط\uFFFD\uFFFDة/g, 'الخطوة')
    .replace(/ليوم \uFFFD\uFFFDد/g, 'ليوم غد');
}

function sanitizePersistedArabicText(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return value;
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, idx) => {
      value[idx] = typeof item === 'string' ? repairKnownArabicMojibake(item) : sanitizePersistedArabicText(item, seen);
    });
    return value;
  }
  Object.keys(value).forEach(key => {
    value[key] = typeof value[key] === 'string' ? repairKnownArabicMojibake(value[key]) : sanitizePersistedArabicText(value[key], seen);
  });
  return value;
}

// ─── Initialize ───
window.addEventListener('DOMContentLoaded', async () => {
  console.log('🚀 SYSTEM INITIALIZING (AUTO-MODE)');

  try {

  // 1. Initial Setup
  initTheme();
  bindSidebarNavigation();
  rebuildSidebarNavigation();
  const switcher = document.getElementById('authUserSwitcher');
  if (switcher && window.PentagonAuth) {
    switcher.value = window.PentagonAuth._currentUserId;
  }
  await loadData();
  window.__dataLoadComplete = true; // unlock saveData() now that real data is loaded
  if (migrateEmployeePrevAdvanceSignConvention()) saveData();
  ensureFinance();
  if (!finance.customers || finance.customers.length === 0) {
    finance.customers = [{
      id: 'cust_demo',
      name: 'عميل تجريبي',
      phone: '07700000000',
      companyName: 'شركة التجربة والبرهان',
      shopName: 'معرض التجربة والبرهان',
      openingBalance: 0,
      notes: 'عميل افتراضي تجريبي لمحاكاة البوابة'
    }];
  }
  // Start remembering visited pages now; the boot landing page is resolved later
  // (just before we navigate) so PermissionService is fully initialised by then.
  startLastPageTracking();
  const urlParams = new URLSearchParams(window.location.search);
  const urlCustomerId = urlParams.get('customer');
  if (urlCustomerId) {
    currentPage = 'customer_portal';
    window.customerPortalInitialCustomerId = urlCustomerId;
  }
  ensureOmni();
  applyOrbStyle(getAdminSetting('ui.orbStyle', 'classic'));
  updateGlobalCurrencyUI();
  resetSurfaceViewStateForExamples();
  // Guard: do NOT save during init if employees is empty. A previous race wrote `employees:[]` over
  // the server on every reload, wiping the workforce. The server now also refuses to wipe, but skip
  // the unnecessary write here too.
  if (Array.isArray(employees) && employees.length > 0) {
    saveData(true);
  } else {
    console.warn('[init] skipping startup saveData — employees array is empty (would wipe server).');
  }
  refreshAuthUserSwitcher();
  checkLoginStatus();
  enforceUIPermissions();
  try { autoGenerateMaintenanceTasks(); } catch (_) {}

  // 3. UI Setup
  const cfg = getConfig();
  const fridays = getFridaysInMonth(cfg.year, cfg.month);
  const inpFridayDays = document.getElementById('inpFridayDays');
  const daysMonthDisplay = document.getElementById('daysMonthDisplay');

  if (inpFridayDays) inpFridayDays.value = `0/${fridays.length}`;
  if (daysMonthDisplay) daysMonthDisplay.textContent = getDaysInMonth(cfg.year, cfg.month);

  refreshCalcEmpDropdown();
  refreshEmpFilterDropdown();

  // 3.5 Land on the boot page. Resolve it here (PermissionService is ready by now)
  // so we can "resume where you left off". A ?customer= deep-link takes priority.
  // Use window.switchPage (the template-loading guard) so the landing view is
  // hydrated first, plus a short re-land retry for module-owned pages whose
  // switchPage wrapper may not be wired yet this early in boot.
  if (currentPage !== 'customer_portal') currentPage = getBootLandingPage();
  const __bootLanding = currentPage;
  (window.switchPage || switchPage)(__bootLanding);
  setTimeout(() => {
    if (currentPage !== __bootLanding) return; // user already navigated — leave them be
    const active = document.querySelector(`.nav-btn[data-page="${__bootLanding}"].active`);
    if (!active) (window.switchPage || switchPage)(__bootLanding);
  }, 900);

  // 4. Auto-Fetch Excel Data — only when on import/timesheet views to avoid startup noise
  if (currentPage === 'timesheet' || currentPage === 'import') {
    try {
      const response = await fetch('merged_attendance_biometric.xlsx');
      if (!response.ok) throw new Error('not found');
      const buffer = await response.arrayBuffer();
      await ensureOctagonLibrary('xlsx', 'XLSX', 'Excel import library unavailable');
      await processExcelBuffer(buffer);
      showToast('تم تحديث البيانات تلقائياً من ملف البصمة', 'success');
    } catch (e) {
      console.info('Biometric file not found — use Import page to load manually.');
    }
  }

  // 5. Final UI Refresh
  if (currentPage === 'timesheet') renderTimesheet();
  else if (currentPage === 'report') renderReport();
  else if (currentPage === 'employees') renderEmployeesTable();
  else if (currentPage === 'calendar') renderAttendanceCalendar();
  else if (document.getElementById('inpAttendance')) {
    // Only run the calculator recompute when its inputs are actually mounted.
    // On boot the default page's section loads lazily, so this ran against a
    // null form ("Octagon startup interrupted"). No behaviour change when present.
    validateDays();
    autoCalcEligibleFridays();
    recalculate();
  }
  financeRefreshAll();
  omniRefreshAll();

  // 6. Cleanup
  setTimeout(() => {
    hideLoadingOverlay('init-success');
    console.log('✨ System Ready');
  }, 500);

  // 7. Claude/Codex Project Status — persistent strip showing current focus + progress
  // (always visible, NOT dismissable; updated by the AI at the end of every section).
  checkClaudeProjectStatus();
  // 8. Claude/Codex Review Pointer — auto-navigate to the section the AI flagged for review
  // (dismissable via "تم الفحص" button; appears BELOW the status strip when active).
  checkClaudeReviewPointer();
  setTimeout(ensureAIChatLauncherFromApp, 650);
  } catch (error) {
    console.error('Octagon startup interrupted:', error);
    try {
      showToast('تعذر تحميل بعض أجزاء النظام، تم فتح الواجهة الأساسية.', 'warning');
    } catch (toastError) {}
  } finally {
    setTimeout(() => {
      hideLoadingOverlay('init-finally');
      console.log('System Ready');
    }, 500);
  }
});

// ═══════════ CLAUDE/CODEX PROJECT STATUS BANNER ═══════════
// Permanent strip at the top of every page showing the current project focus, recent
// completions, the next candidates, and overall progress. Not dismissable — always visible
// so the user can open the app any day and immediately see where the work stands. Maintained
// ===== OCTAGON AI PROJECT DETAILS =====
// The project status and review pointer files are published into the movable AI
// assistant. Fixed top banners were removed so the app keeps the full page height.
async function checkClaudeProjectStatus() {
  try {
    const res = await fetch('/claude-status.json', { cache: 'no-store' });
    if (!res.ok) return;
    const status = await res.json();
    if (!status || !status.currentFocus) return;
    publishProjectStatusToAi(status);
  } catch (e) {
    // Status file missing or invalid: no visible interruption.
  }
}

function publishProjectStatusToAi(status) {
  const oldBanner = document.getElementById('claudeStatusBanner');
  if (oldBanner) oldBanner.remove();
  document.body.classList.remove('has-status-banner');
  window.OctagonProjectStatus = status;
  window.PentagonProjectStatus = status; // compatibility for older integrations
  window.dispatchEvent(new CustomEvent('octagon:project-status', { detail: status }));
}

function renderClaudeProjectStatus(status) {
  publishProjectStatusToAi(status);
}

async function checkClaudeReviewPointer() {
  try {
    const res = await fetch('/claude-review-pointer.json', { cache: 'no-store' });
    if (!res.ok) return;
    const pointer = await res.json();
    if (!pointer || !pointer.target || !pointer.id) return;
    publishReviewPointerToAi(pointer);
  } catch (e) {
    // Pointer file missing, invalid, or unavailable: silently ignore.
  }
}

function publishReviewPointerToAi(pointer) {
  const oldBanner = document.getElementById('claudeReviewBanner');
  if (oldBanner) oldBanner.remove();
  document.body.classList.remove('has-review-banner');
  window.OctagonReviewPointer = pointer;
  window.PentagonReviewPointer = pointer; // compatibility for older integrations
  window.dispatchEvent(new CustomEvent('octagon:review-pointer', { detail: pointer }));
}

function renderClaudeReviewBanner(pointer) {
  publishReviewPointerToAi(pointer);
}

function dismissClaudeReviewBanner(id) {
  const list = JSON.parse(localStorage.getItem('octagon.reviewedSectionIds') || localStorage.getItem('pentagon.reviewedSectionIds') || '[]');
  if (!list.includes(id)) list.push(id);
  while (list.length > 50) list.shift();
  localStorage.setItem('octagon.reviewedSectionIds', JSON.stringify(list));
  const banner = document.getElementById('claudeReviewBanner');
  if (banner) banner.remove();
  document.body.classList.remove('has-review-banner');
  if (typeof showToast === 'function') showToast('?? ????? ????? ????????. ?????? ???????? ???? ???? ?????? ?????? ???????.', 'info');
}


// --- OMNISYSTEM Operating Layer ---
// omniDraggedCardId moved to modules/kanban.js
let omniDraggedNodeType = null;



// --- GO 16 DE-MONOLITH BRIDGE: KANBAN BOARD CLUSTER ---
// All Kanban functions, constants, presets, views, filters, and inspector actions (original lines 15987-17508)
// have been moved verbatim to modules/kanban.js.
// ------------------------------------------------------



// T4.15 de-monolith: Workflow Studio renderer/editor moved to modules/workflow-studio.js.

// QC compatibility helpers kept small here so Kanban/QC links remain safe after Task Manager V2.
function normalizeQcRecords() { if (!Array.isArray(omni.qcRecords)) omni.qcRecords = []; (omni.qcRecords || []).forEach(q => { if (!q.id) q.id = makeId('qc'); q.title = q.title || q.type || 'فحص جودة'; q.result = ['pass','fail','pending'].includes(q.result) ? q.result : 'pending'; q.status = q.status || q.result; q.cardId = q.cardId || q.taskRef || ''; if (!Array.isArray(q.activityLog)) q.activityLog = []; if (!Array.isArray(q.checklist)) q.checklist = []; q.costImpact = Number(q.costImpact ?? q.reworkCost ?? 0) || 0; q.reworkCost = q.costImpact; q.failureReason = q.failureReason || q.reason || ''; q.reason = q.failureReason; }); }
function normalizeQcTemplates() { if (!Array.isArray(omni.qcTemplates)) omni.qcTemplates = []; }
function normalizeOperationPackQcFields() { (omni.opPacks || []).forEach(pack => { (pack.steps || []).forEach(step => { if (!step.id) step.id = makeId('opstep'); if (step.requiresQc === undefined) step.requiresQc = step.type === 'qc'; if (!step.qcTemplateId) step.qcTemplateId = ''; if (!Array.isArray(step.qcCriteria)) step.qcCriteria = []; if (step.estimatedMinutes === undefined) step.estimatedMinutes = 0; if (step.extraCost === undefined) step.extraCost = Number(step.costImpact || 0); step.costImpact = calculateStepCostImpact(step, pack); }); const preview = buildOpPackPreview(pack); pack.estimatedTime = `${preview.totalMinutes} دقيقة`; pack.estimatedCost = preview.totalCost; }); }
function getQcRecordsForCard(cardId) { ensureOmni(); return (omni.qcRecords || []).filter(q => q.cardId === cardId || q.taskRef === cardId || (q.sourceType === 'kanban_card' && q.sourceId === cardId)); }
function getCardQcStatus(card) { const recs = getQcRecordsForCard(card.id).concat((card.qcRecordIds || []).map(getQcRecordById).filter(Boolean)); if (recs.some(q => q.result === 'fail')) return { key:'fail', label:'فاشل' }; if (recs.some(q => q.result === 'pass')) return { key:'pass', label:'ناجح' }; if (recs.length) return { key:'pending', label:'قيد الفحص' }; if (isQcRequiredForCard(card)) return { key:'required', label:'QC مطلوب' }; return { key:'none', label:'لا يوجد QC' }; }
function isQcRequiredForCard(card) { return !!(card.requiresQc || (card.machineIds || []).length || (card.materialRequirements || []).length || ['high','urgent'].includes(normalizeTaskPriority(card.priority)) || (card.sopIds || []).some(id => (getSopById(id)?.qcCriteria || []).length)); }
function getQcRequirementReason(sourceType, source) { if (sourceType === 'kanban_card' && source) return isQcRequiredForCard(source) ? 'هذه البطاقة تحتاج فحص جودة قبل التسليم' : 'QC غير إلزامي'; return 'بوابة جودة مطلوبة'; }
function canCardMoveToDone(card) { const st = getCardQcStatus(card); return !isQcRequiredForCard(card) || st.key === 'pass'; }
function createQcRecordForCard(cardId, templateId = '', patch = {}) { ensureOmni(); const card = (omni.kanban.cards || []).find(c => c.id === cardId); if (!card) return null; const qc = { id: makeId('qc'), title: patch.title || `QC: ${card.title}`, type: patch.title || 'فحص جودة', status: patch.result || 'pending', result: patch.result || 'pending', sourceType:'kanban_card', sourceId:card.id, cardId:card.id, taskRef:card.id, department:card.department || '', inspector:'قسم الجودة', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), failureReason:patch.failureReason || patch.reason || '', reason:patch.failureReason || patch.reason || '', severity:patch.severity || 'medium', reworkStatus:'none', costImpact:0, reworkCost:0, qcTemplateId:templateId || '', checklist:[], activityLog:[{ date:new Date().toISOString(), text:'تم إنشاء فحص جودة من البطاقة' }], ...patch }; omni.qcRecords.push(qc); if (!Array.isArray(card.qcRecordIds)) card.qcRecordIds = []; if (!card.qcRecordIds.includes(qc.id)) card.qcRecordIds.push(qc.id); saveData(); showToast('تم إنشاء فحص جودة','success'); return qc; }
function markQcPass(qcRecordId) { const qc = getQcRecordById(qcRecordId); if (!qc) return; qc.result = 'pass'; qc.status = 'pass'; qc.inspectedAt = new Date().toISOString(); qc.updatedAt = qc.inspectedAt; qc.activityLog = qc.activityLog || []; qc.activityLog.push({ date:new Date().toISOString(), text:'تم تسجيل الفحص كناجح' }); saveData(); }
function markQcFail(qcRecordId, reason = '', severity = 'high') { const qc = getQcRecordById(qcRecordId); if (!qc) return; qc.result = 'fail'; qc.status = 'fail'; qc.failureReason = reason || qc.failureReason || 'غير محدد'; qc.reason = qc.failureReason; qc.severity = severity || qc.severity || 'high'; qc.inspectedAt = new Date().toISOString(); qc.updatedAt = qc.inspectedAt; qc.activityLog = qc.activityLog || []; qc.activityLog.push({ date:new Date().toISOString(), text:`تم تسجيل الفحص كفاشل: ${qc.reason}` }); saveData(); }

// ═══════════════════════════════════════════════════
// SOP LIBRARY V2 — FULL STRUCTURED RENDERING
// ═══════════════════════════════════════════════════

let sopSearchQuery = '';
let sopFilterDept = '';
let sopFilterMachine = '';
let sopFilterStatus = '';
let sopFilterType = '';


function getSimpleTextDiff(oldText, newText) {
  const o = String(oldText || '').trim();
  const n = String(newText || '').trim();
  if (o === n) return `<div style="color:var(--text-muted); font-size:13px;">${escapeHtml(n || 'لا يوجد تغيير')}</div>`;
  return `
    <div style="background:rgba(239,68,68,0.12); border-right:3px solid #ef4444; padding:6px 10px; border-radius:4px; color:#fca5a5; margin-bottom:6px; font-size:13px; text-decoration:line-through;">- ${escapeHtml(o || '(فارغ)')}</div>
    <div style="background:rgba(16,185,129,0.12); border-right:3px solid #10b981; padding:6px 10px; border-radius:4px; color:#a7f3d0; margin-bottom:6px; font-size:13px;">+ ${escapeHtml(n || '(فارغ)')}</div>
  `;
}

function getArrayDiff(oldArr, newArr) {
  const oldItems = (oldArr || []).map(x => typeof x === 'string' ? x : (x.title || x.text || ''));
  const newItems = (newArr || []).map(x => typeof x === 'string' ? x : (x.title || x.text || ''));

  let html = '';
  oldItems.forEach(item => {
    if (!newItems.includes(item)) {
      html += `<div style="background:rgba(239,68,68,0.12); border-right:3px solid #ef4444; padding:4px 8px; border-radius:2px; color:#fca5a5; margin-bottom:4px; font-size:12.5px; text-decoration:line-through;">✕ ${escapeHtml(item)}</div>`;
    }
  });
  newItems.forEach(item => {
    if (oldItems.includes(item)) {
      html += `<div style="padding:4px 8px; color:var(--text-muted); margin-bottom:4px; font-size:12.5px;">✓ ${escapeHtml(item)}</div>`;
    } else {
      html += `<div style="background:rgba(16,185,129,0.12); border-right:3px solid #10b981; padding:4px 8px; border-radius:2px; color:#a7f3d0; margin-bottom:4px; font-size:12.5px;">+ ${escapeHtml(item)} <span style="background:rgba(16,185,129,0.2); padding:1px 4px; border-radius:3px; font-size:10px; color:#34d399;">جديد</span></div>`;
    }
  });
  return html || '<p class="muted" style="font-size:12.5px;">لا توجد بنود</p>';
}

// ═══════════════════════════════════════════════════
// OMNISYSTEM V4 — Extended Data & Modules
// ═══════════════════════════════════════════════════

function ensureOmniV4() { return omni; }

// defaultMachines() moved to modules/data-providers.js (GO 16 de-monolith Phase 2)

// defaultMaterials() moved to modules/data-providers.js (GO 16 de-monolith Phase 2)

// defaultOpPacks() moved to modules/data-providers.js (GO 16 de-monolith Phase 2)

// Seed the vinyl-wrap recipe into existing user libraries that already have other defaults
// but never saw this one (because they loaded the app before 2026-05-23 when it was added).
// Idempotent: only adds if not already present.

// ═══════════ MACHINES PAGE ═══════════
// T0.4 dedup (2026-07-12): dead copy (basic card grid), shadowed by the
// richer live definition below (KPI strip, priority scoring, maintenance
// risk levels, photo). Kept per add-only rule.
// T4.5 de-monolith: Machines page renderers moved to modules/machine-management.js.

let inventoryFilters = { search: '', category: 'all', status: 'all' };
function updateInventoryFilter(field, value) {
  if (!['search', 'category', 'status'].includes(field)) return;
  inventoryFilters[field] = value;
  renderInventoryPage();
}
function resetInventoryFilters() {
  inventoryFilters = { search: '', category: 'all', status: 'all' };
  renderInventoryPage();
}

function exportInventoryCsv() {
  ensureOmni();
  const mats = omni.materials || [];
  const orgSymbol = omni.adminSettings?.organization?.currencySymbol || 'د.ع';
  const header = ['المادة','التصنيف','الوحدة','المخزون','محجوز','متاح','الحد الأدنى','المورد','كلفة الوحدة','قيمة المخزون'];
  const rows = mats.map(m => {
    const avail = getMaterialAvailableQty(m);
    const reserved = getMaterialReservedQty(m);
    const value = (Number(m.stock)||0) * (Number(m.cost)||0);
    return [m.name, m.category||'', m.unit||'', m.stock||0, reserved, avail, m.minimum||0, m.supplier||'', m.cost||0, value];
  });
  // BOM for Excel Arabic compatibility
  const csv = '﻿' + [header, ...rows].map(r => r.map(cell => {
    const s = String(cell ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `octagon-inventory-${new Date().toISOString().slice(0,10)}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast(`تم تصدير ${rows.length} مادة (${orgSymbol})`, 'success');
}

function getInventoryKpis(mats) {
  const totalMaterials = mats.length;
  let totalValue = 0, criticalCount = 0, totalReserved = 0, totalAvail = 0;
  mats.forEach(m => {
    totalValue += (Number(m.stock)||0) * (Number(m.cost)||0);
    const reserved = getMaterialReservedQty(m);
    const avail = getMaterialAvailableQty(m);
    totalReserved += reserved;
    totalAvail += avail;
    if (avail <= (Number(m.minimum)||0)) criticalCount++;
  });
  return { totalMaterials, totalValue, criticalCount, totalReserved, totalAvail };
}

function getInventoryCategories(mats) {
  const set = new Set();
  mats.forEach(m => { if (m.category) set.add(m.category); });
  return Array.from(set).sort();
}

function filterInventoryMats(mats) {
  const q = (inventoryFilters.search || '').trim().toLowerCase();
  return mats.filter(m => {
    if (inventoryFilters.category !== 'all' && m.category !== inventoryFilters.category) return false;
    if (inventoryFilters.status !== 'all') {
      const avail = getMaterialAvailableQty(m);
      const critical = avail <= (Number(m.minimum)||0);
      if (inventoryFilters.status === 'critical' && !critical) return false;
      if (inventoryFilters.status === 'ok' && critical) return false;
    }
    if (q) {
      const hay = `${m.name||''} ${m.category||''} ${m.supplier||''} ${m.unit||''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function renderProcurementTab() {
  ensureOmni();
  const filter = window.rfqFilterState || 'all';
  const pos = omni.purchaseOrders || [];
  const filtered = pos.filter(po => filter === 'all' ? true : po.status === filter);

  const filterBtns = [
    ['all', 'الكل'],
    ['draft', 'مسودة RFQ'],
    ['sent', 'مُرسل'],
    ['approved', 'مُعتمد (PO)'],
    ['ordered', 'مطلوب'],
    ['received', 'مُستلم'],
    ['cancelled', 'ملغى']
  ];

  const filterHtml = `
    <div class="cc-request-tabs" style="margin-bottom: 12px; display: flex; gap: 6px; flex-wrap: wrap;">
      ${filterBtns.map(([key, label]) => `<button class="btn-tab-filter ${filter === key ? 'active' : ''}" style="background: ${filter === key ? 'var(--accent-blue)' : 'rgba(255,255,255,0.05)'}; color: var(--text-primary); border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size:12px;" onclick="window.switchRfqFilter('${key}')">${label}</button>`).join('')}
    </div>
  `;

  let cardsHtml = '';
  filtered.forEach(po => {
    const itemsList = po.items.map(item => `
      <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 2px;">
        • ${escapeHtml(item.materialName)} × ${item.qty} ${escapeHtml(item.unit || '')} @ ${Number(item.unitCost || 0).toLocaleString()} د.ع
        ${item.receivedQty > 0 ? `<span style="color: var(--accent-green);"> (مستلم: ${item.receivedQty})</span>` : ''}
      </div>
    `).join('');

    const totalValue = po.items.reduce((sum, item) => sum + (item.qty * (item.unitCost || 0)), 0);

    let actionsHtml = '';
    if (po.status === 'draft') {
      actionsHtml = `
        <button class="btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="sendRfqToSupplier('${po.id}')"><i class="fa-solid fa-paper-plane"></i> إرسال للمورد</button>
        <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="confirmPurchaseOrder('${po.id}')"><i class="fa-solid fa-check"></i> اعتماد PO</button>
        <button class="btn-secondary text-danger" style="padding: 4px 8px; font-size: 11px;" onclick="cancelPurchaseOrder('${po.id}')"><i class="fa-solid fa-xmark"></i> إلغاء</button>
      `;
    } else if (po.status === 'sent') {
      actionsHtml = `
        <button class="btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="confirmPurchaseOrder('${po.id}')"><i class="fa-solid fa-circle-check"></i> اعتماد PO</button>
        <button class="btn-secondary text-danger" style="padding: 4px 8px; font-size: 11px;" onclick="cancelPurchaseOrder('${po.id}')"><i class="fa-solid fa-xmark"></i> إلغاء</button>
      `;
    } else if (po.status === 'approved') {
      actionsHtml = `
        <button class="btn-secondary" style="padding: 4px 8px; font-size: 11px;" onclick="markPurchaseOrderOrdered('${po.id}')"><i class="fa-solid fa-truck-fast"></i> تم الطلب</button>
        <button class="btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="receivePurchaseOrder('${po.id}')"><i class="fa-solid fa-download"></i> استلام المواد</button>
        <button class="btn-secondary text-danger" style="padding: 4px 8px; font-size: 11px;" onclick="cancelPurchaseOrder('${po.id}')"><i class="fa-solid fa-xmark"></i> إلغاء</button>
      `;
    } else if (['ordered', 'partial'].includes(po.status)) {
      actionsHtml = `
        <button class="btn-primary" style="padding: 4px 8px; font-size: 11px;" onclick="receivePurchaseOrder('${po.id}')"><i class="fa-solid fa-download"></i> استلام المواد</button>
        <button class="btn-secondary text-danger" style="padding: 4px 8px; font-size: 11px;" onclick="cancelPurchaseOrder('${po.id}')"><i class="fa-solid fa-xmark"></i> إلغاء</button>
      `;
    } else if (po.status === 'received') {
      actionsHtml = `<span style="color: var(--accent-green); font-size: 12px; font-weight: bold;"><i class="fa-solid fa-circle-check"></i> تم التوريد والمطابقة</span>`;
    } else if (po.status === 'cancelled') {
      actionsHtml = `<span style="color: var(--text-muted); font-size: 12px; font-weight: bold;"><i class="fa-solid fa-ban"></i> ملغى</span>`;
    }

    cardsHtml += `
      <div class="rfq-card" style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); padding: 12px; border-radius: 8px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
          <div>
            <h4 style="margin: 0; color: #38bdf8; font-size: 14px;">${po.id}</h4>
            <small class="muted" style="font-size:10px;">تاريخ الإنشاء: ${formatOmniDateTime(po.createdAt)} | المورد: <b>${escapeHtml(po.supplierName)}</b></small>
          </div>
          <div>
            <span class="inv-badge inv-badge-${po.status === 'received' ? 'ok' : po.status === 'cancelled' ? 'danger' : 'pending'}" style="font-size:10px;">${po.status.toUpperCase()}</span>
          </div>
        </div>
        <div style="background: rgba(0,0,0,0.15); padding: 6px; border-radius: 6px; margin-bottom: 8px;">
          ${itemsList}
          <div style="text-align: left; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 4px; margin-top: 4px; font-weight: bold; font-size: 11px; color: #38bdf8;">
            المجموع المتوقع: ${totalValue.toLocaleString()} د.ع
          </div>
        </div>
        ${po.notes ? `<p style="font-size: 10px; margin: 0 0 8px 0; font-style: italic; color: var(--text-muted);">ملاحظة: ${escapeHtml(po.notes)}</p>` : ''}
        <div style="display: flex; gap: 6px; justify-content: flex-end; align-items: center;">
          ${actionsHtml}
        </div>
      </div>
    `;
  });

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <h3 style="margin:0;"><i class="fa-solid fa-file-invoice-dollar"></i> طلبات وأوامر الشراء (RFQ & POs)</h3>
      <button class="btn-primary" style="height:32px; padding: 0 12px; font-size:12px;" onclick="window.showCreateRfqModal()"><i class="fa-solid fa-plus"></i> إنشاء طلب عرض سعر (RFQ)</button>
    </div>
    ${filterHtml}
    <div class="procurement-list-wrapper" style="max-height: 480px; overflow-y: auto;">
      ${cardsHtml ? cardsHtml : '<div class="cc-empty">لا توجد طلبات شراء تطابق الفلتر المختار.</div>'}
    </div>
  `;
}

window.switchRfqFilter = function(filter) {
  window.rfqFilterState = filter;
  renderInventoryPage();
};

function renderProposalsTab() {
  ensureOmni();
  const proposals = getAutoProcurementProposals();

  let rowsHtml = '';
  proposals.forEach(p => {
    rowsHtml += `
      <tr>
        <td style="padding: 6px; text-align: center;">
          <input type="checkbox" class="proposal-checkbox" data-material-id="${p.materialId}" style="width: 14px; height: 14px; margin: 0; cursor: pointer;">
        </td>
        <td style="padding: 6px;"><b>${escapeHtml(p.materialName)}</b></td>
        <td style="padding: 6px; text-align: center;">${p.currentStock} ${escapeHtml(p.unit)}</td>
        <td style="padding: 6px; text-align: center;">${p.reservedQty} ${escapeHtml(p.unit)}</td>
        <td style="padding: 6px; text-align: center; color: ${p.availableQty < 0 ? 'var(--accent-red)' : 'var(--text-primary)'};">${p.availableQty} ${escapeHtml(p.unit)}</td>
        <td style="padding: 6px; text-align: center;">${p.minimum} ${escapeHtml(p.unit)}</td>
        <td style="padding: 6px; text-align: center; font-weight: bold; color: #38bdf8;">${p.shortfall} ${escapeHtml(p.unit)}</td>
        <td style="padding: 6px; text-align: center;"><b>${escapeHtml(p.supplierName || 'غير محدد')}</b></td>
        <td style="padding: 6px; text-align: center;">${p.availableQty < 0 ? '<span class="inv-badge inv-badge-danger" style="font-size:9px;">طلب إنتاج</span>' : '<span class="inv-badge inv-badge-yellow" style="font-size:9px;">حد أمان</span>'}</td>
      </tr>
    `;
  });

  return `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
      <div>
        <h3 style="margin:0;"><i class="fa-solid fa-lightbulb"></i> المقترحات التلقائية للتوريد (Replenishment)</h3>
        <p class="muted" style="margin: 0; font-size: 10px;">المواد التي تواجه عجزاً بسبب باقات الإنتاج أو تقل كمياتها عن حد الأمان.</p>
      </div>
      <button class="btn-primary" style="height:32px; padding: 0 12px; font-size:12px;" onclick="window.consolidateProposalsToRFQs()"><i class="fa-solid fa-object-group"></i> دمج وإنشاء طلبات RFQ مجمعة</button>
    </div>

    <div class="inv-table-wrap" style="max-height: 400px; overflow-y: auto;">
      <table class="inv-table">
        <thead>
          <tr>
            <th style="padding: 6px; text-align: center; width: 40px;">تحديد</th>
            <th style="padding: 6px; text-align: right;">المادة</th>
            <th style="padding: 6px; text-align: center;">المخزون الحالي</th>
            <th style="padding: 6px; text-align: center;">المحجوز للإنتاج</th>
            <th style="padding: 6px; text-align: center;">المتاح الحر</th>
            <th style="padding: 6px; text-align: center;">حد الأمان</th>
            <th style="padding: 6px; text-align: center;">المقترح</th>
            <th style="padding: 6px; text-align: center;">المورد الافتراضي</th>
            <th style="padding: 6px; text-align: center;">السبب</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml ? rowsHtml : '<tr><td colspan="9" class="muted" style="text-align:center; padding: 15px;">المستودع في حالة ممتازة! لا توجد مواد ناقصة أو عجز في الطلبات.</td></tr>'}
        </tbody>
      </table>
    </div>
  `;
}

window.consolidateProposalsToRFQs = function() {
  const checkedCheckboxes = document.querySelectorAll('.proposal-checkbox:checked');
  if (checkedCheckboxes.length === 0) {
    return showToast('يرجى تحديد مقترح واحد على الأقل', 'warning');
  }

  const proposals = getAutoProcurementProposals();
  const selectedProposals = [];
  checkedCheckboxes.forEach(cb => {
    const matId = cb.dataset.materialId;
    const prop = proposals.find(p => p.materialId === matId);
    if (prop) selectedProposals.push(prop);
  });

  if (selectedProposals.length === 0) return;

  // Group by Supplier
  const groups = {};
  selectedProposals.forEach(p => {
    const key = p.supplierId || p.supplierName || 'unassigned';
    if (!groups[key]) groups[key] = [];
    groups[key].push(p);
  });

  let createdCount = 0;
  Object.keys(groups).forEach(key => {
    const propsList = groups[key];
    const first = propsList[0];

    const items = propsList.map(p => ({
      materialId: p.materialId,
      materialName: p.materialName,
      qty: p.shortfall,
      unit: p.unit,
      unitCost: p.cost
    }));

    // Find supplier ID and name
    let supId = first.supplierId;
    let supName = first.supplierName;

    // Grouping by unassigned might not match a supplier, try to resolve by name
    if (key === 'unassigned' || !supId) {
      const foundSup = (omni.suppliers || []).find(s => s.name === supName);
      if (foundSup) supId = foundSup.id;
    }

    createMultiLineRFQ(supId, supName, items, 'إنشاء تلقائي مجمع بناءً على مقترحات التوريد لنقص الكميات');
    createdCount++;
  });

  showToast(`تم إنشاء ${createdCount} طلب عرض سعر (RFQ) مجمع بنجاح`, 'success');
  window.switchInventoryTab('procurement');
};

async function showCreateRfqModal() {
  ensureOmni();

  const supOpts = (omni.suppliers || []).map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  const modalHtml = `
    <div style="font-size: 13px;">
      <div style="margin-bottom: 12px;">
        <label>المورد</label>
        <select id="rfqSupplierSelect" class="form-input" style="padding: 4px;" onchange="window.onRfqSupplierChanged(this.value)">
          <option value="">— اختر مورد —</option>
          ${supOpts}
        </select>
      </div>

      <h5 style="margin: 12px 0 6px 0;">مواد أمر الشراء</h5>
      <table id="rfqItemsTable" class="inv-table" style="width: 100%; border-collapse: collapse; margin-bottom: 8px;">
        <thead>
          <tr>
            <th style="padding: 4px; text-align: right;">المادة</th>
            <th style="padding: 4px; text-align: center; width: 100px;">الكمية المطلوبة</th>
            <th style="padding: 4px; text-align: center; width: 120px;">كلفة الوحدة</th>
            <th style="padding: 4px; text-align: center; width: 60px;">الوحدة</th>
            <th style="padding: 4px; text-align: center; width: 40px;"></th>
          </tr>
        </thead>
        <tbody>
          <!-- Dynamic lines added here -->
        </tbody>
      </table>

      <button class="btn-secondary" type="button" style="margin-bottom: 12px; padding: 2px 6px; font-size: 11px; height: 26px;" onclick="window.addRfqItemRow()"><i class="fa-solid fa-plus"></i> إضافة سطر جديد</button>

      <div>
        <label>شروط أو ملاحظات الشراء</label>
        <textarea id="rfqNotes" class="form-input" style="height: 50px; padding: 4px;" placeholder="ملاحظات اختيارية للمورد..."></textarea>
      </div>
    </div>
  `;

  window.rfqRowsCount = 0;
  window.addRfqItemRow = function(matId = '', qty = 1, cost = 0) {
    const tbody = document.querySelector('#rfqItemsTable tbody');
    if (!tbody) return;
    const rowId = 'rfq_row_' + window.rfqRowsCount++;
    const tr = document.createElement('tr');
    tr.id = rowId;
    tr.innerHTML = `
      <td style="padding: 4px;">
        <select class="form-input rfq-item-select" style="margin:0; padding:4px;" onchange="window.onRfqItemRowChanged(this, '${rowId}')">
          <option value="">— اختر مادة —</option>
          ${(omni.materials || []).map(m => {
            const selected = m.id === matId ? 'selected' : '';
            return `<option value="${m.id}" data-unit="${escapeHtml(m.unit || '')}" data-cost="${m.cost || 0}" ${selected}>${escapeHtml(m.name)}</option>`;
          }).join('')}
        </select>
      </td>
      <td style="padding: 4px;">
        <input type="number" class="form-input rfq-item-qty" style="margin:0; padding:4px; text-align:center;" value="${qty}" min="1">
      </td>
      <td style="padding: 4px;">
        <input type="number" step="0.01" class="form-input rfq-item-cost" style="margin:0; padding:4px; text-align:center;" value="${cost}">
      </td>
      <td style="padding: 4px; text-align: center;"><span class="rfq-item-unit" style="font-size:11px; color:var(--text-muted);">${matId ? getMaterialById(matId)?.unit || '' : ''}</span></td>
      <td style="padding: 4px; text-align: center;">
        <button class="icon-btn text-danger" style="padding: 2px;" onclick="document.getElementById('${rowId}').remove()"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  };

  window.onRfqItemRowChanged = function(selectEl, rowId) {
    const opt = selectEl.options[selectEl.selectedIndex];
    const tr = document.getElementById(rowId);
    if (!tr || !opt) return;
    const unitSpan = tr.querySelector('.rfq-item-unit');
    const costInput = tr.querySelector('.rfq-item-cost');

    const matId = selectEl.value;
    unitSpan.textContent = opt.dataset.unit || '';

    // Auto-populate negotiated price from supplier catalog if selected
    const supplierId = document.getElementById('rfqSupplierSelect')?.value;
    let price = Number(opt.dataset.cost) || 0;
    if (supplierId) {
      const sup = (omni.suppliers || []).find(s => s.id === supplierId);
      const catEntry = (sup?.catalog || []).find(c => c.materialId === matId);
      if (catEntry) {
        price = catEntry.negotiatedPrice || price;
      }
    }
    costInput.value = price;
  };

  window.onRfqSupplierChanged = function(supplierId) {
    const rows = document.querySelectorAll('#rfqItemsTable tbody tr');
    rows.forEach(row => {
      const select = row.querySelector('.rfq-item-select');
      if (select && select.value) {
        window.onRfqItemRowChanged(select, row.id);
      }
    });
  };

  const result = await showOmniModal('إنشاء طلب عرض سعر جديد (RFQ)', modalHtml, body => {
    const supplierSelect = body.querySelector('#rfqSupplierSelect');
    const notesEl = body.querySelector('#rfqNotes');
    const rows = body.querySelectorAll('#rfqItemsTable tbody tr');

    const selectedSupplierId = supplierSelect?.value;
    if (!selectedSupplierId) {
      showToast('يرجى اختيار المورد أولاً', 'warning');
      return false;
    }

    const items = [];
    rows.forEach(row => {
      const matSelect = row.querySelector('.rfq-item-select');
      const qtyInput = row.querySelector('.rfq-item-qty');
      const costInput = row.querySelector('.cost-intake || .rfq-item-cost');

      const matId = matSelect?.value;
      const qty = Number(qtyInput?.value) || 0;
      const unitCost = Number(costInput?.value) || 0;

      if (matId && qty > 0) {
        const mat = getMaterialById(matId);
        items.push({
          materialId: matId,
          materialName: mat ? mat.name : 'مادة',
          qty: qty,
          unit: mat ? mat.unit : '',
          unitCost: unitCost
        });
      }
    });

    if (items.length === 0) {
      showToast('يرجى إضافة مادة واحدة على الأقل بالكمية المناسبة', 'warning');
      return false;
    }

    return {
      supplierId: selectedSupplierId,
      items: items,
      notes: notesEl?.value.trim() || ''
    };
  }, body => {
    window.addRfqItemRow();
  });

  if (!result) return;

  const sup = (omni.suppliers || []).find(s => s.id === result.supplierId);
  const po = createMultiLineRFQ(result.supplierId, sup ? sup.name : '', result.items, result.notes);
  showToast(`تم إنشاء طلب عرض السعر بنجاح: ${po.id}`, 'success');
  window.switchInventoryTab('procurement');
}

async function renderInventoryPage() {
  ensureOmni();
  const el = document.getElementById('inventoryBody');
  if (!el) return;

  if (!window.inventoryActiveTab) window.inventoryActiveTab = 'materials';
  const activeTab = window.inventoryActiveTab;

  const allMats = typeof window.scoped === 'function' ? window.scoped(omni.materials || []) : (omni.materials || []);
  const kpis = getInventoryKpis(allMats);
  const categories = getInventoryCategories(allMats);
  const mats = filterInventoryMats(allMats);
  const showReserved = omni.adminSettings?.inventory?.showReservedQty !== false;
  const orgSymbol = omni.adminSettings?.organization?.currencySymbol || 'د.ع';

  // Tab selectors html
  const tabSelectorsHtml = `
    <div class="procurement-tabs" style="display: flex; gap: 8px; border-bottom: 2px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-bottom: 16px; flex-wrap: wrap;">
      <button class="btn-tab ${activeTab === 'materials' ? 'active' : ''}" style="background: ${activeTab === 'materials' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'materials' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('materials')"><i class="fa-solid fa-boxes-stacked"></i> المواد والمخزون</button>
      <button class="btn-tab ${activeTab === 'suppliers' ? 'active' : ''}" style="background: ${activeTab === 'suppliers' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'suppliers' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('suppliers')"><i class="fa-solid fa-truck"></i> الموردون والكتالوج</button>
      <button class="btn-tab ${activeTab === 'procurement' ? 'active' : ''}" style="background: ${activeTab === 'procurement' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'procurement' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('procurement')"><i class="fa-solid fa-file-invoice-dollar"></i> طلبات وأوامر الشراء (RFQ/PO)</button>
      <button class="btn-tab ${activeTab === 'transfers' ? 'active' : ''}" style="background: ${activeTab === 'transfers' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'transfers' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('transfers')"><i class="fa-solid fa-route"></i> المواقع والتحويلات</button>
      <button class="btn-tab ${activeTab === 'barcode' ? 'active' : ''}" style="background: ${activeTab === 'barcode' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'barcode' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('barcode')"><i class="fa-solid fa-barcode"></i> مسح الباركود</button>
      <button class="btn-tab ${activeTab === 'shortages' ? 'active' : ''}" style="background: ${activeTab === 'shortages' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'shortages' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('shortages')"><i class="fa-solid fa-triangle-exclamation"></i> النواقص والحجوزات</button>
      <button class="btn-tab ${activeTab === 'valuation' ? 'active' : ''}" style="background: ${activeTab === 'valuation' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'valuation' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('valuation')"><i class="fa-solid fa-coins"></i> تقييم المخزون</button>
      <button class="btn-tab ${activeTab === 'proposals' ? 'active' : ''}" style="background: ${activeTab === 'proposals' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'proposals' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('proposals')"><i class="fa-solid fa-lightbulb"></i> مقترحات التوريد</button>
      <button class="btn-tab ${activeTab === 'receipts' ? 'active' : ''}" style="background: ${activeTab === 'receipts' ? 'rgba(255,255,255,0.1)' : 'transparent'}; color: var(--text-primary); border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-weight: ${activeTab === 'receipts' ? 'bold' : 'normal'}; font-size:13px;" onclick="window.switchInventoryTab('receipts')"><i class="fa-solid fa-clipboard-check"></i> سجل الاستلامات</button>
    </div>
  `;

  let tabContentHtml = '';
  if (activeTab === 'materials') {
    let v5Db = null;
    try {
      v5Db = window.PentagonDB ? await window.PentagonDB.load({ force: true }) : null;
    } catch (error) {
      console.warn('V5 inventory load failed:', error);
    }
    const locations = Array.isArray(v5Db?.locations) ? v5Db.locations : [];
    const quants = Array.isArray(v5Db?.quants) ? v5Db.quants : [];
    const moves = Array.isArray(v5Db?.stock_moves) ? v5Db.stock_moves : [];

    tabContentHtml = `
      <!-- KPI strip — at-a-glance snapshot of the warehouse -->
      <div class="inv-kpi-strip">
        <div class="inv-kpi-tile"><span>إجمالي المواد</span><b>${kpis.totalMaterials}</b></div>
        <div class="inv-kpi-tile inv-kpi-tile-value"><span>قيمة المخزون</span><b>${Math.round(kpis.totalValue).toLocaleString()} ${escapeHtml(orgSymbol)}</b></div>
        <div class="inv-kpi-tile ${kpis.criticalCount > 0 ? 'inv-kpi-tile-danger' : ''}"><span>مواد ناقصة</span><b>${kpis.criticalCount}</b></div>
        <div class="inv-kpi-tile"><span>إجمالي المحجوز</span><b>${kpis.totalReserved.toLocaleString()}</b></div>
        <div class="inv-kpi-tile"><span>إجمالي المتاح</span><b>${kpis.totalAvail.toLocaleString()}</b></div>
      </div>

      <!-- Toolbar: search + filters + export -->
      <div class="inv-toolbar">
        <input type="text" class="form-input" placeholder="ابحث في اسم المادة، التصنيف، المورد..." value="${escapeHtml(inventoryFilters.search)}" oninput="updateInventoryFilter('search', this.value)">
        <select class="form-input" onchange="updateInventoryFilter('category', this.value)">
          <option value="all" ${inventoryFilters.category === 'all' ? 'selected' : ''}>كل التصنيفات</option>
          ${categories.map(c => `<option value="${escapeHtml(c)}" ${inventoryFilters.category === c ? 'selected' : ''}>${escapeHtml(c)}</option>`).join('')}
        </select>
        <select class="form-input" onchange="updateInventoryFilter('status', this.value)">
          <option value="all" ${inventoryFilters.status === 'all' ? 'selected' : ''}>كل الحالات</option>
          <option value="critical" ${inventoryFilters.status === 'critical' ? 'selected' : ''}>ناقصة فقط</option>
          <option value="ok" ${inventoryFilters.status === 'ok' ? 'selected' : ''}>كافية فقط</option>
        </select>
        <button class="btn-secondary" onclick="resetInventoryFilters()" title="إعادة الضبط"><i class="fa-solid fa-rotate-right"></i></button>
        <button class="btn-secondary" onclick="exportInventoryCsv()"><i class="fa-solid fa-file-csv"></i> تصدير CSV</button>
        <button class="btn-primary" onclick="addMaterial()"><i class="fa-solid fa-plus"></i> إضافة مادة</button>
      </div>
      ${inventoryFilters.search || inventoryFilters.category !== 'all' || inventoryFilters.status !== 'all' ? `<p class="inv-filter-summary">عُرض ${mats.length} من ${allMats.length} مادة</p>` : ''}

      ${renderV5InventoryDashboard(locations, quants, moves)}
      <div class="inv-table-wrap">
        <table class="inv-table">
          <thead><tr>
            <th></th><th>المادة</th><th>الوحدة</th><th>المخزون</th><th>محجوز</th><th>متاح</th><th>حد أدنى</th><th>الحالة</th><th>المورد</th><th>الكلفة</th><th>إجراء</th>
          </tr></thead>
          <tbody>
            ${mats.length === 0 ? `<tr><td colspan="11" style="text-align:center;padding:20px;color:var(--text-muted);">لا توجد مواد تطابق المرشحات</td></tr>` : mats.map(m => {
              const avail = getMaterialAvailableQty(m);
              const critical = avail <= m.minimum;
              const thumb = m.photoUrl ? `<img src="${escapeHtml(m.photoUrl)}" alt="" class="inv-row-thumb" onerror="this.style.display='none'">` : `<div class="inv-row-thumb-placeholder">📦</div>`;
              return `<tr class="${critical ? 'inv-row-critical' : ''}" onclick="openInspector('material', '${m.id}')">
                <td style="width:50px;text-align:center;">${thumb}</td>
                <td><b>${escapeHtml(m.name)}</b><br><small>${escapeHtml(m.category||'')}</small></td>
                <td>${escapeHtml(m.unit||'')}</td>
                <td>${m.stock}</td>
                <td>${showReserved ? getMaterialReservedQty(m) : '-'}</td>
                <td>${renderMaterialQtyWithBattery(m)}</td>
                <td>${m.minimum}</td>
                <td>${critical ? '<span class="inv-badge inv-badge-danger">ناقص</span>' : '<span class="inv-badge inv-badge-ok">كافي</span>'}</td>
                <td>${escapeHtml(m.supplier||'')}</td>
                <td>${(m.cost||0).toLocaleString()}</td>
                <td>
                  <button class="icon-btn" onclick="event.stopPropagation(); editMaterial('${m.id}')" title="تعديل"><i class="fa-solid fa-pen"></i></button>
                  <button class="${critical ? 'btn-primary' : 'btn-secondary'}" style="padding:2px 6px;font-size:10px;margin-right:4px;" onclick="event.stopPropagation(); createPurchaseRequest('${m.id}')">طلب شراء</button>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else if (activeTab === 'suppliers') {
    tabContentHtml = renderInventorySuppliersSection();
  } else if (activeTab === 'procurement') {
    tabContentHtml = renderProcurementTab();
  } else if (activeTab === 'transfers') {
    tabContentHtml = await renderInventoryTransfersSection();
  } else if (activeTab === 'barcode') {
    tabContentHtml = renderInventoryBarcodeSection();
  } else if (activeTab === 'shortages') {
    tabContentHtml = renderInventoryShortagesSection();
  } else if (activeTab === 'valuation') {
    tabContentHtml = await renderInventoryValuationSection();
  } else if (activeTab === 'proposals') {
    tabContentHtml = renderProposalsTab();
  } else if (activeTab === 'receipts') {
    tabContentHtml = renderInventoryReceivingHistorySection();
  }

  el.innerHTML = `
    ${tabSelectorsHtml}
    <div class="inventory-tab-body" style="background: rgba(255,255,255,0.01); border: 1px solid rgba(255,255,255,0.04); padding: 16px; border-radius: 8px; margin-top: 10px;">
      ${tabContentHtml}
    </div>
  `;
}

window.switchInventoryTab = function(tabName) {
  window.inventoryActiveTab = tabName;
  renderInventoryPage();
};

function renderInventorySuppliersSection() {
  ensureOmni();
  const canEdit = !window.PermissionService || PermissionService.check('omni.suppliers', 'update');
  const suppliers = (omni.suppliers || []).slice().sort((a, b) => String(b.lastReceiptAt||'').localeCompare(String(a.lastReceiptAt||'')));
  if (!suppliers.length) {
    return `<div class="inv-section"><h3><i class="fa-solid fa-truck"></i> الموردون</h3><p class="muted">لا يوجد موردون. سيتم استخراجهم تلقائياً من المواد.</p></div>`;
  }
  return `
    <div class="inv-section" id="inventorySuppliersSection" data-test="suppliers-section" style="margin-top:24px">
      <h3><i class="fa-solid fa-truck"></i> الموردون <span class="muted">(${suppliers.length})</span></h3>
      <div class="inv-table-wrap">
        <table class="inv-table" data-test="suppliers-table">
          <thead><tr>
            <th>المورد</th><th>المواد</th><th>إجمالي الاستلامات</th><th>إجمالي القيمة</th><th>آخر استلام</th><th>هاتف</th><th>إجراء</th>
          </tr></thead>
          <tbody>
            ${suppliers.map(s => `<tr data-supplier-id="${s.id}">
              <td><b>${escapeHtml(s.name)}</b>${s.contact ? `<br><small>${escapeHtml(s.contact)}</small>` : ''}</td>
              <td>${(s.materials || []).length}</td>
              <td>${Number(s.totalReceipts || 0)}</td>
              <td>${Number(s.totalAmount || 0).toLocaleString()}</td>
              <td>${s.lastReceiptAt ? formatOmniDateTime(s.lastReceiptAt) : '-'}</td>
              <td>${escapeHtml(s.phone || '-')}</td>
              <td>
                <button class="icon-btn" onclick="viewSupplier('${s.id}')" title="عرض التفاصيل"><i class="fa-solid fa-eye"></i></button>
                ${canEdit ? `<button class="icon-btn" onclick="editSupplier('${s.id}')" title="تعديل"><i class="fa-solid fa-pen"></i></button>` : '<span class="muted">عرض فقط</span>'}
              </td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderInventoryReceivingHistorySection() {
  ensureOmni();
  const history = getPurchaseReceivingHistory(30);
  if (!history.length) {
    return `<div class="inv-section" style="margin-top:24px"><h3><i class="fa-solid fa-clipboard-check"></i> سجل الاستلامات</h3><p class="muted">لا يوجد استلامات بعد. عند استلام أمر شراء سيظهر هنا.</p></div>`;
  }
  return `
    <div class="inv-section" id="inventoryReceivingHistorySection" data-test="receiving-history" style="margin-top:24px">
      <h3><i class="fa-solid fa-clipboard-check"></i> سجل الاستلامات <span class="muted">(${history.length})</span></h3>
      <div class="inv-table-wrap">
        <table class="inv-table" data-test="receiving-history-table">
          <thead><tr>
            <th>التاريخ</th><th>المادة</th><th>الكمية</th><th>الكلفة/وحدة</th><th>القيمة</th><th>المورد</th><th>أمر الشراء</th><th>ملاحظة</th>
          </tr></thead>
          <tbody>
            ${history.map(r => `<tr>
              <td>${formatOmniDateTime(r.receivedAt)}</td>
              <td>${escapeHtml(r.materialName)}</td>
              <td>${r.qty} ${escapeHtml(r.unit || '')}</td>
              <td>${Number(r.unitCost || 0).toLocaleString()}</td>
              <td>${Number(r.amount || 0).toLocaleString()}</td>
              <td>${escapeHtml(r.supplierName || '-')}</td>
              <td><small>${escapeHtml(r.poId)}</small></td>
              <td>${escapeHtml(r.note || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function getSupplierReceipts(supplierId, limit = 100) {
  ensureOmni();
  const out = [];
  (omni.purchaseOrders || []).forEach(po => {
    if (po.supplierId !== supplierId) return;
    (po.receipts || []).forEach(r => {
      const matName = r.materialName || po.materialName || 'مادة';
      const unit = r.unit || po.unit || '';
      out.push({
        poId: po.id,
        materialId: r.materialId || po.materialId || '',
        materialName: matName,
        unit: unit,
        qty: r.qty,
        unitCost: r.unitCost || 0,
        amount: (r.qty || 0) * (r.unitCost || 0),
        receivedAt: r.date,
        note: r.note || ''
      });
    });
  });
  out.sort((a, b) => String(b.receivedAt).localeCompare(String(a.receivedAt)));
  return out.slice(0, limit);
}

function getSupplierOpenPOs(supplierId) {
  ensureOmni();
  return (omni.purchaseOrders || []).filter(po =>
    po.supplierId === supplierId && !['received', 'cancelled'].includes(po.status));
}

function buildSupplierModalHtml(supplierId, activeTab = 'info') {
  const sup = (omni.suppliers || []).find(s => s.id === supplierId);
  if (!sup) return '';
  const linkedMats = (omni.materials || []).filter(m => (sup.materials || []).includes(m.id));
  const receipts = getSupplierReceipts(supplierId, 30);
  const openPOs = getSupplierOpenPOs(supplierId);

  const tabsHtml = `
    <div class="procurement-modal-tabs" style="display: flex; gap: 8px; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 8px; margin-bottom: 12px;">
      <button class="btn-tab ${activeTab === 'info' ? 'active' : ''}" style="background: rgba(255,255,255,0.05); color: var(--text-primary); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;" onclick="window.switchSupplierModalTab('${supplierId}', 'info')">معلومات عامة</button>
      <button class="btn-tab ${activeTab === 'catalog' ? 'active' : ''}" style="background: rgba(255,255,255,0.05); color: var(--text-primary); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;" onclick="window.switchSupplierModalTab('${supplierId}', 'catalog')">الكتالوج والأسعار (${(sup.catalog || []).length})</button>
      <button class="btn-tab ${activeTab === 'orders' ? 'active' : ''}" style="background: rgba(255,255,255,0.05); color: var(--text-primary); border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;" onclick="window.switchSupplierModalTab('${supplierId}', 'orders')">أوامر الشراء (${openPOs.length + receipts.length})</button>
    </div>
  `;

  let contentHtml = '';
  if (activeTab === 'info') {
    contentHtml = `
      <div class="workflow-insp-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 12px;">
        <div class="insp-section"><h4>الاسم</h4><p>${escapeHtml(sup.name)}</p></div>
        <div class="insp-section"><h4>هاتف</h4><p>${escapeHtml(sup.phone || '-')}</p></div>
        <div class="insp-section"><h4>شخص الاتصال</h4><p>${escapeHtml(sup.contact || '-')}</p></div>
        <div class="insp-section"><h4>إجمالي الاستلامات</h4><p>${Number(sup.totalReceipts || 0)}</p></div>
        <div class="insp-section"><h4>إجمالي القيمة</h4><p>${Number(sup.totalAmount || 0).toLocaleString()} د.ع</p></div>
        <div class="insp-section"><h4>آخر استلام</h4><p>${sup.lastReceiptAt ? formatOmniDateTime(sup.lastReceiptAt) : '-'}</p></div>
      </div>
      ${sup.notes ? `<div class="insp-section" style="margin-top: 12px;"><h4>ملاحظات</h4><p>${escapeHtml(sup.notes)}</p></div>` : ''}
      <div class="insp-section" style="margin-top: 12px;">
        <h4>المواد المرتبطة افتراضياً (${linkedMats.length})</h4>
        ${linkedMats.length
          ? `<ul style="margin:0;padding-inline-start:18px">${linkedMats.map(m => `<li>${escapeHtml(m.name)} — مخزون ${Number(m.stock||0)} ${escapeHtml(m.unit||'')}</li>`).join('')}</ul>`
          : '<p class="muted">لا توجد مواد مرتبطة بعد.</p>'}
      </div>
    `;
  } else if (activeTab === 'catalog') {
    const catalog = sup.catalog || [];
    let catRows = '';
    catalog.forEach(item => {
      const mat = getMaterialById(item.materialId);
      catRows += `
        <tr>
          <td style="padding: 6px;"><b>${escapeHtml(mat?.name || 'غير معروف')}</b></td>
          <td style="padding: 6px; text-align: center;"><small class="muted">${escapeHtml(item.SKU || '-')}</small></td>
          <td style="padding: 6px; text-align: center;">
            <input type="number" class="form-input" style="width: 100px; text-align: center; margin: 0; padding: 2px 4px;" value="${item.negotiatedPrice || 0}"
              onchange="window.updateSupplierCatalogPriceInline('${supplierId}', '${item.materialId}', this.value)">
          </td>
          <td style="padding: 6px; text-align: center;">${item.leadTime || 3} أيام</td>
          <td style="padding: 6px; text-align: center;">${item.lastPurchasePrice ? Number(item.lastPurchasePrice).toLocaleString() + ' د.ع' : '-'}</td>
          <td style="padding: 6px; text-align: center;">
            <button class="icon-btn text-danger" onclick="window.removeMaterialFromSupplierCatalogInline('${supplierId}', '${item.materialId}')" title="حذف من الكتالوج"><i class="fa-solid fa-trash"></i></button>
          </td>
        </tr>
      `;
    });

    const unlinkedMats = (omni.materials || []).filter(m => !catalog.some(c => c.materialId === m.id));
    const matOpts = unlinkedMats.map(m => `<option value="${m.id}">${escapeHtml(m.name)}</option>`).join('');

    contentHtml = `
      <h4 style="margin-bottom:8px;">كتالوج مواد المورد والأسعار المتفق عليها</h4>
      <div class="inv-table-wrap" style="margin-bottom: 16px; max-height: 200px; overflow-y: auto;">
        <table class="inv-table">
          <thead>
            <tr>
              <th style="padding: 6px; text-align: right;">المادة</th>
              <th style="padding: 6px; text-align: center;">SKU</th>
              <th style="padding: 6px; text-align: center;">السعر المتفق عليه</th>
              <th style="padding: 6px; text-align: center;">مدة التوريد</th>
              <th style="padding: 6px; text-align: center;">آخر سعر شراء</th>
              <th style="padding: 6px; text-align: center;">إجراء</th>
            </tr>
          </thead>
          <tbody>
            ${catRows ? catRows : '<tr><td colspan="6" class="muted" style="text-align:center;">كتالوج المواد فارغ. أضف مواد أدناه.</td></tr>'}
          </tbody>
        </table>
      </div>

      <div style="background: rgba(255,255,255,0.02); padding: 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
        <h5 style="margin: 0 0 8px 0;"><i class="fa-solid fa-plus"></i> إضافة مادة لكتالوج المورد</h5>
        <div style="display: grid; grid-template-columns: 2fr 1fr 1fr 1fr auto; gap: 8px; align-items: flex-end;">
          <div>
            <label style="font-size: 11px; display: block; margin-bottom: 4px;">المادة</label>
            <select id="newCatMatId" class="form-input" style="margin:0; padding: 4px;">
              <option value="">— اختر مادة —</option>
              ${matOpts}
            </select>
          </div>
          <div>
            <label style="font-size: 11px; display: block; margin-bottom: 4px;">السعر المتفق عليه</label>
            <input type="number" id="newCatPrice" class="form-input" style="margin:0; padding: 4px;" placeholder="الكلفة">
          </div>
          <div>
            <label style="font-size: 11px; display: block; margin-bottom: 4px;">رمز المورد (SKU)</label>
            <input type="text" id="newCatSKU" class="form-input" style="margin:0; padding: 4px;" placeholder="اختياري">
          </div>
          <div>
            <label style="font-size: 11px; display: block; margin-bottom: 4px;">مدة التوريد (يوم)</label>
            <input type="number" id="newCatLead" class="form-input" style="margin:0; padding: 4px;" value="3">
          </div>
          <button class="btn-primary" style="margin:0; height:28px; padding: 0 12px;" onclick="window.addMaterialToSupplierCatalogInline('${supplierId}')">إضافة</button>
        </div>
      </div>
    `;
  } else if (activeTab === 'orders') {
    const ordersHtml = openPOs.map(po => `
      <div class="rfq-card-mini" style="background: rgba(255,255,255,0.02); padding: 8px; border-radius: 6px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
        <div>
          <b>${po.id}</b> <span class="inv-badge inv-badge-${po.status === 'received' ? 'ok' : 'pending'}">${po.status}</span>
          <br><small class="muted" style="font-size: 10px;">${po.items.map(i => `${i.materialName} × ${i.qty}`).join('، ')}</small>
        </div>
        <div class="muted" style="font-size: 10px;">${formatOmniDateTime(po.createdAt)}</div>
      </div>
    `).join('');

    const receiptsHtml = receipts.map(r => `
      <tr>
        <td style="padding: 4px;">${formatOmniDateTime(r.receivedAt)}</td>
        <td style="padding: 4px;">${escapeHtml(r.materialName)}</td>
        <td style="padding: 4px; text-align: center;">${r.qty}</td>
        <td style="padding: 4px; text-align: center;">${Number(r.unitCost || 0).toLocaleString()}</td>
        <td style="padding: 4px; text-align: center;">${Number(r.amount || 0).toLocaleString()}</td>
        <td style="padding: 4px; text-align: center;"><small>${r.poId}</small></td>
      </tr>
    `).join('');

    contentHtml = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
        <div>
          <h4 style="margin-bottom: 8px;">أوامر الشراء النشطة والمسودات</h4>
          <div style="max-height: 250px; overflow-y: auto;">
            ${ordersHtml ? ordersHtml : '<p class="muted">لا توجد طلبات شراء مفتوحة حالياً.</p>'}
          </div>
        </div>
        <div>
          <h4 style="margin-bottom: 8px;">سجل التوريد والاستلامات</h4>
          <div class="inv-table-wrap" style="max-height: 250px; overflow-y: auto;">
            <table class="inv-table">
              <thead>
                <tr>
                  <th style="padding: 4px;">التاريخ</th>
                  <th style="padding: 4px;">المادة</th>
                  <th style="padding: 4px; text-align: center;">الكمية</th>
                  <th style="padding: 4px; text-align: center;">الكلفة</th>
                  <th style="padding: 4px; text-align: center;">الإجمالي</th>
                  <th style="padding: 4px; text-align: center;">PO</th>
                </tr>
              </thead>
              <tbody>
                ${receiptsHtml ? receiptsHtml : '<tr><td colspan="6" class="muted" style="text-align:center; padding: 8px;">لا توجد استلامات سابقة.</td></tr>'}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div style="min-height: 380px;">
      ${tabsHtml}
      <div style="margin-top: 12px;">
        ${contentHtml}
      </div>
    </div>
  `;
}

window.switchSupplierModalTab = function(supplierId, tabName) {
  const bodyEl = document.getElementById('omniModalBody');
  if (bodyEl) {
    bodyEl.innerHTML = buildSupplierModalHtml(supplierId, tabName);
  }
};

window.updateSupplierCatalogPriceInline = function(supplierId, materialId, newPrice) {
  const val = Number(newPrice) || 0;
  updateSupplierNegotiatedPrice(supplierId, materialId, val);
  showToast('تم تحديث السعر المتفق عليه', 'success');
};

window.removeMaterialFromSupplierCatalogInline = function(supplierId, materialId) {
  ensureOmni();
  const sup = (omni.suppliers || []).find(s => s.id === supplierId);
  if (!sup) return;
  sup.catalog = (sup.catalog || []).filter(c => c.materialId !== materialId);
  sup.materials = (sup.materials || []).filter(mId => mId !== materialId);
  saveData();
  showToast('تم حذف المادة من كتالوج المورد', 'info');
  window.switchSupplierModalTab(supplierId, 'catalog');
  if (currentPage === 'inventory') renderInventoryPage();
};

window.addMaterialToSupplierCatalogInline = function(supplierId) {
  const matId = document.getElementById('newCatMatId')?.value;
  const price = Number(document.getElementById('newCatPrice')?.value) || 0;
  const SKU = document.getElementById('newCatSKU')?.value.trim() || '';
  const lead = Number(document.getElementById('newCatLead')?.value) || 3;

  if (!matId) return showToast('يرجى اختيار المادة', 'warning');

  const ok = addMaterialToSupplierCatalog(supplierId, matId, price, SKU, lead);
  if (ok) {
    showToast('تمت إضافة المادة للكتالوج بنجاح', 'success');
    window.switchSupplierModalTab(supplierId, 'catalog');
    if (currentPage === 'inventory') renderInventoryPage();
  } else {
    showToast('المادة موجودة بالفعل في الكتالوج', 'warning');
  }
};

async function viewSupplier(supplierId) {
  ensureOmni();
  const sup = (omni.suppliers || []).find(s => s.id === supplierId);
  if (!sup) return;
  const html = buildSupplierModalHtml(supplierId, 'info');
  await showOmniModal(`تفاصيل المورد: ${sup.name}`, html, () => null);
}

async function editSupplier(supplierId) {
  ensureOmni();
  if (window.PermissionService) {
    try { PermissionService.require('omni.suppliers', 'update'); }
    catch (e) { return showToast(e.message || 'لا تمتلك صلاحية تعديل المورد', 'error'); }
  }
  const sup = (omni.suppliers || []).find(s => s.id === supplierId);
  if (!sup) return;
  const result = await showOmniModal(`تعديل المورد: ${sup.name}`, `
    <div class="workflow-insp-grid">
      <label>الاسم<input id="supEditName" class="form-input" value="${escapeHtml(sup.name)}"></label>
      <label>هاتف<input id="supEditPhone" class="form-input" value="${escapeHtml(sup.phone || '')}"></label>
      <label>شخص الاتصال<input id="supEditContact" class="form-input" value="${escapeHtml(sup.contact || '')}"></label>
      <label>ملاحظات<textarea id="supEditNotes" class="form-input">${escapeHtml(sup.notes || '')}</textarea></label>
    </div>
  `, body => ({
    name: body.querySelector('#supEditName')?.value.trim() || sup.name,
    phone: body.querySelector('#supEditPhone')?.value.trim() || '',
    contact: body.querySelector('#supEditContact')?.value.trim() || '',
    notes: body.querySelector('#supEditNotes')?.value.trim() || ''
  }));
  if (!result) return;
  sup.name = result.name;
  sup.phone = result.phone;
  sup.contact = result.contact;
  sup.notes = result.notes;
  saveData();
  showToast('تم حفظ بيانات المورد', 'success');
  if (currentPage === 'inventory') renderInventoryPage();
}

function renderSupplierSelectOptions(selectedSupplierName) {
  ensureOmni();
  const opts = [`<option value="">— اختر مورد —</option>`];
  (omni.suppliers || []).slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(s => {
    const selected = String(s.name) === String(selectedSupplierName) ? 'selected' : '';
    opts.push(`<option value="${escapeHtml(s.id)}" data-name="${escapeHtml(s.name)}" ${selected}>${escapeHtml(s.name)}</option>`);
  });
  opts.push(`<option value="__new__">+ إضافة مورد جديد…</option>`);
  return opts.join('');
}

async function resolveSupplierSelection(select, newNameInput) {
  ensureOmni();
  const val = select?.value || '';
  if (!val) return { supplierId: '', supplier: '-' };
  if (val === '__new__') {
    const name = (newNameInput?.value || '').trim();
    if (!name) return { supplierId: '', supplier: '-' };
    const sup = upsertSupplierByName(name);
    return { supplierId: sup?.id || '', supplier: sup?.name || name };
  }
  const sup = (omni.suppliers || []).find(s => s.id === val);
  return { supplierId: sup?.id || '', supplier: sup?.name || '-' };
}

async function addMaterial() {
  ensureOmni();
  const html = `
    <div class="workflow-insp-grid">
      <label>اسم المادة<input id="matAddName" class="form-input"></label>
      <label>الوحدة<input id="matAddUnit" class="form-input" value="قطعة"></label>
      <label>التصنيف<input id="matAddCategory" class="form-input" value="عام" placeholder="مثال: خام / كهربائي / تشطيب"></label>
      <label>المخزون<input id="matAddStock" type="number" class="form-input" value="0"></label>
      <label>الحد الأدنى<input id="matAddMin" type="number" class="form-input" value="5"></label>
      <label>المورد
        <select id="matAddSupplier" class="form-input" onchange="document.getElementById('matAddSupplierNew').style.display = this.value === '__new__' ? 'block' : 'none';">
          ${renderSupplierSelectOptions('')}
        </select>
        <input id="matAddSupplierNew" class="form-input" placeholder="اسم المورد الجديد" style="display:none;margin-top:6px;">
      </label>
      <label>الكلفة<input id="matAddCost" type="number" class="form-input" value="0"></label>
      <label>نوع التتبع
        <select id="matAddTracking" class="form-input">
          <option value="none">بدون تتبع</option>
          <option value="lot">تتبع بالحصة (Lot)</option>
          <option value="serial">تتبع بالرقم التسلسلي (Serial)</option>
        </select>
      </label>
      <label>طريقة التقييم
        <select id="matAddCostingMethod" class="form-input">
          <option value="avco">المعدل الموزون (AVCO)</option>
          <option value="fifo">الوارد أولاً صادر أولاً (FIFO)</option>
          <option value="lifo">الوارد أخيراً صادر أولاً (LIFO)</option>
        </select>
      </label>
      <label style="grid-column: 1 / -1;">رابط الصورة (اختياري) — يساعد عمال المستودع على تمييز المادة
        <input id="matAddPhoto" class="form-input" placeholder="https://... أو data:image/...">
      </label>
    </div>
  `;
  const result = await showOmniModal('إضافة مادة', html, async body => {
    const name = body.querySelector('#matAddName')?.value.trim();
    if (!name) return false;
    const sel = await resolveSupplierSelection(body.querySelector('#matAddSupplier'), body.querySelector('#matAddSupplierNew'));
    return {
      name,
      unit: body.querySelector('#matAddUnit')?.value.trim() || 'قطعة',
      category: body.querySelector('#matAddCategory')?.value.trim() || 'عام',
      stock: Number(body.querySelector('#matAddStock')?.value) || 0,
      minimum: Number(body.querySelector('#matAddMin')?.value) || 0,
      supplier: sel.supplier,
      supplierId: sel.supplierId,
      cost: Number(body.querySelector('#matAddCost')?.value) || 0,
      tracking: body.querySelector('#matAddTracking')?.value || 'none',
      costingMethod: body.querySelector('#matAddCostingMethod')?.value || 'avco',
      photoUrl: body.querySelector('#matAddPhoto')?.value.trim() || ''
    };
  });
  if (!result) return;

  try {
    const currentCoId = window.getActiveOrgProfile()?.companyId || '';
    if (window.RecordService) {
      const newMat = await RecordService.create('omni.materials', {
        ...result,
        companyId: currentCoId,
        reserved: 0,
        reservedQty: 0,
        reservations: [],
        movements: []
      });
      omni.materials.push(newMat);
    } else {
      omni.materials.push({ id: makeId('mat'), ...result, companyId: currentCoId, reserved: 0, reservedQty: 0, reservations: [], movements: [] });
      saveData();
    }
    // Record the initial stock as an opening movement so the history is complete from day 1.
    if (Number(result.stock) > 0) {
      const created = omni.materials[omni.materials.length - 1];
      recordStockMovement(created.id, 'in', Number(result.stock), {
        sourceType: 'manual', ref: 'إنشاء المادة', note: 'رصيد افتتاحي'
      });
      saveData();
    }
    renderInventoryPage();
  } catch (e) {
    console.error(e);
    showToast(e.message || 'فشل إضافة المادة', 'error');
  }
}

async function editMaterial(matId) {
  ensureOmni();
  const m = (omni.materials || []).find(x => x.id === matId);
  if (!m) return;
  const html = `
    <div class="workflow-insp-grid">
      <label style="grid-column:1 / -1;">اسم المادة<input id="matEditName" class="form-input" value="${escapeHtml(m.name || '')}"></label>
      <label>الوحدة<input id="matEditUnit" class="form-input" value="${escapeHtml(m.unit || '')}"></label>
      <label>التصنيف<input id="matEditCategory" class="form-input" value="${escapeHtml(m.category || '')}"></label>
      <label>المخزون<input id="matEditStock" type="number" class="form-input" value="${Number(m.stock) || 0}"></label>
      <label>المحجوز<input id="matEditReserved" type="number" class="form-input" value="${getMaterialReservedQty(m)}"></label>
      <label>الحد الأدنى<input id="matEditMin" type="number" class="form-input" value="${Number(m.minimum ?? m.minQty) || 0}"></label>
      <label>المورد
        <select id="matEditSupplier" class="form-input" onchange="document.getElementById('matEditSupplierNew').style.display = this.value === '__new__' ? 'block' : 'none';">
          ${renderSupplierSelectOptions(m.supplier || '')}
        </select>
        <input id="matEditSupplierNew" class="form-input" placeholder="اسم المورد الجديد" style="display:none;margin-top:6px;">
      </label>
      <label>الكلفة<input id="matEditCost" type="number" class="form-input" value="${Number(m.cost) || 0}"></label>
      <label>نوع التتبع
        <select id="matEditTracking" class="form-input">
          <option value="none" ${m.tracking === 'none' ? 'selected' : ''}>بدون تتبع</option>
          <option value="lot" ${m.tracking === 'lot' ? 'selected' : ''}>تتبع بالحصة (Lot)</option>
          <option value="serial" ${m.tracking === 'serial' ? 'selected' : ''}>تتبع بالرقم التسلسلي (Serial)</option>
        </select>
      </label>
      <label>طريقة التقييم
        <select id="matEditCostingMethod" class="form-input">
          <option value="avco" ${m.costingMethod === 'avco' ? 'selected' : ''}>المعدل الموزون (AVCO)</option>
          <option value="fifo" ${m.costingMethod === 'fifo' ? 'selected' : ''}>الوارد أولاً صادر أولاً (FIFO)</option>
          <option value="lifo" ${m.costingMethod === 'lifo' ? 'selected' : ''}>الوارد أخيراً صادر أولاً (LIFO)</option>
        </select>
      </label>
      <label style="grid-column:1 / -1;">رابط الصورة (اختياري)
        <input id="matEditPhoto" class="form-input" value="${escapeHtml(m.photoUrl || '')}" placeholder="https://... أو data:image/...">
      </label>
    </div>
  `;
  const result = await showOmniModal('تعديل مادة', html, async body => {
    const sel = await resolveSupplierSelection(body.querySelector('#matEditSupplier'), body.querySelector('#matEditSupplierNew'));
    return {
      name: body.querySelector('#matEditName')?.value.trim() || m.name,
      unit: body.querySelector('#matEditUnit')?.value.trim() || m.unit,
      category: body.querySelector('#matEditCategory')?.value.trim() || m.category,
      stock: Number(body.querySelector('#matEditStock')?.value) || 0,
      reservedQty: Number(body.querySelector('#matEditReserved')?.value) || 0,
      minimum: Number(body.querySelector('#matEditMin')?.value) || 0,
      supplier: sel.supplier,
      supplierId: sel.supplierId,
      cost: Number(body.querySelector('#matEditCost')?.value) || 0,
      tracking: body.querySelector('#matEditTracking')?.value || 'none',
      costingMethod: body.querySelector('#matEditCostingMethod')?.value || 'avco',
      photoUrl: body.querySelector('#matEditPhoto')?.value.trim() || ''
    };
  });
  if (!result) return;
  // Log a stock adjustment if the stock value changed manually (so the audit trail is preserved).
  const oldStock = Number(m.stock) || 0;
  const delta = result.stock - oldStock;
  m.name = result.name;
  m.unit = result.unit;
  m.category = result.category;
  m.stock = result.stock;
  m.reservedQty = result.reservedQty;
  m.reserved = m.reservedQty;
  m.minimum = result.minimum;
  m.supplier = result.supplier;
  m.supplierId = result.supplierId;
  m.cost = result.cost;
  m.tracking = result.tracking;
  m.costingMethod = result.costingMethod;
  m.photoUrl = result.photoUrl;
  if (delta !== 0) {
    recordStockMovement(matId, 'adjustment', Math.abs(delta), {
      sourceType: 'manual',
      ref: 'تعديل يدوي',
      note: `تغيير المخزون من ${oldStock} إلى ${result.stock} (${delta > 0 ? '+' : ''}${delta})`
    });
  }
  saveData(); renderInventoryPage();
}



// --- GO 16 DE-MONOLITH BRIDGE: ADMIN PANEL CLUSTER ---
// All Admin Panel UI functions, overview, history, logs, backups, and user management (original lines 20584-23390)
// have been moved verbatim to modules/admin-panel.js.
// ------------------------------------------------------



function getV5LocationName(locations, locationId) {
  return (locations || []).find(location => location.id === locationId)?.name || locationId || '-';
}

function getV5MaterialName(productId) {
  const material = (omni.materials || []).find(item => item.id === productId);
  return material?.name || productId || '-';
}

function renderV5InventoryDashboard(locations, quants, moves) {
  const mainQuants = quants.filter(quant => quant.location_id === 'LOC_MAIN');
  const totalQty = mainQuants.reduce((sum, quant) => sum + Number(quant.quantity || 0), 0);
  const totalReserved = mainQuants.reduce((sum, quant) => sum + Number(quant.reserved_quantity || 0), 0);
  const draftMoves = moves.filter(move => move.state !== 'done' && move.state !== 'cancel').length;
  const recentMoves = moves.slice().sort((a, b) => String(b.created_at || b.date || '').localeCompare(String(a.created_at || a.date || ''))).slice(0, 8);

  return `
    <div class="v5-inventory-shell">
      <div class="v5-inventory-toolbar glass-card">
        <div>
          <b>مخزون V5 حسب المواقع</b>
          <span>مبني على مواقع التخزين والكميات وحركات المخزون</span>
        </div>
        <div class="v5-inventory-actions">
          <button class="btn-secondary" onclick="renderInventoryPage()">تحديث</button>
          <button class="btn-primary" onclick="openV5StockMoveModal('receipt')">استلام</button>
          <button class="btn-primary" onclick="openV5StockMoveModal('issue')">صرف</button>
          <button class="btn-primary" onclick="openV5StockMoveModal('transfer')">تحويل</button>
          <button class="btn-primary" onclick="openV5InventoryAdjustmentModal()">جرد/تسوية</button>
        </div>
      </div>

      <div class="v5-inventory-kpis">
        <div class="glass-card v5-inventory-kpi"><b>${locations.length}</b><span>مواقع</span></div>
        <div class="glass-card v5-inventory-kpi"><b>${quants.length}</b><span>أرصدة موقعية</span></div>
        <div class="glass-card v5-inventory-kpi"><b>${totalQty.toLocaleString()}</b><span>كمية في المخزن الرئيسي</span></div>
        <div class="glass-card v5-inventory-kpi"><b>${totalReserved.toLocaleString()}</b><span>محجوز</span></div>
        <div class="glass-card v5-inventory-kpi"><b>${draftMoves}</b><span>حركات مفتوحة</span></div>
      </div>

      <div class="v5-inventory-grid">
        <section class="glass-card v5-inventory-card">
          <h3>شجرة المواقع</h3>
          <div class="v5-location-list">
            ${locations.map(location => `<div class="v5-location-row">
              <span>${escapeHtml(location.name || location.id)}</span>
              <small>${escapeHtml(getV5LocationTypeLabel(location.type))}${location.parent_id ? ` · داخل ${escapeHtml(getV5LocationName(locations, location.parent_id))}` : ''}</small>
            </div>`).join('') || '<div class="admin-empty">لا توجد مواقع بعد</div>'}
          </div>
        </section>

        <section class="glass-card v5-inventory-card">
          <h3>الأرصدة حسب الموقع</h3>
          <div class="v5-quant-list">
            ${quants.map(quant => `<div class="v5-quant-row">
              <div><b>${escapeHtml(getV5MaterialName(quant.product_id))}</b><small>${escapeHtml(getV5LocationName(locations, quant.location_id))}</small></div>
              <span>${Number(quant.available_quantity ?? (Number(quant.quantity || 0) - Number(quant.reserved_quantity || 0))).toLocaleString()} ${escapeHtml(quant.unit || '')}</span>
            </div>`).join('') || '<div class="admin-empty">لا توجد أرصدة موقعية بعد</div>'}
          </div>
        </section>
      </div>

      <section class="glass-card v5-inventory-card">
        <h3>آخر حركات المخزون</h3>
        <div class="v5-move-list">
          ${recentMoves.map(move => `<div class="v5-move-row">
            <div>
              <b>${escapeHtml(getV5MaterialName(move.product_id))}</b>
              <small>من: ${escapeHtml(getV5LocationName(locations, move.location_id))} · إلى: ${escapeHtml(getV5LocationName(locations, move.location_dest_id))}</small>
            </div>
            <span>${Number(move.quantity || move.product_uom_qty || 0).toLocaleString()} ${escapeHtml(move.unit || '')}</span>
            <em class="v5-move-state v5-move-state--${escapeHtml(move.state || 'draft')}">${escapeHtml(getV5MoveStateLabel(move.state))}</em>
            ${move.state === 'done' ? '' : `<button class="btn-secondary" onclick="validateV5StockMove('${escapeHtml(move.id)}')">اعتماد</button>`}
          </div>`).join('') || '<div class="admin-empty">لا توجد حركات مخزون بعد</div>'}
        </div>
      </section>
    </div>
  `;
}

function getV5LocationTypeLabel(type) {
  return ({
    internal: 'داخلي',
    supplier: 'مورد',
    customer: 'عميل',
    inventory: 'تسوية',
    production: 'إنتاج',
    transit: 'عبور',
  })[type] || type || '-';
}

function getV5MoveStateLabel(state) {
  return ({ draft: 'مسودة', confirmed: 'مؤكد', assigned: 'محجوز', done: 'منجز', cancel: 'ملغي' })[state] || state || 'مسودة';
}

async function openV5StockMoveModal(kind = 'transfer') {
  ensureOmni();
  let db;
  try {
    db = await PentagonDB.load({ force: true });
  } catch (error) {
    showToast('تعذر تحميل بيانات المخزون V5', 'error');
    return;
  }
  const locations = db.locations || [];
  const materials = omni.materials || [];
  const defaultFrom = kind === 'receipt' ? 'LOC_SUPPLIERS' : 'LOC_MAIN';
  const defaultTo = kind === 'issue' ? 'LOC_WIP' : 'LOC_MAIN';
  const title = kind === 'receipt' ? 'استلام مادة' : kind === 'issue' ? 'صرف مادة' : 'تحويل مخزون';
  const materialOptions = materials.map(material => `<option value="${escapeHtml(material.id)}">${escapeHtml(material.name)} (${getMaterialAvailableQty(material)} ${escapeHtml(material.unit || '')})</option>`).join('');
  const locationOptions = selected => locations.map(location => `<option value="${escapeHtml(location.id)}" ${location.id === selected ? 'selected' : ''}>${escapeHtml(location.name)}</option>`).join('');
  const html = `
    <div class="workflow-insp-grid">
      <label>المادة<select id="v5MoveProduct" class="form-input">${materialOptions}</select></label>
      <label>الكمية<input id="v5MoveQty" type="number" min="0" step="0.01" class="form-input" value="1"></label>
      <label>من موقع<select id="v5MoveFrom" class="form-input">${locationOptions(defaultFrom)}</select></label>
      <label>إلى موقع<select id="v5MoveTo" class="form-input">${locationOptions(defaultTo)}</select></label>
      <label>المرجع<input id="v5MoveOrigin" class="form-input" value="${title}"></label>
    </div>
  `;
  const result = await showOmniModal(title, html, body => {
    const productId = body.querySelector('#v5MoveProduct')?.value;
    const quantity = Number(body.querySelector('#v5MoveQty')?.value);
    const fromLoc = body.querySelector('#v5MoveFrom')?.value;
    const toLoc = body.querySelector('#v5MoveTo')?.value;
    if (!productId || !Number.isFinite(quantity) || quantity <= 0 || !fromLoc || !toLoc || fromLoc === toLoc) return false;
    return {
      product_id: productId,
      quantity,
      from_loc: fromLoc,
      to_loc: toLoc,
      origin: body.querySelector('#v5MoveOrigin')?.value.trim() || title,
      unit: materials.find(material => material.id === productId)?.unit || '',
    };
  });
  if (!result) return;
  try {
    const move = await StockService.createStockMove(result);
    await StateService.transition('stock_moves', move.id, 'confirmed');
    showToast('تم إنشاء حركة المخزون', 'success');
    renderInventoryPage();
    PentagonServices?.renderHealthChip?.();
  } catch (error) {
    showToast(error.message || 'تعذر إنشاء حركة المخزون', 'error');
  }
}

async function validateV5StockMove(moveId) {
  try {
    await StockService.validateMove(moveId);
    showToast('تم اعتماد حركة المخزون وتحديث الأرصدة', 'success');
    renderInventoryPage();
    PentagonServices?.renderHealthChip?.();
  } catch (error) {
    showToast(error.message || 'تعذر اعتماد الحركة', 'error');
  }
}

async function openV5InventoryAdjustmentModal() {
  ensureOmni();
  let db;
  try {
    db = await PentagonDB.load({ force: true });
  } catch (error) {
    showToast('تعذر تحميل بيانات المخزون V5', 'error');
    return;
  }
  const materials = omni.materials || [];
  const locations = (db.locations || []).filter(location => location.type === 'internal');
  const quants = db.quants || [];
  const materialOptions = materials.map(material => `<option value="${escapeHtml(material.id)}">${escapeHtml(material.name)}</option>`).join('');
  const locationOptions = locations.map(location => `<option value="${escapeHtml(location.id)}">${escapeHtml(location.name)}</option>`).join('');
  const html = `
    <div class="workflow-insp-grid">
      <label>المادة<select id="v5AdjustProduct" class="form-input">${materialOptions}</select></label>
      <label>الموقع<select id="v5AdjustLocation" class="form-input">${locationOptions}</select></label>
      <label>الكمية بعد الجرد<input id="v5AdjustQty" type="number" min="0" step="0.01" class="form-input" value="0"></label>
      <label>سبب التسوية<input id="v5AdjustOrigin" class="form-input" value="تسوية جرد"></label>
      <div class="admin-empty" id="v5AdjustCurrentHint">اختر المادة والموقع لمراجعة الرصيد الحالي.</div>
    </div>
  `;
  const updateCurrentHint = body => {
    const productId = body.querySelector('#v5AdjustProduct')?.value;
    const locationId = body.querySelector('#v5AdjustLocation')?.value;
    const hint = body.querySelector('#v5AdjustCurrentHint');
    if (!hint) return;
    const material = materials.find(item => item.id === productId);
    const quant = quants.find(item => item.product_id === productId && item.location_id === locationId);
    const currentQty = Number(quant?.quantity || 0);
    const unit = material?.unit || quant?.unit || '';
    hint.textContent = productId && locationId
      ? `الرصيد الحالي: ${currentQty.toLocaleString()} ${unit}`.trim()
      : 'اختر المادة والموقع لمراجعة الرصيد الحالي.';
  };
  const result = await showOmniModal('جرد وتسوية المخزون', html, body => {
    const productId = body.querySelector('#v5AdjustProduct')?.value;
    const locationId = body.querySelector('#v5AdjustLocation')?.value;
    const counted = Number(body.querySelector('#v5AdjustQty')?.value);
    if (!productId || !locationId || !Number.isFinite(counted) || counted < 0) return false;
    return {
      product_id: productId,
      location_id: locationId,
      counted_quantity: counted,
      origin: body.querySelector('#v5AdjustOrigin')?.value.trim() || 'تسوية جرد',
      unit: materials.find(material => material.id === productId)?.unit || '',
    };
  }, body => {
    body.querySelector('#v5AdjustProduct')?.addEventListener('change', () => updateCurrentHint(body));
    body.querySelector('#v5AdjustLocation')?.addEventListener('change', () => updateCurrentHint(body));
    updateCurrentHint(body);
  });
  if (!result) return;
  try {
    await StockService.createInventoryAdjustment(result);
    showToast('تم إنشاء واعتماد تسوية الجرد', 'success');
    renderInventoryPage();
    PentagonServices?.renderHealthChip?.();
  } catch (error) {
    showToast(error.message || 'تعذر تنفيذ تسوية الجرد', 'error');
  }
}

// ═══════════ QC CENTER V2 — QUALITY GATE + REWORK CONTROL ═══════════
let qcCenterTab = 'dashboard';
let omniActiveQcInspectorTab = 0;

// getDefaultQcSettings() moved to modules/data-providers.js (GO 16 de-monolith Phase 2)

// defaultQcTemplates() moved to modules/data-providers.js (GO 16 de-monolith Phase 1)


// ═══════════ ANALYTICS INTELLIGENCE BRAIN ═══════════
// T4.3 de-monolith: Analytics Intelligence Brain moved to modules/analytics-dashboard.js.
// Keep omniShowQcSimulator here because the QC dashboard above owns and reads it.
let omniShowQcSimulator = false;

// ═══════════ UNIVERSAL INSPECTOR PANEL ═══════════
// T0.4 dedup (2026-07-12): dead copy (SOP/maintenance tabs are placeholder
// "قريباً..."), shadowed by the richer live definition further below (SOP
// link + maintenance actions actually implemented). Kept per add-only rule.
// T4.5 de-monolith: Deprecated machine inspector renderer moved to modules/machine-management.js.

// T4.5 de-monolith: Machine queue inspector actions moved to modules/machine-management.js.

function renderMaterialInspectorTab(materialId, tabIdx = 0) {
  ensureOmni();
  const data = (omni.materials||[]).find(m => m.id === materialId);
  const panel = document.getElementById('inspectorPanel');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!data || !panel || !tabs || !body) return;
  title.textContent = data.name;
  const orgSymbol = omni.adminSettings?.organization?.currencySymbol || 'د.ع';
  const movements = (data.movements || []).slice().reverse();
  const reservations = data.reservations || [];
  const tabList = [
    { id: 'overview',     label: 'نظرة عامة',       icon: 'fa-gauge-high' },
    { id: 'history',      label: `الحركات (${movements.length})`, icon: 'fa-clock-rotate-left' },
    { id: 'reservations', label: `الحجوزات (${reservations.length})`, icon: 'fa-lock' }
  ];
  tabs.innerHTML = tabList.map((t,i) => `<button class="insp-tab ${i===tabIdx?'active':''}" onclick="renderMaterialInspectorTab('${materialId}', ${i})"><i class="fa-solid ${t.icon}" style="margin-left:4px;"></i>${escapeHtml(t.label)}</button>`).join('');

  if (tabIdx === 0) {
    const avail = getMaterialAvailableQty(data);
    const critical = avail <= (Number(data.minimum) || 0);
    const stockValue = (Number(data.stock) || 0) * (Number(data.cost) || 0);
    body.innerHTML = `
      <div class="mat-insp-hero">
        ${data.photoUrl ? `<img src="${escapeHtml(data.photoUrl)}" alt="" class="mat-insp-photo" onerror="this.style.display='none'">` : `<div class="mat-insp-photo-placeholder">📦</div>`}
        <div class="mat-insp-heroinfo">
          <h3>${escapeHtml(data.name)}</h3>
          <p>${escapeHtml(data.category || 'بدون تصنيف')} · ${escapeHtml(data.supplier || 'بدون مورد')}</p>
          ${critical ? '<span class="inv-badge inv-badge-danger">⚠ المخزون ناقص — أعد الطلب</span>' : '<span class="inv-badge inv-badge-ok">✓ المخزون كافٍ</span>'}
        </div>
      </div>

      <div class="mat-insp-kpis">
        <div class="mat-insp-kpi"><span>الكلي</span><b>${data.stock || 0}</b><small>${escapeHtml(data.unit || '')}</small></div>
        <div class="mat-insp-kpi mat-insp-kpi-reserved"><span>محجوز</span><b>${getMaterialReservedQty(data)}</b><small>${escapeHtml(data.unit || '')}</small></div>
        <div class="mat-insp-kpi mat-insp-kpi-${critical ? 'danger' : 'success'}"><span>متاح</span><b>${avail}</b><small>${escapeHtml(data.unit || '')}</small></div>
        <div class="mat-insp-kpi"><span>الحد الأدنى</span><b>${data.minimum || 0}</b><small>${escapeHtml(data.unit || '')}</small></div>
        <div class="mat-insp-kpi"><span>كلفة الوحدة</span><b>${(data.cost || 0).toLocaleString()}</b><small>${escapeHtml(orgSymbol)}</small></div>
        <div class="mat-insp-kpi mat-insp-kpi-value"><span>قيمة المخزون</span><b>${Math.round(stockValue).toLocaleString()}</b><small>${escapeHtml(orgSymbol)}</small></div>
      </div>

      <div class="insp-section"><h4><i class="fa-solid fa-battery-half"></i> مؤشر المخزون</h4>${renderMaterialBattery(data)}</div>

      <div class="insp-actions">
        <button class="btn-primary" onclick="editMaterial('${materialId}')"><i class="fa-solid fa-pen"></i> تعديل المادة</button>
        <button class="${critical ? 'btn-primary' : 'btn-secondary'}" onclick="createPurchaseRequest('${materialId}')"><i class="fa-solid fa-cart-plus"></i> طلب شراء</button>
      </div>
    `;
  } else if (tabIdx === 1) {
    // Movement history tab — full audit trail
    body.innerHTML = `
      <div class="insp-section">
        <h4><i class="fa-solid fa-clock-rotate-left"></i> سجل حركات المخزون</h4>
        ${movements.length === 0 ? '<p class="muted">لا توجد حركات مسجّلة بعد لهذه المادة.</p>' : `
          <div class="mat-movements-list">
            ${movements.slice(0, 100).map(m => renderMovementRow(m, data)).join('')}
            ${movements.length > 100 ? `<p class="muted" style="text-align:center;padding:8px;">عُرضت أحدث 100 من ${movements.length} حركة</p>` : ''}
          </div>
        `}
      </div>
    `;
  } else if (tabIdx === 2) {
    body.innerHTML = `
      <div class="insp-section">
        <h4><i class="fa-solid fa-lock"></i> الحجوزات النشطة والسابقة (${reservations.length})</h4>
        ${reservations.length === 0 ? '<p class="muted">لا توجد حجوزات على هذه المادة.</p>' : `
          <div class="mat-reservations-list">
            ${reservations.slice().reverse().map(res => `
              <div class="mat-reservation-row ${res.status === 'reserved' ? 'is-active' : 'is-released'}">
                <div>
                  <b>${escapeHtml(res.title || 'بدون عنوان')}</b>
                  <small>المصدر: ${escapeHtml(res.sourceType || '-')} · ${res.createdAt ? new Date(res.createdAt).toLocaleString() : ''}</small>
                </div>
                <div class="mat-reservation-meta">
                  <span class="mat-reservation-qty">${res.qty} ${escapeHtml(res.unit || data.unit || '')}</span>
                  <span class="mat-reservation-status">${res.status === 'reserved' ? '🔒 محجوز' : '✓ مُحرَّر'}</span>
                  ${res.status === 'reserved' ? `<button class="btn-secondary" style="font-size:10px;padding:3px 8px;" onclick="releaseMaterialReservation('${materialId}', '${res.id}')"><i class="fa-solid fa-unlock"></i> تحرير</button>` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  }
}

// Renders a single stock movement row with color coding by type
function renderMovementRow(m, material) {
  const typeMeta = {
    in:         { label: 'دخول',   icon: 'fa-arrow-down', sign: '+', class: 'mov-in' },
    out:        { label: 'خروج',   icon: 'fa-arrow-up',   sign: '-', class: 'mov-out' },
    reserved:   { label: 'حجز',    icon: 'fa-lock',       sign: '🔒', class: 'mov-reserved' },
    released:   { label: 'تحرير',  icon: 'fa-unlock',     sign: '🔓', class: 'mov-released' },
    adjustment: { label: 'تعديل',  icon: 'fa-pen',        sign: '±', class: 'mov-adjustment' }
  };
  const meta = typeMeta[m.type] || typeMeta.adjustment;
  const date = m.date ? new Date(m.date).toLocaleString() : '';
  const unit = material?.unit || '';
  return `
    <div class="mat-movement-row ${meta.class}">
      <div class="mat-movement-icon"><i class="fa-solid ${meta.icon}"></i></div>
      <div class="mat-movement-body">
        <div class="mat-movement-line1">
          <b>${meta.sign} ${m.qty} ${escapeHtml(unit)}</b>
          <span class="mat-movement-type">${meta.label}</span>
          ${m.ref ? `<span class="mat-movement-ref">${escapeHtml(m.ref)}</span>` : ''}
        </div>
        ${m.note ? `<div class="mat-movement-note">${escapeHtml(m.note)}</div>` : ''}
        <div class="mat-movement-meta">${escapeHtml(date)}${m.actor && m.actor !== 'system' ? ' · بواسطة ' + escapeHtml(m.actor) : ''}</div>
      </div>
      <div class="mat-movement-after">
        <span>المخزون بعد</span>
        <b>${m.stockAfter ?? '-'}</b>
      </div>
    </div>
  `;
}

function releaseMaterialReservation(materialId, resId) {
  const mat = getMaterialById(materialId);
  if (!mat) return;
  const res = (mat.reservations||[]).find(r => r.id === resId);
  if (res && res.status === 'reserved') {
    res.status = 'released';
    mat.reservedQty = Math.max(0, getMaterialReservedQty(mat) - res.qty);
    mat.reserved = mat.reservedQty;
    recordStockMovement(materialId, 'released', res.qty, {
      sourceType: res.sourceType || 'manual',
      sourceId: res.sourceId || '',
      ref: res.title || '',
      note: `تحرير حجز سابق`
    });
    saveData(); renderMaterialInspectorTab(materialId, 1);
  }
}

function openInspector(type, id) {
  ensureOmni();
  const panel = document.getElementById('inspectorPanel');
  const overlay = document.getElementById('inspectorOverlay');
  const title = document.getElementById('inspectorTitle');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  if (!panel || !overlay) return;
  panel.classList.remove('kanban-inspector-panel');
  tabs.className = 'inspector-tabs';
  body.className = 'inspector-body';
  // Ensure the panel + overlay are visible BEFORE delegating to typed render functions —
  // they don't unhide on their own, so without this line every reopen after closeInspector()
  // would render into hidden DOM (regression-prone bug previously present for all 4 types).
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');

  let data = null;
  let tabList = [];

  if (type === 'machine') {
    renderMachineInspectorTab(id, 0);
    return;
  } else if (type === 'material') {
    renderMaterialInspectorTab(id, 0);
    return;
  } else if (type === 'oppack') {
    renderOpPackInspectorTab(id);
    return;
  } else if (type === 'task') {
    renderTaskInspectorTab(id, 0);
    return;
  }

  tabs.innerHTML = tabList.map((t,i) => `<button class="insp-tab ${i===0?'active':''}">${t}</button>`).join('');
  panel.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function closeInspector() {
  const panel = document.getElementById('inspectorPanel');
  const tabs = document.getElementById('inspectorTabs');
  const body = document.getElementById('inspectorBody');
  panel?.classList.add('hidden');
  panel?.classList.remove('kanban-inspector-panel');
  panel?.classList.remove('kanban-inspector-v2');
  panel?.classList.remove('pack-designer-fullscreen-mode');
  panel?.classList.remove('op-pack-fullscreen-modal');
  document.body.classList.remove('pack-designer-active');
  if (tabs) tabs.className = 'inspector-tabs';
  if (body) body.className = 'inspector-body';
  document.getElementById('inspectorOverlay')?.classList.add('hidden');
}

// T0.4 dedup (2026-07-12): dead copy (status/operator/queue only), shadowed
// by the richer live definition below (SOP link, AI workspace, photo, cost,
// model, description). Kept per add-only rule.
// T4.5 de-monolith: Machine inspector editors moved to modules/machine-management.js.

// T4.5 de-monolith: Live machine inspector and maintenance actions moved to modules/machine-management.js.

const CMD_PALETTE_COMMANDS = [
  { label: 'فتح مركز القيادة', action: () => switchPage('command_center'), keywords: 'command center dashboard' },
  { label: 'فتح اللوحة التنفيذية (Kanban)', action: () => switchPage('kanban'), keywords: 'kanban board لوحة' },
  { label: 'فتح مصمم العمليات', action: () => switchPage('workflow'), keywords: 'workflow pipeline عمليات' },
  { label: 'فتح باقات العمليات', action: () => switchPage('op_packs'), keywords: 'operation packs باقات' },
  { label: 'فتح إدارة المهام', action: () => switchPage('task_manager'), keywords: 'task manager مهام' },
  { label: 'فتح مكتبة SOP', action: () => switchPage('sop'), keywords: 'sop library إجراءات' },
  { label: 'فتح لوحة المكائن', action: () => switchPage('machines'), keywords: 'machines مكائن ماكينة' },
  { label: 'فتح المخزون والمواد', action: () => switchPage('inventory'), keywords: 'inventory مخزون مواد' },
  { label: 'فتح مركز الجودة', action: () => switchPage('qc_center'), keywords: 'qc quality جودة' },
  { label: 'فتح التحليلات', action: () => switchPage('analytics'), keywords: 'analytics تحليلات' },
  { label: 'فتح لوحة AI', action: () => switchPage('intelligence'), keywords: 'ai intelligence ذكاء dashboard' },
  { label: 'فتح WhatsApp', action: () => switchPage('whatsapp'), keywords: 'whatsapp واتساب رسائل' },
  { label: 'فتح دليل الاستخدام', action: () => switchPage('help_manual'), keywords: 'help manual دليل مساعدة' },
  { label: 'فتح قاعدة المعرفة الفنية', action: () => switchPage('knowledge_base'), keywords: 'knowledge base kb faq قاعدة المعرفة الأسئلة الشائعة' },
  { label: 'فتح محرك الأتمتة', action: () => switchPage('automation'), keywords: 'automation اتمتة rules' },
  { label: 'فتح لوحة تحكم الأدمن', action: () => switchPage('admin_panel'), keywords: 'admin settings control panel اعدادات ادمن' },
  { label: 'إضافة بطاقة كانبان', action: () => { switchPage('kanban'); setTimeout(()=>addKanbanCard(), 100); }, keywords: 'add card بطاقة' },
  { label: 'إضافة عمود كانبان', action: () => { switchPage('kanban'); setTimeout(()=>addKanbanColumn(), 100); }, keywords: 'add column عمود' },
  { label: 'إضافة مهمة', action: () => { switchPage('task_manager'); }, keywords: 'add task مهمة' },
  { label: 'إضافة SOP', action: () => { switchPage('sop'); setTimeout(()=>addSop(), 100); }, keywords: 'add sop إجراء' },
  { label: 'إضافة ماكينة', action: () => { switchPage('machines'); setTimeout(()=>addMachine(), 100); }, keywords: 'add machine ماكينة' },
  { label: 'إضافة مادة', action: () => { switchPage('inventory'); setTimeout(()=>addMaterial(), 100); }, keywords: 'add material مادة' },
  { label: 'إضافة فحص جودة', action: () => { switchPage('qc_center'); setTimeout(()=>addQcRecord(), 100); }, keywords: 'add qc فحص' },
  { label: 'تشغيل باقة لافتة أكريليك', action: () => executeOpPack('pack_acrylic_sign'), keywords: 'run acrylic sign أكريلك' },
  { label: 'تشغيل باقة راوتر MDF', action: () => executeOpPack('pack_mdf_router'), keywords: 'run mdf router خشب' },
  { label: 'تشغيل باقة طباعة ثلاثية الأبعاد', action: () => executeOpPack('pack_3dprint'), keywords: 'run 3d print طباعة' },
  { label: 'فتح لوحة المالية', action: () => switchPage('finance'), keywords: 'finance مالية' },
  { label: 'فتح القاصة', action: () => switchPage('cashbox'), keywords: 'cashbox قاصة' },
  { label: 'فتح حاسبة الرواتب', action: () => switchPage('calculator'), keywords: 'calculator payroll رواتب' },
];

let cmdPaletteIdx = 0;

function openCmdPalette() {
  const ov = document.getElementById('cmdPaletteOverlay');
  const pal = document.getElementById('cmdPalette');
  const inp = document.getElementById('cmdPaletteInput');
  if (!ov || !pal) return;
  ov.classList.remove('hidden');
  pal.classList.remove('hidden');
  inp.value = '';
  cmdPaletteIdx = 0;
  filterCmdPalette();
  setTimeout(() => inp.focus(), 50);
}

function closeCmdPalette() {
  document.getElementById('cmdPaletteOverlay')?.classList.add('hidden');
  document.getElementById('cmdPalette')?.classList.add('hidden');
}

function filterCmdPalette() {
  const inp = document.getElementById('cmdPaletteInput');
  const res = document.getElementById('cmdPaletteResults');
  if (!inp || !res) return;
  const q = inp.value.toLowerCase().trim();
  const filtered = q ? CMD_PALETTE_COMMANDS.filter(c => c.label.toLowerCase().includes(q) || c.keywords.toLowerCase().includes(q)) : CMD_PALETTE_COMMANDS;
  cmdPaletteIdx = 0;
  res.innerHTML = filtered.map((c, i) => `<div class="cmd-result ${i===0?'cmd-result-active':''}" data-idx="${i}" onclick="executeCmdPaletteItem(${i})" onmouseenter="setCmdPaletteIdx(${i})">${c.label}</div>`).join('') || '<div class="cmd-result-empty">لا نتائج</div>';
  window._cmdFiltered = filtered;
}

function setCmdPaletteIdx(i) {
  cmdPaletteIdx = i;
  document.querySelectorAll('.cmd-result').forEach((el, j) => el.classList.toggle('cmd-result-active', j === i));
}

function cmdPaletteKeydown(e) {
  const items = window._cmdFiltered || [];
  if (e.key === 'ArrowDown') { e.preventDefault(); setCmdPaletteIdx(Math.min(cmdPaletteIdx + 1, items.length - 1)); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setCmdPaletteIdx(Math.max(cmdPaletteIdx - 1, 0)); }
  else if (e.key === 'Enter') { e.preventDefault(); executeCmdPaletteItem(cmdPaletteIdx); }
  else if (e.key === 'Escape') { closeCmdPalette(); }
}

function executeCmdPaletteItem(idx) {
  const items = window._cmdFiltered || [];
  if (items[idx]) { closeCmdPalette(); items[idx].action(); }
}

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openCmdPalette(); }
  if (e.key === 'Escape') closeCmdPalette();
});

// ─── Theme Switcher ───
const THEMES = ['default', 'glass', 'abstract', 'neumorphism', 'clean', 'bento', 'premium', 'glassmorphism', 'dashboard', 'refined', 'shadcn', 'perspective'];
let currentTheme = 'default';

function initTheme() {
  const savedTheme = localStorage.getItem('site-theme') || 'default';
  setTheme(savedTheme);

  // Initialize real glass effects if theme is glass
  if (savedTheme === 'glass') {
    setTimeout(() => {
      if (window.initRealGlassEffect) {
        window.initRealGlassEffect();
      }
    }, 300);
  }
}

// ─── Omni Orb Style (تصميم أومني/الأورب) ───
// Settings-selectable visual for the floating Jarvis/Omni orb (#jarvisOrb).
// 'classic' = the original spinning color-wheel ball (unchanged, default).
// 'glass'   = the reverse-engineered volumetric glass core (modules/jarvis-orb.css).
// Purely a body[data-orb-style] flag; the orb widget itself renders both
// variants and CSS shows/hides them, so this function only needs to persist
// the flag and toggle the attribute - no DOM rebuild required.
function applyOrbStyle(style) {
  document.body.dataset.orbStyle = (style === 'glass') ? 'glass' : 'classic';
}

function setTheme(theme) {
  if (!THEMES.includes(theme)) return;

  currentTheme = theme;
  const body = document.body;

  // Remove all theme classes
  body.classList.remove('theme-glass', 'theme-abstract', 'theme-neumorphism', 'theme-clean', 'theme-bento', 'theme-premium', 'theme-glassmorphism', 'theme-dashboard', 'theme-refined', 'theme-shadcn');

  // Add new theme class if not default
  if (theme === 'glass') {
    body.classList.add('theme-glass');
    // Initialize real glass effects
    setTimeout(() => {
      if (window.initRealGlassEffect) {
        window.initRealGlassEffect();
      }
    }, 100);
  } else if (theme === 'abstract') {
    body.classList.add('theme-abstract');
  } else if (theme === 'neumorphism') {
    body.classList.add('theme-neumorphism');
  } else if (theme === 'clean') {
    body.classList.add('theme-clean');
  } else if (theme === 'bento') {
    body.classList.add('theme-bento');
  } else if (theme === 'premium') {
    body.classList.add('theme-premium');
  } else if (theme === 'glassmorphism') {
    body.classList.add('theme-glassmorphism');
  } else if (theme === 'dashboard') {
    body.classList.add('theme-dashboard');
  } else if (theme === 'refined') {
    body.classList.add('theme-refined');
  } else if (theme === 'shadcn') {
    body.classList.add('theme-shadcn');
  }

  // Save to localStorage
  localStorage.setItem('site-theme', theme);

  // Update indicator
  updateThemeIndicator();
}

function cycleTheme() {
  const currentIdx = THEMES.indexOf(currentTheme);
  const nextIdx = (currentIdx + 1) % THEMES.length;
  setTheme(THEMES[nextIdx]);
}

function updateThemeIndicator() {
  const indicator = document.getElementById('themeIndicator');
  const label = document.querySelector('.theme-label');

  if (!indicator) return;

  const themeNames = {
    'default': 'الافتراضي',
    'glass': 'زجاجي',
    'abstract': 'حديث',
    'neumorphism': 'مجسّم',
    'clean': 'نظيف',
    'bento': 'بنتو',
    'premium': 'بريميوم',
    'glassmorphism': 'زجاجي ضبابي',
    'dashboard': 'لوحة بيانات',
    'refined': 'راقٍ',
    'shadcn': 'شادسـن'
  };

  if (label) label.textContent = themeNames[currentTheme] || 'المظهر';
  if (typeof renderThemeMenu === 'function') renderThemeMenu();
}

// ─── Appearance dropdown menu ───
const THEME_META = {
  'default':       { label: 'الافتراضي',    swatch: '#0a0e1a' },
  'glass':         { label: 'زجاجي',         swatch: '#1e3a5f' },
  'abstract':      { label: 'حديث',          swatch: '#818cf8' },
  'neumorphism':   { label: 'مجسّم',         swatch: '#e7e5e4' },
  'clean':         { label: 'نظيف',          swatch: '#ffffff' },
  'bento':         { label: 'بنتو',          swatch: '#fff5e6' },
  'premium':       { label: 'بريميوم',       swatch: '#0071e3' },
  'glassmorphism': { label: 'زجاجي ضبابي',   swatch: 'linear-gradient(135deg,#312e81,#1856ff)' },
  'dashboard':     { label: 'لوحة بيانات',   swatch: 'linear-gradient(135deg,#0d1117,#2f81f7)' },
  'refined':       { label: 'راقٍ',          swatch: '#8b5cf6' },
  'shadcn':        { label: 'شادسـن',        swatch: '#18181b' }
};

function renderThemeMenu() {
  const menu = document.getElementById('themeMenu');
  if (!menu) return;
  menu.innerHTML = THEMES.map(function (t) {
    const m = THEME_META[t] || { label: t, swatch: '#888' };
    const active = (t === currentTheme) ? ' active' : '';
    const check = active ? '<span class="theme-check">✓</span>' : '';
    return '<button class="theme-menu-item' + active + '" role="menuitem" onclick="selectTheme(\'' + t + '\')">' +
           '<span class="theme-swatch" style="background:' + m.swatch + '"></span>' +
           '<span>' + m.label + '</span>' + check + '</button>';
  }).join('');
}

function toggleThemeMenu(e) {
  if (e) e.stopPropagation();
  const wrap = document.getElementById('themeSwitcherWrap');
  const btn = document.getElementById('btnThemeSwitcher');
  if (!wrap) return;
  const open = wrap.classList.toggle('open');
  if (btn) btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) renderThemeMenu();
}

function closeThemeMenu() {
  const wrap = document.getElementById('themeSwitcherWrap');
  const btn = document.getElementById('btnThemeSwitcher');
  if (wrap) wrap.classList.remove('open');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function selectTheme(t) {
  setTheme(t);
  closeThemeMenu();
  if (t === 'glass' && window.initRealGlassEffect) {
    setTimeout(function () { window.initRealGlassEffect(); }, 100);
  }
}

document.addEventListener('click', function (e) {
  const wrap = document.getElementById('themeSwitcherWrap');
  if (wrap && !wrap.contains(e.target)) closeThemeMenu();
});


// Glass effects are now in glass-effects.js module

// ─── OMNISYSTEM V3.2 FRONTEND LOGIC (HTML ONLY INTERACTIVITY) ───

// 1. Employee Dual UI — now handled by renderEmployeePortal()

// 2. Kanban Board HTML 5 Drag & Drop
let draggedKanbanItem = null;
let draggedWorkflowItem = null;

// Initialize drag and drop attributes dynamically
document.addEventListener('DOMContentLoaded', () => {
  // Kanban setup
  const kanbanPage = document.getElementById('pageKanban');
  if (kanbanPage) {
    const columns = kanbanPage.querySelectorAll('.kanban-col');
    columns.forEach(col => {
      col.setAttribute('ondragover', 'allowDrop(event)');
      col.setAttribute('ondrop', 'dropCanvas(event, this)');

      Array.from(col.children).forEach(child => {
        if(child.classList.contains('kanban-item')) {
          child.setAttribute('draggable', 'true');
          child.setAttribute('ondragstart', 'dragInit(event, "kanban")');
          child.setAttribute('ondragend', 'dragEnd(event)');
          if(!child.id) child.id = 'task-' + Math.random().toString(36).substr(2, 9);
        }
      });
    });
  }

  // Workflow setup
  const wfSidebar = document.querySelector('#pageWorkflow .glass-card[style*="width:250px"]');
  const wfCanvas = document.querySelector('#pageWorkflow .glass-card[style*="flex:1"]');

  if (wfSidebar) {
    Array.from(wfSidebar.children).forEach(child => {
      if(child.tagName === 'DIV' && child.style.cursor === 'move') {
        child.setAttribute('draggable', 'true');
        child.setAttribute('ondragstart', 'dragInit(event, "workflow")');
        child.id = 'wf-tool-' + Math.random().toString(36).substr(2, 9);
      }
    });
  }
  if (wfCanvas) {
    wfCanvas.setAttribute('ondragover', 'allowDrop(event)');
    wfCanvas.setAttribute('ondrop', 'dropWorkflow(event, this)');
  }

  // SOP Hub Search Filtering
  const searchInput = document.querySelector('#pageSop input[type="text"]');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      // Get the grid container cards
      const cards = document.querySelectorAll('#pageSop .glass-card');
      cards.forEach(card => {
        // Exclude the header buttons or search wrappers if any
        if (!card.querySelector('h3')) return;
        const text = card.textContent.toLowerCase();
        if(text.includes(q)) {
          card.style.display = 'block';
        } else {
          card.style.display = 'none';
        }
      });
    });
  }
});

// Drag and drop HTML5 handlers
window.dragInit = function(ev, type) {
  if(type === 'kanban') {
    draggedKanbanItem = ev.target;
    ev.dataTransfer.setData("text/plain", ev.target.id);
    ev.target.style.opacity = '0.5';
  } else {
    draggedWorkflowItem = ev.target;
    ev.dataTransfer.setData("text/plain", ev.target.id);
  }
};

window.dragEnd = function(ev) {
  if (ev.target) ev.target.style.opacity = '1';
};

window.allowDrop = function(ev) {
  ev.preventDefault(); // Necessary to allow dropping
};

window.dropCanvas = function(ev, targetCol) {
  ev.preventDefault();
  if (draggedKanbanItem && targetCol) {
    targetCol.appendChild(draggedKanbanItem);
    draggedKanbanItem.style.opacity = '1';
    draggedKanbanItem = null;
    showToast('تم تحديث حالة المهمة', 'success');
  }
};

window.dropWorkflow = function(ev, canvas) {
  ev.preventDefault();
  if (draggedWorkflowItem) {
    // Clone the tool to place on canvas
    const nodeCopy = draggedWorkflowItem.cloneNode(true);
    nodeCopy.id = "wf-node-" + Math.random().toString(36).substr(2, 9);
    nodeCopy.removeAttribute('draggable');
    nodeCopy.removeAttribute('ondragstart');

    // Style as absolute block
    nodeCopy.style.position = 'absolute';
    // Center it on drop
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left - 50;
    const y = ev.clientY - rect.top - 20;
    nodeCopy.style.left = x + 'px';
    nodeCopy.style.top = y + 'px';
    nodeCopy.style.width = '150px';
    nodeCopy.style.border = '2px solid var(--accent-blue)';
    nodeCopy.style.background = 'white';
    nodeCopy.style.color = 'black';
    nodeCopy.style.textAlign = 'center';

    canvas.appendChild(nodeCopy);
    draggedWorkflowItem = null;
    showToast('تم إضافة عقدة للعملية', 'success');
  }
};

// ═══════════ PROCUREMENT ═══════════
async function createPurchaseRequest(materialId, reqQty) {
  ensureOmni();
  const mat = getMaterialById(materialId);
  if (!mat) return;
  const defaultUnitCost = Number(mat.cost || 0);
  const result = await showOmniModal('طلب شراء مادة', `
    <label>كمية الشراء لـ ${escapeHtml(mat.name)}</label><input id="purchaseQty" type="number" class="form-input" value="${reqQty || mat.minimum || 1}">
    <label>كلفة الوحدة المتوقعة<input id="purchaseUnitCost" type="number" step="0.01" class="form-input" value="${defaultUnitCost}"></label>
    <label>المورد المقترح
      <select id="purchaseSupplier" class="form-input" onchange="document.getElementById('purchaseSupplierNew').style.display = this.value === '__new__' ? 'block' : 'none';">
        ${renderSupplierSelectOptions(mat.supplier || '')}
      </select>
      <input id="purchaseSupplierNew" class="form-input" placeholder="اسم المورد الجديد" style="display:none;margin-top:6px;">
    </label>
    <label>سبب الشراء</label><textarea id="purchaseReason" class="form-input">نقص في المخزون</textarea>
  `, async body => {
    const sel = await resolveSupplierSelection(body.querySelector('#purchaseSupplier'), body.querySelector('#purchaseSupplierNew'));
    return {
      qty: Number(body.querySelector('#purchaseQty')?.value) || 0,
      unitCost: Number(body.querySelector('#purchaseUnitCost')?.value) || 0,
      supplier: sel.supplier,
      supplierId: sel.supplierId,
      reason: body.querySelector('#purchaseReason')?.value.trim() || 'نقص في المخزون'
    };
  });
  if (!result) return;
  const qty = parseInt(result.qty, 10);
  if (!qty || qty <= 0) return;
  const reason = result.reason;
  if (!omni.procurement) omni.procurement = { requests: [] };
  if (!Array.isArray(omni.procurement.requests)) omni.procurement.requests = [];
  omni.procurement.requests.push({
    id: makeId('pr'),
    materialId,
    qty,
    reason,
    status: 'pending',
    date: todayISO(),
    requestedBy: 'System'
  });
  createOmniRequest({
    type: 'purchase',
    title: `طلب شراء: ${mat.name}`,
    description: reason,
    requesterId: 'inventory',
    requesterName: 'المخزون',
    sourcePage: 'inventory',
    sourceType: 'material',
    sourceId: materialId,
    priority: getMaterialAvailableQty(mat) <= 0 ? 'urgent' : 'high',
    payload: {
      materialId,
      materialName: mat.name,
      requestedQty: qty,
      unit: mat.unit || '',
      currentStock: Number(mat.stock) || 0,
      reservedQty: getMaterialReservedQty(mat),
      availableQty: getMaterialAvailableQty(mat),
      minStock: Number(mat.minimum ?? mat.minQty ?? 0) || 0,
      unitCost: Number(result.unitCost || 0),
      supplier: result.supplier || mat.supplier || '',
      supplierId: result.supplierId || mat.supplierId || '',
      reason
    }
  });
  saveData();
  showToast('تم إنشاء طلب شراء', 'success');
  renderInventoryPage();
}

// ═══════════ OMNI BOT (NLU ENGINE) ═══════════
function processOmniBotCommand(text, chatBody) {
  ensureOmni();
  const lowerText = text.toLowerCase();

  function reply(msgHtml) {
    const r = document.createElement('div');
    r.className = 'ai-msg';
    r.innerHTML = msgHtml;
    chatBody.appendChild(r);
  }

  // INTENT: Overdue Tasks (المهام المتأخرة)
  if (lowerText.includes('متأخر') || lowerText.includes('متاخره') || lowerText.includes('overdue')) {
    const overdue = omni.kanban.cards.filter(c => c.dueDate && c.dueDate < todayISO() && !c.status?.includes('Done') && !c.status?.includes('مكتمل'));
    if (overdue.length > 0) {
      reply(`وجدت <b>${overdue.length}</b> مهام متأخرة. جاري فتح اللوحة التنفيذية...`);
      setTimeout(() => {
        switchPage('kanban');
      }, 1000);
    } else {
      reply('عظيم! لا توجد أي مهام متأخرة حالياً. كل شيء يسير حسب الجدول.');
    }
    return;
  }

  // INTENT: Low Stock (المخزون / المواد الناقصة)
  if (lowerText.includes('ناقص') || lowerText.includes('مخزون') || lowerText.includes('مواد') || lowerText.includes('جرد')) {
    const lowStock = (omni.materials || []).filter(m => getMaterialAvailableQty(m) <= m.minimum);
    if (lowStock.length > 0) {
      reply(`هناك <b>${lowStock.length}</b> مواد وصلت للحد الأدنى:<br>` +
            lowStock.map(m => `- ${m.name} (${getMaterialAvailableQty(m)} ${m.unit})`).join('<br>') +
            `<br><br><button class="btn-primary" onclick="switchPage('inventory')" style="font-size:11px;padding:2px 6px;">فتح قسم المخزون</button>`);
    } else {
      reply('المخزون بحالة ممتازة. لا توجد مواد تحت الحد الأدنى.');
    }
    return;
  }

  // INTENT: Machine Status (حالة المكائن)
  if (lowerText.includes('مكائن') || lowerText.includes('ماكينة') || lowerText.includes('الة') || lowerText.includes('آلة')) {
    const down = (omni.machines || []).filter(m => m.status === 'maintenance');
    const operational = (omni.machines || []).filter(m => m.status === 'operational');
    reply(`لدينا <b>${operational.length}</b> مكائن تعمل حالياً.<br>` +
          (down.length > 0 ? `<span style="color:var(--danger)">وهناك ${down.length} مكائن في الصيانة: ${down.map(m=>m.name).join('، ')}</span>` : 'لا توجد مكائن معطلة.') +
          `<br><br><button class="btn-primary" onclick="switchPage('machines')" style="font-size:11px;padding:2px 6px;">فتح إدارة المكائن</button>`);
    return;
  }

  // INTENT: Create Task (اضافة مهمة)
  if (lowerText.includes('اضف') || lowerText.includes('انشئ') || lowerText.includes('مهمة') || lowerText.includes('تاسك') || lowerText.includes('جديد')) {
    reply('جاري فتح نافذة إنشاء بطاقة مهمة جديدة...');
    setTimeout(() => {
      switchPage('kanban');
      addOmniCard();
    }, 800);
    return;
  }

  // INTENT: Navigate (افتح / روح)
  if (lowerText.includes('افتح') || lowerText.includes('روح') || lowerText.includes('انتقل') || lowerText.includes('عرض')) {
    if (lowerText.includes('مالي') || lowerText.includes('فلوس') || lowerText.includes('finance')) {
      reply('جاري فتح الداشبورد المالي...');
      switchPage('analytics');
      setTimeout(() => document.querySelectorAll('.insp-tab')[2]?.click(), 500); // Click Finance Tab
      return;
    }
    if (lowerText.includes('جودة') || lowerText.includes('فحص') || lowerText.includes('qc')) {
      reply('جاري فتح مركز الجودة...');
      switchPage('qc_center');
      return;
    }
    if (lowerText.includes('لوحة') || lowerText.includes('كانبان') || lowerText.includes('kanban') || lowerText.includes('تنفيذ')) {
      reply('جاري فتح اللوحة التنفيذية...');
      switchPage('kanban');
      return;
    }
    if (lowerText.includes('قيادة') || lowerText.includes('مركز') || lowerText.includes('داشبورد')) {
      reply('جاري فتح مركز القيادة...');
      switchPage('command_center');
      return;
    }
  }

  // FALLBACK
  reply('أنا المساعد الذكي OMNI BOT. يمكنك سؤالي مثل: <br>- "عرض المهام المتأخرة"<br>- "شنو المواد الناقصة"<br>- "حالة المكائن"<br>- "انشئ مهمة جديدة"<br>- "افتح الداشبورد المالي"');
}

// Permission-hardened employee table override. Kept at the end so it wins over
// earlier legacy definitions without touching unrelated payroll logic.
function renderEmployeesTable() {
  const tbody = document.getElementById('employeesTableBody');
  const emptyState = document.getElementById('employeesEmpty');
  const tableContainer = document.getElementById('employeesTableContainer');
  if (!tbody) return;
  updateEmployeeSortArrows();

  const cfg = getConfig();
  const rows = employees.map((emp, idx) => ({ emp, idx, info: getEmployeeActivityInfo(emp, cfg) }))
    .filter(row => !employeeTableState.activeOnly || row.info.status === 'active')
    .sort((a, b) => {
      const dir = employeeTableState.sortDir === 'asc' ? 1 : -1;
      if (employeeTableState.sortKey === 'name') return String(a.emp.name || '').localeCompare(String(b.emp.name || '')) * dir;
      if (employeeTableState.sortKey === 'salary') return (getEmployeeNominalSalary(a.emp) - getEmployeeNominalSalary(b.emp)) * dir;
      if (employeeTableState.sortKey === 'lastActivity') return (((a.info.lastActivity || 0) - (b.info.lastActivity || 0)) * dir);
      if (employeeTableState.sortKey === 'balance') return (a.info.liveBalance - b.info.liveBalance) * dir;
      if (employeeTableState.sortKey === 'status') {
        const order = { active: 1, inactive: 2 };
        return ((order[a.info.status] || 9) - (order[b.info.status] || 9)) * dir;
      }
      return 0;
    });

  if (!employees.length || !rows.length) {
    if (tableContainer) tableContainer.style.display = 'none';
    if (emptyState) emptyState.style.display = 'block';
    tbody.innerHTML = '';
    return;
  }

  if (tableContainer) tableContainer.style.display = 'block';
  if (emptyState) emptyState.style.display = 'none';
  tbody.innerHTML = '';

  rows.forEach(({ emp, idx, info }) => {
    const lastAttendStr = info.lastActivity
      ? `${info.lastActivity.getFullYear()}-${String(info.lastActivity.getMonth() + 1).padStart(2, '0')}-${String(info.lastActivity.getDate()).padStart(2, '0')}`
      : 'لا توجد بيانات';
    let liveNet = 0;
    try {
      const res = calculateSalaryForEmployee(emp, { ...cfg, nominalSalary: getEmployeeNominalSalary(emp, cfg.nominalSalary) });
      liveNet = res.finalSalary || 0;
    } catch (e) {
      console.warn('Live calc error for', emp.name, e);
    }

    const row = document.createElement('tr');
    const statusClass = info.status === 'active' ? 'active' : 'inactive';
    const canSeeSalary = !window.PermissionService || window.PermissionService.checkField('employees', 'salary');
    const canSeeBalance = !window.PermissionService || window.PermissionService.checkField('employees', 'prevAdvance');
    const canUpdateEmployees = !window.PermissionService || window.PermissionService.check('employees', 'update');
    const lockedHtml = '<div style="color:var(--text-muted); font-size:11px; text-align:center;"><span aria-hidden="true">&#128274;</span> مقفل</div>';
    const salaryHtml = canSeeSalary
      ? `<td><div class="input-with-unit" style="max-width: 150px; margin: 0 auto;"><input type="number" class="salary-input form-input" id="salary_${idx}" value="${getEmployeeNominalSalary(emp)}" ${canUpdateEmployees ? '' : 'disabled'}></div></td>`
      : `<td>${lockedHtml}</td>`;
    const balanceHtml = canSeeBalance
      ? `<div style="font-size:11px; color:var(--text-secondary); margin-bottom:4px;">${formatSignedBalance(info.liveBalance)}</div>
         <div class="input-with-unit" style="max-width: 120px; margin: 0 auto;"><input type="number" class="balance-input form-input" id="balance_${idx}" value="${emp.prevAdvance || 0}" title="الذمة السابقة" ${canUpdateEmployees ? '' : 'disabled'}></div>`
      : lockedHtml;
    const saveHtml = canUpdateEmployees
      ? `<button class="btn-small btn-success employee-save-btn" onclick="saveEmployeeData(${idx})">حفظ</button>`
      : '<button class="btn-small btn-secondary employee-save-btn" disabled title="لا توجد صلاحية">مقفل</button>';

    const detailsHtml = `<button class="btn-small employee-details-btn" onclick="openEmployeeDetails(${idx})">تفاصيل</button>`;

    const _PS = getPayrollSettings();
    const _fmtMin = m => `${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const shiftOptsHtml = Object.keys(_PS.shifts).map(k =>
      `<option value="${k}" ${(emp.shift || 'morning') === k ? 'selected' : ''}>${_PS.shifts[k].label} (${_fmtMin(_PS.shifts[k].startMin)}-${_fmtMin(_PS.shifts[k].endMin)})</option>`
    ).join('');
    const shiftHtml = `<td><select id="shift_${idx}" class="form-input" style="max-width:150px; margin:0 auto;" ${canUpdateEmployees ? '' : 'disabled'}>${shiftOptsHtml}</select></td>`;

    row.innerHTML = `
      <td>${escapeHtml(emp.name)}</td>
      ${salaryHtml}
      ${shiftHtml}
      <td style="direction: ltr; text-align: right;">${lastAttendStr}</td>
      <td>
        <span class="status-badge ${statusClass}">${getEmployeeStatusLabel(info.status)}</span>
        <div style="font-size:11px; color:var(--text-secondary); margin-top:4px;">صافي الشهر: <strong style="color:var(--accent-blue)">${canSeeSalary ? formatNum(liveNet) : 'مقفل'}</strong></div>
      </td>
      <td>${balanceHtml}</td>
      <td><div class="employee-actions-cell">${detailsHtml}${saveHtml}</div></td>
    `;
    tbody.appendChild(row);
  });
}

function saveEmployeeData(empIdx) {
  if (window.PermissionService && !window.PermissionService.check('employees', 'update')) {
    showToast('ليس لديك صلاحية تعديل بيانات الموظف', 'danger');
    return;
  }
  const balanceInput = document.getElementById(`balance_${empIdx}`);
  const salaryInput = document.getElementById(`salary_${empIdx}`);
  if (!balanceInput || !salaryInput) return;

  const newBalance = parseFloat(balanceInput.value) || 0;
  const newSalary = parseFloat(salaryInput.value) || 0;

  employees[empIdx].prevAdvance = newBalance;
  employees[empIdx].salary = newSalary;
  const shiftInput = document.getElementById(`shift_${empIdx}`);
  if (shiftInput) employees[empIdx].shift = shiftInput.value;

  saveData();
  renderEmployeesTable();
  showToast(`تم حفظ بيانات ${employees[empIdx].name} بنجاح`, 'success');
}

function minutesToHHMM(m) {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

function buildEmployeeShiftOptions(selectedShift) {
  const PS = getPayrollSettings();
  return Object.keys(PS.shifts || {}).map(key => {
    const shift = PS.shifts[key];
    return `<option value="${key}" ${String(selectedShift || 'morning') === key ? 'selected' : ''}>${escapeHtml(shift.label || key)} (${minutesToHHMM(shift.startMin)}-${minutesToHHMM(shift.endMin)})</option>`;
  }).join('');
}

// Live "من 09:00 إلى 18:00 · 9 ساعة" line under the shift picker; reflects the
// currently selected base shift OR this employee's custom start/end override.
function buildEmployeeShiftInfoLine(shift) {
  const hoursLabel = Number.isInteger(shift.hours) ? shift.hours : shift.hours.toFixed(1);
  return `من ${minutesToHHMM(shift.startMin)} إلى ${minutesToHHMM(shift.endMin)} · ${hoursLabel} ساعة`;
}

function buildEmployeeManualPeriodRow(period = {}, canUpdate = true) {
  const disabled = canUpdate ? '' : 'disabled';
  return `
    <div class="employee-period-row" data-source="manual" data-id="${escapeHtml(period.id || makeId('PER'))}">
      <input type="date" class="form-input emp-period-start" value="${formatLifecycleDateInput(period.start || period.startDate)}" ${disabled}>
      <input type="date" class="form-input emp-period-end" value="${formatLifecycleDateInput(period.end || period.endDate)}" ${disabled}>
      <input class="form-input emp-period-note" value="${escapeHtml(period.note || '')}" placeholder="ملاحظة" ${disabled}>
      <button type="button" class="btn-small employee-period-remove" onclick="removeEmployeePeriodRow(this)" ${disabled}>×</button>
    </div>
  `;
}

function buildEmployeeReadonlyPeriodRow(period) {
  const label = period.source === 'timesheet' ? 'تايم شيت' : 'قديم';
  const end = period.end || (period.source === 'timesheet' ? period.autoEnd : null);
  return `
    <div class="employee-period-row employee-period-row-readonly" data-source="${escapeHtml(period.source || 'auto')}">
      <input type="date" class="form-input" value="${formatLifecycleDateInput(period.start)}" disabled>
      <input type="date" class="form-input" value="${formatLifecycleDateInput(end)}" disabled>
      <input class="form-input" value="${escapeHtml(label)}" disabled>
      <span class="employee-period-lock">تلقائي</span>
    </div>
  `;
}

function buildEmployeePeriodsPanel(employee, canUpdate) {
  const stored = getStoredEmploymentPeriods(employee);
  const manual = stored.filter(period => period.source === 'manual');
  const readonly = [
    ...stored.filter(period => period.source !== 'manual'),
    ...(getEmployeeTimesheetLifecycle(employee).periods || [])
  ];
  const readonlyRows = readonly.map(buildEmployeeReadonlyPeriodRow).join('');
  const manualRows = manual.map(period => buildEmployeeManualPeriodRow(period, canUpdate)).join('');
  return `
    <div class="employee-periods-panel">
      <div class="employee-periods-head">
        <strong>فترات العمل</strong>
        <button type="button" class="btn-small employee-period-add" onclick="addEmployeePeriodRow(this)" ${canUpdate ? '' : 'disabled'}>+</button>
      </div>
      <div class="employee-periods-labels"><span>مباشرة</span><span>انفكاك</span><span>مصدر/ملاحظة</span><span></span></div>
      <div class="employee-periods-list">${readonlyRows}${manualRows || ''}</div>
    </div>
  `;
}

function addEmployeePeriodRow(button) {
  const list = button?.closest('.employee-periods-panel')?.querySelector('.employee-periods-list');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', buildEmployeeManualPeriodRow({ start: todayISO(), end: '', note: 'عودة للعمل' }, true));
}

function removeEmployeePeriodRow(button) {
  button?.closest('.employee-period-row[data-source="manual"]')?.remove();
}

function collectEmployeeManualPeriods(body) {
  return [...body.querySelectorAll('.employee-period-row[data-source="manual"]')]
    .map(row => ({
      id: row.dataset.id || makeId('PER'),
      startDate: row.querySelector('.emp-period-start')?.value || '',
      endDate: row.querySelector('.emp-period-end')?.value || '',
      note: row.querySelector('.emp-period-note')?.value || '',
      source: 'manual'
    }))
    .filter(period => period.startDate || period.endDate);
}

function openEmployeeDetailsOnOpen(body, emp, canUpdate) {
  if (!canUpdate) return;
  const shiftSelect = body.querySelector('#empDetailShift');
  const infoLine = body.querySelector('#empShiftInfoLine');
  const customToggle = body.querySelector('#empShiftCustomToggle');
  const customFields = body.querySelector('#empShiftCustomFields');
  const customStart = body.querySelector('#empShiftCustomStart');
  const customEnd = body.querySelector('#empShiftCustomEnd');

  const refreshShiftInfo = () => {
    if (customToggle?.checked) {
      const startMin = parseTime(customStart?.value) ?? 0;
      let endMin = parseTime(customEnd?.value) ?? 0;
      let durationMin = endMin - startMin;
      if (durationMin <= 0) durationMin += 24 * 60;
      if (infoLine) infoLine.textContent = buildEmployeeShiftInfoLine({ startMin, endMin, hours: durationMin / 60 });
    } else {
      const PS = getPayrollSettings();
      const def = PS.shifts[shiftSelect?.value] || PS.shifts.morning;
      if (infoLine) infoLine.textContent = buildEmployeeShiftInfoLine({ startMin: def.startMin, endMin: def.endMin, hours: (def.endMin - def.startMin) / 60 });
      if (customStart) customStart.value = minutesToHHMM(def.startMin);
      if (customEnd) customEnd.value = minutesToHHMM(def.endMin);
    }
  };
  shiftSelect?.addEventListener('change', refreshShiftInfo);
  customToggle?.addEventListener('change', () => {
    if (customFields) customFields.style.display = customToggle.checked ? '' : 'none';
    refreshShiftInfo();
  });
  customStart?.addEventListener('input', refreshShiftInfo);
  customEnd?.addEventListener('input', refreshShiftInfo);

  const activeCheckbox = body.querySelector('#empDetailActive');
  const statusBtn = body.querySelector('#empStatusToggleBtn');
  const statusLabel = body.querySelector('#empStatusToggleLabel');
  const confirmBanner = body.querySelector('#empStatusConfirmBanner');
  const confirmDaysEl = body.querySelector('#empStatusConfirmDays');

  const paintStatus = (isActive) => {
    if (activeCheckbox) activeCheckbox.checked = isActive;
    if (statusBtn) statusBtn.classList.toggle('is-active', isActive);
    if (statusBtn) statusBtn.classList.toggle('is-inactive', !isActive);
    if (statusLabel) statusLabel.textContent = isActive ? 'يعمل' : 'مستقيل';
  };

  statusBtn?.addEventListener('click', () => {
    const isActiveNow = !!activeCheckbox?.checked;
    if (isActiveNow) {
      const lastActivity = getLastAttendanceDate(emp);
      const daysSince = lastActivity ? Math.floor((new Date() - lastActivity) / 86400000) : Infinity;
      if (daysSince <= EMPLOYEE_AUTO_RESIGN_AFTER_DAYS) {
        if (confirmDaysEl) confirmDaysEl.textContent = String(daysSince);
        if (confirmBanner) confirmBanner.style.display = 'flex';
        return;
      }
    }
    paintStatus(!isActiveNow);
  });
  body.querySelector('#empStatusConfirmStay')?.addEventListener('click', () => {
    if (confirmBanner) confirmBanner.style.display = 'none';
  });
  body.querySelector('#empStatusConfirmGo')?.addEventListener('click', () => {
    if (confirmBanner) confirmBanner.style.display = 'none';
    paintStatus(false);
  });
}

async function openEmployeeDetails(empIdx) {
  const emp = employees[empIdx];
  if (!emp) return;
  const cfg = getConfig();
  const info = getEmployeeActivityInfo(emp, cfg);
  const canUpdate = !window.PermissionService || window.PermissionService.check('employees', 'update');
  const lastActivity = info.lastActivity
    ? `${info.lastActivity.getFullYear()}-${String(info.lastActivity.getMonth() + 1).padStart(2, '0')}-${String(info.lastActivity.getDate()).padStart(2, '0')}`
    : '-';
  const lifecycle = getEmployeeLifecycle(emp);
  const autoStartDate = lifecycle.start || lifecycle.timesheetLifecycle?.firstAttendance || null;
  const autoEndDate = lifecycle.end || (info.status === 'inactive' ? lifecycle.timesheetLifecycle?.autoResignationDate : null);
  const isOngoing = info.status === 'active' && !autoEndDate;
  const durationLabel = formatEmployeeDurationLabel(autoStartDate, isOngoing ? null : autoEndDate);
  const isActiveNow = isEmployeeFlagActive(emp);
  // Button color/text must both come from the SAME source (the manual flag, which is what
  // actually gets saved) — using the computed lifecycle status for one and the manual flag
  // for the other let them contradict each other (e.g. green "active" showing "مستقيل").
  const statusToggleLabel = isActiveNow ? 'يعمل' : 'مستقيل';
  // Separate, non-interactive hint for the one case they can legitimately disagree: still
  // manually flagged active, but the system auto-considers him inactive from stale attendance.
  const staleDaysSince = info.lastActivity ? Math.floor((new Date() - info.lastActivity) / 86400000) : null;
  const isStaleActive = isActiveNow && info.status === 'inactive';
  const shift = getEmployeeShift(emp);
  const hasCustomShift = emp.shiftStartMin != null || emp.shiftEndMin != null;
  const html = `
    <div class="employee-detail-modal">
      <div class="employee-status-bar">
        <button type="button" id="empStatusToggleBtn" class="employee-status-toggle ${isActiveNow ? 'is-active' : 'is-inactive'}" ${canUpdate ? '' : 'disabled'} title="${escapeHtml(info.lifecycle?.reason || '')}">
          <span class="employee-status-dot"></span>
          <span id="empStatusToggleLabel">${statusToggleLabel}</span>
        </button>
        <div class="employee-status-activity"><span>آخر نشاط</span><strong>${escapeHtml(lastActivity)}</strong></div>
      </div>
      ${isStaleActive ? `<div class="employee-status-stale-hint">⚠️ لا يوجد حضور منذ ${staleDaysSince} يوماً — يعتبره النظام غير نشط تلقائياً رغم أنه لا يزال مؤشَّراً «يعمل». اضغط الزر أعلاه لتأكيد الاستقالة إن لزم.</div>` : ''}
      <input type="checkbox" id="empDetailActive" ${isActiveNow ? 'checked' : ''} style="display:none">
      <div id="empStatusConfirmBanner" class="employee-status-confirm-banner" style="display:none">
        <p>⚠️ آخر نشاط له كان قبل <strong id="empStatusConfirmDays">0</strong> يوم. هل تريد تأكيد أنه استقال؟</p>
        <div class="employee-status-confirm-actions">
          <button type="button" class="btn-secondary" id="empStatusConfirmStay">تراجع</button>
          <button type="button" class="btn-primary" id="empStatusConfirmGo">نعم، استقال</button>
        </div>
      </div>
      <div class="employee-detail-grid">
        <label>اسم الموظف<input id="empDetailName" class="form-input" value="${escapeHtml(emp.name || '')}" ${canUpdate ? '' : 'disabled'}></label>
        <label>الراتب الاسمي<input id="empDetailSalary" type="number" class="form-input" value="${getEmployeeNominalSalary(emp)}" ${canUpdate ? '' : 'disabled'}></label>
        <label>الرصيد/السلفة السابقة<input id="empDetailBalance" type="number" class="form-input" value="${Number(emp.prevAdvance || 0)}" ${canUpdate ? '' : 'disabled'}></label>
        <label>الشفت<select id="empDetailShift" class="form-input" ${canUpdate ? '' : 'disabled'}>${buildEmployeeShiftOptions(emp.shift)}</select></label>
        <div class="employee-shift-panel">
          <div class="employee-shift-info" id="empShiftInfoLine">${buildEmployeeShiftInfoLine(shift)}</div>
          <label class="employee-shift-custom-toggle"><input type="checkbox" id="empShiftCustomToggle" ${hasCustomShift ? 'checked' : ''} ${canUpdate ? '' : 'disabled'}> تخصيص ساعات هذا الموظف (مختلفة عن باقي الفريق)</label>
          <div class="employee-shift-custom-fields" id="empShiftCustomFields" style="${hasCustomShift ? '' : 'display:none'}">
            <label>من<input type="time" id="empShiftCustomStart" class="form-input" value="${minutesToHHMM(shift.startMin)}" ${canUpdate ? '' : 'disabled'}></label>
            <label>إلى<input type="time" id="empShiftCustomEnd" class="form-input" value="${minutesToHHMM(shift.endMin)}" ${canUpdate ? '' : 'disabled'}></label>
          </div>
        </div>
        <label>بدأ العمل<input type="date" class="form-input" value="${formatLifecycleDateInput(autoStartDate)}" disabled></label>
        <label>استمرارية العمل${isOngoing
          ? '<div class="employee-continuity-chip">● مستمر</div>'
          : `<input type="date" class="form-input" value="${formatLifecycleDateInput(autoEndDate)}" disabled>`}</label>
        <div class="employee-duration-note">مدة العمل: <strong>${escapeHtml(durationLabel)}</strong></div>
        <label class="employee-detail-notes">ملاحظات<textarea id="empDetailNotes" class="form-input" rows="3" ${canUpdate ? '' : 'disabled'}>${escapeHtml(emp.notes || '')}</textarea></label>
      </div>
      ${buildEmployeePeriodsPanel(emp, canUpdate)}
      <p class="employee-detail-hint">المباشرة والانفكاك تلقائية من التايم شيت. إذا لم يوجد حضور لأكثر من 15 يوما يعتبر الموظف مستقيلا ولا يدخل التنبؤ.</p>
    </div>
  `;
  const result = await showOmniModal(`تفاصيل ${emp.name || 'موظف'}`, html, (body) => {
    if (!canUpdate) return true;
    const name = body.querySelector('#empDetailName')?.value.trim();
    if (!name) {
      showToast('اسم الموظف مطلوب', 'error');
      return false;
    }
    emp.name = name;
    emp.salary = Number(body.querySelector('#empDetailSalary')?.value) || 0;
    emp.prevAdvance = Number(body.querySelector('#empDetailBalance')?.value) || 0;
    emp.shift = body.querySelector('#empDetailShift')?.value || emp.shift || 'morning';
    if (body.querySelector('#empShiftCustomToggle')?.checked) {
      emp.shiftStartMin = parseTime(body.querySelector('#empShiftCustomStart')?.value);
      emp.shiftEndMin = parseTime(body.querySelector('#empShiftCustomEnd')?.value);
    } else {
      delete emp.shiftStartMin;
      delete emp.shiftEndMin;
    }
    emp.is_active = !!body.querySelector('#empDetailActive')?.checked;
    emp.status = emp.is_active ? 'active' : 'resigned';
    emp.employmentPeriods = collectEmployeeManualPeriods(body);
    emp.notes = body.querySelector('#empDetailNotes')?.value || '';
    emp.updated_at = new Date().toISOString();
    saveData();
    return true;
  }, (body) => openEmployeeDetailsOnOpen(body, emp, canUpdate));
  if (result && canUpdate) {
    renderEmployeesTable();
    refreshCalcEmpDropdown();
    if (currentPage === 'calendar') renderAttendanceCalendar();
    if (currentPage === 'timesheet') renderTimesheet();
    showToast('تم حفظ تفاصيل الموظف', 'success');
  }
}

async function addEmployee() {
  const cfg = getConfig();
  const html = `
    <div class="employee-detail-modal">
      <div class="employee-detail-grid">
        <label>اسم الموظف<input id="newEmpName" class="form-input" placeholder="اسم الموظف"></label>
        <label>الراتب الاسمي<input id="newEmpSalary" type="number" class="form-input" value="${Number(cfg.nominalSalary || 0)}"></label>
        <label>الرصيد/السلفة السابقة<input id="newEmpBalance" type="number" class="form-input" value="0"></label>
        <label>الشفت<select id="newEmpShift" class="form-input">${buildEmployeeShiftOptions('morning')}</select></label>
        <label class="employee-detail-toggle"><input id="newEmpActive" type="checkbox" checked> يعمل حاليا</label>
        <label class="employee-detail-notes">ملاحظات<textarea id="newEmpNotes" class="form-input" rows="3"></textarea></label>
      </div>
      ${buildEmployeePeriodsPanel({ employmentPeriods: [{ startDate: todayISO(), note: 'بداية عمل', source: 'manual' }] }, true)}
      <p class="employee-detail-hint">هذه البيانات ستستخدم مباشرة في forecast تقويم الدوام.</p>
    </div>
  `;
  const payload = await showOmniModal('إضافة موظف', html, (body) => {
    const name = body.querySelector('#newEmpName')?.value.trim();
    if (!name) {
      showToast('اسم الموظف مطلوب', 'error');
      return false;
    }
    return {
      name,
      salary: Number(body.querySelector('#newEmpSalary')?.value) || 0,
      prevAdvance: Number(body.querySelector('#newEmpBalance')?.value) || 0,
      shift: body.querySelector('#newEmpShift')?.value || 'morning',
      employmentPeriods: collectEmployeeManualPeriods(body),
      is_active: !!body.querySelector('#newEmpActive')?.checked,
      notes: body.querySelector('#newEmpNotes')?.value || ''
    };
  });
  if (!payload) return;

  const totalDays = getDaysInMonth(cfg.year, cfg.month);
  const records = [];
  for (let d = 1; d <= totalDays; d++) {
    records.push({
      day: d,
      month: cfg.month,
      year: cfg.year,
      date: `${String(d).padStart(2, '0')}/${String(cfg.month).padStart(2, '0')}/${cfg.year}`,
      checkIn: '',
      checkOut: '',
      checkInMin: null,
      checkOutMin: null,
      hours: 0,
      status: isFriday(cfg.year, cfg.month, d) ? 'friday' : 'leave',
      advance: 0,
      penalty: 0,
      bonus: 0,
      damage: 0,
      notes: ''
    });
  }

  const data = { ...payload, status: payload.is_active ? 'active' : 'resigned', records };
  try {
    if (window.RecordService) {
      const newEmp = await RecordService.create('employees', data);
      employees.push(newEmp);
    } else {
      employees.push({ ...data, id: makeId('EMP') });
      saveData();
    }
    selectedEmpIdx = employees.length - 1;
    renderTimesheet();
    renderReportTabs();
    renderEmployeesTable();
    refreshCalcEmpDropdown();
    if (currentPage === 'calendar') renderAttendanceCalendar();
    showToast(`تمت إضافة الموظف: ${payload.name}`, 'success');
  } catch (e) {
    console.error(e);
    showToast(e.message || 'فشل إضافة الموظف', 'error');
  }
}

// T4.6 de-monolith: V6 Finance Workspace and Tab functions moved to modules/finance-ui.js




// AI // ─── WhatsApp Group Manager ───────────────────────────────────────────────────
function normalizeAiIntegrationData() {
  ensureOmni();
  if (!Array.isArray(omni.whatsappSuggestions)) omni.whatsappSuggestions = [];
  if (!Array.isArray(omni.whatsappIngestHistory)) omni.whatsappIngestHistory = [];
  if (!Array.isArray(omni.whatsappGroups)) omni.whatsappGroups = [
    { id: 'group_workshop', name: 'Workshop WhatsApp', type: 'workshop_general', emoji: '📡', members: [], active: true, createdAt: new Date().toISOString() }
  ];
  omni.whatsappSuggestions.forEach(item => {
    if (!item.id) item.id = makeId('wa');
    if (!item.createdAt) item.createdAt = new Date().toISOString();
    if (!item.status) item.status = 'pending';
    if (!Array.isArray(item.entityMatches)) item.entityMatches = [];
    if (!Array.isArray(item.attachmentPlaceholders)) item.attachmentPlaceholders = [];
  });
  omni.whatsappIngestHistory.forEach(batch => {
    if (!batch.id) batch.id = makeId('wa_batch');
    if (!batch.createdAt) batch.createdAt = new Date().toISOString();
    if (!batch.source) batch.source = 'unknown';
  });
  if (!Array.isArray(omni.intelligenceFindings)) omni.intelligenceFindings = [];
  if (!Array.isArray(omni.intelligenceScanHistory)) omni.intelligenceScanHistory = [];
  const defaultAiControl = {
    provider: { enabled: false, provider: 'openai', model: 'gpt-4.1-mini', mode: 'review_only', safetyLevel: 'strict', apiKeyLabel: '' },
    permissions: {
      payroll: 'forbidden',
      finance: 'forbidden',
      admin: 'forbidden',
      task_manager: 'approved_write',
      kanban: 'approval_required',
      inventory: 'approval_required',
      whatsapp: 'approval_required',
      automation: 'review_queue'
    },
    actionQueue: [],
    runHistory: [],
    contextMap: []
  };
  if (!omni.aiControl || typeof omni.aiControl !== 'object') omni.aiControl = {};
  omni.aiControl.provider = { ...defaultAiControl.provider, ...(omni.aiControl.provider || {}) };
  omni.aiControl.permissions = { ...defaultAiControl.permissions, ...(omni.aiControl.permissions || {}) };
  if (!Array.isArray(omni.aiControl.actionQueue)) omni.aiControl.actionQueue = [];
  if (!Array.isArray(omni.aiControl.runHistory)) omni.aiControl.runHistory = [];
  if (!Array.isArray(omni.aiControl.contextMap)) omni.aiControl.contextMap = [];
  omni.aiControl.actionQueue.forEach(item => {
    if (!item.id) item.id = makeId('aiprop');
    if (!item.status) item.status = 'pending';
    if (!item.createdAt) item.createdAt = new Date().toISOString();
  });
  omni.aiControl.runHistory.forEach(item => {
    if (!item.id) item.id = makeId('airun');
    if (!item.createdAt) item.createdAt = new Date().toISOString();
    if (!item.status) item.status = 'logged';
  });
  if (!omni.migrationsApplied.includes('ai_whatsapp_integration_defaults_v1')) omni.migrationsApplied.push('ai_whatsapp_integration_defaults_v1');
  return omni.aiControl;
}


// ───────── Telegram Connector — safe foundation (no token, draft/approval-only) ─────────
// Non-destructive defaults only. No real bot token is ever stored client-side or in
// database.json. Real sending requires a future server-side TELEGRAM_BOT_TOKEN plus
// explicit human approval. Omni may create drafts only; it cannot send.
function normalizeTelegramData() {
  ensureOmni();
  if (!omni.telegram || typeof omni.telegram !== 'object') omni.telegram = {};
  const tg = omni.telegram;
  const now = Date.now();
  const defaultConfig = {
    enabled: false,
    mode: 'demo',
    botUsername: '',
    tokenConfigured: false,
    webhookUrl: 'https://your-server.example.com/api/telegram/webhook',
    allowedChatIds: [],
    adminChatId: '',
    managerGroupId: '',
    employeeGroupId: '',
    projectGroupMap: {}
  };
  tg.config = { ...defaultConfig, ...(tg.config || {}) };
  // SAFETY: a real token must never live in the client data model.
  delete tg.config.botToken;
  delete tg.config.token;
  delete tg.config.apiKey;
  if (!Array.isArray(tg.chats) || !tg.chats.length) tg.chats = [
    { id: 'tg_chat_admin', title: 'Octagon Admin', type: 'private', linked: true, demo: true },
    { id: 'tg_chat_mgr', title: 'Managers Group', type: 'group', linked: true, demo: true },
    { id: 'tg_chat_ops', title: 'Operations Floor', type: 'group', linked: false, demo: true }
  ];
  if (!Array.isArray(tg.inbox) || !tg.inbox.length) tg.inbox = [
    { id: 'tg_in_1', sender: 'Ahmed — Workshop', chat: 'Operations Floor', text: 'الماكينة CNC-2 توقفت، نحتاج صيانة عاجلة', receivedAt: new Date(now - 1000 * 60 * 12).toISOString(), attachment: false, linkedType: 'fleet_fuel_anomaly', status: 'new' },
    { id: 'tg_in_2', sender: 'Sara — Reception', chat: 'Managers Group', text: 'العميل يطلب تأكيد حالة الطلب #1043', receivedAt: new Date(now - 1000 * 60 * 47).toISOString(), attachment: false, linkedType: 'order', status: 'new' },
    { id: 'tg_in_3', sender: 'Driver 7', chat: 'Operations Floor', text: 'صورة عداد الوقود بعد التعبئة', receivedAt: new Date(now - 1000 * 60 * 90).toISOString(), attachment: true, linkedType: 'fleet_fuel_anomaly', status: 'needs_approval' }
  ];
  if (!Array.isArray(tg.outboundQueue) || !tg.outboundQueue.length) tg.outboundQueue = [
    { id: 'tg_out_1', destination: 'Managers Group', preview: 'ملخص اليوم: 12 مهمة مكتملة، 3 موافقات معلقة، 1 تنبيه وقود', createdBy: 'jarvis', reason: 'daily_manager_summary', status: 'pending_approval', createdAt: new Date(now - 1000 * 60 * 5).toISOString() },
    { id: 'tg_out_2', destination: 'Ahmed — Workshop', preview: 'تم تعيين مهمة جديدة لك: فحص الماكينة CNC-2', createdBy: 'system', reason: 'task_assignment', status: 'draft', createdAt: new Date(now - 1000 * 60 * 20).toISOString() }
  ];
  if (!Array.isArray(tg.messageLinks)) tg.messageLinks = [];
  if (!Array.isArray(tg.automationRules) || !tg.automationRules.length) tg.automationRules = [
    { id: 'tg_rule_summary', icon: '🧾', title: 'ملخص يومي للمدير', desc: 'إرسال ملخص الأداء للمدير', wired: false },
    { id: 'tg_rule_task', icon: '✅', title: 'إشعار موظف بمهمة', desc: 'تنبيه الموظف عند إسناد مهمة', wired: false },
    { id: 'tg_rule_approval', icon: '🔐', title: 'طلب موافقة للمدير', desc: 'إرسال طلب موافقة لمدير', wired: false },
    { id: 'tg_rule_fuel', icon: '⛽', title: 'تنبيه وقود/مخزون', desc: 'تنبيه شذوذ الوقود أو نقص المخزون', wired: false },
    { id: 'tg_rule_fleet', icon: '🚚', title: 'تنبيه سرعة/جيوفنس', desc: 'تنبيه تجاوز السرعة أو الحدود الجغرافية', wired: false },
    { id: 'tg_rule_qc', icon: '🧪', title: 'تنبيه فشل جودة', desc: 'إشعار عند فشل فحص الجودة', wired: false },
    { id: 'tg_rule_order', icon: '📦', title: 'حالة طلب داخلياً', desc: 'مشاركة حالة الطلب داخلياً', wired: false },
    { id: 'tg_rule_to_task', icon: '🔁', title: 'تحويل رسالة إلى مهمة', desc: 'تحويل رسالة تلغرام إلى مهمة', wired: false },
    { id: 'tg_rule_attach', icon: '📎', title: 'تحويل ملف إلى مرفق', desc: 'حفظ صورة/ملف كمرفق (مبدئي)', wired: false }
  ];
  if (!Array.isArray(tg.activityLog)) tg.activityLog = [];
  if (!tg.status || typeof tg.status !== 'object') tg.status = {};
  tg.status.bot = tg.config.tokenConfigured ? (tg.config.enabled ? 'connected' : 'configured') : 'not_configured';
  if (!tg.status.lastSync) tg.status.lastSync = null;
  if (!tg.status.lastInbound) tg.status.lastInbound = tg.inbox[0] ? tg.inbox[0].receivedAt : null;
  if (!tg.status.lastOutbound) tg.status.lastOutbound = null;
  if (Array.isArray(omni.migrationsApplied) && !omni.migrationsApplied.includes('telegram_connector_defaults_v1')) {
    omni.migrationsApplied.push('telegram_connector_defaults_v1');
  }
  return tg;
}

function telegramCanApprove() {
  try {
    const user = (typeof PentagonAuth !== 'undefined' && PentagonAuth.getCurrentUser) ? PentagonAuth.getCurrentUser() : null;
    if (typeof PermissionService !== 'undefined' && PermissionService.checkPage) {
      return !!PermissionService.checkPage('telegram', user);
    }
  } catch (_) {}
  return true; // local/dev default-allow
}

function telegramTimeAgo(iso) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms)) return '—';
  const m = Math.round(ms / 60000);
  if (m < 1) return 'الآن';
  if (m < 60) return `قبل ${m} دقيقة`;
  const h = Math.round(m / 60);
  if (h < 24) return `قبل ${h} ساعة`;
  return new Date(iso).toLocaleDateString('ar');
}

function telegramConvertToTask(id) {
  normalizeTelegramData();
  const msg = (omni.telegram.inbox || []).find(m => m.id === id);
  if (!msg) return;
  msg.status = 'converted_to_task';
  omni.telegram.messageLinks.push({ id: makeId('tglink'), messageId: id, linkedType: 'task', draft: true, createdAt: new Date().toISOString() });
  omni.telegram.activityLog.unshift({ id: makeId('tglog'), at: new Date().toISOString(), action: 'draft_task_from_message', messageId: id, actor: 'user' });
  saveData();
  showToast('تم إنشاء مسودة مهمة من الرسالة (بدون إرسال أي رد).', 'success');
  renderTelegramIntegrationPage();
}

function telegramMarkReviewed(id) {
  normalizeTelegramData();
  const msg = (omni.telegram.inbox || []).find(m => m.id === id);
  if (!msg) return;
  msg.status = 'linked';
  omni.telegram.activityLog.unshift({ id: makeId('tglog'), at: new Date().toISOString(), action: 'mark_reviewed', messageId: id, actor: 'user' });
  saveData();
  showToast('تمت مراجعة الرسالة.', 'success');
  renderTelegramIntegrationPage();
}

function telegramIgnoreMessage(id) {
  normalizeTelegramData();
  const msg = (omni.telegram.inbox || []).find(m => m.id === id);
  if (!msg) return;
  msg.status = 'ignored';
  omni.telegram.activityLog.unshift({ id: makeId('tglog'), at: new Date().toISOString(), action: 'ignore_message', messageId: id, actor: 'user' });
  saveData();
  showToast('تم تجاهل الرسالة.', 'info');
  renderTelegramIntegrationPage();
}

function telegramApproveOutbound(id) {
  if (!telegramCanApprove()) return showToast('ليس لديك صلاحية الموافقة على رسائل تلغرام.', 'warning');
  normalizeTelegramData();
  const out = (omni.telegram.outboundQueue || []).find(o => o.id === id);
  if (!out) return;
  // Approve only — NEVER auto-send. Sending requires a configured server-side connector.
  out.status = 'approved';
  out.approvedAt = new Date().toISOString();
  omni.telegram.activityLog.unshift({ id: makeId('tglog'), at: new Date().toISOString(), action: 'approve_outbound', outboundId: id, actor: 'user' });
  saveData();
  showToast('تمت الموافقة على المسودة. لن تُرسل تلقائياً (لا يوجد توكن/إرسال مُفعّل).', 'success');
  renderTelegramIntegrationPage();
}

function telegramJarvisDraft() {
  normalizeTelegramData();
  omni.telegram.outboundQueue.unshift({
    id: makeId('tgout'), destination: 'Managers Group',
    preview: 'مسودة من Omni: ملخص تنبيهات اليوم (بانتظار موافقة بشرية).',
    createdBy: 'jarvis', reason: 'jarvis_draft', status: 'pending_approval', createdAt: new Date().toISOString()
  });
  omni.telegram.activityLog.unshift({ id: makeId('tglog'), at: new Date().toISOString(), action: 'jarvis_create_draft', actor: 'jarvis' });
  saveData();
  showToast('أنشأ Omni مسودة فقط. تحتاج موافقة بشرية قبل الإرسال.', 'info');
  renderTelegramIntegrationPage();
}

function renderTelegramIntegrationPage() {
  normalizeAiIntegrationData();
  const tg = normalizeTelegramData();
  const orgProfile = getActiveOrgProfile();
  const body = document.getElementById('telegramBody');
  if (!body) return;

  const cfg = tg.config;
  const botLabel = { not_configured: 'غير مهيأ', configured: 'مهيأ', connected: 'متصل', error: 'خطأ' }[tg.status.bot] || 'غير مهيأ';
  const modeLabel = { demo: 'تجريبي / يدوي', polling: 'Polling (مبدئي)', webhook: 'Webhook (مبدئي)' }[cfg.mode] || 'تجريبي / يدوي';
  const linkedChats = (tg.chats || []).filter(c => c.linked).length;
  const pendingApprovals = (tg.outboundQueue || []).filter(o => o.status === 'pending_approval').length;
  const failedMessages = (tg.outboundQueue || []).filter(o => o.status === 'failed').length;
  const lastInbound = (tg.inbox || [])[0];

  const linkedTypeLabel = { task: 'مهمة', customer: 'عميل', order: 'طلب', approval: 'موافقة', fleet_fuel_anomaly: 'شذوذ أسطول/وقود', none: '—' };
  const inboxStatusLabel = { new: 'جديدة', linked: 'مرتبطة', converted_to_task: 'حوّلت لمهمة', ignored: 'تجاهل', needs_approval: 'تحتاج موافقة' };
  const inboxStatusColor = { new: 'var(--accent-blue)', linked: 'var(--success)', converted_to_task: 'var(--success)', ignored: 'var(--text-muted)', needs_approval: 'var(--warning)' };
  const createdByLabel = { user: 'مستخدم', jarvis: 'Omni', system: 'تنبيه نظام' };
  const outStatusLabel = { draft: 'مسودة', pending_approval: 'بانتظار موافقة', approved: 'تمت الموافقة', sent: 'أُرسلت', failed: 'فشل' };
  const outStatusColor = { draft: 'var(--text-muted)', pending_approval: 'var(--warning)', approved: 'var(--success)', sent: '#0088cc', failed: 'var(--danger, #e5484d)' };

  const statusCard = (label, value, color) => `
    <div style="background:var(--surface-2,rgba(255,255,255,.03));border:1px solid var(--border);border-radius:12px;padding:12px 14px;border-inline-start:4px solid ${color};">
      <div style="font-size:11px;color:var(--text-muted);">${escapeHtml(label)}</div>
      <div style="font-weight:700;margin-top:4px;">${value}</div>
    </div>`;

  const inboxRows = (tg.inbox || []).map(m => `
    <tr>
      <td>${escapeHtml(m.sender)}</td>
      <td>${escapeHtml(m.chat)}</td>
      <td style="max-width:260px;">${escapeHtml(m.text)} ${m.attachment ? '<i class="fa-solid fa-paperclip" title="مرفق" style="color:var(--text-muted);"></i>' : ''}</td>
      <td style="white-space:nowrap;">${telegramTimeAgo(m.receivedAt)}</td>
      <td>${escapeHtml(linkedTypeLabel[m.linkedType] || '—')}</td>
      <td><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${inboxStatusColor[m.status] || 'var(--text-muted)'};color:#fff;">${escapeHtml(inboxStatusLabel[m.status] || m.status)}</span></td>
      <td style="white-space:nowrap;">
        <button class="btn-mini" onclick="telegramConvertToTask('${m.id}')" title="إنشاء مسودة مهمة">↳ مهمة</button>
        <button class="btn-mini" onclick="telegramMarkReviewed('${m.id}')" title="وضع علامة مراجعة">مراجعة</button>
        <button class="btn-mini" onclick="telegramIgnoreMessage('${m.id}')" title="تجاهل">تجاهل</button>
      </td>
    </tr>`).join('');

  const outboundRows = (tg.outboundQueue || []).map(o => {
    const canApprove = telegramCanApprove() && (o.status === 'draft' || o.status === 'pending_approval');
    return `
    <tr>
      <td>${escapeHtml(o.destination)}</td>
      <td style="max-width:280px;">${escapeHtml(o.preview)}</td>
      <td>${escapeHtml(createdByLabel[o.createdBy] || o.createdBy)}</td>
      <td>${escapeHtml(o.reason || '—')}</td>
      <td><span style="font-size:11px;padding:2px 8px;border-radius:10px;background:${outStatusColor[o.status] || 'var(--text-muted)'};color:#fff;">${escapeHtml(outStatusLabel[o.status] || o.status)}</span></td>
      <td>${canApprove ? `<button class="btn-mini" onclick="telegramApproveOutbound('${o.id}')" title="موافقة (بدون إرسال تلقائي)">موافقة</button>` : '<span style="color:var(--text-muted);font-size:11px;">—</span>'}</td>
    </tr>`;
  }).join('');

  const automationTiles = (tg.automationRules || []).map(r => `
    <div style="background:var(--surface-2,rgba(255,255,255,.03));border:1px solid var(--border);border-radius:12px;padding:14px;">
      <div style="font-size:22px;">${r.icon}</div>
      <div style="font-weight:700;margin-top:6px;">${escapeHtml(r.title)}</div>
      <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${escapeHtml(r.desc)}</div>
      <div style="margin-top:8px;"><span class="analytics-risk-badge" style="background:var(--text-muted);font-size:10px;">${r.wired ? 'مُفعّل' : 'تخطيط فقط'}</span></div>
    </div>`).join('');

  const jarvisCan = ['قراءة ملخصات صندوق تلغرام', 'تصنيف الرسائل الواردة', 'صياغة ردود كمسودة', 'صياغة إنشاء مهمة', 'صياغة إشعارات موافقة', 'تلخيص مجموعات تلغرام', 'كشف الرسائل العاجلة', 'شرح تنبيهات شذوذ الأسطول/الوقود', 'تجهيز موجز للمدير'];
  const jarvisCannot = ['إرسال رسائل تلغرام مباشرة', 'الموافقة على مسوداته الخاصة', 'حذف أدلة تلغرام', 'تعديل سجلات تلغرام', 'تجاوز الموافقة', 'كشف توكن البوت', 'مراسلة العملاء أو الموظفين بدون موافقة'];

  body.className = 'automation-shell';
  body.innerHTML = `
    <div class="automation-hero">
      <div>
        <h2><i class="fa-brands fa-telegram text-accent-blue"></i> Telegram Connector — تلغرام</h2>
        <p style="direction:rtl;">موصل بوت تلغرام للعمليات الداخلية: تنبيهات المدراء، إشعارات الموظفين، الموافقات، تحديثات المهام، وتنبيهات شذوذ الأسطول/الوقود — تحت إشراف Omni.</p>
      </div>
      <div class="automation-hero-actions">
        <button class="btn-secondary" onclick="switchPage('command_center')">مركز القيادة</button>
        <button class="btn-secondary" onclick="toggleAIChat()"><i class="fa-solid fa-robot"></i> افتح Omni</button>
      </div>
    </div>

    <div class="admin-active-company-strip telegram-company-context">
      <div class="admin-active-company-logo">${escapeHtml(orgProfile.logoEmoji || '✈️')}</div>
      <div><b>${escapeHtml(orgProfile.companyName || 'Octagon')}</b><small>${escapeHtml(orgProfile.phone || '')} — ${escapeHtml(orgProfile.address || '')}</small></div>
      <span style="margin-inline-start:auto;display:flex;align-items:center;gap:8px;">
        <i class="fa-brands fa-telegram" style="color:#0088cc;font-size:18px;"></i>
        <span style="font-size:11px;color:var(--text-muted);">واجهة Telegram — أساس آمن</span>
      </span>
    </div>

    <div class="analytics-risk-badge" style="background:var(--warning);color:#000;display:block;direction:rtl;text-align:right;padding:10px 14px;border-radius:10px;margin-bottom:14px;">
      ⚠️ لا تضع التوكن داخل المتصفح أو database.json. يجب أن يبقى Server-side فقط (مثل <code>TELEGRAM_BOT_TOKEN</code>).
    </div>

    <!-- 1. Connector Status -->
    <div class="automation-panel">
      <div class="automation-section-head"><h3>حالة موصل تلغرام</h3></div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px;">
        ${statusCard('حالة البوت', escapeHtml(botLabel), '#0088cc')}
        ${statusCard('الوضع', escapeHtml(modeLabel), 'var(--accent-blue)')}
        ${statusCard('آخر مزامنة', escapeHtml(telegramTimeAgo(tg.status.lastSync)), 'var(--text-muted)')}
        ${statusCard('آخر رسالة واردة', lastInbound ? escapeHtml(telegramTimeAgo(lastInbound.receivedAt)) : '—', 'var(--success)')}
        ${statusCard('آخر رسالة صادرة', escapeHtml(telegramTimeAgo(tg.status.lastOutbound)), '#0088cc')}
        ${statusCard('موافقات معلقة', `<span style="color:var(--warning);">${pendingApprovals}</span>`, 'var(--warning)')}
        ${statusCard('رسائل فاشلة', String(failedMessages), 'var(--danger,#e5484d)')}
        ${statusCard('محادثات/مجموعات مرتبطة', String(linkedChats), 'var(--success)')}
      </div>
    </div>

    <div class="automation-layout" style="grid-template-columns:minmax(0,1.25fr) minmax(300px,0.75fr);">
      <div>
        <!-- 2. Bot Setup Panel -->
        <div class="automation-panel">
          <div class="automation-section-head"><h3>إعداد البوت</h3></div>
          <p style="direction:rtl;color:var(--text-muted);">لا يُعرض التوكن أبداً. يُخزَّن فقط ميتاداتا آمنة. التوكن الحقيقي مستقبلاً Server-side عبر <code>TELEGRAM_BOT_TOKEN</code>.</p>
          <div style="display:grid;gap:10px;margin-top:12px;">
            <div class="field"><label>حالة التوكن</label><input value="${cfg.tokenConfigured ? 'مهيأ ✓' : 'غير مهيأ (لا يوجد توكن)'}" readonly></div>
            <div class="field"><label>اسم مستخدم البوت</label><input value="${escapeHtml(cfg.botUsername || '—')}" readonly></div>
            <div class="field"><label>معاينة Webhook URL</label><input value="${escapeHtml(cfg.webhookUrl)}" readonly></div>
            <div class="field"><label>وضع Polling (مبدئي)</label><input value="${cfg.mode === 'polling' ? 'مفعّل (placeholder)' : 'غير مفعّل'}" readonly></div>
            <div class="field"><label>Allowed Chat IDs</label><input value="${escapeHtml((cfg.allowedChatIds || []).join(', ') || '—')}" readonly></div>
            <div class="field"><label>Admin Chat ID</label><input value="${escapeHtml(cfg.adminChatId || '—')}" readonly></div>
            <div class="field"><label>Manager Group ID</label><input value="${escapeHtml(cfg.managerGroupId || '—')}" readonly></div>
            <div class="field"><label>Employee Group ID</label><input value="${escapeHtml(cfg.employeeGroupId || '—')}" readonly></div>
            <div class="field"><label>Project Group Mapping</label><input value="placeholder — يُضبط لاحقاً Server-side" readonly></div>
          </div>
        </div>

        <!-- 3. Message Inbox -->
        <div class="automation-panel">
          <div class="automation-section-head"><h3>صندوق الرسائل (عرض آمن)</h3></div>
          <p style="direction:rtl;color:var(--text-muted);font-size:12px;">عرض تجريبي آمن. لا تُرسل أي ردود حقيقية ما لم يُهيّأ الموصل لاحقاً صراحةً.</p>
          <div style="overflow:auto;">
            <table class="data-table" style="width:100%;font-size:13px;">
              <thead><tr><th>المرسل</th><th>المحادثة</th><th>النص</th><th>وقت الاستلام</th><th>الكيان المرتبط</th><th>الحالة</th><th>إجراءات</th></tr></thead>
              <tbody>${inboxRows || '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">لا رسائل</td></tr>'}</tbody>
            </table>
          </div>
        </div>

        <!-- 4. Outbound Queue -->
        <div class="automation-panel">
          <div class="automation-section-head"><h3>قائمة الإرسال (بانتظار موافقة بشرية)</h3>
            <button class="btn-secondary btn-mini" onclick="telegramJarvisDraft()" title="Omni ينشئ مسودة فقط"><i class="fa-solid fa-robot"></i> مسودة Omni</button>
          </div>
          <p style="direction:rtl;color:var(--text-muted);font-size:12px;">Omni ينشئ مسودات فقط. الموافقة لا تُرسل تلقائياً — الإرسال الفعلي يحتاج موصل Server-side مُهيّأ.</p>
          <div style="overflow:auto;">
            <table class="data-table" style="width:100%;font-size:13px;">
              <thead><tr><th>الوجهة</th><th>معاينة الرسالة</th><th>أنشأها</th><th>السبب</th><th>الحالة</th><th>إجراء</th></tr></thead>
              <tbody>${outboundRows || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">لا مسودات</td></tr>'}</tbody>
            </table>
          </div>
        </div>
      </div>

      <aside>
        <!-- 6. Omni + Telegram -->
        <div class="automation-panel">
          <div class="automation-section-head"><h3>أومني + تلغرام</h3></div>
          <div class="analytics-risk-badge" style="background:var(--warning);color:#000;display:block;direction:rtl;text-align:right;padding:8px 12px;border-radius:8px;margin-bottom:10px;">
            🤖 أومني يجهز ويقترح فقط. الإرسال يحتاج موافقة بشرية.
          </div>
          <div style="direction:rtl;text-align:right;font-size:13px;">
            <b style="color:var(--success);">يستطيع Omni:</b>
            <ul style="line-height:1.7;margin:6px 0 12px;">${jarvisCan.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
            <b style="color:var(--danger,#e5484d);">لا يستطيع Omni:</b>
            <ul style="line-height:1.7;margin:6px 0;">${jarvisCannot.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul>
          </div>
          <div class="insp-actions" style="justify-content:flex-start;gap:10px;margin-top:10px;">
            <button class="btn-primary" onclick="toggleAIChat()"><i class="fa-solid fa-robot"></i> افتح Omni</button>
          </div>
        </div>

        <!-- 5. Alerts / Automation Use Cases -->
        <div class="automation-panel">
          <div class="automation-section-head"><h3>حالات الأتمتة والتنبيهات</h3></div>
          <p style="direction:rtl;color:var(--text-muted);font-size:12px;">إجراءات تخطيط/واجهة فقط ما لم تُربط بأمان لاحقاً.</p>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;">${automationTiles}</div>
        </div>
      </aside>
    </div>
  `;
}


// getOctagonPageTruthRegistry() moved to modules/data-providers.js (GO 16 de-monolith Phase 1)

function buildOctagonRouteHealth() {
  const registry = (typeof getOctagonPageTruthRegistry === 'function')
    ? getOctagonPageTruthRegistry()
    : getPentagonPageTruthRegistry();
  const rows = registry.map(item => {
    const navOk = !!document.getElementById(item.navId);
    const pageOk = !!document.getElementById(item.pageId);
    const renderOk = item.staticPage ? true : Boolean(item.renderOk?.());
    const ok = navOk && pageOk && renderOk;
    return { ...item, navOk, pageOk, renderOk, ok };
  });
  return {
    rows,
    total: rows.length,
    okCount: rows.filter(row => row.ok).length,
    issueCount: rows.filter(row => !row.ok).length
  };
}

const buildPentagonRouteHealth = buildOctagonRouteHealth;

// getOdooPlusGapRegistry() moved to modules/data-providers.js (GO 16 de-monolith Phase 1)

function renderOctagonRouteHealthPanel() {
  const health = buildOctagonRouteHealth();
  return `<div class="automation-panel" style="margin-top:20px;">
    <div class="automation-section-head"><h3>فحص صحة المسارات والصفحات</h3><span>${health.okCount}/${health.total} جاهزة</span></div>
    <div class="analytics-table-wrap"><table class="analytics-mini-table">
      <thead><tr><th>الصفحة</th><th>القسم</th><th>الناف</th><th>الصفحة</th><th>المُصيِّر</th><th>الحالة</th></tr></thead>
      <tbody>${health.rows.map(row => `<tr>
        <td><button class="btn-secondary" style="padding:3px 8px;font-size:11px" onclick="switchPage('${row.page}')">${escapeHtml(row.label)}</button></td>
        <td>${escapeHtml(row.section)}</td>
        <td><span class="analytics-risk-badge" style="background:${row.navOk ? '#34d399' : '#f87171'}">${row.navOk ? '✓' : 'مفقود'}</span></td>
        <td><span class="analytics-risk-badge" style="background:${row.pageOk ? '#34d399' : '#f87171'}">${row.pageOk ? '✓' : 'مفقود'}</span></td>
        <td><span class="analytics-risk-badge" style="background:${row.renderOk ? '#34d399' : '#f87171'}">${row.renderOk ? (row.staticPage ? 'ثابت' : '✓') : 'مفقود'}</span></td>
        <td><b style="color:${row.ok ? '#34d399' : '#f87171'}">${row.ok ? 'جاهز' : 'يحتاج إصلاح'}</b></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

const renderPentagonRouteHealthPanel = renderOctagonRouteHealthPanel;

function renderOdooPlusGapRegistry() {
  const rows = getOdooPlusGapRegistry();
  const avg = Math.round(rows.reduce((sum, row) => sum + row.percent, 0) / Math.max(1, rows.length));
  const critical = rows.filter(row => row.priority === 'Critical').length;
  return `<div class="automation-panel" style="margin-top:20px;">
    <div class="automation-section-head"><h3>سجل الفجوات مقابل أودو</h3><span>متوسط ${avg}% · ${critical} حرجة</span></div>
    <div class="analytics-table-wrap"><table class="analytics-mini-table">
      <thead><tr><th>المجال</th><th>أساس أودو</th><th>أوكتاغون الحالي</th><th>الجاهزية</th><th>الفجوة الرئيسية</th><th>الصفحة</th></tr></thead>
      <tbody>${rows.map(row => `<tr>
        <td><b>${escapeHtml(row.area)}</b><br><span class="analytics-risk-badge" style="background:${row.priority === 'Critical' ? '#f87171' : row.priority === 'High' ? '#fbbf24' : '#38bdf8'}">${row.priority === 'Critical' ? 'حرج' : row.priority === 'High' ? 'عالي' : 'متوسط'}</span></td>
        <td>${escapeHtml(row.odoo)}</td>
        <td>${escapeHtml(row.current)}</td>
        <td><span class="analytics-completion-meter"><i style="width:${row.percent}%"></i></span><b>${row.percent}%</b></td>
        <td>${escapeHtml(row.gap)}</td>
        <td><button class="btn-secondary" style="padding:3px 8px;font-size:11px" onclick="switchPage('${row.page}')">فتح</button></td>
      </tr>`).join('')}</tbody>
    </table></div>
  </div>`;
}

function getAiDashboardStats() {
  normalizeAiIntegrationData();
  const tasks = typeof getAllTaskManagerTasks === 'function' ? getAllTaskManagerTasks(true).map(x => x.task) : [];
  const kanbanCards = omni.kanban?.cards || [];
  const materials = omni.materials || [];
  const machines = omni.machines || [];
  const qcRecords = omni.qcRecords || [];
  const sops = omni.sops || [];
  const whatsapp = omni.whatsappSuggestions || [];
  const findings = omni.intelligenceFindings || [];
  const rules = omni.automationRules || [];
  const fireLog = omni.automationFireLog || [];
  const payrollRows = Array.isArray(employees) ? employees.length : 0;
  const financeRows = Array.isArray(finance?.transactions) ? finance.transactions.length : 0;
  const inputSources = [
    { key: 'payroll', label: 'الرواتب والموارد البشرية', count: payrollRows, read: true, write: false, note: 'قراءة عالية الحساسية؛ الكتابة تبقى يدوية أو عبر طلبات موافقة.' },
    { key: 'finance', label: 'المالية', count: financeRows, read: true, write: false, note: 'قراءة وتحليل فقط حالياً؛ أي قيد مالي مباشر يحتاج موافقة ونسخ احتياطي أولاً.' },
    { key: 'tasks', label: 'إدارة المهام', count: tasks.length, read: true, write: true, note: 'يمكن إنشاء مهام متابعة آمنة من الذكاء الاصطناعي أو رسائل العملاء.' },
    { key: 'kanban', label: 'اللوحة التنفيذية', count: kanbanCards.length, read: true, write: 'limited', note: 'الأتمتة تستطيع التصعيد ووضع وسوم؛ إنشاء بطاقات ذكاء شامل غير مكتمل.' },
    { key: 'inventory', label: 'المخزون', count: materials.length, read: true, write: 'limited', note: 'الأتمتة تقرأ المخزون وتصدر تنبيهات؛ الشراء/الصرف يحتاج مسار موافقة.' },
    { key: 'machines', label: 'المكائن', count: machines.length, read: true, write: false, note: 'جاهز للقراءة والتوصية؛ لا يوجد تحكم مباشر بالمكائن.' },
    { key: 'qc', label: 'الجودة', count: qcRecords.length, read: true, write: 'limited', note: 'فشل الجودة يطلق أتمتة؛ قرارات إعادة العمل تبقى واضحة للمستخدم.' },
    { key: 'sop', label: 'الإجراءات', count: sops.length, read: true, write: false, note: 'قاعدة معرفة ممتازة، لكن لا يوجد توليد/تعديل إجراء آلي مع اعتماد.' },
    { key: 'whatsapp', label: 'واتساب', count: whatsapp.length, read: true, write: 'review', note: 'استيراد واقتراحات بمراجعة؛ ليس تكاملاً مباشراً مع واجهة برمجة واتساب.' }
  ];
  const gaps = [
    { page: 'intelligence', title: 'لوحة الذكاء محلية/حتمية، ليست نموذجاً حياً بعد', severity: 'critical' },
    { page: 'whatsapp', title: 'تكامل واتساب للمراجعة فقط، وليس تكاملاً ثنائي الاتجاه', severity: 'critical' },
    { page: 'automation', title: 'قواعد الأتمتة تستجيب لأحداث محددة فقط؛ لا يوجد محرك سياسة ذكاء شامل', severity: 'high' },
    { page: 'finance', title: 'كتابة الذكاء على المالية محظورة حتى توفر مسار الموافقة والنسخ الاحتياطي', severity: 'high' },
    { page: 'admin_panel', title: 'إعدادات الإدارة غير مرتبطة بالكامل بجميع الوحدات بعد', severity: 'high' },
    { page: 'sop', title: 'مكتبة الإجراءات تحتاج قرار الإغلاق البصري والرفع', severity: 'medium' }
  ];
  return {
    tasks,
    whatsapp,
    findings,
    rules,
    fireLog,
    inputSources,
    gaps,
    coveragePercent: Math.round(inputSources.filter(x => x.read).length / inputSources.length * 100),
    safeWritePercent: Math.round(inputSources.filter(x => x.write === true || x.write === 'limited' || x.write === 'review').length / inputSources.length * 100),
    activeRules: rules.filter(r => r.active).length,
    pendingWhatsapp: whatsapp.filter(s => s.status === 'pending').length,
    openFindings: findings.filter(f => !['resolved', 'closed', 'dismissed'].includes(String(f.status || '').toLowerCase())).length
  };
}

function getHrPayrollAiReviewData() {
  normalizeAiIntegrationData();
  const cfg = typeof getConfig === 'function' ? getConfig() : { year: new Date().getFullYear(), month: new Date().getMonth() + 1, cfgTransport: 50000, cfgFood: 50000 };
  const employeeRows = Array.isArray(employees) ? employees : [];
  const summaries = employeeRows.map((emp, index) => {
    const summary = typeof getEmployeeMonthlyPayrollSummary === 'function'
      ? getEmployeeMonthlyPayrollSummary(emp, cfg)
      : null;
    const records = summary?.records || recordsForMonth(emp, cfg.year, cfg.month);
    return {
      emp,
      index,
      name: emp?.name || `موظف ${index + 1}`,
      records,
      summary,
      result: summary?.result || null,
      attendanceDays: Number(summary?.result?.attendanceDays || 0),
      absentDays: Number(summary?.result?.absentDays || 0),
      leaveDays: Number(summary?.result?.leaveDays || 0),
      lateHours: Number(summary?.lateHours || summary?.result?.totalLatenessHours || 0),
      overtimeHours: Number(summary?.overtimeHours || summary?.result?.totalOvertime || 0),
      advances: Number(summary?.advances || summary?.result?.totalAdvance || 0),
      finalNet: Number(summary?.finalNet || summary?.result?.finalSalary || 0),
      nominalSalary: Number(summary?.nominalSalary || getEmployeeNominalSalary(emp) || 0)
    };
  }).filter(row => row.records.length > 0);
  const medianAttendance = (() => {
    const values = summaries.map(row => row.attendanceDays).filter(v => v > 0).sort((a, b) => a - b);
    if (!values.length) return 0;
    return values[Math.floor(values.length / 2)];
  })();
  const payrollCards = [];
  summaries.forEach(row => {
    const netRatio = row.nominalSalary > 0 ? row.finalNet / row.nominalSalary : 1;
    if (row.nominalSalary > 0 && (netRatio < 0.35 || netRatio > 1.35)) {
      payrollCards.push({
        id: `payroll_net_${row.index}`,
        type: 'payroll_anomaly',
        severity: netRatio < 0.15 || netRatio > 1.65 ? 'critical' : 'high',
        employeeName: row.name,
        title: 'تذبذب صافي الراتب',
        detail: `صافي هذا الشهر ${formatNum(row.finalNet)} د.ع مقابل راتب اسمي ${formatNum(row.nominalSalary)} د.ع.`,
        recommendation: 'مراجعة السلف والجزاءات وساعات العمل قبل اعتماد كشف الراتب.',
        sourceId: String(row.index)
      });
    }
    if (medianAttendance && row.attendanceDays < Math.max(4, Math.floor(medianAttendance * 0.45)) && row.overtimeHours > 0.25) {
      payrollCards.push({
        id: `payroll_overtime_${row.index}`,
        type: 'timesheet_consistency',
        severity: 'high',
        employeeName: row.name,
        title: 'أوفر تايم مع حضور منخفض',
        detail: `${row.attendanceDays} أيام حضور مقابل متوسط فريق ${medianAttendance}، مع ${row.overtimeHours.toFixed(1)} ساعة إضافية.`,
        recommendation: 'افتح التايم شيت وتحقق من البصمات قبل أي تعديل.',
        sourceId: String(row.index)
      });
    }
    if (row.absentDays >= 6 || row.leaveDays >= 6 || row.lateHours >= 6) {
      payrollCards.push({
        id: `payroll_attendance_${row.index}`,
        type: 'timesheet_consistency',
        severity: row.absentDays >= 10 || row.lateHours >= 10 ? 'high' : 'medium',
        employeeName: row.name,
        title: 'نمط دوام يحتاج مراجعة',
        detail: `${row.absentDays} غياب، ${row.leaveDays} إجازة، ${row.lateHours.toFixed(1)} ساعة تأخير.`,
        recommendation: 'حوّلها لمهمة تدقيق بدلاً من تعديل الراتب مباشرة.',
        sourceId: String(row.index)
      });
    }
    if (row.advances > row.nominalSalary * 0.5 && row.nominalSalary > 0) {
      payrollCards.push({
        id: `payroll_advance_${row.index}`,
        type: 'employee_request',
        severity: 'medium',
        employeeName: row.name,
        title: 'سلف عالية قياساً بالراتب',
        detail: `السلف الحالية ${formatNum(row.advances)} د.ع من راتب اسمي ${formatNum(row.nominalSalary)} د.ع.`,
        recommendation: 'اطلب مراجعة مدير قبل اعتماد الاستقطاع النهائي.',
        sourceId: String(row.index)
      });
    }
  });
  const requestCards = (omni.requests || [])
    .filter(req => ['leave', 'advance', 'attendance_correction', 'salary_advance'].includes(req.type) || req.sourceType === 'employee_request')
    .filter(req => req.status === 'pending')
    .slice(0, 8)
    .map(req => ({
      id: `request_${req.id}`,
      type: 'employee_request',
      severity: req.priority === 'urgent' ? 'critical' : req.priority === 'high' ? 'high' : 'medium',
      employeeName: req.requesterName || req.payload?.employeeName || 'غير محدد',
      title: req.title || 'طلب موظف ينتظر الموافقة',
      detail: req.description || `نوع الطلب: ${req.type}`,
      recommendation: req.routedSupervisorName ? `موجه إلى ${req.routedSupervisorName}.` : 'يحتاج توجيه أو قرار مدير.',
      sourceId: req.id
    }));
  const cards = [...payrollCards, ...requestCards].slice(0, 12);
  return {
    cfg,
    summaries,
    cards,
    payrollCards,
    requestCards,
    medianAttendance,
    employeeCount: employeeRows.length,
    reviewedEmployeeCount: summaries.length,
    criticalCount: cards.filter(card => card.severity === 'critical').length,
    highCount: cards.filter(card => card.severity === 'high').length
  };
}

function getHrPayrollAiCardById(cardId) {
  return getHrPayrollAiReviewData().cards.find(card => card.id === cardId) || null;
}

function getHrPayrollAiSeverityBadge(severity) {
  const map = {
    critical: { label: 'حرج', color: '#ef4444' },
    high: { label: 'عال', color: '#f97316' },
    medium: { label: 'متوسط', color: '#fbbf24' },
    low: { label: 'منخفض', color: '#34d399' }
  };
  return map[severity] || map.medium;
}

function renderHrPayrollAiReviewPanel() {
  const review = getHrPayrollAiReviewData();
  const monthLabel = `${review.cfg.month || '-'} / ${review.cfg.year || '-'}`;
  return `<div class="automation-panel hr-ai-review-panel">
    <div class="automation-section-head">
      <h3>مراجعة الذكاء للرواتب والموارد البشرية</h3>
      <span>قراءة فقط · ${monthLabel}</span>
    </div>
    <div class="hr-ai-kpis">
      <div><span>موظفون ضمن المراجعة</span><b>${review.reviewedEmployeeCount}/${review.employeeCount}</b></div>
      <div><span>بطاقات كشف</span><b>${review.cards.length}</b></div>
      <div><span>حرج / عال</span><b>${review.criticalCount} / ${review.highCount}</b></div>
      <div><span>سياسة الرواتب</span><b>قراءة فقط</b></div>
    </div>
    <div class="hr-ai-review-grid">
      ${review.cards.map(card => {
        const badge = getHrPayrollAiSeverityBadge(card.severity);
        return `<div class="hr-ai-review-card hr-ai-${escapeHtml(card.severity)}">
          <div class="hr-ai-card-head">
            <div><b>${escapeHtml(card.title)}</b><small>${escapeHtml(card.employeeName)} · ${escapeHtml(translateHrCardType(card.type))}</small></div>
            <span class="analytics-risk-badge" style="background:${badge.color}">${badge.label}</span>
          </div>
          <p>${escapeHtml(card.detail)}</p>
          <small>${escapeHtml(card.recommendation)}</small>
          <div class="hr-ai-card-actions">
            <button class="btn-secondary" onclick="switchPage('timesheet')"><i class="fa-solid fa-calendar-check"></i> فتح التايم شيت</button>
            <button class="btn-primary" onclick="createHrPayrollAiProposal('${card.id}')"><i class="fa-solid fa-shield-halved"></i> اقتراح مراجعة</button>
          </div>
        </div>`;
      }).join('') || '<div class="omni-notification-empty">لا توجد إشارات رواتب أو موارد بشرية خطرة لهذا الشهر. التحليل بقي قراءة فقط.</div>'}
    </div>
    <p class="muted" style="margin:12px 0 0;">هذه الطبقة لا تعدل الراتب أو البصمة. أي تصحيح يتحول إلى طابور موافقة أو مهمة مراجعة فقط.</p>
  </div>`;
}

function createHrPayrollAiProposal(cardId) {
  const card = getHrPayrollAiCardById(cardId);
  if (!card) return showToast('بطاقة مراجعة الرواتب غير موجودة.', 'warning');
  const ai = getAiControl();
  const existing = ai.actionQueue.find(item => item.status === 'pending' && item.sourceType === 'hr_payroll_ai_review' && item.sourceId === card.id);
  if (existing) {
    showToast('هذه المراجعة موجودة مسبقاً في طابور موافقات AI.', 'info');
    renderAiControlDashboard();
    return;
  }
  const aiCtx = getAiCurrentUserContext();
  ai.actionQueue.unshift({
    id: makeId('aiprop'),
    actionId: 'hr_payroll_review_proposal',
    title: `مراجعة رواتب: ${card.employeeName}`,
    target: 'payroll',
    mode: 'approval_required',
    risk: card.severity === 'critical' ? 'critical' : card.severity === 'high' ? 'high' : 'medium',
    status: 'pending',
    summary: `${card.title}: ${card.detail} ${card.recommendation}`,
    affectedRecords: 1,
    sourceType: 'hr_payroll_ai_review',
    sourceId: card.id,
    requestedBy: aiCtx.name,
    requestedById: aiCtx.id,
    requestedByRole: aiCtx.role,
    payload: { ...card, userId: aiCtx.id, userName: aiCtx.name, userRole: aiCtx.role, source: 'hr_payroll_ai_review' },
    createdAt: new Date().toISOString()
  });
  addAiRunHistory({
    actionId: 'hr_payroll_review_proposal',
    title: `مراجعة رواتب مُدرجة: ${card.employeeName}`,
    status: 'queued',
    note: 'Read-only payroll finding was routed to AI approval queue. No payroll write was performed.'
  });
  saveData();
  showToast('تم تحويل ملاحظة الرواتب إلى طابور موافقة بدون تعديل أي راتب.', 'success');
  renderAiControlDashboard();
}

function getAiCurrentUserContext() {
  const user = window.PentagonAuth?.getCurrentUser?.() || {};
  let groups = [];
  try {
    groups = window.PermissionService?.resolveGroups?.(user) || user.groups || [];
  } catch (_) {
    groups = user.groups || [];
  }
  return {
    id: user.id || 'system',
    name: user.name || user.displayName || user.id || 'system',
    role: Array.isArray(groups) && groups.length ? groups.join(',') : (user.role || user.roleId || 'unmapped')
  };
}

function getAiControl() {
  normalizeAiIntegrationData();
  return omni.aiControl;
}

function getAiActionRegistry() {
  return [
    { id: 'read_payroll_summary', label: 'قراءة ملخص الرواتب والحضور', target: 'payroll', risk: 'high', mode: 'read_only', output: 'history', description: 'تحليل بدون تعديل أي راتب أو دوام.' },
    { id: 'hr_payroll_review_proposal', label: 'اقتراح مراجعة رواتب وموارد بشرية', target: 'payroll', risk: 'high', mode: 'approval_required', output: 'command_center_request', description: 'يحوّل ملاحظة رواتب/دوام إلى طلب مراجعة، ولا يغير أي راتب.' },
    { id: 'analyze_finance_risk', label: 'تحليل مخاطر مالية', target: 'finance', risk: 'high', mode: 'read_only', output: 'history', description: 'قراءة وتحليل فقط؛ لا ينشئ قيوداً أو سندات.' },
    { id: 'create_task_followup', label: 'إنشاء مهمة متابعة آمنة', target: 'task_manager', risk: 'low', mode: 'approved_write', output: 'task_manager', description: 'بعد الموافقة ينشئ مهمة واضحة في مدير المهام.' },
    { id: 'propose_kanban_card', label: 'اقتراح بطاقة اللوحة', target: 'kanban', risk: 'medium', mode: 'approval_required', output: 'command_center_request', description: 'ينشئ طلب مراجعة ولا يغير اللوحة مباشرة.' },
    { id: 'propose_inventory_purchase', label: 'اقتراح شراء مخزون', target: 'inventory', risk: 'medium', mode: 'approval_required', output: 'command_center_request', description: 'ينشئ طلب شراء/مراجعة دون صرف أو شراء مباشر.' },
    { id: 'propose_whatsapp_reply', label: 'اقتراح رد للعميل', target: 'whatsapp', risk: 'medium', mode: 'approval_required', output: 'command_center_request', description: 'يحضر مسودة رد للمراجعة فقط.' },
    { id: 'direct_payroll_edit', label: 'تعديل راتب مباشر', target: 'payroll', risk: 'critical', mode: 'forbidden', output: 'blocked', description: 'محظور بالكامل في هذه المرحلة.' },
    { id: 'direct_journal_entry', label: 'قيد مالي مباشر', target: 'finance', risk: 'critical', mode: 'forbidden', output: 'blocked', description: 'محظور بالكامل حتى اكتمال مسار النسخ الاحتياطي والموافقات.' },
    { id: 'admin_settings_change', label: 'تغيير إعدادات النظام', target: 'admin', risk: 'critical', mode: 'forbidden', output: 'blocked', description: 'محظور لمنع تغيير الصلاحيات أو الشركات آلياً.' }
  ];
}

function getAiContextMap() {
  const ai = getAiControl();
  const defaults = [
    { module: 'الرواتب والموارد البشرية', key: 'payroll', records: Array.isArray(employees) ? employees.length : 0, readable: true, sensitive: 'الرواتب، الحضور، السلف، هوية الموظف', writePolicy: ai.permissions.payroll, owner: 'الرواتب' },
    { module: 'المالية', key: 'finance', records: Array.isArray(finance?.transactions) ? finance.transactions.length : 0, readable: true, sensitive: 'الحركات النقدية، الدفاتر، الإيصالات، أرصدة العملاء', writePolicy: ai.permissions.finance, owner: 'المالية' },
    { module: 'إدارة المهام', key: 'task_manager', records: typeof getAllTaskManagerTasks === 'function' ? getAllTaskManagerTasks(true).length : 0, readable: true, sensitive: 'المسؤولون، تواريخ الاستحقاق، المعوقات التشغيلية', writePolicy: ai.permissions.task_manager, owner: 'العمليات' },
    { module: 'اللوحة التنفيذية', key: 'kanban', records: omni.kanban?.cards?.length || 0, readable: true, sensitive: 'طلبات العملاء، الأولويات، الحالة الداخلية', writePolicy: ai.permissions.kanban, owner: 'العمليات' },
    { module: 'المخزون', key: 'inventory', records: omni.materials?.length || 0, readable: true, sensitive: 'أسماء الموردين، التكلفة، نقص المخزون', writePolicy: ai.permissions.inventory, owner: 'المخزون' },
    { module: 'واتساب', key: 'whatsapp', records: omni.whatsappSuggestions?.length || 0, readable: true, sensitive: 'رسائل الهاتف، نصوص العملاء والموظفين، طلبات الدفع', writePolicy: ai.permissions.whatsapp, owner: 'الاستقبال' },
    { module: 'الإعدادات والصلاحيات', key: 'admin', records: (omni.users?.length || 0) + (omni.companies?.length || 0), readable: false, sensitive: 'المستخدمون، الصلاحيات، الشركات، النسخ الاحتياطية', writePolicy: ai.permissions.admin, owner: 'النظام' }
  ];
  return defaults.map(row => ({ ...row, ...(ai.contextMap.find(saved => saved.key === row.key) || {}) }));
}

function getAiPolicyBadge(mode) {
  const map = {
    read_only: { label: 'قراءة فقط', color: '#38bdf8' },
    approved_write: { label: 'كتابة بعد موافقة', color: '#34d399' },
    approval_required: { label: 'طلب موافقة', color: '#fbbf24' },
    review_queue: { label: 'طابور مراجعة', color: '#a78bfa' },
    forbidden: { label: 'محظور', color: '#f87171' }
  };
  return map[mode] || { label: mode || 'غير محدد', color: '#94a3b8' };
}

function getAiRiskColor(risk) {
  return risk === 'critical' ? '#ef4444' : risk === 'high' ? '#f97316' : risk === 'medium' ? '#fbbf24' : '#34d399';
}
function translateAiRisk(r) {
  return ({critical:'حرج',high:'عالي',medium:'متوسط',low:'منخفض'})[r] || r;
}
function translateAiTarget(t) {
  return ({payroll:'الرواتب',finance:'المالية',task_manager:'المهام',kanban:'اللوحة',inventory:'المخزون',whatsapp:'واتساب',admin:'الإدارة',command_center_request:'طلب مركز القيادة',blocked:'محظور',history:'سجل'})[t] || t;
}

function renderAiProviderSettingsPanel() {
  const provider = getAiControl().provider;
  return `<div class="automation-panel">
    <div class="automation-section-head"><h3>إعدادات المزوّد والوضع</h3><span>${provider.enabled ? 'مفعّل' : 'معطّل'}</span></div>
    <div class="automation-rule-grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
      <label class="field"><span>المزوّد</span><select id="aiProviderName"><option value="openai" ${provider.provider === 'openai' ? 'selected' : ''}>OpenAI</option><option value="local" ${provider.provider === 'local' ? 'selected' : ''}>محلي / خاص</option><option value="manual" ${provider.provider === 'manual' ? 'selected' : ''}>مراجعة يدوية</option></select></label>
      <label class="field"><span>النموذج</span><input id="aiProviderModel" value="${escapeHtml(provider.model || '')}" placeholder="gpt-4.1-mini"></label>
      <label class="field"><span>الوضع</span><select id="aiProviderMode"><option value="review_only" ${provider.mode === 'review_only' ? 'selected' : ''}>مراجعة فقط</option><option value="assisted" ${provider.mode === 'assisted' ? 'selected' : ''}>مساعدة</option><option value="autopilot_locked" ${provider.mode === 'autopilot_locked' ? 'selected' : ''}>طيار آلي مقفّل</option></select></label>
      <label class="field"><span>الأمان</span><select id="aiSafetyLevel"><option value="strict" ${provider.safetyLevel === 'strict' ? 'selected' : ''}>صارم</option><option value="balanced" ${provider.safetyLevel === 'balanced' ? 'selected' : ''}>متوازن</option><option value="experimental" ${provider.safetyLevel === 'experimental' ? 'selected' : ''}>تجريبي</option></select></label>
      <label class="field"><span>تسمية مفتاح API</span><input id="aiApiKeyLabel" value="${escapeHtml(provider.apiKeyLabel || '')}" placeholder="لا يُخزَّن هنا"></label>
      <label class="field"><span>الحالة</span><select id="aiProviderEnabled"><option value="false" ${!provider.enabled ? 'selected' : ''}>معطّل</option><option value="true" ${provider.enabled ? 'selected' : ''}>مفعّل</option></select></label>
    </div>
    <div class="automation-rule-foot" style="justify-content:flex-end;margin-top:12px;"><button class="btn-primary" onclick="saveAiProviderSettingsFromForm()"><i class="fa-solid fa-floppy-disk"></i> حفظ إعدادات الذكاء</button></div>
    <p class="muted" style="margin:10px 0 0;">مفاتيح API الحقيقية لا تُخزَّن في هذا النموذج. احفظ الأسرار عبر المسار الآمن في الخادم لاحقاً.</p>
  </div>`;
}

function renderAiActionRegistryPanel() {
  return `<div class="automation-panel">
    <div class="automation-section-head"><h3>سجل إجراءات الذكاء</h3><span>قراءة / اقتراح / موافقة / حظر</span></div>
    <div class="analytics-table-wrap"><table class="analytics-mini-table">
      <thead><tr><th>الإجراء</th><th>الهدف</th><th>السياسة</th><th>الخطورة</th><th>المخرج</th><th></th></tr></thead>
      <tbody>${getAiActionRegistry().map(action => {
        const policy = getAiPolicyBadge(action.mode);
        return `<tr>
          <td><b>${escapeHtml(action.label)}</b><br><span>${escapeHtml(action.description)}</span></td>
          <td>${escapeHtml(translateAiTarget(action.target))}</td>
          <td><span class="analytics-risk-badge" style="background:${policy.color}">${escapeHtml(policy.label)}</span></td>
          <td><span class="analytics-risk-badge" style="background:${getAiRiskColor(action.risk)}">${escapeHtml(translateAiRisk(action.risk))}</span></td>
          <td>${escapeHtml(translateAiTarget(action.output))}</td>
          <td><button class="btn-secondary" style="padding:4px 9px;font-size:11px" onclick="createAiProposal('${action.id}')">تشغيل / اقتراح</button></td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`;
}

function renderAiContextMapPanel() {
  return `<div class="automation-panel">
    <div class="automation-section-head"><h3>خريطة سياق الذكاء</h3><span>الحقول الحساسة مرئية</span></div>
    <div class="analytics-table-wrap"><table class="analytics-mini-table">
      <thead><tr><th>الوحدة</th><th>السجلات</th><th>قراءة</th><th>الحقول الحساسة</th><th>سياسة الكتابة</th><th>المسؤول</th></tr></thead>
      <tbody>${getAiContextMap().map(row => {
        const policy = getAiPolicyBadge(row.writePolicy);
        return `<tr>
          <td><b>${escapeHtml(row.module)}</b></td>
          <td>${row.records}</td>
          <td><span class="analytics-risk-badge" style="background:${row.readable ? '#34d399' : '#f87171'}">${row.readable ? 'نعم' : 'لا'}</span></td>
          <td>${escapeHtml(row.sensitive)}</td>
          <td><span class="analytics-risk-badge" style="background:${policy.color}">${escapeHtml(policy.label)}</span></td>
          <td>${escapeHtml(row.owner)}</td>
        </tr>`;
      }).join('')}</tbody>
    </table></div>
  </div>`;
}

function renderAiProposalQueuePanel() {
  const queue = getAiControl().actionQueue || [];
  const pending = queue.filter(item => item.status === 'pending');
  const history = (getAiControl().runHistory || []).slice(0, 6);
  return `<div class="automation-panel">
    <div class="automation-section-head"><h3>طابور موافقة الذكاء</h3><span>${pending.length} بانتظار</span></div>
    <div class="automation-fire-list">
      ${pending.map(item => `<div class="automation-fire-row">
        <div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.summary || '')}</p><small>${escapeHtml(translateAiTarget(item.target))} · ${escapeHtml(item.mode)} · ${formatOmniDateTime(item.createdAt)}</small></div>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end;">
          <span class="analytics-risk-badge" style="background:${getAiRiskColor(item.risk)}">${escapeHtml(translateAiRisk(item.risk))}</span>
          <button class="btn-primary" style="padding:4px 9px;font-size:11px" onclick="approveAiProposal('${item.id}')">موافقة</button>
          <button class="btn-secondary" style="padding:4px 9px;font-size:11px" onclick="rejectAiProposal('${item.id}')">رفض</button>
        </div>
      </div>`).join('') || '<div class="omni-notification-empty">لا توجد مقترحات بانتظار الموافقة.</div>'}
    </div>
    <div class="automation-section-head" style="margin-top:16px;"><h3>آخر تشغيلات الذكاء</h3><span>${history.length}</span></div>
    <div class="automation-fire-list">
      ${history.map(item => `<div class="automation-fire-row"><div><b>${escapeHtml(item.title)}</b><p>${escapeHtml(item.note || '')}</p><small>${escapeHtml(item.status)} · ${formatOmniDateTime(item.createdAt)}</small></div><span class="analytics-risk-badge" style="background:${item.status === 'blocked' ? '#f87171' : '#38bdf8'}">${escapeHtml(item.actionId || 'run')}</span></div>`).join('') || '<div class="omni-notification-empty">لم يتم تشغيل أي إجراء AI بعد.</div>'}
    </div>
  </div>`;
}

function addAiRunHistory(entry = {}) {
  const ai = getAiControl();
  const run = {
    id: entry.id || makeId('airun'),
    createdAt: new Date().toISOString(),
    actionId: entry.actionId || '',
    title: entry.title || 'AI run',
    status: entry.status || 'logged',
    note: entry.note || '',
    outputType: entry.outputType || '',
    outputId: entry.outputId || ''
  };
  ai.runHistory.unshift(run);
  ai.runHistory = ai.runHistory.slice(0, 80);
  recordOmniHistoryEvent({
    module: 'ai',
    source: 'ai_control',
    action: run.actionId || 'ai_run',
    title: run.title,
    description: run.note,
    status: run.status,
    aiRunId: run.id,
    createdRecordId: run.outputId,
    recordType: run.outputType,
    payload: { actionId: run.actionId, outputType: run.outputType, outputId: run.outputId }
  });
}

function saveAiProviderSettingsFromForm() {
  const ai = getAiControl();
  ai.provider = {
    ...ai.provider,
    enabled: document.getElementById('aiProviderEnabled')?.value === 'true',
    provider: document.getElementById('aiProviderName')?.value || 'openai',
    model: document.getElementById('aiProviderModel')?.value?.trim() || 'gpt-4.1-mini',
    mode: document.getElementById('aiProviderMode')?.value || 'review_only',
    safetyLevel: document.getElementById('aiSafetyLevel')?.value || 'strict',
    apiKeyLabel: document.getElementById('aiApiKeyLabel')?.value?.trim() || ''
  };
  addAiRunHistory({ actionId: 'settings_update', title: 'AI provider settings updated', status: 'saved', note: `${ai.provider.provider} / ${ai.provider.model} / ${ai.provider.mode}` });
  saveData();
  showToast('تم حفظ إعدادات AI بدون تخزين أي مفتاح سري.', 'success');
  renderAiControlDashboard();
}

function createAiProposal(actionId) {
  const ai = getAiControl();
  const action = getAiActionRegistry().find(item => item.id === actionId);
  if (!action) return showToast('إجراء AI غير معروف', 'warning');
  if (action.mode === 'forbidden') {
    addAiRunHistory({ actionId, title: action.label, status: 'blocked', note: 'Blocked by AI safety policy. No write was performed.' });
    saveData();
    showToast('هذا الإجراء محظور: لا يمكن للذكاء تعديل الرواتب أو المالية أو الإعدادات مباشرة.', 'warning');
    renderAiControlDashboard();
    return;
  }
  if (action.mode === 'read_only') {
    addAiRunHistory({ actionId, title: action.label, status: 'read_only', note: 'Read-only analysis logged. No write was performed.' });
    saveData();
    showToast('تم تسجيل تحليل قراءة فقط بدون أي تعديل.', 'info');
    renderAiControlDashboard();
    return;
  }
  const aiCtx = getAiCurrentUserContext();
  const proposal = {
    id: makeId('aiprop'),
    actionId,
    title: action.label,
    target: action.target,
    mode: action.mode,
    risk: action.risk,
    status: 'pending',
    summary: action.description,
    affectedRecords: action.target === 'task_manager' ? 1 : 0,
    requestedBy: aiCtx.name,
    requestedById: aiCtx.id,
    requestedByRole: aiCtx.role,
    payload: { userId: aiCtx.id, userName: aiCtx.name, userRole: aiCtx.role, source: 'ai_control_dashboard', actionId },
    createdAt: new Date().toISOString()
  };
  ai.actionQueue.unshift(proposal);
  addAiRunHistory({ actionId, title: action.label, status: 'queued', note: 'Proposal added to approval queue.' });
  saveData();
  showToast('تمت إضافة مقترح AI إلى طابور الموافقات.', 'success');
  renderAiControlDashboard();
}

function approveAiProposal(id) {
  const ai = getAiControl();
  const proposal = ai.actionQueue.find(item => item.id === id);
  if (!proposal || proposal.status !== 'pending') return;
  const action = getAiActionRegistry().find(item => item.id === proposal.actionId);
  if (proposal.actionId === 'hr_payroll_review_proposal') {
    const req = createOmniRequest({
      type: 'ai_analysis',
      title: proposal.title || 'مراجعة رواتب وموارد بشرية من الذكاء',
      description: proposal.summary || 'ملاحظة قراءة فقط من طبقة مراجعة الرواتب.',
      requesterName: 'AI Control',
      sourcePage: 'intelligence',
      sourceType: 'hr_payroll_ai_review',
      sourceId: proposal.sourceId || proposal.id,
      priority: proposal.risk === 'critical' ? 'urgent' : 'high',
      payload: {
        ...(proposal.payload || {}),
        policy: 'read_only_payroll_review',
        directPayrollWrite: false
      }
    });
    proposal.status = 'approved';
    proposal.decidedAt = new Date().toISOString();
    proposal.outputType = 'command_center_request';
    proposal.outputId = req?.id || '';
    addAiRunHistory({
      actionId: proposal.actionId,
      title: proposal.title,
      status: 'approved',
      note: 'Approved as Command Center review request. Payroll records were not modified.',
      outputType: 'command_center_request',
      outputId: proposal.outputId
    });
    saveData();
    showToast('تم اعتماد مراجعة الرواتب كطلب في مركز القيادة بدون تعديل الراتب.', 'success');
    renderAiControlDashboard();
    return;
  }
  if (!action || action.mode === 'forbidden' || action.target === 'payroll' || action.target === 'finance' || action.target === 'admin') {
    proposal.status = 'blocked';
    proposal.decidedAt = new Date().toISOString();
    addAiRunHistory({ actionId: proposal.actionId, title: proposal.title, status: 'blocked', note: 'Approval blocked by sensitive module write policy.' });
    saveData();
    showToast('تم منع التنفيذ بسبب سياسة الحماية للرواتب/المالية/الإعدادات.', 'warning');
    renderAiControlDashboard();
    return;
  }
  let outputType = 'command_center_request';
  let outputId = '';
  if (proposal.actionId === 'create_task_followup') {
    const task = createTaskInSelectedSpace('AI Approved Follow-up', { sourceType: 'ai_control', sourceId: proposal.id, priority: 'high', department: 'AI Control', description: proposal.summary, tags: ['ai_control', 'approved'] });
    outputType = 'task_manager';
    outputId = task.id;
  } else {
    const req = createOmniRequest({ type: 'ai_proposal', title: `AI approval: ${proposal.title}`, description: proposal.summary, requesterName: 'AI Control', sourcePage: 'intelligence', sourceType: 'ai_control', sourceId: proposal.id, priority: proposal.risk === 'critical' ? 'urgent' : 'normal', payload: { actionId: proposal.actionId, target: proposal.target, risk: proposal.risk } });
    outputId = req?.id || '';
  }
  proposal.status = 'approved';
  proposal.decidedAt = new Date().toISOString();
  proposal.outputType = outputType;
  proposal.outputId = outputId;
  addAiRunHistory({ actionId: proposal.actionId, title: proposal.title, status: 'approved', note: `Approved and routed to ${outputType}.`, outputType, outputId });
  saveData();
  showToast(outputType === 'task_manager' ? 'تم إنشاء مهمة متابعة آمنة من موافقة AI.' : 'تم تحويل مقترح AI إلى طلب مراجعة آمن.', 'success');
  renderAiControlDashboard();
}

function rejectAiProposal(id) {
  const proposal = getAiControl().actionQueue.find(item => item.id === id);
  if (!proposal || proposal.status !== 'pending') return;
  proposal.status = 'rejected';
  proposal.decidedAt = new Date().toISOString();
  addAiRunHistory({ actionId: proposal.actionId, title: proposal.title, status: 'rejected', note: 'Rejected by user review.' });
  saveData();
  showToast('تم رفض مقترح AI.', 'info');
  renderAiControlDashboard();
}

// DEPRECATED (Phase 6 dedup, 2026-06-19): this older audit-centric dashboard was a
// SECOND top-level `renderAiControlDashboard` — in JS the later definition silently
// wins, so this one was dead code. Its four unique panels (AI Input/Output matrix,
// smart-layers status, Odoo+ gap registry, route-health) have been merged into the
// active chat-centric version below. Renamed so it no longer shadow-collides; kept
// (uncalled) for one release as a reference, safe to delete after launch sign-off.
function renderAiControlDashboard_deprecatedAuditView() {
  normalizeAiIntegrationData();
  const body = document.getElementById('intelligenceBody');
  if (!body) return;
  const stats = getAiDashboardStats();
  body.className = 'automation-shell';
  body.innerHTML = `
    <div class="automation-hero">
      <div>
        <h2><i class="fa-solid fa-brain text-accent-cyan"></i> لوحة تحكم AI للنظام الكامل</h2>
        <p>هذه الصفحة تعرض بصراحة ماذا يستطيع الذكاء قراءةه، ماذا يستطيع كتابته بأمان، وما الذي ما زال يحتاج موافقة أو بناء قبل أن يصبح النظام Input/Output بواسطة AI.</p>
      </div>
      <div class="automation-hero-actions">
        <button class="btn-primary" onclick="createAiFollowupTasks()"><i class="fa-solid fa-list-check"></i> إنشاء مهام لإغلاق الفجوات</button>
        <button class="btn-secondary" onclick="switchPage('automation')"><i class="fa-solid fa-bolt"></i> فتح الأتمتة</button>
        <button class="btn-secondary" onclick="switchPage('whatsapp')"><i class="fa-brands fa-whatsapp"></i> فتح WhatsApp</button>
      </div>
    </div>
    <div class="automation-kpis">
      <div style="border-inline-start:4px solid var(--accent-blue)"><span>تغطية القراءة</span><b>${stats.coveragePercent}%</b></div>
      <div style="border-inline-start:4px solid var(--warning)"><span>كتابة آمنة/مراجعة</span><b>${stats.safeWritePercent}%</b></div>
      <div style="border-inline-start:4px solid var(--success)"><span>قواعد أتمتة نشطة</span><b>${stats.activeRules}</b></div>
      <div style="border-inline-start:4px solid var(--danger)"><span>فجوات حرجة</span><b>${stats.gaps.filter(g => g.severity === 'critical').length}</b></div>
    </div>
    <div class="automation-layout" style="grid-template-columns:minmax(0,1fr) minmax(360px,.8fr);margin-top:20px;">
      <div>
        ${renderAiProviderSettingsPanel()}
        <div style="margin-top:20px;">${renderAiActionRegistryPanel()}</div>
      </div>
      <div>
        ${renderAiProposalQueuePanel()}
      </div>
    </div>
    <div style="margin-top:20px;">${renderAiContextMapPanel()}</div>
    <div style="margin-top:20px;">${renderHrPayrollAiReviewPanel()}</div>
    <div class="automation-layout" style="grid-template-columns:minmax(0,1.25fr) minmax(340px,.75fr);">
      <div class="automation-panel">
        <div class="automation-section-head"><h3>مصفوفة مدخلات ومخرجات الذكاء</h3></div>
        <div class="analytics-table-wrap"><table class="analytics-mini-table">
          <thead><tr><th>المصدر</th><th>السجلات</th><th>قراءة AI</th><th>كتابة AI</th><th>ملاحظة تشغيلية</th></tr></thead>
          <tbody>${stats.inputSources.map(src => `<tr><td><b>${escapeHtml(src.label)}</b></td><td>${src.count}</td><td><span class="analytics-risk-badge" style="background:${src.read ? '#34d399' : '#f87171'}">${src.read ? 'جاهز' : 'غير جاهز'}</span></td><td><span class="analytics-risk-badge" style="background:${src.write === true ? '#34d399' : src.write ? '#fbbf24' : '#f87171'}">${src.write === true ? 'مباشر آمن' : src.write === 'limited' ? 'محدود' : src.write === 'review' ? 'بمراجعة' : 'مغلق'}</span></td><td>${escapeHtml(src.note)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="automation-panel">
        <div class="automation-section-head"><h3>حالة الطبقات الذكية</h3></div>
        <div class="automation-fire-list">
          <div class="automation-fire-row"><div><b>نتائج التحليل</b><p>نتائج مفتوحة تحتاج قرار أو تحويل لمهام.</p></div><b>${stats.openFindings}</b></div>
          <div class="automation-fire-row"><div><b>طابور رسائل العملاء</b><p>اقتراحات بانتظار مراجعة المستخدم.</p></div><b>${stats.pendingWhatsapp}</b></div>
          <div class="automation-fire-row"><div><b>سجل تنفيذ الأتمتة</b><p>سجل التنفيذ الفعلي للقواعد.</p></div><b>${stats.fireLog.length}</b></div>
          <div class="automation-fire-row"><div><b>مدير المهام</b><p>أفضل قناة آمنة لمخرجات الذكاء حالياً.</p></div><b>${stats.tasks.length}</b></div>
        </div>
      </div>
    </div>
    <div class="automation-panel" style="margin-top:20px;">
      <div class="automation-section-head"><h3>الفجوات التي تمنع AI من التحكم بكل النظام</h3></div>
      <div class="automation-rule-grid">${stats.gaps.map(gap => `<div class="automation-rule-card"><div class="automation-rule-head"><h3>${escapeHtml(gap.title)}</h3><span class="task-priority-chip" style="--chip-color:${gap.severity === 'critical' ? 'var(--danger)' : gap.severity === 'high' ? 'var(--warning)' : 'var(--accent-blue)'}">${escapeHtml(translateAiRisk(gap.severity))}</span></div><div class="automation-rule-foot"><button class="btn-secondary" onclick="switchPage('${gap.page}')"><i class="fa-solid fa-up-right-from-square"></i> فتح الصفحة</button><button class="btn-primary" onclick="createAiFollowupTask('${jsString(gap.title)}','${gap.page}','${gap.severity}')"><i class="fa-solid fa-plus"></i> مهمة متابعة</button></div></div>`).join('')}</div>
    </div>
    ${renderOdooPlusGapRegistry()}
    ${renderOctagonRouteHealthPanel()}
  `;
}

function createAiFollowupTask(title, page = 'intelligence', severity = 'high') {
  ensureOmni();
  const task = createTaskInSelectedSpace(title || 'AI follow-up', { sourceType: 'intelligence', sourceId: `ai_gap_${page}`, priority: severity === 'critical' ? 'urgent' : 'high', department: 'AI Control', tags: ['ai_control', page], description: `متابعة فجوة جاهزية AI في صفحة ${page}.` });
  saveData();
  showToast(`تم إنشاء مهمة AI: ${task.title}`, 'success');
  renderAiControlDashboard();
}

function createAiFollowupTasks() {
  getAiDashboardStats().gaps.forEach(g => createAiFollowupTask(g.title, g.page, g.severity));
}




// renderHelpManualPage() moved to modules/page-help-manual.js (GO 16 de-monolith Phase 3)

// ═══════════════════════════════════════════════════
// MUTATORS OVERRIDES WITH EVENT TRIGGERS
// ═══════════════════════════════════════════════════

function updateTaskManagerTaskStatusInline(taskId, statusValue) {
  updateTaskManagerTask(taskId, { status: statusValue });
  showToast('تم تحديث حالة المهمة', 'success');

  if (statusValue === 'done') {
    const task = findTaskById(taskId);
    if (task) {
      triggerOmniEvent('TASK_COMPLETED', { task });
    }
  }
}


// T4.18 de-monolith: MRP work-order cluster moved to modules/mrp-work-orders.js;
// Inventory Deepening cluster moved to modules/inventory-deepening.js.

// ─── CUSTOMER PORTAL SIMULATION & EXPERIENCE (GO 15) ──────────────────────────

window.customerPortalActiveTab = window.customerPortalActiveTab || 'orders';

window.switchCustomerPortalTab = function(tab) {
  window.customerPortalActiveTab = tab;
  renderCustomerPortal();
};

window.copyCustomerPortalLink = function() {
  const selector = document.getElementById('customerPortalSelector');
  const customerId = selector ? selector.value : '';
  if (!customerId) {
    showToast('يرجى اختيار عميل أولاً لنسخ رابط المحاكاة الخاصة به', 'warning');
    return;
  }
  const url = `${window.location.origin}${window.location.pathname}?customer=${encodeURIComponent(customerId)}`;
  navigator.clipboard.writeText(url)
    .then(() => {
      showToast('تم نسخ رابط المحاكاة إلى الحافظة! يمكنك مشاركته عبر الواتساب 📋', 'success');
    })
    .catch(() => {
      showToast('فشل في نسخ الرابط تلقائياً', 'error');
    });
};

function isKanbanCardDone(cardId) {
  const card = (omni.kanban.cards || []).find(c => c.id === cardId);
  if (!card) return false;
  const col = (omni.kanban.columns || []).find(cl => cl.id === card.columnId);
  if (!col) return false;
  return /done|مكتمل|منجز|تم|archive|أرشيف/i.test(`${col.title || ''} ${col.name || ''}`);
}

window.renderCustomerPortal = function() {
  ensureFinance();
  ensureOmni();

  const selector = document.getElementById('customerPortalSelector');
  if (!selector) return;

  const currentVal = selector.value;
  // If the selector was empty or had a value that's no longer valid, check initial customer ID
  const selectedId = currentVal || window.customerPortalInitialCustomerId || (finance.customers[0] ? finance.customers[0].id : '');

  // Populate options
  selector.innerHTML = finance.customers.map(c => `
    <option value="${escapeHtml(c.id)}" ${c.id === selectedId ? 'selected' : ''}>${escapeHtml(c.name)} (${escapeHtml(c.companyName || 'فردي')})</option>
  `).join('');

  // Clear initial customer ID to prevent it overriding subsequent selections
  delete window.customerPortalInitialCustomerId;

  const activeCustomerId = selector.value;
  const customer = finance.customers.find(c => c.id === activeCustomerId);

  const portalBody = document.getElementById('customerPortalBody');
  if (!portalBody) return;

  if (!customer) {
    portalBody.innerHTML = `
      <div class="empty-state" style="padding:40px 0;">
        <div class="empty-icon">👥</div>
        <h3>لم يتم اختيار عميل</h3>
        <p>يرجى تحديد أو إنشاء عميل لمحاكاة بوابة الخدمة الذاتية.</p>
      </div>
    `;
    return;
  }

  // Calculate KPIs
  const customerTxs = finance.transactions.filter(tx => tx.customerId === customer.id);
  const totalInvoiced = customerTxs
    .filter(tx => tx.type === 'customer_charge')
    .reduce((sum, tx) => sum + asMoney(tx.amount), 0);

  const totalPaid = customerTxs
    .filter(tx => tx.type === 'income')
    .reduce((sum, tx) => sum + asMoney(tx.amount), 0);

  const currentBalance = getCustomerBalance(customer);

  let html = `
    <!-- KPI Cards -->
    <div class="portal-kpis-grid" style="display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:15px; margin-bottom:25px;">

      <div class="portal-kpi-card glass-card" style="display:flex; align-items:center; gap:15px; padding:16px 20px; border-radius:16px; background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.05);">
        <div class="portal-kpi-icon" style="background:rgba(52, 211, 153, 0.1); color:var(--accent-green); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
          <i class="fa-solid fa-file-invoice-dollar"></i>
        </div>
        <div class="portal-kpi-info" style="display:flex; flex-direction:column; gap:4px;">
          <span class="portal-kpi-label" style="font-size: 11px; color: var(--text-muted); font-weight: 700;">إجمالي المطالبات والفواتير</span>
          <span class="portal-kpi-value" style="font-size: 18px; font-weight: 900; color: #fff; font-family: var(--font-en);">${formatNum(totalInvoiced)} د.ع</span>
        </div>
      </div>

      <div class="portal-kpi-card glass-card" style="display:flex; align-items:center; gap:15px; padding:16px 20px; border-radius:16px; background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.05);">
        <div class="portal-kpi-icon" style="background:rgba(34, 211, 238, 0.1); color:var(--accent-cyan); width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
          <i class="fa-solid fa-receipt"></i>
        </div>
        <div class="portal-kpi-info" style="display:flex; flex-direction:column; gap:4px;">
          <span class="portal-kpi-label" style="font-size: 11px; color: var(--text-muted); font-weight: 700;">إجمالي المدفوعات المسددة</span>
          <span class="portal-kpi-value" style="font-size: 18px; font-weight: 900; color: #fff; font-family: var(--font-en);">${formatNum(totalPaid)} د.ع</span>
        </div>
      </div>

      <div class="portal-kpi-card glass-card" style="display:flex; align-items:center; gap:15px; padding:16px 20px; border-radius:16px; background:rgba(255,255,255,0.035); border:1px solid rgba(255,255,255,0.05); ${currentBalance > 0 ? 'border-right:3px solid var(--accent-red);' : 'border-right:3px solid var(--accent-green);'}">
        <div class="portal-kpi-icon" style="${currentBalance > 0 ? 'background:rgba(248, 113, 113, 0.1); color:var(--accent-red);' : 'background:rgba(52, 211, 153, 0.1); color:var(--accent-green);'} width: 48px; height: 48px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px;">
          <i class="fa-solid fa-wallet"></i>
        </div>
        <div class="portal-kpi-info" style="display:flex; flex-direction:column; gap:4px;">
          <span class="portal-kpi-label" style="font-size: 11px; color: var(--text-muted); font-weight: 700;">الرصيد المتبقي بذمة العميل</span>
          <span class="portal-kpi-value" style="${currentBalance > 0 ? 'color:var(--accent-red);' : 'color:var(--accent-green);'} font-size: 18px; font-weight: 900; font-family: var(--font-en);">
            ${formatNum(Math.abs(currentBalance))} د.ع
            <small style="font-size:10px; font-weight:normal; color:var(--text-muted);">(${currentBalance > 0 ? 'مطلوب منه' : 'فائض له'})</small>
          </span>
        </div>
      </div>

    </div>

    <!-- Tabs Header -->
    <div class="portal-tabs-row" style="display:flex; gap:10px; border-bottom:1px solid rgba(255, 255, 255, 0.08); padding-bottom:10px; margin-bottom:20px;">
      <button class="portal-tab-btn ${window.customerPortalActiveTab === 'orders' ? 'active' : ''}" onclick="switchCustomerPortalTab('orders')">
        <i class="fa-solid fa-list-check" style="margin-left:5px;"></i>الطلبات والمشاريع (${getSalesOrders().filter(o => o.customerId === customer.id).length})
      </button>
      <button class="portal-tab-btn ${window.customerPortalActiveTab === 'quotes' ? 'active' : ''}" onclick="switchCustomerPortalTab('quotes')">
        <i class="fa-solid fa-file-signature" style="margin-left:5px;"></i>اعتماد العروض (${getSalesQuotations().filter(q => q.customerId === customer.id && (q.status === 'draft' || q.status === 'sent')).length})
      </button>
      <button class="portal-tab-btn ${window.customerPortalActiveTab === 'payments' ? 'active' : ''}" onclick="switchCustomerPortalTab('payments')">
        <i class="fa-solid fa-file-invoice" style="margin-left:5px;"></i>المدفوعات وكشف الحساب (${customerTxs.length})
      </button>
    </div>

    <div class="portal-tab-content">
  `;

  if (window.customerPortalActiveTab === 'orders') {
    const soList = getSalesOrders().filter(o => o.customerId === customer.id);
    if (soList.length === 0) {
      html += `
        <div class="empty-state" style="padding:40px 0;">
          <div class="empty-icon">📋</div>
          <h3>لا توجد طلبات إنتاج فعالة</h3>
          <p>الطلبات والإنتاج الجاري ستظهر هنا فور إطلاقها.</p>
        </div>
      `;
    } else {
      html += `<div class="portal-orders-list" style="display:grid; gap:15px;">`;
      soList.forEach(so => {
        const cards = so.kanbanCardIds.map(id => (omni.kanban.cards || []).find(c => c.id === id)).filter(Boolean);
        const totalCards = cards.length;
        const doneCards = so.kanbanCardIds.filter(isKanbanCardDone).length;

        let confClass = 'completed', prodClass = '', compClass = '', delivClass = '';
        let progressScale = 0;

        if (so.status === 'delivered') {
          prodClass = 'completed';
          compClass = 'completed';
          delivClass = 'completed';
          progressScale = 1;
        } else if (totalCards > 0 && doneCards === totalCards) {
          prodClass = 'completed';
          compClass = 'completed';
          delivClass = 'active';
          progressScale = 0.66;
        } else if (so.status === 'in_progress' || doneCards > 0) {
          prodClass = 'completed';
          compClass = 'active';
          progressScale = 0.33;
        } else {
          prodClass = 'active';
          progressScale = 0.05;
        }

        const linesHtml = so.lines.map(l => `
          <div class="portal-line-item" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed rgba(255,255,255,0.05);">
            <span style="font-size:13px; color:var(--text-primary); font-weight:600;">${escapeHtml(l.description)}</span>
            <span style="font-size:12px; color:var(--text-muted);">${l.quantity} × ${formatNum(l.unitPrice)} د.ع</span>
            <span style="font-size:13px; color:var(--accent-cyan); font-weight:bold; font-family:var(--font-en);">${formatNum(l.total)} د.ع</span>
          </div>
        `).join('');

        let cardsHtml = '';
        if (cards.length > 0) {
          cardsHtml = `
            <!-- Workshop Production Stages -->
            <div class="portal-order-cards" style="background:rgba(255,255,255,0.01); padding:15px; border-radius:12px; border:1px solid rgba(255,255,255,0.04); display:flex; flex-direction:column; gap:10px; margin-bottom:10px;">
              <h4 style="font-size:13px; color:var(--text-heading); margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;">
                <i class="fa-solid fa-gears text-accent-cyan" style="margin-left:5px;"></i>مراحل الإنتاج الجارية في الورشة:
              </h4>
              <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap:10px;">
                ${cards.map(c => {
                  const col = (omni.kanban.columns || []).find(cl => cl.id === c.columnId);
                  const colName = col ? col.title || col.name : 'جديد';
                  const totalItems = (c.checklist || []).length;
                  const checkedItems = (c.checklist || []).filter(item => item.done).length;
                  const checklistText = totalItems > 0 ? ` (${checkedItems}/${totalItems} منجز)` : '';
                  const isDone = isKanbanCardDone(c.id);
                  const machine = c.machineId ? (omni.machines || []).find(m => m.id === c.machineId) : null;
                  const machineName = machine ? ` · 💻 ${machine.name}` : '';

                  let cardStatusIcon = '<i class="fa-solid fa-spinner fa-spin" style="color:var(--accent-blue); margin-left:8px;"></i>';
                  let textStyle = '';
                  let cardBorder = 'border: 1px solid rgba(56, 189, 248, 0.15);';
                  if (isDone) {
                    cardStatusIcon = '<i class="fa-solid fa-circle-check" style="color:var(--accent-green); margin-left:8px;"></i>';
                    textStyle = 'text-decoration: line-through; opacity: 0.6;';
                    cardBorder = 'border: 1px solid rgba(52, 211, 153, 0.15);';
                  }

                  return `
                    <div style="display:flex; flex-direction:column; gap:6px; background:rgba(0,0,0,0.15); padding:10px 12px; border-radius:8px; ${cardBorder}">
                      <div style="display:flex; align-items:center; justify-content:space-between; min-width:0; gap:10px;">
                        <div style="display:flex; align-items:center; min-width:0; ${textStyle}">
                          ${cardStatusIcon}
                          <span style="font-size:12.5px; font-weight:600; text-overflow:ellipsis; overflow:hidden; white-space:nowrap; color:#fff;">${escapeHtml(c.title)}</span>
                        </div>
                        <span style="font-size:10px; padding:2px 8px; border-radius:4px; font-weight:bold; background:rgba(255,255,255,0.05); color:var(--text-secondary); border:1px solid rgba(255,255,255,0.08); white-space:nowrap;">${escapeHtml(colName)}</span>
                      </div>
                      <div style="font-size:11px; color:var(--text-muted); display:flex; justify-content:space-between;">
                        <span>الأولوية: ${escapeHtml(c.priority || 'Normal')}${machineName}</span>
                        <span>${checklistText}</span>
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          `;
        }

        html += `
          <div class="portal-order-card glass-card" style="padding:20px; border-radius:16px; display:flex; flex-direction:column; gap:15px;">
            <div class="portal-order-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px;">
              <div class="portal-order-title" style="display:flex; align-items:center; gap:10px;">
                <span style="color:var(--accent-cyan); font-family:var(--font-en); font-weight:800; font-size:16px;">${escapeHtml(so.reference)}</span>
                <span style="font-size:12px; color:var(--text-muted);">${new Date(so.createdAt).toLocaleDateString('ar-EG')}</span>
              </div>
              <div style="text-align:left;">
                <span style="font-size:11px; color:var(--text-muted);">إجمالي الطلب:</span>
                <span style="font-weight:900; color:var(--accent-green); font-family:var(--font-en); font-size:16px; margin-right:5px;">${formatNum(so.total)} د.ع</span>
              </div>
            </div>

            <!-- Progress Timeline -->
            <div class="portal-order-progress" style="display:flex; align-items:center; justify-content:space-between; margin:20px 0; position:relative; padding:0 20px;">
              <div class="portal-progress-line" style="position:absolute; top:50%; left:40px; right:40px; height:3px; background:linear-gradient(90deg, var(--accent-cyan), var(--accent-green)); z-index:2; transform: translateY(-50%) scaleX(${progressScale}); transform-origin: right; transition:transform 0.4s ease;"></div>

              <div class="progress-step ${confClass}" style="display:flex; flex-direction:column; align-items:center; gap:6px; z-index:3;">
                <div class="progress-dot" style="width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:all 0.3s;"><i class="fa-solid fa-check" style="font-size:10px; color:#fff;"></i></div>
                <span class="progress-text" style="font-size:11px;">تم التأكيد</span>
              </div>

              <div class="progress-step ${prodClass}" style="display:flex; flex-direction:column; align-items:center; gap:6px; z-index:3;">
                <div class="progress-dot" style="width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:all 0.3s;"></div>
                <span class="progress-text" style="font-size:11px;">قيد الإنتاج ${totalCards > 0 ? `(${doneCards}/${totalCards})` : ''}</span>
              </div>

              <div class="progress-step ${compClass}" style="display:flex; flex-direction:column; align-items:center; gap:6px; z-index:3;">
                <div class="progress-dot" style="width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:all 0.3s;"></div>
                <span class="progress-text" style="font-size:11px;">مكتمل وجاهز</span>
              </div>

              <div class="progress-step ${delivClass}" style="display:flex; flex-direction:column; align-items:center; gap:6px; z-index:3;">
                <div class="progress-dot" style="width:20px; height:20px; border-radius:50%; display:flex; align-items:center; justify-content:center; transition:all 0.3s;"></div>
                <span class="progress-text" style="font-size:11px;">تم التسليم</span>
              </div>
            </div>

            <!-- Workshop Production Stages -->
            ${cardsHtml}

            <!-- Detailed Lines -->
            <div class="portal-order-details" style="background:rgba(0,0,0,0.15); padding:15px; border-radius:8px; display:flex; flex-direction:column; gap:10px;">
              <h4 style="font-size:13px; color:var(--text-heading); margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;">
                <i class="fa-solid fa-list text-accent-cyan" style="margin-left:5px;"></i>بنود الطلب والمواصفات:
              </h4>
              ${linesHtml}
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
  } else if (window.customerPortalActiveTab === 'quotes') {
    const qList = getSalesQuotations().filter(q => q.customerId === customer.id && (q.status === 'draft' || q.status === 'sent'));
    if (qList.length === 0) {
      html += `
        <div class="empty-state" style="padding:40px 0;">
          <div class="empty-icon">📄</div>
          <h3>لا توجد عروض أسعار معلقة</h3>
          <p>عند إرسال عرض أسعار جديد لك، ستتمكن من مراجعته واعتماده مباشرة من هنا.</p>
        </div>
      `;
    } else {
      html += `<div class="portal-quotes-list" style="display:grid; gap:15px;">`;
      qList.forEach(q => {
        const linesHtml = q.lines.map(l => `
          <div class="portal-line-item" style="display:flex; justify-content:space-between; padding:6px 0; border-bottom:1px dashed rgba(255,255,255,0.05);">
            <span style="font-size:13px; color:var(--text-primary); font-weight:600;">${escapeHtml(l.description)}</span>
            <span style="font-size:12px; color:var(--text-muted);">${l.quantity} × ${formatNum(l.unitPrice)} د.ع</span>
            <span style="font-size:13px; color:var(--accent-purple); font-weight:bold; font-family:var(--font-en);">${formatNum(l.total)} د.ع</span>
          </div>
        `).join('');

        html += `
          <div class="portal-quote-card glass-card" style="padding:20px; border-radius:16px; display:flex; flex-direction:column; gap:15px;">
            <div class="portal-quote-header" style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:12px; flex-wrap:wrap; gap:10px;">
              <div class="portal-order-title" style="display:flex; align-items:center; gap:10px;">
                <span style="color:var(--accent-purple); font-family:var(--font-en); font-weight:800; font-size:16px;">${escapeHtml(q.reference)}</span>
                <span style="font-size:12px; color:var(--text-muted);">${new Date(q.createdAt || new Date()).toLocaleDateString('ar-EG')}</span>
              </div>
              <div style="display:flex; align-items:center; gap:15px; flex-wrap:wrap;">
                <div style="text-align:left;">
                  <span style="font-size:11px; color:var(--text-muted);">المجموع العام الكلي:</span>
                  <span style="font-weight:900; color:var(--accent-green); font-family:var(--font-en); font-size:16px; margin-right:5px;">${formatNum(q.total)} د.ع</span>
                </div>
                <button class="btn-secondary" style="border:1px solid var(--accent-red); padding:8px 16px; border-radius:8px; font-weight:bold; cursor:pointer; background:rgba(239,68,68,0.1); color:var(--accent-red); display:inline-flex; align-items:center; gap:5px;" onclick="customerPortalRequestChanges('${q.id}')">
                  <i class="fa-solid fa-arrows-rotate"></i> طلب تعديل ومراجعة
                </button>
                <button class="btn-primary" style="background:linear-gradient(135deg,#34d399,#059669); border:none; padding:8px 16px; border-radius:8px; font-weight:bold; cursor:pointer;" onclick="customerPortalApproveQuotation('${q.id}')">
                  <i class="fa-solid fa-check" style="margin-left:5px;"></i>اعتماد وموافقة على السعر
                </button>
              </div>
            </div>

            <!-- Detailed Lines -->
            <div class="portal-order-details" style="background:rgba(0,0,0,0.15); padding:15px; border-radius:8px; display:flex; flex-direction:column; gap:10px;">
              <h4 style="font-size:13px; color:var(--text-heading); margin-bottom:5px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;">
                <i class="fa-solid fa-file-invoice" style="margin-left:5px;"></i>بنود العرض الفنية والتكلفة:
              </h4>
              ${linesHtml}
              <div style="display:flex; justify-content:space-between; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08); font-size:12px; color:var(--text-muted);">
                <span>الخصم الممنوح: ${formatNum(q.discountType === 'percent' ? Math.round(q.subtotal * (q.discount || 0) / 100) : (q.discount || 0))} د.ع</span>
                <span>الضريبة المضافة: ${q.tax || 0}%</span>
              </div>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
  } else if (window.customerPortalActiveTab === 'payments') {
    if (customerTxs.length === 0) {
      html += `
        <div class="empty-state" style="padding:40px 0;">
          <div class="empty-icon">💸</div>
          <h3>لا توجد معاملات مالية</h3>
          <p>جميع الحسابات والفواتير والمدفوعات والوصولات ستظهر هنا فور تسجيلها ماليّاً.</p>
        </div>
      `;
    } else {
      html += `
        <div class="table-container glass-card" style="padding:15px; border-radius:12px; background:rgba(0,0,0,0.2); overflow-x:auto;">
          <table class="data-table finance-table" style="width:100%; border-collapse:collapse; text-align:right; min-width:600px;">
            <thead>
              <tr style="border-bottom:1.5px solid rgba(255,255,255,0.1);">
                <th style="padding:12px; color:var(--text-secondary); font-size:12px;">التاريخ</th>
                <th style="padding:12px; color:var(--text-secondary); font-size:12px;">رقم المعاملة / الوصل</th>
                <th style="padding:12px; color:var(--text-secondary); font-size:12px;">النوع</th>
                <th style="padding:12px; color:var(--text-secondary); font-size:12px;">البيان والتفاصيل</th>
                <th style="padding:12px; color:var(--text-secondary); font-size:12px; text-align:left;">مبلغ الفاتورة / مطالبة (+)</th>
                <th style="padding:12px; color:var(--text-secondary); font-size:12px; text-align:left;">المبلغ المسدد / دفعة (-)</th>
              </tr>
            </thead>
            <tbody>
      `;

      const sortedTxs = customerTxs.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));

      sortedTxs.forEach(tx => {
        let typeLabel = '';
        let chargeCell = '-';
        let paymentCell = '-';

        if (tx.type === 'customer_charge') {
          // Expose functions to window for DOM onclick events
          window.reopenFinancePeriod = reopenFinancePeriod;
          window.createPayrollAdjustment = createPayrollAdjustment;
          typeLabel = `<span class="customer-balance-badge customer-balance-owes" style="font-size:11px; padding:2px 8px; border-radius:4px; font-weight:bold;">مطالبة مالية</span>`;
          chargeCell = `${formatNum(tx.amount)} د.ع`;
        } else if (tx.type === 'income' || tx.type === 'sales_receipt') {
          typeLabel = `<span class="customer-balance-badge customer-balance-cleared" style="font-size:11px; padding:2px 8px; border-radius:4px; font-weight:bold; background:rgba(34,211,238,0.1); color:var(--accent-cyan); border:1px solid rgba(34,211,238,0.2);">تسديد دفعة</span>`;
          paymentCell = `${formatNum(tx.amount)} د.ع`;
        } else {
          typeLabel = `<span class="customer-balance-badge" style="font-size:11px; padding:2px 8px; border-radius:4px; font-weight:bold; background:rgba(255,255,255,0.05); color:var(--text-muted); border:1px solid rgba(255,255,255,0.08);">${escapeHtml(tx.type)}</span>`;
          chargeCell = `${formatNum(tx.amount)} د.ع`;
        }

        const receipt = (finance.receipts || []).find(r => (tx.receiptNo && r.receiptNo === tx.receiptNo) || r.id === tx.sourceId || r.id === String(tx.sourceId || '').replace('_remaining', ''));
        const receiptBtn = receipt ? `<button class="btn-secondary" onclick="viewCustomerReceipt('${receipt.id}')" style="padding:2px 6px; font-size:10px; cursor:pointer; background:rgba(56, 189, 248, 0.1); border:1px solid rgba(56,189,248,0.2); color:var(--accent-cyan); border-radius:4px; display:inline-flex; align-items:center; gap:3px;" title="عرض وتنزيل الوصل"><i class="fa-solid fa-eye"></i> عرض</button>` : '';

        html += `
          <tr style="border-bottom:1px solid rgba(255,255,255,0.05); transition: background-color 0.2s;">
            <td style="padding:12px; font-family:var(--font-en); color:var(--text-muted); font-size:13px;">${escapeHtml(tx.date || '-')}</td>
            <td style="padding:12px; font-family:var(--font-en); font-weight:bold; color:var(--accent-blue); font-size:13px;">
              <div style="display:flex; align-items:center; justify-content:space-between; gap:5px;">
                <span>${escapeHtml(tx.receiptNo || tx.sourceId || '-')}</span>
                ${receiptBtn}
              </div>
            </td>
            <td style="padding:12px;">${typeLabel}</td>
            <td style="padding:12px; color:var(--text-primary); font-size:13px;">${escapeHtml(tx.description || '-')}</td>
            <td style="padding:12px; text-align:left; font-family:var(--font-en); color:var(--accent-red); font-weight:bold; font-size:13px;">${chargeCell}</td>
            <td style="padding:12px; text-align:left; font-family:var(--font-en); color:var(--accent-green); font-weight:bold; font-size:13px;">${paymentCell}</td>
          </tr>
        `;
      });

      html += `
            </tbody>
          </table>
        </div>
      `;
    }
  }

  html += `</div>`; // close portal-tab-content
  portalBody.innerHTML = html;
};

window.customerPortalApproveQuotation = function(quotId) {
  ensureFinance();
  ensureOmni();

  const q = getSalesQuotationById(quotId);
  if (!q) {
    showToast('فشل: لم يتم العثور على عرض السعر المحدد', 'error');
    return;
  }
  if (q.status === 'converted') {
    showToast('عرض السعر معتمد ومحول مسبقاً', 'warning');
    return;
  }

  const soRef = `SO-${(getSalesOrders().length + 1).toString().padStart(4, '0')}`;
  const so = {
    id: makeId('so'),
    quotationId: q.id,
    leadId: q.leadId,
    customerId: q.customerId,
    customerName: q.customerName,
    reference: soRef,
    status: 'confirmed',
    lines: JSON.parse(JSON.stringify(q.lines)),
    total: q.total,
    totalCost: q.totalCost,
    kanbanCardIds: [],
    taskIds: [],
    createdAt: new Date().toISOString(),
    activityLog: [{ date: new Date().toISOString(), text: `تم اعتماد العرض ${q.reference} بواسطة العميل من البوابة` }]
  };

  // Move lead to won
  if (q.leadId) {
    const lead = getSalesLeadById(q.leadId);
    if (lead) {
      lead.stageId = 'stage_won';
      lead.updatedAt = new Date().toISOString();
      lead.activityLog = lead.activityLog || [];
      lead.activityLog.push({ date: new Date().toISOString(), text: `تم اعتماد عرض السعر ${q.reference} وتحويله لـ Won` });
    }
  }

  // Create Kanban cards & Reserve materials
  const kanbanCol = (omni.kanban.columns || []).find(c => /backlog|to.?do|جديد|مهام/i.test(`${c.title || ''} ${c.name || ''}`)) || omni.kanban.columns[0];

  q.lines.filter(l => l.type === 'oppack' && l.packId).forEach(line => {
    const pack = (omni.opPacks || []).find(p => p.id === line.packId);

    // Create card
    if (kanbanCol) {
      const card = {
        id: makeId('card'),
        title: `${q.customerName} — ${line.description}`,
        description: `طلب مبيعات: ${soRef}\nعدد: ${line.quantity}\nالقيمة: ${line.total.toLocaleString()}`,
        columnId: kanbanCol.id,
        priority: 'Normal',
        dueDate: new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10),
        labels: ['مبيعات', pack?.name || ''],
        owner: '',
        operationPackId: line.packId,
        salesOrderId: so.id,
        activityLog: [{ date: new Date().toISOString(), text: `تم الإنشاء تلقائياً عبر اعتماد البوابة ${soRef}` }]
      };
      omni.kanban.cards.push(card);
      so.kanbanCardIds.push(card.id);
    }

    // Reserve materials
    if (pack) {
      const preview = buildOpPackPreview(pack, line.quantity);
      if (preview && Array.isArray(preview.materials)) {
        preview.materials.forEach(m => {
          if (typeof reserveMaterial === 'function') {
            reserveMaterial(m.materialId, m.qty, 'sales_order', so.id, `${soRef}: باقة ${pack.name}`);
          }
        });
      }
    }
  });

  // Direct reserve materials
  q.lines.filter(l => l.type === 'material' && l.materialId).forEach(line => {
    if (typeof reserveMaterial === 'function') {
      reserveMaterial(line.materialId, line.quantity, 'sales_order', so.id, `${soRef}: مادة ${line.description}`);
    }
  });

  getSalesOrders().push(so);

  q.status = 'converted';
  q.updatedAt = new Date().toISOString();
  q.activityLog = q.activityLog || [];
  q.activityLog.push({ date: new Date().toISOString(), text: `تم الاعتماد والتحويل لطلب مبيعات ${soRef} من البوابة` });

  saveData();
  renderCustomerPortal();
  showToast(`تم الاعتماد بنجاح وتوليد طلب المبيعات ${soRef} مع بطاقات العمل 🚀`, 'success');
};

window.customerPortalRequestChanges = function(quotId) {
  ensureFinance();
  ensureOmni();

  const q = getSalesQuotationById(quotId);
  if (!q) {
    showToast('فشل: لم يتم العثور على عرض السعر المحدد', 'error');
    return;
  }
  if (q.status === 'converted') {
    showToast('عرض السعر معتمد ومحول مسبقاً لا يمكن مراجعته', 'warning');
    return;
  }

  showOmniModal('طلب تعديل عرض السعر', `
    <div style="display:flex; flex-direction:column; gap:10px; direction:rtl;">
      <p style="font-size:13px; color:var(--text-muted);">يرجى تحديد التعديلات المطلوبة على عرض السعر <strong>${escapeHtml(q.reference)}</strong>:</p>
      <textarea id="quoteRevisionNotes" rows="4" placeholder="مثال: يرجى تقليل الكمية المطلوبة أو إضافة خصم إضافي..." style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:10px; border-radius:8px; font-family:inherit; resize:none; outline:none;"></textarea>
    </div>
  `, () => {
    const notes = document.getElementById('quoteRevisionNotes')?.value.trim();
    if (!notes) {
      showToast('يرجى كتابة التعديلات المطلوبة أولاً', 'warning');
      return;
    }

    q.status = 'rejected';
    q.updatedAt = new Date().toISOString();
    q.activityLog = q.activityLog || [];
    q.activityLog.push({ date: new Date().toISOString(), text: `طلب العميل تعديل العرض: ${notes}` });

    // Log to unified history ledger
    if (typeof recordOmniHistoryEvent === 'function') {
      recordOmniHistoryEvent({
        eventId: makeId('evt'),
        correlationId: q.id,
        eventType: 'QUOTE_REVISION_REQUESTED',
        module: 'sales',
        action: 'update',
        actor: { name: q.customerName || 'العميل', role: 'customer' },
        description: `العميل طلب تعديل عرض السعر ${q.reference}`,
        payload: {
          quotationId: q.id,
          customerNotes: notes
        }
      });
    }

    // Create Command Center Request
    omni.requests = omni.requests || [];
    omni.requests.push({
      id: makeId('req'),
      type: 'quote_revision',
      title: `طلب تعديل عرض سعر: ${q.reference}`,
      description: `العميل ${q.customerName || 'مجهول'} طلب تعديل عرض السعر. ملاحظات: ${notes}`,
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: { quotationId: q.id, notes: notes }
    });

    saveData();
    renderCustomerPortal();
    showToast('تم تقديم طلب التعديل بنجاح إلى إدارة الورشة وسنقوم بمراجعته فوراً 📤', 'success');
  });
};

window.viewCustomerReceipt = function(receiptId) {
  ensureFinance();
  const r = (finance.receipts || []).find(rc => rc.id === receiptId);
  if (!r) {
    showToast('لم يتم العثور على الوصل المطلوب', 'error');
    return;
  }

  showOmniModal('عرض الوصل المالي', `
    <div style="background: white; color: #111; padding: 25px; border-radius: 12px; max-height: 60vh; overflow-y: auto; direction: rtl;" id="customerReceiptModalContent">
      <div class="receipt-print" style="max-width: 100%; font-family: Tahoma, Arial, sans-serif;">
        ${r.html || `
          <div style="text-align:center; padding: 20px;">
            <h3 style="margin:0 0 10px 0;">وصل مالي رقم ${escapeHtml(r.receiptNo)}</h3>
            <p style="margin:5px 0;">التاريخ: ${escapeHtml(r.date)}</p>
            <p style="margin:5px 0;">العميل: ${escapeHtml(r.partyName)}</p>
            <p style="margin:5px 0;">البيان: ${escapeHtml(r.description)}</p>
            <h4 style="color: #059669; font-size:18px; margin:15px 0 0 0;">المبلغ: ${formatNum(r.amount)} د.ع</h4>
          </div>
        `}
      </div>
    </div>
  `, () => {
    // Print action
    const w = window.open('', '_blank', 'width=850,height=800');
    w.document.open();
    w.document.write(`
      <html dir="rtl"><head><meta charset="utf-8"><title>وصل رقم ${r.receiptNo}</title>
      <style>
        body{font-family:Tahoma,Arial,sans-serif;padding:40px;color:#111}
        .receipt-print{max-width:720px;margin:auto;border:1px solid #ddd;padding:32px;border-radius:12px}
        .receipt-paper-head{display:flex;justify-content:space-between;border-bottom:2px solid #111;margin-bottom:24px;padding-bottom:12px}
        .receipt-line{font-size:18px;margin:14px 0}
        .receipt-signatures{display:flex;justify-content:space-between;margin-top:70px}
        .receipt-items-print{width:100%;border-collapse:collapse;margin:15px 0}
        .receipt-items-print th, .receipt-items-print td{border:1px solid #ddd;padding:8px;text-align:right}
        .receipt-items-print th{background:#f5f5f5}
      </style></head><body><div class="receipt-print">${r.html || ''}</div><script>window.print()<\/script></body></html>
    `);
    w.document.close();
  });

  // Customize confirm button text to Print
  const confirmBtn = document.getElementById('omniModalConfirm');
  if (confirmBtn) {
    confirmBtn.innerHTML = '<i class="fa-solid fa-print"></i> طباعة الوصل';
  }
};

window.shareCustomerPortalLink = function(customerId, orderRef) {
  ensureFinance();
  const customer = finance.customers.find(c => c.id === customerId);
  if (!customer) {
    showToast('لم يتم العثور على العميل المرتبط بالطلب', 'error');
    return;
  }
  const url = `${window.location.origin}${window.location.pathname}?customer=${encodeURIComponent(customerId)}`;
  const msgText = `مرحباً ${customer.name}، يمكنك متابعة حالة طلبك ${orderRef} وتتبع مراحل إنتاجه في الورشة لحظة بلحظة مباشرة من هنا: ${url}`;

  showOmniModal('إرسال رابط المتابعة للعميل', `
    <div style="display:flex; flex-direction:column; gap:10px; direction:rtl;">
      <p style="font-size:13px; color:var(--text-muted);">سيتم محاكاة إرسال الرسالة التالية للعميل <strong>${escapeHtml(customer.name)}</strong> عبر الواتساب وتوثيقها في سجل النظام:</p>
      <div style="font-size:12.5px; background:rgba(255,255,255,0.05); padding:10px; border-radius:8px; border:1px solid rgba(255,255,255,0.08); color:var(--text-secondary); margin-bottom:5px;">
        <strong>رقم الهاتف:</strong> ${escapeHtml(customer.phone || 'غير مسجل')}
      </div>
      <textarea id="shareWaMsgText" rows="5" style="width:100%; background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.1); color:var(--text); padding:10px; border-radius:8px; font-family:inherit; resize:none; outline:none;">${escapeHtml(msgText)}</textarea>
    </div>
  `, () => {
    const finalMsg = document.getElementById('shareWaMsgText')?.value.trim();
    if (!finalMsg) {
      showToast('لا يمكن إرسال رسالة فارغة', 'warning');
      return;
    }

    // Log to history ledger
    if (typeof recordOmniHistoryEvent === 'function') {
      recordOmniHistoryEvent({
        eventId: makeId('evt'),
        correlationId: customer.id,
        eventType: 'WHATSAPP_SENT',
        module: 'whatsapp',
        action: 'send',
        actor: { name: 'المشرف', role: 'supervisor' },
        description: `تم إرسال رابط بوابة المتابعة للعميل ${customer.name} بخصوص الطلب ${orderRef}`,
        payload: {
          to: customer.phone || 'unknown',
          message: finalMsg,
          customerId: customer.id,
          orderReference: orderRef
        }
      });
    }

    showToast('تمت محاكاة إرسال رسالة الواتساب وتوثيقها بنجاح في سجل العمليات 🚀', 'success');
  });

  const confirmBtn = document.getElementById('omniModalConfirm');
  if (confirmBtn) {
    confirmBtn.innerHTML = '<i class="fa-brands fa-whatsapp"></i> إرسال عبر واتساب';
  }
};

// ═══════════════════════════════════════════════════
// WORKSHOP EQUIPMENT MANAGEMENT SYSTEM (معدات وأدوات الورشة)
// ═══════════════════════════════════════════════════

// T4.4 de-monolith: Equipment Management cluster moved to modules/equipment-management.js.

// T4.6 de-monolith: reopenFinancePeriod moved to modules/finance-ui.js


// ─── Sync Legacy Transactions to V6 Double-Entry ───
async function syncLegacyTransactionToV6(tx) {
  if (!window.FinanceService) return;

  const amount = Number(tx.amount || 0);
  if (amount <= 0) return;

  try {
    const isIncome = tx.direction === 'in' || tx.type === 'income';
    const isCustomerCharge = tx.type === 'customer_charge';
    const journalId = (isIncome || isCustomerCharge) ? 'j_sale' : 'j_purc';
    const cashAccount = tx.accountId || (isIncome ? 'income_sales' : 'expense_general');
    const partnerId = tx.partyName || tx.paidByName || 'شريك عام';

    let lines = [];
    if (isCustomerCharge) {
      // Receivable (فاتورة مبيعات / بيع آجل / مطالبة): the customer owes us — debit AR, credit revenue.
      // No cash moves yet; the later payment (income + customerId) settles the AR line.
      const arAccount = tx.accountId || 'receivables_customers';
      const arPartner = tx.customerId || partnerId;
      const arLabel = tx.description || 'مطالبة على عميل';
      lines = [
        { account_id: arAccount, debit: amount, credit: 0, label: arLabel, partner_id: arPartner },
        { account_id: 'income_sales', debit: 0, credit: amount, label: arLabel, partner_id: arPartner }
      ];
    } else if (isIncome) {
      // Money-in tied to a customer settles their receivable (legacy getCustomerBalance subtracts it),
      // so credit AR — revenue was already recognized when the customer_charge posted. Money-in with
      // no customer keeps crediting the income account directly (e.g. POS/pharmacy cash sales).
      const incomeCreditAccount = tx.accountId || (tx.customerId ? 'receivables_customers' : 'income_sales');
      const incomeCreditPartner = incomeCreditAccount === 'receivables_customers' ? (tx.customerId || partnerId) : partnerId;
      lines = [
        { account_id: 'cash_workshop', debit: amount, credit: 0, label: tx.description || 'وارد نقدي', partner_id: partnerId },
        { account_id: incomeCreditAccount, debit: 0, credit: amount, label: tx.description || 'وارد نقدي', partner_id: incomeCreditPartner }
      ];
    } else {
      lines = [
        { account_id: cashAccount, debit: amount, credit: 0, label: tx.description || 'مصروف نقدي', partner_id: partnerId },
        { account_id: tx.sourceType === 'person_pocket' ? 'payables_people' : 'cash_workshop', debit: 0, credit: amount, label: tx.description || 'مصروف نقدي', partner_id: partnerId }
      ];
    }

    const move = await FinanceService.createMove({
      journal_id: journalId,
      move_type: 'entry',
      date: tx.date,
      partner_id: partnerId,
      origin: `legacy_sync/${tx.id}`,
      line_ids: lines,
      companyId: tx.companyId || '',
      skip_backup: true
    });

    const posted = await FinanceService.postMove(move.id, { skip_backup: true });
    tx.v6_move_id = posted.id;
    console.log(`Synced legacy tx ${tx.id} to V6 move ${posted.id}`);
  } catch (err) {
    console.error('Error syncing legacy transaction to V6:', err);
  }
}

// T2.2 — idempotent, MANUAL repair for historical customer_charge v6 moves that
// were mis-journaled (booked through j_purc/expense) BEFORE syncLegacyTransactionToV6
// was corrected to route customer_charge to j_sale (debit receivables_customers,
// credit income_sales). For each wrong move it reverses via FinanceService.cancelMove
// (a dated reversal — never mutating a posted move in place) then re-posts a correct
// receivable move and relinks the legacy tx's v6_move_id. Safe to run repeatedly: a
// repaired original ends up state 'cancel' (skipped next run) and its replacement is
// j_sale/AR (never re-flagged). Locked-period moves are reported as skipped, not
// forced (unlocking is an owner decision — see T2.1). Pass { dryRun:true } to preview.
// T4.6 de-monolith: repairCustomerChargeMoves and runCustomerChargeRepair moved to modules/finance-ui.js

// Expose functions to window for DOM onclick events
window.syncLegacyTransactionToV6 = syncLegacyTransactionToV6;
window.calculatePayrollPeriod = calculatePayrollPeriod;
window.closePayrollPeriod = closePayrollPeriod;
window.postPayrollAccrual = postPayrollAccrual;
window.settlePayrollPayment = settlePayrollPayment;
window.reopenPayrollPeriod = reopenPayrollPeriod;

/* ==========================================================================
   Operator Workspace Render Layer - language/icons/UI consolidation
   ========================================================================== */

function ptxEventLabel(eventName) {
  const map = {
    KANBAN_CARD_STUCK: 'بطاقة عالقة في اللوحة',
    MATERIAL_BELOW_MINIMUM: 'مادة أقل من الحد الأدنى',
    WHATSAPP_APPROVED: 'اعتماد اقتراح WhatsApp',
    QUOTE_CREATED: 'عرض سعر جديد',
    MACHINE_OVERLOADED: 'ضغط زائد على ماكينة',
    '*': 'كل الأحداث'
  };
  return map[eventName] || eventName || 'حدث غير محدد';
}

function ptxActionLabel(actionName) {
  const map = {
    notify: 'إشعار فقط',
    notify_supervisor: 'تنبيه مشرف',
    flag_anomaly: 'تصعيد شذوذ',
    trigger_scan: 'فحص سريع',
    create_task: 'إنشاء مهمة',
    create_request: 'طلب موافقة',
    propose_purchase: 'مقترح شراء',
    schedule_inspection: 'فحص جودة',
    trigger_ai_analysis: 'تحليل AI بموافقة'
  };
  return map[actionName] || actionName || 'إجراء غير محدد';
}






function renderAiSystemChatPanel() {
  const ai = getAiControl();
  const chatLog = Array.isArray(ai.chatLog) ? ai.chatLog.slice(0, 10) : [];
  const chatRuns = (ai.runHistory || []).filter(item => item.actionId === 'system_chat').slice(0, 6);
  return `
    <section class="ai-command-center">
      <div class="ai-core-orb"><span>AI</span></div>
      <div class="ai-command-copy">
        <h3>محادثة عقل النظام</h3>
        <p>اكتب ما تريد من النظام. الذكاء يقرأ السياق ويحوّل التنفيذ الحساس إلى موافقة، والآمن إلى مهمة أو اقتراح.</p>
      </div>
      <textarea id="aiSystemCommandInput" class="form-input" rows="5" placeholder="مثال: رتب طلبات العملاء المتأخرة، أو راجع نقص المواد، أو حضر مهمة متابعة لعرض سعر جديد..."></textarea>
      <div class="ai-command-actions">
        <button class="btn-primary" onclick="submitAiSystemCommand()"><i class="fa-solid fa-paper-plane"></i> إرسال لعقل النظام</button>
        <button class="btn-secondary" onclick="createAiFollowupTasks()"><i class="fa-solid fa-list-check"></i> إغلاق فجوات الذكاء</button>
      </div>
      <div class="ai-suggestion-chips">
        <button onclick="fillAiSystemCommand('افحص الطلبات المتأخرة وحضر مهام متابعة آمنة')">الطلبات المتأخرة</button>
        <button onclick="fillAiSystemCommand('راجع نقص المواد واقترح طلبات شراء للموافقة')">نقص المواد</button>
        <button onclick="fillAiSystemCommand('لخص رسائل العملاء المعلقة وحول المهم إلى مركز القيادة')">رسائل العملاء</button>
        <button onclick="fillAiSystemCommand('راجع الرواتب قراءة فقط وأنشئ طلب مراجعة بدون تعديل مباشر')">رواتب آمن</button>
      </div>
      <div class="automation-panel" style="margin-top:14px;">
        <div class="automation-section-head"><h3>إصدار أمر أو مهمة بمساعدة AI</h3><span>الطلبات الحساسة تبقى للموافقة</span></div>
        <div class="automation-form-grid">
          <label>النوع<select id="aiOrderType" class="form-input"><option value="task">مهمة تنفيذية</option><option value="order">أمر إداري / طلب موافقة</option></select></label>
          <label>الأولوية<select id="aiOrderPriority" class="form-input"><option value="normal">عادي</option><option value="high">عالي</option><option value="urgent">عاجل</option><option value="low">منخفض</option></select></label>
          <label>المسؤول<input id="aiOrderOwner" class="form-input" placeholder="اسم الموظف أو القسم"></label>
          <label>تاريخ الاستحقاق<input id="aiOrderDueDate" type="date" class="form-input"></label>
          <label style="grid-column:1/-1;">العنوان<input id="aiOrderTitle" class="form-input" placeholder="مثال: تنظيف المكيفات وفحص المولد"></label>
          <label style="grid-column:1/-1;">التفاصيل<textarea id="aiOrderDetails" class="form-input" rows="4" placeholder="اكتب المطلوب، وسيعيد AI صياغته كأمر واضح قابل للتنفيذ."></textarea></label>
        </div>
        <div class="ai-command-actions">
          <button class="btn-secondary" onclick="draftAiOrderTask()"><i class="fa-solid fa-wand-magic-sparkles"></i> صياغة AI</button>
          <button class="btn-primary" onclick="issueAiOrderTask()"><i class="fa-solid fa-circle-check"></i> إصدار</button>
        </div>
        <div id="aiOrderDraftPreview" class="ai-chat-history" style="margin-top:10px;"></div>
      </div>
      <div id="aiSystemChatResponse" style="margin-top:14px;display:flex;flex-direction:column;gap:10px;max-height:360px;overflow:auto;">
        ${chatLog.length ? chatLog.map(m => m.role === 'user'
          ? `<div style="align-self:flex-end;max-width:88%;background:var(--accent-blue,#2563eb);color:#fff;padding:10px 14px;border-radius:14px 14px 4px 14px;"><b style="opacity:.85;font-size:11px;">أنت</b><div style="white-space:pre-wrap;">${escapeHtml(m.text || '')}</div></div>`
          : `<div style="align-self:flex-start;max-width:92%;background:rgba(148,163,184,.16);padding:10px 14px;border-radius:14px 14px 14px 4px;"><b style="font-size:11px;color:var(--accent-blue,#2563eb);">🧠 عقل النظام</b><div style="white-space:pre-wrap;">${escapeHtml(m.text || '')}</div></div>`
        ).join('') : '<p class="muted" style="margin:0;">اكتب أمراً وسيقرأ عقل النظام بياناتك الحقيقية ويرد عليك مباشرة بالعربية.</p>'}
      </div>
      <div class="ai-chat-history">
        ${chatRuns.map(run => `<div><b>${escapeHtml(run.title)}</b><span>${escapeHtml(run.note || '')}</span><small>${formatOmniDateTime(run.createdAt)}</small></div>`).join('') || '<p class="muted">لا توجد محادثات مسجلة بعد.</p>'}
      </div>
    </section>
  `;
}

function fillAiSystemCommand(text) {
  const input = document.getElementById('aiSystemCommandInput');
  if (input) input.value = text;
}

function getAiOrderFormData() {
  const val = id => (document.getElementById(id)?.value || '').trim();
  return {
    type: val('aiOrderType') || 'task',
    priority: val('aiOrderPriority') || 'normal',
    owner: val('aiOrderOwner'),
    dueDate: val('aiOrderDueDate'),
    title: val('aiOrderTitle'),
    details: val('aiOrderDetails')
  };
}

function renderAiOrderDraft(text, tone) {
  const box = document.getElementById('aiOrderDraftPreview');
  if (!box) return;
  const color = tone === 'error' ? 'var(--danger,#ef4444)' : tone === 'success' ? 'var(--success,#10b981)' : 'var(--accent-blue,#2563eb)';
  box.innerHTML = `<div><b style="color:${color}">مسودة الأمر</b><span style="white-space:pre-wrap;">${escapeHtml(text || '')}</span></div>`;
}

async function draftAiOrderTask() {
  const data = getAiOrderFormData();
  if (!data.title && !data.details) return showToast('اكتب عنواناً أو تفاصيل للأمر أولاً.', 'warning');
  const fallback = [
    `العنوان: ${data.title || 'مهمة تشغيلية'}`,
    `الأولوية: ${data.priority}`,
    data.owner ? `المسؤول: ${data.owner}` : '',
    data.dueDate ? `الاستحقاق: ${data.dueDate}` : '',
    '',
    data.details || ''
  ].filter(Boolean).join('\n');
  renderAiOrderDraft('جاري صياغة الأمر...', 'info');
  try {
    const prompt = `حوّل النص التالي إلى أمر عمل أو مهمة واضحة باللغة العربية. اكتب عنواناً مختصراً، وصفاً تنفيذياً، وقائمة خطوات مرقمة. لا تنفذ أي إجراء ولا تقترح تعديلات مالية مباشرة.\n\n${fallback}`;
    const answer = await (window.callOctagonAi || callOctagonAi)(prompt, buildOctagonAiContext(), { temperature: 0.15 });
    const draft = answer || fallback;
    const detailsEl = document.getElementById('aiOrderDetails');
    if (detailsEl) detailsEl.value = draft;
    renderAiOrderDraft(draft, 'success');
  } catch (err) {
    renderAiOrderDraft(fallback, 'success');
    showToast('تعذر اتصال AI الآن؛ استخدمت المسودة اليدوية.', 'warning');
  }
}

function issueAiOrderTask() {
  const data = getAiOrderFormData();
  const title = data.title || (data.details || '').split('\n').find(Boolean) || 'مهمة تشغيلية من AI';
  if (!title.trim()) return showToast('اكتب عنوان الأمر أو المهمة أولاً.', 'warning');
  const aiCtx = typeof getAiCurrentUserContext === 'function' ? getAiCurrentUserContext() : { id: 'system', name: 'system', role: 'system' };
  if (data.type === 'order') {
    if (typeof createOmniRequest === 'function') {
      const req = createOmniRequest({
        type: 'ai_order',
        title,
        description: data.details || title,
        requesterName: aiCtx.name,
        sourcePage: 'intelligence',
        sourceType: 'ai_order_form',
        status: 'pending',
        priority: data.priority === 'urgent' ? 'urgent' : data.priority === 'high' ? 'high' : 'normal',
        payload: { owner: data.owner, dueDate: data.dueDate, requestedById: aiCtx.id, requestedByRole: aiCtx.role }
      });
      saveData();
      renderAiOrderDraft(`تم إصدار أمر إداري بانتظار المراجعة: ${req?.title || title}`, 'success');
      showToast('تم إصدار الأمر إلى مركز القيادة / الموافقات.', 'success');
      return req;
    }
    showToast('مركز الطلبات غير جاهز؛ سيتم إنشاء مهمة بدلاً من الأمر.', 'warning');
  }
  if (typeof createTaskInSelectedSpace !== 'function') return showToast('مدير المهام غير جاهز لإنشاء المهمة.', 'error');
  const task = createTaskInSelectedSpace(title, {
    priority: data.priority,
    owner: data.owner,
    assignedTo: data.owner,
    dueDate: data.dueDate,
    department: data.type === 'order' ? 'الإدارة' : 'عام',
    description: data.details || title,
    sourceType: 'ai_order_form',
    sourceId: 'intelligence',
    createdByAI: true,
    requestedBy: aiCtx.name,
    requestedById: aiCtx.id,
    requestedByRole: aiCtx.role
  });
  saveData();
  renderAiOrderDraft(`تم إنشاء المهمة: ${task?.title || title}`, 'success');
  showToast('تم إنشاء المهمة في Task Manager.', 'success');
  return task;
}

// === Octagon AI brain: one reusable, grounded call to the model ===
// Single source of truth for the assistant.
// Security hardening 2026-07-05: the Gemini key was REMOVED from client code.
// All calls (text + inline audio transcription) go through the server proxy
// POST /api/ai/gemini, which reads GEMINI_API_KEY from the server's .env.
const OCTAGON_AI_ENDPOINT = "/api/ai/gemini";

async function callOctagonAi(userText, systemContext, opts = {}) {
  const promptText = `${systemContext}\n\n=== سؤال/أمر المستخدم ===\n${userText || ''}`;
  const parts = [];
  if (promptText) {
    parts.push({ text: promptText });
  }
  if (opts.audio && opts.audio.data) {
    parts.push({
      inlineData: {
        mimeType: opts.audio.mimeType || 'audio/webm',
        data: opts.audio.data
      }
    });
  }
  const response = await fetch(OCTAGON_AI_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gemini-flash-latest",
      contents: [{ parts: parts }],
      generationConfig: { temperature: typeof opts.temperature === 'number' ? opts.temperature : 0.3 }
    })
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message);
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

const callPentagonAi = callOctagonAi;
window.callOctagonAi = callOctagonAi;
window.callPentagonAi = callOctagonAi;

// Builds a compact, accurate snapshot of the live system so the AI answers about
// real data instead of guessing. Everything here is read-only.
function buildOctagonAiContext() {
  const ai = getAiControl();
  let modules = [];
  try { modules = getAiContextMap().map(m => ({ module: m.module, records: m.records, writePolicy: m.writePolicy })); } catch (_) {}
  const cfg = (typeof getConfig === 'function') ? (getConfig() || {}) : {};
  const snapshot = {
    company: 'Octagon ERP (workshop / manufacturing)',
    period: { year: cfg.year, month: cfg.month },
    modules,
    pendingApprovals: (ai.actionQueue || []).filter(x => x.status === 'pending').length,
    employees: Array.isArray(employees) ? employees.length : 0,
    materials: Array.isArray(omni.materials) ? omni.materials.length : 0,
    kanbanCards: omni.kanban?.cards?.length || 0,
    whatsappPending: (omni.whatsappSuggestions || []).filter(s => s.status === 'pending').length,
    automationRules: (omni.automationRules || []).length,
    openTasks: (typeof getAllTaskManagerTasks === 'function') ? getAllTaskManagerTasks(true).length : undefined
  };
  return `أنت "عقل Octagon ERP" — مساعد ذكي لنظام تشغيل ورشة/مصنع عربي. تساعد المدير: تجيب بدقة وباختصار بالعربية، وتقترح خطوات تشغيلية آمنة.

سياسات الأمان الإلزامية:
- لا تنفّذ تعديلات على الرواتب أو القيود المالية أو الصلاحيات أو الإعدادات مباشرة. اقترحها فقط كخطوة تمر عبر طابور الموافقة.
- لا تخترع أرقاماً غير موجودة في اللقطة. إن لم تتوفر بيانات، قل ذلك بوضوح واطلب التوضيح.

لقطة الحالة الحقيقية للنظام الآن (JSON):
${JSON.stringify(snapshot)}

تعليمات الرد:
- رد بالعربية، نص واضح ومنظم بنقاط عند الحاجة، وعملي قابل للتنفيذ.
- إذا كان الطلب حساساً (راتب/مالية/صلاحيات/حذف/إعدادات) وضّح أنه سيتحول إلى طلب موافقة آمن قبل أي تنفيذ.`;
}

const buildPentagonAiContext = buildOctagonAiContext;
window.buildOctagonAiContext = buildOctagonAiContext;
window.buildPentagonAiContext = buildOctagonAiContext;

async function submitAiSystemCommand() {
  const input = document.getElementById('aiSystemCommandInput');
  const text = (input?.value || '').trim();
  if (!text) return showToast('اكتب أمراً أو سؤالاً للذكاء الصناعي أولاً.', 'warning');
  const sensitive = /راتب|رواتب|قيد|مالية|فلوس|صلاحية|حذف|اعدادات|إعدادات|admin/i.test(text);
  const ai = getAiControl();
  const aiCtx = getAiCurrentUserContext();
  if (!Array.isArray(ai.chatLog)) ai.chatLog = [];

  // --- Existing audit + safe-approval behavior (kept intact) ---
  addAiRunHistory({
    actionId: 'system_chat',
    title: sensitive ? 'طلب حساس من محادثة AI' : 'طلب تشغيلي من محادثة AI',
    status: sensitive ? 'queued_review' : 'queued',
    note: text,
    outputType: 'ai_console'
  });
  ai.actionQueue.unshift({
    id: makeId('aiprop'),
    actionId: 'create_task_followup',
    title: sensitive ? 'مراجعة طلب حساس من AI' : 'متابعة طلب AI تشغيلي',
    target: sensitive ? 'protected_system' : 'task_manager',
    mode: 'approval_required',
    risk: sensitive ? 'high' : 'medium',
    status: 'pending',
    summary: text,
    affectedRecords: 0,
    requestedBy: aiCtx.name,
    requestedById: aiCtx.id,
    requestedByRole: aiCtx.role,
    payload: { userId: aiCtx.id, userName: aiCtx.name, userRole: aiCtx.role, source: 'ai_system_chat', sensitive },
    createdAt: new Date().toISOString()
  });

  // --- New: actually answer the user with a grounded model reply ---
  ai.chatLog.unshift({ role: 'user', text, at: new Date().toISOString() });
  if (input) input.value = '';
  const respBox = document.getElementById('aiSystemChatResponse');
  if (respBox) respBox.innerHTML = '<div style="align-self:flex-start;background:rgba(148,163,184,.16);padding:10px 14px;border-radius:14px;"><i class="fa-solid fa-spinner fa-spin"></i> عقل النظام يقرأ بيانات النظام ويحضّر الرد...</div>';
  saveData();

  try {
    const answer = await (window.callOctagonAi || callOctagonAi)(text, buildOctagonAiContext());
    const finalAnswer = answer || 'لم يصلني رد نصي من النموذج. حاول إعادة صياغة الطلب.';
    ai.chatLog.unshift({ role: 'ai', text: finalAnswer, at: new Date().toISOString() });
    addAiRunHistory({ actionId: 'system_chat', title: 'رد عقل النظام', status: 'answered', note: finalAnswer.slice(0, 280), outputType: 'ai_console' });
    saveData();
    renderAiControlDashboard();
    showToast(sensitive ? 'ردّ عقل النظام، والطلب الحساس بانتظار موافقتك في الطابور.' : 'ردّ عقل النظام على طلبك.', 'success');
  } catch (err) {
    ai.chatLog.unshift({ role: 'ai', text: 'تعذّر الاتصال بالنموذج الآن (' + (err.message || 'خطأ في الشبكة') + '). تم حفظ طلبك في الطابور الآمن وسيُراجع يدوياً.', at: new Date().toISOString() });
    saveData();
    renderAiControlDashboard();
    showToast('تعذّر الاتصال بالذكاء الصناعي؛ تم حفظ الطلب في الطابور الآمن.', 'warning');
  }
}

function renderAiControlDashboard() {
  normalizeAiIntegrationData();
  const body = document.getElementById('intelligenceBody');
  if (!body) return;
  const stats = getAiDashboardStats();
  body.className = 'ai-workspace-shell';
  body.innerHTML = `
    <div class="ai-hero">
      <div><h2>🧠 عقل النظام</h2><p>مركز قراءة النظام، المحادثة، القرارات، والصلاحيات. التنفيذ الحساس يبقى بموافقة واضحة.</p></div>
      <div class="ai-hero-actions">
        <button class="btn-primary" onclick="submitAiSystemCommand()"><i class="fa-solid fa-paper-plane"></i> إرسال الأمر</button>
        <button class="btn-secondary" onclick="switchPage('automation')"><i class="fa-solid fa-bolt"></i> الأتمتة</button>
        <button class="btn-secondary" onclick="switchPage('whatsapp')"><i class="fa-brands fa-whatsapp"></i> رسائل العملاء</button>
      </div>
    </div>
    <div class="ai-kpi-row">
      <div><span>تغطية القراءة</span><b>${stats.coveragePercent}%</b></div>
      <div><span>كتابة آمنة</span><b>${stats.safeWritePercent}%</b></div>
      <div><span>أوامر بانتظار موافقة</span><b>${getAiControl().actionQueue.filter(x => x.status === 'pending').length}</b></div>
      <div><span>فجوات حرجة</span><b>${stats.gaps.filter(g => g.severity === 'critical').length}</b></div>
    </div>
    <div class="ai-main-grid">
      <main>${renderAiSystemChatPanel()}</main>
      <aside>${renderAiProposalQueuePanel()}</aside>
    </div>
    <div class="ai-control-grid">
      ${renderAiProviderSettingsPanel()}
      ${renderAiActionRegistryPanel()}
    </div>
    ${renderAiContextMapPanel()}
    ${renderHrPayrollAiReviewPanel()}
    <div class="automation-panel" style="margin-top:20px;">
      <div class="automation-section-head"><h3>الفجوات التي تمنع AI من التحكم بكل النظام</h3><span>تحويلها لمهام متابعة</span></div>
      <div class="automation-rule-grid">${stats.gaps.map(gap => `<div class="automation-rule-card"><div class="automation-rule-head"><h3>${escapeHtml(gap.title)}</h3><span class="task-priority-chip" style="--chip-color:${gap.severity === 'critical' ? 'var(--danger)' : gap.severity === 'high' ? 'var(--warning)' : 'var(--accent-blue)'}">${escapeHtml(translateAiRisk(gap.severity))}</span></div><div class="automation-rule-foot"><button class="btn-secondary" onclick="switchPage('${gap.page}')"><i class="fa-solid fa-up-right-from-square"></i> فتح</button><button class="btn-primary" onclick="createAiFollowupTask('${jsString(gap.title)}','${gap.page}','${gap.severity}')"><i class="fa-solid fa-plus"></i> مهمة</button></div></div>`).join('')}</div>
    </div>
    <div class="automation-layout" style="grid-template-columns:minmax(0,1.25fr) minmax(340px,.75fr);margin-top:20px;">
      <div class="automation-panel">
        <div class="automation-section-head"><h3>مصفوفة مدخلات ومخرجات الذكاء</h3></div>
        <div class="analytics-table-wrap"><table class="analytics-mini-table">
          <thead><tr><th>المصدر</th><th>السجلات</th><th>قراءة AI</th><th>كتابة AI</th><th>ملاحظة تشغيلية</th></tr></thead>
          <tbody>${stats.inputSources.map(src => `<tr><td><b>${escapeHtml(src.label)}</b></td><td>${src.count}</td><td><span class="analytics-risk-badge" style="background:${src.read ? '#34d399' : '#f87171'}">${src.read ? 'جاهز' : 'غير جاهز'}</span></td><td><span class="analytics-risk-badge" style="background:${src.write === true ? '#34d399' : src.write ? '#fbbf24' : '#f87171'}">${src.write === true ? 'مباشر آمن' : src.write === 'limited' ? 'محدود' : src.write === 'review' ? 'بمراجعة' : 'مغلق'}</span></td><td>${escapeHtml(src.note)}</td></tr>`).join('')}</tbody>
        </table></div>
      </div>
      <div class="automation-panel">
        <div class="automation-section-head"><h3>حالة الطبقات الذكية</h3></div>
        <div class="automation-fire-list">
          <div class="automation-fire-row"><div><b>نتائج التحليل</b><p>نتائج مفتوحة تحتاج قرار أو تحويل لمهام.</p></div><b>${stats.openFindings}</b></div>
          <div class="automation-fire-row"><div><b>طابور رسائل العملاء</b><p>اقتراحات بانتظار مراجعة المستخدم.</p></div><b>${stats.pendingWhatsapp}</b></div>
          <div class="automation-fire-row"><div><b>سجل تنفيذ الأتمتة</b><p>سجل التنفيذ الفعلي للقواعد.</p></div><b>${stats.fireLog.length}</b></div>
          <div class="automation-fire-row"><div><b>مدير المهام</b><p>أفضل قناة آمنة لمخرجات الذكاء حالياً.</p></div><b>${stats.tasks.length}</b></div>
        </div>
      </div>
    </div>
    ${renderOdooPlusGapRegistry()}
    ${renderOctagonRouteHealthPanel()}
  `;
}


// ─── Dynamic HTML View Loader (View Split) ───
window.ensurePageTemplateLoaded = async function (page) {
  const pageMap = {
    home: 'pageHome',
    calculator: 'pageCalculator',
    import: 'pageImport',
    timesheet: 'pageTimesheet',
    report: 'pageReport',
    employees: 'pageEmployees',
    finance: 'pageFinance',
    cashbox: 'pageCashbox',
    expenses: 'pageExpenses',
    income: 'pageIncome',
    customers: 'pageCustomers',
    receipt: 'pageReceipt',
    calendar: 'pageCalendar',
    employee_ui: 'pageEmployee_ui',
    workflow: 'pageWorkflow',
    kanban: 'pageKanban',
    task_manager: 'pageTaskManager',
    sop: 'pageSop',
    command_center: 'pageCommandCenter',
    op_packs: 'pageOpPacks',
    machines: 'pageMachines',
    inventory: 'pageInventory',
    qc_center: 'pageQcCenter',
    analytics: 'pageAnalytics',
    intelligence: 'pageIntelligence',
    admin_panel: 'pageAdminPanel',
    vnext_platform: 'pageVnextPlatform',
    automation: 'pageAutomation',
    whatsapp: 'pageWhatsapp',
    telegram: 'pageTelegram',
    sales: 'pageSales',
    help_manual: 'pageHelpManual',
    customer_portal: 'pageCustomerPortal',
    equipment: 'pageEquipment',
    mrp: 'pageMrp',
    nl_reports: 'pageNlReports',
    multi_entity: 'pageMultiEntity',
    tax_compliance: 'pageTaxCompliance',
    pos: 'pagePOS',
    pharmacy: 'pagePharmacy',
    retail: 'pageRetail',
    clinic: 'pageClinic',
    restaurant: 'pageRestaurant',
    'real-estate': 'pageRealEstate',
    hotel: 'pageHotel',
    assets: 'pageAssets',
    subscriptions: 'pageSubscriptions',
    people_ops: 'pagePeopleOps',
    helpdesk: 'pageHelpdesk',
    fleet: 'pageFleet',
    documents: 'pageDocuments',
    marketing: 'pageMarketing',
    budgeting: 'pageBudgeting',
    procurement: 'pageProcurement',
    projects: 'pageProjects',
    approvals: 'pageApprovals',
    field_service: 'pageFieldService',
    rental: 'pageRental',
    warranty: 'pageWarranty',
    banking: 'pageBanking',
    ar_ap: 'pageArAp',
    contracts: 'pageContracts',
    logistics: 'pageLogistics',
    supplier_portal: 'pageSupplierPortal',
    integration_hub: 'pageIntegrationHub',
    security_center: 'pageSecurityCenter',
    data_quality: 'pageDataQuality',
    training_lms: 'pageTrainingLms',
    scenario_planner: 'pageScenarioPlanner',
    device_center: 'pageDeviceCenter',
    appointments: 'pageAppointments',
    workshop_ledger: 'pageWorkshopLedger',
    loyalty: 'pageLoyalty',
    finance_installments: 'pageFinanceInstallments',
    sales_commission: 'pageSalesCommission',
    sales_contracts: 'pageSalesContracts',
    sales_price_lists: 'pageSalesPriceLists',
    pos_deepening: 'pagePOSDeepening',
    omni_communications: 'pageOmniCommunications',
    esign: 'pageEsign',
    events: 'pageEvents',
    knowledge: 'pageKnowledge',
    knowledge_base: 'pageKnowledgeBase',
    surveys: 'pageSurveys',
    visitors: 'pageVisitors',
    risk_compliance: 'pageRiskCompliance',
    work_orders: 'pageWorkOrders',
    route_health: 'pageRouteHealth',
    wfl_home: 'pageWflHome',
    employee_mobile: 'pageEmployeeMobile',
    workshop_tv: 'pageWorkshopTv',
    kiosk: 'pageKiosk',
    ai_queue: 'pageAiQueue',
    ai_factory: 'pageAiFactory',
    ai_tools: 'pageAiTools',
    ai_status: 'pageAiStatus',
    deploy_ready:'pageDeployReady',
    manager_approvals:'pageManagerApprovals',
    mobile_inventory_count:'pageMobileInventoryCount',
    // T3.2: import-wizard.js builds its own shell (id=pageImportCenter) via
    // JS rather than a views/*.html template — without this entry, the id
    // fallback (pageMap[page] || page) checks for an element literally
    // named "import_center" (which never exists), so the existence guard
    // below always misses and this fires a doomed template fetch (404) on
    // every navigation to the page.
    import_center: 'pageImportCenter',
    // T6.1: system-settings.js self-renders its shell (id=pageSystemSettings).
    system_settings: 'pageSystemSettings'
  };

  // Pages whose DOM is built entirely by their own JS module (no views/*.html
  // template). Their shell may not exist yet on the first navigation/prefetch —
  // if we let the fetch below run before the module has appended its section it
  // 404s on /views/<page>.html every time (the module renders correctly anyway,
  // but the console fills with false errors). Skip the fetch for them outright;
  // the owning module is responsible for building its own section.
  const JS_RENDERED_PAGES = new Set(['import_center', 'system_settings']);
  if (JS_RENDERED_PAGES.has(page)) return;

  const id = pageMap[page] || page;
  if (document.getElementById(id)) return;

  const mainContent = document.getElementById('mainContent');
  if (!mainContent) return;

  // Guard against the load race: the default boot page is loaded by initial
  // navigation AND by prefetchAllViews concurrently — both can pass the
  // existence check above before either appends, creating a duplicate section.
  // Track in-flight loads by section id, and re-check existence right before
  // append (the section may have arrived during the awaits).
  window.__viewLoadsInFlight = window.__viewLoadsInFlight || new Set();
  if (window.__viewLoadsInFlight.has(id)) return;
  window.__viewLoadsInFlight.add(id);

  try {
    const res = await fetch(`/views/${page}.html`);
    if (res.ok) {
      const text = await res.text();
      const temp = document.createElement('div');
      temp.innerHTML = text.trim();
      const section = temp.firstElementChild;
      if (section && !document.getElementById(section.id || id)) {
        mainContent.appendChild(section);
        console.debug(`Loaded view template: ${page}`);
      }
    } else {
      console.error(`Failed to fetch view template: ${page} (status ${res.status})`);
    }
  } catch (e) {
    console.error(`Error loading view template: ${page}`, e);
  } finally {
    window.__viewLoadsInFlight.delete(id);
  }
};

window.prefetchAllViews = function () {
  const pages = [
    'home',
    'calculator', 'import', 'calendar', 'timesheet', 'report', 'employees',
    'finance', 'cashbox', 'expenses', 'income', 'customers', 'receipt',
    'employee_ui', 'workflow', 'kanban', 'task_manager', 'sop', 'command_center',
    'op_packs', 'machines', 'inventory', 'equipment', 'qc_center', 'analytics',
    'automation', 'intelligence', 'whatsapp', 'telegram', 'admin_panel', 'sales',
    'help_manual', 'customer_portal', 'mrp', 'nl_reports', 'multi_entity',
    'tax_compliance', 'pos', 'pharmacy', 'retail', 'clinic', 'restaurant',
    'real-estate', 'hotel', 'assets', 'subscriptions', 'people_ops', 'helpdesk',
    'fleet', 'documents', 'marketing', 'budgeting', 'procurement', 'projects',
    'approvals', 'field_service', 'rental', 'warranty', 'banking', 'ar_ap',
    'contracts', 'logistics', 'supplier_portal', 'integration_hub',
    'security_center', 'data_quality', 'training_lms', 'scenario_planner',
    'device_center', 'appointments', 'workshop_ledger',     'loyalty', 'finance_installments', 'sales_commission', 'sales_contracts', 'sales_price_lists', 'pos_deepening', 'omni_communications', 'esign', 'events', 'knowledge', 'knowledge_base', 'surveys', 'visitors', 'risk_compliance', 'work_orders', 'route_health',
    'wfl_home', 'employee_mobile', 'workshop_tv', 'kiosk', 'ai_queue',
    'ai_factory', 'ai_tools', 'ai_status', 'deploy_ready'
  ];

  let i = 0;
  function next() {
    if (i >= pages.length) return;
    window.ensurePageTemplateLoaded(pages[i]).then(() => {
      i++;
      setTimeout(next, 30); // 30ms gap between background pre-fetch loads
    });
  }
  setTimeout(next, 500);
};
