// Shader warm-up in small steps, for phones.
//
// renderer.compile(scene) asks the driver to build every program in the scene at once (well over a hundred
// here). A desktop GPU does that in about a second; a phone's shader compiler takes many times longer and
// holds the memory for all of them at the same time, and one long stall in Chrome's GPU process is what
// gets the tab's graphics reset or the tab killed. Here the materials are compiled a batch at a time, each
// batch is linked before the next starts, and the page stays responsive in between.
//
// The lights still come from the real scene (compile's targetScene), so each program is the exact variant
// the first frame draws (light counts and shadows are part of a program's key).

const SLICE_MS = 50;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export async function warmInSteps(renderer, root, camera, lightScene, { batch = 32, onStep } = {}) {
  // With parallel shader compile the driver builds a batch on its own threads and we poll for it;
  // without it, a program finishes linking when first used, so getUniforms() below waits for each.
  const parallel = renderer.extensions.has('KHR_parallel_shader_compile');
  const gl = renderer.getContext();
  // Group the drawable objects by material; a batch of materials brings around ten new programs.
  const groups = new Map();
  root.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!groups.has(m)) groups.set(m, []);
      groups.get(m).push(o);
    }
  });
  const list = [...groups.values()];
  let slice = performance.now();
  for (let i = 0; i < list.length; i += batch) {
    // Every object of each material: instancing, vertex colours and the like also pick the program variant.
    const objs = list.slice(i, i + batch).flat();
    // A stand-in "scene" holding just this batch: compile() reads its materials through traverse() and its
    // lights through traverseVisible() (none here; they come from lightScene).
    const part = { traverse: (fn) => objs.forEach(fn), traverseVisible: () => {} };
    const mats = renderer.compile(part, camera, lightScene);
    const programs = [...new Set([...mats].map((m) => renderer.properties.get(m).currentProgram).filter(Boolean))];
    // flush() hands the batch to the GPU process now, so its status can come back sooner.
    if (parallel) { gl.flush(); while (programs.some((p) => !p.isReady())) { await wait(4); slice = performance.now(); } }
    for (const p of programs) p.getUniforms();
    if (onStep) onStep(Math.min(1, (i + batch) / list.length));
    if (performance.now() - slice > SLICE_MS) { await wait(0); slice = performance.now(); }
  }
}
