import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { registerExtraSound } from '../../audio/extras.js';
import { ROOM } from '../../sim/layout.js';
import { RACK, panFrame } from '../../sim/extras/panRack.js';
import { Batcher, T } from '../batch.js';

// The copper pan rack: the wrought-iron frame, chains and ceiling hooks are merged into one static mesh;
// every hanging pan (copper, tin lining, iron or brass handle, S-hook) is one bone of a single skinned
// mesh, so the lot is two draw calls. Per-vertex surface values (roughness, metalness) let one material
// carry aged copper, bright tin, cast iron and brass.

const _p = new THREE.Vector3(), _q = new THREE.Quaternion();

// ---------------------------------------------------------------- sound: a ringing clang, sized by the pan
let lastClang = 0;
registerExtraSound('panClang', (audio, e, now) => {
  if (now - lastClang < 0.035) return;
  lastClang = now;
  const o = audio.spot(e.pos);
  const s = Math.max(0.15, Math.min(1, e.strength || 0.4));
  const f0 = (e.ladle ? 900 : 300) * Math.pow(0.1 / Math.max(0.03, e.size || 0.1), 0.7) * (0.97 + Math.random() * 0.06);
  // Inharmonic partials of a thin metal dish: a bright strike that rings down to a warm hum.
  const parts = [[1, 1, 1.4], [2.29, 0.55, 0.9], [3.98, 0.35, 0.55], [5.81, 0.2, 0.32]];
  for (const [r, g, d] of parts) audio.tone({ freq: f0 * r, to: f0 * r * 0.996, type: 'sine', gain: 0.045 * g * s, attack: 0.002, decay: d * (e.ladle ? 0.4 : 0.6 + 0.6 * s), out: o });
  audio.noiseBurst({ freq: 2600 + Math.random() * 900, q: 2.2, gain: 0.05 * s, attack: 0.001, decay: 0.03, out: o });
  if (e.other === 'heli') audio.noiseBurst({ freq: 5200, q: 4, gain: 0.03 * s, decay: 0.05, out: o, delay: 0.004 });
});

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  return t;
}

// Spun-and-brushed copper: fine concentric streaks (along the lathe's u) and soft blotches of age.
function brushedTexture(size) {
  return canvasTex(size, size, (c, W, H) => {
    let s = 5;
    const r = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    c.fillStyle = '#dcdcdc'; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 26; i++) {
      const x = r() * W, y = r() * H, rad = 25 + r() * 70;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      const dark = r() < 0.6;
      g.addColorStop(0, dark ? 'rgba(110,100,90,0.09)' : 'rgba(255,250,240,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      for (const ox of [-W, 0, W]) for (const oy of [-H, 0, H]) { c.save(); c.translate(ox, oy); c.fillRect(x - rad, y - rad, rad * 2, rad * 2); c.restore(); }
    }
    for (let i = 0; i < 900; i++) {
      const y = r() * H, a = 0.015 + r() * 0.035, l = W * (0.2 + r() * 0.8), x = r() * W;
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(60,55,50,${a})`;
      c.fillRect(x, y, l, 1); c.fillRect(x - W, y, l, 1);
    }
  });
}

// ---------------------------------------------------------------- the hanging things
const COPPER = [0.80, 0.42, 0.25], TIN = [0.66, 0.66, 0.64], IRON = [0.07, 0.068, 0.065], BRASS = [0.78, 0.6, 0.3];
const S_COPPER = [0.4, 1], S_TIN = [0.42, 1], S_IRON = [0.6, 0.55], S_BRASS = [0.32, 1];

function paint(g, col, surf, bone) {
  if (g.index) g = g.toNonIndexed();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const n = g.attributes.position.count;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
  const c = new Float32Array(n * 3), sf = new Float32Array(n * 2), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { c.set(col, i * 3); sf.set(surf, i * 2); si[i * 4] = bone; sw[i * 4] = 1; }
  g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  g.setAttribute('aSurf', new THREE.Float32BufferAttribute(sf, 2));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  return g;
}

// Lathe profile [radius, y] pairs -> geometry (axis +y).
// UVs in real size (one texture repeat per ~12 cm, whole repeats around so the seam closes).
function lathe(pts, seg) {
  const g = new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(Math.max(1e-4, x), y)), seg);
  const rMax = Math.max(...pts.map((q) => q[0]));
  const ru = Math.max(1, Math.round(2 * Math.PI * rMax / 0.12));
  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const uv = g.attributes.uv, n = pts.length;
  const pos = g.attributes.position, yMin = Math.min(...pts.map((q) => q[1])), yMax = Math.max(...pts.map((q) => q[1]));
  for (let i = 0; i < uv.count; i++) {
    const j = i % n;
    // The flat base takes straight brushing (no pinch at the pole); the walls wrap round.
    if (pts[j][1] - yMin < 0.006 && pts[j][0] < rMax * 0.9 && yMax - yMin > 0.02) uv.setXY(i, pos.getX(i) / 0.12, pos.getZ(i) / 0.12);
    else uv.setXY(i, uv.getX(i) * ru, arc[j] / 0.12);
  }
  return g;
}

function panParts(p, lite) {
  const seg = lite ? 24 : 48;
  const out = []; // [geometry in P frame, colour, surface]
  const tint = (c) => c.map((v, i) => v * p.tint[i]);
  const wall = 0.0022;
  if (p.kind === 'ladle') {
    // A deep hemispherical bowl, tinned inside, rolled rim.
    const R = p.r, outer = [], inner = [];
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + (i / 12) * Math.PI / 2; outer.push([Math.cos(a) * R, R + Math.sin(a) * R]); }
    for (let i = 12; i >= 0; i--) { const a = -Math.PI / 2 + (i / 12) * Math.PI / 2; inner.push([Math.cos(a) * (R - wall), R + Math.sin(a) * (R - wall)]); }
    out.push([lathe(outer, seg), tint(COPPER), S_COPPER]);
    out.push([lathe(inner, seg), TIN, S_TIN]);
    out.push([new THREE.TorusGeometry(R - wall / 2, 0.0022, 6, seg).rotateX(Math.PI / 2).translate(0, R, 0), tint(COPPER), S_COPPER]);
  } else {
    const R = p.r, D = p.d, skillet = p.kind === 'skillet';
    const rb = skillet ? R * 0.74 : R * 0.97, rc = skillet ? 0.012 : 0.009;
    const outer = [[0, 0]], inner = [];
    outer.push([rb - rc, 0]);
    for (let i = 1; i <= 5; i++) { const a = (i / 5) * Math.PI / 2; outer.push([rb - rc + Math.sin(a) * rc, rc - Math.cos(a) * rc]); }
    for (let i = 1; i <= 10; i++) {
      const t = i / 10;
      const rr = skillet ? rb + (R - rb) * (1 - Math.pow(1 - t, 1.6)) : rb + (R - rb) * t;
      outer.push([rr, rc + (D - rc) * t]);
    }
    for (let i = 10; i >= 0; i--) { const pt = outer[outer.length - 11 + i]; inner.push([pt[0] - wall, Math.max(wall, pt[1])]); }
    inner.push([0, wall]);
    out.push([lathe(outer, seg), tint(COPPER), S_COPPER]);
    out.push([lathe(inner, seg), TIN, S_TIN]);
    // Rolled rim, and a faint hammered band where copper meets tin.
    out.push([new THREE.TorusGeometry(R - wall / 2, 0.0026, 6, seg).rotateX(Math.PI / 2).translate(0, D, 0), tint(COPPER), S_COPPER]);
  }
  // Handle: a cast strap from the wall to a flattened, pierced end.
  const hc = p.handle === 'brass' ? BRASS : IRON, hs = p.handle === 'brass' ? S_BRASS : S_IRON;
  const f = panFrame(p), dir = new THREE.Vector3(Math.cos(f.ang), Math.sin(f.ang), 0);
  const len = f.A.distanceTo(f.B);
  const ringR = p.kind === 'ladle' ? 0.007 : 0.0095;
  const strapLen = len - ringR;
  const mid = f.A.clone().addScaledVector(dir, strapLen / 2);
  const wide = p.kind === 'ladle' ? 0.011 : 0.02, thick = p.kind === 'ladle' ? 0.003 : 0.0065;
  const strap = new THREE.BoxGeometry(strapLen, thick, wide, 6, 1, 1);
  // Taper: narrower towards the end, a little waisted in the middle.
  const pos = strap.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const t = pos.getX(i) / strapLen + 0.5;
    pos.setZ(i, pos.getZ(i) * (1 - 0.3 * t - 0.12 * Math.sin(t * Math.PI)));
  }
  strap.computeVertexNormals();
  const m = new THREE.Matrix4().makeRotationZ(Math.atan2(dir.y, dir.x)).setPosition(mid);
  out.push([strap.applyMatrix4(m), hc, hs]);
  // The pierced end: a flat ring around the hanging hole (its axis across the strap, in the pan's plane).
  const ringM = new THREE.Matrix4().makeRotationZ(Math.atan2(dir.y, dir.x)).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  out.push([new THREE.TorusGeometry(ringR * 0.72, ringR * 0.36, 8, 16).scale(1, 1, thick / (ringR * 0.72)).applyMatrix4(ringM).translate(f.B.x, f.B.y, f.B.z), hc, hs]);
  if (p.kind !== 'ladle') {
    // A riveted foot on the pan wall: a short plate and two rivet heads.
    const foot = new THREE.BoxGeometry(0.03, thick * 0.8, wide * 1.15).applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI / 2)).translate(p.r + 0.003, f.A.y - 0.004, 0);
    out.push([foot, hc, hs]);
    for (const z of [-wide * 0.3, wide * 0.3]) out.push([new THREE.SphereGeometry(0.0032, 8, 6).scale(0.5, 1, 1).translate(p.r - wall - 0.0005, f.A.y - 0.004, z), TIN, S_TIN]);
    for (const z of [-wide * 0.3, wide * 0.3]) out.push([new THREE.SphereGeometry(0.0034, 8, 6).scale(0.6, 1, 1).translate(p.r + 0.0065, f.A.y - 0.004, z), hc, hs]);
  }
  return out;
}

// S-hook in the body frame: over the rail (centre at y = -bar), down the shank, round through the hole.
function sHook(lite) {
  const bar = RACK.bar, rc = bar + 0.0045, rb = 0.0075, pts = [];
  const top = new THREE.Vector3(0, -bar, 0), bot = new THREE.Vector3(0, -RACK.hook + rb, 0);
  for (let i = 0; i <= 10; i++) { const a = -0.7 + (i / 10) * (Math.PI + 0.7); pts.push(new THREE.Vector3(Math.cos(a) * rc, -bar + Math.sin(a) * rc, 0)); }
  for (let i = 1; i <= 3; i++) pts.push(new THREE.Vector3(-rc + (rc - rb) * (i / 4), top.y + (bot.y - top.y) * (i / 4), 0));
  for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * (Math.PI + 0.7); pts.push(new THREE.Vector3(Math.cos(a) * rb, bot.y + Math.sin(a) * rb, 0)); }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), lite ? 24 : 48, 0.0023, lite ? 5 : 7, false);
}

export function build(ctx) {
  const sim = ctx.sim;
  const mod = sim && sim.extras && sim.extras.mods.panRack;
  if (!mod || !mod.items) return {};
  const R = RACK, lite = ctx.lite;

  // ---------------------------------------------------------------- the rack (static)
  const b = new Batcher();
  const iron = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.58, metalness: 0.65 });
  const IRONC = 0x1e1d1c;
  const cz = (R.z0 + R.z1) / 2, cx = (R.x0 + R.x1) / 2, len = R.z1 - R.z0, wid = R.x1 - R.x0;
  const radial = lite ? 8 : 12;
  for (const x of [R.x0, R.x1]) b.add(new THREE.CylinderGeometry(R.bar, R.bar, len + 0.03, radial), iron, T(x, R.y, cz, 0, Math.PI / 2), IRONC);
  for (const z of [R.z0, R.z1, cz]) b.add(new THREE.BoxGeometry(wid, 0.012, 0.005), iron, T(cx, R.y, z), IRONC); // flat cross straps
  // A flat spine along the middle and straps at the quarters: a plain forged grid.
  b.add(new THREE.BoxGeometry(0.005, 0.012, len), iron, T(cx, R.y, cz), IRONC);
  for (const t of [0.25, 0.75]) b.add(new THREE.BoxGeometry(wid, 0.012, 0.005), iron, T(cx, R.y, R.z0 + len * t), IRONC);
  // Two spare S-hooks.
  for (const [x, z] of [[R.x0, -0.68], [R.x1, -0.88]]) b.add(sHook(lite), iron, T(x, R.y + R.bar, z, x === R.x0 ? 0 : Math.PI), IRONC);
  // Ball finials at the rail ends.
  for (const x of [R.x0, R.x1]) for (const z of [R.z0 - 0.018, R.z1 + 0.018]) b.add(new THREE.SphereGeometry(0.0105, 12, 8), iron, T(x, R.y, z), IRONC);
  // Ceiling plates and eye hooks, and the chains to the corners.
  const linkA = new THREE.TorusGeometry(0.0055, 0.0016, lite ? 4 : 6, lite ? 8 : 12).scale(1, 1.55, 1);
  for (const [hx, hz] of R.hangers) {
    b.add(new THREE.CylinderGeometry(0.035, 0.038, 0.008, 20), iron, T(hx, ROOM.ceilingY - 0.004, hz), IRONC);
    b.add(new THREE.TorusGeometry(0.009, 0.0025, 6, 14), iron, T(hx, ROOM.ceilingY - 0.019, hz, Math.PI / 2), IRONC);
    for (const x of [R.x0, R.x1]) {
      const z = hz < cz ? R.z0 : R.z1;
      const a = new THREE.Vector3(hx, ROOM.ceilingY - 0.027, hz), e = new THREE.Vector3(x, R.y + R.bar + 0.004, z);
      const d = e.clone().sub(a), L = d.length(), n = Math.max(2, Math.round(L / 0.0135));
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      for (let i = 0; i < n; i++) {
        const c = a.clone().addScaledVector(d, (i + 0.5) / n * L);
        const tw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), (i % 2) * Math.PI / 2 + 0.3);
        const m = new THREE.Matrix4().compose(c, q.clone().multiply(tw), new THREE.Vector3(1, 1, 1));
        b.add(linkA, iron, m, IRONC);
      }
    }
  }
  b.build(ctx.scene).forEach((m) => { m.castShadow = true; m.receiveShadow = true; });

  // ---------------------------------------------------------------- the pans (one skinned mesh)
  const geos = [], bones = [];
  mod.items.forEach((it, bi) => {
    const f = it.frame;
    for (const [g, col, surf] of panParts(it.def, lite)) geos.push(paint(g.applyMatrix4(f.M), col, surf, bi));
    geos.push(paint(sHook(lite), IRON, S_IRON, bi));
    const bone = new THREE.Bone();
    bones.push(bone);
  });
  const geo = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  const tex = brushedTexture(lite ? 256 : 512);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughnessMap: tex, metalness: 1, roughness: 1 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aSurf;\nvarying vec2 vSurf;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSurf = aSurf;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vSurf;')
      // The brushed map darkens and roughens copper most, tin a little, iron hardly (it is near black).
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = clamp(vSurf.x * (1.55 - 0.6 * texelRoughness.g), 0.05, 1.0);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = vSurf.y;');
  };
  mat.customProgramCacheKey = () => 'pan-rack-skinned';
  const mesh = new THREE.SkinnedMesh(geo, mat);
  for (const bone of bones) mesh.add(bone);
  const skeleton = new THREE.Skeleton(bones, bones.map(() => new THREE.Matrix4()));
  mesh.bind(skeleton, new THREE.Matrix4());
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(cx, R.y - 0.2, cz), 0.75);
  ctx.scene.add(mesh);

  const pose = (i, p, q) => { bones[i].position.copy(p); bones[i].quaternion.copy(q); };
  mod.items.forEach((it, i) => { it.track.sample(1, _p, _q); pose(i, _p, _q); });
  mod.items.forEach((it, i) => ctx.replayProxy(it.def.id, (o) => pose(i, o.position, o.quaternion)));

  return {
    mesh,
    update() { for (let i = 0; i < bones.length; i++) { mod.items[i].track.sample(1, _p, _q); pose(i, _p, _q); } },
  };
}
