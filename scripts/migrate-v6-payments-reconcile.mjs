import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.json');
const BACKUP_SCRIPT = path.join(ROOT, 'scripts', 'backup-db.mjs');

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const SKIP_BACKUP = args.has('--skip-backup');

function loadDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, `${JSON.stringify(db, null, 2)}\n`);
}

function backupFirst() {
  if (CHECK_ONLY || SKIP_BACKUP) return;
  execFileSync(process.execPath, [BACKUP_SCRIPT, '--tag', 'pre_v6_payments_reconcile'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function migrate(db) {
  const changes = [];
  if (!Array.isArray(db.account_payments)) {
    db.account_payments = [];
    changes.push('create account_payments collection');
  }
  if (!Array.isArray(db.account_partial_reconciles)) {
    db.account_partial_reconciles = [];
    changes.push('create account_partial_reconciles collection');
  }
  for (const move of db.account_moves || []) {
    for (const line of move.line_ids || []) {
      if (line.amount_residual === undefined) {
        const debit = Number(line.debit || 0);
        const credit = Number(line.credit || 0);
        line.amount_residual = Math.max(debit, credit);
        changes.push(`seed residual ${move.name || move.id}/${line.id}`);
      }
    }
  }
  db._v6_payments_reconcile = true;
  return changes;
}

function main() {
  backupFirst();
  const db = loadDb();
  const changes = migrate(db);
  if (CHECK_ONLY) {
    console.log(`V6 payments/reconcile check: ${changes.length} pending changes.`);
    changes.forEach(change => console.log(`  - ${change}`));
    return;
  }
  if (!changes.length) {
    console.log('V6 payments/reconcile migration already applied. 0 changes.');
    return;
  }
  writeDb(db);
  console.log(`V6 payments/reconcile migration applied: ${changes.length} changes.`);
  changes.forEach(change => console.log(`  - ${change}`));
}

main();
