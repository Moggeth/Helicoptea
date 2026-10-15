import { CFG } from '../config.js';

// Flight Assist off: how the lift stick sets the collective. Shared by all three aircraft.
//
// 'spring' (default): the stick *is* the collective lever, and it springs back. Centred gives a little less
//   lift than the aircraft weighs, so it settles gently; holding it up climbs, harder the further you push;
//   pulled down it sinks faster. Let go and you come down slowly, never off into the sky.
// 'hold': the stick trims the collective up and down at collectiveRate and it stays where you leave it.
//
// Spring levels (CFG.collective) are thrust in units of the all-up weight: airframe, milk aboard and hooked
// cargo. Full up is capped by what the rotor has, so a heavy load still eats the climb margin. loadComp
// scales the cargo out of the centre and down levels: 1 means centre always settles gently whatever you
// carry; 0 means centre is set for the empty airframe and a load makes you hold the stick up to stay level.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const COLLECTIVE_MODES = ['spring', 'hold'];

export function collectiveMode() { return CFG.collective.mode === 'hold' ? 'hold' : 'spring'; }

// Mass hanging on the aircraft's hooks (bags, the milk bucket). No allocation: this runs every physics step.
export function hookedMass(sim) {
  if (!sim || !sim.bags) return 0;
  let m = 0;
  for (const b of sim.bags) if (b.attach && b.attach.kind === 'heli') m += b.mass;
  const k = sim.milk && sim.milk.bucket;
  if (k && k.attach && k.attach.kind === 'heli') m += k.mass;
  return m;
}

// Collective (0..1 of full thrust) at the three spring points. tw: full-collective thrust over the empty
// weight; load: all-up mass over empty mass.
export function springLevels(tw, load = 1) {
  const S = CFG.collective;
  const ref = 1 + S.loadComp * (Math.max(1, load) - 1);
  const mid = clamp((S.neutral * ref) / tw, 0, 1);
  return { mid, top: clamp((S.up * Math.max(1, load)) / tw, mid, 1), low: clamp((S.down * ref) / tw, 0, mid) };
}

// Collective for a lift stick position in spring mode.
export function springCollective(stick, tw, load = 1) {
  const { mid, top, low } = springLevels(tw, load);
  const s = clamp(stick, -1, 1);
  return s >= 0 ? mid + s * (top - mid) : mid + s * (mid - low);
}

// The stick position that asks for a given collective (inverse of springCollective), for scripted pilots.
export function springStick(want, tw, load = 1) {
  const { mid, top, low } = springLevels(tw, load);
  if (want >= mid) return top <= mid ? 0 : clamp((want - mid) / (top - mid), 0, 1);
  return mid <= low ? 0 : clamp((want - mid) / (mid - low), -1, 0);
}

// One step of the assist-off collective. def: the aircraft's CFG block (thrustToWeight, collectiveRate,
// idleCollective). Landed with the stick centred, the lever settles to idle so the aircraft sits firmly.
export function stepCollective(current, stick, def, dt, { grounded = false, load = 1, settle = 0.25 } = {}) {
  if (collectiveMode() === 'hold') return clamp(current + stick * def.collectiveRate * dt, 0, 1);
  if (grounded && stick <= 0.02) return current + (def.idleCollective - current) * (1 - Math.exp(-dt / settle));
  return springCollective(stick, def.thrustToWeight, load);
}
