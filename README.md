# Helicoptea

Windows browser QA and captures use the shared `tools/browser-safety.mjs` launcher to prevent headless Chromium from trapping the real desktop pointer. Native mouse-capture acceptance is explicitly skipped on Windows; run it on an isolated Linux runner. Verify the guard with `node --test tests/browser-safety-checks.mjs`. See [pointer incident and recovery](docs/WINDOWS-POINTER-SAFETY.md).

Reusable development reference: [AI game iteration research](docs/AI-GAME-ITERATION-RESEARCH.md) and [overnight improvement playbook and prompts](docs/AI-GAME-ITERATION-PLAYBOOK.md). These cover evidence, quality gates and handoffs for this and future games; no overnight runner is scheduled by these documents.

The bounded [14–15 October overnight polish pass](docs/OVERNIGHT-2026-10-15.md) records its starting build,
accepted fixes, before/after evidence, recovery steps and hardware limitations.

Fly a 24 g scale-model helicopter (a deliberately serious, realistic light utility helicopter) around a cosy kitchen table, out through the back door or the open window into a little tea garden, hook a tea bag on its string, and dip it into a cup until the tea turns the colour you like. The bag swings, soaks up water, gets heavier, drips, and pulls on the helicopter the whole time. Crash and it comes apart in one of six ways: blades shattering on a rotor strike, a tail-rotor strike that spins you down, a dunk in the tea, a rollover, a hard hit or a long fall.

Three.js (r169) for rendering, Rapier 3D (0.14, WASM) for rigid bodies and contacts. Everything visual and audible is generated procedurally at runtime, so there are no external asset files (see [docs/ATTRIBUTION.md](docs/ATTRIBUTION.md)).

## Guided first flight

On first launch the game offers a short guided flight (or **Pause → Guided first flight** any time; `?lesson=1` starts it straight away). It teaches one thing at a time in the real kitchen and waits until you have actually done each: lift off on the sprung lift stick, hover, tilt and drift, turn, build speed and stop against the momentum, land, hook a bag and steep it, hook and fill the milk bucket and pour, then switch Flight Assist off and hover by hand, and try the cameras. Each step is a big card with a few large words, a small looping picture of the skill and a picture of the control that does it (the key, the stick on the pad or phone, the mouse, or the X56 throttle and stick), taken from your own bindings; it changes the moment you pick up another device. A bar fills while you hold a hover. The ✕ on the card ends the lesson. See `src/game/tutorial.js` and `tests/tutorial-checks.mjs`.

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

Everything is solid, and plenty of it moves: napkins blow off the table in your downwash, the pendant lamp swings if you clip it, sugar cubes and biscuits get knocked about. Knock over the domino run on the kitchen floor, set the copper pans swinging, blow the leaves about under the apple tree, ring the wind chime, sail the paper boat across the bird bath, spin the windmills, blow the dandelion clocks and tip the pots off the potting bench (see [docs/DESIGN.md](docs/DESIGN.md#set-pieces-srcsimextrasjs-srcrenderextrasjs)). There are a few secrets too: try landing on the radio, dangling a bag near the cat, hovering in the apple tree, and finding the two hidden cups. See [docs/DESIGN.md](docs/DESIGN.md#props-characters-and-easter-eggs-srcsimpropsjs-srcrendercharmjs).

## The neighbourhood

The kitchen is now the back extension of a two-storey house, and the house sits in a whole neighbourhood about 39 × 80 m (for a 20 cm rotor, a big sky playground). Through the doorway at the front of the kitchen are the hall, a double-height stairwell, the living and dining rooms, three rooms upstairs and a loft under the roof. Either side are the neighbours' houses and gardens (a greenhouse, a caravan, a koi pond, a treehouse, a formal garden with a yew arch and a pergola). Out front are the street, with telegraph wires to thread, a phone box and a bus shelter, and a parade of shops with a tea room you can fly in the front of and out the back. Through the gate in the back hedge are the back lane, the allotments (a polytunnel, a bean tunnel, sheds and a tea hut), then a park with a stream and footbridge, a pond and jetty, a bandstand, woodland and a huge oak, with hills on the horizon.

About thirty more cups are scattered about (a bath rack, a chimney top, the treehouse sill, a scarecrow's hat, the end of the jetty) with a tea stand in every area; its bags appear when you fly near. Each area is built round flight routes that a test sweeps with a rotor-sized ball: through the dog flap, up the stairwell and out of the loft dormer, between the field gate's bars, the length of the polytunnel, under the footbridge, and more. See [docs/WORLD.md](docs/WORLD.md).

## From the cockpit

Press **1** (gamepad **L3**, a click of the left stick, or the cockpit icon top right) to fly from the pilot's seat; it also switches from **Pause → Camera**, and `?view=cockpit` in the URL works too. The view is bolted to the airframe, so it rolls and pitches with it; your head sways a little under g, lags sudden rotation, and the airframe buzzes with the rotor (both adjustable in the pause menu, as is the field of view). Each aircraft has its own modelled cockpit: a Bell-style cabin with analogue instruments for the micro heli, a two-pilot CH-47F-style glass cockpit with a copilot for the Chinook, and the skycrane's glazed bubble with its copilot beside you. Your hands and feet are on the controls and move with them. Every instrument reads live, in full-size equivalents (a 30 cm hover reads about 30 ft on the radar altimeter, a soaked bag about 400 kg on the hook): ground speed, attitude, height over whatever is below (it names the tea, rim, table or floor), power against the hover bug, heading with the ground track, vertical speed, and a hover display that maps the cups around you with a predicted track two seconds ahead, plus the hook (bag depth, steep time, how strong the cup is) or, on the skycrane, the tank, doors, pump and snorkel.

Look around by dragging the mouse (wheel to zoom), holding **L3** and using the right stick (it stops flying while you look; in the chase view it orbits the camera) or the D-pad, or dragging any open part of a touch screen. **U** or **Home** (gamepad **B**, on touch double-tap the open screen) looks ahead again. Look down to see through the chin windows. For dipping, a downward **hook camera** shows the bag or bucket with its height over the tea (on the skycrane it is a belly camera on the snorkel and doors, with the tank level and the intake's height); it appears as an inset (bottom right, or top centre on touch screens) and on the panel display. **Pause → Hook camera** can show it in the chase view too, or hide it. A crash from the cockpit shakes and flashes in the seat, then pulls out to the wreck; restarting puts you back in the seat. See [docs/DESIGN.md](docs/DESIGN.md#cockpit-view-srcrendercockpitjs-srcrendercockpitcamjs).

## Cameras

Three cameras, plus the GoPro on a hold. **C** (gamepad **L3** tap, X56 **D**, or the camera icon top right on a phone) steps through them; **Shift+C** steps back, **1** jumps to the cockpit and back, **2** picks the chase and **3** the locked chase. **Pause → Camera** picks one directly and chooses which are in the cycle (remembered, as is the camera you left in).

- **Chase**: the horizon-steady camera behind you that turns with your heading and frames the load. Drag, the D-pad or the X56 hat orbits and zooms it.
- **Cockpit**: the pilot's seat (above), locked to the airframe.
- **Locked chase**: bolted rigidly behind and above the tail, so it rolls and pitches with the airframe; every attitude change and burst of speed reads at once. **Speed feel** (pause menu) lets the arm stretch a little under acceleration and widens the lens with speed; at zero it is perfectly rigid.

Hold **B** (or the right mouse button, gamepad **LT** in the default Aim layout, **R3** in Arcade; any button in Pause → Controller, touch **GoPro**) for the **GoPro**: a camera bolted on a stub arm off the right side of each aircraft, looking straight down past the skid, sponson or tank, with REC, the height readout and a ring on the surface where the lowest load (or the snorkel) would land if you lowered it now. Let go and you are back in your camera. The flight replay keeps its own set (chase, orbit, cockpit, locked, GoPro and tripod).

## Judging height

Every hanging load (bags, the bucket, the skycrane's intake) casts a soft shadow straight down onto whatever is below it, including the tea, and the shadow tightens and darkens as the load closes on the surface. When a load is right over a cup's opening its rim glints, and with a load low over a cup the chase camera closes in and looks a little more steeply into it. An optional plumb line drops from the lowest load (or the hook) to a small laser dot with the height beside it. Each is a switch in the pause menu (the plumb line starts off). See [docs/DESIGN.md](docs/DESIGN.md#depth-cues-srcrenderdepthcuesjs).

## Crashes and damage

Rotor strikes are damaging: brushing something chips the blades (less lift, a shake), and a real strike throws them off, whips the airframe round and drops it. Losing the tail rotor (micro heli and skycrane) leaves you flying but spinning; lower the collective to slow the spin and put it down. Each way of crashing has its own effect and sound, with a beat of slow motion. **Pause → Rotor strikes break the blades** turns strikes off (blades pass through scenery). To try each one, add `?stage=rotor`, `wear`, `tail`, `dunk`, `rollover`, `impact` or `fall` to the URL. See [docs/DESIGN.md](docs/DESIGN.md#crashes-and-damage-srcsimsimjs-srcsimdamagejs-srcrendercrashfxjs).

## Flight replay and feel notes

Every flight is recorded (inputs, telemetry and everything that moves, at 60 Hz). Press **N** in flight
(gamepad **R3**; on touch, **Pause → ⚑ Mark this moment**) to mark a moment. **Pause → Flight replay**, or **Watch replay** after a
crash, plays it back from the snapshots with a timeline, slow motion, frame step, chase / orbit / cockpit
cameras and graphs of the sticks, height, speed and estimated static hanging load; add notes there tagged good or bad. Flights
and notes are saved to `logs/flights/` by the dev and preview servers (in the browser on the online build,
with a **Download** button for a copy), and `node tools/flight-notes.mjs` summarises the notes with the
telemetry around each one. See [docs/FLIGHT-LOGS.md](docs/FLIGHT-LOGS.md).

## Trailer capture

`tools/trailer/` records trailer footage from the real game. `rig.mjs` runs the page on a virtual clock
(requestAnimationFrame and `performance.now` only advance when a frame is stepped), so every frame is exactly
1/60 s of game time at 1920×1080 however slowly it renders, and builds the game's own audio graph on an
`OfflineAudioContext` suspended at each frame boundary, so the sound is the game's mix, sample-aligned to the
picture. `shots.mjs` flies each shot with the in-game autopilot and a scripted camera; `edit.mjs` cuts them,
adds the logo title card and normalises loudness with ffmpeg. Output goes to the ignored `trailer/` folder.

```
npm run build -- --outDir scratch/trailer-dist && npx vite preview --outDir scratch/trailer-dist --port 4677
node tools/trailer/shots.mjs http://localhost:4677/            # all shots (--only=dip,pour; --preview for every 10th frame)
node tools/trailer/edit.mjs                                    # trailer/helicoptea-trailer.mp4
```

## Flight tuning board

**Pause → Flight tuning → Open board** shows every feel setting as a slider, grouped as *Moving a dot*
(world speed, gravity, coasting, top-speed cap, climb damping, thrust-to-weight, collective trim speed),
*Becoming a helicopter* (rotation rate, rotational weight, settling, yaw authority, Chinook pitch response),
*Lift stick* (full-up climb, centred settle, full-down drop, load in the centre), *Stick mapping* (deadzone, expo, rates), *Rotor wash* (how hard it blows things about) and *Flight Assist*
(max tilt, follow, drift catch, climb rate). Hover over (or select) any setting and a short clip plays on the right: the same scripted
flight, side by side, at the low and high ends of that slider, or **Default vs yours**. The **All aircraft**
tab sets the world; the **Micro heli**, **Chinook** and **Skycrane** tabs set each aircraft relative to it
(effective value = aircraft base × all aircraft × this aircraft). Everything at ×1 is the game as shipped.
Changes apply immediately (rotational weight on the next restart) and are remembered in the browser. Each row
has its own ↺ reset, each group a *Reset group*, and there are presets (*Floaty*, *Snappy acro*), **Export**
(clipboard and a `helicoptea-tuning.json` file) and **Import**. See
[docs/DESIGN.md](docs/DESIGN.md#flight-tuning-board-srctuning).

## Rotor wash, AO

The rotor's downwash is a small fluid simulation (wake column plus a 2D outwash solver over the table). It pushes the dangling bag and strings (never the aircraft itself), ripples the linen runner, blows steam and dust, nods the flowers, and dimples and sprays the tea. Ambient occlusion (GTAO) grounds everything on desktop. See [docs/DESIGN.md](docs/DESIGN.md).

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
node --test tests/phone-liquid-checks.mjs # phone batch/shader preservation and analytic liquid forcing
node tests/perf-liquid.mjs --baseline=4565a40 # seven paired CPU samples per rotor/motion scenario
node tests/e2e.mjs                   # browser checks against npm run preview (port 4178)
node tests/e2e.mjs http://localhost:5178/ --headed --only=desktop
node tests/e2e-chinook.mjs           # Chinook through keyboard, gamepad and touch, picker, breakup
node tests/e2e-milk.mjs              # milk bucket: hook, dip, carry, pour with G / RB / touch, puddles
node tests/e2e-skycrane.mjs          # skycrane: snorkel, pump, doors, salvo, auto-fill on keyboard, gamepad and touch
node tests/e2e-depth.mjs http://localhost:4192/   # depth cues: shadows on table and tea, plumb line, rim glint, camera, toggles
node tests/e2e-touch-sticks.mjs      # phone twin sticks with real multi-touch: layouts, leash, double-tap, haptics (Android and iPhone), battery saver, pause menu fit
node tests/e2e-replay.mjs            # flight recording, replay viewer, notes and saving on keyboard, gamepad and touch
node tests/e2e-crashes.mjs           # every crash kind on every aircraft, strikes, the Rotor strikes setting, crash replays, effect cost
node tests/e2e-static.mjs            # the build on a plain static host (no /api): browser saving, reload, Download
node tests/e2e-tuning.mjs            # flight tuning board: sliders, tabs, persistence, presets, export/import, and every preview clip at both ends of every range
node tests/e2e-camera.mjs http://localhost:4196/  # camera modes, GoPro, cycling, frame cost per mode
```

Phone batching preserves functional shader hooks, live vertex buffers and aircraft instances across
cockpit switches; unchanged world matrices do not trigger instance uploads. The liquid solver caches
unchanged rotor footprints and factors blade trigonometry out of its cell loop without changing its
240 Hz integration. The focused checks above run with `npm run check`. Run the paired benchmark
serially, outside browser/simulation acceptance runs; it saves raw samples in ignored
`test-results/perf/liquid-paired.json`. Desktop component timings do not establish physical phone FPS.

Focused validation on 18 October 2026: full Node acceptance passed in 200.96 s; the phone-batch,
memory/recovery, rotor-wash and skycrane browser suites passed. The cockpit suite passed 40/41: its
4× CPU timing budget remains below target on this desktop. An isolated serial reproduction measured
18 fps on both unchanged `4565a40` and the focused patch (target >30). The earlier overlapping
Node/browser run measured 3 fps; run throttled browser timing checks separately from Node physics
acceptance before diagnosing a regression. Hosted run `39090954942` failed the inherited milk-pouring
CPU budget at 1.000 ms/step; local acceptance passed with unchanged limits. Keep timing failures visible;
the CI follow-up reuses the test infrastructure from PR #1. Physical S24 acceptance is open.

Windows baseline-worktree lesson: archiving a checkout with a `node_modules` junction into another
checkout can delete the target's installed packages. Use separate dependency installs, or remove the
verified junction itself before archiving. Source stays in Git; recover ignored dependencies with
`npm ci`. The focused extraction encountered and recovered from this during baseline cleanup.

Liquid-check lesson: an instantaneous turbulent wall height can be negative while total volume is
conserved. Seed 24 reproduces the same trough on master and the optimized solver. The volume check
retains turbulent forcing and its original tolerance; wall rise is checked separately with steady
forcing and no random kicks, so a random wave phase does not fail the assertion.

A new `tests/e2e-<name>.mjs` joins CI automatically if it takes the base URL as an argument, prints
`PASS` / `FAIL  <check>` lines and exits non-zero on failure.

To avoid changing another session's build, use `npm run build -- --outDir scratch/verify`, then
`node tests/run-e2e.mjs --outDir scratch/verify --port 4239` on an unused port. The plain static-host
suite receives the same output directory, so every suite tests the selected build.

`tests/sim-checks.mjs` drives the real simulation with the same stick inputs a player produces (via a scripted autopilot) and asserts physical outcomes: hover, assist on/off behaviour, peg pickup, swing and load transfer, immersion, wetness and mass, per-cup brewing, extraction and draining, release onto the saucer, landing, crash thresholds, and bounded crash/restart cycles.

`tests/e2e.mjs` uses your installed Chrome or Edge through `playwright-core` (no browser download). It flies the full loop with real keyboard events plus the in-page autopilot, then checks an emulated gamepad, emulated touch (multi-touch, cancel, portrait), a 30 fps render cap, focus loss and pause, 20 crash/restart cycles and sandbox reset. Screenshots and a JSON report go to `test-results/`.

## Online build and CI

`.github/workflows/ci.yml` runs on master pushes and pull requests (Windows runner, headless Chrome): `npm ci`,
the build, `npm run check` and every browser suite. Hosted runners have no GPU, so Chrome renders in
software; the game detects that (as it would on any GPU-less machine) and switches to its software tier:
low quality at about 100k rendered pixels with longer physics catch-up, so the world keeps real speed.
Frame-rate overruns and the five explicit CPU timing budgets show as warnings in the run summary;
they are never counted as passing assertions. Invalid timings and behavior, counts and memory limits
still fail. Ordinary local CPU budgets remain strict. Screenshots and reports are attached to each run.
Native mouse capture runs separately on isolated Linux; Windows always retains the pointer guard.
The `CI ready` job requires the Node/build job, every browser suite and native Linux acceptance.
Dependency-free suite discovery runs separately, allowing browser and Node checks to overlap while
the final gate still requires discovery and every validation job. This avoids repeating the full
Node wait before browser feedback on each fixture repair.

Hosted software-renderer startup gets bounded 120 s waits (180 s for the measured Linux native cold
start); behavioral deadlines remain intact. Input fixtures synchronize with delivered frames and
physics steps rather than assuming a fast renderer. Use `HELICOPTEA_SOFTWARE_GL=1` in a child process
with the usual runner to reproduce software rendering locally, retaining the pointer guard. Inspect
failed job logs before rerunning a matrix; record the failing state and compare against master rather
than changing gameplay or silently weakening assertions. Build once, freeze the tested revision and
put later evidence in the PR body to avoid cancelling expensive runs for documentation-only pushes.

Patch transfer on Windows: write patches with `git diff --output=<path> --full-index`, then apply them
with `git apply --3way`. A PowerShell text pipeline changed patch line endings and caused every hunk
to fail; native Git output applied cleanly apart from one real safe-mode policy conflict. Preserve the
current `safe` recovery mode (low quality with no neighbourhood), not the older `low` storage value.
Low on a software GPU is still allowed one real recovery into safe mode; do not transplant the old
test's "low is final" assumption or mutate debug quality to force a transition. The adapted actual
recovery, phone-batch and independent keyboard fixtures passed 23/23 on local SwiftShader in 90.78 s;
the full strict local Node run passed in 158.42 s after the CI adaptation.

Hosted run `39091914958` found a startup-hints fixture reading `skidClearance` after the Skycrane had
crashed while lift was still held. Capture takeoff on the physics clock and engage a test altitude hold
only after the real W input reaches the existing clearance target; preserve the flight/guidance checks
and retain a crash trace. All 18 aircraft/frame-cap cases passed on SwiftShader in 64.55 s afterward.
For a completed job in an active workflow, `gh run view --log` refuses logs until the workflow ends;
`gh api repos/<owner>/<repo>/actions/jobs/<job-id>/logs` retrieves that job's log immediately. Download
its named artifact as well, and collect other matrix failures before pushing another revision.

Post-merge native-input lesson: a hold assertion compared a later roll with the peak of intermediate
mouse samples, without ensuring the gesture exceeded the configured self-level zone. Small tilts are
supposed to decay. Use native movement to cross that zone, wait for the final input frames and compare
the settled roll against its held value with the original 0.02 tolerance. Keep the Node coverage for
near-level decay and large-tilt hold; do not change flight controls to satisfy the fixture.

Replay fixture lesson: waiting for a rendered-frame counter does not guarantee a mock gamepad tap is
sampled once; a tap can span two polls and trigger D-pad repeat at a slow frame rate. Deliver one
pressed and released sample around the actual flight/replay pad consumer, retain its original input
logic, and fail if the consumer never polls. Await replay pause before checking exact two-frame steps.
Hosted camera-rate run `39094913073` still stalled on its second context before the game module ran
(`readyState=interactive`, unchanged loading text, no app or page errors). A generic load-event wait
was not the cause. Give each independent rate case a fresh browser process instead of reusing WARP
state after WebGL context teardown. Navigate to commit then await the game's ready button; preserve
the 120 s hosted startup deadline and all input/rate assertions. Log the cap and actual visible errors
on startup failure; the hidden error paragraph contains placeholder text even when there is no error.

Hosted run `39095337126` passed all camera-rate cases, then exposed two more fixture timing assumptions:
the tuning export's 5 s download timer included slow click actionability, and the tea tag had only
0.103 rad of swing after a wall-clock sleep (limit 0.1). Use the bounded CI action deadline for export
and keep validating the saved JSON. Count the tag's real render integration clock (clamped to 0.05 s
per update), for the original 3.5 s times world speed, instead of sleeping while fewer updates occur.
Keep the swing/settling angles and local hardware performance requirements unchanged.

Run `39096025757` showed an intermittent Skycrane pad impact before takeoff on WARP after the fixture
captured a large screenshot. Capture that diagnostic after the input/guidance assertions so GPU readback
does not stall the live physics loop immediately before the tested input. All grounded, takeoff,
guidance and crash assertions remain. An attempted CI-wide SwiftShader pin (`39096319881`) introduced
more short-wait input failures on the hosted CPUs; it was reverted. Keep Windows' normal renderer
selection and use explicit local SwiftShader runs to investigate slow-render timing independently.

**Play online: [helicoptea.vercel.app](https://helicoptea.vercel.app/)** — public, no sign-in required.

Vercel project `helicoptea` in `moggeths-projects` is connected to `Moggeth/Helicoptea`; `master` deploys
to production. The Vercel GitHub app has access to this repository only. The static Vite build uses
`vercel.json`: `npm ci`, `npm run build`, output `dist/`, hashed assets cached for a year and HTML
revalidated. Flights stay in each visitor's browser; no local flight logs are published.

Check deployment status in [Vercel](https://vercel.com/moggeths-projects/helicoptea) after a push; do not
treat Git success alone as proof of a successful release. Standing permission for validated pushes and
production deployments is recorded in `AGENTS.md`. If the Vercel connector returns 403/404 despite a
working dashboard, use the signed-in browser: the initial import succeeded there after the user approved
the GitHub app installation and completed GitHub reauthentication. Do not repeatedly retry unchanged
connector calls or broaden repository permissions.

## Controls

| | Keyboard | Gamepad (default Aim layout) | Touch |
|---|---|---|---|
| Pitch (tilt forward / back) | Arrow keys ↑ ↓ (or I K) | Right stick ↕ | Right stick ↕ |
| Roll (tilt sideways) | Arrow keys ← → (or J L) | Left stick ↔ | Right stick ↔ |
| Collective | W / S | Left stick ↕ | Left stick ↕ |
| Yaw | A / D (or Q / E) | Right stick ↔ | Left stick ↔ |
| Hook / release | Space (Chinook: each press hooks the nearest bag or the milk bucket to a free hook; with none in reach it drops them all) | A or RB (Classic and Arcade: A or LB) | Hook button |
| Pour milk (hold) | G | RT (past half-way) | Pour button (shown while carrying the bucket) |
| Salvo (latch the bucket valve open) | double-tap G, or Shift+G | two quick RT pulls | double-tap Pour |
| GoPro, straight down (hold) | B, or the right mouse button | LT (Aim layouts; R3 in Arcade) | GoPro button |
| Switch aircraft | V (micro, Chinook, skycrane) | Pause menu | Pause menu |
| Flight Assist | F | Y | Assist switch (top left) |
| Restart flight | R | Start | ↻ (top right) |
| Reset sandbox | Shift+R | Pause menu | Pause menu |
| Camera | C next, Shift+C previous, 1 cockpit, 2 chase, 3 locked chase; U / Home recenter; mouse drag orbit, wheel zoom | L3 tap next; B recenter; D-pad orbit/zoom | Camera icon (top right) next; drag open screen to orbit; double-tap it to recenter |
| Mark a moment for a flight note | N | LB or R3 | Pause → ⚑ Mark this moment |
| Flight replay | Pause menu, or Watch replay after a crash | same | same |
| Cockpit view | 1 toggles; mouse drag look, wheel zoom, U look ahead | L3 tap steps to it; hold L3 + right stick look, D-pad glance, B look ahead | Camera icon; drag open screen to look |
| Pause / help / mute / debug | Esc, H, M, ` (or F3) | Back/View, X | ‖ (help and sound are in Pause) |
| Menus | Arrow keys/Tab, Enter | D-pad or left stick, A select, B back | Tap |

**Touch (phones and tablets).** Twin floating sticks: put a thumb down anywhere in its half of the screen and that spot becomes the stick's centre; slide past the rim and the centre follows your thumb, so reversing is instant however far you have wandered. The default is the classic RC layout (lift and turn on the left, tilt on the right); **Pause → Sticks** also offers Aim (like the gamepad default), Southpaw and RC Mode 1, and **Stick size** sets how far a thumb travels to full deflection (small 48 px, medium 64 px, large 84 px). Only the buttons that fit the moment show: **Hook** (dimmed until a loop is in reach or you carry something; it pulses and gives a short buzz on Android when one is), **GoPro**, and **Pour**, or **Doors / Pump / Hose** on the skycrane. The top bar is the Assist switch, restart, camera and pause; everything else is in Pause, sorted into four tabs: **Flight** (aircraft, guided flight, **Mark this moment**, reset), **Camera**, **Controls** (sticks, vibration, remapping) and **Display** (quality, sound, full screen, battery saver, the depth cues). On Android the start tap goes full screen (Pause → Full screen turns it off); on iPhone, Add to Home Screen opens it full screen (Pause says so). Phones tap back at you: a light tap on lift-off, a firmer one on touchdown scaled by how hard you land, and taps for hooking, releasing, bumps, snatches, rotor strikes and crashes (Android vibrates with strength; iPhone Safari on iOS 18 or later gets a single system tick per cue; **Pause → Vibration** turns it off). **Pause → Battery saver** caps rendering at 30 fps; the physics still runs at 240 Hz. Portrait works (sticks along the bottom, buttons in a row above) but landscape gives the best view.

**Gamepad layouts** (**Pause → Controller**, or **?** → Controller settings). Pick a preset, or change any stick or button and it becomes your own **Custom** layout; everything is saved in the browser.

| Preset | Left stick | Right stick | Triggers and bumpers |
|---|---|---|---|
| **Aim** (default) | ↕ lift, ↔ roll | ↕ pitch, ↔ yaw (aims the nose like a rifle) | RB hook, RT pour, LT bolted camera, LB mark |
| Aim, southpaw | ↕ pitch, ↔ yaw | ↕ lift, ↔ roll | as Aim |
| Classic (RC Mode 2) | ↕ lift, ↔ yaw | ↕ pitch, ↔ roll | the original plus LB hook: RB pour, triggers add lift, skycrane LT pump and LB / RB reel |
| RC Mode 1 | ↕ pitch, ↔ yaw | ↕ lift, ↔ roll | as Aim |
| Arcade | ↕ pitch, ↔ roll | ↔ yaw | RT climb, LT sink, LB hook, RB pour, R3 bolted camera (the skycrane's triggers run the tank, so lift moves to the right stick ↕ there) |

Yaw stays on a proportional stick in every preset, never on a bumper or trigger. Every axis has its own invert (and **Invert pitch** sits at the top for stick-up-raises-the-nose). Choosing a button that already does something else in the same aircraft moves it, and the other action takes your old button if it would be left with none; skycrane-only buttons override general ones while you fly the skycrane. Menus always use A, B and the d-pad, so no layout can lock you out.

**Steam Controller and other gamepads**: any controller the browser exposes works. Standard layouts (Xbox, PlayStation, Switch Pro, and the Steam Controller through Steam Input) need no setup; anything else can be taught where its sticks and buttons are in **Pause → Controller → Teach it an odd pad…** (the layout then decides what they do). The same screen has a live stick test, dead zone, response curve, per-axis sensitivity and rumble. Menus, pause, help and the crash screen are fully driven from the pad. For the Steam Controller specifically, see [docs/STEAM-CONTROLLER.md](docs/STEAM-CONTROLLER.md).

**The lift stick springs back on every device.** With Flight Assist on it commands a climb or sink speed, and centred holds your height. With Flight Assist off it is a sprung collective lever: hold it up to climb (harder the further you push), let go and you settle gently (centre is 5% short of hover, measured against your weight with whatever you carry), pull it down to come down faster. Landed with the stick centred, the collective drops to idle. The bar on the left shows the collective with a hover mark. Full up asks for 35% more than you weigh, never more than the rotor has, so a heavy load eats the climb margin. If you prefer the old collective that stays where you leave it, pick **Lift stick, Assist off → Stays put** in Pause or Controller settings. Every source rests at zero, so switching between keyboard, gamepad and touch never makes the throttle jump.

## Debugging and tuning

- `?view=cockpit` starts in the pilot's seat (the choice is remembered). `node tests/e2e-cockpit.mjs http://localhost:4190/` checks the cockpit view in the browser and `node tests/shot-cockpit.mjs` writes look-around screenshots.
- `?debug=1` or the backquote key shows frame time, physics time, body counts, draw calls, live inputs, assist state, collective, thrust/weight, rotor speed, cargo mass, wetness, immersion, string tension and brew levels. F4 (with the overlay open) draws the physics colliders.
- `?quality=low|medium|high|ultra` overrides automatic quality (also in the pause menu). Ultra adds glass refraction. `?fps=30` caps rendering to test variable frame rates (physics stays at 240 Hz).
- **F2** or **Pause → Frame rate readout** shows frame rate, 1% lows and CPU/GPU time where supported. `?dynres=0` holds resolution fixed for comparisons. Run `node tests/perf-bench.mjs http://127.0.0.1:4199/ --size 1920x1080 --quality high --out desktop` against your own preview server; results go to `test-results/perf/`. Avoid concurrent browser benchmarks.
- The flight tuning board (above) is the player-facing way to tune feel; `window.__helicoptea.tuning` is the same thing from the console (`tuning.setGlobal('coasting', 0.4)`, `tuning.exportText()`). Its stick mapping is applied after the controller's own dead zone and curve, so the two stack.
- `window.__helicoptea` exposes the sim, view, input and an `Autopilot` class for console experiments.
- **All tuning lives in [src/config.js](src/config.js)**: physics rate, helicopter mass/inertia/thrust/drag/damping, assist gains, cargo mass, water capacity, buoyancy, liquid drag, soak/drain/brew times, crash thresholds, camera and input curves. Table, house and garden layout is in [src/sim/layout.js](src/sim/layout.js).
- Startup logs one line with load time, quality tier, pixel ratio, GPU and Rapier version. Fatal errors and WebGL context loss show a recoverable error screen. The last 20 fatal errors persist in this browser's localStorage under `helicoptea.errors`, with build identity and stack. Inspect with `JSON.parse(localStorage.getItem('helicoptea.errors') || '[]')`; reload to recover. Nothing is logged per frame.
- [Optimization and merge handoff, 2026-10-14](docs/OPTIMIZATION-2026-10-14.md) records fixes, verification, performance evidence and remaining limitations. `npm run check` includes tuning, resource ownership, replay save races and haptic arbitration. `npm run e2e` discovers all browser suites, including reset/preview/replay resource soaks and touch-control overlap checks. Build first and use an unused port (`node tests/run-e2e.mjs --port 4210`); do not rebuild `dist/` during a running suite.

## Project layout

```
src/config.js          tuning
src/sim/               physics and game state (no rendering): helicopter, tea bag + string + liquid,
                       static world, sim orchestration (attach, brew, crash, debris, restart), autopilot
src/render/            Three.js: kitchen, procedural models/textures, tea surface shader, particles,
                       string tubes, follow camera, view (mirrors sim state, turns events into effects)
src/input/input.js     keyboard, gamepad, touch merged into one control state
src/audio/             procedural Web Audio: rotor and engine voices, tea, crashes, places, menus
src/ui/hud.js, src/game/flow.js   HUD, menus, contextual onboarding
src/replay/            flight recorder, log format, replay stage and viewer, disk store
tools/flight-log-plugin.js, tools/flight-notes.mjs   logs/flights endpoint; notes + telemetry summary
tests/                 headless physics checks and browser e2e
docs/                  design notes, verification record, attribution, timing
```

Simulation, rendering, input, game flow and UI are separate: the sim runs headless in Node for the checks, and the view only reads sim state plus a per-step event list.

## Known limitations

- **Not verified on a physical phone or a physical gamepad (including your Steam Controller).** Touch was verified with Chrome's touch emulation and real CDP touch events; gamepad with an emulated standard-mapping pad. See [docs/VERIFICATION.md](docs/VERIFICATION.md).
- Audio is procedural. It is checked for errors, levels and clipping, and rendered to listening clips (`tools/render-sounds.mjs`), but its quality still has to be judged by ear.
- The string's physics is a Rapier rope joint (max-distance constraint, so it can go slack) plus a twist spring about the string. The visible string is a verlet line pinned to both real attachment points, straight whenever the rope is taut; it avoids the table, cups, main props and its own bag but does not wrap around arbitrary objects or collide with itself.
- Tea is a shaded surface with ripples, a plume around the bag and splash droplets, not a fluid simulation. Cups do not spill.
- Brewing is accelerated (about 15 seconds for a strong colour change).
- Crash severity is judged from contact impulse (velocity change not explained by flight forces), rotor contact and rollover. It is tuned for fun, not certified physics.
- Quality changes from the pause menu reload the page.
- The Vite dev server watches files through OneDrive; if an edit doesn't appear, restart `npm run dev` (this happened once during development).
