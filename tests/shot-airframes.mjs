// Visual check of every aircraft, outside and in: node tests/shot-airframes.mjs [baseUrl] [--out=dir] [--aircraft=a,b] [--size=WxH]
// Orbit shots of the airframe on its pad, then the cockpit from fixed look angles. Writes PNGs to
// test-results/airframes/ (or --out).
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k, d) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4190/';
const outDir = path.resolve(arg('out', 'test-results/airframes'));
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vp = arg('size', '1600x900').split('x').map(Number);
const which = arg('aircraft', 'micro,chinook,skycrane').split(',');
const only = arg('only', 'out,in').split(',');
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const logs = [];
for (const ac of which) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
  const page = await ctx.newPage();
  page.on('console', (m) => logs.push(`[${ac}] [${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[${ac}] [pageerror] ${e.message}`));
  await page.goto(`${base}?aircraft=${ac}&view=chase`, { waitUntil: 'load' });
  try { await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 }); } catch (e) { console.log(logs.join('\n')); throw e; }
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => { try { window.__helicoptea.doAction('skiphints'); } catch { /* */ } });
  await sleep(1500);
  const S = ac === 'micro' ? 1 : ac === 'chinook' ? 1.5 : 1.35;
  if (only.includes('out')) {
    await page.keyboard.press('Digit5');
    await sleep(300);
    const orbits = [['front-q', 0.7, 0.18, 0.16], ['side', Math.PI / 2, 0.06, 0.17], ['rear-q', 2.5, 0.3, 0.17], ['top', 0.3, 0.95, 0.2], ['nose-close', 0.25, 0.08, 0.085]];
    for (const [nm, yaw, pitch, dist] of orbits) {
      await page.evaluate(([y, p, d]) => {
        // Orbit yaw is in world axes: add the aircraft's heading so the named angle is relative to the nose.
        const H = window.__helicoptea, q = H.view.heliQuat;
        const hd = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.x * q.x));
        Object.assign(H.cam.orbit, { yaw: y + hd + Math.PI, pitch: p, dist: d });
      }, [yaw, pitch, dist * S]);
      await sleep(700);
      await page.screenshot({ path: `${outDir}/${ac}-out-${nm}.png` });
    }
    await page.keyboard.press('Digit2');
    await sleep(300);
  }
  if (only.includes('in')) {
    await page.keyboard.press('Digit1');
    await sleep(900);
    const looks = [['ahead', 0, 0], ['down-right', -0.8, -0.75], ['down', 0, -1.1], ['left', 1.3, -0.15], ['right', -1.4, -0.2], ['up', 0, 0.75], ['back-left', 2.3, 0], ['panel', 0, -0.45]];
    for (const [nm, y, p] of looks) {
      await page.evaluate(([yy, pp]) => { const r = window.__helicoptea.fpRig; r.recentering = false; r.lookYaw = yy; r.lookPitch = pp; }, [y, p]);
      await sleep(400);
      await page.screenshot({ path: `${outDir}/${ac}-in-${nm}.png` });
    }
  }
  await ctx.close();
}
console.log(logs.filter((l) => /error|warn/i.test(l)).join('\n') || 'no errors');
await browser.close();
