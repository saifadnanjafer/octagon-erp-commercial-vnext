# R7.1, R7.2, R7.3, R7.4 & R7.5 Integration

- `migrations/701_r7_shop_floor.mjs`, `migrations/702_r7_oee_andon.mjs`, `migrations/703_r7_mps.mjs`, `migrations/704_r7_quality.mjs`, and `migrations/705_r7_maintenance.mjs` define the shop floor/planning/quality/maintenance schema.
- `shopfloor-engine.js`, `oee-andon-engine.js`, `mps-engine.js`, `quality-engine.js`, and `maintenance-engine.js` are the domain owners.
- `shopfloor-routes.js`, `oee-andon-routes.js`, `mps-routes.js`, `quality-routes.js`, and `maintenance-routes.js` are mounted at `/api/x/shopfloor`.
- Andon call states are tracked: raised -> acknowledged -> resolved.
- Downtime events track planned and unplanned durations.
- OEE metrics calculate Availability, Performance, and Quality against standard shift durations.
- Master Production Scheduling (MPS) aggregates sales orders and forecasts to propose draft work orders or purchase orders.
- Quality templates define inspection parameters. Result recording handles automatic Nonconformance Record (NCR) creation, corrective and preventive actions (CAPA), quarantine transfers, and Pareto defect analysis reports.
- Asset register generates Straight-line/Double-declining depreciation schedule lines, which can be posted to the general ledger (balanced JE). Maintenance work orders (preventive/corrective) track completion and calculate asset MTBF.
- Enforces strict company and tenant row-level security boundaries.
