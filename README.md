# Helicoptea

Fly a 24 g scale-model helicopter (a deliberately serious, realistic light utility helicopter) around a cosy kitchen table, out through the back door or the open window into a little tea garden, hook a tea bag on its string, and dip it into a cup until the tea turns the colour you like. The bag swings, soaks up water, gets heavier, drips, and pulls on the helicopter the whole time. Crash hard and it explodes into its parts.

Three.js (r169) for rendering, Rapier 3D (0.14, WASM) for rigid bodies and contacts. Everything visual and audible is generated procedurally at runtime, so there are no external asset files (see [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md)).

## Two aircraft

Pick on the start screen, in **Pause → Aircraft**, or press **V** in flight (`?aircraft=chinook` in the URL also works; the choice is remembered). The **micro heli** is the nimble single-rotor original. The **Chinook** is a 94 g tandem-rotor heavy lifter: two counter-rotating rotors, no tail rotor, three cargo hooks, much more inertia, and its own breakup. See [docs/DESIGN.md](docs/DESIGN.md#chinook-srcsimchinookjs).

## Milk

A Bambi-style milk bucket hangs on its own little hanger beside a stoneware milk crock. Hook it like a bag, lower it into the crock and it fills through a one-way valve in its base until the levels match; lift it out and it keeps the milk. Fly it over a cup and hold **G** (gamepad **RB**, touch **Pour**) to open the release valve: the milk falls as a stream that the rotor wash pushes about. Milk that lands in a cup mixes in and lightens the tea; milk that misses splashes and leaves a puddle that slowly soaks in. A full bucket weighs about 16 g, sloshes, and slops over the rim if you jerk it. See [docs/DESIGN.md](docs/DESIGN.md#milk-srcsimmilkjs).

## The house and the tea garden

Seven cups to brew in: the mug and teacup on the kitchen table, a teacup on the windowsill, a mug by the kettle on the counter, and in the garden a teacup on the garden table, a mug on the tree stump and one on the bench. The garden table has its own tea stand. Fly out through the back door or, more carefully, through a pane of the open window; under the rose arch; low over the meadow grass and watch the rotor wash flatten it. No missions: it's an obstacle course for practising. See [docs/DESIGN.md](docs/DESIGN.md#house-and-tea-garden-srcsimhousejs-srcrendergardenjs).

## Rotor wash, AO

The rotor's downwash is a small fluid simulation (wake column plus a 2D outwash solver over the table). It pushes the dangling bag and strings, buffets the helicopter near surfaces, ripples the linen runner, blows steam and dust, nods the flowers, and dimples and sprays the tea. Ambient occlusion (GTAO) grounds everything on desktop. See [docs/DESIGN.md](docs/DESIGN.md).

## Playing while it's being developed

- **http://localhost:4178/** is the stable build (`releases/stable`, rebuilt only after the tests pass; `releases/stable/VERSION.txt` names the commit).
- **http://localhost:5178/** is the dev server (`npm run dev`) and may break mid-change.
- Tests run against `npm run build` served on 4179: `npx vite preview --port 4179`.

## Run it

Needs Node 18+ (tested with Node 24.14).

```bash
npm install
npm run dev        # http://localhost:5178 (also on your LAN, for phones)
npm run build      # static site in dist/ (relative paths, host anywhere)
npm run preview    # serve dist/ on http://localhost:4178
```

Click **Start flying** (this also unlocks browser audio).

## Tests

```bash
npm run check                        # headless physics checks: both aircraft and the house + garden (Node only)
node tests/e2e.mjs                   # browser checks against npm run preview (port 4178)
node tests/e2e.mjs http://localhost:5178/ --headed --only=desktop
node tests/e2e-chinook.mjs           # Chinook through keyboard, gamepad and touch, picker, breakup
node tests/e2e-milk.mjs              # milk bucket: hook, dip, carry, pour with G / RB / touch, puddles
```

`tests/sim-checks.mjs` drives the real simulation with the same stick inputs a player produces (via a scripted autopilot) and asserts physical outcomes: hover, assist on/off behaviour, peg pickup, swing and load transfer, immersion, wetness and mass, per-cup brewing, extraction and draining, release onto the saucer, landing, crash thresholds, and bounded crash/restart cycles.

`tests/e2e.mjs` uses your installed Chrome or Edge through `playwright-core` (no browser download). It flies the full loop with real keyboard events plus the in-page autopilot, then checks an emulated gamepad, emulated touch (multi-touch, cancel, portrait), a 30 fps render cap, focus loss and pause, 20 crash/restart cycles and sandbox reset. Screenshots and a JSON report go to `test-results/`.

## Controls

| | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Cyclic (tilt) | Arrow keys (or I J K L) | Right stick | Right thumb stick |
| Collective | W / S | Left stick up/down, or RT / LT | Left thumb up/down |
| Yaw | A / D (or Q / E) | Left stick left/right | Left thumb left/right |
| Hook / release | Space (Chinook: each press hooks the nearest bag or the milk bucket to a free hook; with none in reach it drops them all) | A | Hook button |
| Pour milk (hold) | G | RB | Pour button (shown while carrying the bucket) |
| Switch aircraft | V | Pause menu | Pause menu |
| Flight Assist | F | Y | Assist button |
| Restart flight | R | Start | ↻ (top right) |
| Reset sandbox | Shift+R | Pause menu | Pause menu |
| Camera | C recenter, mouse drag orbit, wheel zoom | B or R3 recenter, D-pad orbit/zoom | View button |
| Pause / help / mute / debug | Esc, H, M, ` (or F3) | Back/View, X | ‖ and ? buttons |
| Menus | Arrow keys/Tab, Enter | D-pad or left stick, A select, B back | Tap |

**Steam Controller and other gamepads**: any controller the browser exposes works. Standard layouts (Xbox, PlayStation, Switch Pro, and the Steam Controller through Steam Input) need no setup; anything else can be bound in **Pause → Controller → Bind buttons…**. The same screen has a live stick test, dead zone, response curve, per-axis sensitivity, inversion and rumble. Menus, pause, help and the crash screen are fully driven from the pad. For the Steam Controller specifically, see [docs/STEAM-CONTROLLER.md](docs/STEAM-CONTROLLER.md).

**Collective is a rate on every device**: push to add lift, pull to reduce it, let go to hold. With Flight Assist off this trims the collective setting directly (shown by the bar on the left, with a hover mark). With Flight Assist on it commands a climb or sink speed. Because the stick never maps to an absolute throttle position, switching between keyboard, gamepad and touch never makes the throttle jump.

## Debugging and tuning

- `?debug=1` or the backquote key shows frame time, physics time, body counts, draw calls, live inputs, assist state, collective, thrust/weight, rotor speed, cargo mass, wetness, immersion, string tension and brew levels. F4 (with the overlay open) draws the physics colliders.
- `?quality=low|medium|high` overrides automatic quality (also in the pause menu). `?fps=30` caps rendering to test variable frame rates (physics stays at 240 Hz).
- `window.__helicoptea` exposes the sim, view, input and an `Autopilot` class for console experiments.
- **All tuning lives in [src/config.js](src/config.js)**: physics rate, helicopter mass/inertia/thrust/drag/damping, assist gains, cargo mass, water capacity, buoyancy, liquid drag, soak/drain/brew times, crash thresholds, camera and input curves. Table, house and garden layout is in [src/sim/layout.js](src/sim/layout.js).
- Startup logs one line with load time, quality tier, pixel ratio, GPU and Rapier version. Fatal errors and WebGL context loss show a recoverable error screen. Nothing is logged per frame.

## Project layout

```
src/config.js          tuning
src/sim/               physics and game state (no rendering): helicopter, tea bag + string + liquid,
                       static world, sim orchestration (attach, brew, crash, debris, restart), autopilot
src/render/            Three.js: kitchen, procedural models/textures, tea surface shader, particles,
                       string tubes, follow camera, view (mirrors sim state, turns events into effects)
src/input/input.js     keyboard, gamepad, touch merged into one control state
src/audio/audio.js     procedural Web Audio
src/ui/hud.js, src/game/flow.js   HUD, menus, contextual onboarding
tests/                 headless physics checks and browser e2e
docs/                  design notes, verification record, attribution, timing
```

Simulation, rendering, input, game flow and UI are separate: the sim runs headless in Node for the checks, and the view only reads sim state plus a per-step event list.

## Known limitations

- **Not verified on a physical phone or a physical gamepad (including your Steam Controller).** Touch was verified with Chrome's touch emulation and real CDP touch events; gamepad with an emulated standard-mapping pad. See [docs/VERIFICATION.md](docs/VERIFICATION.md).
- Audio is procedural and was checked for errors and wiring only, not listened to by a person.
- The string's physics is a Rapier rope joint (max-distance constraint, so it can go slack). The visible string is a verlet line pinned to both real attachment points; it avoids the table, cups and main props but does not wrap around arbitrary objects or collide with itself.
- Tea is a shaded surface with ripples, a plume around the bag and splash droplets, not a fluid simulation. Cups do not spill.
- Brewing is accelerated (about 15 seconds for a strong colour change).
- Crash severity is judged from contact impulse (velocity change not explained by flight forces), rotor contact and rollover. It is tuned for fun, not certified physics.
- Quality changes from the pause menu reload the page.
- The Vite dev server watches files through OneDrive; if an edit doesn't appear, restart `npm run dev` (this happened once during development).
