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
  paints the ground ([ground.js](../src/render/world/ground.js)) and draws the horizon.
- **Shared assets**: [src/render/world/kit.js](../src/render/world/kit.js) (houses, windows, doors, trees,
  hedges, fences, leaf cards, world materials) and their colliders in
  [src/sim/world/shapes.js](../src/sim/world/shapes.js).

## Area module contract

Each area is a pair, `src/sim/world/<area>.js` and `src/render/world/areas/<area>.js`.

Sim side (DOM-free; the headless checks build it in Node). At the top level import only from `./plan.js`,
`./shapes.js`, `three` and `../physics.js` (layout.js imports the area modules for their cups, so using
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
