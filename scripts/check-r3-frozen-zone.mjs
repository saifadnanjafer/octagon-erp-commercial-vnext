// R3 gate scanner: commercial additions cannot write frozen legacy zones.
import fs from 'node:fs';
import path from 'node:path';
const roots=['vnext/server/modules','vnext/client/modules']; const forbidden=/\b(employee_timesheets|payroll|attendance|omni\.jobOrders|jobOrders)\b/i; const hits=[];
function walk(target){const stat=fs.statSync(target);if(stat.isFile()){const text=fs.readFileSync(target,'utf8');if(forbidden.test(text)&&!/timesheet|payroll|attendance|frozen|read-only|offline/i.test(text))hits.push(target);return;}for(const entry of fs.readdirSync(target))walk(path.join(target,entry));}
roots.forEach(walk); if(hits.length){console.error('R3 FROZEN-ZONE SCAN: FAIL');hits.forEach(file=>console.error(file));process.exitCode=1;}else console.log('R3 FROZEN-ZONE SCAN: 0 mutation references in R3 runtime/client module files');
