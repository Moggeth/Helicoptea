// Browser checks for the milk bucket, using the locally installed Chrome (no browser download).
// Usage: start a server, then: node tests/e2e-milk.mjs [baseUrl] [--headed]
// Flies the real game (in-page autopilot on the real input pipeline): hook the bucket, dip it in the
// crock, carry it to the teacup and pour with the real G key; then an emulated gamepad's RT, the touch
// Pour button, and a pour onto the table. Screenshots and a JSON report go to test-results/milk-*.
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4179/';
const headed = process.argv.includes('--headed');
const outDir = path.resolve('test-results');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => fs.existsSync(p));

const report = { base, when: new Date().toISOString(), checks: [], perf: {} };
const check = (name, ok, detail = '') => { report.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({
  executablePath: CHROME, headless: !headed,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: opts.dpr || 1, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  if (opts.gamepad) await ctx.addInitScript(() => {
    window.__pad = { present: true, id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const pad = () => ({ id: window.__pad.id, index: 0, connected: true, mapping: 'standard', axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map((b) => ({ ...b })), timestamp: performance.now() });
    navigator.getGamepads = () => [pad(), null, null, null];
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + (opts.query || '?worldSpeed=1'), { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
  return { ctx, page, logs };
}
const start = async (page) => { await page.click('#start-btn'); await page.waitForFunction(() => window.__helicoptea?.started); await sleep(600); };
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `milk-${name}.png`) });
const errors = (logs) => logs.filter((l) => l.includes('pageerror') || l.startsWith('[error]'));

// Autopilot on the real input pipeline. Damps the swing of whatever is on the hook (bucket included).
async function installPilot(page) {
  await page.evaluate(() => {
    const H = window.__helicoptea;
    const ap = new H.Autopilot();
    const orig = H.input.update.bind(H.input);
    window.__pilot = { ap, on: false, aim: false };
    H.input.update = (dt) => {
      const c = orig(dt);
      const P = window.__pilot;
      if (!P.on || !H.sim.heli) return c;
      const k = H.sim.carriedCargo()[0];
      const out = ap.update(H.sim.heli, k ? k.vel.clone().sub(H.sim.heli.vel) : null, P.aim && k ? k.pos : null, dt);
      c.pitch = out.pitch; c.roll = out.roll; c.yaw = out.yaw; c.collective = out.collective;
      return c;
    };
  });
}
const fly = (page, x, y, z, speed, ms, aim = false) => page.evaluate(([x, y, z, speed, aim]) => {
  const P = window.__pilot; P.on = true; P.aim = aim; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed;
}, [x, y, z, speed, aim]).then(() => sleep(ms));
const milk = (page) => page.evaluate(() => {
  const s = window.__helicoptea.sim, k = s.milk.bucket;
  return { state: s.state, heli: s.heli ? s.heli.pos.toArray() : null, k: k.pos.toArray(), vol: k.vol, fill: k.fill, carried: s.carriedCargo().includes(k), valve: k.valveOpen,
    imm: k.immersion, parcels: s.milk.parcels.length, puddles: s.milk.puddles.length, cups: s.cups.map((c) => ({ milk: c.milk, vol: c.vol })), bowl: s.milk.bowl.vol,
    prompt: document.querySelector('.prompt')?.classList.contains('show') ? document.querySelector('.prompt').textContent : '' };
});
// Hook the bucket from its hanger and dip it in the crock (shared by the device checks).
async function hookAndFill(page, tag) {
  const g = await page.evaluate(() => {
    const s = window.__helicoptea.sim, m = s.milk;
    return { tip: m.hanger.tip.toArray(), bowl: [m.bowl.x, m.bowl.floorY, m.bowl.z], hookDrop: -window.__helicoptea.sim.heli.def.hooks[0][1],
      lineY: 0.13 + 0.02 + 0.0135 + 0.0135 }; // line + bridle + half the bucket height, twice (swivel to bottom)
  });
  const [tx, ty, tz] = g.tip;
  await fly(page, -0.5, 0.42, 0.2, 0.3, 1800);
  await fly(page, tx, 0.42, tz + 0.004, 0.3, 4000);
  await fly(page, tx, ty + g.hookDrop + 0.008, tz + 0.004, 0.15, 2600);
  let s = await milk(page);
  if (tag) await shot(page, `${tag}-at-hanger`);
  check(`${tag}: hook prompt names the bucket`, /milk bucket/i.test(s.prompt), s.prompt);
  await page.keyboard.press('Space');
  await sleep(150);
  s = await milk(page);
  check(`${tag}: Space hooks the milk bucket`, s.carried, `state ${s.state}`);
  await fly(page, tx, 0.42, tz + 0.03, 0.15, 1800);
  return dip(page, tag, g);
}
async function dip(page, tag, g) {
  if (!g) g = await page.evaluate(() => { const m = window.__helicoptea.sim.milk; return { bowl: [m.bowl.x, m.bowl.floorY, m.bowl.z], hookDrop: -window.__helicoptea.sim.heli.def.hooks[0][1], lineY: 0.13 + 0.02 + 0.027 }; });
  await fly(page, g.bowl[0], 0.42, g.bowl[2], 0.3, 4500);
  await fly(page, g.bowl[0], 0.36, g.bowl[2], 0.1, 2500, true);
  const off = await page.evaluate(() => { const s = window.__helicoptea.sim, k = s.milk.bucket; return [s.heli.pos.x - k.pos.x, s.heli.pos.z - k.pos.z]; });
  await fly(page, g.bowl[0] + off[0], g.bowl[1] + 0.004 + g.lineY + g.hookDrop, g.bowl[2] + off[1], 0.05, 5000);
  const s = await milk(page);
  if (tag) await shot(page, `${tag}-dipping`);
  return s;
}

try {
  // ------------------------------------------------------------ desktop keyboard: full loop
  {
    const { ctx, page, logs } = await open({ width: 1600, height: 900 }, { query: '?worldSpeed=1&debug=1' });
    await start(page);
    await shot(page, '01-station');
    await installPilot(page);
    let s = await hookAndFill(page, 'kb');
    check('kb: dipping in the crock fills the bucket', s.fill > 0.7, `fill ${(s.fill * 100).toFixed(0)}% imm ${s.imm.toFixed(2)}, prompt "${s.prompt}"`);
    const cup = await page.evaluate(() => { const c = window.__helicoptea.sim.cups[1]; return [c.x, c.z]; });
    await fly(page, -0.22, 0.46, -0.34, 0.12, 2500);
    await fly(page, cup[0], 0.46, cup[1], 0.25, 6500);
    await fly(page, cup[0], 0.40, cup[1], 0.08, 3500, true);
    s = await milk(page);
    check('kb: over the cup the prompt offers G to pour', /G.*pour into the teacup/i.test(s.prompt), s.prompt);
    const before = s;
    await page.keyboard.down('KeyG');
    await sleep(700);
    s = await milk(page);
    check('kb: holding G opens the valve and a stream falls', s.valve && s.parcels > 2, `parcels ${s.parcels}`);
    await shot(page, '02-pouring');
    await sleep(2200);
    await page.keyboard.up('KeyG');
    await sleep(800);
    s = await milk(page);
    await shot(page, '03-after-pour');
    check('kb: releasing G shuts the valve', !s.valve);
    check('kb: milk lands in the teacup', s.cups[1].milk > 0.02 && s.cups[1].vol > before.cups[1].vol, `teacup milk ${(s.cups[1].milk * 100).toFixed(1)}%`);
    // close-up of the cup
    await page.evaluate(() => { const H = window.__helicoptea; H.input.camOrbit.zoom = -0.45; H.input.camOrbit.pitch = 0.55; });
    await sleep(900);
    await shot(page, '04-milky-teacup');
    await page.evaluate(() => { const H = window.__helicoptea; H.input.camOrbit.zoom = 0; H.input.camOrbit.pitch = 0; });
    // refill and pour onto open table for a puddle
    s = await dip(page, null);
    const m2 = await milk(page);
    if (m2.carried && m2.fill > 0.3) {
      await fly(page, -0.22, 0.46, -0.34, 0.12, 2000);
      await fly(page, -0.05, 0.46, 0.0, 0.2, 3500);
      await page.keyboard.down('KeyG'); await sleep(2500); await page.keyboard.up('KeyG'); await sleep(1200);
      s = await milk(page);
      check('kb: milk that misses makes a puddle', s.puddles >= 1, `${s.puddles} puddles`);
      await shot(page, '05-puddle');
    } else check('kb: refilled for the puddle check', false, JSON.stringify(m2));
    // frame rate while pouring (bounded effects)
    const perf = await page.evaluate(() => new Promise((res) => { const t0 = performance.now(); let n = 0; const f = (t) => { n++; if (t - t0 < 3000) requestAnimationFrame(f); else res(+(n / ((t - t0) / 1000)).toFixed(1)); }; requestAnimationFrame(f); }));
    report.perf.desktopAfterPour = perf;
    check('kb: no errors in the console', errors(logs).length === 0, errors(logs).slice(0, 3).join(' | '));
    check('kb: no crash in the whole loop', s.state === 'flying');
    await ctx.close();
  }

  // ------------------------------------------------------------ gamepad: RT pours
  {
    const { ctx, page, logs } = await open({ width: 1280, height: 720 }, { gamepad: true });
    await start(page);
    await installPilot(page);
    // put a full bucket on the hook directly (the flight itself is covered above)
    await fly(page, -0.56, 0.3, 0.24, 0.25, 2500);
    await page.evaluate(() => {
      const s = window.__helicoptea.sim, k = s.milk.bucket, h = s.heli.hookWorlds[0];
      s.detachBag(k, true);
      k.body.setTranslation({ x: h.x, y: h.y - 0.13 - 0.0335, z: h.z }, true);
      k.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      k.updateCached();
      s.attachBag(k, { kind: 'heli', heli: s.heli, hook: 0 });
      const got = s.milk.take(s.milk.bowl, 1e-5); k.mix(got.vol, got.milk, got.brew);
    });
    await fly(page, -0.3, 0.42, 0.1, 0.25, 3500);
    // Default (Aim) layout: RT pours (past half-way); RB is hook / release.
    await page.evaluate(() => { window.__pad.buttons[7] = { pressed: true, value: 0.3 }; });
    await sleep(300);
    let s = await milk(page);
    check('gamepad: a light RT squeeze does not pour', !s.valve);
    await page.evaluate(() => { window.__pad.buttons[7] = { pressed: true, value: 1 }; });
    await sleep(800);
    s = await milk(page);
    check('gamepad: holding RT pours', s.valve && s.parcels > 0, `valve ${s.valve} parcels ${s.parcels}`);
    await page.evaluate(() => { window.__pad.buttons[7] = { pressed: false, value: 0 }; });
    await sleep(300);
    s = await milk(page);
    check('gamepad: releasing RT shuts the valve', !s.valve);
    const hint = await page.evaluate(() => document.querySelector('.prompt').textContent);
    check('gamepad: the pour prompt shows RT', /RT/.test(hint), hint);
    check('gamepad: no errors', errors(logs).length === 0, errors(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ------------------------------------------------------------ touch: Pour button
  {
    const { ctx, page, logs } = await open({ width: 844, height: 390 }, { touch: true, mobile: true, query: '?worldSpeed=1' });
    await start(page);
    await installPilot(page);
    const hiddenFirst = await page.evaluate(() => document.querySelector('.touch-btn.pour').offsetParent === null);
    check('touch: no Pour button until the bucket is carried', hiddenFirst);
    await fly(page, -0.56, 0.3, 0.24, 0.25, 2500);
    await page.evaluate(() => {
      const s = window.__helicoptea.sim, k = s.milk.bucket, h = s.heli.hookWorlds[0];
      s.detachBag(k, true);
      k.body.setTranslation({ x: h.x, y: h.y - 0.13 - 0.0335, z: h.z }, true);
      k.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      k.updateCached();
      s.attachBag(k, { kind: 'heli', heli: s.heli, hook: 0 });
      const got = s.milk.take(s.milk.bowl, 1e-5); k.mix(got.vol, got.milk, got.brew);
    });
    await fly(page, -0.3, 0.42, 0.1, 0.25, 3500);
    const box = await page.locator('.touch-btn.pour').boundingBox();
    check('touch: Pour button appears while carrying', !!box && box.width > 40, JSON.stringify(box));
    await shot(page, '06-touch-pour-button');
    const cdp = await ctx.newCDPSession(page);
    const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 7 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await sleep(700);
    let s = await milk(page);
    check('touch: holding Pour opens the valve', s.valve && s.parcels > 0, `valve ${s.valve} parcels ${s.parcels}`);
    await shot(page, '07-touch-pouring');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(300);
    s = await milk(page);
    check('touch: lifting the finger shuts the valve', !s.valve);
    check('touch: no errors', errors(logs).length === 0, errors(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (err) {
  check('run completed', false, err.stack || String(err));
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'milk-report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.ok);
  console.log(`\n${report.checks.length - failed.length}/${report.checks.length} milk browser checks passed`);
  process.exit(failed.length ? 1 : 0);
}
