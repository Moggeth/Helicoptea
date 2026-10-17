// Hitch profiler: plays through the parts of the game where something happens for the first time or all at
// once (start, every camera, a dip, the milk bucket, the skycrane's pump, each crash, menus, replay, switching
// aircraft) and logs every long frame with what was going on: the CPU split (sim / update / render), shader
// programs compiled, geometries and textures uploaded, a heap drop (garbage collection) and the sim events
// of that frame. Averages hide hitches; this looks only at the slow frames.
//
//   npm run build && npx vite preview --port 4186, then
//   node tests/perf-hitch.mjs [baseUrl] [--size 1920x1080] [--quality high] [--only micro,skycrane] [--out name] [--quick] [--vsync] [--headed]
//
// Writes test-results/perf/<out>.json with every scenario's frame-time summary and its slowest frames.
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { playAircraft } from './hitch-lib.mjs';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args[i + 1] : d; };
const base = args.find((a) => a.startsWith('http')) || 'http://127.0.0.1:4186/';
const [W, Hh] = opt('size', '1920x1080').split('x').map(Number);
const quality = opt('quality', 'high');
const only = opt('only', '');
const outName = opt('out', `hitch-${W}x${Hh}-${quality}`);
const extra = opt('query', '');
const outDir = path.resolve('test-results/perf');
fs.mkdirSync(outDir, { recursive: true });
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));


const browser = await chromium.launch({
  executablePath: CHROME, headless: !args.includes('--headed'),
  args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', ...(args.includes('--vsync') ? [] : ['--disable-gpu-vsync', '--disable-frame-rate-limit']), '--enable-precise-memory-info',
    '--autoplay-policy=no-user-gesture-required',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', `--window-size=${W},${Hh}`],
});

const report = { base, size: `${W}x${Hh}`, quality, when: new Date().toISOString(), runs: [] };
for (const run of ['micro', 'chinook', 'skycrane']) {
  if (only && !only.split(',').includes(run)) continue;
  report.runs.push(await playAircraft(browser, base, run, { size: [W, Hh], quality, query: extra, quick: args.includes('--quick') }));
}
await browser.close();

const file = path.join(outDir, `${outName}.json`);
fs.writeFileSync(file, JSON.stringify(report, null, 1));
for (const r of report.runs) {
  console.log(`\n== ${r.run}  ${r.all.frames} frames, ${r.all.fps} fps avg, 1% low ${r.all.low1}, worst ${r.all.worstMs} ms, ${r.all.over16} over 16.7 ms, ${r.all.over33} over 33 ms; GC ${r.gcs.perSecond}/s; ${r.longTasks.length} long tasks${r.errors.length ? `\n   errors: ${r.errors.slice(0, 3).join(' | ')}` : ''}`);
  for (const s of r.scenes) console.log(`  ${s.label.padEnd(20)} ${String(s.fps).padStart(4)} fps  med ${String(s.medMs).padStart(5)}  1%low ${String(s.low1).padStart(4)}  worst ${String(s.worstMs).padStart(6)} ms  >16.7: ${s.over16}  spikes ${s.spikes}`);
  console.log(`  main-thread CPU per frame: median ${r.cpu.medCpu} ms, 99th percentile ${r.cpu.p99Cpu} ms; heaviest:`);
  for (const w of r.cpu.worst.slice(0, 8)) console.log(`   ${String(w.cpu).padStart(6)} ms CPU (${w.wall} ms wall)  [${w.label}]`);
  console.log('  slowest frames:');
  for (const w of r.worst.slice(0, 15)) console.log(`   ${String(w.dt).padStart(6)} ms  [${w.label}]  prev cpu ${w.cpuPrev} (sim ${w.prev?.sim} upd ${w.prev?.upd} ren ${w.prev?.ren}) prog+${w.prev?.newProg || 0}/${w.newProg || 0} geo+${w.prev?.newGeo || 0} tex+${w.prev?.newTex || 0} gc ${w.gc}  ${w.prev?.ev || ''}`);
  console.log(`  shader programs built mid-flight: ${r.newPrograms.length}`);
  for (const p of r.newPrograms) console.log(`   [${p.label}] ${p.name}  ${p.key.slice(0, 100)}
        ${p.owners.join(' | ')}
        differs: ${p.diff}`);
  const glBy = {};
  for (const g of r.glSlow) { const k = `${g.fn} ${g.prog}`; (glBy[k] ||= { n: 0, ms: 0, labels: new Set() }); glBy[k].n++; glBy[k].ms += g.ms; glBy[k].labels.add(g.label); }
  console.log(`  slow GL calls (${r.glSlow.length}, ${r.glSlow.reduce((a, g) => a + g.ms, 0).toFixed(0)} ms):`);
  for (const [k, v] of Object.entries(glBy).sort((a, b) => b[1].ms - a[1].ms).slice(0, 25)) console.log(`   ${v.ms.toFixed(0).padStart(5)} ms ×${v.n}  ${k}  [${[...v.labels].slice(0, 4).join(', ')}]`);
}
console.log(`\nwrote ${file}`);
