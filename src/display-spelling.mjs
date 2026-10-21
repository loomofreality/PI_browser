// Presentation correction only. Source bytes, plain text, quotation offsets,
// catalogue identity, and link destinations remain unchanged.
export function correctDisplayText(value){
  return String(value).replace(/(?<![\p{L}\p{N}\p{M}])Abduil(?![\p{L}\p{N}\p{M}])/giu,"Abdu'l");
}
export function correctDisplaySegments(segments){
  const corrected=correctDisplayText(segments.join(''));let at=0;
  return segments.map(s=>{const text=corrected.slice(at,at+s.length);at+=s.length;return text;});
}

// Generated HTML is already escaped by the ordinary renderers. Correct text
// tokens without rewriting attributes, comments, or executable/style content.
export function correctDisplayHtml(html){
  let raw=null;
  return String(html).replace(/<!--[\s\S]*?-->|<(?:[^>"']|"[^"]*"|'[^']*')*>|[^<]+|</g,token=>{
    if(token.startsWith('<')){
      const tag=/^<\s*(\/?)\s*(script|style|textarea)\b/i.exec(token);
      if(tag){if(raw){if(tag[1]&&tag[2].toLowerCase()===raw)raw=null;}else if(!tag[1])raw=tag[2].toLowerCase();}
      return token;
    }
    return raw?token:correctDisplayText(token);
  });
}

// Covers cached catalogue HTML and text added by the on-demand readers, as
// well as labels, search snippets and document titles. Never edit form values.
export function installDisplaySpelling(doc=document){
  const correct=root=>{
    const nodes=[],add=node=>{if(!node.parentElement?.closest('script,style,textarea,[contenteditable]'))nodes.push(node);};
    if(root.nodeType===3)add(root);else{const walker=doc.createTreeWalker(root,4);while(walker.nextNode())add(walker.currentNode);}
    const pieces=correctDisplaySegments(nodes.map(n=>n.data));
    nodes.forEach((node,i)=>{if(node.data!==pieces[i])node.data=pieces[i];});
  };
  correct(doc.documentElement);
  // Inspect the containing element: highlighting can split a word across
  // several newly inserted text nodes and inline elements.
  const observer=new MutationObserver(changes=>{for(const change of changes)correct(change.target.parentNode&&change.type==='characterData'?change.target.parentNode:change.target);});
  observer.observe(doc.documentElement,{childList:true,characterData:true,subtree:true});
  return ()=>observer.disconnect();
}
if(typeof document!=='undefined')installDisplaySpelling();
