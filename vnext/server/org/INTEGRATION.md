# Lane D — server.js Integration Guide

Covers module-framework (T1.12.1), org/fiscal (T1.13.1), and auth-hardening (T1.14.1) wiring —
all three in this one document since they're all Lane D. **Lane D did not edit `server.js`.**
Everything below is what the integrator needs to add, with exact anchors verified against the
current file (line numbers as of this writing; re-check if `server.js` has moved since).

All new engines follow the exact same `mount<X>(deps) -> { handle(req, res, requestUrl) }`
contract already used by every other `vnext/server/*` engine currently mounted in `server.js`
(`octagonCrudEngine`, `octagonDocState`, etc.) — no new wiring pattern is introduced.

---

## 1. Declare the new engine variables

**Anchor:** next to the existing `let octagon*Engine = null;` block, `server.js:1795-1799`:

```js
let octagonViewsFields = null;
let octagonPrintTemplates = null;
let octagonWorkflowEngine = null;
let octagonChatter = null;
let octagonAclHttp = null;
```

**Add** (same style, right after `let octagonAclHttp = null;`):

```js
let octagonModuleRoutes = null;
let octagonOrgRoutes = null;
let octagonAuthRoutes = null;
```

---

## 2. Add the three engines to the dispatch pipeline

**Anchor:** `server.js:1818-1827`, the block that currently reads:

```js
if (octagonScheduler && octagonScheduler.handle(req, res, requestUrl)) return;
if (octagonDocState && octagonDocState.handle(req, res, requestUrl)) return; // P1 Generic Document State Machine
if (octagonCommercialInbox && octagonCommercialInbox.handle(req, res, requestUrl)) return; // P0.5 /api/x/notify + /api/x/approvals
if (octagonViewsFields && octagonViewsFields.handle(req, res, requestUrl)) return; // P0.7 saved views + custom fields
if (octagonPrintTemplates && octagonPrintTemplates.handle(req, res, requestUrl)) return; // P0.9 /api/x/print/*
if (octagonWorkflowEngine && octagonWorkflowEngine.handle(req, res, requestUrl)) return; // P0.10 /api/x/workflows
if (octagonChatter && octagonChatter.handle(req, res, requestUrl)) return; // P0.3 /api/x/chatter/*
if (octagonAclHttp && octagonAclHttp.handle(req, res, requestUrl)) return; // P0.2 ACL gate + Arabic matrix API; must precede CRUD
if (octagonCrudEngine && octagonCrudEngine.handle(req, res, requestUrl)) return; // P0.1 /api/x/* platform CRUD
```

**Insert three new lines immediately before the `octagonAclHttp` line** (module/org/auth routes
have their own fixed path prefixes — `/api/x/modules`, `/api/x/org`, `/api/x/auth` — that never
collide with generic entity names, but must still be checked before the CRUD fallback for the same
reason every other specialized engine here is):

```js
if (octagonModuleRoutes && octagonModuleRoutes.handle(req, res, requestUrl)) return; // T1.12.1 /api/x/modules
if (octagonOrgRoutes && octagonOrgRoutes.handle(req, res, requestUrl)) return; // T1.13.1 /api/x/org/*
if (octagonAuthRoutes && octagonAuthRoutes.handle(req, res, requestUrl)) return; // T1.14.1 /api/x/auth/*
if (octagonAclHttp && octagonAclHttp.handle(req, res, requestUrl)) return; // P0.2 ACL gate + Arabic matrix API; must precede CRUD
if (octagonCrudEngine && octagonCrudEngine.handle(req, res, requestUrl)) return; // P0.1 /api/x/* platform CRUD
```

### 2a. Active-company request-state (required for T1.13.1's company-switcher to actually gate CRUD)

`crud-engine.js`'s existing `resolveCompanyId(req, db)` (T1.2.2's row-scope mechanism, already
live) reads `req.headers['x-company-id']` first, then falls back to `req.companyId`. The new
company-switcher sets a user's active company via `POST /api/x/org/active-company`
(`x_active_company` table) — for that selection to actually scope `/api/x/*` CRUD requests, add
**one small block** right before the dispatch pipeline above (same place `req.octagonUser` gets
stamped by `acl-engine.js`'s `resolveRequestUser`, i.e. this is the same kind of per-request
enrichment already happening here, not a new pattern):

```js
if (dbSync) {
  const activeSession = authSessionFromRequest(req);
  if (activeSession && !req.headers['x-company-id']) {
    const orgStructures = require('./vnext/server/org/org-structures');
    const active = orgStructures.getActiveCompany(dbSync, activeSession.session.userId);
    if (active) req.companyId = active.company_id;
  }
}
```

Place this immediately above the `if (octagonModuleRoutes && ...)` line added in step 2. This is
intentionally **not** the same mechanism as the legacy `getActiveTenantProfile()` /
`stampServerTenantRecord()` (`server.js:646-772`) — see `TASK.md` "Known discrepancy" for why the
two are kept separate rather than merged.

`scripts/test-lane-d-completion.mjs` reproduces this exact snippet inside its own isolated test
HTTP server (it does not and cannot touch `server.js`) and proves the composition end-to-end
against the real `crud-engine.js`/`acl-engine.js` — see Suite B.5 in `TEST.md`.

---

## 3. Mount the three engines

**Anchor:** `server.js:2848-2856`, the block that currently reads:

```js
const aclEngine = require('./vnext/server/acl/acl-engine');
octagonCrudEngine = require('./vnext/server/crud/crud-engine').mountCrud({ db: dbSync, sendJson, readRequestBody, authSessionFromRequest });
octagonAclHttp = aclEngine.mountAclHttp({ db: dbSync, requireSession, sendJson, readRequestBody });
octagonChatter = require('./vnext/server/chatter/chatter').mountChatterWithCrud({ db: dbSync, crudEngine: octagonCrudEngine });
octagonCommercialInbox = require('./vnext/server/notify/notify').mountNotify({ db: dbSync, authSessionFromRequest });
octagonViewsFields = require('./vnext/server/fields/custom-fields').createViewsFieldsHandler({ db: dbSync, sendJson, requireSession });
octagonPrintTemplates = require('./vnext/server/print/print-templates').mountPrintTemplates({ db: dbSync });
octagonWorkflowEngine = require('./vnext/server/workflow/workflow-engine').mountWorkflow({ db: dbSync, crudEngine: octagonCrudEngine, authSessionFromRequest, readRequestBody });
octagonDocState = require('./vnext/server/state/doc-state').mountDocState({ db: dbSync, authSessionFromRequest, readRequestBody, sendJson, workflowEngine: octagonWorkflowEngine });
```

**Add** (same style, right after the `octagonDocState = ...` line, still inside the `if (dbSync) { ... }` block):

```js
octagonModuleRoutes = require('./vnext/server/modules/module-routes').mountModuleRoutes({ db: dbSync, sendJson, readRequestBody, requireSession });
octagonOrgRoutes = require('./vnext/server/org/org-routes').mountOrgRoutes({ db: dbSync, sendJson, readRequestBody, requireSession });
octagonAuthRoutes = require('./vnext/server/auth/auth-routes').mountAuthRoutes({ db: dbSync, sendJson, readRequestBody, requireSession });
```

Passing the existing `requireSession` function (already defined at `server.js:1510`, already used
by `octagonViewsFields` above) is what makes admin/self checks in the new routes resolve real
sessions instead of falling back to their header-only test shim — the same pattern
`createViewsFieldsHandler` already uses.

---

## 4. Session rotation on privilege change (T1.14.1)

### 4a. Enforce revocation in `requireSession()`

**Anchor:** `server.js:1529-1537`, immediately after the existing `isUserDisabled` check:

```js
  try {
    const db = loadDbForMutation();
    const authHardening = require('./vnext/server/auth/auth-hardening');
    if (dbSync && authHardening.isUserDisabled(dbSync, active.session.userId)) {
      authSessions.delete(active.token);
      deletePersistedAuthSession(active.token);
      sendJson(res, 401, { success: false, error: 'تم إيقاف حساب هذا المستخدم' });
      return { ok: false };
    }
```

**Insert** one more check right after it, same shape:

```js
    if (dbSync && authHardening.isSessionRevoked(dbSync, active.session.userId, active.session.createdAt)) {
      authSessions.delete(active.token);
      deletePersistedAuthSession(active.token);
      sendJson(res, 401, { success: false, error: 'تم تحديث صلاحيات هذا الحساب، الرجاء تسجيل الدخول من جديد' });
      return { ok: false };
    }
```

### 4b. Call `rotateSessionsForUser()` wherever a user's role/groups change

No dedicated role-change endpoint exists in `server.js` today — role/group edits currently happen
through the generic full-DB-sync path (`POST /api/db`, `server.js:2128+`), which diffs the
incoming `users`/`employees` collections against the existing ones. Recommended call site: inside
that handler, after the existing tenant/ACL-strip logic (~`server.js:2190-2207`) and before
`saveDb(...)`, diff each user's `role`/`roleId`/`groups` field between `existing` and `parsed`; for
any user whose value changed, call:

```js
const authHardening = require('./vnext/server/auth/auth-hardening');
if (dbSync) authHardening.rotateSessionsForUser(dbSync, changedUser.id);
```

If/when a dedicated `PATCH /api/admin/users/:id` (or similar) role-change endpoint is added later,
call it there instead — this is a one-line addition regardless of where role changes end up living.

---

## 5. TOTP enrollment vs. the legacy login check

`server.js:1905-1911` currently checks `user.totpSecret` on the legacy JSON user object
(`userListFromDb(db)`). The new `POST /api/x/auth/totp/enroll` → `.../confirm` flow stores its
confirmed secret in the new `x_totp_enrollments` SQL table instead. Pick **one**:

**Option A (recommended — SQL becomes the source of truth):** replace the condition at
`server.js:1905`:

```js
if (user.totpSecret) {
```

with:

```js
const authHardening = require('./vnext/server/auth/auth-hardening');
const confirmedTotpSecret = dbSync ? authHardening.getConfirmedTotpSecret(dbSync, user.id) : null;
if (confirmedTotpSecret || user.totpSecret) {
```

and use `confirmedTotpSecret || user.totpSecret` in place of `user.totpSecret` inside the block at
`server.js:1908` (`authHardening.verifyTotp(confirmedTotpSecret || user.totpSecret, totpToken)`).
This keeps any pre-existing legacy `user.totpSecret` values working while making newly-enrolled
users work too.

**Option B (no server.js logic change, but a data-consistency step):** on
`confirmTotpEnrollment()` success, also mirror the secret onto the legacy user object's
`totpSecret` field via whatever the app's existing user-save path is. Not implemented by this
lane — Option A is simpler and does not require touching the legacy user-record write path.

---

## 6. Password policy: no live call site exists yet

There is no dedicated server-side "set/change password" endpoint in `server.js` — passwords are
hashed client-side in `app.js` (`hashPassword()` around lines 3426 and 3454) and persisted via the
generic `POST /api/db` full-sync path, so the server never sees a candidate password to validate.
This lane ships `POST /api/x/auth/password/validate` (no session required) as a ready-to-call
policy check; wiring it into `app.js`'s password-setup flow (client-side, before hashing) or into a
future dedicated server-side change-password endpoint is a follow-up outside every lane's current
owned paths. See `TASK.md` "Password-policy: no live server-side enforcement call site exists yet"
for the full trace.

---

## 7. Client asset wiring (optional, when a page is ready to embed the switcher)

`vnext/client/shell/company-switcher.js` + `.css` are new, standalone, opt-in files — nothing
currently loads them (same status as `vnext/client/inbox.js`/`chatter.js` before their own pages
adopted them; T1.1.3's audit finding about the entity UI not being "reachable via navigation"
applies equally here and is not fixed by this pass, since it requires editing the shared app shell,
which is off-limits for this lane). When a page opts in:

```html
<link rel="stylesheet" href="/vnext/client/shell/company-switcher.css">
<script src="/vnext/client/shell/company-switcher.js"></script>
<script>
  OX.companySwitcher.mount(document.getElementById('company-switcher-host'));
</script>
```

The static file handler already serves anything under `vnext/client/` unrestricted
(`R1_FINAL_COMPLETION_REPORT.md` T1.1.3 evidence, `server.js:2634-2676`) — no new static-serving
route is needed for these two files.

---

## Summary of new routes

| Method | Path | Auth |
|---|---|---|
| GET | `/api/x/modules` | admin |
| POST | `/api/x/modules/:id/install` | admin |
| POST | `/api/x/modules/:id/uninstall` | admin |
| POST | `/api/x/modules/:id/enable` | admin |
| POST | `/api/x/modules/:id/disable` | admin |
| GET | `/api/x/org/companies` | any session (scoped to accessible companies; admin sees all) |
| GET | `/api/x/org/branches?company_id=` | any session with access to that company |
| GET | `/api/x/org/departments?company_id=` | any session with access to that company |
| GET | `/api/x/org/warehouses?company_id=` | any session with access to that company |
| POST | `/api/x/org/companies/:id/access` | admin |
| POST | `/api/x/org/fiscal-years/generate` | admin |
| GET | `/api/x/org/active-company` | any session |
| POST | `/api/x/org/active-company` | any session with access to the target company |
| POST | `/api/x/auth/totp/enroll` | any session (self) |
| POST | `/api/x/auth/totp/confirm` | any session (self) |
| DELETE | `/api/x/auth/totp` | self, or admin via `?user_id=` |
| GET/PUT | `/api/x/auth/password-policy` | GET: any session · PUT: admin |
| POST | `/api/x/auth/password/validate` | none (pre-session usable) |
| POST/GET | `/api/x/auth/api-keys` | admin |
| DELETE | `/api/x/auth/api-keys/:id` | admin |
