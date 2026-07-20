# Donor System Forensic Analysis
Authority level 2. Binding for all reuse decisions. Evidence roots under `erp-research/`. License texts read 2026-07-17 from each repo's license file. **Rev 2 (2026-07-17): Odoo 19 promoted to first-class donor (deep source study, files 06–10); NocoBase record corrected after full source review (file 11).**

## 0. LICENSE COMPATIBILITY TABLE (BINDING)

| Donor | License (verified file) | Commercial use | Attribution | Source-disclosure trigger | Code-copy into proprietary Octagon | Approved reuse mode |
|---|---|---|---|---|---|---|
| **Odoo 19 Community** | LGPL-3 — per-addon `__manifest__.py` (framework + ~600 addons); **2 OEEL-1 exceptions found in finance** (`certificate`, `l10n_hr_edi`); Enterprise modules absent from tree | Allowed to run | Yes if code distributed | Ports/translations of LGPL source are derivatives → LGPL obligations attach to copied portions | ⚠️ Avoid — a Python→JS port is a derivative | **Concepts + schemas + algorithms, clean-room** (treat like GPL for our purposes). Never touch the 2 OEEL-1 addons. Enterprise (OPL) products: absent code = design-from-scratch only. |
| **ERPNext** | GPLv3 — `erpnext-develop/license.txt` | Allowed to run | Yes if distributed | **Distributing** a derivative that includes GPL code forces GPLv3 on the whole work (source disclosure) | ❌ **Prohibited** | **Concepts + schema facts + algorithms, clean-room reimplemented** in our stack. Read `.json` schemas and `.py` logic to learn *behavior*; write our own code. |
| **IDURAR** | AGPLv3 — `idurar-erp-crm-master/LICENSE` | Allowed to run | Yes if distributed/networked | **Network use** (SaaS) of AGPL code forces full source disclosure to users | ❌ **Prohibited** (fatal for hosted SaaS) | **Concepts only, clean-room.** The config-driven CRUD *pattern* is an idea; our implementation must be independently written. |
| **RuoYi-Vue-Pro (yudao)** | MIT — `ruoyi-vue-pro-master/LICENSE` | ✅ Allowed | ✅ Keep MIT notice | None | ✅ Allowed with attribution | Prefer re-express in our JS/SQLite stack (theirs is Java); when copying non-trivial code, retain the MIT notice in a `THIRD_PARTY_NOTICES` file. |
| **AureusERP** | MIT — `aureuserp-master/LICENSE` (Webkul) | ✅ Allowed | ✅ Keep MIT notice | None | ✅ Allowed with attribution | Same as RuoYi. **Caveat:** verify no individual Webkul plugin carries a separate commercial license before copying that plugin's code; root is MIT. |
| **NocoBase** — **CORRECTED Rev 2** | **Contradictory in-tree**: per-package `package.json` + Feb-2026 `LICENSE.txt` say Apache-2.0, but all ~8,565 source headers + root `package.json` still say AGPL-3.0+Commercial (relicense-in-progress; see `11-nocobase-deep-source.md`) | Allowed to run | — | If AGPL governs, network use forces disclosure — **unsettled** | ❌ until license reconciled | **Full source IS on disk (27 core pkgs + 108 plugins) — study it freely, but clean-room only.** If a permissive dep is ever wanted, consume published Apache-2.0 npm builds, and get vendor confirmation first. |

### Rules that follow from the table
1. **The two deepest-logic donors (ERPNext, IDURAR) are copy-prohibited.** Everything we take from them is a *fact* (a field name, a posting rule, a depreciation formula, a state machine) re-expressed in original code. Database schemas and functional methods are not protected by copyright; specific source code expression is. This is the standard clean-room ERP path and it is legally sound — but it means **budget engineering time to re-implement, not paste.**
2. **RuoYi + AureusERP (MIT) are the only donors we may lift code from**, and even then a stack mismatch (Java/PHP → our vanilla-JS + SQLite) usually makes reimplementation cleaner than porting. Keep a `THIRD_PARTY_NOTICES.md` in VNext from day one.
3. **NocoBase gives us the safest, highest-leverage material** — pure architecture ideas with no code-copy exposure. Lean on it for the platform kernel design.
4. Maintain a per-engine "provenance" comment: `// clean-room; behavior modeled on erpnext gl_entry (GPL, not copied)`. This documents non-infringement intent.

---

## 1. ERPNext — transactional & ledger donor (GPLv3 · concepts only)
Root: `erp-research/erpnext-develop/erpnext/`. Python/Frappe. 21 modules, 15 workspaces. Deepest business logic in the survey.

### Architecture
DocType-driven: each entity = a folder with `<name>.json` (schema: fields, options, links, states) + `<name>.py` (controller logic, validation, on_submit posting). Immutable ledgers are the spine: `gl_entry`, `stock_ledger_entry`, `payment_ledger_entry` are append-only; documents post on submit and correct via **cancellation + reversing entries**, never in-place edits. Reposting tools rebuild derived balances.

### Strongest subsystems (exact evidence + what to extract as concept)
- **Immutable GL** — `accounts/doctype/gl_entry/gl_entry.{json,py}`. Extract: debit/credit line model, voucher_type+voucher_no polymorphic reference, `is_cancelled` reversal pattern, posting-date + fiscal-period guard.
- **Accounting dimensions** — `accounts/doctype/accounting_dimension/`. Extract: metadata-driven analytic axes injected on every ledger line without schema change per axis. **Single highest-value idea for finance.**
- **Immutable stock ledger + Bin** — `stock/doctype/stock_ledger_entry/`, `stock/doctype/bin/`. Extract: append-only movement log; `bin` as *materialized cache* (derived qty/valuation), enabling backdated inserts via repost.
- **Pricing engine** — `accounts/doctype/pricing_rule/`, `promotional_scheme/`, `coupon_code/`. Extract: condition→action rule engine (item/group/brand/qty/party), scheme auto-generating multiple rules.
- **Subscriptions** — `accounts/doctype/subscription/` + `subscription_plan/`. Extract: plan→invoice cron with proration/trials.
- **Dunning** — `accounts/doctype/dunning/`. Staged overdue-interest letters.
- **Payment reconciliation** — `accounts/doctype/payment_reconciliation/`. Allocate advances/payments FIFO/manual, cross-currency.
- **Bank auto-match** — `accounts/doctype/bank_transaction/` + reconciliation tool. Rule-based statement matching.
- **Assets** — `assets/doctype/asset_depreciation_schedule/`, `asset/`, `asset_capitalization/`. Extract: multi-method (SL/DD/WDV/manual), per-finance-book schedules, shift factors, build-asset-from-stock.
- **Tax withholding (TDS)** — `accounts/doctype/tax_withholding_category/`. Threshold/cumulative withholding.
- **Manufacturing** — `manufacturing/doctype/bom/` (+`bom_creator`, `bom_explosion_item`), `work_order/`, `job_card/` (shop-floor time logs), `production_plan/`. Extract: multi-level BOM explosion, job-card WIP capture.
- **Quality** — `stock/doctype/quality_inspection_template/`. Parameter-based acceptance on receipt/WO.
- **SLA** — `support/doctype/service_level_agreement/`. Business-hours calendars, response/resolution, pause-on-status.
- **Supplier scorecard** — `buying/doctype/supplier_scorecard/` (+criteria/period/variable). Auto standing.
- **Landed costs** — `stock/doctype/landed_cost_voucher/`. Distribute freight/duty across receipts.
- **Party abstraction** — `accounts/doctype/party_type/`, `party_account/`, `party_link/`. One AR/AP model for customer/supplier/employee/shareholder.
- **Project costing** — `projects/doctype/activity_cost/`, `timesheet/`. Activity billing/costing rates → project profitability.

### Weaknesses / unsuitable
Frappe metaclass ORM magic is not portable and not our stack. Workspace JSON is Frappe-specific. Do not attempt to port the framework — port the *domain behavior*. GPL forbids code reuse regardless.

### Recommended extraction targets (as clean-room specs)
GL engine, stock ledger engine, accounting-dimension engine, pricing engine, depreciation engine, SLA engine, reconciliation engine, BOM/job-card execution. These become the "engines" in the target architecture.

---

## 2. RuoYi-Vue-Pro / yudao — enterprise workflow & admin donor (MIT · code reusable w/ attribution)
Root: `erp-research/ruoyi-vue-pro-master/`. Java 17 / Spring Boot 3 + Vue. 15 modules. `sql/mysql/ruoyi-vue-pro.sql` = 1,448 menu rows / 292 leaf pages with `permission` strings — a complete feature+permission tree and naming reference.

### Strongest subsystems (evidence)
- **BPM approval platform** — `yudao-module-bpm/**` (Flowable). Dual designer (BPMN + "Simple"), listeners, SpEL expressions, CC/copy, delegation, counter-sign, return, dynamic forms. **Approval Center** UX: my/todo/done/cc/initiate.
- **Row-level data permission** — `yudao-framework/.../biz-data-permission`. AOP + MyBatis interceptor rewrites SQL WHERE by dept/self/custom per role — automatic, no business-code change. **Extract this concept for backend-enforced scoping.**
- **Multi-tenancy (SaaS)** — `.../biz-tenant`. `tenant_id` auto-injected via interceptor + thread-local; tenant packages bind menu subsets.
- **CRM high-seas pool** — `yudao-module-crm/**`. Unclaimed leads auto-recycle to shared pool; claim/assign; lead→opportunity→contract→receivable pipeline; funnel/performance analytics.
- **Member engine** — `yudao-module-member/**`. Levels/points/tags/groups, daily sign-in with streak rewards.
- **Pay + wallet** — `yudao-module-pay/**`. Unified pay-order over channels (WeChat/Alipay/mock), refunds, transfers, internal wallet (balance/recharge/ledger).
- **Mall promotions** — `yudao-module-mall/**`. Seckill, group-buy, bargain, coupons, full-reduction, points-mall, decoration page builder, distribution/commission.
- **MES** — `yudao-module-mes/**`. Andon call, downtime, work-reporting, batch traceability, routing, OEE inputs.
- **Report/dashboard designers** — `yudao-module-report/**`. JimuReport + big-screen + dashboard.
- **Infra** — `yudao-module-infra/**`: code generator, drag-drop form builder, Quartz jobs, multi-storage file service, monitoring; `starter-protection` = `@Idempotent`/`@RateLimiter`/`@ApiSignature`/distributed-lock; `starter-excel` import/export.

### Weaknesses / unsuitable
Chinese-market surfaces (WeChat MP, IM, mall) are out of scope for the ERP core — treat as optional. Java stack means reimplementation over porting for most.

### Recommended extraction targets
Approval Center + universal approval engine, row-level data-permission model, tenant model, high-seas CRM pool, member/points engine, MES OEE/Andon/downtime, report+dashboard designer, notification/SMS/mail template trio.

---

## 3. NocoBase — platform & low-code kernel donor (FULL SOURCE on disk · clean-room pending license reconciliation)
Roots: `erp-research/nocobase-main/packages/` (**27 core packages + 108 community plugins, ~8,565 TS files — the earlier "docs-only" verdict was wrong**; see `11-nocobase-deep-source.md`) + `docs/docs/en/` (design specs). Source-verified engine facts:
- **ACL is real row+field security in code** (`packages/core/acl/…/acl.ts`): role×resource×action×row-scope×field enforced as Koa middleware that merges a WHERE-filter scope into the query and 403s — not a boolean gate. Primary blueprint for our K03/R1.2.
- **Auto-CRUD**: any request to an undefined resource matching a collection auto-defines full REST+ACL (`data-source.ts collectionToResourceMiddleware`) — "config = API."
- **Collection/field engine** (`packages/core/database/`): Sequelize-backed; field TYPE (storage) vs INTERFACE (UI) split; per-relation repositories; magic-attribute JSON metadata.
- **Plugin lifecycle** in source: `afterAdd→beforeLoad→load→install→upgrade` + enable/disable/remove.
- **Workflow**: trigger-registry + instruction-registry (25 node plugins), durable/resumable Processor with persisted Execution/Job rows.
- **Client**: Formily JSON-schema rendered recursively by `SchemaComponent`; pages are data-in-DB (Formily-coupled — borrow concept, not code).

### Strongest concepts (evidence = doc paths)
- **ACL matrix** — `users-permissions/acl/`. role × action × **data-scope (all/own)** × **field-level** × **menu**. Multi-role per user + runtime switching; union role. **Primary blueprint for VNext permissions.**
- **Schema-driven UI** — `interface-builder/`, `plugin-ui-schema-storage`. Pages/blocks/fields/actions persisted as JSON ui-schema, rendered at runtime → screens are data, editable without redeploy. NocoBase 2.0 `flow-engine/` layers component-as-Model + Flow(Steps).
- **Collection/field model** — `data-sources/data-modeling/`. Collection types (general/tree/calendar/SQL/view/FDW/inherited); **field interface vs field type split** (one storage backs many widgets); associations (o2o/o2m/m2o/m2m/m2m-array) as first-class fields.
- **Workflow engine** — `workflow/`. Trigger (collection event/schedule/before-after-custom action/approval/webhook) + 28 node types, each its own plugin; versioned revisions + execution log.
- **Field gems** — `plugin-field-sequence` (date+counter numbering), `plugin-snapshot-field` (freeze related data at a moment — e.g. price/address on an order line), `plugin-field-formula`.
- **Ops** — `plugin-audit-logger`, `plugin-record-history`, `plugin-migration-manager`, `plugin-backup-restore`, `plugin-action-template-print` (docx/xlsx/pdf from templates), `plugin-public-forms`.
- **Plugin lifecycle** — `plugin-development/server/plugin.md`: afterAdd→beforeLoad→load(**no DB writes**)→install(first enable)→afterEnable/Disable→remove. Blueprint for our module registry.

### Recommended extraction targets
ACL engine, schema/collection registry + config-driven CRUD, snapshot-field engine, sequence engine, record-history/audit engine, workflow trigger+node engine, module/plugin lifecycle contract, template-print.

---

## 4. AureusERP — daily-use UX donor (MIT · code reusable w/ attribution)
Root: `erp-research/aureuserp-master/plugins/webkul/`. Laravel 12 + FilamentPHP 4, 28 plugins, dual panels (admin + customer portal).

### Strongest subsystems (evidence)
- **Chatter** — `chatter/src/` (Models: Message/Follower/Activity) + `Traits/HasChatter.php`. One trait bolts message thread + log notes + followers + attachments + scheduled activities + @mentions + audit onto any model. **Primary blueprint for the collaboration engine.**
- **Runtime custom fields** — `fields/src/`. Admin-defined fields injected into any form/table/infolist without code.
- **Saved table views** — `table-views/src/Models`. Per-user persisted column/filter layouts + favorites.
- **Worklists** — explicit next-action resources (Order-to-Invoice, PO→Receipt) as first-class nav items. **Blueprint for the worklist/query engine.**
- **Accrual leave** — `time-off/src/Models/{LeaveAccrualPlan,LeaveAccrualLevel,LeaveAllocation,LeaveType}.php`. Accrual plans/levels, mandatory days, allocations.
- **Skills matrix** — `employees/**` + `recruitments/**`. Skill types/levels/job-position skills feeding recruitment→employee.
- **Clusters IA** — visible sub-nav (Customers/Vendors/Reporting/Configuration/Settings) via `support/src/Enums/NavigationGroup.php`.
- **Report suite** — `accounting/src/Filament/Clusters/Reporting/Pages/` with per-report Export classes (TB/P&L/BS/GL/aged/partner-ledger).
- **Runtime plugin manager** — `plugin-manager/`. Install/uninstall modules from UI (Odoo Apps equivalent).

### Weaknesses / unsuitable
Filament/Livewire/Blade is not our stack; accounting depth is shallower than ERPNext. Take UX patterns + data models, reimplement UI.

### Recommended extraction targets
Chatter/collaboration engine, custom-field engine, saved-view engine, worklist engine, accrual-leave model, clusters IA, module registry (runtime install).

---

## 5. IDURAR — screen-consistency donor (AGPLv3 · concepts only, clean-room)
Root: `erp-research/idurar-erp-crm-master/`. MongoDB + Express + React (Ant Design). Minimalist; value = uniformity, not breadth.

### Strongest concepts (evidence)
- **Config-driven CRUD** — `backend/src/controllers/middlewaresControllers/createCRUDController/` (create/read/update/remove/search/filter/summary/paginatedList) + `models/utils/index.js` auto-registry; frontend `modules/{CrudModule,ErpPanelModule,DashboardModule}`. Drop a model → uniform REST + UI. **Blueprint for the schema-driven CRUD engine** (but written clean-room; AGPL forbids copy).
- **Derived financial state** — `appControllers/paymentController/create.js`: payment `$inc`s invoice credit + recomputes paymentStatus atomically; status never hand-set.
- **Settings as EAV** + centralized money/date formatting hooks; auto-increment doc numbers as setting counters; PDF from templates; soft-delete everywhere; seeded defaults.

### Weaknesses / unsuitable
No inventory/accounting depth; quotes/offers gated to premium. AGPL makes code radioactive for our commercial build — **ideas only.**

### Recommended extraction targets
Uniform CRUD contract, derived-state discipline, EAV settings, soft-delete + seeded defaults — all clean-room.

---

## 5b. Odoo 19 Community — the world-#1 donor (LGPL-3 · concepts/clean-room) — Rev 2 deep study
Roots: `addons/` (619) + `odoo/addons/` (24) + `odoo/orm/` framework. Five domain reports carry the evidence: `erp-research/06-odoo-finance.md`, `07-odoo-sales-crm-commerce.md`, `08-odoo-scm-mrp.md`, `09-odoo-hr-services.md`, `10-odoo-platform-framework.md`. Enterprise products (Studio, account_reports/asset/budget, helpdesk, field service, planning, payroll, quality app, MPS, barcode app, subscriptions, marketing automation, documents/sign/knowledge) are **absent OPL code** → design-only; ERPNext's open code remains donor where Odoo gates (quality, MPS, SLA, asset depreciation, subscriptions).

### Unique-to-Odoo extraction targets (not available at this depth in any other donor)
- **Repartition-line tax engine + signed report grids** (`account_tax.py`, 276KB): one tax → N base/tax legs to different accounts/report tags; models withholding/reverse-charge **declaratively**. Beats ERPNext's flat tax rows. → upgrades our tax design (F08).
- **Unified `account.move`** (7,274 lines): ONE model for invoice/bill/credit-note/journal (7 move_types), tiny draft→posted→cancel machine + orthogonal computed `payment_state`; `_check_balanced` enforcement; **gapless hashed journal sequences** (audit integrity). → sharpens K01/R2.1.
- **Localization framework**: 217 `l10n_*` packs = CSV templates + ~40-line `@template` model; a new country needs zero engine changes; deep open UBL/BIS3/**Peppol** e-invoicing stack. → new capability: localization-pack engine (Iraq first, expansion cheap).
- **JSON `analytic_distribution`** (GIN-indexed, `analytic_mixin.py`): multi-dimensional analytics as one JSON field on any line — a leaner alternative to per-column dimensions. → informs K/F05 accounting-dimensions design.
- **`stock.rule` push/pull routes engine**: declarative N-step logistics (receive-in-2-steps, pick-pack-ship, MTO chains) — the top SCM differentiator vs ERPNext's hardcoded flows; move/move-line plan-vs-physical duality; quant-native FIFO/FEFO. → upgrades K02/P03 design.
- **`ir.rule` row-level record rules** injected into SQL WHERE, unbypassable via RPC; field-level `groups=` on any field; three-mode inheritance + **view-inheritance/xpath** = customize-without-forking. → confirms and enriches K03 + our extension model.
- **`mail.thread`/`mail.activity.mixin`**: opt-in mixin chatter with subtype subscriptions, field tracking, inbound mail gateway. → reference for K10 alongside Aureus.
- **`base.automation`**: trigger→server-action engine with pre/post-domain "boundary crossing" semantics, timed triggers on working calendars, inbound webhooks. → enriches K13 workflow semantics.
- **Timesheets = `account.analytic.line`**: time entry IS a cost-ledger row → instant project profitability. → Projects/Services design (Module 8).
- **`hr.version`** time-versioned employee records; leave **accrual DSL** (milestones/caps/carryover); **overtime rule engine** (windows, multipliers, tolerances). → HR additive layer (H03+), payroll still FROZEN.
- **POS offline-first SPA** (IndexedDB, session cash reconciliation, QR **self-order**, floor plans) + **one loyalty engine, 8 program types** across POS/eCom/quotes + **self-training Naive-Bayes lead scoring** (LGPL source!) + native **website/eCommerce** (checkout, abandoned cart) + email **A/B testing with auto-winner**. → S05/S06/S01 upgrades; eCommerce = R6 foundation.
- **Auth stack**: TOTP, WebAuthn/FIDO2 passkeys, OAuth/OIDC, LDAP, password policy — full open reference for R8/SSO.

## 6. Consolidated donor → engine mapping (feeds Target Architecture)
| VNext engine | Primary donor (concept) | Secondary | License mode |
|---|---|---|---|
| Immutable GL + unified doc model | ERPNext + **Odoo account.move** | — | clean-room |
| Tax engine (repartition + grids + withholding) | **Odoo** | ERPNext TDS | clean-room |
| Accounting dimensions / analytic distribution | ERPNext dims + **Odoo JSON analytic_distribution** | — | clean-room |
| Localization-pack framework (CoA/tax/e-invoice per country) | **Odoo l10n** | — | clean-room |
| Immutable stock ledger + valuation | ERPNext | **Odoo quants/FIFO-FEFO** | clean-room |
| Routes/rules multi-step logistics | **Odoo stock.rule** | — | clean-room |
| Pricing/promotion | ERPNext | RuoYi mall | clean-room |
| Loyalty (unified multi-program) | **Odoo loyalty** | RuoYi member / ERPNext | clean-room |
| POS (offline sessions, self-order) | **Odoo pos** | ERPNext pos_profile | clean-room |
| Depreciation/assets | ERPNext | — (Odoo asset = Enterprise-absent) | clean-room |
| Subscription/recurring billing | ERPNext | — (Odoo subs = Enterprise-absent) | clean-room |
| Reconciliation + bank match | ERPNext | Odoo reconcile models | clean-room |
| SLA | ERPNext | — (Odoo helpdesk = Enterprise-absent) | clean-room |
| MES / OEE / Andon | RuoYi (mes) | ERPNext job_card (Odoo MPS/quality = Enterprise-absent) | MIT-reuse or clean-room |
| Universal approval + Approval Center | RuoYi (bpm) | NocoBase workflow-approval | MIT-reuse |
| Row-level data permission | **NocoBase acl (source-verified)** + **Odoo ir.rule** | RuoYi | clean-room |
| ACL matrix (role×action×scope×field×menu) | NocoBase (source) | Odoo ir.model.access + field groups | clean-room |
| Schema/collection + config CRUD | NocoBase (source: auto-CRUD middleware) | IDURAR | clean-room |
| Workflow trigger+node | NocoBase (source: durable Processor) | **Odoo base.automation** semantics, RuoYi | clean-room |
| Snapshot / sequence / record-history / audit | NocoBase | Odoo ir.sequence / mail tracking | clean-room/idea |
| Chatter / collaboration | AureusERP | **Odoo mail.thread mixin** | MIT-reuse (Aureus) + clean-room (Odoo) |
| Custom-field / saved-view / worklist | AureusERP | IDURAR | MIT-reuse |
| Accrual leave / skills / overtime rules | AureusERP + **Odoo hr accrual DSL + overtime engine** | — | MIT-reuse + clean-room |
| Timesheet-as-cost-line (project profitability) | **Odoo hr_timesheet=analytic.line** | ERPNext activity_cost | clean-room |
| Report/dashboard designer | RuoYi | NocoBase data-viz | MIT-reuse/idea |
| Tenant / editions | RuoYi | NocoBase multi-app | concept |
| Extension/customization model (inherit-not-fork) | **Odoo view-inheritance + mixins** | NocoBase plugin lifecycle | clean-room concept |
| Auth (TOTP/passkey/OAuth/policy) | **Odoo auth stack** | NocoBase auth plugins | clean-room |
| eCommerce/portal foundation | **Odoo website_sale** | Aureus dual-panel | clean-room |
| Lead scoring (self-training) | **Odoo crm PLS** | — | clean-room |

## 7. Evidence that could not be verified (flag for follow-up)
- ~~NocoBase code behavior~~ **RESOLVED Rev 2**: full source inspected (`11-nocobase-deep-source.md`). **New open item:** NocoBase's governing license is contradictory in-tree (Apache-2.0 manifests vs AGPL source headers) — must be reconciled with the vendor before any code reuse; until then clean-room only.
- Per-plugin licenses inside AureusERP (root MIT confirmed; individual Webkul plugin headers not each opened) — verify before copying any specific plugin's code.
- ERPNext `.py` posting edge-cases (rounding, multi-currency revaluation) not line-audited — must be re-derived during clean-room engine design, not assumed.
- Odoo Enterprise modules (Studio, account_reports, helpdesk, payroll, quality, MPS, subscriptions, marketing automation…) — **code absent from this tree**; product behavior known only from docs/market knowledge. Design from requirements + ERPNext equivalents, never from assumed internals.
