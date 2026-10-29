# The neighbourhood (big map)

The kitchen and its tea garden are now the middle of a neighbourhood about 39 × 80 m: the kitchen is the
single-storey back extension of a two-storey house with a loft, flanked by neighbours' houses and gardens
along a street, with a parade of shops and a tea room across the road, and behind the gardens a back lane,
allotments, then a park with a stream, a pond and woodland, and hills on the horizon. The micro heli's
rotor is 20 cm across, so this is a big sky playground: a sandbox with cups of tea scattered about (no
missions) and flight routes built on purpose.

## Frame

- **Plan**: [src/sim/world/plan.js](../src/sim/world/plan.js) holds every shared number: ground level `FY`,
  `BOUNDS`, the plots, the main house's envelope and floors (`MAIN`), the doors other areas depend on,
  the street's and the lane's lines, the stream, pond and knoll, `groundHeight(x, z)` (flat everywhere but
  the park) and the streaming `AREAS`. It imports nothing.
- **Physics**: [src/sim/world/index.js](../src/sim/world/index.js) builds the ground (a slab, and a Rapier
  heightfield over the park), the invisible walls and lid round the world, and every area's colliders.
  Area cups and tea stands are appended to `CUPS` and `STATIONS` in layout.js. Neighbourhood stands only
  hang bags while the helicopter is within 4 m (bags left on them are tidied away beyond 9 m), so the bag
  pool (`maxBags` 14) follows you.
- **Rendering**: [src/render/world/index.js](../src/render/world/index.js) runs each area's `build(ctx)`,
  merges static meshes per material into 12 m chunks and draws them by distance in three levels of detail,
  paints the ground ([ground.js](../src/render/world/ground.js)) and draws the horizon. The sky, the haze
  (scene fog) and the far hills' pre-mixed haze share one set of colours in
  [src/render/atmosphere.js](../src/render/atmosphere.js): change them there, not in each place.
- **Chairs**: every chair, sofa and armchair comes from one kit, [src/render/chairs.js](../src/render/chairs.js)
  (`placeChair`, `placeSofa`), whose measurements the colliders share in
  [src/sim/chairShapes.js](../src/sim/chairShapes.js). Place a chair with its frame matrix and merge the pieces
  into your batch; fit its colliders to the shared numbers.
- **Shared assets**: [src/render/world/kit.js](../src/render/world/kit.js) (houses, windows, doors, trees,
  hedges, fences, leaf cards, world materials) and their colliders in
  [src/sim/world/shapes.js](../src/sim/world/shapes.js).

## The neighbours

Seven people sit out round the neighbourhood (one stands at the barbecue), each with a cup of tea that is
theirs: [src/sim/people.js](../src/sim/people.js) places them on existing seats and names their cups ("Agnes's
tea"). They are the sandbox's light missions, told without a HUD: they watch the helicopter that comes close,
offer their cup with an open hand, are pleased (a nod, a wave, a smile and "mm") once it is brewed to their
liking, and say "hmm" if it goes past it. Rotor blades on a person end the flight (the tail rotor alone is a
tail strike); they say ow, flinch and put a hand to a small red nick where the blade touched, and the crash
screen names them. With "Blades break on a strike" off they still say ow and keep the nick.

- **Pose** ([src/sim/personPose.js](../src/sim/personPose.js)): 24 bones solved straight into person space
  (two-bone IK for arms and legs), shared by the sim and the renderer. The animation (breathing, weight
  shifts, blinking, where they look, each person's habit, the reactions) runs in the sim at 60 Hz near the
  aircraft and less often further off, so the colliders (capsules and balls on the trunk, head and limbs)
  follow the body. Like the areas' colliders they exist only while the aircraft, a bag or wreckage is near.
- **Drawing** ([src/render/people.js](../src/render/people.js)): one skinned mesh per person (about 3,000
  triangles, every part built in its bone's frame with vertex colours, nicks included) on one shared
  material, so a person is one draw call and everyone shares one shader program, built in the warm-up. The
  bone texture is uploaded only when the pose has changed. People sit in their area's level-1 chunks.

## Area module contract

Each area is a pair, `src/sim/world/<area>.js` and `src/render/world/areas/<area>.js`.

Sim side (DOM-free; the headless checks build it in Node). At the top level import only from `./plan.js`,
`./shapes.js`, `../chairShapes.js`, `three` and `../physics.js` (layout.js imports the area modules for their cups, so using
layout.js values at load time would be an import cycle; inside functions it is fine). Exports:

- `CUPS`: cups like layout.js's (`id` prefixed with the area, `name`, `shape: 'teacup'` or a mug, `x, z`,
  `standY` the surface it stands on, `baseY`, `rOut, rIn, height, bottom, water, handleYaw, glaze, rim`,
  optional `saucer` radius). Copy the proportions of existing cups.
- `STATIONS`: tea stands `{ ...STATION, x, z, y }` (import STATION's numbers by value: `baseHalf`,
  `postX`, `postHalf`, `postHeight`, `barY`, `barHalf`, `pegReach`, `pegY`, `pegXs`); the pegs point to +z,
  so keep +z of a stand open for 0.4 m.
- `colliders(w)`: fixed colliders through the helpers in index.js (`box`, `boxQ`, `cyl`, `ball`, `rail`,
  `hull`, `groundY`) and the shared shapes (`houseColliders`, `treeColliders`, `runColliders`).
- optional `create(sim, lite)`: dynamic set pieces, exactly like src/sim/extras modules.

Render side: `build(ctx)`:

- `ctx.add(geometry, material, matrix, colour, lod)`: a static mesh merged into its chunk. Materials come
  from `ctx.kit` (src/render/extras/kit.js: wood, weathered, bark, paint, terracotta, stone, soil, ceramic,
  enamel, brass, copper, iron, zinc, steel, fabric, wicker, paper, leaf, petal, glass, rubber) and `ctx.wk`
  (brick, roof, window, leafy, bark, water), white-based and tinted by `colour`. Level of detail:
  `0` structure, drawn out to the fog; `1` detail, drawn within ~55 m (28 m on phones); `2` fine, desktop
  only, within ~24 m.
- `ctx.object(obj, lod)`: anything live (animated, instanced, transparent), culled with its chunk.
- `ctx.update(fn)`: `fn(dt, sim, camera)` each frame while the camera is near the area.
- `ctx.ground`: paint the ground (`rect`, `circle`, `poly`, `path` with a surface `type`) and soft sun
  shadows under big things (`shadowRect`, `shadowCircle`). The kit's builders paint their own shadows.
- `ctx.groundY(x, z)`, `ctx.T(x, y, z, ry, rx, rz, sx, sy, sz)`, `ctx.boxUV`, `ctx.planeUV`,
  `ctx.blobGeometry`, `ctx.sway(material, opts)` (foliage that bends in wind and wash), `ctx.airAt(p, out)`,
  `ctx.lite` (phones and the low tier), `ctx.hi`, `ctx.replayProxy`, `ctx.audio`.

`?noworld=all` or `?noworld=park,street` leaves areas out for measuring.

## Quality bar

Every area is judged against the same bar.

1. **Real and cosy, at true scale.** A believable English suburb and countryside in metres: doors 2 m,
   worktops 0.9 m, fences 1.2 to 1.8 m, kerbs 0.1 m. Real materials and colours, weathered and varied (tint
   jitter, wear, moss, puddles), nothing toy-like or saturated. The helicopters are serious; the world is
   cosy and lived-in; the comedy is the contrast.
2. **Solid where it looks solid.** Colliders match what you see within a couple of centimetres anywhere you
   could fly close; foliage is solid at about 0.8 of its visible size. Nothing floats; everything stands on
   `groundY`.
3. **Routes on purpose.** Each area builds named flight routes (threading windows, doors and flaps, under
   tables and benches, between rails, through hedge arches, over roofs and chimneys, slaloms, long scenic
   runs) with stated clearances for a 20 cm rotor: tight 0.3 m, medium 0.5 m, easy 0.8 m and up. A headless
   check sweeps each one (tests/route-lib.mjs).
4. **Cups as goals.** Two to five cups per area in places worth flying to (a sill, a roof, a bench, inside
   a shed), each with open sky above its opening, and a tea stand where bags are needed.
5. **Cheap.** 120+ fps on desktop and smooth on a Galaxy S24 Ultra: shared tinted materials (no per-piece
   materials, no new shader programs), low-poly shapes (cylinders 6 to 12 sides), level of detail on
   everything, instancing for repeated small things, no textures over 512² (and few), cheap `update`s that
   early-out, few dynamic bodies (fewer still with `lite`).

Check set dressing with `node tests/audit-world.mjs http://localhost:PORT/` (a dev server, so the report names
source lines): it lists groups of pieces that touch neither the ground nor anything that does (floating props)
and small pieces deep inside wall-shaped boxes (props pushed through a wall). It works from bounding boxes, so
it cannot see a shelf left across a doorway or grass growing through a floor: look at every area with
`tests/shot-world.mjs --view=...` too, and paint the ground under anything with a floor of its own (pools,
tiled paths, buildings) as a hard or soil surface so the grass doesn't come up through it.

## Cost, and how it is kept down

- **Physics**: Rapier's step grows with every collider in the world, so the areas' colliders (about 3,900,
  cups included) stream: each exists only within reach of the aircraft (1.6 m for the micro heli, 2.6 m
  for the heavy ones, more with speed, at most 4 m, in 3D) or of a bag, a piece of wreckage or a hanging load
  (1.5 m). The rest are removed and rebuilt from their descriptions when something comes near
  (`ColliderStreamer` in src/sim/world/index.js). The world's ground slabs keep off the kitchen and garden's
  own floor so loose things there don't touch two grounds.
- **Draw calls**: chunks are 40 m for structure, 24 m for detail and 12 m for fine pieces (80 / 36 / 12 m on
  phones); in the chunks, the kit's materials that differ only in roughness and metalness share one material
  per texture and read those from the vertices. Indoors the outside detail closes in; far chunks skip the
  AO pass; cups beyond 16 m (12 m on phones) stop drawing and rippling, and only cups near the aircraft
  steam. Merged geometry stays indexed with byte normals and 16-bit tints, and its arrays are released once
  on the GPU.
- **Phones**: no fine level, half the small leaves and petals, coarser foliage lumps, still foliage, detail
  within 13 m, structure to 56 m under a closer haze.

Measured on the development PC (RTX 3080 Ti), 1080p high, micro heli, flying (`tests/perf-bench.mjs`), with
master before the neighbourhood in brackets: kitchen chase 143 fps (177), kitchen cockpit 124 (157),
garden chase 172 (270), garden cockpit 148 (239). Emulated Galaxy S24 Ultra (`tests/e2e-phone-memory.mjs`):
GPU memory 113 MB of the 160 MB budget (78 before), retained script memory 120 MB of 150 (102 before; the
test now collects garbage before reading it: building the world leaves short-lived garbage that the next
collection takes). On the 4× CPU-throttled phone emulation the frame rate is about 60 to 70% of the old
one; real-phone numbers are still to be measured.
