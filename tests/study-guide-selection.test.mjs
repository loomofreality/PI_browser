import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {catalogueFingerprint} from '../scripts/study-guide-catalogue.mjs';
import {selectStudyGuideQuotations} from '../scripts/study-guide-selection.mjs';

function fixture(size=302){
 const record={id:'SOURCE',enVersion:'v1',metadata:{Authorized:'Y2'},en:{paragraphs:[{plain:'Provisional.'},{plain:'Authorized.'}]}};
 const selections=Array.from({length:size-1},(_,i)=>({id:String(i),status:'confirmed',passage:'p',candidates:[{source:'SOURCE',version:'v1',ranges:[{paragraph:i===size-2?2:1,start:0,end:i===size-2?11:12,text:i===size-2?'Authorized.':'Provisional.'}]}]}));
 selections.push({id:'import',status:'unmatched',original:'English original.',excerpt:'English original.',candidates:[]});
 const data={subject:{id:'subject'},selections},ids=selections.slice(-Math.min(300,size)).map(s=>s.id);
 const review={subject:'subject',status:'finalized_before_analysis',selectionBeforeAnalysis:true,target:300,candidateCount:size,selectedCount:ids.length,candidateFingerprint:catalogueFingerprint(selections),mandatoryAuthorizedCount:1,
 selected:selections.filter(s=>ids.includes(s.id)).map(s=>({id:s.id,source:s.candidates[0]?.source,sourceVersion:s.candidates[0]?.version,authorizedParagraphs:s.id===String(size-2)?[2]:[],reason:'Editorial relevance.'})),omitted:selections.filter(s=>!ids.includes(s.id)).map(s=>({id:s.id})),importedAuthorityReview:[{id:'import',finding:'Checked English original.',url:'https://example.org/source',authorization:'English original, not a translation.'}]};
 const selection={review:'selections/sample.json',ids},seal=()=>{const raw=JSON.stringify(review);selection.sha256=createHash('sha256').update(raw).digest('hex');return {readReview:async()=>raw,readRecord:async()=>record};};
 return {data,selection,review,record,seal};
}
test('default keeps full coverage; selected guides cap original IDs before grouping and retain imported wording',async()=>{
 const f=fixture(),before=structuredClone(f.data);
 assert.equal((await selectStudyGuideQuotations(f.data)).length,302);
 const result=await selectStudyGuideQuotations(f.data,f.selection,f.seal());
 assert.equal(result.length,300);assert(result.some(s=>s.id==='300'));assert.equal(result.at(-1).original,'English original.');assert.deepEqual(f.data,before);
 const small=fixture(3);assert.equal((await selectStudyGuideQuotations(small.data,small.selection,small.seal())).length,3);
});
test('rejects duplicate, unknown, altered, incomplete and stale selections',async()=>{
 for(const [mutation,message] of [
  [f=>f.selection.ids[0]=f.selection.ids[1],/duplicate/],
  [f=>f.selection.ids[0]='unknown',/unknown/],
  [f=>f.selection.ids.pop(),/count/],
  [f=>f.review.selected[0].id='0',/allowlist/],
  [f=>f.review.omitted[0].id=f.review.selected[0].id,/partition/],
  [f=>f.data.selections[0].original='Changed',/candidate pool/],
  [f=>f.record.enVersion='v2',/stale source/],
  [f=>f.record.en.paragraphs[0].plain='Changed',/stale quotation/],
  [f=>f.review.selected.at(-2).authorizedParagraphs=[],/authority evidence/],
  [f=>f.review.importedAuthorityReview=[],/unreviewed imported/],
  [f=>f.review.selectionBeforeAnalysis=false,/before analysis/]
 ]){const f=fixture();mutation(f);await assert.rejects(selectStudyGuideQuotations(f.data,f.selection,f.seal()),message);}
 const f=fixture(),io=f.seal();f.selection.sha256='changed';await assert.rejects(selectStudyGuideQuotations(f.data,f.selection,io),/hash mismatch/);
});
test('cannot omit an authorized paragraph or silently treat an entire partly authorized source as authorized',async()=>{
 const f=fixture(),required=f.review.selected.find(s=>s.id==='300');
 f.selection.ids[f.selection.ids.indexOf('300')]='0';f.review.selected[f.review.selected.indexOf(required)]={...required,id:'0',authorizedParagraphs:[]};f.review.omitted[f.review.omitted.findIndex(s=>s.id==='0')]={id:'300'};
 await assert.rejects(selectStudyGuideQuotations(f.data,f.selection,f.seal()),/missing mandatory/);
 const overflow=fixture();overflow.record.metadata.Authorized='Y';for(const e of overflow.review.selected)if(e.source)e.authorizedParagraphs=e.id==='300'?[2]:[1];
 await assert.rejects(selectStudyGuideQuotations(overflow.data,overflow.selection,overflow.seal()),/overflow/);
});
