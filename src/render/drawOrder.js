// Opaque draw order grouped by shader program.
//
// three.js sorts opaque draws by material id, which interleaves programs: on the phone renderer about 150 of
// a frame's 230 draws switched program, and every switch re-sends the camera matrices and the lights before
// the material's own uniforms. Opaque draws that write and test depth can go in any order (the depth test
// decides what shows), so those that share a program go together here, and within a material they stay
// front to back as before. Opaque ones that don't write or test depth come after them, in three.js's order
// (an overlay on a surface is drawn after the surface). Transparent draws keep three.js's back-to-front order.
export function sortOpaqueByProgram(renderer) {
  const props = renderer.properties, info = renderer.info.render;
  // The program each material last drew with (0 for an overlay), looked up once per render() rather than in
  // every comparison.
  const key = (m) => {
    if (m.__drawOrderFrame !== info.frame) {
      m.__drawOrderFrame = info.frame;
      const p = props.get(m).currentProgram;
      m.__drawOrderKey = !m.depthWrite || !m.depthTest ? 0 : p ? p.id + 1 : 1;
    }
    return m.__drawOrderKey;
  };
  renderer.setOpaqueSort((a, b) => {
    if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
    if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
    if (a.material !== b.material) {
      const ka = key(a.material), kb = key(b.material);
      if (ka !== kb) return ka === 0 ? 1 : kb === 0 ? -1 : ka - kb;
      return a.material.id - b.material.id;
    }
    if (a.z !== b.z) return a.z - b.z;
    return a.id - b.id;
  });
}
