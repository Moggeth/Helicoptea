// Builds the Steam library artwork and the web icons from the in-game renders and the vector sources.
//   renders:  assets/branding/renders/*.png   (made by tools/branding/stage.mjs)
//   sources:  assets/branding/src/logo.svg, icon.svg
//   outputs:  assets/branding/steam/*, public/ icons
// Usage: node tools/branding/build.mjs
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve('.');
const R = (p) => pathToFileURL(path.join(root, p)).href;
const steamDir = path.join(root, 'assets/branding/steam');
const pubDir = path.join(root, 'public');
fs.mkdirSync(steamDir, { recursive: true });
fs.mkdirSync(pubDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath: CHROME, args: ['--allow-file-access-from-files'] });

// Warm late-afternoon grade over the raw render: a touch of sepia and contrast, sunlight from the
// garden side, and a soft vignette. `scrim` darkens where a logo sits so it stays legible.
const graded = (img, { light = '78% 18%', scrim = '' } = {}) => `
  <div class="art">
    <img src="${R(img)}">
    <div class="sun" style="background: radial-gradient(ellipse 70% 90% at ${light}, rgba(255,196,120,0.38), rgba(255,170,90,0) 70%)"></div>
    <div class="warm"></div>
    ${scrim ? `<div class="scrim" style="background:${scrim}"></div>` : ''}
    <div class="vig"></div>
  </div>`;
const css = `
  html,body{margin:0;background:transparent;overflow:hidden}
  .art{position:absolute;inset:0;overflow:hidden}
  .art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(1.1) contrast(1.06) sepia(0.14) brightness(1.03)}
  .art div{position:absolute;inset:0}
  .sun{mix-blend-mode:soft-light}
  .warm{background:linear-gradient(180deg,rgba(255,214,160,0.10),rgba(120,60,20,0.12));mix-blend-mode:multiply}
  .vig{background:radial-gradient(ellipse 85% 85% at 55% 45%, rgba(0,0,0,0) 55%, rgba(30,14,6,0.42) 100%)}
  .logo{position:absolute;display:block}
`;

async function snap(html, out, w, h, { transparent = false } = {}) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const file = path.join(steamDir, '.tmp.html');
  fs.writeFileSync(file, `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${html}</body></html>`);
  await page.goto(pathToFileURL(file).href);
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map((i) => i.decode().catch(() => {}))); });
  await page.screenshot({ path: out, omitBackground: transparent });
  await page.close();
  fs.unlinkSync(file);
  console.log('wrote', path.relative(root, out));
}

// SVG -> PNG at a size, optionally trimmed to its opaque bounds (plus padding). Returns a PNG buffer.
async function rasterSvg(svg, w, h, { trim = 0 } = {}) {
  const page = await browser.newPage({ viewport: { width: 64, height: 64 } });
  await page.goto(R(svg));
  const data = await page.evaluate(async ([w, h, trim]) => {
    const img = new Image(); img.src = location.href; await img.decode();
    const canvas = () => document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas'); // this is an SVG document
    let c = canvas(); c.width = w; c.height = h;
    let g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
    if (trim) {
      const d = g.getImageData(0, 0, w, h).data;
      let x0 = w, y0 = h, x1 = 0, y1 = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      x0 = Math.max(0, x0 - trim); y0 = Math.max(0, y0 - trim); x1 = Math.min(w - 1, x1 + trim); y1 = Math.min(h - 1, y1 + trim);
      const t = canvas(); t.width = x1 - x0 + 1; t.height = y1 - y0 + 1;
      t.getContext('2d').drawImage(c, -x0, -y0); c = t;
    }
    return c.toDataURL('image/png');
  }, [w, h, trim]);
  await page.close();
  return Buffer.from(data.split(',')[1], 'base64');
}

// ICO with PNG-compressed entries (Windows Vista+ and Steam read these).
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(({ size, buf }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(buf.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += buf.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.buf)]);
}

// ---------------------------------------------------------------- logo (transparent, trimmed)
const logoPng = await rasterSvg('assets/branding/src/logo.svg', 1280, 560, { trim: 16 });
fs.writeFileSync(path.join(steamDir, 'logo.png'), logoPng);
console.log('wrote assets/branding/steam/logo.png');
const logoUrl = R('assets/branding/steam/logo.png');

// ---------------------------------------------------------------- hero (no logo: Steam draws the logo over it)
await snap(graded('assets/branding/renders/hero.png', { light: '72% 10%' }), path.join(steamDir, 'hero.png'), 3840, 1240);

// ---------------------------------------------------------------- portrait capsule 600x900, logo on top
await snap(graded('assets/branding/renders/portrait.png', { light: '70% 30%', scrim: 'linear-gradient(180deg, rgba(25,12,5,0.55), rgba(25,12,5,0) 34%)' })
  + `<img class="logo" src="${logoUrl}" style="left:30px;top:22px;width:540px">`, path.join(steamDir, 'portrait.png'), 600, 900);

// ---------------------------------------------------------------- wide capsule 920x430, logo on the left
await snap(graded('assets/branding/renders/wide.png', { light: '78% 12%', scrim: 'linear-gradient(90deg, rgba(25,12,5,0.55), rgba(25,12,5,0) 55%)' })
  + `<img class="logo" src="${logoUrl}" style="left:22px;top:150px;width:470px">`, path.join(steamDir, 'wide.png'), 920, 430);

// ---------------------------------------------------------------- icons
const sizes = [16, 24, 32, 48, 64, 128, 180, 192, 256, 512];
const icons = {};
for (const s of sizes) icons[s] = await rasterSvg('assets/branding/src/icon.svg', s, s);
fs.writeFileSync(path.join(steamDir, 'icon.png'), icons[256]);
fs.writeFileSync(path.join(steamDir, 'icon.ico'), ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, buf: icons[size] }))));
console.log('wrote assets/branding/steam/icon.png, icon.ico');
fs.writeFileSync(path.join(pubDir, 'favicon.ico'), ico([16, 32, 48].map((size) => ({ size, buf: icons[size] }))));
fs.writeFileSync(path.join(pubDir, 'icon-192.png'), icons[192]);
fs.writeFileSync(path.join(pubDir, 'icon-512.png'), icons[512]);
fs.writeFileSync(path.join(pubDir, 'apple-touch-icon.png'), icons[180]);
fs.copyFileSync(path.join(root, 'assets/branding/src/icon.svg'), path.join(pubDir, 'icon.svg'));
console.log('wrote public/ favicon.ico, icon.svg, icon-192/512.png, apple-touch-icon.png');

await browser.close();
