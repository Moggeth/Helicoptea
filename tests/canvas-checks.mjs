// Canvas texture rules that keep phones alive: a blur filter or shadow blur on individual canvas draws made a
// Galaxy S24 Ultra's GPU canvas hold a blurred copy per draw (2,600 tea-bag flakes, about 3 GB), and Android
// killed the browser while loading. Blur a whole layer once instead (blurOnto in src/render/textures.js, or a
// filter set for one drawImage of the layer on the same line).
import fs from 'node:fs';
import path from 'node:path';
let failed = 0, total = 0;
const check = (name, ok, detail = '') => { total++; if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`); };
const files = [];
const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (p.endsWith('.js')) files.push(p); } };
walk('src');
const hits = [];
for (const f of files) {
  const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
  lines.forEach((l, i) => {
    if (/\.filter\s*=\s*[`'"]blur/.test(l) && !/drawImage|ctx\.filter = `blur\(\$\{radius\}px\)`/.test(l)) hits.push(`${f}:${i + 1}`);
    if (/shadowBlur\s*=\s*[1-9]/.test(l)) hits.push(`${f}:${i + 1} (shadowBlur)`);
  });
}
check('no canvas blur filter or shadow blur on individual draws (blur a layer once with blurOnto)', hits.length === 0, hits.join(', '));
const tx = fs.readFileSync('src/render/textures.js', 'utf8');
check('texture canvases are drawn on the CPU (willReadFrequently)', /getContext\('2d', \{ willReadFrequently: true \}\)/.test(tx));
console.log(`${total - failed}/${total} canvas checks passed`);
process.exit(failed ? 1 : 0);
