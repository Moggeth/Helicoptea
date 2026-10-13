# Design notes

## Scale and units

True scale, SI units: metres, kilograms, seconds. Table top is y = 0. Rapier's `lengthUnit` is 0.01 so its contact tolerances suit centimetre objects; with that, 4–5 mm ceramic walls work with CCD on the moving bodies.

| Thing | Value |
|---|---|
| Helicopter | 24 g, 20 cm rotor, inertia 5e-5 / 6e-5 / 3.6e-5 kg m² (pitch/yaw/roll) |
| Max thrust | 2.3 × own weight (≈ 1.5 × with a fully soaked bag) |
| Tea bag | 4.8 × 6 × 0.8 cm, 3 g dry, up to 12 g soaked |
| String | 15 cm |
| Physics | 240 Hz fixed step, 6 solver iterations, max 12 steps per frame, frame dt capped at 0.1 s |

## Flight model ([src/sim/helicopter.js](../src/sim/helicopter.js))

The helicopter is a Rapier dynamic rigid body; it is only ever moved by forces and torques.

- Thrust acts along the rotor axis, so tilting redirects it and costs altitude. Collective sets blade pitch; thrust follows with a 70 ms lag.
- Rotor speed is governed automatically and droops slightly under heavy collective. Thrust and control authority scale with rotor speed squared.
- Ground effect (Cheeseman–Bennett, capped at +22%) from a downward ray at the hub. A little translational lift.
- Drag: rotor-plane H-force, axial drag, quadratic body drag. Rotor aerodynamic damping on all three axes.
- Main-rotor reaction torque changes with collective, so climbing yaws the nose unless corrected.
- The cargo hook sits directly below the centre of mass, so the string's pull produces real pendulum torques and drags the helicopter around when the bag swings.

**Assist off**: cyclic and yaw are torques; collective is trimmed by the player and held. Releasing cyclic leaves the helicopter tilted (only aerodynamic damping slows rotation).

**Assist on**: stabilising torques only. Neutral cyclic commands level; deflection commands up to ~22° of tilt in the heading frame; a small counter-tilt against drift applies only near neutral stick. Yaw becomes a rate command that also cancels reaction torque. Collective becomes a climb-rate command whose integrator learns the extra load slowly, so picking up a wet bag still makes the helicopter sag first. Torque is capped at 1.6× the manual cyclic authority. Nothing teleports or bypasses the cargo forces.

## Tea bag, string and liquid ([src/sim/teabag.js](../src/sim/teabag.js))

- The bag is a rigid cuboid. The string is a Rapier rope joint (maximum distance, so it goes slack), from a peg on the stand or the helicopter's hook to the top of the bag. Tension transfers to the helicopter through the joint.
- Proximity attach: a pulsing ring appears at the loop when the hook is within 4.2 cm, and a dashed guide line appears within 16 cm. Attaching transfers the joint from peg to hook. A loop caught slightly beyond full string length is taken in while the string is slack.
- Immersion is evaluated at nine points across the bag against each cup's real interior water volume (radius, floor, water level). Per point: buoyancy plus normal and tangential drag, integrated implicitly so drag can never overshoot. Pulling the bag sideways through tea is several times harder than through air, and torques come out naturally.
- Effective displaced volume shrinks as the bag soaks, so a dry bag floats for a moment and then sinks.
- Wetness rises while immersed (2.4 s time constant), then drains towards 32% of peak (11 s time constant), emitting drips that ripple the tea or spot the table. Mass is updated via `setAdditionalMass` in small increments.
- Brewing: each cup integrates `immersion × bag potency`; bags slowly lose potency. A bag left in a cup keeps brewing. The colour ramp runs hot water → straw → amber → mahogany → builder's.

## Crashes ([src/sim/sim.js](../src/sim/sim.js))

Severity is the helicopter's velocity change not explained by flight forces (resting support removed), summed over ~12 ms, while it touches something other than a bag. Above 0.95 m/s it explodes; 0.22–0.95 m/s is a survivable bump. Rotor contact above 0.55 m/s, or sustained rotor contact, is a rotor strike. Touching anything while tilted beyond 70° is a rollover. Bags hitting the helicopter never count.

On destruction the body is removed, the bag is released, and eight debris bodies (fuselage, tail boom, tail, both skids, mast, both blades) inherit the helicopter's velocity and spin plus an explosion impulse. Blades keep spinning. Nearby bags get shoved. Effects: flash light, fireball, sparks that bounce, smoke, smoking and glowing wreckage, a scorch decal, camera shake and a layered explosion sound. Debris retires after 13 s, at most 34 pieces (oldest wreck first). Particles come from fixed pools. The state machine prevents a second explosion from the same crash.

## Camera ([src/render/camera.js](../src/render/camera.js))

Horizon-stable chase camera: follows heading only, smoothed at 2.2/s, never roll or pitch. It frames a point 38% of the way from the helicopter to the bag, pulls back while carrying, ray-casts against scenery, and stays above the table. Position smoothing is tight (14/s) to avoid a disconnected feel. After a crash it follows the fuselage wreck. C recenters; the mouse can orbit and zoom.

## Presentation

Procedural textures (oak planks with roughness, linen runner, cork pad, filter paper with visible leaves, printed tag, plaster, tiles, blurred garden), lathe-built ceramics with clearcoat glaze, a RoomEnvironment reflection probe, a soft-shadowed window sun, and a warm pendant. Readability aids: contact-shadow blobs under the helicopter and carried bag, a bright string, a rotor blur disc with tip ring, and tea downwash ripples when hovering over a cup.

Quality tiers (auto: high on desktop, medium on touch devices) scale pixel ratio cap, shadow map size, particle budgets, texture size, steam and glass transmission. Dynamic resolution lowers the pixel ratio (down to 55%) if frames exceed ~19.5 ms on average and raises it again with headroom. Physics never changes with quality.

## Lessons from failed approaches

- **Hook offset behind the centre of mass** (4 mm) produced a constant nose-up torque with a wet bag, enough that the assisted helicopter could not hold forward tilt and stalled in the air. The hook now sits directly below the centre of mass.
- **Contact-force events alone under-reported impacts**: Rapier spreads a landing over two or three steps, so a 1.25 m/s drop read as 0.8 m/s. Severity now uses velocity change against the predicted free-flight velocity, summed over a short window, minus resting support (which otherwise registered as constant small bumps).
- **Assist climb integrator wound up** during long climbs and overshot altitude after release, and starting from a negative value on the pad prevented take-off. It now learns load mainly while holding altitude and resets on the ground.
- **Debris clones copied the whole rotor group** onto the mast piece (a flying rotor disc). The mast clone now excludes it.
- **Scripted pickup/dip flights** need the pilot to place the *bag* over the cup and then descend holding the helicopter still; steering the bag while it's inside the cup drags it against the rim and can pull the helicopter into the teapot. That is realistic, and a good lesson for players too.
- **The in-app browser pane throttles hidden pages** to ~30 fps and stops rAF entirely, so performance and flight tests use local Chrome via `playwright-core` instead.
