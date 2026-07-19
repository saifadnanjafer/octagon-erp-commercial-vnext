// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
(function () {
  'use strict';

  const LABELS = {
    connected: 'Connected / متصل', connecting: 'Connecting / جارٍ الاتصال', degraded: 'Degraded / اتصال متدهور', offline: 'Offline / غير متصل', syncing: 'Syncing / جارٍ المزامنة', conflict: 'Conflict review / مراجعة تعارض', blocked: 'Blocked / محجوب'
  };
  const RETRY_CAP_MS = 30000;

  function create(options) {
    options = options || {};
    const endpoint = options.endpoint || '/api/vnext/events';
    const pollEndpoint = options.pollEndpoint || '/api/health';
    const root = options.root || document.getElementById('vnextConnectivityStatus');
    const state = { current: 'connecting', lastSync: null, pending: 0, failed: 0, cursor: 0, failures: 0, eventSource: null, pollTimer: null, retryMs: 1000 };
    if (!root) return { state };
    root.setAttribute('role', 'status'); root.setAttribute('aria-live', 'polite'); root.setAttribute('aria-atomic', 'true');

    function render() {
      root.dataset.state = state.current;
      root.innerHTML = '<span class="vnext-connectivity-dot" aria-hidden="true"></span><span class="vnext-connectivity-label"></span><span class="vnext-connectivity-meta"></span>';
      root.querySelector('.vnext-connectivity-label').textContent = LABELS[state.current] || state.current;
      const last = state.lastSync ? new Date(state.lastSync).toLocaleTimeString() : '—';
      root.querySelector('.vnext-connectivity-meta').textContent = `Last server sync: ${last} · Pending: ${state.pending} · Failed: ${state.failed}`;
    }
    function set(next, patch) { Object.assign(state, patch || {}); state.current = next; render(); }
    function stopPolling() { if (state.pollTimer) { clearTimeout(state.pollTimer); state.pollTimer = null; } }
    function schedulePoll() {
      stopPolling();
      const wait = Math.min(RETRY_CAP_MS, state.retryMs);
      state.pollTimer = setTimeout(async function poll() {
        state.pollTimer = null;
        try {
          const response = await fetch(pollEndpoint, { credentials: 'include', cache: 'no-store' });
          if (response.ok) { state.retryMs = 1000; if (!state.eventSource || state.eventSource.readyState !== EventSource.OPEN) set('degraded', { lastSync: new Date().toISOString() }); }
          else set('degraded');
        } catch (_) { set(navigator.onLine === false ? 'offline' : 'degraded'); }
        if (!state.eventSource || state.eventSource.readyState !== EventSource.OPEN) { state.retryMs = Math.min(RETRY_CAP_MS, state.retryMs * 2); schedulePoll(); }
      }, wait);
    }
    function connect() {
      if (!window.EventSource) { set('degraded'); schedulePoll(); return; }
      if (state.eventSource) state.eventSource.close();
      set('connecting');
      const url = state.cursor ? `${endpoint}?cursor=${encodeURIComponent(state.cursor)}` : endpoint;
      const source = new EventSource(url, { withCredentials: true }); state.eventSource = source;
      source.onopen = function () { state.failures = 0; state.retryMs = 1000; stopPolling(); set('connected', { lastSync: new Date().toISOString() }); };
      source.onmessage = function (message) { try { const event = JSON.parse(message.data); state.cursor = Number(event.id) || state.cursor; state.lastSync = new Date().toISOString(); if (event.type === 'sync.conflict') set('conflict'); else if (event.type === 'sync.started') set('syncing'); else set('connected'); } catch (_) {} };
      source.onerror = function () { state.failures += 1; if (state.failures >= 3) { set(navigator.onLine === false ? 'offline' : 'degraded'); schedulePoll(); } else set('connecting'); source.close(); setTimeout(connect, Math.min(RETRY_CAP_MS, state.retryMs)); state.retryMs = Math.min(RETRY_CAP_MS, state.retryMs * 2); };
    }
    window.addEventListener('online', connect); window.addEventListener('offline', function () { set('offline'); if (state.eventSource) state.eventSource.close(); schedulePoll(); });
    window.addEventListener('octagon:sync-state', event => set(event.detail?.state || 'syncing', event.detail));
    render(); connect();
    return { state, connect, render, setState: set, close: () => { stopPolling(); if (state.eventSource) state.eventSource.close(); } };
  }

  window.OctagonConnectivity = { create, labels: LABELS };
  document.addEventListener('DOMContentLoaded', function () { window.octagonConnectivity = create(); });
}());
