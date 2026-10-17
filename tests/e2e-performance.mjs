// Work-count regressions, independent of desktop GPU speed. Every browser launch uses the pointer guard.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4199/';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find(fs.existsSync);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} — ${JSON.stringify(detail)}`); };
const browser = await chromium.launch({ executablePath, headless: !process.argv.includes('--headed'), args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
try {
  const page = await browser.newPage({ viewport: { width: 412, height: 891 }, deviceScaleFactor: 3.5, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?quality=medium&record=0&dynres=0&lesson=0`);
  await page.waitForFunction(() => window.__helicoptea, { timeout: 90000 });
  await page.evaluate(() => { document.getElementById('start-btn').click(); window.__helicoptea.doAction('skiphints'); window.__helicoptea.doAction('pause'); });
  await page.waitForFunction(() => !document.getElementById('loading').classList.contains('show'));
  await page.waitForTimeout(100);
  const idle = await page.evaluate(async () => {
    const H = window.__helicoptea, proto = H.THREE.Object3D.prototype, original = proto.updateMatrix;
    let transforms = 0, mutations = 0, hiddenTransforms = 0;
    const hidden = new Set();
    for (const root of [H.view.chinookModel, H.view.skycrane.model]) root.traverse((o) => hidden.add(o));
    proto.updateMatrix = function () { transforms++; if (hidden.has(this)) hiddenTransforms++; return original.call(this); };
    const observer = new MutationObserver((records) => { mutations += records.length; });
    observer.observe(document.body, { childList: true, characterData: true, attributes: true, subtree: true });
    const start = H.frames;
    try { await new Promise((resolve) => { const next = () => H.frames - start >= 30 ? resolve() : requestAnimationFrame(next); requestAnimationFrame(next); }); }
    finally { observer.disconnect(); proto.updateMatrix = original; }
    return { frames: H.frames - start, transformsPerFrame: transforms / (H.frames - start), hiddenTransforms, mutations };
  });
  check('idle flight HUD does not rewrite unchanged DOM', idle.mutations === 0, idle);
  check('hidden aircraft do no transform work', idle.hiddenTransforms === 0, idle);
  check('visible and frozen matrix walk stays bounded', idle.transformsPerFrame < 600, idle);
  const batches = await page.evaluate(() => { let n = 0; window.__helicoptea.view.scene.traverse((o) => { if (o.name === 'kitchen-static') n++; }); return n; });
  check('static kitchen uses material batches', batches > 0 && batches < 40, { batches });
  await page.evaluate(() => window.__helicoptea.doAction('resume'));
  for (const aircraft of ['micro', 'chinook', 'skycrane']) {
    await page.evaluate((id) => { const H = window.__helicoptea; H.setAircraft(id); H.setView('cockpit'); }, aircraft);
    await page.waitForTimeout(450);
    const cockpit = await page.evaluate(async () => {
      const H = window.__helicoptea;
      const world = H.world, original = world.inset;
      let insets = 0;
      world.inset = function (...a) { insets++; return original.apply(this, a); };
      const f0 = H.frames, t0 = performance.now();
      await new Promise((r) => setTimeout(r, 450));
      world.inset = original;
      return { aircraft: H.sim.aircraft, mode: H.camMode, flying: H.sim.state, frames: H.frames - f0, insets, seconds: (performance.now() - t0) / 1000, rendered: H.loadCam.rendered, calls: H.renderer.info.render.calls };
    });
    check(`${aircraft}: cockpit still draws after aircraft/camera switch`, cockpit.mode === 'cockpit' && cockpit.rendered && cockpit.calls > 0, cockpit);
    check(`${aircraft}: hook camera culls only when drawing`, cockpit.insets <= Math.ceil(cockpit.seconds * 18) + 1 && cockpit.insets < cockpit.frames, cockpit);
    await page.evaluate(() => { const H = window.__helicoptea; H.setView('chase'); H.doAction('restart'); });
  }
  await page.evaluate(() => { const H = window.__helicoptea; H.setView('cockpit'); H.doAction('pause'); });
  await page.waitForTimeout(300);
  const cached = await page.evaluate(async () => {
    const H = window.__helicoptea, hidden = new Set();
    for (const it of Object.values(H.cockpit.interiors)) if (!it.group.visible) it.group.traverse((o) => hidden.add(o));
    const proto = H.THREE.Object3D.prototype, original = proto.updateMatrix;
    let transforms = 0;
    proto.updateMatrix = function () { if (hidden.has(this)) transforms++; return original.call(this); };
    const start = H.frames;
    try { await new Promise((resolve) => { const next = () => H.frames - start >= 30 ? resolve() : requestAnimationFrame(next); requestAnimationFrame(next); }); }
    finally { proto.updateMatrix = original; }
    return { interiors: Object.keys(H.cockpit.interiors).length, hiddenNodes: hidden.size, hiddenTransforms: transforms };
  });
  check('cached inactive cockpit interiors do no transform work', cached.interiors === 3 && cached.hiddenNodes > 0 && cached.hiddenTransforms === 0, cached);
  check('scene and aircraft shaders compile without browser errors', errors.length === 0, errors);
} finally {
  await browser.close();
  fs.mkdirSync('test-results/performance', { recursive: true });
  fs.writeFileSync('test-results/performance/work-counts.json', JSON.stringify({ base, results }, null, 2));
}
console.log(`${results.filter((r) => r.ok).length}/${results.length} performance-work checks passed`);
process.exitCode = results.some((r) => !r.ok) ? 1 : 0;
