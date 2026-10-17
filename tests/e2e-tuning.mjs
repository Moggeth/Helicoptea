// The flight tuning board in a real browser: it opens from the pause menu, sliders change the live
// config and persist across a reload, rows reset, tabs scope to one aircraft, presets, export and import
// work, the mouse-over clips run side by side, every clip flies cleanly at both ends of every range on
// every aircraft, and the board closes back to the game with nothing logged as an error.
// Usage: npm run build, serve dist, then node tests/e2e-tuning.mjs [baseUrl] [--headed]
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4179/';
const outDir = path.resolve('test-results/tuning');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({ executablePath: CHROME, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

const H = (fn, arg) => page.evaluate(fn, arg);
async function boot() {
  await page.goto(base);
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  await page.click('#start-btn');
  await sleep(600);
}
async function openBoard() {
  await page.keyboard.press('Escape');
  await sleep(250);
  if (process.env.DBG) console.log('DBG', await H(() => ({ paused: window.__helicoptea.paused, modal: document.querySelector('#modal, .modal')?.className, act: document.activeElement?.outerHTML?.slice(0, 80), btn: !!document.querySelector('[data-act=tuning]') })).then(JSON.stringify));
  await page.click('[data-act=tuning]');
  await page.waitForSelector('.tune-panel', { timeout: 5000 });
}
const setSlider = (knob, frac) => H(({ knob, frac }) => {
  const inp = document.querySelector(`input[type=range][data-knob=${knob}]`);
  inp.value = String(Math.round(frac * 1000));
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return document.querySelector(`.tune-row[data-knob=${knob}] .tune-val`).textContent;
}, { knob, frac });

await boot();
await H(() => localStorage.removeItem('helicoptea.tuning.v1'));
await page.reload();
await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
await page.click('#start-btn');
await sleep(600);

// ---------------------------------------------------------------- opening
await openBoard();
const layout = await H(() => {
  const { KNOBS, GROUPS } = window.__helicoptea.tuningKnobs;
  return {
    rows: document.querySelectorAll('.tune-row').length, globals: KNOBS.filter((k) => k.global).length,
    groups: document.querySelectorAll('.tune-group').length, groupCount: GROUPS.length,
    tabs: [...document.querySelectorAll('.tune-tabs button')].map((b) => b.textContent.trim()),
    idle: !document.querySelector('.tune-idle').classList.contains('hidden'),
  };
});
check('Pause → Flight tuning opens the board', layout.rows > 0);
check('all-aircraft tab lists every global knob in its groups', layout.rows === layout.globals && layout.groups === layout.groupCount, `${layout.rows} rows, ${layout.groups} groups`);
check('tabs for all aircraft and each aircraft', layout.tabs.join('|') === 'All aircraft|Micro heli|Chinook|Skycrane', layout.tabs.join(', '));
check('preview starts with a hint to hover', layout.idle);
await page.screenshot({ path: path.join(outDir, 'board.png') });

// ---------------------------------------------------------------- a slider changes the live game
const before = await H(() => window.__helicoptea.tuning.base.get('heli.dragPlane'));
const shown = await setSlider('coasting', 0.1);
const after = await H(() => ({ cfg: window.__helicoptea.tuning.getGlobal('coasting'), changed: document.querySelector('.tune-row[data-knob=coasting]').classList.contains('changed'), count: document.querySelector('[data-tab=global] .tune-count')?.textContent }));
const liveDrag = await H(() => window.__helicoptea.sim && (window.__helicoptea.tuning.base.get('heli.dragPlane') * window.__helicoptea.tuning.getGlobal('coasting')));
check('moving a slider changes the value and marks the row', after.cfg < 1 && after.changed && after.count === '1', `coasting ${shown}`);
check('the multiplier reaches the live config', Math.abs(liveDrag - before * after.cfg) < 1e-9);

// keyboard on a focused slider
await page.focus('input[data-knob=rotationRate]');
await page.keyboard.press('ArrowRight');
for (let i = 0; i < 30; i++) await page.keyboard.press('ArrowRight');
const kb = await H(() => window.__helicoptea.tuning.getGlobal('rotationRate'));
check('arrow keys move a focused slider', kb > 1, `rotation rate ×${kb.toFixed(2)}`);

// reset one knob
await page.click('.tune-row[data-knob=rotationRate] .tune-reset');
check('↺ resets one knob', await H(() => window.__helicoptea.tuning.getGlobal('rotationRate') === 1));

// ---------------------------------------------------------------- mouse-over clip
await page.hover('.tune-row[data-knob=coasting]');
// The clip runs on its own clock (at most 50 ms per frame), so wait on clip time rather than wall time:
// a software renderer at 10 fps plays it at half speed.
await page.waitForFunction(() => { const r = window.__helicoptea.tuningPanel.rig; return r && r.running && Math.min(r.sides[0].t, r.sides[1].t) > 0.35; }, null, { timeout: 15000 }).catch(() => {});
const clip = await H(() => {
  const P = window.__helicoptea.tuningPanel, r = P.rig;
  return {
    running: !!(r && r.running), t: r ? Math.min(r.sides[0].t, r.sides[1].t) : 0, states: r ? r.sides.map((s) => s.sim.state) : [],
    canvas: !document.querySelector('.tune-canvas').classList.contains('hidden'),
    l: document.querySelector('.tune-label.l b').textContent, r: document.querySelector('.tune-label.r b').textContent,
    name: document.querySelector('.tune-pname').textContent, simMs: r?.simMs,
    previewing: document.querySelector('.tune-row.previewing')?.dataset.knob,
  };
});
check('hovering a row plays its clip', clip.running && clip.canvas && clip.t > 0.3 && clip.previewing === 'coasting', `${clip.name}, clip time ${clip.t.toFixed(2)} s, sim ${Number(clip.simMs).toFixed(2)} ms/frame`);
check('the clip compares the low and high ends', /^Low/.test(clip.l) && /^High/.test(clip.r), `${clip.l} | ${clip.r}`);
check('both sides are flying', clip.states.every((s) => s === 'flying'), clip.states.join(', '));
await page.screenshot({ path: path.join(outDir, 'clip-coasting.png') });
await page.click('[data-act=tuneMode][data-mode=yours]');
await sleep(300);
const yours = await H(() => [document.querySelector('.tune-label.l b').textContent, document.querySelector('.tune-label.r b').textContent]);
check('Default vs yours compares your value with the default', /^Default ×1\.00/.test(yours[0]) && /^Yours ×0\./.test(yours[1]), yours.join(' | '));
await page.click('[data-act=tuneMode][data-mode=range]');
await page.hover('.tune-row[data-knob=expo]');
await sleep(400);
const curve = await H(() => ({ curve: !document.querySelector('.tune-curve').classList.contains('hidden'), canvas: document.querySelector('.tune-canvas').classList.contains('hidden') }));
check('stick knobs show an animated curve instead of a flight', curve.curve && curve.canvas);
await page.screenshot({ path: path.join(outDir, 'clip-expo.png') });

// ---------------------------------------------------------------- per-aircraft tab
await page.click('[data-act=tuneTab][data-tab=chinook]');
await sleep(300);
const ch = await H(() => [...document.querySelectorAll('.tune-row')].map((r) => r.dataset.knob));
check('Chinook tab has the Chinook-only knob', ch.includes('pitchResponse'));
check('per-aircraft tabs leave out global-only knobs', !ch.includes('worldSpeed') && !ch.includes('gravity') && !ch.includes('expo'));
const chBefore = await H(() => window.__helicoptea.tuning.base.get('chinook.latCyclic'));
await setSlider('rotationRate', 1);
const chAfter = await H(() => ({ v: window.__helicoptea.tuning.getAircraft('chinook', 'rotationRate'), g: window.__helicoptea.tuning.getGlobal('rotationRate') }));
check('a per-aircraft slider changes only that aircraft', chAfter.v === 2 && chAfter.g === 1, `Chinook rotation ×${chAfter.v}`);
await page.click('[data-act=tuneTab][data-tab=micro]');
await sleep(200);
const mi = await H(() => [...document.querySelectorAll('.tune-row')].map((r) => r.dataset.knob));
check('micro tab leaves out the Chinook-only knob', !mi.includes('pitchResponse'));
check('Chinook changed count shows on its tab', await H(() => document.querySelector('[data-tab=chinook] .tune-count')?.textContent === '1'));

// ---------------------------------------------------------------- persistence
await page.reload();
await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
const kept = await H(() => ({ c: window.__helicoptea.tuning.getGlobal('coasting'), r: window.__helicoptea.tuning.getAircraft('chinook', 'rotationRate') }));
check('tuning survives a reload', kept.c === after.cfg && kept.r === 2, `coasting ×${kept.c}, Chinook rotation ×${kept.r}`);
await page.click('#start-btn');
await sleep(500);
await openBoard();

// ---------------------------------------------------------------- presets, export, import, reset all
await page.selectOption('[data-tune=preset]', 'snappy');
await sleep(200);
const sn = await H(() => ({ rr: window.__helicoptea.tuning.getGlobal('rotationRate'), expo: window.__helicoptea.tuning.getGlobal('expo'), shape: window.__helicoptea.tuning.shape(0.5) }));
check('Snappy acro preset applies', sn.rr === 2 && sn.expo === 0.4, `rotation ×${sn.rr}, expo ${sn.expo}`);
check('stick shaping is live in the game', sn.shape !== 0.5, `half stick → ${sn.shape.toFixed(3)}`);
const dl = page.waitForEvent('download', { timeout: 5000 }).catch(() => null);
await page.click('[data-act=tuneExport]');
const d = await dl;
let exported = null;
if (d) { const f = path.join(outDir, 'helicoptea-tuning.json'); await d.saveAs(f); try { exported = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* checked below */ } }
check('Export saves a tuning file', !!exported && exported.helicopteaTuning === 1 && exported.global.rotationRate === 2, d ? d.suggestedFilename() : 'no download');
await page.click('[data-act=tuneResetAll]');
await sleep(200);
check('Reset all returns to the shipped feel', await H(() => window.__helicoptea.tuning.changedCount('global') === 0 && window.__helicoptea.tuning.changedCount('chinook') === 0));
await page.click('[data-act=tuneImport]');
await page.fill('.tune-import textarea', JSON.stringify({ global: { gravity: 0.8, coasting: 0.4 }, aircraft: { skycrane: { thrustToWeight: 1.3 } } }));
await page.click('[data-act=tuneImportApply]');
await sleep(300);
const imp = await H(() => ({ g: window.__helicoptea.tuning.getGlobal('gravity'), s: window.__helicoptea.tuning.getAircraft('skycrane', 'thrustToWeight'), hidden: document.querySelector('.tune-import')?.classList.contains('hidden'), grav: window.__helicoptea.sim.world.gravity.y }));
check('Import applies a pasted tuning', imp.g === 0.8 && imp.s === 1.3, `gravity ×${imp.g}, Skycrane thrust ×${imp.s}`);
check('gravity reaches the live physics world', Math.abs(imp.grav + 9.81 * 0.8) < 0.05, `g ${imp.grav.toFixed(2)}`);
await page.click('[data-act=tuneImport]');
await page.fill('.tune-import textarea', 'not json');
await page.click('[data-act=tuneImportApply]');
await sleep(200);
check('Import explains a bad file instead of failing silently', /Couldn't read/.test(await H(() => document.querySelector('.tune-error').textContent)));
await page.click('[data-act=tuneImportCancel]');
await page.click('[data-act=tuneResetAll]');

await page.hover('.tune-row[data-knob=coasting]');
await sleep(300);
// ---------------------------------------------------------------- every clip flies, at both ends, on every aircraft
const sweep = await H(async () => {
  const { KNOBS } = window.__helicoptea.tuningKnobs;
  const rig = window.__helicoptea.tuningPanel.rig;
  const bad = [];
  let n = 0;
  const t0 = performance.now();
  for (const scope of ['global', 'micro', 'chinook', 'skycrane']) {
    for (const aircraft of scope === 'global' ? ['micro', 'chinook', 'skycrane'] : [scope]) {
      for (const k of KNOBS) {
        if (!k.clip || k.clip.scenario === 'curve') continue;
        if (scope === 'global' ? !k.global : !(k.perAircraft && (!k.only || k.only.includes(scope)))) continue;
        if (!rig.show({ knobId: k.id, scope, aircraft, mode: 'range' })) continue;
        rig.stop();
        const sc = rig.spec.scenario;
        for (let i = 0; i < 1000 && (rig.sides[0].t < 4.6 || rig.sides[1].t < 4.6); i++) {
          rig.sides.forEach((s, j) => { s.advance(1 / 60, rig.applySide(j), sc); });
          rig.tuning.apply();
        }
        n++;
        rig.sides.forEach((s, j) => { if (s.sim.state !== 'flying') bad.push(`${scope}/${aircraft} ${k.id} ×${rig.values[j]}: ${s.sim.crashInfo ? s.sim.crashInfo.reason : s.sim.state}`); });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }
  return { bad, n, ms: performance.now() - t0 };
});
check('every clip flies without crashing at both ends of every range', sweep.bad.length === 0, `${sweep.n} clips × 2 sides in ${(sweep.ms / 1000).toFixed(1)} s${sweep.bad.length ? ': ' + sweep.bad.slice(0, 6).join('; ') : ''}`);
check('the clip sweep left the live config untouched', await H(() => window.__helicoptea.tuning.changedCount('global') === 0 && Math.abs(window.__helicoptea.sim.world.gravity.y + 9.81) < 0.01));

// ---------------------------------------------------------------- closing
await page.click('[data-act=tuneDone]');
await sleep(300);
const closed = await H(() => ({ panel: !!document.querySelector('.tune-panel'), rig: !!window.__helicoptea.tuningPanel.rig, paused: window.__helicoptea.paused }));
check('Done closes the board back to the pause menu and frees the preview', !closed.panel && !closed.rig && closed.paused);
await page.keyboard.press('Escape');
await sleep(800);
const flying = await H(() => ({ paused: window.__helicoptea.paused, state: window.__helicoptea.sim.state }));
check('the game resumes and flies', !flying.paused && flying.state === 'flying');
const escTrail = [];
for (let i = 0; i < 3; i++) {
  await openBoard();
  await page.hover('.tune-row[data-knob=gravity]');
  await sleep(300);
  await page.keyboard.press('Escape');  // Esc (gamepad B) closes the board back to the pause menu
  await sleep(250);
  escTrail.push(await H(() => `${document.querySelector('.tune-panel') ? 'board' : 'no board'}/${window.__helicoptea.paused ? 'paused' : 'flying'}`));
  if (await H(() => window.__helicoptea.paused)) { await page.keyboard.press('Escape'); await sleep(250); }
}
check('Esc closes the board back to the pause menu', escTrail.every((e) => e === 'no board/paused'), escTrail.join(', '));
check('opening and closing the board repeatedly stays clean', await H(() => !document.querySelector('.tune-panel') && !window.__helicoptea.tuningPanel.rig));
check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} tuning board checks passed`);
process.exit(failed.length ? 1 : 0);
