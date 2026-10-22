import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { cacheBodyReads } from './rapierCache.js';

cacheBodyReads();

export { RAPIER };

let ready = null;
export function initPhysics() {
  if (!ready) ready = RAPIER.init();
  return ready;
}

// Collision groups: upper 16 bits membership, lower 16 bits filter.
export const G = { WORLD: 1, HELI: 2, BAG: 4, DEBRIS: 8, ROTOR: 16, HOSE: 32 };
const grp = (member, filter) => ((member & 0xffff) << 16) | (filter & 0xffff);
export const GROUPS = {
  world: grp(G.WORLD, G.HELI | G.BAG | G.DEBRIS | G.ROTOR | G.HOSE),
  heli: grp(G.HELI, G.WORLD | G.BAG | G.DEBRIS),
  rotor: grp(G.ROTOR, G.WORLD), // loose wreckage never counts as a rotor strike
  bag: grp(G.BAG, G.WORLD | G.HELI | G.BAG | G.DEBRIS | G.HOSE),
  hose: grp(G.HOSE, G.WORLD | G.BAG), // the skycrane's snorkel: never the airframe or its own segments
  debris: grp(G.DEBRIS, G.WORLD | G.HELI | G.BAG | G.DEBRIS),
  // The stand's pegs: a bag lifted off its peg passes the thin rod instead of snagging under it.
  peg: grp(G.WORLD, G.HELI | G.DEBRIS | G.ROTOR | G.HOSE),
  queryWorld: grp(0xffff, G.WORLD),
};

export const v3 = (x, y, z) => ({ x, y, z });
export const quatOf = (q) => ({ x: q.x, y: q.y, z: q.z, w: q.w });

// Interpolation record for a rigid body: render lerps prev -> curr by the fixed-step remainder.
export class Track {
  constructor(body) {
    this.prevP = new THREE.Vector3();
    this.currP = new THREE.Vector3();
    this.prevQ = new THREE.Quaternion();
    this.currQ = new THREE.Quaternion();
    if (body) { this.capture(body); this.prevP.copy(this.currP); this.prevQ.copy(this.currQ); }
  }
  capture(body) {
    this.prevP.copy(this.currP);
    this.prevQ.copy(this.currQ);
    const t = body.translation(), r = body.rotation();
    this.currP.set(t.x, t.y, t.z);
    this.currQ.set(r.x, r.y, r.z, r.w);
  }
  sample(alpha, outP, outQ) {
    outP.lerpVectors(this.prevP, this.currP, alpha);
    if (outQ) outQ.slerpQuaternions(this.prevQ, this.currQ, alpha);
  }
}
