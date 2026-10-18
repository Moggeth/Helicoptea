// Tea bag and string in a real browser (local Chrome via playwright-core), on all three aircraft: pick a
// bag off the stand and carry it; the drawn string runs from the knot on the bag to the hook, straight
// while it carries the bag; the tag hangs beside the string (never threaded on it) and swings when the
// aircraft jinks; dipping soaks the paper as far as it went in and stains the string that was under the
// tea; no shader or console errors; frame rate while carrying.
// Usage: npm run build && npx vite preview --port 4231, then node tests/e2e-teabag.mjs [baseUrl] [--headed]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4231/';
const outDir = path.resolve('test-results/teabag');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function open(id) {
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 } });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate((id) => {
    const H = window.__helicoptea;
    H.doAction('skiphints');
    if (id !== 'micro') H.setAircraft(id);
    const ap = new H.Autopilot();
    const orig = H.input.update.bind(H.input);
    // Steers the hook (or, with aimBag, the bag) to a target, with the same stick inputs a player makes.
    window.__P = { ap, on: true, aimBag: false, tgt: H.sim.heli.pos.clone().setY(0.4), speed: 0.3 };
    H.input.update = (dt) => {
      const c = orig(dt); const P = window.__P; const h = H.sim.heli;
      if (!P.on || !h) return c;
      const b = H.sim.carriedBag();
      const ref = P.aimBag && b ? b.pos : h.hookWorlds[0];
      ap.target.copy(P.tgt).add(h.pos).sub(ref); ap.maxSpeed = P.speed;
      return Object.assign(c, ap.update(h, b ? b.vel.clone().sub(h.vel) : null, null, dt));
    };
    H.sim.assist = true;
  }, id);
  await sleep(1500);
  return { ctx, page, logs };
}
const go = (page, x, y, z, speed, ms, aimBag = false) => page.evaluate(([x, y, z, speed, aimBag]) => { const P = window.__P; P.tgt.set(x, y, z); P.speed = speed; P.aimBag = aimBag; }, [x, y, z, speed, aimBag]).then(() => sleep(ms));

// The drawn string and tag of the carried bag, as rendered this frame.
const drawn = (page) => page.evaluate(() => {
  const H = window.__helicoptea, b = H.sim.carriedBag();
  if (!b) return null;
  const v = H.view.bags.get(b.id), pts = v.string.pts, N = b.N;
  const T = window.THREE_SHIM || v.tag.matrixWorld.constructor;
  let len = 0, sag = 0;
  const ax = pts[0], ay = pts[1], az = pts[2], ex = pts[N * 3], ey = pts[N * 3 + 1], ez = pts[N * 3 + 2];
  const cl = Math.hypot(ex - ax, ey - ay, ez - az);
  for (let i = 0; i < N; i++) len += Math.hypot(pts[i * 3 + 3] - pts[i * 3], pts[i * 3 + 4] - pts[i * 3 + 1], pts[i * 3 + 5] - pts[i * 3 + 2]);
  for (let i = 1; i < N; i++) {
    const px = pts[i * 3] - ax, py = pts[i * 3 + 1] - ay, pz = pts[i * 3 + 2] - az;
    const t = (px * (ex - ax) + py * (ey - ay) + pz * (ez - az)) / (cl * cl);
    sag = Math.max(sag, Math.hypot(px - t * (ex - ax), py - t * (ey - ay), pz - t * (ez - az)));
  }
  // Knot on the bag and the hook: where the drawn ends are.
  const knot = v.group.children[0].children.find((c) => c.geometry && c.geometry.type === 'SphereGeometry');
  const kp = knot.getWorldPosition(knot.position.clone());
  const hook = H.sim.heli.hookWorlds[b.attach.hook];
  // String points inside the tag's sheet (tag-local: 0 < x < w + gap, -h < y < 0, |z| < 1 mm).
  const pivot = v.tag.userData.pivot;
  pivot.updateMatrixWorld(true);
  const inv = pivot.matrixWorld.clone().invert();
  let through = 0;
  const p = kp.clone();
  for (let i = 0; i <= N; i++) {
    p.set(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]).applyMatrix4(inv);
    if (p.x > 0.0015 && p.x < 0.018 && p.y < -0.002 && p.y > -0.022 && Math.abs(p.z) < 0.001) through++;
  }
  return { ratio: len / b.attach.length, sag, knotGap: kp.distanceTo({ x: ax, y: ay, z: az }) - 0.0013, hookGap: Math.hypot(ex - hook.x, ey - hook.y, ez - hook.z),
    through, swing: Math.hypot(pivot.rotation.x, pivot.rotation.z), wetLine: v.look.wetLine, stain: Math.max(...v.look.stain), wet: b.wetness, imm: b.immersion };
});

try {
  for (const id of ['micro', 'chinook', 'skycrane']) {
    const { ctx, page, logs } = await open(id);
    const peg = await page.evaluate(() => { const p = window.__helicoptea.sim.pegs[1].tip; return [p.x, p.y, p.z]; });
    await go(page, peg[0], 0.4, peg[2], 0.3, 5000);
    await go(page, peg[0], peg[1] + 0.004, peg[2], 0.12, 4500);
    const got = await page.evaluate(() => window.__helicoptea.sim.toggleAttach() && !!window.__helicoptea.sim.carriedBag());
    check(`${id}: hooks a bag off the stand`, got);
    if (!got) { await ctx.close(); continue; }
    await go(page, peg[0], 0.55, peg[2], 0.1, 4000);
    await go(page, 0.0, 0.5, -0.3, 0.3, 6000);
    let worst = { ratio: 0, sag: 0, knotGap: 0, hookGap: 0, through: 0 };
    for (let i = 0; i < 12; i++) { const d = await drawn(page); for (const k in worst) worst[k] = Math.max(worst[k], d[k]); await sleep(80); }
    check(`${id}: drawn string runs knot to hook at the rope's length, straight while carrying`, worst.ratio < 1.01 && worst.sag < 0.0015 && worst.knotGap < 0.0006 && worst.hookGap < 0.0006,
      `length ×${worst.ratio.toFixed(3)}, sag ${(worst.sag * 1000).toFixed(2)} mm, knot ${(worst.knotGap * 1000).toFixed(2)} mm, hook ${(worst.hookGap * 1000).toFixed(2)} mm`);
    check(`${id}: the tag hangs beside the string, not threaded on it`, worst.through === 0, `${worst.through} string points through the tag`);
    await page.screenshot({ path: path.join(outDir, `${id}-carry.png`) });
    // A sideways jink: the tag swings, then settles.
    await page.evaluate(() => { window.__P.on = false; });
    let swing = 0;
    const jink = page.evaluate(() => new Promise((res) => { const H = window.__helicoptea; const o = H.input.update; H.input.update = (dt) => Object.assign(o(dt), { roll: 1 }); setTimeout(() => { H.input.update = o; res(); }, 350); }));
    for (let i = 0; i < 6; i++) { swing = Math.max(swing, (await drawn(page)).swing); await sleep(60); }
    await jink;
    await page.evaluate(() => { window.__P.on = true; });
    await go(page, 0.0, 0.5, -0.3, 0.3, 0);
    // The tag integrates at most 0.05 s per rendered update. A 3.5 s wall-clock sleep gives it less
    // settling time on WARP. Count the same integration clock, retaining the nominal world-speed
    // duration and the original angle assertion. Never advance the game or change the pendulum.
    await page.evaluate(() => new Promise((resolve, reject) => {
      const H = window.__helicoptea, view = H.view, original = view.update;
      let elapsed = 0;
      const timer = setTimeout(() => { view.update = original; reject(Error('Tag settling clock did not advance within 15 s')); }, 15000);
      view.update = function(alpha, dt, ...rest) {
        const result = original.call(this, alpha, dt, ...rest);
        if (dt > 0) elapsed += Math.min(Math.max(dt, 1e-4), 0.05);
        if (elapsed >= 3.5 * H.worldSpeed) { clearTimeout(timer); view.update = original; resolve(); }
        return result;
      };
    }));
    const settled = (await drawn(page)).swing;
    check(`${id}: the tag swings when the aircraft jinks, then settles`, swing > 0.05 && settled < 0.1, `swing ${swing.toFixed(2)} rad, then ${settled.toFixed(3)} rad`);
    if (id === 'micro') {
      // Half-dip into the mug: soaked as far as it went, string stained where it was under the tea.
      const mug = await page.evaluate(() => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.waterY, c.z]; });
      await go(page, mug[0], 0.42, mug[2], 0.3, 6000, true);
      await go(page, mug[0], 0.42, mug[2], 0.06, 3000, true);
      // Lower until the bag's middle is at the surface.
      await page.evaluate((wy) => { const H = window.__helicoptea, b = H.sim.carriedBag(), h = H.sim.heli; const P = window.__P; P.aimBag = true; P.tgt.y = wy + 0.002; P.speed = 0.04; }, mug[1]);
      await sleep(7000);
      const half = await drawn(page);
      check('micro: half-dipped bag is soaked part way up, not all over', half.wetLine > -0.025 && half.wetLine < 0.022 && half.wet > 0.2,
        `wet line ${(half.wetLine * 1000).toFixed(1)} mm from centre (±30 mm bag), wetness ${half.wet.toFixed(2)}, immersion ${half.imm.toFixed(2)}`);
      await page.evaluate((wy) => { const P = window.__P; P.tgt.y = wy - 0.04; }, mug[1]);
      await sleep(5000);
      await page.evaluate(() => { const P = window.__P; P.tgt.y += 0.15; P.speed = 0.08; });
      await sleep(3500);
      const full = await drawn(page);
      check('micro: a full dip soaks it to the top and stains the string that went under', full.wetLine > 0.028 && full.stain > 0.5, `wet line ${(full.wetLine * 1000).toFixed(1)} mm, string stain ${full.stain.toFixed(2)}`);
      await page.screenshot({ path: path.join(outDir, 'micro-wet.png') });
      const fps = await page.evaluate(async () => { const H = window.__helicoptea; const f0 = H.frames, t0 = performance.now(); await new Promise((r) => setTimeout(r, 2500)); return (H.frames - f0) / ((performance.now() - t0) / 1000); });
      check('micro: carrying a wet bag holds 120 fps (headless clock cap)', fps > 110, `${fps.toFixed(1)} fps`);
    }
    check(`${id}: no console errors (bag and tag shaders compiled)`, logs.length === 0, logs.slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (e) {
  check('suite ran to completion', false, e.stack);
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} tea bag browser checks passed`);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
