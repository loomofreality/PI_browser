import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {parseCsv} from '../src/text.mjs';
import {digest} from './subject-core.mjs';
import {readExtractInputs} from './extract-inputs.mjs';
import {publicExtractArchive,readPublicExtracts} from './public-extracts.mjs';

export async function archiveExtracts(root){
  const rows=parseCsv(await fs.readFile(path.join(root,'14-colors_and_hyperlinks.csv'),'utf8')),seen=new Set();
  const subjects=rows.map((row,i)=>{const categoryId=new URLSearchParams(new URL(row.hyperlink).hash.replace(/^#\??/,'')).get('category'),id=seen.has(categoryId)?categoryId+'-'+digest(row.subject).slice(0,8):categoryId;seen.add(categoryId);return {id,name:row.subject,row:i+2,url:row.hyperlink};});
  const decisions=JSON.parse(await fs.readFile(path.join(root,'data/extract-review-decisions.json'),'utf8'));
  const inputs=await readExtractInputs(root,subjects,decisions,{sourceFiles:true});
  const selections=[...inputs.bySubject.values()].flat();
  // Owner additions live in the compilation archive itself. Regenerating the
  // immutable source imports must preserve those ordinary editorial selections.
  const existing=await readPublicExtracts(root,subjects,decisions);
  const additions=existing?[...existing.bySubject.values()].flat().filter(s=>s.provenance.sourceCollection==='editorial'):[];
  const ids=new Set(selections.map(s=>s.id));
  for(const selection of additions){if(ids.has(selection.id))throw Error('Editorial selection identity collision');ids.add(selection.id);selections.push(selection);}
  if(existing?.report.blocks.editorial){
    inputs.report.blocks.editorial=existing.report.blocks.editorial;
    inputs.report.deletedSelections=[...new Set([...inputs.report.deletedSelections,...existing.report.deletedSelections])];
  }
  const archive={format:1,sourceVersion:inputs.version,report:inputs.report,selections};
  await fs.writeFile(path.join(root,publicExtractArchive),gzipSync(JSON.stringify(archive),{level:9}));
  return {selections:selections.length,excluded:inputs.report.deletedSelections.length};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await archiveExtracts(process.cwd()));
