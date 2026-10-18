// Flight recording, replay viewer and notes in a real browser (local Chrome via playwright-core):
// recording while flying, marking moments (keyboard N, gamepad R3, touch Mark), the viewer from the pause
// menu and from the crash screen, play / pause / slow motion / frame step / scrubbing, chase, orbit and
// cockpit cameras, replay exactness against the recorded snapshots, notes typed and tagged in the viewer,
// saving to logs/flights through the server endpoint and loading back, and console errors.
// Usage: npm run build && npx vite preview --port 4191, then node tests/e2e-replay.mjs [baseUrl]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { tapGamepad } from './gamepad-tap.mjs';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4191/';
const outDir = path.resolve('test-results/replay');
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
  await sleep(400);
};
const H = (page, fn, arg) => page.evaluate(fn, arg);
const rp = (page) => H(page, () => {
  const g = window.__helicoptea, R = g.replay, f = R.flight;
  return {
    active: R.active, playing: R.playing, s: R.s, rate: R.rate, cam: R.cam, n: f ? f.n : 0, id: f ? f.id : null, notes: f ? f.notes.map((n) => ({ tag: n.tag, text: n.text, wall: n.wall, source: n.source })) : [],
    wall: f ? f.wallAt(R.s) : 0, dur: f ? f.wallDuration() : 0, aircraft: f ? f.aircraft : null, saved: f ? f.saved : false, savedPath: f ? f.savedPath : '',
    visible: !document.getElementById('replay').classList.contains('hidden'), hudHidden: getComputedStyle(document.getElementById('hud')).display === 'none',
    paused: g.paused, simTime: g.sim.time, near: g.camRig.camera.near, cockpitView: R.cockpitView, store: g.flightStore.available,
    camPos: g.camRig.camera.position.toArray(), stageAlive: R.stage.alive,
  };
});
// Hold keys for a while (real keyboard events).
const hold = async (page, keys, ms) => { for (const k of keys) await page.keyboard.down(k); await sleep(ms); for (const k of keys) await page.keyboard.up(k); };

// ---------------------------------------------------------------- desktop keyboard, micro heli
{
  const { ctx, page, logs } = await open('?aircraft=micro&view=chase');
  await start(page);
  const t0 = await H(page, () => window.__helicoptea.recorder.current?.n || 0);
  await hold(page, ['KeyW'], 1400);
  await hold(page, ['ArrowUp', 'KeyD'], 700);
  await sleep(400);
  await page.keyboard.press('KeyN');
  await sleep(150);
  const toast = await H(page, () => document.querySelector('.toast').textContent);
  await hold(page, ['ArrowDown'], 500);
  await sleep(800);
  const rec = await H(page, () => { const f = window.__helicoptea.recorder.current; return { n: f.n, hz: f.recordHz, notes: f.notes.map((n) => n.tag), ms: window.__helicoptea.recorder.recordMs, steps: f.n * 4 }; });
  check('flight is recorded while flying (60 Hz)', rec.n > t0 + 150 && rec.hz === 60, `${rec.n} samples`);
  check('N marks the moment in flight', rec.notes.includes('mark') && /Marked/.test(toast), toast);
  check('recording overhead in the browser is negligible', rec.ms / rec.steps < 0.05, `${(rec.ms / rec.steps * 1000).toFixed(1)} µs per physics step`);

  // Pause → Flight replay.
  await page.keyboard.press('Escape');
  await sleep(250);
  await page.click('.overlay [data-act=replay]');
  await sleep(500);
  let s = await rp(page);
  const liveN = await H(page, () => window.__helicoptea.recorder.current.n);
  check('pause menu opens the replay viewer on this flight', s.active && s.visible && s.hudHidden && s.paused && s.n >= rec.n && s.n === liveN, `n ${s.n}`);
  check('viewer starts playing near the end of the flight', s.playing && s.wall > s.dur - 8.5);
  const simT = s.simTime;
  await sleep(600);
  s = await rp(page);
  check('the world stays frozen while replaying', Math.abs(s.simTime - simT) < 1e-9);
  // Exactness: the posed aircraft equals the recorded sample at an integer index.
  const exact = await H(page, () => {
    const g = window.__helicoptea, R = g.replay, f = R.flight;
    R.playing = false;
    let worst = 0;
    for (const i of [20, 60, Math.floor(f.n / 2), f.n - 5]) {
      R.seek(i); R.update(0);
      const m = g.view.heliModel.position, row = f.samples.row(i);
      worst = Math.max(worst, Math.abs(m.x - row[32]), Math.abs(m.y - row[33]), Math.abs(m.z - row[34]));
    }
    return worst;
  });
  check('replayed aircraft sits exactly where the snapshot says', exact < 1e-6, `worst ${exact.toExponential(1)} m`);
  // Keyboard transport.
  await page.keyboard.press('Home'); await sleep(100);
  await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
  await sleep(100);
  s = await rp(page);
  check('frame step (→) advances exactly one sample each', !s.playing && Math.abs(s.s - 3) < 1e-6, `s ${s.s}`);
  await page.keyboard.press('ArrowLeft'); await sleep(80);
  s = await rp(page);
  check('frame step back (←)', Math.abs(s.s - 2) < 1e-6);
  await page.keyboard.press('BracketLeft'); await page.keyboard.press('BracketLeft'); await sleep(50);
  s = await rp(page);
  check('[ slows playback down', s.rate === 0.25, `${s.rate}×`);
  const w0 = s.wall;
  await page.keyboard.press('Space');
  await sleep(1000);
  await page.keyboard.press('Space');
  s = await rp(page);
  const adv = s.wall - w0;
  check('slow motion plays at a quarter of the speed it was flown', adv > 0.17 && adv < 0.36, `${adv.toFixed(3)} s in 1 s at 0.25×`);
  // Scrub on the timeline.
  const tl = await page.locator('.rp-timeline').boundingBox();
  await page.mouse.click(tl.x + tl.width * 0.5, tl.y + tl.height / 2);
  await sleep(100);
  s = await rp(page);
  check('clicking the timeline scrubs there', Math.abs(s.wall - s.dur * 0.5) < 0.1, `${s.wall.toFixed(2)} of ${s.dur.toFixed(2)}`);
  const gr = await page.locator('.rp-graphs').boundingBox();
  await page.mouse.move(gr.x + gr.width * 0.2, gr.y + gr.height / 2); await page.mouse.down(); await page.mouse.move(gr.x + gr.width * 0.8, gr.y + gr.height / 2, { steps: 5 }); await page.mouse.up();
  const s2 = await rp(page);
  check('dragging across the graphs scrubs', s2.wall > s.wall + 1, `${s.wall.toFixed(2)} -> ${s2.wall.toFixed(2)}`);
  // Cameras.
  await page.keyboard.press('Digit2'); await sleep(200);
  const pa = (await rp(page)).camPos;
  await page.mouse.move(800, 300); await page.mouse.down(); await page.mouse.move(650, 340, { steps: 5 }); await page.mouse.up();
  await page.mouse.wheel(0, 400); await sleep(200);
  s = await rp(page);
  check('orbit camera: drag and wheel move it', s.cam === 'orbit' && Math.hypot(s.camPos[0] - pa[0], s.camPos[1] - pa[1], s.camPos[2] - pa[2]) > 0.02);
  await page.screenshot({ path: `${outDir}/viewer-orbit.png` });
  await page.keyboard.press('Digit3'); await sleep(250);
  s = await rp(page);
  check('cockpit camera in the replay', s.cam === 'cockpit' && s.cockpitView && s.near < 0.006, `near ${s.near}`);
  await page.screenshot({ path: `${outDir}/viewer-cockpit.png` });
  await page.keyboard.press('Digit1'); await sleep(250);
  s = await rp(page);
  check('chase camera back', s.cam === 'chase' && !s.cockpitView && Math.abs(s.near - 0.01) < 1e-6);
  await page.screenshot({ path: `${outDir}/viewer-chase.png` });
  // Notes: G opens a good note, typing and Enter saves it at the playhead; the mark from flight gets text.
  await page.keyboard.press('KeyG'); await sleep(120);
  await page.keyboard.type('Nice settle into the hover');
  await page.keyboard.press('Enter'); await sleep(150);
  await page.fill('.rp-input', 'Pitched up too much here');
  await page.click('[data-rp=add][data-tag=bad]');
  await sleep(100);
  const markInput = page.locator('.rp-list li.mark .rp-ntext');
  await markInput.fill('This is where the yaw kicked');
  await markInput.press('Enter');
  await sleep(1200);
  // Saves are queued (binary, then header) behind the notes debounce; on a slow machine allow them to land.
  await page.waitForFunction(() => { const f = window.__helicoptea.replay.flight; return f && f.saved && !f.dirty && window.__helicoptea.flightStore.saving === 0; }, null, { timeout: 10000 }).catch(() => {});
  s = await rp(page);
  const tags = s.notes.map((n) => n.tag).sort().join(',');
  check('notes typed and tagged in the viewer', tags === 'bad,good,mark' && s.notes.some((n) => n.text === 'Nice settle into the hover' && n.tag === 'good') && s.notes.some((n) => n.tag === 'mark' && n.text === 'This is where the yaw kicked'), tags);
  check('flight and notes saved to logs/flights', s.store === true && s.saved && /logs\/flights\//.test(s.savedPath), s.savedPath);
  const onDisk = path.resolve(s.savedPath || 'none');
  const disk = fs.existsSync(onDisk) ? JSON.parse(fs.readFileSync(onDisk, 'utf8')) : null;
  check('the saved JSON has the notes and the binary is next to it', disk && disk.notes.length === 3 && disk.notes.some((n) => n.text === 'This is where the yaw kicked') && fs.existsSync(onDisk.replace(/\.json$/, '.bin')), onDisk);
  await page.screenshot({ path: `${outDir}/viewer-notes.png` });
  // Close returns to the pause menu.
  await page.keyboard.press('Escape'); await sleep(250);
  s = await rp(page);
  const pauseShown = await H(page, () => window.__helicoptea.hud?.modalKind ?? document.querySelector('.overlay.show [aria-label=Paused]') !== null);
  check('Esc closes the viewer back to the pause menu', !s.active && !s.visible && s.paused && pauseShown);

  // Crash, then Watch replay from the crash screen.
  await page.keyboard.press('Escape'); await sleep(200);
  await H(page, () => window.__helicoptea.sim.crash('impact', 2));
  await sleep(1500);
  // Hold the playhead where the viewer opens it: on a slow software renderer the click and the reads below
  // can take seconds of wall time, enough at 1x to play past the crash before it is measured.
  await H(page, () => { window.__helicoptea.replay.rate = 0; });
  await page.click('.crash [data-act=replay]');
  await sleep(400);
  s = await rp(page);
  const crash = await H(page, () => window.__helicoptea.replay.flight.crash());
  check('crash screen opens the replay a few seconds before the crash', s.active && crash && s.wall < crash.wall + 0.5 && s.wall > crash.wall - 6.5, `at ${s.wall.toFixed(2)}, crash ${crash && crash.wall.toFixed(2)}`);
  await H(page, () => { window.__helicoptea.replay.rate = 1; });
  // Play on through the crash (at 1x; give a slow machine time to get there).
  await page.waitForFunction(() => window.__helicoptea.replay.stage.alive === false, null, { timeout: 30000 }).catch(() => {});
  await sleep(300);
  s = await rp(page);
  const deb = await H(page, () => [...window.__helicoptea.replay.stage.debris.values()].filter((m) => m.visible).length);
  check('the crash replays with its wreckage', s.stageAlive === false && deb >= 6, `${deb} pieces visible`);
  await page.screenshot({ path: `${outDir}/viewer-crash.png` });
  await page.click('[data-rp=close]'); await sleep(300);
  s = await rp(page);
  const crashVisible = await H(page, () => document.querySelector('.crash').classList.contains('show'));
  check('closing returns to the crash screen with the world running', !s.active && !s.paused && crashVisible);
  // Restart ends that flight; the earlier flight can be picked and loaded back from disk.
  await page.keyboard.press('KeyR'); await sleep(1200);
  const flights = await H(page, () => window.__helicoptea.recorder.flights.map((f) => ({ id: f.id, ended: f.ended, saved: f.saved })));
  check('restart ends the flight and saves it', flights.length >= 2 && flights[flights.length - 2].ended && flights[flights.length - 2].saved, JSON.stringify(flights.slice(-2)));
  const loaded = await H(page, async (id) => { const f = await window.__helicoptea.flightStore.load(id); return { n: f.n, notes: f.notes.length, ents: f.entities.size }; }, flights[flights.length - 2].id);
  check('a saved flight loads back from disk', loaded.n > 100 && loaded.notes === 3 && loaded.ents > 5, JSON.stringify(loaded));
  check('no console errors (keyboard)', logs.length === 0, logs.slice(0, 4).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- gamepad, Chinook
{
  const { ctx, page, logs } = await open('?aircraft=chinook&view=chase', { width: 1280, height: 720 }, { gamepad: true });
  await page.evaluate(() => { window.__pad.buttons[0] = { pressed: true, value: 1 }; });
  await sleep(150);
  await page.evaluate(() => { window.__pad.buttons[0] = { pressed: false, value: 0 }; });
  await page.waitForFunction(() => window.__helicoptea?.started, null, { timeout: 5000 }).catch(() => {});
  if (!(await H(page, () => window.__helicoptea.started))) await start(page);
  await H(page, () => window.__helicoptea.doAction('skiphints'));
  // Replay and flight each poll the mocked pad. Deliver one pressed/released sample to the active
  // consumer rather than relying on RAF callback order, which can turn a tap into a held D-pad repeat.
  const press = async (i) => {
    await tapGamepad(page, i);
    await sleep(120);
  };
  await page.evaluate(() => { window.__pad.axes[1] = -0.9; });
  await sleep(1500);
  await page.evaluate(() => { window.__pad.axes[1] = 0; window.__pad.axes[3] = -0.6; });
  await sleep(600);
  await page.evaluate(() => { window.__pad.axes[3] = 0; });
  await press(11);  // R3 marks
  let notes = await H(page, () => window.__helicoptea.recorder.current.notes.map((n) => n.tag));
  check('gamepad R3 marks the moment', notes.includes('mark'));
  const gp = await H(page, () => { const f = window.__helicoptea.recorder.current; let m = 0; for (let i = 0; i < f.n; i++) m = Math.min(m, f.samples.get(i, 26)); return { src: f.samples.get(f.n - 1, 4), minAx1: m }; });
  check('raw gamepad axes and device are logged', gp.src === 1 && gp.minAx1 < -0.85, JSON.stringify(gp));
  // Crash, then pick Watch replay on the crash screen with the D-pad and A.
  await H(page, () => window.__helicoptea.sim.crash('impact', 2));
  await sleep(1200);
  await press(13); // d-pad down to Watch replay (Restart is focused first)
  const focused = await H(page, () => document.activeElement?.dataset?.act);
  if (focused !== 'replay') await press(15);
  await press(0);
  await sleep(300);
  let s = await rp(page);
  check('gamepad: crash screen → Watch replay', s.active && s.aircraft === 'chinook', `focused ${focused}`);
  await press(0); // A: pause
  await page.waitForFunction(() => window.__helicoptea.replay.active && !window.__helicoptea.replay.playing, null, {timeout:3000});
  s = await rp(page);
  const sA = s.s;
  await press(15); await press(15); // d-pad right: two frames
  s = await rp(page);
  check('gamepad: A pauses, D-pad steps frames', !s.playing && Math.abs(s.s - (Math.round(sA) + 2)) < 1e-6, `${sA} -> ${s.s}`);
  await press(4); await press(4);
  s = await rp(page);
  check('gamepad: LB slows the playback', s.rate === 0.25);
  await press(13); // camera next
  s = await rp(page);
  check('gamepad: D-pad down changes camera', s.cam === 'orbit');
  await page.evaluate(() => { window.__pad.buttons[7] = { pressed: true, value: 1 }; });
  const w1 = s.wall;
  await sleep(500);
  await page.evaluate(() => { window.__pad.buttons[7] = { pressed: false, value: 0 }; });
  s = await rp(page);
  check('gamepad: right trigger scrubs forward', s.wall > w1 + 0.5, `${w1.toFixed(2)} -> ${s.wall.toFixed(2)}`);
  await press(3); // Y: good note
  await press(2); // X: bad note
  s = await rp(page);
  check('gamepad: Y and X drop good and bad notes', s.notes.filter((n) => n.source === 'viewer').map((n) => n.tag).sort().join(',') === 'bad,good');
  await page.screenshot({ path: `${outDir}/viewer-gamepad-chinook.png` });
  await press(1); // B closes
  s = await rp(page);
  check('gamepad: B closes the viewer', !s.active);
  check('no console errors (gamepad)', logs.length === 0, logs.slice(0, 4).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- touch phone, skycrane
{
  const { ctx, page, logs } = await open('?aircraft=skycrane&view=chase', { width: 844, height: 390 }, { touch: true, mobile: true, dpr: 2 });
  await start(page);
  const cdp = await ctx.newCDPSession(page);
  const tap = async (sel) => { const b = await page.locator(sel).boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(200); };
  await H(page, () => { window.__helicoptea.input.touch.collective = 0.9; });
  await sleep(1200);
  await H(page, () => { window.__helicoptea.input.touch.collective = 0; });
  // Touch marks from the pause menu (the moment you paused), then flies on.
  await tap('.hud-tr [data-act=pause]');
  const markBtn = await page.locator('.overlay [data-act=markNow]').boundingBox();
  check('touch: Mark this moment shown in Pause', !!markBtn && markBtn.width > 30);
  await page.locator('.overlay [data-act=markNow]').scrollIntoViewIfNeeded();   // the menu scrolls on a short phone
  await tap('.overlay [data-act=markNow]');
  let notes = await H(page, () => window.__helicoptea.recorder.current.notes.map((n) => n.tag));
  const menuOpen = await H(page, () => !!document.querySelector('.overlay.show .menu'));
  check('touch: Mark this moment marks it and resumes', notes.includes('mark') && !menuOpen, JSON.stringify({ notes, menuOpen }));
  // Pause (‖) then Flight replay.
  await tap('.hud-tr [data-act=pause]');
  await tap('.overlay [data-act=replay]');
  await sleep(400);
  let s = await rp(page);
  check('touch: viewer opens from the pause menu', s.active && s.aircraft === 'skycrane');
  const hose = await H(page, () => window.__helicoptea.view.skycrane.hose.mesh.visible);
  check('skycrane hose is replayed', hose);
  await tap('[data-rp=play]');
  s = await rp(page);
  const sp = s.s;
  await tap('[data-rp=prev]');
  s = await rp(page);
  check('touch: play/pause and frame step buttons', !s.playing && Math.abs(s.s - (Math.round(sp) - 1)) < 1e-6);
  const tl = await page.locator('.rp-timeline').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tl.x + tl.width * 0.2, y: tl.y + tl.height / 2, id: 3 }] });
  for (let k = 1; k <= 5; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tl.x + tl.width * (0.2 + k * 0.1), y: tl.y + tl.height / 2, id: 3 }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(100);
  s = await rp(page);
  check('touch: dragging the timeline scrubs', Math.abs(s.wall - s.dur * 0.7) < s.dur * 0.08, `${s.wall.toFixed(2)} / ${s.dur.toFixed(2)}`);
  await tap('[data-rp=cam].on');  // on a phone the camera button cycles: chase -> orbit
  const pa = (await rp(page)).camPos;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 420, y: 150, id: 5 }] });
  for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 420 - k * 20, y: 150, id: 5 }] }); await sleep(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(150);
  s = await rp(page);
  check('touch: dragging the picture orbits the camera', s.cam === 'orbit' && Math.hypot(s.camPos[0] - pa[0], s.camPos[2] - pa[2]) > 0.02, s.cam);
  await tap('[data-rp=notes]');
  await page.fill('.rp-input', 'Hose swung into the cup');
  await tap('[data-rp=add][data-tag=bad]');
  s = await rp(page);
  check('touch: typed note tagged bad', s.notes.some((n) => n.tag === 'bad' && n.text === 'Hose swung into the cup'));
  // Everything fits on the phone screen.
  const off = await H(page, () => [...document.querySelectorAll('#replay .rp-bottom, #replay .rp-top, #replay .rp-notes')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => e.getBoundingClientRect()).filter((r) => r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1).length);
  check('touch: viewer fits the phone screen', off === 0);
  await page.screenshot({ path: `${outDir}/viewer-touch-skycrane.png` });
  await tap('[data-rp=close]');
  s = await rp(page);
  check('touch: Close returns to the game', !s.active);
  check('no console errors (touch)', logs.length === 0, logs.slice(0, 4).join(' | '));
  await ctx.close();
}

await browser.close();
const failed = results.filter((r) => !r.ok);
fs.writeFileSync(`${outDir}/e2e-replay.json`, JSON.stringify(results, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} replay browser checks passed`);
if (failed.length) process.exit(1);
