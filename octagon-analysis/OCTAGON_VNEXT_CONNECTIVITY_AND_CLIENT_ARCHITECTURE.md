# Octagon Commercial VNext — Connectivity and Client Architecture

Status: documentation baseline, 2026-07-18. Authority: owner decision O-10, subordinate to the Executive Blueprint and Target Architecture. This document defines the connectivity contract; it does not authorize implementation.

## 1. Binding product direction

Octagon Commercial is online-first, real-time, cross-platform by default. It is deployable as hosted cloud, private server, LAN server, or local single-server and installable as a responsive PWA. The connected server is authoritative. Local deployment is supported but is not the product's exclusive or default identity.

Desktop, mobile, tablet, kiosk, and TV are responsive browser/PWA clients over the same API, authorization, event, and sync contracts. No client is a second business authority and no offline mode is a full-database multi-master replica.

## 2. Deployment modes and authority

| Mode | Client | Server/database | Authority and boundary |
|---|---|---|---|
| Hosted cloud | Responsive browser/PWA | Service tier with PostgreSQL adapter | Tenant-scoped server is authoritative; event and sync services are shared but tenant-isolated |
| Private server | Responsive browser/PWA | Self-hosted server with PostgreSQL path | Server is authoritative; operator controls infrastructure and upgrades |
| LAN server | Browser/PWA on local network | One local server, SQLite-local or configured hosted adapter | One server is authoritative for all connected clients |
| Local single-server | Browser/PWA on the same device or local network | SQLite-local edition | Local server is authoritative; selected offline workflows remain bounded by policy |

Deployment configuration must not fork business engines. Database access crosses an adapter boundary: SQLite remains suitable for local editions, while hosted/private scale uses the documented PostgreSQL adapter path. Business services express transactions, constraints, idempotency, and scopes through adapter contracts rather than SQLite-specific SQL.

## 3. Responsive shell and PWA

The shell provides adaptive navigation, RTL-first layout, keyboard and touch interaction, install prompts, safe-area handling, viewport-aware tables/forms, kiosk/TV density modes, and accessible loading/error states. Pages must declare their supported density and offline classification; they do not invent their own connectivity behavior.

The current `octagon-erp-commercial-vnext/manifest.json`, `service-worker.js`, and service-worker registration are reusable foundations. Their present role is shell/static-asset caching and installability. They do **not** currently provide full transactional offline synchronization, durable business outbox replay, conflict resolution, or authoritative server reconciliation.

## 4. Authentication and sessions across devices

- Login, session issuance, refresh/rotation, revocation, device/session inventory, MFA, and tenant/company selection are server operations.
- A PWA may retain only the minimum encrypted session/bootstrap material needed to resume safely; it must not treat a cached identity as proof of current permission.
- Every request carries server-validated session, tenant, company, role, and capability context. Permission changes take effect on the next server check and invalidate stale grants.
- Device registration and trusted-device status are explicit, auditable, and tenant-scoped. Local network reachability never implies administrator trust.
- On reconnect, the client reauthenticates before replaying outbox items. Expired, revoked, or scope-changed items are parked for user review.

## 5. Real-time event transport

The platform includes a server event layer from the foundation stage, using WebSocket or SSE according to deployment and capability. It is not deferred until a user-count threshold.

Events are typed, tenant/company scoped, permission-filtered, ordered per stream, and resumable from a cursor. Examples include record changed, workflow state changed, approval required, notification created, sync conflict, job progress, and server health. Events are hints to refresh authoritative data, not a substitute for API reads or a second write channel. When the event stream is unavailable, the client shows degraded state and uses bounded backoff/polling as a recovery mechanism.

Subscriptions are explicit: user inbox, assigned worklist, record/document, company dashboard, device/kiosk channel, and operational alerts. Every subscription has lifecycle cleanup, authorization checks, and a maximum scope. Notifications carry read/unread state on the server; local display state is only a cache.

## 6. Offline-capable workflow classification

Every capability receives one classification in the coverage ledger:

| Class | Rule | Examples |
|---|---|---|
| Connected-only | Must reach the authoritative server before read or write | payroll/timesheet/attendance, identity, permissions, approvals, finance posting, stock valuation/posting, tax, tenant/licensing changes, sensitive AI actions |
| Offline-read | Permitted cached read with age/source shown; no implied freshness | assigned SOP/document snapshot, authorized product/location reference, limited worklist |
| Offline-capture | Local capture is permitted; it creates an outbox intent and does not post a business transaction | selected shop-floor observation, draft note, barcode scan, POS/cart capture where the release explicitly enables it |
| Offline-commit | Only an explicitly approved workflow may replay a validated command; server rechecks scope, state, conflicts, and idempotency | R6 POS session sale and R7 frontline operation when their release gates pass |

The default is connected-only. A release may promote a workflow only when its data model, command contract, conflict policy, audit trail, recovery UX, and acceptance tests are present.

## 7. IndexedDB cache and durable outbox

IndexedDB stores versioned, tenant/company-scoped cache entries, cursors, drafts, attachment-transfer state, and outbox commands. It does not mirror the whole database. Cache entries have TTL/classification metadata, source version, last-authoritative timestamp, and purge rules on logout, tenant switch, permission downgrade, or retention expiry.

Each outbox item contains a client-generated command ID, idempotency key, actor/device/session context, entity/command name, schema version, payload hash, causal/base version, created time, retry count, and audit correlation ID. The outbox is durable across tab close and process restart, encrypted or protected by the platform storage boundary, and visible to the user.

## 8. Exactly-once effect and replay

The network cannot guarantee exactly-once delivery. VNext guarantees at-most-one business effect per idempotency key at the authoritative server and exposes replay outcome to the client. The server stores command results or a durable deduplication record within the same transaction as the business effect. Replays return the original result; they never create a duplicate invoice, stock movement, payment, approval, or work-order transition.

Replay sequence: reauthenticate → validate tenant/company and permission → validate command schema → check idempotency → check base version/state → apply deterministic command in one transaction → append audit/event → acknowledge result. Unknown, expired, or permanently rejected commands are parked with a human-readable reason and recovery action.

## 9. Conflict policy

Conflicts are detected using entity version, server revision, command base version, and domain invariants. The default policy is reject-and-review for business records, never silent last-write-wins. Safe field-level merge may be used only for explicitly declared non-sensitive fields. Financial, stock, approval, identity, tenant, payroll, timesheet, attendance, and audit records require server resolution or a compensating command; original evidence is preserved.

The UI shows conflict type, local intent, current server state, who/what changed it, and choices: refresh, discard, create a new draft, or submit a reviewed compensating action. Resolution is audited and can itself require approval.

## 10. Attachments and media synchronization

Attachments have tenant/company ownership, record ACL, content hash, size/type limits, retention class, malware/content checks, and an upload state machine: local-only → queued → uploading → server-verified → available, or failed/blocked. Resumable chunk upload is preferred for large media. A metadata record is not considered synchronized until the server verifies the content hash and ownership.

WhatsApp media, voice notes, and other external media remain policy-gated. Download, retention, transcription, and entity mapping require the release's credentials, HTTPS, consent/retention policy, server processing, and approval gate. No sensitive attachment is silently posted from an offline client.

## 11. Data that must never be posted offline

The following are connected-only unless a later owner decision explicitly changes the rule: payroll, timesheet, attendance, employee compensation, finance/GL/tax/payment posting, stock ledger/valuation, fiscal documents, period locks, approvals and delegated authority, user/role/tenant/company changes, authentication/MFA, license/entitlement changes, audit-log mutation, destructive deletes, external outbound messages, WhatsApp sends, and AI writes affecting business records. Offline clients may prepare a draft or read an authorized cached snapshot where the ledger class permits it, but must not imply that the server accepted it.

## 12. Sync status and recovery UX

The shell displays a persistent status: Connected, Reconnecting, Offline capture, Syncing, Conflict review, or Blocked. Each status includes last authoritative sync time, pending count, failed count, stream cursor health, and the active tenant/company. Users can inspect, retry, pause, discard a draft, export a support bundle, and open conflict details according to permission.

Recovery is bounded and observable: exponential backoff with a cap, no busy loops, durable retries, dead-letter/parked queue, reconnect reauthentication, cache invalidation on scope change, and a support correlation ID. The server exposes health and sync diagnostics without leaking cross-tenant data.

## 13. Security and tenant boundaries

All cache keys, outbox commands, event subscriptions, attachment metadata, and replay results carry tenant/company scope. The server rechecks scope and field permissions; client-side hiding is not security. Cross-tenant event delivery, cache reuse, outbox replay, attachment access, and device session reuse are acceptance-test failures. Offline storage is treated as potentially exposed endpoint storage: minimize data, encrypt/protect where available, redact secrets, expire aggressively, and support remote revocation on reconnect.

## 14. Staged delivery points R1–R10

| Release | Connectivity/client acceptance point |
|---|---|
| R1 | Responsive shell contract, server-authoritative auth/session, event envelope/cursor foundation, IndexedDB schema/outbox primitives, visible connected/degraded state; no business offline commits yet |
| R2 | Connected-only finance/stock classification, server idempotency/deduplication, conflict rejection, audit correlation, SQLite adapter contract and PostgreSQL adapter contract tests |
| R3 | Product/order/work-order event subscriptions, attachment state machine, explicit draft/offline-capture policies, server revalidation on reconnect |
| R4 | Approval/workflow events, permission-filtered subscriptions, no offline bypass of approval or sensitive AI tool gates |
| R5 | Configurable page capability metadata, cache TTL/retention controls, report/dashboard refresh hints, support diagnostics |
| R6 | POS offline-capable slice only after exact replay, cash/session reconciliation, conflict, and recovery gates pass |
| R7 | Shop-floor offline-tolerant capture/commit only for declared operations; kiosk/TV event views and reconnect proof |
| R8 | Hosted/private deployment, PostgreSQL adapter path, tenant isolation, SSO/session revocation, event scale and backpressure tests |
| R9 | Pack conformance rule: every pack declares client class, offline policy, events, attachments, and prohibited posts |
| R10 | Installer/PWA packaging across modes, migration/rollback, pilot dual-run, sync/recovery drills, security audit, and acceptance evidence linked in the ledger |

## 15. Acceptance criteria

1. The same responsive PWA shell works on desktop, mobile, tablet, kiosk, and TV layouts without a second business client.
2. Connected server state wins; stale cache and offline intent are visibly labeled.
3. Every offline-enabled workflow has a ledger row, explicit command schema, idempotency proof, conflict policy, retry/park behavior, audit event, and recovery UX.
4. A replayed command produces one business effect and a duplicate replay returns the original result.
5. Cross-tenant/company cache, event, attachment, session, and outbox leakage is rejected by server-side tests.
6. Prohibited financial, payroll, identity, approval, stock, tax, external-message, and sensitive-AI writes fail closed offline.
7. WebSocket/SSE event delivery is available from the platform baseline, with bounded polling only as degraded recovery.
8. SQLite-local and PostgreSQL-hosted adapter tests exercise the same business-service contracts.
9. Existing manifest/service-worker foundations remain usable, while transactional sync is proven separately rather than assumed from static caching.

## 16. Evidence and ownership

This document is bound by `OWNER_DECISIONS.md` O-10. The feature-by-feature disposition, release/task destination, and acceptance/evidence status live in [`OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md`](OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md). No feature is considered implemented merely because a legacy page, manifest, service worker, or static cache exists.
