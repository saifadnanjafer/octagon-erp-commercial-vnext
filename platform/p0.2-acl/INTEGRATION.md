# P0.2 — ACL matrix plain-HTTP adapter — INTEGRATION

`platform/server/acl.js` and `platform/client/acl-admin.js` already exist. This packet adds their plain-node:http bridge. The adapter must be dispatched **before** P0.1 CRUD so a denied request receives the ACL 403 envelope before CRUD can read its body or mutate data.

Apply exactly these three server lines (integrator only):

1. Next to the other `let octagon... = null;` declarations before `http.createServer`:

```js
let octagonAclHttp = null;
```

2. In the `http.createServer` callback, immediately before the current P0.1 CRUD line `if (octagonCrudEngine && octagonCrudEngine.handle(req, res, requestUrl)) return;`:

```js
if (octagonAclHttp && octagonAclHttp.handle(req, res, requestUrl)) return; // P0.2 ACL gate + Arabic matrix API; must precede CRUD
```

3. After `dbSync` has initialized and before mounting P0.1 CRUD (or directly after it; dispatch order above is what enforces the gate):

```js
if (dbSync) octagonAclHttp = require('./platform/server/acl-http-adapter').mountAclHttp({ db: dbSync, requireSession, sendJson, readRequestBody });
```

Add the existing P0.2 client script once in `index.html`, after the other `platform/client/*.js` tags:

```html
<script src="platform/client/acl-admin.js"></script>
```

The already-existing client calls live routes supplied by the adapter:

- `GET /api/x/_acl` — Arabic roles × entity × action matrix (admin ACL read)
- `PUT /api/x/_acl/:role` — saves a role matrix (admin ACL update)
- `GET /api/x/_meta/entities` — registered entity labels for the matrix UI

`own` grants filter list/summary and block another user's record. `dept` grants are deliberately 403 until a trustworthy session-to-department source exists; they are never widened to all-record access.
