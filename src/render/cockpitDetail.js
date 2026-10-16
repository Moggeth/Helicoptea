import * as THREE from 'three';
import {
  V, rod, rbox, at, tubeAlong, strap, switchPanel, breakerItems, seat, extinguisher, headset, flask, mugHolder,
  vent, grabHandle, mapLight, placard, lever, paintText,
} from './cockpitKit.js';

// The fittings that make each first-person cockpit a place to look around in (switch panels, radios,
// breakers, seats and harnesses, door hardware, the cabin behind you), laid out after the real types
// each aircraft is modelled on. Built in body coordinates at model scale; parts are sized in full-size
// metres through the kit (K.u = model metres per full-size metre).

// Orient an object from its local axes (x, y and the face normal z) in body axes.
const _m4 = new THREE.Matrix4();
export function orient(obj, x, y, z) {
  obj.quaternion.setFromRotationMatrix(_m4.makeBasis(x.clone().normalize(), y.clone().normalize(), z.clone().normalize()));
  return obj;
}

// A flat panel (w x h model metres) cut to a section outline: bulkheads across a lofted fuselage.
export function bulkhead(mat, outline, z, flip = false) {
  const s = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
  const g = new THREE.ShapeGeometry(s, 4);
  if (flip) g.rotateY(Math.PI);
  g.translate(0, 0, z);
  // Planar UVs in model metres scaled to a sensible repeat.
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) * 40, p.getY(k) * 40);
  return new THREE.Mesh(g, mat);
}

// Quilted sound-proofing blanket (cabins and bulkheads).
export function quiltTexture(base, repeat = [1, 1]) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const gr = g.createRadialGradient(16 + i * 32, 16 + j * 32, 2, 16 + i * 32, 16 + j * 32, 22);
    gr.addColorStop(0, 'rgba(255,255,255,0.08)'); gr.addColorStop(1, 'rgba(0,0,0,0.14)');
    g.fillStyle = gr; g.fillRect(i * 32, j * 32, 32, 32);
  }
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
  for (let k = 0; k <= 128; k += 32) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 128); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(128, k); g.stroke(); }
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.06})`; g.fillRect(Math.random() * 128, Math.random() * 128, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...repeat);
  return t;
}

// A curved patch of a lofted shell between stations z0..z1 and section angles a0..a1 (right side; sx
// mirrors), set in to `inset`: door trim panels that follow the fuselage.
export function shellPatch(onShell, mat, z0, z1, a0, a1, inset, sx, nz = 8, na = 8, rep = [1, 1]) {
  const pos = [], uv = [], idx = [];
  for (let j = 0; j <= na; j++) for (let i = 0; i <= nz; i++) {
    const p = onShell(z0 + (z1 - z0) * i / nz, a0 + (a1 - a0) * j / na, inset);
    pos.push(p.x * sx, p.y, p.z);
    uv.push(i / nz * rep[0], j / na * rep[1]);
  }
  for (let j = 0; j < na; j++) for (let i = 0; i < nz; i++) {
    const a = j * (nz + 1) + i, b = a + 1, c = a + nz + 1, d = c + 1;
    if (sx > 0) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}
export function patchOutline(onShell, z0, z1, a0, a1, inset, sx, n = 6) {
  const pts = [];
  for (let i = 0; i < n; i++) pts.push(onShell(z0 + (z1 - z0) * i / n, a0, inset));
  for (let i = 0; i < n; i++) pts.push(onShell(z1, a0 + (a1 - a0) * i / n, inset));
  for (let i = 0; i < n; i++) pts.push(onShell(z1 - (z1 - z0) * i / n, a1, inset));
  for (let i = 0; i < n; i++) pts.push(onShell(z0, a1 - (a1 - a0) * i / n, inset));
  for (const p of pts) p.x *= sx;
  return pts;
}

// Pleated vinyl trim: horizontal rolls with stitched seams.
export function pleatTexture(base) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 64, 128);
  for (let j = 0; j < 4; j++) {
    const gr = g.createLinearGradient(0, j * 32, 0, j * 32 + 32);
    gr.addColorStop(0, 'rgba(0,0,0,0.28)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.08)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.03)'); gr.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = gr; g.fillRect(0, j * 32, 64, 32);
    g.fillStyle = 'rgba(230,220,200,0.18)';
    for (let x = 1; x < 64; x += 5) g.fillRect(x, j * 32 + 3, 2, 1);
  }
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * 64, Math.random() * 128, 1, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------------------------------------------------------------- shared panel contents
export const AUDIO = (w) => ({ w, h: 0.05, theme: 'black', title: 'AUDIO', items: ['COM1', 'COM2', 'NAV', 'ADF', 'MKR', 'ICS'].map((l, i) => ({ t: 'push', x: 0.022 + i * (w - 0.044) / 5, y: 0.03, w: 0.024, h: 0.014, label: l, color: '#e9e5d8', lit: i === 0 })) });
export const COMNAV = (w, f1 = '118.300', f2 = '121.500') => ({
  w, h: 0.07, theme: 'black', items: [
    { t: 'display', x: 0.012, y: 0.014, w: w * 0.34, h: 0.022, text: f1, label: 'USE' },
    { t: 'display', x: 0.024 + w * 0.34, y: 0.014, w: w * 0.34, h: 0.022, text: f2, label: 'STBY', color: '#e8b54a' },
    { t: 'push', x: w * 0.36 + 0.006, y: 0.052, w: 0.018, h: 0.01, label: '⇄', color: '#d8d6cc' },
    { t: 'dual', x: w - 0.03, y: 0.035, r: 0.013, pos: 1.2 },
    { t: 'knob', x: 0.024, y: 0.052, r: 0.007, label: '', pos: -0.6 },
  ],
});
export const XPDR = (w, code = '7000') => ({
  w, h: 0.055, theme: 'black', items: [
    { t: 'display', x: 0.012, y: 0.012, w: w * 0.38, h: 0.024, text: code, label: 'XPDR', color: '#59e07c' },
    { t: 'rotary', x: w * 0.6, y: 0.026, r: 0.011, stops: ['OFF', 'SBY', 'ON', 'ALT'], pos: 1.2 },
    { t: 'push', x: w - 0.024, y: 0.026, w: 0.022, h: 0.014, label: 'IDENT', color: '#d8d6cc' },
  ],
});
export const GPS = (w) => ({
  w, h: 0.075, theme: 'black', items: [
    { t: 'display', x: 0.012, y: 0.01, w: w * 0.62, h: 0.04, text: 'DTO TEA', color: '#7ec8f0' },
    { t: 'keys', x: w * 0.72, y: 0.008, kw: 0.017, kh: 0.012, gap: 0.004, rows: ['↵', 'D', 'C'] },
    { t: 'dual', x: w * 0.3, y: 0.062, r: 0.009, pos: 0.3 },
  ],
});

// ---------------------------------------------------------------- micro heli (Bell 206-style)
// ctx: { onShell(z, a, inset), section(z) }.
export function detailMicro(K, root, ctx) {
  const { u, M } = K;
  const S = (v) => v * u;
  const floorY = -0.0246;
  const { onShell } = ctx;

  // --- Crew seats: low bucket seats on boxed bases, the empty one with its harness laid out.
  for (const sx of [-1, 1]) {
    const s = seat(K, { style: 'bucket', w: 0.42, seatH: 0.24, backH: 0.6, depth: 0.5, recline: 0.14, headrest: false, harness: sx > 0 ? 'none' : 'laid' });
    at(s, sx * 0.0085, floorY, -0.0195);
    root.add(s);
    // A boxed base under each seat (the 206's seats sit on the fuel cell structure).
    root.add(at(rbox(M.trim, S(0.44), S(0.2), S(0.46), S(0.02)), sx * 0.0085, floorY + S(0.1), -0.0195 + S(0.24)));
  }
  // --- Rear bench for three, belts laid on the cushions, and the aft bulkhead behind it.
  for (const bx of [-0.0108, 0, 0.0108]) {
    const s = seat(K, { style: 'bucket', w: 0.34, seatH: 0.27, backH: 0.55, depth: 0.42, recline: 0.12, headrest: false, harness: 'laid' });
    at(s, bx, floorY, 0.0075);
    root.add(s);
  }
  root.add(at(rbox(M.trim, S(1.05), S(0.24), S(0.42), S(0.02)), 0, floorY + S(0.12), 0.0075 + S(0.21)));
  {
    const z = 0.0222, pts = [];
    for (let a = -Math.PI; a <= Math.PI + 1e-6; a += Math.PI / 24) pts.push(onShell(z, a, 0.965));
    const quilt = new THREE.MeshStandardMaterial({ map: quiltTexture('#77736a', [1, 1]), roughness: 0.95 });
    const bh = bulkhead(quilt, pts, z, true);
    root.add(bh);
    // First-aid kit, a placard and two passenger headsets on hooks.
    const fak = new THREE.Group();
    fak.add(rbox(new THREE.MeshStandardMaterial({ color: 0x2f6a3e, roughness: 0.7 }), S(0.24), S(0.15), S(0.08), S(0.012)));
    const cross = placard(K, 0.06, 0.06, (g, W, H) => { g.fillStyle = '#2f6a3e'; g.fillRect(0, 0, W, H); g.fillStyle = '#f4f2ea'; g.fillRect(W * 0.38, H * 0.12, W * 0.24, H * 0.76); g.fillRect(W * 0.12, H * 0.38, W * 0.76, H * 0.24); });
    cross.position.z = S(0.041); fak.add(cross);
    root.add(at(fak, -0.0105, 0.0105, z - S(0.045), 0, Math.PI, 0));
    const plac = placard(K, 0.24, 0.08, (g, W, H) => {
      paintText(g, 'NO SMOKING', W / 2, H * 0.32, H * 0.3, '#b3201b');
      paintText(g, 'FASTEN BELT WHILE SEATED', W / 2, H * 0.72, H * 0.17, '#1e1f22');
    });
    root.add(at(plac, 0.0045, 0.0125, z - S(0.004), 0, Math.PI, 0));
    for (const hx of [-0.006, 0.013]) root.add(at(headset(K, 0x3c3f45), hx, 0.0102, z - S(0.03), 0, Math.PI, 0));
  }
  // Rear floor and the dome light.
  root.add(at(rbox(M.floor, 0.033, 0.0008, 0.024), 0, floorY, 0.012));
  root.add(at(new THREE.Mesh(new THREE.CylinderGeometry(S(0.07), S(0.08), S(0.025), 20), K.M.lamp), 0, onShell(0.008, Math.PI / 2, 0.965).y - S(0.012), 0.008));
  // Roof frame bows over the cabin (at the door posts) and the B-post between the doors.
  for (const z of [0.0005, 0.0212]) {
    const bow = [];
    for (let a = 0.15; a <= Math.PI - 0.15 + 1e-6; a += Math.PI / 20) bow.push(onShell(z, a, 0.962));
    root.add(tubeAlong(M.post, bow, S(0.025)));
  }

  // --- Door trim: upholstered lower panels on all four doors, piped round the edge, and the door seams.
  {
    const vt = pleatTexture('#5f5b55');
    const vinyl = new THREE.MeshStandardMaterial({ map: vt, bumpMap: vt, bumpScale: 0.8, roughness: 0.6, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      for (const [z0, z1] of [[-0.0186, -0.0009], [0.0013, 0.0203]]) {
        root.add(shellPatch(onShell, vinyl, z0, z1, -0.72, 0.06, 0.966, sx, 10, 12, [1, 5]));
        root.add(tubeAlong(M.seal, patchOutline(onShell, z0, z1, -0.72, 0.06, 0.964, sx), S(0.008), true, 6));
        root.add(tubeAlong(M.seal, patchOutline(onShell, z0 - 0.0005, z1 + 0.0004, -0.95, 1.06, 0.971, sx), S(0.005), true, 5));
      }
    }
  }

  // --- Doors: handle, latch, a round scoop vent in the window, chart pocket, the B-post grab handle.
  for (const sx of [-1, 1]) {
    // Door pull handle (lever pointing forward) under the window's rear edge.
    const hl = new THREE.Group();
    hl.add(at(rbox(M.metal, S(0.03), S(0.05), S(0.02), S(0.008)), 0, 0, 0));
    hl.add(at(rbox(M.metal, S(0.02), S(0.022), S(0.16), S(0.008)), 0, S(-0.01), S(-0.07), 0.12, 0, 0));
    root.add(at(hl, sx * 0.0172, -0.0045, -0.0035));
    // A red EXIT placard by it.
    const ex = placard(K, 0.09, 0.03, (g, W, H) => { g.fillStyle = '#b3201b'; g.fillRect(0, 0, W, H); paintText(g, 'EXIT ⟵ PULL', W / 2, H / 2, H * 0.55, '#f6f2e6'); });
    root.add(at(ex, sx * 0.0176, -0.0025, -0.0062, 0, -sx * Math.PI / 2, 0));
    // Scoop vent in the door glass.
    const sv = new THREE.Group();
    sv.add(new THREE.Mesh(new THREE.TorusGeometry(S(0.05), S(0.009), 8, 24), K.M.chromeK));
    sv.add(at(new THREE.Mesh(new THREE.SphereGeometry(S(0.045), 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.knob), 0, 0, 0, Math.PI / 2, 0, 0));
    const p = onShell(-0.0085, 0.62, 0.99); p.x *= sx;
    root.add(orient(at(sv, p.x, p.y, p.z), V(0, 0, sx), V(0, 1, 0), V(-sx, 0, 0)));
    // Chart pocket with a folded map sticking out.
    root.add(at(rbox(M.trim, S(0.03), S(0.16), S(0.26), S(0.01)), sx * 0.0168, -0.0145, -0.0105));
    root.add(at(rbox(K.M.enamel, S(0.012), S(0.09), S(0.2), S(0.002)), sx * 0.0166, -0.0118, -0.0108, 0, 0, sx * 0.12));
    // Grab handle on the B-post.
    const a = onShell(0.0006, 0.35, 0.955), b = onShell(0.0006, 0.75, 0.955);
    a.x *= sx; b.x *= sx;
    root.add(grabHandle(K, a, b, V(-sx, 0, 0), 0.03, 0.011));
  }
  // The copilot's headset hangs on the A-post; a flask rides in the copilot door pocket.
  {
    const p = onShell(-0.019, 0.55, 0.95); p.x *= -1;
    root.add(at(headset(K), p.x + S(0.02), p.y, p.z + S(0.03), 0, Math.PI / 2, 0));
    root.add(at(flask(K), -0.0162, -0.0185, -0.0125, 0, 0, 0.08));
  }

  // --- Overhead console: circuit breakers and the rotor brake, between the roof windows.
  {
    const zA = -0.0372, zB = -0.0215;
    const yA = onShell(zA, Math.PI / 2, 0.972).y, yB = onShell(zB, Math.PI / 2, 0.972).y;
    const tilt = Math.atan2(yB - yA, zB - zA);
    const len = Math.hypot(zB - zA, yB - yA) / u, wid = 0.17;
    const labels = ['BATT', 'GEN', 'START', 'IGN', 'BOOST', 'FUEL QTY', 'ENG INST', 'XMSN', 'NAV', 'COM 1', 'COM 2', 'XPDR', 'ICS', 'GPS', 'HOOK', 'HOOK REL', 'LDG LT', 'POS LT', 'A/COLL', 'INST LT', 'CABIN LT', 'PITOT', 'CAUT', 'GOV', 'TRIM', 'HTR', 'KETTLE', 'SPARE'];
    const amps = [35, 5, 10, 5, 7.5, 2, 5, 2, 5, 7.5, 7.5, 3, 2, 5, 5, 5, 20, 7.5, 5, 5, 3, 7.5, 2, 5, 3, 10, 15, 5];
    const items = [
      ...breakerItems(0.03, 0.055, 4, 7, 0.037, 0.046, labels, amps, [26]),
      { t: 'label', text: 'CIRCUIT BREAKERS', x: wid / 2, y: 0.02, size: 0.0085 },
      { t: 'box', x: 0.008, y: 0.03, w: wid - 0.016, h: 0.335 },
      { t: 'toggle', x: 0.045, y: 0.405, label: 'DOME', top: 'ON', bottom: 'OFF' },
      { t: 'toggle', x: 0.125, y: 0.405, label: 'MAP', top: 'BRT', bottom: 'OFF' },
      { t: 'label', text: 'ROTOR BRAKE', x: wid / 2, y: len - 0.022, size: 0.0075, color: '#e8b54a' },
    ];
    const pnl = switchPanel(K, { w: wid, h: len, depth: 0.05, theme: 'grey', items });
    const mid = V(0, (yA + yB) / 2 - S(0.03), (zA + zB) / 2);
    pnl.position.copy(mid);
    pnl.rotation.x = Math.PI / 2 - tilt;
    root.add(pnl);
    // Rotor brake: a red T-handle hanging at the aft end of the console.
    const rb = lever(K, 0.045, M.red, { r: 0.005, knob: 0.014, t: true });
    root.add(at(rb, 0, yB - S(0.03), zB - S(0.045), Math.PI, 0, 0));
    // Map lights either side of the console.
    for (const sx of [-1, 1]) root.add(at(mapLight(K, 0.6), sx * S(0.1), yA - S(0.035), zA + S(0.1), -0.6, sx * 0.5, 0));
  }

  // --- Radio stack on the pedestal (audio panel, comm/nav, transponder, GPS, cabin heat and fuel).
  {
    const g = new THREE.Group();
    const w = 0.205;
    const stack = [
      AUDIO(w), COMNAV(w), XPDR(w), GPS(w),
      { w, h: 0.125, theme: 'grey', items: [
        { t: 'knob', x: 0.045, y: 0.04, r: 0.013, label: 'CABIN HEAT', pos: -0.5 },
        { t: 'knob', x: 0.16, y: 0.04, r: 0.013, label: 'DEFROST', pos: 0.9 },
        { t: 'rotary', x: 0.1, y: 0.092, r: 0.014, stops: ['OFF', 'ON'], pos: 0.78, label: 'FUEL VALVE' },
        { t: 'stripe', x: 0.004, y: 0.118, w: w - 0.008, h: 0.004, color: '#c9a21c' },
      ] },
    ];
    let y = 0.205;
    for (const sp of stack) {
      const p = switchPanel(K, { ...sp, depth: 0.012 });
      p.position.set(0, S(y - sp.h / 2), S(0.004));
      g.add(p);
      y -= sp.h + 0.002;
    }
    g.position.set(0, -0.0187, -0.0347);   // the pedestal's sloping face
    g.rotation.x = -0.655;
    root.add(g);
    // A tin mug of tea in a holder on the left of the pedestal.
    root.add(at(mugHolder(K), -0.0052, -0.0212, -0.0318, 0, -0.3, 0));
  }

  // --- Switch strips under the instrument panel, either side of the pedestal.
  {
    const sw = (x, label, top = 'ON', bottom = 'OFF', down = false) => ({ t: 'toggle', x, y: 0.04, label, top, bottom, down, size: 0.0058 });
    const strips = [
      { x: 0.0102, w: 0.38, items: [sw(0.03, 'BATT'), sw(0.075, 'GEN'), sw(0.12, 'BOOST'), sw(0.165, 'GOV', 'AUTO', 'MAN'),
        { t: 'guard', x: 0.215, y: 0.04, label: 'HOOK ARM', top: 'ARM', bottom: 'SAFE', down: true, size: 0.0058 }, sw(0.265, 'PITOT HT'), sw(0.31, 'A/COLL'), sw(0.355, 'POS LT')] },
      { x: -0.0087, w: 0.27, items: [sw(0.03, 'LDG LT', 'ON', 'OFF', true), { t: 'knob', x: 0.085, y: 0.032, r: 0.009, label: 'INST LT', pos: -0.9, size: 0.005 },
        { t: 'lamp', x: 0.15, y: 0.032, w: 0.05, h: 0.022, label: 'ROTOR\nRPM', color: '#d8382c' }, { t: 'lamp', x: 0.225, y: 0.032, w: 0.05, h: 0.022, label: 'ENG\nOUT', color: '#d8382c' }] },
    ];
    for (const st of strips) {
      const p = switchPanel(K, { w: st.w, h: 0.062, depth: 0.02, theme: 'grey', items: st.items });
      p.position.set(st.x, -0.01509, -0.03954);
      p.rotation.x = -0.3;
      root.add(p);
    }
  }

  // --- Floor: the extinguisher between the pilot's seat and door, pedal guard, heater outlets.
  root.add(at(extinguisher(K), 0.0159, floorY + S(0.01), -0.0035));
  for (const sx of [-1, 1]) root.add(at(rbox(M.metal, S(0.2), S(0.012), S(0.03), S(0.004)), sx * 0.0085, floorY + S(0.06), -0.0345));
}
