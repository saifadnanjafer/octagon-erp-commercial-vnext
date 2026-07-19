/**
 * Audit fix (2026-07-04) — corrects a directly-injected opening-balance
 * account_move that bypassed FinanceService (services/financeService.js):
 *
 *   MOVE_OPENING_1783114061898 (997,000 IQD, dated 2026-01-01) posted its
 *   credit leg to account_id "equity_opening", which does not exist in the
 *   chart of accounts (the real account for this purpose is
 *   "opening_balances", code 3900, "أرصدة افتتاحية"). Because the move was
 *   written directly into the collections table instead of via
 *   FinanceService.createMove()/postMove():
 *     1. it never got a real sequence name (stuck at "/"),
 *     2. its hash/previous_hash are placeholders ("MIGRATION_HASH_OPENING"),
 *        breaking the tamper-evident posted-hash-chain for every move
 *        chronologically after it,
 *     3. its legacy mirror was written as two separate journal_entries rows
 *        (JE_OPENING / JE_OPENING_CR) instead of the standard one-row-per-move
 *        mirror used everywhere else, producing a 531-vs-530 count mismatch
 *        between journal_entries and account_moves (the two are supposed to
 *        be 1:1 — see the SOURCE OF TRUTH comment in financeService.js).
 *
 * This script fixes the account_id, assigns a proper sequence name, replaces
 * the placeholder mirror rows with the standard single-row mirror, and
 * recomputes the posted-move hash chain for ALL posted moves using the exact
 * same algorithm as FinanceService.postMove()'s recomputePostedHashChain (so
 * the result is identical to what the app would already produce the next
 * time any move gets posted -- this is idempotent, not a new algorithm).
 *
 * Run from octagon-erp/:
 *   node scripts/fix_opening_balance_ledger_integrity.mjs           # apply
 *   node scripts/fix_opening_balance_ledger_integrity.mjs --dry-run # preview only
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_JSON = path.join(ROOT, 'database.json');
const DB_SQLITE = path.join(ROOT, 'database.db');

const DRY_RUN = process.argv.includes('--dry-run');
const BAD_ACCOUNT = 'equity_opening';
const GOOD_ACCOUNT = 'opening_balances';
const TARGET_MOVE_ID = 'MOVE_OPENING_1783114061898';

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
    updated_at: move.updated_at || new Date().toISOString(),
    updated_by: move.updated_by || 'system',
    is_active: move.is_active !== false,
    companyId: move.companyId || '',
  };
}

function nextSequenceName(moves, move) {
  const year = String(move.date || '').slice(0, 4);
  const prefix = 'GEN'; // journal_id j_gen -> GEN prefix (matches sequencePrefixForMove for j_gen)
  const prefixYear = `${prefix}/${year}/`;
  const max = moves.reduce((highest, existing) => {
    const name = String(existing.name || '');
    if (!name.startsWith(prefixYear)) return highest;
    const n = Number(name.slice(prefixYear.length));
    return Number.isFinite(n) ? Math.max(highest, n) : highest;
  }, 0);
  return `${prefixYear}${String(max + 1).padStart(5, '0')}`;
}

function fixDb(db, report) {
  const moves = Array.isArray(db.account_moves) ? db.account_moves : [];
  const move = moves.find(m => m.id === TARGET_MOVE_ID);
  if (!move) {
    report.errors.push(`Target move ${TARGET_MOVE_ID} not found`);
    return;
  }

  // 1) Fix invalid account_id
  let fixedAccountLines = 0;
  (move.line_ids || []).forEach(line => {
    if (line.account_id === BAD_ACCOUNT) {
      line.account_id = GOOD_ACCOUNT;
      fixedAccountLines += 1;
    }
  });
  report.fixedAccountLines = fixedAccountLines;

  // 2) Assign a real sequence name if it never got one
  if (!move.name || move.name === '/') {
    move.name = nextSequenceName(moves, move);
  }
  report.assignedName = move.name;

  // 3) Recompute the posted-move hash chain for ALL posted moves (idempotent,
  //    identical algorithm to FinanceService.recomputePostedHashChain).
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
  report.hashChainRecomputedCount = posted.length;

  // 4) Replace the two ad-hoc JE_OPENING/JE_OPENING_CR legacy rows with the
  //    single standard mirror row every other move uses.
  if (!Array.isArray(db.journal_entries)) db.journal_entries = [];
  const before = db.journal_entries.length;
  db.journal_entries = db.journal_entries.filter(e => e.account_move_id !== TARGET_MOVE_ID && e.id !== TARGET_MOVE_ID);
  db.journal_entries.push(mirrorJournalEntry(move));
  report.journalEntriesBefore = before;
  report.journalEntriesAfter = db.journal_entries.length;

  // 5) Re-mirror every posted move so hash/previous_hash stay in sync in the
  //    legacy table too (upsert, same shape as upsertLegacyJournalEntry).
  posted.forEach(m => {
    const legacyId = m.legacy_journal_entry_id || m.id;
    const idx = db.journal_entries.findIndex(e => e.id === legacyId || e.account_move_id === m.id);
    const mirror = mirrorJournalEntry(m);
    if (idx === -1) db.journal_entries.push(mirror);
    else db.journal_entries[idx] = { ...db.journal_entries[idx], ...mirror };
  });

  // 6) Audit trail
  if (!Array.isArray(db.audit_log)) db.audit_log = [];
  db.audit_log.push({
    id: `audit_fix_${Date.now()}`,
    action: 'cash_opening_balance_move_corrected',
    entityType: 'account_move',
    entityId: TARGET_MOVE_ID,
    createdAt: new Date().toISOString(),
    userId: 'system_audit_fix',
    reason: 'Financial audit (2026-07-04): opening-balance move bypassed FinanceService and posted to a non-existent account (equity_opening). Corrected to opening_balances (code 3900), assigned a real sequence name, recomputed the posted-move hash chain, and normalized its journal_entries mirror to one row (was two ad-hoc rows).',
    beforeSnapshot: { account_id: BAD_ACCOUNT, name: '/', hash: 'MIGRATION_HASH_OPENING' },
    afterSnapshot: { account_id: GOOD_ACCOUNT, name: move.name, hash: move.hash },
  });

  // Sanity: totals still balance after the account_id swap.
  let totalDebit = 0, totalCredit = 0;
  moves.forEach(m => {
    if (m.state !== 'posted') return;
    (m.line_ids || []).forEach(l => { totalDebit += Number(l.debit || 0); totalCredit += Number(l.credit || 0); });
  });
  report.totalDebitAfter = totalDebit;
  report.totalCreditAfter = totalCredit;
  report.balancedAfter = Math.round(totalDebit) === Math.round(totalCredit);
}

function main() {
  const report = { dryRun: DRY_RUN, errors: [] };
  const stamp = timestamp();

  // ---- database.json (thin git-tracked fallback mirror) ----
  // Known-stale by design (see reference_finance_db_paths / phase8a_rc_audit
  // memory: full v6 data lives only in SQLite database.db). If this specific
  // move was never written there, there is nothing to fix in this file —
  // that is a pre-existing divergence, not something to paper over here.
  if (fs.existsSync(DB_JSON)) {
    const jsonDb = JSON.parse(fs.readFileSync(DB_JSON, 'utf8'));
    const jsonReport = { errors: [] };
    fixDb(jsonDb, jsonReport);
    report.json = jsonReport;
    if (jsonReport.errors.length) {
      report.jsonSkippedReason = 'database.json does not contain this move (stale fallback mirror, see reference_finance_db_paths memory) — no change needed there.';
    } else if (!DRY_RUN) {
      const backupPath = `${DB_JSON}.backup-before-opening-balance-fix-${stamp}`;
      fs.copyFileSync(DB_JSON, backupPath);
      fs.writeFileSync(DB_JSON, JSON.stringify(jsonDb, null, 2));
      report.jsonBackup = backupPath;
      report.jsonApplied = true;
    }
  } else {
    report.jsonSkippedReason = 'database.json not found';
  }

  // ---- database.db (SQLite, live store) ----
  if (fs.existsSync(DB_SQLITE)) {
    if (!DRY_RUN) {
      const backupPath = `${DB_SQLITE}.backup-before-opening-balance-fix-${stamp}`;
      fs.copyFileSync(DB_SQLITE, backupPath);
      report.sqliteBackup = backupPath;
    }
    const mode = DRY_RUN ? { readOnly: true } : {};
    const sqliteDb = new DatabaseSync(DB_SQLITE, mode);
    // Key everything by SQLite rowid, not the embedded "id" column — a prior
    // raw insert (the same one that bypassed FinanceService for the opening
    // move) left the id COLUMN null on 3 rows (account_moves rowid 2847,
    // journal_entries rowid 2848/2849) even though the JSON payload's own
    // .id field is populated. Matching by id would silently no-op on those
    // rows, so every account_moves/journal_entries row is tracked by rowid
    // here and this also repairs the null id column as a side effect.
    const collRows = sqliteDb.prepare('SELECT rowid, collection, id, data FROM collections').all();
    const db = {};
    const rowidByRecord = new Map(); // record object -> rowid (account_moves/journal_entries only)
    for (const row of collRows) {
      if (!Array.isArray(db[row.collection])) db[row.collection] = [];
      const record = JSON.parse(row.data);
      db[row.collection].push(record);
      if (row.collection === 'account_moves' || row.collection === 'journal_entries') {
        rowidByRecord.set(record, row.rowid);
      }
    }
    const sqliteReport = { errors: [] };
    fixDb(db, sqliteReport);
    report.sqlite = sqliteReport;

    if (!DRY_RUN && !sqliteReport.errors.length) {
      sqliteDb.exec('BEGIN TRANSACTION');
      try {
        const updateStmt = sqliteDb.prepare('UPDATE collections SET id = ?, data = ? WHERE rowid = ?');
        const insertStmt = sqliteDb.prepare('INSERT INTO collections (collection, id, data) VALUES (?, ?, ?)');
        const deleteStmt = sqliteDb.prepare('DELETE FROM collections WHERE rowid = ?');

        // account_moves: update every posted move by rowid (hash chain touched all of them)
        db.account_moves.forEach(m => {
          const rowid = rowidByRecord.get(m);
          if (rowid === undefined) { report.errors.push(`No rowid found for account_move ${m.id}`); return; }
          updateStmt.run(m.id, JSON.stringify(m), rowid);
        });

        // journal_entries: delete every existing row by rowid (bypasses the
        // corrupt-id problem entirely) and insert the rebuilt array fresh.
        const existingJERowids = collRows.filter(r => r.collection === 'journal_entries').map(r => r.rowid);
        existingJERowids.forEach(rowid => deleteStmt.run(rowid));
        db.journal_entries.forEach(je => insertStmt.run('journal_entries', je.id, JSON.stringify(je)));

        // audit_log: append-only, insert the new entries not yet present
        const existingAuditIds = new Set(
          sqliteDb.prepare('SELECT id FROM collections WHERE collection = ?').all('audit_log').map(r => r.id)
        );
        db.audit_log.forEach(entry => {
          if (!existingAuditIds.has(entry.id)) insertStmt.run('audit_log', entry.id, JSON.stringify(entry));
        });

        sqliteDb.exec('COMMIT');
        report.sqliteApplied = true;
      } catch (e) {
        sqliteDb.exec('ROLLBACK');
        report.errors.push(`SQLite apply failed: ${e.message}`);
      }
    }
    sqliteDb.close();
  } else {
    report.errors.push('database.db not found');
  }

  const reportDir = path.join(ROOT, 'review-reports');
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, `opening_balance_ledger_integrity_fix_${stamp}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(JSON.stringify(report, null, 2));
  console.log(`\nReport written: ${reportPath}`);
  if (report.errors.length) process.exit(1);
}

main();
