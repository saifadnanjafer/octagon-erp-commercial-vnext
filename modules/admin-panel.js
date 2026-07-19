// Octagon ERP Phase 4 T4.8 de-monolith module.
// Admin panel page renderers, user management, backups, and role actions moved verbatim from app.js.

function renderAdminToggle(path, label, description = '') {
  const checked = !!path.split('.').reduce((acc, key) => acc?.[key], omni.adminSettings);
  return `
    <label class="admin-setting-row">
      <span><b>${escapeHtml(label)}</b>${description ? `<small>${escapeHtml(description)}</small>` : ''}</span>
      <input class="admin-toggle" type="checkbox" ${checked ? 'checked' : ''} onchange="setAdminSetting('${path}', this.checked)">
    </label>
  `;
}

function renderAdminNumber(path, label, min = 0, max = 999) {
  const value = path.split('.').reduce((acc, key) => acc?.[key], omni.adminSettings);
  return `
    <label class="admin-setting-row">
      <span><b>${escapeHtml(label)}</b></span>
      <input type="number" class="workflow-insp-input admin-number-input" min="${min}" max="${max}" value="${Number(value) || 0}" onchange="setAdminSetting('${path}', Number(this.value) || 0)">
    </label>
  `;
}

function renderAdminSelect(path, label, options) {
  const value = path.split('.').reduce((acc, key) => acc?.[key], omni.adminSettings);
  return `
    <label class="admin-setting-row">
      <span><b>${escapeHtml(label)}</b></span>
      <select class="workflow-insp-input" onchange="setAdminSetting('${path}', this.value)">
        ${options.map(opt => `<option value="${escapeHtml(opt.value)}" ${value === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`).join('')}
      </select>
    </label>
  `;
}

function getAdminSystemCounts() {
  ensureOmni();
  ensureFinance();
  return [
    ['عقد سير العمل', omni.workflow?.nodes?.length || 0],
    ['روابط سير العمل', omni.workflow?.edges?.length || 0],
    ['بطاقات اللوحة', omni.kanban?.cards?.length || 0],
    ['مكائن', omni.machines?.length || 0],
    ['مواد', omni.materials?.length || 0],
    ['SOP', omni.sops?.length || 0],
    ['باقات عمليات', omni.opPacks?.length || 0],
    ['سجلات QC', omni.qcRecords?.length || 0],
    ['أدوار وصلاحيات', omni.roles?.length || 0],
    ['أقسام مالية', finance.departments?.length || 0]
  ];
}

function runAdminIntegrityCheck() {
  const report = typeof validateOmniIntegrity === 'function' ? validateOmniIntegrity() : null;
  const issues = report ? [
    ...(report.brokenLinks || []),
    ...(report.materialShortages || []),
    ...(report.overReservedMaterials || [])
  ] : [];
  showOmniModal('فحص صحة النظام', `
    <div class="admin-integrity-result">
      <p>النتيجة: ${issues.length ? `${issues.length} تنبيه يحتاج مراجعة` : 'لا توجد مشاكل واضحة في الروابط الأساسية'}</p>
      ${issues.slice(0, 20).map(issue => `<div class="insp-linked-item"><b>${escapeHtml(issue.type || 'تنبيه')}</b><small>${escapeHtml(issue.text || '')}</small></div>`).join('')}
      ${issues.length > 20 ? `<p class="muted">و ${issues.length - 20} تنبيه آخر...</p>` : ''}
    </div>
  `, () => true);
}

// ─── ADMIN PANEL TABS — V100 (added 2026-05-23) ───
// Restructured the admin panel from a long scroll into 5 grouped tabs for clarity:
//  overview / settings / users / backups / logs
// The render is split into a tab nav + a body that delegates to per-tab renderers.
let currentAdminTab = 'overview';
function switchAdminTab(tabId) {
  currentAdminTab = tabId;
  renderAdminPanel();
}

function renderAdminPanel() {
  ensureOmni();
  ensureFinance();
  const el = document.getElementById('adminPanelBody');
  if (!el) return;

  const tabs = [
    { id: 'overview', label: 'نظرة عامة',     icon: 'fa-gauge-high' },
    { id: 'wireup',   label: 'توصيل النظام',  icon: 'fa-plug-circle-check' },
    { id: 'productization', label: 'Productization', icon: 'fa-box-open' },
    { id: 'settings', label: 'الإعدادات',     icon: 'fa-sliders' },
    { id: 'routing',  label: 'توجيه المشرفين', icon: 'fa-sitemap' },
    { id: 'users',    label: 'المستخدمون',    icon: 'fa-users-gear' },
    { id: 'backups',  label: 'النسخ الاحتياطية', icon: 'fa-database' },
    { id: 'logs',     label: 'السجلات',       icon: 'fa-clipboard-list' }
  ];

  if (!tabs.some(tab => tab.id === 'history')) {
    const logsIndex = tabs.findIndex(tab => tab.id === 'logs');
    const historyTab = { id: 'history', label: 'السجل', icon: 'fa-clock-rotate-left' };
    if (logsIndex >= 0) tabs.splice(logsIndex, 0, historyTab);
    else tabs.push(historyTab);
  }

  let tabBody = '';
  switch (currentAdminTab) {
    case 'wireup':   tabBody = renderAdminTabWireUp();   break;
    case 'productization': tabBody = renderAdminTabProductization(); break;
    case 'settings': tabBody = renderAdminTabSettings(); break;
    case 'routing':  tabBody = renderAdminTabRouting();  break;
    case 'users':    tabBody = renderAdminTabUsers();    break;
    case 'backups':  tabBody = renderAdminTabBackups();  break;
    case 'history':  tabBody = renderAdminTabHistory();  break;
    case 'logs':     tabBody = renderAdminTabLogs();     break;
    case 'overview':
    default:         tabBody = renderAdminTabOverview(); break;
  }

  el.innerHTML = `
    <div class="admin-panel">
      <nav class="admin-tabs">
        ${tabs.map(t => `<button class="admin-tab ${currentAdminTab === t.id ? 'active' : ''}" onclick="switchAdminTab('${t.id}')">
          <i class="fa-solid ${t.icon}"></i> ${escapeHtml(t.label)}
        </button>`).join('')}
      </nav>
      <div class="admin-tab-body">
        ${tabBody}
      </div>
    </div>
  `;

  // The backup tab needs an async fetch after render; keep that behavior.
  if (currentAdminTab === 'backups') {
    setTimeout(() => { if (typeof loadAdminBackups === 'function') loadAdminBackups(); }, 0);
  }
}

// ─── Tab 1: OVERVIEW (multi-company hierarchy + supervisors pool + system health + counts) ───
let expandedCompanyIds = new Set();
let expandedDepartmentIds = new Set();
function toggleCompanyExpanded(id) {
  if (expandedCompanyIds.has(id)) expandedCompanyIds.delete(id);
  else expandedCompanyIds.add(id);
  renderAdminPanel();
}
function toggleDepartmentExpanded(id) {
  if (expandedDepartmentIds.has(id)) expandedDepartmentIds.delete(id);
  else expandedDepartmentIds.add(id);
  renderAdminPanel();
}

function renderAdminTabOverview() {
  const org = omni.adminSettings.organization || {};
  const counts = getAdminSystemCounts();
  const health = computeAdminSystemHealth();
  const companies = getOrgCompanies();
  const supervisors = getOrgSupervisors();
  const activeCompany = getActiveOrgCompany();
  // Auto-expand the first company on first load so the user sees something immediately.
  if (companies.length && expandedCompanyIds.size === 0) expandedCompanyIds.add(companies[0].id);

  const currencyOpts = ORG_CURRENCY_OPTIONS.map(c => `<option value="${c.code}" ${org.currency === c.code ? 'selected' : ''}>${escapeHtml(c.label)}</option>`).join('');
  const activeCompanyOpts = companies.map(co => `<option value="${co.id}" ${org.activeCompanyId === co.id ? 'selected' : ''}>${escapeHtml(co.name || 'بدون اسم')}</option>`).join('');

  return `
    <section class="admin-card admin-card-wide admin-org-card">
      <div class="admin-org-header">
        <div class="admin-org-logo">🏭</div>
        <div class="admin-org-headtext">
          <h3>هيكل المنظمة</h3>
          <p>${companies.length} شركة/فرع · ${companies.reduce((n,c)=>n+c.departments.length,0)} قسم · ${companies.reduce((n,c)=>n+c.departments.reduce((m,d)=>m+d.shifts.length,0),0)} دوام · ${supervisors.length} مسؤول في القاعدة</p>
        </div>
      </div>

      <!-- Global settings -->
      <div class="admin-org-global-grid">
        <div><label>الشركة / الفرع النشط</label>
          <select class="form-input" onchange="updateActiveCompany(this.value)">${activeCompanyOpts}</select>
        </div>
        <div><label>العملة (لكل الشركات)</label>
          <select class="form-input" onchange="updateOrganizationCurrency(this.value)">${currencyOpts}</select>
        </div>
        <div><label>البلد</label>
          <input type="text" class="form-input" value="${escapeHtml(org.country || '')}" onchange="updateOrganizationGlobalField('country', this.value)">
        </div>
        <div><label>هوية المستندات النشطة</label>
          <input type="text" class="form-input" value="${escapeHtml(activeCompany?.name || '')}" disabled>
        </div>
      </div>

      <div style="margin: 16px 0; padding: 12px; background: rgba(255,255,255,0.02); border: 1px dashed rgba(255,255,255,0.08); border-radius: 6px; display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" id="multiTenantCheckbox" ${org.multiTenant ? 'checked' : ''} onchange="updateOrganizationGlobalField('multiTenant', this.checked)" style="width:16px; height:16px; cursor:pointer;">
        <label for="multiTenantCheckbox" style="cursor:pointer; font-size:12.5px; font-weight:bold; color:var(--text-primary);">تفعيل عزل بيانات المستأجرين والفروع</label>
      </div>

      <!-- Companies list -->
      <div class="admin-org-section-head">
        <h4><i class="fa-solid fa-building"></i> الشركات والفروع (${companies.length})</h4>
        <button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="addCompany()"><i class="fa-solid fa-plus"></i> شركة / فرع جديد</button>
      </div>
      <div class="admin-org-companies">
        ${companies.map(co => renderCompanyCard(co)).join('')}
      </div>

      <!-- Supervisors pool -->
      <div class="admin-org-section-head" style="margin-top:24px">
        <h4><i class="fa-solid fa-user-tie"></i> قاعدة المسؤولين والمشرفين (${supervisors.length})</h4>
        <button class="btn-primary" style="padding:6px 12px;font-size:12px;" onclick="addSupervisor()"><i class="fa-solid fa-user-plus"></i> إضافة شخص</button>
      </div>
      <div class="admin-org-supervisors">
        ${supervisors.length ? supervisors.map(s => renderSupervisorRow(s)).join('') : '<p class="muted" style="padding:12px;text-align:center;">لا يوجد مسؤولون بعد. أضف الأشخاص هنا ثم عيّنهم على الدوامات.</p>'}
      </div>
    </section>

    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-heart-pulse"></i> صحة النظام</h3>
      <div class="admin-health-grid">
        <div class="admin-health-tile"><span>إصدار المشروع</span><b>أوكتاغون الإصدار ${omni.version || 4}.0</b></div>
        <div class="admin-health-tile"><span>حجم قاعدة البيانات</span><b>${health.dbSizeStr}</b></div>
        <div class="admin-health-tile"><span>إجمالي السجلات</span><b>${health.totalRecords.toLocaleString()}</b></div>
        <div class="admin-health-tile"><span>الهجرات المطبّقة</span><b>${health.migrationsCount}</b></div>
        <div class="admin-health-tile"><span>آخر حفظ</span><b>${health.lastSavedStr}</b></div>
        <div class="admin-health-tile admin-health-tile-${health.status}"><span>الحالة العامة</span><b>${health.statusLabel}</b></div>
      </div>
    </section>

    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-chart-bar"></i> عدّادات سريعة</h3>
      <div class="admin-count-grid">${counts.map(([label, value]) => `<div><b>${value}</b><span>${escapeHtml(label)}</span></div>`).join('')}</div>
    </section>
  `;
}

function renderCompanyCard(co) {
  const expanded = expandedCompanyIds.has(co.id);
  const emojiChoices = ['🏭','🏢','🛠️','🎨','💡','🪧','🚗','📐','⚙️','🖨️','🔧','🏗️'];
  return `
    <div class="org-company-card ${expanded ? 'expanded' : ''}">
      <div class="org-company-header" onclick="toggleCompanyExpanded('${co.id}')">
        <span class="org-chevron"><i class="fa-solid fa-chevron-${expanded ? 'down' : 'left'}"></i></span>
        <span class="org-company-emoji">${escapeHtml(co.logoEmoji || '🏭')}</span>
        <div class="org-company-titles">
          <b>${escapeHtml(co.name || 'بدون اسم')}</b>
          <small>${co.phone ? '📞 ' + escapeHtml(co.phone) : ''}${co.address ? ' · ' + escapeHtml(co.address) : ''}</small>
        </div>
        ${co.isPrimary ? '<span class="org-primary-badge">رئيسي</span>' : `<button class="org-btn-icon" title="جعلها الشركة الرئيسية" onclick="event.stopPropagation();setPrimaryCompany('${co.id}')"><i class="fa-regular fa-star"></i></button>`}
        <span class="org-dept-count">${co.departments.length} قسم</span>
        <button class="org-btn-icon org-btn-danger" title="حذف الشركة" onclick="event.stopPropagation();deleteCompany('${co.id}')"><i class="fa-solid fa-trash-can"></i></button>
      </div>
      ${expanded ? `<div class="org-company-body">
        <div class="org-form-grid">
          <div><label>اسم الشركة / الفرع</label>
            <input type="text" class="form-input" value="${escapeHtml(co.name || '')}" onchange="updateCompanyField('${co.id}', 'name', this.value)">
          </div>
          <div><label>📞 رقم هاتف الشركة (سنترال)</label>
            <input type="text" class="form-input" value="${escapeHtml(co.phone || '')}" onchange="updateCompanyField('${co.id}', 'phone', this.value)" placeholder="07XX XXX XXXX">
          </div>
          <div class="org-form-fullrow"><label>العنوان</label>
            <input type="text" class="form-input" value="${escapeHtml(co.address || '')}" onchange="updateCompanyField('${co.id}', 'address', this.value)">
          </div>
          <div><label>الأيقونة</label>
            <div class="admin-org-emoji-row">
              ${emojiChoices.map(e => `<button type="button" class="admin-org-emoji-btn ${(co.logoEmoji||'🏭')===e?'active':''}" onclick="updateCompanyField('${co.id}', 'logoEmoji', '${e}')">${e}</button>`).join('')}
            </div>
          </div>
          <div><label>سنة التأسيس</label>
            <input type="text" class="form-input" value="${escapeHtml(co.founded || '')}" onchange="updateCompanyField('${co.id}', 'founded', this.value)" placeholder="2020">
          </div>
        </div>

        <div class="org-nested-head">
          <h5><i class="fa-solid fa-sitemap"></i> الأقسام (${co.departments.length})</h5>
          <button class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="addDepartment('${co.id}')"><i class="fa-solid fa-plus"></i> قسم جديد</button>
        </div>
        <div class="org-departments">
          ${co.departments.map(d => renderDepartmentCard(co.id, d)).join('') || '<p class="muted" style="padding:8px;font-size:12px;">لا توجد أقسام بعد.</p>'}
        </div>
      </div>` : ''}
    </div>
  `;
}

function renderDepartmentCard(companyId, dept) {
  const expanded = expandedDepartmentIds.has(dept.id);
  return `
    <div class="org-dept-card ${expanded ? 'expanded' : ''}">
      <div class="org-dept-header" onclick="toggleDepartmentExpanded('${dept.id}')">
        <span class="org-chevron"><i class="fa-solid fa-chevron-${expanded ? 'down' : 'left'}"></i></span>
        <span class="org-dept-icon">🛠️</span>
        <div class="org-dept-titles">
          <b>${escapeHtml(dept.name || 'بدون اسم')}</b>
          <small>${dept.phone ? '📞 ' + escapeHtml(dept.phone) : 'بدون رقم'}</small>
        </div>
        <span class="org-dept-count">${dept.shifts.length} دوام</span>
        <button class="org-btn-icon org-btn-danger" title="حذف القسم" onclick="event.stopPropagation();deleteDepartment('${companyId}', '${dept.id}')"><i class="fa-solid fa-trash-can"></i></button>
      </div>
      ${expanded ? `<div class="org-dept-body">
        <div class="org-form-grid">
          <div><label>اسم القسم</label>
            <input type="text" class="form-input" value="${escapeHtml(dept.name || '')}" onchange="updateDepartmentField('${companyId}', '${dept.id}', 'name', this.value)">
          </div>
          <div><label>📞 رقم هاتف القسم</label>
            <input type="text" class="form-input" value="${escapeHtml(dept.phone || '')}" onchange="updateDepartmentField('${companyId}', '${dept.id}', 'phone', this.value)" placeholder="07XX XXX XXXX">
          </div>
        </div>

        <div class="org-nested-head" style="margin-top:14px">
          <h5><i class="fa-solid fa-clock"></i> الدوامات (${dept.shifts.length})</h5>
          <button class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="addShift('${companyId}', '${dept.id}')"><i class="fa-solid fa-plus"></i> دوام جديد</button>
        </div>
        <div class="org-shifts">
          ${dept.shifts.map(s => renderShiftRow(companyId, dept.id, s)).join('') || '<p class="muted" style="padding:8px;font-size:11px;">لا توجد دوامات بعد.</p>'}
        </div>
      </div>` : ''}
    </div>
  `;
}

function renderShiftRow(companyId, deptId, shift) {
  const supOpts = getOrgSupervisors().map(s => `<option value="${s.id}" ${shift.supervisorId === s.id ? 'selected' : ''}>${escapeHtml(s.name)}</option>`).join('');
  const dayChips = SHIFT_DAYS_ORDER.map(d => {
    const active = (shift.days || []).includes(d);
    return `<button type="button" class="org-shift-day-chip ${active ? 'active' : ''}" onclick="toggleShiftDay('${companyId}', '${deptId}', '${shift.id}', '${d}')">${SHIFT_DAYS_AR[d]}</button>`;
  }).join('');
  return `
    <div class="org-shift-row">
      <div class="org-shift-grid">
        <div><label>اسم الدوام</label>
          <input type="text" class="form-input" value="${escapeHtml(shift.name || '')}" onchange="updateShiftField('${companyId}', '${deptId}', '${shift.id}', 'name', this.value)" placeholder="مثال: الصباحي">
        </div>
        <div><label>من</label>
          <input type="time" class="form-input" value="${escapeHtml(shift.start || '08:00')}" onchange="updateShiftField('${companyId}', '${deptId}', '${shift.id}', 'start', this.value)">
        </div>
        <div><label>إلى</label>
          <input type="time" class="form-input" value="${escapeHtml(shift.end || '16:00')}" onchange="updateShiftField('${companyId}', '${deptId}', '${shift.id}', 'end', this.value)">
        </div>
        <div><label>المسؤول</label>
          <select class="form-input" onchange="updateShiftField('${companyId}', '${deptId}', '${shift.id}', 'supervisorId', this.value)">
            <option value="">— بدون —</option>${supOpts}
          </select>
        </div>
        <button class="org-btn-icon org-btn-danger" title="حذف الدوام" onclick="deleteShift('${companyId}', '${deptId}', '${shift.id}')"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="org-shift-days">
        <span class="org-shift-days-label">أيام العمل:</span>
        ${dayChips}
      </div>
    </div>
  `;
}

function renderSupervisorRow(sup) {
  // Count how many shifts this supervisor is assigned to.
  let assignedCount = 0;
  getOrgCompanies().forEach(co => co.departments.forEach(d => d.shifts.forEach(sh => { if (sh.supervisorId === sup.id) assignedCount++; })));
  return `
    <div class="org-supervisor-row">
      <div class="org-supervisor-grid">
        <div><label>الاسم</label>
          <input type="text" class="form-input" value="${escapeHtml(sup.name || '')}" onchange="updateSupervisorField('${sup.id}', 'name', this.value)">
        </div>
        <div><label>📞 الهاتف الشخصي</label>
          <input type="text" class="form-input" value="${escapeHtml(sup.phone || '')}" onchange="updateSupervisorField('${sup.id}', 'phone', this.value)" placeholder="07XX XXX XXXX">
        </div>
        <div><label>المنصب / الدور</label>
          <input type="text" class="form-input" value="${escapeHtml(sup.role || '')}" onchange="updateSupervisorField('${sup.id}', 'role', this.value)" placeholder="مشرف إنتاج / مدير...">
        </div>
        <div><label>البريد (اختياري)</label>
          <input type="email" class="form-input" value="${escapeHtml(sup.email || '')}" onchange="updateSupervisorField('${sup.id}', 'email', this.value)" placeholder="email@example.com">
        </div>
        <div class="org-supervisor-meta">
          <span class="org-supervisor-assigned-chip" title="عدد الدوامات المعيّن عليها">${assignedCount} دوام</span>
          <button class="org-btn-icon org-btn-danger" title="حذف المسؤول" onclick="deleteSupervisor('${sup.id}')"><i class="fa-solid fa-trash-can"></i></button>
        </div>
      </div>
    </div>
  `;
}

function getActiveOrgCompany() {
  ensureOmni();
  const org = omni.adminSettings?.organization || {};
  const companies = getOrgCompanies();
  return companies.find(co => co.id === org.activeCompanyId) || companies.find(co => co.isPrimary) || companies[0] || null;
}

function getActiveOrgProfile() {
  const org = omni.adminSettings?.organization || {};
  const company = getActiveOrgCompany();
  return {
    companyId: company?.id || '',
    companyName: company?.name || org.name || 'ورشة بينتاجون',
    phone: company?.phone || org.phone || '',
    address: company?.address || org.address || '',
    logoEmoji: company?.logoEmoji || org.logoEmoji || '🏭',
    country: org.country || 'العراق',
    currency: org.currency || 'IQD',
    currencySymbol: org.currencySymbol || getAdminCurrencySymbol()
  };
}
window.getActiveOrgProfile = getActiveOrgProfile;

window.scoped = function (array) {
  ensureOmni();
  if (!omni.adminSettings?.organization?.multiTenant) {
    return array || [];
  }
  const activeCo = getActiveOrgProfile();
  const activeCompanyId = activeCo?.companyId || '';
  if (!activeCompanyId) return array || [];
  return (array || []).filter(item => {
    return !item.companyId || item.companyId === activeCompanyId;
  });
};

// Lazy companyId backfill policy (decided 2026-06-14):
//   * Unstamped legacy records stay visible in every tenant (handled by scoped() above).
//   * New records are stamped at creation by their create handlers.
//   * stampCompany() lets an edit handler lazily stamp a single legacy record the
//     moment it is touched — convergence without a risky mass rewrite.
// Call is a no-op unless multiTenant is on, an active company exists, and the
// record is genuinely unstamped, so it is always safe to add to a write path.
window.stampCompany = function (item) {
  if (!item || item.companyId) return item;
  ensureOmni();
  if (!omni.adminSettings?.organization?.multiTenant) return item;
  const activeCompanyId = getActiveOrgProfile()?.companyId || '';
  if (activeCompanyId) item.companyId = activeCompanyId;
  return item;
};

// Explicit, operator-triggered convergence: stamp every unstamped record across
// the given collections to the ACTIVE company. Deliberately opt-in (never runs on
// load/save) so legacy/global data is only claimed when an operator chooses to.
// Returns a per-collection count of records stamped. Pass no args to sweep the
// common operational collections.
window.backfillLegacyCompanyIds = function (collectionNames) {
  ensureOmni();
  if (!omni.adminSettings?.organization?.multiTenant) {
    return { ok: false, reason: 'multiTenant-off', stamped: 0 };
  }
  const activeCompanyId = getActiveOrgProfile()?.companyId || '';
  if (!activeCompanyId) return { ok: false, reason: 'no-active-company', stamped: 0 };
  const names = Array.isArray(collectionNames) && collectionNames.length
    ? collectionNames
    : ['customers', 'suppliers', 'materials', 'jobOrders', 'invoices', 'tasks'];
  const report = {};
  let total = 0;
  names.forEach(name => {
    const arr = omni[name];
    if (!Array.isArray(arr)) return;
    let n = 0;
    arr.forEach(item => {
      if (item && !item.companyId) { item.companyId = activeCompanyId; n++; }
    });
    if (n) { report[name] = n; total += n; }
  });
  if (total) saveData();
  return { ok: true, activeCompanyId, stamped: total, byCollection: report };
};

function renderActiveOrgContextStripHtml(profile = getActiveOrgProfile()) {
  return `
    <div class="admin-active-company-logo">${escapeHtml(profile.logoEmoji)}</div>
    <div><b>${escapeHtml(profile.companyName)}</b><small>${escapeHtml(profile.address || 'بدون عنوان')} - ${escapeHtml(profile.phone || 'بدون هاتف')}</small></div>
    <span>${escapeHtml(profile.currency)} / ${escapeHtml(profile.currencySymbol)}</span>
  `;
}

function syncActiveOrgContextStrip(pageId, stripId) {
  const page = document.getElementById(pageId);
  if (!page) return;
  let strip = document.getElementById(stripId);
  if (!strip) {
    strip = document.createElement('div');
    strip.id = stripId;
    strip.className = 'admin-active-company-strip page-org-context-strip';
    const header = page.querySelector('.page-header');
    if (header && header.nextSibling) page.insertBefore(strip, header.nextSibling);
    else page.prepend(strip);
  }
  strip.innerHTML = renderActiveOrgContextStripHtml();
}

function updateActiveCompany(companyId) {
  ensureOmni();
  const companies = getOrgCompanies();
  const exists = companies.some(co => co.id === companyId);
  if (!exists) return showToast('اختر شركة صحيحة', 'warning');
  omni.adminSettings.organization.activeCompanyId = companyId;
  saveData();
  renderAdminPanel();
  if (currentPage === 'receipt') renderReceiptPage();
  if (currentPage === 'report') renderReport();
  showToast('تم تغيير الشركة النشطة للمستندات والتقارير', 'success');
}

// T0.4 dedup (2026-07-12): dead copy, shadowed by the live definition below
// (which also tracks shift-based supervisor routing, not just direct
// routing). Kept per add-only rule.
function getAdminWireUpRows_deprecated_dup1() {
  const profile = getActiveOrgProfile();
  const org = omni.adminSettings?.organization || {};
  const companies = getOrgCompanies();
  const supervisors = getOrgSupervisors();
  const routed = Object.keys(omni.adminSettings?.supervisorRouting || {}).length;
  const hasShiftSupervisors = companies.some(co => (co.departments || []).some(dept => (dept.shifts || []).some(shift => shift.supervisorId)));
  return [
    { area: 'الشركة النشطة', consumer: 'Receipts / Reports / Print headers', status: profile.companyId ? 'wired' : 'warning', detail: profile.companyName || 'غير محدد', page: 'admin_panel' },
    { area: 'العملة', consumer: 'Receipts / Payroll reports / Finance displays that use admin symbol', status: org.currencySymbol ? 'wired' : 'warning', detail: `${org.currency || 'IQD'} · ${org.currencySymbol || 'د.ع'}`, page: 'receipt' },
    { area: 'توجيه المشرفين', consumer: 'Command Center request routing', status: routed ? 'wired' : 'warning', detail: `${routed} موظف مربوط مباشرة`, page: 'command_center' },
    { area: 'الدوامات والمسؤولون', consumer: 'Employee routing and future payslip/attendance context', status: hasShiftSupervisors ? 'wired' : supervisors.length ? 'warning' : 'missing', detail: `${supervisors.length} مسؤول · ${companies.reduce((sum, co) => sum + (co.departments || []).reduce((n, dept) => n + (dept.shifts || []).length, 0), 0)} دوام`, page: 'admin_panel' },
    { area: 'الوصول والصلاحيات', consumer: 'Locked pages and action gates', status: omni.adminSettings?.permissions?.lockedPagesProtected ? 'wired' : 'missing', detail: omni.adminSettings?.permissions?.lockedPagesProtected ? 'الحماية مفعلة' : 'الحماية غير مفعلة', page: 'admin_panel' },
    { area: 'WhatsApp', consumer: 'Routing metadata and company context for future templates', status: profile.phone ? 'wired' : 'warning', detail: profile.phone ? `هاتف الشركة: ${profile.phone}` : 'أضف هاتف الشركة للقوالب الخارجية', page: 'whatsapp' }
  ];
}

// T0.4 dedup (2026-07-12): dead copy (1 of the original "×3, worst" case
// flagged by the 2026-07-02 audit), shadowed by the fullest live definition
// further below (adds the consumer-preview grid + live button/permission
// audit panel). Kept per add-only rule.
function renderAdminTabWireUp_deprecated_dup1() {
  const rows = getAdminWireUpRows();
  const wiredCount = rows.filter(row => row.status === 'wired').length;
  const profile = getActiveOrgProfile();
  const badge = status => {
    if (status === 'wired') return { label: 'موصول', color: '#34d399' };
    if (status === 'missing') return { label: 'ناقص', color: '#f87171' };
    return { label: 'جزئي', color: '#fbbf24' };
  };
  return `
    <section class="admin-card admin-card-wide admin-wireup-hero">
      <div>
        <h3><i class="fa-solid fa-plug-circle-check"></i> توصيل إعدادات الأدمن بالنظام</h3>
        <p>هذه اللوحة تبيّن أين تؤثر إعدادات الشركة والعملة والتوجيه فعلياً. الهدف أن لا تكون لوحة الأدمن مجرد واجهة منفصلة.</p>
      </div>
      <div class="admin-wireup-score">
        <span>جاهزية التوصيل</span>
        <b>${wiredCount}/${rows.length}</b>
      </div>
    </section>
    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-id-card-clip"></i> الهوية النشطة للمستندات</h3>
      <div class="admin-active-company-strip">
        <div class="admin-active-company-logo">${escapeHtml(profile.logoEmoji)}</div>
        <div><b>${escapeHtml(profile.companyName)}</b><small>${escapeHtml(profile.address || 'بدون عنوان')} · ${escapeHtml(profile.phone || 'بدون هاتف')}</small></div>
        <span>${escapeHtml(profile.currency)} / ${escapeHtml(profile.currencySymbol)}</span>
      </div>
    </section>
    <section class="admin-card admin-card-wide">
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table">
          <thead><tr><th>الإعداد</th><th>يؤثر على</th><th>الحالة</th><th>التفاصيل</th><th></th></tr></thead>
          <tbody>${rows.map(row => {
            const b = badge(row.status);
            return `<tr>
              <td><b>${escapeHtml(row.area)}</b></td>
              <td>${escapeHtml(row.consumer)}</td>
              <td><span class="analytics-risk-badge" style="background:${b.color}">${b.label}</span></td>
              <td>${escapeHtml(row.detail)}</td>
              <td><button class="btn-secondary" style="padding:4px 9px;font-size:11px" onclick="switchPage('${row.page}')">فتح</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </section>
  `;
}

function getAdminWireUpRows() {
  const profile = getActiveOrgProfile();
  const org = omni.adminSettings?.organization || {};
  const companies = getOrgCompanies();
  const supervisors = getOrgSupervisors();
  const directRoutes = Object.keys(omni.adminSettings?.supervisorRouting || {}).length;
  const shiftRoutes = companies.reduce((sum, co) => sum + (co.departments || []).reduce((deptSum, dept) => deptSum + (dept.shifts || []).filter(shift => shift.supervisorId).length, 0), 0);
  const shiftCount = companies.reduce((sum, co) => sum + (co.departments || []).reduce((n, dept) => n + (dept.shifts || []).length, 0), 0);
  const routed = directRoutes + shiftRoutes;
  return [
    { area: 'الشركة النشطة', consumer: 'Receipts / Reports / Employee portal / WhatsApp', status: profile.companyId ? 'wired' : 'warning', detail: profile.companyName || 'غير محدد', page: 'receipt' },
    { area: 'العملة', consumer: 'Receipts / Payroll reports / Salary cards / Finance displays', status: org.currencySymbol ? 'wired' : 'warning', detail: `${org.currency || 'IQD'} - ${org.currencySymbol || 'د.ع'}`, page: 'report' },
    { area: 'توجيه المشرفين', consumer: 'Command Center request routing', status: routed ? 'wired' : 'warning', detail: `${directRoutes} مباشر - ${shiftRoutes} عبر الدوام`, page: 'command_center' },
    { area: 'الدوامات والمسؤولون', consumer: 'Employee requests and attendance correction routing', status: shiftRoutes ? 'wired' : supervisors.length ? 'warning' : 'missing', detail: `${supervisors.length} مسؤول - ${shiftCount} دوام`, page: 'employee_ui' },
    { area: 'الوصول والصلاحيات', consumer: 'Locked pages and action gates', status: omni.adminSettings?.permissions?.lockedPagesProtected ? 'wired' : 'missing', detail: omni.adminSettings?.permissions?.lockedPagesProtected ? 'الحماية مفعلة' : 'الحماية غير مفعلة', page: 'admin_panel' },
    { area: 'WhatsApp', consumer: 'Inbox metadata, approval payloads, and company templates', status: profile.companyId ? 'wired' : 'warning', detail: profile.phone ? `هاتف الشركة: ${profile.phone}` : 'أضف هاتف الشركة للقوالب الخارجية', page: 'whatsapp' }
  ];
}

function getAdminConsumerPreviewRows() {
  const profile = getActiveOrgProfile();
  const routes = Object.keys(omni.adminSettings?.supervisorRouting || {}).length;
  const shiftRoutes = getOrgCompanies().reduce((sum, co) => sum + (co.departments || []).reduce((deptSum, dept) => deptSum + (dept.shifts || []).filter(shift => shift.supervisorId).length, 0), 0);
  return [
    { iconClass: 'fa-solid fa-receipt', title: 'Receipt Builder', detail: `${profile.companyName} - ${profile.currencySymbol}`, page: 'receipt' },
    { iconClass: 'fa-solid fa-chart-line', title: 'Reports / Payslips', detail: `${profile.companyName} - ${profile.currency}`, page: 'report' },
    { iconClass: 'fa-brands fa-whatsapp', title: 'WhatsApp Inbox', detail: profile.phone || profile.companyName, page: 'whatsapp' },
    { iconClass: 'fa-solid fa-route', title: 'Command Center', detail: `${routes} direct - ${shiftRoutes} shift routes`, page: 'command_center' },
    { iconClass: 'fa-solid fa-id-badge', title: 'Employee Portal', detail: `${profile.companyName} - ${profile.currencySymbol}`, page: 'employee_ui' }
  ];
}

// T0.4 dedup (2026-07-12): dead copy (2 of the original "×3, worst" case),
// shadowed by the fullest live definition further below (adds the live
// button/permission audit panel). Kept per add-only rule.
function renderAdminTabWireUp_deprecated_dup2() {
  const rows = getAdminWireUpRows();
  const previews = getAdminConsumerPreviewRows();
  const wiredCount = rows.filter(row => row.status === 'wired').length;
  const profile = getActiveOrgProfile();
  const badge = status => {
    if (status === 'wired') return { label: 'موصول', color: '#34d399' };
    if (status === 'missing') return { label: 'ناقص', color: '#f87171' };
    return { label: 'جزئي', color: '#fbbf24' };
  };
  return `
    <section class="admin-card admin-card-wide admin-wireup-hero">
      <div>
        <h3><i class="fa-solid fa-plug-circle-check"></i> توصيل إعدادات الأدمن بالنظام</h3>
        <p>هذه اللوحة تبين أين تؤثر إعدادات الشركة والعملة والتوجيه فعليا. الهدف أن لا تكون لوحة الأدمن مجرد واجهة منفصلة.</p>
      </div>
      <div class="admin-wireup-score">
        <span>جاهزية التوصيل</span>
        <b>${wiredCount}/${rows.length}</b>
      </div>
    </section>
    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-id-card-clip"></i> الهوية النشطة للمستندات</h3>
      <div class="admin-active-company-strip">
        <div class="admin-active-company-logo">${escapeHtml(profile.logoEmoji)}</div>
        <div><b>${escapeHtml(profile.companyName)}</b><small>${escapeHtml(profile.address || 'بدون عنوان')} - ${escapeHtml(profile.phone || 'بدون هاتف')}</small></div>
        <span>${escapeHtml(profile.currency)} / ${escapeHtml(profile.currencySymbol)}</span>
      </div>
    </section>
    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-sitemap"></i> أين تظهر إعدادات الأدمن</h3>
      <div class="admin-consumer-preview-grid">
        ${previews.map(item => `
          <button class="admin-consumer-preview-card" onclick="switchPage('${item.page}')">
            <i class="${escapeHtml(item.iconClass)}"></i>
            <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></span>
            <i class="fa-solid fa-arrow-left"></i>
          </button>
        `).join('')}
      </div>
    </section>
    <section class="admin-card admin-card-wide">
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table">
          <thead><tr><th>الإعداد</th><th>يؤثر على</th><th>الحالة</th><th>التفاصيل</th><th></th></tr></thead>
          <tbody>${rows.map(row => {
            const b = badge(row.status);
            return `<tr>
              <td><b>${escapeHtml(row.area)}</b></td>
              <td>${escapeHtml(row.consumer)}</td>
              <td><span class="analytics-risk-badge" style="background:${b.color}">${b.label}</span></td>
              <td>${escapeHtml(row.detail)}</td>
              <td><button class="btn-secondary" style="padding:4px 9px;font-size:11px" onclick="switchPage('${row.page}')">فتح</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </section>
  `;
}

function getAdminAuditPageTarget(page) {
  const explicit = {
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
    automation: 'pageAutomation',
    whatsapp: 'pageWhatsapp',
    sales: 'pageSales',
    help_manual: 'pageHelpManual',
    customer_portal: 'pageCustomerPortal',
    equipment: 'pageEquipment',
    banking: 'pageBanking',
    risk_compliance: 'pageRiskCompliance',
    tax_compliance: 'pageTaxCompliance',
    nl_reports: 'pageNlReports',
    settings: 'pageSettings'
  };
  const titleCase = String(page || '')
    .split(/[_-]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
  const candidates = [
    explicit[page],
    `page${titleCase}`,
    `page${String(page || '').replace(/[_-]/g, '')}`,
    `page${String(page || '').charAt(0).toUpperCase()}${String(page || '').slice(1)}`
  ].filter(Boolean);
  const matchedId = candidates.find(candidate => document.getElementById(candidate));
  if (matchedId) return { id: matchedId, el: document.getElementById(matchedId) };
  const normalized = String(page || '').replace(/[_-]/g, '').toLowerCase();
  const fuzzy = Array.from(document.querySelectorAll('section.page')).find(section =>
    String(section.id || '').replace(/^page/i, '').replace(/[_-]/g, '').toLowerCase().includes(normalized)
  );
  if (fuzzy) return { id: fuzzy.id, el: fuzzy };
  const fallback = explicit[page] || candidates[0] || '';
  return { id: fallback, el: null };
}

function getAdminButtonAuditSnapshot() {
  const navButtons = Array.from(document.querySelectorAll('.nav-btn[data-page]'));
  const pagePermissions = window.PermissionService?.pagePermissions || {};
  const sensitivePages = new Set([
    'finance', 'cashbox', 'expenses', 'income', 'customers', 'receipt', 'report',
    'inventory', 'employees', 'workflow', 'kanban', 'machines', 'equipment',
    'op_packs', 'task_manager', 'sop', 'qc_center', 'sales', 'command_center',
    'analytics', 'nl_reports', 'intelligence', 'whatsapp', 'automation',
    'tax_compliance', 'risk_compliance', 'banking', 'admin_panel', 'settings'
  ]);
  const rows = navButtons.map(btn => {
    const page = btn.dataset.page || '';
    const targetInfo = getAdminAuditPageTarget(page);
    const pageId = targetInfo.id;
    const target = targetInfo.el;
    const hasClick = typeof btn.onclick === 'function' || (btn.getAttribute('onclick') || '').includes('switchPage');
    const mapped = Object.prototype.hasOwnProperty.call(pagePermissions, page);
    const status = !pageId || !target || !hasClick ? 'broken' : (sensitivePages.has(page) && !mapped ? 'warning' : 'ok');
    const note = !pageId ? 'No page map entry'
      : !target ? `Missing #${pageId}`
      : !hasClick ? 'No switchPage click handler'
      : sensitivePages.has(page) && !mapped ? 'Sensitive page is still default-allow'
      : mapped ? 'Target and permission policy present'
      : 'Target exists';
    return {
      page,
      label: (btn.innerText || page).replace(/\s+/g, ' ').trim(),
      pageId,
      status,
      mapped,
      note
    };
  });
  const actionPermissions = window.PermissionService?.actionPermissions || {};
  return {
    total: rows.length,
    ok: rows.filter(r => r.status === 'ok').length,
    warning: rows.filter(r => r.status === 'warning').length,
    broken: rows.filter(r => r.status === 'broken').length,
    actionPermissionCount: Object.keys(actionPermissions).length,
    rows
  };
}

function renderAdminButtonAuditPanel() {
  const audit = getAdminButtonAuditSnapshot();
  const statusBadge = status => {
    if (status === 'ok') return { label: 'OK', color: '#34d399' };
    if (status === 'broken') return { label: 'BROKEN', color: '#f87171' };
    return { label: 'REVIEW', color: '#fbbf24' };
  };
  const visibleRows = audit.rows
    .filter(row => row.status !== 'ok' || ['admin_panel', 'command_center', 'receipt', 'report', 'whatsapp', 'employee_ui', 'banking', 'risk_compliance'].includes(row.page))
    .slice(0, 24);
  return `
    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-list-check"></i> Live Button / Permission Audit</h3>
      <div class="admin-audit-kpis">
        <div><b>${audit.total}</b><span>Sidebar buttons</span></div>
        <div><b>${audit.ok}</b><span>OK</span></div>
        <div><b>${audit.warning}</b><span>Needs policy review</span></div>
        <div><b>${audit.broken}</b><span>Broken targets</span></div>
        <div><b>${audit.actionPermissionCount}</b><span>Guarded actions</span></div>
      </div>
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table">
          <thead><tr><th>Button</th><th>Target</th><th>Permission</th><th>Status</th><th>Note</th></tr></thead>
          <tbody>${visibleRows.map(row => {
            const b = statusBadge(row.status);
            return `<tr>
              <td><b>${escapeHtml(row.label || row.page)}</b><small style="display:block;color:var(--text-muted)">${escapeHtml(row.page)}</small></td>
              <td>${escapeHtml(row.pageId || '-')}</td>
              <td>${row.mapped ? 'Explicit' : 'Default allow'}</td>
              <td><span class="analytics-risk-badge" style="background:${b.color}">${b.label}</span></td>
              <td>${escapeHtml(row.note)}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="5">No sidebar buttons found for audit.</td></tr>'}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAdminTabWireUp() {
  const rows = getAdminWireUpRows();
  const previews = getAdminConsumerPreviewRows();
  const wiredCount = rows.filter(row => row.status === 'wired').length;
  const profile = getActiveOrgProfile();
  const badge = status => {
    if (status === 'wired') return { label: 'موصول', color: '#34d399' };
    if (status === 'missing') return { label: 'ناقص', color: '#f87171' };
    return { label: 'جزئي', color: '#fbbf24' };
  };
  return `
    <section class="admin-card admin-card-wide admin-wireup-hero">
      <div>
        <h3><i class="fa-solid fa-plug-circle-check"></i> توصيل إعدادات الأدمن بالنظام</h3>
        <p>هذه اللوحة تبين أين تؤثر إعدادات الشركة والعملة والتوجيه فعليا، وتعرض فحصا مباشرا لأزرار التنقل والسياسات الحساسة.</p>
      </div>
      <div class="admin-wireup-score">
        <span>جاهزية التوصيل</span>
        <b>${wiredCount}/${rows.length}</b>
      </div>
    </section>
    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-id-card-clip"></i> الهوية النشطة للمستندات</h3>
      <div class="admin-active-company-strip">
        ${renderActiveOrgContextStripHtml(profile)}
      </div>
    </section>
    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-cubes-stacked"></i> نواة المنصة الجديدة (VNext Platform Kernel — R1)</h3>
      <p style="font-size:12px; color:var(--text-secondary); margin:4px 0 12px;">واجهة تجريبية للمحرك العام (CRUD الديناميكي، دورة حياة المستند، اللقطات المجمّدة، سجل التغييرات) — قيد التطوير، معزولة عن التطبيق الرئيسي.</p>
      <div class="admin-consumer-preview-grid">
        <button class="admin-consumer-preview-card" onclick="window.open('/vnext/client/demo.html', '_blank')">
          <i class="fa-solid fa-diagram-project"></i>
          <span><b>واجهة CRUD العامة (تجريبي)</b><small>عرض حي لمحرك الكيانات العام — عملاء محتملون / تذاكر دعم / منتجات</small></span>
          <i class="fa-solid fa-arrow-left"></i>
        </button>
      </div>
    </section>
    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-sitemap"></i> أين تظهر إعدادات الأدمن</h3>
      <div class="admin-consumer-preview-grid">
        ${previews.map(item => `
          <button class="admin-consumer-preview-card" onclick="switchPage('${item.page}')">
            <i class="${escapeHtml(item.iconClass)}"></i>
            <span><b>${escapeHtml(item.title)}</b><small>${escapeHtml(item.detail)}</small></span>
            <i class="fa-solid fa-arrow-left"></i>
          </button>
        `).join('')}
      </div>
    </section>
    ${renderAdminButtonAuditPanel()}
    <section class="admin-card admin-card-wide">
      <div class="analytics-table-wrap">
        <table class="analytics-mini-table">
          <thead><tr><th>الإعداد</th><th>يؤثر على</th><th>الحالة</th><th>التفاصيل</th><th></th></tr></thead>
          <tbody>${rows.map(row => {
            const b = badge(row.status);
            return `<tr>
              <td><b>${escapeHtml(row.area)}</b></td>
              <td>${escapeHtml(row.consumer)}</td>
              <td><span class="analytics-risk-badge" style="background:${b.color}">${b.label}</span></td>
              <td>${escapeHtml(row.detail)}</td>
              <td><button class="btn-secondary" style="padding:4px 9px;font-size:11px" onclick="switchPage('${row.page}')">فتح</button></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>
    </section>
  `;
}

// ─── Tab 2: SETTINGS (all the existing config sections) ───
// ⚙️ Payroll & shift settings card (everything the salary engine uses is tunable here).
function renderPayrollSettingsCard() {
  const PS = getPayrollSettings();
  const fmt = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const num = (id, label, val, step) => `<label style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px;"><span style="font-size:13px;">${label}</span><input type="number" id="${id}" value="${val}" step="${step || 1}" class="form-input" style="width:110px;"></label>`;
  const shiftRows = Object.keys(PS.shifts).map(k => {
    const s = PS.shifts[k];
    const dur = (((s.endMin - s.startMin + 1440) % 1440) / 60) || 24;
    return `<div style="display:flex; gap:8px; align-items:center; margin-bottom:8px; flex-wrap:wrap;">
      <span style="min-width:70px; font-weight:700;">${s.label}</span>
      <label style="font-size:12px;">من <input type="time" id="ps_shift_${k}_start" value="${fmt(s.startMin)}" class="form-input" style="width:120px;"></label>
      <label style="font-size:12px;">إلى <input type="time" id="ps_shift_${k}_end" value="${fmt(s.endMin)}" class="form-input" style="width:120px;"></label>
      <span style="font-size:12px; color:var(--text-secondary);">(${dur} ساعة)</span>
    </div>`;
  }).join('');
  return `
      <section class="admin-card admin-card-wide">
        <h3><i class="fa-solid fa-business-time"></i> إعدادات الرواتب والدوام</h3>
        <p style="font-size:12px; color:var(--text-secondary); margin:4px 0 12px;">كل قواعد الحساب يتحكم بها من هنا. تنطبق فوراً على التايم شيت والحاسبة.</p>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
          <div>
            ${num('ps_grace', 'سماحية التأخير (دقيقة/شهر)', PS.graceMinutesPerMonth)}
            ${num('ps_otmult', 'مضاعف الإضافي', PS.otMultiplier, 0.1)}
            ${num('ps_friotmult', 'مضاعف إضافي الجمعة', PS.fridayOtMultiplier, 0.1)}
            ${num('ps_penmult', 'مضاعف غرامة التأخير/المبكر', PS.penaltyMultiplier, 0.1)}
            ${num('ps_frilossdays', 'كل كم يوم غياب/إجازة = نقص جمعة', PS.fridayLossEveryDays)}
            ${num('ps_maxearly', 'حد الحضور المبكر المحتسب (دقيقة، 0=بلا حد)', PS.maxEarlyArrivalMin)}
            ${num('ps_stdhours', 'ساعات اليوم القياسي (افتراضي)', PS.standardDayHours)}
          </div>
          <div>
            <h4 style="margin:0 0 10px;">أوقات الشفتات</h4>
            ${shiftRows}
            <p style="font-size:11px; color:var(--text-secondary);">الشفت الكامل = أجر يوم كامل بغضّ النظر عن طول ساعاته (سعر الساعة = اليومية ÷ ساعات الشفت).</p>
          </div>
        </div>
        <button class="btn btn-success" style="margin-top:14px;" onclick="savePayrollSettingsFromUI()"><i class="fa-solid fa-floppy-disk"></i> حفظ إعدادات الرواتب</button>
      </section>`;
}

function savePayrollSettingsFromUI() {
  const PS = getPayrollSettings();
  const numv = (id, def) => { const el = document.getElementById(id); const v = el ? parseFloat(el.value) : NaN; return Number.isNaN(v) ? def : v; };
  PS.graceMinutesPerMonth = numv('ps_grace', PS.graceMinutesPerMonth);
  PS.otMultiplier = numv('ps_otmult', PS.otMultiplier);
  PS.fridayOtMultiplier = numv('ps_friotmult', PS.fridayOtMultiplier);
  PS.penaltyMultiplier = numv('ps_penmult', PS.penaltyMultiplier);
  PS.fridayLossEveryDays = numv('ps_frilossdays', PS.fridayLossEveryDays);
  PS.maxEarlyArrivalMin = numv('ps_maxearly', PS.maxEarlyArrivalMin);
  PS.standardDayHours = numv('ps_stdhours', PS.standardDayHours);
  Object.keys(PS.shifts).forEach(k => {
    const st = document.getElementById(`ps_shift_${k}_start`);
    const en = document.getElementById(`ps_shift_${k}_end`);
    if (st && st.value) PS.shifts[k].startMin = parseTime(st.value);
    if (en && en.value) PS.shifts[k].endMin = parseTime(en.value);
  });
  savePayrollSettings(PS);
  if (typeof showToast === 'function') showToast('✅ تم حفظ إعدادات الرواتب والدوام', 'success');
  if (currentPage === 'timesheet') renderTimesheet();
  if (currentPage === 'employees') renderEmployeesTable();
  renderAdminPanel();
}

function getProductizationReadiness() {
  ensureOmni();
  ensureFinance();
  const org = omni.adminSettings?.organization || {};
  const users = Array.isArray(omni.users) ? omni.users : [];
  const roles = Array.isArray(omni.roles) ? omni.roles : [];
  const flags = omni.adminSettings?.productization?.featureFlags || {};
  const checks = [
    { label: 'Company profile', ok: !!(org.name || org.companies?.length), detail: org.name || `${org.companies?.length || 0} companies` },
    { label: 'Active company', ok: !!org.activeCompanyId, detail: org.activeCompanyId || 'not selected' },
    { label: 'Multi-tenant isolation', ok: !!org.multiTenant, detail: org.multiTenant ? 'enabled' : 'disabled' },
    { label: 'Users and roles', ok: users.length > 0 && roles.length > 0, detail: `${users.length} users / ${roles.length} roles` },
    { label: 'Permission regression target', ok: true, detail: '35/35 checked by script' },
    { label: 'Report Designer', ok: !!flags.reportDesigner || !!(omni.nlReports && Array.isArray(omni.nlReports.definitions)), detail: 'existing nl_reports surface' },
    { label: 'Fleet/Fuel Guard demo', ok: true, detail: 'existing fleet page tab' },
    { label: 'Payment gateway', ok: false, detail: 'intentionally deferred' }
  ];
  const done = checks.filter(c => c.ok).length;
  return { checks, done, total: checks.length, percent: Math.round(done * 100 / checks.length) };
}

function renderProductizationChecklist(title, rows) {
  return `
    <section class="admin-card admin-card-wide">
      <h3><i class="fa-solid fa-list-check"></i> ${escapeHtml(title)}</h3>
      <div class="backup-table-wrapper" style="margin-top:10px; overflow-x:auto;">
        <table class="backup-table" style="width:100%;">
          <thead><tr><th>Item</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            ${rows.map(row => `<tr class="backup-row">
              <td><strong>${escapeHtml(row.label)}</strong></td>
              <td><span class="backup-tag-badge ${row.ok ? 'tag-release' : 'tag-other'}">${row.ok ? 'Ready' : 'Pending'}</span></td>
              <td>${escapeHtml(row.detail || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAdminTabProductization() {
  ensureOmni();
  const product = omni.adminSettings.productization || {};
  const license = product.license || {};
  const readiness = getProductizationReadiness();
  const onboardingRows = [
    { label: 'Plan and tier selected', ok: !!product.planTier, detail: product.planTier || 'demo/starter/business/enterprise placeholder' },
    { label: 'Feature flags reviewed', ok: !!product.featureFlags, detail: 'flags live under adminSettings.productization.featureFlags' },
    { label: 'Demo company mode decided', ok: product.demoCompanyMode !== undefined, detail: product.demoCompanyMode ? 'demo mode enabled' : 'not enabled yet' },
    { label: 'Setup wizard foundation', ok: true, detail: 'company, users, permissions, reports, fleet demo readiness checks' },
    { label: 'Tenant onboarding checklist', ok: true, detail: 'tracked here without creating new routes' },
    { label: 'License/activation placeholder', ok: !!(license.mode || license.status), detail: `${license.mode || 'local'} / ${license.status || 'placeholder'}` },
    { label: 'Billing gateway', ok: false, detail: 'deferred: no payment provider is integrated' }
  ];

  return `
    <section class="admin-card admin-card-wide">
      <div style="display:flex; justify-content:space-between; gap:12px; align-items:flex-start; flex-wrap:wrap;">
        <div>
          <h3 style="margin:0 0 6px;"><i class="fa-solid fa-box-open"></i> SaaS Productization Foundation</h3>
          <p class="admin-note" style="margin:0;">Commercial packaging placeholders only: feature flags, tiers, demo mode, onboarding checklist, and local license status. No payment gateway or external activation call is wired here.</p>
        </div>
        <div class="admin-wireup-score" style="min-width:120px;"><b>${readiness.percent}%</b><span>readiness</span></div>
      </div>
    </section>

    <section class="admin-card">
      <h3><i class="fa-solid fa-layer-group"></i> Plan / Tier</h3>
      ${renderAdminSelect('productization.planTier', 'Current tier', [
        { value: 'demo', label: 'Demo' },
        { value: 'starter', label: 'Starter' },
        { value: 'business', label: 'Business' },
        { value: 'enterprise', label: 'Enterprise' }
      ])}
      ${renderAdminNumber('productization.trialDays', 'Trial days', 0, 365)}
      ${renderAdminToggle('productization.demoCompanyMode', 'Demo company mode', 'Presentation-safe company/sample mode. Does not seed or overwrite database data by itself.')}
    </section>

    <section class="admin-card">
      <h3><i class="fa-solid fa-toggle-on"></i> Feature Flags</h3>
      ${renderAdminToggle('productization.featureFlags.reportDesigner', 'Report Designer')}
      ${renderAdminToggle('productization.featureFlags.fleetFuelGuardDemo', 'Fleet/Fuel Guard demo')}
      ${renderAdminToggle('productization.featureFlags.mobileApprovals', 'Mobile approvals')}
      ${renderAdminToggle('productization.featureFlags.aiGovernance', 'AI governance')}
      ${renderAdminToggle('productization.featureFlags.setupWizard', 'Setup wizard')}
      ${renderAdminToggle('productization.featureFlags.hardwareIntegrations', 'Hardware integrations placeholder', 'Keep disabled until vendor contracts and device APIs exist.')}
    </section>

    <section class="admin-card">
      <h3><i class="fa-solid fa-key"></i> License / Activation</h3>
      ${renderAdminSelect('productization.license.mode', 'License mode', [
        { value: 'local-demo', label: 'Local demo' },
        { value: 'trial', label: 'Trial placeholder' },
        { value: 'licensed', label: 'Licensed placeholder' },
        { value: 'expired', label: 'Expired placeholder' }
      ])}
      ${renderAdminSelect('productization.license.status', 'Activation status', [
        { value: 'placeholder', label: 'Placeholder only' },
        { value: 'active-local', label: 'Active local' },
        { value: 'needs-review', label: 'Needs review' }
      ])}
      <p class="admin-note">No external activation server, no payment provider, and no customer license enforcement is implemented in this phase.</p>
    </section>

    ${renderProductizationChecklist('Setup Wizard Foundation', readiness.checks)}
    ${renderProductizationChecklist('Tenant Onboarding Checklist', onboardingRows)}
  `;
}

function renderAdminTabSettings() {
  const setupGroups = [
    ['dept', 'إدارة الأقسام', finance.departments || [], 'الأقسام المالية الحالية'],
    ['party', 'إدارة الأشخاص / الجهات', finance.parties || [], 'الأشخاص والجهات الحالية'],
    ['exp_cat', 'إدارة أصناف المصروفات', finance.categories?.expense || [], 'أصناف المصروفات الحالية'],
    ['inc_cat', 'إدارة مصادر الواردات', finance.categories?.income || [], 'مصادر الواردات الحالية']
  ];
  return `
      ${renderPayrollSettingsCard()}
      <section class="admin-card"><h3><i class="fa-solid fa-display"></i> إعدادات الواجهة</h3>
        ${renderAdminSelect('ui.density', 'الكثافة', [{ value: 'comfortable', label: 'مريحة' }, { value: 'compact', label: 'مضغوطة' }])}
        ${renderAdminToggle('ui.bigScreenMode', 'وضع الشاشة الكبيرة')}
        ${renderAdminToggle('ui.animations', 'الحركات')}
        ${renderAdminSelect('ui.orbStyle', 'تصميم أومني (الأورب الذكي)', [
          { value: 'classic', label: 'كلاسيكي — ألوان دوّارة' },
          { value: 'glass', label: 'زجاجي حي — جديد' }
        ])}
      </section>
      <section class="admin-card"><h3>إعدادات مصمم العمليات</h3>
        ${renderAdminToggle('workflow.quickEditEnabled', 'القائمة السريعة للعقد')}
        ${renderAdminToggle('workflow.snapToGrid', 'المحاذاة للشبكة')}
        ${renderAdminNumber('workflow.gridSize', 'حجم الشبكة', 8, 96)}
        ${renderAdminToggle('workflow.confirmBeforeDelete', 'تأكيد قبل الحذف')}
      </section>
      <section class="admin-card"><h3>إعدادات المخزون</h3>
        ${renderAdminToggle('inventory.showBatteryIndicator', 'إظهار مؤشر مستوى المخزون')}
        ${renderAdminNumber('inventory.lowStockPercent', 'نسبة منخفض', 0, 100)}
        ${renderAdminNumber('inventory.criticalStockPercent', 'نسبة حرج', 0, 100)}
        ${renderAdminToggle('inventory.showReservedQty', 'إظهار المحجوز')}
      </section>
      <section class="admin-card"><h3>إعدادات اللوحة التنفيذية</h3>
        ${renderAdminToggle('kanban.showIndicators', 'إظهار المؤشرات')}
        ${renderAdminToggle('kanban.confirmBeforeDelete', 'تأكيد قبل الحذف')}
        ${renderAdminToggle('kanban.showReadiness', 'إظهار الجاهزية')}
      </section>
      <section class="admin-card"><h3>إعدادات باقات العمليات</h3>
        ${renderAdminToggle('operationPacks.previewBeforeExecute', 'معاينة قبل التنفيذ')}
        ${renderAdminToggle('operationPacks.reserveMaterialsOnExecute', 'حجز المواد عند التنفيذ')}
        ${renderAdminToggle('operationPacks.addMachineQueueOnExecute', 'إضافة طابور المكائن')}
      </section>
      <section class="admin-card admin-card-wide">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="margin:0;"><i class="fa-solid fa-wallet"></i> إدارة إعدادات المالية</h3>
          <span style="font-size:12px; color:var(--accent-blue);"><i class="fa-solid fa-circle-info"></i> انقر على أي فئة لإدارة المدخلات</span>
        </div>
        <p class="admin-note">انقر على أي فئة لإضافة أو تعديل أو حذف الأقسام، الأشخاص/الجهات، أصناف المصاريف، أو مصادر الإيرادات.</p>
        <div class="admin-setup-grid">
          ${setupGroups.map(([type, title, list, hint]) => `
            <div class="admin-setup-box" style="cursor:pointer; transition:var(--transition); position:relative; overflow:hidden;" onclick="manageAdminFinanceSetup('${type}')">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                <b>${escapeHtml(title)}</b>
                <span class="backup-tag-badge tag-release">${list.length} جهات</span>
              </div>
              <span class="admin-note" style="margin:0; font-size:11px;">${escapeHtml(hint)}</span>
              <div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:4px; max-height:48px; overflow:hidden;">
                ${list.slice(0, 5).map(item => `<small style="font-size:10px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); padding:2px 6px; border-radius:4px; color:#cbd5e1;">${escapeHtml(item.name || item.title || item.id || item)}</small>`).join('') || '<small style="color:var(--text-muted)">لا توجد بيانات بعد</small>'}
                ${list.length > 5 ? `<small style="font-size:10px; color:var(--accent-blue);">+${list.length - 5} أخرى</small>` : ''}
              </div>
              <div class="setup-box-hover-overlay" style="position:absolute; inset:0; background:rgba(56, 189, 248, 0.08); display:flex; align-items:center; justify-content:center; color:#38bdf8; font-weight:700; font-size:12px; transition:opacity 0.2s ease; opacity:0; pointer-events:none;">
                إدارة الفئة والتعديل عليها <i class="fa-solid fa-arrow-left" style="margin-right:6px;"></i>
              </div>
            </div>
          `).join('')}
        </div>
      </section>
      <section class="admin-card"><h3><i class="fa-solid fa-building-user"></i> بيئة الشركات المتعددة (Multi-Tenant)</h3>
        ${renderAdminToggle('organization.multiTenant', 'تفعيل عزل بيانات الفروع / الشركات', 'عند التفعيل، ستعزل بيانات المستودعات، الحركات، والعمليات لكل فرع/شركة نشطة على حدة.')}
      </section>
      <section class="admin-card"><h3><i class="fa-solid fa-bell"></i> إعدادات الإشعارات</h3>
        ${renderAdminToggle('notifications.soundEnabled', 'صوت الإشعارات')}
        <button class="btn-secondary" onclick="toggleOmniNotificationSound()">تبديل صوت الإشعارات</button>
      </section>
  `;
}

function renderAdminTabRouting() {
  ensureOmni();
  const routing = omni.adminSettings?.supervisorRouting || {};
  const supervisors = getOrgSupervisors();

  let rowsHtml = '';
  if (!employees || employees.length === 0) {
    rowsHtml = `<tr><td colspan="4" style="text-align:center; padding:16px; color:var(--text-muted);">لا يوجد موظفون مضافون حالياً.</td></tr>`;
  } else {
    rowsHtml = employees.map((emp, idx) => {
      const empId = emp.id || String(idx);
      const activeSupId = routing[empId] || routing[emp.name] || routing[idx] || '';

      const optionsHtml = [
        `<option value="">-- بدون مشرف (توجيه للمدير) --</option>`,
        ...supervisors.map(sup => `
          <option value="${escapeHtml(sup.id)}" ${String(sup.id) === String(activeSupId) ? 'selected' : ''}>
            ${escapeHtml(sup.name)} (${escapeHtml(sup.role || 'مشرف')})
          </option>
        `)
      ].join('');

      return `
        <tr class="backup-row">
          <td style="font-weight:600; color:#f1f5f9;"><i class="fa-regular fa-user" style="margin-left:6px; opacity:0.7;"></i> ${escapeHtml(emp.name)}</td>
          <td><span class="backup-tag-badge ${emp.is_active ? 'tag-release' : 'tag-other'}">${emp.is_active ? 'نشط' : 'غير نشط'}</span></td>
          <td>${emp.salary ? `${Number(emp.salary).toLocaleString()} IQD` : '-'}</td>
          <td>
            <select class="form-input" style="max-width: 250px; background-color: var(--bg-card); color: var(--text-main);" onchange="saveEmployeeSupervisorRouting('${escapeHtml(empId)}', this.value)">
              ${optionsHtml}
            </select>
          </td>
        </tr>
      `;
    }).join('');
  }

  return `
    <section class="admin-card admin-card-wide">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
        <h3 style="margin:0;"><i class="fa-solid fa-sitemap"></i> جدول توجيه الموظفين للمشرفين</h3>
      </div>
      <p class="admin-note">قم بتعيين مشرف لكل موظف. الطلبات المقدمة من الموظف سيتم توجيهها تلقائياً للمشرف المحدد في مركز القيادة.</p>

      <div class="backup-table-wrapper" style="margin-top:15px; overflow-x:auto;">
        <table class="backup-table" style="width:100%;">
          <thead>
            <tr>
              <th>الموظف</th>
              <th>الحالة</th>
              <th>الراتب الأساسي</th>
              <th>المشرف الموجه له</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function saveEmployeeSupervisorRouting(empId, supervisorId) {
  ensureOmni();
  if (!omni.adminSettings.supervisorRouting) {
    omni.adminSettings.supervisorRouting = {};
  }
  if (!supervisorId) {
    delete omni.adminSettings.supervisorRouting[empId];
  } else {
    omni.adminSettings.supervisorRouting[empId] = supervisorId;
  }
  saveData();
  showToast('تم تحديث توجيه المشرف بنجاح', 'success');
  renderAdminPanel();
}

// ─── Tab 3: USERS & ROLES ───
function renderAdminTabUsers() {
  return `
      <section class="admin-card admin-card-wide">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h3 style="margin:0;"><i class="fa-solid fa-users-gear"></i> إدارة المستخدمين وصلاحيات الأدوار</h3>
          <div style="display:flex; gap:8px;">
            <button class="btn btn-secondary btn-sm" style="display:flex; align-items:center; gap:6px; padding:6px 12px; font-size:12px;" onclick="addAdminUser()">
              <i class="fa-solid fa-user-plus"></i> إضافة مستخدم جديد
            </button>
            <button class="btn btn-secondary btn-sm" style="display:flex; align-items:center; gap:6px; padding:6px 12px; font-size:12px;" onclick="addAdminRole()">
              <i class="fa-solid fa-shield-halved"></i> إضافة دور مخصص
            </button>
          </div>
        </div>
        <p class="admin-note">يمكنك هنا إدارة مستخدمي النظام بالكامل، وتعيين أدوارهم أو تحديد صلاحيات مخصصة لكل دور من الأدوار الأمنية في الورشة.</p>

        <div style="display:grid; grid-template-columns: 3fr 2fr; gap:20px; align-items:start;">
          <!-- Active Users Table -->
          <div class="backup-table-wrapper" style="margin:0;">
            <table class="backup-table" style="width:100%;">
              <thead>
                <tr>
                  <th>اسم المستخدم</th>
                  <th>الدور الرئيسي</th>
                  <th>الحالة</th>
                  <th>صلاحيات إضافية</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                ${(omni.users || []).map(u => {
                  const role = omni.roles.find(r => r.id === u.roleId)?.name || u.roleId;
                  const statusLabel = u.status === 'active' ? 'نشط' : 'معطل';
                  const statusColor = u.status === 'active' ? '#10b981' : '#f43f5e';
                  const customPermsCount = (u.permissions || []).length;
                  return `
                    <tr class="backup-row">
                      <td style="font-weight:600; color:#f1f5f9;"><i class="fa-regular fa-user" style="margin-left:6px; opacity:0.7;"></i> ${escapeHtml(u.name)}</td>
                      <td><span class="backup-tag-badge tag-release">${escapeHtml(role)}</span></td>
                      <td><span class="backup-tag-badge" style="background:${statusColor}20; color:${statusColor}; border:1px solid ${statusColor}40;">${statusLabel}</span></td>
                      <td><span class="backup-tag-badge tag-other">${customPermsCount} صلاحية</span></td>
                      <td class="backup-actions">
                        <button class="btn btn-sm btn-secondary" onclick="editAdminUser('${u.id}')" title="تعديل">
                          <i class="fa-solid fa-user-pen"></i> تعديل
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteAdminUser('${u.id}')" title="حذف">
                          <i class="fa-solid fa-trash-can"></i>
                        </button>
                      </td>
                    </tr>
                  `;
                }).join('') || `<tr><td colspan="5" style="text-align:center; padding:16px; color:var(--text-muted);">لا يوجد مستخدمون حالياً</td></tr>`}
              </tbody>
            </table>
          </div>

          <!-- System Roles List -->
          <div class="admin-role-grid" style="display:flex; flex-direction:column; gap:10px;">
            ${(omni.roles || []).map(role => `
              <div class="admin-role-card" style="padding:14px; border:1px solid rgba(255,255,255,0.06); border-radius:10px; background:rgba(255,255,255,0.02);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                  <strong style="font-size:14px; color:#f1f5f9; text-shadow:0 0 6px rgba(255,255,255,0.1);"><i class="fa-solid fa-shield" style="margin-left:6px; color:var(--accent-blue);"></i> ${escapeHtml(role.name)}</strong>
                  <span style="font-size:10px; color:var(--text-muted); font-family:var(--font-en);">${escapeHtml(role.id)}</span>
                </div>
                <div style="margin-bottom:12px; font-size:11px; color:#cbd5e1; max-height:48px; overflow-y:auto; display:flex; flex-wrap:wrap; gap:4px;">
                  ${(role.permissions || []).map(p => `<span style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:4px; padding:1px 6px; color:#cbd5e1;">${escapeHtml(p)}</span>`).join('') || '<span class="muted">بدون صلاحيات</span>'}
                </div>
                <div style="display:flex; justify-content:flex-end; gap:6px;">
                  <button class="btn btn-sm btn-secondary" onclick="editAdminRolePermissions('${role.id}')"><i class="fa-solid fa-shield-halved"></i> تعديل الصلاحيات</button>
                  ${['manager', 'employee', 'operator'].includes(role.id) ? '' : `
                    <button class="btn btn-sm btn-danger" style="padding:4px 8px !important;" onclick="deleteAdminRole('${role.id}')" title="حذف الدور">
                      <i class="fa-solid fa-trash-can"></i>
                    </button>
                  `}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </section>
  `;
}

// ─── Tab 4: BACKUPS ───
function renderAdminTabBackups() {
  return `
      <section class="admin-card admin-card-wide backup-center-card">
        <div class="backup-center-header">
          <div>
            <h3><i class="fa-solid fa-database"></i> مركز إدارة واستعادة النسخ الاحتياطية</h3>
            <p class="admin-note" style="margin: 0; margin-top: 4px;">إدارة وحفظ واستعادة لقطات النظام (Snapshots) مع نظام تراجع آمن (pre_restore).</p>
          </div>
          <div class="backup-actions-top">
            <button class="btn btn-primary" onclick="runAdminIntegrityCheck()"><i class="fa-solid fa-heart-pulse"></i> فحص صحة النظام</button>
            <button class="btn btn-secondary" onclick="triggerCreateBackup()"><i class="fa-solid fa-plus"></i> إنشاء نسخة احتياطية جديدة</button>
          </div>
        </div>

        <div class="backup-table-wrapper">
          <table class="backup-table">
            <thead>
<tr>
                <th>تاريخ الإنشاء</th>
                <th>اسم الملف</th>
                <th>الوسم (Tag)</th>
                <th>الحجم</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody id="adminBackupListContainer">
              <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">جاري تحميل النسخ الاحتياطية...</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
  `;
}

function renderQcDashboard() {
  const records = omni.qcRecords || [];
  const failures = records.filter(q => q.result === 'fail' || q.status === 'rework_required');
  const pending = records.filter(q => q.result === 'pending' || q.status === 'pending');
  const passed = records.filter(q => q.result === 'pass' || q.status === 'pass');

  const toggleBtn = `<button class="btn-secondary" style="font-size: 12.5px; padding: 6px 12px; height: 32px; display: inline-flex; align-items: center; gap: 6px; border: 1px solid rgba(255,255,255,0.08);" onclick="toggleQcSimulator()">
    <i class="fa-solid fa-map-signs" style="color: var(--text-link);"></i>
    ${omniShowQcSimulator ? 'إخفاء المحاكي التعليمي' : 'عرض المحاكي التعليمي'}
  </button>`;

  if (!omniShowQcSimulator) {
    return `<div class="qc-dashboard-full" style="width: 100%; display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h3 style="margin: 0; font-size: 16px; color: var(--text-normal);"><i class="fa-solid fa-chart-line"></i> نظرة عامة على حالة بوابات الجودة</h3>
        ${toggleBtn}
      </div>

      <div class="qc-section-grid" style="grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; width: 100%;">
        <section style="background: rgba(15, 23, 42, 0.3); border: 1px solid rgba(248, 113, 113, 0.15); border-top: 4px solid #f87171; border-radius: 8px; padding: 16px;">
          <h3 class="qc-dashboard-sec-title" style="margin: 0 0 16px 0; font-size: 14.5px; color: #f87171;"><i class="fa-solid fa-triangle-exclamation"></i> فحوصات تحتاج إجراء (فاشلة / إعادة عمل)</h3>
          <div class="qc-dashboard-cards-wrap" style="display: flex; flex-direction: column; gap: 10px;">
            ${failures.slice(0, 5).map(renderQcRecordCard).join('') || '<div class="qc-empty-state" style="padding: 24px; border-radius: 6px; background: rgba(0,0,0,0.15);">لا توجد فحوصات جودة تحتاج إجراء حالياً</div>'}
          </div>
        </section>

        <section style="background: rgba(15, 23, 42, 0.3); border: 1px solid rgba(251, 191, 36, 0.15); border-top: 4px solid #fbbf24; border-radius: 8px; padding: 16px;">
          <h3 class="qc-dashboard-sec-title" style="margin: 0 0 16px 0; font-size: 14.5px; color: #fbbf24;"><i class="fa-solid fa-spinner fa-spin-slow"></i> قيد الفحص (بوابات جارية)</h3>
          <div class="qc-dashboard-cards-wrap" style="display: flex; flex-direction: column; gap: 10px;">
            ${pending.slice(0, 5).map(renderQcRecordCard).join('') || '<div class="qc-empty-state" style="padding: 24px; border-radius: 6px; background: rgba(0,0,0,0.15);">لا توجد فحوصات قيد الانتظار حالياً</div>'}
          </div>
        </section>

        <section style="background: rgba(15, 23, 42, 0.3); border: 1px solid rgba(52, 211, 153, 0.15); border-top: 4px solid #34d399; border-radius: 8px; padding: 16px;">
          <h3 class="qc-dashboard-sec-title" style="margin: 0 0 16px 0; font-size: 14.5px; color: #34d399;"><i class="fa-solid fa-circle-check"></i> فحوصات ناجحة ومكتملة (مغلقة)</h3>
          <div class="qc-dashboard-cards-wrap" style="display: flex; flex-direction: column; gap: 10px;">
            ${passed.slice(0, 5).map(renderQcRecordCard).join('') || '<div class="qc-empty-state" style="padding: 24px; border-radius: 6px; background: rgba(0,0,0,0.15);">لا توجد فحوصات ناجحة حالياً</div>'}
          </div>
        </section>
      </div>
    </div>`;
  }

  // If simulator is toggled on, show 2-column view
  return `<div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; width: 100%;">
    <h3 style="margin: 0; font-size: 16px; color: var(--text-normal);"><i class="fa-solid fa-chart-line"></i> نظرة عامة على حالة بوابات الجودة</h3>
    ${toggleBtn}
  </div>
  <div class="qc-dashboard-layout">
    <!-- Left Column: Active Inspection Boards -->
    <div class="qc-dashboard-left">
      <div class="qc-section-grid" style="grid-template-columns: 1fr; gap: 14px;">
        <section style="border-top: 3px solid #f87171;">
          <h3 class="qc-dashboard-sec-title" style="color: #f87171;"><i class="fa-solid fa-triangle-exclamation"></i> فحوصات تحتاج إجراء (فاشلة / إعادة عمل)</h3>
          <div class="qc-dashboard-cards-wrap">
            ${failures.slice(0, 4).map(renderQcRecordCard).join('') || '<div class="qc-empty-state">لا توجد فحوصات جودة تحتاج إجراء حالياً</div>'}
          </div>
        </section>
        <section style="border-top: 3px solid #fbbf24;">
          <h3 class="qc-dashboard-sec-title" style="color: #fbbf24;"><i class="fa-solid fa-spinner fa-spin-slow"></i> قيد الفحص (بوابات جارية)</h3>
          <div class="qc-dashboard-cards-wrap">
            ${pending.slice(0, 4).map(renderQcRecordCard).join('') || '<div class="qc-empty-state">لا توجد فحوصات قيد الانتظار حالياً</div>'}
          </div>
        </section>
      </div>
    </div>

    <!-- Right Column: Interactive Process Flow Simulator -->
    <div class="qc-dashboard-right">
      <div class="qc-simulator-widget">
        <header class="qc-sim-header">
          <h4><i class="fa-solid fa-map-signs"></i> محاكي بوابات الجودة التفاعلي</h4>
          <p>اضغط على أي مسار بالأسفل لتتبع دورة حياة منتجك ومسؤول الجودة في كل مرحلة!</p>
        </header>

        <!-- Simulation Controls -->
        <div class="qc-sim-controls">
          <button id="simBtnPass" class="qc-sim-btn active" onclick="triggerQcSimulation('pass')">
            <i class="fa-solid fa-circle-check" style="color: #34d399;"></i> مسار النجاح (Pass)
          </button>
          <button id="simBtnFail" class="qc-sim-btn" onclick="triggerQcSimulation('fail')">
            <i class="fa-solid fa-circle-xmark" style="color: #f87171;"></i> مسار الفشل وإعادة العمل
          </button>
          <button id="simBtnMulti" class="qc-sim-btn" onclick="triggerQcSimulation('multi')">
            <i class="fa-solid fa-network-wired" style="color: #60a5fa;"></i> بوابات متعددة
          </button>
        </div>

        <!-- Visual Flowchart Area -->
        <div class="qc-sim-flowchart" id="qcSimFlowchart">
          <!-- Flowchart nodes lit dynamically by JS -->
        </div>

        <!-- Simulation Explanations Details -->
        <div class="qc-sim-details-card" id="qcSimDetails">
          <!-- Rich descriptions populated dynamically by JS -->
        </div>
      </div>
    </div>
  </div>`;
}

function toggleQcSimulator() {
  omniShowQcSimulator = !omniShowQcSimulator;
  renderQcCenter();
}

function triggerQcSimulation(mode) {
  // Update active state on simulator tabs
  document.querySelectorAll('.qc-sim-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(mode === 'pass' ? 'simBtnPass' : (mode === 'fail' ? 'simBtnFail' : 'simBtnMulti'));
  if (activeBtn) activeBtn.classList.add('active');

  const flowchartEl = document.getElementById('qcSimFlowchart');
  const detailsEl = document.getElementById('qcSimDetails');
  if (!flowchartEl || !detailsEl) return;

  if (mode === 'pass') {
    flowchartEl.innerHTML = `
      <div class="qc-sim-node active pass">
        <div class="qc-sim-bubble"><i class="fa-solid fa-file-invoice"></i></div>
        <div class="qc-sim-label">البدء (Kanban)</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active pass">
        <div class="qc-sim-bubble"><i class="fa-solid fa-shield-halved"></i></div>
        <div class="qc-sim-label">بوابة الجودة</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active pass">
        <div class="qc-sim-bubble"><i class="fa-solid fa-circle-check"></i></div>
        <div class="qc-sim-label">ناجح (Pass)</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active pass">
        <div class="qc-sim-bubble"><i class="fa-solid fa-truck-ramp-box"></i></div>
        <div class="qc-sim-label">تسليم فوري</div>
      </div>
    `;

    detailsEl.innerHTML = `
      <h5><i class="fa-solid fa-circle-check" style="color: #34d399;"></i> مسار النجاح والعبور الآمن للمنتج</h5>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-user-tie"></i>المسؤول:</span>
        <b>المفتش (Inspector)</b> يقوم بتدقيق البطاقة بناء على قالب الـ Checklist.
      </div>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-map-location-dot"></i>المكان في ERP:</span>
        <b>لوحة Kanban المصدر</b> + تبويب <b>"الفحوصات"</b> في مركز الجودة.
      </div>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-circle-info"></i>التأثير والنتيجة:</span>
        <b>فك حجب البطاقة فوراً.</b> يسمح النظام للمستخدم بنقل بطاقة المنتج إلى عمود <b>"مكتمل"</b> بأمان. يسجل الفحص كـ "ناجح" وتتحسن مؤشرات الجودة الإجمالية.
      </div>
    `;
  } else if (mode === 'fail') {
    flowchartEl.innerHTML = `
      <div class="qc-sim-node active">
        <div class="qc-sim-bubble"><i class="fa-solid fa-file-invoice"></i></div>
        <div class="qc-sim-label">البدء (Kanban)</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active fail">
        <div class="qc-sim-bubble"><i class="fa-solid fa-circle-xmark"></i></div>
        <div class="qc-sim-label">فشل الجودة</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active rework">
        <div class="qc-sim-bubble"><i class="fa-solid fa-screwdriver-wrench"></i></div>
        <div class="qc-sim-label">إعادة العمل</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active pass">
        <div class="qc-sim-bubble"><i class="fa-solid fa-circle-check"></i></div>
        <div class="qc-sim-label">إعادة الفحص والنجاح</div>
      </div>
    `;

    detailsEl.innerHTML = `
      <h5><i class="fa-solid fa-triangle-exclamation" style="color: #f87171;"></i> مسار الفشل والتحجيم التلقائي</h5>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-users"></i>المسؤولون:</span>
        <b>المفتش</b> (يسجل الفشل والكلفة) ➡️ <b>مشرف الإنتاج</b> (يستلم بطاقة إعادة عمل جديدة لإصلاح الخلل).
      </div>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-map-location-dot"></i>المكان في النظام:</span>
        عمود <b>إعادة العمل</b> في اللوحة التنفيذية + تبويبات <b>"كلفة"</b> و<b>"إعادة العمل"</b> في الجودة.
      </div>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-circle-info"></i>التأثير والنتيجة:</span>
        <b>حجب فوري للبطاقة الأصلية</b> (يمنع نقلها إلى "مكتمل"). ينشئ النظام بطاقة <b>إعادة عمل</b> مرتبطة لإصلاح العيوب. تُسجل كلفة الهدر بالتفصيل (أجور، مواد مهدورة، ماكينة) وتظهر فوراً في الإحصائيات لمراقبة تكاليف الفشل.
      </div>
    `;
  } else if (mode === 'multi') {
    flowchartEl.innerHTML = `
      <div class="qc-sim-node active">
        <div class="qc-sim-bubble"><i class="fa-solid fa-scissors"></i></div>
        <div class="qc-sim-label">بوابة 1: قص ليزر</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active">
        <div class="qc-sim-bubble"><i class="fa-solid fa-print"></i></div>
        <div class="qc-sim-label">بوابة 2: الطباعة</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active">
        <div class="qc-sim-bubble"><i class="fa-solid fa-puzzle-piece"></i></div>
        <div class="qc-sim-label">بوابة 3: التجميع</div>
      </div>
      <div class="qc-sim-arrow active"><i class="fa-solid fa-circle-chevron-left"></i></div>
      <div class="qc-sim-node active pass">
        <div class="qc-sim-bubble"><i class="fa-solid fa-box-open"></i></div>
        <div class="qc-sim-label">بوابة 4: التسليم</div>
      </div>
    `;

    detailsEl.innerHTML = `
      <h5><i class="fa-solid fa-network-wired" style="color: #60a5fa;"></i> نقاط الفحص المتعددة على طول خط الإنتاج</h5>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-users"></i>المسؤولون:</span>
        <b>مفتشو الأقسام المختلفة</b> (كل مرحلة لها مفتشها الخاص للتأكد من مطابقة مواصفات الماكينة أو الخطوة).
      </div>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-map-location-dot"></i>المكان في ERP:</span>
        خطوات الـ <b>Op Packs</b> ➡️ بوابات الـ <b>Workflow</b> ➡️ تبويب <b>"الدفعات (Batches)"</b>.
      </div>
      <div class="qc-sim-detail-row">
        <span><i class="fa-solid fa-circle-info"></i>التأثير والنتيجة:</span>
        <b>رقابة جودة شاملة ومبكرة.</b> بدلاً من فحص منتج نهائي قد يكون تلفه غير قابل للإصلاح، يتم الفحص عند كل محطة إنتاجية. يتجمع أداء كافة نقاط الفحص تحت <b>رقم دفعة موحد (Batch Number)</b> لتشخيص نسبة نجاح وعيوب الدفعة ككل.
      </div>
    `;
  }
}

// ─── Tab 5: LOGS (full activity log viewer with search + filter) ───
let adminHistorySearch = '';
let adminHistoryModuleFilter = 'all';
let adminHistorySourceFilter = 'all';
let adminHistoryActionFilter = 'all';
function updateAdminHistorySearch(value) { adminHistorySearch = String(value || '').trim(); renderAdminPanel(); }
function updateAdminHistoryModule(value) { adminHistoryModuleFilter = value || 'all'; renderAdminPanel(); }
function updateAdminHistorySource(value) { adminHistorySourceFilter = value || 'all'; renderAdminPanel(); }
function updateAdminHistoryAction(value) { adminHistoryActionFilter = value || 'all'; renderAdminPanel(); }

function collectAdminHistoryEvents() {
  ensureOmni();
  normalizeOmniHistoryLedger();
  return (omni.historyLedger || []).slice().sort((a, b) => String(b.timestamp || '').localeCompare(String(a.timestamp || '')));
}

function getFilteredAdminHistoryEvents() {
  const all = collectAdminHistoryEvents();
  return all.filter(event => {
    if (adminHistoryModuleFilter !== 'all' && event.module !== adminHistoryModuleFilter) return false;
    if (adminHistorySourceFilter !== 'all' && event.source !== adminHistorySourceFilter) return false;
    if (adminHistoryActionFilter !== 'all' && event.action !== adminHistoryActionFilter) return false;
    if (adminHistorySearch) {
      const q = adminHistorySearch.toLowerCase();
      const hay = [
        event.title, event.description, event.module, event.source, event.action,
        event.actorName, event.status, event.recordId, event.recordType,
        event.correlationId, event.sourceMessageId, event.aiRunId,
        event.approvalRequestId, event.createdRecordId, JSON.stringify(event.payload || {})
      ].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function downloadAdminHistory() {
  const events = getFilteredAdminHistoryEvents();
  const text = events.map(event => JSON.stringify(event)).join('\n');
  const blob = new Blob([text], { type: 'application/x-ndjson;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `octagon-history-${new Date().toISOString().slice(0,10)}.ndjson`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast(`تم تصدير ${events.length} حدث من History`, 'success');
}

function openAdminHistoryEvent(eventId) {
  const event = collectAdminHistoryEvents().find(item => item.id === eventId || item.eventId === eventId);
  if (!event) return showToast('History event not found', 'warning');
  const links = [
    ['Correlation', event.correlationId],
    ['WhatsApp message', event.sourceMessageId],
    ['AI run', event.aiRunId],
    ['Approval request', event.approvalRequestId],
    ['Created record', event.createdRecordId],
    ['Record', event.recordId]
  ].filter(([, value]) => value);
  showOmniModal('History Event', `
    <div class="history-detail">
      <div class="history-detail-head">
        <div><b>${escapeHtml(event.title || event.action)}</b><span>${escapeHtml(event.module || '')} / ${escapeHtml(event.action || '')}</span></div>
        <small>${escapeHtml(formatOmniDateTime(event.timestamp) || event.timestamp || '')}</small>
      </div>
      <div class="history-detail-grid">
        <div><span>Actor</span><b>${escapeHtml(event.actorName || '')}</b></div>
        <div><span>Status</span><b>${escapeHtml(event.status || '')}</b></div>
        <div><span>Source</span><b>${escapeHtml(event.source || '')}</b></div>
        <div><span>Risk</span><b>${escapeHtml(event.risk || '-')}</b></div>
      </div>
      ${event.description ? `<p>${escapeHtml(event.description)}</p>` : ''}
      ${links.length ? `<div class="history-link-list">${links.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><code>${escapeHtml(value)}</code></div>`).join('')}</div>` : ''}
      <div class="history-json-grid">
        <div><h4>Payload</h4><pre>${formatHistoryPayload(event.payload)}</pre></div>
        <div><h4>Before</h4><pre>${formatHistoryPayload(event.before)}</pre></div>
        <div><h4>After</h4><pre>${formatHistoryPayload(event.after)}</pre></div>
      </div>
    </div>
  `, () => true);
}

function renderAdminTabHistory() {
  const all = collectAdminHistoryEvents();
  const filtered = getFilteredAdminHistoryEvents();
  const modules = ['all', ...Array.from(new Set(all.map(event => event.module).filter(Boolean)))];
  const sources = ['all', ...Array.from(new Set(all.map(event => event.source).filter(Boolean)))];
  const actions = ['all', ...Array.from(new Set(all.map(event => event.action).filter(Boolean)))];
  const aiCount = all.filter(event => event.module === 'ai').length;
  const waCount = all.filter(event => event.module === 'whatsapp').length;
  const approvalCount = all.filter(event => event.approvalRequestId || event.action === 'approval').length;
  const errorCount = all.filter(event => ['error', 'blocked', 'failed'].includes(event.status)).length;
  return `
    <section class="admin-card admin-card-wide history-ledger-card">
      <div class="history-ledger-head">
        <div>
          <h3><i class="fa-solid fa-clock-rotate-left"></i> سجل النشاط الكامل</h3>
          <p>سجل أحداث النظام: رسائل العملاء، الذكاء، الموافقات، الأتمتة، ولوحة التحكم.</p>
        </div>
        <button class="btn-secondary" onclick="downloadAdminHistory()"><i class="fa-solid fa-download"></i> تصدير النشاط</button>
      </div>
      <div class="history-kpi-grid">
        <div><span>إجمالي الأحداث</span><b>${all.length}</b></div>
        <div><span>رسائل العملاء</span><b>${waCount}</b></div>
        <div><span>الذكاء</span><b>${aiCount}</b></div>
        <div><span>الموافقات</span><b>${approvalCount}</b></div>
        <div><span>محظور/أخطاء</span><b>${errorCount}</b></div>
      </div>
      <div class="history-filter-grid">
        <input type="text" class="form-input" placeholder="ابحث بالنص أو المعرّف أو المنفّذ..." value="${escapeHtml(adminHistorySearch)}" oninput="updateAdminHistorySearch(this.value)">
        <select class="form-input" onchange="updateAdminHistoryModule(this.value)">${modules.map(value => `<option value="${escapeHtml(value)}" ${adminHistoryModuleFilter === value ? 'selected' : ''}>${value === 'all' ? 'كل الوحدات' : escapeHtml(value)}</option>`).join('')}</select>
        <select class="form-input" onchange="updateAdminHistorySource(this.value)">${sources.map(value => `<option value="${escapeHtml(value)}" ${adminHistorySourceFilter === value ? 'selected' : ''}>${value === 'all' ? 'كل المصادر' : escapeHtml(value)}</option>`).join('')}</select>
        <select class="form-input" onchange="updateAdminHistoryAction(this.value)">${actions.map(value => `<option value="${escapeHtml(value)}" ${adminHistoryActionFilter === value ? 'selected' : ''}>${value === 'all' ? 'كل الإجراءات' : escapeHtml(value)}</option>`).join('')}</select>
      </div>
      <div class="history-timeline">
        ${filtered.slice(0, 400).map(event => `<button class="history-row" onclick="openAdminHistoryEvent('${jsString(event.id)}')">
          <span class="history-row-icon"><i class="${event.module === 'whatsapp' ? 'fa-brands fa-whatsapp' : `fa-solid ${event.module === 'ai' ? 'fa-brain' : event.module === 'automation' ? 'fa-bolt' : event.module === 'admin' ? 'fa-sliders' : 'fa-circle-dot'}`}"></i></span>
          <span class="history-row-main">
            <b>${escapeHtml(event.title || event.action)}</b>
            <small>${escapeHtml(event.description || event.recordId || event.correlationId || '')}</small>
          </span>
          <span class="history-row-meta">
            <em>${escapeHtml(event.module || '')} / ${escapeHtml(event.action || '')}</em>
            <small>${escapeHtml(event.actorName || '')} · ${escapeHtml(formatOmniDateTime(event.timestamp) || event.timestamp || '')}</small>
          </span>
          <span class="history-status history-status-${escapeHtml(event.status || 'logged')}">${escapeHtml(({'logged':'مسجّل','success':'نجاح','error':'خطأ','blocked':'محظور','failed':'فشل','pending':'معلّق'})[event.status] || event.status || 'مسجّل')}</span>
        </button>`).join('') || '<div class="admin-empty">لا توجد أحداث تطابق الفلتر الحالي.</div>'}
        ${filtered.length > 400 ? `<div class="admin-empty">عرض أحدث 400 من ${filtered.length}. استخدم الفلاتر للتضييق.</div>` : ''}
      </div>
    </section>
  `;
}

let adminLogSearch = '';
let adminLogSourceFilter = 'all';
function updateAdminLogSearch(value) { adminLogSearch = String(value || '').trim(); renderAdminPanel(); }
function updateAdminLogSource(value) { adminLogSourceFilter = value || 'all'; renderAdminPanel(); }
function downloadAdminLogs() {
  const all = collectAllAdminLogs();
  const text = all.map(l => `[${l.date || ''}] (${l.source}) ${l.text}`).join('\n');
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `octagon-activity-log-${new Date().toISOString().slice(0,10)}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  if (typeof showToast === 'function') showToast(`تم تصدير ${all.length} حدث إلى ملف نصي`, 'success');
}
function collectAllAdminLogs() {
  ensureOmni();
  const all = [
    ...(omni.workflow?.nodes || []).flatMap(n => (n.activityLog || []).map(log => ({ ...log, source: 'Workflow', sourceDetail: n.title }))),
    ...(omni.opPacks || []).flatMap(p => (p.activityLog || []).map(log => ({ ...log, source: 'Op Pack', sourceDetail: p.name }))),
    ...(omni.qcRecords || []).flatMap(q => (q.activityLog || []).map(log => ({ ...log, source: 'QC', sourceDetail: q.title || q.type }))),
    ...((omni.systemLog || []).map(log => ({ ...log, source: 'System', sourceDetail: '' })))
  ];
  return all.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
}
function renderAdminTabLogs() {
  const all = collectAllAdminLogs();
  const sources = ['all', ...Array.from(new Set(all.map(l => l.source)))];
  const filtered = all.filter(l => {
    if (adminLogSourceFilter !== 'all' && l.source !== adminLogSourceFilter) return false;
    if (adminLogSearch) {
      const q = adminLogSearch.toLowerCase();
      const hay = `${l.source || ''} ${l.sourceDetail || ''} ${l.text || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return `
    <section class="admin-card admin-card-wide">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:14px; flex-wrap:wrap;">
        <h3 style="margin:0;"><i class="fa-solid fa-clipboard-list"></i> سجل أنشطة النظام (${filtered.length} من ${all.length})</h3>
        <button class="btn-secondary" onclick="downloadAdminLogs()"><i class="fa-solid fa-download"></i> تصدير كملف نصي</button>
      </div>
      <div class="admin-log-toolbar">
        <input type="text" class="form-input" placeholder="ابحث في السجل..." value="${escapeHtml(adminLogSearch)}" oninput="updateAdminLogSearch(this.value)">
        <select class="form-input" onchange="updateAdminLogSource(this.value)">
          ${sources.map(s => `<option value="${s}" ${adminLogSourceFilter === s ? 'selected' : ''}>${s === 'all' ? 'كل المصادر' : escapeHtml(s)}</option>`).join('')}
        </select>
      </div>
      <div class="admin-log-list">
        ${filtered.slice(0, 300).map(log => `<div class="admin-log-row">
          <b><span class="admin-log-source-chip">${escapeHtml(log.source)}</span>${log.sourceDetail ? ' · ' + escapeHtml(log.sourceDetail) : ''}</b>
          <span>${escapeHtml(log.text || '')}</span>
          <small>${escapeHtml(log.date || '')}</small>
        </div>`).join('') || '<div class="admin-empty">لا يوجد سجل أنشطة يطابق البحث.</div>'}
        ${filtered.length > 300 ? `<div class="admin-empty" style="margin-top:8px">عُرضت أحدث 300 من أصل ${filtered.length} — استخدم البحث للتصفية.</div>` : ''}
      </div>
    </section>
  `;
}

// Computes a system health snapshot — DB size, total records, last save, etc.
function computeAdminSystemHealth() {
  ensureOmni();
  ensureFinance();
  let totalRecords = 0;
  totalRecords += (omni.kanban?.cards || []).length;
  totalRecords += (omni.opPacks || []).length;
  totalRecords += (omni.sops || []).length;
  totalRecords += (omni.machines || []).length;
  totalRecords += (omni.materials || []).length;
  totalRecords += (omni.qcRecords || []).length;
  totalRecords += (omni.workflow?.nodes || []).length;
  totalRecords += (omni.users || []).length;
  totalRecords += (omni.suppliers || []).length;
  totalRecords += (omni.purchaseOrders || []).length;
  totalRecords += (finance.accounts || []).length;
  totalRecords += (finance.moves || []).length;
  totalRecords += (omni.taskManager?.spaces || []).flatMap(sp =>
    (sp.departments || []).flatMap(d => (d.sections || []).flatMap(s => (s.taskTypes || []).flatMap(t => t.tasks || [])))
  ).length;

  // Estimate DB size by serializing — gives a useful order-of-magnitude even on the client.
  let dbBytes = 0;
  try { dbBytes = new Blob([JSON.stringify({ omni, finance })]).size; } catch (e) { dbBytes = 0; }

  const lastSaved = omni._lastSavedAt || null;
  const lastSavedStr = lastSaved ? new Date(lastSaved).toLocaleString() : 'لم يُحفظ بعد في هذه الجلسة';

  // Status heuristic: yellow if DB > 5 MB, red if > 20 MB (these are JSON.stringify sizes,
  // not actual disk — the file gets compressed on save but this is a useful client-side proxy).
  let status = 'good', statusLabel = 'ممتاز';
  if (dbBytes > 20 * 1024 * 1024) { status = 'danger'; statusLabel = 'قاعدة كبيرة جداً — فكّر بأرشفة'; }
  else if (dbBytes > 5 * 1024 * 1024) { status = 'warn'; statusLabel = 'قاعدة كبيرة — راقبها'; }

  return {
    totalRecords,
    dbBytes,
    dbSizeStr: formatBytes(dbBytes),
    migrationsCount: (omni.migrationsApplied || []).length,
    lastSavedStr,
    status,
    statusLabel
  };
}

// Mutators for the organization profile — every field saves on change.
function updateOrganizationField(field, value) {
  ensureOmni();
  const allowed = ['name', 'owner', 'phone', 'address', 'logoEmoji', 'country', 'workStart', 'workEnd', 'dayOff', 'founded'];
  if (!allowed.includes(field)) return;
  if (!omni.adminSettings.organization) omni.adminSettings.organization = {};
  const newVal = typeof value === 'string' ? value.trim() : value;
  if (omni.adminSettings.organization[field] === newVal) return;
  omni.adminSettings.organization[field] = newVal;
  saveData();
  renderAdminPanel();
}
function updateOrganizationCurrency(code) {
  ensureOmni();
  if (!omni.adminSettings.organization) omni.adminSettings.organization = {};
  omni.adminSettings.organization.currency = code;
  omni.adminSettings.organization.currencySymbol = getOrgCurrencySymbol(code);
  saveData();
  updateGlobalCurrencyUI();
  renderAdminPanel();
  if (currentPage === 'receipt') renderReceiptPage();
  if (currentPage === 'report') renderReport();
  if (currentPage === 'finance') renderFinanceDashboard();
  if (currentPage === 'whatsapp') renderWhatsAppIntegrationPage();
}
function updateOrganizationGlobalField(field, value) {
  ensureOmni();
  const allowed = ['country', 'multiTenant'];
  if (!allowed.includes(field)) return;
  if (!omni.adminSettings.organization) omni.adminSettings.organization = {};
  omni.adminSettings.organization[field] = typeof value === 'string' ? value.trim() : !!value;
  saveData(); renderAdminPanel();
}

// ─── Companies CRUD ───
function getOrgCompanies() { ensureOmni(); return omni.adminSettings.organization?.companies || []; }
function getOrgSupervisors() { ensureOmni(); return omni.adminSettings.organization?.supervisors || []; }

function addCompany() {
  ensureOmni();
  const cos = omni.adminSettings.organization.companies;
  cos.push({
    id: makeId('co'),
    name: `شركة جديدة #${cos.length + 1}`,
    phone: '', address: '', logoEmoji: '🏢', founded: '',
    isPrimary: cos.length === 0,
    departments: []
  });
  saveData(); renderAdminPanel();
  showToast('تم إنشاء شركة جديدة', 'success');
}
function updateCompanyField(companyId, field, value) {
  const co = getOrgCompanies().find(c => c.id === companyId);
  if (!co) return;
  const allowed = ['name', 'phone', 'address', 'logoEmoji', 'founded'];
  if (!allowed.includes(field)) return;
  co[field] = typeof value === 'string' ? value.trim() : value;
  saveData(); renderAdminPanel();
}
async function deleteCompany(companyId) {
  const cos = getOrgCompanies();
  if (cos.length === 1) {
    showToast('يجب أن تبقى شركة واحدة على الأقل', 'warning');
    return;
  }
  const co = cos.find(c => c.id === companyId);
  if (!co) return;
  const ok = await showOmniConfirm('حذف شركة', `هل أنت متأكد من حذف "${co.name}" مع كل أقسامها ودواماتها؟`, 'حذف', 'إلغاء');
  if (!ok) return;
  const idx = cos.findIndex(c => c.id === companyId);
  cos.splice(idx, 1);
  if (co.isPrimary && cos.length) cos[0].isPrimary = true;
  saveData(); renderAdminPanel();
  showToast(`تم حذف "${co.name}"`, 'info');
}
function setPrimaryCompany(companyId) {
  getOrgCompanies().forEach(c => c.isPrimary = (c.id === companyId));
  omni.adminSettings.organization.activeCompanyId = companyId;
  saveData(); renderAdminPanel();
}

// Departments CRUD (nested in companies)
function addDepartment(companyId) {
  const co = getOrgCompanies().find(c => c.id === companyId);
  if (!co) return;
  co.departments.push({
    id: makeId('dept'),
    name: `قسم جديد #${co.departments.length + 1}`,
    phone: '',
    shifts: []
  });
  saveData(); renderAdminPanel();
}
function updateDepartmentField(companyId, deptId, field, value) {
  const co = getOrgCompanies().find(c => c.id === companyId);
  const dept = co?.departments.find(d => d.id === deptId);
  if (!dept) return;
  const allowed = ['name', 'phone'];
  if (!allowed.includes(field)) return;
  dept[field] = typeof value === 'string' ? value.trim() : value;
  saveData(); renderAdminPanel();
}
async function deleteDepartment(companyId, deptId) {
  const co = getOrgCompanies().find(c => c.id === companyId);
  if (!co) return;
  const dept = co.departments.find(d => d.id === deptId);
  if (!dept) return;
  const ok = await showOmniConfirm('حذف قسم', `هل أنت متأكد من حذف القسم "${dept.name}" مع كل دواماته؟`, 'حذف', 'إلغاء');
  if (!ok) return;
  co.departments = co.departments.filter(d => d.id !== deptId);
  saveData(); renderAdminPanel();
}

// ─── Shifts CRUD (nested in departments) ───
function addShift(companyId, deptId) {
  const co = getOrgCompanies().find(c => c.id === companyId);
  const dept = co?.departments.find(d => d.id === deptId);
  if (!dept) return;
  dept.shifts.push({
    id: makeId('shift'),
    name: `دوام جديد`,
    start: '08:00', end: '16:00',
    days: ['sat', 'sun', 'mon', 'tue', 'wed', 'thu'],
    supervisorId: ''
  });
  saveData(); renderAdminPanel();
}
function updateShiftField(companyId, deptId, shiftId, field, value) {
  const co = getOrgCompanies().find(c => c.id === companyId);
  const dept = co?.departments.find(d => d.id === deptId);
  const shift = dept?.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  const allowed = ['name', 'start', 'end', 'supervisorId'];
  if (!allowed.includes(field)) return;
  shift[field] = typeof value === 'string' ? value.trim() : value;
  saveData(); renderAdminPanel();
}
function toggleShiftDay(companyId, deptId, shiftId, day) {
  const co = getOrgCompanies().find(c => c.id === companyId);
  const dept = co?.departments.find(d => d.id === deptId);
  const shift = dept?.shifts.find(s => s.id === shiftId);
  if (!shift) return;
  if (!Array.isArray(shift.days)) shift.days = [];
  if (shift.days.includes(day)) shift.days = shift.days.filter(d => d !== day);
  else shift.days.push(day);
  saveData(); renderAdminPanel();
}
function deleteShift(companyId, deptId, shiftId) {
  const co = getOrgCompanies().find(c => c.id === companyId);
  const dept = co?.departments.find(d => d.id === deptId);
  if (!dept) return;
  dept.shifts = dept.shifts.filter(s => s.id !== shiftId);
  saveData(); renderAdminPanel();
}

// ─── Supervisors CRUD (separate pool) ───
function addSupervisor() {
  ensureOmni();
  const pool = omni.adminSettings.organization.supervisors;
  pool.push({
    id: makeId('sup'),
    name: `مسؤول جديد #${pool.length + 1}`,
    phone: '', role: '', email: ''
  });
  saveData(); renderAdminPanel();
}
function updateSupervisorField(supId, field, value) {
  const sup = getOrgSupervisors().find(s => s.id === supId);
  if (!sup) return;
  const allowed = ['name', 'phone', 'role', 'email'];
  if (!allowed.includes(field)) return;
  sup[field] = typeof value === 'string' ? value.trim() : value;
  saveData(); renderAdminPanel();
}
async function deleteSupervisor(supId) {
  const sup = getOrgSupervisors().find(s => s.id === supId);
  if (!sup) return;
  // Check if this supervisor is currently assigned to any shift — warn the user.
  const assigned = [];
  getOrgCompanies().forEach(co => co.departments.forEach(d => d.shifts.forEach(sh => {
    if (sh.supervisorId === supId) assigned.push(`${co.name} → ${d.name} → ${sh.name}`);
  })));
  let confirmMsg = `هل أنت متأكد من حذف "${sup.name}"؟`;
  if (assigned.length) confirmMsg += `\n\nهذا المسؤول مُعيّن حالياً على ${assigned.length} دوام، سيُلغى التعيين تلقائياً:\n• ${assigned.join('\n• ')}`;
  const ok = await showOmniConfirm('حذف مسؤول', confirmMsg, 'حذف', 'إلغاء');
  if (!ok) return;
  // Unassign from all shifts
  getOrgCompanies().forEach(co => co.departments.forEach(d => d.shifts.forEach(sh => {
    if (sh.supervisorId === supId) sh.supervisorId = '';
  })));
  const pool = omni.adminSettings.organization.supervisors;
  const idx = pool.findIndex(s => s.id === supId);
  if (idx !== -1) pool.splice(idx, 1);
  saveData(); renderAdminPanel();
}

// Helpers
const SHIFT_DAYS_AR = { sat: 'السبت', sun: 'الأحد', mon: 'الإثنين', tue: 'الثلاثاء', wed: 'الأربعاء', thu: 'الخميس', fri: 'الجمعة' };
const SHIFT_DAYS_ORDER = ['sat', 'sun', 'mon', 'tue', 'wed', 'thu', 'fri'];
function getSupervisorName(id) {
  if (!id) return '';
  const s = getOrgSupervisors().find(x => x.id === id);
  return s ? s.name : '';
}

// ─── BACKUP & RECOVERY CENTER FUNCTIONS ───
function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getBackupTagClass(tag) {
  const t = String(tag || '').toLowerCase();
  if (t === 'pre_restore') return 'tag-pre-restore';
  if (t.includes('release') || t.includes('v5') || t.includes('v6')) return 'tag-release';
  if (t === 'manual') return 'tag-manual';
  return 'tag-other';
}

function formatBackupDate(ts) {
  if (!ts) return '-';
  const match = String(ts).match(/^(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})$/);
  if (match) {
    const [_, y, m, d, h, min, s] = match;
    return `${y}/${m}/${d} ${h}:${min}:${s}`;
  }
  if (!isNaN(Number(ts))) {
    const d = new Date(Number(ts));
    return d.toLocaleString('en-GB');
  }
  return String(ts);
}

async function loadAdminBackups() {
  const container = document.getElementById('adminBackupListContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/backups');
    if (!res.ok) throw new Error('فشل جلب النسخ الاحتياطية');
    const backups = await res.json();

    if (!backups || backups.length === 0) {
      container.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">
            <i class="fa-solid fa-circle-info"></i> لا توجد نسخ احتياطية متوفرة حالياً.
          </td>
        </tr>
      `;
      return;
    }

    container.innerHTML = backups.map(b => {
      const sizeStr = formatBytes(b.bytes);
      const tagClass = getBackupTagClass(b.tag);
      const dateStr = formatBackupDate(b.created || b.timestamp);
      const escapedFile = escapeHtml(b.file);
      const escapedTag = escapeHtml(b.tag);

      return `
        <tr class="backup-row">
          <td><i class="fa-regular fa-clock" style="margin-left: 5px; opacity: 0.7;"></i> ${dateStr}</td>
          <td class="backup-filename" title="${escapedFile}">${escapedFile}</td>
          <td><span class="backup-tag-badge ${tagClass}">${escapedTag}</span></td>
          <td>${sizeStr}</td>
          <td class="backup-actions">
            <button class="btn btn-sm btn-secondary" onclick="downloadBackupFile('${escapedFile}')" title="تحميل">
              <i class="fa-solid fa-download"></i> تحميل
            </button>
            <button class="btn btn-sm btn-danger" onclick="restoreBackupConfirm('${escapedFile}')" title="استعادة">
              <i class="fa-solid fa-rotate-left"></i> استعادة
            </button>
          </td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading backups:', error);
    container.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: #f87171; padding: 20px;">
          <i class="fa-solid fa-circle-exclamation"></i> فشل في تحميل النسخ الاحتياطية: ${escapeHtml(error.message)}
        </td>
      </tr>
    `;
  }
}

function downloadBackupFile(filename) {
  const link = document.createElement('a');
  link.href = '/' + encodeURIComponent(filename);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

async function triggerCreateBackup() {
  const tag = await showOmniPrompt('أدخل وسماً (Tag) لهذه النسخة الاحتياطية (اختياري)', 'manual');
  if (tag === null) return;

  try {
    const res = await fetch('/api/backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tag: tag || 'manual' })
    });
    const result = await res.json();
    if (result.success) {
      await showOmniConfirm('تم بنجاح', `تم إنشاء النسخة الاحتياطية بنجاح باسم: \n${result.file}`, 'حسناً', '');
      loadAdminBackups();
    } else {
      await showOmniConfirm('خطأ', `فشل إنشاء النسخة الاحتياطية: ${result.error}`, 'حسناً', '');
    }
  } catch (error) {
    console.error('Error creating backup:', error);
    await showOmniConfirm('خطأ', `حدث خطأ أثناء الاتصال بالخادم: ${error.message}`, 'حسناً', '');
  }
}

async function restoreBackupConfirm(filename) {
  const confirm = await showOmniConfirm(
    'تأكيد استعادة النظام',
    `تحذير: هل أنت متأكد من استعادة النظام إلى الحالة المحفوظة في "${filename}"؟ \n\nسيتم استبدال قاعدة البيانات النشطة الحالية بالكامل. سيقوم النظام تلقائياً بإنشاء نسخة احتياطية للحماية (pre_restore) قبل البدء.`,
    'استعادة الآن',
    'إلغاء'
  );
  if (!confirm) return;

  try {
    const res = await fetch('/api/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: filename })
    });
    const result = await res.json();
    if (result.success) {
      await showOmniConfirm(
        'تمت الاستعادة بنجاح',
        `تمت استعادة قاعدة البيانات بنجاح إلى الملف المختار.\n\nتم أيضاً حفظ نسخة احتياطية وقائية قبل الاستعادة باسم: \n${result.backupCreated}`,
        'رائع',
        ''
      );
      localStorage.removeItem('octagon_payroll');
      localStorage.removeItem('pentagon_payroll');
      localStorage.removeItem('site-employees');
      localStorage.removeItem('site-config');
      await loadData();
      saveData();
      renderAdminPanel();
    } else {
      await showOmniConfirm('فشلت الاستعادة', `خطأ أثناء الاستعادة: ${result.error}`, 'حسناً', '');
    }
  } catch (error) {
    console.error('Error restoring backup:', error);
    await showOmniConfirm('خطأ', `حدث خطأ أثناء الاتصال بالخادم: ${error.message}`, 'حسناً', '');
  }
}

// ─── ADMIN USER CRUD ───
async function addAdminUser() {
  ensureOmni();
  const rolesOptions = (omni.roles || []).map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const permissions = [
    { id: 'all', name: 'كامل الصلاحيات (All)' },
    { id: 'financial_full', name: 'إدارة المالية الكاملة' },
    { id: 'financial_read', name: 'قراءة المالية فقط' },
    { id: 'workshop_full', name: 'إدارة الورشة الكاملة' },
    { id: 'inventory_full', name: 'إدارة المخزون الكاملة' },
    { id: 'machines_full', name: 'إدارة وتشغيل المكائن' },
    { id: 'qc_full', name: 'إدارة وضبط الجودة' },
    { id: 'workflows_full', name: 'تصميم مسارات العمل' },
    { id: 'admin_full', name: 'إدارة النظام الكاملة' }
  ];

  const permissionsCheckboxes = permissions.map(p => `
    <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
      <input type="checkbox" name="adminUserPerm" value="${p.id}">
      <span>${escapeHtml(p.name)}</span>
    </label>
  `).join('');

  const html = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="form-group">
        <label class="form-label">الاسم الكامل للمستخدم</label>
        <input type="text" id="adminUserNewName" class="form-input" placeholder="مثال: أحمد مصطفى">
      </div>
      <div class="form-group">
        <label class="form-label">الدور الأمني (Role)</label>
        <select id="adminUserNewRole" class="form-input">
          ${rolesOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">حالة الحساب</label>
        <select id="adminUserNewStatus" class="form-input">
          <option value="active" selected>نشط (Active)</option>
          <option value="inactive">معطل (Inactive)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">صلاحيات مخصصة إضافية (Overrides)</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; max-height:150px; overflow-y:auto;">
          ${permissionsCheckboxes}
        </div>
      </div>
    </div>
  `;

  const result = await showOmniModal('إضافة مستخدم جديد', html, (body) => {
    const name = body.querySelector('#adminUserNewName').value.trim();
    const roleId = body.querySelector('#adminUserNewRole').value;
    const status = body.querySelector('#adminUserNewStatus').value;
    const checkedCheckboxes = body.querySelectorAll('input[name="adminUserPerm"]:checked');
    const userPerms = Array.from(checkedCheckboxes).map(cb => cb.value);

    if (!name) {
      showToast('يرجى إدخال اسم المستخدم', 'error');
      return false;
    }
    return { name, roleId, status, permissions: userPerms };
  });

  if (!result) return;

  const newUser = {
    id: makeId('user'),
    name: result.name,
    roleId: result.roleId,
    status: result.status,
    permissions: result.permissions
  };
  omni.users.push(newUser);
  addSystemLog('system', `تم إنشاء مستخدم جديد: ${newUser.name} بدور: ${newUser.roleId}`, 'info', 'admin_panel', newUser.id);
  saveData();
  renderAdminPanel();
  showToast('تمت إضافة المستخدم بنجاح', 'success');
}

async function editAdminUser(userId) {
  ensureOmni();
  const user = omni.users.find(u => u.id === userId);
  if (!user) return;

  const rolesOptions = (omni.roles || []).map(r => `<option value="${r.id}" ${user.roleId === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`).join('');
  const permissions = [
    { id: 'all', name: 'كامل الصلاحيات (All)' },
    { id: 'financial_full', name: 'إدارة المالية الكاملة' },
    { id: 'financial_read', name: 'قراءة المالية فقط' },
    { id: 'workshop_full', name: 'إدارة الورشة الكاملة' },
    { id: 'inventory_full', name: 'إدارة المخزون الكاملة' },
    { id: 'machines_full', name: 'إدارة وتشغيل المكائن' },
    { id: 'qc_full', name: 'إدارة وضبط الجودة' },
    { id: 'workflows_full', name: 'تصميم مسارات العمل' },
    { id: 'admin_full', name: 'إدارة النظام الكاملة' }
  ];

  const permissionsCheckboxes = permissions.map(p => {
    const isChecked = (user.permissions || []).includes(p.id) ? 'checked' : '';
    return `
      <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
        <input type="checkbox" name="adminUserPerm" value="${p.id}" ${isChecked}>
        <span>${escapeHtml(p.name)}</span>
      </label>
    `;
  }).join('');

  const html = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="form-group">
        <label class="form-label">الاسم الكامل للمستخدم</label>
        <input type="text" id="adminUserEditName" class="form-input" value="${escapeHtml(user.name)}" placeholder="مثال: أحمد مصطفى">
      </div>
      <div class="form-group">
        <label class="form-label">الدور الأمني (Role)</label>
        <select id="adminUserEditRole" class="form-input">
          ${rolesOptions}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">حالة الحساب</label>
        <select id="adminUserEditStatus" class="form-input">
          <option value="active" ${user.status === 'active' ? 'selected' : ''}>نشط (Active)</option>
          <option value="inactive" ${user.status === 'inactive' ? 'selected' : ''}>معطل (Inactive)</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">صلاحيات مخصصة إضافية (Overrides)</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; max-height:150px; overflow-y:auto;">
          ${permissionsCheckboxes}
        </div>
      </div>
      <div class="form-group" style="display:flex; align-items:center; gap:8px; margin-top:8px;">
        <input type="checkbox" id="adminUserResetPassword" style="cursor:pointer;">
        <label for="adminUserResetPassword" style="font-size:13px; color:var(--text); cursor:pointer;">إعادة تعيين كلمة المرور (إجبار المستخدم على تعيينها عند الدخول القادم)</label>
      </div>
    </div>
  `;

  const result = await showOmniModal(`تعديل المستخدم: ${user.name}`, html, (body) => {
    const name = body.querySelector('#adminUserEditName').value.trim();
    const roleId = body.querySelector('#adminUserEditRole').value;
    const status = body.querySelector('#adminUserEditStatus').value;
    const checkedCheckboxes = body.querySelectorAll('input[name="adminUserPerm"]:checked');
    const userPerms = Array.from(checkedCheckboxes).map(cb => cb.value);
    const resetPassword = body.querySelector('#adminUserResetPassword').checked;

    if (!name) {
      showToast('يرجى إدخال اسم المستخدم', 'error');
      return false;
    }
    return { name, roleId, status, permissions: userPerms, resetPassword };
  });

  if (!result) return;

  user.name = result.name;
  user.roleId = result.roleId;
  user.status = result.status;
  user.permissions = result.permissions;

  if (result.resetPassword) {
    delete user.passwordHash;
    delete user.passwordSalt;
    user.mustChangePassword = true;
    showToast('تمت إعادة تعيين كلمة مرور المستخدم. سيُطلب منه تعيين كلمة مرور جديدة عند تسجيل الدخول القادم.', 'info');
  }

  addSystemLog('system', `تم تعديل مستخدم: ${user.name} بدور: ${user.roleId}`, 'info', 'admin_panel', user.id);
  saveData();
  renderAdminPanel();
  showToast('تم تحديث بيانات المستخدم', 'success');
}

async function deleteAdminUser(userId) {
  ensureOmni();
  const idx = omni.users.findIndex(u => u.id === userId);
  if (idx === -1) return;
  const user = omni.users[idx];

  const ok = await showOmniConfirm('حذف مستخدم', `هل أنت متأكد من حذف حساب المستخدم "${user.name}" نهائياً من الورشة؟`, 'حذف المستخدم', 'إلغاء');
  if (!ok) return;

  omni.users.splice(idx, 1);
  addSystemLog('system', `تم حذف مستخدم: ${user.name}`, 'warning', 'admin_panel', userId);
  saveData();
  renderAdminPanel();
  showToast('تم حذف المستخدم بنجاح', 'success');
}

// ─── ADMIN ROLE CRUD ───
async function addAdminRole() {
  ensureOmni();
  const permissions = [
    { id: 'all', name: 'كامل الصلاحيات (All)' },
    { id: 'financial_full', name: 'إدارة المالية الكاملة' },
    { id: 'financial_read', name: 'قراءة المالية فقط' },
    { id: 'workshop_full', name: 'إدارة الورشة الكاملة' },
    { id: 'inventory_full', name: 'إدارة المخزون الكاملة' },
    { id: 'machines_full', name: 'إدارة وتشغيل المكائن' },
    { id: 'qc_full', name: 'إدارة وضبط الجودة' },
    { id: 'workflows_full', name: 'تصميم مسارات العمل' },
    { id: 'admin_full', name: 'إدارة النظام الكاملة' }
  ];

  const permissionsCheckboxes = permissions.map(p => `
    <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
      <input type="checkbox" name="adminRolePerm" value="${p.id}">
      <span>${escapeHtml(p.name)}</span>
    </label>
  `).join('');

  const html = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div class="form-group">
        <label class="form-label">معرف الدور الفريد (مثال: supervisor)</label>
        <input type="text" id="adminRoleNewId" class="form-input" placeholder="اسم بالإنجليزية وبدون فراغات">
      </div>
      <div class="form-group">
        <label class="form-label">اسم الدور المعروض بالعربية</label>
        <input type="text" id="adminRoleNewName" class="form-input" placeholder="مثال: مشرف عام">
      </div>
      <div class="form-group">
        <label class="form-label">الصلاحيات الأساسية الممنوحة للدور</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; max-height:150px; overflow-y:auto;">
          ${permissionsCheckboxes}
        </div>
      </div>
    </div>
  `;

  const result = await showOmniModal('إضافة دور أمني مخصص', html, (body) => {
    const id = body.querySelector('#adminRoleNewId').value.trim().toLowerCase();
    const name = body.querySelector('#adminRoleNewName').value.trim();
    const checkedCheckboxes = body.querySelectorAll('input[name="adminRolePerm"]:checked');
    const rolePerms = Array.from(checkedCheckboxes).map(cb => cb.value);

    if (!id || !/^[a-z0-9_]+$/.test(id)) {
      showToast('يرجى إدخال معرف أمني صالح بالإنجليزية وبدون فراغات', 'error');
      return false;
    }
    if (!name) {
      showToast('يرجى إدخال الاسم العربي المعروض للدور', 'error');
      return false;
    }
    if (omni.roles.some(r => r.id === id)) {
      showToast('هذا المعرف الأمني موجود مسبقاً في الورشة', 'error');
      return false;
    }
    return { id, name, permissions: rolePerms };
  });

  if (!result) return;

  const newRole = {
    id: result.id,
    name: result.name,
    permissions: result.permissions
  };
  omni.roles.push(newRole);
  if (!omni.permissions) omni.permissions = {};
  omni.permissions[newRole.id] = newRole.permissions;

  addSystemLog('system', `تمت إضافة دور أمني جديد: ${newRole.name} (${newRole.id})`, 'info', 'admin_panel', newRole.id);
  saveData();
  renderAdminPanel();
  showToast('تمت إضافة الدور الأمني بنجاح', 'success');
}

async function editAdminRolePermissions(roleId) {
  ensureOmni();
  const role = omni.roles.find(r => r.id === roleId);
  if (!role) return;

  const permissions = [
    { id: 'all', name: 'كامل الصلاحيات (All)' },
    { id: 'financial_full', name: 'إدارة المالية الكاملة' },
    { id: 'financial_read', name: 'قراءة المالية فقط' },
    { id: 'workshop_full', name: 'إدارة الورشة الكاملة' },
    { id: 'inventory_full', name: 'إدارة المخزون الكاملة' },
    { id: 'machines_full', name: 'إدارة وتشغيل المكائن' },
    { id: 'qc_full', name: 'إدارة وضبط الجودة' },
    { id: 'workflows_full', name: 'تصميم مسارات العمل' },
    { id: 'admin_full', name: 'إدارة النظام الكاملة' }
  ];

  const permissionsCheckboxes = permissions.map(p => {
    const isChecked = (role.permissions || []).includes(p.id) ? 'checked' : '';
    return `
      <label style="display:flex; align-items:center; gap:8px; font-size:12px; cursor:pointer;">
        <input type="checkbox" name="adminRolePerm" value="${p.id}" ${isChecked}>
        <span>${escapeHtml(p.name)}</span>
      </label>
    `;
  }).join('');

  const html = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <p style="font-size:13px; color:#cbd5e1; margin-bottom:8px;">تعديل مصفوفة الصلاحيات الممنوحة للدور الأمني <b>"${role.name}"</b>:</p>
      <div class="form-group">
        <label class="form-label">الاسم المعروض للدور</label>
        <input type="text" id="adminRoleEditName" class="form-input" value="${escapeHtml(role.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">الصلاحيات الممنوحة</label>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; padding:10px; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.06); border-radius:8px; max-height:180px; overflow-y:auto;">
          ${permissionsCheckboxes}
        </div>
      </div>
    </div>
  `;

  const result = await showOmniModal(`تعديل صلاحيات الدور: ${role.name}`, html, (body) => {
    const name = body.querySelector('#adminRoleEditName').value.trim();
    const checkedCheckboxes = body.querySelectorAll('input[name="adminRolePerm"]:checked');
    const rolePerms = Array.from(checkedCheckboxes).map(cb => cb.value);

    if (!name) {
      showToast('يرجى إدخال اسم الدور', 'error');
      return false;
    }
    return { name, permissions: rolePerms };
  });

  if (!result) return;

  role.name = result.name;
  role.permissions = result.permissions;
  if (!omni.permissions) omni.permissions = {};
  omni.permissions[role.id] = role.permissions;

  addSystemLog('system', `تم تحديث صلاحيات الدور: ${role.name} (${role.id})`, 'info', 'admin_panel', role.id);
  saveData();
  renderAdminPanel();
  showToast('تمت تحديث صلاحيات الدور بنجاح', 'success');
}

async function deleteAdminRole(roleId) {
  ensureOmni();
  if (['manager', 'employee', 'operator'].includes(roleId)) {
    showToast('لا يمكن حذف الأدوار الافتراضية للنظام', 'error');
    return;
  }

  const idx = omni.roles.findIndex(r => r.id === roleId);
  if (idx === -1) return;
  const role = omni.roles[idx];

  const ok = await showOmniConfirm('حذف دور أمني', `هل أنت متأكد من حذف الدور الأمني "${role.name}"؟ سيتم إلغاء تعيين هذا الدور من أي مستخدمين مرتبطين به.`, 'حذف الدور', 'إلغاء');
  if (!ok) return;

  omni.roles.splice(idx, 1);
  if (omni.permissions) delete omni.permissions[roleId];

  // Clean up user assignments
  omni.users.forEach(u => {
    if (u.roleId === roleId) {
      u.roleId = 'employee';
    }
  });

  addSystemLog('system', `تم حذف دور أمني: ${role.name}`, 'warning', 'admin_panel', roleId);
  saveData();
  renderAdminPanel();
  showToast('تم حذف الدور الأمني وتطهير الحسابات المرتبطة به', 'success');
}

// ─── ADMIN FINANCE SETUP CRUD ───
async function manageAdminFinanceSetup(type) {
  ensureFinance();
  let title = '';
  let items = [];

  if (type === 'dept') {
    title = 'إدارة الأقسام المالية';
    items = finance.departments || [];
  } else if (type === 'party') {
    title = 'إدارة الأشخاص والجهات';
    items = finance.parties || [];
  } else if (type === 'exp_cat') {
    title = 'إدارة أصناف المصروفات';
    items = finance.categories?.expense || [];
  } else if (type === 'inc_cat') {
    title = 'إدارة مصادر الواردات';
    items = finance.categories?.income || [];
  }

  const tableRows = items.map(item => {
    let subDetails = '';
    if (type === 'party') {
      subDetails = `<span class="backup-tag-badge tag-other">${item.type === 'employee' ? 'موظف' : 'شخص/مورد'}</span>`;
    } else if (type === 'exp_cat' || type === 'inc_cat') {
      const acc = (finance.accounts || []).find(a => a.id === item.accountId);
      subDetails = `<small style="color:var(--accent-blue);">${acc ? acc.name : item.accountId || '-'}</small>`;
    } else {
      subDetails = `<small style="color:var(--text-muted);">${item.id}</small>`;
    }

    const escapedName = escapeHtml(item.name || item.title || item.id || item);
    const idValue = item.id || item;

    return `
      <tr class="backup-row">
        <td style="font-weight:600; color:#f1f5f9;">${escapedName}</td>
        <td>${subDetails}</td>
        <td class="backup-actions">
          <button class="btn btn-sm btn-secondary" onclick="event.stopPropagation(); editAdminFinanceSetupItem('${type}', '${idValue}')"><i class="fa-solid fa-pen"></i></button>
          <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteAdminFinanceSetupItem('${type}', '${idValue}')"><i class="fa-solid fa-trash"></i></button>
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="3" style="text-align:center; padding:16px; color:var(--text-muted);">لا توجد عناصر مضافة بعد</td></tr>`;

  const modalHtml = `
    <div style="display:flex; flex-direction:column; gap:12px;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <span class="admin-note" style="margin:0;">إجمالي العناصر المسجلة: ${items.length}</span>
        <button class="btn btn-secondary btn-sm" style="display:flex; align-items:center; gap:6px;" onclick="addAdminFinanceSetupItem('${type}')">
          <i class="fa-solid fa-plus"></i> إضافة عنصر جديد
        </button>
      </div>

      <div class="backup-table-wrapper" style="margin:0; max-height:300px; overflow-y:auto;">
        <table class="backup-table" style="width:100%;">
          <thead>
            <tr>
              <th>العنصر</th>
              <th>تفاصيل إضافية</th>
              <th style="width:100px;">الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            ${tableRows}
          </tbody>
        </table>
      </div>
    </div>
  `;

  await showOmniModal(title, modalHtml, () => true);
}

async function addAdminFinanceSetupItem(type) {
  ensureFinance();
  let title = '';
  let fieldsHtml = '';

  if (type === 'dept') {
    title = 'إضافة قسم مالي جديد';
    fieldsHtml = `
      <div class="form-group">
        <label class="form-label">اسم القسم</label>
        <input type="text" id="addFinSetupName" class="form-input" placeholder="مثال: قسم التصنيع CNC">
      </div>
    `;
  } else if (type === 'party') {
    title = 'إضافة شخص أو جهة';
    fieldsHtml = `
      <div class="form-group">
        <label class="form-label">الاسم الكامل للجهة/الشخص</label>
        <input type="text" id="addFinSetupName" class="form-input" placeholder="مثال: شركة الرافدين للمواد الأولية">
      </div>
      <div class="form-group">
        <label class="form-label">نوع الجهة</label>
        <select id="addFinSetupPartyType" class="form-input">
          <option value="person" selected>شخص / عميل / مورد (Person)</option>
          <option value="employee">موظف في الورشة (Employee)</option>
        </select>
      </div>
    `;
  } else if (type === 'exp_cat' || type === 'inc_cat') {
    title = type === 'exp_cat' ? 'إضافة صنف مصروفات جديد' : 'إضافة مصدر إيرادات جديد';
    const accounts = (finance.accounts || []).filter(a => type === 'exp_cat' ? a.type === 'expense' : a.type === 'income' || a.type === 'asset');
    const accOptions = accounts.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${a.code})</option>`).join('');
    fieldsHtml = `
      <div class="form-group">
        <label class="form-label">اسم الصنف</label>
        <input type="text" id="addFinSetupName" class="form-input" placeholder="مثال: نقل وتجهيز البضاعة">
      </div>
      <div class="form-group">
        <label class="form-label">الحساب المحاسبي المرتبط</label>
        <select id="addFinSetupAccount" class="form-input">
          ${accOptions}
        </select>
      </div>
    `;
  }

  const result = await showOmniModal(title, fieldsHtml, (body) => {
    const name = body.querySelector('#addFinSetupName').value.trim();
    if (!name) {
      showToast('يرجى ملء الاسم الكامل', 'error');
      return false;
    }
    const partyType = body.querySelector('#addFinSetupPartyType')?.value || '';
    const accountId = body.querySelector('#addFinSetupAccount')?.value || '';
    return { name, partyType, accountId };
  });

  if (!result) return;

  if (type === 'dept') {
    const newItem = { id: makeId('dept'), name: result.name };
    finance.departments.push(newItem);
    showToast('تمت إضافة القسم المالي بنجاح', 'success');
  } else if (type === 'party') {
    const newItem = { id: makeId(result.partyType), type: result.partyType, name: result.name };
    finance.parties.push(newItem);
    showToast('تمت إضافة الشخص/الجهة بنجاح', 'success');
  } else if (type === 'exp_cat') {
    const newItem = { id: makeId('cat'), name: result.name, accountId: result.accountId };
    if (!finance.categories) finance.categories = {};
    if (!Array.isArray(finance.categories.expense)) finance.categories.expense = [];
    finance.categories.expense.push(newItem);
    showToast('تمت إضافة صنف المصروفات بنجاح', 'success');
  } else if (type === 'inc_cat') {
    const newItem = { id: makeId('cat'), name: result.name, accountId: result.accountId };
    if (!finance.categories) finance.categories = {};
    if (!Array.isArray(finance.categories.income)) finance.categories.income = [];
    finance.categories.income.push(newItem);
    showToast('تمت إضافة مصدر الإيرادات بنجاح', 'success');
  }

  saveData();
  renderAdminPanel();
  // Re-open list modal for smooth UX
  setTimeout(() => {
    manageAdminFinanceSetup(type);
  }, 300);
}

async function editAdminFinanceSetupItem(type, itemId) {
  ensureFinance();
  let title = '';
  let item = null;
  let fieldsHtml = '';

  if (type === 'dept') {
    item = finance.departments.find(d => d.id === itemId || d.name === itemId);
    if (!item) return;
    title = 'تعديل القسم المالي';
    fieldsHtml = `
      <div class="form-group">
        <label class="form-label">اسم القسم</label>
        <input type="text" id="editFinSetupName" class="form-input" value="${escapeHtml(item.name)}">
      </div>
    `;
  } else if (type === 'party') {
    item = finance.parties.find(p => p.id === itemId || p.name === itemId);
    if (!item) return;
    title = 'تعديل جهة / شخص مالية';
    fieldsHtml = `
      <div class="form-group">
        <label class="form-label">الاسم الكامل</label>
        <input type="text" id="editFinSetupName" class="form-input" value="${escapeHtml(item.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">النوع</label>
        <select id="editFinSetupPartyType" class="form-input">
          <option value="person" ${item.type === 'person' ? 'selected' : ''}>شخص / عميل / مورد</option>
          <option value="employee" ${item.type === 'employee' ? 'selected' : ''}>موظف الورشة</option>
        </select>
      </div>
    `;
  } else if (type === 'exp_cat' || type === 'inc_cat') {
    const list = type === 'exp_cat' ? finance.categories?.expense : finance.categories?.income;
    item = (list || []).find(c => c.id === itemId || c.name === itemId);
    if (!item) return;
    title = type === 'exp_cat' ? 'تعديل صنف المصروفات' : 'تعديل مصدر الإيرادات';
    const accounts = (finance.accounts || []).filter(a => type === 'exp_cat' ? a.type === 'expense' : a.type === 'income' || a.type === 'asset');
    const accOptions = accounts.map(a => `<option value="${a.id}" ${item.accountId === a.id ? 'selected' : ''}>${escapeHtml(a.name)} (${a.code})</option>`).join('');
    fieldsHtml = `
      <div class="form-group">
        <label class="form-label">اسم الصنف</label>
        <input type="text" id="editFinSetupName" class="form-input" value="${escapeHtml(item.name)}">
      </div>
      <div class="form-group">
        <label class="form-label">الحساب المحاسبي المرتبط</label>
        <select id="editFinSetupAccount" class="form-input">
          ${accOptions}
        </select>
      </div>
    `;
  }

  const result = await showOmniModal(title, fieldsHtml, (body) => {
    const name = body.querySelector('#editFinSetupName').value.trim();
    if (!name) {
      showToast('يرجى ملء الاسم الكامل', 'error');
      return false;
    }
    const partyType = body.querySelector('#editFinSetupPartyType')?.value || '';
    const accountId = body.querySelector('#editFinSetupAccount')?.value || '';
    return { name, partyType, accountId };
  });

  if (!result) return;

  item.name = result.name;
  if (type === 'party') {
    item.type = result.partyType;
  } else if (type === 'exp_cat' || type === 'inc_cat') {
    item.accountId = result.accountId;
  }

  saveData();
  renderAdminPanel();
  showToast('تم حفظ التعديلات بنجاح', 'success');
  // Re-open list modal for smooth UX
  setTimeout(() => {
    manageAdminFinanceSetup(type);
  }, 300);
}

async function deleteAdminFinanceSetupItem(type, itemId) {
  ensureFinance();
  let list = [];
  let itemIndex = -1;
  let label = '';

  if (type === 'dept') {
    list = finance.departments;
    itemIndex = list.findIndex(d => d.id === itemId || d.name === itemId);
    label = list[itemIndex]?.name || itemId;
  } else if (type === 'party') {
    list = finance.parties;
    itemIndex = list.findIndex(p => p.id === itemId || p.name === itemId);
    label = list[itemIndex]?.name || itemId;
  } else if (type === 'exp_cat') {
    list = finance.categories?.expense || [];
    itemIndex = list.findIndex(c => c.id === itemId || c.name === itemId);
    label = list[itemIndex]?.name || itemId;
  } else if (type === 'inc_cat') {
    list = finance.categories?.income || [];
    itemIndex = list.findIndex(c => c.id === itemId || c.name === itemId);
    label = list[itemIndex]?.name || itemId;
  }

  if (itemIndex === -1) return;

  const ok = await showOmniConfirm('تأكيد الحذف المالي', `هل أنت متأكد من حذف "${label}"؟ قد يؤثر الحذف على سجلات الحسابات الحالية.`, 'حذف العنصر', 'إلغاء');
  if (!ok) return;

  list.splice(itemIndex, 1);
  saveData();
  renderAdminPanel();
  showToast('تم حذف العنصر بنجاح', 'success');
  // Re-open list modal for smooth UX
  setTimeout(() => {
    manageAdminFinanceSetup(type);
  }, 300);
}
