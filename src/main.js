import './styles.css';
import * as THREE from 'three';
import { CFG } from './config.js';
import { initPhysics, RAPIER } from './sim/physics.js';
import { Sim } from './sim/sim.js';
import { buildKitchen } from './render/kitchen.js';
import { View } from './render/view.js';
import { FollowCamera } from './render/camera.js';
import { Input } from './input/input.js';
import { Audio } from './audio/audio.js';
import { Hud } from './ui/hud.js';
import { Flow } from './game/flow.js';
import { Debug } from './debug.js';
import { Autopilot } from './sim/autopilot.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const store = {
  get(k, d) { try { const v = localStorage.getItem(`helicoptea.${k}`); return v === null ? d : v; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`helicoptea.${k}`, String(v)); } catch { /* ignore */ } },
};

// ---------------------------------------------------------------- error handling
let fatal = false;
function showError(msg, detail) {
  if (fatal) return;
  fatal = true;
  console.error('[Helicoptea] fatal:', msg, detail || '');
  $('error-msg').textContent = msg;
  $('loading').classList.remove('show');
  $('error').classList.add('show');
}
window.addEventListener('error', (e) => showError('An unexpected error stopped the game. Reloading usually fixes it.', e.error || e.message));
window.addEventListener('unhandledrejection', (e) => showError('Something failed while loading. Please reload.', e.reason));

// ---------------------------------------------------------------- quality
const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const PRESETS = {
  high: { name: 'high', dprCap: 2, shadows: 2048, particles: 520, textureSize: 2048, steam: 1, antialias: true, transmission: true },
  medium: { name: 'medium', dprCap: 1.5, shadows: 1024, particles: 360, textureSize: 1024, steam: 0.7, antialias: true, transmission: false },
  low: { name: 'low', dprCap: 1, shadows: 512, particles: 220, textureSize: 1024, steam: 0.4, antialias: false, transmission: false },
};
const qualitySetting = params.get('quality') || store.get('quality', 'auto');
const quality = { ...(PRESETS[qualitySetting] || (IS_TOUCH ? PRESETS.medium : PRESETS.high)) };
quality.setting = qualitySetting;

function setProgress(frac, text) {
  $('load-fill').style.width = `${Math.round(frac * 100)}%`;
  if (text) $('load-status').textContent = text;
}

async function boot() {
  const t0 = performance.now();
  setProgress(0.05, 'Checking the graphics card…');
  const canvas = $('game');
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) { $('loading').classList.remove('show'); $('unsupported').classList.add('show'); console.warn('[Helicoptea] WebGL2 unavailable'); return; }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance', stencil: false });
  } catch (err) {
    $('loading').classList.remove('show'); $('unsupported').classList.add('show'); console.warn('[Helicoptea] renderer failed', err); return;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality.shadows > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showError('The graphics context was lost (the GPU may have been reset). Reload to continue.'); });

  setProgress(0.15, 'Starting the physics…');
  await initPhysics();
  setProgress(0.3, 'Filling the cups…');
  const sim = new Sim();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, innerWidth / innerHeight, 0.01, 12);
  // Yield between heavy steps so the progress bar paints.
  const tick = () => new Promise((r) => setTimeout(r, 0));
  let stepN = 0;
  const kitchenSteps = ['Lighting the kitchen', 'Laying the table', 'Hanging the curtains', 'Setting out the china'];
  await tick();
  const kitchen = buildKitchen(scene, renderer, quality, (msg) => { stepN++; setProgress(0.3 + 0.4 * stepN / kitchenSteps.length, `${msg}…`); });
  await tick();
  const view = new View(scene, sim, quality, kitchen);
  const camRig = new FollowCamera(camera);
  setProgress(0.78, 'Warming the shaders…');
  await tick();
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  setProgress(1, 'Ready');

  const input = new Input($('touch'));
  input.bindCanvas(canvas);
  const audio = new Audio();
  const debug = new Debug(sim, renderer, scene);
  if (params.get('debug') === '1' || store.get('debug', '0') === '1') debug.enabled = true;

  // ---------------------------------------------------------------- HUD + actions
  let paused = false;
  let started = false;
  const state = { assist: store.get('assist', '1') === '1' };
  sim.assist = state.assist;
  const hud = new Hud($('hud'), {
    action: (a, el) => doAction(a, el),
    volume: (v) => { audio.setVolume(v); if (audio.muted && v > 0) audio.setMuted(false); hud.setVolume(audio.volume, audio.muted); },
    setting: (k, v) => {
      if (k === 'quality') { store.set('quality', v); location.reload(); }
      if (k === 'debug') { debug.enabled = v; store.set('debug', v ? '1' : '0'); }
    },
  });
  const flow = new Flow(sim, hud);
  hud.setAssist(sim.assist);
  hud.setVolume(audio.volume, audio.muted);
  hud.setDevice(IS_TOUCH ? 'touch' : 'keyboard');
  if (IS_TOUCH) { document.body.classList.add('touch-ui'); $('touch').classList.remove('hidden'); }

  function setPaused(p) {
    if (p === paused || !started) return;
    paused = p;
    audio.suspend(p);
    input.enabled = !p;
    if (p) hud.openPause({ quality: quality.setting, debug: debug.enabled });
    else hud.closeModal();
  }

  function doAction(a, el) {
    switch (a) {
      case 'attach': if (!paused) sim.toggleAttach(); break;
      case 'assist':
        sim.assist = !sim.assist; store.set('assist', sim.assist ? '1' : '0');
        hud.setAssist(sim.assist); flow.noteAssistToggled();
        hud.toast(sim.assist ? 'Flight Assist on: neutral stick levels the heli' : 'Flight Assist off: you hold the attitude now');
        break;
      case 'restart': if (paused) setPaused(false); sim.restartFlight(); hud.hideCrash(); break;
      case 'reset': if (paused) setPaused(false); sim.resetSandbox(); hud.hideCrash(); camRig.recenter(0); break;
      case 'recenter': camRig.recenter(sim.heli ? sim.heli.heading() : camRig.yaw); input.camOrbit.yaw = input.camOrbit.pitch = input.camOrbit.zoom = 0; break;
      case 'pause': setPaused(!paused); break;
      case 'resume': setPaused(false); break;
      case 'help': if (hud.modalKind === 'help') hud.closeModal(); else { hud.openHelp(); } break;
      case 'closehelp': hud.closeModal(); if (paused) hud.openPause({ quality: quality.setting, debug: debug.enabled }); break;
      case 'helptab': hud.setHelpTab(el.dataset.tab); break;
      case 'mute': audio.setMuted(!audio.muted); hud.setVolume(audio.volume, audio.muted); break;
      case 'debug': debug.enabled = !debug.enabled; store.set('debug', debug.enabled ? '1' : '0'); break;
      case 'skiphints': flow.skip(); break;
      case 'resethints': flow.replay(); setPaused(false); break;
      default: break;
    }
  }

  // Pause safely on focus loss.
  window.addEventListener('blur', () => setPaused(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ---------------------------------------------------------------- resize / dynamic resolution
  let dpr = Math.min(devicePixelRatio || 1, quality.dprCap);
  let dprScale = 1;
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setPixelRatio(dpr * dprScale);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Narrow/portrait screens: widen the view so the bag stays in frame.
    camera.fov = w / h < 1 ? 62 : CFG.camera.fov;
    camera.updateProjectionMatrix();
    view.setParticleScale(h * renderer.getPixelRatio(), camera.fov);
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- start gate (audio unlock)
  const startBtn = $('start-btn');
  startBtn.classList.remove('hidden');
  $('start-hint').classList.remove('hidden');
  $('load-status').textContent = `Loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  console.info(`[Helicoptea] ready in ${(performance.now() - t0).toFixed(0)} ms | quality ${quality.name} (${quality.setting}) | dpr ${dpr.toFixed(2)} | ${debug.gpuName()} | Rapier ${RAPIER.version ? RAPIER.version() : ''}`);
  const begin = () => {
    if (started) return;
    started = true;
    audio.unlock();
    $('loading').classList.add('fade');
    setTimeout(() => $('loading').classList.remove('show'), 500);
    $('hud').classList.remove('hidden');
    removeEventListener('keydown', keyStart);
  };
  const keyStart = (e) => { if (e.code !== 'Tab') begin(); };
  startBtn.addEventListener('click', begin);
  addEventListener('keydown', keyStart);
  startBtn.focus();

  // ---------------------------------------------------------------- main loop
  const dt = sim.dt;
  let acc = 0;
  let last = performance.now();
  let frameEMA = 16.7;
  let lowFrames = 0, highFrames = 0;
  const fpsCap = parseFloat(params.get('fps')) || 0;
  let lastRender = 0;
  let crashShown = false;
  const camTarget = new THREE.Vector3();
  const tmp = new THREE.Vector3();

  function frame(now) {
    requestAnimationFrame(frame);
    if (fatal) return;
    if (fpsCap && now - lastRender < 1000 / fpsCap - 1) return;
    lastRender = now;
    const frameDt = Math.min((now - last) / 1000, CFG.physics.maxFrameDt);
    last = now;

    const ctl = input.update(frameDt);
    for (const a of input.takeActions()) {
      if (!started) continue;
      if (paused && !['pause', 'resume', 'help', 'mute', 'debug', 'restart', 'reset'].includes(a)) { if (a === 'attach') setPaused(false); continue; }
      doAction(a);
    }
    for (const n of input.takeNotices()) hud.toast(n);
    hud.setDevice(input.source);
    if (input.attachBtn) {
      input.attachBtn.classList.toggle('ready', !!sim.attachCandidate());
      input.attachBtn.querySelector('.lbl').textContent = sim.carriedBag() ? 'Drop' : 'Hook';
      input.assistBtn.classList.toggle('on', sim.assist);
    }

    // Fixed-step simulation with capped catch-up.
    let steps = 0;
    const tPhys = performance.now();
    if (started && !paused) {
      acc += frameDt;
      while (acc >= dt && steps < CFG.physics.maxStepsPerFrame) {
        sim.step(ctl);
        acc -= dt;
        steps++;
      }
      if (steps === CFG.physics.maxStepsPerFrame) acc = Math.min(acc, dt);
    }
    const physMs = performance.now() - tPhys;
    const alpha = acc / dt;

    const events = sim.drainEvents();
    view.handleEvents(events, camera, camRig);
    flow.handleEvents(events);
    audio.handleEvents(events, (p) => tmp.copy(p).project(camera).x);
    for (const e of events) {
      if (e.type === 'crash') {
        const why = e.reason === 'impact' ? `Hit at ${(e.impact).toFixed(1)} m/s. The table won.`
          : e.reason === 'rotor strike' ? 'Rotor strike. Blades and china do not mix.'
            : e.reason === 'rollover' ? 'Tipped over. Keep it level near the surface.' : 'Down she goes.';
        hud.showCrash(why);
        crashShown = true;
      }
      if (e.type === 'restart') { crashShown = false; hud.hideCrash(); }
    }

    // Camera.
    const rd = started && !paused ? frameDt : 0;
    view.update(alpha, rd, camera);
    camRig.orbitYaw = input.camOrbit.yaw;
    camRig.orbitPitch = THREE.MathUtils.clamp(input.camOrbit.pitch, -0.35, 0.7);
    camRig.zoom = THREE.MathUtils.clamp(1 + input.camOrbit.zoom, CFG.camera.minDistance / CFG.camera.distance, CFG.camera.maxDistance / CFG.camera.distance);
    camTarget.copy(view.focusPoint());
    const heading = sim.heli ? sim.heli.heading() : camRig.yaw;
    camRig.update(Math.max(rd, 1e-4), camTarget, heading, sim.carriedBag() ? view.bagPosCarried : null, sim);

    // Audio bed follows the rotor.
    const h = sim.heli;
    audio.updateRotor({
      alive: !!h && started && !paused,
      rotorSpeed: h ? h.rotorSpeed : 0,
      thrustFrac: h ? h.thrustFrac / 0.9 : 0,
      load: h ? h.load : 0,
      pan: h ? tmp.copy(h.pos).project(camera).x : 0,
      dist: h ? camera.position.distanceTo(h.pos) : 1,
    });

    // HUD.
    if (started && !paused) flow.update(frameDt);
    if (!sim.assist && h) {
      const extra = sim.carriedBag() ? sim.carriedBag().mass : 0;
      hud.setCollective(h.collective, Math.min(1, (CFG.heli.mass + extra) / (CFG.heli.mass * CFG.heli.thrustToWeight)));
    }
    hud.updateBrew(view.projectCups(camera, innerWidth, innerHeight), flow.steepTimers);
    hud.update(frameDt);

    const tR = performance.now();
    renderer.render(scene, camera);
    const renderMs = performance.now() - tR;

    // Dynamic resolution: protect frame rate before touching simulation quality.
    frameEMA = frameEMA * 0.95 + (frameDt * 1000) * 0.05;
    if (started && !paused) {
      if (frameEMA > 19.5) { lowFrames++; highFrames = 0; } else if (frameEMA < 14) { highFrames++; lowFrames = 0; } else { lowFrames = highFrames = 0; }
      if (lowFrames > 90 && dprScale > 0.55) { dprScale = Math.max(0.55, dprScale - 0.1); lowFrames = 0; resize(); }
      if (highFrames > 240 && dprScale < 1) { dprScale = Math.min(1, dprScale + 0.1); highFrames = 0; resize(); }
    }
    if (debug.enabled) hud.setDebug(debug.text({ frameDt, frameEMA, physMs, steps, renderMs, ctl, dprScale, dpr: renderer.getPixelRatio(), quality, source: input.source, gamepad: input.gp }));
    else hud.setDebug(null);
    debug.updateColliders();
  }
  requestAnimationFrame(frame);

  // Expose a tiny handle for console debugging and automated checks.
  window.__helicoptea = { Autopilot, sim, view, camRig, input, audio, renderer, quality, doAction, get paused() { return paused; }, get started() { return started; } };
}

boot().catch((err) => showError('Helicoptea failed to start. Please reload.', err));
