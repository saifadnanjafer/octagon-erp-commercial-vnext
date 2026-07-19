# GitHub Preparation Audit

Date: 2026-07-14
Workspace: `C:\Users\Zahraa dlbooz\Downloads\odoo-19.0\octagon-erp`

## Project Summary

Octagon ERP is a private proprietary workshop ERP. The detected application is a Node.js backend plus static frontend application. The backend entry point is `server.js`; frontend assets are loaded from `index.html`, root JavaScript/CSS files, `modules/`, and `views/`.

Detected data technology:

- Local JSON runtime database: `database.json`
- Local SQLite runtime database: `database.db` plus WAL/SHM files
- Runtime backups and operational workbooks present locally

Package manager:

- npm, with `package.json` and `package-lock.json`

Existing scripts:

- No npm scripts are defined in `package.json`.
- Project scripts exist under `scripts/`, including smoke checks, migration helpers, permission regression, finance verification, and import helpers.

## Important Source-Code Directories

- `app/`
- `modules/`
- `services/`
- `views/`
- `scripts/`
- `docs/`

Important source files at the root include `server.js`, `app.js`, `index.html`, `style.css`, `omni-ai-assistant.js`, `omni-ai-assistant.css`, `omni-language-fix.js`, `omni-language-fix.css`, theme CSS files, `package.json`, and `package-lock.json`.

## Files That Should Be Committed

- Application source: root HTML/CSS/JS files, `app/`, `modules/`, `services/`, `views/`
- Safe scripts and checks under `scripts/`
- Safe documentation under `docs/` and root project docs
- Safe configuration templates such as `.env.example`
- Repository governance files: `.gitignore`, `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, `.github/pull_request_template.md`
- This audit and `GITHUB_PREPARATION_REPORT.md`

## Files That Should Be Excluded

- `.env` and all local environment files
- `database.json`
- `database.db`, `database.db-wal`, `database.db-shm`, and other database files
- `database.backup.*.json`
- `workshop_migration_data.json`
- `ERP_MIGRATION_OFFICIAL_WORKSHOP_*.xlsx`
- `COMPANY/`
- `archive/`
- `db-backups/`
- `release-backups/`
- `hand over/`
- `review-reports/`
- `node_modules/`
- `.claude/`, `.codex-runtime/`, `.vscode/`
- `coordination/`, `AGENT_EXECUTION_PLAN.md`, `AGENT_PROMPT.txt`, and root `claude-*.json` local agent artifacts
- Root scratch helpers such as `check_finance_html.py` and `get_switch_page_details.py`
- Runtime logs such as `server-ai-audit.log`, `server-backup.log`, and `server-write-guard.log`
- Runtime approval/session files such as `server-ai-approvals.json`

## Sensitive-File Findings

- Local `.env` exists and contains provider key variable names. It is excluded.
- Local operational databases and backups exist. They are excluded.
- `COMPANY/` contains operational company files, employee/attendance/payroll/finance/customer-style workbooks and documents. It is excluded.
- `archive/` contains database backups, old release bundles, and reports. It is excluded.
- Existing local Git history tracks sensitive/operational paths such as `database.json`, `COMPANY/`, archived database backups, and workbooks. The safe GitHub baseline must not push that history.
- Source scan found environment-variable references for AI, WhatsApp, and server configuration. No secret values were intentionally printed in this audit.
- `server.js` has a local-development fallback verify token for WhatsApp webhook handling. Keep a real `WHATSAPP_VERIFY_TOKEN` in `.env` for any non-local deployment.

## Large-File Findings

Large local files include:

- `database.db-wal`
- `database.db`
- archived database JSON and SQLite backups
- archived release bundles
- multiple `COMPANY/` operational workbooks/documents
- `database.json`
- scheduler database backups

These are excluded from the GitHub baseline.

## Duplicate/Archive Findings

The project contains `archive/cleanup-2026-07-08/` with old backups, duplicate handoffs, old reports, old releases, and temporary scratch artifacts. It is treated as local archive material and excluded from GitHub.

## Existing Git Status

- The directory is already a Git repository.
- Current branch before preparation: `master`
- Existing remote repositories: none detected
- Existing working tree change: `database.json` modified
- Existing history includes sensitive operational files, so it must not be pushed to GitHub.

## Recommended GitHub Structure

Use a sanitized `main` baseline containing only safe source, scripts, docs, configuration templates, and repository governance files. Keep operational data outside GitHub.

Recommended branch model:

- `main` for stable reviewed baseline
- `feature/<feature-name>` for features
- `fix/<bug-name>` for fixes
- `docs/<documentation-name>` for documentation
- `chore/<maintenance-name>` for maintenance

## Unresolved Risks

- Some source files and docs refer to operational concepts such as employees, attendance, payroll, customers, invoices, finance, and ledgers because those are ERP features. These references are not automatically sensitive, but they should be reviewed before any future public sharing.
- The local historical `master` branch remains on the machine and contains sensitive tracked history. Do not push it.
- Database-dependent scripts were not classified as safe to run against production data.
- The root scratch file `check_finance_html.py` has a syntax error and is excluded from the GitHub baseline instead of being edited.
