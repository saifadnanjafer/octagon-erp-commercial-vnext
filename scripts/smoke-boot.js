#!/usr/bin/env node
'use strict';

/*
 * Octagon Gate F smoke runner.
 *
 * No npm browser dependency is used. The script launches the installed Chrome
 * executable in headless mode and controls it through the Chrome DevTools
 * Protocol exposed by the browser itself.
 */

const childProcess = require('child_process');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_PORT = 8090;
const DEFAULT_TIMEOUT_MS = 20_000;
const CDP_TIMEOUT_MS = 90_000;

function log(message) {
  console.log(`[smoke-boot] ${message}`);
}

function fail(message, details) {
  const error = new Error(message);
  if (details) error.details = details;
  throw error;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function quotePowerShell(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function waitFor(fn, label, timeoutMs = DEFAULT_TIMEOUT_MS, intervalMs = 250) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const value = await fn();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }
  const suffix = lastError ? ` Last error: ${lastError.message}` : '';
  fail(`Timed out waiting for ${label}.${suffix}`);
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch (error) {
    fail(`Expected JSON from ${url}, got ${text.slice(0, 200)}`);
  }
  return { res, json, text };
}

async function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}

function findChrome() {
  const candidates = [];
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env['ProgramFiles(x86)'];
    if (programFiles) {
      candidates.push(path.join(programFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      candidates.push(path.join(programFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
    if (programFilesX86) {
      candidates.push(path.join(programFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      candidates.push(path.join(programFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    candidates.push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else {
    candidates.push('/usr/bin/google-chrome');
    candidates.push('/usr/bin/google-chrome-stable');
    candidates.push('/usr/bin/chromium');
    candidates.push('/usr/bin/chromium-browser');
    candidates.push('/usr/bin/microsoft-edge');
  }
  const found = candidates.find(candidate => candidate && fs.existsSync(candidate));
  if (!found) fail('No Chrome/Edge executable found for headless smoke');
  return found;
}

function copySqliteDatabase(src, dst) {
  const py = [
    'import sqlite3, sys',
    'src = sqlite3.connect("file:" + sys.argv[1] + "?mode=ro", uri=True)',
    'dst = sqlite3.connect(sys.argv[2])',
    'src.backup(dst)',
    'dst.close()',
    'src.close()',
  ].join('; ');
  childProcess.execFileSync('python', ['-c', py, src, dst], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

async function makeScratch() {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'octagon-smoke-'));
  const dbJson = path.join(scratch, 'database.json');
  const dbSqlite = path.join(scratch, 'database.db');
  
  if (fs.existsSync(path.join(ROOT, 'database.json'))) {
    fs.copyFileSync(path.join(ROOT, 'database.json'), dbJson);
  } else {
    fs.writeFileSync(dbJson, '{}');
  }
  
  if (fs.existsSync(path.join(ROOT, 'database.db'))) {
    copySqliteDatabase(path.join(ROOT, 'database.db'), dbSqlite);
  } else {
    const DatabaseSync = require('node:sqlite').DatabaseSync;
    const db = new DatabaseSync(dbSqlite);
    db.close();
  }
  return { scratch, dbJson, dbSqlite };
}

function startServer({ port, dbJson, dbSqlite, scratch }) {
  const outLog = path.join(scratch, 'server.out.log');
  const errLog = path.join(scratch, 'server.err.log');
  const outFd = fs.openSync(outLog, 'w');
  const errFd = fs.openSync(errLog, 'w');
  const env = {
    ...process.env,
    PORT: String(port),
    OCTAGON_DEFAULT_PORT: String(port),
    OCTAGON_FALLBACK_PORTS: '',
    OCTAGON_DB_FILE: dbJson,
    OCTAGON_SQLITE_DB_FILE: dbSqlite,
    OCTAGON_BACKUP_DIR: scratch,
    OCTAGON_REVIEW_REPORT_DIR: path.join(scratch, 'review-reports'),
  };
  const child = childProcess.spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', outFd, errFd],
    windowsHide: true,
  });
  fs.closeSync(outFd);
  fs.closeSync(errFd);
  return { child, outLog, errLog };
}

function startChrome({ chromePath, debugPort, userDataDir }) {
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--no-first-run',
    '--no-default-browser-check',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];
  return childProcess.spawn(chromePath, args, {
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
  });
}

function httpJson(url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, json: body ? JSON.parse(body) : null, body });
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${body.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.events = [];
  }

  async connect() {
    if (typeof WebSocket !== 'function') {
      fail('Node global WebSocket is unavailable; use Node 22+ or install a browser smoke dependency');
    }
    this.ws = new WebSocket(this.wsUrl);
    this.ws.addEventListener('message', event => this.onMessage(event.data));
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  onMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject, timer } = this.pending.get(message.id);
      clearTimeout(timer);
      this.pending.delete(message.id);
      if (message.error) reject(new Error(`${message.error.message || 'CDP error'} ${message.error.data || ''}`.trim()));
      else resolve(message.result || {});
      return;
    }
    if (message.method) this.events.push(message);
  }

  command(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, CDP_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
    });
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function stopChild(child, gracefulSignal = 'SIGTERM', timeoutMs = 3_000) {
  if (!child || child.exitCode !== null || child.killed) return;
  const exited = new Promise(resolve => child.once('exit', resolve));
  if (process.platform === 'win32') {
    try {
      childProcess.execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } catch (_) {
      child.kill(gracefulSignal);
    }
    await Promise.race([
      exited,
      sleep(timeoutMs),
    ]);
    return;
  }
  child.kill(gracefulSignal);
  const graceful = await Promise.race([
    exited.then(() => true),
    sleep(timeoutMs).then(() => false),
  ]);
  if (graceful) return;
  if (child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      exited,
      sleep(timeoutMs),
    ]);
  }
}

async function removeDirWithRetry(dir) {
  let lastError = null;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await sleep(500);
    }
  }
  throw lastError;
}

function valueFromRemote(result) {
  if (!result || !result.result) return undefined;
  if ('value' in result.result) return result.result.value;
  if ('description' in result.result) return result.result.description;
  return undefined;
}

async function evaluate(cdp, expression, awaitPromise = true) {
  const result = await cdp.command('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
    userGesture: true,
  });
  if (result.exceptionDetails) {
    fail(`Browser evaluation failed: ${result.exceptionDetails.text || 'exception'}`, result.exceptionDetails);
  }
  return valueFromRemote(result);
}

function browserErrors(events) {
  const errors = [];
  for (const event of events) {
    if (event.method === 'Runtime.exceptionThrown') {
      errors.push(event.params?.exceptionDetails?.exception?.description || event.params?.exceptionDetails?.text || 'Runtime exception');
    }
    if (event.method === 'Runtime.consoleAPICalled' && event.params?.type === 'error') {
      const args = event.params.args || [];
      errors.push(args.map(arg => arg.value || arg.description || '').filter(Boolean).join(' ') || 'console.error');
    }
    if (event.method === 'Log.entryAdded' && event.params?.entry?.level === 'error') {
      errors.push(event.params.entry.text || 'log error');
    }
  }
  return errors.filter(Boolean);
}

function allConsoleLogs(events) {
  const logs = [];
  for (const event of events) {
    if (event.method === 'Runtime.exceptionThrown') {
      const details = event.params?.exceptionDetails;
      const stack = details?.exception?.description || details?.text || 'Exception';
      logs.push(`[Exception] ${stack}`);
    }
    if (event.method === 'Runtime.consoleAPICalled') {
      const type = event.params?.type || 'log';
      const args = event.params.args || [];
      let msg = args.map(arg => arg.value !== undefined ? String(arg.value) : (arg.description || '')).join(' ');
      if (event.params.stackTrace) {
        const frames = (event.params.stackTrace.callFrames || [])
          .map(f => `  at ${f.functionName || '<anonymous>'} (${f.url}:${f.lineNumber}:${f.columnNumber})`)
          .join('\n');
        msg += '\n' + frames;
      }
      logs.push(`[Console.${type}] ${msg}`);
    }
    if (event.method === 'Log.entryAdded') {
      const level = event.params?.entry?.level || 'info';
      const text = event.params?.entry?.text || '';
      logs.push(`[Log.${level}] ${text}`);
    }
  }
  return logs;
}

async function runBrowserSmoke({ appUrl, debugPort }) {
  log('waiting for Chrome DevTools');
  const version = await waitFor(
    () => httpJson(`http://127.0.0.1:${debugPort}/json/version`).then(r => r.statusCode === 200 && r.json),
    'Chrome DevTools endpoint',
  );
  if (!version.webSocketDebuggerUrl) fail('Chrome DevTools endpoint missing browser WebSocket URL');

  log('creating Chrome target');
  const target = await httpJson(`http://127.0.0.1:${debugPort}/json/new`, 'PUT');
  const wsUrl = target.json?.webSocketDebuggerUrl;
  if (!wsUrl) fail('Could not create Chrome target');

  const cdp = new CdpClient(wsUrl);
  await cdp.connect();
  try {
    let lastState = null;
    try {
      log('enabling browser domains');
      await cdp.command('Runtime.enable');
      await cdp.command('Log.enable');
      await cdp.command('Page.enable');
      // Network.enable deliberately omitted (T5.10): it floods the single shared
      // WebSocket with a requestWillBeSent/responseReceived event per font/API
      // fetch, each carrying a full initiator stack — those events starve pending
      // Runtime.evaluate replies on the same socket and caused this harness to
      // wedge on every run. Nothing in the pass/fail logic reads Network events.
      await cdp.command('Page.addScriptToEvaluateOnNewDocument', {
        source: `
          window.confirm = () => true;
          localStorage.setItem('octagon_auto_login_enabled', '1');
          localStorage.setItem('octagon_auto_login_user_id', 'system_admin');
          localStorage.setItem('octagon_user_id', 'system_admin');
          localStorage.setItem('pentagon_user_id', 'system_admin');
          localStorage.setItem('omni_current_user_id', 'system_admin');
        `,
      });

      log(`navigating browser to ${appUrl}`);
      await cdp.command('Page.navigate', { url: appUrl });
      log('waiting for document readiness');
      await waitFor(async () => {
        const state = await evaluate(cdp, 'document.readyState', false);
        return state === 'interactive' || state === 'complete';
      }, 'document readiness');

      log('waiting for login shell');
      await waitFor(async () => {
        return evaluate(cdp, `Boolean(document.getElementById('loginOverlay') || document.getElementById('introScreen'))`, false);
      }, 'login shell');

      log('injecting local test login');
      const loginState = await evaluate(cdp, `
        (async () => {
          localStorage.setItem('octagon_user_id', 'system_admin');
          localStorage.setItem('pentagon_user_id', 'system_admin');
          localStorage.setItem('omni_current_user_id', 'system_admin');
          if (window.PentagonAuth && typeof window.PentagonAuth.setCurrentUser === 'function') {
            window.PentagonAuth.setCurrentUser('system_admin');
          }
          if (typeof checkLoginStatus === 'function') checkLoginStatus();
          if (typeof updateAuthSessionModeBadge === 'function') updateAuthSessionModeBadge();
          return {
            bodyClass: document.body.className,
            overlayDisplay: getComputedStyle(document.getElementById('loginOverlay') || document.body).display,
            user: window.PentagonAuth?.getCurrentUser?.()?.id || '',
          };
        })()
      `);

      if (String(loginState.bodyClass || '').includes('login-required')) {
        fail('Login shell still requires login after local test account injection', loginState);
      }

      log('waiting for app data and route health');
      const appState = await waitFor(async () => {
        const state = await evaluate(cdp, `
          (() => {
            let employeeCount = 0;
            try { employeeCount = Array.isArray(employees) ? employees.length : 0; } catch (_) {}
            let omniReady = false;
            try { omniReady = !!omni; } catch (_) {}
            return {
              employeeCount,
              omniReady,
              routeHealthReady: !!window.OctagonRouteHealth,
              loadingHidden: !!document.querySelector('#loadingOverlay.hidden') || getComputedStyle(document.getElementById('loadingOverlay') || document.body).display === 'none',
            };
          })()
        `);
        lastState = state;
        return state && state.omniReady && state.employeeCount > 0 && state.routeHealthReady ? state : null;
      }, 'loaded app data and Route Health');

      log('checking route health availability');
      const routeHealth = await evaluate(cdp, `
        (() => {
          const service = window.OctagonRouteHealth;
          const navTarget = document.querySelector('[data-page="route_health"], [onclick*="route_health"], #nav-route_health');
          return {
            ok: !!service && typeof service.report === 'function',
            serviceReady: !!service,
            hasReport: typeof service?.report === 'function',
            hasHydrate: typeof service?.hydrate === 'function',
            navTarget: !!navTarget,
          };
        })()
      `, false);

      const errors = browserErrors(cdp.events);
      if (errors.length) fail('Browser console/runtime errors detected', errors);
      if (!routeHealth.ok) fail('Route Health is not reachable', routeHealth);

      return { loginState, appState, routeHealth, browserErrors: errors.length };
    } catch (err) {
      if (lastState) console.error('[smoke-boot] Last app state before timeout:', lastState);
      const logs = allConsoleLogs(cdp.events);
      console.error('[smoke-boot] Full browser logs during boot:\n' + logs.join('\n'));
      throw err;
    }
  } finally {
    cdp.close();
  }
}

async function main() {
  const portArg = process.argv.find(arg => arg.startsWith('--port='));
  const port = portArg ? Number(portArg.split('=')[1]) : DEFAULT_PORT;
  const keepTemp = process.argv.includes('--keep-temp');
  const headlessDisabled = process.argv.includes('--no-browser');
  let scratchInfo = null;
  let server = null;
  let chrome = null;

  try {
    scratchInfo = await makeScratch();
    log(`scratch=${scratchInfo.scratch}`);

    server = startServer({ port, ...scratchInfo });
    await waitFor(async () => {
      const result = await fetchJson(`http://127.0.0.1:${port}/api/server/status`).catch(() => null);
      return result && result.res.status === 200 && result.json?.server?.sqliteActive ? result.json : null;
    }, `server ${port}`);

    const root = await fetch(`http://127.0.0.1:${port}/`);
    const rootHtml = await root.text();
    if (root.status !== 200 || !/Octagon ERP/.test(rootHtml)) fail('GET / did not return Octagon HTML');

    const db = await fetchJson(`http://127.0.0.1:${port}/api/db`);
    const data = db.json || {};
    const employeeCount = Array.isArray(data.employees) ? data.employees.length : 0;
    if (employeeCount <= 0) fail('GET /api/db returned zero employees');

    let browser = { skipped: true };
    if (!headlessDisabled) {
      const chromePath = findChrome();
      const debugPort = await findFreePort();
      const userDataDir = path.join(scratchInfo.scratch, 'chrome-profile');
      fs.mkdirSync(userDataDir, { recursive: true });
      chrome = startChrome({ chromePath, debugPort, userDataDir });
      browser = await runBrowserSmoke({ appUrl: `http://127.0.0.1:${port}/`, debugPort });
    }

    const summary = {
      ok: true,
      port,
      employees: employeeCount,
      financeTransactions: Array.isArray(data.finance?.transactions) ? data.finance.transactions.length : 0,
      accountMoves: Array.isArray(data.account_moves) ? data.account_moves.length : 0,
      browser,
    };
    log(JSON.stringify(summary, null, 2));
  } finally {
    await stopChild(chrome, 'SIGKILL', 3_000);
    await stopChild(server?.child, 'SIGTERM', 3_000);
    if (scratchInfo && !keepTemp) {
      await removeDirWithRetry(scratchInfo.scratch);
    }
  }
}

main().catch(error => {
  console.error(`[smoke-boot] FAIL: ${error.message}`);
  if (error.details) console.error(JSON.stringify(error.details, null, 2));
  process.exit(1);
});
