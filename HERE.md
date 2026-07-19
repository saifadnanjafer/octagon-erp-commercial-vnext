# Octagon ERP - JARVIS Runtime V2 Status

Welcome to Octagon ERP V4.0 / V6. This sprint focuses on upgrading the AI Assistant into **JARVIS Runtime V2** — a fully integrated, hands-free ERP voice/text operator.

## Core Assistant Modules

1. **Voice Runtime** (`jarvis-voice-runtime.js`): Exposes `window.JarvisVoiceRuntime` for continuous hands-free voice control, strict state machine, fuzzy echo loop prevention, and voice interruption barge-in.
2. **Local System Map** (`modules/jarvis-system-map.js`): Deterministically scans the ERP DOM and registers actions, pages, and forms offline. Calculates a coverage score.
3. **DOM-lite Action Agent** (`modules/jarvis-action-agent.js`): Matches action IDs, highlights active targets visually, and executes actions or navigates.
4. **UI Integration & Control Panel** (`omni-ai-assistant.js`): Integrates the assistant layout and registers delegated event listeners for selecting provider models, modes, executing map rebuilds/retries/budget clears, wake-word activation, and diagnostics panel.
5. **Diagnostics Test Harness** (`modules/jarvis-test-harness.js`): Automates a 53-test matrix verifying boot, UI, language, navigation, actions, safety gating, budgeting, and voice runtime capabilities.

## Styling & Layouts
- **CSS Stylesheet** (`jarvis-visual-overlay.css`): Defines pulsing targets, floating execution bubbles, and the dark premium glassmorphism settings card.

## Current Build Status
- **Syntax validation**: Checked and passed cleanly for `app.js`, `omni-ai-assistant.js`, `jarvis-voice-runtime.js`, `omni-language-fix.js`, `server.js`, and all JARVIS modules.
- **Database validity**: `database.json` validated.
- **Diagnostics matrix**: Programmatic 53-item test matrix run completed. Total tests: 53. PASS: 42. FAIL: 6. WARN: 0. MANUAL REQUIRED: 5. Results exported to `jarvis-test-report.json`.

## Phase 8A — Release Candidate & Pilot Readiness (2026-06-26)

Phase 7A–7M feature roadmap + Phase 8B (Fleet) are complete. Phase 8A is a hardening/audit pass (no new pages). Result: **READY FOR DEMO / INTERNAL PILOT**.
- Route baseline **93/93/93** clean (0 duplicate/missing/orphan); total view files 95, internal route-less 2.
- Permission mapping **93/93**; PAGE_METADATA brought to **93/93** (added 10 workshop/core pages in `permissionService.js`).
- Broken-button audit: **0 dead handlers** across 96 HTML files / 3747 callables.
- Boot smoke: **0 console errors**; sampled pages render non-empty. `integration_hub` renders in the real app but wedges headless automation (heavy aggregate; already debounced; future lazy/tabbed render).
- Security/Jarvis: no frontend secrets; `POST /api/db` admin-gated; destructive restore needs typed confirm + pre-restore backup; AI `directHighRiskExecution=false`; connectors staged; Jarvis draft/approve-only.
- Backup: create a FRESH `/api/backup` (SQLite-sourced) before relying on verify — stale legacy `database.backup.auto.*.json` mirrors fail verify by design.
- Top risk (P1): `database.json` (git-tracked) is a thin 8-collection fallback; full v6 data lives in SQLite `database.db` (gitignored) — package SQLite/full backup on deploy.
- Full checklist: `docs/RELEASE_CANDIDATE_PILOT_CHECKLIST.md`.

## Phase 8D — Knowledge Base & FAQ Foundation (2026-07-03)

In-app Knowledge Base & FAQ feature fully implemented:
- Added dedicated page: `views/knowledge_base.html`, `modules/knowledge-base.js`, and `modules/knowledge-base.css`.
- Registered `knowledge_base` key in `app.js` pageMap, view prefetch, and command palette.
- Added `knowledge_base` permissions to `PAGE_METADATA` and `PAGE_PERMISSIONS` in `permissionService.js`.
- Extended `permission-regression.mjs` expected page baseline from 94 to 95.
- Seeded database dynamically with 12 FAQs and 6 guides/articles in Arabic/English.
- Configured Jarvis read-only tools and safety governance guidelines.

## Phase 8E — Fleet Fuel Guard Demo Enrichment & Translation Sync (2026-07-03)

Bilingual translations and demo data enrichment for the Fleet Fuel Guard page completed:
- Integrated language hooks `getLang()` and translation wrapper `tx()` inside `modules/fleet.js`.
- Localized all UI labels (tabs, columns, KPIs, geofence zones, engine states, and alert statuses).
- Updated mock vehicles and logs variables to carry bilingual descriptions.
- Added event listener on `'octagon:language-applied'` to dynamically re-render view on user language changes.
- Updated `views/fleet.html` page headers with `data-i18n-ar` and `data-i18n-en` attributes.

## Governance Freeze Baseline (2026-06-23)

Route/page reconciliation is at **93/93 sidebar nav** and **93/93 page templates** (was 86/86; +`telegram` 2026-06-26 approved by Saif; +Phase 7J/7L pages `sales_commission`, `sales_contracts`, `sales_price_lists`, `finance_installments`, `pos_deepening`, `omni_communications`, `integration_hub`). All 93 pages are mapped in `permissionService.js` (100% coverage) and the regression baseline expects 93/93. The 7J view files were renamed hyphen→underscore so the loader finds them (filename must equal the page key). The new `telegram` page is a safe foundation: no bot token client-side, Jarvis drafts only (never sends), outbound is approval-gated.

Current canonical handover protocol:
- `MASTER_ROADMAP.md` remains the single source of truth for long-range roadmap and build rules.
- `HERE.md` is the short current-state handoff.
- `STRUCTURE.md` is the current route/page registry and architecture note.
- `CODEX_RUNBOOK.md` and `all into here file.md` are intentionally absent from the current root. The live `MASTER_ROADMAP.md` says those files were consolidated/replaced; no archive copy was found during this freeze pass, so they were not restored or regenerated.

Risk & Compliance safety classification:
- Page key: `risk_compliance`.
- Storage scope: `omni.riskCompliance` only.
- It is **not fully read-only**: user actions can create/update risk/control records and call `saveData()`.
- It does **not** post finance/accounting/payroll/stock/QC/price changes, send external messages, or mutate locked payroll/finance pages.
- It reads live system signals for context and writes only self-contained governance register data.
- It calls `PermissionService.checkPage('risk_compliance')`; because `risk_compliance` is not in `PAGE_PERMISSIONS`, it follows the current default-allow model.

Permissions note:
- `services/permissionService.js` explicitly maps 28 sensitive pages.
- Unmapped pages currently default-allow (`checkPage()` returns true when a page has no mapping). This is acceptable for local/dev but must be reviewed before live deployment.

Do not proceed to Phase 6 feature development until this 86/86 governance baseline remains green after validation.

## Phase 6A Core ERP Gap Slice (2026-06-23)

Scope completed without adding sidebar pages:
- `banking`: added a conservative Bank Reconciliation overlay inside the existing Banking / Treasury page. Statement lines and match metadata are stored under `omni.banking.reconciliations[]`, `omni.banking.statementLines[]`, and `omni.banking.reconciliationMatches[]`. Matches do **not** mutate finance transactions or post accounting entries. Any reconciliation difference is routed to `createOmniRequest()` / Command Center as a finance review request.
- `inventory`: added Storage Locations inside the existing Inventory page. It uses `omni.warehouses[]`, `omni.storageLocations[]`, `omni.locationStock[]`, and `omni.locationMovements[]`. Existing material totals remain unchanged and remain source of truth until a full reconciliation pass.
- `admin_panel`: added a Chart of Accounts surface inside the existing Admin Panel. It reads existing `finance.accounts`, shows usage/locking warnings, and allows adding a new unused account. It does not delete accounts, edit used code/type/parent values, or change posted journal data.

Permissions updated:
- `risk_compliance` is now explicitly mapped to `workshop.manager` / `finance.manager`.
- `banking` is now explicitly mapped to `finance.user`.
- New model mappings were added for `finance.accounts`, `omni.banking`, and `omni.locationStock`.
- Default-allow remains in place for unmapped pages. This is still local/dev acceptable only and must be hardened before live deployment.

Validation checkpoint:
- Route Health before Phase 6A: 86/86 nav, 86/86 pages.
- Route Health after Phase 6A browser smoke: 86/86 nav, 86/86 pages, console error log clean.
- No locked payroll/finance page was modified directly. `database.json` was not reset or overwritten.

## Phase 6C Admin Audit + View Prefetch Recovery (2026-06-23)

Continued launch-readiness work without reviving the old combined handoff file.

Built:
- `app.js`: Admin Wire-Up now includes a live Button / Permission Audit panel. It scans all sidebar `data-page` buttons, resolves target page sections, checks click wiring, checks explicit/default permission policy status, and reports guarded action count from `PermissionService.actionPermissions`.
- `style.css`: reused Admin audit KPI styling for the new audit panel.
- `index.html`: fixed the dynamic view prefetch bootstrap. The end-of-body wrapper now runs `prefetchAllViews()` immediately if `DOMContentLoaded` already fired, instead of only registering a late listener that never runs.
- `index.html`: bumped `app.js` and `style.css` cache tokens to `20260623-admin-audit-v1`.

Validation:
- `node --check app.js` PASS.
- `node --check server.js` PASS.
- `node --check services/permissionService.js` PASS.
- JSON parse for `database.json`, `claude-status.json`, and `claude-review-pointer.json` PASS.
- Chrome-backed Playwright smoke on `localhost:8080`: Route Health returned 86/86 nav and 86/86 pages. Admin Wire-Up audit returned 86 OK, 0 warnings, 0 broken, and 15 guarded actions. Only observed console issue was the existing 404 resource noise.

Remaining:
- Dead-code deletion still requires explicit go-ahead.
- Final live stabilization re-check remains.

## Phase 6B Permission + Approval Hardening (2026-06-23)

Sensitive action inventory:
- Banking: statement-line create = sensitive local write; match/unmatch = sensitive metadata write; final reconciliation = manager/admin only and approval-routed; adjustment/write-off = approval request only; old direct finance movement path remains blocked/approval-routed.
- Inventory locations: transfer/receive/issue = guarded local write with movement history; insufficient/negative source stock = blocked; adjustment = manager/admin direct with audit or approval-routed for non-manager; delete location/movement is not exposed in Phase 6A and remains blocked by absence.
- Chart of Accounts: create unused account = guarded; edit/deactivate/delete used account is not exposed and remains blocked by absence; used-account warnings stay visible.
- Risk Compliance: add/update/close risk and add/update control = guarded by `risk_compliance.write`.

Action permissions added:
- `banking.reconciliation.create`, `.match`, `.unmatch`, `.finalize`, `.adjustment_request`
- `inventory.location.create`, `.transfer`, `.adjust`, `.issue`, `.receive`
- `accounting.coa.create`, `.edit_safe`, `.edit_used`, `.deactivate`
- `risk_compliance.write`

Approval and audit behavior:
- Guarded actions call `PermissionService.checkAction()` in addition to page checks.
- Allowed, blocked, and approval-routed outcomes are written to `recordOmniHistoryEvent()` and `addOmniSystemLog()` where available.
- Approval-routed actions create Command Center requests through `createOmniRequest()`.
- The page-level default-allow model remains unchanged for local/dev usability; full deployment hardening is still pending.

## Phase 6C Role Matrix + High-Risk Action Policy (2026-06-23)

Scope completed without adding sidebar pages and without changing `database.json` schemas:
- Added `PermissionService.explainAction(actionKey, context, userOrRole)` as a dry-run permission explanation helper.
- Page access remains default-allow for unmapped local/dev pages, but high/critical unmapped action keys now resolve to deny-by-default or approval-required instead of silent allow.
- Added explicit metadata for banking reconciliation, inventory location, Chart of Accounts, Risk Compliance, direct finance posting, and AI high-risk write actions.
- Added `modules/phase6c-security-matrix.js`, injected into the existing `security_center` page, showing role/action outcomes for system admin, finance manager/user, workshop manager/user, and ordinary user profiles.
- Strengthened Phase 6A approval payloads with `actionKey`, source page/module, user/role, target id, before/after, risk level, requested timestamp, status, and reason.
- Strengthened guarded audit logs with action key, user/role, page, target, result, timestamp, reason, and risk level.

Governance notes:
- Current explicit page mappings remain intentionally limited to sensitive/core pages while unmapped pages default-allow for local/dev.
- Sensitive action mappings are explicit and the new high-risk action metadata prevents unmapped high/critical writes from becoming silent allows.
- Jarvis/AI direct-write paths were inspected only for safety confirmation; existing high-risk/sensitive AI tools remain approval-gated through the AI governance/approval queue rather than direct writes.
- Before live deployment: decide the final login/current-user model, map all sensitive pages/actions, convert high-risk execution to deny-by-default everywhere, and test system admin, manager, operator, finance user, and ordinary user roles.

## Phase 6D Real Users, Role Matrix, and Stable Baseline (2026-06-23)

Baseline:
- Project was not a Git repository at the start of this pass. Baseline validation passed, a local marker was added at `db-backups/phase6d-baseline-marker-20260623.md`, and a local-only Git repo was initialized with baseline commit `ae8e614 stable-86-route-health-phase6c`.
- No remote was configured and nothing was pushed.
- `database.json` was inspected only and was not reset or overwritten. Before Phase 6D runtime migration it had `omni.users: []`, `omni.roles: 3`, and no `omni.userRoles`.

Built without adding sidebar pages:
- `app.js`: `normalizeOmniUsersRolesPermissions()` now seeds a non-destructive local real-user foundation when no live users exist. Seeded users are `system_admin`, `finance_manager`, `workshop_manager`, `operator_user`, `employee_user`, and `viewer_user`. Seeded roles carry `groups` for `PermissionService`; users carry `displayName`, `role`, `roleId`, `status`, `is_active`, tenant/company fields when available, `createdAt`, `source: phase6d_seed`, and no password fields.
- `services/auditService.js`: `PentagonAuth` / `OctagonAuth` now resolves the legacy `system` fallback to the seeded `system_admin` when available and enriches current users from `omni.roles`.
- `app.js`: `authUserSwitcher` now populates from `omni.users` and shows display name + role, while preserving fallback behavior if users are missing or corrupted.
- `services/permissionService.js`: role resolution now accepts `groups`, `roleId`, or `role`, and consults `omni.roles[].groups`. Phase 6D added HR/payroll/security high-risk action metadata for salary change, locked-period attendance edit, deduction/fine, advance/loan, termination/deactivation, role/permission change, payroll-affecting leave approval, and employee deletion.
- `modules/phase6c-security-matrix.js`: the existing `security_center` matrix now tests the current selected user, real `omni.users`, and fallback profiles. It also renders a documentation-only 86-page permission sensitivity audit with explicit-mapping status and future policy recommendation.
- AI/Jarvis queues now stamp current user id/name/role/source on high-risk or approval-routed proposals in `modules/jarvis-brain.js`, `app.js`, and `omni-ai-assistant.js`. Sensitive AI tools still route to approval queue and do not directly post finance/stock/COA/payroll writes.

## Phase 6E Controlled Page Hardening (2026-06-24)

Built after confirming the loader fix works on `http://127.0.0.1:8080/`:
- `services/permissionService.js`: added `PAGE_METADATA` and `PermissionService.explainPage(page, userOrRole)` so page access is explainable like sensitive actions.
- First explicit page-policy batch now covers finance (`ar_ap`, `budgeting`, `banking`, `tax_compliance`), HR/payroll (`import`, `timesheet`, `calendar`, `people_ops`), AI/system (`ai_queue`, `ai_factory`, `ai_tools`, `ai_status`, `deploy_ready`), admin/security/data (`multi_entity`, `integration_hub`, `security_center`, `data_quality`, `route_health`, `device_center`), and procurement/approval pages.
- Self-service pages `employee_ui` and `employee_mobile` are explicitly public/self-service instead of accidentally default-allowed.
- `modules/phase6c-security-matrix.js`: Security Center now shows a Phase 6E page-policy audit with mapped/default status, sensitivity, current-user access, and phase. The action matrix remains dry-run only.
- `modules/route-health.js`: Route Health now hydrates all lazy view templates only when the diagnostic runs, so boot stays fast and Route Health still proves the full 86/86 baseline.

Validation:
- `node --check app.js`
- `node --check services/permissionService.js modules/phase6c-security-matrix.js modules/route-health.js`
- `JSON.parse(database.json)`
- Browser smoke on `8080`: loading overlay hidden by `init-finally`, current user `system_admin`, Security Center Phase 6E audit visible (`53 mapped`), and Route Health green at 86/86 nav, 86/86 pages, 8/8 globals, 14/14 functions, 13/13 collections, 1/1 work-order links.

Policy status:
- Highest-risk page default-allow surface is reduced, but normal business/vertical pages that are not yet deployment-critical can still default-allow for local/dev.
- High-risk action dry-runs return allowed, blocked, or approval_required based on explicit action policy and risk metadata.
- Real users are a local role/user identity foundation, not production password authentication.

Remaining before production:
- Build real authentication/session handling with hashed credentials or external identity.
- Convert sensitive page access from local default-allow to explicit policy in controlled batches.
- Decide tenant/company assignment rules for real production users.
- Review AI approval execution paths end-to-end before enabling any high-risk executor.

## Phase 6F Seeded Role Regression Harness (2026-06-24)

Built:
- `scripts/permission-regression.mjs` is now the automated read-only role regression harness for the Phase 6D/6E security baseline.
- It loads `services/permissionService.js` in a browser-like VM, seeds the six development roles in memory only, and verifies role inheritance, mapped page policy outcomes, sensitive action outcomes, unmapped local/dev page behavior, and high-risk approval routing.
- It also guards the current audit denominator: 86 unique sidebar pages and 53 mapped sidebar pages.

Validation:
- `node scripts/permission-regression.mjs` PASS: 35/35.
- `node --check scripts/permission-regression.mjs` PASS.
- `JSON.parse(database.json)` and `JSON.parse(claude-status.json)` PASS.
- Live browser audit on `http://127.0.0.1:8080/` PASS: Route Health 86/86 nav, 86/86 pages, 8/8 globals, 14/14 functions, 13/13 collections, 1/1 work-order links; Workshop Stabilization 12/12 PASS; Security Center matrix and Phase 6E page-policy audit visible with `53 mapped`; console clean.
- `index.html`: added an inline favicon data URI so the browser no longer logs a default `/favicon.ico` 404 during audit runs.

Remaining before production:
- Build real authentication/session handling with hashed credentials or external identity.
- Continue converting sensitive/default-allowed pages into explicit policy batches.
- Decide tenant/company assignment rules for real production users.
- Review AI approval execution paths end-to-end before enabling any high-risk executor.

Recommended next Phase 6G:
- Continue the launch audit/performance/release-readiness pass.
- Decide final production authentication/session handling and tenant assignment rules.

## Phase 6G Legal / AI Orders / Maintenance Coverage (2026-06-25)

Built:
- `modules/documents.js`: Documents now has a legal print kit tab for employee contracts and company rules. It prints A4 Arabic-ready employee contract drafts, company internal rules, and individual DMS document metadata sheets. Existing document rows now include a print action.
- `app.js`: Intelligence / AI Control now includes a structured "issue order or task" form. It can ask AI to draft the wording, then issue either a Task Manager task or an approval/order request through Command Center while stamping the current user context.

Coverage confirmed:
- Legal documents are now printable from the existing `documents` page, while contract DMS linkage and renewal tasks remain on `contracts`.
- Workshop maintenance is covered by existing machine maintenance intervals (`maintenanceIntervalHours`, `maintenanceIntervalDays`), machine maintenance requests into Task Manager, fixed-asset preventive maintenance schedules in `modules/asset-maintenance.js`, and equipment monthly audit/check status in the `equipment` page.
- This pass did not add sidebar pages and did not reset or overwrite `database.json`.

Remaining:
- The legal templates are operational drafts; final local-law wording still needs owner/legal review before official adoption.
- Next hardening should connect due asset/equipment maintenance into automatic recurring Task Manager generation, not only visible due alerts/manual request buttons.

## Phase 6H Authentication Hardening and Page Mapping (2026-06-25)

Built:
- **Client-Side SHA-256 Auth**: Implemented client-side salting and SHA-256 password hashing in `app.js` using browser-native Web Crypto API. Password hashes are stored under `passwordHash` and `passwordSalt` inside `database.json`.
- **First-Time Password Setup & Prompts**: Users are forced to set up a new password on their first login or switch. Login prompts now request password validation.
- **Guest State Enforced**: Introduced a proper `guest` user role (`groups: []`) when no user is logged in (`localStorage.getItem('octagon_user_id')` is empty), blocking access to all non-public pages with the message: `"يجب تسجيل الدخول أولاً."`.
- **Switcher Gating**: Restricted the `#authUserSwitcher` dropdown. In non-admin, non-devMode environments, switching is blocked with `"تبديل المستخدمين متاح للمدير فقط."`.
- **Admin Password Reset**: Added a password reset option in the admin panel user edit dialog that clears the password hash, forcing a new setup on the next login.
- **Page Hardening batch 2**: Mapped all remaining 33 previously unmapped pages in `services/permissionService.js` (Smart Calculator, MRP, Point of Sale, industry verticals, kiosk, workshop TV, help manuals, etc.). Mapped sidebar pages count is now 86/86.
- **Toasts**: Integrated Arabic-first feedback for login success (`"تم تسجيل الدخول بنجاح."`), logout (`"تم تسجيل الخروج."`), incorrect passwords, and switcher restrictions.
- **Regression suite**: Updated the 35-test regression suite to expect `86` mapped pages and verified all checks pass successfully.
- **Verification**: Verified via `node --check` syntax checks, regression harness tests (35/35), and browser smoke checks.

## Phase 7A Stabilization Foundation (2026-06-26)

Stage 1 pending closure:
- Committed the master completion roadmap as `13c0df8 add master erp completion roadmap`.
- Committed the previously pending `app.js` maintenance auto-task delta as `6d9fb61 preserve pending app js maintenance task delta`.
- No remote Git is configured. A local runtime backup was created and verified through the existing backup API after fixing SQLite/source verification.

Built without adding sidebar pages:
- `server.js`: added a minimal server-side auth/session bridge (`/api/auth/login`, `/api/auth/session`, `/api/auth/logout`) using existing password hash/salt data and HttpOnly session cookie storage. Also added `/api/release/status` and read-only `/api/backup/verify`.
- `app.js`: existing login/logout flow now establishes/clears the server session when credentials are available while preserving the local-first fallback and first-time password setup.
- `modules/phase7a-stabilization.js`: injects Phase 7A panels into existing Security Center, Deploy Ready, Data Quality, and Finance surfaces. It adds audit review, backup verification, release readiness, deployment-blocker checks, and a period-lock foundation.
- `.gitignore`: ignores local `database.backup.*.json` snapshots and temporary `.phase7a-server.pid`.

Governance:
- AI/Jarvis remains approval-gated for high-risk finance, payroll, stock, legal, security, and QC actions.
- Period locks are not auto-created. Finance manager/system admin can lock/unlock periods manually; new `addFinanceTransaction()` calls are blocked when dated inside a locked period unless an explicit internal override is passed.
- Backup restore remains manual/destructive; Phase 7A added dry-run verification only.

Validation checkpoint:
- Static route baseline remains 86 sidebar pages, 86 view markers, and 86 view files.
- Permission regression remains 35/35.
- `database.json` parse passed.
- Temporary validation server used port `8091`; the existing `8080` process was stale and returned 404 for the new endpoint.

## Phase 7B Production Safety Closure (2026-06-26)

Built without adding sidebar pages or resetting `database.json`:
- `server.js`: added server/port diagnostics, `/api/server/status`, sanitized Phase 7B release status, API protection metadata, local/dev-aware session gates, and role/admin guards for sensitive API write, backup, upload, and restore routes.
- Restore safety: `/api/restore/dry-run` compares selected/latest backup top-level keys and collection counts without mutation. Destructive `/api/restore` now requires admin context plus typed confirmation and still creates a pre-restore backup.
- `app.js`: top-bar auth indicator now shows resolved role plus `server` or `local-dev` mode. Admin/dev switcher use is audited.
- `modules/phase7a-stabilization.js`: existing Security Center, Deploy Ready, Data Quality, and Finance injections now show Phase 7B port status, API protection status, backup age, restore dry-run, remote Git guidance, and richer production blocker rows with severity, owner, sample, auto-fix policy, and approval requirement.
- `.gitignore`: ignores temporary `.phase7b-server.pid`.

API protection status:
- Public/safe: auth login/session/logout, release/server diagnostics, WhatsApp webhook verification/signature flow.
- Local/dev readable: `GET /api/db` remains documented as not production-safe.
- Session/admin gated: database writes, collection/record writes, uploads, backup list/create/verify, restore dry-run, and destructive restore.

Remaining risks:
- No remote Git is configured; manual next commands remain `git remote add origin <REMOTE_URL>` and `git push -u origin master` after Saif creates a remote repository.
- Server sessions are now enforced for sensitive APIs outside local/dev, but this is still not a full external identity provider.
- Browser admin-panel smoke may still require an existing known test login; do not create real passwords only for smoke.

## Phase 7D Report Designer and Smart Views (2026-06-26)

Built without adding sidebar pages or resetting `database.json`:
- `modules/nl-reporting.js`: the existing Smart Reports page now includes a Report Designer with saved report definitions, selected columns, role-group access metadata, smart-view filters, client-side CSV/JSON/Excel export, Arabic print layout, and a safe disabled scheduler placeholder under `omni.nlReports`.
- AI drafting remains read-only: the "مسودة AI" control only drafts a report definition title from the current report intent and does not mutate finance, payroll, stock, or source report data.
- `modules/nl-reporting.css`: added responsive designer, access chips, and safety-policy styling.
- `index.html`: bumped `nl-reporting` CSS/JS cache tokens.

Validation checkpoint:
- Static route baseline remains 86 sidebar pages, 86 view markers, and 86 counted view files.
- Permission regression remains 35/35.
- `database.json` parse passed and the live database diff was restored to clean after a validation server normalized it.
- In-app Browser smoke was attempted; hardened login/first-time password setup prevented completing authenticated navigation without mutating a database. A temporary server on port `8093` used a copied DB for smoke isolation, but the final acceptance relies on static syntax/regression/route checks until a known test login is available.

Next automatic phase:
- Phase 7E SaaS Productization Foundation.

## Phase 7K Implementation Methodology Foundation (2026-06-26)

Built without adding sidebar pages or resetting `database.json`:
- Added `modules/implementation-methodology.js` and `.css`, linked from `index.html`.
- New root: `omni.implementationMethodology` with setup steps, industry templates, import specs/batches, opening-balance proof records, go-live checklist, training checklist, and signoffs.
- Admin Productization now receives a company setup wizard foundation, industry template plan cards, and opening-balance proof review. Template application is plan-only and non-destructive.
- Existing `import` page now receives a Data Import Center foundation with required column specs and validation-batch logging. Invalid-row behavior is modeled as rejected-before-write.
- Existing `deploy_ready` page now receives go-live P0 and role training checklists.
- No opening balance journals, stock moves, asset values, or destructive demo data are posted automatically.

Validation checkpoint:
- Commit: `0bbe4da phase7k implementation methodology foundation`.
- `node --check` passed for `modules/implementation-methodology.js`, `modules/platform-marketplace.js`, `modules/sales-commercial-pack.js`, `app.js`, and `server.js`.
- VM smoke seeded the implementation-methodology root without touching `database.json`.
- `8080` served the new `implementation-methodology` JS/CSS cache tokens.

Next automatic phase:
- Phase 7M E-Commerce and External Connectors.
