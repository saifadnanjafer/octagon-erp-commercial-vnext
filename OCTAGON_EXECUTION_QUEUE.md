# Octagon ERP Execution Queue

> **Legacy/current production-track document.** This copied root queue is non-authoritative for Commercial VNext. Use `../octagon-analysis/OCTAGON_VNEXT_MASTER_ROADMAP.md` and `../octagon-analysis/OCTAGON_VNEXT_EXECUTION_PLAN.md`.

## Current Baseline

Last verified commit (pre-8A):
`2547a0b complete 7j/7l page registration: PAGE_METADATA + doc baseline 87->93`

Current protected route baseline:
- public nav pages: 93
- public view markers: 93
- counted routed view files: 93
- total view files: 95
- internal route-less views:
  - manager_approvals
  - mobile_inventory_count

Current validation baseline:
- permission regression: 35/35
- database parse: PASS
- route health: PASS (live `/api/release/status` route = 93/93/93, 0 duplicates/missing/orphans)
- PAGE_METADATA coverage: 93/93 (closed the last 10 gaps in Phase 8A)
- PAGE_PERMISSIONS coverage: 93/93
- backup verify: PASS only against a FRESH `/api/backup` (SQLite-sourced); stale legacy `database.backup.auto.*.json` mirrors fail verify by design
- git status: clean at last report

Important:
Do not increase public page count unless the phase explicitly requires it and Saif approves.

---

## Execution Rules

- Execute only one phase per `كمل` unless Saif explicitly asks for multiple.
- Never use `git add .`.
- Do not push.
- Do not reset/revert without explicit Saif approval.
- Do not mutate `database.json` directly.
- Do not run destructive restore.
- Do not add random sidebar pages.
- Prefer existing pages, sub-tabs, panels, services, reports, and PWA/internal views.
- Preserve Arabic-first UI.
- Preserve local-first behavior.
- Preserve AI-first, not AI-only behavior.
- AI/Jarvis must never directly execute high-risk finance, payroll, stock, security, legal, or QC actions.
- High-risk actions must go through approvals and audit.

---

## Stop Conditions

Stop immediately and report if any of these happen:

- `database.json` parse fails
- permission regression fails
- route health drops below protected baseline
- public view count changes unexpectedly
- service worker caches `/api/*`, `/api/db`, `/api/auth`, or `database.json`
- AI/Jarvis can approve or execute high-risk writes
- a stock/finance/payroll write bypasses approval or audit
- Git status contains unexpected runtime/database/backup files
- a phase requires destructive migration
- browser smoke shows fatal app load errors

---

## Standard Baseline Check Before Every Phase

Run:

```bash
git status --short
git log --oneline --decorate --graph --max-count=10
node --check app.js
node --check server.js
node --check services/permissionService.js
node --check services/auditService.js
node --check services/stateService.js
node --check services/tenantService.js
node --check modules/route-health.js
node --check modules/phase7a-stabilization.js
node scripts/permission-regression.mjs
node -e "JSON.parse(require('fs').readFileSync('database.json','utf8')); console.log('database.json parse: PASS')"
```

Also check if server is running:

```bash
node -e "fetch('http://localhost:8080/api/release/status').then(r=>r.json()).then(j=>console.log(JSON.stringify(j.route||j,null,2))).catch(e=>console.error(e.message))"
node -e "fetch('http://localhost:8080/api/backup/verify').then(r=>r.json()).then(j=>console.log(JSON.stringify(j,null,2))).catch(e=>console.error(e.message))"
```

If 8080 is unavailable and the app uses a fallback port, report it clearly.

---

## Phase Queue

### Phase 7A — Stabilize Product Core

Status: DONE
Commit: `9f7d145`

Scope:
* server auth/session foundation
* audit panels
* backup verify endpoint
* release readiness endpoint
* period lock foundation
* data quality expansion

Notes:
* Completed before the early Phase 7C work.

---

### Phase 7C-Early — Mobile / PWA Suite

Status: DONE_EARLY
Commit: `3ac49d5`

Scope:
* PWA manifest
* service worker
* manager approvals internal view
* mobile inventory count internal view
* employee/frontline mobile updates
* mobile approval flow

Notes:
* Built early before Phase 7B.
* Accepted only after cleanup commit.

---

### Phase 7C-Cleanup — Route/PWA/Inventory Safety

Status: DONE
Commit: `44f93f5`

Scope:
* internal route-less views excluded from counted routed view baseline
* localhost service worker bypass
* Octagon cache cleanup
* inventory count canonical location safety
* stock sync between `warehouseStock` and `locationStock`
* stock drift data quality warnings

Notes:
* This phase made the early Mobile/PWA work safe enough to keep.
* Do not expand Mobile/PWA further until Phase 7B is complete.

---

### Phase 7B — Production Safety Closure

Status: DONE
Commit: `d5cf44c`

Scope:
1. Remote Git readiness/status
2. API session enforcement matrix
3. Server/port diagnostics
4. Auth user/role cleanup
5. Backup restore dry-run
6. Data quality production blockers
7. Browser smoke recovery
8. Documentation/handover update

Acceptance:
* Git remote status is visible in release readiness.
* API endpoints are classified:
  * public
  * session required
  * admin required
  * webhook-special
  * diagnostic
  * dangerous/destructive
* Sensitive write APIs are not anonymously writable.
* `/api/db POST` is protected or explicitly local-dev/admin gated.
* `/api/auth/session` leaks no secrets.
* `/api/release/status` leaks no secrets.
* `/api/backup/verify` is safe and non-destructive.
* Restore remains dry-run only unless explicit typed confirmation and pre-restore backup exist.
* Server status shows:
  * port
  * fallback port usage
  * uptime
  * root path
  * database path
  * node version
* Data Quality shows production blockers with:
  * severity
  * affected count
  * sample records
  * recommendation
  * owner role
* Browser smoke is attempted honestly.
* Route baseline remains:
  * public nav: 86
  * public markers: 86
  * counted routed views: 86
  * total view files: 88
  * internal route-less views: 2
* Permission regression remains 35/35 or better.
* Commit after success:
  `phase7b close production safety gaps`

Do not build:
* Report Designer
* Agent Catalog
* Marketplace
* SaaS billing
* E-commerce connectors
* new public pages

---

### Phase 7D — Report Designer and Smart Views

Status: DONE
Priority: P1
Blocked by: None
Commit: `6499528`

Goal:
Build the first commercial ERP feature expansion after safety closure.

Scope:
* report builder
* saved filters
* smart views
* role-based report access
* printable Arabic layouts
* Excel/PDF export if existing export patterns support it
* report scheduler placeholder only if safe
* AI natural-language report drafting without direct data mutation

Implementation rule:
Use existing `nl_reports`, analytics, and reporting surfaces where possible. Do not add duplicate reporting pages unless justified.

Acceptance:
* no route baseline break: PASS, release route status remains 86 public nav / 86 markers / 86 counted view files / 88 total view files.
* report definitions are saved safely: PASS, definitions persist only under `omni.nlReports.definitions`, with role groups, selected columns, smart-view metadata, and disabled scheduler metadata.
* AI only drafts/explains reports: PASS, "مسودة AI" only drafts a definition title from the current report intent; it does not mutate finance, payroll, stock, or report data.
* exports are safe and audited if needed: PASS, CSV/JSON/Excel/print are client-side exports; saved definitions/snapshots record history events when history is available.
* browser smoke: LIMITED, static checks passed and a temporary smoke server was launched on port 8093 with a copied DB; the in-app browser could not complete authenticated navigation without first-time password setup, so live interaction was not used to mutate the real database.

Commit:
`phase7d report designer and smart views`

---

### Phase 7D-FleetDemo - Fleet Fuel Guard Presentation Foundation

Status: DONE
Priority: P0-CUSTOMER-DEMO
Blocked by: None

Automatic rule:
After the current active phase completes, this Fleet Demo phase may be executed before broad later expansion, because it is a real customer demo opportunity.

Goal:
Create a strong ERP demo/presentation foundation for controlling a fleet, tracking fuel usage, detecting possible diesel/kaz theft, applying speed limits by geographic zones, and showing all vehicles/equipment under control from one dashboard.

Scope:
* Fleet Command Map using a local mock map/grid if no map SDK exists.
* Vehicle / Equipment Register with fuel, driver/operator, device, sensor, department, project, and site placeholders.
* Geographic Zones / Geofences for workshop, project site, city road, highway, restricted area, fuel station, and depot rules.
* Speed Limit Policies By Geographic Zone, deterministic first, with AI explanation only.
* Fuel Ledger for refill, consumption, suspicious drop, correction, sensor, and dispensing events.
* Fuel Theft / Anomaly Detection Center for diesel/kaz loss, refill mismatch, geofence/time violations, sensor disconnects, GPS blackout, high consumption, and repeated patterns.
* Fleet/Fuel Control Dashboard for fleet counts, device status, suspicious loss, risk rankings, speed violations, idle cost, and open investigations.
* Full vehicle/equipment history file covering trips, assignments, geofence events, speed events, fuel readings, refill records, anomalies, investigations, oil changes, service logs, inspections, approvals, and attachments.
* Detailed trip operations history with planned vs actual route, odometer/hour-meter start/end, fuel start/end, idle time, max/average speed, zones crossed, and trip-level anomalies.
* Detailed fueling and fuel-measurement records with tank before/after, dispensed liters, measured increase, variance, unit price, odometer/hour-meter, reading confidence, and receipt/photo placeholders.
* Oil-change, service, and inspection tracking for vehicles and heavy equipment, including next service by date/km/hour and failed-inspection escalation.
* Investigation / Approval Flow for refill confirmation, fuel corrections, anomaly dismissal, theft suspicion marking, task assignment, and audited notes.
* Customer Demo Reports for consumption, variance, suspected theft, speed violations, idle waste, efficiency, and monthly reconciliation.
* AI / Jarvis boundaries: AI may explain, summarize, rank, draft notes, recommend checks, prepare reports, and compare actual vs expected behavior; AI cannot approve, dismiss, mutate ledgers, edit capacities, modify sensor readings, delete evidence, or approve its own recommendation.

Implementation result:
* implemented inside the existing `fleet` page only
* added a Fleet/Fuel Guard tab with local mock command map/grid
* added zone speed-limit policy table and deterministic anomaly explanations
* added fuel measurement ledger with before/after tank, dispensed liters, measured liters, variance, confidence, and station/source
* added trip history with planned/actual distance, odometer start/end, fuel start/end, idle minutes, and max speed
* added oil-change, service, and inspection tracking presentation rows
* added full vehicle/equipment history cards combining driver/project, trip, fuel, service, and risk status
* no sidebar page added
* no route baseline change
* no `database.json` migration or hardware integration

Out of scope now:
* hardware integration
* vendor-specific promises
* new sidebar pages
* route count changes
* `database.json` mutation

Planning spec:
`docs/FLEET_FUEL_GUARD_VERTICAL.md`

Commit:
`phase7d fleet fuel guard presentation foundation`

---

### Phase 7E — SaaS Productization Foundation

Status: DONE
Priority: P1
Blocked by: None

Goal:
Prepare Octagon as a sellable product.

Scope:
* feature flags
* plan/tier placeholders
* demo company mode
* setup wizard foundation
* tenant onboarding checklist
* license/activation status placeholder
* no real payment gateway yet

Implementation result:
* implemented inside existing `admin_panel` only
* added Productization tab to Admin Panel
* added plan/tier placeholders and trial-days field
* added feature flags for reporting, Fleet/Fuel Guard demo, mobile approvals, AI governance, setup wizard, and future hardware integrations
* added demo company mode toggle with no database seeding
* added setup wizard readiness checklist
* added tenant onboarding checklist
* added local license/activation placeholders
* no payment gateway integrated
* no sidebar page added
* no route baseline change

Commit:
`phase7e saas productization foundation`

---

### Phase 7F — Agent Catalog Foundation

Status: DONE
Priority: P2
Blocked by: None

Goal:
Turn Jarvis from general assistant into governed business agents.

Scope:
* agent registry
* allowed tools
* blocked tools
* dry-run mode
* human approval checkpoint
* agent audit logs
* no direct high-risk execution

Initial agents:
* Report Builder Agent
* Executive Briefing Agent
* Inventory Reorder Agent
* Bank Reconciliation Agent
* Workshop Scheduling Agent
* QC/Rework Agent
* Contract Drafting Agent
* HR Leave Agent

Implementation result:
* added `omni.aiAgents.catalog` foundation inside AI Governance
* seeded 8 governed business agents from the phase scope
* each agent has purpose, domain, risk, allowed tools, blocked tools, approval triggers, data sources, and output format
* added dry-run preview API and simulation log under `omni.aiAgents.simulations`
* added agent approval mirror under `omni.aiAgents.approvals`
* high-risk agent proposals route to the existing AI approval queue instead of direct execution
* added Agent Catalog Foundation panel inside the existing `ai_status` page
* no new sidebar page added
* no direct finance/payroll/stock/security/legal/QC execution added

Commit:
`phase7f agent catalog foundation`

---

### Phase 7G — HRMS Completion

Status: DONE
Priority: P1/P2

Goal:
Upgrade HR from payroll/attendance to HRMS.

Scope:
* contracts lifecycle
* org chart
* onboarding/offboarding
* leave impact
* custody/assets
* disciplinary actions
* performance reviews
* workforce planning
* skills matrix
* final settlement

Implementation result:
* added HRMS Lifecycle tab inside existing `people_ops`
* added `omni.peopleOps.hrms` roots for contracts, onboarding, offboarding, custody, discipline, performance, workforce planning, skills, and final settlement
* added org chart snapshot from existing employee department/title/manager fields
* added leave-impact preview counters without payroll or attendance mutation
* added lifecycle readiness matrix and contract lifecycle table
* extended `report_hr_today` Jarvis report with HRMS counters
* no new sidebar page added
* no direct payroll, attendance, deduction, hiring, or legal approval execution added

Commit:
`phase7g hrms completion foundation`

---

### Phase 7H — Finance Close and Planning

Status: DONE
Priority: P1/P2

Goal:
Enterprise-grade finance controls.

Scope:
* month-end close checklist
* period lock UI hardening
* financial statements polish
* AR/AP aging
* cash flow forecast
* budget vs actual
* audit export
* consolidation placeholder

Implementation result:
* added Phase 7H Finance Close and Planning panel inside existing finance dashboard
* added `omni.financeClose` roots for checklists, audit exports, forecasts, and consolidation placeholders
* added month-end close checklist evidence
* surfaced period lock status without locking periods automatically
* added financial statement readiness, AR/AP aging preview, cash-flow forecast, budget-vs-actual preview, and audit export preview
* added consolidation placeholder without consolidation postings
* no new sidebar page added
* no journal posting, ledger mutation, payment movement, or automatic period locking added

Commit:
`phase7h finance close and planning`

---

### Phase 7I — Advanced Inventory and Supply Chain

Status: DONE
Priority: P1/P2

Goal:
Make inventory suitable for workshop, pharmacy, retail, and manufacturing.

Scope:
* serial/lot/batch
* expiry
* min/max reorder
* reserved vs available
* stock count sessions
* internal stock requests
* landed cost
* barcode/QR labels
* supplier performance

Implementation result:
* added `modules/advanced-inventory.js` + `.css` (add-only) injecting a Phase 7I foundation panel into the existing `inventory` page via wrapped `renderInventoryPage`/`switchPage`
* added `omni.advInventory` roots (serialLots, expiryItems, reorderRules, countSessions, stockRequests, landedCosts, labels, supplierScores) seeded non-destructively
* derived read-only evidence from `omni.materials` for all 9 scope items (serial/lot tracking, expiry metadata, at/below-minimum reorder, reserved vs available, count sessions, stock requests, landed cost, barcode/QR labels, supplier scoring)
* added a read-only "reorder suggestions" preview (no purchase order or stock movement created)
* no sidebar page added; route/page registry stays 87/87
* no stock total, reservation, cost, or posted movement is changed; AVCO/costing untouched

Commit:
`phase7i advanced inventory and supply chain`

---

### Phase 7J — Sales Commercial Pack

Status: DONE
Priority: P2

Goal:
Commercial sales maturity.

Scope:
* commission engine
* sales targets
* installments
* advanced price lists
* loyalty
* customer statements
* quote to contract to work order
* WhatsApp/email sharing

Commit:
`e8c649c phase7j sales commercial pack`

Validation:
* committed locally
* final link cleanup included in `573e8d7`

---

### Phase 7K — Implementation Methodology and Industry Templates

Status: DONE
Priority: P2/P3

Goal:
Make Octagon deployable for real customers.

Scope:
* company setup wizard
* industry templates
* data import center
* opening balance wizard
* go-live checklist
* training checklist

Commit:
`0bbe4da phase7k implementation methodology foundation`

Implementation:
* added `modules/implementation-methodology.js` + `.css`
* injected company setup wizard foundation into Admin Productization
* injected data import center foundation into existing `import`
* injected go-live and role training checklists into existing `deploy_ready`
* added industry template plan records and opening-balance proof review without automatic posting

Validation:
* `node --check modules\implementation-methodology.js`
* VM smoke seeded 8 setup steps, 6 templates, 6 import specs, 6 go-live items, and 5 training roles
* `8080` served the new JS/CSS cache tokens

---

### Phase 7L — Platform / Marketplace / Developer Ecosystem

Status: DONE
Priority: P3

Goal:
Make Octagon extensible.

Scope:
* plugin registry
* API tokens
* webhooks
* connector registry
* internal marketplace
* developer docs

Commit:
`573e8d7 phase7k platform marketplace foundation`

Validation:
* plugin registry, scoped API key foundation, webhook registry, module catalog, and staged marketplace foundation committed locally

---

### Phase 7M — E-Commerce and External Connectors

Status: DONE
Priority: P3/P4
Blocked by: Phase 7L

Scope:
* WooCommerce connector
* Shopify connector
* Salla/Zid connector
* payment gateway status integration
* WhatsApp integration expansion

Implementation result:
* added `modules/ecommerce-connectors.js` + `.css` (add-only) injecting a connectors workspace into the existing `integration_hub` page (`integrationHubBody`), alongside the Phase 7L marketplace registry
* WooCommerce / Shopify / Salla / Zid connector cards with staged status, scope, and last-sync
* payment-gateway status panel (MyFatoorah/PayTabs/Stripe/ZainCash) — status only, no capture/transfer
* WhatsApp expansion panel (planned features) — does not change existing WhatsApp logic; sending stays approval-routed
* staged sync-jobs table with rollback; `omni.ecommerceConnectors` roots seeded non-destructively (correct bare-`omni` access)
* every action is STAGED, LOGGED, and ROLLBACK-AWARE — no real external API call, order import, or payment capture; no token shown/stored client-side; database.json not mutated directly
* no new sidebar page added

Commit:
`phase7m ecommerce connectors`

---

---
### Phase 8B-Fleet — Fleet Fuel Guard Demo Repair

Status: DONE
Priority: P0-CUSTOMER-DEMO

Goal:
Repair the existing fleet/fuel page into a demo-ready command center with 7 internal sections, in-memory demo data, SVG command map, fuel risk layer, speed/geofence logic, investigation management, and read-only Jarvis panel — without hardware integration or external APIs.

Scope:
* 12 in-memory demo vehicles (truck, loader, generator, pickup, excavator, crane, car, tanker, roller, van, bulldozer) with drivers, projects, zones, fuel anomalies, and speed violations
* 7-section internal tab structure (لوحة السيطرة, خريطة المتابعة, المركبات والمعدات, الوقود والمخاطر, الرحلات والمناطق, التقارير والتحقيقات, إعدادات الربط التجريبي)
* SVG/HTML command map with 6 color-coded zones and vehicle pins
* Fuel risk / anti-theft detection (variance analysis, low confidence, suspicious drops)
* Speed/geofence violation detection (zone-specific limits, light vs heavy vehicle)
* Investigation management (case listing by severity, placeholder actions)
* Read-only Jarvis AI panel (dynamic content based on top anomaly)
* Demo data badge (بيانات تجريبية للعرض) on all sections when no real data
* CSS overhaul (dark-mode ready, responsive, professional command-center look)

Implementation result:
* `modules/fleet.js` rewritten (~530 lines, 7 sections, 12 demo vehicles, guard map, fuel risk, investigations, Jarvis panel)
* `modules/fleet.css` rewritten (~140 lines, RTL, dark-mode ready, responsive grids)
* `views/fleet.html` updated (title/subtitle)
* `docs/FLEET_MODULE_REVIEW.md` created
* No new pages added (93/93 route count maintained)
* No database.json mutations (demo data in-memory only)
* No real GPS/OBD/tank sensor integration
* No external map API used

Commit:
`phase8b fleet fuel guard demo repair`

---

### Phase 8A — Release Candidate & Pilot Readiness Audit

Status: DONE
Priority: P0
Reason: Phase 7A–7M feature roadmap is complete. Before any new feature work, Octagon must pass a release-candidate audit.

Scope:
* full route/page audit
* full page smoke audit
* empty page / broken button audit
* route health and PAGE_METADATA audit
* permission/audit/security audit
* Jarvis boundary audit
* performance audit for heavy pages
* demo/pilot readiness checklist
* documentation baseline update

Findings / result:
* Route baseline confirmed clean at **93/93/93** (nav / markers / counted routed views), total view files 95, internal route-less 2. Live `/api/release/status` route block: 0 duplicate page keys, 0 missing views, 0 missing markers, 0 orphan routed views.
* Permission mapping: **93/93** nav pages covered (0 missing).
* PAGE_METADATA: was 83/93 — **fixed** by adding the 10 missing workshop/core pages (`kanban`, `workflow`, `op_packs`, `task_manager`, `sop`, `machines`, `inventory`, `equipment`, `qc_center`, `sales`). Now **93/93**.
* Broken-button / handler-wiring audit: scanned 96 HTML files vs 3747 defined callables → **0 dead handlers** (only false positive was a native `HTMLElement.click()`).
* Page smoke (real browser): 0 console errors at boot; sampled pages render non-empty with header + buttons. `integration_hub` renders in the real app but wedges the headless automation renderer (heavy aggregate of 4 modules; already debounced 4x→1x; recommend future lazy/tabbed render).
* Security/Jarvis: no real secrets in frontend or `database.json`; `POST /api/db` admin/local-dev gated; destructive restore needs typed confirm + pre-restore backup; AI Governance `directHighRiskExecution = false`; Telegram/WhatsApp/ecommerce/marketplace all staged + approval-routed; Jarvis cannot approve/send/mutate high-risk directly.
* Backup: stale legacy `database.backup.auto.*.json` are a reduced 8-collection mirror and FAIL `/api/backup/verify` against the v6 SQLite schema. A FRESH `/api/backup` (SQLite-sourced) self-verifies and PASSES. Created `database.backup.phase8a_audit.*.json` (1.4MB) → `/api/backup/verify` PASS.

Production blockers (by severity):
* P1 — `database.json` (git-tracked fallback) is a thin 8-collection mirror; full v6 data (account_moves/users/departments/journal_entries/locations) lives only in SQLite `database.db` (gitignored). Package SQLite or a fresh full backup on deploy.
* P2 — `integration_hub` heavy single render (real app OK; optimize later).
* P3 — local-dev default-allow must be disabled for a real customer pilot (real auth/sessions).

Files changed:
* `services/permissionService.js` — added 10 PAGE_METADATA entries (add-only).
* `docs/RELEASE_CANDIDATE_PILOT_CHECKLIST.md` — new.
* `OCTAGON_EXECUTION_QUEUE.md`, `HERE.md`, `STRUCTURE.md`, `MASTER_ROADMAP.md` — concise status notes.

Validation:
* `node --check` on app/server/permission/audit/state/tenant/route-health/phase7a-stabilization → all OK
* permission regression → 35/35
* `database.json` parse → PASS
* `/api/release/status` route → 93/93/93
* `/api/backup/verify` (fresh) → success:true

Commit:
`phase8a release candidate pilot readiness audit`

---

### Phase 8D — Knowledge Base & FAQ Foundation

Status: DONE
Priority: P0

Goal:
Build a real, in-app Knowledge Base & FAQ module inside Octagon ERP with a dedicated page (`knowledge_base`), bilingual UI, in-memory data seeding, local search/filters, details viewer, safe draft proposing editor, and read-only Jarvis integration.

Scope:
* dedicated page `views/knowledge_base.html`, `modules/knowledge-base.js` and `modules/knowledge-base.css`
* bilingual Arabic/English support with LTR/RTL auto-layouts
* 12 FAQs and 6 guides/articles in-memory seed content
* local search, category filters, type filters, and visibility checks
* Jarvis read-only registry tools
* `PermissionService` page metadata and coverage count updated to 95/95

Commit:
`phase8d add knowledge base faq foundation`

---

### Phase 8E — Fleet Fuel Guard Demo Enrichment & Bilingual Translation Sync

Status: DONE
Priority: P0

Goal:
Add full bilingual translation support (Arabic/English) to the existing Fleet Fuel Guard module and enrich the presentation views with clean, responsive, localized labels and mock data variables.

Scope:
* `modules/fleet.js`: implemented language hooks `getLang()`, translation dictionary wrapper `tx()`, localized demo vehicles/labels, and an event listener for `'octagon:language-applied'` to dynamically re-render views on language changes.
* `views/fleet.html`: updated page headers with `data-i18n-ar` and `data-i18n-en` attributes.

Commit:
`phase8e fleet fuel guard demo bilingualization`

---

## Current Next Action

The next action is:

`Phase 8E complete — Fleet Fuel Guard Demo is fully bilingualized and verified. Awaiting review.`

---

## After Each Phase

Update this file:
* set phase status to DONE / PARTIAL / BLOCKED
* add commit hash
* add validation result
* add remaining risks
* update “Current Next Action”

Also update:
* `HERE.md`
* `STRUCTURE.md`
* `OCTAGON_MASTER_ERP_COMPLETION_ROADMAP.md` only with short status note if needed

Do not rewrite the full roadmap.

---

## Standard Final Report

Every phase report must end with:

```md
## Next Automatic Step

If Saif says `كمل`, the next phase will be:
`<phase name>`

Reason:
`<why this phase is next>`

Blocked by:
`<none or listed blockers>`
```
