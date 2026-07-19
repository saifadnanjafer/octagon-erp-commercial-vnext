// P0.7 throwaway HTTP self-test. Uses :memory: only, port 8127, never database.db.
'use strict';
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const { createViewsFieldsHandler } = require('./views-fields');
const { mountCrud } = require('./crud-engine');
const PORT = 8127, BASE = `http://127.0.0.1:${PORT}`;
let failed = 0;
function check(name, ok) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }
async function call(method, path, body, headers) { const res = await fetch(BASE + path, { method, headers:Object.assign({ 'content-type':'application/json', 'x-octagon-user':'builder', 'x-octagon-role':'admin' }, headers || {}), body:body == null ? undefined : JSON.stringify(body) }); return { status:res.status, json:await res.json() }; }
(async function () {
  const db = new DatabaseSync(':memory:'); const handler = createViewsFieldsHandler({ db }); const crud = mountCrud({ db });
  const server = http.createServer((req, res) => { const url = new URL(req.url, BASE); if (handler.handle(req, res, url)) return; if (crud.handle(req, res, url)) return; res.writeHead(404); res.end(); });
  await new Promise(resolve => server.listen(PORT, '127.0.0.1', resolve));
  let r = await call('POST', '/api/x/_views/crm_lead', { name:'المهتمون', config:{ q:'بغداد', filters:{status:'new'}, sort:{key:'name',dir:'asc'} } });
  check('create saved view envelope', r.status === 201 && r.json.success && r.json.data.config.filters.status === 'new'); const viewId = r.json.data.id;
  r = await call('GET', '/api/x/_views/crm_lead'); check('list own saved views', r.status === 200 && r.json.data.length === 1 && r.json.data[0].id === viewId);
  r = await call('PATCH', '/api/x/_views/crm_lead/' + viewId, { name:'عملاء جدد' }); check('update own saved view', r.status === 200 && r.json.data.name === 'عملاء جدد');
  r = await call('GET', '/api/x/_views/crm_lead', null, { 'x-octagon-user':'other' }); check('saved views isolated by user', r.status === 200 && r.json.data.length === 0);
  r = await call('POST', '/api/x/_custom-fields/crm_lead', { key:'source_city', label_ar:'مدينة المصدر', type:'select', options:[{value:'baghdad',label_ar:'بغداد'}], position:4 }); check('admin creates custom field', r.status === 201 && r.json.data.options[0].value === 'baghdad');
  r = await call('GET', '/api/x/_custom-fields/crm_lead'); check('list custom fields ordered', r.status === 200 && r.json.data.length === 1 && r.json.data[0].key === 'source_city');
  r = await call('POST', '/api/x/crm_lead/create', { name:'عميل تجريبي', custom:{ source_city:'baghdad' } });
  const stored = db.prepare('SELECT data FROM x_records WHERE entity = ? AND id = ?').get('crm_lead', r.json.data && r.json.data.id);
  check('custom value persists in x_records.data.custom', r.status === 200 && r.json.data.custom.source_city === 'baghdad' && JSON.parse(stored.data).custom.source_city === 'baghdad');
  r = await call('POST', '/api/x/_custom-fields/crm_lead', { key:'blocked', label_ar:'مرفوض', type:'text' }, { 'x-octagon-role':'sales' }); check('non-admin custom field write denied', r.status === 403 && !r.json.success);
  r = await call('DELETE', '/api/x/_views/crm_lead/' + viewId); check('delete own saved view', r.status === 200 && r.json.data.removed === true);
  const audits = db.prepare('SELECT COUNT(*) AS n FROM x_audit').get().n; check('writes are audited', audits >= 4);
  await new Promise(resolve => server.close(resolve)); process.exitCode = failed ? 1 : 0; console.log(`RESULT ${failed ? 'FAIL' : 'PASS'} (${failed} failures)`);
})().catch(error => { console.error(error); process.exitCode = 1; });
