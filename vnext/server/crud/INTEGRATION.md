# Lane A — R1 repair pass — INTEGRATION

Two changes needed in `server.js`. Lane A does not edit `server.js` itself —
apply these verbatim.

## 1. Wire the posted-document immutability guard (T1.3.1b)

**File:** `server.js`, line **2856** (current text, inside the
`if (dbSync) { ... }` block that mounts the VNext engines, right after
`octagonWorkflowEngine` is mounted on line 2855):

```js
octagonDocState = require('./vnext/server/state/doc-state').mountDocState({ db: dbSync, authSessionFromRequest, readRequestBody, sendJson, workflowEngine: octagonWorkflowEngine });
```

**Change to** (adds `crudEngine: octagonCrudEngine` — one new property, same
pattern already used one line above for `octagonWorkflowEngine` and on line
2851 for `octagonChatter`):

```js
octagonDocState = require('./vnext/server/state/doc-state').mountDocState({ db: dbSync, authSessionFromRequest, readRequestBody, sendJson, workflowEngine: octagonWorkflowEngine, crudEngine: octagonCrudEngine });
```

**Why:** `doc-state.js`'s `mountDocState()` now registers a pre-write veto
guard on the CRUD engine — but only `if (deps.crudEngine && typeof
deps.crudEngine.registerGuard === 'function')`. Without this one property
added, `doc-state.js` behaves exactly as it did before (no guard, backward
compatible) and the T1.3.1(b) posted-document immutability invariant is not
actually enforced at runtime, even though the code to enforce it is present.
`octagonCrudEngine` is already constructed on line 2849, before line 2856
runs, so it is available at this point — no reordering needed.

No other `server.js` line needs to change for T1.1.2 or T1.3.1(a) — both are
fully contained inside `vnext/server/crud/crud-engine.js` and
`vnext/server/state/doc-state.js`, which are already `require()`'d and
mounted by the existing lines 2849 and 2856.

## 2. Static-file allowlist for the client demo pages (T1.1.3)

**Do not** rely on the current static handler in `server.js`
(~line 2634-2636):

```js
let filePath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
filePath = path.join(__dirname, decodeURIComponent(filePath));
```

This has no allowlist — literally any path under the repo root is servable
today. Per the coordinator's correction, Lane A is not treating "it already
works via the open handler" as sufficient, and understands the integrator is
replacing this with an explicit allowlist rather than leaving it wide open.
The files below are the exact, complete list this lane's new/fixed client UI
needs allowlisted (all under `vnext/client/`, all flat, no subfolders):

| URL path | Purpose |
|---|---|
| `/vnext/client/demo.html` | T1.1.3 entry point — mounts `OX.crud.mountEntity(host, 'crm_lead')` (+ `helpdesk_ticket`, `product` tabs) against a self-contained fetch stub. |
| `/vnext/client/chatter-demo.html` | Existing chatter widget demo (P0.3), same static-reachability class of gap. |
| `/vnext/client/ui-crud.js` | Defines `OX.crud` — required by `demo.html`. |
| `/vnext/client/ui-crud.css` | Stylesheet for `ui-crud.js`'s DOM — required by `demo.html`. |
| `/vnext/client/entity-ui-registry.js` | Defines `OX.entityUI` (per-entity column/form config) — required by `demo.html`. |
| `/vnext/client/chatter.js` | Defines `OX.chatter` — required by `chatter-demo.html`, and used by `demo.html`'s detail-drawer chatter section if present. |
| `/vnext/client/chatter.css` | Stylesheet for `chatter.js` — required by `chatter-demo.html`. |

`demo.html` also loads `../../style.css` (the main Octagon theme, one level
above `vnext/client/`, i.e. the existing app-root `style.css`) for `:root`
CSS variables — that file should already be on any existing allowlist since
it's part of the main app shell; flagging it here only so it isn't missed
when the new allowlist is scoped.

The other files this lane fixed for mojibake
(`acl-admin.js`, `excel.js`, `home-widgets.js`, `inbox.js`, `print.js`,
`views-fields.js`, `workflow-builder.js`) are optional collaborators
feature-detected by `ui-crud.js` at call time (`OX.views`/`OX.excel`/
`OX.print`, etc.) — not required for `demo.html` to load and function, but
harmless to allowlist alongside the rest of `vnext/client/*.js` if the
integrator prefers a single blanket rule over a hand-picked list, since they
are all now mojibake-free and syntax-checked.

**Reachable URL once allowlisted:** `http://localhost:<port>/vnext/client/demo.html`
(port per `.env`'s `PORT=8091`, or whatever `ACTIVE_PORT` resolves to at
runtime).

### Nav-link wiring for real discoverability

Not done by this lane — no nav/menu file is in Lane A's owned paths. If
real end-user discoverability (a click path from the main app shell, not
just a known URL) is desired, the integrator would add a link/button to the
existing settings/admin nav pointing at `/vnext/client/demo.html`. This is a
judgment call for whoever owns the nav menu, not a functional requirement —
the CRUD UI itself is fully reachable and working once the allowlist above
is in place.

## What was verified before writing this file

- `octagonCrudEngine` (line 2849) exposes `registerGuard` (new — see
  `vnext/server/crud/crud-engine.js`), confirmed by the isolated test
  script (`scripts/test-lane-a-completion.mjs`, Suite 3) mounting both
  engines together exactly as the integration line above does and
  asserting the guard fires end-to-end.
- `demo.html`'s script tags (`ui-crud.js`, `entity-ui-registry.js`) and its
  `OX.crud.mountEntity(..., 'crm_lead')` call were verified present by the
  same test script (Suite 4.2).
- The full file list above was verified to return `200` from an isolated,
  explicitly-allowlisted static server on port 8121 in the same test run
  (Suite 4.3) — a stand-in proving the *files* are servable; it does not
  and cannot substitute for the actual `server.js` allowlist, which only
  the integrator can add.
