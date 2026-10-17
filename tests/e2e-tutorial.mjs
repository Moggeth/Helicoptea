// Guided first flight in the browser: the first-launch offer, starting it, a real keyboard takeoff moving it
// on, the big card (large words, a looping picture, the control for the device in hand, switching live), the
// pause-menu entry, ending it, and the phone layout (the card must sit clear of the sticks and buttons).
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4243/';
const out = path.resolve('test-results/tutorial'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const checks = []; const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${JSON.stringify(detail)}`); };
const card = (page) => page.evaluate(() => {
  const el = document.querySelector('.lesson'), T = window.__helicoptea.tutorial;
  const title = el.querySelector('.ls-title'), sub = el.querySelector('.ls-sub');
  const anims = [...el.querySelectorAll('svg *')].filter((e) => getComputedStyle(e).animationName !== 'none').length;
  return { shown: el.classList.contains('show'), title: title.textContent, titlePx: parseFloat(getComputedStyle(title).fontSize), subPx: parseFloat(getComputedStyle(sub).fontSize),
    count: el.querySelector('.ls-count').textContent, ctl: T.card && T.card.ctl, ctlSvg: !!el.querySelector('.ls-ctl:not(.hidden) svg'), anims, tut: T.step, active: T.active,
    hint: document.querySelector('.hint').classList.contains('show') };
});
try {
  // Desktop: offered after Start, then flown with the keyboard.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}?aircraft=chinook&lesson=offer&quality=low&dynres=0`);
    await page.locator('#start-btn:not(.hidden)').click();
    await page.waitForTimeout(300);
    const offer = await page.evaluate(() => ({ kind: document.querySelector('.overlay.show .lesson-offer') ? 'lesson' : null, buttons: [...document.querySelectorAll('.lesson-offer button')].map((b) => b.textContent), art: !!document.querySelector('.lesson-offer svg') }));
    check('first launch offers the lesson, with a picture', offer.kind === 'lesson' && offer.buttons.join('|') === 'Show me|Just fly' && offer.art, offer);
    await page.screenshot({ path: path.join(out, 'desktop-offer.png') });
    await page.keyboard.down('w'); await page.waitForTimeout(400); await page.keyboard.up('w');
    check('the offer holds the controls (W does not lift off behind it)', await page.evaluate(() => window.__helicoptea.sim.heli.grounded));
    await page.locator('.lesson-offer [data-act=tutorial]').click();
    await page.waitForTimeout(500);
    let c = await card(page);
    const setup = await page.evaluate(() => ({ aircraft: window.__helicoptea.sim.aircraft, assist: window.__helicoptea.sim.assist }));
    check('starting it switches to the micro heli with Assist on', setup.aircraft === 'micro' && setup.assist, setup);
    check('lift card: big title, step 1 of 15, the W key', c.shown && c.title === 'Lift off' && c.count === '1 / 15' && c.ctl?.type === 'keys' && c.ctl.keys[0] === 'W' && c.ctlSvg, c);
    check('words are large (title 28 px or more, line under it 18 px or more)', c.titlePx >= 28 && c.subPx >= 18, { title: c.titlePx, sub: c.subPx });
    check('the pictures are animated', c.anims >= 3, c.anims);
    check('the small tips card stays out of the way', !c.hint);
    await page.screenshot({ path: path.join(out, 'desktop-lift.png') });
    await page.keyboard.down('w');
    await page.waitForFunction(() => window.__helicoptea.tutorial.step !== 'lift', null, { timeout: 10000 });
    await page.keyboard.up('w');
    c = await card(page);
    check('a real takeoff moves the lesson to hover', c.tut === 'hover' && c.title === 'Hover' && c.count === '2 / 15', c);
    await page.waitForFunction(() => window.__helicoptea.tutorial.step !== 'hover', null, { timeout: 15000 }).catch(() => {});
    c = await card(page);
    check('hands off the keys, it holds a hover and moves on to drift, showing the arrow keys', c.tut === 'drift' && c.ctl?.type === 'arrows' && c.ctl.keys.join('') === '↑↓←→', c);
    // The control follows the device the moment it changes.
    await page.evaluate(() => { window.__helicoptea.input.source = 'gamepad'; });
    await page.waitForTimeout(150);
    c = await card(page);
    check('picking up a gamepad shows the stick', c.ctl?.type === 'stick' && !c.ctl.touch && c.ctlSvg, c.ctl);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    c = await card(page);
    check('a key press switches it straight back', c.ctl?.type === 'arrows', c.ctl);
    // Pause menu: the entry reads End guided flight while it runs, and ends it.
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const btn = await page.locator('.overlay.show [data-act=tutorial]').textContent();
    check('pause menu offers to end the running lesson', btn === 'End guided flight', btn);
    await page.locator('.overlay.show [data-act=tutorial]').click(); await page.waitForTimeout(400);
    c = await card(page);
    check('ending it from the pause menu hides the card and resumes', !c.active && !c.shown && !(await page.evaluate(() => window.__helicoptea.paused)), c);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const again = await page.locator('.overlay.show [data-act=tutorial]').textContent();
    check('and offers it again afterwards', again === 'Guided first flight', again);
    await page.locator('.overlay.show [data-act=tutorial]').click(); await page.waitForTimeout(400);
    c = await card(page);
    check('restarting it from the pause menu begins at lift on the pad', c.active && c.tut === 'lift' && c.shown && (await page.evaluate(() => window.__helicoptea.sim.heli.grounded)), c);
    await page.locator('.lesson .ls-end').click(); await page.waitForTimeout(400);
    c = await card(page);
    check('the ✕ on the card ends the lesson', !c.active && !c.shown, c);
    check('no page errors on desktop', errors.length === 0, errors);
    await ctx.close();
  }
  // Second launch: no offer once seen; Just fly records it too.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
    await page.goto(`${base}?quality=low&dynres=0&lesson=offer`);
    await page.locator('#start-btn:not(.hidden)').click(); await page.waitForTimeout(300);
    await page.locator('.lesson-offer [data-act=lessonno]').click(); await page.waitForTimeout(200);
    const s = await page.evaluate(() => ({ modal: !!document.querySelector('.overlay.show'), active: window.__helicoptea.tutorial.active, step: document.querySelector('.hint .step').textContent, seen: localStorage.getItem('helicoptea.lesson') }));
    check('Just fly closes the offer, remembers it and leaves the normal tips running', !s.modal && !s.active && s.step === '1' && s.seen === 'seen', s);
    await page.keyboard.down('w'); await page.waitForTimeout(600); await page.keyboard.up('w');
    check('and the controls work again', !(await page.evaluate(() => window.__helicoptea.sim.heli.grounded)));
    await ctx.close();
  }
  // Phone, landscape and portrait: the card clears the sticks and buttons and fits on screen, on every step.
  for (const [w, hgt, label] of [[915, 412, 'landscape'], [412, 915, 'portrait'], [360, 780, 'small portrait']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}?quality=low&dynres=0&lesson=1&fs=0`);
    await page.locator('#start-btn:not(.hidden)').tap();
    await page.waitForTimeout(600);
    let worst = null, fits = true, minTitle = 99;
    // Draw each card directly (go() would step back from cargo steps with nothing on the hook).
    for (const [scene, title, ctl] of [['lift', 'Lift off', 'liftUp'], ['stop', 'Now stop', 'tilt'], ['bucket', 'Hook the milk bucket', null], ['pour', 'Pour into a cup', 'pour'], ['camera', 'Change camera', 'camera']]) {
      const r = await page.evaluate(([scene, title, ctl]) => {
        const H = window.__helicoptea; if (H.tutorial.active) H.tutorial.end(true);
        const hud = H.tutorial.hud;
        hud.showLesson({ n: 5, total: 15, scene, title, sub: 'Tilt back early. It keeps sliding.', ctl: ctl ? hud.lessonControl(ctl) : null, progress: 0.5 });
        const b = document.querySelector('.lesson').getBoundingClientRect(), card = { l: b.left, t: b.top, r: b.right, b: b.bottom };
        const others = [...document.querySelectorAll('.stick-zone .stick-base, .touch-btn, .hud-tl .pill, .hud-tr .icon-btn')].filter((e) => e.offsetParent && getComputedStyle(e).visibility !== 'hidden').map((e) => { const q = e.getBoundingClientRect(); return { cls: e.className, l: q.left, t: q.top, r: q.right, b: q.bottom }; });
        const hit = others.filter((s) => !(s.r <= card.l || s.l >= card.r || s.b <= card.t || s.t >= card.b));
        return { card, hit, vw: innerWidth, vh: innerHeight, titlePx: parseFloat(getComputedStyle(document.querySelector('.ls-title')).fontSize), touch: hud.lessonControl('liftUp') };
      }, [scene, title, ctl]);
      await page.waitForTimeout(150);
      if (r.hit.length && !worst) worst = { scene, hit: r.hit, card: r.card };
      if (!(r.card.l >= 0 && r.card.r <= r.vw && r.card.t >= 0 && r.card.b <= r.vh)) fits = false;
      minTitle = Math.min(minTitle, r.titlePx);
      if (scene === 'lift') check(`phone ${label}: shows the touch stick`, r.touch?.type === 'stick' && r.touch.touch, r.touch);
    }
    check(`phone ${label}: card fits on screen`, fits);
    check(`phone ${label}: card clears the sticks and buttons`, !worst, worst);
    check(`phone ${label}: words stay large (22 px or more)`, minTitle >= 22, minTitle);
    await page.screenshot({ path: path.join(out, `phone-${label.replace(' ', '-')}.png`) });
    check(`phone ${label}: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }
} finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, checks }, null, 2)); }
process.exit(checks.some((c) => !c.ok) ? 1 : 0);
