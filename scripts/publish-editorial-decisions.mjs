// Publish decisions exported from the website's editorial pages (Review subject
// connections, Review quoted passages, Editorial workspace). The exported
// subject-edits.json is checked, merged onto the published decisions (the
// export wins where both have an entry, and nothing published is lost), shown
// as a summary, then committed and deployed.
//
//   node scripts/publish-editorial-decisions.mjs [EXPORTED-FILE] [--yes] [--dry-run]
// Without a file, the newest subject-edits*.json in your Downloads folder is used.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {parseCsv} from '../src/text.mjs';
import {validateDraft,mergeDrafts} from '../src/relationship-review-core.mjs';
import {relationKey} from '../src/subject-relations.mjs';
import {prepareRepository,publishChanges} from './publish-changes.mjs';

const projectRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target='data/subject-edits.json';

export async function subjectIds(root){
  const rows=parseCsv(await fs.readFile(path.join(root,'14-colors_and_hyperlinks.csv'),'utf8'));
  return new Set(rows.map(row=>new URLSearchParams(new URL(row.hyperlink).hash.replace(/^#\??/,'')).get('category')));
}

function checkMatches(matches){
  for(const [id,match] of Object.entries(matches)){
    if(!/^[\w-]+$/.test(id)||!match||!['confirmed','rejected'].includes(match.status))throw Error(`Invalid passage decision ${id}: status must be confirmed or rejected.`);
    if(match.status==='confirmed'){
      const c=match.candidate;
      if(!c||typeof c.source!=='string'||!/^[a-f\d]{64}$/.test(c.version||'')||!Array.isArray(c.ranges)||!c.ranges.length||!c.ranges.every(r=>Number.isInteger(r.paragraph)&&Number.isInteger(r.start)&&Number.isInteger(r.end)&&r.end>r.start&&typeof r.text==='string'))
        throw Error(`Invalid confirmed passage ${id}: it needs a source, version and paragraph ranges.`);
    }
  }
}

// Returns the merged decisions and a summary of what changes.
export function mergeDecisions(published,incoming,ids){
  const checked=validateDraft(incoming,ids);checkMatches(checked.matches);
  const merged=mergeDrafts({reviewedSubjects:{},...published},{reviewedSubjects:{},...checked});
  const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
  const before=new Map(published.relationships.map(e=>[relationKey(e),e]));
  const summary={
    newPassages:Object.keys(merged.matches).filter(id=>!published.matches[id]).length,
    changedPassages:Object.keys(merged.matches).filter(id=>published.matches[id]&&!same(published.matches[id],merged.matches[id])).length,
    newConnections:merged.relationships.filter(e=>!before.has(relationKey(e))).length,
    changedConnections:merged.relationships.filter(e=>before.has(relationKey(e))&&!same(before.get(relationKey(e)),e)).length,
    reviewProgress:Object.keys(merged.reviewedSubjects).filter(id=>published.reviewedSubjects?.[id]!==merged.reviewedSubjects[id]).length,
  };
  if(!published.reviewedSubjects&&!Object.keys(merged.reviewedSubjects).length)delete merged.reviewedSubjects;
  summary.total=Object.values(summary).reduce((a,b)=>a+b,0);
  return {merged,summary};
}

async function newestExport(){
  const folder=path.join(os.homedir(),'Downloads');
  let names=[];try{names=(await fs.readdir(folder)).filter(name=>/^subject-edits.*\.json$/i.test(name));}catch{}
  if(!names.length)throw Error(`No exported subject-edits.json was found in ${folder}. Use "Export decisions" on the review page first, or drag the file onto this tool.`);
  const dated=await Promise.all(names.map(async name=>({file:path.join(folder,name),time:(await fs.stat(path.join(folder,name))).mtimeMs})));
  return dated.sort((a,b)=>b.time-a.time)[0].file;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),yes=args.includes('--yes'),dry=args.includes('--dry-run');
  try{
    const source=args.find(arg=>!arg.startsWith('--'))||await newestExport();
    console.log('Decisions file: '+source);
    await prepareRepository(projectRoot,[target]);
    const published=JSON.parse(await fs.readFile(path.join(projectRoot,target),'utf8'));
    let incoming;try{incoming=JSON.parse(await fs.readFile(source,'utf8'));}catch{throw Error('That file is not a readable subject-edits.json export.');}
    const {merged,summary}=mergeDecisions(published,incoming,await subjectIds(projectRoot));
    console.log(`\nChanges compared with the published decisions:
  passage decisions: ${summary.newPassages} new, ${summary.changedPassages} changed
  subject connections: ${summary.newConnections} new, ${summary.changedConnections} changed
  subjects marked reviewed/unreviewed: ${summary.reviewProgress}`);
    if(!summary.total){console.log('\nNothing new to publish.');process.exit(0);}
    if(dry){console.log('\nDry run: nothing was changed.');process.exit(0);}
    if(!yes){
      const prompt=readline.createInterface({input:process.stdin,output:process.stdout});
      const answer=await prompt.question('\nPublish these changes to the website? Type Y and press Enter: ');prompt.close();
      if(!/^y(es)?$/i.test(answer.trim())){console.log('Cancelled. Nothing was changed.');process.exit(0);}
    }
    await fs.writeFile(path.join(projectRoot,target),JSON.stringify(merged,null,2)+'\n');
    await publishChanges(projectRoot,[target],`Publish editorial decisions (${summary.total} changes)`);
  }catch(error){console.error('\nNOT PUBLISHED: '+error.message);process.exitCode=1;}
}
