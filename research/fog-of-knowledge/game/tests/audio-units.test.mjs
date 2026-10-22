import assert from 'node:assert/strict';
import {fahrenheit,temperature,temperatureDelta} from '../units.js';
assert.equal(fahrenheit(0),32);assert.equal(fahrenheit(100),212);assert.equal(fahrenheit(-40),-40);
assert.equal(temperature(37),'37.0 °C / 98.6 °F');assert.equal(temperatureDelta(10),'10.0 °C / 18.0 °F');
// Inspect scheduling through a WebAudio contract double. This verifies variation,
// context and bounded event generation, not subjective sound realism.
const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){},setTargetAtTime(v){this.value=v}});
const sources=[],nodes=[];
function node(){const n={gain:param(),frequency:param(),playbackRate:param(),pan:param(),Q:param(),threshold:param(),ratio:param(),connect(){},disconnect(){},start(...args){this.started=args},stop(...args){this.stopped=args}};nodes.push(n);return n}
class Context{constructor(){this.currentTime=0;this.sampleRate=8000;this.state='running';this.destination=node();Context.last=this}createGain(){return node()}createDynamicsCompressor(){return node()}createBiquadFilter(){return node()}createOscillator(){return node()}createStereoPanner(){return node()}createBufferSource(){const n=node();sources.push(n);return n}createBuffer(c,n,rate){return {duration:n/rate,getChannelData:()=>new Float32Array(n)}}}
globalThis.window={AudioContext:Context};globalThis.localStorage={getItem:()=>null,setItem(){}};
const A=await import('../audio.js');assert(A.init());
const beds=sources.filter(s=>s.loop);assert.equal(beds.length,4);assert(new Set(beds.map(s=>s.buffer.duration)).size===4);assert(beds.every(s=>s.buffer.duration>=19&&s.started[1]>0));
for(let i=0;i<500;i++){Context.last.currentTime=i*.1;A.ambience({wind:.5,waves:.3,rain:i>250?.8:0,fire:.3,night:false,biome:'forest'})}
assert(A.stats.natureEvents>0&&A.stats.ambienceChanges>2);assert(sources.length<600,'event count remains bounded');
const before=A.stats.oneShots;for(let i=0;i<100;i++){Context.last.currentTime+=.1;A.ambience({wind:.8,waves:.4,rain:1,fire:1,paused:true})}assert.equal(A.stats.oneShots,before,'paused world schedules no new nature events');
const start=sources.length;A.thunder(500);const first=sources.slice(start).map(s=>[s.playbackRate.value,s.started[0],s.started[1]]);const next=sources.length;A.thunder(500);const second=sources.slice(next).map(s=>[s.playbackRate.value,s.started[0],s.started[1]]);assert.notDeepEqual(first,second,'thunder varies');
assert.equal(A.stats.errors,0);console.log('Temperature conversions, four independent evolving ambience beds, contextual events, pause and thunder scheduling passed');

const silence=A.stats.oneShots;A.chime();A.warn();A.tick();assert.equal(A.stats.oneShots,silence);
assert.equal(A.milestone('stamina','50'),false);assert.equal(A.milestone('xp','25'),false);assert.equal(A.milestone('percentage','100'),false);assert.equal(A.stats.oneShots,silence);
assert.equal(A.milestone('discovery','combustion'),true);const reward=A.stats.oneShots;assert(reward>silence);assert.equal(A.milestone('discovery','combustion'),false);assert.equal(A.stats.oneShots,reward);
assert.equal(A.milestone('level_up','woodworking:2'),true);const level=A.stats.oneShots;assert.equal(A.milestone('level_up','woodworking:2'),false);assert.equal(A.stats.oneShots,level);
console.log('Milestone gate passed: routine progress/warnings silent; each discovery or level-up sounds once');
