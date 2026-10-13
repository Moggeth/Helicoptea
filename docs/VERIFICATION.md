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
