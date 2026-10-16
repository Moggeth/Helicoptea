// Flight stick / HOTAS in the real game, with an emulated X56 (stick and throttle as two non-standard
// devices, the way Chrome shows them): it is found and kept out of the gamepad layer, the stick banks the
// helicopter, the throttle lifts it, the Flight stick tab lists both devices and teaches an axis, the
// throttle can become the collective itself, and the help sheet describes it.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4199/';
const out = path.resolve('test-results/hotas');
fs.mkdirSync(out, { recursive: true });
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail ? JSON.stringify(detail) : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  await ctx.addInitScript(() => {
    const dev = (id, index, nb) => ({ id, index, connected: true, mapping: '', timestamp: 0, axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.2857], buttons: Array.from({ length: nb }, () => ({ pressed: false, touched: false, value: 0 })) });
    window.__x56 = {
      stick: dev('Saitek Pro Flight X-56 Rhino Stick (Vendor: 0738 Product: 2221)', 0, 17),
      throttle: dev('Saitek Pro Flight X-56 Rhino Throttle (Vendor: 0738 Product: a221)', 1, 36),
    };
    window.__x56.throttle.axes[0] = 1;   // throttle pulled back
    navigator.getGamepads = () => [window.__x56.stick, window.__x56.throttle];
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?quality=low`);
  await page.locator('#start-btn:not(.hidden)').click();
  await sleep(500);
  const H = (fn, arg) => page.evaluate(fn, arg);
  const set = (dev, i, v) => H(([d, i, v]) => { window.__x56[d].axes[i] = v; }, [dev, i, v]);

  const seen = await H(() => ({ hotas: window.__helicoptea.input.hotas.devices.length, pads: window.__helicoptea.input.pads.list().length }));
  check('both X56 devices are found, and the gamepad layer leaves them alone', seen.hotas === 2 && seen.pads === 0, seen);

  // Throttle forward: spring lift (default) climbs.
  await set('throttle', 0, -1);
  await sleep(900);
  const up = await H(() => ({ y: window.__helicoptea.sim.heli.pos.y, grounded: window.__helicoptea.sim.heli.grounded, src: window.__helicoptea.input.source }));
  check('throttle forward lifts off', !up.grounded && up.y > 0.08, up);
  check('the HUD uses flight-stick prompts', up.src === 'hotas', up.src);
  await set('throttle', 0, 0);
  // Stick right banks right.
  const before = await H(() => window.__helicoptea.sim.heli.body.rotation());
  await set('stick', 0, 1);
  await sleep(250);
  const roll = await H(() => window.__helicoptea.input.ctl.roll);
  await set('stick', 0, 0);
  const after = await H(() => window.__helicoptea.sim.heli.body.rotation());
  check('stick right is full roll at once', roll > 0.95, { roll });
  check('the airframe banked', Math.abs(after.z - before.z) > 0.01, { before: before.z, after: after.z });

  // Flight stick tab.
  await page.keyboard.press('Escape');
  await page.click('[data-act=controller]');
  await page.click('[data-act=ctltab][data-tab=hotas]');
  check('Controls has a Flight stick tab', await page.locator('.ho-tab:not(.hidden) [data-ho=teach]').isVisible());
  await sleep(150);
  const list = await page.locator('.ho-list').innerText();
  check('the tab lists the stick and throttle', /Rhino Stick/.test(list) && /Rhino Throttle/.test(list), list.slice(0, 160));
  // Teach roll on a different axis: the stick reports it on axis 3 this time, reversed.
  await page.locator('[data-ho=teach1][data-axis=roll]').click();
  await page.locator('.ho-teach:not(.hidden)').waitFor({ timeout: 2000 });
  await sleep(450);
  await set('stick', 3, -1); await sleep(300); await set('stick', 3, 0); await sleep(500);
  const r = await H(() => window.__helicoptea.input.hotas.profile.axes.roll);
  check('Teach stores the axis that moved, with its direction', r.index === 3 && r.sign === -1 && /Rhino Stick/.test(r.dev), r);
  await page.selectOption('[data-ho=lift]', 'lever');
  check('the throttle can be the collective itself', await H(() => window.__helicoptea.input.hotas.profile.lift === 'lever'));
  await page.screenshot({ path: path.join(out, 'flight-stick-tab.png') });
  await page.click('.ho-tab [data-act=closecontroller]');
  await page.keyboard.press('h');
  await page.locator('.overlay .help-grid').waitFor({ timeout: 2000 });
  check('the help sheet opens on the flight stick', /collective/.test(await page.locator('.overlay .help-grid').innerText()));
  await page.click('.overlay [data-act=closehelp]');
  await sleep(150);
  if (await page.locator('.overlay [data-act=resume]').isVisible()) await page.click('.overlay [data-act=resume]');
  await sleep(200);

  // Lever with Assist off: the collective is wherever the throttle sits.
  await H(() => { const g = window.__helicoptea; if (g.sim.assist) g.doAction('assist'); });
  await set('throttle', 0, -0.2);
  await sleep(300);
  const lev = await H(() => ({ lever: window.__helicoptea.input.ctl.lever, coll: window.__helicoptea.sim.heli.collective }));
  check('lever: the collective follows the throttle position with no lag', Math.abs(lev.lever - 0.6) < 0.01 && Math.abs(lev.coll - 0.6) < 0.01, lev);
  await H(() => { window.__helicoptea.input.hotas.resetProfile(); });
  check('no page errors', errors.length === 0, errors.slice(0, 3));
} catch (e) {
  check('suite ran', false, String(e && e.stack || e));
} finally {
  await browser.close();
}
const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length}/${checks.length} flight stick checks passed`);
process.exit(failed.length ? 1 : 0);
