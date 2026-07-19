import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const root = path.resolve('.');
const production = path.resolve(root, '..', 'octagon-erp');
const base = {
  ...process.env,
  PORT: '8191',
  OCTAGON_DEFAULT_PORT: '8191',
  OCTAGON_FALLBACK_PORTS: '',
  OCTAGON_PRODUCTION_ROOT: production,
  OCTAGON_PRODUCTION_DB_FILE: path.join(production, 'database.json'),
  OCTAGON_PRODUCTION_SQLITE_DB_FILE: path.join(production, 'database.db'),
};
const cases = [
  ['json', { OCTAGON_DB_FILE: path.join(production, 'database.json'), OCTAGON_SQLITE_DB_FILE: path.join(root, 'vnext-data', 'guard-json.db') }],
  ['sqlite', { OCTAGON_DB_FILE: path.join(root, 'vnext-data', 'guard-sqlite.json'), OCTAGON_SQLITE_DB_FILE: path.join(production, 'database.db') }],
];
const results = cases.map(([kind, extra]) => {
  const run = spawnSync(process.execPath, ['server.js'], { cwd: root, env: { ...base, ...extra }, encoding: 'utf8', windowsHide: true });
  assert.equal(run.status, 1, `${kind} production path must exit 1`);
  assert.match(`${run.stdout}\n${run.stderr}`, /VNext startup guard refused a production database path/);
  return { kind, exitCode: run.status, refusedBeforeInitialization: true };
});
console.log(JSON.stringify({ status: 'pass', cases: results }, null, 2));
