# Octagon Current Truth Audit
Authority level 3. Forensic, evidence-based reality of the running system. 2026-07-17 (Opus 4.8 code-inspection session, READ-ONLY).

> Every claim below cites a path actually read under `C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-erp\`. "A page exists" ≠ "a module is complete" ≠ "a reusable platform capability." Where a thing could not be verified it is stated as such (§8).

---

## 0. Method & scope

Inspected: `server.js` (2,812 lines) + 8 `server-*.js` sidecars; `app.js` (19,782 lines / ~1.0 MB); `index.html` (134 `<script>` tags); `modules/` (103 `*.js`); `services/` (8 files, 3,400 lines); `platform/` (W0 spike — 27 server/client JS + `x-tables.sql` + INTEGRATION/TEST docs); `acl.json`, `manifest.json`, `package.json`, `platform/server/entities.json`. Did **not** run the server, open any `*.db`, or git anything. Line/function citations are from the files as read.

Two prior context docs framed this audit: `octagon-analysis/README.md` (prime directives) and `COMMERCIAL_VNEXT_EXECUTIVE_BLUEPRINT.md` (authority 1). Prior inventory `erp-research/00-octagon-baseline.md` was cross-checked; discrepancies are flagged inline.

---

## 1. Architecture map

**Three coexisting layers, two of them parallel data worlds.**

```mermaid
flowchart TB
  subgraph CLIENT[Browser — single HTML shell, 134 script tags, ~6MB JS]
    appjs["app.js (19,782 lines)\nswitchPage/pageMap, nav, ~95 pages"]:::c
    mods["modules/*.js (103)\nfinance-ui, admin-panel, sales-crm,\nwork-orders, workshop-ledger, verticals…"]:::c
    v5["services/*.js (client 'v5/v6')\nPentagonDB, FinanceService, StockService,\nPermissionService, StateService, AuditService,\nTenantService, RecordService"]:::v
    plat["platform/client/*.js (W0)\nOX.crud, chatter, views-fields, inbox…\n(globals load; only demo.html consumes)"]:::p
  end
  subgraph SERVER[server.js — raw Node http, node:sqlite DatabaseSync]
    core["Core API: /api/db, /api/collection,\n/api/record, /api/auth/*, /api/sequence/*,\n/api/operation-lock/*, /api/backup*"]:::s
    jarvis["server-jarvis-* (tool gate, AI key proxy)\nserver-scheduler.js (read-only notifiers)"]:::s
    platsrv["platform/server/*.js (W0, mounted L2778-2785)\ncrud-engine, acl, chatter, approvals, audit,\nsequences, workflow, views-fields, notify"]:::p
  end
  subgraph DB[SQLite database.db — WAL]
    jsonstore[("collections(collection,id,data)\n= JSON blobs — the REAL app store")]:::d
    xtables[("x_records / x_gl / x_stock_ledger /\nx_chatter / x_approvals / x_audit /\nx_views / x_custom_fields / x_acl_* \n= W0 relational tables (seeded, demo-only)")]:::x
    sys[("metadata, operation_locks,\nauth_sessions, sequences")]:::d
  end
  appjs & mods & v5 --> core --> jsonstore
  core --> sys
  plat --> platsrv --> xtables
  classDef c fill:#1f2937,color:#fff; classDef v fill:#166534,color:#fff
  classDef p fill:#7c2d12,color:#fff; classDef s fill:#0e7490,color:#fff
  classDef d fill:#334155,color:#fff; classDef x fill:#92400e,color:#fff
```

**Key structural facts (evidence):**
- **Server is not Express.** Raw `node:http`; dispatch is a long `if (requestUrl.pathname === '…')` chain (`server.js:1777+`). ~30 route branches (`server.js:1796–2513`).
- **SQLite engine is `node:sqlite` `DatabaseSync`, not `better-sqlite3`** (`server.js:41`, `2640`). WAL + `busy_timeout=5000` + `synchronous=NORMAL` (`server.js:2648–2650`).
- **The real application store is a key-value JSON table**: `collections(collection TEXT, id TEXT, data TEXT, PRIMARY KEY(collection,id))` (`server.js:2657–2664`). Every business collection (`omni.*`, `account_moves`, `employees`, `finance.*`) is a JSON blob in `data`. `database.json` is a mirror/fallback (`server.js:2721–2748` degraded-mode warning).
- **The W0 platform added a *second*, relational store** — the `x_*` tables (`platform/server/x-tables.sql`) — mounted into the same `database.db` at boot (`server.js:2778–2785`). These are structurally real (append-only GL/stock, indices, PKs) but are consumed only by the W0 demo path (see §3).
- **`app.js` never calls any platform `/api/x/*` or `/api/crud`/`/api/acl` route** (grep across `app.js` + `modules/*.js`: zero hits). The only client caller of `/api/x/crm_lead/create` is `platform/client/*.js`, invoked from `platform/client/demo.html`.

---

## 2. Module reality table

Status legend: **impl**=implemented & used · **partial** · **frontend-only** · **infra-only**=engine/table exists, not wired · **demo**=works only in standalone demo · **client-JSON**=real logic but persists as mutable JSON blobs.

| Module / capability | Status | Evidence (path) | Persistence | Permissions | Audit | Tests | Commercial-readiness note |
|---|---|---|---|---|---|---|---|
| Core shell / nav / pages (~95) | impl | `app.js` switchPage/pageMap; `index.html` 134 scripts | JSON `collections` | client `PermissionService` | client `AuditService` | none formal | Monolith: 19.8k-line `app.js` + 103 modules all hydrated into one DOM. Functional but unforkable per-customer. |
| Finance v6 (GL/AR/AP, invoices, P&L) | client-JSON | `services/financeService.js` (1,331 ln) | `account_moves` JSON via `PentagonDB.mutate` (`:522,587`) | `PermissionService.require('account_moves',…)` (client, `:472`) | `AuditService.createEvent` (`:597`) | `modules/finance-selftest.js` | Double-entry *structure* + draft/posted discipline (`updateMove` throws if `state!=='draft'`, `:610`) + posting idempotency (`isAlreadyPosted`, `operation_locks`). **But mutable JSON, not an immutable ledger.** See §Q1. |
| Stock / inventory | client-JSON / partial | `services/stockService.js` (515 ln); `modules/advanced-inventory.js`, `inventory-deepening.js` | `stock_moves` JSON via `RecordService` (`:97`) | client `PermissionService.require('stock_moves',…)` (`:94`) | via RecordService/State | `scripts/test-v5-services.mjs` | Real state transitions (`StateService.transition draft→confirmed`, `:180`). No valuation/stock-ledger posting; `x_stock_ledger` table empty. |
| Document-state engine | partial (client) | `services/stateService.js` (105 ln, 6 transitions) | JSON records | client | — | — | Generic-ish client state machine; used by finance/stock JSON. Not server-enforced; no shared server state engine outside W0 `workflow.js`. |
| Numbering / sequences | duplicated | server `sequences` table (`server.js:2707`, `/api/sequence/next` `:1796`) **and** platform `x_sequences` (`x-tables.sql:101`); also `modules/sequence-service.js` | SQLite (both) | none | — | — | Two independent numbering engines + a client module. Atomic per-code, yearly reset. Needs consolidation. |
| Permissions / ACL | partial (mostly client) | client `services/permissionService.js` (536 ln); server coarse ACL `server.js:2145–2162,2215–2254`; `acl.json`; platform `acl.js` (431 ln) | `acl.json` + `x_acl_*` | **server ACL bypassed on loopback** (`guard.mode==='local-trusted'`) | `logAclRejection` | — | **#1 blocker.** See §Q2. |
| Auth / session | impl | `/api/auth/login` `server.js:1845–1892` | `auth_sessions` table (`:2696`) | password hash+salt (`:1870`), 5-try lockout (`:1873`), TTL cookie | server audit on every attempt (`:1886`) | `scripts/verify_test_users.py` | Genuine server auth. Solid. No SSO/2FA. |
| HR / Payroll / Timesheet / Attendance | impl (**FROZEN**) | `app.js` (see §6 inventory); `modules/ws-timesheet-bridge.js`, `workshop-ledger.js` | JSON `collections` (`employees`, `payroll_*`) | client + `hr_payroll` ACL group | client | `finance-selftest`, workshop stabilization self-test | Owner-critical, real Iraqi payroll. **Do not rewrite** — compatibility boundary (§6). |
| Sales / CRM | frontend-only / partial | `modules/sales-crm.js`, `sales-commercial-pack.js`, `sales-commission.js`, `sales-contracts.js`, `sales-price-lists.js` | JSON `collections` | client | client | — | Page-level. Parallel to W0 `crm_lead` demo entity (unrelated data). |
| Procurement / Suppliers / Contracts / Logistics | frontend-only | `modules/enterprise-suite.js` (supplier/ar_ap/contracts/logistics sub-pages) | JSON | client | client | — | Screens over JSON; no PO→receipt→bill ledger flow. |
| MRP / Work-orders / Machines / QC | partial | `modules/mrp.js`, `mrp-work-orders.js`, `work-orders.js`, `machine-management.js` | JSON (`omni.jobOrders`, `omni.machines`) | client | client | — | Workshop chain on `omni.jobOrders`. No BOM→WO ledger; no MES/OEE. |
| Admin panel / multi-entity / security / integration | partial | `modules/admin-panel.js`, `multi-entity.js`, `enterprise-suite.js`, `omni-admin-crud-v2.js` | JSON | client | client | — | Admin CRUD over JSON collections. `multi-entity` = the tenant UI (see §Q4). |
| Verticals (retail/pharmacy/clinic/restaurant/real-estate/hotel/rental/field-service) | frontend-only | `modules/vertical-*.js`, `field-service.js`, `rental.js` | JSON | client (self-activate pattern) | — | — | Screens + seed data per vertical; thin on transactional depth. |
| Cross-vertical apps (appointments, loyalty, events, subscriptions, surveys, visitors, helpdesk, esign, knowledge, documents, assets, fleet, marketing, budgeting) | frontend-only / impl-as-page | `modules/{appointments,loyalty,events,subscriptions,surveys,visitors,helpdesk,esign,knowledge,documents,asset-maintenance,fleet,marketing,budgeting}.js` | JSON `omni.*` | client | partial | — | Each is a working page over an `omni.*` JSON collection. Feature breadth is real; transactional integrity is per-page. |
| AI / Jarvis / Omni (copilot, brain, audit, governance, action-agent) | impl (gated) | `modules/jarvis-*.js`, `omni-ai-assistant.js`, `ai-governance.js`; server `server-jarvis-*.js` (6 files) | JSON + server tool gate | **server-enforced tool grants/approvals** (`server-jarvis-security.js`, 38 KB) | `aiAuditLog` | `jarvis-test-harness.js` | The one area with real *server-side* write governance + AI-key proxy (no keys in client). Strongest non-frozen asset. |
| Scheduler / background jobs | impl (read-only) | `server-scheduler.js` (18.9 KB), installed `server.js:2757` | — | role-gated | — | — | Read-only notification generators + nightly backup-verify only. No transactional jobs. |
| Backup / restore | impl | `/api/backup*`, `/api/restore*` `server.js:2453–2589`; `runNightlyBackupCycle` | file snapshots | admin/local | — | — | Atomic writes + `.prev` snapshot + verify + prune(14). Operationally decent. |

---

## 3. The W0 platform spike — what actually exists

**Location:** `platform/server/` (14 JS + `x-tables.sql` + `entities.json` + INTEGRATION/TEST docs) and `platform/client/` (10 JS + `demo.html` + `chatter-demo.html`). Sub-folders `p0.2-acl`, `p0.5`, `p0.7-views-fields`, `p0.10` hold HTTP test harnesses only.

**What was built (real code, not stubs):**
| Engine | File (lines) | Table(s) | Real? |
|---|---|---|---|
| Config-driven CRUD | `crud-engine.js` (533) | `x_records` | Yes — generic entity CRUD from `entities.json`, soft-delete (`removed=1`) |
| ACL matrix | `acl.js` (431) + `acl-http-adapter.js` (325) | `x_acl_roles`, `x_acl_grants` | Yes — `section:entity:action` perms, `all/own/dept` scope |
| Chatter/collaboration | `chatter.js` (450) + `chatter-crud-adapter.js` (93) | `x_chatter`, `x_followers` | Yes — messages/logs/activities per record |
| Approvals | `approvals.js` (208) | `x_approvals` | Yes — pending/approved/rejected |
| Audit / record-history | in `views-fields.js` + `audit.js` (101) | `x_audit` | Yes — before/after JSON snapshots |
| Numbering | `sequences.js` (89) | `x_sequences` | Yes — `BEGIN IMMEDIATE` atomic issue |
| Notifications | `notify.js` (112) | `x_notifications` | Yes |
| Workflow | `workflow.js` (327) | `x_records`+`x_approvals`+`x_notifications` | Yes — record-event triggers |
| Saved views + custom fields | `views-fields.js` (280) | `x_views`, `x_custom_fields` | Yes |
| Print templates | `print-templates.js` (177) | `x_records` | Yes |
| Commercial seed | `seed-commercial.js` (201) | writes `x_records`, `x_acl_*` (idempotent) | Yes |
| Entity registry (client) | `entity-ui-registry.js` (202) | — | 3 entities only: `crm_lead`, `helpdesk_ticket`, `product` |
| CRUD UI | `ui-crud.js` (813) — `OX.crud.mountEntity` | — | Yes |

**Integration verdict — mounted but NOT integrated into the running product:**
- All 8 server engines ARE required + mounted in production boot (`server.js:2778–2785`, each guarded `if (dbSync)`). Their HTTP routes are live and `seed-commercial.js` seeds `x_records` every boot.
- The 10 client scripts ARE loaded by `index.html:1953–1962` (globals `OX.*` exist at runtime).
- **BUT `OX.crud.mountEntity` is called in exactly one place: `platform/client/demo.html:199`** — a standalone demo page. It is never called from `app.js`, any `modules/*.js`, or `index.html`. No nav tab in the real app renders a platform entity. The `x_gl` / `x_stock_ledger` append-only ledger tables **have no posting engine at all** (no `platform/server/gl.js` / `stock.js` exists; `x_gl` is written nowhere but the schema and the harness DB).
- Net: the W0 spike is a **feasibility proof running in-process** — real engines, real tables, real seed, HTTP-reachable — sitting *beside* the live app, not *inside* it. It shares the `database.db` file but its `x_*` data and the app's `collections` JSON never meet.

**Reusable-as-VNext-engine?** Yes, as a strong reference/starting point for R1 kernel engines (CRUD, ACL-with-scope, chatter, approvals, audit-snapshots, sequences, workflow, views/custom-fields are all present in clean, self-contained files). Not shippable as-is because nothing in the product consumes them and the finance/stock ledgers were never built.

---

## 4. Reusable assets (VNext can preserve / adapt)

1. **Frozen Iraqi payroll/timesheet/attendance engine** (§6) — irreplaceable, correct, owner-trusted. Preserve behind adapter.
2. **W0 platform engines** (§3) — port to R1 kernel: `crud-engine`, `acl`(+scope), `chatter`, `approvals`, `audit`, `sequences`, `workflow`, `views-fields`, `notify`, `print-templates`.
3. **Server AI governance** — `server-jarvis-security.js` (tool grants + approval gate) + AI-key proxy (`/api/ai/*`, keys never in client). This is the model for §6-blueprint decision #9 and is already server-enforced.
4. **Auth core** — `/api/auth/*` with salted hashes, lockout, persisted sessions (`auth_sessions`).
5. **Operation-lock idempotency** — `operation_locks` table + `/api/operation-lock/*` (`server.js:2285–2399`); atomic posting guard against cross-tab double-post.
6. **Backup/restore/verify + nightly cycle** — `runNightlyBackupCycle`, `/api/backup*`.
7. **Client domain services v5/v6** — `services/{finance,stock,record,state,audit,tenant,permission}Service.js` are cleanly separated; their *contracts* map onto VNext modules even if storage is rebuilt.
8. **Tenant scaffolding** — `services/tenantService.js` + server `applyServerTenantProtectionToDatabase` (§Q4).
9. **`acl.json`** — a real coarse role×group matrix to seed VNext's ACL.

---

## 5. Technical debt + commercial blockers (ranked)

1. **CRITICAL — Permissions are UI-enforced in the shipping (local) deployment.** Server ACL exists but `guard.mode==='local-dev'|'local-trusted'` (loopback = the single-Windows-box mode) skips it entirely (`server.js:2145,2215,2248`). `PermissionService` lives in the browser (`services/permissionService.js` throws client-side). An enterprise buyer cannot trust "hidden buttons." Blueprint decision #4.
2. **CRITICAL — Finance is mutable JSON, not an immutable ledger.** `account_moves` is a JSON blob mutated in place (`financeService.js:updateMove :587,610`). Integrity rests on draft/posted checks + idempotency locks + pre-mutation backups, not on append-only storage. The append-only `x_gl` exists but is never posted to. Blueprint decision #1. §Q1.
3. **HIGH — Two parallel data worlds in one DB.** App = JSON `collections`; W0 = relational `x_*`. They don't share data. Any VNext migration must reconcile both (blueprint decision #3).
4. **HIGH — Configuration is code.** Every customer variation edits `app.js`/modules. `x_custom_fields`/`x_views` engines exist but only the demo uses them.
5. **HIGH — Monolith load.** `index.html` = 134 script tags, ~6 MB JS, `app.js` = 19,782 lines, 103 modules all hydrated into one DOM. Boot/perf and maintainability ceiling.
6. **MEDIUM — Duplicated engines.** Numbering (server `sequences` + platform `x_sequences` + `modules/sequence-service.js`); state (`services/stateService.js` + platform `workflow.js`); audit (client `AuditService` + platform `x_audit`); ACL (client `PermissionService` + `acl.json` + platform `acl.js`).
7. **MEDIUM — No formal test suite.** `package.json` has one dependency (`dotenv`) and no test script. "Tests" are ad-hoc harnesses: `test-api.js`, `modules/finance-selftest.js`, `modules/jarvis-test-harness.js`, `scripts/*.mjs`/`*.py`, and read-only in-app self-tests (route-health, workshop-stabilization). No unit/integration/e2e framework, no coverage.
8. **MEDIUM — Multi-company is flag-gated scaffolding, not proven** (§Q4).
9. **LOW — Duplicate top-level functions.** Grep-verified **2**, not the historically claimed 23 (§Q6).

---

## 6. Frozen-zone map (payroll / timesheet / attendance) — READ-ONLY compatibility boundary

**Do not modify. VNext reads/posts *around* this via an adapter.** All in `app.js` unless noted. Line numbers as read 2026-07-17.

Settings & rules: `getPayrollSettings` (329), `savePayrollSettings` (338), `applySystemPayrollRules` (547).
Salary calc: `calculateSalaryDetailed` (942), `calculateSalary` (1046), `getEmployeeNominalSalary` (1051), `calculateSalaryForEmployee` (1317), `getEmployeeMonthlyPayrollSummary` (1669).
Timesheet range/lifecycle: `getTimesheetMonthStorageKey` (413), `getTimesheetSelectedMonths` (417), `setTimesheetSelectedMonths` (431), `toggleTimesheetMonth` (443), `getTimesheetPeriodLabel` (456), `recordBelongsToTimesheetRange` (461), `recordsForTimesheetRange` (466), `employeeIndexesForTimesheetRange` (489), `ensureSelectedEmployeeForTimesheetRange` (503), `getEmployeeTimesheetLifecycle` (1120), `calculateTimesheetRangeResult` (1698), `getEmployeeTimesheetRangeSummary` (1804).
Attendance: `getLastAttendanceDateOnOrBefore` (1206); month-end bonus `getTimesheetMonthBonusKey/get/set` (1298/1302/1308).
Advances (official): `ensurePayrollCollections` (1835), `getPayrollDataCache` (1924), `getEmployeeAdvanceRowsForPeriod` (1928), `getOfficialAdvancesForEmployeePeriod` (1941), `getEmployeeOfficialAdvancesSummary` (1945), `getTimesheetOfficialAdvanceDayMap` (1955), advance-row/settlement helpers (1966–2039), `cancelTimesheetOfficialAdvanceMoves` (2024, async), `syncTimesheetAdvanceSourceRows` (2039).
Rendering: `renderAttendanceCalendar` (**defined twice** — see §Q6).
Bridge module: `modules/ws-timesheet-bridge.js` (links workshop ledger ↔ التايم شيت الذكي); `modules/workshop-ledger.js`.
Data collections (JSON, ACL group `hr_payroll` in `acl.json`): `employees`, `payroll_periods`, `employee_payroll_closings`, `payroll_adjustments`, `payroll_payments`, `employee_advances`, `omni.peopleOps.*`.
Server protection: `/api/db` POST refuses to wipe a non-empty `employees[]` with an empty payload (`server.js:2120–2124`) and hard-protects listed collections (`HARD_PROTECTED_COLLECTIONS`, `server.js:2174–2182`).

---

## 7. Preservation decisions (per module)

| Module / capability | Decision | Rationale |
|---|---|---|
| Payroll / Timesheet / Attendance (frozen) | **Preserve + Adapter** | Owner-critical, correct; wrap read/post, never rewrite (blueprint decision #2) |
| Auth core (`/api/auth/*`, `auth_sessions`) | **Preserve** | Genuine server auth; extend with SSO/2FA in VNext |
| Server AI governance (`server-jarvis-security`, AI proxy) | **Preserve / Adapt** | Already server-enforced write governance |
| Operation-lock idempotency, backup/restore | **Preserve** | Sound operational primitives |
| W0 platform engines (`platform/server/*`) | **Adapter → Deep-refactor into R1 kernel** | Right shape, wrong integration; harden + wire to real modules |
| Finance v6 (`financeService` + `account_moves`) | **Rebuild-in-VNext (data-preserving)** | Keep double-entry semantics; re-lay on immutable GL (R2). Migrate `account_moves` → ledger |
| Stock / inventory | **Rebuild-in-VNext** | Re-lay on `x_stock_ledger` valuation engine (R2) |
| Numbering / State / Audit / ACL (duplicated) | **Deep-refactor / Consolidate** | Collapse the 2–3 implementations into one kernel engine each |
| Sales/CRM, Procurement, MRP, verticals, cross-vertical apps | **Rebuild-in-VNext as thin modules** | Currently frontend-only over JSON; recompose on kernel + ledgers |
| Admin/multi-entity/tenant | **Deep-refactor** | Turn flag-gated scaffolding into real company_id scoping from R1 |
| `app.js` monolith + 103 modules + 134 scripts | **Rebuild (do not extend)** | Matches blueprint §8: fork clean generation, don't add tab #96 |

---

## Commercial-readiness questions — direct answers

**Q1. Immutable ledger / double-entry integrity, or mutable JSON?**
**Mutable JSON with double-entry *structure* and posting discipline — not an immutable ledger.** `account_moves` are JSON records in the `collections` table, created/updated via `PentagonDB.mutate` (`financeService.js:522,587,610`). Integrity mechanisms exist: balanced-lines validation (`validateBalanced`), draft-only edits (`updateMove` throws `يمكن تعديل المسودة فقط` if `state!=='draft'`, ~`:610`), posting idempotency via `isAlreadyPosted` + server `operation_locks` (`server.js:2285`), and a pre-mutation backup (`backupBeforeLiveFinanceMutation`). The append-only `x_gl` table (`x-tables.sql:30`, "APPEND-ONLY … corrections are reversal rows") is defined but **has no posting engine and is never written**. So the trust bedrock the blueprint wants (R2) does not exist yet.

**Q2. Permissions enforced on the SERVER, or only by hiding UI?**
**Primarily UI/client-enforced; server ACL exists but is bypassed in the shipping deployment.** `PermissionService` (`services/permissionService.js`) runs in the browser and throws Arabic errors. Server DOES apply a coarse role×collection-group ACL on `/api/db`, `/api/collection`, `/api/record` (`server.js:2145–2162,2215–2221,2247–2254`) using `acl.json` — **but only when `guard.mode` is not `local-dev`/`local-trusted`**. Loopback/single-box (the intended deployment) is treated as trusted `system.admin`, so the ACL never fires there. Auth itself is real (Q evidence in table). The W0 `acl.js` (`all/own/dept` scope) is not enforced on any real route. **Verdict: not enterprise-sellable as-is** (blueprint decision #4). Exception: AI write-actions ARE server-gated (`server-jarvis-security.js`).

**Q3. Document-state engine, numbering, audit, custom fields — systemic or per-page?**
Mixed and duplicated. **State:** client `services/stateService.js` (6 transitions) used by finance/stock JSON; W0 `workflow.js` is a second, server-side state/trigger engine (demo-only). **Numbering:** THREE — server `sequences` table + `/api/sequence/next`, platform `x_sequences`, and `modules/sequence-service.js`. **Audit:** client `AuditService` (JSON events) + platform `x_audit` (real before/after snapshots, demo-only). **Custom fields / saved views:** platform `x_custom_fields` / `x_views` engines exist and work — but only `platform/client/demo.html` uses them; no real page has custom fields. So these capabilities are **present as engines but not systemic** — the W0 spike proved them, the product doesn't use them.

**Q4. Multi-company / tenant — any company_id scoping?**
**Yes, as flag-gated scaffolding.** `services/tenantService.js` defines `activeCompanyId`, `recordCompanyId` (reads `companyId||company_id||tenantCompanyId`), `isTenantCollection`, `shouldEnforce`, `matchesActiveCompany`. Server has `applyServerTenantProtectionToDatabase`, `mergeTenantCollectionForWrite`, `prepareTenantRecordWrite` (`server.js`, ~24 `tenant`/`company` refs). `financeService.js` stamps/scopes by company (~48 refs: `tenantStamp`, `tenantScope`, `tenantCanRead`). **But enforcement is gated behind `organization().multiTenant`** (`tenantService.js:109–111`), which is off in this single-tenant deployment (`server.js:2164–2170` explicitly notes tenant protection "is a no-op" here). `modules/multi-entity.js` is the UI. So: real scoping *code*, not proven multi-company *operation*. Blueprint decision #6 must design this from R1.

**Q5. Frozen zone — where does payroll/timesheet/attendance live?** Fully mapped in §6 (file paths + function names + line numbers + JSON collections + server protections). READ-ONLY; not modified.

**Q6. Duplicate-function debt — verify/quantify the "~23".**
**Not reproduced. Grep-verified: 2 duplicated top-level function names in current `app.js`** — `renderAttendanceCalendar` and `addEmployee` (each defined twice; `formatDate`/`excelDateToJSDate` also appear twice but at least one is nested). Method: `grep -oE '^(async )?function <name>' app.js | uniq -c`. Total top-level `function` declarations: 621. The historically recorded "~23 duplicates" (MEMORY, 2026-07-02) is **not** present in `app.js` as of 2026-07-16 (last modified) — either resolved over intervening sprints or originally counted via a different definition style (e.g. `window.x =`/object methods) not captured by hoisted-declaration grep. Reported honestly rather than repeating the stale figure. The duplicate-declaration *risk* (last-def-wins silent override) remains architecturally real for a 19.8k-line single file.

---

## 8. Evidence that could not be verified (honesty ledger)

1. **Runtime behavior** — server not run, no DB opened (per directives). All claims are static-source. Whether `x_*` tables actually contain seeded rows right now (vs. schema-only) is inferred from `seed-commercial.js` running at boot, not observed.
2. **`setInterval`/`MutationObserver` counts** — baseline claimed ~39 intervals / 15 observers; grep of `app.js` alone finds `setInterval`=2, `new MutationObserver`=2. The higher counts likely span all modules/omni-* files (not re-summed here). Baseline figure treated as unverified for `app.js`.
3. **`node:sqlite` vs `better-sqlite3`** — code uses `node:sqlite` `DatabaseSync` (`server.js:41`); the prompt's hypothesis "better-sqlite3" is **not** what ships. `x-tables.sql:6` calls them "compatible."
4. **Actual enforcement of client `PermissionService` at runtime** — verified it *throws* in source; not verified that every mutation path calls it (some modules may write JSON directly, bypassing it). Sampling, not exhaustive.
5. **Full route inventory** — ~30 core routes read; the jarvis/scheduler sidecars mount additional routes (`server-jarvis-*.js`) not line-by-line audited here beyond confirming the server-side tool gate exists.
6. **Depth of each of 103 modules** — classified by name, size, and spot-reads (finance, stock, entity-registry, tenant, permission read in full). The frontend-only vs partial split for individual vertical/app modules is a reasoned classification from patterns, not a full read of all 103.
7. **`database.json` currency** — the 8-collection fallback and the many `database.backup.*` files were listed, not diffed against live `database.db` (not opened).

---
*End of audit. Authority 3. Feeds → OCTAGON_VNEXT_TARGET_ARCHITECTURE.md (authority 4) and the gap/donor matrix (authority 5).*
