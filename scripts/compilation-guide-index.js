// Reorder the one-line guide list. The build lists guides by centrality, the
// default, so the list reads correctly before this runs. The guide loader shows
// the overview again in place, so setup is repeatable on the same elements.
(()=>{
  const orders=['centrality','alphabetical','quotations'];
  const collator=new Intl.Collator('en',{sensitivity:'base',ignorePunctuation:true});
  function setup(){
    const select=document.getElementById('guide-sort'),list=document.getElementById('guide-list');
    if(!select||!list)return;
    const requested=new URL(location.href).searchParams.get('sort');
    select.value=orders.includes(requested)?requested:'centrality';
    const apply=()=>{
      const key=select.value,rows=[...list.children];
      // Many guides choose the same number of quotations; the larger subject comes first.
      const count=(row,name)=>key==='alphabetical'?0:Number(row.dataset[name]);
      rows.sort((a,b)=>count(b,key)-count(a,key)||(key==='quotations'?count(b,'total')-count(a,'total'):0)||collator.compare(a.dataset.title,b.dataset.title));
      list.append(...rows);
    };
    apply();
    select.onchange=()=>{
      apply();
      const url=new URL(location.href);
      if(select.value==='centrality')url.searchParams.delete('sort');else url.searchParams.set('sort',select.value);
      history.replaceState(history.state,'',url);
    };
  }
  if(!window.piGuideIndex){window.piGuideIndex=true;document.addEventListener('pi-guide-shown',setup);}
  setup();
})();
