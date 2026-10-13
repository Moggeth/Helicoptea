import * as THREE from 'three';
import { CFG } from './config.js';

// Debug overlay (toggle with ` or F3, or ?debug=1): timings, bodies, inputs, assist, cargo state.
// Press F4 with the overlay open to draw the physics colliders.
export class Debug {
  constructor(sim, renderer, scene) {
    this.sim = sim;
    this.renderer = renderer;
    this.scene = scene;
    this.enabled = false;
    this.showColliders = false;
    this.lastText = 0;
    this.cached = '';
    this.physAcc = 0; this.physN = 0;
    this.lines = null;
    addEventListener('keydown', (e) => { if (e.code === 'F4' && this.enabled) { e.preventDefault(); this.showColliders = !this.showColliders; } });
  }

  gpuName() {
    try {
      const gl = this.renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    } catch { return 'unknown GPU'; }
  }

  text(f) {
    this.physAcc += f.physMs; this.physN++;
    const now = performance.now();
    if (now - this.lastText < 250) return this.cached;
    this.lastText = now;
    const s = this.sim, h = s.heli, b = s.carriedBag();
    const info = this.renderer.info;
    const physAvg = this.physAcc / Math.max(1, this.physN);
    this.physAcc = 0; this.physN = 0;
    const n = (x, d = 2) => (x >= 0 ? ' ' : '') + x.toFixed(d);
    const lines = [
      `frame ${f.frameEMA.toFixed(1)} ms (${(1000 / f.frameEMA).toFixed(0)} fps)  render ${f.renderMs.toFixed(2)} ms`,
      `physics ${physAvg.toFixed(2)} ms/frame  ${f.steps} steps @ ${CFG.physics.hz} Hz  step ${s.lastStepMs.toFixed(3)} ms`,
      `bodies ${s.world.bodies.len()}  colliders ${s.world.colliders.len()}  bags ${s.bags.length}  debris ${s.debris.length}  drips ${s.drips.length}`,
      `draw calls ${info.render.calls}  tris ${(info.render.triangles / 1000).toFixed(1)}k  dpr ${f.dpr.toFixed(2)} (x${f.dprScale.toFixed(2)})  ${f.quality.name}`,
      `input [${f.source}${f.gamepad.connected ? ` | ${f.gamepad.id.slice(0, 36)}` : ''}] pitch${n(f.ctl.pitch)} roll${n(f.ctl.roll)} yaw${n(f.ctl.yaw)} coll${n(f.ctl.collective)}`,
      `assist ${s.assist ? 'ON ' : 'OFF'}  state ${s.state}`,
    ];
    if (h) {
      const tilt = Math.acos(Math.min(1, h.up.y)) * 57.3;
      lines.push(`heli pos ${n(h.pos.x)} ${n(h.pos.y)} ${n(h.pos.z)}  v ${h.vel.length().toFixed(2)} m/s  tilt ${tilt.toFixed(1)}°`);
      if (h.type === 'chinook') lines.push(`rotors F ${(h.rotorT[0] * 1000).toFixed(0)} mN  A ${(h.rotorT[1] * 1000).toFixed(0)} mN  disc tilt ${(h.tilt[0] * 57.3).toFixed(1)}° / ${(h.tilt[1] * 57.3).toFixed(1)}°  mix p ${h.mix.pitch.toFixed(2)} r ${h.mix.roll.toFixed(2)} y ${h.mix.yaw.toFixed(2)}  trim ${h.trim[0].toFixed(2)} ${h.trim[1].toFixed(2)}  bags ${s.carriedBags().length}/3`);
      lines.push(`collective ${h.collective.toFixed(2)}  thrust/W ${(h.thrust / ((h.def ? h.def.mass : CFG.heli.mass) * 9.81)).toFixed(2)}  rotor ${(h.rotorSpeed * 100).toFixed(0)}%  ground ${h.skidClearance.toFixed(3)} m${h.grounded ? ' (landed)' : ''}`);
    }
    if (b) lines.push(`cargo mass ${(b.mass * 1000).toFixed(1)} g  wet ${(b.wetness * 100).toFixed(0)}%  immersion ${(b.immersion * 100).toFixed(0)}%  tension ${(b.tension * 1000).toFixed(0)} mN  potency ${(b.potency * 100).toFixed(0)}%`);
    const tk = h && h.tank;
    if (tk) lines.push(`tank ${(tk.vol * 1e6).toFixed(1)} ml  doors ${(tk.doors * 100).toFixed(0)}%${tk.salvo ? ' SALVO' : ''}  pump ${(tk.pump * 100).toFixed(0)}% in ${(tk.flowIn * 1e6).toFixed(1)} out ${(tk.flowOut * 1e6).toFixed(1)} ml/s  hose ${(h.hose.length * 100).toFixed(1)} cm${h.hose.submerged ? ` in ${h.hose.submerged.name} ${(h.hose.depth * 1000).toFixed(0)} mm` : ''}${tk.auto ? ` auto:${tk.auto.phase}` : ''}  tail ${(h.tailT * 1000).toFixed(0)} mN  mass ${(h.body.mass() * 1000).toFixed(0)} g`);
    const k = s.milk.bucket;
    if (k) lines.push(`bucket ${(k.vol * 1e6).toFixed(1)} ml (${(k.fill * 100).toFixed(0)}%)  ${(k.mass * 1000).toFixed(1)} g  in ${(k.flowIn * 1e6).toFixed(1)} out ${(k.flowOut * 1e6).toFixed(1)} spill ${(k.spillRate * 1e6).toFixed(1)} ml/s  valve ${k.valveOpen ? 'OPEN' : 'shut'}  stream ${s.milk.parcels.length}  puddles ${s.milk.puddles.length}  crock ${(s.milk.bowl.vol * 1e6).toFixed(0)} ml`);
    lines.push(`cups ${s.cups.map((c) => `${c.name} ${(c.brew * 100).toFixed(0)}% milk ${((c.milk || 0) * 100).toFixed(1)}%`).join('  ')}`);
    lines.push('F4 colliders');
    this.cached = lines.join('\n');
    return this.cached;
  }

  updateColliders() {
    if (!(this.enabled && this.showColliders)) { if (this.lines) this.lines.visible = false; return; }
    const { vertices, colors } = this.sim.world.debugRender();
    if (!this.lines) {
      this.lines = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.6 }));
      this.lines.renderOrder = 20;
      this.lines.frustumCulled = false;
      this.scene.add(this.lines);
    }
    this.lines.visible = true;
    const g = this.lines.geometry;
    g.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  }
}
