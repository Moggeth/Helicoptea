import * as THREE from 'three';
import { CFG } from '../config.js';
import { Sim } from '../sim/sim.js';
import { Autopilot } from '../sim/autopilot.js';
import { buildRealisticHelicopter } from '../render/heliModel.js';
import { buildChinook } from '../render/chinookModel.js';
import { buildSkycrane } from '../render/skycraneModel.js';
import { KNOB, knobDefault } from './knobs.js';
import { aircraftRange } from './tuning.js';

// Live side-by-side preview clips. Two lightweight simulations of the real flight model fly the same
// scripted inputs from the same pose; the only difference is the knob value (low vs high, or default
// vs yours). They render into one small canvas, split down the middle. Live rather than pre-recorded:
// the clips always match the current code and your other settings, there are no video files to ship,
// and the cost (two lite sims, roughly 1–3 ms a frame) only runs while the panel is open.

const CYCLE = 4.6;          // seconds of sim time per loop
const SETTLE = 0.4;         // assisted hover before the script starts (computed off-screen)
const PAD = new THREE.Vector3(-0.56, 0, 0.24);
const HEADING = -Math.PI / 2;  // nose towards +x along the clear lane through the pad
const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- scripted flights
// Each returns { start: {y, vel?: [fwd, right]}, assist, cam, ctl(t, pilot) }. t is sim seconds.
const SCENARIOS = {
  dashRelease: { y: 0.42, assist: false, cam: 'wide', ctl: (t, p) => p.fly(t < 1.3 ? -0.3 : 0, 0, { alt: true }) },
  dashHold: { y: 0.42, assist: false, cam: 'wide', ctl: (t, p) => p.fly(-0.2, 0, { alt: true }) },
  cutPower: { y: 0.3, assist: false, cam: 'side', ctl: (t, p) => p.fly(0, 0, { collective: t < 0.2 ? 0 : -1 }) },
  punchUp: { y: 0.25, assist: false, cam: 'side', ctl: (t, p) => (t < 1.2 ? p.fly(0, 0, { collective: t < 0.6 ? 1 : -1, freeYaw: true }) : p.holdHere({ freeYaw: true })) },
  fullClimb: { y: 0.22, assist: false, cam: 'side', ctl: (t, p) => p.fly(0, 0, { collective: t < 2.2 ? 1 : 0 }) },
  collTap: { y: 0.3, assist: false, cam: 'side', ctl: (t, p) => p.fly(0, 0, { collective: t > 0.3 && t < 1.3 ? 1 : 0 }) },
  rollFlick: { y: 0.42, assist: false, cam: 'behind', ctl: (t, p) => (t < 0.75 ? p.raw({ roll: t > 0.3 && t < 0.38 ? 1 : 0 }, { alt: true }) : p.hold()) },
  pitchFlick: { y: 0.42, assist: false, cam: 'side', ctl: (t, p) => (t < 0.8 ? p.raw({ pitch: t > 0.3 && t < 0.4 ? 1 : 0 }, { alt: true }) : p.hold()) },
  pedal: { y: 0.4, assist: false, cam: 'above', ctl: (t, p) => p.fly(0, 0, { alt: true, yaw: t > 0.3 && t < 1.8 ? 1 : 0 }) },
  // Trimmed for a hover well clear of the ground, then dropped to just above the pad with the same collective.
  lowHover: { y: 0.085, settleY: 0.45, assist: false, cam: 'low', ctl: (t, p) => p.hold({ collective: 0 }) },
  transLift: { y: 0.3, assist: false, cam: 'wide', ctl: (t, p) => p.fly(t < 2.4 ? -0.2 : 0, 0, { collective: 0 }) },
  sideslip: { y: 0.42, assist: false, cam: 'above', vel: [0, 0.7], ctl: (t, p) => p.fly(0, 0, { alt: true, freeYaw: true }) },
  assistDash: { y: 0.42, assist: true, cam: 'wide', ctl: (t) => ({ pitch: t < 2 ? 1 : 0, roll: 0, yaw: 0, collective: 0 }) },
  assistStep: { y: 0.42, assist: true, cam: 'side', ctl: (t) => ({ pitch: t > 0.3 && t < 1.1 ? 1 : 0, roll: 0, yaw: 0, collective: 0 }) },
  assistDrift: { y: 0.42, assist: true, cam: 'wide', vel: [0.6, 0], ctl: () => ({ pitch: 0, roll: 0, yaw: 0, collective: 0 }) },
  assistClimb: { y: 0.22, assist: true, cam: 'side', ctl: (t) => ({ pitch: 0, roll: 0, yaw: 0, collective: t < 1.5 ? 1 : 0 }) },
};

// A pilot that only moves the sticks: attitude and altitude loops, as a person would fly the script.
// With Flight Assist on (the skycrane's clips, and the assist knobs) the same intents become
// attitude and climb-rate commands, which is what the assist expects from the sticks.
class Pilot {
  constructor(sim, y0) { this.sim = sim; this.y0 = y0; }
  assistDef() {
    const a = this.sim.aircraft;
    return a === 'chinook' ? CFG.chinook.assist : a === 'skycrane' ? CFG.skycrane.assist : CFG.assist;
  }
  att() {
    const h = this.sim.heli;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(h.quat);
    const r = new THREE.Vector3(1, 0, 0).applyQuaternion(h.quat);
    const w = h.body.angvel();
    const wb = new THREE.Vector3(w.x, w.y, w.z).applyQuaternion(h.quat.clone().invert());
    return { pitch: Math.asin(clamp(f.y, -1, 1)), roll: Math.asin(clamp(-r.y, -1, 1)), wb };
  }
  def() {
    const a = this.sim.aircraft;
    return a === 'chinook' ? CFG.chinook : a === 'skycrane' ? CFG.skycrane : CFG.heli;
  }
  // With the assist off the collective stick moves the collective at a limited rate, so the
  // altitude hold picks the collective it wants (hover plus a climb or sink) and steers toward it.
  collectiveFor(opts) {
    const h = this.sim.heli;
    if (opts.collective !== undefined) return opts.collective;
    if (!opts.alt) return 0;
    if (this.sim.assist) return clamp((this.y0 - h.pos.y) * 4, -1, 1);
    const D = this.def();
    const hover = 1 / D.thrustToWeight;
    const want = hover * (1 + clamp((this.y0 - h.pos.y) * 2 - h.vel.y * 2, -0.25, 0.4));
    return clamp((want - h.collective) / (D.collectiveRate * 0.12), -1, 1);
  }
  // Seconds of travel before the collective could be back at hover, plus a margin.
  stopTime(dir = 1) {
    const D = this.def();
    return 0.6 + Math.max(0, dir * (this.sim.heli.collective - 1 / D.thrustToWeight)) / D.collectiveRate;
  }
  fly(pitchTgt, rollTgt, opts = {}) {
    if (this.sim.assist) {
      const A = this.assistDef();
      return { pitch: clamp(-pitchTgt / A.maxTilt, -1, 1), roll: clamp(rollTgt / A.maxTilt, -1, 1), yaw: opts.yaw ?? 0, collective: this.collectiveFor(opts) };
    }
    const a = this.att();
    return {
      pitch: clamp(-(pitchTgt - a.pitch) * 3 + a.wb.x * 0.5, -1, 1),
      roll: clamp((rollTgt - a.roll) * 3 + a.wb.z * 0.5, -1, 1),
      yaw: opts.yaw !== undefined ? opts.yaw : (opts.freeYaw ? 0 : clamp(a.wb.y * 0.6, -1, 1)),
      collective: this.collectiveFor(opts),
    };
  }
  // Level off and brake any drift (used to recover after a flick, so clips don't wander off).
  hold(opts = { alt: true }) {
    const h = this.sim.heli, v = h.vel;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(h.quat); f.y = 0; f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x); // right of the nose, level
    const vf = v.x * f.x + v.z * f.z, vr = v.x * r.x + v.z * r.z;
    return this.fly(clamp(vf * 0.6, -0.35, 0.35), clamp(-vr * 0.6, -0.35, 0.35), opts);
  }
  // Level off at whatever height it has reached.
  holdHere(opts = {}) {
    if (this.here === undefined) this.here = this.y0 = this.sim.heli.pos.y;
    return this.hold({ ...opts, alt: true });
  }
  raw(sticks, opts = {}) {
    return { pitch: sticks.pitch || 0, roll: sticks.roll || 0, yaw: sticks.yaw || 0, collective: this.collectiveFor(opts) };
  }
  // The preview room has a ceiling and a far wall. Extreme settings would fly the script into them,
  // so the pilot takes over (as a person would) once the aircraft is heading for either: level off
  // below the ceiling, pull up before the table, and brake before the wall. Once it takes over it keeps control for the cycle.
  guard(c) {
    const h = this.sim.heli;
    const p = h.pos, v = h.vel;
    if (!this.capY && p.y + Math.max(0, v.y) * (this.sim.assist ? 0.7 : this.stopTime()) > CEILING) this.capY = true;
    if (!this.brake && p.x + Math.max(0, v.x) * 0.9 > FAR_X) this.brake = true;
    if (!this.floor && v.y < -0.1 && p.y + v.y * (this.sim.assist ? 0.7 : this.stopTime(-1)) < FLOOR) this.floor = true;
    if (!this.capY && !this.brake && !this.floor) return c;
    if (this.capY) this.y0 = Math.min(this.y0, CEILING - 0.05);
    if (this.floor) this.y0 = Math.max(this.y0, FLOOR + 0.1);
    if (this.brake) return this.hold({ alt: true });
    return { ...c, collective: this.collectiveFor({ alt: true }) };
  }
}

// ---------------------------------------------------------------- one side of the split
const CEILING = 1.05;  // metres; the preview room's ceiling is higher, this leaves room to stop
const FAR_X = 1.6;
const FLOOR = 0.12;

class Side {
  constructor(rig, aircraft) {
    this.rig = rig;
    this.aircraft = aircraft;
    this.sim = new Sim({ aircraft, lite: true, bare: true });
    this.model = rig.makeModel(aircraft);
    rig.scene.add(this.model);
    this.trail = new Float32Array(240 * 3);
    this.points = [];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.trail, 3).setUsage(THREE.DynamicDrawUsage));
    this.trailLine = new THREE.Line(g, new THREE.LineBasicMaterial({ color: 0xd8462f, transparent: true, opacity: 0.85 }));
    this.trailLine.frustumCulled = false;
    rig.scene.add(this.trailLine);
    this.dots = [];
    for (let i = 0; i < 12; i++) {
      const d = new THREE.Mesh(rig.dotGeo, rig.dotMat);
      d.visible = false;
      rig.scene.add(d);
      this.dots.push(d);
    }
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10);
    this.camTarget = new THREE.Vector3();
    this.acc = 0;
    this.t = 0;
  }

  reset(sc) {
    const sim = this.sim;
    sim.restartFlight();
    sim.world.gravity = { x: 0, y: -CFG.physics.gravity, z: 0 };
    const h = sim.heli;
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), HEADING);
    const start = this.rig.startPos(sc);
    const settle = { ...start, y: sc.settleY ?? start.y };
    h.body.setTranslation(settle, true);
    h.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    h.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    h.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    // Settle into a hover with the assist (off-screen), so every clip starts trimmed and level.
    sim.assist = true;
    const ap = new Autopilot();
    ap.target.copy(settle); ap.yaw = HEADING; ap.maxSpeed = 0.05;
    for (let i = 0; i < Math.round(SETTLE / sim.dt) && sim.heli; i++) sim.step(ap.update(sim.heli, null, null, sim.dt));
    if (!sim.heli) return;
    h.body.setTranslation(start, true);
    h.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    h.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    const v0 = sc.vel || [0, 0];
    // forward is +x (heading), right is +z
    h.body.setLinvel({ x: v0[0], y: 0, z: v0[1] }, true);
    // The skycrane is hard to hold steady with the assist off, so its clips fly with the assist on.
    sim.assist = sc.assist || this.aircraft === 'skycrane';
    sim.drainEvents();
    this.pilot = new Pilot(sim, start.y);
    this.t = 0;
    this.acc = 0;
    this.points.length = 0;
    this.lastDot = -1;
    this.dotsOn = 0;
    this.camTarget.copy(start);
  }

  advance(frameDt, speed, sc) {
    const sim = this.sim;
    sim.world.gravity = { x: 0, y: -CFG.physics.gravity, z: 0 };
    this.acc += frameDt * speed;
    let n = 0;
    while (this.acc >= sim.dt && n < 24) {
      if (sim.heli && sim.state === 'flying') sim.step(this.pilot.guard(sc.ctl(this.t, this.pilot)));
      else sim.step({ pitch: 0, roll: 0, yaw: 0, collective: 0 });
      this.t += sim.dt;
      this.acc -= sim.dt;
      n++;
    }
    sim.drainEvents();
  }

  draw(alphaUnused) {
    const sim = this.sim, h = sim.heli;
    if (!h) { this.model.visible = false; return; }
    this.model.visible = true;
    this.model.position.copy(h.pos);
    this.model.quaternion.copy(h.quat);
    const U = this.model.userData;
    const rotors = U.rotors || (U.rotor ? [U.rotor] : []);
    rotors.forEach((r, i) => {
      r.rotation.y = h.phaseOf ? h.phaseOf(i) : h.rotorPhase;
      if (r.userData.disc) r.userData.disc.material.uniforms.uOpacity.value = 0.9;
    });
    if (U.tailRotor) U.tailRotor.rotation.x = h.tailPhase || 0;
    // trail (last four seconds)
    this.points.push(h.pos.x, h.pos.y, h.pos.z);
    if (this.points.length > 240 * 3) this.points.splice(0, 3);
    this.trail.set(this.points);
    const g = this.trailLine.geometry;
    g.setDrawRange(0, this.points.length / 3);
    g.attributes.position.needsUpdate = true;
    // half-second markers
    const k = Math.floor(this.t / 0.5);
    if (k !== this.lastDot && k < this.dots.length) {
      this.lastDot = k;
      this.dots[k].position.copy(h.pos);
      this.dotsOn = k + 1;
    }
  }
}

// ---------------------------------------------------------------- the rig
export class PreviewRig {
  constructor(canvas, tuning) {
    this.canvas = canvas;
    this.tuning = tuning;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe9dcc5);
    this.scene.add(new THREE.HemisphereLight(0xf2f0ea, 0x8a6a4a, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.2);
    sun.position.set(-1, 2, 1);
    this.scene.add(sun);
    // Table with a 5 cm grid, plus a couple of posts for scale and speed reference.
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#c99a68'; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = 'rgba(70,40,20,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke(); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(10, 10); tex.anisotropy = 4;
    const table = new THREE.Mesh(new THREE.PlaneGeometry(4, 4), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9 }));
    table.rotation.x = -Math.PI / 2;
    table.position.set(0.3, 0, 0.2);
    this.scene.add(table);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.007, 40), new THREE.MeshStandardMaterial({ color: 0xb98b5a, roughness: 0.95 }));
    pad.position.set(PAD.x, 0.0035, PAD.z);
    this.scene.add(pad);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x7f9c8a, roughness: 0.6 });
    for (let k = 0; k < 8; k++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.5, 8), postMat);
      post.position.set(-0.3 + k * 0.3, 0.25, PAD.z - 0.35);
      this.scene.add(post);
    }
    this.dotGeo = new THREE.SphereGeometry(0.006, 10, 8);
    this.dotMat = new THREE.MeshBasicMaterial({ color: 0x2b2d33 });
    this.sides = null;
    this.aircraft = null;
    this.running = false;
    this.last = 0;
    this.spec = null;
  }

  makeModel(aircraft) {
    if (aircraft === 'chinook') return buildChinook();
    if (aircraft === 'skycrane') return buildSkycrane();
    return buildRealisticHelicopter({ name: 'medium' });
  }

  startPos(sc) { return { x: PAD.x, y: sc.y, z: PAD.z }; }

  ensureSides(aircraft) {
    if (this.aircraft === aircraft && this.sides) return;
    if (this.sides) for (const s of this.sides) { this.scene.remove(s.model, s.trailLine, ...s.dots); }
    this.sides = [new Side(this, aircraft), new Side(this, aircraft)];
    this.aircraft = aircraft;
  }

  // spec: { knobId, scope ('global' | aircraft), aircraft, mode ('range' | 'yours') }
  show(spec) {
    const k = KNOB[spec.knobId];
    if (!k || !k.clip || k.clip.scenario === 'curve') { this.stop(); return null; }
    this.spec = { ...spec, scenario: SCENARIOS[k.clip.scenario] };
    this.ensureSides(spec.aircraft);
    this.values = this.valuesFor(k, spec);
    this.cycleStart = performance.now();
    this.resetSides();
    if (!this.running) { this.running = true; this.last = performance.now(); requestAnimationFrame((t) => this.frame(t)); }
    return this.values;
  }

  valuesFor(k, spec) {
    const t = this.tuning;
    let lo, hi, cur, def;
    if (spec.scope === 'global') {
      [lo, hi] = [k.min, k.max];
      cur = t.getGlobal(k.id);
      def = k.kind === 'world' ? CFG.physics.worldSpeed : knobDefault(k);
    } else {
      [lo, hi] = aircraftRange(k);
      cur = t.getAircraft(spec.scope, k.id);
      def = 1;
    }
    return spec.mode === 'yours' ? [def, cur] : [lo, hi];
  }

  // Write the knob's value for one side into CFG (and remember the world speed for that side).
  applySide(i) {
    const k = KNOB[this.spec.knobId];
    const v = this.values[i];
    if (k.kind === 'world') { this.tuning.apply(); return v; }
    this.tuning.apply({ scope: this.spec.scope, id: k.id, value: v });
    return this.tuning.getGlobal('worldSpeed');
  }

  resetSides() {
    const sc = this.spec.scenario;
    this.sides.forEach((s, i) => { this.applySide(i); s.reset(sc); });
    this.tuning.apply();
  }

  stop() { this.running = false; }

  frame(now) {
    if (!this.running) return;
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const sc = this.spec.scenario;
    const t0 = performance.now();
    this.sides.forEach((s, i) => { const speed = this.applySide(i); s.advance(dt, speed, sc); });
    this.tuning.apply();
    this.simMs = performance.now() - t0;
    if (this.sides[0].t > CYCLE && this.sides[1].t > CYCLE) this.resetSides();
    this.render();
  }

  render() {
    const r = this.renderer;
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (this.canvas.width !== Math.round(w * r.getPixelRatio()) || this.canvas.height !== Math.round(h * r.getPixelRatio())) r.setSize(w, h, false);
    const half = Math.floor(w / 2);
    const sc = this.spec.scenario;
    r.setScissorTest(true);
    this.sides.forEach((s, i) => {
      // only this side's aircraft, trail and markers are visible
      this.sides.forEach((o, j) => {
        o.model.visible = false;
        o.trailLine.visible = j === i;
        o.dots.forEach((d, n) => { d.visible = j === i && n < (o.dotsOn || 0); });
      });
      s.draw();
      this.placeCamera(s, sc, half / h);
      r.setViewport(i * half, 0, half, h);
      r.setScissor(i * half, 0, half, h);
      r.render(this.scene, s.camera);
    });
    r.setScissorTest(false);
  }

  placeCamera(s, sc, aspect) {
    const cam = s.camera;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    const start = this.startPos(sc);
    const h = s.sim.heli;
    const p = h ? h.pos : new THREE.Vector3(start.x, start.y, start.z);
    const size = this.aircraft === 'micro' ? 1 : 1.6;
    if (sc.cam === 'wide') {
      cam.position.set(start.x + 1.0, start.y + 0.3, start.z + 2.0 * size);
      cam.lookAt(start.x + 1.0, start.y - 0.05, start.z);
    } else if (sc.cam === 'above') {
      s.camTarget.lerp(p, 0.1);
      cam.position.set(s.camTarget.x, s.camTarget.y + 0.55 * size, s.camTarget.z + 0.3 * size);
      cam.lookAt(s.camTarget);
    } else if (sc.cam === 'behind') {
      s.camTarget.lerp(p, 0.1);
      cam.position.set(s.camTarget.x - 0.5 * size, s.camTarget.y + 0.12, s.camTarget.z);
      cam.lookAt(s.camTarget);
    } else if (sc.cam === 'low') {
      cam.position.set(start.x + 0.05, 0.2, start.z + 0.7 * size);
      cam.lookAt(start.x, 0.11, start.z);
    } else {
      s.camTarget.lerp(p, 0.1);
      cam.position.set(s.camTarget.x, s.camTarget.y + 0.08, s.camTarget.z + 0.62 * size);
      cam.lookAt(s.camTarget.x, s.camTarget.y, s.camTarget.z);
    }
  }

  dispose() {
    this.stop();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

// Stick curves (deadzone, expo, rates) are clearer as an animated graph than as a flight.
export function drawCurve(canvas, knobId, values, phase) {
  const g = canvas.getContext('2d');
  const w = canvas.width = canvas.clientWidth * (devicePixelRatio || 1);
  const h = canvas.height = canvas.clientHeight * (devicePixelRatio || 1);
  g.fillStyle = '#f8f1e4'; g.fillRect(0, 0, w, h);
  const half = w / 2;
  const shape = (x, v) => {
    const d = knobId === 'deadzone' ? v : 0, e = knobId === 'expo' ? v : 0, r = knobId === 'rates' ? v : 1;
    const a = Math.abs(x);
    if (a <= d) return 0;
    const n = (a - d) / (1 - d);
    return Math.sign(x) * Math.min(1, ((1 - e) * n + e * n * n * n) * r);
  };
  const sweep = Math.sin(phase * Math.PI * 2 / 4) ; // -1..1 over four seconds
  values.forEach((v, i) => {
    const x0 = i * half + 18, y0 = h - 22, W = half - 36, H = h - 44;
    g.strokeStyle = 'rgba(42,29,22,0.25)'; g.lineWidth = 1;
    g.strokeRect(x0, y0 - H, W, H);
    g.beginPath(); g.moveTo(x0 + W / 2, y0); g.lineTo(x0 + W / 2, y0 - H); g.moveTo(x0, y0 - H / 2); g.lineTo(x0 + W, y0 - H / 2); g.stroke();
    g.strokeStyle = '#c8553d'; g.lineWidth = 3 * (devicePixelRatio || 1);
    g.beginPath();
    for (let k = 0; k <= 100; k++) {
      const x = -1 + k / 50, y = shape(x, v);
      const px = x0 + (x + 1) / 2 * W, py = y0 - (y + 1) / 2 * H;
      if (k === 0) g.moveTo(px, py); else g.lineTo(px, py);
    }
    g.stroke();
    // moving stick dot
    const y = shape(sweep, v);
    g.fillStyle = '#2a1d16';
    g.beginPath(); g.arc(x0 + (sweep + 1) / 2 * W, y0 - (y + 1) / 2 * H, 6 * (devicePixelRatio || 1), 0, Math.PI * 2); g.fill();
    // output bar
    g.fillStyle = 'rgba(200,85,61,0.35)';
    g.fillRect(x0 + W + 6, y0 - H / 2, 8, -y * H / 2);
  });
}
