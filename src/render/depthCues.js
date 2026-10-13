import * as THREE from 'three';
import { RAPIER, GROUPS } from '../sim/physics.js';
import { BUCKET } from '../sim/milk.js';

// Depth cues for judging height and distance while hovering a load over a cup. All of them are
// presentation only (they never touch the sim) and each sits behind its own pause-menu toggle:
//  - shadows: a contact shadow straight down from every hanging load (and a stronger one for the
//    airframe) that lands on whatever is below, including the tea, and tightens and darkens as it
//    closes on it. It reads like the soft skylight shadow a real object casts under a window.
//  - plumb:   an optional plumb line from the lowest load (or the hook) to the surface below, with a
//    small laser dot and height readout.
//  - cupHint: the rim of a cup glints softly while the load is right over its opening.
//  - dipCam:  with a load low over a cup the chase camera closes in and looks a little more steeply in.
// Cheap on every tier: a handful of quads, a line, a ring and one ray cast per load per frame.
export const DEPTH_DEFAULTS = { shadows: true, plumb: false, cupHint: true, dipCam: true };

let _r = null;
const _p = new THREE.Vector3();
const MAX_LOADS = 4;

// A round shadow with an adjustable hard core (umbra) and soft edge (penumbra), optionally clipped to
// a circle in world XZ (the inside of a cup, so a shadow on the tea never spills over the rim).
function shadowMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uCore: { value: 0.3 }, uClip: { value: new THREE.Vector3() }, uLinear: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec2 vUv; varying vec2 vW;
      void main() {
        vUv = uv;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */`
      uniform float uOpacity, uCore, uLinear; uniform vec3 uClip;
      varying vec2 vUv; varying vec2 vW;
      void main() {
        if (uClip.z > 0.0 && distance(vW, uClip.xy) > uClip.z) discard;
        float r = length(vUv - 0.5) * 2.0;
        float a = 1.0 - smoothstep(uCore, 1.0, r);
        a = a * a * (3.0 - 2.0 * a) * uOpacity;
        // Behind the AO composer, blending happens in linear light: darken by the same perceived amount.
        if (uLinear > 0.5) a = 1.0 - pow(1.0 - a, 2.2);
        gl_FragColor = vec4(0.0, 0.0, 0.0, a);
      }`,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

export class DepthCues {
  constructor(scene, sim, view) {
    this.sim = sim;
    this.view = view;
    this.settings = { ...DEPTH_DEFAULTS };
    this.linearBlend = false;    // true when the scene renders through the AO composer
    this.readout = null;         // { x, y, text } in screen pixels for the HUD, or null
    this.lowest = null;          // lowest load this frame
    this.dip = 0;                // 0..1, a load low and centred over a vessel (for the camera)

    const quad = new THREE.PlaneGeometry(1, 1);
    this.shadows = [];
    for (let i = 0; i < MAX_LOADS; i++) {
      const m = new THREE.Mesh(quad, shadowMaterial());
      m.rotation.x = -Math.PI / 2;
      m.renderOrder = 3;            // after the tea (2), so it lies on the surface
      m.userData.noAO = true;
      m.visible = false;
      scene.add(m);
      this.shadows.push(m);
    }

    // Plumb line and laser dot.
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
    this.line = new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xfff0d0, transparent: true, opacity: 0.4, depthWrite: false }));
    this.line.frustumCulled = false;
    this.line.renderOrder = 4;
    this.line.userData.noAO = true;
    this.dot = new THREE.Mesh(new THREE.CircleGeometry(0.0022, 20), new THREE.MeshBasicMaterial({ color: 0xff4a36, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    this.dot.rotation.x = -Math.PI / 2;
    this.dot.renderOrder = 4;
    this.dot.userData.noAO = true;
    this.line.visible = this.dot.visible = false;
    scene.add(this.line, this.dot);

    // Rim glint for the cup under the load (unit torus, scaled to the rim).
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 6, 64), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    this.ring.rotation.x = Math.PI / 2;
    this.ring.renderOrder = 4;
    this.ring.userData.noAO = true;
    this.ring.visible = false;
    scene.add(this.ring);
    this.ringK = 0;
    this.ringVessel = null;
  }

  set(key, on) { if (key in this.settings) this.settings[key] = !!on; }

  // Where a vertical line down from (x, y, z) first meets a surface: the liquid in a vessel, or
  // whatever solid the ray hits (table, rim, saucer, sill, grass). Returns null over nothing.
  surfaceBelow(x, y, z, out) {
    if (!_r) _r = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    _r.origin.x = x; _r.origin.y = y; _r.origin.z = z;
    const hit = this.sim.world.castRay(_r, 3, true, undefined, GROUPS.queryWorld);
    let gy = hit ? y - hit.timeOfImpact : -Infinity;
    let vessel = null;
    for (const v of this.sim.milk.vessels) {
      const dx = x - v.x, dz = z - v.z;
      if (dx * dx + dz * dz < v.rIn * v.rIn && y > v.waterY && v.waterY > gy) { gy = v.waterY; vessel = v; }
    }
    if (gy === -Infinity) return null;
    out.y = gy; out.vessel = vessel;
    return out;
  }

  // Everything hanging off the aircraft, as { x, y (bottom), z, w (half width), immersed }.
  loads() {
    const sim = this.sim, view = this.view, out = this._loads || (this._loads = []);
    out.length = 0;
    const bk = sim.milk.bucket;
    for (const b of sim.carriedCargo()) {
      const isB = b === bk;
      const g = isB ? view.milkView.bucketV?.group : view.bags.get(b.id)?.group;
      const p = g ? g.position : b.pos;
      out.push({ x: p.x, y: p.y + (isB ? BUCKET.yBot : -0.03), z: p.z, w: isB ? BUCKET.R1 + BUCKET.WALL : 0.024, immersed: b.immersion > 0.03, wet: isB ? 0.85 : 1 });
    }
    const h = sim.heli;
    if (h && h.type === 'skycrane' && h.hose) {
      const pts = view.skycrane.curvePts, head = pts[pts.length - 1];
      out.push({ x: head.x, y: head.y - 0.004, z: head.z, w: 0.007, immersed: !!h.hose.submerged, wet: 0.8 });
    }
    return out;
  }

  // After view.update (so loads and the airframe are drawn where they are this frame).
  update(dt, camera, width, height) {
    const S = this.settings, sim = this.sim, view = this.view, h = sim.heli;
    const loads = h ? this.loads() : [];
    let lowest = null;
    for (const L of loads) if (!lowest || L.y < lowest.y) lowest = L;
    this.lowest = lowest;
    const surf = this._s || (this._s = { y: 0, vessel: null });

    // Shadows. The legacy blobs stay as they were when this is off.
    let n = 0;
    if (S.shadows) {
      view.bagBlob.visible = false;
      view.milkView.blob.visible = false;
      for (const L of loads) {
        if (n >= MAX_LOADS) break;
        if (L.immersed || !this.surfaceBelow(L.x, L.y - 0.0005, L.z, surf)) continue;
        const d = Math.max(0, L.y - surf.y);
        if (d > 1.0) continue;
        const m = this.shadows[n++];
        m.visible = true;
        m.position.set(L.x, surf.y + (surf.vessel ? 0.0015 : 0.0012), L.z);
        // Skylight through a window: the penumbra spreads with height and the umbra shrinks away.
        const s = L.w * 2.1 + d * 0.32;
        m.scale.set(s, s, 1);
        const U = m.material.uniforms;
        U.uLinear.value = this.linearBlend ? 1 : 0;
        U.uCore.value = THREE.MathUtils.clamp(0.62 - d * 4, 0, 0.62);
        U.uOpacity.value = L.wet * (0.12 + 0.6 * Math.exp(-d / 0.09)) * THREE.MathUtils.clamp((1.0 - d) / 0.35, 0, 1);
        if (surf.vessel) U.uClip.value.set(surf.vessel.x, surf.vessel.z, surf.vessel.rIn - 0.0006);
        else U.uClip.value.set(0, 0, 0);
      }
      // Airframe shadow: darker and with a firmer core close in, still faint at a metre.
      const hb = view.heliBlob;
      if (h && hb.visible && view.heliBlobHd !== undefined) {
        const hd = view.heliBlobHd;
        const op = (0.16 + 0.5 * Math.exp(-hd / 0.16)) * THREE.MathUtils.clamp((1.1 - hd) / 0.3, 0, 1);
        hb.material.opacity = this.linearBlend ? 1 - Math.pow(1 - op, 2.2) : op;
      }
    }
    for (let i = n; i < MAX_LOADS; i++) this.shadows[i].visible = false;

    // Plumb line from the lowest load, or from the hook when nothing is on it.
    this.readout = null;
    let plumbOn = false;
    if (S.plumb && h) {
      let x, y, z;
      if (lowest && !lowest.immersed) { x = lowest.x; y = lowest.y; z = lowest.z; }
      else if (!lowest && h.hookWorlds && h.hookWorlds.length) {
        const hooks = h.def.hooks, i = hooks.length === 3 ? 1 : 0;
        _p.set(...hooks[i]).applyQuaternion(view.heliQuat).add(view.heliPos);
        x = _p.x; y = _p.y; z = _p.z;
      }
      if (x !== undefined && this.surfaceBelow(x, y - 0.0005, z, surf) && y - surf.y < 2) {
        plumbOn = true;
        const pos = this.line.geometry.attributes.position;
        pos.setXYZ(0, x, y, z);
        pos.setXYZ(1, x, surf.y + 0.001, z);
        pos.needsUpdate = true;
        this.dot.position.set(x, surf.y + 0.0016, z);
        const d = y - surf.y;
        _p.set(x, surf.y + Math.min(d * 0.5, 0.02), z).project(camera);
        if (_p.z < 1 && Math.abs(_p.x) < 1.1 && Math.abs(_p.y) < 1.1) {
          this.readout = { x: (_p.x * 0.5 + 0.5) * width, y: (-_p.y * 0.5 + 0.5) * height, text: `${(d * 100).toFixed(d < 0.1 ? 1 : 0)} cm` };
        }
      }
    }
    this.line.visible = this.dot.visible = plumbOn;

    // Rim glint on the vessel whose opening the load is over.
    let best = null, bestK = 0, dip = 0;
    for (const L of loads) {
      for (const v of sim.milk.vessels) {
        if (L.y < v.floorY - 0.01 || L.y > v.topY + 0.25) continue;
        const dist = Math.hypot(L.x - v.x, L.z - v.z);
        dip = Math.max(dip, THREE.MathUtils.clamp((v.rIn + 0.05 - dist) / 0.04, 0, 1) * THREE.MathUtils.clamp((v.topY + 0.2 - L.y) / 0.08, 0, 1));
        if (L.immersed || L.y < v.waterY) continue;
        const room = v.rIn - L.w * 0.55;
        const k = THREE.MathUtils.clamp((room - dist) / 0.008, 0, 1);
        if (k > bestK) { bestK = k; best = v; }
      }
    }
    this.dip = S.dipCam ? dip : 0;
    if (!S.cupHint) best = null;
    if (best) this.ringVessel = best;
    if (!S.cupHint) this.ringK = 0;
    this.ringK += ((best ? bestK : 0) - this.ringK) * Math.min(1, dt * 12);
    const rv = this.ringVessel;
    this.ring.visible = this.ringK > 0.01 && !!rv;
    if (this.ring.visible) {
      const rr = ((rv.rOut || rv.rIn + 0.005) + rv.rIn) / 2;
      this.ring.position.set(rv.x, rv.topY + 0.0004, rv.z);
      this.ring.scale.set(rr, rr, rr);
      this.ring.material.opacity = 0.7 * this.ringK;
    }
  }
}
