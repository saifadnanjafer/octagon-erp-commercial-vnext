import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { DatabaseSync } from 'node:sqlite';

const dbPath = process.argv[2];
if (!dbPath) throw new Error('Usage: node scripts/r0-inspect-sqlite-schema.mjs <read-only-sqlite-path>');
const resolved = path.resolve(dbPath);
if (!fs.existsSync(resolved)) throw new Error(`Database does not exist: ${resolved}`);
const db = new DatabaseSync(resolved, { readOnly: true });
const quoteIdentifier = value => `[${String(value).replaceAll(']', ']]')}]`;
const tableNames = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
const tables = tableNames.map(({ name }) => ({
  name,
  rowCount: Number(db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdentifier(name)}`).get().n),
  columns: db.prepare(`PRAGMA table_info(${quoteIdentifier(name)})`).all().map(column => ({ name: column.name, type: column.type, notnull: column.notnull })),
}));
const userVersion = Number(db.prepare('PRAGMA user_version').get().user_version);
db.close();
console.log(JSON.stringify({ databasePath: resolved, readOnly: true, userVersion, tables }, null, 2));
