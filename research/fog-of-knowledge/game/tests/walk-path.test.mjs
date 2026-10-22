import assert from 'node:assert/strict';
import {walkPath} from '../walk-path.js';
const a={x:0,z:0},b={x:18,z:0},land=()=>2,flat=()=>0;
const direct=walkPath(a,b,land,flat);assert.ok(direct.length>0);assert.ok(Math.hypot(direct.at(-1).x-b.x,direct.at(-1).z-b.z)<1.35);
const rock={x:9,z:0,r:2};const around=walkPath(a,b,land,flat,[rock]);assert.ok(around.some(p=>Math.abs(p.z)>2));assert.ok(around.every(p=>Math.hypot(p.x-rock.x,p.z-rock.z)>=2.4));
const water=(x,z)=>x>7&&x<12&&Math.abs(z)<3?-1:2;const bridge=walkPath(a,b,water,flat);assert.ok(bridge.every(p=>water(p.x,p.z)>0));assert.ok(bridge.some(p=>Math.abs(p.z)>=3));
assert.equal(walkPath(a,b,()=>-1,flat),null);assert.equal(walkPath(a,{x:500,z:0},land,flat),null);
assert.equal(walkPath(a,b,land,()=>2),null);
console.log('Automatic pickup routes reach items, avoid rocks, route around water, and reject unsafe/unbounded requests.');
