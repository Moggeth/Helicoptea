import { chromium } from 'playwright-core';
import fs from 'node:fs';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4207/';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto(`${base}?quality=low&record=0`);
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  await page.click('#start-btn'); await page.evaluate(() => window.__helicoptea.doAction('pause'));
  if (process.argv.includes('--source-css')) await page.addStyleTag({ content: fs.readFileSync('src/styles.css', 'utf8') });
  for (const [width, height] of [[320, 568], [390, 844], [430, 932], [844, 390], [1024, 768]]) {
    await page.setViewportSize({ width, height });
    for (const aircraft of ['micro', 'chinook', 'skycrane']) {
      const issues = await page.evaluate((aircraft) => {
        const H = window.__helicoptea;
        H.setAircraft(aircraft); H.input.setTouchMode(aircraft === 'skycrane', aircraft !== 'skycrane');
        const boxes = [...document.querySelectorAll('.touch-btn')].filter((b) => b.getClientRects().length).map((b) => ({ name: b.className, r: b.getBoundingClientRect() }));
        const issues = [];
        for (let i = 0; i < boxes.length; i++) {
          const a = boxes[i];
          if (a.r.left < 0 || a.r.right > innerWidth || a.r.top < 0 || a.r.bottom > innerHeight) issues.push(`${a.name} off screen`);
          for (const b of boxes.slice(i + 1)) if (Math.min(a.r.right, b.r.right) > Math.max(a.r.left, b.r.left) + 1 && Math.min(a.r.bottom, b.r.bottom) > Math.max(a.r.top, b.r.top) + 1) issues.push(`${a.name} / ${b.name}`);
        }
        return issues;
      }, aircraft);
      if (issues.length) failed++;
      console.log(`${issues.length ? 'FAIL' : 'PASS'}  ${aircraft} ${width}x${height}: touch controls fit without overlaps ${issues.join('; ')}`);
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.__helicoptea.doAction('resume'));
  fs.mkdirSync('test-results/touch-layout', { recursive: true });
  await page.screenshot({ path: 'test-results/touch-layout/portrait.png' });
} finally { await browser.close(); }
process.exitCode = failed ? 1 : 0;
