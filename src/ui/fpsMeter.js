// Frame-rate readout (F2, or Pause → Frame rate readout): frames per second, average frame time, the 1% low
// (the frame rate of the slowest 1% of frames, which is what a stutter feels like), the display's refresh
// rate as the browser paces it, and where the time goes (main-thread CPU, GPU when the browser reports it).
// Text is rewritten four times a second, not every frame.
const RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 175, 180, 200, 240, 280, 360];

export class FpsMeter {
  constructor(root, perf) {
    this.perf = perf;
    this.el = document.createElement('div');
    this.el.className = 'fps-meter hidden';
    this.el.setAttribute('aria-hidden', 'true');
    root.appendChild(this.el);
    this.enabled = false;
    this.t = 0;
    this.win = [];          // frame intervals this second
    this.bestMedian = Infinity;
  }

  set shown(on) { this.enabled = on; this.el.classList.toggle('hidden', !on); }
  get shown() { return this.enabled; }

  // The display's refresh rate: the shortest median frame interval (over 30+ frames) seen so far (the browser paces
  // frames to the display, so whenever the game keeps up the median is one refresh period), snapped to a
  // common rate when close to one.
  get refreshHz() {
    if (!isFinite(this.bestMedian)) return 0;
    const hz = 1000 / this.bestMedian;
    let best = 0;
    for (const r of RATES) if (Math.abs(r - hz) / r < 0.03) best = r;
    return best || Math.round(hz);
  }

  // Called every frame with the interval since the last one (ms).
  frame(dtMs) {
    if (dtMs > 0 && dtMs < 250) this.win.push(dtMs);
    this.t += dtMs;
    if (this.t < 250) return;
    this.t = 0;
    // Refresh estimate from windows of at least 30 frames.
    if (this.win.length >= 30) {
      const a = this.win.slice().sort((x, y) => x - y);
      const med = a[a.length >> 1];
      if (med < this.bestMedian) this.bestMedian = med;
      this.win.length = 0;
    }
    if (!this.enabled) return;
    const s = this.perf.summary(Math.min(this.perf.n, 360));
    const hz = this.refreshHz;
    const gpu = this.perf.gpuMs >= 0 ? ` · gpu ${this.perf.gpuMs.toFixed(1)}` : '';
    this.el.textContent = `${Math.round(s.fps)} fps · ${s.avgMs.toFixed(1)} ms · 1% low ${Math.round(s.low1)}${hz ? ` · ${hz} Hz display` : ''}\ncpu ${s.cpuMs.toFixed(1)}${gpu} ms per frame`;
    this.el.classList.toggle('short', hz > 0 && s.fps < hz * 0.95);
  }
}
