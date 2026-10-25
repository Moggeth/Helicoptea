import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { OpenWash, registerWater, clearWater, waterAt } from '../src/render/openWater.js';
test('scrolling water reuses overlap but matches a fresh shoreline mask at every cell',()=>{
 clearWater(); const geo=new THREE.PlaneGeometry(3,2).rotateX(-Math.PI/2); registerWater(geo);
 const w=new OpenWash({name:'high'}),f=w.field;
 w.place(0,0,0);const first=w.maskQueries;
 assert.equal(first,(f.n-2)**2);
 for(const [x,z,y] of [[f.dx,0,0],[-f.dx,f.dx,0],[0.4,0.4,0],[0.6,0.2,0.005],[8,8,0],[0,0,0]]) {
  w.place(x,z,y);
  for(let j=0;j<f.n;j++)for(let i=0;i<f.n;i++){
   const k=j*f.n+i, expected=i>0&&j>0&&i<f.n-1&&j<f.n-1&&Math.abs(waterAt(w.x+f.cx[k],w.z+f.cz[k])-y)<0.012?1:0;
   assert.equal(f.mask[k],expected,`${x},${z}: ${i},${j}`);
  }
 }
 w.place(f.dx,0,0);const before=w.maskQueries;w.place(2*f.dx,0,0);
 assert.equal(w.maskQueries-before,f.n-2);
 f.texture.dispose();geo.dispose();clearWater();
});
