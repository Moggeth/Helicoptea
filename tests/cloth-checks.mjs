// Headless tablecloth checks (part of `npm run check`): the linen runner under the real air field, with a
// micro helicopter scripted to spool up high, come down low over the table, sweep across it and leave.
// What's drawn must move smoothly at 120 Hz (no frame-to-frame fizz, no single-frame pops), stay in one
// piece (no stretching over the table's edge, flaps hanging their true length), lift more the closer the
// rotor is, and fall asleep once the air is still. Run at the high tier and at the phone's tier.
import * as THREE from 'three';
import { initPhysics } from '../src/sim/physics.js';
import { AirField } from '../src/sim/air.js';
import { TableCloth } from '../src/render/cloth.js';
import { TABLE } from '../src/sim/layout.js';

await initPhysics();
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const f = (x, d = 2) => Number(x).toFixed(d);

function run(quality, fps = 120) {
  const heli = { type: 'micro', thrust: 0, pos: new THREE.Vector3(0.2, 0.5, 0), quat: new THREE.Quaternion(), up: new THREE.Vector3(0, 1, 0), body: null };
  // The table top at y = 0 is all the wake's ray needs to find.
  const world = { castRay(ray, max) { const t = ray.origin.y / -ray.dir.y; return ray.dir.y < 0 && t > 0 && t < max ? { timeOfImpact: t } : null; } };
  const sim = { heli, world, bags: [] };
  sim.air = new AirField(sim);
  const cloth = new TableCloth({ add() {} }, quality, null);
  const W = 0.024 * 9.81, dt = 1 / fps, T = 16, n = cloth.n, NX = cloth.NX, R = cloth.rest, arr = cloth.posAttr.array;
  let prev = null, prev2 = null, acc2 = 0, vel2 = 0, pop = 0, stretch = 0, lowest = 0, airAcc = 0;
  const liftAt = {}; let sleptAt = -1;
  for (let fr = 0, t = 0; t < T; fr++, t += dt) {
    const spool = t < 0.4 ? t / 0.4 : t > 12 ? Math.max(0, 1 - (t - 12) / 0.5) : 1;
    heli.thrust = W * spool;
    const y = t < 5 ? 0.5 - 0.38 * (t / 5) : t < 10 ? 0.12 : Math.min(0.6, 0.12 + (t - 10) * 0.25);
    const x = t < 5 ? 0.2 : 0.2 + 0.45 * Math.sin(Math.min(t, 10) - 5) * 0.9;
    heli.pos.set(x, y, 0.06 * Math.sin(t * 0.7));
    airAcc += dt;
    while (airAcc >= 1 / 60) { sim.air.update(1 / 60); airAcc -= 1 / 60; }
    cloth.update(dt, sim);
    const cur = Float32Array.from(arr);
    if (prev2) for (let k = 0; k < n; k++) {
      if (cloth.pin[k]) continue;
      let d1 = 0;
      for (let c = 0; c < 3; c++) { const i = k * 3 + c, a = cur[i] - 2 * prev[i] + prev2[i], v = cur[i] - prev[i]; acc2 += a * a; vel2 += v * v; d1 += v * v; }
      pop = Math.max(pop, Math.sqrt(d1));
    }
    if (fr % 6 === 0) {
      for (let j = 0; j < cloth.NZ; j++) for (let i = 0; i + 1 < NX; i++) {
        const a = (j * NX + i) * 3, b = a + 3;
        const s = Math.hypot(cur[b] - cur[a], cur[b + 1] - cur[a + 1], cur[b + 2] - cur[a + 2]) / Math.hypot(R[b] - R[a], R[b + 1] - R[a + 1], R[b + 2] - R[a + 2]);
        if (s > stretch) stretch = s;
      }
      for (let k = 0; k < n; k++) lowest = Math.min(lowest, cur[k * 3 + 1]);
      // Highest lift over the table's top with the rotor high (over 0.42 m) and low (under 0.2 m) on the way down.
      const band = t > 0.5 && t < 5 ? (y > 0.42 ? 'high' : y < 0.2 ? 'low' : null) : null;
      if (band) { let m = 0; for (let k = 0; k < n; k++) if (Math.abs(cur[k * 3]) < TABLE.halfX) m = Math.max(m, cur[k * 3 + 1]); liftAt[band] = Math.max(liftAt[band] || 0, m); }
    }
    if (t > 12.5 && sleptAt < 0 && cloth.ms === 0) sleptAt = t;
    prev2 = prev; prev = cur;
  }
  return { hf: Math.sqrt(acc2 / vel2), pop, stretch, lowest, liftAt, sleptAt, cloth };
}

for (const [label, quality] of [['high', { name: 'high' }], ['phone', { name: 'high', lite: true }]]) {
  const r = run(quality);
  check(`${label}: drawn cloth moves smoothly frame to frame at 120 Hz`, r.hf < 0.6, `jerk/velocity ratio ${f(r.hf)} (was ~1.2-1.4 before smoothing)`);
  check(`${label}: no single-frame pops`, r.pop < 0.012, `largest move in one frame ${f(r.pop * 1000, 1)} mm`);
  check(`${label}: the cloth stays in one piece (no stretching)`, r.stretch < 1.15, `worst edge ${f(r.stretch)}x its rest length`);
  check(`${label}: the end flaps hang their own length, not sagging`, r.lowest > -(0.2 + 0.008 + 0.012), `lowest point ${f(r.lowest, 3)} m`);
  const hi = r.liftAt.high || 0, lo = r.liftAt.low || 0;
  check(`${label}: lifts more the closer the rotor comes`, lo > 0.006 && lo > hi * 2, `rotor above 0.42 m: ${f(hi * 1000, 1)} mm, below 0.2 m: ${f(lo * 1000, 1)} mm`);
  check(`${label}: billows stay linen-heavy, never thrown about`, lo < 0.08, `${f(lo * 1000, 1)} mm`);
  check(`${label}: settles and sleeps once the rotor stops`, r.sleptAt > 0, `asleep at ${f(r.sleptAt, 1)} s`);
  check(`${label}: never pushed into the table or what stands on it`, r.cloth.penetration() < 0.002, `${f(r.cloth.penetration() * 1000, 2)} mm`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} cloth checks passed`);
process.exit(failed.length ? 1 : 0);
