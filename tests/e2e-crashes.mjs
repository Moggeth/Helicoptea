// Crashes and damage in a real browser (local Chrome via playwright-core): every staged crash kind on all
// three aircraft ends with its own reason, heading, effects and wreckage; a rotor strike hides the lost
// blades while the airframe falls; a tail strike hides the tail rotor and trails smoke as it spins; restart
// puts everything back; the Rotor strikes setting (default on) persists and makes blades pass through; the
// replay shows the lost rotor and plays each crash's effects; the measured cost of the effects; console errors.
// Usage: npm run build && npx vite preview --port 4201, then node tests/e2e-crashes.mjs [baseUrl]
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4201/';
const outDir = path.resolve('test-results/crashes');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const report = { perf: {} };
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });

async function open(query, viewport = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(base + query, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => window.__helicoptea.doAction('skiphints'));
  await sleep(700);
  return { ctx, page, logs };
}
const H = (page, fn, arg) => page.evaluate(fn, arg);

// Wraps the crash effects to time them per frame (the CPU cost they add) while the page runs.
const instrument = (page) => H(page, () => {
  const g = window.__helicoptea, fx = g.view.crashFx;
  if (fx.__timed) return;
  fx.__timed = true;
  g.__fxMs = []; let acc = 0;
  for (const k of ['update', 'updateLive', 'crash', 'event']) {
    const o = fx[k].bind(fx);
    fx[k] = (...a) => { const t = performance.now(); const r = o(...a); acc += performance.now() - t; return r; };
  }
  const tick = () => { g.__fxMs.push(acc); acc = 0; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
});
const frameStats = (page, ms) => H(page, (ms) => new Promise((resolve) => {
  const g = window.__helicoptea; const times = []; let last = performance.now(); const t0 = last; const i0 = g.__fxMs.length;
  const f = (t) => { times.push(t - last); last = t; if (t - t0 < ms) requestAnimationFrame(f); else {
    const fxMs = g.__fxMs.slice(i0).sort((a, b) => a - b);
    times.sort((a, b) => a - b);
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    resolve({ fps: +(1000 / avg).toFixed(1), p95Ms: +times[Math.floor(times.length * 0.95)].toFixed(2), fxAvgMs: +(fxMs.reduce((a, b) => a + b, 0) / Math.max(1, fxMs.length)).toFixed(3), fxMaxMs: +(fxMs[fxMs.length - 1] || 0).toFixed(3),
      particles: g.view.fx.count + g.view.smoke.count, shards: g.view.crashFx.n });
  } };
  requestAnimationFrame(f);
}), ms);

const state = (page) => H(page, () => {
  const g = window.__helicoptea, h = g.sim.heli, M = { micro: g.view.heliModel, chinook: g.view.chinookModel, skycrane: g.view.skycrane.model }[g.sim.aircraft];
  return {
    sim: g.sim.state, reason: g.sim.crashInfo?.reason, kind: g.sim.crashInfo?.kind, title: document.querySelector('.crash h2').textContent, why: document.querySelector('.crash .why').textContent,
    crashShown: document.querySelector('.crash').classList.contains('show'), shed: h ? h.dmg.shed : -1, tail: h ? h.dmg.tail : null, spin: h ? h.dmg.spin : 0,
    look: M.userData.dmgBits | 0, tailRotorVisible: M.userData.tailRotor ? M.userData.tailRotor.visible : null,
    fx: g.view.fx.count, smoke: g.view.smoke.count, shards: g.view.crashFx.n, debris: g.view.debris.size, scale: g.cinema.scale,
  };
});
const waitFor = (page, fn, ms = 6000) => page.waitForFunction(fn, null, { timeout: ms, polling: 16 }).then(() => true).catch(() => false);
const restart = async (page) => { await H(page, () => window.__helicoptea.doAction('restart')); await sleep(500); };

const KINDS = { rotor: ['rotor strike', 'shatter'], dunk: ['dunk', 'dunk'], rollover: ['rollover', 'thrash'], impact: ['impact', 'impact'], fall: ['fall', 'fall'] };
const TITLES = { shatter: 'Ka-boom.', dunk: 'Sploosh.', thrash: 'Ka-boom.', impact: 'Ka-boom.', fall: 'Splat.', spin: 'Round and round.' };

for (const aircraft of ['micro', 'chinook', 'skycrane']) {
  const { ctx, page, logs } = await open(`?aircraft=${aircraft}&view=chase`);
  await instrument(page);
  report.perf[`${aircraft}Flying`] = await frameStats(page, 1500);
  for (const [kind, [reason, crashKind]] of Object.entries(KINDS)) {
    await H(page, (k) => window.__helicoptea.stageCrash(k), kind);
    if (kind === 'rotor') {
      // The blades go first: while the airframe falls the lost rotor is hidden and it trails smoke.
      const shed = await waitFor(page, () => { const g = window.__helicoptea; return g.sim.heli && (g.sim.heli.dmg.shed & 1); }, 4000);
      await sleep(40);
      const s = await state(page);
      if (s.sim === 'flying') {
        check(`${aircraft}: rotor strike hides the lost blades as it falls`, shed && (s.look & 1) === 1, JSON.stringify({ look: s.look, shed: s.shed }));
        check(`${aircraft}: rotor strike throws blade debris and shards before the crash`, s.debris > 0 && s.shards > 10 && s.scale < 1, `${s.debris} blades, ${s.shards} shards, world at ${s.scale.toFixed(2)}x`);
      } else check(`${aircraft}: rotor strike hides the lost blades as it falls`, false, `already ${s.sim} (${s.reason})`);
      await page.screenshot({ path: `${outDir}/${aircraft}-rotor-shatter.png` });
    }
    const ended = await waitFor(page, () => window.__helicoptea.sim.state !== 'flying');
    await sleep(kind === 'impact' ? 120 : 250);
    // Read the aftermath before the 1.5 s frame-rate sample below, not after it: on a slow software
    // renderer the sparks would burn out while it measures.
    const s = await state(page);
    if (kind === 'impact' && aircraft === 'micro') report.perf.microCrash = await frameStats(page, 1500);
    await page.screenshot({ path: `${outDir}/${aircraft}-${kind}.png` });
    check(`${aircraft} ${kind}: ${reason} (${crashKind}) with its own heading and line`, ended && s.reason === reason && s.kind === crashKind && s.crashShown && s.title === TITLES[crashKind] && s.why.length > 10,
      `${s.reason}/${s.kind} "${s.title}" ${s.why}`);
    const fire = crashKind !== 'dunk';
    check(`${aircraft} ${kind}: effects and wreckage on screen`, s.debris >= 6 && s.shards > 5 && s.smoke > 20 && (fire ? s.fx > 20 : true), `${s.debris} debris, ${s.shards} shards, ${s.fx} sparks/fire, ${s.smoke} smoke/dust/tea`);
    await restart(page);
  }
  const back = await state(page);
  check(`${aircraft}: restart puts the rotors back`, back.sim === 'flying' && back.look === 0 && back.shed === 0, JSON.stringify({ look: back.look, shed: back.shed }));

  if (aircraft !== 'chinook') {
    await H(page, () => window.__helicoptea.stageCrash('tail'));
    const lost = await waitFor(page, () => window.__helicoptea.sim.heli?.dmg.tail, 4000);
    await sleep(2200);
    // The spin builds in simulated time; on a slow software renderer the world can lag the wall clock.
    await waitFor(page, () => Math.abs(window.__helicoptea.sim.heli?.dmg.spin || 0) > 4, 6000);
    const s = await state(page);
    const toast = await H(page, () => document.querySelector('.toast').textContent);
    await page.screenshot({ path: `${outDir}/${aircraft}-tail-spin.png` });
    check(`${aircraft}: tail strike hides the tail rotor and spins it up`, lost && s.sim === 'flying' && s.tailRotorVisible === false && Math.abs(s.spin) > 4 && /Tail rotor gone/.test(toast), `spin ${s.spin.toFixed(1)} rad/s, smoke ${s.smoke}, toast "${toast}"`);
    // Then down hard: a spin crash.
    await H(page, () => { const h = window.__helicoptea.sim.heli; h.body.setTranslation({ x: h.pos.x + 0.15, y: -0.6, z: h.pos.z }, true); h.body.setLinvel({ x: 0, y: -3.2, z: 0 }, true); h.thrust = 0; });
    const down = await waitFor(page, () => window.__helicoptea.sim.state !== 'flying', 5000);
    await sleep(250);
    const c = await state(page);
    await page.screenshot({ path: `${outDir}/${aircraft}-tail-crash.png` });
    check(`${aircraft}: crashing with no tail rotor is a spin crash`, down && c.reason === 'tail strike' && c.kind === 'spin' && c.title === 'Round and round.', `${c.reason}/${c.kind}`);
    await restart(page);
    const b2 = await state(page);
    check(`${aircraft}: restart puts the tail rotor back`, b2.tailRotorVisible === true && b2.look === 0);
  }
  check(`${aircraft}: no console errors`, logs.length === 0, logs.slice(0, 4).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------- settings toggle, replay, cost
{
  const { ctx, page, logs } = await open('?aircraft=micro&view=chase');
  await instrument(page);
  await page.keyboard.press('Escape'); await sleep(250);
  const box = await H(page, () => { const el = document.querySelector('[data-setting=rotorStrikes]'); return el ? el.checked : null; });
  check('Pause menu: Rotor strikes is on by default', box === true);
  await H(page, () => document.querySelector('[data-setting=rotorStrikes]').click());
  await sleep(100);
  const off = await H(page, () => ({ sim: window.__helicoptea.sim.damage.rotorStrikes, stored: localStorage.getItem('helicoptea.rotorStrikes') ?? Object.entries(localStorage).find(([k]) => /rotorStrikes/.test(k))?.[1] }));
  check('unticking it turns rotor strikes off and remembers it', off.sim === false && off.stored === '0', JSON.stringify(off));
  await page.keyboard.press('Escape'); await sleep(250);
  await H(page, () => window.__helicoptea.stageCrash('wear'));
  await sleep(1500);
  let s = await state(page);
  check('rotor strikes off: blades pass through the wall', s.sim === 'flying' && s.shed === 0, JSON.stringify({ sim: s.sim, shed: s.shed, reason: s.reason }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
  const persisted = await H(page, () => window.__helicoptea.sim.damage.rotorStrikes);
  check('rotor strikes setting survives a reload', persisted === false);
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await H(page, () => window.__helicoptea.doAction('skiphints'));
  await page.keyboard.press('Escape'); await sleep(250);
  await H(page, () => document.querySelector('[data-setting=rotorStrikes]').click());
  await page.keyboard.press('Escape'); await sleep(400);
  await instrument(page);
  check('ticking it turns them back on', await H(page, () => window.__helicoptea.sim.damage.rotorStrikes) === true);

  // Rotor crash, then Watch replay: the lost rotor and the effects replay.
  await H(page, () => window.__helicoptea.stageCrash('rotor'));
  await waitFor(page, () => window.__helicoptea.sim.state !== 'flying');
  report.perf.microShatterCrash = await frameStats(page, 1500);
  await sleep(600);
  await page.click('.crash [data-act=replay]');
  await sleep(300);
  const marks = await H(page, () => { const f = window.__helicoptea.replay.flight; const sh = f.events.find((e) => e.type === 'rotorShatter'), c = f.crash(); return { sh: sh && sh.i, c: c && c.i, kind: c && c.kind }; });
  check('the flight log has the shatter before the crash', marks.sh !== undefined && marks.c > marks.sh && marks.kind === 'shatter', JSON.stringify(marks));
  // Between shatter and crash: the replayed aircraft has no blades.
  await H(page, (i) => { const R = window.__helicoptea.replay; R.playing = false; R.seek(i); }, Math.round((marks.sh + marks.c) / 2));
  await sleep(200);
  const mid = await H(page, () => ({ alive: window.__helicoptea.replay.stage.alive, look: window.__helicoptea.view.heliModel.userData.dmgBits | 0 }));
  check('replay: between the strike and the crash the rotor is gone', mid.alive && (mid.look & 1) === 1, JSON.stringify(mid));
  await page.screenshot({ path: `${outDir}/replay-hulk.png` });
  // Play through the strike and the crash: their effects are drawn again.
  await H(page, (i) => { const R = window.__helicoptea.replay; R.seek(i); R.rate = 1; R.playing = true; }, Math.max(0, marks.sh - 20));
  await sleep(1600);
  const fx = await H(page, () => ({ shards: window.__helicoptea.view.crashFx.n, fx: window.__helicoptea.view.fx.count, alive: window.__helicoptea.replay.stage.alive }));
  await page.screenshot({ path: `${outDir}/replay-crash.png` });
  check('replay: the shatter and the crash effects play again', fx.shards > 10 && fx.fx > 10, JSON.stringify(fx));
  await page.click('[data-rp=close]'); await sleep(300);
  check('no console errors (settings and replay)', logs.length === 0, logs.slice(0, 4).join(' | '));
  await ctx.close();
}

const P = report.perf;
check('crash effects cost little per frame', P.microCrash && P.microCrash.fxAvgMs < 1.0 && P.microShatterCrash.fxAvgMs < 1.0, JSON.stringify({ impact: P.microCrash, shatter: P.microShatterCrash }));
console.log('\nFrame cost (rAF interval and crash-effect CPU per frame):');
for (const [k, v] of Object.entries(P)) console.log(`  ${k.padEnd(20)} ${JSON.stringify(v)}`);
fs.writeFileSync(`${outDir}/report.json`, JSON.stringify({ results, report }, null, 2));
await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} browser crash checks passed`);
process.exit(failed.length ? 1 : 0);
