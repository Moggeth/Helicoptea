import * as THREE from 'three';
import { CHINOOK_PARTS } from '../sim/chinook.js';
import { CFG } from '../config.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A serious, scale-model CH-47-style tandem-rotor transport, built procedurally: lofted square-section
// fuselage with the ramp upsweep, multi-pane cockpit glazing with two crew inside, forward pylon fairing,
// drive-shaft spine, tall aft pylon with twin turboshaft pods, fuel sponsons, twin forward wheels and
// single aft wheels, three belly hooks, and two three-blade rotor heads. Matte olive drab with panel
// lines, rivets, portholes and stencils. Parts are grouped by CHINOOK_PARTS so a crash hands each piece
// to its own debris body.

const P = Object.fromEntries(CHINOOK_PARTS.map((p) => [p.name, p]));
const Z0 = -0.0855, Z1 = 0.0875;           // fuselage nose and tail (v texture range)
const R = CFG.chinook.rotorRadius;
const HUBS = CFG.chinook.hubs;

// ---------------------------------------------------------------- profiles
// Catmull-Rom through keyframed superellipse sections.
function profile(keys) {
  const names = ['hw', 'yb', 'yt', 'nTop', 'nBot'];
  return (z) => {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1].z < z) i++;
    const p0 = keys[Math.max(0, i - 1)], p1 = keys[i], p2 = keys[i + 1], p3 = keys[Math.min(keys.length - 1, i + 2)];
    const u = THREE.MathUtils.clamp((z - p1.z) / (p2.z - p1.z || 1), 0, 1);
    const out = { z };
    for (const k of names) {
      const a = p0[k], b = p1[k], c = p2[k], d = p3[k];
      out[k] = 0.5 * ((2 * b) + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
    }
    out.hw = Math.max(out.hw, 0.0003);
    return out;
  };
}
const K = (z, hw, yb, yt, nTop = 3.2, nBot = 3.8) => ({ z, hw, yb, yt, nTop, nBot });

const FUSELAGE = profile([
  K(-0.0870, 0.004, -0.002, 0.002, 2.2, 2.4),
  K(-0.0855, 0.0085, -0.0045, 0.0045, 2.2, 2.4),
  K(-0.0830, 0.0136, -0.0098, 0.0088, 2.4, 2.8),
  K(-0.0790, 0.0168, -0.0137, 0.0130, 2.6, 3.2),
  K(-0.0740, 0.0190, -0.0163, 0.0176, 2.9, 3.6),
  K(-0.0680, 0.0202, -0.0177, 0.0209, 3.1, 3.8),
  K(-0.0600, 0.0205, -0.0180, 0.0220),
  K(0.0450, 0.0205, -0.0180, 0.0220),
  K(0.0600, 0.0204, -0.0156, 0.0220),
  K(0.0750, 0.0200, -0.0106, 0.0220),
  K(0.0875, 0.0195, -0.0040, 0.0215),
  K(0.0890, 0.0190, -0.0030, 0.0212),
]);

const FWD_PYLON = profile([
  K(-0.0850, 0.0020, 0.0090, 0.0105, 2.4, 2.4),
  K(-0.0805, 0.0050, 0.0110, 0.0185, 2.4, 2.6),
  K(-0.0730, 0.0085, 0.0150, 0.0315, 2.6, 2.8),
  K(-0.0640, 0.0098, 0.0180, 0.0365, 2.8, 3.0),
  K(-0.0530, 0.0092, 0.0190, 0.0350, 2.8, 3.0),
  K(-0.0430, 0.0068, 0.0190, 0.0285, 2.8, 3.0),
  K(-0.0380, 0.0062, 0.0190, 0.0272, 2.8, 3.0),
]);

const SPINE = profile([
  K(-0.050, 0.0062, 0.018, 0.0272, 2.8, 3), K(-0.040, 0.0062, 0.018, 0.0272, 2.8, 3),
  K(0.036, 0.0062, 0.018, 0.0272, 2.8, 3), K(0.046, 0.0062, 0.018, 0.0272, 2.8, 3),
]);

const AFT_PYLON = profile([
  K(0.0300, 0.0062, 0.0185, 0.0272, 2.8, 3.0),
  K(0.0420, 0.0090, 0.0190, 0.0350, 2.8, 3.0),
  K(0.0540, 0.0112, 0.0195, 0.0440, 3.0, 3.0),
  K(0.0680, 0.0118, 0.0195, 0.0470, 3.2, 3.0),
  K(0.0820, 0.0108, 0.0170, 0.0462, 3.0, 3.0),
  K(0.0915, 0.0070, 0.0200, 0.0430, 2.6, 2.6),
  K(0.0950, 0.0030, 0.0270, 0.0390, 2.2, 2.2),
]);

const SPONSON = profile([
  K(-0.0520, 0.0012, -0.0110, -0.0095, 2.2, 2.2),
  K(-0.0490, 0.0040, -0.0160, -0.0050, 2.4, 2.6),
  K(-0.0430, 0.0052, -0.0180, -0.0038, 2.8, 3.2),
  K(0.0380, 0.0052, -0.0180, -0.0038, 2.8, 3.2),
  K(0.0450, 0.0040, -0.0165, -0.0050, 2.4, 2.6),
  K(0.0490, 0.0012, -0.0125, -0.0085, 2.2, 2.2),
]);

function sectionPoint(sec, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const n = s >= 0 ? sec.nTop : sec.nBot;
  const x = sec.hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const mid = (sec.yt + sec.yb) / 2, hh = (sec.yt - sec.yb) / 2;
  return [x, mid + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}

// Loft a profile between za and zb. The seam runs along the belly (a = -pi/2). u goes round the
// section (0 belly, 0.25 right, 0.5 top, 0.75 left); v is the global position along the fuselage.
function loft(prof, za, zb, { steps = 24, segs = 40, classify = null, groups = 1, capA = false, capB = false, v0 = Z0, v1 = Z1 } = {}) {
  const pos = [], uv = [];
  for (let j = 0; j <= steps; j++) {
    const z = za + (zb - za) * j / steps;
    const sec = prof(z);
    for (let i = 0; i <= segs; i++) {
      const a = -Math.PI / 2 + (i / segs) * Math.PI * 2;
      const [x, y] = sectionPoint(sec, a);
      pos.push(x, y, z);
      uv.push(i / segs, (z - v0) / (v1 - v0));
    }
  }
  const idx = Array.from({ length: groups }, () => []);
  for (let j = 0; j < steps; j++) for (let i = 0; i < segs; i++) {
    const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1;
    const am = -Math.PI / 2 + ((i + 0.5) / segs) * Math.PI * 2;
    const zm = za + (zb - za) * (j + 0.5) / steps;
    const gi = classify ? classify(am, zm) : 0;
    idx[gi].push(a, b, c, b, d, c);
  }
  const cap = (j, front) => {
    const sec = prof(za + (zb - za) * j / steps);
    const ci = pos.length / 3;
    pos.push(0, (sec.yt + sec.yb) / 2, sec.z); uv.push(0.5, (sec.z - v0) / (v1 - v0));
    for (let i = 0; i < segs; i++) {
      const a = j * (segs + 1) + i, b = a + 1;
      if (front) idx[0].push(ci, b, a); else idx[0].push(ci, a, b);
    }
  };
  if (capA) cap(0, true);
  if (capB) cap(steps, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const all = [];
  idx.forEach((list, gi) => { g.addGroup(all.length, list.length, gi); all.push(...list); });
  g.setIndex(all);
  g.computeVertexNormals();
  return g;
}

// Fold the left side onto the right so glazing is classified symmetrically (r in [-pi/2, pi/2]).
const sym = (a) => (a > Math.PI / 2 ? Math.PI - a : a);

const GLASS = 1, BLACK = 2;
const noseClass = (a, z) => {
  const r = sym(a);
  if (z < -0.0835) return r > -0.2 ? GLASS : 0;                              // chin and centre panes
  if (z < -0.0745) {
    if (Math.abs(r - 0.62) < 0.06 || Math.abs(r - 1.12) < 0.05) return 0;    // window posts
    if (r > 0.25) return GLASS;                                             // windscreen and eyebrows
    if (r < -0.35 && r > -1.15 && z < -0.079) return GLASS;                 // chin bubbles
    return 0;
  }
  if (z < -0.0655 && r > 0.05 && r < 0.95 && Math.abs(z + 0.0702) > 0.0007) return GLASS; // side windows
  return 0;
};

// The nose section with its glazing (group 1) and black frames (group 2). Shared with the first-person
// cockpit so the windows line up with the outside.
export function noseShellGeometry() {
  return loft(FUSELAGE, -0.087, -0.045, { steps: 40, segs: 56, classify: noseClass, groups: 3, capA: true });
}


// ---------------------------------------------------------------- textures
function livery() {
  const W = 1024, H = 1024;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const [c, g] = mk();
  const [cb, b] = mk();
  const [cr, r] = mk();
  // Base: olive drab, gently mottled and weathered (darker along the belly and exhaust streaks).
  g.fillStyle = '#4b5236'; g.fillRect(0, 0, W, H);
  b.fillStyle = '#808080'; b.fillRect(0, 0, W, H);
  r.fillStyle = '#c4c4c4'; r.fillRect(0, 0, W, H);
  for (let k = 0; k < 1400; k++) {
    const x = Math.random() * W, y = Math.random() * H, s = 6 + Math.random() * 30;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '30,34,22' : '96,102,74'},${0.04 + Math.random() * 0.05})`;
    g.beginPath(); g.ellipse(x, y, s, s * (0.4 + Math.random()), Math.random() * 3, 0, 7); g.fill();
  }
  const belly = g.createLinearGradient(0, 0, W * 0.25, 0);
  belly.addColorStop(0, 'rgba(20,20,14,0.35)'); belly.addColorStop(1, 'rgba(20,20,14,0)');
  g.fillStyle = belly; g.fillRect(0, 0, W * 0.25, H);
  const belly2 = g.createLinearGradient(W, 0, W * 0.75, 0);
  belly2.addColorStop(0, 'rgba(20,20,14,0.35)'); belly2.addColorStop(1, 'rgba(20,20,14,0)');
  g.fillStyle = belly2; g.fillRect(W * 0.75, 0, W * 0.25, H);
  const vOf = (z) => (z - Z0) / (Z1 - Z0) * H;
  const line = (x0, y0, x1, y1, w = 2) => {
    g.strokeStyle = 'rgba(14,16,10,0.55)'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    b.strokeStyle = '#4a4a4a'; b.lineWidth = w + 1; b.beginPath(); b.moveTo(x0, y0); b.lineTo(x1, y1); b.stroke();
  };
  const rivets = (x0, y0, x1, y1, n) => {
    for (let k = 0; k <= n; k++) {
      const t = k / n, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
      g.fillStyle = 'rgba(150,156,120,0.35)'; g.fillRect(x, y, 2, 2);
      b.fillStyle = '#a0a0a0'; b.fillRect(x, y, 2, 2);
    }
  };
  // Fuselage frames (vertical rings) and stringers.
  for (let z = -0.06; z < 0.085; z += 0.0105) { const y = vOf(z); line(0, y, W, y, 1.5); rivets(0, y + 4, W, y + 4, 140); }
  for (const u of [0.12, 0.2, 0.38, 0.5, 0.62, 0.8, 0.88]) line(u * W, vOf(-0.068), u * W, vOf(0.08), 1.2);
  // Portholes: five per side along the cabin.
  for (const u of [0.262, 0.738]) {
    for (const z of [-0.034, -0.017, 0.0, 0.017, 0.034]) {
      const x = u * W, y = vOf(z);
      g.fillStyle = 'rgba(160,166,140,0.6)'; g.beginPath(); g.ellipse(x, y, 19, 18, 0, 0, 7); g.fill();
      g.fillStyle = '#10161a'; g.beginPath(); g.ellipse(x, y, 15, 14, 0, 0, 7); g.fill();
      g.fillStyle = 'rgba(160,200,220,0.25)'; g.beginPath(); g.ellipse(x - 4, y - 4, 6, 4, -0.6, 0, 7); g.fill();
      r.fillStyle = '#202020'; r.beginPath(); r.ellipse(x, y, 15, 14, 0, 0, 7); r.fill();
    }
  }
  // Crew door (front right) and its window; cabin escape hatch on the left.
  {
    const x0 = 0.2 * W, x1 = 0.31 * W, y0 = vOf(-0.059), y1 = vOf(-0.046);
    line(x0, y0, x1, y0); line(x0, y1, x1, y1); line(x0, y0, x0, y1); line(x1, y0, x1, y1);
    g.fillStyle = '#10161a'; g.fillRect(0.245 * W, vOf(-0.0565), 0.035 * W, vOf(-0.051) - vOf(-0.0565));
    g.fillStyle = '#b9bfa8'; g.fillRect(0.22 * W, vOf(-0.048), 14, 4);
    const lx0 = 0.69 * W, lx1 = 0.78 * W, ly0 = vOf(0.004), ly1 = vOf(0.013);
    line(lx0, ly0, lx1, ly0); line(lx0, ly1, lx1, ly1); line(lx0, ly0, lx0, ly1); line(lx1, ly0, lx1, ly1);
  }
  // Loading ramp outline under the tail, with hinge line.
  {
    const y0 = vOf(0.05), y1 = vOf(0.0875);
    for (const [ua, ub] of [[0, 0.115], [0.885, 1]]) { line(ua * W, y0, ub * W, y0, 2.5); }
    line(0.115 * W, y0, 0.115 * W, y1, 2.5); line(0.885 * W, y0, 0.885 * W, y1, 2.5);
    g.fillStyle = 'rgba(10,10,8,0.35)'; g.fillRect(0, y0 - 3, 0.115 * W, 6); g.fillRect(0.885 * W, y0 - 3, 0.115 * W, 6);
  }
  // Walkway / anti-glare on the roof ahead of the forward pylon.
  g.fillStyle = 'rgba(12,12,10,0.85)'; g.fillRect(0.42 * W, vOf(-0.0745), 0.16 * W, vOf(-0.068) - vOf(-0.0745));
  // Stencils: serial on both sides of the aft fuselage, small warning text near the door.
  const stencil = (text, u, z, size, flip, color = 'rgba(14,14,10,0.92)') => {
    // Around-the-section u runs up the right side and down the left; v runs nose to tail. Both sides
    // are reflections of the canvas, so the text basis is mirrored to read nose-wards on the right
    // and tail-wards on the left, the right way up.
    g.save(); g.translate(u * W, vOf(z));
    if (flip) g.transform(0, 1, 1, 0, 0, 0); else g.transform(0, -1, -1, 0, 0, 0);
    g.fillStyle = color; g.font = `bold ${size}px "Arial Narrow", "Roboto Condensed", Arial, sans-serif`; g.textAlign = 'center';
    g.fillText(text, 0, size * 0.35); g.restore();
  };
  stencil('TEA-47', 0.215, 0.064, 34, false);
  stencil('TEA-47', 0.785, 0.064, 34, true);
  stencil('HELICOPTEA', 0.29, 0.02, 18, false, 'rgba(14,14,10,0.7)');
  stencil('HELICOPTEA', 0.71, 0.02, 18, true, 'rgba(14,14,10,0.7)');
  stencil('RESCUE', 0.29, -0.052, 10, false, 'rgba(200,190,60,0.9)');
  // Canvas rows run nose to tail, matching v, so no vertical flip.
  const tex = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; t.anisotropy = 8; return t; };
  return { map: tex(c, true), bump: tex(cb, false), rough: tex(cr, false) };
}

function stripTexture(base, line) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 256, 64);
  g.strokeStyle = line; g.lineWidth = 2;
  for (let x = 16; x < 256; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 64); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- materials
export function chinookMaterials() {
  const L = livery();
  return {
    paint: new THREE.MeshPhysicalMaterial({ map: L.map, bumpMap: L.bump, bumpScale: 0.5, roughnessMap: L.rough, roughness: 0.82, metalness: 0.05, clearcoat: 0.12, clearcoatRoughness: 0.6 }),
    olive: new THREE.MeshStandardMaterial({ color: 0x4b5236, roughness: 0.8, metalness: 0.05 }),
    oliveDark: new THREE.MeshStandardMaterial({ color: 0x3a4029, roughness: 0.85, metalness: 0.05 }),
    louvre: new THREE.MeshStandardMaterial({ map: stripTexture('#3d4430', '#15180f'), roughness: 0.85 }),
    black: new THREE.MeshStandardMaterial({ color: 0x141512, roughness: 0.9 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x2c3a3e, roughness: 0.04, metalness: 0.3, transparent: true, opacity: 0.62, envMapIntensity: 2.4, clearcoat: 1, clearcoatRoughness: 0.0, side: THREE.DoubleSide, depthWrite: false }),
    interior: new THREE.MeshStandardMaterial({ color: 0x23251f, roughness: 0.9, side: THREE.BackSide }),
    flight: new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.85 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0x3b4230, roughness: 0.45, clearcoat: 0.6 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x101214, roughness: 0.05, metalness: 0.6, clearcoat: 1 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.45, metalness: 0.75 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.3, metalness: 0.95 }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x3d322c, roughness: 0.5, metalness: 0.85, emissive: 0x1a0600, emissiveIntensity: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.88 }),
    hubMetal: new THREE.MeshStandardMaterial({ color: 0x5b5f5a, roughness: 0.4, metalness: 0.8 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x2a2c2d, roughness: 0.55, metalness: 0.15 }),
    bladeEdge: new THREE.MeshStandardMaterial({ color: 0x9ea2a4, roughness: 0.3, metalness: 0.9 }),
    bladeTip: new THREE.MeshStandardMaterial({ color: 0x8a8d86, roughness: 0.45 }),
    brass: new THREE.MeshStandardMaterial({ color: 0xd4a548, roughness: 0.3, metalness: 1.0 }),
    navRed: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    navGreen: new THREE.MeshBasicMaterial({ color: 0x2aff6a }),
    beacon: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a0a, emissiveIntensity: 0 }),
  };
}

function discMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0.0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `uniform float uOpacity; varying vec3 vP;
      void main(){ float r = length(vP.xy)/${R.toFixed(3)};
        float a = 0.06 + 0.09*smoothstep(0.75,0.99,r) - 0.035*smoothstep(0.0,0.4,r);
        float tip = smoothstep(0.93,0.97,r)*smoothstep(1.0,0.975,r);
        vec3 col = mix(vec3(0.15,0.16,0.16), vec3(0.62,0.64,0.6), tip);
        gl_FragColor = vec4(col, (a + tip*0.12)*uOpacity); }`,
  });
}

// ---------------------------------------------------------------- build
export function buildChinook(M = chinookMaterials()) {
  const root = new THREE.Group();
  root.name = 'chinook';
  const parts = {};
  for (const p of CHINOOK_PARTS) {
    const g = new THREE.Group();
    g.position.set(...p.pos);
    g.name = p.name;
    parts[p.name] = g;
  }
  const add = (part, mesh, x = 0, y = 0, z = 0) => {
    const q = P[part].pos;
    mesh.position.set(x - q[0], y - q[1], z - q[2]);
    parts[part].add(mesh);
    return mesh;
  };
  const cyl = (r0, r1, h, seg = 16) => new THREE.CylinderGeometry(r0, r1, h, seg);

  // --- Fuselage in three sections that break apart at the frames.
  const mats = [M.paint, M.glass, M.black];
  const noseGeo = noseShellGeometry();
  const cabinGeo = loft(FUSELAGE, -0.045, 0.045, { steps: 24, segs: 56 });
  const aftGeo = loft(FUSELAGE, 0.045, 0.089, { steps: 22, segs: 56, capB: true });
  const nose = new THREE.Mesh(noseGeo, mats);
  add('noseCab', nose);
  add('cabin', new THREE.Mesh(cabinGeo, M.paint));
  add('aftCabin', new THREE.Mesh(aftGeo, M.paint));
  // Dark inner lining: the cockpit reads through the glazing, and broken sections look like shells.
  add('noseCab', new THREE.Mesh(noseGeo, [M.interior, M.interior, M.interior]));
  add('cabin', new THREE.Mesh(cabinGeo, M.interior));
  add('aftCabin', new THREE.Mesh(aftGeo, M.interior));

  // Cockpit: instrument coaming, bulkhead and two crew in olive flight suits.
  {
    const bulkhead = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.034), new THREE.MeshStandardMaterial({ color: 0x1e201b, roughness: 0.9 }));
    add('noseCab', bulkhead, 0, 0.002, -0.0625);
    bulkhead.rotation.y = Math.PI;
    const coaming = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.004, 0.006), M.black);
    add('noseCab', coaming, 0, 0.004, -0.079);
    for (const sx of [-0.0072, 0.0072]) {
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.0034, 0.004, 4, 10), M.flight);
      add('noseCab', body, sx, -0.0015, -0.0715);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.0032, 14, 10), M.helmet);
      add('noseCab', head, sx, 0.0062, -0.0725);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.0033, 14, 10, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.35, Math.PI * 0.3), M.visor);
      visor.rotation.y = Math.PI;
      add('noseCab', visor, sx, 0.0062, -0.0727);
    }
    // Pitot tubes and the nose vent.
    for (const sx of [-0.007, 0.007]) {
      const pit = new THREE.Mesh(cyl(0.0004, 0.0004, 0.008, 6), M.alu);
      pit.rotation.x = Math.PI / 2;
      add('noseCab', pit, sx, 0.0045, -0.088);
    }
  }

  // Spine (drive-shaft tunnel) between the pylons, with walkway louvres.
  {
    const spine = new THREE.Mesh(loft(SPINE, -0.045, 0.04, { steps: 6, segs: 24 }), M.olive);
    add('cabin', spine);
    for (let z = -0.03; z < 0.03; z += 0.012) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.0085, 0.0006, 0.007), M.louvre);
      add('cabin', l, 0, 0.0274, z);
    }
  }
  // Forward pylon: fairing over the cockpit, transmission vents, mast and rotor head.
  {
    const py = new THREE.Mesh(loft(FWD_PYLON, -0.085, -0.038, { steps: 22, segs: 32, capA: true, capB: true }), M.olive);
    add('fwdPylon', py);
    for (const sx of [-1, 1]) {
      const vent = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.007, 0.012), M.louvre);
      add('fwdPylon', vent, sx * 0.0097, 0.029, -0.059);
    }
  }
  // Aft pylon: tall fairing, intake grilles, the fin-like trailing edge, beacon.
  {
    const py = new THREE.Mesh(loft(AFT_PYLON, 0.03, 0.095, { steps: 26, segs: 32, capB: true }), M.olive);
    add('aftPylon', py);
    for (const sx of [-1, 1]) {
      const grille = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.009, 0.018), M.louvre);
      add('aftPylon', grille, sx * 0.0119, 0.04, 0.07);
    }
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 10, 8), M.beacon);
    add('aftPylon', beacon, 0, 0.0445, 0.088);
    parts.aftPylon.userData.beacon = beacon;
  }
  // Engines: turboshaft pods on short pylons either side of the aft pylon.
  for (const [name, sx] of [['engineL', -1], ['engineR', 1]]) {
    const x = sx * 0.0175, y = 0.031, zc = 0.058;
    const pod = new THREE.Mesh(cyl(0.0055, 0.0052, 0.03, 20), M.olive);
    pod.rotation.x = Math.PI / 2;
    add(name, pod, x, y, zc);
    const intake = new THREE.Mesh(cyl(0.0052, 0.0056, 0.003, 20), M.alu);
    intake.rotation.x = Math.PI / 2;
    add(name, intake, x, y, zc - 0.0165);
    const intakeHole = new THREE.Mesh(new THREE.CircleGeometry(0.0044, 18), M.black);
    intakeHole.rotation.y = Math.PI;
    add(name, intakeHole, x, y, zc - 0.0181);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.0022, 0.004, 14), M.darkMetal);
    cone.rotation.x = -Math.PI / 2;
    add(name, cone, x, y, zc - 0.0195);
    const ex = new THREE.Mesh(cyl(0.0048, 0.0042, 0.006, 18, 1, true), M.exhaust);
    ex.rotation.x = Math.PI / 2;
    add(name, ex, x, y, zc + 0.018);
    const strut = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.002, 0.016), M.oliveDark);
    add(name, strut, x - sx * 0.005, y + 0.0005, zc);
    // Exhaust stain on the pylon behind.
    const band = new THREE.Mesh(cyl(0.0056, 0.0056, 0.003, 20), M.oliveDark);
    band.rotation.x = Math.PI / 2;
    add(name, band, x, y, zc + 0.004);
  }
  // Sponsons with nav lights and steps.
  for (const [name, sx] of [['sponsonL', -1], ['sponsonR', 1]]) {
    const s = new THREE.Mesh(loft(SPONSON, -0.052, 0.049, { steps: 18, segs: 24, capA: true, capB: true }), M.paint);
    s.scale.x = 1;
    add(name, s, sx * 0.0245, 0, 0);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.0011, 8, 6), sx < 0 ? M.navRed : M.navGreen);
    add(name, nav, sx * 0.0298, -0.008, -0.04);
    const step = new THREE.Mesh(new THREE.BoxGeometry(0.0012, 0.0008, 0.005), M.black);
    add(name, step, sx * 0.0298, -0.0145, -0.03);
  }
  // Landing gear: twin forward wheels on oleo legs, single steerable aft wheels.
  const wheel = (name, x, z, twin) => {
    const yAxle = -0.026;
    const tyreGeo = new THREE.TorusGeometry(0.0038, 0.0017, 10, 22);
    const offs = twin ? [-0.0021, 0.0021] : [0];
    for (const dx of offs) {
      const t = new THREE.Mesh(tyreGeo, M.rubber);
      t.rotation.y = Math.PI / 2;
      add(name, t, x + dx, yAxle, z);
      const hub = new THREE.Mesh(cyl(0.0024, 0.0024, 0.0026, 14), M.oliveDark);
      hub.rotation.z = Math.PI / 2;
      add(name, hub, x + dx, yAxle, z);
    }
    const leg = new THREE.Mesh(cyl(0.0011, 0.0013, 0.012, 8), M.alu);
    add(name, leg, x, yAxle + 0.0065, z - 0.0005);
    const drag = new THREE.Mesh(cyl(0.0007, 0.0007, 0.011, 6), M.darkMetal);
    drag.rotation.x = 0.7;
    add(name, drag, x, yAxle + 0.006, z + 0.004);
  };
  wheel('gearFL', -0.019, -0.05, true);
  wheel('gearFR', 0.019, -0.05, true);
  wheel('gearRL', -0.021, 0.046, false);
  wheel('gearRR', 0.021, 0.046, false);

  // Three belly hooks (brass, so they read against the drab), on short pendants.
  for (const h of CFG.chinook.hooks) {
    const pend = new THREE.Mesh(cyl(0.0006, 0.0006, -0.018 - h[1] + 0.002, 6), M.darkMetal);
    add('cabin', pend, h[0], (h[1] - 0.018) / 2 + 0.002, h[2]);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.0026, 0.0007, 8, 16, Math.PI * 1.6), M.brass);
    hook.rotation.y = Math.PI / 2;
    hook.rotation.x = Math.PI * 0.2;
    add('cabin', hook, h[0], h[1] + 0.0022, h[2]);
  }

  // --- Rotor heads, discs and blades. Blade parts ride in the rotor groups while flying.
  const bladeGeo = (() => {
    const s = new THREE.Shape();
    const r0 = 0.0095, r1 = R, ch = 0.0039;
    s.moveTo(r0, -ch * 0.8); s.lineTo(r0 + 0.008, -ch); s.lineTo(r1 - 0.004, -ch); s.lineTo(r1, -ch * 0.55);
    s.lineTo(r1, ch * 0.75); s.lineTo(r1 - 0.004, ch); s.lineTo(r0 + 0.008, ch); s.lineTo(r0, ch * 0.8); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0008, bevelEnabled: false, curveSegments: 2 });
    geo.rotateX(Math.PI / 2);
    geo.translate(-0.05, 0.0004, 0);  // part origin at mid-span (0.05 from the hub)
    return geo;
  })();
  const edgeGeo = new THREE.BoxGeometry(R - 0.018, 0.0009, 0.0007);
  const tipGeo = new THREE.BoxGeometry(0.004, 0.0009, 0.0072);
  const rotors = [];
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x2a2c2d, transparent: true, opacity: 0.12, depthWrite: false });
  HUBS.forEach((hub, ri) => {
    const pylon = ri === 0 ? 'fwdPylon' : 'aftPylon';
    const mastBase = ri === 0 ? 0.035 : 0.046;
    const mast = new THREE.Mesh(cyl(0.0019, 0.0024, hub[1] - mastBase, 12), M.darkMetal);
    add(pylon, mast, hub[0], (hub[1] + mastBase) / 2, hub[2]);
    const swash = new THREE.Mesh(cyl(0.0034, 0.0034, 0.0012, 18), M.alu);
    add(pylon, swash, hub[0], mastBase + 0.002, hub[2]);
    const rotor = new THREE.Group();
    rotor.position.set(hub[0] - P[pylon].pos[0], hub[1] - P[pylon].pos[1], hub[2] - P[pylon].pos[2]);
    parts[pylon].add(rotor);
    const head = new THREE.Group();
    const hubBody = new THREE.Mesh(cyl(0.0036, 0.0042, 0.0034, 18), M.hubMetal);
    head.add(hubBody);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.0026, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hubMetal);
    cap.position.y = 0.0017;
    head.add(cap);
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.0075, 0.0018, 0.0028), M.hubMetal);
      arm.position.set(Math.cos(a) * 0.0058, 0, -Math.sin(a) * 0.0058);
      arm.rotation.y = a;
      head.add(arm);
      const damper = new THREE.Mesh(cyl(0.0006, 0.0006, 0.005, 6), M.alu);
      damper.rotation.z = Math.PI / 2;
      damper.position.set(Math.cos(a + 0.5) * 0.005, 0.0012, -Math.sin(a + 0.5) * 0.005);
      damper.rotation.y = a + 0.5;
      head.add(damper);
    }
    rotor.add(head);
    rotor.userData.head = head;
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.01, R, 72, 1), discMaterial());
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0006;
    rotor.add(disc);
    rotor.userData.disc = disc;
    const holder = new THREE.Group();
    for (let k = 0; k < 3; k++) {
      const name = `blade${ri ? 'A' : 'F'}${k}`;
      const g = parts[name];
      const a = k * Math.PI * 2 / 3;
      g.position.set(Math.cos(a) * 0.05, 0, -Math.sin(a) * 0.05);
      g.rotation.set(0, a, 0);
      const b = new THREE.Mesh(bladeGeo, M.blade);
      const edge = new THREE.Mesh(edgeGeo, M.bladeEdge);
      // Leading edge: the front of the blade in the direction of rotation.
      const dir = ri === 0 ? 1 : -1;
      edge.position.set((0.0095 + R - 0.018) / 2 + 0.0045 - 0.05, 0.0004, -dir * 0.0037);
      const tip = new THREE.Mesh(tipGeo, M.bladeTip);
      tip.position.set(R - 0.002 - 0.05, 0.0004, 0);
      g.add(b, edge, tip);
      holder.add(g);
    }
    rotor.add(holder);
    const ghosts = [];
    for (let j = 1; j <= 3; j++) {
      const gh = new THREE.Group();
      for (let k = 0; k < 3; k++) {
        const m = new THREE.Mesh(bladeGeo, ghostMat);
        const a = k * Math.PI * 2 / 3;
        m.position.set(Math.cos(a) * 0.05, 0, -Math.sin(a) * 0.05);
        m.rotation.y = a;
        gh.add(m);
      }
      gh.userData.offset = -(ri === 0 ? 1 : -1) * j * 0.16;
      rotor.add(gh);
      ghosts.push(gh);
    }
    rotor.userData.ghosts = ghosts;
    rotors.push(rotor);
  });

  // Static meshes of each part merge by material (draw calls), leaving the spinning rotors and the beacon.
  const keep = [...rotors, parts.aftPylon.userData.beacon];
  for (const p of CHINOOK_PARTS) if (!p.blade) mergeStatic(parts[p.name], keep);
  for (const r of rotors) for (const gh of r.userData.ghosts) mergeStatic(gh, []);
  for (const p of CHINOOK_PARTS) if (!p.blade) root.add(parts[p.name]);
  root.traverse((o) => { if (o.isMesh && !(Array.isArray(o.material) ? false : o.material.transparent)) { o.castShadow = true; o.receiveShadow = true; } });
  nose.castShadow = true; nose.receiveShadow = true;
  root.userData = { parts, rotors, beacon: parts.aftPylon.userData.beacon };
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
    if (!merged) continue;
    part.add(new THREE.Mesh(merged, mat));
  }
}

// Clone of one part for a debris body (centred on the part origin), scorched, with ember glow hooks.
export function cloneChinookPart(model, name) {
  const src = model.userData.parts[name];
  const rotors = model.userData.rotors;
  const g = new THREE.Group();
  for (const child of src.children) {
    if (rotors.includes(child)) {
      // A pylon keeps its rotor head but not the blades or blur.
      const head = child.userData.head.clone(true);
      head.position.copy(child.position);
      g.add(head);
      continue;
    }
    g.add(child.clone(true));
  }
  g.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true;
    const scorch = (m0) => {
      const m = m0.clone();
      if (m.color) m.color.multiplyScalar(0.5);
      if ('emissive' in m) { m.emissive = new THREE.Color(0xff5a1a); m.emissiveIntensity = 0.0; }
      if (m.transparent && m !== o.material) m.opacity *= 0.6;
      return m;
    };
    if (Array.isArray(o.material)) o.material = o.material.map(scorch);
    else {
      if (o.material.transparent) { o.visible = false; return; }
      o.material = scorch(o.material);
    }
  });
  g.userData.embers = [];
  g.userData.emberScale = 0.3;   // olive drab smoulders; it doesn't glow like the micro's red paint
  g.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m.emissive) g.userData.embers.push(m);
  });
  return g;
}
