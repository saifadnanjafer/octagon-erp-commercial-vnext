// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md §R10.1 (proprietary self, not copied)
// R10.1 legacy source reader. The migration's ONLY window onto the legacy JSON
// `collections` store, and it is strictly read-only:
//   - the handle is opened readOnly and pinned with PRAGMA query_only
//   - the file must live under an allowlisted source root (vnext-fixtures by
//     default; an operator may point at a prepared snapshot via
//     OCTAGON_MIGRATION_SOURCE_ROOT for a real cut-over)
//   - the frozen payroll/attendance/timesheet collections are refused outright,
//     so no migration step can read — let alone copy — the frozen zone
//
// "Two worlds": this JSON store is the source of truth for the migration. The
// relational x_* W0 spike data is NOT a source; it is discarded by the engine's
// discard step and logged.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const DEFAULT_SOURCE_ROOT = path.join(REPO_ROOT, 'vnext-fixtures');

// The frozen zone. Reading these through the migration source is denied so that
// a mis-specified step can never pull payroll, attendance, or timesheet data
// into the new world. They stay in the legacy store, owned by the legacy app.
const FROZEN_COLLECTIONS = new Set([
  'employees',
  'employee_advances',
  'employee_payroll_closings',
  'payroll_payments',
  'payroll_periods',
  'omni.employeeAttendance',
  'omni.workshopAdvances',
  'omni.workshopTimesheetCases',
]);

function fail(message, statusCode, code) {
  const error = new Error(message);
  error.statusCode = statusCode;
  error.code = code;
  return error;
}

function sourceRoot() {
  return path.resolve(process.env.OCTAGON_MIGRATION_SOURCE_ROOT || DEFAULT_SOURCE_ROOT);
}

function resolveSourcePath(sourceRef) {
  if (typeof sourceRef !== 'string' || !sourceRef.trim()) {
    throw fail('migration source reference is required', 400, 'SOURCE_REF_REQUIRED');
  }
  const root = sourceRoot();
  const resolved = path.resolve(root, sourceRef);
  const relative = path.relative(root, resolved);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw fail('migration source must live under the allowlisted source root', 403, 'SOURCE_OUTSIDE_ROOT');
  }
  if (!fs.existsSync(resolved)) throw fail(`migration source not found: ${sourceRef}`, 404, 'SOURCE_NOT_FOUND');
  return resolved;
}

class LegacyBusinessSource {
  constructor(sourceRef) {
    this.sourceRef = sourceRef;
    this.sourcePath = resolveSourcePath(sourceRef);
    this.db = new DatabaseSync(this.sourcePath, { readOnly: true });
    this.db.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 5000;');
  }

  assertReadable(collection) {
    if (typeof collection !== 'string' || !/^[A-Za-z0-9_.-]+$/.test(collection)) {
      throw fail('invalid legacy collection name', 400, 'INVALID_COLLECTION');
    }
    if (FROZEN_COLLECTIONS.has(collection)) {
      throw fail(
        `frozen collection "${collection}" is never readable by the migration source`,
        403,
        'FROZEN_COLLECTION_DENIED'
      );
    }
  }

  /** Ordered rows of a business collection: [{ sourceId, attributes }]. */
  list(collection) {
    this.assertReadable(collection);
    return this.db
      .prepare('SELECT id, data FROM collections WHERE collection = ? ORDER BY id')
      .all(collection)
      .map((row) => ({ sourceId: row.id, attributes: JSON.parse(row.data) }));
  }

  count(collection) {
    this.assertReadable(collection);
    return Number(
      this.db.prepare('SELECT COUNT(*) AS n FROM collections WHERE collection = ?').get(collection).n
    );
  }

  collections() {
    return this.db
      .prepare('SELECT DISTINCT collection FROM collections ORDER BY collection')
      .all()
      .map((row) => row.collection);
  }

  /**
   * Stable fingerprint of the source content inventory. Recorded on the run so
   * a resumed run can prove it is continuing against the same snapshot rather
   * than silently mixing two different extracts.
   */
  fingerprint() {
    const inventory = this.db
      .prepare('SELECT collection, COUNT(*) AS n, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM collections GROUP BY collection ORDER BY collection')
      .all()
      .map((row) => `${row.collection}:${row.n}:${row.bytes}`)
      .join('|');
    return crypto.createHash('sha256').update(inventory).digest('hex');
  }

  close() {
    try { this.db.close(); } catch (_) { /* already closed */ }
  }
}

function openSource(sourceRef) {
  return new LegacyBusinessSource(sourceRef);
}

module.exports = {
  openSource,
  LegacyBusinessSource,
  FROZEN_COLLECTIONS,
  _internal: { resolveSourcePath, sourceRoot, fail },
};
