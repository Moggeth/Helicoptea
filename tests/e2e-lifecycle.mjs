// GPU allocation soak checks; uses the same installed browser as the other suites.
import { chromium, startupTimeout } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4207/';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(fs.existsSync);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
let failed = 0;
const check = (name, ok, detail) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${detail || ''}`); if (!ok) failed++; };
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  const start = performance.now();
  await page.goto(`${base}?quality=low&record=0`);
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: startupTimeout(60000) });
  const readyMs = performance.now() - start;
  await page.click('#start-btn'); await page.keyboard.press('Escape');
  const results = await page.evaluate(async () => {
    const H = window.__helicoptea;
    const frame = () => new Promise(requestAnimationFrame);
    if (!H.paused) H.doAction('pause');
    const counts = [];
    for (let i = 0; i < 16; i++) {
      H.sim.resetSandbox();
      H.view.handleEvents(H.sim.drainEvents(), H.camRig.camera, H.camRig);
      H.view.update(1, 1);
      await frame(); await frame();
      counts.push({ ...H.renderer.info.memory });
    }
    H.tuningPanel.open('micro');
    H.tuningPanel.preview('rotationRate');
    const rig = H.tuningPanel.rig, memories = [], disposed = [];
    for (let i = 0; i < 12; i++) {
      const previous = rig.sides;
      rig.stop(); rig.show({ knobId: 'rotationRate', scope: 'global', aircraft: ['micro', 'chinook', 'skycrane'][i % 3], mode: 'range' });
      if (previous && previous !== rig.sides) disposed.push(previous.every((s) => s.sim.disposed));
      await frame(); await frame();
      memories.push({ aircraft: rig.aircraft, ...rig.renderer.info.memory });
    }
    const lastSides = rig.sides;
    H.tuningPanel.close();
    return { counts, memories, disposed, closed: lastSides.every((s) => s.sim.disposed), pendingFrame: rig.raf, calls: H.renderer.info.render.calls };
  });
  const stable = (key) => new Set(results.counts.slice(2).map((v) => v[key])).size === 1;
  check('sixteen sandbox resets keep GPU geometry count bounded', stable('geometries'), JSON.stringify(results.counts.map((v) => v.geometries)));
  check('sixteen sandbox resets keep texture count bounded', stable('textures'));
  check('preview aircraft switching frees previous physics worlds', results.disposed.length > 0 && results.disposed.every(Boolean));
  check('repeated preview aircraft visits keep GPU assets bounded', ['micro', 'chinook', 'skycrane'].every((a) => {
    const visits = results.memories.filter((m) => m.aircraft === a).slice(1);
    return new Set(visits.map((m) => `${m.geometries}:${m.textures}`)).size === 1;
  }), JSON.stringify(results.memories));
  check('closing previews frees worlds and cancels animation', results.closed && results.pendingFrame == null);
  check('lifecycle soak produces no browser exceptions', errors.length === 0, errors.join('; '));
  const replay = await page.evaluate(async () => {
    const H = window.__helicoptea, r = H.replay, stage = r.stage;
    const frame = () => new Promise(requestAnimationFrame);
    H.recorder.enabled = true;
    const counts = [];
    for (let k = 0; k < 8; k++) {
      H.sim.resetSandbox();
      const f = H.recorder.startFlight();
      for (let j = 0; j < 12; j++) {
        const ctl = { pitch: 0, roll: 0, yaw: 0, collective: 0 };
        H.sim.step(ctl); H.recorder.afterStep(ctl);
        H.sim.drainEvents(); H.recorder.frameEnd();
      }
      stage.pose(f, 0, 0, false);
      counts.push(stage.bags.size);
      await frame();
    }
    stage.leave();
    const cleared = stage.bags.size === 0 && stage.buckets.size === 0 && stage.debris.size === 0;
    H.recorder.enabled = false;
    // Resolve two loads backwards: only the latest selection may reach the stage.
    const saved = { load: r.store.load, setFlight: r.setFlight, active: r.active };
    const pending = {}, selected = [];
    r.active = true; r.flight = null;
    r.store.load = (id) => new Promise((resolve) => { pending[id] = resolve; });
    r.setFlight = (f) => { selected.push(f.id); r.flight = f; };
    try {
      const first = r.selectFlight('d:older'), second = r.selectFlight('d:newer');
      pending.newer({ id: 'newer', bytes: 1, dirty: false }); await second;
      pending.older({ id: 'older', bytes: 1, dirty: false }); await first;
    } finally { r.store.load = saved.load; r.setFlight = saved.setFlight; r.active = saved.active; r.flight = null; r.disk.clear(); }
    return { counts, cleared, selected };
  });
  check('replay switching bounds cargo meshes to one flight', replay.counts.every((n) => n === replay.counts[0]) && replay.counts[0] > 0, JSON.stringify(replay.counts));
  check('leaving replay releases its cargo and debris', replay.cleared);
  check('late replay loads cannot replace a newer selection', JSON.stringify(replay.selected) === '["newer"]');
  fs.mkdirSync('test-results/lifecycle', { recursive: true });
  fs.writeFileSync('test-results/lifecycle/metrics.json', JSON.stringify({ readyMs, ...results }, null, 2));
} finally { await browser.close(); }
process.exitCode = failed ? 1 : 0;
