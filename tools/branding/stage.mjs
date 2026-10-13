// Stages a branding scene in the real game and renders frozen stills from scripted cameras.
// The helicopter is flown by the in-game autopilot (same control path as a player): it hooks a
// tea bag, dips it in the mug so the tea brews, then lifts it to dangle over the steaming cup.
// The simulation is then frozen and each shot renders from its own camera at its own size.
//
// Usage: start the branding dev server (node node_modules/vite/bin/vite.js --config tools/branding/vite.config.js)
//        node tools/branding/stage.mjs [shotsFile.json] [outDir]
// A shot is { name, w, h, pos: [x,y,z], look: [x,y,z], fov, steam } in metres, table top at y = 0.
// pos/look may also be { rel: 'heli'|'bag'|'mug', off: [x,y,z] }.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const shotsFile = process.argv[2] || 'tools/branding/shots.json';
const outDir = path.resolve(process.argv[3] || 'assets/branding/renders');
const base = process.env.BRANDING_URL || 'http://localhost:5190/';
fs.mkdirSync(outDir, { recursive: true });
const spec = JSON.parse(fs.readFileSync(shotsFile, 'utf8'));
const shots = Array.isArray(spec) ? spec : spec.shots;
const look = (Array.isArray(spec) ? null : spec.look) || {};
const heading = parseFloat(process.env.HEADING ?? spec.heading ?? 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
await page.goto(`${base}?worldSpeed=1&quality=high`, { waitUntil: 'load' });
await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
await page.evaluate(() => { localStorage.setItem('helicoptea.aircraft', 'micro'); });
await page.click('#start-btn');
await page.waitForFunction(() => window.__helicoptea?.started);
await sleep(600);

// Autopilot on the real input pipeline (as in tests/e2e.mjs).
await page.evaluate(() => {
  const H = window.__helicoptea;
  const ap = new H.Autopilot();
  const orig = H.input.update.bind(H.input);
  window.__pilot = { ap, on: false, aimBag: false };
  H.input.update = (dt) => {
    const c = orig(dt);
    const P = window.__pilot;
    if (!P.on || !H.sim.heli) return c;
    const b = H.sim.carriedBag();
    Object.assign(c, ap.update(H.sim.heli, b ? b.vel.clone().sub(H.sim.heli.vel) : null, P.aimBag && b ? b.pos : null, dt));
    return c;
  };
  H.sim.assist = true;
  H.doAction('skiphints');
});
const fly = (x, y, z, speed, ms, aimBag = false) => page.evaluate(([x, y, z, speed, aimBag]) => {
  const P = window.__pilot; P.on = true; P.aimBag = aimBag; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed;
}, [x, y, z, speed, aimBag]).then(() => sleep(ms));

const peg = await page.evaluate(() => { const p = window.__helicoptea.sim.pegs[1].tip; return [p.x, p.y, p.z]; });
await fly(-0.56, 0.42, 0.24, 0.3, 1800);
await fly(peg[0], 0.42, peg[2] + 0.004, 0.3, 4000);
await fly(peg[0], peg[1] + 0.054, peg[2] + 0.004, 0.12, 3000);
await page.keyboard.press('Space');
await sleep(150);
if (!(await page.evaluate(() => !!window.__helicoptea.sim.carriedBag()))) throw new Error('failed to hook a bag');
await fly(peg[0], 0.45, peg[2] + 0.03, 0.15, 2500);
const mug = await page.evaluate(() => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.z, c.waterY]; });
await fly(mug[0], 0.42, mug[1], 0.3, 2500);
await fly(mug[0], 0.4, mug[1], 0.3, 4500);
await fly(mug[0], 0.3, mug[1], 0.1, 4000, true);
await page.evaluate(([mx, mz, wy]) => {
  const H = window.__helicoptea; const b = H.sim.carriedBag(); const h = H.sim.heli;
  window.__pilot.aimBag = false;
  window.__pilot.ap.target.set(mx + h.pos.x - b.pos.x, wy - 0.02 + 0.06 + 0.15 + 0.046, mz + h.pos.z - b.pos.z);
  window.__pilot.ap.maxSpeed = 0.05;
}, mug);
await sleep(9000);
// Lift so the brewed, dripping bag dangles a little above the tea.
const liftY = parseFloat(process.env.LIFT_Y || '0.44');
await page.evaluate((h) => { window.__pilot.ap.yaw = h; }, heading);
await fly(mug[0], liftY, mug[1], 0.08, 4500, true);

const state = await page.evaluate(() => {
  const H = window.__helicoptea; const h = H.sim.heli; const b = H.sim.carriedBag(); const c = H.sim.cups[0];
  return { heli: h.pos.toArray(), heading: h.heading(), bag: b ? b.pos.toArray() : null, mug: [c.x, c.waterY, c.z], brew: c.brew, wet: b?.wetness };
});
console.log('staged', JSON.stringify(state));

// Freeze the world: no more physics steps, the HUD hidden, the camera under script control.
await page.evaluate(() => {
  const H = window.__helicoptea;
  H.sim.step = () => {};
  document.getElementById('hud').style.display = 'none';
  document.getElementById('touch').style.display = 'none';
  window.__shotCam = null;
  // Fuller, brighter steam than the game's subtle wisps, from the same particle system.
  window.__steam = 0;
  // In a still, steam reads better curling up than flattened by the downwash: keep a trace of it.
  window.__wash = 0;
  const air = H.sim.air;
  H.view.windFn = (x, y, z, o) => { air.sample(x, y, z, o); const k = window.__wash; o.x *= k; o.y *= k; o.z *= k; return o; };
  const origView = H.view.update.bind(H.view);
  H.view.update = (alpha, dt, cam) => {
    origView(alpha, dt, cam);
    const c = H.sim.cups[0], rate = window.__steam * dt * 60;
    const n = Math.floor(rate) + (Math.random() < rate % 1 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * c.rIn * 0.6;
      H.view.smoke.emit({ p: [c.x + Math.cos(a) * r, c.waterY + 0.004, c.z + Math.sin(a) * r], v: [(Math.random() - 0.5) * 0.012, 0.03 + Math.random() * 0.025, (Math.random() - 0.5) * 0.012], life: 2.4 + Math.random() * 1.4,
        size0: 0.014, size1: 0.05 + Math.random() * 0.04, col0: [1, 0.97, 0.92], alpha: window.__steamAlpha ?? 0.2, drag: 0.25 });
    }
  };
  const origUpdate = H.camRig.update.bind(H.camRig);
  H.camRig.update = (...a) => {
    const s = window.__shotCam;
    if (!s) return origUpdate(...a);
    const cam = H.camRig.camera;
    cam.position.set(...s.pos);
    cam.up.set(0, 1, 0);
    cam.lookAt(...s.look);
    if (s.roll) cam.rotateZ(s.roll);
    if (cam.fov !== s.fov) { cam.fov = s.fov; cam.updateProjectionMatrix(); }
  };
});

// Art direction: a warmer, late-afternoon grade of the same kitchen lights.
await page.evaluate((L) => {
  const H = window.__helicoptea;
  const lights = [];
  H.view.scene.traverse((o) => { if (o.isLight) lights.push(o); });
  for (const o of lights) {
    if (o.isDirectionalLight && L.sunColor) o.color.set(L.sunColor);
    if (o.isDirectionalLight && L.sunI != null) o.intensity = L.sunI;
    if (o.isPointLight && L.lampI != null) o.intensity = L.lampI;
    if (o.isPointLight && L.lampDist != null) o.distance = L.lampDist;
    if (o.isHemisphereLight && L.hemiI != null) o.intensity = L.hemiI;
  }
  const sun = lights.find((o) => o.isDirectionalLight);
  if (L.sunPos && sun) sun.position.set(...L.sunPos);
  if (L.envI != null) H.view.scene.environmentIntensity = L.envI;
  if (L.exposure != null) H.renderer.toneMappingExposure = L.exposure;
  return lights.length;
}, look).then((n) => console.log('lights', n));

const resolve = (v) => {
  if (Array.isArray(v)) return v;
  const o = v.rel === 'heli' ? state.heli : v.rel === 'bag' ? state.bag : state.mug;
  return o.map((x, i) => x + (v.off?.[i] || 0));
};

for (const s of shots) {
  if (process.env.ONLY && !process.env.ONLY.split(',').includes(s.name)) continue;
  await page.setViewportSize({ width: s.w, height: s.h }); // the game's own resize handler follows
  await page.evaluate(([pos, look, fov, steam, wash, alpha, hide]) => {
    window.__shotCam = { pos, look, fov };
    window.__wash = wash;
    // Optionally hide a foreground prop (by its mesh centre on the table) that would block the shot.
    const H0 = window.__helicoptea, v = new H0.camRig.camera.position.constructor();
    H0.view.scene.traverse((o) => { if (!o.isMesh) return; if (o.userData.__hidden) { o.visible = true; delete o.userData.__hidden; }
      if (!hide) return; o.getWorldPosition(v); if (Math.hypot(v.x - hide[0], v.z - hide[1]) < hide[2] && v.y > -0.05 && v.y < 0.3) { o.visible = false; o.userData.__hidden = true; } });
    window.__steamAlpha = alpha;
    window.__steam = steam;
    const H = window.__helicoptea;
    if (H.paused) H.doAction('resume'); // a viewport change can blur the page, which pauses the game
  }, [resolve(s.pos), resolve(s.look), s.fov || 40, s.steam ?? 2, s.wash ?? 0, s.steamAlpha ?? 0.3, s.hide || null]);
  await sleep(s.settle || 4000); // let steam build up around the frozen scene
  const shotPath = path.join(outDir, `${s.name}.png`);
  // Undo any dynamic-resolution drop while the big frame rendered, then capture.
  await page.evaluate(async () => {
    const H = window.__helicoptea;
    H.renderer.setPixelRatio(1); H.renderer.setSize(innerWidth, innerHeight, false); H.post.setSize(innerWidth, innerHeight);
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
  });
  const { paused, smoke, frames } = await page.evaluate(() => ({ paused: window.__helicoptea.paused, smoke: (() => { const sm = window.__helicoptea.view.smoke; const out = []; for (let i = 0; i < sm.count; i += 40) out.push([sm.p[i*3], sm.p[i*3+1], sm.p[i*3+2], sm.s[i], sm.c[i*4+3]].map((x) => +x.toFixed(3))); return out; })(), frames: window.__helicoptea.frames }));
  if (process.env.DEBUG) console.log(s.name, { smoke, frames });
  if (paused) console.log('warning: game paused during', s.name);
  await page.screenshot({ path: shotPath });
  console.log('wrote', shotPath);
}
const errs = logs.filter((l) => /pageerror|\[error\]/.test(l));
if (errs.length) console.log(errs.slice(0, 5).join('\n'));
await browser.close();
