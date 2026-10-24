import * as THREE from 'three';

// A small height field over one vessel's liquid, for what the rotor wash does to it.
//
// Real water under a hovering rotor shows (in order of how hard you have to look):
//   1. a shallow dimple pressed in by the wake's stagnation pressure, q = ½ρv² (about half a millimetre
//      at 3 m/s; drawn about ×4 so it reads at cup scale, and because over the top is more fun),
//   2. a fast, taut-looking pounding: each blade's wake and its tip vortex slap the surface as they pass,
//      so the dimple pulses at blade-passage rate and rotating lobes throw off tight spiral rings,
//   3. a wind-roughened annulus where the outwash shears the surface (cat's paws racing outward, glassy
//      calm in the eye), drawn in the shader from this field's energy,
//   4. spray torn off that annulus and a billowing mist (emitted by LiquidWash, not here).
//
// Damped wave equation with a weak restoring spring (so a steady push settles to a steady dimple):
//   h_tt = c²∇²h − k h − γ h_t + F
// Reflecting (Neumann) walls at the vessel's inner radius. Stepped at 240 Hz on the CPU, a few
// thousand cells, and only while forced or still ringing. The result goes to a byte texture
// (slope x, slope z, height, energy) that the surface shader samples for displacement and normals.
//
// An open field (opts.open, see openWater.js) has no vessel: the caller marks which cells are water (so
// shorelines and puddle edges reflect), the edge of the grid is a sponge that soaks waves up, and volume
// isn't conserved (the pond goes on beyond the grid).

const STEP = 1 / 240;
export const FIELD_H_SCALE = 0.016;   // m: height texture spans ±8 mm
export const FIELD_SLOPE = 1.6;       // slope texture spans ±1.6

// How hard the wash works the surface at a field-local point: the stagnation core, and the outwash
// shearing across it out to the edge of the footprint.
export function shear(f, x, z) {
  const d = Math.hypot(x - f.x, z - f.z);
  return Math.min(1, Math.exp(-(d * d) / (f.a * f.a)) + Math.exp(-(((d - f.ring) / (0.5 * f.foot)) ** 2)));
}

// opts: hScale and slope (the texture's range), c (wave speed), gamma (damping), open (above).
export class RippleField {
  constructor(radius, n = 40, opts = {}) {
    this.n = n;
    this.R = radius;
    this.dx = (2 * radius) / n;
    this.open = !!opts.open;
    this.hScale = opts.hScale ?? FIELD_H_SCALE;
    this.slope = opts.slope ?? FIELD_SLOPE;
    // Wave speed: ~0.25 m/s in a cup (capillary-gravity ripples a few mm long), faster on a big bath.
    this.c = opts.c ?? 0.25 * Math.sqrt(Math.max(1, radius / 0.045));
    this.k = 300;                     // restoring spring (1/s²): sets how local the steady dimple stays
    this.gamma = opts.gamma ?? 3.2;   // damping (1/s): rings die in about a third of a second
    const N = n * n;
    this.h = new Float32Array(N);
    this.v = new Float32Array(N);
    this.e = new Float32Array(N);
    this.F = new Float32Array(N);
    this.shape = [new Float32Array(N), new Float32Array(N)];   // per forcing (up to two rotors)
    this.lobeCos = [new Float32Array(N), new Float32Array(N)];
    this.lobeSin = [new Float32Array(N), new Float32Array(N)];
    this.footprints = [null, null];
    this.shapeBuilds = 0;
    this.mask = new Uint8Array(N);
    this.cx = new Float32Array(N);
    this.cz = new Float32Array(N);
    // Extra damping per cell: the open field's sponge round its edge.
    this.damp = this.open ? new Float32Array(N) : null;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = -radius + (i + 0.5) * this.dx, z = -radius + (j + 0.5) * this.dx;
      const k = j * n + i;
      this.cx[k] = x; this.cz[k] = z;
      if (this.open) {
        const edge = Math.min(i, j, n - 1 - i, n - 1 - j) / (n * 0.16);
        this.damp[k] = edge < 1 ? 16 * (1 - edge) ** 2 : 0;
      } else if (i > 0 && j > 0 && i < n - 1 && j < n - 1 && Math.hypot(x, z) < radius - 0.3 * this.dx) this.mask[k] = 1;
    }
    this.cells = this.mask.reduce((s, m) => s + m, 0);
    this.data = new Uint8Array(N * 4);
    for (let k = 0; k < N; k++) { this.data[k * 4] = 128; this.data[k * 4 + 1] = 128; this.data[k * 4 + 2] = 128; this.data[k * 4 + 3] = 0; }
    this.texture = new THREE.DataTexture(this.data, n, n, THREE.RGBAFormat);
    this.texture.magFilter = this.texture.minFilter = THREE.LinearFilter;
    this.texture.needsUpdate = true;
    this.acc = 0;
    this.t = 0;
    this.live = false;   // anything still moving
    this.on = 0;         // 0 when the texture is flat (shader skips it)
    this.steps = 0;      // substeps taken (for tests and the cost readout)
    this.maxDepth = 0;   // deepest point this frame (m, positive down)
    this.rimSurge = 0;   // fastest rise near the vessel's wall this frame (m/s): slop over the rim
  }

  // A sudden local push (a drop, a dunk): kicks the surface velocity.
  impulse(x, z, amp, radius = 0.004) {
    const { n, dx } = this;
    const ci = (x + this.R) / dx - 0.5, cj = (z + this.R) / dx - 0.5, rc = Math.ceil(radius * 2 / dx);
    for (let j = Math.max(1, Math.floor(cj - rc)); j <= Math.min(n - 2, cj + rc); j++) {
      for (let i = Math.max(1, Math.floor(ci - rc)); i <= Math.min(n - 2, ci + rc); i++) {
        const k = j * n + i;
        if (!this.mask[k]) continue;
        const r2 = ((this.cx[k] - x) ** 2 + (this.cz[k] - z) ** 2) / (radius * radius);
        this.v[k] -= amp * Math.exp(-r2);
      }
    }
    this.live = true;
  }

  // forcing: [{ x, z, a, depth, I, nb, omega, phase }] in field-local metres; depth is the steady dimple.
  step(dt, forcing) {
    if (!forcing.length && !this.live) return false;
    const { n, F, mask } = this;
    this.maxDepth = 0;
    this.acc += Math.min(dt, 0.05);
    if (this.acc < STEP) return false; // no wave state changed; don't rebuild/encode/upload it
    // Air updates at 60 Hz. Reuse a footprint across render frames and 240 Hz substeps until its
    // position, width or blade count actually changes. Time/depth/intensity are applied below.
    const nf = Math.min(2, forcing.length);
    for (let fi = 0; fi < nf; fi++) {
      const f = forcing[fi];
      const old = this.footprints[fi];
      if (old && old.x === f.x && old.z === f.z && old.a === f.a && old.nb === f.nb && old.gen === this.gen) continue;
      this.footprints[fi] = { x: f.x, z: f.z, a: f.a, nb: f.nb, gen: this.gen };
      this.shapeBuilds++;
      const g = this.shape[fi], lc = this.lobeCos[fi], ls = this.lobeSin[fi];
      const a2 = f.a * f.a, reach2 = 6.5 * a2;
      for (let k = 0; k < n * n; k++) {
        g[k] = 0;
        if (!mask[k]) continue;
        const dx = this.cx[k] - f.x, dz = this.cz[k] - f.z;
        const r2 = dx * dx + dz * dz;
        if (r2 > reach2) continue;
        g[k] = Math.exp(-r2 / a2);
        const angle = f.nb * Math.atan2(dz, dx), weight = 0.6 * Math.min(1, r2 / a2 * 2.5);
        lc[k] = weight * Math.cos(angle); ls[k] = weight * Math.sin(angle);
      }
    }
    let sub = 0;
    while (this.acc >= STEP && sub < 6) {
      this.acc -= STEP;
      this.t += STEP;
      sub++;
      // Forcing: steady stagnation push, pulsing at blade passage, with rotating lobes under each blade.
      F.fill(0);
      for (let fi = 0; fi < nf; fi++) {
        const f = forcing[fi];
        const g = this.shape[fi], lc = this.lobeCos[fi], ls = this.lobeSin[fi];
        const P = this.k * f.depth;              // steady push that settles to depth f.depth
        const pulse = 0.35 * Math.sin(this.t * f.omega * f.nb + f.phase);
        const turn = this.t * f.omega + f.phase;
        // cos(nb*(angle-turn)) = cos(nb*angle)*cos(nb*turn) + sin(nb*angle)*sin(nb*turn).
        // Two trig calls per rotor/substep, instead of one for every forced cell.
        const cosTurn = Math.cos(f.nb * turn), sinTurn = Math.sin(f.nb * turn);
        for (let k = 0; k < n * n; k++) {
          if (g[k] === 0) continue;
          F[k] -= P * g[k] * (1 + pulse + lc[k] * cosTurn + ls[k] * sinTurn);
        }
        // Turbulent punches: gusts slap random spots, mostly in the core and where the outwash shears
        // across the surface (which may be all the vessel sees when the wake lands beside it). An open
        // field punches round the footprint rather than across its whole grid.
        if (Math.random() < f.I * 1.3) {
          const ang = Math.random() * Math.PI * 2, rr = (this.open ? f.foot * 1.3 : this.R * 0.9) * Math.sqrt(Math.random());
          const x = (this.open ? f.x : 0) + Math.cos(ang) * rr, z = (this.open ? f.z : 0) + Math.sin(ang) * rr;
          if (Math.random() < shear(f, x, z)) this.impulse(x, z, f.depth * 30 * (0.5 + Math.random()), 0.0025 + Math.random() * (this.open ? 0.006 : 0.003));
        }
      }
      this.substep(STEP);
    }
    this.steps += sub;
    this.encode(forcing.length > 0);
    return true;
  }

  substep(H) {
    const { n, h, v, F, mask, k: K, gamma, damp } = this;
    const c2 = (this.c * this.c) / (this.dx * this.dx);
    for (let k = 0; k < n * n; k++) {
      if (!mask[k]) continue;
      const hc = h[k];
      const l = mask[k - 1] ? h[k - 1] : hc, r = mask[k + 1] ? h[k + 1] : hc;
      const d = mask[k - n] ? h[k - n] : hc, u = mask[k + n] ? h[k + n] : hc;
      v[k] += (c2 * (l + r + d + u - 4 * hc) - K * hc - (damp ? gamma + damp[k] : gamma) * v[k] + F[k]) * H;
    }
    if (this.open) {
      for (let k = 0; k < n * n; k++) if (mask[k]) h[k] += v[k] * H;
      return;
    }
    let sum = 0;
    for (let k = 0; k < n * n; k++) if (mask[k]) { h[k] += v[k] * H; sum += h[k]; }
    // Volume is conserved: what the wash presses down under the rotor climbs the walls.
    const mean = sum / this.cells;
    for (let k = 0; k < n * n; k++) if (mask[k]) h[k] -= mean;
  }

  encode(forced) {
    const { n, h, v, e, mask, data } = this;
    const inv2dx = 1 / (2 * this.dx), sH = 255 / this.hScale, sS = 127 / this.slope;
    const rimR2 = (this.R * 0.8) ** 2;
    let peak = 0, deepest = 0, rim = 0;
    for (let k = 0; k < n * n; k++) {
      if (!mask[k]) continue;
      const hc = h[k];
      const gx = ((mask[k + 1] ? h[k + 1] : hc) - (mask[k - 1] ? h[k - 1] : hc)) * inv2dx;
      const gz = ((mask[k + n] ? h[k + n] : hc) - (mask[k - n] ? h[k - n] : hc)) * inv2dx;
      // Energy: how agitated the surface is here (drives roughness, froth and glitter in the shader).
      e[k] = e[k] * 0.92 + 0.08 * Math.min(1, Math.abs(v[k]) * 35 + Math.hypot(gx, gz) * 1.5);
      const q = k * 4;
      data[q] = Math.max(0, Math.min(255, 128 + gx * sS));
      data[q + 1] = Math.max(0, Math.min(255, 128 + gz * sS));
      data[q + 2] = Math.max(0, Math.min(255, 127.5 + hc * sH));
      data[q + 3] = Math.min(255, e[k] * 255);
      const m = Math.abs(hc) + Math.abs(v[k]) * 0.05 + e[k] * 1e-4;
      if (m > peak) peak = m;
      if (-hc > deepest) deepest = -hc;
      if (v[k] > rim && this.cx[k] * this.cx[k] + this.cz[k] * this.cz[k] > rimR2) rim = v[k];
    }
    this.maxDepth = deepest;
    this.rimSurge = this.open ? 0 : rim;
    this.texture.needsUpdate = true;
    this.on = 1;
    // Settled and unforced: zero it and stop stepping until something disturbs it again.
    if (!forced && peak < 3e-6) this.flatten();
    else this.live = true;
  }

  // Flat and still: zero the state and the texture and stop stepping.
  flatten() {
    const { n, data } = this;
    this.h.fill(0); this.v.fill(0); this.e.fill(0);
    for (let k = 0; k < n * n; k++) { data[k * 4] = 128; data[k * 4 + 1] = 128; data[k * 4 + 2] = 128; data[k * 4 + 3] = 0; }
    this.texture.needsUpdate = true;
    this.live = false;
    this.on = 0;
    this.rimSurge = 0;
  }

  // Height (m) at a field-local point, nearest cell. For tests and effects.
  heightAt(x, z) {
    const i = Math.max(0, Math.min(this.n - 1, Math.floor((x + this.R) / this.dx)));
    const j = Math.max(0, Math.min(this.n - 1, Math.floor((z + this.R) / this.dx)));
    return this.h[j * this.n + i];
  }

  clear() { this.h.fill(0); this.v.fill(0); this.live = true; }
}
