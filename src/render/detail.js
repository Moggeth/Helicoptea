import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROOM, COUNTER, DRESSER, RANGE, TOWEL, LINE, FEEDER, BREADBIN, FRUITBOWL, CADDIES, CADDY, linePoint } from '../sim/layout.js';
import { Batcher, T, boxUV } from './batch.js';
import { glazeMaterial as glazeNew, vesselGeometry, handleGeometry, saucerGeometry } from './models.js';
import { boardTexture } from './gardenTextures.js';
import { HangingCloth } from './cloth.js';

// More of the house and garden: the Welsh dresser, the range cooker with a tea towel on its rail, the
// counter's bread bin, fruit bowl and tea tins, a washing line of tea towels and a bird feeder.
// Static parts are merged by material; the towels are little cloths (see cloth.js).

// One glaze material per colour (so the merge makes one draw call per colour).
const glazes = new Map();
function glazeMaterial(c, opts = {}) { const k = `${c}|${opts.roughness}|${!!opts.extra}`; if (!glazes.has(k)) glazes.set(k, glazeNew(c, opts)); return glazes.get(k); }

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildDetail(scene, quality) {
  const b = new Batcher();
  const fy = ROOM.floorY;
  const rnd = (() => { let s = 7; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

  // ---------------------------------------------------------------- Welsh dresser
  {
    const D = DRESSER, cx = (D.x0 + D.x1) / 2, w = D.x1 - D.x0;
    const oak = new THREE.MeshStandardMaterial({ map: boardTexture(512, [150, 104, 66], true), roughness: 0.6 });
    oak.map.repeat.set(2, 2);
    const knob = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 });
    b.add(boxUV(w, D.baseTop - fy - 0.03, D.z1 - D.z0, 1), oak, T(cx, (D.baseTop - 0.03 + fy) / 2, (D.z0 + D.z1) / 2), 0xe0d0c0);
    b.add(boxUV(w + 0.04, 0.03, D.z1 - D.z0 + 0.03, 1), oak, T(cx, D.baseTop - 0.015, (D.z0 + D.z1) / 2 - 0.015), 0xffffff);
    // Cupboard doors and drawers on the front.
    const fz = D.z0 - 0.005;
    for (let i = 0; i < 3; i++) {
      const x = D.x0 + w * (i + 0.5) / 3;
      b.add(boxUV(w / 3 - 0.03, 0.12, 0.012, 1), oak, T(x, D.baseTop - 0.11, fz), 0xd8c4b0);
      b.add(new THREE.SphereGeometry(0.012, 10, 8), knob, T(x, D.baseTop - 0.11, fz - 0.012));
      if (i !== 1) { b.add(boxUV(w / 3 - 0.03, 0.55, 0.012, 1), oak, T(x, fy + 0.4, fz), 0xd8c4b0); b.add(new THREE.SphereGeometry(0.012, 10, 8), knob, T(x + (i ? -1 : 1) * (w / 6 - 0.04), fy + 0.45, fz - 0.012)); }
      else b.add(boxUV(w / 3 - 0.03, 0.55, 0.012, 1), oak, T(x, fy + 0.4, fz), 0xc8b4a0);
    }
    // Rack: back boards, sides, shelves, cornice.
    b.add(boxUV(w, D.top - D.baseTop, 0.025, 1), oak, T(cx, (D.top + D.baseTop) / 2, D.z1 - 0.0125), 0xc8b8a8);
    for (const x of [D.x0 + 0.0125, D.x1 - 0.0125]) b.add(boxUV(0.025, D.top - D.baseTop, 0.27, 1), oak, T(x, (D.top + D.baseTop) / 2, D.z1 - 0.135));
    b.add(boxUV(w + 0.04, 0.06, 0.3, 1), oak, T(cx, D.top - 0.03, D.z1 - 0.15));
    b.add(boxUV(w + 0.07, 0.025, 0.33, 1), oak, T(cx, D.top + 0.012, D.z1 - 0.16), 0xe8d8c8);
    // Shelves with plates standing in a groove, and cups on hooks under each.
    // Blue-and-white transfer ware: a fretwork border, a ring, and a little willow-pattern scene in the well
    // (willow tree, pagoda, the bridge with its three figures, the fence and the two birds).
    const willow = canvasTex(512, 512, (c, W) => {
      const B = '#2c4a8c', m = W / 2;
      c.fillStyle = '#f7f3ea'; c.fillRect(0, 0, W, W);
      c.strokeStyle = B; c.fillStyle = B; c.lineCap = 'round'; c.lineJoin = 'round';
      c.lineWidth = 34; c.beginPath(); c.arc(m, m, W * 0.445, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#f7f3ea'; c.lineWidth = 3;
      for (let i = 0; i < 36; i++) {           // fret: little hooks reversed out of the band
        const a = i / 36 * Math.PI * 2, r0 = W * 0.43, r1 = W * 0.46;
        c.beginPath(); c.moveTo(m + Math.cos(a) * r0, m + Math.sin(a) * r0); c.lineTo(m + Math.cos(a) * r1, m + Math.sin(a) * r1);
        c.lineTo(m + Math.cos(a + 0.07) * r1, m + Math.sin(a + 0.07) * r1); c.stroke();
      }
      c.strokeStyle = B; c.lineWidth = 4; c.beginPath(); c.arc(m, m, W * 0.36, 0, Math.PI * 2); c.stroke();
      c.lineWidth = 2; c.beginPath(); c.arc(m, m, W * 0.345, 0, Math.PI * 2); c.stroke();
      c.save(); c.beginPath(); c.arc(m, m, W * 0.33, 0, Math.PI * 2); c.clip();
      c.globalAlpha = 0.85;
      c.beginPath(); c.moveTo(m - 170, m + 70); c.quadraticCurveTo(m, m + 40, m + 170, m + 90); c.lineTo(m + 170, m + 200); c.lineTo(m - 170, m + 200); c.fill();   // water's edge
      c.fillRect(m + 20, m - 40, 70, 60); c.beginPath(); c.moveTo(m + 5, m - 40); c.lineTo(m + 55, m - 85); c.lineTo(m + 105, m - 40); c.fill();   // pagoda
      c.beginPath(); c.moveTo(m + 15, m - 85); c.lineTo(m + 55, m - 118); c.lineTo(m + 95, m - 85); c.fill();
      c.fillStyle = '#f7f3ea'; c.fillRect(m + 45, m - 20, 18, 40); c.fillStyle = B;
      c.lineWidth = 7; c.beginPath(); c.moveTo(m - 70, m - 120); c.quadraticCurveTo(m - 60, m - 20, m - 40, m + 60); c.stroke();                      // willow trunk
      c.lineWidth = 3;
      for (let i = 0; i < 9; i++) { const x0 = m - 120 + i * 14; c.beginPath(); c.moveTo(m - 68, m - 118 + i * 3); c.quadraticCurveTo(x0, m - 140, x0 - 10 + i * 2, m - 40 + i * 6); c.stroke(); }   // fronds
      c.lineWidth = 5; c.beginPath(); c.moveTo(m - 150, m + 45); c.quadraticCurveTo(m - 70, m - 5, m + 10, m + 45); c.stroke();                       // bridge
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(m - 105 + i * 22, m + 6 + Math.abs(i - 1) * 4, 6, 0, Math.PI * 2); c.fill(); c.fillRect(m - 109 + i * 22, m + 10 + Math.abs(i - 1) * 4, 8, 14); }
      c.lineWidth = 3; for (let i = 0; i < 8; i++) { c.beginPath(); c.moveTo(m - 160 + i * 18, m + 100); c.lineTo(m - 151 + i * 18, m + 82); c.lineTo(m - 142 + i * 18, m + 100); c.stroke(); }   // fence
      for (const [bx, by] of [[m - 10, m - 135], [m + 30, m - 150]]) { c.beginPath(); c.moveTo(bx - 16, by + 6); c.quadraticCurveTo(bx - 8, by - 6, bx, by + 4); c.quadraticCurveTo(bx + 8, by - 6, bx + 16, by + 6); c.stroke(); }   // birds
      c.restore();
    });
    const plateMat = new THREE.MeshPhysicalMaterial({ map: willow, roughness: 0.22, clearcoat: 0.6 });
    // A real plate: foot ring, a shallow well and a raised rim, planar-mapped with the transfer.
    const plateGeo = (r) => {
      const prof = [[0, 0.007], [r * 0.6, 0.006], [r * 0.7, 0.008], [r * 0.93, 0.0135], [r, 0.0145], [r * 1.005, 0.012], [r * 0.95, 0.0085], [r * 0.7, 0.003], [r * 0.6, 0], [r * 0.56, 0.0005], [r * 0.5, 0.002], [0.0001, 0.002]];
      const g = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 40);
      const P = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < P.count; i++) uv.setXY(i, 0.5 + P.getX(i) / (2 * r), 0.5 - P.getZ(i) / (2 * r));
      g.rotateX(Math.PI / 2);
      return g;
    };
    const cupGlaze = [0x2f4f8f, 0xc9663e, 0x7f9c8a, 0xe8c547];
    const mugGeo = vesselGeometry({ rOutBottom: 0.028, rOut: 0.034, rIn: 0.031, rInBottom: 0.025, height: 0.07, bottom: 0.006, belly: 0.002 });
    const mugHandle = handleGeometry(0.019, 0.0045).translate(0.034 + 0.006, 0.036, 0);
    // The hook catches the inside top of the handle; the mug hangs from it on its side, mouth tipped down.
    const hookAt = new THREE.Vector3(0.034 + 0.006 + 0.019 - 0.0045, 0.036, 0);
    const _hm = new THREE.Matrix4(), _hr = new THREE.Matrix4(), _ht = new THREE.Matrix4();
    for (const [k, y] of D.shelves.entries()) {
      b.add(boxUV(w - 0.05, 0.02, D.shelfDepth, 1), oak, T(cx, y, D.z1 - D.shelfDepth / 2), 0xf0e0d0);
      b.add(boxUV(w - 0.05, 0.012, 0.012, 1), oak, T(cx, y + 0.02, D.z1 - 0.08), 0xd0c0b0); // plate rail
      const n = 4;
      for (let i = 0; i < n; i++) {
        // Plates on the top shelf are tea plates, small enough to stand clear of the cornice.
        const room = (D.shelves[k + 1] ?? D.top - 0.06) - y - 0.035;
        const x = D.x0 + 0.1 + (w - 0.2) * i / (n - 1), r = Math.min(0.085 + (i % 2) * 0.015, room / 2);
        b.add(plateGeo(r), plateMat, T(x, y + 0.012 + r, D.z1 - 0.045, Math.PI, -0.18));
      }
      for (let i = 0; i < 4; i++) {
        const x = D.x0 + 0.14 + (w - 0.28) * i / 3, cz = D.z1 - D.shelfDepth + 0.03;
        const glz = glazeMaterial(cupGlaze[(i + k) % 4], { roughness: 0.3 });
        const s = (i + k) % 2 ? 1 : -1, hy = y - 0.042;
        // Brass cup hook screwed into the shelf's underside.
        b.add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.03, 6), knob, T(x, y - 0.025, cz));
        b.add(new THREE.TorusGeometry(0.006, 0.0018, 5, 10, Math.PI), knob, T(x, hy + 0.006, cz, Math.PI / 2, 0, Math.PI));
        _hm.makeTranslation(x, hy, cz).multiply(_hr.makeRotationY(s < 0 ? Math.PI : 0)).multiply(_hr.makeRotationZ(Math.PI / 2 + 0.25)).multiply(_ht.makeTranslation(-hookAt.x, -hookAt.y, -hookAt.z));
        b.add(mugGeo, glz, _hm);
        b.add(mugHandle, glz, _hm);
      }
    }
    // A stoneware jug on the worktop.
    b.add(vesselGeometry({ rOutBottom: 0.05, rOut: 0.042, rIn: 0.038, rInBottom: 0.045, height: 0.15, bottom: 0.01, belly: 0.01 }), glazeMaterial(0xd9cbb0, { roughness: 0.5 }), T(cx - 0.25, D.baseTop, D.z1 - 0.12));
  }

  // ---------------------------------------------------------------- range cooker, kettle, flue
  {
    const R = RANGE, cx = (R.x0 + R.x1) / 2, cz = (R.z0 + R.z1) / 2, depth = R.x1 - R.x0, len = R.z1 - R.z0;
    const enamel = new THREE.MeshPhysicalMaterial({ color: 0xe8dcc0, roughness: 0.25, clearcoat: 0.9, clearcoatRoughness: 0.1 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 1, roughness: 0.12 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1f2022, roughness: 0.5, metalness: 0.4 });
    b.add(new RoundedBoxGeometry(depth, R.top - fy, len, 3, 0.02), enamel, T(cx, (R.top + fy) / 2, cz));
    b.add(new THREE.BoxGeometry(depth + 0.01, 0.02, len + 0.01), black, T(cx, R.top - 0.008, cz)); // hotplate deck
    b.add(new RoundedBoxGeometry(0.12, 0.36, len, 2, 0.015), enamel, T(R.x0 + 0.06, R.top + 0.18, cz)); // splash back
    for (const [x, z] of R.lids) {
      const lid = new THREE.SphereGeometry(R.lidR, 28, 10, 0, Math.PI * 2, 0, Math.PI * 0.32);
      b.add(lid, chrome, T(x, R.top - R.lidR * 0.85 + 0.05, z));
      b.add(new THREE.CylinderGeometry(R.lidR, R.lidR, 0.02, 28), chrome, T(x, R.top + 0.01, z));
      b.add(new THREE.TorusGeometry(0.03, 0.006, 6, 16, Math.PI), black, T(x + 0.04, R.top + 0.05, z, Math.PI / 2));
    }
    // Four oven doors with chrome hinges and handles, a thermometer.
    for (const [z, y, h] of [[R.z0 + len * 0.27, fy + 0.62, 0.32], [R.z0 + len * 0.73, fy + 0.62, 0.32], [R.z0 + len * 0.27, fy + 0.22, 0.32], [R.z0 + len * 0.73, fy + 0.22, 0.32]]) {
      b.add(new RoundedBoxGeometry(0.02, h, len * 0.42, 2, 0.008), enamel, T(R.x1 + 0.006, y, z), 0xf4eedc);
      b.add(new THREE.CylinderGeometry(0.008, 0.008, len * 0.3, 10), chrome, T(R.x1 + 0.03, y + h * 0.36, z, 0, Math.PI / 2));
    }
    b.add(new THREE.CircleGeometry(0.03, 20), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.4 }), T(R.x1 + 0.0175, fy + 0.83, cz, Math.PI / 2));
    // Towel rail.
    b.add(new THREE.CylinderGeometry(0.01, 0.01, len - 0.06, 12), chrome, T(R.x1 + 0.035, R.railY, cz, 0, Math.PI / 2));
    for (const z of [R.z0 + 0.06, R.z1 - 0.06]) b.add(new THREE.CylinderGeometry(0.007, 0.007, 0.04, 8), chrome, T(R.x1 + 0.016, R.railY, z, 0, 0, Math.PI / 2));
    // Copper kettle on the right-hand lid, flue pipe to the ceiling.
    const copper = new THREE.MeshStandardMaterial({ color: 0xc8794a, metalness: 1, roughness: 0.25 });
    const [kx, kz] = R.lids[1];
    b.add(vesselGeometry({ rOutBottom: 0.085, rOut: 0.05, rIn: 0.045, rInBottom: 0.08, height: 0.17, bottom: 0.01, belly: 0.02 }), copper, T(kx, R.top + 0.05, kz));
    b.add(new THREE.TorusGeometry(0.06, 0.008, 8, 20, Math.PI), black, T(kx, R.top + 0.23, kz, Math.PI / 2));
    b.add(new THREE.CylinderGeometry(0.008, 0.016, 0.1, 10), copper, T(kx + 0.09, R.top + 0.14, kz, 0, 0, -0.9));
    b.add(new THREE.CylinderGeometry(0.06, 0.06, ROOM.ceilingY - R.top - 0.36, 20), black, T(R.flue[0], (ROOM.ceilingY + R.top + 0.36) / 2, R.flue[1]));
  }

  // ---------------------------------------------------------------- counter: bread bin, fruit bowl, tea tins
  {
    const top = COUNTER.top;
    const cream = new THREE.MeshStandardMaterial({ color: 0xece2c8, roughness: 0.35, metalness: 0.3 });
    b.add(new RoundedBoxGeometry(BREADBIN.halfX * 2, BREADBIN.h, BREADBIN.halfZ * 2, 3, 0.03), cream, T(BREADBIN.x, top + BREADBIN.h / 2, BREADBIN.z));
    b.add(new THREE.PlaneGeometry(0.14, 0.04), new THREE.MeshStandardMaterial({ map: canvasTex(256, 72, (c, W, H) => { c.fillStyle = '#ece2c8'; c.fillRect(0, 0, W, H); c.fillStyle = '#7d2a20'; c.font = 'bold 44px Georgia, serif'; c.textAlign = 'center'; c.fillText('BREAD', W / 2, 52); }), roughness: 0.5 }), T(BREADBIN.x - BREADBIN.halfX - 0.001, top + BREADBIN.h * 0.6, BREADBIN.z, -Math.PI / 2));
    b.add(saucerGeometry(FRUITBOWL.r, FRUITBOWL.h), glazeMaterial(0x6f8f7a, { roughness: 0.3 }), T(FRUITBOWL.x, top, FRUITBOWL.z));
    const fruit = [[0xb3261e, 0.035], [0x9fb53a, 0.035], [0xe8a33a, 0.04], [0xb3261e, 0.034], [0xd9c13a, 0.03]];
    const fruitGlaze = glazeMaterial(0xffffff, { roughness: 0.5, extra: { clearcoat: 0.3 } }); // shared, each fruit's colour per vertex
    fruit.forEach(([c, r], i) => { const a = i / fruit.length * Math.PI * 2; b.add(new THREE.SphereGeometry(r, 14, 10), fruitGlaze, T(FRUITBOWL.x + Math.cos(a) * 0.05, top + 0.035 + r * 0.8 + (i === 4 ? 0.03 : 0), FRUITBOWL.z + Math.sin(a) * 0.05), c); });
    const tins = [[0x2f5d50, 'EARL GREY'], [0x8a2f2f, 'BREAKFAST'], [0x2f3f6a, 'DARJEELING']];
    CADDIES.forEach(([x, z], i) => {
      const [col, label] = tins[i];
      const tex = canvasTex(256, 128, (c, W, H) => { c.fillStyle = `#${new THREE.Color(col).getHexString()}`; c.fillRect(0, 0, W, H); c.fillStyle = '#e8c547'; c.fillRect(0, 18, W, 6); c.fillRect(0, H - 24, W, 6); c.font = 'bold 26px Georgia, serif'; c.textAlign = 'center'; c.fillText(label, W / 2, H / 2 + 9); });
      b.add(new THREE.CylinderGeometry(CADDY.r, CADDY.r, CADDY.h, 24), new THREE.MeshStandardMaterial({ map: tex, metalness: 0.6, roughness: 0.35 }), T(x, top + CADDY.h / 2, z, -Math.PI / 2));
      b.add(new THREE.CylinderGeometry(CADDY.r + 0.002, CADDY.r + 0.002, 0.02, 24), new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }), T(x, top + CADDY.h, z));
    });
  }

  // ---------------------------------------------------------------- washing line, prop post, bird feeder
  {
    const rope = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9 });
    const pts = [];
    for (let i = 0; i <= 30; i++) pts.push(new THREE.Vector3(...linePoint(i / 30)));
    b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.003, 5, false), rope, null, 0xffffff, { cast: true, receive: false });
    const wood = new THREE.MeshStandardMaterial({ color: 0x8b6a4a, roughness: 0.85 });
    b.add(new THREE.CylinderGeometry(0.022, 0.028, LINE.a[1] + 0.06 - fy, 10), wood, T(LINE.a[0], (LINE.a[1] + 0.06 + fy) / 2, LINE.a[2]));
    b.add(new THREE.TorusGeometry(0.03, 0.004, 6, 12), new THREE.MeshStandardMaterial({ color: 0x777777, metalness: 0.8, roughness: 0.4 }), T(LINE.a[0], LINE.a[1], LINE.a[2]));
    const F = FEEDER;
    const green = new THREE.MeshStandardMaterial({ color: 0x3f6b4f, roughness: 0.5, metalness: 0.3 });
    b.add(new THREE.CylinderGeometry(F.r, F.r, F.h, 20, 1, true), new THREE.MeshPhysicalMaterial({ color: 0xd9e6e0, roughness: 0.1, transparent: false }), T(F.x, F.y, F.z), 0xc8d4cc);
    b.add(new THREE.CylinderGeometry(F.r * 0.96, F.r * 0.96, F.h * 0.8, 16), new THREE.MeshStandardMaterial({ color: 0xc89a5a, roughness: 1 }), T(F.x, F.y - F.h * 0.08, F.z)); // seed
    b.add(new THREE.ConeGeometry(F.r + 0.03, 0.06, 20), green, T(F.x, F.y + F.h / 2 + 0.03, F.z));
    b.add(new THREE.CylinderGeometry(F.r + 0.02, F.r + 0.02, 0.01, 20), green, T(F.x, F.y - F.h / 2, F.z));
    for (const a of [0, Math.PI]) b.add(new THREE.CylinderGeometry(0.003, 0.003, 0.05, 5), green, T(F.x + Math.cos(a) * (F.r + 0.02), F.y - F.h / 2 + 0.01, F.z + Math.sin(a) * (F.r + 0.02), 0, 0, Math.PI / 2));
    b.add(new THREE.CylinderGeometry(0.002, 0.002, F.hangFrom - F.y - F.h / 2 - 0.06, 4), new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8 }), T(F.x, (F.hangFrom + F.y + F.h / 2 + 0.06) / 2, F.z));
  }
  b.build(scene);

  // ---------------------------------------------------------------- tea towels (cloth)
  const towelTex = (bg, stripe) => canvasTex(128, 192, (c, W, H) => {
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    c.fillStyle = stripe; c.fillRect(0, 26, W, 8); c.fillRect(0, 40, W, 3); c.fillRect(0, H - 34, W, 8); c.fillRect(0, H - 43, W, 3);
    for (let i = 0; i < 1500; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.04})`; c.fillRect(Math.random() * W, Math.random() * H, 1, 2); }
  });
  const cloths = [];
  {
    const R = RANGE, n = 6, pins = [];
    for (let i = 0; i < n; i++) pins.push([R.x1 + 0.047, R.railY + 0.008, TOWEL.z0 + (TOWEL.z1 - TOWEL.z0) * i / (n - 1)]);
    cloths.push(new HangingCloth(scene, quality, { pins, drop: TOWEL.drop, out: [1, 0, 0], map: towelTex('#f3efe6', '#b5523b'), wall: { axis: 'x', at: R.x1 + 0.006, side: 1 } }));
  }
  {
    const L = LINE, len = Math.hypot(L.b[0] - L.a[0], L.b[2] - L.a[2]);
    const across = [-(L.b[2] - L.a[2]) / len, 0, (L.b[0] - L.a[0]) / len];
    const looks = [['#f3efe6', '#2f4f8f'], ['#e9d9b9', '#5f8f5a'], ['#f6f1e6', '#b5523b']];
    const pegs = [];
    L.towels.forEach((t, k) => {
      const n = 6, half = 0.15 / len, pins = [];
      for (let i = 0; i < n; i++) pins.push(linePoint(t - half + 2 * half * i / (n - 1), [0, 0, 0]).map((v, j) => (j === 1 ? v - 0.004 : v)));
      cloths.push(new HangingCloth(scene, quality, { pins, drop: 0.38 + (k % 2) * 0.06, out: across, map: towelTex(...looks[k]), outdoor: true }));
      // Wooden pegs at the corners.
      for (const i of [0, n - 1]) {
        const p = pins[i];
        pegs.push(new THREE.BoxGeometry(0.008, 0.05, 0.012).translate(p[0], p[1] - 0.01, p[2]));
      }
    });
    scene.add(new THREE.Mesh(mergeGeometries(pegs, false), new THREE.MeshStandardMaterial({ color: 0xc8a070, roughness: 0.7 }))); // all the pegs, one draw call
  }
  return {
    cloths,
    update(dt, sim, breeze) { for (const c of cloths) c.update(dt, sim, breeze); },
  };
}
