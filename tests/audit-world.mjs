// Set-dressing audit: finds props that float, props buried in walls and pieces left across openings.
//   node tests/audit-world.mjs [baseUrl] [--quality=high] [--json=file] [--from=file]
// Loads the game with globalThis.__pieceAudit on, so src/render/batch.js records every static piece's world
// box and the line that placed it; live meshes (instanced, animated) are read from the scene after loading.
// Then, from the boxes alone:
//   floating  groups of touching pieces (1 cm slack) that reach neither the ground nor anything that does
//   buried    small pieces whose middle is deep inside a wall-shaped box (a prop pushed through a wall)
// Boxes are axis-aligned, so a tilted piece looks bigger than it is: this misses some floaters but rarely
// reports a false one. --from re-runs the analysis on a saved dump without a browser.
import fs from 'node:fs';
import path from 'node:path';
import { groundHeight, FY } from '../src/sim/world/plan.js';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4178/';

let pieces;
if (arg('from')) pieces = JSON.parse(fs.readFileSync(arg('from'), 'utf8'));
else {
  const { chromium } = await import('../tools/browser-safety.mjs');
  const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11'] });
  const page = await (await browser.newContext({ viewport: { width: 800, height: 450 } })).newPage();
  await page.addInitScript(() => { globalThis.__pieceAudit = []; });
  await page.goto(`${base}?view=chase&record=0&quality=${arg('quality') || 'high'}&fs=0`, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 90000 });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await new Promise((r) => setTimeout(r, 1500));
  pieces = await page.evaluate(() => {
    const { THREE, renderer } = window.__helicoptea;
    const out = globalThis.__pieceAudit.slice();
    const b = new THREE.Box3(), m = new THREE.Matrix4(), w = new THREE.Matrix4();
    let scene = null;
    scene = window.__helicoptea.view?.scene || null;
    if (!scene) { let c = window.__helicoptea.camRig.camera; while (c.parent) c = c.parent; scene = c; }
    void renderer;
    scene.updateMatrixWorld(true);
    scene.traverse((o) => {
      if (!o.isMesh || o.userData.audited || !o.geometry || o.isSkinnedMesh) return;
      let vis = true; for (let p = o; p; p = p.parent) if (!p.visible && p.parent) { vis = !!p.parent && p.name.startsWith('world-'); break; }
      if (!vis) return;
      if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
      const name = `${o.name || o.parent?.name || 'mesh'}`;
      const site = `live:${name}|${o.material?.name || o.material?.type || ''}`;
      if (o.isInstancedMesh) {
        for (let i = 0; i < o.count; i++) {
          o.getMatrixAt(i, m); w.multiplyMatrices(o.matrixWorld, m);
          b.copy(o.geometry.boundingBox).applyMatrix4(w);
          out.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, o.material?.name || '', `${site}#${i}`]);
        }
      } else {
        b.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
        out.push([b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, o.material?.name || '', site]);
      }
    });
    return out;
  });
  await browser.close();
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify(pieces));
}

// Drop degenerate and sky-sized boxes (the sky dome, the ground, the horizon).
const P = pieces.filter((p) => p.slice(0, 6).every(Number.isFinite) && p[3] - p[0] < 60 && p[5] - p[2] < 60 && p[4] - p[1] < 30);
const N = P.length;
console.log(`${pieces.length} pieces, ${N} audited`);

// Spatial hash on x/z, 0.5 m cells; big pieces go in every cell they cover.
const CELL = 0.5, TOL = 0.01, grid = new Map();
const key = (i, k) => `${i},${k}`;
for (let n = 0; n < N; n++) {
  const p = P[n];
  for (let i = Math.floor((p[0] - TOL) / CELL); i <= Math.floor((p[3] + TOL) / CELL); i++) for (let k = Math.floor((p[2] - TOL) / CELL); k <= Math.floor((p[5] + TOL) / CELL); k++) {
    const kk = key(i, k); let c = grid.get(kk); if (!c) grid.set(kk, (c = [])); c.push(n);
  }
}
const parent = new Int32Array(N).map((_, i) => i);
const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
const touch = (a, b) => a[0] - TOL <= b[3] && b[0] - TOL <= a[3] && a[1] - TOL <= b[4] && b[1] - TOL <= a[4] && a[2] - TOL <= b[5] && b[2] - TOL <= a[5];
for (const list of grid.values()) {
  if (list.length > 4000) continue;
  for (let x = 0; x < list.length; x++) for (let y = x + 1; y < list.length; y++) {
    const a = list[x], b = list[y];
    if (find(a) !== find(b) && touch(P[a], P[b])) parent[find(a)] = find(b);
  }
}
const grounded = new Set();
for (let n = 0; n < N; n++) {
  const p = P[n];
  let g = -Infinity;
  for (const [x, z] of [[p[0], p[2]], [p[3], p[2]], [p[0], p[5]], [p[3], p[5]], [(p[0] + p[3]) / 2, (p[2] + p[5]) / 2]]) g = Math.max(g, groundHeight(x, z));
  if (p[1] <= g + 0.015 || p[1] <= FY + 0.015) grounded.add(find(n));
}
const comps = new Map();
for (let n = 0; n < N; n++) { const r = find(n); if (grounded.has(r)) continue; let c = comps.get(r); if (!c) comps.set(r, (c = [])); c.push(n); }
const site = (p) => p[7].split(' < ').find((s) => !/render\/batch\.js|render\/world\/index\.js|render\/extras\/kit\.js|render\/world\/kit\.js|^\s*at (Array|Object|new|Map)/.test(s)) || p[7];
const f = (v) => v.toFixed(2);
const floating = [...comps.values()].map((c) => {
  const bb = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const n of c) for (let k = 0; k < 6; k++) bb[k] = k < 3 ? Math.min(bb[k], P[n][k]) : Math.max(bb[k], P[n][k]);
  const sites = new Map();
  for (const n of c) { const s = site(P[n]).trim().replace(/^at\s+/, ''); sites.set(s, (sites.get(s) || 0) + 1); }
  return { n: c.length, bb, gap: bb[1] - groundHeight((bb[0] + bb[3]) / 2, (bb[2] + bb[5]) / 2), sites: [...sites.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) };
}).sort((a, b) => a.bb[0] - b.bb[0] || a.bb[2] - b.bb[2]);

// Buried: a small piece whose centre is inside a wall-like box (thin in x or z, at least 0.8 m long and tall),
// more than 3 cm from both faces.
const walls = [];
for (let n = 0; n < N; n++) {
  const p = P[n], dx = p[3] - p[0], dy = p[4] - p[1], dz = p[5] - p[2];
  if (dy > 0.8 && ((dx < 0.4 && dx > 0.08 && dz > 0.8) || (dz < 0.4 && dz > 0.08 && dx > 0.8))) walls.push(n);
}
const buried = [];
for (const wn of walls) {
  const w = P[wn], thinX = w[3] - w[0] < w[5] - w[2];
  const cand = new Set();
  for (let i = Math.floor(w[0] / CELL); i <= Math.floor(w[3] / CELL); i++) for (let k = Math.floor(w[2] / CELL); k <= Math.floor(w[5] / CELL); k++) for (const n of grid.get(key(i, k)) || []) cand.add(n);
  for (const n of cand) {
    const p = P[n];
    if (n === wn || (p[3] - p[0]) * (p[4] - p[1]) * (p[5] - p[2]) > 0.02) continue;
    const c = [(p[0] + p[3]) / 2, (p[1] + p[4]) / 2, (p[2] + p[5]) / 2];
    const inside = c[0] > w[0] && c[0] < w[3] && c[1] > w[1] + 0.03 && c[1] < w[4] - 0.03 && c[2] > w[2] && c[2] < w[5];
    if (!inside) continue;
    const depth = thinX ? Math.min(c[0] - w[0], w[3] - c[0]) : Math.min(c[2] - w[2], w[5] - c[2]);
    if (depth > 0.03) buried.push({ n, wn, depth });
  }
}

const lines = [];
lines.push(`\n== floating: ${floating.length} groups ==`);
for (const c of floating) lines.push(`${String(c.n).padStart(4)} pcs  x ${f(c.bb[0])}..${f(c.bb[3])}  y ${f(c.bb[1])}..${f(c.bb[4])}  z ${f(c.bb[2])}..${f(c.bb[5])}  +${f(c.gap)} m  ${c.sites.map(([s, k]) => `${s} ×${k}`).join(' | ')}`);
lines.push(`\n== buried in walls: ${buried.length} ==`);
const seen = new Set();
for (const b of buried) {
  const p = P[b.n], s = site(p); if (seen.has(s)) continue; seen.add(s);
  lines.push(`  ${f((p[0] + p[3]) / 2)}, ${f((p[1] + p[4]) / 2)}, ${f((p[2] + p[5]) / 2)}  ${f(b.depth)} m deep  ${s}  (wall ${site(P[b.wn])})`);
}
const report = lines.join('\n');
console.log(report);
const out = path.resolve('test-results/audit-world.txt');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, report);
