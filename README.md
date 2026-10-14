# Helicoptea

Fly a 24 g scale-model helicopter (a deliberately serious, realistic light utility helicopter) around a cosy kitchen table, out through the back door or the open window into a little tea garden, hook a tea bag on its string, and dip it into a cup until the tea turns the colour you like. The bag swings, soaks up water, gets heavier, drips, and pulls on the helicopter the whole time. Crash hard and it explodes into its parts.

Three.js (r169) for rendering, Rapier 3D (0.14, WASM) for rigid bodies and contacts. Everything visual and audible is generated procedurally at runtime, so there are no external asset files (see [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md)).

## Three aircraft

Pick on the start screen, in **Pause → Aircraft**, or press **V** in flight (`?aircraft=chinook` in the URL also works; the choice is remembered). The **micro heli** is the nimble single-rotor original. The **Chinook** is a 94 g tandem-rotor heavy lifter: two counter-rotating rotors, no tail rotor, three cargo hooks, much more inertia, and its own breakup. See [docs/DESIGN.md](docs/DESIGN.md#chinook-srcsimchinookjs). The **skycrane** is the milk tanker (below).

## Skycrane milk tanker

The third aircraft (`?aircraft=skycrane`, the start screen, Pause → Aircraft, or **V**) is an S-64 Air-Crane-style skycrane in orange with a green stripe: a glass cockpit pod on a skeletal crane spine, a six-blade main rotor, a four-blade tail rotor high on the left of the tail pylon, long-legged wheeled gear and a belly tank. A snorkel hose made of real physics segments hangs from the tank, swings, drags and collides. Hover low over the milk crock (or any cup), get the intake under the surface and pump; the tank fills, the aircraft gets heavier and the milk sloshes. Over a cup, open the belly doors as little or as much as you like, or fire a salvo. See [docs/DESIGN.md](docs/DESIGN.md#skycrane-srcsimskycranejs).

| Skycrane | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Belly doors (analog) | hold G (opens wider as you hold) | RT (squeeze to trickle, pull to gush) | hold Doors |
| Salvo: dump the lot | double-tap G, or Shift+G | two quick full RT pulls | double-tap Doors |
| Pump | hold T | hold LB (Classic: LT, analog speed) | hold Pump |
| Reel the hose in / out | Z / X | D-pad ↑ / ↓ (Classic: LB / RB) | Hose ▲ / Hose ▼ |
| Auto-fill: reel down, pump till full, reel up | double-tap T, or Shift+T | double-tap LB (Classic: LB + RB together) | double-tap Pump |

Gamepad columns show the default **Aim** layout; see [Controls](#controls) for the others. Any hose or pump input takes over from auto-fill. The bucket gets a salvo too: double-tap G (or two quick RT pulls, or the Pour button) latches its valve open until it is empty.

## Milk

A Bambi-style milk bucket hangs on its own little hanger beside a stoneware milk crock. Hook it like a bag, lower it into the crock and it fills through a one-way valve in its base until the levels match; lift it out and it keeps the milk. Fly it over a cup and hold **G** (gamepad **RB**, touch **Pour**) to open the release valve: the milk falls as a stream that the rotor wash pushes about. Milk that lands in a cup mixes in and lightens the tea; milk that misses splashes and leaves a puddle that slowly soaks in. A full bucket weighs about 16 g, sloshes, and slops over the rim if you jerk it. See [docs/DESIGN.md](docs/DESIGN.md#milk-srcsimmilkjs).

## The house and the tea garden

Seven cups to brew in: the mug and teacup on the kitchen table, a teacup on the windowsill, a mug by the kettle on the counter, and in the garden a teacup on the garden table, a mug on the tree stump and one on the bench. The garden table has its own tea stand. Fly out through the back door or, more carefully, through a pane of the open window; under the rose arch; low over the meadow grass and watch the rotor wash flatten it. No missions: it's an obstacle course for practising. See [docs/DESIGN.md](docs/DESIGN.md#house-and-tea-garden-srcsimhousejs-srcrendergardenjs).

Everything is solid, and plenty of it moves: napkins blow off the table in your downwash, the pendant lamp swings if you clip it, sugar cubes and biscuits get knocked about. There are a few secrets too: try landing on the radio, dangling a bag near the cat, hovering in the apple tree, and finding the two hidden cups. See [docs/DESIGN.md](docs/DESIGN.md#props-characters-and-easter-eggs-srcsimpropsjs-srcrendercharmjs).

## From the cockpit

Press **1** (gamepad **L3**, a click of the left stick, or the cockpit icon top right) to fly from the pilot's seat; it also switches from **Pause → View**, and `?view=cockpit` in the URL works too. The view is bolted to the airframe, so it rolls and pitches with it; your head sways a little under g, lags sudden rotation, and the airframe buzzes with the rotor (both adjustable in the pause menu, as is the field of view). Each aircraft has its own modelled cockpit: a Bell-style cabin with analogue instruments for the micro heli, a two-pilot CH-47F-style glass cockpit with a copilot for the Chinook, and the skycrane's glazed bubble with its copilot beside you. Your hands and feet are on the controls and move with them. Instruments read live, in full-size equivalents (a 30 cm hover reads about 30 ft on the micro heli's altimeter, a soaked bag about 400 kg on the hook).

Look around by dragging the mouse (wheel to zoom), holding **L3** and using the right stick (it stops flying while you look; in the chase view it orbits the camera) or the D-pad, or dragging any open part of a touch screen. **C** (gamepad **B**, touch **View**) looks ahead again. Look down to see through the chin windows. For dipping, a downward **hook camera** shows the bag or bucket with its height over the tea (on the skycrane it is a belly camera on the snorkel and doors, with the tank level and the intake's height); it appears as an inset (bottom right, or top centre on touch screens) and on the panel display. **Pause → Hook camera** can show it in the chase view too, or hide it. A crash from the cockpit shakes and flashes in the seat, then pulls out to the wreck; restarting puts you back in the seat. See [docs/DESIGN.md](docs/DESIGN.md#cockpit-view-srcrendercockpitjs-srcrendercockpitcamjs).

## Judging height

Every hanging load (bags, the bucket, the skycrane's intake) casts a soft shadow straight down onto whatever is below it, including the tea, and the shadow tightens and darkens as the load closes on the surface. When a load is right over a cup's opening its rim glints, and with a load low over a cup the chase camera closes in and looks a little more steeply into it. An optional plumb line drops from the lowest load (or the hook) to a small laser dot with the height beside it. Each is a switch in the pause menu (the plumb line starts off). See [docs/DESIGN.md](docs/DESIGN.md#depth-cues-srcrenderdepthcuesjs).

## Flight replay and feel notes

Every flight is recorded (inputs, telemetry and everything that moves, at 60 Hz). Press **N** in flight
(gamepad **R3**, touch **⚑ Mark**) to mark a moment. **Pause → Flight replay**, or **Watch replay** after a
crash, plays it back from the snapshots with a timeline, slow motion, frame step, chase / orbit / cockpit
cameras and graphs of the sticks, height, speed and rope tension; add notes there tagged good or bad. Flights
and notes are saved to `logs/flights/` by the dev and preview servers (in the browser on the online build,
with a **Download** button for a copy), and `node tools/flight-notes.mjs` summarises the notes with the
telemetry around each one. See [docs/FLIGHT-LOGS.md](docs/FLIGHT-LOGS.md).

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
npm run build && npm run e2e         # every browser suite (tests/e2e*.mjs) against one preview server; what CI runs
npm run e2e -- replay static         # only suites whose name contains these words
npm run check                        # headless physics checks: both aircraft and the house + garden (Node only)
node tests/e2e.mjs                   # browser checks against npm run preview (port 4178)
node tests/e2e.mjs http://localhost:5178/ --headed --only=desktop
node tests/e2e-chinook.mjs           # Chinook through keyboard, gamepad and touch, picker, breakup
node tests/e2e-milk.mjs              # milk bucket: hook, dip, carry, pour with G / RB / touch, puddles
node tests/e2e-skycrane.mjs          # skycrane: snorkel, pump, doors, salvo, auto-fill on keyboard, gamepad and touch
node tests/e2e-depth.mjs http://localhost:4192/   # depth cues: shadows on table and tea, plumb line, rim glint, camera, toggles
node tests/e2e-replay.mjs            # flight recording, replay viewer, notes and saving on keyboard, gamepad and touch
node tests/e2e-static.mjs            # the build on a plain static host (no /api): browser saving, reload, Download
```

A new `tests/e2e-<name>.mjs` joins CI automatically if it takes the base URL as an argument, prints
`PASS` / `FAIL  <check>` lines and exits non-zero on failure.

`tests/sim-checks.mjs` drives the real simulation with the same stick inputs a player produces (via a scripted autopilot) and asserts physical outcomes: hover, assist on/off behaviour, peg pickup, swing and load transfer, immersion, wetness and mass, per-cup brewing, extraction and draining, release onto the saucer, landing, crash thresholds, and bounded crash/restart cycles.

`tests/e2e.mjs` uses your installed Chrome or Edge through `playwright-core` (no browser download). It flies the full loop with real keyboard events plus the in-page autopilot, then checks an emulated gamepad, emulated touch (multi-touch, cancel, portrait), a 30 fps render cap, focus loss and pause, 20 crash/restart cycles and sandbox reset. Screenshots and a JSON report go to `test-results/`.

## Online build and CI

`.github/workflows/ci.yml` runs on every push and pull request (Windows runner, headless Chrome): `npm ci`,
the build, `npm run check` and every browser suite. Hosted runners have no GPU, so frame-rate checks show
as warnings in the run summary there instead of failing; everything else must pass. Screenshots and reports
are attached to each run as `test-results`.

Vercel builds the same repo as a static Vite site (`vercel.json`: `npm run build`, output `dist/`, hashed
`assets/` cached for a year, `index.html` always revalidated). `master` deploys to production and every
other branch or pull request gets a preview URL.

## Controls

| | Keyboard | Gamepad (default Aim layout) | Touch |
|---|---|---|---|
| Pitch (tilt forward / back) | Arrow keys ↑ ↓ (or I K) | Right stick ↕ | Right thumb stick |
| Roll (tilt sideways) | Arrow keys ← → (or J L) | Left stick ↔ | Right thumb stick |
| Collective | W / S | Left stick ↕ | Left thumb up/down |
| Yaw | A / D (or Q / E) | Right stick ↔ | Left thumb left/right |
| Hook / release | Space (Chinook: each press hooks the nearest bag or the milk bucket to a free hook; with none in reach it drops them all) | A or RB | Hook button |
| Pour milk (hold) | G | RT (past half-way) | Pour button (shown while carrying the bucket) |
| Salvo (latch the bucket valve open) | double-tap G, or Shift+G | two quick RT pulls | double-tap Pour |
| Bolted-on camera (hold) | (camera pass) | LT | (camera pass) |
| Switch aircraft | V (micro, Chinook, skycrane) | Pause menu | Pause menu |
| Flight Assist | F | Y | Assist button |
| Restart flight | R | Start | ↻ (top right) |
| Reset sandbox | Shift+R | Pause menu | Pause menu |
| Camera | C recenter, mouse drag orbit, wheel zoom | B recenter, D-pad orbit/zoom | View button, drag open screen to orbit |
| Mark a moment for a flight note | N | LB or R3 | ⚑ Mark |
| Flight replay | Pause menu, or Watch replay after a crash | same | same |
| Cockpit view | 1 toggles; mouse drag look, wheel zoom, C look ahead | L3 click toggles; hold L3 + right stick look, D-pad glance, B look ahead | Cockpit icon (top right); drag open screen to look |
| Pause / help / mute / debug | Esc, H, M, ` (or F3) | Back/View, X | ‖ and ? buttons |
| Menus | Arrow keys/Tab, Enter | D-pad or left stick, A select, B back | Tap |

**Gamepad layouts** (**Pause → Controller**, or **?** → Controller settings). Pick a preset, or change any stick or button and it becomes your own **Custom** layout; everything is saved in the browser.

| Preset | Left stick | Right stick | Triggers and bumpers |
|---|---|---|---|
| **Aim** (default) | ↕ lift, ↔ roll | ↕ pitch, ↔ yaw (aims the nose like a rifle) | RB hook, RT pour, LT bolted camera, LB mark |
| Aim, southpaw | ↕ pitch, ↔ yaw | ↕ lift, ↔ roll | as Aim |
| Classic (RC Mode 2) | ↕ lift, ↔ yaw | ↕ pitch, ↔ roll | the original: RB pour, triggers add lift, skycrane LT pump and LB / RB reel |
| RC Mode 1 | ↕ pitch, ↔ yaw | ↕ lift, ↔ roll | as Aim |
| Arcade | ↕ pitch, ↔ roll | ↔ yaw | RT climb, LT sink, RB pour, LB bolted camera (the skycrane's triggers run the tank, so lift moves to the right stick ↕ there) |

Yaw stays on a proportional stick in every preset, never on a bumper or trigger. Every axis has its own invert (and **Invert pitch** sits at the top for stick-up-raises-the-nose). Choosing a button that already does something else in the same aircraft moves it, and the other action takes your old button if it would be left with none; skycrane-only buttons override general ones while you fly the skycrane. Menus always use A, B and the d-pad, so no layout can lock you out.

**Steam Controller and other gamepads**: any controller the browser exposes works. Standard layouts (Xbox, PlayStation, Switch Pro, and the Steam Controller through Steam Input) need no setup; anything else can be taught where its sticks and buttons are in **Pause → Controller → Teach it an odd pad…** (the layout then decides what they do). The same screen has a live stick test, dead zone, response curve, per-axis sensitivity and rumble. Menus, pause, help and the crash screen are fully driven from the pad. For the Steam Controller specifically, see [docs/STEAM-CONTROLLER.md](docs/STEAM-CONTROLLER.md).

**Collective is a rate on every device**: push to add lift, pull to reduce it, let go to hold. With Flight Assist off this trims the collective setting directly (shown by the bar on the left, with a hover mark). With Flight Assist on it commands a climb or sink speed. Because the stick never maps to an absolute throttle position, switching between keyboard, gamepad and touch never makes the throttle jump.

## Debugging and tuning

- `?view=cockpit` starts in the pilot's seat (the choice is remembered). `node tests/e2e-cockpit.mjs http://localhost:4190/` checks the cockpit view in the browser and `node tests/shot-cockpit.mjs` writes look-around screenshots.
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
src/replay/            flight recorder, log format, replay stage and viewer, disk store
tools/flight-log-plugin.js, tools/flight-notes.mjs   logs/flights endpoint; notes + telemetry summary
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
