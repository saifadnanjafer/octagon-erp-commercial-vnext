# R6.1 POS v2

POS terminal profiles, session open/close, offline capture with replay-safe
idempotency, QR self-order drafts, refunds tied to their original session, and
canonical Z-report posting through the existing finance engine.

Frozen boundaries:

- Offline replay records a sale only; it never posts GL, stock, payment, or approval effects.
- Server-derived session actor, tenant, and company scope are mandatory.
- Existing `product_master`, finance, audit, event, and connectivity primitives remain canonical.
- No nested transaction: POS owns its command/session transaction, and finance posting joins it.
