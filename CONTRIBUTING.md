# Contributing

Octagon ERP uses a conservative workflow because the project handles sensitive operational domains.

## Workflow

1. Do not commit directly to `main`.
2. Create a focused branch, for example `feature/<feature-name>`, `fix/<bug-name>`, `docs/<documentation-name>`, or `chore/<maintenance-name>`.
3. Keep commits small and task-specific.
4. Run relevant syntax checks, smoke tests, or targeted verification before opening a pull request.
5. Do not commit generated data, logs, uploads, database files, backups, secrets, employee data, payroll data, attendance records, customer files, or operational exports.
6. Request review before merging.

## Pull Requests

Each pull request should describe the scope, checks run, database impact, security impact, and rollback considerations. If a check is skipped, document why.

## Commercial VNext provenance

VNext is a clean-room commercial build. Never copy GPL, AGPL, OEEL, OPL, or unresolved-NocoBase source into this folder. RuoYi and AureusERP are MIT sources, but any non-trivial copied code requires its preserved MIT notice in `THIRD_PARTY_NOTICES.md` and a specific provenance record. Every new VNext engine must carry the required clean-room header and pass `node scripts/check-provenance.mjs`.
