# INTEGRATION — P0.1 CRUD engine + P0.4 sequences/audit

Exactly **3 lines** to add to `octagon-erp/server.js` (integrator applies them; agents never edit server.js).

Note: server.js is plain `http.createServer` + `node:sqlite` (NOT Express / better-sqlite3), so the engine mounts via the same `handle(req, res, requestUrl)` pattern as `jarvisSecurity` and `octagonScheduler`.

## Line 1 — top-level declaration
Next to `let octagonScheduler = null;` (currently line ~1767, just before `const server = http.createServer(...)`):

```js
let octagonCrudEngine = null;
```

## Line 2 — request dispatch
Inside the `http.createServer` callback, directly after the scheduler line `if (octagonScheduler && octagonScheduler.handle(req, res, requestUrl)) return;` (currently line ~1777):

```js
if (octagonCrudEngine && octagonCrudEngine.handle(req, res, requestUrl)) return; // P0.1 /api/x/* platform CRUD
```

## Line 3 — mount after the database is ready
Directly after the `octagonScheduler = installOctagonScheduler({ ... });` block (currently ends line ~2762 — must be after `initializeDatabase()` so `dbSync` exists):

```js
if (dbSync) octagonCrudEngine = require('./platform/server/crud-engine').mountCrud({ db: dbSync, sendJson, readRequestBody, authSessionFromRequest });
```

## What mounting does
- Runs `platform/server/x-tables.sql` (all `CREATE TABLE IF NOT EXISTS` — idempotent, safe every boot).
- Loads `platform/server/entities.json` and serves `/api/x/:entity/...` for registered entities only (envelope `{success,data,error,meta}`); everything else on `/api/x/` answers 404 in-envelope.
- `created_by` comes from the injected `authSessionFromRequest` (login cookie), falling back to the `x-user` header, then `'local'`.
- Later packets attach via `octagonCrudEngine.subscribe((entity, action, record) => ...)` (chatter P0.3, workflow P0.10) — no server.js change needed for that.

## Not integrated / no risk
- If `dbSync` is null (degraded JSON mode) the engine simply never mounts; `/api/x/*` falls through to static 404. No legacy route, table, or collection is touched.
- `_harness.js` and `_harness.db*` are test-only artifacts; never require them from server.js.
