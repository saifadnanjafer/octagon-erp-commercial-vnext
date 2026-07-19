# R6.1 POS v2 test contract

`scripts/test-r6-pos-v2.mjs` uses a disposable SQLite database and proves:

- terminal and session lifecycle;
- server-calculated line totals;
- same-key/same-payload exactly-once replay;
- same-key/different-payload conflict;
- company-scoped product validation;
- bounded refunds tied to the original session;
- token-scoped QR self-order draft capture;
- `/api/vnext/commands` delegation for `pos.sale`;
- prohibited offline command rejection;
- Z-report cash/card/refund/variance totals;
- balanced posted GL lines;
- closed-session write rejection;
- migration 631 schema restoration on down.

Result at the R6.1 handoff: **13 PASS, 0 FAIL, 0 SKIP**.
