# Lane C completion — INTEGRATION (server.js changes, applied by the integrator)

This lane does not edit `server.js`. Below are the exact lines the
integrator needs to add. All variable names (`dbSync`, `octagonCrudEngine`,
`sendJson`, `readRequestBody`, `authSessionFromRequest`, `requireSession`)
match the names already declared in `server.js` around the existing R1
mount block (`server.js:2848-2856`).

## 1. Wire the snapshot-fields module (T1.5.1)

**Anchor:** insert **after** the existing
`octagonCrudEngine = require('./vnext/server/crud/crud-engine').mountCrud({...})`
line (`server.js:2849`) and **after**
`octagonViewsFields = require('./vnext/server/fields/custom-fields').createViewsFieldsHandler({...})`
(`server.js:2853`) — order relative to the other mounts in that block
otherwise doesn't matter, since this module registers hooks rather than
handling routes itself (`.handle()` is not called for it in the request
pipeline — no `server.js:18xx` dispatcher line is needed).

```js
// after line ~2853 (octagonViewsFields = ...), inside the `if (dbSync) { ... }` block:
const octagonSnapshotFields = require('./vnext/server/fields/snapshot-fields').createSnapshotFieldsModule({
  db: dbSync,
  crudEngine: octagonCrudEngine, // optional — omitting it skips the best-effort immutability guard but materialization still works
});
```

No new route dispatch line is needed in the `http.createServer((req, res) => {...})`
pipeline (`server.js:1801-1827`) — this module has no `.handle()` method; it
only registers an `audit.subscribeAudit()` listener (fires on every
`writeAudit()` call app-wide) and, if `crudEngine` is passed, an
`engine.subscribe()` listener (fires on every CRUD write).

**Known gap to route to the right lane later (see TASK.md "Immutability"
section for full detail):** true pre-write `403` blocking of edits to an
already-frozen snapshot field needs a hook inside `crud-engine.js`'s
`updateRecord()` / `acl-engine.js`'s `checkForbiddenWrites()` — neither file
is owned by this lane. What's wired today is a best-effort **post-write
self-heal** (reverts + audits the illegal write after the fact).

## 2. `vnext/client/history-panel.js` — client `<script>` include (T1.4.2)

This lane does not edit `demo.html`, `chatter-demo.html`, or any shared app
shell HTML. When the integrator (or the lane owning `ui-crud.js`/the record
drawer) wants the history panel available, add:

```html
<link rel="stylesheet" href="vnext/client/history-panel.css">
<script src="vnext/client/history-panel.js"></script>
```

Load order: any time after (or independent of) `chatter.js` — there is no
hard dependency between the two widgets; `history-panel.js` does not read
`window.OX.chatter` or vice versa.

**Suggested drawer wiring** (mirrors the existing `chatter-<entity>-<id>`
container-id convention documented in `vnext/client/INTEGRATION.md`
"Hooks exposed to sibling packets"):

```js
// inside ui-crud.js's detail-drawer render, alongside the existing
// chatter-<entity>-<id> div:
// <div id="history-<entity>-<id>"></div>
if (window.OX && OX.historyPanel) {
  OX.historyPanel.mount(document.getElementById('history-' + entity + '-' + id), entity, id);
}
```

This is documentation only — no shared file was edited by this lane to add
it. `vnext/client/history-demo.html` is a fully self-contained standalone
demo (own `fetch` stub, no server) if you want to see it render without
wiring it into the drawer first.

## 3. `vnext/server/notify/notify.js` — no server.js change needed (T1.8.1)

The existing `octagonCommercialInbox = require('./vnext/server/notify/notify').mountNotify({...})`
line (`server.js:2852`) is unchanged — `mountNotify()`'s signature and
return shape are identical. The only difference is that
`x_notification_preferences` is now guaranteed present by
`migrations/302_r1_lane_c_completion.mjs` (which the existing
`import('./vnext/server/db/migration-runner.mjs').then(...)` block at
`server.js:2825-2846` already runs before any route mounts) instead of being
created inside `mountNotify()` itself.

## 4. Cross-lane migration-ordering defect (blocking, reported not fixed)

**This is not this lane's own migration** (`migrations/302` has no ordering
dependency on `501` — see TASK.md), but it blocks the shared migration
runner entirely, so it will affect the integrator's own boot testing:
`migrations/102_r1_lane_a_completion.mjs`, `202_r1_lane_b_completion.mjs`,
and `402_r1_lane_d_completion.mjs` all `ALTER TABLE`/reference tables
created by `migrations/501_r1_kernel_completion.mjs`, but
`vnext/server/db/migration-runner.mjs` applies migrations in plain
filename-alphabetical order (`102` before `501`), so
`server.js`'s own startup `runMigrations({direction:'up'})` call
(`server.js:2825-2826`) will currently throw
`no such table: x_doc_state_defs` on any fresh `vnext-data/vnext.db`. See
`vnext/server/fields/TASK.md` "Cross-lane finding" for the full trace and
suggested fixes. Not fixed here — outside this lane's owned paths
(`migration-runner.mjs` is shared; `102`/`202`/`402`/`501` belong to other
lanes or are the flagged cross-cutting migration).

## Isolated testing — reserved DB/port for this lane

Per the 2026-07-17 coordinator correction: this lane's own tests
(`scripts/test-lane-c-completion.mjs`) use `vnext-data/test-lane-c.db`
(never `vnext-data/vnext.db`) and bind no network port (in-process mock
`req`/`res`, same as the existing kernel-completion suite). Port `8123`
(this lane's reserved slot in the `8120-8129` guardrail range) is reserved
for a future real HTTP-level test if one is ever added; nothing currently
binds it.
