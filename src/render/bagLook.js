import * as THREE from 'three';
import { CFG } from '../config.js';

// Presentation of one tea bag beyond its rigid pose: how far up the paper the tea has soaked, which bits
// of string have been in the tea, and the tag swinging from the loop. Shared by the live view and the
// flight replay. Never writes to the simulation.

const H = CFG.cargo.bagHalf[1];
const _v = new THREE.Vector3(), _a = new THREE.Vector3(), _x = new THREE.Vector3();
const TAG_L = 0.011;               // m, pivot to the tag's centre of mass
const W0 = Math.sqrt(9.81 / TAG_L);

export function newBagLook(nPoints, wetness = 0) {
  return {
    wetLine: wetness > 0.05 ? H + 0.002 : -1,   // local y the soaking has reached (-1: dry)
    stain: new Float32Array(nPoints),          // per string point: has been in the tea
    swing: { x: 0, z: 0, vx: 0, vz: 0, pv: null, pp: null, init: false },
  };
}

// Soaking climbs as high as the bag went into the tea, then keeps wicking slowly up a wet bag.
export function updateWetLine(look, immersion, wetness, dt) {
  if (immersion > 0.02) look.wetLine = Math.max(look.wetLine, -H + 2 * H * Math.min(1, immersion));
  else if (wetness > 0.15 && look.wetLine > -H) look.wetLine = Math.min(H + 0.002, look.wetLine + dt * 0.003 * wetness);
  return look.wetLine;
}

// String points that have been under the tea take its colour (and keep it).
export function updateStringStain(look, pts, n, inWater, dt) {
  let changed = false;
  for (let i = 0; i < n; i++) {
    if (look.stain[i] >= 1) continue;
    if (inWater(pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2])) { look.stain[i] = Math.min(1, look.stain[i] + dt * 1.5); changed = true; }
  }
  // Wicking: a stained point darkens its dry neighbour a little.
  for (let i = 1; i < n; i++) if (look.stain[i - 1] > look.stain[i] + 0.3) { look.stain[i] += dt * 0.08; changed = true; }
  return changed;
}

// Tag: hangs beside the string from the loop at its end. While on a hook or peg it swings as a short
// damped pendulum driven by the loop's acceleration; free, it lies along the string.
export function placeTag(tag, pts, N, attached, bagQuat, look, dt) {
  const ex = pts[N * 3], ey = pts[N * 3 + 1], ez = pts[N * 3 + 2];
  const px = pts[(N - 1) * 3], py = pts[(N - 1) * 3 + 1], pz = pts[(N - 1) * 3 + 2];
  tag.position.set(ex, ey, ez);
  const pivot = tag.userData.pivot;
  const sw = look.swing;
  if (!attached) {
    const yaw = Math.atan2(ex - px, ez - pz);
    const pitch = Math.atan2(ey - py, Math.hypot(ex - px, ez - pz));
    tag.rotation.set(0, 0, 0);
    tag.rotateY(yaw);
    tag.rotateX(-Math.PI / 2 + Math.min(0, pitch));
    tag.rotateZ(-Math.PI / 2);
    if (pivot) pivot.rotation.set(0, 0, 0);
    sw.init = false;
    return;
  }
  // Face the same way as the bag, so the tag sits beside the string rather than across it.
  _x.set(1, 0, 0).applyQuaternion(bagQuat);
  const yaw = Math.atan2(-_x.z, _x.x);
  tag.rotation.set(0, yaw, 0);
  if (!pivot) return;
  if (!dt) { pivot.rotation.set(0, 0, 0); sw.init = false; return; }
  // Loop acceleration from the drawn positions, in the tag's frame.
  const h = Math.min(Math.max(dt, 1e-4), 0.05);
  _v.set(ex, ey, ez);
  if (!sw.init) { sw.pp = _v.clone(); sw.pv = new THREE.Vector3(); sw.x = sw.z = sw.vx = sw.vz = 0; sw.init = true; }
  _a.copy(_v).sub(sw.pp).multiplyScalar(1 / h);          // velocity
  const ax = (_a.x - sw.pv.x) / h, az = (_a.z - sw.pv.z) / h;
  sw.pv.lerp(_a, 0.5); sw.pp.copy(_v);
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const aIn = THREE.MathUtils.clamp(ax * c - az * s, -40, 40);    // along the tag (its local x)
  const aOut = THREE.MathUtils.clamp(-(ax * s + az * c), -40, 40); // through it (local z)
  const sub = Math.ceil(h / 0.004), k = h / sub;
  for (let i = 0; i < sub; i++) {
    sw.vz += (-W0 * W0 * Math.sin(sw.z) - 2 * 0.22 * W0 * sw.vz - aIn / TAG_L * Math.cos(sw.z)) * k;
    sw.vx += (-W0 * W0 * Math.sin(sw.x) - 2 * 0.22 * W0 * sw.vx + aOut / TAG_L * Math.cos(sw.x)) * k;
    sw.z = THREE.MathUtils.clamp(sw.z + sw.vz * k, -1.2, 1.2);
    sw.x = THREE.MathUtils.clamp(sw.x + sw.vx * k, -1.2, 1.2);
  }
  pivot.rotation.set(sw.x, 0, sw.z);
}
