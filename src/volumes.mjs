import {escapeHtml} from './text.mjs';
import {pdfHref} from './pdf-hosting.mjs';

export function renderVolume(value,volumes,titles={},base=null){
  const key=/^\d+$/.test(String(value).trim())?String(Number(value)):null;
  const file=key&&volumes[key];
  const label=key&&titles[key]||value;
  const href=file&&pdfHref(file,base);
  if(!href)return escapeHtml(label);
  return `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" aria-label="Open volume ${escapeHtml(value)} PDF">${escapeHtml(label)}</a>`;
}
