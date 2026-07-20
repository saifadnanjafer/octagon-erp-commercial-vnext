# Octagon Commercial VNext — Executive Blueprint
Authority level 1 (north star). 2026-07-17.

**Binding owner decision O-10 (2026-07-18):** Octagon Commercial is online-first, real-time, cross-platform by default; deployable as hosted cloud, private server, LAN server, or local single-server; and installable as a responsive PWA. Controlled offline capability is selective and resilient, not the product's default identity. See [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md), [`OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md`](OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md), and [`OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md`](OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md).

## 1. Why the current roadmap only produces incremental progress
The existing plan (`AGENT_EXECUTION_PLAN.md`, `MASTER_ROADMAP.md`, and the fast `erp-research/BUILD_PACKETS.md` spike) optimizes for **adding tabs to one running app**. Each new capability is a page wired into a ~19.8k-line `app.js` (134 scripts, 103 modules — Truth Audit §1) through a shared global `omni` object (with some duplicate top-level function names — 2 verified on the current `app.js`, not the historical "~23"; the point is the monolith, not the count). That structure has three consequences that cap it at incremental:
1. **No reusable primitives.** Finance posting, permissions, numbering, audit, and collaboration are re-solved per page instead of once as engines. Feature N costs the same as feature 1 — there is no compounding.
2. **Data integrity is per-page, not systemic.** There is no immutable ledger, no document-state engine, no transactional boundary shared across modules — so "more features" increases surface area faster than it increases trustworthiness. A commercial ERP is sold on trust (ledgers reconcile, approvals hold, audit is complete), not tab count.
3. **Configuration is code.** Every customer variation means editing shared JS. That forks per client and cannot scale to "multiple companies, sectors, branches" — the stated commercial goal.
Adding a 90th tab to that base cannot produce a commercial-grade leap. The leap requires **platform primitives + backend-enforced integrity + configuration-over-code**, which is a new generation, not a next sprint.

## 2. Product vision
**Octagon Commercial** is a configurable, Arabic-first, online-first commercial ERP platform — ERPNext-grade transactional integrity, RuoYi-grade workflow/administration, NocoBase-grade configurability, AureusERP-grade daily collaboration, IDURAR-grade screen consistency — carrying Octagon's identity: **workshop-first, WhatsApp-native, AI-assisted, cross-platform, real-time, PWA-installable, and deployable hosted, privately, over LAN, or on one local server.** It serves multiple companies, branches, warehouses, factories, and service businesses from one configurable core plus optional industry packs.

### Differentiators (what wins deals)
1. **Arabic-first + RTL-native** commercial ERP with genuine local (Iraqi) payroll/tax fidelity — a gap Odoo/SAP/ERPNext fill poorly.
2. **Online-first and resilient**: the connected server is authoritative, with realtime events and selective offline workflows for explicitly permitted operations. Local single-server deployment remains supported; hosted/private/LAN modes are first-class.
3. **WhatsApp-native** operational comms built into the workflow layer, not bolted on.
4. **AI-assisted but deterministic**: copilots and NL reporting on top; accounting/inventory/payroll remain rule-based and auditable. Every AI write is a registered, approval-gated, audited tool.
5. **Configuration-over-fork**: custom fields, saved views, schema-driven screens, and a workflow builder mean one codebase serves many verticals.

## 3. Editions (commercial packaging)
| Edition | Target | Core included | Gated |
|---|---|---|---|
| **Workshop** (continuity) | Existing Octagon users / single workshop | Home, HR+timesheet(frozen), Finance-lite, Sales-lite, Workshop/job-orders, WhatsApp, AI copilot | multi-company, MES, portals |
| **Business** | SMEs, single company, multi-branch | + full Finance (GL/AR/AP/assets/reports), Sales+CRM, Procurement, Inventory, Projects/Services, Approvals, custom fields/views, report designer | MES-advanced, multi-tenant SaaS, industry packs |
| **Enterprise** | Multi-company groups, factories | + Manufacturing/MES (OEE/Andon), multi-company/consolidation, row-level data security, subscriptions/portals, integration marketplace, SSO | — |
| **Industry Packs** (add-on to Business/Enterprise) | Vertical operators | Workshop/advertising, fabrication/CNC, contracting, retail/POS, pharmacy, clinic, fleet, education | per-pack license |
Entitlements enforced by a **licensing/feature-flag engine**, not by hiding buttons.

## 4. Target architecture direction (three layers)
```mermaid
flowchart TB
  subgraph OS[Octagon OS — shell]
    nav[Nav tree]:::s; auth[Auth/SSO]:::s; theme[Themes/RTL]:::s; omni[Omni AI copilot]:::s; search[Global search/command]:::s
  end
  subgraph K[Layer A — Commercial Platform Kernel]
    acl[ACL matrix + row-level security]:::k
    doc[Document-state engine]:::k
    appr[Universal approval engine + Approval Center]:::k
    wf[Workflow/automation engine]:::k
    crud[Schema/collection + config CRUD engine]:::k
    cf[Custom-field + snapshot engine]:::k
    hist[Record-history + audit engine]:::k
    chat[Chatter/collaboration engine]:::k
    views[Saved-view + worklist engine]:::k
    seq[Numbering engine]:::k
    notif[Notification center]:::k
    rep[Report + dashboard designer]:::k
    ent[Licensing/entitlement + tenant/company engine]:::k
    intg[Integration/webhook + credential vault]:::k
    ai[AI tool + approval-control layer]:::k
    mig[Migration + compatibility layer]:::k
  end
  subgraph B[Layer B — Business Modules]
    fin[Finance: GL/AR/AP/Assets]:::b; scm[Procurement + Inventory]:::b; mfg[Manufacturing/MES]:::b; sal[Sales/CRM]:::b; qual[Quality]:::b; maint[Maintenance]:::b; proj[Projects/Services]:::b; hr[HR/Payroll (frozen core)]:::b; com[POS/Portals/Subscriptions]:::b
  end
  subgraph C[Layer C — Industry Packs]
    p1[Workshop/Advertising]:::c; p2[Fabrication/CNC]:::c; p3[Contracting]:::c; p4[Retail/Pharmacy/Clinic]:::c; p5[Fleet/Education]:::c
  end
  OS-->K-->B-->C
  classDef s fill:#1f2937,color:#fff; classDef k fill:#0e7490,color:#fff; classDef b fill:#166534,color:#fff; classDef c fill:#7c2d12,color:#fff
```
**Principle:** business modules are thin — they compose kernel engines. Finance is "post to the GL engine with these dimensions"; it does not re-implement posting. This is what makes feature N cheaper than feature 1.

## 5. Recommended release trains (dependency-ordered; detail in Master Roadmap)
- **R0 — Isolation & baseline.** Clone to `octagon-erp-commercial-vnext/`, isolated DB/ports/backups, compatibility layer stubs, `THIRD_PARTY_NOTICES`. No features.
- **R1 — Platform kernel.** ACL matrix + row-level security, document-state engine, numbering, audit/record-history, custom fields, schema/CRUD engine, chatter, saved views/worklists, notification center. (Absorbs and hardens the W0 spike as clean VNext engines.)
- **R2 — Immutable finance & stock foundations.** GL engine + dimensions, stock ledger + valuation, fiscal periods/locks, posting/cancellation/reversal. The trust bedrock.
- **R3 — Core sales/procurement/inventory/manufacturing** on the ledgers (orders→delivery→invoice, PO→receipt→bill, BOM→WO→job-card).
- **R4 — Workflow, approval, collaboration, permissions** end-to-end (Approval Center, delegation/escalation, workflow builder).
- **R5 — Schema-driven UI, custom fields, saved views, report/dashboard designer.**
- **R6 — Portals, subscriptions, memberships, POS, external experience.**
- **R7 — MES/OEE/Andon, planning, industrial ops.**
- **R8 — SaaS admin, licensing/editions, integrations, deployment modes.**
- **R9 — Industry packs + marketplace.**
- **R10 — Migration, pilot, security audit, performance, commercial release.**
Finance integrity (R2) precedes everything transactional; permissions (R4) can develop in parallel with R2/R3 but gate before pilot. Industry packs (R9) only after the kernel proves configurable.

## 6. The ten highest-risk architectural decisions (must be made deliberately)
1. **Ledger storage model** — how immutable posting + reversal + reposting is represented in SQLite (append-only tables + materialized balance caches) without corrupting the existing finance-v6 `account_moves`. Wrong choice = unreconcilable books.
2. **Compatibility boundary for frozen payroll/timesheet** — adapter that lets VNext read/post around payroll without ever rewriting approved Iraqi logic. Wrong choice = payroll regression = loss of trust.
3. **Legacy `omni`/localStorage → VNext data model migration** — dual-write vs cutover vs read-through adapter. Wrong choice = data loss or split-brain.
4. **Backend-enforced permissions** — row-level scoping in SQLite (query rewriting/predicate injection) vs app-layer checks. If enforcement is only front-end, the product is not enterprise-sellable.
5. **Schema-driven UI depth** — how far to push "screens as data" vs hand-built pages; over-reach delays R1, under-reach forks per customer. Pick a pragmatic middle (config-driven CRUD for standard entities, coded pages for complex flows).
6. **Multi-company/tenant isolation** — shared DB with `company_id`/`tenant_id` scoping vs DB-per-tenant. Affects every table and every query from R1.
7. **Document-state engine generality** — one state machine for all documents vs per-module states. Too generic = unusable; too specific = duplicated.
8. **Numbering + sequence integrity under concurrency** — atomic, gap-tolerant, per-company/per-fiscal-year, offline-safe.
9. **AI write-action governance** — the registered-tool + approval + audit contract must be mandatory and unbypassable, or AI becomes an integrity hole.
10. **Deployment packaging** — single-Windows-box installer vs hosted; how the same build serves both without divergent code paths.

## 7. Strongest contribution from each donor (one line)
- **ERPNext:** immutable ledgers + accounting dimensions + depreciation/pricing/BOM depth (concepts, clean-room).
- **RuoYi:** Approval Center + row-level data permission + tenant model + MES OEE/Andon (MIT).
- **NocoBase:** ACL matrix + schema-as-data UI + workflow trigger/node + snapshot/sequence engines (ideas, zero code risk).
- **AureusERP:** chatter-on-every-record + custom fields + saved views + worklists (MIT).
- **IDURAR:** one config-driven CRUD contract for hundreds of consistent screens (concept, clean-room).
- **Octagon (self):** Arabic-first, workshop-first, online-first, real-time, cross-platform, WhatsApp-native, AI-assisted identity + real Iraqi payroll, with resilient local deployment — the differentiators none of the donors have.

## 8. Final recommendation
Do **not** continue extending the current app as the commercial product. **Fork a clean VNext generation** (R0), **build the kernel engines once** (R1), **lay immutable finance/stock** (R2), then compose thin business modules on top. Preserve and stabilize the current version in parallel for existing users; migrate them via the compatibility layer at pilot (R10). The rushed W0 spike (mounted but not consumed by any real page — Truth Audit §3) is a useful *proof the engines are feasible* — re-home its ideas into clean, invariant-enforcing VNext engines; do not treat it as the shippable commercial core. **The audit sharpened the #1 target:** permissions are UI-enforced and the server ACL is bypassed on loopback (`local-trusted`→admin), so backend-enforced permissions (R1.2) are the single most important integrity fix. Await `EXECUTE OCTAGON COMMERCIAL VNEXT` before implementation.
