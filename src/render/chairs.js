import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { WINDSOR, windsorPieces, LADDER, ladderPostZ, BISTRO, BENTWOOD, TEAK, FOLDING, foldingMainZ, DECK } from '../sim/chairShapes.js';

// The chairs: one kit of real chair models for every chair in the world, so they share proportions, wear and
// detail. Each style is built once (per phone/desktop detail) in its own frame (src/sim/chairShapes.js: y up
// from the floor, the sitter facing +z) and handed out piece by piece; the caller places it and merges the
// pieces into its own batch, so a room of chairs costs no more draw calls than one.
//
//   placeChair(style, palette, put, { lite, seed })
//     style    'windsor' | 'ladder' | 'ladder-board' | 'bistro' | 'bentwood' | 'teak' | 'folding' | 'deck'
//     palette  role -> [material (whatever put takes), colour]: frame (the timber or steel), seat, pad (upholstery), cane,
//              foot (rubber), metal (bolts, rivets), stripeA / stripeB (deckchair canvas). Missing roles fall
//              back to frame; a role set to null is left out.
//     put      (geometry, materialKey, colour, lod) with lod 1 for the chair and 2 for fine detail (desktop).
//
// Pieces carry a 'shade' attribute (ambient occlusion toward the floor and under the seat, and lighter wear
// where hands and feet rub) that the Batcher folds into the vertex colour.

const UP = new THREE.Vector3(0, 1, 0);
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const vec = (p) => (p.isVector3 ? p : V(p[0], p[1], p[2]));
const _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _d = new THREE.Vector3();
const TAU = Math.PI * 2;

// Turns a piece built along +y (from 0 to its length) to run from a to b.
function orient(g, a, b) {
  _d.subVectors(b, a).normalize();
  _q.setFromUnitVectors(UP, _d);
  return g.applyMatrix4(_m.compose(a, _q, _one));
}

// Wood grain runs along u (see the kit's grain texture), uvs in metres. Round pieces built along +y: u along
// the piece, v round it.
function roundUV(g, r) {
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getY(i), uv.getX(i) * TAU * r);
}
// Flat pieces: a planar map per face, the grain along axis `grain` (0 x, 1 y, 2 z); end grain on the ends.
function boxMapUV(g, grain = 0) {
  const pos = g.attributes.position, nor = g.attributes.normal;
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(pos.count * 2), 2));
  const uv = g.attributes.uv, p = [0, 0, 0];
  for (let i = 0; i < pos.count; i++) {
    p[0] = pos.getX(i); p[1] = pos.getY(i); p[2] = pos.getZ(i);
    const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    const d = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
    if (d !== grain) uv.setXY(i, p[grain], p[3 - d - grain]);
    else uv.setXY(i, p[(grain + 1) % 3], p[(grain + 2) % 3]);
  }
  return g;
}

// A round rod from a to b (radius r0 at a, r1 at b).
function rod(a, b, r0, r1 = r0, seg = 8) {
  a = vec(a); b = vec(b);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1).translate(0, len / 2, 0);
  roundUV(g, (r0 + r1) / 2);
  return orient(g, a, b);
}
// A turned piece from a to b; prof is [t (0 at a, 1 at b), radius] up the piece.
function turned(a, b, prof, seg) {
  a = vec(a); b = vec(b);
  const len = a.distanceTo(b);
  const g = new THREE.LatheGeometry(prof.map(([t, r]) => new THREE.Vector2(Math.max(r, 1e-4), t * len)), seg);
  roundUV(g, prof.reduce((s, p) => s + p[1], 0) / prof.length);
  return orient(g, a, b);
}
// A bent piece (steam-bent wood or steel tube) along a smooth curve through points.
function bent(points, r, seg, tubular, closed = false) {
  const curve = points instanceof THREE.Curve ? points : new THREE.CatmullRomCurve3(points.map(vec), closed, 'centripetal');
  const g = new THREE.TubeGeometry(curve, tubular, r, seg, closed);
  const L = curve.getLength(), uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * TAU * r);
  return g;
}
const mirrorX = (pts) => pts.map((p) => V(-p[0], p[1], p[2]));
// A path down one side, over the top and down the other: pts run from the left foot to the middle (x = 0).
const loopPath = (pts) => [...pts.map(vec), ...mirrorX(pts.slice(0, -1).reverse())];

// A block with softened edges (a plain box when seg is 0), grain along `grain`.
function block(w, h, d, r, seg, grain = 0) {
  const g = seg ? new RoundedBoxGeometry(w, h, d, seg, Math.min(r, Math.min(w, h, d) / 2 - 1e-4)) : new THREE.BoxGeometry(w, h, d);
  return boxMapUV(g, grain);
}
// A square-section member from a to b, w across x and d across z before it is turned to run a -> b; taper
// shrinks its section toward a.
function beam(a, b, w, d, r, seg, taper = 1) {
  a = vec(a); b = vec(b);
  const len = a.distanceTo(b);
  const g = block(w, len, d, r, seg, 1).translate(0, len / 2, 0);
  if (taper !== 1) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const k = taper + (1 - taper) * (pos.getY(i) / len); pos.setX(i, pos.getX(i) * k); pos.setZ(i, pos.getZ(i) * k); }
    g.computeVertexNormals();
  }
  return orient(g, a, b);
}
// A rail between two points that run mostly along x or z: h tall, t thick.
function rail(a, b, h, t, r, seg) {
  a = vec(a); b = vec(b);
  return Math.abs(b.x - a.x) > Math.abs(b.z - a.z) ? beam(a, b, h, t, r, seg) : beam(a, b, t, h, r, seg);
}
// A slat across x, curved in plan: its ends at (±span/2, z = 0), its middle bowed back to z = -bow; h tall
// (centred on y = 0), t thick, edges rounded by r. arch lifts the top edge in the middle.
function curvedSlat(span, h, t, bow, r, segs = 10, bevelSeg = 1, arch = 0) {
  if (!bevelSeg) r = 0;
  const s = span - 2 * r, tt = Math.max(0.0008, t - 2 * r), hh = Math.max(0.001, h - 2 * r);
  const R = bow > 1e-4 ? (s * s / 4 + bow * bow) / (2 * bow) : 0;
  const pt = (u, off) => {
    if (!R) return [u * s / 2, -off];
    const phi = u * Math.asin(s / 2 / R), rr = R + off;
    return [rr * Math.sin(phi), -((R - bow) - rr * Math.cos(phi))];       // shape y is -z
  };
  const shape = new THREE.Shape();
  for (let i = 0; i <= segs; i++) { const [x, y] = pt(-1 + 2 * i / segs, tt / 2); if (i) shape.lineTo(x, y); else shape.moveTo(x, y); }
  for (let i = segs; i >= 0; i--) { const [x, y] = pt(-1 + 2 * i / segs, -tt / 2); shape.lineTo(x, y); }
  let g = new THREE.ExtrudeGeometry(shape, { depth: hh, bevelEnabled: r > 0, bevelThickness: r, bevelSize: r, bevelSegments: bevelSeg, curveSegments: 1 });
  g.rotateX(-Math.PI / 2).translate(0, -hh / 2, 0);
  if (arch) {
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > 0) { const u = pos.getX(i) / (span / 2); pos.setY(i, pos.getY(i) + arch * Math.max(0, 1 - u * u)); }
    g.computeVertexNormals();
  }
  g.deleteAttribute('uv');
  g = mergeVertices(g);                                   // shared corners: an extrusion repeats every vertex per face
  return boxMapUV(g, 0);
}
// A rounded pad (a seat, a cushion) round the y axis: outline radius R(θ) (θ from +x toward +z) and a profile
// [f, d, y] from the middle of the top, round the edge, to the middle of the bottom: radius f·R(θ) − d.
function pad(R, prof, segA, grain = 0, z0 = 0) {
  const nP = prof.length, pos = [], idx = [];
  for (let i = 0; i < segA; i++) {
    const th = i / segA * TAU, c = Math.cos(th), s = Math.sin(th), rr = R(th);
    for (const [f, d, y] of prof) { const r = Math.max(0, f * rr - d); pos.push(r * c, y, r * s + z0); }
  }
  for (let i = 0; i < segA; i++) {
    const i1 = (i + 1) % segA;
    for (let j = 0; j < nP - 1; j++) {
      const a = i * nP + j, b = i1 * nP + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nor = g.attributes.normal;
  for (let i = 0; i < segA; i++) { nor.setXYZ(i * nP, 0, 1, 0); nor.setXYZ(i * nP + nP - 1, 0, -1, 0); }
  return boxMapUV(g, grain);
}
// Superellipse outline: half-widths a (x) and b (z), squareness n.
const superR = (a, b, n) => (th) => Math.pow(Math.pow(Math.abs(Math.cos(th)) / a, n) + Math.pow(Math.abs(Math.sin(th)) / b, n), -1 / n);
// A closed line round a pad's outline at height y, pushed out by `out` (for piping and rolled edges).
function rimCurve(R, y, out, n = 24, z0 = 0) {
  const pts = [];
  for (let i = 0; i < n; i++) { const th = i / n * TAU, r = R(th) + out; pts.push(V(Math.cos(th) * r, y, Math.sin(th) * r + z0)); }
  return new THREE.CatmullRomCurve3(pts, true, 'centripetal');
}

// Ambient occlusion and wear, baked per vertex into a 'shade' attribute (chair frame coordinates).
function shade(g, wear) {
  const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, s = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i), ny = nor.getY(i);
    let f = 0.78 + 0.22 * Math.min(1, Math.max(0, y) / 0.14);          // darker toward the floor
    if (ny < -0.45) f *= 0.8;                                           // undersides
    if (wear) f *= wear(pos.getX(i), y, pos.getZ(i), ny);
    s[i] = f;
  }
  g.setAttribute('shade', new THREE.BufferAttribute(s, 1));
  return g;
}
// Lighter where feet rest on a stretcher, where hands take hold of a top rail, along a worn seat front.
const scuff = (k = 1.13) => (x, y, z, ny) => (ny > 0.35 ? k : 1);
const handHold = (above, k = 1.1) => (x, y, z, ny) => (ny > 0.3 && y > above ? k : 1);
const seatFront = (zEdge, top, k = 1.09) => (x, y, z, ny) => (z > zEdge && y > top - 0.03 ? k : 1);

// ---------------------------------------------------------------------------------------------- styles
function windsor(P, S) {
  const W = WINDSOR, w = windsorPieces(), t = W.seatTop, b = W.seatBot;
  // Dished elm seat, flatter across the front, heavily bevelled underneath so the edge reads thin.
  const R = (th) => { const s = Math.sin(th), n = s > 0 ? 3 : 2.3; return superR(W.seatRX, W.seatRZ, n)(th); };
  const prof = [[0, 0, t - 0.011], [0.3, 0, t - 0.0105], [0.6, 0, t - 0.007], [0.85, 0, t - 0.0025], [1, 0.018, t], [1, 0.007, t - 0.002], [1, 0.001, t - 0.008],
    [1, 0, t - 0.016], [1, 0.004, b + 0.013], [1, 0.03, b], [0.6, 0, b], [0, 0, b]];
  P.push({ g: shade(pad(R, prof, S.pad), seatFront(0.15, t, 1.08)), role: 'seat' });
  // Turned legs: a taper to the foot, a bead where the stretcher enters, a vase, a ring under the seat.
  const LEG = [[0, 0], [0, 0.0112], [0.08, 0.0125], [0.3, 0.0142], [0.34, 0.0128], [0.37, 0.0168], [0.4, 0.0128], [0.44, 0.0138], [0.6, 0.0182], [0.74, 0.0168],
    [0.83, 0.0122], [0.86, 0.0152], [0.89, 0.0118], [0.97, 0.0108], [1, 0.0105]];
  for (const leg of w.legs) P.push({ g: shade(turned(leg[0], leg[1], LEG, S.lathe)), role: 'frame' });
  // H stretcher: bulbous turnings, scuffed on top where feet rest.
  const STR = [[0, 0.0085], [0.15, 0.0096], [0.5, 0.0134], [0.85, 0.0096], [1, 0.0085]];
  const ext = (a, c, k) => [a.clone().lerp(c, -k), c.clone().lerp(a, -k)];
  for (const s of w.side) { const [a, c] = ext(s[0], s[1], 0.04); P.push({ g: shade(turned(a, c, STR, S.lathe), scuff()), role: 'frame' }); }
  { const [a, c] = ext(w.cross[0], w.cross[1], 0.03); P.push({ g: shade(turned(a, c, STR, S.lathe), scuff()), role: 'frame' }); }
  // Spindles taper upward into the bow; the bow is polished by hands at the top.
  for (const [a, c] of w.spindles) P.push({ g: shade(rod(a, c, W.spindleR[0], W.spindleR[1], S.thin)), role: 'frame' });
  P.push({ g: shade(bent(w.bowCurve, W.bowR, S.r, S.tube), handHold(0.86, 1.12)), role: 'frame' });
}

function ladder(P, S, board = false) {
  const L = LADDER, fx = L.front.x, fz = L.front.z, bx = L.back.x, bz = L.back.z, y0 = L.rail;
  const top = L.postTop;
  for (const sx of [-1, 1]) {
    P.push({ g: shade(beam([sx * fx, 0, fz], [sx * fx, y0, fz], 0.037, 0.037, 0.004, S.rb, 0.8)), role: 'frame' });
    P.push({ g: shade(beam([sx * bx, 0, L.postFootZ], [sx * bx, y0 + 0.01, bz], 0.034, 0.032, 0.004, S.rb, 0.82)), role: 'frame' });
    P.push({ g: shade(beam([sx * bx, y0 - 0.01, bz + 0.0005], [sx * (bx - 0.004), top.y, top.z], 0.034, 0.03, 0.005, S.rb), handHold(0.88, 1.1)), role: 'frame' });
    // A turned finial on each post.
    const d = V(0, top.y - y0, top.z - bz).normalize(), base = V(sx * (bx - 0.004), top.y - 0.004, top.z);
    P.push({ g: shade(turned(base, base.clone().addScaledVector(d, 0.04), [[0, 0.013], [0.25, 0.0165], [0.5, 0.011], [0.72, 0.0145], [0.92, 0.009], [1, 0.0001]], S.lathe), handHold(0.9, 1.08)), role: 'frame' });
    // Side apron and stretcher (front to back legs).
    P.push({ g: shade(rail([sx * (fx - 0.006), 0.4, fz], [sx * (bx - 0.004), 0.4, bz], 0.06, 0.02, 0.003, S.rb)), role: 'frame' });
    P.push({ g: shade(rail([sx * fx, 0.15, fz], [sx * bx, 0.15, ladderPostZ(0.15)], 0.026, 0.02, 0.004, S.rb)), role: 'frame' });
  }
  // Front and back aprons; a turned front stretcher worn pale on top.
  P.push({ g: shade(rail([-fx, 0.4, fz - 0.005], [fx, 0.4, fz - 0.005], 0.06, 0.02, 0.003, S.rb)), role: 'frame' });
  P.push({ g: shade(rail([-bx, 0.4, bz + 0.004], [bx, 0.4, bz + 0.004], 0.06, 0.02, 0.003, S.rb)), role: 'frame' });
  P.push({ g: shade(turned([-fx, 0.2, fz], [fx, 0.2, fz], [[0, 0.0095], [0.1, 0.0118], [0.17, 0.0095], [0.5, 0.0132], [0.83, 0.0095], [0.9, 0.0118], [1, 0.0095]], S.lathe), scuff(1.16)), role: 'frame' });
  // Three bowed slats and the arched top rail, raked with the posts.
  const span = 2 * bx - 0.008;
  const placeBack = (g, y) => g.applyMatrix4(new THREE.Matrix4().makeRotationX(-L.rake)).translate(0, y, ladderPostZ(y) + 0.002);
  for (const y of L.slats) P.push({ g: shade(placeBack(curvedSlat(span, 0.05, 0.016, 0.022, 0.004, S.arc, S.bevel), y)), role: 'frame' });
  P.push({ g: shade(placeBack(curvedSlat(span + 0.02, 0.068, 0.022, 0.024, 0.006, S.arc, S.bevel, 0.014), L.topRail), handHold(0.9, 1.1)), role: 'frame' });
  if (board) {
    // A plain boarded seat with a rounded front edge.
    const R = superR(0.207, 0.205, 7);
    const prof = [[0, 0, 0.462], [0.9, 0, 0.462], [1, 0.011, 0.4605], [1, 0.003, 0.456], [1, 0, 0.448], [1, 0.004, 0.437], [0.9, 0, 0.433], [0, 0, 0.433]];
    P.push({ g: shade(pad(R, prof, S.pad, 0), seatFront(0.16, 0.462)), role: 'seat' });
  } else {
    // Drop-in upholstered seat: domed, slightly wider at the front, piped round the edge.
    const R = (th) => superR(0.19 + 0.008 * Math.sin(th), 0.194, 5)(th), pt = L.padTop;
    const prof = [[0, 0, pt], [0.5, 0, pt - 0.002], [0.8, 0, pt - 0.008], [1, 0.012, pt - 0.017], [1, 0.003, pt - 0.026], [1, 0, pt - 0.036], [1, 0.003, pt - 0.046], [1, 0.01, pt - 0.052], [0, 0, pt - 0.052]];
    P.push({ g: shade(pad(R, prof, S.pad, 0), seatFront(0.15, pt, 1.05)), role: 'pad' });
    P.push({ g: shade(bent(rimCurve(R, pt - 0.026, 0.0012), 0.0036, 5, S.tube)), role: 'pad', lod: 2, v: 0.82 });
  }
}

function bistro(P, S) {
  const B = BISTRO, r = B.tubeR, up = B.upright;
  for (const sx of [-1, 1]) {
    // Front leg and seat side rail in one bent tube; the back upright from the floor to the top.
    P.push({ g: shade(bent([[sx * B.frontFoot[0], 0, B.frontFoot[1]], [sx * 0.193, 0.25, 0.196], [sx * 0.188, 0.405, 0.181], [sx * 0.187, 0.438, 0.163], [sx * 0.187, 0.443, 0.12], [sx * 0.187, 0.443, -0.172]], r, S.r, S.tube)), role: 'frame' });
    P.push({ g: shade(bent([[sx * B.backFoot[0], 0, B.backFoot[1]], [sx * 0.189, 0.3, -0.184], [sx * 0.187, B.seat, up(B.seat)], [sx * 0.184, 0.66, up(0.66)], [sx * 0.18, B.top, up(B.top)]], r, S.r, S.tube), handHold(0.86, 1.1)), role: 'frame' });
    P.push({ g: shade(new THREE.SphereGeometry(r, S.r, 4).translate(sx * 0.18, B.top, up(B.top))), role: 'frame' });
    P.push({ g: new THREE.CylinderGeometry(0.0125, 0.0135, 0.014, S.r).translate(sx * B.frontFoot[0], 0.007, B.frontFoot[1]), role: 'foot', lod: 2 });
    P.push({ g: new THREE.CylinderGeometry(0.0125, 0.0135, 0.014, S.r).translate(sx * B.backFoot[0], 0.007, B.backFoot[1]), role: 'foot', lod: 2 });
  }
  // Low braces between the legs.
  P.push({ g: shade(rod([-0.195, 0.13, 0.205], [0.195, 0.13, 0.205], 0.0085, 0.0085, S.thin), scuff()), role: 'frame' });
  P.push({ g: shade(rod([-0.191, 0.13, -0.193], [0.191, 0.13, -0.193], 0.0085, 0.0085, S.thin)), role: 'frame' });
  // Seat: pressed steel slats, each dipping a little in the middle, and a rolled front edge.
  for (let i = 0; i < 6; i++) {
    const z = -0.142 + i * 0.0545, g = new THREE.BoxGeometry(0.392, 0.004, 0.046, 8, 1, 1), pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const u = pos.getX(k) / 0.196; pos.setY(k, pos.getY(k) - 0.006 * (1 - u * u)); }
    g.computeVertexNormals();
    P.push({ g: shade(g.translate(0, B.seat + 0.009, z), seatFront(0.12, B.seat + 0.012, 1.06)), role: 'frame' });
  }
  P.push({ g: shade(rod([-0.193, B.seat + 0.004, 0.172], [0.193, B.seat + 0.004, 0.172], 0.0085, 0.0085, S.thin), seatFront(0.15, B.seat + 0.01, 1.08)), role: 'frame' });
  // Two curved back slats between the uprights, raked with them.
  const rake = Math.atan2(0.055, 0.44);
  for (const y of B.backSlats) {
    const g = curvedSlat(2 * 0.183, 0.075, 0.005, 0.03, 0.0018, S.arc, 1);
    P.push({ g: shade(g.applyMatrix4(new THREE.Matrix4().makeRotationX(-rake)).translate(0, y, up(y) + 0.003)), role: 'frame' });
  }
}

function bentwood(P, S) {
  const B = BENTWOOD;
  // Bent seat ring (a tall oval section) round a caned seat, a tied cushion on top.
  const ring = new THREE.TorusGeometry(B.ringR, 0.015, S.r, S.tube);
  { const uv = ring.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * B.ringR, uv.getY(i) * TAU * 0.015); }
  ring.rotateX(Math.PI / 2).scale(1, 1.3, 1).translate(0, B.seat, 0);
  P.push({ g: shade(ring, seatFront(0.15, B.seat + 0.02, 1.07)), role: 'frame' });
  const cane = pad(() => 0.186, [[0, 0, B.seat + 0.004], [0.7, 0, B.seat + 0.007], [1, 0, B.seat + 0.009], [1, 0, B.seat - 0.006], [0, 0, B.seat - 0.006]], S.pad, 0);
  P.push({ g: shade(cane), role: 'cane' });
  const cushR = () => 0.165, s0 = B.seat + 0.01;
  P.push({ g: shade(pad(cushR, [[0, 0, s0 + 0.034], [0.6, 0, s0 + 0.031], [0.88, 0, s0 + 0.022], [1, 0.01, s0 + 0.013], [1, 0.002, s0 + 0.006], [1, 0.006, s0], [0, 0, s0]], S.pad, 0)), role: 'pad' });
  P.push({ g: shade(bent(rimCurve(cushR, s0 + 0.006, 0.0005), 0.0032, 5, S.tube)), role: 'pad', lod: 2, v: 0.8 });
  // Front legs, tapering to the foot.
  for (const sx of [-1, 1]) P.push({ g: shade(turned([sx * 0.172, 0, 0.18], [sx * 0.122, B.seat - 0.012, 0.126], [[0, 0], [0, 0.0105], [0.1, 0.0112], [0.6, 0.0142], [0.9, 0.0152], [1, 0.0148]], S.lathe)), role: 'frame' });
  // One bent piece: the back legs up into the backrest loop; a smaller loop inside it.
  const loop = loopPath([[-0.155, 0, -0.205], [-0.143, 0.2, -0.183], [-0.128, 0.43, -0.152], [-0.132, 0.6, -0.175], [-0.133, 0.75, -0.212], [-0.105, 0.86, -0.236], [-0.05, 0.893, -0.244], [0, 0.898, -0.246]]);
  P.push({ g: shade(bent(loop, 0.0135, S.r, S.tube * 2), handHold(0.84, 1.12)), role: 'frame' });
  const inner = loopPath([[-0.072, 0.452, -0.177], [-0.085, 0.57, -0.19], [-0.065, 0.675, -0.207], [-0.03, 0.712, -0.214], [0, 0.716, -0.215]]);
  P.push({ g: shade(bent(inner, 0.0105, S.r, S.tube)), role: 'frame' });
  // The ring stretcher the legs are screwed to, scuffed by heels at the front.
  const lr = new THREE.TorusGeometry(0.222, 0.0095, S.r - 2, S.tube);
  { const uv = lr.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * TAU * 0.222, uv.getY(i) * TAU * 0.0095); }
  lr.rotateX(Math.PI / 2).translate(0, B.ringY, -0.0145);
  P.push({ g: shade(lr, (x, y, z, ny) => (ny > 0.3 && z > 0.1 ? 1.15 : 1)), role: 'frame' });
}

function teak(P, S) {
  const T = TEAK, x = T.x, zAt = (y) => T.zb + (T.top.z - T.zb) * Math.max(0, (y - 0.425) / (T.top.y - 0.425));
  const rake = Math.atan2(T.zb - T.top.z, T.top.y - 0.425);
  for (const sx of [-1, 1]) {
    P.push({ g: shade(beam([sx * x, 0, T.zf], [sx * x, 0.425, T.zf], 0.038, 0.038, 0.005, S.rb, 0.86)), role: 'frame' });
    P.push({ g: shade(beam([sx * x, 0, T.zb - 0.012], [sx * x, 0.435, T.zb], 0.038, 0.034, 0.005, S.rb, 0.86)), role: 'frame' });
    P.push({ g: shade(beam([sx * x, 0.42, T.zb], [sx * (x - 0.002), T.top.y, T.top.z], 0.038, 0.032, 0.006, S.rb), handHold(0.9, 1.08)), role: 'frame' });
    P.push({ g: shade(rail([sx * x, 0.395, T.zf], [sx * x, 0.395, T.zb], 0.05, 0.024, 0.004, S.rb)), role: 'frame' });
    P.push({ g: shade(rail([sx * x, 0.15, T.zf], [sx * x, 0.15, T.zb - 0.004], 0.03, 0.022, 0.004, S.rb), scuff()), role: 'frame' });
  }
  P.push({ g: shade(rail([-x, 0.395, T.zf], [x, 0.395, T.zf], 0.05, 0.022, 0.004, S.rb)), role: 'frame' });
  P.push({ g: shade(rail([-x, 0.395, T.zb], [x, 0.395, T.zb], 0.05, 0.022, 0.004, S.rb)), role: 'frame' });
  P.push({ g: shade(rail([-x, 0.15, 0], [x, 0.15, 0], 0.03, 0.022, 0.004, S.rb), scuff()), role: 'frame' });
  // Seat slats with gaps, each its own board.
  for (let i = 0; i < 6; i++) {
    const z = -0.172 + i * 0.0688;
    P.push({ g: shade(block(0.44, 0.02, 0.056, 0.005, S.rb, 0).translate(0, T.seat, z), seatFront(0.15, T.seat + 0.01)), role: 'seat', v: [1, 0.94, 1.04, 0.97, 1.02, 0.95][i] });
  }
  // Back: a bowed lower rail, an arched top rail, and five vertical slats following the bow.
  const bow = 0.02, place = (g, y) => g.applyMatrix4(new THREE.Matrix4().makeRotationX(-rake)).translate(0, y, zAt(y) + 0.002);
  P.push({ g: shade(place(curvedSlat(2 * x - 0.01, 0.05, 0.022, bow, 0.005, S.arc, S.bevel), 0.55)), role: 'frame' });
  P.push({ g: shade(place(curvedSlat(2 * x + 0.03, 0.082, 0.028, bow, 0.007, S.arc, S.bevel, 0.022), 0.895), handHold(0.9, 1.1)), role: 'frame' });
  for (let i = 0; i < 5; i++) {
    const sx = -0.13 + i * 0.065, dz = -bow * (1 - (sx / (x - 0.005)) ** 2);
    P.push({ g: shade(beam([sx, 0.57, zAt(0.57) + dz], [sx, 0.86, zAt(0.86) + dz], 0.042, 0.014, 0.004, S.rb)), role: 'frame', v: [0.97, 1.03, 1, 0.95, 1.02][i] });
  }
}

function folding(P, S) {
  const F = FOLDING, r = 0.011;
  for (const sx of [-1, 1]) {
    const mx = (p) => [sx * p[0], p[1], p[2]];
    P.push({ g: shade(rod(mx(F.main[0]), mx(F.main[1]), r, r, S.r), handHold(0.82, 1.08)), role: 'frame' });
    P.push({ g: shade(rod(mx(F.rear[0]), mx(F.rear[1]), r, r, S.r)), role: 'frame' });
    P.push({ g: shade(new THREE.SphereGeometry(r, S.r, 4).translate(sx * F.main[1][0], F.main[1][1], F.main[1][2])), role: 'frame' });
    // Seat side rails, the rivet where the legs cross, rubber feet.
    P.push({ g: shade(rod([sx * 0.184, F.seat - 0.012, 0.165], [sx * 0.184, F.seat - 0.012, -0.135], 0.008, 0.008, S.thin)), role: 'frame' });
    P.push({ g: new THREE.SphereGeometry(0.0075, 6, 4).scale(0.6, 1, 1).translate(sx * 0.2, 0.382, 0.041), role: 'metal', lod: 2 });
    P.push({ g: new THREE.CylinderGeometry(0.013, 0.014, 0.016, S.r).translate(sx * F.main[0][0], 0.008, F.main[0][2]), role: 'foot', lod: 2 });
    P.push({ g: new THREE.CylinderGeometry(0.013, 0.014, 0.016, S.r).translate(sx * F.rear[0][0], 0.008, F.rear[0][2]), role: 'foot', lod: 2 });
  }
  P.push({ g: shade(rod([-0.185, 0.03, -0.225], [0.185, 0.03, -0.225], 0.009, 0.009, S.thin), scuff()), role: 'frame' });
  P.push({ g: shade(rod([-0.199, 0.1, foldingMainZ(0.1)], [0.199, 0.1, foldingMainZ(0.1)], 0.009, 0.009, S.thin), scuff()), role: 'frame' });
  // Pressed steel seat pan and its vinyl pad.
  const pan = superR(0.19, 0.18, 4);
  P.push({ g: shade(pad(pan, [[0, 0, F.seat + 0.012], [0.95, 0, F.seat + 0.012], [1, 0.004, F.seat + 0.01], [1, 0, F.seat], [0.95, 0, F.seat - 0.002], [0, 0, F.seat - 0.002]], S.pad, 0, 0.01)), role: 'frame' });
  const vin = superR(0.172, 0.162, 4), p0 = F.seat + 0.012;
  P.push({ g: shade(pad(vin, [[0, 0, F.pad], [0.6, 0, F.pad - 0.002], [0.9, 0, F.pad - 0.008], [1, 0.008, p0 + 0.014], [1, 0, p0 + 0.007], [1, 0.006, p0], [0, 0, p0]], S.pad, 0, 0.01), seatFront(0.13, F.pad, 1.06)), role: 'pad' });
  // Curved back panel along the lean of the main tubes.
  const lean = Math.atan2(F.main[0][2] - F.main[1][2], F.main[1][1]);
  const back = curvedSlat(0.37, 0.14, 0.006, 0.035, 0.0022, S.arc, 1).applyMatrix4(new THREE.Matrix4().makeRotationX(-lean)).translate(0, F.backY, foldingMainZ(F.backY) - 0.004);
  P.push({ g: shade(back, handHold(0.82, 1.07)), role: 'frame' });
}

function deck(P, S) {
  const D = DECK, at = (lx, p) => [lx, p[1], p[0]];             // chair coordinates (u, y) -> (x, y, z)
  const onMain = (y) => D.top[0] + (D.foot[0] - D.top[0]) * (D.top[1] - y) / (D.top[1] - D.foot[1]);
  for (const sx of [-1, 1]) {
    P.push({ g: shade(beam(at(sx * D.railX, D.foot), at(sx * D.railX, D.top), 0.024, 0.04, 0.005, S.rb), handHold(0.7, 1.08)), role: 'frame' });
    P.push({ g: shade(beam(at(sx * D.seatX, [D.hinge[0] - 0.09, D.hinge[1] - 0.06]), at(sx * D.seatX, [D.front[0] + 0.01, D.front[1]]), 0.022, 0.034, 0.005, S.rb)), role: 'frame', v: 0.95 });
    P.push({ g: shade(beam(at(sx * D.legX, D.legFoot), at(sx * D.legX, [D.front[0] - 0.03, D.front[1] + 0.03]), 0.022, 0.036, 0.005, S.rb)), role: 'frame', v: 0.98 });
    P.push({ g: new THREE.CylinderGeometry(0.011, 0.011, 0.012, 10).rotateZ(Math.PI / 2).translate(sx * 0.262, D.hinge[1], D.hinge[0]), role: 'metal', lod: 2 });
  }
  const dowel = (y, u, half, r, v = 1) => P.push({ g: shade(rod([-half, y, u], [half, y, u], r, r, S.r)), role: 'frame', v });
  dowel(D.top[1] + 0.003, D.top[0] - 0.003, 0.258, 0.0155, 0.94);
  dowel(D.front[1], D.front[0], 0.236, 0.0155, 0.94);
  dowel(0.285, D.hinge[0] + 0.008, 0.26, 0.011, 0.9);
  dowel(0.56, onMain(0.56), 0.25, 0.012);
  dowel(0.14, onMain(0.14), 0.25, 0.011);
  dowel(0.17, 0.5, 0.275, 0.011, 1.03);
  // The canvas sling, sagging between the head and front dowels in seven stripes.
  const a = V(0, D.top[1] + 0.012, D.top[0] - 0.006), b = V(0, D.front[1] + 0.012, D.front[0] + 0.008), NS = S.lite ? 8 : 14, NW = 7, w = D.slingW;
  for (let j = 0; j < NW; j++) {
    const x0 = -w / 2 + j * w / NW, x1 = x0 + w / NW, pos = [], idx = [];
    for (let i = 0; i <= NS; i++) {
      const s = i / NS, p = a.clone().lerp(b, s);
      p.y -= 0.16 * Math.sin(Math.PI * s) ** 1.2;
      p.z += 0.03 * Math.sin(Math.PI * s);
      for (const x of [x0, x1]) pos.push(x, p.y, p.z);
    }
    for (let i = 0; i < NS; i++) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    const top = new THREE.BufferGeometry();
    top.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    top.setIndex(idx);
    top.computeVertexNormals();
    const under = top.clone();
    under.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]]));
    under.computeVertexNormals();
    under.translate(0, -0.002, 0);
    const role = j % 2 ? 'stripeB' : 'stripeA';
    for (const g of [top, under]) P.push({ g: shade(boxMapUV(g, 2)), role });
  }
}

// An upholstered sofa or armchair (club kind), len wide and d deep: turned feet, a plinth, rolled arms, a
// back with a rolled top, n loose seat and back cushions with piped edges, and scatter cushions.
function sofa(P, S, { len, d, n, scatter }) {
  const W = len / 2, D = d / 2, iw = len - 0.4;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W - 0.075), z = sz * (D - 0.075);
    P.push({ g: shade(turned([x, 0.012, z], [x, 0.105, z], [[0, 0.016], [0.3, 0.02], [0.7, 0.025], [0.92, 0.027], [1, 0.024]], S.lathe)), role: 'frame' });
    P.push({ g: new THREE.CylinderGeometry(0.018, 0.016, 0.012, S.r).translate(x, 0.006, z), role: 'metal', lod: 2 });
  }
  P.push({ g: shade(block(len - 0.01, 0.33, d - 0.02, 0.045, S.rb || 1, 0).translate(0, 0.265, 0)), role: 'cover' });
  for (const sx of [-1, 1]) {
    P.push({ g: shade(block(0.17, 0.42, d - 0.03, 0.05, S.rb || 1, 2).translate(sx * (W - 0.1), 0.33, 0.005)), role: 'cover', v: 0.97 });
    P.push({ g: shade(block(0.21, 0.15, d - 0.01, 0.072, S.rb + 2, 2).translate(sx * (W - 0.095), 0.565, 0.0), handHold(0.6, 1.05)), role: 'cover' });
  }
  const back = block(iw + 0.04, 0.66, 0.2, 0.06, S.rb || 1, 0).applyMatrix4(new THREE.Matrix4().makeRotationX(-0.08)).translate(0, 0.5, -D + 0.12);
  P.push({ g: shade(back), role: 'cover', v: 0.96 });
  P.push({ g: shade(block(iw + 0.07, 0.12, 0.25, 0.058, S.rb + 2, 0).translate(0, 0.83, -D + 0.12), handHold(0.8, 1.05)), role: 'cover' });
  const cw = iw / n, cd = d - 0.27, top = 0.548;
  const seatR = superR(cw / 2 - 0.006, cd / 2, 6), backR = superR(cw / 2 - 0.012, 0.2, 5);
  const seatProf = [[0, 0, top], [0.6, 0, top - 0.004], [0.88, 0, top - 0.016], [1, 0.016, top - 0.034], [1, 0.003, top - 0.06], [1, 0.016, 0.428], [0.9, 0, 0.422], [0, 0, 0.422]];
  const backProf = [[0, 0, 0.07], [0.6, 0, 0.064], [0.9, 0, 0.048], [1, 0.016, 0.03], [1, 0.003, 0], [1, 0.016, -0.03], [0.9, 0, -0.05], [0, 0, -0.055]];
  for (let i = 0; i < n; i++) {
    const cx = -iw / 2 + cw * (i + 0.5), cz = D - cd / 2 - 0.012;
    P.push({ g: shade(pad(seatR, seatProf, S.pad).translate(cx, 0, cz), seatFront(D - 0.08, top, 1.05)), role: 'cushion', v: i % 2 ? 0.97 : 1.02 });
    P.push({ g: shade(bent(rimCurve(seatR, top - 0.06, 0.0015, 20), 0.0042, 5, 40, true).translate(cx, 0, cz)), role: 'cushion', lod: 2, v: 0.86 });
    const bc = pad(backR, backProf, S.pad).rotateX(Math.PI / 2).rotateX(-0.2).translate(cx, 0.69, -D + 0.29);
    P.push({ g: shade(bc), role: 'cushion', v: i % 2 ? 1.01 : 0.98 });
  }
  // Scatter cushions propped in the corners: plump in the middle, thin at the piped edge.
  const sq = superR(0.165, 0.165, 3.4);
  const pil = [[0, 0, 0.062], [0.5, 0, 0.053], [0.85, 0, 0.028], [1, 0.006, 0.007], [1, 0, 0], [1, 0.006, -0.007], [0.85, 0, -0.028], [0.5, 0, -0.053], [0, 0, -0.062]];
  scatter.forEach((_, j) => {
    const sx = j ? 1 : -1, m = new THREE.Matrix4().makeRotationY(-sx * 0.28).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2 - 0.42)).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 4 * 0.15));
    const at = new THREE.Matrix4().makeTranslation(sx * (iw / 2 - 0.17), 0.69, -D + 0.42);
    P.push({ g: shade(pad(sq, pil, S.pad).applyMatrix4(m).applyMatrix4(at)), role: `scatter${j}` });
  });
}
const sofaCache = new Map();
// Hands every piece of one sofa (o: { len, d, n, scatter: [colours] }) to put, like placeChair. Palette roles:
// cover, cushion (defaults to cover), frame (the feet), metal (castor cups); scatter colours come from o.
export function placeSofa(o, palette, put, { lite = false, seed = 1 } = {}) {
  const key = `${o.len}|${o.d}|${o.n}|${o.scatter.length}|${lite ? 1 : 0}`;
  if (!sofaCache.has(key)) {
    const P = [];
    sofa(P, segments(lite), o);
    for (const p of P) { p.lod = p.lod || 1; p.v = p.v || 1; }
    sofaCache.set(key, P);
  }
  const pal = { cushion: palette.cover, ...palette };
  o.scatter.forEach((c, j) => { pal[`scatter${j}`] = [palette.cover[0], c]; });
  hand(sofaCache.get(key), pal, put, seed);
}

const STYLES = { windsor, ladder, 'ladder-board': (P, S) => ladder(P, S, true), bistro, bentwood, teak, folding, deck };
const cache = new Map();
// The pieces of a style: [{ g, role, lod, v }] in the chair's frame (shared: don't change them).
export function chairParts(style, lite = false) {
  const key = `${style}|${lite ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  const P = [];
  STYLES[style](P, segments(lite));
  for (const p of P) { p.lod = p.lod || 1; p.v = p.v || 1; }
  cache.set(key, P);
  return P;
}
// Detail per platform: phones get fewer sides on round pieces and plainer roundings.
function segments(lite) {
  return lite
    ? { lite, r: 6, thin: 5, lathe: 7, tube: 18, pad: 20, rb: 0, arc: 6, bevel: 0 }
    : { lite, r: 8, thin: 6, lathe: 10, tube: 36, pad: 44, rb: 1, arc: 10, bevel: 1 };
}
function hand(parts, palette, put, seed) {
  let s = (Math.abs(Math.round(seed * 9973)) % 233280) || 1;
  const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  const c = new THREE.Color();
  for (const p of parts) {
    const pal = p.role in palette ? palette[p.role] : palette.frame;
    if (!pal) continue;
    c.setHex(pal[1]).multiplyScalar(p.v * (0.96 + 0.08 * rnd()));
    put(p.g, pal[0], c.getHex(), p.lod);
  }
}

// Frees the cached pieces once every chair has been merged into its batch (they are rebuilt if asked for again).
export function releaseChairParts() {
  for (const c of [cache, sofaCache]) {
    for (const P of c.values()) for (const p of P) p.g.dispose();
    c.clear();
  }
}

// Hands every piece of one chair to put(geometry, material, colour, lod), coloured from the palette.
export function placeChair(style, palette, put, { lite = false, seed = 1 } = {}) {
  hand(chairParts(style, lite), palette, put, seed);
}
