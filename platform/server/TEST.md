# TEST — P0.1 CRUD engine + P0.4 sequences/audit

All steps run against the throwaway harness (`_harness.js`, port 8123, own `_harness.db`) — **never** against the live server/database.db.

## 0. Dry require (accept: loads without error, no side effects)
```sh
cd "C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-erp"
node -e "require('./platform/server/crud-engine.js'); require('./platform/server/sequences.js'); require('./platform/server/audit.js'); console.log('require OK')"
```
Expected: `require OK` (no db/file access happens at load time).

## 1. Start the harness (fresh db)
```sh
cd "C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-erp\platform\server"
rm -f _harness.db _harness.db-wal _harness.db-shm
node _harness.js &
```
Expected: `[harness] CRUD engine test server on http://127.0.0.1:8123`.

## 2. Create → sequence assigned (P0.4)
```sh
curl -s -X POST http://127.0.0.1:8123/api/x/crm_lead/create -H "Content-Type: application/json" -H "x-user: tester" -d '{"name":"احمد التميمي","company":"شركة الاختبار","value":1500}'
curl -s -X POST http://127.0.0.1:8123/api/x/crm_lead/create -H "Content-Type: application/json" -d '{"name":"سارة","status":"qualified"}'
```
Expected: envelope `{"success":true,"data":{...},"error":null,"meta":null}`; first lead has `"seq":"LEAD-2026-00001"` and `"status":"new"` (registry default), second `"seq":"LEAD-2026-00002"` — **distinct sequential numbers** — and `created_by` = `tester` / `local`.

## 3. List — pagination, q, filter, sort
```sh
curl -s "http://127.0.0.1:8123/api/x/crm_lead/list?page=1&limit=10&sort=created_at:asc"
curl -s "http://127.0.0.1:8123/api/x/crm_lead/list?q=احمد"
curl -s --get "http://127.0.0.1:8123/api/x/crm_lead/list" --data-urlencode 'filter={"status":"qualified"}'
curl -s --get "http://127.0.0.1:8123/api/x/crm_lead/list" --data-urlencode 'filter={"value":{"gte":1000}}'
```
Expected: `meta:{"total":2,"page":1,"limit":10}` on the first call; the `q` call returns only احمد; the filter calls return 1 record each (equality + range via `json_extract`).

## 4. Update (PATCH merge)
Replace `<ID>` with the first lead's `id` from step 2:
```sh
curl -s -X PATCH http://127.0.0.1:8123/api/x/crm_lead/update/<ID> -H "Content-Type: application/json" -H "x-user: tester" -d '{"status":"won","value":9000}'
```
Expected: `success:true`, doc keeps `name`/`seq` and now has `status:"won"`, `value:9000`.

## 5. Summary (group-by status)
```sh
curl -s http://127.0.0.1:8123/api/x/crm_lead/summary
```
Expected: `{"success":true,"data":{"total":2,"status_key":"status","by_status":{"won":1,"qualified":1}},...}`.

## 6. History (P0.4 audit with before/after diffs)
```sh
curl -s http://127.0.0.1:8123/api/x/audit/crm_lead/<ID>
```
Expected: 2 rows newest-first — `update` row with `changes:{"status":{"from":"new","to":"won"},"value":{"from":1500,"to":9000}}`, then the `create` row (`before:null`).

## 7. Soft delete → gone from read/list, audit keeps it
```sh
curl -s -X DELETE http://127.0.0.1:8123/api/x/crm_lead/delete/<ID>
curl -s http://127.0.0.1:8123/api/x/crm_lead/read/<ID>
curl -s http://127.0.0.1:8123/api/x/crm_lead/summary
```
Expected: delete returns `{"id":"<ID>","removed":1}`; read now 404 in-envelope; summary total drops to 1; `/api/x/audit/crm_lead/<ID>` now has a `delete` row (`after:null`).

## 8. Guardrails
```sh
curl -s http://127.0.0.1:8123/api/x/nope/list            # 404: entity not registered
curl -s -X PUT http://127.0.0.1:8123/api/x/crm_lead/create # 405: unsupported route
curl -s --get "http://127.0.0.1:8123/api/x/crm_lead/list" --data-urlencode 'filter={"bad field!":"x"}'  # 400: invalid filter field
```
Expected: correct status codes, all in-envelope (`success:false`).

## 9. Other seed entities + monthly pattern
```sh
curl -s -X POST http://127.0.0.1:8123/api/x/helpdesk_ticket/create -H "Content-Type: application/json" -d '{"subject":"لا يعمل الطابع"}'
curl -s -X POST http://127.0.0.1:8123/api/x/product/create -H "Content-Type: application/json" -d '{"name":"مضخة ماء","sale_price":25}'
```
Expected: ticket seq like `TKT-202607-0001` ({YYYY}{MM} pattern), product `PRD-00001`.

## 10. Teardown (mandatory)
```sh
kill %1                      # or taskkill the node _harness.js pid
rm -f _harness.db _harness.db-wal _harness.db-shm
```

## Post-integration smoke (after INTEGRATION.md lines are applied by the integrator)
1. Restart the live server normally (single instance!).
2. `curl -s http://localhost:<port>/api/x/crm_lead/summary` → `success:true` envelope.
3. Verify legacy routes untouched: `/api/server/status` still answers; timesheet page loads.
