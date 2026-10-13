// Commit and publish specific project files from this folder, then wait for the
// GitHub Pages deployment and check the live site. Used by the maintenance
// tools; only the named files are committed, so unrelated local work stays put.
//
//   node scripts/publish-changes.mjs --message "Describe the change" FILE...
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run,tool,watchDeployment,findDeploymentRun} from './publish-item.mjs';
import {githubTarget} from './github-target.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
let gitPath='git';
const git=(args,root,quiet=true)=>run(gitPath,['-C',root,...args],root,quiet);

// Before changing anything: on main, no other tracked edits, up to date with GitHub.
export async function prepareRepository(root,files){
  gitPath=await tool('git',root);
  const top=await git(['rev-parse','--show-toplevel'],root);
  if(path.resolve(top)!==path.resolve(root))throw Error('Run this from the project folder (the Git repository root).');
  if(await git(['branch','--show-current'],root)!=='main')throw Error('Switch this folder to the main branch first.');
  const allowed=new Set(files.map(file=>file.replaceAll('\\','/')));
  const other=(await git(['-c','core.quotePath=false','diff','--name-only','HEAD'],root)).split('\n').filter(Boolean).filter(file=>!allowed.has(file));
  if(other.length)throw Error('Other tracked files have unpublished changes. Commit or undo them first:\n  '+other.slice(0,10).join('\n  '));
  console.log('Checking GitHub for newer changes…');
  await git(['fetch','--quiet','origin','main'],root);
  if(await git(['log','--format=%H','origin/main..HEAD'],root))throw Error('This folder has local commits that are not on GitHub. Push or resolve them first.');
  await git(['merge','--ff-only','--quiet','origin/main'],root);
}

export async function publishChanges(root,files,message){
  const gh=await tool('gh',root);
  const target=await githubTarget(root,{gh,git:gitPath});
  if(target.renamedFrom)console.log(`Note: GitHub now calls this repository ${target.repository}. Update this folder with:\n  git remote set-url origin ${target.remote}`);
  const changed=(await git(['status','--porcelain','--',...files],root)).trim();
  if(!changed){console.log('Nothing to publish: these files already match GitHub.');return null;}
  const account=JSON.parse(await run(gh,['api','user','--jq','{login,id}'],root,true));
  await git(['add','--',...files],root);
  await git(['-c','user.name='+account.login,'-c',`user.email=${account.id}+${account.login}@users.noreply.github.com`,'commit','--quiet','-m',message,'--',...files],root);
  console.log('Uploading…');
  // An ordinary push: a newer change on GitHub stops it instead of being overwritten.
  await git(['push','--quiet','origin','HEAD:main'],root,false);
  const sha=await git(['rev-parse','HEAD'],root);
  console.log('Waiting for the build, checks and Pages deployment (usually a few minutes)…');
  const runId=await findDeploymentRun(gh,target.repository,sha,root);
  await watchDeployment(gh,runId,root,target.repository);
  const response=await fetch(target.site+'stats.json?published='+sha,{cache:'no-store'});
  if(!response.ok)throw Error(`The deployment finished, but ${target.site} did not respond. Check it in a browser.`);
  console.log('Published: '+target.site);
  return {sha,site:target.site};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),at=args.indexOf('--message');
  if(at<0||!args[at+1])throw Error('Usage: node scripts/publish-changes.mjs --message "text" FILE...');
  const message=args[at+1],files=args.filter((_,i)=>i!==at&&i!==at+1);
  if(!files.length)throw Error('Name the files to publish.');
  try{await prepareRepository(projectRoot,files);await publishChanges(projectRoot,files,message);}
  catch(error){console.error('\nNOT PUBLISHED: '+error.message);process.exitCode=1;}
}
