import * as THREE from 'three';

// Measurements shared by the chair models (src/render/chairs.js draws them) and their colliders, so what
// you see is what you hit. Every chair is described in its own frame: metres, y up from the floor, the
// sitter facing +z (the back is toward -z), the seat centred on x = 0.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerp3 = (a, b, t) => a.clone().lerp(b, t);

// Kitchen Windsor, bow-back: dished elm seat, four splayed turned legs with an H stretcher, a steam-bent
// bow from the seat's back corners and seven spindles fanning up into it.
export const WINDSOR = {
  seatTop: 0.475, seatBot: 0.433, seatRX: 0.205, seatRZ: 0.195,
  legFoot: [0.155, 0.145], legTop: [0.115, 0.436, 0.105],       // [x, z] on the floor; [x, y, z] under the seat
  stretchY: 0.165,
  bowR: 0.0145, spindleR: [0.0095, 0.0062],
};
// The seat's spindle line: an arc round the back of the seat.
const seatArcZ = (x) => -0.125 * Math.sqrt(Math.max(0, 1 - (x / 0.185) ** 2));
let windsorCache = null;
export function windsorPieces() {
  if (windsorCache) return windsorCache;
  const W = WINDSOR;
  const legs = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) legs.push([V(sx * W.legFoot[0], 0, sz * W.legFoot[1]), V(sx * W.legTop[0], W.legTop[1], sz * W.legTop[2])]);
  const legAt = (leg, y) => lerp3(leg[0], leg[1], y / leg[1].y);
  // legs: [-x back, -x front, +x back, +x front]
  const side = [[legAt(legs[0], W.stretchY), legAt(legs[1], W.stretchY)], [legAt(legs[2], W.stretchY), legAt(legs[3], W.stretchY)]];
  const mid = (s) => lerp3(s[0], s[1], 0.52);
  const cross = [mid(side[0]), mid(side[1])];
  const half = [V(0.16, 0.468, seatArcZ(0.16)), V(0.178, 0.6, -0.098), V(0.176, 0.75, -0.138), V(0.132, 0.876, -0.17), V(0, 0.936, -0.184)];
  const ctrl = [...half.map((p) => V(-p.x, p.y, p.z)), ...half.slice(0, -1).reverse()];
  const bowCurve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal');
  const bow = bowCurve.getPoints(60);
  const spindles = [];
  for (const x of [-0.11, -0.073, -0.037, 0, 0.037, 0.073, 0.11]) {
    const a = V(x, W.seatTop - 0.006, seatArcZ(x) - 0.002), xt = x * 1.2;
    let best = null;
    for (const p of bow) if (p.y > 0.8 && Math.sign(p.x || 1) === Math.sign(xt || 1) && (!best || Math.abs(p.x - xt) < Math.abs(best.x - xt))) best = p;
    spindles.push([a, best.clone().add(V(0, -0.004, 0))]);
  }
  windsorCache = { legs, side, cross, bowCurve, bow, spindles };
  return windsorCache;
}

// Ladder-back dining chair: square legs, back posts raked back above the seat, three bowed slats and an arched
// top rail, a drop-in upholstered seat on a rail frame.
export const LADDER = {
  rail: 0.43, padTop: 0.478,
  front: { x: 0.195, z: 0.185 }, back: { x: 0.178, z: -0.185 },
  postFootZ: -0.205, postTop: { y: 0.95, z: -0.235 },
  slats: [0.6, 0.71, 0.82], topRail: 0.902,
};
LADDER.rake = Math.atan2(LADDER.back.z - LADDER.postTop.z, LADDER.postTop.y - LADDER.rail);
export const ladderPostZ = (y) => (y <= LADDER.rail
  ? LADDER.postFootZ + (LADDER.back.z - LADDER.postFootZ) * (y / LADDER.rail)
  : LADDER.back.z + (LADDER.postTop.z - LADDER.back.z) * ((y - LADDER.rail) / (LADDER.postTop.y - LADDER.rail)));

// Painted steel bistro chair: tube frame, slatted seat with a rolled front, two curved back slats.
export const BISTRO = {
  seat: 0.447, tubeR: 0.0105,
  frontFoot: [0.197, 0.212], backFoot: [0.192, -0.2],
  upright: (y) => -0.175 - 0.055 * Math.max(0, (y - 0.447) / 0.44),    // z of the back uprights at height y
  top: 0.885, backSlats: [0.655, 0.8],
};

// Bentwood tea-room chair (Thonet No. 14): round caned seat in a bent ring, one bent piece forming the back
// legs and the backrest loop, a smaller inner loop, and a ring stretcher round the legs.
export const BENTWOOD = { seat: 0.44, ringR: 0.195, ringY: 0.2 };

// Teak garden chair: slatted seat, arched top rail and vertical back slats.
export const TEAK = { seat: 0.445, x: 0.2, zf: 0.19, zb: -0.19, top: { y: 0.95, z: -0.222 } };

// Steel folding chair (church-hall kind): a straight tube per side from the front foot to the back top, rear
// legs crossing it at a rivet, a steel seat pan with a vinyl pad and a curved back panel.
export const FOLDING = {
  main: [[0.2, 0, 0.205], [0.188, 0.875, -0.17]],                    // per side, x mirrored
  rear: [[0.185, 0, -0.225], [0.178, 0.43, 0.075]],
  seat: 0.43, pad: 0.47, backY: 0.775,
};
export const foldingMainZ = (y) => FOLDING.main[0][2] + (FOLDING.main[1][2] - FOLDING.main[0][2]) * (y / FOLDING.main[1][1]);

// Deckchair (the same frame as the patio's): u is along the chair (forward +z), y up.
export const DECK = {
  top: [-0.42, 0.8], foot: [-0.08, 0.0], hinge: [-0.2, 0.27], front: [0.4, 0.34], legFoot: [0.53, 0.0],
  railX: 0.25, seatX: 0.205, legX: 0.275, slingW: 0.43,
};
