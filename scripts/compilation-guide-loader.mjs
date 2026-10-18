// The regular view reconstructs the exact escaped HTML checked by the guide
// builder. Moving between the overview and guides swaps the page in place, as
// Catalog view does: each page is downloaded once per visit, starting as soon as
// a link is pointed at, and a link the reader follows falls back to a normal
// page load whenever it cannot be read.
import {decodeGuideHtmlPayload} from './guide-html-payload.mjs';
const marker='<template id="guide-shared-quotations"></template>';
const base=new URL('./',import.meta.url);
const pages=new Map(),dictionaries=new Map(),loaded=new Set();
async function readPayload(source){
  const response=await fetch(source);
  if(!response.ok||!response.body)throw Error('The guide could not be downloaded.');
  return new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).text();
}
function remember(cache,key,start){
  if(!cache.has(key)){const job=start();cache.set(key,job);job.catch(()=>cache.delete(key));}
  return cache.get(key);
}
const dictionary=hash=>remember(dictionaries,hash,async()=>JSON.parse(await readPayload(new URL('shared-paragraphs/'+hash+'.json.gz',base))));
// Only the overview and guide pages in this directory are shown in place.
function pageName(url){
  if(url.origin!==base.origin||!url.pathname.startsWith(base.pathname))return null;
  const name=url.pathname.slice(base.pathname.length)||'index.html';
  return name==='index.html'||/^[a-z]+(?:-pdf)?\.html$/.test(name)?name:null;
}
function load(name){
  return remember(pages,name,async()=>{
    // The overview and PDF views are complete pages; the regular view is a packaged payload.
    if(name==='index.html'||name.endsWith('-pdf.html')){
      const response=await fetch(new URL(name,base));
      if(!response.ok)throw Error('The page could not be downloaded.');
      const page=new DOMParser().parseFromString(await response.text(),'text/html');
      if(page.getElementById('guide-loading'))throw Error('Unexpected guide shell.');
      return {title:page.title,className:page.body.className,html:page.body.innerHTML};
    }
    const quotations=readPayload(new URL(name.replace(/\.html$/,'.quotations.html.gz'),base)).catch(error=>error);
    let html=await readPayload(new URL(name+'.gz',base));
    if(html.includes(marker)){
      const shared=await quotations;if(shared instanceof Error)throw shared;
      const text=await decodeGuideHtmlPayload(shared,dictionary);html=html.replace(marker,()=>text);
    }
    const heading=new DOMParser().parseFromString(html,'text/html').querySelector('h1')?.textContent.trim()||'Study guide';
    return {title:`${heading} · Partial Inventory browser`,className:'',html};
  });
}
async function show(page){
  document.title=page.title;document.body.className=page.className;document.body.innerHTML=page.html;
  document.dispatchEvent(new Event('pi-guide-page'));
  const script=document.body.classList.contains('pdf-view')?'./pilot-view.js':document.getElementById('guide-list')?'./guide-index.js':null;
  if(script){const first=!loaded.has(script);loaded.add(script);await import(script);if(!first)document.dispatchEvent(new Event('pi-guide-shown'));}
}
function anchorTarget(){
  let anchor;try{anchor=decodeURIComponent(location.hash.slice(1));}catch{}
  return anchor?document.getElementById(anchor):null;
}
let current=pageName(new URL(location.href)),request=0;
history.scrollRestoration='manual';
const saveScroll=()=>history.replaceState({...history.state,guideScroll:scrollY},'');
async function navigate(url,{push,scroll}){
  const name=pageName(url),token=++request;
  document.documentElement.classList.add('guide-busy');
  try{
    const page=await load(name);
    if(token!==request)return;
    if(push){saveScroll();history.pushState({},'',url);}
    current=name;await show(page);
    const target=anchorTarget();
    if(scroll!==undefined)scrollTo(0,scroll);else if(target)target.scrollIntoView();else scrollTo(0,0);
    if(push){const heading=document.querySelector('h1');if(heading){heading.tabIndex=-1;heading.focus({preventScroll:true});}}
  }catch(error){
    console.error(error);
    if(token===request)location.assign(url);
  }finally{if(token===request)document.documentElement.classList.remove('guide-busy');}
}
function guideLink(event){
  const link=event.target.closest?.('a[href]');
  if(!link||link.target||link.hasAttribute('download'))return null;
  const url=new URL(link.href,location.href);
  return pageName(url)?url:null;
}
document.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  const url=guideLink(event);if(!url)return;
  // A link within the page that is already shown keeps the browser's own behaviour.
  if(pageName(url)===current&&url.search===location.search&&url.hash)return;
  event.preventDefault();
  navigate(url,{push:url.href!==location.href});
});
for(const type of ['pointerover','focusin','touchstart'])document.addEventListener(type,event=>{
  const url=guideLink(event);if(url&&pageName(url)!==current)load(pageName(url)).catch(()=>{});
},{passive:true});
addEventListener('popstate',event=>{
  const scroll=event.state?.guideScroll,url=new URL(location.href);
  if(pageName(url)!==current)return navigate(url,{push:false,scroll});
  if(scroll!==undefined)scrollTo(0,scroll);else if(url.hash)anchorTarget()?.scrollIntoView();else scrollTo(0,0);
});
addEventListener('pagehide',saveScroll);

if(document.getElementById('guide-loading'))try{
  await show(await load(current));
  await document.fonts.ready;
  anchorTarget()?.scrollIntoView();
}catch(error){
  const status=document.getElementById('guide-loading');
  if(status){status.textContent='The study guide could not be opened. Reload this page to try again.';document.getElementById('main').setAttribute('aria-busy','false');}
  console.error(error);
}
else if(current)pages.set(current,Promise.resolve({title:document.title,className:document.body.className,html:document.body.innerHTML}));
