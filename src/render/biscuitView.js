import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KINDS, BISCUIT_STAND, geomOf, clipSlab } from '../sim/biscuits.js';
import { StringMesh } from './strings.js';

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color();
const rand = (a, b) => a + Math.random() * (b - a);
const MAX_CLIPS = 16;
// Soaked biscuit goes darker and browner.
const WET = [0.36, 0.25, 0.16];

// ---------------------------------------------------------------- faces
// Each kind's face, drawn once: its colour, bake and pattern. Planar-mapped across the biscuit's
// largest extent; the edges sample the rim of the same picture.
function faceTexture(k) {
  const S = 256, cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const x = cv.getContext('2d');
  const col = `#${k.color.toString(16).padStart(6, '0')}`, edge = `#${k.edge.toString(16).padStart(6, '0')}`;
  x.fillStyle = col; x.fillRect(0, 0, S, S);
  let seed = k.id.length * 977;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  // Bake: darker towards the outline, a mottle all over.
  const G = geomOf(k), ext = Math.max(G.half, G.cross) * 2;
  const toPx = (u, v) => [(u / ext + 0.5) * S, (0.5 - v / ext) * S];
  x.save();
  x.beginPath();
  G.outline.forEach(([u, v], i) => { const [px, py] = toPx(u, v); if (i) x.lineTo(px, py); else x.moveTo(px, py); });
  x.closePath();
  x.lineWidth = 14; x.strokeStyle = edge; x.globalAlpha = 0.55; x.stroke();
  x.lineWidth = 6; x.globalAlpha = 0.5; x.stroke();
  x.restore();
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '60,30,10' : '255,240,210'},${r() * 0.07})`; x.fillRect(r() * S, r() * S, 2 + r() * 3, 2 + r() * 3); }
  const emboss = (text, px, size, font = 'serif') => {
    x.font = `600 ${size}px ${font}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = 'rgba(255,240,215,0.28)'; x.fillText(text, S / 2 + 1, px + 1);
    x.fillStyle = 'rgba(70,35,10,0.32)'; x.fillText(text, S / 2, px);
  };
  const holes = (pts) => { for (const [hx, hy] of pts) { x.fillStyle = 'rgba(60,30,10,0.4)'; x.beginPath(); x.arc(hx, hy, 3.2, 0, Math.PI * 2); x.fill(); x.fillStyle = 'rgba(255,235,200,0.2)'; x.beginPath(); x.arc(hx + 1, hy + 1, 2, 0, Math.PI * 2); x.fill(); } };
  if (k.id === 'digestive') {
    const pts = [];
    for (let ring = 1; ring <= 3; ring++) for (let i = 0; i < ring * 6; i++) { const a = (i / (ring * 6)) * Math.PI * 2; pts.push([S / 2 + Math.cos(a) * ring * 30, S / 2 + Math.sin(a) * ring * 30]); }
    holes(pts.filter(([, hy]) => Math.abs(hy - S / 2) > 16));
    emboss('DIGESTIVE', S / 2, 26);
  } else if (k.id === 'richtea') {
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; holes([[S / 2 + Math.cos(a) * 100, S / 2 + Math.sin(a) * 100]]); }
    holes([[S / 2 - 40, S / 2 + 30], [S / 2, S / 2 + 30], [S / 2 + 40, S / 2 + 30]]);
    emboss('RICH TEA', S / 2 - 12, 30);
  } else if (k.id === 'ginger') {
    x.strokeStyle = 'rgba(40,18,5,0.45)'; x.lineWidth = 1.6;
    for (let i = 0; i < 26; i++) { x.beginPath(); let px = r() * S, py = r() * S; x.moveTo(px, py); for (let j = 0; j < 4; j++) { px += (r() - 0.5) * 40; py += (r() - 0.5) * 40; x.lineTo(px, py); } x.stroke(); }
    for (let i = 0; i < 300; i++) { x.fillStyle = `rgba(255,220,160,${r() * 0.2})`; x.fillRect(r() * S, r() * S, 1.5, 1.5); }
  } else if (k.id === 'oat') {
    for (let i = 0; i < 260; i++) {
      x.save(); x.translate(r() * S, r() * S); x.rotate(r() * Math.PI);
      x.fillStyle = `rgba(${r() < 0.6 ? '240,215,160' : '120,80,40'},${0.35 + r() * 0.3})`;
      x.beginPath(); x.ellipse(0, 0, 4 + r() * 4, 2 + r() * 2, 0, 0, Math.PI * 2); x.fill(); x.restore();
    }
  } else if (k.id === 'shortbread') {
    for (let i = 0; i < 500; i++) { x.fillStyle = `rgba(255,255,250,${0.3 + r() * 0.5})`; x.fillRect(r() * S, r() * S, 1.6, 1.6); }
    holes([0.25, 0.42, 0.58, 0.75].flatMap((f) => [[S / 2 - 12, f * S], [S / 2 + 12, f * S]]));
  } else if (k.id === 'chocfinger') {
    x.strokeStyle = 'rgba(120,80,55,0.55)'; x.lineWidth = 3;
    for (let i = -10; i < 20; i++) { x.beginPath(); for (let j = 0; j <= 16; j++) { const px = j * 16, py = i * 14 + Math.sin(j * 0.9 + i) * 5 + j * 4; if (j) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); }
    x.fillStyle = 'rgba(255,220,190,0.08)'; x.fillRect(0, 0, S, S * 0.4);
  }
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- shapes
// The biscuit's bands lo..hi as a slab: faces, edges and, where it has broken, a ragged edge. Positions
// are in the biscuit's own frame (offset by `shift`). Keeps each vertex's band coordinate for the wet look.
export function biscuitGeometry(k, lo, hi, seed = 1, shift = null) {
  const G = geomOf(k), ax = G.ax, e0 = G.edges[lo], e1 = G.edges[hi + 1];
  let poly = clipSlab(G.outline, ax, e0, e1);
  let sd = (seed * 7919) % 2147483647 || 1;
  const r = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
  // Ragged breaks: points along each cut, nudged in and out.
  const rough = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    rough.push(a);
    const cut = (lo > 0 && Math.abs(a[ax] - e0) < 1e-7 && Math.abs(b[ax] - e0) < 1e-7) || (hi < G.N - 1 && Math.abs(a[ax] - e1) < 1e-7 && Math.abs(b[ax] - e1) < 1e-7);
    if (!cut) continue;
    const n = Math.max(6, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.0035));
    for (let j = 1; j < n; j++) {
      const t = j / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      p[ax] += (r() - 0.5) * 0.0045 * Math.sin(t * Math.PI) ** 0.5;
      rough.push(p);
    }
  }
  poly = rough;
  const ht = k.t / 2, ext = Math.max(G.half, G.cross) * 2;
  const contour = poly.map(([px, py]) => new THREE.Vector2(px, py));
  if (THREE.ShapeUtils.isClockWise(contour)) { contour.reverse(); poly = poly.slice().reverse(); }
  const tris = THREE.ShapeUtils.triangulateShape(contour, []);
  const pos = [], nrm = [], uv = [], band = [], shade = [];
  const uvOf = (px, py) => [px / ext + 0.5, py / ext + 0.5];
  const vert = (px, py, pz, nx, ny, nz, sh) => {
    pos.push(px, py, pz); nrm.push(nx, ny, nz); uv.push(...uvOf(px, py)); band.push(ax === 0 ? px : py); shade.push(sh);
  };
  for (const [a, b, c] of tris) for (const i of [a, b, c]) vert(poly[i][0], poly[i][1], ht, 0, 0, 1, 1);
  for (const [a, b, c] of tris) for (const i of [a, c, b]) vert(poly[i][0], poly[i][1], -ht, 0, 0, -1, 0.92);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    let nx = b[1] - a[1], ny = -(b[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const sh = 0.82;
    vert(a[0], a[1], ht, nx, ny, 0, sh); vert(a[0], a[1], -ht, nx, ny, 0, sh); vert(b[0], b[1], ht, nx, ny, 0, sh);
    vert(b[0], b[1], ht, nx, ny, 0, sh); vert(a[0], a[1], -ht, nx, ny, 0, sh); vert(b[0], b[1], -ht, nx, ny, 0, sh);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(pos.length).fill(1), 3));
  if (shift) geo.translate(-shift.x, -shift.y, 0);
  geo.userData.band = band;
  geo.userData.shade = shade;
  return geo;
}

// Wet look: each vertex darkens with the soak of the bands round it (interpolated along the band axis).
function paintWet(geo, k, soak) {
  const G = geomOf(k), band = geo.userData.band, shade = geo.userData.shade, col = geo.attributes.color.array;
  const N = G.N, w = (G.edges[N] - G.edges[0]) / N;
  for (let i = 0; i < band.length; i++) {
    const f = THREE.MathUtils.clamp((band[i] - G.edges[0]) / w - 0.5, 0, N - 1);
    const a = Math.floor(f), b = Math.min(N - 1, a + 1), t = f - a;
    const s = Math.sqrt(typeof soak === 'number' ? soak : soak[a] * (1 - t) + soak[b] * t);   // shows early, as tea does
    const sh = shade[i];
    col[i * 3] = sh * (1 + (WET[0] - 1) * s); col[i * 3 + 1] = sh * (1 + (WET[1] - 1) * s); col[i * 3 + 2] = sh * (1 + (WET[2] - 1) * s);
  }
  geo.attributes.color.needsUpdate = true;
}

function clipGeometry() {
  // A small black bulldog clip with a steel loop the line ties to.
  const body = new THREE.BoxGeometry(0.0062, 0.005, 0.0032).translate(0, -0.0012, 0);
  const lip = new THREE.BoxGeometry(0.0066, 0.0012, 0.0036).translate(0, -0.0036, 0);
  const loop = new THREE.TorusGeometry(0.0016, 0.00035, 5, 10).translate(0, 0.0026, 0);
  return mergeGeometries([body.toNonIndexed(), lip.toNonIndexed(), loop.toNonIndexed()], false);
}

// ---------------------------------------------------------------- the stand's cards
// One printed card per peg, standing on the plinth under it: the brand (a sponsor's slot, see
// docs/SPONSORS.md) and what the biscuit is. One mesh with one picture of all six.
const BRAND_COLORS = { digestive: '#7a2230', richtea: '#2f5d8a', ginger: '#8a4a12', oat: '#4f6b2a', shortbread: '#1f3f6b', chocfinger: '#5a2a6a' };
function cardsMesh() {
  const S = BISCUIT_STAND, n = S.kinds.length, W = 256, H = 160;
  const cv = document.createElement('canvas');
  cv.width = W * n; cv.height = H;
  const x = cv.getContext('2d');
  S.kinds.forEach((id, i) => {
    const k = KINDS.find((q) => q.id === id), ox = i * W;
    x.fillStyle = '#f4ecdc'; x.fillRect(ox, 0, W, H);
    x.fillStyle = BRAND_COLORS[id]; x.fillRect(ox, 0, W, 54);
    x.strokeStyle = 'rgba(60,40,20,0.35)'; x.lineWidth = 3; x.strokeRect(ox + 2, 2, W - 4, H - 4);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#fbf3e2'; x.font = '700 34px Georgia, "Times New Roman", serif'; x.fillText(k.brand, ox + W / 2, 29, W - 20);
    x.fillStyle = '#2a1e14'; x.font = '600 26px "Helvetica Neue", Arial, sans-serif'; x.fillText(k.name, ox + W / 2, 84, W - 16);
    if (k.straw) {
      x.font = '500 19px "Helvetica Neue", Arial, sans-serif'; x.fillStyle = '#4a3a2a';
      x.fillText('Snap off both ends,', ox + W / 2, 116, W - 16); x.fillText('dip one end, sip.', ox + W / 2, 139, W - 16);
    } else {
      x.font = 'italic 500 20px Georgia, serif'; x.fillStyle = '#5a4a3a';
      x.fillText(k.soak < 2.5 ? 'Dunk quickly' : k.soak > 6 ? 'Dunk at leisure' : 'For dunking', ox + W / 2, 124, W - 16);
    }
  });
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  const cw = 0.044, ch = 0.0275, parts = [];
  S.pegXs.forEach((px, i) => {
    const g = new THREE.PlaneGeometry(cw, ch);
    const uv = g.attributes.uv;
    for (let j = 0; j < uv.count; j++) uv.setX(j, (i + uv.getX(j)) / n);
    g.rotateX(-0.28).translate(px, S.baseHalf[1] * 2 + ch / 2 * Math.cos(0.28) + 0.0004, S.baseHalf[2] * 0.15);
    parts.push(g);
  });
  const mesh = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, side: THREE.DoubleSide }));
  mesh.position.set(S.x, S.y, S.z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
}

// ---------------------------------------------------------------- the view
// Reads sim.biscuits; never writes to the simulation.
export class BiscuitView {
  constructor(view) {
    this.view = view;
    this.sim = view.sim;
    this.scene = view.scene;
    this.mats = {};
    for (const k of KINDS) this.mats[k.id] = new THREE.MeshStandardMaterial({ map: faceTexture(k), vertexColors: true, roughness: k.id === 'chocfinger' ? 0.55 : 0.85 });
    this.cards = cardsMesh();
    this.scene.add(this.cards);
    this.clips = new THREE.InstancedMesh(clipGeometry(), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.4, metalness: 0.6 }), MAX_CLIPS);
    this.clips.count = 0;
    this.clips.frustumCulled = false;
    this.clips.castShadow = true;
    this.clips.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.scene.add(this.clips);
    this.views = new Map();
    this.chunks = new Map();
    // One hidden sample of each kind, so their shader variants are built with the load-time warm-up.
    this.samples = new THREE.Group();
    for (const k of KINDS) { const m = new THREE.Mesh(biscuitGeometry(k, 0, geomOf(k).N - 1), this.mats[k.id]); m.scale.setScalar(1e-4); this.samples.add(m); }
    this.samples.visible = false;
    this.scene.add(this.samples);
    this.crumbAcc = 0;
  }

  // The group of a biscuit on the line (for the depth cues).
  groupOf(id) { return this.views.get(id)?.mesh || null; }

  make(b) {
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mats[b.kind.id]);
    mesh.castShadow = mesh.receiveShadow = true;
    const string = new StringMesh(b.N + 1, 0.00085, this.view.stringMat);
    string.pts = new Float32Array((b.N + 1) * 3);
    string.mesh.userData.noAO = true;
    this.scene.add(mesh, string.mesh);
    const v = { mesh, string, key: '', soak: new Float32Array(b.nb).fill(-1), rippleAcc: 0 };
    this.views.set(b.id, v);
    return v;
  }

  drop(id) {
    const v = this.views.get(id);
    if (!v) return;
    this.views.delete(id);
    this.scene.remove(v.mesh, v.string.mesh);
    v.mesh.geometry.dispose();
    v.string.mesh.geometry.dispose();
  }

  handleEvent(e) {
    const smoke = this.view.smoke;
    switch (e.type) {
      case 'biscuitRemoved': this.drop(e.id); break;
      case 'biscuitBreak': case 'biscuitSnap': {
        if (e.type === 'biscuitSnap') break;   // the break that goes with it makes the crumbs
        const k = e.biscuit.kind, wet = e.chunk.soak;
        _c.setHex(k.color).multiplyScalar(1 - 0.4 * wet);
        const n = Math.round((e.why === 'snap' ? 10 : 5) * (0.5 + k.shed));
        for (let i = 0; i < n; i++) {
          smoke.emit({ p: [e.pos.x + rand(-0.006, 0.006), e.pos.y + rand(-0.004, 0.004), e.pos.z + rand(-0.006, 0.006)],
            v: [rand(-0.15, 0.15) * (e.why === 'snap' ? 2 : 0.6), rand(-0.05, 0.25), rand(-0.15, 0.15) * (e.why === 'snap' ? 2 : 0.6)],
            life: rand(0.3, 0.6), size0: rand(0.0012, 0.0026), size1: 0.001, col0: [_c.r, _c.g, _c.b], alpha: 1, grav: 9.81, drag: 0.3, kind: 1 });
        }
        if (e.cup) this.view.surfaces[this.sim.cups.indexOf(e.cup)]?.addRipple(e.pos.x, e.pos.z, 0.6, this.view.time);
        break;
      }
      case 'biscuitInTea': this.view.surfaces[this.sim.cups.indexOf(e.cup)]?.addRipple(e.pos.x, e.pos.z, 0.9, this.view.time); break;
      case 'biscuitBite': {
        for (let i = 0; i < 4; i++) {
          smoke.emit({ p: [e.pos.x, e.pos.y, e.pos.z], v: [rand(-0.08, 0.08), rand(-0.1, 0.05), rand(-0.08, 0.08)], life: rand(0.3, 0.5),
            size0: rand(0.0012, 0.002), size1: 0.001, col0: [0.78, 0.6, 0.38], alpha: 1, grav: 9.81, drag: 0.3, kind: 1 });
        }
        break;
      }
      default: break;
    }
  }

  update(alpha, dt) {
    const sys = this.sim.biscuits, view = this.view;
    let nc = 0;
    this.crumbAcc += dt;
    const shedNow = this.crumbAcc > 0.06;
    if (shedNow) this.crumbAcc = 0;
    for (const b of sys.list) {
      let v = this.views.get(b.id);
      if (!v) v = this.make(b);
      // Shape: the bands still there (and, in hand, the bites taken from the far end).
      const visHi = b.held ? b.hi - Math.round(b.eaten * (b.hi - b.lo + 1)) : b.hi;
      const key = `${b.lo}:${visHi}`;
      if (key !== v.key) {
        v.key = key;
        v.mesh.geometry.dispose();
        v.mesh.geometry = visHi >= b.lo ? biscuitGeometry(b.kind, b.lo, visHi, b.id * 13 + b.version) : new THREE.BufferGeometry();
        v.soak.fill(-1);
      }
      if (visHi >= b.lo) {
        let changed = false;
        for (let i = 0; i < b.nb; i++) if (Math.abs(b.s[i] - v.soak[i]) > 0.01) { changed = true; v.soak[i] = b.s[i]; }
        if (changed) paintWet(v.mesh.geometry, b.kind, b.s);
      }
      b.track.sample(alpha, _p, _q);
      v.mesh.position.copy(_p);
      v.mesh.quaternion.copy(_q);
      if (b.attach && b.attach.kind === 'heli') {
        if (view.bagPosCarried) view.bagPosCarried.lerp(_p, 0.5); else view.bagPosCarried = _p.clone();
      }
      // The line, and the clip on the edge (none once it is in a neighbour's hand).
      v.string.mesh.visible = !b.held;
      if (!b.held) {
        b.sampleString(alpha, v.string.pts);
        view.pinString(b, v.string.pts, _p, _q);
        v.string.update(v.string.pts);
        if (nc < MAX_CLIPS) {
          const a = b.anchorLocal;
          _m.compose(_s.set(a.x, a.y - 0.0035, 0).applyQuaternion(_q).add(_p), _q, _s.set(1, 1, 1));
          this.clips.setMatrixAt(nc++, _m);
        }
      }
      // In the tea: ripples as it moves, and crumbs off the soggy part.
      if (b.cup && b.immersion > 0.05) {
        const surf = view.surfaces[this.sim.cups.indexOf(b.cup)];
        v.rippleAcc += dt;
        const sp = Math.hypot(b.vel.x, b.vel.z) + Math.abs(b.vel.y) * 0.5;
        if (surf && v.rippleAcc > 0.08 && sp > 0.02) { v.rippleAcc = 0; surf.addRipple(b.pos.x, b.pos.z, Math.min(1, sp * 6), view.time); }
        if (shedNow && Math.random() < b.kind.shed * (0.2 + sp * 8) * b.wetness) {
          _c.setHex(b.kind.color).multiplyScalar(0.7);
          const a = Math.random() * Math.PI * 2, rr = Math.random() * 0.012;
          view.smoke.emit({ p: [b.pos.x + Math.cos(a) * rr, b.cup.waterY + 0.0006, b.pos.z + Math.sin(a) * rr], v: [rand(-0.01, 0.01), 0, rand(-0.01, 0.01)],
            life: rand(1.2, 2.2), size0: rand(0.0012, 0.002), size1: 0.0008, col0: [_c.r, _c.g, _c.b], alpha: 0.9, drag: 1.5 });
        }
      }
    }
    for (const [id] of this.views) if (!sys.list.some((b) => b.id === id)) this.drop(id);
    this.clips.count = nc;
    this.clips.instanceMatrix.needsUpdate = true;
    this.updateChunks(alpha);
  }

  updateChunks(alpha) {
    const list = this.sim.biscuits.chunks;
    const seen = this.seenChunks || (this.seenChunks = new Set());
    seen.clear();
    for (const c of list) {
      seen.add(c.id);
      let m = this.chunks.get(c.id);
      if (!m) {
        const G = geomOf(c.kind);
        let cx = 0, cy = 0, fr = 0;
        for (let i = c.a; i <= c.b; i++) { const B = G.bands[i]; cx += B.c[0] * B.frac; cy += B.c[1] * B.frac; fr += B.frac; }
        const geo = biscuitGeometry(c.kind, c.a, c.b, c.seed, { x: cx / fr, y: cy / fr });
        paintWet(geo, c.kind, c.soak);
        m = new THREE.Mesh(geo, this.mats[c.kind.id]);
        m.castShadow = true; m.receiveShadow = true;
        this.scene.add(m);
        this.chunks.set(c.id, m);
      }
      m.position.lerpVectors(c.prevPos, c.pos, alpha);
      m.quaternion.slerpQuaternions(c.prevQuat, c.quat, alpha);
      m.scale.setScalar(Math.max(0.05, c.fade));
    }
    for (const [id, m] of this.chunks) {
      if (seen.has(id)) continue;
      this.scene.remove(m);
      m.geometry.dispose();
      this.chunks.delete(id);
    }
  }
}
