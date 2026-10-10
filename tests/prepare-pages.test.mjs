import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {preparePages,auditFiles,sharedFonts,sha256,listFiles} from '../scripts/prepare-pages.mjs';

test('publication inventory supports more entries than JavaScript argument limits',async t=>{
  const entry=(name,directory=false)=>({name,isSymbolicLink:()=>false,isDirectory:()=>directory,isFile:()=>!directory});
  const large=Array.from({length:160000},(_,i)=>entry(String(i)+'.json.gz'));
  t.mock.method(fs,'readdir',async folder=>path.basename(folder)==='passages'?large:[entry('passages',true)]);
  const files=await listFiles('virtual-corpus');assert.equal(files.length,160000);assert.equal(new Set(files).size,160000);
});

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'pi-pages-'));
  t.after(async()=>{assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));await fs.rm(root,{recursive:true,force:true});});
  const write=async(name,value)=>{const file=path.join(root,'dist',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,value);};
  await write('stats.json',JSON.stringify({dataset:'collections/current/',records:1}));
  await write('study-guides/manifest.json',JSON.stringify({dataset:'collections/current/',subjects:{subject:'sample-pdf.html'}}));
  await write('build-state.json','must survive for cache reuse');
  for(const name of auditFiles)await write(name,Buffer.from('exact audit: '+name+' — فارسی'));
  for(const name of sharedFonts){await write('fonts/'+name,'unchanged '+name);await write('study-guides/fonts/'+name,'unchanged '+name);}
  await write('study-guides/pilot.css',sharedFonts.filter(n=>n.endsWith('.ttf')).map(n=>`@font-face{src:url('./fonts/${n}')}\n`).join(''));
  for(const name of ['index.html','study-guides/sample-pdf.html','study-guides/sample-pdf.html.gz','study-guides/sample.quotations.html.gz','collections/current/data/source.json.gz','collections/current/index/en/1.json.gz','pdf-volumes/volume-1.pdf','.nojekyll'])await write(name,'Exact reader data — فارسی <b>wording</b> '+name);
  await write('collections/old/data/source.json.gz','old generation');
  return {root,write};
}

test('publication retains audit and cache data while preserving every reading file and shared font',async t=>{
  const {root}=await fixture(t),result=await preparePages(root);
  const files=JSON.parse(gunzipSync(await fs.readFile(path.join(result.auditDirectory,'files.json.gz'))));
  let size=0;
  for(const item of files){
    const bytes=await fs.readFile(path.join(root,'public-site',item.path));size+=bytes.length;
    assert.equal(sha256(bytes),item.sha256);assert.equal(bytes.length,item.bytes);
    if(!['publication.json','study-guides/pilot.css'].includes(item.path))assert.deepEqual(bytes,await fs.readFile(path.join(root,'dist',item.path)),item.path);
  }
  assert.equal(size,result.publicBytes);assert.equal(result.remainingBytes,1e9-size);
  for(const name of auditFiles){
    assert.deepEqual(await fs.readFile(path.join(result.auditDirectory,name)),await fs.readFile(path.join(root,'dist',name)));
    await assert.rejects(fs.access(path.join(root,'public-site',name)),{code:'ENOENT'});
  }
  for(const name of ['build-state.json','study-guides/fonts','collections/old']){
    await fs.access(path.join(root,'dist',name));await assert.rejects(fs.access(path.join(root,'public-site',name)),{code:'ENOENT'});
  }
  const css=await fs.readFile(path.join(root,'public-site/study-guides/pilot.css'),'utf8');
  assert.match(css,/url\('\.\.\/fonts\/eb-garamond.ttf'\)/);
  assert.match(await fs.readFile(path.join(root,'dist/study-guides/pilot.css'),'utf8'),/url\('\.\/fonts\//);
});

test('repeated publication is identical and cannot retain stale public files',async t=>{
  const {root}=await fixture(t),first=await preparePages(root);
  await fs.writeFile(path.join(root,'public-site/old.log'),'obsolete output');
  const second=await preparePages(root);assert.deepEqual(second,first);
  await assert.rejects(fs.access(path.join(root,'public-site/old.log')),{code:'ENOENT'});
});

test('missing audit records or unequal fonts prevent any publication replacement',async t=>{
  const {root,write}=await fixture(t);
  await fs.mkdir(path.join(root,'public-site'));await fs.writeFile(path.join(root,'public-site/previous.html'),'previous verified release');
  await fs.unlink(path.join(root,'dist',auditFiles[0]));await assert.rejects(preparePages(root),/Missing publication input/);
  await write(auditFiles[0],'restored');await write('study-guides/fonts/eb-garamond.ttf','different font');
  await assert.rejects(preparePages(root),/Shared font differs/);
  assert.equal(await fs.readFile(path.join(root,'public-site/previous.html'),'utf8'),'previous verified release');
});

test('unsafe identity, mismatched datasets and uncompressed guide exports are rejected',async t=>{
  const {root,write}=await fixture(t);
  await assert.rejects(preparePages(root,{commit:'../../outside'}),/Invalid publication commit/);
  await write('study-guides/manifest.json',JSON.stringify({dataset:'collections/old/',subjects:{}}));
  await assert.rejects(preparePages(root),/different dataset/);
  await write('study-guides/manifest.json',JSON.stringify({dataset:'collections/current/',subjects:{}}));
  await write('study-guides/compiled.json','not packed');await assert.rejects(preparePages(root),/Package study guides/);
});
