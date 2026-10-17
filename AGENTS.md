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

### Shared Codex and Claude PR workflow

The user requested a shared PR workflow on 17 October 2026. For new substantial work, use an isolated
worktree and an owned branch (`codex/…` for Codex); do not write into another active agent's checkout.
Fetch and inspect current `origin/master`, branch state and existing PRs first. Open a small PR against
`master`, using `.github/pull_request_template.md`. Draft means unfinished: include remaining checks.

Either agent may review and merge a validated PR under the standing publication permission. Review
the actual diff, comments, checks and latest head revision; refresh the base and resolve conflicts in
the PR branch without force-pushing over somebody else's work. Revalidate affected behavior after
resolving conflicts. Merge only when the current revision's CI is green and the PR has no unresolved
blocking feedback. Do not use admin bypass or turn failing behavior checks into warnings to merge.
Check the resulting production deployment separately: a green Vercel status is not a green test suite.

Both local agents currently use GitHub account `Moggeth`. Record the reviewing agent and evidence in
the PR; this is not a GitHub approval from a separate account. Do not require an independent GitHub
approval unless separate reviewer identities are configured. The stable aggregate check is `CI ready`;
it fails if build/headless checks or any browser job fails or is cancelled. Windows native mouse
capture is explicitly skipped, so green Windows CI does not establish Linux capture acceptance.
Subcontracted Claude commissions retain their existing no-publication boundary.

Read `README.md` and `docs/OPTIMIZATION-2026-10-14.md` for commands, measured results and known limits.
Use an unused test-server port and require the spawned server to announce readiness. Do not rebuild a
shared `dist/` while another browser suite uses it; a separate Vite `--outDir` avoids that conflict.
Keep measured step timings in ignored `logs/reviews/` and meaningful lessons in the handoff documents.

## Windows browser pointer safety

Headless Chromium can capture and confine the real Windows pointer (confirmed 4 October in Brann's Forge, recurred 17 October during Helicoptea QA). Import Chromium from `tools/browser-safety.mjs` in every browser test and capture tool, including direct entry points. Do not use raw `playwright-core` launchers or bypass the guard on the user's Windows desktop. Native capture acceptance belongs on an isolated Linux runner. A stopped runner's browser descendants must also be stopped; identify ownership before termination. See `docs/WINDOWS-POINTER-SAFETY.md`.
