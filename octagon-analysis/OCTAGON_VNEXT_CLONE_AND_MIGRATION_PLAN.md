# Octagon VNext — Clone, Isolation & Migration Plan
Authority level 9. No Git anywhere (repo is broken; `git worktree=C:/`). All isolation is filesystem-based.

## 1. Target directory model
```
Downloads/odoo-19.0/
├── octagon-erp/                    ← CURRENT PRODUCTION. Preserved, untouched during VNext build.
├── octagon-erp-commercial-vnext/   ← NEW commercial generation (created at R0).
├── octagon-donor-sources/          ← read-only donor repos (relocate from erp-research/ or symlink); reference only.
├── octagon-analysis/               ← this analysis track (authoritative blueprint).
└── erp-research/                   ← raw donor inventories + superseded fast-build plan (kept for provenance).
```
Proposed VNext product version string: **`Octagon Commercial 1.0.0-vnext`** (kernel `0.x` until R2 finance passes reconciliation tests).

## 2. Pre-clone procedure (run once, at R0)
1. **Inventory** every current source file: `find octagon-erp -type f -not -path '*/node_modules/*' > octagon-analysis/_manifests/current-files.txt`.
2. **Exclude** from the clone: `node_modules/`, `*.db`, `*.db-wal`, `*.db-shm`, `db-backups/`, `release-backups/`, `*.log`, `server-*.log`, secrets/keys, uploads, `.env*`, donor repos, temp/cache. (Runtime data and secrets never travel into the fork.)
3. **Timestamped source backup** of production first: copy `octagon-erp/` → `release-backups/pre-vnext-clone-<YYYYMMDD_HHMMSS>/` (and POST `/api/backup` for the live DB) **before** creating the fork.
4. **SHA-256 manifest** of critical files (server.js, app.js, index.html, modules/*, services/*, schema/seed files) → `_manifests/critical-sha256.txt`. Lets us prove production was unchanged after the fork.
5. **Copy** code (not data) → `octagon-erp-commercial-vnext/` honoring the exclude list.
6. **Sanitized DB for the fork**: copy production `database.db` → fork, then run a scrub script that (a) keeps schema + demo, (b) leaves the frozen employee/timesheet/payroll collections byte-identical for compatibility testing, (c) points the fork's config at its own DB file. **The fork must never open the production `database.db`.**
7. **Isolate runtime**: fork gets its own **port** (e.g. 8091 vs prod 8090), **DB path**, **backup folder**, **env file**. Add a boot-time guard that refuses to start if its configured DB path resolves to the production file.
8. **Verify**: boot the fork against its copied DB; confirm it serves; then re-verify production SHA-256 manifest is unchanged (fork creation touched nothing in `octagon-erp/`).
9. **Clone manifest** → `_manifests/clone-manifest.md`: source path, dest path, excluded globs, file counts, timestamps, port/DB assignments.
10. **Migration baseline** → snapshot of the current data model (collections, key fields, record counts) as the "from" state for migrations.

## 3. Environment isolation checklist
- [ ] Separate port (prod 8090 / vnext 8091 / test-harness 812x).
- [ ] Separate `database.db` path; boot guard rejects prod path.
- [ ] Separate backup + release folders.
- [ ] Separate `.env`/config; no shared secret files.
- [ ] Never run both servers against the same DB (SQLite WAL corruption — known incident).
- [ ] Fork DB opened WAL + busy_timeout (existing pattern) but on its own file.

## 4. Compatibility layer (the migration spine)
VNext does not rewrite legacy data in place. It reads through adapters and dual-writes forward:
- **Frozen domains (payroll/timesheet/attendance):** VNext consumes them **read-only** through a `LegacyPayrollAdapter`; it never writes their records or alters their calc functions. HR module embeds existing timesheet UI as-is behind the adapter. Any VNext posting that needs payroll figures calls the adapter, which calls the approved legacy logic.
- **Finance:** VNext GL engine posts through the existing legacy→v6 bridge (`PentagonDB` / `account_moves`) during transition, mirroring into the new immutable `x_gl`-style tables; a reconciliation test asserts both agree before cutover.
- **Legacy JSON store:** the current app persists to a **JSON-blob table `collections(collection, id, data TEXT)` in `database.db` via `node:sqlite`** (Truth Audit §2), mirrored to client `omni.*`/localStorage. A `LegacyEntityAdapter` reads these JSON collections and maps them to VNext relational collections; backfills are idempotent (guard flags), never destructive.
- **Two-worlds reconciliation (critical):** the same `database.db` already holds TWO parallel data models — the app's JSON `collections` and the W0 spike's relational `x_*` tables — which never meet (Truth Audit §5). VNext migration must treat the JSON `collections` as the source of truth for real data and the `x_*` tables as an unused feasibility artifact; do not assume `x_*` holds live data. Engine choice for the fork: keep `node:sqlite DatabaseSync` (not better-sqlite3) to match the existing runtime.

## 5. Migration sequencing (executes at R10, not during build)
1. Freeze-and-snapshot production data (backup verified).
2. Run schema-creation migrations on fork (idempotent).
3. Backfill masters (companies, branches, users, roles, customers, suppliers, items, accounts) via adapters.
4. Backfill open transactions (open invoices, POs, stock balances) as **opening entries** into immutable ledgers — never replay history into the live ledger; import balances as of a cut date.
5. Reconcile: fork trial balance + stock valuation must match production as-of cut date (tolerance 0). Payroll regression suite green.
6. Pilot one company/branch on the fork in parallel with production (dual-run) for one full cycle (a payroll month + a finance close).
7. Cutover per tenant when its reconciliation + pilot sign-off pass; keep production available for rollback.

## 6. Rollback strategy
- Every migration step is reversible or re-runnable (idempotent + snapshot before). Cutover is per-tenant, so blast radius = one company.
- Rollback = repoint that tenant to production (untouched) + discard fork tenant data; no production mutation ever occurred, so rollback is switching a pointer, not restoring a backup.
- Keep the pre-vnext-clone backup until every pilot tenant has passed a full close on the fork.

## 7. Pilot strategy
- Pick the workshop (existing, best-understood data) as pilot tenant.
- Success gates: (a) payroll month closes byte-identical to legacy; (b) finance month closes and reconciles; (c) no data-integrity or permission-bypass defects; (d) users complete core flows without falling back to the old app.
- Only after pilot sign-off does R10 declare commercial-ready.

## 8. Hard prohibitions
- No Git commands anywhere.
- No feature implementation inside `octagon-erp/` (production) — VNext work lives only in the fork.
- Fork never opens production DB; migrations never mutate production.
- Frozen payroll/timesheet behavior never changes without owner authorization + passing regression tests.
