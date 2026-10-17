import {groupSelections,groupedParagraphs} from '../src/subject-groups.mjs';
import {recordFilename} from '../src/record-file.mjs';
import {authorizedRanges,isAuthorizedParagraph} from '../src/translation-status.mjs';
import {completeSentenceParagraphs,locateSuppliedParagraphs,sentenceSpans} from './study-guide-sentences.mjs';
import {studyGuideSelections} from './study-guide-catalogue.mjs';
import {shortenParagraphs,shortenSupplied} from './study-guide-shortening.mjs';

// One reading entry of a guide, split into the whole sentences the guide
// builder would show, so the editor can choose which of them to keep. The same
// rules as build-compilation-pilot.mjs decide the passage, its kept wording and
// whether it contains authorized wording.
// `read(name)` returns a parsed dataset file (subjects/…, data/…).
// `review` is the guide's parsed selection review, when it has one.
export async function readingPassage({guide,key,read,sentenceContext=[],review}){
  const entry=guide.order.find(x=>x.key===key);
  if(!entry)throw Error('This reading is not in the guide.');
  const data=await read(`subjects/${guide.id}.json.gz`);
  let pool=studyGuideSelections(data.selections);
  if(guide.selection){const chosen=new Set(guide.selection.ids);pool=pool.filter(s=>chosen.has(s.id));}
  const group=groupSelections(pool,data.sources).find(g=>(g.source?'source:'+g.source:'selection:'+g.id)===key);
  if(!group)throw Error('The published subject no longer has this reading; ask the maintainer to reconcile the guide.');
  const restoration=sentenceContext.find(x=>x.slug===guide.slug&&x.key===key);
  const sentences=[];
  if(group.source||restoration){
    const record=await read('data/'+recordFilename(group.source||restoration.source));
    const supplied=group.selections[0];
    const selected=group.source?groupedParagraphs(group):locateSuppliedParagraphs(record,supplied.excerpt||supplied.original);
    const shown=completeSentenceParagraphs(record,selected);
    const authorization=authorizedRanges(record.metadata?.Authorized);
    const offsets=[];let text='';
    for(const p of record.en.paragraphs){offsets.push(text.length);text+=p.plain+'\n\n';}
    const spans=sentenceSpans(text);
    let range=0;
    for(const p of shown.paragraphs)for(const r of p.ranges){
      const start=offsets[p.number-1]+r.start,end=offsets[p.number-1]+r.end;
      const cuts=[...new Set([start,end,...spans.filter(s=>s.start>start&&s.start<end).map(s=>s.start)])].sort((a,b)=>a-b);
      range++;
      for(let i=0;i+1<cuts.length;i++){
        const piece=text.slice(cuts[i],cuts[i+1]),body=piece.trim();
        if(!body)continue;
        const lead=piece.length-piece.trimStart().length;
        sentences.push({text:body,after:piece.slice(lead+body.length),range,paragraph:p.number,authorized:isAuthorizedParagraph(authorization,p.number)});
      }
    }
    const mandatory=group.source?selected.some(p=>isAuthorizedParagraph(authorization,p.number)):importedMandatory(group,review);
    return finish({entry,sentences,mandatory,source:record.id,
      check:shortened=>{
        const kept=plain(()=>shortenParagraphs(record,shown.paragraphs,shortened,'-'));
        if(selected.some(p=>isAuthorizedParagraph(authorization,p.number))&&!kept.some(p=>isAuthorizedParagraph(authorization,p.number)))throw Error('A shortened reading must keep at least one sentence of its authorized translation (shown in blue).');
      }});
  }
  const s=group.selections[0],wording=s.excerpt||s.original||'';
  const spans=sentenceSpans(wording);
  spans.forEach((span,i)=>sentences.push({text:wording.slice(span.start,span.end),after:wording.slice(span.end,i+1<spans.length?spans[i+1].start:span.end),range:1,paragraph:1,authorized:false}));
  return finish({entry,sentences,mandatory:importedMandatory(group,review),source:null,check:shortened=>{plain(()=>shortenSupplied(wording,shortened,'-'));}});
}

// The build's messages name the guide and reading; the editor shows its own.
function plain(run){
  try{return run();}
  catch(error){const message=error.message.replace(/^Invalid shortened passage -: /,'');throw Error(message[0].toUpperCase()+message.slice(1));}
}

function importedMandatory(group,review){
  return group.selections.some(s=>(review?.importedAuthorityReview||[]).some(r=>r.id===s.id&&r.mandatoryAuthorized===true));
}

// Mark which sentences the entry now keeps, and expose the checks the build applies.
function finish({entry,sentences,mandatory,source,check}){
  const kept=keptSentences(sentences,entry.shortened);
  return {key:entry.key,source,mandatory,sentences:sentences.map((s,i)=>({...s,kept:kept.has(i)})),check};
}

// Contiguous kept sentences of the same range are joined with the source's own
// spacing, exactly as `shortened` stores them.
export function shortenedFrom(sentences,keep){
  const chosen=[...new Set(keep)].sort((a,b)=>a-b);
  if(!chosen.length)throw Error('Keep at least one sentence, or remove the reading instead.');
  if(chosen.some(i=>!Number.isInteger(i)||i<0||i>=sentences.length))throw Error('Unknown sentence.');
  if(chosen.length===sentences.length)return undefined;
  const pieces=[];let previous=null;
  for(const i of chosen){
    const s=sentences[i];
    if(previous!==null&&i===previous+1&&sentences[previous].range===s.range)pieces[pieces.length-1]+=sentences[previous].after+s.text;
    else pieces.push(s.text);
    previous=i;
  }
  return pieces;
}

function keptSentences(sentences,shortened){
  if(!shortened)return new Set(sentences.map((_,i)=>i));
  const kept=new Set();let from=0;
  for(const piece of shortened){
    // Find the run of consecutive sentences that rebuilds this piece.
    let found=false;
    for(let i=from;i<sentences.length&&!found;i++){
      let text=sentences[i].text,j=i;
      while(text.length<piece.length&&j+1<sentences.length&&sentences[j+1].range===sentences[j].range){text+=sentences[j].after+sentences[j+1].text;j++;}
      if(text===piece){for(let k=i;k<=j;k++)kept.add(k);from=j+1;found=true;}
    }
  }
  return kept;
}
