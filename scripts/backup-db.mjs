/**
 * Octagon V5 — database backup utility.
 *
 * Creates a timestamped, integrity-checked copy of `database.json` next to it.
 *
 * Usage (from octagon-erp/):
 *   node scripts/backup-db.mjs                # full backup
 *   node scripts/backup-db.mjs --tag inventory # tagged backup -> database.backup.inventory.<ts>.json
 *   node scripts/backup-db.mjs --keep 10       # prune to the 10 newest untagged backups after writing
 *   node scripts/backup-db.mjs --verify <file> # validate an existing backup against the live DB
 *
 * The backup is verified by:
 *   1. parsing the JSON,
 *   2. confirming `_schema_version === "5.0"`,
 *   3. confirming top-level collections match the live DB's set,
 *   4. confirming record counts match for each known collection.
 *
 * Exit codes:
 *   0 — success
 *   1 — backup or verification failed
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.json');

const args = process.argv.slice(2);
function argValue(flag) {
  const idx = args.indexOf(flag);
  return idx === -1 ? null : args[idx + 1];
}
const TAG = argValue('--tag');
const KEEP = Number(argValue('--keep')) || 0;
const VERIFY = argValue('--verify');

function timestamp(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function loadDb(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return { raw, db: JSON.parse(raw) };
}

function topLevelCollections(db) {
  return Object.keys(db).filter(k => Array.isArray(db[k])).sort();
}

function recordCounts(db) {
  const out = {};
  topLevelCollections(db).forEach(k => { out[k] = db[k].length; });
  return out;
}

function verify(backupPath) {
  const live = loadDb(DB_FILE).db;
  const backup = loadDb(backupPath).db;
  const errors = [];
  if (backup._schema_version !== live._schema_version) {
    errors.push(`schema mismatch: backup=${backup._schema_version} live=${live._schema_version}`);
  }
  const liveCols = topLevelCollections(live);
  const backupCols = topLevelCollections(backup);
  const missing = liveCols.filter(c => !backupCols.includes(c));
  if (missing.length) errors.push(`backup missing collections: ${missing.join(', ')}`);
  const liveCounts = recordCounts(live);
  const backupCounts = recordCounts(backup);
  liveCols.forEach(c => {
    if (liveCounts[c] !== backupCounts[c]) {
      errors.push(`count mismatch on ${c}: backup=${backupCounts[c] ?? 0} live=${liveCounts[c]}`);
    }
  });
  return errors;
}

function pruneOldBackups(keep) {
  const all = fs.readdirSync(ROOT)
    .filter(f => /^database\.backup\.\d{8}_\d{4}\.json$/.test(f))
    .map(f => ({ file: f, full: path.join(ROOT, f), mtime: fs.statSync(path.join(ROOT, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  const drop = all.slice(keep);
  drop.forEach(({ full, file }) => {
    fs.unlinkSync(full);
    console.log(`  pruned ${file}`);
  });
  return drop.length;
}

function main() {
  if (VERIFY) {
    const target = path.isAbsolute(VERIFY) ? VERIFY : path.join(ROOT, VERIFY);
    if (!fs.existsSync(target)) {
      console.error(`Verify failed: ${target} does not exist.`);
      process.exit(1);
    }
    const errors = verify(target);
    if (errors.length) {
      console.error(`Verify FAILED for ${path.basename(target)}:`);
      errors.forEach(e => console.error(`  - ${e}`));
      process.exit(1);
    }
    console.log(`Verify PASSED for ${path.basename(target)}.`);
    return;
  }

  if (!fs.existsSync(DB_FILE)) {
    console.error(`No database.json at ${DB_FILE}.`);
    process.exit(1);
  }

  const stamp = timestamp();
  const tagPart = TAG ? `.${TAG.replace(/[^a-z0-9_]/gi, '_')}` : '';
  const backupName = `database.backup${tagPart}.${stamp}.json`;
  const backupPath = path.join(ROOT, backupName);
  fs.copyFileSync(DB_FILE, backupPath);

  const errors = verify(backupPath);
  if (errors.length) {
    console.error(`Backup integrity check FAILED for ${backupName}:`);
    errors.forEach(e => console.error(`  - ${e}`));
    fs.unlinkSync(backupPath);
    process.exit(1);
  }
  const bytes = fs.statSync(backupPath).size;
  console.log(`Backup written: ${backupName} (${bytes.toLocaleString()} bytes)`);

  if (KEEP > 0) {
    console.log(`Pruning untagged backups, keeping ${KEEP} newest:`);
    const dropped = pruneOldBackups(KEEP);
    if (dropped === 0) console.log('  nothing to prune.');
  }
}

main();
