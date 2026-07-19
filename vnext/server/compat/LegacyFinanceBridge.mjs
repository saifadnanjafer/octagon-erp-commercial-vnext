// clean-room; behavior modeled on Octagon finance migration boundary requirements (proprietary self, not copied)
import { DatabaseSync } from 'node:sqlite';

export function createLegacyFinanceBridge(options = {}) {
  const mode = options.mode || 'read-only-interface';

  if (mode === 'active-dual-post') {
    const snapshotPath = options.snapshotPath;
    if (!snapshotPath) {
      throw new Error('snapshotPath required for active-dual-post');
    }
    const db = new DatabaseSync(snapshotPath);
    db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

    return {
      mode,
      implementationRelease: 'R2.1',
      supportedOperations: Object.freeze(['describeContract', 'mirrorPosting', 'reconcile']),
      describeContract() {
        return Object.freeze({
          source: 'sanitized legacy fixture only',
          output: 'read-write active dual-post',
          mutation: 'enabled',
        });
      },

      mirrorPosting(vnextDb, docId) {
        // Fetch VNext document and lines
        const doc = vnextDb.prepare(`
          SELECT id, company_id, doc_number, move_type, doc_date, state, currency, reversal_of_id, created_at, created_by, updated_at, hash, prev_hash
          FROM fiscal_doc WHERE id = ? AND removed = 0
        `).get(docId);

        if (!doc) {
          throw new Error('VNext fiscal doc not found');
        }

        const lines = vnextDb.prepare(`
          SELECT id, account_id, debit, credit, description, dims
          FROM fiscal_doc_line WHERE fiscal_doc_id = ?
        `).all(docId);

        // Translate to legacy move object
        const lineIds = lines.map((l, index) => {
          let deptId = '';
          if (l.dims) {
            try {
              const parsed = typeof l.dims === 'string' ? JSON.parse(l.dims) : l.dims;
              deptId = parsed.department_id || '';
            } catch (_) {}
          }
          return {
            id: l.id,
            sequence: index,
            account_id: l.account_id,
            label: l.description || '',
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            amount_residual: Math.max(Number(l.debit) || 0, Number(l.credit) || 0),
            partner_id: '',
            department_id: deptId,
            reconciled: false,
            reconcile_id: null,
          };
        });

        const move = {
          id: doc.id,
          name: doc.doc_number || '/',
          journal_id: 'j_gen', // default
          date: doc.doc_date,
          move_type: doc.move_type === 'manual_entry' ? 'entry' : doc.move_type,
          state: doc.state,
          partner_id: '',
          origin: '',
          sourceType: '',
          sourceId: '',
          sourceCanonicalKey: '',
          financeTransactionId: '',
          postingEngine: 'vnext',
          reviewStatus: '',
          line_ids: lineIds,
          amount_total: lineIds.reduce((sum, l) => sum + l.debit, 0),
          hash: doc.hash,
          previous_hash: doc.prev_hash,
          created_at: doc.created_at,
          posted_at: doc.created_at,
          cancelled_at: doc.state === 'cancelled' ? doc.updated_at : null,
          reversed_of: doc.reversal_of_id || null,
          reversal_id: null,
          created_by: doc.created_by || 'system',
          updated_at: doc.updated_at,
          updated_by: doc.created_by || 'system',
          is_active: true,
          companyId: doc.company_id,
        };

        const entry = {
          id: 'je_' + doc.id.replace(/-/g, '_'),
          name: move.name,
          date: move.date,
          journal_id: move.journal_id,
          partner_id: '',
          state: move.state,
          lines: move.line_ids,
          amount_total: move.amount_total,
          origin: '',
          hash: move.hash,
          prev_hash: move.previous_hash,
          previous_hash: move.previous_hash,
          reversed_of: move.reversed_of,
          reversal_id: null,
          account_move_id: move.id,
          created_at: move.created_at,
          created_by: move.created_by,
          updated_at: move.updated_at,
          updated_by: move.created_by,
          is_active: true,
          companyId: move.companyId,
        };

        db.prepare(`
          INSERT INTO collections (collection, id, data)
          VALUES ('account_moves', ?, ?)
          ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data
        `).run(move.id, JSON.stringify(move));

        db.prepare(`
          INSERT INTO collections (collection, id, data)
          VALUES ('journal_entries', ?, ?)
          ON CONFLICT(collection, id) DO UPDATE SET data = excluded.data
        `).run(entry.id, JSON.stringify(entry));
      },

      reconcile(vnextDb, companyId) {
        // Fetch all VNext GL lines total per account
        const tbVnext = vnextDb.prepare(`
          SELECT account_id, SUM(debit) as total_debit, SUM(credit) as total_credit
          FROM gl_line
          WHERE company_id = ?
          GROUP BY account_id
        `).all(companyId);

        // Fetch all legacy account_moves lines total per account
        const movesData = db.prepare(`
          SELECT data FROM collections WHERE collection = 'account_moves'
        `).all();

        const tbLegacy = {};
        for (const row of movesData) {
          const move = JSON.parse(row.data);
          if (move.companyId !== companyId || (move.state !== 'posted' && move.state !== 'cancelled')) continue;
          for (const line of move.line_ids || []) {
            if (!tbLegacy[line.account_id]) {
              tbLegacy[line.account_id] = { debit: 0, credit: 0 };
            }
            tbLegacy[line.account_id].debit += Number(line.debit) || 0;
            tbLegacy[line.account_id].credit += Number(line.credit) || 0;
          }
        }

        const mismatches = [];
        for (const vn of tbVnext) {
          const leg = tbLegacy[vn.account_id] || { debit: 0, credit: 0 };
          const debitDiff = Math.abs(vn.total_debit - leg.debit);
          const creditDiff = Math.abs(vn.total_credit - leg.credit);
          if (debitDiff > 0.0001 || creditDiff > 0.0001) {
            mismatches.push({
              account_id: vn.account_id,
              vnext: { debit: vn.total_debit, credit: vn.total_credit },
              legacy: { debit: leg.debit, credit: leg.credit },
              diff: { debit: debitDiff, credit: creditDiff },
            });
          }
        }

        for (const accountId of Object.keys(tbLegacy)) {
          if (!tbVnext.some(vn => vn.account_id === accountId)) {
            const leg = tbLegacy[accountId];
            if (leg.debit > 0 || leg.credit > 0) {
              mismatches.push({
                account_id: accountId,
                vnext: { debit: 0, credit: 0 },
                legacy: leg,
                diff: leg,
              });
            }
          }
        }

        return {
          reconciled: mismatches.length === 0,
          mismatches,
        };
      },

      close() {
        db.close();
      }
    };
  }

  // Default read-only-interface mode
  return Object.freeze({
    mode,
    implementationRelease: 'R2.1',
    supportedOperations: Object.freeze(['describeContract']),
    describeContract() {
      return Object.freeze({
        source: 'sanitized legacy fixture only',
        output: 'read-only migration preview',
        mutation: 'not available',
      });
    },
  });
}
