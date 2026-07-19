// R3 disposable HTTP/bootstrap/authz/browser-entry smoke; no production paths.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-r3-http-'));
const port = 18997;
const env = { ...process.env, NODE_ENV: 'test', OCTAGON_ENABLE_TEST_BYPASS: 'true', USE_SQLITE: 'true', PORT: String(port), OCTAGON_SQLITE_DB_FILE: path.join(temp, 'vnext.db'), OCTAGON_DB_FILE: path.join(temp, 'mirror.json'), OCTAGON_CRASH_LOG: path.join(temp, 'crash.log'), OCTAGON_BACKUP_DIR: temp, OCTAGON_UPLOAD_DIR: path.join(temp, 'uploads') };
const child = spawn(process.execPath, ['server.js'], { cwd: path.resolve('.'), env, stdio: ['ignore', 'pipe', 'pipe'] });
let logs = ''; child.stdout.on('data', (chunk) => { logs += chunk.toString(); }); child.stderr.on('data', (chunk) => { logs += chunk.toString(); });
async function waitForHealth() { for (let i=0;i<80;i++){ try { const r=await fetch(`http://127.0.0.1:${port}/api/health`); if(r.ok)return; } catch(_){} await new Promise(resolve=>setTimeout(resolve,100)); } throw new Error(`server did not boot\n${logs}`); }
async function request(url, options={}) { const response=await fetch(`http://127.0.0.1:${port}${url}`,options); let data=null; const text=await response.text(); try{data=JSON.parse(text)}catch(_){data=text} return {response,data}; }
function hashClientPassword(password, salt) { return crypto.createHash('sha256').update(String(password) + String(salt)).digest('hex'); }
function cookieFrom(response) { const value = response.headers.get('set-cookie') || ''; const match = /octagon_session=([^;]+)/.exec(value); return match ? match[1] : ''; }
const companyHeaders = { 'Content-Type':'application/json', 'X-Company-Id':'company-r0-demo' };
const results=[];
function check(name, condition){assert.equal(Boolean(condition),true,name); results.push(`PASS ${name}`);}
try {
  await waitForHealth();
  const health=await request('/api/health'); check('disposable server health',health.data.success===true && health.data.databasePath.includes('octagon-r3-http-'));
  const denied=await request('/api/x/r3/products'); check('unauthenticated R3 rejection',denied.response.status===401);
  const seedState = (await request('/api/db')).data;
  const authUserId = `r3_http_admin_${Date.now()}`;
  const authPassword = 'R3-Disposable-Auth-Only-2026!';
  const authSalt = crypto.randomBytes(16).toString('hex');
  seedState.users = Array.isArray(seedState.users) ? seedState.users : [];
  seedState.users.push({ id: authUserId, name: 'R3 Disposable Admin', displayName: 'R3 Disposable Admin', is_active: true, passwordHash: hashClientPassword(authPassword, authSalt), passwordSalt: authSalt, groups: ['system.admin'], role: 'admin' });
  const seeded = await request('/api/db', { method:'POST', headers:{ ...companyHeaders, 'X-Octagon-Full-Sync':'yes', 'X-Test-Bypass':'true' }, body:JSON.stringify(seedState) });
  check('test-only fixture seeding is explicit and disposable', seeded.response.status===200 && seeded.data.success===true);
  const login = await request('/api/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ userId:authUserId, password:authPassword }) });
  const sessionCookie = cookieFrom(login.response);
  check('real password login succeeds', login.response.status===200 && login.data.success===true);
  check('real session cookie issued', !!sessionCookie);
  const session = await request('/api/auth/session', { headers:{ Cookie:`octagon_session=${sessionCookie}` } });
  check('real session is authenticated', session.response.status===200 && session.data.authenticated===true);
  const headers = { ...companyHeaders, Cookie:`octagon_session=${sessionCookie}` };
  const page=await request('/vnext/client/r3.html'); check('desktop/mobile RTL R3 entry point',page.response.status===200 && String(page.data).includes('dir="rtl"') && String(page.data).includes('viewport'));
  const partner=await request('/api/x/arap/partners',{method:'POST',headers,body:JSON.stringify({company_id:'company-r0-demo',id:'r3-http-customer',name:'HTTP Customer',partner_type:'customer',currency:'IQD'})}); check('R2 partner bridge',partner.response.status===200);
  const product=await request('/api/x/r3/products',{method:'POST',headers,body:JSON.stringify({code:'R3-HTTP',name:'HTTP Product',barcode:'R3HTTP1',product_type:'goods'})}); check('R3 product create',product.response.status===201 && product.data.data.product_type==='goods');
  const productId=product.data.data.id;
  const list=await request('/api/x/r3/products',{headers}); check('R3 product list company scope',list.response.status===200 && list.data.data.some(row=>row.id===productId));
  const recordHistory=await request(`/api/x/r3/products/${productId}/history`,{headers}); check('R3 record-scoped history permits owned record',recordHistory.response.status===200);
  const recordChatter=await request(`/api/x/r3/products/${productId}/chatter`,{method:'POST',headers,body:JSON.stringify({kind:'message',body:'R3 record ACL probe'})}); check('R3 record-scoped chatter permits owned record',recordChatter.response.status===201);
  const recordApproval=await request(`/api/x/r3/products/${productId}/approval`,{method:'POST',headers,body:JSON.stringify({action:'review',payload:{amount:1}})}); check('R3 record-scoped approval permits owned record',recordApproval.response.status===201);
  const missingHistory=await request('/api/x/r3/products/r3-not-owned/history',{headers}); check('R3 record-scoped history rejects missing record',missingHistory.response.status===404 && missingHistory.data.meta?.code==='R3_RECORD_NOT_FOUND');
  const priceList=await request('/api/x/r3/price-lists',{method:'POST',headers,body:JSON.stringify({name:'HTTP Retail',currency:'IQD'})});
  const priceItem=await request('/api/x/r3/price-items',{method:'POST',headers,body:JSON.stringify({price_list_id:priceList.data.data.id,product_id:productId,fixed_price:77,min_qty:1,currency:'IQD'})}); check('R3 pricing rule create',priceItem.response.status===201);
  const explain=await request('/api/x/r3/products/price-explain',{method:'POST',headers,body:JSON.stringify({product_id:productId,base_price:100,qty:1,currency:'IQD'})}); check('R3 explain trace',explain.response.status===200 && explain.data.data.unit_price===77 && explain.data.data.trace.length===1);
  const quote=await request('/api/x/r3/quotes',{method:'POST',headers,body:JSON.stringify({partner_id:'r3-http-customer',idempotency_key:'r3-http-q',lines:[{product_id:productId,qty:2,base_price:100}]})}); check('R3 quotation',quote.response.status===201);
  const order=await request('/api/x/r3/orders',{method:'POST',headers,body:JSON.stringify({quote_id:quote.data.data.id,idempotency_key:'r3-http-so'})}); check('R3 sales order',order.response.status===201 && order.data.data.state==='confirmed');
  const invoice=await request(`/api/x/r3/orders/${order.data.data.id}/invoice`,{method:'POST',headers,body:'{}'}); check('R3 AR/AP invoice bridge',invoice.response.status===200 && invoice.data.data.state==='posted');
  const req=await request('/api/x/r3/requisitions',{method:'POST',headers,body:JSON.stringify({requester_id:'http-user',notes:'R3'})}); check('R3 procurement requisition',req.response.status===201);
  const po=await request('/api/x/r3/purchase-orders',{method:'POST',headers,body:JSON.stringify({supplier_id:'r3-http-customer',order_number:'PO-HTTP'})}); check('R3 purchase order',po.response.status===201);
  const match=await request(`/api/x/r3/purchase-orders/${po.data.data.id}/match`,{method:'POST',headers,body:JSON.stringify({ordered_qty:999999,received_qty:999999,billed_qty:999999,ordered_price:0,billed_price:0})}); check('R3 three-way match rejects body-forced fabricated quantities',match.response.status===409 && match.data.error && match.data.meta.code==='THREE_WAY_MATCH_REQUIRED');
  const snapshot=await request('/api/x/r3/snapshot',{headers}); check('R3 snapshot and frozen-zone declaration',snapshot.response.status===200 && snapshot.data.data.frozen_zones.includes('payroll'));
  const invalidCompany=await request('/api/x/r3/products',{headers:{...headers,'X-Company-Id':'not-a-company'}}); check('cross-company/invalid-company denial',invalidCompany.response.status===400 || invalidCompany.response.status===403);
  const noCookie=await request('/api/x/r3/products',{headers:{'Content-Type':'application/json','X-Company-Id':'company-r0-demo'}}); check('protected review request without a cookie is rejected',noCookie.response.status===401);
  console.log(results.join('\n')); console.log(`R3 HTTP SUITE: ${results.length} PASS, 0 FAIL, 0 SKIP`);
} finally { child.kill(); }
