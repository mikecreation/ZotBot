// Procedural stone tools: real-world size, flags the hand/ground code relies on, shared GPU resources, triangle budget.
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.min.js';
import {buildTool,toolTriangles,TOOL_KINDS} from '../stone-tools.js';
const size=k=>new T.Box3().setFromObject(buildTool(k)).getSize(new T.Vector3());
for(const k of TOOL_KINDS){const g=buildTool(k);
  assert.ok(g&&g.isGroup&&g.children.length>=2,k+' builds a group of parts');
  assert.equal(g.userData.trueScale,true,k+' trueScale');assert.equal(g.userData.lieFlat,true,k+' lieFlat');
  assert.ok(g.userData.grip>=0&&g.userData.grip<new T.Box3().setFromObject(g).max.y*.6,k+' grip point on the handle (lower part)');
  const g2=buildTool(k);g.children.forEach((m,i)=>{assert.equal(m.geometry,g2.children[i].geometry,k+' shares geometry');assert.equal(m.material,g2.children[i].material,k+' shares material')});
  const tri=toolTriangles(k);assert.ok(tri>50&&tri<25000,`${k} triangle budget (${tri})`);
  for(const m of g.children){assert.ok(m.material.isMeshStandardMaterial,k+' PBR material');const p=m.geometry.attributes.position.array;for(let i=0;i<p.length;i++)assert.ok(Number.isFinite(p[i]),k+' finite vertices')}}
const axe=size('axe_stone'),knife=size('knife_stone');
assert.ok(axe.y>=.4&&axe.y<=.6,'stone axe 40-60 cm, got '+axe.y.toFixed(3));
assert.ok(knife.y>=.15&&knife.y<=.20,'stone knife 15-20 cm, got '+knife.y.toFixed(3));
assert.ok(axe.z<.06&&knife.z<.04,'thin along Z (edge/handle frame)');
assert.equal(buildTool('not_a_tool'),null);
console.log('stone-tools: ok',TOOL_KINDS.map(k=>k+'='+toolTriangles(k)).join(' '));
