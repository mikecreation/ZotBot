// Raft staged build + paddle (pure data + logic, node-testable).
export const RAFT_ITEMS={
  paddle:{name:"Wooden paddle",mass:1.2,density:600,r:.08,color:0x8a6a3e},
};
export const RAFT_RECIPES=[
  {out:"paddle",req:"raft",in:{stick:2,log:1,fiber:2}},
];
export const RAFT_STEPS={
  paddle:["Split a short log for the blade","Haft two sticks as the shaft","Lash blade to shaft with plant fiber"],
  raft:["Lay two logs on the water as a starting platform","Deliver more logs, fiber and sticks at the site to finish the raft"],
};
export const RAFT_STAGES=[
  {id:"logs",name:"Wider log platform",need:{log:2},note:"Float two more logs alongside and keep them lined up."},
  {id:"lash",name:"Cross-lashings",need:{fiber:4},note:"Bind the logs tight with plant-fiber lashings so they cannot drift apart."},
  {id:"thwarts",name:"Thwarts & deck",need:{stick:4,fiber:2},note:"Peg cross-sticks as thwarts and a rough deck. When this is done the raft can be boarded."},
];
export const raftStageOf=site=>site.stage||0;
export function raftRemaining(site){const st=RAFT_STAGES[raftStageOf(site)];if(!st)return {};const got=site.got||{},r={};for(const k in st.need){const left=st.need[k]-(got[k]||0);if(left>0)r[k]=left}return r}
export function raftStageFrac(site){const st=RAFT_STAGES[raftStageOf(site)];if(!st)return 1;let tot=0,got=0;for(const k in st.need){tot+=st.need[k];got+=Math.min(st.need[k],(site.got||{})[k]||0)}return tot?got/tot:1}
export function deliverRaft(site,inv,take){const delivered={};const st=RAFT_STAGES[raftStageOf(site)];if(!st)return {delivered,completed:null,done:true};
  site.got=site.got||{};const r=raftRemaining(site);
  for(const k in r){const n=Math.min(r[k],inv(k));if(n>0&&take(k,n)!==false){site.got[k]=(site.got[k]||0)+n;delivered[k]=n}}
  let completed=null;if(!Object.keys(raftRemaining(site)).length){completed=st.id;site.stage=raftStageOf(site)+1;site.got={}}
  return {delivered,completed,done:site.stage>=RAFT_STAGES.length}}
