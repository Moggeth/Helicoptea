// The built game on a plain static host, as on Vercel: no /api/flights endpoint. Serves dist/ itself
// (unknown paths get a 404 HTML page, like a static host), then checks that the game loads and flies,
// flights and notes save in the browser, survive a reload, load back in the viewer, download as one
// self-contained file that tools/flight-notes.mjs reads, and that nothing logs a console error.
// Usage: npm run build, then node tests/e2e-static.mjs [--headed]   (any base URL argument is ignored)
import { chromium } from 'playwright-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const outArg = process.argv.indexOf('--outDir');
const dist = path.resolve(outArg >= 0 ? process.argv[outArg + 1] : 'dist');
const outDir = path.resolve('test-results/static');
fs.mkdirSync(outDir, { recursive: true });
if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error(`${dist}/index.html missing: build this output directory first`); process.exit(1); }
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

// ---------------------------------------------------------------- a static host
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.map': 'application/json', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.glb': 'model/gltf-binary', '.webmanifest': 'application/manifest+json' };
const apiHits = [];
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.includes('/api/')) apiHits.push(`${req.method} ${p}`);
  let file = path.join(dist, p);
  if (!file.startsWith(dist)) { res.statusCode = 403; return res.end(); }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.statusCode = 405; return res.end('method not allowed'); }
  if (!fs.existsSync(file)) { res.statusCode = 404; res.setHeader('Content-Type', 'text/html'); return res.end('<!doctype html><h1>404: NOT_FOUND</h1>'); }
  res.setHeader('Content-Type', TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;
console.log(`static host ${base} serving ${dist}`);

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const logs = [];
// The probe's 404 is the expected "no endpoint here" answer, not an error in the game.
page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !/404 \(Not Found\)/.test(m.text())) logs.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
const H = (fn, arg) => page.evaluate(fn, arg);
const hold = async (keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of keys) await page.keyboard.up(k); };
const open = async () => {
  await page.goto(base + '?aircraft=micro&view=chase', { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await H(() => window.__helicoptea.doAction('skiphints'));
  await sleep(400);
};
const rp = () => H(() => {
  const g = window.__helicoptea, R = g.replay, f = R.flight;
  return { active: R.active, n: f ? f.n : 0, id: f ? f.id : null, notes: f ? f.notes.map((n) => ({ tag: n.tag, text: n.text })) : [], saved: f ? f.saved : false, savedPath: f ? f.savedPath : '',
    mode: g.flightStore.mode, available: g.flightStore.available, saveText: document.querySelector('#replay .rp-save').textContent, options: [...document.querySelectorAll('#replay .rp-flight option')].map((o) => o.value), groups: [...document.querySelectorAll('#replay .rp-flight optgroup')].map((o) => o.label) };
});

// ---------------------------------------------------------------- fly, note, save in the browser
await open();
await hold(['KeyW'], 1500);
await hold(['ArrowUp'], 600);
await sleep(600);
const flying = await H(() => ({ n: window.__helicoptea.recorder.current?.n || 0, sim: window.__helicoptea.sim.time }));
check('game loads and flies on a static host', flying.n > 100 && flying.sim > 1.5, `${flying.n} samples, ${flying.sim.toFixed(2)} s simulated`);
await page.keyboard.press('Escape');
await sleep(250);
await page.click('.overlay [data-act=replay]');
await sleep(600);
await page.fill('.rp-input', 'Static host note');
await page.click('[data-rp=add][data-tag=good]');
await sleep(1500);
let s = await rp();
check('no flight log endpoint is detected', s.available === false, `available ${s.available}`);
check('flight and notes saved in this browser', s.mode === 'browser' && s.saved && s.savedPath === 'this browser' && s.notes.some((n) => n.tag === 'good' && n.text === 'Static host note'), `${s.mode} · ${s.savedPath}`);
check('viewer says where the flight is saved', /this browser/.test(s.saveText), s.saveText);
await page.screenshot({ path: `${outDir}/viewer-static.png` });
const savedId = s.id;

// ---------------------------------------------------------------- download one self-contained file
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.click('[data-rp=download]')]);
const flightsDir = path.join(outDir, 'flights');
fs.rmSync(flightsDir, { recursive: true, force: true });
fs.mkdirSync(flightsDir, { recursive: true });
const dlPath = path.join(flightsDir, dl.suggestedFilename());
await dl.saveAs(dlPath);
const j = JSON.parse(fs.readFileSync(dlPath, 'utf8'));
check('Download saves one file with the flight, notes and binary', dl.suggestedFilename() === `${savedId}.json` && j.format === 'helicoptea-flight' && j.notes.some((n) => n.text === 'Static host note') && Buffer.from(j.binBase64 || '', 'base64').length > 1000, `${dl.suggestedFilename()} ${(fs.statSync(dlPath).size / 1024).toFixed(0)} KB`);
let tool = '';
try { tool = execFileSync(process.execPath, ['tools/flight-notes.mjs', '--dir', flightsDir], { encoding: 'utf8' }); } catch (err) { tool = `exit ${err.status}: ${err.stderr || err.message}`; }
check('tools/flight-notes.mjs reads the downloaded flight', tool.includes(`# Flight ${savedId}`) && tool.includes('Static host note'), tool.split('\n')[0]);

// ---------------------------------------------------------------- reload: saved flights come back
await page.keyboard.press('Escape');
await sleep(200);
await open();
await page.keyboard.press('Escape');
await sleep(250);
await page.click('.overlay [data-act=replay]');
await sleep(800);
s = await rp();
check('saved flight is listed after a reload', s.options.includes(`d:${savedId}`) && s.groups.includes('Saved in this browser'), s.groups.join(' / '));
await page.selectOption('.rp-flight', `d:${savedId}`);
await sleep(800);
s = await rp();
check('saved flight loads back with its notes', s.id === savedId && s.n === j.nSamples && s.notes.some((n) => n.text === 'Static host note'), `${s.id} n ${s.n}`);

// The first game stops here: two games rendering at once starve a software renderer (CI has no GPU).
await ctx.close();

// ---------------------------------------------------------------- browser storage refused: memory only
{
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await c2.addInitScript(() => { Object.defineProperty(window, 'indexedDB', { value: undefined }); });
  const p2 = await c2.newPage();
  const l2 = [];
  p2.on('pageerror', (e) => l2.push(e.message));
  await p2.goto(base + '?aircraft=micro', { waitUntil: 'load' });
  await p2.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  await p2.click('#start-btn');
  await p2.waitForFunction(() => window.__helicoptea?.started);
  await p2.evaluate(() => window.__helicoptea.doAction('skiphints'));
  await p2.keyboard.down('KeyW'); await sleep(1200); await p2.keyboard.up('KeyW');
  await p2.keyboard.press('Escape'); await sleep(250);
  await p2.click('.overlay [data-act=replay]'); await sleep(800);
  const m = await p2.evaluate(() => ({ mode: window.__helicoptea.flightStore.mode, text: document.querySelector('#replay .rp-save').textContent, active: window.__helicoptea.replay.active }));
  check('without browser storage the viewer still works and offers Download', m.active && m.mode === 'memory' && /Download/.test(m.text) && l2.length === 0, `${m.mode}: ${m.text}${l2.length ? ' | ' + l2[0] : ''}`);
  await c2.close();
}

check('game only probes the endpoint, never writes to it', apiHits.every((h) => h.startsWith('GET ')), apiHits.filter((h) => !h.startsWith('GET ')).join(', '));
check('no console errors on the static host', logs.length === 0, logs.slice(0, 4).join(' | '));

await browser.close();
server.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(`${outDir}/e2e-static.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} static host checks passed`);
process.exit(failed.length ? 1 : 0);
