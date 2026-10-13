import * as THREE from 'three';
import { ROOM, WALL_T, BACKDOOR, WINDOW, SILL } from '../sim/layout.js';
import { backWallPieces, sashes, doorLeaf } from '../sim/house.js';
import * as TX from './textures.js';
import { brickTexture, roofTexture } from './gardenTextures.js';
import { Batcher, T, boxUV, planeUV } from './batch.js';

// The kitchen's walls as solid brick with plaster inside, the open back door and casement window, and
// the roof seen from the garden.
export function buildHouseShell(scene, quality) {
  const b = new Batcher();
  const fy = ROOM.floorY, cy = ROOM.ceilingY;
  const plasterTex = TX.plasterTexture();
  plasterTex.repeat.set(1 / 1.6, 1 / 1.23);
  const plaster = new THREE.MeshStandardMaterial({ map: plasterTex, roughness: 0.95 });
  const brickTex = brickTexture(quality.textureSize >= 2048 ? 1024 : 512);
  brickTex.repeat.set(1 / 0.9, 1 / 0.9);
  const brick = new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.92 });
  const paint = new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.55 });
  const doorPaint = new THREE.MeshStandardMaterial({ color: 0x6f8f7a, roughness: 0.5 });
  const stone = new THREE.MeshStandardMaterial({ color: 0xcfc6b4, roughness: 0.85 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xdfeeea, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.18, envMapIntensity: 1.4, depthWrite: false, side: THREE.DoubleSide });
  const roofTex = roofTexture();
  roofTex.repeat.set(1 / 0.9, 1 / 0.9);
  const roof = new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x2c2f31, roughness: 0.5, metalness: 0.3 });

  const wallH = 2.6, top = fy + wallH - 0.05;
  const zi = ROOM.minZ, zo = ROOM.minZ - WALL_T, zm = (zi + zo) / 2;
  // Back wall pieces: brick volume, plaster skin on the room side.
  for (const [x0, x1, y0, y1] of backWallPieces()) {
    const w = x1 - x0, h = y1 - y0;
    b.add(boxUV(w, h, WALL_T - 0.002, 1), brick, T((x0 + x1) / 2, (y0 + y1) / 2, zm));
    const yy0 = Math.max(y0, fy), yy1 = Math.min(y1, cy);
    const ix0 = Math.max(x0, ROOM.minX), ix1 = Math.min(x1, ROOM.maxX);
    if (yy1 > yy0 && ix1 > ix0) b.add(planeUV(ix1 - ix0, yy1 - yy0, 1), plaster, T((ix0 + ix1) / 2, (yy0 + yy1) / 2, zi + 0.0005), 0xffffff, { cast: false });
  }
  // Side and front walls: brick outside (the room side keeps its plaster planes).
  const hz = ROOM.maxZ - ROOM.minZ + 2 * WALL_T, czz = (ROOM.maxZ + ROOM.minZ) / 2;
  for (const sx of [-1, 1]) {
    const x = sx > 0 ? ROOM.maxX + WALL_T / 2 : ROOM.minX - WALL_T / 2;
    b.add(boxUV(WALL_T, wallH, hz, 1), brick, T(x, fy + wallH / 2 - 0.05, czz), 0xffffff, { cast: false });
  }
  for (const sx of [-1, 1]) {
    const x = sx > 0 ? ROOM.maxX : ROOM.minX;
    b.add(planeUV(ROOM.maxZ - ROOM.minZ, cy - fy, 1), plaster, T(x, (cy + fy) / 2, czz, -sx * Math.PI / 2), 0xffffff, { cast: false });
  }
  b.add(planeUV(ROOM.maxX - ROOM.minX, cy - fy, 1), plaster, T(0, (cy + fy) / 2, ROOM.maxZ, Math.PI), 0xffffff, { cast: false });

  // Window: architraves inside and out, a full-depth mullion and transom, sill inside, stone sill outside.
  const W = WINDOW, wx0 = W.x - W.w / 2, wx1 = W.x + W.w / 2, wy0 = W.y - W.h / 2, wy1 = W.y + W.h / 2;
  for (const z of [zi + 0.012, zo - 0.012]) {
    b.add(new THREE.BoxGeometry(W.w + 0.1, W.bar, 0.024), paint, T(W.x, wy1 + W.bar / 2, z));
    b.add(new THREE.BoxGeometry(0.05, W.h + 2 * W.bar, 0.024), paint, T(wx0 - 0.025, W.y, z));
    b.add(new THREE.BoxGeometry(0.05, W.h + 2 * W.bar, 0.024), paint, T(wx1 + 0.025, W.y, z));
  }
  b.add(new THREE.BoxGeometry(W.mullion, W.h, WALL_T + 0.01), paint, T(W.x, W.y, zm));
  b.add(new THREE.BoxGeometry(W.w, W.transomH, WALL_T + 0.01), paint, T(W.x, W.transomY, zm));
  b.add(new THREE.BoxGeometry(SILL.w, SILL.h, SILL.depth), paint, T(SILL.x, SILL.top - SILL.h / 2, zi + SILL.depth / 2));
  b.add(new THREE.BoxGeometry(W.w + 0.16, 0.045, 0.11), stone, T(W.x, wy0 - 0.02, zo - 0.04));
  // Opened sashes (casements swung out flat to the wall's normal, fanlights tilted out at the top).
  for (const s of sashes()) {
    const fw = 0.04, fd = 0.035;
    b.add(new THREE.BoxGeometry(s.w, fw, fd), paint, s.matrix(0, s.h / 2 - fw / 2));
    b.add(new THREE.BoxGeometry(s.w, fw, fd), paint, s.matrix(0, -s.h / 2 + fw / 2));
    b.add(new THREE.BoxGeometry(fw, s.h, fd), paint, s.matrix(-s.w / 2 + fw / 2, 0));
    b.add(new THREE.BoxGeometry(fw, s.h, fd), paint, s.matrix(s.w / 2 - fw / 2, 0));
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(s.w - 2 * fw, s.h - 2 * fw), glass);
    pane.applyMatrix4(s.matrix(0, 0));
    pane.userData.noAO = true;
    scene.add(pane);
  }

  // Back door: frame, threshold, and the door itself swung right round against the wall inside.
  const D = BACKDOOR, dw = D.x1 - D.x0, dh = D.top - fy;
  for (const z of [zi + 0.012, zo - 0.012]) {
    b.add(new THREE.BoxGeometry(dw + 0.14, 0.07, 0.024), paint, T((D.x0 + D.x1) / 2, D.top + 0.035, z));
    b.add(new THREE.BoxGeometry(0.07, dh, 0.024), paint, T(D.x0 - 0.035, fy + dh / 2, z));
    b.add(new THREE.BoxGeometry(0.07, dh, 0.024), paint, T(D.x1 + 0.035, fy + dh / 2, z));
  }
  b.add(new THREE.BoxGeometry(dw, 0.025, WALL_T + 0.08), stone, T((D.x0 + D.x1) / 2, fy + 0.0125, zm - 0.03));
  {
    const leaf = doorLeaf();
    b.add(new THREE.BoxGeometry(dw - 0.02, dh - 0.02, 0.045), doorPaint, leaf.matrix(0, 0, 0));
    // Raised panels (lower half) and glazing bars (upper half).
    for (const sx of [-1, 1]) b.add(new THREE.BoxGeometry(dw * 0.36, dh * 0.3, 0.012), doorPaint, leaf.matrix(sx * dw * 0.22, -dh * 0.25, 0.024), 0xe8efe9);
    const gl = new THREE.Mesh(new THREE.PlaneGeometry(dw * 0.78, dh * 0.38), glass);
    gl.applyMatrix4(leaf.matrix(0, dh * 0.2, 0.024));
    gl.userData.noAO = true;
    scene.add(gl);
    b.add(new THREE.BoxGeometry(0.02, dh * 0.38, 0.012), doorPaint, leaf.matrix(0, dh * 0.2, 0.028));
    b.add(new THREE.BoxGeometry(dw * 0.78, 0.02, 0.012), doorPaint, leaf.matrix(0, dh * 0.2, 0.028));
    b.add(new THREE.SphereGeometry(0.022, 12, 8), new THREE.MeshStandardMaterial({ color: 0xc9a14a, metalness: 1, roughness: 0.3 }), leaf.matrix(dw * 0.4, -0.05, 0.05));
  }
  // Outside lantern by the door.
  b.add(new THREE.BoxGeometry(0.1, 0.16, 0.1), dark, T(D.x1 + 0.22, D.top + 0.05, zo - 0.07));

  // Roof: back slope, fascia and gutter, gable ends, soffit.
  const eaveZ = zo - 0.28, eaveY = top + 0.02, ridgeZ = czz, ridgeY = top + 1.15;
  const rx = ROOM.maxX - ROOM.minX + 2 * WALL_T + 0.4;
  for (const side of [-1, 1]) {
    const ez = side < 0 ? eaveZ : ROOM.maxZ + WALL_T + 0.28;
    const run = Math.abs(ridgeZ - ez), rise = ridgeY - eaveY, len = Math.hypot(run, rise);
    const pitch = Math.atan2(rise, run);
    b.add(boxUV(rx, 0.05, len, 1), roof, T(0, (eaveY + ridgeY) / 2, (ez + ridgeZ) / 2, 0, side * pitch), 0xffffff, { cast: false });
  }
  b.add(new THREE.BoxGeometry(rx, 0.12, 0.025), paint, T(0, eaveY - 0.02, eaveZ - 0.01), 0xffffff, { cast: false });
  b.add(new THREE.CylinderGeometry(0.05, 0.05, rx, 12, 1, true, 0, Math.PI), dark, T(0, eaveY - 0.03, eaveZ - 0.06, 0, Math.PI / 2, Math.PI / 2), 0xffffff, { cast: false });
  b.add(new THREE.BoxGeometry(rx, 0.02, eaveZ - zo + 0.02), paint, T(0, eaveY - 0.07, (eaveZ + zo) / 2), 0xffffff, { cast: false });
  for (const sx of [-1, 1]) {
    const shape = new THREE.Shape();
    shape.moveTo(zo, top); shape.lineTo(ROOM.maxZ + WALL_T, top); shape.lineTo(ridgeZ, ridgeY); shape.lineTo(zo, top);
    const g = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false });
    g.rotateY(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
    b.add(g, brick, T(sx > 0 ? ROOM.maxX + WALL_T : ROOM.minX, 0, 0), 0xffffff, { cast: false });
  }
  // Down pipe at the corner.
  b.add(new THREE.CylinderGeometry(0.03, 0.03, eaveY - fy, 10), dark, T(ROOM.minX - WALL_T - 0.05, (eaveY + fy) / 2, zo - 0.05), 0xffffff, { cast: false });

  b.build(scene);
}

