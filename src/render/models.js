import * as THREE from 'three';
import { HELI_PARTS } from '../sim/helicopter.js';
import { CFG } from '../config.js';
import * as TX from './textures.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

export function makeMaterials(quality) {
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xd8462f, roughness: 0.32, metalness: 0.0, clearcoat: 1, clearcoatRoughness: 0.12 });
  const decal = new THREE.MeshPhysicalMaterial({ map: TX.heliDecalTexture(), roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.12 });
  const canopy = new THREE.MeshPhysicalMaterial({ color: 0x1c2a36, roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x23242a, roughness: 0.55, metalness: 0.3 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xc9ccd2, roughness: 0.25, metalness: 0.95 });
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a548, roughness: 0.3, metalness: 1.0 });
  const blade = new THREE.MeshStandardMaterial({ color: 0x2c2d33, roughness: 0.45, metalness: 0.1 });
  const bladeTip = new THREE.MeshStandardMaterial({ color: 0xf4c430, roughness: 0.4 });
  const cream = new THREE.MeshPhysicalMaterial({ color: 0xf2ece0, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.15 });
  return { paint, decal, canopy, dark, metal, brass, blade, bladeTip, cream, quality };
}

// ---------------------------------------------------------------- helicopter
// Built from the same named parts as the physics so a crash can hand each part to a debris body.
export function buildHelicopter(M) {
  const root = new THREE.Group();
  root.name = 'heli';
  const parts = {};
  for (const p of HELI_PARTS) {
    const g = new THREE.Group();
    g.position.set(p.pos[0], p.pos[1], p.pos[2]);
    g.name = p.name;
    parts[p.name] = g;
  }
  const add = (part, mesh, x = 0, y = 0, z = 0) => {
    const P = HELI_PARTS.find((q) => q.name === part);
    mesh.position.set(x - P.pos[0], y - P.pos[1], z - P.pos[2]);
    mesh.castShadow = true;
    parts[part].add(mesh);
    return mesh;
  };

  // Fuselage: teardrop pod, smoked canopy, decal band, nav lights, cargo hook.
  {
    const pts = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.35 * t) * 0.021;
      pts.push(V2(Math.max(r, 0.0005), -0.04 + t * 0.085));
    }
    const pod = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), M.decal);
    pod.rotation.x = -Math.PI / 2;
    pod.scale.set(0.85, 1, 1.0);
    add('fuselage', pod, 0, 0.0, -0.004);
    const can = new THREE.Mesh(new THREE.SphereGeometry(0.0165, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), M.canopy);
    can.scale.set(0.95, 0.85, 1.45);
    can.rotation.x = -0.55;
    add('fuselage', can, 0, 0.006, -0.02);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.008, 0.02), M.dark);
    add('fuselage', intake, 0, 0.02, 0.006);
    const hook = new THREE.Mesh(new THREE.TorusGeometry(0.0035, 0.0009, 8, 16), M.brass);
    hook.rotation.y = Math.PI / 2;
    add('fuselage', hook, 0, CFG.heli.hookOffset[1] + 0.003, CFG.heli.hookOffset[2]);
    const hookPost = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.022, 6), M.metal);
    add('fuselage', hookPost, 0, CFG.heli.hookOffset[1] + 0.017, 0);
    const navMat = (c) => new THREE.MeshBasicMaterial({ color: c });
    add('fuselage', new THREE.Mesh(new THREE.SphereGeometry(0.0018, 8, 6), navMat(0xff3b2f)), -0.017, 0.0, 0.004);
    add('fuselage', new THREE.Mesh(new THREE.SphereGeometry(0.0018, 8, 6), navMat(0x3bff6a)), 0.017, 0.0, 0.004);
  }
  // Tail boom.
  {
    const boom = new THREE.Mesh(new THREE.CylinderGeometry(0.0026, 0.0042, 0.1, 10), M.paint);
    boom.rotation.x = Math.PI / 2;
    add('tailBoom', boom, 0, 0.008, 0.078);
  }
  // Tail: fin, stabiliser and tail rotor.
  const tailRotor = new THREE.Group();
  {
    const finShape = new THREE.Shape();
    finShape.moveTo(-0.01, 0); finShape.lineTo(0.014, 0.0); finShape.lineTo(0.012, 0.036); finShape.lineTo(0.002, 0.034); finShape.closePath();
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(finShape, { depth: 0.0016, bevelEnabled: false }), M.paint);
    fin.rotation.y = -Math.PI / 2;
    add('tail', fin, 0.0008, 0.004, 0.122);
    const stab = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.0012, 0.01), M.paint);
    add('tail', stab, 0, 0.01, 0.112);
    tailRotor.position.set(0.004, 0.032, 0.132);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.004, 8), M.metal);
    hub.rotation.z = Math.PI / 2;
    tailRotor.add(hub);
    for (const s of [1, -1]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.017, 0.0028), M.blade);
      b.position.y = 0.0085 * s;
      tailRotor.add(b);
    }
    const blurT = new THREE.Mesh(new THREE.CircleGeometry(0.0175, 24), new THREE.MeshBasicMaterial({ color: 0x8890a0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    blurT.rotation.y = Math.PI / 2;
    tailRotor.add(blurT);
    tailRotor.userData.blur = blurT;
    const P = HELI_PARTS.find((q) => q.name === 'tail');
    tailRotor.position.sub(new THREE.Vector3(...P.pos));
    parts.tail.add(tailRotor);
  }
  // Skids with struts.
  for (const side of ['skidL', 'skidR']) {
    const sx = side === 'skidL' ? -0.025 : 0.025;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.0016, 0.0016, 0.088, 8), M.dark);
    tube.rotation.x = Math.PI / 2;
    add(side, tube, sx, -0.0445, -0.004);
    for (const tz of [0.039, -0.008, -0.05]) {
      if (tz === -0.008) continue;
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0016, 8, 6), M.dark);
      add(side, tip, sx, -0.0445, tz + (tz < 0 ? 0.004 : 0.004));
    }
    for (const tz of [-0.026, 0.018]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.0011, 0.0011, 0.034, 6), M.dark);
      strut.position.set(0, 0, 0);
      strut.rotation.z = sx < 0 ? -0.42 : 0.42;
      add(side, strut, sx * 0.72, -0.03, tz);
    }
  }
  // Mast, hub, flybar.
  const rotor = new THREE.Group();
  {
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.0013, 0.0013, 0.024, 8), M.metal);
    add('mast', mast, 0, 0.032, 0);
    const P = HELI_PARTS.find((q) => q.name === 'mast');
    rotor.position.set(0, 0.043 - P.pos[1], 0);
    parts.mast.add(rotor);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 12), M.metal);
    hub.castShadow = true;
    rotor.add(hub);
    const flybar = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.07, 6), M.metal);
    flybar.rotation.x = Math.PI / 2;
    flybar.position.y = 0.004;
    rotor.add(flybar);
    for (const s of [1, -1]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.0024, 10, 8), M.dark);
      w.position.set(0, 0.004, 0.035 * s);
      rotor.add(w);
    }
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.006, CFG.heli.rotorRadius, 64, 1), new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { uOpacity: { value: 0.0 } },
      vertexShader: 'varying vec2 vUv; varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: `uniform float uOpacity; varying vec3 vP;
        void main(){ float r = length(vP.xy)/${CFG.heli.rotorRadius.toFixed(3)};
          float a = 0.07 + 0.10*smoothstep(0.8,0.99,r) - 0.04*smoothstep(0.0,0.4,r);
          float tip = smoothstep(0.92,0.965,r)*smoothstep(1.0,0.97,r);
          vec3 col = mix(vec3(0.16,0.17,0.2), vec3(0.95,0.78,0.2), tip);
          gl_FragColor = vec4(col, (a + tip*0.22)*uOpacity); }`,
    }));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0008;
    rotor.add(disc);
    rotor.userData.disc = disc;
  }
  // Blades: tapered, yellow tips, plus two faint ghost copies for motion blur.
  const bladeGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0.006, -0.0055); s.lineTo(0.1, -0.004); s.quadraticCurveTo(0.102, 0, 0.1, 0.004); s.lineTo(0.006, 0.0055); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.0011, bevelEnabled: false, curveSegments: 4 });
    g.rotateX(Math.PI / 2);
    g.translate(0, 0.0006, 0);
    return g;
  })();
  const tipGeo = new THREE.BoxGeometry(0.012, 0.0013, 0.0082);
  const blades = [];
  for (const name of ['bladeA', 'bladeB']) {
    const P = HELI_PARTS.find((q) => q.name === name);
    const g = parts[name];
    const b = new THREE.Mesh(bladeGeo, M.blade);
    b.castShadow = true;
    const t = new THREE.Mesh(tipGeo, M.bladeTip);
    t.position.set(0.094, 0.0006, 0);
    t.castShadow = true;
    const inner = new THREE.Group();
    inner.add(b, t);
    inner.position.set(-0.05 * P.blade, 0, 0); // part origin is at blade mid-span
    if (P.blade < 0) { inner.rotation.y = Math.PI; inner.position.set(0.05, 0, 0); }
    g.add(inner);
    blades.push(g);
  }
  // Blades ride in the rotor group while flying; the parts stay registered for debris.
  const bladeHolder = new THREE.Group();
  parts.bladeA.position.set(0.05, 0, 0);
  parts.bladeB.position.set(-0.05, 0, 0);
  bladeHolder.add(parts.bladeA, parts.bladeB);
  rotor.add(bladeHolder);
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0x2c2d33, transparent: true, opacity: 0.16, depthWrite: false });
  const ghosts = [];
  for (let k = 1; k <= 3; k++) {
    const gh = new THREE.Group();
    for (const s of [0, Math.PI]) {
      const m = new THREE.Mesh(bladeGeo, ghostMat);
      m.rotation.y = s;
      gh.add(m);
    }
    gh.userData.offset = -k * 0.22;
    rotor.add(gh);
    ghosts.push(gh);
  }

  for (const p of HELI_PARTS) if (!p.blade) root.add(parts[p.name]);
  root.userData = { parts, rotor, bladeHolder, ghosts, tailRotor };
  root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  return root;
}

// Clone of one heli part for a debris body (centred on the part origin).
export function cloneHeliPart(heliModel, name) {
  const src = heliModel.userData.parts[name];
  const g = new THREE.Group();
  for (const child of src.children) {
    if (child === heliModel.userData.rotor) continue;
    const c = child.clone(true);
    g.add(c);
  }
  if (name === 'mast') {
    // keep the hub/flybar with the mast, without the blades or blur
    const rotor = heliModel.userData.rotor;
    const hub = rotor.children[0].clone();
    hub.position.copy(rotor.position);
    g.add(hub);
  }
  // Scorched: darker paint and a brief ember glow that cools (animated by the view).
  const embers = [];
  const scorch = (src) => {
    if (!src || src.visible === false) return src;
    const m = src.clone();
    if (m.color) m.color.multiplyScalar(0.55);
    if ('emissive' in m && !m.isShaderMaterial) { m.emissive = new THREE.Color(0x8a2400); m.emissiveIntensity = 0.0; embers.push(m); }
    return m;
  };
  g.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true;
    const isGlass = Array.isArray(o.material) ? o.material.some((m) => m.transparent) : o.material.transparent;
    if (isGlass && !Array.isArray(o.material)) { o.visible = false; return; }
    o.material = Array.isArray(o.material) ? o.material.map(scorch) : scorch(o.material);
  });
  g.userData.embers = embers;
  return g;
}

// ---------------------------------------------------------------- tea bag + tag
export function teabagAssets() {
  const paperTex = TX.teabagTexture();
  const tagTex = TX.tagTexture();
  const h = CFG.cargo.bagHalf;
  const geo = new THREE.BoxGeometry(h[0] * 2, h[1] * 2, h[2] * 2, 10, 12, 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) / h[0], y = pos.getY(i) / h[1], z = pos.getZ(i);
    const crimp = Math.abs(y) > 0.8 ? 0.15 : 1;
    const bulge = (1 - Math.pow(Math.abs(x), 3)) * (1 - Math.pow(Math.abs(y), 4)) * crimp;
    pos.setZ(i, z * (0.25 + 0.75 * bulge));
  }
  geo.computeVertexNormals();
  const tagGeo = new THREE.PlaneGeometry(0.016, 0.02);
  tagGeo.translate(0, -0.012, 0);
  const tagMat = new THREE.MeshStandardMaterial({ map: tagTex, roughness: 0.85, side: THREE.DoubleSide });
  const loopGeo = new THREE.TorusGeometry(0.0028, 0.0005, 6, 14);
  const stapleGeo = new THREE.BoxGeometry(0.006, 0.0012, 0.0004);
  const knotGeo = new THREE.SphereGeometry(0.0016, 10, 8);
  const knotMat = new THREE.MeshStandardMaterial({ color: 0xeee6d4, roughness: 0.85 });
  const staple = new THREE.MeshStandardMaterial({ color: 0xbfc3c8, metalness: 1, roughness: 0.3 });
  return {
    makeBag() {
      const mat = new THREE.MeshPhysicalMaterial({ map: paperTex, roughness: 0.92, sheen: 0.6, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.8 });
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true; m.receiveShadow = true;
      const st = new THREE.Mesh(stapleGeo, staple);
      st.position.set(0, h[1] - 0.004, h[2] * 0.4);
      m.add(st);
      // Knot where the string is stitched to the bag, so the join reads as tied on.
      const knot = new THREE.Mesh(knotGeo, knotMat);
      knot.position.set(0, h[1] + 0.0004, 0);
      knot.scale.set(1, 0.8, 0.7);
      knot.castShadow = true;
      m.add(knot);
      const g = new THREE.Group();
      g.add(m);
      g.userData.mat = mat;
      return g;
    },
    makeTag() {
      const g = new THREE.Group();
      const t = new THREE.Mesh(tagGeo, tagMat);
      t.castShadow = true;
      const l = new THREE.Mesh(loopGeo, staple);
      l.position.y = 0.001;
      g.add(t, l);
      g.userData.loop = l;
      return g;
    },
  };
}

// ---------------------------------------------------------------- ceramics
export function glazeMaterial(color, opts = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: opts.roughness ?? 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, sheen: 0, ...opts.extra });
}

// Lathe profile for a hollow vessel: outer wall up, rounded rim, inner wall down, inner floor.
export function vesselGeometry({ rOutBottom, rOut, rIn, rInBottom, height, bottom, foot = 0.004, segments = 64, belly = 0 }) {
  const p = [];
  p.push(V2(0.0001, 0));
  p.push(V2(rOutBottom - foot, 0));
  p.push(V2(rOutBottom, foot * 0.6));
  const n = 14;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const r = rOutBottom + (rOut - rOutBottom) * Math.pow(t, 0.8) + Math.sin(t * Math.PI) * belly;
    p.push(V2(r, foot + (height - foot) * t * 0.985));
  }
  const rimR = (rOut - rIn) / 2, rimC = (rOut + rIn) / 2;
  for (let i = 0; i <= 6; i++) {
    const a = (i / 6) * Math.PI;
    p.push(V2(rimC + Math.cos(a) * rimR, height - rimR + Math.sin(a) * rimR));
  }
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const r = rIn + (rInBottom - rIn) * Math.pow(t, 1.4) + Math.sin((1 - t) * Math.PI) * belly;
    p.push(V2(r, height - rimR - (height - rimR - bottom) * t));
  }
  p.push(V2(rInBottom * 0.7, bottom));
  p.push(V2(0.0001, bottom));
  return new THREE.LatheGeometry(p, segments);
}

export function handleGeometry(radius, tube, arc = Math.PI * 1.25) {
  const g = new THREE.TorusGeometry(radius, tube, 12, 28, arc);
  g.rotateZ(-arc / 2);
  return g;
}

export function cupModel(C) {
  const g = new THREE.Group();
  const glaze = glazeMaterial(C.glaze);
  const isTeacup = C.id === 'teacup';
  const geo = vesselGeometry({
    rOutBottom: isTeacup ? C.rOut * 0.82 : C.rOut * 0.97, rOut: C.rOut,
    rIn: C.rIn, rInBottom: isTeacup ? C.rIn * 0.86 : C.rIn * 0.97,
    height: C.height, bottom: C.bottom, belly: isTeacup ? 0.002 : 0,
  });
  const body = new THREE.Mesh(geo, glaze);
  body.castShadow = true; body.receiveShadow = true;
  g.add(body);
  // rim band
  const band = new THREE.Mesh(new THREE.TorusGeometry((C.rOut + C.rIn) / 2, (C.rOut - C.rIn) / 2 + 0.0004, 8, 64), glazeMaterial(C.rim));
  band.rotation.x = Math.PI / 2;
  band.position.y = C.height - (C.rOut - C.rIn) / 2;
  g.add(band);
  if (isTeacup) {
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(C.rOut * 0.985 + 0.0003, C.rOut * 0.96 + 0.0003, 0.004, 64, 1, true), glazeMaterial(C.rim));
    stripe.position.y = C.height * 0.78;
    g.add(stripe);
  }
  const hr = C.height * 0.3;
  const handle = new THREE.Mesh(handleGeometry(hr, isTeacup ? 0.0042 : 0.0055), glaze);
  handle.position.set(C.rOut - 0.002, C.height * 0.52, 0);
  handle.castShadow = true;
  const hg = new THREE.Group();
  hg.add(handle);
  hg.rotation.y = C.handleYaw;
  g.add(hg);
  if (C.saucer) {
    const sg = saucerGeometry(C.saucer, 0.008);
    const s = new THREE.Mesh(sg, glazeMaterial(0xf2ece0));
    s.position.y = -C.baseY;
    s.receiveShadow = true; s.castShadow = true;
    g.add(s);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(C.saucer - 0.006, 0.0012, 6, 64), glazeMaterial(C.rim));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -C.baseY + 0.0075;
    g.add(ring);
  }
  g.position.set(C.x, C.baseY, C.z);
  return g;
}

export function saucerGeometry(radius, height) {
  const p = [V2(0.0001, 0), V2(radius * 0.55, 0), V2(radius * 0.62, height * 0.4), V2(radius * 0.9, height * 0.75), V2(radius, height),
    V2(radius - 0.003, height + 0.0012), V2(radius * 0.85, height * 0.95), V2(radius * 0.55, height * 0.55), V2(0.0001, height * 0.55)];
  return new THREE.LatheGeometry(p, 64);
}

export { TX };
