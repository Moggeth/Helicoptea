// Screenshot tour of the house and tea garden from fixed viewpoints:
//   node tests/shot-world.mjs [baseUrl] [--out=dir] [--only=name,name] [--quality=high] [--size=1600x900]
//     [--view=name:x,y,z,lookX,lookY,lookZ] (repeatable: adds a viewpoint) [--wait=ms]
// Writes PNGs to test-results/world/ (or --out). Uses window.__helicoptea.freeCam to pin the camera.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4178/';
const outDir = path.resolve(arg('out') || 'test-results/world');
fs.mkdirSync(outDir, { recursive: true });
const only = arg('only')?.split(',');
const quality = arg('quality') || 'high';
const vp = arg('size')?.split('x').map(Number) || [1600, 900];
// name: [camera x, y, z, look x, y, z]
export const VIEWS = {
  'kitchen-table': [0.9, 0.45, 1.2, 0, 0, 0],
  'kitchen-wide': [-2.1, 0.9, 2.0, 0.6, -0.2, -0.6],
  'kitchen-counter': [0.6, 0.5, 0.6, 2.2, -0.1, 0.2],
  'kitchen-dresser': [0.2, 0.3, -0.6, 1.1, 0.2, 2.1],
  'kitchen-range': [0, 0.3, 0.6, -2.2, -0.2, -0.5],
  'kitchen-floor': [0.8, -0.55, 1.6, -0.6, -0.7, -0.4],
  'backdoor-out': [1.2, 0.2, 0.2, 1.1, -0.4, -3.0],
  'patio': [1.8, 0.2, -1.9, -0.6, -0.6, -3.2],
  'garden-table': [1.0, 0.25, -2.2, 0.35, -0.1, -3.0],
  'garden-wide': [0.4, 1.2, -1.8, 0.2, -0.6, -5.0],
  'garden-back': [0.2, 0.6, -6.0, 0.4, -0.3, -2.0],
  'garden-left': [1.8, 0.3, -4.3, -2.6, -0.4, -4.0],
  'garden-tree': [0.8, 0.4, -4.2, 2.8, 0.3, -5.6],
  'birdbath': [-0.6, -0.1, -3.0, -1.6, -0.4, -3.8],
  'bench-cat': [-0.8, -0.1, -4.6, -1.7, -0.35, -5.6],
  'house-from-garden': [0.4, 1.0, -5.8, 0.4, 0.4, -1.5],
};

for (const a of process.argv.filter((x) => x.startsWith('--view='))) {
  const [nm, nums] = a.slice(7).split(':');
  VIEWS[nm] = nums.split(',').map(Number);
}
const waitMs = Number(arg('wait') || 700);
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}?view=chase&record=0&quality=${quality}&fs=0`, { waitUntil: 'load' });
await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
await page.click('#start-btn');
await page.waitForFunction(() => window.__helicoptea?.started);
await page.evaluate(() => { try { window.__helicoptea.doAction('skiphints'); } catch { /* */ } });
await page.addStyleTag({ content: '#hud, .hud, #touch, .hint, #hints { display: none !important; }' });
await sleep(1500);
for (const [name, v] of Object.entries(VIEWS)) {
  if (only && !only.includes(name)) continue;
  await page.evaluate((v) => { const f = window.__helicoptea.freeCam; f.on = true; f.pos.set(v[0], v[1], v[2]); f.look.set(v[3], v[4], v[5]); }, v);
  await sleep(waitMs);
  await page.screenshot({ path: `${outDir}/${name}.png` });
}
console.log(logs.filter((l) => /error|warn/i.test(l)).join('\n') || 'no errors');
await browser.close();
