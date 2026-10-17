import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CHAIRS, TABLE, ROOM, PAD, STATION, CUPS, DISCARD, TEAPOT, SUGAR, VASE, JUG, PLATE, BOOKS } from '../sim/layout.js';
import * as TX from './textures.js';
import { buildGarden } from './garden.js';
import { TableCloth } from './cloth.js';
import { cupModel, glazeMaterial, vesselGeometry, saucerGeometry, handleGeometry } from './models.js';
import { batchStaticMeshes } from './sceneWork.js';

const V2 = (x, y) => new THREE.Vector2(x, y);

function shadowed(m, cast = true, receive = true) {
  m.traverse((o) => { if (o.isMesh) { o.castShadow = cast; o.receiveShadow = receive; } });
  return m;
}

export function buildKitchen(scene, renderer, quality, progress, sim) {
  const out = { cups: [], sun: null, lamp: null, animated: [] };
  // Lighting: soft morning daylight through the window behind the table, a warm pendant and a room env map.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.42;
  scene.background = new THREE.Color(0xe9dcc5);
  scene.fog = new THREE.Fog(0xe9dcc5, 3.2, 7.5);

  const hemi = new THREE.HemisphereLight(0xe6eefa, 0x8c7650, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
  sun.position.set(-0.9, 1.9, -1.6);
  sun.target.position.set(0, 0, 0.05);
  sun.castShadow = quality.shadows > 0;
  sun.shadow.mapSize.set(quality.shadows || 512, quality.shadows || 512);
  const sc = sun.shadow.camera;
  sc.left = -1.05; sc.right = 1.05; sc.top = 0.85; sc.bottom = -0.85; sc.near = 0.5; sc.far = 4.5;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.0012;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  out.sun = sun;
  const lamp = new THREE.PointLight(0xffc68a, 0.9, 2.6, 1.6);
  lamp.position.set(0.05, 0.9, 0.05);
  scene.add(lamp);
  out.lamp = lamp;
  progress?.('Lighting the kitchen');

  // Table: oak planks, chamfered edge, legs.
  const wood = TX.woodTextures(quality.textureSize);
  const woodMat = new THREE.MeshStandardMaterial({ map: wood.map, roughnessMap: wood.roughnessMap, roughness: 1.0, metalness: 0, envMapIntensity: 0.7 });
  {
    const top = new THREE.Mesh(new THREE.BoxGeometry(TABLE.halfX * 2, TABLE.thickness, TABLE.halfZ * 2), woodMat);
    top.position.y = -TABLE.thickness / 2;
    top.receiveShadow = true; top.castShadow = true;
    scene.add(top);
    const darkWood = woodMat.clone();
    darkWood.color = new THREE.Color(0x8a6a50);
    const apron = new THREE.Mesh(new THREE.BoxGeometry(TABLE.halfX * 2 - 0.12, 0.08, TABLE.halfZ * 2 - 0.12), darkWood);
    apron.position.y = -TABLE.thickness - 0.04;
    scene.add(shadowed(apron));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.022, TABLE.height - TABLE.thickness, 16), darkWood);
      leg.position.set(sx * (TABLE.halfX - 0.08), -TABLE.height / 2 - TABLE.thickness / 2, sz * (TABLE.halfZ - 0.08));
      scene.add(shadowed(leg));
    }
  }
  // Linen runner along the table, hanging over both ends: a light cloth that lies under whatever stands
  // on it and lifts and rolls in the rotor's outwash (see cloth.js).
  out.cloth = new TableCloth(scene, quality, TX.linenTexture());
  progress?.('Laying the table');

  // Room: tiled floor and ceiling (walls, window and door are in the house shell, see garden.js).
  {
    const plaster = new THREE.MeshStandardMaterial({ map: TX.plasterTexture(), roughness: 0.95 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ), new THREE.MeshStandardMaterial({ map: TX.floorTexture(), roughness: 0.8 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, ROOM.floorY, (ROOM.maxZ + ROOM.minZ) / 2);
    floor.receiveShadow = true;
    scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.maxX - ROOM.minX, ROOM.maxZ - ROOM.minZ), plaster);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(0, ROOM.ceilingY, (ROOM.maxZ + ROOM.minZ) / 2);
    scene.add(ceil);

    // Pot plant on the windowsill.
    const winY = 0.62, winH = 1.05;
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.045, 0.1, 20), glazeMaterial(0xb7664a, { roughness: 0.6 }));
    pot.position.set(-0.75, winY - winH / 2 + 0.005, ROOM.minZ + 0.07);
    scene.add(shadowed(pot));
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x4f7a43, roughness: 0.7, side: THREE.DoubleSide });
    const leaves = [];
    for (let i = 0; i < 9; i++) {
      const leaf = new THREE.Object3D();
      leaf.scale.set(0.35, 1.0, 0.12);
      const a = i / 9 * Math.PI * 2;
      leaf.position.set(pot.position.x + Math.cos(a) * 0.03, pot.position.y + 0.11, pot.position.z + Math.sin(a) * 0.03);
      leaf.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5);
      leaf.updateMatrix();
      leaves.push(new THREE.SphereGeometry(0.05, 8, 6).applyMatrix4(leaf.matrix));
    }
    scene.add(new THREE.Mesh(mergeGeometries(leaves, false), leafMat)); // nine leaves, one draw call

    // Counter, cabinets and shelf along the right-hand wall (soft background shapes).
    const cab = new THREE.MeshStandardMaterial({ color: 0x8fa79a, roughness: 0.55 });
    const counterTop = new THREE.MeshStandardMaterial({ color: 0xe8e0d0, roughness: 0.35 });
    const lower = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.86, 2.4), cab);
    lower.position.set(ROOM.maxX - 0.31, ROOM.floorY + 0.43, 0.2);
    scene.add(shadowed(lower));
    const ct = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.04, 2.44), counterTop);
    ct.position.set(ROOM.maxX - 0.33, ROOM.floorY + 0.88, 0.2);
    scene.add(shadowed(ct));
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.6, 2.4), cab);
    upper.position.set(ROOM.maxX - 0.18, 1.2, 0.2);
    scene.add(shadowed(upper));
    const tiles = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.54), new THREE.MeshStandardMaterial({ map: TX.tileTexture(), roughness: 0.25 }));
    tiles.rotation.y = -Math.PI / 2;
    tiles.position.set(ROOM.maxX - 0.002, ROOM.floorY + 1.17, 0.2);
    scene.add(tiles);
    // kettle on the counter
    const kettle = new THREE.Mesh(vesselGeometry({ rOutBottom: 0.09, rOut: 0.06, rIn: 0.055, rInBottom: 0.08, height: 0.2, bottom: 0.01, belly: 0.01 }),
      new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 1, roughness: 0.18 }));
    kettle.position.set(ROOM.maxX - 0.32, ROOM.floorY + 0.9, -0.35);
    scene.add(shadowed(kettle));
    // pendant lamp over the table
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.14, 32, 1, true), new THREE.MeshStandardMaterial({ color: 0x2f4a44, roughness: 0.5, side: THREE.DoubleSide }));
    shade.position.set(0.05, 1.05, 0.05);
    scene.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.04, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false }));
    bulb.position.set(0.05, 0.99, 0.05);
    scene.add(bulb);
    const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, ROOM.ceilingY - 1.1, 6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    cord.position.set(0.05, (ROOM.ceilingY + 1.1) / 2, 0.05);
    scene.add(cord);
    out.pendant = { shade, bulb, cord }; // it swings: see charm.js
    // Windsor chairs: oak seat, turned splayed legs, spindle back with a bent top rail.
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x8a5f40, map: wood.map, roughness: 0.6 });
    const turned = (() => {
      const p = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12; p.push(V2(0.011 + 0.005 * Math.sin(t * Math.PI) + (t > 0.82 && t < 0.9 ? 0.003 : 0), t * 0.47)); }
      return new THREE.LatheGeometry(p, 10);
    })();
    for (const [x, z, yaw] of CHAIRS) {
      const c = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.2, 0.035, 32), chairMat);
      seat.scale.set(1, 1, 0.95);
      seat.position.y = -0.3;
      c.add(seat);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const l = new THREE.Mesh(turned, chairMat);
        l.position.set(sx * 0.15, -0.76, sz * 0.14);
        l.rotation.set(-sz * 0.08, 0, sx * 0.08);
        c.add(l);
      }
      for (const sz of [-1, 1]) {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.32, 8), chairMat);
        st.rotation.z = Math.PI / 2; st.position.set(0, -0.6, sz * 0.15);
        c.add(st);
      }
      for (let k = -3; k <= 3; k++) {
        const a = k * 0.17;
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(k % 3 === 0 ? 0.011 : 0.0065, k % 3 === 0 ? 0.012 : 0.0065, 0.44, 8), chairMat);
        sp.position.set(Math.sin(a) * 0.17, -0.06, 0.06 + Math.cos(a) * 0.12);
        sp.rotation.x = 0.12;
        c.add(sp);
      }
      // Bent top rail over the spindles (the collider in house.js follows the same arc).
      const railPts = [];
      for (let k = -4; k <= 4; k++) { const a = k * 0.13; railPts.push(new THREE.Vector3(Math.sin(a) * 0.19, 0.17, 0.03 + Math.cos(a) * 0.14)); }
      const rail = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPts), 24, 0.016, 8, false), chairMat);
      c.add(rail);
      c.position.set(x, 0, z);
      c.rotation.y = yaw;
      scene.add(shadowed(c));
    }
  }
  progress?.('Hanging the curtains');

  // Launch pad: cork coaster with painted H.
  {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(PAD.radius, PAD.radius, PAD.height, 48), [
      new THREE.MeshStandardMaterial({ color: 0xa47a4c, roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ map: TX.corkTexture(), roughness: 0.95 }),
      new THREE.MeshStandardMaterial({ color: 0xa47a4c, roughness: 0.95 }),
    ]);
    pad.position.set(PAD.x, PAD.height / 2, PAD.z);
    scene.add(shadowed(pad, false, true));
  }

  // Tea stands: the kitchen's, and the garden table's (built with the garden).
  const teaStand = (S) => buildTeaStand(S, wood);
  scene.add(shadowed(teaStand(STATION)));

  // Cups.
  for (const C of CUPS) {
    const m = cupModel(C);
    scene.add(m);
    out.cups.push(m);
  }

  // Discard saucer with a dark rim line.
  {
    const s = new THREE.Mesh(saucerGeometry(DISCARD.radius, DISCARD.rimHeight), glazeMaterial(0xe9e2d4));
    s.position.set(DISCARD.x, 0, DISCARD.z);
    scene.add(shadowed(s));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(DISCARD.radius - 0.008, 0.0014, 6, 64), glazeMaterial(0x7b4a33));
    ring.rotation.x = Math.PI / 2;
    ring.position.set(DISCARD.x, DISCARD.rimHeight * 0.85, DISCARD.z);
    scene.add(ring);
  }

  // Brown Betty teapot.
  {
    const T = TEAPOT;
    const g = new THREE.Group();
    const potMat = glazeMaterial(0x5a2e1a, { roughness: 0.14 });
    const prof = [];
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const r = T.bodyR * (0.72 + 0.28 * Math.sin(Math.PI * (0.15 + 0.75 * t)));
      prof.push(V2(i === 0 ? 0.0001 : r, t * T.bodyH));
    }
    prof.push(V2(T.bodyR * 0.6, T.bodyH + 0.004));
    prof.push(V2(0.0001, T.bodyH + 0.004));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 48), potMat);
    g.add(body);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(T.bodyR * 0.6, 32, 12, 0, Math.PI * 2, 0, Math.PI * 0.32), potMat);
    lid.position.y = T.bodyH - 0.035;
    g.add(lid);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.013, 16, 12), potMat);
    knob.position.y = T.knobY;
    g.add(knob);
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(T.bodyR * 0.8, 0.045, 0), new THREE.Vector3(T.bodyR + 0.03, 0.07, 0), new THREE.Vector3(T.bodyR + 0.055, 0.12, 0), new THREE.Vector3(T.bodyR + 0.07, 0.15, 0)]);
    const spout = new THREE.Mesh(new THREE.TubeGeometry(curve, 20, 0.012, 12, false), potMat);
    g.add(spout);
    const handle = new THREE.Mesh(handleGeometry(0.045, 0.008, Math.PI * 1.15), potMat);
    handle.position.set(-T.bodyR - 0.005, 0.085, 0);
    handle.rotation.y = Math.PI;
    g.add(handle);
    g.rotation.y = T.spoutYaw;
    g.position.set(T.x, 0, T.z);
    scene.add(shadowed(g));
    out.teapot = g;
  }

  // Sugar bowl with lid and cubes peeking out.
  {
    const g = new THREE.Group();
    const mat = glazeMaterial(0xe8d9b5);
    const bowl = new THREE.Mesh(vesselGeometry({ rOutBottom: SUGAR.r * 0.75, rOut: SUGAR.r, rIn: SUGAR.r - 0.004, rInBottom: SUGAR.r * 0.7, height: SUGAR.h, bottom: 0.006, belly: 0.004 }), mat);
    g.add(bowl);
    const lid = new THREE.Mesh(new THREE.SphereGeometry(SUGAR.r * 1.02, 32, 10, 0, Math.PI * 2, 0, Math.PI * 0.3), mat);
    lid.position.y = SUGAR.h - SUGAR.r * 0.6;
    g.add(lid);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), glazeMaterial(0x3f6aa6));
    knob.position.y = SUGAR.h + SUGAR.lidH - 0.004;
    g.add(knob);
    g.position.set(SUGAR.x, 0, SUGAR.z);
    scene.add(shadowed(g));
  }

  // Bud vase with three stems.
  {
    const g = new THREE.Group();
    // Ultra refracts through the glass (a transmission pass: the whole opaque scene drawn again at full
    // resolution whenever the vase is on screen). Other tiers tint what is behind it by the glass colour
    // and add the reflections on top, which reads the same at this size for one draw call.
    let glass;
    if (quality.transmission) glass = new THREE.MeshPhysicalMaterial({ color: 0xbfd8d0, roughness: 0.05, transmission: 0.9, thickness: 0.01, ior: 1.45 });
    else {
      const tint = new THREE.Color(0xbfd8d0);
      glass = new THREE.MeshPhysicalMaterial({ color: tint.clone().multiplyScalar(0.1), roughness: 0.05, ior: 1.45, transparent: true,
        blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.ConstantColorFactor });
      glass.blendColor.copy(tint).multiplyScalar(0.9);
    }
    const vase = new THREE.Mesh(vesselGeometry({ rOutBottom: VASE.r, rOut: VASE.r * 0.55, rIn: VASE.r * 0.45, rInBottom: VASE.r * 0.85, height: VASE.h, bottom: 0.008, belly: 0.006 }), glass);
    g.add(vase);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x4d7a3a, roughness: 0.6, side: THREE.DoubleSide });
    const petal = [0xf2b6c6, 0xf6d36b, 0xf3efe8];
    // Water a little over half way up, so the glass reads as a vase with the stems standing in it.
    const water = new THREE.Mesh(new THREE.CircleGeometry(VASE.r * 0.66, 24).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xd6e8e2, roughness: 0.05, transparent: true, opacity: 0.4, depthWrite: false }));
    water.position.y = VASE.h * 0.5;
    g.add(water);
    // Stems run down into the water; two leaves each. All one mesh.
    const leafShape = new THREE.Shape();
    leafShape.moveTo(0, 0); leafShape.quadraticCurveTo(0.009, 0.012, 0, 0.03); leafShape.quadraticCurveTo(-0.009, 0.012, 0, 0);
    const leafGeo = new THREE.ShapeGeometry(leafShape, 4);
    const stemGeos = [];
    // Petals: eight slender ellipses round the disc, tipped up a little (cosmos and daisies).
    const petalShape = new THREE.Shape();
    petalShape.absellipse(0, 0.0115, 0.0042, 0.0105, 0, Math.PI * 2, false);
    const petalGeo = new THREE.ShapeGeometry(petalShape, 6).rotateX(-Math.PI / 2 + 0.25);
    VASE.stems.forEach((st, i) => {
      const a = new THREE.Vector3(st[0], VASE.h - 0.02, st[1]);
      const b = new THREE.Vector3(st[0] + st[3], st[2], st[1] + st[4]);
      const mid = a.clone().lerp(b, 0.5).add(new THREE.Vector3(0.01, 0, 0.005));
      const foot = new THREE.Vector3(st[0] * 0.4, 0.014, st[1] * 0.4);
      const curve = new THREE.CatmullRomCurve3([foot, a, mid, b]);
      stemGeos.push(new THREE.TubeGeometry(curve, 16, 0.0022, 5, false));
      for (const [t, side] of [[0.5, 1], [0.66, -1]]) {
        const p = curve.getPoint(t), tan = curve.getTangent(t);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan)
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), i * 2 + side))
          .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), side * 0.7));
        stemGeos.push(leafGeo.clone().applyMatrix4(new THREE.Matrix4().compose(p, q, new THREE.Vector3(1, 1, 1))));
      }
      const head = new THREE.Group();
      const pm = new THREE.MeshStandardMaterial({ color: petal[i], roughness: 0.6, side: THREE.DoubleSide });
      // Petals merged into one mesh (they nod together; one draw call per pass).
      const petals = [];
      for (let k = 0; k < 8; k++) petals.push(petalGeo.clone().rotateY(k / 8 * Math.PI * 2 + i));
      head.add(new THREE.Mesh(mergeGeometries(petals, false), pm));
      const centre = new THREE.Mesh(new THREE.SphereGeometry(0.0055, 10, 8).scale(1, 0.6, 1), new THREE.MeshStandardMaterial({ color: 0xc98a1b, roughness: 0.8 }));
      centre.position.y = 0.002;
      head.add(centre);
      head.position.copy(b).add(new THREE.Vector3(0, 0.004, 0));
      head.rotation.set(0.3 * (i - 1), i, 0.2);
      g.add(head);
      out.animated.push({ obj: head, base: head.rotation.clone(), phase: i * 1.7 });
    });
    g.add(new THREE.Mesh(mergeGeometries(stemGeos.map((x) => { for (const k of Object.keys(x.attributes)) if (!['position', 'normal', 'uv'].includes(k)) x.deleteAttribute(k); return x.index ? x.toNonIndexed() : x; }), false), stemMat));
    g.position.set(VASE.x, 0, VASE.z);
    scene.add(shadowed(g));
  }

  // Milk jug.
  {
    const j = new THREE.Mesh(vesselGeometry({ rOutBottom: JUG.r, rOut: JUG.r * 0.8, rIn: JUG.r * 0.72, rInBottom: JUG.r * 0.9, height: JUG.h, bottom: 0.008, belly: 0.006 }), glazeMaterial(0xf2ece0));
    j.position.set(JUG.x, 0, JUG.z);
    scene.add(shadowed(j));
    const milk = new THREE.Mesh(new THREE.CircleGeometry(JUG.r * 0.78, 24), new THREE.MeshStandardMaterial({ color: 0xfbf8f0, roughness: 0.3 }));
    milk.rotation.x = -Math.PI / 2;
    milk.position.set(JUG.x, JUG.h * 0.8, JUG.z);
    scene.add(milk);
    const h = new THREE.Mesh(handleGeometry(0.022, 0.0045), glazeMaterial(0xf2ece0));
    h.position.set(JUG.x - JUG.r * 0.95, JUG.h * 0.55, JUG.z);
    h.rotation.y = Math.PI;
    scene.add(shadowed(h));
  }

  // Plate of biscuits.
  {
    const p = new THREE.Mesh(saucerGeometry(PLATE.r, PLATE.h), glazeMaterial(0xf4efe5));
    p.position.set(PLATE.x, 0, PLATE.z);
    scene.add(shadowed(p));
    const bis = new THREE.MeshStandardMaterial({ color: 0xcf9a55, roughness: 0.85 });
    for (let i = 0; i < (quality.liteProps ? 4 : 2); i++) { // the top two are loose (see props.js) unless props are lite
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.006, 24), bis);
      b.position.set(PLATE.x - 0.025 + i * 0.016, PLATE.h * 0.6 + 0.004 + i * 0.0035, PLATE.z + (i % 2 ? 0.01 : -0.01));
      b.rotation.set(0.15 * (i % 2 ? 1 : -1), 0, 0.12);
      scene.add(shadowed(b));
    }
  }

  // Stack of books with a pair of reading glasses.
  {
    let y = 0;
    const cols = [0x7a3b2e, 0x2f5866, 0xc9a24a];
    BOOKS.books.forEach(([hx, hh, hz, yaw], i) => {
      const g = new THREE.Group();
      const cover = new THREE.Mesh(new THREE.BoxGeometry(hx * 2, hh, hz * 2), new THREE.MeshStandardMaterial({ color: cols[i], roughness: 0.7 }));
      g.add(cover);
      const pages = new THREE.Mesh(new THREE.BoxGeometry(hx * 2 - 0.006, hh - 0.004, hz * 2 + 0.0005), new THREE.MeshStandardMaterial({ color: 0xf1e8d4, roughness: 0.9 }));
      pages.position.x = 0.004;
      g.add(pages);
      g.position.set(BOOKS.x, y + hh / 2, BOOKS.z);
      g.rotation.y = yaw;
      y += hh;
      scene.add(shadowed(g));
    });
  }

  // (The teaspoon is loose: see props.js and charm.js.)
  progress?.('Setting out the china');
  out.batching = batchStaticMeshes(scene, new Set([
    out.cloth.mesh, ...out.cups, ...Object.values(out.pendant), ...out.animated.map((a) => a.obj),
  ]));
  out.garden = buildGarden(scene, quality, out, teaStand, sim);
  return out;
}

// Tea stand: oak base, two posts, crossbar and brass pegs.
function buildTeaStand(S, wood) {
  const g = new THREE.Group();
  const standWood = new THREE.MeshStandardMaterial({ color: 0x9a6a42, roughness: 0.55, map: wood.map });
  const base = new THREE.Mesh(new THREE.BoxGeometry(S.baseHalf[0] * 2, S.baseHalf[1] * 2, S.baseHalf[2] * 2), standWood);
  base.position.set(0, S.baseHalf[1], 0);
  g.add(base);
  for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(S.postHalf, S.postHalf * 1.15, S.postHeight, 16), standWood);
    post.position.set(sx * S.postX, S.postHeight / 2, 0);
    g.add(post);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(S.postHalf * 1.5, 16, 12), standWood);
    knob.position.set(sx * S.postX, S.postHeight + 0.004, 0);
    g.add(knob);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(S.barHalf, S.barHalf, S.postX * 2, 16), standWood);
  bar.rotation.z = Math.PI / 2;
  bar.position.y = S.barY;
  g.add(bar);
  const brass = new THREE.MeshStandardMaterial({ color: 0xd4a548, roughness: 0.28, metalness: 1 });
  for (const px of S.pegXs) {
    const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.0018, 0.0022, S.pegReach, 10), brass);
    peg.rotation.x = Math.PI / 2;
    peg.position.set(px, S.pegY, S.pegReach / 2);
    g.add(peg);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0034, 12, 8), brass);
    tip.position.set(px, S.pegY + 0.002, S.pegReach);
    g.add(tip);
  }
  // little sign
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe4cf'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#7a3b26'; ctx.font = 'bold 34px Georgia, serif'; ctx.textAlign = 'center'; ctx.fillText('TEA BAGS', 128, 45);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.025), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }));
  sign.position.set(0, S.baseHalf[1] * 2 + 0.0002, 0.02);
  sign.rotation.x = -Math.PI / 2;
  g.add(sign);
  g.position.set(S.x, S.y, S.z);
  return g;
}
