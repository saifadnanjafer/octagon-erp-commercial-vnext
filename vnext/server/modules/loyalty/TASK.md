# R6.3 Loyalty & membership engine

Points earn/redeem programs, membership cards with automatic tier evaluation, gift card registry and transaction logs, and partner eWallet deposits/credits.

Frozen boundaries:
- Existing `partner_master`, product, and finance primitives remain canonical.
- Points, eWallet balance adjustments, and gift card loads/redemptions are append-only.
- Row-level company and tenant isolation are enforced on all routes.
