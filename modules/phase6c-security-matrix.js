(function () {
  'use strict';

  const root = window;
  const ACTIONS = [
    'banking.reconciliation.create',
    'banking.reconciliation.match',
    'banking.reconciliation.unmatch',
    'banking.reconciliation.finalize',
    'banking.reconciliation.adjustment_request',
    'banking.reconciliation.legacy_finance_movement',
    'inventory.location.create',
    'inventory.location.transfer',
    'inventory.location.adjust',
    'inventory.location.issue',
    'inventory.location.receive',
    'inventory.location.negative_issue',
    'inventory.location.delete_with_stock',
    'accounting.coa.create',
    'accounting.coa.edit_safe',
    'accounting.coa.edit_used',
    'accounting.coa.deactivate',
    'accounting.coa.deactivate_used',
    'accounting.coa.delete_used',
    'risk_compliance.write',
    'risk_compliance.delete',
    'finance.direct_posting.external',
    'ai.high_risk_write',
    'hr.salary.change',
    'hr.attendance.locked_period_edit',
    'hr.deduction_fine.create',
    'hr.advance_loan.create',
    'hr.employee.terminate',
    'hr.role_permission.change',
    'hr.leave.payroll_affecting_approve',
    'hr.employee.delete'
  ];

  const FALLBACK_USERS = [
    { id: 'system', name: 'مدير النظام', groups: ['system.admin'] },
    { id: 'mgr_finance', name: 'مدير المالية', groups: ['finance.manager'] },
    { id: 'user_finance', name: 'مستخدم المالية', groups: ['finance.user'] },
    { id: 'mgr_workshop', name: 'مدير الورشة', groups: ['workshop.manager'] },
    { id: 'user_workshop', name: 'مستخدم الورشة', groups: ['workshop.user'] },
    { id: 'employee', name: 'موظف عادي', groups: [] }
  ];

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function users() {
    let live = [];
    let current = null;
    try {
      const omniUsers = Array.isArray(root.omni?.users) ? root.omni.users : [];
      live = omniUsers.filter(u => u && u.is_active !== false && u.status !== 'inactive');
      current = root.PentagonAuth?.getCurrentUser?.() || null;
    } catch (_) {}
    const byId = new Map();
    if (current && current.id) byId.set('current:' + current.id, { ...current, id: current.id, matrixSource: 'current' });
    live.forEach(user => {
      if (user.id && !byId.has('live:' + user.id)) byId.set('live:' + user.id, { ...user, matrixSource: 'omni.users' });
    });
    FALLBACK_USERS.forEach(user => {
      if (user.id && !byId.has('fallback:' + user.id)) byId.set('fallback:' + user.id, { ...user, matrixSource: 'fallback' });
    });
    return [...byId.values()].slice(0, 12);
  }

  function explain(actionKey, user) {
    if (!root.PermissionService || typeof root.PermissionService.explainAction !== 'function') {
      return { actionKey, label: actionKey, outcome: 'blocked', allowed: false, riskLevel: 'unknown', reason: 'permission_service_unavailable' };
    }
    return root.PermissionService.explainAction(actionKey, { dryRun: true }, user);
  }

  function badge(explained) {
    const outcome = explained.outcome || (explained.allowed ? 'allowed' : 'blocked');
    const cls = outcome === 'allowed' ? 'ok' : outcome === 'approval_required' || outcome === 'default_allowed' ? 'warn' : 'bad';
    const label = outcome === 'allowed' ? 'مسموح' : outcome === 'approval_required' ? 'موافقة' : outcome === 'default_allowed' ? 'Default' : outcome === 'missing' ? 'غير منفذ' : 'محظور';
    return '<span class="p6a-chip ' + cls + '" title="' + esc(explained.reason || '') + '">' + label + '</span>';
  }

  function pageSensitivity(page) {
    const p = String(page || '');
    if (['calculator', 'help_manual', 'training_lms', 'customer_portal'].includes(p)) return ['public/dev', 'allow'];
    if (/admin|security|settings|deploy|route_health|data_quality/.test(p)) return ['admin/security', 'admin-only'];
    if (/ai_|intelligence|scenario|automation|command_center|integration/.test(p)) return ['AI/system', 'manager-only'];
    if (/payroll|employee|employees|timesheet|people_ops|employee_mobile|employee_ui/.test(p)) return ['HR/payroll', 'deny-by-default later'];
    if (/finance|bank|cash|expense|income|receipt|report|tax|budget|ar_ap|account|sales/.test(p)) return ['finance', 'finance-only'];
    if (/approval|risk|compliance|audit/.test(p)) return ['manager', 'manager-only'];
    if (/inventory|stock|work_orders|machines|equipment|mrp|procurement|qc|sop|op_packs|task_manager|kanban|workshop/.test(p)) return ['manager', 'action-guarded only'];
    return ['normal business', 'allow'];
  }

  function pageLabel(btn, page) {
    const clone = btn.cloneNode(true);
    clone.querySelectorAll('i, .nav-badge, .nav-count').forEach(node => node.remove());
    return (clone.textContent || page || '').replace(/\s+/g, ' ').trim() || page;
  }

  function pageAuditRows() {
    const permissions = root.PermissionService?.pagePermissions || {};
    const currentUser = root.PentagonAuth?.getCurrentUser?.() || FALLBACK_USERS[0];
    const buttons = [...document.querySelectorAll('.nav-btn[data-page]')];
    const seen = new Set();
    return buttons.map(btn => {
      const page = btn.getAttribute('data-page') || '';
      if (!page || seen.has(page)) return null;
      seen.add(page);
      const mapped = Object.prototype.hasOwnProperty.call(permissions, page);
      let explained = null;
      try {
        explained = root.PermissionService?.explainPage?.(page, currentUser) || null;
      } catch (_) {}
      const [fallbackSensitivity, fallbackRecommendation] = pageSensitivity(page);
      return {
        page,
        label: pageLabel(btn, page),
        mapped,
        sensitivity: explained?.sensitivity || fallbackSensitivity,
        recommendation: explained?.defaultPolicy || fallbackRecommendation,
        phase: explained?.phase || '',
        outcome: explained?.outcome || (mapped ? 'allowed' : 'default_allowed'),
        reason: explained?.reason || '',
        allowedGroups: explained?.allowedGroups || []
      };
    }).filter(Boolean);
  }

  function renderPageAudit(body) {
    if (!body || document.getElementById('phase6dPagePermissionAudit')) return;
    const rows = pageAuditRows();
    const mappedCount = rows.filter(r => r.mapped).length;
    const sensitiveCount = rows.filter(r => !['public/dev', 'normal business'].includes(r.sensitivity)).length;
    const table = rows.map(row => {
      const mapped = row.mapped ? '<span class="p6a-chip ok">نعم</span>' : '<span class="p6a-chip warn">لا</span>';
      const access = row.outcome === 'blocked'
        ? '<span class="p6a-chip bad" title="' + esc(row.reason) + '">محظور</span>'
        : row.outcome === 'default_allowed'
          ? '<span class="p6a-chip warn" title="' + esc(row.reason) + '">Default</span>'
          : '<span class="p6a-chip ok" title="' + esc(row.reason) + '">مسموح</span>';
      const groups = row.allowedGroups.length ? row.allowedGroups.join(', ') : 'عام / self-service';
      return '<tr><td><strong>' + esc(row.label) + '</strong><span class="p6a-muted">' + esc(row.page) + '</span></td><td>' + mapped + '</td><td>' + esc(row.sensitivity) + '</td><td>' + access + '<span class="p6a-muted">' + esc(groups) + '</span></td><td>' + esc(row.phase || '-') + '</td></tr>';
    }).join('');
    body.insertAdjacentHTML('beforeend', '<section class="p6a-shell" id="phase6dPagePermissionAudit"><section class="p6a-panel"><div class="p6a-heading"><div><h3>Phase 6E - سياسة صلاحيات الصفحات</h3><p>دفعة التحكم الأولى: admin/security وHR/payroll وfinance وAI/system انتقلت إلى mapping صريح، مع بقاء صفحات الخدمة الذاتية والعامة معلنة كقرار واضح.</p></div><div class="p6a-chip-row"><span class="p6a-chip ok">' + rows.length + '/86 صفحة</span><span class="p6a-chip">' + mappedCount + ' mapped</span><span class="p6a-chip warn">' + sensitiveCount + ' sensitive</span></div></div><div class="p6a-table-wrap"><table class="p6a-table"><thead><tr><th>الصفحة</th><th>Mapping صريح</th><th>الحساسية</th><th>وصول المستخدم الحالي</th><th>Phase</th></tr></thead><tbody>' + table + '</tbody></table></div><div class="p6a-muted" style="margin-top:10px">Phase 6E لا تضيف صفحات ولا تغيّر بياناتك؛ هي تضبط الوصول على مستوى الصفحة في دفعات قابلة للفحص عبر PermissionService.explainPage().</div></section></section>');
  }

  function render() {
    const body = document.getElementById('securityCenterBody');
    if (!body) return;
    if (!document.getElementById('phase6cSecurityMatrix')) {
      const sampleUsers = users();
      const rows = ACTIONS.map(actionKey => {
        const sample = explain(actionKey, sampleUsers[0] || FALLBACK_USERS[0]);
        const cells = sampleUsers.map(user => '<td>' + badge(explain(actionKey, user)) + '</td>').join('');
        return '<tr><td><strong>' + esc(sample.label || actionKey) + '</strong><span class="p6a-muted">' + esc(actionKey) + '</span></td><td>' + esc(sample.riskLevel || '') + '</td><td>' + esc(sample.defaultPolicy || '') + '</td>' + cells + '</tr>';
      }).join('');
      const head = sampleUsers.map(user => {
        const groups = root.PermissionService?.resolveGroups?.(user) || user.groups || [];
        return '<th>' + esc(user.displayName || user.name || user.id) + '<span class="p6a-muted">' + esc(user.matrixSource || 'user') + ' · ' + esc(groups.join(',') || user.role || user.roleId || 'unmapped') + '</span></th>';
      }).join('');
      body.insertAdjacentHTML('beforeend', '<section class="p6a-shell" id="phase6cSecurityMatrix"><section class="p6a-panel"><div class="p6a-heading"><div><h3>مصفوفة صلاحيات الأفعال الحساسة</h3><p>فحص dry-run داخل مركز الأمن. لا يكتب بيانات ولا يغيّر الصلاحيات أثناء العرض.</p></div><div class="p6a-chip-row"><span class="p6a-chip ok">صفحات 86/86</span><span class="p6a-chip warn">High-risk unmapped deny</span><span class="p6a-chip">Phase 6E page policy</span></div></div><div class="p6a-warning"><strong>قاعدة Phase 6E:</strong> الصفحات الأعلى حساسية أصبحت mapped صراحة، والأفعال عالية/حرجة الخطورة غير المعرّفة تُحظر أو تُحوّل إلى طلب موافقة.</div><div class="p6a-table-wrap"><table class="p6a-table"><thead><tr><th>الفعل</th><th>الخطورة</th><th>السياسة</th>' + head + '</tr></thead><tbody>' + rows + '</tbody></table></div><div class="p6a-muted" style="margin-top:10px">مسار الموافقات: createOmniRequest / Command Center. طلبات Phase 6C/6E تحمل actionKey وsourcePage/sourceModule والمستخدم والهدف وbefore/after وriskLevel وrequestedAt وstatus.</div></section></section>');
    }
    renderPageAudit(body);
  }

  function schedule() {
    setTimeout(render, 80);
    setTimeout(render, 350);
    setTimeout(render, 900);
    setTimeout(render, 1600);
  }

  const originalSwitchPage = root.switchPage;
  if (typeof originalSwitchPage === 'function' && !originalSwitchPage.__phase6cMatrixWrapped) {
    const wrapped = function (page, ...args) {
      const result = originalSwitchPage.apply(this, [page, ...args]);
      if (page === 'security_center') schedule();
      return result;
    };
    wrapped.__phase6cMatrixWrapped = true;
    root.switchPage = wrapped;
  }

  document.addEventListener('click', event => {
    const btn = event.target?.closest?.('[data-page="security_center"], [onclick*="security_center"]');
    if (btn) schedule();
  });
  document.addEventListener('DOMContentLoaded', schedule);
  let watchTicks = 0;
  const watchTimer = setInterval(() => {
    watchTicks += 1;
    const active = root.currentPage === 'security_center'
      || document.getElementById('pageSecurityCenter')?.classList.contains('page-active');
    if (active) render();
    if (watchTicks > 80 || (document.getElementById('phase6cSecurityMatrix') && document.getElementById('phase6dPagePermissionAudit'))) {
      clearInterval(watchTimer);
    }
  }, 500);

  root.Phase6CSecurityMatrix = { render, actions: ACTIONS, users, pageAuditRows };
})();
