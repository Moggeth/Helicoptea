import RAPIER from '@dimforge/rapier3d-compat';

// Rapier's getters for a body's position, rotation and velocities each make a vector on the wasm side,
// register it with a FinalizationRegistry, copy it into a new JS vector and free it again: about 240 times a
// frame here (most bodies are read several times a step), and garbage for the collector. Those values can
// only change when a world steps or something is done to a body, so each body keeps the last answer until
// then, and hands out copies of it (callers may change what they get).
//
// Anything that might change a body counts: a World stepping, freeing, creating or removing anything, and
// every RigidBody method other than the ones below, which only read or only queue forces for the next step.
// (Collider setters count too, for sceneQueries.js, which keeps colliders' positions the same way.) The
// answers are the same numbers Rapier gives, so the simulation, and replays, are unchanged.
let epoch = 1;
export const physicsChanged = () => { epoch++; };
export const physicsEpoch = () => epoch;

const KEEP = new Set([
  'constructor', 'translation', 'rotation', 'linvel', 'angvel', 'isValid', 'dominanceGroup', 'additionalSolverIterations',
  'softCcdPrediction', 'nextTranslation', 'nextRotation', 'gravityScale', 'mass', 'effectiveInvMass', 'invMass', 'localCom',
  'worldCom', 'invPrincipalInertiaSqrt', 'principalInertia', 'principalInertiaLocalFrame', 'effectiveWorldInvInertiaSqrt',
  'effectiveAngularInertia', 'isCcdEnabled', 'numColliders', 'collider', 'isEnabled', 'bodyType', 'isSleeping', 'isMoving',
  'isFixed', 'isKinematic', 'isDynamic', 'linearDamping', 'angularDamping', 'resetForces', 'resetTorques', 'addForce',
  'addTorque', 'addForceAtPoint', 'userForce', 'userTorque',
]);

let patched = false;
export function cacheBodyReads() {
  if (patched) return;
  patched = true;
  const B = RAPIER.RigidBody.prototype, W = RAPIER.World.prototype;
  for (const P of [B, W]) {
    for (const n of Object.getOwnPropertyNames(P)) {
      const d = Object.getOwnPropertyDescriptor(P, n);
      if (typeof d.value !== 'function' || n === 'constructor' || (P === B ? KEEP.has(n) : !/^(step|free|create|remove|switch|propagate)/.test(n))) continue;
      const f = d.value;
      P[n] = function (...a) { epoch++; return f.apply(this, a); };
    }
  }
  const vec = (name, slot) => {
    const f = B[name];
    B[name] = function () {
      let c = this[slot];
      if (!c || c.epoch !== epoch) {
        const v = f.call(this);
        if (!c) c = this[slot] = { epoch: 0, x: 0, y: 0, z: 0 };
        c.epoch = epoch; c.x = v.x; c.y = v.y; c.z = v.z;
        return v;
      }
      return new RAPIER.Vector3(c.x, c.y, c.z);
    };
  };
  vec('translation', '__cacheT');
  vec('linvel', '__cacheV');
  vec('angvel', '__cacheW');
  const rot = B.rotation;
  B.rotation = function () {
    let c = this.__cacheR;
    if (!c || c.epoch !== epoch) {
      const q = rot.call(this);
      if (!c) c = this.__cacheR = { epoch: 0, x: 0, y: 0, z: 0, w: 1 };
      c.epoch = epoch; c.x = q.x; c.y = q.y; c.z = q.z; c.w = q.w;
      return q;
    }
    return new RAPIER.Quaternion(c.x, c.y, c.z, c.w);
  };
}
