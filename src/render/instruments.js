import * as THREE from 'three';
import { RAPIER, GROUPS } from '../sim/physics.js';
import { CFG } from '../config.js';
import { milkyTea, brewName } from './water.js';
import { GlassLayer, buildAtlas } from './glass.js';

// Live cockpit instruments. Every instrument reads the sim; none is decoration.
//
// Each panel is split by how often its pixels change, so the GPU only re-uploads what moved:
//   - static: bezels, dial faces, tick marks, numerals and placards, painted once into one large
//     mipmapped texture when the panel comes into use (and freed when another aircraft is chosen);
//   - per frame, for free: needles, bugs and the heading card are meshes that rotate, and the attitude
//     ball is a shader, so they move at the full frame rate and stay sharp at any resolution;
//   - glass pages (hover map, load, tank, PFD tapes): small canvases redrawn in turn at 15-30 Hz,
//     one page per frame at most;
//   - digit windows and caution lights: redrawn only when their text changes, or just re-tinted.
//
// Readings are full-size equivalents through Froude scaling (lengths x L, speeds x sqrt L, masses
// x L^3), so a micro heli 30 cm over the table reads like a real one at 30 ft. Only what the flight
// model has is shown: thrust against weight, momentum (speed, drift, a predicted track), attitude,
// heading and height above whatever is underneath. Nothing implies rotor aerodynamics it does not have.

const D2R = Math.PI / 180;
const FT = 3.281;
const DIAL_FONT = '"Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif';
const GLASS_FONT = '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
export const FULL_SCALE = { micro: 32, chinook: 90, skycrane: 94 };
const MAP_RANGE = { micro: 0.12, chinook: 0.26, skycrane: 0.26 };   // model metres from centre to edge
const HOOK_NAMES = ['FWD', 'CTR', 'AFT'];
const C = {
  white: '#e9eef2', grey: '#87929a', dim: '#4b555c', green: '#4fe07f', amber: '#ffb43c', red: '#ff5a4a',
  cyan: '#5fd3ff', magenta: '#ff74d9', sky: '#2f6db0', ground: '#6b4424', bg: '#03080b',
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _col = new THREE.Color();

// ---------------------------------------------------------------- flight data (every frame, no allocation)
// What lies straight under a point: a vessel's liquid, its rim, or (from the sim's own ground probe) the
// table or the floor. Returns the surface name and its height.
function vesselUnder(sim, x, z) {
  const vs = sim.milk && sim.milk.vessels;
  if (!vs) return null;
  for (const v of vs) {
    const d = Math.hypot(x - v.x, z - v.z);
    if (d < v.rIn) return { v, y: v.waterY, what: v.isBowl ? 'MILK' : 'TEA', liquid: true };
    if (d < v.rOut) return { v, y: v.topY ?? v.waterY, what: 'RIM', liquid: false };
  }
  return null;
}

export function readFlight(h, sim, L, gearDrop, F, dt) {
  _f.set(0, 0, -1).applyQuaternion(h.quat);
  _r.set(1, 0, 0).applyQuaternion(h.quat);
  _u.set(0, 1, 0).applyQuaternion(h.quat);
  const sL = Math.sqrt(L);
  F.pitch = Math.asin(clamp(_f.y, -1, 1));
  F.roll = Math.atan2(-_r.y, _u.y);
  F.hdg = ((-h.heading() / D2R + 40) % 360 + 360) % 360;
  // Ground velocity in heading axes (forward, right), and its filtered rate of change: the map's
  // predicted track is where this momentum and this thrust take you.
  const fl = Math.hypot(_f.x, _f.z) || 1;
  F.fx = _f.x / fl; F.fz = _f.z / fl;
  const vF = h.vel.x * F.fx + h.vel.z * F.fz, vR = -h.vel.x * F.fz + h.vel.z * F.fx;
  if (dt > 0 && F.vF !== undefined) {
    const k = 1 - Math.exp(-dt / 0.12);
    F.aF += (clamp((vF - F.vF) / dt, -20, 20) - F.aF) * k;
    F.aR += (clamp((vR - F.vR) / dt, -20, 20) - F.aR) * k;
  } else if (F.aF === undefined) { F.aF = 0; F.aR = 0; }
  F.vF = vF; F.vR = vR;
  F.gs = Math.hypot(vF, vR);
  F.gsKt = F.gs * sL * 1.944;
  F.trk = Math.atan2(vR, vF);                // ground track relative to the nose (+ right)
  F.fpm = h.vel.y * sL * 196.85;
  F.pwr = Math.max(0, h.thrustFrac) * 100;
  const def = h.def;
  F.hoverPwr = def && def.thrustToWeight ? (def.mass + (F.cargoMass || 0) + (h.tankMass || 0)) / (def.mass * def.thrustToWeight) * 100 : 50;
  F.grounded = !!h.grounded;
  // Height of the skids or wheels over whatever is directly below.
  const skidY = h.pos.y - gearDrop;
  const under = vesselUnder(sim, h.pos.x, h.pos.z);
  if (under) { F.radM = skidY - under.y; F.surf = under.what; } else {
    F.radM = h.skidClearance ?? 0;
    F.surf = skidY - F.radM < -0.3 ? 'FLOOR' : 'TABLE';
  }
  F.radFt = Math.max(0, F.radM) * L * FT;
  F.L = L;
  return F;
}

// What hangs on the hooks, what is in reach, and the skycrane's tank and snorkel. Slower (it may cast
// rays), so it runs with the glass pages, not every frame.
function surfaceBelow(sim, x, y, z) {
  const u = vesselUnder(sim, x, z);
  if (u && y > u.y - 0.0005) return { d: y - u.y, what: u.what };
  if (!sim.world) return null;
  const hit = sim.world.castRay(new RAPIER.Ray({ x, y: y - 0.002, z }, { x: 0, y: -1, z: 0 }), 1.5, true, undefined, GROUPS.queryWorld);
  if (!hit) return null;
  const gy = y - 0.002 - hit.timeOfImpact;
  return { d: y - gy, what: gy < -0.3 ? 'FLOOR' : 'TABLE' };
}

function readMission(h, sim, M, F, L, dt) {
  const items = sim.carriedCargo ? sim.carriedCargo() : [];
  M.cargoMass = 0;
  M.loads.length = 0;
  M.hooks = h.hookWorlds ? h.hookWorlds.length : 1;
  const bagHalf = CFG.cargo.bagHalf[1];
  const seen = M.seen; seen.clear();
  for (const b of items) {
    M.cargoMass += b.mass || 0;
    if (!b.pos) continue;
    const bucket = !!(sim.milk && b === sim.milk.bucket);
    const bottom = b.pos.y - (bucket ? 0.016 : bagHalf);
    const under = vesselUnder(sim, b.pos.x, b.pos.z);
    const ld = { hook: b.attach ? b.attach.hook || 0 : 0, bucket, x: b.pos.x, z: b.pos.z, immersion: b.immersion || 0, fill: b.fill || 0,
      potency: b.potency ?? 1, vessel: null, depthFt: 0, aboveFt: null, aboveWhat: '', brew: 0, milk: 0, steepT: 0, bottom, top: b.pos.y + (bucket ? 0.012 : bagHalf) };
    if (under && under.liquid) {
      ld.vessel = under.v;
      ld.brew = under.v.brew || 0; ld.milk = under.v.milk || 0;
      if (bottom < under.y) ld.depthFt = (under.y - bottom) * L * FT;
      else { ld.aboveFt = (bottom - under.y) * L * FT; ld.aboveWhat = under.what; }
    } else {
      const s = surfaceBelow(sim, b.pos.x, bottom, b.pos.z);
      if (s) { ld.aboveFt = Math.max(0, s.d) * L * FT; ld.aboveWhat = s.what; }
    }
    // Steep clock: time in the liquid on this dip; it resets once the bag has been out for a moment.
    if (!bucket) {
      let st = M.steep.get(b.id);
      if (!st) { st = { t: 0, dry: 9 }; M.steep.set(b.id, st); }
      if (ld.immersion > 0.03) { if (st.dry > 1.5) st.t = 0; st.t += dt; st.dry = 0; } else st.dry += dt;
      ld.steepT = st.t;
      seen.add(b.id);
    }
    M.loads.push(ld);
  }
  for (const id of M.steep.keys()) if (!seen.has(id)) M.steep.delete(id);
  M.loads.sort((a, b) => a.hook - b.hook);
  const cand = sim.attachCandidateInfo ? sim.attachCandidateInfo() : null;
  M.cand = cand ? { hook: cand.hook, x: cand.bag.pos.x, z: cand.bag.pos.z } : null;
  F.cargoMass = M.cargoMass;
  // Skycrane tank and snorkel.
  const TK = h.tank;
  if (TK) {
    const hose = h.hose, HC = CFG.skycrane.hose;
    M.tank = M.tank || {};
    const T = M.tank;
    T.level = TK.vol / TK.capacity; T.doors = TK.doors; T.pump = TK.pump || 0; T.pumping = !!TK.pumping;
    T.salvo = !!TK.salvo; T.auto = TK.auto ? TK.auto.phase : null; T.brew = TK.brew || 0; T.milk = TK.milk ?? 1;
    T.flowIn = (TK.flowIn || 0) / TK.capacity * 100; T.flowOut = (TK.flowOut || 0) / TK.capacity * 100;
    T.hoseFrac = (hose.length - HC.minLength) / (HC.maxLength - HC.minLength);
    T.hoseFt = hose.length * L * FT;
    T.submerged = hose.submerged ? (hose.submerged.isBowl ? 'MILK' : 'TEA') : null;
    T.depthFt = (hose.depth || 0) * L * FT;
    T.ix = hose.headWorld.x; T.iz = hose.headWorld.z;
    const s = T.submerged ? null : surfaceBelow(sim, hose.headWorld.x, hose.headWorld.y - 0.003, hose.headWorld.z);
    T.aboveFt = s ? Math.max(0, s.d) * L * FT : null; T.aboveWhat = s ? s.what : '';
  } else M.tank = null;
}

// ---------------------------------------------------------------- canvas helpers
function text(g, s, x, y, size, col, { align = 'center', base = 'middle', weight = 600, font = GLASS_FONT } = {}) {
  g.fillStyle = col; g.font = `${weight} ${size}px ${font}`; g.textAlign = align; g.textBaseline = base;
  g.fillText(s, x, y);
}
function roundRect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const fmtFt = (v) => (v < 10 ? v.toFixed(1) : String(Math.round(v)));
const fmtFpm = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v / 10) * 10)}`;
const cssColor = (c) => `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;

// ---------------------------------------------------------------- dial definitions
// Angles: 0 = 12 o'clock, clockwise positive, radians.
const LOG_ALT = (ft) => Math.log(1 + Math.max(0, ft) / 3) / Math.log(1 + 200 / 3);
const DIALS = {
  gs: { name: 'GND SPEED', unit: 'KNOTS', ang: (v) => (-150 + 300 * clamp(v / 40, -0.015, 1.02)) * D2R,
    ticks: Array.from({ length: 41 }, (_, i) => [i, i % 10 === 0 ? 2 : i % 5 === 0 ? 1 : 0]), nums: [0, 10, 20, 30, 40] },
  ralt: { name: 'RAD ALT', unit: 'FEET', ang: (v) => (-150 + 300 * Math.min(1.02, LOG_ALT(v))) * D2R,
    ticks: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200].map((v) => [v, [0, 5, 10, 20, 50, 100, 200].includes(v) ? 2 : [15, 30, 40].includes(v) ? 1 : 0]),
    nums: [0, 5, 10, 20, 50, 100, 200] },
  vsi: { name: 'VERT SPEED', unit: 'FT/MIN ×1000', ang: (v) => (-90 + Math.sign(v) * 165 * Math.pow(Math.min(Math.abs(v), 1560) / 1500, 0.6)) * D2R,
    ticks: [-1500, -1000, -750, -500, -400, -300, -200, -100, 0, 100, 200, 300, 400, 500, 750, 1000, 1500].map((v) => [v, v % 500 === 0 ? 2 : 0]),
    nums: [[0, '0'], [500, '.5'], [1000, '1'], [1500, '1.5'], [-500, '.5'], [-1000, '1'], [-1500, '1.5']] },
  pwr: { name: 'POWER', unit: '% MAX THRUST', ang: (v) => (-135 + 270 * clamp(v / 100, -0.01, 1.02)) * D2R,
    ticks: Array.from({ length: 21 }, (_, i) => [i * 5, i % 4 === 0 ? 2 : i % 2 === 0 ? 1 : 0]), nums: [0, 20, 40, 60, 80, 100] },
};

function bezel(g, x, y, r) {
  const rim = g.createLinearGradient(x - r, y - r, x + r, y + r);
  rim.addColorStop(0, '#4a4d50'); rim.addColorStop(0.5, '#2a2c2e'); rim.addColorStop(1, '#151617');
  g.fillStyle = rim; g.beginPath(); g.arc(x, y, r * 1.13, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b0c0d'; g.beginPath(); g.arc(x, y, r * 1.03, 0, Math.PI * 2); g.fill();
  const face = g.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.02);
  face.addColorStop(0, '#1d2022'); face.addColorStop(1, '#08090a');
  g.fillStyle = face; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  // Four bezel screws.
  for (const a of [0.785, 2.356, 3.927, 5.498]) {
    const sx = x + Math.cos(a) * r * 1.2, sy = y + Math.sin(a) * r * 1.2;
    g.fillStyle = '#5b5e61'; g.beginPath(); g.arc(sx, sy, r * 0.05, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#1c1d1e'; g.lineWidth = r * 0.015; g.beginPath(); g.moveTo(sx - r * 0.035, sy - r * 0.035); g.lineTo(sx + r * 0.035, sy + r * 0.035); g.stroke();
  }
}
function glint(g, x, y, r) {
  const gl = g.createLinearGradient(x - r, y - r, x + r * 0.3, y + r * 0.2);
  gl.addColorStop(0, 'rgba(255,255,255,0.10)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.015)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
function paintDial(g, x, y, r, type) {
  const D = DIALS[type];
  bezel(g, x, y, r);
  g.strokeStyle = '#ecE8dc'; g.lineCap = 'butt';
  for (const [v, big] of D.ticks) {
    const a = D.ang(v) - Math.PI / 2;
    const r0 = big === 2 ? 0.76 : big === 1 ? 0.8 : 0.84;
    g.lineWidth = r * (big === 2 ? 0.045 : big === 1 ? 0.032 : 0.02);
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * r0, y + Math.sin(a) * r * r0); g.lineTo(x + Math.cos(a) * r * 0.94, y + Math.sin(a) * r * 0.94); g.stroke();
  }
  for (const n of D.nums) {
    const [v, s] = Array.isArray(n) ? n : [n, String(n)];
    const a = D.ang(v) - Math.PI / 2;
    text(g, s, x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6, r * 0.2, '#f1eee6', { font: DIAL_FONT, weight: 700 });
  }
  text(g, D.name, x, y - r * 0.31, r * 0.16, '#c9c5ba', { font: DIAL_FONT, weight: 700 });
  text(g, D.unit, x, y - r * 0.13, r * 0.115, '#9a968c', { font: DIAL_FONT, weight: 600 });
  if (type === 'vsi') {
    text(g, 'UP', x - r * 0.42, y - r * 0.42 + r * 0.02, r * 0.1, '#8f8b82', { font: DIAL_FONT, weight: 700 });
    text(g, 'DN', x - r * 0.42, y + r * 0.42, r * 0.1, '#8f8b82', { font: DIAL_FONT, weight: 700 });
  }
  if (type === 'pwr') text(g, '▲ HOVER', x, y + r * 0.42, r * 0.13, '#d8ad4e', { font: DIAL_FONT, weight: 700 });
  if (type === 'ralt') { g.fillStyle = '#030404'; roundRect(g, x - r * 0.42, y + r * 0.28, r * 0.84, r * 0.4, r * 0.05); g.fill(); }
}
function paintAdiBezel(g, x, y, r) {
  bezel(g, x, y, r);
  // Fixed bank scale on the bezel ring (the pointer on the ball rides against it).
  g.strokeStyle = '#f1eee6';
  for (const d of [-60, -45, -30, -20, -10, 0, 10, 20, 30, 45, 60]) {
    const a = d * D2R - Math.PI / 2;
    const big = d % 30 === 0;
    g.lineWidth = r * (big ? 0.045 : 0.025);
    const r0 = big ? 0.83 : 0.87;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * r0, y + Math.sin(a) * r * r0); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
  }
  g.fillStyle = '#f1eee6';
  g.beginPath(); g.moveTo(x, y - r * 0.83); g.lineTo(x - r * 0.06, y - r * 0.96); g.lineTo(x + r * 0.06, y - r * 0.96); g.closePath(); g.fill();
}
function paintHdgBezel(g, x, y, r) {
  bezel(g, x, y, r);
  // Lubber line and 45-degree marks on the fixed ring.
  g.fillStyle = '#ffb648';
  g.beginPath(); g.moveTo(x, y - r * 0.84); g.lineTo(x - r * 0.07, y - r * 0.98); g.lineTo(x + r * 0.07, y - r * 0.98); g.closePath(); g.fill();
  g.strokeStyle = '#f1eee6'; g.lineWidth = r * 0.03;
  for (const d of [45, 90, 135, 180, 225, 270, 315]) {
    const a = d * D2R - Math.PI / 2;
    g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.87, y + Math.sin(a) * r * 0.87); g.lineTo(x + Math.cos(a) * r * 0.97, y + Math.sin(a) * r * 0.97); g.stroke();
  }
}

// ---------------------------------------------------------------- textures that never change
function cardTexture(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const R = size / 2;
  g.translate(R, R);
  g.fillStyle = '#0c0d0e'; g.beginPath(); g.arc(0, 0, R, 0, Math.PI * 2); g.fill();
  for (let d = 0; d < 360; d += 5) {
    const a = d * D2R - Math.PI / 2, big = d % 30 === 0, mid = d % 10 === 0;
    g.strokeStyle = '#f1eee6'; g.lineWidth = R * (big ? 0.03 : 0.016);
    const r0 = big ? 0.8 : mid ? 0.85 : 0.89;
    g.beginPath(); g.moveTo(Math.cos(a) * R * r0, Math.sin(a) * R * r0); g.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98); g.stroke();
    if (big) {
      g.save(); g.rotate(d * D2R);
      const t = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[d] ?? String(d / 10);
      text(g, t, 0, -R * 0.66, R * (d % 90 === 0 ? 0.2 : 0.16), d % 90 === 0 ? '#ffffff' : '#e3dfd4', { font: DIAL_FONT, weight: 700 });
      g.restore();
    }
  }
  return c;
}
function heliGlyph(g, s, col, lw) {
  // Top view of a small helicopter, nose up, centred at the origin, about s across.
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = lw; g.lineCap = 'round';
  g.beginPath(); g.ellipse(0, -s * 0.08, s * 0.12, s * 0.2, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(0, s * 0.05); g.lineTo(0, s * 0.5); g.stroke();
  g.beginPath(); g.moveTo(-s * 0.1, s * 0.46); g.lineTo(s * 0.1, s * 0.46); g.stroke();
  g.beginPath(); g.moveTo(-s * 0.5, -s * 0.08); g.lineTo(s * 0.5, -s * 0.08); g.moveTo(0, -s * 0.5); g.lineTo(0, s * 0.34); g.stroke();
  g.lineCap = 'butt';
}
function symbolTexture(size) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.translate(size / 2, size / 2);
  heliGlyph(g, size * 0.9, '#ffb648', size * 0.05);
  return c;
}
const LIGHTS = {
  hook: ['HOOK', '#41c86a'], reach: ['IN REACH', '#f0a830'], steep: ['STEEP', '#45c3ef'], wow: ['ON GND', '#d8dde0'],
  pump: ['PUMP', '#41c86a'], doors: ['DOORS', '#f0a830'], intake: ['INTAKE IN', '#45c3ef'], auto: ['AUTO', '#d8dde0'],
  hook0: ['FWD HOOK', '#41c86a'], hook1: ['CTR HOOK', '#41c86a'], hook2: ['AFT HOOK', '#41c86a'],
};
const LIGHT_KEYS = Object.keys(LIGHTS);
function lightAtlas() {
  const w = 256, h = 96;
  const c = document.createElement('canvas'); c.width = w; c.height = h * LIGHT_KEYS.length;
  const g = c.getContext('2d');
  LIGHT_KEYS.forEach((k, i) => {
    const [label, col] = LIGHTS[k];
    const y = i * h;
    const grd = g.createLinearGradient(0, y, 0, y + h);
    grd.addColorStop(0, col); grd.addColorStop(1, new THREE.Color(col).multiplyScalar(0.72).getStyle());
    g.fillStyle = grd; g.fillRect(0, y, w, h);
    const words = label.split(' ');
    if (words.length > 1 && label.length > 7) {
      text(g, words[0], w / 2, y + h * 0.33, h * 0.32, '#0b0c0b', { weight: 800 });
      text(g, words.slice(1).join(' '), w / 2, y + h * 0.7, h * 0.32, '#0b0c0b', { weight: 800 });
    } else text(g, label, w / 2, y + h * 0.53, h * 0.4, '#0b0c0b', { weight: 800 });
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------- attitude ball (shader)
const ADI_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const ADI_FRAG = `
uniform float uPitch, uRoll, uScale, uAspect, uRect, uLight;
varying vec2 vUv;
float band(float d, float hw) { float w = max(fwidth(d), 1e-5); return 1.0 - smoothstep(hw - w, hw + w, abs(d)); }
float inside(float d) { float w = max(fwidth(d), 1e-5); return 1.0 - smoothstep(-w, w, d); }
vec3 lin(vec3 c) { return pow(c, vec3(2.2)); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0; p.x *= uAspect;            // units of the half-height
  float c = cos(uRoll), s = sin(uRoll);
  vec2 q = vec2(c * p.x + s * p.y, -s * p.x + c * p.y);   // the world frame: rolled with the aircraft
  float y = q.y + uPitch * uScale;                         // > 0 is sky
  vec3 sky = mix(vec3(0.19, 0.45, 0.76), vec3(0.36, 0.62, 0.88), clamp(y * 0.7, 0.0, 1.0));
  vec3 gnd = mix(vec3(0.47, 0.30, 0.15), vec3(0.32, 0.20, 0.10), clamp(-y * 0.7, 0.0, 1.0));
  vec3 col = mix(gnd, sky, inside(-y));
  col = mix(col, vec3(1.0), band(y, 0.011));
  // Pitch ladder every 5 degrees, wider at the tens.
  for (int k = -8; k <= 8; k++) {
    if (k == 0) continue;
    float deg = float(k) * 5.0;
    float yy = y - deg * 0.0174533 * uScale;
    float tens = 1.0 - step(0.5, abs(mod(deg, 10.0)));
    float hw = mix(0.12, 0.26, tens) * (uRect > 0.5 ? 0.8 : 1.0);
    float m = band(yy, 0.0075) * inside(abs(q.x) - hw);
    col = mix(col, vec3(0.97), m);
  }
  if (uRect < 0.5) {
    // Bank pointer on the ball, against the fixed scale on the bezel.
    vec2 t = q - vec2(0.0, 0.86);
    float tri = max(abs(t.x) * 1.7 + t.y, -t.y - 0.12);
    col = mix(col, vec3(1.0, 0.71, 0.28), inside(tri - 0.0));
  } else {
    // PFD: a bank arc at the top with the pointer riding on it.
    vec2 t = q - vec2(0.0, 0.70);
    float tri = max(abs(t.x) * 1.7 + t.y, -t.y - 0.08);
    col = mix(col, vec3(1.0), inside(tri));
  }
  // Fixed aircraft symbol: black outline, then amber.
  float wing = max(abs(p.y) - 0.025, max(abs(p.x) - 0.56, 0.17 - abs(p.x)));
  float drop = max(abs(abs(p.x) - 0.185) - 0.022, max(p.y, -p.y - 0.09));
  float dotC = length(p) - 0.04;
  float sym = min(min(wing, drop), dotC);
  col = mix(col, vec3(0.02), inside(sym - 0.018));
  col = mix(col, vec3(1.0, 0.71, 0.28), inside(sym));
  gl_FragColor = vec4(lin(col) * uLight, 1.0);
  #include <colorspace_fragment>
}`;
function adiMaterial(rect, aspect) {
  return new THREE.ShaderMaterial({
    uniforms: { uPitch: { value: 0 }, uRoll: { value: 0 }, uScale: { value: rect ? 1.6 : 1.9 }, uAspect: { value: aspect }, uRect: { value: rect ? 1 : 0 }, uLight: { value: 0.92 } },
    vertexShader: ADI_VERT, fragmentShader: ADI_FRAG, toneMapped: false,
  });
}

// ---------------------------------------------------------------- panel layouts (units of panel height)
// Each panel is a strip `aspect` panel-heights wide. x, y from the top left. Pilots sit on the right.
const ANALOGUE = (aspect, cols, page, cam, lights) => ({
  aspect, cam: { x: 0.07, y: 0.14, s: 0.56, label: cam },
  glass: [{ id: 'mfd', page, x: 0.70, y: 0.05, w: 0.62, h: 0.9 }],
  lights: lights.map((k, i) => ({ k, x: 1.375, y: 0.1 + i * 0.205, w: 0.17, h: 0.15 })),
  dials: [['gs', cols[0], 0.27], ['adi', cols[1], 0.27], ['ralt', cols[2], 0.27], ['pwr', cols[0], 0.73], ['hdg', cols[1], 0.73], ['vsi', cols[2], 0.73]]
    .map(([type, x, y]) => ({ type, x, y, r: 0.165 })),
});
const LAYOUTS = {
  micro: ANALOGUE(30 / 10.5, [1.725, 2.095, 2.465], 'hoverLoad', 'HOOK CAM', ['hook', 'reach', 'steep', 'wow']),
  skycrane: ANALOGUE(18.5 / 6.6, [1.745, 2.115, 2.485], 'hoverTank', 'BELLY CAM', ['pump', 'doors', 'intake', 'auto']),
  // Glass cockpit: copilot PFD and hover page, standby instruments, the centre display (hook camera over
  // the cargo-hook page), standby, pilot hover page and PFD, then the caution lights at each end.
  chinook: {
    aspect: 31 / 5.6,
    cam: { x: 2.538, y: 0.07, s: 0.46, label: null },
    glass: [
      { id: 'pfd', page: 'pfd', x: 4.0, y: 0.06, w: 0.56, h: 0.88 },
      { id: 'hover', page: 'hover', x: 3.37, y: 0.06, w: 0.56, h: 0.88 },
      { id: 'pfd', page: 'pfd', x: 0.976, y: 0.06, w: 0.56, h: 0.88 },
      { id: 'hover', page: 'hover', x: 1.606, y: 0.06, w: 0.56, h: 0.88 },
      { id: 'load', page: 'load', x: 2.438, y: 0.58, w: 0.66, h: 0.36 },
    ],
    lights: [4.66, 0.396].flatMap((x0) => [['hook0', 0, 0], ['hook1', 0, 1], ['hook2', 0, 2], ['reach', 1, 0], ['steep', 1, 1], ['wow', 1, 2]]
      .map(([k, c, r]) => ({ k, x: x0 + 0.03 + c * 0.24, y: 0.2 + r * 0.24, w: 0.2, h: 0.15 }))),
    dials: [{ type: 'adi', x: 2.31, y: 0.27, r: 0.075 }, { type: 'vsi', x: 2.31, y: 0.71, r: 0.075 }, { type: 'ralt', x: 3.226, y: 0.27, r: 0.075 }, { type: 'pwr', x: 3.226, y: 0.71, r: 0.075 }],
  },
};

let _atlas = null;     // the glass pages' SDF font, built once
const STATIC_PX = { high: 4096, medium: 3072, low: 2048 };
const _placeholder = new THREE.DataTexture(new Uint8Array([38, 40, 42, 255]), 1, 1);
_placeholder.colorSpace = THREE.SRGBColorSpace; _placeholder.needsUpdate = true;

// A mipmapped texture with a small negative LOD bias: a panel seen at an angle keeps its fine print.
function sharpen(mat, bias = -0.6) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader
      .replace('texture2D( map, vMapUv )', `texture2D( map, vMapUv, ${bias.toFixed(2)} )`)
      .replace('texture2D( emissiveMap, vEmissiveMapUv )', `texture2D( emissiveMap, vEmissiveMapUv, ${bias.toFixed(2)} )`);
  };
  mat.customProgramCacheKey = () => `sharp${bias}`;
  return mat;
}

export class InstrumentPanel {
  // kind: 'micro', 'chinook' or 'skycrane'; camTexture: the belly/hook camera picture.
  constructor(kind, quality, camTexture, maxAniso = 8) {
    this.kind = kind;
    this.quality = quality;
    this.L = FULL_SCALE[kind];
    this.layout = LAYOUTS[kind];
    this.aniso = maxAniso;
    this.camTexture = camTexture;
    this.F = {};
    this.M = { loads: [], steep: new Map(), seen: new Set(), cand: null, tank: null, cargoMass: 0 };
    this.missionDt = 0;
    this.glassAge = 9;
    // Glass redraws a second: the hover map and PFD tapes follow the aircraft closely enough at this rate.
    this.glassPeriod = 1 / ((quality.name === 'high' || quality.name === 'ultra') ? 40 : quality.name === 'medium' ? 20 : 12);
    this.active = false;
    this.ms = 0;   // CPU time of the last update, for the frame-cost check
  }

  // Build the meshes for a face w x h (model metres). Returns the group; the face sits at z = 0.
  build(w, h, bodyMat) {
    const LY = this.layout, A = LY.aspect;
    this.w = w; this.h = h;
    const P = (x, y, z = 0) => new THREE.Vector3(x * h - w / 2, h / 2 - y * h, z * h);
    const group = this.group = new THREE.Group();
    // Static face (texture painted when the panel is activated).
    this.faceMat = sharpen(new THREE.MeshStandardMaterial({ map: _placeholder, emissiveMap: _placeholder, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.55, metalness: 0.05 }));
    const face = this.face = new THREE.Mesh(new THREE.PlaneGeometry(w, h), this.faceMat);
    face.userData.keep = true; face.receiveShadow = true;
    group.add(face);
    const depth = Math.min(0.009, h * 0.3);
    const back = new THREE.Mesh(new THREE.BoxGeometry(w * 1.03, h * 1.1, depth), bodyMat);
    back.position.z = -depth / 2 - 0.00002;
    group.add(back);
    // Camera display.
    const cam = LY.cam;
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(cam.s * h, cam.s * h), new THREE.MeshBasicMaterial({ map: this.camTexture, toneMapped: false }));
    scr.position.copy(P(cam.x + cam.s / 2, cam.y + cam.s / 2, 0.002));
    scr.userData.keep = true;
    group.add(scr);
    // Glass: every page (and every digit window) is drawn into one vector layer over the face, in
    // panel-height units, so the whole panel's moving text and graphics are one draw call and no
    // texture upload.
    if (!_atlas) _atlas = buildAtlas(GLASS_FONT, 700);
    this.layer = new GlassLayer(_atlas, w, h);
    this.layer.mesh.position.z = 0.0026 * h;
    this.layer.mesh.userData.keep = true;
    group.add(this.layer.mesh);
    for (const gl of LY.glass) {
      if (gl.page === 'pfd') {
        if (!this.pfdMat) this.pfdMat = adiMaterial(true, gl.w / gl.h);
        const ball = new THREE.Mesh(new THREE.PlaneGeometry(gl.w * h, gl.h * h * 0.66), this.pfdMat);
        ball.position.copy(P(gl.x + gl.w / 2, gl.y + gl.h * 0.43, 0.0022));
        ball.userData.keep = true;
        this.pfdMat.uniforms.uAspect.value = gl.w / (gl.h * 0.66);
        group.add(ball);
      }
    }
    // Caution lights: one atlas, a material per light so each can be lit or dark without a re-upload.
    const atlas = lightAtlas();
    this.lights = [];
    const n = LIGHT_KEYS.length;
    const lightMats = new Map();
    for (const L of LY.lights) {
      const i = LIGHT_KEYS.indexOf(L.k);
      const geo = new THREE.PlaneGeometry(L.w * h, L.h * h);
      const uv = geo.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setY(k, 1 - (i + 1 - uv.getY(k)) / n);
      let mat = lightMats.get(L.k);
      if (!mat) { mat = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false }); lightMats.set(L.k, mat); this.lights.push({ k: L.k, mat, on: null }); }
      const m = new THREE.Mesh(geo, mat);
      m.position.copy(P(L.x + L.w / 2, L.y + L.h / 2, 0.002));
      m.userData.keep = true;
      group.add(m);
    }
    // Dials: needles, bugs, the attitude ball and the heading card.
    const needleMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, emissive: 0xf4f0e6, emissiveIntensity: 0.3, roughness: 0.5 });
    const hubMat = new THREE.MeshStandardMaterial({ color: 0x151617, roughness: 0.4, metalness: 0.5 });
    const bugMat = new THREE.MeshBasicMaterial({ color: 0xffb648, toneMapped: false });
    const trackMat = new THREE.MeshBasicMaterial({ color: 0xff74d9, toneMapped: false });
    this.dials = [];
    // Raised bezels and cover glasses give each dial depth; the glass catches the cockpit's reflections.
    const bezelMat = new THREE.MeshPhysicalMaterial({ color: 0x1b1c1e, roughness: 0.35, metalness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const coverMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.07, envMapIntensity: 1.4, depthWrite: false });
    for (const d of LY.dials) {
      const r = d.r * h, c = P(d.x, d.y);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.075, r * 0.07, 10, 56).scale(1, 1, 0.6), bezelMat);
      rim.position.copy(c).setZ(0.004 * h);
      group.add(rim);
      const cover = new THREE.Mesh(new THREE.CircleGeometry(r * 1.03, 48), coverMat);
      cover.position.copy(c).setZ(0.0062 * h);
      cover.renderOrder = 3; cover.userData.keep = true;
      group.add(cover);
      const D = { type: d.type, val: null, parts: {} };
      if (d.type === 'adi') {
        const mat = adiMaterial(false, 1);
        const ball = new THREE.Mesh(new THREE.CircleGeometry(r * 0.8, 64), mat);
        ball.position.copy(c).setZ(0.0015 * h);
        group.add(ball);
        D.mat = mat;
      } else if (d.type === 'hdg') {
        const card = new THREE.Mesh(new THREE.CircleGeometry(r * 0.82, 64), sharpen(new THREE.MeshStandardMaterial({ map: null, emissive: 0xffffff, emissiveIntensity: 0.2, roughness: 0.5 })));
        card.position.copy(c).setZ(0.0015 * h);
        group.add(card);
        const sym = new THREE.Mesh(new THREE.PlaneGeometry(r * 0.62, r * 0.62), new THREE.MeshBasicMaterial({ map: null, transparent: true, toneMapped: false, depthWrite: false }));
        sym.position.copy(c).setZ(0.004 * h);
        group.add(sym);
        const trk = new THREE.Mesh(this.bugGeo(r, 0.8, 0.95, 0.09), trackMat);
        trk.position.copy(c).setZ(0.0035 * h);
        group.add(trk);
        D.parts = { card, sym, trk };
      } else {
        const nd = new THREE.Mesh(this.needleGeo(r, d.type === 'vsi' ? 0.9 : 0.86), needleMat);
        nd.position.copy(c).setZ(0.003 * h);
        group.add(nd);
        const hub = new THREE.Mesh(new THREE.CircleGeometry(r * 0.085, 24), hubMat);
        hub.position.copy(c).setZ(0.0045 * h);
        group.add(hub);
        D.parts.needle = nd;
        D.ang = DIALS[d.type].ang;
        if (d.type === 'pwr') {
          const bug = new THREE.Mesh(this.bugGeo(r, 0.86, 1.0, 0.1), bugMat);
          bug.position.copy(c).setZ(0.0025 * h);
          group.add(bug);
          D.parts.bug = bug;
        }
        if (d.type === 'ralt') D.digits = { x: d.x, y: d.y, r: d.r };   // height and surface, in the glass layer
      }
      for (const o of Object.values(D.parts)) o.userData.keep = true;
      this.dials.push(D);
    }
    return group;
  }

  // Only the face takes the cockpit's shadows (the glare shield and frames across it); the small parts
  // on it neither cast nor receive, which keeps them out of the shadow pass.
  fixShadows() {
    this.group.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = o === this.face; } });
  }

  needleGeo(r, len) {
    const s = new THREE.Shape();
    s.moveTo(-0.05 * r, -0.24 * r);
    s.lineTo(0.05 * r, -0.24 * r);
    s.lineTo(0.042 * r, 0);
    s.lineTo(0.016 * r, len * r * 0.86);
    s.lineTo(0, len * r);
    s.lineTo(-0.016 * r, len * r * 0.86);
    s.lineTo(-0.042 * r, 0);
    s.closePath();
    return new THREE.ShapeGeometry(s);
  }

  // A triangular bug on the dial rim, pointing at the centre.
  bugGeo(r, r0, r1, hw) {
    const s = new THREE.Shape();
    s.moveTo(0, r0 * r); s.lineTo(hw * r, r1 * r); s.lineTo(-hw * r, r1 * r); s.closePath();
    return new THREE.ShapeGeometry(s);
  }

  // Paint the static face and the cards (on first use of this aircraft).
  activate() {
    if (this.active) return;
    this.active = true;
    const LY = this.layout, A = LY.aspect;
    const W = STATIC_PX[this.quality.name] || 3072, Hpx = Math.round(W / A);
    const c = document.createElement('canvas'); c.width = W; c.height = Hpx;
    const g = c.getContext('2d');
    g.setTransform(Hpx, 0, 0, Hpx, 0, 0);    // drawing units: panel heights
    this.paintFace(g, A);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = this.aniso;
    this.staticTex = t;
    this.faceMat.map = t; this.faceMat.emissiveMap = t;
    const cardPx = (this.quality.name === 'high' || this.quality.name === 'ultra') ? 1024 : 512;
    for (const D of this.dials) {
      if (D.type !== 'hdg') continue;
      const ct = new THREE.CanvasTexture(cardTexture(cardPx)); ct.colorSpace = THREE.SRGBColorSpace; ct.anisotropy = this.aniso;
      D.parts.card.material.map = ct; D.parts.card.material.emissiveMap = ct; D.parts.card.material.needsUpdate = true;
      const st = new THREE.CanvasTexture(symbolTexture(256)); st.colorSpace = THREE.SRGBColorSpace;
      D.parts.sym.material.map = st; D.parts.sym.material.needsUpdate = true;
      D.cardTex = ct; D.symTex = st;
    }
    this.glassAge = 9;
  }

  release() {
    if (!this.active) return;
    this.active = false;
    this.staticTex.dispose();
    this.faceMat.map = _placeholder; this.faceMat.emissiveMap = _placeholder;
    for (const D of this.dials) if (D.cardTex) { D.cardTex.dispose(); D.symTex.dispose(); }
  }

  paintFace(g, A) {
    const LY = this.layout;
    // Crinkle-finish panel paint, a darker border and screws.
    g.fillStyle = '#25272a'; g.fillRect(0, 0, A, 1);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 9000; i++) {
      const v = rnd() > 0.5 ? 255 : 0;
      g.fillStyle = `rgba(${v},${v},${v},0.035)`;
      g.fillRect(rnd() * A, rnd(), 0.0016, 0.0016);
    }
    g.strokeStyle = '#17181a'; g.lineWidth = 0.012; g.strokeRect(0.006, 0.006, A - 0.012, 0.988);
    for (const [sx, sy] of [[0.025, 0.035], [A - 0.025, 0.035], [0.025, 0.965], [A - 0.025, 0.965], [A / 2, 0.035], [A / 2, 0.965]]) {
      g.fillStyle = '#4c4f52'; g.beginPath(); g.arc(sx, sy, 0.011, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#1c1d1e'; g.lineWidth = 0.003; g.beginPath(); g.moveTo(sx - 0.007, sy); g.lineTo(sx + 0.007, sy); g.stroke();
    }
    // Camera display bezel.
    const cam = LY.cam;
    this.displayBezel(g, cam.x, cam.y, cam.s, cam.s);
    if (cam.label) text(g, cam.label, cam.x + cam.s / 2, cam.y + cam.s + 0.06, 0.04, '#b9b5aa', { font: DIAL_FONT, weight: 700 });
    // Glass display bezels with their soft keys.
    for (const gl of LY.glass) this.displayBezel(g, gl.x, gl.y, gl.w, gl.h, true);
    // Light housings.
    for (const L of LY.lights) { g.fillStyle = '#0a0b0b'; roundRect(g, L.x - 0.008, L.y - 0.008, L.w + 0.016, L.h + 0.016, 0.01); g.fill(); }
    // Dials.
    for (const d of LY.dials) {
      if (d.type === 'adi') paintAdiBezel(g, d.x, d.y, d.r);
      else if (d.type === 'hdg') paintHdgBezel(g, d.x, d.y, d.r);
      else paintDial(g, d.x, d.y, d.r, d.type);
    }
    for (const d of LY.dials) if (d.type !== 'adi' && d.type !== 'hdg') glint(g, d.x, d.y, d.r);
    // Placards.
    if (this.kind === 'chinook') {
      text(g, 'HOOK CAM', 2.768, 0.555, 0.035, '#b9b5aa', { font: DIAL_FONT, weight: 700 });
      for (const x of [0.396, 4.66]) text(g, 'CARGO  ·  CAUTION', x + 0.24, 0.08, 0.04, '#9b978d', { font: DIAL_FONT, weight: 700 });
    }
  }

  displayBezel(g, x, y, w, h, keys = false) {
    g.fillStyle = '#121416'; roundRect(g, x - 0.028, y - 0.028, w + 0.056, h + 0.056, 0.02); g.fill();
    g.strokeStyle = '#2f3235'; g.lineWidth = 0.004; roundRect(g, x - 0.028, y - 0.028, w + 0.056, h + 0.056, 0.02); g.stroke();
    g.fillStyle = '#020303'; g.fillRect(x - 0.004, y - 0.004, w + 0.008, h + 0.008);
    if (keys) {
      g.fillStyle = '#34373a';
      const n = 4;
      for (let k = 0; k < n; k++) {
        const ky = y + h * (0.16 + k * 0.22);
        g.fillRect(x - 0.022, ky, 0.012, h * 0.08);
        g.fillRect(x + w + 0.01, ky, 0.012, h * 0.08);
      }
    }
  }

  // ---------------------------------------------------------------- per frame
  // h: the aircraft (live, or the replay's puppet); sim: the sim (or the replay's stand-in).
  update(dt, h, sim, gearDrop) {
    const t0 = performance.now();
    if (!this.active) this.activate();
    const F = readFlight(h, sim, this.L, gearDrop, this.F, dt);
    // Needles move with the frame. A little lag keeps them from buzzing with the rotor.
    const k = 1 - Math.exp(-Math.max(dt, 0) / 0.08);
    for (const D of this.dials) {
      if (D.type === 'adi') { D.mat.uniforms.uPitch.value = F.pitch; D.mat.uniforms.uRoll.value = F.roll; continue; }
      if (D.type === 'hdg') {
        D.parts.card.rotation.z = F.hdg * D2R;
        D.parts.trk.visible = F.gsKt > 0.4;
        D.parts.trk.rotation.z = -F.trk;
        continue;
      }
      const v = D.type === 'gs' ? F.gsKt : D.type === 'ralt' ? F.radFt : D.type === 'vsi' ? F.fpm : F.pwr;
      D.val = D.val === null || dt <= 0 ? v : D.val + (v - D.val) * k;
      D.parts.needle.rotation.z = -D.ang(D.val);
      if (D.parts.bug) D.parts.bug.rotation.z = -D.ang(clamp(F.hoverPwr, 0, 102));
    }
    if (this.pfdMat) { this.pfdMat.uniforms.uPitch.value = F.pitch; this.pfdMat.uniforms.uRoll.value = F.roll; }
    // Mission data and the glass layer, at the glass rate.
    this.missionDt += dt;
    this.glassAge += dt;
    if (this.glassAge >= this.glassPeriod) {
      this.glassAge = 0;
      readMission(h, sim, this.M, F, this.L, this.missionDt);
      this.missionDt = 0;
      this.updateLights(F, this.M, h);
      this.drawGlass(F, this.M, h, sim);
    }
    this.ms = performance.now() - t0;
  }

  updateLights(F, M, h) {
    const T = M.tank;
    const state = {
      hook: M.loads.length > 0, reach: !!M.cand, steep: M.loads.some((l) => !l.bucket && l.immersion > 0.03), wow: F.grounded,
      pump: !!(T && T.pumping), doors: !!(T && T.doors > 0.02), intake: !!(T && T.submerged), auto: !!(T && (T.auto || T.salvo)),
      hook0: M.loads.some((l) => l.hook === 0), hook1: M.loads.some((l) => l.hook === 1), hook2: M.loads.some((l) => l.hook === 2),
    };
    for (const L of this.lights) {
      const on = !!state[L.k];
      if (on === L.on) continue;
      L.on = on;
      L.mat.color.setScalar(on ? 1.0 : 0.045);
    }
  }

  // ---------------------------------------------------------------- glass pages
  drawGlass(F, M, h, sim) {
    const g = this.layer;
    g.begin();
    for (const gl of this.layout.glass) {
      // Page design units: 1000 tall.
      const W = 1000 * gl.w / gl.h, H = 1000;
      g.setTransform(gl.h / H, 0, 0, gl.h / H, gl.x, gl.y);
      g.save();
      g.beginPath(); g.rect(0, 0, W, H); g.clip();
      this.drawPage(g, gl.page, W, H, F, M, h, sim);
      g.restore();
    }
    // Digit windows on the dials.
    g.setTransform(1, 0, 0, 1, 0, 0);
    for (const D of this.dials) {
      if (!D.digits) continue;
      const { x, y, r } = D.digits;
      text(g, fmtFt(F.radFt), x, y + r * 0.4, r * 0.24, '#ffb648', { weight: 700 });
      text(g, F.surf, x, y + r * 0.6, r * 0.13, F.surf === 'TEA' || F.surf === 'MILK' ? C.cyan : F.surf === 'RIM' ? C.amber : '#9aa4aa', { weight: 700 });
    }
    g.end();
  }

  drawPage(g, page, W, H, F, M, h, sim) {
    if (page === 'pfd') { this.pagePfd(g, W, H, F); return; }
    g.fillStyle = '#04090d'; g.fillRect(0, 0, W, H);
    if (page === 'hoverLoad' || page === 'hoverTank') {
      this.pageTitle(g, W, page === 'hoverTank' ? 'HOVER · TANK' : 'HOVER · HOOK', F);
      this.hoverMap(g, 10, 60, W - 20, 500, F, M, h, sim);
      this.flightRow(g, 0, 566, W, F);
      const y0 = 690;
      if (page === 'hoverTank') this.tankBlock(g, 12, y0, W - 24, H - y0 - 10, M.tank);
      else this.loadBlock(g, 12, y0, W - 24, H - y0 - 10, M.loads[0], M);
    } else if (page === 'hover') {
      this.pageTitle(g, W, 'HOVER', F);
      this.hoverMap(g, 10, 60, W - 20, 560, F, M, h, sim);
      this.flightRow(g, 0, 626, W, F);
      // Hook summary.
      const y = 770, bw = (W - 40) / 3;
      for (let i = 0; i < 3; i++) {
        const ld = M.loads.find((l) => l.hook === i);
        const x = 14 + i * (bw + 6);
        g.strokeStyle = ld ? C.green : M.cand && M.cand.hook === i ? C.amber : C.dim; g.lineWidth = 3;
        roundRect(g, x, y, bw, H - y - 14, 10); g.stroke();
        text(g, HOOK_NAMES[i], x + bw / 2, y + 30, 28, C.grey, { weight: 700 });
        text(g, ld ? (ld.depthFt > 0 ? `IN ${ld.vessel && ld.vessel.isBowl ? 'MILK' : 'TEA'}` : ld.bucket ? 'BUCKET' : 'BAG') : M.cand && M.cand.hook === i ? 'IN REACH' : 'EMPTY',
          x + bw / 2, y + 72, 30, ld ? (ld.depthFt > 0 ? C.cyan : C.green) : M.cand && M.cand.hook === i ? C.amber : C.dim, { weight: 700 });
      }
    } else if (page === 'load') {
      text(g, 'CARGO HOOKS', 28, 52, 52, C.white, { align: 'left', weight: 700 });
      text(g, M.loads.length ? `LOAD ${Math.round(M.cargoMass * this.L ** 3).toLocaleString('en-GB')} KG` : 'NO LOAD', W - 28, 52, 46, M.loads.length ? C.green : C.grey, { align: 'right', weight: 700 });
      const bw = (W - 56) / 3;
      for (let i = 0; i < 3; i++) {
        const x = 16 + i * (bw + 12);
        const ld = M.loads.find((l) => l.hook === i);
        this.loadColumn(g, x, 100, bw, H - 112, ld, M.cand && M.cand.hook === i, HOOK_NAMES[i]);
      }
    }
  }

  pageTitle(g, W, title, F) {
    text(g, title, 20, 32, 34, C.white, { align: 'left', weight: 700 });
    const rng = MAP_RANGE[this.kind] * this.L * FT;
    text(g, `RING ${Math.round(rng / 2)} FT`, W - 20, 32, 28, C.grey, { align: 'right', weight: 600 });
  }

  // Top-down, heading-up map around the aircraft: cups and the milk bowl, bags, what is on the hooks,
  // the snorkel's intake, and the track predicted from momentum and the current acceleration.
  hoverMap(g, x, y, w, hgt, F, M, h, sim) {
    const R = MAP_RANGE[this.kind], cx = x + w / 2, cy = y + hgt / 2, half = Math.min(w, hgt) / 2, sc = half / R;
    const ox = h.pos.x, oz = h.pos.z, fx = F.fx, fz = F.fz;
    const map = (px, pz) => { const dx = px - ox, dz = pz - oz; return [cx + (-dx * fz + dz * fx) * sc, cy - (dx * fx + dz * fz) * sc]; };
    g.save();
    g.beginPath(); g.rect(x, y, w, hgt); g.clip();
    g.fillStyle = '#04090c'; g.fillRect(x, y, w, hgt);
    // Range rings and a north mark.
    g.strokeStyle = 'rgba(135,146,154,0.45)'; g.lineWidth = 2; g.setLineDash([8, 10]);
    for (const k of [0.5, 1]) { g.beginPath(); g.arc(cx, cy, half * k * 0.98, 0, Math.PI * 2); g.stroke(); }
    g.setLineDash([]);
    const na = -F.hdg * D2R;
    g.save(); g.translate(cx, cy); g.rotate(na);
    g.fillStyle = C.grey;
    g.beginPath(); g.moveTo(0, -half + 6); g.lineTo(-12, -half + 30); g.lineTo(12, -half + 30); g.closePath(); g.fill();
    text(g, 'N', 0, -half + 50, 26, C.grey, { weight: 700 });
    g.restore();
    // Vessels: rim and the colour of what is in them.
    const vs = (sim.milk && sim.milk.vessels) || [];
    const under = vesselUnder(sim, ox, oz);
    let far = [];
    for (const v of vs) {
      const [mx, my] = map(v.x, v.z);
      const dpx = Math.hypot(mx - cx, my - cy);
      if (dpx - v.rOut * sc > half) { far.push([dpx / sc, mx, my, v]); continue; }
      milkyTea(v.brew || 0, v.milk || 0, _col);
      g.fillStyle = cssColor(_col); g.globalAlpha = 0.9;
      g.beginPath(); g.arc(mx, my, v.rIn * sc, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 1;
      const over = under && under.v === v;
      g.strokeStyle = over ? C.green : '#d7dde0'; g.lineWidth = over ? 6 : 3.5;
      g.beginPath(); g.arc(mx, my, v.rOut * sc, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = 'rgba(215,221,224,0.5)'; g.lineWidth = 2;
      g.beginPath(); g.arc(mx, my, v.rIn * sc, 0, Math.PI * 2); g.stroke();
    }
    // The two nearest vessels out of range: a pointer on the edge with the distance to their rims.
    far.sort((a, b) => a[0] - b[0]);
    for (const [d, mx, my, v] of far.slice(0, 2)) {
      const a = Math.atan2(my - cy, mx - cx), er = half * 0.86;
      const px = cx + Math.cos(a) * er, py = cy + Math.sin(a) * er;
      g.save(); g.translate(px, py); g.rotate(a);
      g.fillStyle = v.isBowl ? '#e8ecee' : '#d9b48a';
      g.beginPath(); g.moveTo(22, 0); g.lineTo(-8, -16); g.lineTo(-8, 16); g.closePath(); g.fill();
      g.restore();
      const lx = cx + Math.cos(a) * (er - 62), ly = cy + Math.sin(a) * (er - 50);
      text(g, (v.name || (v.isBowl ? 'Milk' : 'Cup')).toUpperCase(), lx, ly - 14, 22, C.grey, { weight: 700 });
      text(g, `${Math.round((d - v.rOut) * this.L * FT)} FT`, lx, ly + 14, 24, C.white, { weight: 700 });
    }
    // Free bags (and the bucket) waiting to be picked up.
    const carried = new Set();
    for (const ld of M.loads) carried.add(`${ld.x}|${ld.z}`);
    const items = sim.cargoItems ? sim.cargoItems() : [];
    for (const b of items) {
      if (b.retiring || (b.attach && b.attach.kind === 'heli') || !b.pos) continue;
      const [mx, my] = map(b.pos.x, b.pos.z);
      if (mx < x - 20 || mx > x + w + 20 || my < y - 20 || my > y + hgt + 20) continue;
      g.fillStyle = '#d9c39a'; g.strokeStyle = '#6d5a3a'; g.lineWidth = 2;
      g.fillRect(mx - 9, my - 6, 18, 12); g.strokeRect(mx - 9, my - 6, 18, 12);
    }
    if (M.cand) {
      const [mx, my] = map(M.cand.x, M.cand.z);
      g.strokeStyle = C.amber; g.lineWidth = 4;
      g.beginPath(); g.arc(mx, my, 24, 0, Math.PI * 2); g.stroke();
      text(g, 'IN REACH', mx, my - 40, 24, C.amber, { weight: 700 });
    }
    // Snorkel intake.
    if (M.tank) {
      const [mx, my] = map(M.tank.ix, M.tank.iz);
      g.strokeStyle = 'rgba(95,211,255,0.6)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(mx, my); g.stroke();
      g.fillStyle = M.tank.submerged ? C.cyan : '#1b5d78'; g.strokeStyle = C.cyan;
      g.beginPath(); g.arc(mx, my, 11, 0, Math.PI * 2); g.fill(); g.stroke();
    }
    // Predicted track: momentum plus the present acceleration, out to two seconds.
    const aF = clamp(F.aF, -3, 3), aR = clamp(F.aR, -3, 3);
    g.strokeStyle = C.magenta; g.lineWidth = 4;
    g.beginPath(); g.moveTo(cx, cy);
    let tip = null;
    for (let i = 1; i <= 20; i++) {
      const t = i * 0.1;
      const dF = F.vF * t + 0.5 * aF * t * t, dR = F.vR * t + 0.5 * aR * t * t;
      const px = cx + dR * sc, py = cy - dF * sc;
      g.lineTo(px, py);
      if (i % 5 === 0) tip = [px, py, i / 10];
    }
    g.stroke();
    g.fillStyle = C.magenta;
    for (const s of [0.5, 1, 1.5, 2]) {
      const dF = F.vF * s + 0.5 * aF * s * s, dR = F.vR * s + 0.5 * aR * s * s;
      g.beginPath(); g.arc(cx + dR * sc, cy - dF * sc, s === 2 ? 8 : 5, 0, Math.PI * 2); g.fill();
    }
    if (tip && Math.hypot(tip[0] - cx, tip[1] - cy) > 40) text(g, '2 s', tip[0] + 22, tip[1], 22, C.magenta, { align: 'left', weight: 700 });
    // Loads swinging under the hooks.
    for (const ld of M.loads) {
      const [mx, my] = map(ld.x, ld.z);
      const wet = ld.depthFt > 0;
      g.strokeStyle = 'rgba(233,238,242,0.7)'; g.lineWidth = 2.5;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(mx, my); g.stroke();
      g.fillStyle = wet ? C.cyan : C.white;
      if (ld.bucket) { g.beginPath(); g.arc(mx, my, 13, 0, Math.PI * 2); g.fill(); } else g.fillRect(mx - 10, my - 7, 20, 14);
    }
    // Own aircraft.
    g.save(); g.translate(cx, cy);
    heliGlyph(g, 64, '#ffffff', 6);
    g.restore();
    g.restore();
    g.strokeStyle = '#2b3338'; g.lineWidth = 3; g.strokeRect(x, y, w, hgt);
  }

  // Ground speed, height over what is below, vertical speed.
  flightRow(g, x, y, W, F) {
    const col = W / 3;
    const cell = (i, label, val, unit, color) => {
      text(g, label, x + col * (i + 0.5), y + 28, 24, C.grey, { weight: 700 });
      text(g, val, x + col * (i + 0.5), y + 70, 48, color, { weight: 700 });
      text(g, unit, x + col * (i + 0.5), y + 108, 22, C.grey, { weight: 600 });
    };
    cell(0, 'GND SPD', F.gsKt.toFixed(F.gsKt < 10 ? 1 : 0), 'KT', C.white);
    const liquid = F.surf === 'TEA' || F.surf === 'MILK';
    cell(1, `OVER ${F.surf}`, fmtFt(F.radFt), 'FT', liquid ? C.cyan : F.surf === 'RIM' ? C.amber : C.green);
    cell(2, 'VERT SPD', fmtFpm(F.fpm), 'FT/MIN', Math.abs(F.fpm) < 60 ? C.white : F.fpm > 0 ? C.green : C.amber);
  }

  // A cup in section, with the load drawn where it hangs relative to the surface.
  dipGauge(g, x, y, w, hgt, ld) {
    const v = ld.vessel;
    g.strokeStyle = '#d7dde0'; g.lineWidth = 4;
    if (!v) {
      // Height bar over the table: 0..20 ft, the load as a marker.
      g.fillStyle = '#0d1418'; g.fillRect(x, y, w, hgt);
      g.fillStyle = '#7a5a3a'; g.fillRect(x, y + hgt - 10, w, 10);
      const f = clamp((ld.aboveFt ?? 20) / 20, 0, 1);
      const my = y + hgt - 10 - f * (hgt - 30);
      g.fillStyle = ld.bucket ? C.white : '#d9c39a';
      g.fillRect(x + w * 0.25, my - 16, w * 0.5, 16);
      return;
    }
    // Cup walls, floor, the liquid, and the load at its height.
    const top = v.topY, bot = v.floorY, span = (top - bot) * 1.35;
    const Y = (wy) => y + hgt - 6 - ((wy - bot) / span) * (hgt - 12);
    milkyTea(v.brew || 0, v.milk || 0, _col);
    g.fillStyle = cssColor(_col);
    g.fillRect(x + 8, Y(v.waterY), w - 16, Y(bot) - Y(v.waterY));
    g.beginPath(); g.moveTo(x + 4, Y(top)); g.lineTo(x + 4, Y(bot)); g.lineTo(x + w - 4, Y(bot)); g.lineTo(x + w - 4, Y(top)); g.stroke();
    g.strokeStyle = C.white; g.lineWidth = 2; g.setLineDash([6, 6]);
    g.beginPath(); g.moveTo(x + 8, Y(v.waterY)); g.lineTo(x + w - 8, Y(v.waterY)); g.stroke(); g.setLineDash([]);
    const yb = Y(Math.max(bot, ld.bottom)), yt = Math.max(y, Y(ld.top));
    g.fillStyle = ld.bucket ? 'rgba(240,240,240,0.9)' : 'rgba(217,195,154,0.95)';
    g.fillRect(x + w * 0.28, yt, w * 0.44, Math.max(4, yb - yt));
    g.strokeStyle = '#3d2f1d'; g.lineWidth = 2; g.strokeRect(x + w * 0.28, yt, w * 0.44, Math.max(4, yb - yt));
  }

  loadLines(ld) {
    // The lines of text that go with a load: where it is, the steep and the brew (or the bucket's fill).
    const out = [];
    const what = ld.vessel ? (ld.vessel.isBowl ? 'MILK' : 'TEA') : ld.aboveWhat;
    if (ld.depthFt > 0) out.push([`${fmtFt(ld.depthFt)} FT IN ${what}`, C.cyan]);
    else if (ld.aboveFt !== null) out.push([`${fmtFt(ld.aboveFt)} FT OVER ${what}`, ld.aboveFt < 2 ? C.amber : C.white]);
    if (ld.bucket) out.push([`FULL ${Math.round(ld.fill * 100)}%`, ld.fill > 0.05 ? C.white : C.grey]);
    else {
      out.push([`STEEP ${fmtTime(ld.steepT)}`, ld.immersion > 0.03 ? C.cyan : C.grey]);
      if (ld.vessel && !ld.vessel.isBowl) out.push([brewName(ld.brew).toUpperCase(), C.white]);
      out.push([`BAG ${Math.round(ld.potency * 100)}% LEFT`, ld.potency > 0.25 ? C.grey : C.amber]);
    }
    return out;
  }

  loadBlock(g, x, y, w, hgt, ld, M) {
    g.strokeStyle = '#2b3338'; g.lineWidth = 3; roundRect(g, x, y, w, hgt, 12); g.stroke();
    text(g, 'HOOK', x + 20, y + 34, 28, C.grey, { align: 'left', weight: 700 });
    if (!ld) {
      text(g, M.cand ? 'LOOP IN REACH' : 'EMPTY', x + w / 2, y + hgt / 2 + 14, 44, M.cand ? C.amber : C.dim, { weight: 700 });
      return;
    }
    text(g, ld.bucket ? 'BUCKET' : 'TEA BAG', x + w - 20, y + 34, 28, C.green, { align: 'right', weight: 700 });
    const gw = w * 0.3;
    this.dipGauge(g, x + 16, y + 56, gw, hgt - 70, ld);
    const lines = this.loadLines(ld);
    lines.forEach(([s, col], i) => text(g, s, x + gw + 40, y + 82 + i * 46, i === 0 ? 36 : 32, col, { align: 'left', weight: 700 }));
    if (!ld.bucket && ld.vessel && !ld.vessel.isBowl) {
      // Brew strength bar under the text.
      const bx = x + gw + 40, by = y + hgt - 34, bw = w - gw - 64;
      g.fillStyle = '#132026'; g.fillRect(bx, by, bw, 18);
      milkyTea(ld.brew, ld.milk, _col);
      g.fillStyle = cssColor(_col); g.fillRect(bx, by, bw * clamp(ld.brew, 0, 1), 18);
      g.strokeStyle = C.grey; g.lineWidth = 2; g.strokeRect(bx, by, bw, 18);
    }
  }

  loadColumn(g, x, y, w, hgt, ld, cand, name) {
    g.strokeStyle = ld ? '#2f5a3c' : '#2b3338'; g.lineWidth = 4; roundRect(g, x, y, w, hgt, 14); g.stroke();
    text(g, name, x + 22, y + 44, 40, C.grey, { align: 'left', weight: 700 });
    if (!ld) { text(g, cand ? 'IN REACH' : 'EMPTY', x + w / 2, y + hgt / 2 + 20, 56, cand ? C.amber : C.dim, { weight: 700 }); return; }
    text(g, ld.bucket ? 'BUCKET' : 'BAG', x + w - 22, y + 44, 40, C.green, { align: 'right', weight: 700 });
    const gw = w * 0.3;
    this.dipGauge(g, x + 18, y + 78, gw, hgt - 96, ld);
    this.loadLines(ld).slice(0, 4).forEach(([s, col], i) => text(g, s, x + gw + 40, y + 112 + i * 62, i === 0 ? 44 : 40, col, { align: 'left', weight: 700 }));
  }

  tankBlock(g, x, y, w, hgt, T) {
    g.strokeStyle = '#2b3338'; g.lineWidth = 3; roundRect(g, x, y, w, hgt, 12); g.stroke();
    if (!T) return;
    // Tank in section: level, contents colour, and the two belly doors opening underneath.
    const tw = w * 0.24, tx = x + 20, ty = y + 18, th = hgt - 70;
    g.fillStyle = '#0d1418'; g.fillRect(tx, ty, tw, th);
    milkyTea(T.brew, T.milk, _col);
    g.fillStyle = cssColor(_col); g.fillRect(tx, ty + th * (1 - T.level), tw, th * T.level);
    g.strokeStyle = '#d7dde0'; g.lineWidth = 4; g.strokeRect(tx, ty, tw, th);
    for (const s of [0.25, 0.5, 0.75]) { g.strokeStyle = C.dim; g.lineWidth = 2; g.beginPath(); g.moveTo(tx, ty + th * s); g.lineTo(tx + 14, ty + th * s); g.stroke(); }
    const da = T.doors * 1.2;
    g.strokeStyle = T.doors > 0.02 ? C.amber : '#d7dde0'; g.lineWidth = 6;
    for (const sx of [-1, 1]) {
      const hx = tx + tw / 2 + sx * tw / 2, hy = ty + th + 4;
      g.beginPath(); g.moveTo(hx, hy); g.lineTo(hx - sx * Math.cos(da) * tw * 0.46, hy + Math.sin(da) * tw * 0.46); g.stroke();
    }
    // Right: doors, pump, snorkel.
    const lx = tx + tw + 30;
    const lines = [
      [T.doors > 0.02 ? `DOORS ${Math.round(T.doors * 100)}% OPEN` : 'DOORS SHUT', T.doors > 0.02 ? C.amber : C.grey],
      [T.auto ? `AUTO: ${T.auto === 'down' ? 'LOWERING' : T.auto === 'pump' ? 'PUMPING' : 'REELING IN'}` : T.salvo ? 'SALVO' : T.pumping ? `PUMP ON ${Math.round(T.pump * 100)}%` : 'PUMP OFF', T.pumping || T.auto ? C.green : C.grey],
      [T.submerged ? `INTAKE IN ${T.submerged} ${fmtFt(T.depthFt)} FT` : T.aboveFt !== null ? `INTAKE ${fmtFt(T.aboveFt)} FT OVER ${T.aboveWhat}` : 'INTAKE —', T.submerged ? C.cyan : C.white],
      [T.flowIn > 0.5 ? `FILL +${Math.round(T.flowIn)}%/S` : T.flowOut > 0.5 ? `DROP −${Math.round(T.flowOut)}%/S` : 'NO FLOW', T.flowIn > 0.5 ? C.green : T.flowOut > 0.5 ? C.amber : C.dim],
    ];
    text(g, 'TANK', lx, y + 38, 28, C.grey, { align: 'left', weight: 700 });
    text(g, `${Math.round(T.level * 100)}%`, x + w - 20, y + 40, 40, T.level > 0.02 ? C.white : C.grey, { align: 'right', weight: 700 });
    lines.forEach(([s, col], i) => text(g, s, lx, y + 84 + i * 42, 29, col, { align: 'left', weight: 700 }));
    // Snorkel length.
    const by = y + hgt - 38, bw = w - (lx - x) - 20;
    text(g, 'SNORKEL', lx, by - 18, 22, C.grey, { align: 'left', weight: 700 });
    text(g, `${Math.round(T.hoseFt)} FT OUT`, lx + bw, by - 18, 22, C.grey, { align: 'right', weight: 700 });
    g.fillStyle = '#132026'; g.fillRect(lx, by, bw, 16);
    g.fillStyle = C.cyan; g.fillRect(lx, by, bw * clamp(T.hoseFrac, 0, 1), 16);
    g.strokeStyle = C.grey; g.lineWidth = 2; g.strokeRect(lx, by, bw, 16);
  }

  // Chinook PFD tapes over the shader attitude: ground speed, radar height, vertical speed, heading
  // and power with the hover bug.
  pagePfd(g, W, H, F) {
    const bot = H * 0.66;
    // Speed tape (left) and radar height tape (right).
    const tape = (tx, tw, val, step, pxPer, left, color, label) => {
      g.fillStyle = 'rgba(6,10,13,0.62)'; g.fillRect(tx, 64, tw, bot - 84);
      g.strokeStyle = C.white; g.lineWidth = 3; g.font = `600 30px ${GLASS_FONT}`; g.fillStyle = C.white; g.textBaseline = 'middle';
      const cy = bot / 2;
      const base = Math.floor(val / step) * step;
      for (let k = -6; k <= 6; k++) {
        const v = base + k * step, yy = cy - (v - val) * pxPer;
        if (yy < 80 || yy > bot - 30 || v < 0) continue;
        const ex = left ? tx + tw : tx;
        g.beginPath(); g.moveTo(ex, yy); g.lineTo(ex + (left ? -14 : 14), yy); g.stroke();
        g.textAlign = left ? 'right' : 'left';
        g.fillText(String(v), left ? ex - 20 : ex + 20, yy);
      }
      g.fillStyle = '#000'; g.fillRect(tx - 4, cy - 30, tw + 8, 60);
      g.strokeStyle = C.white; g.strokeRect(tx - 4, cy - 30, tw + 8, 60);
      text(g, val < 10 ? val.toFixed(1) : String(Math.round(val)), tx + tw / 2, cy + 2, 38, color, { weight: 700 });
      g.fillStyle = 'rgba(6,10,13,0.8)'; g.fillRect(tx, 14, tw, 46);
      text(g, label, tx + tw / 2, 38, 28, C.grey, { weight: 700 });
    };
    tape(14, 150, F.gsKt, 2, 22, true, C.green, 'GS KT');
    const liquid = F.surf === 'TEA' || F.surf === 'MILK';
    tape(W - 220, 150, F.radFt, 5, 11, false, liquid ? C.cyan : C.green, 'RALT');
    text(g, F.surf, W - 145, bot - 16, 24, liquid ? C.cyan : F.surf === 'RIM' ? C.amber : C.grey, { weight: 700 });
    // Vertical speed scale at the far right.
    const vx = W - 50, cy = bot / 2, span = bot / 2 - 40;
    g.fillStyle = 'rgba(6,10,13,0.62)'; g.fillRect(vx - 10, 30, 52, bot - 60);
    g.strokeStyle = C.grey; g.lineWidth = 2;
    for (const v of [-1000, -500, 0, 500, 1000]) { const yy = cy - Math.sign(v) * Math.sqrt(Math.abs(v) / 1000) * span; g.beginPath(); g.moveTo(vx - 6, yy); g.lineTo(vx + 10, yy); g.stroke(); }
    const vy = cy - Math.sign(F.fpm) * Math.sqrt(Math.min(Math.abs(F.fpm), 1100) / 1000) * span;
    g.strokeStyle = F.fpm >= 0 ? C.green : C.amber; g.lineWidth = 10;
    g.beginPath(); g.moveTo(vx + 16, cy); g.lineTo(vx + 16, vy); g.stroke();
    text(g, `VS ${fmtFpm(F.fpm)}`, W / 2, 34, 30, Math.abs(F.fpm) < 60 ? C.white : F.fpm > 0 ? C.green : C.amber, { weight: 700 });
    // Heading tape and power, below the attitude.
    g.fillStyle = '#05080a'; g.fillRect(0, bot, W, H - bot);
    g.strokeStyle = C.white; g.lineWidth = 3;
    const hy = bot + 70;
    for (let k = -5; k <= 5; k++) {
      const d = Math.round(F.hdg / 10) * 10 + k * 10, xx = W / 2 + (d - F.hdg) * 9;
      if (xx < 40 || xx > W - 40) continue;
      g.beginPath(); g.moveTo(xx, bot + 20); g.lineTo(xx, bot + 38); g.stroke();
      const dd = ((d % 360) + 360) % 360;
      text(g, { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd] ?? String(dd / 10).padStart(2, '0'), xx, hy, 28, C.white, { weight: 600 });
    }
    g.fillStyle = C.amber; g.beginPath(); g.moveTo(W / 2, bot + 34); g.lineTo(W / 2 - 12, bot + 6); g.lineTo(W / 2 + 12, bot + 6); g.closePath(); g.fill();
    // Ground track bug on the heading tape.
    if (F.gsKt > 0.4) {
      const tx = W / 2 + clamp(F.trk / D2R, -50, 50) * 9;
      g.strokeStyle = C.magenta; g.lineWidth = 5; g.beginPath(); g.arc(tx, bot + 28, 10, 0, Math.PI * 2); g.stroke();
    }
    // Power bar with the hover bug.
    const py = bot + 128, px0 = 150, pw = W - 300;
    text(g, 'PWR', px0 - 20, py + 14, 28, C.grey, { align: 'right', weight: 700 });
    g.fillStyle = '#132026'; g.fillRect(px0, py, pw, 28);
    g.fillStyle = F.pwr > F.hoverPwr + 2 ? C.green : F.pwr < F.hoverPwr - 2 ? C.amber : C.white;
    g.fillRect(px0, py, pw * clamp(F.pwr / 100, 0, 1), 28);
    g.strokeStyle = C.grey; g.lineWidth = 2; g.strokeRect(px0, py, pw, 28);
    const bx = px0 + pw * clamp(F.hoverPwr / 100, 0, 1);
    g.fillStyle = C.amber; g.beginPath(); g.moveTo(bx, py - 2); g.lineTo(bx - 12, py - 22); g.lineTo(bx + 12, py - 22); g.closePath(); g.fill();
    text(g, `${Math.round(F.pwr)}%`, px0 + pw + 20, py + 14, 30, C.white, { align: 'left', weight: 700 });
    text(g, 'HOVER', bx, py + 56, 22, C.amber, { weight: 700 });
    g.strokeStyle = '#2b3338'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
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
