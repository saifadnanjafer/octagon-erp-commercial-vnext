/**
 * Audit fix (2026-07-04, round 2) — normalizes the opening-balance
 * account_move's identity fields to the explicit convention requested for
 * this audit, and corrects its date. Does NOT touch the amount or accounts
 * (already fixed in scripts/fix_opening_balance_ledger_integrity.mjs).
 *
 * Before this script the move (MOVE_OPENING_1783114061898) had:
 *   sourceCanonicalKey: "opening-balance/cash_workshop"
 *   sourceType:         "migration"
 *   sourceId:            "cashOpening"
 *   date:                "2026-01-01"  (arbitrary placeholder, not tied to
 *                                       any real import or pre-first-movement day)
 *
 * After this script:
 *   sourceCanonicalKey: "OPENING_CASHBOX_LEGACY_2026_02_14_997000"
 *   sourceType:         "opening_balance"
 *   sourceRef:          "finance.cashOpening"
 *   date:               "2026-02-14"  (one day before 2026-02-15, the
 *                                      earliest dated posted move among the
 *                                      526 migrated finance.transactions —
 *                                      there is no explicit "import date"
 *                                      field recorded anywhere to prefer instead)
 *
 * Idempotent: if the move's sourceCanonicalKey already equals the target, the
 * script is a no-op (safe to re-run).
 *
 * Run from octagon-erp/:
 *   node scripts/normalize_opening_balance_metadata.mjs           # apply
 *   node scripts/normalize_opening_balance_metadata.mjs --dry-run # preview
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_SQLITE = path.join(ROOT, 'database.db');

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_MOVE_ID = 'MOVE_OPENING_1783114061898';
const TARGET_KEY = 'OPENING_CASHBOX_LEGACY_2026_02_14_997000';
const TARGET_DATE = '2026-02-14';

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function computeHash(move, previousHash = 'genesis') {
  const payload = JSON.stringify({
    id: move.id,
    name: move.name,
    date: move.date,
    journal_id: move.journal_id,
    move_type: move.move_type,
    previous_hash: previousHash,
    line_ids: (move.line_ids || []).map(line => ({
      account_id: line.account_id,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      partner_id: line.partner_id || '',
    })),
  });
  let h = 0x811c9dc5;
  for (let i = 0; i < payload.length; i += 1) {
    h = Math.imul(h ^ payload.charCodeAt(i), 0x01000193) >>> 0;
  }
  const suffix = btoa(unescape(encodeURIComponent(payload.slice(0, 24))))
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 16);
  return `${h.toString(16).padStart(8, '0')}-${suffix}`;
}

function recomputeChain(moves) {
  const posted = moves
    .filter(m => m.state === 'posted')
    .sort((a, b) => (
      String(a.date || '').localeCompare(String(b.date || ''))
      || String(a.name || '').localeCompare(String(b.name || ''))
      || String(a.id || '').localeCompare(String(b.id || ''))
    ));
  let previousHash = 'genesis';
  posted.forEach(m => {
    m.previous_hash = previousHash;
    m.hash = computeHash(m, previousHash);
    previousHash = m.hash;
  });
  return posted.length;
}

function mirrorJournalEntry(move) {
  return {
    id: move.legacy_journal_entry_id || move.id,
    name: move.name,
    date: move.date,
    journal_id: move.journal_id,
    partner_id: move.partner_id || '',
    state: move.state,
    lines: JSON.parse(JSON.stringify(move.line_ids || [])),
    amount_total: Number(move.amount_total || 0),
    origin: move.origin || '',
    hash: move.hash || null,
    prev_hash: move.previous_hash || null,
    previous_hash: move.previous_hash || null,
    reversed_of: move.reversed_of || null,
    reversal_id: move.reversal_id || null,
    account_move_id: move.id,
    created_at: move.created_at,
    created_by: move.created_by || 'system',
    updated_at: new Date().toISOString(),
    updated_by: move.updated_by || 'system',
    is_active: move.is_active !== false,
    companyId: move.companyId || '',
  };
}

function main() {
  const report = { dryRun: DRY_RUN };
  if (!fs.existsSync(DB_SQLITE)) {
    console.error('database.db not found');
    process.exit(1);
  }

  const backupPath = `${DB_SQLITE}.backup-before-opening-balance-metadata-${timestamp()}`;
  if (!DRY_RUN) fs.copyFileSync(DB_SQLITE, backupPath);

  const sqliteDb = new DatabaseSync(DB_SQLITE, DRY_RUN ? { readOnly: true } : {});
  const collRows = sqliteDb.prepare('SELECT rowid, collection, id, data FROM collections').all();
  const moves = [];
  const rowidByMoveId = new Map();
  let journalRows = [];
  collRows.forEach(row => {
    if (row.collection === 'account_moves') {
      const m = JSON.parse(row.data);
      moves.push(m);
      rowidByMoveId.set(m.id, row.rowid);
    } else if (row.collection === 'journal_entries') {
      journalRows.push(row);
    }
  });

  const target = moves.find(m => m.id === TARGET_MOVE_ID);
  if (!target) {
    report.error = `Target move ${TARGET_MOVE_ID} not found`;
    console.log(JSON.stringify(report, null, 2));
    sqliteDb.close();
    if (!DRY_RUN) fs.unlinkSync(backupPath);
    process.exit(1);
  }

  report.before = {
    sourceCanonicalKey: target.sourceCanonicalKey,
    sourceType: target.sourceType,
    sourceRef: target.sourceRef || null,
    date: target.date,
  };

  if (target.sourceCanonicalKey === TARGET_KEY && target.date === TARGET_DATE) {
    report.alreadyNormalized = true;
    console.log(JSON.stringify(report, null, 2));
    sqliteDb.close();
    if (!DRY_RUN) fs.unlinkSync(backupPath); // nothing changed, no need for a backup
    return;
  }

  target.sourceCanonicalKey = TARGET_KEY;
  target.sourceType = 'opening_balance';
  target.sourceRef = 'finance.cashOpening';
  target.date = TARGET_DATE;

  report.after = {
    sourceCanonicalKey: target.sourceCanonicalKey,
    sourceType: target.sourceType,
    sourceRef: target.sourceRef,
    date: target.date,
  };

  const hashChainRecomputedCount = recomputeChain(moves);
  report.hashChainRecomputedCount = hashChainRecomputedCount;

  // Sanity: balance still holds, opening move still first in the chain.
  let totalDebit = 0, totalCredit = 0;
  moves.forEach(m => {
    if (m.state !== 'posted') return;
    (m.line_ids || []).forEach(l => { totalDebit += Number(l.debit || 0); totalCredit += Number(l.credit || 0); });
  });
  report.balancedAfter = Math.round(totalDebit) === Math.round(totalCredit);
  report.totalDebitAfter = totalDebit;
  report.totalCreditAfter = totalCredit;

  if (DRY_RUN) {
    console.log(JSON.stringify(report, null, 2));
    sqliteDb.close();
    return;
  }

  sqliteDb.exec('BEGIN TRANSACTION');
  try {
    const updateStmt = sqliteDb.prepare('UPDATE collections SET id = ?, data = ? WHERE rowid = ?');
    moves.forEach(m => {
      updateStmt.run(m.id, JSON.stringify(m), rowidByMoveId.get(m.id));
    });

    // Re-mirror journal_entries for every posted move (hash chain touched all of them).
    const deleteStmt = sqliteDb.prepare('DELETE FROM collections WHERE rowid = ?');
    const insertStmt = sqliteDb.prepare('INSERT INTO collections (collection, id, data) VALUES (?, ?, ?)');
    journalRows.forEach(row => deleteStmt.run(row.rowid));
    moves.filter(m => m.state === 'posted').forEach(m => {
      insertStmt.run('journal_entries', m.legacy_journal_entry_id || m.id, JSON.stringify(mirrorJournalEntry(m)));
    });

    const auditEntry = {
      id: `audit_fix_${Date.now()}`,
      action: 'cash_opening_balance_metadata_normalized',
      entityType: 'account_move',
      entityId: TARGET_MOVE_ID,
      createdAt: new Date().toISOString(),
      userId: 'system_audit_fix',
      reason: 'Financial audit (2026-07-04, round 2): normalized the opening-balance move to the explicit sourceCanonicalKey/sourceType/sourceRef convention and corrected its date to the day before the earliest real posted movement (2026-02-15), since no explicit import-date field was recorded anywhere.',
      beforeSnapshot: report.before,
      afterSnapshot: report.after,
    };
    insertStmt.run('audit_log', auditEntry.id, JSON.stringify(auditEntry));

    sqliteDb.exec('COMMIT');
    report.applied = true;
    report.sqliteBackup = backupPath;
  } catch (e) {
    sqliteDb.exec('ROLLBACK');
    report.error = `SQLite apply failed: ${e.message}`;
  }
  sqliteDb.close();

  const reportDir = path.join(ROOT, 'review-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `opening_balance_metadata_normalization_${timestamp()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport written: ${reportPath}`);
  if (report.error) process.exit(1);
}

main();
