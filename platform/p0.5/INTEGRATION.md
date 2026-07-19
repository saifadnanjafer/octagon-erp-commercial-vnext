# P0.5 — Notification + Approval Center — INTEGRATION

Apply exactly these three lines to `octagon-erp/server.js` (the main integrator only).

1. Next to the other `let octagon... = null;` declarations before `http.createServer`:

```js
let octagonCommercialInbox = null;
```

2. In the `http.createServer` callback, after the mounted CRUD handler and before legacy/static fallback routes:

```js
if (octagonCommercialInbox && octagonCommercialInbox.handle(req, res, requestUrl)) return; // P0.5 /api/x/notify + /api/x/approvals
```

3. After `dbSync` is initialized (and after the P0.1 CRUD mount is fine), mount once:

```js
if (dbSync) octagonCommercialInbox = require('./platform/server/notify').mountNotify({ db: dbSync, authSessionFromRequest });
```

Add this script tag in `octagon-erp/index.html` after the other `platform/client/*.js` tags, before any Home widget calls `OX.inbox.mount(...)`:

```html
<script src="platform/client/inbox.js"></script>
```

The Home host calls `OX.inbox.mount(hostElement)`. The module owns no legacy page or navigation changes.
