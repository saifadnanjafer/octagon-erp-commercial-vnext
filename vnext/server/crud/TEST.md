# Lane A completion — TEST

## Isolated by design

- Its own throwaway SQLite file: `vnext-data/test-lane-a.db` (created fresh,
  deleted at the end of a successful run). **Never** opens
  `vnext-data/vnext.db` or `vnext-data/vnext.json`.
- Its own port, **8121**, reserved for Lane A in the project's 8120-8129
  test-port guardrail — bound only by a bare `node:http` server used to
  smoke-test static-file reachability of the new demo page. This is **not**
  `server.js` and mounts none of the app's real subsystems/routes.
- Does not call the shared `runMigrations()` wrapper directly (see the
  cross-lane note below) — applies each `migrations/*.mjs` file itself so a
  concurrent, unrelated lane's migration bug can't block verifying this
  lane's own changes.

## Run

```
node scripts/test-lane-a-completion.mjs
```

Exit code is `0` only if every assertion passes; non-zero otherwise. Every
check is a real `assert(condition, label, detail)` (prints `PASS`/`FAIL` and
increments a counter) — none of them unconditionally print `PASS`.

## Expected output (actual, captured 2026-07-17)

```
--- APPLYING MIGRATIONS (isolated test DB) ---
  SKIPPED 202_r1_lane_b_completion (cross-lane blocker, not Lane A's file): no such table: x_approval_policies
  SKIPPED 402_r1_lane_d_completion (cross-lane blocker, not Lane A's file): no such table: x_api_keys
Migrations applied: [
  '001_r0_scope_contract',   '101_r1_lane_a_tables',
  '102_r1_lane_a_completion','201_r1_lane_b_tables',
  '301_r1_lane_c_tables',    '302_r1_lane_c_completion',
  '401_r1_lane_d_tables',    '501_r1_kernel_completion'
]
  PASS: migration 102_r1_lane_a_completion applied cleanly
  PASS: 501_r1_kernel_completion (x_doc_states, etc.) applied — needed for Suite 3
Seed data applied.

=== SUITE 1: CRUD ENGINE WRITE-PATH REGRESSION (T1.1.2) ===
  ... 9 assertions, all PASS (create/update/delete/audit, direct-call + full HTTP path)

=== SUITE 2: STATE-DEF FULL-GRAPH VALIDATION (T1.3.1a) ===
  ... 6 assertions, all PASS (empty states / dangling ref / unreachable state
      each rejected with a named problem; valid graphs accepted; updated_at/
      updated_by recorded)

=== SUITE 3: POSTED-DOCUMENT IMMUTABILITY GUARD (T1.3.1b) ===
  ... 8 assertions, all PASS (terminal-state 409 on update+delete, HTTP path
      too, reversal transition still works, non-terminal record unaffected)

=== SUITE 4: CLIENT UI REACHABILITY (T1.1.3) ===
  ... 35 assertions, all PASS (no mojibake in any client file, demo.html
      wiring correct, isolated allowlisted static server round-trip on 8121)

--- LANE A COMPLETION TESTS: 58 passed, 0 failed ---
```

Re-run 3x back to back to confirm determinism — `58 passed, 0 failed`, exit
code `0`, every time.

## Cross-lane note baked into the harness

`migrations/202_r1_lane_b_completion.mjs` (Lane B's file, not owned or
touched by this lane) has an ordering hazard identical to the one this lane
fixed in its own `102`: it `ALTER TABLE`s tables that
`501_r1_kernel_completion.mjs` creates, but `501` sorts *after* `202` in
filename order. On a fresh database this makes the shared `runMigrations()`
helper (which aborts entirely on the first failing `migration.up()`) never
reach `501` — which would also silently block this lane's own `102` and
every other migration after `202`. The test script does not call
`runMigrations()`; it applies each migration file directly, logs any that
fail as `SKIPPED (cross-lane blocker, not Lane A's file)`, and continues, so
Lane A's own changes are provably correct independent of when Lane B's `202`
gets its own fix. `migrations/402_r1_lane_d_completion.mjs` has the exact
same pattern (`x_api_keys`, also from `501`) — same note applies, also not
touched.

**This workaround is confined to the test script.** The real
`runMigrations()` used by `server.js` at boot is unchanged; if `202`/`402`
are not fixed before integration, boot-time migration will still abort at
`202` on a fresh database. Recommend the integrator/Lane B/Lane D apply the
same `CREATE TABLE IF NOT EXISTS <full shape>` pattern used in
`102_r1_lane_a_completion.mjs` to their own `*02` migrations.

## Other verification run

```
node --check vnext/server/crud/crud-engine.js
node --check vnext/server/state/doc-state.js
node --check migrations/102_r1_lane_a_completion.mjs
node --check <each of the 10 fixed vnext/client/*.js files>
node scripts/check-provenance.mjs
```

`check-provenance.mjs` output: `Provenance lint passed: 39 engine file(s)
checked.`
