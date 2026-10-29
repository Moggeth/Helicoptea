// The crash beat: a moment of slow motion when it all goes wrong (the world clock, so effects, sound
// triggers and the flight recording all share it), and what the crash screen says about each kind of crash.

const CRASH = { dip: 0.28, hold: 0.32, ease: 0.8 };   // world speed scale, seconds held, seconds back to normal

export class CrashCinema {
  constructor() { this.reset(); }
  reset() { this.scale = 1; this.t = 0; this.dip = 1; this.hold = 0; this.ease = 0; }

  crash(e) { this.start(e.kind === 'dunk' ? 0.4 : CRASH.dip, CRASH.hold, CRASH.ease); }
  // A strike that doesn't end the flight yet (blades or the tail rotor going): a shorter, gentler beat.
  strike(hold) { this.start(0.45, hold, 0.4); }

  start(dip, hold, ease) {
    if (this.scale < dip && this.t < this.hold) return; // already deeper in a beat
    this.dip = dip; this.hold = hold; this.ease = ease; this.t = 0; this.scale = dip;
  }

  // frameDt: real seconds.
  update(frameDt) {
    if (this.scale >= 1) return;
    this.t += frameDt;
    if (this.t < this.hold) { this.scale = this.dip; return; }
    const f = Math.min(1, (this.t - this.hold) / this.ease);
    this.scale = this.dip + (1 - this.dip) * f * f * (3 - 2 * f);
  }
}

const WON = { ceramic: 'The china won.', glass: 'The glass won.', brick: 'The bricks won.', plaster: 'The wall won.', plant: 'The garden won.',
  metal: 'The metal won.', stone: 'The stone won.', tile: 'The floor won.', fur: 'The cat won.', cloth: 'The curtains won.', person: 'Mind the neighbours.' };
const BLADES = {
  ceramic: 'Blades and china do not mix.', glass: 'Blades and glass do not mix.', wood: 'Blades and woodwork do not mix.',
  plant: 'You pruned it, and it pruned you.', brick: 'The wall kept the blades.', plaster: 'The wall kept the blades.', stone: 'The stone kept the blades.',
  metal: 'Metal on metal, and the blades lost.', fur: 'The cat is fine. The blades are not.', tea: 'Blades in the tea. Shaken, then stirred.',
};

// The crash screen's heading for each kind.
const TITLES = { impact: 'Ka-boom.', shatter: 'Ka-boom.', spin: 'Round and round.', thrash: 'Ka-boom.', fall: 'Splat.', dunk: 'Sploosh.' };
export const crashTitle = (e) => TITLES[e.kind] || 'Ka-boom.';

export function crashMessage(e) {
  switch (e.reason) {
    case 'impact': return `Hit at ${(e.impact || 0).toFixed(1)} m/s. ${WON[e.material] || 'The table won.'}`;
    case 'rotor strike': return e.who ? `Rotor strike. ${e.who} said ow.` : `Rotor strike. ${BLADES[e.material] || 'The blades went first, then everything else.'}`;
    case 'tail strike': return e.who ? `Tail rotor strike. ${e.who} said ow.` : 'Tail rotor gone. Round and round, and down.';
    case 'rollover': return 'Tipped over and the blades bit in. Keep it level near the surface.';
    case 'fall': case 'floor': return 'A long way down. Gravity always wins.';
    case 'dunk': return 'Dunked. Biscuits go in the tea; helicopters do not.';
    default: return 'Down she goes.';
  }
}
