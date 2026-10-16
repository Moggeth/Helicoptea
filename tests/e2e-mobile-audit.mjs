// Mobile compatibility on an emulated phone, by real taps: a touch that the browser has already let go of
// doesn't stop the game, closing the replay by touch returns to the crash card (not the pause menu under
// the finger), two fingers pinch-zoom, every menu control is big enough for a thumb, putting the page away
// pauses it, and the game's own actions all work from touch alone. Runs in Chromium (Android); with
// --webkit it also runs in Playwright's WebKit (iPhone Safari's engine) when that is installed.
//
//   node tests/e2e-mobile-audit.mjs http://127.0.0.1:4199/ [--webkit]   (HELI_WEBKIT=path/to/Playwright.exe for another WebKit build)
import { chromium, webkit } from 'playwright-core';
import fs from 'node:fs';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4199/';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(fs.existsSync);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); };

async function run(label, browser, ctxOpts) {
  const ctx = await browser.newContext(ctxOpts);
  await ctx.addInitScript(() => { try { localStorage.clear(); } catch { /* fresh */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const H = (fn, a) => page.evaluate(fn, a);
  const tap = async (sel) => { const b = await page.locator(sel).first().boundingBox(); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); await sleep(200); };
  await page.goto(`${base}?record=0&dynres=0&aircraft=micro&view=chase`);
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 120000 });
  await tap('#start-btn');
  await page.waitForFunction(() => window.__helicoptea.frames > 20);

  // A pointer the browser no longer knows about (a very quick tap): capture fails, the game goes on.
  await H(() => {
    const b = document.querySelector('.touch-btn.bolt');
    b.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 987, pointerType: 'touch', bubbles: true, cancelable: true }));
    b.dispatchEvent(new PointerEvent('pointerup', { pointerId: 987, pointerType: 'touch', bubbles: true }));
  });
  await sleep(200);
  check(`${label}: a touch already released doesn't stop the game`, !(await H(() => document.getElementById('error').classList.contains('show'))) && !errors.some((e) => /setPointerCapture/.test(e)), errors.slice(0, 2));

  // The open screen: one finger orbits, two fingers pinch-zoom.
  const zoom = await H(async () => {
    const c = document.getElementById('game'), I = window.__helicoptea.input;
    I.camOrbit.zoom = 0;
    const ev = (t, id, x, y) => c.dispatchEvent(new PointerEvent(t, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true }));
    const cx = innerWidth / 2, cy = innerHeight * 0.35;
    ev('pointerdown', 31, cx - 30, cy); ev('pointerdown', 32, cx + 30, cy);
    for (let i = 1; i <= 6; i++) { ev('pointermove', 31, cx - 30 - i * 15, cy); ev('pointermove', 32, cx + 30 + i * 15, cy); }
    const z = I.camOrbit.zoom;
    ev('pointerup', 31, cx - 120, cy); ev('pointerup', 32, cx + 120, cy);
    return { z, pinch: I.pinch, dragging: I.dragging };
  });
  check(`${label}: spreading two fingers zooms in`, zoom.z < -0.3, zoom);
  check(`${label}: the pinch ends cleanly`, zoom.pinch === null && zoom.dragging === null, zoom);

  // HUD by touch: assist, camera, pause.
  const a0 = await H(() => window.__helicoptea.sim.assist);
  await tap('#hud [data-act=assist]');
  check(`${label}: Assist switch by touch`, (await H(() => window.__helicoptea.sim.assist)) === !a0);
  await tap('#hud [data-act=assist]');
  const v0 = await H(() => window.__helicoptea.viewMode);
  await tap('#hud [data-act=view]');
  check(`${label}: camera button by touch`, (await H(() => window.__helicoptea.viewMode)) !== v0);
  await H(() => window.__helicoptea.setView('chase', true));

  // Pause menu: every control a thumb can hit (labels around checkboxes and sliders make the whole row).
  await tap('#hud [data-act=pause]');
  await page.locator('.overlay.show details.more > summary').first().tap();
  const small = await H(() => [...document.querySelectorAll('.overlay.show button, .overlay.show select, .overlay.show summary')]
    .filter((e) => e.getClientRects().length).map((e) => { const r = e.getBoundingClientRect(); return [e.dataset.act || e.dataset.setting || e.tagName, Math.round(r.height)]; }).filter(([, h]) => h < 40));
  check(`${label}: pause menu buttons and lists are at least 40 px tall`, !small.length, small.slice(0, 6));
  const rows = await H(() => [...document.querySelectorAll('.overlay.show label.opt')].filter((e) => e.getClientRects().length && e.querySelector('input')).map((e) => Math.round(e.getBoundingClientRect().height)).filter((h) => h < 40));
  check(`${label}: setting rows with a checkbox or slider are at least 40 px tall`, !rows.length, rows);
  const keys = await H(() => [...document.querySelectorAll('.overlay.show label.opt > kbd')].filter((e) => e.getClientRects().length).length);
  check(`${label}: no keyboard hints beside touch menu options`, keys === 0, keys);
  await tap('.overlay.show [data-act=aircraft][data-id=chinook]');
  check(`${label}: aircraft switch from the pause menu`, (await H(() => window.__helicoptea.sim.aircraft)) === 'chinook');
  await tap('.overlay.show [data-act=resume]');
  check(`${label}: Resume by touch`, !(await H(() => window.__helicoptea.paused)));

  // Crash, watch the replay, close it by touch: back on the crash card, then Restart.
  await H(() => window.__helicoptea.stageCrash('impact'));
  await page.waitForSelector('.crash.show', { timeout: 15000 });
  await tap('.crash.show [data-act=replay]');
  await page.waitForFunction(() => window.__helicoptea.replay.active);
  await sleep(500);
  await tap('[data-rp=close]');
  await sleep(500);
  const after = await H(() => ({ crash: !!document.querySelector('.crash.show'), paused: window.__helicoptea.paused, modal: document.querySelector('.overlay.show [role=dialog]')?.getAttribute('aria-label') || null }));
  check(`${label}: closing the replay by touch returns to the crash card`, after.crash && !after.paused && !after.modal, after);
  await tap('.crash.show [data-act=restart]');
  check(`${label}: Restart Flight by touch`, !(await H(() => !!document.querySelector('.crash.show'))));

  // Putting the page away pauses the game and its sound.
  await H(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  check(`${label}: going to the background pauses`, await H(() => window.__helicoptea.paused));
  check(`${label}: no errors`, !errors.length, errors.slice(0, 3));
  await ctx.close();
}

const phone = { viewport: { width: 412, height: 891 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
try {
  const b = await chromium.launch({ executablePath, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  await run('Android', b, phone);
  await run('Android landscape', b, { ...phone, viewport: { width: 891, height: 412 } });
  await b.close();
  if (process.argv.includes('--webkit')) {
    // HELI_WEBKIT: a WebKit build to use when the one matching this Playwright isn't installed.
    const b2 = await webkit.launch(process.env.HELI_WEBKIT ? { executablePath: process.env.HELI_WEBKIT } : {}).catch((e) => { console.log(`(WebKit not available: ${e.message.split('\n')[0]})`); return null; });
    if (b2) { await run('iPhone', b2, { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, hasTouch: true }); await b2.close(); }
  }
} catch (e) {
  check('suite ran to the end', false, e.message.split('\n')[0]);
}
console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
