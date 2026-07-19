# Pentagon-ERP — Release Notes & Operator Handoff

**Snapshot date:** 2026-06-14
**Status:** Launch-readiness (Phase 6 hardening). Route Health **66/66**, 0 console errors.
**Nature:** Local-first ERP — single Node server (`server.js`, port 8080) serving a render-heavy
SPA (`app.js` + ~50 feature modules under `modules/`, 8 service-layer files under `services/`).
File `database.json` is the source of truth; `localStorage` is a backup cache only.

---

## 1. What is actually shipped

### Core platform
- **Payroll & timesheet** — daily/OT, Friday-OT (not double-counted), per-employee config. Hardened
  against the historical "employee data death spiral" (server preserves, client prefers non-empty LS).
- **Finance v6** — real double-entry `account_moves` system (`FinanceService`): invoices, bills, P&L,
  journal entries. Legacy → v6 bridge via `customer_charge` / `j_gen`. Data lives in
  `PentagonDB.getCached().finance.accounts` and `.account_moves`.
- **Workshop execution core** — job orders on `omni.jobOrders` (MRP owns `omni.workOrders`), with the
  Route Health doctor and the read-only stabilization self-test panel.

### Feature modules (selected, all green in Route Health)
Procurement · Projects · Approvals · Field Service · Rental · MRP/Work Orders · POS · Tax/Compliance ·
Asset & Maintenance · Subscriptions · People Ops (ATS + Leave + Expense + Appraisal) · Helpdesk · Fleet ·
Documents (DMS) · Marketing/Campaigns · Budgeting · Warranty/RMA · QC · SOP · NL Reporting ·
Command Palette · Multi-Entity control center · Vertical packs (clinic, hotel, pharmacy, real-estate,
restaurant, retail).

### AI layer (Jarvis)
- Brain (LLM tool-calling) + assistant. Gemini provider works.
- **Governed**: write tools are approval-gated (never auto-revert); `omni.aiSystem` /
  `aiToolRegistry` / `aiAuditLog`; `ai_status` page; prompt-injection guard. Deterministic-first.

### Multi-tenant isolation (shipped 2026-06-14, enforced at 3 layers)
1. **UI** — `scoped()` filters collections by active company.
2. **V5 service layer** — `tenantService.js` enforces company scope on reads/writes.
3. **Direct server API** — `/api/db`, `/api/collection`, `/api/record` stamp active-company records,
   preserve omitted foreign-company rows, and block explicit foreign-company upserts when multiTenant
   is on. Covered by `scripts/test-server-tenant-api.mjs`.

### Legacy companyId backfill policy (decided 2026-06-14) — **hybrid**
- Unstamped legacy records stay **visible in every tenant** (`scoped()` treats no-companyId as global).
  No data-loss risk.
- **New** records are stamped at creation by their create handlers.
- **Lazy / deliberate convergence**, never automatic:
  - `window.stampCompany(item)` — stamps one legacy record when an edit handler touches it.
    No-op unless multiTenant + active company + currently unstamped.
  - `window.backfillLegacyCompanyIds([collections])` — **operator-triggered** one-shot sweep; never
    runs on load/save. Returns `{ ok, activeCompanyId, stamped, byCollection }`. Defaults to
    `customers, suppliers, materials, jobOrders, invoices, tasks`.

---

## 2. Known limits

- **Local-first, not a production auth boundary.** The local server protects direct write endpoints for
  tenant data, but this is not a full production auth/API security model. Treat the host machine as
  trusted.
- **Dead-code debt.** ~35 duplicate top-level `function` declarations exist where an older
  implementation was superseded (finance v6 migration, task-manager rewrite). JS hoisting means the
  **last** declaration wins, so the earlier twins are unreachable — inert, but clutter. Not yet removed
  (kept under the add-only working agreement). Confirmed-dead examples: `escapeHtml` (329),
  `renderTaskManager` (13779), `updateTaskField` (13940), `renderMachinesPage` (16258),
  `postJEFromUI` (2823), `switchFinanceTab` (2674).
- **Single large `app.js` (~1.8MB).** Performance is healthy (input handlers debounced, no rogue
  MutationObservers, only a 1s clock + one bounded interval), but the monolith makes diffs heavy.
- **AI providers.** Gemini path is live; the Grok path was dead at last check. Confirm provider config
  before relying on AI features.

---

## 3. Operator instructions

### Start / stop
```powershell
# from octagon-erp/
.\start.ps1            # launches the local server on http://localhost:8080
```
`database.json` is the source of truth. Backups: `database.json.bak`, `.prev`, and `db-backups/`.
If you see "⚠️ السيرفر المحلي غير متصل" toasts, the server isn't running — start it before data
will persist to file.

### Pre-launch checks (run after any structural edit)
1. **Route Health** — open the app, run the Route Health doctor. Target **66/66**, 0 console errors.
2. **Workshop stabilization self-test** — deploy_ready page → **🏭 فحص استقرار الورشة**. Target 12/12.
   (Read-only; safe to run anytime.)
3. **Server tenant API smoke** — `node scripts/test-server-tenant-api.mjs`.

### Converging legacy multi-tenant data (optional, deliberate)
When you want old unstamped records claimed by the **currently active** company, run in the browser
console:
```js
backfillLegacyCompanyIds();                 // default operational collections
backfillLegacyCompanyIds(['employees']);    // or target specific collections
```
This only acts when multiTenant is enabled and an active company is selected; it saves on completion
and reports what it stamped. Until you run it, legacy records simply remain visible everywhere.

---

## 4. Remaining Phase 6 items (hardening, not missing features)

- [ ] Remove confirmed-dead duplicate function definitions (needs go-ahead — breaks add-only rule).
- [ ] Button-by-button launch audit (interactive click-through of critical workflows).
- [ ] Re-run stabilization panel after the latest tenant/server work.
- [ ] Optional deeper backend security (only if moving off local-first/trusted-host).
