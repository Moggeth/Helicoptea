// Twin-stick touch controls on an emulated phone, driven with real multi-touch (CDP), not synthetic events:
// default layout, takeoff on the sticks, the leash, layouts and stick size from Pause, double-tap to look
// ahead, the slim touch top bar, the pause menu fitting the screen, touch wording in the tips, frame rate.
//
//   node tests/e2e-touch-sticks.mjs http://127.0.0.1:4199/
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4199/';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

async function open(viewport, query = '', { ios = false } = {}) {
  const ua = ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1' : undefined;
  const ctx = await browser.newContext({ viewport, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: ua });
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* fresh profile */ } });
  // Record haptics: Android's vibrate() calls, and the iPhone switch's clicks.
  await ctx.addInitScript((ios) => {
    window.__buzz = [];
    if (ios) { try { delete Navigator.prototype.vibrate; } catch { /* */ } }
    else navigator.vibrate = (p) => { window.__buzz.push(p); return true; };
    document.addEventListener('click', (e) => { if (e.target && e.target.matches && e.target.matches('input[switch]')) window.__buzz.push('tick'); }, true);
  }, ios);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?record=0&dynres=0${query}`);
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 90000 });
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  return { ctx, page, errors, touch };
}
// Pointer moves are delivered with the next frame, so let one pass before reading the sticks.
const T = async (page) => { await sleep(60); return page.evaluate(() => ({ ...window.__helicoptea.input.touch })); };
const zoneBox = (page, side) => page.locator(`.stick-zone.${side}`).boundingBox();

try {
  // ---------------------------------------------------------------- landscape phone
  {
    const { ctx, page, errors, touch } = await open({ width: 844, height: 390 }, '&aircraft=micro&view=chase');
    await page.tap('#start-btn');
    await page.waitForFunction(() => document.querySelector('.hint')?.classList.contains('show'));
    const hint = await page.locator('.hint .txt').textContent();
    check('tips speak touch before the first touch', hint.includes('left stick') && !hint.includes('Arrow'), hint);

    const bar = await page.evaluate(() => [...document.querySelectorAll('.hud-tr .icon-btn')].filter((b) => b.offsetParent).map((b) => b.dataset.act));
    // Full screen joins the bar where the browser allows it (Android); iPhone Safari keeps three buttons.
    const fsOk = await page.evaluate(() => document.fullscreenEnabled);
    check('touch top bar is restart, camera, full screen (where allowed) and pause', JSON.stringify(bar) === JSON.stringify(fsOk ? ['restart', 'view', 'fullscreen', 'pause'] : ['restart', 'view', 'pause']), bar);
    const btns = await page.evaluate(() => [...document.querySelectorAll('.touch-btn')].filter((b) => b.offsetParent).map((b) => b.className.split(' ')[1]));
    check('micro shows only Hook and GoPro on screen', JSON.stringify(btns.sort()) === '["attach","bolt"]', btns);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.stick-label')].map((l) => l.textContent));
    check('default sticks: lift and turn left, tilt right', labels[0] === 'LiftTurn' && labels[1] === 'Tilt', labels);

    // Take off on the left stick (real touch), tilt with the right at the same time.
    const L = await zoneBox(page, 'left'), R = await zoneBox(page, 'right');
    const lx = L.x + L.width * 0.4, ly = L.y + L.height * 0.6, rx = R.x + R.width * 0.6, ry = R.y + R.height * 0.6;
    const y0 = await page.evaluate(() => window.__helicoptea.sim.heli.pos.y);
    await touch('touchStart', [{ x: lx, y: ly, id: 1 }]);
    await touch('touchMove', [{ x: lx, y: ly - 64, id: 1 }]);
    await touch('touchMove', [{ x: lx, y: ly - 64, id: 1 }, { x: rx, y: ry, id: 2 }]);   // a second finger joins
    await touch('touchMove', [{ x: lx, y: ly - 64, id: 1 }, { x: rx + 20, y: ry, id: 2 }]);
    let t = await T(page);
    check('two thumbs at once: lift on the left, roll on the right', t.collective > 0.95 && t.roll > 0.2 && Math.abs(t.pitch) < 0.05 && Math.abs(t.yaw) < 0.05, t);
    await sleep(60);
    const ctl = await page.evaluate(() => ({ ...window.__helicoptea.input.ctl }));
    check('stick reaches the flight controls through the dead zone and curve', ctl.collective > 0.95 && ctl.roll > 0.05 && ctl.roll < t.roll, ctl);
    await touch('touchMove', [{ x: lx, y: ly - 64, id: 1 }, { x: rx, y: ry, id: 2 }]);
    await sleep(1500);
    const y1 = await page.evaluate(() => window.__helicoptea.sim.heli.pos.y);
    check('holding the left stick up lifts off', y1 > y0 + 0.05, { y0, y1 });

    // Leash: shove the thumb far past the rim, then come back a little: the stick reverses at once.
    await touch('touchMove', [{ x: lx, y: ly - 260, id: 1 }, { x: rx, y: ry, id: 2 }]);
    await sleep(60);
    await touch('touchMove', [{ x: lx, y: ly - 260 + 90, id: 1 }, { x: rx, y: ry, id: 2 }]);
    t = await T(page);
    check('the centre follows a thumb past the rim, so pulling back reverses at once', t.collective < -0.3, t);
    await touch('touchEnd', []);
    await sleep(100);
    t = await T(page);
    check('letting go centres both sticks', ['pitch', 'roll', 'yaw', 'collective'].every((k) => t[k] === 0), t);
    const base0 = await page.evaluate(() => document.querySelector('.stick-zone.left .stick-base').style.left);
    check('the stick ring goes back to its resting spot', base0 === '', base0);

    // Double-tap open screen (between the sticks, below the top bar) to look ahead again.
    await page.evaluate(() => { window.__helicoptea.input.camOrbit.yaw = 1.2; });
    const ox = 422, oy = 180;
    for (let i = 0; i < 2; i++) { await touch('touchStart', [{ x: ox, y: oy, id: 5 }]); await touch('touchEnd', []); await sleep(90); }
    await sleep(100);
    const orbit = await page.evaluate(() => window.__helicoptea.input.camOrbit.yaw);
    check('double-tap the open screen looks ahead again', orbit === 0, orbit);

    // Assist switch top left toggles assist (the old Assist button is gone).
    const a0 = await page.evaluate(() => window.__helicoptea.sim.assist);
    await page.tap('.hud-tl .pill');
    const a1 = await page.evaluate(() => window.__helicoptea.sim.assist);
    check('Assist switch toggles Flight Assist', a0 !== a1, { a0, a1 });

    // Pause: layout and stick size.
    await page.tap('.hud-tr [data-act=pause]');
    await page.waitForSelector('.overlay.show .pause');
    const fit = await page.evaluate(() => { const p = document.querySelector('.overlay.show .panel'); return { cw: p.clientWidth, sw: p.scrollWidth }; });
    check('landscape pause menu has no sideways scroll', fit.sw <= fit.cw, fit);
    await page.tap('.overlay.show [data-tab=controls]');
    await page.selectOption('[data-setting=touchLayout]', 'aim');
    await page.selectOption('[data-setting=touchSize]', 'large');
    const stored = await page.evaluate(() => [localStorage.getItem('helicoptea.touchLayout') ?? Object.entries(localStorage).find(([k]) => k.endsWith('touchLayout'))?.[1], getComputedStyle(document.getElementById('touch')).getPropertyValue('--stick-r').trim()]);
    check('layout and size are saved and applied', stored[0] === 'aim' && stored[1] === '84px', stored);
    await page.tap('.overlay [data-act=resume]');
    await sleep(150);
    const R2 = await zoneBox(page, 'right');
    await touch('touchStart', [{ x: R2.x + R2.width * 0.6, y: R2.y + R2.height * 0.6, id: 7 }]);
    await touch('touchMove', [{ x: R2.x + R2.width * 0.6 + 42, y: R2.y + R2.height * 0.6, id: 7 }]);
    t = await T(page);
    check('Aim layout: right stick sideways turns, half way on a large stick', Math.abs(t.yaw - 0.5) < 0.02 && t.roll === 0, t);
    await touch('touchEnd', []);
    const labels2 = await page.evaluate(() => [...document.querySelectorAll('.stick-label')].map((l) => l.textContent));
    check('stick labels follow the layout', labels2[0] === 'LiftRoll' && labels2[1] === 'PitchTurn', labels2);

    // Help sheet follows the layout.
    await sleep(150);
    await page.tap('.hud-tr [data-act=pause]');
    await page.waitForSelector('.overlay.show .pause', { timeout: 5000 });
    await page.tap('.overlay.show [data-tab=controls]');
    await page.tap('.overlay.show [data-act=help]');
    const help = await page.locator('.overlay.show .help-grid').textContent();
    check('touch help describes the chosen layout', help.includes('tilt left / tilt right') && help.includes('Double-tap'), help.slice(0, 120));
    await page.tap('.overlay.show [data-act=closehelp]');
    await page.tap('.overlay.show [data-act=resume]');

    // Frame rate on the emulated phone (Chrome on this PC, not a phone GPU).
    const fps = await page.evaluate(async () => { const H = window.__helicoptea; const f0 = H.frames, t0 = performance.now(); await new Promise((r) => setTimeout(r, 3000)); return +((H.frames - f0) / ((performance.now() - t0) / 1000)).toFixed(1); });
    console.log(`INFO  emulated phone 844x390 @2x frame rate: ${fps} fps`);
    check('no page errors (landscape)', errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- haptics and battery saver
  for (const ios of [false, true]) {
    const tag = ios ? 'iPhone' : 'Android';
    const { ctx, page, errors, touch } = await open({ width: 844, height: 390 }, '&aircraft=micro&view=chase&worldSpeed=1', { ios });
    await page.tap('#start-btn');
    await sleep(400);
    const buzz = () => page.evaluate(() => window.__buzz.splice(0));
    await buzz();
    const L = await zoneBox(page, 'left');
    const lx = L.x + L.width * 0.4, ly = L.y + L.height * 0.6;
    await touch('touchStart', [{ x: lx, y: ly, id: 1 }]);
    await touch('touchMove', [{ x: lx, y: ly - 64, id: 1 }]);
    await sleep(1200);
    let b = await buzz();
    check(`${tag}: lift-off gives one tap`, b.length >= 1 && b.length <= 3 && (ios ? b[0] === 'tick' : typeof b[0] === 'number'), b);
    // Stick down to land: touchdown tap.
    await touch('touchMove', [{ x: lx, y: ly + 64, id: 1 }]);
    await page.waitForFunction(() => window.__helicoptea.sim.heli.grounded, null, { timeout: 8000 }).catch(() => {});
    await sleep(300);
    await touch('touchEnd', []);
    b = await buzz();
    check(`${tag}: touchdown gives a tap`, b.length >= 1, b);
    await page.tap('.hud-tr [data-act=pause]');
    await page.waitForSelector('.overlay.show .pause');
    const opts = await page.evaluate(() => ({ vib: !!document.querySelector('[data-setting=haptics]'), saver: !!document.querySelector('[data-setting=batterySaver]'), home: !!document.querySelector('.home-tip'), fs: !!document.querySelector('[data-setting=fullscreen]') }));
    check(`${tag}: pause offers Vibration and Battery saver`, opts.vib && opts.saver, opts);
    if (ios) check('iPhone: Add to Home Screen tip instead of a full screen switch', opts.home, opts);
    await page.evaluate(() => { const c = document.querySelector('[data-setting=haptics]'); c.click(); });
    await page.tap('.overlay.show [data-tab=display]');
    await page.evaluate(() => { document.querySelector('[data-setting=batterySaver]').scrollIntoView(); });
    await page.tap('[data-setting=batterySaver]');
    await page.tap('.overlay.show [data-act=resume]');
    await buzz();
    await touch('touchStart', [{ x: lx, y: ly, id: 1 }]);
    await touch('touchMove', [{ x: lx, y: ly - 64, id: 1 }]);
    await sleep(1200);
    await touch('touchEnd', []);
    b = await buzz();
    check(`${tag}: Vibration off stays quiet`, b.length === 0, b);
    if (!ios) {
      const fps = await page.evaluate(async () => { const H = window.__helicoptea; const f0 = H.frames, t0 = performance.now(); await new Promise((r) => setTimeout(r, 2000)); return (H.frames - f0) / ((performance.now() - t0) / 1000); });
      check('Battery saver holds rendering near 30 fps', fps > 25 && fps < 33, fps.toFixed(1));
    }
    check(`${tag}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }

  // ---------------------------------------------------------------- portrait phones
  for (const vp of [{ width: 390, height: 844 }, { width: 320, height: 568 }]) {
    const { ctx, page, errors, touch } = await open(vp, '&aircraft=skycrane');
    await page.tap('#start-btn');
    await sleep(600);
    const onScreen = await page.evaluate(() => [...document.querySelectorAll('.touch-btn, .hud-tr .icon-btn, .hud-tl .pill')].filter((b) => b.offsetParent).every((b) => { const r = b.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; }));
    check(`${vp.width}x${vp.height}: every control on screen`, onScreen);
    const L = await zoneBox(page, 'left');
    await touch('touchStart', [{ x: L.x + L.width / 2, y: L.y + L.height / 2, id: 1 }]);
    await touch('touchMove', [{ x: L.x + L.width / 2 + 200, y: L.y + L.height / 2, id: 1 }]);
    const t = await T(page);
    check(`${vp.width}x${vp.height}: left stick turns`, t.yaw > 0.95, t);
    await touch('touchEnd', []);
    await page.tap('.hud-tr [data-act=pause]');
    await page.waitForSelector('.overlay.show .pause');
    const fit = await page.evaluate(() => { const p = document.querySelector('.overlay.show .panel'); const r = p.getBoundingClientRect(); return { cw: p.clientWidth, sw: p.scrollWidth, inView: r.left >= 0 && r.right <= innerWidth }; });
    check(`${vp.width}x${vp.height}: pause menu fits the width`, fit.sw <= fit.cw && fit.inView, fit);
    check(`${vp.width}x${vp.height}: no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
    await ctx.close();
  }
} catch (err) {
  check('suite completed', false, String(err && err.stack || err));
} finally {
  await browser.close();
}
console.log(`\n${total - failed}/${total} touch stick checks passed`);
process.exitCode = failed ? 1 : 0;
