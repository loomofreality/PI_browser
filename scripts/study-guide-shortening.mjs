// Editorial shortening of a reading entry. A guide's order entry may list, in
// `shortened`, the verbatim spans of whole sentences it shows from its passage.
// The wording is never changed: every span must lie inside the passage the
// guide would otherwise show and begin and end on a sentence boundary.
import {sentenceSpans} from './study-guide-sentences.mjs';

const fail=(label,message)=>{throw Error(`Invalid shortened passage ${label}: ${message}`);};

function checkSpans(shortened,label){
 if(!Array.isArray(shortened)||!shortened.length)fail(label,'expected a list of kept sentences');
 for(const piece of shortened)if(typeof piece!=='string'||!piece.trim()||piece!==piece.trim())fail(label,'each kept span must be non-empty trimmed text');
}

// `paragraphs` are the sentence-complete ranges of a linked record. Returns
// the kept ranges in the same shape, with `gap` marking omitted text before a
// paragraph that the source paragraph numbers alone would not show.
export function shortenParagraphs(record,paragraphs,shortened,label){
 checkSpans(shortened,label);
 const offsets=[];let text='';
 for(const p of record.en.paragraphs){offsets.push(text.length);text+=p.plain+'\n\n';}
 const spans=sentenceSpans(text),starts=new Set(),ends=new Set();
 for(const s of spans){starts.add(s.start);ends.add(s.end);}
 const shown=paragraphs.flatMap(p=>p.ranges.map(r=>({number:p.number,start:offsets[p.number-1]+r.start,end:offsets[p.number-1]+r.end})));
 for(const r of shown){starts.add(r.start);ends.add(r.end);}
 const kept=[];let cursor=0,position=-1;
 for(const piece of shortened){
  // The first occurrence on sentence boundaries counts: a short sentence such
  // as “Say:” can also begin a longer one earlier in the passage.
  let found=-1,range,inside=false;
  for(const [i,r] of shown.entries()){
   if(i<position)continue;
   for(let at=text.indexOf(piece,Math.max(r.start,i===position?cursor:0));at>=0&&at+piece.length<=r.end;at=text.indexOf(piece,at+1)){
    inside=true;
    if(starts.has(at)&&ends.has(at+piece.length)){found=at;range=i;break;}
   }
   if(found>=0)break;
  }
  if(found<0)fail(label,inside?`“${piece.slice(0,60)}…” does not begin and end on sentence boundaries`:`“${piece.slice(0,60)}…” is not in the passage, or is out of order`);
  kept.push({range,start:found,end:found+piece.length});
  position=range;cursor=found+piece.length;
 }
 const total=shown.reduce((n,r)=>n+r.end-r.start,0),keptLength=kept.reduce((n,r)=>n+r.end-r.start,0);
 if(keptLength>=total)fail(label,'keeps the whole passage; remove `shortened` instead');
 const result=[];let previous=null;
 for(const k of kept){
  const number=shown[k.range].number,base=offsets[number-1];
  // Omitted text between two kept spans of the same paragraph is shown as an
  // ellipsis by the renderer; contiguous sentences are one range.
  const last=result.at(-1);
  const omittedBefore=previous!==null&&!/^\s*$/u.test(text.slice(previous.end,k.start));
  if(last&&last.number===number){
   if(!omittedBefore)last.ranges.at(-1).end=k.end-base;
   else last.ranges.push({start:k.start-base,end:k.end-base});
  }else result.push({number,ranges:[{start:k.start-base,end:k.end-base}],gap:omittedBefore});
  previous=k;
 }
 return result;
}

// A supplied (unlinked) quotation is shortened within its supplied wording.
export function shortenSupplied(wording,shortened,label){
 checkSpans(shortened,label);
 const spans=sentenceSpans(wording),starts=new Set([0,...spans.map(s=>s.start)]),ends=new Set([wording.trimEnd().length,...spans.map(s=>s.end)]);
 const pieces=[];let cursor=0,previous=null;
 for(const piece of shortened){
  let at=wording.indexOf(piece,cursor);
  const inside=at>=0;
  while(at>=0&&!(starts.has(at)&&ends.has(at+piece.length)))at=wording.indexOf(piece,at+1);
  if(at<0)fail(label,inside?`“${piece.slice(0,60)}…” does not begin and end on sentence boundaries`:`“${piece.slice(0,60)}…” is not in the supplied wording, or is out of order`);
  if(previous!==null&&/^\s*$/u.test(wording.slice(previous,at)))pieces[pieces.length-1]=wording.slice(cursor-pieces.at(-1).length,at+piece.length);
  else pieces.push(piece);
  previous=at+piece.length;cursor=previous;
 }
 if(pieces.join('').length>=wording.trim().length)fail(label,'keeps the whole quotation; remove `shortened` instead');
 return pieces;
}
