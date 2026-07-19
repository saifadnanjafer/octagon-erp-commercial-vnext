// clean-room; behavior modeled on octagon-erp/database.db snapshot boundary (proprietary self, not copied)
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const FIXTURE_DIR = path.resolve(process.cwd(), 'vnext-fixtures');

function requireFixturePath(snapshotPath) {
  const resolved = path.resolve(snapshotPath);
  const relative = path.relative(FIXTURE_DIR, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('Legacy access is limited to a sanitized fixture under vnext-fixtures.');
  }
  if (!fs.existsSync(resolved)) throw new Error(`Legacy fixture not found: ${resolved}`);
  return resolved;
}

export class LegacySnapshotStore {
  constructor(snapshotPath) {
    this.snapshotPath = requireFixturePath(snapshotPath);
    this.db = new DatabaseSync(this.snapshotPath, { readOnly: true });
    this.db.exec('PRAGMA query_only = ON; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  }

  listCollection(collectionName) {
    if (!/^[A-Za-z0-9_.-]+$/.test(collectionName)) throw new Error('Invalid legacy collection name.');
    return this.db.prepare('SELECT id, data FROM collections WHERE collection = ? ORDER BY id').all(collectionName)
      .map((row) => ({ legacyId: row.id, attributes: JSON.parse(row.data) }));
  }

  goldenSummary(employeeId, payrollPeriodId) {
    const row = this.db.prepare(
      'SELECT summary_json FROM r0_legacy_golden_summary WHERE employee_id = ? AND payroll_period_id = ?'
    ).get(employeeId, payrollPeriodId);
    return row ? JSON.parse(row.summary_json) : null;
  }

  listGoldenSummaryKeys() {
    return this.db.prepare('SELECT employee_id, payroll_period_id FROM r0_legacy_golden_summary ORDER BY employee_id, payroll_period_id').all();
  }

  close() { this.db.close(); }
}
