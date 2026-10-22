import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {removedSelections,reconcileGuide,updateGuides} from '../scripts/catalog-deletion.mjs';
import {catalogueFingerprint} from '../scripts/study-guide-catalogue.mjs';
import {selectStudyGuideQuotations} from '../scripts/study-guide-selection.mjs';

const linked=(id,source,status='confirmed')=>({id,status,suppliedIds:[],passage:'p-'+id,candidates:[{source,version:'v1',ranges:[{paragraph:1,start:0,end:5,text:'Text.'}]}]});
const sources={GONE:{id:'GONE',title:'Gone'},KEEP:{id:'KEEP',title:'Kept'}};

test('a deleted item takes the quotations shown from it or citing only it, with their merged copies',()=>{
  const selections=[
    {...linked('shown','GONE'),duplicates:[{id:'copy'}]},
    linked('other','KEEP'),
    {id:'cites',status:'unmatched',suppliedIds:['GONE'],candidates:[]},
    {id:'shared',status:'unmatched',suppliedIds:['GONE','KEEP'],candidates:[]},
    {...linked('elsewhere','KEEP'),suppliedIds:['GONE']},
    {id:'ambiguous',status:'ambiguous',suppliedIds:[],candidates:[{source:'GONE'},{source:'KEEP'}]}
  ];
  assert.deepEqual([...removedSelections('GONE',selections)].sort(),['cites','copy','shown']);
});

test('guides lose emptied readings and surplus questions, and keep everything else',()=>{
  const before={subject:{id:'S'},sources,selections:[linked('a','GONE'),linked('b','KEEP'),linked('c','KEEP'),{id:'u',status:'unmatched',excerpt:'Supplied.',suppliedIds:[],candidates:[],provenance:{sourceCollection:'Evernote_scrape'}}]};
  const after={...before,selections:before.selections.filter(s=>s.id!=='a')};
  const guide={id:'S',slug:'sample',displayTitle:'Sample',order:[{key:'source:GONE',why:'First.'},{key:'source:KEEP',why:'Second.',shortened:['Text.']},{key:'selection:u',why:'Third.'}],questions:['One?','Two?','Three?'],neighbors:[]};
  const {guide:updated,notes}=reconcileGuide(guide,before,after,{item:'GONE'});
  assert.deepEqual(updated.order,guide.order.slice(1));
  assert.deepEqual(updated.questions,['One?']);
  assert.match(notes.join('\n'),/Reading removed: First\./);assert.match(notes.join('\n'),/reduced from 3 to 1/);
  assert.equal(reconcileGuide({...guide,order:[guide.order[0]]},{...before,selections:[before.selections[0]]},{...before,selections:[]},{item:'GONE'}).guide,null);
  // A quotation newly matched to a record keeps the place of the reading it came from.
  const moved={...after,selections:[linked('b','KEEP'),linked('c','KEEP'),linked('u','GONE2')]};
  const result=reconcileGuide(updated,after,{...moved,sources:{...sources,GONE2:{id:'GONE2'}}},{item:'GONE'});
  assert.deepEqual(result.guide.order.map(x=>[x.key,x.why]),[['source:KEEP','Second.'],['source:GONE2','Third.']]);
});

test('a curated guide records removed quotations so its selection still validates',async()=>{
  const record={id:'KEEP',enVersion:'v1',metadata:{},en:{paragraphs:[{plain:'Text.'}]}};
  const selections=Array.from({length:302},(_,i)=>linked(String(i),i===5||i===301?'GONE':'KEEP'));
  const before={subject:{id:'S'},sources,selections},after={...before,selections:selections.filter(s=>s.candidates[0].source!=='GONE')};
  const ids=selections.slice(0,300).map(s=>s.id);
  const review={subject:'S',status:'finalized_before_analysis',selectionBeforeAnalysis:true,target:300,candidateCount:302,selectedCount:300,mandatoryAuthorizedCount:0,candidateFingerprint:catalogueFingerprint(selections),
    selected:ids.map(id=>({id,source:selections[id].candidates[0].source,sourceVersion:'v1',authorizedParagraphs:[],reason:'Chosen.'})),omitted:[{id:'300'},{id:'301'}],importedAuthorityReview:[]};
  const guide={id:'S',slug:'sample',displayTitle:'Sample',selection:{review:'selections/sample.json',ids,sha256:''},order:[{key:'source:KEEP',why:'Kept.'},{key:'source:GONE',why:'Gone.'}],questions:['One?'],neighbors:[]};
  const result=reconcileGuide(guide,before,after,{item:'GONE',review});
  assert.deepEqual(result.review.removedWithCatalogItems,[{id:'5',item:'GONE',chosen:true},{id:'301',item:'GONE',chosen:false}]);
  assert.equal(result.review.selectedCount,299);assert.equal(result.review.candidateCount,300);assert.deepEqual(result.guide.order,[guide.order[0]]);
  const raw=JSON.stringify(result.review);result.guide.selection.sha256=createHash('sha256').update(raw).digest('hex');
  const chosen=await selectStudyGuideQuotations(after,result.guide.selection,{readReview:async()=>raw,readRecord:async()=>record});
  assert.equal(chosen.length,299);
  // Without the record, the shortfall is still rejected.
  const unrecorded={...result.review,removedWithCatalogItems:[]},plain=JSON.stringify(unrecorded);
  await assert.rejects(selectStudyGuideQuotations(after,{...result.guide.selection,sha256:createHash('sha256').update(plain).digest('hex')},{readReview:async()=>plain,readRecord:async()=>record}),/count/);
});

test('guide files, neighbors, baselines and sentence context are updated together',async()=>{
  const before={subject:{id:'S'},sources,selections:[linked('a','GONE'),linked('b','KEEP')]},after={...before,selections:[linked('b','KEEP')]};
  const guide={id:'S',slug:'sample',displayTitle:'Sample',order:[{key:'source:GONE',why:'First.'},{key:'source:KEEP',why:'Second.'}],questions:[],neighbors:[]};
  const other={id:'T',slug:'other',displayTitle:'Other',order:[{key:'source:KEEP',why:'Only.'}],questions:[],neighbors:[{id:'S',invitation:'Visit.',evidence:['a']},{id:'U',invitation:'Stay.',evidence:['a','x']}]};
  const files={
    'study-guides/first-batch.json':JSON.stringify({batchNumber:1,subjects:[guide,other]},null,2)+'\r\n',
    'study-guides/catalogue-baseline.json':JSON.stringify({format:1,subjects:{S:{fingerprint:catalogueFingerprint(before.selections),publicSelections:2}}},null,2)+'\n',
    'study-guides/sentence-context.json':JSON.stringify({format:1,entries:[{slug:'sample',key:'source:GONE',source:'GONE'},{slug:'other',key:'source:KEEP',source:'KEEP'}]},null,2)+'\n'
  };
  const {changes,guides}=await updateGuides({read:async name=>files[name]===undefined?null:Buffer.from(files[name]),list:async()=>Object.keys(files).map(name=>name.slice('study-guides/'.length)),item:'GONE',subjects:new Map([['S',{before,after}]]),evidenceGone:(_,id)=>id==='a'});
  const batch=changes.get('study-guides/first-batch.json');
  assert(batch.endsWith('}\r\n'));
  const [updated,neighbor]=JSON.parse(batch).subjects;
  assert.deepEqual(updated.order,[guide.order[1]]);
  assert.deepEqual(neighbor.neighbors,[{id:'U',invitation:'Stay.',evidence:['x']}]);
  assert.equal(JSON.parse(changes.get('study-guides/catalogue-baseline.json')).subjects.S.fingerprint,catalogueFingerprint(after.selections));
  assert.deepEqual(JSON.parse(changes.get('study-guides/sentence-context.json')).entries.map(x=>x.slug),['other']);
  assert.deepEqual(guides.map(g=>g.slug),['sample','other']);
});
