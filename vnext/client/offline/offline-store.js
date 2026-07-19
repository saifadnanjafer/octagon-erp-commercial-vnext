// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md (proprietary self, not copied)
(function () {
  'use strict';

  const DB_NAME = 'octagon-vnext-connectivity';
  const DB_VERSION = 1;
  // POS sale is an offline capture command only. The server records it on
  // replay and posts no GL/stock until the authenticated session closes.
  const SAFE_COMMANDS = new Set(['platform.noop', 'platform.ping', 'pos.sale']);
  const PROHIBITED = /(finance|stock|inventory|approval|identity|permission|payroll|timesheet|attendance|admin|role|tenant|company|tax|payment|audit|message|whatsapp)/i;

  function open() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = function () {
        const db = request.result;
        if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'idempotencyKey' });
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error || new Error('IndexedDB open failed')); };
    });
  }

  function request(store, mode, action) {
    return open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const result = action(tx.objectStore(store));
      result.onsuccess = function () { resolve(result.result); };
      result.onerror = function () { reject(result.error || new Error('IndexedDB request failed')); };
      tx.oncomplete = function () { db.close(); };
      tx.onerror = function () { reject(tx.error || new Error('IndexedDB transaction failed')); };
    }));
  }

  async function hash(value) {
    const text = JSON.stringify(value, Object.keys(value || {}).sort());
    if (window.crypto && crypto.subtle) {
      const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(bytes)).map(x => x.toString(16).padStart(2, '0')).join('');
    }
    return 'sha256-unavailable:' + text.length + ':' + text.slice(0, 40);
  }

  function assertSafeCommand(type) {
    if (!SAFE_COMMANDS.has(String(type || '')) || PROHIBITED.test(String(type || ''))) {
      const error = new Error('Offline command is prohibited by policy');
      error.code = 'OFFLINE_PROHIBITED';
      throw error;
    }
  }

  async function enqueueCommand(input) {
    input = input || {};
    assertSafeCommand(input.type);
    const scope = { tenantId: String(input.scope?.tenantId || ''), companyId: String(input.scope?.companyId || '') };
    if (!scope.tenantId || !scope.companyId) throw new Error('Offline scope is required');
    const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
    const idempotencyKey = String(input.idempotencyKey || (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random())).slice(0, 180);
    const item = {
      idempotencyKey,
      commandType: String(input.type),
      payload,
      payloadHash: await hash(payload),
      actorId: String(input.actorId || ''),
      deviceId: String(input.deviceId || 'browser'),
      sessionFingerprint: String(input.sessionFingerprint || ''),
      scope,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
      attempt: 0,
      status: 'pending',
      conflict: null,
    };
    await request('outbox', 'readwrite', store => store.put(item));
    return item;
  }

  async function listOutbox(scope) {
    const rows = await request('outbox', 'readonly', store => store.getAll());
    return (rows || []).filter(item => !scope || (item.scope.tenantId === scope.tenantId && item.scope.companyId === scope.companyId));
  }

  async function replayOutbox(options) {
    options = options || {};
    if (navigator.onLine === false) return { status: 'offline', finalized: 0, conflicts: 0, failed: 0 };
    const fetchImpl = options.fetchImpl || window.fetch.bind(window);
    const rows = await listOutbox(options.scope);
    let finalized = 0; let conflicts = 0; let failed = 0;
    for (const item of rows.filter(row => row.status === 'pending' || row.status === 'retry')) {
      item.attempt += 1; item.updatedAt = new Date().toISOString();
      await request('outbox', 'readwrite', store => store.put(item));
      try {
        const response = await fetchImpl('/api/vnext/commands', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json', 'x-company-id': item.scope.companyId }, body: JSON.stringify({ command: { idempotency_key: item.idempotencyKey, type: item.commandType, payload: item.payload, company_id: item.scope.companyId } }) });
        if (response.status === 409) {
          item.status = 'conflict'; item.conflict = { code: 'IDEMPOTENCY_CONFLICT', at: new Date().toISOString() }; conflicts += 1;
        } else if (response.status === 401 || response.status === 403) {
          item.status = 'blocked'; item.conflict = { code: response.status === 401 ? 'REAUTH_REQUIRED' : 'SCOPE_OR_POLICY_DENIED', at: new Date().toISOString() }; failed += 1;
        } else if (!response.ok) {
          item.status = 'retry'; item.retryCount += 1; failed += 1;
        } else {
          item.status = 'completed'; item.serverResult = await response.json(); finalized += 1;
        }
      } catch (_) {
        item.status = 'retry'; item.retryCount += 1; failed += 1;
      }
      item.updatedAt = new Date().toISOString();
      await request('outbox', 'readwrite', store => store.put(item));
    }
    return { status: 'complete', finalized, conflicts, failed };
  }

  function clearScope(scope) {
    return listOutbox(scope).then(rows => Promise.all(rows.map(row => request('outbox', 'readwrite', store => store.delete(row.idempotencyKey)))));
  }

  window.OctagonOffline = { open, enqueueCommand, listOutbox, replayOutbox, clearScope, assertSafeCommand, DB_NAME };
}());
