# R3 test inventory

| Suite | Command | Result |
|---|---|---|
| Core disposable vertical slice | `node scripts/test-r3-core.mjs` | 19 PASS / 0 FAIL / 0 SKIP |
| HTTP/bootstrap/authz/PWA entry | `node scripts/test-r3-http.mjs` | 25 PASS / 0 FAIL / 0 SKIP |
| Migration dependency/rollback | `node scripts/test-migration-dependencies.mjs` | 30 PASS / 0 FAIL |
| R3 SQLite rollback fingerprints | `node scripts/test-r3-migration-rollback-fingerprints.mjs` | 8 PASS / 0 FAIL / 0 SKIP |
| Runtime DDL scan | `node scripts/check-r3-runtime-ddl.mjs` | 0 violations expected |
| Frozen-zone scan | `node scripts/check-r3-frozen-zone.mjs` | 0 mutation references expected |
| R3 provenance | `node scripts/check-r3-provenance.mjs` | 21/21 PASS |
| Syntax | `node --check` on server, R3 services/routes/client | PASS |
| R2.5.1 regression | `node scripts/test-lane-stock-t2.5.1.mjs` | 21 PASS / 0 FAIL |
| R3 blocker closure | `node scripts/test-r3-blocker-closure.mjs` | 29 PASS / 0 FAIL / 0 SKIP |
| R3 authenticated Chrome browser | `node scripts/test-r3-authenticated-browser.mjs` | 5 PASS / 0 FAIL / 0 SKIP: desktop/tablet/mobile RTL and desktop/mobile LTR |
| R3 legacy workshop bridge | `node scripts/test-r3-legacy-workshop-bridge.mjs` | 3 PASS / 0 FAIL / 0 SKIP; fixture-only read-only bridge |
| R2.5.2 regression | `node scripts/test-lane-stock-t2.5.2.mjs` | 19 PASS / 0 FAIL |
| R2 T2.6-T2.8 regression | `node scripts/test-r2-t2.6-t2.8.mjs` | 27 PASS / 0 FAIL / 0 SKIP |
| Permission regression | `node scripts/permission-regression.mjs` | 35 PASS / 0 FAIL |
| T2.O10.1 connectivity | `node scripts/test-t2-o10-connectivity.mjs` | 11 PASS / 0 FAIL / 0 SKIP |

The focused remediation suites above are green. Record-scoped ACL, landed-cost valuation GL/reversal, business-hours SLA pause/resume, and atomic rollback coverage are now proven in focused tests. This does not close the external gate: full domain-depth, complete command-by-command atomicity audit, subcontract valuation, live legacy bridge, and operational UI acceptance remain open. R0/R1/R2 evidence was rerun for the listed regression suites; no R4 work was started.
