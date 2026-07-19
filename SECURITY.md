# Security Policy

Octagon ERP is a private proprietary system. Treat the repository and all operational data as confidential.

## Rules

- Never commit `.env`, API keys, passwords, access tokens, private keys, certificates, cookies, or session files.
- Never commit `database.json`, SQLite databases, runtime backups, logs, uploads, employee data, payroll data, attendance exports, customer files, invoices, or company operational folders.
- Keep production databases and backups outside Git.
- Use `.env.example` for variable names only. Use placeholders, not real values.
- Rotate affected credentials immediately after any accidental exposure.

## Internal Reporting

Report security issues privately to the project owner or designated internal maintainer. Do not open public issues, public pull requests, or public discussions containing sensitive details.

## Production Data Handling

Production data may be used only in approved local or server environments. Do not copy production data into source-control folders. Redact sensitive fields before sharing screenshots, reports, or exports.

## Backup Handling

Backups must be stored in approved private storage, not in GitHub. Before archiving or sharing any backup, confirm that it does not contain credentials, personal data, payroll data, attendance data, customer records, invoices, or operational databases unless the recipient is explicitly authorized.
