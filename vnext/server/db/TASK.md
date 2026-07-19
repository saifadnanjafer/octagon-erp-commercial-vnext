# R0.4 Migration Baseline

This is migration infrastructure only. The runner uses SQLite WAL, `busy_timeout = 5000`, ordered migration files, a global `schema_migrations` ledger, transactional idempotent execution, dry run, and a `VACUUM INTO` pre-migration backup. JSON is reserved for dimensions, custom fields, and external snapshots; it is not a replacement for business tables.

The scope registry explicitly classifies global technical/reference, tenant-root, company-owned, and optionally company-scoped tables. `company_id` is required only for company-owned records, with a foreign key to the R0-only tenant-root anchor. The probe tables validate this policy and are removed by down migration; no R1 commercial master data is created. R1.13 replaces the anchor with the actual companies/branches/master-data kernel.
