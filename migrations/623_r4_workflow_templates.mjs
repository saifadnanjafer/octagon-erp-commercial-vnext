// R4.2 workflow templates & worklist activation: install the standard automation
// library as DATA into the engine's record store (x_records entity='workflow').
// Single source of truth is vnext/server/modules/governance/workflow-templates.js;
// this migration seeds/retracts it. No schema change (x_records exists from R1).
'use strict';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const templates = require('../vnext/server/modules/governance/workflow-templates.js');

export const migration = {
  id: '623_r4_workflow_templates',
  dependsOn: ['622_r4_approval_policy_packs'],
  up(db) {
    templates.installTemplates(db);
  },
  down(db) {
    // Retract the shipped templates (mark removed); operator workflows untouched.
    templates.retractTemplates(db);
  },
};
