# Octagon ERP — Release Candidate & Pilot Readiness Checklist

> Phase 8A audit deliverable. Generated 2026-06-26.
> Status: **READY FOR DEMO / INTERNAL PILOT** (with documented limitations below).
> Scope: hardening + audit only. No new public pages were added. Route baseline stays 93/93/93.

---

## 1. How to start the app

From `octagon-erp/`:

```bash
node server.js
```

- Default port: **8080**. Fallback ports: `8091..8095` (auto-selected if 8080 is busy; the chosen port is reported in `/api/server/status`).
- Open `http://localhost:8080/`.
- The authoritative datastore is **SQLite `database.db`** (`sqliteActive: true`). `database.json` is a secondary/legacy mirror used only as a fallback when SQLite is unavailable.
- Local-dev mode (`environmentMode: local-dev`) default-allows local requests so you can demo without first-time password setup. For a real pilot, run behind real auth.

## 2. Expected baseline counts (verify before every demo)

| Metric | Expected |
| --- | --- |
| Sidebar nav pages (`data-page`) | **93** |
| View markers (`<!-- view:x -->` in `index.html`) | **93** |
| Counted routed view files | **93** |
| Total view files in `views/` | **95** |
| Internal route-less views | **2** (`manager_approvals`, `mobile_inventory_count`) |
| Duplicate page keys | 0 |
| Missing views / missing markers / orphan views | 0 |
| PAGE_METADATA coverage of nav pages | **93/93 (100%)** |
| PAGE_PERMISSIONS coverage of nav pages | **93/93 (100%)** |
| Permission regression | **35/35** |
| `database.json` parse | PASS |

Quick check (no server needed):

```bash
node --check app.js && node --check server.js
node scripts/permission-regression.mjs        # expect 35/35
node -e "JSON.parse(require('fs').readFileSync('database.json','utf8')); console.log('PASS')"
```

Live route status (server running):

```bash
node -e "fetch('http://localhost:8080/api/release/status').then(r=>r.json()).then(j=>console.log(JSON.stringify(j.route,null,2)))"
```

## 3. Login / session status

- `GET /api/auth/session` returns sanitized current-session info only (no secrets).
- `POST /api/auth/login` validates a password hash and applies failure lock.
- In local-dev, local requests are default-allowed for fast demos. **Before a customer pilot, disable local default-allow and require real login.**

## 4. Backup check (do this before every pilot day)

```bash
# create a fresh, schema-correct backup from the SQLite truth:
node -e "fetch('http://localhost:8080/api/backup',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tag:'pilot_day'})}).then(r=>r.json()).then(console.log)"
# verify the latest backup against live:
node -e "fetch('http://localhost:8080/api/backup/verify').then(r=>r.json()).then(console.log)"   # expect success:true
```

> IMPORTANT: `/api/backup` reads from the **SQLite** store and self-verifies before keeping the file.
> The older `database.backup.auto.*.json` files are a reduced 8-collection legacy mirror and will
> FAIL `/api/backup/verify` against the v6 SQLite schema. Always create a fresh backup first.

## 5. Route health check

- In-app: open **فحص صحة النظام** (`route_health`). Expect green (all nav→section→renderer, globals, functions, collections, work-order links OK).
- Note: the `route_health` page hydrates all 93 templates and can wedge a **headless** preview/automation tool; it renders normally in a real browser.

## 6. Smoke checklist (per page)

For each page confirm: opens, no fatal console error, main container not empty, header present, primary cards/tables/buttons render, no infinite loader, no blank route.

Phase 8A result (sampled in a real browser via the running server):
- App boots with **0 console errors**, 93 nav buttons, `omni` loaded, key functions present, no stuck login gate.
- Sampled pages all render non-empty with header + buttons: `finance`, `telegram`, `fleet`, `nl_reports`, `inventory`, `sales_commission`, `intelligence`, `admin_panel`, `customers`, `pos`, `people_ops`.
- `integration_hub` renders in the real app but **wedges the headless automation renderer** (heavy single synchronous DOM build from 4 modules). See limitations.

## 7. Demo script — Workshop internal pilot

1. Command Center → show live KPIs and notifications.
2. Work Orders / Job Orders → create a job, move it through QC.
3. Inventory → show stock, reorder suggestions (read-only), serial/lot/expiry.
4. Finance → dashboard, invoices/bills, month-end close checklist (no auto-posting).
5. People Ops → HRMS lifecycle, leave preview (no payroll mutation).
6. Approvals → show that high-risk actions route to a human approval queue.
7. Route Health → prove the system self-audits (green).

## 8. Demo script — Customer (Fleet / Fuel Guard)

1. `fleet` → Fleet/Fuel Guard tab: command map/grid, vehicle/equipment register.
2. Fuel ledger → before/after tank, dispensed vs measured liters, variance, confidence.
3. Anomaly center → suspicious fuel drop, geofence/time violations (deterministic + AI explanation only).
4. Investigation flow → show that confirm/dismiss requires a human (AI cannot dismiss).
5. Reports → consumption, variance, suspected theft, idle waste.

## 9. Known limitations (state these up front in any customer demo)

- **`integration_hub`** is a heavy aggregate page (marketplace + ecommerce connectors + enterprise + multi-entity render into one host). Renders in a real browser; not optimized for headless automation. Future: lazy/tabbed rendering.
- `database.json` (git-tracked fallback) is a reduced 8-collection mirror; the full v6 data (finance `account_moves`, `users`, `departments`, `journal_entries`, `locations`) lives in **SQLite `database.db`** (gitignored). A fresh clone without `database.db` boots on the thin fallback. Package the SQLite file (or a fresh full backup) when deploying.

## 10. Unsupported / staged real integrations (NOT live)

These are presentation/foundation only — **no real external calls, no payment capture, no order import, no auto-send**:
- Telegram connector (drafts + approval only; no bot token client-side; no server send).
- WhatsApp expansion (sending stays approval-routed).
- E-commerce connectors: WooCommerce / Shopify / Salla / Zid (status `staged`, rollback-aware).
- Payment gateways: MyFatoorah / PayTabs / Stripe / ZainCash (status display only).
- Marketplace install actions (staged).

## 11. Safe demo-data rules

- Do **not** `git add .`. Do **not** push. Do **not** mutate `database.json` directly.
- Create a fresh backup before and after a demo (`/api/backup`).
- Destructive restore (`POST /api/restore`) requires system-admin + typed confirmation `RESTORE <file>` + an auto pre-restore backup. Keep it dry-run (`/api/restore/dry-run`) during demos.

## 12. What NOT to click during a customer demo

- Any **destructive restore** / wipe control in Admin.
- **Telegram / WhatsApp "approve"** if you don't want a draft marked approved (it still won't send).
- Finance **period lock** controls (locking is intentional and not auto-reversible).
- Marketplace **install** / connector **enable** (staged, but confusing to a customer).

## 13. Next recommended pilots (in order)

1. **Workshop internal pilot** — most mature, deterministic core.
2. **Fleet / Fuel Guard customer demo** — strongest standalone sales story.
3. **Telegram internal notifications demo** — needs a server-side connector first (currently draft-only).
4. **Report Designer demo** — `nl_reports` + smart views, Arabic printable layouts.

---

### Appendix — Security / Jarvis boundary (verified Phase 8A)

- No real API tokens/secrets in the frontend or `database.json` (only ENV-var *names* + a dev webhook verify-token).
- `POST /api/db` is admin-session/local-dev gated; `GET /api/db` is dev-safe read only.
- AI Governance hard-sets `directHighRiskExecution = false`; every agent is dry-run + human-review + audit-required.
- Jarvis can draft/explain/rank but **cannot** approve its own proposals, send messages, or mutate finance/payroll/stock/security directly.
