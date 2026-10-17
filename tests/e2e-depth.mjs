// Depth-cue checks in a real browser (local Chrome via playwright-core): load shadows on the table and
// the tea, the plumb line and height readout, the rim glint over a cup, the lower chase camera, the
// pause-menu toggles (and that they persist), on all three aircraft in chase and cockpit views.
// Usage: npm run build && npx vite preview --port 4192, then node tests/e2e-depth.mjs [baseUrl] [--headed]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4192/';
const outDir = path.resolve('test-results/depth');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function open(query, viewport = { width: 1600, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
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
  });
  await sleep(400);
  return { ctx, page, logs };
}
const fly = (page, x, y, z, speed, ms, aimBag = false) => page.evaluate(([x, y, z, speed, aimBag]) => {
  const P = window.__pilot; P.on = true; P.aimBag = aimBag; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed;
}, [x, y, z, speed, aimBag]).then(() => sleep(ms));
// Put the lowest load (or the heli, with none) over a point at a given height above it.
const hoverLoad = (page, x, z, above, ms) => page.evaluate(([x, z, above]) => {
  const H = window.__helicoptea; const h = H.sim.heli; const L = H.depth.lowest;
  const P = window.__pilot; P.on = true; P.aimBag = false; P.ap.maxSpeed = 0.06;
  const dy = L ? h.pos.y - L.y : 0, dx = L ? h.pos.x - L.x : 0, dz = L ? h.pos.z - L.z : 0;
  const c = H.sim.cups.find((c) => Math.hypot(c.x - x, c.z - z) < 0.02);
  P.ap.target.set(x + dx * 0.6, (c ? c.topY : 0) + above + dy, z + dz * 0.6);
}, [x, z, above]).then(() => sleep(ms));
const cues = (page) => page.evaluate(() => {
  const D = window.__helicoptea.depth;
  return { shadows: D.shadows.filter((m) => m.visible).length, shadowOp: D.shadows[0].material.uniforms.uOpacity.value, shadowCore: D.shadows[0].material.uniforms.uCore.value,
    shadowY: D.shadows[0].position.y, clip: D.shadows[0].material.uniforms.uClip.value.z, plumb: D.line.visible, read: D.readout && D.readout.text,
    readEl: !document.querySelector('.plumb-read')?.classList.contains('hidden'), ring: D.ring.visible ? +D.ring.material.opacity.toFixed(2) : 0,
    lowest: D.lowest && { y: D.lowest.y, x: D.lowest.x, z: D.lowest.z }, elev: window.__helicoptea.camRig.elev, settings: { ...D.settings } };
});
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const setCue = (page, k, on) => page.evaluate(([k, on]) => { window.__helicoptea.doAction('pause'); const el = document.querySelector(`[data-cue=${k}]`); if (el.checked !== on) el.click(); window.__helicoptea.doAction('resume'); }, [k, on]);

async function hookAndCarry(page) {
  const peg = await page.evaluate(() => { const p = window.__helicoptea.sim.pegs[1].tip; return [p.x, p.y, p.z]; });
  await fly(page, -0.56, 0.42, 0.24, 0.3, 1500);
  await fly(page, peg[0], 0.42, peg[2] + 0.004, 0.3, 3500);
  await fly(page, peg[0], peg[1] + 0.054, peg[2] + 0.004, 0.12, 3000);
  await page.keyboard.press('Space');
  await sleep(150);
  await fly(page, peg[0], 0.45, peg[2] + 0.03, 0.15, 2000);
  return page.evaluate(() => window.__helicoptea.sim.carriedCargo().length > 0);
}

try {
  // ---------------------------------------------------------------- micro heli, chase view
  {
    const { ctx, page, logs } = await open('?aircraft=micro&view=chase');
    let c = await cues(page);
    check('defaults: shadows, cup glint and dipping camera on, plumb off', c.settings.shadows && c.settings.cupHint && c.settings.dipCam && !c.settings.plumb, JSON.stringify(c.settings));
    const carried = await hookAndCarry(page);
    check('hooks a bag', carried);
    const mug = await page.evaluate(() => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.z, c.waterY, c.topY]; });
    await fly(page, mug[0] + 0.15, 0.42, mug[1], 0.3, 3500);
    c = await cues(page);
    check('bag shadow on the table while carried', c.shadows >= 1 && c.clip === 0 && Math.abs(c.shadowY) < 0.01, JSON.stringify(c));
    const highOp = c.shadowOp, highCore = c.shadowCore;
    check('chase camera unchanged away from a cup', Math.abs(c.elev - 0.52) < 0.01, `elev=${c.elev.toFixed(3)}`);
    await shot(page, '01-micro-high-over-table');
    await hoverLoad(page, mug[0], mug[1], 0.1, 7000);
    c = await cues(page);
    check('over the mug: shadow lies on the tea, clipped to the cup', c.shadows >= 1 && Math.abs(c.shadowY - mug[2]) < 0.004 && c.clip > 0.03, `y=${c.shadowY.toFixed(4)} water=${mug[2].toFixed(4)} clip=${c.clip}`);
    check('over the mug: rim glints', c.ring > 0.15, `ring=${c.ring}`);
    check('over the mug: camera closes in and looks in', c.elev > 0.56, `elev=${c.elev.toFixed(3)}`);
    await shot(page, '02-micro-over-mug-10cm');
    await hoverLoad(page, mug[0], mug[1], 0.025, 4500);
    c = await cues(page);
    check('closer: shadow darker and tighter', c.shadowOp > highOp && c.shadowCore >= highCore, `op ${highOp.toFixed(2)} -> ${c.shadowOp.toFixed(2)}, core ${highCore.toFixed(2)} -> ${c.shadowCore.toFixed(2)}`);
    await shot(page, '03-micro-over-mug-close');
    await setCue(page, 'plumb', true);
    await sleep(400);
    c = await cues(page);
    check('plumb line and height readout', c.plumb && c.readEl && /cm$/.test(c.read || ''), c.read || '');
    await shot(page, '04-micro-plumb');
    // Toggles off: legacy look comes back, nothing of ours draws.
    await setCue(page, 'shadows', false); await setCue(page, 'cupHint', false); await setCue(page, 'plumb', false);
    await sleep(400);
    c = await cues(page);
    check('toggles off hide the cues', c.shadows === 0 && !c.plumb && !c.readEl && c.ring === 0, JSON.stringify(c));
    await shot(page, '05-micro-cues-off');
    await setCue(page, 'shadows', true); await setCue(page, 'cupHint', true);
    // Cockpit view: same cues from the seat.
    await page.evaluate(() => window.__helicoptea.setView('cockpit'));
    await hoverLoad(page, mug[0], mug[1], 0.06, 3500);
    await page.evaluate(() => { const r = window.__helicoptea.fpRig; r.lookPitch = -0.55; });
    await sleep(600);
    c = await cues(page);
    check('cockpit: load shadow and glint still drawn', c.shadows >= 1 && c.ring > 0.1, JSON.stringify(c));
    await shot(page, '06-micro-cockpit-look-down');
    await page.reload({ waitUntil: 'load' });
    await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
    const persisted = await page.evaluate(() => ({ ...window.__helicoptea.depth.settings }));
    check('toggles persist across reload', persisted.shadows && persisted.cupHint && !persisted.plumb, JSON.stringify(persisted));
    await page.evaluate(() => { localStorage.setItem('helicoptea.view', 'chase'); });
    check('no console errors (micro)', logs.length === 0, logs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- Chinook
  {
    const { ctx, page, logs } = await open('?aircraft=chinook&view=chase');
    const carried = await hookAndCarry(page);
    check('chinook hooks a bag', carried);
    const mug = await page.evaluate(() => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.z]; });
    await setCue(page, 'plumb', true);
    await hoverLoad(page, mug[0], mug[1], 0.08, 6000);
    const c = await cues(page);
    check('chinook: load shadow and plumb readout', c.shadows >= 1 && c.plumb, JSON.stringify(c));
    await shot(page, '07-chinook-over-mug');
    check('no console errors (chinook)', logs.length === 0, logs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- Skycrane: hose intake over the crock
  {
    const { ctx, page, logs } = await open('?aircraft=skycrane&view=chase');
    const bowl = await page.evaluate(() => { const b = window.__helicoptea.sim.milk.bowl; return [b.x, b.z, b.topY]; });
    await fly(page, bowl[0], 0.4, bowl[1], 0.25, 6000);
    await page.keyboard.down('KeyX'); await sleep(1200); await page.keyboard.up('KeyX');
    await sleep(1500);
    const c = await cues(page);
    check('skycrane: intake shadow', c.shadows >= 1, JSON.stringify(c));
    const framed = await page.evaluate(() => { const H = window.__helicoptea; const p = H.view.skycrane.curvePts.at(-1).clone().project(H.camRig.camera); return Math.abs(p.x) < 0.8 && Math.abs(p.y) < 0.8; });
    check('skycrane: the intake is framed by the chase camera', framed);
    await shot(page, '08-skycrane-hose');
    check('no console errors (skycrane)', logs.length === 0, logs.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- touch / medium tier
  {
    const { ctx, page, logs } = await open('?aircraft=micro&view=chase', { width: 844, height: 390 }, { touch: true, mobile: true });
    const carried = await hookAndCarry(page);
    const c = await cues(page);
    check('touch tier: shadow while carrying', carried && c.shadows >= 1, JSON.stringify(c));
    await shot(page, '09-touch-carrying');
    check('no console errors (touch)', logs.length === 0, logs.slice(0, 3).join(' | '));
    await ctx.close();
  }
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
