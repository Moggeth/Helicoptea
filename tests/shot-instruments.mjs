// Cockpit instruments, staged: node tests/shot-instruments.mjs [baseUrl] [--aircraft=micro|chinook|skycrane] [--size=1920x1080]
// Holds each aircraft (autopilot) through a few moments that exercise every instrument: drifting toward
// the mug with a bag on the hook, the bag steeping in the tea (the skycrane's snorkel in the milk crock,
// pumping), and a climbing turn. Writes the full frame and a crop of the panel at the screen's real
// pixels to test-results/instruments/, and prints what the panel read and what it cost.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4190/';
const outDir = path.resolve('test-results/instruments');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const which = process.argv.find((a) => a.startsWith('--aircraft='))?.slice(11) || 'micro';
const vp = process.argv.find((a) => a.startsWith('--size='))?.slice(7).split('x').map(Number) || [1920, 1080];
const tag = `${which}-${vp[0]}`;
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] } });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}?aircraft=${which}&view=chase`, { waitUntil: 'load' });
await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
await page.click('#start-btn');
await page.waitForFunction(() => window.__helicoptea?.started);
await page.evaluate(() => {
  const H = window.__helicoptea;
  try { H.doAction('skiphints'); } catch { /* */ }
  const ap = new H.Autopilot();
  const orig = H.input.update.bind(H.input);
  window.__pilot = { ap, on: false };
  H.input.update = (dt) => {
    const c = orig(dt);
    const P = window.__pilot;
    if (!P.on || !H.sim.heli) return c;
    const out = ap.update(H.sim.heli, null, null, dt);
    c.pitch = out.pitch; c.roll = out.roll; c.yaw = out.yaw; c.collective = out.collective;
    return c;
  };
});
await page.keyboard.press('Digit1');
await sleep(500);
const fly = (x, y, z, speed, ms) => page.evaluate(([x, y, z, speed]) => {
  const P = window.__pilot; P.on = true; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed;
}, [x, y, z, speed]).then(() => sleep(ms));
// Teleport to a spot, level and still, then hand it to the autopilot.
const place = (x, y, z) => page.evaluate(([x, y, z]) => {
  const s = window.__helicoptea.sim, h = s.heli;
  h.body.setTranslation({ x, y, z }, true); h.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
  h.body.setLinvel({ x: 0, y: 0, z: 0 }, true); h.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  h.updateCached();
  window.__pilot.on = true; window.__pilot.ap.target.set(x, y, z);
}, [x, y, z]);
// Put a free tea bag on every hook, hanging at its line length.
const hookBags = () => page.evaluate(() => {
  const s = window.__helicoptea.sim, h = s.heli;
  const free = s.bags.filter((b) => !b.retiring && !(b.attach && b.attach.kind === 'heli'));
  h.hookWorlds.forEach((hw, i) => {
    const b = free[i];
    if (!b) return;
    if (b.attach) s.detachBag(b, true);
    b.body.setTranslation({ x: hw.x, y: hw.y - 0.15 - 0.03, z: hw.z }, true);
    b.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    b.updateCached();
    s.attachBag(b, { kind: 'heli', heli: h, hook: i });
  });
  return s.carriedCargo().length;
});
const read = () => page.evaluate(() => {
  const H = window.__helicoptea, it = H.cockpit.interiors[H.sim.aircraft], P = it.panel, F = P.F, M = P.M;
  return { gsKt: +F.gsKt.toFixed(1), radFt: +F.radFt.toFixed(1), surf: F.surf, fpm: Math.round(F.fpm), pwr: Math.round(F.pwr), hover: Math.round(F.hoverPwr), hdg: Math.round(F.hdg),
    loads: M.loads.map((l) => ({ hook: l.hook, depthFt: +l.depthFt.toFixed(2), aboveFt: l.aboveFt === null ? null : +l.aboveFt.toFixed(1), steep: +l.steepT.toFixed(1) })),
    tank: M.tank ? { level: +M.tank.level.toFixed(2), sub: M.tank.submerged, doors: +M.tank.doors.toFixed(2), pump: M.tank.pumping } : null, ms: +P.ms.toFixed(3) };
});
// The panel's bounding box on screen, for a crop at real pixels.
const panelClip = () => page.evaluate(() => {
  const H = window.__helicoptea, it = H.cockpit.interiors[H.sim.aircraft], cam = H.cockpit.camera;
  const g = it.panel.group, box = new (g.position.constructor)();
  const pts = [];
  const w = it.panel.w, h = it.panel.h;
  for (const [x, y] of [[-w / 2, -h / 2], [w / 2, -h / 2], [-w / 2, h / 2], [w / 2, h / 2]]) {
    box.set(x, y, 0); g.localToWorld(box); box.project(cam);
    pts.push([(box.x * 0.5 + 0.5) * innerWidth, (-box.y * 0.5 + 0.5) * innerHeight]);
  }
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.max(0, Math.min(...xs)), y0 = Math.max(0, Math.min(...ys)), x1 = Math.min(innerWidth, Math.max(...xs)), y1 = Math.min(innerHeight, Math.max(...ys));
  return { x: Math.floor(x0), y: Math.floor(y0), width: Math.ceil(x1 - x0), height: Math.ceil(y1 - y0), full: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
});
const shot = async (name) => {
  await page.evaluate(() => { const r = window.__helicoptea.fpRig; r.recentering = false; r.lookYaw = 0; r.lookPitch = 0; });
  await sleep(250);
  await page.screenshot({ path: `${outDir}/${tag}-${name}.png` });
  const clip = await panelClip();
  if (clip.width > 10 && clip.height > 10) await page.screenshot({ path: `${outDir}/${tag}-${name}-panel.png`, clip: { x: clip.x, y: clip.y, width: clip.width, height: clip.height } });
  const r = await read();
  console.log(name, JSON.stringify(r), 'panel on screen', JSON.stringify(clip.full));
};

const layout = await page.evaluate(() => {
  const s = window.__helicoptea.sim;
  const mug = s.cups.find((c) => c.id === 'mug');
  return { mug: [mug.x, mug.waterY, mug.z], bowl: [s.milk.bowl.x, s.milk.bowl.waterY, s.milk.bowl.z], hookDrop: s.heli.pos.y - s.heli.hookWorlds[0].y };
});
const [mx, my, mz] = layout.mug;
if (which === 'skycrane') {
  const [bx, by, bz] = layout.bowl;
  // Over the crock with the snorkel down in the milk, pumping.
  await place(bx, by + 0.13, bz + 0.01);
  await sleep(800);
  await page.keyboard.down('KeyX'); await sleep(700); await page.keyboard.up('KeyX');   // snorkel down into the milk
  await sleep(700);
  await shot('1-over-crock');
  await page.keyboard.down('KeyT');
  await sleep(900);
  await shot('2-pumping');
  await page.keyboard.up('KeyT');
  await sleep(300);
  // Toward the mug, then open the doors over it.
  await fly(mx, my + 0.2, mz + 0.03, 0.25, 2600);
  await shot('3-to-mug');
  await page.keyboard.down('KeyG');
  await sleep(350);
  await shot('4-doors');
  await page.keyboard.up('KeyG');
} else {
  await place(mx + 0.05, my + 0.33, mz + 0.22);
  await sleep(500);
  const n = await hookBags();
  console.log('bags hooked', n);
  await sleep(1200);
  // Moving toward the mug: the predicted track and drift show on the map.
  await fly(mx, my + 0.33, mz, 0.15, 900);
  await shot('1-approach');
  // Settle over the mug and lower the bag in.
  await fly(mx, my + 0.33, mz, 0.15, 2200);
  const drop = layout.hookDrop + 0.151 + 0.06 - 0.025;   // line, bag, and the bag's bottom 2.5 cm under
  await fly(mx, my + drop, mz, 0.1, 3000);
  await shot('2-steeping');
  await sleep(2500);
  await shot('3-steeped');
}
// A climbing turn away: attitude, heading card, vertical speed and power above the hover bug.
await page.keyboard.down('KeyW'); await page.keyboard.down('KeyA');
await page.evaluate(() => { window.__pilot.on = false; });
await sleep(700);
await shot('5-climb-turn');
await page.keyboard.up('KeyW'); await page.keyboard.up('KeyA');
// Frame cost of the panel update (CPU) over a couple of seconds in the cockpit.
const cost = await page.evaluate(() => new Promise((res) => {
  const H = window.__helicoptea, P = H.cockpit.interiors[H.sim.aircraft].panel;
  const ms = []; const t0 = performance.now(); let n = 0;
  const f = (t) => { ms.push(P.ms); n++; if (t - t0 < 2500) requestAnimationFrame(f); else { ms.sort((a, b) => a - b); res({ fps: +(n / ((t - t0) / 1000)).toFixed(1), median: +ms[ms.length >> 1].toFixed(3), p95: +ms[Math.floor(ms.length * 0.95)].toFixed(3), max: +ms[ms.length - 1].toFixed(3) }); } };
  requestAnimationFrame(f);
}));
console.log('panel update ms', JSON.stringify(cost));
console.log(logs.filter((l) => /error|warn/i.test(l) && !/X4008/.test(l)).join('\n') || 'no errors');
await browser.close();
