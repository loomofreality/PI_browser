// Reconstruct already escaped HTML; reference objects cannot collide with source strings.
export async function decodeGuideHtmlPayload(text,readDictionary){
 if(!text.startsWith('{'))return text;
 const payload=JSON.parse(text);
 if(payload.format!=='pi-guide-html-1'||!Array.isArray(payload.parts))throw Error('Invalid shared guide payload');
 const parts=[...payload.parts],jobs=new Map();
 for(let i=0;i<parts.length;i++){
  const part=parts[i];if(typeof part==='string')continue;
  if(!part||Object.keys(part).length!==1||!Array.isArray(part.ref)||part.ref.length!==2||!/^[a-f0-9]{64}$/.test(part.ref[0])||!Number.isSafeInteger(part.ref[1])||part.ref[1]<0)throw Error('Invalid shared paragraph reference');
  const [file,index]=part.ref;if(!jobs.has(file))jobs.set(file,[]);jobs.get(file).push({index,position:i});
 }
 const queue=[...jobs];let next=0;
 await Promise.all(Array.from({length:Math.min(4,queue.length)},async()=>{
  while(next<queue.length){const [file,refs]=queue[next++],dictionary=await readDictionary(file);
   if(!Array.isArray(dictionary)||dictionary.some(s=>typeof s!=='string'))throw Error('Invalid shared paragraph dictionary');
   for(const {index,position}of refs){if(index>=dictionary.length)throw Error('Missing shared paragraph');parts[position]=dictionary[index];}
  }
 }));
 return parts.join('');
}
