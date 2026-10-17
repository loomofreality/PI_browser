import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync,gunzipSync,brotliCompressSync,brotliDecompressSync,constants} from 'node:zlib';
import {encodeGuideArchive,decodeGuideArchive} from './study-guide-archive.mjs';
import {packGuideParagraphs} from './pack-guide-paragraphs.mjs';

// The overview and each guide's PDF view stay complete pages, so the reader
// opens them in one request; the loader lets them show one another in place.
// The regular view keeps its source context in a compressed payload. Verify
// exact reconstruction before replacing it; the reader receives the same
// escaped HTML as before.
export async function packStudyGuides(root,out){
  const directory=path.join(out,'study-guides'),pages=new Map();
  const marker='<template id="guide-shared-quotations"></template>',loader='<script type="module" src="guide-loader.mjs"></script>';
  const pack=bytes=>{const zipped=gzipSync(bytes,{level:9});if(!gunzipSync(zipped).equals(bytes))throw Error('Guide packaging changed content');return zipped;};
  for(const name of await fs.readdir(directory)){
    if(!name.endsWith('.html'))continue;
    const file=path.join(directory,name),html=await fs.readFile(file,'utf8');
    if(name==='index.html'||name.endsWith('-pdf.html')){
      if(name!=='index.html'&&html.includes('id="guide-loading"'))throw Error('Rebuild study guides before packaging: '+name);
      if(html.includes('</head>')&&!html.includes(loader))await fs.writeFile(file,html.replace('</head>',loader+'</head>'));
      await fs.rm(file+'.gz',{force:true});
      continue;
    }
    const match=/^([\s\S]*?<body[^>]*>)([\s\S]*)(<\/body><\/html>\s*)$/.exec(html);
    if(!match)throw Error('Unexpected guide document: '+name);
    const packed=html.includes('src="guide-loader.mjs"');
    const body=packed?gunzipSync(await fs.readFile(file+'.gz')).toString():match[2];
    if(body.includes(marker))continue;
    pages.set(name,{file,html,match,body,packed});
  }
  for(const [name,page]of pages){
    const first=page.body.indexOf('<article class="quotation"'),last=page.body.lastIndexOf('</article>')+'</article>'.length;
    if(first<0||last<=first)continue;
    const quotes=page.body.slice(first,last),template=page.body.slice(0,first)+marker+page.body.slice(last);
    if(template.replace(marker,()=>quotes)!==page.body)throw Error('Packaged quotations changed page: '+name);
    await fs.writeFile(path.join(directory,name.replace(/\.html$/,'.quotations.html.gz')),pack(Buffer.from(quotes)));
    page.body=template;
  }
  for(const page of pages.values()){
    const {file,match,body,packed}=page;
    await fs.writeFile(file+'.gz',pack(Buffer.from(body)));
    if(packed)continue;
    const heading=match[2].match(/<h1>[\s\S]*?<\/h1>/)?.[0]||'<h1>Study guide</h1>';
    const header=match[2].match(/<header>[\s\S]*?<\/header>/)?.[0]||'';
    const head=match[1].replace('<script src="pilot-view.js" defer></script>','').replace('</head>','<script type="module" src="guide-loader.mjs"></script></head>');
    await fs.writeFile(file,head+header+'<main id="main" aria-busy="true">'+heading+'<p role="status" id="guide-loading">Opening the study guide…</p><noscript>Please enable JavaScript to read this guide.</noscript></main>'+match[3]);
  }
  for(const name of ['compiled.json','validation.json','sentence-review.json']){
    const file=path.join(directory,name);let bytes;
    try{bytes=await fs.readFile(file);}catch(error){if(error.code==='ENOENT')continue;throw error;}
    // Remove formatting whitespace only; string values and all source data stay exact.
    const value=JSON.parse(bytes);
    if(name==='compiled.json'){
      const archive=encodeGuideArchive(value);
      if(JSON.stringify(decodeGuideArchive(archive))!==JSON.stringify(value))throw Error('Guide archive changed content');
      // The verification export is downloaded by tools, not the browser reader.
      // Brotli saves publication space without changing its reversible data format.
      const archiveBytes=Buffer.from(JSON.stringify(archive));
      const compressed=brotliCompressSync(archiveBytes,{params:{[constants.BROTLI_PARAM_QUALITY]:6}});
      if(!brotliDecompressSync(compressed).equals(archiveBytes))throw Error('Guide archive compression changed content');
      await fs.writeFile(path.join(directory,'compiled.archive.json.br'),compressed);
      await fs.rm(path.join(directory,'compiled.archive.json.gz'),{force:true});
      await fs.rm(file+'.gz',{force:true});
    }else await fs.writeFile(file+'.gz',pack(Buffer.from(JSON.stringify(value))));
    await fs.unlink(file);
  }
  const paragraphPackaging=await packGuideParagraphs(directory);
  console.log('Shared guide paragraphs:',paragraphPackaging);
  await fs.copyFile(new URL('./guide-html-payload.mjs',import.meta.url),path.join(directory,'guide-html-payload.mjs'));
  await fs.copyFile(path.join(root,'scripts/compilation-guide-loader.mjs'),path.join(directory,'guide-loader.mjs'));
}
