# R6.1 integration

- `migrations/631_r6_pos_v2.mjs` depends on `630_r5_hr_additive` and owns all POS tables.
- `pos-engine.js` is the domain owner. Its transaction boundary is self-managed.
- `pos-routes.js` is mounted after R3 routes at `/api/x/pos`.
- The connectivity foundation delegates only `pos.sale` from `/api/vnext/commands` to
  `pos-engine.syncSale`; all other offline commands remain fail-closed.
- Session close calls the existing finance engine while already inside the POS
  transaction, producing the canonical Z-report journal and audit evidence.
- The client offline store permits only the explicit `pos.sale` capture command;
  server replay requires an authenticated session and matching company scope.

R6.1 focused gate is complete. R6.2–R6.7 remain unstarted and are not included
in this integration boundary.
