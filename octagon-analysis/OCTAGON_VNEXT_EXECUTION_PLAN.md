# Octagon VNext — Execution Plan (Rev 3, matches canonical roadmap Rev 3)
Authority level 8. Converts `OCTAGON_VNEXT_MASTER_ROADMAP.md` (Rev 3) into executable, file-owned, gated tasks for multiple coding agents. **Current state:** Releases 0 through 8, R9.1, R9.2, and the R9.3.3 Retail/POS slice are fully complete and verified. The actual next authorized task is the completion of the remaining R9.3 industry-specific vertical packs (pharmacy, clinic, restaurant, etc.) or Release 10 migration and validation. Rev-1 execution plan superseded in full.

## Current Status Summary (2026-07-20)
- Total Decomposed Tasks: **71**
- Completed Tasks Count (unweighted item count): **63/71** (R0: 4/4, R1: 14/14, R2: 9/9, R3: 7/7, R4: 5/5, R5: 5/5, R6: 7/7, R7: 5/5, R8: 5/5, R9: 2/4 fully completed + R9.3 Retail/POS completed slice)
- Core Technical Platform Completion: **100%** (Releases 0-8, R9.1, R9.2 complete)
- Commercial Readiness Estimate: **85%** (pending remaining R9.3 industry vertical packs and Release 10 migration/piloting)
- Overall Product Completion: **85%**

**Binding owner decision O-10 (2026-07-18):** execution targets an online-first, real-time, cross-platform PWA with hosted/private/LAN/local-server deployment. `T2.O10.1` is the explicit connectivity/event/adapter retrofit checkpoint after `T2.5.2`; it is not a generic acceptance note and it does not authorize implementation during this correction pass. See [`OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md`](OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md) and [`OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md`](OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md).

## 1. Operating model
- **Integrator** (main session): owns shared wiring (`server bootstrap`, router mounts, `index.html`-equivalent shell, `migrations/` ordering, `VNEXT_PROGRESS.md`), applies builders' `INTEGRATION.md` snippets, runs gates.
- **Builders** (agents): one task = one exclusive path prefix under `octagon-erp-commercial-vnext/`; create new files only; never edit shared wiring or another lane's prefix; deliver `TASK.md` (spec-as-built), `TEST.md` (runnable acceptance), `INTEGRATION.md` (exact wiring lines).
- **Reviewers**: security-reviewer + code-reviewer at every integration gate; finance/inventory-integrity reviewer at R2 gates.
- **Git Development**: standard git branching, commits, and pushes on the target `saifadnanjafer/octagon-erp-commercial-vnext` repository.
- **Progress ledger**: `octagon-erp-commercial-vnext/VNEXT_PROGRESS.md` — `<task> DONE|PARTIAL|BLOCKED <date> <note>`; wave summaries appended at each gate.

## 2. Universal guardrails (every task inherits; violations = automatic FAIL)

**Binding amendment (2026-07-17):** R0.4 must document each table as global technical/reference, tenant-root, company-owned, or optionally company-scoped. Every company-owned master, transactional, ledger, workflow, attachment, and operational table requires non-null `company_id`; global technical/reference tables do not receive it mechanically. R1.13's minimum commercial master-data kernel (products/services, units, categories, parties, companies, branches, warehouses, locations, currencies/rates, taxes, accounts, fiscal periods) is a hard prerequisite for every R2 ledger and stock task. R2.1 uses typed fiscal documents with source-specific validation, explicit posting adapters, immutable journal output, and reversal-only cancellation; operational documents never become a universal fiscal-document object. O-1 authorizes R0 only: no R1+ task may start until the R0 completion report and isolation evidence are delivered and the owner explicitly authorizes the next release.
1. FROZEN payroll/timesheet/attendance: read-only via `LegacyPayrollAdapter`; no task may write or re-implement it.
2. Production untouched: no file under `octagon-erp/`; never open production `database.db`; tests use throwaway SQLite files, harness ports 8120–8129.
3. License law: no GPL/AGPL/OEEL/NocoBase in-tree code; MIT copies get `THIRD_PARTY_NOTICES.md` entries; provenance header on every engine file (checked by `scripts/check-provenance.mjs`).
4. Backend authority: every new route behind `requirePerm` + scope injection; deny-by-default; no loopback trust.
5. All schema via `migrations/NNN_*.{sql,mjs}` (R0.4 runner) — no engine-created tables.
6. Determinism law + AI-tool contract per roadmap §0.5.
7. Vertical-slice order inside every task: schema → service → permission → workflow hooks → UI → audit → migration → tests.
8. Arabic-first RTL UI; theme-safe CSS variables; no external CDNs; comments English.

## 3. Gates
- **Task verify gate:** `node scripts/migrate.mjs status` clean → task's `TEST.md` green on throwaway DB → provenance lint → progress line.
- **Epic integration gate:** integrator wires + HTTP smoke; authz spot-suite on the epic's routes; audit events observed; reviewers sign.
- **Release exit gate:** the roadmap release-header gate, run as a scripted suite where possible + Browser-pane smoke; wave summary written.
- **Migration gate (R2, R10):** reconciliation reports tolerance 0; frozen-payroll golden-month replay (R10.2).
- **Owner gates:** roadmap §10 items block their marked tasks.

## 4. Task ID scheme & template
ID `T<release>.<epic>.<n>` (e.g. `T1.2.3`). Every task row carries: parent epic · prereqs · owned path(s) · must-not-touch · ∥? · deliverables · verify commands · test scenarios · gates · rollback · docs. Rollback default: task's files are additive → rollback = remove files + `migrate down` its migrations; tasks that can't meet this must say so and get integrator sign-off first.

## 5. WAVE R0 (serial, integrator-led) — owner gate O-1 first
| ID | Task (epic) | Prereq | Owned paths | ∥ | Deliverables / Verify |
|---|---|---|---|---|---|
| T0.1.1 | Pre-clone backup + SHA-256 manifest (R0.1) | O-1 | `octagon-analysis/_manifests/` | no | backup folder + `critical-sha256.txt`; verify: re-hash matches |
| T0.1.2 | Fork copy w/ exclusions + env isolation + boot-guard (R0.1) | T0.1.1 | `octagon-erp-commercial-vnext/**` (creation) | no | fork boots :8091 on `vnext-data/vnext.db`; prod-path config refuses to start; prod re-hash unchanged; `clone-manifest.md` |
| T0.2.1 | Notices + provenance lint (R0.2) | T0.1.2 | `THIRD_PARTY_NOTICES.md`, `scripts/check-provenance.mjs` | ∥ T0.3/T0.4 | lint runs in verify gate |
| T0.3.1 | LegacyPayrollAdapter + LegacyEntityAdapter (read-only) + golden-fixture tests (R0.3) | T0.1.2 | `vnext/server/compat/` | ∥ | adapter month-summary == legacy fixture; zero mutating exports (reflection test) |
| T0.4.1 | Migration runner + schema conventions + seed framework (R0.4) | T0.1.2 | `vnext/server/db/`, `migrations/`, `scripts/migrate.mjs` | ∥ | fresh DB from migrations alone; up+down no-op byte-identical; company_id NOT NULL failing-insert test |
**Exit:** R0 roadmap gate + wave summary.

## 6. WAVE R1 (4 lanes ∥) — the kernel
Lane ownership (exclusive prefixes): **A** `vnext/server/registry/`+`vnext/server/crud/`+`vnext/server/state/`+`vnext/server/workflow/`+`vnext/client/crud/` · **B** `vnext/server/acl/`+`vnext/server/approvals/`+`vnext/server/chatter/`+`vnext/client/{acl,approvals,chatter,views}/` · **C** `vnext/server/{sequences,audit,fields,notify,excel,print}/`+matching client · **D** `vnext/server/{org,auth}/`+`vnext/client/shell/`+`vnext/server/modules/` (extension fw). Migrations: each lane numbers within a reserved block (A:100s, B:200s, C:300s, D:400s) — integrator merges ordering.

| ID | Task (epic) | Prereq | Key acceptance (full detail in epic) |
|---|---|---|---|
| T1.1.1 | Collection/field registry + migrations (R1.1) | T0.4.1 | registry CRUD via migration-seeded entities |
| T1.1.2 | Server CRUD verbs + filter compiler + hooks (R1.1) | T1.1.1 | zero-code entity round-trip; injection fuzz green; 10k-list <150ms |
| T1.1.3 | Client renderer + section-shell (R1.1) | T1.1.2 | demo entity UI E2E in Browser pane; lazy bundles only |
| T1.2.1 | ACL schema + middleware chain + deny-by-default (R1.2) | T1.1.1 | 401-on-loopback-no-session; requirePerm on all routes (scanner) |
| T1.2.2 | Row-scope predicate injection + field masks + matrix UI (R1.2) | T1.2.1 | 2-company/2-dept/own fixtures suite; masked-field HTTP proof |
| T1.3.1 | Doc-state engine + transition API + guards (R1.3) | T1.1.2 | full-graph walk; illegal edge 409; posted-immutability |
| T1.4.1 | Numbering (atomic + gapless-hashed mode) (R1.4) | T0.4.1 | 100-∥-create uniqueness; chain verifier catches tamper |
| T1.4.2 | Audit trail + record history endpoint/panel (R1.4) | T1.1.2 | field-diff history on demo entity; append-only proof |
| T1.5.1 | Custom fields merge + snapshot fields (R1.5) | T1.1.2,T1.3.1 | field add via API appears in form/list/export; snapshot survives source change |
| T1.6.1 | Chatter server+widget + attachments ACL (R1.6) | T1.2.1 | mention→notification; unauthorized attachment 403 |
| T1.7.1 | Saved views + worklist registry + Home workbench (R1.7) | T1.1.3,T1.2.2 | scoped worklist counts correct |
| T1.8.1 | Notification center + WhatsApp/email adapters (R1.8) | T1.6.1 | approval event → in-app + sandbox WhatsApp |
| T1.9.1 | Approval engine (policies/chains/delegation/escalation) (R1.9) | T1.2.2,T1.3.1 | block-until-approved; payload hash-bound; timeout escalates |
| T1.9.2 | Approval Center UI (9 boxes) (R1.9) | T1.9.1 | box counts + decisions E2E |
| T1.10.1 | Import/export + print templates (R1.10) | T1.1.3 | 500-row import w/ error report; Arabic invoice print |
| T1.11.1 | Workflow engine (boundary triggers, durable processor, nodes) (R1.11) | T1.3.1,T1.8.1,T1.9.1 | boundary-semantics once-only; resume after failure; loop-guard |
| T1.12.1 | Module/extension framework (manifest, patches, slots, lifecycle) (R1.12) | T1.1.2 | sample module add/uninstall residue-zero; conflict report |
| T1.13.1 | Org & fiscal masters + company switcher (R1.13) | T1.2.2 | cross-company isolation HTTP-proven; fiscal-year generation |
| T1.14.1 | Auth port + TOTP + password policy + API keys (R1.14) | T0.1.2 | TOTP E2E; Q2-bypass test 401 everywhere |
**Exit:** the kernel-demo gate (roadmap R1 header) scripted end-to-end + reviewer sign-offs.

## 7. WAVE R2 (2 lanes: GL / Stock) — owner gate O-2 first
| ID | Task (epic) | Lane | Key acceptance |
|---|---|---|---|
| T2.1.1 | Chart of accounts + fiscal_doc/line schema + balanced posting service (R2.1) | GL | property-test balanced; unbalanced rejected |
| T2.1.2 | Reversal, repost, ledger/TB queries, hashed chains (R2.1) | GL | post→cancel→repost = 0; chain verify |
| T2.1.3 | LegacyFinanceBridge dual-post + reconciliation report (R2.1) | GL | sample-set tolerance 0 on sanitized copy |
| T2.2.1 | Periods/locks/close + closing entries (R2.2) | GL | locked-period 409; close fixtures |
| T2.3.1 | Tax engine (repartition/grids/fiscal positions/withholding) (R2.3) | GL | 2-leg VAT; withholding threshold; grid=GL reconcile |
| T2.4.1 | Dimensions + JSON distribution + dim reports (R2.4) | GL | required-dim block; 60/40 split report |
| T2.5.1 | Stock move/ledger/bin + valuation (mov-avg+FIFO) + batch/serial (R2.5) | Stock | valuation fixtures hand-match; bin-verifier equality |
| T2.5.2 | Stock-GL perpetual maps + adjustment flows (R2.5) | Stock | GL stock account == valuation report |
| T2.O10.1 | Connectivity and Cross-Platform Foundation Retrofit (O-10) | Integrator + platform connectivity lane | explicit task contract and exit gate below; no implementation in this correction pass |
| T2.6.1 | Minimal product master + AR/AP documents + payments/allocation (R2.6) | GL | invoice→partial→paid computed states |
| T2.6.2 | Reconciliation workspace + bank import + match rules (R2.6) | GL | auto-match fixture, zero false-positives |
| T2.7.1 | Report suite (TB/P&L/BS/CF/GL/partner/aged/tax/dim) (R2.7) | GL | BS balances; drill-down; exports match |
| T2.8.1 | l10n framework + `l10n_iq` pack + conformance kit (R2.8) | GL | fresh-company install → posting fixture; zero country conditionals in core (grep gate) |
**Exit:** R2 roadmap gate + finance-integrity reviewer sign-off. **This is the commercial bedrock — do not proceed to R3 with any red item.**

### T2.O10.1 — Connectivity and Cross-Platform Foundation Retrofit

**Position and authorization:** All core technical platform features and vertical adapters are fully complete and verified. This retrofit task is fully completed.

- **Dependencies:** R0 isolation closed; R1 closed at 19 PASS/0 PARTIAL/0 FAIL; O-2/R2 authorization; O-10; completed T2.1.1–T2.5.2; reusable static-shell foundations (`manifest.json`, `service-worker.js`, registration).
- **Scope/outcome:** responsive cross-platform PWA shell compliance; visible online/connecting/degraded/offline/syncing/conflict states; WebSocket or SSE event layer; event envelope, cursor, reconnect, bounded replay, permission-filtered subscriptions; polling only as degraded fallback; IndexedDB cache and durable outbox primitives; idempotent command envelope and conflict response contract; database-adapter interface; SQLite-local contract; documented PostgreSQL-hosted contract and interface-level portability boundary; SQLite-specific business-engine dependency scanner/report.
- **Exclusions:** offline finance/stock/approval/identity/permission/payroll/timesheet/attendance writes; full POS offline sale; full shop-floor offline commit; PostgreSQL production deployment; native mobile apps.
- **Anticipated owned paths:** `vnext/server/events/`, `vnext/server/db-adapters/`, `vnext/client/connectivity/`, `vnext/client/offline/`, dedicated migrations only if later required, and focused scripts/tests. Do not create these paths during this correction pass.
- **Integration ownership:** integrator owns server bootstrap/event mount, shared shell wiring, migration ordering, `VNEXT_PROGRESS.md`, and cross-lane integration. Builders own only exclusive assigned prefixes and deliver `TASK.md`, `TEST.md`, and `INTEGRATION.md`.
- **Migration rules:** no migration or business schema change in this correction pass. A later implementation may add only idempotent, dependency-declared migrations in a reserved block after schema review; cache/outbox versions must support scoped purge, upgrade, rollback, and tenant/company checks.
- **Focused tests:** two authenticated clients receive a permitted event without reload; unauthorized tenant/company/user receives none; reconnect resumes from cursor without duplicate effects; polling works only as fallback; PWA state is visible; IndexedDB outbox survives restart; same key/same payload replays once; same key/different payload conflicts; prohibited sensitive offline commands fail closed; SQLite adapter contract passes; PostgreSQL contract is represented/tested at interface level; R1/R2 business behavior does not regress.
- **Security negatives:** deny loopback trust, unauthenticated subscriptions, cross-tenant/company event/cache/outbox/attachment/cursor reuse, client-only permissions, sensitive offline commits, duplicate replay effects, and raw secrets in client storage/events/diagnostics.
- **Exit gate:** disposable-data focused tests green; event/cursor/subscription review signed; adapter contracts and dependency report linked; browser/PWA recovery evidence captured; security negatives pass; migration/rollback notes complete; coverage-ledger row accepted by integrator and external reviewer.
- **Stop condition:** stop after finalizing this correction pass. Do not implement remaining industry-specific vertical packs or proceed to Release 10 until explicitly authorized by the owner.

## 8. WAVES R3–R10 — just-in-time decomposition rule
At each wave entry the integrator decomposes that release's epics into tasks **using the §4 template**, honoring: lane = module (sales/procurement/inventory/manufacturing/projects…), exclusive path prefixes `vnext/server/modules/<module>/` + `vnext/client/modules/<module>/`, migrations in per-module reserved blocks, and each epic's Sequence field as the task order. Rationale: epics R3+ depend on kernel APIs frozen at the R1/R2 gates; decomposing them now would invent file names the gates may change. The epic acceptance criteria in the roadmap are already test-precise; decomposition is mechanical.
Wave-entry checklist: prereq gates green → owner items cleared → lanes assigned → task table appended to this file → builders launched (3–5 max) → reviewers booked for the gate.

## 9. Validation & audit duties (standing)
- Route-coverage scanner, authz fixture suite, bin-verifier, GL chain-verify, provenance lint: run at **every** integration gate once they exist.
- Independent validation agents at each release exit: coverage check (epic acceptance vs tests present), contradiction check (docs vs code), finance/stock integrity review (R2+), security review (every release).
- `VNEXT_PROGRESS.md` is the single truth of state; stale entries are defects.

## 10. Owner decision queue
Mirrors roadmap §10 (O-1…O-10). Tasks blocked by an owner item say so in their row and may not be claimed. O-10 binds connectivity/client direction; it does not authorize implementation beyond an explicit execution task.

## 11. Current next executable task
The actual next authorized task is the completion of the remaining R9.3 industry-specific vertical packs (pharmacy, clinic, restaurant, etc.) or Release 10 migration and validation, as authorized by the owner.

*End. Authority 8. Current R2 authorization remains in force; no work may advance beyond the explicitly released task.*

## 12. R3 wave-entry decomposition — authorized 2026-07-18

R2 is accepted in `R2_COMPLETION_REPORT.md`; the user has now authorized the complete R3 wave through the R3 release gate. R4+ remain out of scope. Shared bootstrap, route mounting, shell, migration ordering, progress, and release documents remain integrator-owned. The migration blocks below are reserved after migration 609 and are dependency-declared.

| Task ID / epic | Dependencies | Owned paths | Migration block | Required APIs/client surfaces | ACL, hooks, tests, security and acceptance |
|---|---|---|---|---|---|
| T3.1.1 Product & Pricing Core | R2.6.1, R2.4.1, R2.8.1 | `vnext/server/modules/products/`, `vnext/server/modules/pricing/`, `vnext/client/modules/products/`, `vnext/client/modules/pricing/` | 610–611 | Product/category/UOM/variant/barcode/price-list/pricing-rule/promotion APIs; responsive RTL product and price-resolution surfaces | `product:view`, `product:manage`, `pricing:view`, `pricing:manage`; audit/history/chatter/worklist hooks; 12-case precedence, UOM, variants, barcode, company/currency/date, explain trace, ACL, rollback, desktop/mobile tests; no duplicate `product_master` |
| T3.2.1 Sales Spine | T3.1.1, R2.5.2, R2.6.1, R1 state/approval/chatter/worklist | `vnext/server/modules/sales/`, `vnext/client/modules/sales/` | 612 | Leads/opportunities, quotes, orders, reservations, delivery requests, returns/RMA, commissions, credit limits, invoice/payment bridges; sales workbench and mobile order surface | `sales:view`, `sales:manage`, `sales:approve`, `sales:post`; state, approval, audit, chatter, activity, notification, worklist hooks; golden quote→SO→partial delivery→backorder→invoice→payment→return→credit-note test; no direct GL/stock posting |
| T3.3.1 Procurement & Three-Way Match | T3.1.1, T3.4.1, R2.6.1 | `vnext/server/modules/procurement/`, `vnext/client/modules/procurement/` | 613 | Requisitions, RFQs, supplier comparison, POs, receipts, vendor bills, tolerances, returns, supplier scorecard | `procurement:view`, `procurement:manage`, `procurement:approve`, `procurement:post`; approval/requester/audit/worklist hooks; valid/tolerance/mismatch/override/partial/return/duplicate/supplier-score tests; actor/session and company scope enforced |
| T3.4.1 Inventory Operations | T3.1.1, R2.5.1–R2.5.2, T3.3.1 for draft supply | `vnext/server/modules/inventory/`, `vnext/client/modules/inventory/` | 614 | Operation types, routes/rules, reservations, pick/pack/ship, putaway, reorder, cycle count, barcode scan, draft supply requests; responsive operations surface | `inventory:view`, `inventory:manage`, `inventory:approve`, `inventory:post`; stock ledger/approval/audit/realtime hooks; route, conflict, valuation, batch/serial, putaway, count, company tests; offline drafts/scans only, never offline posting |
| T3.5.1 Manufacturing & Workshop Bridge | T3.1.1, T3.4.1, R2.5.2, R2.4.1 | `vnext/server/modules/manufacturing/`, `vnext/client/modules/manufacturing/` | 615 | BOM/revisions, phantom, routing, work centers/orders, reservations, WIP, production, byproducts/scrap, job cards/time, cost rollup, read-only workshop adapter | `manufacturing:view`, `manufacturing:manage`, `manufacturing:approve`, `manufacturing:post`; approval/workflow/audit/realtime/quality-hook hooks; two-level BOM, phantom, cost, scrap, byproduct, reversal, legacy read-only tests; never mutate `omni.jobOrders` or payroll timesheets |
| T3.6.1 Landed Costs & Subcontracting | T3.3.1, T3.4.1, T3.5.1, R2.1–R2.5 | `vnext/server/modules/subcontracting/`, `vnext/client/modules/subcontracting/` | 616 | Landed-cost vouchers/allocation bases, valuation/GL adjustment, subcontract BOM/issue/receipt/service cost/variance/return | `landed_cost:view`, `landed_cost:manage`, `landed_cost:approve`, `landed_cost:post`; immutable stock/GL/reversal/audit hooks; mixed-basis hand math, atomicity, subcontract valuation, vendor balance, reversal, cross-company tests |
| T3.7.1 Projects, Services, Helpdesk & SLA | T3.1.1, T3.4.1, R2.4.1, R2.6.1 | `vnext/server/modules/projects/`, `vnext/server/modules/helpdesk/`, `vnext/client/modules/projects/`, `vnext/client/modules/helpdesk/` | 617 | Projects/phases/tasks/dependencies/milestones, separate project timesheets, costs/billing/contracts, tickets, SLA clocks, field-service work orders/parts | `project:view`, `project:manage`, `project:approve`, `helpdesk:view`, `helpdesk:manage`; audit/chatter/activity/follower/worklist/notification hooks; billing/no-duplicate/P&L/milestone/fixed/T&M/SLA/contract/field-service/frozen-regression tests; never use payroll timesheets |

### R3 task contract

Every task must provide `TASK.md`, `TEST.md`, and `INTEGRATION.md` in its owned prefix; use server-derived actor identity and scope, shared kernel state/ACL/audit/chatter/workflows, idempotency, reversals, and migration down coverage. The integrator runs each task's disposable HTTP/browser gate before appending its progress and ledger evidence. R3 exit runs all seven task suites plus R0/R1/R2/T2.O10.1, integrity, security, provenance, runtime-DDL, frozen-zone, desktop/mobile PWA, and golden-flow checks, then stops before R4.

### R3 implementation status and stop record — 2026-07-18

The authorized R3 pass delivered migrations 610–617, the authenticated/scoped `/api/x/r3` boundary, the standalone RTL responsive entry point `vnext/client/r3.html`, and additive module entry points under the seven R3 lanes. `scripts/test-r3-core.mjs` passed 14/14; `scripts/test-r3-http.mjs` passed 16/16; `scripts/test-migration-dependencies.mjs` passed 30/30; node syntax checks passed. The pre-existing stock runtime-DDL hook was converted to a migration-owned compatibility no-op.

The release gate is intentionally **NOT ACCEPTED**: the full mandatory R3 acceptance matrix still requires ledger-backed inventory execution, production/WIP/workshop adapters, landed-cost GL valuation/reversal, sales/procurement exception paths, complete approval/audit/chatter/workflow wiring, and interactive desktop/mobile browser evidence. R4 has not started. See `octagon-analysis/R3_COMPLETION_REPORT.md` for the exact blocker register.

## 13. R4 wave-entry decomposition — authorized 2026-07-19

R3 accepted (`VNEXT_PROGRESS.md` R3 RELEASE GATE PASSED). R4 (Governance Rollout, roadmap §RELEASE 4) is decomposed below. Governance is cross-cutting, so R4 lanes own governance/kernel-adjacent prefixes rather than one business module; every task builds on the existing kernel primitives (`vnext/server/approvals/`, `workflow/`, `acl/`, `audit/`, `chatter/`, `notify/`, `events/`, and the production AI tool gate pattern) and adds no runtime DDL. Migration block 622–625 reserved after 621, dependency-declared.

| Task ID / epic | Dependencies | Owned paths | Migration block | Required APIs/client surfaces | ACL, hooks, tests, security and acceptance |
|---|---|---|---|---|---|
| R4.1 Approval policy & authority-limit rollout | R1.9 approvals kernel, R2/R3 documents | `vnext/server/modules/governance/policy-engine.js`, `migrations/622` | 622 | Seeded per-module `x_approval_policies` packs (finance/procurement/sales/inventory/subcontract); policy-coverage query API | maker≠checker enforced by kernel; authority-limit escalation; test: every sensitive R3 transition has a policy row, finance maker≠checker, limit escalation, no ungoverned sensitive transition |
| R4.2 Workflow templates & worklist activation | R1.7 worklist, R1.11 workflow-engine | `vnext/server/modules/governance/workflow-templates.js`, `migrations/623` | 623 | Installable standard automation library (lead routing, overdue-invoice reminder, reorder alert, SLA warning, WO-delay escalation); worklist seed activation | scenario test per template; worklist badge accuracy under scoped users; templates are data, retract cleanly |
| R4.3 Security hardening pass | R1.2 ACL, all R2/R3 routes | `vnext/server/modules/governance/security-audit.js`, `scripts/test-r4-security-audit.mjs` | — | Route-gating coverage report; IDOR probe harness; field-mask coverage; export-leakage check | acceptance: 100% `/api/x/r3` + `/api/x/r2` write routes gated; IDOR cross-company probe suite green; mass-assignment rejected; masked fields never exported |
| R4.4 Collaboration & activity wiring | R1.4 chatter/history, R1.8 notify | `vnext/server/modules/governance/collaboration.js`, `migrations/624` | 624 | Followers, scheduled activities, tracked-field auto-log, record-header status/next-activity; generic across every R2/R3 entity | every document type shows thread+history+followers+activities; tracked-field change auto-logs; per-entity verified |
| R4.5 AI operating layer (governed tool registry) | R1.9 approvals, R4.1 policies | `vnext/server/modules/governance/ai-tool-registry.js`, `migrations/625` | 625 | VNext tool registry (schema args, risk class, required perm, precondition, preview, idempotency, compensating action); read tools open, write tools approval-classed; kill-switch; zero-ungoverned-write scanner | preview→approval→execute→audit chain; tampered/expired preview fails closed; kill-switch halts mid-flight; scanner proves zero write path outside registry |

R4 exit gate = all five R4 suites green + full R0–R3 regression + integrity/FK + provenance + runtime-DDL + frozen-zone, then continue to R5.

## 14. R5 wave-entry decomposition — authorized 2026-07-19

R4 accepted (`VNEXT_PROGRESS.md` R4 GOVERNANCE ROLLOUT COMPLETE). R5 (Configurability, Reporting & People, roadmap §RELEASE 5) is decomposed below. R5 builds on the R1.1 registry (collection_registry/field_registry/x_custom_fields, generic crud-engine) and the R2.6 AR/AP posting for expense reimbursement. Migration block 626–630 reserved after 625, dependency-declared. Frozen payroll/attendance/timesheet boundary is absolute for R5.5.

| Task ID / epic | Dependencies | Owned paths | Migration block | Required APIs/client surfaces | ACL, hooks, tests, security and acceptance |
|---|---|---|---|---|---|
| R5.1 Config-CRUD & entity studio | R1.1 registry, R1.12 modules | `vnext/server/modules/studio/entity-studio.js`, `migrations/626` | 626 | Create collection+fields+states+menu+permissions via registry writes; studio-created entity served by the generic CRUD path | studio entity indistinguishable (API/ACL/audit) from seeded; parity checklist; reserved-name + duplicate guards |
| R5.2 Custom-field UX + formula fields | R1.5 custom fields | `vnext/server/modules/studio/formula-engine.js`, `migrations/627` | 627 | End-user field manager; sandboxed formula/computed fields, dependency-tracked recompute, conditional visibility | sandbox blocks IO/global/require/process; formula recomputes on dependency change; cycle detection |
| R5.3 Report designer & dashboards | R1.1 registry, R2 data | `vnext/server/modules/reporting/report-engine.js`, `migrations/628` | 628 | Saved query builder (entity+filters+group+agg) compiled to scoped parameterized SQL; widget/dashboard config; NL bridge | query is company-scoped + injection-safe; "sales by branch by month" builds; no raw SQL from user |
| R5.4 Template-print & public forms | R1.10 print, R1.8 notify | `vnext/server/modules/reporting/public-forms.js`, `migrations/629` | 629 | Print-template versioning w/ stored render snapshot; public token forms → quarantine inbox → promote | rate-limit + quarantine; template edit doesn't mutate archived print snapshot; promote transitions with audit |
| R5.5 HR-additive suite (frozen-safe) | R2.6 AR/AP, R1.9 approvals | `vnext/server/modules/hr/hr-additive.js`, `migrations/630` | 630 | Leave v2 accrual DSL, ATS pipeline, skills, expense claims → reimbursement JE, dated HR versioning | frozen boundary: never writes attendance/payroll — write-attempt fails closed; accrual DSL golden; ATS E2E; expense posts JE |

R5 exit gate = all five R5 suites green + full R0–R4 regression + integrity/FK + provenance + runtime-DDL + frozen-zone, then continue to R6.

## 15. R6 wave-entry decomposition — authorized 2026-07-19

R5 is accepted in `VNEXT_PROGRESS.md`. R6 (Revenue & Customer Experience,
roadmap §RELEASE 6) is decomposed below. This entry releases **R6.1 only** for
implementation; R6.2–R6.7 remain pending until their prior task gates and an
explicit continuation boundary. Migration block 631–637 is reserved after
630, dependency-declared. POS offline capture is the only new offline command;
GL, stock, payment, approval, identity, payroll, attendance, and timesheet
posting remain online/server-authoritative.

| Task ID / epic | Dependencies | Owned paths | Migration block | Required APIs/client surfaces | ACL, hooks, tests, security and acceptance |
|---|---|---|---|---|---|
| R6.1 POS v2 | R2.1/R2.5, R3.1/R3.2, T2.O10.1 | `vnext/server/modules/pos/`, `vnext/client/offline/offline-store.js`, `vnext/server/events/events.js`, `migrations/631` | 631 | terminal profiles; open/close; offline `pos.sale` replay; cash/card Z-report; refunds; QR self-order menu/draft | `pos:view`, `pos:manage`, `pos:post`, `pos:close`; server actor/company scope; exact-once key binding; no GL before close; balanced Z-report; disposable suite; migration down; prohibited offline command negatives |
| R6.2 Subscriptions & dunning | R2.6, R1.8/R1.10 | `vnext/server/modules/subscriptions/`, `vnext/client/modules/subscriptions/`, `migrations/632` | 632 | plans, lifecycle, proration, billing run, dunning ladder, MRR/churn | invoice/AR posting, idempotency, dunning worklist/print/channel tests; no silent billing failure |
| R6.3 Loyalty & membership | R3.1/R4.2, R6.1 | `vnext/server/modules/loyalty/`, `vnext/client/modules/loyalty/`, `migrations/633` | 633 | unified points/coupon/gift-card/eWallet/tier engine across POS/SO/portal | append-only ledger; liability reconciliation; expiry and cross-channel tests; ACL/company scope |
| R6.4 Customer/vendor portals | R1.14/R3.2/R3.3/R5.4 | `vnext/server/modules/portals/`, `vnext/client/modules/portals/`, `migrations/634` | 634 | invited portal identity; customer quote/invoice/ticket; vendor RFQ/PO/bill status | IDOR denial; own-partner row scope; quote approval audit; real session/cookie tests |
| R6.5 Appointments & resources | R1.13/R1.8/R5.4 | `vnext/server/modules/appointments/`, `vnext/client/modules/appointments/`, `migrations/635` | 635 | resources, calendars, slots, public booking, reminders, no-show | concurrent double-booking exclusion; fixture-clock reminder; token/quarantine controls |
| R6.6 eCommerce foundation | R3.1/R3.2/R5.4 | `vnext/server/modules/ecommerce/`, `vnext/client/modules/ecommerce/`, `migrations/636` | 636 | catalog, Arabic/RTL storefront, cart, checkout, SO/payment-intent hook, abandoned cart | guest partner quarantine; server stock visibility; SO and automation tests; no payment gateway implementation |
| R6.7 Omni-communications | R1.8/R4.2/R5.4 | `vnext/server/modules/omni-communications/`, `vnext/client/modules/omni-communications/`, `migrations/637` | 637 | WhatsApp/in-app/email threading, campaigns, opt-out, throttle, A/B | consent/opt-out/throttle suite; partner chatter threading; media/voice policy remains governed by REC-006/O-10 |

R6.1 focused gate = `scripts/test-r6-pos-v2.mjs` 13/13 + syntax + migration
631 down + connectivity prohibited-command negative. Stop after recording this
focused evidence; do not begin R6.2 until separately released.

## 16. R9.3 vertical-pack wave decomposition — Retail/POS first slice

R9.1 and R9.2 are accepted in `VNEXT_PROGRESS.md`. R9.3 starts with the
owner-prioritized Retail/POS pack. This first bounded slice reserves migration
903 and keeps all stock/GL/approval/identity/payroll actions online and governed.

| Task ID / epic | Dependencies | Owned paths | Migration block | Required APIs/client surfaces | ACL, hooks, tests, security and acceptance |
|---|---|---|---|---|---|
| R9.3.1 Retail/POS foundation | R9.1 Pack SDK, R2.1/R2.5, R6.1 POS concepts | `vnext/server/modules/packs/retail-pos-{engine,routes}.js`, `migrations/903`, `scripts/test-r9-retail-pos-pack.mjs` | 903 | company-scoped stores; shift open/close configuration; barcode registration/lookup; idempotent sale/return/count scan events | server actor + company scope; one open shift per store; duplicate store/barcode rejection; exact-once scan key; disposable suite + schema-restoring down + R9.1/R9.2/migration dependency regression |

R9.3.1 gate passed: focused Retail/POS **5/5**, Pack SDK **7/7**, Workshop
**9/9**, migration dependency/integrity **30/30**, syntax clean.

| R9.3.2 governed POS transaction adapter + Pack SDK conformance | R9.3.1, R2.1/R2.5/R2.6, R6.1, R9.1 | `vnext/server/modules/packs/retail-pos-{engine,routes}.js`, `migrations/903`, `scripts/test-r9-retail-pos-pack.mjs` | 903 | atomic sale/return/refund/cancellation/reversal tickets; canonical stock/GL/payment/tax integration; idempotent POS command surface | server actor + company scope + ACL; malformed line/tax/quantity/discount rejection; insufficient-stock/payment/GL failure rollback; closed-shift/cross-company rejection; duplicate reversal rejection; immutable original fiscal output; exact stock and GL restoration; audit/outbox/event evidence; Pack SDK install/uninstall/zero-residue conformance; safe migration rollback |

R9.3.2 gate passed: focused Retail/POS **22/22**, Pack SDK **7/7**, Workshop
**9/9**, migration dependency/integrity **30/30**. Remaining R9.3 packs
(pharmacy, clinic, restaurant, etc.) are not started; do not begin them
before explicit release.
