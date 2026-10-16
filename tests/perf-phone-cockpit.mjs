// Phone-class cockpit frame rate, as the cockpit suite's touch check measures it (844x390 at DPR 2, touch,
// medium tier, 4x CPU throttle, median of three 2 s windows), repeated, plus draw calls and triangles.
// Usage: node tests/perf-phone-cockpit.mjs [baseUrl] [--runs=3] [--aircraft=micro]
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4190/';
const runs = +(process.argv.find((a) => a.startsWith('--runs='))?.slice(7) || 3);
const ac = process.argv.find((a) => a.startsWith('--aircraft='))?.slice(11) || 'micro';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
for (let r = 0; r < runs; r++) {
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await page.goto(`${base}?aircraft=${ac}&view=chase`, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  await page.tap('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => window.__helicoptea.doAction('skiphints'));
  await sleep(400);
  await page.tap('#hud [data-act=view]');
  await sleep(1500);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sleep(1500);
  const w = [];
  for (let k = 0; k < 3; k++) w.push(await page.evaluate(async () => { const g = window.__helicoptea, f0 = g.frames, t0 = performance.now(); await new Promise((r) => setTimeout(r, 2000)); return (g.frames - f0) / ((performance.now() - t0) / 1000); }));
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const info = await page.evaluate(() => { const g = window.__helicoptea; const i = g.renderer.info.render; return { q: g.quality.name, calls: i.calls, tris: i.triangles }; });
  console.log(`${ac} run ${r + 1}: ${w.sort((a, b) => a - b)[1].toFixed(1)} fps (windows ${w.map((x) => x.toFixed(0)).join(', ')})  tier ${info.q}  last-frame calls ${info.calls} tris ${info.tris}`);
  await ctx.close();
}
await browser.close();
