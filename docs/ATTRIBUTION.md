# Asset sources and licences

Helicoptea ships **no external art, sound, font or model files**.

| Asset | Source |
|---|---|
| Textures (wood, linen, cork, tea-bag paper, tag, plaster, tiles, floor, window view, decals, particles) | Generated at runtime with Canvas 2D in [src/render/textures.js](../src/render/textures.js) |
| 3D models (helicopter, cups, teapot, stand, props, room) | Built from Three.js primitives, lathes and extrusions in [src/render/models.js](../src/render/models.js) and [src/render/kitchen.js](../src/render/kitchen.js) |
| Tea surface, rotor blur, particles | Custom shaders in this repository |
| Sound | Synthesised with the Web Audio API in [src/audio/audio.js](../src/audio/audio.js) |
| Fonts | System font stacks only (no web fonts are downloaded) |
| Favicon | Inline SVG in index.html |

## Libraries

| Library | Version | Licence |
|---|---|---|
| three (incl. `examples/jsm/environments/RoomEnvironment.js`) | 0.169.0 | MIT |
| @dimforge/rapier3d-compat | 0.14.0 | Apache-2.0 |
| vite (dev/build only) | 5.4.10 | MIT |
| playwright-core (tests only, drives an installed browser) | 1.48.2 | Apache-2.0 |
