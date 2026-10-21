import test from 'node:test';
import assert from 'node:assert/strict';
import {correctDisplayText,correctDisplayHtml,correctDisplaySegments} from '../src/display-spelling.mjs';
import {renderInline} from '../src/text.mjs';

test('corrects the displayed name while retaining source plain text and offsets',()=>{
  const source="'Abduil-Baha spoke. Abduil-Bahá replied.";
  const rendered=renderInline(source);
  assert.equal(rendered.plain,source);
  assert.equal(rendered.html,"&#39;Abdu&#39;l-Baha spoke. Abdu&#39;l-Baha replied.");
  assert.equal(correctDisplayText(source).length,source.length);
  assert.equal(correctDisplayText("Abdu'l-Baha"),"Abdu'l-Baha");
  assert.equal(correctDisplayText('XAbduil-BahaSuffix'),'XAbduil-BahaSuffix');
  assert.deepEqual(correctDisplaySegments(['Abdu','il-Baha']),['Abdu',"'l-Baha"]);
});

test('corrects visible HTML without changing URLs, attributes, source code or editable text',()=>{
  const html='<a href="https://example.org/Abduil-Baha?q=>" id="Abduil-Baha">Abduil-Baha</a><!-- Abduil-Baha --><script>const name="Abduil-Baha";</script><style>.Abduil-Baha{}</style><textarea>Abduil-Baha</textarea><em>Abduil-Baha</em>';
  assert.equal(correctDisplayHtml(html),'<a href="https://example.org/Abduil-Baha?q=>" id="Abduil-Baha">Abdu\'l-Baha</a><!-- Abduil-Baha --><script>const name="Abduil-Baha";</script><style>.Abduil-Baha{}</style><textarea>Abduil-Baha</textarea><em>Abdu\'l-Baha</em>');
  assert.equal(correctDisplayHtml(correctDisplayHtml(html)),correctDisplayHtml(html));
  const script='<script>const template="</textarea>";const name="Abduil-Baha";</script>';
  assert.equal(correctDisplayHtml(script),script);
});
