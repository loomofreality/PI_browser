// Publish pdf-site/ (staged by prepare-pages.mjs) to the separate PDF
// repository named in src/pdf-hosting.json, then wait until its GitHub Pages
// site serves the same manifest. Nothing is pushed when the live PDF site is
// already current, so ordinary deployments only make one small request.
//
// Requires the PDF_SITE_TOKEN secret: a fine-grained token with
// "Contents: Read and write" on the PDF repository only.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pdfBase} from '../src/pdf-hosting.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

function git(args,cwd,token){
  const auth=token?['-c','http.https://github.com/.extraheader=AUTHORIZATION: basic '+Buffer.from('x-access-token:'+token).toString('base64')]:[];
  return new Promise((resolve,reject)=>{
    const child=spawn('git',[...auth,...args],{cwd,stdio:['ignore','pipe','pipe']});let output='';
    child.stdout.on('data',chunk=>output+=chunk);child.stderr.on('data',chunk=>output+=chunk);
    child.on('error',reject);child.on('close',code=>code===0?resolve(output.trim()):reject(Error(`git ${args[0]} failed (${code}): ${output.replaceAll(token||'\0','***').trim().slice(-2000)}`)));
  });
}
async function liveManifest(url){
  try{const response=await fetch(new URL('pdf-site.json?check='+Date.now(),url),{cache:'no-store'});return response.ok?await response.text():null;}catch{return null;}
}
async function copyTree(from,to){
  for(const entry of await fs.readdir(from,{withFileTypes:true})){
    const source=path.join(from,entry.name),target=path.join(to,entry.name);
    if(entry.isDirectory()){await fs.mkdir(target,{recursive:true});await copyTree(source,target);}
    else if(entry.isFile())await fs.copyFile(source,target);
    else throw Error('Unsupported PDF site entry: '+source);
  }
}

export async function publishPdfSite({token=process.env.PDF_SITE_TOKEN,wait=10*60_000}={}){
  const config=JSON.parse(await fs.readFile(path.join(root,'src/pdf-hosting.json'),'utf8'));
  const url=pdfBase(config);
  if(!url){console.log('Volume PDFs are served from this site; there is no separate PDF site to publish.');return;}
  if(!/^[\w.-]+\/[\w.-]+$/.test(config.repository||''))throw Error('src/pdf-hosting.json needs "repository": "owner/name" for the PDF site.');
  const site=path.join(root,'pdf-site'),manifest=await fs.readFile(path.join(site,'pdf-site.json'),'utf8');
  if(await liveManifest(url)===manifest){console.log('PDF site is current: '+url);return;}
  if(!token)throw Error(`The PDF site ${url} does not match these volume PDFs, and the PDF_SITE_TOKEN secret is not available to update ${config.repository}. Add the secret (see README, "Volume PDF site") and re-run this workflow.`);
  const work=await fs.mkdtemp(path.join(os.tmpdir(),'pdf-site-'));
  try{
    await git(['init','-q','-b','main'],work);
    await git(['remote','add','origin',process.env.PDF_SITE_REMOTE||`https://github.com/${config.repository}.git`],work);
    // A blobless fetch lets Git skip PDFs the PDF repository already has.
    let existing=true;
    try{await git(['fetch','-q','--depth','1','--filter=blob:none','origin','main'],work,token);}
    catch(error){if(!/couldn't find remote ref|not found/i.test(error.message))throw error;existing=false;}
    // Start from the remote tree without downloading its PDFs; unchanged files
    // hash to the same objects and are not uploaded again.
    if(existing){await git(['update-ref','refs/heads/main','FETCH_HEAD'],work);await git(['read-tree','FETCH_HEAD'],work);}
    await copyTree(site,work);
    await git(['add','-A'],work);
    const changes=await git(['status','--porcelain'],work);
    if(changes){
      await git(['-c','user.name=github-actions[bot]','-c','user.email=41898282+github-actions[bot]@users.noreply.github.com','commit','-qm','Publish volume PDFs'],work);
      await git(['push','-q','origin','HEAD:main'],work,token);
      console.log(`Pushed ${changes.split('\n').length} changed path(s) to ${config.repository}`);
    }else console.log(config.repository+' already has these PDFs; waiting for its Pages site.');
  }finally{await fs.rm(work,{recursive:true,force:true});}
  const deadline=Date.now()+wait;
  while(Date.now()<deadline){
    if(await liveManifest(url)===manifest){console.log('PDF site is live: '+url);return;}
    await new Promise(resolve=>setTimeout(resolve,15_000));
  }
  throw Error(`${config.repository} was updated, but ${url} did not serve the new PDFs within ${wait/60000} minutes. Check that its Pages source is "Deploy from a branch: main / (root)".`);
}

// Cross-site PDF loading needs CORS; GitHub Pages sends Access-Control-Allow-Origin: *.
export async function checkPdfAccess(){
  const config=JSON.parse(await fs.readFile(path.join(root,'src/pdf-hosting.json'),'utf8'));const url=pdfBase(config);if(!url)return;
  const {files}=JSON.parse(await fs.readFile(path.join(root,'pdf-site/pdf-site.json'),'utf8'));
  const response=await fetch(new URL(files[0].path,url),{method:'HEAD',headers:{Origin:'https://example.org'}});
  if(!response.ok)throw Error(`PDF site returned ${response.status} for ${files[0].path}`);
  if(Number(response.headers.get('content-length'))!==files[0].bytes)throw Error('PDF site serves a different '+files[0].path);
  if(response.headers.get('access-control-allow-origin')!=='*')throw Error('PDF site does not allow cross-site loading (missing Access-Control-Allow-Origin: *)');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await publishPdfSite();
  await checkPdfAccess();
}
