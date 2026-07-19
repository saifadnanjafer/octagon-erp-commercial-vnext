#!/usr/bin/env node
'use strict';

/*
 * Octagon local pre-commit gate.
 *
 * Install/update the local hook with:
 *   node scripts/precommit.js --install-hook
 *
 * Run manually with:
 *   node scripts/precommit.js
 */

const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, 'scripts', 'dup-baseline.txt');
const EXTRACTION_INTEGRITY_SCRIPT = path.join(ROOT, 'scripts', 'extraction-integrity.mjs');

const SECRET_PATTERNS = [
  { name: 'Google-style API key', regex: /AIza[A-Za-z0-9_-]{30,}/g },
  { name: 'OpenAI/OpenRouter-style sk key', regex: /sk-[A-Za-z0-9]{20,}/g },
  { name: 'Bearer token literal', regex: /Bearer [A-Za-z0-9_.-]{20,}/g },
  { name: 'OPENROUTER_API_KEY assignment', regex: /OPENROUTER_API_KEY\s*=\s*['"]/g },
];

function runGit(args, options = {}) {
  return childProcess.execFileSync('git', args, {
    cwd: ROOT,
    encoding: options.encoding || 'utf8',
    stdio: options.stdio || ['ignore', 'pipe', 'pipe'],
    maxBuffer: 50 * 1024 * 1024,
  });
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function installHook() {
  const hookPath = path.join(ROOT, '.git', 'hooks', 'pre-commit');
  const relScript = 'scripts/precommit.js';
  const body = ['#!/bin/sh', `node "${relScript}"`, ''].join('\n');
  fs.mkdirSync(path.dirname(hookPath), { recursive: true });
  fs.writeFileSync(hookPath, body, 'utf8');
  try {
    fs.chmodSync(hookPath, 0o755);
  } catch (error) {
    // Windows can ignore chmod failures for hook execution.
  }
  console.log(`Installed local hook: ${path.relative(ROOT, hookPath)}`);
}

function getStagedFiles() {
  const output = runGit(['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
  return output.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(normalizePath);
}

function getStagedText(filePath) {
  try {
    return runGit(['show', `:${filePath}`]);
  } catch (error) {
    return '';
  }
}

function readIndexOrWorkingText(filePath) {
  const staged = getStagedText(filePath);
  if (staged) return staged;
  const abs = path.join(ROOT, filePath);
  return fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
}

function parseDuplicateBaseline() {
  if (!fs.existsSync(BASELINE_FILE)) return new Map();
  const baseline = new Map();
  const text = fs.readFileSync(BASELINE_FILE, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z0-9_]+)\s+x(\d+)$/);
    if (!match) {
      throw new Error(`Invalid duplicate baseline line: ${line}`);
    }
    baseline.set(match[1], Number(match[2]));
  }
  return baseline;
}

function findTopLevelFunctionDuplicates(appJsText) {
  const counts = new Map();
  for (const line of appJsText.split(/\r?\n/)) {
    const match = line.match(/^(?:async\s+)?function\s+([A-Za-z0-9_]+)/);
    if (match) counts.set(match[1], (counts.get(match[1]) || 0) + 1);
  }
  return new Map([...counts].filter(([, count]) => count > 1).sort(([a], [b]) => a.localeCompare(b)));
}

function checkForbiddenStagedFiles(stagedFiles, failures) {
  for (const file of stagedFiles) {
    const base = path.basename(file);
    if (base === '.env' || base === 'database.db') {
      failures.push(`Forbidden staged file: ${file}`);
    }
  }
}

function checkSecrets(stagedFiles, failures) {
  for (const file of stagedFiles) {
    const text = getStagedText(file);
    if (!text) continue;
    for (const pattern of SECRET_PATTERNS) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(text)) {
        failures.push(`${file}: staged content matches ${pattern.name}`);
      }
    }
  }
}

function checkDuplicateFunctions(failures, warnings) {
  const baseline = parseDuplicateBaseline();
  const duplicates = findTopLevelFunctionDuplicates(readIndexOrWorkingText('app.js'));

  for (const [name, count] of duplicates) {
    const allowed = baseline.get(name) || 0;
    if (!allowed) {
      failures.push(`app.js: new duplicate top-level function ${name} x${count}`);
    } else if (count > allowed) {
      failures.push(`app.js: duplicate count for ${name} increased from x${allowed} to x${count}`);
    }
  }

  for (const [name, count] of baseline) {
    const current = duplicates.get(name) || 0;
    if (current < count) {
      warnings.push(`app.js: duplicate ${name} dropped from baseline x${count} to x${current}; update scripts/dup-baseline.txt when intentional`);
    }
  }
}

function checkJsSyntax(stagedFiles, failures) {
  const jsFiles = stagedFiles.filter(file => file.endsWith('.js'));
  if (!jsFiles.length) return;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-precommit-'));
  try {
    for (const file of jsFiles) {
      const text = getStagedText(file);
      if (!text) continue;
      const tmpFile = path.join(tmpDir, path.basename(file));
      fs.writeFileSync(tmpFile, text, 'utf8');
      const result = childProcess.spawnSync(process.execPath, ['--check', tmpFile], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      if (result.status !== 0) {
        failures.push(`${file}: node --check failed\n${(result.stderr || result.stdout || '').trim()}`);
      }
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function checkInnerHtmlDiff(failures, warnings) {
  let diff = '';
  try {
    diff = runGit(['diff', '--cached', '--unified=0', '--', '*.js']);
  } catch (error) {
    return;
  }

  let currentFile = '';
  for (const rawLine of diff.split(/\r?\n/)) {
    if (rawLine.startsWith('+++ b/')) {
      currentFile = normalizePath(rawLine.slice(6));
      continue;
    }
    if (!rawLine.startsWith('+') || rawLine.startsWith('+++')) continue;
    const line = rawLine.slice(1);
    if (!/\binnerHTML\s*=/.test(line)) continue;
    if (!line.includes('${')) continue;
    if (line.includes('escapeHtml(')) continue;
    const message = `${currentFile}: added innerHTML template interpolation without visible escapeHtml(): ${line.trim()}`;
    if (currentFile.startsWith('modules/')) failures.push(message);
    else warnings.push(message);
  }
}

function checkExtractedModuleIntegrity(failures) {
  if (!fs.existsSync(EXTRACTION_INTEGRITY_SCRIPT)) {
    failures.push('Missing scripts/extraction-integrity.mjs');
    return;
  }
  const result = childProcess.spawnSync(process.execPath, [EXTRACTION_INTEGRITY_SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    failures.push(`Extracted-module integrity failed\n${(result.stderr || result.stdout || '').trim()}`);
  }
}

function main() {
  if (process.argv.includes('--install-hook')) {
    installHook();
    return;
  }

  const stagedFiles = getStagedFiles();
  const failures = [];
  const warnings = [];

  checkForbiddenStagedFiles(stagedFiles, failures);
  checkSecrets(stagedFiles, failures);
  checkDuplicateFunctions(failures, warnings);
  checkJsSyntax(stagedFiles, failures);
  checkInnerHtmlDiff(failures, warnings);
  checkExtractedModuleIntegrity(failures);

  if (warnings.length) {
    console.warn('Octagon precommit warnings:');
    for (const warning of warnings) console.warn(`- ${warning}`);
  }

  if (failures.length) {
    console.error('Octagon precommit failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }

  console.log('Octagon precommit passed.');
}

main();
