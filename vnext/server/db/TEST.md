# R0.4 Tests

Run `node scripts/test-r0-migrations.mjs`. It proves a fresh build, clean status, dry run, automatic backup, idempotent seed guard, rejected missing or invalid `company_id`, and byte-identical baseline schema fingerprint after up/down.
