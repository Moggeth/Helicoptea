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

**Principle: nothing invisible.** Every force the player feels is one they can read without helicopter
training: thrust where the rotor points, gravity, momentum, drag, the rope. Real rotor aerodynamics
(ground effect, translational lift, weathervaning, rotor torque reaction and yaw coupling, rotor-speed droop,
ground-effect buffeting, the Chinook's aft-rotor wake loss) were in the model until 2026-10-14 and were
removed, code and all, because they made the aircraft do things for reasons you can't see, and they cost
per-step work (the Chinook alone cast 15 rays a step for ground effect; now 3). The rotor wash still blows
the bags, tea, cloth and props, but never pushes the aircraft.

- Thrust acts along the rotor axis, so tilting redirects it and costs altitude. Thrust is exactly what the collective asks for, anywhere (a 30 ms lag; F = ma from the moment you push).
- Rotor speed spins up once and stays at full. Thrust and control authority scale with rotor speed squared (it only matters while spinning up and in crashes).
- Drag: rotor-plane drag, axial drag, quadratic body drag. Rotor aerodynamic damping on all three axes.
- Yaw only moves when you press the pedals.
- The cargo hook sits directly below the centre of mass, so the string's pull produces real pendulum torques and drags the helicopter around when the bag swings.

**Assist off**: cyclic and yaw are torques. The lift stick is a sprung collective lever (sim/collective.js): centre is 0.95 of the all-up weight (a gentle settle), full up 1.35 (capped at full collective), full down 0.6, and landed at centre it idles. The old trim-and-hold collective is the *Stays put* option. Releasing cyclic leaves the helicopter tilted (only aerodynamic damping slows rotation). Thrust-to-weight is 2.0 / 1.8 / 1.9 (micro / Chinook / skycrane): every load still lifts with 20% or more to spare, without leaping into the sky.

**Assist on**: stabilising torques only. Neutral cyclic commands level; deflection commands up to ~22° of tilt in the heading frame; a small counter-tilt against drift applies only near neutral stick. Yaw becomes a rate command. Collective becomes a climb-rate command whose integrator learns the extra load slowly, so picking up a wet bag still makes the helicopter sag first. Torque is capped at 1.6× the manual cyclic authority. Nothing teleports or bypasses the cargo forces.

## Chinook ([src/sim/chinook.js](../src/sim/chinook.js))

A CH-47-style tandem-rotor heavy lifter at about 1:90: 17 cm fuselage, two 20 cm rotors 13.4 cm apart (they overlap, the aft one sits 1 cm higher), 94 g, inertia 5.5e-4 / 5.0e-4 / 3.0e-4 kg m² (pitch/yaw/roll), thrust/weight 2.0 empty. It shares the sim's aircraft surface (`src/sim/aircraft.js`), so cargo, crashes, camera, HUD, audio and the downwash field work with either aircraft; the micro heli's code is unchanged.

- **Each rotor is its own thrust vector applied at its hub** (`addForceAtPoint`), so every moment comes from geometry rather than from applied control torques.
- **Pitch is differential collective**: forward stick unloads the forward rotor and loads the aft one (up to 4.5% of a rotor's max thrust each way, about 5 mN m).
- **Roll is lateral cyclic**: both discs tilt the same way (up to ~6°); the side force acts above the CG.
- **Yaw is differential lateral cyclic**: the forward disc tilts one way and the aft disc the other (up to ~3°), a couple about the CG. There is no tail rotor.
- No rotor torque, ground effect or wake effects (see *nothing invisible* above). Axial damping at each hub gives pitch damping; the disc drag acts level with the CG.
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
- The drawn string is a verlet line solved with Gauss-Seidel sweeps in alternating directions, so a pull at either end reaches the other within one iteration; a string pulled to its full length is drawn as a straight line. It is pinned to the knot on the bag and to the hook, keeps out of its own bag as well as cups and props, and sags only when the rope is actually slack. (One-way sweeps used to leave it 15-40% longer than the rope, folded down over the bag's face.)
- String twist: the rope joint has no torsion, so a twist spring-damper about the string (2.4 s period, damping ratio 0.18, scaled with the wet bag's inertia, only while the string carries the bag) makes a spun bag wind its string up, turn back and settle instead of spinning on.
- The stand's pegs don't collide with bags: a bag lifted straight up passes its thin peg instead of wedging under it (which could drag a Chinook over).
- Look ([src/render/models.js](../src/render/models.js), [src/render/bagLook.js](../src/render/bagLook.js)): a soft pillow of leaves slumped to the bottom, serrated heat-sealed bands, leaf flakes behind the filter paper. The paper soaks dark and glossy exactly as far up as it went into the tea, then wicks slowly higher; the string that went under the tea stays stained. The tag hangs beside the string from its loop (printed both sides) and swings as a short damped pendulum when the aircraft jinks.

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
- **Tail rotor**: pure yaw. There is no main-rotor torque to fight, so it idles in a hover and the pedals only turn the nose (it no longer pushes the aircraft sideways).
- **Hanging fuselage and hover hold**: the assist lets the fuselage settle so that the disc is level against the learned trim for an off-centre load (the hose, the tank). Holding the fuselage level instead made the disc thrust sideways (drift of about 0.4 m/s). Following the instantaneous disc tilt instead of the learned trim chased the assist's own corrections, and a hands-off hover crept at ~0.1 m/s for seconds. With the sticks centred, a hover hold adds damping and an integral on the drift (it lets go the moment the pilot moves the cyclic), so a hands-off hover stays within a couple of centimetres.
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

Physical consumers: tea bags (flat-plate drag against moving air, at three points so they flutter and twist), the visible strings and the skycrane's hose. It never pushes the aircraft itself. Visual consumers: the linen runner and its hanging ends ripple (vertex displacement driven by the air field as a texture), steam, smoke and dust ride the flow, flowers nod, and liquids under the rotor react (below).

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

## Set pieces ([src/sim/extras.js](../src/sim/extras.js), [src/render/extras.js](../src/render/extras.js))

Each extra set piece is one module pair: `src/sim/extras/<name>.js` (`create(sim, lite)` returning any of `recorded`, `applyForces`, `afterStep`, `reset`) and `src/render/extras/<name>.js` (`build(ctx)` returning `update`). Recorded bodies replay as `prop:<id>` through a proxy the render module registers (`ctx.replayProxy`, with `onPosed` for instanced meshes). Colliders can carry `onImpact(impulse, other)`; sounds go out as `sim.emit('extra', { kind, pos })` and play through `registerExtraSound` in [src/audio/extras.js](../src/audio/extras.js). Render-only pieces read the air with `ctx.airAt` and early-out when no rotor wake is near, so a calm garden costs a few microseconds.

- **Domino run** (kitchen floor): a 1.25x double-six set, 25 tiles in an S-curve ending in a little gate, 28 dynamic bodies (14 lite) that start asleep, drawn as one instanced mesh with the pips in the shader. A skid, a bag or low hover wash beside the first tile topples the lot (the floor jet is boosted 4x, it is too thin to tip a tile otherwise).
- **Copper pan rack** (ceiling, in front of the range): six pans and a ladle (four lite) on ball joints from S-hooks, world group (a rotor strike counts), swinging in wash, clanging by size. One skinned mesh.
- **Hanging baskets** (garden wall either side of the back door): pendulums on chains from wrought-iron brackets, world group, 0.3 kg and boosted wash so a 24 g helicopter can visibly swing them; trailing stems lag and flutter.
- **Wind chime** (apple tree limb): six tubes tuned to D major pentatonic, striker and sail as damped pendulums driven by breeze, wash, inflow and eddies; inharmonic partials, capped strike rate. Render-only, no shadow (the shadow cache cannot see bones move).
- **Paper boat** (bird bath): render-only, pushed by the outwash, bobbing, bouncing off the rim.
- **Garden windmills** (patio pots and lawn): weather-vane heads, wheels with angular momentum, a blur disc above 14 rad/s, quiet whirr.
- **Dandelion clocks** (meadow): 13 heads, every seed one instance; wash past each seed's threshold releases it to drift on the air; heads regrow after 40 s.
- **Leaf pile** (under the apple tree): 250 leaves (120 lite) woken by a ground wake, tumbling and settling where they land; leaves sleep after 0.4 s of calm.
- **Potting bench** (left fence by the patio): fixed colliders to land on, two loose pots (one lite) that wash can tip off (drag boosted 28x, capped at 1.5x their weight).
- **Kitchen cabinetry and the fig**: Shaker doors, drawers and brass on the counter and wall cabinets; a fiddle-leaf fig whose leaves sway in the wash and return exactly to rest, so the shadow cache keeps them still. Its colliders live in the potting bench's sim module.

**Area modules** (`src/sim/extras/zones/*.js`, `src/render/extras/zones/*.js`) add about fifty more pieces in eight areas: the counter, the kitchen walls and floor, the sill/dresser/shelves, the patio, the left and right borders, the meadow and the fences. Static parts go into one shared Batcher (`ctx.batch`), split into an inside and an outside merge so the frustum culls the other half, with every piece casting (the shadow cache draws still casters once) and one group per material; materials come from a shared white-based kit (`ctx.kit`, [src/render/extras/kit.js](../src/render/extras/kit.js)) tinted per piece, and foliage uses `ctx.sway` (GPU bending in breeze, outwash and downwash). Merged foliage is kept out of the AO pass.

**Cost and phones**: measured at 1080p high on an RTX 3080 Ti, the kitchen chase view went from about 250 to 175 fps (1% low about 123) and the garden view from about 260 to 245 fps. On phones and the low tier (`LITE_SKIP` in [src/sim/extras.js](../src/sim/extras.js)) the borders, meadow, fences, the kitchen walls and shelves, the dandelions and the leaf pile are left out, which keeps an emulated, 4x CPU-throttled phone at master's frame rate (within run-to-run noise). `?noextras=all` or `?noextras=a,b` hides pieces for measuring.

Shift+R resets every piece (the leaves and dandelions hook `sim.extras.reset`). `node tests/shot-world.mjs [url] [--view=name:x,y,z,lx,ly,lz]` photographs the house and garden from fixed viewpoints through `window.__helicoptea.freeCam`.

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
- **Interiors.** Window openings come from the same lofted shells as the outside (`cabinShellGeometry`, `noseShellGeometry`), drawn inside-out with a fabric lining, rubber seals and frame tubes. The micro heli is a Bell 206-style cabin (glare-shield hood, a standby compass whose card turns, six-pack, hover display and hook camera, caution lights, empty left seat with its harness, kneeboard on your thigh). The Chinook is CH-47F-style: a low, wide panel with five displays at real size (two PFDs, two hover pages, the hook camera over the cargo-hook page), standby instruments, caution lights at each end, consoles, armoured seats and a copilot. The skycrane is its glass bubble (the outside's ellipsoid split, ribs and sill) with a smaller analogue panel offset toward the pilot, its tank page and belly camera, and a copilot; looking back through the bubble shows the spine and engines. Your legs, arms, gloves and boots are posed on the controls; cyclic, collective and pedals follow the stick inputs and the actual collective setting, and the Chinook's dual controls move together. Static meshes merge by material (the cockpit pass adds about 100 draw calls, including its shadow map and the hook camera). The interior has its own sun (same direction as the kitchen's, rotated into body axes) with a small shadow map, so sunlight falls through the windows onto the panel and your knees.
- **Instruments** ([src/render/instruments.js](../src/render/instruments.js), [src/render/glass.js](../src/render/glass.js)). Every instrument reads the sim, and only what the flight model has: no rotor speed, torque, engine temperatures or fuel. Readings are Froude-scaled to full size (length × L, speed × √L, mass × L³; L = 32 micro heli, 90 Chinook, 94 skycrane).
  - *Analogue (micro heli, skycrane)*: ground speed (0–40 kt); attitude; radar altitude, log scale 0–200 ft so the last few feet over a rim are wide, with a digit window naming the surface (TEA, MILK, RIM, TABLE, FLOOR); power as % of maximum thrust with a hover bug that moves with the load (soak a bag and watch it climb); heading card with a magenta ground-track bug; vertical speed, 0 at nine o'clock, square-root scale so a slow sink is visible. Caution lights: HOOK, IN REACH, STEEP, ON GND (skycrane: PUMP, DOORS, INTAKE IN, AUTO).
  - *Hover page*: a heading-up map 24 cm across on the micro heli (52 cm on the others), with the cups and milk crock coloured by what is in them, the rim under you ringed green, pointers and distances to the nearest vessels beyond range, free bags, the loop in reach, loads swinging on their lines, the skycrane's intake, and a magenta track predicted 2 s ahead from the current velocity and acceleration (momentum and tilt, so it bends as you lean). Under it: ground speed, height over the named surface, vertical speed. The micro heli's lower block is the hook (bag depth in the tea or height over what is below, steep clock for this dip, the cup's strength by name, what is left in the bag, or the bucket's fill, with a cup section showing the bag against the surface). The skycrane's is the tank (level, doors opening, pump, auto or salvo, the intake's depth or height, fill or drop rate, snorkel paid out).
  - *Chinook*: PFDs with the attitude, ground-speed and radar-height tapes, vertical speed, heading tape with the track bug, and power with the hover bug; hover pages with a per-hook summary; the cargo-hook page with all three hooks and the load in kg; standby attitude, vertical speed, radar altitude and power. The copilot's displays repeat the pilot's.
  - *How it stays cheap and sharp*: dial faces, ticks and numerals are painted once into a 4096 px (high) mipmapped texture with a small negative LOD bias, only for the aircraft in use. Needles, bugs and the heading card are meshes and the attitude ball is a shader, so they move every frame for free. The glass pages and digit windows are vector shapes and signed-distance-field text (an atlas built at start-up) written into one vertex buffer per panel at 40/30/20 Hz by quality: one draw call, no texture uploads. Lights only change colour. Canvas pages cost about 1.5 ms of GPU per upload, which is why they went.
- **Visual pass (2026-10-15).** The micro heli's windscreen sills and centre post now sit on a crowned coaming deck that runs from the glare shield to the nose, instead of floating over the nose lining. Inside the Chinook the windscreen posts are glazed over on the shell and drawn as slim round frames (A-pillars rake aft from the sill, a centre post, eyebrow posts); outside, the glazing follows the same layout. From the cockpit a turning rotor shows as its blur disc only: above 55% rotor speed the solid blades hide, because at display frame rates they strobe across the windscreen and read as posts. The skycrane's bubble has two slim side frames and a clear view ahead. The outside mirrors on the Chinook and skycrane are round housings with glass on cranked arms. Cabins are two-tone (light headliner, darker trim below), fabric and crinkle paint carry bump detail, frames are satin paint, and every dial has a raised bezel and a cover glass that catches reflections.
- **Head.** The eye turns about a neck pivot and leans toward where you look (down and out through the chin windows), inside a box that keeps it in the cabin. The head is a well-damped spring (ω 9 rad/s, ζ 0.8) pushed against the felt specific force, about 0.35 mm per g (1 cm full size), and trails rotation slightly with a gentle counter-roll to the horizon. Vibration is a faint, smooth airframe rumble below 15 Hz that grows with collective, under a twentieth of a degree (a fast buzz aliases into jitter at display frame rates). Touchdowns, load snatches and bumps jolt the head; scrapes rattle it. Head motion and vibration are sliders (default 0.5); at 0 the view is rigidly attached.
- **Hook camera.** A gimballed camera at the cargo hook looks straight down with the nose at the top, rendered into a 224–384 px target at most 60, 40 or 25 times a second by quality (so a 120 Hz display renders it every other frame), re-using the frame's shadow maps. It feeds the inset and the panel display. On the skycrane it hangs under the front of the tank, between the snorkel and the belly doors, and the readout gives the tank level and where the intake is. The readout gives the lowest load's height above the tea, table or floor, its immersion, or the bucket's fill.
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
next restart). World speed is the pause menu's World weight setting, shared rather than
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

## Sound ([src/audio/](../src/audio/))

Everything is synthesised in Web Audio at runtime; no sample files. The aircraft are models, but they are
heard as full-size helicopters (that is the joke), while cups, tea and the rooms are heard life-size.

- **Rotors** ([aircraftVoice.js](../src/audio/aircraftVoice.js), [synth.js](../src/audio/synth.js)): each rotor
  plays looping beds an exact number of revolutions long, generated from a seed: *thump* (the blade's pressure
  pulse: a broad dip with a sharp core and a low body tone), *slap* (blade-vortex crack), *swish* (broadband,
  swelling as each blade advances) and *wobble* (once per revolution, for chipped blades). Their rate is the
  rate the rotors are drawn turning (micro 2 blades at 52 rad/s, 16.6 Hz blade pass; Chinook two interleaved
  3-blade rotors at 30 rad/s, 14.3 Hz, panned fore and aft; skycrane 6 blades at 26 rad/s, 24.8 Hz), so sound
  and blades agree. Rotor speed is governed, as on a real helicopter, so load is heard as blade bite and engine
  note: slap rises in a powered descent, a hard turn or a flare; the turboshaft whine and exhaust roar follow
  torque, which lags the collective. Tail rotor (micro, skycrane) gets louder with pedal and stops with a tail
  strike; the gearbox whine is a fixed multiple of rotor speed; wash roars near a surface and hisses over tea.
  After a crash the rotor spins down and the engines run down (quickly when drowned).
- **Where you hear it from**: the camera is the listener. Distance lowers the level and the highs (air
  absorption), a source behind is darker, and cameras that watch the aircraft go past hear a scaled Doppler.
  The cockpit muffles the exterior through the canopy and a headset, adds the airframe's felt thump, the
  gearbox, intercom hiss and a warning horn (low rotor speed, lost tail rotor, chipped blades); the nose and
  GoPro mounts are loud and windy, chopped at blade-pass rate; the cargo camera sits in the downwash.
- **Places** ([ambience.js](../src/audio/ambience.js)): the kitchen has a short boxy reverb, room tone, the
  fridge cycling and the wall clock ticking; the garden is dry and open, with a breeze, leaves and a robin who
  goes quiet while a helicopter is close. The mix follows where the camera and aircraft are.
- **Tea** ([tea.js](../src/audio/tea.js)): bubbles ring at their Minnaert pitch and rise as they close; a
  dunk is a surface slap, a deep plunk and a scatter of small bubbles; a fresh bag fizzes as its air escapes and
  sloshes when dragged; a china knock has four inharmonic partials and each cup its own note, lower when full.
- **Crashes** ([crashAudio.js](../src/audio/crashAudio.js)): layered per kind: the hit, the airframe
  crumpling, blades thrashing as they slow (most of a rollover), the turbine running down with a stall bang,
  fire and crackle, then whatever was hit (china and glass shatter and tinkle). Larger aircraft sound lower.
- **Menus** ([ui.js](../src/audio/ui.js)): teaspoon-on-china clinks for focus, select, back, toggles and
  sliders, a stir for toasts. The pause menu is silent because sound is suspended while paused.
- **Listening clips**: `node tools/render-sounds.mjs http://127.0.0.1:PORT/` (with a Vite dev server for the
  checkout) renders scripted flights, perspectives, places, tea, crashes and menus through the real engine in an
  OfflineAudioContext to `test-results/sound-clips/`, with peak, RMS, clipping and error checks.
- **Cost**: about 0.05 ms of main-thread time per frame (parameter updates are capped at 75 Hz; the audio
  thread smooths them). Building the graph and the first aircraft's beds takes about 40 ms at the start
  click; the other aircraft are generated in idle time.

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
