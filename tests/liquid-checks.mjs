import { performanceBudget } from './performance-budget.mjs';
// Headless checks for the rotor-wash ripple field on liquids (src/render/rippleField.js): a steady push
// settles to a dimple of the asked-for scale, volume is conserved (the walls rise), the blade pulses keep
// it ringing, it stays bounded under long forcing, a single drop rings and echoes, it settles and switches
// itself off once the wash leaves, and the cost per frame.
// Usage: node tests/liquid-checks.mjs
import { RippleField, shear } from '../src/render/rippleField.js';
import { OpenWash, registerWater, waterAt, clearWater, patchWaterMaterial } from '../src/render/openWater.js';
import * as THREE from 'three';

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const wash = (over = {}) => ({ x: 0, z: 0, a: 0.0187, ring: 0.025, foot: 0.12, depth: 0.0033, I: 0.95, nb: 2, omega: 2 * Math.PI * 8, phase: 0, ...over });
const stats = (f) => {
  let sum = 0, n = 0, min = 0, max = 0, wall = 0, wn = 0;
  for (let k = 0; k < f.n * f.n; k++) {
    if (!f.mask[k]) continue;
    const h = f.h[k]; sum += h; n++; min = Math.min(min, h); max = Math.max(max, h);
    if (Math.hypot(f.cx[k], f.cz[k]) > f.R * 0.85) { wall += h; wn++; }
  }
  return { mean: sum / n, min, max, wall: wall / wn };
};

// Mug-sized field under a centred wash for three seconds of 60 fps frames.
const mug = new RippleField(0.0415, 40);
const t0 = performance.now();
for (let i = 0; i < 180; i++) mug.step(1 / 60, [wash()]);
const ms = (performance.now() - t0) / 180;
const s = stats(mug);
let centre = 0;
for (let k = 0; k < 40; k++) { mug.step(1 / 60, [wash()]); centre += mug.heightAt(0, 0) / 40; }
check('a steady wash presses a dimple under the rotor', centre < -0.0002 && centre > -0.004, `mean centre ${(centre * 1000).toFixed(2)} mm`);
// A turbulent wave can put the wall in a trough at this instant, even with exactly conserved volume.
// Keep the turbulent-volume assertion, but measure wall rise under steady forcing without random kicks.
const steadyMug = new RippleField(0.0415, 40);
for (let i = 0; i < 180; i++) steadyMug.step(1 / 60, [wash({ I: 0 })]);
const steady = stats(steadyMug);
check('volume is conserved: what is pressed down climbs the walls', Math.abs(s.mean) < 1e-7 && Math.abs(steady.mean) < 1e-7 && steady.wall > 0,
  `turbulent mean ${(s.mean * 1e6).toFixed(3)} µm, steady walls +${(steady.wall * 1000).toFixed(2)} mm`);
steadyMug.texture.dispose();
check('stays bounded under long forcing (within the ±8 mm texture range)', s.min > -0.008 && s.max < 0.008, `${(s.min * 1000).toFixed(2)} … ${(s.max * 1000).toFixed(2)} mm`);
// The blade pulses keep it moving: the centre height varies frame to frame.
const hs = [];
for (let i = 0; i < 30; i++) { mug.step(1 / 60, [wash()]); hs.push(mug.heightAt(0.012, 0)); }
const spread = Math.max(...hs) - Math.min(...hs);
check('blade passage keeps the surface pounding', spread > 5e-5, `${(spread * 1000).toFixed(3)} mm peak-to-peak at 1.2 cm`);
check('texture encodes slope and energy while forced', mug.on === 1 && mug.data.some((v, i) => i % 4 === 3 && v > 40), '');
let off = 0;
while (mug.step(1 / 60, []) && off < 900) off++;
check('once the wash leaves it settles and stops stepping', !mug.live && mug.on === 0 && off < 600, `${(off / 60).toFixed(1)} s`);
check('a still field costs nothing (no step taken)', mug.step(1 / 60, []) === false);

// One drop near the wall: rings travel and reflect, then die away.
const cup = new RippleField(0.045, 40);
cup.impulse(0.03, 0, 0.02);
let seenFar = 0;
for (let i = 0; i < 40; i++) { cup.step(1 / 60, []); seenFar = Math.max(seenFar, Math.abs(cup.heightAt(-0.03, 0))); }
check('a drop rings across the cup', seenFar > 1e-6, `${(seenFar * 1e6).toFixed(2)} µm at the far side`);

// A wake landing beside the vessel still works the near side (outwash shear), not the far side.
const side = wash({ x: -0.09, z: 0 });
check('outwash beside the vessel shears the near side more than the far side', shear(side, -0.035, 0) > shear(side, 0.035, 0) * 3,
  `near ${shear(side, -0.035, 0).toFixed(2)}, far ${shear(side, 0.035, 0).toFixed(2)}`);

// A big bath (the garden bird bath) stays stable with its faster waves.
const bath = new RippleField(0.215, 48);
for (let i = 0; i < 180; i++) bath.step(1 / 60, [wash({ a: 0.04, ring: 0.035, depth: 0.003 })]);
const b = stats(bath);
check('the bird bath field is stable', Number.isFinite(b.min) && b.min > -0.004 && b.max < 0.004, `${(b.min * 1000).toFixed(2)} … ${(b.max * 1000).toFixed(2)} mm`);

performanceBudget(check, 'cost per forced frame (40×40, 4 substeps) stays small', ms, 1.0, `${ms.toFixed(3)} ms in Node on this machine`);

// ---------------------------------------------------------------- open water (openWater.js)
// A pond 2 m across at y = -0.7 with a 30 cm puddle beside it at another level.
clearWater();
registerWater(new THREE.CircleGeometry(1, 32).rotateX(-Math.PI / 2).translate(0, -0.7, 0));
registerWater(new THREE.CircleGeometry(0.15, 16).rotateX(-Math.PI / 2).translate(1.6, -0.756, 0));
check('the water register finds the pond, the puddle and dry ground', Math.abs(waterAt(0.3, 0.2) + 0.7) < 1e-6 && Math.abs(waterAt(1.62, 0.02) + 0.756) < 1e-6 && Number.isNaN(waterAt(1.2, 0.5)),
  `pond ${waterAt(0.3, 0.2)}, puddle ${waterAt(1.62, 0.02)}, dry ${waterAt(1.2, 0.5)}`);
const ow = new OpenWash({ name: 'high' });
const F = ow.field;
ow.place(0.7, 0, -0.7);
let dry = 0, wet = 0;
for (let k = 0; k < F.n * F.n; k++) { if (Math.hypot(ow.x + F.cx[k], ow.z + F.cz[k]) > 1.02) dry += F.mask[k]; else if (Math.hypot(ow.x + F.cx[k], ow.z + F.cz[k]) < 0.95) wet += F.mask[k]; }
check('the open field is masked to the water (the shore is a wall)', dry === 0 && wet > F.n * F.n * 0.3, `${wet} water cells, ${dry} past the shore`);
const ofw = (x) => ({ ...wash({ x, a: 0.03, ring: 0.03, foot: 0.13, depth: 0.004, I: 1.2 }) });
const o0 = performance.now();
for (let i = 0; i < 120; i++) { ow.forcing = [ofw(-0.2)]; ow.update(1 / 60, i / 60); }
const oms = (performance.now() - o0) / 120;
const cell = -0.2 + F.dx / 2, before = F.heightAt(cell, F.dx / 2);
check('a hover presses the pond and the wash runs', F.on === 1 && before < -2e-4, `${(before * 1000).toFixed(2)} mm under the rotor`);
// Fly on: the field moves along and what was rippling stays where it was in the world.
const wx = ow.x + cell;
ow.place(ow.x + 0.4, 0, -0.7);
check('moving the field on keeps the wake trail where it was', Math.abs(F.heightAt(wx - ow.x, F.dx / 2) - before) < 1e-9 && ow.moves === 2, `${(F.heightAt(wx - ow.x, F.dx / 2) * 1000).toFixed(2)} mm`);
let oOff = 0;
ow.forcing = [];
while (F.live && oOff < 900) { ow.update(1 / 60, 2 + oOff / 60); oOff++; }
check('the open field settles and switches off (the sponge soaks waves up)', !F.live && F.on === 0 && oOff < 600, `${(oOff / 60).toFixed(1)} s`);
performanceBudget(check, 'open field cost per forced frame (64×64) stays small', oms, 1.5, `${oms.toFixed(3)} ms in Node on this machine`);
// The water material's hook finds every chunk it rewrites, on the standard material and the phones' Phong.
for (const lib of ['meshphysical', 'meshphong']) {
  const m = patchWaterMaterial(new THREE.MeshStandardMaterial());
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib[lib === 'meshphysical' ? 'standard' : 'phong'].vertexShader, fragmentShader: THREE.ShaderLib[lib === 'meshphysical' ? 'standard' : 'phong'].fragmentShader };
  m.onBeforeCompile(sh);
  const ok = ['vOWW =', 'owFroth', 'owG.x', 'owGl'].every((t) => (sh.vertexShader + sh.fragmentShader).includes(t)) && (lib === 'meshphong' || sh.fragmentShader.includes('roughnessFactor = min'));
  check(`water shader hook applies to ${lib}`, ok && !!sh.uniforms.uOWBox);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} liquid checks passed`);
process.exit(failed.length ? 1 : 0);
