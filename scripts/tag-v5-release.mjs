import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DB_FILE = path.join(ROOT, 'database.json');

const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));

if (db._release_tag === 'v5.0') {
  console.log('V5.0 tag already present. 0 changes.');
  process.exit(0);
}

db._release_tag = 'v5.0';
db._release_tagged_at = db._release_tagged_at || new Date().toISOString();

fs.writeFileSync(DB_FILE, `${JSON.stringify(db, null, 2)}\n`);
console.log('Stamped _release_tag: v5.0');
