import * as THREE from 'three';
import { TABLE, ROOM, WALL_T, GARDEN, PATIO, GTABLE, GTEAPOT, GJAR, GCHAIRS, ARCH, BIRDBATH, STUMP, BENCH, TREE, POTS, HEDGE, GARDEN_STATION } from '../sim/layout.js';
import { glazeMaterial, handleGeometry } from './models.js';
import { Batcher, T, boxUV, planeUV, blobGeometry } from './batch.js';
import { flagTexture, boardTexture, barkTexture, leafTexture, foliageTexture, groundTexture, grassMask, makeNoise } from './gardenTextures.js';
import { Grass, WIND_GLSL } from './grass.js';
import { buildHouseShell } from './houseShell.js';
import { buildCharm } from './charm.js';
import { buildDetail } from './detail.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
const _v = new THREE.Vector3(), _c = new THREE.Vector3();

// The tea garden behind the kitchen: patio, lawn and meadow grass, borders, a garden table with its own
// tea stand and cup, a rose arch, bird bath, stump, bench and an apple tree, all walled in by a fence
// and hedge under an open sky. Decor and grass density scale with the quality tier.
export function buildGarden(scene, quality, kitchen, teaStand, sim) {
  const tier = quality.name === 'ultra' ? 'high' : quality.name; // ultra builds the world as high does
  const q = tier === 'high' ? 1 : tier === 'medium' ? 0.55 : 0.3;
  const shadows = quality.shadows > 0;
  const decor = { cast: tier === 'high' }; // small decor casts shadows only on the high tier
  const fy = ROOM.floorY;
  const rnd = mulberry(4242);
  const b = new Batcher();
  const leafGroups = [];

  // ---------------------------------------------------------------- sky, haze, distant ground
  const sunDir = kitchen.sun.position.clone().sub(kitchen.sun.target.position).normalize();
  const sky = skyDome(sunDir);
  scene.add(sky);
  const horizon = new THREE.Color(0xe4e0d4);
  scene.fog = new THREE.Fog(horizon, 6, 28);
  scene.background = horizon;
  {
    const far = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: 0x5d7343 }));
    far.rotation.x = -Math.PI / 2;
    far.position.y = fy - 0.012;
    far.receiveShadow = false;
    scene.add(far);
  }

  buildHouseShell(scene, quality);

  // ---------------------------------------------------------------- ground: lawn colour, patio, grass
  const GW = GARDEN.maxX - GARDEN.minX, GD = GARDEN.maxZ - GARDEN.minZ;
  {
    const tex = groundTexture(tier === 'high' ? 2048 : 1024);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(GW, GD), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.set((GARDEN.minX + GARDEN.maxX) / 2, fy + 0.0005, (GARDEN.minZ + GARDEN.maxZ) / 2);
    ground.receiveShadow = shadows;
    scene.add(ground);
    const flags = flagTexture(tier === 'high' ? 1024 : 512);
    flags.repeat.set(1 / 1.2, 1 / 1.2);
    const pw = PATIO.maxX - PATIO.minX, pd = PATIO.maxZ - PATIO.minZ;
    const patio = new THREE.Mesh(planeUV(pw, pd, 1), new THREE.MeshStandardMaterial({ map: flags, roughness: 0.9 }));
    patio.rotation.x = -Math.PI / 2;
    patio.position.set((PATIO.minX + PATIO.maxX) / 2, fy + 0.003, (PATIO.minZ + PATIO.maxZ) / 2);
    patio.receiveShadow = true;
    scene.add(patio);
    // Edging between patio and lawn.
    b.add(new THREE.BoxGeometry(pw, 0.02, 0.05), new THREE.MeshStandardMaterial({ map: flags, roughness: 0.9 }), T((PATIO.minX + PATIO.maxX) / 2, fy + 0.01, PATIO.minZ), 0xcfc2aa, { cast: false });
  }
  const mask = grassMask(tier === 'high' ? 512 : 384);
  const grass = new Grass(scene, quality, mask, shadows && tier === 'high');

  // ---------------------------------------------------------------- materials
  const teak = new THREE.MeshStandardMaterial({ map: boardTexture(512, [168, 128, 90], true), roughness: 0.75 });
  teak.map.repeat.set(1.2, 1.2);
  const fenceMat = new THREE.MeshStandardMaterial({ map: boardTexture(512, [120, 98, 76]), roughness: 0.9 });
  fenceMat.map.repeat.set(1, 1);
  const whitePaint = new THREE.MeshStandardMaterial({ color: 0xf1ede4, roughness: 0.6 });
  const iron = new THREE.MeshStandardMaterial({ color: 0x2f3a33, roughness: 0.45, metalness: 0.6 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xbdb5a3, roughness: 0.9 });
  const terracotta = new THREE.MeshStandardMaterial({ color: 0xb8643f, roughness: 0.8 });
  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
  bark.map.repeat.set(2, 1);
  const foliage = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
  const leafy = new THREE.MeshStandardMaterial({ map: foliageTexture(tier === 'high' ? 512 : 256), roughness: 0.9 });
  leafy.map.repeat.set(2, 2);
  const soil = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 1 });

  // ---------------------------------------------------------------- fence and hedge
  {
    const G = GARDEN, H = G.fenceH;
    const run = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(-(z1 - z0), x1 - x0);
      const nb = Math.round(len / 0.1);
      for (let i = 0; i < nb; i++) {
        const t = (i + 0.5) / nb;
        const hh = H + (rnd() - 0.5) * 0.015;
        b.add(boxUV(0.098, hh, 0.018, 1), fenceMat, T(x0 + (x1 - x0) * t, fy + hh / 2 + 0.05, z0 + (z1 - z0) * t, yaw), shade(rnd, 0.85, 1.05), decor);
      }
      const np = Math.max(1, Math.round(len / 1.8));
      for (let i = 0; i <= np; i++) {
        const t = i / np;
        b.add(boxUV(0.09, H + 0.12, 0.09, 1), fenceMat, T(x0 + (x1 - x0) * t, fy + (H + 0.12) / 2, z0 + (z1 - z0) * t, yaw), 0x9a8c7a, decor);
      }
      for (const y of [0.25, H - 0.15]) b.add(boxUV(len, 0.07, 0.03, 1), fenceMat, T((x0 + x1) / 2, fy + y, (z0 + z1) / 2, yaw), 0x8d7f6e, { cast: false });
      b.add(boxUV(len, 0.12, 0.03, 1), fenceMat, T((x0 + x1) / 2, fy + 0.06, (z0 + z1) / 2, yaw), 0x7b7064, { cast: false });
    };
    run(G.minX, G.maxZ, G.minX, G.minZ);
    run(G.maxX, G.maxZ, G.maxX, G.minZ);
    run(G.minX, G.minZ, G.maxX, G.minZ);
    run(G.minX, G.maxZ, ROOM.minX - WALL_T, G.maxZ);
    run(ROOM.maxX + WALL_T, G.maxZ, G.maxX, G.maxZ);
    // Hedge: a dense core plus leaf cards on its faces.
    const hz = (HEDGE.z0 + HEDGE.z1) / 2, hd = HEDGE.z1 - HEDGE.z0, hh = HEDGE.top - fy;
    const nSeg = 9;
    for (let i = 0; i < nSeg; i++) {
      const x = G.minX + (i + 0.5) / nSeg * (G.maxX - G.minX);
      const g = blobGeometry(0.5, 2, i * 1.7, 0.12);
      b.add(g, leafy, T(x, fy + hh * 0.5, hz, rnd() * 6, 0, 0, (G.maxX - G.minX) / nSeg * 1.25, hh * 1.0, hd * 1.05), 0xb8c8a8, decor);
    }
    const pts = [];
    const n = Math.round(2600 * q);
    for (let i = 0; i < n; i++) {
      const face = rnd();
      const x = G.minX + 0.05 + rnd() * (G.maxX - G.minX - 0.1);
      if (face < 0.7) pts.push([x, fy + 0.08 + rnd() * (hh - 0.12), HEDGE.z1 + 0.01 + rnd() * 0.04, 0, 0, 1]);
      else pts.push([x, HEDGE.top - 0.02 + rnd() * 0.04, HEDGE.z0 + rnd() * hd, 0, 1, 0]);
    }
    leafGroups.push(leafCards(scene, grass.uniforms, pts, { size: 0.15, hue: 96, light: 0.85, cast: false, shadows }));
  }

  // ---------------------------------------------------------------- garden table, its stand, teapot, jar, chairs
  {
    const Tb = GTABLE, top = Tb.top;
    const ns = 7, sw = (Tb.halfZ * 2) / ns;
    for (let i = 0; i < ns; i++) {
      b.add(boxUV(Tb.halfX * 2, Tb.thickness, sw - 0.008, 1), teak, T(Tb.x, top - Tb.thickness / 2, Tb.z - Tb.halfZ + (i + 0.5) * sw), shade(rnd, 0.9, 1.05));
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const h = top - Tb.thickness - fy;
      b.add(boxUV(0.05, h, 0.05, 1), teak, T(Tb.x + sx * (Tb.halfX - 0.07), fy + h / 2, Tb.z + sz * (Tb.halfZ - 0.06)), 0xd8c8b0);
    }
    for (const sz of [-1, 1]) b.add(boxUV(Tb.halfX * 2 - 0.1, 0.06, 0.025, 1), teak, T(Tb.x, top - 0.06, Tb.z + sz * (Tb.halfZ - 0.06)), 0xd8c8b0);
    bakeGroup(b, teaStand(GARDEN_STATION));
    // Teapot: cream glaze with a green band.
    const P = GTEAPOT;
    const g = new THREE.Group();
    const mat = glazeMaterial(0xf1e6cf, { roughness: 0.18 });
    const prof = [];
    for (let i = 0; i <= 20; i++) { const t = i / 20; prof.push(V2(i === 0 ? 0.0001 : P.r * (0.7 + 0.3 * Math.sin(Math.PI * (0.12 + 0.78 * t))), t * P.h * 0.85)); }
    prof.push(V2(P.r * 0.55, P.h * 0.86), V2(0.0001, P.h * 0.86));
    g.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), mat));
    const lid = new THREE.Mesh(new THREE.SphereGeometry(P.r * 0.58, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.35), mat);
    lid.position.y = P.h * 0.86 - P.r * 0.47;
    g.add(lid);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.011, 12, 10), glazeMaterial(0x5f8f5a));
    knob.position.y = P.h * 0.86 + 0.012;
    g.add(knob);
    const band = new THREE.Mesh(new THREE.TorusGeometry(P.r * 0.99, 0.003, 6, 48), glazeMaterial(0x5f8f5a));
    band.rotation.x = Math.PI / 2; band.position.y = P.h * 0.45;
    g.add(band);
    const spout = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(P.r * 0.8, 0.035, 0), new THREE.Vector3(P.r + 0.025, 0.055, 0), new THREE.Vector3(P.r + 0.045, 0.095, 0), new THREE.Vector3(P.r + 0.055, 0.115, 0)]), 16, 0.01, 10, false), mat);
    g.add(spout);
    const handle = new THREE.Mesh(handleGeometry(0.035, 0.007, Math.PI * 1.15), mat);
    handle.position.set(-P.r - 0.004, 0.06, 0);
    handle.rotation.y = Math.PI;
    g.add(handle);
    g.position.set(P.x, top, P.z);
    g.rotation.y = Math.PI * 0.85;
    bakeGroup(b, g);
    // Jam jar of garden flowers.
    const J = GJAR;
    const jarGlass = new THREE.MeshPhysicalMaterial({ color: 0xd8ebe4, roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(J.r, J.r * 0.95, J.h, 24, 1, true), jarGlass);
    jar.position.set(J.x, top + J.h / 2, J.z);
    jar.userData.noAO = true;
    scene.add(jar);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(J.r * 0.94, J.r * 0.92, J.h * 0.6, 20), new THREE.MeshStandardMaterial({ color: 0xc9dcc8, transparent: true, opacity: 0.4, roughness: 0.1, depthWrite: false }));
    water.position.set(J.x, top + J.h * 0.3, J.z);
    water.userData.noAO = true;
    scene.add(water);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 0.6 });
    const heads = [0xf3efe6, 0xf2b6c6, 0xf6d36b, 0xe98fa6, 0xf3efe6];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI * 2 + 0.3, lean = 0.025 + rnd() * 0.02;
      const tip = new THREE.Vector3(J.x + Math.cos(a) * lean, top + J.h + 0.05 + rnd() * 0.04, J.z + Math.sin(a) * lean);
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(J.x + Math.cos(a) * 0.01, top + 0.01, J.z + Math.sin(a) * 0.01), new THREE.Vector3(J.x + Math.cos(a) * 0.012, top + J.h, J.z + Math.sin(a) * 0.012), tip);
      b.add(new THREE.TubeGeometry(curve, 10, 0.0022, 5, false), stemMat, null, 0xffffff, decor);
      for (let k = 0; k < 8; k++) {
        const pa = k / 8 * Math.PI * 2;
        b.add(new THREE.SphereGeometry(0.011, 8, 5), foliage, T(tip.x + Math.cos(pa) * 0.011, tip.y, tip.z + Math.sin(pa) * 0.011, -pa, 0, 0, 1, 0.3, 0.5), heads[i], decor);
      }
      b.add(new THREE.SphereGeometry(0.0055, 8, 6), foliage, T(tip.x, tip.y + 0.002, tip.z), 0xc98a1b, decor);
    }
    // Bistro chairs (painted iron): seat, splayed legs, hoop back.
    for (const [x, z, yaw] of GCHAIRS) {
      const seatY = fy + 0.45;
      b.add(new THREE.CylinderGeometry(0.2, 0.19, 0.02, 28), iron, T(x, seatY, z));
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * Math.PI * 2 + Math.PI / 4 + yaw;
        const top2 = new THREE.Vector3(x + Math.cos(a) * 0.15, seatY - 0.01, z + Math.sin(a) * 0.15);
        const bot = new THREE.Vector3(x + Math.cos(a) * 0.19, fy, z + Math.sin(a) * 0.19);
        b.add(new THREE.TubeGeometry(new THREE.LineCurve3(top2, bot), 1, 0.008, 6, false), iron, null);
      }
      const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      for (let k = -2; k <= 2; k++) {
        const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)).multiplyScalar(k * 0.06);
        const p0 = new THREE.Vector3(x, seatY, z).addScaledVector(back, 0.17).add(side);
        b.add(new THREE.TubeGeometry(new THREE.LineCurve3(p0, p0.clone().add(new THREE.Vector3(0, 0.42, 0)).addScaledVector(back, 0.04)), 1, 0.006, 5, false), iron, null);
      }
      const hoop = new THREE.TorusGeometry(0.17, 0.009, 6, 24, Math.PI);
      b.add(hoop, iron, T(x + back.x * 0.21, seatY + 0.3, z + back.z * 0.21, yaw));
    }
  }

  // ---------------------------------------------------------------- rose arch
  {
    const A = ARCH;
    const h = A.top - fy;
    for (const sx of [-1, 1]) b.add(boxUV(A.post * 2, h, A.post * 2, 1), whitePaint, T(A.x + sx * A.halfW, fy + h / 2, A.z));
    // Gently arched top and a lattice of cross bars.
    const span = A.halfW * 2 + 0.06, sag = 0.08, R = (span * span / 4 + sag * sag) / (2 * sag);
    const ang = Math.asin(span / 2 / R);
    for (const dz of [-0.035, 0.035]) {
      const arc = new THREE.TorusGeometry(R, 0.018, 6, 32, ang * 2);
      b.add(arc, whitePaint, T(A.x, A.top + 0.02 - (R - sag), A.z + dz, 0, 0, Math.PI / 2 - ang));
    }
    for (let i = 0; i <= 6; i++) {
      const x = A.x - A.halfW + i / 6 * A.halfW * 2;
      const y = A.top + 0.02 + Math.sqrt(Math.max(0, R * R - (x - A.x) ** 2)) - (R - sag);
      b.add(new THREE.BoxGeometry(0.02, 0.02, 0.11), whitePaint, T(x, y, A.z));
    }
    for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) b.add(new THREE.BoxGeometry(0.018, 0.018, 0.1), whitePaint, T(A.x + sx * A.halfW, fy + 0.25 + k * 0.28, A.z));
    // Climbing rose: leaves up the posts and over the top, blooms.
    const pts = [], blooms = [];
    const n = Math.round(420 * q);
    for (let i = 0; i < n; i++) {
      const onTop = rnd() < 0.45;
      let x, y;
      if (onTop) { x = A.x + (rnd() * 2 - 1) * A.halfW; y = A.top + 0.03 + Math.sqrt(Math.max(0, R * R - (x - A.x) ** 2)) - (R - sag) + (rnd() - 0.3) * 0.08; }
      else { x = A.x + (rnd() < 0.5 ? -1 : 1) * A.halfW + (rnd() - 0.5) * 0.12; y = fy + 0.1 + Math.pow(rnd(), 0.7) * (h - 0.1); }
      const z = A.z + (rnd() - 0.5) * 0.16;
      pts.push([x, y, z, (rnd() - 0.5), rnd() * 0.5, (rnd() - 0.5)]);
      if (rnd() < 0.12) blooms.push([x + (rnd() - 0.5) * 0.04, y + 0.02, z + (rnd() - 0.5) * 0.06]);
    }
    leafGroups.push(leafCards(scene, grass.uniforms, pts, { size: 0.085, hue: 108, light: 0.9, cast: shadows && tier === 'high', shadows }));
    const rose = [0xd94f6e, 0xf0a5b5, 0xc23a55];
    for (const [x, y, z] of blooms) b.add(blobGeometry(0.015, 1, x * 9, 0.3), foliage, T(x, y, z, rnd() * 6, 0, 0, 1, 0.7, 1), rose[Math.floor(rnd() * 3)], decor);
  }

  // ---------------------------------------------------------------- bird bath, stump, bench, pots
  {
    const B = BIRDBATH;
    const p = [V2(0.0001, 0), V2(0.16, 0), V2(0.16, 0.04), V2(0.1, 0.06), V2(B.stemR, 0.12), V2(B.stemR * 0.8, (B.top - fy) * 0.55), V2(B.stemR, B.top - fy - 0.08),
      V2(B.r * 0.6, B.top - fy - 0.05), V2(B.r, B.top - fy - 0.01), V2(B.r - 0.02, B.top - fy), V2(B.r * 0.85, B.top - fy - 0.035), V2(0.0001, B.top - fy - 0.04)];
    b.add(new THREE.LatheGeometry(p, 40), stone, T(B.x, fy, B.z), 0xd0c9b8);
    // Its water is a live liquid surface (View.birdbath), so the rotor wash ripples and sprays it.
    // Tree stump with roots and a ringed top.
    const S = STUMP, sh = S.top - fy;
    b.add(new THREE.CylinderGeometry(S.r, S.r * 1.15, sh, 24, 3), bark, T(S.x, fy + sh / 2, S.z), 0xffffff);
    for (let k = 0; k < 5; k++) {
      const a = k / 5 * Math.PI * 2 + 0.4;
      b.add(new THREE.ConeGeometry(0.06, 0.28, 8), bark, T(S.x + Math.cos(a) * S.r * 1.05, fy + 0.04, S.z + Math.sin(a) * S.r * 1.05, -a, 0, Math.PI / 2 + 0.35), 0xddd3c4);
    }
    const ringTop = new THREE.Mesh(new THREE.CircleGeometry(S.r * 0.98, 32), new THREE.MeshStandardMaterial({ map: ringTexture(), roughness: 0.9 }));
    ringTop.rotation.x = -Math.PI / 2;
    ringTop.position.set(S.x, S.top + 0.0008, S.z);
    ringTop.receiveShadow = true;
    scene.add(ringTop);
    // Bench: teak slats on cast-iron ends.
    const N = BENCH;
    for (let i = 0; i < 5; i++) b.add(boxUV(N.halfX * 2, 0.025, N.halfZ * 2 / 5 - 0.008, 1), teak, T(N.x, N.seat - 0.0125, N.z - N.halfZ + (i + 0.5) * N.halfZ * 2 / 5), shade(rnd, 0.85, 1.0));
    for (let i = 0; i < 3; i++) b.add(boxUV(N.halfX * 2, 0.07, 0.022, 1), teak, T(N.x, N.seat + 0.1 + i * 0.1, N.z - N.halfZ + 0.02, 0, -0.18), shade(rnd, 0.85, 1.0));
    for (const sx of [-1, 1]) {
      const x = N.x + sx * (N.halfX + 0.02);
      b.add(new THREE.BoxGeometry(0.03, N.seat - fy, 0.05), iron, T(x, (N.seat + fy) / 2, N.z + N.halfZ - 0.04));
      b.add(new THREE.BoxGeometry(0.03, N.backTop - fy, 0.05), iron, T(x, (N.backTop + fy) / 2, N.z - N.halfZ + 0.03, 0, -0.1));
      b.add(new THREE.BoxGeometry(0.035, 0.03, N.halfZ * 2 + 0.06), iron, T(x, N.seat + 0.12, N.z));
      b.add(new THREE.BoxGeometry(0.03, 0.03, N.halfZ * 2), iron, T(x, N.seat - 0.05, N.z));
    }
    // Patio pots: terracotta with herbs.
    const herbs = [];
    for (const [x, z, r, h] of POTS) {
      const pp = [V2(0.0001, 0), V2(r * 0.75, 0), V2(r * 0.95, h * 0.85), V2(r * 1.05, h * 0.86), V2(r * 1.05, h), V2(r * 0.92, h), V2(r * 0.9, h * 0.92), V2(0.0001, h * 0.92)];
      b.add(new THREE.LatheGeometry(pp, 28), terracotta, T(x, fy, z), shade(rnd, 0.9, 1.05));
      b.add(new THREE.CircleGeometry(r * 0.9, 20), soil, T(x, fy + h * 0.92, z, 0, -Math.PI / 2));
      b.add(blobGeometry(r * 0.75, 1, x, 0.25), leafy, T(x, fy + h + r * 0.25, z, 0, 0, 0, 1, 0.8, 1), 0xb0c0a0, decor);
      for (let k = 0; k < Math.round(70 * q + 20); k++) {
        _v.set(rnd() * 2 - 1, rnd() * 0.9 + 0.1, rnd() * 2 - 1).normalize();
        herbs.push([x + _v.x * r * 0.85, fy + h + r * 0.2 + _v.y * r * 0.7, z + _v.z * r * 0.85, _v.x, _v.y, _v.z]);
      }
    }
    leafGroups.push(leafCards(scene, grass.uniforms, herbs, { size: 0.07, hue: 110, light: 0.95, cast: false, shadows }));
  }

  // ---------------------------------------------------------------- apple tree
  {
    const R = TREE;
    const trunk = new THREE.CatmullRomCurve3([new THREE.Vector3(R.x, fy - 0.02, R.z), new THREE.Vector3(R.x + 0.03, fy + 0.4, R.z - 0.02), new THREE.Vector3(R.x - 0.02, R.trunkTop * 0.5 + fy * 0.5 + 0.2, R.z + 0.02), new THREE.Vector3(R.x + 0.02, R.trunkTop + 0.2, R.z)]);
    b.add(taperTube(trunk, R.trunkR * 1.25, R.trunkR * 0.6, 14, 12), bark, null, 0xffffff);
    const branchEnds = R.canopy.map(([dx, y, dz, r]) => new THREE.Vector3(R.x + dx * 1.2, y + r * 0.1, R.z + dz * 1.2));
    for (const e of branchEnds) {
      const s = new THREE.Vector3(R.x + 0.01, R.trunkTop - 0.1, R.z);
      const m = s.clone().lerp(e, 0.5).add(new THREE.Vector3(0, 0.12, 0));
      b.add(taperTube(new THREE.QuadraticBezierCurve3(s, m, e), 0.045, 0.012, 10, 8), bark, null, 0xffffff);
    }
    const pts = [];
    const n = Math.round(2200 * q);
    for (let i = 0; i < n; i++) {
      const [dx, y, dz, r] = R.canopy[Math.floor(rnd() * R.canopy.length)];
      _v.set(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1).normalize();
      const rr = r * Math.pow(rnd(), 0.35);
      pts.push([R.x + dx + _v.x * rr, y + _v.y * rr * 0.85, R.z + dz + _v.z * rr, _v.x, _v.y + 0.3, _v.z]);
    }
    leafGroups.push(leafCards(scene, grass.uniforms, pts, { size: 0.2, hue: 100, light: 1, cast: shadows, shadows }));
    const appleGlaze = glazeMaterial(0xffffff, { roughness: 0.45, extra: { clearcoat: 0.3 } }); // one material: one draw for every apple
    for (let i = 0; i < Math.round(28 * q + 6); i++) {
      const [dx, y, dz, r] = R.canopy[Math.floor(rnd() * R.canopy.length)];
      _v.set(rnd() * 2 - 1, -rnd(), rnd() * 2 - 1).normalize();
      b.add(new THREE.SphereGeometry(0.035, 12, 9), appleGlaze, T(R.x + dx + _v.x * r * 0.9, y + _v.y * r * 0.8, R.z + dz + _v.z * r * 0.9), rnd() < 0.7 ? 0xb3261e : 0x9fb53a, decor);
    }
  }

  // ---------------------------------------------------------------- beyond the fence: neighbours' trees
  if (tier !== 'low') {
    const n = Math.round(14 * q + 4);
    for (let i = 0; i < n; i++) {
      const side = i % 3;
      let x, z;
      if (side === 0) { x = GARDEN.minX - 0.5 + rnd() * (GARDEN.maxX - GARDEN.minX + 1); z = GARDEN.minZ - 1.2 - rnd() * 4; }
      else if (side === 1) { x = GARDEN.minX - 1.0 - rnd() * 3; z = GARDEN.maxZ - rnd() * 5.5; }
      else { x = GARDEN.maxX + 1.0 + rnd() * 3; z = GARDEN.maxZ - rnd() * 5.5; }
      const hgt = 2.2 + rnd() * 3;
      b.add(new THREE.CylinderGeometry(0.06, 0.12, hgt, 8), bark, T(x, fy + hgt / 2, z), 0x998877, { cast: false, receive: false });
      const k = 2 + Math.floor(rnd() * 3);
      for (let j = 0; j < k; j++) {
        const r = 0.7 + rnd() * 0.9;
        b.add(blobGeometry(r, 2, i * 3 + j, 0.2), leafy, T(x + (rnd() - 0.5) * 0.8, fy + hgt + (rnd() - 0.3) * 0.9, z + (rnd() - 0.5) * 0.8), [0x8a9a80, 0xa0b090, 0x7e8c74, 0xb0b89a][(i + j) % 4], { cast: false, receive: false });
      }
    }
  }

  b.build(scene);
  const charm = sim ? buildCharm(scene, quality, kitchen, sim) : null;
  const detail = buildDetail(scene, quality);

  // ---------------------------------------------------------------- per-frame
  const wind = grass.uniforms;
  const wakeSm = [new THREE.Vector4(), new THREE.Vector4()];
  const hubU = [wind.uHub0.value, wind.uHub1.value];
  let t = 0;
  const sun = kitchen.sun;
  const sunOff = sun.position.clone().sub(sun.target.position);
  const texel = (sun.shadow.camera.right - sun.shadow.camera.left) / sun.shadow.mapSize.x;
  const centre = new THREE.Vector3();
  const tableShadow = sun.target.position.clone();
  return {
    grass,
    charm,
    update(dt, focus, camera, sim) {
      t += dt;
      if (charm) charm.update(dt, sim, camera);
      if (kitchen.cloth) kitchen.cloth.update(dt, sim);
      detail.update(dt, sim, grass.uniforms.uBreeze.value);
      wind.uTime.value = t;
      // Breeze slowly veers and freshens.
      const bd = 0.6 + 0.35 * Math.sin(t * 0.05);
      wind.uBreeze.value.set(Math.cos(bd), Math.sin(bd), 0.55 + 0.2 * Math.sin(t * 0.13 + 1), 0.65);
      // Rotor wakes on the lawn: grass leans with a little lag and springs back slower than it flattens.
      const air = sim && sim.air;
      for (let i = 0; i < 2; i++) {
        const wk = air ? air.wakes[i] : null;
        const onLawn = wk && wk.active && wk.vg > 0 && wk.hit.y < fy + 0.08;
        const s = wakeSm[i];
        if (onLawn) {
          if (s.z < 0.05) s.set(wk.hit.x, wk.hit.z, s.z, wk.footR);
          const k = 1 - Math.exp(-dt * 12);
          s.x += (wk.hit.x - s.x) * k; s.y += (wk.hit.z - s.y) * k; s.w += (wk.footR - s.w) * k;
          s.z += (wk.vg - s.z) * (1 - Math.exp(-dt * 6));
        } else s.z += (0 - s.z) * (1 - Math.exp(-dt * 2.5));
        (i ? wind.uWake1 : wind.uWake0).value.copy(s);
        if (wk && wk.active) hubU[i].set(wk.hub.x, wk.hub.y, wk.hub.z, wk.vi); else hubU[i].w = 0;
      }
      // Dense grass around the camera and what it's looking at.
      centre.copy(camera.position).lerp(focus, 0.6);
      grass.update(centre, camera);
      // The sun's shadow map follows the action (snapped to texels to stop shimmering). Over the kitchen
      // table it stays framed on the table exactly as before.
      const away = Math.max(Math.abs(focus.x) - TABLE.halfX, Math.abs(focus.z - 0.05) - TABLE.halfZ, 0);
      _c.copy(tableShadow).lerp(focus, THREE.MathUtils.smoothstep(away, 0.1, 0.6));
      _c.x = Math.round(_c.x / texel) * texel; _c.z = Math.round(_c.z / texel) * texel; _c.y = Math.round(_c.y / texel) * texel;
      sun.target.position.copy(_c);
      sun.position.copy(_c).add(sunOff);
      sun.target.updateMatrixWorld();
    },
  };
}

// Leaf cards (alpha-tested quads) that sway in the breeze and thrash in rotor wash.
function leafCards(scene, wind, pts, { size, hue, light = 1, cast = false, shadows = true }) {
  const tex = leafTexture(256, hue);
  const mat = new THREE.MeshLambertMaterial({ map: tex, alphaTest: 0.45, side: THREE.DoubleSide, color: new THREE.Color(light, light, light) });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, wind);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        ${WIND_GLSL}
        vec3 hubShake(vec4 hub, vec3 p, float ph){
          if (hub.w <= 0.0) return vec3(0.0);
          vec2 d = p.xz - hub.xz; float r = length(d); float below = hub.y - p.y;
          if (r > 0.35 || below < -0.08 || below > 1.0) return vec3(0.0);
          float k = hub.w * (1.0 - r / 0.35) * (1.0 - max(below, 0.0));
          return vec3(sin(uTime * 31.0 + ph) * 0.006, -0.012 + sin(uTime * 23.0 + ph * 1.3) * 0.006, cos(uTime * 29.0 + ph) * 0.006) * k;
        }`)
      .replace('#include <project_vertex>', `
        vec4 mvPosition = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          mvPosition = instanceMatrix * mvPosition;
          vec3 io = instanceMatrix[3].xyz;
        #else
          vec3 io = vec3(0.0);
        #endif
        vec3 wp = (modelMatrix * mvPosition).xyz;
        float ph = gHash12(io.xz * 13.0) * 6.28;
        float press; vec2 wv = gWind(io.xz, press);
        float s = length(wv);
        wp += vec3(wv.x, 0.0, wv.y) * 0.004 + vec3(sin(uTime * (3.0 + s * 3.0) + ph), sin(uTime * 4.1 + ph * 1.7) * 0.6, cos(uTime * (2.6 + s * 3.0) + ph)) * (0.002 + 0.003 * s);
        wp += hubShake(uHub0, io, ph) + hubShake(uHub1, io, ph);
        mvPosition = viewMatrix * vec4(wp, 1.0);
        gl_Position = projectionMatrix * mvPosition;`);
  };
  mat.customProgramCacheKey = () => 'leafcards';
  const geo = new THREE.PlaneGeometry(size, size);
  const mesh = new THREE.InstancedMesh(geo, mat, pts.length);
  const o = new THREE.Object3D();
  const r = mulberry(pts.length + hue);
  const col = new THREE.Color();
  pts.forEach(([x, y, z, nx, ny, nz], i) => {
    o.position.set(x, y, z);
    o.lookAt(x + nx + (r() - 0.5) * 1.2, y + ny + (r() - 0.5) * 1.2, z + nz + (r() - 0.5) * 1.2);
    o.rotateZ(r() * Math.PI * 2);
    const s = 0.75 + r() * 0.5;
    o.scale.set(s, s, s);
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
    col.setHSL(0.25 + (r() - 0.5) * 0.05, 0.3 + r() * 0.2, 0.42 + r() * 0.18);
    mesh.setColorAt(i, col.multiplyScalar(1.6));
  });
  mesh.castShadow = cast;
  mesh.receiveShadow = shadows;
  mesh.userData.noAO = true;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

function skyDome(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: sunDir } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w * 0.9999; }`,
    fragmentShader: `
      varying vec3 vDir; uniform vec3 uSun;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), u.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), u.x), u.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ s += a * n(p); p *= 2.03; a *= 0.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 zen = vec3(0.36, 0.55, 0.82), hor = vec3(0.89, 0.88, 0.83);
        vec3 col = mix(hor, zen, pow(y, 0.55));
        float sd = max(dot(d, normalize(uSun)), 0.0);
        col += vec3(1.0, 0.86, 0.62) * (pow(sd, 6.0) * 0.25 + pow(sd, 120.0) * 0.6) + vec3(1.0, 0.95, 0.85) * pow(sd, 2000.0) * 4.0;
        if (d.y > 0.02) {
          vec2 uv = d.xz / (d.y + 0.15) * 1.6;
          float c = smoothstep(0.5, 0.78, fbm(uv + vec2(3.0, 1.0)));
          col = mix(col, vec3(1.0, 0.98, 0.95) * (0.92 + 0.12 * sd), c * 0.75 * smoothstep(0.02, 0.25, d.y));
        }
        if (d.y < 0.0) col = mix(hor, vec3(0.42, 0.5, 0.36), clamp(-d.y * 4.0, 0.0, 1.0));
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(40, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  m.userData.noAO = true;
  m.onBeforeRender = (r, s, cam) => { m.position.copy(cam.position); m.updateMatrixWorld(); };
  return m;
}

function ringTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d');
  const n = makeNoise(7);
  const img = ctx.createImageData(256, 256);
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const dx = x - 128, dy = y - 128, r = Math.hypot(dx, dy) / 128;
    const ring = 0.5 + 0.5 * Math.sin(r * 60 + n(x / 18, y / 18) * 3);
    const g = 0.7 + 0.2 * ring - (r > 0.92 ? 0.35 : 0);
    const i = (y * 256 + x) * 4;
    img.data[i] = 176 * g; img.data[i + 1] = 140 * g; img.data[i + 2] = 98 * g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function taperTube(curve, r0, r1, seg, radial) {
  const g = new THREE.TubeGeometry(curve, seg, 1, radial, false);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  // Scale each ring about its centre point on the curve.
  for (let i = 0; i <= seg; i++) {
    const c = curve.getPointAt(i / seg);
    const r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(c).multiplyScalar(r).add(c);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

// Static groups (the garden's tea stand and teapot) go into the batches: a few draw calls instead of a dozen.
function bakeGroup(b, group) {
  group.updateMatrixWorld(true);
  group.traverse((o) => { if (o.isMesh) b.add(o.geometry, o.material, o.matrixWorld); });
}

function shade(rnd, a, b) { const k = a + (b - a) * rnd(); return new THREE.Color(k, k, k).getHex(); }
function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s += 0x6D2B79F5; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
