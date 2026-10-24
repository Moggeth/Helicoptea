// Rotor wash on liquid, in a real browser (local Chrome via playwright-core): hovering over the mug
// presses a dimple and pounding rings into the tea, throws spray and mist, and settles once the heli
// leaves; the milk crock and the bird bath respond the same way; the surface shaders compile; and
// what it all costs per frame on desktop and on an emulated, CPU-throttled phone.
// Usage: npm run build && npx vite preview --port 4193, then node tests/e2e-rotorwash.mjs [baseUrl] [--headed]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4193/';
const outDir = path.resolve('test-results/rotorwash');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function open(query, viewport = { width: 1600, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.mobile, deviceScaleFactor: opts.dpr || 1 });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + query, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => window.__helicoptea.doAction('skiphints'));
  await page.evaluate(() => {
    const H = window.__helicoptea;
    const ap = new H.Autopilot();
    const orig = H.input.update.bind(H.input);
    window.__pilot = { ap, on: false };
    H.input.update = (dt) => {
      const c = orig(dt);
      if (!window.__pilot.on || !H.sim.heli) return c;
      Object.assign(c, ap.update(H.sim.heli, null, null, dt));
      return c;
    };
    H.sim.assist = true;
    // Time the liquid work per rendered frame: coupling, every surface's field and shader uniforms, spray.
    const L = H.view.liquid;
    window.__wash = { ms: 0, frames: 0, peak: 0, cur: 0 };
    const time = (obj, key) => { const f = obj[key].bind(obj); obj[key] = (...a) => { const t = performance.now(); const r = f(...a); window.__wash.cur += performance.now() - t; return r; }; };
    time(L, 'couple');
    time(L, 'update');
    for (const s of L.surfaces) time(s, 'update');
    const origUpdate = L.update;
    L.update = (...a) => { const r = origUpdate(...a); const W = window.__wash; W.ms += W.cur; W.frames++; W.peak = Math.max(W.peak, W.cur); W.cur = 0; return r; };
  });
  await sleep(400);
  return { ctx, page, logs };
}
// Wait for as much simulated time as `ms` of real flying (at the World weight's clock), however slowly the
// page runs: on a GPU-less CI runner the world can fall behind the wall clock. Gives up after 4x as long.
const waitSim = (page, ms) => page.evaluate((ms) => new Promise((res) => {
  const H = window.__helicoptea, t0 = H.sim.time, need = (ms / 1000) * H.worldSpeed, w0 = performance.now();
  const tick = () => (H.sim.time - t0 >= need || performance.now() - w0 > ms * 4 ? res() : setTimeout(tick, 50));
  tick();
}), ms);
// The ripple field runs on its own clock, capped at six 240 Hz substeps a frame to bound its cost, so at
// 10 fps (a GPU-less CI runner) it runs at a quarter speed: wait until it has had `ms` of its own time at
// the world's clock (it stops counting once settled and switched off). Gives up after 6x as long.
const waitField = (page, ms, which = 0) => page.evaluate(([ms, which]) => new Promise((res) => {
  const H = window.__helicoptea, f = H.view.surfaces[which].field, t0 = f.t, need = (ms / 1000) * H.worldSpeed, w0 = performance.now();
  const tick = () => ((f.t - t0 >= need) || (f.on === 0 && performance.now() - w0 > 500) || performance.now() - w0 > ms * 6 ? res() : setTimeout(tick, 50));
  tick();
}), [ms, which]);
const fly = (page, x, y, z, speed, ms) => page.evaluate(([x, y, z, speed]) => {
  const P = window.__pilot; P.on = true; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed;
}, [x, y, z, speed]).then(() => waitSim(page, ms));
const surf = (page, which) => page.evaluate((which) => {
  const H = window.__helicoptea, L = H.view.liquid;
  const s = which === 'bowl' ? H.view.milkView.bowlSurface : which === 'bath' ? H.view.birdbath : H.view.surfaces[which];
  return { forcing: s.forcing.length, I: s.forcing[0] ? +s.forcing[0].I.toFixed(2) : 0, vg: s.forcing[0] ? +s.forcing[0].vg.toFixed(2) : 0,
    on: s.field.on, live: s.field.live, depthMm: +(s.field.maxDepth * 1000).toFixed(2), washS: +s.washS.toFixed(2), fieldOn: s.material.uniforms.uFieldOn.value,
    stats: { ...L.stats }, particles: L.pool.count };
}, which);
const measure = (page, ms) => page.evaluate(async (ms) => {
  const H = window.__helicoptea, W = window.__wash;
  W.ms = 0; W.frames = 0; W.peak = 0;
  const f0 = H.frames, t0 = performance.now();
  await new Promise((r) => setTimeout(r, ms));
  const dt = (performance.now() - t0) / 1000;
  return { fps: +((H.frames - f0) / dt).toFixed(1), washMs: +(W.ms / Math.max(1, W.frames)).toFixed(3), washPeak: +W.peak.toFixed(2), calls: H.renderer.info.render.calls };
}, ms);
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

try {
  // ------------------------------------------------------------------ desktop: the mug
  const { ctx, page, logs } = await open('');
  const mug = await page.evaluate(() => { const c = window.__helicoptea.sim.cups[0]; return { x: c.x, z: c.z, top: c.topY, waterY: c.waterY }; });
  const calm = await surf(page, 0);
  check('calm tea has no wash and no field running', calm.forcing === 0 && calm.on === 0, JSON.stringify(calm));
  await fly(page, -0.56, 0.35, 0.24, 0.3, 1500);
  await fly(page, mug.x, 0.35, mug.z, 0.3, 3500);
  await fly(page, mug.x, mug.top + 0.075, mug.z, 0.12, 7000);
  await waitField(page, 3000);
  const hov = await surf(page, 0);
  check('hovering over the mug couples the wake to the tea', hov.forcing >= 1 && hov.I > 0.3, `I=${hov.I}, v_g=${hov.vg} m/s`);
  check('the wash presses a dimple and rings into the tea (height field running)', hov.on === 1 && hov.fieldOn === 1 && hov.depthMm > 0.15 && hov.depthMm < 8, `deepest ${hov.depthMm} mm`);
  check('the roughened annulus is showing (shader wash intensity)', hov.washS > 0.2, `washS ${hov.washS}`);
  check('spray and mist come off the tea', hov.stats.spray > 20 && hov.stats.mist > 5 && hov.particles > 5, `spray ${hov.stats.spray}, mist ${hov.stats.mist}, live particles ${hov.particles}`);
  check('some spray falls back in (rings) and some clears the rim', hov.stats.landedInLiquid > 0 && hov.stats.landed > hov.stats.landedInLiquid, `landed ${hov.stats.landed}, in tea ${hov.stats.landedInLiquid}`);
  await shot(page, 'mug-hover');
  const perfHi = await measure(page, 3000);
  check('desktop hover over the tea holds frame rate', perfHi.fps > 55, `${perfHi.fps} fps, liquid work ${perfHi.washMs} ms/frame (peak ${perfHi.washPeak}), ${perfHi.calls} draw calls`);
  await page.evaluate(() => window.__helicoptea.setView('cockpit'));
  await sleep(600);
  await shot(page, 'mug-hover-cockpit');
  await page.evaluate(() => window.__helicoptea.setView('chase'));

  // Climb away: the wash stops and the tea settles back to a still surface.
  await fly(page, mug.x + 0.35, 0.45, mug.z + 0.1, 0.4, 0);
  await waitSim(page, 9000);
  await waitField(page, 9000);
  const away = await surf(page, 0);
  check('climbing away releases the tea and it settles flat', away.forcing === 0 && away.on === 0 && away.washS < 0.05, JSON.stringify({ on: away.on, washS: away.washS }));

  // ------------------------------------------------------------------ the milk crock
  const bowl = await page.evaluate(() => { const b = window.__helicoptea.sim.milk.bowl; return { x: b.x, z: b.z, top: b.topY }; });
  await fly(page, bowl.x, 0.35, bowl.z, 0.3, 3500);
  await fly(page, bowl.x, bowl.top + 0.075, bowl.z, 0.12, 6000);
  const milk = await surf(page, 'bowl');
  check('the milk crock ripples and sprays under the wash', milk.forcing >= 1 && milk.on === 1 && milk.depthMm > 0.1, `I=${milk.I}, deepest ${milk.depthMm} mm`);
  await shot(page, 'milk-hover');

  // ------------------------------------------------------------------ the bird bath (garden)
  const bath = await page.evaluate(() => { const B = window.__helicoptea.view.birdbath.cup; return { x: B.x, z: B.z, y: B.waterY }; });
  await page.evaluate(([x, y, z]) => {
    const s = window.__helicoptea.sim; s.heli.body.setTranslation({ x, y, z }, true); s.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const P = window.__pilot; P.ap.target.set(x, y, z); P.ap.maxSpeed = 0.1;
  }, [bath.x + 0.05, bath.y + 0.12, bath.z]);
  await sleep(3500);
  const bb = await surf(page, 'bath');
  check('the bird bath water ripples under the wash', bb.forcing >= 1 && bb.on === 1 && bb.depthMm > 0.1, `I=${bb.I}, deepest ${bb.depthMm} mm`);
  await shot(page, 'birdbath-hover');
  // ------------------------------------------------------------------ the cups' extras: slop, crowns, spots
  check('a hard wash slops tea over the rim and splashes crowns', hov.stats.slop > 3 && hov.stats.crowns > 0, `slop ${hov.stats.slop}, crowns ${hov.stats.crowns}`);
  check('spray landing on the cloth and table leaves wet spots', hov.stats.spots > 0, `spots ${hov.stats.spots}`);

  // ------------------------------------------------------------------ open water outdoors
  const outdoor = async (name, x, z) => {
    const y = await page.evaluate(([x, z]) => window.__helicoptea.view.liquid.waterAt(x, z), [x, z]);
    await page.evaluate(([x, y, z]) => {
      const s = window.__helicoptea.sim; s.heli.body.setTranslation({ x, y, z }, true); s.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      const P = window.__pilot; P.ap.target.set(x, y, z); P.ap.maxSpeed = 0.1;
    }, [x + 0.03, y + 0.13, z]);
    await sleep(3500);
    const r = await page.evaluate(() => {
      const L = window.__helicoptea.view.liquid, W = L.open;
      return { forcing: W.forcing.length, on: W.on, depthMm: +(W.field.maxDepth * 1000).toFixed(2), washS: +W.washS.toFixed(2), openSpray: L.stats.openSpray, mist: L.stats.mist, particles: L.pool.count };
    });
    check(`${name}: the wash ripples, roughens and sprays the water`, Number.isFinite(y) && r.forcing >= 1 && r.on === 1 && r.depthMm > 0.1 && r.washS > 0.2 && r.openSpray > 20, `y ${Number(y).toFixed(3)}, ${JSON.stringify(r)}`);
    await shot(page, `open-${name.replace(/\W+/g, '-')}`);
    return r;
  };
  await outdoor('patio puddle', 1.78, -2.08);
  await outdoor('lane puddle', -1.6, -7.1);
  await outdoor('koi pond', -8.72, -2.22);
  await outdoor('park pond', -9, -39);
  const perfOpen = await measure(page, 3000);
  check('desktop hover over the park pond holds frame rate', perfOpen.fps > 55, `${perfOpen.fps} fps, liquid work ${perfOpen.washMs} ms/frame (peak ${perfOpen.washPeak})`);
  check('no console errors (surface shaders compiled)', logs.length === 0, logs.slice(0, 3).join(' | '));
  await ctx.close();

  // ------------------------------------------------------------------ phone: emulated, CPU throttled
  const ph = await open('?quality=medium', { width: 844, height: 390 }, { touch: true, mobile: true, dpr: 3 });
  const cdp = await ph.ctx.newCDPSession(ph.page);
  const mugP = await ph.page.evaluate(() => { const c = window.__helicoptea.sim.cups[0]; return { x: c.x, z: c.z, top: c.topY }; });
  await fly(ph.page, mugP.x, 0.35, mugP.z, 0.3, 5000);
  await fly(ph.page, mugP.x, mugP.top + 0.075, mugP.z, 0.12, 3500);
  await waitField(ph.page, 2000);
  const phs = await surf(ph.page, 0);
  const perfPh1 = await measure(ph.page, 3000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const perfPh4 = await measure(ph.page, 4000);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await shot(ph.page, 'phone-mug-hover');
  check('phone (emulated) hover over tea: wash running', phs.forcing >= 1 && phs.on === 1, `I=${phs.I}`);
  // Absolute fps at ×4 is the whole game's cost (and noisy around 30 on this machine); the bar here is
  // that the liquid work stays a small slice of a 30 fps frame.
  check('phone (emulated, CPU ×4): liquid work stays under 2.5 ms a frame', perfPh4.washMs < 2.5,
    `×1: ${perfPh1.fps} fps, liquid ${perfPh1.washMs} ms/frame; ×4: ${perfPh4.fps} fps, liquid ${perfPh4.washMs} ms/frame (peak ${perfPh4.washPeak})`);
  // Out to a puddle on the patio: the water's wash shader (on the phones' Phong stand-in) was built while
  // loading, so nothing compiles mid-flight.
  const progs0 = await ph.page.evaluate(() => window.__helicoptea.renderer.info.programs.length);
  const py = await ph.page.evaluate(() => window.__helicoptea.view.liquid.waterAt(1.78, -2.08));
  await ph.page.evaluate(([x, y, z]) => {
    const s = window.__helicoptea.sim; s.heli.body.setTranslation({ x, y, z }, true); s.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    const P = window.__pilot; P.ap.target.set(x, y, z); P.ap.maxSpeed = 0.1;
  }, [1.81, py + 0.13, -2.08]);
  await sleep(3500);
  const phOpen = await ph.page.evaluate(() => { const L = window.__helicoptea.view.liquid; return { on: L.open.on, forcing: L.open.forcing.length, programs: window.__helicoptea.renderer.info.programs.length }; });
  await shot(ph.page, 'phone-patio-puddle');
  check('phone: the patio puddle washes, with no shader compiled mid-flight', phOpen.on === 1 && phOpen.forcing >= 1 && phOpen.programs === progs0, `${JSON.stringify(phOpen)}, programs before ${progs0}`);
  check('phone: no console errors', ph.logs.length === 0, ph.logs.slice(0, 3).join(' | '));
  await ph.ctx.close();
} catch (e) {
  check('suite ran to completion', false, e.stack);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} rotor-wash checks passed`);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
