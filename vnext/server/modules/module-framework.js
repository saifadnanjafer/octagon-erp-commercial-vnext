// clean-room; behavior modeled on Master Roadmap Rev 3 (proprietary self, not copied)
'use strict';

const fs = require('fs');
const path = require('path');

const MANIFEST_FILE = 'manifest.json';
const MODULE_ID_RE = /^[a-z][a-z0-9_]{1,63}$/;

/**
 * Inherit-not-fork XML/HTML layout slots manager.
 * Allows extending layout structures by targeting slots using selector-like paths.
 */
class ModuleLayoutCompiler {
  constructor(baseTemplate) {
    this.template = String(baseTemplate || '');
  }

  /**
   * Replace or insert layout content based on xpath/css-like slots.
   * Path format: "container/slot-name" or simply "slot-name".
   */
  extend(slotPath, content, position = 'replace') {
    const slotTag = `<slot name="${slotPath}">`;
    const endTag = `</slot>`;
    
    const startIdx = this.template.indexOf(slotTag);
    if (startIdx === -1) return this;

    const endIdx = this.template.indexOf(endTag, startIdx + slotTag.length);
    if (endIdx === -1) return this;

    const before = this.template.slice(0, startIdx);
    const after = this.template.slice(endIdx + endTag.length);
    const original = this.template.slice(startIdx + slotTag.length, endIdx);

    let finalContent = '';
    if (position === 'replace') {
      finalContent = content;
    } else if (position === 'before') {
      finalContent = content + original;
    } else if (position === 'after') {
      finalContent = original + content;
    }

    this.template = before + slotTag + finalContent + endTag + after;
    return this;
  }

  compile() {
    return this.template.replace(/<slot name="[^"]+">|<\/slot>/g, '');
  }
}

class ModuleRegistry {
  constructor() {
    this.modules = new Map();
  }

  register(name, manifest) {
    if (!name || typeof name !== 'string') throw new Error('Module name is required');
    const deps = Array.isArray(manifest.dependencies) ? manifest.dependencies : [];
    this.modules.set(name, {
      name,
      version: String(manifest.version || '1.0.0'),
      dependencies: deps,
      manifest: manifest
    });
  }

  resolveLoadOrder() {
    const visited = new Set();
    const temp = new Set();
    const order = [];

    const visit = (name) => {
      if (temp.has(name)) {
        throw new Error(`Circular dependency detected involving module: ${name}`);
      }
      if (!visited.has(name)) {
        temp.add(name);
        const mod = this.modules.get(name);
        if (mod) {
          for (const dep of mod.dependencies) {
            // If the dependency is not registered, we fail the loading order!
            if (!this.modules.has(dep)) {
              throw new Error(`Missing dependency: ${dep} required by module ${name}`);
            }
            visit(dep);
          }
        }
        temp.delete(name);
        visited.add(name);
        order.push(name);
      }
    };

    for (const name of this.modules.keys()) {
      visit(name);
    }
    return order;
  }

  saveToDb(db, name, active) {
    const mod = this.modules.get(name);
    if (!mod) throw new Error(`Module ${name} not registered`);
    db.prepare(`
      INSERT INTO x_installed_modules (module, active, manifest)
      VALUES (?, ?, ?)
      ON CONFLICT(module) DO UPDATE SET active = excluded.active, manifest = excluded.manifest
    `).run(name, active ? 1 : 0, JSON.stringify(mod.manifest));
  }

  get(name) {
    return this.modules.get(name) || null;
  }

  has(name) {
    return this.modules.has(name);
  }

  list() {
    return [...this.modules.values()];
  }
}

/**
 * Scan a directory of module folders for `manifest.json` and register each
 * one into a ModuleRegistry. This is the disk-discovery half of T1.12.1 —
 * previously the ModuleRegistry class only supported in-memory
 * `.register(name, manifest)` calls with no loader, so nothing could ever
 * reach it. A module folder is `<modulesDir>/<module_id>/manifest.json`.
 *
 * Contract (roadmap R1.12 "no-DB-writes-in-load"): this function only
 * reads files and calls `registry.register()` (an in-memory Map write) —
 * it never touches the database. DB writes happen at install() time only.
 *
 * @param {string} modulesDir absolute path to the directory containing module folders
 * @param {ModuleRegistry} [registry] registry to populate; a new one is created if omitted
 * @returns {{ registry: ModuleRegistry, discovered: Array<{id:string, dir:string, manifest:object}>, errors: Array<{dir:string, error:string}> }}
 */
function discoverModules(modulesDir, registry) {
  const reg = registry || new ModuleRegistry();
  const discovered = [];
  const errors = [];
  if (!modulesDir || !fs.existsSync(modulesDir)) {
    return { registry: reg, discovered, errors };
  }
  const entries = fs.readdirSync(modulesDir, { withFileTypes: true }).filter((e) => e.isDirectory());
  for (const entry of entries) {
    const dir = path.join(modulesDir, entry.name);
    const manifestPath = path.join(dir, MANIFEST_FILE);
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      const id = String(manifest.id || entry.name || '').trim();
      if (!MODULE_ID_RE.test(id)) {
        errors.push({ dir, error: `invalid module id "${id}" (expected lowercase snake_case)` });
        continue;
      }
      if (id !== entry.name) {
        errors.push({ dir, error: `manifest id "${id}" must match folder name "${entry.name}"` });
        continue;
      }
      reg.register(id, manifest);
      discovered.push({ id, dir, manifest });
    } catch (error) {
      errors.push({ dir, error: error.message || String(error) });
    }
  }
  return { registry: reg, discovered, errors };
}

module.exports = { ModuleLayoutCompiler, ModuleRegistry, discoverModules, MODULE_ID_RE };
