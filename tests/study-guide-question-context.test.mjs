import test from 'node:test';
import assert from 'node:assert/strict';
import {withSourceQuestion} from '../scripts/study-guide-question-context.mjs';
test('reviewed adjacent questions preserve the exact chosen answer boundaries',()=>{
 const record={enVersion:'v1',en:{paragraphs:[{plain:'9. QUESTION: Which obligation takes precedence?'},{plain:'ANSWER: Funeral expenses, then debts.'}]}},chosen=[{number:2,ranges:[{start:8,end:24}]}],question={sourceVersion:'v1',paragraph:1,text:record.en.paragraphs[0].plain};
 const result=withSourceQuestion(record,chosen,question,'example');
 assert.deepEqual(result[1],chosen[0]);assert.equal(result[0].ranges[0].end,question.text.length);assert.equal(chosen.length,1);
 for(const change of [{sourceVersion:'stale'},{text:'Invented prompt?'},{paragraph:2}])assert.throws(()=>withSourceQuestion(record,chosen,{...question,...change},'example'),/Invalid adjacent/);
 assert.equal(withSourceQuestion(record,chosen,null,'example'),chosen);
});
