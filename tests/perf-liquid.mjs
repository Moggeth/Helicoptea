// Paired 120 Hz liquid benchmark. No GPU or server needed. Uses the exact pre-pass module from Git.
// node tests/perf-liquid.mjs [--baseline=c251a68]
import { execFileSync } from 'node:child_process';
import { RippleField as After } from '../src/render/rippleField.js';
import fs from 'node:fs';
const baseline = process.argv.find((a) => a.startsWith('--baseline='))?.slice(11) || 'c251a68';
fs.mkdirSync('scratch', { recursive: true });
fs.mkdirSync('test-results/perf', { recursive: true });
const baselinePath = new URL('../scratch/perf-liquid-baseline.mjs', import.meta.url);
fs.writeFileSync(baselinePath, execFileSync('git', ['show', `${baseline}:src/render/rippleField.js`], { encoding: 'utf8' }));
const { RippleField: Before } = await import(baselinePath.href);
const frames = 600, results = [];
for (const nb of [2, 3, 6]) for (const moving of [false, true]) {
  const samples = { before: [], after: [] };
  for (let repeat = 0; repeat < 7; repeat++) {
    for (const [key, Field] of (repeat & 1 ? [['after', After], ['before', Before]] : [['before', Before], ['after', After]])) {
      const field = new Field(0.045, 40);
      const f = { x: 0.002, z: -0.003, a: 0.0187, depth: 0.0033, I: 0, nb, omega: 17, phase: 0.6 };
      for (let i = 0; i < 100; i++) field.step(1 / 120, [f]);
      const t = performance.now();
      for (let i = 0; i < frames; i++) { if (moving && !(i & 1)) f.x = Math.sin(i / 20) * 0.002; field.step(1 / 120, [f]); }
      samples[key].push((performance.now() - t) / frames);
      field.texture.dispose();
    }
  }
  const median = (v) => v.slice().sort((a, b) => a - b)[v.length >> 1];
  results.push({ nb, moving, beforeMs: median(samples.before), afterMs: median(samples.after), samples });
}
fs.writeFileSync('test-results/perf/liquid-paired.json', JSON.stringify({baseline, frames, results}, null, 2));
for (const r of results) console.log(`${r.nb} blades ${r.moving?'moving 60Hz':'stationary'}: ${r.beforeMs.toFixed(4)} -> ${r.afterMs.toFixed(4)} ms/frame (${(100*(1-r.afterMs/r.beforeMs)).toFixed(1)}% less CPU)`);
