import path from 'node:path';
import { migrationStatus, runMigrations } from '../vnext/server/db/migration-runner.mjs';

const args = process.argv.slice(2);
const command = args[0] || 'status';
const dbFlag = args.indexOf('--db');
const dbPath = dbFlag >= 0 ? path.resolve(args[dbFlag + 1]) : path.resolve('vnext-data/vnext-migrations.db');
if (command === 'status') console.log(JSON.stringify(await migrationStatus(dbPath), null, 2));
else if (command === 'up' || command === 'down') console.log(JSON.stringify(await runMigrations({ dbPath, direction: command, dryRun: args.includes('--dry-run') }), null, 2));
else throw new Error('Usage: node scripts/migrate.mjs [status|up|down] [--dry-run] [--db path]');
