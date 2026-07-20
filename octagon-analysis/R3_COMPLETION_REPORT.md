# Octagon Commercial VNext — R3 completion report

Date: 2026-07-19

## Result

R3 external remediation is in progress. The prior internal gate remains historical evidence only; external acceptance is withdrawn until genuine authentication, migration immutability/rollback, scoped approvals/idempotency, atomic ledger behavior, complete browser evidence, and the remaining domain-depth criteria pass. R4 was not started.

## Delivered

- Migration chain `610_r3_product_pricing_core` through `620_r3_sla_business_clock`, with migration-owned product costing/tracking fields, closure records, scoped approval fields, scoped idempotency storage, and rollback-safe SLA clock state.
- Canonical product/pricing foundation with deterministic explain traces and company-scoped access.
- Sales quote → order → reservation → partial delivery/backorder → delivered invoice → return/credit-note flow through the existing stock and AR/AP engines.
- Procurement supplier quote, partial receipt, duplicate supplier-document rejection, vendor bill, three-way match approval gate, and return flow.
- Inventory route resolution, reorder request, putaway, pick/pack/ship, cycle-count approval, and adjustment posting.
- Manufacturing component issue to WIP, job-card completion, rolled material/labor/overhead cost, finished-goods receipt, and auditable reversal.
- Landed-cost allocation/reconciliation/reversal now posts balanced valuation GL and updates/reverses stock valuation; subcontract component issue/finished receipt remains stock-ledger linked.
- Project timesheet billing, deterministic SLA tick/escalation, business-hours pause/resume SLA clock, and field-service stock-part consumption.
- Cross-cutting audit rows, history/chatter/approval hooks, company worklists, event publication hooks, integrity/FK checks, server-derived actor identity, and no frozen payroll/attendance/legacy-timesheet writes. Credit-limit and commission writes are approval-aware and company-scoped.
- Responsive Arabic RTL online-first workbench with live domain tabs and server-backed product creation.
- Runtime schema creation remains absent; stock compatibility columns and inventory adjustment schema remain migration-owned.

## Evidence

| Gate | Result |
|---|---|
| `node scripts/test-r3-core.mjs` | 19 PASS / 0 FAIL / 0 SKIP |
| `node scripts/test-r3-blocker-closure.mjs` | 29 PASS / 0 FAIL / 0 SKIP |
| `node scripts/test-r3-http.mjs` | 25 PASS / 0 FAIL / 0 SKIP; protected requests use real session cookie |
| `node scripts/test-migration-dependencies.mjs` | 30 PASS / 0 FAIL |
| `node scripts/test-r3-migration-rollback-fingerprints.mjs` | 8 PASS / 0 FAIL / 0 SKIP |
| `node scripts/test-r3-legacy-workshop-bridge.mjs` | 3 PASS / 0 FAIL / 0 SKIP; fixture-only read-only bridge |
| `node scripts/check-r3-runtime-ddl.mjs` | 0 violations |
| `node scripts/check-r3-frozen-zone.mjs` | 0 mutation references |
| `node scripts/check-r3-provenance.mjs` | 21/21 PASS |
| `node scripts/test-lane-stock-t2.5.1.mjs` | 21 PASS / 0 FAIL |
| `node scripts/test-lane-stock-t2.5.2.mjs` | 19 PASS / 0 FAIL |
| `node scripts/test-r2-t2.6-t2.8.mjs` | 27 PASS / 0 FAIL / 0 SKIP |
| `node scripts/permission-regression.mjs` | 35 PASS / 0 FAIL |
| `node scripts/test-t2-o10-connectivity.mjs` | 11 PASS / 0 FAIL / 0 SKIP |
| Authenticated Chrome acceptance | 5 PASS / 0 FAIL / 0 SKIP: desktop/tablet/mobile RTL and desktop/mobile LTR; connected, six tabs, no overflow |

## New HTTP endpoints

Collection GET/POST endpoints remain available under `/api/x/r3`. Added or completed action endpoints include `POST /api/x/r3/orders/:id/reserve`, `/deliver`, `/return`, `/invoice`; `POST /api/x/r3/purchase-orders/:id/receive`, `/bill`, `/return`, `/match`; `POST /api/x/r3/landed-costs/:id/allocate`, `/reverse`; `POST /api/x/r3/route-rules/:id/resolve`; `POST /api/x/r3/reorder-rules/:id/request`; `POST /api/x/r3/putaway/:id/apply`; `POST /api/x/r3/picks/:id/ship`; `POST /api/x/r3/cycle-counts/:id/approve`; `POST /api/x/r3/productions/:id/issue`, `/complete`, `/reverse`; `POST /api/x/r3/subcontract-orders/:id/issue`, `/receive`; `POST /api/x/r3/projects/:id/bill`; `POST /api/x/r3/tickets/:id/sla-tick`; `POST /api/x/r3/field-service-orders/:id/consume-part`; `POST /api/x/r3/:resource/:id/chatter`; `POST /api/x/r3/:resource/:id/approval`; `GET /api/x/r3/worklist`; `GET /api/x/r3/:resource/:id/history`; and `GET /api/x/r3/:resource/:id/chatter`.

## Browser/PWA entry points

- `/vnext/client/r3.html` — Arabic RTL responsive R3 workbench.
- `/vnext/client/r3.css` and `/vnext/client/r3.js` — responsive layout, live tabs, online state, and server-backed list/create behavior.
- `vnext/client/modules/{products,pricing,sales,procurement,inventory,manufacturing,subcontracting,projects,helpdesk}/index.js` — additive client descriptors.

## Remaining blockers

Remaining blockers are: full operational domain UI and CRUD/state/error/unauthorized browser coverage; canonical Approval Center UI proof; a complete command-by-command atomicity and audit/outbox publication audit; subcontract supplied-component valuation and full landed-cost reversal-lock depth; full batch/serial/reservation/backorder and cycle-count acceptance matrix; live legacy omni.jobOrders read-only bridge (the current proof is fixture-only); and modular domain ownership beyond the current shared R3 core. Record-scoped ACL, landed-cost valuation GL/reversal, and business-hours SLA pause/resume now have focused proof. The authenticated browser proof is green for five shell/entry-point viewports, but it does not prove the missing operational surfaces.

## Skipped mandatory acceptance criteria

The external gate is not accepted. The criteria above are remediation requirements, not skips. No R4 work, production source, production database, credentials, or frozen-zone logic was used.

## Required next action

Continue the authorized R3 external remediation pass. Do not begin R4 until a new genuine-authenticated full gate passes.
