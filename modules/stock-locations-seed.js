/**
 * OCTAGON ERP — modules/stock-locations-seed.js (T5.6)
 *
 * services/stockService.js validates every stock move against `db.locations`
 * (a top-level PentagonDB collection, distinct from `omni`/`omni.storageLocations`)
 * and hardcodes 4 canonical location IDs throughout — LOC_MAIN, LOC_WIP,
 * LOC_SUPPLIERS, LOC_SCRAP — but nothing has ever seeded them, so every stock
 * move creation has always failed with "موقع المصدر غير موجود" (source location
 * not found). Confirmed zero stock_moves/quants exist in the live database.
 *
 * ADD-ONLY, idempotent: checks each id before pushing, safe to call every boot.
 * `type: 'internal'` is the ONLY location-type value stockService.js's
 * isPhysicalLocation() special-cases (real, availability-checked locations);
 * LOC_SUPPLIERS/LOC_SCRAP deliberately use other type values so moves from/to
 * them skip the "enough stock available" check, matching their role as an
 * external source and an adjustment sink rather than real tracked storage.
 *
 * T5.9 (2026-07-16) — boot-storm fix. The original version called
 * PentagonDB.mutate() unconditionally. mutate() = load() + save(db) even when
 * the mutator changes nothing, and this function is fire-and-forget inside
 * ensureOmni() which runs dozens of times at boot — measured result on live:
 * 29 full-DB /api/db round-trips = 106.5 MB per page load, `load` event at
 * 40 s. Fixed with (a) a shared in-flight/once promise so concurrent boot
 * callers coalesce into one run, and (b) a READ-ONLY pre-check via
 * PentagonDB.load() so mutate() — and its full-DB POST — only happens when a
 * canonical location is actually missing (i.e. exactly once in a deployment's
 * lifetime; on live all 4 already exist). Data behavior is unchanged.
 */
(function () {
  'use strict';

  const CANONICAL_LOCATIONS = [
    { id: 'LOC_MAIN', name: 'المخزن الرئيسي', type: 'internal' },
    { id: 'LOC_WIP', name: 'ورشة التنفيذ', type: 'internal' },
    { id: 'LOC_SUPPLIERS', name: 'الموردون', type: 'supplier' },
    { id: 'LOC_SCRAP', name: 'تسوية الفروقات', type: 'inventory' },
  ];

  // Shared across every ensureOmni() invocation: the first caller does the
  // work, everyone else awaits the same promise. Reset to null ONLY on
  // failure so a transient server error can be retried by a later call.
  let seedRun = null;

  function missingFrom(db) {
    const existing = new Set(
      (Array.isArray(db && db.locations) ? db.locations : []).map(function (l) { return l.id; })
    );
    return CANONICAL_LOCATIONS.filter(function (loc) { return !existing.has(loc.id); });
  }

  function seedMissingStockLocations() {
    if (seedRun) return seedRun;
    seedRun = (async function () {
      if (!window.PentagonDB || typeof window.PentagonDB.mutate !== 'function') return;
      // Read-only pre-check first (load() serves from cache after first boot
      // fetch — no extra network in the common case, and NEVER a POST).
      if (typeof window.PentagonDB.load === 'function') {
        const db = await window.PentagonDB.load();
        if (missingFrom(db).length === 0) return; // all 4 present — done, no write
      }
      await window.PentagonDB.mutate(function (db) {
        if (!Array.isArray(db.locations)) db.locations = [];
        missingFrom(db).forEach(function (loc) {
          db.locations.push({
            id: loc.id,
            name: loc.name,
            type: loc.type,
            parent_id: null,
            created_at: new Date().toISOString(),
            created_by: 'system',
            is_active: true,
          });
          console.log('[stock-locations-seed] Seeded missing canonical location: ' + loc.id);
        });
      });
    })().catch(function (e) {
      console.warn('[stock-locations-seed] failed:', e);
      seedRun = null; // allow a later ensureOmni() to retry after a failure
    });
    return seedRun;
  }

  window.seedMissingStockLocations = seedMissingStockLocations;
})();
