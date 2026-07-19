// P0.10 isolated acceptance harness — port 8126, in-memory SQLite only.
'use strict';
const http = require('http');
const { DatabaseSync } = require('node:sqlite');
const { mountWorkflow } = require('../server/workflow');
const PORT = 8126;
const db = new DatabaseSync(':memory:');
const listeners = [];
const crudEngine = { subscribe(fn) { listeners.push(fn); }, createRecord() {}, updateRecord() {} };
const engine = mountWorkflow({ db, crudEngine, schedulePollMs: 600000 });
const server = http.createServer((req, res) => { const url = new URL(req.url, `http://127.0.0.1:${PORT}`); if (!engine.handle(req, res, url)) { res.writeHead(404); res.end(); } });
let failures = 0;
function check(label, result) { console.log(`${result ? 'PASS' : 'FAIL'} ${label}`); if (!result) failures += 1; }
async function call(path, options = {}) { const response = await fetch(`http://127.0.0.1:${PORT}${path}`, { headers: { 'Content-Type': 'application/json' }, ...options }); return response.json(); }
server.listen(PORT, '127.0.0.1', async () => {
  try {
    const created = await call('/api/x/workflows/create', { method: 'POST', body: JSON.stringify({ name: 'عميل محتمل جديد → إشعار المبيعات', trigger: { type: 'record', entity: 'crm_lead', event: 'created' }, nodes: [{ type: 'notify', config: { role: 'sales', title: 'عميل محتمل جديد', body: '{{record.name}}' } }] }) });
    check('workflow create envelope', created.success && created.data.id);
    const lead = { id: 'lead_demo_1', name: 'شركة الاختبار' };
    listeners.forEach(fn => fn('crm_lead', 'create', lead));
    await new Promise(resolve => setTimeout(resolve, 35));
    const notifications = db.prepare('SELECT * FROM x_notifications WHERE user = ?').all('role:sales');
    const runs = await call(`/api/x/workflows/runs/${created.data.id}`);
    check('lead created trigger notifies sales role', notifications.length === 1 && notifications[0].body === 'شركة الاختبار');
    check('run log persisted', runs.success && runs.data.length === 1 && runs.data[0].status === 'completed' && runs.data[0].logs.length === 1);
    const manual = await call(`/api/x/workflows/run/${created.data.id}`, { method: 'POST', body: '{}' });
    check('manual run works', manual.success && manual.data.status === 'completed');
    const frozen = await call('/api/x/workflows/create', { method: 'POST', body: JSON.stringify({ name: 'حظر الرواتب', trigger: { type: 'manual' }, nodes: [{ type: 'update-record', config: { entity: 'payroll_records', record_id: 'p1', values: { status: 'x' } } }] }) });
    const frozenRun = await call(`/api/x/workflows/run/${frozen.data.id}`, { method: 'POST', body: '{}' });
    check('frozen data write rejected', frozenRun.success && frozenRun.data.status === 'failed' && /محمي/.test(frozenRun.data.error));
    check('all API responses use envelope', Object.prototype.hasOwnProperty.call(created, 'success') && Object.prototype.hasOwnProperty.call(created, 'error'));
  } catch (error) { console.error(error); failures += 1; }
  engine.stop(); server.close(() => process.exitCode = failures ? 1 : 0);
});
