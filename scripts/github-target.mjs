// The repository and public site come from the checkout's own "origin"
// remote, so the same tools work in any copy of the project without editing.
import {execFile} from 'node:child_process';

export function parseGithubRemote(url){
  const match=/^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(String(url).trim());
  if(!match)return null;
  const [,owner,name]=match;
  return {repository:`${owner}/${name}`,remote:`https://github.com/${owner}/${name}.git`,site:`https://${owner.toLowerCase()}.github.io/${name}/`};
}

export async function githubTarget(root){
  const url=await new Promise((resolve,reject)=>execFile('git',['-C',root,'remote','get-url','origin'],{windowsHide:true},(error,stdout)=>error?reject(Error('This folder has no Git "origin" remote. Clone the repository from GitHub first.')):resolve(stdout)));
  const target=parseGithubRemote(url);
  if(!target)throw Error('The Git "origin" remote is not a GitHub repository: '+url.trim());
  return target;
}
