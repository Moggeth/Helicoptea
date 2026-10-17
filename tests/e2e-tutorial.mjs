// Guided first flight in the browser: the first-launch offer, starting it, a real keyboard takeoff moving it
// on, the wording switching live with the device, the pause-menu entry, ending it, and the phone layout
// (the card must sit clear of the twin sticks and stay on screen).
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4243/';
const out = path.resolve('test-results/tutorial'); fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const checks = []; const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${JSON.stringify(detail)}`); };
const hint = (page) => page.evaluate(() => ({ step: document.querySelector('.hint .step').textContent, text: document.querySelector('.hint .txt').textContent, html: document.querySelector('.hint .txt').innerHTML, shown: document.querySelector('.hint').classList.contains('show'), skip: document.querySelector('.hint .skip').textContent, tut: window.__helicoptea.tutorial.step, active: window.__helicoptea.tutorial.active }));
try {
  // Desktop: offered after Start, then flown with the keyboard.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}?aircraft=chinook&lesson=offer&quality=low&dynres=0`);
    await page.locator('#start-btn:not(.hidden)').click();
    await page.waitForTimeout(300);
    const offer = await page.evaluate(() => ({ kind: window.__helicoptea && document.querySelector('.overlay.show .lesson-offer') ? 'lesson' : null, buttons: [...document.querySelectorAll('.lesson-offer button')].map((b) => b.textContent) }));
    check('first launch offers the guided flight', offer.kind === 'lesson' && offer.buttons.join('|') === 'Guided first flight|Just fly', offer);
    await page.screenshot({ path: path.join(out, 'desktop-offer.png') });
    await page.keyboard.down('w'); await page.waitForTimeout(400); await page.keyboard.up('w');
    const still = await page.evaluate(() => window.__helicoptea.sim.heli.grounded);
    check('the offer holds the controls (W does not lift off behind it)', still);
    await page.locator('.lesson-offer [data-act=tutorial]').click();
    await page.waitForTimeout(400);
    let h = await hint(page);
    const setup = await page.evaluate(() => ({ aircraft: window.__helicoptea.sim.aircraft, assist: window.__helicoptea.sim.assist, seen: localStorage.getItem('helicoptea.lesson') }));
    check('starting it switches to the micro heli with Assist on', setup.aircraft === 'micro' && setup.assist, setup);
    check('lift card shows step 1 with the keyboard key and End lesson', h.active && h.shown && h.step === '1' && /<kbd>W<\/kbd>/.test(h.html) && h.skip === 'End lesson', h);
    await page.screenshot({ path: path.join(out, 'desktop-lift.png') });
    await page.keyboard.down('w');
    await page.waitForFunction(() => window.__helicoptea.tutorial.step !== 'lift', null, { timeout: 10000 });
    await page.keyboard.up('w');
    h = await hint(page);
    check('a real takeoff moves the lesson to hover', h.tut === 'hover' && h.step === '2' && /hover/.test(h.text), h);
    await page.waitForFunction(() => window.__helicoptea.tutorial.step !== 'hover', null, { timeout: 15000 }).catch(() => {});
    h = await hint(page);
    check('hands off the keys, it holds a hover and moves on to drift', h.tut === 'drift' && h.html.includes('<kbd>↑</kbd>'), h);
    // The wording follows the device the moment it changes.
    await page.evaluate(() => { window.__helicoptea.input.source = 'gamepad'; });
    await page.waitForTimeout(150);
    h = await hint(page);
    check('picking up a gamepad rewords the card for the sticks', /stick/.test(h.html) && !h.html.includes('<kbd>↑</kbd>'), h);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    h = await hint(page);
    check('a key press switches it straight back', h.html.includes('<kbd>↑</kbd>'), h);
    // Pause menu: the entry reads End guided flight while it runs, and ends it.
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const btn = await page.locator('.overlay.show [data-act=tutorial]').textContent();
    check('pause menu offers to end the running lesson', btn === 'End guided flight', btn);
    await page.locator('.overlay.show [data-act=tutorial]').click(); await page.waitForTimeout(300);
    h = await hint(page);
    check('ending it from the pause menu hands back to the ordinary tips and resumes', !h.active && h.skip === 'Skip tips' && h.step !== '3' && !(await page.evaluate(() => window.__helicoptea.paused)), h);
    await page.keyboard.press('Escape'); await page.waitForTimeout(200);
    const again = await page.locator('.overlay.show [data-act=tutorial]').textContent();
    check('and offers it again afterwards', again === 'Guided first flight', again);
    await page.locator('.overlay.show [data-act=tutorial]').click(); await page.waitForTimeout(300);
    h = await hint(page);
    check('restarting it from the pause menu begins at lift on the pad', h.active && h.tut === 'lift' && (await page.evaluate(() => window.__helicoptea.sim.heli.grounded)), h);
    check('no page errors on desktop', errors.length === 0, errors);
    await ctx.close();
  }
  // Second launch: no offer once seen; Just fly records it too.
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
    await page.goto(`${base}?quality=low&dynres=0`);
    await page.evaluate(() => localStorage.setItem('helicoptea.lesson', 'seen'));
    await page.goto(`${base}?quality=low&dynres=0&lesson=offer`);
    await page.locator('#start-btn:not(.hidden)').click(); await page.waitForTimeout(300);
    await page.locator('.lesson-offer [data-act=lessonno]').click(); await page.waitForTimeout(200);
    const s = await page.evaluate(() => ({ modal: !!document.querySelector('.overlay.show'), active: window.__helicoptea.tutorial.active, step: document.querySelector('.hint .step').textContent }));
    check('Just fly closes the offer and leaves the normal tips running', !s.modal && !s.active && s.step === '1', s);
    await page.keyboard.down('w'); await page.waitForTimeout(600); await page.keyboard.up('w');
    check('and the controls work again', !(await page.evaluate(() => window.__helicoptea.sim.heli.grounded)));
    await ctx.close();
  }
  // Phone, landscape and portrait: the card clears the sticks and fits on screen.
  for (const [w, hgt, label] of [[915, 412, 'landscape'], [412, 915, 'portrait']]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: hgt }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}?quality=low&dynres=0&lesson=1&fs=0`);
    await page.locator('#start-btn:not(.hidden)').tap();
    await page.waitForTimeout(600);
    // Through the drift step so the card carries its longest text and the bar.
    await page.evaluate(() => { const t = window.__helicoptea.tutorial; t.go(4); });
    await page.waitForTimeout(200);
    const r = await page.evaluate(() => {
      const box = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
      const card = box('.hint'), sticks = [...document.querySelectorAll('.stick-zone .stick-base, .touch-btn')].filter((e) => e.offsetParent).map((e) => { const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; });
      const hit = sticks.filter((s) => !(s.r <= card.l || s.l >= card.r || s.b <= card.t || s.t >= card.b));
      return { card, overlaps: hit.length, html: document.querySelector('.hint .txt').innerHTML, vw: innerWidth, vh: innerHeight };
    });
    check(`phone ${label}: card names the touch stick`, /<b>(left|right)<\/b> stick/.test(r.html), r.html);
    check(`phone ${label}: card fits on screen`, r.card.l >= 0 && r.card.r <= r.vw && r.card.t >= 0 && r.card.b <= r.vh, r.card);
    check(`phone ${label}: card clears the sticks and buttons`, r.overlaps === 0, r);
    await page.screenshot({ path: path.join(out, `phone-${label}.png`) });
    check(`phone ${label}: no page errors`, errors.length === 0, errors);
    await ctx.close();
  }
} finally { await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify({ base, checks }, null, 2)); }
process.exit(checks.some((c) => !c.ok) ? 1 : 0);
