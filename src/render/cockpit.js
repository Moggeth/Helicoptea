import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { cabinShellGeometry, CABIN_SECS, sectionPoint } from './heliModel.js';
import { noseShellGeometry } from './chinookModel.js';
import { InstrumentPanel, consoleTexture } from './instruments.js';

// First-person cockpits. Each interior is modelled in the aircraft's body coordinates at model scale
// and drawn as a separate layer over the world (its own scene and camera, with a near plane of 0.4 mm
// and its own small shadow map), so the cabin never clips and the world keeps a sane depth range.
// The window openings come from the same lofted shells as the outside of each aircraft.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _qi = new THREE.Quaternion();
const _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);

// ---------------------------------------------------------------- textures (small, tiled)
function canvasTex(size, draw, repeat = [1, 1], srgb = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(...repeat);
  t.anisotropy = 4;
  return t;
}
function speckle(g, n, a, b, alpha) {
  for (let i = 0; i < n; i++) {
    const v = a + Math.random() * (b - a);
    g.fillStyle = `rgba(${v},${v},${v},${alpha})`;
    g.fillRect(Math.random() * g.canvas.width, Math.random() * g.canvas.height, 1 + Math.random() * 1.5, 1 + Math.random() * 1.5);
  }
}
// Woven headliner / seat fabric.
const fabric = (base, repeat) => canvasTex(128, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  for (let y = 0; y < s; y += 2) { g.fillStyle = `rgba(0,0,0,${y % 4 ? 0.05 : 0.09})`; g.fillRect(0, y, s, 1); }
  for (let x = 0; x < s; x += 2) { g.fillStyle = `rgba(255,255,255,${x % 4 ? 0.02 : 0.04})`; g.fillRect(x, 0, 1, s); }
  speckle(g, 900, 0, 255, 0.05);
}, repeat);
// Diamond-tread rubber floor mat.
const tread = (repeat) => canvasTex(128, (g, s) => {
  g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, s, s);
  g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2;
  for (let k = -s; k < 2 * s; k += 16) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + s, s); g.stroke(); g.beginPath(); g.moveTo(k, s); g.lineTo(k + s, 0); g.stroke(); }
  speckle(g, 500, 60, 140, 0.08);
}, repeat);
// Crinkle-finish paint on the panel housing and consoles.
const crinkle = (base, repeat) => canvasTex(128, (g, s) => { g.fillStyle = base; g.fillRect(0, 0, s, s); speckle(g, 2600, 0, 255, 0.06); }, repeat);
// Leather with quilting seams (seat cushions and backs).
const leather = (base, repeat) => canvasTex(256, (g, s) => {
  g.fillStyle = base; g.fillRect(0, 0, s, s);
  speckle(g, 3000, 20, 90, 0.08);
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
  for (const x of [s * 0.25, s * 0.5, s * 0.75]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, s); g.stroke(); }
  g.strokeStyle = 'rgba(255,230,200,0.18)'; g.setLineDash([4, 5]); g.lineWidth = 1.5;
  for (const x of [s * 0.25, s * 0.5, s * 0.75]) { g.beginPath(); g.moveTo(x + 5, 0); g.lineTo(x + 5, s); g.stroke(); }
}, repeat);
// Pilot's kneeboard: a clipped checklist.
const kneeboardTex = () => canvasTex(256, (g, s) => {
  g.fillStyle = '#f1ece0'; g.fillRect(0, 0, s, s);
  g.fillStyle = '#20242a'; g.font = '700 22px Arial, sans-serif'; g.fillText('HOVER CHECK', 20, 54);
  g.font = '15px Arial, sans-serif';
  const lines = ['Hook . . . . . . . ARMED', 'Load . . . . . . . CHECKED', 'Rotor . . . . . . . 100%', 'Tea . . . . . . . . . STEEP', 'Milk . . . . . . . . . . . ½', 'Biscuits . . . . . STOWED'];
  lines.forEach((l, i) => g.fillText(l, 20, 92 + i * 26));
  g.fillStyle = '#7a7d82'; g.fillRect(s * 0.3, 0, s * 0.4, 22);
}, [1, 1]);
// Standby compass card: a strip of the full 360 degrees that scrolls behind the lubber line.
const COMPASS_SPAN = 70;   // degrees visible through the window
function compassStrip() {
  const w = 2048, h = 256;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#e9e3d0'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#16181a'; g.strokeStyle = '#16181a'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let d = 0; d < 360; d += 5) {
    const x = d / 360 * w;
    g.lineWidth = d % 30 === 0 ? 6 : 3;
    g.beginPath(); g.moveTo(x, h); g.lineTo(x, h - (d % 10 === 0 ? 70 : 40)); g.stroke();
    if (d % 30 === 0) {
      g.font = `700 ${d % 90 === 0 ? 96 : 76}px Arial, sans-serif`;
      g.fillText({ 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10), x, h * 0.36);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 8;
  t.repeat.set(COMPASS_SPAN / 360, 1);
  return t;
}

function materials(kind) {
  const micro = kind === 'micro';
  return {
    lining: new THREE.MeshStandardMaterial({ map: fabric(micro ? '#8d8a82' : '#4a4f42', [34, 20]), roughness: 0.95, side: THREE.BackSide }),
    frame: new THREE.MeshStandardMaterial({ color: micro ? 0x2b2c2e : 0x1a1b18, roughness: 0.8, side: THREE.BackSide }),
    post: new THREE.MeshStandardMaterial({ color: micro ? 0x2a2b2d : 0x23251f, roughness: 0.6, metalness: 0.2 }),
    seal: new THREE.MeshStandardMaterial({ color: 0x101010, roughness: 0.75 }),
    glass: new THREE.MeshPhysicalMaterial({ color: micro ? 0xd2e2de : 0xbccac6, roughness: 0.22, metalness: 0, transparent: true, opacity: 0.08, envMapIntensity: 0.55, side: THREE.DoubleSide, depthWrite: false }),
    hidden: new THREE.MeshBasicMaterial({ visible: false }),
    floor: new THREE.MeshStandardMaterial({ map: tread([5, 7]), roughness: 0.92 }),
    panelBody: new THREE.MeshStandardMaterial({ map: crinkle(micro ? '#2a2c2f' : '#24261f', [3, 3]), roughness: 0.78, metalness: 0.1 }),
    glare: new THREE.MeshStandardMaterial({ map: crinkle('#141516', [6, 2]), roughness: 0.98 }),
    trim: new THREE.MeshStandardMaterial({ map: fabric(micro ? '#4c4a46' : '#3a3e33', [6, 6]), roughness: 0.9 }),
    seat: new THREE.MeshStandardMaterial({ map: micro ? leather('#6c4f37', [1, 1]) : fabric('#40463a', [4, 4]), roughness: micro ? 0.58 : 0.9 }),
    seatFrame: new THREE.MeshStandardMaterial({ color: 0x3a3c3f, roughness: 0.45, metalness: 0.7 }),
    belt: new THREE.MeshStandardMaterial({ map: fabric(micro ? '#27324a' : '#4b4a33', [2, 8]), roughness: 0.85 }),
    buckle: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 1 }),
    suit: new THREE.MeshStandardMaterial({ map: fabric(micro ? '#4b5a3c' : '#55603f', [3, 3]), roughness: 0.92 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x2a231c, roughness: 0.62 }),
    boot: new THREE.MeshStandardMaterial({ color: 0x1b1a19, roughness: 0.5 }),
    stick: new THREE.MeshStandardMaterial({ color: 0x1a1b1e, roughness: 0.42, metalness: 0.35 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9da1a6, roughness: 0.32, metalness: 0.9 }),
    red: new THREE.MeshStandardMaterial({ color: 0xa82020, roughness: 0.45 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xd9a520, roughness: 0.5 }),
    paper: new THREE.MeshStandardMaterial({ map: kneeboardTex(), roughness: 0.85 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: micro ? 0xf2f2ee : 0x3b4230, roughness: 0.35, clearcoat: 0.8 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.6, clearcoat: 1 }),
  };
}

// ---------------------------------------------------------------- geometry helpers
// Capsule along +Y with unit cylinder length: oriented between two points each frame by setLimb.
function limbGeo(r, r2 = r) {
  const g = new THREE.CylinderGeometry(r2, r, 1, 12, 1, true);
  return g;
}
function setLimb(mesh, a, b) {
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  _b.subVectors(b, a);
  const len = _b.length();
  mesh.quaternion.setFromUnitVectors(_up, _b.divideScalar(len || 1));
  mesh.scale.set(1, len, 1);
}
// Static tapered limb from a (radius ra) to b (radius rb), with rounded ends.
function limb(mat, ra, a, b, rb = ra) {
  const len = a.distanceTo(b);
  const g = mergeGeometries([
    new THREE.CylinderGeometry(rb, ra, len, 14, 1, true).translate(0, len / 2, 0),
    new THREE.SphereGeometry(ra, 14, 8),
    new THREE.SphereGeometry(rb, 14, 8).translate(0, len, 0),
  ].map((x) => x.toNonIndexed()), false);
  const m = new THREE.Mesh(g, mat);
  m.position.copy(a);
  m.quaternion.setFromUnitVectors(_up, _b.subVectors(b, a).normalize());
  return m;
}
function box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, round = 0) {
  const geo = round > 0 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(round, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z); m.rotation.set(rx, ry, rz);
  return m;
}
function tubeThrough(pts, r, mat, closed = false) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.2), Math.max(10, pts.length * 4), r, 6, closed), mat);
}

// Merge every static mesh under root by material (draw calls), leaving `keep` subtrees alone.
function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const byMat = new Map(), victims = [];
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.material.transparent || o.userData.keep) return;
    for (let a = o; a && a !== root; a = a.parent) if (keep.includes(a)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const n of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(n)) g.deleteAttribute(n);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(_m.copy(root.matrixWorld).invert().multiply(o.matrixWorld));
    g.clearGroups();
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const [mat, geos] of byMat) {
    const m = new THREE.Mesh(mergeGeometries(geos, false), mat);
    m.castShadow = m.receiveShadow = true;
    root.add(m);
  }
}

// Micro-heli cabin section at z (linear between the loft's keyframes; close enough for frame tubes).
function microSection(z) {
  const S = CABIN_SECS;
  let i = 0;
  while (i < S.length - 2 && S[i + 1].z < z) i++;
  const a = S[i], b = S[i + 1], t = THREE.MathUtils.clamp((z - a.z) / (b.z - a.z), 0, 1);
  const L = (k, d) => (a[k] ?? d) + ((b[k] ?? d) - (a[k] ?? d)) * t;
  return { hw: L('hw'), yb: L('yb'), yt: L('yt'), nTop: L('nTop', 2.4), nBot: L('nBot', 3.6) };
}
function onShell(z, a, inset = 0.975) {
  const sec = microSection(z);
  const [x, y] = sectionPoint(sec, a);
  const mid = (sec.yt + sec.yb) / 2;
  return V(x * inset, mid + (y - mid) * inset, z);
}
// A frame loop around a window that spans z0..z1 and section angles a0..a1 (right side; sx mirrors).
function windowFrame(z0, z1, a0, a1, sx, r, mat) {
  const pts = [];
  const n = 6;
  for (let i = 0; i <= n; i++) pts.push(onShell(z0 + (z1 - z0) * i / n, a0));
  for (let i = 1; i <= n; i++) pts.push(onShell(z1, a0 + (a1 - a0) * i / n));
  for (let i = 1; i <= n; i++) pts.push(onShell(z1 - (z1 - z0) * i / n, a1));
  for (let i = 1; i < n; i++) pts.push(onShell(z0, a1 - (a1 - a0) * i / n));
  for (const p of pts) p.x *= sx;
  return tubeThrough(pts, r, mat, true);
}
// Glare-shield hood: a curved lip profile extruded across the cabin (x from x0, width w).
function hoodGeometry(w, back, front, top, lipDrop, thick) {
  const s = new THREE.Shape();
  // Profile in (u = -z, v = y).
  s.moveTo(-back, top - thick);
  s.quadraticCurveTo(-(back + front) / 2, top + thick * 1.6, -front, top);
  s.lineTo(-front + 0.0002, top - lipDrop);
  s.lineTo(-front - thick * 0.8, top - lipDrop + 0.0002);
  s.quadraticCurveTo(-(back + front) / 2, top + thick * 0.2, -back, top - thick * 2);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: true, bevelThickness: thick * 0.3, bevelSize: thick * 0.3, bevelSegments: 2, curveSegments: 10 });
  g.rotateY(Math.PI / 2);
  return g;
}

export class Cockpit {
  constructor(renderer, worldScene, quality, kitchen, loadCam, aircraft = 'micro') {
    this.renderer = renderer;
    this.quality = quality;
    this.hi = (quality.name === 'high' || quality.name === 'ultra');
    this.loadCam = loadCam;
    this.scene = new THREE.Scene();
    this.scene.environment = worldScene.environment;
    this.scene.environmentIntensity = 0.28;
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.0004, 0.4);
    this.sunDirW = kitchen.sun.position.clone().sub(kitchen.sun.target.position).normalize();
    this.sunColor = kitchen.sun.color.clone();
    // Lights follow the airframe: the sun swings across the panel as you turn.
    this.hemi = new THREE.HemisphereLight(0xe8eef8, 0x6a5440, 0.32);
    this.sun = new THREE.DirectionalLight(this.sunColor, kitchen.sun.intensity * 0.95);
    this.sun.castShadow = quality.shadows > 0;
    const sm = (quality.name === 'high' || quality.name === 'ultra') ? 1024 : 512;
    this.sun.shadow.mapSize.set(sm, sm);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.00004;
    this.sun.shadow.radius = 3;
    this.scene.add(this.hemi, this.sun, this.sun.target);
    this.interiors = {};
    this.ensureInterior(aircraft);
    this.kind = null;
    this.buildPip();
  }

  // ---------------------------------------------------------------- shared pieces
  // The instrument panel (render/instruments.js): its face, live instruments and the hook-camera display.
  panelGroup(kind, M, w, h) {
    const panel = new InstrumentPanel(kind, this.quality, this.loadCam.rt.texture, this.renderer.capabilities.getMaxAnisotropy());
    return { group: panel.build(w, h, M.panelBody), panel };
  }

  // A seated pilot's body (legs, arms, gloves) and the controls they hold, in body-frame points.
  // s scales the small offsets (1 micro, ~0.36 Chinook). Returns the animated parts.
  pilotRig(M, P, s, root, { self = true } = {}) {
    const anim = {};
    const knees = [];
    // Thighs (tapered toward the knee) and knees.
    for (const sx of [-1, 1]) {
      const hip = V(P.x + sx * 0.0029 * s, P.hipY, P.hipZ), knee = V(P.x + sx * 0.0034 * s, P.kneeY, P.kneeZ);
      root.add(limb(M.suit, 0.0027 * s, hip, knee, 0.0021 * s));
      knees.push(knee);
    }
    // Kneeboard strapped on the right thigh.
    if (self) {
      const kb = new THREE.Mesh(new THREE.PlaneGeometry(0.0042 * s, 0.0058 * s), M.paper);
      const k = knees[1], hp = V(P.x + 0.0029 * s, P.hipY, P.hipZ);
      kb.position.lerpVectors(hp, k, 0.6).add(V(0, 0.0026 * s, 0));
      kb.rotation.set(-Math.PI / 2 + Math.atan2(k.y - hp.y, hp.z - k.z), 0, 0);   // face up, text toward the knee
      root.add(kb);
      const strap = box(M.belt, 0.0058 * s, 0.0003 * s, 0.0009 * s, kb.position.x, kb.position.y - 0.0001 * s, kb.position.z - 0.0018 * s);
      root.add(strap);
    }
    // Lap belt and buckle across the thighs.
    root.add(box(M.belt, 0.0082 * s, 0.0005 * s, 0.0018 * s, P.x, P.hipY + 0.0026 * s, P.hipZ - 0.0026 * s, 0, 0, 0, 0.0002 * s));
    root.add(box(M.buckle, 0.0018 * s, 0.0006 * s, 0.0016 * s, P.x, P.hipY + 0.003 * s, P.hipZ - 0.0028 * s, 0, 0, 0, 0.0002 * s));
    // Torso and shoulder straps (seen when you look down).
    root.add(limb(M.suit, 0.0040 * s, V(P.x, P.hipY + 0.002 * s, P.hipZ + 0.0016 * s), V(P.x, P.shY - 0.0012 * s, P.shZ), 0.0044 * s));
    for (const sx of [-1, 1]) root.add(limb(M.belt, 0.00045 * s, V(P.x + sx * 0.0022 * s, P.shY + 0.0006 * s, P.shZ - 0.003 * s), V(P.x + sx * 0.0006 * s, P.hipY + 0.0032 * s, P.hipZ - 0.0030 * s)));
    // Pedals with boots, shins (animated).
    anim.pedals = [];
    for (const sx of [-1, 1]) {
      const pg = new THREE.Group();
      pg.position.set(P.x + sx * 0.0030 * s, P.pedalY, P.pedalZ);
      pg.rotation.x = -1.0;
      pg.add(box(M.metal, 0.0034 * s, 0.0050 * s, 0.0005 * s, 0, 0, 0, 0, 0, 0, 0.0002 * s));
      pg.add(box(M.boot, 0.0030 * s, 0.0058 * s, 0.0030 * s, 0, 0.0006 * s, 0.0019 * s, 0, 0, 0, 0.0011 * s));
      pg.add(box(M.boot, 0.0030 * s, 0.0026 * s, 0.0034 * s, 0, -0.0016 * s, 0.0038 * s, 0.9, 0, 0, 0.001 * s));
      root.add(pg);
      const shin = new THREE.Mesh(limbGeo(0.0019 * s, 0.0016 * s), M.suit);
      root.add(shin);
      const kneeCap = new THREE.Mesh(new THREE.SphereGeometry(0.0021 * s, 14, 10), M.suit);
      kneeCap.position.copy(knees[sx < 0 ? 0 : 1]);
      root.add(kneeCap);
      anim.pedals.push({ g: pg, sx, z0: P.pedalZ, shin, knee: knees[sx < 0 ? 0 : 1] });
    }
    // Cyclic between the knees: a gently cranked tube with a moulded grip.
    const cyc = new THREE.Group();
    cyc.position.set(P.x, P.floorY + 0.0002, P.cycZ);
    const L = P.cycLen;
    const stickCurve = [V(0, 0, 0), V(0, L * 0.35, -L * 0.03), V(0, L * 0.7, L * 0.06), V(0, L, L * 0.04)];
    cyc.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(stickCurve), 16, 0.00048 * s, 10), M.stick));
    const boot = new THREE.Mesh(new THREE.ConeGeometry(0.0018 * s, 0.0024 * s, 14, 3, true), M.glare); boot.position.y = 0.001 * s; cyc.add(boot);
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.00085 * s, 0.0024 * s, 4, 12), M.stick); grip.position.set(0, L + 0.0008 * s, L * 0.04); grip.rotation.x = 0.28; cyc.add(grip);
    cyc.add(box(M.red, 0.0006 * s, 0.0008 * s, 0.0005 * s, 0, L + 0.0012 * s, L * 0.04 - 0.0008 * s));
    cyc.add(box(M.metal, 0.0005 * s, 0.0004 * s, 0.0005 * s, 0.0004 * s, L + 0.0021 * s, L * 0.04 + 0.0002 * s));
    const gloveR = new THREE.Mesh(new THREE.CapsuleGeometry(0.0012 * s, 0.0015 * s, 4, 12), M.glove);
    gloveR.position.set(0.00025 * s, L + 0.0001 * s, L * 0.04 + 0.0003 * s); gloveR.rotation.set(0.25, 0, Math.PI / 2 - 0.3); cyc.add(gloveR);
    const thumbR = new THREE.Mesh(new THREE.CapsuleGeometry(0.00042 * s, 0.0011 * s, 3, 8), M.glove);
    thumbR.position.set(-0.0005 * s, L + 0.0012 * s, L * 0.04 - 0.0002 * s); thumbR.rotation.set(0.6, 0, 0.5); cyc.add(thumbR);
    root.add(cyc);
    anim.cyclic = { g: cyc, base: P.cycTilt, wrist: V(0.0012 * s, L - 0.0004 * s, L * 0.04 + 0.0008 * s) };
    // Collective lever beside the seat, hinged at the back, twist-grip throttle and switch box at the front.
    const col = new THREE.Group();
    col.position.set(P.colX, P.colY, P.colZ);
    const CL = P.colLen;
    col.add(new THREE.Mesh(new THREE.CylinderGeometry(0.00055 * s, 0.0007 * s, CL, 10).rotateX(Math.PI / 2).translate(0, 0, -CL / 2), M.metal));
    col.add(new THREE.Mesh(new THREE.CylinderGeometry(0.00095 * s, 0.00095 * s, 0.0044 * s, 14).rotateX(Math.PI / 2).translate(0, 0, -CL + 0.0017 * s), M.stick));
    col.add(box(M.stick, 0.0018 * s, 0.0016 * s, 0.002 * s, 0, 0.0004 * s, -CL - 0.0005 * s, 0, 0, 0, 0.0004 * s));
    col.add(box(M.yellow, 0.0004 * s, 0.0005 * s, 0.0004 * s, 0.0004 * s, 0.0013 * s, -CL - 0.0004 * s));
    col.add(box(M.glare, 0.0024 * s, 0.0012 * s, 0.0012 * s, 0, -0.0006 * s, -0.0002 * s, 0, 0, 0, 0.0004 * s));
    const gloveL = new THREE.Mesh(new THREE.CapsuleGeometry(0.0012 * s, 0.0017 * s, 4, 12), M.glove);
    gloveL.position.set(0.0002 * s, 0.0007 * s, -CL + 0.0018 * s); gloveL.rotation.set(Math.PI / 2, 0, 0.3); col.add(gloveL);
    root.add(col);
    anim.collective = { g: col, wrist: V(0.0006 * s, 0.0005 * s, -CL + 0.0036 * s) };
    // Forearms and upper arms (animated: they follow the controls).
    const arm = (elbow, shoulder) => ({ fore: new THREE.Mesh(limbGeo(0.0016 * s, 0.0012 * s), M.suit), upper: new THREE.Mesh(limbGeo(0.0019 * s, 0.0017 * s), M.suit), elbowJ: new THREE.Mesh(new THREE.SphereGeometry(0.0017 * s, 12, 8), M.suit), elbow, shoulder });
    anim.armR = arm(P.elbowR, V(P.x + 0.0043 * s, P.shY, P.shZ));
    anim.armL = arm(P.elbowL, V(P.x - 0.0043 * s, P.shY, P.shZ));
    for (const a of [anim.armR, anim.armL]) {
      a.elbowJ.position.copy(a.elbow);
      for (const m of [a.fore, a.upper]) { m.userData.keep = true; m.castShadow = true; }
      root.add(a.fore, a.upper, a.elbowJ);
    }
    for (const p of anim.pedals) { p.shin.userData.keep = true; p.shin.castShadow = true; }
    if (!self) {
      // Another crew member: helmet with visor and boom mic.
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.0036 * s, 18, 14), M.helmet); head.position.set(P.x, P.shY + 0.0058 * s, P.shZ - 0.0008 * s); root.add(head);
      const visor = new THREE.Mesh(new THREE.SphereGeometry(0.0037 * s, 16, 8, -Math.PI * 0.75, Math.PI * 0.5, Math.PI * 0.35, Math.PI * 0.3), M.visor); visor.position.copy(head.position); root.add(visor);
      root.add(limb(M.suit, 0.0014 * s, V(P.x, P.shY, P.shZ), V(P.x, P.shY + 0.003 * s, P.shZ)));
      root.add(limb(M.stick, 0.00025 * s, V(P.x + 0.0033 * s, P.shY + 0.0052 * s, P.shZ - 0.0012 * s), V(P.x + 0.0012 * s, P.shY + 0.0042 * s, P.shZ - 0.0042 * s)));
      for (const sx of [-1, 1]) root.add(limb(M.suit, 0.0026 * s, V(P.x + sx * 0.0012 * s, P.shY - 0.0006 * s, P.shZ), V(P.x + sx * 0.0042 * s, P.shY, P.shZ + 0.0004 * s)));
    }
    return anim;
  }

  animatePilot(A, c, collective) {
    const s = A.scale || 1;
    const cy = A.cyclic;
    cy.g.rotation.set(cy.base - c.pitch * 0.2, 0, -c.roll * 0.2);
    A.collective.g.rotation.x = 0.06 + collective * 0.32;
    for (const p of A.pedals) {
      p.g.position.z = p.z0 - c.yaw * p.sx * 0.0016 * s;
      _a.set(0, 0.0016 * s, 0.0026 * s).applyMatrix4(_m.compose(p.g.position, p.g.quaternion, p.g.scale));
      setLimb(p.shin, p.knee, _a);
    }
    for (const [arm, ctl] of [[A.armR, cy], [A.armL, A.collective]]) {
      ctl.g.updateMatrix();
      _a.copy(ctl.wrist).applyMatrix4(ctl.g.matrix);
      setLimb(arm.fore, arm.elbow, _a);
      setLimb(arm.upper, arm.shoulder, arm.elbow);
    }
  }

  // ---------------------------------------------------------------- micro heli (Bell 206-style)
  buildMicro() {
    const M = materials('micro');
    const root = new THREE.Group();
    // From inside, the windscreen runs right down to the nose (the opaque nose cap is below the sill).
    const shell = cabinShellGeometry(true, (a, z, outside) => (z < -0.022 && z > -0.0628 && Math.sin(a) > 0.02 ? 1 : outside(a, z)));
    const lining = new THREE.Mesh(shell, [M.lining, M.hidden]);
    lining.castShadow = lining.receiveShadow = true;
    lining.userData.keep = true;
    const glass = new THREE.Mesh(shell, [M.hidden, M.glass]);
    glass.userData.keep = true; glass.renderOrder = 5;
    root.add(lining, glass);
    // Window frames: windscreen centre post, the roof bow where the overhead glass ends, the sills,
    // rubber seals round the chin and door windows.
    const post = [];
    for (let z = -0.0626; z <= -0.0218; z += 0.0034) post.push(onShell(z, Math.PI / 2, 0.97));
    root.add(tubeThrough(post, 0.0007, M.post));
    const bow = [];
    for (let a = -0.02; a <= Math.PI + 0.02 + 1e-6; a += Math.PI / 16) bow.push(onShell(-0.0222, a, 0.97));
    root.add(tubeThrough(bow, 0.0009, M.post));
    for (const sx of [-1, 1]) {
      const sill = [];
      for (let z = -0.0626; z <= -0.0222; z += 0.003) { const p = onShell(z, 0.02, 0.975); p.x *= sx; sill.push(p); }
      root.add(tubeThrough(sill, 0.0005, M.seal));
      root.add(windowFrame(-0.0585, -0.044, -0.80, -0.23, sx, 0.00028, M.seal));
      root.add(windowFrame(-0.017, -0.001, 0.13, 1.0, sx, 0.00028, M.seal));
      root.add(windowFrame(0.002, 0.020, 0.13, 1.0, sx, 0.00028, M.seal));
      const dp = [];
      for (let a = -0.9; a <= 1.25; a += 0.12) { const p = onShell(-0.0195, a, 0.972); p.x *= sx; dp.push(p); }
      root.add(tubeThrough(dp, 0.00062, M.post));
      // Door trim: armrest, handle, map pocket.
      root.add(box(M.trim, 0.0012, 0.0013, 0.0115, sx * 0.0168, -0.0040, -0.0095, 0, 0, 0, 0.0005));
      root.add(box(M.metal, 0.0006, 0.0005, 0.0024, sx * 0.0170, -0.0015, -0.0140, 0, 0, 0, 0.0002));
      root.add(box(M.trim, 0.0007, 0.0042, 0.0095, sx * 0.0176, -0.0115, -0.0090, 0, 0, sx * 0.08, 0.0004));
    }
    // Floor, glare-shield hood, panel, pedestal.
    root.add(box(M.floor, 0.033, 0.0008, 0.046, 0, -0.0246, -0.021));
    const hood = new THREE.Mesh(hoodGeometry(0.0322, 0.0448, 0.0366, -0.0030, 0.0021, 0.0006), M.glare);
    hood.position.x = -0.0146;
    root.add(hood);
    const P = this.panelGroup('micro', M, 0.030, 0.0105);
    P.group.position.set(0.0015, -0.0091, -0.0414);
    P.group.rotation.x = -0.3;
    root.add(P.group);
    // A row of toggle switches under the panel.
    for (let k = 0; k < 7; k++) {
      const x = 0.0035 + k * 0.0016;
      root.add(box(M.metal, 0.00025, 0.0011, 0.00025, x, -0.0148, -0.0393, -0.6));
    }
    const ped = new THREE.Mesh(new THREE.PlaneGeometry(0.0066, 0.0128), new THREE.MeshStandardMaterial({ map: consoleTexture('pedestal'), roughness: 0.7 }));
    ped.position.set(0, -0.0216, -0.0352); ped.rotation.x = -0.655;
    ped.userData.keep = true;
    root.add(ped);
    root.add(box(M.panelBody, 0.0072, 0.0128, 0.0105, 0, -0.0219, -0.0389, -0.655, 0, 0, 0.0006));
    // Magnetic compass on the glare shield.
    root.add(box(M.glare, 0.0028, 0.0021, 0.0024, 0.0015, -0.0015, -0.0392, 0, 0, 0, 0.0005));
    const strip = compassStrip();
    const card = new THREE.Mesh(new THREE.PlaneGeometry(0.0021, 0.0011), new THREE.MeshStandardMaterial({ map: strip, roughness: 0.4, emissive: 0xffffff, emissiveMap: strip, emissiveIntensity: 0.15 }));
    card.position.set(0.0015, -0.0015, -0.03798); root.add(card);
    root.add(box(M.red, 0.00006, 0.0012, 0.00002, 0.0015, -0.0015, -0.03796));
    // Seats (pilot right, empty left with its harness laid on it), rear bench, extinguisher.
    for (const sx of [-1, 1]) {
      const x = sx * 0.0085;
      root.add(box(M.seat, 0.0108, 0.0028, 0.0108, x, -0.0172, -0.0102, 0, 0, 0, 0.0011));
      root.add(box(M.seat, 0.0108, 0.0160, 0.0028, x, -0.0086, -0.0040, -0.12, 0, 0, 0.0011));
      root.add(box(M.seatFrame, 0.0094, 0.0058, 0.0094, x, -0.0215, -0.0102));
      if (sx < 0) {
        for (const bx of [-0.0025, 0.0025]) root.add(box(M.belt, 0.0013, 0.0150, 0.0003, x + bx, -0.0087, -0.0057, -0.12));
        root.add(box(M.belt, 0.0092, 0.0003, 0.0014, x, -0.0157, -0.0128));
        root.add(box(M.buckle, 0.0018, 0.0005, 0.0016, x, -0.0155, -0.0128, 0, 0, 0, 0.0002));
      }
    }
    root.add(box(M.seat, 0.032, 0.003, 0.010, 0, -0.0175, 0.012, 0, 0, 0, 0.001));
    root.add(box(M.seat, 0.032, 0.015, 0.0028, 0, -0.0085, 0.0175, -0.1, 0, 0, 0.001));
    root.add(limb(M.red, 0.0009, V(0.0148, -0.0235, -0.002), V(0.0148, -0.0178, -0.002)));
    // The pilot: you. Right seat, right hand on the cyclic, left on the collective.
    const anim = this.pilotRig(M, {
      x: 0.0085, hipY: -0.0146, hipZ: -0.0098, kneeY: -0.0126, kneeZ: -0.0226, shY: -0.0028, shZ: -0.0068,
      pedalY: -0.0222, pedalZ: -0.0322, floorY: -0.0246, cycZ: -0.0204, cycLen: 0.0098, cycTilt: 0.24,
      colX: 0.0024, colY: -0.0196, colZ: -0.0050, colLen: 0.0118,
      elbowR: V(0.0134, -0.0106, -0.0088), elbowL: V(0.0034, -0.0098, -0.0066),
    }, 1, root);
    const keep = [P.group, ...anim.pedals.map((p) => p.g), anim.cyclic.g, anim.collective.g];
    mergeStatic(root, keep);
    for (const g of keep) mergeStatic(g, []);
    root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = o.receiveShadow = true; } });
    glass.castShadow = false;
    P.panel.fixShadows();
    return { group: root, crew: [anim], panel: P.panel, compass: strip, shadow: { c: V(0.002, -0.008, -0.022), r: 0.038 } };
  }

  // ---------------------------------------------------------------- Chinook (CH-47F-style)
  buildChinook() {
    const M = materials('chinook');
    const s = 0.36;
    const root = new THREE.Group();
    const shell = noseShellGeometry();
    const lining = new THREE.Mesh(shell, [M.lining, M.hidden, M.frame]);
    lining.castShadow = lining.receiveShadow = true;
    lining.userData.keep = true;
    lining.scale.setScalar(0.99);
    const glass = new THREE.Mesh(shell, [M.hidden, M.glass, M.hidden]);
    glass.scale.setScalar(0.99);
    glass.userData.keep = true; glass.renderOrder = 5;
    root.add(lining, glass);
    // Bulkhead behind the seats with the companionway to the cabin.
    const bh = new THREE.Mesh(new THREE.PlaneGeometry(0.042, 0.04), new THREE.MeshStandardMaterial({ map: crinkle('#3a3f33', [4, 4]), roughness: 0.9 }));
    bh.position.set(0, 0.002, -0.0626); bh.rotation.y = Math.PI; root.add(bh);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.0072, 0.0145), new THREE.MeshStandardMaterial({ color: 0x0c0d0b, roughness: 1 }));
    door.position.set(0, 0.0028, -0.0627); door.rotation.y = Math.PI; root.add(door);
    root.add(box(M.floor, 0.034, 0.0006, 0.0165, 0, -0.0046, -0.0705));
    // Glare shield, panel and centre/overhead consoles.
    const hood = new THREE.Mesh(hoodGeometry(0.033, 0.0818, 0.0784, 0.0052, 0.0011, 0.00035), M.glare);
    hood.position.x = -0.0165;
    root.add(hood);
    // A low, wide panel so the pilot sees over the glare shield to the load (real-size displays).
    const P = this.panelGroup('chinook', M, 0.031, 0.0056);
    P.group.position.set(0, 0.0019, -0.0800);
    P.group.rotation.x = -0.18;
    root.add(P.group);
    root.add(box(M.panelBody, 0.0058, 0.0050, 0.0112, 0, -0.0020, -0.0722, 0, 0, 0, 0.0004));
    const cTop = new THREE.Mesh(new THREE.PlaneGeometry(0.0056, 0.0108), new THREE.MeshStandardMaterial({ map: consoleTexture('pedestal'), roughness: 0.7 }));
    cTop.position.set(0, 0.00055, -0.0722); cTop.rotation.x = -Math.PI / 2; cTop.userData.keep = true; root.add(cTop);
    root.add(box(M.panelBody, 0.0072, 0.0016, 0.0108, 0, 0.0163, -0.0718, 0, 0, 0, 0.0004));
    const oh = new THREE.Mesh(new THREE.PlaneGeometry(0.0068, 0.0104), new THREE.MeshStandardMaterial({ map: consoleTexture('overhead'), roughness: 0.7 }));
    oh.position.set(0, 0.01545, -0.0718); oh.rotation.x = Math.PI / 2; oh.userData.keep = true; root.add(oh);
    // Armoured crew seats.
    for (const sx of [-1, 1]) {
      const x = sx * 0.0072;
      root.add(box(M.seat, 0.0062, 0.0014, 0.0058, x, 0.0004, -0.0700, 0, 0, 0, 0.0005));
      root.add(box(M.seat, 0.0062, 0.0086, 0.0013, x, 0.0050, -0.0668, -0.1, 0, 0, 0.0005));
      root.add(box(M.seat, 0.0040, 0.0022, 0.0012, x, 0.0104, -0.0663, -0.1, 0, 0, 0.0005));
      for (const ex of [-1, 1]) root.add(box(M.seatFrame, 0.0005, 0.0060, 0.0050, x + ex * 0.0034, 0.0022, -0.0688));
      root.add(box(M.seatFrame, 0.0055, 0.0040, 0.0050, x, -0.0026, -0.0700));
    }
    const crew = [];
    for (const [sx, self] of [[1, true], [-1, false]]) {
      const x = sx * 0.0072;
      const A = this.pilotRig(M, {
        x, hipY: 0.0017, hipZ: -0.0697, kneeY: 0.0026, kneeZ: -0.0745, shY: 0.0068, shZ: -0.0688,
        pedalY: -0.0034, pedalZ: -0.0789, floorY: -0.0046, cycZ: -0.0741, cycLen: 0.0042, cycTilt: 0.2,
        colX: x - 0.0034, colY: 0.0004, colZ: -0.0682, colLen: 0.0046,
        elbowR: V(x + 0.0030, 0.0030, -0.0702), elbowL: V(x - 0.0030, 0.0032, -0.0699),
      }, s, root, { self });
      A.scale = s;
      crew.push(A);
    }
    const keep = [P.group];
    for (const A of crew) keep.push(...A.pedals.map((p) => p.g), A.cyclic.g, A.collective.g);
    mergeStatic(root, keep);
    for (const g of keep) mergeStatic(g, []);
    root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = o.receiveShadow = true; } });
    glass.castShadow = false;
    P.panel.fixShadows();
    return { group: root, crew, panel: P.panel, shadow: { c: V(0, 0.004, -0.072), r: 0.017 } };
  }

  // ---------------------------------------------------------------- skycrane (S-64-style)
  // A glazed ellipsoidal pod with two crew side by side, analogue instruments, ribs over the bubble.
  buildSkycrane() {
    const M = materials('micro');
    M.lining = new THREE.MeshStandardMaterial({ map: fabric('#5c5f5e', [18, 10]), roughness: 0.95, side: THREE.BackSide });
    M.suit = new THREE.MeshStandardMaterial({ map: fabric('#3b4a5a', [3, 3]), roughness: 0.9 });
    M.seat = new THREE.MeshStandardMaterial({ map: fabric('#2f3236', [4, 4]), roughness: 0.9 });
    const s = 0.34;
    const C = V(0, 0.004, -0.068), R = V(0.0128, 0.0148, 0.0185);
    const root = new THREE.Group();
    // Same ellipsoid split as the outside: glass above, the tub below, a little inside both.
    const glassGeo = new THREE.SphereGeometry(1, 48, 28, 0, Math.PI * 2, 0, Math.PI * 0.62).scale(R.x * 0.985, R.y * 0.985, R.z * 0.985).translate(C.x, C.y, C.z);
    const tubGeo = new THREE.SphereGeometry(1, 48, 20, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4).scale(R.x * 0.985, R.y * 0.985, R.z * 0.985).translate(C.x, C.y, C.z);
    const glass = new THREE.Mesh(glassGeo, M.glass); glass.userData.keep = true; glass.renderOrder = 5;
    const tub = new THREE.Mesh(tubGeo, M.lining); tub.userData.keep = true; tub.castShadow = tub.receiveShadow = true;
    root.add(glass, tub);
    // Ribs over the bubble, the sill ring, and an opaque back wall into the spine.
    for (const a of [-0.55, 0, 0.55]) {
      const rib = new THREE.TorusGeometry(1, 0.03, 6, 40, Math.PI);
      rib.rotateY(Math.PI / 2 + a);
      rib.scale(R.x * 0.975, R.y * 0.975, R.z * 0.975).translate(C.x, C.y, C.z);
      root.add(new THREE.Mesh(rib, M.post));
    }
    const sill = new THREE.TorusGeometry(1, 0.028, 6, 56).rotateX(Math.PI / 2).scale(0.0118 * 0.98, 0.0118, 0.0172 * 0.98).translate(C.x, C.y - 0.0055, C.z);
    root.add(new THREE.Mesh(sill, M.post));
    const back = new THREE.Mesh(new THREE.CircleGeometry(1, 40).scale(R.x * 0.9, R.y * 0.75, 1).translate(0, C.y, -0.0545), M.lining);
    root.add(back);
    root.add(box(M.floor, 0.02, 0.0005, 0.016, 0, -0.0018, -0.069));
    // Glare shield, panel (analogue), centre console.
    const hood = new THREE.Mesh(hoodGeometry(0.0168, 0.0812, 0.0784, 0.0064, 0.0012, 0.0003), M.glare);
    hood.position.x = -0.0073;
    root.add(hood);
    // Offset toward the pilot (right seat) and small enough to sit under the sightline.
    const P = this.panelGroup('skycrane', M, 0.0157, 0.0056);
    P.group.position.set(0.0012, 0.0035, -0.0790);
    P.group.rotation.x = -0.2;
    root.add(P.group);
    root.add(box(M.panelBody, 0.0042, 0.0045, 0.0085, 0, -0.0005, -0.0725, -0.4, 0, 0, 0.0004));
    for (const sx of [-1, 1]) {
      const x = sx * 0.0048;
      root.add(box(M.seat, 0.0052, 0.0013, 0.005, x, 0.0024, -0.0650, 0, 0, 0, 0.0005));
      root.add(box(M.seat, 0.0052, 0.0078, 0.0012, x, 0.0066, -0.0622, -0.1, 0, 0, 0.0005));
      root.add(box(M.seatFrame, 0.0044, 0.0035, 0.0044, x, -0.0002, -0.0650));
    }
    const crew = [];
    for (const [sx, self] of [[1, true], [-1, false]]) {
      const x = sx * 0.0048;
      const A = this.pilotRig(M, {
        x, hipY: 0.0038, hipZ: -0.0646, kneeY: 0.0046, kneeZ: -0.0697, shY: 0.0089, shZ: -0.0638,
        pedalY: -0.0006, pedalZ: -0.0748, floorY: -0.0018, cycZ: -0.0694, cycLen: 0.0040, cycTilt: 0.2,
        colX: x - 0.0031, colY: 0.0026, colZ: -0.0634, colLen: 0.0042,
        elbowR: V(x + 0.0028, 0.0052, -0.0652), elbowL: V(x - 0.0028, 0.0054, -0.0650),
      }, s, root, { self });
      A.scale = s;
      crew.push(A);
    }
    const keep = [P.group];
    for (const A of crew) keep.push(...A.pedals.map((p) => p.g), A.cyclic.g, A.collective.g);
    mergeStatic(root, keep);
    for (const g of keep) mergeStatic(g, []);
    root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = o.receiveShadow = true; } });
    glass.castShadow = false;
    P.panel.fixShadows();
    return { group: root, crew, panel: P.panel, shadow: { c: V(0, 0.004, -0.068), r: 0.02 } };
  }

  // ---------------------------------------------------------------- picture-in-picture (hook camera)
  buildPip() {
    this.pipScene = new THREE.Scene();
    this.pipCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
    this.pipMat = new THREE.ShaderMaterial({
      transparent: true, depthTest: false, depthWrite: false,
      uniforms: { map: { value: this.loadCam.rt.texture }, size: { value: new THREE.Vector2(200, 200) }, radius: { value: 10 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: `uniform sampler2D map; uniform vec2 size; uniform float radius; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(map, vUv).rgb;
          float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
          c = mix(vec3(l), c, 0.8) * (1.0 - 0.45 * pow(length(vUv - 0.5) * 1.3, 2.6));
          vec2 p = (vUv - 0.5) * size;
          float ch = (step(abs(p.x), 0.7) * step(abs(p.y), 11.0) * step(4.0, abs(p.y))) + (step(abs(p.y), 0.7) * step(abs(p.x), 11.0) * step(4.0, abs(p.x)));
          c = mix(c, vec3(1.6), clamp(ch, 0.0, 1.0) * 0.55);
          vec2 q = abs(p) - (size * 0.5 - radius);
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - radius;
          gl_FragColor = vec4(c, clamp(0.5 - d, 0.0, 1.0));
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.pip = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), this.pipMat);
    this.pip.frustumCulled = false;
    this.pipScene.add(this.pip);
    this.pipRect = null;
  }

  setPipRect(rect, w, h) {
    this.pipRect = rect;
    this.pipCam.right = w; this.pipCam.top = h; this.pipCam.updateProjectionMatrix();
    if (!rect) return;
    this.pip.position.set(rect.x + rect.s / 2, h - rect.y - rect.s / 2, 0);
    this.pip.scale.set(rect.s, rect.s, 1);
    this.pipMat.uniforms.size.value.set(rect.s, rect.s);
  }

  // ---------------------------------------------------------------- per frame
  setAspect(aspect, fov) {
    this.camera.aspect = aspect; this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  has(type) { return ['micro', 'chinook', 'skycrane'].includes(type); }

  ensureInterior(type) {
    if (!this.has(type) || this.interiors[type]) return this.interiors[type];
    const it = type === 'chinook' ? this.buildChinook() : type === 'skycrane' ? this.buildSkycrane() : this.buildMicro();
    it.group.visible = false;
    this.interiors[type] = it;
    this.scene.add(it.group);
    return it;
  }

  // h: live aircraft (or null while the crash freeze plays), quat: drawn body orientation.
  update(dt, h, sim, quat, gearDrop, active) {
    const kind = h ? h.type : this.kind;
    if (kind !== this.kind) {
      this.ensureInterior(kind);
      // Only the aircraft in use keeps its big panel texture.
      for (const [k, it] of Object.entries(this.interiors)) { it.group.visible = k === kind; if (k !== kind) it.panel.release(); }
      this.kind = kind;
    }
    const it = this.interiors[this.kind];
    if (!it || !active) return;
    // Sun and environment in body axes.
    _qi.copy(quat).invert();
    _a.copy(this.sunDirW).applyQuaternion(_qi);
    this.sun.target.position.copy(it.shadow.c);
    this.sun.position.copy(it.shadow.c).addScaledVector(_a, 0.1);
    const sc = this.sun.shadow.camera, r = it.shadow.r;
    if (sc.right !== r) { sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.01; sc.far = 0.2; sc.updateProjectionMatrix(); }
    this.scene.environmentRotation.setFromQuaternion(_qi);
    if (h) {
      const c = h.ctlEcho || { pitch: 0, roll: 0, yaw: 0 };
      for (const A of it.crew) this.animatePilot(A, c, h.collective);
      it.panel.update(dt, h, sim, gearDrop);
      if (it.compass) it.compass.offset.x = (it.panel.F.hdg - COMPASS_SPAN / 2) / 360;
    }
  }

  render() {
    const r = this.renderer;
    const ac = r.autoClear;
    r.autoClear = false;
    r.clearDepth();
    // The cabin's own shadows: every frame, or every other one on the lite tier.
    r.shadowMap.needsUpdate = !this.quality.lite || (this.frameN = (this.frameN || 0) + 1) % 2 === 0;
    r.render(this.scene, this.camera);
    r.autoClear = ac;
  }

  renderPip() {
    if (!this.pipRect) return;
    const r = this.renderer;
    const ac = r.autoClear;
    r.autoClear = false;
    r.render(this.pipScene, this.pipCam);
    r.autoClear = ac;
  }
}
