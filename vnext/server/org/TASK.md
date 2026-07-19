# Lane D Completion — TASK.md

Scope: `octagon-analysis/R1_FINAL_COMPLETION_REPORT.md` rows **T1.12.1** (module/extension
framework), **T1.13.1** (org & fiscal masters + company switcher), **T1.14.1** (auth hardening
completion). Canonical specs: `octagon-analysis/OCTAGON_VNEXT_MASTER_ROADMAP.md` R1.12
(~line 172-176), R1.13 (~line 178-181), R1.14 (~line 183-186).

Owned paths touched: `vnext/server/org/`, `vnext/server/auth/`, `vnext/server/modules/`,
`vnext/client/shell/` (new). Migration: `migrations/402_r1_lane_d_completion.mjs`.
`server.js` was **not** edited — see `INTEGRATION.md` for the exact snippets the integrator
applies there. `scripts/test-vnext-kernel-completion.mjs` was edited for one targeted fix
(the fake TOTP test at the old lines 306-310, T1.14.1's explicitly assigned "fix the fake
test" item) and nothing else in that file.

## Isolated dev/test environment (per coordinator correction)

All migrations/tests in this pass ran against `vnext-data/test-lane-d.db` (deleted and
recreated by the test script itself, never `vnext-data/vnext.db`) and HTTP port `127.0.0.1:8124`
(inside the project's reserved 8120-8129 test range). The shared
`scripts/test-vnext-kernel-completion.mjs` uses its own separate pre-existing throwaway file
(`vnext-data/test-completion.db`, also deleted+recreated on every run) — that convention already
existed before this pass and was not changed.

---

## T1.12.1 — Module / extension framework

**Before:** `vnext/server/modules/module-framework.js` had a genuinely working `ModuleRegistry`
(DFS load-order + circular-dependency detection) but was `require`'d nowhere — zero routes, zero
lifecycle-hook invocation ever fired. Dead code.

**After:**
- `module-framework.js` gained `discoverModules(modulesDir)` — scans `<modulesDir>/<id>/manifest.json`
  folders and registers each into a `ModuleRegistry` (read-only; no DB writes, per the roadmap's
  "no-DB-writes-in-load" contract).
- `module-lifecycle.js` (new) is the actual lifecycle engine: `installModule`, `uninstallModule`,
  `setModuleActive` (enable/disable), `listModules`, `detectConflicts`. Install:
  1. validates `dependencies` are already-active modules,
  2. pre-flight conflict-detects declared contributions (`custom_field`/`menu_item`/`workflow`)
     against `x_module_patches` — first-installer keeps ownership; a conflicting second install is
     rejected with a `409` naming the owner (roadmap acceptance: "two conflicting patches produce
     a deterministic, reported result"),
  3. runs the module's declared `migrations[]` (raw SQL `up`/`down` strings, tracked so `down` can
     run on uninstall),
  4. applies `contributes.fields/menu/workflows` as real DB effects (`x_custom_fields`,
     `x_module_menu_items`, `x_records` entity=`workflow`), each row tracked in `x_module_patches`,
  5. invokes the module's `onInstall` hook if declared (`hooks.js#onInstall`),
  6. marks the module row active — all inside one transaction (full rollback on any failure).

  Uninstall reverses this precisely: runs `onUninstall`, retracts every tracked patch (deletes the
  custom field / menu item / workflow row, runs the schema migration's `down` SQL), deletes the
  `x_module_patches` rows, and deletes the `x_installed_modules` row entirely — not just
  deactivates it. Enable/disable are separate soft toggles that never touch patches.
- `module-routes.js` (new) mounts admin-gated HTTP routes at `/api/x/modules` (`GET` list,
  `POST /:id/install|uninstall|enable|disable`), reusing the `system.admin` group-check pattern
  from `vnext/server/fields/custom-fields.js`'s `requireAdmin()`.
- **Sample/proof module:** `vnext/server/modules/available/loyalty_tier_demo/` — a real module
  folder (`manifest.json` + `hooks.js`) that adds a custom field (`crm_lead.loyalty_tier`), a menu
  item, a workflow definition, and its own tiny migration (a log table its hook writes to). Install
  → uninstall is exercised end-to-end in `scripts/test-lane-d-completion.mjs` Suite A, including a
  genuine zero-residue check (the field/menu/workflow rows are gone AND the module's own migration
  table no longer exists at all — not just empty).

**Deliberately not built:** a UI slot system / live nav rendering for module-contributed menu
items. `x_module_menu_items` is a real, retractable registry table, but nothing renders it into
the actual app shell nav — that would require editing shared shell files, which is out of this
lane's scope and off-limits per the coordinator's constraints. The roadmap's T1.12.1 acceptance
("adds a custom field + menu + workflow ... then uninstalls leaving zero residue") is a data-layer
claim and is proven at that layer.

---

## T1.13.1 — Org & fiscal masters + company switcher

**Before:** `org-structures.js` had 3 read-only helpers, was required nowhere, no routes existed,
no fiscal-year generator, no company-switcher UI.

**After:**
- `org-structures.js` gained `listCompanies`, `listDepartments`, `listWarehouses`,
  `generateFiscalYear` (one action generates a full year of `fiscal_periods` rows, idempotent per
  company+year), `listUserCompanies`/`grantUserCompanyAccess`/`userHasCompanyAccess`
  (`x_user_companies`), and `setActiveCompany`/`getActiveCompany` (`x_active_company`).
- `org-routes.js` (new) mounts `/api/x/org/*`: `GET companies|branches|departments|warehouses`,
  `POST companies/:id/access`, `POST fiscal-years/generate`, `GET|POST active-company`.
- `vnext/client/shell/company-switcher.js` (+ `.css`, new directory) — an Arabic-RTL dropdown
  following the exact `window.OX.<feature>.mount(element, options)` convention already used by
  `vnext/client/inbox.js`/`chatter.js`. Calls `/api/x/org/companies` + `/api/x/org/active-company`,
  dispatches a `octagon:company-changed` DOM event on switch. No CDNs, theme-safe CSS variables
  (matches `chatter.css`'s convention), comments in English, UI text in Arabic.

### Known discrepancy (as required by the brief)

There are now **two independent "active company" mechanisms** in this codebase, and this pass
does **not** merge them:

1. **Legacy single-tenant JSON-blob mechanism** — `getActiveTenantProfile()` /
   `stampServerTenantRecord()` in `server.js:646-772`. Reads/writes
   `db.omni.adminSettings.organization.{companies[], activeCompanyId}` inside the legacy
   `database.json`/SQLite-JSON-mirror blob. It stamps `companyId`/`companyName`/`currency` onto
   records in **legacy omni collections** (`omni.jobOrders`, etc.), not `x_records`.
2. **New SQL-native mechanism (this pass)** — `companies`/`x_user_companies`/`x_active_company`
   tables, read/written by `org-structures.js`, surfaced by `org-routes.js` and the new
   company-switcher. It sets the active company for **`x_records`-based entities** via
   `req.companyId`, which `crud-engine.js`'s pre-existing `resolveCompanyId(req, db)` (T1.2.2's
   row-scope mechanism) already honors.

These operate on **disjoint ID spaces and disjoint data** (the legacy `omni.*` JSON collections vs.
the SQL `x_records` table). Merging them would require either migrating the legacy mechanism's
company ids into the new `companies` table with a real mapping, or teaching `crud-engine.js` to
consult the legacy JSON blob — both are cross-lane, higher-risk changes explicitly out of scope
here (`crud-engine.js` is Lane A's file; the legacy mechanism lives in `server.js`, which this pass
must not edit). Silently aliasing the two id spaces without that mapping would risk exactly the
kind of tenant-isolation bug T1.13.1 exists to close. `INTEGRATION.md` documents the one new,
narrow request-state contract (`req.companyId`) the new mechanism needs server.js to set — it does
**not** touch or reuse the legacy mechanism's state at all.

### Second discrepancy found while testing (new finding, not previously documented)

`crud-engine.js`'s `createRecord()` validates `company_id` against **`r0_tenant_root`** (the R0-era
single-row scope anchor from `migrations/001_r0_scope_contract.mjs`), **not** the new `companies`
table from `migrations/401_r1_lane_d_tables.mjs`. `migrations/401`'s own `up()` attempts to copy
`r0_tenant_root` rows into `companies`, but that copy runs during the **migration** phase, which
always executes before the **seed** phase that first populates `r0_tenant_root`
(`seed-runner.mjs`'s `applyR0ScopeSeed`) — so on every fresh install, that copy is a no-op and the
SQL `companies` table starts genuinely empty regardless. Net effect: today, a company only becomes
a valid `x_records.company_id` value if it *also* exists in `r0_tenant_root` — the two tables are
supposed to share one id space but nothing currently keeps them in sync after boot. This pass does
not fix `crud-engine.js` (out of scope, Lane A's file) or add a "create company" endpoint (not in
the assigned route list for this pass — only `GET` listing + fiscal-year generation + access
grants were requested). `scripts/test-lane-d-completion.mjs` registers its fixture companies in
both tables to prove the composition works once that sync exists; production company creation
tooling is a follow-up for whoever owns `crud-engine.js`/`org-structures.js` next.

---

## T1.14.1 — Auth hardening completion

**Before:** `auth-hardening.js` had working TOTP-verify-at-login, API-key validation, user-disable,
and 8h session TTL — but no password policy, no session rotation, no TOTP enrollment route, no
API-key issuance route, and a test that asserted nothing (`test-vnext-kernel-completion.mjs:306-310`).

**After (`auth-hardening.js` additions, `auth-routes.js` new):**
- **Password policy:** `x_auth_password_policy` (config table, admin-editable) +
  `checkPasswordPolicy(password, policy)` (length + character-class checks, all thresholds
  config-driven, not hardcoded) + `loadPasswordPolicy`/`savePasswordPolicy`. Routes:
  `GET/PUT /api/x/auth/password-policy`, `POST /api/x/auth/password/validate` (no session required —
  usable during initial account setup).
- **Session rotation:** `x_session_revocations` (`user_id -> revoked_at`) +
  `rotateSessionsForUser(db, userId)` / `isSessionRevoked(db, userId, sessionCreatedAt)`. This lane
  cannot itself invalidate `server.js`'s in-memory `authSessions` Map — `INTEGRATION.md` documents
  the exact one-line check to add to `requireSession()` (mirrors the existing `isUserDisabled()`
  check right next to it) plus the recommended call site for `rotateSessionsForUser()`.
- **TOTP enrollment:** `x_totp_enrollments` (pending → confirmed) +
  `createTotpEnrollment`/`confirmTotpEnrollment`/`getConfirmedTotpSecret`/`removeTotpEnrollment`.
  Routes: `POST /api/x/auth/totp/enroll` (returns secret + otpauth URI **once**), `POST .../confirm`
  (verifies one real code before activating), `DELETE /api/x/auth/totp`.
- **API-key issuance/revocation:** extends `x_api_keys` (id/label/created_at/created_by columns,
  commutative migration — see `INTEGRATION.md`/migration file header for why) +
  `issueApiKey`/`revokeApiKey`/`listApiKeys`. Routes: `POST/GET /api/x/auth/api-keys`,
  `DELETE /api/x/auth/api-keys/:id`. Raw key is returned exactly once in the issuance response;
  only its SHA-256 hash is ever persisted.
- **Fixed the fake test:** `scripts/test-vnext-kernel-completion.mjs` Suite 6.1 now computes the
  real currently-valid HOTP code for a fixed test-only secret (via `auth-hardening.js`'s newly
  exported `_internal.generateHOTP`/`_internal.base32Decode`) and asserts `verifyTotp()` returns
  `true` for it and `false` for a wrong code — see `TEST.md` for the real run output.

### Known integration gap: TOTP enrollment vs. the legacy login check

`server.js:1905-1911`'s login flow checks `user.totpSecret` on the **legacy JSON user object**
(`userListFromDb(db)`), not the new `x_totp_enrollments` SQL table this pass adds. A secret
enrolled through the new `POST /api/x/auth/totp/enroll` → confirm flow will **not** be honored at
login until the integrator wires one of the two options documented in `INTEGRATION.md` (read from
`x_totp_enrollments` at that line, or mirror the confirmed secret onto the legacy user object on
confirm). This mirrors the same "two mechanisms, not silently merged" caution as the company
discrepancy above — deliberately left as an explicit, documented choice rather than a silent
guess.

### Password-policy: no live server-side enforcement call site exists yet

Passwords are currently set/changed **client-side only**, in `app.js` (`hashPassword()` calls
around `app.js:3426` and `app.js:3454`), which computes the hash in the browser and persists it via
the generic full-DB-sync `POST /api/db` path (`server.js:2128+`) — there is no dedicated
server-side "change password" endpoint anywhere in `server.js` today, and the server therefore
never sees a candidate password in cleartext to validate against a policy. This lane cannot add a
policy check to a call site that does not exist without either editing `app.js` (outside every
lane's owned paths and off-limits per the coordinator's constraints) or inventing a new mutating
"change password" endpoint in `server.js` (also off-limits for this lane to edit directly). What
this pass ships instead: a real, working `POST /api/x/auth/password/validate` endpoint that
`app.js` (or any future server-side password-set path) can call *before* hashing, to enforce the
same policy without needing any server.js edit for the validation logic itself.
`INTEGRATION.md` documents both integration options precisely for whoever owns that call site.

---

## Files changed/added (this lane only)

- `migrations/402_r1_lane_d_completion.mjs` (new)
- `vnext/server/modules/module-framework.js` (extended: `discoverModules`, registry accessors)
- `vnext/server/modules/module-lifecycle.js` (new)
- `vnext/server/modules/module-routes.js` (new)
- `vnext/server/modules/available/loyalty_tier_demo/manifest.json` (new)
- `vnext/server/modules/available/loyalty_tier_demo/hooks.js` (new)
- `vnext/server/org/org-structures.js` (extended)
- `vnext/server/org/org-routes.js` (new)
- `vnext/client/shell/company-switcher.js` (new directory + file)
- `vnext/client/shell/company-switcher.css` (new)
- `vnext/server/auth/auth-hardening.js` (extended)
- `vnext/server/auth/auth-routes.js` (new)
- `scripts/test-lane-d-completion.mjs` (new)
- `scripts/test-vnext-kernel-completion.mjs` (Suite 6.1 fix only)
- `vnext/server/org/TASK.md`, `TEST.md`, `INTEGRATION.md` (this document set)

Not edited: `server.js`, any shared bootstrap/router file, `index.html`, `VNEXT_PROGRESS.md`,
`octagon-analysis/**`, any migration other than `402`, any file outside the four owned paths above.
