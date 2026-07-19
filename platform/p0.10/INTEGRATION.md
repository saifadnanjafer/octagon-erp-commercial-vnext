# P0.10 — Workflow v2 integration

The integrator applies these **three** additions to `octagon-erp/server.js` only after P0.1/P0.5 are mounted.

1. Next to the other `let octagon... = null;` declarations:

```js
let octagonWorkflowEngine = null;
```

2. In the `http.createServer` dispatcher, **before** `octagonCrudEngine.handle(...)` so the workflow routes do not get claimed by generic `/api/x/*` handling:

```js
if (octagonWorkflowEngine && octagonWorkflowEngine.handle(req, res, requestUrl)) return; // P0.10 /api/x/workflows
```

3. After `octagonCrudEngine` and `octagonCommercialInbox` are mounted:

```js
if (dbSync) octagonWorkflowEngine = require('./platform/server/workflow').mountWorkflow({ db: dbSync, crudEngine: octagonCrudEngine, authSessionFromRequest, readRequestBody });
```

Add this script tag in `octagon-erp/index.html` after the other `platform/client/*.js` tags:

```html
<script src="platform/client/workflow-builder.js"></script>
```

Usage from the Platform or Intelligence host: `OX.workflow.mount(hostElement)`. The server engine subscribes to P0.1's post-write hook and runs due schedule workflows on a single unref'd local poll; it never opens a second database connection.
