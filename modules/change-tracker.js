/*
 * OCTAGON OMNISYSTEM - modules/change-tracker.js
 *
 * T2.3: chatter-lite — per-record change history (who / when / field / old->new).
 *
 *   TrackChanges.record(collection, id, patch, actor)          // omni-layer callers
 *   TrackChanges.recordInto(db, collection, id, patch, actor)  // inside a PentagonDB.mutate mutator
 *   TrackChanges.recordDiff(collection, id, before, after, actor)
 *   TrackChanges.list(collection, id) -> newest-first entries
 *   TrackChanges.openDrawer(collection, id)  // «سجل التغييرات» reader
 *
 * Entries live in omni.changeLog as a ring buffer (cap 5000, oldest evicted).
 * Because the bare `omni` global IS PentagonDB's cached `db.omni` (same object
 * reference), recordInto(db,...) writes land in the SAME db the mutator is about
 * to save — so finance-move history is persisted atomically with the move.
 *
 * FROZEN ZONE (§1): employees / attendance / timesheet / payroll edits are NEVER
 * tracked here — their existing dedicated audit stays as-is. isFrozen() blocks them.
 */
(function () {
  'use strict';

  const CAP = 5000;
  // Fields that are bookkeeping noise, not user-meaningful changes.
  const NOISE_FIELDS = new Set(['updated_at', 'updated_by', 'hash', 'previous_hash', 'posted_at', '_rev']);

  // Resolve THE omni that gets persisted. PentagonDB.getCached() is the
  // authoritative v6 cache: finance mutate writes land there, saveData() POSTs
  // it, and force-reloads refresh it from the server (so a persisted changeLog
  // always comes back). Prefer it over the bare `omni` global, which goes stale
  // relative to the cache after any PentagonDB.load({force:true}) (the finance
  // tab does exactly that). Falls back to bare omni only when PentagonDB is
  // unavailable. Inside a PentagonDB.mutate the passed db IS getCached(), so
  // recordInto(db,...) and record()/list() all target the same object.
  function O() {
    try {
      if (window.PentagonDB && typeof window.PentagonDB.getCached === 'function') {
        const db = window.PentagonDB.getCached();
        if (db && typeof db === 'object') {
          if (!db.omni || typeof db.omni !== 'object') db.omni = {};
          return db.omni;
        }
      }
    } catch (_) {}
    if (typeof omni !== 'undefined' && omni && typeof omni === 'object') return omni;
    if (typeof window.ensureOmni === 'function') { try { return window.ensureOmni(); } catch (_) {} }
    return (window.omni && typeof window.omni === 'object') ? window.omni : null;
  }

  function nowIso() { return new Date().toISOString(); }

  function currentActor() {
    try {
      const auth = window.PentagonAuth || window.OctagonAuth;
      if (auth && typeof auth.getCurrentUser === 'function') {
        const u = auth.getCurrentUser();
        if (u) return u.displayName || u.name || u.id || 'system';
      }
    } catch (_) {}
    return 'system';
  }

  // Frozen-zone guard (§1): never track HR/payroll/timesheet/attendance edits.
  function isFrozen(collection) {
    const c = String(collection || '').toLowerCase();
    return c.includes('employee') || c.includes('attendance') || c.includes('timesheet') ||
           c.includes('payroll') || c.includes('salar');
  }

  function ensureLogOn(container) {
    if (!container || typeof container !== 'object') return null;
    if (!Array.isArray(container.changeLog)) container.changeLog = [];
    return container.changeLog;
  }

  function pushEntry(log, entry) {
    if (!Array.isArray(log)) return null;
    log.push(entry);
    if (log.length > CAP) log.splice(0, log.length - CAP); // evict oldest
    return entry;
  }

  function buildEntry(collection, id, patch, actor) {
    return {
      id: 'chg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      ts: nowIso(),
      collection: String(collection),
      recordId: String(id == null ? '' : id),
      actor: actor || currentActor(),
      changes: normalizeChanges(patch),
    };
  }

  // Accepts either an already-shaped {field:{from,to}} object, an {_event:...}
  // marker, or a flat patch of new values. Always returns a plain object.
  function normalizeChanges(patch) {
    if (!patch || typeof patch !== 'object') return {};
    return patch;
  }

  // Append to the LIVE omni.changeLog (bare global). For omni-layer callers that
  // will run their own saveData(). Returns the entry (or null if frozen/blocked).
  function record(collection, id, patch, actor) {
    try {
      if (!collection || isFrozen(collection)) return null;
      const o = O();
      const log = ensureLogOn(o);
      if (!log) return null;
      return pushEntry(log, buildEntry(collection, id, patch, actor));
    } catch (_) { return null; }
  }

  // Append into a SPECIFIC db object (the one a PentagonDB.mutate mutator is
  // about to save). Ensures db.omni.changeLog exists. Persisted by that mutate's
  // save — no extra write needed. Returns the entry (or null if frozen/blocked).
  function recordInto(db, collection, id, patch, actor) {
    try {
      if (!db || typeof db !== 'object') return record(collection, id, patch, actor);
      if (!collection || isFrozen(collection)) return null;
      if (!db.omni || typeof db.omni !== 'object') db.omni = db.omni || {};
      const log = ensureLogOn(db.omni);
      if (!log) return null;
      return pushEntry(log, buildEntry(collection, id, patch, actor));
    } catch (_) { return null; }
  }

  // Compute a {field:{from,to}} diff of two record snapshots, skipping noise, and
  // record it if anything meaningful changed. `target` may be a db (recordInto)
  // or null (record on the live omni).
  function recordDiff(collection, id, before, after, actor, target) {
    const changes = diff(before, after);
    if (!Object.keys(changes).length) return null;
    return target ? recordInto(target, collection, id, changes, actor) : record(collection, id, changes, actor);
  }

  function diff(before, after) {
    const out = {};
    const keys = Array.from(new Set([...Object.keys(before || {}), ...Object.keys(after || {})]));
    keys.forEach(k => {
      if (NOISE_FIELDS.has(k)) return;
      const a = before ? before[k] : undefined;
      const b = after ? after[k] : undefined;
      try {
        if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
      } catch (_) {
        if (a !== b) out[k] = { from: String(a), to: String(b) };
      }
    });
    return out;
  }

  // Newest-first entries for a record (or a whole collection when id omitted).
  function list(collection, id) {
    const o = O();
    const log = (o && Array.isArray(o.changeLog)) ? o.changeLog : [];
    return log.filter(e =>
      (!collection || e.collection === collection) &&
      (id == null || e.recordId === String(id))
    ).slice().reverse();
  }

  /* ───────── reader UI: «سجل التغييرات» drawer ───────── */

  function ensureDrawerStyles() {
    if (document.getElementById('trackChangesStyles')) return;
    const style = document.createElement('style');
    style.id = 'trackChangesStyles';
    style.textContent = `
      #trackChangesDrawer{position:fixed;top:0;right:0;height:100vh;width:min(420px,92vw);
        background:var(--surface,#fff);color:var(--text,#111);box-shadow:-8px 0 32px rgba(0,0,0,.28);
        z-index:99999;transform:translateX(100%);transition:transform .22s ease;display:flex;flex-direction:column;direction:rtl}
      #trackChangesDrawer.open{transform:translateX(0)}
      #trackChangesDrawer .tc-head{display:flex;justify-content:space-between;align-items:center;
        padding:14px 16px;border-bottom:1px solid var(--border,rgba(0,0,0,.1))}
      #trackChangesDrawer .tc-head h3{margin:0;font-size:15px}
      #trackChangesDrawer .tc-close{cursor:pointer;border:none;background:transparent;font-size:20px;color:inherit}
      #trackChangesDrawer .tc-body{overflow:auto;padding:12px 16px;flex:1}
      #trackChangesDrawer .tc-entry{border:1px solid var(--border,rgba(0,0,0,.08));border-radius:10px;
        padding:10px 12px;margin-bottom:10px;background:var(--surface-2,rgba(0,0,0,.02))}
      #trackChangesDrawer .tc-meta{font-size:11px;color:var(--text-muted,#888);margin-bottom:6px;
        display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
      #trackChangesDrawer .tc-field{font-size:12px;margin:2px 0}
      #trackChangesDrawer .tc-field b{color:var(--accent,#3b82f6)}
      #trackChangesDrawer .tc-from{color:var(--danger,#b91c1c);text-decoration:line-through;opacity:.8}
      #trackChangesDrawer .tc-to{color:var(--success,#15803d)}
      #trackChangesDrawer .tc-empty{color:var(--text-muted,#888);text-align:center;padding:24px 0;font-size:13px}
      #trackChangesOverlay{position:fixed;inset:0;background:rgba(0,0,0,.28);z-index:99998;display:none}
      #trackChangesOverlay.open{display:block}
    `;
    document.head.appendChild(style);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  function fmtValue(v) {
    if (v === undefined) return '—';
    if (v === null) return 'null';
    if (typeof v === 'object') { try { return JSON.stringify(v); } catch (_) { return String(v); } }
    return String(v);
  }

  function renderEntries(collection, id) {
    const entries = list(collection, id);
    if (!entries.length) return '<div class="tc-empty">لا يوجد سجل تغييرات لهذا السجل بعد.</div>';
    return entries.map(e => {
      const changes = e.changes || {};
      let fieldsHtml;
      if (changes._event) {
        fieldsHtml = `<div class="tc-field"><b>${esc(eventLabel(changes._event))}</b></div>` +
          Object.keys(changes).filter(k => k !== '_event').map(k =>
            `<div class="tc-field">${esc(k)}: ${esc(fmtValue(changes[k]))}</div>`).join('');
      } else {
        fieldsHtml = Object.keys(changes).map(k => {
          const c = changes[k] || {};
          return `<div class="tc-field"><b>${esc(k)}</b>: <span class="tc-from">${esc(fmtValue(c.from))}</span> ← <span class="tc-to">${esc(fmtValue(c.to))}</span></div>`;
        }).join('') || '<div class="tc-field">—</div>';
      }
      return `<div class="tc-entry">
        <div class="tc-meta"><span>${esc(e.actor)}</span><span>${esc(formatTs(e.ts))}</span></div>
        ${fieldsHtml}
      </div>`;
    }).join('');
  }

  function eventLabel(ev) {
    return { created: 'تم الإنشاء', posted: 'تم الترحيل', cancelled: 'تم الإلغاء', updated: 'تم التعديل', deleted: 'تم الحذف' }[ev] || ev;
  }

  function formatTs(ts) {
    try { return new Date(ts).toLocaleString('ar'); } catch (_) { return ts; }
  }

  function closeDrawer() {
    const d = document.getElementById('trackChangesDrawer');
    const o = document.getElementById('trackChangesOverlay');
    if (d) d.classList.remove('open');
    if (o) o.classList.remove('open');
  }

  function openDrawer(collection, id, title) {
    ensureDrawerStyles();
    let overlay = document.getElementById('trackChangesOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'trackChangesOverlay';
      overlay.addEventListener('click', closeDrawer);
      document.body.appendChild(overlay);
    }
    let drawer = document.getElementById('trackChangesDrawer');
    if (!drawer) {
      drawer = document.createElement('div');
      drawer.id = 'trackChangesDrawer';
      document.body.appendChild(drawer);
    }
    drawer.innerHTML = `
      <div class="tc-head">
        <h3>سجل التغييرات${title ? ' · ' + esc(title) : ''}</h3>
        <button class="tc-close" onclick="TrackChanges.closeDrawer()" aria-label="إغلاق">×</button>
      </div>
      <div class="tc-body">${renderEntries(collection, id)}</div>`;
    // force reflow then open (so the transition runs)
    void drawer.offsetWidth;
    drawer.classList.add('open');
    overlay.classList.add('open');
  }

  window.TrackChanges = {
    record, recordInto, recordDiff, diff, list,
    openDrawer, closeDrawer, isFrozen, CAP,
  };
})();
