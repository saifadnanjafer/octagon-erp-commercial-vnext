# Lane C completion — TEST

## How to run

```bash
node scripts/test-lane-c-completion.mjs
```

- Isolated DB: `vnext-data/test-lane-c.db` (created fresh, deleted at the end
  of the run — never touches the shared `vnext-data/vnext.db` or the other
  suite's `vnext-data/test-completion.db`).
- No network port is bound. All HTTP-shaped calls (custom-fields admin API,
  doc-state transitions, notify preferences) go through in-process mock
  `req`/`res` objects, matching the existing
  `scripts/test-vnext-kernel-completion.mjs` pattern. Port **8123** (this
  lane's reserved range) is not needed for these tests; it stays reserved
  for a future real HTTP-level test if one is added.
- Also run `node scripts/check-provenance.mjs` to confirm every new engine
  file under `vnext/server/` and `vnext/client/` carries the required
  provenance header.

## Real output (last run, 2026-07-17, isolated `vnext-data/test-lane-c.db`)

```
  PASS: 0.1 dependency-safe replay order accounts for every migration file currently on disk (no silent drift)
--- APPLYING MIGRATIONS (dependency-safe order — see note above) ---
  applied: 001_r0_scope_contract
  applied: 101_r1_lane_a_tables
  applied: 201_r1_lane_b_tables
  applied: 301_r1_lane_c_tables
  applied: 401_r1_lane_d_tables
  applied: 501_r1_kernel_completion
  applied: 102_r1_lane_a_completion
  applied: 202_r1_lane_b_completion
  applied: 302_r1_lane_c_completion
  applied: 402_r1_lane_d_completion
Migrations applied.
  PASS: 0.2 R0 scope seed applied (company-r0-demo exists for x_records.company_id FK)

=== SUITE 1: NOTIFY MIGRATION HYGIENE (T1.8.1) ===
  PASS: 1.1 x_notification_preferences exists after migrations, before mountNotify() is ever called
  PASS: 1.2 notify.js no longer creates the table at runtime
  PASS: 1.3 migrations/302 is the one that owns the table
  PASS: 1.4 preferences PUT still works end-to-end against the migration-owned table
  PASS: 1.5 send() honors the stored preference (in-app channel persisted)
  PASS: 1.6 in-app notification row was written

=== SUITE 2: SNAPSHOT FIELD CONFIG VALIDATION (T1.5.1) ===
  PASS: 2.1 POST snapshot field without snapshot_of -> 400
  PASS: 2.2 POST snapshot field with incomplete snapshot_of -> 400
  PASS: 2.3 POST valid snapshot field -> 201
  PASS: 2.4 GET list surfaces snapshot_of config
  PASS: 2.5 normalizeSnapshotOf rejects a non-object
  PASS: 2.6 normalizeSnapshotOf accepts a well-formed config

=== SUITE 3: SNAPSHOT MATERIALIZATION SURVIVES REPEATED SOURCE CHANGES (T1.5.1) ===
  PASS: 3.1 transition to posted succeeds
  PASS: 3.2 snapshot materialized immediately at transition (custom.price_snapshot === 100)
  PASS: 3.3 frozen-value marker recorded (not just a coincidental copy)
  PASS: 3.4 snapshot unchanged after FIRST source price change (100, source now 200)
  PASS: 3.5 snapshot unchanged after SECOND source change (rename + price to 300)
  PASS: 3.6 divergence proven: source price (300) !== frozen snapshot (100)
  PASS: 3.7 re-materialization is a documented no-op (already_frozen)
  PASS: 3.8 value still 100 after the no-op re-materialize attempt
  PASS: 3.9 unresolved source reference is skipped, not frozen as null/undefined

=== SUITE 4: SNAPSHOT IMMUTABILITY GUARD (T1.5.1, mock crud-engine) ===
  PASS: 4.1 guard registers a subscriber against the provided crudEngine
  PASS: 4.2 illegal write to a frozen field is reverted
  PASS: 4.3 blocked attempt is audited
  PASS: 4.4 non-violating update is left alone
  PASS: 4.5 payroll/timesheet/attendance entities are never touched by the guard

=== SUITE 5: CLIENT HISTORY PANEL FORMATTING (T1.4.2) ===
  PASS: 5.1 timeAgo: 30s ago -> الآن
  PASS: 5.2 timeAgo: 5 minutes ago -> Arabic plural form
  PASS: 5.3 timeAgo: 2 hours ago -> dual form
  PASS: 5.4 actionLabel: create
  PASS: 5.5 actionLabel: state_transition_post with after.state
  PASS: 5.6 actionLabel: snapshot_materialize
  PASS: 5.7 actionLabel: snapshot_write_blocked
  PASS: 5.8 visibleChanges strips technical/internal fields
  PASS: 5.9 groupByDate groups same-day entries together and keeps distinct days separate
  PASS: 5.10 formatValue renders null/undefined as em dash
  PASS: 5.11 formatValue renders numbers/strings as-is

=== SUITE 6: AUDIT -> HISTORY PANEL INTEGRATION (T1.4.2) ===
  PASS: 6.1 getHistory returns real rows for so1 (materialize + guard events)
  PASS: 6.2 a real snapshot_materialize entry exists and parses through actionLabel
  PASS: 6.3 real materialize diff renders price_snapshot: null -> 100
  PASS: 6.4 real history groups without throwing and preserves total item count

=== SUITE 7: AUDIT EVENT BUS (audit.js additive hook) ===
  PASS: 7.1 subscribeAudit receives entries for every writeAudit call
  PASS: 7.2 unsubscribe stops further delivery
  PASS: 7.3 a throwing subscriber never breaks the audit write itself

--- SUMMARY ---
All assertions PASSED. (43/43)
```

```
$ node scripts/check-provenance.mjs
Provenance lint passed: 39 engine file(s) checked.
```

## Coverage map (acceptance criteria -> assertions)

| Acceptance criterion (roadmap/report) | Assertions |
|---|---|
| Snapshot field materializes at the configured transition | 3.1–3.3 |
| Snapshot never re-resolves; survives the source changing (proven with **two** source changes, hardened per correction) | 3.4, 3.5, 3.7, 3.8 |
| Divergence explicitly proven (source != frozen value) | 3.6 |
| Unresolved reference never freezes garbage | 3.9 |
| Immutable "after" — best-effort enforcement | 4.1–4.4 |
| Never touches payroll/timesheet/attendance/employee | 4.5 |
| snapshot_of config validated at the API boundary | 2.1, 2.2, 2.5, 2.6 |
| Field CRUD unaffected, snapshot config round-trips | 2.3, 2.4 |
| Client history panel: who/when/what, Arabic, diff-level | 5.1–5.11 |
| Backend audit <-> frontend panel actually interoperate (not just fixtures) | 6.1–6.4 |
| Additive audit-event hook works and is safe | 7.1–7.3 |
| Notification preferences table owned by migration only | 1.1–1.3 |
| Notify feature still functions end-to-end | 1.4–1.6 |
| Migration file inventory has not silently drifted from this test's assumptions | 0.1 |

## Manual/visual verification

Open `vnext/client/history-demo.html` directly in a browser (no server
needed — it ships an in-page `fetch` stub imitating
`GET /api/x/audit/:entity/:id`'s real response shape, same pattern as the
existing `vnext/client/chatter-demo.html`). Expected: RTL Arabic timeline,
grouped by day, showing create/update/state-transition/snapshot-materialize/
snapshot-blocked entries with field-level diff rows (field name, strikethrough
"from" value, arrow, green "to" value), theme-consistent with the chatter
widget's visual language.

## Known gaps (see TASK.md for full detail — not silently passed over)

1. **Immutability guard is best-effort, not a pre-write 403.** Documented
   limitation; real fix needs a hook in `crud-engine.js`/`acl-engine.js`
   (not owned by this lane).
2. **Suite 4 uses a mock `crudEngine`**, not the real one, because
   `crud-engine.js`'s `updateRecord()` currently has an unrelated
   pre-existing regression (T1.1.2) that throws on every call. Re-run against
   the real engine once that lane fixes it.
3. **Cross-lane migration-ordering defect** (migrations 102/202/402 vs 501)
   blocks the shared `runMigrations()` batch runner entirely — reported in
   TASK.md, not fixed here (outside owned paths). This test script works
   around it locally by applying each real migration's `up()` in a
   dependency-safe order; no migration file was edited.
