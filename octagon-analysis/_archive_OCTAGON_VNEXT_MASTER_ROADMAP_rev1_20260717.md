# Octagon VNext — Master Roadmap
Authority level 7. The canonical, dependency-driven commercial roadmap. Executable by multiple agents without redesigning the system. Epics reference engines in Target Architecture §3 and modules in the Module Catalog. "Current gap" is stated at the level established by the Blueprint; the Truth Audit refines specifics but does not change epic scope.

## Reading rules for an implementation agent
- Do work only after the `EXECUTE OCTAGON COMMERCIAL VNEXT` go-signal, inside `octagon-erp-commercial-vnext/`, never in production.
- Pull a task from the Execution Plan (doc 8), which decomposes these epics into file-owned, gated tasks.
- Respect release-train order: a train's exit gate must pass before the next train's integration. Within a train, epics marked ∥ can run in parallel lanes.
- Every epic's Definition of Done includes: acceptance tests pass, backend-enforced permissions, audit events emitted, migration/rollback notes, Arabic/RTL UI, no GPL/AGPL code copied.

## Epic schema (compact)
`ID · Title` — Objective · Gap · Donor(license mode) · Roles · Scope · Data model · Services/API · UI · States/Workflow · Permissions · Audit · Reports · Migration · Deps · Exclusions · Tests · Acceptance · Risk · Complexity · ∥lane · DoD-note.

---

## RELEASE 0 — Isolation & Baseline  (exit gate: fork boots on its own DB; production SHA-256 unchanged)
**R0.1 Fork & isolate** — Objective: create `octagon-erp-commercial-vnext/` per Clone Plan. Gap: none (new). Donor: —. Roles: platform. Scope: copy code (exclude data/secrets/node_modules/donor), own port 8091/DB/backups/env, boot-guard vs prod DB. API: —. UI: —. Migration: pre-clone backup + critical SHA-256 manifest. Deps: —. Tests: fork boots; prod manifest unchanged; fork refuses prod DB path. Acceptance: both servers runnable independently, never same DB. Risk: HIGH (data safety). Complexity: M. ∥: solo. DoD: clone-manifest.md written.
**R0.2 Notices & governance** — `THIRD_PARTY_NOTICES.md` (MIT attributions RuoYi/Aureus), provenance-comment convention, contribution guardrails. Risk: MED (legal). Complexity: S. ∥: with R0.1.
**R0.3 Compatibility stubs** — Adapter interfaces `LegacyPayrollAdapter` (read-only), `LegacyFinanceBridge`, `LegacyEntityAdapter` (no logic yet). Deps: R0.1. Risk: MED. ∥: after R0.1.

## RELEASE 1 — Platform Kernel  (exit gate: a demo entity has full CRUD/ACL/chatter/audit/numbering/views/approvals with server-enforced permissions)
**R1.1 Schema/collection registry + config-CRUD engine (3.7)** ∥lane-A — Objective: uniform REST + config UI per registered entity. Gap: current app hand-codes each page. Donor: IDURAR+NocoBase (clean-room/idea). Data: collection, field, entity_registry.json, x_records. API: `/api/x/:entity/{create,read,update,delete,list,summary}` envelope. UI: list/detail/form/actions renderer (RTL). States: draft baseline. Perms: via R1.2. Audit: via R1.4. Tests: CRUD round-trip on demo entity zero-code. Acceptance: new entity = 1 config, no page code. Risk: MED. Complexity: L. DoD: registry documented.
**R1.2 ACL + row-level security engine (3.6)** ∥lane-B — Objective: role×action×scope×field×menu, backend-enforced. Gap: current PermissionService hides UI only. Donor: NocoBase+RuoYi. Data: acl_roles, acl_grants, user_roles. API: matrix CRUD + middleware `requirePerm`+scope injection. UI: Arabic matrix editor. Perms: self-referential (admin). Audit: grant changes. Tests: deny-before-write 403; own-scope filters rows; field mask on serialize. Acceptance: no route bypasses ACL; scope enforced in SQL. Risk: HIGH (enterprise gate). Complexity: L.
**R1.3 Document-state engine (3.3)** ∥lane-A (after R1.1) — state defs+transitions+guards; submit/cancel hooks. Tests: illegal transition rejected; guard enforced. Risk: MED. Complexity: M.
**R1.4 Numbering + audit + record-history (3.12/3.9)** ∥lane-C — atomic per-company/year sequences; audit before/after; history view. Tests: concurrent creates unique; history diffs. Risk: MED. Complexity: M.
**R1.5 Custom-field + snapshot engine (3.8)** ∥lane-C (after R1.1) — runtime fields merged into forms/tables; snapshot freeze. Tests: custom field appears + persists; snapshot immutable post-submit. Risk: MED. Complexity: M.
**R1.6 Chatter engine (3.10)** ∥lane-B — thread/log/activity/followers/mentions/attachments on any entity. Tests: post/schedule/done; follower notified. Risk: LOW. Complexity: M.
**R1.7 Saved-view + worklist engine (3.11)** ∥lane-B (after R1.1) — per-user/shared views; worklist nav items. Tests: save/reload view; worklist query surfaces next-actions. Risk: LOW. Complexity: M.
**R1.8 Notification center (3.13)** ∥lane-C — inbox + templates; in-app + WhatsApp channel. Deps: R1.6. Risk: LOW. Complexity: S.
**R1.9 Universal approval engine + Approval Center (3.4)** ∥lane-B (after R1.2, R1.3) — policies, chains, delegation/escalation, inbox (initiated/todo/done/cc/delegated/escalated/withdrawn/rejected/returned). Tests: action blocked until approved; maker≠checker; delegation; escalation timeout. Risk: HIGH. Complexity: L.
**R1.10 Import/export + template-print** ∥lane-C — Excel in/out per worklist; HTML-template print (RTL A4/A5). Deps: R1.1. Risk: LOW. Complexity: M.
**R1.11 Workflow/automation engine (3.5)** ∥lane-A (after R1.3, R1.9) — trigger+node executor + run log. Tests: "record created→notify" fires; approval node integrates. Risk: MED. Complexity: L.
> R1 note: re-home the useful ideas from the already-built W0 spike into these clean engines; do not lift its production-integrated code wholesale — rebuild to the invariants (append-only, backend-enforced, company-scoped).

## RELEASE 2 — Immutable Finance & Stock Foundations  (exit gate: post→cancel→repost reconciles to zero; stock valuation matches; period lock blocks posting)
**R2.1 GL engine + accounting dimensions (3.1)** — append-only postings, balanced vouchers, polymorphic refs, dimension injection, trial-balance/ledger services. Migration: mirror through LegacyFinanceBridge; reconcile vs v6. Tests: unbalanced rejected; cancel reverses; locked-period blocked; TB balances. Risk: HIGH. Complexity: L.
**R2.2 Fiscal periods & locks** — open/close/lock, posting-date guard, period-close voucher. Deps: R2.1. Risk: MED. Complexity: M.
**R2.3 Stock ledger engine + valuation (3.2)** ∥ with R2.1 — append-only SLE + bin cache, moving-avg/FIFO, repost. Tests: balance derivation; backdated repost; negative-stock policy. Risk: HIGH. Complexity: L.
**R2.4 AR/AP on GL** — invoices/bills/payments post through GL; derived payment status; reconciliation (FIFO/manual). Deps: R2.1. Risk: HIGH. Complexity: L.
**R2.5 Financial report suite** — TB/P&L/BS/CashFlow/GL/partner-ledger/aged over GL engine; export. Deps: R2.1. Risk: MED. Complexity: M.

## RELEASE 3 — Core Sales / Procurement / Inventory / Manufacturing  (exit gate: an order→delivery→invoice and a PO→receipt→bill each post correctly to both ledgers; a WO consumes+produces stock)
**R3.1 Sales orders→delivery→invoice** (Module 2) — deps R2.1/R2.3. **R3.2 Pricing/promotion engine (3.14)** ∥. **R3.3 Procurement RFQ→PO→receipt→bill + 3-way match** (Module 3). **R3.4 Inventory ops (receipts/issues/transfers/counts/serial-batch/reorder)** (Module 4) — deps R2.3. **R3.5 Manufacturing BOM→WO→job-card** (Module 5) — deps R2.3; **frozen workshop jobOrders bridge** (wrap, not replace). Risk: HIGH (integrity across modules). Complexity: L each. ∥: by module lane once R2 gates.

## RELEASE 4 — Workflow, Approval, Collaboration, Permissions (end-to-end)  (exit gate: a real cross-module approval + automation runs; permissions provably backend-enforced across modules)
**R4.1 Approval policies per module** (finance/procurement/HR/AI writes) via 3.4. **R4.2 Workflow templates** per module via 3.5. **R4.3 Row-level scope rollout** to all business entities (company/dept/own). **R4.4 Chatter/activities/worklists** wired into every module surface. Risk: MED. Complexity: M. ∥ by concern.

## RELEASE 5 — Schema-driven UI, Custom Fields, Saved Views, Reporting  (exit gate: an admin builds a new entity screen + custom field + report with no code)
**R5.1 Config-CRUD coverage** of standard entities. **R5.2 Custom-field admin UX**. **R5.3 Report + dashboard designer (3.17)** + big-screen. **R5.4 Public forms** (unauth capture→CRM). Risk: MED. Complexity: M–L.

## RELEASE 6 — Portals, Subscriptions, Memberships, POS, External Experience  (exit gate: customer/vendor portal login + a subscription billing run + a POS session close)
**R6.1 POS sessions (open/close/reconcile)**. **R6.2 Subscription/recurring-billing engine (3.15)** + dunning. **R6.3 Membership/points/loyalty** (append-only ledger). **R6.4 Customer + vendor portals**. **R6.5 Appointments/booking**. Risk: MED. Complexity: M–L.

## RELEASE 7 — MES, OEE, Andon, Advanced Planning  (exit gate: shop-floor terminal captures job time; OEE + downtime + Andon report from real events)
**R7.1 Job-card execution + labor/machine capture**. **R7.2 OEE + downtime + Andon** (RuoYi MES). **R7.3 Production planning/scheduling + capacity**. **R7.4 Quality gates + CAPA**. Risk: MED–HIGH. Complexity: L.

## RELEASE 8 — SaaS Admin, Licensing, Integrations, Deployment  (exit gate: trial→paid entitlement gating works; two tenants isolated; a webhook + import round-trips)
**R8.1 Tenant/company + entitlement engine (3.19)** hardened; multi-company scoping verified. **R8.2 Licensing/activation** (offline key + online). **R8.3 Integration/webhook + credential vault (3.18)**. **R8.4 Deployment packaging** (installer, LAN, private, SaaS from one build). Risk: HIGH (isolation). Complexity: L.

## RELEASE 9 — Industry Packs & Marketplace  (exit gate: two packs install/uninstall cleanly and configure a vertical without core forks)
**R9.1 Pack SDK + registry**. **R9.2 Workshop/Advertising pack** (frozen bridge). **R9.3 Retail/POS + Pharmacy + Clinic + Fleet + Contracting packs** (prioritize by demand). **R9.4 Marketplace (signed packs)**. Risk: MED. Complexity: M each.

## RELEASE 10 — Migration, Pilot, Security, Performance, Commercial Release  (exit gate: §Commercialization "commercial release requirements" all green)
**R10.1 Migration execution** (masters + opening balances via adapters; reconcile tolerance 0). **R10.2 Pilot** (workshop tenant closes payroll + finance month on VNext). **R10.3 Security audit** (auth/injection/secrets/AI gates). **R10.4 Performance** (boot<2s, section<1.5s). **R10.5 Onboarding wizard + Arabic user guide + branding**. **R10.6 Release** (backups verified, notices complete, edition packaging). Risk: HIGH. Complexity: L.

## Dependency spine (critical path)
R0 → R1(kernel) → R2(ledgers) → R3(core modules) → R10(migration/pilot). R4/R5 develop alongside R3 but gate before R6. R6/R7/R8/R9 are largely parallel post-R3+R4, each gating on the engines they consume. Nothing ships commercially until R2 reconciles and R10 pilot passes.

## Parallelization summary
- R1: lanes A(CRUD/state/workflow) · B(ACL/approvals/chatter/views) · C(numbering/audit/custom-fields/notify/import-print) — 3 parallel builder streams.
- R2: GL lane ∥ stock lane; AR/AP + reports after GL.
- R3–R9: one lane per module/pack, each gated on kernel + ledgers.
- Human decision queue (owner sign-off) at: R0 fork, R2 reconciliation model, frozen-payroll boundary, multi-tenant isolation model, each commercial-release gate.

## What this roadmap deliberately excludes (backlog, post-GA)
IM/chat, full e-commerce storefront/mall, WeChat/regional-social surfaces, advanced WMS barcode automation beyond serial/batch, AI auto-execution beyond approved tools, non-Iraqi statutory packs (until demanded).
