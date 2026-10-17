import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {readExtractInputs,extractFolders} from '../scripts/extract-inputs.mjs';
test('deleted selections never re-enter the import and notes survive without altering source files',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-extract-decisions-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'data'));await fs.writeFile(path.join(root,'data/extract-subject-aliases.json'),'{}');
  for(const folder of extractFolders)await fs.mkdir(path.join(root,'subject_extracts',folder),{recursive:true});
  const file=path.join(root,'subject_extracts/Evernote_scrape/Topic.txt'),text='Remove this quotation.\n\nKeep this quotation. GWB#005';await fs.writeFile(file,text);
  const subjects=[{id:'topic',name:'Topic',row:2,url:'https://example.org'}];
  const first=await readExtractInputs(root,subjects),[deleted,kept]=first.bySubject.get('topic');
  const second=await readExtractInputs(root,subjects,{deletedIds:[deleted.id],notes:{[kept.id]:'use Reference'}});
  assert.deepEqual(second.bySubject.get('topic').map(s=>s.id),[kept.id]);assert.equal(second.bySubject.get('topic')[0].reviewNote,'use Reference');
  assert.deepEqual(second.report.deletedSelections,[deleted.id]);assert.equal(second.report.blocks.Evernote_scrape,2);assert.equal(await fs.readFile(file,'utf8'),text);
  assert.notEqual(first.version,second.version);
});

test('public archive preserves identities without raw files and contains no excluded quotation',async t=>{
  const {gzipSync}=await import('node:zlib');
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-public-extracts-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(path.join(root,'data'));
  const subjects=[{id:'topic',name:'Topic'}],kept={id:'a'.repeat(24),subject:'topic',raw:'Retained quote',provenance:{sourceCollection:'subjects_inv_length_ordered'}},deleted='b'.repeat(24);
  const archive={format:1,report:{blocks:{subjects_inv_length_ordered:2},deletedSelections:[deleted],duplicates:[]},selections:[kept]};
  const file=path.join(root,'data/subject-extracts-public.json.gz');
  await fs.writeFile(file,gzipSync(JSON.stringify(archive)));
  const inputs=await readExtractInputs(root,subjects,{deletedIds:[deleted],notes:{[kept.id]:'retained'}});
  assert.equal(inputs.bySubject.get('topic')[0].id,kept.id);assert.equal(inputs.bySubject.get('topic')[0].reviewNote,'retained');assert.deepEqual(inputs.report.deletedSelections,[deleted]);
  const later=await readExtractInputs(root,subjects,{deletedIds:[deleted,kept.id]});assert.equal(later.bySubject.get('topic').length,0);assert.equal(later.report.deletedSelections.length,2);
  archive.selections.push({...kept,id:deleted,raw:'Excluded quote'});await fs.writeFile(file,gzipSync(JSON.stringify(archive)));
  await assert.rejects(readExtractInputs(root,subjects),/Excluded quotation remains/);
});

test('regenerating the compilation archive retains editorial additions and respects later removals',async t=>{
 const {gzipSync,gunzipSync}=await import('node:zlib');const {archiveExtracts}=await import('../scripts/archive-extracts.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-editorial-extracts-'));
 t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
 await fs.mkdir(path.join(root,'data'));
 await fs.writeFile(path.join(root,'data/extract-subject-aliases.json'),'{}');
 const id='A'.repeat(32),selectionId='b'.repeat(24),sourceFile=path.join(root,'subject_extracts/subjects_inv_length_ordered/Topic.txt');
 for(const folder of extractFolders)await fs.mkdir(path.join(root,'subject_extracts',folder),{recursive:true});
 await fs.writeFile(sourceFile,'Original wording. AB00001');
 await fs.writeFile(path.join(root,'14-colors_and_hyperlinks.csv'),`subject,hyperlink\nTopic,https://example.org/#?category=${id}\n`);
 const decisions=path.join(root,'data/extract-review-decisions.json');await fs.writeFile(decisions,'{}');
 const file=path.join(root,'data/subject-extracts-public.json.gz');
 const added={id:selectionId,subject:id,excerpt:'Reviewed words.',preserveBoundaries:true,provenance:{sourceCollection:'editorial'}};
 await fs.writeFile(file,gzipSync(JSON.stringify({format:1,selections:[added],report:{blocks:{editorial:1},deletedSelections:[]}})));
 await archiveExtracts(root);await archiveExtracts(root);
 let archive=JSON.parse(gunzipSync(await fs.readFile(file)));assert.equal(archive.selections.length,2);assert.equal(archive.selections.filter(s=>s.id===selectionId).length,1);assert.equal(archive.selections.find(s=>s.id===selectionId).preserveBoundaries,true);
 await fs.writeFile(decisions,JSON.stringify({deletedIds:[selectionId]}));await archiveExtracts(root);
 archive=JSON.parse(gunzipSync(await fs.readFile(file)));assert.equal(archive.selections.length,1);assert.deepEqual(archive.report.deletedSelections,[selectionId]);
 assert.equal(await fs.readFile(sourceFile,'utf8'),'Original wording. AB00001');
});
