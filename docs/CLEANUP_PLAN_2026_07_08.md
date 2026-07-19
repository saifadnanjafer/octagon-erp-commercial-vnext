# Octagon ERP Cleanup Plan - 2026-07-08

Phase: 1 audit only
Repo: `C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-erp`

No files were moved, deleted, or behavior-edited during this audit. This report is a conservative cleanup plan only. Anything not clearly classified stays in place.

## Audit Method

- Inspected root tree, top-level folders, and selected archive/cache/report folders.
- Checked current Git status before planning. The worktree already had existing modified/untracked source and data files before this report was created.
- Read `package.json`; it contains only a `dotenv` dependency and no scripts.
- Checked `index.html` stylesheet and script references.
- Searched filename references across `index.html`, `app.js`, `style.css`, `server.js`, `omni-ai-assistant.js`, `modules/`, `services/`, `views/`, and `docs/`.
- Did not inspect or edit `database.json` contents.

## Live Files That Must Stay In Place

These are active app/runtime files or explicitly protected files.

- `index.html`
- `app.js`
- `style.css`
- `server.js`
- `package.json`
- `package-lock.json`
- `README.md`
- `HERE.md`
- `STRUCTURE.md`
- `MASTER_ROADMAP.md`
- `OCTAGON_EXECUTION_QUEUE.md`
- `LAUNCH_AUDIT.md`
- `claude-status.json`
- `claude-review-pointer.json`
- `database.json`
- `database.db`
- `database.db-shm`
- `database.db-wal`
- `.env`
- `.env.example`
- `.gitignore`
- `manifest.json`
- `service-worker.js`
- `start.ps1`
- `Octagon ERP.bat`
- `modules/`
- `services/`
- `views/`
- `scripts/`
- `docs/`
- `COMPANY/`
- `node_modules/`
- `.git/`

Optional/current handoff files not present at audit time:

- `CODEX_RUNBOOK.md` was not present.
- `CURRENT_STATUS.md` was not present.
- `NEXT_CHAT_CONTEXT.md` was not present.

## Files Referenced By `index.html`

### Local CSS referenced directly

Do not archive these unless the corresponding `index.html` reference is removed in a separate approved development task.

- `style.css`
- `omni-ux-v2.css`
- `omni-admin-crud-v2.css`
- `omni-language-fix.css`
- `omni-ai-assistant.css`
- `jarvis-visual-overlay.css`
- `modules/jarvis-orb.css`
- `modules/pilot-review-session.css`
- `modules/command-palette.css`
- `modules/jarvis-brain.css`
- `modules/nl-reporting.css`
- `modules/mrp.css`
- `modules/multi-entity.css`
- `modules/tax-compliance.css`
- `modules/pos.css`
- `modules/vertical-pharmacy.css`
- `modules/vertical-retail.css`
- `modules/vertical-clinic.css`
- `modules/vertical-restaurant.css`
- `modules/vertical-real-estate.css`
- `modules/vertical-hotel.css`
- `modules/work-orders.css`
- `modules/route-health.css`
- `modules/workshop-ai.css`
- `modules/ai-governance.css`
- `modules/workshop-frontline.css`
- `modules/workshop-stabilization.css`
- `modules/asset-maintenance.css`
- `modules/subscriptions.css`
- `modules/people-ops.css`
- `modules/helpdesk.css`
- `modules/fleet.css`
- `modules/documents.css`
- `modules/marketing.css`
- `modules/budgeting.css`
- `modules/finance-close.css`
- `modules/advanced-inventory.css`
- `modules/procurement.css`
- `modules/project-management.css`
- `modules/approvals.css`
- `modules/field-service.css`
- `modules/rental.css`
- `modules/enterprise-suite.css`
- `modules/appointments.css`
- `modules/workshop-ledger.css`
- `modules/loyalty.css`
- `modules/finance-installments.css`
- `modules/sales-commission.css`
- `modules/sales-contracts.css`
- `modules/sales-price-lists.css`
- `modules/sales-commercial-pack.css`
- `modules/pos-deepening.css`
- `modules/omni-communications.css`
- `modules/implementation-methodology.css`
- `modules/platform-marketplace.css`
- `modules/ecommerce-connectors.css`
- `modules/esign.css`
- `modules/events.css`
- `modules/knowledge.css`
- `modules/knowledge-base.css`
- `modules/surveys.css`
- `modules/visitors.css`
- `modules/risk-compliance.css`
- `modules/phase6a-core.css`
- `layout-improved.css`
- `glass-real.css`
- `force-horizontal.css`
- `ui-contrast-fix.css`
- `theme-neumorphism.css`
- `theme-clean.css`
- `theme-bento.css`
- `theme-premium.css`
- `theme-glassmorphism.css`
- `theme-dashboard.css`
- `theme-refined.css`
- `theme-shadcn.css`
- `theme-perspective.css`
- `theme-switcher.css`
- `calendar-header-fix.css`
- `calendar-opc-doclog.css`
- `timesheet-forecast.css`

### Local JS referenced directly or dynamically

Do not archive these unless the corresponding `index.html` or `app.js` reference is removed in a separate approved development task.

- `glass-real.js`
- `services/auditService.js`
- `services/tenantService.js`
- `services/recordService.js`
- `services/stateService.js`
- `services/permissionService.js`
- `services/stockService.js`
- `services/financeService.js`
- `services/index.js`
- `custom-api-integration.js`
- `custom-api-examples.js`
- `modules/data-providers.js`
- `app.js`
- `omni-ai-assistant.js` - loaded dynamically by `index.html` and `app.js`
- `omni-ux-v2.js`
- `omni-admin-crud-v2.js`
- `modules/page-help-manual.js`
- `modules/page-sop.js`
- `modules/page-qc.js`
- `modules/ai-providers.js`
- `modules/pilot-review-registry.js`
- `modules/pilot-review-session.js`
- `jarvis-voice-runtime.js`
- `modules/jarvis-system-map.js`
- `modules/jarvis-action-agent.js`
- `modules/jarvis-test-harness.js`
- `modules/jarvis-brain.js`
- `modules/jarvis-audit.js`
- `modules/jarvis-orb.js`
- `modules/command-palette.js`
- `modules/nl-reporting.js`
- `modules/mrp.js`
- `modules/multi-entity.js`
- `modules/tax-compliance.js`
- `modules/pos.js`
- `modules/vertical-pharmacy.js`
- `modules/vertical-retail.js`
- `modules/vertical-clinic.js`
- `modules/vertical-restaurant.js`
- `modules/vertical-real-estate.js`
- `modules/vertical-hotel.js`
- `modules/work-orders.js`
- `modules/route-health.js`
- `modules/workshop-ai.js`
- `modules/workshop-frontline.js`
- `modules/ai-governance.js`
- `modules/workshop-stabilization.js`
- `modules/asset-maintenance.js`
- `modules/subscriptions.js`
- `modules/people-ops.js`
- `modules/helpdesk.js`
- `modules/fleet.js`
- `modules/documents.js`
- `modules/marketing.js`
- `modules/budgeting.js`
- `modules/finance-close.js`
- `modules/advanced-inventory.js`
- `modules/procurement.js`
- `modules/project-management.js`
- `modules/approvals.js`
- `modules/field-service.js`
- `modules/rental.js`
- `modules/warranty-rma.js`
- `modules/enterprise-suite.js`
- `modules/appointments.js`
- `modules/workshop-ledger.js`
- `modules/ws-timesheet-bridge.js`
- `modules/loyalty.js`
- `modules/finance-installments.js`
- `modules/sales-commission.js`
- `modules/sales-contracts.js`
- `modules/sales-price-lists.js`
- `modules/sales-commercial-pack.js`
- `modules/pos-deepening.js`
- `modules/omni-communications.js`
- `modules/implementation-methodology.js`
- `modules/platform-marketplace.js`
- `modules/ecommerce-connectors.js`
- `modules/esign.js`
- `modules/events.js`
- `modules/knowledge.js`
- `modules/knowledge-base-seed.js`
- `modules/knowledge-base.js`
- `modules/surveys.js`
- `modules/visitors.js`
- `modules/risk-compliance.js`
- `modules/phase6a-core.js`
- `modules/phase6c-security-matrix.js`
- `modules/phase7a-stabilization.js`
- `omni-language-fix.js`

### Views referenced by runtime loader

`app.js` fetches `views/${page}.html`, and the repo contains 97 view templates. The entire `views/` folder must stay.

## JS/CSS Imported Or Referenced By Core Areas

- `index.html` is the main load manifest for CSS, services, modules, `app.js`, and language/AI scripts.
- `app.js` dynamically loads `omni-ai-assistant.js` and fetches `views/${page}.html`.
- `server.js` serves the app and owns active local APIs. It also writes pilot review reports to `review-reports/`.
- `modules/` contains active page modules, active assistant/Jarvis modules, active audit modules, and active CSS.
- `services/` contains active browser-side service layer files loaded before `app.js`.
- `views/` contains active HTML page templates.

Do not archive individual files from these folders in Phase 2 unless a separate line-by-line dependency check proves that exact file is unused.

## Safe Archive Candidates After Saif Approval

These are safe-looking because they are backups, logs, generated reports, or one-off prompt/audit artifacts, and they were not found in the active app load path. Move only after explicit approval.

| Current path | Recommended archive destination | Reason |
|---|---|---|
| `codex-server.log` | `archive/cleanup-2026-07-08/temp-scratch/` | Old local server log |
| `codex-server.err.log` | `archive/cleanup-2026-07-08/temp-scratch/` | Old local server error log |
| `codex-server.out.log` | `archive/cleanup-2026-07-08/temp-scratch/` | Old local server output log |
| `server-8097.err.log` | `archive/cleanup-2026-07-08/temp-scratch/` | Old alternate-port server error log |
| `server-8097.out.log` | `archive/cleanup-2026-07-08/temp-scratch/` | Old alternate-port server output log |
| `.codex-runtime/server-8080.err.log` | `archive/cleanup-2026-07-08/temp-scratch/` | Runtime log generated by Codex/dev server |
| `.codex-runtime/server-8080.out.log` | `archive/cleanup-2026-07-08/temp-scratch/` | Runtime log generated by Codex/dev server |
| `jarvis-test-report.json` | `archive/cleanup-2026-07-08/old-reports/` | Generated Jarvis test report |
| `review-reports/*.json` | `archive/cleanup-2026-07-08/old-reports/` | Generated pilot/review JSON reports; folder itself must stay because `server.js` writes to it |
| `OMNI_JARVIS_ARCHITECTURE_AUDIT.md` | `archive/cleanup-2026-07-08/old-reports/` | Old Jarvis audit report |
| `OMNI_JARVIS_CLICK_UI_HARDENING_REPORT.md` | `archive/cleanup-2026-07-08/old-reports/` | Old Jarvis hardening report |
| `OMNI_JARVIS_ENRICHED_SNAPSHOT_REPORT.md` | `archive/cleanup-2026-07-08/old-reports/` | Old Jarvis snapshot report |
| `OMNI_JARVIS_INTERNAL_PILOT_RELEASE_2026_07_05.md` | `archive/cleanup-2026-07-08/old-releases/` | Old internal pilot release note |
| `OMNI_JARVIS_KB_RAG_FREEZE_CHECK.md` | `archive/cleanup-2026-07-08/old-reports/` | Old freeze-check report |
| `OMNI_JARVIS_KB_RAG_GROUNDING_REPORT.md` | `archive/cleanup-2026-07-08/old-reports/` | Old grounding report |
| `OMNI_JARVIS_POST_EXECUTION_FREEZE_CHECK.md` | `archive/cleanup-2026-07-08/old-reports/` | Old freeze-check report |
| `OMNI_JARVIS_POST_EXECUTION_VERIFICATION_REPORT.md` | `archive/cleanup-2026-07-08/old-reports/` | Old verification report |
| `OMNI_JARVIS_SECURITY_HARDENING_REPORT.md` | `archive/cleanup-2026-07-08/old-reports/` | Old security hardening report |
| `OMNI_JARVIS_SERVER_SIDE_MUTATIONS_REPORT.md` | `archive/cleanup-2026-07-08/old-reports/` | Old server-side mutation report |
| `OMNI_JARVIS_SNAPSHOT_FREEZE_CHECK.md` | `archive/cleanup-2026-07-08/old-reports/` | Old freeze-check report |
| `SYSTEM_CHECKUP_2026-07-02.md` | `archive/cleanup-2026-07-08/old-reports/` | Old checkup report |
| `RELEASE_FINANCE_PAYROLL_PILOT_2026_07_04.md` | `archive/cleanup-2026-07-08/old-releases/` | Old release report |
| `ASK_AGENT_OMNI_JARVIS_AUDIT.md` | `archive/cleanup-2026-07-08/old-prompts/` | Old prompt file |
| `NEXT_AGENT_OMNI_SECURITY_HARDENING.md` | `archive/cleanup-2026-07-08/old-prompts/` | Old next-agent prompt |
| `NEXT_AGENT_OMNI_SERVER_SIDE_MUTATIONS.md` | `archive/cleanup-2026-07-08/old-prompts/` | Old next-agent prompt |
| `operating_costs_prompt.md` | `archive/cleanup-2026-07-08/old-prompts/` | One-off prompt file |
| `PILOT_REVIEW_TOUR_DEBUG_PLAN.md` | `archive/cleanup-2026-07-08/old-md/` | Old planning/debug document, not active app load path |
| `UI_DESIGNER_HANDOFF.md` | `archive/cleanup-2026-07-08/old-md/` | Old handoff-style document, not active app load path |
| `CUSTOM_API_SETUP.md` | `archive/cleanup-2026-07-08/old-md/` | Setup doc not active runtime; keep if still operationally useful |
| `OCTAGON_MASTER_ERP_COMPLETION_ROADMAP.md` | `archive/cleanup-2026-07-08/old-md/` | Appears superseded by `MASTER_ROADMAP.md` and `OCTAGON_EXECUTION_QUEUE.md`; archive only after Saif confirms |
| `index.html.original` | `archive/cleanup-2026-07-08/backups/` | Old root backup/original copy |
| `octagon-erp-raw withoutdatabase .zip` | `archive/cleanup-2026-07-08/backups/` | Root zip export, not active app path |
| `database.backup.*.json` | `archive/cleanup-2026-07-08/backups/` | Root JSON database backups; do not touch active `database.json` |
| `database.json.backup-*` | `archive/cleanup-2026-07-08/backups/` | Root JSON database backups; do not touch active `database.json` |
| `database.json.bak` | `archive/cleanup-2026-07-08/backups/` | Old JSON database backup |
| `database.json.bak-20260627-094508` | `archive/cleanup-2026-07-08/backups/` | Old JSON database backup |
| `database.json.checkpoint-*` | `archive/cleanup-2026-07-08/backups/` | Old JSON database checkpoint |
| `database.json.prev` | `archive/cleanup-2026-07-08/backups/` | Old previous JSON database copy |
| `database.db.backup-*` | `archive/cleanup-2026-07-08/backups/` | SQLite database backup files; do not touch active `database.db`, `database.db-shm`, or `database.db-wal` |
| `database.db.audit_backup_*` | `archive/cleanup-2026-07-08/backups/` | SQLite audit backup |
| `database.db.bak` | `archive/cleanup-2026-07-08/backups/` | Old SQLite backup |
| `database.db.checkpoint-*` | `archive/cleanup-2026-07-08/backups/` | Old SQLite checkpoint |
| `release-backups/20260704_release_pilot/` | `archive/cleanup-2026-07-08/old-releases/` | Release backup bundle; move only after confirming no release process expects this exact path |
| `scripts/__pycache__/` | `archive/cleanup-2026-07-08/temp-scratch/` | Python bytecode cache |
| `scratch/` | `archive/cleanup-2026-07-08/temp-scratch/` | Scratch scripts, logs, generated text, and temporary analysis files; spot-check before moving because some files may document recent data work |
| `extra md/` | `archive/cleanup-2026-07-08/old-md/` | Empty folder at audit time |
| `hand over/OCTAGON_MASTER_REFERENCE.md` | `archive/cleanup-2026-07-08/duplicate-handoffs/` | Older duplicate handoff/reference file; keep `HERE.md`, `STRUCTURE.md`, and current docs in place |

## Duplicate Or Outdated Markdown Files

Safe-looking after approval:

- `hand over/OCTAGON_MASTER_REFERENCE.md` - older duplicate reference/handoff.
- `OCTAGON_MASTER_ERP_COMPLETION_ROADMAP.md` - likely superseded by `MASTER_ROADMAP.md` plus `OCTAGON_EXECUTION_QUEUE.md`, but archive only after Saif confirms it is no longer the source of truth.
- Root Jarvis reports listed above - generated audit/freeze/check reports from 2026-07-05.
- Root prompt files listed above - old agent prompts.

Must stay:

- `README.md`
- `HERE.md`
- `STRUCTURE.md`
- `MASTER_ROADMAP.md`
- `OCTAGON_EXECUTION_QUEUE.md`
- `LAUNCH_AUDIT.md`
- `docs/` current knowledge/release/study files unless Saif specifically approves deeper documentation cleanup.

## Old Release Reports

Safe-looking after approval:

- `RELEASE_FINANCE_PAYROLL_PILOT_2026_07_04.md`
- `OMNI_JARVIS_INTERNAL_PILOT_RELEASE_2026_07_05.md`
- `release-backups/20260704_release_pilot/`

Keep in place unless Saif approves:

- `RELEASE_NOTES.md` - general release notes, could still be current.
- `docs/RELEASE_CANDIDATE_PILOT_CHECKLIST.md` - current docs folder checklist, not proven obsolete.

## Old Prompt Files

Safe-looking after approval:

- `ASK_AGENT_OMNI_JARVIS_AUDIT.md`
- `NEXT_AGENT_OMNI_SECURITY_HARDENING.md`
- `NEXT_AGENT_OMNI_SERVER_SIDE_MUTATIONS.md`
- `operating_costs_prompt.md`

Needs Saif review:

- `COMPANY/برومبت_رفع_الملف_لـClaudeCode.md` - business/archive content, not active app path but under company records.
- `COMPANY/خطة-توليد-الاعلان-SVG.md` - company planning content, not active app path but under company records.

## Old Backup Folders

Safe-looking after approval:

- `release-backups/20260704_release_pilot/`
- `db-backups/*.json`

Needs Saif review before moving:

- `db-backups/phase6d-baseline-marker-20260623.md` - this is a baseline marker, not just a backup blob.
- `COMPANY/_Archive - الأرشيف القديم/` - already an archive, but contains business files.
- `COMPANY/_الأرشيف_القديم_المكرر/` - clearly named duplicate archive, but contains business/accounting/attendance files.

## Temporary, Scratch, And Cache Folders

Safe-looking after approval:

- `.codex-runtime/` - local runtime logs only at audit time.
- `scripts/__pycache__/` - Python bytecode cache.
- `scratch/` - 584 files of scratch scripts/results/logs. Because some are recent data/import analysis, archive as a whole only if Saif accepts moving scratch history out of root.
- `extra md/` - empty folder.

Do not touch:

- `node_modules/`
- `.git/`
- `.vscode/` unless Saif explicitly wants editor metadata archived.
- `.claude/` because it may contain active agent settings/history.

## Suspicious Or Unknown Files That Must Not Be Touched

Leave these exactly where they are until Saif reviews them:

- `../../COMPANY/` - canonical shared location for official workshop/business files and old archives; do not reorganize during generic project cleanup.
- `../../COMPANY/02_الأشخاص - People/الموظفين/سجل الحضور العام/ERP_MIGRATION_OFFICIAL_WORKSHOP_2026_04_01_to_2026_06_18.xlsx` - source-of-truth import workbook/history.
- `workshop_migration_data.json` - migration artifact; not proven obsolete.
- `server-ai-approvals.json` - approval state/data.
- `server-ai-audit.log` - active/recent AI audit log; may be useful for current assistant safety work.
- `check_finance_html.py`
- `get_switch_page_details.py`
- `test-api.js`
- `app/api/employees/route.ts` - old app-style route folder exists, but not proven dead.
- `docs/design/omni-assistant-visual-prototype.md` - explicitly says design scratch surface, but it is new and may be active design work.
- `docs/odoo_octagon_study/` - historical study docs are not runtime files, but may be active architecture references.
- `CUSTOM_API_SETUP.md` - archive candidate only if Saif no longer needs custom API setup notes.
- `OCTAGON_MASTER_ERP_COMPLETION_ROADMAP.md` - likely outdated but needs confirmation.

## Files Safe To Archive Summary

Approximate groups after approval:

- Root server logs: 5 files.
- `.codex-runtime/` logs: 2 files.
- Root generated Jarvis/release/check reports: 14 Markdown/JSON files.
- Root old prompt files: 4 Markdown files.
- Root database backup/checkpoint files: multiple JSON and SQLite backup files; active `database.json`, `database.db`, `database.db-shm`, and `database.db-wal` are excluded.
- `review-reports/*.json`: 28 generated report files; keep folder.
- `release-backups/20260704_release_pilot/`: release backup bundle.
- `scripts/__pycache__/`: generated Python bytecode.
- `scratch/`: temporary/scratch analysis folder, subject to Saif approval.
- `extra md/`: empty folder.
- `hand over/OCTAGON_MASTER_REFERENCE.md`: duplicate/old handoff reference, subject to Saif approval.

## Final DO NOT TOUCH List

- `database.json`
- `database.db`
- `database.db-shm`
- `database.db-wal`
- `.env`
- `.env.local` if later present
- `.git/`
- `node_modules/`
- `index.html`
- `app.js`
- `style.css`
- `server.js`
- `package.json`
- `package-lock.json`
- `README.md`
- `HERE.md`
- `STRUCTURE.md`
- `MASTER_ROADMAP.md`
- `OCTAGON_EXECUTION_QUEUE.md`
- `claude-status.json`
- `claude-review-pointer.json`
- `omni-ai-assistant.js`
- `omni-ai-assistant.css`
- `omni-language-fix.js`
- `omni-language-fix.css`
- `omni-ux-v2.js`
- `omni-ux-v2.css`
- `omni-admin-crud-v2.js`
- `omni-admin-crud-v2.css`
- `modules/`
- `services/`
- `views/`
- `scripts/` except `scripts/__pycache__/` after approval
- `docs/` except this report and any specifically approved old docs
- `COMPANY/` unless Saif gives explicit business-file cleanup approval
- Any file referenced by `index.html`
- Any file referenced by `package.json` scripts if scripts are added later
- Any unknown file

## Phase 2 Approval Gate

Do not proceed to archive until Saif explicitly approves Phase 2 and confirms whether to include conservative review items such as `scratch/`, `review-reports/*.json`, root database backups, and `hand over/OCTAGON_MASTER_REFERENCE.md`.
