# S24 Ultra / 120 Hz performance pass — 17 October 2026

Target: 8.33 ms per displayed frame on an S24 Ultra before thermal throttling. Desktop phone emulation
does not establish physical phone acceptance. This independent PR starts at `c251a68`; production and
Claude's checkouts are left alone. Timings and raw evidence live in ignored `logs/reviews/` and
`test-results/perf/` in the `s24-120hz` worktree.

## Avoid work that cannot affect the frame

The kitchen outwash grid used to run at 60 Hz whenever any rotor wake existed, including on the other
side of the neighbourhood. Wake columns and table outwash now have separate activity: a wake outside
the table remains available to grass, cargo and liquid, while the table solver sleeps after residual
gusts decay. A grid revision lets the view encode/upload its texture only after a solve or clear,
rather than every rendered frame. `node --test tests/performance-checks.mjs` verifies exterior wake
sampling, no empty-grid solves, table wake-up, residual settling and clear invalidation.

The baseline instrumented pad scene visited about 1,300 matrices and produced four DOM mutations per
frame. Baseline phone-viewport samples cover micro and skycrane, house/garden and chase/cockpit at
430×932 CSS pixels, DPR capped at 1.5, medium touch quality, fixed resolution and recording disabled.
The machine reports an RTX 3080 Ti. Work counts are stronger evidence than short uncapped FPS samples
when other browser suites may be running on this shared desktop.
