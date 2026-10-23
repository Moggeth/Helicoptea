// Level-of-detail screenshots and a pop meter for the grass and the neighbourhood's props.
//   node tests/shot-lod.mjs [baseUrl] [--out=dir] [--only=name,name] [--quality=high] [--size=1600x900] [--dolly=0]
// Stills: each aircraft hovering in the garden and over a neighbour's lawn, in chase and cockpit views.
// Dollies: the camera backs away from a spot in small steps; the mean change between consecutive frames is
// written out per step, so anything that pops in or out shows as a spike over its neighbours.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4178/';
const outDir = path.resolve(arg('out') || 'test-results/lod');
fs.mkdirSync(outDir, { recursive: true });
const only = arg('only')?.split(',');
const quality = arg('quality') || 'high';
const vp = arg('size')?.split('x').map(Number) || [1600, 900];
const doDolly = arg('dolly') !== '0';
const G = -0.76; // garden and neighbourhood lawns

// name: aircraft, view, hover point [x, y, z], heading
const STILLS = {
  'micro-chase-garden': ['micro', 'chase', [0.4, G + 0.35, -3.6], 0],
  'micro-cockpit-garden': ['micro', 'cockpit', [0.4, G + 0.25, -3.6], 0],
  'micro-chase-lawn': ['micro', 'chase', [-8.5, G + 0.35, -1.5], Math.PI / 2],
  'micro-cockpit-lawn': ['micro', 'cockpit', [-8.5, G + 0.25, -1.5], Math.PI / 2],
  'chinook-chase-garden': ['chinook', 'chase', [0.4, G + 2.2, -4.2], 0],
  'chinook-cockpit-garden': ['chinook', 'cockpit', [0.4, G + 2.0, -4.2], 0],
  'chinook-chase-lawn': ['chinook', 'chase', [-8.5, G + 1.6, -1.5], Math.PI / 2],
  'chinook-cockpit-lawn': ['chinook', 'cockpit', [-8.5, G + 1.4, -1.5], Math.PI / 2],
  'chinook-chase-high': ['chinook', 'chase', [-2, G + 6, -8], Math.PI],
};
// name: from [x, y, z], look [x, y, z], direction to back away [x, y, z] per step, steps
const DOLLIES = {
  'dolly-garden': [[0.4, G + 0.25, -4.6], [0.4, G, -6.0], [0, 0.012, 0.09], 60],
  'dolly-lawn': [[-7, G + 0.4, -4.5], [-7, G, 0.5], [0, 0.15, -0.02], 60],
  'dolly-street': [[10, G + 1.4, 20], [19, G + 0.4, 20], [-0.45, 0.01, 0], 64],
};

const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const logs = [];

async function open(q) {
  const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
  const page = await ctx.newPage();
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}?record=0&dynres=0&quality=${quality}&fs=0${q}`, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => { try { window.__helicoptea.doAction('skiphints'); } catch { /* */ } });
  await page.addStyleTag({ content: '#hud, .hud, #touch, .hint, #hints, #toast, .toast { display: none !important; }' });
  return { ctx, page };
}

for (const [name, [ac, view, at, yaw]] of Object.entries(STILLS)) {
  if (only && !only.includes(name)) continue;
  const { ctx, page } = await open(`&aircraft=${ac}&view=${view}`);
  await page.evaluate(([at, yaw]) => {
    const H = window.__helicoptea, h = H.sim.heli, T = H.THREE;
    const ap = new H.Autopilot();
    ap.target.set(at[0], at[1], at[2]); ap.yaw = yaw; ap.maxSpeed = 0.5;
    const orig = H.input.update.bind(H.input);
    H.input.update = (dt) => { const c = orig(dt); return H.sim.heli ? Object.assign(c, ap.update(H.sim.heli, null, null, dt)) : c; };
    H.sim.assist = true;
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    h.body.setTranslation({ x: at[0], y: at[1] + 0.3, z: at[2] }, true); h.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    h.body.setLinvel({ x: 0, y: 0, z: 0 }, true); h.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    h.updateCached(); h.track.capture(h.body); h.track.capture(h.body);
    h.rotorSpeed = 1;
    H.camRig.recenter(yaw);
  }, [at, yaw]);
  await sleep(4500);
  await page.screenshot({ path: `${outDir}/${name}.png` });
  await ctx.close();
}

if (doDolly) {
  for (const [name, [from, look, step, n]] of Object.entries(DOLLIES)) {
    if (only && !only.includes(name)) continue;
    const { ctx, page } = await open('&aircraft=micro&view=chase');
    // Park the aircraft out of the way and pin the camera.
    await page.evaluate(() => { const f = window.__helicoptea.freeCam; f.on = true; });
    const diffs = [];
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const p = from.map((v, k) => v + step[k] * i), l = look.map((v, k) => v + step[k] * i * 0.5);
      // The dense grass gathers round the camera and what it looks at, as it does round the aircraft in flight.
      await page.evaluate(([p, l]) => { const H = window.__helicoptea, f = H.freeCam; f.pos.set(p[0], p[1], p[2]); f.look.set(l[0], l[1], l[2]); const v = new H.THREE.Vector3(l[0], l[1], l[2]); H.view.focusPoint = () => v; }, [p, l]);
      await sleep(i === 0 ? 1500 : 260);
      // Mean absolute change between consecutive frames (downsampled in the page).
      const px = await page.evaluate(async () => {
        const c = document.querySelector('canvas');
        const bmp = await new Promise((r) => requestAnimationFrame(() => r(createImageBitmap(c, { resizeWidth: 320, resizeHeight: 180 }))));
        const o = new OffscreenCanvas(320, 180), g = o.getContext('2d');
        g.drawImage(bmp, 0, 0);
        return Array.from(g.getImageData(0, 0, 320, 180).data);
      });
      if (prev) { let s = 0; for (let k = 0; k < px.length; k += 4) s += Math.abs(px[k] - prev[k]) + Math.abs(px[k + 1] - prev[k + 1]) + Math.abs(px[k + 2] - prev[k + 2]); diffs.push(+(s / (px.length / 4) / 3).toFixed(2)); }
      prev = px;
      if (i % 5 === 0) await page.screenshot({ path: `${outDir}/${name}-${String(i).padStart(2, '0')}.png` });
    }
    // A pop: a step whose change is well above the median of the steps round it.
    const pops = [];
    for (let i = 0; i < diffs.length; i++) {
      const win = diffs.slice(Math.max(0, i - 4), i + 5).filter((_, k, a) => k !== Math.min(i, 4)).sort((a, b) => a - b);
      const med = win[win.length >> 1];
      if (diffs[i] > med * 1.8 + 0.6) pops.push({ step: i + 1, diff: diffs[i], median: med });
    }
    fs.writeFileSync(`${outDir}/${name}.json`, JSON.stringify({ diffs, pops }, null, 1));
    console.log(name, 'pops:', pops.length ? pops.map((p) => `${p.step}(${p.diff}/${p.median})`).join(' ') : 'none', '| mean', (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(2));
    await ctx.close();
  }
}
console.log(logs.filter((l) => /error|warn/i.test(l)).slice(0, 20).join('\n') || 'no errors');
await browser.close();
