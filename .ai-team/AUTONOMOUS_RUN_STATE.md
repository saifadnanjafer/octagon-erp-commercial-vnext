# Autonomous Run State — Commercial VNext

Updated: 2026-07-20

## Current status

R9.4 Marketplace & Pack Distribution complete and green. R9 core release
gate (Pack SDK + Workshop + Retail/POS + Marketplace/distribution) passed.

## Completed batch

- Added `migrations/907_r9_marketplace_pack_distribution.mjs`
  (`dependsOn: ['906_r9_retail_pos_payment_governance']`), adding
  `shop_marketplace_signer` and `shop_marketplace_pack` only.
- Added `vnext/server/modules/packs/pack-crypto.js`: deterministic
  `.octapack` canonicalization, Ed25519 signing/verification, path/size/type
  safety checks, checksum recomputation, missing/undeclared content-file
  cross-checks.
- Added `vnext/server/modules/packs/marketplace-engine.js`: trusted signer
  registry, compatibility/entitlement matrix (reuses `licensing-engine`,
  not a new engine), catalog/lifecycle (verified/rejected/installed/
  disabled/superseded + live-computed `installable`), and
  install/upgrade/disable/enable/uninstall — every mutation calls the
  canonical `pack-sdk-engine`, never a duplicate installation path.
- Added an additive `upgradePack` export to `pack-sdk-engine.js` (extends the
  canonical engine; registry row id stays stable across an upgrade, patch set
  is atomically replaced).
- Added `vnext/server/modules/packs/marketplace-routes.js`: thin routes,
  real session required, local-dev bypass rejected, company scope resolved
  server-side, no identity/entitlement/trust accepted from the request body.
  Mounted in `server.js` as `octagonMarketplaceRoutes`.
- Added `vnext/client/modules/marketplace/index.js`: Pack Manager UI
  registered into the existing `r3-ui.js` kernel (same convention as
  `legacy-workshop`); Catalog/Trusted-Signers/Import tabs; Arabic-first RTL
  with English/LTR toggle; loading/empty/error/unauthorized/forbidden states;
  install-preview/install/upgrade/disable/enable/uninstall actions.
- Added `scripts/test-r9-marketplace-distribution.mjs`: 39 focused scenarios,
  including a clean install+uninstall of the real R9.3
  `retail-pos-manifest.json` and a Workshop-shaped manifest through the full
  signed-package lifecycle (install → upgrade → disable/enable → uninstall).

## Evidence

- `scripts/test-r9-marketplace-distribution.mjs`: **39/39 PASS**
- `scripts/test-r9-pack-sdk.mjs`: **7/7 PASS**
- `scripts/test-r9-workshop-pack.mjs`: **9/9 PASS**
- `scripts/test-r9-retail-pos-pack.mjs`: **59/59 PASS**
- `scripts/test-migration-dependencies.mjs`: **30/30 PASS**
- `scripts/test-r6-pos-v2.mjs`: **13/13 PASS**
- `scripts/check-provenance.mjs`: **142/142 PASS**
- `scripts/check-r3-runtime-ddl.mjs`: **0 violations**
- `scripts/check-r3-frozen-zone.mjs`: **0 mutations**
- `scripts/precommit.js`: **PASS**
- `scripts/test-r8-licensing.mjs`: **7/7 PASS**
- `scripts/permission-regression.mjs`: **35/35 PASS**
- `scripts/test-blocker2-canonical-acl-key.mjs`: **ALL PASSED**
- `scripts/test-r3-migration-rollback-fingerprints.mjs`: **8/8 PASS**
- `scripts/test-r3-atomicity-injection.mjs`: **77/77 PASS**

## Blockers

None.

## Project Metrics & Completion

- Total decomposed roadmap tasks: **71**
- Completed Tasks Count (unweighted item count): **64/71**
- Core Technical Platform Completion: **100%** (Releases 0-8, R9.1, R9.2, R9.4 complete; R9.3 delivered Retail/POS only)
- Commercial Readiness Estimate: **87%** (pending remaining R9.3 industry vertical packs and Release 10 migration/piloting)
- Overall Product Completion: **87%**

## R9 release status

**R9 CORE RELEASE GATE PASSED**: Pack SDK, Workshop pack, Retail/POS pack,
and Marketplace/distribution all pass, and Workshop + Retail/POS both
install/uninstall cleanly through the signed package path. This does not mean
all R9.3 industry vertical packs are complete — pharmacy, clinic, restaurant,
fleet, education, and contracting packs remain unstarted, explicit
future/optional work. Full commercial GA is not claimed before Release 10.

## Known limitations

- Pack "migrations" are declarative metadata only (required already-applied
  platform migration ids); a pack cannot ship its own executable schema DDL.
  Real schema changes still ship as reviewed, numbered files under
  `migrations/`.
- "Disable" toggles catalog/lifecycle state and blocks upgrade/reinstall but
  does not retract already-applied registry patches — no runtime module in
  this codebase gates behavior on pack-enabled state today.
- Trial-entitlement expiry is computed at read time from
  `installed_at + pricing.trial_days`, not by a scheduled job.
- The Pack Manager UI was verified via static syntax/structure checks and the
  route-layer test suite, not a live browser click-through (avoided starting
  the real server against this repo's local database file).

## Next authorized batch

Do not begin another vertical pack without explicit owner authorization. The
next authorized task is either one additional R9.3 industry-specific
vertical pack (pharmacy, clinic, restaurant, fleet, education, contracting),
distributed through this same marketplace pipeline, or Release 10 migration
and validation planning.
