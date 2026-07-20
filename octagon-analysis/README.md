# Octagon Commercial VNext — Analysis Track

This folder is a **forensic analysis + product-architecture + roadmap** deliverable. It contains **no production code** and must never be executed against the live database. Its purpose is to define the next commercial generation of Octagon ERP as a defensible blueprint before any mass implementation begins.

**Binding owner decision O-10 (2026-07-18):** VNext is online-first, real-time, cross-platform, and PWA-installable by default. Hosted cloud, private server, LAN server, and local single-server deployment are supported; offline is selective, controlled, and resilient. The server is authoritative whenever connected. See [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md), [`OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md`](OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md), and [`OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md`](OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md).

## Prime directives (bind every agent and session touching this track)
1. **Documentation and authorization boundary.** Do not implement features or modify production application code (`octagon-erp/**` runtime) while producing these documents. R0 and R1 are closed, R2 is authorized under O-2, and the current R2 task sequence is tracked in `VNEXT_PROGRESS.md`; this correction pass authorizes no new code and does not revoke R2 authorization or rewind completed work.
2. **Evidence-based.** Every capability claim cites an exact repo/file/model/schema path. "Documentation says so" is not evidence — inspect source. Distinguish: implemented / partial / frontend-only / mock / infra-only / planned-absent / duplicated / present-but-commercially-unusable.
3. **Licensing governs reuse.** See authority order below — `DONOR_SYSTEM_FORENSIC_ANALYSIS.md` §License Compatibility is binding. GPL/AGPL donors (ERPNext, IDURAR) = **concepts/clean-room only**. MIT donors (RuoYi, AureusERP) = code reusable with attribution. NocoBase = ideas only (we hold docs).
4. **Frozen forever:** employee / timesheet / attendance / Iraqi-payroll data and approved logic. Preserved behind a compatibility boundary; never rewritten without owner authorization + migration tests.
5. **No Git** (repo is broken). Isolation is filesystem-based per `OCTAGON_VNEXT_CLONE_AND_MIGRATION_PLAN.md`.
6. **Never point a clone at the live `database.db`.** Separate ports, DBs, backup folders, env files.

## Authority order (later documents defer to earlier where they conflict)
1. `COMMERCIAL_VNEXT_EXECUTIVE_BLUEPRINT.md` — vision, editions, architecture direction, release trains. The north star.
2. `DONOR_SYSTEM_FORENSIC_ANALYSIS.md` — per-donor architecture, **license compatibility table (binding)**, extraction targets, reuse-vs-clean-room. (Rev 2: Odoo added, NocoBase corrected.)
3. `OCTAGON_CURRENT_TRUTH_AUDIT.md` — evidence-based reality of the current system; preservation decisions.
4. `OCTAGON_VNEXT_TARGET_ARCHITECTURE.md` — system context, engines, boundaries, security, extension, deployment, compatibility layer.
5. `OCTAGON_VNEXT_GAP_AND_DONOR_MATRIX.md` (+ Rev-2 addendum) and `OCTAGON_VNEXT_COVERAGE_CROSSCHECK.md` — feature-level gap × donor × decision matrix + the exhaustive "nothing dropped" donor-module inventory. **Their decisions are now folded into the Rev-3 roadmap; they remain the row-level evidence base.**
6. `OCTAGON_VNEXT_MODULE_CATALOG.md` — per-module design (entities, lifecycles, permissions, edition availability).
7. `OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md` — binding connectivity, client, sync, deployment, and offline classification contract under O-10.
8. **`OCTAGON_VNEXT_MASTER_ROADMAP.md` (Rev 3) — THE CANONICAL ROADMAP.** Dependency-driven release trains R0–R10 with full-detail epics. Where it conflicts with any document below authority 2, it wins. Implementation agents read: 1 → 2 → 3 → 4 → **8** → 9. (Rev 1 archived: `_archive_OCTAGON_VNEXT_MASTER_ROADMAP_rev1_20260717.md`.)
9. `OCTAGON_VNEXT_EXECUTION_PLAN.md` (Rev 3) — roadmap → file-owned tasks: R0–R2 fully decomposed, R3+ decomposed at wave entry per its §8 rule; lanes, gates, owner queue.
10. `OCTAGON_VNEXT_CLONE_AND_MIGRATION_PLAN.md` — clone procedure, isolation, migration sequencing, rollback, pilot.
11. `OCTAGON_VNEXT_COMMERCIALIZATION_PLAN.md` — editions, licensing, packaging, deployment, onboarding, upgrade, localization.

**Production-track relationship:** `octagon-erp/MASTER_ROADMAP.md` + `AGENT_EXECUTION_PLAN.md` continue to govern the current production system (its Phase-7 audit queue). This analysis folder governs only the isolated VNext generation.

## Reading order for a future implementation agent
Read 1 → 2 → 3 → 4 → 7 → 8 first (strategy → law → reality → architecture → roadmap → tasks). Consult 5/6/9/10 as needed. Do not start coding outside the currently authorized task sequence. The next documented task is `T2.O10.1` after external approval of this correction pass; implementation then stops at its gate before `T2.6.1`.

## Status ledger
- Created 2026-07-17 (Opus 4.8 analysis session). Note: prior sessions built a "W0 platform core" spike and **mounted** it (8 server engines required at boot in `server.js:2778-2785`; 10 client scripts in `index.html`) but it is **not integrated** — only `platform/client/demo.html` consumes it; no real nav page does, and its relational `x_*` tables never meet the app's JSON `collections` store (per Truth Audit §3/§5). So production *behavior* is effectively unchanged. That spike is treated here as **current truth to audit + a feasibility proof of the engines**, not as the shippable VNext core. VNext supersedes the rushed track with this rigorous one.
- Relationship to `erp-research/`: that folder holds the raw donor feature inventories (01–05) + the earlier fast-build plan. This `octagon-analysis/` folder is the authoritative commercial blueprint and supersedes `erp-research/MASTER_PLAN.md` and `BUILD_PACKETS.md` for VNext.

## Document completion state
- [x] README (this file)
- [x] DONOR_SYSTEM_FORENSIC_ANALYSIS.md
- [x] COMMERCIAL_VNEXT_EXECUTIVE_BLUEPRINT.md
- [x] OCTAGON_VNEXT_CLONE_AND_MIGRATION_PLAN.md
- [x] OCTAGON_VNEXT_TARGET_ARCHITECTURE.md
- [x] OCTAGON_VNEXT_MODULE_CATALOG.md
- [x] OCTAGON_VNEXT_COMMERCIALIZATION_PLAN.md
- [x] OCTAGON_VNEXT_MASTER_ROADMAP.md
- [x] OCTAGON_CURRENT_TRUTH_AUDIT.md
- [x] OCTAGON_VNEXT_EXECUTION_PLAN.md
- [x] OCTAGON_VNEXT_GAP_AND_DONOR_MATRIX.md (+ Rev 2 addendum)
- [x] OCTAGON_VNEXT_COVERAGE_CROSSCHECK.md (Rev 2 — every donor module → destination; "nothing dropped" proof)
- [x] OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md (O-10 connectivity/client contract)
- [x] OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md (single live coverage register)
- [x] `octagon-erp-commercial-vnext/AGENTS.md` (VNext authority and guardrails)
- **Current state (2026-07-18):** R0 closed; R1 closed at 19 PASS, 0 PARTIAL, 0 FAIL; O-2 decided; R2 authorized; T2.1.1–T2.5.2 implemented and tested; implementation paused before T2.6.1 for external review and O-10 execution alignment. This documentation-consolidation correction gate authorizes no new code, but it does not revoke R2 authorization or rewind completed work.

## Rev 2 study expansion (2026-07-17, same day)
Owner directed a deeper pass: **Odoo 19 promoted to first-class donor** (5 domain reports: `erp-research/06-odoo-finance.md`, `07-odoo-sales-crm-commerce.md`, `08-odoo-scm-mrp.md`, `09-odoo-hr-services.md`, `10-odoo-platform-framework.md`) and **NocoBase re-reviewed at source level** (`11-nocobase-deep-source.md` — license remains clean-room only until reconciled). The donor forensic doc, gap matrix, coverage cross-check, canonical Rev-3 roadmap, connectivity architecture, and live coverage ledger now carry the consolidated results. The stale Rev-2 statement that the Master Roadmap predates the study is retired; Rev 3 is the canonical roadmap and the ledger is the completeness register.

## Missing evidence register

The reviewed external upload did not contain the Rev-1 archive. It is **verified present at `C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-analysis\_archive_OCTAGON_VNEXT_MASTER_ROADMAP_rev1_20260717.md`** in the current workspace and was read successfully. The two consolidated-evaluation references and the individual historical specifications cited by the recovery review remain missing; recovery conclusions are preserved while independent archival verification of those originals remains pending.
