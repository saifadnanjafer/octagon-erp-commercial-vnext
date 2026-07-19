# P0.10 — Workflow v2 acceptance test

All live checks use the isolated harness on port **8126** and an in-memory SQLite database. They never open `database.db`.

1. Syntax/load check:

```powershell
node -e "require('./platform/server/workflow.js')"
```

2. Full isolated acceptance flow:

```powershell
node platform/p0.10/workflow-harness.js
```

Expected: `PASS` for workflow creation, `crm_lead` creation trigger, sales-role notification, append-only run log, manual execution, frozen-data rejection, and API envelope; exit code `0`.

3. After the integrator applies `INTEGRATION.md`, use the Browser pane: open the Platform workflow host, create a workflow named `عميل محتمل جديد → إشعار المبيعات` with trigger `crm_lead / تم الإنشاء`, add an **إشعار** node with role `sales`, and save. Create a lead through the P0.6 demo tab. The new run appears in **سجل التشغيل** and P0.5 inbox shows the notification for `role:sales`.
