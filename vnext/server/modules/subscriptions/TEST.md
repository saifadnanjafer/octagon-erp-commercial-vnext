# R6.2 Subscriptions & dunning test contract

`scripts/test-r6-subscriptions.mjs` uses a disposable SQLite database and proves:

- plan creation and retrieval;
- subscription creation with trial or active start state;
- recurring billing run generating posted AR customer invoices;
- idempotency of recurring billing runs (no double billing);
- mid-cycle upgrade/downgrade plan changes with correct proration math;
- proration invoicing (upgrade) and credit note (downgrade) posting;
- aging-triggered dunning reminders (rung 1-4);
- subscription suspension at rung 3 and cancellation at rung 4;
- interest charge calculation and posting on overdue invoices;
- MRR and churn KPI calculation;
- company scope and permissions on all routes;
- migration 632 schema restoration on down.
