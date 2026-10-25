// CPU-only paired benchmark for water-grid scrolling and immutable phone batch bounds.
// node tests/perf-systems.mjs [--baseline=0779ff7]
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
import * as after from '../src/render/openWater.js';
import {cacheBatchBounds} from '../src/render/batchBounds.js';
const baseline=process.argv.find(a=>a.startsWith('--baseline='))?.slice(11)||'0779ff7';
fs.mkdirSync('scratch',{recursive:true});fs.mkdirSync('test-results/perf',{recursive:true});
const source=execFileSync('git',['show',`${baseline}:src/render/openWater.js`],{encoding:'utf8'}).replace("'./rippleField.js'","'../src/render/rippleField.js'");
fs.writeFileSync('scratch/water-before.mjs',source);
const before=await import('../scratch/water-before.mjs');
const samples={water:{before:[],after:[]},bounds:{before:[],after:[]}};
const geo=new THREE.PlaneGeometry(20,20,20,20).rotateX(-Math.PI/2);
for(const lib of [before,after]){lib.clearWater();lib.registerWater(geo);}
for(let repeat=0;repeat<7;repeat++)for(const key of repeat%2?['after','before']:['before','after']){
 const lib=key==='after'?after:before,w=new lib.OpenWash({name:'high'}),f=w.field;
 w.place(0,0,0);f.live=true;
 const run=()=>{for(let i=0;i<500;i++)w.place((i%100)*f.dx,0,0);};
 run();const start=performance.now();run();samples.water[key].push((performance.now()-start)/500);f.texture.dispose();
 const batch=new THREE.BatchedMesh(400,100,200,new THREE.MeshLambertMaterial());
 const gid=batch.addGeometry(new THREE.BoxGeometry()),matrix=new THREE.Matrix4(),sphere=new THREE.Sphere();
 for(let i=0;i<400;i++){const id=batch.addInstance(gid);batch.setMatrixAt(id,matrix.makeTranslation(i*0.1,0,0));}
 const cached=cacheBatchBounds(batch);
 const scan=()=>{for(let frame=0;frame<1000;frame++)for(let i=0;i<400;i++){
  if(key==='after')cached(i,gid);else batch.getBoundingSphereAt(gid,sphere).applyMatrix4(batch.getMatrixAt(i,matrix));
 }};
 scan();const t=performance.now();scan();samples.bounds[key].push((performance.now()-t)/1000);batch.dispose();batch.material.dispose();
}
const median=a=>[...a].sort((a,b)=>a-b)[a.length>>1];
for(const [name,s] of Object.entries(samples)){s.beforeMs=median(s.before);s.afterMs=median(s.after);console.log(`${name}: ${s.beforeMs.toFixed(4)} -> ${s.afterMs.toFixed(4)} ms (${(100*(1-s.afterMs/s.beforeMs)).toFixed(1)}% reduction)`);}
fs.writeFileSync('test-results/perf/systems-paired.json',JSON.stringify({baseline,samples},null,2));
