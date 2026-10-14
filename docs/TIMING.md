# Timing record

All times local (AEDT), 2026-10-13. One continuous session by Claude.

| Time | Work |
|---|---|
| 20:05 | Inspected the folder (empty Git repo created earlier, no instruction files), installed Three.js, Rapier, Vite |
| 20:10–20:25 | Config, layout, static colliders, flight model, tea bag/string/liquid, sim orchestration, autopilot, headless checks |
| 20:25–20:32 | Fixed impact detection, rope reel-in, hook offset; headless checks 29/29 |
| 20:32–20:40 | Textures, models, kitchen, tea shader, particles, string tubes, camera, view, input, audio, HUD, onboarding, main loop, debug overlay |
| 20:40–20:50 | First browser run; Chrome e2e harness; fixes to debris clones, explosion look, assist integrator, mobile layout, stale dev-server cache; e2e 37/37, physics 31/31 |
| 20:50–20:55 | Throttled performance runs, README and docs |
| 21:05–21:25 | Full controller support: new gamepad layer (any mapping, bind wizard, settings, rumble), pad-driven menus, Steam Controller guide, 13 new browser checks |
| 21:35–22:45 | Stable/dev split (4178 stable, 5178 dev, 4179 tests); GTAO; rotor-downwash air field and its consumers (cloth, tea, bags, strings, steam, dust, flowers, buffeting); realistic helicopter model; wreck-on-pad fix; performance pass |
| 22:45–23:55 | Heavy retune v1 (lag/slew, 0.55x world); Chinook merge and its heavy retune merge; v2 retune per feedback: instant thrust, low drag rocket drift, 0.7x world; Chinook phugoid fix; string pinning; tests retuned |

### 2026-10-14: flight tuning board

| Time (AEDT) | Work |
|---|---|
| 12:10–13:20 | Knob registry, tuning state (base × global × per-aircraft into CFG), board UI with tabs, groups, presets, export/import |
| 13:20–14:40 | Live side-by-side preview rig, scripted pilot, scenarios; first screenshots |
| 14:40–15:50 | Making every clip fly at both ends of every range on every aircraft: assist-flown skycrane clips, rate-aware altitude hold, ceiling/wall/table guard, bare preview world; headless and browser tests; docs |
| 15:50–16:05 | Merges in between (Vercel CI, tablecloth, controller layouts, rotor wash, crashes), rebases, full suites |

### 2026-10-14: Codex optimization and merge

Measured elapsed seconds, not estimated work durations. Full local ledger:
`logs/reviews/optimization-timings.jsonl`. See [handoff](OPTIMIZATION-2026-10-14.md) for outcomes and lessons.

| Material step | Seconds | Outcome |
|---|---:|---|
| Initial review: rejected WorkCodex commission | 14.51 | HTTP 401; not retried without authorization repair |
| Resource-fix production build | 2.70 | Passed |
| Startup baseline, three contexts | 4.84 | Captured before measurements |
| Lazy cockpit build and three contexts | 7.15 | Median ready time 1088 → 1026 ms |
| Cockpit and lifecycle browser checks | 49.15 | Passed |
| Pre-merge full headless checks | 80.58 | Passed |
| Flight scratch-vector manoeuvre checks | 3.57 | 14 passed |
| Replay lifecycle build/browser regression | 7.44 | Passed |
| Pre-merge browser sweep, abandoned | 200.69 | New merge required rebuilt baseline |
| Branch ancestry and patch equivalence | 3.07 | Outstanding perf branch identified |
| Merged production build | 2.96 | Passed |
| Duplicate browser sweep, abandoned | 70.58 | Shared port ownership discovered |
| Occupied-port regression | 0.63 | Expected rejection, exit 1 |
| Source-CSS touch layout checks | 3.17 | 15 passed |
| Isolated pre-perf-merge archive/build | 3.86 | Baseline built without modifying active checkout |
| Final merged full headless checks | 101.43 | 489 passed; other browser tasks active |
| Explicit bounded wait during browser acceptance | 30.01 | Suite continued; no processes interrupted |
| Final combined browser acceptance | 840.94 | 538 passed across 13 suites |
| Final isolated production build | 2.80 | Passed; shared dist preserved for other tests |
| Touch runner against old shared dist | 4.39 | Nine expected old-layout failures; final-build URL required |
| Final production touch geometry checks | 3.03 | 15 passed |
| Before-merge 1080p render comparison | 17.33 | Captured workload counts; timing contended |
| Final merged 1080p render comparison | 15.51 | 39–49% fewer calls in two sampled views; timing contended |
| Second bounded acceptance wait | 30.02 | Suite finished successfully |

### 2026-10-14: performance pass

| Time (AEDT) | Work |
|---|---|
| 16:10–16:40 | Worktree, frame stats, benchmark, 4K baseline (37–62 fps uncapped, 55–115 synced) |
| 16:40–17:30 | AO pipeline, shadow once per frame, shadow cache, vase glass, Ultra tier; vsync measurement; rebases onto 86eb316 and cf8d54e |
| 17:30–19:00 | Phone-path profiling: allocations, matrices, layout reads, shader-variant swaps, draw-call merges; F2 readout; dynamic resolution; suites; rebases onto 25e6222 and fa437a8; final measurements |
