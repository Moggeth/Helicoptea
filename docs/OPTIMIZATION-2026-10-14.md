# Optimization and Claude integration — 14 October 2026

The user confirmed Claude had finished and authorized this repair pass, then explicitly requested merging
its outstanding branches. The intended inertial, direct, acrobatic flight model is preserved; this pass
does not reintroduce removed aerodynamic systems or retune the shipped controls.

## Integration

Started from `9b4f568`. Merge `483e6ec` brings in all 12 outstanding `perf` commits through `c35752b`:
cached static shadows, batched scenery, cheaper post-processing, cockpit/hook-camera rendering budgets,
refresh-aware dynamic resolution, frame diagnostics and benchmarks. The cockpit instruments, simplified
flight model, skycrane hover fix, cameras and CI changes were already integrated. Ancestry, `git cherry`
and patch comparisons established that controls, cloth, world2 and vercel-ci branches were already
represented. Rotor-wash differences were package-script context only. The old branding branch additionally
contains three raw generated render PNGs (about 7.5 MB); shipped branding and its generators are integrated,
and the intentionally ignored raw duplicates were not added back to source control.

No Claude task was interrupted or messaged. Other browser test processes were discovered on this machine;
only this task's obsolete runner trees were stopped. An independent process pushed some early local fixes
while this pass ran. This task has not pushed: `origin` is the public Moggeth/Helicoptea repository and
master deploys production. User approval is required before this task publishes the remaining commits.

## Repairs

- `fa437a8`: multiply all tuning contributions to each target before applying them. Chinook rotation rate
  and pitch response now compose; group/all resets restore the externally stored world clock.
- `7441550`, `c8a1a6e`: preview owns one animation callback, frees retired Rapier worlds/event queues, and
  disposes unique GPU assets while preserving shared assets. Reset and preview resource soaks cover this.
- `ec7c473`, `77b1a85`: replay saves snapshot metadata/sample counts/revisions; in-flight note/record edits
  remain dirty. Decoding rejects incomplete data. Replay switches release old cargo/debris, ignore stale
  async loads and bound the disk-loaded cache. Recording splits into continuations at its memory budget.
- `d7455b3`: haptic priorities preserve crash/strike pulses; pause, focus loss, disconnect and disabling
  rumble cancel feedback. Unsupported actuators and rejected effects are tolerated.
- `27d976e`: build only the selected cockpit initially, cache others when first needed.
- `492ad4c`: reuse micro-helicopter controller scratch vectors at the 240 Hz simulation rate.
- `11dcddc`, `10bc341`: recordings capture build/physics/tuning/controller settings and tuning changes;
  fatal errors persist in browser localStorage. Load telemetry is clearly labelled a static estimate.
- `f303189`: test runners require their own Vite child to announce readiness before HTTP probing; an
  occupied port can no longer silently test a different checkout.
- `ac50512`: portrait touch actions use five columns instead of overlapping Mark/View and Doors/Hose.
  All three aircraft checked at 320×568, 390×844, 430×932, 844×390 and 1024×768, including bucket controls.

All six findings in `logs/reviews/2026-10-14-code-review.json` were reproduced/revalidated against the
finished source and addressed. Underlying rope constraints still transmit dynamic physical forces; the
displayed historical load channel is only mass × gravity while taut.

## Measured evidence

Same Windows machine, local Chrome/WebGL. Generated artifacts and logs are intentionally ignored.

| Probe | Before | After |
|---|---|---|
| Paused sandbox reset GPU geometry | 346 → 388 over six resets (+7/reset) | 348 throughout 16 resets |
| Rapid preview changes | Six continuing callbacks after six changes | One callback after 20 changes |
| Preview aircraft cycling | Worlds not freed | Old worlds freed; repeated GPU counts stable |
| Replay cargo across eight flight switches | Retained previous flights' meshes | Six bags per flight, zero after leaving |
| Initial micro cockpit meshes | 212 (all interiors) | 56 (selected interior) |
| Median ready time, three fresh browser contexts | 1,088 ms | 1,026 ms (~5.7% reduction) |

Startup comparison is low-quality 1280×720, before the separate Claude performance merge. The first runs
were 1,892 and 1,627 ms respectively; three samples do not establish a universal loading improvement.
Heap readings were noisy and are not claimed as a measured saving. Preview GPU geometry on repeated visits:
micro 121, Chinook 183, skycrane 183; textures 7/9/5, with a one-time micro warm-up allocation.

## Verification and recovery

Run `npm run check`, `npm run build`, then `node tests/run-e2e.mjs --port 4210` on an unused port.
The browser runner discovers `e2e*.mjs`, saves `test-results/e2e-summary.md`, and exits nonzero on failure.
Use `--perf-advisory` only on GPU-less CI; don't hide local functional failures. Resource soaks can be run
alone with `node tests/run-e2e.mjs lifecycle --port 4210`. Touch geometry checks can run with `touch-layout`.
Do not rebuild the shared `dist/` directory during a browser suite. Stop your own preview using its terminal
or owned process ID; never broadly kill Node/Chrome while another task is testing.

The local timing ledger is `logs/reviews/optimization-timings.jsonl`. Detailed test logs are in the same
directory; startup samples in `test-results/startup/`; resource counters are printed by the lifecycle suite.
The prior review's WorkCodex attempt took 14.51 seconds and failed with HTTP 401, "Principal does not have
access to API/Operation". Do not repeat a commission until endpoint authorization has been corrected.

## Lessons and limits

- Idle Claude metadata and an old final response did not prove completion; explicit user confirmation
  resolved that ambiguity. A live test process alone does not authorize stopping another task.
- Two initial browser sweeps were intentionally abandoned (200.69 and 70.58 seconds) when the merge and
  overlapping preview-port ownership invalidated their usefulness. The occupied-port reproduction now
  exits correctly in 0.63 seconds. Use unique ports and verify the serving child.
- Windows `rg` does not expand shell-style path globs. Use `rg --files` to locate files and `rg -g '*.js'`
  against an existing directory, rather than guessed `src/replay/*.js` paths.
- The initial replay regression test had a syntax error; it was fixed immediately, and store checks now
  run in `npm run check`. Keep small async reproductions runnable before scaling up browser verification.
- Phone GPU, physical gamepad/haptic feel, human acrobatic handling, audio quality and VR remain unverified.
  Emulation is not hardware acceptance. No blanket 120 fps claim is made for phones or all settings.
- Server replay header/binary writes are individually replaced, not a transaction across power loss.
  Saved snapshots prevent the reproduced live-recording race but do not promise filesystem durability.
- Shadow caching depends on the installed Three.js renderer internals; revalidate when upgrading Three.
  Multiplayer and new aircraft are outside this repair/integration pass.
