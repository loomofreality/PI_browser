import {gunzipSync} from 'node:zlib';
import {groupSelections} from '../src/subject-groups.mjs';
import {studyGuideSelections} from './study-guide-catalogue.mjs';

// Preview text for each reading entry, read from the published site (or a local
// build) exactly as the guide builder groups it. Only for display in the
// editor: the build still verifies every quotation against its source.
export function siteReader(base,fetcher=fetch){
  let dataset;
  const get=async name=>{
    const response=await fetcher(new URL(name,base),{cache:'no-store'});
    if(!response.ok)throw Error(`${new URL(name,base)} answered ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  };
  return async name=>{
    if(!dataset){
      dataset=JSON.parse((await get('stats.json')).toString('utf8')).dataset;
      if(!/^collections\/[\w-]+\/$/.test(dataset||''))throw Error('The site reports an invalid dataset.');
    }
    return JSON.parse(gunzipSync(await get(dataset+name)).toString('utf8'));
  };
}

const unique=values=>[...new Set(values.filter(Boolean))];
export async function guideQuotations(guide,read){
  const [data,index]=await Promise.all([read(`subjects/${guide.id}.json.gz`),read('subjects/index.json.gz')]);
  let pool=studyGuideSelections(data.selections);
  if(guide.selection){const chosen=new Set(guide.selection.ids);pool=pool.filter(s=>chosen.has(s.id));}
  const groups=groupSelections(pool,data.sources);
  const entries=Object.fromEntries(groups.map(g=>{
    const key=g.source?'source:'+g.source:'selection:'+g.id;
    if(g.source){
      const ranges=g.selections.flatMap(s=>s.candidates[0].ranges).sort((a,b)=>a.paragraph-b.paragraph||a.start-b.start);
      return [key,{source:g.source,linked:true,quotations:g.selections.length,text:unique(ranges.map(r=>r.text.trim())).join(' … ')}];
    }
    const s=g.selections[0];
    return [key,{source:null,linked:false,quotations:1,text:(s.excerpt||s.original||'').trim(),reference:s.reference||(s.suppliedIds||[]).join(', ')||''}];
  }));
  const names=Object.fromEntries(index.subjects.map(s=>[s.id,s.name]));
  const missing=guide.order.filter(x=>!entries[x.key]).length;
  return {subject:data.subject.name,entries,neighbors:Object.fromEntries(guide.neighbors.map(n=>[n.id,names[n.id]||n.id])),
    changed:missing||groups.length!==guide.order.length?'The published subject’s quotations no longer match this guide’s reading entries. Its next build will stop until the guide is reconciled; ask the maintainer before editing the order.':''};
}
