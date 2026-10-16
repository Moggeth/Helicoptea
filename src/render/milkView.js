import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAPIER, GROUPS } from '../sim/physics.js';
import { CFG } from '../config.js';
import { MILK_BOWL, BUCKET_HANGER, TABLE } from '../sim/layout.js';
import { BUCKET } from '../sim/milk.js';
import { glazeMaterial, vesselGeometry } from './models.js';
import { TeaSurface, milkyTea } from './water.js';
import { StringMesh } from './strings.js';
import { radialTexture } from './textures.js';
import { RUNNER } from './cloth.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _c = new THREE.Color();
const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0), _iq = new THREE.Quaternion();
const rand = (a, b) => a + Math.random() * (b - a);
const M = CFG.milk;

// Milk presentation: the Bambi bucket, the milk crock and its hanger, the falling stream, splashes,
// puddles and the cup levels. Reads sim.milk; never writes to the simulation.
export class MilkView {
  constructor(view, sunDir) {
    this.view = view;
    this.sim = view.sim;
    this.scene = view.scene;
    this.quality = view.quality;
    const sys = this.sim.milk;
    this.buildStation();
    // Milk surface in the crock: the same shaded surface as the tea (milk is just very milky tea).
    this.bowlSurface = new TeaSurface(sys.bowl, sunDir);
    this.bowlSurface.air = this.sim.air;
    this.scene.add(this.bowlSurface.mesh);
    this.bucketParts = this.makeBucketAssets();
    this.bucketV = null;
    this.buildStream();
    this.buildPuddles();
    const blobTex = radialTexture('rgba(0,0,0,0.85)', 'rgba(0,0,0,0)');
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, opacity: 0.4 }));
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.visible = false;
    this.scene.add(this.blob);
    this.splashBudget = 0;
  }

  // ---------------------------------------------------------------- static set: crock + hanger
  buildStation() {
    const B = MILK_BOWL;
    // A cream stoneware crock with a brown dipped rim: nearly straight sides so the bucket can go in.
    const crock = new THREE.Mesh(
      vesselGeometry({ rOutBottom: B.rOut * 0.93, rOut: B.rOut, rIn: B.rIn, rInBottom: B.rIn * 0.95, height: B.height, bottom: B.bottom, belly: 0.0025, segments: 72 }),
      glazeMaterial(0xece2cc, { roughness: 0.3 }));
    crock.position.set(B.x, 0, B.z);
    crock.castShadow = crock.receiveShadow = true;
    this.scene.add(crock);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(B.rOut + 0.0012, B.rOut + 0.0012, 0.009, 72, 1, true), glazeMaterial(0x7a4a2a, { roughness: 0.25 }));
    band.position.set(B.x, B.height - 0.0075, B.z);
    this.scene.add(band);
    const stripe = new THREE.Mesh(new THREE.TorusGeometry(B.rOut + 0.0022, 0.0009, 6, 72), glazeMaterial(0x3f6aa6));
    stripe.rotation.x = Math.PI / 2;
    stripe.position.set(B.x, B.height * 0.45, B.z);
    this.scene.add(stripe);

    // Hanger: oak base, post and arm, brass hook at the tip.
    const H = BUCKET_HANGER;
    const wood = new THREE.MeshStandardMaterial({ color: 0x8b5e3c, roughness: 0.62 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x6b4429, roughness: 0.7 });
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(H.baseHalf[0] * 2, H.baseHalf[1] * 2, H.baseHalf[2] * 2), dark);
    base.position.y = H.baseHalf[1];
    const post = new THREE.Mesh(new THREE.CylinderGeometry(H.postHalf, H.postHalf * 1.15, H.height, 14), wood);
    post.position.y = H.height / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(H.postHalf * 1.4, 14, 10), dark);
    cap.position.y = H.height;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0026, H.reach, 10), wood);
    arm.rotation.x = Math.PI / 2;
    arm.position.set(0, H.armY, H.reach / 2);
    const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.0032, 0.0007, 8, 18, Math.PI * 1.4), brass);
    hook.position.set(0, H.armY + 0.002, H.reach - 0.004);
    hook.rotation.set(0, Math.PI / 2, Math.PI * 0.8);
    for (const m of [base, post, cap, arm, hook]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    g.position.set(H.x, 0, H.z);
    this.scene.add(g);
  }

  // ---------------------------------------------------------------- bucket model
  makeBucketAssets() {
    const { R0, R1, WALL, yBot, yRim, HO, swivelY } = BUCKET;
    // Fabric: signal orange with black reinforcing bands and stitched seams.
    const cv = document.createElement('canvas');
    cv.width = 256; cv.height = 128;
    const x = cv.getContext('2d');
    x.fillStyle = '#d8432a'; x.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '0,0,0' : '255,255,255'},${Math.random() * 0.05})`; x.fillRect(Math.random() * 256, Math.random() * 128, 2, 1); }
    x.fillStyle = '#1d1b1a'; x.fillRect(0, 0, 256, 15); x.fillRect(0, 104, 256, 24);
    x.fillStyle = '#f2efe6'; x.fillRect(0, 17, 256, 3);           // reflective stripe under the rim band
    x.strokeStyle = 'rgba(60,10,0,0.45)'; x.lineWidth = 1.5;
    for (let i = 0; i < 8; i++) { const sx = (i + 0.5) * 32; x.setLineDash([3, 2]); x.beginPath(); x.moveTo(sx, 20); x.lineTo(sx, 104); x.stroke(); }
    x.setLineDash([]);
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = 'bold 15px sans-serif'; x.fillText('MILK', 24, 70); x.fillText('MILK', 152, 70);
    const tex = new THREE.CanvasTexture(cv);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    const fabric = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.78, side: THREE.FrontSide });
    const inside = new THREE.MeshStandardMaterial({ color: 0x4a1d14, roughness: 0.9, side: THREE.BackSide });
    const wallPts = [new THREE.Vector2(R0 + WALL, yBot), new THREE.Vector2(R1 + WALL, yRim)];
    const outer = new THREE.LatheGeometry(wallPts, 40);
    const innerG = new THREE.LatheGeometry([new THREE.Vector2(R0, yBot + WALL), new THREE.Vector2(R1, yRim)], 40);
    const baseG = new THREE.CircleGeometry(R0 + WALL, 32).rotateX(Math.PI / 2).translate(0, yBot, 0);
    const floorG = new THREE.CircleGeometry(R0, 32).rotateX(-Math.PI / 2).translate(0, yBot + WALL, 0);
    const alu = new THREE.MeshStandardMaterial({ color: 0xc9ccd0, metalness: 1, roughness: 0.35 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const rimG = new THREE.TorusGeometry(R1 + WALL, 0.0007, 6, 40).rotateX(Math.PI / 2).translate(0, yRim, 0);
    const valveG = new THREE.CylinderGeometry(0.0035, 0.0042, 0.0028, 16).translate(0, yBot - 0.0013, 0);
    const valveRing = new THREE.TorusGeometry(0.0042, 0.0005, 6, 18).rotateX(Math.PI / 2).translate(0, yBot - 0.0004, 0);
    const brass = new THREE.MeshStandardMaterial({ color: 0xc8a050, metalness: 1, roughness: 0.3 });
    // Suspension lines from the rim up to the control head, then the swivel the main line ties to.
    const lineMat = new THREE.MeshStandardMaterial({ color: 0x2a2a2a, roughness: 0.7 });
    const head = swivelY - 0.0045;
    const lines = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const a0 = new THREE.Vector3(Math.cos(a) * (R1 + WALL), yRim, Math.sin(a) * (R1 + WALL));
      const a1 = new THREE.Vector3(Math.cos(a) * 0.0018, head - 0.0025, Math.sin(a) * 0.0018);
      const len = a0.distanceTo(a1);
      const geo = new THREE.CylinderGeometry(0.00022, 0.00022, len, 4);
      geo.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), a1.clone().sub(a0).normalize()));
      geo.translate((a0.x + a1.x) / 2, (a0.y + a1.y) / 2, (a0.z + a1.z) / 2);
      lines.push(geo);
    }
    const linesG = mergeGeometries(lines, false); // the eight lines are one mesh (one draw call)
    const headG = new THREE.BoxGeometry(0.0055, 0.0065, 0.0055).translate(0, head, 0);
    const headStripe = new THREE.BoxGeometry(0.0057, 0.0014, 0.0057).translate(0, head + 0.0012, 0);
    const swivelG = new THREE.SphereGeometry(0.0012, 10, 8).translate(0, swivelY - 0.001, 0);
    const yellow = new THREE.MeshStandardMaterial({ color: 0xf0c02a, roughness: 0.45 });
    // Contents: a disc at the fill level, tilted by the slosh.
    const milkMat = new THREE.MeshPhysicalMaterial({ color: 0xf7f3ea, roughness: 0.22, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const milkG = new THREE.CircleGeometry(1, 28).rotateX(-Math.PI / 2);
    return {
      make() {
        const g = new THREE.Group();
        const add = (geo, mat, cast = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
        add(outer, fabric); add(innerG, inside, false); add(baseG, black); add(floorG, inside, false);
        add(rimG, alu); add(valveG, black); add(valveRing, brass);
        add(linesG, lineMat, false);
        add(headG, yellow); add(headStripe, black, false); add(swivelG, brass, false);
        const milk = new THREE.Mesh(milkG, milkMat.clone());
        milk.material.userData.disposeOwned = true;
        milk.visible = false;
        g.add(milk);
        g.userData.milk = milk;
        return g;
      },
    };
  }

  // ---------------------------------------------------------------- stream (instanced segments + beads)
  buildStream() {
    const n = M.maxParcels + 2;
    this.streamMat = new THREE.MeshPhysicalMaterial({ color: 0xf7f3ea, roughness: 0.25, clearcoat: 0.5, emissive: 0x2a2826, emissiveIntensity: 0.25 });
    const seg = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
    this.segs = new THREE.InstancedMesh(seg, this.streamMat, n);
    this.beads = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.streamMat, n);
    for (const im of [this.segs, this.beads]) {
      im.count = 0; im.frustumCulled = false; im.castShadow = false;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.userData.noAO = true;
      this.scene.add(im);
    }
  }

  updateStream() {
    const ps = this.sim.milk.parcels, k = this.sim.milk.bucket;
    let ns = 0, nb = 0;
    const r = (vol, len, wide) => THREE.MathUtils.clamp(Math.sqrt(vol / (Math.PI * Math.max(len, 0.004))) * (wide ? 0.7 : 1), 0.0006, wide ? 0.0045 : 0.0024);
    const segment = (a, b, rad) => {
      _v.subVectors(b, a);
      const len = _v.length();
      if (len < 1e-5 || len > 0.04) return;
      _q.setFromUnitVectors(_up, _v.multiplyScalar(1 / len));
      _s.set(rad, len, rad);
      _m.compose(a, _q, _s);
      this.segs.setMatrixAt(ns++, _m);
    };
    for (let i = 0; i < ps.length; i++) {
      const q = ps[i];
      // the previous parcel of the same run (and lane, for a curtain from the belly doors)
      let prev = null;
      for (let b = i - 1; b >= 0 && b >= i - 4; b--) if (ps[b].run === q.run && (ps[b].lane || 0) === (q.lane || 0)) { prev = ps[b]; break; }
      const rad = r(q.vol, prev ? prev.p.distanceTo(q.p) : 0.006, q.wide);
      if (prev && !prev.last) segment(prev.p, q.p, rad);
      _s.setScalar(rad * 1.15);
      _m.compose(q.p, _iq, _s);
      this.beads.setMatrixAt(nb++, _m);
    }
    // Join the stream to the valve while it is open.
    if (k && k.flowOut > 0 && ps.length) {
      const newest = ps[ps.length - 1];
      if (newest.src === 'valve') {
        _p.set(0, BUCKET.yBot - 0.0015, 0).applyQuaternion(this.bucketV ? this.bucketV.group.quaternion : k.quat).add(this.bucketV ? this.bucketV.group.position : k.pos);
        segment(newest.p, _p, r(newest.vol, 0.004));
      }
    }
    this.segs.count = ns; this.beads.count = nb;
    this.segs.instanceMatrix.needsUpdate = true;
    this.beads.instanceMatrix.needsUpdate = true;
    if (ps.length) this.streamMat.color.copy(milkyTea(ps[ps.length - 1].brew, ps[ps.length - 1].milk, _c));
  }

  // ---------------------------------------------------------------- puddles (pooled, irregular)
  buildPuddles() {
    this.puddleMeshes = [];
    for (let i = 0; i < M.maxPuddles; i++) {
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xf6f1e6, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.93,
        depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
      mesh.visible = false;
      mesh.receiveShadow = true;
      mesh.userData = { id: -1, noAO: true };
      mesh.renderOrder = 1;
      this.scene.add(mesh);
      this.puddleMeshes.push(mesh);
    }
  }

  puddleShape(seed) {
    const s = new THREE.Shape();
    const n = 48;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 0.86 + 0.09 * Math.sin(3 * a + seed * 11) + 0.05 * Math.sin(5 * a + seed * 23) + 0.03 * Math.sin(9 * a + seed * 37);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    const g = new THREE.ShapeGeometry(s, 2);
    g.rotateX(-Math.PI / 2);
    return g;
  }

  updatePuddles() {
    const pds = this.sim.milk.puddles;
    for (let i = 0; i < this.puddleMeshes.length; i++) {
      const mesh = this.puddleMeshes[i];
      const pd = pds[i];
      if (!pd) { mesh.visible = false; continue; }
      if (mesh.userData.id !== pd.id) {
        mesh.geometry.dispose();
        mesh.geometry = this.puddleShape(pd.seed);
        mesh.userData.id = pd.id;
        mesh.userData.r = pd.r * 0.4; // spreads out from where it landed
        mesh.rotation.y = pd.seed * 6.28;
      }
      mesh.visible = true;
      mesh.userData.r += (pd.r - mesh.userData.r) * 0.12;
      // on the table top, a puddle over the linen runner lies on the cloth, not under it
      const onRunner = pd.y === 0 && Math.abs(pd.z) < RUNNER.halfZ && Math.abs(pd.x) < TABLE.halfX;
      mesh.position.set(pd.x, pd.y + 0.0004 + (onRunner ? RUNNER.lift : 0), pd.z);
      mesh.scale.set(mesh.userData.r, 1, mesh.userData.r);
      milkyTea(pd.brew, pd.milk, mesh.material.color);
      mesh.material.opacity = THREE.MathUtils.clamp(0.5 + pd.r * 12, 0.5, 0.93);
    }
  }

  // ---------------------------------------------------------------- events
  handleEvent(e) {
    switch (e.type) {
      case 'milkLand': {
        const surf = this.surfaceOf(e.vessel);
        if (surf) {
          surf.addRipple(e.pos.x, e.pos.z, Math.min(1.2, 0.25 + e.vol * 1e6 * 0.5), this.view.time);
          surf.cloud = Math.min(1, (surf.cloud || 0) + e.vol * 1e6 * 0.35);
          surf.cloudAt = [e.pos.x - e.vessel.x, e.pos.z - e.vessel.z];
        }
        if (this.splashBudget > 0 && Math.random() < 0.5) {
          this.splashBudget--;
          milkyTea(e.vessel.brew, e.vessel.milk, _c);
          for (let i = 0; i < 2; i++) {
            const a = Math.random() * 6.283, sp = rand(0.08, 0.25);
            this.view.smoke.emit({ p: [e.pos.x, e.vessel.waterY + 0.002, e.pos.z], v: [Math.cos(a) * sp, rand(0.25, 0.6), Math.sin(a) * sp], life: rand(0.2, 0.4),
              size0: rand(0.0018, 0.003), size1: 0.0012, col0: [_c.r, _c.g, _c.b], alpha: 0.95, grav: 9.81, drag: 0.4, kind: 1 });
          }
        }
        break;
      }
      case 'milkSplash': {
        if (this.splashBudget <= 0) break;
        this.splashBudget--;
        milkyTea(e.brew, e.milk, _c);
        const n = Math.min(10, 2 + Math.round(e.vol * 1e6 * 3 + e.speed * 3));
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.283, sp = rand(0.1, 0.35) * (0.4 + e.speed * 0.5);
          this.view.smoke.emit({ p: [e.pos.x, e.pos.y + 0.0015, e.pos.z], v: [Math.cos(a) * sp, rand(0.2, 0.55) * (0.4 + e.speed * 0.4), Math.sin(a) * sp], life: rand(0.25, 0.5),
            size0: rand(0.0018, 0.0034), size1: 0.0012, col0: [_c.r, _c.g, _c.b], alpha: 1, grav: 9.81, drag: 0.4, kind: 1 });
        }
        break;
      }
      case 'bucketSplash': {
        const surf = this.surfaceOf(e.vessel);
        if (!surf || !e.vessel) break;
        const sp = Math.min(e.speed, 1.2);
        surf.addRipple(e.pos.x, e.pos.z, 0.5 + sp * 2.5, this.view.time);
        milkyTea(e.vessel.brew, e.vessel.milk, _c);
        const n = Math.round(4 + sp * 20);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * 6.283, r = rand(0.1, 0.4) * (0.3 + sp);
          this.view.smoke.emit({ p: [e.pos.x + Math.cos(a) * 0.015, e.vessel.waterY + 0.002, e.pos.z + Math.sin(a) * 0.015], v: [Math.cos(a) * r, rand(0.3, 1.0) * (0.25 + sp), Math.sin(a) * r],
            life: rand(0.25, 0.55), size0: rand(0.0025, 0.0045), size1: 0.0015, col0: [_c.r, _c.g, _c.b], alpha: 0.95, grav: 9.81, drag: 0.5, kind: 1 });
        }
        break;
      }
      case 'tankBurst': {
        // The skycrane's tank splits: a burst of droplets and a soft milky spray, bigger the fuller it was
        // and the harder it hit (the gouts themselves are stream parcels, drawn by updateStream).
        const q = Math.min(1, this.quality.particles / 520), f = e.fill, hit = THREE.MathUtils.clamp(e.impact / 1.5, 0.5, 2);
        milkyTea(e.brew, e.milk, _c);
        const n = Math.round((10 + 60 * f) * q), m = Math.round((2 + 8 * f) * q);
        for (let i = 0; i < n; i++) {
          _v.set(rand(-1, 1), rand(-0.2, 1), rand(-1, 1)).normalize().multiplyScalar(rand(0.2, 0.9) * (0.4 + 0.6 * f) * hit).addScaledVector(e.vel, 0.4);
          this.view.smoke.emit({ p: [e.pos.x, e.pos.y, e.pos.z], v: [_v.x, _v.y, _v.z], life: rand(0.35, 0.8), size0: rand(0.0015, 0.004), size1: 0.0012,
            col0: [_c.r, _c.g, _c.b], alpha: 1, grav: 9.81, drag: 0.5, kind: 1 });
        }
        for (let i = 0; i < m; i++) {
          const a = Math.random() * 6.283, sp = rand(0.05, 0.25) * hit;
          this.view.smoke.emit({ p: [e.pos.x, e.pos.y, e.pos.z], v: [Math.cos(a) * sp, rand(0.02, 0.15), Math.sin(a) * sp], life: rand(0.6, 1.1),
            size0: rand(0.008, 0.014), size1: rand(0.035, 0.06) * (0.6 + 0.6 * f), col0: [_c.r, _c.g, _c.b], alpha: 0.32, drag: 2.6 });
        }
        break;
      }
      case 'bucketRemoved': this.dropBucketView(); break;
      default: break;
    }
  }

  surfaceOf(vessel) {
    if (!vessel) return null;
    if (vessel.isBowl) return this.bowlSurface;
    return this.view.surfaces[this.sim.cups.indexOf(vessel)] || null;
  }

  dropBucketView() {
    if (!this.bucketV) return;
    this.view.fading.push({ objs: [this.bucketV.group, this.bucketV.string.mesh], t: 0, dur: 0.4 });
    this.bucketV = null;
  }

  // ---------------------------------------------------------------- per frame
  update(alpha, dt) {
    const sim = this.sim, sys = sim.milk, k = sys.bucket;
    this.splashBudget = Math.min(6, this.splashBudget + dt * 40 * (this.quality.particles / 520));
    if (k && this.bucketV && this.bucketV.id !== k.id) this.dropBucketView();
    if (k && !this.bucketV) {
      const group = this.bucketParts.make();
      const string = new StringMesh(k.N + 1, 0.00095, this.view.stringMat);
      string.pts = new Float32Array((k.N + 1) * 3);
      string.mesh.userData.noAO = true;
      this.scene.add(group, string.mesh);
      this.bucketV = { id: k.id, group, string, rippleAcc: 0 };
    }
    if (k && this.bucketV) {
      const v = this.bucketV;
      k.track.sample(alpha, _p, _q);
      v.group.position.copy(_p);
      v.group.quaternion.copy(_q);
      k.sampleString(alpha, v.string.pts);
      this.view.pinString(k, v.string.pts, _p, _q);
      v.string.update(v.string.pts);
      // Contents: level and slosh tilt (kept below the rim), coloured by what is inside.
      const milk = v.group.userData.milk;
      milk.visible = k.vol > 2e-8;
      if (milk.visible) {
        const h = k.fillH;
        const rr = BUCKET.radiusAt(h) - 0.0002;
        _iq.copy(_q).invert();
        _v.copy(k.surfN).applyQuaternion(_iq);                 // surface normal in the bucket frame
        const maxTilt = Math.atan2(Math.max(0.0005, BUCKET.H - h), rr) * 0.95;
        const tilt = Math.min(Math.acos(THREE.MathUtils.clamp(_v.y, -1, 1)), maxTilt);
        const ax = _s.set(_v.z, 0, -_v.x);
        if (ax.lengthSq() > 1e-10) milk.quaternion.setFromAxisAngle(ax.normalize(), tilt); else milk.quaternion.identity();
        milk.position.set(0, BUCKET.yFloor + h, 0);
        milk.scale.set(rr, 1, rr);
        milkyTea(k.brew, k.milkFrac, milk.material.color);
      }
      if (k.attach && k.attach.kind === 'heli') {
        if (this.view.bagPosCarried) this.view.bagPosCarried.lerp(_p, 0.5); else this.view.bagPosCarried = _p.clone();
      }
      // ripples while moving through liquid
      if (k.vessel && k.immersion > 0.1) {
        v.rippleAcc += dt;
        const sp = Math.hypot(k.vel.x, k.vel.z) + Math.abs(k.vel.y) * 0.5;
        if (v.rippleAcc > 0.08 && sp > 0.02) { v.rippleAcc = 0; this.surfaceOf(k.vessel)?.addRipple(k.pos.x, k.pos.z, Math.min(1, sp * 6), this.view.time); }
      }
      // contact shadow while carried
      if (k.attach && k.attach.kind === 'heli') {
        const hit = sim.world.castRay(new RAPIER.Ray({ x: k.pos.x, y: k.pos.y + BUCKET.yBot - 0.001, z: k.pos.z }, { x: 0, y: -1, z: 0 }), 0.8, true, undefined, GROUPS.queryWorld);
        if (hit) {
          this.blob.visible = true;
          this.blob.position.set(_p.x, k.pos.y + BUCKET.yBot - 0.001 - hit.timeOfImpact + 0.0012, _p.z);
          const s = 0.04 + hit.timeOfImpact * 0.1;
          this.blob.scale.set(s, s, 1);
          this.blob.material.opacity = 0.35 * Math.max(0, 1 - hit.timeOfImpact / 0.5);
        } else this.blob.visible = false;
      } else this.blob.visible = false;
    } else this.blob.visible = false;

    // Liquid levels follow the volumes (the crock's surface narrows a little as it drops).
    for (let i = 0; i < sim.cups.length; i++) { const s = this.view.surfaces[i]; if (s) s.mesh.position.y = sim.cups[i].waterY; }
    this.bowlSurface.mesh.position.y = sys.bowl.waterY;
    const depthFrac = (sys.bowl.waterY - sys.bowl.floorY) / (MILK_BOWL.height - MILK_BOWL.bottom);
    const sc = THREE.MathUtils.lerp(0.95, 1, THREE.MathUtils.clamp(depthFrac, 0, 1));
    this.bowlSurface.mesh.scale.set(sc, 1, sc);
    this.bowlSurface.update(this.view.time, dt);

    this.updateStream();
    this.updatePuddles();
  }
}
