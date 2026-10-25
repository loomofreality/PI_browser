// Describe how the regenerated thematic subject order differs from the one on
// main, for the Update-Subject-Order pull request.
//   node scripts/describe-subject-order.mjs OUTPUT.md
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {run,tool} from './publish-tools.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const file='src/subject-order.json';

export function describeSubjectOrder(before,after){
  const where=order=>new Map(order.groups.flatMap(g=>g.subjects.map((name,i)=>[name,{group:g.title,i}])));
  const old=where(before),now=where(after),lines=[];
  const titles=(order=>order.groups.map(g=>g.title));
  const removedHeadings=titles(before).filter(t=>!titles(after).includes(t)),addedHeadings=titles(after).filter(t=>!titles(before).includes(t));
  if(addedHeadings.length)lines.push('Headings added: '+addedHeadings.join('; ')+'.');
  if(removedHeadings.length)lines.push('Headings removed: '+removedHeadings.join('; ')+'.');
  const added=[...now.keys()].filter(name=>!old.has(name)),removed=[...old.keys()].filter(name=>!now.has(name));
  const moved=[...now].filter(([name,at])=>old.has(name)&&old.get(name).group!==at.group);
  if(added.length)lines.push('Subjects added: '+added.join('; ')+'.');
  if(removed.length)lines.push('Subjects no longer listed: '+removed.join('; ')+'.');
  if(moved.length)lines.push('Moved to another heading:\n'+moved.map(([name,at])=>`- ${name}: from "${old.get(name).group}" to "${at.group}"`).join('\n'));
  const reordered=after.groups.filter(g=>{const b=before.groups.find(x=>x.title===g.title);if(!b)return false;const kept=n=>b.subjects.includes(n)&&g.subjects.includes(n);return JSON.stringify(b.subjects.filter(kept))!==JSON.stringify(g.subjects.filter(kept));}).map(g=>g.title);
  if(reordered.length)lines.push('Order changed within: '+reordered.join('; ')+'.');
  if(!lines.length)lines.push('The headings and the order of subjects are unchanged; only the reference document changed.');
  return `The thematic subject order was regenerated from \`subjects - reference.docx\` (${after.groups.length} headings, ${now.size} subjects).\n\n`+lines.join('\n\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const git=await tool('git',root);
    const before=JSON.parse(await run(git,['-C',root,'show','HEAD:'+file],root,true));
    const after=JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
    await fs.writeFile(process.argv[2],describeSubjectOrder(before,after)+'\n');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
