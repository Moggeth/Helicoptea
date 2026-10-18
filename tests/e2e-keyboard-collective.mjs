import fs from 'node:fs';
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import { springCollectiveCase } from './spring-collective-case.mjs';

const base = process.argv.find(arg => arg.startsWith('http')) || 'http://127.0.0.1:4199/';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const errors = [];
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${base}?quality=low&record=0`);
  await page.locator('#start-btn:not(.hidden)').click({ timeout: startupTimeout(60000) });
  await page.evaluate(() => window.__helicoptea.input.chooseKbPreset('battlefield'));
  const result = await springCollectiveCase(page);
  console.log(`PASS  real W input raises collective and release returns to neutral  — ${JSON.stringify(result)}`);
  if (errors.length) throw Error(errors.join('; '));
  console.log('PASS  keyboard collective case has no page errors');
  fs.mkdirSync('test-results/keyboard-collective', { recursive: true });
  fs.writeFileSync('test-results/keyboard-collective/report.json', JSON.stringify(result, null, 2));
} catch (error) {
  failed = true;
  console.log(`FAIL  independent keyboard collective case  — ${error.stack || error}`);
} finally { await browser.close(); }
process.exitCode = failed ? 1 : 0;
