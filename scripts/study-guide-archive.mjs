// A reversible archive for the large verification export, not a reader payload.
// Repeated strings are stored once; even strings resembling references round-trip.
const prefix='\u0000pi-string:';
export function encodeGuideArchive(value){
  const counts=new Map();
  function count(v){if(typeof v==='string'){if(v.length>=80||v.startsWith(prefix))counts.set(v,(counts.get(v)||0)+1);}else if(Array.isArray(v))v.forEach(count);else if(v&&typeof v==='object')Object.values(v).forEach(count);}
  count(value);
  const strings=[...counts].filter(([s,n])=>n>1||s.startsWith(prefix)).map(([s])=>s),ids=new Map(strings.map((s,i)=>[s,i]));
  function encode(v){if(typeof v==='string')return ids.has(v)?prefix+ids.get(v):v;if(Array.isArray(v))return v.map(encode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]));return v;}
  return {format:'pi-guide-archive-1',strings,value:encode(value)};
}
export function decodeGuideArchive(archive){
  if(archive.format!=='pi-guide-archive-1'||!Array.isArray(archive.strings))throw Error('Unknown guide archive');
  function decode(v){if(typeof v==='string'&&v.startsWith(prefix)){const key=v.slice(prefix.length);if(!/^(0|[1-9][0-9]*)$/.test(key)||typeof archive.strings[Number(key)]!=='string')throw Error('Invalid guide archive reference');return archive.strings[Number(key)];}if(Array.isArray(v))return v.map(decode);if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,decode(x)]));return v;}
  return decode(archive.value);
}
