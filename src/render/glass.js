import * as THREE from 'three';

// Glass-cockpit drawing without canvas uploads. Pages are drawn through a small subset of the canvas 2D
// API (paths, strokes, fills, dashes, transforms, clipping and text) into one dynamic vertex buffer,
// shown by a single mesh on the instrument panel. Text comes from a signed-distance-field glyph atlas
// built once at start-up, so it stays sharp at any size or angle. Redrawing a page re-fills a few
// thousand vertices (a cheap buffer update) instead of rasterising and uploading a texture.

// ---------------------------------------------------------------- SDF glyph atlas (after tiny-sdf)
const INF = 1e20;
function edt1d(grid, offset, stride, length, f, v, z) {
  v[0] = 0; z[0] = -INF; z[1] = INF; f[0] = grid[offset];
  for (let q = 1, k = 0, s = 0; q < length; q++) {
    f[q] = grid[offset + q * stride];
    const q2 = q * q;
    do {
      const r = v[k];
      s = (f[q] - f[r] + q2 - r * r) / (q - r) / 2;
    } while (s <= z[k] && --k > -1);
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  for (let q = 0, k = 0; q < length; q++) {
    while (z[k + 1] < q) k++;
    const r = v[k], qr = q - r;
    grid[offset + q * stride] = f[r] + qr * qr;
  }
}
function edt(data, x0, y0, width, height, gridSize, f, v, z) {
  for (let x = x0; x < x0 + width; x++) edt1d(data, y0 * gridSize + x, gridSize, height, f, v, z);
  for (let y = y0; y < y0 + height; y++) edt1d(data, y * gridSize + x0, 1, width, f, v, z);
}

const CHARS = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join('') + '·−—▲▼°×';
export const ATLAS_SIZE = 48;     // font size the atlas is rendered at
const BUFFER = 6, RADIUS = 10, CUTOFF = 0.25;

export function buildAtlas(fontFamily, weight = 700) {
  const fs = ATLAS_SIZE, size = fs + BUFFER * 4;
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.font = `${weight} ${fs}px ${fontFamily}`;
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillStyle = 'black';
  const outer = new Float64Array(size * size), inner = new Float64Array(size * size);
  const f = new Float64Array(size), z = new Float64Array(size + 1), vv = new Uint16Array(size);
  const glyphs = new Map();
  const W = 1024;
  let px = 0, py = 0, rowH = 0;
  const pixels = new Uint8Array(W * W);
  for (const ch of CHARS) {
    const m = ctx.measureText(ch);
    const top = Math.ceil(m.actualBoundingBoxAscent);
    const left = Math.floor(-m.actualBoundingBoxLeft);
    const gw = Math.max(0, Math.min(size - BUFFER, Math.ceil(m.actualBoundingBoxRight - left)));
    const gh = Math.max(0, Math.min(size - BUFFER, top + Math.ceil(m.actualBoundingBoxDescent)));
    const w = gw + 2 * BUFFER, h = gh + 2 * BUFFER;
    const g = { adv: m.width, left, top, w, h, x: 0, y: 0 };
    glyphs.set(ch, g);
    if (gw === 0 || gh === 0) continue;
    ctx.clearRect(0, 0, size, size);
    ctx.fillText(ch, BUFFER - left, BUFFER + top);
    const img = ctx.getImageData(BUFFER, BUFFER, gw, gh).data;
    const len = w * h;
    outer.fill(INF, 0, len); inner.fill(0, 0, len);
    for (let y = 0; y < gh; y++) for (let x = 0; x < gw; x++) {
      const a = img[4 * (y * gw + x) + 3] / 255;
      if (a === 0) continue;
      const j = (y + BUFFER) * w + x + BUFFER;
      if (a === 1) { outer[j] = 0; inner[j] = INF; } else { const d = 0.5 - a; outer[j] = d > 0 ? d * d : 0; inner[j] = d < 0 ? d * d : 0; }
    }
    edt(outer, 0, 0, w, h, w, f, vv, z);
    edt(inner, BUFFER, BUFFER, gw, gh, w, f, vv, z);
    if (px + w > W) { px = 0; py += rowH + 1; rowH = 0; }
    g.x = px; g.y = py;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const d = Math.sqrt(outer[i]) - Math.sqrt(inner[i]);
      pixels[(py + y) * W + px + x] = Math.max(0, Math.min(255, Math.round(255 - 255 * (d / RADIUS + CUTOFF))));
    }
    px += w + 1; rowH = Math.max(rowH, h);
  }
  const H = Math.min(W, 1 << Math.ceil(Math.log2(py + rowH + 1)));
  const tex = new THREE.DataTexture(pixels.subarray(0, W * H), W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  const capH = glyphs.get('H').top;
  return { tex, glyphs, W, H, capH };
}

// ---------------------------------------------------------------- shader
const VERT = `
attribute vec4 aux;
attribute vec4 clip;
attribute vec4 acolor;
uniform float uW, uH;
varying vec2 vUv; varying vec4 vAux; varying vec4 vClip; varying vec4 vColor; varying vec2 vP;
void main() {
  vUv = uv; vAux = aux; vClip = clip; vColor = acolor; vP = position.xy;
  vec3 p = vec3(position.x * uH - uW * 0.5, uH * 0.5 - position.y * uH, 0.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
const FRAG = `
uniform sampler2D atlas;
uniform float uBright;
varying vec2 vUv; varying vec4 vAux; varying vec4 vClip; varying vec4 vColor; varying vec2 vP;
void main() {
  if (vP.x < vClip.x || vP.y < vClip.y || vP.x > vClip.z || vP.y > vClip.w) discard;
  float a = 1.0;
  float mode = vAux.x;
  if (mode > 0.5 && mode < 1.5) {              // SDF glyph
    float d = texture2D(atlas, vUv).r;
    float w = max(fwidth(d) * 0.75, 1e-4);
    a = smoothstep(0.75 - w, 0.75 + w, d);
  } else if (mode > 1.5 && mode < 2.5) {       // stroke: distance across the line
    float w = max(fwidth(vAux.y), 1e-6);
    a = clamp((vAux.z - abs(vAux.y)) / w + 0.5, 0.0, 1.0);
  } else if (mode > 2.5) {                     // disc: local position against the radius
    float r = length(vAux.yz);
    float w = max(fwidth(r), 1e-6);
    a = clamp((vAux.w - r) / w + 0.5, 0.0, 1.0);
  }
  a *= vColor.a;
  if (a < 0.003) discard;
  gl_FragColor = vec4(vColor.rgb * uBright, a);
}`;

// ---------------------------------------------------------------- colours
const _colors = new Map();
function parseColor(s) {
  let c = _colors.get(s);
  if (c) return c;
  c = [255, 255, 255, 255];
  if (s[0] === '#') {
    const h = s.length === 4 ? s.slice(1).split('').map((x) => x + x).join('') : s.slice(1, 7);
    c = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), 255];
  } else {
    const m = s.match(/rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(',').map((x) => parseFloat(x)); c = [p[0], p[1], p[2], p.length > 3 ? Math.round(p[3] * 255) : 255]; }
  }
  if (_colors.size > 4000) _colors.clear();
  _colors.set(s, c);
  return c;
}

// ---------------------------------------------------------------- the drawing context
const SEG = 48;    // segments in a full circle
export class GlassLayer {
  // atlas: from buildAtlas; w, h: the panel face (model metres); drawing units are panel heights.
  constructor(atlas, w, h, maxVerts = 60000) {
    this.atlas = atlas;
    this.max = maxVerts;
    const g = new THREE.BufferGeometry();
    const mk = (n, T = Float32Array) => new THREE.BufferAttribute(new T(maxVerts * n), n).setUsage(THREE.DynamicDrawUsage);
    this.pos = mk(3); this.uv = mk(2); this.aux = mk(4); this.clipA = mk(4);
    this.col = new THREE.BufferAttribute(new Uint8Array(maxVerts * 4), 4, true).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.pos); g.setAttribute('uv', this.uv); g.setAttribute('aux', this.aux);
    g.setAttribute('clip', this.clipA); g.setAttribute('acolor', this.col);
    g.setDrawRange(0, 0);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(w, h));
    this.material = new THREE.ShaderMaterial({
      uniforms: { atlas: { value: atlas.tex }, uW: { value: w }, uH: { value: h }, uBright: { value: 1 } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.geometry = g;
    this.begin();
  }

  begin() {
    this.n = 0;
    this.m = [1, 0, 0, 1, 0, 0];
    this.stack = [];
    this.clipR = [-1e9, -1e9, 1e9, 1e9];
    this.fillStyle = '#ffffff'; this.strokeStyle = '#ffffff'; this.lineWidth = 1; this.globalAlpha = 1;
    this.dash = null; this.fontSize = 10; this.textAlign = 'left'; this.textBaseline = 'alphabetic';
    this.paths = []; this.cur = null;
  }

  end() {
    const n = this.n;
    for (const a of [this.pos, this.uv, this.aux, this.clipA, this.col]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
    this.geometry.setDrawRange(0, n);
  }

  // ---- state
  save() { this.stack.push({ m: this.m.slice(), clipR: this.clipR.slice(), fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, dash: this.dash }); }
  restore() { const s = this.stack.pop(); if (s) Object.assign(this, s); }
  setTransform(a, b, c, d, e, f) { this.m = [a, b, c, d, e, f]; }
  translate(x, y) { const m = this.m; m[4] += m[0] * x + m[2] * y; m[5] += m[1] * x + m[3] * y; }
  rotate(t) {
    const m = this.m, c = Math.cos(t), s = Math.sin(t);
    const a = m[0] * c + m[2] * s, b = m[1] * c + m[3] * s, cc = m[0] * -s + m[2] * c, d = m[1] * -s + m[3] * c;
    m[0] = a; m[1] = b; m[2] = cc; m[3] = d;
  }
  scale(x, y = x) { const m = this.m; m[0] *= x; m[1] *= x; m[2] *= y; m[3] *= y; }
  get scaleNow() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); }
  setLineDash(d) { this.dash = d && d.length ? d : null; }
  set font(s) { const m = /([\d.]+)px/.exec(s); if (m) this.fontSize = parseFloat(m[1]); }
  createLinearGradient() { const self = this; return { stops: [], addColorStop(t, c) { this.stops.push(c); }, toString() { return this.stops[0] || self.fillStyle; } }; }
  clearRect() {}

  // ---- emitting vertices (x, y already in panel units)
  v(x, y, u, w, mode, a1, a2, a3, rgba) {
    const i = this.n++;
    if (i >= this.max) { this.n = this.max; return; }
    this.pos.array[i * 3] = x; this.pos.array[i * 3 + 1] = y; this.pos.array[i * 3 + 2] = 0;
    this.uv.array[i * 2] = u; this.uv.array[i * 2 + 1] = w;
    const A = this.aux.array; A[i * 4] = mode; A[i * 4 + 1] = a1; A[i * 4 + 2] = a2; A[i * 4 + 3] = a3;
    const C = this.clipA.array, cr = this.clipR; C[i * 4] = cr[0]; C[i * 4 + 1] = cr[1]; C[i * 4 + 2] = cr[2]; C[i * 4 + 3] = cr[3];
    const K = this.col.array; K[i * 4] = rgba[0]; K[i * 4 + 1] = rgba[1]; K[i * 4 + 2] = rgba[2]; K[i * 4 + 3] = rgba[3] * this.globalAlpha;
  }
  tx(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  rgba(style) { return parseColor(String(style)); }

  // ---- paths
  beginPath() { this.paths = []; this.cur = null; }
  moveTo(x, y) { this.cur = [this.tx(x, y)]; this.cur.closed = false; this.paths.push(this.cur); }
  lineTo(x, y) { if (!this.cur) this.moveTo(x, y); else this.cur.push(this.tx(x, y)); }
  closePath() { if (this.cur) this.cur.closed = true; }
  arc(x, y, r, a0, a1, ccw = false) {
    const full = Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6;
    let sweep = a1 - a0;
    if (!full) { if (!ccw && sweep < 0) sweep += Math.PI * 2; if (ccw && sweep > 0) sweep -= Math.PI * 2; }
    const n = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI * 2) * SEG));
    const start = [x + Math.cos(a0) * r, y + Math.sin(a0) * r];
    if (!this.cur || full) this.moveTo(...start); else this.lineTo(...start);
    for (let i = 1; i <= n; i++) { const a = a0 + sweep * i / n; this.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    if (full) { this.cur.closed = true; this.cur.circle = { c: this.tx(x, y), r: r * this.scaleNow }; }
  }
  ellipse(x, y, rx, ry, rot, a0, a1) {
    this.save(); this.translate(x, y); this.rotate(rot); this.scale(1, ry / rx);
    this.arc(0, 0, rx, a0, a1);
    if (this.cur) this.cur.circle = null;
    this.restore();
  }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    this.moveTo(x + r, y);
    this.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    this.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    this.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    this.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    this.closePath();
  }
  clip() {
    // Axis-aligned clipping only: the bounding box of the current path.
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of this.paths) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const c = this.clipR;
    this.clipR = [Math.max(c[0], x0), Math.max(c[1], y0), Math.min(c[2], x1), Math.min(c[3], y1)];
  }

  fill() {
    const col = this.rgba(this.fillStyle);
    for (const p of this.paths) {
      if (p.circle) { this.disc(p.circle.c[0], p.circle.c[1], p.circle.r, col); continue; }
      if (p.length < 3) continue;
      // Convex fan (every filled shape on the pages is convex).
      const [x0, y0] = p[0];
      for (let i = 1; i < p.length - 1; i++) {
        this.v(x0, y0, 0, 0, 0, 0, 0, 0, col); this.v(p[i][0], p[i][1], 0, 0, 0, 0, 0, 0, col); this.v(p[i + 1][0], p[i + 1][1], 0, 0, 0, 0, 0, 0, col);
      }
    }
  }
  disc(cx, cy, r, col) {
    const R = r + 0.004;
    const q = [[-R, -R], [R, -R], [R, R], [-R, -R], [R, R], [-R, R]];
    for (const [dx, dy] of q) this.v(cx + dx, cy + dy, 0, 0, 3, dx, dy, r, col);
  }
  stroke() {
    const col = this.rgba(this.strokeStyle);
    const hw = this.lineWidth * this.scaleNow / 2;
    for (const p of this.paths) {
      const pts = p.closed ? [...p, p[0]] : p;
      if (this.dash) this.dashed(pts, hw, col); else this.polyline(pts, hw, col);
    }
  }
  dashed(pts, hw, col) {
    const s = this.scaleNow, on = this.dash[0] * s, off = (this.dash[1] ?? this.dash[0]) * s;
    let draw = true, left = on;
    let seg = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      let [ax, ay] = pts[i - 1];
      const [bx, by] = pts[i];
      let len = Math.hypot(bx - ax, by - ay);
      while (len > 1e-9) {
        const step = Math.min(left, len);
        const t = step / len;
        const nx = ax + (bx - ax) * t, ny = ay + (by - ay) * t;
        if (draw) seg.push([nx, ny]);
        left -= step; len -= step; ax = nx; ay = ny;
        if (left <= 1e-9) {
          if (draw && seg.length > 1) this.polyline(seg, hw, col);
          draw = !draw; left = draw ? on : off; seg = [[ax, ay]];
        }
      }
    }
    if (draw && seg.length > 1) this.polyline(seg, hw, col);
  }
  polyline(pts, hw, col) {
    const pad = 0.004 + hw * 0.1;
    const H = hw + pad;
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
      const dx = bx - ax, dy = by - ay, l = Math.hypot(dx, dy);
      if (l < 1e-9) continue;
      // Extend each segment by half the width so joints overlap (cheap, good enough at these widths).
      const ux = dx / l, uy = dy / l, nx = -uy * H, ny = ux * H;
      const ex = i > 1 ? ux * hw * 0.5 : 0, ey = i > 1 ? uy * hw * 0.5 : 0;
      const x0 = ax - ex, y0 = ay - ey;
      this.v(x0 + nx, y0 + ny, 0, 0, 2, H, hw, 0, col); this.v(bx + nx, by + ny, 0, 0, 2, H, hw, 0, col); this.v(bx - nx, by - ny, 0, 0, 2, -H, hw, 0, col);
      this.v(x0 + nx, y0 + ny, 0, 0, 2, H, hw, 0, col); this.v(bx - nx, by - ny, 0, 0, 2, -H, hw, 0, col); this.v(x0 - nx, y0 - ny, 0, 0, 2, -H, hw, 0, col);
    }
  }
  fillRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.fill(); }
  strokeRect(x, y, w, h) { this.beginPath(); this.rect(x, y, w, h); this.stroke(); }

  // ---- text
  measure(str) {
    const G = this.atlas.glyphs;
    let w = 0;
    for (const ch of str) { const g = G.get(ch) || G.get('?'); w += g.adv; }
    return w * this.fontSize / ATLAS_SIZE;
  }
  measureText(str) { return { width: this.measure(str) }; }
  fillText(str, x, y) {
    const A = this.atlas, G = A.glyphs, k = this.fontSize / ATLAS_SIZE;
    const width = this.measure(str);
    let ox = this.textAlign === 'center' ? -width / 2 : this.textAlign === 'right' || this.textAlign === 'end' ? -width : 0;
    const base = this.textBaseline;
    const oy = base === 'middle' ? A.capH * k / 2 : base === 'top' ? A.capH * k : base === 'bottom' ? -0.22 * this.fontSize : 0;
    const col = this.rgba(this.fillStyle);
    for (const ch of str) {
      const g = G.get(ch) || G.get('?');
      if (g.w > 2 * BUFFER && g.h > 2 * BUFFER) {
        const qx = x + ox + (g.left - BUFFER) * k, qy = y + oy - (g.top + BUFFER) * k, qw = g.w * k, qh = g.h * k;
        const u0 = g.x / A.W, v0 = g.y / A.H, u1 = (g.x + g.w) / A.W, v1 = (g.y + g.h) / A.H;
        // Corners through the transform, without allocating.
        const m = this.m;
        const ax = m[0] * qx + m[2] * qy + m[4], ay = m[1] * qx + m[3] * qy + m[5];
        const ux = m[0] * qw, uy = m[1] * qw, vx = m[2] * qh, vy = m[3] * qh;
        this.v(ax, ay, u0, v0, 1, 0, 0, 0, col); this.v(ax + ux, ay + uy, u1, v0, 1, 0, 0, 0, col); this.v(ax + ux + vx, ay + uy + vy, u1, v1, 1, 0, 0, 0, col);
        this.v(ax, ay, u0, v0, 1, 0, 0, 0, col); this.v(ax + ux + vx, ay + uy + vy, u1, v1, 1, 0, 0, 0, col); this.v(ax + vx, ay + vy, u0, v1, 1, 0, 0, 0, col);
      }
      ox += g.adv * k;
    }
  }
}
