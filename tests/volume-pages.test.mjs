import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {frontMatterPages,countVolumePages} from '../scripts/volume-pages.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');

test('the opening matter ends at the first bookmarked text',async()=>{
  const reference={num:40,gen:0};
  const pdf=(outline,named={})=>({getOutline:async()=>outline,getDestination:async name=>named[name]??null,getPageIndex:async ref=>ref===reference?17:assert.fail('unknown page')});
  assert.equal(await frontMatterPages(pdf([{title:'AB02022',dest:[reference,{name:'XYZ'}]},{title:'AB04542',dest:[3]}])),17);
  assert.equal(await frontMatterPages(pdf([{title:'BB00297',dest:'first'}],{first:[13,{name:'Fit'}]})),13);
  assert.equal(await frontMatterPages(pdf([])),null);
  assert.equal(await frontMatterPages(pdf(null)),null);
});

test('volume page totals leave out the opening matter and tables of contents',async t=>{
  const source=path.join(root,'pdf_volumes - copy');
  const name=(await fs.readdir(source).catch(()=>[])).find(file=>/^volume_118\b/.test(file));
  if(!name)return t.skip('volume PDFs are not present');
  // Volume 118: 166 pages, the first text (AB02022) on page 18.
  assert.deepEqual(await countVolumePages(root,{118:'pdf-volumes/volume-118.pdf'}),{total:149,volumes:{118:149}});
  // The catalogue volume has no bookmarks; its declared cover, contents and blank page are left out.
  const catalogue=await countVolumePages(root,{193:'pdf-volumes/volume-193.pdf'});
  assert.equal(catalogue.total,1395);
});

test('the built statistics carry the volume page total',async t=>{
  const stats=JSON.parse(await fs.readFile(path.join(root,'dist','stats.json'),'utf8').catch(()=>'null'));
  if(!stats)return t.skip('no build output');
  assert.ok(Number.isInteger(stats.volumePages)&&stats.volumePages>0);
});
