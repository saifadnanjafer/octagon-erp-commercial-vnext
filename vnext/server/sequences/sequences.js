// clean-room; behavior modeled on platform/server/sequences.js (proprietary self, not copied)
'use strict';

const COUNTER_TOKEN = /\{(#+)\}/;

/**
 * Issue the next number for `key`, formatted through `pattern`.
 * @param {object} db      sqlite handle
 * @param {string} key     sequence key (e.g. "crm_lead")
 * @param {string} pattern e.g. "LEAD-{YYYY}-{#####}"
 * @param {Date}   [now]   clock
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

  const ownsTransaction = !db.isTransaction;
  if (ownsTransaction) db.exec('BEGIN IMMEDIATE');
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
      const yearRolled = usesYear && Number(row.year) !== year;
      const monthRolled = usesMonth && (Number(row.year) !== year || Number(row.month) !== month);
      n = yearRolled || monthRolled ? 1 : Number(row.next_number) || 1;
      db.prepare(
        'UPDATE x_sequences SET next_number = ?, year = ?, month = ?, updated_at = ? WHERE seq_key = ?'
      ).run(n + 1, year, month, at.toISOString(), seqKey);
    }
    if (ownsTransaction) db.exec('COMMIT');
    issued = n;
  } catch (error) {
    if (ownsTransaction) { try { db.exec('ROLLBACK'); } catch (_) {} }
    throw error;
  }

  return { number: issued, formatted: formatSeq(pat, issued, year, month) };
}

function formatSeq(pattern, n, year, month) {
  return String(pattern)
    .replace('{YYYY}', String(year))
    .replace('{MM}', String(month).padStart(2, '0'))
    .replace(COUNTER_TOKEN, (_, hashes) => String(n).padStart(hashes.length, '0'));
}

function hashRecordChain(db, entity, recordId, companyId, sequenceNumber = '') {
  const lastRow = db.prepare('SELECT hash FROM x_records WHERE entity = ? AND id != ? AND removed = 0 AND hash IS NOT NULL ORDER BY updated_at DESC, id DESC LIMIT 1').get(entity, recordId);
  const prevHash = lastRow ? lastRow.hash : '0'.repeat(64);

  const row = db.prepare('SELECT data FROM x_records WHERE entity = ? AND id = ?').get(entity, recordId);
  const dataStr = row ? row.data : '{}';

  const hashInput = `${entity}|${recordId}|${companyId}|${dataStr}|${prevHash}|${sequenceNumber}`;
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(hashInput).digest('hex');

  db.prepare('UPDATE x_records SET hash = ?, prev_hash = ? WHERE entity = ? AND id = ?')
    .run(hash, prevHash, entity, recordId);

  return { hash, prevHash };
}

function verifyChain(db, entity) {
  const rows = db.prepare('SELECT id, company_id, data, hash, prev_hash FROM x_records WHERE entity = ? AND removed = 0 AND hash IS NOT NULL ORDER BY updated_at ASC, id ASC').all(entity);
  let expectedPrevHash = '0'.repeat(64);
  const crypto = require('crypto');
  for (const row of rows) {
    if (row.prev_hash !== expectedPrevHash) {
      return { ok: false, error: `Chain broken at record ${row.id}: expected prev_hash ${expectedPrevHash}, got ${row.prev_hash}` };
    }
    let seq = '';
    try {
      const dataObj = JSON.parse(row.data);
      seq = dataObj.seq || dataObj.sequence || '';
    } catch (_) {}
    const computedInput = `${entity}|${row.id}|${row.company_id}|${row.data}|${row.prev_hash}|${seq}`;
    const computedHash = crypto.createHash('sha256').update(computedInput).digest('hex');
    if (row.hash !== computedHash) {
      return { ok: false, error: `Hash mismatch at record ${row.id}` };
    }
    expectedPrevHash = row.hash;
  }
  return { ok: true };
}

module.exports = { nextSeq, formatSeq, hashRecordChain, verifyChain };
