/* Fog of Knowledge: The Game — UI. Reads ../data/*.json exactly like the atlas viewer; never writes them. */
(function(){
"use strict";
const E=window.FogGameEngine,G=E.G;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const KEY_EX="fog-of-knowledge:game:explorer:v1",KEY_DAY="fog-of-knowledge:game:daily:v1";
let A=null,ex=null,day=null,dayPair=null;
// Start loading the atlas immediately, in the background; the open world never waits for it.
const atlasPromise=window.__fogAtlasPromise=(async()=>{const a=await loadAtlasLater();return a})();

/* ---------- data (same files + same validation as the atlas viewer) ---------- */
// Nemesis serves SHA-pinned builds (/fog-of-knowledge/<sha>/...) by proxying raw.githubusercontent.com
// with a 10 MB per-file safety limit, so the large atlas files (atlas-display ~13.5 MB, knowledge ~49 MB)
// come back 502 there. When the relative fetch fails on such a URL, read the same commit's file straight
// from GitHub (public repo, CORS-enabled) so the HUD still links discoveries to atlas nodes.
const ATLAS_REPO="https://raw.githubusercontent.com/mikecreation/ZotBot";
function pinnedAtlasURL(name){const m=location.pathname.match(/\/fog-of-knowledge\/([0-9a-f]{40})\//);return m?`${ATLAS_REPO}/${m[1]}/research/fog-of-knowledge/data/${name}.json`:null}
async function fetchAtlasJSON(name){let r=null;try{r=await fetch(`../data/${name}.json`)}catch(_){}
  if(!r||!r.ok){const alt=pinnedAtlasURL(name);if(alt){try{r=await fetch(alt,{mode:"cors"})}catch(_){}}}
  if(!r||!r.ok)throw Error("Atlas data unavailable: "+name);return r.json()}
function validAtlasDisplay(display,nav){
  return display?.protocol==="fog-atlas-display/1"&&display.schema_version===1&&nav?.protocol==="fog-atlas-navigation/1"&&
    /^[0-9a-f]{64}$/.test(display.input_sha256)&&display.input_sha256===nav.input_sha256&&Array.isArray(display.nodes)&&display.nodes.length===nav.counts?.canonical;
}
async function loadAtlasLater(){await new Promise(r=>setTimeout(r,0));return loadAtlas()}
async function loadAtlas(){
  const navP=fetchAtlasJSON("atlas-navigation");
  const [display,nav,families]=await Promise.all([fetchAtlasJSON("atlas-display").catch(()=>null),navP,fetchAtlasJSON("atlas-families")]);
  const model=validAtlasDisplay(display,nav)?display:await fetchAtlasJSON("knowledge");
  return E.buildAtlas(nav,model.nodes||[],families);
}
const fam=f=>A.famById.get(f)||{color:"#67dcff",short:f,title:f};
const nodeOf=id=>{const i=A.index.get(id);return i===undefined?null:A.nodes[i]};
function label(id){if(id==="hub")return "HUMAN KNOWLEDGE";if(id.startsWith("family:"))return fam(id.slice(7)).title;return nodeOf(id)?.label||id}
function colorOf(id){if(id==="hub")return "#ffffff";if(id.startsWith("family:"))return fam(id.slice(7)).color;const n=nodeOf(id);return n?fam(n.field).color:"#67dcff"}
function chip(id){const n=nodeOf(id);if(!n)return "";const f=fam(n.field);
  return `<span class="chip${n.frontier?" frontier":""}" title="${esc(n.label)} — ${esc(f.short)}${n.frontier?" · frontier":""}\n${esc(n.summary)}"><i style="background:${f.color}"></i>${esc(n.label)}</span>`}

/* ---------- mini-map (lightweight canvas; nothing is rendered as SVG) ---------- */
function layout(){
  const order=A.families.map(f=>f.id),sector=Math.PI*2/order.length;
  for(const n of A.nodes){
    const k=Math.max(0,order.indexOf(n.field)),h1=E.hashStr(n.id)/4294967296,h2=E.hashStr(n.id+"#")/4294967296;
    const a=-Math.PI/2+k*sector+(0.06+0.88*h1)*sector,r=Math.min(0.97,0.2+Math.min(n.depth-1,5)*0.13+h2*0.14);
    n.mx=Math.cos(a)*r;n.my=Math.sin(a)*r;
  }
}
function makeMap(canvas,hoverEl,getRevealed){
  const ctx=canvas.getContext("2d");let fog=null;const civ=null;
  function size(){const w=canvas.width,h=canvas.height;return {w,h,R:Math.min(w,h)/2-8,cx:w/2,cy:h/2}}
  function drawFog(){const {w,h,R,cx,cy}=size();fog=document.createElement("canvas");fog.width=w;fog.height=h;const c=fog.getContext("2d");
    c.fillStyle="#1a2638";for(const n of A.nodes)c.fillRect(cx+n.mx*R-0.6,cy+n.my*R-0.6,1.2,1.2);
    const sector=Math.PI*2/A.families.length;c.strokeStyle="#0f1d2c";c.lineWidth=1;
    A.families.forEach((f,k)=>{const a=-Math.PI/2+k*sector;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+Math.cos(a)*R,cy+Math.sin(a)*R);c.stroke()})}
  function draw(){
    if(!fog)drawFog();const {w,h,R,cx,cy}=size(),rev=getRevealed(),recent=new Set(civ&&canvas.id==="civMap"?civ.recent||[]:[]);
    ctx.clearRect(0,0,w,h);ctx.drawImage(fog,0,0);
    const sector=Math.PI*2/A.families.length;
    A.families.forEach((f,k)=>{const a=-Math.PI/2+(k+.5)*sector;ctx.fillStyle=f.color+"aa";ctx.font="600 10px system-ui";ctx.textAlign="center";ctx.fillText(f.icon||"",cx+Math.cos(a)*(R*0.1+4),cy+Math.sin(a)*(R*0.1+4)+3)});
    for(const id of rev){const n=nodeOf(id);if(!n)continue;ctx.fillStyle=fam(n.field).color;const s=recent.has(id)?3.4:1.9;ctx.fillRect(cx+n.mx*R-s/2,cy+n.my*R-s/2,s,s)}
    ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(cx,cy,4,0,7);ctx.fill();
  }
  canvas.addEventListener("mousemove",ev=>{
    const b=canvas.getBoundingClientRect(),{R,cx,cy}=size(),x=(ev.clientX-b.left)*canvas.width/b.width,y=(ev.clientY-b.top)*canvas.height/b.height;
    let best=null,bd=64;for(const id of getRevealed()){const n=nodeOf(id);if(!n)continue;const dx=cx+n.mx*R-x,dy=cy+n.my*R-y,d=dx*dx+dy*dy;if(d<bd){bd=d;best=n}}
    hoverEl.innerHTML=best?`<b style="color:${fam(best.field).color}">${esc(best.label)}</b> · ${esc(fam(best.field).short)}${best.frontier?" · <span style=color:#ffc857>frontier</span>":""}<br>${esc((best.summary||"").slice(0,160))}`:(Math.hypot(x-cx,y-cy)<R?"Fog. Keep discovering.":"");
  });
  return {draw};
}
function fieldBars(el,counts,openSet,eraIdx){
  el.innerHTML=A.families.map(f=>{const n=counts[f.id]||0,t=A.fieldTotals[f.id]||1,p=n/t*100,locked=openSet&&!openSet.has(f.id);
    return `<div class="fb${locked?" locked":""}" title="${esc(f.title)}${locked?" — not yet discovered":""}"><span style="color:${f.color}">${f.icon||""} ${esc(f.short)}</span><span class="t"><i style="width:${p.toFixed(2)}%;background:${f.color}"></i></span><span>${p<10&&p>0?p.toFixed(1):Math.round(p)}%</span></div>`}).join("");
}
function countsFor(ids){const out={};for(const f of A.families)out[f.id]=0;for(const id of ids){const n=nodeOf(id);if(n)out[n.field]++}return out}

/* ---------- fog explorer ---------- */
let exMap;
function saveEx(){try{localStorage.setItem(KEY_EX,JSON.stringify({v:1,revealed:[...ex.revealed],explored:[...ex.explored]}))}catch(_){}}
function loadEx(){try{const s=JSON.parse(localStorage.getItem(KEY_EX)||"null");if(s&&s.v===1)return {revealed:new Set(s.revealed),explored:new Set(s.explored)}}catch(_){}return {revealed:new Set(["hub"]),explored:new Set()}}
function exploreNode(id){ex.explored.add(id);ex.revealed.add(id);for(const v of E.neighbors(A,id))ex.revealed.add(v);saveEx();renderEx()}
function ncard(id,extra=""){const n=nodeOf(id),c=colorOf(id),kids=(id==="hub"?A.families.length:(A.children.get(id)||[]).length);
  const sub=id==="hub"?"the hub of the atlas":id.startsWith("family:")?"great field":esc(fam(n.field).short)+(n.kind?" · "+esc(n.kind):"");
  return `<div class="ncard${n&&n.frontier?" frontier":""}${extra}" style="--c:${c}" data-id="${esc(id)}" title="${esc(n?.summary||"")}"><b>${esc(label(id))}</b><small>${sub}${kids?` · ${kids} connection${kids>1?"s":""} below`:""}</small></div>`}
function renderEx(){
  const ids=[...ex.revealed].filter(id=>A.index.has(id));
  $("#exCount").textContent=ids.length.toLocaleString();$("#exTotal").textContent=A.total.toLocaleString();
  fieldBars($("#exFields"),countsFor(ids),null);
  const q=$("#exFilter").value.trim().toLowerCase();
  const edge=[...ex.revealed].filter(id=>!ex.explored.has(id)&&(!q||label(id).toLowerCase().includes(q)));
  edge.sort((a,b)=>(a==="hub"?-1:b==="hub"?1:0)||(a.startsWith("family:")?-1:0)-(b.startsWith("family:")?-1:0)||(A.children.get(b)||[]).length-(A.children.get(a)||[]).length);
  $("#exEdgeCount").textContent=`${edge.length.toLocaleString()} unexplored`;
  $("#exEdge").innerHTML=edge.slice(0,240).map(id=>ncard(id)).join("")+(edge.length>240?`<p class="muted">…and ${edge.length-240} more. Use the filter.</p>`:"")||`<p class="muted">The whole map is explored!</p>`;
  exMap.draw();
}
function bindEx(){
  $("#exEdge").addEventListener("click",e=>{const c=e.target.closest("[data-id]");if(c)exploreNode(c.dataset.id)});
  $("#exFilter").addEventListener("input",renderEx);
  $("#exReset").onclick=()=>{if(!confirm("Reset the Fog Explorer?"))return;ex={revealed:new Set(["hub"]),explored:new Set()};saveEx();renderEx()};
}

/* ---------- daily expedition ---------- */
function saveDay(){try{localStorage.setItem(KEY_DAY,JSON.stringify(day))}catch(_){}}
function loadDay(key){try{const s=JSON.parse(localStorage.getItem(KEY_DAY)||"null");if(s&&s.key===key)return s}catch(_){}return {key,path:[dayPair.start],done:false}}
function frontierVisited(){return [...new Set(day.path.filter(id=>nodeOf(id)?.frontier))]}
function score(){const hops=day.path.length-1;return Math.max(10,100-12*(hops-dayPair.optimal))+15*frontierVisited().length}
function shareText(){const hops=day.path.length-1,f=frontierVisited().length;
  const trail=day.path.slice(1).map(id=>id===dayPair.target?"🟩":nodeOf(id)?.frontier?"🟨":"🟦").join("");
  return `Fog of Knowledge — Daily Expedition ${day.key}\n${label(dayPair.start)} → ${label(dayPair.target)}\nHops ${hops} (optimal ${dayPair.optimal}) · frontier ${f} · score ${score()}\n${trail}`}
function renderDay(){
  const here=day.path[day.path.length-1];
  $("#dyDate").textContent=day.key;$("#dyStart").innerHTML=ncard(dayPair.start);$("#dyTarget").innerHTML=ncard(dayPair.target," target");
  $("#dyHops").textContent=day.path.length-1;$("#dyOpt").textContent=day.done?dayPair.optimal:"?";$("#dyFront").textContent=frontierVisited().length;
  const n=nodeOf(here);
  $("#dyHere").innerHTML=`<b style="color:${colorOf(here)}">${esc(label(here))}</b>${n?`<p>${esc(fam(n.field).short)} · ${esc(n.kind)}${n.frontier?" · <span style=color:#ffc857>frontier</span>":""}</p><p>${esc((n.summary||"").slice(0,240))}</p>`:""}`;
  const q=$("#dyFilter").value.trim().toLowerCase();
  const nb=day.done?[]:E.neighbors(A,here).filter(id=>!q||label(id).toLowerCase().includes(q));
  nb.sort((a,b)=>(a===dayPair.target?-1:b===dayPair.target?1:0));
  $("#dyNext").innerHTML=day.done?`<p class="muted">Expedition complete. Come back tomorrow for a new route.</p>`:nb.slice(0,300).map(id=>ncard(id,id===dayPair.target?" target":"")).join("")+(nb.length>300?`<p class="muted">…${nb.length-300} more — filter to find them.</p>`:"");
  $("#dyTrail").innerHTML=day.path.map(id=>`<li style="color:${colorOf(id)}">${esc(label(id))}${nodeOf(id)?.frontier?" ★":""}</li>`).join("");
  $("#dyResult").innerHTML=day.done?`<h3 style="margin-top:12px">ARRIVED · SCORE ${score()}</h3><div class="share" id="shareTxt">${esc(shareText())}</div><div class="row"><button id="copyShare">Copy result</button></div>`:"";
  if(day.done)$("#copyShare").onclick=()=>{navigator.clipboard?.writeText(shareText()).then(()=>$("#copyShare").textContent="Copied!",()=>{})};
}
function bindDay(){
  $("#dyNext").addEventListener("click",e=>{const c=e.target.closest("[data-id]");if(!c||day.done)return;day.path.push(c.dataset.id);if(c.dataset.id===dayPair.target)day.done=true;$("#dyFilter").value="";saveDay();renderDay()});
  $("#dyFilter").addEventListener("input",renderDay);
  $("#dyBack").onclick=()=>{if(day.done||day.path.length<2)return;day.path.pop();saveDay();renderDay()};
  $("#dyRestart").onclick=()=>{day={key:day.key,path:[dayPair.start],done:false};saveDay();renderDay()};
}

/* ---------- modes ---------- */
function setMode(m){document.querySelectorAll(".gTabs button").forEach(b=>b.setAttribute("aria-selected",String(b.dataset.mode===m)));
  for(const k of ["world","explore","daily"])$("#mode-"+k).hidden=k!==m;
  if(m!=="world")try{document.exitPointerLock?.()}catch(_){}
  if(A){if(m==="explore")renderEx();if(m==="daily")renderDay()}
  try{history.replaceState(null,"","#"+m)}catch(_){}}
function boot(){
  document.querySelectorAll(".gTabs button").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  const m=(location.hash||"#world").slice(1);setMode(["world","explore","daily"].includes(m)?m:"world");
  atlasPromise.then(a=>{A=a;layout();
    ex=loadEx();exMap=makeMap($("#exMap"),$("#exHover"),()=>[...ex.revealed].filter(id=>A.index.has(id)));
    dayPair=E.dailyPair(A,E.dayKey());day=loadDay(dayPair.key);
    bindEx();bindDay();document.querySelectorAll(".atlasWait").forEach(e=>e.hidden=true);document.querySelectorAll(".atlasNeed").forEach(e=>e.hidden=false);
    const cur=(location.hash||"#world").slice(1);if(cur==="explore")renderEx();if(cur==="daily")renderDay();
    window.__fogGameReady={nodes:A.total,discoveries:G.DISCOVERIES.length};
  }).catch(err=>{document.querySelectorAll(".atlasWait").forEach(e=>e.textContent="Could not load the atlas data: "+err.message)});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
