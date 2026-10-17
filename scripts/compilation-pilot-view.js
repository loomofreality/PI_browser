// The guide loader may show several guides in one page visit, so setup is
// repeatable and binds the current page's print button each time.
(()=>{
  function updatePrintHeader(){
    const heading=document.querySelector('h1');if(!heading)return;
    document.documentElement.style.setProperty('--print-subject',JSON.stringify(heading.textContent));
    document.documentElement.style.setProperty('--print-stamp',JSON.stringify(new Intl.DateTimeFormat(undefined,{dateStyle:'medium',timeStyle:'short'}).format(new Date())));
  }
  function setup(){
    const button=document.getElementById('print-compilation'),status=document.getElementById('print-status');
    if(!button)return;
    updatePrintHeader();
    button.onclick=()=>window.print();
    document.fonts.ready.then(()=>{
      button.disabled=false;
      status.textContent='Ready to print';
    });
  }
  if(!window.piGuidePrint){
    window.piGuidePrint=true;
    window.addEventListener('beforeprint',updatePrintHeader);
    document.addEventListener('pi-guide-shown',setup);
  }
  setup();
})();
