# Octagon Commercial VNext — R1 Remaining Work Matrix

**Updated 2026-07-18 — R1 CLOSED.** Full evidence for every row below is in `R1_COMPLETION_REPORT.md`. This supersedes this document's prior (2026-07-17, pre-lane-build) 6-PASS/8-PARTIAL/5-FAIL table and its subsequent 2026-07-18 17-PASS/2-PARTIAL intermediate state (both preserved in git-equivalent history via `R1_FINAL_COMPLETION_REPORT.md` and `R1_COMPLETION_REPORT.md`'s own revision notes). The two remaining PARTIALs from the first integration pass (T1.1.3, T1.4.2) were closed in a follow-up pass the same day.

---

## 1. Task Classification Matrix (final)

| Task ID | Epic / Feature Name | Status | Classification |
|---|---|---|---|
| **T1.1.1** | Collection Registry | PASS | `PRESERVE — PASS` |
| **T1.1.2** | CRUD HTTP Engine | PASS | `PRESERVE — PASS` (was FAIL/regression; fixed by Lane A + Blocker 2) |
| **T1.1.3** | CRUD UI Renderer | PASS | `PRESERVE — PASS` (was PARTIAL; nav card added to admin panel's System Wire-up tab, live-verified) |
| **T1.2.1** | Backend ACL Core | PASS | `PRESERVE — PASS` |
| **T1.2.2** | Data Scoping & Masks | PASS | `PRESERVE — PASS` |
| **T1.3.1** | Doc-State Machine | PASS | `PRESERVE — PASS` (was PARTIAL; Lane A closed the gap, live-proven) |
| **T1.4.1** | Atomic Numbering | PASS | `PRESERVE — PASS` |
| **T1.4.2** | Audit & History | PASS | `PRESERVE — PASS` (was PARTIAL; history panel wired into the `ui-crud.js` drawer, live-verified) |
| **T1.5.1** | Custom & Snapshot Fields | PASS | `PRESERVE — PASS` (was FAIL; Lane C closed the gap, live-proven) |
| **T1.6.1** | Chatter & Collaboration | PASS | `PRESERVE — PASS` (was PARTIAL; Lane B closed the gap, live-proven) |
| **T1.7.1** | Saved Views & Worklists | PASS | `PRESERVE — PASS` (was PARTIAL; Lane B closed the gap, live-proven) |
| **T1.8.1** | Notification Center | PASS | `PRESERVE — PASS` (was PARTIAL; Lane C closed the migration-hygiene gap; adapters remain log-based stubs by design) |
| **T1.9.1** | Approval Engine | PASS | `PRESERVE — PASS` (was PARTIAL; Lane B closed the gap) |
| **T1.9.2** | Approval Center UI (nine work queues) | PASS | `PRESERVE — PASS` (was FAIL — only 4/9 boxes; Lane B built all nine, live-proven via `/api/x/approvals/counts`) |
| **T1.10.1**| Import/Export & Print | PASS | `PRESERVE — PASS` |
| **T1.11.1**| Workflow Engine | PASS | `PRESERVE — PASS` (was PARTIAL/crashing; Blocker 3 fixed the restart-recovery crash) |
| **T1.12.1**| Extension Framework | PASS | `PRESERVE — PASS` (was FAIL/dead code; Lane D + integrator wiring closed the gap, live-proven install/uninstall) |
| **T1.13.1**| Org & Fiscal Structures | PASS | `PRESERVE — PASS` (was FAIL/unwired; Lane D + integrator wiring closed the gap, live-proven) |
| **T1.14.1**| Auth Hardening | PASS | `PRESERVE — PASS` (was PARTIAL; Lane D closed the gap, live-proven) |

**Tally: 19 PASS · 0 PARTIAL · 0 FAIL/MISSING (of 19). R1 CLOSED.**

---

## 2. What closed the last two PARTIALs

- **T1.4.2**: `vnext/client/ui-crud.js`'s detail-drawer renderer now mounts `OX.historyPanel` alongside the existing chatter mount, exact snippet per Lane C's own `INTEGRATION.md`.
- **T1.1.3**: first closed with a link card in the admin panel opening the standalone demo, then superseded the same session by a real in-app page: `views/vnext_platform.html` + `modules/vnext-platform.js` (new nav tab, `system.admin`-gated, following the exact `modules/appointments.js` self-registering `switchPage`-wrap pattern) mounts `OX.crud.mountEntity(host, 'crm_lead')` **and** `OX.inbox.mount(host, {})` (closing T1.9.2's nav-reachability advisory too) against the **live server**. Also added the previously-never-loaded `history-panel.js`/`.css` and `company-switcher.js`/`.css` to `index.html`.

Verified live in the browser: all four widgets (`OX.crud`, `OX.inbox`, `OX.historyPanel`, `OX.companySwitcher`) are now globally available in the real app; the new page's view fragment, host div, and nav button all load correctly; mounting both widgets against the real server rendered a graceful 403 (CRUD, unauthenticated session — proper ACL enforcement, not a crash) and all nine real canonical Approval Center boxes with correct Arabic labels. Route inventory recomputed at **97/97** (was 96/96, +1 for this legitimately new page); `permission-regression.mjs`'s hardcoded baseline updated 96→97, back to 35/35. All four lane suites + shared kernel-completion suite re-run after every change — zero regressions throughout (58/58, 61/61, 43/43, 43/43, 13/13).

---

## 3. Advisory items — both worked through (found 2 more real bugs each)

Both items originally listed here were completed in a follow-up pass, and each turned up a genuine defect when actually exercised live (not just wired):

1. **Company switcher**: mounted into `vnext_platform` (§5b's page). Doing so live surfaced a 4th shared blocker — `org-routes.js`/`module-routes.js`/`auth-routes.js` each had an `actor(req)` probe calling `requireSession(req)` with no `res`, crashing (leaked error text) for any unauthenticated request. Fixed identically to the earlier `resolveRequestUser` fix. 9/9 new test (`test-blocker4-route-actor-inert-res.mjs`).
2. **Session rotation**: a real end-to-end HTTP test (`test-live-session-rotation-e2e.mjs`) — real login, real role change via the real `/api/db` path, real rejection check — found the rotation diff code was reading the wrong collection (`employees` instead of `users`/`omni.users`, the collection the real login path actually uses) and that `GET /api/auth/session` didn't consult revocation at all. Both fixed; 9/9 PASS.

Full detail: `R1_COMPLETION_REPORT.md` §9. The only remaining item is informational, not actionable: the legacy app's client-side login state is separate from server loopback trust, so reaching admin-gated pages (including the `system.admin`-only `vnext_platform` tab) through an unauthenticated browser session requires logging in through the UI first.

---

## 4. Historical detail for the CLOSED gaps

For the exact original gap descriptions, required files, migration requirements, and test requirements that were closed across both integration passes, see the "Detailed Technical Specification for Non-PASS Items" section preserved in `R1_FINAL_COMPLETION_REPORT.md` (the pre-lane-build audit) — every one of those specifications was implemented essentially as described there, verified by this session's re-reading of the actual code plus live HTTP/browser exercise, not by trusting the lane reports alone.

Full evidence for the 19/19 tally: `R1_COMPLETION_REPORT.md`.
