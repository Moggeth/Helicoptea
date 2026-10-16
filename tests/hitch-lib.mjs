// Shared by the hitch profiler (tests/perf-hitch.mjs) and the hitch checks (tests/e2e-hitch.mjs): an in-page
// frame recorder, scripted play-throughs of the moments where something happens for the first time or all
// at once, and the analysis of the slow frames.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// In the page: one record per rendered frame, taken when the frame's render phase is reported.
export function installRecorder({ glTiming = true } = {}) {
  const H = window.__helicoptea, P = H.perf, r = H.renderer;
  const R = window.__hitch = { label: 'start', frames: [], long: [] };
  let evs = [], simMs = 0, updMs = 0;
  const drain = H.sim.drainEvents.bind(H.sim);
  H.sim.drainEvents = () => { const e = drain(); for (const x of e) evs.push(x.type); return e; };
  const ph = P.phaseMs.bind(P);
  P.phaseMs = (k, ms) => {
    ph(k, ms);
    if (k === 'sim') simMs = ms; else if (k === 'update') updMs = ms;
    else {
      const i = (P.i - 1 + P.dt.length) % P.dt.length;
      R.frames.push({ dt: +P.dt[i].toFixed(2), sim: +simMs.toFixed(2), upd: +updMs.toFixed(2), ren: +ms.toFixed(2), prog: r.info.programs.length,
        geo: r.info.memory.geometries, tex: r.info.memory.textures, heap: performance.memory ? performance.memory.usedJSHeapSize : 0, ev: evs.join(' '), label: R.label, calls: r.info.render.calls });
      evs = [];
      if (r.info.programs.length !== seen.size) for (const q of r.info.programs) if (!seen.has(q)) {
        seen.add(q);
        const owners = [];
        for (const root of [H.view.scene || H.renderer.__scene, H.cockpit.scene, H.cockpit.pipScene]) root && root.traverse((o) => {
          for (const m of [].concat(o.material || [])) if (r.properties.get(m).currentProgram === q) { let a = o, path = []; while (a && path.length < 4) { if (a.name) path.push(a.name); a = a.parent; } const ch = []; a = o; while (a && ch.length < 6) { ch.push(a.type + (a.name ? '"' + a.name + '"' : '') + (a.userData && Object.keys(a.userData).length ? '{' + Object.keys(a.userData).slice(0, 3) + '}' : '')); a = a.parent; }
          owners.push(`${o.type}[${o.geometry?.type} ${Object.keys(o.geometry?.attributes || {}).join('/')}] ${ch.join('<')} ${m.type}"${m.name}"${m.map ? ' map' : ''}${m.alphaMap ? ' alphaMap' : ''}${m.roughnessMap ? ' roughMap' : ''}${m.normalMap ? ' nrmMap' : ''}${m.transparent ? ' transp' : ''} side${m.side} ${m.onBeforeCompile ? String(m.onBeforeCompile).slice(0, 50).replace(/\s+/g, ' ') : ''}${m.uniforms ? ' u:' + Object.keys(m.uniforms).slice(0, 4).join(',') : ''}`); }
        });
        // The nearest program already built: which key fields differ (what made this a new variant).
        const kf = q.cacheKey.split(','); let best = null;
        for (const o of r.info.programs) { if (o === q) continue; const of = o.cacheKey.split(','); if (of.length !== kf.length) continue; const d = []; for (let j = 0; j < kf.length; j++) if (of[j] !== kf[j]) d.push(`${j}:${of[j]}>${kf[j]}`); if (!best || d.length < best.length) best = d; }
        R.newPrograms.push({ label: R.label, name: q.name, key: q.cacheKey, owners: owners.slice(0, 6), diff: best ? best.slice(0, 8).join(' ') : 'no sibling' });
      }
    }
  };
  const seen = new Set(r.info.programs); R.newPrograms = [];
  // Every WebGL call that blocks for more than 3 ms (a shader compiled or linked on first draw, a texture
  // upload), with the shader program in use.
  R.gl = [];
  const gl = r.getContext(), progName = new Map();
  let cur = null;
  const nameOf = (p) => { if (!progName.has(p)) for (const q of r.info.programs) if (q.program === p) progName.set(p, q.name + ':' + q.cacheKey.slice(0, 40)); return progName.get(p) || '?'; };
  if (glTiming) for (const k of Object.getOwnPropertyNames(WebGL2RenderingContext.prototype)) {
    const f = gl[k];
    if (typeof f !== 'function' || k === 'getError') continue;
    gl[k] = function (...a) {
      if (k === 'useProgram') cur = a[0];
      const t = performance.now(); const out = f.apply(gl, a); const ms = performance.now() - t;
      if (ms > 3) R.gl.push({ fn: k, ms: +ms.toFixed(1), label: R.label, prog: cur ? nameOf(cur) : '', frame: R.frames.length });
      return out;
    };
  }
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) R.long.push({ at: e.startTime, ms: e.duration, label: R.label }); }).observe({ type: 'longtask', buffered: false }); } catch { /* not offered */ }
  const ap = new H.Autopilot(); const orig = H.input.update.bind(H.input);
  window.__P = { ap, on: false, aimBag: false, tgt: H.sim.heli.pos.clone(), speed: 0.3 };
  H.input.update = (dt) => {
    const c = orig(dt); const p = window.__P; const h = H.sim.heli;
    if (!p.on || !h) return c;
    const k = H.sim.carriedCargo()[0];
    const ref = p.aimBag && k ? k.pos : h.pos;
    ap.target.copy(p.tgt).add(h.pos).sub(ref); ap.maxSpeed = p.speed;
    return Object.assign(c, ap.update(h, k ? k.vel.clone().sub(h.vel) : null, null, dt));
  };
  H.sim.assist = true;
}

// console.timeStamp marks the label in a Chrome trace too (see the CPU-time analysis in playAircraft).
const label = (page, l) => page.evaluate((l) => { window.__hitch.label = l; console.timeStamp(`hitch:${l}`); }, l);
const fly = (page, x, y, z, speed, ms, aimBag = false) => page.evaluate(([x, y, z, speed, aimBag]) => { const p = window.__P; p.on = true; p.aimBag = aimBag; p.tgt.set(x, y, z); p.speed = speed; }, [x, y, z, speed, aimBag]).then(() => sleep(ms));
const act = (page, a) => page.evaluate((a) => window.__helicoptea.doAction(a), a);
const ev = (page, fn, arg) => page.evaluate(fn, arg);

// Scenarios per aircraft. Each step labels the frames it causes.
async function microRun(page, quick) {
  await label(page, 'pad idle'); await sleep(2500);
  await label(page, 'lift off'); await fly(page, -0.5, 0.42, 0.2, 0.3, 3000);
  for (const v of quick ? ['cockpit', 'tripod', 'chase'] : ['cockpit', 'locked', 'nose', 'orbit', 'tripod', 'chase']) { await label(page, `view ${v}`); await ev(page, (v) => window.__helicoptea.setView(v), v); await sleep(1200); }
  // Tea bag from the middle peg, dipped in the house mug.
  await label(page, 'to the peg');
  const peg = await ev(page, () => { const p = window.__helicoptea.sim.pegs[1].tip; return [p.x, p.y, p.z]; });
  const drop = await ev(page, () => -window.__helicoptea.sim.heli.def.hooks[0][1]);
  await fly(page, peg[0], 0.42, peg[2], 0.3, 3500);
  await fly(page, peg[0], peg[1] + drop + 0.006, peg[2], 0.12, 2500);
  await label(page, 'hook bag'); await ev(page, () => window.__helicoptea.sim.toggleAttach()); await sleep(800);
  const mug = await ev(page, () => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.waterY, c.z]; });
  await label(page, 'carry bag'); await fly(page, peg[0], 0.45, peg[2], 0.2, 1200); await fly(page, mug[0], 0.45, mug[2], 0.3, 4000);
  await label(page, 'wash over tea'); await fly(page, mug[0], mug[1] + 0.12, mug[2], 0.06, 3000, true);
  await label(page, 'dip bag'); await fly(page, mug[0], mug[1] - 0.03, mug[2], 0.04, 5000, true);
  await label(page, 'lift bag'); await fly(page, mug[0], mug[1] + 0.2, mug[2], 0.08, 2500, true);
  await label(page, 'cockpit with bag'); await ev(page, () => window.__helicoptea.setView('cockpit')); await sleep(1500);
  await label(page, 'cargo cam'); await ev(page, () => window.__helicoptea.setView('cargo')); await sleep(1500);
  await ev(page, () => window.__helicoptea.setView('chase'));
  await label(page, 'drop bag'); await ev(page, () => window.__helicoptea.sim.toggleAttach()); await sleep(1000);
  // Milk bucket: hook it, fill it straight from the crock, pour into the teacup.
  await label(page, 'to bucket');
  const g = await ev(page, () => { const m = window.__helicoptea.sim.milk; return { tip: m.hanger.tip.toArray(), cup: [window.__helicoptea.sim.cups[1].x, window.__helicoptea.sim.cups[1].z] }; });
  await fly(page, g.tip[0], 0.42, g.tip[2] + 0.004, 0.3, 4000);
  await fly(page, g.tip[0], g.tip[1] + drop + 0.008, g.tip[2] + 0.004, 0.15, 2600);
  await ev(page, () => window.__helicoptea.sim.toggleAttach());
  await ev(page, () => { const m = window.__helicoptea.sim.milk, k = m.bucket; k.vol = 1; const cap = 1 / k.fill; k.vol = 0; const got = m.take(m.bowl, cap); k.vol = got.vol; });
  await label(page, 'carry bucket'); await fly(page, g.tip[0], 0.46, g.tip[2] + 0.03, 0.15, 1500); await fly(page, g.cup[0], 0.46, g.cup[1], 0.25, 5500);
  await fly(page, g.cup[0], 0.40, g.cup[1], 0.08, 2500, true);
  await label(page, 'pour milk'); await page.keyboard.down('KeyG'); await sleep(3000); await page.keyboard.up('KeyG'); await sleep(1500);
  await label(page, 'drop bucket'); await ev(page, () => window.__helicoptea.sim.toggleAttach()); await sleep(800);
  // The garden.
  await label(page, 'fly to garden'); await fly(page, 0.35, 0.3, -1.2, 0.6, 4000); await fly(page, 0.35, 0.15, -2.6, 0.6, 4000);
  await label(page, 'garden hover'); await sleep(2500);
  await label(page, 'garden cockpit'); await ev(page, () => window.__helicoptea.setView('cockpit')); await sleep(1500); await ev(page, () => window.__helicoptea.setView('chase'));
  await crashes(page, quick ? ['rotor', 'dunk', 'impact'] : ['rotor', 'tail', 'dunk', 'rollover', 'impact', 'fall']);
  await menus(page);
}
async function crashes(page, kinds) {
  for (const k of kinds) {
    await ev(page, () => { window.__P.on = false; });
    await label(page, `crash ${k}`); await ev(page, (k) => window.__helicoptea.stageCrash(k), k); await sleep(3000);
    await label(page, `restart after ${k}`); await act(page, 'restart'); await sleep(1500);
  }
}
async function menus(page) {
  await label(page, 'pause'); await act(page, 'pause'); await sleep(800);
  await label(page, 'resume'); await act(page, 'resume'); await sleep(800);
  await label(page, 'help'); await act(page, 'help'); await sleep(800); await act(page, 'closehelp'); await act(page, 'resume');
  await label(page, 'tuning'); await act(page, 'tuning'); await sleep(800); await page.keyboard.press('Escape'); await sleep(200); await act(page, 'resume'); await sleep(600);
  await label(page, 'replay'); await act(page, 'replay'); await sleep(2500);
  await label(page, 'leave replay'); await page.keyboard.press('Escape'); await sleep(1500);
}
async function heavyRun(page, id, quick) {
  await label(page, `switch to ${id}`); await ev(page, (id) => window.__helicoptea.setAircraft(id), id); await sleep(2500);
  await label(page, 'lift off'); await fly(page, -0.5, 0.42, 0.2, 0.3, 3000);
  for (const v of ['cockpit', 'locked', 'nose', 'chase']) { await label(page, `view ${v}`); await ev(page, (v) => window.__helicoptea.setView(v), v); await sleep(1200); }
  if (id === 'skycrane') {
    const s = await ev(page, () => { const m = window.__helicoptea.sim.milk.bowl, c = window.__helicoptea.sim.cups[1]; return { bowl: [m.x, m.z], cup: [c.x, c.z] }; });
    await label(page, 'to crock'); await fly(page, s.bowl[0], 0.42, s.bowl[1], 0.3, 5000); await fly(page, s.bowl[0], 0.215, s.bowl[1], 0.12, 4000);
    await label(page, 'auto pump'); await act(page, 'autofill');
    for (let i = 0; i < 40; i++) { await sleep(250); if (!(await ev(page, () => !!window.__helicoptea.sim.heli?.tank?.auto))) break; }
    await label(page, 'to cup'); await fly(page, s.bowl[0], 0.45, s.bowl[1], 0.12, 1800); await fly(page, s.cup[0], 0.45, s.cup[1], 0.25, 6000);
    await label(page, 'drop milk'); await page.keyboard.down('KeyG'); await sleep(2500); await page.keyboard.up('KeyG'); await sleep(1000);
    await label(page, 'salvo'); await act(page, 'salvo'); await sleep(2000);
  } else {
    await label(page, 'wash over tea');
    const mug = await ev(page, () => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.topY, c.z]; });
    await fly(page, mug[0], mug[1] + 0.2, mug[2], 0.2, 5000);
  }
  await crashes(page, quick ? ['rotor'] : ['rotor', 'impact']);
}

// Plays one aircraft's scenario in a fresh page and returns the analysed frames.
export async function playAircraft(browser, base, run, { size = [1920, 1080], quality = 'high', query = '', quick = false, glTiming = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: size[0], height: size[1] } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?quality=${quality}&view=chase&dynres=0${query ? `&${query}` : ''}`, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 90000 });
  await page.evaluate(() => document.getElementById('start-btn').click());
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(installRecorder, { glTiming });
  await act(page, 'skiphints');
  // A Chrome trace of the run gives each frame's main-thread CPU time (tdur) besides its wall time: on a busy
  // machine a frame can take long because the browser was descheduled or waited on a shared GPU, while
  // CPU time counts only the game's own work.
  const cdp = await ctx.newCDPSession(page);
  const events = [];
  cdp.on('Tracing.dataCollected', (d) => { for (const e of d.value) if (e.name === 'FireAnimationFrame' || e.name === 'TimeStamp') events.push(e); });
  await cdp.send('Tracing.start', { categories: 'devtools.timeline', transferMode: 'ReportEvents' });
  try { await (run === 'micro' ? microRun(page, quick) : heavyRun(page, run, quick)); } catch (e) { errors.push(`scenario: ${e.message}`); }
  const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
  await cdp.send('Tracing.end'); await done;
  const R = await page.evaluate(() => window.__hitch);
  await ctx.close();
  return { run, errors, ...analyse(R), cpu: cpuFrames(events) };
}

// Main-thread CPU per animation frame (the game's whole frame runs in one requestAnimationFrame callback),
// labelled by the scenario step it fell in.
export function cpuFrames(events) {
  const marks = events.filter((e) => e.name === 'TimeStamp' && /^hitch:/.test(e.args?.data?.message || '')).map((e) => ({ ts: e.ts, label: e.args.data.message.slice(6) })).sort((a, b) => a.ts - b.ts);
  const frames = events.filter((e) => e.name === 'FireAnimationFrame' && e.ph === 'X' && e.tdur !== undefined).sort((a, b) => a.ts - b.ts);
  let m = -1;
  const out = frames.map((e) => {
    while (m + 1 < marks.length && marks[m + 1].ts <= e.ts) m++;
    return { label: m >= 0 ? marks[m].label : 'start', wall: +(e.dur / 1000).toFixed(1), cpu: +(e.tdur / 1000).toFixed(1) };
  });
  const cpus = out.map((f) => f.cpu).sort((a, b) => a - b);
  return {
    frames: out.length, medCpu: cpus[Math.floor(cpus.length / 2)] || 0, p99Cpu: cpus[Math.floor(cpus.length * 0.99)] || 0,
    worst: out.slice().sort((a, b) => b.cpu - a.cpu).slice(0, 20),
  };
}

// Per label: frame-time summary and the slowest frames (with the frame before, whose work a long interval
// usually belongs to).
export function analyse(R) {
  const f = R.frames;
  for (let i = 1; i < f.length; i++) {
    f[i].newProg = f[i].prog - f[i - 1].prog; f[i].newGeo = f[i].geo - f[i - 1].geo; f[i].newTex = f[i].tex - f[i - 1].tex;
    f[i].gc = f[i].heap && f[i - 1].heap && f[i].heap < f[i - 1].heap - 2e5 ? +((f[i - 1].heap - f[i].heap) / 1e6).toFixed(1) : 0;
  }
  const byLabel = {};
  for (const x of f) (byLabel[x.label] ||= []).push(x);
  const all = summarise(f);
  const scenes = Object.entries(byLabel).map(([l, fr]) => ({ label: l, ...summarise(fr) }));
  const worst = f.map((x, i) => ({ i, ...x, cpuPrev: i ? +(f[i - 1].sim + f[i - 1].upd + f[i - 1].ren).toFixed(1) : 0, prev: i ? { sim: f[i - 1].sim, upd: f[i - 1].upd, ren: f[i - 1].ren, newProg: f[i - 1].newProg, newGeo: f[i - 1].newGeo, newTex: f[i - 1].newTex, ev: f[i - 1].ev } : null }))
    .sort((a, b) => b.dt - a.dt).slice(0, 40).map(({ heap, ...x }) => x);
  const progAt = f.filter((x) => x.newProg > 0).map((x) => ({ label: x.label, n: x.newProg, dtNext: f[f.indexOf(x) + 1]?.dt }));
  const gcs = f.filter((x) => x.gc).map((x) => ({ label: x.label, mb: x.gc, dt: x.dt }));
  return { all, scenes, worst, programs: progAt, gcs: { count: gcs.length, perSecond: +(gcs.length / (all.seconds || 1)).toFixed(2), worst: gcs.sort((a, b) => b.dt - a.dt).slice(0, 10) }, longTasks: R.long, newPrograms: R.newPrograms, glSlow: R.gl.sort((a, b) => b.ms - a.ms) };
}
export function summarise(fr) {
  const d = fr.map((x) => x.dt).filter((x) => x > 0).sort((a, b) => a - b);
  if (!d.length) return { frames: 0 };
  const sum = d.reduce((a, b) => a + b, 0), m = Math.max(1, Math.floor(d.length * 0.01));
  const slow = d.slice(-m).reduce((a, b) => a + b, 0) / m;
  const med = d[Math.floor(d.length / 2)];
  return { frames: d.length, seconds: +(sum / 1000).toFixed(1), fps: +(1000 * d.length / sum).toFixed(0), medMs: +med.toFixed(2), low1: +(1000 / slow).toFixed(0), p99Ms: +d[Math.min(d.length - 1, Math.floor(d.length * 0.99))].toFixed(1), worstMs: +d[d.length - 1].toFixed(1),
    over16: d.filter((x) => x > 16.7).length, over33: d.filter((x) => x > 33.3).length, spikes: d.filter((x) => x > Math.max(8.3, med * 3)).length };
}
