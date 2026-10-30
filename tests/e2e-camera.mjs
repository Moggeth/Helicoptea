// Camera-mode checks in a real browser (local Chrome via playwright-core): the three cameras (chase,
// cockpit, locked chase), C / Shift+C cycling, number keys, 1 for the cockpit and back, the pause-menu
// picker and cycle toggles (persisted), an old saved camera falling back, the locked chase staying bolted
// to the airframe, chase orbit by drag, the held GoPro (B, right mouse, pad LT, touch) and its overlay,
// pad L3 cycling and D-pad orbit, touch buttons, frame cost per mode on all three aircraft, the replay's
// own cameras, and console errors.
// Usage: npm run build && npx vite preview --port 4196, then node tests/e2e-camera.mjs [baseUrl] [--headed]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
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
  page.setDefaultTimeout(startupTimeout(90000));
  page.setDefaultNavigationTimeout(startupTimeout(90000));
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push(`[error] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + query, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
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
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });
const state = (page) => H(page, () => {
  const g = window.__helicoptea, c = g.camRig.camera, h = g.sim.heli;
  const qi = h ? g.view.heliQuat.clone().invert() : null;
  const rel = qi ? qi.clone().multiply(c.quaternion) : null;
  const off = qi ? c.position.clone().sub(g.view.heliPos).applyQuaternion(qi) : null;
  const fwd = c.getWorldDirection(c.position.clone());
  return {
    mode: g.viewMode, eff: g.camMode, near: c.near, fov: c.fov, pos: c.position.toArray(), fwd: fwd.toArray(), rel: rel && rel.toArray(), off: off && off.toArray(),
    fpClass: document.body.classList.contains('fp'), bolt: !document.querySelector('.boltcam').classList.contains('hidden'),
    pip: !document.querySelector('.loadcam').classList.contains('hidden'), ring: getComputedStyle(document.querySelector('.bc-ring')).display !== 'none',
    read: document.querySelector('.bc-read').textContent, cycle: g.cam.cycle.slice(), coll: g.input.ctl.collective, boltCtl: g.input.ctl.boltCam,
    frames: g.frames, heli: !!h, toast: document.querySelector('#hud .toast')?.textContent || '',
  };
});
const relAngle = (a, b) => { const d = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]); return 2 * Math.acos(Math.min(1, d)); };
async function perf(page) {
  const a = await H(page, () => window.__helicoptea.frames);
  const t0 = Date.now();
  await sleep(1500);
  // The busiest of four frames: on the lite tier (touch, low, and CI's software renderer) shadow maps are
  // redrawn every other frame, so a single frame's count depends on which frame it lands on.
  return H(page, ([a, ms]) => new Promise((res) => {
    const g = window.__helicoptea, fps = Math.round((g.frames - a) * 1000 / ms);
    let calls = 0, tris = 0, n = 0;
    const tick = () => { const r = g.renderer.info.render; if (r.calls > calls) { calls = r.calls; tris = r.triangles; } if (++n < 4) requestAnimationFrame(tick); else res({ fps, calls, tris }); };
    tick();
  }), [a, Date.now() - t0]);
}
try {
  // ---------------------------------------------------------------- micro heli: switching, rigs, GoPro
  {
    const { ctx, page, logs } = await open('?aircraft=micro&view=chase');
    let s = await state(page);
    check('starts in the chase camera', s.mode === 'chase' && s.eff === 'chase');
    await fly(page, -0.56, 0.3, 0.24, 0.3, 1500);
    // C steps through the three cameras.
    const seen = [];
    for (let i = 0; i < 3; i++) { await page.keyboard.press('KeyC'); await sleep(150); seen.push((await state(page)).mode); }
    check('C steps chase → cockpit → locked → chase', seen.join(',') === 'cockpit,locked,chase', seen.join(','));
    await page.keyboard.down('Shift'); await page.keyboard.press('KeyC'); await page.keyboard.up('Shift'); await sleep(150);
    s = await state(page);
    check('Shift+C steps back', s.mode === 'locked', s.mode);
    check('switching shows the camera name', /Locked chase/.test(s.toast), s.toast);
    for (const [k, m] of [['Digit2', 'chase'], ['Digit3', 'locked']]) {
      await page.keyboard.press(k); await sleep(120);
      s = await state(page);
      check(`${k.slice(5)} picks ${m}`, s.mode === m, s.mode);
    }
    await page.keyboard.press('Digit4'); await sleep(120);
    check('4 is no longer a camera', (await state(page)).mode === 'locked');
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
    check('locked chase: no extra hook-camera render unless set to Always', !l1.pip);
    await shot(page, 'micro-locked');
    // Chase: dragging orbits it around the aircraft.
    await page.keyboard.press('Digit2'); await sleep(300);
    const o0 = await state(page);
    await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(600, 450, { steps: 6 }); await page.mouse.up();
    await sleep(300);
    const o1 = await state(page);
    check('chase: dragging swings the camera around', Math.hypot(o1.pos[0] - o0.pos[0], o1.pos[2] - o0.pos[2]) > 0.01, `${(Math.hypot(o1.pos[0] - o0.pos[0], o1.pos[2] - o0.pos[2]) * 100).toFixed(1)} cm`);
    await page.keyboard.press('KeyU'); await sleep(200);

    // GoPro: hold B. Looks straight down, overlay up, and back to the chase on release.
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

    // Pause menu: picker and cycle toggles, persisted.
    await page.keyboard.press('Escape'); await sleep(200);
    await page.click('.overlay [data-tab=camera]'); await sleep(100);
    const listed = await H(page, () => [...new Set([...document.querySelectorAll('.overlay [data-act=view][data-id]')].map((b) => b.dataset.id))].join());
    check('pause menu lists exactly the three cameras', listed === 'chase,cockpit,locked', listed);
    await page.click('.overlay [data-act=view][data-id=locked]'); await sleep(150);
    s = await state(page);
    check('pause menu picks a camera and stays paused', s.mode === 'locked' && await H(page, () => window.__helicoptea.paused));
    await page.click('.overlay [data-act=camcycle][data-id=cockpit]'); await sleep(100);
    s = await state(page);
    check('cycle toggles: cockpit out', !s.cycle.includes('cockpit') && s.cycle.length === 2, s.cycle.join(','));
    check('speed feel slider in the pause menu', await H(page, () => !!document.querySelector('[data-setting=camFeel]')));
    const lookOpt = await H(page, () => { const el = document.querySelector('[data-setting=lookReturn]'); return el ? { on: el.checked, hint: el.closest('.opt').querySelector('small')?.textContent || '' } : null; });
    check('Look springs back switch, on, saying how to look', !!lookOpt && lookOpt.on && /look/i.test(lookOpt.hint), JSON.stringify(lookOpt));
    await page.keyboard.press('Escape'); await sleep(200);
    // Free look in the locked chase: a drag swings the camera round the airframe, and it springs back.
    await page.mouse.move(700, 400); await page.mouse.down(); await page.mouse.move(560, 400, { steps: 6 }); await sleep(150);
    const lk = await H(page, () => ({ yaw: window.__helicoptea.input.camOrbit.yaw, cam: window.__helicoptea.camMode }));
    check('locked chase: dragging swings the camera round', lk.cam === 'locked' && Math.abs(lk.yaw) > 0.3, JSON.stringify(lk));
    await page.mouse.up();
    await page.waitForFunction(() => window.__helicoptea.input.camOrbit.yaw === 0, null, { timeout: 5000 }).catch(() => {});
    check('locked chase: free look springs back on release', await H(page, () => window.__helicoptea.input.camOrbit.yaw === 0));
    check('no console errors (micro)', logs.length === 0, logs.slice(0, 4).join(' | '));
    // Reload: the camera and the cycle come back as left.
    await page.goto(base + '?aircraft=micro', { waitUntil: 'load' });
    await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__helicoptea?.started);
    s = await state(page);
    check('camera and cycle persist across a reload', s.mode === 'locked' && !s.cycle.includes('cockpit'), `${s.mode} | ${s.cycle.join(',')}`);
    // A camera or cycle saved before the trim (tripod, orbit) opens in the chase with the full cycle.
    await page.evaluate(() => { localStorage.setItem('helicoptea.view', 'tripod'); localStorage.setItem('helicoptea.camCycle', '["orbit","tripod"]'); });
    await page.goto(base + '?aircraft=micro', { waitUntil: 'load' });
    await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__helicoptea?.started);
    s = await state(page);
    check('a retired saved camera opens in the chase, with the full cycle', s.mode === 'chase' && s.cycle.join() === 'chase,cockpit,locked', `${s.mode} | ${s.cycle.join(',')}`);
    await ctx.close();
  }

  // ---------------------------------------------------------------- all aircraft: every mode renders, frame cost
  const perfRows = [];
  for (const ac of ['micro', 'chinook', 'skycrane']) {
    const { ctx, page, logs } = await open(`?aircraft=${ac}&view=chase`);
    await fly(page, -0.4, 0.3, 0.1, 0.3, 2500);
    for (const m of ['chase', 'cockpit', 'locked', 'gopro']) {
      if (m === 'gopro') await page.keyboard.down('KeyB'); else await H(page, (m) => window.__helicoptea.setView(m), m);
      await sleep(500);
      const p = await perf(page);
      const s = await state(page);
      perfRows.push({ ac, m, ...p });
      if (m === 'gopro') {
        check(`${ac}: GoPro looks down past the airframe`, s.eff === 'bolt' && s.fwd[1] < -0.85, `fwd.y ${s.fwd[1].toFixed(2)}`);
        await shot(page, `${ac}-gopro`);
        await page.keyboard.up('KeyB');
      } else check(`${ac}: ${m} renders`, s.eff === m, s.eff);
      if (m === 'locked') await shot(page, `${ac}-${m}`);
    }
    check(`no console errors (${ac})`, logs.length === 0, logs.slice(0, 4).join(' | '));
    await ctx.close();
  }
  const base0 = Object.fromEntries(perfRows.filter((r) => r.m === 'chase').map((r) => [r.ac, r]));
  console.log('\nframe cost (headless, 1600x900): fps / draw calls / triangles');
  for (const r of perfRows) console.log(`  ${r.ac.padEnd(9)} ${r.m.padEnd(8)} ${String(r.fps).padStart(4)} fps  ${String(r.calls).padStart(4)} calls  ${String(r.tris).padStart(8)} tris`);
  const worst = perfRows.filter((r) => r.m !== 'cockpit').reduce((w, r) => Math.max(w, r.calls / base0[r.ac].calls), 0);
  check('no camera adds a render pass (draw calls within a third of the chase camera\'s)', worst < 1.35, `worst ${worst.toFixed(2)}x chase draw calls`);
  // The cockpit's own cost predates this pass; every other mode must run about as fast as the chase camera.
  const slow = perfRows.filter((r) => r.m !== 'cockpit' && r.fps < Math.min(100, base0[r.ac].fps * 0.8));
  check('every camera holds frame rate within 20% of the chase camera (headless clock caps at 120)', slow.length === 0, slow.map((r) => `${r.ac}/${r.m} ${r.fps} vs ${base0[r.ac].fps}`).join(', '));
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
    await press(10); s = await state(page);
    check('pad: L3 a third time is back in the chase', s.mode === 'chase', s.mode);
    // D-pad orbits the chase camera.
    const f0 = (await state(page)).pos;
    await H(page, () => { window.__pad.buttons[14] = { pressed: true, value: 1 }; }); await sleep(500); await H(page, () => { window.__pad.buttons[14] = { pressed: false, value: 0 }; });
    const f1 = (await state(page)).pos;
    check('pad: D-pad orbits the chase camera', Math.hypot(f1[0] - f0[0], f1[2] - f0[2]) > 0.01);
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
    await page.tap('.hud-tr [data-act=view]'); await sleep(200);
    await page.tap('.hud-tr [data-act=view]'); await sleep(200);
    check('touch: three taps go round all three cameras', (await state(page)).mode === 'chase');
    await page.tap('.hud-tr [data-act=view]'); await sleep(200);
    const vb = await page.locator('.hud-tr [data-act=view]').boundingBox();
    check('touch: camera button is at least 40 px', !!vb && vb.width >= 40 && vb.height >= 40, JSON.stringify(vb));
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

  // ---------------------------------------------------------------- replay: its own cameras
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
