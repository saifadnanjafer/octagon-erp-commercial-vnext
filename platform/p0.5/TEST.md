# P0.5 — Notification + Approval Center — acceptance test

Use a throwaway SQLite file and a disposable Node HTTP harness only. Do not start another server against `database.db`.

1. Run the safe load checks from `octagon-erp`:

   ```powershell
   node -e "require('./platform/server/notify'); require('./platform/server/approvals'); console.log('P0.5 modules load')"
   ```

2. Mount `require('./platform/server/notify').mountNotify({ db: throwawayDb })` in a mini HTTP harness on port `8125`; send `x-user: requester` for the requester and `x-user: manager`, `x-roles: manager` for the approver.

3. `POST /api/x/approvals/request` with `{ "entity":"crm_lead", "record_id":"lead_demo", "action":"submit", "approver_role":"manager", "payload":{}, "cc":["observer"] }`. Expect `201` and `{success:true,data.status:"pending"}`.

4. `GET /api/x/approvals/list?box=todo` as the manager. Expect the pending record. `POST /api/x/approvals/approve/:id` as the manager. Expect `approved`.

5. `GET /api/x/notify/list` as the requester. Expect the generated approval-decision notification; `POST /api/x/notify/mark-read/:id` then list again. Expect `meta.unread` to decrease.

6. In the Browser pane after integration, run `OX.inbox.mount(document.querySelector('#your-home-widget-host'))`; verify the Arabic RTL approval and notification cards render, approval-box tabs work, and the unread badge refreshes (polling every 30 seconds).
