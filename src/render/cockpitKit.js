import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

// Cockpit fittings shared by every interior: switch and breaker panels (a painted face from one atlas
// per cockpit, with real raised toggles, breakers and knobs on it), crew seats with harnesses, and the
// small things a pilot looks at when they turn their head (extinguisher, headset, vents, handles,
// placards, a flask of tea). Everything is specified in full-size metres and scaled by `u` (model metres
// per full-size metre), so a part reads at its real size in a headset whatever the aircraft's scale.

const _up = new THREE.Vector3(0, 1, 0), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
export const V = (x, y, z) => new THREE.Vector3(x, y, z);
// Geometric detail: 1 on desktop and in VR, lower on phones (rounded corners, tube and rod segments).
let LO = false;
export function setKitDetail(lo) { const was = LO; LO = !!lo; return was; }

// ---------------------------------------------------------------- panel atlas
// Panels register a size (full-size metres) and a painter; finish() packs them into one canvas at the
// highest density that fits, so a whole cockpit's switch panels are one texture and one material.
export class PanelAtlas {
  constructor(quality) {
    const hi = quality.name === 'high' || quality.name === 'ultra';
    this.maxW = hi ? 4096 : quality.name === 'medium' ? 2048 : 2048;
    this.maxH = hi ? 4096 : quality.name === 'medium' ? 4096 : 2048;
    this.density = hi ? 2600 : quality.name === 'medium' ? 1800 : 1100;   // px per full-size metre
    this.items = [];
    const mk = (opts) => new THREE.MeshStandardMaterial(opts);
    this.material = mk({ roughness: 0.62, metalness: 0.08, emissive: 0xffffff, emissiveIntensity: 0.05 });
    this.material.userData.atlas = this;
  }

  // draw(g, wpx, hpx, pxPerM) paints the face; returns a handle whose uv is filled in by finish().
  add(w, h, draw) {
    const it = { w, h, draw, uv: [0, 0, 1, 1], geos: [] };
    this.items.push(it);
    return it;
  }

  // A plane w x h (model metres) carrying the item's part of the atlas.
  plane(it, wm, hm) {
    const g = new THREE.PlaneGeometry(wm, hm);
    it.geos.push(g);
    return g;
  }

  pack(d) {
    const pad = 4;
    let x = 0, y = 0, row = 0;
    const sorted = [...this.items].sort((a, b) => b.h - a.h);
    for (const it of sorted) {
      const w = Math.ceil(it.w * d) + pad * 2, h = Math.ceil(it.h * d) + pad * 2;
      if (w > this.maxW) return false;
      if (x + w > this.maxW) { x = 0; y += row; row = 0; }
      if (y + h > this.maxH) return false;
      it.px = [x + pad, y + pad, w - pad * 2, h - pad * 2];
      x += w; row = Math.max(row, h);
    }
    this.usedH = y + row;
    return true;
  }

  finish(aniso = 8) {
    if (!this.items.length) return;
    let d = this.density;
    while (!this.pack(d)) d *= 0.88;
    const H = Math.min(this.maxH, 1 << Math.ceil(Math.log2(Math.max(64, this.usedH))));
    const c = document.createElement('canvas'); c.width = this.maxW; c.height = H;
    const g = c.getContext('2d');
    g.fillStyle = '#202224'; g.fillRect(0, 0, c.width, c.height);
    for (const it of this.items) {
      const [x, y, w, h] = it.px;
      g.save(); g.translate(x, y); g.beginPath(); g.rect(0, 0, w, h); g.clip();
      it.draw(g, w, h, w / it.w);
      g.restore();
      const u0 = x / c.width, u1 = (x + w) / c.width, v1 = 1 - y / H, v0 = 1 - (y + h) / H;
      for (const geo of it.geos) {
        const uv = geo.attributes.uv;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
        uv.needsUpdate = true;
      }
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso;
    this.material.map = t; this.material.emissiveMap = t;
    this.material.needsUpdate = true;
    this.texture = t;
    this.pxPerM = d;
  }
}

// ---------------------------------------------------------------- kit materials
export function kitMaterials(M, theme = 'grey') {
  const metal = (c, r = 0.35, m = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  return {
    ...M,
    toggle: metal(0xd6d8da, 0.22, 1),
    nut: metal(0x8e9296, 0.3, 0.9),
    breaker: new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.45 }),
    breakerRing: new THREE.MeshStandardMaterial({ color: 0xe9e6dc, roughness: 0.5 }),
    knob: new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.5, metalness: 0.2 }),
    knobLine: new THREE.MeshStandardMaterial({ color: 0xf2f0e8, roughness: 0.5, emissive: 0xf2f0e8, emissiveIntensity: 0.15 }),
    guard: new THREE.MeshPhysicalMaterial({ color: 0xb4221c, roughness: 0.35, clearcoat: 0.6 }),
    stripe: (() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const g = c.getContext('2d');
      g.fillStyle = '#e2b21c'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#141414';
      for (let k = -64; k < 128; k += 22) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 11, 0); g.lineTo(k + 11 - 64, 64); g.lineTo(k - 64, 64); g.fill(); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 1);
      return new THREE.MeshStandardMaterial({ map: t, roughness: 0.55 });
    })(),
    rubberK: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 }),
    webbing: new THREE.MeshStandardMaterial({ map: webbingTex(theme === 'olive' ? '#8a2b22' : '#2c3a58'), roughness: 0.85 }),
    cushionEdge: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.7 }),
    chromeK: metal(0xdfe2e5, 0.12, 1),
    brassK: metal(0xc9a24e, 0.3, 1),
    lamp: new THREE.MeshStandardMaterial({ color: 0xfff4dc, emissive: 0xfff0d0, emissiveIntensity: 1.2, roughness: 0.3 }),
    lensRed: new THREE.MeshStandardMaterial({ color: 0x8a1410, emissive: 0xff2a1a, emissiveIntensity: 0.25, roughness: 0.2 }),
    enamel: new THREE.MeshPhysicalMaterial({ color: 0xf1ede2, roughness: 0.28, clearcoat: 0.7 }),
    tea: new THREE.MeshStandardMaterial({ color: 0x6a3a1a, roughness: 0.15 }),
    flask: new THREE.MeshPhysicalMaterial({ color: 0x2f5a46, roughness: 0.4, metalness: 0.3, clearcoat: 0.6 }),
    cable: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 }),
    foam: new THREE.MeshStandardMaterial({ color: 0x232323, roughness: 1 }),
    armour: new THREE.MeshStandardMaterial({ color: theme === 'olive' ? 0x3c4232 : 0x2d2f31, roughness: 0.7, metalness: 0.1 }),
  };
}

function webbingTex(col) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = col; g.fillRect(0, 0, 64, 128);
  for (let x = 0; x < 64; x += 3) { g.fillStyle = `rgba(0,0,0,${x % 6 ? 0.12 : 0.22})`; g.fillRect(x, 0, 1, 128); }
  for (let y = 0; y < 128; y += 4) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, y, 64, 1); }
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, 3, 128); g.fillRect(61, 0, 3, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- geometry helpers
// Cylinder between two points (model metres).
export function rodGeo(a, b, r0, r1 = r0, seg = 8, open = false) {
  if (LO) seg = Math.max(5, Math.round(seg * 0.6));
  _d.subVectors(b, a);
  const len = _d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1, open);
  g.applyQuaternion(_q.setFromUnitVectors(_up, _d.normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
export function rod(mat, a, b, r0, r1 = r0, seg = 8) { return new THREE.Mesh(rodGeo(a, b, r0, r1, seg), mat); }
export function tubeAlong(mat, pts, r, closed = false, radial = 8) {
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, closed, 'catmullrom', 0.3), Math.max(LO ? 8 : 12, pts.length * (LO ? 3 : 6)), r, LO ? Math.min(radial, 5) : radial, closed), mat);
}
export function rbox(mat, w, h, d, r = 0, seg = 2) {
  if (LO) seg = 1;
  const geo = r > 0 ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-7, h / 2 - 1e-7, d / 2 - 1e-7)) : new THREE.BoxGeometry(w, h, d);
  return new THREE.Mesh(geo, mat);
}
export function at(obj, x, y, z, rx = 0, ry = 0, rz = 0) { obj.position.set(x, y, z); obj.rotation.set(rx, ry, rz); return obj; }
// A strap: a flat band following points (width w, thickness t), its face turned toward `normal`.
export function strap(mat, pts, w, t, normal = V(0, 0, -1)) {
  const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
  const n = Math.max(LO ? 6 : 8, pts.length * (LO ? 3 : 6));
  const pos = [], uv = [], idx = [];
  const T = new THREE.Vector3(), S = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n);
    curve.getTangentAt(i / n, T);
    S.crossVectors(T, normal).normalize();
    N.crossVectors(S, T).normalize();
    for (const [sx, sn] of [[-1, 1], [1, 1], [1, -1], [-1, -1]]) {
      pos.push(p.x + S.x * sx * w / 2 + N.x * sn * t / 2, p.y + S.y * sx * w / 2 + N.y * sn * t / 2, p.z + S.z * sx * w / 2 + N.z * sn * t / 2);
      uv.push(sx > 0 ? 1 : 0, i / n * 4);
    }
  }
  for (let i = 0; i < n; i++) for (let k = 0; k < 4; k++) {
    const a = i * 4 + k, b = i * 4 + (k + 1) % 4, c = a + 4, d = b + 4;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

// ---------------------------------------------------------------- painting
const LABEL_FONT = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
export function paintText(g, s, x, y, size, col = '#e8e6dd', { align = 'center', weight = 700, base = 'middle', font = LABEL_FONT } = {}) {
  g.fillStyle = col; g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base;
  g.fillText(s, x, y);
}
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
const THEMES = {
  grey: { base: '#2b2d30', edge: '#1a1b1d', ink: '#e6e4dc', dim: '#8d8f90', speck: 0.04 },
  black: { base: '#1d1e20', edge: '#0d0d0e', ink: '#e8e6de', dim: '#7f8184', speck: 0.035 },
  olive: { base: '#3a3f32', edge: '#22261d', ink: '#e8e6da', dim: '#9a9d8a', speck: 0.05 },
};

// ---------------------------------------------------------------- switch panel
// spec: { w, h, depth, theme, title, items } in full-size metres. Items are placed from the panel's top
// left: { t: 'toggle' | 'guard' | 'breaker' | 'knob' | 'dual' | 'rotary' | 'push' | 'lamp' | 'display' | 'label' | 'box'
// | 'screws' | 'keys', x, y, ... }. Returns a group whose face is at z = 0, facing +z.
export function switchPanel(K, spec) {
  const { u, A, M } = K;
  const T = THEMES[spec.theme || 'grey'];
  const w = spec.w, h = spec.h, depth = spec.depth ?? 0.03;
  const grp = new THREE.Group();
  const items = spec.items || [];
  const it = A.add(w, h, (g, W, H, d) => {
    g.fillStyle = T.base; g.fillRect(0, 0, W, H);
    let seed = Math.round(w * 9973 + h * 7919) || 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < W * H / 60; i++) { const v = rnd() > 0.5 ? 255 : 0; g.fillStyle = `rgba(${v},${v},${v},${T.speck})`; g.fillRect(rnd() * W, rnd() * H, 1.4, 1.4); }
    g.strokeStyle = T.edge; g.lineWidth = Math.max(2, 0.004 * d); g.strokeRect(1, 1, W - 2, H - 2);
    const P = (v) => v * d;
    if (spec.title) paintText(g, spec.title, W / 2, P(0.012), P(0.011), T.dim);
    for (const s of items) {
      const x = P(s.x), y = P(s.y);
      switch (s.t) {
        case 'toggle': case 'guard': {
          g.fillStyle = '#121314'; g.beginPath(); g.arc(x, y, P(0.0075), 0, 7); g.fill();
          if (s.label) paintText(g, s.label, x, y - P(0.017), P(s.size || 0.0062), T.ink);
          if (s.on !== false && s.marks !== false) { paintText(g, s.top || 'ON', x + P(0.013), y - P(0.006), P(0.0045), T.dim, { align: 'left' }); paintText(g, s.bottom || 'OFF', x + P(0.013), y + P(0.007), P(0.0045), T.dim, { align: 'left' }); }
          break;
        }
        case 'breaker': {
          g.fillStyle = '#0e0e0f'; g.beginPath(); g.arc(x, y, P(0.0062), 0, 7); g.fill();
          if (s.label) paintText(g, s.label, x, y - P(0.0115), P(0.0042), T.ink);
          if (s.amps) paintText(g, String(s.amps), x, y + P(0.0105), P(0.0042), T.dim);
          break;
        }
        case 'knob': case 'dual': case 'rotary': {
          const r = P(s.r || 0.012);
          if (s.t === 'rotary' && s.stops) {
            s.stops.forEach((lab, i) => {
              const a = -Math.PI * 0.75 + i * (Math.PI * 1.5) / Math.max(1, s.stops.length - 1);
              g.strokeStyle = T.ink; g.lineWidth = Math.max(1, P(0.0012));
              g.beginPath(); g.moveTo(x + Math.sin(a) * r * 1.15, y - Math.cos(a) * r * 1.15); g.lineTo(x + Math.sin(a) * r * 1.4, y - Math.cos(a) * r * 1.4); g.stroke();
              paintText(g, lab, x + Math.sin(a) * r * 1.85, y - Math.cos(a) * r * 1.75, P(0.0045), T.ink);
            });
          } else {
            for (let i = 0; i <= 10; i++) {
              const a = -Math.PI * 0.75 + i * Math.PI * 0.15;
              g.strokeStyle = T.dim; g.lineWidth = Math.max(1, P(0.0009));
              g.beginPath(); g.moveTo(x + Math.sin(a) * r * 1.18, y - Math.cos(a) * r * 1.18); g.lineTo(x + Math.sin(a) * r * (i % 5 ? 1.32 : 1.45), y - Math.cos(a) * r * (i % 5 ? 1.32 : 1.45)); g.stroke();
            }
          }
          if (s.label) paintText(g, s.label, x, y + r * (s.t === 'rotary' ? 2.3 : 1.8) + P(0.002), P(s.size || 0.0055), T.ink);
          break;
        }
        case 'push': case 'lamp': {
          const bw = P(s.w || 0.022), bh = P(s.h || 0.016);
          g.fillStyle = '#0b0b0b'; rr(g, x - bw / 2 - P(0.0015), y - bh / 2 - P(0.0015), bw + P(0.003), bh + P(0.003), P(0.002)); g.fill();
          g.fillStyle = s.lit ? s.color || '#e8a623' : shade(s.color || '#e8a623', 0.32); g.fillRect(x - bw / 2, y - bh / 2, bw, bh);
          const lines = String(s.label || '').split('\n');
          lines.forEach((l, i) => paintText(g, l, x, y + (i - (lines.length - 1) / 2) * P(0.0055), P(0.0045), s.lit ? '#141414' : shade(s.color || '#e8a623', 0.7)));
          break;
        }
        case 'display': {
          const bw = P(s.w), bh = P(s.h);
          g.fillStyle = '#050606'; g.fillRect(x, y, bw, bh);
          g.fillStyle = 'rgba(80,90,90,0.12)'; g.fillRect(x, y, bw, bh * 0.35);
          paintText(g, s.text || '', x + bw / 2, y + bh * 0.55, bh * 0.62, s.color || '#59e07c', { font: '"Consolas", "Courier New", monospace', weight: 600 });
          if (s.label) paintText(g, s.label, x + bw / 2, y - P(0.006), P(0.0045), T.dim);
          break;
        }
        case 'label': paintText(g, s.text, x, y, P(s.size || 0.006), s.color || T.ink, { align: s.align || 'center' }); break;
        case 'box': {
          g.strokeStyle = s.color || T.dim; g.lineWidth = Math.max(1, P(0.0012));
          g.strokeRect(x, y, P(s.w), P(s.h));
          if (s.text) { const tw = g.measureText(s.text).width; g.fillStyle = T.base; paintText(g, s.text, x + P(s.w) / 2, y, P(0.0048), s.color || T.dim); }
          break;
        }
        case 'stripe': { g.fillStyle = s.color || '#d9a520'; g.fillRect(x, y, P(s.w), P(s.h)); break; }
        case 'keys': {
          // A keypad: rows of labelled keys (CDU and radio panels), raised in 3D below.
          const kw = P(s.kw), kh = P(s.kh), gx = P(s.gap || 0.003);
          s.rows.forEach((row, j) => [...row].forEach((ch, i) => {
            const kx = x + i * (kw + gx), ky = y + j * (kh + gx);
            g.fillStyle = '#0c0c0d'; g.fillRect(kx - P(0.001), ky - P(0.001), kw + P(0.002), kh + P(0.002));
            g.fillStyle = '#3a3c3f'; g.fillRect(kx, ky, kw, kh);
            paintText(g, ch, kx + kw / 2, ky + kh / 2, kh * 0.55, '#ecebe4');
          }));
          break;
        }
        case 'screws': break;
        default: break;
      }
    }
    // Dzus fasteners in the corners (every panel has them).
    for (const [sx, sy] of [[0.007, 0.007], [w - 0.007, 0.007], [0.007, h - 0.007], [w - 0.007, h - 0.007]]) {
      const x = P(sx), y = P(sy), r = P(0.0035);
      g.fillStyle = '#56595c'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = '#1c1d1e'; g.lineWidth = Math.max(1, r * 0.35); g.beginPath(); g.moveTo(x - r * 0.7, y - r * 0.2); g.lineTo(x + r * 0.7, y + r * 0.2); g.stroke();
    }
    if (spec.paint) spec.paint(g, d);
  });
  // Face and its tray.
  grp.add(new THREE.Mesh(A.plane(it, w * u, h * u), A.material));
  if (depth > 0) {
    const back = rbox(spec.bodyMat || M.panelBody, w * u * 1.01, h * u * 1.01, depth * u, 0.003 * u);
    back.position.z = -depth * u / 2 - 0.0002 * u;
    grp.add(back);
  }
  // Raised parts.
  const X = (x) => (x - w / 2) * u, Y = (y) => (h / 2 - y) * u;
  const geos = { toggle: [], nut: [], breaker: [], ring: [], knob: [], line: [], guard: [] };
  for (const s of items) {
    const x = X(s.x ?? 0), y = Y(s.y ?? 0);
    if (s.t === 'toggle' || s.t === 'guard') {
      geos.nut.push(new THREE.CylinderGeometry(0.0042 * u, 0.0042 * u, 0.003 * u, 6).rotateX(Math.PI / 2).translate(x, y, 0.0015 * u));
      const up = s.down ? -1 : 1;
      const lev = new THREE.CylinderGeometry(0.0011 * u, 0.0017 * u, 0.014 * u, 8).translate(0, 0.007 * u, 0).rotateX(Math.PI / 2 - up * 0.45).translate(x, y, 0.003 * u);
      geos.toggle.push(lev);
      geos.toggle.push(new THREE.SphereGeometry(0.0016 * u, 8, 6).translate(0, 0.0142 * u, 0).rotateX(Math.PI / 2 - up * 0.45).translate(x, y, 0.003 * u));
      if (s.t === 'guard') {
        const gw = 0.016 * u, gh = 0.026 * u;
        const cover = new THREE.BoxGeometry(gw, gh, 0.0012 * u).translate(0, gh / 2, 0).rotateX(-0.25).translate(x, y - 0.008 * u, 0.018 * u);
        geos.guard.push(cover);
        for (const sx of [-1, 1]) geos.guard.push(new THREE.BoxGeometry(0.0012 * u, gh * 0.8, 0.017 * u).translate(x + sx * gw / 2, y + gh * 0.35 - 0.008 * u, 0.009 * u));
      }
    } else if (s.t === 'breaker') {
      const out = s.out ? 0.004 * u : 0;
      geos.breaker.push(new THREE.CylinderGeometry(0.0034 * u, 0.0038 * u, 0.007 * u + out, 10).rotateX(Math.PI / 2).translate(x, y, (0.0035 * u + out / 2)));
      if (s.out) geos.ring.push(new THREE.CylinderGeometry(0.0039 * u, 0.0039 * u, 0.0025 * u, 10).rotateX(Math.PI / 2).translate(x, y, 0.0012 * u));
    } else if (s.t === 'knob' || s.t === 'rotary' || s.t === 'dual') {
      const r = (s.r || 0.012) * u * (s.t === 'rotary' ? 0.7 : 1);
      const hgt = (s.t === 'rotary' ? 0.012 : 0.014) * u;
      if (s.t === 'rotary') {
        geos.knob.push(new THREE.CylinderGeometry(r * 1.05, r * 1.1, hgt * 0.4, 18).rotateX(Math.PI / 2).translate(x, y, hgt * 0.2));
        const bar = new THREE.BoxGeometry(r * 0.55, r * 2.3, hgt).translate(0, 0, hgt * 0.7).rotateZ(-(s.pos ?? 0)).translate(x, y, 0);
        geos.knob.push(bar);
        geos.line.push(new THREE.BoxGeometry(r * 0.16, r * 0.8, 0.0006 * u).translate(0, r * 0.7, hgt * 1.2 + 0.0003 * u).rotateZ(-(s.pos ?? 0)).translate(x, y, 0));
      } else {
        geos.knob.push(new THREE.CylinderGeometry(r * 0.95, r, hgt, 20).rotateX(Math.PI / 2).translate(x, y, hgt / 2));
        if (s.t === 'dual') geos.knob.push(new THREE.CylinderGeometry(r * 0.55, r * 0.58, hgt * 0.7, 16).rotateX(Math.PI / 2).translate(x, y, hgt * 1.35));
        const top = s.t === 'dual' ? hgt * 1.7 : hgt;
        geos.line.push(new THREE.BoxGeometry(r * 0.12, r * 0.55, 0.0006 * u).translate(0, r * (s.t === 'dual' ? 0.25 : 0.55), top + 0.0003 * u).rotateZ(-(s.pos ?? 0.4)).translate(x, y, 0));
      }
    } else if (s.t === 'push') {
      const bw = s.w || 0.022, bh = s.h || 0.016;
      grp.add(new THREE.Mesh(keyCap(it, s.x - bw / 2, s.y - bh / 2, bw, bh, 0.005), A.material));
    } else if (s.t === 'keys') {
      const gx = s.gap || 0.003;
      s.rows.forEach((row, j) => [...row].forEach((ch, i) => {
        grp.add(new THREE.Mesh(keyCap(it, s.x + i * (s.kw + gx), s.y + j * (s.kh + gx), s.kw, s.kh, 0.0035), A.material));
      }));
    }
  }
  // A raised key or push button: a box whose every face shows the key's own part of the panel face.
  function keyCap(item, x0, y0, kw, kh, kd) {
    const geo = new THREE.BoxGeometry(kw * u * 0.97, kh * u * 0.97, kd * u).translate(X(x0 + kw / 2), Y(y0 + kh / 2), kd * u / 2);
    const uv = geo.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (x0 + uv.getX(k) * kw) / w, 1 - (y0 + (1 - uv.getY(k)) * kh) / h);
    item.geos.push(geo);
    return geo;
  }
  const put = (list, mat) => { if (list.length) grp.add(new THREE.Mesh(mergeGeometries(list.map((g) => g.toNonIndexed()), false), mat)); };
  put(geos.nut, K.M.nut); put(geos.toggle, K.M.toggle); put(geos.breaker, K.M.breaker); put(geos.ring, K.M.breakerRing);
  put(geos.knob, K.M.knob); put(geos.line, K.M.knobLine); put(geos.guard, K.M.guard);
  return grp;
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k), g = Math.round(((n >> 8) & 255) * k), b = Math.round((n & 255) * k);
  return `rgb(${r},${g},${b})`;
}

// Rows of breakers with labels: a quick way to fill a breaker panel realistically.
export function breakerItems(x0, y0, cols, rows, pitchX, pitchY, labels, amps, popped = []) {
  const out = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const k = j * cols + i;
    out.push({ t: 'breaker', x: x0 + i * pitchX, y: y0 + j * pitchY, label: labels[k % labels.length], amps: amps[k % amps.length], out: popped.includes(k) });
  }
  return out;
}

// ---------------------------------------------------------------- seats and harness
// A crew seat at full size (origin: centre of the cushion's front edge at floor level, facing -z).
// o: { style: 'bucket' | 'armoured' | 'bench' | 'fold', w, seatH, backH, cushionMat, frameMat, harness: 'worn' | 'laid' | 'none' }
export function seat(K, o = {}) {
  const { u, M } = K;
  const S = (v) => v * u;
  const g = new THREE.Group();
  const w = o.w ?? 0.46, sh = o.seatH ?? 0.36, bh = o.backH ?? 0.62, d = o.depth ?? 0.44;
  const cush = o.cushionMat || M.seat, frame = o.frameMat || M.seatFrame, edge = M.cushionEdge;
  const back = o.recline ?? 0.16;
  const armour = o.style === 'armoured';
  // Pan: a shell under the cushion, then the cushion with raised side bolsters and a piped edge.
  g.add(at(rbox(frame, S(w), S(0.03), S(d), S(0.012)), 0, S(sh - 0.05), S(d / 2)));
  g.add(at(rbox(cush, S(w * 0.66), S(0.07), S(d * 0.92), S(0.03), 3), 0, S(sh), S(d / 2 + 0.01)));
  for (const sx of [-1, 1]) {
    g.add(at(rbox(cush, S(w * 0.18), S(0.095), S(d * 0.9), S(0.04), 3), sx * S(w * 0.4), S(sh + 0.012), S(d / 2 + 0.01), 0, 0, -sx * 0.18));
    g.add(at(rbox(edge, S(0.012), S(0.012), S(d * 0.86), S(0.005)), sx * S(w * 0.31), S(sh + 0.034), S(d / 2 + 0.012)));
  }
  // Back: tilted about the rear of the pan.
  const B = new THREE.Group();
  B.position.set(0, S(sh), S(d - 0.02));
  B.rotation.x = -back;
  B.add(at(rbox(frame, S(w), S(bh), S(0.035), S(0.014)), 0, S(bh / 2), S(0.03)));
  B.add(at(rbox(cush, S(w * 0.64), S(bh * 0.86), S(0.07), S(0.03), 3), 0, S(bh * 0.47), S(-0.01)));
  for (const sx of [-1, 1]) B.add(at(rbox(cush, S(w * 0.17), S(bh * 0.7), S(0.09), S(0.04), 3), sx * S(w * 0.4), S(bh * 0.4), S(-0.015), 0, sx * 0.25, 0));
  // Lumbar roll and a stitched seam line across the back.
  B.add(at(rbox(edge, S(w * 0.6), S(0.01), S(0.012), S(0.004)), 0, S(bh * 0.3), S(-0.046)));
  B.add(at(rbox(edge, S(w * 0.6), S(0.01), S(0.012), S(0.004)), 0, S(bh * 0.62), S(-0.046)));
  if (o.headrest !== false) {
    B.add(at(rbox(cush, S(w * 0.5), S(0.17), S(0.08), S(0.035), 3), 0, S(bh + 0.1), S(0.0)));
    for (const sx of [-1, 1]) B.add(rod(M.seatFrame, V(sx * S(0.07), S(bh - 0.02), S(0.02)), V(sx * S(0.07), S(bh + 0.03), S(0.02)), S(0.007)));
  }
  // Inertia reel for the shoulder straps at the top of the back.
  if (o.harness !== 'none') B.add(at(rbox(M.knob, S(0.09), S(0.06), S(0.05), S(0.01)), 0, S(bh - 0.02), S(0.06)));
  if (armour) {
    // Side armour wings and a ceramic back plate (CH-47-style crew seats).
    for (const sx of [-1, 1]) {
      B.add(at(rbox(o.armourMat || frame, S(0.03), S(bh * 0.85), S(0.26), S(0.01)), sx * S(w / 2 + 0.02), S(bh * 0.45), S(-0.05), 0, sx * -0.12, 0));
      g.add(at(rbox(o.armourMat || frame, S(0.03), S(0.2), S(d * 0.8), S(0.01)), sx * S(w / 2 + 0.02), S(sh - 0.02), S(d / 2)));
    }
    B.add(at(rbox(o.armourMat || frame, S(w * 1.05), S(bh * 0.92), S(0.045), S(0.012)), 0, S(bh * 0.47), S(0.07)));
  }
  g.add(B);
  // Legs / base: a box frame or tube legs on floor rails.
  if (o.style === 'fold') {
    for (const sx of [-1, 1]) g.add(rod(frame, V(sx * S(w * 0.42), 0, S(d * 0.15)), V(sx * S(w * 0.42), S(sh - 0.06), S(d * 0.2)), S(0.012)));
  } else {
    for (const sx of [-1, 1]) {
      g.add(rod(frame, V(sx * S(w * 0.38), S(0.02), S(0.04)), V(sx * S(w * 0.38), S(sh - 0.06), S(0.06)), S(0.013)));
      g.add(rod(frame, V(sx * S(w * 0.38), S(0.02), S(d - 0.03)), V(sx * S(w * 0.38), S(sh - 0.06), S(d - 0.05)), S(0.013)));
      g.add(rod(frame, V(sx * S(w * 0.38), S(0.03), S(0.04)), V(sx * S(w * 0.38), S(sh - 0.08), S(d - 0.05)), S(0.008)));
      g.add(at(rbox(M.metal, S(0.03), S(0.02), S(d + 0.1), S(0.004)), sx * S(w * 0.38), S(0.01), S(d / 2)));   // floor rail
    }
    g.add(rod(frame, V(-S(w * 0.38), S(sh - 0.07), S(0.06)), V(S(w * 0.38), S(sh - 0.07), S(0.06)), S(0.01)));
  }
  // Harness.
  if (o.harness === 'laid') {
    // Unworn: shoulder straps drape down the back cushion onto the pan, lap belts across, buckle on top.
    const top = V(0, S(sh + bh * 0.97), S(d - 0.02 + Math.sin(back) * bh * 0.95 - 0.06));
    for (const sx of [-1, 1]) {
      g.add(strap(M.belt, [V(sx * S(0.05), top.y, top.z), V(sx * S(0.08), S(sh + bh * 0.5), S(d - 0.08 + Math.sin(back) * bh * 0.5 - 0.06)), V(sx * S(0.07), S(sh + 0.05), S(d - 0.12)), V(sx * S(0.04), S(sh + 0.045), S(d * 0.55))], S(0.045), S(0.004), V(0, 0.3, -1).normalize()));
      g.add(strap(M.belt, [V(sx * S(w * 0.36), S(sh + 0.02), S(d - 0.1)), V(sx * S(w * 0.28), S(sh + 0.05), S(d * 0.6)), V(sx * S(0.03), S(sh + 0.045), S(d * 0.45))], S(0.045), S(0.004), V(0, 1, 0)));
    }
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(0.04), S(0.04), S(0.014), 20), M.buckle), 0, S(sh + 0.052), S(d * 0.45)));
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(0.026), S(0.028), S(0.008), 16), M.knob), 0, S(sh + 0.062), S(d * 0.45)));
    g.add(strap(M.belt, [V(0, S(sh + 0.04), S(d * 0.45)), V(0, S(sh + 0.03), S(d * 0.2)), V(0, S(sh - 0.02), S(0.04))], S(0.045), S(0.004), V(0, 1, 0)));
  }
  return g;
}

// ---------------------------------------------------------------- props
// Fire extinguisher in a quick-release bracket, axis along +y from the origin.
export function extinguisher(K, h = 0.36, r = 0.045) {
  const { u, M } = K;
  const S = (v) => v * u;
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(S(r), S(h - 2 * r), 6, 18), M.red), 0, S(h / 2), 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(r * 0.45), S(r * 0.6), S(0.04), 14), M.metal), 0, S(h + 0.01), 0));
  g.add(at(rbox(M.metal, S(0.012), S(0.05), S(0.09), S(0.004)), 0, S(h + 0.045), S(-0.02), 0.3, 0, 0));
  g.add(at(rbox(M.knob, S(0.012), S(0.03), S(0.07), S(0.004)), 0, S(h + 0.02), S(0.03), -0.2, 0, 0));
  g.add(tubeAlong(M.cable, [V(0, S(h + 0.02), S(-0.02)), V(S(0.02), S(h - 0.05), S(-r - 0.01)), V(S(0.03), S(h * 0.4), S(-r - 0.005))], S(0.007)));
  // Bracket bands and the label.
  for (const y of [h * 0.25, h * 0.7]) g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(r + 0.003), S(0.004), 6, 24), M.metal), 0, S(y), 0, Math.PI / 2, 0, 0));
  g.add(at(rbox(M.metal, S(0.05), S(h * 0.7), S(0.01)), 0, S(h * 0.48), S(r + 0.008)));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(r + 0.0015), S(r + 0.0015), S(0.09), 18, 1, true, -0.9, 1.8), K.M.enamel), 0, S(h * 0.48), 0));
  return g;
}

// David-Clark-style headset hanging from a hook (origin at the hook), cups facing ±x.
export function headset(K, col = 0x2e5a3a) {
  const { u, M } = K;
  const S = (v) => v * u;
  const g = new THREE.Group();
  const cupMat = K.cupMat || (K.cupMat = new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.4, clearcoat: 0.6 }));
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(0.09), S(0.01), 8, 24, Math.PI), M.knob), 0, S(-0.09), 0));
  for (const sx of [-1, 1]) {
    g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(0.045), S(0.05), S(0.05), 18).rotateZ(Math.PI / 2), cupMat), sx * S(0.1), S(-0.2), 0));
    g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(0.04), S(0.014), 8, 18).rotateY(Math.PI / 2), K.M.foam), sx * S(0.074), S(-0.2), 0));
  }
  g.add(tubeAlong(M.cable, [V(S(-0.1), S(-0.22), S(0.02)), V(S(-0.13), S(-0.1), S(0.09)), V(S(-0.06), S(-0.05), S(0.13))], S(0.004)));   // boom mic
  g.add(at(new THREE.Mesh(new THREE.SphereGeometry(S(0.014), 10, 8), K.M.foam), S(-0.055), S(-0.05), S(0.13)));
  g.add(tubeAlong(M.cable, [V(S(0.1), S(-0.24), 0), V(S(0.1), S(-0.4), S(0.02)), V(S(0.06), S(-0.55), S(0.05)), V(S(0.02), S(-0.62), S(0.02))], S(0.0045)));   // cord
  g.add(at(rbox(M.metal, S(0.015), S(0.05), S(0.015), S(0.004)), 0, S(0.01), 0));
  return g;
}

// A thermos flask of tea in a bungee holder (origin at its base).
export function flask(K) {
  const { u, M } = K;
  const S = (v) => v * u;
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(0.04), S(0.04), S(0.24), 20), K.M.flask), 0, S(0.12), 0));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(0.043), S(0.041), S(0.06), 20), M.metal), 0, S(0.27), 0));
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(0.041), S(0.005), 6, 20), K.M.webbing), 0, S(0.08), 0, Math.PI / 2, 0, 0));
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(0.041), S(0.005), 6, 20), K.M.webbing), 0, S(0.18), 0, Math.PI / 2, 0, 0));
  return g;
}

// A tin mug of tea in a gimballed cup holder (origin at the base). Because a pilot has priorities.
export function mugHolder(K) {
  const { u, M } = K;
  const S = (v) => v * u;
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(0.048), S(0.005), 6, 24), M.metal), 0, S(0.07), 0, Math.PI / 2, 0, 0));
  g.add(at(rbox(M.metal, S(0.03), S(0.008), S(0.06)), 0, S(0.07), S(0.06)));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(0.04), S(0.036), S(0.095), 20, 1, true), K.M.enamel), 0, S(0.05), 0));
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(S(0.038), 20).rotateX(-Math.PI / 2), K.M.tea), 0, S(0.085), 0));
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(0.022), S(0.006), 6, 12, Math.PI), K.M.enamel), S(0.042), S(0.05), 0, 0, 0, -Math.PI / 2));
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(0.04), S(0.004), 6, 24), K.M.enamel), 0, S(0.097), 0, Math.PI / 2, 0, 0));
  return g;
}

// Eyeball air vent on a bezel, facing +z.
export function vent(K, r = 0.035) {
  const { u, M } = K;
  const S = (v) => v * u;
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.TorusGeometry(S(r), S(r * 0.18), 8, 24), M.metal), 0, 0, 0));
  const ball = new THREE.Mesh(new THREE.SphereGeometry(S(r * 0.82), 16, 12), M.knob);
  ball.scale.z = 0.6; g.add(ball);
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(S(r * 0.35), 14), M.cushionEdge), 0, 0, S(r * 0.5)));
  return g;
}

// Grab handle between two points (model metres), standing off the wall along `n`.
export function grabHandle(K, a, b, n, off = 0.035, r = 0.011) {
  const { u, M } = K;
  const o = n.clone().multiplyScalar(off * u);
  const g = new THREE.Group();
  const mid = a.clone().lerp(b, 0.5).add(o);
  g.add(tubeAlong(M.stick, [a, a.clone().lerp(b, 0.1).add(o), mid, b.clone().lerp(a, 0.1).add(o), b], r * u));
  for (const p of [a, b]) g.add(at(new THREE.Mesh(new THREE.SphereGeometry(r * u * 1.7, 10, 8), M.metal), p.x, p.y, p.z));
  return g;
}

// Map / utility light on a swivel (origin at the mount, pointing -z).
export function mapLight(K, k = 1) {
  const { M } = K;
  const S = (v) => v * K.u * k;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.SphereGeometry(S(0.02), 12, 8), M.knob));
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(0.022), S(0.018), S(0.09), 14).rotateX(Math.PI / 2), M.knob), 0, 0, S(-0.05)));
  g.add(at(new THREE.Mesh(new THREE.CircleGeometry(S(0.017), 14).rotateY(Math.PI), K.M.lensRed), 0, 0, S(-0.096)));
  return g;
}

// A paper placard (an atlas tile on a thin plate), facing +z, w x h full-size metres.
export function placard(K, w, h, paint, bg = '#e9e4d4') {
  const { u, A } = K;
  const it = A.add(w, h, (g, W, H, d) => { g.fillStyle = bg; g.fillRect(0, 0, W, H); paint(g, W, H, d); });
  const m = new THREE.Mesh(A.plane(it, w * u, h * u), A.material);
  return m;
}

// Lever with a ball or T handle along +y (origin at its pivot).
export function lever(K, len, knobMat, { r = 0.008, knob = 0.022, t = false } = {}) {
  const { u, M } = K;
  const S = (v) => v * u;
  const g = new THREE.Group();
  g.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(r), S(r * 1.3), S(len), 10), M.metal), 0, S(len / 2), 0));
  if (t) g.add(at(new THREE.Mesh(new THREE.CapsuleGeometry(S(knob * 0.5), S(knob * 2), 4, 10).rotateZ(Math.PI / 2), knobMat), 0, S(len), 0));
  else g.add(at(new THREE.Mesh(new THREE.SphereGeometry(S(knob), 14, 10), knobMat), 0, S(len), 0));
  return g;
}

// ---------------------------------------------------------------- seated crew figure
// A seated crew member for the outside views, in a seat's frame (origin: the cushion's front edge at
// floor level, facing -z), full-size metres. o: { sh, d, suit, helmet, visor, glove, boot, hands: 'controls' | 'lap' }.
export function crewFigure(K, o) {
  const { u } = K;
  const S = (v) => v * u;
  const P = (x, y, z) => V(S(x), S(y), S(z));
  const g = new THREE.Group();
  const sh = o.sh, d = o.d;
  const limbTo = (mat, a, b, ra, rb = ra) => {
    const len = a.distanceTo(b);
    const geo = new THREE.CylinderGeometry(rb, ra, len, 10, 1, true).translate(0, len / 2, 0);
    const m = new THREE.Mesh(geo, mat);
    m.position.copy(a);
    m.quaternion.setFromUnitVectors(_up, _d.subVectors(b, a).normalize());
    g.add(m);
    for (const [p, r] of [[a, ra], [b, rb]]) { const j = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), mat); j.position.copy(p); g.add(j); }
  };
  const seatY = sh + 0.035;
  const pelvis = P(0, seatY + 0.1, d * 0.62), chest = P(0, seatY + 0.48, d - 0.17);
  limbTo(o.suit, pelvis, chest, S(0.15), S(0.17));
  for (const sx of [-1, 1]) {
    const hip = P(sx * 0.1, seatY + 0.09, d * 0.6), knee = P(sx * 0.12, seatY + 0.12, -0.04), foot = P(sx * 0.14, 0.09, -0.4);
    limbTo(o.suit, hip, knee, S(0.085), S(0.065));
    limbTo(o.suit, knee, foot, S(0.06), S(0.05));
    const boot = new THREE.Mesh(new THREE.BoxGeometry(S(0.1), S(0.1), S(0.27)), o.boot); boot.position.copy(foot).add(P(0, -0.03, -0.07)); g.add(boot);
    const shoulder = P(sx * 0.2, seatY + 0.55, d - 0.18);
    const hand = o.hands === 'lap' ? P(sx * 0.12, seatY + 0.2, 0.08) : sx > 0 ? P(0.02, seatY + 0.28, -0.12) : P(-0.26, seatY + 0.22, d * 0.35);
    const elbow = P(sx * 0.25, seatY + 0.32, d - 0.32);
    limbTo(o.suit, shoulder, elbow, S(0.06), S(0.05));
    limbTo(o.suit, elbow, hand, S(0.05), S(0.04));
    const glove = new THREE.Mesh(new THREE.SphereGeometry(S(0.055), 10, 8), o.glove); glove.position.copy(hand); g.add(glove);
  }
  const neck = P(0, seatY + 0.66, d - 0.19);
  limbTo(o.suit, chest, neck, S(0.07));
  const head = P(0, seatY + 0.8, d - 0.2);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(S(0.145), 18, 14), o.helmet); helmet.position.copy(head); helmet.scale.set(1, 1.05, 1.12); g.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(S(0.15), 18, 10, -Math.PI * 0.8, Math.PI * 0.6, Math.PI * 0.32, Math.PI * 0.3), o.visor);
  visor.position.copy(head); visor.rotation.y = Math.PI; visor.scale.set(1, 1.05, 1.12); g.add(visor);
  const mic = new THREE.Mesh(rodGeo(P(0.12, seatY + 0.74, d - 0.22), P(0.04, seatY + 0.7, d - 0.36), S(0.012)), o.boot); g.add(mic);
  return g;
}

// ---------------------------------------------------------------- slimming for phones
// Merge every opaque mesh under root whose material has no texture into ONE mesh, its material colour
// (times any vertex colour) baked into the vertices, drawn with `material` (vertexColors on). On phones
// this turns dozens of small material draws (and shadow draws) into one. Meshes under `keep` (animated
// controls, the live panel) or flagged userData.keep stay as they are. Returns the merged mesh or null.
export function mergeBaked(root, material, { keep = [], textured = false } = {}) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const geos = [], victims = [];
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o.userData.keep || o.material.transparent || o.material.visible === false) return;
    if (!textured && o.material.map) return;
    for (let a = o; a && a !== root; a = a.parent) if (keep.includes(a)) return;
    const g0 = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    const n = g0.attributes.position.count, c = new Float32Array(n * 3);
    const vc = g0.attributes.color;
    col.copy(o.material.color || col.set(1, 1, 1));
    if (o.material.emissive && o.material.emissiveIntensity > 0.3 && !o.material.emissiveMap) col.add(o.material.emissive.clone().multiplyScalar(o.material.emissiveIntensity * 0.6));
    for (let k = 0; k < n; k++) {
      const s = vc ? [vc.getX(k), vc.getY(k), vc.getZ(k)] : [1, 1, 1];
      c[k * 3] = col.r * s[0]; c[k * 3 + 1] = col.g * s[1]; c[k * 3 + 2] = col.b * s[2];
    }
    for (const name of Object.keys(g0.attributes)) if (!['position', 'normal'].includes(name)) g0.deleteAttribute(name);
    if (!g0.attributes.normal) g0.computeVertexNormals();
    g0.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g0.applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
    g0.clearGroups();
    geos.push(g0); victims.push(o);
  });
  if (!geos.length) return null;
  for (const o of victims) o.parent.remove(o);
  const mesh = new THREE.Mesh(mergeGeometries(geos, false), material);
  root.add(mesh);
  return mesh;
}
