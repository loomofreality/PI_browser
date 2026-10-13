import test from 'node:test';
import assert from 'node:assert/strict';
import '../src/map-polyfill.mjs';

test('PDF.js support methods behave like the standard versions',()=>{
  const map=new Map([['a',1]]);let calls=0;
  assert.equal(map.getOrInsert('a',2),1);assert.equal(map.getOrInsert('b',3),3);assert.equal(map.get('b'),3);
  assert.equal(map.getOrInsertComputed('a',()=>calls++),1);assert.equal(calls,0);
  assert.equal(map.getOrInsertComputed('c',key=>key+'!'),'c!');
  const key={},weak=new WeakMap();assert.equal(weak.getOrInsertComputed(key,()=>5),5);assert.equal(weak.getOrInsert(key,6),5);
  assert.equal(Math.sumPrecise([1e20,0.1,-1e20]),0.1);assert.equal(Math.sumPrecise([0.1,0.2]),0.30000000000000004);
  assert.ok(Object.is(Math.sumPrecise([]),-0));assert.throws(()=>Math.sumPrecise(['1']),TypeError);
});
