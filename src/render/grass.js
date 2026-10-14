import * as THREE from 'three';
import { GARDEN } from '../sim/layout.js';

// Wind shared by the grass, leaves and border plants: an ambient breeze with travelling gusts, plus the
// rotor's outwash where a wake meets the lawn (radial wall jet from the impingement point, with a
// pressed-flat core and rings of gusts running outward). The wakes come from the sim's air field.
export const windUniforms = () => ({
  uTime: { value: 0 },
  uBreeze: { value: new THREE.Vector4(0.8, 0.6, 0.6, 0.6) }, // dir x, dir z, speed (m/s), gustiness
  uWake0: { value: new THREE.Vector4(0, 0, 0, 0.1) },         // impingement x, z, wake speed, footprint radius
  uWake1: { value: new THREE.Vector4(0, 0, 0, 0.1) },
  uHub0: { value: new THREE.Vector4() },                      // rotor hub x, y, z, induced velocity (for foliage)
  uHub1: { value: new THREE.Vector4() },
});

export const WIND_GLSL = `
  uniform float uTime; uniform vec4 uBreeze; uniform vec4 uWake0; uniform vec4 uWake1; uniform vec4 uHub0; uniform vec4 uHub1;
  float gHash12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  vec2 gHash22(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
  float gNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(gHash12(i), gHash12(i + vec2(1.0, 0.0)), u.x), mix(gHash12(i + vec2(0.0, 1.0)), gHash12(i + vec2(1.0, 1.0)), u.x), u.y); }
  // Outwash of one wake at ground point p (m/s, horizontal), and how hard the core presses down.
  vec2 gWake(vec4 wk, vec2 p, out float press){
    press = 0.0;
    if (wk.z < 0.05) return vec2(0.0);
    vec2 d = p - wk.xy; float r = length(d) + 1e-4; float R = wk.w;
    vec2 n = d / r;
    float v;
    if (r < R) { v = wk.z * (r / R); press = wk.z * (1.0 - r / R); }
    else v = wk.z * pow(R / r, 0.6) * exp(-(r - R) / (8.0 * R));
    v *= 0.78 + 0.22 * sin(r * 45.0 - uTime * 26.0);              // gust rings running outward
    float sw = sin(uTime * 7.0 + gHash12(floor(p * 40.0)) * 6.28) * 0.9 * (1.0 - smoothstep(0.0, 1.6 * R, r));
    n = mat2(cos(sw), -sin(sw), sin(sw), cos(sw)) * n;             // churning near the core
    return n * v;
  }
  vec2 gWind(vec2 p, out float press){
    vec2 bd = uBreeze.xy;
    float gust = gNoise(p * 0.55 - bd * uTime * 0.9) * 0.7 + gNoise(p * 2.1 - bd * uTime * 1.7) * 0.3;
    vec2 w = bd * uBreeze.z * (1.0 - uBreeze.w + uBreeze.w * 1.8 * gust);
    float p0, p1;
    w += gWake(uWake0, p, p0) + gWake(uWake1, p, p1);
    press = p0 + p1;
    return w;
  }
`;

// Grass: instanced blades placed on a world-locked jittered grid, so they never swim as the window
// moves. A dense layer follows the camera; a sparse layer of clumps covers the whole garden. Blades bend
// along an arc of constant length (drag ~ v^2), flutter, and get pressed flat under the rotor.
const VERT_HEAD = `
  attribute vec2 aCell;
  uniform vec4 uWin; uniform vec2 uWinN; uniform vec4 uMaskRect; uniform sampler2D uMask;
  uniform vec4 uBlade; // width, min height, max height, near layer (1) / far layer (0)
  uniform vec4 uOther; // the other layer's window (centre x, z, half size) for cross-fading
  uniform float uGroundY;
  varying vec3 vGrassCol;
  ${WIND_GLSL}
  vec3 gPos; vec3 gNrm;
  void grassBlade(){
    float n = uWinN.x, m = uWinN.y;
    float X = uWin.x + mod(aCell.x - uWin.x, n);
    float Z = uWin.y + mod(aCell.y - uWin.y, m);
    vec2 cellId = vec2(X, Z);
    vec2 h2 = gHash22(cellId);
    float h1 = gHash12(cellId + 17.3), h3 = gHash12(cellId * 1.7 + 3.1);
    vec2 root = (cellId + h2) * uWin.z;
    vec2 muv = (root - uMaskRect.xy) / uMaskRect.zw;
    vec4 mk = (muv.x < 0.0 || muv.y < 0.0 || muv.x > 1.0 || muv.y > 1.0) ? vec4(0.0) : texture2D(uMask, muv);
    // Window fades: the near layer fades out at its edge, the far layer fades out inside the near window.
    float fade = 1.0;
    vec2 c = uWin.xy + vec2(n, m) * 0.5;
    float dEdge = max(abs(X + 0.5 - c.x) / (n * 0.5), abs(Z + 0.5 - c.y) / (m * 0.5));
    if (uBlade.w > 0.5) fade = 1.0 - smoothstep(0.72, 0.98, dEdge);
    else if (uOther.z > 0.0) { float dn = max(abs(root.x - uOther.x), abs(root.y - uOther.y)) / uOther.z; fade = smoothstep(0.72, 0.98, dn); }
    float bed = mk.b;
    float flower = bed > 0.5 ? step(0.55, h3) : step(0.965, h3) * step(0.35, mk.g);
    float present = step(1.0 - mk.r, h1) * fade;
    float H = mix(uBlade.y, uBlade.z, mk.g) * (0.55 + 0.75 * h3 * h3) * present;
    H *= mix(1.0, 1.25, flower);
    float W = uBlade.x * (0.7 + 0.6 * h1) * mix(1.0, 0.75, flower) * (present > 0.0 ? 1.0 : 0.0);
    float yaw = h2.x * 6.2832 + h3 * 3.0;
    vec3 side = vec3(cos(yaw), 0.0, sin(yaw));
    // Bend: static lean + wind drag (atan of v^2: it saturates when pressed flat).
    float press;
    vec2 wv = gWind(root, press);
    float sp = length(wv);
    vec2 lean = vec2(cos(h1 * 6.2832), sin(h1 * 6.2832)) * (0.12 + 0.25 * h2.y) * mix(1.0, 0.4, flower);
    float give = (0.75 + 0.6 * mk.g) * mix(1.0, 0.7, flower);
    vec2 bend = lean + (sp > 1e-4 ? wv / sp : vec2(0.0)) * atan(sp * sp * 0.45) * 1.25 * give;
    bend += (sp > 1e-4 ? vec2(-wv.y, wv.x) / sp : vec2(0.0)) * sin(uTime * (5.0 + 5.0 * h2.y) + h1 * 6.28 + dot(root, vec2(23.0, 17.0))) * (0.03 + 0.07 * sp) * give;
    bend += normalize(lean + 1e-4) * press * 0.7;
    float theta = clamp(length(bend), 0.0, 1.5);
    vec2 D = theta > 1e-4 ? bend / theta : vec2(1.0, 0.0);
    float t = position.y;
    float phi = theta * t;
    float th = max(theta, 1e-3);
    float along = H * (1.0 - cos(phi)) / th;
    float up = H * sin(phi) / th;
    float w = W * (1.0 - pow(t, 1.4)) * (flower > 0.5 && t > 0.82 ? 2.6 : 1.0);
    gPos = vec3(root.x + D.x * along, uGroundY + up, root.y + D.y * along) + side * position.x * w;
    vec3 T = vec3(D.x * sin(phi), cos(phi), D.y * sin(phi));
    gNrm = normalize(mix(normalize(cross(side, T)), vec3(0.0, 1.0, 0.0), 0.6));
    // Colour: dark at the root, sunlit at the tip; meadow grass drier; flower heads.
    vec3 base = vec3(0.07, 0.14, 0.035);
    vec3 tip = mix(vec3(0.27, 0.46, 0.11), vec3(0.5, 0.52, 0.2), mk.g * (0.4 + 0.6 * h2.y));
    tip *= 0.8 + 0.4 * h1;
    vec3 col = mix(base, tip, smoothstep(0.0, 1.0, t));
    if (flower > 0.5 && t > 0.8) {
      float k = gHash12(cellId + 5.0);
      vec3 fc = bed > 0.5
        ? (k < 0.45 ? vec3(0.42, 0.30, 0.70) : k < 0.7 ? vec3(0.95, 0.62, 0.72) : k < 0.85 ? vec3(0.98, 0.95, 0.88) : vec3(0.98, 0.72, 0.2))
        : (k < 0.6 ? vec3(0.98, 0.97, 0.92) : k < 0.85 ? vec3(0.98, 0.82, 0.22) : vec3(0.75, 0.55, 0.85));
      col = fc;
    }
    vGrassCol = col;
  }
`;

export class Grass {
  constructor(scene, quality, mask, shadows) {
    this.scene = scene;
    this.mask = mask;
    this.uniforms = windUniforms();
    const tier = quality.name === 'ultra' ? 'high' : quality.name; // ultra builds the world as high does
    const G = GARDEN;
    // Layers per quality tier: cell size (m) and window size in cells. The far layer covers the garden.
    const near = tier === 'high' ? { cell: 0.0058, n: 340 } : tier === 'medium' ? { cell: 0.0085, n: 170 } : { cell: 0.012, n: 104 };
    const farCell = tier === 'high' ? 0.03 : tier === 'medium' ? 0.05 : 0.065;
    const far = { cell: farCell, nx: Math.ceil((G.maxX - G.minX) / farCell), nz: Math.ceil((G.maxZ - G.minZ) / farCell) };
    this.near = this.layer(near.n, near.n, near.cell, { width: 0.0026, hMin: 0.03, hMax: 0.26, near: true, segs: tier === 'low' ? 2 : 3 }, shadows);
    this.far = this.layer(far.nx, far.nz, far.cell, { width: 0.0075, hMin: 0.03, hMax: 0.24, near: false, segs: 2 }, shadows);
    // The far layer never moves: its window is the garden.
    const fu = this.far.material.userData.u;
    fu.uWin.value.set(Math.floor(G.minX / far.cell), Math.floor(G.minZ / far.cell), far.cell, 0);
    this.nearCell = near.cell;
    this.nearN = near.n;
    this.blades = near.n * near.n + far.nx * far.nz;
    this._box = new THREE.Box3();
    this._frustum = new THREE.Frustum();
    this._m = new THREE.Matrix4();
    this.gardenBox = new THREE.Box3(new THREE.Vector3(G.minX, G.groundY, G.minZ), new THREE.Vector3(G.maxX, G.groundY + 0.4, G.maxZ));
  }

  layer(nx, nz, cell, o, shadows) {
    // One blade: a tapered strip of `segs` segments ending in a point.
    const pos = [], idx = [];
    for (let s = 0; s < o.segs; s++) { const t = s / o.segs; pos.push(-0.5, t, 0, 0.5, t, 0); }
    pos.push(0, 1, 0);
    for (let s = 0; s < o.segs - 1; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const a = (o.segs - 1) * 2;
    idx.push(a, a + 1, a + 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    geo.setIndex(idx);
    const cells = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) { const k = (j * nx + i) * 2; cells[k] = i; cells[k + 1] = j; }
    geo.setAttribute('aCell', new THREE.InstancedBufferAttribute(cells, 2));
    geo.instanceCount = nx * nz;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    const u = {
      ...this.uniforms,
      uWin: { value: new THREE.Vector4(0, 0, cell, 0) },
      uWinN: { value: new THREE.Vector2(nx, nz) },
      uMask: { value: this.mask.texture },
      uMaskRect: { value: this.mask.rect },
      uBlade: { value: new THREE.Vector4(o.width, o.hMin, o.hMax, o.near ? 1 : 0) },
      uOther: { value: new THREE.Vector4(0, 0, 0, 0) },
      uGroundY: { value: GARDEN.groundY },
    };
    mat.userData.u = u;
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>\n${VERT_HEAD}`)
        .replace('#include <beginnormal_vertex>', 'grassBlade();\nvec3 objectNormal = gNrm;')
        .replace('#include <begin_vertex>', 'vec3 transformed = gPos;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vGrassCol;')
        .replace('#include <color_fragment>', 'diffuseColor.rgb *= vGrassCol;');
    };
    mat.customProgramCacheKey = () => `grass-${o.near ? 'n' : 'f'}`;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.receiveShadow = !!shadows;
    mesh.castShadow = false;
    mesh.userData.noAO = true;
    mesh.renderOrder = -1;
    this.scene.add(mesh);
    return mesh;
  }

  // centre: where the dense layer should be (around the camera and what it looks at).
  update(centre, camera) {
    const n = this.nearN, c = this.nearCell;
    const nu = this.near.material.userData.u;
    const bx = Math.floor(centre.x / c) - n / 2, bz = Math.floor(centre.z / c) - n / 2;
    nu.uWin.value.set(bx, bz, c, 0);
    const half = n * c / 2;
    const cx = (bx + n / 2) * c, cz = (bz + n / 2) * c;
    this.far.material.userData.u.uOther.value.set(cx, cz, half, 0);
    // Cull either layer when the camera can't see it.
    this._m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._frustum.setFromProjectionMatrix(this._m);
    this._box.min.set(cx - half, GARDEN.groundY, cz - half);
    this._box.max.set(cx + half, GARDEN.groundY + 0.4, cz + half);
    const overlaps = this._box.intersectsBox(this.gardenBox);
    this.near.visible = overlaps && this._frustum.intersectsBox(this._box);
    this.far.visible = this._frustum.intersectsBox(this.gardenBox);
    if (!overlaps) this.far.material.userData.u.uOther.value.z = 0;
  }
}
