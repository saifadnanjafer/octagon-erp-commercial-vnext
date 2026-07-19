# P0.6 — TEST checklist (no server needed)

Open `octagon-erp/platform/client/demo.html` in a browser (double-click / file:// is fine — it ships an inline fetch stub that fakes the whole `/api/x` contract with 25 leads, 12 tickets, 15 products, incl. simulated 120ms latency).

## Checklist

| # | Step | Expected |
|---|------|----------|
| 1 | Page loads | RTL Arabic page, dark Octagon theme, "العملاء المحتملون (CRM)" title, no console errors |
| 2 | Summary cards | 6 cards (الإجمالي/جديد/تم التواصل/مؤهل/فوز/خسارة) with non-zero counts matching data |
| 3 | Table renders | 20 rows (page size), Arabic headers, status column shows colored pill badges, numbers formatted with thousands separators |
| 4 | Pagination | Footer shows "إجمالي: 25 — صفحة 1 من 2"; التالي goes to page 2 (5 rows); page buttons highlight current |
| 5 | Sort | Click "الاسم" header → ▲ appears, rows re-sort (server-side; goes back to page 1). Click again → ▼ desc |
| 6 | Search (debounced) | Type "شركة" in بحث → after ~300ms table shows only matching rows; cards unchanged; clear → full list returns |
| 7 | Filter | Choose الحالة: فوز → only فوز rows; combined with search works; الكل resets |
| 8 | Views dropdown | Visible but disabled with tooltip (OX.views not loaded) — placeholder behavior per spec |
| 9 | Create (drawer) | جديد → drawer slides in from the left (RTL end); save with empty الاسم → red validation box "«الاسم» حقل مطلوب" + toast-fallback; fill name+status → حفظ → drawer closes, row appears, cards update |
| 10 | Edit | Row ⋮ → تعديل → drawer pre-filled; change value → حفظ → table updates |
| 11 | Detail + chatter | Row ⋮ → عرض → detail drawer lists all fields (label/value) + "المحادثة والسجل" section containing div `id="chatter-crm_lead-<id>"` with the OX.chatter placeholder text |
| 12 | Delete | Row ⋮ → حذف → confirm dialog → row disappears, total decreases |
| 13 | Print / Export / Import | Row ⋮ → طباعة and toolbar تصدير/استيراد → info toast "غير محمّلة بعد" (placeholders calling OX.print/OX.excel when loaded) |
| 14 | Relation field | Switch to تذاكر الدعم tab → جديد → type in العميل field → dropdown of leads fetched from `/api/x/crm_lead/list?q=` appears; pick one → saved ticket shows the lead name in العميل column |
| 15 | Entity switch | All three tabs (leads/tickets/products) render from config only — badges for ticket priority+status, product numbers columns |
| 16 | Empty state | Search gibberish ("xyzxyz") → "لا توجد سجلات مطابقة للبحث/التصفية" + create button |
| 17 | Error state | (Optional) In DevTools set `OX.crud._internals` aside and block requests, or edit the stub to fail → error state with إعادة المحاولة button |
| 18 | RTL/Arabic | Every visible string Arabic; table aligns right; drawer opens on the physical left (inline-end); numbers render LTR inside RTL text |

## Verified 2026-07-17 (Browser pane, file:// load)

- Steps 1–7, 9–16, 18: PASS (see agent report). Step 8 PASS (disabled dropdown). Step 17 not exercised (stub always up).
- Console: clean (no errors/warnings from oxc files).

## Against the real server (after P0.1 integration)

Same checklist, plus: sequences/created_by populated, ACL 403 envelope surfaces as the Arabic error state, chatter widget replaces the placeholder in step 11.
