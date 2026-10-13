import { CFG } from '../config.js';
import { Helicopter, HELI_PARTS } from './helicopter.js';
import { Chinook } from './chinook.js';
import { Skycrane } from './skycrane.js';

// Flyable aircraft. Each instance exposes the same surface to the sim, view, audio and HUD:
// body, colliders, rotors (sensor colliders), pos/vel/quat/up, hookWorlds, thrust, thrustFrac,
// rotorSpeed, collective, grounded, groundDist, skidClearance, predVel, impactAcc, heading(),
// applyForces(), afterStep(), destroy(), and `def` (mass, parts, hooks, rotorRadius, ...).
export const AIRCRAFT_IDS = ['micro', 'chinook', 'skycrane'];
export const AIRCRAFT_NAMES = { micro: 'Micro heli', chinook: 'Chinook', skycrane: 'Skycrane' };

export function createAircraft(sim, type, pos, yaw) {
  if (type === 'chinook') return new Chinook(sim, pos, yaw);
  if (type === 'skycrane') return new Skycrane(sim, pos, yaw);
  const H = CFG.heli;
  const h = new Helicopter(sim, pos, yaw);
  // The micro heli predates the multi-aircraft surface; describe it here so helicopter.js stays untouched.
  h.type = 'micro';
  h.def = {
    id: 'micro', name: 'Micro heli', mass: H.mass, parts: HELI_PARTS, hooks: [H.hookOffset],
    rotorRadius: H.rotorRadius, gearDrop: H.skidDrop, thrustToWeight: H.thrustToWeight,
    impactDv: CFG.crash.impactDv, explosionImpulse: CFG.crash.explosionImpulse, scale: 1,
  };
  h.rotors = [h.rotor];
  h.hookWorlds = [h.hookWorld];
  h.phaseOf = () => h.rotorPhase;
  return h;
}

export function gearDrop(type) {
  return type === 'chinook' ? CFG.chinook.gearDrop : type === 'skycrane' ? CFG.skycrane.gearDrop : CFG.heli.skidDrop;
}
