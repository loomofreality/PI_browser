// Re-record the study-guide catalogue fingerprint for named subjects after
// their changed catalogue data has been reviewed (for example after an English
// correction). Run after a full build that stopped with "Catalogue review data
// changed for ...":
//
//   node scripts/refresh-catalogue-baseline.mjs "chastity and purity" "martyrs and martyrdom"
//   node scripts/refresh-catalogue-baseline.mjs --list    (show every changed subject)
//
// Only the named subjects are updated; every other fingerprint is preserved.
// The build reads the newest dataset under dist/collections/.
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {catalogueFingerprint} from './study-guide-catalogue.mjs';
import {isPublicSelection} from '../src/selection-policy.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const baselineFile=path.join(root,'study-guides/catalogue-baseline.json');

async function newestDataset(){
  try{const stats=JSON.parse(await fs.readFile(path.join(root,'dist/stats.json'),'utf8'));return path.join(root,'dist',stats.dataset);}catch{}
  const parent=path.join(root,'dist/collections');
  const entries=await Promise.all((await fs.readdir(parent)).map(async name=>({name,time:(await fs.stat(path.join(parent,name,'subjects/index.json.gz')).catch(()=>({mtimeMs:0}))).mtimeMs})));
  const newest=entries.sort((a,b)=>b.time-a.time)[0];
  if(!newest?.time)throw Error('Run the full build first; no subject data was found in dist/.');
  return path.join(parent,newest.name);
}

const args=process.argv.slice(2);
if(!args.length)throw Error('Name the reviewed subjects to refresh, or use --list.');
const dataset=await newestDataset();
const read=async name=>JSON.parse(gunzipSync(await fs.readFile(path.join(dataset,name))));
const baseline=JSON.parse(await fs.readFile(baselineFile,'utf8'));
const index=await read('subjects/index.json.gz');
const byName=new Map(index.subjects.map(s=>[s.name.toLowerCase(),s]));
if(args[0]==='--list'){
  for(const [id,expected] of Object.entries(baseline.subjects)){
    const data=await read(`subjects/${id}.json.gz`);
    if(catalogueFingerprint(data.selections)!==expected.fingerprint)console.log(data.subject.name);
  }
}else{
  for(const name of args){
    const subject=byName.get(name.toLowerCase())||index.subjects.find(s=>s.id===name);
    if(!subject)throw Error('Unknown subject: '+name);
    if(!baseline.subjects[subject.id])throw Error('Subject has no catalogue baseline: '+subject.name);
    const data=await read(`subjects/${subject.id}.json.gz`);
    baseline.subjects[subject.id]={fingerprint:catalogueFingerprint(data.selections),publicSelections:data.selections.filter(isPublicSelection).length};
    console.log('Refreshed '+subject.name);
  }
  baseline.verifiedAt=new Date().toISOString();
  // A curated guide's pre-analysis review records the same fingerprint, and its
  // batch records the review file's SHA-256. The build still checks that the
  // reviewed selected/omitted partition matches the current candidates.
  const reviews=path.join(root,'study-guides/selections'),batches=(await fs.readdir(path.join(root,'study-guides'))).filter(name=>name.endsWith('-batch.json'));
  for(const name of await fs.readdir(reviews).catch(()=>[])){
    const file=path.join(reviews,name),raw=await fs.readFile(file),review=JSON.parse(raw);
    const current=baseline.subjects[review.subject]?.fingerprint;
    if(!current||review.candidateFingerprint===current||!args.some(arg=>byName.get(arg.toLowerCase())?.id===review.subject||arg===review.subject))continue;
    const updated=Buffer.from(raw.toString('utf8').replace(review.candidateFingerprint,current));
    const before=createHash('sha256').update(raw).digest('hex'),after=createHash('sha256').update(updated).digest('hex');
    await fs.writeFile(file,updated);
    for(const batch of batches){const text=await fs.readFile(path.join(root,'study-guides',batch),'utf8');if(text.includes(before))await fs.writeFile(path.join(root,'study-guides',batch),text.replaceAll(before,after));}
    console.log('Updated curated selection review '+name);
  }
  await fs.writeFile(baselineFile,JSON.stringify(baseline,null,2)+'\n');
}
