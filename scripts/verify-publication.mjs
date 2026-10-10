import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import {sha256,parallelMap} from './prepare-pages.mjs';

const [baseArgument,auditArgument,reportFile]=process.argv.slice(2);
if(!baseArgument||!auditArgument)throw Error('Usage: node scripts/verify-publication.mjs BASE_URL AUDIT_DIRECTORY [REPORT.json]');
const base=new URL(baseArgument.endsWith('/')?baseArgument:baseArgument+'/');
if(!['https:','http:'].includes(base.protocol))throw Error('Expected an HTTP(S) site URL');
const audit=path.resolve(auditArgument),summary=JSON.parse(await fs.readFile(path.join(audit,'summary.json'),'utf8'));
const inventory=await fs.readFile(path.join(audit,'files.json.gz'));
assert.equal(sha256(inventory),summary.manifestSha256,'Audit manifest integrity');
const files=JSON.parse(gunzipSync(inventory)),byPath=new Map(files.map(file=>[file.path,file]));
async function request(file,method='GET') {
  for(let attempt=0;attempt<3;attempt++){
    try{
      const response=await fetch(new URL(file,base),{method,headers:{'Accept-Encoding':'identity','Cache-Control':'no-cache'},signal:AbortSignal.timeout(60000)});
      if(response.status>=500||response.status===429)throw Error('Temporary HTTP '+response.status);
      return response;
    }catch(error){if(attempt===2)throw error;await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
  }
}
async function check(file) {
  const response=await request(file.path);assert.equal(response.status,200,file.path);
  const bytes=Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length,file.bytes,'Length: '+file.path);assert.equal(sha256(bytes),file.sha256,'Content: '+file.path);
  return bytes;
}
const marker=JSON.parse(await check(byPath.get('publication.json')));
assert.equal(marker.commit,summary.commit);assert.equal(marker.dataset,summary.dataset);
const manifest=JSON.parse(await check(byPath.get('study-guides/manifest.json')));
assert.equal(Object.keys(manifest.subjects).length,summary.studyGuides);
const samples=new Set();
for(const folder of ['data/','index/en/','index/original/','subjects/passages/']){
  const group=files.filter(file=>file.path.startsWith(summary.dataset+folder));
  for(let i=0;i<group.length;i+=Math.max(1,Math.floor(group.length/20)))samples.add(group[i].path);
}
const selected=files.filter(file=>file.path.startsWith('study-guides/')||file.path.startsWith('fonts/')||!file.path.includes('/')||samples.has(file.path)||file.path===summary.dataset+'subjects/index.json.gz'||file.path===summary.dataset+'catalog.json.gz'||file.path===summary.dataset+'subjects/report.json'||file.path.startsWith(summary.dataset+'facets/')||/^vendor\/pdfjs\/pdf(?:\.worker)?\.mjs$/.test(file.path));
let checked=0;
await parallelMap(selected,async file=>{await check(file);checked++;if(checked%500===0)console.log(`Verified ${checked}/${selected.length} public files`);},8);
const pdfs=files.filter(file=>file.path.startsWith('pdf-volumes/'));
await parallelMap(pdfs,async file=>{const response=await request(file.path,'HEAD');assert.equal(response.status,200,file.path);assert.equal(Number(response.headers.get('content-length')),file.bytes,file.path);},8);
const removed=summary.excluded.filter(file=>file.reason!=='obsolete dataset');
await parallelMap(removed,async file=>assert.equal((await request(file.path,'HEAD')).status,404,'Excluded public file: '+file.path),8);
const report={verifiedAt:new Date().toISOString(),base:base.href,commit:summary.commit,dataset:summary.dataset,studyGuides:summary.studyGuides,publicBytes:summary.publicBytes,remainingBytes:summary.remainingBytes,exactFiles:checked,pdfHeaders:pdfs.length,excludedFilesAbsent:removed.length,coverage:'Every study-guide page and payload, shared fonts, root interface files, sampled corpus records/search shards/passage links, facets and PDF availability. The build audit checks every staged public file byte-for-byte.'};
if(reportFile){await fs.mkdir(path.dirname(path.resolve(reportFile)),{recursive:true});await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
