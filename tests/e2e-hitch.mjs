// Hitch checks: plays the moments where something happens for the first time or all at once (every camera,
// a dip, the milk bucket, the skycrane's pump, crashes, menus, replay, switching aircraft) with the
// browser's normal frame pacing, and fails on
//   - any shader compiled mid-flight (each one froze the game for 100-300 ms; everything a flight can show
//     is compiled while loading, and a newly picked aircraft's cockpit in the background), and
//   - long frames: a frame with over 50 ms of the game's own main-thread work, or more than two over 33 ms.
// Frame-time checks are named "ms a frame" so a GPU-less CI runner reports them as advisory; the compile
// check holds everywhere.
//
//   node tests/e2e-hitch.mjs [baseUrl] [--headed]      (tests/run-e2e.mjs runs it with the other suites)
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { playAircraft } from './hitch-lib.mjs';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4186/';
const outDir = path.resolve('test-results/hitch');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const checks = [];
const check = (name, ok, detail = '') => { checks.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const browser = await chromium.launch({
  executablePath: CHROME, headless: !process.argv.includes('--headed'),
  args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
});
const runs = [];
try {
  for (const run of ['micro', 'chinook', 'skycrane']) {
    const r = await playAircraft(browser, base, run, { size: [1280, 720], quality: 'high', quick: true, glTiming: false });
    runs.push(r);
    check(`${run}: plays through without errors`, r.errors.length === 0, r.errors.slice(0, 3).join(' | '));
    // Picking an aircraft compiles its cockpit in the background (parallel compile): that is allowed.
    const mid = r.newPrograms.filter((p) => !p.label.startsWith('switch to'));
    check(`${run}: no shader compiled mid-flight`, mid.length === 0,
      mid.length ? mid.slice(0, 4).map((p) => `[${p.label}] ${p.name || p.key.slice(0, 40)} ${p.owners[0] || ''}`).join(' | ') : `${r.all.frames} frames`);
    // Long frames, by the game's own main-thread CPU time per frame (from a Chrome trace): on a busy machine
    // wall-clock frame times also count time the browser was descheduled or queued behind other GPU work.
    // The step that switches aircraft (building it) is excluded.
    const heavy = r.cpu.worst.filter((w) => !w.label.startsWith('switch to'));
    const worst = heavy[0] || { cpu: 0, label: '-' };
    const over33 = heavy.filter((w) => w.cpu > 33);
    check(`${run}: no frame over 50 ms a frame of game work`, worst.cpu <= 50, `worst ${worst.cpu} ms CPU [${worst.label}], median ${r.cpu.medCpu} ms over ${r.cpu.frames} frames`);
    check(`${run}: at most 2 frames over 33 ms a frame of game work`, over33.length <= 2, over33.slice(0, 6).map((w) => `${w.cpu} ms [${w.label}]`).join(', ') || `99th percentile ${r.cpu.p99Cpu} ms`);
    // Wall-clock frame times for the report (not checked: see above).
    console.log(`      wall clock: ${r.all.fps} fps, 1% low ${r.all.low1} fps, worst ${r.all.worstMs} ms`);
  }
} finally {
  await browser.close();
  fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify({ base, when: new Date().toISOString(), checks, runs }, null, 1));
}
if (checks.some((c) => !c.ok)) process.exitCode = 1;
