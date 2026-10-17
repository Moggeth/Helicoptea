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

## Inspection and recovery

Use `gh pr view <number> --json headRefOid,mergeable,mergeStateStatus,statusCheckRollup` and inspect the
exact head's run. Download failed job logs rather than rerunning blindly. Resolve actual conflicts in
the owned branch, then rerun affected checks and require fresh aggregate CI. Keep measured timings and
raw logs under ignored `logs/reviews/`; local suites use isolated build outputs and unused ports.

The three completed Helicoptea Codex automations were checked and remain paused. They are historical
overnight/integration jobs, not PR monitors. No recurring reviewer was silently created.
