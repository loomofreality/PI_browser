// Volume PDFs can be served from a separate GitHub Pages site so that they do
// not count against this site's 1 GB limit. pdf-hosting.json names that site;
// an empty "url" serves the PDFs from this site's own pdf-volumes/ folder.
export function pdfBase(config){
  const value=config?.url;
  if(!value)return null;
  try{const url=new URL(value);return url.protocol==='https:'&&url.pathname.endsWith('/')&&!url.search&&!url.hash?url.href:null;}catch{return null;}
}
// file is a manifest path such as pdf-volumes/volume-12.pdf.
export function pdfHref(file,base){
  if(!/^pdf-volumes\/volume-\d+\.pdf$/.test(file))return null;
  return base?new URL(file,base).href:'./'+file;
}
export async function loadPdfBase(location='./pdf-hosting.json'){
  try{const response=await fetch(location);return response.ok?pdfBase(await response.json()):null;}catch{return null;}
}
