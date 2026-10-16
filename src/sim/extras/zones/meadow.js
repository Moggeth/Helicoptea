import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../../physics.js';
import { ROOM } from '../../layout.js';

// The meadow's set pieces (drawn by src/render/extras/zones/meadow.js): a white WBC beehive on a stand, a
// compact wooden wheelbarrow with mown clippings, a sundial on a stone baluster, a stacked log pile beside a
// hedgehog house, and a rake and fork leaning on the hedge. Everything solid is a fixed collider on
// sim.props.fixed. Three small split logs lie loose on top of the pile (debris group): wash or a nudge rolls
// them off with a dry wooden knock. Replayed as mlog0..2.

const fy = ROOM.floorY;

// Layout shared with the render module (metres; ground fy).
export const MD = {
  hive: { x: 0.42, z: -5.6, legH: 0.32, floorT: 0.035, lift: 0.18, lifts: 3, w: 0.5 },
  barrow: { x: -0.28, z: -5.44, yaw: Math.PI / 2 + 0.07 },   // local +x (the wheel) points at the hedge
  sundial: { x: 1.15, z: -5.15, h: 0.9 },
  pile: { x0: -3.37, x1: -2.81, z0: -5.93, z1: -5.64, h: 0.3 },
  house: { x: -2.6, z: -5.7, yaw: 0.15, w: 0.3, d: 0.28, h: 0.19 },
  tools: [{ kind: 'rake', x: -0.93, z: -5.64, yaw: 0.05 }, { kind: 'fork', x: -0.79, z: -5.66, yaw: -0.04 }],
  loose: [
    { id: 'mlog0', x: -3.2, z: -5.78, yaw: 0.35, r: 0.017, L: 0.13, mass: 0.006 },
    { id: 'mlog1', x: -3.0, z: -5.76, yaw: -0.5, r: 0.015, L: 0.11, mass: 0.005 },
    { id: 'mlog2', x: -2.9, z: -5.8, yaw: 1.2, r: 0.016, L: 0.12, mass: 0.005 },
  ],
};

// Logs of the pile, deterministic: rows packed along x from logs of 6 to 14 cm across, ends facing the garden (+z).
// shape: 0 round, 1 half-round, 2 quarter; tone 0 fresh, 1 seasoned, 2 weathered grey.
export function pileLogs() {
  const P = MD.pile, out = [];
  let s = 4177;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const top = fy + P.h - 0.004;
  let base = fy + 0.026;
  for (let row = 0; row < 6; row++) {
    let cur = P.x0 + row * 0.035 + rnd() * 0.015;
    const end = P.x1 - row * 0.035 - rnd() * 0.015;
    let dsum = 0, n = 0;
    for (;;) {
      const r = 0.03 + Math.pow(rnd(), 1.3) * 0.04;
      if (cur + 2 * r > end) break;
      if (base + 2 * r > top) { cur += 2 * r + 0.004; continue; }
      const u = rnd();
      const shape = u < 0.6 ? 0 : u < 0.85 ? 1 : 2;
      out.push({ x: cur + r, y: base + r + (rnd() - 0.5) * 0.006, z: (P.z0 + P.z1) / 2 + (rnd() - 0.5) * 0.04, r, L: 0.25 + rnd() * 0.07,
        seed: out.length + 1, row, shape, tone: (rnd() * 3) | 0, roll: rnd() * 6.283, yaw: (rnd() - 0.5) * 0.12, tilt: (rnd() - 0.5) * 0.07 });
      dsum += 2 * r; n++;
      cur += 2 * r + rnd() * 0.006;
    }
    if (!n) break;
    base += dsum / n * 0.82;
    if (base + 0.06 > top) break;
  }
  return out;
}

const RHO = 1.2;
const WASH_GAIN = 26;

export function create(sim, lite) {
  const world = sim.world, fixed = sim.props.fixed;
  const _q = new THREE.Quaternion(), _e = new THREE.Euler();
  const rot = (rx, ry, rz) => { _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ')); return { x: _q.x, y: _q.y, z: _q.z, w: _q.w }; };
  const add = (desc, x, y, z, kind, material, q) => {
    desc.setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.1);
    if (q) desc.setRotation(q);
    const c = world.createCollider(desc, fixed);
    sim.register(c, { kind, material });
    return c;
  };
  const box = (hx, hy, hz, x, y, z, kind, material, q) => add(RAPIER.ColliderDesc.cuboid(hx, hy, hz), x, y, z, kind, material, q);

  // ---------------------------------------------------------------- beehive (front faces +z)
  {
    const H = MD.hive, y0 = fy + H.legH;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.02, H.legH / 2, 0.02, H.x + sx * 0.215, fy + H.legH / 2, H.z + sz * 0.215, 'hive', 'wood');
    box(0.25, H.floorT / 2, 0.29, H.x, y0 + H.floorT / 2, H.z + 0.02, 'hive', 'wood');
    const bodyH = H.lifts * H.lift;
    box(0.245, bodyH / 2, 0.245, H.x, y0 + H.floorT + bodyH / 2, H.z, 'hive', 'wood');
    const ry = y0 + H.floorT + bodyH;
    box(0.29, 0.02, 0.29, H.x, ry + 0.02, H.z, 'hive', 'wood');
    box(0.2, 0.05, 0.2, H.x, ry + 0.09, H.z, 'hive', 'metal');
  }

  // ---------------------------------------------------------------- wheelbarrow
  {
    const B = MD.barrow;
    const c = Math.cos(B.yaw), s = Math.sin(B.yaw);
    // local (u forward, w sideways) to world: u along (cos, -sin).
    const wp = (u, w) => [B.x + u * c + w * s, B.z - u * s + w * c];
    const q = rot(0, B.yaw, 0);
    let p = wp(0.02, 0);
    box(0.28, 0.13, 0.19, p[0], fy + 0.33, p[1], 'barrow', 'wood', q);        // the tray (rim at ~0.46)
    p = wp(0.36, 0);
    add(RAPIER.ColliderDesc.cylinder(0.04, 0.15), p[0], fy + 0.15, p[1], 'barrow', 'metal', rot(Math.PI / 2, B.yaw + Math.PI / 2, 0));
    for (const w of [-0.17, 0.17]) { p = wp(-0.2, w); box(0.012, 0.11, 0.012, p[0], fy + 0.11, p[1], 'barrow', 'wood'); }
    for (const w of [-0.2, 0.2]) { p = wp(-0.36, w); box(0.15, 0.02, 0.02, p[0], fy + 0.38, p[1], 'barrow', 'wood', q); }   // the handles
  }

  // ---------------------------------------------------------------- sundial
  {
    const S = MD.sundial;
    box(0.13, 0.04, 0.13, S.x, fy + 0.04, S.z, 'sundial', 'stone');
    add(RAPIER.ColliderDesc.cylinder((S.h - 0.18) / 2, 0.075), S.x, fy + 0.08 + (S.h - 0.18) / 2, S.z, 'sundial', 'stone');
    add(RAPIER.ColliderDesc.cylinder(0.04, 0.17), S.x, fy + S.h - 0.04, S.z, 'sundial', 'metal');
  }

  // ---------------------------------------------------------------- log pile and hedgehog house
  {
    const P = MD.pile;
    box((P.x1 - P.x0) / 2, P.h / 2, (P.z1 - P.z0) / 2, (P.x0 + P.x1) / 2, fy + P.h / 2, (P.z0 + P.z1) / 2, 'logs', 'wood');
    const Hh = MD.house, q = rot(0, Hh.yaw, 0);
    box(Hh.w / 2, Hh.h / 2, Hh.d / 2, Hh.x, fy + Hh.h / 2 + 0.02, Hh.z, 'house', 'wood', q);
  }

  // ---------------------------------------------------------------- rake and fork on the hedge
  for (const T of MD.tools) {
    const lean = 0.2, mid = 0.7, q = rot(-lean, T.yaw, 0);
    // The shaft runs from y 0.15 to 1.25 along the leaning axis; the foot is at (x, z).
    const v = new THREE.Vector3(0, mid, 0).applyQuaternion(_q.set(q.x, q.y, q.z, q.w));
    add(RAPIER.ColliderDesc.capsule(0.54, 0.014), T.x + v.x, fy + v.y, T.z + v.z, 'tool', 'wood', q);
    box(T.kind === 'rake' ? 0.17 : 0.065, 0.025, 0.03, T.x, fy + 0.03, T.z + 0.02, 'tool', 'metal');
  }

  // ---------------------------------------------------------------- loose split logs
  const logs = [];
  const defs = lite ? MD.loose.slice(0, 2) : MD.loose;
  let lastKnock = -1;
  const top = fy + MD.pile.h;
  for (const d of defs) {
    const home = { x: d.x, y: top + d.r + 0.001, z: d.z };
    // The cylinder lies along x (rotated about z), then turned by its yaw.
    const hq = rot(0, d.yaw, Math.PI / 2);
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(home.x, home.y, home.z).setRotation(hq)
      .setLinearDamping(0.06).setAngularDamping(0.3).setCanSleep(true));
    const desc = RAPIER.ColliderDesc.cylinder(d.L / 2, d.r).setMass(d.mass).setFriction(0.7).setRestitution(0.2)
      .setCollisionGroups(GROUPS.debris).setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.8);
    const c = world.createCollider(desc, body);
    const it = { def: d, id: d.id, body, track: new Track(body), home, hq, moved: false };
    sim.register(c, {
      kind: 'prop', material: 'wood',
      onImpact(imp) {
        if (imp < 0.003 || sim.time < 0.5 || sim.time - lastKnock < 0.07) return;
        const v = body.linvel();
        if (v.x * v.x + v.y * v.y + v.z * v.z < 0.012) return;
        lastKnock = sim.time;
        const p = body.translation();
        sim.emit('extra', { kind: 'woodKnock', pos: { x: p.x, y: p.y, z: p.z }, strength: Math.min(1, imp / 0.05) });
      },
    });
    logs.push(it);
  }

  const air = { x: 0, y: 0, z: 0 };
  const _p = new THREE.Vector3(), pv = new THREE.Vector3(), a3 = new THREE.Vector3();
  const near = (p) => {
    const A = sim.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (Math.abs(p.x - wk.hub.x) < 1.0 && Math.abs(p.z - wk.hub.z) < 1.0) return true;
      if (wk.vg && Math.abs(p.x - wk.hit.x) < 1.0 && Math.abs(p.z - wk.hit.z) < 1.0) return true;
    }
    return false;
  };

  return {
    recorded: logs.map((l) => ({ id: l.id, body: l.body })),
    logs,

    applyForces() {
      for (const l of logs) {
        const b = l.body;
        if (l.pushed) { b.resetForces(false); l.pushed = false; }
        const t = b.translation();
        _p.set(t.x, t.y, t.z);
        if (!near(_p)) continue;
        pv.set(t.x, t.y - 0.01, t.z);
        sim.props.airAt(pv, a3);
        const lv = b.linvel();
        air.x = a3.x - lv.x; air.y = a3.y - lv.y; air.z = a3.z - lv.z;
        const sp = Math.hypot(air.x, air.y, air.z);
        if (sp < 0.3) continue;
        const d = l.def, area = 2 * d.r * d.L;
        let k = 0.5 * RHO * 1.0 * area * sp * WASH_GAIN;
        const fmax = 1.6 * d.mass * 9.81;
        if (k * sp > fmax) k = fmax / sp;
        b.addForce({ x: air.x * k, y: air.y * k * 1.2, z: air.z * k }, true);
        l.moved = true; l.pushed = true;
      }
    },

    afterStep() {
      for (const l of logs) if (!l.body.isSleeping() || l.moved) { l.track.capture(l.body); l.moved = !l.body.isSleeping(); }
    },

    reset() {
      for (const l of logs) {
        const b = l.body;
        b.setTranslation(l.home, true);
        b.setRotation(l.hq, true);
        b.setLinvel({ x: 0, y: 0, z: 0 }, true);
        b.setAngvel({ x: 0, y: 0, z: 0 }, true);
        b.resetForces(true); b.resetTorques(true);
        l.track.capture(b); l.track.capture(b);
        l.moved = true;
      }
    },
  };
}
