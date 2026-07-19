/*
 * OCTAGON OMNISYSTEM - modules/finance-selftest.js
 *
 * T2.4: read-only trial-balance assertion for the v6 double-entry ledger.
 *
 *   window.runTrialBalanceCheck()  ->  Promise<result>
 *
 * Invariant checked: over all account_moves, sum(debits) - sum(credits) = 0,
 * every individual move is internally balanced, and no move line points at the
 * 'suspense' catch-all account. Suspense lines are REPORTED ONLY — historical
 * suspense postings are an owner finding, never an auto-fix (same discipline as
 * T2.2's locked-period skip). Purely read-only: it never mutates the ledger.
 *
 * Exposed on window so the future unified test runner (T5.1 system_check page)
 * can register it; no central test registry exists yet.
 */
(function () {
  'use strict';

  const CENTS = 2;                 // money rounding for imbalance comparison
  const EPSILON = 0.005;           // < half a cent -> treat as balanced
  const SUSPENSE_ACCOUNT = 'suspense';

  function round(n) {
    return Number((Number(n) || 0).toFixed(CENTS));
  }

  async function loadMoves() {
    if (window.PentagonDB && typeof window.PentagonDB.load === 'function') {
      const db = await window.PentagonDB.load({ force: true });
      return Array.isArray(db.account_moves) ? db.account_moves : [];
    }
    if (window.PentagonDB && typeof window.PentagonDB.getCached === 'function') {
      const db = window.PentagonDB.getCached() || {};
      return Array.isArray(db.account_moves) ? db.account_moves : [];
    }
    return [];
  }

  // Read-only trial-balance + integrity check.
  // Returns { ok, moveCount, postedCount, totalDebit, totalCredit, imbalance,
  //           unbalancedMoves:[{id,debit,credit}], suspenseLineCount,
  //           suspenseMoves:[ids], errors:[] }.
  async function runTrialBalanceCheck(options = {}) {
    const includeState = options.includeState || null; // e.g. 'posted' to restrict
    const moves = await loadMoves();
    let totalDebit = 0;
    let totalCredit = 0;
    let postedCount = 0;
    const unbalancedMoves = [];
    const suspenseMoves = [];
    let suspenseLineCount = 0;

    moves.forEach(move => {
      if (includeState && move.state !== includeState) return;
      if (move.state === 'posted') postedCount++;
      let mDebit = 0;
      let mCredit = 0;
      let mSuspense = 0;
      (move.line_ids || []).forEach(line => {
        const d = Number(line.debit || 0);
        const c = Number(line.credit || 0);
        mDebit += d;
        mCredit += c;
        if (line.account_id === SUSPENSE_ACCOUNT) { mSuspense++; suspenseLineCount++; }
      });
      totalDebit += mDebit;
      totalCredit += mCredit;
      if (round(mDebit) !== round(mCredit)) {
        unbalancedMoves.push({ id: move.id, debit: round(mDebit), credit: round(mCredit), state: move.state });
      }
      if (mSuspense > 0) suspenseMoves.push(move.id);
    });

    const imbalance = round(totalDebit - totalCredit);
    const ok = Math.abs(imbalance) < EPSILON && unbalancedMoves.length === 0;

    return {
      name: 'trial_balance',
      ok,
      moveCount: moves.length,
      postedCount,
      totalDebit: round(totalDebit),
      totalCredit: round(totalCredit),
      imbalance,
      unbalancedMoves,
      unbalancedCount: unbalancedMoves.length,
      suspenseLineCount,
      suspenseMoves,
      // Arabic one-line verdict for UI surfaces / the future runner.
      summary: ok
        ? `ميزان المراجعة متوازن (${moves.length} حركة، فرق ${imbalance})`
        : `اختلال ميزان المراجعة: فرق ${imbalance}، حركات غير متوازنة ${unbalancedMoves.length}`,
    };
  }

  window.runTrialBalanceCheck = runTrialBalanceCheck;
  window.OctagonFinanceSelfTest = { runTrialBalanceCheck };
})();
