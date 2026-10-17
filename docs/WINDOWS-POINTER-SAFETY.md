# Windows pointer confinement: 17 October 2026

The pointer was repeatedly dragged into a small invisible rectangle near the top-left of the desktop. The user had reported the same symptom in the Brann’s Forge VR chat on 4 October. That project’s commit `57bb7768ca90ab3effcadf6971176fd8fc493d7c` records headless Chromium native pointer capture as the cause and blocks it in its browser QA launcher.

At the start of this investigation, a separate Claude-owned checkout, `Helicoptea-mkb` (branch `mouse-level`), was running `node tests/run-e2e.mjs --outDir dist-level --port 4296`, PID 72580. Its rotor-wash child PID 29352 had launched headless `chrome.exe` PID 40884 with a disposable Playwright profile and a debugging pipe. The suite continued launching successive browser children during inspection. The game’s mouse-control pointerdown handler calls `requestPointerLock()` when mouse flying is enabled. Those tests imported raw Playwright without the protection already added in Brann’s Forge.

The owned test runner and 14 descendants were stopped after verifying their process-tree ownership and creation times. Normal Chrome/Edge, TeamViewer, MouseMux and voice utilities were preserved. The user subsequently confirmed that the symptom had stopped. This is strong evidence for the test suite as the recurring trigger; no API trace attributing an individual ClipCursor call to a PID was captured. One sampled confinement rectangle belonged to the foreground Edge game’s content area, so that sample alone must not be presented as proof of a hidden test browser’s ownership.

## Prevention and verification

All browser tests, performance scripts and capture tools import Chromium from `tools/browser-safety.mjs`. On Windows it installs an init script in each browser context (including the convenience `browser.newPage()` route), rejecting native pointer-lock requests before navigation or interaction. Frames and subsequent navigations inherit the protection. If injection fails, the context closes and creation fails. Real player browsers and Linux browser acceptance retain their existing behaviour.

`tests/e2e-mouse.mjs` requires real native capture and explicitly skips on Windows. The runner reports it as **skipped**, with the reason, rather than passed. Use an isolated Linux runner for native capture acceptance; do not bypass the guard while the user is working at this desktop.

Run `node --test tests/browser-safety-checks.mjs` (also part of `npm run check`). It checks context/page protection, failure handling, unchanged Linux behaviour, launcher coverage across tests/tools, and real Windows Chromium clicks, frames and navigation. All five checks passed. The focused runner smoke check `node tests/run-e2e.mjs e2e-mouse.mjs --outDir dist --port 4319` correctly reported skipped acceptance and closed its owned preview/browser. The full game suite was deliberately not rerun: this change affects automation, and the previous long suite was the suspected desktop disruption.

## Recovery

Alt-Tab or Escape can release active game pointer capture. If it returns, inspect process command lines for headless Chrome using disposable `playwright_chromiumdev_profile-*` directories, trace the parent Node test/capture runner, and stop only that verified runner tree. Do not kill all browsers, disable hardware drivers or stop remote access based on process names alone. Keep process snapshots and timings under ignored `logs/reviews/`.

## Investigation lessons and measured steps

- The local chat store was 12.43 GiB, including one 7.71 GB Brann’s Forge JSONL. A naive PowerShell parse of matching lines took **76.63 s**; an uncompressed message scan took **43.99 s**. Most older sessions are `.jsonl.zst`, so a plain JSONL scan does not cover all history. Once the exact prior report was found, a focused `git log --grep` (**0.30 s**) and `git show` (**0.11 s**) recovered the fix directly. Prefer thread summaries, incident documents and scoped Git history before parsing giant image-bearing rollouts. Do not claim every archived conversation was read.
- Initial process inspection **0.83 s**; targeted history/process search **1.45 s**; Windows pointer/services inspection **2.76 s**; browser ownership inspection **0.68 s**; current runner inspection **0.64 s**.
- Stop verified runner tree **1.15 s**; inspect target checkout **1.48 s**; inspect canonical checkout **0.21 s**; fetch and fast-forward canonical master **2.46 s**.
- Implement shared test launcher **0.23 s**; initial five safety checks and syntax/diff checks **1.67 s**; extend protection to capture tools and verify skipped-suite reporting **3.07 s**. These are measured tool-step durations, not estimates of total human/agent reasoning time.

The uncommitted gameplay changes in `Helicoptea-mkb` were not staged or changed by this safety fix.
