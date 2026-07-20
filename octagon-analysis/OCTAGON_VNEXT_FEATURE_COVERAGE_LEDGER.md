# Octagon Commercial VNext — Live Feature Coverage Ledger

Status: live documentation register, 2026-07-18. This is the single “nothing forgotten” register for current Octagon capabilities, donor capabilities, canonical roadmap epics, and recovered historical features. A legacy page or clone file is **not** implementation or acceptance evidence by itself.

## Row contract

Every row records: capability ID; capability; source/evidence; disposition; target release; target epic/task; current status; implementation evidence; acceptance evidence; owner decision; notes. Status values are deliberately conservative: `legacy-only`, `planned`, `implemented`, `tested`, `accepted`, `deferred`, or `excluded`.

### Ledger status snapshot — 2026-07-18

Across 330 ledger rows: **legacy-only 138; planned 133; implemented 1; tested 11; accepted 20; deferred 12; excluded 8; partial 7**. `partial` is retained for historical/incomplete donor or capability evidence and is not counted as accepted. R1 epic rows are accepted from the 19 PASS closure evidence; T2.O10.1 and R2.6–R2.8 are accepted from the 2026-07-18 independent gate.

## A. Current Octagon module/page capabilities

Current pages are registered individually so that a surviving clone page cannot silently disappear into a broad module claim. Unless a row says otherwise, `legacy-only` means the legacy surface exists but no VNext acceptance is inferred.

| Capability ID | Capability | Source/evidence | Disposition | Target release | Target epic/task | Current status | Implementation evidence | Acceptance evidence | Owner decision | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CUR-001 | Frozen employees | `octagon-erp-commercial-vnext/views/employees.html`; `vnext/server/compat/LegacyPayrollAdapter.mjs` | preserve | R0/R10 | R0.3, R10.2 | legacy-only | legacy page/adapter path only | R10.2 golden-month proof required | O-3 | never infer writable parity |
| CUR-002 | Frozen employee UI/mobile | `views/employee_ui.html`, `views/employee_mobile.html` | preserve | R10 | R10.2 | legacy-only | legacy pages only | frozen-zone regression | O-3 | read-only boundary |
| CUR-003 | Frozen timesheet | `views/timesheet.html`; `vnext/server/compat/LegacyPayrollAdapter.mjs` | preserve | R0/R10 | R0.3, R10.2 | legacy-only | adapter only | byte-identical fixture | O-3 | no offline post |
| CUR-004 | Frozen attendance/payroll | `views/receipt.html`, `views/calculator.html` | preserve | R10 | R10.2 | legacy-only | legacy surfaces only | golden-month replay | O-3 | no rewrite |
| CUR-005 | Auth/session | `vnext/server/auth/*`; `views/security_center.html` | rebuild | R1/R8 | R1.14, R8.3 | tested | R1 completion/audit reports | full enrollment/rotation/revocation proof | O-10 | local trust must not bypass |
| CUR-006 | W0 CRUD engine | `platform/server/crud-engine.js`; `vnext/server/crud/crud-engine.js` | rebuild | R1 | R1.1 | legacy-only | demo/engine exists | real page CRUD + ACL | — | W0 is feasibility evidence |
| CUR-007 | W0 ACL/row scope | `platform/server/acl.js`; `vnext/server/acl/acl-engine.js` | rebuild | R1 | R1.2 | legacy-only | isolated harness evidence | cross-company HTTP deny proof | — | backend authority |
| CUR-008 | W0 chatter/attachments | `platform/server/chatter.js`; `vnext/server/chatter/chatter.js` | rebuild | R1 | R1.6 | legacy-only | demo/harness only | record-level thread + attachment ACL | — | event layer required |
| CUR-009 | W0 approvals | `platform/server/approvals.js`; `vnext/server/approvals/approvals.js` | rebuild | R1 | R1.9 | legacy-only | partial queues documented in R1 audit | nine-queue acceptance | — | do not call demo accepted |
| CUR-010 | W0 audit/history | `platform/server/audit.js`; `vnext/server/audit/audit.js` | rebuild | R1 | R1.4 | legacy-only | engine files exist | immutable before/after audit | — | ledger links required |
| CUR-011 | W0 numbering | `platform/server/sequences.js`; `modules/sequence-service.js` | rebuild | R1 | R1.4 | legacy-only | code/harness evidence | concurrent per-company proof | — | offline numbers need explicit policy |
| CUR-012 | W0 workflow/views/notify/print | `platform/server/workflow.js`, `views-fields.js`, `notify.js`, `print-templates.js` | rebuild | R1 | R1.7, R1.8, R1.11 | legacy-only | isolated engines | end-to-end page acceptance | — | consolidate duplicates |
| CUR-013 | Finance and cashbox | `modules/finance-ui.js`, `finance-close.js`, `cashbox.js`; `views/finance.html`, `cashbox.html` | rebuild | R2 | R2.1–R2.7 | legacy-only | mutable legacy JSON | reconciliation tolerance 0 | O-2 | no offline posting |
| CUR-014 | Finance installments/AR/AP/income | `modules/finance-installments.js`; `views/finance_installments.html`, `ar_ap.html`, `income.html` | rebuild | R2/R3 | R2.6, R3.2 | legacy-only | legacy pages only | GL-backed document proof | O-2 | source-specific fiscal docs |
| CUR-015 | Banking/tax/compliance | `views/banking.html`, `tax_compliance.html`; `modules/tax-compliance.js` | rebuild | R2 | R2.3, R2.8 | legacy-only | client surface only | Iraq pack and tax tests | — | server rules |
| CUR-016 | Inventory/locations/barcode | `views/inventory.html`, `mobile_inventory_count.html`, `logistics.html`; `modules/inventory-deepening.js` | rebuild | R2/R3 | R2.5, R3.4 | legacy-only | JSON/client state | SLE/valuation/replenishment proof | — | selective offline only |
| CUR-017 | Procurement/suppliers | `views/procurement.html`, `supplier_portal.html`; `modules/procurement.js` | rebuild | R3 | R3.3 | legacy-only | page/module only | RFQ→PO→receipt→bill | — | |
| CUR-018 | Sales/CRM/customers | `views/sales.html`, `customers.html`, `contracts.html`; `modules/sales-crm.js`, `sales-contracts.js` | rebuild | R3 | R3.2 | legacy-only | legacy page/module | quote→order→delivery→invoice | — | |
| CUR-019 | Sales pricing/commission | `views/sales_price_lists.html`, `sales_commission.html`; `modules/sales-price-lists.js`, `sales-commission.js` | rebuild | R3/R6 | R3.1, R6.3 | legacy-only | legacy surface | pricing/commission fixtures | — | |
| CUR-020 | POS and POS deepening | `views/pos.html`, `pos_deepening.html`; `modules/pos.js`, `pos-deepening.js` | rebuild | R6 | R6.1 | legacy-only | legacy POS only | exact replay/session close | O-10 | only declared offline commit |
| CUR-021 | Products/loyalty | `views/loyalty.html`; `modules/loyalty.js` | rebuild | R3/R6 | R3.1, R6.3 | legacy-only | page/module only | cross-channel accrual/redemption | — | |
| CUR-022 | Appointments/calendar | `views/appointments.html`, `calendar.html`; `modules/appointments.js` | rebuild | R5/R6 | R6.5 | legacy-only | legacy page/module | booking/resource conflict tests | — | |
| CUR-023 | Projects/tasks/kanban | `views/projects.html`, `task_manager.html`, `kanban.html`; `modules/project-management.js`, `task-manager.js`, `kanban.js` | rebuild | R3/R5 | R3.7, R5.1 | legacy-only | page/module only | service lifecycle + worklists | — | project timesheets separate from payroll |
| CUR-024 | Work orders/MRP/machines/QC | `views/work_orders.html`, `mrp.html`, `machines.html`, `qc_center.html`; `modules/work-orders.js`, `mrp.js`, `mrp-work-orders.js`, `machine-management.js`, `page-qc.js` | rebuild | R3/R7 | R3.5, R7.4 | legacy-only | legacy workflow exists | BOM→WO→QC/CAPA | — | |
| CUR-025 | Operation packs/workflow studio | `views/op_packs.html`, `workflow.html`; `modules/op-packs.js`, `workflow-studio.js` | rebuild | R4/R7 | R4.2, R7.1 | legacy-only | draw/simulate surface | governed reusable execution | — | see REC-005 |
| CUR-026 | SOP library | `views/sop.html`; `modules/page-sop.js`, `sop-issues-ai-index.js` | rebuild | R3/R4 | R3.5, R4.2 | legacy-only | version/approval/diff only | acknowledgment + pinned version | — | see REC-001 |
| CUR-027 | Workshop ledger/frontline/TV/AI | `views/workshop_ledger.html`, `workshop_tv.html`; `modules/workshop-ledger.js`, `workshop-frontline.js`, `workshop-ai.js` | rebuild | R7/R9 | R7.1, R9.2 | legacy-only | legacy surfaces | frontline event/sync proof | O-10 | |
| CUR-028 | Events | `views/events.html`; `modules/events.js` | merge | R6/R9 | R6.5, R9.2 | legacy-only | basic event/ticket flow | guided package scenario | — | no EventOS product |
| CUR-029 | Marketing/communications/WhatsApp/Telegram | `views/marketing.html`, `omni_communications.html`, `whatsapp.html`, `telegram.html`; `modules/marketing.js`, `omni-communications.js`, `whatsapp-integration.js` | preserve/rebuild | R1/R6 | R1.8, R6.7 | legacy-only | webhook/text foundation | media/transcription + policy proof | O-10 | see REC-006 |
| CUR-030 | Documents/eSign/knowledge/manual/training | `views/documents.html`, `esign.html`, `knowledge.html`, `knowledge_base.html`, `help_manual.html`, `training_lms.html`; matching modules | rebuild | R5/R7 | R5.1, R7.1 | legacy-only | pages/modules only | document ACL, training evidence | — | SOP acknowledgment links |
| CUR-031 | Analytics/reports/NL reporting | `views/analytics.html`, `report.html`, `nl_reports.html`, `data_quality.html`, `intelligence.html`; matching modules | rebuild | R4/R5 | R4.5, R5.3 | legacy-only | snapshots/recommendations exist | historical metric register | — | see REC-004 |
| CUR-032 | Admin/settings/automation/approvals | `views/admin_panel.html`, `system_settings.html` via `vnext_platform.html`, `automation.html`, `approvals.html`, `manager_approvals.html`; matching modules | rebuild | R1/R4 | R1.9, R4.1 | legacy-only | mixed legacy/W0 | policy/audit/rollback proof | — | see REC-002 |
| CUR-033 | Route health/system check/deploy readiness | `views/route_health.html`, `deploy_ready.html`; `modules/route-health.js`, `system-check.js`, `phase7a-stabilization.js` | strengthen | R10 | R10.4 | tested | static/self-test evidence | interactive route + security audit | — | static inventory is not browser proof |
| CUR-034 | Assets/equipment/maintenance/warranty | `views/assets.html`, `equipment.html`, `warranty.html`; matching modules | rebuild | R7 | R7.5 | legacy-only | page/module only | depreciation + PM + warranty | — | |
| CUR-035 | Fleet/field service/rental | `views/fleet.html`, `field_service.html`, `rental.html`; matching modules | merge/rebuild | R3/R7/R9 | R3.7, R7.5, R9.3 | legacy-only | legacy pages only | SLA/asset/pack scenarios | — | |
| CUR-036 | Vertical retail/restaurant/pharmacy/clinic/hotel/real estate | `views/retail.html`, `restaurant.html`, `pharmacy.html`, `clinic.html`, `hotel.html`, `real-estate.html`; vertical modules | pack | R9 | R9.3 | legacy-only | page shells only | conformance suites, no core changes | O-5 | |
| CUR-037 | Subscriptions/expenses/surveys/visitors | `views/subscriptions.html`, `expenses.html`, `surveys.html`, `visitors.html`; matching modules | rebuild | R5/R6 | R5.5, R6.2, R6.4 | legacy-only | page/module only | lifecycle + portal evidence | — | |
| CUR-038 | Command center/AI tools/queue/status/factory | `views/command_center.html`, `ai_tools.html`, `ai_queue.html`, `ai_status.html`, `ai_factory.html`; Jarvis modules | preserve/adapt | R4/R7 | R4.5, R7.1 | legacy-only | governed production pattern | registered-tool/approval/audit proof | — | AI remains deterministic/gated |
| CUR-039 | VNext platform/integration/device center | `views/vnext_platform.html`, `integration_hub.html`, `device_center.html`; `modules/vnext-platform.js`, data providers | rebuild | R1/R8 | R1.12, R8.4 | legacy-only | platform spike/demo | real route + tenant/adapter proof | O-10 | |
| CUR-040 | Admin/customer/supplier portals | `views/customer_portal.html`, `supplier_portal.html`, `admin_panel.html` | rebuild | R6/R8 | R6.4, R8.2 | legacy-only | shell pages only | cross-tenant portal denial | — | |

+## A.1 Explicit page-level register

Every current VNext view file is represented below. These rows complement the capability-group rows above and intentionally remain conservative.

| Capability ID | Capability | Source/evidence | Disposition | Target release | Target epic/task | Current status | Implementation evidence | Acceptance evidence | Owner decision | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| CUR-P001 | admin panel page | `octagon-erp-commercial-vnext/views/admin_panel.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P002 | ai factory page | `octagon-erp-commercial-vnext/views/ai_factory.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P003 | ai queue page | `octagon-erp-commercial-vnext/views/ai_queue.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P004 | ai status page | `octagon-erp-commercial-vnext/views/ai_status.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P005 | ai tools page | `octagon-erp-commercial-vnext/views/ai_tools.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P006 | analytics page | `octagon-erp-commercial-vnext/views/analytics.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P007 | appointments page | `octagon-erp-commercial-vnext/views/appointments.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P008 | ar ap page | `octagon-erp-commercial-vnext/views/ar_ap.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P009 | assets page | `octagon-erp-commercial-vnext/views/assets.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P010 | automation page | `octagon-erp-commercial-vnext/views/automation.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P011 | banking page | `octagon-erp-commercial-vnext/views/banking.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P012 | budgeting page | `octagon-erp-commercial-vnext/views/budgeting.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P013 | calculator page | `octagon-erp-commercial-vnext/views/calculator.html` | preserve | R10 | R10.2 | legacy-only | page exists only | target task acceptance required | O-3 | page existence is not VNext acceptance |
| CUR-P014 | calendar page | `octagon-erp-commercial-vnext/views/calendar.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P015 | cashbox page | `octagon-erp-commercial-vnext/views/cashbox.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P016 | clinic page | `octagon-erp-commercial-vnext/views/clinic.html` | pack | R9 | R9.3 | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P017 | command center page | `octagon-erp-commercial-vnext/views/command_center.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P018 | contracts page | `octagon-erp-commercial-vnext/views/contracts.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P019 | customer portal page | `octagon-erp-commercial-vnext/views/customer_portal.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P020 | customers page | `octagon-erp-commercial-vnext/views/customers.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P021 | data quality page | `octagon-erp-commercial-vnext/views/data_quality.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P022 | deploy ready page | `octagon-erp-commercial-vnext/views/deploy_ready.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P023 | device center page | `octagon-erp-commercial-vnext/views/device_center.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P024 | documents page | `octagon-erp-commercial-vnext/views/documents.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P025 | employee mobile page | `octagon-erp-commercial-vnext/views/employee_mobile.html` | preserve | R10 | R10.2 | legacy-only | page exists only | target task acceptance required | O-3 | page existence is not VNext acceptance |
| CUR-P026 | employee ui page | `octagon-erp-commercial-vnext/views/employee_ui.html` | preserve | R10 | R10.2 | legacy-only | page exists only | target task acceptance required | O-3 | page existence is not VNext acceptance |
| CUR-P027 | employees page | `octagon-erp-commercial-vnext/views/employees.html` | preserve | R10 | R10.2 | legacy-only | page exists only | target task acceptance required | O-3 | page existence is not VNext acceptance |
| CUR-P028 | equipment page | `octagon-erp-commercial-vnext/views/equipment.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P029 | esign page | `octagon-erp-commercial-vnext/views/esign.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P030 | events page | `octagon-erp-commercial-vnext/views/events.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P031 | expenses page | `octagon-erp-commercial-vnext/views/expenses.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P032 | field service page | `octagon-erp-commercial-vnext/views/field_service.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P033 | finance page | `octagon-erp-commercial-vnext/views/finance.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P034 | finance installments page | `octagon-erp-commercial-vnext/views/finance_installments.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P035 | fleet page | `octagon-erp-commercial-vnext/views/fleet.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P036 | help manual page | `octagon-erp-commercial-vnext/views/help_manual.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P037 | helpdesk page | `octagon-erp-commercial-vnext/views/helpdesk.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P038 | home page | `octagon-erp-commercial-vnext/views/home.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P039 | hotel page | `octagon-erp-commercial-vnext/views/hotel.html` | pack | R9 | R9.3 | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P040 | import page | `octagon-erp-commercial-vnext/views/import.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P041 | income page | `octagon-erp-commercial-vnext/views/income.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P042 | integration hub page | `octagon-erp-commercial-vnext/views/integration_hub.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P043 | intelligence page | `octagon-erp-commercial-vnext/views/intelligence.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P044 | inventory page | `octagon-erp-commercial-vnext/views/inventory.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P045 | kanban page | `octagon-erp-commercial-vnext/views/kanban.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P046 | kiosk page | `octagon-erp-commercial-vnext/views/kiosk.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | O-10 | page existence is not VNext acceptance |
| CUR-P047 | knowledge page | `octagon-erp-commercial-vnext/views/knowledge.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P048 | knowledge base page | `octagon-erp-commercial-vnext/views/knowledge_base.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P049 | logistics page | `octagon-erp-commercial-vnext/views/logistics.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P050 | loyalty page | `octagon-erp-commercial-vnext/views/loyalty.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P051 | machines page | `octagon-erp-commercial-vnext/views/machines.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P052 | manager approvals page | `octagon-erp-commercial-vnext/views/manager_approvals.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P053 | marketing page | `octagon-erp-commercial-vnext/views/marketing.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P054 | mobile inventory count page | `octagon-erp-commercial-vnext/views/mobile_inventory_count.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P055 | mrp page | `octagon-erp-commercial-vnext/views/mrp.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P056 | multi entity page | `octagon-erp-commercial-vnext/views/multi_entity.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P057 | nl reports page | `octagon-erp-commercial-vnext/views/nl_reports.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P058 | omni communications page | `octagon-erp-commercial-vnext/views/omni_communications.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P059 | op packs page | `octagon-erp-commercial-vnext/views/op_packs.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P060 | people ops page | `octagon-erp-commercial-vnext/views/people_ops.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P061 | pharmacy page | `octagon-erp-commercial-vnext/views/pharmacy.html` | pack | R9 | R9.3 | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P062 | pos page | `octagon-erp-commercial-vnext/views/pos.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | O-10 | page existence is not VNext acceptance |
| CUR-P063 | pos deepening page | `octagon-erp-commercial-vnext/views/pos_deepening.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | O-10 | page existence is not VNext acceptance |
| CUR-P064 | procurement page | `octagon-erp-commercial-vnext/views/procurement.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P065 | projects page | `octagon-erp-commercial-vnext/views/projects.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P066 | qc center page | `octagon-erp-commercial-vnext/views/qc_center.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P067 | real-estate page | `octagon-erp-commercial-vnext/views/real-estate.html` | pack | R9 | R9.3 | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P068 | receipt page | `octagon-erp-commercial-vnext/views/receipt.html` | preserve | R10 | R10.2 | legacy-only | page exists only | target task acceptance required | O-3 | page existence is not VNext acceptance |
| CUR-P069 | rental page | `octagon-erp-commercial-vnext/views/rental.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P070 | report page | `octagon-erp-commercial-vnext/views/report.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P071 | restaurant page | `octagon-erp-commercial-vnext/views/restaurant.html` | pack | R9 | R9.3 | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P072 | retail page | `octagon-erp-commercial-vnext/views/retail.html` | pack | R9 | R9.3 | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P073 | risk compliance page | `octagon-erp-commercial-vnext/views/risk_compliance.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P074 | route health page | `octagon-erp-commercial-vnext/views/route_health.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P075 | sales page | `octagon-erp-commercial-vnext/views/sales.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P076 | sales commission page | `octagon-erp-commercial-vnext/views/sales_commission.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P077 | sales contracts page | `octagon-erp-commercial-vnext/views/sales_contracts.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P078 | sales price lists page | `octagon-erp-commercial-vnext/views/sales_price_lists.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P079 | scenario planner page | `octagon-erp-commercial-vnext/views/scenario_planner.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P080 | security center page | `octagon-erp-commercial-vnext/views/security_center.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P081 | sop page | `octagon-erp-commercial-vnext/views/sop.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P082 | subscriptions page | `octagon-erp-commercial-vnext/views/subscriptions.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P083 | supplier portal page | `octagon-erp-commercial-vnext/views/supplier_portal.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P084 | surveys page | `octagon-erp-commercial-vnext/views/surveys.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P085 | task manager page | `octagon-erp-commercial-vnext/views/task_manager.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P086 | tax compliance page | `octagon-erp-commercial-vnext/views/tax_compliance.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P087 | telegram page | `octagon-erp-commercial-vnext/views/telegram.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P088 | timesheet page | `octagon-erp-commercial-vnext/views/timesheet.html` | preserve | R10 | R10.2 | legacy-only | page exists only | target task acceptance required | O-3 | page existence is not VNext acceptance |
| CUR-P089 | training lms page | `octagon-erp-commercial-vnext/views/training_lms.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P090 | visitors page | `octagon-erp-commercial-vnext/views/visitors.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P091 | vnext platform page | `octagon-erp-commercial-vnext/views/vnext_platform.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P092 | warranty page | `octagon-erp-commercial-vnext/views/warranty.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P093 | wfl home page | `octagon-erp-commercial-vnext/views/wfl_home.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P094 | whatsapp page | `octagon-erp-commercial-vnext/views/whatsapp.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | O-10 | page existence is not VNext acceptance |
| CUR-P095 | work orders page | `octagon-erp-commercial-vnext/views/work_orders.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P096 | workflow page | `octagon-erp-commercial-vnext/views/workflow.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |
| CUR-P097 | workshop ledger page | `octagon-erp-commercial-vnext/views/workshop_ledger.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | O-10 | page existence is not VNext acceptance |
| CUR-P098 | workshop tv page | `octagon-erp-commercial-vnext/views/workshop_tv.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | O-10 | page existence is not VNext acceptance |
| CUR-P099 | approvals page | `octagon-erp-commercial-vnext/views/approvals.html` | rebuild | R1–R8 | mapped CUR capability | legacy-only | page exists only | target task acceptance required | — | page existence is not VNext acceptance |

## B. Canonical roadmap epic coverage

Each canonical epic is represented even when its current implementation evidence is absent or partial.

| Capability ID | Capability | Source/evidence | Disposition | Target release | Target epic/task | Current status | Implementation evidence | Acceptance evidence | Owner decision | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| EP-R0.1 | VNext fork and environment isolation | `OCTAGON_VNEXT_MASTER_ROADMAP.md` §R0.1; `R0_COMPLETION_REPORT.md` | preserve | R0 | R0.1/T0.1 | accepted | completion report | isolation/SHA evidence linked | O-1 | completed evidence unchanged |
| EP-R0.2 | Licensing governance/notices | roadmap §R0.2 | preserve | R0 | R0.2 | tested | notices/provenance reports | lint + attribution review | O-6 | clean-room law |
| EP-R0.3 | Legacy compatibility adapters | roadmap §R0.3; `vnext/server/compat/` | preserve | R0 | R0.3 | tested | adapter harness/report | frozen read-only proof | O-3 | |
| EP-R0.4 | Database/migration architecture | roadmap §R0.4 | rebuild | R0/R1 | R0.4 | tested | migration reports | scope/rollback proof | O-10 | adapter boundary |
| EP-R1.1 | Collection registry/config CRUD | roadmap §R1.1; `R1_COMPLETION_REPORT.md` corrected 19-task matrix and §6 kernel demo | rebuild | R1 | R1.1 | accepted | `octagon-analysis/R1_COMPLETION_REPORT.md`; `octagon-erp-commercial-vnext/scripts/test-vnext-kernel-completion.mjs` | live `crm_lead` CRUD, filters, numbering, zero HTTP 500s | — | legacy page rows remain separate |
| EP-R1.2 | Backend ACL/row scopes/field security | roadmap §R1.2; `R1_COMPLETION_REPORT.md` §§4,6,7 | rebuild | R1 | R1.2 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-vnext-kernel-completion.mjs`; Lane B/D suites | 403 deny, field masking, cross-company HTTP isolation | — | no loopback bypass |
| EP-R1.3 | Document lifecycle/state engine | roadmap §R1.3; `R1_COMPLETION_REPORT.md` corrected matrix | rebuild | R1 | R1.3 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-lane-a-completion.mjs` | full-graph transitions, maker-checker, posted immutability, reversal | — | |
| EP-R1.4 | Numbering/audit/history | roadmap §R1.4; `R1_COMPLETION_REPORT.md` §§5a,6,7 | rebuild | R1 | R1.4 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-vnext-kernel-completion.mjs`; Lane C suite | sequence/hash proof, live audit diffs, history drawer | — | |
| EP-R1.5 | Custom/snapshot fields | roadmap §R1.5; `R1_COMPLETION_REPORT.md` §§6,7 | rebuild | R1 | R1.5 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-lane-c-completion.mjs` | snapshot survives source changes and posted immutability | — | |
| EP-R1.6 | Chatter/followers/activities/attachments | roadmap §R1.6; `R1_COMPLETION_REPORT.md` §§4,6,7 | rebuild | R1 | R1.6 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-lane-b-completion.mjs` | mentions, notification, authorized attachment, unauthorized 403 | — | realtime transport is not retroactively accepted; T2.O10.1 delivers it |
| EP-R1.7 | Saved views/worklists | roadmap §R1.7; `R1_COMPLETION_REPORT.md` §§4,6,7 | rebuild | R1 | R1.7 | accepted | `R1_COMPLETION_REPORT.md`; Lane B worklist suite | scoped own/dept/all counts and live worklist endpoint | — | |
| EP-R1.8 | Notification center | roadmap §R1.8; `R1_COMPLETION_REPORT.md` §§4,6,7 | rebuild | R1 | R1.8 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-lane-c-completion.mjs` | notification preferences and workflow notify pass; realtime event transport is delivered by T2.O10.1 | O-10 | R1 closed before O-10; polling is fallback only |
| EP-R1.9 | Universal approvals/Approval Center | roadmap §R1.9; `R1_COMPLETION_REPORT.md` corrected matrix and §5b | rebuild | R1 | R1.9 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-lane-b-completion.mjs` | nine queues, maker-checker, escalation/withdraw, browser rendering | — | |
| EP-R1.10 | Import/export/template print | roadmap §R1.10; `R1_COMPLETION_REPORT.md` corrected matrix | rebuild | R1 | R1.10 | accepted | `R1_COMPLETION_REPORT.md`; Lane A suite | 500-row import/error report and Arabic print evidence | — | |
| EP-R1.11 | Workflow/automation engine | roadmap §R1.11; `R1_COMPLETION_REPORT.md` §§2,6,7 | rebuild | R1/R4 | R1.11 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-blocker3-workflow-recovery.mjs`; kernel suite | once-only trigger, retry/resume, loop/rate guard, notification | — | REC-005 remains future composition scope |
| EP-R1.12 | Extension/module framework | roadmap §R1.12; `R1_COMPLETION_REPORT.md` §§6,7 | rebuild | R1 | R1.12 | accepted | `R1_COMPLETION_REPORT.md`; Lane D suite | install/uninstall zero residue and conflict report | — | |
| EP-R1.13 | Organization/fiscal structures | roadmap §R1.13; `R1_COMPLETION_REPORT.md` §§5b,6,7 | rebuild | R1 | R1.13 | accepted | `R1_COMPLETION_REPORT.md`; `scripts/test-lane-d-completion.mjs` | fiscal-year generation, company switcher, cross-company isolation | — | hard R2 prerequisite now satisfied |
| EP-R1.14 | Identity/auth hardening | roadmap §R1.14; `R1_COMPLETION_REPORT.md` §§6,7,9 | rebuild | R1/R8 | R1.14 | accepted | `R1_COMPLETION_REPORT.md`; Lane D Suite C; `scripts/test-live-session-rotation-e2e.mjs` | password policy, TOTP enrollment, API keys, session rotation/revocation, Q2 bypass | O-10 | REC-008 remains production-closure linkage |
| EP-R2.1 | Immutable GL/fiscal documents | roadmap §R2.1; O-2; `VNEXT_PROGRESS.md` T2.1.1–T2.1.3 | rebuild | R2 | R2.1 | tested | `octagon-erp-commercial-vnext/VNEXT_PROGRESS.md:30-32`; `scripts/test-lane-finance-t2.1.1.mjs`; `scripts/test-lane-finance-t2.1.3.mjs` | balanced posting, reversal/TB/hash chain, dual-post reconciliation tolerance 0 | O-2 | release remains open |
| EP-R2.2 | Fiscal periods/locks/close | roadmap §R2.2; `VNEXT_PROGRESS.md` T2.2.1 | rebuild | R2 | R2.2 | tested | `octagon-erp-commercial-vnext/VNEXT_PROGRESS.md:33`; `scripts/test-lane-finance-t2.2.1.mjs` | module lock dates, close/reopen checklist, year-end entries | O-2 | |
| EP-R2.3 | Tax/repartition/withholding | roadmap §R2.3; `VNEXT_PROGRESS.md` T2.3.1 | rebuild | R2 | R2.3 | tested | `octagon-erp-commercial-vnext/VNEXT_PROGRESS.md:34`; `scripts/test-lane-finance-t2.3.1.mjs` | declarative tax types, repartition, fiscal positions, withholding, tax grids | O-2 | |
| EP-R2.4 | Accounting dimensions | roadmap §R2.4; `VNEXT_PROGRESS.md` T2.4.1 | rebuild | R2 | R2.4 | tested | `octagon-erp-commercial-vnext/VNEXT_PROGRESS.md:35`; `scripts/test-lane-finance-t2.4.1.mjs` | JSON distribution validation, required/blocked policy, dimension P&L | O-2 | |
| EP-R2.5 | Immutable stock/valuation | roadmap §R2.5; `VNEXT_PROGRESS.md` T2.5.1–T2.5.2 | rebuild | R2 | R2.5 | tested | `octagon-erp-commercial-vnext/VNEXT_PROGRESS.md:36,38`; `scripts/test-lane-stock-t2.5.1.mjs`; `scripts/test-lane-stock-t2.5.2.mjs` | strict immutable ledger, AVCO/FIFO, 20/20 regression, 19/19 focused suite, stock-to-GL idempotency/rollback | O-2 | release remains open |
| T2.O10.1 | Connectivity and Cross-Platform Foundation Retrofit | owner decision O-10; roadmap retrofit task; execution-plan retrofit task | rebuild | R2 checkpoint | T2.O10.1 | accepted | migration 607, authenticated filtered SSE with bounded replay, platform-only idempotent commands, scoped IndexedDB outbox/replay, connectivity UI, adapter boundary, PWA hardening, and notification/approval/workflow hooks; focused suite 11/11; browser desktop/mobile/offline evidence passed | external event/security review remains release-review work | O-10 | no sensitive offline commits |
| REL-R2 | R2 release gate | roadmap R2 exit; execution plan §7 | preserve | R2 | independent R2 gate | accepted | T2.1.1–T2.5.2, T2.O10.1, and R2.6–R2.8 evidence; 253/253 VNext focused assertions; permission 35/35; browser/PWA/security smoke passed | external release review required | O-2/O-10 | stop before R3 |
| EP-R2.6 | AR/AP/payments/reconciliation | roadmap §R2.6 | rebuild | R2 | R2.6 | accepted | migration 608; AR/AP/payments/allocations, FX gain/loss, bank statements, duplicate-safe imports, scoped match rules, manual/reversible reconciliation; focused R2 suite 27/27 | later commercial UX depth remains outside this R2 backend gate | O-2 | GL-backed reconciliation |
| EP-R2.7 | Financial reports | roadmap §R2.7 | rebuild | R2/R5 | R2.7 | accepted | ledger-derived TB/GL/BS/P&L/CF/partner/aging/tax/dimension reports, drill-through, CSV export; focused R2 suite 27/27; dimension regression 17/17 | comparative/report presentation depth may continue in R5 | — | REC-007 later depth |
| EP-R2.8 | Localization framework/Iraq pack | roadmap §R2.8 | rebuild | R2 | R2.8 | accepted | migration 609; installable configurable Iraq pack, bilingual terms, company isolation, uninstall guard; focused R2 suite 27/27 | no statutory rate invented where policy was absent | — | |
| EP-R3.1 | Product/pricing core | roadmap §R3.1 | rebuild | R3 | R3.1 | implemented | migrations 610/611/618; canonical product master; core 19/19; authenticated HTTP 25/25; rollback 8/8; record-scoped ACL proof | External remediation remains for 12+ precedence fixtures, conversion, variants, coupons, and usable operational forms | — | re-review pending |
| EP-R3.2 | Sales order pipeline | roadmap §R3.2 | rebuild | R3 | R3.2 | implemented | migrations 612/618; quote/order/reservation/delivery/backorder/invoice/return-credit flow; closure 29/29; authenticated Chrome 5/5 | External remediation remains for full authenticated operational E2E, payments, immutable price snapshots, and depth matrix | — | re-review pending |
| EP-R3.3 | Procurement/3-way match | roadmap §R3.3 | rebuild | R3 | R3.3 | implemented | migrations 613/618; receipt/bill/return/supplier-document records; derived three-way match closure; HTTP 25/25 | External remediation remains for RFQ comparison, scorecard, payments, and full operational UI matrix | — | re-review pending |
| EP-R3.4 | Inventory/routes/replenishment | roadmap §R3.4 | rebuild | R3 | R3.4 | implemented | migrations 614/618; route/reorder/putaway/pick/cycle records; ledger-backed idempotent pick/pack/ship closure; rollback 8/8 | External remediation remains for batch/serial, reservations, multi-step routes, and full stock UI acceptance | O-10 | re-review pending |
| EP-R3.5 | Manufacturing/workshop bridge | roadmap §R3.5 | rebuild | R3 | R3.5 | implemented | migrations 615/618; BOM/production/WIP/job-card/cost/reversal records; closure 29/29; legacy fixture bridge 3/3 | External remediation remains for multi-level BOM, scrap/byproducts, exact costing, full UI, and live legacy adapter proof | — | re-review pending |
| EP-R3.6 | Landed costs/subcontracting | roadmap §R3.6 | rebuild | R3 | R3.6 | implemented | migrations 616/618; landed-cost valuation GL/allocation/reversal with stock-value restoration; subcontract records; closure 29/29 | External remediation remains for reversal-lock depth and full supplied-component valuation | — | re-review pending |
| EP-R3.7 | Projects/services/helpdesk/SLA | roadmap §R3.7 | rebuild | R3 | R3.7 | implemented | migrations 617/618/620; project/timesheet/ticket/field-service records; explicit project billing; business-hours SLA pause/resume; authenticated Chrome 5/5 | External remediation remains for profitability, contract billing, full operational UI, and mobile domain flows | — | re-review pending |
| EP-R4.1 | Authority-limit approvals | roadmap §R4.1 | rebuild | R4 | R4.1 | planned | legacy approvals | policy matrix + audit | — | |
| EP-R4.2 | Workflow templates/worklists | roadmap §R4.2 | rebuild | R4 | R4.2 | planned | workflow studio only | reusable controlled workflows | — | REC-005 |
| EP-R4.3 | Security hardening audit | roadmap §R4.3 | strengthen | R4/R10 | R4.3 | planned | audit docs | row/field/menu coverage | O-10 | |
| EP-R4.4 | Collaboration/activity wiring | roadmap §R4.4 | rebuild | R4 | R4.4 | planned | chatter spike | event/subscription proof | O-10 | |
| EP-R4.5 | Governed AI operating layer | roadmap §R4.5 | preserve/adapt | R4 | R4.5 | partial | server AI governance | tool preview/approval/idempotency | — | |
| EP-R5.1 | Config-CRUD/entity studio | roadmap §R5.1 | rebuild | R5 | R5.1 | planned | config pages/spike | zero-code entity acceptance | — | |
| EP-R5.2 | Custom/formula fields | roadmap §R5.2 | rebuild | R5 | R5.2 | planned | partial legacy | formula/snapshot tests | — | |
| EP-R5.3 | Report designer/dashboards | roadmap §R5.3 | rebuild | R5 | R5.3 | planned | dashboard pages | data-backed designer | — | REC-004 |
| EP-R5.4 | Template print/public forms | roadmap §R5.4 | rebuild | R5 | R5.4 | planned | print engines | RTL output/ACL | — | |
| EP-R5.5 | HR additive suite | roadmap §R5.5 | rebuild | R5 | R5.5 | planned | people pages | frozen-safe leave/ATS/expense | O-3 | |
| EP-R6.1 | POS v2/offline/self-order | roadmap §R6.1 | rebuild | R6 | R6.1 | tested | `vnext/server/modules/pos/`, migration 631, `/api/x/pos`, `/api/vnext/commands` `pos.sale`, offline-store allowlist | 13/13 focused PASS; exact replay, scope, refund, self-order draft, Z-report GL, migration down | O-10 | R6.1 focused gate passed; R6.2–R6.7 unstarted |
| EP-R6.2 | Subscriptions/dunning | roadmap §R6.2 | rebuild | R6 | R6.2 | planned | subscriptions page | billing/dunning GL proof | — | |
| EP-R6.3 | Loyalty/membership | roadmap §R6.3 | rebuild | R6 | R6.3 | planned | loyalty page | cross-channel proof | — | |
| EP-R6.4 | Customer/vendor portals | roadmap §R6.4 | rebuild | R6 | R6.4 | planned | portal pages | tenant/role isolation | — | |
| EP-R6.5 | Appointments/resources | roadmap §R6.5 | rebuild | R6 | R6.5 | planned | appointments page | conflict and notification proof | — | |
| EP-R6.6 | eCommerce foundation | roadmap §R6.6 | rebuild | R6 | R6.6 | planned | connectors/page shell | cart/order/payment boundary | — | |
| EP-R6.7 | Omni-communications | roadmap §R6.7 | preserve/rebuild | R6 | R6.7 | partial | WhatsApp webhook/text foundation | media/transcription policy | O-10 | REC-006 |
| EP-R7.1 | Shop-floor terminals | roadmap §R7.1 | rebuild | R7 | R7.1 | planned | kiosk/TV pages | event/sync/offline capture | O-10 | |
| EP-R7.2 | OEE/downtime/Andon | roadmap §R7.2 | rebuild | R7 | R7.2 | planned | workshop surfaces | live event + metrics | O-10 | |
| EP-R7.3 | Production planning/MPS | roadmap §R7.3 | rebuild | R7 | R7.3 | planned | scenario/planning pages | capacity fixtures | — | |
| EP-R7.4 | Quality/NCR/CAPA | roadmap §R7.4 | rebuild | R7 | R7.4 | planned | QC page/module | inspection/NCR/CAPA | — | |
| EP-R7.5 | Maintenance/assets v2 | roadmap §R7.5 | rebuild | R7 | R7.5 | planned | asset/equipment pages | depreciation/PM/MTBF | — | |
| EP-R8.1 | Multi-company/consolidation | roadmap §R8.1 | rebuild | R8 | R8.1 | planned | multi-entity page | tenant/company isolation | O-10 | |
| EP-R8.2 | Tenancy/editions/licensing | roadmap §R8.2 | rebuild | R8 | R8.2 | planned | tenant service/flags | cross-tenant route suite | O-4 | |
| EP-R8.3 | SSO/advanced identity | roadmap §R8.3 | rebuild | R8 | R8.3 | planned | partial auth | production auth closure | O-10 | REC-008 |
| EP-R8.4 | Integration hub/APIs/events | roadmap §R8.4 | rebuild | R8 | R8.4 | planned | integration page | adapter/event/backpressure tests | O-10 | realtime baseline starts earlier |
| EP-R8.5 | Deployment/upgrades/support | roadmap §R8.5 | rebuild | R8/R10 | R8.5 | planned | launch docs | upgrade/rollback/support bundle | — | |
| EP-R9.1 | Pack SDK/conformance | roadmap §R9.1 | rebuild | R9 | R9.1 | planned | pack shells | no-core-change conformance | — | |
| EP-R9.2 | Workshop/advertising pack | roadmap §R9.2 | pack | R9 | R9.2 | planned | workshop pages | flagship pilot scenarios | O-3 | |
| EP-R9.3 | Vertical pack wave | roadmap §R9.3 | pack | R9 | R9.3 | planned | vertical pages | per-pack suites | O-5 | |
| EP-R9.4 | Marketplace/distribution | roadmap §R9.4 | rebuild | R9 | R9.4 | planned | marketplace shell | signed pack distribution | — | |
| EP-R10.1 | Data migration | roadmap §R10.1 | rebuild | R10 | R10.1 | planned | migration notes | idempotent cut-date reconciliation | O-2 | |
| EP-R10.2 | Frozen payroll compatibility | roadmap §R10.2 | preserve | R10 | R10.2 | planned | adapter fixtures | three golden months | O-3 | |
| EP-R10.3 | Pilot dual-run | roadmap §R10.3 | rebuild | R10 | R10.3 | planned | pilot docs | tenant sign-off | — | |
| EP-R10.4 | Security/performance validation | roadmap §R10.4 | strengthen | R10 | R10.4 | planned | self-tests/audits | security, event, sync, perf evidence | O-10 | |
| EP-R10.5 | Onboarding/docs/parity | roadmap §R10.5 | rebuild | R10 | R10.5 | planned | docs/pages | parity sign-off and ledger closure | — | |
| EP-R10.6 | GA release | roadmap §R10.6 | rebuild | R10 | R10.6 | planned | commercialization checklist | owner go/no-go | O-7 | |

## C. Donor capability coverage

The following rows mirror every capability row in `OCTAGON_VNEXT_COVERAGE_CROSSCHECK.md`; that document remains the source-level donor evidence.

| Capability ID | Capability | Source/evidence | Disposition | Target release | Target epic/task | Current status | Implementation evidence | Acceptance evidence | Owner decision | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| DON-O01 | Odoo account core | crosscheck §1/account | absorb | R2 | R2.1 | planned | no VNext GL proof | GL/reconcile suite | O-2 | clean-room |
| DON-O02 | Odoo tax repartition/report grids | crosscheck §1/tax | absorb | R2 | R2.3 | planned | — | tax fixtures | — | |
| DON-O03 | Odoo analytic distribution | crosscheck §1/analytic | absorb | R2 | R2.4 | planned | — | dimension posting | — | |
| DON-O04 | Odoo country packs | crosscheck §1/l10n | absorb/defer | R2/R9 | R2.8, R9.3 | deferred | Iraq not accepted | installable pack | — | individual countries later |
| DON-O05 | Odoo EDI/UBL/Peppol | crosscheck §1/account_edi | defer | R9+ | deferred register | deferred | — | mandate/export trigger | — | |
| DON-O06 | Odoo checks/QR/debit notes | crosscheck §1/payments | absorb/defer | R2/R9 | R2.6 | planned | — | QR/debit fixtures | — | checks later |
| DON-O07 | Odoo proprietary certificate/HR EDI | crosscheck §1/license | exclude | — | — | excluded | — | — | O-6 | OEEL license |
| DON-O08 | Odoo enterprise reports/assets/budgets/consolidation | crosscheck §1/enterprise-absent | absorb | R2/R8 | R2.7, R8.1 | planned | — | report/consolidation suite | O-4 | clean-room |
| DON-O09 | Odoo CRM/scoring | crosscheck §1/crm | absorb | R3 | R3.2 | planned | sales page only | lead/opportunity scoring | — | |
| DON-O10 | Odoo sale/quote templates/upsell | crosscheck §1/sale | absorb | R3 | R3.2 | planned | — | order pipeline | — | |
| DON-O11 | Odoo product variants/configurator/pricelists | crosscheck §1/product | absorb | R3 | R3.1 | planned | — | product/pricing suite | — | configurator UI later |
| DON-O12 | Odoo loyalty programs | crosscheck §1/loyalty | absorb | R6 | R6.3 | planned | loyalty page only | eight-program fixtures | — | |
| DON-O13 | Odoo POS/self-order/restaurant | crosscheck §1/POS | absorb/pack | R6/R9 | R6.1, R9.3 | planned | legacy POS only | exact replay/self-order | O-10 | |
| DON-O14 | Odoo website/eCommerce/abandoned cart | crosscheck §1/website | absorb/defer | R6 | R6.6 | planned | shell/connectors | cart/order proof | — | full CMS later |
| DON-O15 | Odoo mass mailing/SMS | crosscheck §1/marketing | absorb | R6 | R6.7 | planned | marketing page | channel/consent proof | O-10 | |
| DON-O16 | Odoo events | crosscheck §1/events | merge | R6/R9 | R9.2 | planned | events page | guided event package | — | |
| DON-O17 | Odoo livechat | crosscheck §1/livechat | defer | R9+ | deferred register | deferred | — | later webchat trigger | — | |
| DON-O18 | Odoo calendar/SMS | crosscheck §1/calendar | merge | R6 | R6.5 | planned | appointments page | resource conflicts | — | |
| DON-O19 | Odoo subscriptions/marketing automation/appointment | crosscheck §1/enterprise-absent | absorb | R6 | R6.2, R6.5 | planned | pages only | lifecycle suite | — | |
| DON-O20 | Odoo IAP/snailmail/digest | crosscheck §1/exclusions | exclude/defer | — | deferred register | excluded | — | — | — | IAP coupling/low value |
| DON-O21 | Odoo stock moves/quants/lots/routes | crosscheck §1/stock | absorb | R2/R3 | R2.5, R3.4 | planned | legacy stock | SLE/routes proof | — | |
| DON-O22 | Odoo stock valuation | crosscheck §1/stock_account | absorb | R2 | R2.5 | planned | — | FIFO/AVCO fixtures | — | |
| DON-O23 | Odoo purchase/requisitions/vendor prices | crosscheck §1/purchase | absorb | R3 | R3.3 | planned | procurement page | RFQ/PO proof | — | |
| DON-O24 | Odoo MRP/BOM/WO/OEE | crosscheck §1/mrp | absorb | R3/R7 | R3.5, R7.2 | planned | MRP pages | manufacturing/OEE | — | |
| DON-O25 | Odoo subcontracting | crosscheck §1/mrp_subcontracting | absorb | R3 | R3.6 | planned | — | cost/ledger proof | — | |
| DON-O26 | Odoo landed costs | crosscheck §1/stock_landed_costs | absorb | R3 | R3.6 | planned | — | landed-cost posting | — | |
| DON-O27 | Odoo repair | crosscheck §1/repair | pack | R9 | R9.2 | planned | warranty/repair shell | workshop repair scenario | — | |
| DON-O28 | Odoo maintenance | crosscheck §1/maintenance | merge | R7 | R7.5 | planned | maintenance pages | PM/asset proof | — | |
| DON-O29 | Odoo delivery/carriers | crosscheck §1/delivery | absorb/defer | R3/R9 | R3.2 | planned | — | fees now/connectors later | — | |
| DON-O30 | Odoo fleet/cost links | crosscheck §1/fleet | merge | R7 | R7.5 | planned | fleet page | asset/cost proof | — | |
| DON-O31 | Odoo barcode parser | crosscheck §1/barcodes | absorb | R3/R7 | R3.4, R7.1 | planned | barcode page | scan/stock proof | O-10 | |
| DON-O32 | Odoo quality/MPS/barcode app | crosscheck §1/enterprise-absent | absorb | R7 | R7.2, R7.4 | planned | QC/scenario shells | quality/MPS suite | — | |
| DON-O33 | Odoo HR versioning | crosscheck §1/hr | absorb | R5 | R5.5 | planned | employee pages only | dated VNext-field proof | O-3 | frozen boundary |
| DON-O34 | Odoo leave/accrual | crosscheck §1/hr_holidays | absorb | R5 | R5.5 | planned | people ops page | accrual/approval proof | O-3 | |
| DON-O35 | Odoo attendance/overtime | crosscheck §1/hr_attendance | exclude | — | — | excluded | frozen legacy only | no VNext write allowed | O-3 | |
| DON-O36 | Odoo recruitment/skills | crosscheck §1/recruitment/skills | absorb | R5 | R5.5 | planned | people ops page | ATS/skills proof | — | |
| DON-O37 | Odoo expense | crosscheck §1/hr_expense | merge | R5 | R5.5 | planned | expenses page | reimbursement posting | O-3 | |
| DON-O38 | Odoo project timesheet | crosscheck §1/hr_timesheet | absorb | R3 | R3.7 | planned | project pages | separate analytic cost line | O-3 | not payroll timesheet |
| DON-O39 | Odoo project | crosscheck §1/project | absorb | R3 | R3.7 | planned | project pages | milestones/billing | — | |
| DON-O40 | Odoo lunch/homeworking | crosscheck §1/low-value | exclude | — | — | excluded | — | — | — | scope |
| DON-O41 | Odoo payroll/appraisal/helpdesk/FSM/planning | crosscheck §1/enterprise-absent | absorb/merge | R3/R5 | R3.7, R5.5 | planned | legacy pages | service/HR-safe proof | O-3 | payroll stays frozen |
| DON-O42 | Odoo ORM/inheritance/view inheritance | crosscheck §1/platform | absorb concept | R1 | R1.12 | planned | module framework | extension lifecycle | — | no code copy |
| DON-O43 | Odoo rules/field groups/access | crosscheck §1/security | absorb concept | R1 | R1.2 | planned | ACL spike | server row/field proof | — | |
| DON-O44 | Odoo mail/chatter | crosscheck §1/mail | absorb | R1 | R1.6 | planned | chatter spike | collaboration/ACL | — | |
| DON-O45 | Odoo automation | crosscheck §1/base_automation | absorb | R1/R4 | R1.11, R4.2 | planned | workflow spike | durable retry/recovery | — | |
| DON-O46 | Odoo sequence/cron/resource | crosscheck §1/ir.sequence | absorb | R1 | R1.4, R1.11 | planned | sequence/scheduler modules | race/job/calendar tests | — | |
| DON-O47 | Odoo auth suite | crosscheck §1/auth | absorb | R1/R8 | R1.14, R8.3 | partial | auth partial | MFA/SSO/session proof | O-10 | |
| DON-O48 | Odoo portal/signup | crosscheck §1/portal | absorb | R6 | R6.4 | planned | portal shells | tenant isolation | — | |
| DON-O49 | Odoo bus websocket | crosscheck §1/bus | absorb baseline | R1/R8 | R1.8, R8.4 | planned | polling legacy only | WebSocket/SSE cursor proof | O-10 | not user-count gated |
| DON-O50 | Odoo IAP | crosscheck §1/iap | exclude | — | — | excluded | — | — | — | business model |
| DON-O51 | Odoo web/OWL/QWeb | crosscheck §1/web | exclude concept-only | — | — | excluded | — | — | — | vanilla PWA retained |
| DON-O52 | Odoo import | crosscheck §1/base_import | merge | R1 | R1.10 | planned | import page | schema/print tests | — | |
| DON-O53 | Odoo cloud/connectors | crosscheck §1/connectors | defer | R8 | R8.4 | deferred | connector shell | adapter/security proof | O-10 | |
| DON-O54 | Odoo Studio/documents/sign/knowledge | crosscheck §1/enterprise-absent | absorb | R5 | R5.1/R5.4 | planned | pages/modules only | config/document ACL | — | |
| DON-E01 | ERPNext Accounts | crosscheck §2/Accounts | absorb | R2 | R2.1–R2.7 | planned | — | GL/report fixtures | O-2 | clean-room |
| DON-E02 | ERPNext Stock | crosscheck §2/Stock | absorb | R2/R3 | R2.5, R3.4 | planned | — | SLE/bin/valuation | — | |
| DON-E03 | ERPNext Manufacturing | crosscheck §2/Manufacturing | absorb | R3/R7 | R3.5, R7.3 | planned | — | BOM/MPS proof | — | |
| DON-E04 | ERPNext Selling/Buying | crosscheck §2/Selling | absorb | R3 | R3.2/R3.3 | planned | — | order/procurement proof | — | |
| DON-E05 | ERPNext CRM | crosscheck §2/CRM | merge | R3 | R3.2 | planned | — | CRM lifecycle | — | |
| DON-E06 | ERPNext Projects | crosscheck §2/Projects | absorb | R3 | R3.7 | planned | — | activity-cost proof | O-3 | |
| DON-E07 | ERPNext Assets | crosscheck §2/Assets | absorb | R7 | R7.5 | planned | — | depreciation | — | |
| DON-E08 | ERPNext Quality | crosscheck §2/Quality | absorb | R7 | R7.4 | planned | — | NCR/CAPA | — | |
| DON-E09 | ERPNext Support | crosscheck §2/Support | absorb | R3 | R3.7 | planned | — | SLA/warranty | — | |
| DON-E10 | ERPNext Maintenance/Subcontracting | crosscheck §2/Maintenance | absorb | R3/R7 | R3.6/R7.5 | planned | — | maintenance/cost | — | |
| DON-E11 | ERPNext authorization rules | crosscheck §2/Setup | absorb | R1/R4 | R1.9/R4.1 | planned | — | amount-limit approval | — | |
| DON-E12 | ERPNext regional/EDI | crosscheck §2/Regional | defer | R9 | R9.3 | deferred | — | per-market trigger | — | |
| DON-E13 | ERPNext telephony/communication/portal/cart/bulk/Plaid | crosscheck §2/other | defer/exclude | R6/R8 | R6.4/R8.4 | deferred | — | connector/market proof | — | Plaid excluded |
| DON-R01 | RuoYi system users/roles/menus/tenant/notify | crosscheck §3/system | absorb | R1/R8 | R1.2/R1.8/R8.2 | planned | ACL/admin pages | tenant/role suite | O-10 | |
| DON-R02 | RuoYi infra codegen/forms/jobs/files/monitoring | crosscheck §3/infra | absorb/defer | R1/R5 | R1.10/R5.1 | planned | — | file/job/config tests | — | codegen later |
| DON-R03 | RuoYi BPM/Approval Center/delegation | crosscheck §3/bpm | absorb | R1/R4 | R1.9/R4.1 | planned | partial queues | full approval suite | — | |
| DON-R04 | RuoYi pay/wallet | crosscheck §3/pay | absorb/defer | R2/R9 | R2.6 | planned | — | payment abstraction | — | wallet later |
| DON-R05 | RuoYi member loyalty | crosscheck §3/member | merge | R6 | R6.3 | planned | loyalty page | points/levels | — | |
| DON-R06 | RuoYi mall promotions/social commerce | crosscheck §3/mall | merge/defer | R3/R9 | R3.1/R9.3 | deferred | — | coupon now; mechanics later | — | |
| DON-R07 | RuoYi CRM high-seas/receivables | crosscheck §3/crm | absorb | R3 | R3.2 | planned | sales page | pool/AR plan | — | |
| DON-R08 | RuoYi simple ERP | crosscheck §3/erp | exclude | — | — | excluded | — | — | — | deeper donors win |
| DON-R09 | RuoYi AI/RAG/workflow/gateway | crosscheck §3/ai | merge | R4 | R4.5 | partial | Jarvis governance | tool gate proof | — | |
| DON-R10 | RuoYi WeChat OA | crosscheck §3/mp | exclude | — | — | excluded | — | — | — | market-specific |
| DON-R11 | RuoYi report designer | crosscheck §3/report | absorb | R5 | R5.3 | planned | report pages | designer tests | — | |
| DON-R12 | RuoYi IM/sensitive words | crosscheck §3/im | defer | R9+ | deferred register | deferred | — | later comms policy | — | |
| DON-R13 | RuoYi IoT | crosscheck §3/iot | defer | R9+ | deferred register | deferred | device page | device depth later | O-10 | |
| DON-R14 | RuoYi MES | crosscheck §3/mes | absorb | R7 | R7.1/R7.2 | planned | workshop pages | OEE/Andon proof | O-10 | |
| DON-R15 | RuoYi WMS | crosscheck §3/wms | merge | R3/R7 | R3.4/R7.1 | planned | inventory/barcode pages | WMS/barcode proof | O-10 | |
| DON-N01 | NocoBase collections/resourcer/ACL | crosscheck §4/core | absorb concept | R1 | R1.1/R1.2 | planned | W0 spike | zero-code/ACL proof | O-6 | clean-room until license resolved |
| DON-N02 | NocoBase workflow processor | crosscheck §4/workflow | absorb | R1/R4 | R1.11/R4.2 | planned | workflow spike | durable processor | — | |
| DON-N03 | NocoBase UI schema/Formily | crosscheck §4/ui-schema | absorb concept | R5 | R5.1 | planned | — | schema UI | O-6 | runtime not copied |
| DON-N04 | NocoBase sequence/snapshot/formula/signature/encryption | crosscheck §4/fields | absorb | R1/R5 | R1.4/R1.5 | planned | — | field library tests | — | |
| DON-N05 | NocoBase import/export/bulk/duplicate/print | crosscheck §4/actions | absorb | R1/R5 | R1.10/R5.4 | planned | import/print shells | action/ACL tests | — | |
| DON-N06 | NocoBase kanban/calendar/gantt/map/charts | crosscheck §4/blocks | absorb | R5 | R5.3 | planned | pages only | block rendering/data tests | — | |
| DON-N07 | NocoBase auth/OIDC/SAML/CAS/LDAP/2FA/API keys | crosscheck §4/auth | absorb | R1/R8 | R1.14/R8.3 | planned | partial auth | security suite | O-10 | |
| DON-N08 | NocoBase external data sources | crosscheck §4/data-source | defer | R8+ | deferred register | deferred | — | adapter trigger | O-10 | |
| DON-N09 | NocoBase multi-app/space/supervisor | crosscheck §4/multi-app | merge | R8 | R8.2 | planned | tenant shell | isolation suite | O-4 | |
| DON-N10 | NocoBase audit/history/backup/migration/tasks/telemetry | crosscheck §4/ops | absorb | R0/R1/R8 | R0.4/R1.4/R8.5 | planned | partial ops | audit/backup/rollback | — | telemetry opt-in |
| DON-N11 | NocoBase email/office/map plugins | crosscheck §4/utility | defer | R9+ | deferred register | deferred | — | utility trigger | — | |
| DON-N12 | NocoBase AI employees/MCP | crosscheck §4/AI | merge | R4 | R4.5 | planned | Jarvis | governed AI proof | — | |
| DON-A01 | Aureus chatter/fields/table views/plugin manager | crosscheck §5/core | absorb | R1/R5 | R1.5/R1.6/R5.1 | planned | W0/client pages | config/collaboration proof | — | |
| DON-A02 | Aureus accounting/report pages | crosscheck §5/accounting | merge | R2/R5 | R2.7 | planned | finance pages | GL-backed reports | O-2 | |
| DON-A03 | Aureus sales/purchases/products/inventory | crosscheck §5/sales | merge | R3 | R3.1–R3.4 | planned | legacy pages | deeper donor flows | — | |
| DON-A04 | Aureus manufacturing/OEE | crosscheck §5/manufacturing | merge | R7 | R7.2 | planned | workshop pages | OEE logs | — | |
| DON-A05 | Aureus employees/skills/recruitments/time-off | crosscheck §5/people | absorb | R5 | R5.5 | planned | people page | frozen-safe HR suite | O-3 | |
| DON-A06 | Aureus projects/timesheets | crosscheck §5/projects | merge | R3 | R3.7 | planned | project page | analytic project timesheet | O-3 | not payroll |
| DON-A07 | Aureus contacts/partners | crosscheck §5/contacts | merge | R1/R3 | R1.13/R3.1 | planned | customers page | party master | — | |
| DON-A08 | Aureus security/support/UOM/currency/activity | crosscheck §5/security | merge | R1/R3 | R1.2/R1.13/R3.7 | planned | mixed pages | scope/master/SLA proof | — | |
| DON-A09 | Aureus website/blogs | crosscheck §5/website | defer | R9+ | deferred register | deferred | — | CMS trigger | — | |
| DON-A10 | Aureus barcode/payments/analytics/calendar | crosscheck §5/other | merge | R2/R3/R5/R6 | mapped epics | planned | pages only | domain acceptance | — | |
| DON-I01 | IDURAR CRUD controller/registry | crosscheck §6/CRUD | absorb concept | R1 | R1.1 | planned | W0 spike | config CRUD proof | — | clean-room |
| DON-I02 | IDURAR invoice/payment/quote/client/status | crosscheck §6/finance | merge | R2/R3 | R2.6/R3.2 | planned | legacy finance/sales | derived-status proof | O-2 | |
| DON-I03 | IDURAR settings EAV/money/PDF/soft-delete/seeds | crosscheck §6/kernel | absorb | R1/R5 | R1.5/R5.4 | planned | settings/print pages | audit/print/seed tests | — | |

## D. Recovered historical capabilities

These rows make the useful conclusions of `erp-research/FEATURE_RECOVERY_REVIEW_2026_07_17.md` actionable without reviving duplicate products or frozen payroll behavior.

| Capability ID | Capability | Source/evidence | Disposition | Target release | Target epic/task | Current status | Implementation evidence | Acceptance evidence | Owner decision | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| REC-001 | SOP read/understood/trained acknowledgment and supervisor sign-off | `erp-research/FEATURE_RECOVERY_REVIEW_2026_07_17.md` §4/R1; SOP sources named there | rebuild | R4 | R4.2; SOP module task | planned | current SOP has versions/approval/diff only | acknowledgment states, training evidence, supervisor sign-off, audit | — | no payroll change |
| REC-002 | Pin immutable SOP version to active work order | recovery review §4/R1 | rebuild | R3/R4 | R3.5, R4.2 | planned | no accepted immutable pin | active WO cannot change pinned revision without controlled action | — | linked to REC-001 |
| REC-003 | Settings change history, impact preview, version comparison, controlled rollback | recovery review §4/R2 | rebuild | R4 | R4.1/R4.3; settings governance task | planned | current settings surface lacks complete register | append-only log, manager approval, preview, one-setting rollback, audit | O-3 | frozen settings read-only |
| REC-004 | Historical metrics/insights register with source, confidence, owner, follow-up, resolution | recovery review §4/R3 | rebuild | R5 | R5.3; analytics register task | planned | daily snapshots/live recommendations only | historical record and follow-up lifecycle on non-frozen domains | — | payroll/attendance excluded |
| REC-005 | Reusable sub-workflows and controlled advanced workflow composition | recovery review §4/R4 | rebuild | R4 | R4.2/R4.3 | planned | Studio has condition/approval/QC/rework but no full composition | reusable sub-workflow, bounded parallelism, retry/recovery, dynamic-step guard | — | fixed templates first; no AI autopilot |
| REC-006 | WhatsApp media download, voice transcription, media retention, approved entity mapping | recovery review §4/R5 | rebuild | R6/R8 | R6.7/R8.4; media policy task | planned | webhook/text/metadata foundation; media may remain pending | credentials/HTTPS, download/hash, transcription, retention, approval-gated mapping | O-10 | no offline external send/post |
| REC-007 | Guided event package/cart, suppliers/alternatives, executor timeline template | recovery review §4/R6 | merge | R9 | R9.2/R9.3; Events pack task | planned | Events has event/registration/ticket basics | guided package pricing, supplier alternatives, executor timeline | — | EventOS is not revived as separate product |
| REC-008 | Production authentication/local-trust closure | recovery review §4/R8; roadmap R1.14/R8.3 | rebuild | R1/R8/R10 | R1.14, R8.3, R10.4 | partial | auth hardening partial per R1 forensic audit | no local-dev bypass, enrollment/rotation/revocation, production security sign-off | O-10 | linked for completeness |

## E. Current-system and evidence register

| Capability ID | Capability | Source/evidence | Disposition | Target release | Target epic/task | Current status | Implementation evidence | Acceptance evidence | Owner decision | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| SYS-001 | Current Octagon 103-module/page surface inventory | `OCTAGON_VNEXT_COVERAGE_CROSSCHECK.md` §7; `OCTAGON_CURRENT_TRUTH_AUDIT.md` §§1–7; `octagon-erp-commercial-vnext/views/` and `modules/` | rebuild/merge/pack by CUR rows | R1–R9 | mapped CUR-001..040 | legacy-only | source/page inventory only | every destination epic's acceptance | — | no page-existence inference |
| SYS-002 | AI governance stack | Truth Audit §4.3; `server-jarvis-security.js`, `server-jarvis-tools.js` | preserve/adapt | R4 | R4.5 | partial | server tool/approval pattern | read/write tool contract and audit | — | sensitive writes gated |
| SYS-003 | WhatsApp webhook foundation | recovery review §3; `server.js`, WhatsApp modules | preserve/strengthen | R1/R6 | R1.8, R6.7 | partial | handshake/signature/rate-limit/review | media/transcription policy proof | O-10 | no second inbox |
| SYS-004 | Service worker/static cache foundation | `manifest.json`, `service-worker.js`, registration in VNext root | preserve/adapt | R1 | connectivity foundation | implemented | static cache/installability only | transactional sync tests separate | O-10 | explicitly not offline transaction proof |

## F. Missing-evidence register and contradiction resolution

The following references named by the recovery review were checked in the current four-folder workspace bundle:

| Referenced file | Current bundle result | Treatment |
|---|---|---|
| `consolidated_evaluation/02_BACKLOG_AND_UNEXECUTED_IDEAS.md` | not found | Known conclusions are preserved through the recovery summary; independent archival verification remains pending if the original is later found. |
| `consolidated_evaluation/[C5_I9_R9_ExY]_MASTER_CATALOG.md` | not found | Same treatment; do not reconstruct it from memory. |
| `_archive_OCTAGON_VNEXT_MASTER_ROADMAP_rev1_20260717.md` | **verified present at `C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-analysis\_archive_OCTAGON_VNEXT_MASTER_ROADMAP_rev1_20260717.md`** | It was absent from the reviewed external upload but is physically present and readable in the current workspace; it remains archived/non-authoritative. |
| Individual historical source specifications cited by `FEATURE_RECOVERY_REVIEW_2026_07_17.md` | not found as a complete source set in the current bundle | Recovery summary conclusions are retained; independent archival verification remains pending if originals are later found. |

This resolves the contradiction without deleting or fabricating evidence: the recovery review remains the known-conclusions summary, the archived Rev-1 roadmap is available and linked, and the two missing catalog/backlog references plus individual historical specifications remain explicitly pending.

## G. Ledger maintenance rule

Before and after every VNext epic, update the affected row's status, implementation evidence, acceptance evidence, and owner decision. A page, route, static cache, demo harness, or copied legacy module may be cited as implementation context, but status may advance to `implemented`, `tested`, or `accepted` only when the target task's server, data, permission, audit, migration, UI, and acceptance evidence exists.
