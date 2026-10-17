// Visual check of the cockpit view from fixed look angles: node tests/shot-cockpit.mjs [baseUrl] [--aircraft=micro|chinook]
// Writes screenshots to test-results/cockpit/.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4190/';
const outDir = path.resolve('test-results/cockpit');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const which = process.argv.find((a) => a.startsWith('--aircraft='))?.slice(11) || 'micro';
const vp = process.argv.find((a) => a.startsWith('--size='))?.slice(7).split('x').map(Number) || [1600, 900];
const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}?aircraft=${which}&view=chase`, { waitUntil: 'load' });
await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
await page.click('#start-btn');
await page.waitForFunction(() => window.__helicoptea?.started);
await page.evaluate(() => { try { window.__helicoptea.doAction('skiphints'); } catch { /* */ } });
await sleep(1200);
await page.screenshot({ path: `${outDir}/${which}-0-chase.png` });
await page.keyboard.press('Digit1');
await sleep(800);
await page.screenshot({ path: `${outDir}/${which}-1-pad.png` });
await page.keyboard.down('KeyW'); await sleep(1100); await page.keyboard.up('KeyW');
await sleep(900);
await page.screenshot({ path: `${outDir}/${which}-2-hover.png` });
const looks = [['3-down-right', -0.8, -0.75], ['4-down', 0, -1.1], ['5-left', 1.3, -0.15], ['6-right', -1.4, -0.2], ['7-up', 0, 0.75], ['8-back-left', 2.3, 0]];
for (const [nm, y, p] of looks) {
  await page.evaluate(([yy, pp]) => { const r = window.__helicoptea.fpRig; r.recentering = false; r.lookYaw = yy; r.lookPitch = pp; }, [y, p]);
  await sleep(350);
  await page.screenshot({ path: `${outDir}/${which}-${nm}.png` });
}
console.log(logs.filter((l) => /error|warn/i.test(l)).join('\n') || 'no errors');
await browser.close();
