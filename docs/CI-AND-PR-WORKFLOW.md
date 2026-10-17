# Shared PR validation — 17 October 2026

Use an isolated owned branch and worktree, open a scoped PR to `master`, and record the reviewing agent,
revision and evidence. Both local agents use GitHub principal `Moggeth`; a review comment is an audit
record, not a formal independent approval. Required formal approvals are therefore zero.

Master protection requires GitHub Actions app 15368's **CI ready**, an up-to-date base and resolved review
threads, including for administrators. Force pushes and branch deletion are disabled. Auto-merge is
available but must only be requested after reviewing the current revision. Do not bypass failed checks.

CI runs once per PR revision, plus on master pushes and manual dispatch. `CI ready` aggregates build and
headless checks, all discovered Windows browser suites, and native mouse acceptance on isolated Linux.
Windows deliberately skips native capture; its test launcher blocks capture to protect the real desktop.
Vercel previews and production deployments are independent of Actions. Verify the deployment's commit,
status, anonymous HTML/assets and build marker separately after merging.

## Diagnosed failures and faster recovery

- Start-screen operations failed at Playwright's implicit 30-second deadline on the hosted software GPU.
  CI contexts now allow 120 seconds for implicit actions/navigation. Explicit behavioral deadlines stay
  in force. A stuck suite still fails at its runner deadline. The phone memory test forces medium when
  measuring its budget, then separately checks Auto's low software-GPU tier and crash recovery.
- CDP round trips exceeded the double-tap window on the slow renderer. Timestamp the intended trusted
  touch gesture; also assert that taps 700 ms apart do not recenter. Do not lengthen the game's double-tap
  window to accommodate an automation transport delay.
- Run `38990459613` stopped before browser jobs: milk pouring was **1.081 ms/step**, above its absolute
  **1.000 ms** budget. The same local strict run measured **0.683 ms/step**. The candidate and master had
  identical `src` tree hash `8fadc6bf99b2d331045be96be09a4c8e776ecbbd` and identical milk benchmark source.
  This is not evidence of a new runtime regression or a performance improvement. Hosted CI explicitly
  sets `HELICOPTEA_PERF_ADVISORY=1` for only the five CPU timing budgets, consistent with its existing GPU
  timing policy. Overruns emit warnings and step-summary entries; they are never counted as passing
  assertions. Non-finite/negative timings and all behavior/resource assertions remain failures. Ordinary
  local runs stay strict. Performance changes still need matched hardware and repeated before/after
  evidence; a green hosted run does not establish a target frame rate or target CPU budget.
- Batch documentation before freezing the candidate revision. Updating the PR branch repeatedly cancels
  expensive full CI runs. Body/review updates can record evidence without changing the tested revision.
- Run `38991041206` passed the full headless job in **352 s**, with the milk benchmark at **0.819 ms**,
  confirming variation across hosted runs without a gameplay source change. Browser jobs exposed explicit
  60-second startup deadlines overriding the shared CI allowance; `startupTimeout()` now gives only those
  startup waits the same bounded 120 seconds while preserving local values. CI logs browser page errors,
  console errors and renderer crashes so a startup failure is diagnosable rather than just a timeout.
- Linux native capture passed capture, movement and airframe roll, then sampled Escape release after
  300 ms and continued its collective test on a crashed aircraft. Await release/paused state and restart
  the independent collective case. Touch leash input similarly used a 60 ms sleep between CDP moves:
  software-GPU frames could coalesce away the intermediate move. Wait for delivered frames. These are
  test synchronization changes, not changes to the flight or pointer-control implementation.
- The phone context-loss test then waited 120 s for a reload while Auto was already low. The game
  correctly shows an error at its lowest tier. Test that path explicitly. For the separate medium-to-low
  recovery policy case, CI sets the debug quality-name precondition when its real software tier is low;
  the earlier memory case still renders medium quality. Local GPU runs reach medium naturally. This is
  emulated policy coverage, not physical-phone acceptance. Restart independent touch menu/layout cases
  after their flying cases so a legitimate crash does not change which menu a later tap opens.
- The first frame-wait candidate failed locally at the later Help setup. A screenshot showed a healthy
  flying scene, not a crash. Bounded pointer/click tracing showed Pause pointerdown/up with no synthesized
  click after the CDP drag. Increasing/reordering gesture timestamps did not fix that. Keep timestamps
  chronological and no later than wall time. An attempted Help-only setup using game actions/browser
  clicks progressed further but then failed at a later portrait tap, so that workaround was rejected.
  The accepted fix keeps the original 60 ms minimum gesture duration in addition to waiting for input
  frames, and retains actual touch Pause, Resume, Help and portrait-menu taps. All **40 local touch checks
  passed** afterward. Rapid physical-device post-drag taps still need hands-on acceptance; no game-side
  control fix or physical touch acceptance is claimed here.
- Syntax checks alone do not detect a helper used without an import. After a multi-file readiness edit,
  explicitly inspect imports (including compact `{chromium}` spellings) and run those browser suites
  before pushing. The five compact-import suites passed 82 local checks after the readiness refactor.
- A later push was denied as `mitch-dromeda` after another process changed the shared active account.
  Do not switch accounts back and forth across projects. Bind the cached Moggeth token only in this
  child process, verify `gh api user`, and override HTTPS Git's helper for that invocation as described
  in `AGENTS.md`. A prior successful identity check is not sufficient for a long concurrent session.
- Run `38992859905` passed native capture, roll and Escape release, but its later collective sample
  remained at the airframe's initial **0.12**. The test issued a second queued Escape, then restarted
  before the next frame consumed that action. Remove the redundant Escape, require an unpaused fresh
  flight, and await a real climb input and its release instead of fixed 500 ms samples.
- The same run's skycrane pad fixture crashed before measuring reel/pump bindings. Its test autopilot
  was updated once per rendered frame. Update that test PID per physics step, retaining tuning shaping,
  collisions, tank flow and real non-flight input. On local SwiftShader all **34 behavior checks passed**;
  the sole remaining sample was an **11.5 fps** advisory. No aircraft parameters or player code changed.
- A micro rotor crash had **2 blades and 45 shards**, but a later CDP read saw normal **1.00x** world speed
  after the short slow-motion beat had ended. Observe the minimum scale in the existing in-page frame
  instrumentation while the damaged aircraft is still flying. Keep debris/shard thresholds unchanged;
  this tests the actual transient rather than the timing of the automation round trip.
- Run `38994183839`'s Linux job timed out before the start screen (**120 s**), so it did not verify the
  revised collective case. Browser errors were absent from that log; the startup cause was not yet
  established. Native failures now retain loading text, focus/visibility, aircraft/control state and a
  screenshot. CI browsers disable background timer/renderer throttling (as several existing suites
  already did). The self-contained Linux job runs alongside headless checks, rather than waiting for
  them; the aggregate still requires both. Do not describe a pre-start timeout as a control failure.
- Inspection caught an overstrict intermediate mouse-fixture precondition: it waited for **0.8 rotor
  collective**, but the shipped micro's full-up spring level is **0.675** (neutral **0.475**). Require a
  full user command and a positive motor response above that run's idle, then assert the original
  release drop. Do not change aircraft power or spring tuning to satisfy a test's arbitrary percentage.
  Wait for a completed post-restart frame before sending the independent keyboard input.
- The instrumented Linux run then reported **visible**, **focused**, ready/flying, and **Loaded in
  120.4 s** just after its 120 s startup timeout. The screenshot capture also timed out, so the artifact
  contained only the summary; do not claim an image was inspected. Give only this Linux native test's
  cold start 180 s. Its climb/release checks keep 5 s deadlines, Windows startup waits stay at 120 s,
  and failure snapshots distinguish an active error screen from its placeholder message.
- The next Linux snapshot reached the controls: user collective **1.0**, motor collective **0.675**,
  unpaused/flying, no error screen. The idle-relative increase was an invalid precondition for that
  sampled state. Extract the independent keyboard case, clear old fixture inputs, compare against the
  configured neutral and require a full user command. Require release to settle at/below neutral as
  well as the original drop. The native suite and a standalone Windows-safe keyboard suite share this
  exact helper, so it can be played without enabling native Windows capture. Local SwiftShader passed
  both checks in **22 s**, measuring **0.675 → 0.475**, with no page errors.

## Inspection and recovery

Use `gh pr view <number> --json headRefOid,mergeable,mergeStateStatus,statusCheckRollup` and inspect the
exact head's run. Download failed job logs rather than rerunning blindly. Resolve actual conflicts in
the owned branch, then rerun affected checks and require fresh aggregate CI. Keep measured timings and
raw logs under ignored `logs/reviews/`; local suites use isolated build outputs and unused ports.
To reproduce software-GPU policies locally, set `HELICOPTEA_SOFTWARE_GL=1` in the child process and run
the relevant suite through the normal runner. The shared launcher selects SwiftShader while retaining
the Windows pointer guard. This emulates software rendering; it does not reproduce the hosted WARP
driver or establish physical-device performance. Unset the variable for ordinary hardware checks.

The three completed Helicoptea Codex automations were checked and remain paused. They are historical
overnight/integration jobs, not PR monitors. No recurring reviewer was silently created.
