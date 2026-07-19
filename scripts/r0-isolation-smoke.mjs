import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = resolve(process.cwd());
const runtimeDir = join(root, 'vnext-runtime');
const dbPath = join(root, 'vnext-data', 'vnext.db');
const jsonPath = join(root, 'vnext-data', 'vnext.json');
const productionRoot = resolve(root, '..', 'octagon-erp');
mkdirSync(runtimeDir, { recursive: true });

const child = spawn(process.execPath, ['server.js'], {
  cwd: root,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: '8091',
    OCTAGON_DEFAULT_PORT: '8091',
    OCTAGON_FALLBACK_PORTS: '',
    OCTAGON_DB_FILE: jsonPath,
    OCTAGON_SQLITE_DB_FILE: dbPath,
    USE_SQLITE: 'true',
    OCTAGON_BACKUP_DIR: join(root, 'vnext-backups'),
    OCTAGON_BACKUP_LOG: join(runtimeDir, 'server-backup.log'),
    OCTAGON_CRASH_LOG: join(runtimeDir, 'server-crash.log'),
    OCTAGON_REVIEW_REPORT_DIR: join(root, 'vnext-review-reports'),
    OCTAGON_UPLOAD_DIR: join(root, 'vnext-uploads'),
    OCTAGON_ATTACHMENT_DIR: join(root, 'vnext-attachments'),
    OCTAGON_PRODUCTION_ROOT: productionRoot,
    OCTAGON_PRODUCTION_DB_FILE: join(productionRoot, 'database.json'),
    OCTAGON_PRODUCTION_SQLITE_DB_FILE: join(productionRoot, 'database.db'),
  },
  stdio: ['ignore', openSync(join(runtimeDir, 'r0-boot.stdout.log'), 'w'), openSync(join(runtimeDir, 'r0-boot.stderr.log'), 'w')],
  windowsHide: true,
});

async function waitForHealth() {
  let lastError = '';
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch('http://127.0.0.1:8091/api/health');
      const body = await response.json();
      if (response.ok && body.success && body.generation === 'vnext') return body;
      lastError = `Unexpected health response: ${JSON.stringify(body)}`;
    } catch (error) {
      lastError = error.message;
    }
    await new Promise(resolveDelay => setTimeout(resolveDelay, 500));
  }
  throw new Error(`VNext health did not become ready: ${lastError}`);
}

try {
  const health = await waitForHealth();
  const rootResponse = await fetch('http://127.0.0.1:8091/');
  if (!rootResponse.ok) throw new Error(`Root response was ${rootResponse.status}`);
  if (!existsSync(dbPath)) throw new Error(`Isolated database was not created: ${dbPath}`);
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(dbPath, { readOnly: true });
  const integrity = db.prepare('PRAGMA integrity_check').get();
  db.close();
  if (integrity.integrity_check !== 'ok') throw new Error(`SQLite integrity check failed: ${JSON.stringify(integrity)}`);
  console.log(JSON.stringify({ health, rootStatus: rootResponse.status, databasePath: dbPath, integrity }, null, 2));
} finally {
  if (!child.killed) child.kill();
}
