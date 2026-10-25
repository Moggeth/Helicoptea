import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GrassOccupancy, grassTiles } from '../src/render/grassTiles.js';
function mask() { const data = new Uint8Array(16 * 16 * 4); data[(8 * 16 + 8) * 4] = 255; return { texture: new THREE.DataTexture(data, 16, 16), rect: new THREE.Vector4(-8, -8, 16, 16) }; }
test('grass occupancy conservatively includes filter edges, excludes empty regions', () => {
 const o = new GrassOccupancy(mask());
 assert.equal(o.intersects(-0.5, -0.5, 0, 0), true);
 assert.equal(o.intersects(-7, -7, -5, -5), false);
 assert.equal(o.intersects(20, 20, 21, 21), false);
 assert.equal(o.intersects(-20, -20, 20, 20), true);
});
test('tiled grass preserves every cell and bounds shader jitter, height and bent blades', () => {
 const mat = new THREE.MeshLambertMaterial();
 mat.userData.u = { uWin: {value:new THREE.Vector4(-33,-34,0.1,0)}, uBlade:{value:new THREE.Vector4(0.01,0.03,0.26,1)}, uGroundY:{value:-1}, uHeightScale:{value:4} };
 const g = grassTiles(new THREE.PlaneGeometry(), mat, 130, 129, mask(), {tuft:3});
 const cells = new Set();
 for (const m of g.children) {
  const a=m.geometry.attributes.aCell;
  for(let i=0;i<a.count;i++) cells.add(`${a.getX(i)},${a.getY(i)}`);
  if(m.visible) { const s=m.geometry.boundingSphere; assert.ok(s.radius>0); }
 }
 assert.equal(cells.size,130*129);
 assert.ok(cells.has('129,128'));
 const attrs=g.children.map(m=>m.geometry.attributes.aCell.version);
 mat.userData.u.uWin.value.x=200; g.updateTiles();
 assert.ok(g.children.every(m=>!m.visible));
 assert.deepEqual(g.children.map(m=>m.geometry.attributes.aCell.version),attrs);
 mat.userData.u.uWin.value.x=-33; g.updateTiles();
 assert.ok(g.children.some(m=>m.visible));
});
