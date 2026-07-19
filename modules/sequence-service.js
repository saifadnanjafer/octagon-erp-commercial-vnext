/*
 * OCTAGON OMNISYSTEM - modules/sequence-service.js
 *
 * T1.4: unified document numbering (Odoo `ir.sequence` equivalent).
 *
 * Single source of truth for every document number in the system:
 *   INV-2026-00042, JOB-2026-0117, TKT-2026-0031, SR-..., visitor badges, etc.
 *
 * Usage (NEW documents only — existing call sites keep working, add-only):
 *   const num = await OctagonSeq.next('inv');   // -> "INV-2026-00042"
 *
 * The number is issued and incremented server-side inside a SQLite transaction
 * (POST /api/sequence/next), so two rapid parallel calls always get distinct
 * numbers. If the server is unreachable the client falls back to a localStorage
 * counter tagged with an explicit `OFFLINE-` prefix so a human can spot and
 * reconcile offline-issued numbers later — it NEVER silently reuses a number.
 */
(function () {
  'use strict';

  const ENDPOINT = '/api/sequence/next';
  const PEEK_ENDPOINT = '/api/sequence/peek';
  const OFFLINE_LS_KEY = 'octagon_seq_offline';

  // Mirror of the server-side defaults so the OFFLINE fallback formats numbers
  // the same way the server would. Server remains authoritative when reachable.
  const OFFLINE_DEFAULTS = {
    inv:   { prefix: 'INV', padding: 5 },
    bill:  { prefix: 'BILL', padding: 5 },
    job:   { prefix: 'JOB', padding: 4 },
    tkt:   { prefix: 'TKT', padding: 4 },
    sr:    { prefix: 'SR', padding: 4 },
    po:    { prefix: 'PO', padding: 4 },
    so:    { prefix: 'SO', padding: 4 },
    badge: { prefix: 'BADGE', padding: 4 },
    quote: { prefix: 'QT', padding: 4 },
    sub:   { prefix: 'SUB', padding: 4 },
  };

  function normalizeCode(code) {
    return String(code == null ? '' : code).trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  }

  function readOfflineStore() {
    try {
      const raw = localStorage.getItem(OFFLINE_LS_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeOfflineStore(store) {
    try { localStorage.setItem(OFFLINE_LS_KEY, JSON.stringify(store)); } catch (_) {}
  }

  // Deterministic, non-reusing offline number. Per-code counter kept in
  // localStorage; resets yearly like the server. Tagged OFFLINE- so it is
  // obviously distinguishable from a server-issued number.
  function offlineNext(code, opts) {
    const normCode = normalizeCode(code) || 'doc';
    const fallback = OFFLINE_DEFAULTS[normCode] || { prefix: normCode.toUpperCase(), padding: 4 };
    const prefix = (opts && opts.prefix != null) ? String(opts.prefix) : fallback.prefix;
    const padding = (opts && +opts.padding > 0) ? Math.min(12, Math.floor(+opts.padding)) : fallback.padding;
    const year = new Date().getFullYear();
    const store = readOfflineStore();
    const entry = store[normCode] && store[normCode].year === year ? store[normCode] : { year, next: 1 };
    const current = entry.next;
    store[normCode] = { year, next: current + 1 };
    writeOfflineStore(store);
    const body = `${prefix}-${year}-${String(current).padStart(padding, '0')}`;
    return {
      sequence: `OFFLINE-${body}`,
      number: current,
      prefix,
      padding,
      year,
      code: normCode,
      offline: true,
    };
  }

  // Issue the next number for `code`. Resolves to the formatted string.
  // opts.prefix / opts.padding only take effect the first time a code is seen
  // (server keeps stored prefix/padding stable afterwards).
  // opts.full === true resolves to the full result object instead of the string.
  async function next(code, opts = {}) {
    const normCode = normalizeCode(code);
    if (!normCode) throw new Error('OctagonSeq.next: code is required');
    let result;
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: normCode, prefix: opts.prefix, padding: opts.padding }),
      });
      if (res.ok) {
        const payload = await res.json();
        if (payload && payload.ok && payload.data && payload.data.sequence) {
          result = payload.data;
        }
      }
    } catch (_) {
      // network / server unreachable — fall through to offline
    }
    if (!result) {
      result = offlineNext(normCode, opts);
      if (typeof console !== 'undefined') {
        console.warn(`[OctagonSeq] server unreachable — issued OFFLINE number for "${normCode}": ${result.sequence}`);
      }
    }
    return opts.full ? result : result.sequence;
  }

  // Read the next number for a code WITHOUT consuming it (diagnostics / settings
  // display). Resolves to the server row (or null) — never issues a number.
  async function peek(code) {
    const normCode = normalizeCode(code);
    if (!normCode) return null;
    try {
      const res = await fetch(`${PEEK_ENDPOINT}?code=${encodeURIComponent(normCode)}`);
      if (res.ok) {
        const payload = await res.json();
        if (payload && payload.ok) return payload.data;
      }
    } catch (_) {}
    return null;
  }

  window.OctagonSeq = { next, peek, normalizeCode, OFFLINE_DEFAULTS };
})();
