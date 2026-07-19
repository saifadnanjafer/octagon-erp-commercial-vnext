# R6.2 integration

- `migrations/632_r6_subscriptions.mjs` depends on `631_r6_pos_v2` and owns all subscription and dunning tables.
- `subscription-engine.js` is the domain owner. Its transaction boundary is self-managed.
- `subscription-routes.js` is mounted after POS routes at `/api/x/subscriptions`.
- Recurring billing run calls the existing finance/AR engine to generate posted customer invoices and updates next bill dates.
- Proration calculates mid-cycle upgrade/downgrade difference and posts a corresponding customer invoice or credit note.
- Dunning ladder tracks overdue invoices and applies reminder rungs, interest charges, and subscription suspension/cancellation.
