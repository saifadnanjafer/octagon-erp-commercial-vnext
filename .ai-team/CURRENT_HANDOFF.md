# Current Handoff — Commercial VNext

Updated: 2026-07-19

## Completed slice

R9.3 Retail/POS correction batch. The prior implementation passed its own
tests but violated project guardrails and had incomplete business logic. This
correction reworks it completely before reporting completion.

## Corrections applied

1. **Migration governance**: `migrations/903_r9_retail_pos_pack.mjs` restored
   to committed baseline. New `904_r9_retail_pos_transactions.mjs` and
   `905_r9_retail_pos_governance.mjs` added with explicit `dependsOn`, real
   `up()`/`down()`, and migration-dependency coverage.
2. **Canonical fiscal docs**: Added `createAndPostFiscalDoc` and
   `createReversalFiscalDoc` to `finance-engine.js`. Retail/POS no longer
   directly INSERT/UPDATEs `fiscal_doc` or `fiscal_doc_line`.
3. **Canonical tax**: Replaced parallel tax calculator with
   `tax-engine.computeTaxes`. Supports percentage, fixed (with quantity),
   price-included/excluded, fiscal positions, and repartition lines.
4. **Payment-method accounting**: Cash/card/bank/ewallet post to their
   configured clearing accounts; reference sales create canonical AR documents
   with proper income/tax/receivable split.
5. **Return persistence**: Returns create complete Retail source documents
   with own lines, taxes, payments, and durable original/reversal links.
6. **Governed refunds**: Limited to posted transactions, open shift required,
   cumulative balance enforcement, idempotency, and payment-method-specific
   canonical flows (cash/card/bank/ewallet via finance helper; reference via
   AR credit note).
7. **Governed cancellation**: Posted-ticket cancellation atomically reverses
   stock (via `stock.cancelStockMove`), GL, tax, and AR/AP while keeping the
   original fiscal document immutable and posted.
8. **Canonical stock reversal**: Uses `stock.cancelStockMove` instead of
   manually reproducing business rules.
9. **Real manifest**: Durable `retail-pos-manifest.json` loaded by both
   runtime and tests. Defines pack identity, permissions, collections,
   workflows, patches, and conformance metadata.
10. **Route hardening**: Removed local-dev bypass. All routes require real
    sessions, server-derived identity, canonical scope resolution, and correct
    permissions.
11. **Audit/worklist/outbox/events**: Sensitive operations create canonical
    evidence through `r3-infra.recordWrite` and the events service.

## Files changed

- `migrations/905_r9_retail_pos_governance.mjs` (new)
- `vnext/server/modules/packs/retail-pos-manifest.json` (new)
- `vnext/server/finance/finance-engine.js`
- `vnext/server/modules/packs/retail-pos-engine.js`
- `vnext/server/modules/packs/retail-pos-routes.js`
- `scripts/test-r9-retail-pos-pack.mjs`
- `.ai-team/CURRENT_HANDOFF.md`
- `.ai-team/AUTONOMOUS_RUN_STATE.md`
- `VNEXT_PROGRESS.md`

## Evidence

| Command | Result |
|---|---|
| `node --check` on all changed JS/MJS | OK |
| `node scripts/test-r9-retail-pos-pack.mjs` | **57/57 PASS** |
| `node scripts/test-r9-pack-sdk.mjs` | **7/7 PASS** |
| `node scripts/test-r9-workshop-pack.mjs` | **9/9 PASS** |
| `node scripts/test-migration-dependencies.mjs` | **30 PASS** |
| `node scripts/test-r6-pos-v2.mjs` | **13/13 PASS** |
| `node scripts/check-provenance.mjs` | **137/137 PASS** |
| `node scripts/check-r3-runtime-ddl.mjs` | **0 violations** |
| `node scripts/check-r3-frozen-zone.mjs` | **0 mutations** |
| `node scripts/precommit.js` | **PASS** |
| `node scripts/test-lane-finance-t2.1.1.mjs` | **PASS** |
| `node scripts/test-lane-finance-t2.1.3.mjs` | **PASS** |
| `node scripts/test-lane-finance-t2.2.1.mjs` | **PASS** |
| `node scripts/test-lane-finance-t2.3.1.mjs` | **PASS** |
| `node scripts/test-lane-finance-t2.4.1.mjs` | **PASS** |
| `node scripts/test-lane-stock-t2.5.1.mjs` | **PASS** |
| `node scripts/test-lane-stock-t2.5.2.mjs` | **PASS** |
| `node scripts/test-r2-t2.6-t2.8.mjs` | **27 PASS** |
| `node scripts/test-r3-migration-rollback-fingerprints.mjs` | **8 PASS** |
| `node scripts/test-blocker2-canonical-acl-key.mjs` | **PASS** |
| `node scripts/test-r3-core.mjs` | **19 PASS** |
| `node scripts/test-r3-http.mjs` | **25 PASS** |
| `node scripts/test-r3-atomicity-injection.mjs` | **77 PASS** |

## Repository state

Git checkout is valid at the repository root
`C:/Users/Zahraa dlbooz/Downloads/odoo-19.0/octagon-erp-commercial-vnext`.
Branch `automation/r9-retail-pos` is clean and up to date with origin. No
production databases or production data were touched.

## Project Metrics & Completion
- Total decomposed roadmap tasks: **71**
- Completed Tasks Count (unweighted item count): **63/71**
- Core Technical Platform Completion: **100%** (Releases 0-8, R9.1, R9.2 complete)
- Commercial Readiness Estimate: **85%** (pending remaining R9.3 industry vertical packs and Release 10 migration/piloting)
- Overall Product Completion: **85%**

## Known limitations

- None. POS engines enforce strict eWallet account configuration and reject transaction fallback to cash.

## Exact next task

The actual next authorized task is the completion of the remaining R9.3 industry-specific vertical packs (pharmacy, clinic, restaurant, etc.) or Release 10 migration and validation. Do not begin another vertical pack without explicit owner authorization.
