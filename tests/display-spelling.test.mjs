import test from 'node:test';
import assert from 'node:assert/strict';
import {correctDisplayText,correctDisplayHtml,correctDisplaySegments,installDisplaySpelling} from '../src/display-spelling.mjs';
import {renderInline} from '../src/text.mjs';

test('corrects the displayed name while retaining source plain text and offsets',()=>{
  const source="'Abduil-Baha spoke. Abduil-Bahá replied.";
  const rendered=renderInline(source);
  assert.equal(rendered.plain,source);
  assert.equal(rendered.html,"&#39;Abdu&#39;l-Baha spoke. Abdu&#39;l-Bahá replied.");
  assert.equal(correctDisplayText(source).length,source.length);
  assert.equal(correctDisplayText("Abdu'l-Baha"),"Abdu'l-Baha");
  assert.equal(correctDisplayText('XAbduil-BahaSuffix'),'XAbduil-BahaSuffix');
  assert.deepEqual(correctDisplaySegments(['Abdu','il-Baha']),['Abdu',"'l-Baha"]);
});

test('corrects the whole word with any following name, spacing or punctuation',()=>{
  const source="Abduil Baha; Abduil–Bahá; (Abduil), Abduil. Abduil-Bahai. Abduil";
  const expected="Abdu'l Baha; Abdu'l–Bahá; (Abdu'l), Abdu'l. Abdu'l-Bahai. Abdu'l";
  assert.equal(correctDisplayText(source),expected);
  assert.equal(correctDisplayText(source).length,source.length);
  assert.equal(correctDisplayText('XAbduil AbduilSuffix Abduil2 Abduil\u0301'),'XAbduil AbduilSuffix Abduil2 Abduil\u0301');
  assert.deepEqual(correctDisplaySegments(['O ', 'Ab', 'du', 'il', ' Baha!']),['O ', 'Ab', 'du', "'l", ' Baha!']);
  assert.equal(renderInline(source).plain,source);
});

test('corrects visible HTML without changing URLs, attributes, source code or editable text',()=>{
  const html='<a href="https://example.org/Abduil-Baha?q=>" id="Abduil-Baha">Abduil-Baha</a><!-- Abduil-Baha --><script>const name="Abduil-Baha";</script><style>.Abduil-Baha{}</style><textarea>Abduil-Baha</textarea><em>Abduil-Baha</em>';
  assert.equal(correctDisplayHtml(html),'<a href="https://example.org/Abduil-Baha?q=>" id="Abduil-Baha">Abdu\'l-Baha</a><!-- Abduil-Baha --><script>const name="Abduil-Baha";</script><style>.Abduil-Baha{}</style><textarea>Abduil-Baha</textarea><em>Abdu\'l-Baha</em>');
  assert.equal(correctDisplayHtml(correctDisplayHtml(html)),correctDisplayHtml(html));
  const script='<script>const template="</textarea>";const name="Abduil-Baha";</script>';
  assert.equal(correctDisplayHtml(script),script);
});

test('corrects an asynchronously highlighted word using its containing text',()=>{
  const originalObserver=globalThis.MutationObserver;
  let notify,disconnected=false;
  globalThis.MutationObserver=class {
    constructor(callback){notify=callback;}
    observe(){}
    disconnect(){disconnected=true;}
  };
  try{
    const paragraph={closest:()=>null,textNodes:[]};
    const doc={documentElement:paragraph,createTreeWalker(root){
      let index=0;return {currentNode:null,nextNode(){this.currentNode=root.textNodes[index++];return Boolean(this.currentNode);}};
    }};
    const stop=installDisplaySpelling(doc);
    // A partial query highlight separates the name into inline text nodes.
    paragraph.textNodes=['O ', 'Abdu', 'il Baha!'].map(data=>({data,nodeType:3,parentElement:paragraph,parentNode:paragraph}));
    notify([{type:'childList',target:paragraph,addedNodes:paragraph.textNodes}]);
    assert.deepEqual(paragraph.textNodes.map(n=>n.data),['O ', 'Abdu', "'l Baha!"]);
    // A subsequent observer delivery must be stable.
    notify([{type:'characterData',target:paragraph.textNodes[2]}]);
    assert.equal(paragraph.textNodes.map(n=>n.data).join(''),"O Abdu'l Baha!");
    stop();assert.equal(disconnected,true);
  }finally{if(originalObserver===undefined)delete globalThis.MutationObserver;else globalThis.MutationObserver=originalObserver;}
});
