import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  mergeBaked, V, rod, rbox, at, tubeAlong, switchPanel, breakerItems, seat, extinguisher, headset, mugHolder, placard, lever, paintText,
} from './cockpitKit.js';
import { quiltTexture, COMNAV, XPDR } from './cockpitDetail.js';

// The Chinook's (CH-47F-style) cockpit fittings and the cabin behind it. Body coordinates, model scale;
// parts sized in full-size metres through the kit (K.u).

// Superellipse section point (as the fuselage lofts use).
export function superPoint(sec, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const n = s >= 0 ? sec.nTop : sec.nBot;
  const x = sec.hw * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
  const mid = (sec.yt + sec.yb) / 2, hh = (sec.yt - sec.yb) / 2;
  return [x, mid + hh * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)];
}
// A lofted inner wall (faces inward) along z0..z1 for a constant section, with light(x, y, z) baked into
// vertex colours (the cabin is unlit, MeshBasic with baked light, so the sun never shines through the
// roof of a closed hull).
function cabinWall(sec, z0, z1, nz, na, light, rep = [8, 4]) {
  const pos = [], uv = [], col = [], idx = [];
  for (let j = 0; j <= nz; j++) for (let i = 0; i <= na; i++) {
    const a = -Math.PI / 2 + i / na * Math.PI * 2, z = z0 + (z1 - z0) * j / nz;
    const [x, y] = superPoint(sec, a);
    pos.push(x, y, z); uv.push(i / na * rep[0], j / nz * rep[1]);
    const l = light(x, y, z); col.push(l, l, l * 0.97);
  }
  for (let j = 0; j < nz; j++) for (let i = 0; i < na; i++) {
    const a = j * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  return g;
}
// Bake light into a geometry's vertex colours.
function bake(geo, light, tint = [1, 1, 1]) {
  const p = geo.attributes.position, c = new Float32Array(p.count * 3);
  for (let k = 0; k < p.count; k++) { const l = light(p.getX(k), p.getY(k), p.getZ(k)); c[k * 3] = l * tint[0]; c[k * 3 + 1] = l * tint[1]; c[k * 3 + 2] = l * tint[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return geo;
}
function mergeG(list) {
  return mergeGeometries(list.map((x) => (x.index ? x.toNonIndexed() : x)).map((x) => {
    for (const n of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(n)) x.deleteAttribute(n);
    if (!x.attributes.uv) x.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(x.attributes.position.count * 2), 2));
    return x;
  }), false);
}
function bulkheadShape(sec, floor, k) {
  const pts = [];
  for (let i = 0; i <= 48; i++) { const a = -Math.PI / 2 + i / 48 * Math.PI * 2; const [x, y] = superPoint(sec, a); pts.push(new THREE.Vector2(x * k, Math.max(floor, y * k))); }
  return new THREE.ShapeGeometry(new THREE.Shape(pts), 2);
}
function treadPlate() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#9a9c96'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 64; y += 16) for (let x = 0; x < 64; x += 16) { g.save(); g.translate(x + 8 + (y % 32 ? 8 : 0), y + 8); g.rotate((y % 32 ? 1 : -1) * 0.8); g.fillRect(-5, -1.2, 10, 2.4); g.restore(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 30);
  return t;
}

// ctx: { shellPoint(a, z) -> [x, y] on the nose shell, hooks: CFG.chinook.hooks }.
export function detailChinook(K, root, ctx) {
  const { u, M } = K;
  const S = (v) => v * u;
  const floorY = -0.0046;
  const { shellPoint } = ctx;

  // --- Armoured crew seats with headrests.
  for (const sx of [-1, 1]) {
    const s = seat(K, { style: 'armoured', w: 0.5, seatH: 0.44, backH: 0.75, depth: 0.52, recline: 0.12, harness: 'none', armourMat: K.M.armour });
    root.add(at(s, sx * 0.0072, floorY, -0.0720));
  }

  // --- Centre console: two CDUs, AFCS and radio heads, the cargo hook panel and a mug of tea.
  {
    const w = 0.5, g = new THREE.Group();
    const cdu = () => ({ w: 0.235, h: 0.27, theme: 'black', items: [
      { t: 'display', x: 0.02, y: 0.015, w: 0.195, h: 0.075, text: 'HOOK 2 RDY', color: '#59e07c' },
      { t: 'keys', x: 0.02, y: 0.105, kw: 0.026, kh: 0.018, gap: 0.0045, rows: ['ABCDEF', 'GHIJKL', 'MNOPQR', 'STUVWX', '123456', '7890./'] },
    ] });
    const panels = [
      [cdu(), -0.12, 0.135], [cdu(), 0.12, 0.135],
      [{ w, h: 0.11, theme: 'olive', title: 'AFCS', items: ['SYS 1', 'SYS 2', 'HDG', 'ALT', 'HOVER', 'TRIM'].map((l, i) => ({ t: 'push', x: 0.05 + i * 0.08, y: 0.06, w: 0.05, h: 0.026, label: l, color: '#ece6c8', lit: i < 2 || i === 4 })) }, 0, 0.33],
      [{ ...COMNAV(w, '251.300', '138.150'), theme: 'olive' }, 0, 0.43],
      [{ ...XPDR(w, '7000'), theme: 'olive' }, 0, 0.505],
      [{ w, h: 0.15, theme: 'olive', title: 'CARGO HOOKS', items: [
        { t: 'rotary', x: 0.08, y: 0.07, r: 0.016, stops: ['OFF', 'FWD', 'CTR', 'AFT', 'ALL'], pos: 0.4, label: 'MASTER' },
        { t: 'guard', x: 0.2, y: 0.07, label: 'EMER REL', top: 'REL', bottom: 'NORM', down: true },
        { t: 'guard', x: 0.29, y: 0.07, label: 'HOOK REL', top: 'REL', bottom: 'NORM', down: true },
        { t: 'lamp', x: 0.4, y: 0.06, w: 0.07, h: 0.03, label: 'HOOK\nOPEN', color: '#e8a623' },
        { t: 'lamp', x: 0.4, y: 0.105, w: 0.07, h: 0.03, label: 'LOAD\nON', color: '#41c86a', lit: true },
      ] }, 0, 0.62],
      [{ w, h: 0.2, theme: 'olive', title: 'LIGHTING', items: [
        { t: 'knob', x: 0.07, y: 0.08, r: 0.012, label: 'PNL', pos: 0.6 },
        { t: 'knob', x: 0.16, y: 0.08, r: 0.012, label: 'CONSOLE', pos: 0.2 },
        { t: 'knob', x: 0.25, y: 0.08, r: 0.012, label: 'FLOOD', pos: -1 },
        { t: 'toggle', x: 0.35, y: 0.09, label: 'NVG', top: 'NVG', bottom: 'NORM', down: true },
        { t: 'toggle', x: 0.43, y: 0.09, label: 'CABIN', top: 'WHT', bottom: 'RED' },
      ] }, 0, 0.82],
    ];
    for (const [sp, x, y] of panels) {
      const p = switchPanel(K, { ...sp, depth: 0.015 });
      p.position.set(S(x), S(0.5 - y), S(0.002));
      g.add(p);
    }
    g.position.set(0, 0.00055, -0.0722);
    g.rotation.x = -Math.PI / 2;
    root.add(g);
    root.add(at(mugHolder(K), 0.0024, 0.00055, -0.0672, 0, 0.4, 0));
  }

  // --- Overhead console: fuel, engine condition levers, APU, anti-ice, lights and breakers.
  {
    const w = 0.62, len = 0.94, g = new THREE.Group();
    const items = [
      { t: 'label', text: 'FUEL', x: 0.12, y: 0.03, size: 0.01 },
      ...['L FWD', 'L AFT', 'R FWD', 'R AFT'].map((l, i) => ({ t: 'toggle', x: 0.04 + i * 0.055, y: 0.08, label: l, top: 'ON', bottom: 'OFF' })),
      { t: 'toggle', x: 0.04, y: 0.15, label: 'X-FEED', top: 'OPEN', bottom: 'CLOSE', down: true },
      { t: 'guard', x: 0.13, y: 0.15, label: 'REFUEL', top: 'ON', bottom: 'OFF', down: true },
      { t: 'box', x: 0.012, y: 0.025, w: 0.235, h: 0.17 },
      { t: 'label', text: 'ENGINE CONDITION', x: w / 2, y: 0.24, size: 0.01 },
      { t: 'box', x: 0.012, y: 0.235, w: w - 0.024, h: 0.24 },
      { t: 'label', text: 'STOP   GND   FLT', x: 0.2, y: 0.45, size: 0.008, color: '#e8b54a' },
      { t: 'label', text: 'STOP   GND   FLT', x: 0.42, y: 0.45, size: 0.008, color: '#e8b54a' },
      { t: 'label', text: 'APU', x: 0.52, y: 0.03, size: 0.01 },
      { t: 'rotary', x: 0.52, y: 0.1, r: 0.014, stops: ['OFF', 'RUN', 'START'], pos: 0 },
      { t: 'lamp', x: 0.52, y: 0.17, w: 0.06, h: 0.022, label: 'APU ON', color: '#41c86a' },
      { t: 'box', x: 0.43, y: 0.025, w: 0.18, h: 0.17 },
      { t: 'label', text: 'ANTI-ICE', x: 0.33, y: 0.03, size: 0.009 },
      { t: 'toggle', x: 0.3, y: 0.09, label: 'PITOT', top: 'ON', bottom: 'OFF' },
      { t: 'toggle', x: 0.37, y: 0.09, label: 'WSHLD', top: 'ON', bottom: 'OFF', down: true },
      { t: 'label', text: 'LIGHTS', x: w / 2, y: 0.51, size: 0.01 },
      ...['POS', 'A/COLL', 'FORM', 'SEARCH', 'HOOK FLOOD', 'CABIN'].map((l, i) => ({ t: 'toggle', x: 0.06 + i * 0.1, y: 0.565, label: l, top: 'ON', bottom: 'OFF', down: i === 3 })),
      { t: 'box', x: 0.012, y: 0.505, w: w - 0.024, h: 0.1 },
      ...breakerItems(0.05, 0.67, 10, 5, 0.056, 0.05, ['HYD 1', 'HYD 2', 'UTIL', 'AFCS 1', 'AFCS 2', 'CDU 1', 'CDU 2', 'MFD 1', 'MFD 2', 'MFD 3', 'RAD 1', 'RAD 2', 'IFF', 'HOOK FWD', 'HOOK CTR', 'HOOK AFT', 'HOIST', 'WIPER', 'ICS', 'GALLEY'], [5, 5, 7.5, 3, 3, 2, 2, 5, 5, 5], [17]),
    ];
    g.add(switchPanel(K, { w, h: len, depth: 0.08, theme: 'olive', items }));
    // The two engine condition levers in their quadrant slots.
    for (const x of [0.2, 0.42]) {
      const lv = lever(K, 0.11, K.M.stripe, { r: 0.008, knob: 0.018, t: true });
      lv.position.set(S(x - w / 2), S(len / 2 - 0.35), 0);
      lv.rotation.set(Math.PI / 2 - 0.25, 0, 0);
      g.add(lv);
      g.add(at(rbox(M.cushionEdge, S(0.018), S(0.2), S(0.01)), S(x - w / 2), S(len / 2 - 0.355), S(0.001)));
    }
    g.position.set(0, 0.01545, -0.0718);
    g.rotation.x = Math.PI / 2;
    root.add(g);
  }

  // --- Jettison handles on the side windows, and the windscreen wipers just outside the glass.
  for (const sx of [-1, 1]) {
    const p = shellPoint(sx > 0 ? 0.52 : Math.PI - 0.52, -0.0662);
    const h = new THREE.Group();
    h.add(rbox(K.M.stripe, S(0.03), S(0.03), S(0.22), S(0.01)));
    h.add(at(rbox(M.metal, S(0.02), S(0.05), S(0.02), S(0.006)), 0, 0, S(0.1)));
    h.add(at(rbox(M.metal, S(0.02), S(0.05), S(0.02), S(0.006)), 0, 0, S(-0.1)));
    root.add(at(h, p[0] * 0.95, p[1] * 0.97, -0.0662));
    const pl = placard(K, 0.16, 0.04, (g, W, H) => { g.fillStyle = '#141414'; g.fillRect(0, 0, W, H); paintText(g, 'EMER EXIT  PULL', W / 2, H / 2, H * 0.5, '#e8b54a'); });
    root.add(at(pl, p[0] * 0.945, p[1] * 0.97 - S(0.05), -0.0662, 0, -sx * Math.PI / 2, 0));
    // Wiper: a parked arm and blade along the base of each front windscreen.
    const wp = new THREE.Group();
    const base = shellPoint(sx > 0 ? 0.3 : Math.PI - 0.3, -0.0815);
    wp.add(rod(M.knob, V(0, 0, 0), V(-sx * S(0.55), S(0.12), S(-0.05)), S(0.008)));
    wp.add(rod(M.cushionEdge, V(-sx * S(0.25), S(0.06), S(-0.03)), V(-sx * S(0.9), S(0.2), S(-0.1)), S(0.006)));
    root.add(at(wp, base[0] * 1.01, base[1] * 1.02, -0.0815 - S(0.04)));
  }

  // --- Bulkhead behind the seats: power distribution panels either side of the companionway, an
  // extinguisher and a crew headset.
  for (const sx of [-1, 1]) {
    const labels = ['AC BUS', 'DC BUS', 'ESS', 'BATT', 'XFMR', 'INV', 'FUEL', 'PUMP', 'QTY', 'FIRE', 'DET', 'EXT', 'HOOK', 'HOIST', 'LDG', 'SRCH', 'NAV', 'COM', 'IFF', 'ICS', 'CDU', 'MFD', 'AHRS', 'EGI', 'WSHLD', 'PITOT', 'BLADE', 'ENG', 'START', 'IGN'];
    const p = switchPanel(K, { w: 0.5, h: 0.62, depth: 0.03, theme: 'olive', title: sx > 0 ? 'NO. 1 PDP' : 'NO. 2 PDP',
      items: breakerItems(0.04, 0.06, 8, 9, 0.06, 0.062, labels, [5, 7.5, 10, 2, 3, 5, 15, 20, 35, 2], sx > 0 ? [11, 40] : [57]) });
    root.add(at(p, sx * (0.0036 + S(0.3)), 0.0055, -0.0628, 0, Math.PI, 0));
  }
  root.add(at(extinguisher(K, 0.4, 0.05), -0.0118, floorY + S(0.02), -0.0638));
  root.add(at(headset(K, 0x3b4230), 0.0115, 0.0122, -0.0636, 0, Math.PI, 0));
  // Companionway frame, striped like the real thing's edge guards.
  root.add(tubeAlong(K.M.stripe, [V(-0.0036, floorY, -0.0627), V(-0.0036, 0.0101, -0.0627), V(0.0036, 0.0101, -0.0627), V(0.0036, floorY, -0.0627)], S(0.025), false, 6));
  root.add(cabin(K, ctx));
}

// The cabin behind the cockpit, seen through the companionway: quilted walls on ribbed frames, red
// troop seats, daylight in the windows, roller tracks and the centre hook hatch, unlit (baked).
function cabin(K, ctx) {
  const { u } = K;
  const S = (v) => v * u;
  const g = new THREE.Group();
  const sec = { hw: 0.0192, yb: -0.0175, yt: 0.0205, nTop: 3.6, nBot: 6 };
  const floor = -0.0108, z0 = -0.0626, z1 = 0.058;
  const ports = [-0.034, -0.017, 0, 0.017, 0.034];
  const hz = ctx.hooks[1][2];
  // Light: a dim olive gloom, brighter near the windows and under the dome lights.
  const light = (x, y, z) => {
    let l = 0.2 + 0.08 * THREE.MathUtils.clamp((y - floor) / 0.03, 0, 1);
    for (const pz of ports) { const d = Math.hypot(z - pz, (Math.abs(x) - 0.019) * 1.4, y - 0.006); l += 0.5 * Math.exp(-d * d / 0.00012); }
    for (const lz of [-0.04, -0.01, 0.02, 0.048]) { const d = Math.hypot(x, y - 0.019, z - lz); l += 0.35 * Math.exp(-d * d / 0.00009); }
    const hk = Math.hypot(x, z - hz, (y - floor) * 2); l += 0.45 * Math.exp(-hk * hk / 0.00005);
    return Math.min(1.25, l);
  };
  const basic = (opts) => new THREE.MeshBasicMaterial({ vertexColors: true, ...opts });
  const quiltMap = quiltTexture('#8a8466', [1, 1]);
  g.add(new THREE.Mesh(cabinWall(sec, z0, z1, 30, 48, light, [22, 6]), basic({ map: quiltMap, side: THREE.BackSide })));
  // Floor plate with two roller tracks and the open centre-hook hatch.
  const track = basic({ color: 0x3a3c38 });
  {
    g.add(new THREE.Mesh(bake(new THREE.PlaneGeometry(0.0372, z1 - z0, 8, 30).rotateX(-Math.PI / 2).translate(0, floor, (z0 + z1) / 2), light, [0.85, 0.86, 0.8]), basic({ map: treadPlate(), color: 0x8b8f86 })));
    const geoT = [], geoR = [];
    for (const x of [-0.0065, 0.0065]) {
      geoT.push(new THREE.BoxGeometry(S(0.15), S(0.03), z1 - z0 - 0.004).translate(x, floor + S(0.015), (z0 + z1) / 2 + 0.002));
      for (let z = z0 + 0.004; z < z1 - 0.004; z += S(0.3)) geoR.push(new THREE.CylinderGeometry(S(0.03), S(0.03), S(0.12), 8).rotateZ(Math.PI / 2).translate(x, floor + S(0.035), z));
    }
    g.add(new THREE.Mesh(bake(mergeG(geoT), light), track));
    g.add(new THREE.Mesh(bake(mergeG(geoR), light), basic({ color: 0x9a9c98 })));
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(S(0.75), S(0.75)).rotateX(-Math.PI / 2).translate(0, floor + S(0.004), hz), new THREE.MeshBasicMaterial({ color: 0xcfd8c8 })));
    g.add(new THREE.Mesh(bake(mergeG([-1, 1].flatMap((s) => [new THREE.BoxGeometry(S(0.85), S(0.08), S(0.05)).translate(0, floor + S(0.04), hz + s * S(0.4)), new THREE.BoxGeometry(S(0.05), S(0.08), S(0.85)).translate(s * S(0.4), floor + S(0.04), hz)])), light), track));
  }
  // Frames: ribs round the hull every half metre, and stringers along the walls.
  {
    const geos = [];
    for (let z = z0 + 0.003; z < z1; z += S(0.52)) {
      const pts = [];
      for (let i = 0; i <= 40; i++) { const a = -Math.PI / 2 + i / 40 * Math.PI * 2; const [x, y] = superPoint(sec, a); if (y > floor) pts.push(V(x * 0.985, y * 0.985 + floor * 0.015, z)); }
      geos.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, S(0.045), 4, false));
    }
    for (const a of [0.35, 0.9, Math.PI - 0.9, Math.PI - 0.35]) {
      const [x, y] = superPoint(sec, a);
      geos.push(new THREE.BoxGeometry(S(0.04), S(0.04), z1 - z0).translate(x * 0.98, y * 0.98, (z0 + z1) / 2));
    }
    g.add(new THREE.Mesh(bake(mergeG(geos), light, [0.55, 0.56, 0.48]), basic({ color: 0xb8b8a8 })));
  }
  // Windows: daylight in the portholes (and the crew door window, front right).
  {
    const geos = [], rims = [];
    for (const sx of [-1, 1]) for (const z of ports) {
      geos.push(new THREE.CircleGeometry(S(0.24), 24).rotateY(-sx * Math.PI / 2).translate(sx * 0.0189, 0.006, z));
      rims.push(new THREE.TorusGeometry(S(0.26), S(0.035), 6, 24).rotateY(Math.PI / 2).translate(sx * 0.0186, 0.006, z));
    }
    geos.push(new THREE.PlaneGeometry(S(0.45), S(0.5)).rotateY(-Math.PI / 2).translate(0.0189, 0.008, -0.0525));
    g.add(new THREE.Mesh(mergeG(geos), new THREE.MeshBasicMaterial({ color: 0xe6eef2 })));
    g.add(new THREE.Mesh(bake(mergeG(rims), light, [0.5, 0.5, 0.48]), basic({ color: 0x555850 })));
  }
  // Troop seats: red webbing on tube frames down both walls.
  {
    const wg = [], tg = [];
    for (const sx of [-1, 1]) {
      const xw = sx * 0.0178, xf = sx * (0.0178 - S(0.42)), ys = floor + S(0.42);
      const za = -0.052, zb = 0.044;
      tg.push(new THREE.CylinderGeometry(S(0.018), S(0.018), zb - za, 6).rotateX(Math.PI / 2).translate(xf, ys, (za + zb) / 2));
      tg.push(new THREE.CylinderGeometry(S(0.018), S(0.018), zb - za, 6).rotateX(Math.PI / 2).translate(xw - sx * S(0.05), ys + S(0.62), (za + zb) / 2));
      for (let z = za; z <= zb + 1e-6; z += S(0.55)) tg.push(new THREE.CylinderGeometry(S(0.016), S(0.016), S(0.42), 6).translate(xf, floor + S(0.21), z));
      for (let z = za + S(0.02); z < zb - S(0.2); z += S(0.5)) {
        wg.push(new THREE.BoxGeometry(S(0.4), S(0.015), S(0.44)).translate((xw + xf) / 2, ys, z + S(0.25)));
        wg.push(new THREE.BoxGeometry(S(0.015), S(0.55), S(0.44)).rotateZ(sx * 0.12).translate(xw - sx * S(0.06), ys + S(0.32), z + S(0.25)));
      }
    }
    g.add(new THREE.Mesh(bake(mergeG(wg), light), basic({ map: K.M.webbing.map, color: 0xd04a3a })));
    g.add(new THREE.Mesh(bake(mergeG(tg), light), basic({ color: 0xa8aaa6 })));
  }
  // Ceiling: dome lights, the hydraulic and electrical runs along the roof.
  {
    const lamps = [], runs = [];
    for (const z of [-0.04, -0.01, 0.02, 0.048]) lamps.push(new THREE.CylinderGeometry(S(0.1), S(0.12), S(0.04), 16).translate(0, 0.0198, z));
    g.add(new THREE.Mesh(mergeG(lamps), new THREE.MeshBasicMaterial({ color: 0xfff1d6 })));
    for (const [x, r] of [[-0.004, 0.025], [-0.0034, 0.018], [0.0045, 0.03], [0.0052, 0.015]]) runs.push(new THREE.CylinderGeometry(S(r), S(r), z1 - z0 - 0.004, 6).rotateX(Math.PI / 2).translate(x, 0.0197, (z0 + z1) / 2));
    g.add(new THREE.Mesh(bake(mergeG(runs), light, [0.5, 0.48, 0.42]), basic({ color: 0xa09a80 })));
  }
  // Aft end: the closed ramp with a sliver of daylight under it.
  {
    const end = bulkheadShape(sec, floor, 0.92);
    end.translate(0, 0, z1 - 0.0002);
    g.add(new THREE.Mesh(bake(end, light, [0.5, 0.5, 0.45]), basic({ map: quiltMap, side: THREE.DoubleSide })));
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(0.03, S(0.06)).translate(0, floor + S(0.03), z1 - 0.0004), new THREE.MeshBasicMaterial({ color: 0xdfe6e0, side: THREE.DoubleSide })));
  }
  // A step down from the cockpit floor through the companionway.
  g.add(new THREE.Mesh(bake(new THREE.BoxGeometry(0.0072, 0.0031, 0.004).translate(0, -0.0092, -0.0605), light, [0.6, 0.6, 0.55]), track));
  // Phones: the whole cabin as one unlit vertex-coloured mesh (its quilting and webbing textures dropped).
  if (K.slim) mergeBaked(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }), { textured: true });
  g.traverse((o) => { if (o.isMesh) { o.userData.keep = true; o.userData.noShadow = true; } });
  return g;
}
