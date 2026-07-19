// R3 gate scanner: new runtime services must not own schema DDL.
import fs from 'node:fs';
import path from 'node:path';
const roots = ['vnext/server/modules', 'vnext/server/stock/stock-engine.js'];
const files=[];
function walk(target){const stat=fs.statSync(target);if(stat.isFile()){files.push(target);return;}for(const entry of fs.readdirSync(target)){if(entry==='available')continue;walk(path.join(target,entry));}}
for(const root of roots)walk(root);
const ddl=/\b(CREATE|ALTER|DROP)\s+(TABLE|INDEX|TRIGGER|VIEW)\b/i; const hits=[];
for(const file of files){const text=fs.readFileSync(file,'utf8');if(ddl.test(text))hits.push(file);}
if(hits.length){console.error('R3 RUNTIME DDL SCAN: FAIL');hits.forEach(file=>console.error(file));process.exitCode=1;}else console.log(`R3 RUNTIME DDL SCAN: 0 violations across ${files.length} runtime files`);
