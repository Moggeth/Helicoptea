// Central tuning for Helicoptea. Units are SI throughout: metres, kilograms, seconds, newtons.
// The table top is y = 0. A real tea bag is ~5 x 6 cm, so the whole world is built at true scale
// and Rapier's lengthUnit is set to centimetres so its internal tolerances suit tiny objects.

export const CFG = {
  physics: {
    worldSpeed: 0.55,      // sim seconds per real second: a slower world reads as a bigger, heavier one (Froude scaling)
    hz: 240,               // fixed simulation rate
    maxStepsPerFrame: 12,  // catch-up cap (50 ms of simulation per rendered frame)
    maxFrameDt: 0.1,       // longer stalls (background tab, debugger) are dropped, not replayed
    gravity: 9.81,
    lengthUnit: 0.01,
    solverIterations: 6,
  },

  heli: {
    mass: 0.024,                       // 24 g micro helicopter
    inertia: [1.5e-4, 1.8e-4, 1.1e-4], // body axes: x = pitch, y = yaw, z = roll (heavy: ~3x a real micro heli)
    rotorRadius: 0.1,
    hookOffset: [0, -0.046, 0],         // cargo hook, directly below the centre of mass
    rotorHubOffset: [0, 0.053, 0],
    skidDrop: 0.047,                   // centre of mass to skid bottom
    thrustToWeight: 2.3,               // full collective, heli alone
    thrustLag: 0.22,                   // blade pitch + inflow response (s); slow, like a big rotor
    spoolTime: 0.5,                    // governor response (s)
    governorDroop: 0.07,               // rotor speed sag at full collective
    groundEffectMax: 1.22,
    translationalLift: 0.08,
    dragPlane: 0.01,                   // rotor H-force, N per m/s in the rotor plane (low: momentum carries)
    dragAxial: 0.035,                  // N per m/s along the rotor axis
    dragQuad: 0.22,                    // N per (m/s)^2 body drag: caps top speed, lets slow drift glide
    angDamp: [4.3e-4, 3.0e-4, 3.6e-4], // rotor aerodynamic damping, N m per rad/s
    cyclicTorque: 9.0e-4,              // N m at full cyclic deflection
    yawTorque: 5.0e-4,
    reactionTorque: 6.0e-5,            // main-rotor torque change with collective (yaw coupling)
    collectiveRate: 0.55,              // assist off: collective change per second at full stick
    idleCollective: 0.12,
  },

  assist: {
    maxTilt: 0.24,          // rad of commanded tilt at full cyclic (~14 deg)
    tiltSlew: 0.45,         // rad/s: how fast the commanded attitude moves (smooth, heavy feel)
    tiltKp: 75,             // attitude stiffness: firm enough to hold against string and wash torques
    tiltKd: 12,
    torqueLimit: 1.6,       // x cyclicTorque
    driftDamping: 0.04,     // rad of counter-tilt per m/s of drift, only near neutral cyclic (a little)
    driftTiltMax: 0.05,
    yawRate: 1.4,           // rad/s at full yaw input
    yawKp: 8,
    climbRate: 0.42,        // m/s at full collective input
    sinkRate: 0.34,
    vKp: 4.5,               // vertical speed loop (1/s)
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
    maxBags: 7,
    pegRefillDelay: 2.0,
    brewTime: 14,           // s for a fully immersed fresh bag to take a cup ~63% of the way
    potencyLife: 110,       // s of full immersion before a bag is spent
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
    inertia: [5.5e-4, 5.0e-4, 3.0e-4], // pitch, yaw, roll (kg m^2): long, heavy airframe
    rotorRadius: 0.1,
    hubs: [[0, 0.043, -0.067], [0, 0.053, 0.067]], // forward (turns CCW from above), aft (CW)
    hooks: [[0, -0.029, -0.03], [0, -0.029, 0], [0, -0.029, 0.03]], // forward, centre, aft cargo hooks
    gearDrop: 0.031,                   // centre of mass to wheel bottoms
    thrustToWeight: 2.0,               // both rotors at full collective, empty
    thrustLag: 0.09,                   // bigger blades, more inflow to change (s)
    cyclicLag: 0.05,
    spoolTime: 0.6,
    governorDroop: 0.08,
    groundEffectMax: 1.2,
    translationalLift: 0.08,
    aftWakeLoss: 0.03,                 // rotor flying in the other rotor's wake loses this much lift
    diffCollective: 0.045,             // max differential collective, fraction of one rotor's max thrust
    latCyclic: 0.1,                    // rad of lateral disc tilt at full roll input (~6 deg)
    yawCyclic: 0.05,                   // rad of opposite disc tilt at full yaw input
    dragAxial: 0.12,                   // per rotor, N per m/s through the disc (inflow change)
    dragPlane: 0.015,                  // per rotor H-force, N per m/s in the disc plane (acts at the hub)
    dragLinear: 0.03,                  // fuselage and rotor-wash drag at the CG, N per m/s
    dragQuad: 0.05,                    // body drag, N per (m/s)^2
    sideDrag: 0.02,                    // fuselage side area aft of the CG (weathervane), N per m/s
    angDamp: [2.0e-3, 2.5e-3, 1.8e-3], // flapping/hub damping, N m per rad/s
    reactionK: 1.9e-3,                 // rotor torque ~ k T^1.5; cancels between the rotors at equal thrust
    collectiveRate: 0.42,
    idleCollective: 0.12,
    impactDv: 0.85,                    // heavier airframe, a little less forgiving
    explosionImpulse: 1.05,
    assist: {
      maxTilt: 0.27,        // ~15 deg: a heavy lifter is flown gently
      tiltKp: 90,
      tiltKd: 13,
      trimKi: 5,            // pitch/roll trim integrator: learns hook loads off the CG
      trimMax: 0.75,
      driftDamping: 0.14,
      driftTiltMax: 0.11,
      yawRate: 0.9,
      yawKp: 10,
      yawKi: 12,
      climbRate: 0.4,
      sinkRate: 0.32,
      vKp: 5,
      vKi: 1.0,
      integMin: -0.5,
      integMax: 1.4,
    },
  },
};
