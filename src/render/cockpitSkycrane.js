import * as THREE from 'three';
import {
  V, rod, rbox, at, tubeAlong, switchPanel, breakerItems, seat, extinguisher, headset, mugHolder, flask, placard, lever, paintText, grabHandle, mapLight,
} from './cockpitKit.js';
import { AUDIO, COMNAV, XPDR, orient, shellPatch, patchOutline, pleatTexture } from './cockpitDetail.js';
import { skyCabPoint, skyCabSection } from './skycraneModel.js';

// The skycrane's (S-64-style) cab fittings: window frames that follow the lofted cab, the copilot's
// switch panel, the pedestal with radios and the tank controls, the overhead console, crew seats, the
// aft-facing pilot's station looking back through its own window at the load, and the door hardware.

// Shell point helper in the (z, a, inset) form the micro uses.
export const skyOnShell = (z, a, inset = 0.975) => skyCabPoint(z, a, inset);

// A window frame loop on the cab between stations z0..z1 and section angles a0..a1 (right side; the
// left is mirrored).
function frameLoop(z0, z1, a0, a1, sx, inset = 0.972, n = 6) {
  return patchOutline(skyOnShell, z0, z1, a0, a1, inset, sx, n);
}
// Half-width of the cab at height y and station z (for the floor outline).
function halfWidthAt(z, y) {
  const s = skyCabSection(z);
  const mid = (s.yt + s.yb) / 2, hh = (s.yt - s.yb) / 2;
  const t = (y - mid) / hh;
  if (Math.abs(t) >= 1) return 0;
  const n = t >= 0 ? s.nTop : s.nBot;
  const sn = Math.sign(t) * Math.pow(Math.abs(t), n / 2);
  const c = Math.sqrt(Math.max(0, 1 - sn * sn));
  return s.hw * Math.pow(c, 2 / n);
}

export function detailSkycrane(K, root, P) {
  const { u, M } = K;
  const S = (v) => v * u;
  const floorY = -0.0018;

  // --- Window frames: windscreen centre post and bow, door, roof, chin and aft window surrounds.
  {
    const posts = [];
    const centre = [];
    for (let z = -0.0862; z <= -0.0745; z += 0.0008) centre.push(skyOnShell(z, Math.PI / 2, 0.97));
    posts.push(tubeAlong(M.post, centre, S(0.03)));
    const bow = [];
    for (let a = -0.12; a <= Math.PI + 0.12 + 1e-6; a += Math.PI / 24) bow.push(skyOnShell(-0.0746, a, 0.968));
    posts.push(tubeAlong(M.post, bow, S(0.04)));
    for (const sx of [-1, 1]) {
      posts.push(tubeAlong(M.post, frameLoop(-0.0727, -0.0605, -0.06, 0.835, sx), S(0.03), true, 6));     // door window
      posts.push(tubeAlong(M.seal, frameLoop(-0.0832, -0.0758, -0.9, -0.262, sx, 0.972), S(0.018), true, 5)); // chin window
      posts.push(tubeAlong(M.seal, frameLoop(-0.0536, -0.0472, -1.18, -0.12, sx, 0.97), S(0.02), true, 5));   // aft window
      // Windscreen sill along the bottom of the front panes.
      const sill = [];
      for (let z = -0.0838; z <= -0.0745; z += 0.0008) { const p = skyOnShell(z, -0.07, 0.97); p.x *= sx; sill.push(p); }
      posts.push(tubeAlong(M.post, sill, S(0.03)));
      // Door seam round the whole crew door.
      posts.push(tubeAlong(M.seal, frameLoop(-0.0732, -0.0598, -0.62, 0.86, sx, 0.976), S(0.012), true, 5));
    }
    posts.push(tubeAlong(M.post, frameLoop(-0.0729, -0.0617, 0.96, Math.PI - 0.96, 1, 0.97), S(0.03), true, 6));   // roof windows
    for (const p of posts) root.add(p);
  }

  // --- Floor following the cab, with the aft-station footwell step.
  {
    const pts = [];
    for (let z = -0.0815; z <= -0.0545 + 1e-6; z += 0.0015) pts.push(new THREE.Vector2(halfWidthAt(z, floorY) * 0.97, -z));
    for (let z = -0.0545; z >= -0.0815 - 1e-6; z -= 0.0015) pts.push(new THREE.Vector2(-halfWidthAt(z, floorY) * 0.97, -z));
    const g = new THREE.ShapeGeometry(new THREE.Shape(pts.reverse()), 1).rotateX(-Math.PI / 2).translate(0, floorY, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) * 120, p.getZ(k) * 120);
    root.add(new THREE.Mesh(g, M.floor));
  }

  // --- Crew seats and the aft-facing station.
  for (const sx of [-1, 1]) {
    const s = seat(K, { style: 'bucket', w: 0.48, seatH: 0.4, backH: 0.72, depth: 0.55, recline: 0.12, harness: 'none', cushionMat: M.seat });
    root.add(at(s, sx * 0.0048, floorY, -0.0688));
  }
  {
    const s = seat(K, { style: 'bucket', w: 0.46, seatH: 0.38, backH: 0.66, depth: 0.46, recline: 0.08, harness: 'laid', cushionMat: M.seat });
    root.add(at(s, -0.0036, floorY, -0.0522, 0, Math.PI, 0));
    // Its side-stick on an armrest and a small panel over its window: hook, hose, pump and doors.
    root.add(at(rbox(M.trim, S(0.08), S(0.06), S(0.36), S(0.02)), -0.0036 - S(0.3), floorY + S(0.62), -0.0545));
    const st = lever(K, 0.16, M.stick, { r: 0.012, knob: 0.03 });
    root.add(at(st, -0.0036 - S(0.3), floorY + S(0.65), -0.0528, 0.15, 0, 0));
    const items = [
      { t: 'label', text: 'AFT STATION', x: 0.17, y: 0.018, size: 0.009 },
      { t: 'toggle', x: 0.04, y: 0.075, label: 'CONTROL', top: 'AFT', bottom: 'FWD', down: true },
      { t: 'guard', x: 0.11, y: 0.075, label: 'HOOK REL', top: 'REL', bottom: 'NORM', down: true },
      { t: 'toggle', x: 0.18, y: 0.075, label: 'HOSE', top: 'UP', bottom: 'DOWN' },
      { t: 'toggle', x: 0.25, y: 0.075, label: 'PUMP', top: 'ON', bottom: 'OFF', down: true },
      { t: 'lamp', x: 0.06, y: 0.135, w: 0.07, h: 0.026, label: 'DOORS\nOPEN', color: '#e8a623' },
      { t: 'lamp', x: 0.15, y: 0.135, w: 0.07, h: 0.026, label: 'TANK\nFULL', color: '#41c86a' },
      { t: 'lamp', x: 0.24, y: 0.135, w: 0.07, h: 0.026, label: 'HOOK\nLOAD', color: '#41c86a' },
    ];
    const pnl = switchPanel(K, { w: 0.32, h: 0.17, depth: 0.04, theme: 'grey', items });
    root.add(at(pnl, -0.0036, 0.0058, -0.0492, 0.35, Math.PI, 0));
  }

  // --- Copilot's switch panel beside the instruments: engines, fuel and the caution lights.
  {
    const items = [
      { t: 'label', text: 'ENGINES', x: 0.15, y: 0.02, size: 0.009 },
      { t: 'toggle', x: 0.05, y: 0.07, label: 'ENG 1', top: 'RUN', bottom: 'OFF' },
      { t: 'toggle', x: 0.12, y: 0.07, label: 'ENG 2', top: 'RUN', bottom: 'OFF' },
      { t: 'guard', x: 0.2, y: 0.07, label: 'FIRE 1', top: 'ARM', bottom: 'OFF', down: true },
      { t: 'guard', x: 0.27, y: 0.07, label: 'FIRE 2', top: 'ARM', bottom: 'OFF', down: true },
      { t: 'box', x: 0.01, y: 0.015, w: 0.3, h: 0.1 },
      { t: 'label', text: 'FUEL', x: 0.42, y: 0.02, size: 0.009 },
      { t: 'toggle', x: 0.36, y: 0.07, label: 'BOOST 1', top: 'ON', bottom: 'OFF' },
      { t: 'toggle', x: 0.43, y: 0.07, label: 'BOOST 2', top: 'ON', bottom: 'OFF' },
      { t: 'toggle', x: 0.5, y: 0.07, label: 'X-FEED', top: 'OPEN', bottom: 'CLOSE', down: true },
      { t: 'box', x: 0.325, y: 0.015, w: 0.21, h: 0.1 },
      ...['ENG 1\nOUT', 'ENG 2\nOUT', 'XMSN\nOIL', 'XMSN\nHOT', 'LOW\nFUEL', 'HYD\nPRESS', 'CHIP\nDET', 'TANK\nFULL'].map((l, i) => ({ t: 'lamp', x: 0.06 + (i % 4) * 0.075, y: 0.17 + Math.floor(i / 4) * 0.045, w: 0.062, h: 0.034, label: l, color: i === 7 ? '#41c86a' : i < 4 ? '#d8382c' : '#e8a623' })),
      { t: 'knob', x: 0.43, y: 0.2, r: 0.016, label: 'PNL LT', pos: 0.4 },
      { t: 'push', x: 0.43, y: 0.262, w: 0.06, h: 0.022, label: 'TEST', color: '#d8d6cc' },
    ];
    const pnl = switchPanel(K, { w: 0.56, h: 0.3, depth: 0.03, theme: 'grey', items });
    root.add(at(pnl, P.x - P.w / 2 - S(0.29), P.y, P.z, -0.2, 0, 0));
  }

  // --- Pedestal: radios and the tank controls on a slope from the panel down to the floor.
  {
    const top = V(0, P.y - P.h / 2 - 0.0003, P.z + 0.0004), bot = V(0, floorY, -0.0668);
    const len = top.distanceTo(bot), ang = Math.atan2(bot.z - top.z, top.y - bot.y);
    const mid = top.clone().lerp(bot, 0.5);
    const w = 0.36;
    const g = new THREE.Group();
    g.add(at(rbox(M.panelBody, S(w + 0.03), len, S(0.4), S(0.02)), 0, 0, -S(0.2)));
    const tank = { w, h: 0.17, theme: 'grey', title: 'TANK', items: [
      { t: 'toggle', x: 0.05, y: 0.06, label: 'PUMP', top: 'ON', bottom: 'OFF', down: true },
      { t: 'rotary', x: 0.15, y: 0.065, r: 0.014, stops: ['SHUT', 'TRICKLE', 'OPEN'], pos: -0.78, label: 'DOORS' },
      { t: 'guard', x: 0.26, y: 0.06, label: 'SALVO', top: 'DUMP', bottom: 'SAFE', down: true },
      { t: 'toggle', x: 0.33, y: 0.06, label: 'HOSE', top: 'UP', bottom: 'DOWN' },
      { t: 'push', x: 0.09, y: 0.14, w: 0.07, h: 0.026, label: 'AUTO FILL', color: '#41c86a' },
      { t: 'lamp', x: 0.19, y: 0.14, w: 0.07, h: 0.026, label: 'INTAKE\nWET', color: '#5cb8e6' },
      { t: 'lamp', x: 0.29, y: 0.14, w: 0.07, h: 0.026, label: 'DOORS\nOPEN', color: '#e8a623' },
    ] };
    const stack = [AUDIO(w), COMNAV(w), XPDR(w), tank, { w, h: 0.12, theme: 'grey', items: [
      { t: 'knob', x: 0.07, y: 0.045, r: 0.013, label: 'CABIN HEAT', pos: -0.5 },
      { t: 'knob', x: 0.18, y: 0.045, r: 0.013, label: 'DEFOG', pos: 0.9 },
      { t: 'rotary', x: 0.29, y: 0.05, r: 0.013, stops: ['OFF', 'LO', 'HI'], pos: 0, label: 'WIPERS' },
    ] }];
    let y = len / u / 2 - 0.02;
    for (const sp of stack) {
      const p = switchPanel(K, { ...sp, depth: 0.01 });
      p.position.set(0, S(y - sp.h / 2), S(0.003));
      g.add(p);
      y -= sp.h + 0.004;
    }
    g.position.copy(mid);
    g.rotation.x = -ang;
    root.add(g);
    root.add(at(mugHolder(K), -0.0026, 0.0012, -0.0688, 0, -0.4, 0));
  }

  // --- Overhead console between the roof windows: breakers, rotor brake, lights.
  {
    const zA = -0.0742, zB = -0.0622;
    const yA = skyOnShell(zA, Math.PI / 2, 0.972).y, yB = skyOnShell(zB, Math.PI / 2, 0.972).y;
    const tilt = Math.atan2(yB - yA, zB - zA);
    const len = Math.hypot(zB - zA, yB - yA) / u, wid = 0.26;
    const labels = ['GEN 1', 'GEN 2', 'BATT', 'START 1', 'START 2', 'IGN 1', 'IGN 2', 'FUEL 1', 'FUEL 2', 'PUMP', 'DOORS', 'HOSE', 'HOOK', 'NAV', 'COM', 'XPDR', 'ICS', 'ADI', 'GYRO', 'WIPER', 'LDG LT', 'POS LT', 'BCN', 'KETTLE'];
    const items = [
      { t: 'label', text: 'CIRCUIT BREAKERS', x: wid / 2, y: 0.03, size: 0.01 },
      ...breakerItems(0.035, 0.08, 6, 4, 0.038, 0.05, labels, [10, 10, 35, 5, 5, 3, 3, 5, 5, 15, 7.5, 7.5, 5, 3, 3, 3, 2, 3, 3, 5, 15, 7.5, 5, 15], [23]),
      { t: 'label', text: 'LIGHTS', x: wid / 2, y: 0.33, size: 0.009 },
      ...['POS', 'BCN', 'LDG', 'INST', 'DOME'].map((l, i) => ({ t: 'toggle', x: 0.035 + i * 0.048, y: 0.39, label: l, top: 'ON', bottom: 'OFF', down: i === 2 })),
      { t: 'label', text: 'ROTOR BRAKE', x: wid / 2, y: len - 0.03, size: 0.008, color: '#e8b54a' },
    ];
    const pnl = switchPanel(K, { w: wid, h: len, depth: 0.06, theme: 'grey', items });
    pnl.position.set(0, (yA + yB) / 2 - S(0.035), (zA + zB) / 2);
    pnl.rotation.x = Math.PI / 2 - tilt;
    root.add(pnl);
    root.add(at(lever(K, 0.05, M.red, { r: 0.006, knob: 0.016, t: true }), 0, yB - S(0.04), zB - S(0.05), Math.PI, 0, 0));
    for (const sx of [-1, 1]) root.add(at(mapLight(K, 0.7), sx * S(0.16), yA - S(0.05), zA + S(0.25), -0.7, sx * 0.4, 0));
  }

  // --- Doors: upholstered lower panels, handles, exit placards, grab handles; extinguisher, headset.
  {
    const vt = pleatTexture('#55585a');
    const vinyl = new THREE.MeshStandardMaterial({ map: vt, bumpMap: vt, bumpScale: 0.8, roughness: 0.6, side: THREE.DoubleSide });
    for (const sx of [-1, 1]) {
      root.add(shellPatch(skyOnShell, vinyl, -0.0726, -0.0604, -0.5, -0.1, 0.966, sx, 10, 8, [1, 3]));
      root.add(tubeAlong(M.seal, patchOutline(skyOnShell, -0.0726, -0.0604, -0.5, -0.1, 0.964, sx), S(0.01), true, 6));
      const hp = skyOnShell(-0.0615, -0.15, 0.955); hp.x *= sx;
      const hl = new THREE.Group();
      hl.add(rbox(M.metal, S(0.03), S(0.05), S(0.02), S(0.008)));
      hl.add(at(rbox(M.metal, S(0.02), S(0.022), S(0.16), S(0.008)), 0, S(-0.01), S(-0.07), 0.12, 0, 0));
      root.add(at(hl, hp.x, hp.y, hp.z));
      const ex = placard(K, 0.1, 0.03, (g, W, H) => { g.fillStyle = '#b3201b'; g.fillRect(0, 0, W, H); paintText(g, 'EXIT ⟵ PULL', W / 2, H / 2, H * 0.55, '#f6f2e6'); });
      const pp = skyOnShell(-0.0635, -0.08, 0.958); pp.x *= sx;
      root.add(at(ex, pp.x, pp.y, pp.z, 0, -sx * Math.PI / 2, 0));
      const a = skyOnShell(-0.0598, 0.2, 0.955), b = skyOnShell(-0.0598, 0.7, 0.955);
      a.x *= sx; b.x *= sx;
      root.add(grabHandle(K, a, b, V(-sx, 0, 0), 0.03, 0.011));
    }
    root.add(at(extinguisher(K, 0.38, 0.05), 0.0098, floorY + S(0.02), -0.0598));
    const hs = skyOnShell(-0.0596, 0.6, 0.94); hs.x *= -1;
    root.add(at(headset(K, 0x3c3f45), hs.x + S(0.04), hs.y, hs.z + S(0.03), 0, Math.PI / 2, 0));
    root.add(at(flask(K), -0.0108, floorY + S(0.02), -0.0612, 0, 0, 0.06));
  }

  // --- Wipers parked along the base of the windscreen, outside the glass.
  for (const sx of [-1, 1]) {
    const base = skyOnShell(-0.0805, 0.1, 1.012); base.x *= sx;
    const wp = new THREE.Group();
    wp.add(rod(M.knob, V(0, 0, 0), V(-sx * S(0.5), S(0.16), S(-0.12)), S(0.009)));
    wp.add(rod(M.cushionEdge, V(-sx * S(0.2), S(0.07), S(-0.05)), V(-sx * S(0.75), S(0.26), S(-0.2)), S(0.007)));
    root.add(at(wp, base.x, base.y, base.z));
  }
}
