# P0.6 — Config-driven CRUD UI (client) — INTEGRATION

## Script/link tags to add (integrator applies — files never edit index.html themselves)

Add to `octagon-erp/index.html`, **after** `style.css` and **before** any code that calls `OX.crud`:

```html
<link rel="stylesheet" href="platform/client/ui-crud.css">
<script src="platform/client/ui-crud.js"></script>
<script src="platform/client/entity-ui-registry.js"></script>
```

(For the W1 section pages: same three tags in `sections/_template.html` / section runtime bundle instead.)

Load order within the platform bundle (all optional except ui-crud itself):

1. `ui-crud.js` (this packet) — defines `OX.crud`
2. `entity-ui-registry.js` (this packet) — defines `OX.entityUI`
3. `chatter.js` (P0.3), `excel.js` (P0.8), `print.js` (P0.9), views hook (P0.7) — feature-detected at call time, any order, any subset.

## Usage

```js
// by registry key (preferred — zero entity-specific code):
OX.crud.mountEntity(document.getElementById('someHost'), 'crm_lead');

// or with an inline config:
OX.crud.mount(el, OX.entityUI.helpdesk_ticket);
```

`mount()` returns the instance (`.refresh()` to reload). Re-mounting on the same element is safe (listeners are detached first).

## Server contract this client codes against (build-book §4)

- `POST /api/x/:entity/create` — body = flat field object
- `GET  /api/x/:entity/read/:id`
- `PATCH /api/x/:entity/update/:id` — body = flat field object (partial ok)
- `DELETE /api/x/:entity/delete/:id` — soft delete
- `GET  /api/x/:entity/list?page&limit&sort&q&filter=<json>`
  - `sort` is sent as `key:dir` (e.g. `sort=created_at:desc`) — **server must parse this format** (§4 left the value format unspecified).
  - `filter` is a JSON equality map `{"status":"new"}`.
- `GET  /api/x/:entity/summary` — client accepts `{total|count, byStatus|by_status|statuses}` (object map or `[{status,count}]` array).

Envelope everywhere: `{success, data, error, meta:{total,page,limit}}`.
List rows may be server-shaped (`{id, data:{...}, created_at,...}`) or flat — the client normalizes both.

## Hooks exposed to sibling packets

- `OX.chatter.mount(el, entity, id)` — called inside the detail drawer; container div id is `chatter-<entity>-<id>`.
- `OX.excel.exportList(entity, {q, filter, sort, columns})` / `OX.excel.importInto(entity, {form, onDone})`
- `OX.print.record(entity, id)`
- `OX.views.list(entity) -> [{id, name, config:{q, filters, sort}}]` (sync or Promise) — populates the views dropdown; missing = dropdown disabled.

## Adding a new entity tab

1. Add the entity block to `platform/server/entities.json` (P0.1).
2. Add a config block to `platform/client/entity-ui-registry.js` (same shape as the 3 seeds).
3. `OX.crud.mountEntity(el, '<key>')` — done.
