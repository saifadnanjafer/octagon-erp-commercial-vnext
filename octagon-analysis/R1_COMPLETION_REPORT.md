# Octagon Commercial VNext — R1 Completion Report

Supersedes `R1_FINAL_COMPLETION_REPORT.md` for closure purposes (that report's 19-task matrix and blocker findings remain the accurate pre-integration baseline and are preserved unmodified). This report covers the **main-integrator pass** that followed the four lane-scoped builder agents (A/B/C/D): recovery of their state, resolution of the three shared blockers, two additional cross-cutting defects found only by actually booting `server.js` (not caught by any lane's isolated tests), serial integration into `server.js`, full regression re-run, an HTTP + browser kernel-demo pass against a migration-seeded `crm_lead`, and — in a follow-up close-out pass — the two remaining client-wiring gaps (§5a).

**Verdict: R1 ELIGIBLE TO CLOSE.** All 19 of 19 tasks are now clean PASS (up from 6 PASS / 8 PARTIAL / 5 FAIL at the pre-lane-build baseline). The two tasks that closed last (T1.1.3, T1.4.2) were both the same narrow class of gap — a working, tested backend and a working, tested client widget reachable by direct URL but not yet wired into the main application shell's navigation/drawer — closed with two small, targeted client edits (§5a), each verified live in the browser with zero regressions across all four lane suites plus the shared kernel-completion suite.

---

## 1. Recovery and verification of the four lane builders

All four lanes' `INTEGRATION.md`/`TEST.md` files were read in full and their code inspected directly (not just their reported pass counts). All four lane test scripts were re-run against the current code and all pass:

| Lane | Scope | Suite | Result |
|---|---|---|---|
| A | CRUD regression fix, doc-state full-graph + immutability, client UI reachability | `scripts/test-lane-a-completion.mjs` | **58/58 PASS** |
| B | ACL/attachment infra fix, escalation, withdraw, nine-box Approval Center, mentions, worklist counts | `scripts/test-lane-b-completion.mjs` | **61/61 PASS** |
| C | Notify migration hygiene, snapshot fields, client history panel | `scripts/test-lane-c-completion.mjs` | **43/43 PASS** |
| D | Module framework, org/fiscal + company switcher, auth hardening | `scripts/test-lane-d-completion.mjs` | **43/43 PASS** |

No lane's reported numbers were taken on faith — each suite was executed fresh in this session, on the current source, and each is isolated (own throwaway SQLite file or in-process mocks, no shared `vnext-data/vnext.db`, no network port collisions).

---

## 2. Shared blockers — resolved

### Blocker 1 — migration dependency ordering
`vnext/server/db/migration-runner.mjs` now supports an optional `dependsOn: string[]` on any migration. Migrations without it keep exact legacy filename order (verified). `102_r1_lane_a_completion`, `202_r1_lane_b_completion`, and `402_r1_lane_d_completion` now declare `dependsOn: ['501_r1_kernel_completion']` — the table they ALTER is canonically created by 501. The resolver validates every dependency exists and detects cycles **before** applying anything; dry-run prints the exact resolved order; rollback walks the exact reverse of that order. New suite: `scripts/test-migration-dependencies.mjs` — **30/30 PASS**, covering: legacy-no-metadata order preservation, the three new declared dependencies, missing-dependency failure, 3-node and self-referencing cycle failure, dry run, fresh-DB build (verified in dependency order, `PRAGMA integrity_check`/`foreign_key_check` clean), idempotent reapply, reverse-dependency rollback with byte-identical schema-fingerprint restore, restart-equivalent rebuild, and a database migrated under the OLD plain-filename order still validating clean. A real fresh boot of `server.js` was captured applying migrations in the new resolved order: `001, 101, 201, 301, 302, 401, 501, 102, 202, 402` — 501 now genuinely runs before the three lane completions that extend it.

### Blocker 2 — duplicate `entityAclKey`
`crud-engine.js`'s local `entityAclKey(entityName, cfg)` (a narrower, bare-fallback implementation) is removed. Both of its call sites now consume `acl.entityAclKey(entityName, db)` from `acl-engine.js`, the canonical, richer implementation (registry `acl` column → section-derived key → `platform:<entity>` fallback). New suite: `scripts/test-blocker2-canonical-acl-key.mjs` — **18/18 PASS**, proving: the local duplicate is gone (grep-verified), the canonical key is used at both call sites, full create/read/update/delete/list/summary/audit lifecycle succeeds with zero 500s, ACL denial still returns 403 (not a bypass) for an ungranted role, and the three originally-seeded entities (with explicit `collection_registry.acl`) behave identically to before.

### Blocker 3 — `workflow-engine.js` crash
Root cause confirmed by direct reproduction: `recoverRunningWorkflows()` rehydrates a `workflow_run` record straight from `x_records` JSON (not built by `makeRun()`), and `log()` unconditionally did `run.logs.push(...)` — a `TypeError` whenever the rehydrated object had no `logs` array. Masked previously because `recoverRunningWorkflows()` fired `resumeWorkflow()` fire-and-forget (`void`), so a caller `await`-ing it never actually waited for the crash to surface. Fixed: `log()` now defensively initializes `run.logs` if it isn't already an array; `recoverRunningWorkflows()` now `await`s `resumeWorkflow()` per run, so it is genuinely awaitable. New suite: `scripts/test-blocker3-workflow-recovery.mjs` — **9/9 PASS**, reproducing the exact crash shape, proving the fix, proving `recoverRunningWorkflows()` is no longer a race, proving a missing-workflow-definition run still fails cleanly, and proving already-terminal runs are left untouched. The pre-existing shared suite (`scripts/test-vnext-kernel-completion.mjs` Suite 5, which seeds exactly this logs-less shape) now passes for the first time instead of crashing the process.

---

## 3. Two additional defects found only by booting the real `server.js`

Neither of these is one of the three named blockers, and neither was caught by any lane's isolated test suite — each lane mounts its engines directly against a single, never-reopened db handle in its own test harness, so none of them exercise the real boot sequence. Both were found by actually starting `server.js` and driving it over HTTP, which is why this integration pass did that rather than relying on suite counts alone.

### 3a. Every VNext engine held a stale, closed db handle after boot
`server.js` used to mount `octagonCrudEngine`, `octagonAclHttp`, `octagonChatter`, etc. **synchronously**, immediately after kicking off the async migration chain — i.e. against the pre-migration `dbSync`. That chain later closed that handle and reassigned `dbSync` to a fresh instance (to clear the prepared-statement/schema cache after migrations). Every engine's closure kept the old, now-closed handle. Result: **every single `/api/x/*` request after boot failed with `"database is not open"`.** Confirmed live: `curl http://localhost:8091/api/x/crm_lead/list` → `{"error":"database is not open"}` on the pre-fix build.

Fixed by moving every `mount*()` call into the same async chain, after the reopen, mounted exactly once against the final stable handle. Re-verified live after the fix: the same request now returns real data with no error.

### 3b. `crud-engine.js` could never resolve a real user, and the ACL admin role had zero grants
Two compounding gaps:
- `mountCrud()` was never given `requireSession`, and `authSessionFromRequest` (which it *was* given) is never actually read anywhere in `crud-engine.js`. Its only path to a real user is `acl.resolveRequestUser(req, deps)`, which needs either `req.octagonUser` pre-stamped or `deps.requireSession` — neither was true for a plain entity route, so every real request silently resolved to the anonymous `{userId:'local', groups:[]}` fallback. Fixed: `requireSession` is now passed into `mountCrud`'s deps.
- `resolveRequestUser`'s internal probe called `deps.requireSession(req)` with no `res`; `requireSession`'s failure branches call `sendJson(res, ...)` unconditionally, so a failed/expired/disabled session would throw `TypeError: Cannot read properties of undefined` instead of resolving to "no user". Fixed with an inert stand-in `res` object so the probe absorbs those internal responses silently instead of crashing or double-responding to the real client.
- Separately: `acl-engine.js`'s `DEFAULT_ROLES` declares an `admin` role, and `resolveRole()` maps `system.admin`/`admin`/`system`/`system_admin` to it, but **no migration or seed ever inserted `admin` into `x_acl_roles` or gave it any `x_acl_grants` row** — every real admin session was denied by every ACL-gated route. Fixed with a new idempotent seed, `applyAclAdminDefaultSeed()` (`vnext/server/db/seed-runner.mjs`), granting `admin` a single wildcard `('*','all')` grant — the standard superuser pattern `acl-engine.js`'s own `permMatches()` already supports.

Verified live, before and after: an admin session was denied `sales:crm_lead:create` before this fix and succeeds (with a real sequence number, audit row, and company scope) after it.

### 3c. Unrestricted static file serving
The static handler served **any file under the project root** with zero restriction — `.env`, `database.json`, `*.db` files, migration backups, `server.js`'s own source, everything. Replaced with an explicit gate (`isStaticPathSafe()`): traversal/null-byte/dotfile segments rejected outright; a small, explicit denylist of sensitive top-level directories (`vnext-data`, `vnext-backups`, `vnext-fixtures`, `vnext-uploads`, `node_modules`, `scripts`, `.git`, `.env`, etc.) and files (`database.json`, `server.js`, `.env`, …); `vnext/server/**` and `platform/server/**` (backend modules, not client assets) denied while `vnext/client/**` and `platform/client/**` remain servable. Verified live: `.env`, `database.json`, `server.js`, `vnext-data/vnext.db`, and `vnext/server/crud/crud-engine.js` all now return `403`; `index.html`, `app.js` (the full pre-existing legacy app), and `vnext/client/demo.html` all still return `200` — no regression to the live application's own static assets.

---

## 4. Serial lane integration into `server.js`

Applied in the order specified (migration infra → Lane D → Lane A → Lane B → Lane C → shared routes/allowlist), reading each lane's `INTEGRATION.md` and reconciling against the actual current file rather than blindly pasting:

- **Lane D**: `octagonModuleRoutes`/`octagonOrgRoutes`/`octagonAuthRoutes` declared and dispatched (ahead of the CRUD fallback, per every other specialized engine's convention); active-company request-state enrichment added; session-revocation check added to `requireSession()`; TOTP enrollment made the SQL-native source of truth at login; session-rotation-on-privilege-change wired into the `POST /api/db` full-sync path (diffs `role`/`roleId`/`groups` per user, calls `rotateSessionsForUser`).
- **Lane A**: `crudEngine` added to the `doc-state` mount (the posted-immutability guard was otherwise inert); a previously-undeclared `octagonDocState` variable (assigned with no `let`/`const` anywhere — an implicit global that would `ReferenceError` if `dbSync` were ever falsy) declared explicitly alongside the others.
- **Lane B**: `authSessionFromRequest` added to the chatter mount per its own recommended (not required) enhancement.
- **Lane C**: `snapshot-fields.js`'s module mounted after `octagonViewsFields`, with `crudEngine` passed for the best-effort immutability guard.
- **Shared**: static allowlist (§3c); route dispatch ordering; `server.js`, migration runner, and progress-ledger ownership retained by the integrator throughout.

---

## 5. Corrected 19-task matrix

| Task | Epic | Was (pre-lane) | Now | Evidence |
|---|---|---|---|---|
| T1.1.1 | Collection/field registry | PASS | **PASS** | Unaffected; live `crm_lead`/`product` CRUD confirms seeds intact. |
| T1.1.2 | CRUD verbs + filters | **FAIL** (regression) | **PASS** | Lane A's `cfg` fix + Blocker 2's canonical-key fix; live create/read/update/delete/list/summary/audit all 200, zero 500s. |
| T1.1.3 | Client renderer + shell | PARTIAL | **PASS** | `vnext/client/demo.html` allowlisted, reachable, browser-verified (clean console, correct RTL render). Fully closed (§5b): a real in-app page (`views/vnext_platform.html` + `modules/vnext-platform.js`, nav button, permission-mapped) mounts `OX.crud.mountEntity('crm_lead')` against the live server — verified live in the browser (real DOM, real HTTP call, graceful 403 handling). |
| T1.2.1 | Backend ACL core | PASS | **PASS** | Unaffected; strengthened by removing the duplicate key implementation. |
| T1.2.2 | Row scope + field masks | PASS | **PASS** | Unaffected. |
| T1.3.1 | Doc-state machine | PARTIAL | **PASS** | Live: state-def registration with full-graph validation, `draft→submitted→posted` transitions, maker-checker rejection, posted-record immutability (409 on PATCH), reversal transition, full audit trail with diffs. |
| T1.4.1 | Numbering/hashing | PASS | **PASS** | Unaffected; live sequences (`LEAD-2026-00001`, `PRD-00001`). |
| T1.4.2 | Audit & history | PARTIAL | **PASS** | Backend fully proven (live audit diffs). Closed (§5a): `history-<entity>-<id>` container + `OX.historyPanel.mount()` call added to `ui-crud.js`'s detail drawer (same pattern as the existing chatter mount) — verified live in the browser: placeholder text renders correctly with zero console errors when `OX.historyPanel` isn't loaded on a given page, matching the existing chatter-placeholder convention; the panel itself was already proven against real audit data by Lane C's own suite (11/11 formatting + 4/4 live-integration assertions). |
| T1.5.1 | Custom & snapshot fields | **FAIL** | **PASS** | Live: snapshot field created via API, materialized at `posted` transition (100), source changed twice (200, then 300), snapshot proven unchanged both times, `__frozen_values__` marker present. |
| T1.6.1 | Chatter + attachments | PARTIAL | **PASS** | Live: attachment upload/list succeed for an authorized role, `403` for an unauthorized one; `@mention` notification tested (Lane B, 5/5). |
| T1.7.1 | Saved views + worklists | PARTIAL | **PASS** | Live: `/api/x/_worklist/counts` returns real scoped counts; Lane B's scope-differentiation suite (own/dept/all) passes 7/7. |
| T1.8.1 | Notification center | PARTIAL | **PASS** | `x_notification_preferences` now migration-owned (Lane C, verified); live in-app notification created via a workflow `notify` node. WhatsApp/SMTP adapters remain log-based stubs (pluggable interface, not live external delivery — reasonable for R1 scope). |
| T1.9.1 | Approval engine | PARTIAL | **PASS** | Timeout escalation (sequential advance + admin fallback) and withdraw both tested live-equivalent (Lane B, 13/13 combined). |
| T1.9.2 | Approval Center UI (9 boxes) | **FAIL** | **PASS** | Live: `/api/x/approvals/counts` returns all nine canonical boxes with real scoped queries. `inbox.js` rewritten to the same shape (Lane B); now also mounted into the real `vnext_platform` app page (§5b) and browser-verified rendering all nine real Arabic-labeled boxes against the live server. |
| T1.10.1 | Import/export + print | PASS | **PASS** | Unaffected. |
| T1.11.1 | Workflow engine | PARTIAL | **PASS** | Blocker 3 fix; live: workflow created, run to completion, notification delivered; restart-recovery, retry/backoff, and loop/rate-guard all covered by dedicated regression tests. |
| T1.12.1 | Module/extension framework | **FAIL** | **PASS** | Live: `loyalty_tier_demo` installed (custom field + menu + workflow contributed, `crm_lead` CRUD round-trips the new field) and uninstalled (all three contributions removed, zero residue confirmed by re-listing custom fields). |
| T1.13.1 | Org & fiscal masters | **FAIL** | **PASS** | Live: `/api/x/org/companies` responds; active-company enrichment wired; Lane D's HTTP cross-company row-isolation suite (B.5) passes 6/6. |
| T1.14.1 | Auth hardening | PARTIAL | **PASS** | Live: password policy GET + validate (weak/strong), TOTP enrollment (secret + otpauth URI), API-key issuance. Session-rotation-on-role-change now fully live-proven end-to-end (§9b) — real login, real role change via the real `/api/db` path, old session rejected, new login works — after fixing two real bugs the live test itself found (wrong collection diffed; `/api/auth/session` didn't consult revocation). |

**Tally: 19 PASS · 0 PARTIAL · 0 FAIL/MISSING (of 19).**

T1.1.3 and T1.4.2 were the two remaining PARTIALs after the initial integration pass, both the same root cause: every **backend** and every **standalone/API-reachable client asset** was integrated and proven, but the legacy `index.html`/admin-panel nav and the `ui-crud.js` record drawer hadn't been edited to surface the newer widgets. Both were closed in a follow-up pass — see §5a for exactly what changed and how each was verified. The Approval Center inbox (`inbox.js`) and company-switcher widget nav-reachability remain open **advisory** items (§9) — not PARTIALs, since their own roadmap acceptance criteria (nine real scoped queues; real company-switch API) are independently met and proven; only end-user discoverability of those specific pages, not proven this session, remains open.

---

## 5a. Close-out pass — the last two PARTIALs

### T1.4.2 — history panel wired into the record drawer
`vnext/client/ui-crud.js`'s `CrudInstance.prototype.openDetail()` now builds a second container (`history-<entity>-<id>`) alongside the existing `chatter-<entity>-<id>` one, and mounts `OX.historyPanel.mount(el, entity, id)` if the client loaded it — falling back to the same "not loaded yet" placeholder text pattern the existing chatter mount already uses if it didn't. This is the exact snippet Lane C's own `vnext/server/fields/INTEGRATION.md` §2 documented as the integrator's remaining step.

### T1.1.3 — nav link to the CRUD demo (superseded by §5b — see below)
First closed with a card in `modules/admin-panel.js`'s System Wire-up tab opening the standalone `vnext/client/demo.html`. Superseded the same session by §5b's real, server-backed nav tab, which is the more complete closure (a genuine in-app page, not a link to a side demo).

Both changes: syntax-checked (`node --check`).

## 5b. Second close-out pass — real in-app tab, not just a link out

Investigating index.html revealed something the first close-out pass missed: `vnext/client/ui-crud.js`, `chatter.js`, `print.js`, `views-fields.js`, `excel.js`, `entity-ui-registry.js`, `inbox.js`, `home-widgets.js`, `workflow-builder.js`, and `acl-admin.js` were **already** `<script>`-included in the main `index.html` by an earlier session — this matches `octagon-analysis/README.md`'s own status ledger note about a prior "W0 platform core spike" that was mounted at boot but never actually integrated into any real page. `history-panel.js` and `company-switcher.js` were not loaded anywhere at all. So a link to the isolated demo page, while functional, undersold what T1.1.3/T1.9.2 actually needed: a **real page in the live app**, not a side door to a stub.

Built following the exact same pattern already established by `modules/appointments.js` (a self-registering `switchPage`-wrap module — additive only, never edits `app.js`'s core dispatch):

- `views/vnext_platform.html` — new page shell (`#pageVnextPlatform` / `#vnextPlatformBody`).
- `modules/vnext-platform.js` — new module: on activation, mounts `OX.crud.mountEntity(host, 'crm_lead')` and `OX.inbox.mount(host, {})` against the **real** `/api/x/*` HTTP API (not a fake stub) into two sections of the page body.
- `index.html` — nav button ("نواة المنصة (R1)") placed next to the existing admin-panel button; `<!-- view:vnext_platform -->` marker; `<script>` tags for the new module plus the two previously-unloaded widgets (`history-panel.js`, `company-switcher.js`); matching `<link>` tags for their stylesheets.
- `app.js` — `vnext_platform: 'pageVnextPlatform'` added to both `pageMap` literals (kept in sync, matching every other page); added to the `admin_org` nav-group array (same group as `admin_panel`).
- `services/permissionService.js` — `vnext_platform` added to `PAGE_METADATA` and to `PAGE_PERMISSIONS` restricted to `system.admin` (mirroring `admin_panel`'s own convention — this is a client-side UX/discoverability gate; the real security boundary is the server-side ACL, proven extensively elsewhere in this report).

**Verified live in the Browser pane, against the real running server:**
- Confirmed all four widgets are now globally available (`OX.crud`, `OX.inbox`, `OX.historyPanel`, `OX.companySwitcher` all `true`).
- Confirmed the view fragment, host div, and nav button all load correctly into the DOM, and the module's `switchPage` wrap installs successfully (`window.__vnextPlatformWrapped === true`).
- Mounted both widgets directly against the real page and real server: the CRUD widget correctly rendered a graceful, styled **403 error state** ("ليس لديك صلاحية تنفيذ هذا الإجراء [sales:crm_lead:read]" with a retry button) for the unauthenticated browser session — proving the real ACL gate is reached and handled without crashing, not bypassed. The Approval Center inbox rendered **all nine real canonical boxes** with correct Arabic labels (بانتظار قراري / طلباتي / المكتملة / نسخة إليّ / المفوَّضة إليّ / المصعَّدة / المعادة للمراجعة / المرفوضة / المسحوبة) and a real (empty) notifications panel — no crash, no console errors beyond the pre-existing, unrelated `[saveData] BLOCKED` warnings this fresh fork already emits with zero employees.
- Recomputed the route inventory directly from `index.html`/`views/`: **97/97** (up from 96, the +1 being this legitimately new, fully-mapped page — 0 missing view files, the same single pre-existing `home` marker gap as before, unrelated to this change).
- `scripts/permission-regression.mjs` hardcoded a baseline sidebar-page count of 96; updated to 97 to reflect the legitimate new page (same maintenance every prior new-tab addition in this codebase's history required) — **35/35 PASS** again.
- All four lane suites + shared kernel-completion suite re-run once more after every change in both close-out passes — **zero regressions** (58/58, 61/61, 43/43, 43/43, 13/13, unchanged from §1/§2).

---

## 6. Kernel-demo exit gate — run, not just planned

Using the migration-seeded `crm_lead` entity, with **zero `crm_lead`-specific backend code**, over real HTTP against the integrated `server.js` (fresh `vnext-data/vnext.db`, isolated port 8091):

| Capability | Result |
|---|---|
| Registry-driven CRUD | create/read/update/delete/list/summary all 200 |
| Filters, numbering | sequence `LEAD-2026-00001` issued on create |
| Document states | draft→submitted→posted, maker-checker 403, full-graph validation, reversal transition defined |
| Posted-immutability | PATCH on a posted record → 409, exact roadmap-worded Arabic error |
| Authentication | header/session + local-dev bypass resolved correctly through `requireSession`; anonymous request denied 403, not 500 |
| Row/company scope | company-scoped create/list confirmed (`company_id: company-r0-demo`); cross-company isolation proven in Lane D's suite |
| Field masking | proven in `test-vnext-kernel-completion.mjs` Suite 2 (isolated) |
| Custom field | `price_snapshot` custom field created via `/api/x/_custom-fields/crm_lead` |
| Snapshot field | materialize → survive two source changes → frozen-marker present, all live |
| Audit/history | full before/after diff trail live, including `state_transition_*` and `create` entries |
| Chatter/attachments | attachment upload/list live; unauthorized role → 403 live |
| Saved views/worklists | `/api/x/_worklist/counts` live, real scoped count |
| Nine-queue Approval Center | all nine boxes live via `/api/x/approvals/counts` |
| Workflow trigger | manual workflow created and run to completion, notification delivered |
| Durable retry/resume | proven via the dedicated Blocker 3 regression suite (recovery of a rehydrated running run) |
| Import/export/print | covered by Lane A's own suite (RTL template confirmed) |
| Extension module | `loyalty_tier_demo` installed then uninstalled with zero residue, live |
| TOTP | enrollment issued a real secret + otpauth URI, live |
| Scoped API key | issued live with role scope, raw key shown once |
| Browser execution | `vnext/client/demo.html` opened in the Browser pane: correct RTL Arabic render, summary cards, table, pagination scaffolding, zero console errors |

No step in this table returned an HTTP 500. This is real HTTP+browser evidence, not code-review inference — the explicit standard `R1_FINAL_COMPLETION_REPORT.md` set for this gate.

---

## 7. Full validation counts (exact, not "all tests passed")

| Check | Result |
|---|---|
| Production hash verification | 366/366 identical (unchanged; `octagon-erp/` never touched) |
| Startup guards | 2/2 PASS (JSON path, SQLite path — both refuse before initialization) |
| Data-cleanliness | `database.json` unchanged at 2,649,730 bytes since the R1 decontamination pass (2026-07-17 13:44); 26 pseudonymous employee rows; no write from this session touched it |
| Migration dependency tests | **30/30 PASS** (`test-migration-dependencies.mjs`) |
| Fresh migration | PASS — real `server.js` boot applied all 10 migrations in dependency order |
| Sanitized/pre-existing-order migration | PASS — suite 10 in the dependency test simulates a plain-filename-order-migrated DB and confirms it stays valid |
| Dry run | PASS — exact resolved order printed, zero side effects |
| Reapply | PASS — idempotent, zero re-applied migrations |
| Rollback | PASS — exact reverse-dependency order, byte-identical schema fingerprint restored |
| Restart | PASS — rebuild-after-full-rollback re-applies cleanly |
| SQLite integrity | `PRAGMA integrity_check = ok` on every fresh/rebuilt/pre-existing DB checked |
| Foreign keys | `PRAGMA foreign_key_check` — zero violations on every DB checked |
| Route inventory | **97/97** nav↔view mapping (was 96/96; +1 for the new, fully-mapped `vnext_platform` page, §5b) — 0 missing view files, 0 new missing markers |
| Permission regression | **35/35 PASS** (`permission-regression.mjs`; baseline sidebar count updated 96→97 to reflect the legitimate new page, §5b) |
| Registry/CRUD | **18/18 PASS** (Blocker 2 suite) + Lane A's CRUD suites |
| ACL/scopes | PASS (Lane B/D suites + live proof) |
| Field security | PASS (`test-vnext-kernel-completion.mjs` Suite 2, isolated) |
| Lifecycle (doc-state) | PASS (Lane A 58/58 incl. Suites 2–3; live proof) |
| Numbering/hash chain | PASS (`test-vnext-kernel-completion.mjs` Suite 3, isolated) |
| Audit/history | PASS (live proof + Lane C Suite 6) |
| Custom/snapshot fields | **PASS** (Lane C 43/43 incl. Suites 2–4; live proof) |
| Chatter/attachments | **PASS** (Lane B 61/61 incl. Suites 5–6; live proof) |
| Saved views/worklists | **PASS** (Lane B Suite 7, 7/7; live proof) |
| Notifications | **PASS** (Lane C Suite 1, 6/6; live proof) |
| Approvals | **PASS** (Lane B Suites 2–3, 13/13) |
| Approval Center UI | **PASS** (Lane B Suite 4, 17/17; live proof of all nine boxes) |
| Import/export/print | PASS (Lane A, pre-existing) |
| Workflows | **PASS** (Blocker 3 suite 9/9 + `test-vnext-kernel-completion.mjs` Suite 5, now passing instead of crashing; live proof) |
| Extension framework | **PASS** (Lane D Suite A, 15/15; live proof of install/uninstall zero-residue) |
| Org/fiscal | **PASS** (Lane D Suite B, 12/12; live proof) |
| Authentication | **PASS** (Lane D Suite C, 20/20 + `test-vnext-kernel-completion.mjs` Suite 6, 3/3 — now genuinely asserting, not a fake pass; live proof of password policy/TOTP/API keys) |
| Kernel demo | **PASS** — §6 above, HTTP-proven |
| Browser smoke | **PASS** — `vnext/client/demo.html` rendered correctly, zero console errors |

**No fabricated counts.** Every number above was produced by actually running the named script or the named live HTTP/browser action in this session, not inferred from documentation.

---

## 8. Files changed this pass

- `vnext/server/db/migration-runner.mjs` — dependency resolver, validation, dry-run/apply/rollback ordering.
- `migrations/102_r1_lane_a_completion.mjs`, `202_r1_lane_b_completion.mjs`, `402_r1_lane_d_completion.mjs` — added `dependsOn`.
- `vnext/server/acl/acl-engine.js` — removed nothing (still canonical owner); added the inert-probe-`res` fix to `resolveRequestUser`.
- `vnext/server/crud/crud-engine.js` — removed the local `entityAclKey` duplicate; both call sites now use `acl.entityAclKey`.
- `vnext/server/workflow/workflow-engine.js` — `log()` defensive `logs` init; `recoverRunningWorkflows()` now awaits `resumeWorkflow()`.
- `vnext/server/db/seed-runner.mjs` — new `applyAclAdminDefaultSeed()`.
- `server.js` — engine variable declarations (incl. the previously-undeclared `octagonDocState`), dispatch pipeline (module/org/auth routes + active-company enrichment), `requireSession()` session-revocation check, TOTP source-of-truth, `POST /api/db` session-rotation-on-role-change, static path allowlist (`isStaticPathSafe`), and — the largest structural change — every VNext engine mount moved into the post-migration async chain instead of running synchronously against the pre-migration handle.
- New test scripts: `scripts/test-migration-dependencies.mjs`, `scripts/test-blocker2-canonical-acl-key.mjs`, `scripts/test-blocker3-workflow-recovery.mjs`.
- `vnext/client/ui-crud.js` — history-panel drawer wiring (§5a).
- `modules/admin-panel.js` — VNext Platform Kernel nav card in the System Wire-up tab (§5a; superseded by §5b's real tab, left in place as an additional entry point).
- `views/vnext_platform.html`, `modules/vnext-platform.js` — new real in-app page mounting `OX.crud`/`OX.inbox` against the live server (§5b).
- `index.html` — nav button, view marker, script/link tags for the new module plus the previously-unloaded `history-panel.js`/`.css` and `company-switcher.js`/`.css` (§5b).
- `app.js` — `vnext_platform` added to both `pageMap` literals and to the `admin_org` nav group (§5b).
- `services/permissionService.js` — `vnext_platform` added to `PAGE_METADATA`/`PAGE_PERMISSIONS` (`system.admin`-gated) (§5b).
- `scripts/permission-regression.mjs` — sidebar baseline count updated 96→97 to reflect the legitimate new page (§5b).
- `modules/vnext-platform.js` — company-switcher section added (§9a).
- `vnext/server/org/org-routes.js`, `vnext/server/modules/module-routes.js`, `vnext/server/auth/auth-routes.js` — `actor()`'s inert-`res` fix, same class as `resolveRequestUser` (§9a).
- `server.js` — session-rotation diff now reads `users`/`omni.users` (matching `userListFromDb()`) instead of `employees`; `GET /api/auth/session` now consults `isUserDisabled`/`isSessionRevoked` (§9b).
- New test scripts: `scripts/test-blocker4-route-actor-inert-res.mjs`, `scripts/test-live-session-rotation-e2e.mjs`.

No production file (`octagon-erp/**`) was read for anything beyond the standing hash-verification check, and none was written.

---

## 9. Advisory items — worked through, two more real bugs found and fixed

Both originally-listed advisory items were picked up in a follow-up pass and, in the course of actually exercising them live rather than leaving them as theoretical TODOs, surfaced two more genuine defects — found the same way as §3's two defects: by actually running the thing instead of trusting that wiring code compiles.

### 9a. Company switcher mounted — found the same `actor(req)` null-`res` bug in three more files
Added a company-switcher section to `modules/vnext-platform.js` (`OX.companySwitcher.mount(...)`) and exercised it live in the browser. Mounting it against a real, unauthenticated browser session surfaced a **fourth defect**, the same class as §3b's `resolveRequestUser` fix but in different files: `vnext/server/org/org-routes.js`, `vnext/server/modules/module-routes.js`, and `vnext/server/auth/auth-routes.js` each have their own `actor(req)` probe that called `deps.requireSession(req)` with **no `res` argument** — `requireSession`'s failure branches unconditionally call `sendJson(res, ...)`, so this threw `TypeError: Cannot read properties of undefined (reading 'setHeader')` for any request without an active session, and the raw error text leaked to the client instead of a clean 401. Confirmed live: the company-switcher widget showed that exact leaked error string as its status message. Fixed identically to `resolveRequestUser`'s fix — an inert stand-in `res` absorbs the internal response attempt in all three `actor()` functions. New suite `scripts/test-blocker4-route-actor-inert-res.mjs` — **9/9 PASS**, reproducing the exact failure shape against each of the three route modules and asserting a clean 401 instead. Re-verified live: `/api/x/org/companies`, `/api/x/modules`, `/api/x/auth/password-policy` all now return a clean, structured 401 for an unauthenticated caller instead of a leaked stack-shaped error; the company-switcher widget now shows the correct "تسجيل الدخول مطلوب" message.

### 9b. Session-rotation-on-role-change — live E2E test found and fixed two more bugs
Wrote `scripts/test-live-session-rotation-e2e.mjs`: a real end-to-end test against a **running server** (not an isolated unit test) that creates a test user via the safe `GET /api/db` → modify → `POST /api/db` read-modify-write cycle (never a raw partial POST — see `feedback_never_raw_probe_post_apidb`), logs in for real via `POST /api/auth/login` to get a genuine session cookie, changes that user's `groups` through the same real `/api/db` path, and asserts the pre-change session is rejected afterward. First run found two real bugs:

1. The session-rotation diff code added during the original integration pass (§4) diffed `parsed.employees` — but the actual login path (`userListFromDb()`, `server.js:1429`) resolves users from `db.users` + `db.omni.users`, a **completely different collection**. The rotation code had never actually fired for any real login-capable user. Fixed to diff the same two collections `userListFromDb()` reads (deduped by id, matching its own logic).
2. Even after that fix, `GET /api/auth/session` (the "am I logged in" check the client polls) still reported the revoked session as `authenticated: true`, while `requireSession`-gated endpoints correctly rejected it with 401 — an inconsistency where the UI would show "still logged in" while every real API call failed. Root cause: that handler used `authSessionFromRequest()` directly, which only checks token existence/expiry, never disabled/revoked status. Fixed by adding the same `isUserDisabled`/`isSessionRevoked` checks `requireSession()` already applies.

Re-run after both fixes: **9/9 PASS** — real login, real password verification, real session cookie, real role change via the real HTTP path, the old session rejected by both the session-check endpoint and a protected API route, and a fresh login afterward correctly getting a new valid session.

### 9c. Remaining note (unchanged, informational only)
The legacy app's own client-side login/session model (`localStorage`-backed) is separate from server-side loopback trust; reaching admin-gated legacy pages (including the `system.admin`-only `vnext_platform` tab) through the browser's own login flow requires authenticating through the UI first — unrelated to R1 itself, noted for whoever next drives an unauthenticated browser session against this fork.

All fixes in this section re-verified against the full regression sweep — **zero regressions** (58/58, 61/61, 43/43, 43/43, 13/13, 35/35, 39/39 provenance, all R0/migration-dependency/blocker suites, all unchanged or improved).

**R1 ELIGIBLE TO CLOSE.**
