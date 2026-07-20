# Octagon VNext — Module Catalog
Authority level 6. Each module is THIN — it composes kernel engines (see Target Architecture §3), never re-implements posting/permissions/numbering/audit/collaboration. Format per module: Purpose · Personas · Submodules · Core entities · Document lifecycles · Permissions · Reports · Integrations · Donor · Edition.

**Connectivity contract:** every module participates in the online-first, real-time, cross-platform product through the responsive browser/PWA shell and the server event layer when connected. A module may declare only explicitly classified offline workflows in [`OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md`](OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md); sensitive posting, payroll/timesheet/attendance, identity, permissions, approvals, and other prohibited writes remain server-authoritative and are never posted offline.

Legend — Edition: **W**=Workshop, **B**=Business, **E**=Enterprise, **P**=Industry-pack add-on.

## LAYER B — BUSINESS MODULES

### 1. Finance (GL / AR / AP / Treasury / Assets)
- **Purpose:** trustworthy double-entry books, receivables/payables, banking, assets, statutory + management reporting.
- **Personas:** accountant, finance manager, owner, auditor.
- **Submodules:** Chart of accounts · Journals · Customer invoices + credit notes (AR) · Vendor bills + refunds (AP) · Payments + reconciliation · Bank & cash + statement import/auto-match · Taxes (+ withholding) · Budgets (+ monthly distribution) · Accounting dimensions · Cost centers/projects · Fixed assets + depreciation · Prepaids/accruals · Multi-currency · Period close/locks · Recurring journals · Consolidation (E).
- **Core entities:** account, journal_entry, invoice, bill, payment, bank_transaction, tax_rule, budget, asset, depreciation_schedule, fiscal_period. (All post to **GL engine 3.1**; numbering 3.12; states 3.3.)
- **Lifecycles:** invoice draft→submitted(posts GL)→paid/partially→(credit-noted|cancelled-reversal). Period open→closed→locked.
- **Permissions:** `finance:*` with dimension + company scope; posting/cancel gated; approvals on payments over limit (engine 3.4).
- **Reports:** Trial Balance, P&L, Balance Sheet, Cash Flow, GL, Partner/Customer/Supplier ledger, Aged AR/AP, Budget-vs-actual, Asset register. (donor report suite: Aureus structure; numbers from GL engine.)
- **Integrations:** bank files, WhatsApp payment reminders, existing finance-v6 bridge (transition).
- **Donor:** ERPNext (clean-room). **Edition:** lite in **W**, full in **B/E**.

### 2. Sales & CRM
- **Purpose:** win and fulfill demand from lead to cash.
- **Personas:** salesperson, sales manager, cashier, customer (portal).
- **Submodules:** Leads + **high-seas pool** (auto-recycle/claim) · Opportunities/pipeline · Activities/follow-ups (chatter) · Quotations · **Pricing/promotions/coupons** · Contracts · Sales orders · Delivery · Invoicing · Returns · Commissions · Territories · Forecasts · Customer portal · POS (+ opening/closing sessions) · Appointments.
- **Core entities:** lead, opportunity, quotation, sales_order, delivery, pos_session, pricing_rule, commission, appointment.
- **Lifecycles:** lead→opportunity→quotation→order→delivery(stock ledger)→invoice(GL). Pool: unowned N days→recycle.
- **Permissions:** `sales:*`/`crm:*`, own-vs-team scope, pool claim rules.
- **Reports:** pipeline/funnel, sales by rep/territory/item, forecast vs actual, commission statements, POS Z-report.
- **Donor:** RuoYi (pool/pipeline, MIT) + ERPNext (pricing, clean-room). **Edition:** lite **W**, full **B/E**.

### 3. Procurement & Suppliers
- **Purpose:** source and control spend.
- **Personas:** buyer, procurement manager, vendor (portal).
- **Submodules:** Supplier onboarding/qualification · **Scorecards** · RFQ + quotation comparison · Purchase orders + approvals · Blanket orders/requisitions · Receipts · Returns · Vendor bills + **3-way match** · Subcontracting · **Landed costs** · Procurement analytics.
- **Core entities:** supplier, rfq, purchase_order, receipt, bill, scorecard, landed_cost_voucher.
- **Lifecycles:** requisition→RFQ→PO(approval)→receipt(stock ledger)→bill(3-way match→GL).
- **Reports:** spend analysis, supplier standing, PO status, receipts due, price variance.
- **Donor:** ERPNext (clean-room) + Aureus (vendor portal, MIT). **Edition:** **B/E**.

### 4. Inventory & Warehousing
- **Purpose:** accurate stock, valuation, and movement.
- **Personas:** storekeeper, warehouse manager, buyer.
- **Submodules:** Warehouses/locations/bins · Receipts/issues/transfers · Reservations · Picking/packing · Cycle counting · Reconciliation · **Serial/batch/expiry** · Valuation (moving-avg/FIFO) · **Reorder rules/replenishment** · Putaway · Demand planning · Kits/bundles.
- **Core entities:** warehouse, item, stock_ledger_entry, bin, batch, serial, reorder_rule, transfer. (all via **stock ledger engine 3.2**.)
- **Lifecycles:** movements post to stock ledger; reconciliation adjusts via entries, not edits.
- **Reports:** stock on hand, valuation, movement, aging/expiry, reorder suggestions, ABC.
- **Donor:** ERPNext (clean-room) + Aureus (OrderPoint, MIT). **Edition:** **B/E** (POS stock in **W**).

### 5. Manufacturing & MES
- **Purpose:** plan and execute production; measure the shop floor.
- **Personas:** production planner, supervisor, operator (kiosk/TV), quality.
- **Submodules:** BOMs (+visual builder, multi-level explosion) · Routings · Work centers · Work orders · **Job cards** (time/labor/machine capture) · Material issue/return · Capacity planning · Scheduling · Subcontracting · Scrap/by-products/rework · Quality gates · **OEE · downtime · Andon** · planned-vs-actual cost · shop-floor terminals.
- **Core entities:** bom, work_order, job_card, work_center, downtime_entry, andon_call.
- **Lifecycles:** WO created→material issued(stock)→job cards(execution)→finished(stock in)→cost rolled to GL. **Frozen bridge:** existing workshop `jobOrders` chain preserved; MES wraps, not replaces.
- **Reports:** WIP, OEE, downtime Pareto, plan attainment, cost variance, Andon log.
- **Donor:** ERPNext (BOM/job card, clean-room) + RuoYi MES (OEE/Andon, MIT). **Edition:** **E** + workshop **P**.

### 6. Quality
- **Purpose:** conformance from incoming to final, with CAPA.
- **Submodules:** Inspection plans/templates · Incoming/in-process/final inspection · Nonconformance · CAPA · Rework · Defect libraries · Evidence/attachments · Calibration links · Supplier quality · Analytics.
- **Entities:** inspection_template, inspection, nonconformance, capa.
- **Lifecycles:** trigger on receipt/WO/delivery→inspection→pass|fail→(nonconformance→CAPA).
- **Donor:** ERPNext (clean-room) + RuoYi MES quality. **Edition:** **B/E**.

### 7. Maintenance & Assets
- **Purpose:** keep assets running; track lifecycle and cost.
- **Submodules:** Asset register · Capitalization · Depreciation (shared with Finance engine 3.16) · Preventive + corrective maintenance · Requests · Maintenance WOs · Spare parts · Meter readings · Warranties · Failure history · Downtime cost.
- **Entities:** asset, maintenance_request, maintenance_wo, meter_reading, warranty.
- **Donor:** ERPNext + Odoo maintenance. **Edition:** **B/E**.

### 8. Projects & Services
- **Purpose:** deliver billable work; support customers.
- **Submodules:** Projects/phases/tasks/milestones/dependencies · Timesheets · Expenses · **Billing (activity-cost → invoice)** · Retainers · Service contracts · **SLAs** · Field service · Helpdesk/tickets.
- **Entities:** project, task, timesheet(project — distinct from frozen HR timesheet), sla, ticket, service_contract.
- **Lifecycles:** ticket→SLA timers→resolution; project task→timesheet→billing(GL).
- **Donor:** ERPNext (SLA/activity-cost) + Aureus (projects). **Edition:** **B/E**.

### 9. HR & Payroll  (FROZEN CORE + additive)
- **Purpose:** people operations; **preserve approved Iraqi payroll**.
- **Submodules:** Org/employees/contracts · Shifts/attendance/**timesheet (FROZEN)** · **Payroll (FROZEN Iraqi logic)** · Leave (accrual plans/levels) · Benefits/loans/advances/expenses · Recruitment/ATS (stages/interviewers/skills) · Onboarding · Evaluations · Training/LMS · Employee portal.
- **Rule:** timesheet/attendance/payroll data + calc consumed via `LegacyPayrollAdapter` **read-only**; new HR (leave accrual, ATS, skills) never writes payroll/attendance.
- **Donor:** Aureus (accrual leave, ATS, skills, MIT) + Octagon legacy (payroll). **Edition:** **W** (timesheet+payroll), **B/E** (+ATS/leave/skills).

### 10. Commerce & Customer Engagement
- **Purpose:** sell and retain across channels.
- **Submodules:** POS (shared w/ Sales) · E-commerce foundation · Customer + vendor portals · **Memberships/points/levels/coupons** · **Subscriptions/recurring billing** · Appointment booking · Marketing campaigns · **WhatsApp operational comms**.
- **Entities:** membership, points_ledger(append-only), subscription, campaign, booking.
- **Donor:** RuoYi (member/points/mall, MIT) + ERPNext (subscriptions/loyalty, clean-room). **Edition:** **B/E** + retail **P**.

## LAYER C — INDUSTRY PACKS  (add-on, edition **P**)
Each pack = models + workflows + reports + dashboards + templates + terminology + default permissions + automations over the core.

| Pack | Adds |
|---|---|
| **Workshop / Advertising production** | job-order chain (frozen bridge), design/proofing states, material-per-job, workshop TV/kiosk/frontline, advertising-specific pricing |
| **Fabrication / CNC** | cutting/nesting jobs, machine time capture, sheet/material yield, program library |
| **Contracting / Construction** | projects w/ BOQ, progress billing/retention, subcontractor management, site inventory |
| **Retail / POS** | multi-store POS, shift/cash reconciliation, barcode, promotions, loyalty |
| **Pharmacy** | batch/expiry-critical inventory, controlled-substance log, insurance/claim fields |
| **Clinic** | patients, appointments, encounters, service catalog, billing |
| **Fleet / Transport** | vehicles, trips, fuel/maintenance, driver assignment, expiry docs |
| **Education / Training center** | courses, cohorts, enrollment, attendance, certificates, fee billing |

## Composition principle (why this stays maintainable)
A module ships tables + config + a few coded flows; it inherits CRUD/ACL/chatter/audit/numbering/approvals/print/import-export/saved-views/workflow **for free** from the kernel. Adding module #11 costs a fraction of module #1 — the opposite of the current tab-by-tab app. Verticals are configuration + thin packs, never core forks.
