import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {run,watchDeployment,openPullRequest} from '../scripts/publish-item.mjs';
import {parseGithubRemote} from '../scripts/github-target.mjs';

test('publisher keeps successful JSON separate from stderr and retains failure diagnostics',async()=>{
  const json=await run(process.execPath,['-e',"console.error('warning');console.log(JSON.stringify({id:1}))"],process.cwd(),true);
  assert.deepEqual(JSON.parse(json),{id:1});
  await assert.rejects(run(process.execPath,['-e',"console.error('Authentication expired');process.exit(1)"],process.cwd(),true),/Authentication expired/);
});

test('a failed deployment identifies the check and preserves the uploaded versus live distinction',async()=>{
  const execute=async(_command,args)=>{
    if(args[1]==='watch')throw Error('gh failed');
    return JSON.stringify({status:'completed',conclusion:'failure',jobs:[{name:'build',steps:[{name:'Verify generated collection',conclusion:'failure'}]}]});
  };
  await assert.rejects(watchDeployment('gh',123,process.cwd(),'owner/example',execute),error=>{
    assert.match(error.message,/correction was uploaded/);
    assert.match(error.message,/build: Verify generated collection/);
    assert.match(error.message,/github\.com\/owner\/example\/actions\/runs\/123/);
    assert.match(error.message,/Do not re-enter/);
    return true;
  });
});

test('repository and public site follow the GitHub origin remote',()=>{
  for(const url of ['https://github.com/Owner/Some_Repo.git','https://github.com/Owner/Some_Repo','git@github.com:Owner/Some_Repo.git'])
    assert.deepEqual(parseGithubRemote(url),{repository:'Owner/Some_Repo',remote:'https://github.com/Owner/Some_Repo.git',site:'https://owner.github.io/Some_Repo/'});
  assert.equal(parseGithubRemote('https://example.org/a/b.git'),null);
  assert.equal(parseGithubRemote('https://github.com/a/b/c'),null);
});

test('an item change is proposed as a pull request from a new branch, never pushed to main',async t=>{
  const stage=await fs.mkdtemp(path.join(os.tmpdir(),'pi-pr-'));t.after(()=>fs.rm(stage,{recursive:true,force:true}));
  const calls=[];
  const execute=async(command,args)=>{calls.push([command,...args]);return command==='gh'?'Creating pull request\nhttps://github.com/owner/example/pull/7':'';};
  const result=await openPullRequest({gh:'gh',repo:path.join(stage,'repo'),repository:'owner/example',kind:'delete',id:'AB 12(3)',title:'Delete catalog item AB 12(3)',body:'Body text.',execute});
  assert.equal(result.url,'https://github.com/owner/example/pull/7');
  assert.match(result.branch,/^catalog\/delete-AB_12_3_-\d{14}$/);
  assert.deepEqual(calls[0],['git','push','origin','HEAD:refs/heads/'+result.branch]);
  assert(!calls.flat().some(arg=>/HEAD:main|--force/.test(arg)));
  assert.deepEqual(calls[1].slice(0,9),['gh','pr','create','--repo','owner/example','--base','main','--head',result.branch]);
  assert.equal(await fs.readFile(path.join(stage,'pull-request.md'),'utf8'),'Body text.');
});
