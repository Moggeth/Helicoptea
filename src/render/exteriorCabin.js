import * as THREE from 'three';
import { seat, crewFigure, rbox, at } from './cockpitKit.js';
import { FULL_SCALE } from './instruments.js';

// What you see through the glass from outside: the same seats as the first-person cockpits, seated crew
// in helmets with their hands on the controls, and the instrument panel and its glare shield, with a
// small painted panel face (the live instruments only run in the cockpit). Built in body coordinates
// and merged with the airframe part it sits in, so it costs a handful of draw calls.

const LAYOUT = {
  micro: { floorY: -0.0246, seats: [{ x: 0.0085, z: -0.0195, crew: true }, { x: -0.0085, z: -0.0195, crew: false }], bench: [-0.0108, 0, 0.0108], benchZ: 0.0075,
    seat: { w: 0.42, seatH: 0.24, backH: 0.6, depth: 0.5, recline: 0.14, headrest: false },
    panel: { x: 0.0015, y: -0.0091, z: -0.0414, w: 0.030, h: 0.0105, rot: -0.3, dials: 6 }, suit: '#4b5a3c', helmet: 0xf2f2ee },
  chinook: { floorY: -0.0046, seats: [{ x: 0.0072, z: -0.0720, crew: true }, { x: -0.0072, z: -0.0720, crew: true }],
    seat: { style: 'armoured', w: 0.5, seatH: 0.44, backH: 0.75, depth: 0.52, recline: 0.12 },
    panel: { x: 0, y: 0.0019, z: -0.0800, w: 0.024, h: 0.0056, rot: -0.18, glass: 5, noShield: true }, suit: '#55603f', helmet: 0x3b4230 },
  skycrane: { floorY: -0.0018, seats: [{ x: 0.0048, z: -0.0688, crew: true }, { x: -0.0048, z: -0.0688, crew: true }],
    seat: { w: 0.48, seatH: 0.4, backH: 0.72, depth: 0.55, recline: 0.12 },
    panel: { x: -0.0012, y: 0.0067, z: -0.0751, w: 0.0163, h: 0.0036, rot: -0.2, dials: 6 }, suit: '#3b4a5a', helmet: 0xe8e4da },
};

let _tex = {};
function panelTexture(kind, spec) {
  if (_tex[kind]) return _tex[kind];
  const W = 512, H = Math.max(64, Math.round(512 * spec.h / spec.w));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#25272a'; g.fillRect(0, 0, W, H);
  if (spec.glass) {
    for (let i = 0; i < spec.glass; i++) {
      const w = W / (spec.glass + 1), x = w * 0.5 + i * w * 1.05;
      g.fillStyle = '#0b0d10'; g.fillRect(x, H * 0.08, w * 0.85, H * 0.84);
      g.fillStyle = i % 2 ? '#1b3a5a' : '#2f2a1e'; g.fillRect(x + 4, H * 0.12, w * 0.85 - 8, H * 0.4);
      g.fillStyle = '#5a8a5a'; g.fillRect(x + 8, H * 0.6, w * 0.4, 4);
    }
  } else {
    const r = H * 0.17;
    g.fillStyle = '#0b0d10'; g.fillRect(W * 0.03, H * 0.12, W * 0.18, H * 0.6);
    g.fillStyle = '#0b1622'; g.fillRect(W * 0.24, H * 0.06, W * 0.2, H * 0.86);
    for (let i = 0; i < spec.dials; i++) {
      const x = W * 0.58 + (i % 3) * r * 2.3, y = H * (i < 3 ? 0.28 : 0.72);
      g.fillStyle = '#111'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      g.strokeStyle = '#ddd'; g.lineWidth = 1.5;
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.75, y + Math.sin(a) * r * 0.75); g.lineTo(x + Math.cos(a) * r * 0.92, y + Math.sin(a) * r * 0.92); g.stroke(); }
      if (i === 1) { g.fillStyle = '#4a86c8'; g.beginPath(); g.arc(x, y, r * 0.7, Math.PI, 0); g.fill(); g.fillStyle = '#7a5530'; g.beginPath(); g.arc(x, y, r * 0.7, 0, Math.PI); g.fill(); }
      else { g.strokeStyle = '#f2f0e6'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(-2 + i) * r * 0.7, y + Math.sin(-2 + i) * r * 0.7); g.stroke(); }
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return (_tex[kind] = t);
}

// Returns a group (body frame) to add to the airframe part that holds the cabin.
export function exteriorCabin(kind) {
  const L = LAYOUT[kind];
  const u = 1 / FULL_SCALE[kind];
  const std = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const M = {
    seat: std(kind === 'micro' ? 0x6c4f37 : kind === 'chinook' ? 0x40463a : 0x2f3236, 0.8),
    seatFrame: new THREE.MeshStandardMaterial({ color: 0x3a3c3f, roughness: 0.45, metalness: 0.7 }),
    cushionEdge: std(0x1c1c1c, 0.7), metal: new THREE.MeshStandardMaterial({ color: 0x9da1a6, roughness: 0.32, metalness: 0.9 }),
    belt: std(0x27324a), buckle: new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 1 }), knob: std(0x18191a, 0.5),
    armour: std(0x3c4232, 0.7),
  };
  const K = { u, M };
  const g = new THREE.Group();
  const crew = {
    suit: std(new THREE.Color(L.suit).getHex(), 0.9), helmet: new THREE.MeshPhysicalMaterial({ color: L.helmet, roughness: 0.35, clearcoat: 0.7 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.05, metalness: 0.6, clearcoat: 1 }), glove: std(0x2a231c, 0.6), boot: std(0x1b1a19, 0.5),
  };
  for (const s of L.seats) {
    const sg = seat(K, { ...L.seat, harness: s.crew ? 'none' : 'laid', armourMat: M.armour });
    at(sg, s.x, L.floorY, s.z);
    g.add(sg);
    if (s.crew) g.add(at(crewFigure(K, { sh: L.seat.seatH, d: L.seat.depth, ...crew }), s.x, L.floorY, s.z));
  }
  for (const bx of L.bench || []) g.add(at(seat(K, { w: 0.34, seatH: 0.27, backH: 0.55, depth: 0.42, recline: 0.12, headrest: false, harness: 'none' }), bx, L.floorY, L.benchZ));
  // Panel face and its glare shield.
  const P = L.panel;
  const pg = new THREE.Group();
  pg.add(new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.h), new THREE.MeshStandardMaterial({ map: panelTexture(kind, P), roughness: 0.6, emissive: 0xffffff, emissiveMap: panelTexture(kind, P), emissiveIntensity: 0.25 })));
  pg.add(at(rbox(M.knob, P.w * 1.03, P.h * 1.1, P.h * 0.4), 0, 0, -P.h * 0.2 - 0.00003));
  if (!P.noShield) pg.add(at(rbox(M.cushionEdge, P.w * 1.04, P.h * 0.08, P.h * 0.9), 0, P.h * 0.58, -P.h * 0.3));
  pg.position.set(P.x, P.y, P.z); pg.rotation.x = P.rot;
  g.add(pg);
  g.traverse((o) => { if (o.isMesh) o.castShadow = o.receiveShadow = true; });
  return g;
}
