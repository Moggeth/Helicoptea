# Verification record

Date: 2026-10-13. Build: `npm run build`, served by `npm run preview`.

## Machine

- Desktop: Windows 11 Pro 26200, Intel Core Ultra 7 270K Plus, NVIDIA GeForce RTX 3080 Ti (ANGLE / Direct3D 11).
- Browser: Google Chrome 153.0.8010.55, headless, driven by `playwright-core` (`tests/e2e.mjs`). Edge 155 is installed but was not used for the recorded runs.

## Measured performance

Frame rates are rendered frames per second from `renderer.info.render.frame` over the measurement window. Headless Chrome's frame clock on this machine runs at 120 Hz, so **120 fps is the ceiling of the measurement, not of the game**.

| Scenario | Quality | Viewport | Rendered fps | p95 frame | Notes |
|---|---|---|---|---|---|
| Desktop idle on pad | high (auto) | 1600×900, DPR 1 | 120.1 | 8.4 ms | 2048 shadows, 520 particles |
| Desktop carrying a bag | high | 1600×900 | 120.1 | 8.4 ms | |
| During explosion | high | 1600×900 | 120.3 | 8.4 ms | |
| After 20 crash/restart cycles | high | 1600×900 | 120.1 | 8.4 ms | bodies 15 → 39, debris capped at 32 |
| Render capped with `?fps=30` | high | 1280×720 | 30.4 | n/a | physics unchanged: same lift and hover |
| Phone landscape, emulated | medium (auto) | 844×390, DPR 3 → capped 1.5 | 120.1 | 8.4 ms | desktop GPU, touch emulation |
| Phone landscape, CPU throttled ×4 | medium | 844×390, DPR 1.5 | 120.2 | 8.4 ms | CDP CPU throttling |
| Phone landscape, CPU throttled ×6 | medium | 844×390, DPR 1.5 | 71.8 | 16.8 ms | still above 60 |

From the debug overlay (desktop, high): CPU render submission 0.6–0.8 ms per frame, physics 0.2–0.35 ms per frame (two 240 Hz steps, ~0.1–0.2 ms each), 110–180 draw calls, 26–32k triangles. Node headless: 0.13 ms per physics step with 37 bodies.

**Not measured**: GPU time on a phone, a real mobile GPU, thermal throttling, battery. The 60 fps phone target is unverified until run on a physical device; quality "medium" plus dynamic resolution is the mitigation in place.

### 2026-10-13 evening: realistic helicopter, AO and downwash build

| Scenario | Quality | Rendered fps | Notes |
|---|---|---|---|
| Desktop low hover in wash | high + AO | 120 (cap) | 1600×900 |
| Desktop low hover in wash | high + AO | 120 (cap) | 2560×1440 |
| Phone landscape emulated | medium (no AO) | 120 (cap) | 844×390 at DPR 1.5 |
| Phone landscape, CPU ×6 | medium | 40.5 | was 52 for the previous build in the same scenario; sim 6.7 ms and CPU render submit 10.7 ms per frame at ×6 |

The low-hover scenario (wash active, bags nearby) is harder than the earlier over-the-mug measurement.

## Automated checks (all passing)

- `npm run check`: 32/32 headless physics checks (added: restart onto a wrecked pad does not re-explode), including the full takeoff → hook → carry → dip → brew → extract → drain → release on saucer → land loop, swing (29.7° string angle after a hard sideways input) and load transfer (3.0 cm path difference vs. no bag), wet bag mass 3 → 11.6 g still liftable, brewing only in the immersed cup, crash at 1.4 m/s vs. survivable assisted landing, 25 crash/restart cycles bounded.
- `node tests/e2e.mjs`: 50/50 browser checks (13 added for controller support on 2026-10-13: pad starts the game, pause/settings/back navigation, crash rumble and A-to-restart, disconnect pause, bind wizard and a bound unknown-layout pad). Original 37: keyboard lift-off, assist hold and levelling, assist off keeps tilt, attach prompt, Space attach/release, dip and brew, saucer release, landing, crash explosion with 8 debris parts, Restart Flight shown immediately and preserving brew, 20 crash/restart cycles, focus loss pauses and resumes, Shift+R reset, no console errors, 30 fps cap, emulated gamepad (lift, tilt, Y assist, Start restart, prompts switch), emulated touch (lift, two-thumb multi-touch, touch cancel releases both sticks, no page scroll), portrait layout keeps controls on screen.
- Screenshots of each stage are written to `test-results/`.

### 2026-10-14: first-person cockpit

- `node tests/e2e-cockpit.mjs`: 40/40 (rebased onto the skycrane merge). Toggle by 1, HUD button, pause menu (and from inside it), gamepad L3 tap, touch button; mouse, hold-L3 + right stick, D-pad and touch-drag free-look; wheel zoom; look-ahead; hook-camera inset and its Off setting; crash flash then pull-out to the wreck, restart back into the seat, 12 crash/restart cycles; Chinook and skycrane cockpits, crash and restart for each, crash debris with real materials; inset clear of the touch sticks and buttons; LB left free for the skycrane.
- Desktop 1600×900 high: 120 fps (headless cap) in the cockpit and in chase; 837 vs 740 draw calls per frame including AO passes and the hook camera. Phone landscape emulated (844×390, medium, CPU ×4): 52 fps in the cockpit.
- Near-plane: nose held 4 mm from the mug and from the windowsill edge, no visible clipping (screenshots `test-results/cockpit/e2e-clip-*.png`). Walls can't get that close because the rotor strikes first.
- `tests/e2e.mjs` 52/52, `tests/e2e-milk.mjs` 19/19, `tests/e2e-chinook.mjs` 17/17 on the same build (chase view unchanged).
- Not verified: how the head motion and vibration feel to a person, on a real phone GPU, or with a real controller.

## Not verified

- **Physical phone or tablet** (iOS Safari, Android Chrome): untested. Only Chrome touch emulation on desktop.
- **Physical gamepad, including the Steam Controller**: untested. Two emulated pads were used instead: an Xbox-style standard pad (the way Steam Input presents a Steam Controller) and an unknown-layout HID pad bound through the wizard. They checked flight inputs, menu navigation, the start screen, crash restart, rumble calls, disconnect handling and binding persistence. Real rumble strength, trackpad feel, and dead zone and curve tuning need the actual controller. The Steam Controller's receiver (Valve 28DE:1304) and Steam are present on this PC, but no physical buttons could be pressed during automated testing.
- **Firefox and Safari**: untested.
- **Audio by ear**: the Web Audio graph runs without errors, but nobody listened to it.
- **Hand-flying feel by a human**: the loop was completed by real keyboard input for take-off, tilt, assist toggle, attach, release, crash and restart, and by an autopilot that produces the same stick values for the precise pickup and dip. Whether assist-off dipping is "difficult but learnable" needs a person at the controls.

### 2026-10-14: flight recording, replay and notes

- `npm run check` all passing, including `tests/replay-checks.mjs` 38/38: every aircraft recorded at 60 Hz, samples equal the live state exactly, as-flown time, raw and processed inputs, wreckage keyed with part names and replayed within 0.011 mm, exact JSON + binary round trip, bounded ring, recording cost 9 to 10 µs per physics step against 250 to 290 µs of simulation.
- `node tests/e2e-replay.mjs` 47/47 (keyboard micro heli, gamepad Chinook, touch skycrane): marks from N / R3 / the touch Mark button, viewer from the pause menu and the crash screen, frozen world, replayed airframe at the snapshot to 0 m, frame step, 0.25× plays 0.254 s per second, timeline and graph scrubbing, chase / orbit / cockpit cameras, typed and tagged notes, saving to `logs/flights` and loading back, viewer fits a phone screen. Browser recording overhead 16 µs per step.
- On the same build: e2e 52/52, e2e-chinook 17/17, e2e-milk 19/19, e2e-skycrane 31/31, e2e-cockpit 40/40, e2e-depth 21/21.
- Not verified: a person scrubbing and writing notes, a real gamepad or phone, very long flights (the 15-minute split and 96 MB cap were not exercised in the browser). Cup tea colours, milk streams, puddles and the air field are not recorded.

### 2026-10-14: rotor wash on tea, milk and the bird bath

- `node tests/liquid-checks.mjs` 11/11 (now part of `npm run check`): a steady wash settles to a 0.8 mm dimple, volume conserved (walls rise), blade passage keeps it pounding, bounded within the ±4 mm texture range, a drop rings across the cup, outwash beside a cup works its near side, the bird bath field is stable, the field settles and stops stepping 4.3 s after the wash leaves. 0.17 ms per forced frame in Node.
- `node tests/e2e-rotorwash.mjs` 14/14: hovering 7.5 cm above the mug couples the wake (v_g 3.1 m/s), a 1.5 mm deepest point, roughened annulus showing, spray (237 drops) and mist (51 puffs), some drops landing back in the tea and most clearing the rim, the tea settles flat after the heli leaves, the milk crock and bird bath respond the same way, no shader or console errors on desktop or phone. Screenshots in `test-results/rotorwash/`.
- Cost, desktop 1600×900 high: 120 fps (headless cap) hovering over the tea; liquid work (coupling, every surface's field and uniforms, spray and mist) 0.17 ms per frame, peak 0.3 ms; 842 draw calls (one more than before: the spray/mist pool).
- Cost, phone landscape emulated (844×390, medium, 32 × 32 grid): liquid work 0.11 ms per frame unthrottled, 0.86 ms per frame at CPU ×4 (peak 1.4 ms), 36.5 fps over the tea at ×4. Side-by-side with master in the same hover at ×4, two runs each: master 30.5 and 35.3 fps, this branch 30.3 and 28.9 fps (before the phone grid was reduced from 40 to 32). The machine was busy with other runs, so the difference is within noise; expect up to a few fps at ×4.
- On the same build: `npm run check` all green, e2e 52/52, e2e-chinook 17/17, e2e-milk 19/19, e2e-skycrane 31/31, e2e-depth 21/21, e2e-replay 47/47 (twice). e2e-cockpit 39/40 on both this branch and master today: the touch cockpit ×4 frame-rate check reads 29 fps here and 26 fps on master, under load.
- Not verified: a real phone GPU (each tea pixel now does one PMREM lookup, one height-field fetch and a few noise calls; the surfaces are small on screen), how it reads in motion to a person, mist density by eye, the Chinook and skycrane over tea by eye (the coupling is per wake, so both Chinook rotors drive it), spray leaving marks on the cloth (it does not).

### 2026-10-14: crashes and damage (rebased on bee66ac)

Same machine, Chrome 155 headless. `npm run check`: 405/405 (42 new crash checks). Browser suites (`node tests/run-e2e.mjs`): every suite passes, including the new `e2e-crashes.mjs` (58/58), except `e2e-cockpit.mjs` "touch: cockpit frame rate at 4x CPU throttle" (21 fps), which also fails on master bee66ac without this work (13 fps on the same run).

Crash-effect CPU cost, timed inside the page around `CrashFx` (update, live damage look, crash and strike handlers), per rendered frame:

| Scenario | rAF fps | p95 frame | crash FX avg | crash FX max | live particles / shards |
|---|---|---|---|---|---|
| Micro flying | 120.4 | 8.4 ms | 0.006 ms | 0.1 ms | 64 / 0 |
| Micro hard impact (first 1.5 s) | 119.9 | 8.4 ms | 0.021 ms | 0.2 ms | 715 / 231 |
| Micro rotor shatter crash | 99.0 | 16.7 ms | 0.013 ms | 0.1 ms | 347 / 87 |

The shatter row's lower rate was measured while other test runs shared the machine; an earlier isolated run gave 120.9 fps, p95 8.4 ms for the same scenario. Shards are one instanced draw call. **Not measured**: crashes on a phone GPU.

### 2026-10-14: flight tuning board (on 328f621, crashes)

Same machine, Chrome 155 headless.

- `node tests/tuning-checks.mjs` 34/34 (now part of `npm run check`): the defaults leave every config value byte-identical, every knob reaches a real config path, the thrust and cyclic lags are never exposed, global and per-aircraft multipliers stack and reset correctly, ground cushion 0 removes ground effect and ×2 doubles the extra lift, presets apply and *Current* restores the shipped config, deadzone/expo/rates shape cyclic and pedals but never the collective and never fold back, export/import round-trips exactly, import clamps out-of-range values and ignores unknown or inapplicable knobs, and a micro with the top-speed cap at ×0.3 really is faster after the same 2 s dash.
- `node tests/e2e-tuning.mjs` 33/33: Pause → Flight tuning opens the board with every global knob in its five groups and four tabs; a slider changes the live config and marks its row and tab; arrow keys move a focused slider; ↺ resets one knob; hovering a row plays its clip (0.4 ms of simulation per frame for both sides) with Low/High and Default/Yours labels; stick knobs show the curve instead; per-aircraft tabs show only the knobs that apply (Chinook pitch response and aft-rotor wake on the Chinook tab only); changes survive a reload; the Snappy acro preset applies and stick shaping is live in the game; Export saves `helicoptea-tuning.json`; Import applies pasted JSON, gravity reaches the live physics world, a bad file gets a message; Reset all returns to the shipped feel; **every clip (107 clips, both sides) flies to the end without crashing at both ends of every range on all three aircraft** (23.5 s); the sweep leaves the live config untouched; Done and Esc (from a focused slider too) close back to the pause menu and free the preview renderer; no console errors. Screenshots in `test-results/tuning/`.
- On the same build: `npm run check` all green (controls 96, sim, chinook 42, milk 48, skycrane 52, manoeuvre 14, world 28, replay 38, liquid 11, crash 42, tuning 34); browser e2e 52/52, chinook 17/17, crashes 58/58, depth 21/21, milk 20/20, rotorwash 14/14, skycrane 33/33, static 11/11, tuning 33/33. e2e-replay failed one check ("pause menu opens the replay viewer", sample count 196 vs 192) in the full runner twice, and also on plain 328f621 without the board, then passed 47/47 when run on its own against the same build: a timing-sensitive check, not caused by this work. e2e-cockpit 39/40, the known touch ×4 throttle frame-rate check (26 fps).
- Not verified: a person using the board, the board on a real phone (it has a narrow layout, untested by eye), gamepad navigation through the sliders beyond the menus' standard focus handling, and whether the low/high clips read clearly to someone who doesn't already know what the knob does.
### 2026-10-14: camera pass (locked chase, nose cam, orbit, tripod, cargo cam, held GoPro)

- `npm run check` all green, including `tests/camera-checks.mjs` 31/31: the locked chase holds its attitude in the airframe's frame to 4e-8 rad through a bank and pitch, speed feel stretches the arm 2.9 mm and widens the lens 6.7° under acceleration and is exactly rigid at zero, the nose and GoPro mounts on all three aircraft (GoPro looks straight down, nose at the top of the picture, outside the airframe, leaning towards the hook line), the cargo cam hangs under its load, is not mirrored, swings with the string and can look straight up, the tripod holds still, zooms to a steady size and moves on when you fly off, `liquidAt` finds tea and milk.
- `node tests/e2e-camera.mjs` 82/82 on the build (desktop micro heli, all three aircraft, emulated Xbox pad, emulated phone, replay): C / Shift+C / 2-7 / 1 and back, the cycle skipping the cargo cam until something is hooked, the locked chase bolted to within 0.0008 rad while the heli turns, the GoPro from B, right mouse, pad LT (Aim layout) and the touch button with its overlay and landing ring, the cargo cam riding the bag into the mug (fog and overlay in the brew's colour, restored on the way out) and looking up at the heli, the skycrane's snorkel cam (1.3 cm from the hose head), pause-menu picker and cycle toggles persisting across a reload, pad L3 cycling and D-pad glancing in the cargo cam, replay Locked / GoPro / Tripod cameras.
- Frame cost: no mode adds a render pass. The GoPro and cargo cam drop the hook inset (one fewer pass); the nose cam does not show it unless Hook camera is set to Always. Draw calls per mode are at most 1.08× the chase camera's (the locked chase sees a little more of the room). Desktop 1600×900 high, chase vs other modes on an idle machine: 120 fps in every mode except the cockpit on the Chinook and skycrane (76 to 83 fps, as before this pass). Per-mode numbers in `test-results/camera/frame-cost.json`.
- On the same build after rebasing onto bee66ac (since rebased onto 716fb20 and re-run, below): e2e 52/52, e2e-chinook 17/17, e2e-cockpit 40/40, e2e-depth 21/21, e2e-milk 20/20, e2e-rotorwash 14/14, e2e-skycrane 33/33, e2e-static 11/11. e2e-replay stops at 43 checks with a timeout on the phone notes step (`page.fill('.rp-input')`): master bee66ac stops at the same step, so it predates this pass.
- Touch: the Cam and GoPro buttons were checked for overlaps on 844×390, 390×844 and 1024×768. At this earlier checkpoint portrait 390×844 had three overlaps (recenter × mark, doors × both hose buttons). Fixed later in `ac50512`; see [optimization handoff](OPTIMIZATION-2026-10-14.md) for the final five-size, three-aircraft check.
- Not verified: how the modes feel to a person in motion, a real controller (LT as the GoPro), a real phone, motion comfort of the cargo cam's swing over long sessions.

### 2026-10-14: cockpit instruments

Same machine, Chrome headless, 1920×1080 high unless stated. Staged with `node tests/shot-instruments.mjs` (autopilot holds each aircraft: drifting to the mug with bags hooked, bags steeping in the tea, the skycrane's snorkel in the milk crock pumping and its doors open over the table, then a climbing turn) and `node tests/perf-cockpit.mjs` (times the cockpit update, its draw and the hook camera, with GPU timer queries).

- Every instrument read live and matched the sim in the staged moments: radar altitude named TEA / MILK / TABLE as the aircraft moved; the hover bug rose 49 → 59% as the bag soaked; steep clock counted while immersed and reset after; Chinook hook page tracked three hooks independently (one over the rim, two 9 ft deep); skycrane tank 0 → 55% pumping, doors 100% with a drop rate, intake depth 8 ft in the milk.
- All three panels fit inside the default view at 1920×1080 and 2560×1440 (micro panel y 690–1044 px of 1080). Default look-down angles: micro −0.27 rad, skycrane −0.29, Chinook −0.36 with the eye 5 cm (full size) higher and a lower glare shield.
- Cockpit GPU time per frame (mean): micro 0.36 ms (was 0.83), Chinook 0.25 ms (was 1.03), skycrane 0.19 ms. Cockpit CPU update 0.1–0.27 ms mean. Hook camera now renders every other frame at 120 Hz: 0.3–0.4 ms GPU mean (was 0.6–0.8). Canvas-texture pages had cost about 1.5 ms of GPU per upload; the glass is now vector + SDF text in one buffer.
- `npm run check` all green. Browser suites: every suite passes except the known `e2e-cockpit` "touch: cockpit frame rate at 4x CPU throttle" (18–24 fps here, 16–25 fps on master cf8d54e in the same session).
- Not verified: a real phone or headset, or how legible the dials are to a person at their own screen size and distance.

### 2026-10-14: performance pass (120 fps at 4K), branch `perf` on fa437a8

Target: a steady 120 fps (8.3 ms frames, good 1% lows) at native resolution on this machine: RTX 3080 Ti, Core Ultra 7 270K Plus, one display at **3840×2160, 120 Hz, 100 % scaling** (from Windows: `Win32_VideoController` reports 120 Hz current and max).

How it was measured: `node tests/perf-bench.mjs` (new). Every aircraft, in the house (over the mug) and the garden (over the garden table), from the chase and cockpit cameras, held in a hover by the autopilot. `--headed --offscreen --vsync` is a normal Chrome window parked off the desktop and paced by the real display, so 120 is the ceiling. Without `--vsync`, the frame limit is off, which shows the headroom. 1% low is the frame rate of the slowest 1 % of frames. The in-game stats behind it are in `src/perf.js`: frame intervals, main-thread CPU per frame, and GPU time from `EXT_disjoint_timer_query_webgl2`. The F2 readout uses the same stats.

**Caveat on every number below:** other sessions were running their own browser suites, including WARP software rendering, on this machine the whole time. CPU load stayed at 35–75 %, and at times other Chrome GPU processes were using 15–25 % of the 3D engine. The numbers are noisier than an idle machine would give, and a rare single long frame (below) can come from that contention.

4K, synced to the 120 Hz display (fps / 1% low). Master is fa437a8, built and measured in the same session:

| | master | perf |
|---|---|---|
| micro house chase | 66 / 40 | 120 / 118 |
| micro house cockpit | 92 / 34 | 120 / 118 |
| micro garden chase | 85 / 48 | 120 / 118 |
| micro garden cockpit | 56 / 17 | 114 / 40 (one 33 ms frame) |
| chinook house chase | 56 / 40 | 120 / 118 |
| chinook house cockpit | 57 / 17 | 120 / 118 |
| chinook garden chase | 55 / 40 | 120 / 118 |
| chinook garden cockpit | 60 / 17 | 111 / 51 (one 25 ms frame) |
| skycrane house chase | 100 / 60 | 120 / 118 |
| skycrane house cockpit | 118 / 60 | 120 / 118 |
| skycrane garden chase | 115 / 60 | 112 / 18 (one 108 ms main-thread stall) |
| skycrane garden cockpit | 116 / 60 | 110 / 18 (one 120 ms main-thread stall) |

On the perf branch a typical frame costs 3–5.6 ms of main-thread CPU and 5–7 ms of GPU, against an 8.3 ms budget. An earlier run of the same build on a quieter moment held 120 / 117.6 in all 12 scenes. Uncapped at 4K: master 46–89 fps, perf 100–160 fps under load (160–280 fps in the micro heli earlier, on a quieter machine).

Where the time went at 4K on master, and what changed:
- GTAO was the biggest cost: a full-resolution normal pass, AO and denoise, then a copy, a blend and a tone-map pass, all into 4× MSAA half-float 4K targets. It is now worked out at no more than 1100 lines (half resolution at 4K) and applied in a single output pass, with an identical look in screenshots. The full-resolution version is the new **Ultra** tier.
- Shadow maps were redrawn by every pass that rendered the scene: the AO normals, the hook camera, the main view. They are now drawn once per frame. The sun's shadow from still casters is cached, and only movers are drawn each frame (`src/render/shadowCache.js`); any caster that moves drops out of the cache.
- The 3 cm bud vase's `transmission` caused three.js to redraw every opaque object again at full resolution whenever it was on screen. High and below now tint through the glass; Ultra keeps the refraction.
- Per-frame CPU work: world matrices are updated once per frame instead of once per pass. The viewport size is no longer read inside the frame, which had forced a style/layout pass. Allocation in the table-cloth collision went from ~1.1 MB a frame to almost none (GC hitches). The no-AO tiers no longer swap every material's shader variant between the hook camera and the screen. The cockpit's own airframe now casts its shadow from one merged proxy and draws nothing else. Fewer draw calls: one material for all the garden apples (34 draws → 1) and the fruit bowl, and the windowsill leaves, washing-line pegs, bucket lines and vase petals are each one mesh. Render-target shader variants are warmed at load.
- Dynamic resolution now aims at the display's refresh rate and only trades pixels when the GPU is the bottleneck.

Phone check (`e2e-cockpit` "touch: cockpit frame rate at 4x CPU throttle", target above 30): **still failing**. It scored 27 fps in the final full-suite run and 20–24 in earlier runs. In bench runs interleaved with master at the same moment: master 17 / 20 fps, perf 25 / 22.5 fps. At 4x throttle about 45 % of the frame is simulation: 240 Hz steps catching up, up to 12 a frame, mostly Rapier. In-page, a Rapier step costs ~200 µs, of which ~50 µs is `queryPipeline.update` rebuilding its scene-query tree over ~500 colliders every step (the per-step ground-probe ray needs it). Seven bags and four props are always awake (bags have `setCanSleep(false)`); putting them to sleep cut a step from ~200 to ~150 µs. Both of those are simulation changes, so they are left for the sim owner.

- `npm run check` all green. Browser suites on the final rebase: all pass (camera 82, chinook 17, crashes 58, depth 21, milk 20, replay 47, rotorwash 14, skycrane 33, static 11, tuning 33, e2e 52) except that cockpit 4x check (40/41).
- Not measured: Mitch's real play at 120 Hz in his own browser (the benchmark window is real Chrome on his display, but automated), a real phone, a headset, or the GPU-less CI runner, where the frame-rate checks stay advisory.

### 2026-10-15: tea bag and string pass

- `node tests/bag-checks.mjs` 27/27 (now in `npm run check`), on the micro heli, Chinook and skycrane: a bag lifted straight off its peg comes away (master: the micro's bag wedged under the peg and the Chinook was dragged over and destroyed); the carried string keeps the rope's length (master: 1.29×), never folds below the bag's tie point (master: 21-25 mm), never passes through the bag, is tied on at both ends, is straight when taut and sags when slack; a bag spun at 12 rad/s winds its string 3.4 rad, swings back five times and is under 0.6 rad/s after 7 s (master: no twist, still 3.5 rad/s). Master fails 20 of the 27.
- `node tests/e2e-teabag.mjs` 18/18: on all three aircraft the drawn string runs knot to hook at the rope's length (sag 0.00 mm, ends within 0.2 mm), the tag hangs beside the string and swings 0.14-0.23 rad on a jink then settles; a half dip soaks the paper 10 mm above centre (of ±30 mm), a full dip to the top and stains the string; no shader errors.
- Frame time (desktop 1920×1080 high, uncapped, micro in the house): 264-281 fps vs master 238-338 fps across runs (noisy), same 574 draw calls, 488k vs 469k triangles. Sim cost per 240 Hz step in Node 0.227 vs 0.224 ms.
- `npm run check` all green; `npm run e2e` 21 suites: 20 pass, e2e-cockpit 40/41 (the touch cockpit ×4 CPU frame-rate check at 22 fps, which also fails on master; the performance thread owns it).
- Not verified: how the twist and tag swing feel to a person, a real phone GPU, the replay viewer's tag (drawn still there, no swing).

### 2026-10-15: sim cost for weaker machines (branch `sleep` on 5b3f0b1)

- Tea bags that have come completely to rest go to sleep: on a peg or lying still, out of the tea and the wash, done draining, under 0.1 mm/s for half a second. Rapier wakes them for a touch, a hook, unhooking or a blast, and moving air wakes them in `applyForces`. While a bag is awake nothing has changed: `applyForces` wakes it every step, so Rapier's own sleep timer never runs out.
- Scene queries (`src/sim/sceneQueries.js`): `world.step` no longer rebuilds Rapier's query tree over ~500 colliders every step. The tree holds the fixed scenery and is rebuilt only when it changes. Rays test it, then each collider on a moving body at its current position. Checked against Rapier's own castRay: 18,000 random rays on all three aircraft, including a crash with debris, gave 0 mismatches. Over 3,000 steps the trajectories are bit-identical to the stock world, once the stock world's tree is built before its first step (otherwise its rays miss everything on step 0).
- Air solver: same arithmetic, in the same order, through a precomputed stencil. Bit-identical to the old code over 2,400 steps.
- Measured at 1x on a phone-sized view (844×390 at DPR 2, medium tier, cockpit, on the pad, 30 fps cap): sim 1.72 → 1.25 ms a frame, the whole frame 5.94 → 5.50 ms (median of 4 runs each). A Rapier step on the pad went from 145 to 95 µs (micro heli).
- The `e2e-cockpit` 4x-throttle check is still borderline. Run interleaved: master scored 31, 28 and 29 fps; this branch scored 27, 28 and 33. This machine was also running other sessions' suites, and the check's own run-to-run spread (±3 fps) is bigger than the gain. With the whole simulation removed, the same check reached 33 fps, so what is left is rendering.
- 4K at 120 Hz is unchanged: 120 fps with a 1% low of 117 in the six scenes checked. `npm run check` is all green. Every browser suite passes except that check. One run of e2e-skycrane failed 11 hose checks while other suites were loading the machine; it passed 35/35 on both master and this branch when re-run. The branch also applies cleanly on `teabag` (4635406), with all checks green on the combined tree.

### 2026-10-15: rendering on touch devices and the low tier (branch `phone-render` on `sleep`)

- Only `quality.lite` changes: touch devices and the low tier, the same flag that already gives them fewer loose props. Desktop high, medium and Ultra draw exactly as before.
  - The sun's and the cabin's shadow maps are redrawn every other frame. Shadows of still scenery are cached either way; moving things' shadows trail by at most one frame.
  - The table runner uses the low tier's cloth (40×7 points instead of 56×10).
  - The hook camera renders at most 15 times a second.
- Phone-sized cockpit on the pad at 1x, capped at 30 fps: the whole frame takes 5.60 ms on master and 4.72 ms here (median of 4 runs each).
- The `e2e-cockpit` 4x check now waits 1.5 s after the throttle starts, then takes the median of three 2 s windows timed by the page's clock. The bar is unchanged (above 30). The old version counted frames for 3 s straight after switching the throttle on, which included the catch-up frames, and it swung ±3 fps from run to run. With the new measurement: this branch 41–47 fps over 5 runs, master 34–39 over 2 runs. Under the old measurement in the same session: this branch 33, 41 and 42, master 32, 29 and 31.
- All 20 browser suites pass, as does `npm run check`. 4K at 120 Hz is unchanged in the six scenes checked: 120 fps, with one 89 fps 1% low from a single long frame in the micro garden chase. The branch applies cleanly on `cockpit-art` (c53c383), where node checks are green and the 4x check passes at 41 fps.
