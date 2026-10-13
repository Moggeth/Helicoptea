import * as THREE from 'three';
import { CFG } from '../config.js';
import { RAPIER, GROUPS } from '../sim/physics.js';
import { TABLE } from '../sim/layout.js';
import { buildHelicopter, cloneHeliPart, makeMaterials, teabagAssets } from './models.js';
import { TeaSurface, teaColor } from './water.js';
import { ParticlePool } from './particles.js';
import { StringMesh } from './strings.js';
import { radialTexture } from './textures.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _c = new THREE.Color();
const rand = (a, b) => a + Math.random() * (b - a);

// Presentation layer: mirrors simulation state into the Three.js scene and turns sim events into effects.
export class View {
  constructor(scene, sim, quality, kitchen) {
    this.scene = scene;
    this.sim = sim;
    this.quality = quality;
    this.time = 0;
    this.M = makeMaterials(quality);
    this.heliModel = buildHelicopter(this.M);
    scene.add(this.heliModel);
    this.bagAssets = teabagAssets();
    this.bags = new Map();
    this.debris = new Map();
    this.fading = [];
    this.stringMat = new THREE.MeshStandardMaterial({ color: 0xf5efe2, roughness: 0.8, emissive: 0x3a3428, emissiveIntensity: 0.25 });
    this.surfaces = sim.cups.map((c) => {
      const s = new TeaSurface(c, kitchen.sun.position.clone().sub(kitchen.sun.target.position));
      scene.add(s.mesh);
      return s;
    });
    this.fx = new ParticlePool(quality.particles, { additive: true });
    this.smoke = new ParticlePool(Math.round(quality.particles * 1.2), { additive: false });
    scene.add(this.fx.points, this.smoke.points);

    // Drips (simulated in sim; drawn as small points).
    this.dripGeo = new THREE.BufferGeometry();
    this.dripPos = new Float32Array(90 * 3);
    this.dripGeo.setAttribute('position', new THREE.BufferAttribute(this.dripPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.dripMat = new THREE.PointsMaterial({ color: 0xb0743a, size: 0.0035, transparent: true, opacity: 0.85, depthWrite: false });
    this.dripPoints = new THREE.Points(this.dripGeo, this.dripMat);
    this.dripPoints.frustumCulled = false;
    scene.add(this.dripPoints);

    // Contact shadow blobs (depth cue for height above the table).
    const blobTex = radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)');
    const blobMat = () => new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.5 });
    this.heliBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat());
    this.heliBlob.rotation.x = -Math.PI / 2;
    this.bagBlob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), blobMat());
    this.bagBlob.rotation.x = -Math.PI / 2;
    scene.add(this.heliBlob, this.bagBlob);

    // Scorch decals (pooled).
    const scorchTex = radialTexture('rgba(20,12,8,0.9)', 'rgba(20,12,8,0)');
    this.scorches = [];
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, opacity: 0 }));
      m.rotation.x = -Math.PI / 2;
      m.visible = false;
      scene.add(m);
      this.scorches.push({ mesh: m, age: 99 });
    }

    // Explosion flash.
    this.flash = new THREE.PointLight(0xff9a40, 0, 1.4, 1.5);
    scene.add(this.flash);
    this.flashT = 99;

    // Attach cue: pulsing ring at the reachable loop, and a guide line from hook to nearest loop.
    this.cue = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0012, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd36b, transparent: true, opacity: 0.9, depthTest: false, toneMapped: false }));
    this.cue.renderOrder = 10;
    this.cue.visible = false;
    scene.add(this.cue);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.guide = new THREE.Line(lg, new THREE.LineDashedMaterial({ color: 0xffe2a0, dashSize: 0.006, gapSize: 0.005, transparent: true, opacity: 0.6, depthTest: false }));
    this.guide.renderOrder = 9;
    this.guide.visible = false;
    scene.add(this.guide);

    this.animated = kitchen.animated;
    this.steamAcc = 0;
    this.downwashAcc = 0;
    this.heliPos = new THREE.Vector3();
    this.heliQuat = new THREE.Quaternion();
    this.bagPosCarried = null;
    this.wreckFocus = null;
    this.cupScreen = [];
  }

  // ------------------------------------------------------------- events
  handleEvents(events, camera, camRig) {
    for (const e of events) {
      switch (e.type) {
        case 'splash': this.splash(e); break;
        case 'extract': this.extractDrops(e); break;
        case 'drip': this.dripLand(e); break;
        case 'crash': this.explode(e); camRig.addShake(0.012); break;
        case 'bump': camRig.addShake(Math.min(0.004, e.dv * 0.004)); this.dust(e.pos, e.dv); break;
        case 'bagRemoved': this.retireBag(e.id); break;
        case 'debrisRemoved': this.retireDebris(e.id); break;
        case 'reset': this.fx.clear(); this.smoke.clear(); for (const s of this.scorches) { s.mesh.visible = false; s.age = 99; } for (const s of this.surfaces) s.displayBrew = 0; break;
        default: break;
      }
    }
  }

  splash(e) {
    const surf = this.surfaces[this.sim.cups.indexOf(e.cup)];
    if (!surf) return;
    const sp = Math.min(e.speed, 1.5);
    surf.addRipple(e.pos.x, e.pos.z, 0.4 + sp * 2.5, this.time);
    const col = teaColor(e.cup.brew, _c);
    const n = Math.round(4 + sp * 26);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, r = rand(0.1, 0.45) * (0.3 + sp);
      this.smoke.emit({ p: [e.pos.x + Math.cos(a) * 0.01, e.cup.waterY + 0.002, e.pos.z + Math.sin(a) * 0.01],
        v: [Math.cos(a) * r, rand(0.3, 1.1) * (0.25 + sp), Math.sin(a) * r], life: rand(0.25, 0.6), size0: rand(0.0025, 0.005), size1: 0.0015,
        col0: [col.r * 1.1, col.g * 1.1, col.b * 1.1], alpha: 0.9, grav: 9.81, drag: 0.5 });
    }
  }

  extractDrops(e) {
    const bag = e.bag;
    const cup = this.sim.cups.find((c) => Math.hypot(c.x - bag.pos.x, c.z - bag.pos.z) < c.rIn + 0.01);
    if (!cup) return;
    const surf = this.surfaces[this.sim.cups.indexOf(cup)];
    surf.addRipple(bag.pos.x, bag.pos.z, 0.5 + e.speed * 2, this.time);
  }

  dripLand(e) {
    if (e.cup) {
      const surf = this.surfaces[this.sim.cups.indexOf(e.cup)];
      surf.addRipple(e.pos.x, e.pos.z, 0.22, this.time);
    } else {
      const col = teaColor(e.brew, _c);
      for (let i = 0; i < 2; i++) this.smoke.emit({ p: [e.pos.x, e.pos.y + 0.001, e.pos.z], v: [rand(-0.1, 0.1), rand(0.1, 0.25), rand(-0.1, 0.1)], life: 0.25, size0: 0.0025, size1: 0.001, col0: [col.r, col.g, col.b], alpha: 0.8, grav: 9.81 });
    }
  }

  dust(pos, dv) {
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smoke.emit({ p: [pos.x, pos.y - 0.04, pos.z], v: [Math.cos(a) * 0.15, 0.03, Math.sin(a) * 0.15], life: 0.6, size0: 0.01, size1: 0.03, col0: [0.85, 0.8, 0.72], alpha: 0.18 * Math.min(1, dv), drag: 4 });
    }
  }

  explode(e) {
    const P = e.pos;
    const s = this.quality.particles / 500;
    // flash
    this.flash.position.copy(P);
    this.flashT = 0;
    this.fx.emit({ p: [P.x, P.y, P.z], v: [0, 0, 0], life: 0.14, size0: 0.16, size1: 0.26, col0: [1, 0.75, 0.45], alpha: 0.75 });
    for (let i = 0; i < 26 * s + 8; i++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.25, 0.85));
      this.fx.emit({ p: [P.x, P.y, P.z], v: [d.x + e.vel.x * 0.4, d.y + e.vel.y * 0.2, d.z + e.vel.z * 0.4], life: rand(0.35, 0.75), size0: rand(0.02, 0.035), size1: rand(0.05, 0.085),
        col0: [1, rand(0.55, 0.7), 0.25], col1: [0.7, 0.14, 0.02], alpha: 0.45, grav: -0.6, drag: 5 });
    }
    for (let i = 0; i < 70 * s + 20; i++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(-0.2, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(0.8, 3.0));
      this.fx.emit({ p: [P.x, P.y, P.z], v: [d.x + e.vel.x * 0.5, d.y, d.z + e.vel.z * 0.5], life: rand(0.5, 1.4), size0: rand(0.003, 0.006), size1: 0.0015,
        col0: [1, 0.95, 0.7], col1: [1, 0.35, 0.08], alpha: 1, grav: 9.81, drag: 0.8, kind: 1 });
    }
    for (let i = 0; i < 30 * s + 10; i++) {
      const d = new THREE.Vector3(rand(-1, 1), rand(0, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.08, 0.35));
      this.smoke.emit({ p: [P.x + rand(-0.01, 0.01), P.y, P.z + rand(-0.01, 0.01)], v: [d.x, d.y + rand(0.1, 0.3), d.z], life: rand(1.6, 3.4), size0: rand(0.03, 0.05), size1: rand(0.14, 0.24),
        col0: [0.18, 0.16, 0.15], col1: [0.55, 0.53, 0.5], alpha: 0.55, grav: -0.05, drag: 1.6 });
    }
    // scorch where the blast happened (on the surface below)
    const hit = this.sim.world.castRay(new RAPIER.Ray({ x: P.x, y: P.y + 0.02, z: P.z }, { x: 0, y: -1, z: 0 }), 0.5, true, undefined, GROUPS.queryWorld);
    if (hit) {
      const sc = this.scorches.reduce((a, b) => (a.age > b.age ? a : b));
      sc.age = 0;
      sc.mesh.visible = true;
      sc.mesh.position.set(P.x, P.y + 0.02 - hit.timeOfImpact + 0.0006, P.z);
      const size = rand(0.1, 0.15);
      sc.mesh.scale.set(size, size, 1);
      sc.mesh.rotation.z = Math.random() * 6;
    }
    // Hand the heli's parts to debris meshes.
    this.heliModel.visible = false;
    for (const d of e.parts) {
      const mesh = cloneHeliPart(this.heliModel, d.part.name);
      this.scene.add(mesh);
      this.debris.set(d.id, { mesh, d, smoke: d.smoke });
    }
    this.wreckFocus = P.clone();
  }

  retireBag(id) {
    const v = this.bags.get(id);
    if (!v) return;
    this.bags.delete(id);
    this.fading.push({ objs: [v.group, v.tag, v.string.mesh], t: 0, dur: 0.4 });
  }

  retireDebris(id) {
    const v = this.debris.get(id);
    if (!v) return;
    this.debris.delete(id);
    this.fading.push({ objs: [v.mesh], t: 0, dur: 0.6 });
  }

  // ------------------------------------------------------------- per frame
  update(alpha, dt, camera) {
    this.time += dt;
    const sim = this.sim;

    // Helicopter.
    if (sim.heli) {
      const h = sim.heli;
      h.track.sample(alpha, this.heliPos, this.heliQuat);
      this.heliModel.visible = true;
      this.heliModel.position.copy(this.heliPos);
      this.heliModel.quaternion.copy(this.heliQuat);
      const U = this.heliModel.userData;
      U.rotor.rotation.y = h.rotorPhase;
      for (const gh of U.ghosts) gh.rotation.y = gh.userData.offset;
      U.rotor.userData.disc.material.uniforms.uOpacity.value = Math.min(1, h.rotorSpeed) * 0.9;
      for (const gh of U.ghosts) gh.children.forEach((m) => { m.material.opacity = 0.14 * h.rotorSpeed; });
      U.tailRotor.rotation.x = h.tailPhase;
      this.wreckFocus = null;
      // contact shadow
      const hd = h.groundDist;
      const hub = _p.set(0, CFG.heli.rotorHubOffset[1], 0).applyQuaternion(this.heliQuat).add(this.heliPos);
      this.heliBlob.visible = hd < 1.1;
      this.heliBlob.position.set(hub.x, hub.y - hd + 0.0012, hub.z);
      const sz = 0.09 + hd * 0.15;
      this.heliBlob.scale.set(sz, sz * 1.3, 1);
      this.heliBlob.rotation.z = Math.atan2(0, 1) + (h.heading ? h.heading() : 0);
      this.heliBlob.material.opacity = 0.42 * Math.max(0, 1 - hd / 0.9);
      // Downwash ripples on tea directly below.
      this.downwashAcc += dt;
      if (this.downwashAcc > 0.09) {
        this.downwashAcc = 0;
        for (let i = 0; i < sim.cups.length; i++) {
          const c = sim.cups[i];
          const dx = hub.x - c.x, dz = hub.z - c.z;
          const hgt = hub.y - c.waterY;
          if (Math.hypot(dx, dz) < CFG.heli.rotorRadius + c.rIn * 0.6 && hgt < 0.35 && hgt > 0) {
            const a = (h.thrust / (CFG.heli.mass * 9.81)) * (1 - hgt / 0.35);
            const ang = Math.random() * Math.PI * 2, rr = Math.random() * c.rIn * 0.8;
            this.surfaces[i].addRipple(c.x + Math.cos(ang) * rr, c.z + Math.sin(ang) * rr, a * 0.5, this.time);
          }
        }
      }
    } else {
      this.heliModel.visible = false;
      this.heliBlob.visible = false;
    }

    // Bags, strings and tags.
    this.bagPosCarried = null;
    const seen = new Set();
    for (const b of sim.bags) {
      seen.add(b.id);
      let v = this.bags.get(b.id);
      if (!v) {
        const group = this.bagAssets.makeBag();
        const tag = this.bagAssets.makeTag();
        const string = new StringMesh(b.N + 1, 0.00085, this.stringMat);
        string.pts = new Float32Array((b.N + 1) * 3);
        this.scene.add(group, tag, string.mesh);
        v = { group, tag, string, rippleAcc: 0 };
        this.bags.set(b.id, v);
      }
      b.track.sample(alpha, _p, _q);
      v.group.position.copy(_p);
      v.group.quaternion.copy(_q);
      if (b.attach && b.attach.kind === 'heli') this.bagPosCarried = _p.clone();
      // wet look: darker, warmer, glossier; stained as it gives up its tea
      const mat = v.group.userData.mat;
      const w = b.wetness, stain = 1 - b.potency;
      mat.color.setRGB(1 - 0.38 * w - 0.15 * stain, 1 - 0.52 * w - 0.25 * stain, 1 - 0.66 * w - 0.35 * stain);
      mat.roughness = 0.92 - 0.45 * w;
      mat.sheen = 0.6 * (1 - w);
      // string
      b.sampleString(alpha, v.string.pts);
      v.string.update(v.string.pts);
      // tag hangs from the loop end of the string
      const N = b.N;
      const ex = v.string.pts[N * 3], ey = v.string.pts[N * 3 + 1], ez = v.string.pts[N * 3 + 2];
      v.tag.position.set(ex, ey, ez);
      const px = v.string.pts[(N - 1) * 3], pz = v.string.pts[(N - 1) * 3 + 2];
      const yaw = Math.atan2(ex - px, ez - pz);
      if (b.attach) v.tag.rotation.set(0, yaw + Math.PI / 2, 0);
      else {
        // free: lie along the string direction, resting on whatever is below
        const py = v.string.pts[(N - 1) * 3 + 1];
        const pitch = Math.atan2(ey - py, Math.hypot(ex - px, ez - pz));
        v.tag.rotation.set(0, 0, 0);
        v.tag.rotateY(yaw);
        v.tag.rotateX(-Math.PI / 2 + Math.min(0, pitch));
      }
      // ripples from motion in tea
      if (b.immersion > 0.15 && b.cup) {
        v.rippleAcc += dt;
        const sp = Math.hypot(b.vel.x, b.vel.z) + Math.abs(b.vel.y) * 0.5;
        if (v.rippleAcc > 0.08 && sp > 0.02) {
          v.rippleAcc = 0;
          this.surfaces[sim.cups.indexOf(b.cup)].addRipple(b.pos.x, b.pos.z, Math.min(1, sp * 6), this.time);
        }
      }
    }
    for (const [id] of this.bags) if (!seen.has(id)) this.retireBag(id);

    // Carried-bag contact shadow.
    const cb = sim.carriedBag();
    if (cb && this.bagPosCarried) {
      const hit = sim.world.castRay(new RAPIER.Ray({ x: cb.pos.x, y: cb.pos.y - 0.031, z: cb.pos.z }, { x: 0, y: -1, z: 0 }), 0.8, true, undefined, GROUPS.queryWorld);
      if (hit) {
        this.bagBlob.visible = true;
        this.bagBlob.position.set(this.bagPosCarried.x, cb.pos.y - 0.031 - hit.timeOfImpact + 0.0012, this.bagPosCarried.z);
        const s = 0.035 + hit.timeOfImpact * 0.1;
        this.bagBlob.scale.set(s, s, 1);
        this.bagBlob.material.opacity = 0.35 * Math.max(0, 1 - hit.timeOfImpact / 0.5);
      } else this.bagBlob.visible = false;
    } else this.bagBlob.visible = false;

    // Attach cue + guide line.
    const cand = sim.attachCandidate();
    if (cand && sim.heli) {
      cand.loopPosition(_p);
      this.cue.visible = true;
      this.cue.position.copy(_p);
      this.cue.quaternion.copy(camera.quaternion);
      const s = 1 + 0.25 * Math.sin(this.time * 9);
      this.cue.scale.setScalar(s);
    } else this.cue.visible = false;
    let near = null, nd = 0.16;
    if (sim.heli && !cb) {
      for (const b of sim.bags) {
        b.loopPosition(_v);
        const d = _v.distanceTo(sim.heli.hookWorld);
        if (d < nd) { nd = d; near = _v.clone(); }
      }
    }
    if (near && !cand) {
      const hook = _p.set(...CFG.heli.hookOffset).applyQuaternion(this.heliQuat).add(this.heliPos);
      const pos = this.guide.geometry.attributes.position;
      pos.setXYZ(0, hook.x, hook.y, hook.z);
      pos.setXYZ(1, near.x, near.y, near.z);
      pos.needsUpdate = true;
      this.guide.computeLineDistances();
      this.guide.visible = true;
      this.guide.material.opacity = 0.7 * (1 - nd / 0.16);
    } else this.guide.visible = false;

    // Debris.
    for (const [, v] of this.debris) {
      v.d.track.sample(alpha, _p, _q);
      v.mesh.position.copy(_p);
      v.mesh.quaternion.copy(_q);
      v.age = (v.age || 0) + dt;
      const glow = Math.max(0, 1.6 * Math.exp(-v.age * 1.1) - 0.05);
      for (const m of v.mesh.userData.embers) m.emissiveIntensity = glow;
      if (v.smoke > 0) {
        v.smoke -= dt;
        if (Math.random() < 0.5) this.smoke.emit({ p: [_p.x, _p.y + 0.005, _p.z], v: [rand(-0.02, 0.02), rand(0.08, 0.18), rand(-0.02, 0.02)], life: rand(1.0, 1.8), size0: 0.015, size1: rand(0.06, 0.1), col0: [0.2, 0.19, 0.18], col1: [0.6, 0.58, 0.55], alpha: 0.4 * Math.min(1, v.smoke), drag: 1 });
        if (Math.random() < 0.3) this.fx.emit({ p: [_p.x, _p.y + 0.004, _p.z], v: [0, rand(0.05, 0.12), 0], life: 0.25, size0: 0.012, size1: 0.004, col0: [1, 0.6, 0.2], col1: [0.8, 0.2, 0.05], alpha: 0.7 * Math.min(1, v.smoke) });
      }
    }
    if (!sim.heli && sim.debris.length) {
      const fus = sim.debris.find((d) => d.part.name === 'fuselage' && d.wreckId === sim.wreckCount);
      if (fus) { fus.track.sample(alpha, _p); this.wreckFocus = (this.wreckFocus || new THREE.Vector3()).lerp(_p, 0.1); }
    }

    // Fading objects.
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      f.t += dt;
      const k = Math.max(0.001, 1 - f.t / f.dur);
      for (const o of f.objs) o.scale.setScalar(k);
      if (f.t >= f.dur) {
        for (const o of f.objs) { this.scene.remove(o); o.traverse?.((m) => { if (m.isMesh && m.geometry && m.userData.disposeGeo) m.geometry.dispose(); }); }
        this.fading.splice(i, 1);
      }
    }

    // Drips.
    const nd2 = Math.min(sim.drips.length, 90);
    for (let i = 0; i < nd2; i++) { const d = sim.drips[i].p; this.dripPos[i * 3] = d.x; this.dripPos[i * 3 + 1] = d.y; this.dripPos[i * 3 + 2] = d.z; }
    this.dripGeo.setDrawRange(0, nd2);
    this.dripGeo.attributes.position.needsUpdate = true;

    // Steam above the cups.
    this.steamAcc += dt * this.quality.steam;
    while (this.steamAcc > 0.4) {
      this.steamAcc -= 0.4;
      for (const c of sim.cups) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * c.rIn * 0.7;
        this.smoke.emit({ p: [c.x + Math.cos(a) * r, c.waterY + 0.004, c.z + Math.sin(a) * r], v: [rand(-0.01, 0.01), rand(0.035, 0.06), rand(-0.01, 0.01)], life: rand(2.2, 3.4),
          size0: 0.012, size1: rand(0.05, 0.08), col0: [1, 0.98, 0.95], alpha: 0.07, drag: 0.2 });
      }
    }

    // Surfaces, flash, scorch fade, particles.
    for (const s of this.surfaces) s.update(this.time, dt);
    this.flashT += dt;
    this.flash.intensity = this.flashT < 0.6 ? 7 * Math.exp(-this.flashT * 9) : 0;
    for (const s of this.scorches) {
      if (!s.mesh.visible) continue;
      s.age += dt;
      s.mesh.material.opacity = 0.85 * Math.max(0, 1 - s.age / 28);
      if (s.age > 28) s.mesh.visible = false;
    }
    for (const a of (this.animated || [])) a.obj.rotation.z = a.base.z + Math.sin(this.time * 1.3 + a.phase) * 0.03;
    const floorFn = (x, z) => (Math.abs(x) < TABLE.halfX && Math.abs(z) < TABLE.halfZ ? 0.001 : -0.76);
    this.fx.update(dt, floorFn);
    this.smoke.update(dt, floorFn);
  }

  // Screen positions of cups (for the subtle brew indicator in the HUD).
  projectCups(camera, w, h) {
    this.cupScreen.length = 0;
    for (const c of this.sim.cups) {
      _p.set(c.x, c.topY + 0.03, c.z).project(camera);
      this.cupScreen.push({ x: (_p.x * 0.5 + 0.5) * w, y: (-_p.y * 0.5 + 0.5) * h, visible: _p.z < 1, cup: c });
    }
    return this.cupScreen;
  }

  setParticleScale(heightPx, fovDeg) {
    const s = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.fx.material.uniforms.uScale.value = s;
    this.smoke.material.uniforms.uScale.value = s;
  }

  focusPoint() {
    if (this.sim.heli) return this.heliPos;
    return this.wreckFocus || this.heliPos;
  }
}
