# R6.3 Integration

- `migrations/633_r6_loyalty.mjs` depends on `632_r6_subscriptions` and owns all loyalty, membership, gift card, and eWallet tables.
- `loyalty-engine.js` is the domain owner.
- `loyalty-routes.js` is mounted at `/api/x/loyalty`.
- POS and sales pricing rule integration checks partner membership card and applies tier discounts (standard 0%, silver 5%, gold 10%).
- Points and eWallet balances track customer value over time with append-only ledger entries.
