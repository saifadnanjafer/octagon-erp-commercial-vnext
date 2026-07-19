// clean-room; behavior modeled on OCTAGON_VNEXT_EXECUTION_PLAN.md R0.4 requirements (proprietary self, not copied)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, '../../../migrations');

function sqlString(value) { return `'${String(value).replaceAll("'", "''")}'`; }

export function openMigrationDatabase(dbPath) {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000; PRAGMA foreign_keys = ON;');
  // This is a global technical ledger: it is deliberately the sole bootstrapped table.
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_id TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL,
    checksum TEXT NOT NULL
  ) STRICT;`);
  return db;
}

export function schemaFingerprint(db) {
  const schema = db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE type IN ('table','index','trigger','view') AND name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  return crypto.createHash('sha256').update(JSON.stringify(schema)).digest('hex');
}

async function loadMigrations() {
  const files = fs.readdirSync(migrationsDir).filter((name) => /^\d+_.+\.mjs$/.test(name)).sort();
  const results = [];
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(migrationsDir, file)).href);
    if (!mod.migration?.id || typeof mod.migration.up !== 'function' || typeof mod.migration.down !== 'function') {
      throw new Error(`Invalid migration: ${file}`);
    }
    const dependsOn = Array.isArray(mod.migration.dependsOn) ? mod.migration.dependsOn.map(String) : [];
    results.push({ ...mod.migration, dependsOn, file });
  }
  return results;
}

/**
 * Resolve the order migrations must run in, honoring each migration's
 * optional `dependsOn: string[]` (ids that must apply before it). Migrations
 * without `dependsOn` are legacy-compatible: relative to each other and to
 * any migration whose dependencies are already satisfied, they keep their
 * filename-sort order (the pre-sorted `migrations` array is scanned
 * top-to-bottom on every pass, so the earliest-filename ready migration is
 * always chosen first). A dependency only ever pulls a migration LATER than
 * plain filename order would, never earlier.
 *
 * Validates before resolving: every declared dependency id must exist
 * (fails fast, before any migration runs), and the graph must be acyclic
 * (fails fast rather than partially applying anything).
 */
export function resolveMigrationOrder(migrations) {
  const byId = new Map(migrations.map((m) => [m.id, m]));
  for (const m of migrations) {
    for (const dep of m.dependsOn || []) {
      if (!byId.has(dep)) {
        throw new Error(`Migration "${m.id}" declares dependsOn unknown migration "${dep}"`);
      }
    }
  }
  const placed = new Set();
  const order = [];
  const remaining = migrations.slice();
  while (remaining.length) {
    let progressed = false;
    for (let i = 0; i < remaining.length; i++) {
      const m = remaining[i];
      if ((m.dependsOn || []).every((dep) => placed.has(dep))) {
        order.push(m);
        placed.add(m.id);
        remaining.splice(i, 1);
        progressed = true;
        break;
      }
    }
    if (!progressed) {
      const ids = remaining.map((m) => m.id);
      throw new Error(`Migration dependency cycle detected among: ${ids.join(', ')}`);
    }
  }
  return order;
}

export function backupBeforeMigration(db, dbPath, backupDir) {
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const backupPath = path.join(backupDir, `pre-migration-${stamp}.db`);
  db.exec(`VACUUM INTO ${sqlString(backupPath)};`);
  return backupPath;
}

export async function migrationStatus(dbPath) {
  const db = openMigrationDatabase(dbPath);
  const migrations = resolveMigrationOrder(await loadMigrations());
  const applied = new Set(db.prepare('SELECT migration_id FROM schema_migrations').all().map((row) => row.migration_id));
  const result = migrations.map((migration) => ({ id: migration.id, status: applied.has(migration.id) ? 'applied' : 'pending' }));
  db.close();
  return result;
}

export async function runMigrations({ dbPath, direction = 'up', dryRun = false, backupDir }) {
  const db = openMigrationDatabase(dbPath);
  // Validated and ordered BEFORE anything is inspected/applied: a missing
  // dependency or a cycle must fail here, before any migration.up()/down()
  // runs (up or down direction alike).
  const migrations = resolveMigrationOrder(await loadMigrations());
  const appliedRows = db.prepare('SELECT migration_id FROM schema_migrations ORDER BY migration_id').all();
  const applied = new Set(appliedRows.map((row) => row.migration_id));
  const selected = direction === 'up'
    ? migrations.filter((migration) => !applied.has(migration.id))
    : migrations.filter((migration) => applied.has(migration.id)).reverse();
  if (dryRun) {
    const result = { direction, dryRun, migrations: selected.map((migration) => migration.id), backupPath: null };
    db.close();
    return result;
  }
  const effectiveBackupDir = backupDir || path.resolve(path.dirname(dbPath), '../vnext-migration-backups');
  const backupPath = selected.length ? backupBeforeMigration(db, dbPath, effectiveBackupDir) : null;
  for (const migration of selected) {
    db.exec('BEGIN IMMEDIATE;');
    try {
      if (direction === 'up') {
        migration.up(db);
        db.prepare('INSERT INTO schema_migrations (migration_id, applied_at, checksum) VALUES (?, ?, ?)').run(
          migration.id, new Date().toISOString(), crypto.createHash('sha256').update(migration.file).digest('hex')
        );
      } else {
        migration.down(db);
        db.prepare('DELETE FROM schema_migrations WHERE migration_id = ?').run(migration.id);
      }
      db.exec('COMMIT;');
    } catch (error) {
      db.exec('ROLLBACK;');
      db.close();
      throw error;
    }
  }
  const status = migrations.map((migration) => ({ id: migration.id, status: db.prepare('SELECT 1 FROM schema_migrations WHERE migration_id = ?').get(migration.id) ? 'applied' : 'pending' }));
  db.close();
  return { direction, dryRun, migrations: selected.map((migration) => migration.id), backupPath, status };
}
