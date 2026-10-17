# Helicoptea project agreements

## Standing publication permission

On 14 October 2026, the user explicitly authorized pushing validated Helicoptea commits to GitHub and
triggering the production deployment without asking again. This applies to the existing public
`Moggeth/Helicoptea` repository and its `master` production branch, overriding the general requirement to
ask before publishing to a public repository for this project.

Continue to validate changes, preserve unrelated work, verify the GitHub account and remote, commit
scoped changes, push safely without force, and check deployment status. This permission does not extend
to unrelated projects or changes to credentials, billing or repository visibility.

## Verification and handoff

Read `README.md` and `docs/OPTIMIZATION-2026-10-14.md` for commands, measured results and known limits.
Use an unused test-server port and require the spawned server to announce readiness. Do not rebuild a
shared `dist/` while another browser suite uses it; a separate Vite `--outDir` avoids that conflict.
Keep measured step timings in ignored `logs/reviews/` and meaningful lessons in the handoff documents.

## Windows browser pointer safety

Headless Chromium can capture and confine the real Windows pointer (confirmed 4 October in Brann's Forge, recurred 17 October during Helicoptea QA). Import Chromium from `tools/browser-safety.mjs` in every browser test and capture tool, including direct entry points. Do not use raw `playwright-core` launchers or bypass the guard on the user's Windows desktop. Native capture acceptance belongs on an isolated Linux runner. A stopped runner's browser descendants must also be stopped; identify ownership before termination. See `docs/WINDOWS-POINTER-SAFETY.md`.
