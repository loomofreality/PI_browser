import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {execFile,spawn} from 'node:child_process';
import {GuideStore,guideFiles} from './study-guide-store.mjs';
import {siteReader,guideQuotations} from './study-guide-quotations.mjs';
import {readingPassage} from './study-guide-passage.mjs';
import {githubTarget} from './github-target.mjs';
import {tool} from './publish-item.mjs';

const directory=path.dirname(fileURLToPath(import.meta.url));
const exec=(command,args,cwd)=>new Promise((resolve,reject)=>execFile(command,args,{cwd,windowsHide:true},(error,stdout,stderr)=>error?reject(Error(String(stderr||error.message).trim())):resolve(String(stdout))));

// Study-guide files with saved, unpublished edits in this folder.
export async function pendingGuideFiles(root,git='git'){
  const names=new Set((await guideFiles(path.join(root,'study-guides'))).map(name=>'study-guides/'+name));
  const status=await exec(git,['-C',root,'-c','core.quotePath=false','status','--porcelain','--','study-guides'],root);
  return status.split('\n').filter(Boolean).map(line=>line.slice(3).trim()).filter(file=>names.has(file));
}

export async function startGuideEditor({root=path.resolve(directory,'..'),port=0,open=true,site=process.env.PI_GUIDE_SITE}={}){
  root=path.resolve(root);
  const store=new GuideStore(root),token=randomBytes(32).toString('hex');let busy=false,job=null;
  const git=await tool('git',root).catch(()=>'git');
  if(!site)site=await tool('gh',root).then(gh=>githubTarget(root,{gh,git}),()=>githubTarget(root,{git})).then(target=>target.site,()=>'');
  // Preview quotations from the published site; fall back to a local build.
  const readers=[];
  if(site)readers.push({label:site,read:siteReader(site)});
  try{await fs.access(path.join(root,'dist','stats.json'));readers.push({label:'the local build in dist',read:siteReader(pathToFileURL(path.join(root,'dist')+path.sep),async url=>{try{return new Response(await fs.readFile(url));}catch{return new Response(null,{status:404});}})});}catch{}
  const quotations=async guide=>{
    const errors=[];
    for(const reader of readers){try{return {...await guideQuotations(guide,reader.read),from:reader.label};}catch(error){errors.push(error.message);}}
    return {error:'Quotation previews are unavailable ('+(errors.at(-1)||'no website address')+'). You can still edit and save; the notes keep their source IDs.'};
  };
  // A reading's sentences, and the checks for kept sentences and omissions,
  // need the source text from the website (or the local build).
  const readJson=async name=>JSON.parse(await fs.readFile(path.join(root,'study-guides',name),'utf8'));
  const passage=async(guide,key)=>{
    const sentenceContext=await readJson('sentence-context.json').then(x=>x.entries,error=>{if(error.code==='ENOENT')return [];throw error;});
    const review=guide.selection?await readJson(guide.selection.review):undefined;
    const errors=[];
    for(const reader of readers){try{return await readingPassage({guide,key,read:reader.read,sentenceContext,review});}catch(error){errors.push(error.message);}}
    throw Error('The source text of this reading is unavailable ('+(errors.at(-1)||'no website address')+').');
  };
  const verify=async(guide,edited,keys)=>{
    for(const key of keys){
      const entry=edited.order.find(x=>x.key===key),number=edited.order.indexOf(entry)+1,reading=await passage(guide,key);
      if(entry.omitted&&!guide.order.find(x=>x.key===key).omitted&&reading.mandatory)throw Error(`Reading ${number} contains an authorized translation, so it cannot be left out.`);
      if(entry.shortened!==undefined)try{reading.check(entry.shortened);}catch(error){throw Error(`Reading ${number}: ${error.message}`);}
    }
  };
  const page=(await fs.readFile(path.join(directory,'study-guide-editor.html'),'utf8')).replace('%SITE%',site.replace(/[^\w:/.~-]/g,''));
  const server=http.createServer(async(req,res)=>{
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));};
    const address=`127.0.0.1:${server.address().port}`,origin='http://'+address;
    if(req.headers.host!==address){send(403,{error:'Invalid host'});return;}
    if(req.method==='GET'&&req.url==='/'){
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; form-action 'none'"});res.end(page);return;
    }
    const supplied=Buffer.from(req.headers['x-editor-token']||'');
    if(req.method!=='POST'||req.headers.origin!==origin||supplied.length!==token.length||!timingSafeEqual(supplied,Buffer.from(token))||req.headers['content-type']!=='application/json'){send(403,{error:'Open the editor using its private local link.'});return;}
    try{
      const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024)throw Error('This guide is too large for the editor.');chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(req.url==='/status'){send(200,{job,pending:await pendingGuideFiles(root,git).catch(()=>[])});return;}
      if(req.url==='/list'){send(200,{guides:await store.list()});return;}
      if(req.url==='/load'){const loaded=await store.load(input.slug);send(200,{...loaded,preview:await quotations(loaded.guide)});return;}
      if(req.url==='/passage'){const {guide}=await store.load(input.slug);const {check,...reading}=await passage(guide,input.key);send(200,reading);return;}
      if(busy||job?.status==='running'){send(409,{error:'Wait for the current save or publication to finish.'});return;}
      if(req.url==='/save'){busy=true;try{send(200,await store.save(input.slug,input.revision,input.guide,{verify}));}finally{busy=false;}return;}
      if(req.url==='/publish'){
        const files=await pendingGuideFiles(root,git);
        if(!files.length)throw Error('There are no saved study-guide changes to publish.');
        const titles=new Map((await store.list()).map(g=>[g.slug,g.title]));
        const named=(input.slugs||[]).filter(slug=>titles.has(slug)).map(slug=>titles.get(slug));
        const message=named.length?`Edit study guide${named.length>1?'s':''}: ${named.join(', ')}`.slice(0,200):'Edit study guides';
        job={status:'running',log:`Publishing ${files.join(', ')}…\n`};
        const child=spawn(process.execPath,[path.join(directory,'publish-changes.mjs'),'--message',message,...files],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
        const append=data=>{job.log=(job.log+data).slice(-60000);};
        child.stdout.on('data',append);child.stderr.on('data',append);
        child.on('error',error=>{append(error.message);job.status='failed';});
        child.on('close',code=>{job.status=code===0?'success':'failed';});
        send(202,{job});return;
      }
      send(404,{error:'Unknown operation'});
    }catch(error){send(400,{error:error.message});}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${server.address().port}/#token=${token}`;
  console.log('Study guide editor: '+url);console.log('Keep this window open while editing or publishing. Project folder: '+root);
  if(open&&process.platform==='win32')spawn('powershell.exe',['-NoProfile','-Command',`Start-Process '${url}'`],{windowsHide:true,stdio:'ignore'}).on('error',()=>{});
  return {server,url,token};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))startGuideEditor({root:process.argv[2]||path.resolve(directory,'..'),open:!process.env.PI_EDITOR_NO_OPEN}).catch(error=>{console.error(error.message);process.exitCode=1;});
