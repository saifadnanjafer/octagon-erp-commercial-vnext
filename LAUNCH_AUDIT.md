# OCTAGON ERP — LAUNCH READINESS AUDIT

> **Date:** 2026-06-11  
> **Auditor:** Claude / Opus  
> **Scope:** what can be verified without physical phones/TVs (button-by-button, backup/restore, AI provider hardening)  
> **Result:** ✅ **GREEN** — ready to send to real-device testing.

---

## 1. Button-by-button audit (15/15 surfaces verified)

Every interactive surface was driven programmatically in the live preview. The audit checked that each page renders without throwing, that DOM elements expected by handlers actually exist, and that the right handlers are wired as `window.*` functions.

| Surface | Buttons | Inputs | Result | Notes |
|---|---|---|---|---|
| 🏠 `wfl_home` | 3 | 0 | ✅ | 8 role tiles render |
| 📱 `employee_mobile` | 2 | 0 | ✅ | Big-button mobile UI (no tasks assigned to current user → empty state shown correctly) |
| 📺 `workshop_tv` | 1 | 0 | ✅ | 13 panels render, 3 rows of live data |
| 🤖 `kiosk` / chat tab | 9 | 2 | ✅ | Input + mic + 5 quick buttons + send all wired |
| 🤖 `kiosk` / brief tab | 7 | 0 | ✅ | Briefing renders |
| 🤖 `kiosk` / SOP tab | 0 | 2 | ✅ | WO selector + job type input |
| 🤖 `kiosk` / message tab | 0 | 2 | ✅ | WO selector + message type |
| 🤖 `kiosk` / memory tab | 6 | 0 | ✅ | Detector button + table |
| ⚙️ `ai_queue` | 4 | 0 | ✅ | 1 demo proposal renders with approve/reject |
| 🏗️ `ai_factory` | 5 | 5 | ✅ | Form + handler all wired |
| 🧰 `ai_tools` | 8 | 0 | ✅ | 8 tools, all with toggle |
| 🚀 `deploy_ready` | 2 | 0 | ✅ | **12/12 checks green** |
| 🚨 problem overlay | 3 | 7 | ✅ | 10 categories, category selection state works |
| 🛠️ `work_orders` (regression) | 16 | 25 | ✅ | List + wizard both render; wizard `woSubmitWizard` wired |
| 🩺 `route_health` (regression) | 2 | 0 | ✅ | `rhRunNow` + `rhCopyReport` wired |

**Note:** initial audit reported 2 false negatives — the kiosk chat tab had a non-chat tab cached from prior tests, and `work_orders` was showing the WO file view (not the list, so the wizard button isn't there). A targeted re-check confirmed both surfaces are fully functional.

**No real bugs found in this audit.**

---

## 2. Backup / restore drill

Exercised `wflBackupNow()` end-to-end with the download interceptor in place. Verified the snapshot is correctly shaped and could be round-tripped.

| Check | Result |
|---|---|
| Backup ran without error | ✅ |
| Payload bytes captured | **199.2 KB** |
| Last backup timestamp recorded in `omni.__lastBackupAt` | ✅ |
| History ledger event written (`backup_export`) | ✅ |
| All 4 new Phase 4.5 collections present (`jobOrders`, `workOrderEvents`, `materialReservations`, `workOrderIssues`) | ✅ |
| All 4 new Phase 4.7 collections present (`workshopMemory`, `aiDevelopmentFactory`, `aiToolRegistry`, `customerMessageDrafts`) | ✅ |
| `aiControl` (extended queue) present | ✅ |
| MRP `omni.workOrders` (3 records) preserved | ✅ |
| All other live collections (`materials`, `machines`, `qcRecords`, `sops`, `opPacks`, `kanban`, `requests`, `posSales`) | ✅ |
| Restore integrity (parse → re-count) all 20 surfaces | ✅ 20/20 |

**Manual restore drill instructions** (for the owner to do on a copy of `database.db`):

```powershell
# 1. Stop the server.
# 2. Make a working copy of the live DB:
copy database.db database.live.bak
# 3. Pick a backup from the server's auto-backups:
copy db-backups\database.backup.<timestamp>.json database.restore.json
# 4. Edit server.js OR replace database.db with the JSON — server.js handles JSON form.
#    Or replace database.json (which the server seeds from).
# 5. Restart the server.
# 6. Open http://localhost:8080 and run فحص صحة النظام.
#    Target: 47/47 nav, 47/47 pages, 14/14 fns, 13/13 cols, 0 link orphans.
# 7. Run جاهزية التشغيل. Target: 12/12.
```

The server has **auto-backups every save** in `db-backups/` (see `server.js:74` `backupTimestamp`, `:608` `verifyBackupAgainstLive`). Owner should periodically verify these match the live DB collection counts.

---

## 3. AI provider hardening review

### Current setup

| Component | Provider | Model | Key location |
|---|---|---|---|
| Primary | OpenRouter | `deepseek/deepseek-chat` (~$0.000002/call) | `modules/ai-providers.js:38` |
| Fallback | Google Gemini | `gemini-flash-latest` | `app.js` (6 inlined sites) + `omni-ai-assistant.js` |
| Override | localStorage `octagonAIProvider` | any from `OctagonAI.models` | runtime |

The provider abstraction (`window.OctagonAI`) exposes `setModel('deepseek'|'qwen'|fullId)`, `useGemini()`, `useOpenRouter()`, `setKey(k)`, `config()` for runtime control.

### Deterministic-fallback verification

**All 6 AI features were verified to work WITHOUT any provider:**

| Feature | Works without provider? |
|---|---|
| Morning briefing (`OctagonWorkshopAI.briefing` + `briefingText`) | ✅ |
| Worker assistant (`OctagonWorkshopAI.workerAnswer`) | ✅ |
| SOP draft generator (`OctagonWorkshopAI.generateSopDraft`) | ✅ |
| Customer message generator (`OctagonWorkshopAI.customerMessage`) | ✅ |
| Kiosk chat (deterministic intents for ناقص/متأخر/مكين/مشكل/تسليم/SOP/رسائل) | ✅ |
| Provider status advertises `deterministicFallback: true` always | ✅ |

The kiosk only tries `JarvisBrain.handle` for *general* questions that don't match a deterministic intent — and even then it gracefully falls back to a help message if the brain throws.

### Owner pre-launch hardening checklist

These actions are the **owner's** responsibility (they must do them before going online):

- [ ] **Rotate the OpenRouter key** at `modules/ai-providers.js:38` — generate a fresh key, paste the new one inline, OR set it at runtime via `OctagonAI.setKey('sk-or-...')` (persists to localStorage as `octagonAIProvider`).
- [ ] **Set a monthly spend limit** on the OpenRouter account (≤ $5/month is more than enough for workshop usage at DeepSeek prices).
- [ ] **Rotate the Gemini key** at the 6 inlined sites in `app.js` (lines 1722, 9539, 9751, 9876, 10039, 32618) + `omni-ai-assistant.js`. Use a single search/replace.
- [ ] **Set a quota** on the Gemini API key in Google Cloud Console.
- [ ] **Decide if going online needs HTTPS termination** — `server.js` listens on HTTP only. If exposing beyond LAN, terminate TLS at a reverse proxy (e.g., Caddy on the same machine).
- [ ] **Verify the AI Tool Registry's high/critical tools are still disabled** — `سجل أدوات الذكاء الصناعي` should show 4 enabled (low-risk) + 4 disabled (medium/high/critical). The owner must explicitly enable any high/critical before they ever fire.
- [ ] **Confirm the action queue gating** — run a dry test: create a high-risk proposal (e.g., manually inject a `change_price` actionType), verify a supervisor cannot approve it, only a manager can.

### What we deliberately did NOT change

- The inlined keys were left in place per memory rule (`feedback-working-agreement`): *"The hardcoded Gemini/OpenRouter keys stay for offline use; user will remove them themselves before going online. Don't strip them."*
- No edits to `app.js`.
- No changes to provider behavior.

---

## 4. Summary

| Audit area | Result |
|---|---|
| **Button-by-button (15 surfaces)** | ✅ 15/15 functional, 0 real bugs |
| **Backup/restore drill (20 collections)** | ✅ 20/20 integrity, 199KB payload, audit trail written |
| **AI provider hardening** | ✅ Deterministic fallback proven; 9-item owner checklist documented above |
| **Route Health** | ✅ 47/47 nav, 47/47 pages, 14/14 fns, 13/13 cols, 0 link orphans |
| **Deployment Readiness** | ✅ 12/12 |
| **MRP `omni.workOrders` untouched** | ✅ 3 demo machine-run records preserved |
| **Zero console errors** | ✅ |

**The remaining launch-readiness items genuinely require physical devices:**

- Real phone test on iPhone + Android via workshop WiFi (mobile mode tap targets, viewport, network)
- Real TV screen test at distance (font legibility, contrast, color)
- The owner's manual key rotation + spend limits + restore drill on a backup file

---

## 5. Re-audit + Workshop-First Stabilization Sprint (2026-06-12)

The original audit above was run at the **47-page** scale. Since then 5 verticals (retail/clinic/restaurant/real-estate/hotel), the AI-governance layer, and the `ai_status` page shipped — the platform is now **53 pages**. The full workshop AI launch audit was **re-run live at the new scale**:

| Audit area | Result (2026-06-12) |
|---|---|
| Route Health | ✅ **53/53 nav · 53/53 pages · 8/8 required globals · 14/14 fns · 13/13 cols · 0 link orphans** |
| Console errors | ✅ none |
| New module globals (5 verticals + AI governance + workshop AI/frontline) | ✅ all present + render |
| Deterministic AI fallback (`providerStatus().deterministicFallback`, `briefing()`) | ✅ proven with no provider |
| AI gate classification (5 direct-write tools high/critical + `approvalRequired`) | ✅ |
| Manager-only enforcement (high/critical) | ✅ **proven** — supervisor blocked (high=false, critical=false), manager allowed, low approvable by supervisor (stubbed `resolveGroups`, restored) |
| Prompt-injection guard | ✅ fires (`riskLevel:high`, 3 signals) on a malicious prompt |
| AI tool registry | ✅ 47 tools |
| Deployment readiness | ✅ all-green |

**Real finds (both fixed):**
1. `OctagonWorkshopAI.briefingText()` threw `TypeError: …reading 'urgent'` when called with no argument — but the roadmap/README describe it as a standalone copyable summary. Fixed: it now defaults its argument to `briefing()` (`modules/workshop-ai.js:147`). Add-only, internal callers unaffected.
2. (Earlier this session) Route Health could not match the hyphenated nav key `real-estate` to `pageRealEstate`. Fixed: the nav→section matcher now treats `-` like `_` (`modules/route-health.js`).

> A first-pass "supervisor can approve high-risk" result was a **false alarm** — the test called `canUserApproveAiAction` with its args swapped. A corrected probe (stubbing `PermissionService.resolveGroups`) proved the gate is correct.

### The deliverable: Workshop-First Platform Stabilization Self-Test

`modules/workshop-stabilization.js` (+ `.css`) codifies this manual audit into a **repeatable, read-only** 12-check self-test, injected into the existing **جاهزية التشغيل (deploy_ready)** page (no 54th nav entry — sprawl is what we're stabilizing against). One button re-proves launch readiness after any edit; it mutates nothing. Also exposed as Jarvis read-only tool `workshop_stabilization_check` and `window.OctagonStabilization.run()`.

**Verified live 2026-06-12:** panel mounts in deploy_ready, **12/12 جاهز للإطلاق ✅** (backup shows an advisory ⚠️ until the owner runs 💾), 0 console errors, Route Health still 53/53. See `MASTER_ROADMAP.md` §6 `workshop_stabilization` entry.

---

## Next step

Once the owner has done the physical-device tests + key rotation, the next planned sprint is **Phase 6 audit** (dead-code pass + v6 receivable-mapping fix + release notes). Re-run **🏭 فحص استقرار الورشة** (in جاهزية التشغيل) after any structural edit — target 12/12.

---

## 6. Phase 6F Audit Delta - Seeded Role Regression (2026-06-24)

The historical audit sections above are retained as point-in-time launch checks, but their 47-page and 53-page denominators are no longer current. The active governance/audit baseline is now:

| Area | Current result |
|---|---|
| Sidebar route denominator | **86** unique `data-page` sidebar pages |
| Explicit mapped sidebar pages | **53** mapped through `PermissionService.pagePermissions` |
| Role-regression harness | **35/35 PASS** via `node scripts/permission-regression.mjs` |
| Data mutation | None; the harness is read-only and seeds users only inside a VM sandbox |

What the Phase 6F harness proves:

- The six seeded development roles resolve correctly: `system_admin`, `finance_manager`, `workshop_manager`, `operator_user`, `employee_user`, and `viewer_user`.
- Role inheritance works through `omni.roles`: system admin inherits workshop + finance manager/user groups; manager roles inherit their user groups.
- Mapped page policies allow/block the expected users for finance, banking, inventory, risk compliance, people ops, route health, self-service, and public portal pages.
- High-risk actions resolve to the correct outcome: direct allow for authorized roles, blocked where appropriate, and `approval_required` for sensitive routes that must not execute silently.
- Unmapped normal pages still explain as `default_allowed` under the current local/dev policy.

Validation run:

```powershell
node scripts\permission-regression.mjs
node --check scripts\permission-regression.mjs
node --check services\permissionService.js
node -e "for (const f of ['database.json','claude-status.json','claude-review-pointer.json']) JSON.parse(require('fs').readFileSync(f,'utf8')); console.log('json ok')"
```

Result: all checks passed. The local server was also started and responded at `http://127.0.0.1:8080/` with HTTP 200.

Live browser re-check:

- Route Health: **86/86 nav, 86/86 pages, 8/8 globals, 14/14 functions, 13/13 collections, 1/1 work-order links**.
- Workshop Stabilization: **12/12 PASS**.
- Security Center: Phase 6C action matrix visible and Phase 6E page-policy audit visible, including `53 mapped`.
- Loading overlay: hidden.
- Current user context: `system_admin`.
- Console: clean after adding the inline favicon declaration to stop the browser's default `/favicon.ico` 404.
- Advisory only: backup recency still warns until the owner runs **نسخة احتياطية الآن**.

Remaining launch-readiness items:

- Build the final production authentication/session model; current seeded users are local/dev identity scaffolding, not password authentication.
- Decide tenant/company assignment and legacy `companyId` backfill policy.
- Review AI approval execution paths end-to-end before enabling high-risk executors.
- Continue performance, release notes, and final stabilization checks.
