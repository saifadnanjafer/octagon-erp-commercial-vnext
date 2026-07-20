# Octagon VNext — Donor Coverage Cross-Check ("nothing dropped" proof)
Authority level 5b (companion to the Gap & Donor Matrix). Every module/functional group of ALL SIX donor systems, mapped to its destination in Octagon Commercial. Statuses: **ABSORB** (feature enters VNext), **MERGE** (folded into a broader Octagon capability), **PACK** (industry-pack scope), **LATER** (post-GA backlog, deliberate), **EXCLUDE** (deliberately out, with reason). Evidence files: `erp-research/01–11`.

## 1. Odoo 19 Community (643 addons → 44 functional groups)

### Finance (evidence: 06)
| Odoo group | → Octagon destination | Status |
|---|---|---|
| `account` core (move/journal/tax/reconcile/fiscal position/multi-currency) | Finance module + GL engine (K01), tax engine (F08) | ABSORB |
| Tax repartition lines + report grids | Tax engine design (F08) | ABSORB |
| `analytic` + JSON analytic_distribution | Accounting-dimensions engine (F05) | ABSORB |
| 217 `l10n_*` country packs | Localization-pack **framework** (pattern); Iraq pack first, others on demand | ABSORB (framework) / LATER (individual countries) |
| `account_edi*`, UBL/BIS3, `account_peppol*` | e-Invoicing engine (Iraq e-invoicing when mandated; Peppol for export customers) | LATER |
| `account_check_printing`, QR-codes (EMV/SEPA), debit notes | Finance payments niceties | ABSORB (QR/debit note) / LATER (checks) |
| `certificate`, `l10n_hr_edi` (OEEL-1 proprietary) | — | EXCLUDE (license) |
| Enterprise-absent: account_reports/asset/budget/consolidation | Built via ERPNext-informed designs (F06/F07/F11/F12) | ABSORB (from ERPNext donor) |

### Sales / CRM / Commerce (evidence: 07)
| Odoo group | → Octagon | Status |
|---|---|---|
| `crm` (+ Naive-Bayes lead scoring, lead/opportunity duality) | Sales & CRM (S01) + scoring | ABSORB |
| `sale`, `sale_management` (quote templates, upsell status) | S03 orders pipeline | ABSORB |
| `product` (+ dynamic variant creation, configurator, pricelists) | Products master + pricing (S04) | ABSORB |
| `loyalty` (8 program types incl. gift card/eWallet) | Loyalty engine (S06) | ABSORB |
| `point_of_sale` + pos_self_order + restaurant | POS (S05) + restaurant vertical PACK | ABSORB / PACK |
| `website` + `website_sale` (eCommerce, abandoned cart) | Portal/eCommerce foundation (R6) | ABSORB (foundation) / LATER (full CMS builder) |
| `mass_mailing` (+ A/B auto-winner), `sms` | Marketing (campaigns) + notification channels | ABSORB |
| `event*` | Events tab (exists in Octagon) — enrich | MERGE |
| `*_livechat`, `im_livechat` | Omni-communications (WhatsApp-first; webchat later) | LATER |
| `calendar`, `calendar_sms` | Appointments/scheduling (S09) | MERGE |
| Enterprise-absent: subscriptions, marketing_automation, appointment | Octagon already has these (subscriptions/appointments modules) — keep ours, deepen via ERPNext | ABSORB (ours) |
| `crm_iap_*`, `snailmail`, `digest` | IAP-dependent cloud services / low value | EXCLUDE (IAP coupling) / LATER (digest emails) |

### SCM / MRP (evidence: 08)
| Odoo group | → Octagon | Status |
|---|---|---|
| `stock` (moves/quants/lots/routes/rules/putaway/reordering) | Inventory (P03–P05) + stock-ledger engine (K02) + **routes engine** | ABSORB |
| `stock_account` (valuation std/FIFO/AVCO, perpetual/periodic) | Valuation design (K02) | ABSORB |
| `purchase` (+ requisitions, vendor pricelists) | Procurement (P01) | ABSORB |
| `mrp` (BOM polymorphism, WOs, work centers, basic OEE) | Manufacturing (P07) | ABSORB |
| `mrp_subcontracting*` | Subcontracting (Module 5) | ABSORB |
| `stock_landed_costs` | Landed costs (P06) | ABSORB |
| `repair` | Workshop/repair flows (workshop pack) | PACK |
| `maintenance` | Maintenance module (P10) | MERGE |
| `delivery*` (carriers) | Shipping fee templates; carrier connectors | ABSORB (fees) / LATER (connectors) |
| `fleet` + `account_fleet` | Octagon fleet tab — enrich w/ cost links | MERGE |
| `barcodes*` (parser) | Barcode ops (kiosk/warehouse) | ABSORB |
| Enterprise-absent: quality app, MPS, barcode app, most carriers | Quality/MPS from ERPNext designs (P09, R7.3) | ABSORB (from ERPNext) |

### HR / Projects (evidence: 09)
| Odoo group | → Octagon | Status |
|---|---|---|
| `hr`, `hr.version` (time-versioned records) | HR additive layer (idea for employee data versioning) | ABSORB (idea) |
| `hr_holidays` (accrual DSL, approval matrix) | Leave v2 (H03) | ABSORB |
| `hr_attendance` (+ overtime rule engine) | **Study only — Octagon attendance/payroll FROZEN**; overtime-rule *idea* noted for future owner-approved work | EXCLUDE (frozen zone) |
| `hr_recruitment` (+ talent pools), `hr_skills` (résumé timeline) | ATS (H04) + skills (H05) | ABSORB |
| `hr_expense` | Expense claims (exists) — enrich | MERGE |
| `hr_timesheet` = analytic.line | Projects billing design (Module 8) — **project timesheets only, NOT payroll timesheet** | ABSORB |
| `project` (milestones+billing, recurrence, personal kanban stages) | Projects (Module 8) | ABSORB |
| `lunch`, `hr_homeworking` etc. | Low-value internal perks | EXCLUDE (scope) |
| Enterprise-absent: payroll/appraisal/helpdesk/FSM/planning | Payroll = Octagon FROZEN own; helpdesk/FSM from ERPNext designs | ABSORB (ours/ERPNext) |

### Platform / Framework (evidence: 10)
| Odoo group | → Octagon | Status |
|---|---|---|
| ORM + 3 inheritance modes; view-inheritance/xpath | Extension model (Target Arch §6) — inherit-not-fork concept | ABSORB (concept) |
| `ir.rule` row-level + field `groups=` + `ir.model.access` | ACL engine (K03) design confirmation | ABSORB |
| `mail` (thread/activity mixins, subtypes, mail gateway) | Chatter engine (K10) reference | ABSORB |
| `base_automation` (boundary-crossing triggers, calendar delays, webhooks) | Workflow engine (K13) semantics | ABSORB |
| `ir.sequence`, `ir.cron`, `resource` (working calendars) | Numbering (K05), jobs, SLA calendars | ABSORB |
| Auth: totp/passkey/oauth/ldap/password policy/timeout | R8 auth/SSO stack | ABSORB |
| `portal`, `auth_signup` | Customer/vendor portal foundation (R6.4) | ABSORB |
| `bus` (websocket) | Realtime event layer baseline in R1/R8; advanced event features later | ABSORB baseline / LATER advanced |
| `iap` (in-app purchase credits) | — Odoo's cloud monetization | EXCLUDE (business model) |
| `web` client / OWL / QWeb | We keep our vanilla-JS client; concepts only | EXCLUDE (stack) |
| `base_import`, `base_import_module` | Import/export center (K15) | MERGE |
| cloud_storage_*, google_*/microsoft_* connectors | Integration hub connectors | LATER |
| Enterprise-absent: Studio/documents/sign/knowledge | Octagon has esign/documents/knowledge tabs — keep ours; Studio ≈ our custom-fields+schema-UI (K07/K08) | ABSORB (ours) |

## 2. ERPNext (21 modules — evidence: 02)
| Module | → Octagon | Status |
|---|---|---|
| Accounts (GL, dims, pricing rules, subscriptions, dunning, POS profiles, loyalty, budgets, TDS, banking, share mgmt) | Finance + engines K01/F*/S07 (share mgmt → LATER) | ABSORB |
| Stock (SLE/bin, serial-batch bundle, reorder, landed cost, putaway, QC templates) | Inventory/K02/P03–P06/P09 | ABSORB |
| Manufacturing (BOM/WO/job cards/production plan/MPS) | Manufacturing P07 + R7.3 | ABSORB |
| Selling / Buying (+supplier scorecard, RFQ) | Sales S03 / Procurement P01–P02 | ABSORB |
| CRM (leads/opps/contracts/appointments) | S01/S09 | MERGE |
| Projects (activity_cost, timesheets) | Module 8 | ABSORB |
| Assets (depreciation schedules, capitalization) | F07 + Maintenance | ABSORB |
| Quality (goal/procedure/review/NC/CAPA) | Quality module (P09/R7.4) | ABSORB |
| Support (SLA/issues/warranty) | Helpdesk + SLA (S08) | ABSORB |
| Maintenance / Subcontracting | P10 / Module 5 | ABSORB |
| Setup (authorization rules — amount approval limits) | Approval engine K12 policies | ABSORB |
| Regional (India GST etc.), EDI code lists | Localization framework informs; specific countries | LATER |
| Telephony, Communication, Portal/shopping-cart, Bulk-transaction, Plaid | Integration hub / portals / import center | LATER (plaid EXCLUDE — US-only) |

## 3. RuoYi-Vue-Pro (15 modules — evidence: 04)
| Module | → Octagon | Status |
|---|---|---|
| system (users/roles/menus/tenant packages/notify/SMS/mail/dicts) | ACL K03, tenant K17, notification K14 | ABSORB |
| infra (codegen, form builder, jobs, file, monitoring) | Dev-tooling ideas; jobs/file service | ABSORB (jobs/file) / LATER (codegen) |
| bpm (Flowable designers, Approval Center, delegation) | Approval engine K12 + Center UX | ABSORB |
| pay (+wallet) | Payments abstraction + wallet (LATER for wallet) | ABSORB/LATER |
| member (levels/points/sign-in) | Loyalty S06 | MERGE |
| mall (seckill/bargain/group-buy/decoration builder/distribution) | Promotions engine (S04) takes coupons/discounts; social-commerce mechanics | MERGE (coupons) / LATER (seckill/bargain/distribution) |
| crm (high-seas pool, receivables plans) | S02 pool + AR plans | ABSORB |
| erp (simple purchase/sale/stock/finance) | superseded by deeper donors | EXCLUDE (redundant) |
| ai (RAG KB, workflow, multi-provider gateway) | Octagon Omni/Jarvis already has this — enrich | MERGE |
| mp (WeChat OA) | China-specific | EXCLUDE (market) |
| report (Jimu/big-screen/dashboard designers) | Report designer K/R5.3 | ABSORB |
| im (chat + sensitive words) | Omni-communications | LATER |
| iot (things/rules/alerts) | Device center exists — enrich later | LATER |
| mes (Andon/OEE/traceability/shifts) | MES R7 | ABSORB |
| wms (docs/flows) | covered by Inventory + barcode | MERGE |

## 4. NocoBase (27 core + 108 plugins — evidence: 05 + 11)
| Group | → Octagon | Status |
|---|---|---|
| core: database/collections/fields, resourcer auto-CRUD, **ACL** | Kernel K03/K07 (clean-room; license ambiguous) | ABSORB |
| workflow (25 node plugins, durable processor) | Workflow K13 | ABSORB |
| ui-schema/client (Formily) | Schema-UI concept (K07) — concept only | ABSORB (concept) |
| fields: sequence/snapshot/formula/signature/encryption | K05/K09 + field library | ABSORB |
| actions: import/export/bulk/duplicate/print-template | K15/K16 | ABSORB |
| blocks: kanban/calendar/gantt/map/charts | UI block library (R5) | ABSORB |
| auth suite (oidc/saml/cas/ldap/2FA), api-keys, password policy, ip restriction | R8 security | ABSORB |
| data-source-manager (external DB/REST as collections) | Integration hub | LATER |
| multi-app/multi-space, app supervisor | Tenant model (K17) informs | MERGE |
| ops: audit/record-history/backup/migration-manager/async-tasks/telemetry | K06 + ops engines | ABSORB |
| email manager (IMAP client), office previewer, map plugins | Utility backlog | LATER |
| AI employees / MCP server | Omni roadmap (Octagon already AI-first) | MERGE |

## 5. AureusERP (28 plugins — evidence: 03)
| Group | → Octagon | Status |
|---|---|---|
| chatter / fields / table-views / plugin-manager | K10/K08/K11 + module registry | ABSORB |
| accounting/accounts/invoices + report pages | Finance reports structure (F11) | MERGE (ERPNext/Odoo deeper) |
| sales/purchases/products/inventories (routes, OrderPoint) | merged into deeper donors' designs | MERGE |
| manufacturing (OEE-style logs) | MES R7 | MERGE |
| employees (skills), recruitments, time-off (accrual) | H03–H05 | ABSORB |
| projects/timesheets | Module 8 | MERGE |
| contacts/partners | Party master | MERGE |
| security (FilamentShield RBAC), support core (UOM/currency/activity) | ACL + masters | MERGE |
| website/blogs | portal/CMS | LATER |
| barcode, payments, analytics, full-calendar | inventory ops / payments / dims / scheduling | MERGE |

## 6. IDURAR (evidence: 01)
| Group | → Octagon | Status |
|---|---|---|
| createCRUDController + entity auto-registry | Config-CRUD engine (K07) | ABSORB (clean-room) |
| Invoice/Payment/Quote/Client + derived payment status | Finance AR discipline (F02/F03) | MERGE |
| Settings EAV, money-format hooks, PDF, soft-delete, seeds | Kernel conventions | ABSORB |

## 7. Octagon current system (103 modules — evidence: Truth Audit)
All existing tabs re-homed per `OCTAGON_VNEXT_MODULE_CATALOG.md` section tree — none dropped. FROZEN: timesheet/attendance/payroll (adapter only). Preserved as-is: AI governance stack, WhatsApp integration, verticals (→ industry packs), Jarvis/Omni (→ AI layer 3.20).

## 8. Deliberate exclusions (summary with reasons)
- **License-blocked:** Odoo OEEL addons (2), any GPL/AGPL verbatim code, NocoBase in-tree source (until license reconciled).
- **Market-specific:** WeChat OA/mall China mechanics, Plaid (US banking), snailmail.
- **Stack-mismatch:** Odoo web client/OWL/QWeb, Filament UI, Formily runtime — concepts absorbed, code not.
- **Business-model:** Odoo IAP credits.
- **Redundant:** RuoYi's simple ERP module (deeper donors win).
- **Post-GA backlog:** full CMS/website builder, seckill/bargain social commerce, IM chat, IoT depth, WMS barcode app parity, carrier connectors, non-Iraq localizations, websocket realtime.

**Verdict: every donor module is accounted for — absorbed, merged, packed, deliberately deferred, or excluded with a stated reason. No silent drops.**
