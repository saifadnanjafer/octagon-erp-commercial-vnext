import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const engineRoots = [path.join(root, 'vnext', 'server'), path.join(root, 'vnext', 'client')];
const sourceExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx']);
const headerPattern = /^\s*\/\/\s*(clean-room; behavior modeled on .+ \(.+, not copied\)|ported; relocated Octagon-owned code originally from .+)\s*$/m;

function collectFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectFiles(full);
    return sourceExtensions.has(path.extname(entry.name)) ? [full] : [];
  });
}

const candidates = engineRoots.flatMap(collectFiles).sort();
const failures = candidates.flatMap(file => {
  const opening = fs.readFileSync(file, 'utf8').split(/\r?\n/, 8).join('\n');
  return headerPattern.test(opening) ? [] : [path.relative(root, file).replaceAll('\\', '/')];
});

if (failures.length) {
  console.error('Provenance lint failed. Missing required header:');
  failures.forEach(file => console.error(`- ${file}`));
  process.exitCode = 1;
} else {
  console.log(`Provenance lint passed: ${candidates.length} engine file(s) checked.`);
}
