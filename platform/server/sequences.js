// ============================================================================
// Octagon Commercial — document numbering (packet P0.4)
// Pattern from NocoBase plugin-field-sequence docs + IDURAR
// increaseBySettingKey (setting-counter idea), re-expressed for SQLite.
//
// nextSeq(db, key, pattern) issues the next formatted number for `key`,
// atomically: the read-increment-write happens inside BEGIN IMMEDIATE, so two
// concurrent creates can never receive the same number (SQLite takes the
// write lock up front; with the server's busy_timeout a contended caller
// waits instead of failing).
//
// Pattern tokens (from entities.json "sequence"):
//   {YYYY}  4-digit year        — presence enables yearly counter reset
//   {MM}    2-digit month       — presence enables monthly counter reset
//   {#...#} zero-padded counter — padding = number of '#' characters
// Example: "LEAD-{YYYY}-{#####}" -> "LEAD-2026-00001"
// A pattern with no {#} token gets "-{#####}" appended (defensive default).
//
// Storage: x_sequences(seq_key PK, next_number, year, month, updated_at) —
// created by x-tables.sql. Deliberately separate from the legacy top-level
// `sequences` table (T1.4), which is owned by server.js and never touched.
// ============================================================================
'use strict';

const COUNTER_TOKEN = /\{(#+)\}/;

/**
 * Issue the next number for `key`, formatted through `pattern`.
 * @param {object} db      sqlite handle (node:sqlite DatabaseSync or better-sqlite3)
 * @param {string} key     sequence key, usually the entity name (e.g. "crm_lead")
 * @param {string} pattern e.g. "LEAD-{YYYY}-{#####}"
 * @param {Date}   [now]   injectable clock for tests
 * @returns {{ number: number, formatted: string }}
 */
function nextSeq(db, key, pattern, now) {
  if (!db) throw new Error('nextSeq: db handle is required');
  const seqKey = String(key || '').trim();
  if (!seqKey) throw new Error('nextSeq: key is required');
  let pat = String(pattern || '').trim() || '{#####}';
  if (!COUNTER_TOKEN.test(pat)) pat = pat + '-{#####}';

  const at = now instanceof Date ? now : new Date();
  const year = at.getFullYear();
  const month = at.getMonth() + 1;
  const usesYear = pat.includes('{YYYY}');
  const usesMonth = pat.includes('{MM}');

  db.exec('BEGIN IMMEDIATE');
  let issued;
  try {
    const row = db
      .prepare('SELECT seq_key, next_number, year, month FROM x_sequences WHERE seq_key = ?')
      .get(seqKey);

    let n;
    if (!row) {
      n = 1;
      db.prepare(
        'INSERT INTO x_sequences (seq_key, next_number, year, month, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(seqKey, 2, year, month, at.toISOString());
    } else {
      // Reset the counter when the pattern is period-scoped and the period
      // rolled over (LEAD-2026-00042 -> LEAD-2027-00001).
      const yearRolled = usesYear && Number(row.year) !== year;
      const monthRolled = usesMonth && (Number(row.year) !== year || Number(row.month) !== month);
      n = yearRolled || monthRolled ? 1 : Number(row.next_number) || 1;
      db.prepare(
        'UPDATE x_sequences SET next_number = ?, year = ?, month = ?, updated_at = ? WHERE seq_key = ?'
      ).run(n + 1, year, month, at.toISOString(), seqKey);
    }
    db.exec('COMMIT');
    issued = n;
  } catch (error) {
    try { db.exec('ROLLBACK'); } catch (_) { /* already rolled back */ }
    throw error;
  }

  return { number: issued, formatted: formatSeq(pat, issued, year, month) };
}

/** Render a pattern with a concrete counter value. Pure function. */
function formatSeq(pattern, n, year, month) {
  return String(pattern)
    .replace('{YYYY}', String(year))
    .replace('{MM}', String(month).padStart(2, '0'))
    .replace(COUNTER_TOKEN, (_, hashes) => String(n).padStart(hashes.length, '0'));
}

module.exports = { nextSeq, formatSeq };
