import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const EXTENSIONS = new Set(['.html', '.js', '.json', '.css', '.md']);
const SKIP_DIRS = new Set(['.git', '.encoding-backups', 'encoding-backups-archived', 'node_modules', 'dist', 'build', '.next']);
const MOJIBAKE_RE = /[ØÙðŸâÃ�]/;
const ALLOWED_FILES = new Set([
  path.normalize('scripts/fix-mojibake.mjs'),
]);
const ALLOWED_FILE_RE = /^database\.backup\..*\.json$/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(fullPath, out);
      continue;
    }
    if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) out.push(fullPath);
  }
  return out;
}

const failures = [];
for (const file of walk(ROOT)) {
  const relative = path.normalize(path.relative(ROOT, file));
  if (ALLOWED_FILES.has(relative)) continue;
  if (ALLOWED_FILE_RE.test(relative)) continue;
  const text = fs.readFileSync(file, 'utf8');
  if (!MOJIBAKE_RE.test(text)) continue;

  const lines = text.split(/\r?\n/);
  const line = lines.findIndex(value => MOJIBAKE_RE.test(value)) + 1;
  failures.push(`${relative}:${line}`);
}

if (failures.length) {
  console.error('Encoding check failed. Mojibake markers found:');
  failures.forEach(item => console.error(`- ${item}`));
  process.exit(1);
}

console.log('Encoding check passed. No mojibake markers found.');
