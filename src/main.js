import './styles.css';
import * as tuningKnobs from './tuning/knobs.js';
import { Tuning } from './tuning/tuning.js';
import { TuningPanel } from './ui/tuningPanel.js';
import * as THREE from 'three';
import { CFG } from './config.js';
import { initPhysics, RAPIER, GROUPS } from './sim/physics.js';
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
import { Post } from './render/post.js';
import { AIRCRAFT_IDS, AIRCRAFT_NAMES, gearDrop } from './sim/aircraft.js';
import { CockpitRig, LoadCamera, SEATS } from './render/cockpitCam.js';
import { Cockpit } from './render/cockpit.js';
import { DepthCues, DEPTH_DEFAULTS } from './render/depthCues.js';
import { FlightRecorder } from './replay/recorder.js';
import { FlightStore } from './replay/store.js';
import { ReplayStage } from './replay/stage.js';
import { ReplayViewer } from './replay/viewer.js';
import { stageCrash, STAGES } from './sim/crashStage.js';
import { CrashCinema, crashMessage, crashTitle } from './game/crashCinema.js';
import { CAM_IDS, CAM_NAME, DEFAULT_CYCLE, LockedRig, NoseRig, BoltRig, TripodRig, CargoRig, liquidAt } from './render/cameraModes.js';

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
  high: { name: 'high', dprCap: 2, shadows: 2048, particles: 520, textureSize: 2048, steam: 1, antialias: true, transmission: true, ao: true, aoSamples: 16 },
  medium: { name: 'medium', dprCap: 1.5, shadows: 1024, particles: 360, textureSize: 1024, steam: 0.7, antialias: true, transmission: false, ao: !IS_TOUCH, aoSamples: 8 },
  low: { name: 'low', dprCap: 1, shadows: 512, particles: 220, textureSize: 1024, steam: 0.4, antialias: false, transmission: false, ao: false },
};
const qualitySetting = params.get('quality') || store.get('quality', 'auto');
const quality = { ...(PRESETS[qualitySetting] || (IS_TOUCH ? PRESETS.medium : PRESETS.high)) };
quality.setting = qualitySetting;
const applyAoParam = () => {
  if (params.get('ao') === '0') quality.ao = false;
  if (params.get('ao') === '1') quality.ao = true;
};
applyAoParam();
// A software renderer (no usable GPU: SwiftShader, Windows' Basic Render Driver / WARP, Mesa llvmpipe) is
// limited by how many pixels it shades, so there Auto picks the low tier and every tier renders at most
// about SOFTWARE_PIXELS pixels, upscaled. That keeps such machines (and GPU-less CI runners) playable.
const SOFTWARE_GL = /SwiftShader|Basic Render Driver|llvmpipe|softpipe|Software Rasterizer|WARP/i;
const SOFTWARE_PIXELS = 100000;

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
  const probeInfo = probe.getExtension('WEBGL_debug_renderer_info');
  quality.software = SOFTWARE_GL.test(probeInfo ? probe.getParameter(probeInfo.UNMASKED_RENDERER_WEBGL) : probe.getParameter(probe.RENDERER));
  if (quality.software && !PRESETS[qualitySetting]) { Object.assign(quality, PRESETS.low); applyAoParam(); }

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: quality.antialias, powerPreference: 'high-performance', stencil: false });
  } catch (err) {
    $('loading').classList.remove('show'); $('unsupported').classList.add('show'); console.warn('[Helicoptea] renderer failed', err); return;
  }
  renderer.info.autoReset = false; // the AO composer renders several passes per frame; count them all
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = quality.shadows > 0;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); showError('The graphics context was lost (the GPU may have been reset). Reload to continue.'); });

  setProgress(0.15, 'Starting the physics…');
  await initPhysics();
  setProgress(0.3, 'Filling the cups…');
  const wantAircraft = params.get('aircraft') || store.get('aircraft', 'micro');
  // Phones and the low tier get fewer loose props (they also sleep when still).
  quality.liteProps = IS_TOUCH || quality.name === 'low';
  // Flight tuning board: written into CFG before the sim is built (gravity, drag, power, ...).
  const tuning = new Tuning();
  const sim = new Sim({ aircraft: AIRCRAFT_IDS.includes(wantAircraft) ? wantAircraft : 'micro', lite: quality.liteProps });
  // Rotor strikes break the blades (on by default; off, blades pass through scenery).
  sim.damage.rotorStrikes = (params.get('rotorStrikes') || store.get('rotorStrikes', '1')) !== '0';

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CFG.camera.fov, innerWidth / innerHeight, 0.01, 60);
  // Yield between heavy steps so the progress bar paints.
  const tick = () => new Promise((r) => setTimeout(r, 0));
  let stepN = 0;
  const kitchenSteps = ['Lighting the kitchen', 'Laying the table', 'Hanging the curtains', 'Setting out the china'];
  await tick();
  const kitchen = buildKitchen(scene, renderer, quality, (msg) => { stepN++; setProgress(0.3 + 0.4 * stepN / kitchenSteps.length, `${msg}…`); }, sim);
  await tick();
  const view = new View(scene, sim, quality, kitchen);
  const camRig = new FollowCamera(camera);
  const depth = new DepthCues(scene, sim, view);
  for (const k of Object.keys(DEPTH_DEFAULTS)) depth.set(k, store.get(`cue.${k}`, DEPTH_DEFAULTS[k] ? '1' : '0') === '1');
  const post = new Post(renderer, scene, camera, quality);
  depth.linearBlend = post.enabled;
  // First person: pilot's-eye rig, cockpit interiors drawn over the world, and the belly hook camera.
  const loadCam = new LoadCamera(renderer, quality);
  const cockpit = new Cockpit(renderer, scene, quality, kitchen, loadCam);
  const fpRig = new CockpitRig();
  setProgress(0.78, 'Warming the shaders…');
  await tick();
  if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
  else renderer.compile(scene, camera);
  for (const it of Object.values(cockpit.interiors)) it.group.visible = true;
  renderer.compile(cockpit.scene, cockpit.camera);
  for (const it of Object.values(cockpit.interiors)) it.group.visible = false;
  setProgress(1, 'Ready');

  const input = new Input($('touch'));
  input.bindCanvas(canvas);
  const audio = new Audio();
  if (kitchen.garden.charm) kitchen.garden.charm.audio = audio; // the radio and the cat
  const debug = new Debug(sim, renderer, scene);
  if (params.get('debug') === '1' || store.get('debug', '0') === '1') debug.enabled = true;

  // ---------------------------------------------------------------- HUD + actions
  let paused = false;
  let started = false;
  const state = { assist: store.get('assist', '1') === '1' };
  // World weight: how slowly the whole world runs (a slower world reads as bigger and heavier).
  const defaultWeight = (1 - CFG.physics.worldSpeed) / 0.6;
  let weight = parseFloat(store.get('weight', String(defaultWeight)));
  if (!(weight >= 0 && weight <= 1)) weight = defaultWeight;
  const speedOf = (w) => 1 - 0.6 * w;
  let worldSpeed = params.get('worldSpeed') ? parseFloat(params.get('worldSpeed')) : speedOf(weight);
  sim.assist = state.assist;
  const numSetting = (k, d, lo, hi) => { const v = parseFloat(store.get(k, String(d))); return v >= lo && v <= hi ? v : d; };
  const wantView = params.get('view') || store.get('view', 'chase');
  const fp = {
    mode: CAM_IDS.includes(wantView) ? wantView : 'chase',
    fov: numSetting('fpFov', 90, 60, 110),            // horizontal degrees on a landscape screen
    motion: numSetting('fpMotion', 0.5, 0, 1),
    vibration: numSetting('fpVibration', 0.5, 0, 1),
    loadCam: ['auto', 'always', 'off'].includes(store.get('loadCam', 'auto')) ? store.get('loadCam', 'auto') : 'auto',
    crashT: 0, flash: 0, wasLive: false, readT: 0, readText: '',
  };
  // Camera modes beyond chase and cockpit (render/cameraModes.js), the C / L3 cycle and the held GoPro.
  const cam = {
    cycle: (() => { try { const c = JSON.parse(store.get('camCycle', 'null')); if (Array.isArray(c) && c.length) return CAM_IDS.filter((id) => c.includes(id)); } catch { /* ignore */ } return DEFAULT_CYCLE.slice(); })(),
    feel: numSetting('camFeel', 0.5, 0, 1),
    last: fp.mode === 'cockpit' ? 'chase' : fp.mode,   // where 1 returns to from the cockpit
    eff: fp.mode, bolt: false, under: null, uwKey: '', fogSave: null,
    locked: new LockedRig(), nose: new NoseRig(), boltRig: new BoltRig(), tripod: new TripodRig(), cargo: new CargoRig(),
    orbit: { yaw: 0, pitch: 0.45, dist: 0.5 },
  };
  const hud = new Hud($('hud'), {
    action: (a, el) => doAction(a, el),
    volume: (v) => { audio.setVolume(v); if (audio.muted && v > 0) audio.setMuted(false); hud.setVolume(audio.volume, audio.muted); },
    setting: (k, v) => {
      if (k === 'quality') { store.set('quality', v); location.reload(); }
      if (k === 'debug') { debug.enabled = v; store.set('debug', v ? '1' : '0'); }
      if (k === 'weight') { weight = v; worldSpeed = speedOf(v); store.set('weight', String(v)); }
      if (k === 'fpFov' || k === 'fpMotion' || k === 'fpVibration') { fp[{ fpFov: 'fov', fpMotion: 'motion', fpVibration: 'vibration' }[k]] = v; store.set(k, String(v)); }
      if (k === 'loadCam') { fp.loadCam = v; store.set('loadCam', v); }
      if (k === 'camFeel') { cam.feel = v; store.set('camFeel', String(v)); }
      if (k.startsWith('cue.')) { depth.set(k.slice(4), v); store.set(k, v ? '1' : '0'); }
      if (k === 'rotorStrikes') { sim.damage.rotorStrikes = !!v; store.set(k, v ? '1' : '0'); }
    },
  });
  const flow = new Flow(sim, hud);
  tuning.worldSpeedHooks = {
    get: () => worldSpeed,
    set: (v) => { hud.h.setting('weight', Math.min(1, Math.max(0, (1 - v) / 0.6))); },
  };
  tuning.onChange(() => { sim.world.gravity = { x: 0, y: -CFG.physics.gravity, z: 0 }; });
  const tuningPanel = new TuningPanel(hud, tuning, {
    aircraft: () => sim.aircraft,
    onClose: () => { hud.closeModal(); if (paused) hud.openPause(pauseOpts()); },
  });

  // Every flight is recorded (inputs, telemetry, everything that moves) and saved to logs/flights via the
  // dev / preview server; the replay viewer plays them back from the snapshots, with notes.
  const flightStore = new FlightStore();
  const recorder = new FlightRecorder(sim, {
    getInput: () => ({ source: input.source, kb: input.kb, gp: input.gp, touch: input.touch, raw: input.pads.raw }),
    settings: () => ({ view: fp.mode, quality: quality.name, weight, touchUi: IS_TOUCH, rotorStrikes: sim.damage.rotorStrikes }),
    onFlightEnd: (f) => flightStore.save(f),
  });
  if (params.get('record') === '0') recorder.enabled = false;
  const replay = new ReplayViewer({
    recorder, store: flightStore, stage: new ReplayStage(view, kitchen, () => [...depth.shadows, depth.line, depth.dot, depth.ring]), camera, cockpit, sim,
    fpSettings: () => ({ ...fp, camFeel: cam.feel }), setLens: (on, zoom, lens) => applyLens(on, zoom, lens),
    onClose: (from) => closeReplay(from),
  });
  const fmtWall = (w) => `${Math.floor(w / 60)}:${String(Math.floor(w % 60)).padStart(2, '0')}`;
  hud.pads = input.pads;
  hud.setAssist(sim.assist);
  hud.setVolume(audio.volume, audio.muted);
  hud.setDevice(IS_TOUCH ? 'touch' : 'keyboard');
  hud.setViewMode(fp.mode);
  input.viewMode = fp.mode;
  if (IS_TOUCH) { document.body.classList.add('touch-ui'); $('touch').classList.remove('hidden'); }

  function setPaused(p) {
    if (p === paused || !started || replay.active) return;
    paused = p;
    if (p && recorder.current && recorder.current.dirty) flightStore.save(recorder.current);
    audio.suspend(p);
    input.enabled = !p;
    if (p) hud.openPause(pauseOpts());
    else hud.closeModal();
  }

  // The replay freezes the world (as the pause menu does) and takes over the screen and the controls.
  function openReplay() {
    if (!started || replay.active) return;
    const from = paused ? 'pause' : 'crash';
    if (!paused) { paused = true; audio.suspend(true); input.enabled = false; }
    hud.closeModal();
    hud.setLoadCam(null);
    cockpit.setPipRect(null, innerWidth, innerHeight);
    replay.open({ from });
  }
  function closeReplay(from) {
    lensKey = '';
    if (from === 'crash' && crashShown) {
      paused = false; audio.suspend(false); input.enabled = true;
      if (input.source === 'gamepad') hud.focusFirst();
    } else hud.openPause(pauseOpts());
  }

  function pauseOpts() { return { quality: quality.setting, debug: debug.enabled, aircraft: sim.aircraft, weight, view: fp.mode, camCycle: cam.cycle, camFeel: cam.feel, fpFov: fp.fov, fpMotion: fp.motion, fpVibration: fp.vibration, loadCam: fp.loadCam, cues: { ...depth.settings }, rotorStrikes: sim.damage.rotorStrikes }; }

  // Something to ride for the cargo cam: a load on a hook, or the skycrane's snorkel paid out.
  function cargoReady() {
    const hh = sim.heli;
    return !!hh && (sim.carriedCargo().length > 0 || (hh.type === 'skycrane' && hh.hose && hh.hose.length > 0.03));
  }

  const CAM_TIPS = {
    gamepad: { cockpit: 'hold L3 and use the right stick to look around', cargo: 'D-pad looks about, B looks ahead', orbit: 'D-pad orbits and zooms' },
    keyboard: { cockpit: 'drag to look around, wheel to zoom', cargo: 'drag to look about, even up at the aircraft', orbit: 'drag to orbit, wheel to zoom' },
    touch: { cockpit: 'drag the open screen to look around', cargo: 'drag to look about', orbit: 'drag to orbit' },
  };
  function setView(mode, quiet = false) {
    if (!CAM_IDS.includes(mode)) return;
    if (mode === fp.mode) return;
    const was = fp.mode;
    fp.mode = mode;
    if (mode !== 'cockpit') cam.last = mode;
    store.set('view', mode);
    input.viewMode = mode;
    hud.setViewMode(mode);
    if (mode === 'cockpit') {
      fpRig.reset();
      fpRig.lookYaw = fpRig.lookPitch = 0;
    }
    if (mode === 'locked') cam.locked.reset();
    if (mode === 'nose') cam.nose.reset();
    if (mode === 'tripod') cam.tripod.reset();
    if (mode === 'cargo') cam.cargo.reset();
    if (mode === 'orbit') {
      // Start the orbit where the camera is now, so the switch is seamless.
      const f = view.focusPoint();
      cam.orbit.dist = THREE.MathUtils.clamp(camera.position.distanceTo(f), 0.15, 2);
      cam.orbit.yaw = Math.atan2(camera.position.x - f.x, camera.position.z - f.z);
      cam.orbit.pitch = THREE.MathUtils.clamp(Math.asin(THREE.MathUtils.clamp((camera.position.y - f.y) / Math.max(cam.orbit.dist, 1e-3), -1, 1)), -0.2, 1.4);
      input.camOrbit.yaw = input.camOrbit.pitch = input.camOrbit.zoom = 0;
    }
    if (mode === 'chase' || was === 'cockpit') camRig.recenter(sim.heli ? sim.heli.heading() : camRig.yaw);
    if (mode === 'chase') input.camOrbit.yaw = input.camOrbit.pitch = input.camOrbit.zoom = 0;
    if (started && input.source === 'gamepad') input.pads.rumble(0, 0.12, 22);   // a click through the grip
    if (started && !quiet) {
      const how = input.source === 'gamepad' ? 'gamepad' : (input.source === 'touch' || IS_TOUCH ? 'touch' : 'keyboard');
      const next = how === 'gamepad' ? 'L3: next' : how === 'touch' ? '' : 'C: next';
      const ride = mode === 'cargo' && !cargoReady() ? 'nothing on the hook yet, riding the hook' : '';
      hud.toast([CAM_NAME[mode], ride || CAM_TIPS[how][mode], next].filter(Boolean).join(' · '), 2.4);
    }
  }
  // Next / previous camera in the player's cycle. The cargo cam is skipped while there is nothing to ride.
  function cycleView(dir = 1) {
    const list = cam.cycle.filter((id) => id !== 'cargo' || cargoReady() || id === fp.mode);
    if (!list.length) return;
    const i = list.indexOf(fp.mode);
    const n = i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length;
    setView(list[n]);
  }
  function toggleCycle(id) {
    if (!CAM_IDS.includes(id)) return;
    const on = cam.cycle.includes(id);
    if (on && cam.cycle.length <= 1) return;
    cam.cycle = on ? cam.cycle.filter((m) => m !== id) : CAM_IDS.filter((m) => m === id || cam.cycle.includes(m));
    store.set('camCycle', JSON.stringify(cam.cycle));
  }

  const AIRCRAFT_TOASTS = {
    micro: 'Micro heli: 24 g, nimble, one hook',
    chinook: 'Chinook: tandem rotors, three hooks, a lot more mass to stop',
    skycrane: 'Skycrane: snorkel the milk up, drop it through the belly doors',
  };
  function setAircraft(id) {
    if (!AIRCRAFT_IDS.includes(id)) return;
    store.set('aircraft', id);
    updatePicker();
    if (sim.aircraft === id) return;
    sim.setAircraft(id);
    hud.hideCrash();
    camRig.recenter(sim.heli ? sim.heli.heading() : camRig.yaw);
    if (started) hud.toast(AIRCRAFT_TOASTS[id]);
  }

  function doAction(a, el) {
    if (a.startsWith('tune') && hud.modalKind === 'tuning' && tuningPanel.action(a, el)) return;
    switch (a) {
      case 'tuning': tuningPanel.open(); break;
      case 'aircraft': {
        const id = el && el.dataset && el.dataset.id ? el.dataset.id : AIRCRAFT_IDS[(AIRCRAFT_IDS.indexOf(sim.aircraft) + 1) % AIRCRAFT_IDS.length];
        setAircraft(id);
        if (paused) hud.openPause(pauseOpts());
        break;
      }
      case 'attach': if (!paused) sim.toggleAttach(); break;
      case 'replay': openReplay(); break;
      case 'mark': {
        const n = paused ? null : recorder.addNote({ tag: 'mark', source: 'flight' });
        if (n) hud.toast(`Marked ${fmtWall(n.wall)}. Describe it later in Pause → Flight replay`, 2.2);
        break;
      }
      case 'salvo': {
        const r = paused ? null : sim.milk.salvo();
        const T = { salvo: 'Salvo! Doors latched open', latched: 'Valve latched open', closed: 'Closed', empty: 'Nothing to drop: fill up first' };
        if (r && T[r]) hud.toast(T[r], 1.6);
        break;
      }
      case 'autofill': {
        const r = paused ? null : sim.milk.autoFill();
        if (r === 'started') hud.toast('Auto-fill: lowering the snorkel', 1.8);
        else if (r === 'cancelled') hud.toast('Auto-fill off', 1.4);
        break;
      }
      case 'view':
        // L3 tap, the touch camera button and the HUD button step through the cycle; menu rows name a mode.
        if (el && el.dataset && el.dataset.id) setView(el.dataset.id); else cycleView(1);
        if (paused) hud.openPause(pauseOpts());
        break;
      case 'camNext': cycleView(1); if (paused) hud.openPause(pauseOpts()); break;
      case 'camPrev': cycleView(-1); if (paused) hud.openPause(pauseOpts()); break;
      case 'cockpit':
        setView(fp.mode === 'cockpit' ? (cam.last || 'chase') : 'cockpit');
        if (paused) hud.openPause(pauseOpts());
        break;
      case 'camcycle': toggleCycle(el && el.dataset ? el.dataset.id : ''); if (paused) hud.openPause(pauseOpts()); break;
      case 'assist':
        sim.assist = !sim.assist; store.set('assist', sim.assist ? '1' : '0');
        hud.setAssist(sim.assist); flow.noteAssistToggled();
        hud.toast(sim.assist ? 'Flight Assist on: neutral stick levels the heli' : 'Flight Assist off: you hold the attitude now');
        break;
      case 'restart': if (paused) setPaused(false); sim.restartFlight(); hud.hideCrash(); break;
      case 'reset': if (paused) setPaused(false); sim.resetSandbox(); hud.hideCrash(); camRig.recenter(0); break;
      case 'recenter': camRig.recenter(sim.heli ? sim.heli.heading() : camRig.yaw); input.camOrbit.yaw = input.camOrbit.pitch = input.camOrbit.zoom = 0; fpRig.recenter(); cam.cargo.recenter(); if (fp.mode === 'tripod') cam.tripod.reset(); break;
      case 'pause': setPaused(!paused); break;
      case 'resume': setPaused(false); break;
      case 'help': if (hud.modalKind === 'help') hud.closeModal(); else { hud.openHelp(); } break;
      case 'closehelp': hud.closeModal(); if (paused) hud.openPause(pauseOpts()); break;
      case 'helptab': hud.setHelpTab(el.dataset.tab); break;
      case 'mute': audio.setMuted(!audio.muted); hud.setVolume(audio.volume, audio.muted); break;
      case 'debug': debug.enabled = !debug.enabled; store.set('debug', debug.enabled ? '1' : '0'); break;
      case 'skiphints': flow.skip(); break;
      case 'resethints': flow.replay(); setPaused(false); break;
      case 'controller': hud.openController(input.pads); break;
      case 'closecontroller':
        input.pads.cancelWizard();
        if (input.pads.capture) input.pads.cancelCapture();
        hud.closeModal();
        if (paused) hud.openPause(pauseOpts());
        break;
      case 'padbind':
        if (!input.pads.startWizard((v) => hud.showWizard(v))) hud.toast('Press any button on your controller first so the browser can see it');
        break;
      case 'wizskip': input.pads.skipWizardStep(); break;
      case 'wizcancel': input.pads.cancelWizard(); hud.showWizard(null); break;
      case 'padreset': { const g = input.pads.active(); if (g) { input.pads.resetBinding(g); hud.toast('Pad wiring reset to the standard layout'); } break; }
      case 'padrumble': if (input.pads.canRumble()) input.pads.rumble(0.9, 0.6, 350); else hud.toast('This controller does not report rumble support to the browser'); break;
      default:
        if (a.startsWith('cam:')) { setView(a.slice(4)); if (paused) hud.openPause(pauseOpts()); }
        break;
    }
  }

  // Back button in menus: close the innermost panel.
  function back() {
    if (input.pads.capture) { input.pads.cancelCapture(); return; }
    if (input.pads.wizard) { doAction('wizcancel'); return; }
    if (hud.modalKind === 'tuning') tuningPanel.close();
    else if (hud.modalKind === 'controller') doAction('closecontroller');
    else if (hud.modalKind === 'help') doAction('closehelp');
    else if (paused) setPaused(false);
  }

  // Pause safely on focus loss.
  window.addEventListener('blur', () => setPaused(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });

  // ---------------------------------------------------------------- resize / dynamic resolution
  let dpr = Math.min(devicePixelRatio || 1, quality.dprCap);
  let dprScale = 1;
  function resize() {
    const w = innerWidth, h = innerHeight;
    const base = quality.software ? Math.min(dpr, Math.sqrt(SOFTWARE_PIXELS / (w * h))) : dpr;
    renderer.setPixelRatio(base * dprScale);
    renderer.setSize(w, h, false);
    lensKey = '';
    stickTop = 0;
    applyLens(lensFp);
    post.setSize(w, h);
  }

  // Camera lens: the chase view, or the pilot's eye (wider, with a near plane of a couple of
  // millimetres so the rotor mast and skids just outside the cabin still draw).
  let lensKey = '', lensFp = false;
  // Vertical field of view for a horizontal one on a landscape screen (portrait keeps the landscape height).
  const vfov = (hdeg, aspect) => THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(hdeg) / 2) / Math.max(aspect, 1.25)));
  function applyLens(cockpitView, zoom = fpRig.fovZoom, custom = null) {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    let fov, near;
    if (custom) {
      fov = THREE.MathUtils.clamp(custom.fov, 5, 120);
      near = custom.near;
    } else if (cockpitView) {
      const hf = THREE.MathUtils.degToRad(fp.fov);
      fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(hf / 2) / Math.max(aspect, 1.25))) + zoom;
      fov = THREE.MathUtils.clamp(fov, 22, 100);
      near = (SEATS[sim.aircraft] || SEATS.micro).near;
    } else {
      // Narrow/portrait screens: widen the view so the bag stays in frame.
      fov = aspect < 1 ? 62 : CFG.camera.fov;
      near = 0.01;
    }
    lensFp = !!cockpitView && !custom;
    const key = `${fov.toFixed(2)}|${near}|${w}|${h}|${renderer.getPixelRatio()}`;
    if (key === lensKey) return;
    lensKey = key;
    camera.fov = fov; camera.near = near; camera.aspect = aspect;
    camera.updateProjectionMatrix();
    cockpit.setAspect(aspect, fov);
    view.setParticleScale(h * renderer.getPixelRatio(), fov);
  }

  let stickTop = 0;
  // Hook-camera inset: bottom right on desktop, top centre on touch screens.
  function pipRect() {
    const w = innerWidth, h = innerHeight;
    if (IS_TOUCH) {
      // Top centre: the corners belong to the assist and view buttons, the bottom to the sticks.
      if (!stickTop) { const z = document.querySelector('.stick-zone'); stickTop = z ? z.getBoundingClientRect().top : h * 0.42; }
      const s = Math.round(Math.max(72, Math.min(h * 0.28, w * 0.2, 200, stickTop - 20)));
      return { x: Math.round((w - s) / 2), y: 10, s, top: true };
    }
    const s = Math.round(Math.min(h * 0.3, w * 0.24, 300));
    return { x: w - s - 18, y: h - s - 18, s };
  }

  // What the hook camera is looking at, in words: height of the lowest load over what is below it.
  // Height of a point over the liquid, table or floor below it.
  function heightOver(x, y, z) {
    for (const v of sim.milk.vessels) if (Math.hypot(x - v.x, z - v.z) < v.rIn && y > v.waterY) return { d: y - v.waterY, what: v.isBowl ? 'milk' : 'tea' };
    const hit = sim.world.castRay(new RAPIER.Ray({ x, y: y - 0.002, z }, { x: 0, y: -1, z: 0 }), 1.5, true, undefined, GROUPS.queryWorld);
    if (!hit) return null;
    const gy = y - 0.002 - hit.timeOfImpact;
    return { d: y - gy, what: gy < -0.3 ? 'floor' : 'table' };
  }

  function loadReadout() {
    const hh = sim.heli;
    if (hh && hh.type === 'skycrane' && hh.tank) {
      // The skycrane's camera watches the snorkel and belly doors: tank level and where the intake is.
      const TK = hh.tank, hose = hh.hose;
      const tank = `Tank ${Math.round(100 * TK.vol / TK.capacity)}%`;
      if (TK.doors > 0.02 && TK.vol > 0) return `${tank} · doors open`;
      if (hose.submerged) return `${tank} · intake in ${hose.submerged.isBowl ? 'milk' : 'tea'}${TK.pumping ? ' · pumping' : ''}`;
      const o = heightOver(hose.headWorld.x, hose.headWorld.y - 0.003, hose.headWorld.z);
      return o ? `${tank} · intake ${(o.d * 100).toFixed(1)} cm above ${o.what}` : tank;
    }
    const c = sim.carriedCargo();
    if (!c.length) return sim.attachCandidate() ? 'Loop in reach' : 'No load';
    const bk = sim.milk.bucket;
    let low = c[0];
    for (const b of c) if (b.pos.y < low.pos.y) low = b;
    const isB = low === bk;
    const name = isB ? 'Bucket' : 'Bag';
    const fill = isB ? ` · ${Math.round(low.fill * 100)}%` : '';
    if (low.immersion > 0.03) return isB ? `Bucket dipping${fill}` : `Bag in tea · ${Math.round(Math.min(1, low.immersion) * 100)}%`;
    const bottom = low.pos.y - (isB ? 0.016 : 0.03);
    let y = null, what = 'table';
    for (const cup of sim.cups) if (Math.hypot(low.pos.x - cup.x, low.pos.z - cup.z) < cup.rIn && bottom > cup.waterY) { y = cup.waterY; what = 'tea'; }
    if (y === null) {
      const y0 = bottom - 0.002;
      const hit = sim.world.castRay(new RAPIER.Ray({ x: low.pos.x, y: y0, z: low.pos.z }, { x: 0, y: -1, z: 0 }), 1.5, true, undefined, GROUPS.queryWorld);
      if (!hit) return `${name} over the floor${fill}`;
      y = y0 - hit.timeOfImpact;
      if (y < -0.3) what = 'floor';
    }
    return `${name} ${Math.max(0, (bottom - y) * 100).toFixed(1)} cm above ${what}${fill}`;
  }
  addEventListener('resize', resize);
  resize();

  // ---------------------------------------------------------------- start gate (audio unlock)
  const startBtn = $('start-btn');
  const picker = $('aircraft-pick');
  function updatePicker() {
    for (const b of picker.querySelectorAll('button')) {
      const on = b.dataset.aircraft === sim.aircraft;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    }
  }
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('[data-aircraft]');
    if (b) setAircraft(b.dataset.aircraft);
  });
  // Keys on a focused picker button choose, they don't start the flight.
  picker.addEventListener('keydown', (e) => {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); const b = e.target.closest('[data-aircraft]'); if (b) setAircraft(b.dataset.aircraft); }
    else if (e.code.startsWith('Arrow')) { e.stopPropagation(); }
  });
  updatePicker();
  picker.classList.remove('hidden');
  startBtn.classList.remove('hidden');
  $('start-hint').classList.remove('hidden');
  $('load-status').textContent = `Loaded in ${((performance.now() - t0) / 1000).toFixed(1)} s`;
  console.info(`[Helicoptea] ready in ${(performance.now() - t0).toFixed(0)} ms | quality ${quality.name} (${quality.setting}${quality.software ? ', software renderer' : ''}) | dpr ${dpr.toFixed(2)} | ${debug.gpuName()} | Rapier ${RAPIER.version ? RAPIER.version() : ''}`);
  const begin = () => {
    if (started) return;
    started = true;
    audio.unlock();
    // A gamepad press doesn't count as a user gesture for audio in every browser: offer a one-tap fix.
    setTimeout(() => {
      if (audio.ctx && audio.ctx.state !== 'running') {
        hud.toast('Sound is waiting for a click or key press (browser rule)', 5);
        const wake = () => { audio.unlock(); removeEventListener('pointerdown', wake); removeEventListener('keydown', wake); };
        addEventListener('pointerdown', wake); addEventListener('keydown', wake);
      }
    }, 400);
    $('loading').classList.add('fade');
    setTimeout(() => $('loading').classList.remove('show'), 500);
    $('hud').classList.remove('hidden');
    removeEventListener('keydown', keyStart);
  };
  const keyStart = (e) => { if (e.code === 'Tab' || picker.contains(document.activeElement)) return; begin(); };
  startBtn.addEventListener('click', begin);
  addEventListener('keydown', keyStart);
  startBtn.focus();

  // ---------------------------------------------------------------- camera helpers
  const orbitTarget = new THREE.Vector3(), orbitM = new THREE.Matrix4();
  const orbitPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
  const cargoTmp = { pos: new THREE.Vector3(), top: new THREE.Vector3(), kind: 'hook' };
  const cq = new THREE.Quaternion();
  // What the cargo cam rides: the lowest load on a hook, else the skycrane's snorkel head, else the bare hook.
  function cargoLoad(hh) {
    const L = cargoTmp;
    const c = sim.carriedCargo();
    if (c.length) {
      let low = c[0];
      for (const b of c) if (b.pos.y < low.pos.y) low = b;
      if (low.track) low.track.sample(lastAlpha, L.pos, cq); else L.pos.copy(low.pos);
      const hk = hh.def.hooks[low.attach.hook || 0] || hh.def.hooks[0];
      L.top.set(...hk).applyQuaternion(view.heliQuat).add(view.heliPos);
      L.kind = low === sim.milk.bucket ? 'bucket' : 'bag';
      return L;
    }
    const sv = view.skycrane;
    if (hh.type === 'skycrane' && hh.hose && hh.hose.length > 0.03 && sv && sv.curvePts) {
      const n = sv.curvePts.length;
      L.pos.copy(sv.curvePts[n - 1]); L.top.copy(sv.curvePts[n - 2]); L.kind = 'hose';
      if (L.top.distanceToSquared(L.pos) < 1e-10) L.top.y += 0.01;
      return L;
    }
    const hk = hh.def.hooks[hh.def.hooks.length === 3 ? 1 : 0];
    L.top.set(hk[0], hk[1] + 0.02, hk[2]).applyQuaternion(view.heliQuat).add(view.heliPos);
    L.pos.set(...hk).applyQuaternion(view.heliQuat).add(view.heliPos);
    L.kind = 'hook';
    return L;
  }

  // Under the tea: the scene fog turns the colour of the brew and closes in to a couple of centimetres.
  function underLiquid(u) {
    const F = scene.fog;
    if (u && F) {
      if (!cam.fogSave) cam.fogSave = { color: F.color.clone(), near: F.near, far: F.far };
      F.color.copy(u.color).convertSRGBToLinear();
      F.near = 0; F.far = u.kind === 'milk' ? 0.03 : 0.085;
    } else if (cam.fogSave && F) {
      F.color.copy(cam.fogSave.color); F.near = cam.fogSave.near; F.far = cam.fogSave.far;
      cam.fogSave = null;
    }
    const key = u ? `${u.kind}|${u.color.getHexString()}` : '';
    if (key !== cam.uwKey) { cam.uwKey = key; hud.setUnder(u ? { kind: u.kind, color: `#${u.color.getHexString()}` } : null); }
    if (!!u !== !!cam.under && u && input.source === 'gamepad') input.pads.rumble(0.15, 0.45, 120);
    cam.under = u;
  }

  // The GoPro's overlay: REC, a running clock and a ring where the lowest load will land if lowered now.
  const boltState = { t: 0, readT: 0, text: '' };
  function boltOverlay(on, dt) {
    if (!on) { if (boltState.t) { boltState.t = 0; hud.setBolt(null); } return; }
    boltState.t += dt;
    const hh = sim.heli;
    const c = sim.carriedCargo();
    let p = null;
    if (c.length) { p = c[0].pos; for (const b of c) if (b.pos.y < p.y) p = b.pos; } else if (hh.type === 'skycrane' && hh.hose && hh.hose.length > 0.03) p = hh.hose.headWorld;
    else p = hh.hookWorlds[hh.hookWorlds.length === 3 ? 1 : 0];
    let ring = null;
    if (p) {
      const hit = sim.world.castRay(new RAPIER.Ray({ x: p.x, y: p.y - 0.035, z: p.z }, { x: 0, y: -1, z: 0 }), 1.6, true, undefined, GROUPS.queryWorld);
      let gy = hit ? p.y - 0.035 - hit.timeOfImpact : null;
      for (const v of sim.milk.vessels) if (Math.hypot(p.x - v.x, p.z - v.z) < v.rIn && p.y > v.waterY) gy = Math.max(gy ?? -9, v.waterY);
      if (gy !== null) {
        tmp.set(p.x, gy, p.z).project(camera);
        if (tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2) ring = { x: (tmp.x * 0.5 + 0.5) * innerWidth, y: (-tmp.y * 0.5 + 0.5) * innerHeight };
      }
    }
    boltState.readT -= dt;
    if (boltState.readT <= 0) { boltState.readT = 0.1; boltState.text = loadReadout(); }
    hud.setBolt({ t: boltState.t, ring, text: boltState.text, mount: { micro: 'RIGHT SKID', chinook: 'RIGHT SPONSON', skycrane: 'TANK RAIL' }[hh.type] || 'MOUNT' });
  }

  // ---------------------------------------------------------------- main loop
  const dt = sim.dt;
  // A software renderer may only manage 10-20 fps: let the simulation catch up twice as far per frame
  // there, so the world keeps its real speed instead of slowing down with the picture.
  const maxSteps = CFG.physics.maxStepsPerFrame * (quality.software ? 2 : 1);
  let acc = 0;
  let last = performance.now();
  let frameEMA = 16.7;
  let lowFrames = 0, highFrames = 0;
  const fpsCap = parseFloat(params.get('fps')) || 0;
  let lastRender = 0;
  let crashShown = false;
  let renderedFrames = 0;
  // A crash plays out in a moment of slow motion (the replay keeps it). ?stage=tail (or rotor, wear, dunk,
  // rollover, impact, fall) stages that crash shortly after each start, for trying them by hand.
  const cinema = new CrashCinema();
  const stageKind = STAGES.includes(params.get('stage')) ? params.get('stage') : null;
  let stageT = stageKind ? 1.2 : -1;
  const camTarget = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  let lastAlpha = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (fatal) return;
    if (fpsCap && now - lastRender < 1000 / fpsCap - 1) return;
    lastRender = now;
    const frameDt = Math.min((now - last) / 1000, CFG.physics.maxFrameDt);
    last = now;

    // The gamepad drives menus whenever one is showing (start screen, pause, help, settings, crash).
    input.menuMode = !started || hud.modalKind !== null || crashShown || replay.active;
    input.aircraft = sim.aircraft;
    input.pads.triggerMode = sim.aircraft === 'skycrane' ? 'tank' : 'collective';
    const ctl = tuning.shapeCtl(input.update(frameDt)); // board deadzone/expo/rates, after the bindings
    for (const a of input.takeActions()) {
      if (replay.active) continue;   // the viewer reads keys and the pad itself
      if (a.startsWith('nav-')) { hud.nav(a.slice(4)); continue; }
      if (a === 'confirm') { if (!hud.confirm() && !started) begin(); continue; }
      if (a === 'back') { if (started) back(); continue; }
      if (a === 'padLost') { if (started && input.source === 'gamepad') setPaused(true); continue; }
      if (!started) continue;
      if (a === 'pause' && !paused && (hud.modalKind === 'help' || hud.modalKind === 'controller')) { back(); continue; }
      if (a === 'pause' && hud.modalKind === 'tuning') { back(); continue; } // Esc leaves the board for the pause menu
      if (paused && !['pause', 'resume', 'help', 'mute', 'debug', 'restart', 'reset', 'view', 'cockpit', 'camNext', 'camPrev'].includes(a) && !a.startsWith('cam:')) { if (a === 'attach') setPaused(false); continue; }
      doAction(a);
    }
    for (const n of input.takeNotices()) hud.toast(n);
    hud.setDevice(input.source);
    document.body.classList.toggle('pad-nav', input.source === 'gamepad');
    hud.updateController();
    if (input.attachBtn) {
      const cand = sim.attachCandidate();
      input.attachBtn.classList.toggle('ready', !!cand);
      input.attachBtn.querySelector('.lbl').textContent = !cand && sim.carriedCargo().length ? 'Drop' : 'Hook';
      const bk = sim.milk.bucket, carryingBucket = !!(bk && sim.carriedCargo().includes(bk));
      input.setTouchMode(sim.aircraft === 'skycrane', carryingBucket);
      input.pourBtn.classList.toggle('empty', carryingBucket && bk.vol < 1e-7);
      input.assistBtn.classList.toggle('on', sim.assist);
    }

    if (replay.active) { replayFrame(frameDt); return; }

    // Fixed-step simulation with capped catch-up.
    let steps = 0;
    if (started && !paused) cinema.update(frameDt);
    const runSpeed = worldSpeed * cinema.scale;
    recorder.worldSpeed = runSpeed;
    if (stageT > 0 && started && !paused && sim.state === 'flying' && (stageT -= frameDt) <= 0) {
      const what = stageCrash(sim, stageKind);
      if (what) hud.toast(what, 3);
    }
    const tPhys = performance.now();
    if (started && !paused) {
      acc += frameDt * runSpeed;
      while (acc >= dt && steps < maxSteps) {
        sim.step(ctl);
        recorder.afterStep(ctl);
        acc -= dt;
        steps++;
      }
      if (steps === maxSteps) acc = Math.min(acc, dt);
    }
    const physMs = performance.now() - tPhys;
    const alpha = acc / dt;
    lastAlpha = alpha;

    const events = sim.drainEvents();
    recorder.frameEnd();
    view.handleEvents(events, camera, camRig);
    if (fp.wasLive) for (const e of events) fpRig.kick(e, fp.motion);
    flow.handleEvents(events);
    audio.handleEvents(events, (p) => THREE.MathUtils.clamp(tmp.copy(p).project(camera).x, -1, 1)); // in the cockpit, points can sit beside or behind the eye
    for (const e of events) {
      if (e.type === 'crash') {
        hud.showCrash(crashMessage(e), crashTitle(e));
        cinema.crash(e);
        crashShown = true;
        // From the cockpit: a moment of violent shake and flash in the seat, then out to the wreck.
        if (fp.wasLive) { fp.crashT = 0.42; fp.flash = 1; }
        if (input.source === 'gamepad') hud.focusFirst();
      }
      if (e.type === 'rotorShatter') cinema.strike(0.5);
      if (e.type === 'tailStrike') { cinema.strike(0.3); hud.toast('Tail rotor gone: lower the collective to slow the spin', 3.5); }
      if (e.type === 'restart') { if (stageKind) stageT = 1.2; cinema.reset(); crashShown = false; hud.hideCrash(); fp.crashT = 0; fpRig.reset(); fpRig.lookYaw = fpRig.lookPitch = 0; }
      if (e.type === 'autoFill') hud.toast({ pump: 'Intake in: pumping', up: e.full ? 'Tank full: reeling in' : 'Source dry: reeling in', done: 'Snorkel stowed' }[e.phase], 1.6);
    }
    // Rumble as physical feedback (only when flying with a controller).
    if (input.source === 'gamepad') {
      for (const e of events) {
        if (e.type === 'crash') input.pads.rumble(1, 0.8, 450);
        else if (e.type === 'bump') input.pads.rumble(Math.min(0.6, e.dv * 0.5), 0.3, 90);
        else if (e.type === 'attach') input.pads.rumble(0, 0.35, 50);
        else if (e.type === 'release') input.pads.rumble(0, 0.25, 40);
        else if (e.type === 'splash' || e.type === 'bucketSplash') input.pads.rumble(0.1, Math.min(0.5, 0.15 + e.speed * 0.4), 90);
        else if (e.type === 'rotorTick') input.pads.rumble(e.harmless ? 0.05 : 0.25, e.harmless ? 0.1 : 0.4, 30);
        else if (e.type === 'rotorShatter') input.pads.rumble(0.9, 1, 320);
        else if (e.type === 'tailStrike') input.pads.rumble(0.4, 0.8, 200);
        else if (e.type === 'touchdown') input.pads.rumble(Math.min(0.7, e.speed * 0.9), 0.2, 80);
        else if (e.type === 'scrape') input.pads.rumble(0.05, Math.min(0.35, e.speed * 0.5), 60);
        else if (e.type === 'snatch') input.pads.rumble(Math.min(0.5, e.speed * 0.5), 0.3, 60);
      }
    }

    // Camera.
    const rd = started && !paused ? frameDt : 0;
    view.update(alpha, rd * runSpeed, camera); // world effects share the world's clock (slow motion too)
    const heading = sim.heli ? sim.heli.heading() : camRig.yaw;
    camRig.sizeScale += (({ chinook: 1.45, skycrane: 1.55 }[sim.aircraft] || 1) - camRig.sizeScale) * Math.min(1, rd * 3);
    const look = input.takeLook();
    if (fp.crashT > 0) fp.crashT -= frameDt;
    // The held GoPro overrides whatever mode is selected, while there is an airframe to bolt it to.
    cam.bolt = started && !paused && !!sim.heli && !!input.ctl.boltCam;
    const mode = cam.bolt ? 'bolt' : fp.mode;
    const fpView = started && mode === 'cockpit' && cockpit.has(sim.aircraft) && (!!sim.heli || fp.crashT > 0);
    const fpLive = fpView && !!sim.heli;
    const wd = rd * runSpeed;   // the rigs feel the world's clock, slow motion included
    // Rigid rigs need an airframe; after a crash they hand over to the chase camera (the tripod and orbit keep filming).
    let rig = null;
    if (!fpView && started && sim.heli) {
      const hh = sim.heli, carrying = sim.carriedCargo().length > 0;
      if (mode === 'bolt') rig = cam.boltRig.update(wd, hh, view.heliPos, view.heliQuat, hh.type, fp.vibration);
      else if (mode === 'locked') rig = cam.locked.update(wd, hh, view.heliPos, view.heliQuat, hh.type, camRig.sizeScale, cam.feel, carrying, sim);
      else if (mode === 'nose') rig = cam.nose.update(wd, hh, view.heliPos, view.heliQuat, hh.type, cam.feel, fp.vibration);
      else if (mode === 'cargo') {
        cam.cargo.addLook(look.yaw, -look.pitch);
        rig = cam.cargo.update(Math.max(frameDt, 1e-4), cargoLoad(hh), heading, sim);
      }
    }
    if (!fpView && started && (mode === 'tripod' || mode === 'orbit')) {
      const f = view.focusPoint();
      if (mode === 'tripod') {
        const hh = sim.heli, c = sim.carriedCargo();
        const span = c.length ? Math.max(...c.map((b) => b.pos.distanceTo(f))) : 0;
        rig = cam.tripod.update(Math.max(frameDt, 1e-4), f, hh ? hh.vel : tmp.set(0, 0, 0), 0.055 * camRig.sizeScale + span * 0.6, camRig.sizeScale, sim);
      } else {
        const O = cam.orbit;
        O.yaw -= input.camOrbit.yaw; O.pitch = THREE.MathUtils.clamp(O.pitch + input.camOrbit.pitch, -0.2, 1.45);
        O.dist = THREE.MathUtils.clamp(O.dist * Math.exp(input.camOrbit.zoom * 1.6), 0.08, 2.5);
        input.camOrbit.yaw = input.camOrbit.pitch = input.camOrbit.zoom = 0;
        orbitTarget.lerp(f, 1 - Math.exp(-Math.max(frameDt, 1e-4) * 12));
        const cp = Math.cos(O.pitch);
        tmp.set(orbitTarget.x + Math.sin(O.yaw) * cp * O.dist, orbitTarget.y + Math.sin(O.pitch) * O.dist, orbitTarget.z + Math.cos(O.yaw) * cp * O.dist);
        orbitPose.pos.copy(tmp);
        orbitPose.quat.setFromRotationMatrix(orbitM.lookAt(orbitPose.pos, orbitTarget, tmp.set(0, 1, 0)));
        rig = orbitPose;
      }
    } else orbitTarget.copy(view.focusPoint());
    cam.eff = fpView ? 'cockpit' : rig ? mode : 'chase';
    if (fpView) {
      if (!lensFp) fpRig.reset();
      fpRig.addLook(look.yaw, look.pitch);
      fpRig.fovZoom = THREE.MathUtils.clamp(fpRig.fovZoom + look.zoom, -45, 15);
      view.setFirstPerson(fpLive);
      fpRig.update(wd, sim.heli, view.heliPos, view.heliQuat, fp, camRig.shake);
      camRig.shake *= Math.exp(-Math.max(rd, 1e-4) * 5);
      fpRig.apply(camera, cockpit.camera);
      applyLens(true);
      cockpit.update(rd, sim.heli, sim, view.heliQuat, gearDrop(sim.aircraft), true);
      camTarget.copy(view.focusPoint());
    } else if (rig) {
      view.setFirstPerson(false);
      camera.position.copy(rig.pos);
      camera.quaternion.copy(rig.quat);
      // Crash and bump shake reaches the hard mounts too.
      if (camRig.shake > 0.0001 && mode !== 'tripod' && mode !== 'orbit') {
        const s = camRig.shake * 0.25 * camRig.sizeScale, t = performance.now() / 1000;
        camera.position.x += Math.sin(t * 53) * s; camera.position.y += Math.sin(t * 61 + 1.3) * s * 0.7; camera.position.z += Math.sin(t * 47 + 2.1) * s;
      }
      camRig.shake *= Math.exp(-Math.max(rd, 1e-4) * 5);
      const aspect = innerWidth / innerHeight;
      const lens = mode === 'bolt' ? { fov: Math.min(100, vfov(122, aspect)), near: 0.0015 }
        : mode === 'locked' ? { fov: (aspect < 1 ? 66 : 58) + cam.locked.fovKick, near: 0.004 }
          : mode === 'nose' ? { fov: vfov(fp.fov, aspect) + cam.nose.fovKick, near: 0.0015 }
            : mode === 'cargo' ? { fov: vfov(104, aspect), near: 0.0012 }
              : mode === 'tripod' ? { fov: cam.tripod.fov * (aspect < 1 ? 1.35 : 1), near: 0.01 }
                : { fov: aspect < 1 ? 62 : CFG.camera.fov, near: 0.01 };
      applyLens(false, 0, lens);
      camTarget.copy(view.focusPoint());
    } else {
      view.setFirstPerson(false);
      applyLens(false);
      camRig.orbitYaw = input.camOrbit.yaw;
      camRig.orbitPitch = THREE.MathUtils.clamp(input.camOrbit.pitch, -0.35, 0.7);
      camRig.zoom = THREE.MathUtils.clamp(1 + input.camOrbit.zoom, CFG.camera.minDistance / CFG.camera.distance, CFG.camera.maxDistance / CFG.camera.distance);
      camTarget.copy(view.focusPoint());
      camRig.dip = depth.dip;
      // The skycrane's snorkel is its load: with the dipping camera on, frame the intake as well.
      const hh = sim.heli, hoseOut = depth.settings.dipCam && hh && hh.type === 'skycrane' && hh.hose.length > 0.06;
      const cargoFocus = sim.carriedCargo().length ? view.bagPosCarried : hoseOut ? view.skycrane.curvePts[view.skycrane.curvePts.length - 1] : null;
      camRig.update(Math.max(rd, 1e-4), camTarget, heading, cargoFocus, sim);
    }
    if (fpView || rig) {
      // Keep the chase rig parked where the camera is, so leaving this view (or a crash) pulls out smoothly.
      camRig.pos.copy(camera.position);
      camRig.focus.copy(view.focusPoint());
      camRig.look.copy(view.focusPoint());
      camRig.yaw = heading;
      camRig.initialised = true;
    }
    underLiquid(mode === 'cargo' && rig ? rig.under : null);
    kitchen.garden.update(rd * worldSpeed, view.focusPoint(), camera, sim); // grass wind, shadow follow (also in first person)
    fp.wasLive = fpLive;
    camera.updateMatrixWorld();
    depth.update(rd * worldSpeed, camera, innerWidth, innerHeight);
    hud.setPlumb(crashShown ? null : depth.readout);
    fp.flash = Math.max(0, fp.flash - frameDt * 1.6);
    hud.flash(fp.flash * fp.flash);

    // Audio bed follows the rotor.
    const h = sim.heli;
    audio.updateRotor({
      alive: !!h && started && !paused,
      rotorSpeed: h ? h.rotorSpeed : 0,
      thrustFrac: h ? h.thrustFrac / 0.9 : 0,
      load: h ? h.load : 0,
      heavy: sim.aircraft === 'chinook',
      agility: h && h.body ? (() => { const w = h.body.angvel(); return Math.hypot(w.x, w.y, w.z) / 2.5; })() : 0,
      cushion: h ? Math.max(0, 1 - h.groundDist / 0.18) * Math.min(1, h.thrustFrac * 2) : 0,
      crane: sim.aircraft === 'skycrane',
      pan: h && !fpView && cam.eff !== 'cargo' && cam.eff !== 'bolt' ? THREE.MathUtils.clamp(tmp.copy(h.pos).project(camera).x, -1, 1) : 0,
      dist: h ? camera.position.distanceTo(h.pos) : 1,
      wear: h && h.dmg ? Math.max(...h.dmg.wear) : 0,
      tailGone: !!(h && h.dmg && h.dmg.tail),
    });

    // The milk stream: a pour that you can hear land.
    const bk = sim.milk.bucket;
    audio.updatePour({
      rate: started && !paused && bk ? bk.flowOut + bk.spillRate : 0,
      intoLiquid: events.some((e) => e.type === 'milkLand'),
      pan: bk ? tmp.copy(bk.pos).project(camera).x : 0,
    });

    // HUD.
    if (started && !paused) flow.update(frameDt * worldSpeed);
    if (!sim.assist && h) {
      const extra = sim.carriedCargo().reduce((m, b) => m + b.mass, 0);
      hud.setCollective(h.collective, Math.min(1, (h.def.mass + extra) / (h.def.mass * h.def.thrustToWeight)));
    }
    hud.updateBrew(view.projectCups(camera, innerWidth, innerHeight), flow.steepTimers);
    const tk = h && h.tank;
    hud.setTank(tk && started ? { fill: tk.vol / tk.capacity, doors: tk.doors,
      state: tk.auto ? `auto: ${tk.auto.phase === 'down' ? 'lowering' : tk.auto.phase === 'pump' ? 'pumping' : 'reeling in'}` : tk.salvo ? 'salvo' : tk.pumping ? 'pumping' : tk.flowOut > 0 ? 'dropping' : h.hose.submerged ? 'intake in' : '' } : null);
    hud.update(frameDt);

    const tR = performance.now();
    renderer.info.reset();
    // The hook camera feeds the cockpit display and, when shown, the inset.
    const looksDown = cam.eff === 'bolt' || cam.eff === 'cargo';
    // The inset is an extra render of the world: the cockpit has it (its display shows it too); the other
    // modes only with Hook camera set to Always, and never where the picture already looks down.
    const wantLoadCam = !!h && !looksDown && (fpLive || fp.loadCam === 'always');
    const showPip = wantLoadCam && fp.loadCam !== 'off' && !crashShown;
    if (wantLoadCam) {
      const hooks = h.def.hooks;
      // The skycrane's camera sits under the front of the tank, between the snorkel and the doors.
      const mount = h.type === 'skycrane' ? [0.004, -0.0335, -0.012] : hooks[hooks.length === 3 ? 1 : 0];
      loadCam.update(view.heliPos, view.heliQuat, mount, heading);
      loadCam.render(scene);
    }
    const rect = showPip ? pipRect() : null;
    cockpit.setPipRect(rect, innerWidth, innerHeight);
    fp.readT -= frameDt;
    if (showPip && fp.readT <= 0) { fp.readT = 0.1; fp.readText = loadReadout(); }
    hud.setLoadCam(rect, fp.readText, h && h.type === 'skycrane' ? 'BELLY CAM' : 'HOOK CAM');
    boltOverlay(cam.eff === 'bolt' && !crashShown, frameDt);
    post.render();
    if (fpView) cockpit.render();
    if (showPip) cockpit.renderPip();
    renderedFrames++;
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
  // Replay frames: the world stays frozen; the viewer poses the scene from the recording.
  function replayFrame(frameDt) {
    sim.drainEvents();
    recorder.frameEnd();
    hud.setLoadCam(null);
    kitchen.garden.update(frameDt, replay.stage.focus, camera, sim);
    const out = replay.update(frameDt);
    renderer.info.reset();
    post.render();
    if (out.cockpit) cockpit.render();
    renderedFrames++;
  }

  requestAnimationFrame(frame);

  // Expose a tiny handle for console debugging and automated checks.
  window.__helicoptea = { cam, cycleView, get camMode() { return cam.eff; }, tuning, tuningPanel, tuningKnobs, stageCrash: (kind) => stageCrash(sim, kind), cinema, cloth: kitchen.cloth, depth, recorder, replay, flightStore, openReplay, get worldSpeed() { return worldSpeed; }, post, cockpit, fpRig, loadCam, setView, get viewMode() { return fp.mode; }, fp, Autopilot, setAircraft, AIRCRAFT_NAMES, sim, view, camRig, input, audio, renderer, quality, doAction, get frames() { return renderedFrames; }, get paused() { return paused; }, get started() { return started; } };
}

boot().catch((err) => showError('Helicoptea failed to start. Please reload.', err));
