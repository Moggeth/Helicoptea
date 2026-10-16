// Shared helpers for the neighbourhood's headless area checks (tests/area-*-checks.mjs): build the real
// world, then sweep a ball the size of a rotor disc along a flight route to prove it is open, or cast rays
// to prove something is solid.
import { initPhysics, RAPIER, GROUPS } from '../src/sim/physics.js';
import { Sim } from '../src/sim/sim.js';

export async function worldSim() {
  await initPhysics();
  const sim = new Sim();
  sim.streamColliders = false; // every area's colliders, wherever the aircraft is
  sim.streamer.update(0, true);
  sim.step({ pitch: 0, roll: 0, yaw: 0, collective: 0 }); // build the query structures
  return sim;
}

const ignoreMovers = (c) => { const b = c.parent(); return !b || !b.isDynamic(); };

// Sweep a ball of radius r (default 0.11: the micro heli's rotor is 0.2 m across) along a polyline of
// [x, y, z] points. Returns { clear: true } or { clear: false, at: [x, y, z], kind, material, leg }.
// Fixed scenery only (loose props and bags don't block a route).
export function sweep(sim, pts, r = 0.11) {
  const ball = new RAPIER.Ball(r), rot = { x: 0, y: 0, z: 0, w: 1 };
  for (let i = 0; i + 1 < pts.length; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    const d = { x: b[0] - a[0], y: b[1] - a[1], z: b[2] - a[2] };
    const len = Math.hypot(d.x, d.y, d.z);
    if (len < 1e-6) continue;
    const v = { x: d.x / len, y: d.y / len, z: d.z / len };
    const hit = sim.world.castShape({ x: a[0], y: a[1], z: a[2] }, rot, v, ball, 0, len, true, undefined, GROUPS.queryWorld, undefined, undefined, ignoreMovers);
    if (hit) {
      const t = hit.time_of_impact ?? hit.toi ?? hit.timeOfImpact ?? 0;
      const info = sim.colliderInfo.get(hit.collider.handle) || {};
      return { clear: false, at: [a[0] + v.x * t, a[1] + v.y * t, a[2] + v.z * t].map((n) => +n.toFixed(2)), kind: info.kind, material: info.material, leg: i };
    }
  }
  return { clear: true };
}

// Distance from a point along a direction to the first fixed collider (null when nothing within max).
export function ray(sim, o, dir, max = 50) {
  const l = Math.hypot(...dir);
  const hit = sim.world.castRay(new RAPIER.Ray({ x: o[0], y: o[1], z: o[2] }, { x: dir[0] / l, y: dir[1] / l, z: dir[2] / l }), max, true, undefined, GROUPS.queryWorld, undefined, undefined, ignoreMovers);
  if (!hit) return null;
  const info = sim.colliderInfo.get(hit.collider.handle) || {};
  return { dist: hit.timeOfImpact, kind: info.kind, material: info.material };
}

// Is a cup usable: open sky above its opening (a bag can be lowered in from 1.2 m up) and solid under it.
export function cupOpen(sim, cup, above = 1.2) {
  const top = cup.baseY + cup.height;
  const s = sweep(sim, [[cup.x, top + above, cup.z], [cup.x, top + 0.02, cup.z]], 0.03);
  return s.clear;
}

export function checker(title) {
  let failed = 0, total = 0;
  return {
    check(name, ok, detail = '') {
      total++; if (!ok) failed++;
      console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
    },
    done() { console.log(`${total - failed}/${total} ${title} checks passed`); process.exit(failed ? 1 : 0); },
  };
}
