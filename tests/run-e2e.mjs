// Runs every browser suite (tests/e2e*.mjs, found by name, so new suites join automatically) one after
// another against a single `vite preview` of the current dist/ build, then prints and saves a summary.
//
//   npm run build && npm run e2e                 every suite
//   node tests/run-e2e.mjs replay static         only suites whose name contains one of these words
//   options: --port 4199          preview port
//            --timeout 12         minutes before a suite is stopped and counted as failed
//            --dir tests          where to look for e2e*.mjs
//            --perf-advisory      frame-rate checks report as warnings, not failures (CI: no GPU)
//            --headed             passed through to the suites
//
// Each suite exits non-zero when any of its checks fail. With --perf-advisory, a suite whose only failures
// are frame-rate checks (name mentions "frame rate" or "fps") counts as passed with a warning, because a
// hosted CI runner renders WebGL in software and measures the runner, not the game. Those warnings are
// listed in the summary (and as GitHub annotations); on a real machine they fail as usual.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const port = parseInt(opt('port', '4199'), 10);
const perfAdvisory = args.includes('--perf-advisory');
const headed = args.includes('--headed');
const words = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--port', '--timeout', '--dir'].includes(args[i - 1])));
const SUITE_TIMEOUT = parseFloat(opt('timeout', '12')) * 60 * 1000;   // a stuck suite fails instead of hanging the run
const dir = opt('dir', 'tests');
const PERF = /frame rate|\bfps\b/i;
const gh = !!process.env.GITHUB_ACTIONS;

const suites = fs.readdirSync(dir).filter((f) => /^e2e(-[\w-]+)?\.mjs$/.test(f)).sort()
  .filter((f) => !words.length || words.some((w) => f.includes(w)));
if (!suites.length) { console.error(`No suites match ${words.join(' ')}`); process.exit(1); }
if (!fs.existsSync('dist/index.html')) { console.error('dist/index.html missing: run npm run build first'); process.exit(1); }

// ---------------------------------------------------------------- preview server
const vite = path.resolve('node_modules/vite/bin/vite.js');
const preview = spawn(process.execPath, [vite, 'preview', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let previewLog = '';
preview.stdout.on('data', (d) => { previewLog += d; });
preview.stderr.on('data', (d) => { previewLog += d; });
const base = `http://127.0.0.1:${port}/`;
const stop = () => { try { preview.kill(); } catch { /* already gone */ } };
process.on('exit', stop);
for (let i = 0; ; i++) {
  // An unrelated server may already own the port. Wait for OUR Vite child to announce readiness;
  // a successful HTTP probe alone would silently test another checkout or an older build.
  try { if (previewLog.includes('Local:') && (await fetch(base)).ok) break; } catch { /* not up yet */ }
  if (i > 120 || preview.exitCode !== null) { console.error(`preview server did not start on ${base}\n${previewLog}`); process.exit(1); }
  await new Promise((r) => setTimeout(r, 250));
}
// Which WebGL renderer the suites will get (same Chrome and flags as they use): on a GPU-less CI runner
// this shows the software fallback, which explains its frame rates.
let gpu = 'unknown';
try {
  const { chromium } = await import('playwright-core');
  const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
  const b = await chromium.launch({ executablePath: CHROME, headless: !headed, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const p = await b.newPage();
  gpu = `${b.version()} · ` + await p.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no WebGL2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  await b.close();
} catch (err) { gpu = `browser check failed: ${String(err.message).split(String.fromCharCode(10))[0].trim()}`; }
console.log(`browser ${gpu}`);
console.log(`preview ${base} · ${suites.length} suites: ${suites.join(', ')}${perfAdvisory ? ' · frame-rate checks advisory' : ''}\n`);

// ---------------------------------------------------------------- suites
function run(file) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(dir, file), base, ...(headed ? ['--headed'] : [])], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let out = '';
    const tee = (stream) => (d) => { out += d; stream.write(d); };
    child.stdout.on('data', tee(process.stdout));
    child.stderr.on('data', tee(process.stderr));
    const timer = setTimeout(() => { out += `\nTIMEOUT after ${SUITE_TIMEOUT / 60000} min\n`; child.kill(); }, SUITE_TIMEOUT);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const lines = out.split(/\r?\n/);
      const fails = lines.filter((l) => l.startsWith('FAIL')).map((l) => l.replace(/^FAIL\s+/, ''));
      const passes = lines.filter((l) => l.startsWith('PASS')).length;
      resolve({ file, code: code ?? (signal ? 1 : 0), fails, passes, secs: (Date.now() - t0) / 1000, timedOut: out.includes('\nTIMEOUT after') });
    });
  });
}

const results = [];
for (const f of suites) {
  console.log(`\n========== ${f} ==========`);
  const r = await run(f);
  const perfOnly = r.fails.length > 0 && r.fails.every((l) => PERF.test(l.split('  — ')[0]));
  r.status = r.code === 0 && !r.fails.length ? 'passed' : perfAdvisory && perfOnly && !r.timedOut ? 'perf-warning' : 'failed';
  results.push(r);
}
stop();

// ---------------------------------------------------------------- summary
const esc = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const icon = { passed: '✅', 'perf-warning': '⚠️', failed: '❌' };
let md = `## Browser suites\n\nBrowser: ${gpu}\n\n| suite | result | checks | time |\n|---|---|---|---|\n`;
for (const r of results) md += `| ${r.file} | ${icon[r.status]} ${r.status}${r.timedOut ? ' (timeout)' : ''} | ${r.passes} passed, ${r.fails.length} failed | ${r.secs.toFixed(0)} s |\n`;
const warn = results.filter((r) => r.status === 'perf-warning');
const bad = results.filter((r) => r.status === 'failed');
if (warn.length) md += `\n### Frame-rate checks below target on this machine (advisory here)\n\n${warn.flatMap((r) => r.fails.map((l) => `- ${r.file}: ${l}`)).join('\n')}\n`;
if (bad.length) md += `\n### Failures\n\n${bad.flatMap((r) => r.fails.length ? r.fails.map((l) => `- ${r.file}: ${l}`) : [`- ${r.file}: exited ${r.code} without a FAIL line (crash or timeout; see the log)`]).join('\n')}\n`;
fs.mkdirSync('test-results', { recursive: true });
fs.writeFileSync('test-results/e2e-summary.md', md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
if (gh) {
  for (const r of warn) for (const l of r.fails) console.log(`::warning title=${r.file} frame rate::${esc(l)}`);
  for (const r of bad) for (const l of r.fails.length ? r.fails : [`exited ${r.code}`]) console.log(`::error title=${r.file}::${esc(l)}`);
}
console.log(`\n${md}`);
process.exit(bad.length ? 1 : 0);
