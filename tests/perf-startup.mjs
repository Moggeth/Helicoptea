import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4207/';
const label = process.argv.find((a) => a.startsWith('--label='))?.slice(8) || 'current';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const results = [];
try {
  for (let i = 0; i < 3; i++) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(); const start = performance.now();
    await page.goto(`${base}?quality=low&record=0`);
    await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
    const readyMs = performance.now() - start;
    results.push(await page.evaluate((readyMs) => {
      const H = window.__helicoptea; let meshes = 0;
      H.cockpit.scene.traverse((o) => { if (o.isMesh) meshes++; });
      return { readyMs, cockpitMeshes: meshes, interiors: Object.keys(H.cockpit.interiors), programs: H.renderer.info.programs.length, heap: performance.memory?.usedJSHeapSize };
    }, readyMs));
    await context.close();
  }
} finally { await browser.close(); }
fs.mkdirSync('test-results/startup', { recursive: true });
fs.writeFileSync(`test-results/startup/${label}.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));
