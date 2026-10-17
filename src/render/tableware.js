import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// The pieces in the first view from the launch pad: the Brown Betty teapot and the turned-oak tea stand.
// Each is merged into one geometry per material, so the detail costs vertices, not draw calls.

const V2 = (x, y) => new THREE.Vector2(x, y);
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };

// Smooth points through a list of control points (a Catmull-Rom spline in the lathe's r-y plane).
function spline(pts, n) {
  return new THREE.SplineCurve(pts).getPoints(n);
}

// A tube swept along a curve with a varying (optionally elliptical) section. rings: [t, rx, ry, back]
// samples; back > 0 steps the ring back along the curve by that much (for a lip turning into the bore).
// slant tips the rings at the curve's end towards a level cut (a spout's mouth). Returns an indexed
// geometry with position, normal and uv.
function sweep(curve, rings, radial = 16, slant = 0) {
  const frames = curve.computeFrenetFrames(64, false);
  const pos = [], uv = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3(), T = new THREE.Vector3();
  rings.forEach(([t, rx, ry, back = 0], j) => {
    curve.getPointAt(t, P);
    const f = Math.min(64, Math.round(t * 64));
    N.copy(frames.normals[f]); B.copy(frames.binormals[f]); T.copy(frames.tangents[f]);
    P.addScaledVector(T, -back);
    for (let i = 0; i <= radial; i++) {
      const a = i / radial * Math.PI * 2;
      const ox = N.x * Math.cos(a) * rx + B.x * Math.sin(a) * ry, oy = N.y * Math.cos(a) * rx + B.y * Math.sin(a) * ry, oz = N.z * Math.cos(a) * rx + B.z * Math.sin(a) * ry;
      const k = t > 0.999 ? slant * (ox * T.y - oy * T.x) : 0; // shift along the tangent by the offset's height across the curve
      pos.push(P.x + ox + T.x * k, P.y + oy + T.y * k, P.z + oz + T.z * k);
      uv.push(i / radial, j / (rings.length - 1));
    }
  });
  const idx = [];
  for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < radial; i++) {
    const a = j * (radial + 1) + i, b = a + 1, c = a + radial + 1, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- Brown Betty teapot
// A squat round pot in dark Rockingham glaze: an unglazed biscuit foot, a gallery the lid drops into,
// a domed lid with a ball knob, a tapered spout with an open mouth and a strap handle. The glaze is
// coloured per vertex: it pools darker low on the belly and thins to amber over rims and edges.
export function teapotGeometry(T) {
  const R = T.bodyR, H = T.bodyH;
  // Body: foot ring, belly, shoulder, gallery lip, then the ledge the lid sits on.
  const belly = spline([V2(R * 0.72, 0.011), V2(R * 0.86, 0.02), V2(R * 0.97, 0.042), V2(R, 0.062), V2(R * 0.96, 0.086),
    V2(R * 0.84, 0.106), V2(R * 0.68, H - 0.011), V2(R * 0.62, H - 0.008)], 34);
  const body = [V2(0.0001, 0.0015), V2(R * 0.6, 0.0015), V2(R * 0.64, 0), V2(R * 0.68, 0), V2(R * 0.7, 0.005), V2(R * 0.71, 0.009),
    ...belly, V2(R * 0.625, H - 0.003), V2(R * 0.61, H), V2(R * 0.585, H - 0.001), V2(R * 0.575, H - 0.008), V2(R * 0.54, H - 0.011), V2(0.0001, H - 0.011)];
  const bodyG = new THREE.LatheGeometry(body, 56);
  // Lid: flange in the gallery, a low dome, a short neck and the ball knob (its top at T.knobY).
  const kr = 0.0105, kc = T.knobY - kr;
  const lid = [V2(0.0001, H - 0.009), V2(R * 0.55, H - 0.009), V2(R * 0.57, H - 0.002), V2(R * 0.575, H + 0.002),
    ...spline([V2(R * 0.57, H + 0.003), V2(R * 0.5, H + 0.013), V2(R * 0.32, H + 0.022), V2(R * 0.13, H + 0.027)], 10),
    V2(0.0075, kc - kr * 0.75), V2(0.0062, kc - kr * 0.55)];
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + 0.55 + i / 8 * (Math.PI - 0.55); lid.push(V2(Math.max(0.0001, Math.cos(a) * kr), kc + Math.sin(a) * kr)); }
  const lidG = new THREE.LatheGeometry(lid, 40);
  // Spout: rooted low on the belly, tapering as it rises; the mouth turns in to a dark bore.
  const sc = new THREE.CatmullRomCurve3([new THREE.Vector3(R * 0.84, 0.046, 0), new THREE.Vector3(R + 0.006, 0.062, 0),
    new THREE.Vector3(R + 0.021, 0.088, 0), new THREE.Vector3(R + 0.034, 0.118, 0), new THREE.Vector3(R + 0.047, 0.14, 0)]);
  const sr = (t) => 0.0175 - 0.0088 * Math.pow(t, 0.8);
  const sRings = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; const r = sr(t) * (1 + 0.45 * (1 - smooth(0, 0.28, t))); sRings.push([t, r, r * (t < 0.3 ? 0.88 : 1)]); }
  const tip = sr(1);
  sRings.push([1, tip * 0.98, tip * 0.98, -0.0008], [1, tip * 0.68, tip * 0.68, -0.0006], [1, tip * 0.66, tip * 0.66, 0.006], [1, 0.0002, 0.0002, 0.0065]);
  const spoutG = sweep(sc, sRings, 18, 0.5);
  // Handle: a strap loop from the shoulder to the lower belly, flared where it joins the body.
  const hc = new THREE.CatmullRomCurve3([new THREE.Vector3(-R * 0.8, 0.106, 0), new THREE.Vector3(-R - 0.022, 0.118, 0),
    new THREE.Vector3(-R - 0.05, 0.1, 0), new THREE.Vector3(-R - 0.056, 0.068, 0), new THREE.Vector3(-R - 0.036, 0.04, 0), new THREE.Vector3(-R * 0.9, 0.03, 0)]);
  const hRings = [];
  for (let i = 0; i <= 28; i++) { const t = i / 28; const flare = 1 + 0.7 * (1 - smooth(0, 0.14, t)) + 0.6 * smooth(0.86, 1, t); hRings.push([t, 0.0058 * flare, 0.0092 * flare]); }
  const handleG = sweep(hc, hRings, 12);

  // Merge (all indexed, normals kept), then colour by vertex.
  const parts = [bodyG, lidG, spoutG, handleG];
  for (const g of parts) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const geo = mergeGeometries(parts, false);
  const p = geo.attributes.position, n = geo.attributes.normal, col = new Float32Array(p.count * 3);
  const dark = new THREE.Color(0x2a1208), mid = new THREE.Color(0x45200d), amber = new THREE.Color(0x7a3c1a), biscuit = new THREE.Color(0xb98a62), bore = new THREE.Color(0x160904);
  const c = new THREE.Color();
  const spoutStart = bodyG.attributes.position.count + lidG.attributes.position.count;
  const spoutEnd = spoutStart + spoutG.attributes.position.count;
  const tipStart = spoutEnd - 3 * (18 + 1); // the last three rings: the lip's inner edge and the bore
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), r = Math.hypot(x, z);
    // Glaze pools in the lower belly and runs thin over the shoulder, the gallery lip and the knob.
    let k = 0.55 - 0.35 * smooth(0.045, 0.012, y) + 0.25 * smooth(0.1, 0.13, y) * (r > R * 0.55 ? 1 : 0.4);
    k += 0.35 * smooth(T.knobY - 0.008, T.knobY, y);
    k += (hash(Math.round(x * 400), Math.round(y * 400), Math.round(z * 400)) - 0.5) * 0.12;
    k += 0.18 * Math.max(0, n.getY(i)) * smooth(0.09, 0.13, y);
    k = Math.min(1, Math.max(0, k));
    if (k < 0.5) c.copy(dark).lerp(mid, k * 2); else c.copy(mid).lerp(amber, (k - 0.5) * 2);
    if (y < 0.006 && i < spoutStart) c.copy(biscuit).multiplyScalar(0.9 + 0.1 * hash(x * 900, z * 900, 1));
    if (i >= tipStart && i < spoutEnd) c.copy(bore);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  for (const g of parts) g.dispose();
  return geo;
}

// ---------------------------------------------------------------- tea stand
// Oak plinth with a moulded edge, two turned posts with acorn finials, a crossbar with collars, brass
// pegs on little rosettes, and a brass plaque. Dimensions follow the station's colliders (layout.js).
let plaqueTex = null;
function plaqueTexture() {
  if (plaqueTex) return plaqueTex;
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const x = c.getContext('2d', { willReadFrequently: true });
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#e8c477'); g.addColorStop(0.45, '#c9a050'); g.addColorStop(1, '#a37a33');
  x.fillStyle = g; x.fillRect(0, 0, 512, 128);
  // brushed lines
  for (let i = 0; i < 128; i++) { x.fillStyle = `rgba(${i % 3 ? 255 : 90},${i % 3 ? 235 : 60},${i % 3 ? 180 : 20},${0.04 + (i * 37 % 11) / 200})`; x.fillRect(0, i, 512, 1); }
  // bevelled border and two screws
  x.strokeStyle = 'rgba(90,60,20,0.75)'; x.lineWidth = 4; x.strokeRect(8, 8, 496, 112);
  x.strokeStyle = 'rgba(255,240,200,0.55)'; x.lineWidth = 2; x.strokeRect(13, 13, 486, 102);
  for (const sx of [34, 478]) {
    x.fillStyle = '#8a6428'; x.beginPath(); x.arc(sx, 64, 9, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#5c3f14'; x.lineWidth = 2.5; x.beginPath(); x.moveTo(sx - 6, 60); x.lineTo(sx + 6, 68); x.stroke();
  }
  // engraved lettering: a dark cut with a bright lower edge
  x.font = 'italic 600 62px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,236,180,0.7)'; x.fillText('Tea Bags', 257, 68);
  x.fillStyle = '#3f2a0e'; x.fillText('Tea Bags', 256, 66);
  plaqueTex = new THREE.CanvasTexture(c);
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  plaqueTex.anisotropy = 8;
  return plaqueTex;
}

// A rounded-rectangle plinth with a cove and bead round its top edge (a short lathe would be round;
// this extrudes the outline in steps instead).
function plinthGeometry(hx, hy, hz) {
  const steps = [[0, 0], [0.42, 0], [0.62, 0.0012], [0.82, 0.0022], [1, 0.0034]]; // [height fraction, inset]
  const parts = [];
  for (let s = 0; s < steps.length - 1; s++) {
    const [f0, in0] = steps[s], [f1, in1] = steps[s + 1];
    const y0 = f0 * hy * 2, y1 = f1 * hy * 2, rad = 0.006;
    const ring = (inset) => {
      const pts = [], w = hx - inset, d = hz - inset, r = rad;
      for (const [cx, cz, a0] of [[w - r, d - r, 0], [-w + r, d - r, Math.PI / 2], [-w + r, -d + r, Math.PI], [w - r, -d + r, Math.PI * 1.5]])
        for (let i = 0; i <= 4; i++) { const a = a0 + i / 4 * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]); }
      return pts;
    };
    const A = ring(in0), Bv = ring(in1), m = A.length;
    const pos = [];
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      const a0 = [A[i][0], y0, A[i][1]], a1 = [A[j][0], y0, A[j][1]], b0 = [Bv[i][0], y1, Bv[i][1]], b1 = [Bv[j][0], y1, Bv[j][1]];
      pos.push(...a0, ...b1, ...a1, ...a0, ...b0, ...b1);
    }
    if (s === steps.length - 2) for (let i = 1; i < m - 1; i++) pos.push(Bv[0][0], y1, Bv[0][1], Bv[i + 1][0], y1, Bv[i + 1][1], Bv[i][0], y1, Bv[i][1]);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    parts.push(g);
  }
  const g = mergeGeometries(parts, false);
  g.computeVertexNormals();
  // Planar UVs from above (grain along x), so the wood texture lies on it like a real board.
  const p = g.attributes.position, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uv[i * 2] = p.getX(i) * 2.2 + 0.31; uv[i * 2 + 1] = (p.getZ(i) + p.getY(i) * 0.5) * 2.2 + 0.4; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// Turned post from the plinth's top (y0) to h: a foot collar and bead, a gently swelling shaft, a bead
// below the crossbar, a cap collar and an acorn finial.
function postGeometry(r, y0, h) {
  const pts = [V2(0.0001, y0 - 0.001), V2(r * 1.75, y0 - 0.001), V2(r * 1.8, y0 + 0.003), V2(r * 1.45, y0 + 0.0055), V2(r * 1.3, y0 + 0.007),
    V2(r * 1.42, y0 + 0.0095), V2(r * 1.12, y0 + 0.012),
    ...spline([V2(r * 1.05, y0 + 0.015), V2(r * 1.14, y0 + 0.09), V2(r * 1.0, h - 0.05)], 10),
    V2(r * 1.38, h - 0.043), V2(r * 1.42, h - 0.0385), V2(r, h - 0.034), V2(r, h - 0.003), V2(r * 1.35, h - 0.0015), V2(r * 1.38, h + 0.001), V2(r * 0.9, h + 0.003)];
  for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(V2(Math.max(0.0001, r * 1.25 * Math.sin(Math.PI * (0.18 + 0.82 * t)) ** 0.8), h + 0.003 + t * 0.016)); }
  return new THREE.LatheGeometry(pts, 18);
}

export function buildTeaStand(S, wood) {
  const g = new THREE.Group();
  const oak = new THREE.MeshStandardMaterial({ color: 0xa8774c, roughness: 0.42, map: wood.map, envMapIntensity: 0.9 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a548, roughness: 0.3, metalness: 1 });
  const woodParts = [];
  const add = (list, geo, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
    const gg = (geo.index ? geo.toNonIndexed() : geo.clone()).applyMatrix4(m);
    for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    list.push(gg);
  };
  add(woodParts, plinthGeometry(S.baseHalf[0], S.baseHalf[1], S.baseHalf[2]), 0, 0, 0);
  const post = postGeometry(S.postHalf, S.baseHalf[1] * 2, S.postHeight);
  for (const sx of [-1, 1]) add(woodParts, post, sx * S.postX, 0, 0);
  // Crossbar: a dowel with a bead collar where it enters each post.
  const barLen = S.postX * 2 - S.postHalf * 1.6;
  const bar = new THREE.LatheGeometry([V2(0.0001, -barLen / 2), V2(S.barHalf * 1.35, -barLen / 2), V2(S.barHalf * 1.4, -barLen / 2 + 0.003), V2(S.barHalf, -barLen / 2 + 0.006),
    V2(S.barHalf, barLen / 2 - 0.006), V2(S.barHalf * 1.4, barLen / 2 - 0.003), V2(S.barHalf * 1.35, barLen / 2), V2(0.0001, barLen / 2)], 14);
  add(woodParts, bar, 0, S.barY, 0, 0, 0, Math.PI / 2);
  const woodGeo = mergeGeometries(woodParts, false);
  g.add(new THREE.Mesh(woodGeo, oak));
  // Brass: pegs with ball tips, each on a small rosette on the bar's front.
  const brassParts = [];
  const peg = new THREE.LatheGeometry([V2(0.0001, 0), V2(0.0021, 0), V2(0.0019, S.pegReach - 0.004), V2(0.0028, S.pegReach - 0.0035),
    ...Array.from({ length: 7 }, (_, i) => { const a = -Math.PI / 2 + 0.6 + i / 6 * (Math.PI - 0.6); return V2(Math.max(0.0001, Math.cos(a) * 0.0036), S.pegReach + Math.sin(a) * 0.0036); })], 10);
  const rosette = new THREE.LatheGeometry([V2(0.0001, 0.0024), V2(0.0028, 0.0024), V2(0.0042, 0.0012), V2(0.0045, 0), V2(0.0001, 0)], 14);
  for (const px of S.pegXs) {
    add(brassParts, peg, px, S.pegY, 0, Math.PI / 2, 0, 0);
    add(brassParts, rosette, px, S.pegY, S.barHalf * 0.85, Math.PI / 2, 0, 0);
  }
  g.add(new THREE.Mesh(mergeGeometries(brassParts, false), brass));
  // Brass plaque on the plinth's front edge, tipped back a little to face the pad.
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.084, 0.021), new THREE.MeshStandardMaterial({ map: plaqueTexture(), metalness: 0.85, roughness: 0.35, color: 0xffffff }));
  plaque.position.set(0, S.baseHalf[1] * 2 + 0.00025, S.baseHalf[2] - 0.019);
  plaque.rotation.x = -Math.PI / 2;
  g.add(plaque);
  g.position.set(S.x, S.y, S.z);
  return g;
}

// ---------------------------------------------------------------- table top
// A slab with rounded corners and an eased edge all round (top at y = 0). The wood texture is projected
// from above, so the planks run on across the edges and their ends show on the table's ends.
export function tableTopGeometry(hx, hz, th, corner = 0.022, ease = 0.008) {
  const w = hx - ease, d = hz - ease, r = corner - ease;
  const s = new THREE.Shape();
  s.moveTo(-w + r, -d); s.lineTo(w - r, -d); s.quadraticCurveTo(w, -d, w, -d + r); s.lineTo(w, d - r); s.quadraticCurveTo(w, d, w - r, d);
  s.lineTo(-w + r, d); s.quadraticCurveTo(-w, d, -w, d - r); s.lineTo(-w, -d + r); s.quadraticCurveTo(-w, -d, -w + r, -d);
  let g = new THREE.ExtrudeGeometry(s, { depth: th - ease * 2, bevelEnabled: true, bevelThickness: ease, bevelSize: ease, bevelSegments: 4, curveSegments: 5 });
  g.rotateX(-Math.PI / 2);
  g.translate(0, -(th - ease), 0);
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  g = mergeVertices(g, 1e-5);
  g.computeVertexNormals();
  // Smooth round the eased edge, but the top and bottom stay dead flat (their big triangles would
  // otherwise spread the edge's tilt across the whole table).
  const p = g.attributes.position, nrm = g.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    if (p.getY(i) > -1e-5) nrm.setXYZ(i, 0, 1, 0); else if (p.getY(i) < -th + 1e-5) nrm.setXYZ(i, 0, -1, 0);
    uv[i * 2] = (p.getX(i) + hx) / (hx * 2); uv[i * 2 + 1] = 1 - (p.getZ(i) + hz) / (hz * 2);
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

// ---------------------------------------------------------------- stack of books
// Hardbacks: boards that overhang an inset page block, a rounded spine facing the launch pad with gilt
// bands, and page edges with fine lines. All the books share three draws (cloth covers coloured per
// vertex, pages, gilt). books: [halfX, height, halfZ, yaw] from the bottom of the stack up.
let pageTex = null;
function pageEdgeTexture() {
  if (pageTex) return pageTex;
  const c = document.createElement('canvas'); c.width = 64; c.height = 64;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#efe6d2'; x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) { x.fillStyle = `rgba(120,100,70,${0.08 + ((i * 13) % 7) / 60})`; x.fillRect(0, i, 64, 1); }
  pageTex = new THREE.CanvasTexture(c);
  pageTex.colorSpace = THREE.SRGBColorSpace;
  pageTex.wrapS = pageTex.wrapT = THREE.RepeatWrapping;
  return pageTex;
}

export function buildBookStack(B, colours) {
  const covers = [], pages = [], gilt = [];
  const place = (geo, list, m, col) => {
    const g = (geo.index ? geo.toNonIndexed() : geo).applyMatrix4(m);
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
    if (col) { const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); }
    list.push(g);
  };
  let y = 0;
  const M = new THREE.Matrix4(), L = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  B.books.forEach(([hx, hh, hz, yaw], i) => {
    const col = new THREE.Color(colours[i]);
    M.compose(new THREE.Vector3(B.x, y, B.z), q.setFromAxisAngle(up, yaw), new THREE.Vector3(1, 1, 1));
    const board = 0.0018, inset = 0.0025, sr = hh / 2;   // spine radius: half the book's thickness
    // boards (top and bottom), stopping where the spine's round begins
    for (const by of [board / 2, hh - board / 2]) place(new THREE.BoxGeometry(hx * 2, board, hz * 2 - sr), covers, L.makeTranslation(0, by, -sr / 2).premultiply(M), col);
    // rounded spine along x on the +z side
    const spine = new THREE.CylinderGeometry(sr, sr, hx * 2, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2);
    place(spine, covers, L.makeTranslation(0, hh / 2, hz - sr).premultiply(M), col);
    // page block, inset from the boards' three open edges, its edge lines running round the block
    const pg = new THREE.BoxGeometry(hx * 2 - inset * 2, hh - board * 2, hz * 2 - inset - sr * 0.6);
    const uv = pg.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.5, uv.getY(k) * hh * 300);
    place(pg, pages, L.makeTranslation(0, hh / 2, -inset / 2 - sr * 0.3 + inset / 2).premultiply(M));
    // two gilt bands across the spine
    for (const gx of [-hx * 0.62, hx * 0.62]) {
      const band = new THREE.CylinderGeometry(sr + 0.0003, sr + 0.0003, 0.0022, 14, 1, true, 0, Math.PI).rotateZ(Math.PI / 2).rotateX(Math.PI / 2);
      place(band, gilt, L.makeTranslation(gx, hh / 2, hz - sr).premultiply(M));
    }
    y += hh;
  });
  const g = new THREE.Group();
  g.add(new THREE.Mesh(mergeGeometries(covers, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 })));
  g.add(new THREE.Mesh(mergeGeometries(pages, false), new THREE.MeshStandardMaterial({ map: pageEdgeTexture(), roughness: 0.9 })));
  g.add(new THREE.Mesh(mergeGeometries(gilt, false), new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 1, roughness: 0.32 })));
  return g;
}
