# Octagon Commercial VNext — Owner Decision Log

Formal record of owner decisions gating release entry, per `OCTAGON_VNEXT_EXECUTION_PLAN.md` §10 ("Owner decision queue... Tasks blocked by an owner item say so in their row and may not be claimed").

---

## O-1 — R0 authorization

Authorized 2026-07-17. R0 (isolation-only fork) proceeded and closed per `R0_COMPLETION_REPORT.md`.

## O-2 — R2 reconciliation model + cut-date

**Decided 2026-07-18.** Owner selected the minimal option:

- **Cut-date:** 2026-07-18 (the day R2 was authorized to start).
- **Reconciliation model:** opening balances are imported **as-is** from the approved sanitized fixture (`vnext-fixtures/legacy-sanitized.db`) as of the cut-date. No historical GL replay — VNext's immutable ledger starts posting fresh from the cut-date forward; everything before it is a single opening-balance entry per account, not a transaction-by-transaction reconstruction.
- **Implication for R2.1 (`T2.1.1`–`T2.1.3`):** the migration/import step (R10.1 in the roadmap, pulled forward as needed for R2 testing) creates one opening-balance journal entry per account as of 2026-07-18, sourced from the sanitized fixture's account balances. The `LegacyFinanceBridge` dual-post reconciliation report (`T2.1.3`) compares VNext postings **from the cut-date forward** against the legacy sanitized copy — it is not expected to reconcile pre-cut-date history, by design.
- **Scope note:** this is the VNext **fork's** cut-date for its own isolated fixture data, not a statement about when any real production migration would occur. No production data was read or copied to make this decision.

R2 is authorized to proceed on this basis. Full R2 (`R2.1`–`R2.8`, roadmap order) requested — see `octagon-erp-commercial-vnext/VNEXT_PROGRESS.md` for the running task log.

## O-10 — Online-first, cross-platform, realtime, offline-resilient product identity

**Decided 2026-07-18.** Commercial VNext is **online-first, real-time, cross-platform by default**. It is deployable as hosted cloud, private server, LAN server, or local single-server, and installable as a responsive PWA. Selected workflows may continue during connectivity loss through controlled offline capability.

- The connected server is authoritative. Desktop, mobile, tablet, kiosk, and TV clients use the responsive browser/PWA shell.
- Local deployment remains supported, including SQLite-local editions, but is not the exclusive or default product identity.
- Offline is selective, explicitly classified, and never uncontrolled full-database multi-master. Permitted workflows use IndexedDB cache, a durable outbox, idempotency keys, conflict detection, retries, and visible sync state.
- Realtime updates use a server event layer such as WebSocket or SSE from the platform foundation; this is not gated on reaching a user-count threshold.
- Hosted/private scaling crosses a documented database-adapter boundary with PostgreSQL as the hosted path; business engines remain database-portable.

This decision **supersedes narrower “offline Windows box as default identity” wording** in earlier VNext documents while preserving local single-server deployment support. It does not authorize implementation or change frozen payroll/timesheet/attendance boundaries.
