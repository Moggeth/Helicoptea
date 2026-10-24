import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { KC, T as TOP } from '../../../sim/extras/zones/kitchenCounter.js';
import { vesselGeometry } from '../../models.js';
import { registerExtraSound } from '../../../audio/extras.js';

// The kitchen counter's free spots and the tiled wall above it (see src/sim/extras/zones/kitchenCounter.js):
//   1. a wall-mounted pine spice rack with two shelves of little glass jars, a pepper mill and a salt pig
//   2. a stoneware utensil crock of wooden and steel tools that rattle in the rotor wash (render-only springs)
//   3. a rail on the tiles with a ladle, skimmer, whisk, spatula and tongs that swing and clink in the wash
//   4. a cake stand with a Victoria sponge (a slice gone) under a glass dome; wash slides the dome off (physics)
//   5. a granite mortar with a loose pestle that rolls about (physics), and a beech chopping board on the tiles
//   6. a cookbook open on a wooden stand, and three graduated stoneware storage jars with printed labels
// Draw calls of its own: the swinging tools (one mesh; wood and steel share a material and a small shader that
// rotates each tool about its pivot), one printed-atlas mesh (book pages and jar labels), the glass dome and
// the pestle. Every static part is in the shared batch.

const PI = Math.PI;
const WALL = 2.4;

// ---------------------------------------------------------------- small helpers
const V2 = (x, y) => new THREE.Vector2(x, y);
const smooth = (pts, n) => new THREE.SplineCurve(pts.map((p) => V2(p[0], p[1]))).getPoints(n).map((v) => [Math.max(0.0001, v.x), v.y]);
const lathe = (pts, seg = 32) => new THREE.LatheGeometry(pts.map((p) => V2(p[0], p[1])), seg);
// A tapered cylinder from y0 to y1 (radius r0 at the bottom, r1 at the top).
const taper = (r0, r1, y0, y1, seg = 8) => { const g = new THREE.CylinderGeometry(r1, r0, y1 - y0, seg, 1); g.translate(0, (y0 + y1) / 2, 0); return g; };
const ell = (rx, ry, rz, x = 0, y = 0, z = 0, seg = 14) => { const g = new THREE.SphereGeometry(1, seg, Math.max(6, seg >> 1)); g.scale(rx, ry, rz); g.translate(x, y, z); return g; };
const box = (w, h, d, x = 0, y = 0, z = 0) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };
// A cylinder standing on y = 0.
const post = (r, h, seg = 16) => { const g = new THREE.CylinderGeometry(r, r, h, seg, 1); g.translate(0, h / 2, 0); return g; };
const scaleUV = (g, s) => { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s, uv.getY(i) * s); return g; };
const rng = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
// A small mesh from raw triangles (non-indexed), normals computed.
function tris(arr) { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3)); g.computeVertexNormals(); return g; }
// A flat quad (a, b, c, d anticlockwise seen from the front).
const quad = (a, b, c, d) => tris([...a, ...b, ...c, ...a, ...c, ...d]);

// ---------------------------------------------------------------- the printed atlas (book pages, jar labels)
function atlasTexture() {
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  c.fillStyle = '#f4ecd8'; c.fillRect(0, 0, S, S);
  const ink = '#2b2622';
  // Two book pages (256 x 400 each): left a photograph and ingredients, right the method.
  for (let side = 0; side < 2; side++) {
    const x0 = side * 256;
    const pg = c.createLinearGradient(x0, 0, x0 + 256, 0);
    if (side === 0) { pg.addColorStop(0, '#efe5cd'); pg.addColorStop(0.8, '#f6eedb'); pg.addColorStop(1, '#d8cdb3'); }
    else { pg.addColorStop(0, '#d8cdb3'); pg.addColorStop(0.2, '#f6eedb'); pg.addColorStop(1, '#efe5cd'); }
    c.fillStyle = pg; c.fillRect(x0, 0, 256, 400);
  }
  c.textBaseline = 'alphabetic';
  // Left page.
  c.fillStyle = '#7a2a22'; c.font = 'bold 22px Georgia, serif'; c.textAlign = 'center';
  c.fillText('Victoria Sponge', 118, 44);
  c.strokeStyle = '#7a2a22'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(40, 54); c.lineTo(196, 54); c.stroke();
  c.fillStyle = '#9ab0b8'; c.fillRect(28, 66, 200, 128);                          // photograph: a window-lit table
  const sky = c.createLinearGradient(0, 66, 0, 194); sky.addColorStop(0, '#c8d8d6'); sky.addColorStop(1, '#8aa09a');
  c.fillStyle = sky; c.fillRect(28, 66, 200, 128);
  c.fillStyle = '#b08a5a'; c.fillRect(28, 150, 200, 44);                          // table
  c.fillStyle = '#efe6d2'; c.beginPath(); c.ellipse(128, 160, 62, 11, 0, 0, PI * 2); c.fill();  // plate
  c.fillStyle = '#d8a25a'; c.beginPath(); c.ellipse(128, 142, 46, 13, 0, 0, PI * 2); c.fill();   // sponge side
  c.fillRect(82, 128, 92, 15);
  c.fillStyle = '#f7f1e2'; c.beginPath(); c.ellipse(128, 128, 46, 12, 0, 0, PI * 2); c.fill();   // sugared top
  c.fillStyle = '#b01c2c'; c.fillRect(82, 135, 92, 3);
  c.fillStyle = '#fbf3df'; c.fillRect(82, 132, 92, 3);
  c.strokeStyle = '#2b2622'; c.lineWidth = 2; c.strokeRect(28, 66, 200, 128);
  c.textAlign = 'left'; c.fillStyle = ink; c.font = 'italic 13px Georgia, serif';
  c.fillText('Serves 8 - 40 minutes', 34, 216);
  c.font = 'bold 15px Georgia, serif'; c.fillText('You will need', 34, 242);
  c.font = '14px Georgia, serif';
  const ing = ['3 large eggs (about 175g)', '175g softened butter', '175g caster sugar', '175g self-raising flour', '1 tbsp milk', 'raspberry jam, 4 tbsp', 'whipped cream, to fill', 'icing sugar, to dust'];
  ing.forEach((t, i) => { c.fillText('- ' + t, 38, 266 + i * 19); });
  // Right page.
  c.font = 'bold 15px Georgia, serif'; c.fillText('Method', 276, 44);
  c.font = '13px Georgia, serif';
  const steps = ['1. Heat the oven to 180C and', '   line two 20cm tins.', '2. Cream the butter and sugar', '   until pale and fluffy.', '3. Beat in the eggs one at a', '   time with a spoon of flour.', '4. Fold in the rest of the', '   flour and the milk.', '5. Divide between the tins and', '   bake for 25 minutes.', '6. Cool on a wire rack, then', '   sandwich with jam and cream.', '7. Dust with icing sugar and', '   serve with a good pot of tea.'];
  steps.forEach((t, i) => { c.fillText(t, 270, 74 + i * 21 + (i % 2 === 0 ? 4 : 0)); });
  c.fillStyle = '#7a2a22'; c.font = 'italic 12px Georgia, serif'; c.fillText('Cook\'s note: never open the oven door.', 270, 382);
  c.fillStyle = 'rgba(80,60,30,0.06)'; for (let i = 0; i < 90; i++) c.fillRect(Math.random() * 512, Math.random() * 400, 2 + Math.random() * 8, 1);
  // Jar labels (170 x 96 each, along the bottom).
  const labels = [['FLOUR', 'plain'], ['SUGAR', 'caster'], ['RICE', 'long grain']];
  labels.forEach(([word, sub], i) => {
    const x0 = i * 170 + 1, y0 = 410;
    c.fillStyle = '#f3ead2'; c.fillRect(x0, y0, 168, 100);
    c.strokeStyle = '#2f4f7a'; c.lineWidth = 3; c.strokeRect(x0 + 5, y0 + 5, 158, 90);
    c.lineWidth = 1; c.strokeRect(x0 + 10, y0 + 10, 148, 80);
    c.fillStyle = '#2f4f7a'; c.textAlign = 'center'; c.font = 'bold 36px Georgia, serif'; c.fillText(word, x0 + 84, y0 + 56);
    c.font = 'italic 15px Georgia, serif'; c.fillText(sub, x0 + 84, y0 + 80);
  });
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
// Remap a geometry's UVs (0..1) into an atlas region given in pixels.
function atlasRegion(g, x0, y0, w, h) {
  const uv = g.attributes.uv, S = 512;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * w) / S, 1 - (y0 + (1 - uv.getY(i)) * h) / S);
  return g;
}

// ---------------------------------------------------------------- tool geometry (tip at y = 0, up +y, faces +-z)
const WOOD = 0, STEEL = 1;
function woodSpoon(len, bowlLen, bowlW, col) {
  return [
    { g: taper(0.0042, 0.0068, 0, len - bowlLen * 0.9, 8), c: col },
    { g: ell(0.0048, 0.0048, 0.0048, 0, 0, 0, 8), c: col },
    { g: ell(bowlW, bowlLen * 0.55, 0.0068, 0, len - bowlLen * 0.5, 0, 16), c: col },
    { g: ell(bowlW * 0.78, bowlLen * 0.43, 0.0022, 0, len - bowlLen * 0.5, 0.0052, 14), c: new THREE.Color(col).multiplyScalar(0.62).getHex() },
  ];
}
function spatula(len, col) {
  const s = new THREE.Shape();
  s.moveTo(-0.0075, 0); s.lineTo(0.0075, 0); s.lineTo(0.009, len * 0.52); s.lineTo(0.0215, len * 0.62);
  s.lineTo(0.0225, len - 0.012); s.quadraticCurveTo(0.0225, len, 0.012, len); s.lineTo(-0.012, len); s.quadraticCurveTo(-0.0225, len, -0.0225, len - 0.012);
  s.lineTo(-0.0215, len * 0.62); s.lineTo(-0.009, len * 0.52); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0009, bevelSize: 0.0009, bevelSegments: 1, curveSegments: 6 });
  g.translate(0, 0, -0.002);
  scaleUV(g, 3);
  return [{ g, c: col }, { g: taper(0.0045, 0.0045, 0, 0.002, 6), c: col }];
}
function slottedSpoon(len) {
  const parts = [
    { g: taper(0.003, 0.0042, 0, len - 0.05, 8), c: 0xd6d9dd, m: STEEL },
    { g: ell(0.0045, 0.0045, 0.0045, 0, 0, 0, 8), c: 0xd6d9dd, m: STEEL },
    { g: ell(0.021, 0.036, 0.0042, 0, len - 0.034, 0, 16), c: 0xd6d9dd, m: STEEL },
  ];
  for (const sx of [-0.0105, 0, 0.0105]) for (const sz of [-1, 1]) parts.push({ g: box(0.0032, 0.024, 0.0012, sx, len - 0.03, sz * 0.0041), c: 0x3a3c40, m: STEEL });
  return parts;
}
function whisk(len, lite) {
  const parts = [
    { g: taper(0.0062, 0.0074, 0, 0.115, 10), c: 0xb08052 },
    { g: taper(0.0076, 0.0076, 0.115, 0.132, 10), c: 0xcfd2d6, m: STEEL },
  ];
  const n = lite ? 5 : 8, yc = 0.132 + (len - 0.132) * 0.5, hy = (len - 0.132) * 0.5;
  for (let k = 0; k < n; k++) {
    const pts = [];
    for (let i = 0; i < 22; i++) {
      const f = i / 22 * PI * 2;
      const y = yc - Math.cos(f) * hy, x = Math.sin(f) * 0.03 * (0.55 + 0.45 * (0.5 - 0.5 * Math.cos(f)));
      pts.push(new THREE.Vector3(x, y, 0));
    }
    const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 24, 0.00085, 3, true);
    g.rotateY(k / n * PI);
    parts.push({ g, c: 0xd9dce0, m: STEEL });
  }
  return parts;
}
function ladle(len) {
  const bowl = new THREE.SphereGeometry(0.034, 20, 9, 0, PI * 2, PI / 2, PI / 2); // lower half, open at the top
  bowl.rotateZ(0.35); bowl.translate(0.004, len - 0.003, 0);
  const cap = new THREE.SphereGeometry(0.0335, 20, 9, 0, PI * 2, PI / 2, PI / 2); cap.rotateZ(0.35); cap.translate(0.004, len - 0.003, 0);
  const ring = new THREE.TorusGeometry(0.0055, 0.0013, 6, 14); ring.translate(0, 0.006, 0);
  return [
    { g: taper(0.0028, 0.0038, 0.004, len - 0.022, 8), c: 0xd4d7db, m: STEEL },
    { g: ring, c: 0xd4d7db, m: STEEL },
    { g: bowl, c: 0xdfe2e6, m: STEEL },
    { g: new THREE.CylinderGeometry(0.0036, 0.0036, 0.03, 6).translate(0, len - 0.02, 0), c: 0xd4d7db, m: STEEL },
  ];
}
function skimmer(len) {
  const hy = len + 0.045;
  const head = new THREE.CylinderGeometry(0.045, 0.045, 0.0028, 28, 1); head.rotateX(PI / 2); head.translate(0, hy, 0);
  const rim = new THREE.TorusGeometry(0.045, 0.0017, 6, 28); rim.translate(0, hy, 0);
  const parts = [
    { g: taper(0.0045, 0.0068, 0, len - 0.02, 8), c: 0x9a6a3e },
    { g: ell(0.005, 0.005, 0.005, 0, 0, 0, 8), c: 0x9a6a3e },
    { g: taper(0.0035, 0.0035, len - 0.02, len + 0.012, 6), c: 0xcfd2d6, m: STEEL },
    { g: head, c: 0xd2d5d9, m: STEEL }, { g: rim, c: 0xe0e3e6, m: STEEL },
  ];
  const holes = [[0, 0]];
  for (let i = 0; i < 6; i++) holes.push([Math.cos(i * PI / 3) * 0.015, Math.sin(i * PI / 3) * 0.015]);
  for (let i = 0; i < 12; i++) holes.push([Math.cos(i * PI / 6 + 0.26) * 0.03, Math.sin(i * PI / 6 + 0.26) * 0.03]);
  for (const [hx, hz] of holes) for (const sz of [-1, 1]) {
    const h = new THREE.CylinderGeometry(0.0034, 0.0034, 0.0006, 7); h.rotateX(PI / 2); h.translate(hx, hy + hz, sz * 0.0015);
    parts.push({ g: h, c: 0x303236, m: STEEL });
  }
  return parts;
}
function tongs(len) {
  const parts = [];
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 10; i++) { const f = i / 10; pts.push(new THREE.Vector3(s * (0.0035 + 0.012 * Math.sin(f * PI * 0.5) * f + 0.004 * f), len * f, 0)); }
    parts.push({ g: new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.0026, 5, false), c: 0xd0d3d7, m: STEEL });
    parts.push({ g: ell(0.0125, 0.021, 0.0035, s * 0.0185, len + 0.006, 0, 12), c: 0xd8dbdf, m: STEEL });
  }
  const loop = new THREE.TorusGeometry(0.0075, 0.0022, 6, 14, PI * 1.5); loop.rotateZ(PI * 0.75 + PI); loop.translate(0, 0.0085, 0);
  parts.push({ g: loop, c: 0xd0d3d7, m: STEEL });
  parts.push({ g: box(0.02, 0.006, 0.006, 0, len * 0.16, 0), c: 0xb7bbc0, m: STEEL });
  return parts;
}

// ---------------------------------------------------------------- the swinging-tools material
// One material for wood and steel: a vertex attribute picks the metal look, another the tool's id; each tool
// turns about its own pivot by the angles the update loop writes into uSw (a about z, b about x).
const SW_N = 12;
function swingMaterial(map) {
  const m = new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.62, metalness: 0, side: THREE.DoubleSide });
  const uSw = { value: Array.from({ length: SW_N }, () => new THREE.Vector4()) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uSw = uSw;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aSw; attribute vec3 aPiv; attribute float aMet;
        uniform vec4 uSw[${SW_N}]; varying float vMet;
        mat3 swRot(vec4 s) {
          float ca = cos(s.x), sa = sin(s.x), cb = cos(s.y), sb = sin(s.y);
          mat3 rz = mat3(ca, sa, 0.0, -sa, ca, 0.0, 0.0, 0.0, 1.0);
          mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cb, sb, 0.0, -sb, cb);
          return rz * rx;
        }`)
      .replace('#include <beginnormal_vertex>', `
        mat3 swR = swRot(uSw[int(aSw + 0.5)]); vMet = aMet;
        #include <beginnormal_vertex>
        objectNormal = swR * objectNormal;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = swR * (position - aPiv) + aPiv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vMet;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb = vMet > 0.5 ? vColor.rgb : diffuseColor.rgb;`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = vMet > 0.5 ? 1.0 : 0.0; roughnessFactor = vMet > 0.5 ? 0.3 : 0.6;`);
  };
  m.customProgramCacheKey = () => 'kc-swing';
  m.userData.uSw = uSw;
  return m;
}

export function build(ctx) {
  const lite = ctx.lite, kit = ctx.kit;
  const seg = lite ? 14 : 28;
  const add = (g, mat, x, y, z, color, o = {}) => ctx.batch.add(g, mat, ctx.T(x, y, z, o.yaw || 0, o.pitch || 0, o.roll || 0, o.sx || 1, o.sy || 1, o.sz || 1), color, { cast: !!o.cast, receive: o.receive !== false });
  const addM = (g, mat, m, color, o = {}) => ctx.batch.add(g, mat, m, color, { cast: !!o.cast, receive: o.receive !== false });
  const tex = atlasTexture();
  const rand = rng(4711);

  // ================================================================ 1. spice rack
  {
    const R = KC.rack, depth = R.depth, zc = (R.z0 + R.z1) / 2, wz = R.z1 - R.z0, wood = 0xb88a58;
    const top = R.y1 + R.jarH + 0.03;
    // Back board, two shelves with a lip, end boards, a little cornice and a brass wire rail on the lower shelf.
    add(box(0.008, top - (R.y0 - 0.03), wz + 0.03, 0, 0, 0), kit.wood, WALL - 0.004, (top + R.y0 - 0.03) / 2, zc, wood, { cast: true });
    for (const y of [R.y0, R.y1]) {
      add(scaleUV(box(depth, R.shelfT, wz, 0, 0, 0), 3), kit.wood, WALL - depth / 2 - 0.004, y - R.shelfT / 2, zc, wood, { cast: true });
      add(box(0.006, 0.018, wz, 0, 0, 0), kit.wood, WALL - depth - 0.001, y + 0.006, zc, 0xa97c4c);
    }
    for (const z of [R.z0 - 0.0075, R.z1 + 0.0075]) {
      const sh = new THREE.Shape();
      sh.moveTo(0, 0); sh.lineTo(depth, 0); sh.lineTo(depth, top - R.y0 + 0.03 - 0.012); sh.quadraticCurveTo(depth * 0.5, top - R.y0 + 0.03 + 0.012, 0, top - R.y0 + 0.03 - 0.012); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.012, bevelEnabled: false, curveSegments: 6 });
      g.translate(-depth, 0, -0.006); scaleUV(g, 3);
      add(g, kit.wood, WALL - 0.004, R.y0 - 0.03, z, 0xa97c4c, { cast: true });
    }
    add(box(depth + 0.01, 0.014, wz + 0.04, 0, 0, 0), kit.wood, WALL - depth / 2 - 0.006, top + 0.005, zc, 0xa97c4c);
    const wire = post(0.0014, wz, 6); wire.rotateX(PI / 2);
    add(wire, kit.brass, WALL - depth + 0.006, R.y1 + 0.03, R.z0, 0xc9a24c);
    // Jars.
    const glassG = (r, h) => lathe([[0.0001, 0], [r - 0.002, 0], [r, 0.002], [r, h * 0.82], [r * 0.86, h * 0.92], [r * 0.86, h], [0.0001, h]], lite ? 10 : 14);
    const spices = [0x9c2410, 0xcf8f10, 0x7b5a22, 0x6e3416, 0xb07a38, 0x2a160c, 0x4c6a24, 0x1c1b1a, 0xa81c0c, 0xb88c14, 0x8a6c36, 0x5f7f2c, 0xcdbb8a, 0x58300f];
    const jx = WALL - 0.004 - depth * 0.5 - 0.003;
    const makeJar = (x, y, z, r, h, col) => {
      add(glassG(r, h), kit.glass, x, y, z, 0xeef4f2, { cast: false });
      const fill = (h - 0.012) * (0.8 + rand() * 0.18);
      add(post(r - 0.0012, fill, lite ? 8 : 12), kit.fabric, x, y + 0.002, z, col, { cast: false });
      add(post(r * 0.88, 0.008, lite ? 8 : 12), kit.steel, x, y + h - 0.002, z, rand() < 0.5 ? 0xc3c7cc : 0x2e3a52, { cast: false });
      add(post(r + 0.0004, h * 0.3, lite ? 8 : 12), kit.paper, x, y + h * 0.14, z, 0xf0e6cf, { cast: false });
      add(post(r + 0.0006, 0.0022, lite ? 8 : 12), kit.paint, x, y + h * 0.4, z, 0x8c3b2e, { cast: false });
    };
    const n = 11, pitch = (wz - 0.05) / (n - 1);
    for (let row = 0; row < 2; row++) {
      const y = (row === 0 ? R.y0 : R.y1);
      for (let i = 0; i < n; i++) {
        const z = R.z0 + 0.025 + i * pitch;
        if (row === 0 && (i === 0 || i === n - 1)) continue;
        const r = 0.0185 + rand() * 0.0025, h = R.jarH * (0.9 + rand() * 0.15);
        makeJar(jx, y, z, r, h, spices[(i * 5 + row * 3) % spices.length]);
      }
    }
    // Pepper mill (turned beech) and salt pig on the lower shelf's ends.
    const mill = lathe([[0.0001, 0], [0.019, 0], [0.021, 0.004], [0.0165, 0.03], [0.0125, 0.05], [0.0135, 0.07], [0.0185, 0.0805], [0.0135, 0.088], [0.0085, 0.092], [0.0001, 0.093]], lite ? 10 : 16);
    add(mill, kit.wood, jx, R.y0, R.z0 + 0.025, 0x6a4326, { cast: false });
    add(post(0.005, 0.003, 8), kit.brass, jx, R.y0 + 0.0925, R.z0 + 0.025, 0xc9a24c, { cast: false });
    const pig = lathe([[0.0001, 0], [0.026, 0], [0.032, 0.012], [0.03, 0.034], [0.024, 0.044], [0.016, 0.0455], [0.0001, 0.0455]], lite ? 10 : 16);
    add(pig, kit.ceramic, jx, R.y0, R.z1 - 0.027, 0xe9e1cf, { cast: false });
    add(ell(0.02, 0.012, 0.02, 0, 0, 0, 10), kit.ceramic, jx, R.y0 + 0.049, R.z1 - 0.027, 0xdcd2bd, { cast: false });
  }

  // ================================================================ 2 and 3. tools: the crock and the rail
  const swingParts = [];                       // { g (world), color, metal, id, pivot }
  const toolInfo = [];                         // per id: { pos (world centre), crock }
  let swingMat = null;
  {
    const addTool = (id, parts, M, pivot, pre) => {
      toolInfo[id] = { x: pivot[0], y: pivot[1], z: pivot[2] };
      for (const p of parts) {
        let g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
        if (pre) g.applyMatrix4(pre);
        g.applyMatrix4(M);
        swingParts.push({ g, c: p.c, metal: p.m === STEEL ? 1 : 0, id, pivot });
        p.g.dispose();
      }
    };
    // Crock.
    const C = KC.crock, mouth = TOP + C.h;
    const inside = (rb, r, h, y) => { const t = Math.min(1, Math.max(0, (y - 0.004) / (h - 0.004) / 0.985)); return rb + (r - rb) * Math.pow(t, 0.8) + Math.sin(t * PI) * 0.004; };
    add(vesselGeometry({ rOutBottom: C.rb, rOut: C.r, rIn: C.r - 0.006, rInBottom: C.rb - 0.007, height: C.h, bottom: 0.012, foot: 0.004, belly: 0.004, segments: seg }), kit.ceramic, C.x, TOP, C.z, 0xe9e0c8, { cast: true });
    for (const [y, h, col] of [[0.074, 0.0075, 0x2f4f7a], [0.086, 0.0075, 0x2f4f7a], [0.05, 0.003, 0x7e9bb8]]) {
      const r = inside(C.rb, C.r, C.h, y + h / 2) + 0.0004;
      const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true);
      add(g, kit.ceramic, C.x, TOP + y + h / 2, C.z, col, { cast: false });
    }
    const defs = [
      [() => woodSpoon(0.27, 0.075, 0.021, 0xc99a62), 0.1, 0.02, 0.05, 0.0],
      [() => woodSpoon(0.265, 0.07, 0.019, 0x8d5b34), 2.3, 0.2, 0.017, 1.6],
      [() => spatula(0.27, 0xb98a55), 4.0, 0.15, 0.02, 0.5],
      [() => slottedSpoon(0.27), 5.2, 0.17, 0.016, 0.9],
      [() => whisk(0.265, lite), 1.2, 0.13, 0.016, 0.0],
      [() => ladle(0.265), 3.1, 0.12, 0.014, 2.0],
    ];
    defs.forEach(([mk, phi, lean, rho, tw], id) => {
      const px = C.x + Math.sin(phi) * rho, pz = C.z + Math.cos(phi) * rho;
      const M = ctx.T(px, mouth, pz, phi, lean, 0);
      const pre = new THREE.Matrix4().makeRotationY(tw).premultiply(new THREE.Matrix4().makeTranslation(0, -0.075, 0));
      addTool(id, mk(), M, [px, mouth, pz], pre);
    });
    // Rail on the tiles: a brass rod on two brackets and S-hooks, five tools hanging flat to the wall.
    const Rl = KC.rail, wallX = Rl.x;
    const rod = post(0.0055, Rl.z1 - Rl.z0 + 0.02, 10); rod.rotateX(PI / 2);
    add(rod, kit.brass, wallX, Rl.y, Rl.z0 - 0.01, 0xc4a047, { cast: true });
    for (const z of [Rl.z0 - 0.005, Rl.z1 + 0.005]) {
      add(ell(0.0085, 0.0085, 0.0085, 0, 0, 0, 10), kit.brass, wallX, Rl.y, z, 0xd2ad55);
      add(box(0.02, 0.012, 0.006, 0, 0, 0), kit.brass, WALL - 0.011, Rl.y, z, 0xb99238);
    }
    const rail = [
      [() => ladle(0.25), 'ladle'], [() => skimmer(0.2), 'skim'], [() => whisk(0.25, lite), 'whisk'], [() => spatula(0.26, 0xa9784a), 'spat'], [() => tongs(0.2), 'tongs'],
    ];
    const pitch = (Rl.z1 - Rl.z0 - 0.06) / 4;
    rail.forEach(([mk, name], i) => {
      const id = 6 + i, z = Rl.z0 + 0.03 + i * pitch, py = Rl.y - 0.012 - 0.0075;
      // Hang it from the handle's tip: flip the tool (tip at the pivot), face it to the room.
      const M = ctx.T(wallX - 0.001, py, z, PI / 2, PI, 0);
      const hook = new THREE.TorusGeometry(0.0072, 0.0012, 6, 14, PI * 1.6); hook.rotateZ(PI * 0.2); hook.translate(0, 0.0082, 0);
      addM(hook, kit.steel, ctx.T(wallX, Rl.y - 0.012, z, PI / 2, 0, 0), 0xc5c9ce);
      addTool(id, mk(), M, [wallX - 0.001, py, z], null);
      void name;
    });
    // Build the one swinging mesh.
    const list = swingParts.map((p) => {
      const g = p.g;
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!g.attributes.normal) g.computeVertexNormals();
      const n = g.attributes.position.count, col = new THREE.Color(p.c), cols = new Float32Array(n * 3), ids = new Float32Array(n), met = new Float32Array(n), piv = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b; ids[i] = p.id; met[i] = p.metal;
        piv[i * 3] = p.pivot[0]; piv[i * 3 + 1] = p.pivot[1]; piv[i * 3 + 2] = p.pivot[2];
        if (p.metal) g.attributes.uv.setXY(i, 0, 0);
      }
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.setAttribute('aSw', new THREE.BufferAttribute(ids, 1));
      g.setAttribute('aMet', new THREE.BufferAttribute(met, 1));
      g.setAttribute('aPiv', new THREE.BufferAttribute(piv, 3));
      return g;
    });
    swingMat = swingMaterial(kit.wood.map);
    const mesh = new THREE.Mesh(mergeGeometries(list, false), swingMat);
    mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = true;
    ctx.scene.add(mesh);
    for (const g of list) g.dispose();
    swingParts.length = 0;
  }

  // ================================================================ 4. cake stand, sponge, dome
  let domeMesh = null;
  {
    const K = KC.cake, y0 = TOP, cy = TOP + K.plateY;
    const stand = lathe([[0.0001, 0], [0.058, 0], [0.062, 0.0035], [0.055, 0.0085], [0.03, 0.013], [0.0135, 0.02], [0.0105, 0.032], [0.0145, 0.045], [0.0105, 0.058], [0.016, 0.066], [0.05, 0.0735], [0.12, 0.0775], [0.126, 0.0805], [0.1262, 0.0825], [0.1215, 0.0827], [0.0001, 0.0822]], lite ? 24 : 56);
    add(stand, kit.ceramic, K.x, y0, K.z, 0xf6f1e6, { cast: true });
    const ring = new THREE.TorusGeometry(0.1258, 0.0007, 4, lite ? 32 : 72); ring.rotateX(PI / 2);
    add(ring, kit.brass, K.x, y0 + 0.0826, K.z, 0xcaa24a, { cast: false });
    // The sponge: two layers, cream and jam between, a slice cut out facing the room.
    const cut0 = -PI / 2 - 0.36, cutLen = 0.72, t0 = cut0 + cutLen, L = PI * 2 - cutLen; // arc kept: from t0 for L
    const layer = (r, h, ya, mat, col, topCol) => {
      const g = new THREE.CylinderGeometry(r, r, h, lite ? 24 : 48, 1, false, t0, L);
      g.translate(0, ya + h / 2, 0);
      add(g, mat, K.x, cy, K.z, col, { cast: false });
      // The two cut faces.
      for (const edge of [0, 1]) {
        const th = edge === 0 ? t0 : t0 + L, s = Math.sin(th), c = Math.cos(th);
        const a = [0, ya, 0], b = [r * s, ya, r * c], cc = [r * s, ya + h, r * c], d = [0, ya + h, 0];
        add(edge === 0 ? quad(a, b, cc, d) : quad(b, a, d, cc), mat, K.x, cy, K.z, col, { cast: false });
      }
      void topCol;
    };
    layer(K.cakeR, 0.026, 0, kit.fabric, 0xdcab63);
    layer(K.cakeR + 0.0012, 0.0045, 0.026, kit.paint, 0xfbf3df);
    layer(K.cakeR + 0.0004, 0.0042, 0.0305, kit.enamel, 0xa8182a);
    layer(K.cakeR + 0.0012, 0.0045, 0.0347, kit.paint, 0xfbf3df);
    layer(K.cakeR, 0.0288, 0.0392, kit.fabric, 0xe0b56d);
    // Icing sugar on top: an irregular dusted disc, plus a few crumbs on the plate.
    const dust = new THREE.CircleGeometry(0.073, lite ? 12 : 22, t0 + 0.05, L - 0.1); dust.rotateX(-PI / 2);
    const pos = dust.attributes.position;
    for (let i = 1; i < pos.count; i++) { const k = 1 + (Math.sin(i * 12.9898) * 0.5) * 0.08; pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
    add(dust, kit.paper, K.x, cy + K.cakeH + 0.0008, K.z, 0xfffaf0, { cast: false });
    for (let i = 0; i < (lite ? 4 : 10); i++) {
      const a = rand() * PI * 2, rr = 0.092 + rand() * 0.018;
      add(ell(0.0022, 0.0013, 0.0022, 0, 0, 0, 5), kit.fabric, K.x + Math.sin(a) * rr, cy + 0.0012, K.z + Math.cos(a) * rr, 0xd8a45d, { cast: false });
    }
    // The glass dome: a loose body (see the sim module); its mesh follows it.
    const D = KC.dome;
    const prof = [[D.r, 0], [D.r + 0.0012, 0.0015], [D.r, 0.004]];
    for (let i = 0; i <= 14; i++) {
      const f = i / 14 * PI / 2;
      prof.push([D.r * Math.cos(f) * (1 - 0.0 * f), D.wallH + (D.h - D.wallH - 0.012) * Math.sin(f) * (0.55 + 0.45 * Math.sin(f))]);
    }
    prof.push([0.0125, D.h - 0.012], [0.0105, D.h - 0.004]);
    const shell = new THREE.LatheGeometry(prof.map((p) => V2(p[0], p[1])), lite ? 24 : 52);
    const knob = new THREE.SphereGeometry(0.0125, 14, 10); knob.translate(0, D.h + 0.001, 0);
    const neck = new THREE.CylinderGeometry(0.006, 0.0095, 0.008, 10); neck.translate(0, D.h - 0.007, 0);
    const bead = new THREE.TorusGeometry(D.r + 0.0004, 0.0016, 6, lite ? 24 : 52); bead.rotateX(PI / 2); bead.translate(0, 0.0018, 0);
    const mat = kit.glass.clone();
    mat.side = THREE.DoubleSide; mat.opacity = 0.2; mat.color.set(0xf2fbf8); mat.envMapIntensity = 1.6; mat.roughness = 0.03; mat.depthWrite = false;
    domeMesh = new THREE.Mesh(mergeGeometries([shell, knob, neck, bead].map((g) => (g.index ? g.toNonIndexed() : g)), false), mat);
    domeMesh.position.set(K.x, cy + 0.0006, K.z);
    domeMesh.castShadow = false; domeMesh.receiveShadow = false; domeMesh.renderOrder = 3;
    ctx.scene.add(domeMesh);
  }

  // ================================================================ 5. mortar, pestle, chopping board
  let pestleMesh = null;
  {
    const M = KC.mortar;
    const bowl = lathe([[0.0001, 0.0], [0.034, 0.0], ...smooth([[0.038, 0.002], [0.047, 0.012], [0.058, 0.03], [M.r, 0.046], [M.r - 0.002, 0.06], [M.r - 0.006, M.h]], 14), [M.r - 0.0105, M.h], ...smooth([[0.05, 0.058], [0.04, 0.04], [0.026, 0.024], [0.012, 0.0185]], 10), [0.0001, 0.0175]], lite ? 22 : 48);
    add(bowl, kit.stone, M.x, TOP, M.z, 0x93918c, { cast: true });
    // Pouring lip.
    add(ell(0.014, 0.006, 0.01, 0, 0, 0, 8), kit.stone, M.x - M.r + 0.002, TOP + M.h - 0.004, M.z, 0x93918c, { cast: false });
    // A few crushed peppercorns / a pinch of spice in the bowl.
    add(ell(0.02, 0.003, 0.02, 0, 0, 0, 10), kit.fabric, M.x, TOP + 0.0185, M.z, 0x4a3022, { cast: false });
    // Pestle (loose): a granite pestle lying beside it.
    const P = KC.pestle, half = P.len / 2;
    const pp = [[0.0001, -half], [P.r0 * 0.75, -half + 0.0008], [P.r0 * 0.95, -half + 0.006], [P.r0, -half + 0.012], [P.r1, half - 0.014], [P.r1 * 0.98, half - 0.008], [P.r1 * 0.8, half - 0.0012], [0.0001, half]];
    const pg = lathe(pp, lite ? 10 : 16);
    const pm = kit.stone.clone(); pm.color.set(0x8f8d88);
    pestleMesh = new THREE.Mesh(pg, pm);
    pestleMesh.castShadow = false; pestleMesh.receiveShadow = true; pestleMesh.matrixAutoUpdate = true;
    ctx.scene.add(pestleMesh);

    // Chopping board leaning on the tiles (beech with a handle and a hanging hole).
    const B = KC.board, a = B.lean;
    const sh = new THREE.Shape(), w = B.w / 2, ln = B.len - 0.07, rr = 0.016;
    sh.moveTo(-w + rr, -ln / 2); sh.lineTo(w - rr, -ln / 2); sh.quadraticCurveTo(w, -ln / 2, w, -ln / 2 + rr); sh.lineTo(w, ln / 2 - rr);
    sh.quadraticCurveTo(w, ln / 2, w - rr, ln / 2); sh.lineTo(0.03, ln / 2); sh.lineTo(0.03, ln / 2 + 0.058);
    sh.quadraticCurveTo(0.03, ln / 2 + 0.07, 0.018, ln / 2 + 0.07); sh.lineTo(-0.018, ln / 2 + 0.07); sh.quadraticCurveTo(-0.03, ln / 2 + 0.07, -0.03, ln / 2 + 0.058);
    sh.lineTo(-0.03, ln / 2); sh.lineTo(-w + rr, ln / 2); sh.quadraticCurveTo(-w, ln / 2, -w, ln / 2 - rr); sh.lineTo(-w, -ln / 2 + rr); sh.quadraticCurveTo(-w, -ln / 2, -w + rr, -ln / 2);
    const hole = new THREE.Path(); hole.absarc(0, ln / 2 + 0.042, 0.0085, 0, PI * 2, true); sh.holes.push(hole);
    const bg = new THREE.ExtrudeGeometry(sh, { depth: B.t - 0.004, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: lite ? 4 : 8 });
    bg.translate(0, -(ln / 2 + 0.035 - ln / 2) * 0 - 0.0, -(B.t - 0.004) / 2);
    scaleUV(bg, 4);
    // shape x -> world z (so the board is B.w wide along z), shape y -> up, thickness -> x.
    bg.rotateY(-PI / 2);
    const cx = WALL - 0.002 - (B.t / 2) * Math.cos(a) - (B.len / 2) * Math.sin(a), cy = TOP + (B.len / 2) * Math.cos(a) + (B.t / 2) * Math.sin(a);
    add(bg, kit.wood, cx, cy - 0.0175 * Math.cos(a), B.z, 0xe0bd86, { roll: -a, cast: true });
    // Worn knife marks and a jute loop through the hole.
    const loop = new THREE.TorusGeometry(0.009, 0.0016, 5, 12); loop.rotateY(PI / 2);
    add(loop, kit.fabric, cx + 0.0, cy - 0.0175 * Math.cos(a) + (ln / 2 + 0.042) * Math.cos(a) - 0.0, B.z, 0xb08e5a, { roll: -a, cast: false, pitch: 0 });
  }

  // ================================================================ 6. cookbook on a stand, storage jars
  let atlasMat = null;
  {
    const Bk = KC.book, W = Bk.w, H = Bk.h, t = Bk.tilt, bx = Bk.x, bz = Bk.z;
    const yoff = 0.016;
    const M = ctx.T(bx, TOP + yoff, bz, 0, 0, -t);
    const stand = 0xa8794a;
    // Stand: back board, ledge, foot and side struts.
    addM(scaleUV(box(0.012, H + 0.03, W + 0.03, 0.009, (H + 0.02) / 2, 0), 4), kit.wood, M, stand, { cast: true });
    addM(scaleUV(box(0.05, 0.009, W + 0.03, -0.021, 0.0045, 0), 4), kit.wood, M, stand, { cast: false });
    const foot = scaleUV(box(0.19, 0.012, W + 0.03, 0.04, 0.006, 0), 4);
    add(foot, kit.wood, bx, TOP, bz, stand, { cast: true });
    for (const s of [-1, 1]) {
      const sh = new THREE.Shape();
      sh.moveTo(-0.055, 0.012); sh.lineTo(0.135, 0.012); sh.lineTo(0.082, yoff + 0.17); sh.lineTo(-0.0, yoff + 0.045); sh.closePath();
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.008, bevelEnabled: false }); g.translate(0, 0, -0.004); scaleUV(g, 4);
      add(g, kit.wood, bx, TOP, bz + s * (W / 2 + 0.014), stand, { cast: false });
    }
    // Covers (red cloth) and page blocks.
    addM(box(0.004, H + 0.006, W + 0.008, -0.002, 0.01 + (H + 0.006) / 2, 0), kit.fabric, M, 0x7a2a22, { cast: true });
    const surf = (z) => -0.008 - 0.014 * Math.pow(Math.abs(z) / (W / 2), 1.4) - 0.0;
    const nz = 12, y0 = 0.014, y1 = 0.014 + H - 0.006;
    // Paper block sides and edges (closing the curved surface to the cover).
    const edge = [];
    for (let i = 0; i < nz; i++) {
      const za = -W / 2 + i / nz * W, zb = -W / 2 + (i + 1) / nz * W;
      for (const [y, flip] of [[y0, 0], [y1, 1]]) {
        const a = [-0.004, y, za], b = [-0.004, y, zb], c = [surf(zb), y, zb], d = [surf(za), y, za];
        edge.push(...(flip ? [...a, ...c, ...b, ...a, ...d, ...c] : [...a, ...b, ...c, ...a, ...c, ...d]));
      }
    }
    for (const [z, flip] of [[-W / 2, 0], [W / 2, 1]]) {
      const a = [-0.004, y0, z], b = [-0.004, y1, z], c = [surf(z), y1, z], d = [surf(z), y0, z];
      edge.push(...(flip ? [...a, ...b, ...c, ...a, ...c, ...d] : [...a, ...c, ...b, ...a, ...d, ...c]));
    }
    addM(tris(edge), kit.paper, M, 0xf1e8d2, { cast: false });
    // Ribbon bookmark and the curved printed pages (own mesh, atlas material).
    addM(box(0.0015, 0.1, 0.007, surf(0.02) - 0.0008, y1 - 0.045, 0.02), kit.fabric, M, 0xb02a28, { cast: false });
    const page = (side) => {
      const gx = 10, gy = 4, pos = [], uv = [], idx = [];
      for (let j = 0; j <= gy; j++) for (let i = 0; i <= gx; i++) {
        const u = i / gx, z = side < 0 ? -W / 2 + u * W / 2 : u * W / 2, v = j / gy;
        pos.push(surf(z) - 0.0003, y0 + v * (y1 - y0), z);
        uv.push(side < 0 ? u : 1 - u, v);   // placeholder, remapped below
      }
      for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
        const a = j * (gx + 1) + i, b = a + 1, c = a + gx + 1, d = c + 1;
        // Viewed from -x with +y up and +z to the right: a (z low) -> b (z high), a -> c (up). Front face is -x.
        idx.push(a, c, b, b, c, d);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx); g.computeVertexNormals();
      // UVs: left page uses atlas x 0..256, the right 256..512; u runs across z.
      const u2 = g.attributes.uv;
      for (let k = 0; k < u2.count; k++) {
        const ii = k % (gx + 1), uu = ii / gx, vv = Math.floor(k / (gx + 1)) / gy;
        u2.setXY(k, uu, vv);
      }
      atlasRegion(g, side < 0 ? 0 : 256, 0, 256, 400);
      g.applyMatrix4(M);
      return g;
    };
    const pages = mergeGeometries([page(-1), page(1)].map((g) => g.toNonIndexed()), false);

    // Three graduated stoneware storage jars with printed labels.
    const lab = [];
    KC.jars.forEach((J, i) => {
      const prof = [[0.0001, 0], [J.r - 0.004, 0], [J.r, 0.004], [J.r + 0.002, J.h * 0.25], [J.r + 0.002, J.h * 0.7], [J.r - 0.002, J.h * 0.86], [J.r * 0.82, J.h * 0.9], [J.r * 0.82, J.h * 0.93], [0.0001, J.h * 0.93]];
      add(lathe(prof, seg), kit.ceramic, J.x, TOP, J.z, 0xebe3cd, { cast: true });
      const band = new THREE.CylinderGeometry(J.r * 0.83, J.r * 0.83, 0.006, seg, 1, true);
      add(band, kit.ceramic, J.x, TOP + J.h * 0.912, J.z, 0x2f4f7a, { cast: false });
      const rim = new THREE.TorusGeometry(J.r * 0.82, 0.0018, 6, seg); rim.rotateX(PI / 2);
      add(rim, kit.ceramic, J.x, TOP + J.h * 0.925, J.z, 0xe0d6bd, { cast: false });
      // Wooden lid and knob.
      add(lathe([[0.0001, 0], [J.r * 0.86, 0], [J.r * 0.9, 0.003], [J.r * 0.9, 0.009], [J.r * 0.6, 0.0125], [0.0001, 0.0125]], seg), kit.wood, J.x, TOP + J.h * 0.93, J.z, 0x9a6a3e, { cast: false });
      add(ell(0.011, 0.0105, 0.011, 0, 0, 0, 10), kit.wood, J.x, TOP + J.h * 0.93 + 0.0185, J.z, 0x9a6a3e, { cast: false });
      // Label on the face towards the room (-x).
      const arc = 1.35, g = new THREE.CylinderGeometry(J.r + 0.0023, J.r + 0.0023, J.h * 0.3 * (i === 2 ? 1.1 : 1), 14, 1, true, -PI / 2 - arc / 2 + PI - PI, arc);
      g.translate(J.x, TOP + J.h * 0.5, J.z);
      atlasRegion(g, i * 170 + 1, 410, 168, 100);
      lab.push(g);
    });
    const atlasGeo = mergeGeometries([pages, ...lab.map((g) => (g.index ? g.toNonIndexed() : g))], false);
    atlasMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, metalness: 0, side: THREE.DoubleSide });
    const am = new THREE.Mesh(atlasGeo, atlasMat);
    am.castShadow = false; am.receiveShadow = true;
    ctx.scene.add(am);
  }

  // ================================================================ animation
  const sim = ctx.sim, mod = sim && sim.extras && sim.extras.mods ? sim.extras.mods.kitchenCounter : null;
  const uSw = swingMat.userData.uSw.value;
  const ST = [];
  for (let i = 0; i < 11; i++) ST.push({ a: 0, av: 0, b: 0, bv: 0, crock: i < 6, z: 0 });
  const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _w = new THREE.Vector3();
  let clock = 0, lastSound = 0, energy = 0, wasLive = false;
  const nearCounter = (sim2) => {
    const A = sim2 && sim2.air;
    if (!A || A.calm) return false;
    for (const wk of A.wakes) {
      if (!wk.active) continue;
      if (wk.hub.x > 1.0 && wk.hub.z > -1.8 && wk.hub.z < 1.9) return true;
      if (wk.vg && wk.hit.x > 1.0 && wk.hit.z > -1.8 && wk.hit.z < 1.9) return true;
    }
    return false;
  };
  const ring = (s, kind, str) => {
    const A = ctx.audio;
    if (!A || !A.ready || clock - lastSound < 0.07) return;
    lastSound = clock;
    const o = A.spot(s, 1, 3);
    if (kind === 'wood') {
      const f = 760 + Math.random() * 380;
      A.tone({ freq: f, to: f * 0.8, type: 'triangle', gain: 0.012 + 0.03 * str, attack: 0.001, decay: 0.045, out: o });
      A.noiseBurst({ freq: 1800, q: 1.2, gain: 0.012 + 0.02 * str, decay: 0.03, out: o });
    } else {
      const f = 2300 + Math.random() * 900;
      A.tone({ freq: f, type: 'sine', gain: 0.01 + 0.026 * str, attack: 0.001, decay: 0.22, out: o });
      A.tone({ freq: f * 2.76, type: 'sine', gain: 0.006 + 0.012 * str, attack: 0.001, decay: 0.1, out: o });
    }
  };
  const _s = { x: 0, y: 0, z: 0 };
  const tools = [];
  for (let i = 0; i < 11; i++) {
    const c = i < 6, info = toolInfo[i];
    tools.push({ id: i, x: info.x, y: c ? info.y + 0.1 : info.y - 0.1, z: info.z, crock: c });
  }

  // Loose bodies' meshes.
  const proxies = [];
  const posed = { kdome: -9, kpestle: -9 };
  const meshOf = { kdome: domeMesh, kpestle: pestleMesh };
  const restPose = (m) => { m.position.copy(m.userData.home); m.quaternion.copy(m.userData.hq); };
  void restPose;
  if (mod) {
    for (const l of mod.loose) {
      const m = meshOf[l.id];
      if (!m) continue;
      const id = l.id;
      ctx.replayProxy(id, (o) => { posed[id] = clock; m.position.copy(o.position); m.quaternion.copy(o.quaternion); });
      proxies.push([l, m]);
      l.track.sample(1, _p, _q); m.position.copy(_p); m.quaternion.copy(_q);
    }
  }

  registerExtraSound('glassKnock', (audio, e, now) => {
    if (now - (audio._glassT || 0) < 0.05) return;
    audio._glassT = now;
    const s = e.strength ?? 0.5, o = audio.spot(e.pos);
    const f = 2600 + Math.random() * 500;
    audio.tone({ freq: f, type: 'sine', gain: 0.03 + 0.07 * s, attack: 0.001, decay: 0.3, out: o });
    audio.tone({ freq: f * 1.53, type: 'sine', gain: 0.02 + 0.04 * s, attack: 0.001, decay: 0.2, out: o });
    audio.tone({ freq: f * 2.4, type: 'sine', gain: 0.012 + 0.02 * s, attack: 0.001, decay: 0.12, out: o });
    audio.noiseBurst({ freq: 3600, q: 1.2, gain: 0.02 + 0.04 * s, decay: 0.03, out: o });
  });
  registerExtraSound('stoneKnock', (audio, e, now) => {
    if (now - (audio._stoneT || 0) < 0.05) return;
    audio._stoneT = now;
    const s = e.strength ?? 0.5, o = audio.spot(e.pos);
    const f = 420 + Math.random() * 120;
    audio.tone({ freq: f, to: f * 0.8, type: 'triangle', gain: 0.04 + 0.1 * s, attack: 0.001, decay: 0.08, out: o });
    audio.noiseBurst({ freq: 1200, q: 0.9, gain: 0.03 + 0.07 * s, decay: 0.05, out: o });
  });

  return {
    update(dt, sim2) {
      clock += dt;
      // Loose bodies follow the physics (unless a replay is posing them).
      for (const [l, m] of proxies) {
        if (clock - posed[l.id] < 0.25) continue;
        l.track.sample(1, _p, _q);
        if (_p.distanceToSquared(m.position) < 1e-12 && Math.abs(_q.dot(m.quaternion)) > 0.9999999) continue;
        m.position.copy(_p); m.quaternion.copy(_q);
      }
      // Swinging tools.
      const live = nearCounter(sim2);
      if (!live && energy < 1e-4 && !wasLive) return;
      wasLive = live || energy > 1e-4;
      let en = 0;
      const step = Math.min(dt, 1 / 30);
      for (let i = 0; i < 11; i++) {
        const s = ST[i], t = tools[i];
        let wx = 0, wz = 0, sp = 0;
        if (live) {
          _p.set(t.x, t.y, t.z);
          ctx.airAt(_p, _a);
          for (const wk of sim2.air.wakes) {      // a wake landing on the worktop spreads along it: add the jet's push
            if (!wk.active || !wk.vg) continue;
            const dx = t.x - wk.hit.x, dz = t.z - wk.hit.z, r = Math.hypot(dx, dz);
            if (r > 0.8) continue;
            const f = wk.vg * Math.exp(-r / 0.25) * 0.8;
            _a.x += dx / (r + 0.03) * f; _a.z += dz / (r + 0.03) * f;
          }
          wx = _a.x; wz = _a.z; sp = Math.hypot(wx, wz, _a.y);
        }
        if (s.crock) {
          // Spoons rattle: a stiff, lightly damped spring shaken by the wash.
          const w = 24, zeta = 0.06, shake = Math.min(1, sp * 0.4) * 0.05;
          const ta = Math.max(-0.08, Math.min(0.08, wx * 0.02)) + Math.sin(clock * (37 + i * 5.3) + i) * shake;
          const tb = Math.max(-0.08, Math.min(0.08, -wz * 0.02)) + Math.cos(clock * (33 + i * 4.1) + i * 2) * shake;
          s.av += (w * w * (ta - s.a) - 2 * zeta * w * s.av) * step; s.a += s.av * step;
          s.bv += (w * w * (tb - s.b) - 2 * zeta * w * s.bv) * step; s.b += s.bv * step;
          const lim = 0.1;
          if (Math.abs(s.a) > lim) { if (Math.abs(s.av) > 0.9 && Math.abs(s.a) > lim) ring({ x: t.x, y: t.y, z: t.z }, 'wood', Math.min(1, Math.abs(s.av) / 3)); s.a = Math.sign(s.a) * lim; s.av *= -0.4; }
          if (Math.abs(s.b) > lim) { if (Math.abs(s.bv) > 0.9) ring({ x: t.x, y: t.y, z: t.z }, 'wood', Math.min(1, Math.abs(s.bv) / 3)); s.b = Math.sign(s.b) * lim; s.bv *= -0.4; }
        } else {
          // Hanging tools: pendulums (about 1.3 Hz), pushed off the wall by air moving away from it.
          const w = 8.5, zeta = 0.07;
          const ta = Math.max(-0.95, Math.min(0.02, wx * 0.14)) + Math.sin(clock * (9 + i) + i * 2) * Math.min(0.05, sp * 0.015);
          const tb = Math.max(-0.7, Math.min(0.7, -wz * 0.12)) + Math.cos(clock * (7.3 + i) + i) * Math.min(0.04, sp * 0.012);
          s.av += (w * w * (ta - s.a) - 2 * zeta * w * s.av) * step; s.a += s.av * step;
          s.bv += (w * w * (tb - s.b) - 2 * zeta * w * s.bv) * step; s.b += s.bv * step;
          if (s.a > 0.015) { if (s.av > 0.5) ring({ x: t.x, y: t.y, z: t.z }, i === 6 || i === 7 || i === 10 ? 'steel' : 'wood', Math.min(1, s.av / 2.5)); s.a = 0.015; s.av *= -0.35; }
          // Neighbouring tools knock together when they swing towards each other.
          if (i > 6) { const o = ST[i - 1]; if (Math.abs(s.b - o.b) < 0.02 && Math.abs(s.bv - o.bv) > 1.3 && Math.abs(s.b) > 0.1) ring({ x: t.x, y: t.y, z: t.z }, 'steel', Math.min(1, Math.abs(s.bv - o.bv) / 3)); }
        }
        en += Math.abs(s.a) + Math.abs(s.b) + Math.abs(s.av) * 0.1 + Math.abs(s.bv) * 0.1;
        uSw[i].set(s.a, s.b, 0, 0);
      }
      energy = en;
      if (!live && en < 1e-4) { for (let i = 0; i < 11; i++) { const s = ST[i]; s.a = s.b = s.av = s.bv = 0; uSw[i].set(0, 0, 0, 0); } energy = 0; wasLive = false; }
      void _w; void _s;
    },
  };
}
