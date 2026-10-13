// Central tuning for Helicoptea. Units are SI throughout: metres, kilograms, seconds, newtons.
// The table top is y = 0. A real tea bag is ~5 x 6 cm, so the whole world is built at true scale
// and Rapier's lengthUnit is set to centimetres so its internal tolerances suit tiny objects.

export const CFG = {
  physics: {
    worldSpeed: 0.7,       // sim seconds per real second: a slower world reads as a bigger, heavier one (Froude scaling)
    hz: 240,               // fixed simulation rate
    maxStepsPerFrame: 12,  // catch-up cap (50 ms of simulation per rendered frame)
    maxFrameDt: 0.1,       // longer stalls (background tab, debugger) are dropped, not replayed
    gravity: 9.81,
    lengthUnit: 0.01,
    solverIterations: 6,
  },

  heli: {
    mass: 0.024,                       // 24 g micro helicopter
    inertia: [1.0e-4, 1.2e-4, 7.0e-5], // body axes: x = pitch, y = yaw, z = roll
    rotorRadius: 0.1,
    hookOffset: [0, -0.046, 0],         // cargo hook, directly below the centre of mass
    rotorHubOffset: [0, 0.053, 0],
    skidDrop: 0.047,                   // centre of mass to skid bottom
    thrustToWeight: 2.3,               // full collective, heli alone
    thrustLag: 0.03,                   // thrust follows collective almost at once (F = ma from the moment you push)
    spoolTime: 0.2,                    // governor response (s)
    governorDroop: 0.07,               // rotor speed sag at full collective
    groundEffectMax: 1.22,
    translationalLift: 0.08,
    dragPlane: 0.006,                  // rotor H-force, N per m/s in the rotor plane (low: momentum carries)
    dragAxial: 0.055,                  // N per m/s along the rotor axis (inflow): damps climbs and gives the flare kick when you pull up at speed
    dragQuad: 0.04,                    // N per (m/s)^2 in the rotor plane: a soft speed cap, otherwise you drift like a rocket
    angDamp: [4.0e-4, 2.2e-4, 3.0e-4], // rotor aerodynamic damping, N m per rad/s
    weathervane: 1.0e-3,               // tail fin: yaw torque per (m/s)^2 of sideslip, nose turns into the airflow at speed
    cyclicTorque: 1.2e-3,              // N m at full cyclic deflection
    yawTorque: 1.0e-3,                 // pedal authority: enough to swing the nose round at the top of a J-turn
    reactionTorque: 6.0e-5,            // main-rotor torque change with collective (yaw coupling)
    collectiveRate: 0.25,              // assist off: collective change per second at full stick (fine: little drag to hide mistakes)
    idleCollective: 0.12,
  },

  assist: {
    maxTilt: 0.24,          // rad of commanded tilt at full cyclic (~14 deg)
    tiltSlew: 1.2,          // rad/s: how fast the commanded attitude follows the stick
    tiltKp: 110,            // attitude stiffness: firm enough to hold against string and wash torques
    tiltKd: 15,
    torqueLimit: 1.6,       // x cyclicTorque
    driftDamping: 0.04,     // rad of counter-tilt per m/s of drift, only near neutral cyclic (a little)
    driftTiltMax: 0.05,
    yawRate: 2.4,           // rad/s at full yaw input (brisk pedal turns)
    yawKp: 8,
    climbRate: 0.42,        // m/s at full collective input
    sinkRate: 0.34,
    vKp: 7,                 // vertical speed loop (1/s)
    vKi: 1.3,               // integrator (g per m/s per s): learns cargo weight, so lifting a bag sags first
    integMin: -0.5,
    integMax: 1.4,
  },

  cargo: {
    ropeLength: 0.15,
    ropeSegments: 14,
    bagHalf: [0.024, 0.03, 0.004],
    dryMass: 0.003,
    waterCapacity: 0.009,   // fully soaked bag is 12 g, heli can lift it at ~1.5 thrust/weight
    dryVolume: 6.0e-6,      // effective displaced volume (dry bags float at first)
    wetVolume: 1.6e-6,
    soakTime: 2.4,          // s, wetness time constant while immersed
    drainTime: 11,          // s, retained water drains towards the damp floor
    dampFloor: 0.32,        // fraction of peak wetness kept after draining
    dripMass: 0.00018,
    waterDensity: 1000,
    dragNormal: 1.75,       // 0.5 rho Cd A, N per (m/s)^2 broadside in water
    dragTangent: 0.16,
    dragLinear: 0.03,
    airDrag: 0.0025,
    attachRadius: 0.042,
    maxBags: 11,            // six on the two stands, room for bags left steeping in cups
    pegRefillDelay: 2.0,
    brewTime: 14,           // s for a fully immersed fresh bag to take a cup ~63% of the way
    potencyLife: 110,       // s of full immersion before a bag is spent
  },

  // Bambi-style milk bucket on the same line and hooks as the bags. It fills through a one-way valve in
  // its base when dipped (inside and outside levels equalise), empties through a release valve the pilot
  // opens, and part of its contents sloshes as the first slosh mode of a cylindrical tank.
  milk: {
    rimR: 0.0135, baseR: 0.0105, height: 0.026, // interior frustum (m): about 12 ml brim full
    wall: 0.0009,
    dryMass: 0.0034,        // fabric, frame and the ballast ring that sinks it
    bridle: 0.02,           // rim to swivel, where the line ties on
    lineLength: 0.13,
    density: 1030,          // milk; tea is water
    inletR: 0.0028,         // one-way fill valve in the base (Torricelli inflow while outside is higher)
    valveR: 0.0026,         // release valve
    dischargeCd: 0.62,
    sloshFrac: 0.45,        // share of the contents that moves in the slosh mode
    sloshDamping: 0.07,
    dragK: 0.9,             // N per (m/s)^2 through liquid, whole bucket
    dragLinear: 0.02,
    maxParcels: 140,        // falling stream parcels (bounded; overflow merges, never drops milk)
    parcelEvery: 2,         // physics steps between stream parcels
    streamDrag: 0.35,       // s: a falling stream takes this long to follow the rotor wash
    film: 0.0011,           // puddle thickness (m)
    maxPuddles: 10,
    puddleMaxR: 0.07,
    puddleLife: 150,        // s for a puddle to soak in and dry to ~37%
  },

  crash: {
    impactDv: 0.95,         // m/s velocity change from a single contact that destroys the heli
    bumpDv: 0.22,
    rolloverUpY: 0.34,      // cos(70 deg): touching anything while tilted beyond this rolls it over
    rotorStrikeSpeed: 0.55, // rotor contact above this speed is instantly fatal
    rotorStrikeBudget: 0.16,
    debrisLife: 13,
    maxDebris: 34,
    explosionImpulse: 1.25, // m/s radial
  },

  air: {
    strength: 1.0,          // scales the rotor's induced velocity (momentum theory)
    maxReach: 0.8,          // m, how far below the rotor the wake is traced
    decay: 0.45,            // s, outwash dies away after the heli leaves
    iterations: 10,         // pressure solve iterations per update (warm-started)
    updateEvery: 4,         // physics steps per air update (240/4 = 60 Hz)
    bagDrag: 1.0,           // scales wind forces on tea bags
    stringFlutter: 0.06,
    buffet: 1.0,            // ground-effect recirculation turbulence on the heli
  },

  camera: {
    distance: 0.44,
    cargoDistance: 0.56,
    minDistance: 0.22,
    maxDistance: 1.0,
    elevation: 0.52,        // rad (~30 deg) looking down
    yawFollow: 2.2,         // 1/s horizon-stable heading follow
    posFollow: 14,          // 1/s
    lookFollow: 22,
    cargoLookBias: 0.38,
    dipElevation: 0.6,      // rad (~34 deg) with a load low over a cup (Dipping camera option)
    dipLookBias: 0.62,      // frame nearer the load
    dipDistance: 0.78,      // of the carrying distance
    fov: 50,
  },

  input: {
    deadZone: 0.14,
    expo: 0.45,
    keyRise: 7.5,           // keyboard axis slew (1/s) so taps are proportional
    keyFall: 11,
  },

  // Tandem-rotor heavy lifter (CH-47 style), about 1:90 scale: 17 cm fuselage, two 20 cm rotors.
  // No tail rotor: pitch comes from differential collective, roll from lateral cyclic on both discs,
  // yaw from differential lateral cyclic (front disc one way, aft disc the other).
  chinook: {
    inertia: [1.4e-3, 1.3e-3, 8.0e-4], // pitch, yaw, roll (kg m^2): long, heavy airframe (~9x the micro's pitch)
    rotorRadius: 0.1,
    hubs: [[0, 0.043, -0.067], [0, 0.053, 0.067]], // forward (turns CCW from above), aft (CW)
    hooks: [[0, -0.029, -0.03], [0, -0.029, 0], [0, -0.029, 0.03]], // forward, centre, aft cargo hooks
    gearDrop: 0.031,                   // centre of mass to wheel bottoms
    thrustToWeight: 2.0,               // both rotors at full collective, empty
    thrustLag: 0.06,                   // collective: thrust follows almost at once; heaviness comes from mass
    diffLag: 0.14,                     // differential collective (pitch control) (s)
    cyclicLag: 0.05,
    spoolTime: 0.35,
    governorDroop: 0.08,
    groundEffectMax: 1.2,
    translationalLift: 0.08,
    aftWakeLoss: 0.008,                // aft rotor in the front rotor's wake loses a little lift (more set up a pitch oscillation)
    diffCollective: 0.045,             // max differential collective, fraction of one rotor's max thrust
    latCyclic: 0.08,                   // rad of lateral disc tilt at full roll input (~4.5 deg)
    yawCyclic: 0.14,                   // rad of opposite disc tilt at full yaw input (pedal turns at the top of a J-turn)
    dragAxial: 0.06,                   // per rotor, N per m/s through the disc (inflow change): damps climbs and sinks
    dragPlane: 0.006,                  // per rotor H-force, N per m/s in the disc plane (acts at the hub)
    dragLinear: 0.01,                  // fuselage and rotor-wash drag at the CG, N per m/s
    dragQuad: 0.16,                    // horizontal body drag, N per (m/s)^2: soft speed cap, momentum carries
    sideDrag: 0.02,                    // fuselage side area aft of the CG (weathervane), N per m/s
    angDamp: [5.5e-3, 1.8e-3, 2.2e-3], // flapping/hub damping, N m per rad/s (pitch: tandem rotors resist pitching strongly)
    reactionK: 1.9e-3,                 // rotor torque ~ k T^1.5; cancels between the rotors at equal thrust
    collectiveRate: 0.2,                // assist off: fine collective trim
    idleCollective: 0.12,
    impactDv: 0.85,                    // heavier airframe, a little less forgiving
    explosionImpulse: 1.05,
    assist: {
      maxTilt: 0.22,        // ~13 deg: a heavy lifter is flown gently
      tiltSlew: 0.8,        // rad/s: the commanded attitude follows the stick (slower than the micro's 1.2)
      tiltKp: 45,
      tiltKd: 9,
      trimKi: 3,            // pitch/roll trim integrator: learns hook loads off the CG
      trimMax: 0.75,
      driftDamping: 0.04,
      driftTiltMax: 0.05,
      yawRate: 0.7,
      yawKp: 7,
      yawKi: 8,
      climbRate: 0.32,
      sinkRate: 0.26,
      vKp: 6,
      vKi: 1.0,
      integMin: -0.5,
      integMax: 1.4,
    },
  },

  // Skycrane tanker (S-64 Air-Crane style), about 1:110: a skeletal crane spine with a glass cockpit pod,
  // a six-blade main rotor, a four-blade tail rotor high on the left of the tail pylon, and a belly tank
  // filled through a snorkel hose. One main rotor: pitch and roll are disc tilt (thrust line plus hub
  // moment), yaw is the tail rotor fighting the main rotor's torque.
  skycrane: {
    inertia: [1.7e-3, 2.0e-3, 9.5e-4], // pitch, yaw, roll (kg m^2), dry
    rotorRadius: 0.1,
    hub: [0, 0.047, 0],                // mast straight over the dry CG
    tailHub: [-0.012, 0.045, 0.128],   // left side of the tail pylon; its disc spins about body X
    tailRadius: 0.021,
    hooks: [[0, -0.031, 0.04]],        // it is a crane: one cargo hook behind the tank
    gearDrop: 0.041,
    thrustToWeight: 2.1,               // empty; about 1.5 with a full tank
    thrustLag: 0.07,
    cyclicLag: 0.06,
    tailLag: 0.05,
    spoolTime: 0.4,
    governorDroop: 0.08,
    groundEffectMax: 1.2,
    translationalLift: 0.08,
    cyclicMax: 0.08,                   // rad of disc tilt at full stick
    hubStiffness: 0.025,               // N m per rad of disc tilt at full rotor speed (articulated head)
    tailMax: 0.06,                     // N of tail rotor thrust either way
    reactionK: 1.9e-3,                 // main rotor torque ~ k T^1.5
    dragAxial: 0.06,
    dragPlane: 0.008,
    dragLinear: 0.012,
    dragQuad: 0.18,
    sideDrag: 0.025,
    angDamp: [5.5e-3, 3.5e-3, 2.6e-3],
    collectiveRate: 0.3,
    idleCollective: 0.12,
    impactDv: 0.85,
    explosionImpulse: 1.05,
    tank: {
      half: [0.015, 0.009, 0.03],      // interior (m): 32 ml
      center: [0, -0.0155, -0.002],
      doorArea: 1.7e-4,                // m^2 with both belly doors fully open (a salvo empties it in about a second)
      doorSlew: 1.4,                   // keyboard/touch: doors open at this rate while held (1/s); a trigger is direct
      doorClose: 4,                    // doors swing shut this fast (1/s)
      pumpRate: 2.2e-5,                // m^3/s at full pump: fills in about 1.5 s
      pumpSpool: 0.3,
      sloshFrac: 0.5,
      sloshDamping: 0.08,
    },
    hose: {
      segments: 9,
      anchor: [0.011, -0.025, -0.024], // front right of the tank
      minLength: 0.014,
      maxLength: 0.17,
      startLength: 0.07,
      reelSpeed: 0.07,                 // m/s
      radius: 0.0019,
      segMass: 0.0005,
      headMass: 0.004,                 // weighted intake: it sinks
      headRadius: 0.003,
    },
    assist: {
      maxTilt: 0.22,
      tiltSlew: 0.8,
      tiltKp: 45,
      tiltKd: 9,
      trimKi: 3,
      trimMax: 0.75,
      driftDamping: 0.04,
      driftTiltMax: 0.05,
      yawRate: 0.8,
      yawKp: 7,
      yawKi: 8,
      climbRate: 0.32,
      sinkRate: 0.26,
      vKp: 6,
      vKi: 1.0,
      integMin: -0.5,
      integMax: 1.6,
    },
  },
};
