import * as THREE from 'three';
import { TABLE, PAD, CUPS, TEAPOT, SUGAR, VASE, JUG, PLATE, STATION, DISCARD } from '../sim/layout.js';

// The linen runner as a light cloth: a grid of particles (Verlet) held together by stretch, shear and
// bend constraints, lying on the table and hanging over both ends. Whatever stands on it pins it; it
// can't pass through the pad, the cups, the teapot or the tea stand, it drapes over the table's ends,
// and it's pushed by the rotor's air field. It's presentation only (nothing in the sim feels it), so it
// runs at its own fixed rate and sleeps whenever the air over the table is still.

const WIDTH = 0.36;     // across the table (z)
const HANG = 0.2;       // down each end of the table
const EDGE_R = 0.012;   // the table's rounded end edge
const LIFT = 0.0012;    // cloth thickness above the table top

export class TableCloth {
  constructor(scene, quality, map) {
    // Ultra builds the world as high does; touch devices get the low tier's runner (a quarter fewer points).
    const tier = quality.name === 'ultra' ? 'high' : quality.lite ? 'low' : quality.name;
    // Resolution, steps per second and constraint rounds scale with the quality tier.
    const NX = tier === 'high' ? 96 : tier === 'medium' ? 56 : 40;
    const NZ = tier === 'high' ? 17 : tier === 'medium' ? 10 : 7;
    this.rate = tier === 'high' ? 90 : 60;
    this.iters = tier === 'high' ? 4 : 3;
    this.ms = 0;
    this.NX = NX; this.NZ = NZ;
    const topLen = TABLE.halfX * 2 + EDGE_R * Math.PI; // across the top and round both edges
    const L = topLen + HANG * 2;
    this.n = NX * NZ;
    this.p = new Float32Array(this.n * 3);
    this.q = new Float32Array(this.n * 3);   // previous positions
    this.rest = new Float32Array(this.n * 3);
    this.pin = new Uint8Array(this.n);
    this.edge = new Float32Array(this.n);    // 1 at a free edge, fading inwards (air gets under edges)
    this.phase = new Float32Array(this.n);
    this.air = new Float32Array(this.n * 3);
    // Lay it out along its length s: down one end, across the top (round the edges), down the other.
    const at = (s, out) => {
      const half = L / 2, a = s - half; // -half..half, 0 at the middle of the table
      const flat = TABLE.halfX, round = EDGE_R * Math.PI / 2;
      const m = Math.abs(a), sg = Math.sign(a) || 1;
      if (m <= flat) { out[0] = a; out[1] = LIFT; }
      else if (m <= flat + round) { const th = (m - flat) / EDGE_R; out[0] = sg * (flat + Math.sin(th) * (EDGE_R + LIFT)); out[1] = LIFT - (1 - Math.cos(th)) * (EDGE_R + LIFT); }
      else { out[0] = sg * (flat + EDGE_R + LIFT); out[1] = -EDGE_R - (m - flat - round); }
      return out;
    };
    const tmp = [0, 0];
    this.ds = L / (NX - 1); this.dz = WIDTH / (NZ - 1);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      at(i * this.ds, tmp);
      const z = -WIDTH / 2 + j * this.dz;
      this.rest[k * 3] = tmp[0]; this.rest[k * 3 + 1] = tmp[1]; this.rest[k * 3 + 2] = z;
      const de = Math.min(j, NZ - 1 - j, i, NX - 1 - i);
      this.edge[k] = Math.max(0, 1 - de / 4.5);
      this.phase[k] = fract(Math.sin(i * 12.9898 + j * 78.233) * 43758.5453) * 6.283;
    }
    this.p.set(this.rest); this.q.set(this.rest);

    // What stands on the cloth: circles [x, z, radius, top] and boxes [x, z, halfX, halfZ, top].
    this.circles = [
      [PAD.x, PAD.z, PAD.radius, PAD.height], [TEAPOT.x, TEAPOT.z, TEAPOT.bodyR * 0.98, TEAPOT.bodyH],
      [SUGAR.x, SUGAR.z, SUGAR.r, SUGAR.h + SUGAR.lidH], [VASE.x, VASE.z, VASE.r, VASE.h], [JUG.x, JUG.z, JUG.r, JUG.h],
      [PLATE.x, PLATE.z, PLATE.r, PLATE.h], [DISCARD.x, DISCARD.z, DISCARD.radius, DISCARD.rimHeight],
    ];
    for (const C of CUPS) if (C.standY === undefined) this.circles.push([C.x, C.z, C.saucer || C.rOut, C.saucer ? C.baseY + C.height : C.height]);
    const S = STATION;
    this.boxes = [[S.x, S.z, S.baseHalf[0], S.baseHalf[2], S.baseHalf[1] * 2]];
    // Pinned where something's weight sits on it (a little inside its footprint).
    for (let k = 0; k < this.n; k++) {
      const x = this.rest[k * 3], z = this.rest[k * 3 + 2];
      for (const [cx, cz, r] of this.circles) if ((x - cx) ** 2 + (z - cz) ** 2 < (r + 0.004) ** 2) this.pin[k] = 1;
      for (const [cx, cz, hx, hz] of this.boxes) if (Math.abs(x - cx) < hx + 0.004 && Math.abs(z - cz) < hz + 0.004) this.pin[k] = 1;
    }

    // Constraints: stretch (neighbours), shear (diagonals), bend (two apart, softer).
    const cons = [];
    const add = (a, b, k) => { const d = Math.hypot(this.rest[a * 3] - this.rest[b * 3], this.rest[a * 3 + 1] - this.rest[b * 3 + 1], this.rest[a * 3 + 2] - this.rest[b * 3 + 2]); cons.push(a, b, d, k); };
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      if (i + 1 < NX) add(k, k + 1, 1);
      if (j + 1 < NZ) add(k, k + NX, 1);
      if (i + 1 < NX && j + 1 < NZ) { add(k, k + NX + 1, 0.7); add(k + 1, k + NX, 0.7); }
      if (i + 2 < NX) add(k, k + 2, 0.3);
      if (j + 2 < NZ) add(k, k + 2 * NX, 0.3);
    }
    this.cons = new Float32Array(cons);

    // Mesh.
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(new Float32Array(this.p), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    const uv = new Float32Array(this.n * 2);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      uv[k * 2] = (i * this.ds - L / 2 + topLen / 2) / topLen; // 0..1 across the top, beyond it down the ends
      uv[k * 2 + 1] = 1 - j / (NZ - 1);
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let j = 0; j < NZ - 1; j++) for (let i = 0; i < NX - 1; i++) {
      const a = j * NX + i, b = a + 1, c = a + NX, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    this.geo = geo;
    const mat = new THREE.MeshStandardMaterial({ map, roughness: 0.95, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.acc = 0;
    this.time = 0;
    this.awake = 0;      // seconds left before it may sleep
    this.lastMax = 0;    // biggest movement last step (for sleeping and checks)
    this.maxPen = 0;     // deepest it ever got into anything (checks)
  }

  // dt: world time since the last frame. sim: for the air field, the helicopter and the bags.
  update(dt, sim) {
    const t0 = performance.now();
    const air = sim.air;
    // Only air over the table matters: the outwash layer there, or a wake column passing close by.
    let windy = !!air && !air.calm && air.energy > 0.01;
    if (air && !windy) for (const wk of air.wakes) if (wk.active && Math.abs(wk.hub.x) < TABLE.halfX + 0.5 && Math.abs(wk.hub.z) < WIDTH + 0.4 && wk.hub.y < 0.9) windy = true;
    if (windy) this.awake = 3;
    else this.awake -= dt;
    if (this.awake <= 0 && this.lastMax < 2e-6) { this.ms = 0; return; } // asleep: nothing to do, nothing to upload
    this.time += dt;
    // Sample the air once per frame (positions don't move far within one).
    const A = this.air, P = this.p, _v = TableCloth._v;
    for (let k = 0; k < this.n; k++) {
      if (this.pin[k] || !windy) { A[k * 3] = A[k * 3 + 1] = A[k * 3 + 2] = 0; continue; }
      air.sample(P[k * 3], P[k * 3 + 1], P[k * 3 + 2], _v);
      A[k * 3] = _v.x; A[k * 3 + 1] = _v.y; A[k * 3 + 2] = _v.z;
    }
    this.acc = Math.min(this.acc + dt, 3 / this.rate);
    const h = 1 / this.rate;
    while (this.acc >= h) { this.step(h, sim); this.acc -= h; }
    this.posAttr.array.set(this.p);
    this.posAttr.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.ms = this.ms * 0.9 + (performance.now() - t0) * 0.1;
  }

  step(h, sim) {
    const P = this.p, Q = this.q, A = this.air, n = this.n;
    const g = 9.81 * h * h;
    // Linen at ~220 g/m^2: each particle carries its share of mass; the air acts on its share of area.
    const area = this.ds * this.dz, mass = 0.22 * area;
    const kn = 0.5 * 1.2 * 1.1 * area / mass, kt = 0.5 * 1.2 * 0.03 * area / mass;
    const t = this.time;
    let maxMove = 0;
    for (let k = 0; k < n; k++) {
      const i3 = k * 3;
      if (this.pin[k]) { P[i3] = this.rest[i3]; P[i3 + 1] = this.rest[i3 + 1]; P[i3 + 2] = this.rest[i3 + 2]; Q[i3] = P[i3]; Q[i3 + 1] = P[i3 + 1]; Q[i3 + 2] = P[i3 + 2]; continue; }
      const x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      const vx = (x - Q[i3]) / h, vy = (y - Q[i3 + 1]) / h, vz = (z - Q[i3 + 2]) / h;
      let ax = 0, ay = 0, az = 0;
      const wx = A[i3], wy = A[i3 + 1], wz = A[i3 + 2];
      const w2 = wx * wx + wz * wz;
      if (w2 + wy * wy > 1e-4) {
        // Pressure on the face (normal approximated as up for the top, as the cloth's own facing for the
        // hanging ends: x), a little skin friction, and lift where the outwash gets under a free edge.
        const rx = wx - vx, ry = wy - vy, rz = wz - vz;
        const hanging = Math.abs(x) > TABLE.halfX;
        const vn = hanging ? rx : ry;
        const fn = kn * vn * Math.abs(vn);
        if (hanging) ax += fn; else ay += fn;
        const sp = Math.sqrt(rx * rx + ry * ry + rz * rz);
        ax += kt * rx * sp; ay += kt * ry * sp; az += kt * rz * sp;
        if (!hanging) ay += this.edge[k] * 2.0 * kn * w2 * (0.55 + 0.45 * Math.sin(t * 7 + this.phase[k] + x * 20));
        // Turbulent buffeting: slow, broad wobbles rather than a fizz.
        const s = Math.sqrt(w2);
        const tb = 0.35 * kn * s * s * 0.15;
        ax += tb * Math.sin(t * 5.3 + this.phase[k] + x * 9);
        az += tb * Math.sin(t * 4.1 + this.phase[k] * 1.7 + z * 11);
        ay += tb * 0.6 * Math.sin(t * 6.7 + this.phase[k] * 0.6 + x * 13);
      }
      // Never more than a few g from the air: heavy linen lifts and rolls, it doesn't snap about.
      const am = Math.sqrt(ax * ax + ay * ay + az * az), lim = 3 * 9.81;
      if (am > lim) { ax *= lim / am; ay *= lim / am; az *= lim / am; }
      const damp = 0.985;
      const nx = x + (x - Q[i3]) * damp + ax * h * h;
      const ny = y + (y - Q[i3 + 1]) * damp + ay * h * h - g;
      const nz = z + (z - Q[i3 + 2]) * damp + az * h * h;
      Q[i3] = x; Q[i3 + 1] = y; Q[i3 + 2] = z;
      P[i3] = nx; P[i3 + 1] = ny; P[i3 + 2] = nz;
      maxMove = Math.max(maxMove, Math.abs(nx - x) + Math.abs(ny - y) + Math.abs(nz - z));
    }
    // Constraints and collisions, a few rounds.
    const C = this.cons;
    for (let it = 0; it < this.iters; it++) {
      for (let c = 0; c < C.length; c += 4) {
        const a = C[c] * 3, b = C[c + 1] * 3, rest = C[c + 2], stiff = C[c + 3];
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
        const pa = this.pin[C[c]], pb = this.pin[C[c + 1]];
        if (pa && pb) continue;
        // Cloth barely stretches but bends and bunches freely (compression is let off lightly).
        let diff = (d - rest) / d;
        if (diff < 0) diff *= 0.3;
        diff *= stiff;
        const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
        P[a] += dx * diff * wa; P[a + 1] += dy * diff * wa; P[a + 2] += dz * diff * wa;
        P[b] -= dx * diff * wb; P[b + 1] -= dy * diff * wb; P[b + 2] -= dz * diff * wb;
      }
      if (it === this.iters - 1 || it === 0) this.collide(sim);
    }
    this.lastMax = maxMove;
  }

  collide(sim) {
    const P = this.p, n = this.n;
    const hx = TABLE.halfX, hz = TABLE.halfZ;
    const heli = sim.heli, circles = this.circles, boxes = this.boxes, bags = sim.bags;
    for (let k = 0; k < n; k++) {
      if (this.pin[k]) continue;
      const i3 = k * 3;
      let x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      // Table top and its rounded ends.
      if (Math.abs(z) < hz) {
        if (Math.abs(x) <= hx) { if (y < LIFT && y > -TABLE.thickness) { this.note(LIFT - y); y = LIFT; } }
        else {
          const ex = x - Math.sign(x) * hx, R = EDGE_R + LIFT;
          if (y > -EDGE_R) { const d = Math.sqrt(ex * ex + y * y); if (d < R) { const s = R / (d || 1e-6); this.note(R - d); x = Math.sign(x) * hx + ex * s; y *= s; } }
          else if (Math.abs(ex) < R && y > -TABLE.thickness - 0.08) { x = Math.sign(x) * (hx + R); }
        }
      }
      // Things standing on the cloth: it can rise around them or drape over them, never pass through.
      // (Indexed loops, no destructuring: this runs for every particle a few times a step, and the
      // destructuring for-of allocated about a megabyte a frame, which the garbage collector paid for.)
      for (let c = 0; c < circles.length; c++) {
        const C = circles[c], cx = C[0], cz = C[1], r = C[2], top = C[3];
        const dx = x - cx, dz = z - cz, d2 = dx * dx + dz * dz, R = r + 0.002;
        if (d2 < R * R && y < top + LIFT) {
          const d = Math.sqrt(d2) || 1e-6;
          // Coming down from above it drapes over the top; anything lower is pushed out sideways.
          if (y > top - 0.003) y = top + LIFT; else { this.note(R - d); x = cx + dx / d * R; z = cz + dz / d * R; }
        }
      }
      for (let c = 0; c < boxes.length; c++) {
        const B = boxes[c], cx = B[0], cz = B[1], bx = B[2], bz = B[3], top = B[4];
        const dx = x - cx, dz = z - cz;
        if (Math.abs(dx) < bx + 0.002 && Math.abs(dz) < bz + 0.002 && y < top + LIFT) {
          const px = bx + 0.002 - Math.abs(dx), pz = bz + 0.002 - Math.abs(dz), py = top + LIFT - y;
          if (y > top - 0.003 && py < px && py < pz) y = top + LIFT; else if (px < pz) x = cx + Math.sign(dx) * (bx + 0.002); else z = cz + Math.sign(dz) * (bz + 0.002);
        }
      }
      // The helicopter's belly and skids, and any bag, push the cloth aside.
      if (heli) {
        const r = heli.type === 'micro' || !heli.type ? 0.05 : 0.08;
        const dx = x - heli.pos.x, dy = y - heli.pos.y, dz = z - heli.pos.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < r) { const s = r / (d || 1e-6); x = heli.pos.x + dx * s; y = heli.pos.y + dy * s; z = heli.pos.z + dz * s; }
      }
      for (let q = 0; q < bags.length; q++) {
        const b = bags[q];
        const dx = x - b.pos.x, dy = y - b.pos.y, dz = z - b.pos.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 0.03) { const s = 0.03 / (d || 1e-6); x = b.pos.x + dx * s; y = b.pos.y + dy * s; z = b.pos.z + dz * s; }
      }
      P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z;
    }
  }

  note(pen) { if (pen > this.maxPen) this.maxPen = pen; }

  // Deepest any free particle is inside the table or something standing on it right now (for checks).
  penetration() {
    let worst = 0;
    const P = this.p;
    for (let k = 0; k < this.n; k++) {
      if (this.pin[k]) continue;
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      if (Math.abs(x) < TABLE.halfX && Math.abs(z) < TABLE.halfZ) worst = Math.max(worst, -y);
      for (const [cx, cz, r, top] of this.circles) {
        const d = Math.hypot(x - cx, z - cz);
        if (d < r && y < top) worst = Math.max(worst, Math.min(r - d, top - y));
      }
    }
    return worst;
  }

  maxLift() {
    let m = 0;
    for (let k = 0; k < this.n; k++) if (Math.abs(this.p[k * 3]) < TABLE.halfX) m = Math.max(m, this.p[k * 3 + 1] - LIFT);
    return m;
  }
}
TableCloth._v = new THREE.Vector3();

function fract(v) { return v - Math.floor(v); }

// A small hanging cloth (tea towel): a grid pinned along its top edge, falling under gravity, pushed by
// the rotor's air and (outdoors) the breeze, kept off a wall plane if it has one, and shoved aside by
// the helicopter. Sleeps when nothing is moving it.
export class HangingCloth {
  // pins: array of [x, y, z] along the top edge (left to right); drop: length (m); out: unit vector the
  // towel's face looks along (for the air pressure); wall: optional { axis: 'x'|'z', at, side } plane.
  constructor(scene, quality, { pins, drop, out, map, color = 0xffffff, wall = null, outdoor = false }) {
    const NX = pins.length, NY = quality.name === 'low' ? 6 : quality.name === 'medium' ? 8 : 11;
    this.NX = NX; this.NY = NY; this.n = NX * NY;
    this.p = new Float32Array(this.n * 3); this.q = new Float32Array(this.n * 3);
    this.pinned = new Uint8Array(this.n);
    this.out = out; this.wall = wall; this.outdoor = outdoor;
    this.dy = drop / (NY - 1);
    this.dx = Math.hypot(pins[1][0] - pins[0][0], pins[1][1] - pins[0][1], pins[1][2] - pins[0][2]);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      this.p[k * 3] = pins[i][0] + out[0] * 0.002 * j; this.p[k * 3 + 1] = pins[i][1] - j * this.dy; this.p[k * 3 + 2] = pins[i][2] + out[2] * 0.002 * j;
      if (j === 0) this.pinned[k] = 1;
    }
    this.q.set(this.p);
    const cons = [];
    const add = (a, b, w) => cons.push(a, b, Math.hypot(this.p[a * 3] - this.p[b * 3], this.p[a * 3 + 1] - this.p[b * 3 + 1], this.p[a * 3 + 2] - this.p[b * 3 + 2]), w);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      if (i + 1 < NX) add(k, k + 1, 1);
      if (j + 1 < NY) add(k, k + NX, 1);
      if (i + 1 < NX && j + 1 < NY) { add(k, k + NX + 1, 0.6); add(k + 1, k + NX, 0.6); }
      if (j + 2 < NY) add(k, k + 2 * NX, 0.25);
    }
    this.cons = new Float32Array(cons);
    const geo = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(new Float32Array(this.p), 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.attr);
    const uv = new Float32Array(this.n * 2);
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) { uv[(j * NX + i) * 2] = i / (NX - 1); uv[(j * NX + i) * 2 + 1] = 1 - j / (NY - 1); }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const idx = [];
    for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) { const a = j * NX + i; idx.push(a, a + NX, a + 1, a + 1, a + NX, a + NX + 1); }
    geo.setIndex(idx);
    geo.computeVertexNormals();
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map, color, roughness: 0.95, side: THREE.DoubleSide }));
    this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.acc = 0; this.t = Math.random() * 10; this.awake = 2; this.moved = 1;
    this.centre = new THREE.Vector3(pins[Math.floor(NX / 2)][0], pins[0][1] - drop / 2, pins[Math.floor(NX / 2)][2]);
  }

  update(dt, sim, breeze) {
    const heli = sim.heli, air = sim.air;
    const nearHeli = heli && heli.pos.distanceTo(this.centre) < 0.7;
    const windy = (air && !air.calm && air.near(this.centre, 0.6)) || nearHeli || (this.outdoor && breeze);
    if (windy) this.awake = 2; else this.awake -= dt;
    if (this.awake <= 0 && this.moved < 1e-6) return;
    this.t += dt;
    this.acc = Math.min(this.acc + dt, 3 / 60);
    const h = 1 / 60, P = this.p, Q = this.q, o = this.out, v = HangingCloth._v;
    while (this.acc >= h) {
      this.acc -= h;
      let moved = 0;
      for (let k = 0; k < this.n; k++) {
        if (this.pinned[k]) continue;
        const i3 = k * 3, x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
        const vx = (x - Q[i3]) / h, vy = (y - Q[i3 + 1]) / h, vz = (z - Q[i3 + 2]) / h;
        let wx = 0, wy = 0, wz = 0;
        if (air && !air.calm) { air.sample(x, y, z, v); wx = v.x; wy = v.y; wz = v.z; }
        if (this.outdoor && breeze) {
          const g = 0.6 + 0.4 * Math.sin(this.t * 1.3 + x * 2.1) * Math.sin(this.t * 0.7 + z * 1.7);
          wx += breeze.x * breeze.z * g; wz += breeze.y * breeze.z * g;
        }
        // Pressure across the towel's face (heavy cotton: ~250 g/m^2) and a touch of flutter.
        const rx = wx - vx, ry = wy - vy, rz = wz - vz;
        const rn = rx * o[0] + ry * o[1] + rz * o[2];
        const k1 = 0.5 * 1.2 * 1.2 / 0.25;
        let ax = o[0] * k1 * rn * Math.abs(rn), ay = o[1] * k1 * rn * Math.abs(rn), az = o[2] * k1 * rn * Math.abs(rn);
        const sp = Math.sqrt(wx * wx + wz * wz);
        ax += 0.6 * sp * Math.sin(this.t * 11 + k * 1.7); az += 0.6 * sp * Math.sin(this.t * 9 + k * 2.3);
        const nx = x + (x - Q[i3]) * 0.98 + ax * h * h, ny = y + (y - Q[i3 + 1]) * 0.98 + (ay - 9.81) * h * h, nz = z + (z - Q[i3 + 2]) * 0.98 + az * h * h;
        Q[i3] = x; Q[i3 + 1] = y; Q[i3 + 2] = z;
        P[i3] = nx; P[i3 + 1] = ny; P[i3 + 2] = nz;
        moved = Math.max(moved, Math.abs(nx - x) + Math.abs(ny - y) + Math.abs(nz - z));
      }
      const C = this.cons;
      for (let it = 0; it < 3; it++) {
        for (let c = 0; c < C.length; c += 4) {
          const a = C[c] * 3, b = C[c + 1] * 3, rest = C[c + 2], w = C[c + 3];
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-9;
          let diff = (d - rest) / d; if (diff < 0) diff *= 0.3; diff *= w;
          const pa = this.pinned[C[c]], pb = this.pinned[C[c + 1]];
          const wa = pa ? 0 : pb ? 1 : 0.5, wb = pb ? 0 : pa ? 1 : 0.5;
          P[a] += dx * diff * wa; P[a + 1] += dy * diff * wa; P[a + 2] += dz * diff * wa;
          P[b] -= dx * diff * wb; P[b + 1] -= dy * diff * wb; P[b + 2] -= dz * diff * wb;
        }
        for (let k = 0; k < this.n; k++) {
          if (this.pinned[k]) continue;
          const i3 = k * 3;
          if (this.wall) { const ax2 = this.wall.axis === 'x' ? 0 : 2; const s = this.wall.side; if ((P[i3 + ax2] - this.wall.at) * s < 0) P[i3 + ax2] = this.wall.at; }
          if (heli) {
            const dx = P[i3] - heli.pos.x, dy = P[i3 + 1] - heli.pos.y, dz = P[i3 + 2] - heli.pos.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz), r = heli.type === 'micro' ? 0.06 : 0.1;
            if (d < r) { const s = r / (d || 1e-6); P[i3] = heli.pos.x + dx * s; P[i3 + 1] = heli.pos.y + dy * s; P[i3 + 2] = heli.pos.z + dz * s; }
          }
        }
      }
      this.moved = moved;
    }
    this.attr.array.set(P);
    this.attr.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
HangingCloth._v = new THREE.Vector3();
