// Frame-exact capture rig for trailer footage, driving the locally installed Chrome through playwright-core.
// The page runs on a virtual clock: requestAnimationFrame and performance.now only move when the rig steps
// a frame, so every captured frame is exactly 1/60 s of game time however long it took to render. The game's
// own audio graph is built on an OfflineAudioContext that renders in lockstep with those frames (suspended
// at each frame boundary), so the soundtrack is the game's real mix, sample-aligned to the picture.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';

export const FPS = 60;
const RATE = 48000;
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find((p) => fs.existsSync(p));

// Runs in the page before any game code: the virtual clock.
function clockInit() {
  const nativeRAF = window.requestAnimationFrame.bind(window);
  const nativeNow = performance.now.bind(performance);
  const C = window.__vclock = { on: false, t: 0, t0: 0, q: [] };
  performance.now = () => (C.on ? C.t : nativeNow());
  window.requestAnimationFrame = (cb) => {
    if (C.on) { C.q.push(cb); return -C.q.length; }
    return nativeRAF((ts) => { if (C.on) C.q.push(cb); else cb(ts); });
  };
  C.engage = () => { C.t = C.t0 = nativeNow(); C.on = true; };
  C.tick = (ms) => {
    C.t += ms;
    const q = C.q; C.q = [];
    if (window.__onFrame) window.__onFrame((C.t - C.t0) / 1000);
    for (const cb of q) cb(C.t);
  };
}

export async function launch({ headed = false } = {}) {
  return chromium.launch({ executablePath: CHROME, headless: !headed,
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--use-angle=d3d11', '--autoplay-policy=no-user-gesture-required',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--hide-scrollbars'] });
}

// Opens the game, builds its audio on an offline context of `seconds` length, starts the flight and engages
// the virtual clock. Returns a Shot with frame stepping, capture and audio export.
export async function open(browser, base, { query = '', seconds = 90, width = 1920, height = 1080 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  await ctx.addInitScript(clockInit);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  await page.goto(`${base}?worldSpeed=1&quality=high&dynres=0&record=0&fs=0&rotorStrikes=1${query}`, { waitUntil: 'load' });
  await page.waitForSelector('#start-btn:not(.hidden)', { timeout: 120000 });
  await page.evaluate(([len, rate]) => {
    const H = window.__helicoptea;
    const ctx = new OfflineAudioContext({ numberOfChannels: 2, length: Math.round(len * rate), sampleRate: rate });
    const suspendAt = OfflineAudioContext.prototype.suspend.bind(ctx), resume = OfflineAudioContext.prototype.resume.bind(ctx);
    // The game sees a running context; pausing and resuming it is the rig's job.
    Object.defineProperty(ctx, 'state', { get: () => 'running' });
    ctx.resume = () => Promise.resolve();
    ctx.suspend = () => Promise.resolve();
    H.audio.attach(ctx);
    const A = window.__aud = { ctx, suspendAt, resume, q: 128 / rate, started: false, done: null };
    A.advance = (t) => {
      const target = Math.ceil(t / A.q) * A.q;
      if (!A.started) {
        A.started = true;
        const p = suspendAt(target);
        A.done = ctx.startRendering();
        return p;
      }
      if (target <= ctx.currentTime + 1e-9) return Promise.resolve();
      const p = suspendAt(target);
      resume();
      return p;
    };
  }, [seconds, RATE]);
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__helicoptea?.started);
  await page.evaluate(() => {
    const H = window.__helicoptea;
    try { H.doAction('skiphints'); } catch { /* */ }
    // No HUD in the footage.
    const st = document.createElement('style');
    st.textContent = '#hud, .hud, #touch, .hint, #hints, .toast, .prompt, #fps-meter { display: none !important; } body { cursor: none !important; }';
    document.head.appendChild(st);
    // Autopilot on the real input pipeline, as the browser checks fly it, plus the extra controls.
    const ap = new H.Autopilot();
    const orig = H.input.update.bind(H.input);
    const P = window.__P = { ap, on: false, aim: null, damp: true, extra: {}, raw: null };
    H.input.update = (dt) => {
      const c = orig(dt);
      Object.assign(c, P.extra);
      const h = H.sim.heli;
      if (P.raw) { Object.assign(c, P.raw); return c; }
      if (!P.on || !h) return c;
      const k = H.sim.carriedCargo()[0];
      const aim = P.aim === 'load' && k ? k.pos : null;
      Object.assign(c, ap.update(h, P.damp && k ? k.vel.clone().sub(h.vel) : null, aim, dt));
      return c;
    };
    H.sim.assist = true;
    window.__vclock.engage();
  });
  return new Shot(page, ctx, logs);
}

class Shot {
  constructor(page, ctx, logs) { this.page = page; this.ctx = ctx; this.logs = logs; this.frame = 0; this.recStart = null; this.recFrames = 0; }
  // Steps n frames without capturing (the audio still renders, in lockstep).
  async run(n) {
    await this.page.evaluate(async ([n, fps]) => {
      const C = window.__vclock, A = window.__aud;
      for (let i = 0; i < n; i++) { C.tick(1000 / fps); await A.advance((C.t - C.t0) / 1000); }
    }, [n, FPS]);
    this.frame += n;
  }
  async seconds(s) { await this.run(Math.round(s * FPS)); }
  // Runs until fn(H) (evaluated in the page each frame) is true, or maxS seconds pass. Returns whether it met it.
  async until(fn, maxS = 20) {
    const r = await this.page.evaluate(async ([src, max, fps]) => {
      const C = window.__vclock, A = window.__aud, f = eval(src);
      for (let i = 0; i < max * fps; i++) {
        if (f(window.__helicoptea)) return i;
        C.tick(1000 / fps); await A.advance((C.t - C.t0) / 1000);
      }
      return -1;
    }, [fn.toString(), maxS, FPS]);
    if (r > 0) this.frame += r; else if (r < 0) this.frame += Math.round(maxS * FPS);
    return r >= 0;
  }
  eval(fn, arg) { return this.page.evaluate(fn, arg); }
  // Captures n frames as JPEGs into dir (one frame stepped before each grab).
  async record(n, dir) {
    fs.mkdirSync(dir, { recursive: true });
    if (this.recStart === null) this.recStart = this.frame + 1;
    const cdp = await this.page.context().newCDPSession(this.page);
    for (let i = 0; i < n; i++) {
      await this.run(1);
      const { data } = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 94 });
      fs.writeFileSync(path.join(dir, `f${String(this.recFrames).padStart(5, '0')}.jpg`), Buffer.from(data, 'base64'));
      this.recFrames++;
    }
    await cdp.detach();
  }
  // Finishes the offline render and writes the audio under the recorded frames as a 16-bit WAV.
  async saveAudio(file) {
    const t0 = this.recStart / FPS, t1 = (this.recStart + this.recFrames) / FPS;
    const b64 = await this.page.evaluate(async ([t0, t1]) => {
      const A = window.__aud;
      A.resume();
      const buf = await A.done;
      const r = buf.sampleRate, i0 = Math.round(t0 * r), n = Math.round((t1 - t0) * r);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      const out = new DataView(new ArrayBuffer(44 + n * 4));
      const w = (o, s) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
      w(0, 'RIFF'); out.setUint32(4, 36 + n * 4, true); w(8, 'WAVE'); w(12, 'fmt '); out.setUint32(16, 16, true);
      out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, r, true); out.setUint32(28, r * 4, true);
      out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, 'data'); out.setUint32(40, n * 4, true);
      for (let i = 0; i < n; i++) {
        const l = Math.max(-1, Math.min(1, L[i0 + i] || 0)), rr = Math.max(-1, Math.min(1, R[i0 + i] || 0));
        out.setInt16(44 + i * 4, l * 32767, true); out.setInt16(46 + i * 4, rr * 32767, true);
      }
      const bytes = new Uint8Array(out.buffer);
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(s);
    }, [t0, t1]);
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
  }
  errors() { return this.logs.filter((l) => l.includes('pageerror') || l.startsWith('[error]')); }
  close() { return this.ctx.close(); }
}
