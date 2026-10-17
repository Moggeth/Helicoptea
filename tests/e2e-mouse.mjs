// Keyboard and mouse flying in the real game: the Controls panel opens on the Keyboard and mouse tab, a
// scheme can be picked and a key remapped there, a click captures the mouse, mouse movement tilts the
// helicopter, the stick indicator shows, Esc lets go and pauses, and W springs back with Assist off.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
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
  await page.locator('#start-btn:not(.hidden)').click();
  await sleep(600);
  const H = (fn, arg) => page.evaluate(fn, arg);

  // Pick Battlefield in Controls, and remap Hook to O.
  await page.keyboard.press('Escape');
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
      await page.mouse.move(640 + (i + 1) * 12, 400);
      peak = Math.max(peak, await H(() => window.__helicoptea.input.ctl.roll));
      await sleep(16);
    }
    check('moving the mouse right banks right', peak > 0.05, { peak });
    check('the stick indicator shows', await page.locator('.mstick:not(.hidden)').isVisible());
    await sleep(500);
    check('with Assist on, the mouse tilt stays where you leave it', Math.abs(await H(() => window.__helicoptea.input.ctl.roll) - peak) < 0.02);
    const after = await H(() => window.__helicoptea.sim.heli.body.rotation());
    check('the airframe actually rolled', Math.abs(after.z - before.z) + Math.abs(after.x - before.x) > 1e-3, { before, after });
    await page.screenshot({ path: path.join(out, 'mouse-flying.png') });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__helicoptea.input.locked && window.__helicoptea.paused);
    const s = await H(() => ({ locked: window.__helicoptea.input.locked, paused: window.__helicoptea.paused }));
    check('Esc lets go of the mouse and pauses', !s.locked && s.paused, s);
    await page.keyboard.press('Escape');
    await sleep(200);
  }

  // Spring-return lift with Assist off.
  // The preceding held-bank flight may legitimately have crashed. Restart this independent control
  // case rather than dereferencing a retired airframe or depending on a software GPU's flight pace.
  await H(() => window.__helicoptea.doAction('restart'));
  await page.waitForFunction(() => window.__helicoptea.sim.heli && window.__helicoptea.sim.state === 'flying');
  await H(() => window.__helicoptea.input.centreMouse());
  await H(() => { const g = window.__helicoptea; if (g.sim.assist) g.doAction('assist'); });
  await page.keyboard.down('w'); await sleep(500);
  const held = await H(() => window.__helicoptea.sim.heli.collective);
  await page.keyboard.up('w'); await sleep(500);
  const let_ = await H(() => window.__helicoptea.sim.heli.collective);
  check('Assist off: letting go of W drops the collective back below the climb', let_ < held - 0.05, { held, let: let_ });
  await H(() => window.__helicoptea.input.chooseKbPreset('keyboard'));
  check('no page errors', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  check('suite ran', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} mouse checks passed`);
process.exit(failed.length ? 1 : 0);
