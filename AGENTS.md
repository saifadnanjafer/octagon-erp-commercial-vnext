# Commercial VNext Authority

This folder is the isolated **Octagon Commercial VNext** track.

Authoritative reading order is in sibling `../octagon-analysis/README.md`. The canonical roadmap is `../octagon-analysis/OCTAGON_VNEXT_MASTER_ROADMAP.md`; the canonical execution plan is `../octagon-analysis/OCTAGON_VNEXT_EXECUTION_PLAN.md`.

The root `MASTER_ROADMAP.md`, `AGENT_EXECUTION_PLAN.md`, and `OCTAGON_EXECUTION_QUEUE.md` in this folder belong to the legacy/current production track. They are retained for historical context and must not govern Commercial VNext.

Rules:

- No Git commands.
- Production is read-only. Never open or point at production `database.db`.
- No autonomous advancement beyond the explicitly authorized task or owner go-signal.
- **Current authorization state (updated 2026-07-19):** R0, R1, R2 closed. R3 external remediation (A1–A9) COMPLETE and ACCEPTED at its release gate. R4 (Governance Rollout) COMPLETE and ACCEPTED. R5 (Configurability, Reporting & People) COMPLETE and ACCEPTED. All gates green with exact test counts recorded in `VNEXT_PROGRESS.md`. R6–R10 remain per the canonical roadmap. Continuation handoff with next command in `VNEXT_CONTINUATION_HANDOFF.md`.
- Preserve frozen payroll, timesheet, and attendance boundaries and logic.
- Product identity is online-first, cross-platform, real-time, and PWA-based, with hosted, private-server, LAN-server, and local single-server deployment modes plus selective, controlled offline resilience.
- Check `../octagon-analysis/OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md` before and after every epic.
- All implementation remains inside this isolated VNext folder and uses disposable test data where testing is authorized.
