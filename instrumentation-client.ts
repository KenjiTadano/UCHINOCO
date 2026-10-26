// Diagnostic-only Preview build flag; no URLs, IDs, cookie/storage reads or network reporting.
if(process.env.NEXT_PUBLIC_HEADING_DIAGNOSTICS==="1"){
 try{
  const state:{trace:string;arm:string;kind:string;headingMs:number|null;structureMs:number|null;visibleCompleteMs:number|null;loadMs:number|null;responseStartMs:number|null;responseEndMs:number|null;visible:number;pending:number;broken:number;cards:number;width:number;height:number}={trace:"",arm:"setup",kind:"unknown",headingMs:null,structureMs:null,visibleCompleteMs:null,loadMs:null,responseStartMs:null,responseEndMs:null,visible:0,pending:0,broken:0,cards:0,width:0,height:0};
  let output:HTMLOutputElement|null=null,last="",queued=false,frames=0;
  function check(){
   const marker=document.querySelector<HTMLElement>("[data-heading-trace]");if(!marker)return;
   state.trace=marker.dataset.headingTrace??"";state.arm=marker.dataset.headingArm??"setup";state.kind=marker.dataset.headingKind??"unknown";
   const h=[...document.querySelectorAll("h1")].find(x=>x.textContent?.trim()==="アルバムを編集");
   if(h&&h.getBoundingClientRect().height>0&&state.headingMs===null)state.headingMs=performance.now();
   state.cards=[...document.querySelectorAll("a[aria-label]")].filter(a=>/^\d+ - \d+を編集$/.test(a.getAttribute("aria-label")??"")).length;
   if(state.headingMs!==null&&state.cards===12&&state.structureMs===null)state.structureMs=performance.now();
   const visible=[...document.images].filter(i=>{const r=i.getBoundingClientRect();return i.hasAttribute("src")&&r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth});
   const visibleBody=visible.some(i=>/^\d+ - \d+を編集$/.test(i.closest("a[aria-label]")?.getAttribute("aria-label")??""));
   state.visible=visible.length;state.pending=visible.filter(i=>!i.complete).length;state.broken=visible.filter(i=>i.complete&&i.naturalWidth===0).length;state.width=innerWidth;state.height=innerHeight;
   if(frames>=2&&state.structureMs!==null&&visibleBody&&state.pending===0&&state.broken===0&&state.visibleCompleteMs===null)state.visibleCompleteMs=performance.now();
   const nav=performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming|undefined;
   if(nav){state.responseStartMs=nav.responseStart||null;state.responseEndMs=nav.responseEnd||null;if(nav.loadEventEnd)state.loadMs=nav.loadEventEnd;}
   if(!output){output=document.createElement("output");output.hidden=true;output.setAttribute("data-heading-diagnostic","");document.body.append(output)}
   const json=JSON.stringify(state);if(json!==last){last=json;output.textContent=json;}
  }
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{frames++;requestAnimationFrame(()=>{frames++;queued=false;check();})})}
  const observer=new MutationObserver(schedule);observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:["src","style","class","data-heading-trace"]});
  document.addEventListener("load",schedule,true);document.addEventListener("error",schedule,true);window.addEventListener("load",()=>{state.loadMs=performance.now();setTimeout(schedule,0)},{once:true});window.addEventListener("resize",schedule);schedule();
 }catch{/* Diagnostic failure must never block the application. */}
}
