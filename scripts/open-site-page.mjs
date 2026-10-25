// Open a page of this project's live website in the default browser.
//   node scripts/open-site-page.mjs relationships.html
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {githubTarget} from './github-target.mjs';
import {tool} from './publish-tools.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function sitePage(page,options){
  if(!/^[\w.-]+\.html(?:\?[\w=&.-]*)?$/.test(page))throw Error('Unknown page: '+page);
  return new URL(page,(await githubTarget(root,options)).site).href;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const url=await sitePage(process.argv[2]||'index.html',{gh:await tool('gh',root),git:await tool('git',root)});
    console.log('Opening '+url);
    // FileProtocolHandler opens the default browser without cmd.exe reinterpreting & in the address.
    if(process.platform==='win32')spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore',detached:true}).unref();
    else spawn(process.platform==='darwin'?'open':'xdg-open',[url],{stdio:'ignore',detached:true}).on('error',()=>{}).unref();
  }catch(error){console.error(error.message);process.exitCode=1;}
}
