/* Fog of Knowledge: The Game — UI. Reads ../data/*.json exactly like the atlas viewer; never writes them. */
(function(){
"use strict";
const E=window.FogGameEngine,G=E.G;
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const KEY_CIV="fog-of-knowledge:game:civ:v1",KEY_EX="fog-of-knowledge:game:explorer:v1",KEY_DAY="fog-of-knowledge:game:daily:v1";
let A=null,civ=null,ex=null,day=null,dayPair=null;

/* ---------- data (same files + same validation as the atlas viewer) ---------- */
async function fetchAtlasJSON(name){const r=await fetch(`../data/${name}.json`);if(!r.ok)throw Error("Atlas data unavailable: "+name);return r.json()}
function validAtlasDisplay(display,nav){
  return display?.protocol==="fog-atlas-display/1"&&display.schema_version===1&&nav?.protocol==="fog-atlas-navigation/1"&&
    /^[0-9a-f]{64}$/.test(display.input_sha256)&&display.input_sha256===nav.input_sha256&&Array.isArray(display.nodes)&&display.nodes.length===nav.counts?.canonical;
}
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
  const ctx=canvas.getContext("2d");let fog=null;
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

/* ---------- civilization ---------- */
function save(){try{localStorage.setItem(KEY_CIV,E.serialize(civ));$("#saveNote").textContent="Saved"}catch(_){$("#saveNote").textContent="Could not save (storage full or blocked)"}}
function loadCiv(){try{const s=JSON.parse(localStorage.getItem(KEY_CIV)||"null");if(s&&s.v===1)return s}catch(_){}return null}
const FX_LABEL={warmth:"warmth",food:"food",hunt:"hunting",build:"building",research:"research",explore:"exploration",health:"health",morale:"morale",capacity:"shelter capacity",growth:"growth",storage:"food storage",defense:"defence",cooked:"food efficiency"};
const fxText=fx=>Object.entries(fx).map(([k,v])=>`+${Math.round(v*100)}% ${FX_LABEL[k]||k}`).join(" · ");
const JOB_LABEL={gather:"Gather",hunt:"Hunt",build:"Build",explore:"Explore",research:"Research"};
let civMap;
function setJob(j,v){
  v=Math.max(0,Math.min(100,Math.round(v)));const others=E.JOBS.filter(x=>x!==j),rest=100-v;
  const sum=others.reduce((a,x)=>a+(civ.jobs[x]||0),0);civ.jobs[j]=v;
  others.forEach(x=>civ.jobs[x]=sum>0?Math.floor((civ.jobs[x]||0)*rest/sum):Math.floor(rest/others.length));
  let diff=100-E.JOBS.reduce((a,x)=>a+civ.jobs[x],0);for(const x of others){if(diff<=0)break;civ.jobs[x]++;diff--}
}
function renderCiv(){
  const s=civ,fx=E.effects(s,A),w=E.workers(s),housed=Math.floor(s.shelter*(1+fx.capacity));
  const era=G.ERAS[s.era];$("#eraName").textContent=era.name;$("#eraSpan").textContent=era.span.toUpperCase();$("#yearLabel").textContent=E.yearLabel(s);
  $("#eraTrack").innerHTML=G.ERAS.map((e,i)=>`<i class="${i<=s.era?"on":""}${i===s.era?" cur":""}" title="${esc(e.name)}"></i>`).join("");
  const stat=(n,v,extra="",bar=null,col="")=>`<div class="stat"><small>${n}</small><b>${v}</b>${extra}${bar!==null?`<div class="bar"><i style="width:${bar}%;background:${col}"></i></div>`:""}</div>`;
  const df=s.lastFood||0;
  $("#stats").innerHTML=stat("POPULATION",s.pop.toLocaleString(),`<em class="muted">peak ${s.stats.peak.toLocaleString()}</em>`)+
    stat("FOOD",Math.floor(s.food).toLocaleString(),`<em class="${df>=0?"up":"down"}">${df>=0?"+":""}${Math.round(df)}</em>`)+
    stat("SHELTER",`${housed.toLocaleString()}`,`<em class="${housed>=s.pop?"up":"down"}">${housed>=s.pop?"housed":"crowded"}</em>`)+
    stat("WARMTH",`${Math.round(Math.min(.95,fx.warmth)*100)}%`,`<em class="muted">winter protection</em>`)+
    stat("HEALTH",Math.round(s.health),"",s.health,"#64e886")+stat("MORALE",Math.round(s.morale),"",s.morale,"#ffc857")+
    stat("INSIGHT / SEASON",(s.lastInsight||0).toFixed(1))+stat("DISCOVERIES",`${s.known.length} / ${G.DISCOVERIES.length}`);
  $("#jobs").innerHTML=E.JOBS.map(j=>`<div class="job"><label for="job-${j}">${JOB_LABEL[j]}${j==="gather"&&s.known.includes("agriculture")?" / Farm":""}</label><input id="job-${j}" type="range" min="0" max="100" value="${s.jobs[j]}" data-job="${j}"><span>${w[j].toLocaleString()}</span></div>`).join("");
  // research
  const av=E.available(s);
  $("#focus").innerHTML=`<option value="auto">Curiosity — cheapest open discovery</option>`+av.map(d=>`<option value="${d.id}"${s.focus===d.id?" selected":""}>${esc(d.name)} (${G.ERAS[d.era].name})</option>`).join("");
  if(s.focus!=="auto"&&!av.some(d=>d.id===s.focus))s.focus="auto";$("#focus").value=s.focus;
  $("#insightRate").textContent=`${(s.lastInsight||0).toFixed(1)} insight / season`;
  const writing=s.known.includes("writing");
  if(writing){const opts=A.families.filter(f=>s.fields.includes(f.id));const cands=E.studyCandidates(s,A,s.studyField==="auto"?null:s.studyField).length;
    $("#studyBox").innerHTML=`<div class="job"><label for="studyShare">Atlas study</label><input id="studyShare" type="range" min="0" max="100" value="${s.study}"><span>${s.study}%</span></div>
      <label class="lbl">Field <select id="studyField"><option value="auto">Auto — balance open fields</option>${opts.map(f=>`<option value="${f.id}"${s.studyField===f.id?" selected":""}>${esc(f.short)}</option>`).join("")}</select></label>
      Each atlas node costs ${E.nodeCost(s).toFixed(1)} insight. ${cands.toLocaleString()} node${cands===1?"":"s"} studiable now${s.era<10?"; later ages and new fields open more (frontier nodes need the Frontier age)":""}.`;
  }else $("#studyBox").innerHTML=`Discover <b>Writing & records</b> to let scholars map the atlas field by field. Until then, every discovery reveals its own atlas nodes.`;
  const sel=s.focus==="auto"?av.slice().sort((a,b)=>E.costOf(a)-E.costOf(b)||(b.gateway-a.gateway)||(a.id<b.id?-1:1))[0]?.id:s.focus;
  $("#available").innerHTML=av.length?av.sort((a,b)=>a.era-b.era||E.costOf(a)-E.costOf(b)).map(d=>{const p=s.progress[d.id]||0,c=E.costOf(d);
    return `<div class="disc${d.gateway?" gate":""}${d.id===sel?" sel":""}" data-disc="${d.id}"><h4>${esc(d.name)}<small>${d.gateway?"⟶ "+esc(G.ERAS[d.era].name)+" · ":""}${Math.floor(p)}/${c}</small></h4>
      <div class="date">${esc(d.date)}</div><p>${esc(d.note)}</p><div class="fx">${fxText(d.fx)}</div>
      ${d.atlas.length?`<div class="chips" style="margin-top:6px">${d.atlas.map(chip).join("")}</div>`:""}<div class="prog"><i style="width:${Math.min(100,p/c*100)}%"></i></div></div>`}).join(""):`<p class="muted">Every hand-authored discovery is known. Put all insight into atlas study to clear the remaining fog.</p>`;
  $("#discCount").textContent=`${s.known.length} / ${G.DISCOVERIES.length}`;
  const k=new Set(s.known);
  $("#known").innerHTML=G.ERAS.map((e,i)=>{const ds=G.DISCOVERIES.filter(d=>d.era===i&&k.has(d.id));if(!ds.length)return "";
    return `<h5>${esc(e.name.toUpperCase())} · ${ds.length}/${G.DISCOVERIES.filter(d=>d.era===i).length}</h5>`+ds.map(d=>`<div class="k" title="${esc(d.note)}">✓ ${esc(d.name)} <small>${esc(d.date)}</small></div>`).join("")}).reverse().join("")||`<p class="muted">Nothing yet. Assign people to Research and Explore.</p>`;
  // knowledge
  const counts=E.fieldRevealCounts(s,A);
  $("#revealCount").textContent=`${s.revealed.length.toLocaleString()} / ${A.total.toLocaleString()} revealed`;
  fieldBars($("#civFields"),counts,new Set(s.fields),s.era);
  $("#recent").innerHTML=(s.recent||[]).slice(-24).reverse().map(chip).join("")||`<span class="muted">Nothing new this season.</span>`;
  $("#log").innerHTML=s.log.slice(-70).reverse().map(l=>`<li class="${l.k}"><small>Y${Math.floor(l.t/4)+1}</small>${esc(l.m)}</li>`).join("");
  civMap.draw();
  $("#endTurn").disabled=$("#endYear").disabled=s.over;
  overlay();
}
function overlay(){
  const o=$("#overlay"),s=civ;
  if(s.over){o.hidden=false;o.innerHTML=`<div class="box"><h2>THE FOG CLOSES IN</h2><p>Your people survived ${Math.floor(s.turn/4)} years and reached the <b>${esc(G.ERAS[s.era].name)}</b>, making ${s.known.length} discoveries and revealing ${s.revealed.length.toLocaleString()} atlas nodes. Peak population ${s.stats.peak.toLocaleString()}.</p><button class="primary" id="ovNew">BEGIN AGAIN</button></div>`;$("#ovNew").onclick=newCiv;return}
  if(s.won&&!s.winSeen){o.hidden=false;o.innerHTML=`<div class="box"><h2>YOU REACHED THE FRONTIER</h2><p>After ${Math.floor(s.turn/4)} years your civilization stands at the edge of what humans know. ${s.revealed.length.toLocaleString()} of ${A.total.toLocaleString()} atlas nodes are revealed. Frontier nodes are now studiable — clear the rest of the fog.</p><button class="primary" id="ovGo">CONTINUE EXPLORING</button></div>`;$("#ovGo").onclick=()=>{s.winSeen=true;save();o.hidden=true};return}
  o.hidden=true;
}
function newCiv(){if(civ&&!civ.over&&civ.turn>0&&!confirm("Start a new game? Your current civilization will be lost."))return;civ=E.newGame();save();renderCiv()}
function bindCiv(){
  $("#jobs").addEventListener("input",e=>{const j=e.target.dataset.job;if(!j)return;setJob(j,+e.target.value);E.JOBS.forEach(x=>{$("#job-"+x).value=civ.jobs[x]});const w=E.workers(civ);E.JOBS.forEach(x=>$("#job-"+x).nextElementSibling.textContent=w[x].toLocaleString())});
  $("#jobs").addEventListener("change",save);
  $("#focus").addEventListener("change",e=>{civ.focus=e.target.value;save();renderCiv()});
  $("#available").addEventListener("click",e=>{const c=e.target.closest("[data-disc]");if(!c)return;civ.focus=civ.focus===c.dataset.disc?"auto":c.dataset.disc;save();renderCiv()});
  $("#studyBox").addEventListener("input",e=>{if(e.target.id==="studyShare"){civ.study=+e.target.value;e.target.nextElementSibling.textContent=civ.study+"%"}});
  $("#studyBox").addEventListener("change",e=>{if(e.target.id==="studyField")civ.studyField=e.target.value;save();renderCiv()});
  $("#endTurn").onclick=()=>{E.endTurn(civ,A);save();renderCiv()};
  $("#endYear").onclick=()=>{for(let i=0;i<4&&!civ.over;i++){const r=civ.recent||[];E.endTurn(civ,A);civ.recent=r.concat(civ.recent).slice(-60)}save();renderCiv()};
  $("#newGame").onclick=newCiv;
}

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
  for(const k of ["civ","explore","daily"])$("#mode-"+k).hidden=k!==m;
  if(m==="explore")renderEx();if(m==="daily")renderDay();if(m==="civ")renderCiv();
  try{history.replaceState(null,"","#"+m)}catch(_){}}

async function boot(){
  try{A=await loadAtlas()}catch(err){$("#loading").textContent="Could not load the atlas data: "+err.message;return}
  layout();
  civ=loadCiv()||E.newGame();
  civMap=makeMap($("#civMap"),$("#mapHover"),()=>civ.revealed);
  ex=loadEx();exMap=makeMap($("#exMap"),$("#exHover"),()=>[...ex.revealed].filter(id=>A.index.has(id)));
  dayPair=E.dailyPair(A,E.dayKey());day=loadDay(dayPair.key);
  bindCiv();bindEx();bindDay();
  document.querySelectorAll(".gTabs button").forEach(b=>b.onclick=()=>setMode(b.dataset.mode));
  $("#loading").hidden=true;$("#app").hidden=false;
  const m=(location.hash||"#civ").slice(1);setMode(["civ","explore","daily"].includes(m)?m:"civ");
  window.__fogGameReady={nodes:A.total,discoveries:G.DISCOVERIES.length};
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot);else boot();
})();
