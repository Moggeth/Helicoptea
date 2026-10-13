import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { SKYCRANE_PARTS } from '../sim/skycrane.js';
import { CFG } from '../config.js';

// A scale-model S-64-style skycrane tanker, built procedurally: a bulbous glazed cockpit pod with a dark
// green stripe edged in white, a narrow crane spine, twin exposed turbines with chrome intakes behind an
// exposed six-blade head, a long thin boom rising to a high tail pylon with a four-blade tail rotor on the
// left (red and white tips) and a small green stabiliser, long-legged wheeled gear, and a boxy orange belly
// tank with big green numerals, belly doors and a white rail beneath. Original markings only. Parts are
// grouped by SKYCRANE_PARTS so a crash hands each piece to its own debris body.

const P = Object.fromEntries(SKYCRANE_PARTS.map((p) => [p.name, p]));
const C = CFG.skycrane;
const R = C.rotorRadius;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- textures
function paintTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ec6a1c'; g.fillRect(0, 0, 512, 256);
  // gentle sheen variation and grime along the bottom
  for (let i = 0; i < 1600; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '60,20,0'},${Math.random() * 0.035})`; g.fillRect(Math.random() * 512, Math.random() * 256, 3, 2); }
  g.strokeStyle = 'rgba(90,30,5,0.45)'; g.lineWidth = 1.2;
  for (let x = 40; x < 512; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  for (let y = 60; y < 256; y += 90) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  g.fillStyle = 'rgba(80,30,5,0.5)';
  for (let x = 40; x < 512; x += 64) for (let y = 6; y < 256; y += 10) g.fillRect(x - 3, y, 1.5, 1.5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// Tank side: orange with big green numerals and a small stencil. Original markings.
function tankTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#ec6a1c'; g.fillRect(0, 0, 512, 192);
  for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(60,20,0,${Math.random() * 0.04})`; g.fillRect(Math.random() * 512, Math.random() * 192, 3, 2); }
  g.fillStyle = '#1d6a3a';
  g.font = 'bold 132px "Arial Black", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('07', 256, 92);
  g.fillStyle = '#f4efe4'; g.font = 'bold 20px Arial, sans-serif';
  g.fillText('MILK TANKER', 256, 172);
  g.strokeStyle = 'rgba(90,30,5,0.5)'; g.lineWidth = 2;
  g.strokeRect(14, 12, 484, 168);
  g.fillStyle = '#1d6a3a'; g.fillRect(0, 0, 512, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function hoseTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#d8c7a0'; g.fillRect(0, 0, 64, 256);
  for (let y = 0; y < 256; y += 8) { g.fillStyle = 'rgba(90,70,40,0.35)'; g.fillRect(0, y, 64, 2); g.fillStyle = 'rgba(255,250,235,0.25)'; g.fillRect(0, y + 3, 64, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function skycraneMaterials() {
  return {
    paint: new THREE.MeshPhysicalMaterial({ map: paintTexture(), roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    tankSide: new THREE.MeshPhysicalMaterial({ map: tankTexture(), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    orange: new THREE.MeshPhysicalMaterial({ color: 0xec6a1c, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    green: new THREE.MeshPhysicalMaterial({ color: 0x1d6a3a, roughness: 0.4, clearcoat: 0.5 }),
    white: new THREE.MeshPhysicalMaterial({ color: 0xf2efe8, roughness: 0.4, clearcoat: 0.4 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9cc3d4, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.32, envMapIntensity: 1.6, clearcoat: 1, side: THREE.DoubleSide, depthWrite: false }),
    frame: new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.6 }),
    interior: new THREE.MeshStandardMaterial({ color: 0x2c2d2e, roughness: 0.9 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x3b4a5a, roughness: 0.8 }),
    helmet: new THREE.MeshPhysicalMaterial({ color: 0xe8e4da, roughness: 0.35, clearcoat: 0.8 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 1, roughness: 0.12 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2c2e30, roughness: 0.45, metalness: 0.75 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xc0c4c8, roughness: 0.3, metalness: 0.95 }),
    hubMetal: new THREE.MeshStandardMaterial({ color: 0x55595c, roughness: 0.4, metalness: 0.8 }),
    exhaust: new THREE.MeshStandardMaterial({ color: 0x3d322c, roughness: 0.5, metalness: 0.85, emissive: 0x1a0600, emissiveIntensity: 0.5 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 0.55, metalness: 0.15 }),
    bladeTipRed: new THREE.MeshStandardMaterial({ color: 0xc8241c, roughness: 0.5 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 }),
    hose: new THREE.MeshStandardMaterial({ map: hoseTexture(), roughness: 0.75 }),
    nozzle: new THREE.MeshPhysicalMaterial({ color: 0xc8241c, roughness: 0.4, clearcoat: 0.6 }),
    strainer: new THREE.MeshStandardMaterial({ color: 0x8d9296, roughness: 0.45, metalness: 0.7 }),
    navRed: new THREE.MeshBasicMaterial({ color: 0xff2a1a }),
    navGreen: new THREE.MeshBasicMaterial({ color: 0x2aff6a }),
    beacon: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a0a, emissiveIntensity: 0 }),
  };
}

function discMaterial(radius) {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uOpacity: { value: 0.0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
    fragmentShader: `uniform float uOpacity; varying vec3 vP;
      void main(){ float r = length(vP.xy)/${radius.toFixed(4)};
        float a = 0.07 + 0.1*smoothstep(0.75,0.99,r) - 0.04*smoothstep(0.0,0.4,r);
        float tip = smoothstep(0.93,0.97,r)*smoothstep(1.0,0.975,r);
        vec3 col = mix(vec3(0.14,0.15,0.16), vec3(0.6,0.62,0.6), tip);
        gl_FragColor = vec4(col, (a + tip*0.12)*uOpacity); }`,
  });
}

// A tube between two points (struts, rails, braces).
function rod(a, b, r0, r1 = r0, seg = 8) {
  const d = b.clone().sub(a);
  const g = new THREE.CylinderGeometry(r1, r0, d.length(), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}

// ---------------------------------------------------------------- build
export function buildSkycrane(M = skycraneMaterials()) {
  const root = new THREE.Group();
  root.name = 'skycrane';
  const parts = {};
  for (const p of SKYCRANE_PARTS) {
    const g = new THREE.Group();
    g.position.set(...p.pos);
    g.name = p.name;
    parts[p.name] = g;
  }
  // add(part, mesh) with the mesh built in body coordinates.
  // add(part, geometry, material, x, y, z) or add(part, object3D, x, y, z)
  const add = (part, geo, mat, x = 0, y = 0, z = 0) => {
    if (geo.isObject3D && typeof mat !== 'object') { z = y; y = x; x = mat ?? 0; }
    const m = geo.isObject3D ? geo : new THREE.Mesh(geo, mat);
    const q = P[part].pos;
    m.position.x += x - q[0]; m.position.y += y - q[1]; m.position.z += z - q[2];
    parts[part].add(m);
    return m;
  };
  const cyl = (r0, r1, h, seg = 16) => new THREE.CylinderGeometry(r0, r1, h, seg);

  // --- Cockpit pod: glass bubble over an orange tub, the green stripe edged in white around the nose.
  {
    const cz = -0.068, cy = 0.004;
    const glass = new THREE.SphereGeometry(1, 40, 24, 0, Math.PI * 2, 0, Math.PI * 0.62);
    glass.scale(0.0128, 0.0148, 0.0185);
    add('cockpit', glass, M.glass, 0, cy, cz);
    const tub = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, Math.PI * 0.52, Math.PI * 0.48);
    tub.scale(0.0132, 0.0152, 0.019);
    add('cockpit', tub, M.paint, 0, cy, cz);
    // Stripe: a band of the ellipsoid just below the glazing (white, green, white).
    const band = (t0, t1, mat, s = 1.012) => {
      const b = new THREE.SphereGeometry(1, 48, 4, Math.PI * 0.08, Math.PI * 1.84, Math.PI * t0, Math.PI * (t1 - t0));
      b.scale(0.0132 * s, 0.0152 * s, 0.019 * s);
      b.rotateY(Math.PI);
      add('cockpit', b, mat, 0, cy, cz);
    };
    band(0.585, 0.6, M.white);
    band(0.6, 0.665, M.green);
    band(0.665, 0.68, M.white);
    // Window frames: a few dark ribs over the glass.
    for (const a of [-0.55, 0, 0.55]) {
      // a meridian arc over the top, from the nose glazing back over the roof
      const rib = new THREE.TorusGeometry(1, 0.035, 5, 32, Math.PI);
      rib.rotateY(Math.PI / 2 + a);
      rib.scale(0.0129, 0.0149, 0.0186);
      add('cockpit', rib, M.frame, 0, cy, cz);
    }
    const sill = new THREE.TorusGeometry(1, 0.03, 5, 48);
    sill.rotateX(Math.PI / 2);
    sill.scale(0.0118, 0.0118, 0.0172);
    add('cockpit', sill, M.frame, 0, cy - 0.0055, cz);
    // Crew: two seats side by side, helmets visible through the glass.
    for (const sx of [-0.0048, 0.0048]) {
      add('cockpit', new RoundedBoxGeometry(0.0055, 0.008, 0.005, 2, 0.001), M.interior, sx, cy - 0.001, cz + 0.006);
      add('cockpit', new RoundedBoxGeometry(0.0048, 0.006, 0.004, 2, 0.0012), M.suit, sx, cy + 0.003, cz + 0.002);
      add('cockpit', new THREE.SphereGeometry(0.0024, 14, 10), M.helmet, sx, cy + 0.0078, cz + 0.0015);
    }
    add('cockpit', new RoundedBoxGeometry(0.018, 0.0035, 0.004, 2, 0.001), M.interior, 0, cy - 0.002, cz - 0.012);
    // Nose step and pitot.
    add('cockpit', rod(V3(0, cy - 0.006, cz - 0.0185), V3(0, cy - 0.006, cz - 0.0235), 0.0004), M.alu);
  }

  // --- Spine: the narrow crane fuselage, with a dorsal fairing and the belly beam the tank hangs from.
  {
    const spine = new RoundedBoxGeometry(0.016, 0.0145, 0.1, 3, 0.0035);
    add('spine', spine, M.paint, 0, 0.013, -0.006);
    // transition into the cockpit pod
    const neck = cyl(0.0085, 0.0118, 0.012, 20); neck.rotateX(Math.PI / 2);
    add('spine', neck, M.paint, 0, 0.009, -0.054);
    // belly keel and tank hangers
    add('spine', new RoundedBoxGeometry(0.009, 0.004, 0.084, 2, 0.0012), M.orange, 0, 0.0045, -0.004);
    for (const z of [-0.026, 0.02]) for (const sx of [-1, 1]) add('spine', rod(V3(sx * 0.004, 0.004, z), V3(sx * 0.012, -0.005, z), 0.0008), M.darkMetal);
    // side windows of the aft-facing station, and a step
    for (const sx of [-1, 1]) add('spine', new THREE.BoxGeometry(0.0006, 0.004, 0.008), M.glass, sx * 0.0081, 0.016, -0.042);
    // anti-collision beacon on the belly, nav lights
    add('spine', new THREE.SphereGeometry(0.0013, 10, 8), M.navRed, -0.0084, 0.012, -0.045);
    add('spine', new THREE.SphereGeometry(0.0013, 10, 8), M.navGreen, 0.0084, 0.012, -0.045);
  }

  // --- Engines: twin exposed turbines behind the head, chrome bellmouths facing forward.
  {
    const gearbox = new RoundedBoxGeometry(0.014, 0.01, 0.022, 3, 0.003);
    add('engines', gearbox, M.paint, 0, 0.026, 0.0);
    for (const sx of [-1, 1]) {
      const x = sx * 0.0092;
      const nac = cyl(0.0052, 0.0047, 0.034, 20); nac.rotateX(Math.PI / 2);
      add('engines', nac, M.paint, x, 0.0285, 0.014);
      const lip = new THREE.TorusGeometry(0.0053, 0.0013, 10, 24);
      add('engines', lip, M.chrome, x, 0.0285, -0.0035);
      const bell = cyl(0.0058, 0.0052, 0.004, 24); bell.rotateX(Math.PI / 2);
      add('engines', bell, M.chrome, x, 0.0285, -0.0012);
      const face = new THREE.CircleGeometry(0.0042, 20);
      face.rotateY(Math.PI);
      add('engines', face, M.darkMetal, x, 0.0285, -0.002);
      const ex = cyl(0.0034, 0.0041, 0.008, 14); ex.rotateX(Math.PI / 2); ex.rotateY(sx * 0.35);
      add('engines', ex, M.exhaust, x + sx * 0.002, 0.029, 0.034);
      // a green cowl stripe
      const st = cyl(0.00525, 0.00525, 0.003, 20, 1); st.rotateX(Math.PI / 2);
      add('engines', st, M.green, x, 0.0285, 0.022);
    }
    // mast
    add('engines', cyl(0.0021, 0.0026, C.hub[1] - 0.031, 12), M.darkMetal, C.hub[0], (C.hub[1] + 0.031) / 2, C.hub[2]);
    add('engines', cyl(0.0036, 0.0036, 0.0012, 18), M.alu, C.hub[0], 0.033, C.hub[2]);
  }

  // --- Tail boom rising to the tail pylon.
  {
    const a = V3(0, 0.017, 0.042), b = V3(0, 0.035, 0.118);
    const boom = rod(a, b, 0.0048, 0.0032, 4);
    boom.rotateZ(0); // square-ish section
    const m = new THREE.Mesh(boom, M.paint);
    add('tailBoom', m);
    // the boom's square section rotated 45 degrees so a flat side faces up
    add('tailBoom', rod(V3(0, 0.0105, 0.05), V3(0, 0.031, 0.115), 0.0009), M.darkMetal); // drive shaft cover underneath
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.0013, 10, 8), M.beacon);
    add('tailBoom', beacon, 0, 0.0285, 0.07);
    parts.tailBoom.userData.beacon = beacon;
  }

  // --- Tail pylon with the four-blade tail rotor on the left and the green stabiliser on the right.
  const tailRotor = new THREE.Group();
  {
    const fin = new THREE.Shape();
    fin.moveTo(0.112, 0.026); fin.lineTo(0.13, 0.027); fin.lineTo(0.136, 0.058); fin.lineTo(0.126, 0.059); fin.lineTo(0.112, 0.036); fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 2 });
    fg.rotateY(-Math.PI / 2);   // shape x -> body z
    fg.translate(0.002, 0, 0);
    add('tailPylon', fg, M.paint);
    const stab = new RoundedBoxGeometry(0.02, 0.0012, 0.006, 2, 0.0005);
    add('tailPylon', stab, M.green, 0.011, 0.054, 0.131);
    add('tailPylon', new THREE.SphereGeometry(0.001, 8, 6), M.navGreen, 0.021, 0.054, 0.131);
    const gb = cyl(0.0022, 0.0028, 0.006, 14); gb.rotateZ(Math.PI / 2);
    add('tailPylon', gb, M.darkMetal, C.tailHub[0] + 0.004, C.tailHub[1], C.tailHub[2]);
    // tail rotor: four blades in the YZ plane, red and white bands at the tips
    const tr = C.tailRadius;
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2;
      const bl = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.0005, tr - 0.003, 0.0028), M.blade);
      b.position.y = (tr - 0.003) / 2 + 0.002;
      bl.add(b);
      for (const [o, mat] of [[0.0, M.bladeTipRed], [0.0025, M.white], [0.005, M.bladeTipRed]]) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.0006, 0.0024, 0.0029), mat);
        t.position.y = tr - 0.0012 - o;
        bl.add(t);
      }
      bl.rotation.x = a;
      tailRotor.add(bl);
    }
    tailRotor.add(new THREE.Mesh(cyl(0.0016, 0.0016, 0.002, 12).rotateZ(Math.PI / 2), M.hubMetal));
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.003, tr, 40, 1), discMaterial(tr));
    disc.rotation.y = Math.PI / 2;
    tailRotor.add(disc);
    tailRotor.userData.disc = disc;
    add('tailPylon', tailRotor, C.tailHub[0], C.tailHub[1], C.tailHub[2]);
  }

  // --- Belly tank: boxy, orange, big green numerals on both sides, two belly doors and a white rail.
  const doors = [];
  {
    const T = C.tank;
    const W = 0.033, H = 0.021, L = 0.063;
    const cy = -0.0155, cz = -0.002;
    const body = new RoundedBoxGeometry(W, H, L, 3, 0.0032);
    add('tank', body, M.orange, 0, cy, cz);
    for (const sx of [-1, 1]) {
      const side = new THREE.PlaneGeometry(L * 0.86, H * 0.72);
      side.rotateY(sx * Math.PI / 2);
      add('tank', side, M.tankSide, sx * (W / 2 + 0.0002), cy + 0.0008, cz);
    }
    // doors: hinged along the outer edges of the floor, opening downwards
    for (const sx of [-1, 1]) {
      const hinge = new THREE.Group();
      const d = new THREE.Mesh(new THREE.BoxGeometry(W / 2 - 0.0035, 0.0009, L - 0.012), M.orange);
      d.position.x = -sx * (W / 2 - 0.0035) / 2;
      hinge.add(d);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.0005, 0.0012, L - 0.012), M.green);
      edge.position.x = -sx * (W / 2 - 0.0035);
      hinge.add(edge);
      hinge.userData.side = sx;
      add('tank', hinge, sx * (W / 2 - 0.0028), cy - H / 2 - 0.0005, cz);
      doors.push(hinge);
    }
    // dark door well, seen when the doors open
    add('tank', new THREE.PlaneGeometry(W - 0.006, L - 0.012).rotateX(Math.PI / 2), M.darkMetal, 0, cy - H / 2 + 0.0004, cz);
    // the long white rail assembly under the tank
    for (const sx of [-1, 1]) {
      add('tank', rod(V3(sx * 0.0125, cy - H / 2 - 0.0042, cz - 0.041), V3(sx * 0.0125, cy - H / 2 - 0.0042, cz + 0.037), 0.0009), M.white);
      for (const z of [-0.026, 0, 0.026]) add('tank', rod(V3(sx * 0.0125, cy - H / 2 - 0.0042, cz + z), V3(sx * 0.0125, cy - H / 2, cz + z), 0.0006), M.white);
    }
    // snorkel socket, front right
    const a = C.hose.anchor;
    add('tank', cyl(0.0032, 0.0028, 0.004, 14), M.darkMetal, a[0], a[1] + 0.002, a[2]);
    add('tank', new THREE.TorusGeometry(0.0029, 0.0006, 8, 16).rotateX(Math.PI / 2), M.alu, a[0], a[1], a[2]);
    // cargo hook behind the tank
    const h = C.hooks[0];
    add('tank', rod(V3(h[0], cy - 0.004, h[2] - 0.004), V3(h[0], h[1] + 0.003, h[2]), 0.0006), M.darkMetal);
    add('tank', new THREE.TorusGeometry(0.0026, 0.0007, 8, 16, Math.PI * 1.6).rotateY(Math.PI / 2), M.alu, h[0], h[1] + 0.002, h[2]);
  }

  // --- Gear: nose wheels under the pod, twin mains on long splayed legs.
  {
    const wheel = (r, w) => { const g = cyl(r, r, w, 18); g.rotateZ(Math.PI / 2); return g; };
    const hubG = (r) => { const g = cyl(r * 0.45, r * 0.45, 0.0006, 10); g.rotateZ(Math.PI / 2); return g; };
    const groundY = -C.gearDrop;
    for (const sx of [-1, 1]) {
      const name = sx < 0 ? 'gearNL' : 'gearNR';
      const r = 0.0042, x = sx * 0.0072, z = -0.062;
      add(name, wheel(r, 0.0032), M.rubber, x, groundY + r, z);
      add(name, hubG(r), M.alu, x + sx * 0.0017, groundY + r, z);
      add(name, rod(V3(sx * 0.0045, groundY + r, z), V3(sx * 0.004, -0.009, z + 0.004), 0.0008), M.alu);
    }
    for (const sx of [-1, 1]) {
      const name = sx < 0 ? 'gearML' : 'gearMR';
      const r = 0.0048, x = sx * 0.034, z = 0.032;
      for (const dz of [-0.0034, 0.0034]) {
        add(name, wheel(r, 0.003), M.rubber, x, groundY + r, z + dz);
        add(name, hubG(r), M.alu, x + sx * 0.0016, groundY + r, z + dz);
      }
      const hub = V3(x - sx * 0.002, groundY + r, z);
      add(name, rod(hub, V3(sx * 0.0075, 0.009, 0.024), 0.0011), M.orange);   // main leg
      add(name, rod(hub, V3(sx * 0.0075, 0.007, 0.046), 0.0008), M.orange);   // drag brace
      add(name, rod(V3(x - sx * 0.006, groundY + r + 0.002, z), V3(sx * 0.012, -0.012, z - 0.002), 0.0007), M.alu); // shock strut to the tank frame
    }
  }

  // --- Main rotor: exposed six-blade head; blade parts ride in the rotor group while flying.
  const rotor = new THREE.Group();
  {
    const hub = C.hub;
    rotor.position.set(hub[0] - P.engines.pos[0], hub[1] - P.engines.pos[1], hub[2] - P.engines.pos[2]);
    parts.engines.add(rotor);
    const head = new THREE.Group();
    head.add(new THREE.Mesh(cyl(0.0042, 0.0048, 0.0036, 24), M.hubMetal));
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.003, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.hubMetal);
    cap.position.y = 0.0018;
    head.add(cap);
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.0018, 0.0026), M.hubMetal);
      arm.position.set(Math.cos(a) * 0.0068, 0, -Math.sin(a) * 0.0068);
      arm.rotation.y = a;
      head.add(arm);
      const damper = new THREE.Mesh(cyl(0.0005, 0.0005, 0.0055, 6), M.alu);
      damper.rotation.z = Math.PI / 2;
      damper.position.set(Math.cos(a + 0.35) * 0.0058, 0.0013, -Math.sin(a + 0.35) * 0.0058);
      damper.rotation.y = a + 0.35;
      head.add(damper);
    }
    rotor.add(head);
    rotor.userData.head = head;
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.011, R, 96, 1), discMaterial(R));
    disc.rotation.x = -Math.PI / 2;
    disc.position.y = 0.0006;
    rotor.add(disc);
    rotor.userData.disc = disc;
    const bladeGeo = (() => {
      const s = new THREE.Shape();
      const r0 = 0.0105, r1 = R, ch = 0.0034;
      s.moveTo(r0, -ch * 0.8); s.lineTo(r0 + 0.008, -ch); s.lineTo(r1 - 0.004, -ch); s.lineTo(r1, -ch * 0.5);
      s.lineTo(r1, ch * 0.7); s.lineTo(r1 - 0.004, ch); s.lineTo(r0 + 0.008, ch); s.lineTo(r0, ch * 0.8); s.closePath();
      const geo = new THREE.ExtrudeGeometry(s, { depth: 0.0007, bevelEnabled: false, curveSegments: 2 });
      geo.rotateX(Math.PI / 2);
      geo.translate(-0.05, 0.0004, 0);
      return geo;
    })();
    const tipGeo = new THREE.BoxGeometry(0.004, 0.0008, 0.0069);
    const holder = new THREE.Group();
    for (let k = 0; k < 6; k++) {
      const g = parts[`blade${k}`];
      const a = k * Math.PI / 3;
      g.position.set(Math.cos(a) * 0.05, 0, -Math.sin(a) * 0.05);
      g.rotation.set(0, a, 0);
      const tip = new THREE.Mesh(tipGeo, M.white);
      tip.position.set(R - 0.002 - 0.05, 0.0004, 0);
      g.add(new THREE.Mesh(bladeGeo, M.blade), tip);
      holder.add(g);
    }
    rotor.add(holder);
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0x2a2c2d, transparent: true, opacity: 0.12, depthWrite: false });
    const ghosts = [];
    for (let j = 1; j <= 3; j++) {
      const gh = new THREE.Group();
      for (let k = 0; k < 6; k++) {
        const m = new THREE.Mesh(bladeGeo, ghostMat);
        const a = k * Math.PI / 3;
        m.position.set(Math.cos(a) * 0.05, 0, -Math.sin(a) * 0.05);
        m.rotation.y = a;
        gh.add(m);
      }
      gh.userData.offset = -j * 0.1;
      rotor.add(gh);
      ghosts.push(gh);
    }
    rotor.userData.ghosts = ghosts;
  }

  const keep = [rotor, tailRotor, parts.tailBoom.userData.beacon, ...doors];
  for (const p of SKYCRANE_PARTS) if (!p.blade) mergeStatic(parts[p.name], keep);
  for (const gh of rotor.userData.ghosts) mergeStatic(gh, []);
  for (const p of SKYCRANE_PARTS) if (!p.blade) root.add(parts[p.name]);
  root.traverse((o) => { if (o.isMesh && !o.material.transparent && !o.material.isShaderMaterial) { o.castShadow = true; o.receiveShadow = true; } });
  root.userData = { parts, rotors: [rotor], rotor, tailRotor, doors, beacon: parts.tailBoom.userData.beacon, materials: M };
  return root;
}

function mergeStatic(part, keep) {
  part.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(part.matrixWorld).invert();
  const byMat = new Map();
  const victims = [];
  part.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || keep.includes(o)) return;
    for (let a = o.parent; a && a !== part; a = a.parent) if (keep.includes(a)) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    g.clearGroups();
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(g);
    victims.push(o);
  });
  for (const o of victims) o.parent.remove(o);
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false);
    if (merged) part.add(new THREE.Mesh(merged, mat));
  }
}

// Clone of one part for a debris body (centred on the part origin), scorched, with ember glow hooks.
export function cloneSkycranePart(model, name) {
  const src = model.userData.parts[name];
  const { rotor, tailRotor } = model.userData;
  const g = new THREE.Group();
  for (const child of src.children) {
    if (child === rotor) { const head = rotor.userData.head.clone(true); head.position.copy(child.position); g.add(head); continue; }
    if (child === tailRotor) continue;
    g.add(child.clone(true));
  }
  g.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    o.castShadow = true;
    if (o.material.transparent || o.material.isShaderMaterial) { o.visible = false; return; }
    const m = o.material.clone();
    if (m.color) m.color.multiplyScalar(0.45);
    if (m.map) m.map = m.map;
    if ('emissive' in m) { m.emissive = new THREE.Color(0xff5a1a); m.emissiveIntensity = 0; }
    o.material = m;
  });
  g.userData.embers = [];
  g.userData.emberScale = 0.6;
  g.traverse((o) => { if (o.isMesh && o.material.emissive) g.userData.embers.push(o.material); });
  return g;
}
