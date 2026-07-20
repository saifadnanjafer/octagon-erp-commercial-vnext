# OCTAGON COMMERCIAL VNEXT — MASTER ROADMAP (Rev 3, CANONICAL)
Authority level 7 — **the single canonical roadmap** for the Commercial VNext generation. Rev 3 synthesized 2026-07-17 (Fable 5 session) from: Rev-1 roadmap (archived at `_archive_OCTAGON_VNEXT_MASTER_ROADMAP_rev1_20260717.md` — every valid item preserved), the Rev-2 study (Odoo 19 deep source `erp-research/06–10`, NocoBase deep source `11`), the Gap & Donor Matrix + Rev-2 addendum, the Coverage Cross-Check, the Truth Audit, and the Target Architecture. Where this file conflicts with any earlier document except the Executive Blueprint (authority 1) and the license table (authority 2), **this file wins**.

## Current Status Summary (2026-07-20)
- Total Decomposed Tasks: **71**
- Completed Tasks Count (unweighted item count): **63/71** (R0: 4/4, R1: 14/14, R2: 9/9, R3: 7/7, R4: 5/5, R5: 5/5, R6: 7/7, R7: 5/5, R8: 5/5, R9: 2/4 fully completed + R9.3 Retail/POS completed slice)
- Core Technical Platform Completion: **100%** (Releases 0-8, R9.1, R9.2 complete)
- Commercial Readiness Estimate: **85%** (pending remaining R9.3 industry vertical packs and Release 10 migration/piloting)
- Overall Product Completion: **85%**

**Relationship to the production track:** `octagon-erp/MASTER_ROADMAP.md` + `AGENT_EXECUTION_PLAN.md` govern the *current production* system (Arc 1 complete; Phase-7 audit/hardening queue open). That track continues independently to keep production stable for existing users. **This roadmap governs the isolated VNext generation only.** No VNext work touches production; no production stabilization task is superseded by this file.

**Binding owner decision O-10 (2026-07-18):** VNext is online-first, real-time, cross-platform, and PWA-installable by default, with hosted/private/LAN/local-server deployment modes. The connected server is authoritative. Selective offline workflows use IndexedDB, durable outbox, idempotent replay, conflict detection, retries, and visible sync state. See [`OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md`](OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md) and the live [`OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md`](OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md).

---

## 0. Rules for every implementation agent

**Binding scope and release clarification (2026-07-17, current authorization reconciled 2026-07-18):** `company_id` is required and non-null on every tenant-owned master, transactional, ledger, workflow, attachment, and operational record. Do not add it mechanically to global technical/reference tables. R0.4 owns the table-by-table classification and migration enforcement; R1.13 establishes the minimum commercial master-data kernel before any ledger or stock work begins. R0-R8 are complete, and R9.1, R9.2, and the R9.3.3 Retail/POS slice are fully complete and verified. The actual next authorized task is the completion of the remaining R9.3 industry-specific vertical packs (pharmacy, clinic, restaurant, etc.) or Release 10 migration and validation.

### 0.1 Binding data-scope register

R0.4 must maintain the following table-by-table classification in migrations and schema documentation.

| Class | Required treatment |
|---|---|
| Global technical/reference | `schema_migrations`, migration locks, engine/module/permission definitions, countries, language packs, global currency definitions, and other immutable code/reference catalogues have no `company_id`. |
| Tenant-root | Tenant metadata and the root `company` row are DB-level tenancy roots. The root company establishes its own `company_id` at creation; no ordinary business row may use a missing or synthetic scope. |
| Company-owned | Every business master, transaction, ledger record, workflow/audit/attachment, and operational record requires a valid, non-null `company_id` with a company foreign key. Attachments persist the owning record's company and orphan attachments are rejected. |
| Optionally company-scoped reference | A reusable global definition can remain global, but every selectable policy, rate, availability, default, or assignment is stored in a separate company-owned linking record with required `company_id`. |

R0.4 acceptance must reject a missing or invalid `company_id` on every company-owned table and confirm global technical/reference tables remain unscoped.

### 0.2 Binding master-data and fiscal-document constraints

R1.13 is a hard prerequisite for every ledger or stock task. It must deliver products/services, units of measure, categories, parties, companies, branches, warehouses, locations, currencies and dated rates, taxes, accounts, and fiscal years/periods, with scoped create/read fixtures and cross-company HTTP proof.

R2.1 is unified only at the accounting boundary, never a universal god object. `fiscal_doc` is a typed accounting header limited to explicit categories: `manual_entry`, `sales_invoice`, `sales_refund`, `purchase_invoice`, `purchase_refund`, `cash_receipt`, `cash_payment`, `stock_valuation`, `tax_adjustment`, and `period_close`. Operational orders, shipments, work orders, POS tickets, contracts, and service records remain source-specific records. Each source owns validation and an explicit posting adapter that can create only its permitted category. Posting validates source category, company, period, balance, and source-specific rules before immutable journal output. Cancellation creates a cross-linked reversal document and never mutates original posted output; repost/rebuild tooling applies only to derived balances.
1. Work only inside `octagon-erp-commercial-vnext/` after authorization for the applicable task, never in `octagon-erp/` (production). Operate via Git on the target repository. Never open/point at the production `database.db`. The actual next authorized task is the completion of the remaining R9.3 industry-specific vertical packs (pharmacy, clinic, restaurant, etc.) or Release 10 migration and validation.
2. Pull tasks from `OCTAGON_VNEXT_EXECUTION_PLAN.md` (authority 8), which decomposes these epics. Respect release entry/exit gates. Within a release, epics marked ∥ run in parallel lanes with exclusive file ownership.
3. **FROZEN:** employee/timesheet/attendance/payroll data + logic (Truth Audit §6 maps every function). Read-only via `LegacyPayrollAdapter`. Any change = owner decision O-3, never an agent decision.
4. **License law (binding, forensic doc §0):** Odoo/ERPNext/IDURAR/NocoBase = clean-room concepts only (no code copy, no line-by-line ports); RuoYi/AureusERP = MIT, copy allowed with `THIRD_PARTY_NOTICES.md` entry. Provenance comment on every engine: `// clean-room; behavior modeled on <donor path> (<license>, not copied)`.
5. **Determinism law:** accounting, stock, payroll, taxation, authorization are rule-based and never depend on AI. Every AI write action goes through the registered-tool contract (permission → precondition → preview → approval → idempotency → audit → compensating action).
6. **Backend-authority law:** permissions enforced server-side (row scope injected into queries, field masks on serialization). Frontend hiding is UX only. Deny-by-default; **no loopback/localhost trust bypass exists in VNext** (the Truth-Audit Q2 blocker must never be reproduced).
7. Vertical slices: schema → service → permission → workflow → UI → audit → migration → tests. No frontend-task floods before the engines they need exist.
8. Every epic's DoD includes: acceptance tests green, Arabic-first RTL UI, audit events verified, migration/rollback notes written, docs updated, progress line appended to `VNEXT_PROGRESS.md`.

## 1. Disposition ledger — every capability classified
The classification universe = current Octagon (103 modules + services + W0 spike, Truth Audit §2/§7) ∪ all donor capabilities (Coverage Cross-Check §1–6, which remains the exhaustive per-donor row inventory; nothing in it is dropped by this roadmap).

### 1.1 Current Octagon → VNext disposition (from Truth Audit §7, now binding)
| Capability | Disposition | Where in this roadmap |
|---|---|---|
| Payroll / timesheet / attendance (FROZEN) | **Preserve behind adapter** | R0.3, validated R10.2 |
| Auth core (salted hash, lockout, `auth_sessions`) | **Preserve + strengthen** | R1.14, R8.3 |
| Server AI governance (`server-jarvis-security.js`, AI-key proxy) | **Preserve + absorb as kernel engine** | R4.5 |
| Operation-lock idempotency; backup/restore/verify | **Preserve** | R0.4, R8.5 |
| W0 platform engines (crud/acl/chatter/approvals/audit/sequences/workflow/views-fields/notify/print) | **Strengthen → rebuild into R1 kernel** (right shape, wrong integration) | R1.1–R1.11 |
| Finance v6 (`financeService`, mutable `account_moves` JSON) | **Rebuild (data-preserving)** on immutable GL | R2.1–R2.7, migrate R10.1 |
| Stock/inventory (JSON, client state machine) | **Rebuild** on immutable stock ledger | R2.5, R3.4 |
| Numbering ×3 / state ×2 / audit ×2 / ACL ×3 (duplicated engines) | **Consolidate** into one kernel engine each | R1.3, R1.4, R1.2 |
| Sales/CRM, procurement, MRP pages (frontend-only over JSON) | **Rebuild as thin modules** on kernel + ledgers | R3.* |
| Cross-vertical apps (appointments, loyalty, events, subscriptions, surveys, visitors, helpdesk, esign, knowledge, documents, assets, fleet, marketing, budgeting) | **Rebuild as config-CRUD entities + engines** (feature parity gate R10.5) | R5.1, R6.*, R7.5 |
| Verticals (retail/pharmacy/clinic/restaurant/real-estate/hotel/rental/field-service) | **Industry packs** | R9.3 |
| Tenant scaffolding (`tenantService`, flag-gated) | **Rebuild always-on** (`company_id` from R1) | R1.13, R8.1 |
| WhatsApp integration | **Preserve + strengthen** (channel of notification center) | R1.8, R6.7 |
| Jarvis/Omni AI copilot + voice + kiosk/TV surfaces | **Preserve + adapt** onto VNext APIs | R4.5, R7.1 |
| `app.js` monolith + 134-script boot | **Rebuild (do not extend)** — shell + section bundles | R1.12/R5.1 UI architecture |
| Route-health / stabilization self-tests | **Strengthen** into VNext QA gates | R10.4 |

### 1.2 Donor capabilities
Per `OCTAGON_VNEXT_COVERAGE_CROSSCHECK.md`: ABSORB→ mapped to epics below; MERGE→ folded into the named epic; PACK→ R9.3; LATER→ §8 deferred register (with release trigger); EXCLUDE→ §8 with documented reason. The cross-check file remains the row-level authority; this roadmap adds the *when and how*.

## 2. Release trains — sequence and gates
```
R0 Isolation & Data Architecture ──► R1 Platform Kernel ──► R2 Immutable Finance & Stock ──► R3 Core Trading/Mfg/Services
      (R4 Governance rollout ∥ from mid-R3)      (R5 Configurability/Reporting/People ∥ after R1+R2)
R6 Revenue & CX ──► R7 Industrial Ops ──► R8 Enterprise/SaaS/Integration ──► R9 Packs & Marketplace ──► R10 Migration/Pilot/GA
```
Critical path: R0→R1→R2→R3→R10. R4 starts when R1.9/R1.11 gate (runs alongside R3). R5 starts after R1 gate (designer parts need R2 data). R6/R7 need R2+R3; R8 partially parallel (R8.3/R8.4 anytime after R1); R9 needs R1.12 + two stable module trains. Entry gate = prerequisites' exit gates green + owner items cleared. Exit gates listed per release.

---

# RELEASE 0 — Isolation, Baseline & Data Architecture
**Entry:** owner go-signal + owner decision O-1 (fork approval). **Exit:** fork boots on own DB; production SHA-256 manifest unchanged; migration runner executes+rolls back a no-op migration; adapters return real frozen-zone data read-only.

### R0.1 — VNext fork & environment isolation
- **Outcome:** an isolated `octagon-erp-commercial-vnext/` generation; production preserved byte-identical. **Problem:** no safe workspace exists; repo has no usable git.
- **Current:** production live at `octagon-erp/`; prior W0 spike mounted in it (Truth Audit §3). **Donor:** — (Clone & Migration Plan §2 procedure).
- **Scope:** pre-clone verified backup (`/api/backup` + folder copy to `release-backups/pre-vnext-clone-<ts>/`); SHA-256 manifest of critical files; copy code excluding data/secrets/node_modules/logs/donor trees; assign port **8091**, own DB path `vnext-data/vnext.db`, own backup dir + `.env`; **boot-guard refuses any DB path resolving to production `database.db`**; clone manifest + `VNEXT_PROGRESS.md` seeded. **Excludes:** any feature work; any production edit.
- **Roles:** integrator only. **Entities:** none (filesystem). **States/Invariants:** production untouched (manifest proof); both servers never share a DB file.
- **Services/UI:** boot banner shows generation/port/DB; `/api/health` reports `generation:"vnext"`. **Perms/Audit:** n/a. **Jobs:** none.
- **Migration:** creates the baseline snapshot for all later migrations. **Back-compat:** production runs unchanged on 8090.
- **Prereqs:** O-1. **Downstream:** everything. **Sequence:** backup→manifest→copy→isolate→verify. **∥:** solo. **Cx:** M. **Risks:** accidental prod-DB pointer (mitigated by boot-guard + test).
- **Validation/Acceptance:** fork boots and serves on 8091 against its own DB; fork with prod DB path configured **refuses to start**; post-clone production manifest identical; both servers run simultaneously without WAL contention. **DoD:** `_manifests/clone-manifest.md` written.

### R0.2 — Licensing governance & third-party notices
- **Outcome:** legal safety from day one. **Problem:** mixed-license donors; commercial product must be provably clean. **Current:** none. **Donor:** forensic doc §0 (binding).
- **Scope:** `THIRD_PARTY_NOTICES.md` (MIT attributions: RuoYi, AureusERP); provenance-comment convention enforced by a lint script (`scripts/check-provenance.mjs` scans new engine files for the header); CONTRIBUTING note banning GPL/AGPL/OEEL code and unresolved-NocoBase copies. **Excludes:** resolving NocoBase's license with the vendor (owner item O-6).
- **Roles:** integrator. **Invariants:** no file enters VNext from a copy-prohibited tree. **Validation/Acceptance:** notices file exists; lint passes; spot-check of R1 engines shows provenance headers. **Prereqs:** R0.1. **Cx:** S. **∥:** with R0.3/R0.4.

### R0.3 — Legacy compatibility adapters (read layer)
- **Outcome:** VNext can *see* production-shaped data without touching it. **Problem:** frozen payroll + legacy JSON collections must feed VNext read-only. **Current:** none; frozen zone mapped at Truth Audit §6. **Donor:** self.
- **Scope:** `LegacyPayrollAdapter` (read-only accessors over `employees`, `payroll_*`, timesheet calc *results* — calls approved legacy functions, never re-implements them), `LegacyEntityAdapter` (maps JSON `collections` blobs → VNext collection shapes for migration preview), `LegacyFinanceBridge` *interface* (dual-post contract used in R2.1; implementation lands there). Adapters run against a **copied sanitized DB**, never live. **Excludes:** any write path; any payroll logic change.
- **Entities:** adapter DTOs only. **Invariants:** adapters have zero mutating methods (enforced by test reflecting exported API). **Perms:** `platform:legacy:read` (admin-only).
- **Prereqs:** R0.1. **Downstream:** R2.1, R5.5, R10.1–R10.2. **Cx:** M. **Risks:** silently diverging from frozen calc — mitigated by golden-file tests comparing adapter output to legacy self-test fixtures. **Acceptance:** adapter returns an employee's month summary equal to the legacy calculator's output on the sanitized copy; write attempt = compile/API error.

### R0.4 — VNext database & migration architecture ⭐(new in Rev 3)
- **Outcome:** a real relational data layer + disciplined change management — the divorce from "everything is one JSON blob." **Problem:** production stores business data as `collections(collection,id,data)` JSON (Truth Audit §1); VNext needs relational tables, FKs, indices, and versioned migrations; two parallel data worlds must not recur. **Donor:** NocoBase migration-manager concept (clean-room); Odoo module-upgrade discipline (concept).
- **Scope:** keep **`node:sqlite` `DatabaseSync`** (matches runtime; Truth Audit §8.3) with WAL+busy_timeout; schema conventions (singular snake_case tables, `company_id TEXT NOT NULL` on every business table, `id` TEXT ULID, `created_at/updated_at/created_by`, soft-delete only where doc-state doesn't apply); **migration runner**: ordered `migrations/NNN_name.sql|.mjs`, `schema_migrations` ledger table, idempotent up + documented down/rollback note, dry-run mode, automatic pre-migration backup; seed framework (idempotent, guard flags); JSON1 usage policy (JSON allowed for `dims`, `custom{}`, snapshots — never for whole business records). **Excludes:** Postgres portability work (deferred; write ANSI-ish SQL, note divergences).
- **Roles:** platform engineer. **Invariants:** no engine creates tables outside a migration; every migration reversible or explicitly marked irreversible with owner sign-off. **Services:** `migrate.mjs up|down|status`. **Validation/Acceptance:** fresh DB builds from migrations alone; `status` clean; a demo migration up+down leaves schema byte-identical; company_id NOT NULL enforced by failing-insert test. **Prereqs:** R0.1. **Downstream:** every epic. **Cx:** M. **Risks:** SQLite ALTER limitations → convention: additive migrations + table-rebuild recipe documented.

---

# RELEASE 1 — Platform Kernel
**Entry:** R0 exit. **Exit gate (the kernel demo):** one demo entity (`crm_lead`) exercises end-to-end: registry-driven CRUD + numbering + doc-states + backend ACL with row-scope + field masks + chatter + audit/history + saved views + custom field + snapshot field + an approval + a workflow rule + a notification + import/export + template print — with **zero entity-specific server code** and permissions provably enforced via HTTP tests (not UI). Lanes: **A** (data/CRUD/state/workflow), **B** (security/approvals/collab), **C** (numbering/audit/fields/views/notify/print), **D** (org/auth/UI-shell).

### R1.1 ∥A — Collection registry & config-driven CRUD engine
- **Outcome:** hundreds of consistent screens from configuration; new entity ≈ 1 registry entry + 1 UI config. **Problem:** production hand-codes every page (103 modules); W0 proved the engine but nothing consumes it (Truth Audit §3).
- **Current:** W0 `crud-engine.js` (533 ln) + `ui-crud.js` (813 ln) real but demo-only. **Donor:** IDURAR createCRUDController (AGPL — clean-room), NocoBase resourcer auto-CRUD (`collectionToResourceMiddleware`, license unsettled — clean-room), Odoo ORM concepts (LGPL — clean-room).
- **Scope:** `collection` + `field` registry tables (interface-vs-storage split) + `entity_registry` seed; uniform REST `/api/x/:entity/{create,read/:id,update/:id,delete/:id,list,summary}` with envelope `{success,data,error,meta}`; list = pagination/sort/q/typed filters compiled to SQL (json1 for custom fields); relation fields (m2o searchable, o2m child tables, m2m); per-entity hooks (`beforeCreate/afterWrite`) as registration points for state/audit/chatter/workflow; client renderer `OX.crud.mount` (list+summary cards+filter bar+drawer form+row actions) reading a UI config registry; **section-bundle UI shell** (nav tree, lazy per-section script loading — kills the 134-script boot pattern). **Excludes:** visual entity-designer UI (R5.1); public forms (R5.4).
- **Roles:** all users (per ACL). **Entities:** `collection`, `collection_field`, `x_record`-style generic store **only** for config-CRUD entities; ledgered domains get dedicated tables (R2). **States:** via R1.3. **Invariants:** no route without ACL middleware; every write emits audit; envelope identical across entities.
- **Services/API:** as scoped + `/api/x/_meta/entities`. **UI:** Arabic RTL list/form/detail; theme-safe. **Perms:** from registry `acl` key. **Approvals/Audit/Jobs:** hook points wired (consumers land in sibling epics). **Reports:** `/summary` per entity.
- **Migration:** registry seeded by migration; W0 `entities.json` superseded. **Back-compat:** none needed (VNext-only).
- **Prereqs:** R0.4. **Downstream:** every module. **Sequence:** registry schema→server verbs→filters/relations→hooks→client renderer→shell. **∥:** lane A. **Cx:** L. **Risks:** filter-compiler injection (parameterized only + fuzz tests); generic-store overuse (rule: ledgers/documents get real tables).
- **Validation:** HTTP CRUD round-trip zero-code on a new registry entry; SQL-injection fuzz on filters; perf: list of 10k rows < 150 ms. **Acceptance:** adding entity `test_thing` via registry alone yields working API+UI. **DoD:** engine docs + registry how-to.

### R1.2 ∥B — Backend ACL: roles, row scopes, field security, menus
- **Outcome:** the #1 commercial blocker eliminated — server-authoritative permissions. **Problem:** production enforces in the browser; server ACL bypassed on loopback (`server.js:2145,2215` — Truth Audit Q2).
- **Current:** client `permissionService.js` (536 ln); coarse `acl.json`; W0 `acl.js` (431 ln, all/own/dept) unused on real routes. **Donor:** NocoBase ACL middleware — WHERE-scope injection, source-verified (`packages/core/acl`, clean-room); Odoo `ir.rule` + field `groups=` + `ir.model.access` (clean-room); RuoYi permission strings + data-permission interceptor (MIT).
- **Scope:** `acl_role`, `acl_grant(role, perm 'domain:entity:action', scope all|company|dept|own)`, `user_role` (multi-role + runtime switch, union semantics), `field_mask(role,entity,field, read|write|none)`, menu gating from grants; middleware chain `authenticate → resolveRoles → requirePerm → injectScope(SQL predicate) → maskFields`; **deny-by-default; no trusted-loopback mode — localhost without a session gets 401**; admin matrix UI (Arabic); seed roles (admin/manager/accountant/sales/operator) migrated from `acl.json`. **Excludes:** SSO/OIDC (R8.3); approval-authority amounts (R1.9).
- **Invariants:** 100% of `/api/*` mutating routes behind `requirePerm`; scope predicate applied to list **and** read-by-id; masked fields absent from JSON, not blanked client-side. **Audit:** `acl.grant.changed` events with before/after.
- **Prereqs:** R1.1 registry (entity→perm map). **Downstream:** all. **Cx:** L. **Risks:** predicate correctness across joins (dedicated scope test-suite: 2 companies × 2 depts × own-records fixtures); perf (grant cache with invalidation event).
- **Validation/Acceptance:** route-coverage scanner reports 0 ungated routes; own-scope user's list/read/update confined (403 on foreign id); field-masked payload verified at HTTP layer; loopback-no-session = 401. **DoD:** security README + coverage report artifact.

### R1.3 ∥A — Document lifecycle & state-machine engine
- **Outcome:** one configurable submit/cancel/approve backbone for every document. **Problem:** production has a 6-transition client state machine + per-page flags (Truth Audit Q3) — server-unenforced, duplicated.
- **Donor:** Odoo's minimal-states + computed-orthogonal-status insight (`account.move` draft→posted→cancel + computed `payment_state` — 06 §4; clean-room); NocoBase workflow separation (states ≠ automation).
- **Scope:** `doc_state_def` per entity (states[], transitions[edges + guard refs], terminal flags), `doc_state` current-state row, guards = permission / required-fields / approval-pending / period-open (pluggable); transition API `POST /api/x/:entity/:id/transition {to}`; posting hooks (`onEnter(posted)` etc.) consumed by ledgers (R2); computed status fields pattern documented (never store what can be derived). **Excludes:** BPMN-style multi-branch flows (that's R1.11 automation, not document state).
- **Invariants:** illegal transition = 409; guard failures reported with reason codes; state changes audited; **posted documents immutable except via defined reversal transitions**.
- **Prereqs:** R1.1. **Downstream:** R2 documents, R3 modules. **Cx:** M. **Risks:** over-generalization — baseline template = draft→submitted→posted|cancelled, extended per entity. **Acceptance:** demo entity walks the full graph via API; forbidden edge 409s; guard block carries reason; audit trail complete.

### R1.4 ∥C — Numbering, audit trail & record history (consolidated)
- **Outcome:** one numbering engine (replacing today's three) + universal tamper-evident audit. **Current:** server `sequences` + W0 `x_sequences` + `modules/sequence-service.js` (Truth Audit §2 "duplicated"); client AuditService + W0 `x_audit`.
- **Donor:** Odoo `ir.sequence` + **gapless hashed journal chains** (06 — clean-room); NocoBase sequence-field + record-history (clean-room).
- **Scope:** `sequence(company_id, key, pattern '{PREFIX}-{YYYY}{MM}-{#####}', counter, fy_reset)` atomic via `BEGIN IMMEDIATE`; **gapless+hash-chained mode** for fiscal journals (each posted doc stores `prev_hash`+`hash`); `audit(entity,record_id,user,action,before,after,at)` from CRUD/state/ACL hooks; per-record history endpoint + UI panel; audit is append-only (no delete API). **Excludes:** external WORM storage (post-GA).
- **Invariants:** concurrent creates never share a number (stress test); hashed chains verify end-to-end; audit rows immutable. **Prereqs:** R1.1. **Cx:** M. **Acceptance:** 100-parallel-create uniqueness test green; chain verifier detects a tampered row in a fixture DB; history panel shows field-level diffs.

### R1.5 ∥C — Custom fields & snapshot fields
- **Outcome:** runtime configurability (no per-customer forks) + historically-correct documents. **Current:** W0 `views-fields.js` engine exists, demo-only. **Donor:** AureusERP `fields` plugin (MIT — reusable), NocoBase snapshot-field (clean-room), Odoo Studio *product concept* (enterprise-absent — design only).
- **Scope:** `custom_field(entity,key,label_ar,type,options,position,required)` merged into registry forms/lists/serialization (`data.custom{}` json1-indexed where filterable); **snapshot fields**: declarative `snapshot_of` relation fields materialized at a named doc-state transition (e.g. price/name/address frozen at `posted`) and immutable after. **Excludes:** computed/formula fields (R5.2).
- **Invariants:** custom-field removal never destroys stored values (tombstone); snapshots never re-resolve. **Prereqs:** R1.1, R1.3. **Cx:** M. **Acceptance:** admin adds a field via API/UI → appears everywhere incl. export; order line snapshot survives later product rename/price change (test proves divergence).

### R1.6 ∥B — Chatter: messages, followers, activities, attachments
- **Outcome:** the daily-collaboration fabric on every record. **Current:** W0 chatter (450 ln) real, demo-only. **Donor:** AureusERP chatter plugin (MIT — reusable), Odoo `mail.thread`/`mail.activity.mixin` semantics — subtypes, field-tracking, followers (10 — clean-room).
- **Scope:** thread (message|log|activity kinds), followers+subscriptions, scheduled activities (type, due, assignee, done), @mentions → notifications, attachments (file service: stored under `vnext-data/files/` with metadata table + access via record ACL), auto-log of tracked-field changes (from audit diff), chatter widget in the standard record drawer. **Excludes:** inbound email gateway (deferred §8); advanced realtime features beyond the R1/R8 event-layer baseline.
- **Invariants:** chatter visibility inherits record ACL; attachments ACL-checked on download. **Prereqs:** R1.1/R1.2. **Cx:** M. **Acceptance:** post/mention/follow/schedule/done round-trip; unauthorized user cannot fetch attachment by URL; tracked-field change auto-logs.

### R1.7 ∥B — Saved views & worklists
- **Outcome:** the ERP becomes next-action queues, not menus. **Current:** W0 `x_views` demo-only; no worklists. **Donor:** AureusERP table-views + worklist resources (MIT); Odoo filters/favorites (concept).
- **Scope:** per-user + shared saved views (filters/columns/sort) on any entity; **worklist registry**: named cross-entity queries surfaced as nav badges (seed set: مستحق الفوترة Orders-to-Invoice, بانتظار الاستلام PO-to-Receive, أنشطة متأخرة Overdue-Activities, دفعات للمطابقة Payments-to-Reconcile, أوامر تنتظر مواد Jobs-Waiting-Material, فحوصات معلقة Inspections-Pending — activate as their modules land); Home workbench renders worklist counts. **Prereqs:** R1.1/R1.2 (views respect scope). **Cx:** M. **Acceptance:** save/share/reload view; worklist count = query count under the viewer's scope.

### R1.8 ∥C — Notification center
- **Outcome:** one inbox; channels pluggable. **Current:** toasts + WhatsApp module; W0 notify demo-only. **Donor:** RuoYi notify templates/records (MIT); NocoBase channel abstraction (clean-room).
- **Scope:** `notification(user,type,title,body,link,read)` + templates; connected realtime server events are the primary delivery target under O-10; bounded in-app polling is degraded fallback only; **WhatsApp** (adapter around the existing preserved integration) + email-SMTP (config-optional); user channel preferences; emitters: chatter mentions, approvals, workflow nodes, worklist thresholds. **Prereqs:** R1.6. **Cx:** S–M. **Acceptance:** approval event → permitted realtime event plus in-app state and WhatsApp (sandbox) delivery; per-user mute respected. R1 closed before O-10, so the event transport itself is delivered by `T2.O10.1`, not retroactively claimed as an R1 acceptance.

### R1.9 ∥B — Universal approval engine & Approval Center
- **Outcome:** every sensitive action passes one policy-driven gate; one inbox UX (RuoYi-grade). **Current:** real server-side approvals exist **only** for AI tools (`server-jarvis-security.js` — preserve pattern); W0 approvals demo-only. **Donor:** RuoYi bpm Approval Center (MIT — my/todo/done/cc/delegated/escalated/withdrawn/rejected/returned), ERPNext `authorization_rule` amount limits (clean-room), NocoBase approval nodes (clean-room).
- **Scope:** `approval_policy(entity, condition, chain[steps: role|user, amount_limit], escalation_timeout, delegation_allowed)`, `approval_request(entity,record_id,action,payload,requester,status,current_step)`, `approval_step(decision, comment, decided_by, at)`; semantics: block-until-approved (action executes only on final approve), maker≠checker option, delegation/substitution registry (out-of-office), escalation on timeout (→ notification + optional auto-route up), withdraw + return-for-revision; guard integration with R1.3 (`approval-pending` state guard) and R1.11 (approval node); **Approval Center** page with the 9 boxes + badge counts. **Excludes:** BPMN visual designer (list-based chains now; designer deferred §8).
- **Invariants:** approved payload is what executes (hash-bound — no post-approval mutation); every decision audited. **Prereqs:** R1.2/R1.3. **Cx:** L. **Risks:** chain edge-cases (parallel steps deferred; sequential only in v1). **Acceptance:** amount-based policy blocks a payment > limit until manager approves; delegation routes to substitute; timeout escalates; withdrawn request releases the document; payload-tamper test fails closed.

### R1.10 ∥C — Import/export & template print
- **Outcome:** every entity Excel-in/out + branded documents. **Current:** one import page; W0 print-templates demo-only. **Donor:** RuoYi excel starter (MIT concept), NocoBase template-print (clean-room), IDURAR pdf flow (clean-room).
- **Scope:** export current view (respecting scope+masks) to xlsx; import wizard: file→column mapping→validation preview→per-row error report→bulk create via CRUD hooks (so audit/ACL apply); print-template entity (HTML + `{{placeholders}}` incl. child-table loops), RTL A4/A5, per-entity defaults (invoice/receipt/PO/WO seeded), print action in row menu → render+`window.print()`/PDF. **Prereqs:** R1.1/R1.2. **Cx:** M. **Acceptance:** 500-row import with 20 bad rows yields 480 created + exact error list; export of scoped user contains only their rows; invoice prints with correct Arabic layout.

### R1.11 ∥A — Workflow & automation engine
- **Outcome:** business rules without code. **Current:** W0 `workflow.js` (327 ln, record triggers) demo-only; legacy `automation-engine` module client-side. **Donor:** Odoo `base_automation` **boundary-crossing trigger semantics** (fires when a record *starts* matching a domain, not on every touch) + calendar-aware timed triggers + inbound webhook trigger (10 — clean-room); NocoBase durable Processor (persisted `execution`/`job` rows, resumable) + registry-of-node-types (11 — clean-room); RuoYi listener concepts (MIT).
- **Scope:** triggers: record created/updated with before/after-domain semantics, schedule (cron via scheduler), doc-state entered, manual button, inbound webhook (token-gated); nodes (sequential + condition branches): condition, update-record, create-record, request-approval (→R1.9), notify (→R1.8), HTTP call, delay (calendar-aware), run-registered-tool (→R4.5 AI/tool registry, always approval-classified); versioned definitions; durable execution log with retry/resume; run-log UI. **Excludes:** visual canvas designer (stepper UI now; canvas R5+ if demanded), parallel branches v1.
- **Invariants:** workflows cannot bypass ACL (execute as a declared service-role with its own grants); frozen-zone entities are unaddressable as targets; infinite-loop guard (depth+rate caps). **Prereqs:** R1.1–R1.3, R1.8, R1.9. **Cx:** L. **Acceptance:** "lead crosses into qualified → notify + create activity" fires exactly once (boundary semantics test); failed HTTP node retries then parks resumable; loop-guard kills a self-triggering workflow; run log shows step-level trace.

### R1.12 ∥D — Extension & module framework (inherit-not-fork) ⭐(new in Rev 3)
- **Outcome:** customizations and industry packs extend the core without forking it — Odoo's decisive ecosystem idea, adapted. **Problem:** today every variation edits shared JS (Truth Audit debt #4).
- **Donor:** Odoo 3-mode inheritance + xpath view extension + manifest/depends (10 — clean-room concepts); NocoBase plugin lifecycle `afterAdd→beforeLoad→load→install→upgrade` (11 — clean-room); AureusERP plugin-manager (MIT).
- **Scope:** module = folder with `manifest.json` (id, version, depends[], entitlement flag) + migrations + registry contributions; **extension points**: (a) registry patches — a module may add fields/states/menu items/worklists to an existing collection declaratively, (b) hook subscriptions (documented events from CRUD/state/workflow), (c) UI slot system — named slots in standard screens accept injected widgets/columns (declarative patch objects, not xpath — our schema-driven equivalent), (d) service override registry with explicit precedence; module lifecycle install/enable/disable/uninstall with migration hooks; **no-DB-writes-in-load** contract; conflict detection (two modules patching the same key → deterministic order by depends + warning). **Excludes:** marketplace distribution/signing (R9.4).
- **Invariants:** core files never edited by modules (enforced by ownership lint); disabled module's patches fully retract. **Prereqs:** R1.1. **Downstream:** R9 packs; all business modules ship *as* modules. **Cx:** L. **Risks:** patch-ordering hell — mitigate by shallow patch surface + conflict report. **Acceptance:** a sample module adds a custom field + menu + workflow to `crm_lead`, then uninstalls leaving zero residue; two conflicting patches produce a deterministic, reported result.

### R1.13 ∥D — Organization & fiscal structures (company/branch/dept/warehouse/currency/calendar)
- **Outcome:** multi-company-correct from the first table (blueprint risk #6 resolved early — this was R8-late in Rev 1, **moved to R1** because `company_id` is on every row from R0.4). **Current:** flag-gated scaffolding, "no-op" in shipping mode (Truth Audit Q4). **Donor:** Odoo company/branch model + `resource.calendar` (clean-room); RuoYi tenant packages (MIT — concept for R8.2 SaaS layer).
- **Scope:** `company` (legal entity: name, currency, locale, timezone, logo), `branch`, `department` (tree), `warehouse`+`location` masters (transactional use in R2.5/R3.4), `currency`+`currency_rate` (dated), **fiscal calendar** (`fiscal_year`, period rows — consumed by R2.2), working-hours calendars (SLA/workflow delays); company switcher UI; scope enforcement = R1.2 `company` scope; cross-company read roles explicit. **Excludes:** consolidation ledger (R8.1), SaaS tenant isolation (R8.2 — tenant ⊃ companies).
- **Invariants:** every business insert carries a valid `company_id`; rates never retro-edited (dated rows). **Prereqs:** R0.4, R1.2. **Cx:** M. **Acceptance:** user in company A cannot list/read company B rows (HTTP-proven); rate lookup by date deterministic; fiscal periods generate for a year in one action.

### R1.14 ∥D — Identity & auth hardening (VNext baseline)
- **Outcome:** production's genuine auth core, minus its trust holes, plus modern factors. **Current:** solid salted-hash+lockout+sessions (preserve); **loopback-trust bypass must not exist in VNext**. **Donor:** own auth core (preserve); Odoo auth stack — TOTP, password policy, timeout (10 — clean-room); NocoBase 2FA plugins (clean-room).
- **Scope:** port auth core; session hygiene (TTL, rotation on privilege change); password policy (length/complexity/expiry config); TOTP 2FA (optional per role — required for admin configurable); login audit + lockout telemetry; API keys for integrations (scoped to a role, revocable) — consumed by R1.11 webhooks/R8.4. **Excludes:** SSO/OIDC/passkeys (R8.3).
- **Invariants:** deny-by-default everywhere; no environment mode grants implicit admin. **Prereqs:** R0.1. **Cx:** M. **Acceptance:** TOTP flow E2E; policy rejects weak password; API key hits only granted routes; the Q2 bypass test (loopback, no session) returns 401 on every business route.

---

# RELEASE 2 — Immutable Finance & Stock Foundations
**Entry:** R1 exit + owner decision O-2 (reconciliation model + cut-date). **Exit:** post→cancel→repost reconciles to zero on fixtures; trial balance balances under concurrency; locked period rejects posting; stock valuation matches hand-computed fixtures (moving-avg + FIFO); dual-post reconciliation vs legacy sample = tolerance 0; Iraq localization pack installs CoA+taxes from data alone.

### R2.1 — Immutable GL engine & unified fiscal document model
- **Outcome:** the trust bedrock: append-only books with tamper-evidence — what makes Octagon *sellable* to accountants and auditors. **Problem:** production finance is mutable JSON (`financeService.js:587,610`); `x_gl` exists with **no posting engine** (Truth Audit Q1).
- **Donor:** ERPNext `gl_entry` append-only + reversal + repost (02 — clean-room); **Odoo unified `account.move`**: ONE fiscal-document model, `move_type ∈ {entry, out_invoice, out_refund, in_invoice, in_refund, out_receipt, in_receipt}`, minimal draft→posted→cancel + computed `payment_state`, `_check_balanced`, gapless hashed sequences (06 §4 — clean-room).
- **Scope:** `account` (chart, tree, type, company), `fiscal_doc` (the unified header: move_type, partner, dates, currency, state via R1.3) + `fiscal_doc_line` (account, debit, credit, currency amounts, tax refs, `dims` JSON, snapshot fields); **posting service**: validate balanced per currency → assign gapless hashed number (R1.4) → write append-only `gl_line` rows → emit `gl.posted`; **cancellation = reversal document** auto-generated (flagged, cross-linked) — posted rows never mutated; repost/rebuild tooling for derived balances; trial-balance/ledger/partner-ledger query services; multi-currency (rate at posting date, company + document currency columns, FX gain/loss account hooks); **LegacyFinanceBridge dual-post**: while migration runs, VNext postings mirror into a legacy-shaped `account_moves` copy for reconciliation reports (read-side only, on the sanitized DB — never production).
- **Excludes:** AR/AP documents UX (R2.6), reports UI (R2.7), consolidation (R8.1), deferred revenue (post-GA §8).
- **Roles:** accountant, finance manager, auditor (read). **States:** draft→posted→cancelled(reversal) via R1.3 guards (period-open, balanced, approval-if-policy). **Invariants:** Σdebit=Σcredit per doc per currency; posted lines append-only; every line carries company_id + posting_date + doc ref; hash-chain verifiable; no posting into locked period.
- **Services/API:** `post(docId)`, `reverse(docId,date,reason)`, `trialBalance(company,asOf,dims?)`, `generalLedger(account,range)`, `partnerLedger(partner,range)`. **UI:** journal entry form (config-CRUD + finance-specific line grid), post/reverse actions, ledger viewers. **Perms:** `finance:gl:{post,reverse,view}` + company/dim scopes. **Approvals:** policy hooks (e.g. manual JE over limit). **Audit:** post/reverse events + chain hashes. **Jobs:** nightly chain-verify + balance-cache rebuild. **Reports:** TB core service (UI R2.7). **KPIs:** unbalanced-attempt count 0 in prod.
- **Migration:** R10.1 imports opening balances per cut-date (O-2), not full history; historical `account_moves` archived read-only via adapter. **Back-compat:** legacy app keeps writing its own store until cutover; dual-post reconciliation report is the gate.
- **Prereqs:** R1.1–R1.4, R1.13, R0.3. **Downstream:** everything financial. **Sequence:** chart→doc+lines schema→balanced-post→reversal→numbering-chain→queries→bridge→UI. **∥:** GL lane (with R2.2–R2.4); stock lane independent. **Cx:** L. **Risks:** THE product risk — rounding/multi-currency edge cases (property tests + golden fixtures from real workshop data via adapter); performance of balance queries (indexed materialized balances rebuilt by repost).
- **Validation:** property-based balanced-posting tests; concurrency post storm keeps TB balanced; chain-verifier catches fixture tampering; golden-file comparison vs legacy P&L on sanitized copy. **Acceptance:** exit-gate items 1–2 + dual-post tolerance 0 on the sample set. **DoD:** finance engine handbook (Arabic summary for accountant users).

### R2.2 — Fiscal periods, locks & period close
- **Outcome:** books that close. **Donor:** ERPNext period closing + Odoo lock dates (clean-room). **Current:** absent.
- **Scope:** period states open→closed→locked (per company, per module-domain: stock lock date may differ from GL); posting guard wired into R1.3; close checklist doc (un-posted drafts, unreconciled payments, missing rates); closing entries generation (P&L→retained earnings); reopen = privileged + audited + approval policy. **Prereqs:** R2.1, R1.13. **Cx:** M. **Acceptance:** posting into locked period 409s with reason; close run generates correct closing entries on fixtures; reopen leaves audit trail.

### R2.3 — Tax engine: repartition, grids & withholding ⭐(Rev-2 upgrade)
- **Outcome:** declarative taxes that survive real regulation (VAT-ready, withholding-ready) — supersedes Rev-1's flat tax rows. **Donor:** **Odoo repartition lines + signed report grids** (`account_tax.py` — 06 §5, clean-room): one tax → N base/tax repartition legs, each to its own account + signed report tag; fiscal-position remapping (customer/region swaps tax X→Y, account A→B); ERPNext TDS thresholds/cumulative (02 — clean-room).
- **Scope:** `tax` (amount_type percent/fixed/group, price_include, scope sale/purchase), `tax_repartition_line` (base|tax, factor%, account, report grid, sign), `tax_group`, `fiscal_position` (+ tax-map, account-map rows), withholding categories (threshold, cumulative window, certificate fields); computation service (line-level, rounding policy per company: per-line vs per-doc); tax report = grid aggregation from posted lines. **Excludes:** e-invoicing transmission (deferred K24 §8); non-Iraq country content (packs, R2.8 framework + on-demand).
- **Invariants:** tax legs post through R2.1 (append-only); recomputation of a posted doc impossible (snapshot); grids reconcile to GL. **Prereqs:** R2.1. **Cx:** L. **Acceptance:** VAT 15% with 2-leg repartition posts to distinct accounts + grids; withholding auto-computes over threshold with cumulative logic; fiscal position remaps for an exempt customer; tax report totals = grid query = GL control accounts.

### R2.4 — Accounting dimensions (analytic distribution)
- **Outcome:** management accounting on every line without schema churn. **Donor:** **Odoo JSON `analytic_distribution`** (percentages per dimension-value, json-indexed — 06 §7, clean-room) chosen over ERPNext per-column dims (Rev-2 addendum decision); ERPNext dimension governance (required-per-account rules) retained.
- **Scope:** `dimension` (cost_center, project, branch… admin-definable) + `dimension_value` (tree); `dims` JSON on fiscal/stock lines `{dim_value_id: percent}` summing 100 per dimension; validation rules per account (required/blocked dims); dimension-scoped ACL read filters; analytic reports (P&L by dimension, cross-tab). **Prereqs:** R2.1 (+R1.5 patterns). **Cx:** M. **Acceptance:** posting without a required dim blocked; 60/40 cost-center split reports correctly; dimension P&L reconciles to full P&L.

### R2.5 — Immutable stock ledger & valuation engine
- **Outcome:** stock the accountant and the storekeeper both trust. **Problem:** production stock = JSON quantities, no valuation (Truth Audit §2). **Donor:** ERPNext SLE+bin cache+repost (02 — clean-room); Odoo quant/lot model, FIFO/FEFO `in_date`, category-level valuation config, plan-vs-physical move duality (08 — clean-room).
- **Scope:** `stock_move` (planned document: item, qty, uom, from/to location, state via R1.3) + append-only `stock_ledger_line` (posted movement: qty±, valuation_rate, value, batch/serial refs, posting_date, voucher ref); `bin` materialized cache (qty/value per item×location, rebuildable); valuation: **moving-average default + FIFO layer mode** (per item-category), negative-stock policy per warehouse (block|allow-flagged); `batch` (expiry) + `serial` masters with movement enforcement; inventory adjustment = counted-vs-system diff posting entries; landed-cost hook point (R3.6); GL integration: perpetual posting maps (stock/COGS/valuation accounts per category) posting through R2.1. **Excludes:** routes/rules & reordering (R3.4), picking/packing UX (R3.4), manufacturing consumption specifics (R3.5).
- **Invariants:** ledger append-only (corrections = counter-entries); bin always rebuildable to equality (verifier job); serials unique-active per location; expiry-blocked issue for expired batches (policy). **Prereqs:** R1.*, R1.13 warehouses, R2.1 (GL maps). **∥:** stock lane alongside R2.1–R2.4. **Cx:** L. **Risks:** valuation edge cases (returns at historic cost, backdated entries → repost tooling + golden fixtures). **Acceptance:** exit-gate valuation fixtures (moving-avg + FIFO with 2 receipts @ different costs then issue) match hand-math; negative-stock block fires; bin-verifier equality after 1k random moves; GL stock account = stock valuation report.

### T2.O10.1 — Connectivity and Cross-Platform Foundation Retrofit

**Position:** documentation checkpoint after the completed `T2.5.2` stock-to-GL checkpoint and before `T2.6.1`. It does not reopen R1 or invalidate completed R2 finance/stock work. It is documentation-authorized only after this correction pass is externally approved; no implementation occurs in this pass.

- **Dependencies:** R0 isolation closed; R1 closed at 19 PASS/0 PARTIAL/0 FAIL; O-2/R2 authorization; O-10; completed T2.1.1–T2.5.2; existing `manifest.json`, `service-worker.js`, and registration as reusable static-shell foundations.
- **Outcome/scope:** establish the minimum responsive cross-platform PWA baseline; explicit online/connecting/degraded/offline/syncing/conflict UI state; WebSocket or SSE server-event baseline; standard event envelope, cursor, reconnect, bounded replay, and permission-filtered subscriptions; polling only as degraded fallback; IndexedDB cache and durable outbox primitives; idempotent command envelope and conflict response contract; database-adapter interface; SQLite-local adapter contract; documented PostgreSQL-hosted adapter contract and portability boundary; scanner/report for SQLite-specific business-engine dependencies needing later adaptation.
- **Explicit exclusions:** offline finance posting, stock posting, approvals, identity/permission changes, payroll/timesheet/attendance writes, full POS offline sale, full shop-floor offline commit, PostgreSQL production deployment, and native mobile apps. These remain assigned to future releases.
- **Anticipated owned paths:** `vnext/server/events/`, `vnext/server/db-adapters/`, `vnext/client/connectivity/`, `vnext/client/offline/`, dedicated future migrations if required, and focused scripts/tests. These paths are not created by this correction pass.
- **Integration ownership:** the main integrator owns server bootstrap/event mount, shared shell wiring, migration ordering, `VNEXT_PROGRESS.md`, and cross-lane integration. A builder may own only its assigned path prefix and must provide `TASK.md`, `TEST.md`, and `INTEGRATION.md` before integration.
- **Migration rules:** no business schema or data migration is created by this documentation pass. A later implementation may add an idempotent, dependency-declared migration only in a reserved block after schema review; static cache/outbox versioning must support upgrade, purge, rollback, and tenant/company scope checks.
- **Focused tests:** two authenticated clients receive one permitted event without page reload; unauthorized tenant/company/user receives no event; disconnect/reconnect resumes from cursor without duplicate effects; degraded polling works only as fallback; PWA visibly reports state; IndexedDB outbox survives browser restart; same idempotency key plus same payload replays once; same key plus different payload returns conflict; prohibited sensitive offline commands fail closed; SQLite adapter contract passes; PostgreSQL adapter contract is represented and tested at interface level; completed R1/R2 business behavior shows no regression.
- **Security negatives:** no loopback trust; no unauthenticated event subscription; no cross-tenant/company event, cache, outbox, attachment, or cursor reuse; no client-only permission decision; no sensitive offline commit; no duplicate effect on replay; no raw secrets in cache, event payload, diagnostics, or support bundles.
- **Exit gate:** all focused tests green on disposable data; event envelope/cursor/reconnect/subscription review signed; adapter contracts and SQLite-specific dependency report linked; browser/PWA state and recovery UX evidenced; security negatives pass; migration/rollback notes complete; ledger row accepted by the integrator and external reviewer.
- **Stop condition:** stop after this gate. Do not start `T2.6.1` or implement any excluded offline/business behavior until the exit evidence is accepted and the owner/external review explicitly releases the next task.

### R2.6 — AR/AP documents, payments & reconciliation
- **Outcome:** invoice-to-cash and bill-to-pay on the immutable core. **Donor:** Odoo unified move reuse + payment/outstanding reconciliation concept (06); ERPNext Payment Entry multi-allocation + FIFO reconciliation + bank rules (02) — all clean-room; IDURAR derived-status discipline (concept).
- **Scope:** customer invoice/credit-note + vendor bill/refund as `fiscal_doc` move_types (R2.1) with line UX (products, taxes R2.3, dims R2.4, snapshots R1.5); `payment` (receive/pay, method, multi-invoice allocation) posting GL + updating **computed** `payment_state` (never hand-set); partial/over-payment + credit application; reconciliation workspace (match payments↔invoices FIFO/manual, cross-currency w/ FX diff posting); **bank statement import** (xlsx/CSV via R1.10) + `bank_match_rule` (description/amount patterns → partner/account auto-suggest); dunning-ready aging queries (letters R6.2). **Excludes:** payment-gateway integrations (R8.4/§8), check printing (§8).
- **Invariants:** payment_state derived from ledger facts; allocation cannot exceed open amount; reconciliation reversible only by documented un-reconcile (audited). **Prereqs:** R2.1–R2.4, R3.1 products (for line UX — coordinate: masters land early R3.1 or seed minimal product master here; **decision: minimal `product` master ships in R2.6**, full pricing in R3.1). **Cx:** L. **Acceptance:** invoice→partial payment→state `partial`→final payment→`paid` (all HTTP-level); statement of 20 lines auto-matches ≥ the rule-covered subset with zero false-positive on fixtures; FX invoice paid at later rate posts gain/loss correctly.

### R2.7 — Financial reporting suite
- **Outcome:** the statements a commercial buyer opens first. **Donor:** AureusERP report-pages structure w/ per-report export (MIT); numbers exclusively from R2.1 services. **Scope:** Trial Balance, P&L, Balance Sheet, Cash Flow (indirect), General Ledger, Partner Ledger, Aged AR/AP (buckets), Tax/grid report (R2.3), dimension P&L (R2.4); all: period pickers, comparison column, drill-down to documents, xlsx export, print templates; Arabic-first layouts. **Prereqs:** R2.1–R2.6. **Cx:** M. **Acceptance:** BS balances (A=L+E) on fixtures; every figure drills to its lines; aged buckets sum to partner-ledger open items; exports match on-screen values.

### R2.8 — Localization-pack framework + Iraq pack ⭐(new in Rev 3, K22)
- **Outcome:** country content as installable **data**, not code — the door from Iraqi product to regional product at near-zero marginal cost. **Donor:** Odoo l10n architecture: 217 packs = CSV/data templates (CoA, taxes, fiscal positions) + tiny `@template` hook, zero engine changes per country (06 §6 — clean-room).
- **Scope:** pack format (module per R1.12 containing: CoA tree data, tax+repartition definitions, fiscal positions, report-grid layout, document print defaults, terminology overrides); install/upgrade lifecycle (idempotent, versioned, no destructive re-install); **`l10n_iq` Iraq pack** as first implementation: current hardcoded Iraqi CoA/taxes/terms extracted into the pack (payroll rules stay FROZEN — explicitly out of pack scope); pack conformance test-kit (install→post fixture docs→verify grids). **Excludes:** any second country (on demand, §8); e-invoicing transports (K24 §8).
- **Invariants:** engine code contains zero country conditionals; packs never modify frozen zone. **Prereqs:** R2.1–R2.4, R1.12. **Cx:** M. **Acceptance:** fresh company + `l10n_iq` install → chart + taxes usable, fixture invoice posts with correct grids — with **no code path referencing "Iraq"** outside the pack; uninstall-blocked once transactions exist (guarded).

---

# RELEASE 3 — Core Trading, Manufacturing & Services
**Entry:** R2 exit. **Exit:** quote→order→delivery→invoice and RFQ→PO→receipt→bill each post correctly to **both** ledgers with 3-way match; a WO consumes components and produces finished goods at rolled cost; a project bills from timesheet cost lines; every flow carries chatter/approvals/audit/worklists. Lanes ∥ per module (sales / procurement / inventory / manufacturing / projects) once R3.1 masters land.

### R3.1 — Product & pricing core
- **Outcome:** one product master feeding every flow. **Donor:** Odoo product (variants via attributes, **dynamic variant creation** avoiding explosion, pricelists), ERPNext pricing_rule/promotional_scheme, both clean-room (07/02).
- **Scope:** product (goods/service, uom + conversions, category w/ valuation+GL maps, barcodes), attributes→variants (dynamic mode), price lists (dated, currency, qty breaks), **pricing-rule engine** (priority-ordered conditions item/category/partner/qty/date → price/discount%/fixed; explain-trace API), promotions (buy-X-get-Y, coupon codes) shared by sales/POS. **Excludes:** loyalty programs (R6.3), configurator UI (§8).
- **Prereqs:** R2.5 categories (valuation), R1.*. **Cx:** L. **Acceptance:** rule engine resolves documented precedence on 12-case fixture incl. tie-breaks; variant matrix creates only sold combinations; price explain-trace names the winning rule.

### R3.2 — Sales: quotation → order → delivery → invoice
- **Outcome:** the demand-side spine. **Donor:** Odoo sale states + `invoice_status`/upsell signal + quotation templates (07); ERPNext SO flows (02) — clean-room.
- **Scope:** quotation (templates, optional lines, validity, esign-request hook → existing esign module rebuilt on kernel), SO (state machine, price snapshots R1.5, margin from R2.5 cost), delivery orders (reserve→pick→post stock ledger; partials + backorders), invoicing policies (ordered vs delivered qty; down-payment invoice), returns (RMA → credit note + stock-in), computed `invoice_status`+`delivery_status` driving worklists (Orders-to-Invoice etc.), commissions (rule-based accrual → payable), customer credit limit check (block/warn per policy + approval override R1.9). **Excludes:** subscriptions (R6.2), portal (R6.4), forecasts (§8/R7.3).
- **Prereqs:** R3.1, R2.5, R2.6. **Cx:** L. **Acceptance:** E2E fixture: quote→confirm→partial delivery→backorder→invoice-from-delivered→return→credit note — each step posting correct ledger entries (asserted against golden GL/SLE fixtures); credit-limit breach requires approval; upsell worklist populates.

### R3.3 — Procurement: RFQ → PO → receipt → bill (3-way match)
- **Outcome:** controlled spend. **Donor:** Odoo purchase + requisitions (08), ERPNext RFQ-compare + supplier scorecard (02) — clean-room.
- **Scope:** purchase requisition (internal request → approval policy), RFQ multi-supplier + quote comparison sheet, PO (approval by amount, expected dates), goods receipt (posts stock ledger; over/short-receipt tolerances), vendor bill with **3-way match** (PO↔receipt↔bill qty/price tolerances; mismatch → block + approval), purchase returns, vendor price lists feeding replenishment cost, **supplier scorecard** (criteria/period auto-scoring: OTD, quality via R7.4 hooks, price variance). **Excludes:** vendor portal (R6.4), subcontracting purchase leg (R3.6).
- **Prereqs:** R3.1, R2.5/R2.6. **Cx:** L. **Acceptance:** 3-way mismatch beyond tolerance blocks posting with reason + approval path; scorecard computes on fixture history; requisition→PO chain preserves requester + audit.

### R3.4 — Inventory operations, routes & replenishment
- **Outcome:** warehouse operations of a real distributor. **Donor:** **Odoo `stock.rule` push/pull routes** (top Rev-2 SCM finding), putaway, reordering (08); ERPNext item_reorder + Aureus OrderPoint (MIT) — clean-room/MIT.
- **Scope:** operation types (receipt/delivery/internal/adjustment) over R2.5; **routes engine**: named routes = chains of push/pull rules (location-to-location, 1–3 steps: e.g. receive→QC→stock; pick→pack→ship), rule resolution by product/category/warehouse; reservations + pick lists; **reordering rules** (min/max per item×warehouse → replenishment suggestions worklist → draft PO/MO/transfer by route); putaway rules (category→location); cycle counting (scheduled count sheets → adjustment posting); barcode-friendly ops endpoints (scan-driven receive/pick — kiosk UI reuses R7.1 terminal shell). **Excludes:** full mobile barcode app parity (§8), demand forecasting (§8).
- **Prereqs:** R2.5, R3.1, R3.3 (PO drafts). **Cx:** L. **Acceptance:** 2-step receipt route generates the chained internal move automatically; reorder run on fixture stock produces correct suggestions incl. route choice; cycle count posts signed adjustments; reservation prevents double-pick.

### R3.5 — Manufacturing core: BOM → WO → job cards (+ workshop bridge)
- **Outcome:** production with real costing — and the existing workshop keeps working. **Donor:** ERPNext BOM/WO/job_card (02), Odoo BOM polymorphism (normal/phantom/subcontract) + work centers (08) — clean-room. **Current:** workshop chain on `omni.jobOrders` (FROZEN semantics — bridge, don't break).
- **Scope:** multi-level BOM (+phantom, scrap%, byproducts), routing (operations, work centers, expected times), Work Order (reserve/issue components → WIP, produce finished → stock @ rolled cost: materials + labor/overhead rates), **job cards** (operation-level: start/pause/finish, time logs, qty done/scrap — the shop-floor unit consumed by R7.1 terminals), plan-vs-actual cost report, **workshop jobOrders bridge**: adapter exposing legacy workshop orders as read-only VNext work-order views + migration map (workshop pack R9.2 completes the story). **Excludes:** MPS/capacity (R7.3), subcontracted ops (R3.6), OEE/Andon (R7.2), quality gates (R7.4 hooks stubbed).
- **Prereqs:** R3.1, R2.5, R3.4 (component reservation). **Cx:** L. **Acceptance:** 2-level BOM WO consumes correct components (phantom flattened), produces FG at hand-verifiable rolled cost; job-card time logs roll into WO actuals; legacy workshop order renders through the bridge untouched.

### R3.6 — Landed costs & subcontracting
- **Outcome:** true acquisition cost + outsourced operations. **Donor:** ERPNext landed_cost_voucher (02), Odoo subcontracting stack (08) — clean-room.
- **Scope:** landed-cost voucher (freight/customs/insurance allocated by value/qty/weight across receipt lines → valuation adjustment entries in R2.5); subcontracting: subcontract BOM type, supply-components-to-vendor moves, receive-finished flow, subcontract PO leg costing. **Prereqs:** R3.3–R3.5. **Cx:** M. **Acceptance:** landed allocation matches hand-math on mixed-basis fixture; subcontract receipt values FG = components + service cost.

### R3.7 — Projects, services, helpdesk & SLA
- **Outcome:** billable-work businesses served end-to-end. **Donor:** Odoo project (milestones/billing, personal kanban stages) + **timesheet-as-cost-line** insight (09 — project timesheets ARE analytic entries → instant profitability); ERPNext SLA engine + activity_cost (02) — clean-room. **Payroll timesheet remains FROZEN — these are project timesheets, a separate entity.**
- **Scope:** project/phase/task (kanban, dependencies, milestones), **project timesheet lines posting as dimension-tagged cost entries** (rate cards: cost + billing rate per activity/employee-grade), expense links, billing modes (fixed/milestone/T&M from unbilled cost lines → invoice), service contracts (covered hours/visits, renewal worklist), helpdesk tickets + **SLA policies** (business-hours calendars R1.13, response/resolution targets, pause-states, breach escalation → R1.8/R1.9), field-service work orders (mobile-friendly task view + parts consumption via R2.5). **Excludes:** appointment booking (R6.5), knowledge base rebuild (R5.1 config coverage).
- **Prereqs:** R2.4 dims, R2.6, R1.9/R1.8. **Cx:** L. **Acceptance:** T&M project bills exactly its approved unbilled cost lines; project P&L (dim-based) reconciles; SLA timer pauses on waiting-customer state and breach fires escalation on fixture clock.

---

# RELEASE 4 — Governance Rollout: approvals, workflow, security, collaboration, AI (∥ with late R3)
**Entry:** R1.9/R1.11 gates + first R3 modules landing. **Exit:** every R2/R3 document type has policy coverage; scope rollout verified module-by-module; AI tool registry live with zero ungoverned write paths.

### R4.1 — Approval policy & authority-limit rollout
Per-module policy packs (finance: JE/payment/reversal limits; procurement: PO bands, 3-way overrides; sales: credit/discount overrides; inventory: adjustments; HR-additive: leave/expense) seeded as data; maker≠checker defaults for finance; delegation registry onboarding. **Donor:** ERPNext authorization_rule, RuoYi center (MIT). **Prereqs:** R1.9 + target modules. **Cx:** M. **Acceptance:** policy matrix document ↔ automated test per policy row; no sensitive transition without a policy decision recorded.

### R4.2 — Workflow templates & worklist activation
Ship the standard automation library (lead routing, overdue-invoice reminders, reorder alerts, SLA warnings, WO-delay escalation…) as installable data; activate the full R1.7 worklist seed set now that entities exist. **Cx:** M. **Acceptance:** each shipped template passes its scenario test; worklist badges accurate under scoped users.

### R4.3 — Security hardening pass (row/field/menu coverage audit)
Systematic verification: scope predicates on every module's list/read/aggregate endpoints; field-mask coverage for sensitive fields (costs, salaries-adjacent, margins); menu/report gating; penetration checklist (IDOR probes per entity, mass-assignment, export leakage). **Cx:** M. **Acceptance:** automated coverage report = 100% routes gated; IDOR probe suite green; export respects masks (spot-verified per module).

### R4.4 — Collaboration & activity wiring everywhere
Chatter+followers+activities on all R2/R3 documents; tracked-field sets defined per entity; notification digests; record-header UX (status ribbon, next-activity chip). **Cx:** S–M. **Acceptance:** every document type shows thread + history; tracked changes auto-log verified per entity.

### R4.5 — AI operating layer on VNext (registered tools, previews, approvals)
- **Outcome:** Octagon's differentiator, ported safely: Omni/Jarvis drives VNext through governed tools only. **Current:** production's server-enforced tool gate + AI-key proxy is the strongest non-frozen asset (Truth Audit §4.3) — **preserve pattern, port, extend**.
- **Scope:** tool registry (name, JSON-schema args, risk class, required perm, precondition validator, preview renderer, idempotency key, compensating action); read tools (query/report/explain) unrestricted-by-role; write tools always classed → approval policy (R1.9) with human-readable preview; audit every call; copilot surfaces (record-context chat, NL report requests → report designer queries R5.3); voice/WhatsApp channels reuse R1.8 adapters; **kill-switch** (global + per-tool). **Determinism law applies (§0.5).**
- **Prereqs:** R1.9/R1.11, target modules. **Cx:** L. **Acceptance:** an AI-proposed payment runs the full preview→approval→execute→audit chain; a tampered/expired preview fails closed; kill-switch halts tools mid-flight; zero write path reachable outside the registry (scanner).

---

# RELEASE 5 — Configurability, Reporting & People (entry after R1; designer parts after R2)
**Exit:** an admin builds a new entity + screen + custom field + report + dashboard with no code; HR-additive suite live without touching frozen payroll.

### R5.1 — Config-CRUD coverage & entity studio
All rebuilt cross-vertical apps (appointments-lite, events, surveys, visitors, esign, knowledge, documents/DMS, budgeting…) recomposed as registry entities with module manifests (R1.12); **entity studio** UI: create collection, fields, states, menu, permissions from admin screens (writes registry via migrations). Feature-parity checklist per legacy tab (drives R10.5 sign-off). **Cx:** L. **Acceptance:** studio-created entity is indistinguishable (API/UI/ACL/audit) from seeded ones; parity checklist status page.
### R5.2 — Custom-field UX + formula fields
End-user field manager per entity (guarded by perm), formula/computed fields (sandboxed expressions, dependency-tracked), conditional visibility. **Cx:** M. **Acceptance:** formula field recomputes on dependency change; sandbox blocks IO/global access.
### R5.3 — Report designer & dashboards
Saved query builder (entity+joins-lite+filters+group+agg) → table/chart widgets; dashboard grids (per-user/shared/role-default); big-screen TV mode (dark, auto-refresh — replaces workshop TV hardcode); NL-report bridge from R4.5; export/print. **Donor:** RuoYi designers (MIT concept), NocoBase data-viz (clean-room). **Cx:** L. **Acceptance:** non-developer builds "sales by branch by month" dashboard; TV mode cycles; NL request produces an editable saved query.
### R5.4 — Template-print library & public forms
Print-template designer (visual placeholder insertion), template versioning per document; **public forms** (unauthenticated token URLs → create lead/ticket/survey response with rate-limit + captcha-lite + quarantine inbox). **Donor:** NocoBase (clean-room). **Cx:** M. **Acceptance:** public lead form → quarantined lead → promote; template edit doesn't affect archived prints (stored render snapshot).
### R5.5 — HR-additive suite (leave/ATS/skills/expenses — frozen-safe)
- **Scope:** Leave v2 (**accrual DSL**: milestones/caps/carryover; allocations; type approval matrix; mandatory days; balance API for payroll adapter to *read*), Recruitment ATS (per-job stages, interviewers, talent pools, refuse reasons), skills matrix (+résumé timeline pattern), expense claims (→ R2.6 reimbursement posting), employee self-service portal-lite (my leave/claims/payslip-view via adapter read-only), **`hr.version`-style dated employee-record versioning** for VNext HR fields only. **Frozen boundary:** nothing here writes attendance/payroll; leave approval outcomes surface to payroll only via the read adapter + explicit owner-approved export (O-3). **Donor:** Aureus time-off/recruitments (MIT), Odoo hr_holidays/hr.version/skills (09 — clean-room). **Cx:** L. **Acceptance:** accrual plan grants per DSL on simulated clock; ATS pipeline E2E; expense claim posts reimbursement JE; frozen-zone write-attempt test fails closed.

---

# RELEASE 6 — Revenue & Customer Experience
**Entry:** R2+R3.1/R3.2. **Exit:** POS session E2E offline-capable; subscription billing run + dunning; loyalty accrual/redemption across channels; portals live; WhatsApp flows on the new engines.

### R6.1 — POS v2 (sessions, offline, self-order)
Terminal profiles; session open/close with cash counting + Z-report reconciliation posting (R2.1/R2.5); **offline-first** (IndexedDB queue, replay-safe idempotent sync); combos/presets; QR **self-order** (restaurant pack hook); returns/refunds tied to original session. **Donor:** Odoo POS architecture (07 — clean-room), ERPNext pos_profile/opening-closing (02). **Cx:** L. **Acceptance:** network-cut sale syncs exactly-once on reconnect; session close variance report; Z-report GL postings match fixtures.
### R6.2 — Subscriptions & recurring billing + dunning
Plans (interval, proration, trial), subscription lifecycle (upgrade/downgrade mid-cycle prorated), billing run job → invoices (R2.6), MRR/churn KPIs, **dunning ladders** (aging-triggered letter sequence + interest option, via R1.10 print + R1.8 channels). **Donor:** ERPNext subscription/dunning (02 — clean-room; Odoo's is enterprise-absent). **Cx:** L. **Acceptance:** proration math golden tests; failed-payment path enters dunning at correct rungs; MRR report reconciles to posted invoices.
### R6.3 — Loyalty & membership engine (unified)
**One engine, multiple program types** (points-earn/redeem, buy-X-get-Y, coupon campaigns, gift cards, eWallet, tiers/levels with benefits) usable from POS + sales + portal; append-only points ledger; expiry policies. **Donor:** Odoo loyalty 8-type consolidation (07 — clean-room), RuoYi member levels/sign-in mechanics (MIT, optional). **Cx:** M–L. **Acceptance:** same program definition honored in POS and SO fixtures; ledger never edited (adjustments = entries); gift-card liability account reconciles.
### R6.4 — Customer & vendor portals
Portal identity (invited external users, portal role scope = own-partner rows only); customer: quotes-approve, invoices+pay-status, tickets, statements; vendor: RFQs-respond, POs-confirm, bills status. Public-form intake bridges (R5.4). **Donor:** Odoo portal (clean-room), Aureus dual-panel (MIT). **Cx:** L. **Acceptance:** portal user IDOR-proof (scope suite); quote approval by customer transitions the document with audit.
### R6.5 — Appointments & resource booking
Bookable resources (people/rooms/machines), availability from working calendars (R1.13), slot rules, public booking page (R5.4), reminders (R1.8), no-show handling; feeds clinic/salon-style packs. **Donor:** ERPNext appointment + Odoo calendar concepts (clean-room). **Cx:** M. **Acceptance:** double-booking prevented under concurrent booking test; reminder fires on fixture clock.
### R6.6 — eCommerce foundation
Product catalog site (from R3.1 data, Arabic/RTL themes), cart→checkout→SO+payment-intent hook, abandoned-cart worklist+automation, stock-visibility policy. Storefront CMS kept minimal (full builder deferred §8). **Donor:** Odoo website_sale architecture (07 — clean-room). **Cx:** L. **Acceptance:** guest checkout creates quarantined partner + confirmed SO fixture; abandoned cart triggers template automation.
### R6.7 — Omni-communications (WhatsApp-first)
Consolidate WhatsApp (preserved integration) + in-app + email under R1.8 with conversation threading on partner records; campaign sends (template + audience query + throttle); opt-out registry; A/B subject testing (auto-winner, from Odoo mass_mailing concept). **Cx:** M. **Acceptance:** campaign to 100-partner fixture respects opt-outs + throttle; replies thread onto partner chatter.

---

# RELEASE 7 — Industrial Operations (MES)
**Entry:** R3.5. **Exit:** shop-floor terminal runs a full order day; OEE/downtime/Andon reporting from real event streams; quality gates block bad material; maintenance prevents repeat failures.

### R7.1 — Shop-floor execution terminals
Kiosk/tablet UI over job cards (R3.5): operator login (badge/PIN), start/pause/finish, qty+scrap entry, material scan-issue, drawing/SOP display (documents), offline-tolerant queue; TV dashboard (R5.3 big-screen) for floor status. Reuses existing kiosk/TV surfaces re-pointed at VNext APIs. **Cx:** M–L. **Acceptance:** operator completes an operation offline→sync; supervisor sees live WIP.
### R7.2 — OEE, downtime & Andon
Downtime entries (reason tree, planned/unplanned) from terminals; availability×performance×quality OEE per work center/shift; **Andon call** (operator raise → escalating notifications → resolution log, response-time KPIs). **Donor:** RuoYi MES (MIT), Odoo CE OEE basics (08). **Cx:** M. **Acceptance:** OEE math golden fixtures; Andon escalation ladder fires on unacknowledged call.
### R7.3 — Production planning & capacity (MPS-lite)
Demand consolidation (SOs + forecast rows) → master schedule proposals → planned WOs/POs (respecting BOM lead times, work-center capacity buckets); what-if view; freeze horizon. **Donor:** ERPNext production_plan (02 — Odoo MPS enterprise-absent). **Cx:** L. **Acceptance:** plan run on fixture demand produces hand-verifiable proposals; capacity overload flagged.
### R7.4 — Quality: inspections, NCR & CAPA
Inspection plans/templates (parameters, sampling) triggered at receipt/WO-op/pre-delivery (hook points from R3.3–R3.5); pass/fail → quarantine location moves; nonconformance records → CAPA workflow (containment/root-cause/actions/verification); supplier-quality feed to scorecard (R3.3); defect library + Pareto. **Donor:** ERPNext quality (02 — Odoo quality enterprise-absent). **Cx:** L. **Acceptance:** failed receipt inspection quarantines stock (cannot be issued); CAPA lifecycle E2E; scorecard reflects the NCR.
### R7.5 — Maintenance & asset lifecycle v2
Asset register unified (finance assets R2.x-depreciation + physical equipment): **depreciation schedules** (SL/DD/manual, per-book) posting monthly JEs; preventive maintenance (calendar+meter triggers → maintenance WOs), corrective requests (from Andon/terminals), spare-parts consumption (R2.5), failure history/MTBF, warranty tracking. **Donor:** ERPNext asset+maintenance (02 — clean-room; Odoo asset enterprise-absent). **Cx:** L. **Acceptance:** depreciation run posts correct schedule JEs; meter-based PM triggers at threshold; failure history feeds MTBF report.

---

# RELEASE 8 — Enterprise, SaaS & Integration
**Entry:** kernel + R2; R8.3/R8.4 may start earlier ∥. **Exit:** two tenants provably isolated; editions gate modules server-side; trial→activation flow; webhook+API surface documented; one-build deployment modes verified.

### R8.1 — Multi-company operations & consolidation
Inter-company transactions (mirrored documents with elimination tags), consolidated TB/BS/P&L (currency-translated, elimination entries), cross-company sharing rules (explicit allow-lists). **Prereq:** R1.13 lived-in through R2/R3. **Cx:** L. **Acceptance:** intercompany sale creates mirrored purchase; consolidation eliminates it; translated consolidation balances on fixtures.
### R8.2 — Tenancy, editions, licensing & entitlements
Tenant layer above companies (SaaS mode): per-tenant DB file (chosen isolation model — O-4 confirms) + tenant registry/supervisor; **edition/entitlement engine** (license file: edition, modules, seats, expiry, signature; offline activation + grace read-only mode); module gating server-side (unlicensed routes 403 + nav absent); trial provisioning with sample data; usage/seat reporting (local, no phone-home unless opted — telemetry stays off by default). **Donor:** RuoYi tenant packages (MIT concept), Clone-Plan isolation discipline. **Cx:** L. **Acceptance:** tenant A cannot reach tenant B by any route (suite); expired license → read-only grace then lock, data exportable; entitlement flip enables a module without redeploy.
### R8.3 — SSO & advanced identity
OIDC (generic + Google/Microsoft), optional SAML; passkeys/WebAuthn; SCIM-lite user sync (CSV/API); org-level 2FA enforcement policies. **Donor:** Odoo/NocoBase auth stacks (clean-room). **Cx:** M–L. **Acceptance:** OIDC login E2E against a test IdP; passkey register+login; forced-2FA role cannot skip enrollment.
### R8.4 — Integration hub: APIs, webhooks, connectors
Published REST API docs (generated from registry), scoped API keys (R1.14) + rate limits + idempotency keys on writes; outbound **webhooks** (event subscriptions, signed payloads, retry/backoff, dead-letter worklist); credential vault (encrypted at rest) for connector secrets; first connectors: WhatsApp (existing), SMTP, bank-statement fetch (file/IMAP), generic HTTP; import-center scheduling. **Donor:** RuoYi protection starters (MIT concepts), NocoBase data-source ideas (clean-room, LATER for external-DB collections). **Cx:** L. **Acceptance:** webhook delivery signed+retried onto a flaky sink fixture; API-key scope enforcement suite; vault secrets never appear in logs/exports (scanner).
### R8.5 — Deployment, upgrades & supportability
One build → four modes (single-box Windows installer w/ bundled Node; LAN server; private server; hosted SaaS) differing by config only; upgrade runner (backup→migrate→verify→rollback-on-fail); diagnostics page (health, integrity checks: bin-verifier, GL chain-verify, route-coverage); **support bundle** export (logs+config+versions, secrets/PII-scrubbed); release channels (stable/pilot); auto-backup policy + restore drill runbook. **Cx:** L. **Acceptance:** scripted upgrade of a seeded install succeeds and a sabotaged migration auto-rolls back; support bundle passes secret-scanner; installer smoke on clean Windows VM.

---

# RELEASE 9 — Extensibility & Industry Packs
**Entry:** R1.12 + two stable module trains (post-R3). **Exit:** two packs install/uninstall cleanly; pack conformance kit green; no core forks.

### R9.1 — Pack SDK & conformance kit
Pack template (manifest, migrations, registry patches, seed data, terminology bundle, workflows, print templates, dashboards, permission pack), developer docs (Arabic+English), conformance tests (install/uninstall residue-zero, patch-conflict report, entitlement gating). **Cx:** M. **Acceptance:** `create-pack` scaffold → passing conformance in <1 day of work.
### R9.2 — Workshop & advertising-production pack (first pack, flagship)
The existing business as a pack: job-order chain (bridged then migrated per O-3 timing), design/proofing states, material-per-job costing (R3.5+R2.5), workshop pricing templates, frontline/TV/kiosk configs (R7.1), WhatsApp order-status flows; validates that Octagon-the-product can host Octagon-the-workshop. **Cx:** L. **Acceptance:** pilot workshop scenarios (from real history via adapter fixtures) run E2E in a fresh tenant with only core+pack installed.
### R9.3 — Vertical packs wave
Retail/POS pack (multi-store, shift configs, barcode ops), pharmacy (batch/expiry-critical flows, controlled-log), clinic (patients/encounters/appointments+billing), restaurant (floor/kitchen/self-order), real-estate & rental (contracts, recurring billing), fleet (vehicles/trips/maintenance links), contracting (BOQ, progress billing, retention), education (courses/cohorts/fees). Prioritization = owner O-5 by market demand; each = R9.1 conformance. **Cx:** M each. **Acceptance:** per-pack scenario suite + no-core-change proof (diff scan).
### R9.4 — Marketplace & pack distribution — **COMPLETE 2026-07-20**
Signed pack format (hash+signature verified at install), local pack manager UI, version-compatibility matrix enforcement, paid-pack entitlement hooks (R8.2). **Cx:** M. **Acceptance:** tampered pack refused; incompatible-version install blocked with clear message.
Delivered: `.octapack` signed format (Ed25519 over a canonicalized manifest+file-inventory+checksums+compat payload — a changed byte anywhere invalidates the signature), company-scoped trusted signer registry (`shop_marketplace_signer`), fail-closed ingestion (path traversal/absolute/duplicate-path/oversized/malformed-JSON/checksum-mismatch/missing-or-undeclared-file, declarative-only file types — no code ever executes from a pack), a full compatibility+entitlement matrix (platform/SDK version range, dependencies, conflicts, edition, paid/trial entitlement via R8.2 licensing-engine reuse), a catalog/lifecycle domain (`shop_marketplace_pack`, migration 907) with install/upgrade/disable/enable/uninstall calling straight into the canonical Pack SDK engine (an additive `upgradePack` export, not a duplicate engine), and a Pack Manager UI registered into the existing `r3-ui.js` kernel. Focused suite `scripts/test-r9-marketplace-distribution.mjs`: **39/39 PASS**, including the real R9.2/R9.3 manifests installing and uninstalling cleanly through the signed package path. **R9 core release gate (Pack SDK + Workshop + Retail/POS + Marketplace) is now PASSED** — this does not include the remaining R9.3 vertical packs (pharmacy, clinic, restaurant, real-estate, fleet, contracting, education), which stay unstarted, explicit future/optional work.

---

# RELEASE 10 — Migration, Pilot, Security, Performance & Commercial Release
**Entry:** R2/R3 + R4 hardened + R8.5 deployment. **Exit = GA:** Commercialization Plan §9 checklist all green, owner sign-off O-7.

### R10.1 — Data migration execution
Per Clone-Plan §5: masters backfill via adapters (partners/products/accounts/employees-readonly), **opening balances** (GL per cut-date O-2; stock counted quantities+values; open invoices/POs as documents), idempotent+resumable migration jobs with per-collection reconciliation reports; **two-worlds rule**: JSON `collections` = source of truth, W0 `x_*` demo data explicitly discarded (documented). **Acceptance:** migrated TB = legacy TB at cut date (tolerance 0); stock valuation matches count sheet; every migrated record traceable to its source id.
### R10.2 — Frozen payroll compatibility validation
Golden-month replay: adapter-fed payroll figures byte-identical to legacy self-test fixtures; timesheet UI embedded (read-only against legacy store until owner O-3 decides otherwise); attendance flows untouched; sign-off artifact for the owner. **Acceptance:** zero delta on 3 historical months incl. the known edge cases (Friday-OT, advances, month-end bonus).
### R10.3 — Pilot (dual-run)
Workshop tenant runs VNext ∥ production for one full cycle (a payroll month + a finance close): daily reconciliation deltas logged; user task-completion checklist; defect triage with stop-the-line rules for integrity bugs. **Acceptance:** pilot exit criteria (Commercialization §9.8) met; owner reviews the reconciliation ledger.
### R10.4 — Security audit & performance validation
External-style security pass (authz suites re-run, injection/IDOR/mass-assignment/upload handling, secret scanning, AI-gate abuse cases); performance budgets: boot <2s, section switch <1.5s, 10k-row lists <150ms, posting P95 <300ms on reference hardware; load test (20 concurrent users on LAN profile); fix-and-retest loop. **Acceptance:** zero critical/high findings open; budgets met on the pilot dataset.
### R10.5 — Onboarding, docs & parity sign-off
Setup wizard (company, fiscal calendar, CoA via l10n_iq, roles, opening balances, sample-data toggle); Arabic user guide per module + admin guide; **legacy-parity checklist** (from R5.1) fully green or consciously waived per item by owner; branding/white-label config; edition packaging final. **Acceptance:** a fresh non-technical install reaches first posted invoice in <1 hour following the wizard+guide.
### R10.6 — GA release
Release notes; support/upgrade policy published; backup+restore drill on the GA build; version tag + `THIRD_PARTY_NOTICES` final review; owner go/no-go O-7. **Acceptance:** Commercialization §9 items 1–10 all checked with evidence links.

---

## 8. Deferred & excluded register (from Coverage Cross-Check — with triggers)
**Deferred (LATER):** e-invoicing transports UBL/Peppol (trigger: Iraqi mandate or export-customer demand — K24); full website-builder CMS; inbound email gateway + IMAP client; advanced realtime event features beyond the R1/R8 event-layer baseline; parallel approval branches + BPMN canvas; barcode-app full parity; carrier connectors; demand forecasting/AI planning; seckill/bargain/distribution social commerce; IM chat; IoT depth; non-Iraq localization packs (per sale); external-DB data-source collections; payment gateways (per market need); check printing; product configurator UI; wallet subsystem; deferred revenue/accruals automation. PostgreSQL portability is an architecture baseline, not a deferred feature.
**Excluded (with reason):** GPL/AGPL/OEEL/unresolved-NocoBase code copies (license law); WeChat/China-market surfaces (market); Odoo IAP credits (business model); Odoo web client/OWL/QWeb + Filament + Formily runtimes (stack mismatch — concepts only); RuoYi simple-ERP module (superseded by deeper donors); lunch/homeworking-style internal perks (scope); Plaid (US-only).

## 9. Ten highest-risk dependencies (watch list)
1. **R2.1 GL correctness** (rounding/multi-currency/reversal edge cases) — everything commercial sits on it.
2. **R1.2 scope-predicate correctness** across joins/aggregates — a leak is unsellable; mitigated by the permanent authz test-suite.
3. **R0.3/R10.2 frozen-payroll fidelity** — one byte of drift destroys owner trust; golden-month replay is the only acceptable proof.
4. **R10.1 two-worlds migration** (JSON collections vs relational) — reconciliation reports are the gate, not optimism.
5. **R2.5 valuation math** under backdating/returns — repost tooling + golden fixtures mandatory.
6. **R1.12 extension-patch determinism** — packs colliding on core keys; conflict reporter + shallow patch surface.
7. **R1.11 workflow loop/rate control** — automation storms can corrupt trust in the platform; caps + kill-switch.
8. **R8.2 tenant isolation model** (O-4) — late change re-touches every table; decide before R8 starts, design assumed per-tenant-DB.
9. **R6.1 POS offline idempotency** — double-posted sales are a showstopper; exactly-once replay suite.
10. **Solo-maintainer bus-factor + no-formal-CI history** — mitigated by the test-first gates in every epic and `VNEXT_PROGRESS.md` discipline.

## 10. Owner decision queue (unresolved — never invented by agents)
- **O-1** Approve R0 fork execution (backups verified first).
- **O-2** Finance reconciliation model + migration cut-date (full-history vs opening-balances — roadmap assumes opening-balances).
- **O-3** Frozen-zone boundary evolutions: leave-balance export to payroll; workshop jobOrders migration timing (R9.2); the O11 mojibake in `employees` (production plan item) stays owner-only.
- **O-4** Tenant isolation model for SaaS (assumed per-tenant DB file; confirm before R8.2).
- **O-5** Industry-pack priority order (R9.3) by market demand.
- **O-6** NocoBase license reconciliation with vendor (until then: clean-room only).
- **O-7** GA go/no-go at R10.6.
- **O-8** First-release deployment modes — the earlier single-box + LAN recommendation is superseded by binding O-10; hosted/private/LAN/local-server are supported modes, sequenced by the connectivity architecture and release gates.
- **O-9** Edition boundaries final pricing/packaging (Blueprint §3 is the working assumption).
- **O-10** Online-first, real-time, cross-platform, PWA product identity with selective offline resilience and a server-authoritative connectivity contract (decided 2026-07-18; see `OWNER_DECISIONS.md`).

## 11. Rev-3 changelog (vs archived Rev 1)
**Preserved:** the R0→R10 train concept and order; all Rev-1 epics (every one maps into Rev 3 — none dropped); exit-gate discipline; parallelization lanes; owner-gate items; deferred/excluded register concept; kernel-before-modules principle.
**Changed:** every epic rewritten to the full 29-field template; org/fiscal structures moved R8→R1.13 (company_id from day one); auth hardening added at R1.14 (Q2 bypass elimination made explicit); R2 expanded from 5→8 epics (tax engine ⭐, dimensions-as-JSON ⭐, localization framework ⭐); GL design re-based on Odoo's unified fiscal-document + gapless hashed chains; stock design adds routes/rules (R3.4) and FIFO layers; loyalty/POS/leave/project-billing re-based on Rev-2 findings; extension framework (R1.12 ⭐) added as the pack foundation; R0.4 database/migration architecture added; AI governance given its own epic (R4.5) porting the preserved production pattern; HR-additive consolidated at R5.5 with explicit frozen-boundary tests; deferred/excluded register rebuilt from the Coverage Cross-Check with triggers; risk list re-ranked with Truth-Audit evidence.
**New engines/releases added:** localization-pack engine (R2.8), extension/module framework (R1.12), migration architecture (R0.4), repartition tax engine (R2.3), routes engine (R3.4), entity studio (R5.1), conformance-kit pack SDK (R9.1).

## 12. Final-validation mapping (the 12 checks → where satisfied)
1 Octagon modules all dispositioned → §1.1. 2 Donor capabilities all decided → §1.2 + Cross-Check. 3 Rev-2 findings folded → §11 + ⭐ epics. 4 Entry/exit gates → every release header. 5 Engines precede modules → §2 spine. 6 Finance/stock integrity explicit → R2.1/R2.5 invariants + gates. 7 Migration/back-compat → R0.3/R0.4, per-epic Migration fields, R10.1–R10.3. 8 Licensing documented → §0.4 + forensic §0 + R0.2. 9 Task detail sufficiency → Execution Plan (authority 8) with R0–R2 fully decomposed. 10 One canonical roadmap → this file (Rev 1 archived). 11 Owner decisions separated → §10. 12 Cross-document contradiction check → independent validation agent report (see Execution Plan appendix note).

*End of canonical roadmap. Authority 7. Execution detail → `OCTAGON_VNEXT_EXECUTION_PLAN.md`. The actual next authorized task is the completion of the remaining R9.3 industry-specific vertical packs (pharmacy, clinic, restaurant, etc.) or Release 10 migration and validation.*
