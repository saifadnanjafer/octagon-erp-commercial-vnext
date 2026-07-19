// clean-room; behavior modeled on OCTAGON_VNEXT_MASTER_ROADMAP.md R1.12 sample module proof case (proprietary self, not copied)
'use strict';

const crypto = require('crypto');

/**
 * Sample module proving T1.12.1's full lifecycle: this module's own
 * declared migration creates `x_loyalty_tier_demo_log` before this hook
 * runs, so onInstall can write into it. On uninstall the migration's
 * `down` SQL drops the table again — so this hook's own writes leave zero
 * residue once uninstall completes, exactly like the field/menu/workflow
 * contributions declared in manifest.json.
 */
function onInstall(db, ctx) {
  db.prepare('INSERT INTO x_loyalty_tier_demo_log (id, note, at) VALUES (?, ?, ?)').run(
    `log_${crypto.randomUUID()}`,
    `module ${ctx.moduleId} installed by ${ctx.actorUserId || 'unknown'}`,
    new Date().toISOString()
  );
}

function onUninstall(db, ctx) {
  db.prepare('INSERT INTO x_loyalty_tier_demo_log (id, note, at) VALUES (?, ?, ?)').run(
    `log_${crypto.randomUUID()}`,
    `module ${ctx.moduleId} uninstall started`,
    new Date().toISOString()
  );
}

module.exports = { onInstall, onUninstall };
