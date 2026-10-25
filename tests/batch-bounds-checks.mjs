import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { cacheBatchBounds } from '../src/render/batchBounds.js';
test('phone bounds match Three under translation, rotation and nonuniform scale; only movement recomputes',()=>{
 const b=new THREE.BatchedMesh(2,100,200,new THREE.MeshLambertMaterial());
 const g=b.addGeometry(new THREE.BoxGeometry(1,2,3)),id=b.addInstance(g),cached=cacheBatchBounds(b);
 let reads=0;const get=b.getMatrixAt;b.getMatrixAt=function(...a){reads++;return get.apply(this,a);};
 const m=new THREE.Matrix4().compose(new THREE.Vector3(1,2,3),new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1,0.3,0.5)),new THREE.Vector3(2,3,0.5));
 b.setMatrixAt(id,m);
 const exact=b.getBoundingSphereAt(g,new THREE.Sphere()).applyMatrix4(get.call(b,id,new THREE.Matrix4()));
 assert.deepEqual(cached(id,g),exact);
 for(let i=0;i<100;i++)cached(id,g);assert.equal(reads,1);
 m.setPosition(8,9,10);b.setMatrixAt(id,m);
 assert.equal(cached(id,g).center.x,8);assert.equal(reads,2);
 b.dispose();b.material.dispose();
});
