# Overnight polish — 14–15 October 2026

Run starts at 22:36 Sydney and ends at 07:00 on 15 October. New experiments stop at 05:45,
reserving the final 75 minutes for integration, verification and handoff. The bounded heartbeat
`helicoptea-overnight-polish-until-7-am` continues this chat every 20 minutes and must pause itself
at the deadline. No added spending, credits or metered API usage is authorized.

Starting commit: `e50832db7ec1adf19a1957e8ebbb20f8fea74f14`. Preserve momentum, acrobatic freedom,
challenging cargo manipulation and the differences between the three aircraft. Priorities are
reproduced control, camera, sound, feedback and performance problems, before new features.
Subjective flight settings remain candidate exports for the user, never silently adopted defaults.

## Evidence and recovery

The immutable local starting build is `scratch/overnight-baseline`, served on 4235. Candidate builds
use `scratch/overnight-candidate` on 4236. Require each owned server's ready banner. Other tasks have
servers and browser tests on this machine: do not overwrite their `dist/` or stop their processes.
Source recovery is the starting commit; accepted changes have separate commits for selective revert.
Do not reset the working tree to recover an experiment.

Run state and queue: `logs/iteration/2026-10-14-overnight/handoff.md`.
Measured timings: `logs/reviews/overnight-timings.jsonl`.
Camera captures and raw measurements: `test-results/camera-rate/{baseline,candidate}/`.
These runtime artifacts are ignored; this document retains the useful evidence and lessons.

## Camera control experiment

**Problem:** holding the gamepad D-pad orbited/zoomed the chase and orbit cameras once per render
frame. Identical holds therefore moved the camera differently on different machines or when rendering
slowed during hauling/dipping. Cockpit/cargo look already used elapsed time.

**Change:** scale the existing camera increments by elapsed seconds, preserving their original
60 Hz rates: orbit 1.8 rad/s, zoom 1.2 input units/s. No aircraft physics or stick tuning changes.

Matched Chrome runs at 1280×720, low quality, fixed resolution, native canvas video recording:

| Render cap | Before orbit rad/s | After orbit rad/s | Before zoom units/s | After zoom units/s |
|---|---:|---:|---:|---:|
| 30 | 0.7255 | 1.8000 | 0.4837 | 1.2000 |
| 60 | 1.3293 | 1.8000 | 0.8862 | 1.2000 |
| 120 | 1.3604 | 1.8000 | 0.9069 | 1.2000 |

The caps are requested caps, **not achieved frame rates**. Capture and concurrent workloads limited
these samples to approximately 24–46 rendered frames/sec. These are camera correctness measurements,
not performance improvements. Exact 30/60/120 Hz integration is additionally covered in the controller
checks for chase, orbit, cockpit and cargo views. Browser scenarios lift using W, hold an emulated
standard pad's D-pad, recenter with U, cycle with C, pause and resume with Escape. Filmstrip inspection
of the recorded sequences confirms the visible orbit, recovery and cockpit transition; this is
self-review and does not establish physical-controller or subjective camera comfort acceptance.

Targeted results: 108/108 controller checks, 31/31 camera rig checks, 18/18 browser rate/recovery checks.
Full camera browser regression: **82/82 passed** (135.65 s), including all aircraft, hooked cargo
above/below tea, keyboard/gamepad/touch, camera persistence, GoPro, replay and console errors.
Initial isolated build plus controls/camera checks took 2.64 s; native browser baseline capture
took 17.24 s, candidate capture 16.75 s. The baseline correctly failed six rate assertions; the
candidate passed all eighteen checks. Deployment status is tracked in the running handoff.

## Reusable lessons

- The installed Playwright 1.48.2 video recorder requires `ffmpeg-1010`; only `ffmpeg-1011` exists on
  this machine. `recordVideo` failed during `newPage` and a secondary `TargetClosedError` hid the
  underlying missing-executable error. One diagnostic run with Node's
  `--unhandled-rejections=warn` exposed it. Do not weaken normal error handling or download a browser
  bundle just to capture video. Use canvas `captureStream` + `MediaRecorder` for game footage;
  installed system FFmpeg can extract sequential contact sheets. This omits DOM HUD overlays, which
  remain in screenshots. Three failed capture attempts preceded this successful alternative.
- Camera-rate assertions are functional checks: do not name them “fps” or “frame rate” in PASS/FAIL
  output, because the existing CI runner classifies those phrases as advisory performance failures.
- Heartbeat creation needs `destination: "thread"`; omitting it was rejected without creating a job.
- WorkCodex's previously documented authorization failure remains unresolved. No new commission
  was attempted. Functional changes preserving existing UI do not require a fresh design commission.
- Playwright's `page.evaluate` **and locator waiting** can grant user activation through its internal
  `Runtime.callFunctionOn(userGesture: true)`. For controller-only autoplay tests, use CDP with
  `userGesture: false` for readiness polling, pad input and inspection until the first real key/click.
  The first two audio probes accidentally unlocked audio in their harness. The corrected probe
  verifies `navigator.userActivation.hasBeenActive === false` and a genuinely suspended context.

## Audio recovery experiment

**Reproduction:** click Start flying, press Escape within 400 ms, wait for the pause menu, then click
its heading. The delayed startup handler mistook intentional suspension for autoplay denial and
installed a one-shot wake handler. Clicking the paused menu restarted rotor sound. Separately,
after a browser audio suspension later in flight, subsequent flight keys did not recover sound.

**Change:** trusted key/pointer gestures can retry audio recovery throughout the flight, guarded by
the game's pause and page-visibility state. The delayed autoplay hint also respects intentional pause.
Recovery handles interrupted contexts; closed contexts and rejected resume/suspend promises are safe.
No synthesizer, volume default or flight-physics settings changed.

| Matched browser scenario | Starting build | Candidate |
|---|---|---|
| Click in menu after rapid startup/pause | Audio running while game paused; clock 0.072 → 0.381 s | Audio stays suspended; clock 0.080 → 0.080 s |
| Intentional pause | Misleading autoplay warning | No autoplay warning |
| Unexpected context suspension, then U | Remains silent/suspended | Returns to running |
| Controller-only startup, no browser activation | Blocked with a hint | Blocked with a hint; real key unlocks |
| Mute output RMS | 0 | 0 |

Chrome 1280×720, low quality, strict document-activation autoplay policy. The final baseline probe
failed the three reproduced defects and passed the other fifteen checks; candidate **18/18**.
Rejected/closed/interrupted-state unit checks **10/10**. Analyser output after resume: RMS 0.0165,
peak 0.0450; mute RMS zero; after unmute RMS 0.0204. The recorded resume/flight/mute/recovery segment
peaked at −23.6 dBFS. These measurements demonstrate signal and silence, **not human listening quality**.
Keyboard W takeoff/A yaw and the resumed flight screenshot were inspected. Captures and JSON reports
are in `test-results/audio-lifecycle/{baseline,candidate}/`; the audio WebM and waveform retain the
mute interval. The comparison and review are self-reviewed. The OS-interruption test explicitly
suspends the real AudioContext; it does not establish physical Safari/iPhone interruption behaviour.

Final matched baseline capture took 15.05 s and candidate capture 15.01 s. The wider desktop core-loop
regression passed **25/25**: keyboard takeoff, Assist on/off (retained attitude), bag attachment,
transport, steeping, release onto the saucer, crash/restart, pause/resume and sandbox reset, with no
captured console errors. Timing is retained in the ledger. The audio repair is accepted on this
evidence; publication and exact commit identity are retained in the running handoff.

## Existing CI failures

The starting commit's GitHub run `38553108342` was already failing on the software Microsoft Basic
Render Driver. Failures include screenshot/static-host timeouts, crash-effect timing, replay speed,
wash settling, touch pump double-tap, preview timing and pad menu navigation. Local camera tests pass,
but this does not make full CI green. Preserve the hard gates and discriminate actual game defects
from fixed-duration test assumptions; do not relabel functional failures as performance warnings.
Detailed baseline and subsequent CI logs are retained in `logs/reviews/`.
Camera commit `da1037e` CI run `38558639038` passed both camera suites (100 checks), depth, lifecycle,
milk, static-host, touch-layout and tuning suites. It still failed other pre-existing or intermittent
functional checks, including replay elapsed-time assertions and skycrane touch auto-fill. Its full
CI status is failure, despite the local camera and production checks passing.

## Tuning editor keyboard repair

The tuning importer had a concrete destructive shortcut collision: type
`{"version":1,"global":{"coasting":0.8},"aircraft":{}}` into its text area. On the starting build,
only `{"` remained in the field, the flight restarted (recording ID changed), Assist switched off,
the game resumed and the view changed from chase to nose. The global flight handler ignored input
and select elements but did not ignore text areas. Keyboard entry now belongs to text areas and
editable content, while the existing flight shortcuts work after leaving the editor.

The matched browser scenario uses real key events, not `fill()`, and confirms the whole JSON is
retained, pause/flight ID/camera remain unchanged, Apply and Reset work, native text navigation and
newlines work, Escape returns through the import/board/pause screens, and R/C still work in flight.
All **11/11** focused browser checks and **108/108** controller checks pass. The full tuning-board
suite also passed **33/33** (35.64 s), including all preview clips, persistence, sliders, import/export,
repeated opening/closing and resumed flight. Before/after screenshots
were inspected and retained with raw reports in `test-results/input-editing/{baseline,candidate}/`.
The test applies its temporary coasting value only in a fresh browser context and resets it; shipped
tuning is unchanged. This is a correctness repair, not an endorsement of different flight settings.

Baseline reproduction took 6.50 s; candidate build 2.39 s. The first candidate test checked the return
to the pause menu before the next render frame consumed Escape. Waiting for the actual visible menu
resolved that harness race without changing game behaviour or relaxing the acceptance rule.

Accepted in `d5a3856`, pushed to `origin/master`. Vercel reported successful deployment
`Sn5F7HErsnosarXn6x5qKwFUUnnA`; all eleven editing checks also passed against the public production URL.

## Unaccepted focus-loss hypothesis

Source inspection suggested a camera drag might survive a missed pointer release across focus loss.
Three probes (headless, focus emulation disabled, and headed) moved to a second browser page and back.
None produced a `blur` or visibility transition: the game still reported focus, so these probes do
**not** establish a real focus-loss bug. Playwright also tracks held mouse buttons separately per page;
releasing on the other page does not prove the first page received button-free motion. No camera or
flight input behaviour was changed on this evidence. Keep real OS tab/Alt-Tab/drag cancellation in
hands-on acceptance; do not repeat this harness and claim physical focus testing. The three probes
took 4.98, 4.47 and 4.48 seconds, with raw state saved in `logs/reviews/overnight-focus-probe.json`.

## Isolated integrated verification

Preflight inspection found `e2e-static.mjs` ignores the passed server URL and always read shared
`dist/`. The runner and static suite now accept `--outDir`, defaulting to `dist` for existing commands
and CI. This ensures a full isolated sweep, including browser-storage/static-host checks, tests the
intended candidate. The explicit-output static suite passed **11/11** through the runner in 19.15 s;
its log confirms `scratch/overnight-editing` was served. Use
`node tests/run-e2e.mjs --outDir <preserved-build> --port <unused-port>` for subsequent sweeps.
This changes verification tooling only; it does not weaken any game acceptance gate.

## Integrated checkpoint at 23:50 Sydney

Frozen build `42e18cf` passed **511/511** headless checks in **85.05 s**, and **499/500** browser
checks in **841.56 s**. All functional checks passed, including cargo, dipping, milk, all aircraft,
replay, controller recovery and touch layouts. The sole failure was the strict emulated-phone cockpit
performance gate (>30 fps under 4× CPU throttling), which reported 30 fps. This first sweep is not an
all-green result.

Six sequential warm comparisons at 844×390, touch, DPR2, medium auto quality on local Chrome/RTX3080Ti
gave baseline 39.76/61.79/61.87 fps and accepted 37.53/60.66/57.64 fps. Frame-time medians were 25 ms
in both first runs and 16.7 ms thereafter; p95 was roughly 33.4 ms then 25 ms. Dynamic resolution
varied the actual DPR from 0.9 to 1.2. This is **inconclusive** for a performance difference, not a
speedup claim. The unchanged full cockpit suite then passed **41/41 on both builds**, each reporting
33 fps for that gate (42.18/42.32 s). Keep the initial miss as evidence of limited performance margin.
Raw paired data and exact repeats are in `logs/reviews/overnight-cockpit-*.json`.

## Skycrane pour-sound repair

The Skycrane's belly stream omitted the existing continuous milk sound entirely: only bucket outflow
was sent to the audio system. The matched full browser mission fills through the snorkel, flies the
load over the cup using the existing input-pipeline autopilot, and opens the doors with real keyboard
events. Baseline tank flow peaked at **39.17 ml/s**, while the audio rate, stream gain and measured
stream RMS all remained **zero**. The candidate passes bucket plus tank outflow to the existing sound,
with pan weighted by each source's flow. It changes no synthesis, volume curve or flight settings.

The same mission measured **39.18 ml/s** tank and audio flow, gain **0.0859**, RMS **0.0136**, then zero
stream gain after the tank emptied. All **35/35** Skycrane browser checks passed (baseline 34/35 failed
exactly the missing-sound assertion). The 3.77-second isolated stream recording peaks at **−26.8 dBFS**,
with a clear discharge envelope followed by silence. Waveform and matched discharge screenshots were
inspected. This verifies sound routing and signal recovery, not a human listening judgment. Browser
controller/touch checks are emulated. Full baseline/candidate runs took **66.73/66.80 s**, build **2.80 s**.
Evidence: `test-results/tank-audio-{baseline,candidate}/`, including `tank-pour.webm` and its waveform.
Bucket handling passed **20/20** browser checks (**89.57 s**), audio lifecycle passed **18/18**
(**14.79 s**), and audio unit checks passed **10/10**. Source and test review is self-reviewed.

## Invisible HUD interception repair

The general `#hud > *` pointer rule overrode the crash panel's intended disabled state. Although
invisible, it intercepted camera drags and, at 844×390, the visible **Skip tips** button. A real
coordinate tap on that button opened the hidden crash panel's replay action and paused the game.
Dismissed hints also retained an invisible hit area. A scoped CSS rule now disables pointer events
on those two panels while they lack `.show`; their appearance and visible controls are unchanged.

Matched desktop and touch-browser checks confirm that hidden panels no longer intercept, Skip tips
dismisses the hint without opening replay, and a 40 px drag through the former obstruction changes
camera yaw by **−0.24 radians** instead of **0**. Keyboard takeoff and clicking the visible crash-restart
button still work. The focused candidate passed **14/14**, in **9.06 s** (baseline reproduction **7.72 s**).
Before/after screenshots were inspected at `test-results/hidden-hud/{baseline,candidate}/`.

Harness learning: stop dependent assertions after an intercepted action opens replay; frozen replay
cannot pass a subsequent live-flight crash setup. Combining immediate CDP drag and coordinate tap was
also unstable in the touch harness, even after waiting two frames. Testing dismissal first, followed
by the independent camera gesture, avoids that sequencing problem without forcing clicks or changing
game behaviour. Physical phone sequences remain unverified.

## Stable hint rendering

Unchanged hints rebuilt both text nodes every frame and repeatedly wrote their visible class. The
matched browser probe measured **360–362 text replacements plus 180–181 attribute writes in 1.5 s**;
the candidate performs **zero** while preserving the same nodes. It updates when the step or complete
instruction changes, including keyboard/touch/controller labels, and still hides and reopens normally.
The change preserves content and layout; matched screenshots were inspected.

Six sequential A/B/B/A/A/B runs used Chrome/RTX3080Ti, 844×390 touch emulation, medium cockpit, fixed
DPR1.5, dynamic resolution disabled, deterministic random seed, 4× CPU throttle, 2.5 s warm-up and
4 s measurement. Browser layout cost fell from **0.625–0.889 ms/frame** to **0.380–0.458 ms/frame**;
style recalculation fell from **0.105–0.172** to **0.070–0.083 ms/frame**. Hint mutations were zero in
all candidate runs. Frame pacing varied (before 30.0/31.5/44.6 fps; after 40.0/36.2/45.3 fps), with
overlapping tails, so this establishes reduced DOM/layout work rather than a general FPS guarantee.
All runs are retained in `logs/reviews/overnight-hint-bench.json`.
The expanded keyboard, touch and emulated-controller scenario passed **21/21** checks in **17.82 s**;
the six paired measurements took **51.89 s**. Evidence is self-reviewed, with no physical-device claim.

The original cache regression replayed tips after startup to isolate rendering from the separately
reproduced startup issue below. That workaround is now removed: device-label and stable-node checks
start from a fresh flight.

## Keep lift instructions until actual takeoff

At startup, aircraft clearance defaults to one metre; the first force pass also precedes Rapier's
ground-query update. The tutorial treated these temporary values as a completed takeoff. In the
matched heavy-world (`worldSpeed=0.4`) browser scenario, all three aircraft skipped directly to bag
hooking while still on the pad at a requested 120 fps cap; the 30 fps cases happened to pass because
more physics steps ran before hint evaluation.

Progression now waits until the initial physics queries have run and the aircraft is no longer
grounded, then uses the unchanged 6 cm clearance threshold. No force, inertia or control setting
changed. All three aircraft retain the lift instruction on the pad and advance through normal W
input at both render caps. **18/18** browser startup checks (**23.76 s**), **21/21** device/cache/replay
checks (**16.44 s**) and **9/9** headless progression checks (**0.59 s**) passed. The headless checks
cover pre-physics placeholders, idle settling and actual simulated takeoff. Baseline browser run took
**23.71 s** and failed exactly the three high-cap startup assertions.

Matched pad screenshots were inspected in `test-results/startup-hints/{baseline,candidate}/`.
This repairs instruction timing; it does not claim novice usability testing or a flight-feel change.

## Integrated acceptance and hosted CI

The clean, frozen `7867e82` build passed **520/520 headless checks in 78.02 s** and
**555/555 browser checks across 20 suites in 888.08 s** on local Chrome 155 / RTX 3080 Ti.
No performance gates were advisory. This includes all aircraft, hauling and dipping, milk handling,
camera modes, pause/recovery, crash/restart, tuning, replay and touch layout. The exact build is kept
in `releases/overnight-7867e82`; logs and the copied suite summary are in
`logs/reviews/overnight-integrated-7867e82-*`. This later pass does not erase the earlier marginal
phone-cockpit performance result.

GitHub run `38572986671` passed headless checks but **failed** its browser phase at the 35-minute
workflow limit. Microsoft Basic Render Driver measured roughly 10–15 fps. Functional failures also
occurred: controller camera edges, transient crash/wash observations, a touch pump double-tap, and
timeouts. These remain failures, not performance warnings or proven game regressions. Replay passed
47/47 in this run, unlike earlier CI runs. Full evidence: `logs/reviews/overnight-7867e82-ci.log`.

Three new hint/HUD suites omitted `--ignore-gpu-blocklist`, used by the established browser suites,
and timed out waiting for Start on CI. Their launches now use the same renderer override. The missing
flag is a plausible cause of those startup failures; the next hosted run must establish the outcome.
No timeout, assertion or performance threshold was relaxed. The audio timeout was different: its
click completed but Playwright waited for scheduled navigation; it must be investigated separately.

Follow-up hosted run `38580695857` completed all 20 suites in **31 min 43 s**. All three corrected
hint/HUD suites passed **53/53**. Audio, camera, replay, static hosting and the main gameplay's
functional checks also passed. Overall it still failed: **543 passed, 12 failed**, comprising eight
frame-rate checks and four functional observations (Chinook survival after Assist-off, transient
crash effects, rotor-wash settling and touch Pump double-tap). These are not a clean CI result.

A bounded touch diagnostic copied the existing touch mission and recorded pointer timestamps and
consumed actions, without changing the game. At 12× CPU throttle, the baseline and accepted builds
both failed the Pump double-tap check: the two pointer-down events were actually **1.14 s / 1.11 s
apart**, despite the harness requesting a 60 ms inter-tap pause. The accepted build at normal CPU
passed **7/7** touch checks, with pointer downs **171 ms** apart and an `autofill` action consumed.
This reproduces an invalid double-tap stimulus under heavy throttling, not a proven dropped-input
bug. Do not widen the game's double-tap window to make this test pass. It does not establish the
exact timing on CI or physical phones. Diagnostic script: `scratch/overnight-touch-timing.mjs`;
event traces and screenshots: `test-results/touch-timing-*`; logs: `logs/reviews/overnight-touch-timing-*`.
The proposed control change was therefore rejected; thresholds and gameplay remain unchanged.

The proposed Skycrane tutorial replacement was not accepted: the aircraft has a working cargo hook,
so tea-bag guidance is applicable. Prioritising milk instructions needs a clearer usability criterion.
No flight tuning alternatives were introduced, and flight forces and aircraft parameters are unchanged.

## Remaining acceptance

Physical phone, Steam Controller connection/feel, haptics, human listening and skilled acrobatic-flight
judgment need the user. Browser emulation and waveform checks must not be presented as those tests.
Further overnight changes and the final report append measured evidence here.
