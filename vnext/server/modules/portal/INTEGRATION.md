# R6.4 Integration

- `migrations/634_r6_portal.mjs` depends on `633_r6_loyalty` and owns the `portal_user_link` table.
- `portal-engine.js` is the domain owner.
- `portal-routes.js` is mounted at `/api/x/portal`.
- Enforces strict own-partner scoping predicates for all customer/vendor requests: users must be linked to a partner in `portal_user_link` or access is rejected (403).
- Customers can view quotes, approve quotes (which auto-promotes quotes to draft sales orders), view invoices, and query partner ledger statements.
- Vendors can view RFQs, submit quotes/bids, confirm/reject purchase orders, and check bill statuses.
