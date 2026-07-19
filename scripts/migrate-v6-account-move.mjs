import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.json');
const BACKUP_SCRIPT = path.join(ROOT, 'scripts', 'backup-db.mjs');
const VERSION = '6.0';

const args = new Set(process.argv.slice(2));
const CHECK_ONLY = args.has('--check');
const SKIP_BACKUP = args.has('--skip-backup');

function loadDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, `${JSON.stringify(db, null, 2)}\n`);
}

function toNumber(value) {
  return Number(value || 0);
}

function lineTotals(lines = []) {
  return lines.reduce((acc, line) => {
    acc.debit += toNumber(line.debit);
    acc.credit += toNumber(line.credit);
    return acc;
  }, { debit: 0, credit: 0 });
}

function normalizeLine(line = {}, index = 0, partnerId = '') {
  return {
    id: line.id || `AML_LEGACY_${index + 1}`,
    sequence: Number.isFinite(Number(line.sequence)) ? Number(line.sequence) : index,
    account_id: line.account_id || '',
    label: line.label || line.name || '',
    debit: toNumber(line.debit),
    credit: toNumber(line.credit),
    partner_id: line.partner_id || partnerId || '',
    department_id: line.department_id || '',
    reconciled: !!line.reconciled,
    reconcile_id: line.reconcile_id || null,
  };
}

function journalById(db, journalId) {
  return (db.journals || []).find(journal => journal.id === journalId) || null;
}

function sequencePrefix(db, move) {
  const journal = journalById(db, move.journal_id);
  if (move.move_type === 'out_invoice') return 'INV';
  if (move.move_type === 'out_refund') return 'RINV';
  if (move.move_type === 'in_invoice') return 'BILL';
  if (move.move_type === 'in_refund') return 'RBILL';
  if (journal?.type === 'sale') return 'INV';
  if (journal?.type === 'purchase') return 'BILL';
  return journal?.sequence_prefix || journal?.code || 'MISC';
}

function nextName(db, move, counters) {
  if (move.name && move.name !== '/') return move.name;
  const year = String(move.date || new Date().toISOString().slice(0, 10)).slice(0, 4);
  const key = `${sequencePrefix(db, move)}/${year}`;
  counters[key] = (counters[key] || 0) + 1;
  return `${key}/${String(counters[key]).padStart(5, '0')}`;
}

function seedCounters(db, moves) {
  const counters = {};
  for (const move of moves) {
    const name = String(move.name || '');
    const match = name.match(/^(.+\/\d{4})\/(\d+)$/);
    if (!match) continue;
    counters[match[1]] = Math.max(counters[match[1]] || 0, Number(match[2]));
  }
  return counters;
}

function hashMove(move, previousHash = 'genesis') {
  const payload = JSON.stringify({
    id: move.id,
    name: move.name,
    date: move.date,
    journal_id: move.journal_id,
    move_type: move.move_type,
    previous_hash: previousHash,
    line_ids: (move.line_ids || []).map(line => ({
      account_id: line.account_id,
      debit: toNumber(line.debit),
      credit: toNumber(line.credit),
      partner_id: line.partner_id || '',
    })),
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function convertJournalEntry(entry, db, counters) {
  const line_ids = (entry.lines || []).map((line, index) => normalizeLine(line, index, entry.partner_id || ''));
  const totals = lineTotals(line_ids);
  const move = {
    id: entry.account_move_id || entry.id || `MOVE_LEGACY_${Math.random().toString(36).slice(2)}`,
    name: entry.name || '/',
    journal_id: entry.journal_id || 'j_gen',
    date: entry.date || new Date().toISOString().slice(0, 10),
    move_type: 'entry',
    state: entry.state || 'posted',
    partner_id: entry.partner_id || '',
    origin: entry.origin || '',
    line_ids,
    amount_total: totals.debit,
    hash: entry.hash || null,
    previous_hash: entry.previous_hash || entry.prev_hash || null,
    created_at: entry.created_at || new Date().toISOString(),
    posted_at: entry.posted_at || (entry.state === 'posted' ? (entry.updated_at || entry.created_at || new Date().toISOString()) : null),
    cancelled_at: entry.cancelled_at || null,
    reversed_of: entry.reversed_of || null,
    reversal_id: entry.reversal_id || null,
    legacy_journal_entry_id: entry.id || '',
    created_by: entry.created_by || 'system',
    updated_at: entry.updated_at || entry.created_at || new Date().toISOString(),
    updated_by: entry.updated_by || 'system',
    is_active: entry.is_active !== false,
  };
  move.name = nextName(db, move, counters);
  return move;
}

function migrate(db) {
  const changes = [];
  if (db._release_tag !== 'v5.0') {
    db._release_tag = 'v5.0';
    db._release_tagged_at = db._release_tagged_at || new Date().toISOString();
    changes.push('stamp _release_tag v5.0');
  }
  if (!Array.isArray(db.account_moves)) {
    db.account_moves = [];
    changes.push('create account_moves collection');
  }

  const existingByLegacy = new Set(db.account_moves.map(move => move.legacy_journal_entry_id).filter(Boolean));
  const existingIds = new Set(db.account_moves.map(move => move.id));
  const counters = seedCounters(db, db.account_moves);
  const converted = [];

  for (const entry of db.journal_entries || []) {
    if (existingByLegacy.has(entry.id) || existingIds.has(entry.account_move_id || entry.id)) continue;
    converted.push(convertJournalEntry(entry, db, counters));
  }

  if (converted.length) {
    db.account_moves.push(...converted);
    changes.push(`migrate ${converted.length} journal_entries`);
  }

  const seenMoveIds = new Map();
  for (const move of db.account_moves) {
    const baseId = move.id || 'MOVE_LEGACY';
    const seen = seenMoveIds.get(baseId) || 0;
    if (seen > 0) {
      const suffix = String(seen + 1).padStart(2, '0');
      move.id = `${baseId}_v6_${suffix}`;
      move.legacy_duplicate_of = baseId;
      changes.push(`dedupe account_move id ${baseId} -> ${move.id}`);
    }
    seenMoveIds.set(baseId, seen + 1);
  }

  const posted = db.account_moves
    .filter(move => move.state === 'posted')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || String(a.name || '').localeCompare(String(b.name || '')) || String(a.id || '').localeCompare(String(b.id || '')));

  let previousHash = 'genesis';
  for (const move of posted) {
    if (move.previous_hash !== previousHash || !move.hash) {
      move.previous_hash = previousHash;
      move.hash = hashMove(move, previousHash);
      changes.push(`hash ${move.name || move.id}`);
    }
    previousHash = move.hash;
  }

  if (db._schema_version !== VERSION) {
    db._schema_version = VERSION;
    db._migrated_at = new Date().toISOString();
    changes.push(`stamp _schema_version ${VERSION}`);
  }

  return changes;
}

function backupFirst() {
  if (SKIP_BACKUP || CHECK_ONLY) return;
  execFileSync(process.execPath, [BACKUP_SCRIPT, '--tag', 'pre_v6_account_move'], {
    cwd: ROOT,
    stdio: 'inherit',
  });
}

function main() {
  if (!fs.existsSync(DB_FILE)) throw new Error(`No database.json at ${DB_FILE}`);
  backupFirst();
  const db = loadDb();
  const changes = migrate(db);
  if (CHECK_ONLY) {
    console.log(`V6 account.move check: ${changes.length} pending changes.`);
    changes.forEach(change => console.log(`  - ${change}`));
    return;
  }
  if (!changes.length) {
    console.log('V6 account.move migration already applied. 0 changes.');
    return;
  }
  writeDb(db);
  console.log(`V6 account.move migration applied: ${changes.length} changes.`);
  changes.forEach(change => console.log(`  - ${change}`));
}

main();
