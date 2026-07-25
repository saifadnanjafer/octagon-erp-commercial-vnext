// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.2 (proprietary self, not copied)
// R10.2 payroll compatibility surface — deliberately READ-ONLY.
//
// This is the embedded frozen-payroll view: closed periods, their captured
// closing figures, the golden fingerprint, and the replay verdict. There is no
// write verb anywhere in this router by construction — any method other than GET
// is refused with WRITE_SURFACE_DENIED, and there is no write permission to
// grant. Payroll, attendance, and timesheet mutation stays exclusively with the
// legacy application.
//
// The timesheet itself is not re-implemented here: the existing read-only legacy
// workshop bridge already serves timesheet cases and attendance, so this surface
// points at it rather than duplicating a second copy of frozen data.
'use strict';

const path = require('node:path');

const API_BASE = '/api/x/payroll-compat';
const VIEW_PERMISSION = 'payroll_compat:view';
const TIMESHEET_BRIDGE = '/api/x/r3/legacy-workshop';

function envelope(data, error = null, meta = null) { return { success: !error, data: error ? null : data, error, meta }; }

function mountPayrollCompatRoutes(deps = {}) {
  const { sendJson, requireSession, canPermission, goldenFixtureRef } = deps;

  const write = sendJson || ((res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(body));
  });
  const inert = { setHeader() {}, writeHead() {}, end() {}, headersSent: false, writableEnded: false };
  const fixtureRef = goldenFixtureRef || 'legacy-payroll-golden.db';

  let replayModule = null;
  async function loadReplay() {
    if (!replayModule) {
      replayModule = await import(require('node:url').pathToFileURL(path.join(__dirname, 'PayrollGoldenReplay.mjs')).href);
    }
    return replayModule;
  }

  function tryAuth(req) {
    const session = typeof requireSession === 'function' ? requireSession(req, inert, { allowLocalDev: false }) : null;
    if (!session || !session.ok) return null;
    return {
      id: String(session.userId || session.user?.id || ''),
      groups: session.groups || [],
      local: /^local-/.test(session.mode || ''),
    };
  }

  function requireViewer(req, res) {
    const user = tryAuth(req);
    if (!user) { write(res, 401, envelope(null, 'Login session required', { code: 'AUTH_REQUIRED' })); return null; }
    if (user.local) { write(res, 403, envelope(null, 'Local development sessions are rejected', { code: 'LOCAL_DEV_REJECTED' })); return null; }
    const allowed = user.groups.includes('admin')
      || user.groups.includes('system.admin')
      || (typeof canPermission === 'function' && canPermission(user, VIEW_PERMISSION));
    if (!allowed) { write(res, 403, envelope(null, `Permission required: ${VIEW_PERMISSION}`, { code: 'FORBIDDEN' })); return null; }
    return user;
  }

  /**
   * Self-integrity replay: re-derives every captured closing digest from the
   * fixture's own stored payload. This proves the fixture has not been tampered
   * with; it is NOT the cross-fixture golden-month proof, which runs in the
   * R10.2 acceptance suite against an independently captured fixture.
   */
  async function integritySelfCheck() {
    const replay = await loadReplay();
    const store = new replay.GoldenPayrollStore(fixtureRef);
    try {
      const result = replay.replayGoldenMonths({
        store,
        summaryProvider: (employeeId, periodId) => {
          const row = store.getClosing(employeeId, periodId);
          return row ? JSON.parse(row.closing_json) : null;
        },
        totalsProvider: (periodId) => {
          const period = store.getPeriod(periodId);
          return period ? {
            accrual_total: period.accrual_total,
            settlement_total: period.settlement_total,
            payment_total: period.payment_total,
            advance_total: period.advance_total,
            advance_count: period.advance_count,
          } : null;
        },
      });
      return { result, manifest: store.manifest() };
    } finally { store.close(); }
  }

  function handle(req, res, url) {
    if (!url.pathname.startsWith(`${API_BASE}/`) && url.pathname !== API_BASE) return false;

    // No write verb exists on this surface, at all.
    if (req.method !== 'GET') {
      write(res, 405, envelope(null, 'The payroll compatibility surface is read-only', { code: 'WRITE_SURFACE_DENIED' }));
      return true;
    }
    const user = requireViewer(req, res);
    if (!user) return true;

    const rest = url.pathname.slice(API_BASE.length).split('/').filter(Boolean).map(decodeURIComponent);

    const respond = (promise) => {
      promise
        .then((data) => write(res, 200, envelope(data)))
        .catch((error) => write(res, error.statusCode || 500, envelope(null, error.message || 'payroll compatibility read failed', { code: error.code || 'PAYROLL_COMPAT_ERROR' })));
      return true;
    };

    if (!rest.length) {
      return respond((async () => {
        const replay = await loadReplay();
        const store = new replay.GoldenPayrollStore(fixtureRef);
        try {
          return {
            readOnly: true,
            source: fixtureRef,
            goldenFingerprint: store.fingerprint(),
            timesheetBridge: TIMESHEET_BRIDGE,
            timesheetMutability: 'legacy application only — VNext exposes no payroll, attendance, or timesheet write path',
            periods: store.listPeriods().map((period) => ({
              period_id: period.period_id,
              label: `${period.year}-${String(period.month).padStart(2, '0')}`,
              fidelity: period.fidelity,
              closing_count: period.closing_count,
              accrual_total: period.accrual_total,
              settlement_total: period.settlement_total,
              payment_total: period.payment_total,
              advance_total: period.advance_total,
            })),
          };
        } finally { store.close(); }
      })());
    }

    if (rest[0] === 'periods' && rest.length === 2) {
      return respond((async () => {
        const replay = await loadReplay();
        const store = new replay.GoldenPayrollStore(fixtureRef);
        try {
          const period = store.getPeriod(rest[1]);
          if (!period) { const error = new Error('payroll period not found'); error.statusCode = 404; error.code = 'PERIOD_NOT_FOUND'; throw error; }
          return {
            period,
            closings: store.listClosings(period.period_id).map((row) => ({
              employee_id: row.employee_id,
              edge_case_tags: JSON.parse(row.edge_case_tags),
              closing: JSON.parse(row.closing_json),
              closing_digest: row.closing_digest,
            })),
            payments: store.listPayments(period.period_id),
          };
        } finally { store.close(); }
      })());
    }

    if (rest[0] === 'replay' && rest.length === 1) {
      return respond((async () => {
        const { result, manifest } = await integritySelfCheck();
        return { kind: 'integrity_self_check', manifest, ...result };
      })());
    }

    if (rest[0] === 'signoff' && rest.length === 1) {
      return respond((async () => {
        const replay = await loadReplay();
        const { result } = await integritySelfCheck();
        return replay.buildSignOff(result, {
          timesheetSurface: { mounted: TIMESHEET_BRIDGE, mode: 'read-only' },
        });
      })());
    }

    return false;
  }

  return { handle, API_BASE, VIEW_PERMISSION };
}

module.exports = { mountPayrollCompatRoutes, API_BASE, VIEW_PERMISSION };
