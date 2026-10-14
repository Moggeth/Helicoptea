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

## Remaining acceptance

Physical phone, Steam Controller connection/feel, haptics, human listening and skilled acrobatic-flight
judgment need the user. Browser emulation and waveform checks must not be presented as those tests.
Further overnight changes and the final report append measured evidence here.
