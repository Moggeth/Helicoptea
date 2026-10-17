// Camera-mode checks in a real browser (local Chrome via playwright-core): C / Shift+C cycling, number
// keys, 1 for the cockpit and back, the pause-menu picker and cycle toggles (persisted), the locked chase
// staying bolted to the airframe, the nose cam, the tripod, the orbit, the held GoPro (B, right mouse, pad
// LT) and its overlay, the cargo cam riding a bag into the tea (fog and overlay), the skycrane's snorkel
// cam, pad L3 cycling, touch buttons, frame cost per mode on all three aircraft, and console errors.
// Usage: npm run build && npx vite preview --port 4196, then node tests/e2e-camera.mjs [baseUrl] [--headed]
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4196/';
const outDir = path.resolve('test-results/camera');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function open(query, opts = {}) {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1600, height: 900 }, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  if (opts.gamepad) await ctx.addInitScript(() => {
    window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const pad = () => ({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map((b) => ({ ...b })), timestamp: performance.now() });
    navigator.getGamepads = () => [pad(), null, null, null];
  });
  const page = await ctx.newPage();
  // Loads, screenshots and clicks wait for a rendered frame; on a GPU-less CI runner (software WebGL at
  // a few fps in the heavier camera modes) those can take longer than Playwright's 30 s default.
  page.setDefaultTimeout(90000);
  page.setDefaultNavigationTimeout(90000);
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + query, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  if (opts.touch) await page.tap('#start-btn'); else await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => {
    const H = window.__helicoptea;
    H.doAction('skiphints');
    const ap = new H.Autopilot();
    const orig = H.input.update.bind(H.input);
    window.__pilot = { ap, on: false };
    H.input.update = (dt) => {
      const c = orig(dt);
      const P = window.__pilot;
      if (!P.on || !H.sim.heli) return c;
      const b = H.sim.carriedBag();
      Object.assign(c, ap.update(H.sim.heli, b ? b.vel.clone().sub(H.sim.heli.vel) : null, null, dt));
      return c;
    };
    H.sim.assist = true;
  });
  await sleep(300);
  return { ctx, page, logs };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);
const fly = (page, x, y, z, speed, ms) => H(page, ([x, y, z, speed]) => { const P = window.__pilot; P.on = true; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed; }, [x, y, z, speed]).then(() => sleep(ms));
const hoverLoad = (page, x, z, above, ms) => H(page, ([x, z, above]) => {
  const g = window.__helicoptea; const h = g.sim.heli; const L = g.depth.lowest;
  const P = window.__pilot; P.on = true; P.ap.maxSpeed = 0.06;
  const dy = L ? h.pos.y - L.y : 0, dx = L ? h.pos.x - L.x : 0, dz = L ? h.pos.z - L.z : 0;
  const c = g.sim.cups.find((c) => Math.hypot(c.x - x, c.z - z) < 0.02);
  P.ap.target.set(x + dx * 0.6, (c ? c.topY : 0) + above + dy, z + dz * 0.6);
}, [x, z, above]).then(() => sleep(ms));
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const state = (page) => H(page, () => {
  const g = window.__helicoptea, c = g.camRig.camera, h = g.sim.heli;
  const qi = h ? g.view.heliQuat.clone().invert() : null;
  const rel = qi ? qi.clone().multiply(c.quaternion) : null;
  const off = qi ? c.position.clone().sub(g.view.heliPos).applyQuaternion(qi) : null;
  const fwd = c.getWorldDirection(c.position.clone());
  return {
    mode: g.viewMode, eff: g.camMode, near: c.near, fov: c.fov, pos: c.position.toArray(), fwd: fwd.toArray(), rel: rel && rel.toArray(), off: off && off.toArray(),
    fpClass: document.body.classList.contains('fp'), bolt: !document.querySelector('.boltcam').classList.contains('hidden'), under: g.cam.under && g.cam.under.kind,
    uwEl: !document.querySelector('.underwater').classList.contains('hidden'), fogFar: g.view.scene.fog ? g.view.scene.fog.far : null,
    pip: !document.querySelector('.loadcam').classList.contains('hidden'), ring: getComputedStyle(document.querySelector('.bc-ring')).display !== 'none',
    read: document.querySelector('.bc-read').textContent, cycle: g.cam.cycle.slice(), coll: g.input.ctl.collective, boltCtl: g.input.ctl.boltCam,
    frames: g.frames, heli: !!h, cuts: g.cam.tripod.cuts, toast: document.querySelector('#hud .toast')?.textContent || '',
  };
});
const relAngle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)); };
async function perf(page) {
  const a = await H(page, () => window.__helicoptea.frames);
  const t0 = Date.now();
  await sleep(1500);
  return H(page, ([a, ms]) => { const r = window.__helicoptea.renderer.info.render; return { fps: Math.round((window.__helicoptea.frames - a) * 1000 / ms), calls: r.calls, tris: r.triangles }; }, [a, Date.now() - t0]);
}
async function hookBag(page, ac) {
  const peg = await H(page, () => { const p = window.__helicoptea.sim.pegs[1].tip; return [p.x, p.y, p.z]; });
  await fly(page, -0.56, 0.42, 0.24, 0.3, 1500);
  await fly(page, peg[0], 0.42, peg[2] + 0.004, 0.3, 3500);
  await fly(page, peg[0], peg[1] + (ac === 'chinook' ? 0.036 : 0.054), peg[2] + 0.004, 0.12, 3000);
  await page.keyboard.press('Space');
  await sleep(200);
  await fly(page, peg[0], 0.45, peg[2] + 0.03, 0.15, 1800);
  return H(page, () => window.__helicoptea.sim.carriedCargo().length > 0);
}

try {
  // ---------------------------------------------------------------- micro heli: switching, rigs, GoPro, cargo cam
  {
    const { ctx, page, logs } = await open('?aircraft=micro&view=chase');
    let s = await state(page);
    check('starts in the chase camera', s.mode === 'chase' && s.eff === 'chase');
    await fly(page, -0.56, 0.3, 0.24, 0.3, 1500);
    // C steps through the default cycle; the cargo cam is skipped with nothing on the hook.
    const seen = [];
    for (let i = 0; i < 5; i++) { await page.keyboard.press('KeyC'); await sleep(150); seen.push((await state(page)).mode); }
    check('C steps chase → cockpit → locked → nose → tripod → chase (cargo skipped, nothing hooked)', seen.join(',') === 'cockpit,locked,nose,tripod,chase', seen.join(','));
    await page.keyboard.down('Shift'); await page.keyboard.press('KeyC'); await page.keyboard.up('Shift'); await sleep(150);
    s = await state(page);
    check('Shift+C steps back', s.mode === 'tripod', s.mode);
    check('switching shows the camera name', /Tripod/.test(s.toast), s.toast);
    for (const [k, m] of [['Digit2', 'chase'], ['Digit3', 'locked'], ['Digit4', 'nose'], ['Digit5', 'orbit'], ['Digit6', 'tripod'], ['Digit7', 'cargo']]) {
      await page.keyboard.press(k); await sleep(120);
      s = await state(page);
      check(`${k.slice(5)} picks ${m}`, s.mode === m, s.mode);
    }
    await page.keyboard.press('Digit3'); await sleep(100);
    await page.keyboard.press('Digit1'); await sleep(200);
    s = await state(page);
    check('1 jumps to the cockpit', s.mode === 'cockpit' && s.fpClass && s.near < 0.006);
    await page.keyboard.press('Digit1'); await sleep(200);
    s = await state(page);
    check('1 again returns to the camera you came from', s.mode === 'locked', s.mode);

    // Locked chase: bolted to the airframe through a turn and a dash.
    await sleep(400);
    const l0 = await state(page);
    await fly(page, 0.1, 0.34, -0.1, 0.5, 1300);
    const l1 = await state(page);
    check('locked chase: attitude stays bolted to the airframe while it turns and pitches', relAngle(l0.rel, l1.rel) < 0.002, `${relAngle(l0.rel, l1.rel).toFixed(4)} rad`);
    check('locked chase: behind and above the aircraft in its own frame', l1.off[2] > 0.2 && l1.off[1] > 0.04, l1.off.map((v) => v.toFixed(3)).join(', '));
    await shot(page, 'micro-locked');
    // Nose cam.
    await page.keyboard.press('Digit4'); await sleep(400);
    s = await state(page);
    check('nose cam: on the nose, looking forward', s.off[2] < -0.06 && Math.abs(s.off[0]) < 0.003 && s.near <= 0.0016, s.off.map((v) => v.toFixed(3)).join(', '));
    check('nose cam: no extra hook-camera render unless set to Always', !s.pip);
    await shot(page, 'micro-nose');
    // Tripod: stands still while the heli moves a little.
    await page.keyboard.press('Digit6'); await sleep(500);
    const t0 = await state(page);
    await fly(page, 0.0, 0.3, -0.05, 0.12, 900);
    const t1 = await state(page);
    check('tripod: holds its spot and pans after the aircraft', Math.hypot(t1.pos[0] - t0.pos[0], t1.pos[1] - t0.pos[1], t1.pos[2] - t0.pos[2]) < 1e-6 || t1.cuts > t0.cuts, `moved ${(Math.hypot(t1.pos[0] - t0.pos[0], t1.pos[2] - t0.pos[2]) * 100).toFixed(1)} cm, cuts ${t0.cuts}->${t1.cuts}`);
    check('tripod: long lens', t1.fov < 40, `fov ${t1.fov.toFixed(1)}`);
    await shot(page, 'micro-tripod');
    // Orbit: drag moves it around the aircraft.
    await page.keyboard.press('Digit5'); await sleep(300);
    const o0 = await state(page);
    await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(600, 450, { steps: 6 }); await page.mouse.up();
    await sleep(300);
    const o1 = await state(page);
    check('orbit: dragging swings the camera around', Math.hypot(o1.pos[0] - o0.pos[0], o1.pos[2] - o0.pos[2]) > 0.03, `${(Math.hypot(o1.pos[0] - o0.pos[0], o1.pos[2] - o0.pos[2]) * 100).toFixed(1)} cm`);

    // GoPro: hold B. Looks straight down, overlay up, and back to the orbit on release.
    await page.keyboard.press('Digit2'); await sleep(200);
    await page.keyboard.down('KeyB'); await sleep(400);
    s = await state(page);
    check('GoPro (hold B): looks straight down from the right side', s.eff === 'bolt' && s.fwd[1] < -0.85 && s.off[0] > 0.03 && s.near <= 0.0016, `fwd.y ${s.fwd[1].toFixed(2)} x ${s.off[0].toFixed(3)}`);
    check('GoPro: REC overlay with a landing ring and readout', s.bolt && s.ring && /above|No load|reach/.test(s.read), s.read);
    check('GoPro: the hook inset steps aside', !s.pip);
    await shot(page, 'micro-gopro');
    await page.keyboard.up('KeyB'); await sleep(200);
    s = await state(page);
    check('GoPro: let go and the chosen camera is back', s.eff === 'chase' && !s.bolt, s.eff);
    // Right mouse button.
    await page.mouse.move(700, 400); await page.mouse.down({ button: 'right' }); await sleep(300);
    s = await state(page);
    check('GoPro (hold right mouse)', s.eff === 'bolt');
    await page.mouse.up({ button: 'right' }); await sleep(200);
    check('GoPro: right mouse released', (await state(page)).eff === 'chase');

    // Cargo cam: hook a bag, C now includes the cargo cam, and it rides the bag into the tea.
    const carried = await hookBag(page, 'micro');
    check('hooks a bag', carried);
    await page.keyboard.press('Digit2'); await sleep(100);
    const cyc = [];
    for (let i = 0; i < 6; i++) { await page.keyboard.press('KeyC'); await sleep(120); cyc.push((await state(page)).mode); }
    check('with a bag hooked the cycle includes the cargo cam', cyc.includes('cargo'), cyc.join(','));
    await page.keyboard.press('Digit7'); await sleep(200);
    const mug = await H(page, () => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.z, c.waterY]; });
    await fly(page, mug[0] + 0.1, 0.36, mug[1], 0.3, 3500);
    await hoverLoad(page, mug[0], mug[1], 0.08, 6000);
    s = await state(page);
    const bagY = await H(page, () => window.__helicoptea.sim.carriedCargo()[0].pos.y);
    check('cargo cam: hangs just under the bag, looking down', s.pos[1] < bagY && bagY - s.pos[1] < 0.07 && s.fwd[1] < -0.5, `cam ${(s.pos[1] * 100).toFixed(1)} cm, bag ${(bagY * 100).toFixed(1)} cm`);
    await shot(page, 'micro-cargo-above-mug');
    const fogDry = s.fogFar;
    await hoverLoad(page, mug[0], mug[1], -0.04, 7000);
    s = await state(page);
    check('cargo cam: under the tea the picture goes the colour of the brew', s.under === 'tea' && s.uwEl && s.fogFar < 0.2, `under ${s.under}, fog far ${s.fogFar} (dry ${fogDry})`);
    await shot(page, 'micro-cargo-in-tea');
    await hoverLoad(page, mug[0], mug[1], 0.1, 4500);
    s = await state(page);
    check('cargo cam: out of the tea the fog comes back', !s.under && !s.uwEl && Math.abs(s.fogFar - fogDry) < 1e-6, `fog far ${s.fogFar}`);
    // Look up at the aircraft from the bag.
    await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(800, 850, { steps: 8 }); await page.mouse.up();
    await sleep(300);
    s = await state(page);
    check('cargo cam: drag to look up at the aircraft', s.fwd[1] > 0.2, `fwd.y ${s.fwd[1].toFixed(2)}`);
    await shot(page, 'micro-cargo-look-up');
    await page.keyboard.press('KeyU'); await sleep(300);
    // Pause menu: picker and cycle toggles, persisted.
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('.overlay [data-tab=camera]'); await sleep(100);
    await page.click('.overlay [data-act=view][data-id=tripod]'); await sleep(150);
    s = await state(page);
    check('pause menu picks a camera and stays paused', s.mode === 'tripod' && await H(page, () => window.__helicoptea.paused));
    await page.click('.overlay [data-act=camcycle][data-id=orbit]'); await sleep(100);
    await page.click('.overlay [data-act=camcycle][data-id=nose]'); await sleep(100);
    s = await state(page);
    check('cycle toggles: orbit in, nose out', s.cycle.includes('orbit') && !s.cycle.includes('nose'), s.cycle.join(','));
    check('speed feel slider in the pause menu', await H(page, () => !!document.querySelector('[data-setting=camFeel]')));
    await page.keyboard.press('Escape'); await sleep(200);
    await shot(page, 'micro-tripod-carrying');
    check('no console errors (micro)', logs.length === 0, logs.slice(0, 4).join(' | '));
    // Reload: the camera and the cycle come back as left.
    await page.goto(base + '?aircraft=micro', { waitUntil: 'load' });
    await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__helicoptea?.started);
    s = await state(page);
    check('camera and cycle persist across a reload', s.mode === 'tripod' && s.cycle.includes('orbit') && !s.cycle.includes('nose'), `${s.mode} | ${s.cycle.join(',')}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- all aircraft: every mode renders, frame cost
  const perfRows = [];
  for (const ac of ['micro', 'chinook', 'skycrane']) {
    const { ctx, page, logs } = await open(`?aircraft=${ac}&view=chase`);
    await fly(page, -0.4, 0.3, 0.1, 0.3, 2500);
    if (ac === 'skycrane') { await page.keyboard.down('KeyX'); await sleep(1200); await page.keyboard.up('KeyX'); }
    for (const m of ['chase', 'cockpit', 'locked', 'nose', 'orbit', 'tripod', 'cargo', 'gopro']) {
      if (m === 'gopro') await page.keyboard.down('KeyB'); else await H(page, (m) => window.__helicoptea.setView(m), m);
      await sleep(500);
      const p = await perf(page);
      const s = await state(page);
      perfRows.push({ ac, m, ...p });
      if (m === 'gopro') {
        check(`${ac}: GoPro looks down past the airframe`, s.eff === 'bolt' && s.fwd[1] < -0.85, `fwd.y ${s.fwd[1].toFixed(2)}`);
        await shot(page, `${ac}-gopro`);
        await page.keyboard.up('KeyB');
      } else check(`${ac}: ${m} renders`, s.eff === (m === 'cargo' && ac !== 'skycrane' ? 'cargo' : m) || (m === 'cargo' && s.eff === 'cargo'), s.eff);
      if (['locked', 'nose', 'cargo'].includes(m)) await shot(page, `${ac}-${m}`);
    }
    if (ac === 'skycrane') {
      await H(page, () => window.__helicoptea.setView('cargo'));
      await sleep(300);
      const s = await state(page);
      const head = await H(page, () => window.__helicoptea.sim.heli.hose.headWorld.toArray());
      check('skycrane: the cargo cam rides the snorkel head', Math.hypot(s.pos[0] - head[0], s.pos[1] - head[1], s.pos[2] - head[2]) < 0.04, `${(Math.hypot(s.pos[0] - head[0], s.pos[1] - head[1], s.pos[2] - head[2]) * 100).toFixed(1)} cm`);
    }
    check(`no console errors (${ac})`, logs.length === 0, logs.slice(0, 4).join(' | '));
    await ctx.close();
  }
  const base0 = Object.fromEntries(perfRows.filter((r) => r.m === 'chase').map((r) => [r.ac, r]));
  console.log('\nframe cost (headless, 1600x900): fps / draw calls / triangles');
  for (const r of perfRows) console.log(`  ${r.ac.padEnd(9)} ${r.m.padEnd(8)} ${String(r.fps).padStart(4)} fps  ${String(r.calls).padStart(4)} calls  ${String(r.tris).padStart(8)} tris`);
  const worst = perfRows.filter((r) => r.m !== 'cockpit').reduce((w, r) => Math.max(w, r.calls / base0[r.ac].calls), 0);
  check('no new mode adds a render pass (draw calls within a third of the chase camera\'s)', worst < 1.35, `worst ${worst.toFixed(2)}x chase draw calls`);
  // The cockpit's own cost predates this pass; every other mode must run about as fast as the chase camera.
  const slow = perfRows.filter((r) => r.m !== 'cockpit' && r.fps < Math.min(100, base0[r.ac].fps * 0.8));
  check('every new mode holds frame rate within 20% of the chase camera (headless clock caps at 120)', slow.length === 0, slow.map((r) => `${r.ac}/${r.m} ${r.fps} vs ${base0[r.ac].fps}`).join(', '));
  fs.writeFileSync(path.join(outDir, 'frame-cost.json'), JSON.stringify(perfRows, null, 1));

  // ---------------------------------------------------------------- gamepad: L3 cycles, LT holds the GoPro, LT no longer sinks
  {
    const { ctx, page, logs } = await open('?aircraft=micro&view=chase', { gamepad: true });
    await page.evaluate(() => { window.__pad.buttons[0] = { pressed: true, value: 1 }; }); await sleep(60);
    await page.evaluate(() => { window.__pad.buttons[0] = { pressed: false, value: 0 }; }); await sleep(100);
    await fly(page, -0.56, 0.3, 0.24, 0.3, 1200);
    const press = async (i) => { await H(page, (i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, i); await sleep(100); await H(page, (i) => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, i); await sleep(120); };
    await press(10);
    let s = await state(page);
    check('pad: L3 tap steps to the next camera', s.mode === 'cockpit', s.mode);
    await press(10); s = await state(page);
    check('pad: L3 again steps on', s.mode === 'locked', s.mode);
    await H(page, () => { window.__pilot.on = false; window.__helicoptea.sim.assist = true; window.__pad.buttons[6] = { pressed: true, value: 1 }; });
    await sleep(400);
    s = await state(page);
    check('pad: holding LT is the GoPro', s.eff === 'bolt' && s.boltCtl, s.eff);
    check('pad: LT no longer lowers the collective while it is the GoPro', Math.abs(s.coll) < 0.05, `collective input ${s.coll.toFixed(2)}`);
    await shot(page, 'pad-gopro');
    await H(page, () => { window.__pad.buttons[6] = { pressed: false, value: 0 }; }); await sleep(200);
    s = await state(page);
    check('pad: let go of LT and the locked chase is back', s.eff === 'locked', s.eff);
    // D-pad looks around in the cargo cam.
    await H(page, () => window.__helicoptea.setView('cargo')); await sleep(200);
    const f0 = (await state(page)).fwd;
    await H(page, () => { window.__pad.buttons[14] = { pressed: true, value: 1 }; }); await sleep(500); await H(page, () => { window.__pad.buttons[14] = { pressed: false, value: 0 }; });
    const f1 = (await state(page)).fwd;
    check('pad: D-pad glances around in the cargo cam', Math.hypot(f1[0] - f0[0], f1[2] - f0[2]) > 0.1);
    check('no console errors (gamepad)', logs.length === 0, logs.slice(0, 4).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- touch: camera button and GoPro hold
  {
    const { ctx, page, logs } = await open('?aircraft=micro&view=chase', { touch: true, mobile: true, viewport: { width: 844, height: 390 } });
    await fly(page, -0.56, 0.3, 0.24, 0.3, 1000);
    await page.tap('.hud-tr [data-act=view]'); await sleep(200);
    let s = await state(page);
    check('touch: camera icon steps to the next camera', s.mode === 'cockpit', s.mode);
    const box = await page.locator('.touch-btn.bolt').boundingBox();
    check('touch: GoPro button on screen', !!box && box.x > 0 && box.y > 0 && box.x + box.width < 844, JSON.stringify(box));
    // Hold with a real touch (CDP), so the button's pointer capture works as on a phone.
    const cdp = await ctx.newCDPSession(page);
    const pt = { x: box.x + box.width / 2, y: box.y + box.height / 2, id: 3 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] });
    await sleep(300);
    s = await state(page);
    check('touch: holding GoPro shows the bolted camera', s.eff === 'bolt', s.eff);
    await shot(page, 'touch-gopro');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await sleep(200);
    check('touch: let go and the cockpit is back', (await state(page)).eff === 'cockpit');
    check('no console errors (touch)', logs.length === 0, logs.slice(0, 4).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- replay: the new cameras
  {
    const { ctx, page, logs } = await open('?aircraft=micro&view=chase');
    await fly(page, -0.4, 0.3, 0.1, 0.3, 2500);
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('.overlay [data-act=replay]'); await sleep(800);
    for (const [k, id] of [['Digit4', 'locked'], ['Digit5', 'gopro'], ['Digit6', 'tripod']]) {
      await page.keyboard.press(k); await sleep(500);
      const r = await H(page, () => ({ cam: window.__helicoptea.replay.cam, fwd: window.__helicoptea.camRig.camera.getWorldDirection(window.__helicoptea.camRig.camera.position.clone()).toArray() }));
      check(`replay: ${id} camera`, r.cam === id && (id !== 'gopro' || r.fwd[1] < -0.85), `${r.cam} fwd.y ${r.fwd[1].toFixed(2)}`);
      await shot(page, `replay-${id}`);
    }
    check('no console errors (replay)', logs.length === 0, logs.slice(0, 4).join(' | '));
    await ctx.close();
  }
} catch (err) {
  check('suite ran to completion', false, err.stack || String(err));
} finally {
  await browser.close();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
fs.writeFileSync(path.join(outDir, 'results.json'), JSON.stringify(results, null, 1));
process.exit(failed.length ? 1 : 0);
