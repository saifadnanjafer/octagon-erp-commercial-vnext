# P0.7 acceptance test

From `octagon-erp` run only against the throwaway in-memory SQLite harness:

```powershell
node -e "require('./platform/server/views-fields.js')"
node platform/server/views-fields-harness.js
```

Expected: both commands succeed; the harness reports all saved-view ownership, custom-field metadata, admin-denial, and audit assertions as `PASS`.

After integration (one running production server only):

1. Mount the demo `crm_lead` CRUD tab and select a filter; press **حفظ العرض**, name it, reload the tab, and select it from **طرق العرض**. The original filters/search/sort return.
2. As a system admin, `POST /api/x/_custom-fields/crm_lead` with `{ "key":"source_city", "label_ar":"مدينة المصدر", "type":"select", "options":[{"value":"baghdad","label_ar":"بغداد"}] }`.
3. Reopen the CRUD tab. **مدينة المصدر** appears as a table column and an Arabic form selector. Save a lead and confirm its `GET /api/x/crm_lead/read/:id` response has `data.custom.source_city` (not a flat legacy field).
4. Confirm a non-admin custom-field POST receives a `403` envelope and `x_audit` contains the successful writes.
