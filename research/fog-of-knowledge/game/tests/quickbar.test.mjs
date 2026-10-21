import assert from 'node:assert/strict';
import {ESSENTIAL_QUICKBAR,quickbarOrder} from '../quickbar.js';
const order=Array.from({length:14},(_,i)=>'item'+i),inv=Object.fromEntries(order.map(k=>[k,1]));
for(const k of ['log','pyrite','flint']){order.push(k);inv[k]=1}
const result=quickbarOrder(order,inv);assert.deepEqual(result.slice(0,3),["flint","pyrite","log"]);assert.equal(result.length,17);assert.deepEqual(result.slice(3),order.slice(0,14));assert.equal(order[0],'item0');
delete inv.pyrite;assert.deepEqual(quickbarOrder(order,inv).slice(0,2),['flint','log']);
inv.pyrite=2;assert.equal(quickbarOrder([...order,'flint'],inv).filter(k=>k==='flint').length,1);
assert.deepEqual(quickbarOrder([],{}),[]);console.log('Essential quickbar late pickups, stable remaining order, removal, return and deduplication passed');

for(const k of ESSENTIAL_QUICKBAR){order.push(k);inv[k]=1}assert.deepEqual(quickbarOrder(order,inv).slice(0,ESSENTIAL_QUICKBAR.length),ESSENTIAL_QUICKBAR);
