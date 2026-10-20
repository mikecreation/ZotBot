import assert from 'node:assert/strict';
import {ensureFuelBed,recordFuelPiece,stepFuelBed,fuelLayout} from '../fuel-bed.js';
const s={fuel:1.5,lit:true,heat:1};assert.equal(ensureFuelBed(s).length,3);recordFuelPiece(s,5,'log');s.fuel+=5;s.fuel-=.75;stepFuelBed(s,10);assert.equal(s.fuelPieces.at(-1).left,5);assert.ok(s.fuelPieces.at(-1).char>0);assert.ok(s.fuelPieces.at(-1).fire>0);assert.ok(Math.abs(s.fuelPieces.reduce((n,p)=>n+p.left,0)-s.fuel)<1e-8);
const saved=JSON.parse(JSON.stringify(s));assert.deepEqual(ensureFuelBed(saved),s.fuelPieces);const char=saved.fuelPieces.at(-1).char;saved.lit=false;stepFuelBed(saved,120);assert.equal(saved.fuelPieces.at(-1).char,char);
const legacy={fuel:75,fuelPieces:[{id:0,kind:'log',mass:100,left:75,char:.4}]};assert.equal(ensureFuelBed(legacy).length,20);assert.equal(legacy.fuelPieces.reduce((n,p)=>n+p.left,0),75);
const legacySticks={fuel:4,fuelPieces:[{id:0,kind:'split',mass:4,left:4,char:0}]};assert.equal(ensureFuelBed(legacySticks).length,8);
const bounds=[];
for(const count of [20,100,1000]){const f={fuel:0};for(let i=0;i<count;i++){recordFuelPiece(f,5);f.fuel+=5}const p=fuelLayout(f);assert.equal(p.poses.length,count);assert.equal(f.fuelPieces.length,count);assert.equal(new Set(f.fuelPieces.map(p=>p.id)).size,count);assert.equal(f.fuelPieces.reduce((n,p)=>n+p.left,0),count*5);assert.ok(p.poses[12].y>p.poses[0].y+1,'initial courses stack vertically');assert.ok(p.poses[15].spill&&Math.hypot(p.poses[15].x,p.poses[15].z)<1.2,'first overflow contacts core');bounds.push({count,radius:p.radius,height:p.height});assert.equal(fuelLayout(f),p,'layout cached until addition');}
assert.ok(bounds[1].radius>bounds[0].radius*1.5);assert.ok(bounds[2].radius>bounds[1].radius*1.5&&bounds[2].height>bounds[1].height*1.5);
console.log('20 / 100 / 1000 distinct fuel pieces, growing connected mound, stack-first overflow, migration, ignition, mass and persistence passed',JSON.stringify(bounds));

const cleared={fuel:5,fuelPieces:[{id:0,kind:'log',mass:5,left:0,char:1},{id:1,kind:'log',mass:5,left:5,char:0}]};assert.equal(fuelLayout(cleared).poses.length,1);assert.equal(fuelLayout(cleared).poses[0].y,.17,'collected burned wood no longer props up or scatters new logs');
