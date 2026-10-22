import { RAPIER } from './physics.js';
import { physicsChanged, physicsEpoch } from './rapierCache.js';

// Cheaper scene queries for a Rapier world.
//
// world.step() rebuilds Rapier's scene-query tree over every collider (about 500 here, almost all fixed
// scenery) on every physics step, at about a quarter of the step's cost, so that castRay sees objects where
// they are now. Here the tree holds the fixed scenery only, and is rebuilt only when colliders are added,
// removed, enabled, disabled or regrouped, or a body changes type or is teleported. Rays test the tree for
// fixed colliders and then each collider on a moving body directly, at its current position, with the same
// filters Rapier applies, and the nearest hit wins. Results are the same as world.castRay's. (A moving
// collider whose bounding sphere the ray can't reach before the nearest hit so far is skipped without asking
// Rapier: each of those queries makes two vectors on the wasm side, and about 70 a frame missed.)
const QF = RAPIER.QueryFilterFlags;
const worlds = new Set();
const markAll = () => { for (const w of worlds) w.__sq.dirty = true; };
let patched = false;

function patchPrototypes() {
  if (patched) return;
  patched = true;
  // What changes the fixed scenery (or the cached groups of moving colliders) invalidates the tree.
  // Moving bodies being moved does not: they are never looked up in the tree.
  const fixedBody = (b) => !b || b.isFixed();
  const C = RAPIER.Collider.prototype, B = RAPIER.RigidBody.prototype;
  const wrap = (proto, n, when) => {
    const f = proto[n];
    if (typeof f !== 'function') return;
    proto[n] = function (...a) { physicsChanged(); if (when(this)) markAll(); return f.apply(this, a); };
  };
  for (const n of ['setEnabled', 'setCollisionGroups', 'setSensor', 'setShape', 'setHalfExtents', 'setRadius', 'setHalfHeight', 'setRoundRadius', 'setTranslationWrtParent', 'setRotationWrtParent']) wrap(C, n, () => true);
  for (const n of ['setTranslation', 'setRotation']) wrap(C, n, (c) => fixedBody(c.parent()));
  for (const n of ['setBodyType', 'setEnabled']) wrap(B, n, () => true);
  for (const n of ['setTranslation', 'setRotation']) wrap(B, n, (b) => b.isFixed());
}

// How far a shape reaches from its own origin (Infinity: unknown, always asked).
function reach(s) {
  const T = RAPIER.ShapeType, b = s.borderRadius || 0;
  switch (s.type) {
    case T.Ball: return s.radius;
    case T.Cuboid: case T.RoundCuboid: return Math.hypot(s.halfExtents.x, s.halfExtents.y, s.halfExtents.z) + b;
    case T.Capsule: return s.halfHeight + s.radius;
    case T.Cylinder: case T.Cone: case T.RoundCylinder: case T.RoundCone: return Math.hypot(s.halfHeight, s.radius) + b;
    case T.ConvexPolyhedron: case T.RoundConvexPolyhedron: case T.TriMesh: case T.Polyline: {
      const v = s.vertices;
      if (!v) return Infinity;
      let m = 0;
      for (let i = 0; i < v.length; i += 3) m = Math.max(m, v[i] * v[i] + v[i + 1] * v[i + 1] + v[i + 2] * v[i + 2]);
      return Math.sqrt(m) + b;
    }
    default: return Infinity;
  }
}

export function lazySceneQueries(world) {
  const W = world;
  const sq = W.__sq = { dirty: true, movers: [], groups: [], radii: [], at: new Float64Array(0), atEpoch: [], updates: 0 };
  worlds.add(W);
  for (const n of ['createCollider', 'removeCollider', 'createRigidBody', 'removeRigidBody']) {
    const f = W[n].bind(W);
    W[n] = (...a) => { sq.dirty = true; return f(...a); };
  }
  const refresh = () => {
    W.queryPipeline.update(W.colliders);
    sq.movers.length = 0; sq.groups.length = 0; sq.radii.length = 0; sq.atEpoch.length = 0;
    W.forEachCollider((c) => {
      const b = c.parent();
      if (!b || b.isFixed()) return;
      sq.movers.push(c); sq.groups.push(c.collisionGroups()); sq.radii.push(reach(c.shape) + 1e-4); sq.atEpoch.push(0);
    });
    sq.at = new Float64Array(sq.movers.length * 3);
    sq.dirty = false;
    sq.updates++;
  };
  W.step = (eventQueue, hooks) => {
    physicsChanged();
    W.physicsPipeline.step(W.gravity, W.integrationParameters, W.islands, W.broadPhase, W.narrowPhase, W.bodies, W.colliders,
      W.impulseJoints, W.multibodyJoints, W.ccdSolver, eventQueue, hooks);
  };
  const castRay = W.castRay.bind(W);
  W.castRay = (ray, maxToi, solid, filterFlags, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate) => {
    if (sq.dirty) refresh();
    const flags = filterFlags || 0;
    // Fixed scenery from the tree (moving colliders are left out: their place in the tree may be old).
    let best = castRay(ray, maxToi, solid, flags | QF.EXCLUDE_KINEMATIC | QF.EXCLUDE_DYNAMIC, filterGroups, filterExcludeCollider, filterExcludeRigidBody, filterPredicate);
    let toi = best ? best.timeOfImpact : maxToi;
    // Moving colliders, each where it is now.
    for (let i = 0; i < sq.movers.length; i++) {
      const c = sq.movers[i];
      if (filterGroups !== undefined && filterGroups !== null) {
        const g = sq.groups[i];
        if (!(((filterGroups >>> 16) & g) & 0xffff) || !(((g >>> 16) & filterGroups) & 0xffff)) continue;
      }
      if (c === filterExcludeCollider) continue;
      const b = c.parent();
      if (filterExcludeRigidBody && b && b.handle === filterExcludeRigidBody.handle) continue;
      if (flags) {
        if ((flags & QF.EXCLUDE_KINEMATIC) && b.isKinematic()) continue;
        if ((flags & QF.EXCLUDE_DYNAMIC) && b.isDynamic()) continue;
        if ((flags & QF.EXCLUDE_SENSORS) && c.isSensor()) continue;
        if ((flags & QF.EXCLUDE_SOLIDS) && !c.isSensor()) continue;
      }
      const r = sq.radii[i];
      if (r !== Infinity) {
        // Where the collider is (read once between steps and changes), against the ray up to the best hit.
        const at = sq.at, k = i * 3, e = physicsEpoch();
        if (sq.atEpoch[i] !== e) { const p = c.translation(); at[k] = p.x; at[k + 1] = p.y; at[k + 2] = p.z; sq.atEpoch[i] = e; }
        const o = ray.origin, d = ray.dir;
        const ox = at[k] - o.x, oy = at[k + 1] - o.y, oz = at[k + 2] - o.z, dd = d.x * d.x + d.y * d.y + d.z * d.z;
        const s = Math.min(toi, Math.max(0, (ox * d.x + oy * d.y + oz * d.z) / dd));
        const ex = ox - d.x * s, ey = oy - d.y * s, ez = oz - d.z * s;
        if (ex * ex + ey * ey + ez * ez > r * r) continue;
      }
      if (!c.isEnabled()) continue;
      if (filterPredicate && !filterPredicate(c)) continue;
      const t = c.castRay(ray, toi, solid);
      if (t >= 0 && (best ? t < toi : t <= maxToi)) { toi = t; best = { collider: c, timeOfImpact: t }; }
    }
    return best;
  };
  patchPrototypes();
  return W;
}
