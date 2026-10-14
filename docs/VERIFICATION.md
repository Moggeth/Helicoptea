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
