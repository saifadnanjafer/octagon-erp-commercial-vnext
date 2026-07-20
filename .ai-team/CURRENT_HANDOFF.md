# Current Handoff — Commercial VNext

Updated: 2026-07-20

## Completed slice

R9.4 Marketplace & Pack Distribution. Closes the R9 core release gate
(Pack SDK + Workshop pack + Retail/POS pack + Marketplace/distribution),
without claiming the remaining R9.3 industry vertical packs are complete.

## What was built

1. **Signed pack format (`.octapack`)** — `vnext/server/modules/packs/pack-crypto.js`.
   A JSON container: `{format_version, compat, files[{path,sha256,size,content_b64}],
   signer_id, signature_algorithm, signature}`. `manifest.json` is one of the
   inventoried files, so the Ed25519 signature — computed over
   `canonicalize({compat, files: sortedInventory})` — transitively covers the
   canonical manifest bytes, the full file inventory, every file checksum, and
   the compatibility metadata. Any changed byte anywhere invalidates the
   signature. Verification always recomputes every file's sha256 from its
   actual content before trusting the declared checksum.
2. **Trusted signer registry** — new `shop_marketplace_signer` table
   (company-scoped signer_id/public_key/fingerprint/status/validity/publisher).
   Rejects unknown, revoked, expired, malformed, and unsupported-algorithm
   signers. Private keys are never stored server-side; tests generate
   disposable Ed25519 keypairs with `crypto.generateKeyPairSync`.
3. **Safe ingestion** — path traversal, absolute paths, `..` segments,
   duplicate normalized paths, non-declarative file types (only
   `.json/.md/.txt`; nothing ever executes from a pack), oversized
   package/file limits, malformed JSON, checksum mismatch, and
   missing/undeclared content-file cross-checks — all enforced before any
   registry/patch mutation.
4. **Compatibility matrix** — platform version range, Pack SDK API version
   range, dependency presence/version range, conflicting installed packs,
   edition sufficiency, and paid/trial entitlement (both reuse the R8.2
   `licensing-engine`, not a new engine). `previewInstall` reports every
   failing reason at once without mutating state; `installPack`/`upgradePack`
   fail before any mutation with one precise `{code, message}`.
5. **Catalog & lifecycle** — new `shop_marketplace_pack` table
   (`vnext/server/modules/packs/marketplace-engine.js`) with persisted states
   `verified/rejected/installed/disabled/superseded` and a live-computed
   `installable` label. Install/upgrade/disable/enable/uninstall all call
   straight into the canonical `pack-sdk-engine` (a new, additive
   `upgradePack` capability was added there — no duplicate installation
   engine). Every lifecycle write is one atomic transaction; an outbox
   failure rolls back the registry/patch/audit/event effects together
   (proven with the same trigger-injection technique as the R9.3 suite).
   A failed upgrade leaves the prior installed version exactly as it was
   (transaction rollback, not manual snapshot/restore).
6. **Pack Manager UI** — `vnext/client/modules/marketplace/index.js`,
   registered into the existing `r3-ui.js` kernel (same pattern as
   `legacy-workshop`). Catalog / Trusted Signers / Import tabs; Arabic-first
   RTL with the shared English/LTR toggle; loading/empty/error/unauthorized/
   forbidden states; preview/install/upgrade/disable/enable/uninstall
   actions; rejection-reason and compatibility-reason detail panels. No raw
   JSON as the primary UI. All decisions remain server-authoritative.
7. **Security** — `marketplace-routes.js` is thin: requires a real session,
   rejects local-dev bypass, resolves company scope server-side, and accepts
   no identity/entitlement/trust input from the request body.

## Migration

`migrations/907_r9_marketplace_pack_distribution.mjs` — `dependsOn:
['906_r9_retail_pos_payment_governance']`. Adds `shop_marketplace_signer` and
`shop_marketplace_pack` only (no changes to 901–906). Real `down()` drops both
tables and their indexes.

## Files changed

- `migrations/907_r9_marketplace_pack_distribution.mjs` (new)
- `vnext/server/modules/packs/pack-crypto.js` (new)
- `vnext/server/modules/packs/marketplace-engine.js` (new)
- `vnext/server/modules/packs/marketplace-routes.js` (new)
- `vnext/server/modules/packs/pack-sdk-engine.js` (added `upgradePack`)
- `vnext/client/modules/marketplace/index.js` (new)
- `vnext/client/r3.html` (registered the new module script tag)
- `vnext/client/r3.css` (added marketplace lifecycle/entitlement chip colors)
- `server.js` (mounted `octagonMarketplaceRoutes`)
- `scripts/test-r9-marketplace-distribution.mjs` (new)
- `VNEXT_PROGRESS.md`, `.ai-team/CURRENT_HANDOFF.md`,
  `.ai-team/AUTONOMOUS_RUN_STATE.md`,
  `octagon-analysis/OCTAGON_VNEXT_MASTER_ROADMAP.md`,
  `octagon-analysis/OCTAGON_VNEXT_EXECUTION_PLAN.md`

## Evidence

| Command | Result |
|---|---|
| `node --check` on all changed JS/MJS | OK |
| `node scripts/test-r9-marketplace-distribution.mjs` | **39/39 PASS** |
| `node scripts/test-r9-pack-sdk.mjs` | **7/7 PASS** |
| `node scripts/test-r9-workshop-pack.mjs` | **9/9 PASS** |
| `node scripts/test-r9-retail-pos-pack.mjs` | **59/59 PASS** |
| `node scripts/test-migration-dependencies.mjs` | **30/30 PASS** |
| `node scripts/test-r6-pos-v2.mjs` | **13/13 PASS** |
| `node scripts/check-provenance.mjs` | **142/142 PASS** |
| `node scripts/check-r3-runtime-ddl.mjs` | **0 violations** |
| `node scripts/check-r3-frozen-zone.mjs` | **0 mutations** |
| `node scripts/precommit.js` | **PASS** |
| `node scripts/test-r8-licensing.mjs` | **7/7 PASS** |
| `node scripts/permission-regression.mjs` | **35/35 PASS** |
| `node scripts/test-blocker2-canonical-acl-key.mjs` | **ALL PASSED** |
| `node scripts/test-r3-migration-rollback-fingerprints.mjs` | **8/8 PASS** |
| `node scripts/test-r3-atomicity-injection.mjs` | **77/77 PASS** |

## Repository state

Git checkout is valid at the repository root
`C:/Users/Zahraa dlbooz/Downloads/odoo-19.0/octagon-erp-commercial-vnext`.
Branch `automation/r9-marketplace-distribution`, created from
`automation/r9-retail-pos` at commit `d9754c214ccc048f8ef74c7893429ad841433ffa`.
No production databases or production data were touched; no signing private
keys were committed (tests generate disposable keypairs at run time).

## Project Metrics & Completion

- Total decomposed roadmap tasks: **71**
- Completed Tasks Count (unweighted item count): **64/71** (R9.4 marketplace/distribution gate now closes the R9 core technical release; remaining R9.3 vertical packs stay open)
- Core Technical Platform Completion: **100%** (Releases 0-8, R9.1, R9.2, R9.4 complete; R9.3 delivered Retail/POS only)
- Commercial Readiness Estimate: **87%** (pending remaining R9.3 industry vertical packs — pharmacy, clinic, restaurant, fleet, education, contracting — and Release 10 migration/piloting)
- Overall Product Completion: **87%**

## R9 release status

**R9 CORE RELEASE GATE PASSED.** Pack SDK, Workshop pack, Retail/POS pack,
and Marketplace/distribution all pass their focused suites, and both Workshop
and Retail/POS install/uninstall cleanly through the signed `.octapack`
package path. This is the platform/distribution core gate only. It does
**not** mean all R9.3 industry vertical packs are complete — pharmacy,
clinic, restaurant, fleet, education, and contracting packs remain unstarted,
explicit future/optional work distributable later through this same
marketplace pipeline. Full commercial GA is not claimed before Release 10.

## Known limitations

- Pack "migrations" are declarative metadata only — a pack may declare which
  already-applied platform migration ids it requires, but it cannot ship its
  own executable schema DDL (by design, consistent with the project's
  no-runtime-DDL invariant). Real schema changes for a pack still ship as a
  reviewed, numbered file under `migrations/`.
- "Disable" toggles the catalog/lifecycle state and blocks upgrade/reinstall,
  but does not retract already-applied registry patches — no runtime module
  in this codebase currently gates behavior on pack-enabled state.
- Trial-entitlement expiry is computed from `installed_at + pricing.trial_days`
  at read time rather than driven by a scheduled background job.
- The Pack Manager UI was verified by static syntax/structure checks and the
  route-layer test suite (which exercises the exact API contract the UI
  consumes), not by a live browser click-through — starting the real
  `server.js` against this repo's local `database.json`/`database.db` was
  avoided to honor "do not touch production files, databases, or data."

## Exact next task

Do not begin another vertical pack without explicit owner authorization. The
next authorized task is either (a) one additional R9.3 industry-specific
vertical pack (pharmacy, clinic, restaurant, fleet, education, contracting),
distributed through this same marketplace pipeline, or (b) Release 10
migration and validation planning.
