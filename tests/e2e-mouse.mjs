// Keyboard and mouse flying in the real game: the Controls panel opens on the Keyboard and mouse tab, a
// scheme can be picked and a key remapped there, a click captures the mouse, mouse movement tilts the
// helicopter, the stick indicator shows, Esc lets go and pauses, and W springs back with Assist off.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { springCollectiveCase } from './spring-collective-case.mjs';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4199/';
const out = path.resolve('test-results/mouse');
fs.mkdirSync(out, { recursive: true });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
if (process.platform === 'win32') {
  console.log('SKIP Native pointer-lock acceptance requires an isolated Linux runner; Windows desktop capture is blocked.');
  process.exit(0);
}
const browser = await chromium.launch({ executablePath, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail ? JSON.stringify(detail) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?quality=low`);
  // Linux SwiftShader cold shader warmup measured 120.4 s on the hosted runner. This is a startup
  // allowance only; the actual climb/release assertions below retain their 5 s behavior deadlines.
  await page.locator('#start-btn:not(.hidden)').click({ timeout: process.env.GITHUB_ACTIONS === 'true' ? 180000 : 30000 });
  await sleep(600);
  const H = (fn, arg) => page.evaluate(fn, arg);

  // Pick Battlefield in Controls, and remap Hook to O.
  await page.keyboard.press('Escape');
  await page.click('.overlay.show [data-tab=controls]');
  await page.click('[data-act=controller]');
  check('Controls opens on the Keyboard and mouse tab', await page.locator('.kb-tab:not(.hidden) [data-kb=preset]').isVisible());
  await page.selectOption('[data-kb=preset]', 'battlefield');
  check('picking Battlefield flies with the mouse', await H(() => window.__helicoptea.input.mouseFlies));
  check('the mouse rows follow the scheme', await page.locator('[data-kb=maxis][data-dir=x]').inputValue() === 'roll');
  await page.locator('[data-kb=rebind][data-key="kadd-attach"]').click();
  await page.locator('.kb-capture:not(.hidden)').waitFor({ timeout: 2000 });
  await page.keyboard.press('o');
  await sleep(150);
  check('a key can be remapped in the panel', await H(() => window.__helicoptea.input.kbMap.keys.attach.includes('KeyO')));
  await page.screenshot({ path: path.join(out, 'controls-keyboard-mouse.png') });
  await page.click('.kb-tab [data-act=closecontroller]');
  await page.keyboard.press('h');
  await page.locator('.overlay .help-grid').waitFor({ timeout: 2000 });
  const sheet = await page.locator('.overlay .help-grid').innerText();
  check('the help sheet is written from the scheme', /Custom/.test(sheet) && /Mouse/.test(sheet) && sheet.split(String.fromCharCode(10)).some((l) => l.split(' ').includes('O')), { custom: /Custom/.test(sheet), mouse: /Mouse/.test(sheet), o: sheet.split(String.fromCharCode(10)).some((l) => l.split(' ').includes('O')), tail: sheet.slice(200, 700) });
  await page.click('.overlay [data-act=closehelp]');
  await sleep(200);
  if (await page.locator('.overlay [data-act=resume]').isVisible()) await page.click('.overlay [data-act=resume]');
  await sleep(300);

  // Take off on W, then capture the mouse.
  await page.keyboard.down('w'); await sleep(900); await page.keyboard.up('w');
  check('the click-to-fly nudge shows', await page.locator('.mouse-cta:not(.hidden)').isVisible());
  await page.mouse.click(640, 400);
  await sleep(250);
  const locked = await H(() => window.__helicoptea.input.locked);
  check('a click captures the mouse', locked);
  if (locked) {
    const before = await H(() => window.__helicoptea.sim.heli.body.rotation());
    let peak = 0;
    for (let i = 0; i < 12; i++) {
      const frame = await H(() => window.__helicoptea.frames);
      await page.mouse.move(640 + (i + 1) * 48, 400);
      await page.waitForFunction(f => window.__helicoptea.frames > f, frame, { timeout: 5000 });
      const sample = await H(() => ({ roll: window.__helicoptea.input.ctl.roll,
        tilt: Math.hypot(window.__helicoptea.input.mstick.x, window.__helicoptea.input.mstick.y), zone: window.__helicoptea.CFG.input.mouse.levelZone }));
      peak = Math.max(peak, sample.roll);
      if (sample.tilt > sample.zone + 0.08) break;
    }
    check('moving the mouse right banks right', peak > 0.05, { peak });
    check('the stick indicator shows', await page.locator('.mstick:not(.hidden)').isVisible());
    // Nose mode intentionally self-levels small tilts. Test its hold contract outside that zone,
    // and compare completed movement with a later sample, not with a possibly stale intermediate peak.
    const movedAt = await H(() => window.__helicoptea.frames);
    await page.waitForFunction(f => window.__helicoptea.frames > f + 1, movedAt, { timeout: 5000 });
    const settled = await H(() => ({ roll: window.__helicoptea.input.ctl.roll,
      tilt: Math.hypot(window.__helicoptea.input.mstick.x, window.__helicoptea.input.mstick.y), zone: window.__helicoptea.CFG.input.mouse.levelZone }));
    check('the native gesture reaches outside the self-level zone', settled.tilt > settled.zone + 0.05, settled);
    await sleep(500);
    const heldRoll = await H(() => window.__helicoptea.input.ctl.roll);
    check('with Assist on, mouse tilt outside the self-level zone stays put', Math.abs(heldRoll - settled.roll) < 0.02, { before: settled.roll, after: heldRoll, tilt: settled.tilt, zone: settled.zone });
    const after = await H(() => window.__helicoptea.sim.heli.body.rotation());
    check('the airframe actually rolled', Math.abs(after.z - before.z) + Math.abs(after.x - before.x) > 1e-3, { before, after });
    await page.screenshot({ path: path.join(out, 'mouse-flying.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__helicoptea.input.locked && window.__helicoptea.paused);
    const s = await H(() => ({ locked: window.__helicoptea.input.locked, paused: window.__helicoptea.paused }));
    check('Esc lets go of the mouse and pauses', !s.locked && s.paused, s);
  }

  // Spring-return lift with Assist off.
  // The preceding held-bank flight may legitimately have crashed. Restart this independent control
  // case rather than dereferencing a retired airframe or depending on a software GPU's flight pace.
  const { held, released: let_ } = await springCollectiveCase(page);
  check('Assist off: letting go of W drops the collective back below the climb', let_ < held - 0.05, { held, let: let_ });
  await H(() => window.__helicoptea.input.chooseKbPreset('keyboard'));
  check('no page errors', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  check('suite ran', false, String(e && e.stack || e));
  for (const ctx of browser.contexts()) for (const page of ctx.pages()) {
    console.log('INFO mouse failure state', JSON.stringify(await page.evaluate(() => ({ visibility: document.visibilityState, focus: document.hasFocus(), load: document.getElementById('load-status')?.textContent, errorShown: document.getElementById('error')?.classList.contains('show'), error: document.getElementById('error-msg')?.textContent, ready: !!window.__helicoptea, paused: window.__helicoptea?.paused, state: window.__helicoptea?.sim.state, keys: [...(window.__helicoptea?.input.keys || [])], collective: window.__helicoptea?.sim.heli?.collective, ctl: window.__helicoptea?.input.ctl })).catch(() => ({}))));
    await page.screenshot({ path: path.join(out, 'failure.png'), timeout: 5000 }).catch(() => {});
  }
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} mouse checks passed`);
process.exit(failed.length ? 1 : 0);
