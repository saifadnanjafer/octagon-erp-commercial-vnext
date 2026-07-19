import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const BACKUP_ROOT = path.join(ROOT, '.encoding-backups', new Date().toISOString().replace(/[:.]/g, '-'));
const EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.md']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', '.git', '.encoding-backups', 'encoding-backups-archived']);
const BAD_CHARS = '\\u00f0\\u00d8\\u00d9\\u00e2\\u00c3\\u00c2\\u00ef\\u00bf\\u00bd\\ufffd';
const COMPACT_RUN_RE = /[\u00d8\u00d9\u00f0\u00e2\u00c3\u00c2\u00a0-\u00ff\u0100-\u024f\u2018-\u2026\u2030-\u203a\u02c6\u02dc][\u00d8\u00d9\u00f0\u00e2\u00c3\u00c2\u00a0-\u00ff\u0100-\u024f\u2018-\u2026\u2030-\u203a\u02c6\u02dc\s.,:;!?\-–—()/"'،؛؟]*[\u00d8\u00d9\u00f0\u00e2\u00c3\u00c2\u00a0-\u00ff\u0100-\u024f\u2018-\u2026\u2030-\u203a\u02c6\u02dc]/g;
const MOJIBAKE_RE = new RegExp(`[${BAD_CHARS}]`);
const RUN_RE = new RegExp(`[A-Za-z0-9_\\-./:#()[\\]{}'"\\\`،؛؟!+*=<>|&%$@~^\\s\\u0080-\\u00FF\\u0100-\\u017F\\u0180-\\u024F\\u20AC\\u2018-\\u201E\\u2020-\\u2026\\u2030\\u2039-\\u203A\\u02C6\\u02DC]*[${BAD_CHARS}][A-Za-z0-9_\\-./:#()[\\]{}'"\\\`،؛؟!+*=<>|&%$@~^\\s\\u0080-\\u00FF\\u0100-\\u017F\\u0180-\\u024F\\u20AC\\u2018-\\u201E\\u2020-\\u2026\\u2030\\u2039-\\u203A\\u02C6\\u02DC]*`, 'g');

const CP1252 = new Map([
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
  ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e],
  ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
  ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
  ['€', 0x80], ['‚', 0x82], ['ƒ', 0x83], ['„', 0x84], ['…', 0x85], ['†', 0x86], ['‡', 0x87],
  ['ˆ', 0x88], ['‰', 0x89], ['Š', 0x8a], ['‹', 0x8b], ['Œ', 0x8c], ['Ž', 0x8e],
  ['‘', 0x91], ['’', 0x92], ['“', 0x93], ['”', 0x94], ['•', 0x95], ['–', 0x96], ['—', 0x97],
  ['˜', 0x98], ['™', 0x99], ['š', 0x9a], ['›', 0x9b], ['œ', 0x9c], ['ž', 0x9e], ['Ÿ', 0x9f],
]);
const CP1252_CODEPOINTS = new Map([
  [0x20ac, 0x80], [0x201a, 0x82], [0x0192, 0x83], [0x201e, 0x84], [0x2026, 0x85],
  [0x2020, 0x86], [0x2021, 0x87], [0x02c6, 0x88], [0x2030, 0x89], [0x0160, 0x8a],
  [0x2039, 0x8b], [0x0152, 0x8c], [0x017d, 0x8e], [0x2018, 0x91], [0x2019, 0x92],
  [0x201c, 0x93], [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
  [0x02dc, 0x98], [0x2122, 0x99], [0x0161, 0x9a], [0x203a, 0x9b], [0x0153, 0x9c],
  [0x017e, 0x9e], [0x0178, 0x9f],
]);

function encodeWin1252(text) {
  const bytes = [];
  for (const ch of text) {
    const code = ch.codePointAt(0);
    if (CP1252.has(ch)) bytes.push(CP1252.get(ch));
    else if (CP1252_CODEPOINTS.has(code)) bytes.push(CP1252_CODEPOINTS.get(code));
    else if (code <= 0xff) bytes.push(code);
    else return null;
  }
  return Buffer.from(bytes);
}

function decodeCandidate(text) {
  const bytes = encodeWin1252(text);
  if (!bytes) return text;
  const decoded = bytes.toString('utf8');
  return decoded.includes('\uFFFD') ? text : decoded;
}

function isBetter(before, after) {
  if (before === after) return false;
  const score = repairScore;
  return score(after) > score(before);
}

function repairScore(value) {
  const bad = (value.match(new RegExp(`[${BAD_CHARS}\\u00bf\\u00bd\\u0080-\\u009f]`, 'g')) || []).length;
  const arabic = (value.match(/[\u0600-\u06FF]/g) || []).length;
  const emoji = (value.match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
  const goodSymbols = (value.match(/[×✓✔✕←→═─│┌┐└┘⚙]/g) || []).length;
  const replacements = (value.match(/\uFFFD/g) || []).length;
  return arabic * 5 + emoji * 3 + goodSymbols * 2 - bad * 6 - replacements * 12;
}

function isRepairSpanChar(ch) {
  const code = ch.codePointAt(0);
  if (code <= 0x024f) return true;
  if (CP1252_CODEPOINTS.has(code)) return true;
  if (/[\t ]/.test(ch)) return true;
  return /[`~!@#$%^&*()_\-+=[\]{}|\\;:'",.<>/?،؛؟]/u.test(ch);
}

function decodeRepeated(text) {
  let current = text;
  for (let i = 0; i < 6; i++) {
    const repaired = decodeCandidate(current);
    if (!isBetter(current, repaired)) break;
    current = repaired;
  }
  return current;
}

function repairLine(line) {
  let out = '';
  let span = '';
  const flush = () => {
    if (!span) return;
    out += MOJIBAKE_RE.test(span) ? decodeRepeated(span) : span;
    span = '';
  };
  for (const ch of line) {
    if (isRepairSpanChar(ch)) {
      span += ch;
    } else {
      flush();
      out += ch;
    }
  }
  flush();
  return out;
}

function repairText(content) {
  const broad = content.replace(RUN_RE, match => {
    if (!MOJIBAKE_RE.test(match)) return match;
    const repaired = decodeRepeated(match);
    return isBetter(match, repaired) ? repaired : match;
  });
  const compact = broad.replace(COMPACT_RUN_RE, match => {
    if (!MOJIBAKE_RE.test(match)) return match;
    const repaired = decodeRepeated(match);
    return isBetter(match, repaired) ? repaired : match;
  });
  return compact.split(/(\r\n|\n|\r)/).map(part => {
    if (part === '\r\n' || part === '\n' || part === '\r') return part;
    return repairLine(part);
  }).join('');
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(path.join(dir, entry.name), out);
    } else if (EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

function backupFile(file) {
  const relative = path.relative(ROOT, file);
  const target = path.join(BACKUP_ROOT, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(file, target);
}

let changed = 0;
for (const file of walk(ROOT)) {
  const original = fs.readFileSync(file, 'utf8');
  if (!MOJIBAKE_RE.test(original)) continue;
  const repaired = repairText(original);
  if (repaired !== original) {
    backupFile(file);
    fs.writeFileSync(file, repaired, 'utf8');
    changed++;
    console.log(`fixed ${path.relative(ROOT, file)}`);
  }
}

console.log(`Done. Files changed: ${changed}`);
if (changed) console.log(`Backups: ${BACKUP_ROOT}`);
