// R3 provenance lint for files introduced by this release.
import fs from 'node:fs';
const files = [
  'vnext/server/modules/r3-core.js','vnext/server/modules/r3-routes.js',
  'vnext/server/modules/products/product-engine.js','vnext/server/modules/pricing/pricing-engine.js','vnext/server/modules/sales/sales-engine.js','vnext/server/modules/procurement/procurement-engine.js','vnext/server/modules/inventory/inventory-engine.js','vnext/server/modules/manufacturing/manufacturing-engine.js','vnext/server/modules/subcontracting/subcontracting-engine.js','vnext/server/modules/projects/project-engine.js','vnext/server/modules/helpdesk/helpdesk-engine.js',
  'vnext/client/r3.js','vnext/client/modules/products/index.js','vnext/client/modules/pricing/index.js','vnext/client/modules/sales/index.js','vnext/client/modules/procurement/index.js','vnext/client/modules/inventory/index.js','vnext/client/modules/manufacturing/index.js','vnext/client/modules/subcontracting/index.js','vnext/client/modules/projects/index.js','vnext/client/modules/helpdesk/index.js'
];
const pattern=/^\s*\/\/\s*clean-room; behavior modeled on .+ \(.+, not copied\)\s*$/m; const missing=files.filter(file=>!pattern.test(fs.readFileSync(file,'utf8').split(/\r?\n/,8).join('\n')));
if(missing.length){console.error('R3 PROVENANCE SCAN: FAIL');missing.forEach(file=>console.error(file));process.exitCode=1;}else console.log(`R3 PROVENANCE SCAN: ${files.length}/${files.length} PASS`);
