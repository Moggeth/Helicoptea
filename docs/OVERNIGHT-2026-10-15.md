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

## Remaining acceptance

Physical phone, Steam Controller connection/feel, haptics, human listening and skilled acrobatic-flight
judgment need the user. Browser emulation and waveform checks must not be presented as those tests.
Further overnight changes and the final report append measured evidence here.
