// The flight tuning board: every knob, what it maps to in CFG, its range and its preview clip.
//
// How values combine: effective = aircraft base (config.js) × global multiplier × per-aircraft multiplier.
// Everything defaults to ×1, so the defaults are exactly today's game.
//
// kind: 'mult'  multiplier on one or more CFG paths per aircraft (log-scaled slider)
//       'excess' multiplier on the part above 1 (ground cushion: 1.22 -> 1 + 0.22 × m)
//       'abs'   an absolute value (sticks), stored directly
//       'world' world speed: shares the pause menu's World weight setting
//
// clip.scenario names a scripted flight in preview.js; both sides fly the same inputs from the same pose.

export const AIRCRAFT = ['micro', 'chinook', 'skycrane'];
export const AIRCRAFT_LABEL = { micro: 'Micro heli', chinook: 'Chinook', skycrane: 'Skycrane' };

export const GROUPS = [
  { id: 'dot', label: 'Moving a dot', blurb: 'Momentum, drag and power: how the aircraft carries speed and climbs.' },
  { id: 'heli', label: 'Becoming a helicopter', blurb: 'How fast it tilts and turns, and how much rotational momentum it has.' },
  { id: 'lift', label: 'Lift stick (Assist off)', blurb: 'The sprung lift stick: what full up, centre and full down ask of the rotor. Ignored in the Stays put lift mode.' },
  { id: 'sticks', label: 'Stick mapping', blurb: 'How your stick movement becomes control input. Applies to keyboard, pad and touch.' },
  { id: 'flavour', label: 'Rotor wash', blurb: 'How hard the wash blows things about. It never pushes the aircraft itself.' },
  { id: 'assist', label: 'Flight Assist', blurb: 'Only matters with Flight Assist on.' },
];

const all = (paths) => ({ micro: paths.micro || [], chinook: paths.chinook || [], skycrane: paths.skycrane || [] });

export const KNOBS = [
  // ---------------------------------------------------------------- moving a dot
  { id: 'worldSpeed', group: 'dot', label: 'World speed', kind: 'world', min: 0.4, max: 1.0, step: 0.01, global: true, perAircraft: false,
    hint: 'How fast the whole world runs. Slower reads as bigger and heavier; real time is 1.0.',
    clip: { scenario: 'dashRelease', low: 'Slow motion: big and heavy', high: 'Real time: toy-like', watch: 'Same flight, same inputs, only the clock differs.' } },
  { id: 'gravity', group: 'dot', label: 'Gravity', kind: 'mult', min: 0.5, max: 1.5, global: true, perAircraft: false,
    targets: { global: ['physics.gravity'] },
    hint: 'Pull of the world. Lower is floatier; thrust is matched to weight, so hovering still needs the same stick.',
    clip: { scenario: 'cutPower', low: 'Floats down', high: 'Drops like a stone', watch: 'Power cut at 30 cm.' } },
  { id: 'coasting', group: 'dot', label: 'Coasting', kind: 'mult', min: 0.25, max: 6, global: true, perAircraft: true, invert: true,
    targets: all({ micro: ['heli.dragPlane'], chinook: ['chinook.dragPlane', 'chinook.dragLinear'], skycrane: ['skycrane.dragPlane', 'skycrane.dragLinear'] }),
    lowLabel: 'glide', highLabel: 'grip',
    hint: 'Linear air drag. Low lets you glide on after releasing the stick (rocket drift); high stops you quickly.',
    clip: { scenario: 'dashRelease', low: 'Glides on', high: 'Stops quickly', watch: 'Full forward, then level off: how far does it slide?' } },
  { id: 'topSpeed', group: 'dot', label: 'Top-speed cap', kind: 'mult', min: 0.3, max: 3, global: true, perAircraft: true,
    targets: all({ micro: ['heli.dragQuad'], chinook: ['chinook.dragQuad'], skycrane: ['skycrane.dragQuad'] }),
    lowLabel: 'faster', highLabel: 'capped',
    hint: 'Drag that grows with speed. Low keeps accelerating; high levels off at a gentle cruise.',
    clip: { scenario: 'dashHold', low: 'Keeps accelerating', high: 'Levels off early', watch: 'Full forward for four seconds: watch the trail spacing.' } },
  { id: 'climbDamping', group: 'dot', label: 'Climb/sink damping', kind: 'mult', min: 0.3, max: 3, global: true, perAircraft: true,
    targets: all({ micro: ['heli.dragAxial'], chinook: ['chinook.dragAxial'], skycrane: ['skycrane.dragAxial'] }),
    hint: 'Air flowing through the rotor resists climbing and sinking, and gives the flare kick when you pull up at speed.',
    clip: { scenario: 'punchUp', low: 'Rockets up', high: 'Eases up', watch: 'Same collective push.' } },
  { id: 'thrustToWeight', group: 'dot', label: 'Thrust-to-weight', kind: 'mult', min: 0.7, max: 1.5, global: true, perAircraft: true,
    targets: all({ micro: ['heli.thrustToWeight'], chinook: ['chinook.thrustToWeight'], skycrane: ['skycrane.thrustToWeight'] }),
    hint: 'Spare power. Low struggles with a wet bag; high leaps off the table. With the sprung lift stick it is the ceiling on full up, which a heavy load reaches.',
    clip: { scenario: 'fullClimb', low: 'Sluggish', high: 'Explosive', watch: 'Full collective from a hover.' } },
  { id: 'collectiveRate', group: 'dot', label: 'Collective trim speed', kind: 'mult', min: 0.5, max: 2.5, global: true, perAircraft: true,
    targets: all({ micro: ['heli.collectiveRate'], chinook: ['chinook.collectiveRate'], skycrane: ['skycrane.collectiveRate'] }),
    hint: 'Flight Assist off, Stays put lift mode only: how fast holding lift up/down changes the collective. Low is finer.',
    clip: { scenario: 'collTap', low: 'Small change', high: 'Large change', watch: 'Lift held up for one second, then released.' } },

  // ---------------------------------------------------------------- becoming a helicopter
  { id: 'rotationRate', group: 'heli', label: 'Rotation rate', kind: 'mult', min: 0.5, max: 2.5, global: true, perAircraft: true,
    targets: all({ micro: ['heli.cyclicTorque'], chinook: ['chinook.latCyclic', 'chinook.diffCollective'], skycrane: ['skycrane.cyclicMax'] }),
    hint: 'How hard the cyclic tilts the airframe. High flips quickly; low leans gently.',
    clip: { scenario: 'rollFlick', low: 'Gentle lean', high: 'Snaps over', watch: 'Full roll for a third of a second (Assist off).' } },
  { id: 'rotationWeight', group: 'heli', label: 'Rotation weight', kind: 'mult', min: 0.5, max: 3, global: true, perAircraft: true, restart: true,
    targets: all({ micro: ['heli.inertia'], chinook: ['chinook.inertia'], skycrane: ['skycrane.inertia'] }),
    hint: 'Rotational inertia: how much the airframe resists starting and stopping a tilt. Applies when you restart the flight.',
    clip: { scenario: 'rollFlick', low: 'Snappy', high: 'Swings on', watch: 'Flick and release: does it stop or carry on?' } },
  { id: 'rotationSettling', group: 'heli', label: 'Rotation settling', kind: 'mult', min: 0.3, max: 3, global: true, perAircraft: true,
    targets: all({ micro: ['heli.angDamp'], chinook: ['chinook.angDamp'], skycrane: ['skycrane.angDamp'] }),
    hint: 'Rotor damping of rotation. Low keeps tumbling after a flick; high stops dead.',
    clip: { scenario: 'rollFlick', low: 'Keeps tumbling', high: 'Stops dead', watch: 'Flick and release.' } },
  { id: 'yawAuthority', group: 'heli', label: 'Yaw authority', kind: 'mult', min: 0.5, max: 2, global: true, perAircraft: true,
    targets: all({ micro: ['heli.yawTorque', 'assist.yawRate'], chinook: ['chinook.yawCyclic', 'chinook.assist.yawRate'], skycrane: ['skycrane.tailMax', 'skycrane.assist.yawRate'] }),
    hint: 'Pedal power for turning on the spot and swinging round at the top of a J-turn.',
    clip: { scenario: 'pedal', low: 'Slow turn', high: 'Whip turn', watch: 'Full pedal for a second and a half.' } },
  { id: 'pitchResponse', group: 'heli', label: 'Pitch response', kind: 'mult', min: 0.5, max: 2, global: false, perAircraft: true, only: ['chinook'],
    targets: all({ chinook: ['chinook.diffCollective'] }),
    hint: 'Chinook only: how strongly differential collective pitches the long airframe.',
    clip: { scenario: 'pitchFlick', low: 'Lazy pitch', high: 'Sharp pitch', watch: 'Full forward stick for half a second.' } },

  // ---------------------------------------------------------------- lift stick (assist off, spring mode)
  // 'excess' on levels measured from hover: ×0 is exactly hover, ×2 is twice as far from it.
  { id: 'liftTop', group: 'lift', label: 'Full-up climb', kind: 'excess', min: 0.3, max: 2.5, global: true, perAircraft: false,
    targets: { global: ['collective.up'] }, lowLabel: 'gentle', highLabel: 'punchy',
    hint: 'Lift held fully up asks for this much more than you weigh (×1 is 35% extra). Never more than the rotor has.',
    clip: { scenario: 'liftRelease', low: 'Eases up', high: 'Shoots up', watch: 'Lift held fully up for under a second, then let go.' } },
  { id: 'liftCentre', group: 'lift', label: 'Centred settle', kind: 'excess', min: 0, max: 3, global: true, perAircraft: false, linear: true,
    targets: { global: ['collective.neutral'] }, lowLabel: 'hover', highLabel: 'sink',
    hint: 'How far short of hover the centred stick is (×1 is 5% short). ×0 hovers hands-off; higher settles faster.',
    clip: { scenario: 'liftSettle', low: 'Hangs there', high: 'Settles quickly', watch: 'Hands off the lift stick at 60 cm.' } },
  { id: 'liftBottom', group: 'lift', label: 'Full-down drop', kind: 'excess', min: 0.25, max: 2, global: true, perAircraft: false,
    targets: { global: ['collective.down'] }, lowLabel: 'gentle', highLabel: 'plummet',
    hint: 'How far below hover full down goes (×1 is 40% short of your weight). High comes down fast, so let go early.',
    clip: { scenario: 'liftDrop', low: 'Sinks', high: 'Drops', watch: 'Lift pulled fully down for half a second, then let go.' } },
  { id: 'liftLoadComp', group: 'lift', label: 'Load in the centre', kind: 'mult', min: 0, max: 1, global: true, perAircraft: false, linear: true,
    targets: { global: ['collective.loadComp'] }, lowLabel: 'empty', highLabel: 'loaded',
    hint: 'With a load on: 1 sets centre stick against your weight with the load, so letting go always settles gently. 0 sets it for the empty aircraft, so a heavy load sinks unless you hold lift up.',
    clip: { scenario: 'liftSettle', low: 'Set for empty', high: 'Counts the load', watch: 'The preview flies empty, so both sides match: try it with a bag on the hook.' } },

  // ---------------------------------------------------------------- stick mapping
  { id: 'deadzone', group: 'sticks', label: 'Deadzone', kind: 'abs', min: 0, max: 0.2, step: 0.01, def: 0, global: true, perAircraft: false,
    hint: 'Extra centre deadzone on cyclic and pedals, on top of the controller\'s own. Small stick movements below it do nothing.',
    clip: { scenario: 'curve', curve: 'deadzone', low: '0', high: '0.2', watch: 'Stick position across, control output up.' } },
  { id: 'expo', group: 'sticks', label: 'Expo', kind: 'abs', min: 0, max: 0.8, step: 0.05, def: 0, global: true, perAircraft: false,
    hint: 'Softens the centre for fine corrections and keeps full throw at the edges: out = (1 − e)·x + e·x³.',
    clip: { scenario: 'curve', curve: 'expo', low: 'Linear', high: 'Fine then fast', watch: 'Slow stick sweep from centre to full.' } },
  { id: 'rates', group: 'sticks', label: 'Rates', kind: 'abs', min: 0.5, max: 2, step: 0.05, def: 1, global: true, perAircraft: false,
    hint: 'Full-stick multiplier on cyclic and pedals (capped at full deflection).',
    clip: { scenario: 'curve', curve: 'rates', low: '×0.5', high: '×2', watch: 'Output reaches full deflection earlier with high rates.' } },

  // ---------------------------------------------------------------- rotor wash (looks only)
  { id: 'downwash', group: 'flavour', label: 'Downwash strength', kind: 'mult', min: 0, max: 2, global: true, perAircraft: false, linear: true,
    targets: { global: ['air.strength'] },
    hint: 'How hard the rotor wash blows the bag, string, tea, cloth and steam. It never pushes the aircraft.',
    clip: { scenario: 'lowHover', low: 'Calm', high: 'Gale', watch: 'Low hover over the pad.' } },

  // ---------------------------------------------------------------- assist
  { id: 'assistMaxTilt', group: 'assist', label: 'Max tilt', kind: 'mult', min: 0.5, max: 2, global: true, perAircraft: true,
    targets: all({ micro: ['assist.maxTilt'], chinook: ['chinook.assist.maxTilt'], skycrane: ['skycrane.assist.maxTilt'] }),
    hint: 'With Assist on: the tilt full stick asks for. More tilt, more acceleration.',
    clip: { scenario: 'assistDash', low: 'Gentle', high: 'Aggressive', watch: 'Full forward with Assist on.' } },
  { id: 'assistFollow', group: 'assist', label: 'Attitude follow speed', kind: 'mult', min: 0.4, max: 2.5, global: true, perAircraft: false,
    targets: all({ micro: ['assist.tiltSlew'], chinook: ['chinook.assist.tiltSlew'], skycrane: ['skycrane.assist.tiltSlew'] }),
    hint: 'With Assist on: how quickly the airframe glides to the attitude you ask for.',
    clip: { scenario: 'assistStep', low: 'Lazy', high: 'Crisp', watch: 'Stick forward, then centred.' } },
  { id: 'driftCatch', group: 'assist', label: 'Drift catch', kind: 'mult', min: 0, max: 4, global: true, perAircraft: false, linear: true,
    targets: all({ micro: ['assist.driftDamping'], chinook: ['chinook.assist.driftDamping'], skycrane: ['skycrane.assist.driftDamping'] }),
    hint: 'With Assist on: how much it leans against drift when you centre the stick.',
    clip: { scenario: 'assistDrift', low: 'Slides on', high: 'Settles', watch: 'Released while drifting.' } },
  { id: 'mouseLevel', group: 'assist', label: 'Mouse self-levelling', kind: 'mult', min: 0, max: 3, global: true, perAircraft: false, linear: true,
    targets: { global: ['input.mouse.levelRate'] },
    hint: 'With Assist on, Battlefield mouse: how quickly a tilt left close to level eases back to level. 0 turns it off.',
    clip: { scenario: 'curve', low: 'Off', high: 'Snappy', watch: 'Tilt after letting go of the mouse, from three starting tilts. The dashed line is the zone.' } },
  { id: 'mouseLevelZone', group: 'assist', label: 'Mouse levelling zone', kind: 'mult', min: 0, max: 3, global: true, perAircraft: false, linear: true,
    targets: { global: ['input.mouse.levelZone'] },
    hint: 'With Assist on, Battlefield mouse: how far from level a tilt still gets pulled back. Wider is easier, narrower holds small tilts.',
    clip: { scenario: 'curve', low: 'Off', high: 'Wide', watch: 'Tilt after letting go of the mouse, from three starting tilts. The dashed line is the zone.' } },
  { id: 'assistClimb', group: 'assist', label: 'Climb rate', kind: 'mult', min: 0.5, max: 2, global: true, perAircraft: false,
    targets: all({ micro: ['assist.climbRate', 'assist.sinkRate'], chinook: ['chinook.assist.climbRate', 'chinook.assist.sinkRate'], skycrane: ['skycrane.assist.climbRate', 'skycrane.assist.sinkRate'] }),
    hint: 'With Assist on: climb and sink speed at full lift stick.',
    clip: { scenario: 'assistClimb', low: 'Slow climb', high: 'Fast climb', watch: 'Full lift with Assist on.' } },
];

export const KNOB = Object.fromEntries(KNOBS.map((k) => [k.id, k]));

// Presets apply to the global board (per-aircraft multipliers stay as they are).
export const PRESETS = {
  current: { label: 'Current (all ×1)', global: {} },
  floaty: { label: 'Floaty', global: { coasting: 0.4, topSpeed: 0.6, gravity: 0.8 } },
  snappy: { label: 'Snappy acro', global: { rotationRate: 2, rotationWeight: 0.7, rates: 1.5, expo: 0.4 } },
};

export function knobDefault(k) { return k.kind === 'abs' ? k.def : 1; }
export function appliesTo(k, aircraft) { return !k.only || k.only.includes(aircraft); }
