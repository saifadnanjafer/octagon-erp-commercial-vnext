# Octagon ERP

> **Legacy/current production-track document.** This copied root README is non-authoritative for Commercial VNext. Read `../octagon-analysis/README.md`, the canonical VNext roadmap, and the canonical VNext execution plan instead.

Octagon ERP is a private proprietary ERP system for workshop operations. The repository contains the application source code and safe development scaffolding only. Production databases, employee records, payroll records, customer files, logs, uploads, backups, and other operational data are not stored in GitHub.

## Detected Stack

- Runtime: Node.js
- Backend: `server.js` with local HTTP/API handlers and dotenv-based configuration
- Frontend: static HTML, CSS, and JavaScript loaded from `index.html`, `views/`, `modules/`, and root assets
- Data layer: local JSON and SQLite operational files at runtime, excluded from Git
- Package manager: npm with `package-lock.json`
- Python utilities: migration, verification, and import scripts under `scripts/`

## Main Source Areas

- `server.js` and `server-jarvis-*.js`: local backend, AI proxy, security, and support services
- `index.html`, `app.js`, `style.css`, and theme CSS files: main browser shell and UI
- `modules/`: feature modules for ERP domains and assistant tools
- `services/`: shared service logic for permissions, audit, finance, records, stock, tenant, and state handling
- `views/`: page templates used by the application shell
- `scripts/`: non-destructive checks, migration helpers, smoke tests, and verification utilities
- `docs/`, `HERE.md`, `STRUCTURE.md`, `MASTER_ROADMAP.md`, `OCTAGON_EXECUTION_QUEUE.md`: safe project documentation and roadmap material

## Development Prerequisites

- Node.js 22 or newer is recommended because the server uses modern Node APIs.
- npm
- Python 3.11 or newer for optional Python scripts
- A local `.env` file created from `.env.example`
- A local development database or restored operational database kept outside Git

## Installation

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` with local values. Keep secrets and operational database paths local.

## Local Startup

```powershell
node server.js
```

The default local URL is `http://localhost:8080/`. The read-only server health endpoint is:

```text
GET /api/server/status
```

## Checks

There are no npm scripts in `package.json` at the time this baseline was prepared. Use targeted checks instead:

```powershell
node --check server.js
node --check app.js
node --check omni-ai-assistant.js
node --check omni-language-fix.js
node scripts/smoke-boot.js
```

Some scripts require an operational database. Do not run migration, seed, cleanup, or destructive data scripts against production data unless a reviewed task explicitly requires it.

## Build

No separate build step is currently detected. The browser app is served from checked-in static assets and Node.js backend files.

## Database Warning

Runtime database files such as `database.json`, `database.db`, SQLite WAL/SHM files, backups, import workbooks, and company operational documents are intentionally ignored. They must not be committed or uploaded to GitHub.

## Git Workflow

- Keep `main` stable.
- Do not commit directly to `main`.
- Create task-specific branches such as `feature/<feature-name>`, `fix/<bug-name>`, `docs/<documentation-name>`, or `chore/<maintenance-name>`.
- Keep commits focused.
- Run relevant checks before opening a pull request.
- Require review before merging.

## Security

Never commit secrets, credentials, tokens, production databases, operational exports, customer data, employee data, attendance data, payroll data, logs, uploads, or backups. Use `.env.example` only for variable names and placeholders.
