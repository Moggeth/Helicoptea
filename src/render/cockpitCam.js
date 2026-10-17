import * as THREE from 'three';

// First-person (pilot's eye) camera. The view is bolted to the airframe, so it rolls and pitches with
// it; on top of that the pilot's head is a small sprung mass (it lags accelerations and sways under g),
// the neck turns for free-look (the eye swings about the neck, and leans to peer through the chin
// and door windows), and the airframe vibrates with the rotor. Everything is in body coordinates
// at model scale (a micro-heli cabin is 37 mm wide), so offsets are fractions of a millimetre.
export const SEATS = {
  // eye: pilot's eye; neck: pivot the head turns about; lean: extra offset at full look-down;
  // clamp: eye box that keeps the head inside the cabin; pitch0: resting look angle (slightly down).
  micro: { eye: [0.0085, 0.0092, -0.0150], neck: [0.0085, 0.0040, -0.0112], lean: [0.0022, -0.0020, -0.0030], pitch0: -0.27,
    box: [[-0.006, 0.0150], [-0.002, 0.0135], [-0.0215, -0.006]], near: 0.005 },
  chinook: { eye: [0.0072, 0.0100, -0.0702], neck: [0.0072, 0.0066, -0.0680], lean: [0.0020, -0.0016, -0.0024], pitch0: -0.36,
    box: [[-0.003, 0.0160], [0.003, 0.0130], [-0.0760, -0.0665]], near: 0.005 },
  skycrane: { eye: [0.0048, 0.0121, -0.0671], neck: [0.0048, 0.0090, -0.0646], lean: [0.0018, -0.0016, -0.0022], pitch0: -0.29,
    box: [[-0.004, 0.0090], [0.006, 0.0160], [-0.0740, -0.0620]], near: 0.005 },
};

const G = new THREE.Vector3(0, 9.81, 0);
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _qi = new THREE.Quaternion(), _e = new THREE.Euler();
const _q = new THREE.Quaternion(), _up = new THREE.Vector3(), _r = new THREE.Vector3();
const clamp = THREE.MathUtils.clamp;

export class CockpitRig {
  constructor() {
    this.lookYaw = 0; this.lookPitch = 0;     // user free-look (radians, relative to the seat)
    this.fovZoom = 0;                          // wheel / pinch zoom offset (degrees)
    this.recentering = false;
    this.headOff = new THREE.Vector3();        // sprung head offset (body frame, metres)
    this.headVel = new THREE.Vector3();
    this.lag = new THREE.Vector3();            // rotational head lag (pitch, yaw, roll)
    this.accF = new THREE.Vector3();           // filtered world acceleration
    this.prevVel = new THREE.Vector3();
    this.hasPrev = false;
    this.vibT = 0;
    this.rattle = 0;                           // skid scrape rattle, decays quickly
    this.eyeLocal = new THREE.Vector3();
    this.headQuat = new THREE.Quaternion();
    this.worldPos = new THREE.Vector3();
    this.worldQuat = new THREE.Quaternion();
    this.seat = SEATS.micro;
  }

  reset() {
    this.headOff.set(0, 0, 0); this.headVel.set(0, 0, 0); this.lag.set(0, 0, 0); this.accF.set(0, 0, 0);
    this.hasPrev = false;
  }

  recenter() { this.recentering = true; this.fovZoom = 0; }

  // Physical feedback from sim events, felt through the seat. Sized for comfort: about a millimetre
  // of head travel (3 cm full size) and a degree or so of nod at most, scaled by Head motion.
  kick(e, motion) {
    const m = motion * 1.2;
    if (m <= 0) return;
    switch (e.type) {
      case 'touchdown': {
        const k = Math.min(1, e.speed / 0.5);
        this.headVel.y -= 0.012 * k * m;
        this.lag.x -= 0.022 * k * m;
        this.rattle = Math.min(1, this.rattle + 0.4 * k);
        break;
      }
      case 'snatch': {
        const k = Math.min(1, e.speed / 0.6) * Math.min(1, (e.mass || 0.005) / 0.008);
        this.headVel.y -= 0.008 * k * m;
        this.lag.x -= 0.012 * k * m;
        break;
      }
      case 'bump': {
        const k = Math.min(1, (e.dv || 0) / 0.8);
        this.headVel.x += (Math.random() - 0.5) * 0.014 * k * m;
        this.headVel.y -= 0.008 * k * m;
        this.lag.z += (Math.random() - 0.5) * 0.03 * k * m;
        break;
      }
      case 'scrape': this.rattle = Math.min(1, this.rattle + Math.min(0.5, e.speed * 1.2)); break;
      default: break;
    }
  }

  // look: { yaw, pitch } deltas in radians this frame (from mouse, touch, stick or d-pad).
  addLook(dyaw, dpitch) {
    if (!dyaw && !dpitch) return;
    this.recentering = false;
    this.lookYaw = clamp(this.lookYaw + dyaw, -2.5, 2.5);
    this.lookPitch = clamp(this.lookPitch + dpitch, -1.25, 0.95);
  }

  // h: aircraft (sim), pos/quat: interpolated pose drawn this frame, set: { motion, vibration } in 0..1,
  // shake: crash/bump shake from the chase rig (re-used so both views feel the same hits).
  update(dt, h, pos, quat, set, shake = 0) {
    const S = this.seat = SEATS[h ? h.type : 'micro'] || SEATS.micro;
    if (this.recentering) {
      const k = 1 - Math.exp(-dt * 7);
      this.lookYaw += (0 - this.lookYaw) * k; this.lookPitch += (0 - this.lookPitch) * k;
      if (Math.abs(this.lookYaw) + Math.abs(this.lookPitch) < 1e-3) { this.lookYaw = this.lookPitch = 0; this.recentering = false; }
    }
    const motion = set.motion * 2;           // 0.5 (the default) is the tuned value
    if (h && dt > 0) {
      // Specific force felt by the pilot, in body axes, relative to a steady 1 g along the mast.
      if (this.hasPrev) {
        _v.subVectors(h.vel, this.prevVel).divideScalar(Math.max(dt, 1e-3));
        this.accF.lerp(_v, 1 - Math.exp(-dt / 0.07));
      }
      this.prevVel.copy(h.vel); this.hasPrev = true;
      _qi.copy(quat).invert();
      const fB = _w.copy(this.accF).add(G).applyQuaternion(_qi).sub(G);
      // Head: a well-damped spring pushed opposite the felt acceleration (about 0.35 mm, ~1 cm full
      // size, per g). Damped enough that it settles without bobbing.
      const k = 0.000035 * motion;
      const tgt = _v.set(-fB.x * k, -fB.y * k * 0.6, -fB.z * k);
      tgt.clampLength(0, 0.001);
      const om = 9, ze = 0.8;
      const a = _r.subVectors(tgt, this.headOff).multiplyScalar(om * om).addScaledVector(this.headVel, -2 * ze * om);
      this.headVel.addScaledVector(a, Math.min(dt, 0.033));
      this.headOff.addScaledVector(this.headVel, Math.min(dt, 0.033));
      // Rotational lag: the head trails sudden rotation, and counter-rolls a little to the horizon.
      const av = h.body ? h.body.angvel() : { x: 0, y: 0, z: 0 };
      const wB = _w.set(av.x, av.y, av.z).applyQuaternion(_qi);
      _up.set(1, 0, 0).applyQuaternion(quat);
      const bank = Math.asin(clamp(_up.y, -1, 1));
      const lagT = _r.set(-wB.x * 0.016, -wB.y * 0.012, -wB.z * 0.018 + bank * 0.07).multiplyScalar(motion);
      lagT.set(clamp(lagT.x, -0.035, 0.035), clamp(lagT.y, -0.035, 0.035), clamp(lagT.z, -0.05, 0.05));
      this.lag.lerp(lagT, 1 - Math.exp(-dt * 9));
    }
    // Airframe tremor: a faint, smooth rumble that grows with collective. Kept well under a tenth of a
    // degree and below 15 Hz, so it reads as a running machine rather than a shaking camera (a fast buzz
    // aliases into jitter at display frame rates).
    this.vibT += dt;
    let vp = 0, vy = 0, vh = 0;
    this.rattle *= Math.exp(-dt * 7);
    if (this.rattle > 0.002) {
      const r = this.rattle * (0.3 + set.motion);
      vp += r * 0.0025 * Math.sin(this.vibT * 61.3); vy += r * 0.0015 * Math.sin(this.vibT * 73.9 + 1); vh += r * 0.00005 * Math.sin(this.vibT * 55.1);
    }
    if (h && set.vibration > 0) {
      const amp = set.vibration * 2 * h.rotorSpeed * (0.3 + 0.7 * Math.min(1, h.thrustFrac)) * (h.grounded ? 0.5 : 1);
      const t = this.vibT;
      vp += amp * 0.00022 * (Math.sin(t * 71.6) + 0.5 * Math.sin(t * 88.3 + 1.1));
      vy += amp * 0.00012 * (Math.sin(t * 79.1 + 0.4) + 0.5 * Math.sin(t * 59.7 + 2.3));
      vh += amp * 0.000006 * Math.sin(t * 66.4 + 0.7);
    }
    const sh = shake * 5 * (0.35 + 1.3 * set.motion);
    const st = this.vibT;
    const shP = sh * Math.sin(st * 53), shY = sh * Math.sin(st * 47 + 2.1), shR = sh * Math.sin(st * 61 + 1.3);

    // Head orientation (seat frame): look + resting tilt + lag + vibration + shake.
    _e.set(this.lookPitch + S.pitch0 + this.lag.x + vp + shP, this.lookYaw + this.lag.y + vy + shY, this.lag.z + shR, 'YXZ');
    this.headQuat.setFromEuler(_e);
    // Eye swings about the neck, then leans towards where you look (peering down and out).
    const neck = _v.set(...S.neck);
    this.eyeLocal.set(...S.eye).sub(neck).applyQuaternion(this.headQuat).add(neck);
    const down = clamp((-this.lookPitch - 0.25) / 0.9, 0, 1);
    const side = clamp(Math.abs(this.lookYaw) / 1.4, 0, 1);
    const lean = Math.max(down, side * 0.6);
    const sgn = this.lookYaw < 0 ? 1 : -1;  // yaw + is to the left (counter-clockwise from above)
    this.eyeLocal.x += S.lean[0] * sgn * side * (0.4 + 0.6 * down);
    this.eyeLocal.y += S.lean[1] * lean;
    this.eyeLocal.z += S.lean[2] * down * Math.cos(this.lookYaw);
    this.eyeLocal.add(this.headOff);
    this.eyeLocal.y += vh;
    const B = S.box;
    this.eyeLocal.set(clamp(this.eyeLocal.x, B[0][0], B[0][1]), clamp(this.eyeLocal.y, B[1][0], B[1][1]), clamp(this.eyeLocal.z, B[2][0], B[2][1]));

    this.worldQuat.copy(quat).multiply(this.headQuat);
    this.worldPos.copy(this.eyeLocal).applyQuaternion(quat).add(pos);
  }

  apply(worldCam, overlayCam) {
    worldCam.position.copy(this.worldPos);
    worldCam.quaternion.copy(this.worldQuat);
    worldCam.updateMatrixWorld();
    overlayCam.position.copy(this.eyeLocal);
    overlayCam.quaternion.copy(this.headQuat);
    overlayCam.updateMatrixWorld();
  }
}

// Belly camera: a gimballed, downward-looking camera at the cargo hook. Image up is the nose, so
// moving the cyclic forward moves the picture the same way. Rendered small into a texture that is
// shown as an inset and on the cockpit's display.
export class LoadCamera {
  constructor(renderer, quality) {
    this.renderer = renderer;
    const n = (quality.name === 'high' || quality.name === 'ultra') ? 384 : quality.name === 'medium' ? 288 : 224;
    this.rt = new THREE.WebGLRenderTarget(n, n, { type: THREE.HalfFloatType, samples: quality.antialias ? 2 : 0 });
    this.rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.003, 4);
    // A small screen does not need the full frame rate: at most 60 pictures a second (fewer on lower
    // quality), so a 120 Hz display does not pay for a second world render every frame.
    // On slower tiers it also skips frames, as before, so a struggling device is not made to pay for
    // it every frame.
    this.period = (quality.name === 'high' || quality.name === 'ultra') ? 1 / 60 : quality.lite ? 1 / 15 : quality.name === 'medium' ? 1 / 40 : 1 / 25;
    this.every = (quality.name === 'high' || quality.name === 'ultra') ? 1 : quality.name === 'medium' ? 2 : 3;
    this.frame = 0;
    this.last = -1;
    this.active = false;
    this.rendered = false;
  }

  // hookLocal: the mount (body frame); heading: aircraft heading.
  update(pos, quat, hookLocal, heading) {
    _v.set(hookLocal[0], hookLocal[1] + 0.006, hookLocal[2]).applyQuaternion(quat).add(pos);
    this.camera.position.copy(_v);
    this.camera.quaternion.setFromEuler(_e.set(-Math.PI / 2, heading, 0, 'YXZ'));
    this.camera.updateMatrixWorld();
  }

  render(scene, force = false, before = null, after = null) {
    const now = performance.now() / 1000;
    if (!force && this.rendered && ((this.frame++ % this.every) !== 0 || now - this.last < this.period * 0.9)) return;
    this.last = now;
    const r = this.renderer;
    const au = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;     // re-use this frame's shadow maps
    const prev = r.getRenderTarget();
    try {
      before?.();
      r.setRenderTarget(this.rt);
      r.clear();
      r.render(scene, this.camera);
      this.rendered = true;
    } finally {
      r.setRenderTarget(prev);
      r.shadowMap.autoUpdate = au;
      after?.();
    }
  }
}
