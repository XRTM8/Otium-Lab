import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

const DIST_DIR = path.resolve(process.cwd(), 'dist');
const liveOfflineAudit = process.argv.includes('--live-offline');
const beamOnly = process.argv.includes('--beam-only');
if (!liveOfflineAudit && !beamOnly && !fs.existsSync(DIST_DIR)) {
  console.error('[e2e-verify] dist/ does not exist. Build the web app first.');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
};

function findBrowserExecutable() {
  const envPath = process.env.CHROME_PATH || process.env.CHROME_BIN || process.env.EDGE_PATH;
  const candidates = [
    envPath,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`No headless Chromium/Edge executable found. Checked: ${candidates.join(', ')}`);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return (c ^ 0xffffffff) >>> 0;
}

const FONT = {
  O: ['0111110', '1100011', '1100011', '1100011', '1100011', '1100011', '1100011', '1100011', '0111110'],
  T: ['1111111', '1111111', '0011100', '0011100', '0011100', '0011100', '0011100', '0011100', '0011100'],
  I: ['0111110', '0111110', '0011100', '0011100', '0011100', '0011100', '0011100', '0111110', '0111110'],
  U: ['1100011', '1100011', '1100011', '1100011', '1100011', '1100011', '1100011', '1100011', '0111110'],
  M: ['1100011', '1110111', '1011101', '1001001', '1000001', '1000001', '1000001', '1000001', '1000001'],
  H: ['1100011', '1100011', '1100011', '1111111', '1111111', '1100011', '1100011', '1100011', '1100011'],
  E: ['1111111', '1111111', '1100000', '1111110', '1111110', '1100000', '1100000', '1111111', '1111111'],
  L: ['1100000', '1100000', '1100000', '1100000', '1100000', '1100000', '1100000', '1111111', '1111111'],
  ' ': ['0000', '0000', '0000', '0000', '0000', '0000', '0000', '0000', '0000'],
};

function buildTextPng(lines) {
  const width = 1000;
  const height = 460;
  const scale = 10;
  const rowStride = 1 + width * 3;
  const raw = Buffer.alloc(height * rowStride, 255);
  for (let y = 0; y < height; y++) raw[y * rowStride] = 0;

  const paintRect = (px, py, pw, ph, r, g, b) => {
    for (let y = py; y < py + ph && y < height; y++) {
      if (y < 0) continue;
      for (let x = px; x < px + pw && x < width; x++) {
        if (x < 0) continue;
        const idx = y * rowStride + 1 + x * 3;
        raw[idx] = r;
        raw[idx + 1] = g;
        raw[idx + 2] = b;
      }
    }
  };

  lines.forEach((line, lineIdx) => {
    let cursorX = 110;
    const baseY = 90 + lineIdx * 150;
    for (const ch of line) {
      const glyph = FONT[ch];
      if (!glyph) continue;
      for (let gy = 0; gy < glyph.length; gy++) {
        const row = glyph[gy];
        for (let gx = 0; gx < row.length; gx++) {
          if (row[gx] === '1') {
            paintRect(cursorX + gx * scale, baseY + gy * scale, scale, scale, 10, 10, 10);
          }
        }
      }
      cursorX += (glyph[0].length + 2) * scale;
    }
  });

  const idat = zlib.deflateSync(raw);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, 'ascii');
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function buildMinimalPdf() {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n',
    '4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 18 Tf 72 700 Td (Otium Lab PDF) Tj ET\nendstream\nendobj\n',
    '5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'utf8'));
    body += obj;
  }
  const xrefPos = Buffer.byteLength(body, 'utf8');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return Buffer.from(body + xref + trailer, 'utf8');
}

function buildStoredZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = Buffer.from(file.name, 'utf8');
    const data = Buffer.from(file.content, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30 + nameBytes.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    nameBytes.copy(local, 30);
    data.copy(local, 30 + nameBytes.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + nameBytes.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBytes.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralSize, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, ...centralParts, eocd]);
}

function buildMinimalPptx() {
  return buildStoredZip([
    {
      name: 'ppt/presentation.xml',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<p:sldIdLst><p:sldId r:id="rId1"/><p:sldId r:id="rId2"/></p:sldIdLst>' +
        '<p:sldSz cx="12192000" cy="6858000"/>' +
        '</p:presentation>',
    },
    {
      name: 'ppt/_rels/presentation.xml.rels',
      content:
        '<?xml version="1.0" encoding="UTF-8"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/>' +
        '</Relationships>',
    },
    {
      name: 'ppt/slides/slide1.xml',
      content:
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        '<p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="1143000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>First Slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    },
    {
      name: 'ppt/slides/slide2.xml',
      content:
        '<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">' +
        '<p:cSld><p:spTree><p:sp><p:spPr><a:xfrm><a:off x="457200" y="457200"/><a:ext cx="8229600" cy="1143000"/></a:xfrm></p:spPr><p:txBody><a:bodyPr/><a:p><a:r><a:t>Second Slide</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>',
    },
  ]);
}

class CdpClient {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl);
    this.id = 0;
    this.pending = new Map();
    this.events = [];
  }
  async connect() {
    await new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
        if (msg.method === 'Target.attachedToTarget' && msg.params?.sessionId) {
          const sid = msg.params.sessionId;
          this.sendSession(sid, 'Runtime.enable', {}).catch((err) => {
            console.debug('[cdp-worker-runtime]', err?.message || err);
          });
          this.sendSession(sid, 'Network.enable', {}).catch((err) => {
            console.debug('[cdp-worker-network]', err?.message || err);
          });
          this.sendSession(sid, 'Runtime.runIfWaitingForDebugger', {}).catch((err) => {
            console.debug('[cdp-worker-resume]', err?.message || err);
          });
        }
      }
    };
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  sendSession(sessionId, method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, sessionId, method, params }));
    });
  }
  async evalJs(expr) {
    const res = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (res.exceptionDetails) throw new Error(JSON.stringify(res.exceptionDetails));
    return res.result?.value;
  }
  close() {
    this.ws.close();
  }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browserPath = findBrowserExecutable();
let beamFixture = '';
if (!liveOfflineAudit) {
  const result = await build({
    configFile: false, logLevel: 'error',
    build: {
      write: false,
      lib: { entry: fileURLToPath(new URL('./beam-browser-fixture.mjs', import.meta.url)), formats: ['es'] },
    },
  });
  const bundle = Array.isArray(result) ? result[0] : result;
  if (bundle.output.length !== 1 || bundle.output[0].type !== 'chunk') throw new Error('Expected one Beam browser fixture module');
  beamFixture = bundle.output[0].code;
}
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'otium-e2e-'));
const testPdfPath = path.join(tempDir, 'test-sample.pdf');
const testPptxPath = path.join(tempDir, 'test-deck.pptx');
const testOcrPngPath = path.join(tempDir, 'test-ocr-otium.png');
const userDataDir = path.join(tempDir, 'browser-profile');

fs.writeFileSync(testPdfPath, buildMinimalPdf());
fs.writeFileSync(testPptxPath, buildMinimalPptx());
fs.writeFileSync(testOcrPngPath, buildTextPng(['HELLO', 'TIME']));
fs.mkdirSync(userDataDir, { recursive: true });

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (beamFixture && urlPath === '/beam-test/') {
    res.writeHead(200, { 'Content-Type': MIME['.html'] });
    res.end('<!doctype html><title>Beam WebRTC recovery test</title><link rel="icon" href="data:,">');
    return;
  }
  if (beamFixture && urlPath === '/beam-test/fixture.js') {
    res.writeHead(200, { 'Content-Type': MIME['.js'] });
    res.end(beamFixture);
    return;
  }
  if (!urlPath.startsWith('/Otium-Lab')) {
    res.writeHead(404);
    res.end(`404 OUTSIDE /Otium-Lab: ${urlPath}`);
    return;
  }
  let rel = urlPath.slice('/Otium-Lab'.length);
  if (rel === '' || rel === '/') rel = '/index.html';
  const filePath = path.join(DIST_DIR, rel);
  if (!filePath.startsWith(DIST_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404);
    res.end(`404 MISSING: ${urlPath}`);
    return;
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const { port } = server.address();
const appUrl = liveOfflineAudit ? 'https://xrtm8.github.io/Otium-Lab/' : `http://127.0.0.1:${port}/Otium-Lab/`;

const browser = spawn(
  browserPath,
  [
    '--headless=new',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-sandbox',
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

let browserError = '';
let browserStderr = '';
browser.on('error', (error) => { browserError = error.message; });
browser.stderr.setEncoding('utf8');
browser.stderr.on('data', (chunk) => { browserStderr = (browserStderr + chunk).slice(-4096); });

// Chromium publishes the port it bound in the fresh profile. Reserving and
// closing a separate socket first leaves a race before Chromium binds it.
const devToolsPortFile = path.join(userDataDir, 'DevToolsActivePort');
let cdpPort;
let cdpError = '';
const startupDeadline = Date.now() + 20_000;
while (Date.now() < startupDeadline) {
  if (browserError || browser.exitCode !== null || browser.signalCode !== null) break;
  try {
    if (fs.existsSync(devToolsPortFile)) {
      const candidatePort = Number(fs.readFileSync(devToolsPortFile, 'utf8').split(/\r?\n/, 1)[0]);
      if (Number.isInteger(candidatePort) && candidatePort > 0 && candidatePort <= 65535) {
        const response = await fetch(`http://127.0.0.1:${candidatePort}/json/list`, { signal: AbortSignal.timeout(1000) });
        const targets = await response.json();
        if (targets.some((target) => target.type === 'page')) {
          cdpPort = candidatePort;
          break;
        }
      }
    }
  } catch (error) {
    cdpError = error.message;
  }
  await wait(200);
}
if (!cdpPort) {
  console.error('[e2e-verify] Browser failed to expose a CDP page:', {
    browserPath, exitCode: browser.exitCode, signal: browser.signalCode, browserError, cdpError, browserStderr,
  });
  browser.kill();
  server.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
  process.exit(1);
}

let allPassed = true;

async function runAudit(name, mobileMode, scenarioFn, url = appUrl) {
  const created = await (await fetch(`http://127.0.0.1:${cdpPort}/json/new?about:blank`, { method: 'PUT' })).json();
  const cdp = new CdpClient(created.webSocketDebuggerUrl);
  await cdp.connect();
  try {
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('DOM.enable');
    await cdp.send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      mobileMode
        ? { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, hasTouch: true }
        : { width: 1280, height: 820, deviceScaleFactor: 1, mobile: false }
    );
    if (mobileMode) {
      await cdp.send('Emulation.setUserAgentOverride', {
        userAgent:
          'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
      });
    }
    await cdp.send('Emulation.setEmitTouchEventsForMouse', { enabled: mobileMode });
    const navigation = await cdp.send('Page.navigate', { url });
    if (navigation.errorText) throw new Error(`Navigation failed: ${navigation.errorText}`);
    await wait(1600);

    const out = await scenarioFn(cdp);
    const exceptions = cdp.events
      .filter((e) => e.method === 'Runtime.exceptionThrown')
      .map((e) => e.params.exceptionDetails?.exception?.description || e.params.exceptionDetails?.text);
    const consoleErrors = cdp.events
      .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
      .map((e) => e.params.args.map((a) => a.value ?? a.description).join(' '));
    const http4xx5xx = cdp.events
      .filter((e) => e.method === 'Network.responseReceived' && e.params.response.status >= 400)
      .map((e) => `${e.params.response.status} ${e.params.response.url}`);
    const wasmRequests = cdp.events
      .filter((e) => e.method === 'Network.responseReceived' && e.params.response.url.includes('otium_wasm.wasm'))
      .map((e) => `${e.params.response.status} ${e.params.response.url}`);

    console.log(`\n=== ${name} ===`);
    console.log(JSON.stringify(out, null, 2));
    console.log(`Exceptions (${exceptions.length}):`, exceptions);
    console.log(`Console Errors (${consoleErrors.length}):`, consoleErrors);
    console.log(`HTTP >= 400 (${http4xx5xx.length}):`, http4xx5xx);
    console.log(`Rust WASM Asset Requests (${wasmRequests.length}):`, wasmRequests);
    if (exceptions.length || consoleErrors.length || http4xx5xx.length) allPassed = false;
    if (mobileMode && !wasmRequests.some((r) => r.startsWith('200 '))) {
      console.error('MISSING 200 OK FOR otium_wasm.wasm!');
      allPassed = false;
    }
  } catch (error) {
    const diagnostics = cdp.events
      .filter(event => event.method === 'Runtime.consoleAPICalled')
      .slice(-12)
      .map(event => event.params.args.map(arg => arg.value ?? arg.description).join(' '));
    if (diagnostics.length) console.error(`[${name}] Browser diagnostics:`, diagnostics);
    throw error;
  } finally {
    cdp.close();
  }
}

async function waitForBrowser(cdp, expression, description) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (await cdp.evalJs(expression)) return;
    await wait(250);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

async function auditOffline(cdp) {
  const appReady = "!!document.querySelector('#root button')";
  await waitForBrowser(cdp, `navigator.serviceWorker?.controller?.state === 'activated' && ${appReady}`, 'active Service Worker');
  const registration = await cdp.evalJs(`(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { scope: registration.scope, script: registration.active.scriptURL };
  })()`);
  if (registration.scope !== appUrl || registration.script !== new URL('sw.js', appUrl).href) {
    throw new Error(`Unexpected Service Worker registration: ${JSON.stringify(registration)}`);
  }
  const online = cdp.events.find(({ method, params }) =>
    method === 'Network.responseReceived' && params.type === 'Document' && params.response.url === appUrl);
  if (online?.params.response.status !== 200) throw new Error('Initial navigation did not return HTTP 200');

  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Page.reload');
  await waitForBrowser(cdp, `(async () => {
    if (!(${appReady}) || !navigator.serviceWorker.controller) return false;
    const scripts = Array.from(document.querySelectorAll('script[type=module][src]'), node => node.src);
    return scripts.length > 0 && (await Promise.all(scripts.map(url => caches.match(url)))).every(Boolean);
  })()`, 'application scripts in Cache Storage');

  const eventOffset = cdp.events.length;
  await cdp.send('Network.emulateNetworkConditions', {
    offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0,
  });
  try {
    await cdp.send('Page.reload');
    for (let attempt = 0; attempt < 60; attempt++) {
      if (cdp.events.slice(eventOffset).some(({ method }) => method === 'Page.loadEventFired')) break;
      await wait(250);
    }
    await waitForBrowser(cdp, `!navigator.onLine && ${appReady}`, 'application UI after offline reload');
    const offline = cdp.events.slice(eventOffset).find(({ method, params }) =>
      method === 'Network.responseReceived' && params.type === 'Document' && params.response.url === appUrl);
    if (!offline?.params.response.fromServiceWorker || offline.params.response.status !== 200) {
      throw new Error('Offline navigation did not receive HTTP 200 from the Service Worker');
    }
    return { ...registration, onlineHttpStatus: 200, offlineHttpStatus: 200, offlineUiLoaded: true };
  } finally {
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
  }
}

async function auditScheduledTheme(cdp) {
  await cdp.send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: 'dark' }],
  });
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: `
    localStorage.setItem('otium-lab:otium_theme', 'paper');
    localStorage.setItem('otium-lab:otium_theme_schedule', 'system');
    localStorage.setItem('otium-lab:otium_night_theme', 'nordic');
    window.OtiumTheme = { setTheme(scheme, color) {
      window.__initialTheme ??= {
        scheme, color,
        theme: document.documentElement.dataset.theme,
        beforeReader: !document.querySelector('#root'),
      };
    } };
  ` });
  await cdp.send('Page.reload');
  await waitForBrowser(cdp, '!!window.__initialTheme', 'theme bootstrap after reload');
  // The production app registers on HTTPS. The loopback fixture uses HTTP.
  await cdp.evalJs("(async () => { await navigator.serviceWorker.register('./sw.js'); })()");
  const offline = await auditOffline(cdp);
  const result = await cdp.evalJs(`(async () => ({
    ...window.__initialTheme,
    assetCached: !!(await caches.match(new URL('theme-init.js', location.href))),
    renderedTheme: document.documentElement.dataset.theme,
  }))()`);
  if (!result.beforeReader || result.scheme !== 'dark' || result.color !== '#15181e' ||
      result.theme !== 'nordic' || result.renderedTheme !== 'nordic' || !result.assetCached) {
    throw new Error(`The scheduled theme was not applied before the offline reader mounted: ${JSON.stringify(result)}`);
  }
  return { ...result, offlineHttpStatus: offline.offlineHttpStatus };
}

async function auditLocalBuild() {
  await runAudit('DESKTOP FULL VERIFICATION', false, async (cdp) => {
    const res = {};
    await cdp.evalJs(`(() => {
      localStorage.setItem('otium-lab:otium-teaching-preferences-v1', JSON.stringify({ boardEnabled: true, position: 'center', offset: 12, size: 52, color: '#e11d48', width: 4, stylusOnly: false, boardFollowTheme: true, boardColor: '#ffffff' }));
    })()`);
    await cdp.send('Page.reload');
    await wait(1200);

    // Stage 5: Lazy chunk hygiene + Service Worker readiness on Landing
    res.startupCheck = await cdp.evalJs(`(async () => {
      const scripts = Array.from(document.scripts).map(s => s.src || '');
      const resources = performance.getEntriesByType('resource').map(r => r.name);
      const eagerHeavy = [...scripts, ...resources].filter(u => /pdfjs-core|tesseract-ocr|vendor-pdflib/i.test(u));
      let swFetchOk = false;
      try {
        const swResp = await fetch('./sw.js', { cache: 'no-store' });
        swFetchOk = swResp.ok && (await swResp.text()).includes('CACHE_NAME');
      } catch (err) {
        console.debug('[e2e] sw probe failed:', err);
      }
      return { eagerHeavy, swFetchOk };
    })()`);
    if (res.startupCheck.eagerHeavy.length > 0 || !res.startupCheck.swFetchOk) allPassed = false;

    // Settings
    res.settingsOpened = await cdp.evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.getAttribute('title')?.includes('إعدادات') || b.textContent?.includes('إعدادات'));
      if (!btn) return false; btn.click(); return true;
    })()`);
    await wait(250);
    await cdp.evalJs(`(() => {
      const done = Array.from(document.querySelectorAll('[role="dialog"] button')).find(b => /تم وحفظ|Done/i.test(b.textContent || ''));
      done?.click();
    })()`);
    await wait(200);

    // PPTX
    let doc = await cdp.send('DOM.getDocument', { depth: -1 });
    let input = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
    await cdp.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [testPptxPath] });
    await wait(1200);
    res.pptx = await cdp.evalJs(`(() => {
      const txt = document.body.innerText;
      const next = Array.from(document.querySelectorAll('button')).find(b => /الشريحة التالية|Next slide/i.test(b.getAttribute('aria-label')||''));
      if (next) next.click();
      return { slide1: txt.includes('First Slide'), nextClicked: !!next };
    })()`);
    await wait(300);
    res.pptxSlide2 = await cdp.evalJs(`document.body.innerText.includes('Second Slide')`);
    if (!res.pptx?.slide1 || !res.pptxSlide2) allPassed = false;

    await cdp.evalJs(`(() => {
      const back = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('المكتبة') || b.textContent?.includes('Library'));
      back?.click();
    })()`);
    await wait(400);

    // PDF + Zoom + Search + Board 120Hz stroke
    doc = await cdp.send('DOM.getDocument', { depth: -1 });
    input = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
    await cdp.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [testPdfPath] });
    await wait(1400);

    const beforeZoom = await cdp.evalJs(`(() => {
      const c = document.querySelector('canvas');
      return c ? { width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height } : null;
    })()`);
    await cdp.evalJs(`(() => {
      const zoomIn = Array.from(document.querySelectorAll('button')).find(b => /تكبير|Zoom In/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.getAttribute('title')||'')));
      zoomIn?.click();
    })()`);
    await wait(400);
    const afterZoom = await cdp.evalJs(`(() => {
      const c = document.querySelector('canvas');
      return c ? { width: c.getBoundingClientRect().width, height: c.getBoundingClientRect().height } : null;
    })()`);
    res.pdfZoom = { beforeZoom, afterZoom, grew: !!(beforeZoom && afterZoom && afterZoom.width > beforeZoom.width) };
    if (!res.pdfZoom.grew) allPassed = false;

    await waitForBrowser(cdp, `!!document.querySelector('[data-pdf-page="1"] canvas[data-viewport-width]')`, 'PDF page raster');
    res.pdfThemeSwitch = await cdp.evalJs(`(async () => {
      const slot = document.querySelector('[data-pdf-page="1"]');
      const canvas = slot?.querySelector('canvas[data-viewport-width]');
      const context = canvas?.getContext('2d');
      if (!context || document.documentElement.dataset.theme !== 'paper') return null;
      const sample = () => {
        const pixel = context.getImageData(4, 4, 1, 1).data;
        return Math.max(pixel[0], pixel[1], pixel[2]);
      };
      const results = [];
      for (const [theme, color, dark] of [
        ['amber', 'rgb(24, 19, 14)', true],
        ['amoled', 'rgb(0, 0, 0)', true],
        ['eink', 'rgb(234, 234, 234)', false],
      ]) {
        let synchronized = true;
        let ready = false;
        document.activeElement?.blur?.();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 't', bubbles: true }));
        for (let frame = 0; frame < 120; frame++) {
          await new Promise((resolve) => requestAnimationFrame(resolve));
          const background = sample();
          const slotColor = getComputedStyle(slot).backgroundColor;
          const palette = slotColor.match(/\\d+/g).slice(0, 3).map(Number);
          const darkPalette = Math.max(...palette) < 100;
          synchronized &&= (background < 100) === darkPalette;
          const blend = slot.querySelector('canvas[style*="mix-blend-mode"]')?.style.mixBlendMode;
          synchronized &&= blend === (darkPalette ? 'screen' : 'multiply');
          if (document.documentElement.dataset.theme === theme &&
              slotColor === color && (dark ? background < 50 : background >= 220 && background < 250)) {
            ready = true;
            break;
          }
        }
        const width = Math.ceil(canvas.width * .24);
        const height = Math.ceil(canvas.height * .05);
        const ink = context.getImageData(Math.floor(canvas.width * .116), Math.floor(canvas.height * .09), width, height).data;
        let lightestInk = 0;
        let darkestInk = 255;
        for (let i = 0; i < ink.length; i += 4) {
          const peak = Math.max(ink[i], ink[i + 1], ink[i + 2]);
          lightestInk = Math.max(lightestInk, peak);
          darkestInk = Math.min(darkestInk, peak);
        }
        results.push({ theme, ready, synchronized, background: sample(), lightestInk, darkestInk });
      }
      return results;
    })()`);
    if (res.pdfThemeSwitch?.length !== 3 ||
        res.pdfThemeSwitch.some(({ theme, ready, synchronized, lightestInk, darkestInk }) =>
          !ready || !synchronized || (theme === 'eink' ? darkestInk > 75 : lightestInk < 150 || lightestInk > 230))) {
      allPassed = false;
    }

    await cdp.evalJs(`(() => {
      const boardBtn = Array.from(document.querySelectorAll('button')).find(b => /السبورة|Smartboard/i.test((b.getAttribute('aria-label')||'') + ' ' + (b.getAttribute('title')||'')));
      boardBtn?.click();
    })()`);
    await wait(600);
    res.boardSplit = await cdp.evalJs(`!!document.querySelector('[data-board-resizing]')`);
    res.boardStroke = await cdp.evalJs(`(async () => {
      const pane = document.querySelector('[data-board-resizing]');
      const canvases = pane ? Array.from(pane.querySelectorAll('canvas')) : [];
      const boardCanvas = canvases.find(c => !c.classList.contains('pointer-events-none'));
      let strokeFrameMs = null;
      if (boardCanvas) {
        const rect = boardCanvas.getBoundingClientRect();
        const x = rect.left + 40;
        const y = rect.top + 40;
        const t0 = performance.now();
        boardCanvas.dispatchEvent(new PointerEvent('pointerdown', { pointerType: 'pen', pointerId: 7, button: 0, clientX: x, clientY: y, bubbles: true }));
        for (let step = 1; step <= 15; step++) {
          boardCanvas.dispatchEvent(new PointerEvent('pointermove', { pointerType: 'pen', pointerId: 7, button: 0, clientX: x + step * 4, clientY: y + step * 2, bubbles: true }));
        }
        boardCanvas.dispatchEvent(new PointerEvent('pointerup', { pointerType: 'pen', pointerId: 7, button: 0, clientX: x + 60, clientY: y + 30, bubbles: true }));
        await new Promise(r => requestAnimationFrame(() => r()));
        strokeFrameMs = Math.round((performance.now() - t0) * 100) / 100;
      }
      return { totalCanvases: canvases.length, drewBoardStroke: !!boardCanvas, strokeFrameMs };
    })()`);
    if (!res.boardSplit || !res.boardStroke?.drewBoardStroke) allPassed = false;
    return res;
  });

  await runAudit('MOBILE + SCANNER + WASM + REAL TESSERACT OCR', true, async (cdp) => {
    const res = {};
    res.hasOverflow = await cdp.evalJs(`document.documentElement.scrollWidth > window.innerWidth + 2`);
    if (res.hasOverflow) allPassed = false;

    await cdp.evalJs(`(() => {
      const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('الماسح بالكاميرا'));
      btn?.click();
    })()`);
    await wait(900);

    const doc = await cdp.send('DOM.getDocument', { depth: -1 });
    const inputs = await cdp.send('DOM.querySelectorAll', { nodeId: doc.root.nodeId, selector: 'input[type="file"]' });
    const scannerInputId = inputs.nodeIds[inputs.nodeIds.length - 1];
    await cdp.send('DOM.setFileInputFiles', { nodeId: scannerInputId, files: [testOcrPngPath] });
    await wait(1100);

    await cdp.evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
      const done = btns.find(b => /تأكيد|اعتماد|إنهاء|مراجعة|Confirm|Done|Finish/i.test(b.textContent || ''));
      done?.click();
    })()`);
    await wait(800);

    res.wasmFilterClicked = await cdp.evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
      const cleanBtn = btns.find(b => /تنقية نصوص|ورق ناصع|Clean/i.test(b.textContent || ''));
      cleanBtn?.click();
      return cleanBtn?.textContent?.trim() || null;
    })()`);
    if (!res.wasmFilterClicked) allPassed = false;
    await wait(700);

    res.ocrButton = await cdp.evalJs(`(() => {
      const btns = Array.from(document.querySelectorAll('[role="dialog"] button'));
      const ocr = btns.find(b => /استخراج النص|OCR/i.test((b.getAttribute('title')||'') + ' ' + (b.getAttribute('aria-label')||'') + ' ' + (b.textContent||'')));
      if (ocr) { ocr.click(); return ocr.textContent?.trim() || ocr.getAttribute('title'); }
      return null;
    })()`);

    let ocrSnapshot = { txt: '', area: '', inputs: [] };
    for (let i = 0; i < 80; i++) {
      await wait(500);
      ocrSnapshot = await cdp.evalJs(`(() => {
        const dlg = document.querySelector('[role="dialog"]');
        const txt = dlg?.innerText || '';
        const area = dlg?.querySelector('textarea')?.value || '';
        const inputs = Array.from(dlg?.querySelectorAll('input, textarea') || []).map(el => el.value);
        return { txt, area, inputs };
      })()`);
      const combined = `${ocrSnapshot.txt}\n${ocrSnapshot.area}\n${ocrSnapshot.inputs.join('\n')}`.toUpperCase();
      const stillLoading = ocrSnapshot.txt.includes('جاري القراءة') || ocrSnapshot.txt.includes('جاري استخراج النص');
      if (!stillLoading && (combined.includes('HELLO') || combined.includes('TIME'))) {
        break;
      }
      if (i > 10 && !stillLoading && (combined.includes('تعذر') || combined.includes('لا يوجد') || ocrSnapshot.area.length > 0)) {
        break;
      }
    }
    const combinedUpper = `${ocrSnapshot.txt}\n${ocrSnapshot.area}\n${ocrSnapshot.inputs.join('\n')}`.toUpperCase();
    res.ocrMatchedHello = combinedUpper.includes('HELLO');
    res.ocrMatchedTime = combinedUpper.includes('TIME');
    if (!res.ocrMatchedHello || !res.ocrMatchedTime) allPassed = false;
    return res;
  });
}

try {
  if (liveOfflineAudit) await runAudit('LIVE PAGES OFFLINE RELOAD', false, auditOffline);
  else {
    await runAudit('NATIVE WEBRTC BEAM RECOVERY', false,
      cdp => cdp.evalJs("import('./fixture.js').then(module => module.runBeamRecovery())"),
      `http://127.0.0.1:${port}/beam-test/`);
    if (!beamOnly) {
      await auditLocalBuild();
      await runAudit('SCHEDULED THEME STARTUP AND OFFLINE RELOAD', false, auditScheduledTheme);
    }
  }
} finally {
  browser.kill();
  server.close();
  await wait(200);
  try {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 150 });
  } catch (cleanupErr) {
    console.debug('[e2e-verify] Temp profile cleanup skipped:', cleanupErr?.code || cleanupErr);
  }
}

if (!allPassed) {
  console.error('\n[e2e-verify] E2E VERIFICATION FAILED');
  process.exit(1);
}
console.log(liveOfflineAudit
  ? '\n[e2e-verify] LIVE OFFLINE RELOAD PASSED'
  : beamOnly ? '\n[e2e-verify] NATIVE WEBRTC BEAM RECOVERY PASSED'
    : '\n[e2e-verify] ALL BEAM + DESKTOP + MOBILE + WASM + REAL OCR E2E VERIFICATIONS PASSED');
