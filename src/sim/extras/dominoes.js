import * as THREE from 'three';
import { RAPIER, GROUPS, Track } from '../physics.js';
import { ROOM } from '../layout.js';

// A double-six set of dominoes stood on end in a long S-curve on the kitchen floor (front left, between the
// table and the fridge). Knock the first one with the skids, a bag, or a strong blast of rotor wash and
// the run cascades, ending at a little gate of three (two pillars and a lintel) that comes down with it.
// Each domino is a loose dynamic body in the debris group; the set is 28 (14 on phones).

export const DOMINO = {
  scale: 1.25,                       // real tiles are 48 x 24 x 7.5 mm; a touch bigger so they read beside the heli
  h: 0.048 * 1.25, w: 0.024 * 1.25, t: 0.0075 * 1.25,
  mass: 0.007,
  gap: 0.042,                        // centre to centre along the run (0.7 of the height)
  start: [-0.53, 1.47],              // first domino (x, z)
  heading: Math.PI,                  // overall direction of the run: towards -x (the fridge)
  wiggle: 0.78,                      // S-curve: heading swings by this much either way
};

const RHO = 1.2, CD = 1.8;
// The floor jet under a hovering rotor is gusty and its peaks, not its mean, tip a tile over.
const WASH_GAIN = 4;
const _p = new THREE.Vector3(), _a = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Quaternion(), _f = new THREE.Vector3(), _up = new THREE.Vector3();

// The pips on each tile (a double-six set: every pair 0..6 once), shuffled into a fixed, pleasing order.
function tiles() {
  const all = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push([a, b]);
  let s = 11;
  const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
  return all;
}

// Layout: positions and headings for the standing run, then the gate at the end.
export function dominoLayout(lite) {
  const D = DOMINO, fy = ROOM.floorY;
  const n = lite ? 11 : 25;                     // standing run (+3 in the gate = 14 / 28)
  const L = (n - 1) * D.gap;
  const out = [];
  // Sine-generated S-curve: heading(s) = base + wiggle * cos(2 pi s / L), integrated in fine steps.
  let x = D.start[0], z = D.start[1], s = 0;
  const ds = D.gap / 20;
  // heading h: the run's direction is (cos h, sin h) in x, z.
  const head = (s2) => D.heading - D.wiggle * (lite ? 0.8 : 1) * Math.cos(2 * Math.PI * s2 / L);
  for (let i = 0; i < n; i++) {
    const target = i * D.gap;
    while (s < target - 1e-9) { const h = head(s + ds / 2); x += Math.cos(h) * ds; z += Math.sin(h) * ds; s += ds; }
    const h = head(s);
    out.push({ x, z, y: fy + D.h / 2, yaw: Math.PI / 2 - h, kind: 'run' });
  }
  // The gate: two pillars side by side across the path, a lintel lying flat across their tops.
  const last = out[out.length - 1], hEnd = head(L);
  const fx = Math.cos(hEnd), fz = Math.sin(hEnd), sx = -fz, sz = fx;
  const gx = last.x + fx * D.gap * 0.95, gz = last.z + fz * D.gap * 0.95;
  const yaw = Math.PI / 2 - hEnd;
  const off = D.w / 2 + 0.004;
  out.push({ x: gx + sx * off, z: gz + sz * off, y: fy + D.h / 2, yaw, kind: 'pillar' });
  out.push({ x: gx - sx * off, z: gz - sz * off, y: fy + D.h / 2, yaw, kind: 'pillar' });
  out.push({ x: gx, z: gz, y: fy + D.h + D.t / 2, yaw, kind: 'lintel' });
  const set = tiles();
  out.forEach((d, i) => { d.pips = set[i % set.length]; });
  return out;
}

// Orientation of a domino: local y up its long side, z through its faces (along the run), x across.
function homeQuat(d, out) {
  _q.setFromAxisAngle(_n.set(0, 1, 0), d.yaw);
  out.copy(_q);
  if (d.kind === 'lintel') {
    // Lying flat, face up, its long side across the path, spanning both pillars.
    // local y -> across the path, local z -> down (the pips, on the -z face, look up).
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, -1, 0));
    out.multiply(new THREE.Quaternion().setFromRotationMatrix(m));
  }
  return out;
}

export function create(sim, lite) {
  const D = DOMINO;
  const list = dominoLayout(lite);
  const items = [];
  const runCentre = new THREE.Vector3();
  let runR = 0;
  for (const d of list) runCentre.x += d.x / list.length, runCentre.z += d.z / list.length;
  runCentre.y = ROOM.floorY + 0.03;
  for (const d of list) runR = Math.max(runR, Math.hypot(d.x - runCentre.x, d.z - runCentre.z));
  const mod = { items, recorded: [], hits: 0, toppled: 0, list, version: 0 };

  list.forEach((d, i) => {
    const q = homeQuat(d, new THREE.Quaternion());
    const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(d.x, d.y, d.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
      .setLinearDamping(0.02).setAngularDamping(0.05).setCanSleep(true));
    const cd = RAPIER.ColliderDesc.cuboid(D.w / 2, D.h / 2, D.t / 2)
      .setMass(D.mass).setFriction(0.45).setRestitution(0.05).setCollisionGroups(GROUPS.debris)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0.25);
    const c = sim.world.createCollider(cd, body);
    const it = { i, def: d, body, collider: c, track: new Track(body), home: { p: new THREE.Vector3(d.x, d.y, d.z), q }, lastClack: -1, pushed: false };
    sim.register(c, {
      kind: 'prop', material: 'wood', domino: it,
      onImpact(imp, other) {
        // A clack when it meets another domino (rate-limited per tile).
        if (!other || !other.domino || imp < 0.0012) return;
        if (sim.time - it.lastClack < 0.06 || sim.time - other.domino.lastClack < 0.03) return;
        it.lastClack = sim.time;
        if (sweep > 0) sweep = 0;
        mod.hits++;
        const t = body.translation();
        sim.emit('extra', { kind: 'domino', pos: new THREE.Vector3(t.x, t.y, t.z), strength: Math.min(1, imp / 0.006), pitch: 0.85 + ((i * 7) % 11) / 30 });
      },
    });
    body.sleep();
    items.push(it);
    mod.recorded.push({ id: `domino${i + 1}`, body });
  });

  // Rotor wash: pressure on the faces (only when a wake is near the run).
  mod.applyForces = () => {
    const air = sim.air;
    if (air.calm) return;
    let near = false;
    for (const wk of air.wakes) {
      if (!wk.active) continue;
      // Only a rotor low over the floor near the run moves air along the floor here.
      const dh = Math.hypot(wk.hub.x - runCentre.x, wk.hub.z - runCentre.z);
      const dg = wk.vg && wk.hit.y < ROOM.floorY + 0.05 ? Math.hypot(wk.hit.x - runCentre.x, wk.hit.z - runCentre.z) : 99;
      if ((dh < runR + 0.5 && wk.hub.y < ROOM.floorY + 0.6) || dg < runR + 0.6) near = true;
    }
    if (!near) {
      for (const it of items) if (it.pushed) { it.body.resetForces(false); it.body.resetTorques(false); it.pushed = false; }
      return;
    }
    const time = sim.time;
    for (const it of items) {
      if (it.pushed) { it.body.resetForces(false); it.body.resetTorques(false); it.pushed = false; }
      const t = it.body.translation(), r = it.body.rotation();
      _q.set(r.x, r.y, r.z, r.w);
      _n.set(0, 0, 1).applyQuaternion(_q);
      _up.set(0, 1, 0).applyQuaternion(_q);
      const lv = it.body.linvel();
      // The outwash along the floor is a thin, gusty jet: sample it low and high on the face and push
      // each half where it is (so the low, strong jet tips the tile about its foot).
      const gust = WASH_GAIN * (1 + 0.35 * Math.sin(time * 23 + it.i * 1.7) + 0.2 * Math.sin(time * 37 + it.i));
      for (const k of [-0.25, 0.25]) {
        _p.set(t.x + _up.x * D.h * k, t.y + _up.y * D.h * k, t.z + _up.z * D.h * k);
        sim.props.airAt(_p, _a);
        if (_a.lengthSq() < 0.09) continue;
        _a.x -= lv.x; _a.y -= lv.y; _a.z -= lv.z;
        const vn = _a.dot(_n);
        _f.copy(_n).multiplyScalar(0.5 * RHO * CD * D.w * D.h * 0.5 * vn * Math.abs(vn) * gust);
        const fmax = 2 * D.mass * 9.81, fl = _f.length();
        if (fl > fmax) _f.multiplyScalar(fmax / fl);
        if (fl < 2e-5) continue;
        it.body.addForceAtPoint({ x: _f.x, y: _f.y, z: _f.z }, { x: _p.x, y: _p.y, z: _p.z }, true);
        it.pushed = true;
        if (!it.track.moved) { it.track.moved = true; awake.push(it); }
      }
    }
  };

  // Tracks follow the tiles that are awake; a slow sweep notices tiles waking or settling and counts the
  // fallen ones (a sleeping run costs almost nothing).
  const awake = [];
  let sweep = 0;
  mod.afterStep = () => {
    if (sweep-- <= 0) {
      sweep = 6;
      awake.length = 0;
      let fallen = 0;
      for (const it of items) {
        if (!it.body.isSleeping() || it.track.moved) { awake.push(it); it.track.moved = !it.body.isSleeping(); }
        if (it.def.kind === 'run') { const r = it.body.rotation(); if (1 - 2 * (r.x * r.x + r.z * r.z) < 0.7) fallen++; }
      }
      mod.toppled = fallen;
    }
    for (const it of awake) it.track.capture(it.body);
    if (awake.length) mod.version++;
  };
  // Something touched the run: follow every tile until the next sweep.
  mod.wake = () => { sweep = 0; };

  mod.reset = () => {
    for (const it of items) {
      const { p, q } = it.home;
      it.body.resetForces(false); it.pushed = false;
      it.body.setTranslation({ x: p.x, y: p.y, z: p.z }, false);
      it.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, false);
      it.body.setLinvel({ x: 0, y: 0, z: 0 }, false);
      it.body.setAngvel({ x: 0, y: 0, z: 0 }, false);
      it.body.sleep();
      it.track.capture(it.body); it.track.capture(it.body);
      it.track.moved = true;
    }
    mod.toppled = 0;
    sweep = 0;
    mod.version++;
  };
  return mod;
}
