(function () {
  'use strict';

  const services = window.OctagonServices || window.PentagonServices || {};
  services.version = '5.0-sprint-c';
  services.ready = Boolean(
    (window.OctagonDB || window.PentagonDB) &&
    window.AuditService &&
    window.TenantService &&
    window.RecordService &&
    window.StateService &&
    window.PermissionService &&
    window.StockService &&
    window.FinanceService
  );

  services.load = function loadOctagonServices(options) {
    return (window.OctagonDB || window.PentagonDB).load(options);
  };

  services.health = async function getOctagonServiceHealth() {
    const db = await (window.OctagonDB || window.PentagonDB).load();
    return {
      ready: services.ready,
      version: services.version,
      schema: db._schema_version || 'غير محدد',
      auditEvents: Array.isArray(db.audit_log) ? db.audit_log.length : 0,
      departments: Array.isArray(db.departments) ? db.departments.length : 0,
      locations: Array.isArray(db.locations) ? db.locations.length : 0,
    };
  };

  function renderHealthChip(health) {
    const host = document.getElementById('omniNotificationHost') || document.querySelector('.header-meta-bar');
    if (!host) return false;

    let chip = document.getElementById('v5ServiceHealthChip');
    if (!chip) {
      chip = document.createElement('button');
      chip.id = 'v5ServiceHealthChip';
      chip.type = 'button';
      chip.style.cssText = [
        'display:inline-flex',
        'align-items:center',
        'gap:8px',
        'height:34px',
        'padding:0 12px',
        'border:1px solid rgba(34,211,238,0.35)',
        'border-radius:999px',
        'background:rgba(8,47,73,0.45)',
        'color:#e0f2fe',
        'font:700 12px Tajawal, Inter, sans-serif',
        'cursor:default',
        'box-shadow:0 8px 22px rgba(8,47,73,0.18)',
        'white-space:nowrap',
      ].join(';');
      host.appendChild(chip);
    }

    chip.textContent = `الإصدار 5 جاهز · مخطط ${health.schema} · ${health.auditEvents} تدقيق`;
    chip.title = `الخدمات: ${health.ready ? 'جاهزة' : 'غير جاهزة'} | الأقسام: ${health.departments} | المواقع: ${health.locations}`;
    return true;
  }

  services.renderHealthChip = async function renderOctagonHealthChip() {
    if (typeof document === 'undefined') return;
    try {
      return renderHealthChip(await services.health());
    } catch (error) {
      console.warn('V5 service health unavailable:', error);
      return false;
    }
  };

  function scheduleHealthChip() {
    if (typeof window === 'undefined') return;
    [0, 400, 1200].forEach(delay => {
      window.setTimeout(async () => {
        const rendered = await services.renderHealthChip();
        if (rendered) services.healthRendered = true;
      }, delay);
    });
  }

  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleHealthChip);
  } else if (typeof document !== 'undefined') {
    scheduleHealthChip();
  }

  window.OctagonServices = services;
  window.PentagonServices = services;
})();
