import * as THREE from 'three';
import { CFG } from '../config.js';
import { buildSkycrane } from './skycraneModel.js';
import { StringMesh } from './strings.js';

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const SMOOTH = 28;

// Skycrane presentation: airframe, rotors, belly doors, beacon, contact shadow, the snorkel hose as a
// smooth tube through its physics segments with the red intake nozzle, and pump/downwash ripples.
export class SkycraneView {
  constructor(view) {
    this.view = view;
    this.model = buildSkycrane();
    this.model.visible = false;
    view.scene.add(this.model);
    const M = this.model.userData.materials;
    this.hoseMat = new THREE.MeshStandardMaterial({ color: 0xd8c7a0, roughness: 0.72 });
    this.hose = new StringMesh(SMOOTH, CFG.skycrane.hose.radius * 1.1, this.hoseMat);
    this.hose.mesh.userData.noAO = true;
    this.hose.mesh.visible = false;
    view.scene.add(this.hose.mesh);
    this.raw = new Float32Array((CFG.skycrane.hose.segments + 1) * 3);
    this.pts = new Float32Array(SMOOTH * 3);
    this.curvePts = Array.from({ length: CFG.skycrane.hose.segments + 1 }, () => new THREE.Vector3());
    this.curve = new THREE.CatmullRomCurve3(this.curvePts, false, 'centripetal');
    // Intake nozzle: red body, grey strainer cage at the tip.
    const nz = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.0031, 0.0036, 0.009, 16), M.nozzle);
    body.position.y = -0.0045;
    const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.0039, 0.0039, 0.0042, 16, 1, true), M.strainer);
    cage.position.y = -0.011;
    const bars = new THREE.Mesh(new THREE.TorusGeometry(0.0039, 0.0005, 6, 16), M.strainer);
    bars.rotation.x = Math.PI / 2; bars.position.y = -0.013;
    const cap = new THREE.Mesh(new THREE.CircleGeometry(0.0038, 16), M.strainer);
    cap.rotation.x = Math.PI / 2; cap.position.y = -0.0131;
    nz.add(body, cage, bars, cap);
    nz.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    nz.visible = false;
    view.scene.add(nz);
    this.nozzle = nz;
    this.rippleAcc = 0;
    this.downwashAcc = 0;
  }

  hide() {
    this.model.visible = false;
    this.hose.mesh.visible = false;
    this.nozzle.visible = false;
  }

  update(h, alpha, dt) {
    const view = this.view, sim = view.sim, U = this.model.userData;
    h.track.sample(alpha, view.heliPos, view.heliQuat);
    const M = this.model;
    M.visible = true;
    M.position.copy(view.heliPos);
    M.quaternion.copy(view.heliQuat);
    // Rotors: the disc tilts with the cyclic.
    const rotor = U.rotor;
    rotor.rotation.order = 'ZYX';
    rotor.rotation.y = h.rotorPhase;
    rotor.rotation.x = -h.tilt[0];
    rotor.rotation.z = -h.tilt[1];
    rotor.userData.disc.material.uniforms.uOpacity.value = Math.min(1, h.rotorSpeed) * 0.95;
    for (const gh of rotor.userData.ghosts) {
      gh.rotation.y = gh.userData.offset;
      gh.children.forEach((m) => { m.material.opacity = 0.12 * h.rotorSpeed; });
    }
    U.tailRotor.rotation.x = h.tailPhase;
    U.tailRotor.userData.disc.material.uniforms.uOpacity.value = Math.min(1, h.rotorSpeed) * 0.7;
    if (U.beacon) U.beacon.material.emissiveIntensity = (view.time % 1.2) < 0.1 ? 3 : 0;
    // Belly doors swing open with the flow control.
    for (const d of U.doors) d.rotation.z = -d.userData.side * h.tank.doors * 1.25;
    view.wreckFocus = null;

    // Contact shadow.
    const hd = h.groundDist;
    const hub = _p.set(...CFG.skycrane.hub).applyQuaternion(view.heliQuat).add(view.heliPos);
    view.heliBlob.visible = hd < 1.1;
    view.heliBlob.position.set(hub.x, hub.y - hd + 0.0012, hub.z);
    const sz = 0.12 + hd * 0.15;
    view.heliBlob.scale.set(sz * 0.8, sz * 1.9, 1);
    view.heliBlob.rotation.z = h.heading();
    view.heliBlob.material.opacity = 0.48 * Math.max(0, 1 - hd / 0.9);

    // Hose: anchor follows the drawn airframe, then a smooth curve through the segments.
    const a = _a.set(...CFG.skycrane.hose.anchor).applyQuaternion(view.heliQuat).add(view.heliPos);
    h.hose.sample(alpha, a, this.raw);
    for (let i = 0; i < this.curvePts.length; i++) this.curvePts[i].set(this.raw[i * 3], this.raw[i * 3 + 1], this.raw[i * 3 + 2]);
    for (let i = 0; i < SMOOTH; i++) {
      this.curve.getPoint(i / (SMOOTH - 1), _v);
      this.pts[i * 3] = _v.x; this.pts[i * 3 + 1] = _v.y; this.pts[i * 3 + 2] = _v.z;
    }
    // A pumping hose throbs.
    this.hose.radius = CFG.skycrane.hose.radius * (1.1 + (h.tank.pumping ? 0.12 * Math.sin(view.time * 30) : 0));
    this.hose.update(this.pts);
    this.hose.mesh.visible = true;
    const n = this.curvePts.length;
    const head = this.curvePts[n - 1], prev = this.curvePts[n - 2];
    this.nozzle.visible = true;
    this.nozzle.position.copy(head);
    _v.subVectors(prev, head);
    if (_v.lengthSq() < 1e-10) _v.set(0, 1, 0);
    this.nozzle.quaternion.setFromUnitVectors(UP, _v.normalize());

    // Intake in the milk: a vortex of ripples while pumping, a ring as it goes in.
    const mv = view.milkView;
    const ves = h.hose.submerged;
    this.rippleAcc += dt;
    if (ves && this.rippleAcc > (h.tank.pumping ? 0.06 : 0.25)) {
      this.rippleAcc = 0;
      const surf = mv.surfaceOf(ves);
      if (surf) {
        const ang = view.time * 9, r = 0.006;
        surf.addRipple(head.x + Math.cos(ang) * r, head.z + Math.sin(ang) * r, h.tank.pumping ? 0.5 : 0.25, view.time);
        if (h.tank.pumping) { surf.cloud = Math.max(surf.cloud || 0, 0.15); surf.cloudAt = [head.x - ves.x, head.z - ves.z]; }
      }
    }

    // Downwash ripples on any cup under the disc.
    this.downwashAcc += dt;
    if (this.downwashAcc > 0.08) {
      this.downwashAcc = 0;
      for (let i = 0; i < sim.cups.length; i++) {
        const c = sim.cups[i];
        const hgt = hub.y - c.waterY;
        if (Math.hypot(hub.x - c.x, hub.z - c.z) < CFG.skycrane.rotorRadius + c.rIn * 0.6 && hgt < 0.45 && hgt > 0) {
          const amp = (h.thrust / (h.def.mass * 9.81)) * (1 - hgt / 0.45);
          const ang = Math.random() * Math.PI * 2, rr = Math.random() * c.rIn * 0.8;
          view.surfaces[i].addRipple(c.x + Math.cos(ang) * rr, c.z + Math.sin(ang) * rr, amp * 0.6, view.time);
        }
      }
    }
  }
}
