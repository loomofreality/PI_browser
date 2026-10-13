import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {pdfBase,pdfHref} from '../src/pdf-hosting.mjs';
import {renderVolume} from '../src/volumes.mjs';

test('volume PDFs resolve against the configured PDF site or this site',()=>{
  const base=pdfBase({url:'https://owner.github.io/Volumes/'});
  assert.equal(base,'https://owner.github.io/Volumes/');
  assert.equal(pdfHref('pdf-volumes/volume-7.pdf',base),'https://owner.github.io/Volumes/pdf-volumes/volume-7.pdf');
  assert.equal(pdfHref('pdf-volumes/volume-7.pdf',null),'./pdf-volumes/volume-7.pdf');
  assert.equal(pdfHref('../secret.pdf',base),null);
  for(const url of ['','http://owner.github.io/Volumes/','https://owner.github.io/Volumes','javascript:alert(1)','https://owner.github.io/V/?x=1'])assert.equal(pdfBase({url}),null,url);
  assert.match(renderVolume('7',{'7':'pdf-volumes/volume-7.pdf'},{'7':'Seven'},base),/href="https:\/\/owner\.github\.io\/Volumes\/pdf-volumes\/volume-7\.pdf"/);
});
test('the committed PDF hosting setting is valid',async()=>{
  const config=JSON.parse(await fs.readFile('src/pdf-hosting.json','utf8'));
  if(config.url){assert.ok(pdfBase(config));assert.match(config.repository,/^[\w.-]+\/[\w.-]+$/);}
});
