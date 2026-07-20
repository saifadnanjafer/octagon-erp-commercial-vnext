# T2.O10.1 Implementation Report

Status: **COMPLETE — acceptance evidence recorded 2026-07-18**

Date: 2026-07-18

## Scope

This pass implements and accepts the isolated connectivity and cross-platform foundation in `octagon-erp-commercial-vnext`. It does not modify the production `octagon-erp` runtime.

Implemented:

- authenticated SSE event delivery at `/api/vnext/events`, with durable cursor replay, tenant/company/user/audience/permission filtering before serialization, redaction, heartbeat, bounded replay, backpressure, and cleanup;
- a platform-only command contract at `/api/vnext/commands`, with server-derived actor scope, idempotency replay, conflict detection, and fail-closed rejection of sensitive or unknown offline commands;
- migration `607_t2_o10_connectivity_foundation` for event and command-idempotency stores;
- IndexedDB cache/outbox primitives with a strict platform-command allowlist and replay/conflict states;
- visible responsive connectivity state with bounded health-poll fallback;
- a SQLite adapter boundary and an explicit PostgreSQL contract without enabling production PostgreSQL;
- notification, approval, and workflow event hooks carrying only redacted, permission-scoped payloads;
- a static-shell PWA/service-worker policy that excludes APIs, authentication, events, databases, and environment files from caching.
- scoped offline replay headers so the server remains authoritative for the selected company;
- browser-visible queue persistence, successful replay, conflict state, and prohibited-command fail-closed evidence.

## Changed paths

- `octagon-erp-commercial-vnext/migrations/607_t2_o10_connectivity_foundation.mjs`
- `octagon-erp-commercial-vnext/vnext/server/events/events.js`
- `octagon-erp-commercial-vnext/vnext/server/db-adapters/sqlite-adapter.js`
- `octagon-erp-commercial-vnext/vnext/client/offline/offline-store.js`
- `octagon-erp-commercial-vnext/vnext/client/connectivity/connection-status.js`
- `octagon-erp-commercial-vnext/vnext/client/connectivity/connection-status.css`
- `octagon-erp-commercial-vnext/index.html`
- `octagon-erp-commercial-vnext/service-worker.js`
- `octagon-erp-commercial-vnext/server.js`
- `octagon-erp-commercial-vnext/vnext/server/notify/notify.js`
- `octagon-erp-commercial-vnext/vnext/server/approvals/approvals.js`
- `octagon-erp-commercial-vnext/vnext/server/workflow/workflow-engine.js`
- `octagon-erp-commercial-vnext/scripts/test-t2-o10-connectivity.mjs`

## Evidence ledger

| Evidence area | Result | Scope of proof |
|---|---:|---|
| Focused server/adapter suite | 11 pass, 0 fail, 0 skip | Migration stores, event envelopes, redaction, isolation, replay bounds, adapter rollback/errors, authenticated SSE fan-out, idempotency, prohibited-command rejection |
| Migration dependency suite | 30 pass, 0 fail | Dependency ordering, missing/cyclic dependencies, dry run, fresh DB, integrity/FK, reapply, reverse down, restart-equivalent behavior |
| Permission regression | 35/35 pass | Existing VNext permission regression harness, read-only |
| Disposable server bootstrap | Pass | Temporary database only; migration 607 applied and `/api/health` returned VNext health |
| Unauthenticated route rejection | Pass | Temporary server returned 401 for both SSE and command routes; loopback bypass disabled |
| Browser desktop shell/status | Pass | Visible status element observed transitioning from connecting to degraded against an unauthenticated disposable server; no new fatal `Uncaught` error observed |
| Browser mobile/RTL shell | Pass | 390x844 viewport; RTL document; manifest present; visible connectivity status present |
| Browser authenticated two-client reload/recovery | Pass | Two authenticated visible clients both reached `connected`; reload recovery remained connected with pending/failed counts at zero; desktop and mobile-RTL shell checks passed |
| Browser IndexedDB restart/outbox/conflict UX | Pass | Visible harness showed a pending safe command before and after reload, successful scoped replay (`finalized: 1`), changed-payload conflict (`conflicts: 1`), and `finance.post` fail-closed (`OFFLINE_PROHIBITED`) |
| Browser service-worker/offline-shell/recovery polling | Pass | Manifest and service-worker links were present in the visible shell; `/manifest.json`, `/service-worker.js`, and `/index.html` each returned 200; SSE recovery returned the status to `connected` with polling fallback not active |

The browser session also surfaced pre-existing unauthenticated disposable-database warnings (for example, ACL/legacy seed requests). These were not counted as T2.O10.1 failures because they are outside the new connectivity module and were not caused by the implementation.

## Post-acceptance note

The implementation gate is complete. External event/security review remains a release-review responsibility, not an implementation blocker. No sensitive domain command is enabled for offline execution.

## Boundary

T2.O10.1 does not enable offline finance, stock, approval, identity, permission, payroll, timesheet, attendance, or sensitive administration writes. The existing production `octagon-erp` checkout remains outside the implementation scope.
