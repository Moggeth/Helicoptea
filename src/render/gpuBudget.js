// Rough GPU memory held after load: textures, render targets, shadow maps and the screen itself. Logged at
// start-up and checked by tests/e2e-phone-memory.mjs, so a change that makes phones carry much more (bigger
// textures, another full-screen target, every cockpit built at once) shows up before it ships.
//
// Phones share their memory with the CPU and Chrome gives a tab's graphics only part of it; past a few
// hundred MB the tab is the first thing Android reclaims. The budget leaves room for the browser itself.
export const PHONE_GPU_BUDGET_MB = 160;

const BYTES = { 1009: 1, 1010: 2, 1015: 4, 1016: 2, 1026: 2 }; // three type -> bytes per channel (rough)

function textureBytes(t) {
  const img = t.image;
  if (!img) return 0;
  const w = img.width || img.videoWidth || 0, h = img.height || img.videoHeight || 0, d = img.depth || 1;
  const channels = t.format === 1028 /* Red */ ? 1 : t.format === 1030 /* RG */ ? 2 : 4;
  const mips = t.generateMipmaps && t.minFilter !== 1003 && t.minFilter !== 1006 ? 4 / 3 : 1;
  return w * h * d * channels * (BYTES[t.type] || 1) * mips * (t.isCubeTexture ? 6 : 1);
}

function targetBytes(rt) {
  if (!rt) return 0;
  const color = rt.width * rt.height * 4 * (BYTES[rt.texture.type] || 1);
  const depth = rt.depthBuffer ? rt.width * rt.height * 4 : 0;
  // A multisampled target keeps a resolved copy beside its samples.
  return rt.samples > 0 ? (color + depth) * rt.samples + color : color + depth;
}

export function gpuEstimate(renderer, scenes, targets = []) {
  const seen = new Set();
  let tex = 0, shadow = 0;
  const addTex = (t) => { if (t && t.isTexture && !t.isRenderTargetTexture && !seen.has(t)) { seen.add(t); tex += textureBytes(t); } };
  for (const s of scenes) {
    if (!s) continue;
    addTex(s.environment); addTex(s.background);
    s.traverse((o) => {
      if (o.isLight && o.castShadow && o.shadow) shadow += o.shadow.map ? targetBytes(o.shadow.map) : o.shadow.mapSize.x * o.shadow.mapSize.y * 4;
      const mats = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
      for (const m of mats) for (const k in m) { const v = m[k]; if (v && v.isTexture) addTex(v); }
      if (o.material?.uniforms) for (const u of Object.values(o.material.uniforms)) addTex(u.value);
    });
  }
  let rts = 0;
  for (const rt of targets) rts += targetBytes(rt);
  const gl = renderer.getContext();
  const attrs = gl.getContextAttributes() || {};
  const screen = gl.drawingBufferWidth * gl.drawingBufferHeight * (4 + 4) * (attrs.antialias ? 4 : 1);
  const MB = (b) => Math.round(b / 1048576);
  const total = tex + shadow + rts + screen;
  return {
    totalMB: MB(total), texturesMB: MB(tex), shadowsMB: MB(shadow), targetsMB: MB(rts), screenMB: MB(screen),
    textures: seen.size, programs: renderer.info.programs?.length || 0, geometries: renderer.info.memory.geometries,
    budgetMB: PHONE_GPU_BUDGET_MB, overBudget: MB(total) > PHONE_GPU_BUDGET_MB,
  };
}
