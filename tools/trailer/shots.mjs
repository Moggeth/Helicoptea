// The trailer's shots: each one loads the game fresh, flies its setup with the in-game autopilot (the same stick
// inputs a player makes), then records a few seconds of 1080p60 frames plus the game's own audio under them.
//   node tools/trailer/shots.mjs [baseUrl] [--out=scratch/trailer] [--only=dip,pour] [--preview]
// --preview records every 10th frame only (fast framing checks; no audio).
import fs from 'node:fs';
import path from 'node:path';
import { launch, open, FPS } from './rig.mjs';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4178/';
const outRoot = path.resolve(arg('out') || 'scratch/trailer');
const only = arg('only')?.split(',');
const preview = process.argv.includes('--preview');

// In-page helpers: a scripted camera applied after the simulation step (so it never lags the aircraft),
// pilot targets, and the extra controls.
function installDirector() {
  const H = window.__helicoptea, C = window.__vclock;
  const orig = H.post.render.bind(H.post);
  const cam = H.camRig.camera;
  H.post.render = (...a) => {
    const f = window.__camFn;
    if (f) {
      const r = f(H, (C.t - C.t0) / 1000);
      cam.position.set(r.pos[0], r.pos[1], r.pos[2]); cam.up.set(0, 1, 0); cam.lookAt(r.look[0], r.look[1], r.look[2]);
      if (r.roll) cam.rotateZ(r.roll);
      if (r.fov && cam.fov !== r.fov) { cam.fov = r.fov; cam.updateProjectionMatrix(); }
      cam.updateMatrixWorld();
      H.freeCam.on = true; H.freeCam.pos.copy(cam.position); H.freeCam.look.set(r.look[0], r.look[1], r.look[2]);
    }
    return orig(...a);
  };
  // fly(x, y, z, speed, aim): the autopilot flies the aircraft (or, with aim 'load', its load) to a point.
  window.__fly = (x, y, z, speed = 0.3, aim = null) => { const P = window.__P; P.on = true; P.aim = aim; P.ap.target.set(x, y, z); P.ap.maxSpeed = speed; };
  window.__lerp = (a, b, k) => a.map((v, i) => v + (b[i] - v) * k);
  window.__ease = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };
  window.__mark = () => { window.__t0 = (C.t - C.t0) / 1000; };
  // A point along a polyline by distance travelled.
  const along = (pts, d) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (d <= L || i === pts.length - 2) { const k = Math.min(1, d / L); return { p: window.__lerp(a, b, k), dir: [(b[0] - a[0]) / L, (b[2] - a[2]) / L] }; }
      d -= L;
    }
  };
  // Path following: the target is a carrot `lead` metres ahead of the aircraft's closest point on the path,
  // flown at up to `speed`; the nose turns along the path.
  window.__followPath = (pts, speed, lead = 0.25) => {
    // The autopilot slows inside 1.1 m of its target (speed = distance x 0.9): keep the carrot far enough out.
    window.__path = { pts, lead: Math.max(lead, speed * 1.25), d: 0 };
    window.__P.on = true; window.__P.aim = null; window.__P.ap.maxSpeed = speed;
  };
  window.__onFrame = () => {
    const p = window.__path, h = H.sim.heli;
    if (!p || !h) return;
    let best = p.d, bd = Infinity;
    for (let d = p.d; d < p.d + 0.6; d += 0.005) {
      const q = along(p.pts, d).p, e = Math.hypot(q[0] - h.pos.x, q[1] - h.pos.y, q[2] - h.pos.z);
      if (e < bd) { bd = e; best = d; }
    }
    p.d = best;
    const a = along(p.pts, p.d + p.lead);
    window.__P.ap.target.set(a.p[0], a.p[1], a.p[2]);
    window.__P.ap.yaw = Math.atan2(-a.dir[0], -a.dir[1]);
  };
  // Puts the aircraft somewhere (as the crash staging does): position, heading, velocity.
  window.__place = (x, y, z, yaw = 0, v = [0, 0, 0]) => {
    const h = H.sim.heli, T = H.THREE;
    const q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    const dx = x - h.pos.x, dy = y - h.pos.y, dz = z - h.pos.z;
    h.body.setTranslation({ x, y, z }, true); h.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    h.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true); h.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    h.updateCached(); h.track.capture(h.body); h.track.capture(h.body);
    if (h.hose) for (const s of h.hose.segs) { const t = s.body.translation(); s.body.setTranslation({ x: t.x + dx, y: t.y + dy, z: t.z + dz }, true); s.body.setLinvel({ x: v[0], y: v[1], z: v[2] }, true); }
    h.integ = 0; h.cmdPitch = 0; h.cmdRoll = 0; h.impactAcc = 0; h.lastAssist = null; h.rotorSpeed = 1;
    window.__P.ap.yaw = yaw; window.__P.ap.ix = 0; window.__P.ap.iz = 0;
  };
}
const mark = (s) => s.eval(() => window.__mark());
const setCam = (s, fn) => s.eval((src) => { window.__camFn = src ? (0, eval)(src) : null; if (!src) window.__helicoptea.freeCam.on = false; }, fn ? fn.toString() : null);
const fly = (s, x, y, z, speed = 0.3, aim = null) => s.eval(([x, y, z, sp, aim]) => window.__fly(x, y, z, sp, aim), [x, y, z, speed, aim]);
const state = (s) => s.eval(() => {
  const H = window.__helicoptea, S = H.sim, h = S.heli;
  return { state: S.state, heli: h && h.pos.toArray(), cargo: S.carriedCargo().length, bag: S.carriedBag()?.pos.toArray() };
});
async function rec(s, name, seconds) {
  const dir = path.join(outRoot, name);
  fs.rmSync(dir, { recursive: true, force: true });
  const n = Math.round(seconds * FPS);
  if (preview) {
    for (let i = 0; i < n; i += 10) { await s.record(1, dir); await s.run(9); }
    return;
  }
  await s.record(n, dir);
  await s.saveAudio(path.join(dir, 'audio.wav'));
}

// Hook a bag off the kitchen stand (peg i) with the micro heli.
async function hookBag(s, i = 1) {
  const peg = await s.eval((i) => window.__helicoptea.sim.pegs[i].tip.toArray(), i);
  await fly(s, -0.56, 0.42, 0.24, 0.3); await s.seconds(1.8);
  await fly(s, peg[0], 0.42, peg[2] + 0.004, 0.3); await s.seconds(4);
  await fly(s, peg[0], peg[1] + 0.054, peg[2] + 0.004, 0.12); await s.seconds(3);
  await s.eval(() => window.__helicoptea.doAction('attach'));
  await s.run(5);
  if (!(await state(s)).cargo) throw new Error('failed to hook a bag');
  await fly(s, peg[0], 0.45, peg[2] + 0.03, 0.15); await s.seconds(2.5);
}

const SHOT_QUERY = { dip: '&aircraft=micro', cockpit: '&aircraft=micro&view=cockpit', reveal: '&aircraft=micro', chinook: '&aircraft=chinook',
  snorkel: '&aircraft=skycrane', pour: '&aircraft=skycrane', crash: '&aircraft=micro', reveal2: '&aircraft=skycrane', dunk: '&aircraft=micro' };

// Skycrane: from the pad to a low hover over the milk crock, then auto-fill (reel down, pump, reel up).
async function skycraneFill(s, { wait = true } = {}) {
  const bowl = await s.eval(() => { const m = window.__helicoptea.sim.milk.bowl; return [m.x, m.floorY, m.z]; });
  await fly(s, -0.56, 0.42, 0.24, 0.3); await s.seconds(2.5);
  await fly(s, bowl[0], 0.42, bowl[2], 0.3); await s.seconds(5);
  await fly(s, bowl[0], 0.215, bowl[2], 0.12); await s.seconds(4.5);
  await s.eval(() => window.__helicoptea.sim.heli.autoFill());
  if (wait) await s.until((H) => !H.sim.heli.tank.auto, 30);
  return bowl;
}

export const SHOTS = {
  // Micro heli lowers a tea bag into the mug; a low camera by the rim, the rotor wash rippling the tea.
  async dip(s) {
    await hookBag(s, 1);
    const mug = await s.eval(() => { const c = window.__helicoptea.sim.cups[0]; return [c.x, c.waterY, c.z]; });
    await fly(s, mug[0], 0.42, mug[2], 0.3); await s.seconds(3);
    await fly(s, mug[0], 0.40, mug[2], 0.3, 'load'); await s.seconds(3);
    await s.eval((m) => { window.__mug = m; }, mug);
    // Hold the bag a few centimetres over the tea, then let it down while the camera creeps in.
    const over = (dy, sp) => s.eval(([m, dy, sp]) => { const H = window.__helicoptea, b = H.sim.carriedBag(), h = H.sim.heli;
      window.__fly(m[0] + h.pos.x - b.pos.x, m[1] + dy + h.pos.y - b.pos.y, m[2] + h.pos.z - b.pos.z, sp); }, [mug, dy, sp]);
    await over(0.05, 0.05); await s.seconds(1.5);
    await over(0.05, 0.05); await s.seconds(1.5);
    await setCam(s, (H, t) => {
      const m = window.__mug, k = window.__ease((t - window.__t0) / 2.6);
      const a = window.__lerp([m[0] + 0.36, m[1] + 0.19, m[2] + 0.44], [m[0] + 0.29, m[1] + 0.16, m[2] + 0.35], k);
      return { pos: a, look: [m[0] - 0.005, m[1] + 0.13, m[2]], fov: 44 };
    });
    await mark(s);
    await over(-0.025, 0.05);
    await rec(s, 'dip', 2.8);
  },

  // From the pilot's seat: across the kitchen and out through the back door into the garden.
  async cockpit(s) {
    await s.seconds(0.5);
    await s.eval(() => { window.__helicoptea.fp.loadCam = 'off'; window.__place(0.9, 0.4, 0.2, -0.15, [0.06, 0, -0.45]); });
    await s.eval(() => window.__followPath([[0.9, 0.4, 0.2], [0.95, 0.4, -0.6], [1.18, 0.35, -1.5], [1.1, 0.3, -2.6], [0.8, 0.45, -4.5], [0.5, 0.6, -6]], 1.0, 0.35));
    await s.seconds(0.8);
    await rec(s, 'cockpit', 3.2);
  },

  // The neighbourhood: out under the rose arch and over the back hedge, the camera craning up and back.
  async reveal(s) {
    await s.seconds(0.5);
    await s.eval(() => window.__place(0.35, 1.5, -3.0, 0, [0, 0, -0.6]));
    await s.eval(() => window.__followPath([[0.35, 1.5, -3.0], [0.3, 1.6, -6], [0.2, 2.0, -12], [0, 2.5, -20]], 1.6, 0.4));
    await s.seconds(0.6);
    await setCam(s, (H, t) => {
      const h = H.sim.heli ? (window.__hp = H.sim.heli.pos.clone()) : window.__hp, k = window.__ease((t - window.__t0) / 2.6), k2 = k * k;
      const near = [h.x + 0.08, h.y + 0.12, h.z + 0.5];
      const pos = window.__lerp(near, [0.6, 7.5, -1.8], k2);
      const look = window.__lerp([h.x, h.y, h.z], [0.1, -1.5, -24], k);
      return { pos, look, fov: 50 + 8 * k };
    });
    await mark(s);
    await rec(s, 'reveal', 2.6);
  },

  // A pull-back from just behind the micro heli to high over the gardens, keeping it in the centre of frame.
  async reveal2(s) {
    await s.seconds(0.5);
    // Put it up high and let it settle into a hover first (a placed aircraft starts with no lift built up).
    await s.eval(() => window.__place(0.35, 2.4, -2.6, 0));
    await fly(s, 0.35, 1.8, -2.6, 0.3); await s.seconds(1);
    await s.until((H) => { const h = H.sim.heli; return Math.abs(h.vel.y) < 0.04 && Math.abs(h.pos.y - 1.8) < 0.06; }, 10);
    await s.eval(() => window.__followPath([[0.35, 1.8, -2.6], [0.3, 1.8, -6], [0.2, 2.1, -12], [0, 2.5, -20]], 1.6, 0.4));
    await s.seconds(0.8);
    await setCam(s, (H, t) => {
      const h = H.sim.heli ? (window.__hp = H.sim.heli.pos.clone()) : window.__hp, k = window.__ease((t - window.__t0) / 2.6);
      const e = Math.pow(k, 1.6);
      const off = window.__lerp([0.25, 0.1, 0.6], [-3.5, 5.0, 1.8], e);
      return { pos: [h.x + off[0], h.y + off[1], h.z + off[2]], look: [h.x, h.y - 0.4 * e, h.z - 1.2 * e], fov: 46 + 10 * e };
    });
    await mark(s);
    console.log('reveal2 start', JSON.stringify(await s.eval(() => { const H = window.__helicoptea; return [H.sim.heli.pos.toArray(), H.view.heliPos.toArray(), H.camRig.camera.position.toArray(), H.freeCam.on]; })));
    await rec(s, 'reveal2', 2.6);
  },

  // The Chinook takes three bags off the stand at once and lifts them over a low table-top camera.
  async chinook(s) {
    const pegs = await s.eval(() => window.__helicoptea.sim.pegs.slice(0, 3).map((p) => p.tip.toArray()));
    const cx = pegs[1][0], py = pegs[1][1], pz = pegs[1][2];
    // Nose towards -x: the three hooks line up with the three pegs (as tests/chinook-checks.mjs flies it).
    await s.eval(() => { window.__P.ap.yaw = Math.PI / 2; });
    await fly(s, -0.56, 0.42, 0.24, 0.3); await s.seconds(3);
    await fly(s, cx, 0.42, pz + 0.004, 0.25); await s.seconds(5);
    const hookDrop = await s.eval(() => -window.__helicoptea.sim.heli.def.hooks[1][1]);
    await fly(s, cx, py + hookDrop + 0.012, pz + 0.004, 0.08); await s.seconds(10);
    await fly(s, cx, py + hookDrop + 0.012, pz + 0.004, 0.03); await s.seconds(5);
    await s.eval(() => { const S = window.__helicoptea.sim; for (let i = 0; i < 3; i++) if (S.attachCandidate()) S.toggleAttach(); });
    await fly(s, cx, 0.5, pz + 0.04, 0.12); await s.seconds(2.5);
    console.log('chinook cargo', (await state(s)).cargo);
    await s.eval(() => window.__followPath([[-0.52, 0.5, -0.1], [-0.1, 0.45, 0.35], [0.45, 0.42, 0.6], [1.2, 0.45, 0.7]], 0.5, 0.2));
    await setCam(s, (H, t) => {
      const h = H.sim.heli.pos, sm = window.__sm || (window.__sm = [h.x, h.y - 0.08, h.z]);
      const k = 1 - Math.exp(-1 / 60 * 6); sm[0] += (h.x - sm[0]) * k; sm[1] += (h.y - 0.08 - sm[1]) * k; sm[2] += (h.z - sm[2]) * k;
      return { pos: [0.12, 0.28, 0.62], look: sm, fov: 46 };
    });
    await s.seconds(1.0);
    await mark(s);
    await rec(s, 'chinook', 2.6);
  },

  // Skycrane: snorkel down in the milk crock, pumping; the sight glass on the tank fills.
  async snorkel(s) {
    const bowl = await skycraneFill(s, { wait: false });
    await s.until((H) => H.sim.heli.tank.auto && H.sim.heli.tank.auto.phase === 'pump', 15);
    await s.seconds(0.3);
    await s.eval((b) => { window.__bowl = b; }, bowl);
    await setCam(s, (H, t) => {
      const h = H.sim.heli.pos, b = window.__bowl, k = window.__ease((t - window.__t0) / 2.6);
      const pos = window.__lerp([b[0] + 0.30, 0.10, b[2] + 0.30], [b[0] + 0.24, 0.12, b[2] + 0.22], k);
      return { pos, look: [h.x * 0.6 + b[0] * 0.4, (h.y + 0.02) * 0.6 + 0.04, h.z * 0.6 + b[2] * 0.4], fov: 46 };
    });
    await mark(s);
    await rec(s, 'snorkel', 2.6);
  },

  // Skycrane over the teacup: belly doors open, the milk falls into the tea.
  async pour(s) {
    await skycraneFill(s);
    const cup = await s.eval(() => { const c = window.__helicoptea.sim.cups[1]; return [c.x, c.waterY, c.z]; });
    const bowl = await s.eval(() => { const m = window.__helicoptea.sim.milk.bowl; return [m.x, m.z]; });
    await fly(s, bowl[0], 0.45, bowl[1], 0.12); await s.seconds(1.8);
    await fly(s, cup[0], 0.45, cup[2], 0.25); await s.seconds(6.5);
    await fly(s, cup[0], 0.40, cup[2], 0.08); await s.seconds(3);
    await s.eval((c) => { window.__cup = c; }, cup);
    await setCam(s, (H, t) => {
      const c = window.__cup, h = H.sim.heli.pos, k = window.__ease((t - window.__t0) / 2.6);
      // Frame the cup and the aircraft above it (it climbs as the tank empties).
      const top = Math.max(0.48, h.y + 0.1), mid = (c[1] + top) / 2, span = top - c[1] + 0.08;
      const sm = window.__sm || (window.__sm = [mid, span]);
      sm[0] += (mid - sm[0]) * 0.08; sm[1] += (span - sm[1]) * 0.08;
      const d = sm[1] / (2 * Math.tan(25 * Math.PI / 180)) * 0.85;
      const dir = [0.3, 0.12, 0.95], n = Math.hypot(...dir);
      const pos = [c[0] + dir[0] / n * d * (1 - 0.08 * k), sm[0] + dir[1] / n * d - 0.06, c[2] + dir[2] / n * d * (1 - 0.08 * k)];
      return { pos, look: [c[0], sm[0], c[2]], fov: 50 };
    });
    await mark(s);
    await s.seconds(0.25);
    await s.eval(() => { window.__P.extra.doors = 0.8; });
    console.log('pour start', JSON.stringify(await state(s)));
    await rec(s, 'pour', 2.6);
  },

  // A rotor strike: drifting sideways into the kitchen wall (the game's own 'rotor' crash staging, from further
  // out), the blades shatter, a beat of slow motion, the airframe drops.
  async crash(s) {
    await fly(s, -0.56, 0.3, 0.24, 0.3); await s.seconds(1.5);
    const p = await s.eval(() => { const H = window.__helicoptea; H.stageCrash('rotor'); return H.sim.heli.pos.toArray(); });
    await s.eval((p) => { window.__p0 = p; window.__place(p[0] + 0.45, p[1], p[2], Math.PI / 2, [-0.7, 0, 0]); window.__fly(p[0] - 1, p[1], p[2], 0.8); }, p);
    await setCam(s, (H, t) => {
      const p = window.__p0;
      return { pos: [p[0] + 0.55, p[1] + 0.12, p[2] - 0.28], look: [p[0] + 0.05, p[1] - 0.04, p[2] + 0.04], fov: 44 };
    });
    await mark(s);
    await rec(s, 'crash', 2.8);
  },

  // Nose first into the teacup (the game's 'dunk' crash staging).
  async dunk(s) {
    await fly(s, -0.56, 0.3, 0.24, 0.3); await s.seconds(1.5);
    const c = await s.eval(() => { const c = window.__helicoptea.sim.cups[1]; return [c.x, c.waterY, c.z]; });
    await s.eval((c) => { window.__cup = c; }, c);
    await setCam(s, (H, t) => {
      const c = window.__cup;
      return { pos: [c[0] + 0.1, c[1] + 0.09, c[2] + 0.3], look: [c[0], c[1] + 0.05, c[2]], fov: 42 };
    });
    await s.run(20);
    await s.eval(() => { window.__P.on = false; window.__helicoptea.stageCrash('dunk'); });
    await rec(s, 'dunk', 2.2);
  },
};

const browser = await launch({ headed: process.argv.includes('--headed') });
try {
  for (const [name, fn] of Object.entries(SHOTS)) {
    if (only && !only.includes(name)) continue;
    const t = Date.now();
    const s = await open(browser, base, { query: SHOT_QUERY[name] || '', seconds: 90 });
    await s.eval(installDirector);
    await fn(s);
    const e = s.errors();
    console.log(`${name}: ${((Date.now() - t) / 1000).toFixed(0)} s${e.length ? '  errors: ' + e.slice(0, 3).join(' | ') : ''}`, JSON.stringify(await state(s)));
    await s.close();
  }
} finally { await browser.close(); }
