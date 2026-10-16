import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { ROOM, FRIDGE, RADIO, COUNTER, CLOCK, FRAMES, CURTAINS, CHIMNEY, CAT, BENCH, GNOME, CUPS, BIRDBATH, MOBILE, LAMP, HEDGE, SPOON } from '../sim/layout.js';
import { brickTexture } from './gardenTextures.js';
import { glazeMaterial } from './models.js';
import { boxUV, Batcher } from './batch.js';

// The lived-in bits: fridge with notes that flutter in the wash, a wall clock on real time, pictures,
// curtains that stir, a rag rug, a radio you land on to play, the chimney, the gnome, the cat who bats at
// tea bags, a robin on the bird bath, a toy-plane mobile, and every loose prop the sim moves about.

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _a = new THREE.Vector3();
const rnd = (() => { let s = 99; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();

function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function shadowed(o, cast = true, receive = true) { o.traverse((m) => { if (m.isMesh) { m.castShadow = cast; m.receiveShadow = receive; } }); return o; }

export function buildCharm(scene, quality, kitchen, sim) {
  const charm = { audio: null };
  const fy = ROOM.floorY;
  const hi = (quality.name === 'high' || quality.name === 'ultra');
  // Static pieces are merged by material (a handful of draw calls instead of dozens).
  const batches = { cr: new Batcher(), r: new Batcher() };
  const bake = (g, cast = true, receive = true) => {
    g.updateMatrixWorld(true);
    const b = cast ? batches.cr : batches.r;
    g.traverse((o) => { if (o.isMesh) b.add(o.geometry, o.material, o.matrixWorld, 0xffffff, { cast, receive }); });
  };

  // ---------------------------------------------------------------- fridge and its notes
  const notes = [];
  {
    const F = FRIDGE, w = F.x1 - F.x0, h = F.top - fy, d = F.z1 - F.z0;
    const g = new THREE.Group();
    const enamel = new THREE.MeshPhysicalMaterial({ color: 0xefe3c6, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 });
    const body = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 4, 0.045), enamel);
    g.add(body);
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, metalness: 1, roughness: 0.15 });
    const seam = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.006, d - 0.04), new THREE.MeshStandardMaterial({ color: 0x8f8775 }));
    seam.position.set(w / 2 + 0.001, h * 0.18, 0);
    g.add(seam);
    for (const [y, len] of [[h * 0.32, 0.22], [-h * 0.05, 0.3]]) {
      const hd = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, len, 4, 10), chrome);
      hd.position.set(w / 2 + 0.03, y, d / 2 - 0.07);
      g.add(hd);
      for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.03, 8), chrome); st.rotation.z = Math.PI / 2; st.position.set(w / 2 + 0.015, y + s * len * 0.42, d / 2 - 0.07); g.add(st); }
    }
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.03), new THREE.MeshStandardMaterial({ map: canvasTex(256, 64, (c) => { c.fillStyle = '#c9b98f'; c.fillRect(0, 0, 256, 64); c.fillStyle = '#7d2a20'; c.font = 'italic bold 40px Georgia, serif'; c.textAlign = 'center'; c.fillText('Frostline', 128, 47); }), metalness: 0.6, roughness: 0.3 }));
    badge.rotation.y = Math.PI / 2; badge.position.set(w / 2 + 0.002, h * 0.42, -d * 0.2);
    g.add(badge);
    g.position.set((F.x0 + F.x1) / 2, (F.top + fy) / 2, (F.z0 + F.z1) / 2);
    bake(g);
    // Notes held by magnets: a shopping list, a child's drawing of the helicopter, a reminder, a postcard.
    const fx = F.x1 + 0.003;
    const defs = [
      { y: 0.62, z: 1.08, w: 0.1, h: 0.13, rot: 0.06, mag: 0xc0392b, draw: (c, W, H) => { c.fillStyle = '#fbf6e6'; c.fillRect(0, 0, W, H); c.strokeStyle = '#9fb7d6'; for (let y = 40; y < H; y += 26) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } c.fillStyle = '#233'; c.font = '22px "Segoe Print", "Comic Sans MS", cursive'; ['Milk', 'Teabags (lots)', 'Biscuits', 'Rotor blades?'].forEach((t, i) => c.fillText(t, 14, 60 + i * 26)); } },
      { y: 0.5, z: 1.3, w: 0.13, h: 0.1, rot: -0.08, mag: 0x2e86c1, draw: (c, W, H) => { c.fillStyle = '#fffdf8'; c.fillRect(0, 0, W, H); c.fillStyle = '#7ec8e3'; c.fillRect(0, 0, W, H * 0.6); c.fillStyle = '#6ab04c'; c.fillRect(0, H * 0.75, W, H); c.strokeStyle = '#c0392b'; c.lineWidth = 6; c.beginPath(); c.ellipse(W * 0.5, H * 0.45, 40, 18, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(W * 0.5 + 40, H * 0.45); c.lineTo(W * 0.85, H * 0.4); c.stroke(); c.strokeStyle = '#333'; c.lineWidth = 4; c.beginPath(); c.moveTo(W * 0.2, H * 0.22); c.lineTo(W * 0.8, H * 0.22); c.moveTo(W * 0.5, H * 0.22); c.lineTo(W * 0.5, H * 0.32); c.stroke(); c.fillStyle = '#8b5a2b'; c.fillRect(W * 0.47, H * 0.6, 8, 30); c.fillStyle = '#f7f1e3'; c.fillRect(W * 0.43, H * 0.72, 22, 26); c.fillStyle = '#222'; c.font = 'bold 18px "Comic Sans MS", cursive'; c.fillText('ME + HELI', 10, H - 10); } },
      { y: 0.3, z: 1.12, w: 0.09, h: 0.09, rot: 0.12, mag: 0xf1c40f, draw: (c, W, H) => { c.fillStyle = '#ffe680'; c.fillRect(0, 0, W, H); c.fillStyle = '#5a3d1e'; c.font = '20px "Segoe Print", "Comic Sans MS", cursive'; ['Bags out', 'by 4 mins!', '— Mum'].forEach((t, i) => c.fillText(t, 12, 44 + i * 30)); } },
      { y: 0.18, z: 1.36, w: 0.12, h: 0.085, rot: -0.03, mag: 0x27ae60, draw: (c, W, H) => { const g2 = c.createLinearGradient(0, 0, 0, H); g2.addColorStop(0, '#f6c28b'); g2.addColorStop(0.6, '#e88f6a'); g2.addColorStop(0.62, '#3b6ea5'); g2.addColorStop(1, '#2a4f7a'); c.fillStyle = g2; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = 'italic bold 22px Georgia, serif'; c.fillText('Greetings from Brighton', 10, 30); } },
    ];
    for (const n of defs) {
      const tex = canvasTex(256, Math.round(256 * n.h / n.w), n.draw);
      const pivot = new THREE.Group();
      pivot.position.set(fx, n.y + n.h / 2, n.z);
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(n.w, n.h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
      paper.rotation.y = Math.PI / 2;
      paper.position.y = -n.h / 2;
      const tilt = new THREE.Group();
      tilt.rotation.x = n.rot;
      tilt.add(paper);
      pivot.add(tilt);
      const mag = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.008, 16), new THREE.MeshStandardMaterial({ color: n.mag, roughness: 0.4 }));
      mag.rotation.z = Math.PI / 2; mag.position.set(0.004, -0.008, 0);
      pivot.add(mag);
      scene.add(pivot);
      notes.push({ pivot, flap: 0, phase: rnd() * 6 });
    }
  }

  // ---------------------------------------------------------------- wall clock (keeps real time)
  const clock = {};
  {
    const g = new THREE.Group();
    const face = new THREE.Mesh(new THREE.CircleGeometry(CLOCK.r, 48), new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTex(512, 512, (c, W) => {
      c.fillStyle = '#f7f0df'; c.fillRect(0, 0, W, W);
      c.translate(W / 2, W / 2);
      c.fillStyle = '#2b2b2b'; c.font = 'bold 54px Georgia, serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      for (let i = 1; i <= 12; i++) { const a = i / 12 * Math.PI * 2; c.fillText(String(i), Math.sin(a) * 190, -Math.cos(a) * 190); }
      for (let i = 0; i < 60; i++) { const a = i / 60 * Math.PI * 2; c.fillRect(Math.sin(a) * 236 - 2, -Math.cos(a) * 236 - 2, 4, 4); }
      c.font = 'italic 26px Georgia, serif'; c.fillText('Helicoptea & Co.', 0, 80);
    }) }));
    g.add(face);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(CLOCK.r, 0.012, 10, 48), new THREE.MeshStandardMaterial({ color: 0x9a6a3a, roughness: 0.4, metalness: 0.2 }));
    g.add(rim);
    const handMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1f, roughness: 0.4 });
    const hand = (len, w, z) => { const pv = new THREE.Group(); const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, 0.003), handMat); m.position.y = len * 0.4; pv.add(m); pv.position.z = z; g.add(pv); return pv; };
    clock.h = hand(CLOCK.r * 0.55, 0.012, 0.004);
    clock.m = hand(CLOCK.r * 0.8, 0.008, 0.007);
    clock.s = hand(CLOCK.r * 0.85, 0.003, 0.01);
    clock.s.children[0].material = new THREE.MeshStandardMaterial({ color: 0xb03a2e });
    g.position.set(CLOCK.x, CLOCK.y, ROOM.minZ + 0.012);
    scene.add(shadowed(g, false, true));
  }

  // ---------------------------------------------------------------- pictures
  {
    const paint = [
      (c, W, H) => { c.fillStyle = '#3d4a3a'; c.fillRect(0, 0, W, H); c.fillStyle = '#6b4a2b'; c.fillRect(0, H * 0.72, W, H); c.fillStyle = '#6e2f1d'; c.beginPath(); c.ellipse(W * 0.45, H * 0.6, W * 0.2, H * 0.17, 0, 0, Math.PI * 2); c.fill(); c.fillRect(W * 0.6, H * 0.5, W * 0.14, 10); c.fillStyle = '#f0e6d0'; c.beginPath(); c.ellipse(W * 0.78, H * 0.7, W * 0.08, H * 0.05, 0, 0, Math.PI * 2); c.fill(); c.fillStyle = '#d8a548'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(W * (0.2 + i * 0.03), H * 0.74, 12, 0, Math.PI * 2); c.fill(); } },
      (c, W, H) => { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#9cc9e8'); g.addColorStop(0.55, '#e9f1f2'); g.addColorStop(0.56, '#3a7ca5'); g.addColorStop(1, '#d9c79c'); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(40 + i * 60, 60, 22, 0, Math.PI * 2); c.fill(); } c.fillStyle = '#c0392b'; c.fillRect(W * 0.62, H * 0.32, 14, H * 0.24); c.fillStyle = '#fff'; c.fillRect(W * 0.62, H * 0.4, 14, 12); },
      (c, W, H) => { c.fillStyle = '#efe3c4'; c.fillRect(0, 0, W, H); c.strokeStyle = '#1f3a5f'; c.lineWidth = 3; c.strokeRect(12, 12, W - 24, H - 24); c.fillStyle = '#1f3a5f'; c.font = 'bold 30px Georgia, serif'; c.textAlign = 'center'; c.fillText('ROYAL TEA FLYING CORPS', W / 2, 52); c.font = 'italic 20px Georgia, serif'; c.fillText('Steady hands, strong brew', W / 2, H - 28); c.strokeStyle = '#1f3a5f'; c.lineWidth = 5; c.beginPath(); c.ellipse(W / 2, H * 0.52, 70, 26, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.moveTo(W / 2 + 70, H * 0.5); c.lineTo(W / 2 + 160, H * 0.45); c.stroke(); c.beginPath(); c.moveTo(W / 2 - 150, H * 0.32); c.lineTo(W / 2 + 150, H * 0.32); c.moveTo(W / 2, H * 0.32); c.lineTo(W / 2, H * 0.42); c.stroke(); c.beginPath(); c.moveTo(W / 2, H * 0.62); c.lineTo(W / 2, H * 0.74); c.stroke(); c.fillStyle = '#e8dcc2'; c.strokeRect(W / 2 - 16, H * 0.74, 32, 38); },
    ];
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 0.5 });
    FRAMES.forEach((F, i) => {
      const g = new THREE.Group();
      const art = new THREE.Mesh(new THREE.PlaneGeometry(F.w - 0.05, F.h - 0.05), new THREE.MeshStandardMaterial({ map: canvasTex(512, Math.round(512 * F.h / F.w), paint[i % paint.length]), roughness: 0.85 }));
      art.position.z = 0.008;
      g.add(art);
      for (const [w, h, x, y] of [[F.w, 0.025, 0, F.h / 2 - 0.0125], [F.w, 0.025, 0, -F.h / 2 + 0.0125], [0.025, F.h, F.w / 2 - 0.0125, 0], [0.025, F.h, -F.w / 2 + 0.0125, 0]]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.022), frameMat); b.position.set(x, y, 0.011); g.add(b);
      }
      if (F.wall === 'left') { g.rotation.y = Math.PI / 2; g.position.set(ROOM.minX + 0.001, F.y, F.z); }
      else { g.rotation.y = Math.PI; g.position.set(F.x, F.y, ROOM.maxZ - 0.001); }
      bake(g, false, true);
    });
  }

  // ---------------------------------------------------------------- curtains (they stir in a draught or rotor wash)
  const curtainU = { uTime: { value: 0 }, uHub: { value: new THREE.Vector4() }, uSway: { value: 0 } };
  {
    const fabric = canvasTex(256, 256, (c, W) => {
      c.fillStyle = '#efe6d2'; c.fillRect(0, 0, W, W);
      c.fillStyle = 'rgba(122,150,124,0.55)';
      for (let i = 0; i < 8; i++) { c.fillRect(i * 32, 0, 16, W); c.fillRect(0, i * 32, W, 16); }
    });
    fabric.wrapS = fabric.wrapT = THREE.RepeatWrapping;
    fabric.repeat.set(3, 6);
    const mat = new THREE.MeshStandardMaterial({ map: fabric, roughness: 0.95, side: THREE.DoubleSide });
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, curtainU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime; uniform vec4 uHub; uniform float uSway;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 wpc = (modelMatrix * vec4(position, 1.0)).xyz;
          float hang = clamp((${CURTAINS.rail.toFixed(3)} - wpc.y) / 1.3, 0.0, 1.0);
          float near = uHub.w > 0.0 ? clamp(1.0 - length(uHub.xyz - wpc) / 0.6, 0.0, 1.0) * uHub.w : 0.0;
          float s = (0.004 + uSway * 0.01) * sin(uTime * 0.9 + wpc.x * 3.0 + wpc.y * 2.0) + near * 0.03 * sin(uTime * 13.0 + wpc.y * 25.0);
          transformed.z += s * hang * hang;`);
    };
    for (const [x0, x1] of CURTAINS.panels) {
      const W = x1 - x0, H = CURTAINS.rail - 0.05 - (fy + 0.6);
      const geo = new THREE.PlaneGeometry(W * 1.7, H, 40, 12);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i);
        const u = (x / (W * 1.7)) + 0.5;
        const tie = 1 - 0.35 * Math.exp(-(((y + H * 0.15) / (H * 0.12)) ** 2)); // gathered by a tie-back
        p.setXYZ(i, (u - 0.5) * W * tie, y, Math.sin(u * Math.PI * 11) * CURTAINS.depth * 0.32);
      }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat);
      m.position.set((x0 + x1) / 2, (CURTAINS.rail - 0.05 + fy + 0.6) / 2, ROOM.minZ + 0.02 + CURTAINS.depth / 2);
      scene.add(shadowed(m, true, true));
    }
    const brass = new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 });
    const x0 = CURTAINS.panels[0][0] - 0.05, x1 = CURTAINS.panels[1][1] + 0.05;
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, x1 - x0, 12), brass);
    rail.rotation.z = Math.PI / 2; rail.position.set((x0 + x1) / 2, CURTAINS.rail, ROOM.minZ + 0.06);
    const rg = new THREE.Group();
    rg.add(rail);
    for (const x of [x0, x1]) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), brass); f.position.set(x, CURTAINS.rail, ROOM.minZ + 0.06); rg.add(f); }
    bake(rg);
  }

  // ---------------------------------------------------------------- rag rug under the table
  {
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1, 64), new THREE.MeshStandardMaterial({ roughness: 1, map: canvasTex(512, 512, (c, W) => {
      const cols = ['#b5523b', '#d9b26a', '#6f8f7a', '#e9dcc0', '#8a5a3c', '#c7826a', '#4f6b78'];
      for (let r = W / 2, i = 0; r > 4; r -= 9 + (i % 3) * 3, i++) { c.fillStyle = cols[i % cols.length]; c.beginPath(); c.arc(W / 2, W / 2, r, 0, Math.PI * 2); c.fill(); }
      const img = c.getImageData(0, 0, W, W);
      for (let k = 0; k < img.data.length; k += 4) { const n = 0.85 + Math.random() * 0.2; img.data[k] *= n; img.data[k + 1] *= n; img.data[k + 2] *= n; }
      c.putImageData(img, 0, 0);
    }) }));
    rug.rotation.x = -Math.PI / 2;
    rug.scale.set(1.25, 0.9, 1);
    rug.position.set(0, fy + 0.003, 0.15);
    rug.receiveShadow = true;
    scene.add(rug);
  }

  // ---------------------------------------------------------------- radio on the counter
  const radio = {};
  {
    const R = RADIO, g = new THREE.Group();
    const walnut = new THREE.MeshPhysicalMaterial({ color: 0x6b3f22, roughness: 0.35, clearcoat: 0.6 });
    g.add(new THREE.Mesh(new RoundedBoxGeometry(R.halfX * 2, R.h, R.halfZ * 2, 3, 0.012), walnut));
    const grille = new THREE.Mesh(new THREE.PlaneGeometry(R.halfZ * 1.05, R.h * 0.7), new THREE.MeshStandardMaterial({ roughness: 1, map: canvasTex(128, 128, (c, W) => { c.fillStyle = '#c8b28a'; c.fillRect(0, 0, W, W); c.strokeStyle = 'rgba(80,60,40,0.35)'; for (let i = 0; i < W; i += 4) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, W); c.stroke(); c.beginPath(); c.moveTo(0, i); c.lineTo(W, i); c.stroke(); } }) }));
    grille.rotation.y = -Math.PI / 2; grille.position.set(-R.halfX - 0.0012, 0.008, R.halfZ * 0.4);
    g.add(grille);
    radio.dialMat = new THREE.MeshStandardMaterial({ color: 0xe8dcb8, emissive: 0xffb347, emissiveIntensity: 0, roughness: 0.4, map: canvasTex(256, 96, (c, W, H) => { c.fillStyle = '#efe4c6'; c.fillRect(0, 0, W, H); c.fillStyle = '#5a3a1a'; c.font = '16px Georgia, serif'; ['LW', 'MW', 'FM', 'TEA'].forEach((t, i) => c.fillText(t, 10 + i * 60, 30)); for (let i = 0; i < 40; i++) c.fillRect(10 + i * 6, 50, 1, i % 5 ? 8 : 14); c.fillStyle = '#b03a2e'; c.fillRect(150, 40, 3, 40); }) });
    const dial = new THREE.Mesh(new THREE.PlaneGeometry(R.halfZ * 0.75, R.h * 0.32), radio.dialMat);
    dial.rotation.y = -Math.PI / 2; dial.position.set(-R.halfX - 0.0012, 0.03, -R.halfZ * 0.52);
    g.add(dial);
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xe8dcc0, roughness: 0.4 });
    for (const z of [-R.halfZ * 0.75, -R.halfZ * 0.3]) { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.012, 20), knobMat); k.rotation.z = Math.PI / 2; k.position.set(-R.halfX - 0.006, -0.04, z); g.add(k); }
    g.position.set(R.x, COUNTER.top + R.h / 2, R.z);
    bake(g);
    radio.group = g;
  }

  // ---------------------------------------------------------------- chimney stack and pots
  {
    const C = CHIMNEY, g = new THREE.Group();
    const bt = brickTexture(256); bt.repeat.set(1 / 0.9, 1 / 0.9);
    const brick = new THREE.MeshStandardMaterial({ map: bt, roughness: 0.92 });
    const h = C.top - 2.2;
    const stack = new THREE.Mesh(boxUV(C.halfX * 2, h, C.halfZ * 2, 1), brick);
    stack.position.set(C.x, 2.2 + h / 2, C.z);
    g.add(stack);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(C.halfX * 2 + 0.06, 0.05, C.halfZ * 2 + 0.06), new THREE.MeshStandardMaterial({ color: 0xbdb4a2, roughness: 0.9 }));
    cap.position.set(C.x, C.top - 0.025, C.z);
    g.add(cap);
    const pot = new THREE.MeshStandardMaterial({ color: 0xa8553a, roughness: 0.85 });
    for (const [x, z] of C.pots) {
      const pts = [new THREE.Vector2(C.potR * 1.1, 0), new THREE.Vector2(C.potR, C.potH * 0.7), new THREE.Vector2(C.potR * 0.8, C.potH * 0.85), new THREE.Vector2(C.potR * 0.95, C.potH), new THREE.Vector2(C.potR * 0.8, C.potH)];
      const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), pot);
      m.position.set(x, C.top, z);
      g.add(m);
    }
    bake(g);
  }

  // ---------------------------------------------------------------- the gnome and his teacup tray
  {
    const G = GNOME, cup = CUPS.find((c) => c.id === 'gnome');
    const g = new THREE.Group();
    const mats = new Map();
    const glaze = (c) => { if (!mats.has(c)) mats.set(c, glazeMaterial(c, { roughness: 0.35 })); return mats.get(c); };
    // A proper glazed concrete gnome, tall enough that he holds his cup at his tummy and his face shows over
    // it: boots, a flared tunic with belt and buckle, white beard and moustache, rosy cheeks and nose, and
    // a red hat whose tip flops back.
    const SKIN = 0xf0c6a0, BLUE = 0x2f5fa0, RED = 0xc0392b, WHITE = 0xf4f1ea;
    const put = (geo, c, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, glaze(c)); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.scale.set(sx, sy, sz); g.add(m); return m; };
    const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
    for (const s of [-1, 1]) {
      put(S(0.036), 0x2a2622, s * 0.042, 0.022, 0.03, 0, s * 0.12, 0, 1, 0.62, 1.6);
      put(new THREE.CylinderGeometry(0.026, 0.03, 0.05, 14), 0x6b4a2e, s * 0.04, 0.05, 0.0);
    }
    const tunic = new THREE.LatheGeometry([[0, 0.04], [0.096, 0.04], [0.1, 0.07], [0.09, 0.13], [0.074, 0.18], [0.064, 0.215], [0.058, 0.25], [0.045, 0.275], [0, 0.285]].map(([r, y]) => new THREE.Vector2(r, y)), 28);
    put(tunic, BLUE, 0, 0, 0);
    put(new THREE.TorusGeometry(0.083, 0.01, 8, 28), 0x3b2a1a, 0, 0.155, 0, Math.PI / 2, 0, 0, 1, 1, 1);
    put(new THREE.BoxGeometry(0.03, 0.026, 0.008), 0xd8b24a, 0, 0.155, 0.088);
    put(new THREE.BoxGeometry(0.018, 0.014, 0.01), 0x3b2a1a, 0, 0.155, 0.089);
    // Arms reach forward to the tray; hands under its rim.
    const cupLocal = cup.standY - fy;
    for (const s of [-1, 1]) {
      const sh = new THREE.Vector3(s * 0.062, 0.245, 0.0), hand = new THREE.Vector3(s * 0.04, cupLocal - 0.012, 0.105);
      const d = hand.clone().sub(sh), L = d.length();
      const arm = put(new THREE.CapsuleGeometry(0.019, L - 0.02, 4, 10), BLUE, (sh.x + hand.x) / 2, (sh.y + hand.y) / 2, (sh.z + hand.z) / 2);
      arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      put(S(0.016, 10, 8), SKIN, hand.x, hand.y, hand.z);
    }
    put(new THREE.CylinderGeometry(0.052, 0.049, 0.008, 24), 0x8a5a33, 0, cupLocal - 0.004, 0.12);
    // Head, face and beard.
    const hy = 0.335;
    put(S(0.056, 20, 16), SKIN, 0, hy, 0.005);
    put(new THREE.ConeGeometry(0.058, 0.13, 20), WHITE, 0, hy - 0.075, 0.035, Math.PI - 0.25, 0, 0, 1, 1, 0.62);
    put(S(0.05, 16, 12), WHITE, 0, hy - 0.03, 0.03, 0, 0, 0, 1.05, 0.8, 0.7);
    for (const s of [-1, 1]) {
      put(S(0.016, 10, 8), WHITE, s * 0.019, hy - 0.022, 0.061, 0, 0, s * 0.5, 1.3, 0.75, 0.8);   // moustache
      put(S(0.014, 10, 8), 0xec9f8c, s * 0.03, hy - 0.005, 0.05);                                 // cheeks
      put(S(0.0065, 8, 6), 0x1a1a1a, s * 0.02, hy + 0.012, 0.052);                                // eyes
      put(S(0.0022, 6, 4), 0xffffff, s * 0.02 + 0.002, hy + 0.015, 0.0585);                      // glints
      put(new THREE.CapsuleGeometry(0.004, 0.014, 2, 6), WHITE, s * 0.021, hy + 0.025, 0.05, 0, 0, s * 1.35);
    }
    put(S(0.018, 12, 10), 0xe6977a, 0, hy - 0.002, 0.064, 0, 0, 0, 1, 0.9, 1.05);
    // Hat: a cone that softens and flops back near the tip.
    put(new THREE.CylinderGeometry(0.035, 0.064, 0.12, 22), RED, 0, hy + 0.075, -0.004, -0.06);
    put(new THREE.ConeGeometry(0.036, 0.11, 18), RED, 0, hy + 0.17, -0.022, -0.5);
    put(S(0.012, 10, 8), RED, 0, hy + 0.206, -0.055);
    put(new THREE.TorusGeometry(0.06, 0.006, 6, 24), 0xa83126, 0, hy + 0.02, 0.0, Math.PI / 2 - 0.06);
    g.position.set(G.x, fy, G.z);
    g.rotation.y = G.yaw;
    bake(g);
  }

  batches.cr.build(scene);
  batches.r.build(scene);

  // ---------------------------------------------------------------- the cat
  const cat = buildCat(scene, hi);

  // ---------------------------------------------------------------- robin on the bird bath
  const robin = buildRobin(scene);

  // ---------------------------------------------------------------- toy-plane mobile and the pendant lamp
  const mobile = buildMobile(scene);
  const pendant = kitchen.pendant;
  if (pendant) pendant.cord.geometry = new THREE.CylinderGeometry(0.004, 0.004, 1, 6);

  // ---------------------------------------------------------------- loose props
  const propMeshes = new Map();
  const mk = {
    napkin: (d) => { const t = canvasTex(128, 128, (c, W) => { c.fillStyle = '#f6f1e6'; c.fillRect(0, 0, W, W); c.fillStyle = `#${new THREE.Color(d.color).getHexString()}99`; for (let i = 0; i < 8; i++) { c.fillRect(i * 16, 0, 8, W); c.fillRect(0, i * 16, W, 8); } }); const m = new THREE.Mesh(new THREE.BoxGeometry(d.half[0] * 2, d.half[1] * 2, d.half[2] * 2), new THREE.MeshStandardMaterial({ map: t, roughness: 1 })); return m; },
    spoon: () => {
      const metal = new THREE.MeshStandardMaterial({ color: 0xd8dadf, metalness: 1, roughness: 0.18 });
      const g = new THREE.Group();
      const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.012, 16, 8, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4), metal);
      bowl.scale.set(1, 0.4, 1.5); bowl.position.set(0, 0.003, -0.05); g.add(bowl);
      const handle = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0018, 0.1), metal);
      handle.position.set(0, -0.001, 0.015); handle.rotation.x = -0.04; g.add(handle);
      return g;
    },
    sugar: (d) => new THREE.Mesh(new RoundedBoxGeometry(d.half[0] * 2, d.half[1] * 2, d.half[2] * 2, 2, 0.0015), new THREE.MeshStandardMaterial({ color: 0xfbfaf6, roughness: 0.75 })),
    biscuit: (d) => new THREE.Mesh(new THREE.CylinderGeometry(d.r, d.r, d.h, 24), new THREE.MeshStandardMaterial({ color: 0xcf9a55, roughness: 0.85 })),
    can: () => {
      const g = new THREE.Group();
      const zinc = new THREE.MeshStandardMaterial({ color: 0x5f8a6a, metalness: 0.5, roughness: 0.45 });
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.17, 24), zinc));
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.15, 10), zinc); sp.position.set(0.1, 0.03, 0); sp.rotation.z = -0.9; g.add(sp);
      const rose = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.01, 0.02, 12), zinc); rose.position.set(0.16, 0.075, 0); rose.rotation.z = -0.9; g.add(rose);
      const handle = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.007, 6, 20, Math.PI), zinc); handle.position.set(-0.01, 0.085, 0); g.add(handle);
      return g;
    },
  };
  for (const it of sim.props.items) {
    const d = it.def;
    const kind = d.id.replace(/\d+$/, '');
    const m = (mk[kind] || mk.sugar)(d);
    scene.add(shadowed(m));
    propMeshes.set(it, m);
  }
  function placeLamp(p, q) {
    if (!pendant) return;
    pendant.shade.position.copy(p); pendant.shade.quaternion.copy(q);
    _v.set(0, -0.06, 0).applyQuaternion(q).add(p);
    pendant.bulb.position.copy(_v);
    kitchen.lamp.position.copy(_v);
    const top = _a.set(0, LAMP.shadeH / 2, 0).applyQuaternion(q).add(p);
    const anchor = _v.set(LAMP.x, ROOM.ceilingY, LAMP.z);
    pendant.cord.position.copy(top).add(anchor).multiplyScalar(0.5);
    pendant.cord.scale.set(1, top.distanceTo(anchor), 1);
    pendant.cord.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.clone().sub(top).normalize());
  }
  function placeMobile(p, q, spin) {
    mobile.group.position.copy(p); mobile.group.quaternion.copy(q);
    const anchor = _v.set(MOBILE.x, ROOM.ceilingY, MOBILE.z);
    const top = _a.set(0, 0.004, 0).applyQuaternion(q).add(p);
    mobile.thread.position.copy(top).add(anchor).multiplyScalar(0.5);
    mobile.thread.scale.set(1, top.distanceTo(anchor), 1);
    mobile.thread.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), anchor.clone().sub(top).normalize());
    for (const pr of mobile.props) pr.rotation.x += spin;
  }
  // The flight replay poses the loose props, lamp and mobile from a recording (by prop id).
  charm.replay = {
    props: new Map([...propMeshes].map(([it, m]) => [it.def.id, m])),
    placeLamp, placeMobile,
  };
  const appleMeshes = new Map();
  const appleGeo = new THREE.SphereGeometry(0.034, 16, 12);
  const appleMats = [glazeMaterial(0xb3261e, { roughness: 0.45, extra: { clearcoat: 0.3 } }), glazeMaterial(0x9fb53a, { roughness: 0.45, extra: { clearcoat: 0.3 } })];

  // ---------------------------------------------------------------- radio music (procedural)
  const music = { on: false, next: 0, step: 0, out: null };
  function startMusic() {
    const A = charm.audio;
    if (!A || !A.ctx) return;
    const ctx = A.ctx;
    if (!music.out) {
      music.out = ctx.createGain(); music.out.gain.value = 0;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1200; bp.Q.value = 0.6;
      const hs = ctx.createBiquadFilter(); hs.type = 'lowpass'; hs.frequency.value = 3200;
      music.pan = ctx.createStereoPanner();
      music.out.connect(bp).connect(hs).connect(music.pan).connect(A.worldIn || A.master);
      // A whisper of crackle.
      const n = ctx.createBufferSource(); n.buffer = A.noise; n.loop = true;
      const ng = ctx.createGain(); ng.gain.value = 0.012;
      const nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2500;
      n.connect(nf).connect(ng).connect(music.out); n.start();
    }
    music.out.gain.setTargetAtTime(0.5, ctx.currentTime, 0.3);
    music.next = ctx.currentTime + 0.15;
  }
  function stopMusic() { const A = charm.audio; if (A && A.ctx && music.out) music.out.gain.setTargetAtTime(0, A.ctx.currentTime, 0.2); }
  // A lilting waltz in F: bass on one, chords on two and three, a little tune on top.
  const BEAT = 0.32;
  const prog = [[53, 57, 60], [53, 57, 60], [58, 62, 65], [58, 62, 65], [60, 64, 67], [60, 64, 67], [53, 57, 60], [48, 52, 55]];
  const tune = [72, 0, 69, 72, 74, 72, 70, 0, 67, 69, 70, 69, 67, 0, 64, 65, 67, 69, 72, 0, 77, 76, 74, 72];
  const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function scheduleMusic() {
    const A = charm.audio, ctx = A.ctx;
    while (music.next < ctx.currentTime + 0.4) {
      const t = music.next, s = music.step;
      const bar = Math.floor(s / 3) % prog.length, beat = s % 3;
      const ch = prog[bar];
      const note = (f, type, gain, dur, attack = 0.01) => {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
        o.connect(g).connect(music.out); o.start(t); o.stop(t + dur + 0.05);
      };
      if (beat === 0) note(hz(ch[0] - 12), 'sine', 0.22, BEAT * 1.4);
      else for (const n of ch) note(hz(n), 'triangle', 0.045, BEAT * 0.7, 0.005);
      const mel = tune[s % tune.length];
      if (mel) note(hz(mel), 'sine', 0.09, BEAT * 1.6, 0.008);
      music.next += BEAT;
      music.step++;
    }
  }

  // ---------------------------------------------------------------- per frame
  let time = 0, lastSwipes = 0;
  charm.update = (dt, sim2, camera) => {
    time += dt;
    const P = sim2.props;
    // Loose props.
    for (const [it, m] of propMeshes) { it.track.sample(1, m.position, m.quaternion); }
    // Apples come and go.
    const seen = new Set();
    for (const a of P.apples) {
      seen.add(a.id);
      let m = appleMeshes.get(a.id);
      if (!m) {
        m = new THREE.Mesh(appleGeo, appleMats[a.red ? 0 : 1]);
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.002, 0.018, 5), new THREE.MeshStandardMaterial({ color: 0x4a3520 }));
        stalk.position.y = 0.036; m.add(stalk);
        shadowed(m); scene.add(m); appleMeshes.set(a.id, m);
      }
      a.track.sample(1, m.position, m.quaternion);
    }
    for (const [id, m] of appleMeshes) if (!seen.has(id)) { scene.remove(m); appleMeshes.delete(id); }
    // Pendant lamp: shade, bulb, cord and the light itself follow the swinging body.
    if (pendant) { P.lamp.track.sample(1, _p, _q); placeLamp(_p, _q); }
    // Mobile.
    P.mobile.track.sample(1, _p, _q);
    placeMobile(_p, _q, dt * (6 + Math.abs(P.mobile.body.angvel().y) * 40));
    // Clock on real time.
    const now = new Date();
    const sec = now.getSeconds() + (now.getMilliseconds() > 100 ? 0 : 0), min = now.getMinutes() + sec / 60, hr = (now.getHours() % 12) + min / 60;
    clock.s.rotation.z = -sec / 60 * Math.PI * 2;
    clock.m.rotation.z = -min / 60 * Math.PI * 2;
    clock.h.rotation.z = -hr / 12 * Math.PI * 2;
    // Notes on the fridge flap when air moves near them (and lift gently in the wash).
    for (const n of notes) {
      n.pivot.getWorldPosition(_p);
      _p.y -= 0.05;
      P.airAt(_p, _a); P.inflow(_p, _a);
      const s = Math.min(3, _a.length());
      n.flap += (Math.min(1.1, s * 0.35) - n.flap) * Math.min(1, dt * 6);
      n.pivot.rotation.z = -(n.flap * (0.7 + 0.3 * Math.sin(time * (14 + s * 4) + n.phase)) + 0.02 * Math.sin(time * 0.7 + n.phase));
    }
    // Curtains: a draught through the open window, and the rotor when it's close.
    curtainU.uTime.value = time;
    const h = sim2.heli;
    if (h) curtainU.uHub.value.set(h.pos.x, h.pos.y, h.pos.z, Math.min(1, h.rotorSpeed * h.thrustFrac * 2)); else curtainU.uHub.value.w = 0;
    curtainU.uSway.value = 0.5 + 0.5 * Math.sin(time * 0.11);
    // Cat.
    animateCat(cat, P.cat, dt, time);
    if (P.cat.swipes !== lastSwipes) { lastSwipes = P.cat.swipes; if (charm.audio && charm.audio.ready && Math.random() < 0.6) meow(charm.audio, P.cat.shoulder, camera); }
    // Robin.
    animateRobin(robin, h, dt, time);
    // Radio.
    if (P.radio.on !== music.on) {
      music.on = P.radio.on;
      radio.dialMat.emissiveIntensity = music.on ? 0.9 : 0;
      if (music.on) startMusic(); else stopMusic();
    }
    if (music.on && charm.audio && charm.audio.ctx && music.out) {
      scheduleMusic();
      // Louder close by; panned by where it is on screen.
      _p.set(RADIO.x, COUNTER.top + RADIO.h / 2, RADIO.z);
      const dist = camera.position.distanceTo(_p);
      music.out.gain.setTargetAtTime(Math.min(0.6, 0.35 / Math.max(0.35, dist)), charm.audio.ctx.currentTime, 0.1);
      const px = _p.clone().project(camera).x;
      music.pan.pan.setTargetAtTime(THREE.MathUtils.clamp(px, -1, 1) * 0.7, charm.audio.ctx.currentTime, 0.1);
    }
  };
  return charm;
}

function meow(A, at, camera) {
  const pan = THREE.MathUtils.clamp(at.clone().project(camera).x, -1, 1);
  const f0 = 520 + Math.random() * 160;
  A.tone({ freq: f0, to: f0 * 1.45, type: 'sawtooth', gain: 0.025, attack: 0.04, decay: 0.32, pan });
  A.tone({ freq: f0 * 2, to: f0 * 2.6, type: 'sine', gain: 0.02, attack: 0.05, decay: 0.28, pan });
}

// Merge a group's direct mesh children (except `keep`) into one mesh per material, in the group's frame.
function mergeChildren(parent, keep = []) {
  const b = new Batcher();
  for (const o of [...parent.children]) if (o.isMesh && !keep.includes(o)) { o.updateMatrix(); b.add(o.geometry, o.material, o.matrix); parent.remove(o); }
  b.build(parent);
}

// ------------------------------------------------------------------ cat model and animation
function buildCat(scene, hi) {
  // Ginger mackerel tabby. On a sphere the texture's u runs round the body, so the stripes are drawn
  // vertically: they come down the flanks from the spine like a real tabby's, darkest along the back.
  const fur = (() => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 256;
    const x = c.getContext('2d');
    const base = x.createLinearGradient(0, 0, 0, 256);
    base.addColorStop(0, '#c9772f'); base.addColorStop(0.45, '#dd8e45'); base.addColorStop(0.72, '#e6a463'); base.addColorStop(1, '#f3dcbc');
    x.fillStyle = base; x.fillRect(0, 0, 512, 256);
    let s = 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    // Stripes: soft, wavy, broken into lengths, fading out down the flanks.
    for (let i = 0; i < 20; i++) {
      const u0 = (i + r() * 0.5) / 20 * 512, w = 5 + r() * 5, ph = r() * 6;
      let v = r() * 10;
      while (v < 190) {
        const len = 25 + r() * 45, gap = 4 + r() * 10;
        const a = 0.55 * (1 - v / 230);
        for (const off of [0, 512, -512]) {
          x.beginPath();
          for (let y = v; y <= v + len; y += 5) x.lineTo(u0 + off + Math.sin(y / 24 + ph) * 7, y);
          for (let y = v + len; y >= v; y -= 5) { const k = Math.sin(Math.PI * (y - v) / len); x.lineTo(u0 + off + Math.sin(y / 24 + ph) * 7 + w * (0.3 + 0.7 * k), y); }
          x.closePath();
          x.fillStyle = `rgba(${150 + r() * 20},${68 + r() * 15},${24 + r() * 10},${a})`;
          x.fill();
        }
        v += len + gap;
      }
    }
    x.filter = 'blur(1.5px)'; x.drawImage(c, 0, 0); x.filter = 'none';
    // Darker saddle along the spine (the top of every sphere).
    const sp = x.createLinearGradient(0, 0, 0, 60); sp.addColorStop(0, 'rgba(140,64,22,0.4)'); sp.addColorStop(1, 'rgba(140,64,22,0)');
    x.fillStyle = sp; x.fillRect(0, 0, 512, 60);
    // Fur: soft mottling and short flecks rather than long strokes (long ones read as wood grain).
    for (let i = 0; i < 3500; i++) {
      const u = r() * 512, v = r() * 256, l = 1.5 + r() * 2.5;
      x.strokeStyle = r() < 0.5 ? `rgba(255,228,190,${0.06 + r() * 0.08})` : `rgba(120,58,20,${0.05 + r() * 0.07})`;
      x.lineWidth = 1 + r() * 1.5;
      x.beginPath(); x.moveTo(u, v); x.lineTo(u + (r() - 0.5) * 1.5, v + l); x.stroke();
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.anisotropy = 4; return t;
  })();
  const plain = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { x.strokeStyle = `rgba(150,130,110,${0.05 + Math.random() * 0.08})`; const u = Math.random() * 128, v = Math.random() * 128; x.beginPath(); x.moveTo(u, v); x.lineTo(u, v + 2 + Math.random() * 4); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  })();
  const furMat = new THREE.MeshStandardMaterial({ map: fur, roughness: 0.92 });
  const softMat = new THREE.MeshStandardMaterial({ map: plain, roughness: 0.9 });
  const CREAM = 0xf6e8d2, PINK = 0xd99a94, NOSE = 0xc96f6c;
  const seg = hi ? 26 : 16;
  const sph = (r) => new THREE.SphereGeometry(r, seg, Math.round(seg * 0.7));
  const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  const g = new THREE.Group();

  // Body (local +z is where the cat faces, y up from the seat), merged: haunches with a thigh each side,
  // hind feet tucked forward, a chest that leans in, the neck, a cream bib and the still left foreleg.
  const body = new Batcher();
  body.add(sph(0.085), furMat, at(0, 0.088, -0.05, 0, 0, 0, 1.05, 0.98, 1.08));
  for (const s of [-1, 1]) {
    body.add(sph(0.062), furMat, at(s * 0.056, 0.07, -0.025, -0.35, s * 0.15, 0, 0.72, 1.0, 1.28));
    body.add(sph(0.021), furMat, at(s * 0.052, 0.012, 0.055, 0, s * 0.08, 0, 0.95, 0.55, 2.3));
    body.add(sph(0.016), softMat, at(s * 0.052, 0.01, 0.098, 0, 0, 0, 1.05, 0.6, 0.9), CREAM);
  }
  body.add(sph(0.068), furMat, at(0, 0.172, 0.035, 0.22, 0, 0, 0.98, 1.38, 0.92));
  body.add(sph(0.05), furMat, at(0, 0.252, 0.062, 0.3, 0, 0, 1.0, 1.05, 1.0));
  body.add(sph(0.046), softMat, at(0, 0.19, 0.088, 0.28, 0, 0, 0.88, 1.35, 0.55), CREAM);
  // Forelegs: bands run round the leg (u and v swapped), and the top tucks up inside the chest.
  const legGeo = new THREE.CylinderGeometry(0.0185, 0.0145, 0.16, 12, 1, true);
  { const uv = legGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * 0.35, 0.55 + uv.getX(i) * 0.35); }
  body.add(legGeo, furMat, at(-0.03, 0.09, 0.084, 0.1));
  body.add(sph(0.021), softMat, at(-0.03, 0.011, 0.112, 0, 0, 0, 1, 0.6, 1.35), CREAM);
  body.build(g);
  // The right foreleg swipes: leg and paw stay separate meshes.
  const rightLeg = new THREE.Mesh(legGeo, furMat); g.add(rightLeg);
  const rightPaw = new THREE.Mesh(sph(0.021), new THREE.MeshStandardMaterial({ map: plain, color: CREAM, roughness: 0.9 }));
  rightPaw.scale.set(1, 0.6, 1.35); g.add(rightPaw);

  // Head: a broad skull with cheek ruffs, whisker pads, chin and nose, merged; eyes and ears move.
  const head = new THREE.Group(); head.position.set(0, 0.305, 0.085); g.add(head);
  const hb = new Batcher();
  hb.add(sph(0.056), furMat, at(0, 0.004, 0, 0, 0, 0, 1.14, 0.92, 1.0));
  for (const s of [-1, 1]) {
    hb.add(sph(0.032), furMat, at(s * 0.033, -0.017, 0.016, 0, 0, s * 0.3, 1.05, 0.85, 1.0));
    hb.add(sph(0.016), softMat, at(s * 0.0125, -0.022, 0.05, 0, 0, 0, 1.05, 0.82, 0.9), CREAM);
  }
  hb.add(sph(0.013), softMat, at(0, -0.035, 0.041, 0, 0, 0, 1.1, 0.8, 1), CREAM);
  hb.add(sph(0.016), softMat, at(0, 0.0, 0.048, 0.5, 0, 0, 0.8, 0.9, 0.9), 0xe7a564);   // the bridge of the nose
  hb.add(sph(0.0072), softMat, at(0, -0.011, 0.0625, 0, 0, 0, 1.35, 0.7, 0.8), NOSE);
  hb.build(head);
  const ears = [];
  const earGeo = new THREE.ConeGeometry(0.026, 0.052, 3, 1).rotateY(Math.PI).scale(1, 1, 0.55).translate(0, 0.022, 0);
  const innerGeo = new THREE.ConeGeometry(0.017, 0.038, 3, 1).rotateY(Math.PI).scale(1, 1, 0.3).translate(0, 0.016, 0.006);
  const pinkMat = new THREE.MeshStandardMaterial({ map: plain, color: PINK, roughness: 0.8 });
  for (const s of [-1, 1]) {
    const ear = new THREE.Group(); ear.position.set(s * 0.034, 0.04, -0.004); ear.rotation.set(-0.08, s * 0.25, -s * 0.28);
    ear.add(new THREE.Mesh(earGeo, furMat), new THREE.Mesh(innerGeo, pinkMat));
    ear.userData.rest = ear.rotation.clone();
    head.add(ear); ears.push(ear);
  }
  const eyes = [];
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0xb8c24a, emissive: 0x2c3008, roughness: 0.08 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x0c0c0c });
  for (const s of [-1, 1]) {
    const e = new THREE.Group(); e.position.set(s * 0.0235, 0.006, 0.046); e.rotation.set(0, s * 0.3, s * 0.12); head.add(e);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.0125, 14, 10), eyeMat); ball.scale.set(1, 0.78, 0.55); e.add(ball);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), pupilMat); pupil.scale.set(0.35, 1.25, 0.4); pupil.position.z = 0.0062; e.add(pupil);
    eyes.push({ e, pupil });
  }
  // Whiskers: one draw for all twelve, fanned from the pads.
  const wpts = [];
  for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
    wpts.push(new THREE.Vector3(s * 0.02, -0.021 - k * 0.003, 0.055), new THREE.Vector3(s * (0.09 - k * 0.006), -0.008 - k * 0.013, 0.045 - k * 0.006));
  }
  head.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wpts), new THREE.LineBasicMaterial({ color: 0xfbf7ee, transparent: true, opacity: 0.85 })));

  // Tail: a chain of overlapping, tapering beads wrapped round the haunches to the front paws (one draw).
  const N = 18;
  const tailMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.019, 12, 8).scale(1, 1, 1.9), furMat, N);
  tailMesh.frustumCulled = false;
  g.add(tailMesh);
  const tail = Array.from({ length: N }, (_, i) => ({ i, position: new THREE.Vector3(), s: 1 - i * 0.03 }));
  g.position.set(CAT.x, BENCH.seat, CAT.z);
  g.rotation.y = CAT.yaw;
  scene.add(shadowed(g));
  return { g, head, ears, eyes, rightLeg, rightPaw, tail, tailMesh, blink: 2, earT: 3, earK: -1, earSide: 0, look: new THREE.Vector3(), lookInit: false, inv: new THREE.Matrix4() };
}

const _shoulder = new THREE.Vector3(0.03, 0.17, 0.068), _restPaw = new THREE.Vector3(0.03, 0.011, 0.112), _up = new THREE.Vector3(0, 1, 0), _fwdZ = new THREE.Vector3(0, 0, 1), _d = new THREE.Vector3();
function animateCat(cat, C, dt, time) {
  cat.g.updateMatrixWorld();
  cat.inv.copy(cat.g.matrixWorld).invert();
  // Head turns to whatever it watches (smoothly); a slow head tilt while idle.
  if (!cat.lookInit) { cat.look.copy(C.look); cat.lookInit = true; }
  cat.look.lerp(C.look, Math.min(1, dt * 5));
  const local = _v.copy(cat.look).applyMatrix4(cat.inv).sub(cat.head.position);
  const yaw = THREE.MathUtils.clamp(Math.atan2(local.x, local.z), -1.2, 1.2);
  const pitch = THREE.MathUtils.clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.6, 0.5);
  cat.head.rotation.set(pitch, yaw, Math.sin(time * 0.37) * 0.1 * (1 - C.alert));
  // Breathing.
  cat.g.scale.set(1 + Math.sin(time * 2.1) * 0.008, 1 + Math.sin(time * 2.1 + 0.4) * 0.006, 1);
  // Ears: prick forward when alert, otherwise a flick of one ear now and then.
  cat.earT -= dt;
  if (cat.earT < 0) { cat.earT = 1.5 + Math.random() * 4; cat.earK = 0; cat.earSide = Math.random() < 0.5 ? 0 : 1; }
  if (cat.earK >= 0) { cat.earK += dt * 7; if (cat.earK > 1) cat.earK = -1; }
  cat.ears.forEach((ear, i) => {
    const r = ear.userData.rest, s = i ? 1 : -1;
    const flick = i === cat.earSide && cat.earK >= 0 ? Math.sin(cat.earK * Math.PI) : 0;
    ear.rotation.set(r.x - 0.25 * C.alert - 0.35 * flick, r.y - s * 0.2 * C.alert, r.z + s * 0.5 * flick);
  });
  // Pupils widen when alert; a slow blink now and then (a cat's way of saying all is well).
  cat.blink -= dt;
  const closing = cat.blink < 0.16 && cat.blink > 0;
  if (cat.blink < 0) cat.blink = 2.5 + Math.random() * 5;
  for (const { e, pupil } of cat.eyes) { e.scale.y = closing ? 0.12 : 1 - 0.25 * (1 - C.alert); pupil.scale.x = 0.35 + 0.65 * C.alert; }
  // Right foreleg follows the paw (kinematic body in the sim).
  const paw = _a.copy(C.paw).applyMatrix4(cat.inv);
  if (C.t < 0) paw.copy(_restPaw);
  cat.rightPaw.position.copy(paw);
  cat.rightLeg.position.copy(_shoulder).add(paw).multiplyScalar(0.5);
  cat.rightLeg.quaternion.setFromUnitVectors(_up, _d.copy(paw).sub(_shoulder).normalize());
  cat.rightLeg.scale.set(1, Math.max(0.6, _shoulder.distanceTo(paw) / 0.16), 1);
  // Tail: lies round the haunches to the front paws; the end lifts and flicks, and lashes when excited.
  const swish = Math.sin(time * (1.1 + 3 * C.alert)) * (0.12 + 0.35 * C.alert);
  const n = cat.tail.length;
  cat.tail.forEach((m, i) => {
    const t = i / (n - 1);
    const tip = Math.max(0, (t - 0.6) / 0.4);
    const a = Math.PI - t * (Math.PI - 0.5) + swish * tip;
    const r = 0.118 - 0.012 * t;
    const lift = tip * tip * (0.025 + 0.05 * C.alert) * (0.6 + 0.4 * Math.sin(time * 1.7 + t * 3));
    m.position.set(Math.sin(a) * r, 0.016 + lift, -0.03 + Math.cos(a) * r);
  });
  // Each bead is stretched along the tail so neighbours blend into one smooth length.
  cat.tail.forEach((m, i) => {
    const p0 = cat.tail[Math.max(0, i - 1)].position, p1 = cat.tail[Math.min(n - 1, i + 1)].position;
    _q.setFromUnitVectors(_fwdZ, _d.subVectors(p1, p0).normalize());
    _m.compose(m.position, _q, _v.setScalar(m.s));
    cat.tailMesh.setMatrixAt(m.i, _m);
  });
  cat.tailMesh.instanceMatrix.needsUpdate = true;
}

// ------------------------------------------------------------------ robin
function buildRobin(scene) {
  // A European robin: plump olive-brown body, orange face and breast edged in blue-grey, buff belly, thin
  // dark legs gripping the rim, a bright eye. Head and wings move; the rest is one merged mesh.
  const mat = (c, r = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const BROWN = mat(0x75603f), ORANGE = mat(0xd9652a, 0.7), GREY = mat(0x9aa1a3), BUFF = mat(0xece0c8, 0.85), DARK = mat(0x2a2420, 0.5);
  const g = new THREE.Group();
  const add = (geo, m, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, parent = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.scale.set(sx, sy, sz); parent.add(o); return o; };
  const S = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
  add(S(0.03), BROWN, 0, 0.032, -0.006, -0.25, 0, 0, 0.9, 0.95, 1.3);           // back and mantle
  add(S(0.028), BUFF, 0, 0.024, 0.008, 0, 0, 0, 0.88, 0.85, 1.05);               // belly
  add(S(0.026), GREY, 0, 0.042, 0.018, 0.2, 0, 0, 0.95, 1.0, 0.95);              // grey edging behind the orange
  add(S(0.025), ORANGE, 0, 0.04, 0.024, 0.25, 0, 0, 0.92, 1.0, 0.9);             // breast
  add(new THREE.ConeGeometry(0.012, 0.042, 4), BROWN, 0, 0.026, -0.05, -Math.PI / 2 + 0.45, Math.PI / 4, 0, 1, 1, 0.3);  // tail
  for (const s of [-1, 1]) {                                                       // legs and toes
    add(new THREE.CylinderGeometry(0.0013, 0.0013, 0.026, 5), DARK, s * 0.009, 0.0, 0.004, 0.2);
    add(new THREE.BoxGeometry(0.0022, 0.0018, 0.014), DARK, s * 0.009, -0.012, 0.01);
  }
  const head = new THREE.Group(); head.position.set(0, 0.062, 0.022); g.add(head);
  add(S(0.02), BROWN, 0, 0.002, 0, 0, 0, 0, 1, 0.95, 1.05, head);
  add(S(0.0165), ORANGE, 0, -0.004, 0.009, 0, 0, 0, 0.95, 0.9, 0.8, head);       // orange face
  add(new THREE.ConeGeometry(0.0035, 0.013, 6), DARK, 0, -0.002, 0.024, Math.PI / 2, 0, 0, 1, 1, 0.8, head);
  for (const s of [-1, 1]) {
    add(S(0.0042, 8, 6), mat(0x0d0b0a, 0.1), s * 0.011, 0.004, 0.012, 0, 0, 0, 1, 1, 1, head);
    add(S(0.0012, 6, 4), mat(0xffffff, 0.2), s * 0.0118, 0.0055, 0.0153, 0, 0, 0, 1, 1, 1, head);
  }
  mergeChildren(head);
  const wings = [];
  for (const s of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(s * 0.022, 0.046, 0.006); g.add(w);
    add(S(0.022, 12, 8), mat(0x6a5537), s * 0.001, -0.01, -0.02, -0.3, 0, 0, 0.22, 0.62, 1.3, w);
    wings.push(w);
  }
  mergeChildren(g, [head, ...wings]);
  const a = 2.2, B = BIRDBATH;
  const perch = new THREE.Vector3(B.x + Math.cos(a) * (B.r - 0.01), B.top + 0.012, B.z + Math.sin(a) * (B.r - 0.01));
  g.position.copy(perch);
  g.rotation.y = -a + Math.PI / 2;
  scene.add(shadowed(g, true, false));
  return { g, head, wings, perch, away: new THREE.Vector3(B.x - 0.8, HEDGE.top + 0.05, HEDGE.z1 - 0.1), state: 'perched', t: 0, hop: 0, bob: 0, look: 0 };
}

function animateRobin(r, heli, dt, time) {
  const near = heli ? heli.pos.distanceTo(r.perch) : 9;
  r.t += dt;
  if (r.state === 'perched') {
    // Quick head turns, a cocked head, and the robin's bob and tail flick every so often.
    r.hop -= dt;
    if (r.hop < 0) { r.hop = 0.5 + Math.random() * 1.8; r.look = (Math.random() - 0.5) * 1.6; if (Math.random() < 0.4) r.bob = 1; }
    r.head.rotation.y += (r.look - r.head.rotation.y) * Math.min(1, dt * 18);
    r.head.rotation.z = Math.sin(time * 0.9) * 0.15;
    r.bob = Math.max(0, r.bob - dt * 4);
    const b = Math.sin(r.bob * Math.PI);
    r.g.rotation.x = b * 0.35;
    r.g.position.y = r.perch.y - b * 0.004;
    if (near < 0.9) { r.state = 'flying'; r.t = 0; r.from = r.g.position.clone(); r.to = r.away; r.g.rotation.x = 0; }
  } else if (r.state === 'flying' || r.state === 'returning') {
    const k = Math.min(1, r.t / 1.6);
    r.g.position.lerpVectors(r.from, r.to, k).add(new THREE.Vector3(0, Math.sin(k * Math.PI) * 0.35, 0));
    r.g.lookAt(r.to.x, r.g.position.y, r.to.z);
    for (const [i, w] of r.wings.entries()) w.rotation.z = (i ? -1 : 1) * (0.9 + Math.sin(time * 55) * 0.8);
    if (k >= 1) { r.state = r.state === 'flying' ? 'away' : 'perched'; r.t = 0; for (const w of r.wings) w.rotation.z = 0; if (r.state === 'perched') r.g.rotation.set(0, -2.2 + Math.PI / 2, 0); }
  } else if (r.state === 'away') {
    if (r.t > 10 && near > 1.6) { r.state = 'returning'; r.t = 0; r.from = r.g.position.clone(); r.to = r.perch; }
  }
}

// ------------------------------------------------------------------ toy-plane mobile
function buildMobile(scene) {
  const group = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xb08050, roughness: 0.6 });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, MOBILE.arm * 2, 8), wood); bar.rotation.z = Math.PI / 2; group.add(bar);
  const threadMat = new THREE.MeshBasicMaterial({ color: 0xeeeeee });
  const props = [];
  [[0xc0392b, 0xf4d03f], [0x2e86c1, 0xf5f5f5]].forEach(([c1, c2], i) => {
    const s = i ? 1 : -1;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.0006, 0.0006, 0.08 * MOBILE.scale, 4), threadMat); string.position.set(s * MOBILE.arm, -0.045 * MOBILE.scale, 0); group.add(string);
    const p = new THREE.Group(); p.position.set(s * MOBILE.arm, -0.09 * MOBILE.scale, 0); p.rotation.y = s * 0.6; p.scale.setScalar(MOBILE.scale); group.add(p);
    const m1 = new THREE.MeshStandardMaterial({ color: c1, roughness: 0.5 }), m2 = new THREE.MeshStandardMaterial({ color: c2, roughness: 0.5 });
    const fus = new THREE.Mesh(new THREE.CapsuleGeometry(0.009, 0.05, 4, 8), m1); fus.rotation.x = Math.PI / 2; p.add(fus);
    for (const y of [-0.006, 0.012]) { const wing = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.003, 0.018), m2); wing.position.set(0, y, 0.01); p.add(wing); }
    for (const x of [-0.03, 0.03]) { const strut = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.018, 0.002), m1); strut.position.set(x, 0.003, 0.01); p.add(strut); }
    const tailp = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.002, 0.01), m2); tailp.position.set(0, 0, -0.032); p.add(tailp);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.014, 0.01), m1); fin.position.set(0, 0.007, -0.032); p.add(fin);
    mergeChildren(p);
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.003, 0.002), new THREE.MeshStandardMaterial({ color: 0x3b2a1a })); prop.position.set(0, 0, 0.036); p.add(prop);
    props.push(prop);
  });
  scene.add(shadowed(group, true, false));
  const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.0008, 0.0008, 1, 4), threadMat);
  scene.add(thread);
  void SPOON;
  return { group, thread, props };
}
