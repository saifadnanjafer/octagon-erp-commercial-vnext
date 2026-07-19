# T3.1.1 Product and pricing core

Extends the R2 `product_master` canonical entity with categories, goods/services behavior, UOMs, barcodes, variants, partner references, price lists, deterministic rules, promotions, coupons, and explain traces. Schema is migration-owned by 610/611; HTTP is mounted by the R3 integrator.

Frozen boundaries: no duplicate product model, no accounting/stock ledger replacement, and no sensitive offline command.
