// Browser checks for the skycrane tanker, using the locally installed Chrome (no browser download).
// Usage: start a server, then: node tests/e2e-skycrane.mjs [baseUrl] [--headed]
// Picks the skycrane, flies it with the in-page autopilot on the real input pipeline, and drives the tank
// with real devices: keyboard (T pump, Z/X reel, G doors, double-tap G salvo, double-tap T auto-fill),
// an emulated standard gamepad (default layout: RT analog doors, LB pump, double LB auto-fill, d-pad reel,
// double RT salvo; Classic: LT analog pump, both bumpers auto-fill) and touch (Doors, Pump, Hose buttons). Screenshots and a report go to test-results/sky-*.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4179/';
const headed = process.argv.includes('--headed');
const outDir = path.resolve('test-results', process.env.SKY_LABEL || '');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));
const report = { base, when: new Date().toISOString(), checks: [], perf: {} };
const check = (name, ok, detail = '') => { report.checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ executablePath: CHROME, headless: !headed,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function open(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1, hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  if (opts.gamepad) await ctx.addInitScript(() => {
    window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    const pad = () => ({ id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', axes: window.__pad.axes.slice(), buttons: window.__pad.buttons.map((b) => ({ ...b })), timestamp: performance.now() });
    navigator.getGamepads = () => [pad(), null, null, null];
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + (opts.query || '?worldSpeed=1&aircraft=skycrane'), { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  return { ctx, page, logs };
}
const start = async (page) => { await page.click('#start-btn'); await page.waitForFunction(() => window.__helicoptea?.started); await sleep(600); };
const shot = (page, name) => page.screenshot({ path: path.join(outDir, `sky-${name}.png`) });
// A keyboard double tap: two 40 ms presses 90 ms apart, stamped with when the keys went down. Each CDP
// event waits for a busy page to take it, so on a slow renderer the second press would otherwise arrive
// much later; the game times double taps by the key event's own timestamp.
async function doubleTapKey(page, code) {
  const cdp = await page.context().newCDPSession(page), key = code.slice(3).toLowerCase(), vk = code.charCodeAt(3), t0 = Date.now() / 1000;
  for (const [type, dt] of [['keyDown', 0], ['keyUp', 0.04], ['keyDown', 0.09], ['keyUp', 0.13]]) {
    await cdp.send('Input.dispatchKeyEvent', { type, code, key, text: type === 'keyDown' ? key : undefined, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, timestamp: t0 + dt });
  }
  await cdp.detach();
}
const errors = (logs) => logs.filter((l) => l.includes('pageerror') || l.startsWith('[error]'));
async function installPilot(page) {
  await page.evaluate(() => {
    const H = window.__helicoptea;
    const ap = new H.Autopilot();
    const orig = H.input.update.bind(H.input);
    window.__pilot = { ap, on: false };
    H.input.update = (dt) => {
      const c = orig(dt);
      if (!window.__pilot.on || !H.sim.heli) return c;
      const out = ap.update(H.sim.heli, null, null, dt);
      c.pitch = out.pitch; c.roll = out.roll; c.yaw = out.yaw; c.collective = out.collective;
      return c;
    };
  });
}
const fly = (page, x, y, z, speed, ms) => page.evaluate(([x, y, z, speed]) => { const P = window.__pilot; P.on = true; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed; }, [x, y, z, speed]).then(() => sleep(ms));
const st = (page) => page.evaluate(() => {
  const s = window.__helicoptea.sim, h = s.heli, t = h && h.tank;
  return { state: s.state, type: h && h.type, pos: h ? h.pos.toArray() : null, vol: t ? t.vol : 0, cap: t ? t.capacity : 1, doors: t ? t.doors : 0, pump: t ? t.pump : 0, pumping: t ? t.pumping : false,
    salvo: t ? t.salvo : false, auto: t && t.auto ? t.auto.phase : null, hose: h && h.hose ? h.hose.length : 0, sub: h && h.hose && h.hose.submerged ? h.hose.submerged.name : null,
    teacup: s.cups[1].milk, bowl: [s.milk.bowl.x, s.milk.bowl.z], cup: [s.cups[1].x, s.cups[1].z], parcels: s.milk.parcels.length,
    prompt: document.querySelector('.prompt')?.classList.contains('show') ? document.querySelector('.prompt').textContent : '',
    gauge: !document.querySelector('.tank-gauge')?.classList.contains('hidden'), ctl: { ...window.__helicoptea.input.ctl } };
});

try {
  // ------------------------------------------------------------ keyboard: the whole tanker loop
  {
    const { ctx, page, logs } = await open({ width: 1600, height: 900 }, { query: '?worldSpeed=1&aircraft=skycrane&debug=1' });
    await shot(page, '00-picker');
    const picked = await page.evaluate(() => document.querySelector('[data-aircraft="skycrane"]')?.classList.contains('on'));
    check('start screen offers the skycrane (and it is picked from the URL)', picked);
    await start(page);
    let s = await st(page);
    check('skycrane spawns on the pad with its tank gauge', s.type === 'skycrane' && s.state === 'flying' && s.gauge, JSON.stringify(s.pos));
    await page.evaluate(() => { const H = window.__helicoptea; H.input.camOrbit.zoom = -0.35; H.input.camOrbit.yaw = 2.4; H.input.camOrbit.pitch = 0.05; });
    await sleep(900);
    await shot(page, '01-on-pad');
    await page.evaluate(() => { const H = window.__helicoptea; H.input.camOrbit.zoom = 0; H.input.camOrbit.yaw = 0; H.input.camOrbit.pitch = 0; });
    await installPilot(page);
    await fly(page, -0.56, 0.42, 0.24, 0.3, 2500);
    // reel with X / Z
    const h0 = (await st(page)).hose;
    await page.keyboard.down('KeyX'); await sleep(900); await page.keyboard.up('KeyX');
    const h1 = (await st(page)).hose;
    await page.keyboard.down('KeyZ'); await sleep(500); await page.keyboard.up('KeyZ');
    const h2 = (await st(page)).hose;
    check('X reels the snorkel out, Z reels it in', h1 > h0 + 0.03 && h2 < h1 - 0.02, `${h0.toFixed(3)} -> ${h1.toFixed(3)} -> ${h2.toFixed(3)} m`);
    await page.keyboard.down('KeyT'); await sleep(500);
    s = await st(page);
    await page.keyboard.up('KeyT');
    check('T spins the pump, but nothing comes up through thin air', s.pump > 0.5 && s.vol === 0, `pump ${s.pump.toFixed(2)}`);
    await shot(page, '02-hover-hose');
    // over the crock, low
    await fly(page, s.bowl[0], 0.42, s.bowl[1], 0.3, 5000);
    await fly(page, s.bowl[0], 0.215, s.bowl[1], 0.12, 4500);
    s = await st(page);
    check('prompt suggests pumping over the crock', /pump/i.test(s.prompt), s.prompt);
    // double-tap T: auto-fill
    await doubleTapKey(page, 'KeyT');
    await sleep(500);
    s = await st(page);
    check('double-tap T starts auto-fill', !!s.auto, `${s.auto}`);
    let sawPump = false;
    for (let i = 0; i < 30; i++) { await sleep(250); s = await st(page); if (s.pumping) { sawPump = true; if (i % 4 === 0) await shot(page, '03-snorkelling'); } if (!s.auto) break; }
    check('auto-fill: hose down, pumping, full, hose up', sawPump && s.vol > s.cap * 0.9 && !s.auto, `${(s.vol * 1e6).toFixed(1)} ml, hose ${s.hose.toFixed(3)} m`);
    // to the teacup; G held opens the doors progressively
    await fly(page, s.bowl[0], 0.45, s.bowl[1], 0.12, 1800);
    await fly(page, s.cup[0], 0.45, s.cup[1], 0.25, 7000);
    await fly(page, s.cup[0], 0.42, s.cup[1], 0.08, 2500);
    s = await st(page);
    check('over the cup the prompt offers the doors and the salvo', /doors.*teacup/i.test(s.prompt) && /salvo/i.test(s.prompt), s.prompt);
    const v0 = s.vol, tc0 = s.teacup;
    // Observe the existing stream channel while real doors discharge a tank filled through the snorkel.
    await page.evaluate((capture) => {
      const a = window.__helicoptea.audio, original = a.updatePour.bind(a);
      const analyser = a.ctx.createAnalyser(); analyser.fftSize = 2048; a.pour.g.connect(analyser);
      const data = new Float32Array(analyser.fftSize);
      if (capture) {
        const dest = a.ctx.createMediaStreamDestination(); a.pour.g.connect(dest);
        const chunks = [], recorder = new MediaRecorder(dest.stream, { mimeType: 'audio/webm' });
        window.__pourRecording = recorder;
        window.__pourRecordingDone = new Promise(resolve => {
          recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
          recorder.onstop = () => {
            a.pour.g.disconnect(dest); dest.stream.getTracks().forEach(t => t.stop());
            const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.readAsDataURL(new Blob(chunks, { type: 'audio/webm' }));
          };
        });
        recorder.start();
      }
      const probe = window.__pourProbe = { flow: 0, rate: 0, gain: 0, rms: 0 };
      a.updatePour = (o) => {
        original(o);
        const flow = window.__helicoptea.sim.heli?.tank?.flowOut || 0;
        if (flow <= 0) return;
        analyser.getFloatTimeDomainData(data);
        probe.flow = Math.max(probe.flow, flow); probe.rate = Math.max(probe.rate, o.rate);
        probe.gain = Math.max(probe.gain, a.pour.g.gain.value);
        probe.rms = Math.max(probe.rms, Math.sqrt(data.reduce((sum, v) => sum + v * v, 0) / data.length));
      };
      window.__stopPourProbe = () => { a.updatePour = original; a.pour.g.disconnect(analyser); analyser.disconnect(); };
    }, !!process.env.SKY_CAPTURE);
    await page.keyboard.down('KeyG'); await sleep(250);
    const sA = await st(page);
    await sleep(500);
    const sB = await st(page);
    await page.keyboard.up('KeyG'); await sleep(400);
    check('holding G opens the belly doors wider and wider', sA.doors > 0.1 && sB.doors > sA.doors + 0.2, `${sA.doors.toFixed(2)} -> ${sB.doors.toFixed(2)}`);
    report.pourAudio = await page.evaluate(() => ({ ...window.__pourProbe }));
    check('tank discharge feeds the milk-stream sound channel', report.pourAudio.flow > 0 && report.pourAudio.rate > 0 && report.pourAudio.gain > 0.001 && report.pourAudio.rms > 0.00001, JSON.stringify(report.pourAudio));
    // double-tap G: salvo
    await doubleTapKey(page, 'KeyG');
    await sleep(250);
    s = await st(page);
    check('double-tap G fires a salvo', s.salvo || s.vol < v0 * 0.3, `salvo ${s.salvo}, ${(s.vol * 1e6).toFixed(1)} ml`);
    await shot(page, '04-salvo');
    await sleep(1800);
    s = await st(page);
    await shot(page, '05-after-drop');
    check('the tank empties into the teacup', s.vol === 0 && s.teacup > tc0 + 0.03, `teacup milk ${(s.teacup * 100).toFixed(1)}%`);
    const silent = await page.evaluate(() => { window.__stopPourProbe(); return window.__helicoptea.audio.pour.g.gain.value; });
    check('empty tank stops the continuous pour sound', silent < 0.0001, `stream gain ${silent}`);
    if (process.env.SKY_CAPTURE) {
      const audio = await page.evaluate(() => { window.__pourRecording.stop(); return window.__pourRecordingDone; });
      fs.writeFileSync(path.join(outDir, 'tank-pour.webm'), Buffer.from(audio, 'base64'));
    }
    check('keyboard: no errors', errors(logs).length === 0, errors(logs).slice(0, 3).join(' | '));
    check('keyboard: no crash', s.state === 'flying');
    report.perf.desktop = await page.evaluate(() => new Promise((res) => { const t0 = performance.now(); let n = 0; const f = (t) => { n++; if (t - t0 < 3000) requestAnimationFrame(f); else res(+(n / ((t - t0) / 1000)).toFixed(1)); }; requestAnimationFrame(f); }));
    check('desktop frame rate with the skycrane', report.perf.desktop > 50, `${report.perf.desktop} fps`);
    await ctx.close();
  }

  // ------------------------------------------------------------ gamepad: RT analog doors, LT pump, bumpers
  {
    const { ctx, page, logs } = await open({ width: 1280, height: 720 }, { gamepad: true });
    await start(page);
    await installPilot(page);
    await fly(page, -0.56, 0.4, 0.24, 0.3, 2500);
    const btn = (i, v) => page.evaluate(([i, v]) => { window.__pad.buttons[i] = { pressed: v > 0.5, value: v }; }, [i, v]);
    // A quick double tap that the game sees at any frame rate: the pad is polled once a frame, so press,
    // release, press, release go in on successive frames, from inside the page (a round trip from the
    // test per edge can take several frames on a slow renderer, and 90 ms holds slip between frames).
    const doubleTap = (i) => page.evaluate((i) => new Promise((res) => {
      const H = window.__helicoptea, seq = [1, 0, 1, 0];
      let f = -1;
      const tick = () => {
        if (H.frames !== f) { f = H.frames; const v = seq.shift(); window.__pad.buttons[i] = { pressed: v > 0.5, value: v }; if (!seq.length) { res(); return; } }
        requestAnimationFrame(tick);
      };
      tick();
    }), i);
    // Default (Aim) layout: d-pad up / down reel, LB pumps (twice = auto-fill), RT doors, LT bolted camera.
    await btn(13, 1); await sleep(700); await btn(13, 0);
    let s = await st(page);
    check('gamepad: d-pad down reels the hose out', s.hose > 0.09, `${s.hose.toFixed(3)} m`);
    await btn(4, 1); await sleep(400);
    s = await st(page);
    check('gamepad: LB pumps', s.ctl.pump > 0.9, `pump input ${s.ctl.pump.toFixed(2)}`);
    await btn(4, 0); await sleep(400);
    // a tank of milk for the door tests
    await page.evaluate(() => { const s = window.__helicoptea.sim, t = s.heli.tank; const got = s.milk.take(s.milk.bowl, t.capacity); t.vol = got.vol; t.milk = 1; });
    await btn(7, 0.3); await sleep(300);
    s = await st(page);
    const lightDoors = s.doors;
    await btn(7, 1); await sleep(200);
    s = await st(page);
    const padColl = await page.evaluate(() => window.__helicoptea.input.pads.out.collective);
    check('gamepad: RT is analog: a light squeeze cracks the doors, a full pull opens them', lightDoors > 0.05 && lightDoors < 0.5 && s.doors > 0.8, `${lightDoors.toFixed(2)} -> ${s.doors.toFixed(2)}`);
    await btn(7, 0); await sleep(250);
    check('gamepad: collective is not on the triggers in the skycrane', Math.abs(padColl) < 0.05, `pad collective with RT pulled ${padColl.toFixed(2)}`);
    await doubleTap(7);
    await sleep(200);
    s = await st(page);
    check('gamepad: two quick full RT pulls fire a salvo', s.salvo || s.vol === 0, `salvo ${s.salvo}`);
    await sleep(1500);
    await doubleTap(4);
    await sleep(200);
    s = await st(page);
    check('gamepad: LB tapped twice starts auto-fill', !!s.auto, `${s.auto}`);
    await btn(12, 1); await sleep(300); await btn(12, 0);
    s = await st(page);
    check('gamepad: reeling by hand takes over from auto-fill', !s.auto);
    const hint = await page.evaluate(() => document.querySelector('.prompt').textContent);
    check('gamepad: prompts name the pad controls', /LB|RT/.test(hint), hint);
    // The Classic preset brings back the original skycrane layout.
    await page.evaluate(() => window.__helicoptea.input.pads.choosePreset('mode2'));
    await btn(6, 0.5); await sleep(400);
    s = await st(page);
    check('gamepad (Classic): LT is an analog pump control', s.ctl.pump > 0.4 && s.ctl.pump < 0.8, `pump input ${s.ctl.pump.toFixed(2)}`);
    await btn(6, 0); await sleep(300);
    await btn(4, 1); await btn(5, 1); await sleep(150); await btn(4, 0); await btn(5, 0);
    await sleep(200);
    s = await st(page);
    check('gamepad (Classic): both bumpers together start auto-fill', !!s.auto, `${s.auto}`);
    await btn(4, 1); await sleep(300); await btn(4, 0);
    check('gamepad: no errors', errors(logs).length === 0, errors(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ------------------------------------------------------------ touch: Doors, Pump, Hose buttons
  {
    const { ctx, page, logs } = await open({ width: 844, height: 390 }, { touch: true, mobile: true });
    await start(page);
    await installPilot(page);
    await fly(page, -0.56, 0.4, 0.24, 0.3, 2500);
    const boxes = await page.evaluate(() => Object.fromEntries(['doors', 'pump', 'reel-in', 'reel-out', 'pour'].map((c) => { const e = document.querySelector(`.touch-btn.${c}`); const r = e.getBoundingClientRect(); return [c, e.offsetParent ? [r.x, r.y, r.width, r.height] : null]; })));
    check('touch: tank buttons show in the skycrane, the bucket Pour button does not', boxes.doors && boxes.pump && boxes['reel-in'] && boxes['reel-out'] && !boxes.pour, JSON.stringify(boxes));
    const all = await page.evaluate(() => [...document.querySelectorAll('.touch-btn, .icon-btn')].filter((e) => e.offsetParent).map((e) => { const r = e.getBoundingClientRect(); return [e.className, r.x, r.y, r.width, r.height]; }));
    const overlaps = [];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const [, ax, ay, aw, ah] = all[i], [, bx, by, bw, bh] = all[j];
      if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) overlaps.push(`${all[i][0]} x ${all[j][0]}`);
    }
    check('touch: no buttons overlap', overlaps.length === 0, overlaps.join('; '));
    await shot(page, '06-touch');
    const cdp = await ctx.newCDPSession(page);
    const tap = async (b, ms) => { const p = { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2, id: 3 }; await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] }); await sleep(ms); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); };
    // A finger double tap: two 60 ms taps 60 ms apart, stamped with when the finger touched. Each CDP
    // event waits for a busy page to take it, so on a slow renderer the second tap would otherwise
    // arrive seconds later; the game times double taps by the touch's own timestamp.
    const doubleTapTouch = async (b) => {
      const p = { x: b[0] + b[2] / 2, y: b[1] + b[3] / 2, id: 3 }, t0 = Date.now() / 1000;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p], timestamp: t0 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + 0.06 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p], timestamp: t0 + 0.12 });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: t0 + 0.18 });
    };
    const h0 = (await st(page)).hose;
    await tap(boxes['reel-out'], 700);
    const h1 = (await st(page)).hose;
    check('touch: Hose ▼ reels out', h1 > h0 + 0.02, `${h0.toFixed(3)} -> ${h1.toFixed(3)}`);
    await page.evaluate(() => { const s = window.__helicoptea.sim, t = s.heli.tank; const got = s.milk.take(s.milk.bowl, t.capacity); t.vol = got.vol; t.milk = 1; });
    const p = { x: boxes.doors[0] + boxes.doors[2] / 2, y: boxes.doors[1] + boxes.doors[3] / 2, id: 4 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await sleep(600);
    let s = await st(page);
    await shot(page, '07-touch-doors');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    check('touch: holding Doors opens them', s.doors > 0.3, `${s.doors.toFixed(2)}`);
    await sleep(300);
    await doubleTapTouch(boxes.doors);
    await sleep(200);
    s = await st(page);
    check('touch: double-tap Doors fires a salvo', s.salvo || s.vol === 0, `salvo ${s.salvo}`);
    await sleep(1500);
    await doubleTapTouch(boxes.pump);
    await sleep(200);
    s = await st(page);
    check('touch: double-tap Pump starts auto-fill', !!s.auto, `${s.auto}`);
    check('touch: no errors', errors(logs).length === 0, errors(logs).slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ------------------------------------------------------------ help panel lists the new controls
  {
    const { ctx, page } = await open({ width: 1280, height: 720 });
    await start(page);
    const txt = await page.evaluate(() => { window.__helicoptea.doAction('help'); return document.querySelector('.modal')?.innerText || document.body.innerText; });
    check('help panel explains doors, pump, reel, salvo and auto-fill', /belly doors/i.test(txt) && /pump/i.test(txt) && /reel/i.test(txt) && /salvo/i.test(txt) && /auto-fill/i.test(txt));
    await shot(page, '08-help');
    await ctx.close();
  }
} catch (err) {
  check('run completed', false, err.stack || String(err));
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'sky-report.json'), JSON.stringify(report, null, 2));
  const failed = report.checks.filter((c) => !c.ok);
  console.log(`\n${report.checks.length - failed.length}/${report.checks.length} skycrane browser checks passed`);
  process.exit(failed.length ? 1 : 0);
}
