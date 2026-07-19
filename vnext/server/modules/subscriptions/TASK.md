# R6.2 Subscriptions & dunning

Subscriptions recurring plans, lifecycle transitions, proration, recurring billing runs, and aging-triggered dunning ladders.

Frozen boundaries:
- Existing `product_master`, finance, partner, audit, and event primitives remain canonical.
- Subscription billing posts through the balanced finance/AR posting engine.
- No nested transaction: subscriptions module manages its own transaction, and finance posting joins it.
- Row-level company and tenant isolation are enforced on all routes.
