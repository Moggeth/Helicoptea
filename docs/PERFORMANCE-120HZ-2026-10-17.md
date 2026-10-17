# S24 Ultra / 120 Hz performance pass — 17 October 2026

Target: 8.33 ms per displayed frame on an S24 Ultra before thermal throttling. Desktop phone emulation
does not establish physical phone acceptance. This independent PR starts at `c251a68`; production and
Claude's checkouts are left alone. Timings and raw evidence live in ignored `logs/reviews/` and
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
and hidden effects. Native matrix methods remain available for warm-up, cloning and explicit posing.

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

Lesson: verify that a computed texture or uniform has a live consumer before optimizing its update
frequency. The first revision throttled the legacy cloth texture; source inspection then showed the
whole producer could safely be removed.
