# P0.2 — ACL matrix plain-HTTP adapter — TEST

## Disposable SQLite validation

From `octagon-erp` run:

```powershell
node platform/p0.2-acl/acl-http-harness.js
```

Expected output:

```text
P0.2 ACL plain-HTTP harness: PASS
denied create=403 before CRUD; legacy admin=create 200; matrix GET/PUT=200; own list/read scope=verified
```

The harness creates its SQLite file under the operating system temporary directory and deletes it on completion. It never opens `database.db`.

## Integrator smoke test (after applying `INTEGRATION.md`)

1. Start only the normal Octagon server. Do not start a second server against `database.db`.
2. As an admin, open `GET /api/x/_acl`; expect `{success:true}` with Arabic role labels and `actions`.
3. As a user without `sales:crm_lead:create`, `POST /api/x/crm_lead/create`; expect HTTP 403 and `{success:false,data:null,meta:{code:"FORBIDDEN"}}`. Confirm no record was created.
4. As the local admin/session, create a demo lead; expect HTTP 200.
5. Load `platform/client/acl-admin.js`, then call `OX.aclAdmin.mount(host)` in the Platform host. Expect the Arabic RTL role/entity/action matrix and a successful save.
