# S24 Ultra / 120 Hz performance pass — 17 October 2026

Target: 8.33 ms per displayed frame on an S24 Ultra before thermal throttling. Desktop phone emulation
does not establish physical phone acceptance. This independent PR starts at `c251a68` and incorporates
current master through `f2ad39d`; changes are delivered on `codex/s24-120hz` for review. Timings and raw evidence live in ignored `logs/reviews/` and
`test-results/perf/` in the `s24-120hz` worktree.

## Avoid work that cannot affect the frame

The kitchen outwash grid used to run at 60 Hz whenever any rotor wake existed, including on the other
side of the neighbourhood. Wake columns and table outwash now have separate activity: a wake outside
the table remains available to grass, cargo and liquid, while the table solver sleeps after residual
gusts decay. The old cloth texture encoding has been removed: a consumer search proved that no shader
reads those uniforms; the current cloth samples the CPU air field directly. This removes 2,400 pixel
encodings per rendered frame and an unused texture/material set. The grid revision remains a diagnostic
counter. `node --test tests/performance-checks.mjs` verifies exterior wake
sampling, no empty-grid solves, table wake-up, residual settling and clear invalidation.

The baseline instrumented pad scene visited about 1,300 matrices and produced four DOM mutations per
frame. Baseline phone-viewport samples cover micro and skycrane, house/garden and chase/cockpit at
430×932 CSS pixels, DPR capped at 1.5, medium touch quality, fixed resolution and recording disabled.
The machine reports an RTX 3080 Ti. Work counts are stronger evidence than short uncapped FPS samples
when other browser suites may be running on this shared desktop.

## Scene and vertex work

Opaque static kitchen pieces sharing a material and render flags are merged with their original indexed
geometry. Cups, the swinging pendant, cloth and moving flowers stay separate; transparent/refraction
meshes retain their ordering. No triangle or authored material is simplified. A visible-only matrix
walk follows Three r169's transform rules and skips explicitly frozen world chunks, hidden aircraft
and hidden effects. The separate cockpit scene uses the same walk, so previously selected cached
interiors stop taking transform work. Native matrix methods remain available for warm-up, cloning and
explicit posing.

Grass vertices masked to zero density, or conservatively outside the current render camera, collapse
to their root before doing gust/wake/bend/lighting calculations. The bound includes tall bent flowers;
the hook camera uses its own matrices. Existing grass density, shape and draw distances are retained.
Regression checks cover indexed batching, material identity, dynamic exclusions, frozen branches and
newly revealed children with moved/scaled parents. Run the rotor-wash browser suite for cloth, tea and
grass interaction acceptance.

All three aircraft's rigid-part mergers and first-person shadow proxies now retain indexed vertex
reuse. The old mergers expanded shared sphere/tube vertices into triangle soup. Positions, normals,
UVs, materials and triangle order stay identical; the regression compares the expanded attributes
exactly. Temporary merge geometries are released after the merged geometry has been built.

## HUD and extra cameras

Unchanged hook/drop labels, debug visibility, flash opacity and tank text retain their DOM nodes. Touch
aircraft/cargo buttons update on mode transitions. Cup projection objects are reused, and only cups with
an active steep label are projected. The hook camera's world cull/restore now runs only when it actually
draws; at a 120 Hz phone refresh it is limited to its existing 15 Hz cadence. Failed renders restore the
render target, shadow settings and world visibility. The inset's projection matrix changes only on resize.

`tests/e2e-performance.mjs` checks idle DOM mutation counts, hidden-aircraft matrix work, kitchen batches,
all three cockpit switches, and hook-camera culling cadence using work counts instead of GPU-dependent FPS.

Idle strings now keep their geometry version unchanged, letting the shadow cache recognize still
strings. Motion and pumping-hose radius changes still rebuild the tube; its five ring angles are
precomputed. Empty particle pools skip integration and rendering; active pools upload the live prefix
of each buffer rather than their full capacity. These paths have direct geometry/version/range tests.

## Liquid and refresh budgets

The ripple solver caches each rotor footprint until its position, width or blade count changes. Its
rotating lobe uses the cosine difference identity, so trigonometry is computed per rotor/substep instead
of per forced cell. Frames without a fixed wave step do not encode/upload an unchanged field. Tests
compare forcing against the analytic formula for 2, 3 and 6 blades and retain the existing dimple,
volume, boundedness, ringing and settling checks. The wave grid and 240 Hz integration remain intact.

Dynamic resolution now uses the fastest observed display cadence when GPU timer queries are unavailable,
instead of a fixed 19.5 ms slowdown threshold. A rendering-limited 16.7 ms frame can therefore request
less pixel work after 120 Hz has been observed. Simulation/UI-bound frames retain their resolution,
and an explicit frame cap (including 30 Hz Battery saver) sets the effective target. The browser cannot
reliably discover a display mode the game has never reached; physical S24 acceptance must check that
Chrome and Android actually provide 120 Hz, as well as GPU time and thermals.

Measurement lessons: benchmark serially, with no acceptance suite sharing its GPU window. The first
candidate sample overlapped the rotor-wash suite and is retained only as diagnostic evidence. Wait for
the loading screen's 500 ms dismissal before asserting zero idle DOM mutations; the first work-count
run caught that one legitimate lifecycle mutation, then passed after the fixture waited for it.

The shadow cache now always updates its camera key when classifying changed casters. Previously the
short-circuited expression skipped that update and could rebuild static shadows again on the next frame.

## Reproducing measurements

### Acceptance and remaining device work

The final integrated build took **5.16 s**. The four serial browser suites completed in **170.68 s**:
cockpit **41/41**, performance work counts **12/12**, phone memory/recovery **14/14**, and skycrane
**35/35**. The 4× CPU-throttled landscape cockpit measured **40 fps** (38/44/40), and the phone GPU
inventory was **91 MB** live/peak. These are RTX 3080 Ti desktop results using touch emulation and the
upstream phone renderer; they do not measure an S24. In the final work-count fixture the scene visits
554 transforms/frame, with zero hidden-aircraft transforms, zero idle DOM mutations, and zero transform
updates across 222 nodes in three cached inactive interiors.

Before the final phone-renderer merge, a separate complete main-game browser run passed **52/52** in
**171.89 s**. A larger earlier sweep retained 474 passing assertions and one cockpit performance failure
before a tool-runtime interruption stopped the runner; it is not a completed green suite. The same
cockpit suite now passes above after integration. The earlier full Node check passed in **175.36 s**;
the final complete Node recheck also passed in **198.65 s** (1,012 plain PASS lines plus 22 Node tests:
17 performance and five browser-safety checks). No timing thresholds were relaxed. The tracked paired
liquid benchmark command passed in **4.04 s** and reproduced the solver reduction below.

Hosted checks at `92b6d88` were not green: push run `39003572656` hit the existing real-Windows pointer
test's 30-second timeout; PR run `39003570867` passed that guard but failed the existing simulation
timing assertion at 1.100 ms versus its 1.000 ms limit. Functional performance assertions passed.
[PR #1](https://github.com/Moggeth/Helicoptea/pull/1) independently addresses hosted action deadlines
and explicit CPU-budget reporting; this PR does not duplicate or relax those controls. Do not repeatedly
rerun full hosted matrices to chase variable runner speed. Inspect the failed assertion and keep local
limits strict. Local browser suites use the pointer guard and never request native Windows capture.

Physical acceptance remains open: `adb devices -l` found no authorized device. Use the PR's Vercel
preview (Vercel sign-in required), add `?fpsmeter=1`, enable the phone's 120 Hz display mode, and check
all three aircraft in chase/cockpit in both the house and neighbourhood. Record the initial refresh,
CPU/GPU/frame timing and resolution, then repeat after thermal throttling. Preserve recording-on and
Battery saver checks. Emulated high FPS and a narrow screenshot do not establish physical acceptance.

### Current-master integration

While this PR was under test, Claude's `f2ad39d` landed on master. Its Lambert/Phong phone materials,
disabled phone shadow maps, BatchedMesh renderer and background target warm-up are upstream work, not
results of this PR. The earlier 12-scene and geometry comparisons above used the pre-phone-renderer
baseline `c251a68`; do not attribute the current master's shader/load/draw reductions to this PR.
The merge retains that phone path and runs its batch synchronization after the visible matrix update.

Integration found and fixed four phone-path issues:

- An empty regex alternative matched **every** custom material hook, including functional wet-paper
  shading. Only the explicitly cosmetic grime/sway/world-kit hooks are now dropped.
- Float32 snapshots compared against double-precision world matrices repeatedly marked stationary
  instances dirty. Double snapshots eliminate those false matrix uploads; 120 unchanged frames of two
  nontrivially rotated/translated instances now issue zero uploads, and a real move issues one.
- First-person invisible materials and restoration of already-converted original materials no longer
  permanently eject airframe members from their batches. Genuine replacements still draw independently.
- Dynamic vertex buffers remain live rather than being copied once into an immutable batch, including
  the skycrane's changing milk sight-glass levels.

The 4× CPU landscape cockpit threshold also failed on the untouched pre-phone-renderer baseline in a
fixed-resolution reproduction. A direct-to-screen alternative and deferred sky rendering did not show
a reliable gain, so neither was adopted. Keep the existing target/sky paths; use the new phone renderer
and physical-device profiling before repeating those experiments. One test fixture initially compared
layer 31 with JavaScript's signed `1 << 31`; Three stores an unsigned mask, so the assertion uses `2 ** 31`.

Measured geometry inventory (all three airframes are constructed; each unique geometry counted once,
including hidden source parts/effects; exact triangle counts are unchanged):

| Aircraft | Vertices before → after | Attribute/index bytes before → after |
|---|---:|---:|
| Micro | 60,637 → 49,861 (18% fewer) | 2,121,872 → 1,813,220 (15% fewer) |
| Chinook | 145,077 → 74,406 (49% fewer) | 4,903,404 → 2,823,156 (42% fewer) |
| Skycrane | 92,483 → 66,262 (28% fewer) | 3,162,772 → 2,413,484 (24% fewer) |

Seven interleaved CPU samples per scenario (40×40 grid, 600 measured frames at 120 Hz, 100 warm-up frames):
the final tracked-command rerun measured stationary 2/3/6-blade forcing falling from
0.0763/0.0777/0.0798 ms to 0.0366/0.0364/0.0373 ms per frame (52–53% less). Footprints moving at 60 Hz
fell from 0.0769/0.0780/0.1079 ms to 0.0534/0.0550/0.0759 ms (29–31% less). The earlier paired run
measured 53–54% and 28–31% respectively. These are desktop Node CPU measurements, not phone timing guarantees.

The final two 12-scene browser samples used 412×891 CSS pixels, DPR 3.5 capped by medium touch quality to
1.5, dynamic resolution off and recording **on**. They took 97.82 s and 97.24 s. Two other Helicoptea
acceptance runners became active during the baseline. Their changing CPU/GPU load makes timing speedup
claims invalid: candidate FPS ranged 204–700, but several candidate scenes were slower than the earlier
baseline windows. Raw results are `baseline-final-recording.json` and `candidate-final-recording.json`.
Average calls fell by 2–11 per scene; geometry inventory and isolated solver samples are stronger evidence.

Three generated screenshots were visually inspected: touch micro cockpit, skycrane cockpit and Chinook
flight beside the kitchen/garden door. Materials, scenery, instruments, grass and insets remained present.

Build each revision into a separate output directory, start an unused strict-port preview and wait for
that process's readiness banner. Do not rebuild an output while a suite or benchmark is reading it.
Run browser measurements serially. Example for a running candidate preview:

```powershell
node tests/perf-bench.mjs http://127.0.0.1:4474/ --size 412x891 --dpr 3.5 --quality medium --touch --record 1 --ms 4000 --settle 2000 --out candidate-phone
node tests/perf-liquid.mjs --baseline=c251a68
node tests/run-e2e.mjs e2e-performance.mjs --outDir scratch/final-dist --port 4475
```

The browser benchmark averages complete frame draw calls/triangles, includes their min/max call counts,
and records all three aircraft's geometry vertices, triangles and attribute/index bytes. A final-frame
snapshot is unsuitable because shadows and the hook camera draw intermittently. `--record 1` measures
normal flight recording; the existing default `--record 0` remains available for isolated rendering.
The liquid benchmark takes seven interleaved baseline/candidate samples for each blade count with
stationary and 60 Hz moving footprints, after warm-up, at a 120 Hz frame cadence. It reads the baseline
module from Git into ignored scratch storage and saves results in `test-results/perf/`.

Lesson: verify that a computed texture or uniform has a live consumer before optimizing its update
frequency. The first revision throttled the legacy cloth texture; source inspection then showed the
whole producer could safely be removed.

Git lesson: another task can change the globally active GitHub account while this work is running.
Pin the verified project account's existing token in each child process and use `gh auth git-credential`
for that process's Git operation. A push originally failed with HTTP 403 after the global account
changed; the pinned Moggeth credential succeeded without changing anyone else's auth state. Never log
the token. Preserve other tasks' servers and identify process ownership before stopping previews;
PIDs can be reused after a runtime restart.
