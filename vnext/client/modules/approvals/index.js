// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
'use strict';
// Approval Center surface: mounts the canonical nine-box platform widget
// (window.OX.inbox) rather than reimplementing approvals. Falls back to a
// direct counts render if the platform widget script is unavailable.
window.OctagonR3.register({
  key: 'approvals',
  label: { ar: 'مركز الموافقات', en: 'Approval Center' },
  resources: [],
  customRender(host, ctx) {
    const { api, esc } = ctx;
    host.innerHTML = '<div id="r3ApprovalHost" class="approval-host"></div>';
    const mountHost = host.querySelector('#r3ApprovalHost');
    if (window.OX && window.OX.inbox && typeof window.OX.inbox.mount === 'function') {
      try { window.OX.inbox.mount(mountHost, { pollMs: 30000 }); return; }
      catch (_) { /* fall through to lightweight render */ }
    }
    (async () => {
      try {
        const counts = await api('/api/x/approvals/counts');
        const boxes = counts.boxes || counts || {};
        mountHost.innerHTML = `<div class="approval-boxes">${Object.entries(boxes).map(([box, value]) => `<div class="approval-box"><strong>${esc(value)}</strong><span>${esc(box)}</span></div>`).join('')}</div>`;
      } catch (error) { mountHost.innerHTML = `<p class="error">${esc(error.message)}</p>`; }
    })();
  },
});
