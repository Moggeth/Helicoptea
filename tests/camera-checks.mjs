// Camera rig checks (node, no browser): the hard mounts are rigid in the airframe's frame, the GoPro
// looks straight down with the nose at the top of the picture, and the replay's tripod holds still and zooms.
// Usage: node tests/camera-checks.mjs
import * as THREE from 'three';
import { LockedRig, BoltRig, TripodRig, MOUNTS, CAM_IDS, DEFAULT_CYCLE, CAM_KEYS } from '../src/render/cameraModes.js';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const fwdOf = (q) => new THREE.Vector3(0, 0, -1).applyQuaternion(q);
const upOf = (q) => new THREE.Vector3(0, 1, 0).applyQuaternion(q);
const rightOf = (q) => new THREE.Vector3(1, 0, 0).applyQuaternion(q);
const relAngle = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
const heli = (type = 'micro') => ({ type, vel: new THREE.Vector3(), rotorSpeed: 1, thrustFrac: 0.45 });

// ---------------------------------------------------------------- catalogue
check('three steady cameras: chase, cockpit, locked chase, all in the default cycle', CAM_IDS.join() === 'chase,cockpit,locked' && DEFAULT_CYCLE.join() === CAM_IDS.join());
check('number keys 2-3 pick distinct modes', new Set(Object.values(CAM_KEYS)).size === Object.keys(CAM_KEYS).length && Object.values(CAM_KEYS).every((m) => CAM_IDS.includes(m)));
check('every aircraft has GoPro and locked mounts', ['micro', 'chinook', 'skycrane'].every((t) => MOUNTS[t] && MOUNTS[t].bolt && MOUNTS[t].locked));

// ---------------------------------------------------------------- locked chase: rigid orientation
{
  const L = new LockedRig();
  const h = heli();
  const pos = new THREE.Vector3(0, 0.3, 0);
  const q0 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.05, 0.4, 0, 'YXZ'));
  L.update(1 / 60, h, pos, q0, 'micro', 1, 0.5, false, null);
  const rel0 = q0.clone().invert().multiply(L.quat);
  // Bank hard and pitch over: the camera's attitude relative to the airframe must not change at all.
  const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.3, 1.1, 0.45, 'YXZ'));
  for (let i = 0; i < 20; i++) { h.vel.set(0.4 * i / 20, 0, -0.6 * i / 20); L.update(1 / 60, h, pos, q1, 'micro', 1, 0.5, false, null); }
  const rel1 = q1.clone().invert().multiply(L.quat);
  check('locked chase: attitude bolted to the airframe through a bank and pitch', relAngle(rel0, rel1) < 1e-6, `${relAngle(rel0, rel1).toExponential(2)} rad`);
  const off = L.pos.clone().sub(pos).applyQuaternion(q1.clone().invert());
  check('locked chase: sits behind and above in the body frame', off.z > 0.2 && off.y > 0.04, off.toArray().map((v) => v.toFixed(3)).join(', '));
  check('locked chase: the camera rolls with the airframe (horizon tilts)', Math.abs(rightOf(L.quat).y) > 0.3, `right.y ${rightOf(L.quat).y.toFixed(2)}`);
  // Speed feel: forward acceleration stretches the arm back and widens the lens; zero feel is perfectly rigid.
  const R = new LockedRig(), Z = new LockedRig();
  const lvl = new THREE.Quaternion();
  const hr = heli(), hz = heli();
  for (let i = 0; i < 40; i++) { hr.vel.set(0, 0, -0.03 * i); hz.vel.copy(hr.vel); R.update(1 / 60, hr, pos, lvl, 'micro', 1, 1, false, null); Z.update(1 / 60, hz, pos, lvl, 'micro', 1, 0, false, null); }
  check('speed feel: accelerating forward pulls the camera back and widens the lens', R.pos.z > Z.pos.z + 0.002 && R.fovKick > 2, `dz ${(R.pos.z - Z.pos.z).toFixed(4)} m, fov +${R.fovKick.toFixed(1)}°`);
  const zOff = Z.pos.clone().sub(pos);
  check('speed feel off: perfectly rigid offset', Math.abs(zOff.z - MOUNTS.micro.locked[1]) < 1e-9 && Math.abs(zOff.y - MOUNTS.micro.locked[0]) < 1e-9 && Math.abs(Z.fovKick) < 1e-9);
}

// ---------------------------------------------------------------- GoPro
{
  const B = new BoltRig();
  for (const t of ['micro', 'chinook', 'skycrane']) {
    const pos = new THREE.Vector3(0, 0.25, 0);
    B.update(1 / 60, heli(t), pos, new THREE.Quaternion(), t, 0);
    const f = fwdOf(B.quat), u = upOf(B.quat), r = rightOf(B.quat);
    check(`GoPro (${t}): looks down, nose at the top of the picture, right is right`, f.y < -0.9 && u.z < -0.9 && r.x > 0.9, `fwd ${f.toArray().map((v) => v.toFixed(2))}`);
    check(`GoPro (${t}): mounted outside the airframe on the right`, B.pos.x > 0.02, `x ${B.pos.x.toFixed(3)}`);
    // Leaned inboard so the hook line (x = 0) is in the picture.
    check(`GoPro (${t}): leans inboard towards the hook line`, f.x < -0.05, `fwd.x ${f.x.toFixed(2)}`);
  }
  // Bolted: a 90° yaw of the airframe turns the picture with it.
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2);
  B.update(1 / 60, heli(), new THREE.Vector3(), q, 'micro', 0);
  check('GoPro: turns with the airframe', upOf(B.quat).x < -0.9, `up ${upOf(B.quat).toArray().map((v) => v.toFixed(2))}`);
}

// ---------------------------------------------------------------- tripod
{
  const T = new TripodRig();
  const f = new THREE.Vector3(0, 0.3, 0);
  T.update(1 / 60, f, new THREE.Vector3(0.2, 0, 0), 0.06, 1, null);
  const p0 = T.pos.clone();
  for (let i = 0; i < 60; i++) { f.x += 0.002; T.update(1 / 60, f, new THREE.Vector3(0.12, 0, 0), 0.06, 1, null); }
  check('tripod: stands still while the aircraft flies past', T.pos.distanceTo(p0) < 1e-9 && T.cuts === 1);
  check('tripod: pans to follow', fwdOf(T.quat).dot(f.clone().sub(T.pos).normalize()) > 0.98);
  // Hovering: the lens settles on framing the aircraft (and load) at a steady size.
  for (let i = 0; i < 400; i++) T.update(1 / 60, f, new THREE.Vector3(), 0.06, 1, null);
  const d = T.pos.distanceTo(f), want = THREE.MathUtils.radToDeg(2 * Math.atan(0.06 / d));
  check('tripod: zooms to keep the aircraft a steady size', Math.abs(T.fov - want) < 0.3, `fov ${T.fov.toFixed(1)}° for ${(d * 100).toFixed(0)} cm (want ${want.toFixed(1)}°)`);
  for (let i = 0; i < 300; i++) { f.x += 0.006; T.update(1 / 60, f, new THREE.Vector3(0.36, 0, 0), 0.06, 1, null); }
  check('tripod: moves to a fresh spot when the aircraft flies off', T.cuts >= 2 && T.pos.distanceTo(f) < 1.25, `cuts ${T.cuts}`);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
