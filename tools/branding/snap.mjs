// Renders an HTML or SVG file to a PNG with installed Chrome (transparent where the page is).
// Usage: node tools/branding/snap.mjs <in.svg|in.html> <out.png> <width> <height> [scale]
import { chromium } from '../browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [, , input, out, w, h, scale = '1'] = process.argv;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +scale });
const url = pathToFileURL(path.resolve(input)).href;
await page.goto(url);
await page.waitForLoadState('networkidle');
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: out, omitBackground: true });
await browser.close();
console.log('wrote', out);
