# Octagon VNext SQLite Portability Report

Date: 2026-07-18

Status: **T2.O10.1 boundary report — adapter contract added; production database portability is not declared complete**

## Method

This report is a targeted portability review of `octagon-erp-commercial-vnext/vnext/server` and `octagon-erp-commercial-vnext/migrations`, using repository text scans and the focused T2.O10.1 server/adapter suite. It classifies current SQLite coupling; it is not a claim that the full VNext business surface has been ported to PostgreSQL.

## Classification

### Runtime-portable foundation

- The new connectivity/idempotency paths use parameterized statements and explicit transactions.
- `vnext/server/db-adapters/sqlite-adapter.js` exposes `run`, `get`, `all`, `query`, and `transaction` with normalized error codes: `CONFLICT`, `TEMPORARY_UNAVAILABLE`, `SCHEMA_MISMATCH`, and `DATABASE_ERROR`.
- A PostgreSQL adapter contract exposes the same interface and fails explicitly with `NOT_IMPLEMENTED`; it does not silently emulate PostgreSQL or enable it in production.
- Event and idempotency records use ordinary relational fields plus JSON payload columns, keeping the new boundary straightforward to adapt.

### Adapter-candidate coupling

The following existing patterns are candidates for later adapter work and were intentionally not rewritten in T2.O10.1:

- `node:sqlite` / `DatabaseSync` construction in server bootstrap and the migration runner;
- direct `.prepare()`, `.exec()`, and SQLite transaction calls in existing engines;
- SQLite JSON functions such as `json_extract`;
- SQLite-specific `INSERT OR IGNORE`, `STRICT`, `AUTOINCREMENT`, `PRAGMA`, and SQLite conflict syntax;
- existing business engines that issue direct SQL instead of going through an adapter.

These are tracked as portability work, not as defects in the isolated connectivity foundation.

### Migration-only coupling

Migration DDL and migration-runner controls necessarily contain SQLite-specific constructs in the current VNext implementation, including SQLite table/index/pragma behavior. Migration 607 follows the existing migration contract and provides a real down migration; it does not introduce runtime DDL.

### Frozen or out of scope

- production `octagon-erp` code and databases;
- legacy JSON/database material outside the VNext runtime boundary;
- payroll, timesheet, and attendance logic;
- T2.6.1 or later business features;
- production PostgreSQL deployment or a native-client database implementation.

## Evidence

- Focused T2.O10.1 server/adapter suite: 11 pass, 0 fail, 0 skip.
- Migration dependency suite: 30 pass, 0 fail.
- Permission regression: 35/35 pass.
- Disposable bootstrap reached migration `607_t2_o10_connectivity_foundation` and returned healthy VNext status.

## Next portability phase

The next approved database-portability phase should replace direct business-engine SQL calls through the adapter, define PostgreSQL migrations alongside the existing migration contract, and run parity tests against disposable SQLite and PostgreSQL databases. That work is outside T2.O10.1 and was not started here.

