// Reviewed study-guide sentence paragraphs.
//
// study-guides/sentence-paragraphs.json stores, for each source, its English
// version and the reviewed paragraphs as compact rows:
//   [paragraph, textSha, reasonIndex]                      or
//   [paragraph, textSha, reasonIndex, [nextParagraph, nextTextSha]]
// textSha is the first 16 hex digits of the SHA-256 of the paragraph's plain
// text. Together with the source version it detects any change of wording
// without storing a second copy of the paragraph. Reasons are stored once in
// the "reasons" table.
//
// New reviews may still be appended to an optional "entries" array in the
// original long form ({source, sourceVersion, paragraph, text, reason,
// continuation:{paragraph,text}}). Run `node scripts/sentence-paragraphs.mjs
// compact` to fold them into the compact table.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

export const textSha=text=>createHash('sha256').update(text).digest('hex').slice(0,16);
const defaultFile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../study-guides/sentence-paragraphs.json');

// Expand the stored file into entries {source, sourceVersion, paragraph,
// textSha, reason, continuation?:{paragraph, textSha}}. Long-form entries keep
// their text and are checked against it directly.
export function expandSentenceParagraphs(data){
  const entries=[];
  const reasons=data.reasons||[];
  for(const [source,{version,paragraphs}] of Object.entries(data.sources||{})){
    for(const row of paragraphs){
      const [paragraph,sha,reason,next]=row;
      if(!Number.isInteger(paragraph)||!/^[a-f\d]{16}$/.test(sha)||reasons[reason]===undefined)throw Error(`Invalid reviewed sentence paragraph: ${source}:${paragraph}`);
      const entry={source,sourceVersion:version,paragraph,textSha:sha,reason:reasons[reason]};
      if(next){
        if(!Number.isInteger(next[0])||!/^[a-f\d]{16}$/.test(next[1]))throw Error(`Invalid reviewed continuation: ${source}:${paragraph}`);
        entry.continuation={paragraph:next[0],textSha:next[1]};
      }
      entries.push(entry);
    }
  }
  for(const entry of data.entries||[])entries.push(entry);
  return entries;
}

// True when a stored entry (compact or long form) matches this paragraph text.
export function sameReviewedText(entry,text){
  if(typeof text!=='string')return false;
  return entry.text!==undefined?entry.text===text:entry.textSha===textSha(text);
}

export function compactSentenceParagraphs(data){
  const entries=expandSentenceParagraphs(data);
  const reasons=[],reasonIndex=new Map(),sources={};
  const seen=new Set();
  for(const entry of entries){
    const key=entry.source+'\0'+entry.paragraph;
    if(seen.has(key))throw Error(`Duplicate reviewed sentence paragraph: ${entry.source}:${entry.paragraph}`);
    seen.add(key);
    if(!reasonIndex.has(entry.reason)){reasonIndex.set(entry.reason,reasons.length);reasons.push(entry.reason);}
    const target=sources[entry.source]??={version:entry.sourceVersion,paragraphs:[]};
    if(target.version!==entry.sourceVersion)throw Error(`Reviewed sentence paragraphs for ${entry.source} use two source versions`);
    const row=[entry.paragraph,entry.textSha??textSha(entry.text),reasonIndex.get(entry.reason)];
    if(entry.continuation)row.push([entry.continuation.paragraph,entry.continuation.textSha??textSha(entry.continuation.text)]);
    target.paragraphs.push(row);
  }
  return {format:2,reasons,sources};
}

// One source per line keeps Git diffs small and readable.
export function formatSentenceParagraphs(data){
  const lines=['{','  "format": 2,','  "reasons": ['];
  data.reasons.forEach((reason,i)=>lines.push('    '+JSON.stringify(reason)+(i<data.reasons.length-1?',':'')));
  lines.push('  ],','  "sources": {');
  const names=Object.keys(data.sources);
  names.forEach((name,i)=>lines.push('    '+JSON.stringify(name)+': '+JSON.stringify(data.sources[name])+(i<names.length-1?',':'')));
  lines.push('  }','}','');
  return lines.join('\n');
}

export function loadSentenceParagraphs(file=defaultFile){
  return expandSentenceParagraphs(JSON.parse(fs.readFileSync(file,'utf8')));
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]!=='compact')throw Error('Usage: node scripts/sentence-paragraphs.mjs compact [file]');
  const file=path.resolve(process.argv[3]||defaultFile);
  const before=fs.readFileSync(file,'utf8');
  const compact=compactSentenceParagraphs(JSON.parse(before));
  fs.writeFileSync(file,formatSentenceParagraphs(compact));
  console.log(`Compacted ${Object.values(compact.sources).reduce((n,s)=>n+s.paragraphs.length,0)} reviewed paragraphs from ${Object.keys(compact.sources).length} sources: ${before.length} -> ${fs.statSync(file).size} bytes`);
}
