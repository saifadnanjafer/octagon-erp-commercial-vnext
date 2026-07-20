# Octagon VNext — Gap & Donor Matrix
Authority level 5. One row per meaningful capability. "Octagon now" is evidence-based from `OCTAGON_CURRENT_TRUTH_AUDIT.md` (path cites there). Donor evidence from `DONOR_SYSTEM_FORENSIC_ANALYSIS.md`. License mode is binding.

## Legend
- **Status:** IMPL=implemented · PART=partial · FE=frontend-only · MOCK=demo/mock · INFRA=infra-only (built, unused) · ABSENT=planned/absent · DUP=duplicated · UNUSABLE=present-but-commercially-unusable.
- **Reuse:** CR=clean-room (GPL/AGPL donor, concepts only) · MIT=code reusable w/ attribution · IDEA=design-only (NocoBase docs) · SELF=Octagon-owned.
- **Prio:** P0 (integrity/blocker) · P1 (core commercial) · P2 (differentiator/expansion) · P3 (later).
- **Cx:** S/M/L complexity.

## A. Platform kernel
| ID | Capability | Octagon now (evidence) | Best donor | Reuse | Recommended design | Prio | Cx | Epic |
|---|---|---|---|---|---|---|---|---|
| K01 | Immutable GL / double-entry | **PART→UNUSABLE**: `account_moves` mutated in place (financeService.js:610); `x_gl` table exists but never written (Audit §3) | ERPNext | CR | GL engine 3.1, append-only + reversal + dimensions | P0 | L | R2.1 |
| K02 | Immutable stock ledger | **ABSENT**: no perpetual SLE; stock is JSON qty | ERPNext | CR | Stock ledger engine 3.2 + bin cache | P0 | L | R2.3 |
| K03 | Backend-enforced permissions (row+field) | **FE/UNUSABLE**: PermissionService in browser; server ACL bypassed on loopback `local-trusted`→admin (server.js:2145/2215) | NocoBase+RuoYi | IDEA | ACL engine 3.6 + predicate injection; remove loopback bypass | **P0 (#1 blocker)** | L | R1.2 |
| K04 | Document-state engine | **ABSENT**: ad-hoc draft/posted flags in finance only | NocoBase | IDEA | Engine 3.3 generalized | P0 | M | R1.3 |
| K05 | Numbering/sequence integrity | **PART**: per-entity ad-hoc counters | NocoBase+IDURAR | IDEA/CR | Engine 3.12 atomic per-company/year | P1 | M | R1.4 |
| K06 | Audit trail + record history | **PART**: `aiAuditLog` + write-guard log; not universal | NocoBase | IDEA | Engine 3.9 on all writes | P0 | M | R1.4 |
| K07 | Config-driven CRUD engine | **INFRA**: W0 `OX.crud` built, mounted, but only demo.html uses it (Audit §3) | IDURAR+NocoBase | CR/IDEA | Engine 3.7; re-home spike as clean engine | P1 | L | R1.1 |
| K08 | Custom fields (runtime) | **INFRA**: W0 views-fields built, unused by real pages | AureusERP | MIT | Engine 3.8 | P1 | M | R1.5 |
| K09 | Snapshot fields | **ABSENT** | NocoBase | IDEA | Engine 3.8 (snapshot) — freeze price/tax on lines | P1 | M | R1.5 |
| K10 | Chatter/collaboration | **INFRA**: W0 chatter built, unused | AureusERP | MIT | Engine 3.10 on all entities | P1 | M | R1.6 |
| K11 | Saved views + worklists | **INFRA**: W0 views built; worklists absent | AureusERP | MIT | Engine 3.11 | P1 | M | R1.7 |
| K12 | Universal approval + Center | **PART**: `server-jarvis-security.js` approvals (AI only, server-enforced); no general center | RuoYi | MIT | Engine 3.4 + Approval Center inbox | P0 | L | R1.9 |
| K13 | Workflow/automation | **INFRA/PART**: W0 workflow built unused; legacy automation-engine module | NocoBase+RuoYi | IDEA/MIT | Engine 3.5 trigger+node | P1 | L | R1.11 |
| K14 | Notification center | **PART**: WhatsApp + ad-hoc toasts; no unified inbox | RuoYi+NocoBase | MIT/IDEA | Engine 3.13 | P1 | S | R1.8 |
| K15 | Import/export | **PART**: import page exists; not uniform | RuoYi | MIT | 3.7 toolbar import/export | P1 | M | R1.10 |
| K16 | Template print (PDF/A4) | **PART**: some print; not template-driven | NocoBase | IDEA | 3.10-print HTML templates | P2 | M | R1.10 |
| K17 | Tenant/company scoping | **PART/UNUSABLE**: `company_id` code in tenantService/financeService (~48 refs) but gated off; server calls tenant protection "no-op" (server.js:2164) | RuoYi | IDEA | Engine 3.19 always-on scope | P1 | L | R8.1 |
| K18 | Licensing/entitlements | **ABSENT** | RuoYi | IDEA | Engine 3.19 flags + activation | P1 | L | R8.2 |
| K19 | Integration/webhook + vault | **PART**: AI key proxy server-side (good); no general webhook | RuoYi+NocoBase | MIT/IDEA | Engine 3.18 | P2 | L | R8.3 |
| K20 | AI tool + approval-control | **IMPL (strength)**: server-enforced AI governance, audit, approvals (server-jarvis-security.js) | Octagon | SELF | Keep; extend to 3.20 contract | P1 | M | R4/R8 |
| K21 | Migration/compatibility layer | **ABSENT** (new need) | — | SELF | Adapters (Clone Plan §4) | P0 | L | R0.3 |

## B. Finance module
| ID | Capability | Octagon now | Donor | Reuse | Prio | Epic |
|---|---|---|---|---|---|---|
| F01 | Chart of accounts / journals | PART (JSON account_moves) | ERPNext | CR | P0 | R2.1 |
| F02 | AR invoices / AP bills | PART (finance-ui.js) | ERPNext | CR | P0 | R2.4 |
| F03 | Payments + reconciliation (FIFO) | PART | ERPNext | CR | P1 | R2.4 |
| F04 | Bank import + auto-match | ABSENT | ERPNext | CR | P1 | R2.4 |
| F05 | Accounting dimensions | ABSENT | ERPNext | CR | P1 | R2.1 |
| F06 | Budgets (+monthly dist.) | PART (budgeting module) | ERPNext | CR | P2 | R2 |
| F07 | Fixed assets + depreciation | PART (assets module, no schedule engine) | ERPNext | CR | P1 | R2/Maint |
| F08 | Taxes + withholding | PART | ERPNext | CR | P1 | R2 |
| F09 | Multi-currency | ABSENT/PART | ERPNext | CR | P2 | R2 |
| F10 | Period close / locks | ABSENT | ERPNext | CR | P0 | R2.2 |
| F11 | Financial statements (TB/P&L/BS/CF) | PART (reports) | Aureus+ERPNext | MIT/CR | P0 | R2.5 |
| F12 | Consolidation | ABSENT | ERPNext | CR | P3 | R2/E |

## C. Sales & CRM
| ID | Capability | Octagon now | Donor | Reuse | Prio | Epic |
|---|---|---|---|---|---|---|
| S01 | Lead→opportunity pipeline | PART (sales-crm.js) | RuoYi | MIT | P1 | R3.1 |
| S02 | High-seas lead pool (recycle/claim) | ABSENT | RuoYi | MIT | P2 | R3.1 |
| S03 | Quotations→orders | PART | ERPNext | CR | P1 | R3.1 |
| S04 | Pricing/promotions/coupons | ABSENT/PART (marketing module) | ERPNext | CR | P1 | R3.2 |
| S05 | POS + open/close sessions | PART (pos module) | ERPNext | CR | P1 | R6.1 |
| S06 | Loyalty/points/levels | PART (loyalty module) | RuoYi+ERPNext | MIT/CR | P2 | R6.3 |
| S07 | Subscriptions/recurring + dunning | PART (subscriptions module) | ERPNext | CR | P1 | R6.2 |
| S08 | SLA / helpdesk | PART (helpdesk module) | ERPNext | CR | P1 | R8/Proj |
| S09 | Appointments | PART (appointments module) | ERPNext | CR | P2 | R6.5 |
| S10 | Customer portal | ABSENT/PART | Aureus | MIT | P2 | R6.4 |

## D. Procurement / Inventory / Manufacturing / Quality
| ID | Capability | Octagon now | Donor | Reuse | Prio | Epic |
|---|---|---|---|---|---|---|
| P01 | RFQ→PO→receipt→bill + 3-way | PART (procurement module) | ERPNext | CR | P1 | R3.3 |
| P02 | Supplier scorecard | ABSENT | ERPNext | CR | P2 | R3.3 |
| P03 | Inventory ops (recv/issue/transfer/count) | PART (JSON qty, no ledger) | ERPNext | CR | P0 | R3.4 |
| P04 | Serial/batch/expiry | ABSENT/PART | ERPNext | CR | P1 | R3.4 |
| P05 | Reorder/putaway | ABSENT | ERPNext+Aureus | CR/MIT | P2 | R3.4 |
| P06 | Landed costs | ABSENT | ERPNext | CR | P3 | R3 |
| P07 | BOM→WO→job-card | PART (work-orders/workshop-ledger; frozen jobOrders) | ERPNext | CR | P1 | R3.5 |
| P08 | OEE/downtime/Andon | ABSENT | RuoYi MES | MIT | P2 | R7.2 |
| P09 | Quality inspection + CAPA | PART (page-qc) | ERPNext | CR | P2 | R7.4 |
| P10 | Maintenance (PM/CM) | PART (equipment/maintenance) | ERPNext | CR | P2 | Maint |

## E. HR (FROZEN core + additive)
| ID | Capability | Octagon now | Donor | Reuse | Prio | Epic |
|---|---|---|---|---|---|---|
| H01 | Timesheet/attendance | **IMPL — FROZEN** (Audit §6 maps files/functions) | Octagon | SELF | keep read-only | P0-freeze | R0.3 adapter |
| H02 | Iraqi payroll | **IMPL — FROZEN** | Octagon | SELF | keep; regression-gated | P0-freeze | R0.3 adapter |
| H03 | Leave (accrual plans/levels) | PART (people_ops) | AureusERP | MIT | P1 | R5/HR |
| H04 | Recruitment/ATS (stages/skills) | PART (people_ops) | AureusERP | MIT | P2 | HR |
| H05 | Skills matrix / appraisal | ABSENT/PART | AureusERP | MIT | P2 | HR |
| H06 | Employee portal | PART (employee_mobile) | Aureus | MIT | P2 | R6.4 |

## F. Cross-cutting quality gaps (from audit)
| ID | Gap | Evidence | Fix | Prio |
|---|---|---|---|---|
| Q01 | No formal test suite | package.json 1 dep, no test script (Audit §: tests) | test harness + frozen-payroll regression suite in CI-equivalent | P0 |
| Q02 | Loopback ACL bypass | server.js:2145/2215 `local-trusted`→admin | remove bypass; enforce ACL on all modes | P0 |
| Q03 | Two parallel data worlds (JSON collections vs x_*) | Audit §5 | reconcile in migration; JSON = source of truth | P0 |
| Q04 | Monolith app.js (19.8k lines, 103 modules) | Audit §1 | rebuild in VNext, don't extend | P1 |
| Q05 | Mutable finance | financeService.js:610 | GL engine (K01) | P0 |

## Priority rollup (what to build first, and why)
1. **P0 integrity foundation (blocks commercial):** K03 backend permissions + remove loopback bypass, K01 GL engine, K02 stock ledger, K04 doc-state, K06 audit, F10 period locks, Q01 tests, Q02/Q03/Q05. → Release 1–2.
2. **P1 core commercial modules** on the foundation: F01–F11, S01/S03/S04/S05/S07, P01/P03/P07, H03. → Release 3–6.
3. **P2 differentiators/expansion:** pools, loyalty, OEE/Andon, quality, ATS/skills, portals, packs. → Release 6–9.
4. **P3 later:** consolidation, landed costs, marketplace, non-Iraqi statutory.

## Decision principle applied throughout
Reusable engine before hundreds of pages; ledger correctness before dashboards; backend enforcement before hidden buttons; clean-room for GPL/AGPL donors; preserve+adapt the frozen payroll and the (already server-enforced) AI governance — those are Octagon's two strongest existing assets.

---

## ADDENDUM Rev 2 (2026-07-17) — Odoo deep study + NocoBase source review: decision updates
Evidence: `erp-research/06–11`. These rows override/extend the tables above where they conflict.

### Updated best-donor decisions
| ID | Capability | Change |
|---|---|---|
| K01 | GL / document model | Design now follows **Odoo's unified `account.move`** (one model, 7 move_types, tiny state machine + computed payment_state, gapless hashed sequences) posted into ERPNext-style append-only lines. Best of both. |
| K02/P03 | Stock ledger + logistics | Add **Odoo push/pull `stock.rule` routes engine** (declarative N-step flows) on top of ERPNext-style SLE+bin. |
| K03 | Backend permissions | Blueprint now **source-verified twice**: NocoBase ACL middleware (WHERE-scope injection, packages/core/acl) + Odoo `ir.rule` (SQL-injected record rules) + field `groups=`. Clean-room. |
| K13 | Workflow | Adopt **Odoo `base.automation` semantics** (pre/post-domain boundary-crossing triggers, working-calendar delays, inbound webhooks) + NocoBase durable Processor (persisted Execution/Job rows, resumable). |
| F08 | Tax engine | **New best donor: Odoo repartition lines + signed report grids** (declarative withholding/reverse-charge) — supersedes flat tax-row design; keep ERPNext TDS thresholds as secondary. |
| F05 | Dimensions | Implement as **JSON `analytic_distribution`** on lines (GIN/json1-indexed) rather than N columns — Odoo-informed simplification of ERPNext dimensions. |
| S05 | POS | Target **Odoo-grade**: offline-first (IndexedDB), session cash open/close, QR self-order, floor plans (restaurant PACK). |
| S06 | Loyalty | **One engine, 8 program types** (Odoo loyalty) replaces separate loyalty/coupon/points designs; RuoYi sign-in mechanics optional on top. |
| H03 | Leave | Accrual design upgraded to **Odoo DSL** (milestones/caps/carryover) + per-type approval matrix; Aureus models remain MIT reference. |
| Module 8 | Project billing | **Timesheet = cost-ledger line** (Odoo `account.analytic.line` idea) → instant project profitability; project timesheets only, payroll timesheet FROZEN. |

### New capability rows (were absent from the matrix)
| ID | Capability | Octagon now | Best donor | Reuse | Prio | Epic |
|---|---|---|---|---|---|---|
| K22 | Localization-pack framework (CoA/taxes/fiscal-positions/e-invoice per country, zero engine change) | ABSENT (Iraqi logic hardcoded) | Odoo l10n (217 packs) | CR | P1 | R2/R8 |
| K23 | Extension model: inherit-not-fork (view/model inheritance for customization) | ABSENT (edits = forks) | Odoo (3 inheritance modes, xpath views) | CR concept | P1 | R1/arch |
| K24 | e-Invoicing/EDI (UBL/BIS3/Peppol) | ABSENT | Odoo account_edi | CR | P3 | post-GA |
| K25 | Gapless hashed journal sequences (tamper-evident books) | ABSENT | Odoo | CR | P1 | R2.1 |
| S11 | Predictive lead scoring (self-training Bayes) | ABSENT | Odoo crm PLS | CR | P3 | backlog |
| S12 | eCommerce storefront foundation (cart/checkout/abandoned-cart) | ABSENT | Odoo website_sale | CR | P2 | R6 |
| S13 | Email A/B testing w/ auto-winner | ABSENT | Odoo mass_mailing | CR | P3 | backlog |
| H07 | Time-versioned employee records (`hr.version` pattern) | ABSENT (flat employee docs) | Odoo hr | CR | P2 | HR |
| H08 | Overtime rule engine (windows/multipliers/tolerances) | PART (Friday-OT logic FROZEN in payroll) | Odoo hr_attendance | CR idea — **owner approval required (frozen zone)** | P3 | frozen-gated |
| K26 | Auth hardening: TOTP/passkeys/OAuth/password policy | PART (salted hash + lockout exist) | Odoo auth stack | CR | P1 | R8 |

### License corrections binding on all rows
- **NocoBase**: full source on disk; license contradictory (Apache-2.0 manifests vs AGPL headers) → **clean-room only** until vendor reconciles. IDEA→CR where NocoBase is donor.
- **Odoo**: LGPL-3 across Community; ports are derivatives → **clean-room concepts**; 2 OEEL-1 finance addons excluded; Enterprise modules absent → design-only.
