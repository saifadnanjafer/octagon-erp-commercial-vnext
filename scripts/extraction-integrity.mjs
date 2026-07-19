#!/usr/bin/env node
/**
 * Phase 4 extracted-module integrity guard.
 *
 * Detects the two structural regressions that a de-monolith extraction must
 * never introduce: an extracted module not loaded by index.html, or a moved
 * top-level global still duplicated in app.js.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPath = path.join(root, 'app.js');
const indexPath = path.join(root, 'index.html');
const extractedModules = [
  'modules/whatsapp-integration.js',
  'modules/command-center.js',
  'modules/analytics-dashboard.js',
  'modules/equipment-management.js',
  'modules/machine-management.js',
  'modules/finance-ui.js',
  'modules/kanban.js',
  'modules/admin-panel.js',
  'modules/task-manager.js',
  'modules/automation-engine.js',
  'modules/sop-issues-ai-index.js',
  'modules/op-packs.js',
  'modules/workflow-studio.js',
  'modules/sales-crm.js'
];

const appSource = fs.readFileSync(appPath, 'utf8');
const indexSource = fs.readFileSync(indexPath, 'utf8');
let failures = 0;

function globalFunctionNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(/gm)) names.add(match[1]);
  for (const match of source.matchAll(/^window\.([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b/gm)) names.add(match[1]);
  return names;
}

for (const relativePath of extractedModules) {
  const fullPath = path.join(root, relativePath);
  if (!fs.existsSync(fullPath)) {
    console.error(`FAIL missing extracted module: ${relativePath}`);
    failures++;
    continue;
  }
  if (!indexSource.includes(`src="${relativePath}`)) {
    console.error(`FAIL module not wired in index.html: ${relativePath}`);
    failures++;
  }
  try {
    execFileSync(process.execPath, ['--check', fullPath], { stdio: 'pipe' });
  } catch {
    console.error(`FAIL syntax check: ${relativePath}`);
    failures++;
  }
  for (const name of globalFunctionNames(fs.readFileSync(fullPath, 'utf8'))) {
    if (new RegExp(`^(?:async\\s+)?function\\s+${name.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s*\\(`, 'm').test(appSource)) {
      console.error(`FAIL duplicate global remains in app.js: ${name} (${relativePath})`);
      failures++;
    }
  }
}

if (failures) process.exitCode = 1;
else console.log(`Extraction integrity: PASS (${extractedModules.length} modules checked)`);
