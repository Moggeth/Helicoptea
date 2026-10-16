import { RAPIER, GROUPS } from '../../physics.js';
import { ROOM, WALL_T, GARDEN } from '../../layout.js';

// Fences and the house's garden wall: a nest box and an outdoor thermometer on the brick, a trellis with a
// clematis on the right-hand fence (all fixed, solid), plus the numbers the render module shares. The robin,
// the festoon lights and the ivy are render-only (see src/render/extras/zones/fences.js).

const fy = ROOM.floorY;
export const WALL_Z = ROOM.minZ - WALL_T;        // the brick face on the garden side (-1.62)

// Fence geometry as garden.js builds it: boards on the line, rails 3 cm thick, posts 9 cm square.
export const FENCE = { left: GARDEN.minX, right: GARDEN.maxX, back: GARDEN.minZ, postTop: fy + GARDEN.fenceH + 0.12, boardTop: fy + 0.05 + GARDEN.fenceH };
// Post z positions along the side fences (garden.js: round(len / 1.8) panels, so 3 spans).
export const POST_Z = [0, 1, 2, 3].map((i) => GARDEN.maxZ + (GARDEN.minZ - GARDEN.maxZ) * i / 3);

// Nest box on the wall left of the window: back plate, box, pitched roof (faces -z).
export const NEST = { x: -1.95, y: 0.97, plateW: 0.15, plateH: 0.38, plateT: 0.02, w: 0.15, d: 0.14, hFront: 0.22, hBack: 0.26, y0: 0.82 };
// Outdoor thermometer on a backboard.
export const THERMO = { x: -2.22, y: 0.62, w: 0.085, h: 0.4, t: 0.014 };
// Trellis panel on the right fence, between the posts.
export const TRELLIS = { x: 3.762, z0: -4.5, z1: -3.4, y0: -0.34, y1: 0.74, t: 0.03 };
// Festoon lights along the left fence: from the corner post to the back one, hung from the post tops.
export const FESTOON = { x: FENCE.left + 0.06, y: fy + GARDEN.fenceH + 0.07, sag: 0.13 };

export function create(sim, lite) {
  void lite;
  const fixed = sim.props && sim.props.fixed ? sim.props.fixed : sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const box = (hx, hy, hz, x, y, z, kind, material) => {
    const d = RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setCollisionGroups(GROUPS.world).setFriction(0.7).setRestitution(0.1);
    sim.register(sim.world.createCollider(d, fixed), { kind, material });
  };
  const N = NEST;
  box(N.w / 2, N.plateH / 2, N.plateT / 2, N.x, N.y, WALL_Z - N.plateT / 2, 'nestbox', 'wood');
  box(N.w / 2 + 0.015, (N.hBack + 0.03) / 2, N.d / 2 + 0.025, N.x, N.y0 + (N.hBack + 0.03) / 2 - 0.015, WALL_Z - N.plateT - N.d / 2, 'nestbox', 'wood');
  const Th = THERMO;
  box(Th.w / 2, Th.h / 2, Th.t / 2, Th.x, Th.y, WALL_Z - Th.t / 2, 'thermometer', 'wood');
  const Tr = TRELLIS;
  box(Tr.t / 2, (Tr.y1 - Tr.y0) / 2, (Tr.z1 - Tr.z0) / 2, Tr.x, (Tr.y0 + Tr.y1) / 2, (Tr.z0 + Tr.z1) / 2, 'trellis', 'wood');
  return {};
}
