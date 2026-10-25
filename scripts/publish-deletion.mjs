// Propose deleting one item from the catalog, with its subject quotations and
// study-guide readings, as a pull request. Work happens in an isolated copy of
// the latest published repository, which is fully rebuilt and tested before the
// branch is pushed; the local source files are removed (with a backup) once the
// pull request is open. Volume PDFs are not changed.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {tool,run,openPullRequest,jobFolder} from './publish-item.mjs';
import {ItemStore,validId} from './item-store.mjs';
import {githubTarget} from './github-target.mjs';
import {planDeletion,liveSite,updateGuides,authorizedGroups} from './catalog-deletion.mjs';
import {catalogueFingerprint} from './study-guide-catalogue.mjs';
import {recordFilename} from '../src/record-file.mjs';

const codeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repoFiles=repo=>({
  read:name=>fs.readFile(path.join(repo,name)).catch(error=>error.code==='ENOENT'?null:Promise.reject(error)),
  list:directory=>fs.readdir(path.join(repo,directory))
});
const committed=['data/collection','data/subject-extracts-public.json.gz','data/extract-review-decisions.json','data/subject-edits.json','data/subject-review-candidates.json','study-guides','build-report.json','subject-import-report.json'];

// A copy of the latest published main branch; `files` limits the checkout.
async function checkout(root,stage,files){
  const repo=path.join(stage,'repo'),git=await tool('git',root),gh=await tool('gh',root);
  const target=await githubTarget(root,{gh,git});
  await run('git',['clone','--shared','--no-checkout',root,repo],root,true);
  await run('git',['remote','set-url','origin',target.remote],repo);
  if(files){
    await run('git',['config','core.sparseCheckout','true'],repo);
    await fs.mkdir(path.join(repo,'.git/info'),{recursive:true});
    await fs.writeFile(path.join(repo,'.git/info/sparse-checkout'),files.join('\n')+'\n');
  }
  await run('git',['fetch','--no-tags','origin','main'],repo,true);
  await run('git',['checkout','-B','main','FETCH_HEAD'],repo,true);
  return {repo,gh,...target};
}
async function withStage(root,prefix,work){
  const qa=path.join(root,'.qa');await fs.mkdir(qa,{recursive:true});
  const lockFile=path.join(qa,'item-publish.lock');let lock;
  try{lock=await fs.open(lockFile,'wx');}catch{throw Error('Another item publication is running. If it was interrupted, close the editor and remove .qa/item-publish.lock before retrying.');}
  const jobs=await jobFolder(),stage=path.join(jobs,prefix+randomUUID());let keep=true;
  try{const result=await work(stage);keep=false;return result;}
  finally{
    await lock.close();await fs.unlink(lockFile);
    // Keep a failed job for diagnosis; remove only this verified transient directory.
    if(!keep&&path.dirname(stage)===jobs&&new RegExp('^'+prefix+'[a-f0-9-]+$').test(path.basename(stage))){
      try{await fs.rm(stage,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
      catch{console.log('Temporary files are still in '+stage+' because another program has them open.');}
    }
  }
}
const publicPlan=({changes,subjectData,...plan})=>plan;

// What a deletion would remove, without changing anything.
export async function previewDeletion(root,id){
  root=path.resolve(root);
  if(!validId(id))throw Error('Enter an exact catalog ID, without a file extension.');
  return withStage(root,'item-delete-preview-',async stage=>{
    const target=await checkout(root,stage,['/data/*.json','/data/*.json.gz','/study-guides/']);
    const plan=await planDeletion({id,...repoFiles(target.repo),site:liveSite(target.site)});
    let local=null;try{local=await new ItemStore(root).load(id);}catch{}
    return {...publicPlan(plan),local:Boolean(local)};
  });
}

// Study guides whose subjects changed beyond the planned removal (for example a
// quotation that matched both this item and another record now matches only
// the other one) are reconciled against the data of the first build.
export async function reconcileBuild(repo,id,site,planned){
  const parent=path.join(repo,'dist/collections');
  const datasets=await Promise.all((await fs.readdir(parent)).map(async name=>({name,time:(await fs.stat(path.join(parent,name,'subjects/index.json.gz')).catch(()=>({mtimeMs:0}))).mtimeMs})));
  const newest=datasets.sort((a,b)=>b.time-a.time)[0];
  if(!newest?.time)throw Error('The first build stopped before it built the subjects.');
  const read=async name=>JSON.parse(gunzipSync(await fs.readFile(path.join(parent,newest.name,name))));
  const files=repoFiles(repo),baseline=JSON.parse(await files.read('study-guides/catalogue-baseline.json'));
  const subjects=new Map();
  for(const [subjectId,expected] of Object.entries(baseline.subjects)){
    const after=await read(`subjects/${subjectId}.json.gz`);
    if(catalogueFingerprint(after.selections)===expected.fingerprint)continue;
    const before=planned.get(subjectId)?.after||await site(`subjects/${subjectId}.json.gz`);
    subjects.set(subjectId,{before,after});
    console.log(`Rematched quotations changed in “${after.subject.name}”.`);
  }
  if(!subjects.size)return null;
  const exists=new Map([...subjects].map(([subjectId,{after}])=>[subjectId,new Set(after.selections.map(s=>s.id))]));
  const result=await updateGuides({...files,item:id,subjects,evidenceGone:(subjectId,selection)=>exists.has(subjectId)&&!exists.get(subjectId).has(selection),authorized:authorizedGroups(source=>read('data/'+recordFilename(source)).catch(()=>null))});
  for(const [name,value] of result.changes)await fs.writeFile(path.join(repo,name),value);
  for(const guide of result.guides)console.log(`Study guide “${guide.title}”:\n  ${guide.notes.join('\n  ')}`);
  return result.guides;
}

export async function publishDeletion(root,id,digest){
  root=path.resolve(root);
  if(!validId(id))throw Error('Enter an exact catalog ID, without a file extension.');
  const store=new ItemStore(root);
  await withStage(root,'item-delete-',async stage=>{
    console.log('Copying the latest published repository (this includes the volume PDFs and can take a few minutes).');
    const {repo,gh,repository,site}=await checkout(root,stage);
    const live=liveSite(site);
    const plan=await planDeletion({id,...repoFiles(repo),site:live});
    if(digest&&plan.digest!==digest)throw Error('The published catalog changed since the preview. Preview the deletion again; nothing was changed.');
    const python=await tool('python',root);
    try{await run(python,[path.join(codeRoot,'scripts/patch-item-archive.py'),'--delete','--archive',path.join(repo,'data/collection'),'--id',id],repo);}
    catch(error){
      if(!/not in the published catalog/.test(error.message))throw error;
      if(plan.changes.size)throw Error(`${id} is not in the published source archive, but published quotations refer to it. Ask the maintainer to check the collection. Nothing was changed.`);
      console.log(`${id} is not in the published catalog; only the local source files will be removed.`);
      return;
    }
    for(const subject of plan.subjects)console.log(`Removing ${subject.removed} quotation${subject.removed===1?'':'s'} from “${subject.name}”.`);
    for(const guide of plan.guides)console.log(`Study guide “${guide.title}”:\n  ${guide.notes.join('\n  ')}`);
    for(const [name,value] of plan.changes)await fs.writeFile(path.join(repo,name),value);
    await run(python,[path.join(codeRoot,'scripts/archive-sources.py'),'--root',repo,'--check'],repo);
    const build=()=>run(process.execPath,['--max-old-space-size=6144','scripts/build.mjs'],repo);
    console.log('Building and checking the complete collection without the item. This takes a while.');
    let reconciled=[];
    try{await build();}
    catch(error){
      const result=/Catalogue review data changed for/.test(error.message)?await reconcileBuild(repo,id,live,plan.subjectData):false;
      if(!result)throw error;
      reconciled=result;
      console.log('Rebuilding with the reconciled study guides.');
      await fs.rm(path.join(repo,'dist'),{recursive:true,force:true});
      await build();
    }
    // Test the staged upload as the deployment does.
    await run(process.execPath,['scripts/prepare-pages.mjs'],repo,true);
    const tests=(await fs.readdir(path.join(repo,'tests'))).filter(name=>name.endsWith('.test.mjs')).map(name=>path.join('tests',name));
    await run(process.execPath,['--test',...tests],repo);
    await run('git',['add','--',...committed],repo);
    const account=JSON.parse(await run(gh,['api','user','--jq','{login,id}'],repo,true));
    await run('git',['-c','user.name='+account.login,'-c',`user.email=${account.id}+${account.login}@users.noreply.github.com`,'commit','-m','Delete catalog item '+id],repo);
    const guides=[...plan.guides,...reconciled];
    const body=[`Deletion of catalog item \`${id}\` requested with Edit-Catalog-Item.cmd. Volume PDFs are unchanged.`,'',
      'The item is removed from the source archive (`data/collection`). The complete collection was rebuilt and every test passed before this pull request was opened.','',
      plan.subjects.length?`**Subject quotations removed (${plan.quotations}):**\n${plan.subjects.map(s=>`- ${s.name} (${s.removed})`).join('\n')}`:'No subject compilation quoted this item.','',
      guides.length?`**Study guides changed:**\n${guides.map(g=>`- ${g.title}\n${g.notes.map(n=>'  - '+n).join('\n')}`).join('\n')}`:'No study guide changes.',''].join('\n');
    await openPullRequest({gh,repo,repository,kind:'delete',id,title:'Delete catalog item '+id,body});
    console.log('Nothing is published until the pull request is merged on GitHub; the website then rebuilds automatically.');
  });
  const backup=await store.remove(id);
  // Removed now so a full collection update cannot restore the item; if the pull
  // request is closed without merging, restore the files from this backup.
  console.log(backup?`Removed ${id} from this computer’s source folders. Backup (restore it if the pull request is closed without merging): ${backup}`:`${id} was not in this computer’s source folders.`);
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [root,id,digest]=process.argv.slice(2);
  publishDeletion(root,id,digest).catch(error=>{console.error(error.message);process.exitCode=1;});
}
