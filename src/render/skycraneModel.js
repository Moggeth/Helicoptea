import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SKYCRANE_PARTS } from '../sim/skycrane.js';
import { CFG } from '../config.js';
import { loft, sectionPoint } from './heliModel.js';
import { exteriorCabin } from './exteriorCabin.js';

// A scale-model S-64-style skycrane tanker, built procedurally: a bulbous glazed cockpit pod with a dark
// green stripe edged in white, a narrow crane spine, twin exposed turbines with chrome intakes behind an
// exposed six-blade head, a long thin boom rising to a high tail pylon with a four-blade tail rotor on the
// left (red and white tips) and a small green stabiliser, long-legged wheeled gear, and a boxy orange belly
// tank with big green numerals, belly doors and a white rail beneath. Original markings only. Parts are
// grouped by SKYCRANE_PARTS so a crash hands each piece to its own debris body.

const P = Object.fromEntries(SKYCRANE_PARTS.map((p) => [p.name, p]));
const C = CFG.skycrane;
const R = C.rotorRadius;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- textures
function paintTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ec6a1c'; g.fillRect(0, 0, 512, 256);
  // gentle sheen variation and grime along the bottom
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,20,0'},${Math.random() * 0.035})`; g.fillRect(Math.random() * 512, Math.random() * 256, 3, 2); }
  g.strokeStyle = 'rgba(90,30,5,0.45)'; g.lineWidth = 1.2;
  for (let x = 40; x < 512; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 60; y < 256; y += 90) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = 'rgba(80,30,5,0.5)';
  for (let x = 40; x < 512; x += 64) for (let y = 6; y < 256; y += 10) g.fillRect(x - 3, y, 1.5, 1.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// Tank side: orange with big green numerals and a small stencil. Original markings.
function tankTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#ec6a1c'; g.fillRect(0, 0, 512, 192);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(60,20,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * 512, Math.random() * 192, 3, 2); }
  g.fillStyle = '#1d6a3a';
  g.font = 'bold 132px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('07', 256, 92);
  g.fillStyle = '#f4efe4'; g.font = 'bold 20px Arial, sans-serif';
  g.fillText('MILK TANKER', 256, 172);
  g.strokeStyle = 'rgba(90,30,5,0.5)'; g.lineWidth = 2;
  g.strokeRect(14, 12, 484, 168);
  g.fillStyle = '#1d6a3a'; g.fillRect(0, 0, 512, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function hoseTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d8c7a0'; g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 8) { g.fillStyle = 'rgba(90,70,40,0.35)'; g.fillRect(0, y, 64, 2); g.fillStyle = 'rgba(255,250,235,0.25)'; g.fillRect(0, y + 3, 64, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function skycraneMaterials() {
  return {
    paint: new THREE.MeshPhysicalMaterial({ map: paintTexture(), roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    tankSide: new THREE.MeshPhysicalMaterial({ map: tankTexture(), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    orange: new THREE.MeshPhysicalMaterial({ color: 0xec6a1c, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    green: new THREE.MeshPhysicalMaterial({ color: 0x1d6a3a, roughness: 0.4, clearcoat: 0.5 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.4, clearcoat: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9cc3d4, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, envMapIntensity: 1.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
    frame: new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.6 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x2c2d2e, roughness: 0.9 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x3b4a5a, roughness: 0.8 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xe8e4da, roughness: 0.35, clearcoat: 0.8 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 1, roughness: 0.12 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.45, metalness: 0.75 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc0c4c8, roughness: 0.3, metalness: 0.95 }),
    hubMetal: new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.4, metalness: 0.8 }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x3d322c, roughness: 0.5, metalness: 0.85, emissive: 0x1a0600, emissiveIntensity: 0.5 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.55, metalness: 0.15 }),
    bladeTipRed: new THREE.MeshStandardMaterial({ color: 0xc8241c, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    hose: new THREE.MeshStandardMaterial({ map: hoseTexture(), roughness: 0.75 }),
    nozzle: new THREE.MeshPhysicalMaterial({ color: 0xc8241c, roughness: 0.4, clearcoat: 0.6 }),
    strainer: new THREE.MeshStandardMaterial({ color: 0x8d9296, roughness: 0.45, metalness: 0.7 }),
    navRed: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    navGreen: new THREE.MeshBasicMaterial({ color: 0x2aff6a }),
    beacon: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a0a, emissiveIntensity: 0 }),
  };
}

function discMaterial(radius) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0.0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `uniform float uOpacity; varying vec3 vP;
      void main(){ float r = length(vP.xy)/${radius.toFixed(4)};
        float a = 0.07 + 0.1*smoothstep(0.75,0.99,r) - 0.04*smoothstep(0.0,0.4,r);
        float tip = smoothstep(0.93,0.97,r)*smoothstep(1.0,0.975,r);
        vec3 col = mix(vec3(0.14,0.15,0.16), vec3(0.6,0.62,0.6), tip);
        gl_FragColor = vec4(col, (a + tip*0.12)*uOpacity); }`,
  });
}

// A tube between two points (struts, rails, braces).
function rod(a, b, r0, r1 = r0, seg = 8) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}


// ---------------------------------------------------------------- cab shell
// The cockpit cab, lofted like the real one's: a rounded nose with a two-pane windscreen and chin
// windows, crew doors with big windows, roof windows over the crew, and the aft-facing pilot's window
// low in the tail of the cab, looking back at the load. Shared with the first-person cockpit so the
// windows line up inside and out.
export const SKY_CAB_SECS = [
  { z: -0.0880, hw: 0.0018, yb: -0.0030, yt: 0.0020, nTop: 2.2, nBot: 2.2 },
  { z: -0.0862, hw: 0.0068, yb: -0.0078, yt: 0.0072, nTop: 2.3, nBot: 2.2 },
  { z: -0.0825, hw: 0.0104, yb: -0.0100, yt: 0.0132, nTop: 2.5, nBot: 2.3 },
  { z: -0.0775, hw: 0.0123, yb: -0.0106, yt: 0.0170, nTop: 2.7, nBot: 2.4 },
  { z: -0.0700, hw: 0.0130, yb: -0.0106, yt: 0.0188, nTop: 2.8, nBot: 2.5 },
  { z: -0.0620, hw: 0.0128, yb: -0.0102, yt: 0.0190, nTop: 2.8, nBot: 2.5 },
  { z: -0.0560, hw: 0.0118, yb: -0.0095, yt: 0.0185, nTop: 2.7, nBot: 2.4 },
  { z: -0.0520, hw: 0.0103, yb: -0.0085, yt: 0.0172, nTop: 2.6, nBot: 2.3 },
  { z: -0.0490, hw: 0.0080, yb: -0.0068, yt: 0.0150, nTop: 2.4, nBot: 2.2 },
  { z: -0.0470, hw: 0.0045, yb: -0.0040, yt: 0.0120, nTop: 2.2, nBot: 2.2 },
  { z: -0.0462, hw: 0.0012, yb: -0.0012, yt: 0.0092, nTop: 2.2, nBot: 2.2 },
];
export const SKY_GLASS = 1, SKY_FRAME = 2;
export function skyCabClass(a, z) {
  const s = Math.sin(a), c = Math.cos(a);
  if (z < -0.0746 && s > -0.07) return Math.abs(c) < 0.03 && z > -0.0862 ? SKY_FRAME : SKY_GLASS;   // windscreen to the nose, centre post
  if (z < -0.0758 && z > -0.0832 && s < -0.26 && s > -0.78 && Math.abs(c) > 0.32) return SKY_GLASS;   // chin windows
  if (z > -0.0728 && z < -0.0618 && s > 0.82) return SKY_GLASS;                   // roof windows
  if (z > -0.0726 && z < -0.0606 && s > -0.05 && s < 0.74 && Math.abs(c) > 0.55) return SKY_GLASS;   // crew door windows
  if (z > -0.0535 && z < -0.0472 && s < -0.12 && s > -0.92) return SKY_GLASS;     // aft-facing pilot's window
  return 0;
}
// classify(a, z, outside) may override (the cockpit glazes the posts and draws them as tubes).
export function skyCabShellGeometry(hi = true, classify = null) {
  return loft(SKY_CAB_SECS, hi ? 72 : 44, hi ? 60 : 34, classify ? (a, z) => classify(a, z, skyCabClass) : skyCabClass, 3);
}
// Section at z (linear between keyframes; close enough for frames and fittings).
export function skyCabSection(z) {
  const S = SKY_CAB_SECS;
  let i = 0;
  while (i < S.length - 2 && S[i + 1].z < z) i++;
  const A = S[i], B = S[i + 1], t = Math.min(1, Math.max(0, (z - A.z) / (B.z - A.z)));
  const L = (k) => A[k] + (B[k] - A[k]) * t;
  return { hw: L('hw'), yb: L('yb'), yt: L('yt'), nTop: L('nTop'), nBot: L('nBot') };
}
export function skyCabPoint(z, a, inset = 1) {
  const sec = skyCabSection(z);
  const [x, y] = sectionPoint(sec, a);
  const mid = (sec.yt + sec.yb) / 2;
  return new THREE.Vector3(x * inset, mid + (y - mid) * inset, z);
}

// Cab livery: orange, a green band edged in white round the nose under the windows, door seams,
// panel lines and rivets. u runs round the section (0.5 = right side, 0.75 = top), v nose to tail.
function cabTexture() {
  const W = 1024, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = (x / W - 0.5) * Math.PI * 2, s = Math.sin(a);
    let col = [236, 106, 28];
    if (s < -0.215 && s > -0.25) col = [242, 239, 232];
    else if (s <= -0.25 && s > -0.4) col = [29, 106, 58];
    else if (s <= -0.4 && s > -0.43) col = [242, 239, 232];
    const n = (Math.sin(x * 12.9898 + y * 78.233) * 43758.5453) % 1;
    const k = 1 + (n - 0.5) * 0.03;
    const i = (y * W + x) * 4;
    img.data[i] = col[0] * k; img.data[i + 1] = col[1] * k; img.data[i + 2] = col[2] * k; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const vOf = (z) => (z - SKY_CAB_SECS[0].z) / (SKY_CAB_SECS[SKY_CAB_SECS.length - 1].z - SKY_CAB_SECS[0].z) * H;
  const uOf = (a) => (a / (Math.PI * 2) + 0.5) * W;
  const line = (x0, y0, x1, y1, w = 1.6) => { g.strokeStyle = 'rgba(70,25,5,0.55)'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  // Crew door outlines (both sides) with a flush handle.
  for (const side of [1, -1]) {
    const a0 = side > 0 ? -0.62 : Math.PI + 0.62, a1 = side > 0 ? 0.86 : Math.PI - 0.86;
    const u0 = uOf(side > 0 ? a0 : a0 - Math.PI * 2), u1 = uOf(side > 0 ? a1 : a1 - Math.PI * 2);
    const ua = Math.min(u0, u1), ub = Math.max(u0, u1), v0 = vOf(-0.0732), v1 = vOf(-0.0598);
    line(ua, v0, ub, v0); line(ua, v1, ub, v1); line(ua, v0, ua, v1); line(ub, v0, ub, v1);
    g.fillStyle = 'rgba(220,220,225,0.9)'; g.fillRect((ua + ub) / 2 + (side > 0 ? -30 : 10), v1 - 14, 22, 5);
  }
  // Frames and rivet rows round the cab.
  for (const z of [-0.0838, -0.0746, -0.0606, -0.054]) {
    const v = vOf(z); line(0, v, W, v, 1.2);
    for (let x = 4; x < W; x += 9) { g.fillStyle = 'rgba(255,230,200,0.25)'; g.fillRect(x, v + 4, 2, 2); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ---------------------------------------------------------------- build
export function buildSkycrane(M = skycraneMaterials()) {
  const root = new THREE.Group();
  root.name = 'skycrane';
  const parts = {};
  for (const p of SKYCRANE_PARTS) {
    const g = new THREE.Group();
    g.position.set(...p.pos);
    g.name = p.name;
    parts[p.name] = g;
  }
  // add(part, mesh) with the mesh built in body coordinates.
  // add(part, geometry, material, x, y, z) or add(part, object3D, x, y, z)
  const add = (part, geo, mat, x = 0, y = 0, z = 0) => {
    if (geo.isObject3D && typeof mat !== 'object') { z = y; y = x; x = mat ?? 0; }
    const m = geo.isObject3D ? geo : new THREE.Mesh(geo, mat);
    const q = P[part].pos;
    m.position.x += x - q[0]; m.position.y += y - q[1]; m.position.z += z - q[2];
    parts[part].add(m);
    return m;
  };
  const cyl = (r0, r1, h, seg = 16) => new THREE.CylinderGeometry(r0, r1, h, seg);

  // --- Cockpit cab: lofted shell with its windows (render/cockpit.js shares the shell).
  {
    const cz = -0.068, cy = 0.004;
    const cabGeo = skyCabShellGeometry(true);
    const cabMat = new THREE.MeshPhysicalMaterial({ map: cabTexture(), roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 });
    const skip = new THREE.MeshBasicMaterial({ visible: false });
    add('cockpit', new THREE.Mesh(cabGeo, [cabMat, skip, M.frame]));
    const lining = new THREE.Mesh(cabGeo, [new THREE.MeshStandardMaterial({ color: 0x2c2d2e, roughness: 0.9, side: THREE.BackSide }), skip, skip]);
    lining.scale.setScalar(0.985);
    lining.userData.noShadow = true;
    add('cockpit', lining);
    const glazing = new THREE.Mesh(cabGeo, [skip, M.glass, skip]);
    glazing.renderOrder = 2;
    glazing.userData.noShadow = true;
    add('cockpit', glazing);
    add('cockpit', exteriorCabin('skycrane'));
    // Black rubber seals round every window and the windscreen centre post, outside.
    {
      const loop = (z0, z1, a0, a1, sx, k = 1.004, n = 6) => {
        const pts = [];
        const P = (z, a) => { const p = skyCabPoint(z, a, k); p.x *= sx; return p; };
        for (let i = 0; i < n; i++) pts.push(P(z0 + (z1 - z0) * i / n, a0));
        for (let i = 0; i < n; i++) pts.push(P(z1, a0 + (a1 - a0) * i / n));
        for (let i = 0; i < n; i++) pts.push(P(z1 - (z1 - z0) * i / n, a1));
        for (let i = 0; i < n; i++) pts.push(P(z0, a1 - (a1 - a0) * i / n));
        add('cockpit', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), n * 16, 0.00022, 5, true), M.frame);
      };
      for (const sx of [-1, 1]) {
        loop(-0.0727, -0.0605, -0.06, 0.835, sx);
        loop(-0.0832, -0.0758, -0.9, -0.262, sx);
        loop(-0.0536, -0.0472, -1.18, -0.12, sx);
      }
      loop(-0.0729, -0.0617, 0.96, Math.PI - 0.96, 1);
      const bow = [], post = [];
      for (let a = -0.12; a <= Math.PI + 0.12 + 1e-6; a += Math.PI / 24) bow.push(skyCabPoint(-0.0746, a, 1.004));
      for (let z = -0.0866; z <= -0.0745; z += 0.0008) post.push(skyCabPoint(z, Math.PI / 2, 1.004));
      add('cockpit', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bow), 60, 0.00028, 5, false), M.frame);
      add('cockpit', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(post), 30, 0.00022, 5, false), M.frame);
    }
    // Nose step and pitot.
    add('cockpit', rod(V3(0, cy - 0.006, cz - 0.0185), V3(0, cy - 0.006, cz - 0.0235), 0.0004), M.alu);
  }

  // --- Spine: the narrow crane fuselage, with a dorsal fairing and the belly beam the tank hangs from.
  {
    const spine = new RoundedBoxGeometry(0.016, 0.0145, 0.1, 3, 0.0035);
    add('spine', spine, M.paint, 0, 0.013, -0.006);
    // transition into the cockpit pod
    const neck = cyl(0.0085, 0.0118, 0.012, 20); neck.rotateX(Math.PI / 2);
    add('spine', neck, M.paint, 0, 0.009, -0.054);
    // belly keel and tank hangers
    add('spine', new RoundedBoxGeometry(0.009, 0.004, 0.084, 2, 0.0012), M.orange, 0, 0.0045, -0.004);
    for (const z of [-0.026, 0.02]) for (const sx of [-1, 1]) add('spine', rod(V3(sx * 0.004, 0.004, z), V3(sx * 0.012, -0.005, z), 0.0008), M.darkMetal);
    // side windows of the aft-facing station, and a step
    for (const sx of [-1, 1]) add('spine', new THREE.BoxGeometry(0.0006, 0.004, 0.008), M.glass, sx * 0.0081, 0.016, -0.042);
    // anti-collision beacon on the belly, nav lights
    add('spine', new THREE.SphereGeometry(0.0013, 10, 8), M.navRed, -0.0084, 0.012, -0.045);
    add('spine', new THREE.SphereGeometry(0.0013, 10, 8), M.navGreen, 0.0084, 0.012, -0.045);
  }

  // --- Engines: twin exposed turbines behind the head, chrome bellmouths facing forward.
  {
    const gearbox = new RoundedBoxGeometry(0.014, 0.01, 0.022, 3, 0.003);
    add('engines', gearbox, M.paint, 0, 0.026, 0.0);
    for (const sx of [-1, 1]) {
      const x = sx * 0.0092;
      const nac = cyl(0.0052, 0.0047, 0.034, 20); nac.rotateX(Math.PI / 2);
      add('engines', nac, M.paint, x, 0.0285, 0.014);
      const lip = new THREE.TorusGeometry(0.0053, 0.0013, 10, 24);
      add('engines', lip, M.chrome, x, 0.0285, -0.0035);
      const bell = cyl(0.0058, 0.0052, 0.004, 24); bell.rotateX(Math.PI / 2);
      add('engines', bell, M.chrome, x, 0.0285, -0.0012);
      const face = new THREE.CircleGeometry(0.0042, 20);
      face.rotateY(Math.PI);
      add('engines', face, M.darkMetal, x, 0.0285, -0.002);
      const ex = cyl(0.0034, 0.0041, 0.008, 14); ex.rotateX(Math.PI / 2); ex.rotateY(sx * 0.35);
      add('engines', ex, M.exhaust, x + sx * 0.002, 0.029, 0.034);
      // a green cowl stripe
      const st = cyl(0.00525, 0.00525, 0.003, 20, 1); st.rotateX(Math.PI / 2);
      add('engines', st, M.green, x, 0.0285, 0.022);
    }
    // mast
    add('engines', cyl(0.0021, 0.0026, C.hub[1] - 0.031, 12), M.darkMetal, C.hub[0], (C.hub[1] + 0.031) / 2, C.hub[2]);
    add('engines', cyl(0.0036, 0.0036, 0.0012, 18), M.alu, C.hub[0], 0.033, C.hub[2]);
  }

  // --- Tail boom rising to the tail pylon.
  {
    const a = V3(0, 0.017, 0.042), b = V3(0, 0.035, 0.118);
    const boom = rod(a, b, 0.0048, 0.0032, 4);
    boom.rotateZ(0); // square-ish section
    const m = new THREE.Mesh(boom, M.paint);
    add('tailBoom', m);
    // the boom's square section rotated 45 degrees so a flat side faces up
    add('tailBoom', rod(V3(0, 0.0105, 0.05), V3(0, 0.031, 0.115), 0.0009), M.darkMetal); // drive shaft cover underneath
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 10, 8), M.beacon);
    add('tailBoom', beacon, 0, 0.0285, 0.07);
    parts.tailBoom.userData.beacon = beacon;
  }

  // --- Tail pylon with the four-blade tail rotor on the left and the green stabiliser on the right.
  const tailRotor = new THREE.Group();
  {
    const fin = new THREE.Shape();
    fin.moveTo(0.112, 0.026); fin.lineTo(0.13, 0.027); fin.lineTo(0.136, 0.058); fin.lineTo(0.126, 0.059); fin.lineTo(0.112, 0.036); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 2 });
    fg.rotateY(-Math.PI / 2);   // shape x -> body z
    fg.translate(0.002, 0, 0);
    add('tailPylon', fg, M.paint);
    const stab = new RoundedBoxGeometry(0.02, 0.0012, 0.006, 2, 0.0005);
    add('tailPylon', stab, M.green, 0.011, 0.054, 0.131);
    add('tailPylon', new THREE.SphereGeometry(0.001, 8, 6), M.navGreen, 0.021, 0.054, 0.131);
    const gb = cyl(0.0022, 0.0028, 0.006, 14); gb.rotateZ(Math.PI / 2);
    add('tailPylon', gb, M.darkMetal, C.tailHub[0] + 0.004, C.tailHub[1], C.tailHub[2]);
    // tail rotor: four blades in the YZ plane, red and white bands at the tips
    const tr = C.tailRadius;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const bl = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.0005, tr - 0.003, 0.0028), M.blade);
      b.position.y = (tr - 0.003) / 2 + 0.002;
      bl.add(b);
      for (const [o, mat] of [[0.0, M.bladeTipRed], [0.0025, M.white], [0.005, M.bladeTipRed]]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.0024, 0.0029), mat);
        t.position.y = tr - 0.0012 - o;
        bl.add(t);
      }
      bl.rotation.x = a;
      tailRotor.add(bl);
    }
    tailRotor.add(new THREE.Mesh(cyl(0.0016, 0.0016, 0.002, 12).rotateZ(Math.PI / 2), M.hubMetal));
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.003, tr, 40, 1), discMaterial(tr));
    disc.rotation.y = Math.PI / 2;
    tailRotor.add(disc);
    tailRotor.userData.disc = disc;
    add('tailPylon', tailRotor, C.tailHub[0], C.tailHub[1], C.tailHub[2]);
  }

  // --- Belly tank: boxy, orange, big green numerals on both sides, two belly doors and a white rail.
  const doors = [];
  {
    const T = C.tank;
    const W = 0.033, H = 0.021, L = 0.063;
    const cy = -0.0155, cz = -0.002;
    const body = new RoundedBoxGeometry(W, H, L, 3, 0.0032);
    add('tank', body, M.orange, 0, cy, cz);
    for (const sx of [-1, 1]) {
      const side = new THREE.PlaneGeometry(L * 0.86, H * 0.72);
      side.rotateY(sx * Math.PI / 2);
      add('tank', side, M.tankSide, sx * (W / 2 + 0.0002), cy + 0.0008, cz);
    }
    // doors: hinged along the outer edges of the floor, opening downwards
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Group();
      const d = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.0035, 0.0009, L - 0.012), M.orange);
      d.position.x = -sx * (W / 2 - 0.0035) / 2;
      hinge.add(d);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.0005, 0.0012, L - 0.012), M.green);
      edge.position.x = -sx * (W / 2 - 0.0035);
      hinge.add(edge);
      hinge.userData.side = sx;
      add('tank', hinge, sx * (W / 2 - 0.0028), cy - H / 2 - 0.0005, cz);
      doors.push(hinge);
    }
    // dark door well, seen when the doors open
    add('tank', new THREE.PlaneGeometry(W - 0.006, L - 0.012).rotateX(Math.PI / 2), M.darkMetal, 0, cy - H / 2 + 0.0004, cz);
    // the long white rail assembly under the tank
    for (const sx of [-1, 1]) {
      add('tank', rod(V3(sx * 0.0125, cy - H / 2 - 0.0042, cz - 0.041), V3(sx * 0.0125, cy - H / 2 - 0.0042, cz + 0.037), 0.0009), M.white);
      for (const z of [-0.026, 0, 0.026]) add('tank', rod(V3(sx * 0.0125, cy - H / 2 - 0.0042, cz + z), V3(sx * 0.0125, cy - H / 2, cz + z), 0.0006), M.white);
    }
    // snorkel socket, front right
    const a = C.hose.anchor;
    add('tank', cyl(0.0032, 0.0028, 0.004, 14), M.darkMetal, a[0], a[1] + 0.002, a[2]);
    add('tank', new THREE.TorusGeometry(0.0029, 0.0006, 8, 16).rotateX(Math.PI / 2), M.alu, a[0], a[1], a[2]);
    // cargo hook behind the tank
    const h = C.hooks[0];
    add('tank', rod(V3(h[0], cy - 0.004, h[2] - 0.004), V3(h[0], h[1] + 0.003, h[2]), 0.0006), M.darkMetal);
    add('tank', new THREE.TorusGeometry(0.0026, 0.0007, 8, 16, Math.PI * 1.6).rotateY(Math.PI / 2), M.alu, h[0], h[1] + 0.002, h[2]);
  }

  // --- Gear: nose wheels under the pod, twin mains on long splayed legs.
  {
    const wheel = (r, w) => { const g = cyl(r, r, w, 18); g.rotateZ(Math.PI / 2); return g; };
    const hubG = (r) => { const g = cyl(r * 0.45, r * 0.45, 0.0006, 10); g.rotateZ(Math.PI / 2); return g; };
    const groundY = -C.gearDrop;
    for (const sx of [-1, 1]) {
      const name = sx < 0 ? 'gearNL' : 'gearNR';
      const r = 0.0042, x = sx * 0.0072, z = -0.062;
      add(name, wheel(r, 0.0032), M.rubber, x, groundY + r, z);
      add(name, hubG(r), M.alu, x + sx * 0.0017, groundY + r, z);
      add(name, rod(V3(sx * 0.0045, groundY + r, z), V3(sx * 0.004, -0.009, z + 0.004), 0.0008), M.alu);
    }
    for (const sx of [-1, 1]) {
      const name = sx < 0 ? 'gearML' : 'gearMR';
      const r = 0.0048, x = sx * 0.034, z = 0.032;
      for (const dz of [-0.0034, 0.0034]) {
        add(name, wheel(r, 0.003), M.rubber, x, groundY + r, z + dz);
        add(name, hubG(r), M.alu, x + sx * 0.0016, groundY + r, z + dz);
      }
      const hub = V3(x - sx * 0.002, groundY + r, z);
      add(name, rod(hub, V3(sx * 0.0075, 0.009, 0.024), 0.0011), M.orange);   // main leg
      add(name, rod(hub, V3(sx * 0.0075, 0.007, 0.046), 0.0008), M.orange);   // drag brace
      add(name, rod(V3(x - sx * 0.006, groundY + r + 0.002, z), V3(sx * 0.012, -0.012, z - 0.002), 0.0007), M.alu); // shock strut to the tank frame
    }
  }

  // --- Main rotor: exposed six-blade head; blade parts ride in the rotor group while flying.
  const rotor = new THREE.Group();
  {
    const hub = C.hub;
    rotor.position.set(hub[0] - P.engines.pos[0], hub[1] - P.engines.pos[1], hub[2] - P.engines.pos[2]);
    parts.engines.add(rotor);
    const head = new THREE.Group();
    head.add(new THREE.Mesh(cyl(0.0042, 0.0048, 0.0036, 24), M.hubMetal));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.003, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hubMetal);
    cap.position.y = 0.0018;
    head.add(cap);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0018, 0.0026), M.hubMetal);
      arm.position.set(Math.cos(a) * 0.0068, 0, -Math.sin(a) * 0.0068);
      arm.rotation.y = a;
      head.add(arm);
      const damper = new THREE.Mesh(cyl(0.0005, 0.0005, 0.0055, 6), M.alu);
      damper.rotation.z = Math.PI / 2;
      damper.position.set(Math.cos(a + 0.35) * 0.0058, 0.0013, -Math.sin(a + 0.35) * 0.0058);
      damper.rotation.y = a + 0.35;
      head.add(damper);
    }
    rotor.add(head);
    rotor.userData.head = head;
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.011, R, 96, 1), discMaterial(R));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0006;
    rotor.add(disc);
    rotor.userData.disc = disc;
    const bladeGeo = (() => {
      const s = new THREE.Shape();
      const r0 = 0.0105, r1 = R, ch = 0.0034;
      s.moveTo(r0, -ch * 0.8); s.lineTo(r0 + 0.008, -ch); s.lineTo(r1 - 0.004, -ch); s.lineTo(r1, -ch * 0.5);
      s.lineTo(r1, ch * 0.7); s.lineTo(r1 - 0.004, ch); s.lineTo(r0 + 0.008, ch); s.lineTo(r0, ch * 0.8); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0007, bevelEnabled: false, curveSegments: 2 });
      geo.rotateX(Math.PI / 2);
      geo.translate(-0.05, 0.0004, 0);
      return geo;
    })();
    const tipGeo = new THREE.BoxGeometry(0.004, 0.0008, 0.0069);
    const holder = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const g = parts[`blade${k}`];
      const a = k * Math.PI / 3;
      g.position.set(Math.cos(a) * 0.05, 0, -Math.sin(a) * 0.05);
      g.rotation.set(0, a, 0);
      const tip = new THREE.Mesh(tipGeo, M.white);
      tip.position.set(R - 0.002 - 0.05, 0.0004, 0);
      g.add(new THREE.Mesh(bladeGeo, M.blade), tip);
      holder.add(g);
    }
    rotor.add(holder);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x2a2c2d, transparent: true, opacity: 0.12, depthWrite: false });
    const ghosts = [];
    for (let j = 1; j <= 3; j++) {
      const gh = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const m = new THREE.Mesh(bladeGeo, ghostMat);
        const a = k * Math.PI / 3;
        m.position.set(Math.cos(a) * 0.05, 0, -Math.sin(a) * 0.05);
        m.rotation.y = a;
        gh.add(m);
      }
      gh.userData.offset = -j * 0.1;
      rotor.add(gh);
      ghosts.push(gh);
    }
    rotor.userData.ghosts = ghosts;
  }

  const keep = [rotor, tailRotor, parts.tailBoom.userData.beacon, ...doors];
  for (const p of SKYCRANE_PARTS) if (!p.blade) mergeStatic(parts[p.name], keep);
  for (const gh of rotor.userData.ghosts) mergeStatic(gh, []);
  for (const p of SKYCRANE_PARTS) if (!p.blade) root.add(parts[p.name]);
  root.traverse((o) => { if (o.isMesh && !o.material.transparent && !o.material.isShaderMaterial && !o.userData.noShadow) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData = { parts, rotors: [rotor], rotor, tailRotor, doors, beacon: parts.tailBoom.userData.beacon, materials: M };
  return root;
}

function mergeStatic(part, keep) {
  part.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(part.matrixWorld).invert();
  const byMat = new Map();
  const victims = [];
  part.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || keep.includes(o)) return;
    for (let a = o.parent; a && a !== part; a = a.parent) if (keep.includes(a)) return;
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
    if (merged) part.add(new THREE.Mesh(merged, mat));
  }
}

// Clone of one part for a debris body (centred on the part origin), scorched, with ember glow hooks.
export function cloneSkycranePart(model, name) {
  const src = model.userData.parts[name];
  const { rotor, tailRotor } = model.userData;
  const g = new THREE.Group();
  for (const child of src.children) {
    if (child === rotor) { const head = rotor.userData.head.clone(true); head.position.copy(child.position); g.add(head); continue; }
    if (child === tailRotor) continue;
    g.add(child.clone(true));
  }
  g.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true;
    const scorch = (m0) => {
      const m = m0.clone();
      m.userData.disposeOwned = true;
      if (m.color) m.color.multiplyScalar(0.45);
      if ('emissive' in m) { m.emissive = new THREE.Color(0xff5a1a); m.emissiveIntensity = 0; }
      if (m.transparent) m.opacity *= 0.6;
      return m;
    };
    if (Array.isArray(o.material)) { o.material = o.material.map(scorch); return; }
    if (o.material.transparent || o.material.isShaderMaterial) { o.visible = false; return; }
    o.material = scorch(o.material);
  });
  g.userData.embers = [];
  g.userData.emberScale = 0.6;
  g.traverse((o) => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m.emissive) g.userData.embers.push(m); });
  return g;
}
