# P0.7 — Saved views + custom fields integration

Add exactly these **3 lines** to `octagon-erp/server.js`; the handler must be checked before the existing CRUD handler because both use `/api/x/`.

1. Next to `let octagonCrudEngine = null;`:

```js
let octagonViewsFields = null;
```

2. Immediately **before** `if (octagonCrudEngine && octagonCrudEngine.handle(req, res, requestUrl)) return;` in the request dispatcher:

```js
if (octagonViewsFields && octagonViewsFields.handle(req, res, requestUrl)) return; // P0.7 saved views + custom fields
```

3. After the CRUD engine mount (and after `dbSync` is available):

```js
if (dbSync) octagonViewsFields = require('./platform/server/views-fields').createViewsFieldsHandler({ db: dbSync, sendJson, requireSession });
```

Add this script tag to `octagon-erp/index.html` **after** `platform/client/ui-crud.js`:

```html
<script src="platform/client/views-fields.js"></script>
```

The extension is deliberately a separate, add-only client file: it wraps `OX.crud.mount`, adds Arabic save-view control, appends metadata fields to the table/form, and serializes their values into `x_records.data.custom{}`. It leaves P0.6's owned `ui-crud.js` untouched.

Endpoints:

- `GET|POST /api/x/_views/:entity`, `PATCH|DELETE /api/x/_views/:entity/:id` — owner-scoped, authenticated, audited.
- `GET|POST /api/x/_custom-fields/:entity`, `PATCH|DELETE /api/x/_custom-fields/:entity/:key` — read public to the mounted entity UI; writes require `system.admin` (or local trusted console), and are audited.
