# Lane B — Tests

Run:

```
node scripts/test-lane-b-completion.mjs
```

- Uses its own throwaway SQLite file (`vnext-data/test-lane-b.db`, deleted at
  the end of the run) — never the shared `vnext-data/vnext.db`.
- Applies every migration on disk in **real plain-alphabetical order** (the
  same order `vnext/server/db/migration-runner.mjs` uses at actual server
  boot), not a hand-picked "safe" order, specifically to prove
  `202_r1_lane_b_completion.mjs` survives running before `501_r1_kernel_completion.mjs`
  (see TASK.md "Flagged findings #2").
- No HTTP server is started and no network port is opened; every route is
  exercised through in-process mock `req`/`res` objects (`mockRes` for plain
  JSON responses, `mockStreamRes` — a real `stream.Writable` — for the binary
  attachment-download route so `fs.createReadStream(...).pipe(res)` works
  exactly as it would over a real socket).
- Every `check()` is a genuine comparison against an expected value (ids,
  counts, status strings, byte-for-byte file content, HTTP status codes) —
  none of them just print a label. A failing suite sets `process.exitCode = 1`.
- Cleans up the real files it wrote under `vnext-data/files/` at the end.

## Suites and what they prove

| Suite | Assertions | Proves |
|---|---|---|
| 0 | 5 | migration 202 is on disk and applied; new columns/table exist |
| 1 | 6 | `acl.entityAclKey()` / `acl.rowScopeAllows()` infra fix works |
| 2 | 8 | timeout escalation: sequential-chain advance, admin fallback when the chain is exhausted, audit trail, self-limiting (no thrash) |
| 3 | 5 | withdraw: requester-only, pending-only, 403/409/404 paths, status becomes non-pending |
| 4 | 17 | all nine boxes, including the `todo`/`delegated` distinction (direct role access vs delegation-only access vs a same-named-but-unrelated role), `/counts` matches `/list` |
| 5 | 5 | `@mention` parsing + notification, additive to (not replacing) follower notifications |
| 6 | 8 | attachment upload/list/download, hostile-filename path-traversal safety, 403 for a user with no read grant on both upload and download |
| 7 | 7 | worklist counts differ correctly across `own`/`dept`/`all` scope, safe-default-zero for a dept user with no department, 403 for no read grant, per-saved-view filter narrowing |

**Total: 61 assertions, 0 failures** (real output below).

## Actual run output (this pass)

```
$ node scripts/test-lane-b-completion.mjs
--- APPLYING MIGRATIONS (real plain alphabetical order, same as migration-runner.mjs) ---
  applied: 001_r0_scope_contract
  applied: 101_r1_lane_a_tables
  applied: 102_r1_lane_a_completion
  applied: 201_r1_lane_b_tables
  applied: 202_r1_lane_b_completion
  applied: 301_r1_lane_c_tables
  applied: 302_r1_lane_c_completion
  applied: 401_r1_lane_d_tables
  applied: 402_r1_lane_d_completion
  applied: 501_r1_kernel_completion
Migrations applied (202 survived running before 501 — see note above).
  PASS: 0.1 ... through ... PASS: 7.7 per-saved-view filter narrows the count (status=new: 3 of 4 total)

--- ALL LANE B COMPLETION TESTS PASSED ---
$ echo $?
0
```

(61/61 `PASS:` lines, 0 `FAIL:` lines — grepped and counted as part of this
pass, not eyeballed.)

## Regression check against the pre-existing shared suite

`node scripts/test-vnext-kernel-completion.mjs` was also re-run (read-only,
not modified) to confirm this lane's changes to `approvals.js`/`acl-engine.js`
did not regress the existing shared kernel-completion coverage:

- `TEST SUITE 4: APPROVAL POLICIES & DELEGATION` (the suite that exercises
  `approvals.js` directly) — **both assertions still PASS** after this lane's
  full rewrite of `listApprovals`/`decideApproval` support code.
- `TEST SUITE 5: WORKFLOW DURABILITY` fails/crashes in that shared script, in
  `vnext/server/workflow/workflow-engine.js` — a file this lane never opened
  or edited. Root cause (for the record, not fixed here — out of lane):
  `recoverRunningWorkflows()` fires `resumeWorkflow()` with `void` (fire-and-
  forget, never awaited), so the test's own assertion checks the DB before
  recovery has actually run; the eventual async completion then crashes on
  `run.logs.push(...)` because a *rehydrated* run object (loaded from
  `x_records`, not built by `makeRun()`) never had `logs` initialized. This
  is pre-existing and unrelated to any file this lane touched — confirmed by
  the fact `TEST SUITE 4` (this lane's own approvals coverage) passes cleanly
  both before and after this pass, and this lane's own isolated suite has 0
  failures.
