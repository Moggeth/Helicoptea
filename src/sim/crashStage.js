import * as THREE from 'three';
import { ROOM, CUPS, RANGE, FRIDGE } from './layout.js';
import { rotorsOf, tailOf } from './damage.js';

// Stages each kind of crash from a known start, for the tests and for trying them by hand
// (`?stage=rotor` and friends in the URL, or `__helicoptea.stageCrash('tail')` in the console).
// Staging only places the aircraft and gives it a push: everything after that is the real simulation.
export const STAGES = ['rotor', 'wear', 'tail', 'dunk', 'rollover', 'impact', 'fall'];

// A clear stretch of the kitchen's side wall: between the range cooker (and its flue) and the fridge.
const WALL_Z = (RANGE.z1 + FRIDGE.z0) / 2;
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);

function place(sim, pos, quat, vel, angvel = { x: 0, y: 0, z: 0 }) {
  const h = sim.heli;
  for (const b of sim.carriedCargo()) sim.detachBag(b, true);
  const dx = pos.x - h.pos.x, dy = pos.y - h.pos.y, dz = pos.z - h.pos.z;
  h.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
  h.body.setRotation({ x: quat.x, y: quat.y, z: quat.z, w: quat.w }, true);
  h.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
  h.body.setAngvel(angvel, true);
  h.updateCached();
  h.track.capture(h.body); h.track.capture(h.body);
  // The skycrane's snorkel comes along (shifted with the airframe, not dragged after it).
  if (h.hose) for (const s of h.hose.segs) {
    const t = s.body.translation();
    s.body.setTranslation({ x: t.x + dx, y: t.y + dy, z: t.z + dz }, true);
    s.body.setLinvel({ x: vel.x, y: vel.y, z: vel.z }, true);
  }
  h.integ = 0; h.cmdPitch = 0; h.cmdRoll = 0; h.impactAcc = 0; h.lastAssist = null;
  h.rotorSpeed = 1;
  if (vel.y < -1) { h.thrust = 0; if (h.tLag !== undefined) h.tLag = 0; if (h.tCommon !== undefined) h.tCommon = 0; } // dropping, not flying
}

// Returns a short description of what to expect, or null for an unknown kind.
export function stageCrash(sim, kind) {
  const h = sim.heli;
  if (!h || sim.state !== 'flying') return null;
  const R = h.def.rotorRadius;
  const hubs = rotorsOf(h.type).map((r) => r.hub);
  const minHubZ = Math.min(...hubs.map((p) => p[2])), hubY = hubs[0][1];
  const yaw0 = new THREE.Quaternion();
  const cup = CUPS[1];
  // Nose towards the side wall (-x), or tail towards it.
  const yawLeft = new THREE.Quaternion().setFromAxisAngle(Y, Math.PI / 2), yawRight = new THREE.Quaternion().setFromAxisAngle(Y, -Math.PI / 2);
  switch (kind) {
    case 'rotor': case 'wear': {
      // Hovering beside the kitchen's side wall, drifting into it: fast shatters, slow chips the blades.
      place(sim, new THREE.Vector3(ROOM.minX + R + 0.02 - minHubZ, 0.25 - hubY, WALL_Z), yawLeft, new THREE.Vector3(-(kind === 'rotor' ? 0.7 : 0.18), 0, 0));
      return kind === 'rotor' ? 'Rotor strike on the wall: the blades shatter and the airframe drops' : 'Blades chewing the wall: wear, shake, then they let go';
    }
    case 'tail': {
      const t = tailOf(h.type);
      if (!t) return stageCrash(sim, 'rotor');
      // Hovering with the tail towards the wall, backing into it.
      place(sim, new THREE.Vector3(ROOM.minX + t.hub[2] + t.r + 0.006, 0.25 - t.hub[1], WALL_Z), yawRight, new THREE.Vector3(-0.08, 0, 0));
      return 'Tail rotor into the wall: no anti-torque, it spins. Lower the collective to slow the spin';
    }
    case 'dunk': {
      // Nose first into the teacup on the table.
      const q = new THREE.Quaternion().setFromAxisAngle(X, -Math.PI / 2);
      place(sim, new THREE.Vector3(cup.x, cup.baseY + cup.height + 0.068, cup.z + 0.004), q, new THREE.Vector3(0, -0.4, 0));
      return 'Nose first into the teacup';
    }
    case 'rollover': {
      const q = new THREE.Quaternion().setFromAxisAngle(Z, 1.25);
      place(sim, new THREE.Vector3(-0.3, 0.05, 0.4), q, new THREE.Vector3(0.05, -0.1, 0), { x: 0, y: 0, z: 2 });
      return 'Tipped over on the table: the blades thrash into it';
    }
    case 'impact': {
      place(sim, new THREE.Vector3(0.65, 0.1, 0.42), yaw0, new THREE.Vector3(0.2, -3.2, 0)); // clear of the rollover's spot
      return 'Flown hard into the table';
    }
    case 'fall': {
      place(sim, new THREE.Vector3(1.2, -0.6, 0.5), yaw0, new THREE.Vector3(0, -3, 0));
      return 'Off the table and all the way to the floor';
    }
    default: return null;
  }
}
