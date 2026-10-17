// VR sanity checks for the first-person cockpits, measured in the real build at full-size equivalents
// (model metres x the aircraft's scale): eye height over the floor, headroom, nothing within a head's
// reach of the eye, the instrument panel's distance, and dial and display sizes (real dials are 57 to
// 100 mm; in a headset they should also span a few degrees to stay legible).
// Usage: node tests/e2e-vr-scale.mjs [baseUrl]
import { chromium } from '../tools/browser-safety.mjs';
import fs from 'node:fs';

const base = process.argv.find((a) => a.startsWith('http')) || 'http://localhost:4190/';
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome'].find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--ignore-gpu-blocklist', '--use-angle=d3d11', '--disable-background-timer-throttling', '--disable-renderer-backgrounding'] });
const SCALE = { micro: 32, chinook: 90, skycrane: 94 };
const FLOOR = { micro: -0.0246, chinook: -0.0046, skycrane: -0.0018 };   // cockpit floor (model y)
const RANGES = {
  eyeOverFloor: [0.95, 1.4], headroom: [0.08, 2], clearance: [0.1, 9], behind: [0.15, 9], panel: [0.6, 1.05], dial: [0.05, 0.13], dialDeg: [3, 12], display: [0.12, 0.35],
};
for (const ac of ['micro', 'chinook', 'skycrane']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?aircraft=${ac}&view=chase`, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 60000 });
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.keyboard.press('Digit1');
  await sleep(800);
  const m = await page.evaluate(([L, floorY]) => {
    const g = window.__helicoptea, T = g.THREE;
    const it = g.cockpit.interiors[g.sim.heli.type];
    const eye = new T.Vector3(...g.fpRig.seat.eye);
    const rc = new T.Raycaster();
    // Anything visible is in the way of a head, glass included.
    const solid = (h) => { const mat = Array.isArray(h.object.material) ? h.object.material[h.face?.materialIndex ?? 0] : h.object.material; return mat && mat.visible !== false; };
    const cast = (dir) => { rc.set(eye, dir.clone().normalize()); rc.near = 0; rc.far = 1; const h = rc.intersectObject(it.group, true).find(solid); return h ? h.distance * L : Infinity; };
    const down = (eye.y - floorY) * L, up = cast(new T.Vector3(0, 1, 0));
    let near = Infinity, nearDir = null, behind = Infinity;
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      if (y < 0 && z > 0) continue;   // down and back: the pilot's own body
      const d = cast(new T.Vector3(x, y, z));
      if (z > 0 && !x) behind = Math.min(behind, d);
      else if (d < near) { near = d; nearDir = [x, y, z]; }
    }
    const P = it.panel, pc = new T.Vector3(); P.group.getWorldPosition(pc);
    // Distance from the eye to the panel's plane (what the eyes focus at and the hands reach to).
    const n = new T.Vector3(0, 0, 1).applyQuaternion(P.group.getWorldQuaternion(new T.Quaternion()));
    const dist = Math.abs(eye.clone().sub(pc).dot(n)) * L;
    const dials = P.layout.dials.map((d) => d.r * P.h * 2 * L);
    const displays = P.layout.glass.map((q) => q.w * P.h * L);
    const minDial = Math.min(...dials), maxDial = Math.max(...dials);
    return { down, up, near, nearDir, behind, dist, minDial, maxDial, minDeg: 2 * Math.atan(minDial / 2 / dist) * 180 / Math.PI, maxDisplay: Math.max(...displays) };
  }, [SCALE[ac], FLOOR[ac]]);
  const f = (v) => (v === Infinity ? 'none' : v.toFixed(2));
  const inR = (v, [a, b]) => v >= a && v <= b;
  check(`${ac}: eye height over the floor ${f(m.down)} m`, inR(m.down, RANGES.eyeOverFloor));
  check(`${ac}: headroom ${f(m.up)} m`, inR(m.up, RANGES.headroom));
  check(`${ac}: nothing within ${RANGES.clearance[0]} m of the eye (nearest ${f(m.near)} m, direction ${m.nearDir})`, inR(m.near, RANGES.clearance));
  check(`${ac}: back of the head clear of the seat (${f(m.behind)} m behind the eye)`, inR(m.behind, RANGES.behind));
  check(`${ac}: instrument panel ${f(m.dist)} m from the eye`, inR(m.dist, RANGES.panel));
  check(`${ac}: dials ${(m.minDial * 1000).toFixed(0)} to ${(m.maxDial * 1000).toFixed(0)} mm across`, m.minDial >= RANGES.dial[0] && m.maxDial <= RANGES.dial[1]);
  check(`${ac}: smallest dial spans ${m.minDeg.toFixed(1)} degrees`, inR(m.minDeg, RANGES.dialDeg));
  check(`${ac}: largest display ${(m.maxDisplay * 1000).toFixed(0)} mm wide`, inR(m.maxDisplay, RANGES.display));
  check(`${ac}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
}
await browser.close();
process.exit(failed ? 1 : 0);
