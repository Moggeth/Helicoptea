# Reusable AI game improvement loop

Use this with any game repository. It defines an overnight working method, ready-to-use prompts and a morning handoff. It is not an executable scheduler. Research and evidence limits are in [the accompanying review](AI-GAME-ITERATION-RESEARCH.md).

## Define what should become better

Before a run, fill in this small contract:

| Field | Required decision |
|---|---|
| Player fantasy | What the player should feel and do |
| Core loop | Action, world response, success/failure, retry |
| Preserve | Mechanics, difficulty, art direction and controls that must survive |
| Tonight's outcome | One to three concrete player benefits |
| Excluded scope | Features and systems outside this run |
| Test conditions | Build, seed/scenario, device, resolution, quality preset and input method |
| Evidence | Reproduction, replay/clip, screenshot, measurement and checks appropriate to each change |
| Limits | Wall-clock deadline, available usage/cost budget, maximum concurrent workers |
| Publishing | This project's existing permission and deployment policy |

Anchor visual direction in a few references with reasons: silhouette readability, material response, colour hierarchy, animation rhythm. “AAA” or “Nintendo quality” alone cannot settle whether a change helped. Use references as criteria, not instructions to reproduce protected assets.

## Run the loop

1. **Establish ownership and baseline.** Read project instructions and current handoff. Check running editors/agents and Git state. Save the baseline commit, screenshots, a normal gameplay clip and the targeted benchmark. Use a separate experimental checkout/build when required; never overwrite concurrent user work.
2. **Choose the bottleneck.** Reproduce the most important player problem. Write a hypothesis: “Changing X should improve Y, shown by Z.” Decide acceptance before editing. Prefer a blocked core action over decorative polish.
3. **Make a bounded change.** Keep the implementation small enough to explain and revert independently. For competing aesthetic or feel choices, make two or three alternatives instead of repeatedly replacing the same baseline.
4. **Verify behaviour cheaply.** Run the relevant simulation/unit checks, build, then the affected browser scenario through normal inputs. A test-only teleport can set up a physics case, but cannot prove that a player can navigate to it or operate the controls.
5. **Play and inspect.** Check success, failure, recovery and first-time discoverability. Inspect moving footage for timing and camera behaviour; a screenshot is insufficient. Check audio separately from visuals.
6. **Compare independently.** A fresh reviewer, when delegation is authorized, receives the brief, baseline and candidate in shuffled A/B order where practical. It must cite observations and can return “insufficient evidence.” Without independent review, label the result self-reviewed.
7. **Accept or reject.** Keep changes only when the intended benefit has evidence and mandatory regressions pass. Commit accepted atomic changes. Preserve rejected experiments separately if useful; never reset away unrelated work. Re-run acceptance on the integrated commit.
8. **Repeat or stop.** After three failed attempts on the same issue, record the failure and change approach or move to another authorized item. Stop at the deadline/usage limit or when nothing remains whose benefit can be verified. Reserve the final 15% of the time budget for integration, checks and handoff; this is a proposed operating default, not a research result.

## Quality gates

Keep hard correctness gates separate from subjective quality. A high visual score cannot cancel a crash or broken control.

| Area | Evidence to gather | Acceptance rule |
|---|---|---|
| Core play | Start, primary action, outcome, retry | All required paths work through supported inputs |
| Physics and controls | Repeatable trajectories, response measurements, device tests | Intended inertia remains; no runaway state, stuck input or frame-rate dependency |
| Readability | Same camera/scenario before and after | Goal, interactive targets and action results are distinguishable |
| Feel | Side-by-side moving clips and human feedback | Preserve the brief; untested subjective improvements remain candidates |
| Audio/haptics | Unlock/mute/focus checks, recorded audio where possible, physical device test | Playback or actuator calls alone do not prove audible/tactile quality |
| Performance | Warm runs on named hardware; frame-time percentiles and resource counts | No unexplained regression beyond declared tolerance and measurement noise |
| Durability | Repeated reset/reconnect, save/load, long-session resource checks | No growth trend or stale state attributable to the change |

Measure 120 fps against an 8.33 ms frame budget and 60 fps against 16.67 ms. Report median and tail frame times, resolution, scene and hardware; average fps can hide stutters. Run competing GPU workloads sequentially. Use paired repeated runs for performance claims and label noisy results inconclusive.

Do not allow the worker to silently weaken tests or change the acceptance threshold to make its candidate pass. Legitimate requirement changes need a recorded reason and the appropriate human decision.

## Overnight operation

Use one integrator and, only when authorized, a small number of workers with separate file ownership/checkouts. One shared machine should usually have one performance benchmark owner. A review role needs independence more than it needs dozens of concurrent agents.

Before leaving the run unattended, prove one complete cycle works: build, launch, exercise, capture, judge, commit and recover. Confirm the machine remains available, credentials work, the renderer can capture frames and the process can resume from its durable handoff. Browser disconnection, expired credentials or absent hardware are blockers to the affected checks, not reasons to fabricate a pass.

Use only existing authorized accounts and usage. Do not automatically buy credits, switch to metered APIs, install unknown agent frameworks or broaden external access. Follow project-specific publishing permission; Helicoptea already permits validated production pushes, but that permission does not transfer to another game. Experiments can remain candidate builds until their gates pass.

Each run writes an ignored `logs/iteration/<run-id>/` folder with a manifest, step timings, test results, before/after captures and a concise handoff. Record commit, scenario, seed, build command, device, outcome and elapsed seconds. Keep reusable lessons in versioned project docs. Maintain these three levels of memory:

- Current run: attempted changes, evidence, failed strategies and next step.
- Project: intended feel, architecture, controls, reproducible bugs and acceptance commands.
- Reusable library: validated patterns with context and counterexamples, linked from other games rather than silently modifying them.

The morning report should take a minute to scan: playable URL; three meaningful improvements; before/after clips or measurements; rejected ideas; remaining hardware/taste checks; commit/deployment state; elapsed time and actual usage when available. Do not fill it with the agent's chronological activity log.

## Copyable overnight prompt

```text
Improve this game within the attached run contract. Read its project instructions,
design brief and last handoff first. Preserve the specified fantasy, challenge,
controls and art direction. This request is bounded by the supplied deadline,
scope and usage budget; it does not authorize new spending or external access.

First establish a known-good baseline and demonstrate the verification loop.
Select the highest-impact observable player problem. Record a reproduction,
one improvement hypothesis and its acceptance criteria before editing.

Implement a focused candidate. Run relevant checks and exercise the actual build
through supported player inputs. Capture before/after evidence under matching
conditions. Keep simulation tests distinct from interface and hardware tests.
Never claim physical controls, sound or haptics are verified by mocked inputs.

When independent review is authorized and available, have a fresh reviewer judge
the candidate against the baseline and brief. Give it the artifacts, not your
argument for why the change is good. Otherwise label the review self-reviewed.
Accept only evidenced improvements with required regressions passing. Preserve
the last accepted build. Do not weaken criteria or add unrelated features.

After three unsuccessful attempts on one issue, document why and switch strategy
or move to another in-scope item. Save taste-dependent alternatives for review.
Reserve the last 15% of the time budget for integrated verification and handoff.
Commit scoped accepted changes and publish only under this project's permissions.
End with a playable build, concise evidence, remaining limits, measured timings
and a durable next-step handoff. If blocked, preserve work and report the exact
blocker; do not describe an untested result as complete.
```

## Copyable critic prompt

```text
Judge these builds against the design brief using actual play and supplied
evidence. Do not assume the newer build is better. Check the core action, failure,
retry, readability, control response, camera, audio and relevant performance.
For each finding report: observed behaviour, reproduction, evidence artifact,
player consequence, severity and confidence. Separate bugs from preferences.
Recommend accept, reject or needs human/hardware test. Give at most three
highest-value next changes. If you could not perform a check, say so.
```

## Helicoptea application

Preserve miniature scale, momentum, acrobatic freedom, challenging cargo manipulation, swinging wet bags, forgiving recovery from spectacular crashes, and distinct aircraft. Flight Assist remains an option; do not remove difficulty or add hidden aerodynamic penalties to improve an automated score.

The existing physics checks, browser scenarios, replay/tuning records and resource-soak checks provide much of the foundation. Start with `docs/VERIFICATION.md`, `docs/FLIGHT-LOGS.md` and `docs/OPTIMIZATION-2026-10-14.md`. Brann's Forge also has staged playtest builds and documented hardware limitations; reuse the pattern, without coupling repositories or importing old engine assumptions.

Suggested first run contract: improve the first five minutes of flight without new aircraft or environments. Reproduce startup/audio activation, start/pause/restart, acquire a bag, transport it, dip it, release it and recover from a crash. Check dry versus wet cargo, Assist on/off, low versus high render rate and repeated resets. Keep novice discoverability tests separate from skilled-flight evaluation.

Current physical Steam Controller detection is unresolved: Steam reported a dongle connection, but the ordinary Edge game session still showed no controller after a button press. Steam-launched browser setup and real-device acceptance remain necessary. Do not mark that issue fixed overnight using an emulated pad. Audio activation should be checked with actual supported input paths; controller-only startup must not silently remain muted.

For visual or substantial UI design commissions, follow the user's existing requirement to use verified Claude Opus 5.5 subscription identity in an isolated folder. Codex owns integration and validation. This playbook does not launch that commission or schedule an overnight run by itself.
