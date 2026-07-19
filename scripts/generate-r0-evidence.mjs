import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('.');
const analysis = path.resolve(root, '..', 'octagon-analysis');
const source = path.resolve(root, '..', 'octagon-erp');
const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const initial = JSON.parse(fs.readFileSync(path.join(analysis, '_manifests', 'r0-source-fork-sha256.json'), 'utf8').replace(/^\uFEFF/, ''));
const divergenceReasons = {
  '.gitignore': 'R0.2 excludes sanitized fixtures and migration backups from versioned source.',
  'CONTRIBUTING.md': 'R0.2 adds binding provenance and excluded-license policy.',
  'server.js': 'R0.1 isolation controls: production-path guard, VNext health, isolated upload/crash paths.',
};
const comparison = initial.map((entry) => {
  const sourceSha256 = sha256(path.join(source, entry.relativePath));
  const forkSha256 = sha256(path.join(root, entry.relativePath));
  return {
    relativePath: entry.relativePath,
    sourceSha256,
    forkSha256,
    status: sourceSha256 === forkSha256 ? 'identical' : 'intentional-divergence',
    ...(sourceSha256 === forkSha256 ? {} : { reason: divergenceReasons[entry.relativePath] || 'UNEXPECTED' }),
  };
});
const unexpected = comparison.filter((entry) => entry.status !== 'identical' && entry.reason === 'UNEXPECTED');
const currentManifest = {
  generatedAt: new Date().toISOString(),
  copiedSourceFileCount: comparison.length,
  identicalCount: comparison.filter((entry) => entry.status === 'identical').length,
  intentionalDivergenceCount: comparison.filter((entry) => entry.status === 'intentional-divergence').length,
  unexpectedDivergenceCount: unexpected.length,
  entries: comparison,
};
fs.writeFileSync(path.join(analysis, '_manifests', 'r0-current-source-fork-sha256.json'), `${JSON.stringify(currentManifest, null, 2)}\n`);

const preLines = fs.readFileSync(path.join(analysis, '_manifests', 'critical-sha256-pre.txt'), 'utf8').trim().split(/\r?\n/);
const critical = preLines.map((line) => {
  const [, expected, relativePath] = line.match(/^([a-f0-9]{64})\s\s(.+)$/) || [];
  if (!expected) throw new Error(`Invalid critical manifest line: ${line}`);
  const actual = sha256(path.join(source, relativePath));
  return { relativePath, expectedSha256: expected, actualSha256: actual, status: expected === actual ? 'identical' : 'mismatch' };
});
const productionCurrent = {
  generatedAt: new Date().toISOString(),
  criticalFileCount: critical.length,
  identicalCount: critical.filter((entry) => entry.status === 'identical').length,
  mismatchCount: critical.filter((entry) => entry.status === 'mismatch').length,
  entries: critical,
};
fs.writeFileSync(path.join(analysis, '_manifests', 'r0-production-critical-current-comparison.json'), `${JSON.stringify(productionCurrent, null, 2)}\n`);
console.log(JSON.stringify({ sourceFork: { total: currentManifest.copiedSourceFileCount, identical: currentManifest.identicalCount, intentional: currentManifest.intentionalDivergenceCount, unexpected: currentManifest.unexpectedDivergenceCount }, production: { total: productionCurrent.criticalFileCount, identical: productionCurrent.identicalCount, mismatch: productionCurrent.mismatchCount } }, null, 2));
