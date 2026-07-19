# R6.6 Integration

- `migrations/636_r6_ecommerce.mjs` depends on `635_r6_booking` and extends `product_master` with website attributes, and creates `ecommerce_cart` / `ecommerce_cart_line` tables.
- `ecommerce-engine.js` is the domain owner.
- `ecommerce-routes.js` is mounted at `/api/x/ecommerce`.
- Catalog views and cart updates operate as open/public endpoints using session tokens, allowing guest usage.
- Order checkout transitions active carts to completed state and registers standard draft sales orders and lines inside the sales ledger.
