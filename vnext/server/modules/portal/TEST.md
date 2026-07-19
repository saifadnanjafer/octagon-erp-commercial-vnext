# R6.4 Customer & vendor portals test contract

`scripts/test-r6-portal.mjs` uses a disposable SQLite database and proves:

- linking portal users to partner profiles;
- customer dashboard metrics;
- listing customer quotes and approving a quote (with auto-SO promotion);
- listing customer invoices;
- partner ledger statement queries (opening balance, debit/credit running transactions, closing balance);
- vendor dashboard metrics;
- listing vendor RFQs and submitting vendor quotes/bids;
- listing vendor POs and accepting/rejecting a PO;
- listing vendor bills;
- IDOR safety check (unlinked user or cross-partner access rejection);
- company scope and permissions on all routes;
- migration 634 schema restoration on down.
