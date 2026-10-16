import * as THREE from 'three';
import { HELI_PARTS } from '../sim/helicopter.js';
import { CFG } from '../config.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { exteriorCabin } from './exteriorCabin.js';

// A deliberately serious, scale-model-accurate light utility helicopter (single turbine, two-blade
// teetering rotor, skid gear) built procedurally: lofted superellipse fuselage with real glazing,
// engine fairing with intakes and exhausts, tapered boom, stabiliser with endplates, swept fin,
// tail rotor, arched cross-tube skids, rotor head with swashplate and pitch links, a pilot inside,
// panel lines, rivets and a navy/white/red livery. Parts are grouped by HELI_PARTS for debris.

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- textures
function liveryTextures() {
  const W = 1024, Hh = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  const b = document.createElement('canvas'); b.width = W; b.height = Hh;
  const bg = b.getContext('2d');
  bg.fillStyle = '#808080'; bg.fillRect(0, 0, W, Hh);
  // u: around the section (0.25 = bottom, 0.75 = top); v: nose (0) -> tail (1).
  const img = g.createImageData(W, Hh);
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const a = (x / W - 0.5) * Math.PI * 2;
      const s = Math.sin(a);
      let col;
      if (s > 0.26) col = [238, 238, 234];          // white upper
      else if (s > 0.16) col = [196, 38, 42];       // red cheat line
      else if (s > 0.12) col = [238, 238, 234];
      else col = [24, 38, 62];                      // navy lower
      const i = (y * W + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  // Panel lines and rivets (also into the bump map).
  const line = (x0, y0, x1, y1, w = 2) => {
    for (const [ctx, col] of [[g, 'rgba(0,0,0,0.35)'], [bg, '#3a3a3a']]) {
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  };
  const rivets = (x0, y0, x1, y1, n) => {
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, 2, 2);
      bg.fillStyle = '#9a9a9a'; bg.fillRect(x, y, 2, 2);
    }
  };
  // Door outlines on both sides (u around 0.5 +/- for right, 0 / 1 for left).
  for (const uc of [0.5, 0.0, 1.0]) {
    const cx = uc * W;
    for (const [v0, v1] of [[0.30, 0.52], [0.53, 0.72]]) {
      const y0 = v0 * Hh, y1 = v1 * Hh;
      line(cx - 120, y0, cx + 90, y0); line(cx - 120, y1, cx + 90, y1);
      line(cx - 120, y0, cx - 120, y1); line(cx + 90, y0, cx + 90, y1);
      // handle
      g.fillStyle = 'rgba(200,200,205,0.9)'; g.fillRect(cx - 30, y1 - 22, 18, 5);
    }
  }
  for (const v of [0.12, 0.3, 0.74, 0.88]) { line(0, v * Hh, W, v * Hh, 1.5); rivets(0, v * Hh + 5, W, v * Hh + 5, 120); }
  // Belly access panels.
  for (const v of [0.4, 0.6]) { line(W * 0.18, v * Hh, W * 0.32, v * Hh); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const bump = new THREE.CanvasTexture(b); bump.anisotropy = 8;
  return { map, bump };
}

// Registration decal for the boom (transparent background).
function boomTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 80;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 80);
  g.fillStyle = '#18263e'; g.font = 'bold 64px "Arial Narrow", Arial, sans-serif'; g.textAlign = 'center'; g.fillText('VH-TEA', 256, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- geometry helpers
// Superellipse section; separate exponents above and below the waterline give a flat floor.
export function sectionPoint(sec, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const nT = sec.nTop ?? 2.4, nB = sec.nBot ?? 3.6;
  const n = s >= 0 ? nT : nB;
  const x = sec.hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const mid = (sec.yt + sec.yb) / 2, hh = (sec.yt - sec.yb) / 2;
  const y = mid + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
  return [x, y];
}

// Loft through sections (sorted along z). classify(a, z) -> material group index.
export function loft(sections, segs, steps, classify, groupsN = 1) {
  const zs = sections.map((s) => s.z);
  const z0 = zs[0], z1 = zs[zs.length - 1];
  // Catmull-Rom interpolate section params along z for smoothness.
  const keys = ['hw', 'yb', 'yt', 'nTop', 'nBot'];
  const sample = (t) => {
    const z = z0 + (z1 - z0) * t;
    let i = 0;
    while (i < sections.length - 2 && zs[i + 1] < z) i++;
    const p0 = sections[Math.max(0, i - 1)], p1 = sections[i], p2 = sections[i + 1], p3 = sections[Math.min(sections.length - 1, i + 2)];
    const u = (z - p1.z) / (p2.z - p1.z || 1);
    const out = { z };
    for (const k of keys) {
      const a = p0[k] ?? (k === 'nTop' ? 2.4 : 3.6), b = p1[k] ?? a, c = p2[k] ?? b, d = p3[k] ?? c;
      out[k] = 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    }
    out.hw = Math.max(out.hw, 0.0004);
    return out;
  };
  const pos = [], uv = [];
  for (let j = 0; j <= steps; j++) {
    const t = j / steps;
    const sec = sample(t);
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs - 0.5) * Math.PI * 2;
      const [x, y] = sectionPoint(sec, a);
      pos.push(x, y, sec.z);
      uv.push(i / segs, t);
    }
  }
  const idx = Array.from({ length: groupsN }, () => []);
  for (let j = 0; j < steps; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
    const am = ((i + 0.5) / segs - 0.5) * Math.PI * 2;
    const zm = z0 + (z1 - z0) * (j + 0.5) / steps;
    const gi = classify ? classify(am, zm) : 0;
    idx[gi].push(a, b, c, b, d, c);
  }
  // Caps.
  const capFor = (j, flip) => {
    const ci = pos.length / 3;
    const sec = sample(j / steps);
    pos.push(0, (sec.yt + sec.yb) / 2, sec.z); uv.push(0.5, j / steps);
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1;
      if (flip) idx[0].push(ci, b, a); else idx[0].push(ci, a, b);
    }
  };
  capFor(0, false); capFor(steps, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const all = [];
  let start = 0;
  idx.forEach((l, k) => { all.push(...l); g.addGroup(start, l.length, k); start += l.length; });
  g.setIndex(all);
  g.computeVertexNormals();
  return g;
}

function tube(points, r, segs = 24, radial = 8) {
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segs, r, radial, false);
}

function airfoilPlate(span, chord, thick, taper = 1, sweep = 0) {
  const s = new THREE.Shape();
  s.moveTo(0, -chord / 2);
  s.lineTo(span, -chord * taper / 2 + sweep);
  s.quadraticCurveTo(span + chord * 0.15, sweep, span, chord * taper / 2 + sweep);
  s.lineTo(0, chord / 2);
  s.quadraticCurveTo(-chord * 0.1, 0, 0, -chord / 2);
  const g = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: thick * 0.45, bevelSize: thick * 0.45, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -thick / 2);
  return g;
}

// ---------------------------------------------------------------- cabin shell
export const CABIN_SECS = [
  { z: -0.0635, hw: 0.0015, yb: -0.010, yt: -0.004 },
  { z: -0.060, hw: 0.0085, yb: -0.019, yt: 0.004 },
  { z: -0.054, hw: 0.0135, yb: -0.024, yt: 0.012 },
  { z: -0.046, hw: 0.0163, yb: -0.027, yt: 0.019 },
  { z: -0.034, hw: 0.0180, yb: -0.0285, yt: 0.0245 },
  { z: -0.018, hw: 0.0187, yb: -0.029, yt: 0.0275 },
  { z: 0.002, hw: 0.0186, yb: -0.029, yt: 0.0285 },
  { z: 0.018, hw: 0.0178, yb: -0.0275, yt: 0.028 },
  { z: 0.030, hw: 0.0155, yb: -0.023, yt: 0.0265 },
  { z: 0.042, hw: 0.0110, yb: -0.014, yt: 0.022, nBot: 2.6 },
  { z: 0.052, hw: 0.0072, yb: -0.004, yt: 0.017, nBot: 2.2, nTop: 2.2 },
];
const glassAt = (a, z) => {
  const s = Math.sin(a), c = Math.cos(a);
  if (z < -0.059) return 0;
  // windscreen and roof transparency
  if (z < -0.022 && s > 0.02) return 1;
  // chin windows
  if (z < -0.044 && z > -0.0585 && s < -0.22 && s > -0.72 && Math.abs(c) > 0.3) return 1;
  // side door windows (front and rear doors), leaving a frame
  if (s > 0.12 && s < 0.84 && Math.abs(c) > 0.45) {
    if ((z > -0.017 && z < -0.001) || (z > 0.002 && z < 0.020)) return 1;
  }
  return 0;
};

// The cabin shell (group 0 painted, group 1 glazing). Shared with the first-person cockpit, so its
// window openings line up exactly with the outside of the aircraft.
export function cabinShellGeometry(hi = true, classify = glassAt) {
  return loft(CABIN_SECS, hi ? 72 : 44, hi ? 64 : 36, (a, z) => classify(a, z, glassAt), 2);
}

// ---------------------------------------------------------------- materials
export function heliMaterials() {
  const { map, bump } = liveryTextures();
  return {
    paint: new THREE.MeshPhysicalMaterial({ map, bumpMap: bump, bumpScale: 0.6, roughness: 0.32, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.05 }),
    boom: new THREE.MeshPhysicalMaterial({ map: boomTexture(), roughness: 0.34, metalness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xeeeeea, roughness: 0.3, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 }),
    navy: new THREE.MeshPhysicalMaterial({ color: 0x18263e, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.06 }),
    red: new THREE.MeshPhysicalMaterial({ color: 0xc4262a, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.06 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x4f6a72, roughness: 0.02, metalness: 0.25, transparent: true, opacity: 0.55, envMapIntensity: 2.6, clearcoat: 1, clearcoatRoughness: 0.0, side: THREE.DoubleSide, depthWrite: false }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.28, metalness: 0.95 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.45, metalness: 0.7 }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x4b3a33, roughness: 0.55, metalness: 0.85, emissive: 0x220800, emissiveIntensity: 0.6 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x2b2d33, roughness: 0.5, metalness: 0.25 }),
    bladeTip: new THREE.MeshStandardMaterial({ color: 0xe9e9e4, roughness: 0.4 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x3a3a3e, roughness: 0.8 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.7 }),
    flight: new THREE.MeshStandardMaterial({ color: 0x4a5a3a, roughness: 0.8 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xf2f2ee, roughness: 0.25, clearcoat: 1 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.6, clearcoat: 1 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd4a548, roughness: 0.3, metalness: 1.0 }),
    navRed: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    navGreen: new THREE.MeshBasicMaterial({ color: 0x2aff6a }),
    navWhite: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    beacon: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a0a, emissiveIntensity: 0 }),
  };
}

// ---------------------------------------------------------------- model
export function buildRealisticHelicopter(quality = { name: 'high' }) {
  const hi = (quality.name === 'high' || quality.name === 'ultra');
  const M = heliMaterials();
  const root = new THREE.Group();
  root.name = 'heli';
  const parts = {};
  for (const p of HELI_PARTS) {
    const g = new THREE.Group();
    g.position.set(p.pos[0], p.pos[1], p.pos[2]);
    g.name = p.name;
    parts[p.name] = g;
  }
  // Add a mesh positioned in body coordinates to a part.
  const add = (part, mesh, x = 0, y = 0, z = 0) => {
    const P = HELI_PARTS.find((q) => q.name === part);
    mesh.position.set(x - P.pos[0], y - P.pos[1], z - P.pos[2]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parts[part].add(mesh);
    return mesh;
  };

  // ---- Cabin: lofted fuselage with glazing (group 1).
  // Paint and glazing share one lofted geometry but are separate meshes, so the glass can be excluded
  // from ambient occlusion and drawn after the interior.
  const cabinGeo = cabinShellGeometry(hi);
  const skip = new THREE.MeshBasicMaterial({ visible: false });
  add('fuselage', new THREE.Mesh(cabinGeo, [M.paint, skip]));
  // Cabin lining: the inside of the painted shell, so the windows show an interior, not the outdoors.
  const lining = add('fuselage', new THREE.Mesh(cabinGeo, [new THREE.MeshStandardMaterial({ color: 0x2e3033, roughness: 0.9, side: THREE.BackSide }), skip]));
  lining.scale.setScalar(0.985);
  lining.castShadow = false;
  const glazing = add('fuselage', new THREE.Mesh(cabinGeo, [skip, M.glass]));
  glazing.castShadow = false;
  glazing.renderOrder = 2;

  // Engine and transmission fairing on the cabin roof.
  const fairSecs = [
    { z: -0.016, hw: 0.004, yb: 0.020, yt: 0.026, nTop: 2.2 },
    { z: -0.010, hw: 0.0105, yb: 0.020, yt: 0.035 },
    { z: 0.004, hw: 0.0122, yb: 0.020, yt: 0.040 },
    { z: 0.024, hw: 0.0118, yb: 0.020, yt: 0.041 },
    { z: 0.040, hw: 0.0090, yb: 0.018, yt: 0.037 },
    { z: 0.052, hw: 0.0050, yb: 0.016, yt: 0.029 },
  ];
  add('fuselage', new THREE.Mesh(loft(fairSecs, hi ? 40 : 24, hi ? 24 : 14), M.white));
  // Intake grilles and exhausts.
  for (const sx of [-1, 1]) {
    const grill = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0075, 0.012), M.darkMetal);
    add('fuselage', grill, sx * 0.0122, 0.031, 0.006);
    for (let k = 0; k < 4; k++) add('fuselage', new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.0006, 0.0115), M.alu), sx * 0.0128, 0.0285 + k * 0.0018, 0.006);
    const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.0019, 0.0023, 0.006, 16), M.exhaust);
    ex.rotation.set(-0.35, 0, sx * 0.4);
    add('fuselage', ex, sx * 0.0055, 0.037, 0.043);
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.0019, 0.00035, 6, 16), M.darkMetal);
    lip.rotation.set(Math.PI / 2 - 0.35, 0, sx * 0.4);
    add('fuselage', lip, sx * 0.0067, 0.0397, 0.0421);
  }
  // Mast fairing collar.
  add('fuselage', new THREE.Mesh(new THREE.CylinderGeometry(0.0048, 0.0062, 0.004, 20), M.white), 0, 0.042, 0.0);
  // Windscreen centre post, wipers, pitot tube, antennas, steps, door handles, landing light.
  for (const sx of [-1, 1]) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0008, 0.008), M.alu);
    add('fuselage', step, sx * 0.0205, -0.026, -0.006);
  }
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.00035, 0.00035, 0.006, 6), M.alu);
  pitot.rotation.x = Math.PI / 2;
  add('fuselage', pitot, 0, -0.012, -0.064);
  const antenna = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.009, 0.004), M.darkMetal);
  antenna.rotation.x = 0.3;
  add('fuselage', antenna, 0, -0.033, 0.01);
  add('fuselage', new THREE.Mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0012, 16), M.navWhite), 0, -0.0275, -0.044);
  // Rotating beacon on the fairing.
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.0018, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.beacon);
  add('fuselage', beacon, 0, 0.0405, 0.03);
  // Cargo hook on a short pendant below the belly.
  add('fuselage', new THREE.Mesh(new THREE.CylinderGeometry(0.00055, 0.00055, 0.016, 6), M.darkMetal), 0, CFG.heli.hookOffset[1] + 0.012, CFG.heli.hookOffset[2]);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.0026, 0.0007, 8, 16, Math.PI * 1.6), M.brass);
  hook.rotation.set(0, Math.PI / 2, Math.PI * 0.7);
  add('fuselage', hook, 0, CFG.heli.hookOffset[1] + 0.003, CFG.heli.hookOffset[2]);

  // Interior seen through the glass: floor, seats, the pilot and the panel (render/exteriorCabin.js).
  add('fuselage', new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.001, 0.07), M.interior), 0, -0.0251, -0.02);
  add('fuselage', exteriorCabin('micro'));
  // Door handles (chrome levers at each door's trailing edge) and hinge blocks on the leading edges.
  for (const sx of [-1, 1]) {
    for (const [zh, zf] of [[-0.0042, -0.0172], [0.0168, 0.0016]]) {
      add('fuselage', new THREE.Mesh(new THREE.BoxGeometry(0.0007, 0.0007, 0.0036), M.alu), sx * 0.0191, -0.0055, zh - 0.0016);
      for (const y of [0.006, -0.016]) add('fuselage', new THREE.Mesh(new THREE.BoxGeometry(0.0009, 0.0018, 0.0012), M.darkMetal), sx * 0.0189, y, zf);
    }
  }
  // Tail cone: a white collar faired from the cabin into the boom (no open tube end at the joint).
  {
    const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.0062, 0.0079, 0.016, 28), M.white);
    cone.rotation.x = Math.PI / 2 - 0.055;
    add('fuselage', cone, 0, 0.0094, 0.052);
  }

  // ---- Tail boom: tapered, with driveshaft cover, strobe, and registration.
  {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.0031, 0.0066, 0.108, 28, 1, true), M.white);
    add('tailBoom', boom, 0, 0.0095, 0.098);
    boom.rotation.set(Math.PI / 2 - 0.055, 0, 0);
    const keel = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0067, 0.106, 28, 1, true, Math.PI * 0.6, Math.PI * 0.8), M.navy);
    keel.scale.set(1.01, 1, 1.01);
    add('tailBoom', keel, 0, 0.0095, 0.098);
    keel.rotation.set(Math.PI / 2 - 0.055, 0, 0);
    for (const sx of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.0003, 0.0008, 0.104), M.red);
      stripe.rotation.set(-0.055, sx * 0.032, 0);
      add('tailBoom', stripe, sx * 0.0049, 0.0095, 0.098);
      const reg = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.0045), new THREE.MeshPhysicalMaterial({ map: M.boom.map, transparent: true, roughness: 0.3, clearcoat: 1 }));
      reg.rotation.y = sx * Math.PI / 2;
      add('tailBoom', reg, sx * 0.0057, 0.0105, 0.074);
    }
    const cover = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.0018, 0.1), M.white);
    cover.rotation.x = -0.055;
    add('tailBoom', cover, 0, 0.0145, 0.098);
    // Horizontal stabiliser with endplate fins and nav lights.
    for (const sx of [-1, 1]) {
      const half = new THREE.Mesh(airfoilPlate(0.021, 0.0095, 0.0011, 0.85, 0.001), M.white);
      half.rotation.set(Math.PI / 2, 0, 0);
      if (sx < 0) half.rotation.y = Math.PI;
      add('tailBoom', half, sx * 0.003, 0.011, 0.113);
      const plate = new THREE.Mesh(airfoilPlate(0.009, 0.008, 0.0009, 0.8, 0.002), M.navy);
      plate.rotation.set(0, Math.PI / 2, Math.PI / 2);
      add('tailBoom', plate, sx * 0.024, 0.0075, 0.114);
      add('tailBoom', new THREE.Mesh(new THREE.SphereGeometry(0.0009, 8, 6), sx < 0 ? M.navRed : M.navGreen), sx * 0.0245, 0.0125, 0.109);
    }
  }
  // ---- Tail: swept fin (upper and ventral), skid guard, tail rotor gearbox and rotor.
  const tailRotor = new THREE.Group();
  {
    const finS = new THREE.Shape();
    finS.moveTo(0, 0); finS.lineTo(0.016, 0.0); finS.lineTo(0.026, 0.03); finS.lineTo(0.019, 0.031); finS.lineTo(0.004, 0.005); finS.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finS, { depth: 0.0013, bevelEnabled: true, bevelThickness: 0.0004, bevelSize: 0.0004, bevelSegments: 1 }), M.navy);
    fin.rotation.y = -Math.PI / 2;
    add('tail', fin, 0.00065, 0.009, 0.133);
    const vS = new THREE.Shape();
    vS.moveTo(0, 0); vS.lineTo(0.012, 0); vS.lineTo(0.016, -0.014); vS.lineTo(0.011, -0.015); vS.closePath();
    const ventral = new THREE.Mesh(new THREE.ExtrudeGeometry(vS, { depth: 0.0011, bevelEnabled: false }), M.navy);
    ventral.rotation.y = -Math.PI / 2;
    add('tail', ventral, 0.00055, 0.009, 0.138);
    add('tail', new THREE.Mesh(tube([V3(0, -0.004, 0.141), V3(0, -0.008, 0.149), V3(0, -0.0065, 0.156)], 0.0006, 10, 6), M.alu));
    add('tail', new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0026, 0.005, 14), M.darkMetal), -0.0025, 0.026, 0.152).rotation.z = Math.PI / 2;
    add('tail', new THREE.Mesh(new THREE.SphereGeometry(0.0008, 8, 6), M.navWhite), 0, 0.03, 0.162);
    tailRotor.position.set(-0.006, 0.026, 0.152);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.003, 10), M.alu);
    hub.rotation.z = Math.PI / 2;
    tailRotor.add(hub);
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.0005, 0.0165, 0.0026), M.blade);
      b.position.y = 0.0085 * s;
      tailRotor.add(b);
      const tip = new THREE.Mesh(new THREE.BoxGeometry(0.00055, 0.002, 0.0027), M.bladeTip);
      tip.position.y = 0.0158 * s;
      tailRotor.add(tip);
    }
    const blurT = new THREE.Mesh(new THREE.CircleGeometry(0.0172, 24), new THREE.MeshBasicMaterial({ color: 0x8890a0, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide }));
    blurT.rotation.y = Math.PI / 2;
    tailRotor.add(blurT);
    tailRotor.traverse((o) => { if (o.isMesh && !o.material.transparent) o.castShadow = true; });
    const P = HELI_PARTS.find((q) => q.name === 'tail');
    tailRotor.position.sub(V3(...P.pos));
    parts.tail.add(tailRotor);
  }

  // ---- Skid gear: arched cross tubes and skids with upturned toes.
  for (const side of ['skidL', 'skidR']) {
    const sx = side === 'skidL' ? -1 : 1;
    const X = 0.0265 * sx, Y = -0.0455;
    add(side, new THREE.Mesh(tube([V3(X, Y, 0.044), V3(X, Y, -0.04), V3(X, Y + 0.002, -0.050), V3(X, Y + 0.0065, -0.0555)], 0.0012, 30, 8), M.alu));
    add(side, new THREE.Mesh(new THREE.SphereGeometry(0.0012, 8, 6), M.alu), X, Y, 0.044);
    for (const cz of [-0.026, 0.017]) {
      // half an arched cross tube per side (so each skid's debris carries its own struts)
      add(side, new THREE.Mesh(tube([V3(X, Y + 0.0005, cz), V3(X * 0.9, Y + 0.009, cz), V3(X * 0.62, -0.031, cz), V3(0, -0.0285, cz)], 0.0011, 16, 8), M.alu));
    }
    // step plate
    add(side, new THREE.Mesh(new THREE.BoxGeometry(0.003, 0.0006, 0.007), M.darkMetal), X - sx * 0.0022, Y + 0.0012, -0.006);
  }

  // ---- Rotor head: mast, swashplate, pitch links, yoke.
  const rotor = new THREE.Group();
  {
    add('mast', new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0019, 0.012, 14), M.alu), 0, 0.0475, 0);
    const swash = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0012, 20), M.darkMetal);
    add('mast', swash, 0, 0.045, 0);
    const P = HELI_PARTS.find((q) => q.name === 'mast');
    rotor.position.set(0, CFG.heli.rotorHubOffset[1] - P.pos[1], 0);
    parts.mast.add(rotor);
    const yoke = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.0022, 0.0042), M.alu);
    rotor.add(yoke);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0023, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.alu);
    cap.position.y = 0.0008;
    rotor.add(cap);
    for (const s of [1, -1]) {
      const link = new THREE.Mesh(new THREE.CylinderGeometry(0.0004, 0.0004, 0.007, 6), M.darkMetal);
      link.position.set(0.004 * s, -0.004, 0.0028 * s);
      rotor.add(link);
      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0028, 0.0052), M.darkMetal);
      grip.position.set(0.011 * s, 0, 0);
      rotor.add(grip);
    }
    rotor.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.008, CFG.heli.rotorRadius, 64, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0.0 } },
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `uniform float uOpacity; varying vec3 vP;
        void main(){ float r = length(vP.xy)/${CFG.heli.rotorRadius.toFixed(3)};
          float a = 0.06 + 0.07*smoothstep(0.7,0.99,r) - 0.03*smoothstep(0.0,0.4,r);
          float tip = smoothstep(0.90,0.95,r)*smoothstep(1.0,0.96,r);
          vec3 col = mix(vec3(0.14,0.15,0.17), vec3(0.92,0.92,0.9), tip);
          gl_FragColor = vec4(col, (a + tip*0.16)*uOpacity); }`,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0006;
    rotor.add(disc);
    rotor.userData.disc = disc;
  }
  // Blades: long, slender, cambered, white tip caps. Part origin at mid-span.
  const bladeGeo = (() => {
    const g = airfoilPlate(0.093, 0.0066, 0.0007, 0.92, 0);
    g.rotateX(Math.PI / 2);
    g.translate(0.008, 0.0004, 0);
    return g;
  })();
  const tipGeo = new THREE.BoxGeometry(0.0075, 0.0011, 0.0064);
  for (const name of ['bladeA', 'bladeB']) {
    const P = HELI_PARTS.find((q) => q.name === name);
    const inner = new THREE.Group();
    const b = new THREE.Mesh(bladeGeo, M.blade);
    const t = new THREE.Mesh(tipGeo, M.bladeTip);
    t.position.set(0.0975, 0.0004, 0);
    b.castShadow = t.castShadow = true;
    inner.add(b, t);
    inner.position.set(-0.05 * P.blade, 0, 0);
    if (P.blade < 0) { inner.rotation.y = Math.PI; inner.position.set(0.05, 0, 0); }
    parts[name].add(inner);
  }
  const bladeHolder = new THREE.Group();
  parts.bladeA.position.set(0.05, 0, 0);
  parts.bladeB.position.set(-0.05, 0, 0);
  bladeHolder.add(parts.bladeA, parts.bladeB);
  rotor.add(bladeHolder);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x2b2d33, transparent: true, opacity: 0.12, depthWrite: false });
  const ghosts = [];
  for (let k = 1; k <= 3; k++) {
    const gh = new THREE.Group();
    for (const s of [0, Math.PI]) { const m = new THREE.Mesh(bladeGeo, ghostMat); m.rotation.y = s; gh.add(m); }
    gh.userData.offset = -k * 0.2;
    rotor.add(gh);
    ghosts.push(gh);
  }

  for (const p of HELI_PARTS) if (!p.blade) root.add(parts[p.name]);
  // Merge each part's static meshes by material: ~150 meshes become a few dozen draw calls.
  for (const p of HELI_PARTS) mergeStatic(parts[p.name], [rotor, tailRotor]);
  root.userData = { parts, rotor, bladeHolder, ghosts, tailRotor, beacon: M.beacon, realistic: true };
  return root;
}

function mergeStatic(part, keep) {
  part.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(part.matrixWorld).invert();
  const byMat = new Map();
  const victims = [];
  part.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.transparent || o.material === undefined) return;
    if (o.userData.keep) return;
    for (let a = o.parent; a && a !== part; a = a.parent) if (keep.includes(a)) return;
    if (keep.includes(o)) return;
    if (o.material.emissiveIntensity !== undefined && o.material.emissive && o.material.emissive.getHex() === 0xff1a0a) return; // beacon animates
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    g.clearGroups();
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = true; m.receiveShadow = true;
    part.add(m);
  }
}
