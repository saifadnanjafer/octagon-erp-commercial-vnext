# Octagon Commercial VNext — Continuation Handoff (2026-07-19)

## Completed and accepted this run
- **R3 external remediation (A1–A9): COMPLETE + ACCEPTED.** All eight remediation
  areas closed and the R3 release gate passed. See `VNEXT_PROGRESS.md` →
  "R3 RELEASE GATE PASSED / R3 ACCEPTED".
- **R4 Governance Rollout (R4.1–R4.5): COMPLETE + ACCEPTED.**
- **R5 Configurability, Reporting & People (R5.1–R5.5): COMPLETE + ACCEPTED.**
- **R6 Revenue & CX (R6.1–R6.7): COMPLETE + ACCEPTED.** POS v2, subscriptions+dunning,
  loyalty, customer/vendor portals, appointments, eCommerce, WhatsApp/omni-comms.
- **R7 Industrial Ops / MES (R7.1–R7.5): COMPLETE + ACCEPTED.** Shop-floor terminals,
  OEE/Andon, MPS-lite, quality gates, maintenance.
- **R8 Enterprise/SaaS/Integration (R8.1–R8.5): COMPLETE + ACCEPTED.** Consolidation,
  SaaS tenant isolation, SSO/OIDC, integration framework, supportability.
- **R9.1 Pack SDK & Conformance Kit: COMPLETE + ACCEPTED.** Migration 901, pack
  manifest validation, install/uninstall lifecycle, edition entitlement gating,
  zero-residue conformance, patch conflict detection, API routes, rollback.
- **R9.2 Workshop & Advertising-Production Pack: COMPLETE + ACCEPTED.** Migration 902,
  job order lifecycle with state machine, material costing, design proof versioning
  with approval workflow, pricing templates, company-scoped API routes, rollback.

## Test inventory (all green, exact counts)
R3: core 19, blocker-closure 29, subcontract-valuation 27, atomicity-injection 77,
inventory-matrix 36, domain-depth 37, authenticated HTTP 25, operational browser 18,
legacy-live 11, legacy-fixture 3, rollback-fingerprints 8, migration-deps (40 resolve).
R4: approval-policies 14, workflow-templates 10, security-audit 12, collaboration 8,
ai-tool-registry 14.
R5: entity-studio 13, formula-fields 24, report-designer 11, print+public-forms 12,
hr-additive 20.
R6: POS v2 13, subscriptions 11, loyalty 9, portal 6, booking 6, eCommerce 5,
campaign 5.
R7: shopfloor 6, OEE/Andon 5, MPS 6, quality 6, maintenance 6.
R8: consolidation 5, licensing 7, SSO 6, integration 5, supportability 5.
R9: pack SDK 7, workshop pack 9.
R2/R1/R0 regression + permission 35/35 + provenance 97/97 + runtime-DDL 0 + frozen-zone 0.

New test scripts (all disposable-DB, no production paths):
`scripts/test-r9-pack-sdk.mjs`, `scripts/test-r9-workshop-pack.mjs`,
`scripts/test-r6-pos-v2.mjs`, `test-r6-subscriptions.mjs`,
`test-r6-loyalty.mjs`, `test-r6-portal.mjs`, `test-r6-booking.mjs`,
`test-r6-ecommerce.mjs`, `test-r6-campaign.mjs`,
`scripts/test-r7-shopfloor.mjs`, `test-r7-oee-andon.mjs`,
`test-r7-mps.mjs`, `test-r7-quality.mjs`, `test-r7-maintenance.mjs`,
`scripts/test-r8-consolidation.mjs`, `test-r8-licensing.mjs`,
`test-r8-sso.mjs`, `test-r8-integration.mjs`, `test-r8-supportability.mjs`,
`scripts/test-r3-subcontract-valuation.mjs`, `test-r3-atomicity-injection.mjs`,
`test-r3-inventory-matrix.mjs`, `test-r3-domain-depth.mjs`,
`test-r3-authenticated-browser.mjs` (rewritten), `test-r3-legacy-workshop-live.mjs`,
`test-r4-approval-policies.mjs`, `test-r4-workflow-templates.mjs`,
`test-r4-security-audit.mjs`, `test-r4-collaboration.mjs`,
`test-r4-ai-tool-registry.mjs`, `test-r5-entity-studio.mjs`,
`test-r5-formula-fields.mjs`, `test-r5-report-designer.mjs`,
`test-r5-print-public-forms.mjs`, `test-r5-hr-additive.mjs`.

## Migration inventory
Added, dependency-declared, all with genuine schema-restoring `down()`:
- 621 subcontract valuation (columns + subcontract_adjustment)
- 622 approval policy packs (data + governance columns)
- 623 workflow templates (data seed into x_records)
- 624 collaboration indexes
- 625 AI tool registry (ai_tool_preview / ai_tool_call / ai_kill_switch)
- 626 entity studio (studio_entity provenance)
- 627 formula fields (formula_field)
- 628 report designer (saved_query / dashboard / dashboard_widget)
- 629 print + public forms (print_template / print_render / public_form / public_submission)
- 630 HR-additive (hr_v2_* tables)
- 631 POS v2 (terminal profiles, sessions, offline sale capture, replay, refunds, self-order, Z-report)
- 632 subscriptions & dunning (plans, proration, billing runs, dunning ladders, MRR/churn)
- 633 loyalty & membership (programs, cards, points ledger, tiers, gift cards, eWallets)
- 634 customer & vendor portals (partner-scoped profiles, quotes, invoices, RFQs, POs, bills)
- 635 appointments & resource booking (resources, slots, availability, double-booking prevention)
- 636 eCommerce foundation (catalog, carts, checkout → draft SO)
- 637 omni-communications (WhatsApp campaigns, templates, DLR webhook, inbound logs)
- 701 shop-floor execution (operators, PIN, work order actions, material issues)
- 702 OEE/Andon (downtime logs, OEE calculations, Andon call lifecycle)
- 703 MPS-lite (forecast demand, proposals, WOs/POs conversion, what-if capacity)
- 704 quality control (inspection plans, results, NCR/quarantine, CAPA, Pareto)
- 705 maintenance & assets (asset registry, depreciation SL/DD, PM/CM orders, MTBF)
- 801 multi-company consolidation (inter-company rules, currency translation, elimination JEs)
- 802 tenancy & licensing (tenant registry, HMAC license verification, edition gating, grace period, seat limits, trial provisioning)
- 803 SSO & advanced identity (OIDC/SAML, SSO links, MFA policies, password constraints)
- 804 integration hub (scoped API keys, webhook subscriptions, encrypted credential vault)
- 805 supportability & upgrades (upgrade history, SQLite integrity/FK checks, OS metrics, support bundles)
- 901 pack SDK (pack registry, patches, migrations, manifest validation, conformance, edition gating)
- 902 workshop pack (job orders, materials, design proofs, pricing templates)
Total migrations now applied: 43. Rollback fingerprint suite confirms baseline
schema is restored after `down()` of the whole R3+ range.

## Key architecture facts for the next agent
- **r3-core.js is now a thin facade.** Real domain workflows live in
  `vnext/server/modules/{products,pricing,sales,procurement,inventory,manufacturing,subcontracting,projects,helpdesk}/`.
  True cross-domain infra is `vnext/server/modules/r3-infra.js` (transactions,
  idempotency, ACL/scope guards, `recordWrite` audit/worklist/outbox + R4.4
  tracked-field auto-log, sequences, approval-override).
- **Governance layer** is `vnext/server/modules/governance/` (policy-engine,
  workflow-templates, security-audit, collaboration, ai-tool-registry, ai-vnext-tools).
- **Studio/reporting/HR** are `vnext/server/modules/{studio,reporting,hr}/`.
- **R6/R7/R8 modules** are domain-owned under `vnext/server/modules/{pos,subscriptions,loyalty,portal,booking,ecommerce,campaign,shopfloor,governance}/`.
- **R9 Packs** are `vnext/server/modules/packs/{pack-sdk-engine,pack-sdk-routes,workshop-engine,workshop-routes}`.
- **Operational UI kernel** is registry-driven: `vnext/client/r3-ui.js` +
  `vnext/client/modules/<domain>/index.js` descriptors + `r3.html` shell.
- **Domain commands manage their own atomic transaction** (self BEGIN IMMEDIATE).
  Do NOT wrap them in an outer transaction — SQLite has no nested BEGIN. See the
  AI-registry write path for the correct claim-then-execute pattern.
- **fireRecordEvent signature** is `(entity, 'create'|'update', record)` — the
  second arg is the action verb, not the record id.
- Test bypass is gated by `NODE_ENV==='test' && OCTAGON_ENABLE_TEST_BYPASS==='true'`
  + local-trusted + header (server.js:1576). Real acceptance uses login+cookie.

## Remaining canonical roadmap (not started)
- **R9.3 Vertical packs wave** — Retail/POS, pharmacy, clinic, restaurant, real-estate/rental, fleet, contracting, education (per owner O-5 prioritization).
- **R9.4 Marketplace & pack distribution** — Signed pack format, local pack manager UI, version-compatibility matrix, paid-pack entitlement hooks.
- **R10.1 Data migration execution** — Masters backfill via adapters, opening balances per cut-date (GL, stock, open invoices/POs), idempotent resumable jobs, reconciliation reports.
- **R10.2 Frozen payroll compatibility validation** — Golden-month replay (adapter vs legacy fixtures byte-identical), timesheet UI embedded read-only, attendance untouched.
- **R10.3 Pilot (dual-run)** — Workshop tenant runs VNext ∥ production for one full cycle, daily reconciliation, task-completion checklist, stop-the-line rules.
- **R10.4 Security audit & performance validation** — External-style authz pass, injection/IDOR/mass-assignment/upload, secret scanning, AI-gate abuse; boot <2s, section switch <1.5s, 10k-row lists <150ms, posting P95 <300ms, 20 concurrent users LAN.
- **R10.5 Onboarding, docs & parity sign-off** — Setup wizard (company, fiscal calendar, CoA via l10n_iq, roles, opening balances, sample data), Arabic user/admin guides, legacy-parity checklist green/waived, branding/white-label, edition packaging final.
- **R10.6 GA release** — Release notes, support/upgrade policy, backup+restore drill, THIRD_PARTY_NOTICES final review, owner go/no-go.

Read exact scope from `octagon-analysis/OCTAGON_VNEXT_MASTER_ROADMAP.md`
(RELEASE 9–10) and the just-in-time decomposition template in
`octagon-analysis/OCTAGON_VNEXT_EXECUTION_PLAN.md` §12–14 (R3/R4/R5 patterns).
Migration block 903+ is free.

## Continuation update — 2026-07-19

R9.3.1 Retail/POS foundation is complete: migration 903 plus domain-owned
multi-store, shift, barcode, and idempotent scan backend. Focused suite is
5/5 PASS; R9.1 Pack SDK is 7/7, R9.2 Workshop is 9/9, and migration dependency
and integrity checks are 30/30. The server mounts `/api/x/retail` after the
post-migration VNext handle. The remaining Retail/POS acceptance work is the
governed POS transaction adapter and pack conformance manifest. Other R9.3
verticals remain unopened.

## Continuation update — 2026-07-25 (R9 closed, Release 10 opened)

R9.4 Marketplace & pack distribution completed and the **R9 core release gate
passed** (migration 907; signed `.octapack` format, trusted signer registry,
compatibility/entitlement matrix, Pack Manager UI). The remaining R9.3 industry
verticals (pharmacy, clinic, restaurant, fleet, education, contracting) are
explicit future/optional work distributable through that same pipeline and are
**not** a prerequisite for Release 10.

**R10.1 Data migration execution: COMPLETE.** Migration 1001 plus domain-owned
`vnext/server/modules/migration/{legacy-source,migration-engine,migration-routes}.js`,
the read-only sanitized source fixture builder
`scripts/create-r10-migration-fixture.mjs` →
`vnext-fixtures/legacy-business-source.db`, and the focused suite
`scripts/test-r10-data-migration.mjs` (**38/38 PASS**). The R10 wave-entry
decomposition (R10.1–R10.6) is appended to the execution plan as §17. Full
evidence and known limitations are in `VNEXT_PROGRESS.md` → "R10.1 DATA
MIGRATION EXECUTION COMPLETE".

Facts the next agent needs:
- **Migration block 1002+ is free.** 1001 declares `dependsOn:
  ['907_r9_marketplace_pack_distribution']`; note that `1001_` sorts before
  `401_` by filename, so the dependency declaration (not filename order) is what
  places it correctly — never drop it.
- **The legacy source is read-only and path-guarded.** `legacy-source.js` opens
  readOnly + `PRAGMA query_only` and refuses anything outside the allowlisted
  root (`OCTAGON_MIGRATION_SOURCE_ROOT`, default `vnext-fixtures`). It denies
  every frozen payroll/attendance/timesheet collection outright.
- **Opening stock is quantity-only by design.** The opening entry already
  carries the inventory balance, so the step fails closed rather than
  double-count GL. Do not "fix" this by enabling perpetual posting there.
- **`x_records.company_id` references `r0_tenant_root`, not `companies`.** Tests
  that seed `x_records` must insert the tenant-root row first; `runMigrations`
  applies migrations only and does not run seeds.

**R10.2 Frozen payroll compatibility validation: COMPLETE (22/22).** Golden-month
replay proves zero delta across every historical period the legacy store holds,
after a full R10.1 migration plus live VNext posting. New:
`scripts/create-r10-payroll-golden-fixture.mjs` →
`vnext-fixtures/legacy-payroll-golden.db`,
`vnext/server/compat/{PayrollGoldenReplay.mjs,payroll-compat-routes.js}`,
`vnext/client/modules/payroll-compat/index.js`,
`scripts/test-r10-payroll-compatibility.mjs`, and the owner artifacts
`octagon-analysis/R10_2_PAYROLL_SIGNOFF.{md,json}`. **R10.2 added no migration.**

Facts the next agent needs:
- **Fidelity differs per month, on purpose.** 2026-04 is proven per employee
  (`closing_detail`); 2026-05 and 2026-06 are proven at period level
  (`period_totals`) because the legacy app superseded their per-employee closing
  records before capture. Never "upgrade" a month past its surviving evidence,
  and never reconstruct a payroll figure. This is **owner decision O-3**.
- **The payroll surface is read-only by construction.** `payroll_compat:view`
  exists; no write permission does. Every non-GET on `/api/x/payroll-compat` is
  refused with `WRITE_SURFACE_DENIED` before auth. Do not add a write verb.
- **The timesheet is not re-implemented** — it is reached through the existing
  read-only `/api/x/r3/legacy-workshop` bridge. Do not duplicate frozen data.
- **Preview recipe for the VNext shell** (production untouched): the
  `octagon-vnext` entry in the repo-root `.claude/launch.json` boots
  `octagon-erp-commercial-vnext/server.js` via `node --eval` with an absolute
  `process.chdir` plus `OCTAGON_SQLITE_DB_FILE`/`OCTAGON_DB_FILE` pointed at the
  scratchpad, on an auto port. The shell is `/vnext/client/r3.html`. Screenshots
  still time out on this app — verify through DOM reads.

## Next command
Enter R10.3 — pilot (dual-run): run the workshop tenant on VNext in parallel with
production for one full cycle (a payroll month plus a finance close), logging
daily reconciliation deltas, a user task-completion checklist, and defect triage
with stop-the-line rules for integrity bugs, until the Commercialization §9.8
pilot exit criteria are met and the owner has reviewed the reconciliation ledger.
Preserve every rule: no Git, production read-only, disposable DBs/ports only,
frozen payroll/attendance/timesheet, no runtime DDL, schema-restoring rollbacks,
server-derived identity + backend ACL + company scope, thin routes + domain
ownership, offline fail-closed for GL/stock/approvals/identity/payroll.
