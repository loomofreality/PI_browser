import test from 'node:test';
import assert from 'node:assert/strict';
import {compactSentenceParagraphs,expandSentenceParagraphs,formatSentenceParagraphs,sameReviewedText,textSha} from '../scripts/sentence-paragraphs.mjs';

const long=[
  {source:'A1',sourceVersion:'v1',paragraph:2,text:'First.',reason:'Keep together.'},
  {source:'A1',sourceVersion:'v1',paragraph:4,text:'Second [open',reason:'Bracket continues.',continuation:{paragraph:5,text:'close] end.'}},
  {source:'B2',sourceVersion:'v9',paragraph:1,text:'Other.',reason:'Keep together.'},
];
test('compact table round-trips long-form reviews without storing paragraph text',()=>{
  const compact=compactSentenceParagraphs({entries:long});
  assert.deepEqual(compact.reasons,['Keep together.','Bracket continues.']);
  assert.deepEqual(compact.sources.A1,{version:'v1',paragraphs:[[2,textSha('First.'),0],[4,textSha('Second [open'),1,[5,textSha('close] end.')]]]});
  const text=formatSentenceParagraphs(compact);
  assert.ok(!text.includes('First.'));
  const expanded=expandSentenceParagraphs(JSON.parse(text));
  assert.equal(expanded.length,3);
  for(const [i,entry] of expanded.entries()){
    assert.equal(entry.source,long[i].source);assert.equal(entry.sourceVersion,long[i].sourceVersion);assert.equal(entry.reason,long[i].reason);
    assert.ok(sameReviewedText(entry,long[i].text));assert.ok(!sameReviewedText(entry,long[i].text+' '));
  }
  assert.ok(sameReviewedText(expanded[1].continuation,'close] end.'));
  assert.deepEqual(compactSentenceParagraphs(JSON.parse(text)),compact);
});
test('appended long-form entries are accepted and duplicates or mixed versions are refused',()=>{
  const compact=compactSentenceParagraphs({entries:long.slice(0,1)});
  const merged=compactSentenceParagraphs({...compact,entries:long.slice(1)});
  assert.equal(expandSentenceParagraphs(merged).length,3);
  assert.throws(()=>compactSentenceParagraphs({...compact,entries:long.slice(0,1)}),/Duplicate/);
  assert.throws(()=>compactSentenceParagraphs({...compact,entries:[{...long[1],sourceVersion:'v2'}]}),/two source versions/);
  assert.throws(()=>expandSentenceParagraphs({reasons:[],sources:{A:{version:'v',paragraphs:[[1,'short',0]]}}}),/Invalid/);
});
