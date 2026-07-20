# Octagon Commercial VNext — R0 Completion Report

Completed 2026-07-17 under `EXECUTE OCTAGON COMMERCIAL VNEXT — R0 ISOLATION ONLY`. This report preserves the accepted R0.1 evidence and adds the authorized R0.2–R0.4 work. R1 remains blocked.

## Release result

**R0 exit: PASS.** The isolated fork is independently runnable, the production critical manifest remains identical, legal provenance is enforced, frozen payroll access is read-only against a sanitized fixture, and the migration/scope baseline is reversible and tested.

## R0.1 isolation and evidence reconciliation

| Requirement | Result | Evidence |
|---|---|---|
| Production source / fork | `C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-erp` → `C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-erp-commercial-vnext` | `_manifests/clone-manifest.md` |
| Production critical identity | PASS — 366/366 SHA-256 entries identical before/final-current comparison | `_manifests/critical-sha256-pre.txt`, `_manifests/critical-sha256-post.txt`, `_manifests/r0-production-critical-current-comparison.json` |
| All copied-source hashes | PASS — 862/862 current source/fork pairs hashed: 859 identical, 3 intentional divergences, 0 unexpected | `_manifests/r0-current-source-fork-sha256.json` |
| Intentional copied-file divergences | `.gitignore` (exclude fixtures/backups), `CONTRIBUTING.md` (R0.2 license/provenance policy), `server.js` (R0.1 isolation controls) | `_manifests/r0-current-source-fork-sha256.json` |
| `server.js` divergence | Source `8f2532c9ce0761cf64bc7ac6f9c83e2194db40a6353bc3246b5841074a2a4074`; fork `e5c51bc769d91d7d7aff6856e10c47b6ec9efceaa6f8a6d604bcaddafc77d03b` | `_manifests/r0-server-divergence.json` |
| Isolation controls in divergence | Reject production JSON and SQLite paths before initialization; non-zero refusal; VNext health generation; fork-only upload and crash-log paths | `_manifests/r0-server-divergence.json` |
| Environment / secrets | PASS — separate physical `.env`; 16 VNext-only path/port/guard keys; no secret-like keys or values detected; production `.env` was not copied | `_manifests/r0-environment-isolation.json` |
| Runtime DB / backup paths | `vnext-data/vnext.db`; `vnext-backups/`; VNext uploads/attachments/reports/log paths only | fork `.env`, `scripts/r0-isolation-smoke.mjs` |
| Boot smoke | PASS — port 8091, `GET /api/health` reports `generation: "vnext"`, root HTTP 200 | `scripts/r0-isolation-smoke.mjs` |
| Startup guard | PASS — production JSON and SQLite cases each exited 1 before initialization | `scripts/test-r0-startup-guard.mjs` |
| SQLite integrity | PASS — VNext runtime `PRAGMA integrity_check = ok` | `scripts/r0-isolation-smoke.mjs` |

Validation results are intentionally separate:

- Syntax: PASS — `node --check` for `server.js`, `app.js`, `omni-ai-assistant.js`, and `omni-language-fix.js`.
- Route-health total: PASS — 96/96 current sidebar page ids are mapped by the route/permission baseline assertion. This is a static route inventory total, not a claim that an interactive browser route sweep was rerun.
- Permission regression total: PASS — 35/35 assertions (`scripts/permission-regression.mjs`).
- Boot smoke: PASS — isolated health and root response as above.
- SQLite integrity: PASS — runtime DB and sanitized fixture each returned `ok`.

Excluded at fork creation: production `database.db`, `database.json`, `.env`, backups, logs, uploads/attachments, `node_modules`, donor trees, and other runtime/secret-bearing material. They were excluded to prevent shared state, secrets, operational data, and donor code from entering VNext. The empty nested `octagon-erp-commercial-vnext/octagon-erp-commercial-vnext/` directory remains documented as harmless environment-policy residue; it contains no source or runtime data and was not removed.

## R0.2 — Licensing governance and provenance

**PASS.** Added `THIRD_PARTY_NOTICES.md` with MIT attribution policy for RuoYi and AureusERP, and a binding clean-room rule for GPL/AGPL/OEEL/unresolved NocoBase material. `CONTRIBUTING.md` now requires provenance records and forbids unapproved copy. `scripts/check-provenance.mjs` enforces the required header on new VNext engine files.

Validation: provenance lint passes for 6 VNext engine modules. No donor code was copied. O-6 remains the pre-existing owner decision; no new owner decision was created.

## R0.3 — Frozen-zone adapter and migration fixture

**PASS.** `LegacyPayrollAdapter`, `LegacyEntityAdapter`, and an interface-only `LegacyFinanceBridge` are implemented under `vnext/server/compat/`. They permit only fixture paths beneath `vnext-fixtures/`, open SQLite read-only with `query_only`, expose no mutation methods, and do not reimplement payroll. Payroll access is a provider boundary for the approved legacy summary function; the R0 default uses frozen outputs captured from closed legacy payroll records rather than touching the live database.

The controlled snapshot was required for this compatibility test. It used the SQLite online backup API from a read-only production connection; no production API writes, database writes, uploads, or attachments occurred. The resulting fixture is separate from the runtime DB at `vnext-fixtures/legacy-sanitized.db` (SHA-256 `1f656880e0f27b2c91239c5e94b26f9cf133b37825c06b9d27e1b94ef7279184`). It has `PRAGMA integrity_check = ok`, schema `user_version = 0`, 914 whitelisted collection rows, and 7 frozen legacy-month summaries. Sessions and operational tables were cleared; identifiers are stable pseudonyms; names, notes, and credentials are redacted; attachments/uploads were not copied. See `vnext-fixtures/r0-legacy-snapshot-manifest.json`.

Validation: `node scripts/test-r0-compat.mjs` passes. It verifies adapter output equality with the frozen legacy summary, entity mapping, read-only fixture byte identity, and unavailable mutation APIs. `LegacyFinanceBridge` remains interface-only until R2.1.

## R0.4 — Database, migration, and scope architecture

**PASS.** Added ordered, transactional migration infrastructure with `schema_migrations` (global technical ledger), WAL mode, `busy_timeout = 5000`, dry-run, idempotent status, reversible up/down, and automatic `VACUUM INTO` pre-migration backups. `seed_ledger` guards idempotent seeds. JSON is confined to dimensions, custom fields, and external snapshots—not business-table storage.

The scope registry classifies global technical/reference, tenant-root, company-owned, and optionally company-scoped structures. Global tables receive no `company_id`. Company-owned probes require a non-null `company_id` foreign key to the R0-only tenant-root anchor. Reusable global references are separated from company-owned assignments. The probes are removed by rollback and do not implement the R1.13 master-data kernel; R1.13 remains the hard prerequisite for ledger and stock development.

The fiscal-document rule remains architectural only: R2.1 must use typed categories, source-specific validation, explicit posting adapters, immutable journal output, and reversal/cancellation links. It must not turn `fiscal_doc` into a universal operational object.

Validation: `node scripts/test-r0-migrations.mjs` passes a fresh database build, clean migration status, dry run without backup, automatic pre-migration backup, idempotent seed, rejection of missing and invalid `company_id`, and byte-identical baseline schema fingerprint after up/down rollback.

## Files created or changed

- Analysis evidence: `_manifests/r0-current-source-fork-sha256.json`, `_manifests/r0-production-critical-current-comparison.json`, and this report.
- R0.2: `THIRD_PARTY_NOTICES.md`, `CONTRIBUTING.md`, `.gitignore`, `scripts/check-provenance.mjs`.
- R0.3: `scripts/create-r0-legacy-fixture.py`, `scripts/r0-inspect-sqlite-schema.mjs`, `scripts/test-r0-compat.mjs`, `vnext-fixtures/legacy-sanitized.db`, its manifest, and `vnext/server/compat/` adapter/docs.
- R0.4: `migrations/001_r0_scope_contract.mjs`, `vnext/server/db/` runner/seed/docs, `scripts/migrate.mjs`, `scripts/test-r0-migrations.mjs`.
- R0 evidence utilities: `scripts/test-r0-startup-guard.mjs`, `scripts/generate-r0-evidence.mjs`.
- Progress: `octagon-erp-commercial-vnext/VNEXT_PROGRESS.md`.

## Entry and exit gates

| Gate | Status |
|---|---|
| Owner O-1 / R0.1 accepted | PASS |
| Isolated fork / separate environment / separate runtime data | PASS |
| Production SHA-256 integrity | PASS — 366/366 |
| Fork own DB, port, backups, uploads, attachments | PASS |
| Production-path refusal | PASS — JSON and SQLite cases |
| Legal notices and provenance lint | PASS |
| Frozen-zone data read-only through adapter | PASS |
| Sanitized, non-runtime migration fixture | PASS |
| Migration runner executes and rolls back cleanly | PASS |
| Scope policy / invalid company scope rejection | PASS |
| R1 authorization | BLOCKED — new explicit `EXECUTE OCTAGON COMMERCIAL VNEXT — R1 PLATFORM KERNEL` is required |

## Remaining issues

- No R0 blocking issue remains.
- The pre-existing O-6 NocoBase license reconciliation remains owner-owned; VNext policy continues to allow concepts only.
- The harmless empty nested test directory remains because environment policy blocked cleanup; it has no functional or security impact.

**Full R0 is eligible to close. Stop here; do not begin R1 without the new explicit authorization.**
