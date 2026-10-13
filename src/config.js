// Central tuning for Helicoptea. Units are SI throughout: metres, kilograms, seconds, newtons.
// The table top is y = 0. A real tea bag is ~5 x 6 cm, so the whole world is built at true scale
// and Rapier's lengthUnit is set to centimetres so its internal tolerances suit tiny objects.

export const CFG = {
  physics: {
    hz: 240,               // fixed simulation rate
    maxStepsPerFrame: 12,  // catch-up cap (50 ms of simulation per rendered frame)
    maxFrameDt: 0.1,       // longer stalls (background tab, debugger) are dropped, not replayed
    gravity: 9.81,
    lengthUnit: 0.01,
    solverIterations: 6,
  },

  heli: {
    mass: 0.024,                       // 24 g micro helicopter
    inertia: [5.0e-5, 6.0e-5, 3.6e-5], // body axes: x = pitch, y = yaw, z = roll
    rotorRadius: 0.1,
    hookOffset: [0, -0.046, 0],         // cargo hook, directly below the centre of mass
    rotorHubOffset: [0, 0.042, 0],
    skidDrop: 0.047,                   // centre of mass to skid bottom
    thrustToWeight: 2.3,               // full collective, heli alone
    thrustLag: 0.07,                   // blade pitch + inflow response (s)
    spoolTime: 0.3,                    // governor response (s)
    governorDroop: 0.07,               // rotor speed sag at full collective
    groundEffectMax: 1.22,
    translationalLift: 0.08,
    dragPlane: 0.05,                   // rotor H-force, N per m/s in the rotor plane
    dragAxial: 0.065,                  // N per m/s along the rotor axis
    dragQuad: 0.02,                    // N per (m/s)^2 body drag
    angDamp: [2.4e-4, 1.7e-4, 2.0e-4], // rotor aerodynamic damping, N m per rad/s
    cyclicTorque: 5.0e-4,              // N m at full cyclic deflection
    yawTorque: 3.0e-4,
    reactionTorque: 6.0e-5,            // main-rotor torque change with collective (yaw coupling)
    collectiveRate: 0.55,              // assist off: collective change per second at full stick
    idleCollective: 0.12,
  },

  assist: {
    maxTilt: 0.38,          // rad of commanded tilt at full cyclic (~22 deg)
    tiltKp: 190,            // attitude natural frequency^2
    tiltKd: 18,
    torqueLimit: 1.6,       // x cyclicTorque
    driftDamping: 0.11,     // rad of counter-tilt per m/s of drift, only near neutral cyclic
    driftTiltMax: 0.09,
    yawRate: 2.2,           // rad/s at full yaw input
    yawKp: 14,
    climbRate: 0.55,        // m/s at full collective input
    sinkRate: 0.42,
    vKp: 8,                 // vertical speed loop (1/s)
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
};
