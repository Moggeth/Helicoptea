import test from 'node:test';
import assert from 'node:assert/strict';
import { ParticlePool } from '../src/render/particles.js';
const drop = {p:[0,1,0],v:[1,0,0],life:1,size0:0.01,col0:[1,1,1]};
test('empty particle pools do not upload; live ranges grow, retire and resume correctly',()=>{
 const p=new ParticlePool(500);
 p.update(1/60); assert.equal(p.posAttr.version,0);
 p.emit(drop);p.update(1/60);
 assert.equal(p.points.geometry.drawRange.count,1);
 assert.deepEqual(p.posAttr.updateRanges,[{start:0,count:3}]);
 assert.deepEqual(p.colAttr.updateRanges,[{start:0,count:4}]);
 p.emit(drop);p.update(1/60);assert.deepEqual(p.posAttr.updateRanges,[{start:0,count:6}]);
 p.update(2);const version=p.posAttr.version;assert.equal(p.count,0);
 p.update(1);assert.equal(p.posAttr.version,version);
 p.emit(drop);p.update(1/60);assert.equal(p.count,1);assert.equal(p.posAttr.version,version+1);
 p.clear();p.update(1/60);assert.equal(p.points.geometry.drawRange.count,0);
});
