import * as THREE from 'three';

// Fixed-size particle pool rendered as one Points draw call. CPU-integrated; bounded by construction.
export class ParticlePool {
  constructor(max, { additive = false, soft = true } = {}) {
    this.max = max;
    this.count = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.c = new Float32Array(max * 4);
    this.s = new Float32Array(max);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.kind = new Uint8Array(max);
    this.size0 = new Float32Array(max);
    this.size1 = new Float32Array(max);
    this.col0 = new Float32Array(max * 3);
    this.col1 = new Float32Array(max * 3);
    this.alpha0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.p, 3).setUsage(THREE.DynamicDrawUsage);
    this.colAttr = new THREE.BufferAttribute(this.c, 4).setUsage(THREE.DynamicDrawUsage);
    this.sizeAttr = new THREE.BufferAttribute(this.s, 1).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setAttribute('size', this.sizeAttr);
    geo.setDrawRange(0, 0);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 800 } },
      vertexShader: `
        attribute float size; attribute vec4 color; varying vec4 vColor; uniform float uScale;
        void main(){ vColor = color; vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = clamp(size * uScale / -mv.z, 1.0, 256.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `
        varying vec4 vColor;
        void main(){ vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0;
          float a = ${soft ? 'exp(-r * 3.0) * (1.0 - r)' : 'step(r, 1.0)'};
          if (a <= 0.002) discard;
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.visible = false;
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 4 : 3;
  }

  // o: { p:[x,y,z], v:[x,y,z], life, size0, size1, col0:[r,g,b], col1, alpha, grav, drag, kind }
  emit(o) {
    let i = this.count;
    if (i >= this.max) {
      // Replace the oldest-looking particle (largest age fraction) to stay bounded.
      let best = 0, bestF = -1;
      for (let k = 0; k < this.max; k += 7) { const f = this.age[k] / this.life[k]; if (f > bestF) { bestF = f; best = k; } }
      i = best;
    } else this.count++;
    this.p[i * 3] = o.p[0]; this.p[i * 3 + 1] = o.p[1]; this.p[i * 3 + 2] = o.p[2];
    this.v[i * 3] = o.v[0]; this.v[i * 3 + 1] = o.v[1]; this.v[i * 3 + 2] = o.v[2];
    this.life[i] = o.life; this.age[i] = 0;
    this.size0[i] = o.size0; this.size1[i] = o.size1 ?? o.size0;
    this.col0.set(o.col0, i * 3); this.col1.set(o.col1 || o.col0, i * 3);
    this.alpha0[i] = o.alpha ?? 1;
    this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 0;
    this.kind[i] = o.kind ?? 0;
  }

  // onLand(x, y, z): if given, heavy particles (drops) that reach the floor are absorbed and reported.
  update(dt, floorFn, windFn, onLand) {
    if (!this.count) return; // idle effect pools do no integration, uploads or render-list work
    const wv = this._wv || (this._wv = { x: 0, y: 0, z: 0, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; }, addScaledVector(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; } });
    let n = this.count;
    for (let i = 0; i < n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        n--;
        this.copy(n, i);
        i--;
        continue;
      }
      const k = i * 3;
      const dr = Math.exp(-this.drag[i] * dt);
      this.v[k] *= dr; this.v[k + 1] = this.v[k + 1] * dr - this.grav[i] * dt; this.v[k + 2] *= dr;
      if (windFn) {
        // Light particles (smoke, steam, dust) ride the rotor wash; heavy ones (sparks, drops) barely.
        const c = Math.min(1, dt * (this.kind[i] === 1 ? 0.6 : 4.5));
        windFn(this.p[k], this.p[k + 1], this.p[k + 2], wv);
        this.v[k] += (wv.x - this.v[k]) * c * (wv.x !== 0 ? 1 : 0);
        this.v[k + 1] += wv.y * c * 0.6;
        this.v[k + 2] += (wv.z - this.v[k + 2]) * c * (wv.z !== 0 ? 1 : 0);
      }
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      if (floorFn && this.kind[i] === 1) {
        const fy = floorFn(this.p[k], this.p[k + 2]);
        if (this.p[k + 1] < fy) {
          if (onLand) { onLand(this.p[k], fy, this.p[k + 2]); this.age[i] = this.life[i]; this.c[i * 4 + 3] = 0; continue; }
          this.p[k + 1] = fy; this.v[k + 1] *= -0.35; this.v[k] *= 0.6; this.v[k + 2] *= 0.6;
        }
      }
      const t = this.age[i] / this.life[i];
      this.s[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      const c0 = this.col0, c1 = this.col1;
      this.c[i * 4] = c0[k] + (c1[k] - c0[k]) * t;
      this.c[i * 4 + 1] = c0[k + 1] + (c1[k + 1] - c0[k + 1]) * t;
      this.c[i * 4 + 2] = c0[k + 2] + (c1[k + 2] - c0[k + 2]) * t;
      const fadeIn = Math.min(1, this.age[i] / 0.06);
      this.c[i * 4 + 3] = this.alpha0[i] * fadeIn * (1 - t) * (1 - t * 0.3);
    }
    this.count = n;
    this.points.geometry.setDrawRange(0, n);
    this.points.visible = n > 0;
    if (n) for (const a of [this.posAttr, this.colAttr, this.sizeAttr]) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
  }

  copy(from, to) {
    if (from === to) return;
    for (let a = 0; a < 3; a++) {
      this.p[to * 3 + a] = this.p[from * 3 + a]; this.v[to * 3 + a] = this.v[from * 3 + a];
      this.col0[to * 3 + a] = this.col0[from * 3 + a]; this.col1[to * 3 + a] = this.col1[from * 3 + a];
    }
    for (let a = 0; a < 4; a++) this.c[to * 4 + a] = this.c[from * 4 + a];
    this.s[to] = this.s[from]; this.life[to] = this.life[from]; this.age[to] = this.age[from];
    this.size0[to] = this.size0[from]; this.size1[to] = this.size1[from]; this.alpha0[to] = this.alpha0[from];
    this.grav[to] = this.grav[from]; this.drag[to] = this.drag[from]; this.kind[to] = this.kind[from];
  }

  clear() { this.count = 0; this.points.geometry.setDrawRange(0, 0); this.points.visible = false; }
}
