import test from 'node:test';
import assert from 'node:assert/strict';
import {decodeSource,decodeWindows1252} from '../scripts/source-encoding.mjs';

test('Windows-1252 fallback maps 0x80-0x9F to the same characters on every Node version',()=>{
  assert.equal(decodeWindows1252(Buffer.from([0x80,0x91,0x92,0x93,0x94,0x96,0x97,0x85,0x8a,0x9f])),'€‘’“”–—…ŠŸ');
  assert.equal(decodeWindows1252(Buffer.from([0x81,0x8d,0x8f,0x90,0x9d])),'\x81\x8d\x8f\x90\x9d');
  assert.equal(decodeWindows1252(Buffer.from('caf\xe9','latin1')),'café');
  const long=Buffer.alloc(100000,0x97);assert.equal(decodeWindows1252(long),'—'.repeat(100000));
});
test('UTF-8 is preferred and only invalid UTF-8 falls back',()=>{
  assert.deepEqual(decodeSource(Buffer.from('Bahá’u’lláh — ﷽')),{text:'Bahá’u’lláh — ﷽',fallback:false});
  assert.deepEqual(decodeSource(Buffer.from([0x93,0x41,0x94])),{text:'“A”',fallback:true});
});
