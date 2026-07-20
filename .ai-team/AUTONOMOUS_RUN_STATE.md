# Autonomous Run State — Commercial VNext

Updated: 2026-07-19

## Current status

R9.3 Retail/POS correction batch complete and green.

## Completed batch

- Restored `migrations/903_r9_retail_pos_pack.mjs` to baseline.
- Added `migrations/904_r9_retail_pos_transactions.mjs` and
  `migrations/905_r9_retail_pos_governance.mjs` with explicit `dependsOn` and
  real `down()`.
- Added canonical `createAndPostFiscalDoc`/`createReversalFiscalDoc` helpers
  to `finance-engine.js`.
- Refactored `retail-pos-engine.js` to use canonical finance/stock/payment/
  tax/audit/event engines only; removed all direct `fiscal_doc`/`fiscal_doc_line`
  writes.
- Replaced parallel tax calculator with canonical `tax-engine.computeTaxes`.
- Implemented payment-method-specific account posting (cash/card/bank/ewallet/
  reference).
- Implemented complete return document persistence (own lines/taxes/payments).
- Implemented governed refunds with cumulative balance limits and
  payment-method-specific canonical flows.
- Implemented governed cancellation with atomic stock/GL/AR reversal.
- Created durable `retail-pos-manifest.json` loaded by runtime and tests.
- Hardened routes: removed local-dev bypass, enforced real sessions and
  canonical scope.
- Fixed 20 unrelated pre-existing provenance header gaps.

## Evidence

- `scripts/test-r9-retail-pos-pack.mjs`: **52/52 PASS**
- `scripts/test-r9-pack-sdk.mjs`: **7/7 PASS**
- `scripts/test-r9-workshop-pack.mjs`: **9/9 PASS**
- `scripts/test-migration-dependencies.mjs`: **30 PASS**
- `scripts/test-r6-pos-v2.mjs`: **13/13 PASS**
- `scripts/check-provenance.mjs`: **137/137 PASS**
- `scripts/check-r3-runtime-ddl.mjs`: **0 violations**
- `scripts/check-r3-frozen-zone.mjs`: **0 mutations**
- `scripts/precommit.js`: **PASS**
- `scripts/test-lane-finance-t2.1.1.mjs`: **PASS**
- `scripts/test-lane-finance-t2.1.3.mjs`: **PASS**
- `scripts/test-lane-finance-t2.2.1.mjs`: **PASS**
- `scripts/test-lane-finance-t2.3.1.mjs`: **PASS**
- `scripts/test-lane-finance-t2.4.1.mjs`: **PASS**
- `scripts/test-lane-stock-t2.5.1.mjs`: **PASS**
- `scripts/test-lane-stock-t2.5.2.mjs`: **PASS**
- `scripts/test-r2-t2.6-t2.8.mjs`: **27 PASS**
- `scripts/test-r3-migration-rollback-fingerprints.mjs`: **8 PASS**
- `scripts/test-blocker2-canonical-acl-key.mjs`: **PASS**
- `scripts/test-r3-core.mjs`: **19 PASS**
- `scripts/test-r3-http.mjs`: **25 PASS**
- `scripts/test-r3-atomicity-injection.mjs`: **77 PASS**

## Blockers

None.

## Known limitations

- Ewallet falls back to the store's cash account when no dedicated wallet
  clearing account is configured.
- AR credit notes offset receivables in reporting but do not reduce the
  original invoice's computed open amount in `documentOpenAmount`.

## Next authorized batch

None. Remaining R9.3 vertical packs (pharmacy, clinic, restaurant, etc.) are
not released. Do not begin another vertical pack without explicit owner
authorization.
