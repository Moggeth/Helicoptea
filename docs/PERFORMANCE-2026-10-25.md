# Performance pass — 25 October 2026

Baseline `0779ff7`, fetched before editing (the checkout was eleven commits behind). Existing optimizations
were retained. Controls, physics tuning, blade density, quality defaults and interface design are unchanged.

## Changes

- Grass uses bounded tiles with shared blade buffers/materials. A conservative summed-area mask rejects
  empty tiles; each camera culls off-screen tiles. Bounds cover tuft jitter, bent blades, flowers and
  terrain height. Masked blades return early in the vertex shader. The world-locked grid remains intact.
- Particle pools skip idle uploads and upload only their live prefix. Tests cover retirement and reuse.
- Phone batches cache transformed culling spheres until instance matrices change; the main view and
  hook camera share these exact bounds.
- Open-water scrolling reuses overlapping shoreline masks and typed scratch storage. Exposed cells and
  formerly forced-dry border cells are queried again. Calm water skips zero-contribution froth/glitter.
- Three.js and Rapier have separate content-hashed bundles. Engine filenames stayed identical across
  two builds with different game code: about 950 KB gzipped can be reused on ordinary game updates.
  This is a repeat-visit cache improvement, not a first-load download reduction.

## Evidence

`node tests/perf-render.mjs BEFORE_URL AFTER_URL` (add `--phone`) runs three seeded fixed-camera rounds
in alternating order, asserts camera positions, captures images and includes GPU completion in timing.
This is a renderer microbenchmark, not gameplay FPS. `tests/perf-bench.mjs` measures moving aircraft.
Do not run benchmarks concurrently. Raw results and screenshots are in ignored `test-results/perf/`.

Grass-only submissions, RTX 3080 Ti, high 1920×1080 unless specified:

| Scene | Before triangles | After | Reduction |
| --- | ---: | ---: | ---: |
| Kitchen | 1,916,935 | 1,870,855 | 2.4% |
| Garden | 2,288,794 | 1,888,138 | 17.5% |
| Street | 699,885 | 469,485 | 32.9% |
| Phone street, medium 390×844 | 182,097 | 99,153 | 45.5% |

Tiles add some draw calls (garden 497 to 517). GPU-completed timing was noisy and mixed; no universal FPS
speedup is established. Desktop garden round medians were 1.8/1.6/2.5 ms before and 2.4/2.8/1.9 ms after;
street 0.6/0.8/0.8 ms before and 0.7/0.5/0.6 ms after. Work avoided is the stronger evidence. Garden
screenshots were visually inspected. Phone emulation uses the desktop GPU, not physical phone hardware.

The shoreline regression checks every cell against fresh geometry queries. A one-cell scroll of a 64×64
field at unchanged water height uses 62 queries instead of 3,844 (98.4% fewer). Larger moves query more.
`node tests/perf-systems.mjs --baseline=0779ff7` runs seven paired CPU repeats in alternating order:

| Subsystem | Before | After | CPU reduction |
| --- | ---: | ---: | ---: |
| Water-grid scroll | 0.1383 ms/move | 0.0242 ms/move | 82.5% |
| Stationary bounds, 400 instances | 0.0054 ms/scan | 0.0009 ms/scan | 83.6% |

The bounds saving is small in absolute time. These measurements are not whole-game FPS gains.

## Verification and recovery

New regressions run in `npm run check`. The existing full headless checks passed in 184.77 seconds:
1,023 custom PASS assertions plus the Node test-runner checks. The five new regression tests also passed.
Build and test in an isolated output directory:

```
npm run build -- --outDir scratch/perf-final
node tests/run-e2e.mjs --outDir scratch/perf-final --port 4389
```

Do not rebuild an output directory while a suite consumes it. Use the Windows pointer guard in
`tools/browser-safety.mjs`. Runtime logging and recovery remain in the README. Measured tool timings,
including failed attempts, are in `logs/reviews/performance-2026-10-25.jsonl`.

## Lessons

- Another chat can switch shared `gh` auth during a long task. The first push failed with 403 naming
  `mitch-dromeda`, despite an earlier verified switch to Moggeth. A child-scoped `GH_TOKEN` obtained with
  `gh auth token --user Moggeth` and verified with `gh api user` fixed this without global auth changes
  or credential files. Restore the prior child environment; never print tokens.
- The first fixed-camera harness froze requestAnimationFrame without retaining the pending callback,
  so subsequent scenarios measured the previous camera. Those results were discarded. It now resumes
  that callback and asserts the actual camera coordinates before measurement.
- The audio browser fixture saw a physical Z3 Receiver connection toast instead of its expected audio
  warning. Overriding `getGamepads` alone does not suppress native connection events. The fixture now
  suppresses trusted pad events and physical pads in its synthetic contexts; production is unchanged.
- On Windows, use explicit UTF-8 for Python document reads/writes. The system cp1252 default rejected an
  added arrow and truncated an untracked draft; it was restored from the authored content.
- Fewer triangles do not automatically make a CPU-bound frame faster. Retain draw counts and scenario
  timings alongside geometry reductions, and do not extrapolate desktop results to physical phones.

## Final acceptance

- 1,048 headless assertions/tests passed (1,023 custom assertions, 20 existing Node tests, five new tests).
- 378 browser checks passed across 13 selected suites after the audio fixture correction. The initial
  sweep took 675.57 seconds, with one audio-fixture failure; its corrected 21-check rerun took 41.72
  seconds. No timing checks were made advisory. Suites: audio lifecycle, camera rate, camera modes,
  cockpit, crashes, lifecycle, phone batches, phone memory/recovery, replay, rotor wash, static hosting,
  touch layout and general gameplay. Other browser suites were not rerun locally.
- Full headless checks took 184.77 seconds. Baseline moving-aircraft benchmark 76.77 seconds;
  corrected fixed-view desktop comparison 48.07 seconds; phone comparison 33.44 seconds.
- Vercel reported successful deployment of runtime commit `5f55fdc`; production HTTP returned 200.
  Both stable engine URLs had `Cache-Control: public, max-age=31536000, immutable`.
- Physical phone, native Windows pointer capture and physical-controller feel remain outside this
  acceptance. The Windows automation guard stayed enabled throughout.

Logs: `logs/reviews/performance-check.log`, `performance-browser.log`, `performance-audio-rerun.log`.
The browser runner's global summary is overwritten by reruns; use these named logs for the full record.

Production smoke completed in both 1280×720 desktop and 390×844 touch contexts: all three aircraft
started and switched into their cockpits without captured JavaScript/console errors. The runtime reported
build label `5f55fdc-dirty`; the Vercel Git status identifies deployment commit `5f55fdc`. Captures and
machine-readable evidence are in `logs/reviews/performance-production-*` and `performance-production.json`.
