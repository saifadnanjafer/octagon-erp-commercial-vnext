# Octagon VNext — Commercialization Plan
Authority level 10. How Octagon Commercial becomes a sellable, deployable, supportable product — not just working software.

**Binding owner decision O-10 (2026-07-18):** commercialization is online-first, real-time, cross-platform, and PWA-based by default. Hosted cloud, private server, LAN server, and local single-server editions are supported deployment modes; local is not the exclusive identity. See [`OWNER_DECISIONS.md`](OWNER_DECISIONS.md), [`OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md`](OCTAGON_VNEXT_CONNECTIVITY_AND_CLIENT_ARCHITECTURE.md), and [`OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md`](OCTAGON_VNEXT_FEATURE_COVERAGE_LEDGER.md).

## 1. Editions & entitlements
| Edition | Price posture | Core | Gated behind entitlement flags |
|---|---|---|---|
| **Workshop** | entry / upgrade path for existing users | Home, HR+timesheet+payroll (frozen), Finance-lite, Sales-lite, Workshop pack, WhatsApp, AI copilot | multi-company, MES, portals, advanced finance |
| **Business** | SME standard | Full Finance, Sales/CRM, Procurement, Inventory, Projects/Services, Quality, Maintenance, Approvals, custom fields/views, report designer, single company + multi-branch | MES-advanced, multi-tenant SaaS, consolidation, packs |
| **Enterprise** | multi-company/factory | Everything + Manufacturing/MES, multi-company/consolidation, row-level data security, subscriptions/portals, SSO, integration marketplace | — |
| **Industry Packs** | per-pack add-on | one vertical's models/workflows/reports | licensed individually |

**Enforcement:** a **licensing/feature-flag engine** (Target Arch 3.19) checks entitlements server-side; disabled modules are not merely hidden — their routes 403 and their nav entries never register. Trials = time-boxed entitlement grant.

## 2. Licensing & activation
- **License object:** edition, enabled modules/packs, seat/company limits, expiry, tenant id, signature. Cached locally for resilience but authoritative entitlement verification is server-side whenever connected.
- **Activation modes:** (a) connected activation for hosted/private/LAN deployments; (b) controlled local activation for local-server deployments. Grace period on expiry (read-only) before lockout to avoid data hostage.
- **Trial:** full-featured, time-boxed, sample data seeded, non-destructive; converts to paid by installing a license.
- **Anti-tamper:** signed license, server-side checks, audit of entitlement changes. No phone-home telemetry unless explicitly enabled; privacy is preserved across every deployment mode.

## 3. Module packaging
- Each module/pack is an installable package (Target Arch §6 lifecycle). Install runs migrations; uninstall is safe (data retained or exported). Packs depend on core capabilities declared explicitly.
- Version compatibility matrix (core X supports pack Y ≥ Z). Marketplace (R9) distributes signed packs.

## 4. Deployment options (which ship first)
| Mode | First commercial release? | Notes |
|---|---|---|
| Hosted SaaS multi-tenant | R8, GA after pilot | same responsive PWA client; PostgreSQL adapter |
| Private server (self-hosted multi-user) | R8→GA | same client and server event layer |
| Local network (LAN, one server, many clients) | R1 foundation, packaged R10 | responsive PWA over LAN |
| Local single-server (SQLite-local) | ✅ R10 | supported installer/edition, not the default product identity |
Recommendation: **make hosted/private/LAN/local-server deployment modes first-class**, with the connected server authoritative and selective offline workflows documented per capability. Do not treat local offline operation as unrestricted database replication.

## 5. Onboarding
- **Setup wizard:** company info, fiscal calendar, currencies, chart-of-accounts template, branches/warehouses, roles, users, opening balances (GL + stock), edition/pack selection.
- **Tenant templates:** pre-seeded configs per vertical (workshop, retail, clinic…) — collections, workflows, reports, terminology, default permissions.
- **Sample data:** toggleable demo dataset (non-destructive) for training/eval.
- **Data import center:** guided Excel/CSV import for masters + opening balances with mapping + validation + error report.

## 6. Supportability
- **Diagnostics/health:** route-health-style self-test per section; system checkup report; DB integrity check.
- **Support bundle:** one-click export of logs + config + audit (no secrets, no PII beyond consent) for support triage.
- **Backup/restore:** scheduled + on-demand; verify-before-trust (POST backup then verify); restore runbook. Per-tenant.
- **Audit exports:** period audit trail export for compliance.
- **Feature telemetry:** disabled/local by default; opt-in only.

## 7. Upgrade & release policy
- **Release channels:** stable / pilot / dev. Customers on stable.
- **Migrations:** every release ships forward migrations (idempotent) + rollback notes; never destructive without backup gate.
- **Version compatibility:** documented core↔pack matrix; blocked upgrades if a pack is incompatible until updated.
- **Zero-surprise upgrades:** backup auto-taken before upgrade; frozen payroll/timesheet behavior asserted by regression suite in CI-equivalent before any release is tagged.

## 8. Localization & white-label
- **Localization framework:** Arabic-first + RTL native; translation packs per language; locale-driven number/date/currency formatting (centralized, like IDURAR money-format hooks).
- **Regional packs:** Iraqi tax/payroll as the reference; extendable to other jurisdictions.
- **White-label/branding:** name, logo, colors, theme, edition badge configurable per deployment (existing skin system extends to this).

## 9. Commercial release requirements (gate to GA)
1. Immutable finance passes reconciliation vs legacy at pilot (tolerance 0).
2. Frozen payroll/timesheet regression suite green.
3. Backend-enforced permissions verified (no front-end-only enforcement).
4. Security audit (auth, injection, secrets, AI write-gates) passed.
5. Performance budgets met (boot <2s, section switch <1.5s on target hardware).
6. Backup/restore + upgrade + rollback runbooks proven.
7. Onboarding wizard + Arabic user guide per module complete.
8. At least one pilot tenant closed a full payroll month + finance month on VNext.
9. Licensing/entitlement enforcement verified (trial→paid, expiry grace, module gating).
10. `THIRD_PARTY_NOTICES.md` complete and accurate (MIT attributions; no GPL/AGPL code present).

## 10. Go-to-market posture (brief)
- **Wedge:** Arabic-first + online-first real-time operations + real Iraqi payroll + WhatsApp-native, with resilient local workflows — where Odoo/SAP/ERPNext are weakest for this market.
- **Land:** existing Workshop users upgrade in place (continuity edition + migration).
- **Expand:** Business/Enterprise for multi-branch/multi-company; industry packs open adjacent verticals.
- **Moat:** configuration-over-fork + deterministic-auditable core + AI-assist means fast customer-specific delivery without code forks.
