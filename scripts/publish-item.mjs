import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {ItemStore} from './item-store.mjs';
import {githubTarget} from './github-target.mjs';

const codeRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function tool(name,root){
  const runtime=path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies');
  const candidates=name==='python'?[process.env.PI_EDITOR_PYTHON,path.join(runtime,'python/python.exe')]:name==='gh'?[process.env.PI_EDITOR_GH,path.join(root,'.tools/gh/bin/gh.exe')]:name==='git'?[path.join(runtime,'native/git/cmd/git.exe')]:[];
  for(const candidate of candidates.filter(Boolean))try{await fs.access(candidate);return candidate;}catch{}
  return name;
}
export async function run(command,args,cwd,quiet=false,env=null){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],...env&&{env:{...process.env,...env}}});let result='',diagnostic='';
    child.stdout.on('data',chunk=>{result+=chunk;if(!quiet)process.stdout.write(chunk);});
    child.stderr.on('data',chunk=>{diagnostic=(diagnostic+chunk).slice(-6000);if(!quiet)process.stderr.write(chunk);});
    child.on('error',reject);child.on('close',code=>code===0?resolve(result.trim()):reject(Error(`${path.basename(command)} ${args.slice(0,2).join(' ')} failed (${code}). ${diagnostic.trim()||result.trim().slice(-2000)||'No diagnostic output was returned.'}`)));
  });
}
export async function watchDeployment(gh,runId,repo,repository,execute=run,{change='saved correction',retry='re-enter the correction'}={}){
  const url=`https://github.com/${repository}/actions/runs/${runId}`;
  console.log('Deployment: '+url);
  try{await execute(gh,['run','watch',String(runId),'--repo',repository,'--interval','15','--exit-status'],repo);}
  catch(error){
    let detail=error.message;
    try{
      const report=JSON.parse(await execute(gh,['run','view',String(runId),'--repo',repository,'--json','status,conclusion,jobs'],repo,true));
      const failed=report.jobs.flatMap(job=>job.steps.filter(step=>step.conclusion==='failure').map(step=>job.name+': '+step.name));
      detail=failed.length?'Failed check: '+failed.join('; '):`Deployment status: ${report.status} (${report.conclusion||'pending'}). ${detail}`;
    }catch{}
    throw Error(`Your ${change} was uploaded, but publication could not be confirmed. ${detail}\nSee ${url}\nYour local edits and backups are preserved. Do not ${retry}.`);
  }
}
// Wait for the GitHub Pages workflow GitHub starts for this pushed commit.
export async function findDeploymentRun(gh,repository,sha,cwd,execute=run,delay=4000){
  for(let attempt=0;attempt<30;attempt++){
    const runs=JSON.parse(await execute(gh,['run','list','--repo',repository,'--workflow','pages.yml','--commit',sha,'--limit','1','--json','databaseId'],cwd,true));
    if(runs.length)return runs[0].databaseId;
    await new Promise(resolve=>setTimeout(resolve,delay));
  }
  throw Error('The commit was uploaded, but GitHub has not started its workflow. Check repository Actions.');
}
// Push the committed change to a new branch and open a pull request against
// main. Nothing reaches main or the website until the pull request is merged.
// `ref` is the commit to propose (HEAD of `repo` by default); the maintenance
// tools use the `maintenance` prefix, catalog item changes `catalog`.
export async function openPullRequest({gh,git='git',repo,repository,prefix='catalog',kind,id,title,body,ref='HEAD',bodyFile=path.join(path.dirname(repo),'pull-request.md'),execute=run}){
  const stamp=new Date().toISOString().replace(/\D/g,'').slice(0,14);
  const branch=`${prefix}/${kind}${id?'-'+id.replace(/[^\w-]+/g,'_'):''}-${stamp}`;
  // A new branch name: an ordinary push never overwrites remote history.
  await execute(git,['push','origin',ref+':refs/heads/'+branch],repo);
  await fs.writeFile(bodyFile,body);
  const url=(await execute(gh,['pr','create','--repo',repository,'--base','main','--head',branch,'--title',title,'--body-file',bodyFile],repo,true)).split('\n').at(-1).trim();
  console.log('Pull request: '+url);
  return {branch,url};
}
export async function publishItem(root,id,revision){
  root=path.resolve(root);
  const store=new ItemStore(root),snapshot=await store.snapshot(id);
  if(snapshot.revision!==revision)throw Error('Sources changed. Reload this item before publishing.');
  const qa=path.join(root,'.qa');await fs.mkdir(qa,{recursive:true});
  const lockFile=path.join(qa,'item-publish.lock');let lock;
  try{lock=await fs.open(lockFile,'wx');}catch{throw Error('Another item publication is running. If it was interrupted, close the editor and remove .qa/item-publish.lock before retrying.');}
  const stage=path.join(qa,'item-publish-'+randomUUID()),repo=path.join(stage,'repo'),input=path.join(stage,'source');
  let success=false;
  try{
    console.log('Snapshotting the saved item. Other local items will not be uploaded.');
    for(const [i,name] of snapshot.names.entries()){
      await fs.mkdir(path.dirname(path.join(input,name)),{recursive:true});
      if(snapshot.bytes[i]!==null)await fs.writeFile(path.join(input,name),snapshot.bytes[i]);
    }
    const gh=await tool('gh',root),python=await tool('python',root);
    const {repository,remote,site}=await githubTarget(root,{gh,git:await tool('git',root)});
    await run('git',['clone','--shared','--no-checkout',root,repo],root);
    await run('git',['remote','set-url','origin',remote],repo);
    await run('git',['config','core.sparseCheckout','true'],repo);
    await fs.mkdir(path.join(repo,'.git/info'),{recursive:true});
    await fs.writeFile(path.join(repo,'.git/info/sparse-checkout'),'/data/collection/\n');
    await run('git',['fetch','--no-tags','origin','main'],repo);
    await run('git',['checkout','-B','main','FETCH_HEAD'],repo);
    const nextEnglish=snapshot.bytes[2]===null?undefined:createHash('sha256').update(snapshot.bytes[2]).digest('hex');
    for(const file of ['data/subject-edits.json','data/extract-review-decisions.json']){
      const decisions=JSON.parse(await run('git',['show','HEAD:'+file],repo,true));
      function check(value){
        if(!value||typeof value!=='object')return;
        if(value.source===id&&Array.isArray(value.ranges)&&value.version!==nextEnglish)throw Error('Saved locally, but this English text is referenced by reviewed subject quotations. Those references need review against the corrected text before publication. No change has been pushed.');
        for(const child of Object.values(value))if(typeof child==='object')check(child);
      }
      check(decisions);
    }
    console.log('Preparing the current published archive with this item only.');
    await run(python,[path.join(codeRoot,'scripts/patch-item-archive.py'),'--root',input,'--archive',path.join(repo,'data/collection'),'--id',id],repo);
    await run(python,[path.join(codeRoot,'scripts/archive-sources.py'),'--root',repo,'--check'],repo);
    const status=await run('git',['status','--porcelain'],repo);
    if(!status)console.log('This item already matches the published source; there is nothing to propose.');
    else{
    if(status.split('\n').some(line=>!/ data\/collection\/[\w-]+\.tar$/.test(line)))throw Error('Unexpected files changed in the isolated publication checkout.');
    const account=JSON.parse(await run(gh,['api','user','--jq','{login,id}'],repo));
    await run('git',['add','--','data/collection'],repo);
    await run('git',['-c','user.name='+account.login,'-c',`user.email=${account.id}+${account.login}@users.noreply.github.com`,'commit','-m','Correct catalog item '+id],repo);
    const changed=[snapshot.rows.some(row=>row.PIN===id)&&'metadata row',snapshot.bytes[1]!==null&&'original text',snapshot.bytes[2]!==null&&'English translation'].filter(Boolean).join(', ');
    await openPullRequest({gh,repo,repository,kind:'edit',id,title:'Correct catalog item '+id,
      body:`Correction of catalog item \`${id}\` saved with Edit-Catalog-Item.cmd.\n\nOnly this item's entry in the source archive (\`data/collection\`) changes: ${changed}, as saved on the editor's computer. The original-text publication policy was applied and checked.\n\nAfter merging, the website rebuilds; check the item at ${site}?id=${encodeURIComponent(id)}\n`});
    console.log('Nothing is published until the pull request is merged on GitHub; the website then rebuilds automatically.');
    }
    success=true;
  }finally{
    await lock.close();await fs.unlink(lockFile);
    // Keep failed jobs for diagnosis; remove only this verified transient directory.
    if(success&&path.dirname(stage)===qa&&/^item-publish-[a-f0-9-]+$/.test(path.basename(stage))){
      try{await fs.rm(stage,{recursive:true,force:true,maxRetries:5,retryDelay:500});}
      catch{console.log('Publication succeeded. Temporary files are still in '+stage+' because another program has them open.');}
    }
  }
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [root,id,revision]=process.argv.slice(2);
  publishItem(root,id,revision).catch(error=>{console.error(error.message);process.exitCode=1;});
}
