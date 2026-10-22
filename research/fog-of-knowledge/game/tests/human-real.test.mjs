// Realistic player character: the asset must stay drop-in compatible with the classic UAL rig.
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const dir=fileURLToPath(new URL('../',import.meta.url));
const real=JSON.parse(readFileSync(dir+'assets/human-real.gltf.json','utf8')),classic=JSON.parse(readFileSync(dir+'assets/human.gltf.json','utf8'));
const joints=g=>g.skins[0].joints.map(i=>g.nodes[i]);
const byName=g=>Object.fromEntries(g.nodes.map(n=>[n.name,n]));
// 1. same skeleton: names, hierarchy and rest rotations (so the shared clips drive it identically)
const rj=joints(real),cj=joints(classic),cn=byName(classic),rn=byName(real);
assert.equal(rj.length,53);assert.deepEqual(rj.map(n=>n.name).sort(),cj.map(n=>n.name).sort());
for(const n of rj){const c=cn[n.name],a=n.rotation||[0,0,0,1],b=c.rotation||[0,0,0,1];
  assert.ok(Math.abs(a.reduce((s,x,i)=>s+x*b[i],0))>0.99999,`rest rotation of ${n.name}`);
  assert.deepEqual((n.children||[]).map(i=>real.nodes[i].name).filter(x=>x.startsWith('DEF')).sort(),(c.children||[]).map(i=>classic.nodes[i].name).filter(x=>x.startsWith('DEF')).sort(),`children of ${n.name}`)}
for(const h of ['DEF-hand.R','DEF-hand.L'])assert.ok(rn[h],h);
// 2. every clip the game plays is present
const clips=new Set(real.animations.map(a=>a.name));
for(const c of classic.animations)assert.ok(clips.has(c.name),'clip '+c.name);
for(const c of ['Idle_Loop','Walk_Loop','Jog_Fwd_Loop','Sprint_Loop','PickUp_Table','Punch_Cross','Interact','Spell_Simple_Shoot','Swim_Fwd_Loop','Death01'])assert.ok(clips.has(c));
// 3. dressed parts, textures present, and kept small (<= 2048 px, < 10 MB per file for the atlas proxy)
const {REAL_HUMAN_PARTS,wantClassicHuman}=await import('../human-real.js');
const meshNames=new Set(real.nodes.filter(n=>n.mesh!=null).map(n=>n.name));
for(const k of ['Body','Eyes','Eyebrows','Eyelashes','Hair','Tunic','Skirt','Fur','Wraps'])assert.ok(meshNames.has(k),'mesh '+k);
for(const k of meshNames)assert.ok(REAL_HUMAN_PARTS[k],'material for '+k);
for(const p of Object.values(REAL_HUMAN_PARTS))for(const f of [p.map,p.normal].filter(Boolean)){const b=readFileSync(dir+'assets/human-real/'+f);assert.ok(b.length<3e6,f)}
assert.ok(readFileSync(dir+'assets/human-real.gltf.json').length<1e7);
assert.ok(existsSync(dir+'assets/human-real/LICENSE.txt'));
const tris=real.meshes.reduce((s,m)=>s+m.primitives.reduce((t,p)=>t+real.accessors[p.indices].count/3,0),0);assert.ok(tris<60000,'triangle budget '+tris);
// 4. fallback switch
assert.equal(wantClassicHuman('?char=classic'),true);assert.equal(wantClassicHuman('?x=1&char=classic&y=2'),true);
assert.equal(wantClassicHuman(''),false);assert.equal(wantClassicHuman('?char=classical'),false);
console.log('human-real: ok',{tris,clips:clips.size});
