import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {packStudyGuides} from '../scripts/pack-study-guides.mjs';
import {encodeGuideArchive,decodeGuideArchive} from '../scripts/study-guide-archive.mjs';

test('published guides reconstruct their exact body, keep paths and print mode, and package idempotently',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-guide-package-')),out=path.join(root,'dist'),dir=path.join(out,'study-guides');
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
  await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(root,'scripts'));
  await fs.writeFile(path.join(root,'scripts/compilation-guide-loader.mjs'),'// loader fixture');
  const body='<header><a href="index.html">Guides</a></header><main id="main"><h1>Faith &amp; hope</h1><p>“Exact wording” — فارسی &lt;script&gt;</p><a href="../?id=BH00001#p-en-1">Source</a><section id="questions">Question?</section></main>';
  const html='<!doctype html><html><head><link rel="stylesheet" href="pilot.css"><script src="pilot-view.js" defer></script></head><body class="pdf-view">'+body+'</body></html>';
  await fs.writeFile(path.join(dir,'sample-pdf.html'),html);await fs.writeFile(path.join(dir,'index.html'),'Overview');
  for(const name of ['compiled.json','validation.json','sentence-review.json'])await fs.writeFile(path.join(dir,name),' {"exact":"文字"}\n');
  await fs.writeFile(path.join(dir,'manifest.json'),'Manifest');
  await packStudyGuides(root,out);
  const shell=await fs.readFile(path.join(dir,'sample-pdf.html'),'utf8');
  assert.match(shell,/class="pdf-view"/);assert.match(shell,/type="module" src="guide-loader.mjs"/);assert.doesNotMatch(shell,/src="pilot-view.js"/);
  assert.equal(gunzipSync(await fs.readFile(path.join(dir,'sample-pdf.html.gz'))).toString(),body);
  for(const name of ['compiled.json','validation.json','sentence-review.json']){const payload=JSON.parse(gunzipSync(await fs.readFile(path.join(dir,name==='compiled.json'?'compiled.archive.json.gz':name+'.gz'))));assert.deepEqual(name==='compiled.json'?decodeGuideArchive(payload):payload,{exact:'文字'});await assert.rejects(fs.access(path.join(dir,name)),{code:'ENOENT'});}
  assert.equal(await fs.readFile(path.join(dir,'index.html'),'utf8'),'Overview');assert.equal(await fs.readFile(path.join(dir,'manifest.json'),'utf8'),'Manifest');
  await packStudyGuides(root,out);assert.equal(await fs.readFile(path.join(dir,'sample-pdf.html'),'utf8'),shell);
});

test('verification archive preserves exact repeated text, reference-like strings, keys and scalar values',()=>{
 const repeated='Exact quotation — فارسی with punctuation, whitespace, and \\ commands. '.repeat(10);
 const value={groups:[{text:repeated,source:null},{text:repeated,source:'BH001'}],literal:'\u0000pi-string:0',other:['\u0000pi-string:999',0,false,null],nested:{['__proto__']:null,'\u0000pi-string:0':repeated}};
 const archive=encodeGuideArchive(value);
 assert.deepEqual(decodeGuideArchive(JSON.parse(JSON.stringify(archive))),value);
 assert.equal(archive.strings.filter(s=>s===repeated).length,1);
 assert(JSON.stringify(archive).length<JSON.stringify(value).length);
 assert.throws(()=>decodeGuideArchive({format:'pi-guide-archive-1',strings:[],value:'\u0000pi-string:0'}),/Invalid/);
});

test('paired views share only identical quotations and reconstruct exactly on repeated packaging',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-shared-guides-')),out=path.join(root,'dist'),dir=path.join(out,'study-guides');
 t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
 await fs.mkdir(dir,{recursive:true});await fs.mkdir(path.join(root,'scripts'));await fs.writeFile(path.join(root,'scripts/compilation-guide-loader.mjs'),'// fixture');
 const quotes='<article class="quotation" id="reading-1"><blockquote>Exact $& $` wording — فارسی &lt;script&gt;</blockquote><a href="../?id=source#p-en-1">Source</a></article>';
 const bodies={'sample.html':'<header>Header</header><main id="main"><h1>Sample</h1>'+quotes+'<details>Sequence</details></main>','sample-pdf.html':'<header>Header</header><main id="main"><h1>Sample</h1><section class="introduction">Essay</section>'+quotes+'<section id="questions">Question?</section></main>'};
 for(const[n,b]of Object.entries(bodies))await fs.writeFile(path.join(dir,n),'<!doctype html><html><head><script src="pilot-view.js" defer></script></head><body'+(n.includes('-pdf')?' class="pdf-view"':'')+'>'+b+'</body></html>');
 await packStudyGuides(root,out);await packStudyGuides(root,out);
 const shared=gunzipSync(await fs.readFile(path.join(dir,'sample.quotations.html.gz'))).toString();assert.equal(shared,quotes);
 for(const[n,b]of Object.entries(bodies)){const body=gunzipSync(await fs.readFile(path.join(dir,n+'.gz'))).toString();assert.equal(body.replace('<template id="guide-shared-quotations"></template>',()=>shared),b);}
 const ordinary=gunzipSync(await fs.readFile(path.join(dir,'sample.html.gz'))).toString();assert.doesNotMatch(ordinary,/Essay|Question\?/);
});

