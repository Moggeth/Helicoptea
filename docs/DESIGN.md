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

## Milk ([src/sim/milk.js](../src/sim/milk.js))

- **Bucket**: a Bambi-style fabric bucket, an interior frustum 2.1 cm across the base, 2.7 cm across the rim and 2.6 cm deep (11.8 ml), 3.4 g dry with its ballast ring, on 8 suspension lines to a control head and a 13 cm line. It is a `TeaBag` subclass, so it shares the rope joint, proximity hooking, the verlet string and the Chinook's three hooks; `sim.carriedCargo()` and `sim.cargoItems()` include it. It hangs from its own hanger by the crock and comes back there if it falls off the table or on Shift+R.
- **Dipping**: buoyancy and drag act on 12 points of the submerged envelope, and the contents count as bucket mass, so a full bucket under the surface feels light and gets heavy as it comes out. A one-way valve in the base lets milk in while the outside pressure is higher (Torricelli flow, about a second to fill); once the rim is under, it floods over the top (weir flow). Lifting out closes the valve.
- **Mass and slosh**: the rigid share of the contents is added low in the bucket with its own inertia; 45% moves as the first slosh mode of a cylindrical tank (ω² = 1.84 g / R · tanh(1.84 h / R), about 6 Hz) on a stiff axial spring, and its reaction acts on the bucket. The free surface tilts against the felt gravity, so a swinging bucket keeps its milk, and a hard jolt slops it over the low side of the rim.
- **Pouring**: holding pour opens the release valve (only while the bucket is on a hook). Outflow is Torricelli flow from the pressure at the base; it leaves as stream parcels (bounded at 140; at the cap they merge, never vanish) that fall under gravity, follow the rotor wash with a 0.35 s lag, and land in a vessel, on low things (pad, plate, saucers), down the sides of tall things, on the table, or on the floor.
- **Vessels**: the crock and both cups track volume, level, milk fraction and tea strength. Milk that lands mixes in; the level rises (cups overflow onto their saucer or the table), and the teabag code sees the new level. The crock's level falls as you take milk. Milky colour: milk scatters light, so it pales and clouds the tea quickly while the tea's tint fades as it is diluted ([src/render/water.js](../src/render/water.js) `milkyTea`).
- **Puddles**: at most 10, merging with a neighbour on the same surface, radius from a 1.1 mm film (capped at 7 cm), soaking in with a 150 s time constant. `totalMilk()` counts every millilitre, including what dried, so the checks verify conservation.

## Skycrane ([src/sim/skycrane.js](../src/sim/skycrane.js))

An S-64 Air-Crane-style tanker at about 1:110: 110 g dry, a 20 cm six-blade main rotor, a 4.2 cm four-blade tail rotor on the left of the tail pylon, wheeled gear, and a 32 ml belly tank. Original markings ("07", MILK TANKER).

- **One main rotor**: thrust along a disc axis that tilts with the cyclic (up to 0.08 rad, lagged), applied at the hub, plus an articulated-head hub moment. Collective and assist work as on the Chinook (climb-rate collective with a load-learning integrator, attitude hold, pitch/roll trim integrators). The assist only knows the dry weight, so filling the tank makes it sag before it learns.
- **Torque and the tail rotor**: the main rotor's reaction torque goes as T^1.5. The tail rotor is a sideways force at the tail pylon (it also rolls and translates the aircraft). With assist off it is rigged for a dry hover, so pulling collective yaws the nose. With assist on, the yaw hold drives it, and the attitude target leans the disc against its sideways push, so it hovers without crabbing.
- **Hanging fuselage**: the assist lets the fuselage settle so that the disc is level when it is trimmed against an off-centre load (the hose, the tank). Holding the fuselage level instead made the disc thrust sideways, and the aircraft drifted at about 0.4 m/s.
- **Snorkel hose**: nine rigid ball segments joined by rope links (slack, never stretched), the last one a weighted intake that sinks. It collides with the world and cargo but not the airframe, and feels air drag against the rotor wash, plus liquid drag and buoyancy. The reel re-rigs the link lengths (1.4 to 17 cm). A slack hose snapping taut emits a `snatch`, and a hose dragged over a surface emits `scrape`, which feed the shared feedback (sound, dust, rumble).
- **Pump**: spools up over 0.3 s, and moves liquid (22 ml/s) only while the intake is at least 1.5 mm under a vessel's surface. It takes milk, tea or milky tea from that vessel, so the crock's level drops.
- **Tank**: the rigid share of the contents is added low in the tank (mass, centre of mass and inertia of the whole aircraft are recomputed as it fills). Half the contents slosh as the first modes of a rectangular tank (one per horizontal axis). The belly doors are an analog opening (Torricelli flow from the pressure at the floor, 1.7 cm² fully open). The milk leaves as a three-lane curtain of stream parcels that inherits the aircraft's velocity and follows the rotor wash, then lands through the milk system.
- **Combos**: a salvo latches the doors fully open until the tank is empty (on the micro heli and Chinook it latches the bucket's valve). Auto-fill reels the hose down until the intake is in, pumps until the tank is full (or the source runs dry), then reels it up. Any manual hose or pump input cancels it.
- **Crashes**: 16 named parts (cockpit, spine, engines, tail boom, tail pylon, tank, four gear legs, six blades). The engines cook off, and a crash bursts the tank, throwing the milk everywhere. Milk accounting includes what is aboard.

## Crashes and damage ([src/sim/sim.js](../src/sim/sim.js), [src/sim/damage.js](../src/sim/damage.js), [src/render/crashFx.js](../src/render/crashFx.js))

Severity is the helicopter's velocity change not explained by flight forces (resting support removed), summed over ~12 ms, while it touches something other than a bag. A big unexplained change while touching scenery counts too, because a hit resolved by continuous collision detection reports no contact force. Above the aircraft's limit (0.95 m/s on the micro) it crashes; 0.22 m/s up to that is a survivable bump. Bags hitting the helicopter never count.

**Damage before the crash** (`damage.js`, with **Pause → Rotor strikes break the blades**, on by default; off, blades pass through scenery with a light brush). Rotor contact wears the blades (the old rotor-contact budget, now a 0–1 wear per rotor): a worn rotor loses up to 35% of its lift and shakes the airframe once per revolution. A strike faster than 0.55 m/s, or fully worn blades, sheds the rotor: its blades become debris flung on the tangent at blade speed, the stopped rotor's angular momentum whips the airframe round, and the blades bite it back off the obstacle. With every main rotor gone the aircraft is a hulk (no flight model, only gravity and drag) until it hits something or 1.2 s pass. The Chinook can lose one rotor and fly on the other, pitching over, for up to 2.6 s. Blade tips in the tea wear the blades fast. The tail rotor (a sensor on the micro heli and the skycrane; the Chinook has none) goes on any contact: every yaw moment the flight model makes is removed and the main rotor's unbalanced reaction drives the airframe round against aerodynamic damping. The reaction follows rotor power (thrust times inflow), so lowering the collective and sinking slows the spin and climbing speeds it up; the pedals do nothing.

**Crash kinds**, each with its own effect, sound and crash-screen line: *impact* (fireball, shock ring across the surface, chips of what was hit), *shatter* (rotor strike: spark ring in the disc plane, blade shards on the tangent, then the falling hulk bursts), *spin* (tail strike: tail smoke while it turns, a corkscrew of smoke and dust on landing), *thrash* (rollover: an arc of chips and sparks where the blades chewed in, and a gouge), *fall* (a hard hit below table height after a long drop: a flat bloom of dust and a big shock ring), and *dunk* (the cabin under the tea, or any crash with it down inside a cup: no fire, a geyser of tea, steam, a hiss, and the wreck stays in the cup). Struck materials throw their own shrapnel (splinters, china, glass, leaves, brick grit, fur). A crash plays in a moment of slow motion (the world clock drops to 0.28× for 0.3 s and eases back over 0.8 s; strikes get a shorter beat), which the flight recording keeps.

On destruction the body is removed, the bag is released, and every part not already thrown off becomes a debris body that inherits the helicopter's velocity and spin plus an explosion impulse (much less for a dunk). Debris retires after 13 s, at most 34 pieces (oldest wreck first). Shards are one instanced mesh; everything else comes from the fixed particle pools. The state machine prevents a second explosion from the same crash.

**Trying them**: `?stage=rotor`, `wear`, `tail`, `dunk`, `rollover`, `impact` or `fall` in the URL stages that crash a moment after each start and restart (`src/sim/crashStage.js`; also `__helicoptea.stageCrash('tail')` in the console). The flight log records `wear`, `shed` and `spin` channels and the `rotorShatter`, `tailStrike` and `teaStrike` events, so a replay hides a lost rotor and plays every effect again. Checks: `tests/crash-checks.mjs` (part of `npm run check`) and `tests/e2e-crashes.mjs`.

## Rotor downwash ([src/sim/air.js](../src/sim/air.js))

A small fluid simulation, run at 60 Hz inside the fixed-step sim:

- **Wake column**: momentum theory. Induced velocity v_i = sqrt(T / (2 ρ A)) (about 1.7–2 m/s at hover), accelerating towards 2 v_i as the wake contracts. A ray from the hub along the thrust axis finds where it lands.
- **Outwash layer**: a 60 × 40 grid (3.4 cm cells) over the table holds a thin 2D incompressible flow. The impingement footprint is a mass source sized so the flow leaves its edge at the arriving wake speed. A warm-started pressure solve spreads it radially and steers it around the cups, teapot, sugar bowl, vase, jug, books and stand. Semi-Lagrangian advection carries gusts, and the field decays once the helicopter leaves. When the air is still, the solve is skipped.
- `sample(x, y, z)` gives the 3D air velocity (column plus outwash fading over ~3.5 cm of height).

Physical consumers: tea bags (flat-plate drag against moving air, at three points so they flutter and twist), the visible strings, and ground-effect recirculation buffeting on the helicopter when hovering within ~1.6 rotor radii of a surface. Visual consumers: the linen runner and its hanging ends ripple (vertex displacement driven by the air field as a texture), steam, smoke and dust ride the flow, flowers nod, and liquids under the rotor react (below).

## Rotor wash on liquids ([src/render/rotorwash.js](../src/render/rotorwash.js), [src/render/rippleField.js](../src/render/rippleField.js), [src/render/water.js](../src/render/water.js))

What real water does under a hovering rotor, roughly in the order you notice it: (1) a **radial spray** sheet torn off where the outwash shears the surface, thrown low and outward; (2) a **billowing mist** of the finest drops that rides the outwash, climbs at its edge and gets drawn back round the rotor; (3) a **taut, pounding ripple** under the disc: the wake's stagnation pressure (q = ½ρv², about half a millimetre of depression at 3 m/s) presses a dimple, and each blade's wake and tip vortex slaps it as it passes, so it pulses at blade-passage rate and throws off tight rings; (4) a **dark, wind-roughened annulus** with cat's-paw streaks racing outward and a glassier eye under the hub: the chop scatters the sky's reflection, which reads as darker water full of glitter.

How it is drawn, all presentation (the sim never reads it):

- The air field's wake ray passes through liquid (tea has no collider), so `LiquidWash.couple()` intersects each wake with each liquid's plane instead, and uses the same wake model as the air field for the arriving speed and footprint. That coupling also fixes an old gap: the wake ray used to land on the cup floor, so the tea dimple and spray almost never fired.
- Each liquid surface (every cup, the milk crock, the garden bird bath) owns a small CPU height field (40 × 40 on high, 32 × 32 on phones; 48 / 36 on the bath): a damped wave equation with a weak spring and volume conservation, reflecting walls, stepped at 240 Hz only while forced or still ringing, then switched off. Forcing is the stagnation dimple (drawn about ×2.5), a blade-passage pulse with rotating lobes, and random turbulent punches weighted to where the outwash shears the surface (so a wake landing beside a cup still works its near side). It uploads as a byte texture (slope, height, energy).
- The surface is a polar mesh displaced by that height; its shader adds the dunk ripples, the roughened streaky annulus, sun glitter, reflections of the vessel's own inner wall and rim (a ray against the cylinder) and of the room (the PMREM probe), the rim's crescent shadow, and a longer light path at grazing angles so the tea hides the cup floor sooner.
- Spray and mist come from one extra particle pool (one draw call). Inside a vessel the air is replaced by a cavity recirculation that lifts drops and mist out along the walls; drops landing back in the liquid ring it, the rest are soaked up by whatever they land on.

## House and tea garden ([src/sim/house.js](../src/sim/house.js), [src/render/garden.js](../src/render/garden.js))

The kitchen is now one room of a house. Its back wall (brick outside, plaster inside) has an open back door (0.8 x 2 m, the door swung flat against the wall inside) and an open casement window whose mullion and transom split it into four panes; the lower casements stand open square to the wall and the fanlights tilt out, so both are flyable but tight. Outside is a walled tea garden at floor level (7.2 x 4.8 m): a flagstone patio, a garden table with its own tea stand (three more pegs), a rose arch to fly through, a bird bath, a tree stump, a bench, an apple tree, a hedge and long meadow grass towards the back. The fences carry tall invisible walls so nothing leaves the garden; there is no lid on the sky.

- **Cups**: five more, appended after the mug and teacup (tests index those two): a windowsill teacup, a counter mug by the kettle, a garden teacup on the garden table, a mug on the stump and one on the bench. `standY` is the surface a cup stands on (saucers sit there).
- **Bags**: `STATIONS` lists both stands; pegs are kitchen first (pegs[1] is still the kitchen's middle peg). Restart guarantees bags on the kitchen stand; reset refills both. `maxBags` is 11. Bags dropped on the floor or lawn are still tidied away after a few seconds.
- **Colliders** are primitives (`buildHouseColliders`), including the open sashes and the door leaf. The kitchen counter, upper cabinets, kettle and chairs are solid now too.
- **Camera**: never below the floor; after smoothing it re-checks the line to the focus so it can't cut through a window bar or door frame.
- **Shadows**: the sun's shadow map stays framed on the kitchen table as before and slides to follow the helicopter once it leaves the table.

**Grass** ([src/render/grass.js](../src/render/grass.js)) is instanced blades on a world-locked jittered grid, so blades never swim: a dense layer follows the camera and a sparse layer of wider clumps covers the whole garden, cross-faded. A mask painted from the layout says where grass grows, how long it is (mown lawn to meadow) and where the border flowers are. Each blade bends along an arc of constant length; bend is `atan(k v^2)` (drag, saturating when pressed flat) plus a static lean and flutter. Wind is an ambient breeze with travelling gusts plus the rotor's outwash: wherever a wake from the air field lands on the lawn, a radial wall jet with a pressed-flat core, a churning swirl near the core and rings of gusts running outward. The grass lags the wake slightly and springs back slower than it flattens. Leaves on the tree, hedge, roses and herbs sway in the same breeze and shake under a rotor.

| Tier | Dense layer | Garden layer | Decor |
|---|---|---|---|
| high | 340 x 340 blades, 5.8 mm apart | 3 cm clumps | all shadows, every leaf card |
| medium (touch default) | 170 x 170, 8.5 mm | 5 cm | decor casts no shadows, ~55% leaves |
| low | 104 x 104, 12 mm | 6.5 cm | ~30% leaves, no distant trees |

Grass is excluded from AO and casts no shadows; it receives them only on high. Garden decor is merged by material (one draw call each).

## Props, characters and easter eggs ([src/sim/props.js](../src/sim/props.js), [src/render/charm.js](../src/render/charm.js))

Everything you can see in the house and garden is solid now, down to the curtains, picture frames, clock, fridge, radio, the sill plant's leaves, the herbs in the pots and the roses on the arch (the arch posts are fattened to take them in). The roof, gables, soffits and a chimney stack are solid too, and the play space is boxed by invisible walls behind the fences, in front of the house and a lid 8 m up.

**Loose props** sit in the debris collision group: the helicopter, bags and wreckage push them about, but touching one never counts as a crash or a rotor strike. Napkins on both tables catch the air as flat plates (pressure on the face, skin friction, and a capped lift while they lie on something) and get blown off by a take-off right next to them. Sugar cubes, the teaspoon, the top two biscuits and a watering can just get knocked about. Forces are cleared every step (Rapier keeps user forces until reset) and capped at a few times the prop's weight. Props sleep when still. On touch devices and the low tier (`quality.liteProps`) only the napkins and spoon are loose.

**Swinging things**: the pendant lamp is a rigid pendulum on a ball joint under the ceiling (0.35 kg shade, solid enough that a rotor strike on it is a crash) and the toy-plane mobile is a light one (a bump only). Both feel the air around them, including the inflow drawn down through a rotor hovering beneath them; the rotor's swirl sets the mobile turning.

**Easter eggs**
- **Radio** on the counter: land on it to switch on a little procedural waltz through an old-radio filter; land again to switch it off. Debounced, so you have to settle on it and lift off properly.
- **The cat** on the garden bench watches whatever dangles and swipes at tea bags in reach with a kinematic paw that only touches bags, guarding the bench mug.
- **Chimney mug**: a ninth cup on the chimney stack, 3.4 m up. **The gnome** by the left border holds the eighth, his own teacup.
- **Apples** drop when you hover in the apple tree's canopy (a few at a time; they rot away after 30 s).
- **A robin** on the bird bath flies off to the hedge when you come close, and comes back.
- **The fridge notes** flutter in rotor wash; **the clock** keeps real time; the curtains stir.

## Ambient occlusion ([src/render/post.js](../src/render/post.js))

GTAO (Three.js `GTAOPass`) with a 12 cm world radius, tuned for the miniature scale. It runs on the high tier and on desktop medium, and is off on touch devices and the low tier (`?ao=0` / `?ao=1` override). Transparent and effect-only meshes (tea, glass, rotor blur, strings, decals, particles) are excluded from the occlusion pass.

## Helicopter model ([src/render/heliModel.js](../src/render/heliModel.js))

A serious, scale-accurate light utility helicopter (single turbine, two-blade teetering rotor, skid gear), deliberately realistic against the cosy setting. The fuselage is lofted from superellipse sections with a flat floor, true glazing (windscreen, chin windows, door windows), a cabin lining, seats, instrument panel and a pilot. It has an engine fairing with intakes and exhausts, a tapered boom with stripes and registration, a stabiliser with endplates and nav lights, a swept fin and ventral fin with tail skid, and a tail rotor with gearbox. The skids have arched cross tubes and upturned toes, and the rotor head has a swashplate, pitch links and grips. A navy/white/red livery has panel lines, rivets (bump map) and a blinking beacon. Each part's static meshes are merged by material to keep draw calls low. Lower quality tiers use fewer loft segments.

## Aircraft life ([src/render/aircraftFx.js](../src/render/aircraftFx.js))

A presentation layer over all three models, applied after the view places them each frame (it never touches the sim). Each aircraft's lights, exhausts, intakes, gear and fittings are listed in `FX_SPECS`.

- **Blades** cone up with each rotor's own thrust and droop when unloaded or slow. The coning is a lightly damped spring, so blades sail up as load comes on and ring after a hard touchdown (bump events kick them). Discs blow back away from the relative wind and lag the fuselage's pitch and roll rates. The micro's teetering disc also follows the cyclic. Rotor groups use Euler order ZXY so the spin stays innermost under any tilt (the skycrane's previous order wobbled its disc).
- **Motion-blur discs** replace the ghost-blade copies: a sweep trails each blade in its direction of rotation, longer at the tips, with a soft tip-path ring. The disc cones with the blades. Colours run through tone mapping so the disc looks the same with and without the AO composer.
- **Lights**: steady red/green/white nav lights, white anti-collision strobes (double flash), red rotating beacons (top and belly), and a landing light with a faint beam and a pool of light where the beam lands, brighter in the low hover. The glows are camera-facing transparent quads, not `THREE.Sprite`: the GTAO normal pass draws sprites and leaves dark wedges around them.
- **Small moving parts**: compressor faces spin in the Chinook and skycrane intakes, and oleo struts compress under weight on wheels.
- **Airframe buzz**: a fine vibration of the model (cameras follow the physics pose, not the model) that scales with rotor speed and load, plus the transverse-flow shudder around 0.3 m/s.
- **Grime**: the airframe paint materials are patched to darken in body coordinates, with soot fanning back from each exhaust, a dirtier belly and faint streaks running aft.
- **Fittings**: wire-strike cutters and antennas on the micro, mirrors, blade antennas and formation (slime) lights on the Chinook, mirrors and antennas on the skycrane.
- All fx blend colour without touching the framebuffer's alpha, so they can't let the page background through.
- Cost, measured headless on the dev machine with each aircraft hovering: about +0.1 ms CPU per frame and +2 to 8 draw calls on every quality tier. Render submission time was within timer noise. `?fx=0` turns the layer off for comparisons.
- Exhaust heat shimmer was tried twice. A transmission plume forced an extra full-scene render (+200 draw calls), and a shader haze column showed as dark dashes through the AO pass. Both were cut.

## Cockpit view ([src/render/cockpit.js](../src/render/cockpit.js), [src/render/cockpitCam.js](../src/render/cockpitCam.js))

- **Two layers.** The world renders as usual (with AO), then the depth buffer is cleared and the cockpit interior renders from its own scene and camera, in the aircraft's body coordinates at model scale. The cockpit camera has a 0.4 mm near plane and a 40 cm far plane; the world camera keeps a 5 mm near plane, so the house and garden keep their depth precision. Nothing inside the cabin can clip, and the world can only clip in the last few millimetres before the airframe touches it: the rotor keeps walls 10 cm away, so only things under the disc (a mug, the sill's edge) get that close, and those were checked from 4 mm.
- **Exterior model in first person.** The cabin and boom (and the Chinook's forward pylon) swap to a colour-less, depth-less material that still casts shadows, so you see your own shadow on the table and the rotors, skids and gear still draw. The real materials come back before a crash clones the debris.
- **Interiors.** Window openings come from the same lofted shells as the outside (`cabinShellGeometry`, `noseShellGeometry`), drawn inside-out with a fabric lining, rubber seals and frame tubes. The micro heli is a Bell 206-style cabin (glare-shield hood, compass, six-pack and engine gauges, empty left seat with its harness, kneeboard on your thigh). The Chinook is CH-47F-style: five displays at real size, standby instruments, consoles, armoured seats and a copilot. The skycrane is its glass bubble (the outside's ellipsoid split, ribs and sill) with analogue instruments and a copilot; looking back through the bubble shows the spine and engines. Your legs, arms, gloves and boots are posed on the controls; cyclic, collective and pedals follow the stick inputs and the actual collective setting, and the Chinook's dual controls move together. Static meshes merge by material (the cockpit pass adds about 100 draw calls, including its shadow map and the hook camera). The interior has its own sun (same direction as the kitchen's, rotated into body axes) with a small shadow map, so sunlight falls through the windows onto the panel and your knees.
- **Instruments** ([src/render/instruments.js](../src/render/instruments.js)) draw into a canvas texture at 9 to 24 Hz by quality. Readings are Froude-scaled to full size (length × L, speed × √L, mass × L³ with L = 32 for the micro heli and 90 for the Chinook).
- **Head.** The eye turns about a neck pivot and leans toward where you look (down and out through the chin windows), inside a box that keeps it in the cabin. The head is a damped spring (ω 11 rad/s, ζ 0.5) pushed against the felt specific force, about 0.5 mm per g (1.5 cm full size), and trails rotation by about 30 ms with a slight counter-roll to the horizon. Vibration is a blade-passage buzz that grows with collective and through translational lift. Touchdowns, load snatches and bumps jolt the head; scrapes rattle it. Head motion and vibration are sliders (default 0.5); at 0 the view is rigidly attached.
- **Hook camera.** A gimballed camera at the cargo hook looks straight down with the nose at the top, rendered into a 224–384 px target every 1–3 frames by quality, re-using the frame's shadow maps. It feeds the inset and the panel display. On the skycrane it hangs under the front of the tank, between the snorkel and the belly doors, and the readout gives the tank level and where the intake is. The readout gives the lowest load's height above the tea, table or floor, its immersion, or the bucket's fill.
- **Crash and restart.** A crash from the cockpit holds the seat for 0.4 s with shake and a flash, then the chase camera (parked at the pilot's eye all along) pulls out to the wreck. Restart resets the head and looks ahead.

## Depth cues ([src/render/depthCues.js](../src/render/depthCues.js))

The core skill is judging how high a dangling load is over a cup rim. Each cue is presentation only and has its own pause-menu switch (stored as `helicoptea.cue.*`).

- **Load shadows** (on): one round shadow per hanging load (up to four: the Chinook's three hooks, the bucket, the skycrane's intake), placed straight below it on the first thing a vertical line meets. Liquid counts: over a cup's opening the shadow lies on the tea (drawn after the tea surface) and is clipped to the inside of the cup, so it never spills over the rim. It reads as the soft skylight shadow from the window rather than the sun's: the penumbra grows with height (2.1 load half-widths plus a third of the height) and the hard core shrinks to nothing by about 15 cm, while opacity rises from about 0.12 far off to 0.72 at contact and fades out between 65 cm and a metre. The airframe's shadow gets the same treatment (darker close in, still faint at a metre). With the switch off the older blobs come back.
- **Linear blending**: behind the AO composer the scene blends in linear light, so a 50% black only looks about 25% dark after the sRGB output. The shadows convert their alpha (`1 - (1 - a)^2.2`) when the composer is on, so they look the same on every tier. The older blobs were nearly invisible on desktop for this reason.
- **Rim glint** (on): while a load that fits is over a vessel's opening (centre within the inner radius less 55% of its half-width, up to 25 cm above the rim), a thin warm ring on the rim fades in, fading out over about 80 ms.
- **Dipping camera** (on): see Camera below.
- **Plumb line** (off): a faint line from the lowest load's bottom (or the hook with nothing on it) to a small red dot on the surface below, with the height in centimetres beside the dot.
- **Cost**: four quads, a line, a dot and a ring, one ray cast per load and one for the plumb line per frame. Same on every tier.
- **Not done**: a stereoscopic mode. Anaglyph or side-by-side would render the world, AO and cockpit passes twice, which is not cheap on the mobile tier.

## Camera ([src/render/camera.js](../src/render/camera.js))

Horizon-stable chase camera: follows heading only, smoothed at 2.2/s, never roll or pitch. It frames a point 38% of the way from the helicopter to the bag, pulls back while carrying, ray-casts against scenery, and stays above the table. Position smoothing is tight (14/s) to avoid a disconnected feel. After a crash it follows the fuselage wreck. C recenters; the mouse can orbit and zoom.

The default 30° elevation was reviewed for dipping. Going lower (21°) shows vertical gaps closer to full height, but the near rim then hides the middle of the tea: at 21° only the far third of a mug's tea is visible, at 30° about half. So with a load low over a vessel (the **Dipping camera** option) it eases to 34°, frames 62% of the way to the load and closes in to 78% of the carrying distance; the skycrane's intake counts as its load once the hose is out.

## Flight tuning board ([src/tuning/](../src/tuning/))

`knobs.js` is the registry: each knob names its group, range, slider shape (log for multipliers, linear for
effects that can go to zero and for absolute values), the config paths it scales on each aircraft, a hint and
its preview clip. `tuning.js` captures the base values from `config.js` once, then writes
`base × global × per-aircraft` back into `CFG` whenever anything changes; the sims already read `CFG` every
step, so a change is live with no restart (rotational weight sets the bodies' inertia, so it waits for the
next restart). *Ground cushion* scales only the part of the ground-effect factor above 1, so zero means no
cushion rather than no lift. World speed is the pause menu's World weight setting, shared rather than
duplicated. The thrust and cyclic response lags are deliberately not exposed: instant thrust is part of the
game's feel. Stick mapping (deadzone, expo, rates) shapes cyclic and pedals after the controller's own bindings,
dead zone and curve have resolved, and never touches the collective, which is a rate. State lives in
`localStorage` (`helicoptea.tuning.v1`); export/import use the same JSON and clamp anything out of range.

The mouse-over clips are live, not pre-rendered: `preview.js` runs two lightweight `Sim`s (`bare`: an open
table and the pad, nothing to hit) on a small separate renderer, split-screen. Before each frame one side's
value is written into `CFG`, that side steps, then the real values are restored, so the live game never sees
a preview value. Each clip settles into a trimmed hover off-screen, then flies a scripted stick sequence
through the same pilot loops a person would use (an attitude loop for flicks and dashes, an altitude hold that
respects the collective's limited rate), from the same pose, with the same camera. A red trail and dots every
half second show the path and the speed. Extreme settings would fly some scripts into the ceiling, the far
wall or the table, so the scripted pilot takes over in time to level off or brake; a browser test flies every
clip at both ends of every range on every aircraft and requires all of them to finish flying. The skycrane is
hard to hold steady with the assist off, so its clips fly with Flight Assist on (the board says so). Stick
knobs show an animated response curve instead of a flight. Live clips cost about 1-2 ms of simulation per
frame while the board is open and nothing when it is closed (the preview renderer is disposed).

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
- **"Heavy" isn't the same as "laggy".** The first heavy retune slowed thrust (0.22 s lag), smoothed attitude commands and used strong drag. It felt sluggish, and strong rotor-plane and axial drag snapped velocity onto the thrust line, so you couldn't drift sideways like a rocket. The current tuning applies thrust almost at once (F = ma) and puts the heaviness in inertia, a slower world clock (0.7×) and low drag, so momentum carries and you manage acceleration. Assist-off collective trims more finely (0.25/s) because little drag now hides mistakes.
- **Chinook pitch oscillation.** It was a slow pitch/speed limit cycle, mostly Assist off. Forward speed cost the aft rotor lift in the front rotor's wake (nose up), slowing it down, then reversing, with too little pitch damping to stop the cycle. Rotor H-force applied up at the hubs added a speed-to-pitch lever too. Fix: smaller aft-wake loss, double the pitch damping, and the H-force applied level with the CG. A 15° forward pulse now settles in about 2 s instead of oscillating ±20°.
- **String gap at the bag.** The strings simulate at half the physics rate for performance, so their interpolated ends could trail the bag by a few millimetres. Both ends are now pinned to the drawn bag and hook every frame (and a knot marks the tie point). The physical rope joint showed no measurable stretch under hard swings.
- **The in-app browser pane throttles hidden pages** to ~30 fps and stops rAF entirely, so performance and flight tests use local Chrome via `playwright-core` instead.
