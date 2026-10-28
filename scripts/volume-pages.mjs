import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import '../src/map-polyfill.mjs';

// PDF.js 6 also expects Promise.try and Uint8Array.prototype.toHex, which Node 22 lacks.
if(typeof Promise.try!=='function')Object.defineProperty(Promise,'try',{configurable:true,writable:true,value(callback,...args){return new Promise(resolve=>resolve(callback(...args)));}});
if(typeof Uint8Array.prototype.toHex!=='function')Object.defineProperty(Uint8Array.prototype,'toHex',{configurable:true,writable:true,value(){return Buffer.from(this.buffer,this.byteOffset,this.byteLength).toString('hex');}});

// The opening matter and table of contents end where the first bookmark (the first text) begins.
// Volumes without bookmarks list their opening page count in data/volume-front-matter.json.
export async function frontMatterPages(pdf){
  const outline=await pdf.getOutline();
  if(!outline?.length)return null;
  let destination=outline[0].dest;
  if(typeof destination==='string')destination=await pdf.getDestination(destination);
  if(!Array.isArray(destination))return null;
  const target=destination[0];
  return Number.isInteger(target)?target:await pdf.getPageIndex(target);
}

// The bundled browser PDF.js reads the files; its URL is built at run time so the build-input scan
// does not follow PDF.js's own dynamic imports. The PDFs themselves are build inputs.
export async function countVolumePages(root,volumes){
  const lib=await import(pathToFileURL(path.join(root,'src','vendor','pdfjs','pdf.mjs')).href);
  const declared=JSON.parse(await fs.readFile(path.join(root,'data','volume-front-matter.json'),'utf8'));
  const source=path.join(root,'pdf_volumes - copy');
  const names=new Map((await fs.readdir(source)).map(name=>[/^volume_(\d+)\b.*\.pdf$/i.exec(name),name]).filter(([match])=>match).map(([match,name])=>[String(Number(match[1])),name]));
  const pages={};
  for(const number of Object.keys(volumes).sort((a,b)=>a-b)){
    const task=lib.getDocument({data:new Uint8Array(await fs.readFile(path.join(source,names.get(number)))),isEvalSupported:false,disableFontFace:true,verbosity:0});
    try{
      const pdf=await task.promise;
      const opening=Object.hasOwn(declared,number)?declared[number]:await frontMatterPages(pdf);
      if(!Number.isInteger(opening)||opening<0||opening>=pdf.numPages)throw Error(`Cannot find where the texts begin in volume ${number}; add its opening page count to data/volume-front-matter.json`);
      pages[number]=pdf.numPages-opening;
    }finally{await task.destroy();}
  }
  return {total:Object.values(pages).reduce((sum,count)=>sum+count,0),volumes:pages};
}
