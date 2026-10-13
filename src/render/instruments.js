import * as THREE from 'three';

// Live cockpit instruments drawn into a canvas texture at a modest rate. Readings are "full-size
// equivalent" through Froude scaling (lengths x L, speeds x sqrt L, masses x L^3), so a micro heli
// hovering 30 cm over the table reads like a real one at 30 ft, and a soaked tea bag on the hook
// weighs what an underslung load would.
const D2R = Math.PI / 180;
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();

export function readFlight(h, sim, L, gearDrop) {
  _f.set(0, 0, -1).applyQuaternion(h.quat);
  _r.set(1, 0, 0).applyQuaternion(h.quat);
  _u.set(0, 1, 0).applyQuaternion(h.quat);
  const sL = Math.sqrt(L);
  const hs = Math.hypot(h.vel.x, h.vel.z);
  const load = sim.carriedCargo().reduce((m, b) => m + b.mass, 0);
  const hover = 1 / h.def.thrustToWeight;
  const trq = 60 * Math.pow(Math.max(0, h.thrustFrac) / hover, 1.5);
  return {
    pitch: Math.asin(Math.max(-1, Math.min(1, _f.y))),
    roll: Math.atan2(-_r.y, _u.y),
    hdg: ((-h.heading() / D2R + 40) % 360 + 360) % 360,
    kt: hs * sL * 1.944,
    altFt: Math.max(0, (h.pos.y - gearDrop) * L * 3.281),
    radFt: Math.max(0, (h.skidClearance ?? 0) * L * 3.281),
    fpm: h.vel.y * sL * 196.85,
    nr: h.rotorSpeed * 100,
    trq,
    tot: 560 + 3.2 * trq,
    n1: 62 + 0.36 * trq,
    loadKg: load * L * L * L,
    hooked: sim.carriedCargo().length,
    slip: Math.max(-1, Math.min(1, (h.vel.x * _r.x + h.vel.z * _r.z) * 2.5)),
  };
}

// ---------------------------------------------------------------- drawing helpers
function face(g, x, y, r) {
  const grd = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.05);
  grd.addColorStop(0, '#26292c'); grd.addColorStop(1, '#0c0d0e');
  g.fillStyle = '#3a3c3e'; g.beginPath(); g.arc(x, y, r * 1.12, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#121314'; g.beginPath(); g.arc(x, y, r * 1.05, 0, Math.PI * 2); g.fill();
  g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function glassGlint(g, x, y, r) {
  const gl = g.createLinearGradient(x - r, y - r, x + r * 0.2, y + r * 0.3);
  gl.addColorStop(0, 'rgba(255,255,255,0.13)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.02)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function label(g, x, y, text, size, col = '#d9d6cc') {
  g.fillStyle = col; g.font = `600 ${size}px "Arial Narrow", Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, x, y);
}
function needle(g, x, y, r, ang, w = 0.06, col = '#f2efe6') {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = col; g.beginPath();
  g.moveTo(-r * w, r * 0.18); g.lineTo(0, -r * 0.88); g.lineTo(r * w, r * 0.18); g.closePath(); g.fill();
  g.restore();
  g.fillStyle = '#1b1c1d'; g.beginPath(); g.arc(x, y, r * 0.09, 0, Math.PI * 2); g.fill();
}
// Round gauge: value v in [lo, hi] over a sweep from a0 to a1 (radians, 0 = up, clockwise).
function dial(g, x, y, r, v, lo, hi, { a0 = -2.4, a1 = 2.4, major = 10, minor = 2, nums = null, arcs = [], name = '', unit = '', digits = null } = {}) {
  face(g, x, y, r);
  const ang = (t) => a0 + (a1 - a0) * (t - lo) / (hi - lo);
  for (const [s, e, col] of arcs) {
    g.strokeStyle = col; g.lineWidth = r * 0.09; g.beginPath();
    g.arc(x, y, r * 0.86, ang(s) - Math.PI / 2, ang(e) - Math.PI / 2); g.stroke();
  }
  g.strokeStyle = '#e8e4d8';
  for (let t = lo; t <= hi + 1e-6; t += (hi - lo) / (major * minor)) {
    const k = Math.round((t - lo) / ((hi - lo) / (major * minor)));
    const big = k % minor === 0;
    const a = ang(t) - Math.PI / 2;
    g.lineWidth = big ? r * 0.04 : r * 0.022;
    const r0 = big ? 0.74 : 0.8;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * r0, y + Math.sin(a) * r * r0); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke();
  }
  if (nums) for (const [t, s] of nums) { const a = ang(t) - Math.PI / 2; label(g, x + Math.cos(a) * r * 0.58, y + Math.sin(a) * r * 0.58, s, r * 0.19); }
  if (name) label(g, x, y + r * 0.36, name, r * 0.15, '#a9a69c');
  if (unit) label(g, x, y - r * 0.32, unit, r * 0.12, '#8c8a82');
  if (digits !== null) {
    g.fillStyle = '#050505'; g.fillRect(x - r * 0.3, y + r * 0.5, r * 0.6, r * 0.22);
    label(g, x, y + r * 0.61, digits, r * 0.17, '#ffb648');
  }
  needle(g, x, y, r, ang(Math.max(lo - (hi - lo) * 0.03, Math.min(hi + (hi - lo) * 0.03, v))));
  glassGlint(g, x, y, r);
}

function attitude(g, x, y, r, pitch, roll, slip = 0) {
  face(g, x, y, r);
  g.save();
  g.beginPath(); g.arc(x, y, r * 0.96, 0, Math.PI * 2); g.clip();
  g.translate(x, y); g.rotate(-roll);
  const pp = r * 1.6;     // pixels per radian of pitch
  const off = pitch * pp;
  g.fillStyle = '#3d7fc0'; g.fillRect(-r * 2, -r * 2 + off, r * 4, r * 2);
  g.fillStyle = '#7a4e2c'; g.fillRect(-r * 2, off, r * 4, r * 2);
  g.strokeStyle = '#f4f2ea'; g.lineWidth = r * 0.035;
  g.beginPath(); g.moveTo(-r * 2, off); g.lineTo(r * 2, off); g.stroke();
  g.lineWidth = r * 0.022;
  for (const d of [-20, -10, 10, 20]) {
    const yy = off - d * D2R * pp, w = Math.abs(d) === 10 ? 0.28 : 0.42;
    g.beginPath(); g.moveTo(-r * w, yy); g.lineTo(r * w, yy); g.stroke();
  }
  // Bank scale (moves with the horizon).
  for (const d of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = d * D2R - Math.PI / 2;
    const r0 = d === 0 ? 0.7 : (Math.abs(d) % 30 === 0 ? 0.74 : 0.8);
    g.lineWidth = r * (d % 30 === 0 ? 0.04 : 0.025);
    g.beginPath(); g.moveTo(Math.cos(a) * r * r0, Math.sin(a) * r * r0); g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.stroke();
  }
  g.restore();
  // Fixed miniature aircraft and bank pointer.
  g.strokeStyle = '#ffb648'; g.lineWidth = r * 0.07; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - r * 0.52, y); g.lineTo(x - r * 0.16, y); g.lineTo(x - r * 0.08, y + r * 0.09); g.moveTo(x + r * 0.52, y); g.lineTo(x + r * 0.16, y); g.lineTo(x + r * 0.08, y + r * 0.09); g.stroke();
  g.fillStyle = '#ffb648'; g.beginPath(); g.arc(x, y, r * 0.045, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(x, y - r * 0.68); g.lineTo(x - r * 0.07, y - r * 0.56); g.lineTo(x + r * 0.07, y - r * 0.56); g.closePath(); g.fill();
  g.lineCap = 'butt';
  // Slip ball.
  g.fillStyle = '#0a0a0a'; g.fillRect(x - r * 0.4, y + r * 0.72, r * 0.8, r * 0.14);
  g.fillStyle = '#eee'; g.beginPath(); g.arc(x + slip * r * 0.3, y + r * 0.79, r * 0.06, 0, Math.PI * 2); g.fill();
  glassGlint(g, x, y, r);
}

function compass(g, x, y, r, hdg) {
  face(g, x, y, r);
  g.save(); g.translate(x, y); g.rotate(-hdg * D2R);
  g.strokeStyle = '#e8e4d8';
  for (let d = 0; d < 360; d += 5) {
    const a = d * D2R - Math.PI / 2, big = d % 30 === 0;
    g.lineWidth = r * (big ? 0.035 : 0.02);
    g.beginPath(); g.moveTo(Math.cos(a) * r * (big ? 0.72 : 0.8), Math.sin(a) * r * (big ? 0.72 : 0.8)); g.lineTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); g.stroke();
    if (big) {
      g.save(); g.rotate(d * D2R);
      const t = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      label(g, 0, -r * 0.58, t, r * 0.17, d % 90 === 0 ? '#ffffff' : '#d9d6cc');
      g.restore();
    }
  }
  g.restore();
  g.fillStyle = '#ffb648';
  g.beginPath(); g.moveTo(x, y - r * 0.95); g.lineTo(x - r * 0.07, y - r * 0.8); g.lineTo(x + r * 0.07, y - r * 0.8); g.closePath(); g.fill();
  // Little aircraft symbol.
  g.strokeStyle = '#ffb648'; g.lineWidth = r * 0.05;
  g.beginPath(); g.moveTo(x, y - r * 0.3); g.lineTo(x, y + r * 0.3); g.moveTo(x - r * 0.25, y - r * 0.02); g.lineTo(x + r * 0.25, y - r * 0.02); g.moveTo(x - r * 0.1, y + r * 0.25); g.lineTo(x + r * 0.1, y + r * 0.25); g.stroke();
  glassGlint(g, x, y, r);
}

// ---------------------------------------------------------------- glass-cockpit (CH-47F-style) pages
function pfd(g, x, y, w, h, F) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  const cx = x + w / 2, cy = y + h * 0.46;
  const pp = h * 1.3;
  g.save(); g.translate(cx, cy); g.rotate(-F.roll);
  const off = F.pitch * pp;
  g.fillStyle = '#2f6db0'; g.fillRect(-w * 2, -h * 2 + off, w * 4, h * 2);
  g.fillStyle = '#6b4424'; g.fillRect(-w * 2, off, w * 4, h * 2);
  g.strokeStyle = '#fff'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-w * 2, off); g.lineTo(w * 2, off); g.stroke();
  g.lineWidth = 1.5;
  for (const d of [-20, -10, -5, 5, 10, 20]) {
    const yy = off - d * D2R * pp, ww = Math.abs(d) === 5 ? 0.08 : 0.16;
    g.beginPath(); g.moveTo(-w * ww, yy); g.lineTo(w * ww, yy); g.stroke();
  }
  g.restore();
  // Fixed aircraft symbol.
  g.strokeStyle = '#ffd23a'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(cx - w * 0.22, cy); g.lineTo(cx - w * 0.07, cy); g.lineTo(cx - w * 0.04, cy + 6); g.moveTo(cx + w * 0.22, cy); g.lineTo(cx + w * 0.07, cy); g.lineTo(cx + w * 0.04, cy + 6); g.stroke();
  // Speed and altitude tapes.
  const tape = (tx, val, step, fmt, left) => {
    g.fillStyle = 'rgba(10,12,14,0.62)'; g.fillRect(tx, y + h * 0.1, w * 0.18, h * 0.72);
    g.strokeStyle = '#e6e6e6'; g.lineWidth = 1.5; g.font = `600 ${Math.round(h * 0.07)}px Arial, sans-serif`; g.fillStyle = '#e6e6e6';
    g.textAlign = left ? 'right' : 'left'; g.textBaseline = 'middle';
    const pxPer = h * 0.12 / step;
    const base = Math.floor(val / step) * step;
    for (let k = -4; k <= 5; k++) {
      const v = base + k * step, yy = cy - (v - val) * pxPer;
      if (yy < y + h * 0.1 || yy > y + h * 0.82 || v < 0) continue;
      const ex = left ? tx + w * 0.18 : tx;
      g.beginPath(); g.moveTo(ex, yy); g.lineTo(ex + (left ? -8 : 8), yy); g.stroke();
      g.fillText(fmt(v), left ? ex - 11 : ex + 11, yy);
    }
    g.fillStyle = '#000'; g.fillRect(tx - 2, cy - h * 0.05, w * 0.18 + 4, h * 0.1);
    g.strokeStyle = '#fff'; g.strokeRect(tx - 2, cy - h * 0.05, w * 0.18 + 4, h * 0.1);
    g.fillStyle = '#3df06a'; g.textAlign = 'center'; g.fillText(fmt(Math.round(val)), tx + w * 0.09, cy + 1);
  };
  tape(x + w * 0.03, F.kt, 10, (v) => String(v), true);
  tape(x + w * 0.79, F.altFt, 20, (v) => String(v), false);
  // Heading strip and radar altitude.
  g.fillStyle = 'rgba(10,12,14,0.7)'; g.fillRect(x + w * 0.25, y + h * 0.86, w * 0.5, h * 0.12);
  g.fillStyle = '#e6e6e6'; g.font = `600 ${Math.round(h * 0.07)}px Arial, sans-serif`; g.textAlign = 'center';
  for (let k = -3; k <= 3; k++) {
    const d = Math.round(F.hdg / 10) * 10 + k * 10, xx = cx + (d - F.hdg) * w * 0.012;
    if (xx < x + w * 0.27 || xx > x + w * 0.73) continue;
    g.fillText(String(((d % 360) + 360) % 360 / 10 | 0).padStart(2, '0'), xx, y + h * 0.93);
  }
  g.fillStyle = '#3df06a'; g.font = `700 ${Math.round(h * 0.075)}px Arial, sans-serif`;
  g.fillText(`R ${Math.round(F.radFt)}`, cx, y + h * 0.78);
  g.fillStyle = F.fpm > 0 ? '#3df06a' : '#e6e6e6';
  g.fillText(`${F.fpm >= 0 ? '+' : ''}${Math.round(F.fpm / 10) * 10} fpm`, cx, y + h * 0.06);
  g.restore();
}

function enginePage(g, x, y, w, h, F) {
  g.fillStyle = '#e6e6e6'; g.font = `700 ${Math.round(h * 0.075)}px Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  const bars = [['TQ1', F.trq, 120], ['TQ2', F.trq * 0.99, 120], ['NR', F.nr, 120], ['TGT', F.tot / 10, 100]];
  bars.forEach(([nm, v, max], i) => {
    const bx = x + w * (0.1 + i * 0.22), by = y + h * 0.14, bh = h * 0.62, bw = w * 0.12;
    g.fillStyle = '#16191b'; g.fillRect(bx, by, bw, bh);
    const f = Math.max(0, Math.min(1, v / max));
    g.fillStyle = v / max > 0.9 ? '#ff5040' : v / max > 0.8 ? '#ffd23a' : '#3df06a';
    g.fillRect(bx, by + bh * (1 - f), bw, bh * f);
    g.strokeStyle = '#888'; g.strokeRect(bx, by, bw, bh);
    g.fillStyle = '#e6e6e6'; g.fillText(nm, bx + bw / 2, by + bh + h * 0.07);
    g.fillText(String(Math.round(nm === 'TGT' ? F.tot : v)), bx + bw / 2, by - h * 0.06);
  });
  g.fillStyle = F.hooked ? '#3df06a' : '#888';
  g.fillText(F.hooked ? `HOOK ${(F.loadKg / 1000).toFixed(1)} t` : 'HOOK  —', x + w / 2, y + h * 0.95);
}

// ---------------------------------------------------------------- panels
export class InstrumentPanel {
  // kind: 'micro' (analogue six-pack) or 'chinook' (glass); quality picks size and refresh rate.
  constructor(kind, quality) {
    this.kind = kind;
    const hi = quality.name === 'high';
    // The glass cockpit's displays are small on a wide panel, so it gets more pixels and a lower rate.
    this.W = kind === 'micro' ? (hi ? 1024 : 640) : (hi ? 1536 : 1024);
    this.H = Math.round(this.W * (kind === 'micro' ? 0.35 : 0.31));
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.W; this.canvas.height = this.H;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.period = (hi ? 1 / 24 : quality.name === 'medium' ? 1 / 14 : 1 / 9) * (kind === 'micro' ? 1 : 1.6);
    this.t = 1;
    this.F = null;
  }

  // The rectangle (canvas pixels, 0..1) where the hook-camera display sits, so a mesh can cover it.
  static camRect(kind) {
    return kind === 'micro' ? { x: 0.035, y: 0.12, w: 0.2, h: 0.62 } : { x: 0.452, y: 0.095, w: 0.096, h: 0.30 };
  }

  update(dt, F) {
    this.t += dt;
    if (this.t < this.period || !F) return;
    this.t = 0;
    this.F = F;
    if (this.kind === 'micro') this.drawMicro(F); else this.drawChinook(F);
    this.texture.needsUpdate = true;
  }

  base() {
    const { g, W, H } = this;
    g.fillStyle = '#26282a'; g.fillRect(0, 0, W, H);
    // Subtle crinkle-paint noise and panel screws.
    g.fillStyle = 'rgba(255,255,255,0.025)';
    for (let i = 0; i < 260; i++) g.fillRect((i * 97) % W, (i * 57) % H, 2, 2);
    g.fillStyle = '#4a4c4e';
    for (const [sx, sy] of [[0.01, 0.04], [0.99, 0.04], [0.01, 0.94], [0.99, 0.94], [0.5, 0.04]]) { g.beginPath(); g.arc(sx * W, sy * H, W * 0.004, 0, Math.PI * 2); g.fill(); }
  }

  drawMicro(F) {
    const { g, W, H } = this;
    this.base();
    const R = W * 0.052;
    // Six-pack in front of the pilot (right seat).
    const cx = W * 0.733, dx = W * 0.118, r1 = H * 0.3, r2 = H * 0.72;
    dial(g, cx - dx, r1, R, F.kt, 0, 130, { a0: -2.6, a1: 2.6, major: 13, minor: 2, nums: [[0, '0'], [20, '20'], [40, '40'], [60, '60'], [80, '80'], [100, '100'], [120, '120']], arcs: [[0, 120, '#2ea84a'], [120, 130, '#d33']], name: 'KNOTS', digits: null });
    attitude(g, cx, r1, R, F.pitch, F.roll, F.slip);
    dial(g, cx + dx, r1, R, F.altFt % 1000, 0, 1000, { a0: 0, a1: Math.PI * 2 - 0.0001, major: 10, minor: 5, nums: [[0, '0'], [100, '1'], [200, '2'], [300, '3'], [400, '4'], [500, '5'], [600, '6'], [700, '7'], [800, '8'], [900, '9']], name: 'ALT', digits: String(Math.round(F.altFt)).padStart(4, '0') });
    dial(g, cx - dx, r2, R, F.nr, 0, 120, { major: 6, minor: 2, nums: [[0, '0'], [40, '40'], [80, '80'], [120, '120']], arcs: [[90, 107, '#2ea84a'], [107, 120, '#d33']], name: 'ROTOR %', unit: 'NR' });
    compass(g, cx, r2, R, F.hdg);
    dial(g, cx + dx, r2, R, Math.max(-2000, Math.min(2000, F.fpm)), -2000, 2000, { a0: -Math.PI * 1.45 + Math.PI / 2, a1: Math.PI * 1.45 - Math.PI / 2 + Math.PI, major: 8, minor: 2, nums: [[0, '0'], [1000, '1'], [2000, '2'], [-1000, '1'], [-2000, '2']], name: 'VERT SPEED' });
    // Engine instruments.
    const er = W * 0.036;
    dial(g, W * 0.33, H * 0.27, er, F.trq, 0, 120, { major: 6, minor: 2, nums: [[0, '0'], [60, '60'], [120, '120']], arcs: [[0, 85, '#2ea84a'], [85, 100, '#e0b020'], [100, 120, '#d33']], name: 'TORQUE' });
    dial(g, W * 0.43, H * 0.27, er, F.tot, 0, 1000, { major: 5, minor: 2, nums: [[0, '0'], [400, '4'], [800, '8']], arcs: [[300, 738, '#2ea84a'], [738, 810, '#d33']], name: 'TOT' });
    dial(g, W * 0.33, H * 0.71, er, F.n1, 0, 110, { major: 11, minor: 1, nums: [[0, '0'], [50, '50'], [100, '100']], arcs: [[60, 105, '#2ea84a']], name: 'GAS PROD' });
    dial(g, W * 0.43, H * 0.71, er, 74, 0, 100, { major: 4, minor: 2, nums: [[0, 'E'], [50, '½'], [100, 'F']], name: 'FUEL' });
    // Caution strip and hook-load readout.
    const warn = F.nr < 90;
    g.fillStyle = warn ? '#d8a020' : '#2a2a20'; g.fillRect(W * 0.505, H * 0.08, W * 0.07, H * 0.12);
    label(g, W * 0.54, H * 0.14, 'RPM', H * 0.07, warn ? '#111' : '#5a5848');
    g.fillStyle = F.hooked ? '#2f7d3a' : '#20281f'; g.fillRect(W * 0.505, H * 0.24, W * 0.07, H * 0.12);
    label(g, W * 0.54, H * 0.30, 'HOOK', H * 0.07, F.hooked ? '#e8ffe8' : '#4a5548');
    g.fillStyle = '#050505'; g.fillRect(W * 0.505, H * 0.42, W * 0.07, H * 0.16);
    label(g, W * 0.54, H * 0.5, F.hooked ? `${Math.round(F.loadKg)}` : '---', H * 0.09, '#ffb648');
    label(g, W * 0.54, H * 0.63, 'LOAD KG', H * 0.055, '#a9a69c');
    // Hook-camera display bezel (the live picture is a mesh over this area).
    const c = InstrumentPanel.camRect('micro');
    g.fillStyle = '#0b0c0d'; g.fillRect(W * (c.x - 0.01), H * (c.y - 0.04), W * (c.w + 0.02), H * (c.h + 0.08));
    label(g, W * (c.x + c.w / 2), H * (c.y + c.h + 0.13), 'HOOK CAM', H * 0.065, '#a9a69c');
  }

  drawChinook(F) {
    const { g, W, H } = this;
    this.base();
    // Five multifunction displays at real size (about 26 cm across, full scale), standby
    // instruments, caution lights and switch rows. Left to right: copilot PFD and nav, centre
    // display (the hook camera), pilot nav and PFD.
    const MY = 0.07, MH = 0.42;
    const mfd = (cx, fn) => {
      const w = W * 0.096, h = H * MH, x = W * cx - w / 2, y = H * MY;
      g.fillStyle = '#141618'; g.fillRect(x - 7, y - 7, w + 14, h + 14);
      g.fillStyle = '#05080a'; g.fillRect(x, y, w, h);
      g.fillStyle = '#3a3d40';
      for (let k = 0; k < 4; k++) { g.fillRect(x - 6, y + h * (0.15 + k * 0.22), 4, h * 0.08); g.fillRect(x + w + 2, y + h * (0.15 + k * 0.22), 4, h * 0.08); }
      fn && fn(x, y, w, h);
    };
    mfd(0.20, (x, y, w, h) => pfd(g, x, y, w, h, F));
    mfd(0.31, (x, y, w, h) => compass(g, x + w / 2, y + h / 2, w * 0.44, F.hdg));
    mfd(0.50, null);
    mfd(0.69, (x, y, w, h) => compass(g, x + w / 2, y + h / 2, w * 0.44, F.hdg));
    mfd(0.80, (x, y, w, h) => pfd(g, x, y, w, h, F));
    label(g, W * 0.5, H * (MY + MH + 0.06), 'HOOK CAM', H * 0.045, '#a9a69c');
    // Engine display under the centre MFD.
    { const w = W * 0.11, h = H * 0.3, x = W * 0.5 - w / 2, y = H * 0.6;
      g.fillStyle = '#141618'; g.fillRect(x - 6, y - 6, w + 12, h + 12); g.fillStyle = '#05080a'; g.fillRect(x, y, w, h); enginePage(g, x, y, w, h, F); }
    // Standby attitude and altimeter between the pilots' displays.
    const sr = W * 0.022;
    attitude(g, W * 0.395, H * 0.18, sr, F.pitch, F.roll, F.slip);
    dial(g, W * 0.605, H * 0.18, sr, F.altFt % 1000, 0, 1000, { a0: 0, a1: Math.PI * 2 - 0.0001, major: 10, minor: 2, name: 'ALT' });
    dial(g, W * 0.395, H * 0.4, sr, F.kt, 0, 160, { major: 8, minor: 2, name: 'KTS' });
    dial(g, W * 0.605, H * 0.4, sr, F.nr, 0, 120, { major: 6, minor: 2, arcs: [[95, 105, '#2ea84a']], name: 'NR' });
    // Master caution / warning and caution lights in front of each pilot.
    const warn = F.nr < 90;
    for (const cx of [0.255, 0.745]) {
      g.fillStyle = warn ? '#e0a020' : '#3a3218'; g.fillRect(W * cx - W * 0.018, H * 0.56, W * 0.036, H * 0.07);
      label(g, W * cx, H * 0.595, 'MASTER', H * 0.032, warn ? '#111' : '#6a6040');
      g.fillStyle = F.hooked ? '#2f7d3a' : '#1d2a1d'; g.fillRect(W * cx - W * 0.018, H * 0.65, W * 0.036, H * 0.06);
      label(g, W * cx, H * 0.68, 'HOOK', H * 0.032, F.hooked ? '#e8ffe8' : '#3f4f3f');
    }
    // Switch rows and knobs.
    g.fillStyle = '#c8c8c4';
    for (const [x0, x1] of [[0.12, 0.38], [0.62, 0.88]]) {
      for (let x = x0; x < x1; x += 0.022) { g.fillRect(W * x, H * 0.8, 3, H * 0.06); g.beginPath(); g.arc(W * x + 1.5, H * 0.92, 4, 0, Math.PI * 2); g.fill(); }
    }
  }
}

// A static texture for radio and switch panels (consoles).
export function consoleTexture(kind) {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#232527'; g.fillRect(0, 0, W, H);
  const rows = kind === 'overhead' ? 7 : 6;
  for (let i = 0; i < rows; i++) {
    const y = 12 + i * (H - 24) / rows, h = (H - 24) / rows - 10;
    g.fillStyle = '#17191a'; g.fillRect(10, y, W - 20, h);
    if (kind !== 'overhead' && i % 2 === 0) {
      g.fillStyle = '#050505'; g.fillRect(30, y + h * 0.25, W * 0.5, h * 0.4);
      g.fillStyle = '#56e07a'; g.font = `600 ${Math.round(h * 0.3)}px monospace`; g.textBaseline = 'middle';
      g.fillText(['121.50', '118.30', '7000', '133.85'][i % 4], 38, y + h * 0.45);
    }
    for (let k = 0; k < 5; k++) {
      g.fillStyle = k % 2 ? '#9a9c9e' : '#d8d8d4';
      const kx = (kind === 'overhead' ? 30 : W * 0.7) + k * (kind === 'overhead' ? 44 : 14);
      if (kx > W - 20) break;
      g.beginPath(); g.arc(kx, y + h * 0.65, 6, 0, Math.PI * 2); g.fill();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
