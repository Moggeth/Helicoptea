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

## Chinook ([src/sim/chinook.js](../src/sim/chinook.js))

A CH-47-style tandem-rotor heavy lifter at about 1:90: 17 cm fuselage, two 20 cm rotors 13.4 cm apart (they overlap, the aft one sits 1 cm higher), 94 g, inertia 5.5e-4 / 5.0e-4 / 3.0e-4 kg m² (pitch/yaw/roll), thrust/weight 2.0 empty. It shares the sim's aircraft surface (`src/sim/aircraft.js`), so cargo, crashes, camera, HUD, audio and the downwash field work with either aircraft; the micro heli's code is unchanged.

- **Each rotor is its own thrust vector applied at its hub** (`addForceAtPoint`), so every moment comes from geometry rather than from applied control torques.
- **Pitch is differential collective**: forward stick unloads the forward rotor and loads the aft one (up to 4.5% of a rotor's max thrust each way, about 5 mN m).
- **Roll is lateral cyclic**: both discs tilt the same way (up to ~6°); the side force acts above the CG.
- **Yaw is differential lateral cyclic**: the forward disc tilts one way and the aft disc the other (up to ~3°), a couple about the CG. There is no tail rotor.
- **Torque**: each rotor's reaction torque goes as T^1.5 and they turn opposite ways (forward counter-clockwise from above), so it cancels at equal thrust; differential collective leaves a small yaw coupling.
- Per-rotor **ground effect** from seven rays across each disc (a thin peg bar under one side counts for little, a table under the whole disc counts fully), so hovering one rotor over the teapot pitches the aircraft. Axial inflow damping at each hub gives pitch damping; the disc H-force acts at the hub (speed stability). In forward flight the rotor behind loses 3% of its lift in the other's wake. Ground-effect recirculation buffets it like the micro heli.
- **Three hooks** (forward, centre, aft, 3 cm apart under the belly). Space hooks the nearest bag to a free hook; with none in reach it releases them all. Lining up along the tea stand takes all three bags at once. A load off the centre hook needs real differential collective to hold level: a soaked bag on the forward hook uses about two thirds of the pitch authority.
- **Assist** is an AFCS that works only through the same rotor controls, within their physical range: attitude hold, pitch and roll trim integrators (learn off-centre hook loads), yaw-rate hold with heading hold, and the same climb-rate collective as the micro heli. **Assist off** maps the sticks straight to differential collective, lateral cyclic and differential cyclic.
- **Breakup**: 19 pieces (nose with cockpit, cabin, aft cabin with ramp, both pylons with rotor heads, both engines, both sponsons, four gear legs, six blades). Blades keep spinning in their own rotor's direction; sponsons and engines cook off in delayed secondary fireballs; wreckage smoulders rather than glowing.

The model ([src/render/chinookModel.js](../src/render/chinookModel.js)) is lofted from superellipse sections with the ramp upsweep, multi-pane glazing with two crew, a forward pylon fairing, drive-shaft spine, tall aft pylon with twin turboshaft pods, fuel sponsons with nav lights, twin forward and single aft wheels, brass belly hooks and three-blade heads with blur discs that tilt with the cyclic. Matte olive drab with panel lines, rivets, portholes, a ramp outline and stencils. Static meshes merge by material per part.

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

## Rotor downwash ([src/sim/air.js](../src/sim/air.js))

A small fluid simulation, run at 60 Hz inside the fixed-step sim:

- **Wake column**: momentum theory. Induced velocity v_i = sqrt(T / (2 ρ A)) (about 1.7–2 m/s at hover), accelerating towards 2 v_i as the wake contracts. A ray from the hub along the thrust axis finds where it lands.
- **Outwash layer**: a 60 × 40 grid (3.4 cm cells) over the table holds a thin 2D incompressible flow. The impingement footprint is a mass source sized so the flow leaves its edge at the arriving wake speed. A warm-started pressure solve spreads it radially and steers it around the cups, teapot, sugar bowl, vase, jug, books and stand. Semi-Lagrangian advection carries gusts, and the field decays once the helicopter leaves. When the air is still, the solve is skipped.
- `sample(x, y, z)` gives the 3D air velocity (column plus outwash fading over ~3.5 cm of height).

Physical consumers: tea bags (flat-plate drag against moving air, at three points so they flutter and twist), the visible strings, and ground-effect recirculation buffeting on the helicopter when hovering within ~1.6 rotor radii of a surface. Visual consumers: the linen runner and its hanging ends ripple (vertex displacement driven by the air field as a texture), steam, smoke and dust ride the flow, flowers nod, and tea under the rotor gets a pressure dimple, wind chop, ripples and spray.

## Ambient occlusion ([src/render/post.js](../src/render/post.js))

GTAO (Three.js `GTAOPass`) with a 12 cm world radius, tuned for the miniature scale. It runs on the high tier and on desktop medium, and is off on touch devices and the low tier (`?ao=0` / `?ao=1` override). Transparent and effect-only meshes (tea, glass, rotor blur, strings, decals, particles) are excluded from the occlusion pass.

## Helicopter model ([src/render/heliModel.js](../src/render/heliModel.js))

A serious, scale-accurate light utility helicopter (single turbine, two-blade teetering rotor, skid gear), deliberately realistic against the cosy setting. The fuselage is lofted from superellipse sections with a flat floor, true glazing (windscreen, chin windows, door windows), a cabin lining, seats, instrument panel and a pilot. It has an engine fairing with intakes and exhausts, a tapered boom with stripes and registration, a stabiliser with endplates and nav lights, a swept fin and ventral fin with tail skid, and a tail rotor with gearbox. The skids have arched cross tubes and upturned toes, and the rotor head has a swashplate, pitch links and grips. A navy/white/red livery has panel lines, rivets (bump map) and a blinking beacon. Each part's static meshes are merged by material to keep draw calls low. Lower quality tiers use fewer loft segments.

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
- **Loose wreckage counted as a rotor strike.** A fresh helicopter could explode on the pad when debris from the previous crash landed inside the rotor disc. Debris no longer collides with the rotor sensor or counts toward impact severity, and wreckage on the pad is cleared at restart.
- **The air field was too expensive under CPU throttling** at 80 × 53 cells with 24 iterations, sampling strings every step. A coarser grid (60 × 40, 10 warm-started iterations), cheap distance culling, half-rate strings and sleeping strings for settled bags cut sim cost about 40% at 6× throttle.
- **Chinook pitch and roll authority from realistic small disc tilts was too weak** against the H-force acting at the high hubs: at 0.6 m/s sideways, blowback out-muscled 1.6° of lateral cyclic and the roll oscillation diverged. Real lateral cyclic range (~6°) plus stronger hub damping fixed it.
- **A single hub ray for the Chinook's ground effect** treated the stand's 1 cm top bar as a ground plane under the forward rotor, adding ~9% lift there and pushing the aircraft back off the pegs. Seven staggered rays per disc fixed it.
- **The first Chinook hook height** (6 mm under the belly) put the fuselage on the stand's top bar while hooking. The hooks now hang 11 mm below.
- **The in-app browser pane throttles hidden pages** to ~30 fps and stops rAF entirely, so performance and flight tests use local Chrome via `playwright-core` instead.
