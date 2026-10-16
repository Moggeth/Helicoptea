# 3D artist handoff

These generated concepts explore form, materials, mood and interactions. They are not engineering drawings or approved features. Within a sheet, the large hero view is the visual authority; the written requirements here and the current source override conflicting insets or labels.

## Grounding

Inspected source revision: e4076c35e5cc1d36aab79557740bb68a31229d47. Runtime exterior assemblies are src/render/heliModel.js, chinookModel.js, skycraneModel.js and exteriorCabin.js. Mechanics are in src/config.js and src/sim/helicopter.js, chinook.js, skycrane.js and milk.js. Front, side, rear and overhead runtime images were inspected; representative captures are included in references/.

Preserve serious miniature aviation performing domestic tasks. Full-size mugs, teaspoons, cloth, wood grain and paper establish scale. Use broad cream, sage, navy, olive and orange material areas, restrained brass at working joints, clear glazing and convincing wet paper. Small rivets and wear generally belong in textures. Decorative slogans, leaf logos, registrations and incidental generated typography are placeholders.

## Existing contracts

| Aircraft | Current source configuration | Defining features |
|---|---|---|
| Micro | Approximately 24 g | Two-blade main rotor, tail rotor, skid gear, single central belly hook; navy/ivory with thin red stripe |
| Chinook | Approximately 94 g | Two three-blade tandem rotors, no tail rotor, three separate belly hooks, olive transport cabin and wheels |
| Skycrane | Approximately 110 g dry | Six-blade main rotor, four-blade tail rotor, forward glazed pod, orange/green spine, box-like tank, snorkel and separate aft belly hook |

These masses are source configuration values, not measurements of generated objects. Existing physics, momentum, hook reach, collision extents, wet-bag weight and aircraft differences remain the authority. Do not move mechanics to fit a painting.

## Coordinates and rig

Metres; +Y up, -Z nose/forward, +X right; root at the existing centre of mass. Use source hub, hook and cockpit socket locations. Separate visual offsets from physics roots.

Preserve source destruction groups. Micro includes fuselage, tailBoom, tail, skidL, skidR, mast, bladeA and bladeB. Skycrane includes cockpit, spine, engines, tailBoom, tailPylon, tank, gear groups and six blade groups. Read each source part array for the complete map.

Model separate rotor pivots and blur states, door and nacelle hinges, gear, cargo latches, hook and light sockets, cockpit viewpoints and breakable parts. Strings and hoses attach to the runtime simulation rather than being baked rigid meshes. Show empty/loaded, stowed/deployed and intact/damaged states.

## Review notes by image

| Image | Requirements and remaining interpretation |
|---|---|
| 01 | Mood/action reference. Decorative background tank and Chinook cargo are exploratory. Use individual sheets and source for an actual fleet asset. |
| 02 | Hero guides proposed cabin/livery treatment. Engine/cowling detail disagrees in the rear inset; resolve to the current light utility assembly. Preserve full blade sweep and skid spacing. |
| 03 | Three independent hooks and loads. Generated load-specific captions do not define capacities. Validate the complete tandem rotor phasing cycle. |
| 04 v2 | Selected correction separates milk plumbing from turbines. The stowed U is ONE hose with its free intake held by a clip, not a closed recirculation pipe. Use the source intake head and aft BELLY cargo socket, never the hook drawn at the tail end. Source tank shape and gear stations override ornamental differences. |
| 05 | New Thimble: two coaxial counter-rotating rotor planes, no tail rotor. Ignore generated 95 g, payload and clearance figures. Approximately 12 cm overall is a proposal; establish mass and flexible-blade clearance independently. |
| 06 v2 | New Swift: both nacelles rotate together on transverse wingtip pivots. Corrected cruise inset has vertical propeller disks facing forward. Validate swept disks throughout transition and clearance to wing, fuselage and cargo pod. Proposed wingspan 22 cm. |
| 07 | New Lacewing: outward-canted side-by-side masts require mechanically phased intermeshing animation. The painting does not prove collision-free rotation. Winch reaction passes through the tubular keel. Battery and controls need maintenance access. Proposed length 18 cm. |
| 08 | New Dandelion: rotor autorotates; rear pusher supplies forward thrust. No helicopter hover. Keep booms outside propeller arc and cargo in the CG-adjacent rigid basket. Proposed length 16 cm; forward-speed/runway mechanics are unimplemented. |
| 09 | New Kingfisher: 24 cm is proposed WINGSPAN, not fuselage length despite side-view dimension placement. Resolve floats, wheel mechanism and rudders into one coherent blockout; validate propeller/water clearance, buoyancy and planing. |
| 10 | New Teacaddy: ceramic-looking gondola means thin painted lightweight model material. Proposed 45 cm envelope has no demonstrated lift budget. Resolve incidental extra tail propeller against the intended two-side-propeller layout; prototype lift volume, mass, trim and wind response before final modelling. |
| 11 v2 | New tools. Corrected version removes invented 200/250 g ratings. The 5 ml spray pod is proposed, not balanced. A structural hardpoint carries load; a power lead does not. Magnet acts on designated ferromagnetic props, not every stainless spoon or aluminium/ceramic object. Explicit latch, reel and nozzle states required. |
| 12 | New greenhouse route. Block out full rotor sweep, cargo swing and approach paths before dense foliage. No measured level dimensions are implied. |
| 13 | New conservatory/weather. Keep milk flow below tank doors. Manage rain, glass and foliage overdraw; warm practical lights must leave the action readable. |
| 14 | New pantry/night route. Openings must admit the full rotor diameter. Landing light and dust effects are proposals; readable exposure cannot depend on UI arrows. |
| 15 | New boat/winch interaction. Painting places the line near the cabin: move model attachment to the structural belly/winch socket. Bow sling, line force and boat motion must agree. Cat is story/scale, not a heavy payload. |
| 16 | New rally. Three bags retain separate hooks. Moving pegs and laundry need swept clearance envelopes and alternate approach space. The painted bank/swing is not a validated flight trajectory. |

All new-vehicle dimensions above are artist brief proposals, not measured game assets. All other generated dimensions, capacities, weights, ratings and branding are illustrative unless explicitly stated as current source configuration.

## Construction and acceptance

No triangle, material or draw-call baseline was measured in this art pass. Proposed discussion target only: start new aircraft around 15–30k visible triangles at LOD0 with 2–4 shared exterior material sets, then revise after representative cockpit/phone benchmarks. Bake small fasteners and seams; measure glass, rotor blur and shadows. The paintings are not a literal mesh-detail checklist.

1. Approve assembled in-engine front/side/rear/top, chase, cargo and cockpit blockouts. Check human-object scale and phone-sized silhouettes.
2. Run complete rotor, nacelle, winch, door, hose and latch cycles without intersections. Check moving loads under braking and banking.
3. Preserve existing-aircraft gameplay and destruction parity. Proposed vehicles and abilities need separately authorised mechanics prototypes and handling review.
4. Measure frame time, draws, transparency, shadows and memory in a representative kitchen/garden and on intended physical devices.
5. Resolve view disagreements, text, UVs and materials before calling an asset production ready.

Thimble, Swift and the greenhouse are useful first visual prototype candidates because they offer distinct silhouettes, a clear transformation or a coherent route. This is a discussion recommendation, not an implementation selection.
