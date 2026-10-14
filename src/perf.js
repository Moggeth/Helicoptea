// Frame timing: frame intervals (what the player sees), CPU time per phase of the loop, and GPU time
// (EXT_disjoint_timer_query_webgl2 where the browser offers it). Feeds the on-screen fps readout and the
// benchmark script (tests/perf-bench.mjs reads window.__helicoptea.perf).
const N = 600; // ring of recent frames (5 s at 120 Hz)

export class FrameStats {
  constructor(gl) {
    this.dt = new Float32Array(N);     // ms between frames
    this.cpu = new Float32Array(N);    // ms of main-thread work inside the frame callback
    this.n = 0; this.i = 0;
    this.phase = { sim: 0, update: 0, render: 0 };   // smoothed ms
    this.raw = { sim: new Float32Array(N), update: new Float32Array(N), render: new Float32Array(N) }; // per frame
    this.gpuMs = -1;                   // smoothed GPU ms (-1: not available)
    this.gl = gl;
    this.ext = gl && new URLSearchParams(location.search).get('gputimer') !== '0' ? gl.getExtension('EXT_disjoint_timer_query_webgl2') : null;
    this.queries = [];                 // in flight, oldest first
    this.active = null;
  }

  frame(dtMs, cpuMs) {
    this.dt[this.i] = dtMs; this.cpu[this.i] = cpuMs;
    this.i = (this.i + 1) % N; this.n = Math.min(N, this.n + 1);
  }

  phaseMs(k, ms) { this.phase[k] += (ms - this.phase[k]) * 0.05; this.raw[k][(this.i - 1 + N) % N] = ms; }

  // Worst value of each phase over the last `count` frames (where a hitch came from).
  phaseMax(count = this.n) {
    const out = {};
    for (const k of Object.keys(this.raw)) { let m = 0; for (let j = 0; j < Math.min(count, this.n); j++) m = Math.max(m, this.raw[k][(this.i - 1 - j + N) % N]); out[k] = +m.toFixed(1); }
    return out;
  }

  gpuBegin() {
    const gl = this.gl, ext = this.ext;
    if (!ext || this.active) return;
    // Collect finished queries (results arrive a few frames late).
    while (this.queries.length) {
      const q = this.queries[0];
      if (!gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE)) break;
      this.queries.shift();
      if (!gl.getParameter(ext.GPU_DISJOINT_EXT)) {
        const ms = gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
        this.gpuMs = this.gpuMs < 0 ? ms : this.gpuMs + (ms - this.gpuMs) * 0.05;
      }
      gl.deleteQuery(q);
    }
    if (this.queries.length > 4) return; // the GPU is far behind; don't pile more on
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q);
    this.active = q;
  }

  gpuEnd() {
    if (!this.active) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.queries.push(this.active);
    this.active = null;
  }

  // Summary of the last `count` frames: average, 1% low (fps of the slowest 1% of frames), worst.
  summary(count = this.n) {
    const k = Math.min(count, this.n);
    if (!k) return { fps: 0, avgMs: 0, low1: 0, p99Ms: 0, worstMs: 0, cpuMs: 0, cpuP99: 0, cpuMax: 0, frames: 0 };
    const a = new Float32Array(k);
    const c = new Float32Array(k);
    let sum = 0, cpu = 0;
    for (let j = 0; j < k; j++) { const idx = (this.i - 1 - j + N) % N; a[j] = this.dt[idx]; sum += a[j]; c[j] = this.cpu[idx]; cpu += c[j]; }
    a.sort(); c.sort();
    const p99 = a[Math.min(k - 1, Math.floor(k * 0.99))];
    // 1% low: average frame time of the slowest 1% of frames, as fps.
    const m = Math.max(1, Math.floor(k * 0.01));
    let slow = 0;
    for (let j = k - m; j < k; j++) slow += a[j];
    const avg = sum / k;
    return { fps: 1000 / avg, avgMs: avg, low1: 1000 / (slow / m), p99Ms: p99, worstMs: a[k - 1], cpuMs: cpu / k, cpuP99: c[Math.min(k - 1, Math.floor(k * 0.99))], cpuMax: c[k - 1], frames: k };
  }
}
