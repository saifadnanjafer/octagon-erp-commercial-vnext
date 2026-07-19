# Lane B — Integration Contract (for the integrator to apply to `server.js`)

**Headline: zero required `server.js` changes.** Every new/changed route this
pass adds is served through mount points `server.js` **already** calls today:

- `octagonAclHttp = aclEngine.mountAclHttp({ db: dbSync, requireSession, sendJson, readRequestBody });`
  (existing line ~2850) now also serves `GET /api/x/_worklist/counts`
  (`vnext/server/acl/worklist-counts.js`, wired internally inside
  `acl-engine.js`'s own `handle()`), and `acl.entityAclKey()` /
  `acl.rowScopeAllows()` are new exports on the same already-required module.
- `octagonChatter = require('./vnext/server/chatter/chatter').mountChatterWithCrud({ db: dbSync, crudEngine: octagonCrudEngine });`
  (existing line ~2851) now also serves the three new attachment routes and
  `@mention` notifications — no signature change required, extra deps are
  optional (see below).
- `octagonCommercialInbox = require('./vnext/server/notify/notify').mountNotify({ db: dbSync, authSessionFromRequest });`
  (existing line ~2852) internally builds its approval handler via
  `createApprovalHandler(deps)` from `vnext/server/approvals/approvals.js`
  (see `vnext/server/notify/notify.js` line ~138: `const approvalHandler = createApprovalHandler(deps);`) —
  this already forwards through to `dispatch()`, so the new
  `POST /api/x/approvals/withdraw/:id` and `GET /api/x/approvals/counts`
  routes are live automatically.

No new `require()`, no new mount call, no new route-dispatch line needs to be
inserted into `server.js` for any of this pass's server-side work to be live.

## Optional (recommended, not required) enhancement

Around the existing block at `server.js` lines ~2848-2856:

```js
const aclEngine = require('./vnext/server/acl/acl-engine');
octagonCrudEngine = require('./vnext/server/crud/crud-engine').mountCrud({ db: dbSync, sendJson, readRequestBody, authSessionFromRequest });
octagonAclHttp = aclEngine.mountAclHttp({ db: dbSync, requireSession, sendJson, readRequestBody });
octagonChatter = require('./vnext/server/chatter/chatter').mountChatterWithCrud({ db: dbSync, crudEngine: octagonCrudEngine });
```

The chatter mount currently does **not** pass `authSessionFromRequest`
(unlike the CRUD engine mount right above it, which does). The new chatter
attachment ACL check (`checkRecordReadAccess`, gating upload/list/download)
resolves the caller via `deps.authSessionFromRequest` when present, and
falls back to `x-user`/`x-roles` headers when absent — it works correctly
either way, so this is a quality improvement, not a correctness requirement.
To have attachment ACL resolve real logged-in sessions (recommended for
production, matching the `octagonCrudEngine` mount's own convention),
change line ~2851 from:

```js
octagonChatter = require('./vnext/server/chatter/chatter').mountChatterWithCrud({ db: dbSync, crudEngine: octagonCrudEngine });
```

to:

```js
octagonChatter = require('./vnext/server/chatter/chatter').mountChatterWithCrud({ db: dbSync, crudEngine: octagonCrudEngine, authSessionFromRequest });
```

That is the **only** line this integration touches, and it is additive
(one new key in an existing object literal) — nothing else in `server.js`
needs to change.

## New routes introduced this pass (all served by existing mounts above)

| Method | Path | Handler |
|---|---|---|
| `POST` | `/api/x/approvals/withdraw/:id` | `approvals.js` |
| `GET`  | `/api/x/approvals/counts` | `approvals.js` |
| `POST` | `/api/x/chatter/:entity/:id/attachments` | `chatter.js` |
| `GET`  | `/api/x/chatter/:entity/:id/attachments` | `chatter.js` |
| `GET`  | `/api/x/chatter/attachments/:attachmentId` | `chatter.js` |
| `GET`  | `/api/x/_worklist/counts?entity=<name>` | `worklist-counts.js` (via `acl-engine.js`) |

## Client script tags

`vnext/client/inbox.js` was rewritten in place (same filename, same
`OX.inbox.mount(el, options)` public API as before) — any existing page that
already includes `<script src=".../vnext/client/inbox.js"></script>` picks up
the nine-box UI automatically with no markup changes. No new client file was
added for this pass, so no new `<script>` tag is required.

## Database

`migrations/202_r1_lane_b_completion.mjs` is picked up automatically by the
existing startup migration call in `server.js` (`runMigrations({ dbPath:
SQLITE_DB_FILE, direction: 'up' })`, around line ~2825) — no change needed
there either. See `TASK.md` "Flagged findings #2" for a pre-existing,
cross-lane migration-ordering caveat this migration defends against on its
own (not something the integrator needs to act on for this migration
specifically, but worth the integrator's awareness for the shared
`migration-runner.mjs`).
