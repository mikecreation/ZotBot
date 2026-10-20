/* Fog of Knowledge: The Game — rules engine (no DOM). Read-only over the atlas. */
(function(root){
"use strict";
const G=root.FOG_GAME_DATA;
const SEASONS=["Spring","Summer","Autumn","Winter"];
const SF=[1.0,1.3,1.15,0.3], HF=[0.9,1.0,1.1,0.75];
const JOBS=["gather","hunt","build","explore","research"];
const ATLAS_ERA_RANK={origins:0,agrarian:1,classical:2,"early-modern":3,"industrial-modern":4,twentieth:5,frontier:6};
const MAX_RANK=[0,1,1,1,2,2,3,4,5,5,6];
// Era (game) from which a Great Field's undated nodes can be studied.
const FIELD_ERA={roots:2,humanities:2,formal:4,social:4,life:6,health:6,earth:6,physical:7,engineering:7,information:9};
const FIELD_BONUS={roots:"research",formal:"research",physical:"build",earth:"defense",life:"food",health:"health",social:"morale",humanities:"morale",engineering:"build",information:"research"};

function rng(state){ // mulberry32 stored in state.seed
  let t=(state.seed=(state.seed+0x6D2B79F5)>>>0);
  t=Math.imul(t^t>>>15,t|1); t^=t+Math.imul(t^t>>>7,t|61);
  return ((t^t>>>14)>>>0)/4294967296;
}
function clamp(v,a,b){return v<a?a:v>b?b:v}
function roundRand(x,state){const f=Math.floor(x);return f+(rng(state)<x-f?1:0)}

/* ---------- atlas model ---------- */
function buildAtlas(nav,displayNodes,families){
  const byId=new Map();
  for(const n of displayNodes)byId.set(n.id,n);
  for(const n of nav.registry_nodes||[])if(!byId.has(n.id))byId.set(n.id,n);
  const famIds=families.map(f=>f.id);
  const nodes=[],index=new Map(),parent=new Map(),children=new Map();
  for(const l of nav.links){
    if(index.has(l.target))continue;
    const n=byId.get(l.target)||{id:l.target,label:l.target};
    index.set(l.target,nodes.length);
    nodes.push({id:n.id,label:n.label||n.id,summary:n.summary||"",kind:n.kind||"",era:n.era||"undated",frontier:!!n.frontier,domain:n.domain,field:null,depth:0,parent:l.source});
    parent.set(l.target,l.source);
    if(!children.has(l.source))children.set(l.source,[]);
    children.get(l.source).push(l.target);
  }
  for(const n of nodes){
    let p=n.id,d=0,guard=0;
    while(parent.has(p)&&guard++<64){p=parent.get(p);d++;if(p.startsWith("family:"))break}
    n.field=p.startsWith("family:")?p.slice(7):(n.domain||"roots");
    n.depth=d;
  }
  const fieldTotals={};for(const f of famIds)fieldTotals[f]=0;
  for(const n of nodes)fieldTotals[n.field]=(fieldTotals[n.field]||0)+1;
  return {nodes,index,parent,children,families,famById:new Map(families.map(f=>[f.id,f])),fieldTotals,total:nodes.length};
}

/* ---------- civilization ---------- */
const discById=new Map(G.DISCOVERIES.map(d=>[d.id,d]));
function costOf(d){return Math.round(8*Math.pow(1.72,d.era)*(d.gateway?1.6:1))}

function newGame(seed){
  return {v:1,seed:(seed>>>0)||((Date.now()^0x5bd1e995)>>>0),turn:0,era:0,pop:24,food:45,shelter:20,health:70,morale:62,
    jobs:{gather:45,hunt:25,build:12,explore:8,research:10},focus:"auto",study:40,studyField:"auto",
    progress:{},known:[],revealed:[],fields:[],log:[{t:0,k:"era",m:"A small band of 24 humans gathers around the edge of the fog. Survive, and discover."}],
    over:false,won:false,complete:false,stats:{births:0,deaths:0,peak:24,discoveries:0},studyPool:0,lastInsight:0,lastFood:0};
}
function isKnown(s,id){return s._k?s._k.has(id):(s._k=new Set(s.known)).has(id)}
function knownSet(s){if(!s._k||s._k.size!==s.known.length)s._k=new Set(s.known);return s._k}
function revealedSet(s){if(!s._r||s._r.size!==s.revealed.length)s._r=new Set(s.revealed);return s._r}
function available(s){
  const k=knownSet(s);
  return G.DISCOVERIES.filter(d=>!k.has(d.id)&&(d.gateway?d.era<=s.era+1:d.era<=s.era)&&d.req.every(r=>k.has(r)));
}
function effects(s,atlas){
  const fx={warmth:0,food:0,hunt:0,build:0,research:0,explore:0,health:0,morale:0,capacity:0,growth:0,storage:0,defense:0,cooked:0};
  for(const id of s.known){const d=discById.get(id);if(d)for(const k in d.fx)fx[k]+=d.fx[k]}
  if(atlas){
    const per=fieldRevealCounts(s,atlas);
    for(const f in per){const key=FIELD_BONUS[f];if(key)fx[key]+=Math.min(0.6,per[f]*0.0015)}
  }
  return fx;
}
function fieldRevealCounts(s,atlas){
  const out={};for(const f of atlas.families)out[f.id]=0;
  for(const id of s.revealed){const i=atlas.index.get(id);if(i!==undefined)out[atlas.nodes[i].field]++}
  return out;
}
function workers(s){
  const out={};let used=0;
  for(const j of JOBS){out[j]=Math.floor(s.pop*(s.jobs[j]||0)/100);used+=out[j]}
  out.gather+=Math.max(0,s.pop-used);
  return out;
}
function log(s,k,m){s.log.push({t:s.turn,k,m});if(s.log.length>160)s.log.splice(0,s.log.length-160)}

function revealNode(s,atlas,id,why){
  const r=revealedSet(s);let added=0;let p=id;const chain=[];
  while(p&&!p.startsWith("family:")&&atlas.index.has(p)&&!r.has(p)){chain.push(p);p=atlas.parent.get(p)}
  for(const c of chain.reverse()){r.add(c);s.revealed.push(c);added++;if(why){(s.recent||(s.recent=[])).push(c);if(s.recent.length>60)s.recent.shift()}}
  const n=atlas.nodes[atlas.index.get(id)];
  if(n&&!s.fields.includes(n.field))s.fields.push(n.field);
  return added;
}
function discover(s,d,atlas){
  if(isKnown(s,d.id))return;
  s.known.push(d.id);knownSet(s);s.stats.discoveries++;delete s.progress[d.id];
  let added=0;const linked=[];
  for(const a of d.atlas){if(atlas&&atlas.index.has(a)){added+=revealNode(s,atlas,a,true);linked.push(a)}}
  log(s,"disc",`Discovery: ${d.name} (${d.date}).`+(linked.length?` Revealed ${added} atlas node${added===1?"":"s"}.`:""));
  if(d.gateway&&d.era>s.era){s.era=d.era;log(s,"era",`A new age dawns: ${G.ERAS[d.era].name}.`);
    if(d.era===10&&!s.won){s.won=true;log(s,"win","Your people have reached the Frontier of human knowledge. Keep exploring to clear the whole atlas.")}}
}
function studyCandidates(s,atlas,field){
  const r=revealedSet(s),out=[];
  const open=new Set(s.fields);
  for(const n of atlas.nodes){
    if(r.has(n.id))continue;
    if(field&&n.field!==field)continue;
    if(!open.has(n.field))continue;
    if(n.frontier&&s.era<10)continue;
    const rank=ATLAS_ERA_RANK[n.era];
    if(rank!==undefined){if(rank>MAX_RANK[s.era])continue}
    else if(s.era<(FIELD_ERA[n.field]??7))continue;
    if(!n.parent.startsWith("family:")&&!r.has(n.parent))continue;
    out.push(n);
  }
  return out;
}
function nodeCost(s){return 2+s.era*0.9}
function studyAtlas(s,atlas,points){
  if(!atlas||!isKnown(s,"writing"))return 0;
  s.studyPool+=points;const cost=nodeCost(s);let n=0;
  let field=s.studyField==="auto"?null:s.studyField;
  let cands=studyCandidates(s,atlas,field);
  if(!cands.length&&field){field=null;cands=studyCandidates(s,atlas,null)}
  if(!cands.length){s.studyPool=Math.min(s.studyPool,cost*4);return 0}
  // order: shallow first; auto balances the least-revealed fields
  const per=fieldRevealCounts(s,atlas);
  cands.sort((a,b)=>a.depth-b.depth||(field?0:(per[a.field]/atlas.fieldTotals[a.field])-(per[b.field]/atlas.fieldTotals[b.field]))||(a.id<b.id?-1:1));
  const revealedNow=[];
  while(s.studyPool>=cost&&n<cands.length&&n<400){revealNode(s,atlas,cands[n].id,true);revealedNow.push(cands[n].label);s.studyPool-=cost;n++}
  if(n)log(s,"study",`Scholars mapped ${n} atlas node${n>1?"s":""}: ${revealedNow.slice(0,3).join(", ")}${n>3?"…":""}`);
  if(atlas&&s.revealed.length>=atlas.total&&!s.complete){s.complete=true;log(s,"win",`The entire atlas is revealed: ${atlas.total.toLocaleString()} / ${atlas.total.toLocaleString()} nodes.`)}
  return n;
}

const EVENTS=[
  {id:"predator",w:s=>s.era<=1?0.07:0,run(s,fx){const d=Math.min(s.pop,roundRand((1+rng(s)*2.5)*(1-Math.min(.9,fx.defense)),s));kill(s,d);return d?`Predators attacked the camp. ${d} lost.`:"Predators prowled, but the camp held."}},
  {id:"drought",w:s=>0.05,run(s,fx){const l=Math.round(s.food*0.35*(1-Math.min(.7,fx.storage)));s.food-=l;return `Drought withered the land. ${l} food lost.`}},
  {id:"flood",w:s=>s.era>=1?0.04:0.02,run(s,fx){const l=Math.round(s.shelter*0.12*(1-Math.min(.8,fx.defense)));s.shelter-=l;return `Floods swept through. ${l} shelter destroyed.`}},
  {id:"bounty",w:s=>0.06,run(s,fx){const g=Math.round(s.pop*(0.6+rng(s)*0.8));s.food+=g;return `A bountiful season: +${g} food.`}},
  {id:"newcomers",w:s=>s.era<=3?0.04:0,run(s){const g=2+Math.floor(rng(s)*5);s.pop+=g;return `${g} wanderers joined your people.`}},
  {id:"quake",w:s=>s.era>=2?0.025:0,run(s,fx){const l=Math.round(s.shelter*0.15*(1-Math.min(.8,fx.defense)));s.shelter-=l;const d=roundRand(s.pop*0.01*(1-Math.min(.9,fx.defense)),s);kill(s,d);return `An earthquake struck: ${l} shelter lost, ${d} dead.`}},
  {id:"festival",w:s=>0.04,run(s){s.morale=clamp(s.morale+10,0,100);return "A great festival lifted everyone's spirits."}},
  {id:"raid",w:s=>s.era>=2&&s.era<=7?0.035:0,run(s,fx){const d=roundRand(s.pop*0.03*(1-Math.min(.9,fx.defense)),s);const l=Math.round(s.food*0.2);kill(s,d);s.food-=l;return `Raiders attacked: ${d} dead, ${l} food stolen.`}}
];
function kill(s,d){d=Math.max(0,Math.min(s.pop,Math.round(d)));s.pop-=d;s.stats.deaths+=d;s._deaths=(s._deaths||0)+d;return d}

function endTurn(s,atlas){
  if(s.over)return s;
  s._deaths=0;s.recent=[];
  const fx=effects(s,atlas),season=s.turn%4,w=workers(s);
  const m=0.7+0.45*s.morale/100;
  const startPop=s.pop;
  // food
  const prod=w.gather*1.9*SF[season]*(1+fx.food)*m+w.hunt*2.4*HF[season]*(1+fx.hunt)*m+w.explore*0.3*m;
  const cons=s.pop*(1-Math.min(.5,fx.cooked));
  const spoil=Math.max(0,s.food)*0.12*(1-Math.min(.9,fx.storage));
  s.food+=prod-cons-spoil;s.lastFood=prod-cons-spoil;
  let starved=false;
  if(s.food<0){starved=true;const d=kill(s,Math.ceil(-s.food*0.35));s.food=0;s.health-=6;s.morale-=6;if(d)log(s,"bad",`Hunger: ${d} starved.`)}
  // shelter
  s.shelter=s.shelter*0.985+w.build*0.22*(1+fx.build)*m;
  const housed=s.shelter*(1+fx.capacity);
  const crowd=s.pop>0?clamp((s.pop-housed)/s.pop,0,1):0;
  // winter cold
  let harsh=false;
  if(season===3){
    harsh=rng(s)<0.18;
    const cold=(crowd*s.pop*0.18*(1-Math.min(.95,fx.warmth))+s.pop*0.02*(1-Math.min(1,fx.warmth*1.2)))*(harsh?2:1);
    const d=kill(s,roundRand(cold,s));
    if(d)log(s,"bad",`${harsh?"A brutal winter":"Winter cold"} took ${d}.`);else if(harsh)log(s,"ok","A brutal winter passed without loss.");
  }
  // work hazards
  const haz=kill(s,roundRand(w.hunt*0.012*(1-Math.min(.9,fx.defense))+w.explore*0.008*(1-Math.min(.8,fx.explore*0.5)),s));
  if(haz)log(s,"bad",`${haz} hunter${haz>1?"s":""}/explorer${haz>1?"s":""} did not return.`);
  // disease
  const dChance=0.05+0.1*crowd+(s.pop>300?0.03:0)-Math.min(0.04,fx.health*0.02);
  if(s.pop>0&&rng(s)<dChance){
    const sev=(0.03+rng(s)*0.09)*(1-Math.min(.85,fx.health*0.5));
    const d=kill(s,roundRand(s.pop*sev,s));s.health-=6;
    log(s,"bad",`Sickness spread through your people: ${d} died.`);
  }
  // random event
  for(const e of EVENTS){if(s.pop>0&&rng(s)<e.w(s)){log(s,e.id==="bounty"||e.id==="newcomers"||e.id==="festival"?"ok":"bad",e.run(s,fx));break}}
  s.food=Math.max(0,s.food);s.shelter=Math.max(0,s.shelter);
  // health & morale
  s.health=clamp(s.health+3+fx.health*4-crowd*8-(starved?6:0),5,100);
  if(s.health<30&&s.pop>0){const d=kill(s,roundRand(s.pop*0.02,s));if(d)log(s,"bad",`Poor health claimed ${d}.`)}
  const lossFrac=startPop>0?s._deaths/startPop:0;
  const target=55+Math.min(35,fx.morale*40)+(s.food>s.pop?8:-8)-Math.min(25,lossFrac*200);
  s.morale=clamp(s.morale+(target-s.morale)*0.3,0,100);
  // births
  if(s.pop>=2&&s.food>=s.pop*0.3&&s.health>35){
    let rate=0.022*(1+fx.growth)*(s.health/100)*(s.morale/80);
    if(s.pop>housed*1.1)rate*=0.25;
    const b=Math.floor(s.pop*rate+rng(s));s.pop+=b;s.stats.births+=b;
  }
  s.stats.peak=Math.max(s.stats.peak,s.pop);
  // research & exploration → insight
  const insight=w.research*0.5*(1+fx.research)*m+w.explore*0.12*(1+fx.explore)*m+0.5;
  s.lastInsight=insight;
  let toStudy=isKnown(s,"writing")?insight*clamp(s.study,0,100)/100:0;
  let toDisc=insight-toStudy;
  const av=available(s);
  if(!av.length){toStudy+=toDisc;toDisc=0}
  else{
    let target=s.focus!=="auto"?av.find(d=>d.id===s.focus):null;
    if(!target){ // curiosity: cheapest available, gateways preferred on ties
      target=av.slice().sort((a,b)=>costOf(a)-costOf(b)||(b.gateway-a.gateway)||(a.id<b.id?-1:1))[0];
    }
    s.progress[target.id]=(s.progress[target.id]||0)+toDisc;
    // explorers sometimes stumble on insight toward a random open discovery
    if(w.explore>0&&rng(s)<0.25){const r=av[Math.floor(rng(s)*av.length)];const g=w.explore*0.25*(1+fx.explore);s.progress[r.id]=(s.progress[r.id]||0)+g;if(r!==target)log(s,"ok",`Explorers found clues toward ${r.name}.`)}
    for(const d of av){
      const p=s.progress[d.id]||0,c=costOf(d);
      if(p>=c)discover(s,d,atlas);
      else if(p>=0.6*c&&rng(s)<(p/c-0.6)/0.8){log(s,"ok",`Eureka! An early breakthrough.`);discover(s,d,atlas)}
    }
    if(s.focus!=="auto"&&isKnown(s,s.focus))s.focus="auto";
  }
  studyAtlas(s,atlas,toStudy);
  s.turn++;
  if(s.pop<=0){s.pop=0;s.over=true;log(s,"dead","Your people have perished. The fog closes in again.")}
  return s;
}
function yearLabel(s){return `Year ${Math.floor(s.turn/4)+1} · ${SEASONS[s.turn%4]}`}
function serialize(s){const o={...s};delete o._k;delete o._r;delete o._deaths;return JSON.stringify(o)}

/* ---------- graph helpers for explorer / expedition ---------- */
function neighbors(atlas,id){
  if(id==="hub")return atlas.families.map(f=>"family:"+f.id);
  const out=[];
  if(id.startsWith("family:"))out.push("hub");else{const p=atlas.parent.get(id);if(p)out.push(p)}
  for(const c of atlas.children.get(id)||[])out.push(c);
  return out;
}
function bfs(atlas,start,goal){
  const prev=new Map([[start,null]]);const q=[start];
  for(let i=0;i<q.length;i++){const u=q[i];if(u===goal)break;for(const v of neighbors(atlas,u))if(!prev.has(v)){prev.set(v,u);q.push(v)}}
  if(!prev.has(goal))return null;const path=[];for(let u=goal;u!==null;u=prev.get(u))path.push(u);return path.reverse();
}
function dayKey(date){const d=date||new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0")}
function hashStr(str){let h=2166136261>>>0;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)>>>0}return h>>>0}
function dailyPair(atlas,key){
  const st={seed:hashStr("fog-expedition:"+key)};
  const ids=atlas.nodes.map(n=>n.id).sort();
  for(let attempt=0;attempt<200;attempt++){
    const start=ids[Math.floor(rng(st)*ids.length)];
    // BFS distances from start (tree + hub) — choose a target 4–8 hops away
    const dist=new Map([[start,0]]);const q=[start];
    for(let i=0;i<q.length;i++){const u=q[i];const du=dist.get(u);if(du>=8)continue;for(const v of neighbors(atlas,u))if(!dist.has(v)){dist.set(v,du+1);q.push(v)}}
    const pool=[];for(const [v,d] of dist)if(d>=4&&d<=8&&atlas.index.has(v))pool.push(v);
    if(!pool.length)continue;pool.sort();
    // prefer longer trips a little
    const target=pool[Math.floor(rng(st)*pool.length)];
    return {start,target,optimal:dist.get(target),key};
  }
  return null;
}
root.FogGameEngine={G,revealNode,discover,studyAtlas,SEASONS,JOBS,FIELD_ERA,buildAtlas,newGame,endTurn,available,effects,costOf,workers,fieldRevealCounts,yearLabel,serialize,discById,knownSet,revealedSet,neighbors,bfs,dailyPair,dayKey,hashStr,nodeCost,studyCandidates};
})(typeof window!=="undefined"?window:globalThis);
