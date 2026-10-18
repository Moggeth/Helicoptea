// First-person cockpit checks in a real browser (local Chrome via playwright-core):
// toggling (keyboard, HUD button, pause menu, gamepad L3, touch), free-look (mouse, hold L3 + right stick,
// d-pad, touch drag), zoom and recenter, the hook camera inset, near-plane clipping against the house,
// crash and restart from the cockpit for both aircraft, and console errors.
// Usage: npm run build && npx vite preview --port 4190, then node tests/e2e-cockpit.mjs [baseUrl]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4190/';
const outDir = path.resolve('test-results/cockpit');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function open(query, viewport = { width: 1600, height: 900 }, opts = {}) {
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.mobile, deviceScaleFactor: opts.dpr || 1 });
  if (opts.gamepad) await ctx.addInitScript(() => {
    window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const pad = () => ({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map((b) => ({ ...b })), timestamp: performance.now() });
    navigator.getGamepads = () => [pad(), null, null, null];
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + query, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
  return { ctx, page, logs };
}
const start = async (page) => {
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => window.__helicoptea.doAction('skiphints'));
  await sleep(500);
};
const H = (page, fn, arg) => page.evaluate(fn, arg);
const state = (page) => H(page, () => {
  const g = window.__helicoptea;
  return {
    mode: g.viewMode, live: g.fp.wasLive, near: g.view && g.camRig ? g.camRig.camera.near : 0, fov: g.camRig.camera.fov,
    yaw: g.fpRig.lookYaw, pitch: g.fpRig.lookPitch, zoom: g.fpRig.fovZoom, sim: g.sim.state, heli: !!g.sim.heli,
    fpClass: document.body.classList.contains('fp'), pip: !document.querySelector('.loadcam').classList.contains('hidden'),
    pipText: document.querySelector('.lc-read').textContent, ctl: { ...g.input.ctl }, frames: g.frames,
    hiddenFuselage: g.view.firstPerson,
  };
});

// ---------------------------------------------------------------- desktop, micro heli
{
  const { ctx, page, logs } = await open('?aircraft=micro&view=chase');
  await start(page);
  let s = await state(page);
  check('starts in chase view by default here', s.mode === 'chase' && !s.fpClass && Math.abs(s.near - 0.01) < 1e-6);
  await page.keyboard.press('Digit1');
  await sleep(300);
  s = await state(page);
  check('X switches to the cockpit', s.mode === 'cockpit' && s.live && s.fpClass && s.near < 0.006 && s.hiddenFuselage, `near ${s.near}`);
  check('hook camera inset shown in the cockpit', s.pip && s.pipText.length > 0, s.pipText);
  const perf = async () => { const a = await H(page, () => window.__helicoptea.frames); await sleep(2000); return H(page, (a) => ({ fps: (window.__helicoptea.frames - a) / 2, calls: window.__helicoptea.renderer.info.render.calls, tris: window.__helicoptea.renderer.info.render.triangles }), a); };
  const pc = await perf();
  await page.keyboard.press('Digit1'); await sleep(300);
  const pch = await perf();
  await page.keyboard.press('Digit1'); await sleep(300);
  check('desktop frame rate in the cockpit (headless clock caps at 120)', pc.fps > 100, `cockpit ${JSON.stringify(pc)} vs chase ${JSON.stringify(pch)}`);
  await page.screenshot({ path: `${outDir}/e2e-micro-cockpit.png` });
  // Mouse free-look and zoom.
  const f0 = s.fov;
  await page.mouse.move(800, 450); await page.mouse.down(); await page.mouse.move(600, 520, { steps: 6 }); await page.mouse.up();
  await page.mouse.wheel(0, 300);
  await sleep(200);
  s = await state(page);
  check('mouse drag turns the head (left and down)', s.yaw > 0.4 && s.pitch < -0.15, `yaw ${s.yaw.toFixed(2)} pitch ${s.pitch.toFixed(2)}`);
  check('wheel zooms the cockpit field of view', s.fov > f0 + 2 || s.fov < f0 - 2, `${f0.toFixed(1)} -> ${s.fov.toFixed(1)}`);
  await page.keyboard.press('KeyU');
  // The head eases back over about half a second of frame time; a software renderer below 10 fps (frames
  // longer than the 0.1 s step cap) takes longer in wall time, so allow up to 5 s for it to arrive.
  await sleep(900);
  await page.waitForFunction(() => { const r = window.__helicoptea.fpRig; return Math.abs(r.lookYaw) < 0.02 && Math.abs(r.lookPitch) < 0.02 && r.fovZoom === 0; }, null, { timeout: 4100 }).catch(() => {});
  s = await state(page);
  check('U looks ahead again', Math.abs(s.yaw) < 0.02 && Math.abs(s.pitch) < 0.02 && s.zoom === 0);
  // Fly a little: the cockpit view follows, no errors.
  await page.keyboard.down('KeyW'); await sleep(900); await page.keyboard.up('KeyW');
  await page.keyboard.down('ArrowUp'); await sleep(500); await page.keyboard.up('ArrowUp');
  await sleep(500);
  s = await state(page);
  check('flying in the cockpit view keeps rendering', s.sim === 'flying' && s.frames > 60);
  // HUD button and pause menu.
  await page.click('#hud [data-act=view]');
  await sleep(200);
  s = await state(page);
  check('HUD camera button steps on to the locked chase', s.mode === 'locked' && !s.hiddenFuselage && !s.pip);
  await page.keyboard.press('Escape');
  await sleep(200);
  await page.click('.overlay.show [data-tab=camera]');
  await page.click('.overlay [data-act=view][data-id=cockpit]');
  await sleep(200);
  s = await state(page);
  const paused = await H(page, () => window.__helicoptea.paused);
  check('pause menu switches to the cockpit and stays paused', s.mode === 'cockpit' && paused);
  const sliders = await H(page, () => !!document.querySelector('[data-setting=fpMotion]') && !!document.querySelector('[data-setting=fpVibration]') && !!document.querySelector('[data-setting=fpFov]') && !!document.querySelector('[data-setting=loadCam]'));
  check('pause menu has cockpit field of view, head motion, vibration and hook camera settings', sliders);
  await page.click('.overlay.show [data-tab=camera]');
  await page.selectOption('[data-setting=loadCam]', 'off');
  await page.keyboard.press('Digit1');   // works from the pause menu too
  await sleep(150);
  s = await state(page);
  check('1 toggles the cockpit from the pause menu (back to the last camera)', s.mode === 'locked');
  await page.keyboard.press('Digit1');
  await page.keyboard.press('Escape');
  await sleep(300);
  s = await state(page);
  check('hook camera setting Off hides the inset', s.mode === 'cockpit' && !s.pip);
  await H(page, () => { document.querySelector('.overlay')?.classList.remove('show'); });
  await page.keyboard.press('Escape'); await sleep(150);
  await page.click('.overlay.show [data-tab=camera]');
  await page.selectOption('[data-setting=loadCam]', 'auto');
  await page.keyboard.press('Escape'); await sleep(200);

  // Near-plane clipping: the rotor keeps walls 10 cm away, so the closest things the eye can meet are
  // objects below the rotor disc. Hold the nose a few millimetres from the mug and the windowsill's edge.
  const spots = [
    ['mug', 0.14, 0.090, -0.13 + 0.047 + 0.0635 + 0.004, 0, 0],
    ['sill', -0.6, 0.03, -1.3 + 0.0635 + 0.004, 0, 0],
    ['sill-lookup', -0.6, 0.03, -1.3 + 0.0635 + 0.004, 0, 0.7],
  ];
  for (const [nm, x, y, z, yaw, lookP] of spots) {
    await H(page, () => window.__helicoptea.doAction('restart'));
    await sleep(250);
    await H(page, ([x, y, z, yaw, lookP]) => {
      const g = window.__helicoptea, s = g.sim;
      s.heli.body.setTranslation({ x, y, z }, true);
      s.heli.body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      s.heli.body.setLinvel({ x: 0, y: 0, z: 0 }, true); s.heli.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      g.fpRig.recentering = false; g.fpRig.lookYaw = 0; g.fpRig.lookPitch = lookP;
    }, [x, y, z, yaw, lookP]);
    await sleep(70);
    await page.screenshot({ path: `${outDir}/e2e-clip-${nm}.png` });
  }
  check('clipping screenshots near the wall, window and door written', true, 'inspect test-results/cockpit/e2e-clip-*.png');
  await H(page, () => window.__helicoptea.doAction('restart'));
  await sleep(400);

  // Crash from the cockpit: shake and flash in the seat, then out to the wreck; restart returns to the seat.
  // Watch every frame from the crash on and keep the strongest flash and seat hold: a single sample 60 ms
  // after the crash can fall past the flash on a slow software renderer (one frame there is ~100 ms).
  await H(page, () => {
    const g = window.__helicoptea, w = window.__crashWatch = { crashT: 0, flash: 0, frames: 0 };
    const tick = () => {
      if (g.sim.state === 'destroyed') { w.frames++; w.crashT = Math.max(w.crashT, g.fp.crashT); w.flash = Math.max(w.flash, parseFloat(document.querySelector('.fp-flash').style.opacity || '0')); }
      if (w.frames < 8) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    const s = g.sim; s.heli.body.setTranslation({ x: s.heli.pos.x, y: 0.25, z: s.heli.pos.z }, true); s.heli.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
  });
  await page.waitForFunction(() => window.__helicoptea.sim.state === 'destroyed', null, { timeout: 5000 }).catch(() => {});
  await sleep(60);
  await page.waitForFunction(() => window.__crashWatch.frames >= 3, null, { timeout: 5000 }).catch(() => {});
  const during = await H(page, () => ({ crashT: +window.__crashWatch.crashT.toFixed(3), flash: +window.__crashWatch.flash.toFixed(3) }));
  await page.screenshot({ path: `${outDir}/e2e-crash-0.png` });
  await sleep(700);
  s = await state(page);
  await page.screenshot({ path: `${outDir}/e2e-crash-1.png` });
  check('crash in the cockpit flashes and holds the seat briefly', during.crashT > 0 && during.flash > 0.2, JSON.stringify(during));
  check('then the camera leaves the wreck', s.sim === 'destroyed' && !s.live && s.near === 0.01 && !s.pip);
  await page.keyboard.press('KeyR');
  await sleep(500);
  s = await state(page);
  check('restart puts you back in the seat, looking ahead', s.sim === 'flying' && s.live && s.mode === 'cockpit' && Math.abs(s.yaw) < 1e-6);
  // Repeated crash/restart cycles in first person.
  for (let i = 0; i < 12; i++) {
    await H(page, () => { const s = window.__helicoptea.sim; if (s.heli) { s.heli.body.setLinvel({ x: 0, y: -3, z: 0 }, true); s.heli.body.setTranslation({ x: s.heli.pos.x, y: 0.2, z: s.heli.pos.z }, true); } });
    await sleep(220);
    await page.keyboard.press('KeyR');
    await sleep(160);
  }
  await sleep(500);
  s = await state(page);
  const fr0 = s.frames; await sleep(2000); const fr1 = (await state(page)).frames;
  check('12 crash/restart cycles from the cockpit stay healthy', s.sim === 'flying' && s.live, `${s.sim}${s.live ? '' : ', not live'}`);
  check('frame rate after 12 crash/restart cycles from the cockpit', (fr1 - fr0) / 2 > 50, `${((fr1 - fr0) / 2).toFixed(0)} fps`);
  // Chinook from the cockpit.
  await page.keyboard.press('KeyV');
  await sleep(600);
  s = await state(page);
  await page.screenshot({ path: `${outDir}/e2e-chinook-cockpit.png` });
  check('switching to the Chinook keeps the cockpit view', s.mode === 'cockpit' && s.live && s.hiddenFuselage);
  await H(page, () => { const s = window.__helicoptea.sim; s.heli.body.setTranslation({ x: s.heli.pos.x, y: 0.25, z: s.heli.pos.z }, true); s.heli.body.setLinvel({ x: 0, y: -3.5, z: 0 }, true); });
  await page.waitForFunction(() => window.__helicoptea.sim.state === 'destroyed', null, { timeout: 5000 }).catch(() => {});
  await sleep(900);
  s = await state(page);
  const debris = await H(page, () => window.__helicoptea.view.debris.size);
  await page.screenshot({ path: `${outDir}/e2e-chinook-crash.png` });
  check('Chinook crash from the cockpit leaves visible debris', s.sim === 'destroyed' && debris >= 10, `${debris} pieces`);
  const debrisVisible = await H(page, () => [...window.__helicoptea.view.debris.values()].every((v) => { let ok = true; v.mesh.traverse((o) => { if (o.isMesh && o.material && !Array.isArray(o.material) && o.material.colorWrite === false) ok = false; }); return ok; }));
  check('debris uses the real materials, not the shadow-only stand-ins', debrisVisible);
  await page.keyboard.press('KeyR');
  await sleep(500);
  s = await state(page);
  check('Chinook restart returns to its cockpit', s.live && s.mode === 'cockpit');
  await page.keyboard.press('KeyV'); await sleep(600);
  s = await state(page);
  const ac = await H(page, () => window.__helicoptea.sim.aircraft);
  await page.screenshot({ path: `${outDir}/e2e-skycrane-cockpit.png` });
  check('skycrane has its own cockpit', ac === 'skycrane' && s.mode === 'cockpit' && s.live && s.hiddenFuselage, ac);
  await H(page, () => { const s = window.__helicoptea.sim; s.heli.body.setTranslation({ x: s.heli.pos.x, y: 0.25, z: s.heli.pos.z }, true); s.heli.body.setLinvel({ x: 0, y: -3.5, z: 0 }, true); });
  await page.waitForFunction(() => window.__helicoptea.sim.state === 'destroyed', null, { timeout: 5000 }).catch(() => {});
  await sleep(900);
  s = await state(page);
  check('skycrane crash from the cockpit pulls out to the wreck', s.sim === 'destroyed' && !s.live);
  await page.keyboard.press('KeyR'); await sleep(500);
  s = await state(page);
  check('skycrane restart returns to its cockpit', s.live && s.mode === 'cockpit');
  await page.keyboard.press('KeyV'); await sleep(300);
  check('no console errors (desktop)', logs.length === 0, logs.slice(0, 4).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- gamepad
{
  const { ctx, page, logs } = await open('?aircraft=micro&view=chase', { width: 1280, height: 720 }, { gamepad: true });
  await start(page);
  // A tap the game sees at any frame rate: the pad is polled once a frame, so the button is down for exactly
  // one frame, set and cleared from inside the page. A wall-clock hold can fall between two slow frames,
  // or span three and count as a hold (L3 held 0.3 s looks around instead of changing camera).
  const press = async (i) => {
    await H(page, (i) => new Promise((res) => {
      const g = window.__helicoptea, w0 = performance.now();
      window.__pad.buttons[i] = { pressed: true, value: 1 };
      const f0 = g.frames;
      const tick = () => {
        if (g.frames > f0 || performance.now() - w0 > 3000) { window.__pad.buttons[i] = { pressed: false, value: 0 }; const f1 = g.frames; const done = () => (g.frames > f1 || performance.now() - w0 > 3000 ? res() : requestAnimationFrame(done)); requestAnimationFrame(done); return; }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), i);
    await sleep(80);
  };
  await press(10);
  let s = await state(page);
  check('pad: L3 switches to the cockpit', s.mode === 'cockpit', s.mode);
  // L3 held + right stick: look, and the cyclic stays centred; releasing L3 after looking doesn't toggle.
  await H(page, () => { window.__pad.buttons[10] = { pressed: true, value: 1 }; window.__pad.axes[2] = 0.9; window.__pad.axes[3] = 0.6; });
  await sleep(500);
  s = await state(page);
  check('pad: hold L3 + right stick looks around', s.yaw < -0.3 && s.pitch < -0.2, `yaw ${s.yaw.toFixed(2)} pitch ${s.pitch.toFixed(2)}`);
  // Default (Aim) layout: the right stick flies pitch and yaw.
  check('pad: the right stick stops flying while looking', Math.abs(s.ctl.pitch) < 1e-6 && Math.abs(s.ctl.yaw) < 1e-6, JSON.stringify(s.ctl));
  await H(page, () => { window.__pad.buttons[10] = { pressed: false, value: 0 }; });
  await sleep(150);
  s = await state(page);
  check('pad: releasing L3 gives the stick back to the flight controls and stays in the cockpit', Math.abs(s.ctl.yaw) > 0.3 && s.mode === 'cockpit', JSON.stringify(s.ctl));
  const lb = await (async () => { await H(page, () => { window.__pad.buttons[4] = { pressed: true, value: 1 }; }); await sleep(200); const r = await state(page); await H(page, () => { window.__pad.buttons[4] = { pressed: false, value: 0 }; }); return r; })();
  check('pad: LB (mark) leaves the view and sticks alone', Math.abs(lb.ctl.yaw) > 0.3 && lb.mode === 'cockpit');
  await H(page, () => { window.__pad.axes[2] = 0; window.__pad.axes[3] = 0; });
  // D-pad glance.
  const y0 = s.yaw;
  await H(page, () => { window.__pad.buttons[14] = { pressed: true, value: 1 }; }); await sleep(400); await H(page, () => { window.__pad.buttons[14] = { pressed: false, value: 0 }; });
  s = await state(page);
  check('pad: d-pad glances around in the cockpit', s.yaw > y0 + 0.3, `${y0.toFixed(2)} -> ${s.yaw.toFixed(2)}`);
  await press(1);  // B recenters
  await sleep(900);
  s = await state(page);
  check('pad: B looks ahead again', Math.abs(s.yaw) < 0.02);
  await press(10);
  s = await state(page);
  check('pad: L3 again steps on to the locked chase', s.mode === 'locked');
  check('no console errors (gamepad)', logs.length === 0, logs.slice(0, 4).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- touch phone (landscape)
{
  const { ctx, page, logs } = await open('?aircraft=micro&view=chase', { width: 844, height: 390 }, { touch: true, mobile: true, dpr: 2 });
  await page.tap('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await H(page, () => window.__helicoptea.doAction('skiphints'));
  await sleep(400);
  await page.tap('#hud [data-act=view]');
  await sleep(300);
  let s = await state(page);
  check('touch: cockpit button switches view', s.mode === 'cockpit' && s.live);
  // Drag on open screen (top middle, clear of the sticks) to look.
  const cdp = await ctx.newCDPSession(page);
  const tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7 }] });
  await tp('touchStart', 420, 120);
  for (let k = 1; k <= 6; k++) { await tp('touchMove', 420 - k * 18, 120 + k * 6); await sleep(16); }
  await tp('touchEnd');
  await sleep(150);
  s = await state(page);
  check('touch: dragging open screen looks around', s.yaw > 0.25, `yaw ${s.yaw.toFixed(2)} pitch ${s.pitch.toFixed(2)}`);
  const overlaps = await H(page, () => {
    const r = document.querySelector('.loadcam').getBoundingClientRect();
    const hit = (e) => { const q = e.getBoundingClientRect(); return q.width > 0 && !(q.right <= r.left || q.left >= r.right || q.bottom <= r.top || q.top >= r.bottom); };
    return [...document.querySelectorAll('.stick-zone, .touch-btn:not(.hidden), .hud-tl .pill, .hud-tr .icon-btn')].filter(hit).map((e) => e.className);
  });
  check('touch: hook camera inset clear of the sticks and buttons', overlaps.length === 0, overlaps.join(', '));
  await page.screenshot({ path: `${outDir}/e2e-touch-cockpit.png` });
  // Throttled phone-class CPU: frame rate in the cockpit.
  // Settle for a moment after the throttle starts (the first throttled frames catch up the simulation), then
  // take the median of three 2 s windows timed by the page's own clock, so one busy moment on the machine
  // running the test doesn't decide it.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await sleep(1500);
  const windows = [];
  for (let w = 0; w < 3; w++) {
    windows.push(await H(page, async () => { const g = window.__helicoptea, f0 = g.frames, t0 = performance.now(); await new Promise((r) => setTimeout(r, 2000)); return (g.frames - f0) / ((performance.now() - t0) / 1000); }));
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const fps4x = windows.slice().sort((a, b) => a - b)[1];
  check('touch: cockpit frame rate at 4x CPU throttle (medium tier)', fps4x > 30, `${fps4x.toFixed(0)} fps (median of ${windows.map((x) => x.toFixed(0)).join(', ')})`);
  check('no console errors (touch)', logs.length === 0, logs.slice(0, 4).join(' | '));
  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(outDir, 'e2e-cockpit.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
